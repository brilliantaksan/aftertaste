import type { Request, Response } from "express";
import type { ServerConfig } from "../config.js";
import {
  applyWikiCleanup,
  compileAftertaste,
  createProjectBrief,
  createCapture,
  deleteCapture,
  generateIdeas,
  getCaptureDetail,
  getCurrentSnapshot,
  getProjectBrief,
  getRelatedReferences,
  getWikiArticleDetail,
  lintWiki,
  listCaptures,
  listProjectBriefs,
  listReferences,
  planWikiCleanup,
  runAnalysis,
  searchQueryIndex,
} from "../aftertaste/service.js";
import { createRenderer } from "../render/markdown.js";
import type {
  BriefCreateRequest,
  CaptureAssetInput,
  CaptureCreateRequest,
  IdeaRequest,
  ProjectBrief,
  QueryIndexEntry,
  SourceKind,
  WikiArticleDetail,
} from "../../shared/contracts.js";

export function handleCaptureCreate(cfg: ServerConfig) {
  return async (req: Request, res: Response) => {
    try {
      const body = req.body as CaptureCreateRequest;
      if (!body?.sourceUrl || typeof body.sourceUrl !== "string") {
        res.status(400).json({ error: "sourceUrl is required" });
        return;
      }
      if (body.note != null && typeof body.note !== "string") {
        res.status(400).json({ error: "note must be a string" });
        return;
      }
      if (body.sourceKind != null && !isSourceKind(body.sourceKind)) {
        res.status(400).json({ error: "sourceKind must be reference, journal, brief, voice-note, or moodboard" });
        return;
      }
      if (body.savedReason != null && typeof body.savedReason !== "string") {
        res.status(400).json({ error: "savedReason must be a string" });
        return;
      }
      if (body.collection != null && typeof body.collection !== "string") {
        res.status(400).json({ error: "collection must be a string" });
        return;
      }
      if (body.projectIds != null && (!Array.isArray(body.projectIds) || !body.projectIds.every(isString))) {
        res.status(400).json({ error: "projectIds must be an array of strings" });
        return;
      }
      const assets = body.assets ?? [];
      if (!Array.isArray(assets) || !assets.every(isAssetInput)) {
        res.status(400).json({ error: "assets must be an array of base64-encoded file objects" });
        return;
      }
      const detail = await createCapture(cfg.wikiRoot, {
        sourceUrl: body.sourceUrl,
        note: body.note,
        sourceKind: body.sourceKind,
        savedReason: body.savedReason,
        collection: body.collection,
        projectIds: body.projectIds,
        assets,
      });
      res.status(201).json(detail);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  };
}

export function handleCaptureList(cfg: ServerConfig) {
  return (_req: Request, res: Response) => {
    try {
      res.json(listCaptures(cfg.wikiRoot));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  };
}

export function handleCaptureDetail(cfg: ServerConfig) {
  return (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: "capture id is required" });
        return;
      }
      res.json(getCaptureDetail(cfg.wikiRoot, id));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(message.includes("not found") ? 404 : 500).json({ error: message });
    }
  };
}

export function handleCaptureDelete(cfg: ServerConfig) {
  return (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: "capture id is required" });
        return;
      }
      deleteCapture(cfg.wikiRoot, id);
      res.json({ deleted: id });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(message.includes("not found") ? 404 : 500).json({ error: message });
    }
  };
}

export function handleCaptureAnalyze(cfg: ServerConfig) {
  return async (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: "capture id is required" });
        return;
      }
      const analysis = await runAnalysis(cfg.wikiRoot, id);
      const detail = getCaptureDetail(cfg.wikiRoot, id);
      res.json({ ...detail, analysis });
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(message.includes("not found") ? 404 : 500).json({ error: message });
    }
  };
}

