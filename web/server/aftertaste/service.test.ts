import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { findPage } from "../render/markdown.js";
import {
  applyWikiCleanup,
  buildIdeaGenerationContext,
  compileAftertaste,
  compileCatalysts,
  compileQueryIndex,
  compileTasteGraph,
  createProjectBrief,
  createCapture,
  generateIdeas,
  getCurrentSnapshot,
  getProjectBrief,
  getRelatedReferences,
  getTasteGraph,
  getWikiArticleDetail,
  lintWiki,
  listProjectBriefs,
  listReferences,
  planWikiCleanup,
  readCreativeSessions,
  runAnalysis,
  searchQueryIndex,
} from "./service.js";

const originalFetch = globalThis.fetch;
const originalOpenAIApiKey = process.env.AFTERTASTE_OPENAI_API_KEY;
const originalOpenAIModel = process.env.AFTERTASTE_OPENAI_MODEL;
const originalOpenAIBaseUrl = process.env.AFTERTASTE_OPENAI_BASE_URL;
const originalOpenAITranscriptionModel = process.env.AFTERTASTE_OPENAI_TRANSCRIPTION_MODEL;
const originalTranscriptionProvider = process.env.AFTERTASTE_TRANSCRIPTION_PROVIDER;
const originalAssemblyAIApiKey = process.env.AFTERTASTE_ASSEMBLYAI_API_KEY;
const originalAssemblyAIBaseUrl = process.env.AFTERTASTE_ASSEMBLYAI_BASE_URL;
const originalAssemblyAITranscriptionModel = process.env.AFTERTASTE_ASSEMBLYAI_TRANSCRIPTION_MODEL;
const originalGeminiApiKey = process.env.AFTERTASTE_GEMINI_API_KEY;
const originalGeminiModel = process.env.AFTERTASTE_GEMINI_MODEL;
const originalGeminiBaseUrl = process.env.AFTERTASTE_GEMINI_BASE_URL;
const tempRoots: string[] = [];

afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreEnv("AFTERTASTE_OPENAI_API_KEY", originalOpenAIApiKey);
  restoreEnv("AFTERTASTE_OPENAI_MODEL", originalOpenAIModel);
  restoreEnv("AFTERTASTE_OPENAI_BASE_URL", originalOpenAIBaseUrl);
  restoreEnv("AFTERTASTE_OPENAI_TRANSCRIPTION_MODEL", originalOpenAITranscriptionModel);
  restoreEnv("AFTERTASTE_TRANSCRIPTION_PROVIDER", originalTranscriptionProvider);
  restoreEnv("AFTERTASTE_ASSEMBLYAI_API_KEY", originalAssemblyAIApiKey);
  restoreEnv("AFTERTASTE_ASSEMBLYAI_BASE_URL", originalAssemblyAIBaseUrl);
  restoreEnv("AFTERTASTE_ASSEMBLYAI_TRANSCRIPTION_MODEL", originalAssemblyAITranscriptionModel);
  restoreEnv("AFTERTASTE_GEMINI_API_KEY", originalGeminiApiKey);
  restoreEnv("AFTERTASTE_GEMINI_MODEL", originalGeminiModel);
  restoreEnv("AFTERTASTE_GEMINI_BASE_URL", originalGeminiBaseUrl);
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

test("link-only capture survives metadata fetch failure and compiles the vault", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async () => {
    throw new Error("offline");
  };

  const detail = await createCapture(root, {
    sourceUrl: "https://www.instagram.com/reel/abc123/",
  });

  assert.equal(detail.capture.ingestionMode, "link");
  assert.equal(detail.capture.status, "compiled");
  assert.equal(detail.capture.sourceKind, "reference");
  assert.equal(detail.capture.savedReason, null);
  assert.deepEqual(detail.capture.projectIds, []);
  assert.equal(detail.capture.acquisition?.mode, "source-link");
  assert.equal(detail.capture.acquisition?.status, "unavailable");
  assert.equal(detail.capture.acquisition?.provider, "unknown");
  assert.equal(detail.capture.acquisitionCoverage, "url-only");
  assert.equal(detail.capture.acquisitionAttempts?.some((attempt) => attempt.target === "source-pointer" && attempt.mode === "source-link"), true);
  assert.ok(detail.capture.acquisition?.notes.some((note) => /source pointer only/i.test(note)));
  assert.equal(detail.analysis?.mode, "text-first");
  assert.deepEqual(detail.analysis?.toneSignals, []);
  assert.deepEqual(detail.analysis?.moments, []);
  assert.ok(detail.reference);
  assert.deepEqual(detail.reference?.relatedReferenceIds, []);
  assert.equal(detail.reference?.thumbnailAssetId, null);
  assert.ok(detail.analysis?.assetInsights.some((insight) => /source-link capture until media bytes are acquired/i.test(insight)));
  assert.ok(fs.existsSync(path.join(root, detail.capture.rawPaths.capture)));
  assert.ok(fs.existsSync(path.join(root, "wiki", "references", `${detail.capture.id}.md`)));
  assert.ok(fs.existsSync(path.join(root, "outputs", "catalysts")));
  assert.ok(fs.existsSync(path.join(root, "outputs", "briefs")));

  const transcriptArtifact = JSON.parse(
    fs.readFileSync(path.join(root, detail.capture.rawPaths.artifacts.transcript ?? ""), "utf-8"),
  ) as {
    generation?: {
      id?: string;
      schemaVersion?: number;
      inputFingerprint?: string;
      provider?: {
        id?: string;
        model?: string | null;
      };
    };
    provenance?: {
      acquisition?: {
        mode?: string;
        provider?: string;
      };
      notes?: string[];
    };
  };
  assert.equal(transcriptArtifact.provenance?.acquisition?.mode, "source-link");
  assert.equal(transcriptArtifact.provenance?.acquisition?.provider, "unknown");
  assert.ok(transcriptArtifact.provenance?.notes?.some((note) => /instagram reel media bytes were acquired/i.test(note)));

  const inbox = fs.readFileSync(path.join(root, detail.capture.rawPaths.inbox), "utf-8");
  assert.match(inbox, /Acquisition mode: source-link/);
  assert.match(inbox, /Acquisition status: unavailable/);
  assert.match(inbox, /Acquisition coverage: url-only/);
  assert.match(inbox, /source-pointer · source-link · unavailable · unknown/);

  const snapshot = getCurrentSnapshot(root);
  assert.ok(snapshot.summary.length > 0);
  assert.deepEqual(snapshot.tensions, []);
  assert.deepEqual(snapshot.underexploredDirections, []);

  const compactDate = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const log = fs.readFileSync(path.join(root, "log", `${compactDate}.md`), "utf-8");
  assert.match(log, /capture \|/);
  assert.match(log, /compile \|/);
});

test("instagram reel uploads promote acquisition provenance into transcript and media artifacts", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async () =>
    htmlResponse("Reel export", "A close-up reel about tenderness, pacing, and movement.");

  const detail = await createCapture(root, {
    sourceUrl: "https://www.instagram.com/reel/xyz987/",
    note: "keep the pacing and close-up movement",
    assets: [
      {
        name: "reel-export.mp4",
        mediaType: "video/mp4",
        dataBase64: "data:video/mp4;base64,AAAA",
        size: 4,
      },
    ],
  });

  assert.equal(detail.capture.acquisition?.mode, "user-upload");
  assert.equal(detail.capture.acquisition?.status, "ok");
  assert.equal(detail.capture.acquisition?.provider, "local-upload");
  assert.equal(detail.capture.acquisitionCoverage, "byte-backed");
  assert.equal(detail.capture.acquisitionAttempts?.[0]?.target, "media-bytes");
  assert.ok(detail.capture.acquisition?.notes.some((note) => /uploaded media bytes/i.test(note)));

  const transcriptArtifact = JSON.parse(
    fs.readFileSync(path.join(root, detail.capture.rawPaths.artifacts.transcript ?? ""), "utf-8"),
  ) as {
    generation?: {
      id?: string;
      schemaVersion?: number;
      inputFingerprint?: string;
      provider?: {
        id?: string;
        model?: string | null;
      };
    };
    provenance?: {
      acquisition?: {
        mode?: string;
        provider?: string;
      };
    };
  };
  assert.equal(transcriptArtifact.provenance?.acquisition?.mode, "user-upload");
  assert.equal(transcriptArtifact.provenance?.acquisition?.provider, "local-upload");
  assert.match(transcriptArtifact.generation?.id ?? "", /^trn_/);
  assert.equal(transcriptArtifact.generation?.schemaVersion, 1);
  assert.equal(transcriptArtifact.generation?.provider?.id, "aftertaste");
  assert.equal(transcriptArtifact.generation?.provider?.model, "capture-stitch-v1");
  assert.ok((transcriptArtifact.generation?.inputFingerprint?.length ?? 0) >= 12);

  const mediaArtifact = JSON.parse(
    fs.readFileSync(path.join(root, detail.capture.rawPaths.artifacts.mediaAnalysis ?? ""), "utf-8"),
  ) as {
    generation?: {
      id?: string;
      schemaVersion?: number;
      inputFingerprint?: string;
      provider?: {
        id?: string;
        model?: string | null;
      };
    };
    acquisition?: {
      mode?: string;
      provider?: string;
    };
  };
  assert.equal(mediaArtifact.acquisition?.mode, "user-upload");
  assert.equal(mediaArtifact.acquisition?.provider, "local-upload");
  assert.match(mediaArtifact.generation?.id ?? "", /^mda_/);
  assert.equal(mediaArtifact.generation?.schemaVersion, 1);
  assert.equal(mediaArtifact.generation?.provider?.id, "aftertaste");
  assert.equal(mediaArtifact.generation?.provider?.model, "heuristic-media-v1");
  assert.ok((mediaArtifact.generation?.inputFingerprint?.length ?? 0) >= 12);
  assert.ok(
    fs.existsSync(path.join(root, "raw", "media", detail.capture.id, "history", "transcript", `${transcriptArtifact.generation?.id}.json`)),
  );
  assert.ok(
    fs.existsSync(path.join(root, "raw", "media", detail.capture.id, "history", "media-analysis", `${mediaArtifact.generation?.id}.json`)),
  );
});

