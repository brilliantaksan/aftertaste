import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import type { Request, Response } from "express";
import type { ServerConfig } from "../config.js";
import {
  handleBriefDetail,
  handleCaptureAnalyze,
  handleCaptureCreate,
  handleQueryIndex,
  handleRelatedReferences,
  handleSnapshotCurrent,
  handleWikiArticle,
  handleWikiCleanupPreview,
  handleWikiLint,
} from "./aftertaste.js";
import { handleTasteGraph } from "./graph.js";

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

test("related references route returns 404 for a missing reference id", () => {
  const root = makeTempRoot();
  const cfg: ServerConfig = {
    wikiRoot: root,
    port: 4175,
    host: "127.0.0.1",
    author: "test",
  };
  const state = makeJsonResponseRecorder();
  const req = {
    params: {
      id: "missing-reference",
    },
  } as unknown as Request;

  handleRelatedReferences(cfg)(req, state.res as Response);

  assert.equal(state.statusCode, 404);
  assert.match(String((state.body as { error?: string } | null)?.error ?? ""), /reference not found/);
});

test("brief detail route returns 404 for a missing brief id", () => {
  const root = makeTempRoot();
  const cfg: ServerConfig = {
    wikiRoot: root,
    port: 4175,
    host: "127.0.0.1",
    author: "test",
  };
  const state = makeJsonResponseRecorder();
  const req = {
    params: {
      id: "missing-brief",
    },
  } as unknown as Request;

  handleBriefDetail(cfg)(req, state.res as Response);

  assert.equal(state.statusCode, 404);
  assert.match(String((state.body as { error?: string } | null)?.error ?? ""), /brief not found/);
});

test("capture create route rejects an invalid source kind", async () => {
  const root = makeTempRoot();
  const cfg: ServerConfig = {
    wikiRoot: root,
    port: 4175,
    host: "127.0.0.1",
    author: "test",
  };
  const state = makeJsonResponseRecorder();
  const req = {
    body: {
      sourceUrl: "https://example.com/capture",
      sourceKind: "podcast",
    },
  } as unknown as Request;

  await handleCaptureCreate(cfg)(req, state.res as Response);

  assert.equal(state.statusCode, 400);
  assert.match(String((state.body as { error?: string } | null)?.error ?? ""), /sourceKind must be/);
});

test("capture create route returns explicit instagram reel acquisition provenance", async () => {
  const root = makeTempRoot();
  const cfg: ServerConfig = {
    wikiRoot: root,
    port: 4175,
    host: "127.0.0.1",
    author: "test",
  };
  globalThis.fetch = async () => {
    throw new Error("offline");
  };
  const state = makeJsonResponseRecorder();
  const req = {
    body: {
      sourceUrl: "https://www.instagram.com/reel/abc123/",
    },
  } as unknown as Request;

  await handleCaptureCreate(cfg)(req, state.res as Response);

  assert.equal(state.statusCode, 201);
  const capture = (state.body as { capture?: { acquisition?: { mode?: string; status?: string; provider?: string } } } | null)?.capture;
  assert.equal(capture?.acquisition?.mode, "source-link");
  assert.equal(capture?.acquisition?.status, "unavailable");
  assert.equal(capture?.acquisition?.provider, "unknown");
});

test("capture create route rejects malformed base64 asset uploads", async () => {
  const root = makeTempRoot();
  const cfg: ServerConfig = {
    wikiRoot: root,
    port: 4175,
    host: "127.0.0.1",
    author: "test",
  };
  globalThis.fetch = async () =>
    new Response(
      `<html><head><title>Bad upload</title><meta name="description" content="Testing malformed upload bytes."></head></html>`,
      { status: 200, headers: { "content-type": "text/html" } },
    );
  const state = makeJsonResponseRecorder();
  const req = {
    body: {
      sourceUrl: "https://example.com/bad-upload",
      assets: [
        {
          name: "frame.png",
          mediaType: "image/png",
          dataBase64: "data:image/png;base64,%%%not-base64%%%",
          size: 4,
        },
      ],
    },
  } as unknown as Request;

  await handleCaptureCreate(cfg)(req, state.res as Response);

  assert.equal(state.statusCode, 400);
  assert.match(String((state.body as { error?: string } | null)?.error ?? ""), /base64/i);
});

