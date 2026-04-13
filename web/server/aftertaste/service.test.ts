import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
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
const tempRoots: string[] = [];

afterEach(() => {
  globalThis.fetch = originalFetch;
  restoreEnv("AFTERTASTE_OPENAI_API_KEY", originalOpenAIApiKey);
  restoreEnv("AFTERTASTE_OPENAI_MODEL", originalOpenAIModel);
  restoreEnv("AFTERTASTE_OPENAI_BASE_URL", originalOpenAIBaseUrl);
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
  assert.ok(detail.capture.acquisition?.notes.some((note) => /uploaded media bytes/i.test(note)));

  const transcriptArtifact = JSON.parse(
    fs.readFileSync(path.join(root, detail.capture.rawPaths.artifacts.transcript ?? ""), "utf-8"),
  ) as {
    provenance?: {
      acquisition?: {
        mode?: string;
        provider?: string;
      };
    };
  };
  assert.equal(transcriptArtifact.provenance?.acquisition?.mode, "user-upload");
  assert.equal(transcriptArtifact.provenance?.acquisition?.provider, "local-upload");

  const mediaArtifact = JSON.parse(
    fs.readFileSync(path.join(root, detail.capture.rawPaths.artifacts.mediaAnalysis ?? ""), "utf-8"),
  ) as {
    acquisition?: {
      mode?: string;
      provider?: string;
    };
  };
  assert.equal(mediaArtifact.acquisition?.mode, "user-upload");
  assert.equal(mediaArtifact.acquisition?.provider, "local-upload");
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

  assert.match(analysis.transcript, /Actual spoken transcript/);
  assert.equal(analysis.transcriptProvenance.source, "manual");
  assert.equal(analysis.transcriptProvenance.status, "ok");
  assert.ok(analysis.transcriptProvenance.artifactPath?.endsWith("/transcript.json"));
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
  assert.ok(fs.existsSync(path.join(root, detail.capture.rawPaths.artifacts.transcript ?? "")));
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
  assert.match(detail.analysis?.transcript ?? "", /Reference capture|metadata-only fallback/i);
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