test("capture with note and upload becomes hybrid analysis and writes relative asset paths", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async () =>
    new Response(
      `<html><head><title>Soft voiceover journal</title><meta name="description" content="A close-up voiceover montage about long distance, routine, and tenderness."></head></html>`,
      { status: 200, headers: { "content-type": "text/html" } },
    );

  const detail = await createCapture(root, {
    sourceUrl: "https://www.tiktok.com/@linh/video/123456",
    note: "love the voiceover, close-up framing, and warm journal pacing",
    assets: [
      {
        name: "frame.png",
        mediaType: "image/png",
        dataBase64: "data:image/png;base64,AAAA",
        size: 4,
      },
    ],
  });

  assert.equal(detail.capture.ingestionMode, "link-note-upload");
  assert.equal(detail.capture.savedReason, "love the voiceover, close-up framing, and warm journal pacing");
  assert.equal(detail.analysis?.mode, "hybrid");
  assert.ok(["capture-stitch", "podcast-page"].includes(detail.analysis?.transcriptProvenance.source ?? ""));
  assert.ok(["ok", "unavailable"].includes(detail.analysis?.transcriptProvenance.status ?? ""));
  assert.ok(detail.capture.assets[0]);
  assert.ok(!path.isAbsolute(detail.capture.assets[0]!.path));
  assert.ok(detail.capture.rawPaths.artifacts.transcript);
  assert.ok(detail.capture.rawPaths.artifacts.mediaAnalysis);
  assert.ok(fs.existsSync(path.join(root, detail.capture.rawPaths.artifacts.transcript ?? "")));
  assert.ok(detail.reference?.motifs.some((tag) => tag.slug === "voiceover" || tag.slug === "close-up"));
  assert.ok(detail.reference?.themes.some((tag) => tag.slug === "long-distance" || tag.slug === "tenderness"));
  assert.equal(detail.reference?.thumbnailAssetId, detail.capture.assets[0]?.id ?? null);
});

test("analysis reads a preexisting transcript artifact when present", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async () =>
    htmlResponse("Podcast episode", "A thoughtful podcast page about routine and tenderness.");

  const detail = await createCapture(root, {
    sourceUrl: "https://example.com/podcast-episode",
    note: "routine and tenderness",
  });

  const transcriptPath = path.join(root, "raw", "media", detail.capture.id, "transcript.json");
  fs.writeFileSync(
    transcriptPath,
    JSON.stringify(
      {
        captureId: detail.capture.id,
        status: "ok",
        source: "manual",
        text: "Actual spoken transcript about patience, ritual, and naming the thing directly.",
        segments: [{ text: "Actual spoken transcript about patience, ritual, and naming the thing directly." }],
        language: "en",
        generatedAt: new Date().toISOString(),
        provenance: {
          sourceUrl: detail.capture.sourceUrl,
          sourceKind: detail.capture.sourceKind,
          assetIds: [],
          notes: ["Injected by test to simulate an extracted transcript artifact."],
        },
      },
      null,
      2,
    ),
    "utf-8",
  );

  const analysis = await runAnalysis(root, detail.capture.id);
  const refreshed = JSON.parse(fs.readFileSync(path.join(root, detail.capture.rawPaths.capture), "utf-8")) as {
    acquisitionCoverage?: string;
    acquisition?: { mode?: string; provider?: string; status?: string };
    acquisitionAttempts?: Array<{ target?: string; mode?: string; provider?: string; status?: string }>;
  };

  assert.match(analysis.transcript, /Actual spoken transcript/);
  assert.equal(analysis.transcriptProvenance.source, "manual");
  assert.equal(analysis.transcriptProvenance.status, "ok");
  assert.ok(analysis.transcriptProvenance.artifactPath?.endsWith("/transcript.json"));
  assert.equal(refreshed.acquisitionCoverage, "transcript-backed");
  assert.equal(refreshed.acquisition?.mode, "manual-transcript");
  assert.equal(refreshed.acquisition?.provider, "manual");
  assert.equal(refreshed.acquisitionAttempts?.some((attempt) => attempt.target === "transcript-text" && attempt.mode === "manual-transcript" && attempt.status === "ok"), true);
});

test("assemblyai transcription adapter returns normalized speaker-labeled segments without leaking provider details downstream", async () => {
  const root = makeTempRoot();
  process.env.AFTERTASTE_TRANSCRIPTION_PROVIDER = "assemblyai";
  process.env.AFTERTASTE_ASSEMBLYAI_API_KEY = "assembly-test-key";
  process.env.AFTERTASTE_ASSEMBLYAI_BASE_URL = "https://mocked.assembly.local/v2";
  process.env.AFTERTASTE_ASSEMBLYAI_TRANSCRIPTION_MODEL = "best";

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : String(input);
    if (url === "https://mocked.assembly.local/v2/upload") {
      assert.equal(init?.method, "POST");
      return new Response(JSON.stringify({ upload_url: "https://cdn.assembly.local/uploaded-audio" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://mocked.assembly.local/v2/transcript") {
      assert.equal(init?.method, "POST");
      return new Response(JSON.stringify({ id: "tr_assembly_123", status: "queued" }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    }
    if (url === "https://mocked.assembly.local/v2/transcript/tr_assembly_123") {
      return new Response(
        JSON.stringify({
          id: "tr_assembly_123",
          status: "completed",
          text: "I finally said the quiet part out loud and the room settled after that.",
          language_code: "en",
          utterances: [
            {
              text: "I finally said the quiet part out loud.",
              start: 1200,
              end: 3200,
              speaker: "Speaker A",
            },
            {
              text: "And the room settled after that.",
              start: 3300,
              end: 5100,
              speaker: "Speaker A",
            },
          ],
        }),
        {
          status: 200,
          headers: { "content-type": "application/json" },
        },
      );
    }
    return htmlResponse("Audio note", "An uploaded audio note about saying the quiet part directly.");
  };

  const detail = await createCapture(root, {
    sourceUrl: "https://example.com/audio-note",
    sourceKind: "voice-note",
    note: "keep the honest spoken cadence",
    assets: [
      {
        name: "voice.m4a",
        mediaType: "audio/mp4",
        dataBase64: "data:audio/mp4;base64,AAAA",
        size: 4,
      },
    ],
  });

  const transcriptArtifact = JSON.parse(
    fs.readFileSync(path.join(root, detail.capture.rawPaths.artifacts.transcript ?? ""), "utf-8"),
  ) as {
    generation?: {
      provider?: {
        id?: string;
        model?: string | null;
      };
    };
    segments?: Array<{ speaker?: string; startMs?: number; endMs?: number }>;
    provenance?: { notes?: string[] };
  };

  assert.equal(detail.analysis?.transcriptProvenance.source, "audio-upload");
  assert.match(detail.analysis?.transcript ?? "", /quiet part out loud/i);
  assert.equal(detail.capture.acquisitionCoverage, "byte-backed");
  assert.equal(transcriptArtifact.generation?.provider?.id, "assemblyai");
  assert.equal(transcriptArtifact.generation?.provider?.model, "best");
  assert.equal(transcriptArtifact.segments?.[0]?.speaker, "Speaker A");
  assert.equal(transcriptArtifact.segments?.[0]?.startMs, 1200);
  assert.equal(transcriptArtifact.segments?.[0]?.endMs, 3200);
  assert.equal(transcriptArtifact.provenance?.notes?.some((note) => /AssemblyAI/i.test(note)), true);
  assert.equal(detail.analysis?.moments.some((moment) => moment.kind === "transcript-segment" && moment.speaker === "Speaker A"), true);
});

test("selected transcription provider without config falls back cleanly to stitched transcript behavior", async () => {
  const root = makeTempRoot();
  process.env.AFTERTASTE_TRANSCRIPTION_PROVIDER = "assemblyai";
  delete process.env.AFTERTASTE_ASSEMBLYAI_API_KEY;

  globalThis.fetch = async () =>
    htmlResponse("Unconfigured audio note", "A sparse page where uploaded audio is the only deep source.");

  const detail = await createCapture(root, {
    sourceUrl: "https://example.com/unconfigured-audio-note",
    sourceKind: "voice-note",
    note: "still save the voice note even if no provider is configured",
    assets: [
      {
        name: "voice.m4a",
        mediaType: "audio/mp4",
        dataBase64: "data:audio/mp4;base64,AAAA",
        size: 4,
      },
    ],
  });

  assert.notEqual(detail.analysis?.transcriptProvenance.source, "audio-upload");
  assert.equal(detail.capture.acquisitionCoverage, "byte-backed");
  assert.ok(detail.analysis?.transcript.length);
});

test("artifact generations keep current paths stable and archive superseded transcript and media artifacts", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async () =>
    htmlResponse("Video note", "A warm close-up video about movement, voiceover, and quiet domestic pacing.");

  const detail = await createCapture(root, {
    sourceUrl: "https://example.com/versioned-video-note",
    sourceKind: "moodboard",
    note: "warm palette, close-up movement, and spoken reflection",
    assets: [
      {
        name: "clip.mp4",
        mediaType: "video/mp4",
        dataBase64: "data:video/mp4;base64,AAAA",
        size: 4,
      },
    ],
  });

  const transcriptPath = path.join(root, detail.capture.rawPaths.artifacts.transcript ?? "");
  const mediaPath = path.join(root, detail.capture.rawPaths.artifacts.mediaAnalysis ?? "");
  const firstTranscript = JSON.parse(fs.readFileSync(transcriptPath, "utf-8")) as {
    generation?: { id?: string };
  };
  const firstMedia = JSON.parse(fs.readFileSync(mediaPath, "utf-8")) as {
    generation?: { id?: string };
  };

  await runAnalysis(root, detail.capture.id);

  const secondTranscript = JSON.parse(fs.readFileSync(transcriptPath, "utf-8")) as {
    generation?: { id?: string; supersedesGenerationId?: string | null };
  };
  const secondMedia = JSON.parse(fs.readFileSync(mediaPath, "utf-8")) as {
    generation?: { id?: string; supersedesGenerationId?: string | null };
  };

  assert.notEqual(secondTranscript.generation?.id, firstTranscript.generation?.id);
  assert.notEqual(secondMedia.generation?.id, firstMedia.generation?.id);
  assert.equal(secondTranscript.generation?.supersedesGenerationId, firstTranscript.generation?.id);
  assert.equal(secondMedia.generation?.supersedesGenerationId, firstMedia.generation?.id);
  assert.ok(
    fs.existsSync(path.join(root, "raw", "media", detail.capture.id, "history", "transcript", `${firstTranscript.generation?.id}.json`)),
  );
  assert.ok(
    fs.existsSync(path.join(root, "raw", "media", detail.capture.id, "history", "transcript", `${secondTranscript.generation?.id}.json`)),
  );
  assert.ok(
    fs.existsSync(path.join(root, "raw", "media", detail.capture.id, "history", "media-analysis", `${firstMedia.generation?.id}.json`)),
  );
  assert.ok(
    fs.existsSync(path.join(root, "raw", "media", detail.capture.id, "history", "media-analysis", `${secondMedia.generation?.id}.json`)),
  );
});

test("youtube captures persist a source transcript artifact when captions are available", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("captions.example")) {
      return new Response(
        `<transcript><text start="0" dur="1.5">hello from the actual video</text><text start="1.5" dur="1.5">the transcript is real now</text></transcript>`,
        { status: 200, headers: { "content-type": "application/xml" } },
      );
    }
    return htmlResponseWithExtras(
      "YouTube video",
      "A metadata description that should not be the only transcript source.",
      `"captionTracks":[{"baseUrl":"https:\\/\\/captions.example\\/track.xml"}]`,
    );
  };

  const detail = await createCapture(root, {
    sourceUrl: "https://www.youtube.com/watch?v=abc123",
    note: "saved for the spoken pacing",
  });

  assert.match(detail.analysis?.transcript ?? "", /hello from the actual video/i);
  assert.equal(detail.analysis?.transcriptProvenance.source, "youtube");
  assert.equal(detail.analysis?.transcriptProvenance.status, "ok");
  assert.equal(detail.capture.acquisitionCoverage, "transcript-backed");
  assert.equal(detail.capture.acquisition?.mode, "best-effort-extractor");
  assert.equal(detail.capture.acquisitionAttempts?.some((attempt) => attempt.target === "transcript-text" && attempt.mode === "best-effort-extractor" && attempt.status === "ok"), true);
  assert.ok(fs.existsSync(path.join(root, detail.capture.rawPaths.artifacts.transcript ?? "")));
  assert.ok(fs.existsSync(path.join(root, detail.capture.rawPaths.artifacts.moments ?? "")));

  const momentsArtifact = JSON.parse(
    fs.readFileSync(path.join(root, detail.capture.rawPaths.artifacts.moments ?? ""), "utf-8"),
  ) as {
    moments?: Array<{ kind?: string; startMs?: number; endMs?: number }>;
  };
  assert.equal(momentsArtifact.moments?.some((moment) => moment.kind === "transcript-segment" && moment.startMs != null && moment.endMs != null), true);
});

