import fs from "node:fs";
import path from "node:path";
import type { Request, Response } from "express";
import yaml from "js-yaml";
import type { ServerConfig } from "../config.js";

export interface TreeNode {
  name: string;
  path: string; // relative to wikiRoot
  kind: "file" | "dir";
  children?: TreeNode[];
}

/**
 * Build a navigation tree from the wiki/ directory.
 * The tree is recursive, sorted alphabetically, and only includes .md files.
 */
export function buildTree(wikiRoot: string): TreeNode {
  const wikiDir = path.join(wikiRoot, "wiki");
  if (!fs.existsSync(wikiDir)) {
    return { name: "wiki", path: "wiki", kind: "dir", children: [] };
  }
  return walk(wikiRoot, wikiDir, "wiki");
}

function walk(wikiRoot: string, dir: string, rel: string): TreeNode {
  const children = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((e) => !e.name.startsWith("."))
    .map((e) => {
      const full = path.join(dir, e.name);
      const nodeRel = path.posix.join(rel, e.name);
      if (e.isDirectory()) return walk(wikiRoot, full, nodeRel);
      if (!e.name.endsWith(".md")) return null;
      return {
        name: readTreeFileLabel(full, nodeRel, e.name.replace(/\.md$/, "")),
        path: nodeRel,
        kind: "file" as const,
      };
    })
    .filter((node): node is TreeNode => node != null)
    .sort((a, b) => {
      if (a.kind !== b.kind) return a.kind === "dir" ? -1 : 1;
      return a.name.localeCompare(b.name);
    });

  return { name: path.basename(dir), path: rel, kind: "dir", children };
}

function readTreeFileLabel(fullPath: string, relPath: string, fallback: string): string {
  if (!relPath.startsWith("wiki/references/")) return fallback;
  try {
    const raw = fs.readFileSync(fullPath, "utf-8");
    const frontmatterMatch = raw.match(/^---\n([\s\S]*?)\n---\n?/);
    if (frontmatterMatch?.[1]) {
      const frontmatter = yaml.load(frontmatterMatch[1]) as Record<string, unknown> | null;
      if (typeof frontmatter?.title === "string" && frontmatter.title.trim().length > 0) {
        return decodeHtmlEntities(frontmatter.title.trim());
      }
    }
    const headingMatch = raw.match(/^#\s+(.+?)\s*$/m);
    if (headingMatch?.[1]) return decodeHtmlEntities(headingMatch[1].trim());
  } catch {
    return fallback;
  }
  return fallback;
}

function decodeHtmlEntities(value: string): string {
  const namedEntities: Record<string, string> = {
    amp: "&",
    apos: "'",
    gt: ">",
    lt: "<",
    nbsp: " ",
    quot: "\"",
  };
  return value.replace(/&(#x?[0-9a-f]+|[a-z]+);/gi, (match, entity: string) => {
    const normalized = entity.toLowerCase();
    if (normalized.startsWith("#x")) {
      const codePoint = Number.parseInt(normalized.slice(2), 16);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    if (normalized.startsWith("#")) {
      const codePoint = Number.parseInt(normalized.slice(1), 10);
      return Number.isFinite(codePoint) ? String.fromCodePoint(codePoint) : match;
    }
    return namedEntities[normalized] ?? match;
  });
}

export function handleTree(cfg: ServerConfig) {
  return (_req: Request, res: Response) => {
    res.json(buildTree(cfg.wikiRoot));
  };
}
