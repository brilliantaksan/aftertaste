import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import type {
  AnalysisResult,
  CaptureAsset,
  CaptureAssetInput,
  CaptureCreateRequest,
  CaptureDetailResponse,
  CaptureListResponse,
  CaptureRecord,
  IdeaDraft,
  IdeaRequest,
  IdeaResponse,
  IdeaOutputType,
  ReferenceSummary,
  ReferencesFilters,
  ReferencesResponse,
  SignalTag,
  TasteSnapshot,
  UrlMetadata,
} from "../../shared/contracts.js";

interface SignalRule {
  slug: string;
  label: string;
  keywords: string[];
}

interface AftertastePaths {
  root: string;
  claude: string;
  logDir: string;
  auditDir: string;
  auditResolvedDir: string;
  rawInboxDir: string;
  rawCapturesDir: string;
  rawMediaDir: string;
  wikiDir: string;
  wikiReferencesDir: string;
  wikiThemesDir: string;
  wikiMotifsDir: string;
  wikiCreatorsDir: string;
  wikiFormatsDir: string;
  wikiSnapshotsDir: string;
  wikiStyleConstitution: string;
  wikiNotMe: string;
  wikiIndex: string;
  outputsAppDir: string;
  outputsIdeasDir: string;
  snapshotJson: string;
  referencesJson: string;
}

const THEME_RULES: SignalRule[] = [
  { slug: "long-distance", label: "Long Distance", keywords: ["long distance", "far away", "miles apart", "distance", "separated", "absence"] },
  { slug: "tenderness", label: "Tenderness", keywords: ["soft", "tender", "gentle", "care", "warm", "comfort", "intimate"] },
  { slug: "discipline", label: "Discipline", keywords: ["discipline", "routine", "practice", "focus", "consistency", "habit", "grind"] },
  { slug: "identity", label: "Identity", keywords: ["identity", "who i am", "becoming", "self", "version of me", "name", "belonging"] },
  { slug: "ambition", label: "Ambition", keywords: ["ambition", "career", "dream", "goal", "building", "future", "making it"] },
  { slug: "reflection", label: "Reflection", keywords: ["journal", "reflect", "thinking", "processing", "note to self", "learned"] },
  { slug: "intimacy", label: "Intimacy", keywords: ["relationship", "love", "close", "hold", "together", "private", "heart"] },
  { slug: "restlessness", label: "Restlessness", keywords: ["bored", "stuck", "restless", "drift", "waiting", "itch", "unsettled"] },
];

const MOTIF_RULES: SignalRule[] = [
  { slug: "voiceover", label: "Voiceover", keywords: ["voiceover", "voice over", "narration", "monologue", "spoken"] },
  { slug: "text-overlay", label: "Text Overlay", keywords: ["subtitle", "captions", "text overlay", "on screen text", "lower third", "typography"] },
  { slug: "close-up", label: "Close-Up", keywords: ["close-up", "close up", "close shot", "eyes", "face"] },
  { slug: "montage", label: "Montage", keywords: ["montage", "sequence", "cut together", "b-roll", "moments"] },
  { slug: "handheld", label: "Handheld", keywords: ["handheld", "raw camera", "camcorder", "phone footage"] },
  { slug: "ambient-audio", label: "Ambient Audio", keywords: ["ambient", "room tone", "sound design", "breath", "silence", "rain"] },
  { slug: "slow-zoom", label: "Slow Zoom", keywords: ["slow zoom", "push in", "dolly", "zoom"] },
  { slug: "soft-color", label: "Soft Color", keywords: ["warm grade", "muted", "soft color", "beige", "cream", "washed"] },
];

const FORMAT_RULES: SignalRule[] = [
  { slug: "talking-head", label: "Talking Head", keywords: ["talking head", "to camera", "camera", "monologue", "direct address"] },
  { slug: "voiceover-montage", label: "Voiceover Montage", keywords: ["voiceover montage", "voiceover", "b-roll", "montage"] },
  { slug: "micro-essay", label: "Micro Essay", keywords: ["essay", "argument", "premise", "point", "lesson", "insight"] },
  { slug: "pov-diary", label: "POV Diary", keywords: ["pov", "diary", "journal", "today i", "day in the life"] },
  { slug: "shot-list-reference", label: "Shot List Reference", keywords: ["shot list", "shots", "framing", "blocking", "sequence"] },
  { slug: "tutorial-breakdown", label: "Tutorial Breakdown", keywords: ["tutorial", "how to", "breakdown", "explainer", "step by step"] },
];

const FALLBACK_THEMES: SignalRule[] = [
  { slug: "daily-texture", label: "Daily Texture", keywords: [] },
  { slug: "private-voice", label: "Private Voice", keywords: [] },
];

const FALLBACK_MOTIFS: SignalRule[] = [
  { slug: "observational-b-roll", label: "Observational B-Roll", keywords: [] },
  { slug: "soft-pacing", label: "Soft Pacing", keywords: [] },
];

export function getAftertastePaths(root: string): AftertastePaths {
  return {
    root,
    claude: path.join(root, "CLAUDE.md"),
    logDir: path.join(root, "log"),
    auditDir: path.join(root, "audit"),
    auditResolvedDir: path.join(root, "audit", "resolved"),
    rawInboxDir: path.join(root, "raw", "inbox"),
    rawCapturesDir: path.join(root, "raw", "captures"),
    rawMediaDir: path.join(root, "raw", "media"),
    wikiDir: path.join(root, "wiki"),
    wikiReferencesDir: path.join(root, "wiki", "references"),
    wikiThemesDir: path.join(root, "wiki", "themes"),
    wikiMotifsDir: path.join(root, "wiki", "motifs"),
    wikiCreatorsDir: path.join(root, "wiki", "creators"),
    wikiFormatsDir: path.join(root, "wiki", "formats"),
    wikiSnapshotsDir: path.join(root, "wiki", "snapshots"),
    wikiStyleConstitution: path.join(root, "wiki", "style-constitution.md"),
    wikiNotMe: path.join(root, "wiki", "not-me.md"),
    wikiIndex: path.join(root, "wiki", "index.md"),
    outputsAppDir: path.join(root, "outputs", "app"),
    outputsIdeasDir: path.join(root, "outputs", "ideas"),
    snapshotJson: path.join(root, "outputs", "app", "snapshot-current.json"),
    referencesJson: path.join(root, "outputs", "app", "references.json"),
  };
}