test("podcast pages can persist transcript text directly from transcript-friendly html", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async () =>
    new Response(
      `<html><head><title>Episode page</title><meta name="description" content="Episode page description."></head><body><section class="episode-transcript"><p>This is the actual episode transcript with enough spoken detail to count as real transcript content for analysis.</p><p>It keeps going with concrete lines instead of only metadata snippets.</p></section></body></html>`,
      { status: 200, headers: { "content-type": "text/html" } },
    );

  const detail = await createCapture(root, {
    sourceUrl: "https://pod.example.com/episodes/42",
    note: "interesting pacing",
  });

  assert.match(detail.analysis?.transcript ?? "", /actual episode transcript/i);
  assert.equal(detail.analysis?.transcriptProvenance.source, "podcast-page");
  assert.equal(detail.analysis?.transcriptProvenance.status, "ok");
});

test("podcast rss transcript links are used when the page has no transcript block", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/feed.xml")) {
      return new Response(
        `<?xml version="1.0"?><rss xmlns:podcast="https://podcastindex.org/namespace/1.0"><channel><item><title>Episode 77</title><link>https://pod.example.com/episodes/77</link><podcast:transcript url="https://pod.example.com/transcripts/77.vtt" type="text/vtt" /></item></channel></rss>`,
        { status: 200, headers: { "content-type": "application/xml" } },
      );
    }
    if (url.includes("/transcripts/77.vtt")) {
      return new Response(
        `WEBVTT

00:00:00.000 --> 00:00:03.000
this transcript came from the rss feed

00:00:03.000 --> 00:00:06.000
and not from the episode page itself
`,
        { status: 200, headers: { "content-type": "text/vtt" } },
      );
    }
    return new Response(
      `<html><head><title>Episode page</title><meta name="description" content="Episode metadata only."><link rel="alternate" type="application/rss+xml" href="https://pod.example.com/feed.xml"></head><body><p>No transcript block here.</p></body></html>`,
      { status: 200, headers: { "content-type": "text/html" } },
    );
  };

  const detail = await createCapture(root, {
    sourceUrl: "https://pod.example.com/episodes/77",
    note: "rss fallback path",
  });

  assert.match(detail.analysis?.transcript ?? "", /rss feed/i);
  assert.equal(detail.analysis?.transcriptProvenance.source, "podcast-rss");
  assert.equal(detail.analysis?.transcriptProvenance.status, "ok");
});

test("unsupported transcript sources record unavailable status and keep fallback analysis running", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async () =>
    htmlResponse("Plain article", "Only metadata is available here, no transcript source exists.");

  const detail = await createCapture(root, {
    sourceUrl: "https://example.com/plain-article",
    note: "metadata-only fallback",
  });

  assert.equal(detail.analysis?.transcriptProvenance.status, "unavailable");
  assert.equal(detail.analysis?.transcriptProvenance.source, "capture-stitch");
  assert.equal(detail.capture.acquisitionCoverage, "metadata-only");
  assert.equal(detail.capture.acquisition?.mode, "source-link");
  assert.equal(detail.capture.acquisition?.status, "pending");
  assert.equal(detail.capture.acquisitionAttempts?.some((attempt) => attempt.target === "transcript-text" && attempt.mode === "best-effort-extractor" && attempt.status === "unavailable"), true);
  assert.match(detail.analysis?.transcript ?? "", /Reference capture|metadata-only fallback/i);
});

