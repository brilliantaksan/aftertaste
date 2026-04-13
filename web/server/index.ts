import express from "express";
import path from "node:path";
import url from "node:url";
import fs from "node:fs";
import { parseArgs } from "./config.js";
import { ensureAftertasteWorkspace } from "./aftertaste/service.js";
import { handleTree } from "./routes/tree.js";
import { handlePage, handleRaw } from "./routes/pages.js";
import { handleAuditList, handleAuditCreate, handleAuditResolve } from "./routes/audit.js";
import {
  handleBriefCreate,
  handleBriefDetail,
  handleBriefList,
  handleCaptureAnalyze,
  handleCaptureCreate,
  handleCaptureDelete,
  handleCaptureDetail,
  handleCaptureList,
  handleCompile,
  handleIdeas,
  handleQueryIndex,
  handleRelatedReferences,
  handleReferences,
  handleSnapshotCurrent,
  handleWikiArticle,
  handleWikiCleanupApply,
  handleWikiCleanupPreview,
  handleWikiLint,
} from "./routes/aftertaste.js";
import { handleGraph, handleTasteGraph } from "./routes/graph.js";

const cfg = parseArgs(process.argv);
ensureAftertasteWorkspace(cfg.wikiRoot);

const app = express();
app.use(express.json({ limit: "16mb" }));

// ── API ────────────────────────────────────────────────────────────────────
app.get("/api/captures", handleCaptureList(cfg));
app.post("/api/captures", handleCaptureCreate(cfg));
app.get("/api/captures/:id", handleCaptureDetail(cfg));
app.delete("/api/captures/:id", handleCaptureDelete(cfg));
app.post("/api/captures/:id/analyze", handleCaptureAnalyze(cfg));
app.post("/api/compile", handleCompile(cfg));
app.get("/api/wiki/article", handleWikiArticle(cfg));
app.get("/api/wiki/lint", handleWikiLint(cfg));
app.post("/api/wiki/cleanup/preview", handleWikiCleanupPreview(cfg));
app.post("/api/wiki/cleanup/apply", handleWikiCleanupApply(cfg));
app.get("/api/snapshot/current", handleSnapshotCurrent(cfg));
app.get("/api/references", handleReferences(cfg));
app.get("/api/references/:id/related", handleRelatedReferences(cfg));
app.get("/api/query", handleQueryIndex(cfg));
app.get("/api/briefs", handleBriefList(cfg));
app.get("/api/briefs/:id", handleBriefDetail(cfg));
app.post("/api/briefs", handleBriefCreate(cfg));
app.post("/api/ideas", handleIdeas(cfg));
app.get("/api/tree", handleTree(cfg));
app.get("/api/graph", handleGraph(cfg));
app.get("/api/graph/taste", handleTasteGraph(cfg));
app.get("/api/page", handlePage(cfg));
app.get("/api/raw", handleRaw(cfg));
app.get("/api/audit", handleAuditList(cfg));
app.post("/api/audit", handleAuditCreate(cfg));
app.patch("/api/audit/:id/resolve", handleAuditResolve(cfg));
app.get("/api/config", (_req, res) => {
  res.json({
    author: cfg.author,
    wikiRoot: path.basename(cfg.wikiRoot),
    productName: "Aftertaste",
    wikiTitle: path.basename(cfg.wikiRoot),
  });
});

// ── Static client ──────────────────────────────────────────────────────────
const here = path.dirname(url.fileURLToPath(import.meta.url));
const clientDist = path.resolve(here, "../dist/client");
if (!fs.existsSync(clientDist)) {
  console.warn(
    `warning: client bundle not found at ${clientDist}. Run 'npm run build' first.`,
  );
}
app.use("/assets", express.static(path.join(clientDist, "assets")));
app.use("/katex", express.static(path.resolve(here, "../node_modules/katex/dist")));
app.get("/", (_req, res) => {
  const index = path.join(clientDist, "index.html");
  if (fs.existsSync(index)) {
    res.sendFile(index);
  } else {
    res.status(500).send("client bundle missing. Run: npm run build");
  }
});

// ── Start ───────────────────────────────────────────────────────────────────
app.listen(cfg.port, cfg.host, () => {
  console.log(`llm-wiki web server listening on http://${cfg.host}:${cfg.port}`);
  console.log(`  wiki root: ${cfg.wikiRoot}`);
  console.log(`  author:    ${cfg.author}`);
});
