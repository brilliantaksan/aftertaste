#!/usr/bin/env node
// Bundle the browser client into dist/client/
import esbuild from "esbuild";
import fs from "node:fs";
import path from "node:path";
import url from "node:url";
import { execSync } from "node:child_process";

const here = path.dirname(url.fileURLToPath(import.meta.url));
const outDir = path.join(here, "dist/client");
const assetsDir = path.join(outDir, "assets");
const staticDir = path.join(here, "client/static");

fs.rmSync(outDir, { recursive: true, force: true });
fs.mkdirSync(assetsDir, { recursive: true });

// Compile Tailwind CSS
execSync(
  `npx tailwindcss -i ${path.join(here, 'client/tailwind.css')} -o ${path.join(assetsDir, 'tailwind.css')} --minify`,
  { cwd: here, stdio: "inherit" }
);

/**
 * @param {string} sourceDir
 * @param {string} targetDir
 */
function copyDirRecursive(sourceDir, targetDir) {
  if (!fs.existsSync(sourceDir)) return;
  fs.mkdirSync(targetDir, { recursive: true });
  for (const entry of fs.readdirSync(sourceDir, { withFileTypes: true })) {
    const sourcePath = path.join(sourceDir, entry.name);
    const targetPath = path.join(targetDir, entry.name);
    if (entry.isDirectory()) {
      copyDirRecursive(sourcePath, targetPath);
    } else {
      fs.copyFileSync(sourcePath, targetPath);
    }
  }
}

// Bundle main.ts → assets/main.js
await esbuild.build({
  entryPoints: [path.join(here, "client/main.ts")],
  bundle: true,
  format: "esm",
  target: "es2020",
  platform: "browser",
  outfile: path.join(assetsDir, "main.js"),
  sourcemap: false,
  treeShaking: true,
  minify: true,
  logLevel: "info",
  jsx: "automatic",
  jsxImportSource: "react",
});

// Copy static files.
fs.copyFileSync(path.join(here, "client/index.html"), path.join(outDir, "index.html"));
fs.copyFileSync(path.join(here, "client/styles.css"), path.join(assetsDir, "styles.css"));
copyDirRecursive(staticDir, assetsDir);

console.log(`✓ client bundled to ${outDir}`);