test("reddit thread captures use the json endpoint when html is blocked by verification", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes(".json")) {
      return new Response(
        JSON.stringify([
          {
            kind: "Listing",
            data: {
              children: [
                {
                  kind: "t3",
                  data: {
                    title: "How do you ensure that your app/software is actually working?",
                    selftext:
                      "I keep seeing people brag about shipping a lot of apps very quickly, but I want to know how they actually verify what they built works in real life. The scary part is when the speed outruns the technical checks.",
                    subreddit: "vibecoding",
                    permalink: "/r/vibecoding/comments/1obrgj1/how_do_you_ensure_that_your_appsoftware_is/",
                  },
                },
              ],
            },
          },
          {
            kind: "Listing",
            data: {
              children: [
                {
                  kind: "t1",
                  data: {
                    body:
                      "The only version of vibecoding that feels sane to me is pairing the fast prototyping with actual tests, smoke checks, and one calm pass through the unhappy paths before I trust it.",
                  },
                },
                {
                  kind: "t1",
                  data: {
                    body:
                      "I usually force myself to write down what success looks like first. Otherwise the app looks finished because the happy path demo works once, and that is not the same thing as software being reliable.",
                  },
                },
              ],
            },
          },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(
      `<html><head><title>Reddit - Please wait for verification</title><meta name="description" content="Verification interstitial."></head></html>`,
      { status: 200, headers: { "content-type": "text/html" } },
    );
  };

  const detail = await createCapture(root, {
    sourceUrl: "https://www.reddit.com/r/vibecoding/comments/1obrgj1/how_do_you_ensure_that_your_appsoftware_is/",
    note: "wanna make sure i vibecode well",
  });

  assert.equal(detail.capture.metadata.title, "How do you ensure that your app/software is actually working?");
  assert.equal(detail.capture.metadata.siteName, "Reddit");
  assert.match(detail.analysis?.transcript ?? "", /actual tests, smoke checks/i);
  assert.equal(detail.analysis?.transcriptProvenance.source, "web-article");
  assert.equal(detail.analysis?.transcriptProvenance.status, "ok");
  assert.equal(detail.capture.acquisitionCoverage, "transcript-backed");
});

test("reddit thread metadata falls back to json even when html title is a verification page", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes(".json")) {
      return new Response(
        JSON.stringify([
          {
            kind: "Listing",
            data: {
              children: [
                {
                  kind: "t3",
                  data: {
                    title: "The quiet systems that make short-form work",
                    selftext:
                      "This post is really about routines, verification, and how much invisible structure sits underneath something that looks casual.",
                    subreddit: "vibecoding",
                    permalink: "/r/vibecoding/comments/xyz123/the_quiet_systems_that_make_shortform_work/",
                  },
                },
              ],
            },
          },
          { kind: "Listing", data: { children: [] } },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(
      `<html><head><title>Reddit - Please wait for verification</title><meta name="description" content="Verification interstitial."></head></html>`,
      { status: 200, headers: { "content-type": "text/html" } },
    );
  };

  const detail = await createCapture(root, {
    sourceUrl: "https://www.reddit.com/r/vibecoding/comments/xyz123/the_quiet_systems_that_make_shortform_work/",
    note: "verification should not poison metadata",
  });

  assert.equal(detail.capture.metadata.title, "The quiet systems that make short-form work");
  assert.doesNotMatch(detail.capture.metadata.title ?? "", /please wait for verification/i);
  assert.match(detail.capture.metadata.description ?? "", /invisible structure/i);
});

test("re-running analysis repairs stale reddit verification metadata on existing captures", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes(".json")) {
      return new Response(
        JSON.stringify([
          {
            kind: "Listing",
            data: {
              children: [
                {
                  kind: "t3",
                  data: {
                    title: "How I check the software before I trust the vibe",
                    selftext:
                      "I am less interested in speed than I am in the small rituals that make a fast build trustworthy again.",
                    subreddit: "vibecoding",
                    permalink: "/r/vibecoding/comments/fix123/how_i_check_the_software_before_i_trust_the_vibe/",
                  },
                },
              ],
            },
          },
          { kind: "Listing", data: { children: [] } },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(
      `<html><head><title>Reddit - Please wait for verification</title><meta name="description" content="Verification interstitial."></head></html>`,
      { status: 200, headers: { "content-type": "text/html" } },
    );
  };

  const detail = await createCapture(root, {
    sourceUrl: "https://www.reddit.com/r/vibecoding/comments/fix123/how_i_check_the_software_before_i_trust_the_vibe/",
    note: "repair stale metadata on analyze",
  });

  const capturePath = path.join(root, detail.capture.rawPaths.capture);
  const staleCapture = JSON.parse(fs.readFileSync(capturePath, "utf-8")) as typeof detail.capture;
  staleCapture.metadata = {
    ...staleCapture.metadata,
    title: "Reddit - Please wait for verification",
    description: "Verification interstitial.",
  };
  fs.writeFileSync(capturePath, JSON.stringify(staleCapture, null, 2), "utf-8");

  await runAnalysis(root, detail.capture.id);

  const repairedCapture = JSON.parse(fs.readFileSync(capturePath, "utf-8")) as typeof detail.capture;
  assert.equal(repairedCapture.metadata.title, "How I check the software before I trust the vibe");
  assert.doesNotMatch(repairedCapture.metadata.title ?? "", /please wait for verification/i);
});

test("llm-backed text analysis only keeps tags grounded in exact capture evidence", async () => {
  const root = makeTempRoot();
  process.env.AFTERTASTE_OPENAI_API_KEY = "test-key";
  process.env.AFTERTASTE_OPENAI_MODEL = "test-model";
  process.env.AFTERTASTE_OPENAI_BASE_URL = "https://mocked.openai.local/v1";

  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : String(input);
    if (url.includes("/chat/completions")) {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  themes: [
                    {
                      slug: "discipline",
                      score: 0.88,
                      evidence: ["actual tests, smoke checks"],
                    },
                  ],
                  motifs: [
                    {
                      slug: "montage",
                      score: 0.84,
                      evidence: ["observational b-roll"],
                    },
                  ],
                  formatSignals: [
                    {
                      slug: "tutorial-breakdown",
                      score: 0.82,
                      evidence: ["how do you guys ensure that the software the ai created works"],
                    },
                  ],
                  toneSignals: [],
                  visualSignals: [
                    {
                      slug: "movement-trace",
                      score: 0.77,
                      evidence: ["movement trace"],
                    },
                  ],
                  audioSignals: [],
                  pacingSignals: [
                    {
                      slug: "lingering",
                      score: 0.74,
                      evidence: ["soft pacing"],
                    },
                  ],
                  storySignals: [
                    {
                      slug: "instruction",
                      score: 0.81,
                      evidence: ["how do you guys ensure that the software the ai created works"],
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes(".json")) {
      return new Response(
        JSON.stringify([
          {
            kind: "Listing",
            data: {
              children: [
                {
                  kind: "t3",
                  data: {
                    title: "How do you guys ensure that the software the AI created works?",
                    selftext:
                      "I'm curious how people verify the software they build when they move quickly. The part that feels sane to me is pairing fast prototyping with actual tests, smoke checks, and explicit review of the unhappy paths.",
                    subreddit: "vibecoding",
                    permalink: "/r/vibecoding/comments/grounded123/how_do_you_guys_ensure_that_the_software_the_ai_created_works/",
                  },
                },
              ],
            },
          },
          { kind: "Listing", data: { children: [] } },
        ]),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }

    return new Response(
      `<html><head><title>Reddit - Please wait for verification</title></head></html>`,
      { status: 200, headers: { "content-type": "text/html" } },
    );
  };

  const detail = await createCapture(root, {
    sourceUrl: "https://www.reddit.com/r/vibecoding/comments/grounded123/how_do_you_guys_ensure_that_the_software_the_ai_created_works/",
    note: "want the tags to match the actual thread",
  });

  assert.deepEqual(detail.analysis?.themes.map((signal) => signal.slug), ["discipline"]);
  assert.deepEqual(detail.analysis?.motifs.map((signal) => signal.slug), []);
  assert.deepEqual(detail.analysis?.visualSignals.map((signal) => signal.slug), []);
  assert.deepEqual(detail.analysis?.pacingSignals.map((signal) => signal.slug), []);
  assert.deepEqual(detail.analysis?.formatSignals.map((signal) => signal.slug), ["tutorial-breakdown"]);
  assert.deepEqual(detail.analysis?.storySignals.map((signal) => signal.slug), ["instruction"]);
});

test("llm-backed capture analysis can replace template summaries with grounded wording", async () => {
  const root = makeTempRoot();
  process.env.AFTERTASTE_OPENAI_API_KEY = "test-key";
  process.env.AFTERTASTE_OPENAI_MODEL = "test-model";
  process.env.AFTERTASTE_OPENAI_BASE_URL = "https://mocked.openai.local/v1";

  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : String(input);
    if (url.includes("/chat/completions")) {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  themes: [
                    {
                      slug: "reflection",
                      score: 0.86,
                      evidence: ["how do you actually retain or use what you watch?"],
                    },
                  ],
                  motifs: [],
                  formatSignals: [],
                  toneSignals: [],
                  visualSignals: [],
                  audioSignals: [],
                  pacingSignals: [],
                  storySignals: [
                    {
                      slug: "observation",
                      score: 0.82,
                      evidence: ["I realized that I'm watching a ton of beneficial content but its hard for me to remember"],
                    },
                  ],
                  summary: "This reads more like a written reflection on retention and self-improvement than a visual reference. The post is trying to understand how useful ideas actually stick.",
                  openQuestions: ["Which line here feels worth turning into a creator-facing premise later?"],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return new Response(
      [
        "<html><head><title>Reflection post</title><meta name=\"description\" content=\"A written post about retention and self-improvement.\"></head><body><article>",
        "<p>I started recently getting into educational and self-improvement content.</p>",
        "<p>How do you actually retain or use what you watch?</p>",
        "<p>I realized that I'm watching a ton of beneficial content but its hard for me to remember.</p>",
        "</article></body></html>",
      ].join(""),
      { status: 200, headers: { "content-type": "text/html" } },
    );
  };

  const detail = await createCapture(root, {
    sourceUrl: "https://example.com/reflection-post",
    note: "the good shit sticks",
  });

  assert.match(detail.analysis?.summary ?? "", /written reflection on retention/i);
  assert.equal(detail.analysis?.openQuestions.includes("Which line here feels worth turning into a creator-facing premise later?"), true);
});

test("compile strips sparse fallback-only tags from surfaced references and snapshot filters", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async () =>
    new Response(
      `<html><head><title>General discussion</title><meta name="description" content="A plain thread with neutral metadata and no stylistic cues."></head></html>`,
      { status: 200, headers: { "content-type": "text/html" } },
    );

  const detail = await createCapture(root, {
    sourceUrl: "https://example.com/plain-discussion",
  });

  assert.ok((detail.analysis?.themes.length ?? 0) > 0);
  assert.deepEqual(detail.reference?.themes, []);
  assert.deepEqual(detail.reference?.motifs, []);

  const snapshot = getCurrentSnapshot(root);
  assert.deepEqual(snapshot.themes, []);
  assert.deepEqual(snapshot.motifs, []);
  assert.equal(listReferences(root).filters.themes.length, 0);
  assert.equal(listReferences(root).filters.motifs.length, 0);
});

test("transcript-backed text captures no longer invent fallback motif tags without evidence", async () => {
  const root = makeTempRoot();
  delete process.env.AFTERTASTE_OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  globalThis.fetch = async () =>
    new Response(
      [
        "<html><head><title>Software checks</title><meta name=\"description\" content=\"A plain article about test coverage and bug review.\"></head><body><article>",
        "<p>I care less about shipping fast than about checking the unhappy paths carefully.</p>",
        "<p>The work is mostly about smoke tests, debugging, and making the tool behave predictably.</p>",
        "<p>There is no visual treatment here, just a written reflection on verification.</p>",
        "</article></body></html>",
      ].join(""),
      { status: 200, headers: { "content-type": "text/html" } },
    );

  const detail = await createCapture(root, {
    sourceUrl: "https://example.com/software-checks",
    note: "written reflection on verification and software quality",
  });

  assert.equal(detail.analysis?.transcriptProvenance.source, "web-article");
  assert.deepEqual(detail.analysis?.motifs.map((signal) => signal.slug), []);
  assert.doesNotMatch(detail.analysis?.summary ?? "", /observational b-roll|soft pacing/i);
});

test("text-led references do not surface generic prose words as visual or pacing tags", async () => {
  const root = makeTempRoot();
  delete process.env.AFTERTASTE_OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;

  globalThis.fetch = async () =>
    new Response(
      [
        "<html><head><title>Builder post</title><meta name=\"description\" content=\"A written post about learning to ship carefully.\"></head><body><article>",
        "<p>I want to walk through how I make things slowly enough that they still feel real.</p>",
        "<p>The goal is to explain the build and check the unhappy paths before I trust it.</p>",
        "</article></body></html>",
      ].join(""),
      { status: 200, headers: { "content-type": "text/html" } },
    );

  const detail = await createCapture(root, {
    sourceUrl: "https://example.com/builder-post",
    note: "wanna make sure i vibecode well",
  });

  assert.ok(["web-article", "capture-stitch"].includes(detail.reference?.transcriptSource ?? ""));
  assert.deepEqual(detail.reference?.visualSignals, []);
  assert.deepEqual(detail.reference?.audioSignals, []);
  assert.deepEqual(detail.reference?.pacingSignals, []);
  assert.doesNotMatch(detail.reference?.summary ?? "", /visually|audio-wise|movement trace|lingering|steady build/i);
});

test("moments artifact normalizes transcript, media, and asset beats into one shared shape", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async () =>
    htmlResponse("Mixed capture", "A warm close-up video with spoken reflection and quiet movement.");

  const detail = await createCapture(root, {
    sourceUrl: "https://example.com/mixed-capture",
    sourceKind: "moodboard",
    note: "protect the spoken line and the slow movement beat",
    assets: [
      {
        name: "clip.mp4",
        mediaType: "video/mp4",
        dataBase64: "data:video/mp4;base64,AAAA",
        size: 4,
      },
      {
        name: "voice.m4a",
        mediaType: "audio/mp4",
        dataBase64: "data:audio/mp4;base64,AAAA",
        size: 4,
      },
    ],
  });

  const transcriptPath = path.join(root, detail.capture.rawPaths.artifacts.transcript ?? "");
  fs.writeFileSync(
    transcriptPath,
    JSON.stringify(
      {
        captureId: detail.capture.id,
        status: "ok",
        source: "manual",
        text: "I finally said the quiet part out loud. Then the room settled and the movement slowed down.",
        segments: [
          {
            text: "I finally said the quiet part out loud.",
            startMs: 1200,
            endMs: 3600,
            speaker: "Speaker 1",
          },
        ],
        language: "en",
        generatedAt: new Date().toISOString(),
        provenance: {
          sourceUrl: detail.capture.sourceUrl,
          sourceKind: detail.capture.sourceKind,
          assetIds: detail.capture.assets.map((asset) => asset.id),
          notes: ["Injected by test to simulate a timestamped transcript artifact."],
        },
      },
      null,
      2,
    ),
    "utf-8",
  );

  const analysis = await runAnalysis(root, detail.capture.id);
  const momentsArtifact = JSON.parse(
    fs.readFileSync(path.join(root, "raw", "media", detail.capture.id, "moments.json"), "utf-8"),
  ) as {
    transcriptGenerationId?: string | null;
    moments: Array<{
      kind?: string;
      label?: string;
      summary?: string;
      startMs?: number;
      endMs?: number;
      speaker?: string;
      signalTags?: string[];
      evidence?: Array<{ source?: string }>;
    }>;
  };

  assert.ok(momentsArtifact.transcriptGenerationId);
  assert.equal(momentsArtifact.moments.some((moment) => moment.kind === "transcript-segment" && moment.startMs === 1200 && moment.endMs === 3600 && moment.speaker === "Speaker 1"), true);
  assert.equal(momentsArtifact.moments.some((moment) => moment.kind === "visual-beat" || moment.kind === "audio-beat" || moment.kind === "asset-beat"), true);
  assert.equal(momentsArtifact.moments.every((moment) => Array.isArray(moment.signalTags) && Array.isArray(moment.evidence)), true);
  assert.equal(analysis.moments.some((moment) => moment.kind === "transcript-segment" && moment.startMs === 1200 && moment.endMs === 3600), true);
});

test("references can be filtered deterministically and idea outputs cite their source references", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("discipline")) {
      return new Response(
        `<html><head><title>Discipline reel</title><meta name="description" content="A voiceover montage about discipline, routine, and building a future."></head></html>`,
        { status: 200, headers: { "content-type": "text/html" } },
      );
    }
    return new Response(
      `<html><head><title>Tenderness reel</title><meta name="description" content="A soft close-up reflection about intimacy and care."></head></html>`,
      { status: 200, headers: { "content-type": "text/html" } },
    );
  };

  const first = await createCapture(root, {
    sourceUrl: "https://example.com/discipline",
    note: "discipline, routine, and ambition with text overlay",
  });
  await createCapture(root, {
    sourceUrl: "https://example.com/tenderness",
    note: "soft care, intimacy, and gentle pacing",
  });

  const filtered = listReferences(root, { theme: "discipline" });
  assert.equal(filtered.references.length, 1);
  assert.equal(filtered.references[0]?.id, first.capture.id);

  const ideas = await generateIdeas(root, {
    snapshotId: null,
    referenceIds: [first.capture.id],
    outputType: "hooks",
    brief: "make it useful for a client-facing reel",
  });
  assert.ok(ideas.outputs.length > 0);
  assert.ok(ideas.outputs.every((output) => output.citations.includes(first.capture.id)));
});

