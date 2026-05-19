import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, test } from "node:test";
import { buildTree } from "./tree.js";

const tempRoots: string[] = [];

afterEach(() => {
  while (tempRoots.length > 0) {
    const root = tempRoots.pop();
    if (root) fs.rmSync(root, { recursive: true, force: true });
  }
});

test("tree uses reference titles instead of capture ids for reference pages", () => {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "aftertaste-tree-"));
  tempRoots.push(root);
  const referencesDir = path.join(root, "wiki", "references");
  fs.mkdirSync(referencesDir, { recursive: true });
  fs.writeFileSync(
    path.join(referencesDir, "20260410T111749-cb61.md"),
    [
      "---",
      "title: '&#064;zurkie_ on Instagram: Friendly title'",
      "type: reference",
      "---",
      "",
      "# &#064;zurkie_ on Instagram: Friendly title",
      "",
      "Reference body.",
    ].join("\n"),
    "utf-8",
  );

  const tree = buildTree(root);
  const referencesNode = tree.children?.find((node) => node.path === "wiki/references");

  assert.ok(referencesNode);
  assert.equal(referencesNode?.children?.[0]?.path, "wiki/references/20260410T111749-cb61.md");
  assert.equal(referencesNode?.children?.[0]?.name, "@zurkie_ on Instagram: Friendly title");
});
