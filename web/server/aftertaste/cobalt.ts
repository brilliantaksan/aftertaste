import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { Readable } from "node:stream";
import { pipeline } from "node:stream/promises";
import type {
  CaptureAcquisitionAttemptRecord,
  CaptureAsset,
  CaptureAssetOrigin,
} from "../../shared/contracts.js";

interface CobaltConfig {
  apiUrl: string;
  apiKey: string | null;
  bearerToken: string | null;
  timeoutMs: number;
}

interface CobaltRequestPayload {
  url: string;
  alwaysProxy: boolean;
  downloadMode: "auto";
  filenameStyle: "pretty";
  localProcessing: "disabled";
  youtubeVideoCodec: "h264";
  youtubeVideoContainer: "mp4";
}

interface CobaltFileResponse {
  status: "tunnel" | "redirect";
  url?: string;
  filename?: string;
}

interface CobaltPickerItem {
  type?: "photo" | "video" | "gif";
  url?: string;
  thumb?: string;
}

interface CobaltPickerResponse {
  status: "picker";
  audio?: string;
  audioFilename?: string;
  picker?: CobaltPickerItem[];
}

interface CobaltLocalProcessingResponse {
  status: "local-processing";
  type?: string;
  service?: string;
  tunnel?: string[];
  output?: {
    type?: string;
    filename?: string;
    subtitles?: boolean;
  };
}

interface CobaltErrorResponse {
  status: "error";
  error?: {
    code?: string;
    context?: {
      service?: string;
      limit?: number;
    };
  };
}

type CobaltResponse =
  | CobaltFileResponse
  | CobaltPickerResponse
  | CobaltLocalProcessingResponse
  | CobaltErrorResponse
  | Record<string, unknown>;

export interface CobaltAcquisitionResult {
  assets: CaptureAsset[];
  attempt: CaptureAcquisitionAttemptRecord;
}

export async function acquireSourceMediaViaCobalt(input: {
  assetDir: string;
  sourceUrl: string;
  acquiredAt: string;
}): Promise<CobaltAcquisitionResult | null> {
  const config = readCobaltConfig();
  if (!config || !isEligibleSourceUrl(input.sourceUrl)) return null;

  try {
    const response = await fetch(config.apiUrl, {
      method: "POST",
      headers: buildCobaltHeaders(config, true),
      body: JSON.stringify(buildRequestPayload(input.sourceUrl)),
      signal: AbortSignal.timeout(config.timeoutMs),
    });

    if (!response.ok) {
      return {
        assets: [],
        attempt: buildAttempt({
          status: response.status >= 500 ? "error" : "unavailable",
          acquiredAt: null,
          sourceUrl: input.sourceUrl,
          notes: [`cobalt media acquisition returned HTTP ${response.status}.`],
          error: `cobalt request failed with status ${response.status}`,
        }),
      };
    }

    const payload = (await response.json()) as CobaltResponse;
    return await materializeCobaltResponse(config, input, payload);
  } catch (error) {
    return {
      assets: [],
      attempt: buildAttempt({
        status: "error",
        acquiredAt: null,
        sourceUrl: input.sourceUrl,
        notes: ["cobalt media acquisition failed before any bytes were saved."],
        error: error instanceof Error ? error.message : String(error),
      }),
    };
  }
}

function readCobaltConfig(): CobaltConfig | null {
  const apiUrl = (process.env.AFTERTASTE_COBALT_API_URL ?? "").trim().replace(/\/+$/, "");
  if (!apiUrl) return null;
  const apiKey = (process.env.AFTERTASTE_COBALT_API_KEY ?? "").trim() || null;
  const bearerToken = (process.env.AFTERTASTE_COBALT_BEARER_TOKEN ?? "").trim() || null;
  const timeoutMs = Number.parseInt(process.env.AFTERTASTE_COBALT_TIMEOUT_MS ?? "30000", 10);
  return {
    apiUrl,
    apiKey,
    bearerToken,
    timeoutMs: Number.isFinite(timeoutMs) && timeoutMs > 0 ? timeoutMs : 30000,
  };
}