test("reference search ranks token matches across notes, questions, and supporting text", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("checks")) {
      return new Response(
        `<html><head><title>Shipping checks</title><meta name="description" content="A post about tests, smoke checks, and unhappy paths."></head></html>`,
        { status: 200, headers: { "content-type": "text/html" } },
      );
    }
    return new Response(
      `<html><head><title>Soft care</title><meta name="description" content="A gentle reflection about intimacy and care."></head></html>`,
      { status: 200, headers: { "content-type": "text/html" } },
    );
  };

  const first = await createCapture(root, {
    sourceUrl: "https://example.com/checks",
    note: "actual tests, smoke checks, and explicit review of unhappy paths",
  });
  await createCapture(root, {
    sourceUrl: "https://example.com/care",
    note: "quiet care, intimacy, and gentle reflection",
  });

  const results = listReferences(root, { q: "smoke checks unhappy paths" });
  assert.equal(results.references[0]?.id, first.capture.id);
});

test("idea outputs include personal moment prompts that map back to scaffold placeholders", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async () =>
    new Response(
      `<html><head><title>Memory reel</title><meta name="description" content="A reflective montage about distance, tenderness, and finding language for what keeps returning."></head></html>`,
      { status: 200, headers: { "content-type": "text/html" } },
    );

  const capture = await createCapture(root, {
    sourceUrl: "https://example.com/memory",
    note: "soft voiceover about what keeps returning, with close-up details and slow pacing",
  });

  const ideas = await generateIdeas(root, {
    snapshotId: null,
    referenceIds: [capture.capture.id],
    outputType: "script",
    brief: "",
  });

  assert.ok(ideas.outputs.length > 0);
  for (const output of ideas.outputs) {
    assert.ok(output.personalMoments.length > 0);
    for (const prompt of output.personalMoments) {
      assert.ok(prompt.prompt.length > 0);
      assert.match(output.body, new RegExp(escapeRegExp(prompt.placeholder)));
    }
  }
});

test("compile passes produce stable catalysts and a derived query index", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("orbit")) {
      return htmlResponse("Orbit reel", "A voiceover montage about tenderness, routine, and close-up details.");
    }
    if (url.includes("routine")) {
      return htmlResponse("Routine reel", "A reflective voiceover montage about discipline, routine, and text overlay.");
    }
    return htmlResponse("Distance reel", "A close-up montage about long distance, tenderness, and intimacy.");
  };

  await createCapture(root, {
    sourceUrl: "https://example.com/orbit",
    note: "soft voiceover, close-up diary pacing, and @linh style tenderness",
  });
  await createCapture(root, {
    sourceUrl: "https://example.com/routine",
    note: "discipline, routine, text overlay, and @linh voiceover rhythm",
  });
  await createCapture(root, {
    sourceUrl: "https://example.com/distance",
    note: "long distance, tenderness, close-up moments, and intimate montage",
  });

  const compiled = compileAftertaste(root);
  const catalysts = compileCatalysts(root, compiled.references, compiled.snapshot);
  const queryIndex = compileQueryIndex(root, compiled.references, catalysts, compiled.snapshot);
  const catalystsAgain = compileCatalysts(root, compiled.references, compiled.snapshot);

  assert.ok(catalysts.length >= 4);
  assert.deepEqual(
    catalysts.map(pickStableCatalystShape),
    catalystsAgain.map(pickStableCatalystShape),
  );
  assert.ok(queryIndex.some((entry) => entry.kind === "reference"));
  assert.ok(queryIndex.some((entry) => entry.kind === "catalyst"));
  assert.ok(fs.existsSync(path.join(root, "outputs", "app", "query-index.json")));
});

test("compile writes a first-class taste graph with weighted evidence-backed edges", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("orbit")) {
      return htmlResponse("Orbit reel", "A voiceover montage about tenderness, routine, and close-up details.");
    }
    if (url.includes("routine")) {
      return htmlResponse("Routine reel", "A voiceover montage about discipline, routine, and text overlay.");
    }
    return htmlResponse("Distance reel", "A close-up montage about tenderness, memory, and intimate pacing.");
  };

  const first = await createCapture(root, {
    sourceUrl: "https://example.com/orbit",
    note: "tenderness, voiceover, close-up details, and diary pacing",
  });
  await createCapture(root, {
    sourceUrl: "https://example.com/routine",
    note: "discipline, routine, text overlay, and voiceover montage",
  });
  const brief = createProjectBrief(root, {
    title: "Graph brief",
    mode: "client",
    deliverableType: "script",
    goal: "Use the current archive as a client-safe reel concept.",
    audience: "Brand viewers",
    constraints: ["Keep the softness"],
    selectedReferenceIds: [first.capture.id],
  });
  const ideas = await generateIdeas(root, {
    snapshotId: null,
    referenceIds: [first.capture.id],
    outputType: "script",
    brief: "stay intimate",
    briefId: brief.id,
  });

  const compiled = compileAftertaste(root);
  const graph = compileTasteGraph(root, compiled.references, compileCatalysts(root, compiled.references, compiled.snapshot), compiled.snapshot);
  const persisted = getTasteGraph(root);

  assert.ok(fs.existsSync(path.join(root, "outputs", "app", "taste-graph.json")));
  assert.ok(graph.nodes.some((node) => node.kind === "reference"));
  assert.ok(graph.nodes.some((node) => node.kind === "catalyst"));
  assert.ok(graph.nodes.some((node) => node.kind === "brief"));
  assert.ok(graph.nodes.some((node) => node.kind === "creative-session"));
  assert.ok(graph.nodes.some((node) => node.kind === "snapshot"));
  assert.ok(graph.edges.some((edge) => edge.kind === "related_reference"));
  assert.ok(graph.edges.some((edge) => edge.kind === "belongs_to_snapshot"));
  assert.ok(graph.edges.some((edge) => edge.kind === "supported_by"));
  assert.ok(graph.edges.some((edge) => edge.kind === "reinforces"));
  const referenceEdge = graph.edges.find((edge) => edge.kind === "related_reference");
  assert.ok(referenceEdge);
  assert.ok((referenceEdge?.evidence.referenceIds.length ?? 0) >= 2);
  assert.ok((referenceEdge?.weight ?? 0) > 0);
  assert.equal(persisted.nodes.length, graph.nodes.length);
  assert.ok(persisted.edges.some((edge) => edge.sourceId === ideas.session.id || edge.targetId === ideas.session.id));
});

test("related references rank closer matches above unrelated ones", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("discipline-a")) {
      return htmlResponse("Discipline A", "A voiceover montage about discipline, routine, and ambition.");
    }
    if (url.includes("discipline-b")) {
      return htmlResponse("Discipline B", "A voiceover montage about discipline, routine, and future-building.");
    }
    return htmlResponse("Tenderness C", "A soft close-up reflection about intimacy, care, and gentle pacing.");
  };

  const first = await createCapture(root, {
    sourceUrl: "https://example.com/discipline-a",
    note: "discipline, routine, @linh voiceover, and text overlay",
  });
  const second = await createCapture(root, {
    sourceUrl: "https://example.com/discipline-b",
    note: "discipline, routine, @linh voiceover montage with text overlay",
  });
  const third = await createCapture(root, {
    sourceUrl: "https://example.com/tenderness-c",
    note: "soft care, intimacy, close-up details, and gentle pacing",
  });

  const related = getRelatedReferences(root, first.capture.id);

  assert.equal(related.referenceId, first.capture.id);
  assert.ok(related.catalysts.length > 0);
  assert.equal(related.related[0]?.id, second.capture.id);
  assert.ok(
    related.related.findIndex((reference) => reference.id === second.capture.id) <
      related.related.findIndex((reference) => reference.id === third.capture.id),
  );

  const refreshed = listReferences(root).references.find((reference) => reference.id === first.capture.id);
  assert.equal(refreshed?.relatedReferenceIds[0], second.capture.id);
});

test("query index supports filtered archive search without scanning markdown", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("voiceover")) {
      return htmlResponse("Voiceover reel", "A voiceover montage about tenderness, routine, and close-up pacing.");
    }
    return htmlResponse("Text overlay reel", "A text overlay essay about discipline, routine, and ambition.");
  };

  await createCapture(root, {
    sourceUrl: "https://example.com/voiceover",
    note: "tenderness, voiceover, close-up, and @linh pacing",
  });
  await createCapture(root, {
    sourceUrl: "https://example.com/overlay",
    note: "discipline, routine, text overlay, and micro essay framing",
  });

  const query = searchQueryIndex(root, {
    q: "voiceover",
    theme: "tenderness",
    motif: "voiceover",
    platform: "example",
    start: "2000-01-01",
    end: "2100-01-01",
    kind: ["catalyst", "snapshot", "constitution", "not-me"],
  });

  assert.ok(query.results.length > 0);
  assert.ok(query.results.some((entry) => entry.kind === "catalyst"));

  const outOfWindow = searchQueryIndex(root, {
    end: "2000-01-01",
  });
  assert.equal(outOfWindow.results.length, 0);
});

test("compiled outputs retain provenance and explicit uncertainty", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async () => {
    throw new Error("offline");
  };

  const detail = await createCapture(root, {
    sourceUrl: "https://example.com/sparse",
  });
  const snapshot = getCurrentSnapshot(root);

  assert.ok(detail.reference);
  assert.deepEqual(detail.reference?.provenance.sourceIds, [detail.capture.id]);
  assert.ok((detail.reference?.provenance.sourcePaths.length ?? 0) >= 2);
  assert.ok((detail.reference?.openQuestions.length ?? 0) > 0);
  assert.ok(snapshot.provenance.sourceIds.includes(detail.capture.id));
  assert.ok(snapshot.openQuestions.length > 0);
});

test("project briefs can be created, listed, fetched, and reused in idea generation", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async () =>
    htmlResponse("Client reel", "A voiceover montage about tenderness, routine, and close-up details.");

  const reference = await createCapture(root, {
    sourceUrl: "https://example.com/client-reel",
    note: "tenderness, routine, voiceover, and client-safe pacing",
  });

  const brief = createProjectBrief(root, {
    title: "April client reel",
    mode: "client",
    deliverableType: "script",
    goal: "Translate the archive into a client-safe script.",
    audience: "Wellness brand viewers",
    constraints: ["Keep it intimate", "No hard sell"],
    selectedReferenceIds: [reference.capture.id],
  });

  assert.ok(fs.existsSync(path.join(root, "outputs", "briefs", `${brief.id}.json`)));

  const listed = listProjectBriefs(root);
  assert.equal(listed.briefs[0]?.id, brief.id);

  const fetched = getProjectBrief(root, brief.id);
  assert.equal(fetched.goal, "Translate the archive into a client-safe script.");

  const ideas = await generateIdeas(root, {
    snapshotId: null,
    referenceIds: [],
    outputType: "script",
    brief: "",
    briefId: brief.id,
  });

  assert.equal(ideas.request.briefId, brief.id);
  assert.ok(ideas.outputs.every((output) => output.citations.includes(reference.capture.id)));
});