test("capture analyze route recompiles references so refreshed summaries are returned", async () => {
  const root = makeTempRoot();
  const cfg: ServerConfig = {
    wikiRoot: root,
    port: 4175,
    host: "127.0.0.1",
    author: "test",
  };
  delete process.env.AFTERTASTE_OPENAI_API_KEY;
  delete process.env.OPENAI_API_KEY;
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : String(input);
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
                    title: "How I verify software before I trust it",
                    selftext:
                      "This is a written post about test coverage, smoke checks, and debugging unhappy paths. It is not a video reference and it does not describe b-roll or pacing.",
                    subreddit: "vibecoding",
                    permalink: "/r/vibecoding/comments/recompile123/how_i_verify_software_before_i_trust_it/",
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

  const createState = makeJsonResponseRecorder();
  await handleCaptureCreate(cfg)({
    body: {
      sourceUrl: "https://www.reddit.com/r/vibecoding/comments/recompile123/how_i_verify_software_before_i_trust_it/",
      note: "software verification reference",
    },
  } as Request, createState.res as Response);

  assert.equal(createState.statusCode, 201);
  const created = createState.body as { capture?: { id?: string } };
  const captureId = created.capture?.id ?? "";
  assert.ok(captureId);

  const staleReferencePath = path.join(root, "wiki", "references", `${captureId}.md`);
  const staleReference = fs.readFileSync(staleReferencePath, "utf-8");
  fs.writeFileSync(staleReferencePath, `${staleReference}\n\nSummary: stale compiled content\n`, "utf-8");

  const analyzeState = makeJsonResponseRecorder();
  await handleCaptureAnalyze(cfg)({
    params: { id: captureId },
  } as unknown as Request, analyzeState.res as Response);

  assert.equal(analyzeState.statusCode, 200);
  const responseReference = (analyzeState.body as { reference?: { summary?: string } } | null)?.reference;
  assert.ok(responseReference?.summary);
  assert.doesNotMatch(responseReference?.summary ?? "", /stale compiled content/i);
});

test("snapshot route upgrades the home-page snapshot with grounded llm synthesis", async () => {
  const root = makeTempRoot();
  const cfg: ServerConfig = {
    wikiRoot: root,
    port: 4175,
    host: "127.0.0.1",
    author: "test",
  };

  globalThis.fetch = async () =>
    new Response(
      `<html><head><title>Quiet reflection</title><meta name="description" content="A written reflection about retention and self-improvement."></head><body><article><p>How do you actually retain or use what you watch?</p><p>I mostly trust my subconscious will pick up anything important.</p></article></body></html>`,
      { status: 200, headers: { "content-type": "text/html" } },
    );

  await handleCaptureCreate(cfg)({
    body: {
      sourceUrl: "https://example.com/quiet-reflection",
      note: "the good shit sticks",
    },
  } as Request, makeJsonResponseRecorder().res as Response);

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
                  summary: "The archive is reading more like a written inquiry into retention and self-improvement than a cinematic moodboard. The strongest throughline is reflective processing around what actually sticks.",
                  creatorPatterns: [
                    {
                      label: "Thinking loop",
                      summary: "The references keep returning to questions about how insight turns into lived behavior.",
                      sourceReferenceIds: ["20260414T000000-will-be-replaced"],
                    },
                  ],
                  promptSeeds: [
                    {
                      title: "Retention premise",
                      prompt: "Turn the archive's questions about what sticks into a short reflection that names one idea you are still trying to live by.",
                      referenceIds: ["20260414T000000-will-be-replaced"],
                    },
                  ],
                  tensions: [
                    {
                      label: "Learning vs living",
                      summary: "The archive wants insight to become practice, not just more content consumption.",
                      referenceIds: ["20260414T000000-will-be-replaced"],
                    },
                  ],
                  openQuestions: [
                    "Which saved reference actually changed your behavior instead of just sounding wise?",
                  ],
                }).replaceAll("20260414T000000-will-be-replaced", JSON.parse(fs.readFileSync(path.join(root, "outputs", "app", "references.json"), "utf-8"))[0].id),
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const state = makeJsonResponseRecorder();
  await handleSnapshotCurrent(cfg)({} as Request, state.res as Response);

  assert.equal(state.statusCode, 200);
  const snapshot = state.body as { summary?: string; creatorPatterns?: Array<{ label?: string }>; promptSeeds?: Array<{ title?: string }> };
  assert.match(snapshot.summary ?? "", /written inquiry into retention/i);
  assert.equal(snapshot.creatorPatterns?.[0]?.label, "Thinking loop");
  assert.equal(snapshot.promptSeeds?.[0]?.title, "Retention premise");
});

