import type { Request, Response } from "express";
import type { ServerConfig } from "../config.js";
import {
  compileAftertaste,
  createCapture,
  generateIdeas,
  getCaptureDetail,
  getCurrentSnapshot,
  listCaptures,
  listReferences,
  runAnalysis,
} from "../aftertaste/service.js";
import type { CaptureAssetInput, CaptureCreateRequest, IdeaRequest } from "../../shared/contracts.js";

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
      const assets = body.assets ?? [];
      if (!Array.isArray(assets) || !assets.every(isAssetInput)) {
        res.status(400).json({ error: "assets must be an array of base64-encoded file objects" });
        return;
      }
      const detail = await createCapture(cfg.wikiRoot, {
        sourceUrl: body.sourceUrl,
        note: body.note,
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

export function handleCaptureAnalyze(cfg: ServerConfig) {
  return (req: Request, res: Response) => {
    try {
      const id = req.params.id;
      if (!id) {
        res.status(400).json({ error: "capture id is required" });
        return;
      }
      const analysis = runAnalysis(cfg.wikiRoot, id);
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
      });
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

export function handleIdeas(cfg: ServerConfig) {
  return (req: Request, res: Response) => {
    try {
      const body = req.body as Partial<IdeaRequest>;
      const outputType = body.outputType ?? "hooks";
      if (outputType !== "hooks" && outputType !== "script" && outputType !== "shotlist") {
        res.status(400).json({ error: "outputType must be hooks, script, or shotlist" });
        return;
      }
      const response = generateIdeas(cfg.wikiRoot, {
        snapshotId: body.snapshotId ?? null,
        referenceIds: Array.isArray(body.referenceIds) ? body.referenceIds.filter((value): value is string => typeof value === "string") : [],
        outputType,
        brief: typeof body.brief === "string" ? body.brief : "",
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