function isEligibleSourceUrl(sourceUrl: string): boolean {
  try {
    const parsed = new URL(sourceUrl);
    if (!/^https?:$/i.test(parsed.protocol)) return false;
    const host = parsed.hostname.replace(/^www\./, "").toLowerCase();
    return host !== "capture.aftertaste.local";
  } catch {
    return false;
  }
}

function buildRequestPayload(sourceUrl: string): CobaltRequestPayload {
  return {
    url: sourceUrl,
    alwaysProxy: true,
    downloadMode: "auto",
    filenameStyle: "pretty",
    localProcessing: "disabled",
    youtubeVideoCodec: "h264",
    youtubeVideoContainer: "mp4",
  };
}

function buildCobaltHeaders(config: CobaltConfig, includeJsonHeaders: boolean): HeadersInit {
  const headers: HeadersInit = {};
  if (includeJsonHeaders) {
    headers.Accept = "application/json";
    headers["Content-Type"] = "application/json";
  }
  const authorization = config.apiKey
    ? `Api-Key ${config.apiKey}`
    : config.bearerToken
      ? `Bearer ${config.bearerToken}`
      : null;
  if (authorization) headers.Authorization = authorization;
  return headers;
}

async function materializeCobaltResponse(
  config: CobaltConfig,
  input: { assetDir: string; sourceUrl: string; acquiredAt: string },
  payload: CobaltResponse,
): Promise<CobaltAcquisitionResult> {
  const status = typeof payload.status === "string" ? payload.status : null;

  if (status === "error") {
    const errorPayload = payload as CobaltErrorResponse;
    const code = errorPayload.error?.code ?? "unknown";
    return {
      assets: [],
      attempt: buildAttempt({
        status: "unavailable",
        acquiredAt: null,
        sourceUrl: input.sourceUrl,
        notes: [`cobalt could not download this source (${code}).`],
        error: code,
      }),
    };
  }

  if (status === "tunnel" || status === "redirect") {
    const filePayload = payload as CobaltFileResponse;
    if (!filePayload.url) {
      return {
        assets: [],
        attempt: buildAttempt({
          status: "error",
          acquiredAt: null,
          sourceUrl: input.sourceUrl,
          notes: ["cobalt returned a single-file response without a URL."],
          error: "missing cobalt download url",
        }),
      };
    }

    const asset = await downloadAsset(config, {
      assetDir: input.assetDir,
      sourceUrl: filePayload.url,
      fallbackName: filePayload.filename ?? "download",
    });
    return {
      assets: [asset],
      attempt: buildAttempt({
        status: "ok",
        acquiredAt: input.acquiredAt,
        sourceUrl: input.sourceUrl,
        notes: [`Source media bytes were downloaded through cobalt as ${asset.originalName}.`],
      }),
    };
  }

  if (status === "picker") {
    const pickerPayload = payload as CobaltPickerResponse;
    const assets: CaptureAsset[] = [];
    const pickerItems = Array.isArray(pickerPayload.picker) ? pickerPayload.picker.slice(0, 8) : [];
    for (let index = 0; index < pickerItems.length; index += 1) {
      const item = pickerItems[index];
      if (!item?.url) continue;
      assets.push(await downloadAsset(config, {
        assetDir: input.assetDir,
        sourceUrl: item.url,
        fallbackName: buildPickerFallbackName(item, index),
      }));
    }
    if (pickerPayload.audio) {
      assets.push(await downloadAsset(config, {
        assetDir: input.assetDir,
        sourceUrl: pickerPayload.audio,
        fallbackName: pickerPayload.audioFilename ?? "picker-audio",
      }));
    }
    return {
      assets,
      attempt: buildAttempt({
        status: assets.length > 0 ? "ok" : "unavailable",
        acquiredAt: assets.length > 0 ? input.acquiredAt : null,
        sourceUrl: input.sourceUrl,
        notes: assets.length > 0
          ? [`cobalt returned a picker response and Aftertaste saved ${assets.length} media item(s).`]
          : ["cobalt returned a picker response, but no downloadable media items were usable."],
      }),
    };
  }

  if (status === "local-processing") {
    const localProcessingPayload = payload as CobaltLocalProcessingResponse;
    const tunnels = Array.isArray(localProcessingPayload.tunnel) ? localProcessingPayload.tunnel.slice(0, 4) : [];
    const assets: CaptureAsset[] = [];
    for (let index = 0; index < tunnels.length; index += 1) {
      const tunnelUrl = tunnels[index];
      if (typeof tunnelUrl !== "string" || !tunnelUrl) continue;
      assets.push(await downloadAsset(config, {
        assetDir: input.assetDir,
        sourceUrl: tunnelUrl,
        fallbackName: buildLocalProcessingFallbackName(localProcessingPayload, index),
        hintedMimeType: inferLocalProcessingMimeType(localProcessingPayload, index),
      }));
    }
    return {
      assets,
      attempt: buildAttempt({
        status: assets.length > 0 ? "partial" : "unavailable",
        acquiredAt: assets.length > 0 ? input.acquiredAt : null,
        sourceUrl: input.sourceUrl,
        notes: assets.length > 0
          ? [
              `cobalt required local processing (${localProcessingPayload.type ?? "unknown"}), so Aftertaste saved the raw tunnel file(s) separately.`,
            ]
          : ["cobalt required local processing for this source, and no tunnel files could be saved."],
      }),
    };
  }

  return {
    assets: [],
    attempt: buildAttempt({
      status: "error",
      acquiredAt: null,
      sourceUrl: input.sourceUrl,
      notes: ["cobalt returned an unrecognized response shape."],
      error: "unrecognized cobalt response",
    }),
  };
}