export function handleCompile(cfg: ServerConfig) {
  return (_req: Request, res: Response) => {
    try {
      const result = compileAftertaste(cfg.wikiRoot);
      res.json({
        snapshot: result.snapshot,
        referencesCount: result.references.length,
        lint: lintWiki(cfg.wikiRoot, {
          references: result.references,
          snapshot: result.snapshot,
        }),
      });
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  };
}

export function handleWikiArticle(cfg: ServerConfig) {
  const renderer = createRenderer({ wikiRoot: cfg.wikiRoot });
  return (req: Request, res: Response) => {
    try {
      const pathValue = normalizeQuery(req.query.path) ?? "wiki/index.md";
      const article = getWikiArticleDetail(cfg.wikiRoot, pathValue);
      const rendered = article.raw ? renderer.render(article.raw) : null;
      const response: WikiArticleDetail = {
        ...article,
        html: rendered?.html,
      };
      res.json(response);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(message.includes("not found") ? 404 : 500).json({ error: message });
    }
  };
}

export function handleWikiLint(cfg: ServerConfig) {
  return (_req: Request, res: Response) => {
    try {
      res.json(lintWiki(cfg.wikiRoot));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  };
}

export function handleWikiCleanupPreview(cfg: ServerConfig) {
  return (_req: Request, res: Response) => {
    try {
      res.json(planWikiCleanup(cfg.wikiRoot));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  };
}

export function handleWikiCleanupApply(cfg: ServerConfig) {
  return async (_req: Request, res: Response) => {
    try {
      res.json(await applyWikiCleanup(cfg.wikiRoot));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  };
}

export function handleSnapshotCurrent(cfg: ServerConfig) {
  return (_req: Request, res: Response) => {
    try {
      res.json(getCurrentSnapshot(cfg.wikiRoot));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  };
}

export function handleReferences(cfg: ServerConfig) {
  return (req: Request, res: Response) => {
    try {
      res.json(
        listReferences(cfg.wikiRoot, {
          theme: normalizeQuery(req.query.theme),
          motif: normalizeQuery(req.query.motif),
          creator: normalizeQuery(req.query.creator),
          format: normalizeQuery(req.query.format),
          platform: normalizeQuery(req.query.platform),
          q: normalizeQuery(req.query.q),
        }),
      );
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  };
}

export function handleRelatedReferences(cfg: ServerConfig) {
  return (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: "reference id is required" });
        return;
      }
      res.json(getRelatedReferences(cfg.wikiRoot, id));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(message.includes("not found") ? 404 : 500).json({ error: message });
    }
  };
}

export function handleQueryIndex(cfg: ServerConfig) {
  return (req: Request, res: Response) => {
    try {
      res.json(
        searchQueryIndex(cfg.wikiRoot, {
          q: normalizeQuery(req.query.q),
          theme: normalizeQuery(req.query.theme),
          motif: normalizeQuery(req.query.motif),
          creator: normalizeQuery(req.query.creator),
          format: normalizeQuery(req.query.format),
          platform: normalizeQuery(req.query.platform),
          start: normalizeQuery(req.query.start),
          end: normalizeQuery(req.query.end),
          kind: normalizeKinds(req.query.kind),
          limit: normalizeLimit(req.query.limit),
        }),
      );
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  };
}

export function handleBriefCreate(cfg: ServerConfig) {
  return (req: Request, res: Response) => {
    try {
      const body = req.body as Partial<BriefCreateRequest>;
      if (typeof body.title !== "string" || !body.title.trim()) {
        res.status(400).json({ error: "title is required" });
        return;
      }
      if (body.mode !== "personal" && body.mode !== "client") {
        res.status(400).json({ error: "mode must be personal or client" });
        return;
      }
      if (!isDeliverableType(body.deliverableType)) {
        res.status(400).json({ error: "deliverableType must be hooks, script, shotlist, or concept" });
        return;
      }
      if (typeof body.goal !== "string" || !body.goal.trim()) {
        res.status(400).json({ error: "goal is required" });
        return;
      }

      const brief = createProjectBrief(cfg.wikiRoot, {
        title: body.title,
        mode: body.mode,
        deliverableType: body.deliverableType,
        goal: body.goal,
        audience: typeof body.audience === "string" ? body.audience : "",
        constraints: Array.isArray(body.constraints) ? body.constraints.filter(isString) : [],
        selectedReferenceIds: Array.isArray(body.selectedReferenceIds) ? body.selectedReferenceIds.filter(isString) : [],
      });
      res.status(201).json(brief);
    } catch (error) {
      res.status(400).json({ error: error instanceof Error ? error.message : String(error) });
    }
  };
}

export function handleBriefList(cfg: ServerConfig) {
  return (_req: Request, res: Response) => {
    try {
      res.json(listProjectBriefs(cfg.wikiRoot));
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  };
}

export function handleBriefDetail(cfg: ServerConfig) {
  return (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: "brief id is required" });
        return;
      }
      res.json(getProjectBrief(cfg.wikiRoot, id));
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      res.status(message.includes("not found") ? 404 : 500).json({ error: message });
    }
  };
}

export function handleIdeas(cfg: ServerConfig) {
  return async (req: Request, res: Response) => {
    try {
      const body = req.body as Partial<IdeaRequest>;
      const outputType = body.outputType ?? "hooks";
      if (outputType !== "hooks" && outputType !== "script" && outputType !== "shotlist") {
        res.status(400).json({ error: "outputType must be hooks, script, or shotlist" });
        return;
      }
      const response = await generateIdeas(cfg.wikiRoot, {
        snapshotId: body.snapshotId ?? null,
        referenceIds: Array.isArray(body.referenceIds) ? body.referenceIds.filter((value): value is string => typeof value === "string") : [],
        outputType,
        brief: typeof body.brief === "string" ? body.brief : "",
        briefId: typeof body.briefId === "string" && body.briefId.trim() ? body.briefId.trim() : null,
      });
      res.json(response);
    } catch (error) {
      res.status(500).json({ error: error instanceof Error ? error.message : String(error) });
    }
  };
}

function normalizeQuery(value: unknown): string | undefined {
  return typeof value === "string" && value.trim() ? value.trim() : undefined;
}

function normalizeKinds(value: unknown): QueryIndexEntry["kind"][] | undefined {
  const values = Array.isArray(value) ? value : typeof value === "string" ? [value] : [];
  const kinds = values.filter(isQueryKind);
  return kinds.length > 0 ? kinds : undefined;
}

function normalizeLimit(value: unknown): number | undefined {
  if (typeof value !== "string" || !value.trim()) return undefined;
  const parsed = Number.parseInt(value, 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : undefined;
}

function isAssetInput(value: unknown): value is CaptureAssetInput {
  if (!value || typeof value !== "object") return false;
  const item = value as Record<string, unknown>;
  return (
    typeof item.name === "string" &&
    typeof item.mediaType === "string" &&
    typeof item.dataBase64 === "string" &&
    (item.size == null || typeof item.size === "number")
  );
}

function isString(value: unknown): value is string {
  return typeof value === "string";
}

function isDeliverableType(value: unknown): value is ProjectBrief["deliverableType"] {
  return value === "hooks" || value === "script" || value === "shotlist" || value === "concept";
}

function isSourceKind(value: unknown): value is SourceKind {
  return value === "reference" || value === "journal" || value === "brief" || value === "voice-note" || value === "moodboard";
}

function isQueryKind(value: unknown): value is QueryIndexEntry["kind"] {
  return value === "reference" || value === "catalyst" || value === "wiki-article" || value === "snapshot" || value === "constitution" || value === "not-me" || value === "brief" || value === "creative-session";
}