export function ensureAftertasteWorkspace(root: string): void {
  const paths = getAftertastePaths(root);
  const dirs = [
    paths.logDir,
    paths.auditDir,
    paths.auditResolvedDir,
    paths.rawInboxDir,
    paths.rawCapturesDir,
    paths.rawMediaDir,
    paths.wikiDir,
    paths.wikiReferencesDir,
    paths.wikiThemesDir,
    paths.wikiMotifsDir,
    paths.wikiCreatorsDir,
    paths.wikiFormatsDir,
    paths.wikiSnapshotsDir,
    paths.outputsAppDir,
    paths.outputsIdeasDir,
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
  writeIfMissing(paths.auditDir + "/.gitkeep", "");
  writeIfMissing(paths.auditResolvedDir + "/.gitkeep", "");
  writeIfMissing(paths.claude, defaultClaudeTemplate());
  writeIfMissing(paths.wikiStyleConstitution, defaultStyleConstitutionPage());
  writeIfMissing(paths.wikiNotMe, defaultNotMePage());
  writeIfMissing(paths.wikiIndex, defaultIndexPage());
  ensureTodayLog(paths.logDir);
}

export async function createCapture(
  root: string,
  input: CaptureCreateRequest,
): Promise<CaptureDetailResponse> {
  ensureAftertasteWorkspace(root);

  const sourceUrl = normalizeSourceUrl(input.sourceUrl);
  const note = (input.note ?? "").trim();
  const createdAt = new Date().toISOString();
  const id = makeCaptureId();
  const metadata = await fetchUrlMetadata(sourceUrl);
  const platform = detectPlatform(sourceUrl);
  const assetDir = path.join(getAftertastePaths(root).rawMediaDir, id);
  const assets = writeAssets(assetDir, input.assets ?? []).map((asset) => ({
    ...asset,
    path: toRel(root, asset.path),
  }));
  const ingestionMode = deriveIngestionMode(note, assets.length);

  const record: CaptureRecord = {
    id,
    sourceUrl,
    platform,
    note,
    assets,
    ingestionMode,
    status: "captured",
    createdAt,
    updatedAt: createdAt,
    rawPaths: {
      inbox: toRel(root, path.join(root, "raw", "inbox", `${id}.md`)),
      capture: toRel(root, path.join(root, "raw", "captures", `${id}.json`)),
      analysis: null,
      assetsDir: assets.length > 0 ? toRel(root, assetDir) : null,
      referencePage: null,
    },
    metadata,
  };

  writeText(path.join(root, record.rawPaths.inbox), buildInboxMarkdown(record));
  writeJson(path.join(root, record.rawPaths.capture), record);
  appendLog(root, `## [${timeStamp()}] capture | ${id} — ${platform} link saved`);

  const analysis = runAnalysis(root, id);
  const compiled = compileAftertaste(root);
  return {
    capture: readCapture(root, id),
    analysis,
    reference: compiled.references.find((reference) => reference.id === id) ?? null,
  };
}

export function listCaptures(root: string): CaptureListResponse {
  ensureAftertasteWorkspace(root);
  return { captures: readAllCaptures(root).sort(sortByCreatedDesc) };
}

export function getCaptureDetail(root: string, id: string): CaptureDetailResponse {
  ensureAftertasteWorkspace(root);
  const capture = readCapture(root, id);
  const analysis = readAnalysis(root, id);
  const reference = listReferences(root).references.find((item) => item.id === id) ?? null;
  return { capture, analysis, reference };
}

export function runAnalysis(root: string, captureId: string): AnalysisResult {
  ensureAftertasteWorkspace(root);
  const paths = getAftertastePaths(root);
  const capture = readCapture(root, captureId);
  const combinedText = collectCaptureText(capture);
  const creatorSignals = extractCreatorSignals(capture);
  const themes = rankSignals(combinedText, THEME_RULES, FALLBACK_THEMES);
  const motifs = rankSignals(combinedText, MOTIF_RULES, FALLBACK_MOTIFS, capture.assets);
  const formatSignals = rankSignals(combinedText, FORMAT_RULES, [], capture.assets);
  const summary = summarizeCapture(capture, themes, motifs, formatSignals, creatorSignals);
  const analysis: AnalysisResult = {
    captureId,
    mode: capture.assets.length > 0 ? "hybrid" : "text-first",
    caption: pickReferenceTitle(capture),
    transcript: buildTranscript(capture),
    ocr: capture.assets
      .filter((asset) => asset.kind === "image" || asset.kind === "video")
      .map((asset) => asset.originalName.replace(/\.[^.]+$/, ""))
      .join(" · "),
    themes,
    motifs,
    creatorSignals,
    formatSignals,
    summary,
    confidence: Math.min(0.94, 0.52 + themes.length * 0.08 + motifs.length * 0.06 + (capture.assets.length > 0 ? 0.08 : 0)),
    assetInsights: buildAssetInsights(capture.assets),
    generatedAt: new Date().toISOString(),
  };

  const analysisPath = path.join(paths.rawMediaDir, captureId, "analysis.json");
  fs.mkdirSync(path.dirname(analysisPath), { recursive: true });
  writeJson(analysisPath, analysis);

  const updatedCapture: CaptureRecord = {
    ...capture,
    status: "analyzed",
    updatedAt: analysis.generatedAt,
    rawPaths: {
      ...capture.rawPaths,
      analysis: toRel(root, analysisPath),
      assetsDir: capture.rawPaths.assetsDir,
      referencePage: capture.rawPaths.referencePage,
    },
  };
  writeJson(path.join(root, updatedCapture.rawPaths.capture), updatedCapture);
  appendLog(root, `## [${timeStamp()}] analyze | ${captureId} — ${analysis.mode}`);
  return analysis;
}

export function compileAftertaste(root: string): {
  snapshot: TasteSnapshot;
  references: ReferenceSummary[];
} {
  ensureAftertasteWorkspace(root);
  const paths = getAftertastePaths(root);
  const captures = readAllCaptures(root).sort(sortByCreatedDesc);
  const references = captures
    .map((capture) => {
      const analysis = readAnalysis(root, capture.id);
      if (!analysis) return null;
      const pagePath = `wiki/references/${capture.id}.md`;
      return toReferenceSummary(capture, analysis, pagePath);
    })
    .filter((reference): reference is ReferenceSummary => reference !== null);

  for (const reference of references) {
    const capture = readCapture(root, reference.id);
    const analysis = readAnalysis(root, reference.id);
    if (!analysis) continue;
    const updatedCapture: CaptureRecord = {
      ...capture,
      status: "compiled",
      updatedAt: new Date().toISOString(),
      rawPaths: {
        ...capture.rawPaths,
        referencePage: reference.pagePath,
      },
    };
    writeJson(path.join(root, updatedCapture.rawPaths.capture), updatedCapture);
    writeText(path.join(root, reference.pagePath), buildReferencePage(updatedCapture, analysis, reference));
  }

  writeCategoryPages(paths.wikiThemesDir, references, "themes");
  writeCategoryPages(paths.wikiMotifsDir, references, "motifs");
  writeCategoryPages(paths.wikiCreatorsDir, references, "creatorSignals");
  writeCategoryPages(paths.wikiFormatsDir, references, "formatSignals");

  const snapshot = buildSnapshot(references);
  writeJson(paths.referencesJson, references);
  writeJson(paths.snapshotJson, snapshot);
  writeText(path.join(paths.wikiSnapshotsDir, "current.md"), buildSnapshotPage(snapshot));
  writeText(path.join(paths.wikiSnapshotsDir, `${snapshot.id}.md`), buildSnapshotPage(snapshot));
  writeText(paths.wikiStyleConstitution, buildStyleConstitutionPage(references));
  writeText(paths.wikiNotMe, buildNotMePage(references));
  writeText(paths.wikiIndex, buildIndexPage(references, snapshot));

  appendLog(root, `## [${timeStamp()}] compile | rebuilt Aftertaste pages (${references.length} references)`);
  return { snapshot, references };
}

export function getCurrentSnapshot(root: string): TasteSnapshot {
  ensureAftertasteWorkspace(root);
  const paths = getAftertastePaths(root);
  if (!fs.existsSync(paths.snapshotJson)) {
    return compileAftertaste(root).snapshot;
  }
  return readJson<TasteSnapshot>(paths.snapshotJson);
}

export function listReferences(
  root: string,
  filters?: {
    theme?: string;
    motif?: string;
    creator?: string;
    format?: string;
    platform?: string;
    q?: string;
  },
): ReferencesResponse {
  ensureAftertasteWorkspace(root);
  const paths = getAftertastePaths(root);
  if (!fs.existsSync(paths.referencesJson)) {
    compileAftertaste(root);
  }
  const all = readJson<ReferenceSummary[]>(paths.referencesJson);
  const filtered = all.filter((reference) => matchReference(reference, filters));
  return {
    references: filtered,
    filters: buildFilters(all),
  };
}

export function generateIdeas(root: string, request: IdeaRequest): IdeaResponse {
  ensureAftertasteWorkspace(root);
  const snapshot = getCurrentSnapshot(root);
  const references = listReferences(root).references;
  const selected = selectIdeaReferences(request, snapshot, references);
  const generatedAt = new Date().toISOString();
  const outputs = buildIdeas(request.outputType, request.brief, snapshot, selected);
  const response: IdeaResponse = {
    request,
    snapshot,
    outputs,
    generatedAt,
  };
  writeJson(path.join(getAftertastePaths(root).outputsIdeasDir, `${snapshot.id}-${Date.now()}.json`), response);
  appendLog(root, `## [${timeStamp()}] ideas | ${request.outputType} — ${selected.length} references used`);
  return response;
}

function normalizeSourceUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("sourceUrl must be a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("sourceUrl must use http or https");
  }
  return parsed.toString();
}