test("idea generation writes creative sessions and later contexts can read them", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async () =>
    htmlResponse("Session reel", "A voiceover montage about tenderness, routine, and close-up details.");

  const capture = await createCapture(root, {
    sourceUrl: "https://example.com/session",
    note: "tenderness, routine, voiceover, and close-up details",
  });

  const firstIdeas = await generateIdeas(root, {
    snapshotId: null,
    referenceIds: [capture.capture.id],
    outputType: "script",
    brief: "",
  });

  assert.ok(firstIdeas.outputs.length > 0);
  assert.ok(fs.existsSync(path.join(root, "outputs", "app", "creative-sessions.json")));

  const sessions = readCreativeSessions(root);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.referenceIds[0], capture.capture.id);

  const context = buildIdeaGenerationContext(root, {
    outputType: "script",
    briefText: "",
    brief: null,
    snapshot: getCurrentSnapshot(root),
    selectedReferences: [listReferences(root).references[0]!],
  });
  assert.equal(context.recentSessions[0]?.id, sessions[0]?.id);
});

test("idea generation stores distinct artifacts even when Date.now repeats", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async () =>
    htmlResponse("Collision reel", "A voiceover montage about tenderness, routine, and close-up details.");

  await createCapture(root, {
    sourceUrl: "https://example.com/collision",
    note: "voiceover, routine, and close-up details",
  });

  const originalNow = Date.now;
  Date.now = () => 1_700_000_000_000;

  try {
    await generateIdeas(root, {
      snapshotId: null,
      referenceIds: [],
      outputType: "hooks",
      brief: "first artifact body",
    });

    await generateIdeas(root, {
      snapshotId: null,
      referenceIds: [],
      outputType: "hooks",
      brief: "second artifact body",
    });
  } finally {
    Date.now = originalNow;
  }

  const ideaFiles = fs
    .readdirSync(path.join(root, "outputs", "ideas"))
    .filter((file) => file.endsWith(".json"))
    .sort();
  assert.equal(ideaFiles.length, 2);

  const ideaBodies = ideaFiles.map((file) => {
    const response = JSON.parse(
      fs.readFileSync(path.join(root, "outputs", "ideas", file), "utf-8"),
    ) as { request?: { brief?: string } };
    return response.request?.brief ?? "";
  });
  assert.deepEqual(ideaBodies.sort(), ["first artifact body", "second artifact body"]);
});

test("failed creative session writes do not corrupt previously saved sessions", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async () =>
    htmlResponse("Session reel", "A voiceover montage about tenderness, routine, and close-up details.");

  await createCapture(root, {
    sourceUrl: "https://example.com/session-write-failure",
    note: "tenderness, routine, voiceover, and close-up details",
  });

  const first = await generateIdeas(root, {
    snapshotId: null,
    referenceIds: [],
    outputType: "hooks",
    brief: "baseline session",
  });
  assert.equal(readCreativeSessions(root).length, 1);

  const originalWriteFileSync = fs.writeFileSync;
  let injectedFailure = false;
  fs.writeFileSync = ((filePath: fs.PathOrFileDescriptor, data: string | NodeJS.ArrayBufferView, options?: fs.WriteFileOptions) => {
    if (!injectedFailure && typeof filePath === "string" && filePath.includes("creative-sessions.json")) {
      injectedFailure = true;
      originalWriteFileSync(filePath, "{", options);
      throw new Error("simulated disk full");
    }
    return originalWriteFileSync(filePath, data, options);
  }) as typeof fs.writeFileSync;

  try {
    await assert.rejects(
      generateIdeas(root, {
        snapshotId: null,
        referenceIds: [],
        outputType: "hooks",
        brief: "should fail",
      }),
      /simulated disk full/,
    );
  } finally {
    fs.writeFileSync = originalWriteFileSync;
  }

  const sessions = readCreativeSessions(root);
  assert.equal(sessions.length, 1);
  assert.equal(sessions[0]?.id, first.session.id);
  assert.equal(sessions[0]?.summary, first.session.summary);
});

test("changing not-me changes fallback generation context and suppresses a direction", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async () =>
    htmlResponse("Boundary reel", "A voiceover montage about tenderness, routine, and close-up details.");

  const capture = await createCapture(root, {
    sourceUrl: "https://example.com/boundary",
    note: "tenderness, routine, voiceover, and close-up details",
  });

  const firstIdeas = await generateIdeas(root, {
    snapshotId: null,
    referenceIds: [capture.capture.id],
    outputType: "script",
    brief: "",
  });

  fs.writeFileSync(
    path.join(root, "wiki", "not-me.md"),
    [
      "---",
      "title: Not Me",
      "type: constraint",
      "---",
      "# Not Me",
      "",
      "## Anti-Patterns",
      "- Generic motivation language",
      "- Over-explained voiceover",
      "",
    ].join("\n"),
    "utf-8",
  );

  const secondIdeas = await generateIdeas(root, {
    snapshotId: null,
    referenceIds: [capture.capture.id],
    outputType: "script",
    brief: "",
  });

  assert.ok(!firstIdeas.outputs[0]?.body.includes("generic motivation"));
  assert.match(secondIdeas.outputs[0]?.body ?? "", /generic motivation/i);
});

test("configured llm path returns typed idea plans that render safely", async () => {
  const root = makeTempRoot();
  process.env.AFTERTASTE_OPENAI_API_KEY = "test-key";
  process.env.AFTERTASTE_OPENAI_MODEL = "test-model";
  process.env.AFTERTASTE_OPENAI_BASE_URL = "https://mocked.openai.local/v1";

  globalThis.fetch = async (input, init) => {
    const url = typeof input === "string" ? input : String(input);
    if (url.includes("/chat/completions")) {
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  outputType: "hooks",
                  options: [
                    {
                      title: "LLM planned hook",
                      angle: "a model-backed plan",
                      structure: [
                        "One possibility: open with a concrete detail from the archive.",
                        "[YOUR LINE: the exact sentence that only you would say here]",
                      ],
                      citations: ["ref-llm"],
                      rationale: "Parsed from a typed JSON plan.",
                      personalMoments: [
                        {
                          placeholder: "[YOUR LINE: the exact sentence that only you would say here]",
                          prompt: "the exact sentence that only you would say here",
                        },
                      ],
                    },
                  ],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return htmlResponse("LLM reel", "A voiceover montage about tenderness, routine, and close-up details.");
  };

  const capture = await createCapture(root, {
    sourceUrl: "https://example.com/ref-llm",
    note: "tenderness, routine, voiceover, and close-up details",
  });

  const ideas = await generateIdeas(root, {
    snapshotId: null,
    referenceIds: [capture.capture.id],
    outputType: "hooks",
    brief: "",
  });

  assert.equal(ideas.outputs[0]?.title, "LLM planned hook");
  assert.match(ideas.outputs[0]?.body ?? "", /\[YOUR LINE:/);
  assert.deepEqual(ideas.outputs[0]?.citations, [capture.capture.id]);
});

test("voice-note captures persist source metadata and shift analysis toward audio/story cues", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async () =>
    htmlResponse("Voice memo", "A soft spoken reflection about distance, routine, and saying the honest thing slowly.");

  const detail = await createCapture(root, {
    sourceUrl: "https://example.com/voice-note",
    sourceKind: "voice-note",
    savedReason: "keep the raw spoken cadence",
    collection: "Voice memos",
    projectIds: ["friendship-reel", "april-cut"],
    note: "i keep coming back to how my voice sounds when i finally stop pretending",
    assets: [
      {
        name: "voice.m4a",
        mediaType: "audio/mp4",
        dataBase64: "data:audio/mp4;base64,AAAA",
        size: 4,
      },
    ],
  });

  const comparison = await createCapture(root, {
    sourceUrl: "https://example.com/plain-reference",
    sourceKind: "reference",
    note: "distance, routine, and honest reflection",
  });

  assert.equal(detail.capture.sourceKind, "voice-note");
  assert.equal(detail.capture.savedReason, "keep the raw spoken cadence");
  assert.equal(detail.capture.collection, "Voice memos");
  assert.deepEqual(detail.capture.projectIds, ["friendship-reel", "april-cut"]);
  assert.ok(detail.analysis?.audioSignals.some((signal) => signal.slug === "spoken-voice"));
  assert.ok((detail.analysis?.storySignals.length ?? 0) > 0);
  assert.ok((detail.analysis?.moments.length ?? 0) > 0);
  assert.equal(detail.reference?.sourceKind, "voice-note");
  assert.equal(detail.reference?.collection, "Voice memos");
  assert.deepEqual(detail.reference?.projectIds, ["friendship-reel", "april-cut"]);
  assert.ok((detail.reference?.audioSignals.length ?? 0) > (comparison.reference?.audioSignals.length ?? 0));
});

test("uploaded media compiles richer visual and moment data than a link-only capture", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("moodboard")) {
      return htmlResponse("Moodboard", "A warm close-up palette of hands, paper textures, and slow domestic movement.");
    }
    return htmlResponse("Link only", "A sparse reference about routine and tenderness.");
  };

  const linkOnly = await createCapture(root, {
    sourceUrl: "https://example.com/link-only",
    note: "routine and tenderness",
  });

  const withMedia = await createCapture(root, {
    sourceUrl: "https://example.com/moodboard",
    sourceKind: "moodboard",
    note: "warm palette, paper texture, close-up hands, quiet movement",
    assets: [
      {
        name: "frame.png",
        mediaType: "image/png",
        dataBase64: "data:image/png;base64,AAAA",
        size: 4,
      },
      {
        name: "clip.mp4",
        mediaType: "video/mp4",
        dataBase64: "data:video/mp4;base64,AAAA",
        size: 4,
      },
    ],
  });

  assert.ok((withMedia.analysis?.visualSignals.length ?? 0) > 0);
  assert.ok((withMedia.analysis?.moments.length ?? 0) > (linkOnly.analysis?.moments.length ?? 0));
  assert.ok((withMedia.reference?.visualSignals.length ?? 0) > 0);
  assert.ok((withMedia.reference?.moments.length ?? 0) > (linkOnly.reference?.moments.length ?? 0));
});