test("query route can rerank lexical candidates with the llm layer", async () => {
  const root = makeTempRoot();
  const cfg: ServerConfig = {
    wikiRoot: root,
    port: 4175,
    host: "127.0.0.1",
    author: "test",
  };

  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : String(input);
    if (url.includes("first")) {
      return new Response(
        `<html><head><title>First result</title><meta name="description" content="A post about productivity routines."></head><body><article><p>This is mostly about systems.</p></article></body></html>`,
        { status: 200, headers: { "content-type": "text/html" } },
      );
    }
    return new Response(
      `<html><head><title>Second result</title><meta name="description" content="A post about subconscious retention and what actually sticks."></head><body><article><p>I mostly trust my subconscious will pick up anything important.</p></article></body></html>`,
      { status: 200, headers: { "content-type": "text/html" } },
    );
  };

  await handleCaptureCreate(cfg)({
    body: {
      sourceUrl: "https://example.com/first",
      note: "productivity routines",
    },
  } as Request, makeJsonResponseRecorder().res as Response);
  await handleCaptureCreate(cfg)({
    body: {
      sourceUrl: "https://example.com/second",
      note: "what actually sticks in the subconscious",
    },
  } as Request, makeJsonResponseRecorder().res as Response);

  process.env.AFTERTASTE_OPENAI_API_KEY = "test-key";
  process.env.AFTERTASTE_OPENAI_MODEL = "test-model";
  process.env.AFTERTASTE_OPENAI_BASE_URL = "https://mocked.openai.local/v1";
  globalThis.fetch = async (input) => {
    const url = typeof input === "string" ? input : String(input);
    if (url.includes("/chat/completions")) {
      const references = JSON.parse(fs.readFileSync(path.join(root, "outputs", "app", "references.json"), "utf-8")) as Array<{ id: string; title: string }>;
      const second = references.find((reference) => /Second result/.test(reference.title))!;
      const first = references.find((reference) => /First result/.test(reference.title))!;
      return new Response(
        JSON.stringify({
          choices: [
            {
              message: {
                content: JSON.stringify({
                  rankedIds: [second.id, first.id],
                }),
              },
            },
          ],
        }),
        { status: 200, headers: { "content-type": "application/json" } },
      );
    }
    throw new Error(`unexpected fetch ${url}`);
  };

  const state = makeJsonResponseRecorder();
  await handleQueryIndex(cfg)({
    query: { q: "subconscious retention", kind: "reference" },
  } as unknown as Request, state.res as Response);

  assert.equal(state.statusCode, 200);
  const results = ((state.body as { results?: Array<{ title?: string }> } | null)?.results ?? []);
  assert.equal(results[0]?.title, "Second result");
});

test("wiki article and lint routes expose encyclopedia state", async () => {
  const root = makeTempRoot();
  const cfg: ServerConfig = {
    wikiRoot: root,
    port: 4175,
    host: "127.0.0.1",
    author: "test",
  };
  globalThis.fetch = async () =>
    new Response(
      `<html><head><title>Identity reel</title><meta name="description" content="A close-up voiceover reel about identity, tenderness, and daily texture."></head></html>`,
      { status: 200, headers: { "content-type": "text/html" } },
    );

  await handleCaptureCreate(cfg)({
    body: {
      sourceUrl: "https://example.com/identity",
      note: "identity, tenderness, close-up voiceover, and daily texture",
    },
  } as Request, makeJsonResponseRecorder().res as Response);

  const articleState = makeJsonResponseRecorder();
  handleWikiArticle(cfg)({
    query: { path: "wiki/themes/identity.md" },
  } as unknown as Request, articleState.res as Response);

  assert.equal(articleState.statusCode, 200);
  assert.equal((articleState.body as { kind?: string } | null)?.kind, "theme");

  const lintState = makeJsonResponseRecorder();
  handleWikiLint(cfg)({} as Request, lintState.res as Response);

  assert.equal(lintState.statusCode, 200);
  assert.ok(Array.isArray((lintState.body as { issues?: unknown[] } | null)?.issues));
});