async function fetchUrlMetadata(sourceUrl: string): Promise<UrlMetadata> {
  try {
    const response = await fetch(sourceUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(3000),
      headers: {
        "user-agent": "Aftertaste/0.1 (+local-first)",
      },
    });
    if (!response.ok) {
      return {
        title: null,
        description: null,
        canonicalUrl: null,
        siteName: null,
        fetchedAt: new Date().toISOString(),
        status: "error",
        error: `metadata fetch failed with ${response.status}`,
      };
    }
    const html = await response.text();
    return {
      title: readMeta(html, "property", "og:title") ?? readMeta(html, "name", "twitter:title") ?? readTitle(html),
      description:
        readMeta(html, "property", "og:description") ??
        readMeta(html, "name", "description") ??
        readMeta(html, "name", "twitter:description"),
      canonicalUrl: readCanonicalUrl(html),
      siteName: readMeta(html, "property", "og:site_name"),
      fetchedAt: new Date().toISOString(),
      status: "ok",
    };
  } catch (error) {
    return {
      title: null,
      description: null,
      canonicalUrl: null,
      siteName: null,
      fetchedAt: new Date().toISOString(),
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function readMeta(html: string, attr: string, key: string): string | null {
  const pattern = new RegExp(`<meta[^>]*${attr}=["']${escapeRegex(key)}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i");
  const reversedPattern = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*${attr}=["']${escapeRegex(key)}["'][^>]*>`, "i");
  return decodeEntities(pattern.exec(html)?.[1] ?? reversedPattern.exec(html)?.[1] ?? "") || null;
}

function readCanonicalUrl(html: string): string | null {
  const pattern = /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i;
  return decodeEntities(pattern.exec(html)?.[1] ?? "") || null;
}

function readTitle(html: string): string | null {
  const pattern = /<title[^>]*>([^<]+)<\/title>/i;
  return decodeEntities(pattern.exec(html)?.[1] ?? "") || null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectPlatform(sourceUrl: string): string {
  const host = new URL(sourceUrl).hostname.replace(/^www\./, "");
  if (host.includes("instagram")) return "Instagram";
  if (host.includes("tiktok")) return "TikTok";
  if (host.includes("youtube")) return "YouTube";
  if (host.includes("twitter") || host.includes("x.com")) return "X";
  return host
    .split(".")[0]!
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function writeAssets(dir: string, inputs: CaptureAssetInput[]): CaptureAsset[] {
  if (inputs.length === 0) return [];
  fs.mkdirSync(dir, { recursive: true });
  return inputs.map((input) => {
    const extension = safeExtension(input.name);
    const baseName = sanitizeFileName(path.basename(input.name, extension));
    const id = crypto.randomBytes(3).toString("hex");
    const fileName = `${baseName || "asset"}-${id}${extension}`;
    const fullPath = path.join(dir, fileName);
    const content = Buffer.from(stripDataPrefix(input.dataBase64), "base64");
    fs.writeFileSync(fullPath, content);
    return {
      id,
      fileName,
      originalName: input.name,
      mediaType: input.mediaType,
      size: input.size ?? content.byteLength,
      path: fullPath,
      kind: classifyAsset(input.mediaType),
    };
  });
}

function stripDataPrefix(value: string): string {
  const index = value.indexOf(",");
  return index >= 0 ? value.slice(index + 1) : value;
}

function safeExtension(fileName: string): string {
  const extension = path.extname(fileName).slice(0, 12);
  return extension || "";
}

function sanitizeFileName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

function classifyAsset(mediaType: string): CaptureAsset["kind"] {
  if (mediaType.startsWith("image/")) return "image";
  if (mediaType.startsWith("video/")) return "video";
  if (mediaType.startsWith("audio/")) return "audio";
  if (mediaType.includes("pdf") || mediaType.startsWith("text/")) return "document";
  return "other";
}

function deriveIngestionMode(note: string, assetCount: number): CaptureRecord["ingestionMode"] {
  if (note && assetCount > 0) return "link-note-upload";
  if (note) return "link-note";
  if (assetCount > 0) return "link-upload";
  return "link";
}

function buildInboxMarkdown(record: CaptureRecord): string {
  const parts = [
    `# Capture ${record.id}`,
    "",
    "## Source",
    `- URL: ${record.sourceUrl}`,
    `- Platform: ${record.platform}`,
    `- Saved: ${record.createdAt}`,
    `- Ingestion mode: ${record.ingestionMode}`,
    "",
    "## Why I saved this",
    record.note ? record.note : "_No note yet._",
    "",
    "## Metadata",
    `- Title: ${record.metadata.title ?? "Unknown"}`,
    `- Description: ${record.metadata.description ?? "None"}`,
    `- Site: ${record.metadata.siteName ?? record.platform}`,
    `- Metadata status: ${record.metadata.status}`,
  ];
  if (record.assets.length > 0) {
    parts.push("", "## Assets", ...record.assets.map((asset) => `- ${asset.originalName} (${asset.mediaType}, ${asset.size} bytes)`));
  }
  return parts.join("\n") + "\n";
}

function collectCaptureText(capture: CaptureRecord): string {
  const creatorHandles = extractHandles(
    [capture.note, capture.metadata.title, capture.metadata.description, capture.sourceUrl].filter(Boolean).join(" "),
  );
  return [
    capture.sourceUrl,
    capture.note,
    capture.metadata.title,
    capture.metadata.description,
    capture.metadata.siteName,
    capture.assets.map((asset) => `${asset.originalName} ${asset.kind}`).join(" "),
    creatorHandles.join(" "),
  ]
    .filter(Boolean)
    .join(" \n ")
    .toLowerCase();
}

function extractCreatorSignals(capture: CaptureRecord): SignalTag[] {
  const handles = extractHandles([capture.note, capture.metadata.title, capture.metadata.description, capture.sourceUrl].filter(Boolean).join(" "));
  const unique = Array.from(new Set(handles));
  if (unique.length === 0) return [];
  return unique.slice(0, 4).map((handle, index) => ({
    slug: sanitizeFileName(handle.replace(/^@/, "")),
    label: handle,
    score: Math.max(0.65, 0.95 - index * 0.1),
    evidence: [`Mentioned in capture text as ${handle}`],
  }));
}

function extractHandles(text: string): string[] {
  const matches = text.match(/@[a-z0-9._-]{2,30}/gi) ?? [];
  return matches.map((match) => match.toLowerCase());
}

function rankSignals(
  haystack: string,
  rules: SignalRule[],
  fallbacks: SignalRule[],
  assets: CaptureAsset[] = [],
): SignalTag[] {
  const ranked = rules
    .map((rule) => {
      const evidence: string[] = [];
      let matches = 0;
      for (const keyword of rule.keywords) {
        if (!keyword) continue;
        if (haystack.includes(keyword.toLowerCase())) {
          matches += 1;
          evidence.push(keyword);
        }
      }
      if (rule.slug === "voiceover" && assets.some((asset) => asset.kind === "audio")) {
        matches += 1;
        evidence.push("audio asset");
      }
      if (rule.slug === "voiceover-montage" && assets.some((asset) => asset.kind === "video")) {
        matches += 1;
        evidence.push("video upload");
      }
      if (rule.slug === "shot-list-reference" && assets.some((asset) => asset.kind === "image")) {
        matches += 1;
        evidence.push("image frames");
      }
      if (matches === 0) return null;
      return {
        slug: rule.slug,
        label: rule.label,
        score: Math.min(0.98, 0.52 + matches * 0.18),
        evidence,
      };
    })
    .filter((item): item is SignalTag => item !== null)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    return fallbacks.slice(0, 2).map((rule, index) => ({
      slug: rule.slug,
      label: rule.label,
      score: 0.48 - index * 0.06,
      evidence: ["fallback signal from sparse local context"],
    }));
  }
  return ranked.slice(0, 4);
}

function summarizeCapture(
  capture: CaptureRecord,
  themes: SignalTag[],
  motifs: SignalTag[],
  formats: SignalTag[],
  creators: SignalTag[],
): string {
  const themeLabel = themes[0]?.label ?? "a developing thread";
  const motifLabel = motifs[0]?.label ?? "soft pacing";
  const formatLabel = formats[0]?.label ?? "a reflective short-form format";
  const creatorLabel = creators[0]?.label ? ` with a pull toward ${creators[0]!.label}` : "";
  const noteLead = capture.note ? `Saved with a note about ${sentenceCase(truncate(capture.note, 90))}.` : "Saved without a note, so the system is leaning on link metadata and media cues.";
  return `${noteLead} It reads as ${themeLabel.toLowerCase()} carried through ${motifLabel.toLowerCase()} in a ${formatLabel.toLowerCase()}${creatorLabel}.`;
}

function buildTranscript(capture: CaptureRecord): string {
  return [capture.note, capture.metadata.title, capture.metadata.description]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function buildAssetInsights(assets: CaptureAsset[]): string[] {
  if (assets.length === 0) return ["No uploaded media. Analysis stayed text-first."];
  return assets.map((asset) => {
    if (asset.kind === "video") return `${asset.originalName} adds movement and pacing clues.`;
    if (asset.kind === "image") return `${asset.originalName} adds framing and color cues.`;
    if (asset.kind === "audio") return `${asset.originalName} adds voice or sound-design cues.`;
    return `${asset.originalName} is stored as supporting context.`;
  });
}

function toReferenceSummary(
  capture: CaptureRecord,
  analysis: AnalysisResult,
  pagePath: string,
): ReferenceSummary {
  return {
    id: capture.id,
    title: pickReferenceTitle(capture),
    platform: capture.platform,
    sourceUrl: capture.sourceUrl,
    note: capture.note,
    createdAt: capture.createdAt,
    pagePath,
    summary: analysis.summary,
    themes: analysis.themes,
    motifs: analysis.motifs,
    creatorSignals: analysis.creatorSignals,
    formatSignals: analysis.formatSignals,
    thumbnailLabel: capture.assets[0]?.originalName ?? capture.metadata.siteName ?? capture.platform,
    assetCount: capture.assets.length,
    metadataTitle: capture.metadata.title,
  };
}

function pickReferenceTitle(capture: CaptureRecord): string {
  if (capture.metadata.title) return capture.metadata.title;
  if (capture.note) return sentenceCase(truncate(capture.note, 60));
  const pathname = new URL(capture.sourceUrl).pathname.split("/").filter(Boolean).slice(-2).join(" ");
  return sentenceCase(pathname || `${capture.platform} reference`);
}

function buildReferencePage(
  capture: CaptureRecord,
  analysis: AnalysisResult,
  reference: ReferenceSummary,
): string {
  const frontmatter = formatFrontmatter({
    title: reference.title,
    type: "reference",
    created: capture.createdAt.slice(0, 10),
    updated: new Date().toISOString().slice(0, 10),
    platform: capture.platform,
    source_url: capture.sourceUrl,
    themes: reference.themes.map((tag) => tag.label),
    motifs: reference.motifs.map((tag) => tag.label),
    creators: reference.creatorSignals.map((tag) => tag.label),
    formats: reference.formatSignals.map((tag) => tag.label),
  });
  return [
    frontmatter,
    `# ${reference.title}`,
    "",
    `> Captured from ${capture.platform} on ${capture.createdAt.slice(0, 10)}.`,
    "",
    "## Why It Was Saved",
    capture.note ? capture.note : "_No note captured. This page leans on metadata and media clues._",
    "",
    "## What It Is Doing",
    analysis.summary,
    "",
    "## Taste Signals",
    `- Themes: ${tagLinks(reference.themes, "themes")}`,
    `- Motifs: ${tagLinks(reference.motifs, "motifs")}`,
    `- Creator pulls: ${tagLinks(reference.creatorSignals, "creators")}`,
    `- Format cues: ${tagLinks(reference.formatSignals, "formats")}`,
    "",
    "## Source",
    `- URL: ${capture.sourceUrl}`,
    `- Metadata title: ${capture.metadata.title ?? "Unknown"}`,
    `- Metadata description: ${capture.metadata.description ?? "None"}`,
    "",
    "## Assets",
    capture.assets.length > 0
      ? capture.assets.map((asset) => `- ${asset.originalName} (${asset.kind}, ${asset.mediaType})`).join("\n")
      : "- No uploaded assets.",
    "",
    "## Analysis Notes",
    analysis.assetInsights.map((line) => `- ${line}`).join("\n"),
    "",
    "## Related Snapshot",
    "- [[snapshots/current|Current Taste Snapshot]]",
    "",
  ].join("\n");
}

function writeCategoryPages(
  dir: string,
  references: ReferenceSummary[],
  kind: "themes" | "motifs" | "creatorSignals" | "formatSignals",
): void {
  clearManagedMarkdown(dir);
  const grouped = new Map<string, { label: string; refs: ReferenceSummary[] }>();
  for (const reference of references) {
    for (const tag of reference[kind]) {
      const current = grouped.get(tag.slug) ?? { label: tag.label, refs: [] };
      current.refs.push(reference);
      grouped.set(tag.slug, current);
    }
  }

  for (const [slug, group] of grouped) {
    const folder = path.basename(dir);
    const filePath = path.join(dir, `${slug}.md`);
    const frontmatter = formatFrontmatter({
      title: group.label,
      type: folder.slice(0, -1),
      updated: new Date().toISOString().slice(0, 10),
      references: group.refs.map((reference) => reference.id),
    });
    const summary = summarizeGroup(folder, group.label, group.refs);
    const bullets = group.refs
      .slice(0, 10)
      .map((reference) => `- [[references/${reference.id}|${reference.title}]] — ${reference.summary}`)
      .join("\n");
    writeText(
      filePath,
      [
        frontmatter,
        `# ${group.label}`,
        "",
        summary,
        "",
        "## Related References",
        bullets || "- None yet.",
        "",
      ].join("\n"),
    );
  }
}

function summarizeGroup(folder: string, label: string, refs: ReferenceSummary[]): string {
  if (folder === "themes") {
    return `${label} is currently showing up across ${refs.length} saved reference${refs.length === 1 ? "" : "s"}, often paired with ${refs[0]?.motifs[0]?.label?.toLowerCase() ?? "quiet visual language"}.`;
  }
  if (folder === "motifs") {
    return `${label} keeps appearing as a reusable craft move across ${refs.length} reference${refs.length === 1 ? "" : "s"}.`;
  }
  if (folder === "creators") {
    return `${label} appears as a repeated creator pull in the current archive.`;
  }
  return `${label} is one of the structural shapes showing up in the current archive.`;
}

function buildSnapshot(references: ReferenceSummary[]): TasteSnapshot {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 6);
  const inWindow = references.filter((reference) => new Date(reference.createdAt).getTime() >= start.getTime());
  const source = inWindow.length > 0 ? inWindow : references;
  const themes = aggregateSignals(source.flatMap((reference) => reference.themes));
  const motifs = aggregateSignals(source.flatMap((reference) => reference.motifs));
  const creatorSignals = aggregateSignals(source.flatMap((reference) => reference.creatorSignals));
  const notableReferences = source.slice(0, 4);
  const creatorPatterns = buildCreatorPatterns(source, themes, motifs, creatorSignals);
  const promptSeeds = buildPromptSeeds(source, themes, motifs);
  const summary = summarizeSnapshot(source, themes, motifs, creatorPatterns);
  return {
    id: weeklySnapshotId(now),
    window: {
      label: inWindow.length > 0 ? "This week" : "Current archive",
      start: start.toISOString().slice(0, 10),
      end: now.toISOString().slice(0, 10),
    },
    summary,
    themes,
    motifs,
    creatorPatterns,
    notableReferences,
    promptSeeds,
    generatedAt: new Date().toISOString(),
  };
}

function aggregateSignals(signals: SignalTag[]): SignalTag[] {
  const map = new Map<string, SignalTag>();
  for (const signal of signals) {
    const current = map.get(signal.slug);
    if (!current) {
      map.set(signal.slug, { ...signal });
      continue;
    }
    current.score += signal.score;
    current.evidence = Array.from(new Set([...current.evidence, ...signal.evidence]));
  }
  return Array.from(map.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((signal) => ({
      ...signal,
      score: Number((signal.score / Math.max(1, Math.ceil(signal.evidence.length / 2))).toFixed(2)),
    }));
}

function buildCreatorPatterns(
  references: ReferenceSummary[],
  themes: SignalTag[],
  motifs: SignalTag[],
  creators: SignalTag[],
): TasteSnapshot["creatorPatterns"] {
  const primaryTheme = themes[0]?.label ?? "a reflective thread";
  const primaryMotif = motifs[0]?.label ?? "soft pacing";
  const secondaryMotif = motifs[1]?.label ?? "textural imagery";
  const primaryCreator = creators[0]?.label;
  const refs = references.slice(0, 3).map((reference) => reference.id);
  const patterns = [
    {
      label: "Emotional orbit",
      summary: `You keep circling ${primaryTheme.toLowerCase()} and presenting it through ${primaryMotif.toLowerCase()}.`,
      sourceReferenceIds: refs,
    },
    {
      label: "Craft rhythm",
      summary: `The archive leans toward ${primaryMotif.toLowerCase()} paired with ${secondaryMotif.toLowerCase()}.`,
      sourceReferenceIds: refs,
    },
  ];
  if (primaryCreator) {
    patterns.push({
      label: "Creator pull",
      summary: `${primaryCreator} is surfacing as a recurring influence in how these references feel.`,
      sourceReferenceIds: refs,
    });
  }
  return patterns;
}

function buildPromptSeeds(
  references: ReferenceSummary[],
  themes: SignalTag[],
  motifs: SignalTag[],
): TasteSnapshot["promptSeeds"] {
  const theme = themes[0]?.label ?? "Private Voice";
  const motif = motifs[0]?.label ?? "Soft Pacing";
  const refs = references.slice(0, 2).map((reference) => reference.id);
  return [
    {
      title: "Reel premise",
      prompt: `Turn ${theme.toLowerCase()} into a short reel that uses ${motif.toLowerCase()} without feeling performative.`,
      referenceIds: refs,
    },
    {
      title: "Journal to script",
      prompt: `Use this week's references to transform one journal thought into a cinematic spoken script.`,
      referenceIds: refs,
    },
    {
      title: "Freelance translation",
      prompt: `Translate your taste for ${theme.toLowerCase()} into a client-safe concept deck with clear visual beats.`,
      referenceIds: refs,
    },
  ];
}

function summarizeSnapshot(
  references: ReferenceSummary[],
  themes: SignalTag[],
  motifs: SignalTag[],
  patterns: TasteSnapshot["creatorPatterns"],
): string {
  if (references.length === 0) {
    return "No captures yet. Save a few references and Aftertaste will turn them into a readable taste snapshot.";
  }
  const theme = themes[0]?.label ?? "Reflection";
  const motif = motifs[0]?.label ?? "Soft Pacing";
  const secondTheme = themes[1]?.label ? ` with a secondary pull toward ${themes[1]!.label.toLowerCase()}` : "";
  return `Lately your archive feels anchored in ${theme.toLowerCase()}${secondTheme}. The strongest craft move is ${motif.toLowerCase()}, and the references keep resolving into a tone that feels quiet, intimate, and deliberate. ${patterns[0]?.summary ?? ""}`;
}

function buildSnapshotPage(snapshot: TasteSnapshot): string {
  const frontmatter = formatFrontmatter({
    title: "Current Taste Snapshot",
    type: "snapshot",
    updated: snapshot.generatedAt.slice(0, 10),
    window_start: snapshot.window.start,
    window_end: snapshot.window.end,
  });
  const themeBullets = snapshot.themes.map((theme) => `- [[themes/${theme.slug}|${theme.label}]]`).join("\n") || "- None yet.";
  const motifBullets = snapshot.motifs.map((motif) => `- [[motifs/${motif.slug}|${motif.label}]]`).join("\n") || "- None yet.";
  const referenceBullets =
    snapshot.notableReferences
      .map((reference) => `- [[references/${reference.id}|${reference.title}]] — ${reference.summary}`)
      .join("\n") || "- None yet.";
  return [
    frontmatter,
    "# Current Taste Snapshot",
    "",
    snapshot.summary,
    "",
    "## Themes",
    themeBullets,
    "",
    "## Motifs",
    motifBullets,
    "",
    "## Pattern Read",
    snapshot.creatorPatterns.map((pattern) => `- **${pattern.label}:** ${pattern.summary}`).join("\n") || "- None yet.",
    "",
    "## Notable References",
    referenceBullets,
    "",
    "## Prompt Seeds",
    snapshot.promptSeeds.map((seed) => `- **${seed.title}:** ${seed.prompt}`).join("\n"),
    "",
  ].join("\n");
}

function buildStyleConstitutionPage(references: ReferenceSummary[]): string {
  const themes = aggregateSignals(references.flatMap((reference) => reference.themes));
  const motifs = aggregateSignals(references.flatMap((reference) => reference.motifs));
  const formats = aggregateSignals(references.flatMap((reference) => reference.formatSignals));
  const frontmatter = formatFrontmatter({
    title: "Style Constitution",
    type: "constitution",
    updated: new Date().toISOString().slice(0, 10),
  });
  return [
    frontmatter,
    "# Style Constitution",
    "",
    references.length === 0
      ? "This page will stabilize as you save more references. Right now it is intentionally sparse."
      : `Across the current archive, the most stable taste constants are ${themes.slice(0, 2).map((theme) => theme.label.toLowerCase()).join(" and ")} expressed through ${motifs.slice(0, 2).map((motif) => motif.label.toLowerCase()).join(" and ")}.`,
    "",
    "## Constants",
    themes.slice(0, 5).map((theme) => `- [[themes/${theme.slug}|${theme.label}]]`).join("\n") || "- None yet.",
    "",
    "## Craft Preferences",
    motifs.slice(0, 5).map((motif) => `- [[motifs/${motif.slug}|${motif.label}]]`).join("\n") || "- None yet.",
    "",
    "## Structural Defaults",
    formats.slice(0, 5).map((format) => `- [[formats/${format.slug}|${format.label}]]`).join("\n") || "- None yet.",
    "",
  ].join("\n");
}

function buildNotMePage(references: ReferenceSummary[]): string {
  const frontmatter = formatFrontmatter({
    title: "Not Me",
    type: "constraint",
    updated: new Date().toISOString().slice(0, 10),
  });
  const patterns = references.length === 0
    ? [
        "No explicit anti-patterns captured yet.",
        "Use this page to mark references that are useful but not aligned with your voice.",
      ]
    : [
        "Anything that feels over-explained, over-cut, or optimized for volume over feeling.",
        "References that flatten tenderness into generic motivation.",
        "Visual language that feels too polished to leave room for intimacy.",
      ];
  return [
    frontmatter,
    "# Not Me",
    "",
    "Keep this page as the boundary surface for taste. It should stay shorter and sharper than the rest of the archive.",
    "",
    "## Anti-Patterns",
    patterns.map((line) => `- ${line}`).join("\n"),
    "",
  ].join("\n");
}

function buildIndexPage(references: ReferenceSummary[], snapshot: TasteSnapshot): string {
  const themes = aggregateSignals(references.flatMap((reference) => reference.themes));
  const motifs = aggregateSignals(references.flatMap((reference) => reference.motifs));
  const creators = aggregateSignals(references.flatMap((reference) => reference.creatorSignals));
  const formats = aggregateSignals(references.flatMap((reference) => reference.formatSignals));
  return [
    "# Index — Aftertaste",
    "",
    "> Taste-led knowledge base for creator references, snapshots, and idea prompts.",
    "",
    "## Navigation",
    "- [[snapshots/current|Current Taste Snapshot]]",
    "- [[style-constitution|Style Constitution]]",
    "- [[not-me|Not Me]]",
    "",
    "## References",
    references.length > 0
      ? references.slice(0, 20).map((reference) => `- [[references/${reference.id}|${reference.title}]]`).join("\n")
      : "- *(none yet)*",
    "",
    "## Themes",
    themes.length > 0 ? themes.map((theme) => `- [[themes/${theme.slug}|${theme.label}]]`).join("\n") : "- *(none yet)*",
    "",
    "## Motifs",
    motifs.length > 0 ? motifs.map((motif) => `- [[motifs/${motif.slug}|${motif.label}]]`).join("\n") : "- *(none yet)*",
    "",
    "## Creators",
    creators.length > 0 ? creators.map((creator) => `- [[creators/${creator.slug}|${creator.label}]]`).join("\n") : "- *(none yet)*",
    "",
    "## Formats",
    formats.length > 0 ? formats.map((format) => `- [[formats/${format.slug}|${format.label}]]`).join("\n") : "- *(none yet)*",
    "",
    "## Snapshot Notes",
    `- ${snapshot.summary}`,
    "",
  ].join("\n");
}

function matchReference(
  reference: ReferenceSummary,
  filters?: {
    theme?: string;
    motif?: string;
    creator?: string;
    format?: string;
    platform?: string;
    q?: string;
  },
): boolean {
  if (!filters) return true;
  if (filters.theme && !reference.themes.some((theme) => theme.slug === filters.theme)) return false;
  if (filters.motif && !reference.motifs.some((motif) => motif.slug === filters.motif)) return false;
  if (filters.creator && !reference.creatorSignals.some((creator) => creator.slug === filters.creator)) return false;
  if (filters.format && !reference.formatSignals.some((format) => format.slug === filters.format)) return false;
  if (filters.platform && sanitizeFileName(reference.platform) !== filters.platform) return false;
  if (filters.q) {
    const needle = filters.q.toLowerCase();
    const haystack = [
      reference.title,
      reference.summary,
      reference.note,
      reference.platform,
      ...reference.themes.map((theme) => theme.label),
      ...reference.motifs.map((motif) => motif.label),
      ...reference.creatorSignals.map((creator) => creator.label),
      ...reference.formatSignals.map((format) => format.label),
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

function buildFilters(references: ReferenceSummary[]): ReferencesFilters {
  return {
    themes: countFilters(references.flatMap((reference) => reference.themes)),
    motifs: countFilters(references.flatMap((reference) => reference.motifs)),
    creators: countFilters(references.flatMap((reference) => reference.creatorSignals)),
    formats: countFilters(references.flatMap((reference) => reference.formatSignals)),
    platforms: countPlatforms(references),
  };
}

function countFilters(tags: SignalTag[]): ReferencesFilters["themes"] {
  const counts = new Map<string, { slug: string; label: string; count: number }>();
  for (const tag of tags) {
    const current = counts.get(tag.slug) ?? { slug: tag.slug, label: tag.label, count: 0 };
    current.count += 1;
    counts.set(tag.slug, current);
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function countPlatforms(references: ReferenceSummary[]): ReferencesFilters["platforms"] {
  const counts = new Map<string, { slug: string; label: string; count: number }>();
  for (const reference of references) {
    const slug = sanitizeFileName(reference.platform);
    const current = counts.get(slug) ?? { slug, label: reference.platform, count: 0 };
    current.count += 1;
    counts.set(slug, current);
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function selectIdeaReferences(
  request: IdeaRequest,
  snapshot: TasteSnapshot,
  references: ReferenceSummary[],
): ReferenceSummary[] {
  if (request.referenceIds.length > 0) {
    return references.filter((reference) => request.referenceIds.includes(reference.id)).slice(0, 4);
  }
  if (snapshot.notableReferences.length > 0) {
    return snapshot.notableReferences.slice(0, 3);
  }
  return references.slice(0, 3);
}

function buildIdeas(
  outputType: IdeaOutputType,
  brief: string,
  snapshot: TasteSnapshot,
  references: ReferenceSummary[],
): IdeaDraft[] {
  const theme = snapshot.themes[0]?.label ?? "Private Voice";
  const secondaryTheme = snapshot.themes[1]?.label ?? "Daily Texture";
  const motif = snapshot.motifs[0]?.label ?? "Soft Pacing";
  const refTitles = references.map((reference) => reference.title);
  const citations = references.map((reference) => reference.id);
  const briefLine = brief.trim() ? `Ground it in this brief: ${brief.trim()}` : "Keep it close to the current snapshot without over-explaining the feeling.";

  if (outputType === "hooks") {
    return [
      {
        id: crypto.randomUUID(),
        title: "Quiet reveal",
        outputType,
        citations,
        rationale: `Built from ${theme.toLowerCase()} plus ${motif.toLowerCase()} and the latest saved references.`,
        body: `1. "I thought distance would make this smaller. It made it louder."\n2. "Lately I keep filming the moments right before I say what I mean."\n3. "This is what discipline looks like when it still has a heartbeat."`,
      },
      {
        id: crypto.randomUUID(),
        title: "Private admission",
        outputType,
        citations,
        rationale: `Leans into ${secondaryTheme.toLowerCase()} while staying useful for short-form voice-led reels.`,
        body: `1. "I keep saving the same feeling in different clothes."\n2. "Maybe the reel isn't about the trip. Maybe it's about what I keep carrying home."\n3. "I wanted this to feel cinematic, but it ended up feeling honest."`,
      },
      {
        id: crypto.randomUUID(),
        title: "Taste-to-brief opener",
        outputType,
        citations,
        rationale: `Designed to bridge personal taste with a client or project context.`,
        body: `1. "If I had to turn this week's taste into one frame, it would be ${theme.toLowerCase()} with ${motif.toLowerCase()}."\n2. "Everything I saved this week moved slowly and still landed hard."\n3. "I'm noticing a pattern: I trust softness more than spectacle."`,
      },
    ];
  }

  if (outputType === "shotlist") {
    return [
      {
        id: crypto.randomUUID(),
        title: "Five-beat intimate reel",
        outputType,
        citations,
        rationale: `Translates ${theme.toLowerCase()} into a concrete capture plan with ${motif.toLowerCase()} cues.`,
        body: [
          "1. Establishing detail shot: hands, coffee steam, or train window for texture.",
          "2. Mid close-up with slight handheld movement while the voiceover begins.",
          "3. Insert of a saved reference object or place that carries the emotional center.",
          "4. Static wide shot to let the line with the most tension breathe.",
          "5. Final close-up or mirror shot with on-screen text that lands the takeaway.",
          "",
          briefLine,
        ].join("\n"),
      },
      {
        id: crypto.randomUUID(),
        title: "Client-safe visual translation",
        outputType,
        citations,
        rationale: `Keeps the same taste logic but reframes it for brand or freelance work.`,
        body: [
          "1. Product or hero subject in soft morning light.",
          "2. Human gesture shot to keep the piece from feeling sterile.",
          "3. Slow push or glide across the environment.",
          "4. Typography beat that mirrors the emotional line.",
          "5. Closing frame with negative space for CTA or caption.",
          "",
          `Reference anchors: ${refTitles.join(" · ") || "current snapshot only"}.`,
        ].join("\n"),
      },
    ];
  }

  return [
    {
      id: crypto.randomUUID(),
      title: "Personal reel script",
      outputType,
      citations,
      rationale: `Built from the current snapshot and the closest references without depending on an external model.`,
      body: [
        "Hook:",
        `"I keep collecting the same feeling from different people until it finally sounds like me."`,
        "",
        "Body:",
        `This week the pattern feels like ${theme.toLowerCase()} and ${secondaryTheme.toLowerCase()}. The images move slowly, the words stay close to the skin, and everything keeps asking for ${motif.toLowerCase()}. ${briefLine}`,
        "",
        "Close:",
        `"Maybe that's what taste really is. Not what you save, but what keeps returning."`,
      ].join("\n"),
    },
    {
      id: crypto.randomUUID(),
      title: "Client pitch script",
      outputType,
      citations,
      rationale: `Uses the same taste signals but frames them as a concise concept statement.`,
      body: [
        "Opening:",
        `"The direction here is quiet confidence, not loud polish."`,
        "",
        "Core:",
        `We'll borrow the emotional temperature of ${theme.toLowerCase()} and the pacing logic of ${motif.toLowerCase()}. That gives the piece room to feel premium without losing intimacy.`,
        "",
        "Close:",
        `"The result should feel remembered, not merely watched."`,
      ].join("\n"),
    },
  ];
}

function readAllCaptures(root: string): CaptureRecord[] {
  const dir = getAftertastePaths(root).rawCapturesDir;
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => readJson<CaptureRecord>(path.join(dir, file)));
}

function readCapture(root: string, captureId: string): CaptureRecord {
  const filePath = path.join(getAftertastePaths(root).rawCapturesDir, `${captureId}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`capture not found: ${captureId}`);
  }
  return readJson<CaptureRecord>(filePath);
}

function readAnalysis(root: string, captureId: string): AnalysisResult | null {
  const filePath = path.join(getAftertastePaths(root).rawMediaDir, captureId, "analysis.json");
  if (!fs.existsSync(filePath)) return null;
  return readJson<AnalysisResult>(filePath);
}

function clearManagedMarkdown(dir: string): void {
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith(".md")) {
      fs.unlinkSync(path.join(dir, file));
    }
  }
}

function writeIfMissing(filePath: string, content: string): void {
  if (!fs.existsSync(filePath)) {
    writeText(filePath, content);
  }
}

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function writeJson(filePath: string, value: unknown): void {
  writeText(filePath, JSON.stringify(value, null, 2) + "\n");
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function toRel(root: string, fullPath: string): string {
  return path.relative(root, fullPath).split(path.sep).join("/");
}

function formatFrontmatter(data: Record<string, unknown>): string {
  return `---\n${yaml.dump(data, { lineWidth: -1 }).trimEnd()}\n---\n`;
}

function defaultClaudeTemplate(): string {
  return [
    "# Aftertaste Knowledge Base",
    "",
    "> Schema document for a taste-led creator knowledge base. Read together with `wiki/index.md`.",
    "",
    "## Scope",
    "",
    "What this wiki covers:",
    "- Personal creator references saved from Instagram, TikTok, YouTube, screenshots, and notes",
    "- Compiled taste signals: themes, motifs, creators, formats, and weekly snapshots",
    "- Idea generation surfaces that turn recent taste into scripts, hooks, and shot lists",
    "",
    "What this wiki deliberately excludes:",
    "- Team collaboration and shared review workflows",
    "- Platform-level auto-sync assumptions",
    "- Black-box embeddings without a file-backed artifact",
    "",
    "## Notes for the LLM",
    "",
    "- Treat `wiki/references/` as the source for specific references.",
    "- Treat `wiki/snapshots/current.md` as the current taste read.",
    "- Update `wiki/style-constitution.md` slowly and conservatively.",
    "- Keep `wiki/not-me.md` sharp and short.",
    "",
  ].join("\n");
}

function defaultStyleConstitutionPage(): string {
  return [
    "---",
    "title: Style Constitution",
    "type: constitution",
    "---",
    "# Style Constitution",
    "",
    "This page will stabilize as the archive grows.",
    "",
  ].join("\n");
}

function defaultNotMePage(): string {
  return [
    "---",
    "title: Not Me",
    "type: constraint",
    "---",
    "# Not Me",
    "",
    "Use this page to define what is useful to study but wrong to imitate.",
    "",
  ].join("\n");
}

function defaultIndexPage(): string {
  return [
    "# Index — Aftertaste",
    "",
    "> Taste-led creator knowledge base.",
    "",
    "## Navigation",
    "- [[snapshots/current|Current Taste Snapshot]]",
    "",
  ].join("\n");
}

function tagLinks(tags: SignalTag[], folder: string): string {
  if (tags.length === 0) return "None yet";
  return tags.map((tag) => `[[${folder}/${tag.slug}|${tag.label}]]`).join(", ");
}

function ensureTodayLog(logDir: string): void {
  const filePath = path.join(logDir, `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.md`);
  if (!fs.existsSync(filePath)) {
    writeText(filePath, `# ${new Date().toISOString().slice(0, 10)}\n\n`);
  }
}

function appendLog(root: string, entry: string): void {
  const compact = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filePath = path.join(getAftertastePaths(root).logDir, `${compact}.md`);
  ensureTodayLog(getAftertastePaths(root).logDir);
  fs.appendFileSync(filePath, `${entry}\n`, "utf-8");
}

function timeStamp(): string {
  return new Date().toISOString().slice(11, 16);
}

function sortByCreatedDesc(a: { createdAt: string }, b: { createdAt: string }): number {
  return b.createdAt.localeCompare(a.createdAt);
}

function makeCaptureId(): string {
  const now = new Date();
  const compact = now.toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
  return `${compact}-${crypto.randomBytes(2).toString("hex")}`;
}

function weeklySnapshotId(date: Date): string {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const diffDays = Math.floor((date.getTime() - start.getTime()) / 86400000);
  const week = Math.ceil((diffDays + start.getUTCDay() + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max - 1).trimEnd() + "…";
}

function sentenceCase(value: string): string {
  const trimmed = value.trim();
  return trimmed ? trimmed[0]!.toUpperCase() + trimmed.slice(1) : trimmed;
}