async function downloadAsset(
  config: CobaltConfig,
  input: {
    assetDir: string;
    sourceUrl: string;
    fallbackName: string;
    hintedMimeType?: string | null;
  },
): Promise<CaptureAsset> {
  const absoluteUrl = new URL(input.sourceUrl, `${config.apiUrl}/`).toString();
  const downloadResponse = await fetch(absoluteUrl, {
    headers: buildDownloadHeaders(config, absoluteUrl),
    signal: AbortSignal.timeout(config.timeoutMs),
  });
  if (!downloadResponse.ok) {
    throw new Error(`cobalt download failed with status ${downloadResponse.status}`);
  }

  const rawMediaType = input.hintedMimeType
    ?? normalizeMediaType(downloadResponse.headers.get("content-type"))
    ?? inferMediaTypeFromName(input.fallbackName)
    ?? "application/octet-stream";
  const normalizedName = normalizeDownloadedFileName(
    downloadResponse.headers.get("content-disposition"),
    input.fallbackName,
    rawMediaType,
  );
  const extension = safeExtension(normalizedName) || extensionFromMediaType(rawMediaType);
  const baseName = sanitizeFileName(path.basename(normalizedName, path.extname(normalizedName))) || "asset";
  const id = crypto.randomBytes(3).toString("hex");
  const fileName = `${baseName}-${id}${extension}`;
  const fullPath = path.join(input.assetDir, fileName);

  fs.mkdirSync(input.assetDir, { recursive: true });
  if (!downloadResponse.body) {
    throw new Error("cobalt download returned no body");
  }
  await pipeline(
    Readable.fromWeb(downloadResponse.body as any),
    fs.createWriteStream(fullPath),
  );
  const size = fs.statSync(fullPath).size;

  return {
    id,
    fileName,
    originalName: path.basename(normalizedName),
    mediaType: rawMediaType,
    size,
    path: fullPath,
    kind: classifyAsset(rawMediaType),
    origin: "source-download" satisfies CaptureAssetOrigin,
  };
}

function buildDownloadHeaders(config: CobaltConfig, absoluteUrl: string): HeadersInit | undefined {
  try {
    const cobaltOrigin = new URL(config.apiUrl).origin;
    const downloadOrigin = new URL(absoluteUrl).origin;
    if (cobaltOrigin === downloadOrigin) {
      return buildCobaltHeaders(config, false);
    }
  } catch {
    // Ignore URL parsing problems and fall through without auth headers.
  }
  return undefined;
}

function buildPickerFallbackName(item: CobaltPickerItem, index: number): string {
  if (item.type === "video") return `picker-video-${index + 1}.mp4`;
  if (item.type === "gif") return `picker-gif-${index + 1}.gif`;
  return `picker-photo-${index + 1}.jpg`;
}

