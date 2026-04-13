import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import type { Request, Response } from "express";
import type { ServerConfig } from "../config.js";
import {
  handleBriefDetail,
  handleCaptureCreate,
  handleRelatedReferences,
  handleWikiArticle,
  handleWikiCleanupPreview,
  handleWikiLint,
} from "./aftertaste.js";
import { handleTasteGraph } from "./graph.js";

const tempRoots: string[] = [];

afterEach(() => {
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