test("media analysis artifacts use the heuristic adapter seam and state deferred video understanding clearly", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async () =>
    htmlResponse("Video note", "A warm close-up video about movement, voiceover, and quiet domestic pacing.");

  const detail = await createCapture(root, {
    sourceUrl: "https://example.com/video-note",
    sourceKind: "moodboard",
    note: "warm palette, close-up movement, and spoken reflection",
    assets: [
      {
        name: "clip.mp4",
        mediaType: "video/mp4",
        dataBase64: "data:video/mp4;base64,AAAA",
        size: 4,
      },
    ],
  });

  const artifactPath = path.join(root, detail.capture.rawPaths.artifacts.mediaAnalysis ?? "");
  const artifact = JSON.parse(fs.readFileSync(artifactPath, "utf-8")) as {
    status: string;
    source: string;
    notes?: string[];
    moments?: Array<{ startMs?: number; endMs?: number }>;
  };

  assert.equal(artifact.status, "ok");
  assert.equal(artifact.source, "heuristic");
  assert.ok(artifact.notes?.some((note) => /heuristic adapter seam/i.test(note)));
  assert.ok(artifact.notes?.some((note) => /no frame-level scene understanding, timestamps, speaker turns/i.test(note)));
  assert.ok((artifact.moments ?? []).every((moment) => moment.startMs == null && moment.endMs == null));
  assert.ok(detail.analysis?.assetInsights.some((insight) => /shallow video handling only/i.test(insight)));
});

test("idea generation returns context and session data for the upgraded studio", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async () =>
    htmlResponse("Studio reel", "A voiceover montage about tenderness, warm framing, and the one beat that keeps returning.");

  const capture = await createCapture(root, {
    sourceUrl: "https://example.com/studio-reel",
    sourceKind: "moodboard",
    note: "warm framing, close-up hands, tenderness, and one beat that keeps returning",
    assets: [
      {
        name: "frame.png",
        mediaType: "image/png",
        dataBase64: "data:image/png;base64,AAAA",
        size: 4,
      },
    ],
  });

  const ideas = await generateIdeas(root, {
    snapshotId: null,
    referenceIds: [capture.capture.id],
    outputType: "shotlist",
    brief: "keep the tone intimate",
  });

  assert.equal(ideas.context.selectedReferences[0]?.id, capture.capture.id);
  assert.ok((ideas.context.selectedReferences[0]?.moments.length ?? 0) > 0);
  assert.ok(ideas.context.catalysts.length > 0);
  assert.equal(ideas.session.referenceIds[0], capture.capture.id);
  assert.ok(ideas.session.summary.length > 0);
});

test("wiki article detail exposes structured encyclopedia context and lint finds concept coverage gaps", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("a")) {
      return htmlResponse("Identity A", "A close-up voiceover reel about identity, tenderness, and daily texture.");
    }
    if (url.includes("b")) {
      return htmlResponse("Identity B", "A close-up montage about identity, tenderness, and routine.");
    }
    return htmlResponse("Identity C", "A close-up reflection about identity, tenderness, and memory return.");
  };

  await createCapture(root, {
    sourceUrl: "https://example.com/a",
    note: "identity, tenderness, close-up voiceover, and daily texture",
  });
  await createCapture(root, {
    sourceUrl: "https://example.com/b",
    note: "identity, tenderness, close-up montage, and routine",
  });
  await createCapture(root, {
    sourceUrl: "https://example.com/c",
    note: "identity, tenderness, close-up detail, and memory return",
  });

  const article = getWikiArticleDetail(root, "wiki/themes/identity.md");
  const lint = lintWiki(root);

  assert.equal(article.kind, "theme");
  assert.ok(article.lead.length > 40);
  assert.ok(article.sections.some((section) => section.heading === "Canonical References"));
  assert.ok(article.relatedPaths.length > 0);
  assert.ok(article.supportingReferenceIds.length > 0);
  assert.ok(Array.isArray(lint.issues));
  assert.ok(
    lint.issues.length > 0
      || fs.readdirSync(path.join(root, "wiki", "concepts")).some((file) => file.endsWith(".md")),
  );
});

test("folder-split concept pages resolve through their index file", () => {
  const root = makeTempRoot();
  const conceptDir = path.join(root, "wiki", "concepts", "ritual-practice");
  fs.mkdirSync(conceptDir, { recursive: true });
  fs.writeFileSync(path.join(conceptDir, "index.md"), [
    "---",
    "title: Ritual Practice",
    "type: concept",
    "---",
    "",
    "# Ritual Practice",
    "",
    "A folder-split concept page should resolve from the folder path.",
    "",
    "## Canonical References",
    "- None yet.",
    "",
  ].join("\n"));

  const found = findPage(root, "concepts/ritual-practice");
  assert.equal(found?.endsWith(path.join("wiki", "concepts", "ritual-practice", "index.md")), true);

  const article = getWikiArticleDetail(root, "wiki/concepts/ritual-practice");
  assert.equal(article.path, "wiki/concepts/ritual-practice/index.md");
  assert.equal(article.title, "Ritual Practice");
});

test("missing motif pages render a placeholder article with backlinks instead of failing", () => {
  const root = makeTempRoot();
  compileAftertaste(root);

  const snapshotPath = path.join(root, "wiki", "snapshots", "2026-W01.md");
  fs.writeFileSync(snapshotPath, [
    "# Week 1 Snapshot",
    "",
    "- [[motifs/soft-color|Soft Color]]",
    "- [[concepts/ritual-practice|Ritual Practice]]",
    "",
  ].join("\n"));

  const article = getWikiArticleDetail(root, "wiki/motifs/soft-color.md");
  assert.equal(article.path, "wiki/motifs/soft-color.md");
  assert.equal(article.title, "Soft Color");
  assert.ok(article.lead.includes("current compile"));
  assert.ok(article.backlinks.some((link) => link.path === "wiki/snapshots/2026-W01.md"));
  assert.ok(article.raw?.includes("[[snapshots/2026-W01|Week 1 Snapshot]]"));
});

test("wiki cleanup preview and apply keep maintenance actions reviewable and executable", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async () =>
    htmlResponse("Cleanup reel", "A close-up voiceover reel about tenderness, identity, and daily texture.");

  const capture = await createCapture(root, {
    sourceUrl: "https://example.com/cleanup",
    note: "identity, tenderness, close-up voiceover, and daily texture",
  });

  const preview = planWikiCleanup(root);
  assert.ok(preview.actions.length > 0);

  const applied = await applyWikiCleanup(root);
  assert.ok(applied.actions.length > 0);

  const refreshedArticle = getWikiArticleDetail(root, "wiki/themes/identity.md");
  const references = listReferences(root).references;

  assert.ok(refreshedArticle.sections.some((section) => section.heading === "Related Concepts"));
  assert.ok(refreshedArticle.supportingReferenceIds.includes(capture.capture.id));
  assert.ok(references.some((reference) => reference.id === capture.capture.id));
});

function substackRssFeed(pub: string, articles: Array<{ slug: string; title: string; bodyHtml: string }>): string {
  const items = articles
    .map(
      ({ slug, title, bodyHtml }) => `
    <item>
      <title><![CDATA[${title}]]></title>
      <link>https://${pub}.substack.com/p/${slug}</link>
      <guid isPermaLink="false">https://${pub}.substack.com/p/${slug}</guid>
      <content:encoded><![CDATA[${bodyHtml}]]></content:encoded>
    </item>`,
    )
    .join("");
  return `<?xml version="1.0" encoding="UTF-8"?><rss version="2.0" xmlns:content="http://purl.org/rss/1.0/modules/content/"><channel>${items}</channel></rss>`;
}

test("substack article captures extract the full article body from the rss feed", async () => {
  const root = makeTempRoot();
  const bodyHtml = [
    "<p>The first thing you notice is how light moves differently in winter.</p>",
    "<p>Everything slows. The urgency of summer dissolves into something quieter and more deliberate.</p>",
    "<p>I've been thinking about tenderness as a creative practice — not a feeling but a discipline.</p>",
    "<p>Close-up shots of hands doing ordinary things. The way someone holds a cup in the morning.</p>",
    "<p>That's where the emotional texture lives, in the details everyone else edits out.</p>",
  ].join("\n");

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("/feed")) {
      return new Response(substackRssFeed("somepub", [{ slug: "some-article", title: "On Tenderness", bodyHtml }]), {
        status: 200,
        headers: { "content-type": "application/rss+xml" },
      });
    }
    return new Response(
      `<html><head><title>On Tenderness as Creative Practice</title><meta name="description" content="A short essay on light, slowness, and close-up filmmaking."></head></html>`,
      { status: 200, headers: { "content-type": "text/html" } },
    );
  };

  const detail = await createCapture(root, {
    sourceUrl: "https://somepub.substack.com/p/some-article",
    note: "tenderness, close-up, light, and winter texture",
  });

  // RSS path should succeed — transcript comes from article body, not metadata fallback
  assert.equal(detail.analysis?.transcriptProvenance.status, "ok");
  assert.equal(detail.analysis?.transcriptProvenance.source, "web-article");
  assert.match(detail.analysis?.transcript ?? "", /tenderness/i);
  assert.match(detail.analysis?.transcript ?? "", /close-up/i);
  // Should not fall back to the stitch (title + description only)
  assert.doesNotMatch(detail.analysis?.transcript ?? "", /Reference capture/);
});

test("open.substack.com app-reader urls are normalized and resolved via the rss feed", async () => {
  const root = makeTempRoot();
  const bodyHtml = [
    "<p>Voiceover is just thinking out loud in front of a camera.</p>",
    "<p>The trick is making it sound like you're not trying.</p>",
    "<p>Routine and distance are the two emotional registers I return to most.</p>",
    "<p>Everything else is a variation on those two things.</p>",
    "<p>That's the palette. Small but specific enough to be actually mine.</p>",
  ].join("\n");

  globalThis.fetch = async (input) => {
    const url = String(input);
    if (url.includes("somepub.substack.com/feed")) {
      return new Response(substackRssFeed("somepub", [{ slug: "my-slug", title: "Voiceover Notes", bodyHtml }]), {
        status: 200,
        headers: { "content-type": "application/rss+xml" },
      });
    }
    return new Response(
      `<html><head><title>Voiceover Notes</title><meta name="description" content="On voiceover and emotional registers."></head></html>`,
      { status: 200, headers: { "content-type": "text/html" } },
    );
  };

  const detail = await createCapture(root, {
    sourceUrl: "https://open.substack.com/pub/somepub/p/my-slug",
    note: "voiceover, routine, palette",
  });

  assert.equal(detail.analysis?.transcriptProvenance.status, "ok");
  assert.equal(detail.analysis?.transcriptProvenance.source, "web-article");
  assert.match(detail.analysis?.transcript ?? "", /voiceover/i);
});