function buildLocalProcessingFallbackName(payload: CobaltLocalProcessingResponse, index: number): string {
  const outputName = payload.output?.filename?.trim();
  if (outputName) {
    if (index === 0) return outputName;
    const extension = safeExtension(outputName);
    const base = path.basename(outputName, extension);
    return `${base}-${index + 1}${extension}`;
  }
  return `local-processing-${index + 1}${extensionFromMediaType(payload.output?.type ?? null)}`;
}

function inferLocalProcessingMimeType(
  payload: CobaltLocalProcessingResponse,
  index: number,
): string | null {
  if (payload.type === "merge" && index > 0) return "audio/mp4";
  return normalizeMediaType(payload.output?.type ?? null);
}

function buildAttempt(input: {
  status: CaptureAcquisitionAttemptRecord["status"];
  acquiredAt: string | null;
  sourceUrl: string;
  notes: string[];
  error?: string;
}): CaptureAcquisitionAttemptRecord {
  return {
    id: "media-bytes:best-effort-extractor:cobalt",
    target: "media-bytes",
    mode: "best-effort-extractor",
    status: input.status,
    provider: "cobalt",
    acquiredAt: input.acquiredAt,
    sourceUrl: input.sourceUrl,
    notes: input.notes,
    error: input.error,
    artifactPath: null,
  };
}

function normalizeDownloadedFileName(
  contentDisposition: string | null,
  fallbackName: string,
  mediaType: string,
): string {
  const fromHeader = extractContentDispositionFileName(contentDisposition);
  if (fromHeader) return ensureFileNameExtension(fromHeader, mediaType);
  return ensureFileNameExtension(path.basename(fallbackName) || "download", mediaType);
}

function extractContentDispositionFileName(headerValue: string | null): string | null {
  if (!headerValue) return null;
  const utf8Match = /filename\*=UTF-8''([^;]+)/i.exec(headerValue);
  if (utf8Match?.[1]) {
    try {
      return decodeURIComponent(utf8Match[1]);
    } catch {
      return utf8Match[1];
    }
  }
  const quotedMatch = /filename="([^"]+)"/i.exec(headerValue);
  if (quotedMatch?.[1]) return quotedMatch[1];
  const plainMatch = /filename=([^;]+)/i.exec(headerValue);
  return plainMatch?.[1]?.trim() ?? null;
}

function ensureFileNameExtension(fileName: string, mediaType: string): string {
  if (safeExtension(fileName)) return fileName;
  return `${fileName}${extensionFromMediaType(mediaType)}`;
}

function classifyAsset(mediaType: string): CaptureAsset["kind"] {
  if (mediaType.startsWith("image/")) return "image";
  if (mediaType.startsWith("video/")) return "video";
  if (mediaType.startsWith("audio/")) return "audio";
  if (mediaType.includes("pdf") || mediaType.startsWith("text/")) return "document";
  return "other";
}

function normalizeMediaType(value: string | null | undefined): string | null {
  if (!value) return null;
  return value.split(";")[0]?.trim().toLowerCase() || null;
}

function inferMediaTypeFromName(fileName: string): string | null {
  const extension = safeExtension(fileName).toLowerCase();
  switch (extension) {
    case ".mp4":
    case ".m4v":
      return "video/mp4";
    case ".webm":
      return "video/webm";
    case ".mov":
      return "video/quicktime";
    case ".mp3":
      return "audio/mpeg";
    case ".m4a":
      return "audio/mp4";
    case ".wav":
      return "audio/wav";
    case ".ogg":
    case ".opus":
      return "audio/ogg";
    case ".jpg":
    case ".jpeg":
      return "image/jpeg";
    case ".png":
      return "image/png";
    case ".gif":
      return "image/gif";
    default:
      return null;
  }
}

function extensionFromMediaType(mediaType: string | null): string {
  switch (mediaType) {
    case "video/mp4":
      return ".mp4";
    case "video/webm":
      return ".webm";
    case "video/quicktime":
      return ".mov";
    case "audio/mpeg":
      return ".mp3";
    case "audio/mp4":
      return ".m4a";
    case "audio/wav":
      return ".wav";
    case "audio/ogg":
      return ".ogg";
    case "image/jpeg":
      return ".jpg";
    case "image/png":
      return ".png";
    case "image/gif":
      return ".gif";
    default:
      return "";
  }
}

function safeExtension(fileName: string): string {
  return path.extname(fileName).slice(0, 12);
}

function sanitizeFileName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}