test("query index route accepts kind=moment filters", async () => {
  const root = makeTempRoot();
  const cfg: ServerConfig = {
    wikiRoot: root,
    port: 4175,
    host: "127.0.0.1",
    author: "test",
  };
  globalThis.fetch = async () =>
    new Response(
      `<html><head><title>Moment reel</title><meta name="description" content="A voiceover reel with tenderness, confession, and close-up framing."></head></html>`,
      { status: 200, headers: { "content-type": "text/html" } },
    );

  await handleCaptureCreate(cfg)({
    body: {
      sourceUrl: "https://example.com/moment-filter",
      note: "voiceover narration about tenderness and confession",
      sourceKind: "voice-note",
    },
  } as Request, makeJsonResponseRecorder().res as Response);

  const state = makeJsonResponseRecorder();
  await handleQueryIndex(cfg)({
    query: { kind: "moment" },
  } as unknown as Request, state.res as Response);

  assert.equal(state.statusCode, 200);
  const results = ((state.body as { results?: Array<{ kind?: string }> } | null)?.results ?? []);
  assert.ok(results.length > 0);
  assert.ok(results.every((entry) => entry.kind === "moment"));
});

test("wiki cleanup preview route returns reviewable maintenance actions", async () => {
  const root = makeTempRoot();
  const cfg: ServerConfig = {
    wikiRoot: root,
    port: 4175,
    host: "127.0.0.1",
    author: "test",
  };
  globalThis.fetch = async () =>
    new Response(
      `<html><head><title>Cleanup reel</title><meta name="description" content="A close-up voiceover reel about identity, tenderness, and daily texture."></head></html>`,
      { status: 200, headers: { "content-type": "text/html" } },
    );

  await handleCaptureCreate(cfg)({
    body: {
      sourceUrl: "https://example.com/cleanup",
      note: "identity, tenderness, close-up voiceover, and daily texture",
    },
  } as Request, makeJsonResponseRecorder().res as Response);

  const state = makeJsonResponseRecorder();
  handleWikiCleanupPreview(cfg)({} as Request, state.res as Response);

  assert.equal(state.statusCode, 200);
  assert.ok(((state.body as { actions?: unknown[] } | null)?.actions?.length ?? 0) >= 1);
});

test("taste graph route returns a compiled graph artifact", () => {
  const root = makeTempRoot();
  const cfg: ServerConfig = {
    wikiRoot: root,
    port: 4175,
    host: "127.0.0.1",
    author: "test",
  };
  const state = makeJsonResponseRecorder();
  const req = {} as Request;

  handleTasteGraph(cfg)(req, state.res as Response);

  assert.equal(state.statusCode, 200);
  const body = state.body as { nodes?: Array<{ kind?: string }>; edges?: unknown[] } | null;
  assert.ok(body);
  assert.ok((body?.nodes?.length ?? 0) >= 1);
  assert.ok(body?.nodes?.some((node) => node.kind === "snapshot"));
  assert.ok(Array.isArray(body?.edges));
});

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aftertaste-routes-"));
  tempRoots.push(root);
  return root;
}

function makeJsonResponseRecorder(): {
  statusCode: number;
  body: unknown;
  res: Pick<Response, "status" | "json">;
} {
  const state = {
    statusCode: 200,
    body: null as unknown,
  };

  const res = {
    status(code: number) {
      state.statusCode = code;
      return this;
    },
    json(body: unknown) {
      state.body = body;
      return this;
    },
  };

  return {
    get statusCode() {
      return state.statusCode;
    },
    get body() {
      return state.body;
    },
    res: res as unknown as Pick<Response, "status" | "json">,
  };
}

function restoreEnv(name: string, value: string | undefined): void {
  if (value == null) {
    delete process.env[name];
    return;
  }
  process.env[name] = value;
}