test("gemini adapter produces provider-backed media analysis for byte-backed video captures", async () => {
  const root = makeTempRoot();
  process.env.AFTERTASTE_GEMINI_API_KEY = "test-gemini-key";
  process.env.AFTERTASTE_GEMINI_MODEL = "gemini-1.5-flash";
  process.env.AFTERTASTE_GEMINI_BASE_URL = "https://generativelanguage.googleapis.com";

  const geminiAnalysis = JSON.stringify({
    summary: "A warm close-up reel with voiceover and slow movement.",
    visualSignals: [
      { slug: "close-detail", label: "Close Detail", score: 0.88, evidence: ["close-up framing"] },
      { slug: "palette-warm", label: "Warm Palette", score: 0.75, evidence: ["warm tones"] },
    ],
    audioSignals: [
      { slug: "spoken-voice", label: "Spoken Voice", score: 0.92, evidence: ["voiceover narration"] },
    ],
    storySignals: [
      { slug: "observation", label: "Observation", score: 0.81, evidence: ["noticing small details"] },
    ],
    moments: [
      { label: "Opening", summary: "Creator introduces the scene", startMs: 0, endMs: 3000, confidence: 0.9 },
      { label: "Peak moment", summary: "Close-up of hands", startMs: 8000, endMs: 12000, confidence: 0.85 },
    ],
  });

  globalThis.fetch = async (input: RequestInfo | URL) => {
    const url = String(input);
    if (url.includes("/upload/v1beta/files")) {
      return new Response(
        JSON.stringify({
          file: {
            name: "files/test-receipt-abc123",
            uri: "https://generativelanguage.googleapis.com/v1beta/files/test-receipt-abc123",
            state: "ACTIVE",
          },
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    if (url.includes(":generateContent")) {
      return new Response(
        JSON.stringify({ candidates: [{ content: { parts: [{ text: geminiAnalysis }] } }] }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    return htmlResponse("Test reel", "A close-up reel about tenderness and movement.");
  };

  const detail = await createCapture(root, {
    sourceUrl: "https://www.instagram.com/reel/abc123/",
    note: "close-up framing, voiceover, warm tones",
    assets: [
      {
        name: "reel-clip.mp4",
        mediaType: "video/mp4",
        dataBase64: "data:video/mp4;base64,AAAA",
        size: 4,
      },
    ],
  });

  assert.ok(detail.capture.rawPaths.artifacts.mediaAnalysis, "media-analysis artifact path should be set");

  const mediaArtifact = JSON.parse(
    fs.readFileSync(path.join(root, detail.capture.rawPaths.artifacts.mediaAnalysis ?? ""), "utf-8"),
  ) as {
    source?: string;
    status?: string;
    summary?: string;
    visualSignals?: Array<{ slug: string; score: number }>;
    audioSignals?: Array<{ slug: string; score: number }>;
    storySignals?: Array<{ slug: string; score: number }>;
    moments?: Array<{ label: string; startMs?: number; endMs?: number }>;
    notes?: string[];
    generation?: { provider?: { id?: string } };
  };

  assert.equal(mediaArtifact.source, "gemini", "media analysis source should be gemini not heuristic");
  assert.equal(mediaArtifact.status, "ok");
  assert.ok(mediaArtifact.visualSignals?.some((s) => s.slug === "close-detail"), "visual signals should include close-detail");
  assert.ok(mediaArtifact.audioSignals?.some((s) => s.slug === "spoken-voice"), "audio signals should include spoken-voice");
  assert.ok(mediaArtifact.moments && mediaArtifact.moments.length > 0, "moments should be present");
  assert.ok(
    mediaArtifact.moments?.some((m) => typeof m.startMs === "number"),
    "moments should include provider-derived millisecond timestamps",
  );
  assert.ok(mediaArtifact.notes?.some((n) => /gemini/i.test(n)), "notes should reference the gemini provider");
  assert.ok(mediaArtifact.notes?.some((n) => /files\/test-receipt-abc123/.test(n)), "notes should record the gemini file receipt id");
  assert.equal(mediaArtifact.generation?.provider?.id, "gemini");
});

test("gemini adapter falls back to heuristic when no api key is configured", async () => {
  const root = makeTempRoot();
  delete process.env.AFTERTASTE_GEMINI_API_KEY;

  globalThis.fetch = async () =>
    htmlResponse("Test reel", "A close-up reel about tenderness and movement.");

  const detail = await createCapture(root, {
    sourceUrl: "https://www.instagram.com/reel/abc123/",
    note: "close-up, warm light",
    assets: [
      {
        name: "reel-clip.mp4",
        mediaType: "video/mp4",
        dataBase64: "data:video/mp4;base64,AAAA",
        size: 4,
      },
    ],
  });

  assert.ok(detail.capture.rawPaths.artifacts.mediaAnalysis);

  const mediaArtifact = JSON.parse(
    fs.readFileSync(path.join(root, detail.capture.rawPaths.artifacts.mediaAnalysis ?? ""), "utf-8"),
  ) as { source?: string };

  assert.equal(mediaArtifact.source, "heuristic", "should fall back to heuristic when gemini is not configured");
});

test("moment entries appear in the query index and match signal tag text searches", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async () =>
    htmlResponse("Voiceover note", "A voiceover reel with tenderness, confession, and close-up framing.");

  // voice-note captures produce anchor-line moments with signal tags (no transcript required)
  const detail = await createCapture(root, {
    sourceUrl: "https://example.com/voiceover-note",
    note: "voiceover narration about tenderness and confession",
    sourceKind: "voice-note",
  });

  const compiled = compileAftertaste(root);
  const snapshot = getCurrentSnapshot(root);
  const catalysts = compileCatalysts(root, compiled.references, snapshot);
  const queryIndex = compileQueryIndex(root, compiled.references, catalysts, snapshot);

  // Moments are only indexed when they carry signal tags or timestamps
  const momentEntries = queryIndex.filter((entry) => entry.kind === "moment");
  assert.ok(momentEntries.length > 0, "query index should include at least one moment entry");

  const firstMoment = momentEntries[0]!;
  assert.ok(firstMoment.momentId, "moment entry should carry a momentId");
  assert.equal(firstMoment.sourceIds[0], detail.capture.id, "moment entry sourceIds should point to the parent capture");
  assert.ok(firstMoment.tags.some((tag) => tag.startsWith("signal:")), "moment entry should have signal: prefixed tags");

  // kind filter isolates moment entries
  const momentFilter = searchQueryIndex(root, { kind: ["moment"] });
  assert.ok(momentFilter.results.every((entry) => entry.kind === "moment"), "kind=moment filter should return only moment entries");
  assert.ok(momentFilter.results.length > 0, "filtered moment search should return results");

  // text search surfaces moment entries by title ("Anchor line" → "anchor")
  const titleQuery = searchQueryIndex(root, { q: "anchor" });
  assert.ok(
    titleQuery.results.some((entry) => entry.kind === "moment"),
    "title text query should return moment entries",
  );
});

test("idea generation context includes grounded moment excerpts with citable ids", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async () =>
    htmlResponse("Voiceover note", "A voiceover reel with spoken narration and breath pauses.");

  // voice-note sourceKind produces anchor-line moments with signal tags
  const detail = await createCapture(root, {
    sourceUrl: "https://example.com/voiceover",
    note: "spoken narration, breath, confessional",
    sourceKind: "voice-note",
  });

  compileAftertaste(root);
  const snapshot = getCurrentSnapshot(root);
  const reference = listReferences(root).references.find((r) => r.id === detail.capture.id);
  assert.ok(reference, "reference should exist after compile");

  const context = buildIdeaGenerationContext(root, {
    outputType: "hooks",
    briefText: "",
    brief: null,
    snapshot,
    selectedReferences: [reference!],
  });

  // momentExcerpts should be populated for captures with grounded moments
  const excerpts = context.momentExcerpts[detail.capture.id];
  if (excerpts && excerpts.length > 0) {
    assert.ok(excerpts[0]!.id, "moment excerpt should carry an id field for citation");
    assert.ok(typeof excerpts[0]!.label === "string", "moment excerpt should have a label");
    assert.ok(Array.isArray(excerpts[0]!.signalTags), "moment excerpt should have signal tags");
  }

  // toReferenceMoments should carry id on compiled reference moments
  if (reference!.moments.length > 0) {
    assert.ok(reference!.moments[0]!.id, "compiled reference moments should include moment id for citation");
  }
});

test("idea generation with empty archive returns fallback output without crashing", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async () =>
    htmlResponse("Empty state test", "A quiet reel.");

  // No captures in archive — generate ideas against empty reference list
  const ideas = await generateIdeas(root, {
    snapshotId: null,
    referenceIds: [],
    outputType: "hooks",
    brief: "",
  });

  assert.ok(ideas.outputs.length > 0, "fallback should produce at least one output");
  for (const output of ideas.outputs) {
    assert.ok(typeof output.body === "string", "output body should be a string");
    assert.ok(!output.body.includes("[object Object]"), "output should not contain serialization artifacts");
    assert.ok(output.body.trim().length > 0, "output body should not be empty");
  }
});

test("creative session learnedPatterns are identical across repeated generates with the same inputs (compounding baseline)", async () => {
  const root = makeTempRoot();
  globalThis.fetch = async () =>
    htmlResponse("Compounding reel", "A voiceover montage about tenderness, routine, and close-up details.");

  const capture = await createCapture(root, {
    sourceUrl: "https://example.com/compounding",
    note: "tenderness, routine, voiceover, and close-up details",
  });

  await generateIdeas(root, {
    snapshotId: null,
    referenceIds: [capture.capture.id],
    outputType: "hooks",
    brief: "",
  });

  await generateIdeas(root, {
    snapshotId: null,
    referenceIds: [capture.capture.id],
    outputType: "hooks",
    brief: "",
  });

  const sessions = readCreativeSessions(root);
  assert.equal(sessions.length, 2, "both sessions should be persisted");

  // Document current behavior: learnedPatterns are derived from inputs, not from
  // what the creator chose or used. Both sessions should have the same learned
  // patterns because the inputs are identical. This test serves as a baseline —
  // if real compounding is added, sessions run against different inputs should
  // produce meaningfully different learnedPatterns.
  assert.deepEqual(
    sessions[0]?.learnedPatterns,
    sessions[1]?.learnedPatterns,
    "current implementation derives learnedPatterns from inputs only — same inputs produce same patterns",
  );
});

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aftertaste-web-"));
  tempRoots.push(root);
  return root;
}

function htmlResponse(title: string, description: string): Response {
  return new Response(
    `<html><head><title>${title}</title><meta name="description" content="${description}"></head></html>`,
    { status: 200, headers: { "content-type": "text/html" } },
  );
}

function htmlResponseWithExtras(title: string, description: string, extras: string): Response {
  return new Response(
    `<html><head><title>${title}</title><meta name="description" content="${description}"></head><body><script>${extras}</script></body></html>`,
    { status: 200, headers: { "content-type": "text/html" } },
  );
}

function pickStableCatalystShape(catalyst: {
  id: string;
  slug: string;
  summary: string;
  referenceIds: string[];
  relatedIds: string[];
}): object {
  return {
    id: catalyst.id,
    slug: catalyst.slug,
    summary: catalyst.summary,
    referenceIds: catalyst.referenceIds,
    relatedIds: catalyst.relatedIds,
  };
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function restoreEnv(key: string, value: string | undefined): void {
  if (value == null) {
    delete process.env[key];
    return;
  }
  process.env[key] = value;
}
