import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import {
  createCapture,
  generateIdeas,
  getCurrentSnapshot,
  listReferences,
} from "./service.js";

const originalFetch = globalThis.fetch;
const tempRoots: string[] = [];

afterEach(() => {
  globalThis.fetch = originalFetch;
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
  assert.equal(detail.analysis?.mode, "text-first");
  assert.ok(detail.reference);
  assert.ok(fs.existsSync(path.join(root, detail.capture.rawPaths.capture)));
  assert.ok(fs.existsSync(path.join(root, "wiki", "references", `${detail.capture.id}.md`)));

  const snapshot = getCurrentSnapshot(root);
  assert.ok(snapshot.summary.length > 0);

  const compactDate = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const log = fs.readFileSync(path.join(root, "log", `${compactDate}.md`), "utf-8");
  assert.match(log, /capture \|/);
  assert.match(log, /compile \|/);
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
  assert.equal(detail.analysis?.mode, "hybrid");
  assert.ok(detail.capture.assets[0]);
  assert.ok(!path.isAbsolute(detail.capture.assets[0]!.path));
  assert.ok(detail.reference?.motifs.some((tag) => tag.slug === "voiceover" || tag.slug === "close-up"));
  assert.ok(detail.reference?.themes.some((tag) => tag.slug === "long-distance" || tag.slug === "tenderness"));
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

  const ideas = generateIdeas(root, {
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

  const ideas = generateIdeas(root, {
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

function makeTempRoot(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aftertaste-web-"));
  tempRoots.push(root);
  return root;
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}
