import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import yaml from "js-yaml";
import { findPage } from "../render/markdown.js";
import type {
  AnalysisResult,
  BriefCreateRequest,
  BriefListResponse,
  CatalystRecord,
  CaptureAcquisitionRecord,
  CaptureAsset,
  CaptureAssetInput,
  CaptureCreateRequest,
  CaptureDetailResponse,
  CaptureListResponse,
  CaptureRecord,
  CreativeSessionRecord,
  IdeaDraft,
  IdeaGenerationContext,
  IdeaPlan,
  IdeaRequest,
  IdeaResponse,
  IdeaOutputType,
  MediaAnalysisArtifact,
  PersonalMoment,
  ProjectBrief,
  QueryIndexEntry,
  QuerySearchResponse,
  ReferenceMoment,
  RelatedReferencesResponse,
  ReferenceSummary,
  ReferencesFilters,
  ReferencesResponse,
  SignalTag,
  SourceKind,
  TasteGraph,
  TasteGraphEdge,
  TasteGraphEdgeKind,
  TasteGraphNode,
  TasteSnapshot,
  TranscriptArtifact,
  UrlMetadata,
  WikiArticleDetail,
  WikiArticleKind,
  WikiCleanupAction,
  WikiCleanupPreview,
  WikiLintIssue,
  WikiLintIssueKind,
  WikiLintReport,
} from "../../shared/contracts.js";
import { generateConceptArticle, generateIdeaPlan, transcribeAudioFile } from "./llm.js";
import { resolveMediaAnalysisArtifact as resolveMediaAnalysisWithAdapter } from "./media-analysis.js";

interface SignalRule {
  slug: string;
  label: string;
  keywords: string[];
}

interface AftertastePaths {
  root: string;
  claude: string;
  logDir: string;
  auditDir: string;
  auditResolvedDir: string;
  rawInboxDir: string;
  rawCapturesDir: string;
  rawMediaDir: string;
  wikiDir: string;
  wikiReferencesDir: string;
  wikiThemesDir: string;
  wikiMotifsDir: string;
  wikiCreatorsDir: string;
  wikiFormatsDir: string;
  wikiConceptsDir: string;
  wikiSnapshotsDir: string;
  wikiStyleConstitution: string;
  wikiNotMe: string;
  wikiIndex: string;
  outputsAppDir: string;
  outputsCatalystsDir: string;
  outputsBriefsDir: string;
  outputsIdeasDir: string;
  snapshotJson: string;
  referencesJson: string;
  queryIndexJson: string;
  creativeSessionsJson: string;
  tasteGraphJson: string;
  wikiLintJson: string;
}

interface CompiledReferenceInput {
  capture: CaptureRecord;
  analysis: AnalysisResult;
  pagePath: string;
}

interface ConceptArticleInput {
  kind: Exclude<WikiArticleKind, "reference" | "snapshot" | "constitution" | "not-me" | "index" | "unknown">;
  slug: string;
  label: string;
  path: string;
  references: ReferenceSummary[];
  root: string;
  snapshot: TasteSnapshot;
}

const MAX_RELATED_REFERENCES = 6;
const MAX_QUERY_RESULTS = 12;

const CREATIVE_GUARDRAILS = [
  "Voice-first. Reuse the creator's actual language when it is usable.",
  "Mark personal moments with placeholders instead of writing them for the creator.",
  "Use exploratory language only. Avoid prescriptive phrasing.",
  "Act as a connection-finder grounded in saved references.",
  "Keep the option set small.",
];

const CONTRAST_RULES = [
  {
    left: "discipline",
    right: "tenderness",
    label: "Tenderness vs Discipline",
    summary: "The archive wants softness and rigor at the same time.",
  },
  {
    left: "ambition",
    right: "intimacy",
    label: "Ambition vs Intimacy",
    summary: "The work keeps balancing forward motion against private emotional scale.",
  },
  {
    left: "restlessness",
    right: "reflection",
    label: "Restlessness vs Reflection",
    summary: "There is a pull between movement and slowing down long enough to name what matters.",
  },
];

const THEME_RULES: SignalRule[] = [
  { slug: "long-distance", label: "Long Distance", keywords: ["long distance", "far away", "miles apart", "distance", "separated", "absence"] },
  { slug: "tenderness", label: "Tenderness", keywords: ["soft", "tender", "gentle", "care", "warm", "comfort", "intimate"] },
  { slug: "discipline", label: "Discipline", keywords: ["discipline", "routine", "practice", "focus", "consistency", "habit", "grind"] },
  { slug: "identity", label: "Identity", keywords: ["identity", "who i am", "becoming", "self", "version of me", "name", "belonging"] },
  { slug: "ambition", label: "Ambition", keywords: ["ambition", "career", "dream", "goal", "building", "future", "making it"] },
  { slug: "reflection", label: "Reflection", keywords: ["journal", "reflect", "thinking", "processing", "note to self", "learned"] },
  { slug: "intimacy", label: "Intimacy", keywords: ["relationship", "love", "close", "hold", "together", "private", "heart"] },
  { slug: "restlessness", label: "Restlessness", keywords: ["bored", "stuck", "restless", "drift", "waiting", "itch", "unsettled"] },
];

const MOTIF_RULES: SignalRule[] = [
  { slug: "voiceover", label: "Voiceover", keywords: ["voiceover", "voice over", "narration", "monologue", "spoken"] },
  { slug: "text-overlay", label: "Text Overlay", keywords: ["subtitle", "captions", "text overlay", "on screen text", "lower third", "typography"] },
  { slug: "close-up", label: "Close-Up", keywords: ["close-up", "close up", "close shot", "eyes", "face"] },
  { slug: "montage", label: "Montage", keywords: ["montage", "sequence", "cut together", "b-roll", "moments"] },
  { slug: "handheld", label: "Handheld", keywords: ["handheld", "raw camera", "camcorder", "phone footage"] },
  { slug: "ambient-audio", label: "Ambient Audio", keywords: ["ambient", "room tone", "sound design", "breath", "silence", "rain"] },
  { slug: "slow-zoom", label: "Slow Zoom", keywords: ["slow zoom", "push in", "dolly", "zoom"] },
  { slug: "soft-color", label: "Soft Color", keywords: ["warm grade", "muted", "soft color", "beige", "cream", "washed"] },
];

const FORMAT_RULES: SignalRule[] = [
  { slug: "talking-head", label: "Talking Head", keywords: ["talking head", "to camera", "camera", "monologue", "direct address"] },
  { slug: "voiceover-montage", label: "Voiceover Montage", keywords: ["voiceover montage", "voiceover", "b-roll", "montage"] },
  { slug: "micro-essay", label: "Micro Essay", keywords: ["essay", "argument", "premise", "point", "lesson", "insight"] },
  { slug: "pov-diary", label: "POV Diary", keywords: ["pov", "diary", "journal", "today i", "day in the life"] },
  { slug: "shot-list-reference", label: "Shot List Reference", keywords: ["shot list", "shots", "framing", "blocking", "sequence"] },
  { slug: "tutorial-breakdown", label: "Tutorial Breakdown", keywords: ["tutorial", "how to", "breakdown", "explainer", "step by step"] },
];

const TONE_RULES: SignalRule[] = [
  { slug: "tender", label: "Tender", keywords: ["soft", "tender", "gentle", "care", "warm", "intimate"] },
  { slug: "wistful", label: "Wistful", keywords: ["distance", "absence", "miss", "ache", "memory", "longing"] },
  { slug: "restrained", label: "Restrained", keywords: ["quiet", "deliberate", "subtle", "minimal", "still"] },
  { slug: "raw", label: "Raw", keywords: ["raw", "unfiltered", "voice note", "messy", "honest"] },
  { slug: "grounded", label: "Grounded", keywords: ["routine", "daily", "ordinary", "domestic", "real"] },
  { slug: "cinematic", label: "Cinematic", keywords: ["cinematic", "filmic", "moody", "atmosphere", "scene"] },
];

const VISUAL_RULES: SignalRule[] = [
  { slug: "close-detail", label: "Close Detail", keywords: ["close-up", "close up", "detail", "hands", "face", "eyes"] },
  { slug: "available-light", label: "Available Light", keywords: ["window light", "natural light", "soft light", "lamp", "sunrise"] },
  { slug: "negative-space", label: "Negative Space", keywords: ["negative space", "empty room", "wide frame", "still frame"] },
  { slug: "handheld-texture", label: "Handheld Texture", keywords: ["handheld", "phone footage", "camcorder", "raw camera"] },
  { slug: "movement-trace", label: "Movement Trace", keywords: ["walk", "train", "transit", "movement", "blur"] },
  { slug: "palette-warm", label: "Warm Palette", keywords: ["warm grade", "beige", "cream", "muted", "soft color"] },
];

const AUDIO_RULES: SignalRule[] = [
  { slug: "spoken-voice", label: "Spoken Voice", keywords: ["voiceover", "narration", "voice note", "spoken", "monologue"] },
  { slug: "ambient-room-tone", label: "Ambient Room Tone", keywords: ["ambient", "room tone", "silence", "rain", "street hum"] },
  { slug: "music-led", label: "Music-Led", keywords: ["song", "score", "soundtrack", "music"] },
  { slug: "breath-pauses", label: "Breath And Pauses", keywords: ["breath", "pause", "whisper", "quiet"] },
];

const PACING_RULES: SignalRule[] = [
  { slug: "lingering", label: "Lingering", keywords: ["slow", "linger", "held", "patient", "still"] },
  { slug: "steady-build", label: "Steady Build", keywords: ["build", "gradual", "unfolding", "routine"] },
  { slug: "quick-cut", label: "Quick Cut", keywords: ["quick", "rapid", "fast", "cut together"] },
  { slug: "diary-drift", label: "Diary Drift", keywords: ["diary", "drift", "wandering", "unhurried"] },
];

const STORY_RULES: SignalRule[] = [
  { slug: "confession", label: "Confession", keywords: ["admit", "say out loud", "confession", "honest"] },
  { slug: "observation", label: "Observation", keywords: ["noticing", "watching", "small detail", "observing"] },
  { slug: "transformation", label: "Transformation", keywords: ["becoming", "change", "shift", "before and after"] },
  { slug: "memory-return", label: "Memory Return", keywords: ["remember", "returning", "again", "keeps coming back"] },
  { slug: "instruction", label: "Instruction", keywords: ["how to", "breakdown", "explain", "step by step"] },
  { slug: "relationship-tension", label: "Relationship Tension", keywords: ["friend", "love", "apart", "distance", "together"] },
];

const FALLBACK_THEMES: SignalRule[] = [
  { slug: "daily-texture", label: "Daily Texture", keywords: [] },
  { slug: "private-voice", label: "Private Voice", keywords: [] },
];

const FALLBACK_MOTIFS: SignalRule[] = [
  { slug: "observational-b-roll", label: "Observational B-Roll", keywords: [] },
  { slug: "soft-pacing", label: "Soft Pacing", keywords: [] },
];

const SOURCE_KIND_HINTS: Record<SourceKind, string> = {
  reference: "reference inspiration saved reel visual example creator pull",
  journal: "journal reflection diary note to self private processing inner monologue",
  brief: "brief concept client deliverable constraints objective creative direction",
  "voice-note": "voice note spoken thought audio narration monologue cadence room tone",
  moodboard: "moodboard visual palette texture framing composition image board atmosphere",
};

export function getAftertastePaths(root: string): AftertastePaths {
  return {
    root,
    claude: path.join(root, "CLAUDE.md"),
    logDir: path.join(root, "log"),
    auditDir: path.join(root, "audit"),
    auditResolvedDir: path.join(root, "audit", "resolved"),
    rawInboxDir: path.join(root, "raw", "inbox"),
    rawCapturesDir: path.join(root, "raw", "captures"),
    rawMediaDir: path.join(root, "raw", "media"),
    wikiDir: path.join(root, "wiki"),
    wikiReferencesDir: path.join(root, "wiki", "references"),
    wikiThemesDir: path.join(root, "wiki", "themes"),
    wikiMotifsDir: path.join(root, "wiki", "motifs"),
    wikiCreatorsDir: path.join(root, "wiki", "creators"),
    wikiFormatsDir: path.join(root, "wiki", "formats"),
    wikiConceptsDir: path.join(root, "wiki", "concepts"),
    wikiSnapshotsDir: path.join(root, "wiki", "snapshots"),
    wikiStyleConstitution: path.join(root, "wiki", "style-constitution.md"),
    wikiNotMe: path.join(root, "wiki", "not-me.md"),
    wikiIndex: path.join(root, "wiki", "index.md"),
    outputsAppDir: path.join(root, "outputs", "app"),
    outputsCatalystsDir: path.join(root, "outputs", "catalysts"),
    outputsBriefsDir: path.join(root, "outputs", "briefs"),
    outputsIdeasDir: path.join(root, "outputs", "ideas"),
    snapshotJson: path.join(root, "outputs", "app", "snapshot-current.json"),
    referencesJson: path.join(root, "outputs", "app", "references.json"),
    queryIndexJson: path.join(root, "outputs", "app", "query-index.json"),
    creativeSessionsJson: path.join(root, "outputs", "app", "creative-sessions.json"),
    tasteGraphJson: path.join(root, "outputs", "app", "taste-graph.json"),
    wikiLintJson: path.join(root, "outputs", "app", "wiki-lint.json"),
  };
}

export function ensureAftertasteWorkspace(root: string): void {
  const paths = getAftertastePaths(root);
  const dirs = [
    paths.logDir,
    paths.auditDir,
    paths.auditResolvedDir,
    paths.rawInboxDir,
    paths.rawCapturesDir,
    paths.rawMediaDir,
    paths.wikiDir,
    paths.wikiReferencesDir,
    paths.wikiThemesDir,
    paths.wikiMotifsDir,
    paths.wikiCreatorsDir,
    paths.wikiFormatsDir,
    paths.wikiConceptsDir,
    paths.wikiSnapshotsDir,
    paths.outputsAppDir,
    paths.outputsCatalystsDir,
    paths.outputsBriefsDir,
    paths.outputsIdeasDir,
  ];
  for (const dir of dirs) {
    fs.mkdirSync(dir, { recursive: true });
  }
  writeIfMissing(paths.auditDir + "/.gitkeep", "");
  writeIfMissing(paths.auditResolvedDir + "/.gitkeep", "");
  writeIfMissing(paths.claude, defaultClaudeTemplate());
  writeIfMissing(paths.wikiStyleConstitution, defaultStyleConstitutionPage());
  writeIfMissing(paths.wikiNotMe, defaultNotMePage());
  writeIfMissing(paths.wikiIndex, defaultIndexPage());
  ensureTodayLog(paths.logDir);
}

export async function createCapture(
  root: string,
  input: CaptureCreateRequest,
): Promise<CaptureDetailResponse> {
  ensureAftertasteWorkspace(root);

  const sourceUrl = normalizeSourceUrl(input.sourceUrl);
  const note = (input.note ?? "").trim();
  const sourceKind = input.sourceKind ?? "reference";
  const savedReason = (input.savedReason ?? note).trim() || null;
  const collection = (input.collection ?? "").trim() || null;
  const projectIds = uniqueStrings((input.projectIds ?? []).map((value) => value.trim()).filter(Boolean)).slice(0, 8);
  const createdAt = new Date().toISOString();
  const id = makeCaptureId();
  const metadata = await fetchUrlMetadata(sourceUrl);
  const platform = detectPlatform(sourceUrl);
  const assetDir = path.join(getAftertastePaths(root).rawMediaDir, id);
  const assets = writeAssets(assetDir, input.assets ?? []).map((asset) => ({
    ...asset,
    path: toRel(root, asset.path),
  }));
  const ingestionMode = deriveIngestionMode(note, assets.length);
  const acquisition = deriveCaptureAcquisition(sourceUrl, assets, createdAt);

  const record: CaptureRecord = {
    id,
    sourceUrl,
    platform,
    note,
    sourceKind,
    savedReason,
    collection,
    projectIds,
    assets,
    ingestionMode,
    status: "captured",
    createdAt,
    updatedAt: createdAt,
    acquisition,
    rawPaths: {
      inbox: toRel(root, path.join(root, "raw", "inbox", `${id}.md`)),
      capture: toRel(root, path.join(root, "raw", "captures", `${id}.json`)),
      analysis: null,
      assetsDir: assets.length > 0 ? toRel(root, assetDir) : null,
      referencePage: null,
      artifacts: {
        transcript: null,
        mediaAnalysis: null,
      },
    },
    metadata,
  };

  writeText(path.join(root, record.rawPaths.inbox), buildInboxMarkdown(record));
  writeJson(path.join(root, record.rawPaths.capture), record);
  appendLog(root, `## [${timeStamp()}] capture | ${id} — ${platform} link saved`);

  const analysis = await runAnalysis(root, id);
  const compiled = compileAftertaste(root);
  return {
    capture: readCapture(root, id),
    analysis,
    reference: compiled.references.find((reference) => reference.id === id) ?? null,
  };
}

export function listCaptures(root: string): CaptureListResponse {
  ensureAftertasteWorkspace(root);
  return { captures: readAllCaptures(root).sort(sortByCreatedDesc) };
}

export function getCaptureDetail(root: string, id: string): CaptureDetailResponse {
  ensureAftertasteWorkspace(root);
  const capture = readCapture(root, id);
  const analysis = readAnalysis(root, id);
  const reference = listReferences(root).references.find((item) => item.id === id) ?? null;
  return { capture, analysis, reference };
}

export function deleteCapture(root: string, id: string): void {
  ensureAftertasteWorkspace(root);
  const capture = readCapture(root, id);
  const safeRemove = (rel: string | null | undefined) => {
    if (!rel) return;
    try { fs.unlinkSync(path.join(root, rel)); } catch { /* already gone */ }
  };
  safeRemove(capture.rawPaths.capture);
  safeRemove(capture.rawPaths.inbox);
  safeRemove(capture.rawPaths.analysis);
  safeRemove(capture.rawPaths.artifacts.transcript);
  safeRemove(capture.rawPaths.artifacts.mediaAnalysis);
  safeRemove(capture.rawPaths.referencePage);
  // Remove the whole media dir (covers assets and any other artifacts)
  const mediaDir = path.join(root, "raw", "media", id);
  if (fs.existsSync(mediaDir)) fs.rmSync(mediaDir, { recursive: true, force: true });
  compileAftertaste(root);
  appendLog(root, `## [${timeStamp()}] delete | ${id} — capture removed`);
}

export async function runAnalysis(root: string, captureId: string): Promise<AnalysisResult> {
  ensureAftertasteWorkspace(root);
  const paths = getAftertastePaths(root);
  const capture = readCapture(root, captureId);
  const transcriptArtifact = await ensureTranscriptArtifact(root, capture);
  const mediaAnalysisArtifact = await ensureMediaAnalysisArtifact(root, capture, transcriptArtifact);
  const combinedText = collectCaptureText(capture, transcriptArtifact.text);
  const creatorSignals = extractCreatorSignals(capture);
  const themes = rankSignals(combinedText, THEME_RULES, FALLBACK_THEMES, capture.assets);
  const motifs = rankSignals(combinedText, MOTIF_RULES, FALLBACK_MOTIFS, capture.assets);
  const formatSignals = rankSignals(combinedText, FORMAT_RULES, [], capture.assets);
  const toneSignals = rankAnalysisSignals(combinedText, TONE_RULES, [], capture);
  const visualSignals =
    mediaAnalysisArtifact.status === "ok" && mediaAnalysisArtifact.visualSignals.length > 0
      ? mediaAnalysisArtifact.visualSignals
      : rankAnalysisSignals(combinedText, VISUAL_RULES, [], capture);
  const audioSignals =
    mediaAnalysisArtifact.status === "ok" && mediaAnalysisArtifact.audioSignals.length > 0
      ? mediaAnalysisArtifact.audioSignals
      : rankAnalysisSignals(combinedText, AUDIO_RULES, [], capture);
  const pacingSignals = rankAnalysisSignals(combinedText, PACING_RULES, [], capture);
  const storySignals =
    mediaAnalysisArtifact.status === "ok" && mediaAnalysisArtifact.storySignals.length > 0
      ? mediaAnalysisArtifact.storySignals
      : rankAnalysisSignals(combinedText, STORY_RULES, [], capture);
  const openQuestions = buildAnalysisOpenQuestions(capture, {
    themes,
    toneSignals,
    visualSignals,
    audioSignals,
    storySignals,
  });
  const moments = buildAnalysisMoments(capture, {
    themes,
    motifs,
    toneSignals,
    visualSignals,
    audioSignals,
    pacingSignals,
    storySignals,
    mediaAnalysisArtifact,
  });
  const summary = summarizeCapture(capture, themes, motifs, formatSignals, creatorSignals, {
    toneSignals,
    visualSignals,
    audioSignals,
    storySignals,
  });
  const analysis: AnalysisResult = {
    captureId,
    mode: capture.assets.length > 0 ? "hybrid" : "text-first",
    caption: pickReferenceTitle(capture),
    transcript: buildTranscript(capture, transcriptArtifact),
    transcriptProvenance: {
      artifactPath: capture.rawPaths.artifacts.transcript ?? toRel(root, getTranscriptArtifactPath(root, captureId)),
      source: transcriptArtifact.source,
      status: transcriptArtifact.status,
      sourceKind: capture.sourceKind,
    },
    ocr: capture.assets
      .filter((asset) => asset.kind === "image" || asset.kind === "video")
      .map((asset) => asset.originalName.replace(/\.[^.]+$/, ""))
      .join(" · "),
    themes,
    motifs,
    creatorSignals,
    formatSignals,
    toneSignals,
    visualSignals,
    audioSignals,
    pacingSignals,
    storySignals,
    summary,
    confidence: Math.min(0.94, 0.52 + themes.length * 0.08 + motifs.length * 0.06 + (capture.assets.length > 0 ? 0.08 : 0)),
    assetInsights: buildAssetInsights(capture, mediaAnalysisArtifact),
    openQuestions,
    moments,
    generatedAt: new Date().toISOString(),
  };

  const analysisPath = path.join(paths.rawMediaDir, captureId, "analysis.json");
  fs.mkdirSync(path.dirname(analysisPath), { recursive: true });
  writeJson(analysisPath, analysis);

  const updatedCapture: CaptureRecord = {
    ...capture,
    status: "analyzed",
    updatedAt: analysis.generatedAt,
    rawPaths: {
      ...capture.rawPaths,
      analysis: toRel(root, analysisPath),
      assetsDir: capture.rawPaths.assetsDir,
      referencePage: capture.rawPaths.referencePage,
      artifacts: {
        transcript: toRel(root, getTranscriptArtifactPath(root, captureId)),
        mediaAnalysis: toRel(root, getMediaAnalysisArtifactPath(root, captureId)),
      },
    },
  };
  writeJson(path.join(root, updatedCapture.rawPaths.capture), updatedCapture);
  appendLog(root, `## [${timeStamp()}] analyze | ${captureId} — ${analysis.mode}`);
  return analysis;
}

export function compileAftertaste(root: string): {
  snapshot: TasteSnapshot;
  references: ReferenceSummary[];
  catalysts: CatalystRecord[];
  lint: WikiLintReport;
} {
  return compileWiki(root);
}

export function compileWiki(root: string): {
  snapshot: TasteSnapshot;
  references: ReferenceSummary[];
  catalysts: CatalystRecord[];
  lint: WikiLintReport;
} {
  ensureAftertasteWorkspace(root);
  const compiledAt = new Date().toISOString();
  const compiledReferences = compileReferences(root);
  const references = compileReferenceSummaries(root, compiledReferences, compiledAt);
  const snapshot = compileAggregates(root, references, compiledAt);
  const catalysts = compileCatalysts(root, references, snapshot);
  compileQueryIndex(root, references, catalysts, snapshot);
  compileTasteGraph(root, references, catalysts, snapshot);
  const lint = lintWiki(root, { references, snapshot });
  compileQueryIndex(root, references, catalysts, snapshot);

  appendLog(root, `## [${timeStamp()}] compile | rebuilt Aftertaste pages (${references.length} references)`);
  return { snapshot, references, catalysts, lint };
}

export function getCurrentSnapshot(root: string): TasteSnapshot {
  ensureAftertasteWorkspace(root);
  const paths = getAftertastePaths(root);
  if (!fs.existsSync(paths.snapshotJson)) {
    return compileAftertaste(root).snapshot;
  }
  return withSnapshotDefaults(readJson<TasteSnapshot>(paths.snapshotJson));
}

export function listReferences(
  root: string,
  filters?: {
    theme?: string;
    motif?: string;
    creator?: string;
    format?: string;
    platform?: string;
    q?: string;
  },
): ReferencesResponse {
  ensureAftertasteWorkspace(root);
  if (!fs.existsSync(getAftertastePaths(root).referencesJson)) {
    compileAftertaste(root);
  }
  const all = readCompiledReferences(root);
  const filtered = all.filter((reference) => matchReference(reference, filters));
  return {
    references: filtered,
    filters: buildFilters(all),
  };
}

export function searchQueryIndex(
  root: string,
  filters?: {
    q?: string;
    theme?: string;
    motif?: string;
    creator?: string;
    format?: string;
    platform?: string;
    start?: string;
    end?: string;
    kind?: QueryIndexEntry["kind"][];
    limit?: number;
  },
): QuerySearchResponse {
  ensureAftertasteWorkspace(root);
  const references = readCompiledReferences(root);
  const entries = syncQueryIndex(root, references);
  const referencesById = new Map(references.map((reference) => [reference.id, reference]));
  const filtered = entries
    .filter((entry) => matchQueryEntry(entry, referencesById, filters))
    .sort((left, right) => scoreQueryEntry(right, filters) - scoreQueryEntry(left, filters) || left.title.localeCompare(right.title))
    .slice(0, filters?.limit ?? MAX_QUERY_RESULTS);

  return {
    results: filtered,
  };
}

export function getTasteGraph(root: string): TasteGraph {
  ensureAftertasteWorkspace(root);
  const filePath = getAftertastePaths(root).tasteGraphJson;
  if (!fs.existsSync(filePath)) {
    compileAftertaste(root);
  }
  return withTasteGraphDefaults(readJson<TasteGraph>(filePath));
}

export function getRelatedReferences(root: string, referenceId: string): RelatedReferencesResponse {
  ensureAftertasteWorkspace(root);
  if (!fs.existsSync(getAftertastePaths(root).referencesJson)) {
    compileAftertaste(root);
  }

  const references = readCompiledReferences(root);
  const reference = references.find((item) => item.id === referenceId);
  if (!reference) {
    throw new Error(`reference not found: ${referenceId}`);
  }

  const referencesById = new Map(references.map((item) => [item.id, item]));
  const related = reference.relatedReferenceIds
    .map((id) => referencesById.get(id))
    .filter((item): item is ReferenceSummary => item != null);
  const catalysts = readCatalysts(root).filter((catalyst) => catalyst.referenceIds.includes(referenceId));

  return {
    referenceId,
    related,
    catalysts,
  };
}

export function createProjectBrief(root: string, input: BriefCreateRequest): ProjectBrief {
  ensureAftertasteWorkspace(root);
  const title = (input.title ?? "").trim();
  const goal = (input.goal ?? "").trim();
  if (!title) {
    throw new Error("title is required");
  }
  if (!goal) {
    throw new Error("goal is required");
  }

  const createdAt = new Date().toISOString();
  const references = readCompiledReferences(root);
  const knownReferenceIds = new Set(references.map((reference) => reference.id));
  const brief: ProjectBrief = {
    id: `brief-${createdAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${crypto.randomBytes(2).toString("hex")}`,
    title,
    mode: input.mode === "client" ? "client" : "personal",
    deliverableType: input.deliverableType,
    goal,
    audience: (input.audience ?? "").trim(),
    constraints: uniqueStrings((input.constraints ?? []).map((constraint) => constraint.trim()).filter(Boolean)),
    selectedReferenceIds: uniqueStrings(
      (input.selectedReferenceIds ?? []).filter((referenceId) => knownReferenceIds.has(referenceId)),
    ),
    voiceGuardrails: CREATIVE_GUARDRAILS,
    createdAt,
    updatedAt: createdAt,
  };

  writeJson(path.join(getAftertastePaths(root).outputsBriefsDir, `${brief.id}.json`), brief);
  syncQueryIndex(root, references);
  syncTasteGraph(root, references);
  appendLog(root, `## [${timeStamp()}] brief | ${brief.id} — ${brief.title}`);
  return brief;
}

export function listProjectBriefs(root: string): BriefListResponse {
  ensureAftertasteWorkspace(root);
  return {
    briefs: readProjectBriefs(root),
  };
}

export function getProjectBrief(root: string, briefId: string): ProjectBrief {
  ensureAftertasteWorkspace(root);
  const filePath = path.join(getAftertastePaths(root).outputsBriefsDir, `${briefId}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`brief not found: ${briefId}`);
  }
  return withProjectBriefDefaults(readJson<ProjectBrief>(filePath));
}

export async function generateIdeas(root: string, request: IdeaRequest): Promise<IdeaResponse> {
  ensureAftertasteWorkspace(root);
  const snapshot = getCurrentSnapshot(root);
  const references = readCompiledReferences(root);
  const brief = request.briefId ? getProjectBrief(root, request.briefId) : null;
  const selected = selectIdeaReferences(request, snapshot, references, brief);
  const effectiveBrief = buildEffectiveBrief(request.brief, brief);
  const generatedAt = new Date().toISOString();
  const context = buildIdeaGenerationContext(root, {
    outputType: request.outputType,
    briefText: effectiveBrief,
    brief,
    snapshot,
    selectedReferences: selected,
  });
  const plan = (await generateIdeaPlan(context)) ?? buildFallbackIdeaPlan(context);
  const outputs = renderIdeaPlan(plan, context);
  const session = buildCreativeSessionRecord(context, plan, generatedAt);
  const response: IdeaResponse = {
    request,
    snapshot,
    context,
    session,
    outputs,
    generatedAt,
  };
  writeJson(path.join(getAftertastePaths(root).outputsIdeasDir, `${snapshot.id}-${Date.now()}.json`), response);
  writeCreativeSession(root, session);
  appendLog(
    root,
    `## [${timeStamp()}] ideas | ${request.outputType} — ${selected.length} references used${brief ? ` | brief ${brief.id}` : ""}`,
  );
  return response;
}

function normalizeSourceUrl(value: string): string {
  let parsed: URL;
  try {
    parsed = new URL(value);
  } catch {
    throw new Error("sourceUrl must be a valid URL");
  }
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error("sourceUrl must use http or https");
  }
  return parsed.toString();
}

async function fetchUrlMetadata(sourceUrl: string): Promise<UrlMetadata> {
  try {
    const response = await fetch(sourceUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(3000),
      headers: {
        "user-agent": "Aftertaste/0.1 (+local-first)",
      },
    });
    if (!response.ok) {
      return {
        title: null,
        description: null,
        canonicalUrl: null,
        siteName: null,
        fetchedAt: new Date().toISOString(),
        status: "error",
        error: `metadata fetch failed with ${response.status}`,
      };
    }
    const html = await response.text();
    return {
      title: readMeta(html, "property", "og:title") ?? readMeta(html, "name", "twitter:title") ?? readTitle(html),
      description:
        readMeta(html, "property", "og:description") ??
        readMeta(html, "name", "description") ??
        readMeta(html, "name", "twitter:description"),
      canonicalUrl: readCanonicalUrl(html),
      siteName: readMeta(html, "property", "og:site_name"),
      fetchedAt: new Date().toISOString(),
      status: "ok",
    };
  } catch (error) {
    return {
      title: null,
      description: null,
      canonicalUrl: null,
      siteName: null,
      fetchedAt: new Date().toISOString(),
      status: "error",
      error: error instanceof Error ? error.message : String(error),
    };
  }
}

function readMeta(html: string, attr: string, key: string): string | null {
  const pattern = new RegExp(`<meta[^>]*${attr}=["']${escapeRegex(key)}["'][^>]*content=["']([^"']+)["'][^>]*>`, "i");
  const reversedPattern = new RegExp(`<meta[^>]*content=["']([^"']+)["'][^>]*${attr}=["']${escapeRegex(key)}["'][^>]*>`, "i");
  return decodeEntities(pattern.exec(html)?.[1] ?? reversedPattern.exec(html)?.[1] ?? "") || null;
}

function readCanonicalUrl(html: string): string | null {
  const pattern = /<link[^>]*rel=["']canonical["'][^>]*href=["']([^"']+)["'][^>]*>/i;
  return decodeEntities(pattern.exec(html)?.[1] ?? "") || null;
}

function readTitle(html: string): string | null {
  const pattern = /<title[^>]*>([^<]+)<\/title>/i;
  return decodeEntities(pattern.exec(html)?.[1] ?? "") || null;
}

function decodeEntities(value: string): string {
  return value
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .trim();
}

function escapeRegex(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

function detectPlatform(sourceUrl: string): string {
  const host = new URL(sourceUrl).hostname.replace(/^www\./, "");
  if (host.includes("instagram")) return "Instagram";
  if (host.includes("tiktok")) return "TikTok";
  if (host.includes("youtube")) return "YouTube";
  if (host.includes("twitter") || host.includes("x.com")) return "X";
  return host
    .split(".")[0]!
    .replace(/[-_]/g, " ")
    .replace(/\b\w/g, (letter) => letter.toUpperCase());
}

function writeAssets(dir: string, inputs: CaptureAssetInput[]): CaptureAsset[] {
  if (inputs.length === 0) return [];
  fs.mkdirSync(dir, { recursive: true });
  return inputs.map((input) => {
    const extension = safeExtension(input.name);
    const baseName = sanitizeFileName(path.basename(input.name, extension));
    const id = crypto.randomBytes(3).toString("hex");
    const fileName = `${baseName || "asset"}-${id}${extension}`;
    const fullPath = path.join(dir, fileName);
    const content = Buffer.from(stripDataPrefix(input.dataBase64), "base64");
    fs.writeFileSync(fullPath, content);
    return {
      id,
      fileName,
      originalName: input.name,
      mediaType: input.mediaType,
      size: input.size ?? content.byteLength,
      path: fullPath,
      kind: classifyAsset(input.mediaType),
    };
  });
}

function stripDataPrefix(value: string): string {
  const index = value.indexOf(",");
  return index >= 0 ? value.slice(index + 1) : value;
}

function safeExtension(fileName: string): string {
  const extension = path.extname(fileName).slice(0, 12);
  return extension || "";
}

function sanitizeFileName(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-+|-+$/g, "").slice(0, 48);
}

function classifyAsset(mediaType: string): CaptureAsset["kind"] {
  if (mediaType.startsWith("image/")) return "image";
  if (mediaType.startsWith("video/")) return "video";
  if (mediaType.startsWith("audio/")) return "audio";
  if (mediaType.includes("pdf") || mediaType.startsWith("text/")) return "document";
  return "other";
}

function deriveIngestionMode(note: string, assetCount: number): CaptureRecord["ingestionMode"] {
  if (note && assetCount > 0) return "link-note-upload";
  if (note) return "link-note";
  if (assetCount > 0) return "link-upload";
  return "link";
}

function deriveCaptureAcquisition(
  sourceUrl: string,
  assets: CaptureAsset[],
  createdAt: string,
): CaptureAcquisitionRecord {
  if (assets.length > 0) {
    if (isInstagramReelUrl(sourceUrl)) {
      return {
        mode: "user-upload",
        status: "ok",
        provider: "local-upload",
        acquiredAt: createdAt,
        sourceUrl,
        notes: [
          "Instagram Reel saved with local uploaded media bytes.",
          "The source URL remains a reference pointer; transcript and media analysis can use the uploaded file without implying public Reel extraction.",
        ],
      };
    }
    return {
      mode: "user-upload",
      status: "ok",
      provider: "local-upload",
      acquiredAt: createdAt,
      sourceUrl,
      notes: [
        "Capture includes local uploaded media bytes.",
      ],
    };
  }

  if (isInstagramReelUrl(sourceUrl)) {
    return {
      mode: "source-link",
      status: "unavailable",
      provider: "unknown",
      acquiredAt: null,
      sourceUrl,
      notes: [
        "Instagram Reel URL saved as a source pointer only.",
        "No media bytes were acquired during capture, so transcript and media understanding remain metadata-plus-note driven until a local upload or official acquisition path exists.",
      ],
    };
  }

  return {
    mode: "source-link",
    status: "pending",
    provider: "unknown",
    acquiredAt: null,
    sourceUrl,
    notes: [
      "Capture currently stores the source link only.",
      "Analyze may recover transcript text later, but no local media bytes have been acquired yet.",
    ],
  };
}

function isInstagramReelUrl(sourceUrl: string): boolean {
  try {
    const parsed = new URL(sourceUrl);
    const host = parsed.hostname.replace(/^www\./, "");
    return host.includes("instagram.com") && /^\/(?:reel|reels)\//.test(parsed.pathname);
  } catch {
    return false;
  }
}

function buildInboxMarkdown(record: CaptureRecord): string {
  const parts = [
    `# Capture ${record.id}`,
    "",
    "## Source",
    `- URL: ${record.sourceUrl}`,
    `- Platform: ${record.platform}`,
    `- Source kind: ${record.sourceKind}`,
    `- Saved: ${record.createdAt}`,
    `- Ingestion mode: ${record.ingestionMode}`,
    `- Saved reason: ${record.savedReason ?? "None"}`,
    `- Collection: ${record.collection ?? "None"}`,
    `- Project IDs: ${record.projectIds.join(", ") || "None"}`,
    `- Acquisition mode: ${record.acquisition?.mode ?? "source-link"}`,
    `- Acquisition status: ${record.acquisition?.status ?? "pending"}`,
    `- Acquisition provider: ${record.acquisition?.provider ?? "unknown"}`,
    "",
    "## Why I saved this",
    record.note ? record.note : "_No note yet._",
    "",
    "## Metadata",
    `- Title: ${record.metadata.title ?? "Unknown"}`,
    `- Description: ${record.metadata.description ?? "None"}`,
    `- Site: ${record.metadata.siteName ?? record.platform}`,
    `- Metadata status: ${record.metadata.status}`,
  ];
  if (record.acquisition?.notes.length) {
    parts.push("", "## Acquisition", ...record.acquisition.notes.map((note) => `- ${note}`));
  }
  if (record.assets.length > 0) {
    parts.push("", "## Assets", ...record.assets.map((asset) => `- ${asset.originalName} (${asset.mediaType}, ${asset.size} bytes)`));
  }
  return parts.join("\n") + "\n";
}

function collectCaptureText(capture: CaptureRecord, transcriptText?: string): string {
  const creatorHandles = extractHandles(
    [capture.note, capture.savedReason, capture.metadata.title, capture.metadata.description, capture.sourceUrl].filter(Boolean).join(" "),
  );
  return [
    capture.sourceUrl,
    capture.note,
    capture.savedReason,
    capture.collection,
    capture.projectIds.join(" "),
    buildSourceKindHint(capture.sourceKind),
    capture.metadata.title,
    capture.metadata.description,
    capture.metadata.siteName,
    transcriptText,
    capture.assets.map((asset) => `${asset.originalName} ${asset.kind}`).join(" "),
    creatorHandles.join(" "),
  ]
    .filter(Boolean)
    .join(" \n ")
    .toLowerCase();
}

function extractCreatorSignals(capture: CaptureRecord): SignalTag[] {
  const handles = extractHandles(
    [capture.note, capture.savedReason, capture.metadata.title, capture.metadata.description, capture.sourceUrl].filter(Boolean).join(" "),
  );
  const unique = Array.from(new Set(handles));
  if (unique.length === 0) return [];
  return unique.slice(0, 4).map((handle, index) => ({
    slug: sanitizeFileName(handle.replace(/^@/, "")),
    label: handle,
    score: Math.max(0.65, 0.95 - index * 0.1),
    evidence: [`Mentioned in capture text as ${handle}`],
  }));
}

function extractHandles(text: string): string[] {
  const matches = text.match(/@[a-z0-9._-]{2,30}/gi) ?? [];
  return matches.map((match) => match.toLowerCase());
}

function buildSourceKindHint(sourceKind: SourceKind): string {
  return SOURCE_KIND_HINTS[sourceKind] ?? SOURCE_KIND_HINTS.reference;
}

function rankSignals(
  haystack: string,
  rules: SignalRule[],
  fallbacks: SignalRule[],
  assets: CaptureAsset[] = [],
): SignalTag[] {
  const ranked = rules
    .map((rule) => {
      const evidence: string[] = [];
      let matches = 0;
      for (const keyword of rule.keywords) {
        if (!keyword) continue;
        if (haystack.includes(keyword.toLowerCase())) {
          matches += 1;
          evidence.push(keyword);
        }
      }
      if (rule.slug === "voiceover" && assets.some((asset) => asset.kind === "audio")) {
        matches += 1;
        evidence.push("audio asset");
      }
      if (rule.slug === "voiceover-montage" && assets.some((asset) => asset.kind === "video")) {
        matches += 1;
        evidence.push("video upload");
      }
      if (rule.slug === "shot-list-reference" && assets.some((asset) => asset.kind === "image")) {
        matches += 1;
        evidence.push("image frames");
      }
      if (matches === 0) return null;
      return {
        slug: rule.slug,
        label: rule.label,
        score: Math.min(0.98, 0.52 + matches * 0.18),
        evidence,
      };
    })
    .filter((item): item is SignalTag => item !== null)
    .sort((a, b) => b.score - a.score);

  if (ranked.length === 0) {
    return fallbacks.slice(0, 2).map((rule, index) => ({
      slug: rule.slug,
      label: rule.label,
      score: 0.48 - index * 0.06,
      evidence: ["fallback signal from sparse local context"],
    }));
  }
  return ranked.slice(0, 4);
}

function rankAnalysisSignals(
  haystack: string,
  rules: SignalRule[],
  fallbacks: SignalRule[],
  capture: CaptureRecord,
): SignalTag[] {
  return aggregateSignals([
    ...rankSignals(haystack, rules, fallbacks, capture.assets),
    ...seedAnalysisSignals(capture, rules),
  ]).slice(0, 4);
}

function seedAnalysisSignals(capture: CaptureRecord, rules: SignalRule[]): SignalTag[] {
  const allowed = new Set(rules.map((rule) => rule.slug));
  const seeded: SignalTag[] = [];
  const push = (slug: string, label: string, evidence: string, score = 0.74) => {
    if (!allowed.has(slug)) return;
    seeded.push({ slug, label, score, evidence: [evidence] });
  };

  switch (capture.sourceKind) {
    case "journal":
      push("confession", "Confession", "journal source kind");
      push("diary-drift", "Diary Drift", "journal source kind");
      push("restrained", "Restrained", "journal source kind");
      break;
    case "brief":
      push("instruction", "Instruction", "brief source kind");
      push("steady-build", "Steady Build", "brief source kind");
      push("grounded", "Grounded", "brief source kind");
      break;
    case "voice-note":
      push("spoken-voice", "Spoken Voice", "voice-note source kind");
      push("raw", "Raw", "voice-note source kind");
      push("confession", "Confession", "voice-note source kind");
      break;
    case "moodboard":
      push("palette-warm", "Warm Palette", "moodboard source kind");
      push("close-detail", "Close Detail", "moodboard source kind");
      push("cinematic", "Cinematic", "moodboard source kind");
      break;
    default:
      break;
  }

  if (capture.assets.some((asset) => asset.kind === "image")) {
    push("close-detail", "Close Detail", "image asset");
    push("palette-warm", "Warm Palette", "image asset");
  }
  if (capture.assets.some((asset) => asset.kind === "video")) {
    push("movement-trace", "Movement Trace", "video asset");
    push("lingering", "Lingering", "video asset");
  }
  if (capture.assets.some((asset) => asset.kind === "audio")) {
    push("spoken-voice", "Spoken Voice", "audio asset");
    push("ambient-room-tone", "Ambient Room Tone", "audio asset");
    push("breath-pauses", "Breath And Pauses", "audio asset");
  }

  return seeded;
}

function summarizeCapture(
  capture: CaptureRecord,
  themes: SignalTag[],
  motifs: SignalTag[],
  formats: SignalTag[],
  creators: SignalTag[],
  extras: {
    toneSignals: SignalTag[];
    visualSignals: SignalTag[];
    audioSignals: SignalTag[];
    storySignals: SignalTag[];
  },
): string {
  const themeLabel = themes[0]?.label ?? "a developing thread";
  const motifLabel = motifs[0]?.label ?? "soft pacing";
  const formatLabel = formats[0]?.label ?? "a reflective short-form format";
  const creatorLabel = creators[0]?.label ? ` with a pull toward ${creators[0]!.label}` : "";
  const toneLabel = extras.toneSignals[0]?.label ? ` The tone lands as ${extras.toneSignals[0]!.label.toLowerCase()}.` : "";
  const visualLabel = extras.visualSignals[0]?.label ? ` Visually it leans on ${extras.visualSignals[0]!.label.toLowerCase()}.` : "";
  const audioLabel = extras.audioSignals[0]?.label ? ` Audio-wise it suggests ${extras.audioSignals[0]!.label.toLowerCase()}.` : "";
  const storyLabel = extras.storySignals[0]?.label ? ` Structurally it feels closest to ${extras.storySignals[0]!.label.toLowerCase()}.` : "";
  const noteSnippet = sentenceCase(truncate(capture.note || capture.savedReason || "", 90));
  const lead = summarizeCaptureLead(capture, noteSnippet);
  return `${lead} It reads as ${themeLabel.toLowerCase()} carried through ${motifLabel.toLowerCase()} in a ${formatLabel.toLowerCase()}${creatorLabel}.${toneLabel}${visualLabel}${audioLabel}${storyLabel}`.trim();
}

function buildTranscript(capture: CaptureRecord, artifact?: TranscriptArtifact | null): string {
  if (artifact?.text.trim()) {
    return artifact.text.trim();
  }
  return buildStitchedTranscriptText(capture);
}

function buildStitchedTranscriptText(capture: CaptureRecord): string {
  const lead =
    capture.sourceKind === "voice-note"
      ? "Voice-note capture"
      : capture.sourceKind === "journal"
        ? "Journal capture"
        : capture.sourceKind === "brief"
          ? "Brief capture"
          : capture.sourceKind === "moodboard"
            ? "Moodboard capture"
            : "Reference capture";
  return [lead, capture.savedReason, capture.note, capture.metadata.title, capture.metadata.description]
    .filter(Boolean)
    .join("\n\n")
    .trim();
}

function buildAssetInsights(capture: CaptureRecord, mediaAnalysisArtifact?: MediaAnalysisArtifact | null): string[] {
  if (capture.assets.length === 0) {
    return [
      isInstagramReelUrl(capture.sourceUrl)
        ? "No uploaded media. This Instagram Reel remains a source-link capture until media bytes are acquired."
        : `No uploaded media. Analysis stayed text-first for this ${capture.sourceKind}.`,
    ];
  }
  const insights = capture.assets.map((asset) => {
    if (asset.kind === "video") return `${asset.originalName} adds movement and pacing clues.`;
    if (asset.kind === "image") return `${asset.originalName} adds framing, color, and composition cues.`;
    if (asset.kind === "audio") return `${asset.originalName} adds cadence, breath, or sound-design cues.`;
    return `${asset.originalName} is stored as supporting context.`;
  });
  if (mediaAnalysisArtifact?.summary) {
    insights.unshift(mediaAnalysisArtifact.summary);
  }
  if (mediaAnalysisArtifact?.notes?.length) {
    insights.push(...mediaAnalysisArtifact.notes.slice(0, 2));
  }
  return uniqueStrings(insights).slice(0, 6);
}

function summarizeCaptureLead(capture: CaptureRecord, noteSnippet: string): string {
  if (capture.sourceKind === "voice-note") {
    return noteSnippet
      ? `Captured as a voice note around ${noteSnippet}.`
      : "Captured as a voice note, so the system is leaning on cadence, metadata, and media cues.";
  }
  if (capture.sourceKind === "journal") {
    return noteSnippet
      ? `Captured as a journal entry about ${noteSnippet}.`
      : "Captured as a journal entry, so the system is leaning on whatever reflective context is available.";
  }
  if (capture.sourceKind === "brief") {
    return noteSnippet
      ? `Captured as a working brief focused on ${noteSnippet}.`
      : "Captured as a working brief with sparse detail, so the system is leaning on metadata and constraints.";
  }
  if (capture.sourceKind === "moodboard") {
    return noteSnippet
      ? `Captured as a moodboard around ${noteSnippet}.`
      : "Captured as a moodboard, so the system is leaning on visual and atmospheric cues.";
  }
  return noteSnippet
    ? `Saved as a reference with a note about ${noteSnippet}.`
    : "Saved without a note, so the system is leaning on link metadata and media cues.";
}

function buildAnalysisOpenQuestions(
  capture: CaptureRecord,
  signals: {
    themes: SignalTag[];
    toneSignals: SignalTag[];
    visualSignals: SignalTag[];
    audioSignals: SignalTag[];
    storySignals: SignalTag[];
  },
): string[] {
  const questions = [
    capture.savedReason ? null : "What made this worth saving right now?",
    capture.metadata.status === "error" ? "Would a manual title or note make this easier to read later?" : null,
    capture.sourceKind === "voice-note" ? "Which exact spoken line is worth protecting verbatim?" : null,
    capture.sourceKind === "journal" ? "Which part of this entry wants to become public work, and which part should stay private?" : null,
    capture.sourceKind === "brief" && capture.projectIds.length === 0 ? "Which project should this brief attach to?" : null,
    capture.sourceKind === "moodboard" && !capture.assets.some((asset) => asset.kind === "image" || asset.kind === "video")
      ? "Would one screenshot or frame make the visual direction more concrete?"
      : null,
    capture.assets.some((asset) => asset.kind === "image" || asset.kind === "video") && signals.visualSignals.length === 0
      ? "Which frame or visual detail is the real anchor rather than just supporting texture?"
      : null,
    (capture.assets.some((asset) => asset.kind === "audio") || capture.sourceKind === "voice-note") && signals.audioSignals.length === 0
      ? "Is the power here in the words, the cadence, or the room tone?"
      : null,
    signals.storySignals.length === 0 ? "What is the emotional turn or story beat this capture is actually holding?" : null,
  ].filter((question): question is string => Boolean(question));
  return uniqueStrings(questions).slice(0, 4);
}

function buildAnalysisMoments(
  capture: CaptureRecord,
  signals: {
    themes: SignalTag[];
    motifs: SignalTag[];
    toneSignals: SignalTag[];
    visualSignals: SignalTag[];
    audioSignals: SignalTag[];
    pacingSignals: SignalTag[];
    storySignals: SignalTag[];
    mediaAnalysisArtifact?: MediaAnalysisArtifact | null;
  },
): ReferenceMoment[] {
  const moments: ReferenceMoment[] = (signals.mediaAnalysisArtifact?.moments ?? []).map((moment) => ({
    label: moment.label,
    description: moment.summary,
  }));
  const visualLead = signals.visualSignals[0]?.label.toLowerCase() ?? signals.motifs[0]?.label.toLowerCase() ?? "visual texture";
  const audioLead = signals.audioSignals[0]?.label.toLowerCase() ?? "spoken cadence";
  const storyLead = signals.storySignals[0]?.label.toLowerCase() ?? signals.themes[0]?.label.toLowerCase() ?? "emotional pull";

  for (const asset of capture.assets.slice(0, 3)) {
    if (asset.kind === "image") {
      moments.push({
        label: "Frame anchor",
        description: `${asset.originalName} can anchor a beat with ${visualLead}.`,
        assetId: asset.id,
      });
      continue;
    }
    if (asset.kind === "video") {
      moments.push({
        label: "Movement beat",
        description: `${asset.originalName} carries motion and pacing that could hold the middle of the piece.`,
        assetId: asset.id,
      });
      continue;
    }
    if (asset.kind === "audio") {
      moments.push({
        label: "Spoken beat",
        description: `${asset.originalName} preserves ${audioLead} that should survive any rewrite.`,
        assetId: asset.id,
      });
    }
  }

  const noteSnippet = pickCaptureSnippet(capture);
  if (noteSnippet && (capture.sourceKind === "voice-note" || capture.sourceKind === "journal")) {
    moments.push({
      label: "Anchor line",
      description: `Protect the phrase "${noteSnippet}" before smoothing it out.`,
    });
  } else if (noteSnippet && moments.length === 0) {
    moments.push({
      label: "Anchor beat",
      description: `"${noteSnippet}" feels like the most reusable emotional beat in this capture.`,
    });
  }

  if (capture.sourceKind === "moodboard" && moments.length < 2) {
    moments.push({
      label: "Palette beat",
      description: `Let one image or object carry the ${storyLead} instead of trying to explain the whole moodboard at once.`,
    });
  }

  return dedupeMoments(moments).slice(0, 4);
}

function pickCaptureSnippet(capture: CaptureRecord): string {
  const source = capture.note || capture.savedReason || capture.metadata.description || capture.metadata.title || "";
  const snippet = source
    .split(/[.!?\n]/)
    .map((part) => part.trim())
    .find((part) => part.length >= 12);
  return truncate(snippet ?? "", 88);
}

function dedupeMoments(moments: ReferenceMoment[]): ReferenceMoment[] {
  const seen = new Set<string>();
  return moments.filter((moment) => {
    const key = `${moment.label}::${moment.description}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function buildReferenceOpenQuestions(capture: CaptureRecord, analysis: AnalysisResult): string[] {
  const questions = [...analysis.openQuestions];
  if (!capture.note.trim()) {
    questions.push(`What specifically made this ${capture.sourceKind} worth saving?`);
  }
  if (capture.metadata.status === "error") {
    questions.push("Would a manual title or note sharpen what this capture is doing?");
  }
  if (analysis.themes.every((theme) => theme.evidence.includes("fallback signal from sparse local context"))) {
    questions.push("This summary is leaning on sparse signals. Which exact beat or frame should become canonical?");
  }
  return uniqueStrings(questions).slice(0, 4);
}

function buildReferenceContradictions(themes: SignalTag[]): string[] {
  const slugs = themes.map((theme) => theme.slug);
  return CONTRAST_RULES
    .filter((rule) => slugs.includes(rule.left) && slugs.includes(rule.right))
    .map((rule) => rule.summary);
}

function toReferenceSummary(
  capture: CaptureRecord,
  analysis: AnalysisResult,
  pagePath: string,
  compiledAt: string,
): ReferenceSummary {
  return {
    id: capture.id,
    title: pickReferenceTitle(capture),
    platform: capture.platform,
    sourceUrl: capture.sourceUrl,
    note: capture.note,
    sourceKind: capture.sourceKind,
    savedReason: capture.savedReason,
    collection: capture.collection,
    projectIds: capture.projectIds,
    createdAt: capture.createdAt,
    pagePath,
    summary: analysis.summary,
    themes: analysis.themes,
    motifs: analysis.motifs,
    creatorSignals: analysis.creatorSignals,
    formatSignals: analysis.formatSignals,
    toneSignals: analysis.toneSignals,
    visualSignals: analysis.visualSignals,
    audioSignals: analysis.audioSignals,
    pacingSignals: analysis.pacingSignals,
    storySignals: analysis.storySignals,
    moments: analysis.moments,
    thumbnailLabel: capture.assets[0]?.originalName ?? capture.metadata.siteName ?? capture.platform,
    thumbnailAssetId: capture.assets[0]?.id ?? null,
    assetCount: capture.assets.length,
    metadataTitle: capture.metadata.title,
    relatedReferenceIds: [],
    bestUseCases: [],
    doNotCopy: [],
    emotionalTone: analysis.toneSignals.slice(0, 3).map((tone) => tone.label),
    openQuestions: buildReferenceOpenQuestions(capture, analysis),
    contradictions: buildReferenceContradictions(analysis.themes),
    transcriptSource: analysis.transcriptProvenance.source,
    provenance: {
      sourceIds: [capture.id],
      sourcePaths: [
        capture.rawPaths.capture,
        capture.rawPaths.analysis,
        capture.rawPaths.inbox,
        capture.rawPaths.artifacts.transcript,
        capture.rawPaths.artifacts.mediaAnalysis,
      ].filter((value): value is string => Boolean(value)),
      compiledAt,
      sourceHash: null,
    },
  };
}

function compileReferences(root: string): CompiledReferenceInput[] {
  const captures = readAllCaptures(root).sort(sortByCreatedDesc);
  return captures
    .map((capture) => {
      const analysis = readAnalysis(root, capture.id);
      if (!analysis) return null;
      return {
        capture,
        analysis,
        pagePath: `wiki/references/${capture.id}.md`,
      };
    })
    .filter((reference): reference is CompiledReferenceInput => reference !== null);
}

function compileReferenceSummaries(root: string, compiledReferences: CompiledReferenceInput[], compiledAt: string): ReferenceSummary[] {
  return compiledReferences.map(({ capture, analysis, pagePath }) => {
    const reference = toReferenceSummary(capture, analysis, pagePath, compiledAt);
    const updatedCapture: CaptureRecord = {
      ...capture,
      status: "compiled",
      updatedAt: compiledAt,
      rawPaths: {
        ...capture.rawPaths,
        referencePage: reference.pagePath,
      },
    };
    writeJson(path.join(root, updatedCapture.rawPaths.capture), updatedCapture);
    writeText(path.join(root, reference.pagePath), buildReferencePage(updatedCapture, analysis, reference));
    return reference;
  });
}

function compileAggregates(root: string, references: ReferenceSummary[], compiledAt: string): TasteSnapshot {
  const paths = getAftertastePaths(root);
  const snapshot = buildSnapshot(root, references, compiledAt);
  writeConceptPages(root, references, snapshot);
  writeJson(paths.referencesJson, references);
  writeJson(paths.snapshotJson, snapshot);
  writeText(path.join(paths.wikiSnapshotsDir, "current.md"), buildSnapshotPage(snapshot));
  writeText(path.join(paths.wikiSnapshotsDir, `${snapshot.id}.md`), buildSnapshotPage(snapshot));
  writeText(paths.wikiStyleConstitution, buildStyleConstitutionPage(references));
  writeText(paths.wikiNotMe, buildNotMePage(references));
  writeText(paths.wikiIndex, buildIndexPage(references, snapshot));

  return snapshot;
}

export function compileCatalysts(root: string, references: ReferenceSummary[], snapshot: TasteSnapshot): CatalystRecord[] {
  const paths = getAftertastePaths(root);
  clearManagedJson(paths.outputsCatalystsDir);

  const catalysts = rankCatalysts([
    ...buildThemeCatalysts(references),
    ...buildMotifCatalysts(references),
    ...buildCreatorPatternCatalysts(snapshot),
    ...buildThemeMotifCatalysts(references),
    ...buildTensionCatalysts(snapshot),
    ...buildAntiSignalCatalysts(root, references, snapshot),
  ]);
  const hydrated = attachCatalystRelations(catalysts);

  for (const catalyst of hydrated) {
    writeJson(path.join(paths.outputsCatalystsDir, `${catalyst.slug}.json`), catalyst);
  }

  return hydrated;
}

export function compileQueryIndex(
  root: string,
  references: ReferenceSummary[],
  catalysts: CatalystRecord[],
  snapshot: TasteSnapshot,
): QueryIndexEntry[] {
  const paths = getAftertastePaths(root);
  const relatedMap = buildRelatedReferenceMap(references, catalysts);

  for (const reference of references) {
    reference.relatedReferenceIds = relatedMap.get(reference.id) ?? [];
    rewriteReferencePage(root, reference);
  }

  writeJson(paths.referencesJson, references);
  writeJson(paths.snapshotJson, snapshot);
  const entries = buildQueryIndexEntries(root, references, catalysts, snapshot, readProjectBriefs(root), readCreativeSessions(root));

  writeJson(paths.queryIndexJson, entries);
  return entries;
}

function pickReferenceTitle(capture: CaptureRecord): string {
  if (capture.metadata.title) return capture.metadata.title;
  if (capture.note) return sentenceCase(truncate(capture.note, 60));
  const pathname = new URL(capture.sourceUrl).pathname.split("/").filter(Boolean).slice(-2).join(" ");
  return sentenceCase(pathname || `${capture.platform} reference`);
}

function buildReferencePage(
  capture: CaptureRecord,
  analysis: AnalysisResult,
  reference: ReferenceSummary,
): string {
  const frontmatter = formatFrontmatter({
    title: reference.title,
    type: "reference",
    created: capture.createdAt.slice(0, 10),
    updated: new Date().toISOString().slice(0, 10),
    platform: capture.platform,
    source_url: capture.sourceUrl,
    themes: reference.themes.map((tag) => tag.label),
    motifs: reference.motifs.map((tag) => tag.label),
    creators: reference.creatorSignals.map((tag) => tag.label),
    formats: reference.formatSignals.map((tag) => tag.label),
  });
  return [
    frontmatter,
    `# ${reference.title}`,
    "",
    `> Captured from ${capture.platform} on ${capture.createdAt.slice(0, 10)}.`,
    "",
    "## Why It Was Saved",
    capture.note ? capture.note : "_No note captured. This page leans on metadata and media clues._",
    "",
    "## Capture Context",
    `- Source kind: ${capture.sourceKind}`,
    `- Saved reason: ${capture.savedReason ?? "None"}`,
    `- Collection: ${capture.collection ?? "None"}`,
    `- Project IDs: ${capture.projectIds.join(", ") || "None"}`,
    "",
    "## What It Is Doing",
    analysis.summary,
    "",
    "## Taste Signals",
    `- Themes: ${tagLinks(reference.themes, "themes")}`,
    `- Motifs: ${tagLinks(reference.motifs, "motifs")}`,
    `- Creator pulls: ${tagLinks(reference.creatorSignals, "creators")}`,
    `- Format cues: ${tagLinks(reference.formatSignals, "formats")}`,
    `- Tone: ${reference.toneSignals.map((tag) => tag.label).join(", ") || "None yet"}`,
    `- Visual: ${reference.visualSignals.map((tag) => tag.label).join(", ") || "None yet"}`,
    `- Audio: ${reference.audioSignals.map((tag) => tag.label).join(", ") || "None yet"}`,
    `- Pacing: ${reference.pacingSignals.map((tag) => tag.label).join(", ") || "None yet"}`,
    `- Story: ${reference.storySignals.map((tag) => tag.label).join(", ") || "None yet"}`,
    "",
    "## Source",
    `- URL: ${capture.sourceUrl}`,
    `- Metadata title: ${capture.metadata.title ?? "Unknown"}`,
    `- Metadata description: ${capture.metadata.description ?? "None"}`,
    "",
    "## Assets",
    capture.assets.length > 0
      ? capture.assets.map((asset) => `- ${asset.originalName} (${asset.kind}, ${asset.mediaType})`).join("\n")
      : "- No uploaded assets.",
    "",
    "## Analysis Notes",
    analysis.assetInsights.map((line) => `- ${line}`).join("\n"),
    "",
    "## Moments",
    reference.moments.length > 0
      ? reference.moments.map((moment) => `- **${moment.label}:** ${moment.description}`).join("\n")
      : "- No scene-level moments were surfaced yet.",
    "",
    "## Data Gaps",
    reference.openQuestions.length > 0
      ? reference.openQuestions.map((question) => `- ${question}`).join("\n")
      : "- None currently flagged.",
    "",
    "## Tensions",
    reference.contradictions.length > 0
      ? reference.contradictions.map((line) => `- ${line}`).join("\n")
      : "- No strong internal tensions surfaced yet.",
    "",
    "## Related References",
    reference.relatedReferenceIds.length > 0
      ? reference.relatedReferenceIds
          .map((id) => `- [[references/${id}|${id}]]`)
          .join("\n")
      : "- None linked yet.",
    "",
    "## Provenance",
    `- Source capture IDs: ${reference.provenance.sourceIds.join(", ") || "None"}`,
    `- Source paths: ${reference.provenance.sourcePaths.join(", ") || "None"}`,
    `- Compiled at: ${reference.provenance.compiledAt}`,
    "",
    "## Related Snapshot",
    "- [[snapshots/current|Current Taste Snapshot]]",
    "",
  ].join("\n");
}

function writeConceptPages(root: string, references: ReferenceSummary[], snapshot: TasteSnapshot): void {
  const paths = getAftertastePaths(root);
  clearManagedMarkdown(paths.wikiThemesDir);
  clearManagedMarkdown(paths.wikiMotifsDir);
  clearManagedMarkdown(paths.wikiCreatorsDir);
  clearManagedMarkdown(paths.wikiFormatsDir);
  clearManagedMarkdown(paths.wikiConceptsDir);

  const groupedInputs = [
    ...buildConceptInputsForSignal(root, snapshot, references, "theme", "themes", paths.wikiThemesDir),
    ...buildConceptInputsForSignal(root, snapshot, references, "motif", "motifs", paths.wikiMotifsDir),
    ...buildConceptInputsForSignal(root, snapshot, references, "creator", "creatorSignals", paths.wikiCreatorsDir),
    ...buildConceptInputsForSignal(root, snapshot, references, "format", "formatSignals", paths.wikiFormatsDir),
    ...buildDerivedConceptInputs(root, snapshot, references),
  ];

  for (const input of groupedInputs) {
    writeText(input.path, buildConceptArticleMarkdown(input));
  }
}

function buildConceptInputsForSignal(
  root: string,
  snapshot: TasteSnapshot,
  references: ReferenceSummary[],
  articleKind: ConceptArticleInput["kind"],
  signalKey: "themes" | "motifs" | "creatorSignals" | "formatSignals",
  dir: string,
): ConceptArticleInput[] {
  const grouped = new Map<string, { label: string; refs: ReferenceSummary[] }>();
  for (const reference of references) {
    for (const tag of reference[signalKey]) {
      const current = grouped.get(tag.slug) ?? { label: tag.label, refs: [] };
      current.refs.push(reference);
      grouped.set(tag.slug, current);
    }
  }

  return Array.from(grouped.entries())
    .sort((left, right) => right[1].refs.length - left[1].refs.length || left[1].label.localeCompare(right[1].label))
    .map(([slug, group]) => ({
      kind: articleKind,
      slug,
      label: group.label,
      path: path.join(dir, `${slug}.md`),
      references: group.refs,
      root,
      snapshot,
    }));
}

function buildDerivedConceptInputs(root: string, snapshot: TasteSnapshot, references: ReferenceSummary[]): ConceptArticleInput[] {
  const paths = getAftertastePaths(root);
  const byId = new Map(references.map((reference) => [reference.id, reference] as const));
  const inputs: ConceptArticleInput[] = [];

  for (const pattern of snapshot.creatorPatterns) {
    inputs.push({
      kind: "concept",
      slug: `pattern-${sanitizeFileName(pattern.label)}`,
      label: pattern.label,
      path: path.join(paths.wikiConceptsDir, `pattern-${sanitizeFileName(pattern.label)}.md`),
      references: pattern.sourceReferenceIds.map((id) => byId.get(id)).filter((reference): reference is ReferenceSummary => reference != null),
      root,
      snapshot,
    });
  }

  for (const tension of snapshot.tensions) {
    inputs.push({
      kind: "concept",
      slug: `tension-${sanitizeFileName(tension.label)}`,
      label: tension.label,
      path: path.join(paths.wikiConceptsDir, `tension-${sanitizeFileName(tension.label)}.md`),
      references: tension.referenceIds.map((id) => byId.get(id)).filter((reference): reference is ReferenceSummary => reference != null),
      root,
      snapshot,
    });
  }

  for (const cluster of buildMissingConceptCandidates(references)) {
    inputs.push({
      kind: "concept",
      slug: cluster.slug,
      label: cluster.label,
      path: path.join(paths.wikiConceptsDir, `${cluster.slug}.md`),
      references: cluster.references,
      root,
      snapshot,
    });
  }

  return inputs;
}

function buildConceptArticleMarkdown(input: ConceptArticleInput, enrichedBody?: string | null): string {
  const articleKind = input.kind === "concept" ? "concept" : input.kind;
  const frontmatter = formatFrontmatter({
    title: input.label,
    type: articleKind,
    updated: new Date().toISOString().slice(0, 10),
    references: input.references.map((reference) => reference.id),
    article_kind: articleKind,
  });
  const lead = buildConceptLead(input.kind, input.label, input.references);
  const sections = enrichedBody?.trim()
    ? enrichedBody.trim()
    : [
        "## Why This Matters",
        buildConceptWhyThisMatters(input.kind, input.label, input.references),
        "",
        "## Recurring Signals",
        buildConceptRecurringSignals(input.references),
        "",
        "## Tensions And Boundaries",
        buildConceptTensionsAndBoundaries(input.snapshot, input.references),
        "",
        "## Canonical References",
        buildConceptCanonicalReferences(input.references),
        "",
        "## Related Concepts",
        buildConceptRelatedLinks(input.kind, input.references),
        "",
        "## Open Questions",
        buildConceptOpenQuestions(input.references),
      ].join("\n");

  return [
    frontmatter,
    `# ${input.label}`,
    "",
    lead,
    "",
    sections,
    "",
  ].join("\n");
}

function buildConceptLead(kind: ConceptArticleInput["kind"], label: string, references: ReferenceSummary[]): string {
  const count = references.length;
  const motif = references[0]?.motifs[0]?.label?.toLowerCase() ?? "a quiet craft move";
  if (kind === "theme") {
    return `${label} is no longer just a tag in this archive. It is one of the emotional questions the references keep coming back to, usually carried through ${motif}.`;
  }
  if (kind === "motif") {
    return `${label} keeps recurring as a usable piece of grammar across ${count} saved reference${count === 1 ? "" : "s"}. It is less an effect than a way the archive likes to think on screen.`;
  }
  if (kind === "creator") {
    return `${label} is showing up less as someone to imitate and more as a recurring pull on pacing, intimacy, and framing decisions.`;
  }
  if (kind === "format") {
    return `${label} is one of the structural containers this archive keeps trusting when it wants feeling and clarity to coexist.`;
  }
  return `${label} is emerging as a useful conceptual page because the references are pointing to the same idea from multiple angles, not because the label sounded neat once.`;
}

function buildConceptWhyThisMatters(kind: ConceptArticleInput["kind"], label: string, references: ReferenceSummary[]): string {
  const noteAnchor = extractVoiceAnchors(references)[0];
  const collectionSpread = uniqueStrings(references.map((reference) => reference.collection ?? reference.platform)).slice(0, 3);
  const spreadText = collectionSpread.length > 0 ? collectionSpread.join(", ") : "different parts of the archive";
  const anchorText = noteAnchor ? ` The saved language around it keeps circling phrases like "${noteAnchor}."` : "";
  if (kind === "theme") {
    return `${label} matters because it shows up across ${spreadText}, which means it is shaping taste decisions rather than describing one isolated save.${anchorText}`;
  }
  if (kind === "motif") {
    return `${label} matters because it keeps becoming the way a feeling gets carried rather than the feeling itself. That makes it reusable in future work without reducing everything to style alone.${anchorText}`;
  }
  return `${label} matters because it is being reinforced by more than one reference and is starting to behave like a stable part of the archive's internal language.${anchorText}`;
}

function buildConceptRecurringSignals(references: ReferenceSummary[]): string {
  const themes = aggregateSignals(references.flatMap((reference) => reference.themes));
  const motifs = aggregateSignals(references.flatMap((reference) => reference.motifs));
  const creators = aggregateSignals(references.flatMap((reference) => reference.creatorSignals));
  const formats = aggregateSignals(references.flatMap((reference) => reference.formatSignals));
  const lines = [
    `- Themes that keep co-occurring: ${formatSignalList(themes, "themes")}`,
    `- Motifs that keep carrying the page: ${formatSignalList(motifs, "motifs")}`,
    `- Creator pulls in the supporting set: ${formatSignalList(creators, "creators")}`,
    `- Formats that recur around it: ${formatSignalList(formats, "formats")}`,
  ];
  return lines.join("\n");
}

function buildConceptTensionsAndBoundaries(snapshot: TasteSnapshot, references: ReferenceSummary[]): string {
  const supportingIds = new Set(references.map((reference) => reference.id));
  const tensions = snapshot.tensions.filter((tension) => tension.referenceIds.some((id) => supportingIds.has(id)));
  const contradictions = uniqueStrings(references.flatMap((reference) => reference.contradictions)).slice(0, 4);
  const boundaries = uniqueStrings([
    ...snapshot.antiSignals,
    ...buildNotMeLines(references),
  ]).slice(0, 3);
  const lines = [
    ...(tensions.length > 0
      ? tensions.map((tension) => `- Tension: **${tension.label}** — ${tension.summary}`)
      : ["- No named snapshot tension overlaps this page yet."]),
    ...(contradictions.length > 0
      ? contradictions.map((line) => `- Reference-level contradiction: ${line}`)
      : []),
    ...boundaries.map((line) => `- Boundary surface: ${line}`),
  ];
  return lines.join("\n");
}

function buildConceptCanonicalReferences(references: ReferenceSummary[]): string {
  const canonical = references
    .slice()
    .sort((left, right) =>
      right.themes.length + right.motifs.length - (left.themes.length + left.motifs.length) ||
      left.title.localeCompare(right.title),
    )
    .slice(0, 6);
  return canonical.length > 0
    ? canonical
        .map((reference) => `- [[references/${reference.id}|${reference.title}]] — ${reference.summary} (${reference.id})`)
        .join("\n")
    : "- None yet.";
}

function buildConceptRelatedLinks(kind: ConceptArticleInput["kind"], references: ReferenceSummary[]): string {
  const related: string[] = [];
  const theme = aggregateSignals(references.flatMap((reference) => reference.themes))[0];
  const motif = aggregateSignals(references.flatMap((reference) => reference.motifs))[0];
  const creator = aggregateSignals(references.flatMap((reference) => reference.creatorSignals))[0];
  const format = aggregateSignals(references.flatMap((reference) => reference.formatSignals))[0];
  if (kind !== "theme" && theme) related.push(`- [[themes/${theme.slug}|${theme.label}]]`);
  if (kind !== "motif" && motif) related.push(`- [[motifs/${motif.slug}|${motif.label}]]`);
  if (kind !== "creator" && creator) related.push(`- [[creators/${creator.slug}|${creator.label}]]`);
  if (kind !== "format" && format) related.push(`- [[formats/${format.slug}|${format.label}]]`);
  related.push("- [[snapshots/current|Current Taste Snapshot]]");
  related.push("- [[style-constitution|Style Constitution]]");
  related.push("- [[not-me|Not Me]]");
  return uniqueStrings(related).join("\n");
}

function buildConceptOpenQuestions(references: ReferenceSummary[]): string {
  const questions = uniqueStrings(references.flatMap((reference) => reference.openQuestions)).slice(0, 5);
  return questions.length > 0 ? questions.map((question) => `- ${question}`).join("\n") : "- What would make this page sharper instead of merely broader?";
}

function formatSignalList(
  signals: SignalTag[],
  folder: "themes" | "motifs" | "creators" | "formats",
): string {
  if (signals.length === 0) return "none surfaced yet";
  return signals
    .slice(0, 3)
    .map((signal) => `[[${folder}/${signal.slug}|${signal.label}]]`)
    .join(", ");
}

function buildSnapshot(root: string, references: ReferenceSummary[], compiledAt: string): TasteSnapshot {
  const now = new Date();
  const start = new Date(now);
  start.setDate(now.getDate() - 6);
  const inWindow = references.filter((reference) => new Date(reference.createdAt).getTime() >= start.getTime());
  const source = inWindow.length > 0 ? inWindow : references;
  const themes = aggregateSignals(source.flatMap((reference) => reference.themes));
  const motifs = aggregateSignals(source.flatMap((reference) => reference.motifs));
  const creatorSignals = aggregateSignals(source.flatMap((reference) => reference.creatorSignals));
  const notableReferences = source.slice(0, 4);
  const creatorPatterns = buildCreatorPatterns(source, themes, motifs, creatorSignals);
  const promptSeeds = buildPromptSeeds(source, themes, motifs);
  const summary = summarizeSnapshot(source, themes, motifs, creatorPatterns);
  const tensions = buildSnapshotTensions(source);
  const antiSignals = buildNotMeLines(references);
  const openQuestions = uniqueStrings(source.flatMap((reference) => reference.openQuestions)).slice(0, 5);
  return {
    id: weeklySnapshotId(now),
    window: {
      label: inWindow.length > 0 ? "This week" : "Current archive",
      start: start.toISOString().slice(0, 10),
      end: now.toISOString().slice(0, 10),
    },
    summary,
    themes,
    motifs,
    creatorPatterns,
    notableReferences,
    tensions,
    underexploredDirections: [],
    antiSignals,
    activeProjects: [],
    openQuestions,
    promptSeeds,
    generatedAt: new Date().toISOString(),
    provenance: {
      sourceIds: source.map((reference) => reference.id),
      sourcePaths: source.flatMap((reference) => reference.provenance.sourcePaths),
      compiledAt,
      sourceHash: null,
    },
  };
}

function buildThemeCatalysts(references: ReferenceSummary[]): CatalystRecord[] {
  return aggregateSignals(references.flatMap((reference) => reference.themes))
    .slice(0, 4)
    .map((theme) => {
      const supportingReferences = references.filter((reference) =>
        reference.themes.some((tag) => tag.slug === theme.slug),
      );
      return createCatalystRecord({
        slug: `theme-${theme.slug}`,
        label: theme.label,
        kind: "theme",
        summary: `${theme.label} is showing up across ${supportingReferences.length} reference${supportingReferences.length === 1 ? "" : "s"}, usually carried through ${supportingReferences[0]?.motifs[0]?.label?.toLowerCase() ?? "quiet visual language"}.`,
        queryHandles: [
          theme.slug,
          theme.label,
          ...supportingReferences.flatMap((reference) => reference.creatorSignals.map((tag) => tag.label)),
        ],
        referenceIds: supportingReferences.map((reference) => reference.id),
      });
    });
}

function buildMotifCatalysts(references: ReferenceSummary[]): CatalystRecord[] {
  return aggregateSignals(references.flatMap((reference) => reference.motifs))
    .slice(0, 4)
    .map((motif) => {
      const supportingReferences = references.filter((reference) =>
        reference.motifs.some((tag) => tag.slug === motif.slug),
      );
      return createCatalystRecord({
        slug: `motif-${motif.slug}`,
        label: motif.label,
        kind: "motif",
        summary: `${motif.label} keeps recurring as a craft move across ${supportingReferences.length} reference${supportingReferences.length === 1 ? "" : "s"}.`,
        queryHandles: [
          motif.slug,
          motif.label,
          ...supportingReferences.flatMap((reference) => reference.formatSignals.map((tag) => tag.label)),
        ],
        referenceIds: supportingReferences.map((reference) => reference.id),
      });
    });
}

function buildCreatorPatternCatalysts(snapshot: TasteSnapshot): CatalystRecord[] {
  return snapshot.creatorPatterns.slice(0, 3).map((pattern) =>
    createCatalystRecord({
      slug: `pattern-${sanitizeFileName(pattern.label)}`,
      label: pattern.label,
      kind: pattern.label.toLowerCase().includes("creator") ? "creator" : "hybrid",
      summary: pattern.summary,
      queryHandles: uniqueStrings([
        pattern.label,
        ...extractHandles(pattern.summary),
        ...pattern.summary.split(/\W+/).filter((token) => token.length > 3),
      ]),
      referenceIds: pattern.sourceReferenceIds,
    }),
  );
}

function buildThemeMotifCatalysts(references: ReferenceSummary[]): CatalystRecord[] {
  const combos = new Map<
    string,
    {
      theme: SignalTag;
      motif: SignalTag;
      referenceIds: string[];
    }
  >();

  for (const reference of references) {
    for (const theme of reference.themes.slice(0, 2)) {
      for (const motif of reference.motifs.slice(0, 2)) {
        const key = `${theme.slug}::${motif.slug}`;
        const current = combos.get(key) ?? { theme, motif, referenceIds: [] };
        current.referenceIds.push(reference.id);
        combos.set(key, current);
      }
    }
  }

  return Array.from(combos.values())
    .filter((combo) => combo.referenceIds.length >= 2)
    .sort((a, b) => b.referenceIds.length - a.referenceIds.length || a.theme.label.localeCompare(b.theme.label))
    .slice(0, 4)
    .map((combo) =>
      createCatalystRecord({
        slug: `hybrid-${combo.theme.slug}-${combo.motif.slug}`,
        label: `${combo.theme.label} + ${combo.motif.label}`,
        kind: "hybrid",
        summary: `${combo.theme.label} keeps resolving through ${combo.motif.label.toLowerCase()} across ${combo.referenceIds.length} references in the archive.`,
        queryHandles: [combo.theme.slug, combo.theme.label, combo.motif.slug, combo.motif.label],
        referenceIds: combo.referenceIds,
      }),
    );
}

function buildTensionCatalysts(snapshot: TasteSnapshot): CatalystRecord[] {
  return snapshot.tensions.map((tension) =>
    createCatalystRecord({
      slug: `tension-${sanitizeFileName(tension.label)}`,
      label: tension.label,
      kind: "tension",
      summary: tension.summary,
      queryHandles: uniqueStrings([tension.label, ...tension.summary.split(/\W+/).filter((token) => token.length > 3)]),
      referenceIds: tension.referenceIds,
    }),
  );
}

function buildAntiSignalCatalysts(root: string, _references: ReferenceSummary[], snapshot: TasteSnapshot): CatalystRecord[] {
  const antiSignals = snapshot.antiSignals.length > 0 ? snapshot.antiSignals : readNotMeBullets(root);
  if (antiSignals.length === 0) return [];
  return [
    createCatalystRecord({
      slug: "boundary-not-me",
      label: "Not Me Boundary",
      kind: "tension",
      summary: antiSignals[0] ?? "Useful reference edges that clarify what this archive does not want to become.",
      queryHandles: uniqueStrings([
        "not me",
        "boundary",
        ...antiSignals.flatMap((line) => line.split(/\W+/).filter((token) => token.length > 3)),
      ]),
      referenceIds: [],
    }),
  ];
}

function createCatalystRecord(input: {
  slug: string;
  label: string;
  kind: CatalystRecord["kind"];
  summary: string;
  queryHandles: string[];
  referenceIds: string[];
}): CatalystRecord {
  return {
    id: `catalyst:${input.slug}`,
    slug: input.slug,
    label: input.label,
    kind: input.kind,
    summary: input.summary,
    queryHandles: uniqueStrings(input.queryHandles.map((handle) => handle.trim()).filter(Boolean)),
    referenceIds: uniqueStrings(input.referenceIds),
    relatedIds: [],
    updatedAt: new Date().toISOString(),
  };
}

function rankCatalysts(catalysts: CatalystRecord[]): CatalystRecord[] {
  return catalysts
    .filter((catalyst) => catalyst.referenceIds.length > 0 || catalyst.kind === "tension")
    .sort((a, b) =>
      b.referenceIds.length - a.referenceIds.length ||
      a.kind.localeCompare(b.kind) ||
      a.label.localeCompare(b.label),
    );
}

function attachCatalystRelations(catalysts: CatalystRecord[]): CatalystRecord[] {
  return catalysts.map((catalyst) => {
    const relatedIds = catalysts
      .filter((candidate) => candidate.id !== catalyst.id)
      .map((candidate) => ({
        id: candidate.id,
        score:
          intersectCount(catalyst.referenceIds, candidate.referenceIds) * 3 +
          intersectCount(catalyst.queryHandles, candidate.queryHandles),
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) => b.score - a.score || a.id.localeCompare(b.id))
      .slice(0, 4)
      .map((candidate) => candidate.id);
    return {
      ...catalyst,
      relatedIds,
    };
  });
}

function buildRelatedReferenceMap(
  references: ReferenceSummary[],
  catalysts: CatalystRecord[],
): Map<string, string[]> {
  const catalystIdsByReferenceId = new Map<string, string[]>();
  for (const catalyst of catalysts) {
    for (const referenceId of catalyst.referenceIds) {
      const current = catalystIdsByReferenceId.get(referenceId) ?? [];
      current.push(catalyst.id);
      catalystIdsByReferenceId.set(referenceId, current);
    }
  }

  const byId = new Map<string, ReferenceSummary>();
  for (const reference of references) {
    byId.set(reference.id, reference);
  }

  const related = new Map<string, string[]>();
  for (const reference of references) {
    const ranked = references
      .filter((candidate) => candidate.id !== reference.id)
      .map((candidate) => ({
        id: candidate.id,
        score: scoreReferenceSimilarity(
          reference,
          candidate,
          catalystIdsByReferenceId.get(reference.id) ?? [],
          catalystIdsByReferenceId.get(candidate.id) ?? [],
        ),
      }))
      .filter((candidate) => candidate.score > 0)
      .sort((a, b) =>
        b.score - a.score ||
        byId.get(b.id)!.createdAt.localeCompare(byId.get(a.id)!.createdAt) ||
        a.id.localeCompare(b.id),
      )
      .slice(0, MAX_RELATED_REFERENCES)
      .map((candidate) => candidate.id);

    related.set(reference.id, ranked);
  }

  return related;
}

function scoreReferenceSimilarity(
  left: ReferenceSummary,
  right: ReferenceSummary,
  leftCatalystIds: string[],
  rightCatalystIds: string[],
): number {
  const catalystOverlap = intersectCount(leftCatalystIds, rightCatalystIds);
  const themeOverlap = intersectCount(left.themes.map((tag) => tag.slug), right.themes.map((tag) => tag.slug));
  const motifOverlap = intersectCount(left.motifs.map((tag) => tag.slug), right.motifs.map((tag) => tag.slug));
  const creatorOverlap = intersectCount(left.creatorSignals.map((tag) => tag.slug), right.creatorSignals.map((tag) => tag.slug));
  const formatOverlap = intersectCount(left.formatSignals.map((tag) => tag.slug), right.formatSignals.map((tag) => tag.slug));
  const recencyTiebreaker = Math.max(0, 0.4 - referenceAgeDistance(left, right) / 120);

  return Number((
    catalystOverlap * 4 +
    themeOverlap * 3 +
    motifOverlap * 2.5 +
    creatorOverlap * 2 +
    formatOverlap * 1.5 +
    recencyTiebreaker
  ).toFixed(3));
}

function rewriteReferencePage(root: string, reference: ReferenceSummary): void {
  const capture = readCapture(root, reference.id);
  const analysis = readAnalysis(root, reference.id);
  if (!analysis) return;
  writeText(path.join(root, reference.pagePath), buildReferencePage(capture, analysis, reference));
}

function buildStaticQueryEntry(
  root: string,
  kind: QueryIndexEntry["kind"],
  title: string,
  fullPath: string,
  sourceIds: string[],
): QueryIndexEntry {
  const content = fs.existsSync(fullPath) ? fs.readFileSync(fullPath, "utf-8") : "";
  const summary = extractFirstReadableLine(content) ?? `${title} document.`;
  return {
    id: kind,
    kind,
    title,
    summary,
    tags: [],
    handles: uniqueStrings(extractHandles(content)),
    dates: {},
    sourceIds,
    path: toRel(root, fullPath),
  };
}

function collectWikiMarkdownPaths(root: string): string[] {
  const wikiDir = getAftertastePaths(root).wikiDir;
  if (!fs.existsSync(wikiDir)) return [];
  const collected: string[] = [];
  const walk = (dir: string) => {
    for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        walk(fullPath);
        continue;
      }
      if (entry.isFile() && entry.name.endsWith(".md")) {
        collected.push(toRel(root, fullPath));
      }
    }
  };
  walk(wikiDir);
  return collected.sort((left, right) => left.localeCompare(right));
}

function emptyWikiLintReport(): WikiLintReport {
  return {
    generatedAt: "",
    issueCounts: {
      "orphan-reference": 0,
      "thin-page": 0,
      "missing-concept": 0,
      "duplicate-concept": 0,
      "split-concept": 0,
      "weak-backlinks": 0,
      "unsupported-claim": 0,
    },
    issues: [],
  };
}

function readWikiLintReport(root: string): WikiLintReport {
  const filePath = getAftertastePaths(root).wikiLintJson;
  if (!fs.existsSync(filePath)) return emptyWikiLintReport();
  return readJson<WikiLintReport>(filePath);
}

function buildWikiArticleQueryEntries(root: string, lint?: WikiLintReport): QueryIndexEntry[] {
  const articlePaths = collectWikiMarkdownPaths(root).filter((articlePath) => {
    return !articlePath.startsWith("wiki/references/")
      && !articlePath.startsWith("wiki/snapshots/")
      && articlePath !== "wiki/style-constitution.md"
      && articlePath !== "wiki/not-me.md"
      && articlePath !== "wiki/index.md";
  });
  const lintByPath = new Map<string, WikiLintIssueKind[]>();
  for (const issue of (lint ?? readWikiLintReport(root)).issues) {
    if (!issue.path) continue;
    const current = lintByPath.get(issue.path) ?? [];
    current.push(issue.kind);
    lintByPath.set(issue.path, Array.from(new Set(current)));
  }
  return articlePaths.map((articlePath) => {
    const detail = getWikiArticleDetail(root, articlePath);
    return {
      id: `article:${articlePath}`,
      kind: "wiki-article",
      title: detail.title,
      summary: detail.lead,
      tags: uniqueStrings([
        `article:${detail.kind}`,
        ...detail.health.map((health) => `health:${health}`),
      ]),
      handles: uniqueStrings(extractHandles(`${detail.title} ${detail.lead}`)),
      dates: {
        updatedAt: detail.lastCompiledAt ?? undefined,
      },
      sourceIds: detail.supportingReferenceIds,
      path: detail.path,
      relatedPaths: detail.relatedPaths.map((link) => link.path),
      supportingReferenceIds: detail.supportingReferenceIds,
      pageHealth: lintByPath.get(detail.path) ?? detail.health,
      articleKind: detail.kind,
    };
  });
}

function buildQueryIndexEntries(
  root: string,
  references: ReferenceSummary[],
  catalysts: CatalystRecord[],
  snapshot: TasteSnapshot,
  briefs: ProjectBrief[],
  sessions: CreativeSessionRecord[],
): QueryIndexEntry[] {
  const paths = getAftertastePaths(root);
  const lint = readWikiLintReport(root);
  return [
    ...references.map((reference) => ({
      id: reference.id,
      kind: "reference" as const,
      title: reference.title,
      summary: reference.summary,
      tags: uniqueStrings([
        `source:${reference.sourceKind}`,
        `platform:${sanitizeFileName(reference.platform)}`,
        ...reference.themes.map((tag) => `theme:${tag.slug}`),
        ...reference.motifs.map((tag) => `motif:${tag.slug}`),
        ...reference.creatorSignals.map((tag) => `creator:${tag.slug}`),
        ...reference.formatSignals.map((tag) => `format:${tag.slug}`),
        ...reference.toneSignals.map((tag) => `tone:${tag.slug}`),
        ...reference.visualSignals.map((tag) => `visual:${tag.slug}`),
        ...reference.audioSignals.map((tag) => `audio:${tag.slug}`),
        ...reference.pacingSignals.map((tag) => `pacing:${tag.slug}`),
        ...reference.storySignals.map((tag) => `story:${tag.slug}`),
        ...(reference.collection ? [`collection:${sanitizeFileName(reference.collection)}`] : []),
        ...reference.projectIds.map((projectId) => `project:${sanitizeFileName(projectId)}`),
        ...reference.emotionalTone.map((tone) => sanitizeFileName(tone)),
      ]),
      handles: uniqueStrings(reference.creatorSignals.map((tag) => tag.label)),
      dates: {
        createdAt: reference.createdAt,
        updatedAt: reference.provenance.compiledAt,
      },
      sourceIds: [reference.id],
      path: reference.pagePath,
    })),
    ...catalysts.map((catalyst) => ({
      id: catalyst.id,
      kind: "catalyst" as const,
      title: catalyst.label,
      summary: catalyst.summary,
      tags: uniqueStrings([`kind:${catalyst.kind}`, ...catalyst.queryHandles.map((handle) => sanitizeFileName(handle))]),
      handles: uniqueStrings(extractHandles(catalyst.queryHandles.join(" "))),
      dates: {
        updatedAt: catalyst.updatedAt,
      },
      sourceIds: catalyst.referenceIds,
      path: `outputs/catalysts/${catalyst.slug}.json`,
    })),
    ...buildWikiArticleQueryEntries(root, lint),
    {
      id: snapshot.id,
      kind: "snapshot",
      title: "Current Taste Snapshot",
      summary: snapshot.summary,
      tags: uniqueStrings([
        ...snapshot.themes.map((theme) => `theme:${theme.slug}`),
        ...snapshot.motifs.map((motif) => `motif:${motif.slug}`),
      ]),
      handles: uniqueStrings(
        snapshot.creatorPatterns.flatMap((pattern) => extractHandles(`${pattern.label} ${pattern.summary}`)),
      ),
      dates: {
        updatedAt: snapshot.generatedAt,
        start: snapshot.window.start,
        end: snapshot.window.end,
      },
      sourceIds: snapshot.provenance.sourceIds,
      path: "wiki/snapshots/current.md",
    },
    buildStaticQueryEntry(root, "constitution", "Style Constitution", paths.wikiStyleConstitution, references.map((reference) => reference.id)),
    buildStaticQueryEntry(root, "not-me", "Not Me", paths.wikiNotMe, references.map((reference) => reference.id)),
    ...briefs.map((brief) => buildBriefQueryEntry(root, brief)),
    ...sessions.map((session) => buildCreativeSessionQueryEntry(session)),
  ];
}

function buildBriefQueryEntry(root: string, brief: ProjectBrief): QueryIndexEntry {
  return {
    id: brief.id,
    kind: "brief",
    title: brief.title,
    summary: [brief.goal, brief.audience ? `Audience: ${brief.audience}` : null].filter(Boolean).join(" · "),
    tags: uniqueStrings([
      `mode:${brief.mode}`,
      `deliverable:${brief.deliverableType}`,
      ...brief.constraints.map((constraint) => sanitizeFileName(constraint)),
    ]),
    handles: [],
    dates: {
      createdAt: brief.createdAt,
      updatedAt: brief.updatedAt,
    },
    sourceIds: brief.selectedReferenceIds,
    path: `outputs/briefs/${brief.id}.json`,
  };
}

function buildCreativeSessionQueryEntry(session: CreativeSessionRecord): QueryIndexEntry {
  return {
    id: session.id,
    kind: "creative-session",
    title: `Creative Session · ${sentenceCase(session.outputType)}`,
    summary: session.summary,
    tags: uniqueStrings([
      `output:${session.outputType}`,
      ...session.learnedPatterns.map((pattern) => sanitizeFileName(pattern)),
      ...session.antiSignals.map((signal) => sanitizeFileName(signal)),
    ]),
    handles: [],
    dates: {
      createdAt: session.generatedAt,
      updatedAt: session.generatedAt,
    },
    sourceIds: session.referenceIds,
    path: `outputs/app/creative-sessions.json`,
  };
}

function syncQueryIndex(root: string, references = readCompiledReferences(root)): QueryIndexEntry[] {
  const entries = buildQueryIndexEntries(
    root,
    references,
    readCatalysts(root),
    getCurrentSnapshot(root),
    readProjectBriefs(root),
    readCreativeSessions(root),
  );
  writeJson(getAftertastePaths(root).queryIndexJson, entries);
  return entries;
}

export function compileTasteGraph(
  root: string,
  references: ReferenceSummary[],
  catalysts: CatalystRecord[],
  snapshot: TasteSnapshot,
): TasteGraph {
  const graph = buildTasteGraph(root, references, catalysts, snapshot, readProjectBriefs(root), readCreativeSessions(root));
  writeJson(getAftertastePaths(root).tasteGraphJson, graph);
  return graph;
}

function syncTasteGraph(root: string, references = readCompiledReferences(root)): TasteGraph {
  const graph = buildTasteGraph(
    root,
    references,
    readCatalysts(root),
    getCurrentSnapshot(root),
    readProjectBriefs(root),
    readCreativeSessions(root),
  );
  writeJson(getAftertastePaths(root).tasteGraphJson, graph);
  return graph;
}

export function getWikiArticleDetail(root: string, articlePath: string): WikiArticleDetail {
  ensureAftertasteWorkspace(root);
  const safePath = normalizeWikiArticlePath(articlePath);
  const fullPath = path.join(root, safePath);
  if (!fs.existsSync(fullPath)) {
    compileAftertaste(root);
  }
  if (!fs.existsSync(fullPath) || !fs.statSync(fullPath).isFile()) {
    throw new Error(`wiki article not found: ${articlePath}`);
  }

  const raw = fs.readFileSync(fullPath, "utf-8");
  const parsed = parseMarkdownArticle(raw);
  const supportingReferenceIds = uniqueStrings([
    ...parsed.frontmatterReferences,
    ...extractReferenceIdsFromText(parsed.body),
  ]);
  const relatedPaths = uniqueStrings(
    extractWikiLinks(parsed.body)
      .map((target) => resolveWikiTarget(root, target))
      .filter((target): target is string => target != null && target !== safePath && !target.startsWith("wiki/references/")),
  ).map((target) => ({
    path: target,
    title: readWikiPageTitle(root, target),
  }));
  const backlinks = collectWikiBacklinks(root, safePath).map((backlink) => ({
    path: backlink,
    title: readWikiPageTitle(root, backlink),
  }));
  const lint = readWikiLintReport(root);

  return {
    path: safePath,
    title: parsed.title,
    kind: inferWikiArticleKind(safePath, parsed.frontmatterType),
    lead: parsed.lead,
    sections: parsed.sections,
    backlinks,
    relatedPaths,
    supportingReferenceIds,
    tensions: extractBulletSection(parsed.sections, "Tensions")
      .concat(extractBulletSection(parsed.sections, "Tensions And Boundaries"))
      .slice(0, 6),
    openQuestions: extractBulletSection(parsed.sections, "Open Questions").slice(0, 6),
    lastCompiledAt: parsed.lastCompiledAt,
    health: lint.issues.filter((issue) => issue.path === safePath).map((issue) => issue.kind),
    raw,
  };
}

export function lintWiki(
  root: string,
  input?: {
    references?: ReferenceSummary[];
    snapshot?: TasteSnapshot;
  },
): WikiLintReport {
  ensureAftertasteWorkspace(root);
  const references = input?.references ?? readCompiledReferences(root);
  const snapshot = input?.snapshot ?? getCurrentSnapshot(root);
  const articlePaths = collectWikiMarkdownPaths(root).filter((articlePath) => !articlePath.startsWith("wiki/references/"));
  const details = articlePaths.map((articlePath) => getWikiArticleDetail(root, articlePath));
  const meaningfulArticles = details.filter((detail) => isMeaningfulConceptArticle(detail));
  const issues: WikiLintIssue[] = [];

  for (const detail of details) {
    if (detail.kind !== "reference" && detail.kind !== "snapshot" && detail.kind !== "constitution" && detail.kind !== "not-me" && detail.kind !== "index") {
      if (detail.lead.length < 140 || detail.sections.length < 6 || detail.supportingReferenceIds.length === 0) {
        issues.push(createWikiLintIssue("thin-page", "warn", {
          title: `${detail.title} is still thin`,
          summary: "This page needs more synthesis prose, clearer structure, or stronger grounding in references.",
          path: detail.path,
          relatedPaths: detail.relatedPaths.map((link) => link.path),
          supportingReferenceIds: detail.supportingReferenceIds,
        }));
      }
      if (detail.backlinks.length < 1) {
        issues.push(createWikiLintIssue("weak-backlinks", "info", {
          title: `${detail.title} has weak backlinks`,
          summary: "The encyclopedia can reach this page, but other pages are not yet routing readers back into it.",
          path: detail.path,
          relatedPaths: detail.relatedPaths.map((link) => link.path),
          supportingReferenceIds: detail.supportingReferenceIds,
        }));
      }
      if (detail.supportingReferenceIds.length === 0) {
        issues.push(createWikiLintIssue("unsupported-claim", "error", {
          title: `${detail.title} has no explicit support`,
          summary: "The page reads like an article but does not name supporting references.",
          path: detail.path,
          relatedPaths: detail.relatedPaths.map((link) => link.path),
          supportingReferenceIds: [],
        }));
      }
      if (detail.supportingReferenceIds.length >= 8 && countDistinctConceptSignals(detail.supportingReferenceIds, references) >= 5) {
        issues.push(createWikiLintIssue("split-concept", "warn", {
          title: `${detail.title} may be carrying too many clusters`,
          summary: "The supporting references point to multiple sub-clusters that may want their own article pages.",
          path: detail.path,
          relatedPaths: detail.relatedPaths.map((link) => link.path),
          supportingReferenceIds: detail.supportingReferenceIds,
        }));
      }
    }
  }

  for (let index = 0; index < meaningfulArticles.length; index += 1) {
    const left = meaningfulArticles[index]!;
    for (let inner = index + 1; inner < meaningfulArticles.length; inner += 1) {
      const right = meaningfulArticles[inner]!;
      const overlap = jaccard(left.supportingReferenceIds, right.supportingReferenceIds);
      const titleOverlap = sanitizeFileName(left.title) === sanitizeFileName(right.title)
        || sanitizeFileName(left.title).includes(sanitizeFileName(right.title))
        || sanitizeFileName(right.title).includes(sanitizeFileName(left.title));
      if (overlap >= 0.8 || (titleOverlap && overlap >= 0.5)) {
        issues.push(createWikiLintIssue("duplicate-concept", "warn", {
          title: `${left.title} and ${right.title} overlap heavily`,
          summary: "These articles are carrying nearly the same support set and may want to be merged or more clearly differentiated.",
          path: left.path,
          relatedPaths: [right.path],
          supportingReferenceIds: uniqueStrings([...left.supportingReferenceIds, ...right.supportingReferenceIds]),
        }));
      }
    }
  }

  const coveredReferenceIds = new Set(meaningfulArticles.flatMap((detail) => detail.supportingReferenceIds));
  for (const reference of references) {
    if (!coveredReferenceIds.has(reference.id)) {
      issues.push(createWikiLintIssue("orphan-reference", "warn", {
        title: `${reference.title} is not anchored in a concept page`,
        summary: "Every reference should land in at least one meaningful concept article or be explicitly surfaced for cleanup.",
        path: reference.pagePath,
        relatedPaths: buildReferenceSuggestedArticlePaths(reference),
        supportingReferenceIds: [reference.id],
      }));
    }
  }

  const missingCandidates = buildMissingConceptCandidates(references);
  const existingPaths = new Set(details.map((detail) => detail.path));
  for (const candidate of missingCandidates) {
    const candidatePath = `wiki/concepts/${candidate.slug}.md`;
    if (existingPaths.has(candidatePath)) continue;
    issues.push(createWikiLintIssue("missing-concept", "info", {
      title: `${candidate.label} is ready to become an article`,
      summary: "A recurring cluster has enough support to warrant its own concept page.",
      path: candidatePath,
      relatedPaths: candidate.relatedPaths,
      supportingReferenceIds: candidate.references.map((reference) => reference.id),
    }));
  }

  const report: WikiLintReport = {
    generatedAt: new Date().toISOString(),
    issueCounts: buildWikiIssueCounts(issues),
    issues: uniqueWikiIssues(issues).sort((left, right) =>
      severityRank(right.severity) - severityRank(left.severity) ||
      left.kind.localeCompare(right.kind) ||
      (left.path ?? "").localeCompare(right.path ?? ""),
    ),
  };
  writeJson(getAftertastePaths(root).wikiLintJson, report);
  return report;
}

export function planWikiCleanup(root: string): WikiCleanupPreview {
  const report = lintWiki(root);
  const actions: WikiCleanupAction[] = [];
  for (const issue of report.issues) {
    if (issue.kind === "thin-page" || issue.kind === "unsupported-claim") {
      actions.push(createCleanupAction("expand-page", issue, issue.path, null));
      continue;
    }
    if (issue.kind === "missing-concept") {
      actions.push(createCleanupAction("create-page", issue, null, issue.path));
      continue;
    }
    if (issue.kind === "weak-backlinks") {
      actions.push(createCleanupAction("add-backlinks", issue, issue.path, null));
      continue;
    }
    if (issue.kind === "orphan-reference") {
      actions.push(createCleanupAction("relink-reference", issue, issue.path, null));
      continue;
    }
    if (issue.kind === "duplicate-concept") {
      actions.push(createCleanupAction("merge-pages", issue, issue.path, issue.relatedPaths[0] ?? null));
      continue;
    }
    if (issue.kind === "split-concept") {
      actions.push(createCleanupAction("split-page", issue, issue.path, null));
    }
  }

  return {
    generatedAt: new Date().toISOString(),
    sourceReportGeneratedAt: report.generatedAt,
    actions: uniqueCleanupActions(actions),
  };
}

export async function applyWikiCleanup(root: string): Promise<WikiCleanupPreview> {
  const preview = planWikiCleanup(root);
  const references = readCompiledReferences(root);
  const snapshot = getCurrentSnapshot(root);
  const paths = getAftertastePaths(root);

  for (const action of preview.actions) {
    if (action.kind === "expand-page" && action.path) {
      const conceptInput = resolveConceptArticleInput(root, action.path, references, snapshot);
      if (conceptInput) {
        const evidence = buildConceptEvidenceBundle(conceptInput);
        const enriched = await generateConceptArticle({
          kind: conceptInput.kind,
          title: conceptInput.label,
          existingPath: action.path,
          evidence,
        });
        writeText(path.join(root, action.path), buildConceptArticleMarkdown(conceptInput, enriched));
      }
      continue;
    }
    if (action.kind === "create-page" && action.targetPath) {
      const conceptInput = resolveConceptArticleInput(root, action.targetPath, references, snapshot);
      if (conceptInput) {
        const evidence = buildConceptEvidenceBundle(conceptInput);
        const enriched = await generateConceptArticle({
          kind: conceptInput.kind,
          title: conceptInput.label,
          existingPath: action.targetPath,
          evidence,
        });
        writeText(path.join(root, action.targetPath), buildConceptArticleMarkdown(conceptInput, enriched));
      }
      continue;
    }
    if (action.kind === "add-backlinks" && action.path) {
      const fullPath = path.join(root, action.path);
      if (fs.existsSync(fullPath)) {
        const current = fs.readFileSync(fullPath, "utf-8");
        const next = ensureRelatedConceptBullets(current, action.relatedPaths.length > 0 ? action.relatedPaths : ["wiki/index.md"]);
        writeText(fullPath, next);
      }
      continue;
    }
    if (action.kind === "relink-reference" && action.path) {
      const referenceId = path.basename(action.path, ".md");
      const reference = references.find((item) => item.id === referenceId);
      if (!reference) continue;
      const targetPath = buildReferenceSuggestedArticlePaths(reference)[0];
      if (!targetPath) continue;
      const fullPath = path.join(root, targetPath);
      if (!fs.existsSync(fullPath)) continue;
      writeText(fullPath, ensureReferenceLinked(fs.readFileSync(fullPath, "utf-8"), reference));
      continue;
    }
    if ((action.kind === "merge-pages" || action.kind === "split-page") && action.path) {
      const conceptInput = resolveConceptArticleInput(root, action.path, references, snapshot);
      if (conceptInput) {
        writeText(path.join(root, action.path), buildConceptArticleMarkdown(conceptInput));
      }
    }
  }

  syncQueryIndex(root, references);
  syncTasteGraph(root, references);
  lintWiki(root, { references, snapshot });
  if (fs.existsSync(paths.snapshotJson)) {
    writeJson(paths.snapshotJson, getCurrentSnapshot(root));
  }
  appendLog(root, `## [${timeStamp()}] cleanup | applied ${preview.actions.length} wiki maintenance action${preview.actions.length === 1 ? "" : "s"}`);
  return preview;
}

function normalizeWikiArticlePath(input: string): string {
  const normalized = path.posix.normalize(input || "wiki/index.md");
  if (normalized.startsWith("..") || path.isAbsolute(normalized)) {
    throw new Error("invalid wiki path");
  }
  return normalized.endsWith(".md") ? normalized : `${normalized}.md`;
}

function parseMarkdownArticle(raw: string): {
  title: string;
  body: string;
  lead: string;
  sections: WikiArticleDetail["sections"];
  frontmatterType: string | null;
  frontmatterReferences: string[];
  lastCompiledAt: string | null;
} {
  const frontmatterMatch = /^---\n([\s\S]*?)\n---\n?/.exec(raw);
  let frontmatter: Record<string, unknown> = {};
  let body = raw;
  if (frontmatterMatch) {
    frontmatter = (yaml.load(frontmatterMatch[1]!) as Record<string, unknown> | null) ?? {};
    body = raw.slice(frontmatterMatch[0].length);
  }
  const lines = body.split("\n");
  const title = lines.find((line) => line.startsWith("# "))?.replace(/^#\s+/, "").trim()
    || (typeof frontmatter.title === "string" ? frontmatter.title : "Untitled");

  const sectionMatches = [...body.matchAll(/^##\s+(.+)$/gm)];
  const leadStart = lines.findIndex((line) => line.startsWith("# "));
  const firstSectionIndex = sectionMatches[0]?.index ?? body.length;
  const leadBody = body.slice(leadStart >= 0 ? body.indexOf("\n", body.indexOf("# ")) + 1 : 0, firstSectionIndex).trim();
  const lead = leadBody
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith(">"))
    .join(" ")
    .trim();

  const sections = sectionMatches.map((match, index) => {
    const heading = match[1]!.trim();
    const start = match.index! + match[0].length;
    const end = sectionMatches[index + 1]?.index ?? body.length;
    return {
      heading,
      body: body.slice(start, end).trim(),
    };
  });

  const frontmatterReferences = Array.isArray(frontmatter.references)
    ? frontmatter.references.filter((value): value is string => typeof value === "string")
    : typeof frontmatter.references === "string"
      ? frontmatter.references.split(",").map((value) => value.trim()).filter(Boolean)
      : [];

  const compiledAtLine = body.split("\n").find((line) => line.toLowerCase().includes("compiled at:"));
  const compiledAt = compiledAtLine?.split("Compiled at:")[1]?.trim()
    || (typeof frontmatter.updated === "string" ? frontmatter.updated : null);

  return {
    title,
    body,
    lead,
    sections,
    frontmatterType: typeof frontmatter.article_kind === "string"
      ? frontmatter.article_kind
      : typeof frontmatter.type === "string"
        ? frontmatter.type
        : null,
    frontmatterReferences,
    lastCompiledAt: compiledAt || null,
  };
}

function inferWikiArticleKind(articlePath: string, frontmatterType: string | null): WikiArticleKind {
  if (articlePath === "wiki/index.md") return "index";
  if (articlePath === "wiki/style-constitution.md") return "constitution";
  if (articlePath === "wiki/not-me.md") return "not-me";
  if (articlePath.startsWith("wiki/references/")) return "reference";
  if (articlePath.startsWith("wiki/themes/")) return "theme";
  if (articlePath.startsWith("wiki/motifs/")) return "motif";
  if (articlePath.startsWith("wiki/creators/")) return "creator";
  if (articlePath.startsWith("wiki/formats/")) return "format";
  if (articlePath.startsWith("wiki/snapshots/")) return "snapshot";
  if (articlePath.startsWith("wiki/concepts/")) return "concept";
  if (frontmatterType === "theme" || frontmatterType === "motif" || frontmatterType === "creator" || frontmatterType === "format" || frontmatterType === "concept") {
    return frontmatterType;
  }
  return "unknown";
}

function extractWikiLinks(content: string): string[] {
  const matches = content.matchAll(/\[\[([^\]|#]+)(?:#[^\]|]+)?(?:\|[^\]]+)?\]\]/g);
  return Array.from(matches, (match) => match[1]!.trim()).filter(Boolean);
}

function extractReferenceIdsFromText(content: string): string[] {
  return uniqueStrings([
    ...Array.from(content.matchAll(/\b([a-z0-9]+-[a-z0-9-]+)\b/gi), (match) => match[1]!.trim()),
    ...extractWikiLinks(content)
      .filter((target) => target.startsWith("references/"))
      .map((target) => path.basename(target)),
  ]);
}

function resolveWikiTarget(root: string, target: string): string | null {
  const found = findPage(root, target);
  return found ? toRel(root, found) : null;
}

function readWikiPageTitle(root: string, articlePath: string): string {
  const fullPath = path.join(root, articlePath);
  if (!fs.existsSync(fullPath)) return path.basename(articlePath, ".md");
  return parseMarkdownArticle(fs.readFileSync(fullPath, "utf-8")).title;
}

function collectWikiBacklinks(root: string, targetPath: string): string[] {
  return collectWikiMarkdownPaths(root).filter((candidatePath) => {
    if (candidatePath === targetPath) return false;
    const raw = fs.readFileSync(path.join(root, candidatePath), "utf-8");
    const resolved = extractWikiLinks(raw)
      .map((target) => resolveWikiTarget(root, target))
      .filter((value): value is string => value != null);
    return resolved.includes(targetPath);
  });
}

function extractBulletSection(sections: WikiArticleDetail["sections"], heading: string): string[] {
  const section = sections.find((entry) => entry.heading.toLowerCase() === heading.toLowerCase());
  if (!section) return [];
  return section.body
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
}

function isMeaningfulConceptArticle(detail: WikiArticleDetail): boolean {
  return (detail.kind === "theme" || detail.kind === "motif" || detail.kind === "creator" || detail.kind === "format" || detail.kind === "concept")
    && detail.lead.length >= 140
    && detail.sections.length >= 6
    && detail.supportingReferenceIds.length > 0;
}

function createWikiLintIssue(
  kind: WikiLintIssueKind,
  severity: WikiLintIssue["severity"],
  input: Omit<WikiLintIssue, "id" | "kind" | "severity">,
): WikiLintIssue {
  return {
    id: `lint:${kind}:${sanitizeFileName(input.path ?? input.title)}:${sanitizeFileName(input.summary).slice(0, 32)}`,
    kind,
    severity,
    ...input,
    relatedPaths: uniqueStrings(input.relatedPaths),
    supportingReferenceIds: uniqueStrings(input.supportingReferenceIds),
  };
}

function buildWikiIssueCounts(issues: WikiLintIssue[]): Record<WikiLintIssueKind, number> {
  const counts: Record<WikiLintIssueKind, number> = {
    "orphan-reference": 0,
    "thin-page": 0,
    "missing-concept": 0,
    "duplicate-concept": 0,
    "split-concept": 0,
    "weak-backlinks": 0,
    "unsupported-claim": 0,
  };
  for (const issue of issues) counts[issue.kind] += 1;
  return counts;
}

function uniqueWikiIssues(issues: WikiLintIssue[]): WikiLintIssue[] {
  const seen = new Set<string>();
  return issues.filter((issue) => {
    const key = `${issue.kind}:${issue.path ?? ""}:${issue.relatedPaths.join(",")}:${issue.supportingReferenceIds.join(",")}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function severityRank(severity: WikiLintIssue["severity"]): number {
  if (severity === "error") return 3;
  if (severity === "warn") return 2;
  return 1;
}

function countDistinctConceptSignals(referenceIds: string[], references: ReferenceSummary[]): number {
  const set = new Set(referenceIds);
  const supported = references.filter((reference) => set.has(reference.id));
  return uniqueStrings([
    ...supported.flatMap((reference) => reference.themes.map((theme) => `theme:${theme.slug}`)),
    ...supported.flatMap((reference) => reference.motifs.map((motif) => `motif:${motif.slug}`)),
  ]).length;
}

function jaccard(left: string[], right: string[]): number {
  const union = new Set([...left, ...right]);
  if (union.size === 0) return 0;
  const intersection = intersectCount(left, right);
  return intersection / union.size;
}

function buildReferenceSuggestedArticlePaths(reference: ReferenceSummary): string[] {
  return uniqueStrings([
    ...reference.themes.slice(0, 2).map((theme) => `wiki/themes/${theme.slug}.md`),
    ...reference.motifs.slice(0, 2).map((motif) => `wiki/motifs/${motif.slug}.md`),
    ...reference.creatorSignals.slice(0, 1).map((creator) => `wiki/creators/${creator.slug}.md`),
    ...reference.formatSignals.slice(0, 1).map((format) => `wiki/formats/${format.slug}.md`),
  ]);
}

function buildMissingConceptCandidates(references: ReferenceSummary[]): Array<{
  slug: string;
  label: string;
  references: ReferenceSummary[];
  relatedPaths: string[];
}> {
  const combos = new Map<string, { label: string; refs: ReferenceSummary[]; themeSlug: string; motifSlug: string }>();
  for (const reference of references) {
    for (const theme of reference.themes.slice(0, 2)) {
      for (const motif of reference.motifs.slice(0, 2)) {
        const key = `${theme.slug}::${motif.slug}`;
        const current = combos.get(key) ?? {
          label: `${theme.label} Through ${motif.label}`,
          refs: [],
          themeSlug: theme.slug,
          motifSlug: motif.slug,
        };
        current.refs.push(reference);
        combos.set(key, current);
      }
    }
  }

  return Array.from(combos.entries())
    .map(([key, combo]) => ({ key, ...combo }))
    .filter((combo) => combo.refs.length >= 3 && conceptClusterDiversity(combo.refs) >= 2)
    .sort((left, right) => right.refs.length - left.refs.length || left.label.localeCompare(right.label))
    .slice(0, 6)
    .map((combo) => ({
      slug: sanitizeFileName(combo.key.replace("::", "-")),
      label: combo.label,
      references: combo.refs,
      relatedPaths: [`wiki/themes/${combo.themeSlug}.md`, `wiki/motifs/${combo.motifSlug}.md`],
    }));
}

function conceptClusterDiversity(references: ReferenceSummary[]): number {
  return uniqueStrings([
    ...references.map((reference) => reference.id),
    ...references.map((reference) => reference.createdAt.slice(0, 10)),
    ...references.map((reference) => reference.collection ?? ""),
  ]).filter(Boolean).length;
}

function createCleanupAction(
  kind: WikiCleanupAction["kind"],
  issue: WikiLintIssue,
  pathValue: string | null,
  targetPath: string | null,
): WikiCleanupAction {
  return {
    id: `cleanup:${kind}:${sanitizeFileName(pathValue ?? targetPath ?? issue.title)}`,
    kind,
    title: issue.title,
    path: pathValue,
    targetPath,
    summary: issue.summary,
    relatedPaths: issue.relatedPaths,
    supportingReferenceIds: issue.supportingReferenceIds,
  };
}

function uniqueCleanupActions(actions: WikiCleanupAction[]): WikiCleanupAction[] {
  const seen = new Set<string>();
  return actions.filter((action) => {
    const key = `${action.kind}:${action.path ?? ""}:${action.targetPath ?? ""}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
}

function resolveConceptArticleInput(
  root: string,
  articlePath: string,
  references: ReferenceSummary[],
  snapshot: TasteSnapshot,
): ConceptArticleInput | null {
  const paths = getAftertastePaths(root);
  const all = [
    ...buildConceptInputsForSignal(root, snapshot, references, "theme", "themes", paths.wikiThemesDir),
    ...buildConceptInputsForSignal(root, snapshot, references, "motif", "motifs", paths.wikiMotifsDir),
    ...buildConceptInputsForSignal(root, snapshot, references, "creator", "creatorSignals", paths.wikiCreatorsDir),
    ...buildConceptInputsForSignal(root, snapshot, references, "format", "formatSignals", paths.wikiFormatsDir),
    ...buildDerivedConceptInputs(root, snapshot, references),
  ];
  return all.find((input) => toRel(root, input.path) === articlePath) ?? null;
}

function buildConceptEvidenceBundle(input: ConceptArticleInput): Record<string, unknown> {
  return {
    kind: input.kind,
    title: input.label,
    supportingReferences: input.references.slice(0, 6).map((reference) => ({
      id: reference.id,
      title: reference.title,
      summary: reference.summary,
      note: reference.note,
      themes: reference.themes.map((theme) => theme.label),
      motifs: reference.motifs.map((motif) => motif.label),
      contradictions: reference.contradictions,
      openQuestions: reference.openQuestions,
    })),
    recurringThemes: aggregateSignals(input.references.flatMap((reference) => reference.themes)).map((theme) => theme.label),
    recurringMotifs: aggregateSignals(input.references.flatMap((reference) => reference.motifs)).map((motif) => motif.label),
    tensions: input.snapshot.tensions.filter((tension) => tension.referenceIds.some((id) => input.references.some((reference) => reference.id === id))),
    antiSignals: input.snapshot.antiSignals,
  };
}

function ensureRelatedConceptBullets(current: string, relatedPaths: string[]): string {
  const bullets = uniqueStrings(relatedPaths)
    .map((relatedPath) => `- [[${relatedPath.replace(/^wiki\//, "").replace(/\.md$/, "")}|${readLinkLabelFromPath(relatedPath)}]]`)
    .join("\n");
  if (!bullets) return current;
  if (current.includes("## Related Concepts")) {
    return current.replace(/## Related Concepts\n([\s\S]*?)(\n## |\s*$)/, (_match, body: string, tail: string) => {
      const merged = uniqueStrings(
        body
          .split("\n")
          .map((line) => line.trim())
          .filter(Boolean)
          .concat(bullets.split("\n")),
      ).join("\n");
      return `## Related Concepts\n${merged}${tail}`;
    });
  }
  return `${current.trim()}\n\n## Related Concepts\n${bullets}\n`;
}

function ensureReferenceLinked(current: string, reference: ReferenceSummary): string {
  const bullet = `- [[references/${reference.id}|${reference.title}]] — ${reference.summary} (${reference.id})`;
  if (current.includes(reference.id)) return current;
  if (current.includes("## Canonical References")) {
    return current.replace(/## Canonical References\n([\s\S]*?)(\n## |\s*$)/, (_match, body: string, tail: string) => {
      const merged = `${body.trim()}\n${bullet}`.trim();
      return `## Canonical References\n${merged}${tail}`;
    });
  }
  return `${current.trim()}\n\n## Canonical References\n${bullet}\n`;
}

function readLinkLabelFromPath(articlePath: string): string {
  return sentenceCase(path.basename(articlePath, ".md").replace(/[-_]/g, " "));
}

function buildTasteGraph(
  root: string,
  references: ReferenceSummary[],
  catalysts: CatalystRecord[],
  snapshot: TasteSnapshot,
  briefs: ProjectBrief[],
  sessions: CreativeSessionRecord[],
): TasteGraph {
  const nodes = new Map<string, TasteGraphNode>();
  const edges = new Map<string, TasteGraphEdge>();
  const referencesById = new Map(references.map((reference) => [reference.id, reference] as const));
  const catalystById = new Map(catalysts.map((catalyst) => [catalyst.id, catalyst] as const));
  const catalystIdsByReferenceId = buildCatalystIdsByReferenceId(catalysts);

  const addNode = (node: Omit<TasteGraphNode, "degree">) => {
    nodes.set(node.id, {
      ...node,
      degree: 0,
    });
  };

  const addEdge = (
    sourceId: string,
    targetId: string,
    kind: TasteGraphEdgeKind,
    weight: number,
    evidence: TasteGraphEdge["evidence"],
    updatedAt: string,
  ) => {
    if (!nodes.has(sourceId) || !nodes.has(targetId) || sourceId === targetId) return;
    const key = `${sourceId}::${targetId}::${kind}`;
    const existing = edges.get(key);
    if (existing) {
      existing.weight = Math.max(existing.weight, weight);
      existing.updatedAt = existing.updatedAt > updatedAt ? existing.updatedAt : updatedAt;
      existing.evidence = {
        referenceIds: uniqueStrings([...existing.evidence.referenceIds, ...evidence.referenceIds]),
        catalystIds: uniqueStrings([...existing.evidence.catalystIds, ...evidence.catalystIds]),
        explanation: existing.evidence.explanation ?? evidence.explanation,
      };
      return;
    }
    edges.set(key, {
      id: `edge:${sanitizeFileName(sourceId)}:${sanitizeFileName(targetId)}:${kind}`,
      sourceId,
      targetId,
      kind,
      weight: Number(weight.toFixed(3)),
      evidence: {
        referenceIds: uniqueStrings(evidence.referenceIds),
        catalystIds: uniqueStrings(evidence.catalystIds),
        explanation: evidence.explanation,
      },
      updatedAt,
    });
  };

  for (const reference of references) {
    addNode({
      id: reference.id,
      kind: "reference",
      label: reference.title,
      title: reference.title,
      summary: reference.summary,
      path: reference.pagePath,
      group: "references",
    });
  }

  for (const catalyst of catalysts) {
    addNode({
      id: catalyst.id,
      kind: "catalyst",
      label: catalyst.label,
      title: catalyst.label,
      summary: catalyst.summary,
      path: `outputs/catalysts/${catalyst.slug}.json`,
      group: graphGroupForCatalyst(catalyst),
    });
  }

  addNode({
    id: snapshot.id,
    kind: "snapshot",
    label: "Current Taste Snapshot",
    title: "Current Taste Snapshot",
    summary: snapshot.summary,
    path: "wiki/snapshots/current.md",
    group: "snapshots",
  });

  for (const brief of briefs) {
    addNode({
      id: brief.id,
      kind: "brief",
      label: brief.title,
      title: brief.title,
      summary: [brief.goal, brief.audience ? `Audience: ${brief.audience}` : null].filter(Boolean).join(" · "),
      path: `outputs/briefs/${brief.id}.json`,
      group: "briefs",
    });
  }

  for (const session of sessions) {
    addNode({
      id: session.id,
      kind: "creative-session",
      label: `Creative Session · ${sentenceCase(session.outputType)}`,
      title: `Creative Session · ${sentenceCase(session.outputType)}`,
      summary: session.summary,
      path: "outputs/app/creative-sessions.json",
      group: "sessions",
    });
  }

  for (const reference of references) {
    const leftCatalystIds = catalystIdsByReferenceId.get(reference.id) ?? [];
    for (const relatedId of reference.relatedReferenceIds) {
      if (reference.id.localeCompare(relatedId) >= 0) continue;
      const other = referencesById.get(relatedId);
      if (!other) continue;
      const rightCatalystIds = catalystIdsByReferenceId.get(other.id) ?? [];
      const sharedCatalystIds = intersectStrings(leftCatalystIds, rightCatalystIds);
      const rawScore = scoreReferenceSimilarity(reference, other, leftCatalystIds, rightCatalystIds);
      addEdge(
        reference.id,
        other.id,
        "related_reference",
        graphWeight(rawScore, 4, 16),
        {
          referenceIds: [reference.id, other.id],
          catalystIds: sharedCatalystIds,
          explanation: describeReferenceRelationship(reference, other, sharedCatalystIds),
        },
        snapshot.generatedAt,
      );
    }
  }

  for (const catalyst of catalysts) {
    for (const referenceId of catalyst.referenceIds) {
      const edgeKind = edgeKindForCatalyst(catalyst);
      const weight = graphWeight(catalyst.referenceIds.length, 1, 5);
      const explanation = explainCatalystMembership(catalyst, referencesById.get(referenceId) ?? null);
      if (edgeKind === "supported_by") {
        addEdge(catalyst.id, referenceId, edgeKind, weight, {
          referenceIds: [referenceId],
          catalystIds: [catalyst.id],
          explanation,
        }, catalyst.updatedAt);
      } else {
        addEdge(referenceId, catalyst.id, edgeKind, weight, {
          referenceIds: [referenceId],
          catalystIds: [catalyst.id],
          explanation,
        }, catalyst.updatedAt);
      }

      if (catalyst.kind === "tension" && catalyst.slug !== "boundary-not-me") {
        addEdge(referenceId, snapshot.id, "contrasts_with", graphWeight(catalyst.referenceIds.length, 1, 4), {
          referenceIds: [referenceId],
          catalystIds: [catalyst.id],
          explanation: catalyst.summary,
        }, catalyst.updatedAt);
      }
    }

    if (catalyst.kind === "tension" && catalyst.slug !== "boundary-not-me") {
      addEdge(catalyst.id, snapshot.id, "contrasts_with", 0.84, {
        referenceIds: catalyst.referenceIds,
        catalystIds: [catalyst.id],
        explanation: catalyst.summary,
      }, catalyst.updatedAt);
    }
  }

  for (const referenceId of uniqueStrings(snapshot.provenance.sourceIds)) {
    addEdge(referenceId, snapshot.id, "belongs_to_snapshot", snapshot.notableReferences.some((reference) => reference.id === referenceId) ? 0.92 : 0.72, {
      referenceIds: [referenceId],
      catalystIds: [],
      explanation: "Included in the current compiled taste snapshot.",
    }, snapshot.generatedAt);
  }

  const boundaryCatalyst = catalysts.find((catalyst) => catalyst.slug === "boundary-not-me");
  if (boundaryCatalyst && snapshot.antiSignals.length > 0) {
    addEdge(boundaryCatalyst.id, snapshot.id, "anti_signal_of", 0.88, {
      referenceIds: [],
      catalystIds: [boundaryCatalyst.id],
      explanation: snapshot.antiSignals[0] ?? "Boundary surface attached to the current snapshot.",
    }, snapshot.generatedAt);
  }

  for (const brief of briefs) {
    for (const referenceId of brief.selectedReferenceIds) {
      addEdge(brief.id, referenceId, "supported_by", 0.78, {
        referenceIds: [referenceId],
        catalystIds: catalystIdsByReferenceId.get(referenceId) ?? [],
        explanation: `Brief "${brief.title}" explicitly selected this reference.`,
      }, brief.updatedAt);
    }
    addEdge(brief.id, snapshot.id, "belongs_to_snapshot", 0.62, {
      referenceIds: brief.selectedReferenceIds,
      catalystIds: [],
      explanation: "Brief can be interpreted against the current snapshot.",
    }, brief.updatedAt);
  }

  for (const session of sessions) {
    for (const referenceId of session.referenceIds) {
      addEdge(session.id, referenceId, "supported_by", 0.82, {
        referenceIds: [referenceId],
        catalystIds: session.catalystIds,
        explanation: "This reference was active in the generation session.",
      }, session.generatedAt);
    }
    for (const catalystId of session.catalystIds) {
      addEdge(session.id, catalystId, "reinforces", 0.76, {
        referenceIds: session.referenceIds,
        catalystIds: [catalystId],
        explanation: "This catalyst shaped the recorded creative session.",
      }, session.generatedAt);
    }
    if (session.snapshotId) {
      addEdge(session.id, session.snapshotId, "belongs_to_snapshot", 0.7, {
        referenceIds: session.referenceIds,
        catalystIds: session.catalystIds,
        explanation: "Session was generated against this snapshot.",
      }, session.generatedAt);
    }
    if (boundaryCatalyst && session.antiSignals.length > 0) {
      addEdge(session.id, boundaryCatalyst.id, "anti_signal_of", 0.68, {
        referenceIds: session.referenceIds,
        catalystIds: [boundaryCatalyst.id],
        explanation: session.antiSignals[0] ?? "Session recorded an anti-signal.",
      }, session.generatedAt);
    }
  }

  for (const edge of edges.values()) {
    nodes.get(edge.sourceId)!.degree += 1;
    nodes.get(edge.targetId)!.degree += 1;
  }

  return {
    nodes: Array.from(nodes.values()).sort((a, b) =>
      a.kind.localeCompare(b.kind) ||
      b.degree - a.degree ||
      a.label.localeCompare(b.label),
    ),
    edges: Array.from(edges.values()).sort((a, b) =>
      a.kind.localeCompare(b.kind) ||
      b.weight - a.weight ||
      a.sourceId.localeCompare(b.sourceId) ||
      a.targetId.localeCompare(b.targetId),
    ),
  };
}

function buildCatalystIdsByReferenceId(catalysts: CatalystRecord[]): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const catalyst of catalysts) {
    for (const referenceId of catalyst.referenceIds) {
      const current = map.get(referenceId) ?? [];
      current.push(catalyst.id);
      map.set(referenceId, current);
    }
  }
  return map;
}

function intersectStrings(left: string[], right: string[]): string[] {
  const rightSet = new Set(right);
  return Array.from(new Set(left.filter((value) => rightSet.has(value))));
}

function graphWeight(value: number, floor: number, ceiling: number): number {
  if (ceiling <= floor) return 0.5;
  const normalized = (value - floor) / (ceiling - floor);
  return Math.max(0.32, Math.min(0.98, Number((0.32 + Math.max(0, normalized) * 0.66).toFixed(3))));
}

function graphGroupForCatalyst(catalyst: CatalystRecord): string {
  if (catalyst.kind === "theme") return "themes";
  if (catalyst.kind === "motif") return "motifs";
  if (catalyst.kind === "creator") return "creators";
  if (catalyst.kind === "format") return "formats";
  if (catalyst.kind === "tension") return "snapshots";
  return "other";
}

function edgeKindForCatalyst(catalyst: CatalystRecord): TasteGraphEdgeKind {
  if (catalyst.kind === "theme") return "has_theme";
  if (catalyst.kind === "motif") return "has_motif";
  if (catalyst.kind === "tension") return "contrasts_with";
  return "supported_by";
}

function describeReferenceRelationship(
  left: ReferenceSummary,
  right: ReferenceSummary,
  sharedCatalystIds: string[],
): string {
  const fragments: string[] = [];
  const sharedThemes = intersectStrings(left.themes.map((theme) => theme.label), right.themes.map((theme) => theme.label));
  const sharedMotifs = intersectStrings(left.motifs.map((motif) => motif.label), right.motifs.map((motif) => motif.label));
  const sharedCreators = intersectStrings(left.creatorSignals.map((creator) => creator.label), right.creatorSignals.map((creator) => creator.label));
  const sharedFormats = intersectStrings(left.formatSignals.map((format) => format.label), right.formatSignals.map((format) => format.label));

  if (sharedThemes.length > 0) fragments.push(`shared themes: ${sharedThemes.slice(0, 2).join(", ")}`);
  if (sharedMotifs.length > 0) fragments.push(`shared motifs: ${sharedMotifs.slice(0, 2).join(", ")}`);
  if (sharedCreators.length > 0) fragments.push(`shared creator pulls: ${sharedCreators.slice(0, 2).join(", ")}`);
  if (sharedFormats.length > 0) fragments.push(`shared formats: ${sharedFormats.slice(0, 2).join(", ")}`);
  if (sharedCatalystIds.length > 0) fragments.push(`${sharedCatalystIds.length} shared catalyst${sharedCatalystIds.length === 1 ? "" : "s"}`);

  return fragments.length > 0
    ? `References rhyme through ${fragments.join(" · ")}.`
    : "References were linked by compiled similarity scoring.";
}

function explainCatalystMembership(catalyst: CatalystRecord, reference: ReferenceSummary | null): string {
  if (!reference) return catalyst.summary;
  if (catalyst.kind === "theme") return `${reference.title} contributes to the theme catalyst "${catalyst.label}".`;
  if (catalyst.kind === "motif") return `${reference.title} contributes to the motif catalyst "${catalyst.label}".`;
  if (catalyst.kind === "tension") return `${reference.title} supports the tension "${catalyst.label}".`;
  return `${reference.title} helps support catalyst "${catalyst.label}".`;
}

function matchQueryEntry(
  entry: QueryIndexEntry,
  referencesById: Map<string, ReferenceSummary>,
  filters?: {
    q?: string;
    theme?: string;
    motif?: string;
    creator?: string;
    format?: string;
    platform?: string;
    start?: string;
    end?: string;
    kind?: QueryIndexEntry["kind"][];
  },
): boolean {
  if (!filters) return true;
  if (filters.kind && filters.kind.length > 0 && !filters.kind.includes(entry.kind)) return false;

  const sourceReferences = getQueryEntrySourceReferences(entry, referencesById);
  if (filters.theme && !sourceReferences.some((reference) => reference.themes.some((tag) => tag.slug === filters.theme))) return false;
  if (filters.motif && !sourceReferences.some((reference) => reference.motifs.some((tag) => tag.slug === filters.motif))) return false;
  if (filters.creator && !sourceReferences.some((reference) => reference.creatorSignals.some((tag) => tag.slug === filters.creator))) return false;
  if (filters.format && !sourceReferences.some((reference) => reference.formatSignals.some((tag) => tag.slug === filters.format))) return false;
  if (filters.platform && !sourceReferences.some((reference) => sanitizeFileName(reference.platform) === filters.platform)) return false;

  if (filters.start || filters.end) {
    const hasDateMatch = sourceReferences.length > 0
      ? sourceReferences.some((reference) => matchesDateWindow(reference.createdAt, filters.start, filters.end))
      : matchesDateWindow(entry.dates.end ?? entry.dates.updatedAt ?? entry.dates.createdAt ?? "", filters.start, filters.end);
    if (!hasDateMatch) return false;
  }

  if (filters.q) {
    const needle = filters.q.toLowerCase();
    const haystack = [
      entry.title,
      entry.summary,
      entry.tags.join(" "),
      entry.handles.join(" "),
      ...sourceReferences.map((reference) => `${reference.title} ${reference.summary} ${reference.note}`),
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }

  return true;
}

function scoreQueryEntry(
  entry: QueryIndexEntry,
  filters?: {
    q?: string;
  },
): number {
  let score = 0;
  const q = filters?.q?.trim().toLowerCase();
  if (q) {
    const title = entry.title.toLowerCase();
    const summary = entry.summary.toLowerCase();
    if (title.includes(q)) score += 6;
    if (summary.includes(q)) score += 3;
    if (entry.tags.some((tag) => tag.includes(q))) score += 2;
    if (entry.handles.some((handle) => handle.toLowerCase().includes(q))) score += 2;
  }

  const recency = entry.dates.updatedAt ?? entry.dates.createdAt ?? entry.dates.end ?? "";
  if (recency) {
    score += new Date(recency).getTime() / 1e13;
  }
  return score;
}

function getQueryEntrySourceReferences(
  entry: QueryIndexEntry,
  referencesById: Map<string, ReferenceSummary>,
): ReferenceSummary[] {
  if (entry.kind === "reference") {
    const reference = referencesById.get(entry.id);
    return reference ? [reference] : [];
  }
  return entry.sourceIds
    .map((id) => referencesById.get(id))
    .filter((reference): reference is ReferenceSummary => reference != null);
}

function matchesDateWindow(value: string, start?: string, end?: string): boolean {
  if (!value) return false;
  const day = value.slice(0, 10);
  if (start && day < start) return false;
  if (end && day > end) return false;
  return true;
}

function readNotMeBullets(root: string): string[] {
  const filePath = getAftertastePaths(root).wikiNotMe;
  if (!fs.existsSync(filePath)) return [];
  return fs
    .readFileSync(filePath, "utf-8")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim())
    .filter((line) => line.length > 0 && !line.startsWith("[["));
}

function buildNotMeLines(references: ReferenceSummary[]): string[] {
  return references.length === 0
    ? [
        "No explicit anti-patterns captured yet.",
        "Use this page to mark references that are useful but not aligned with your voice.",
      ]
    : [
        "Anything that feels over-explained, over-cut, or optimized for volume over feeling.",
        "References that flatten tenderness into generic motivation.",
        "Visual language that feels too polished to leave room for intimacy.",
      ];
}

function buildSnapshotTensions(references: ReferenceSummary[]): TasteSnapshot["tensions"] {
  return CONTRAST_RULES
    .map((rule) => {
      const supportingReferences = references.filter((reference) => {
        const slugs = reference.themes.map((theme) => theme.slug);
        return slugs.includes(rule.left) || slugs.includes(rule.right);
      });
      const hasLeft = supportingReferences.some((reference) =>
        reference.themes.some((theme) => theme.slug === rule.left),
      );
      const hasRight = supportingReferences.some((reference) =>
        reference.themes.some((theme) => theme.slug === rule.right),
      );
      if (!hasLeft || !hasRight) return null;
      return {
        label: rule.label,
        summary: rule.summary,
        referenceIds: supportingReferences.slice(0, 4).map((reference) => reference.id),
      };
    })
    .filter((tension): tension is TasteSnapshot["tensions"][number] => tension !== null);
}

function readCatalysts(root: string): CatalystRecord[] {
  const dir = getAftertastePaths(root).outputsCatalystsDir;
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => readJson<CatalystRecord>(path.join(dir, file)))
    .sort((a, b) => a.slug.localeCompare(b.slug));
}

function readProjectBriefs(root: string): ProjectBrief[] {
  const dir = getAftertastePaths(root).outputsBriefsDir;
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => withProjectBriefDefaults(readJson<ProjectBrief>(path.join(dir, file))))
    .sort((a, b) => b.updatedAt.localeCompare(a.updatedAt));
}

function readCompiledReferences(root: string): ReferenceSummary[] {
  const paths = getAftertastePaths(root);
  if (!fs.existsSync(paths.referencesJson)) {
    compileAftertaste(root);
  }
  return readJson<ReferenceSummary[]>(paths.referencesJson).map((reference) => withReferenceDefaults(reference));
}

function intersectCount(left: string[], right: string[]): number {
  const rightSet = new Set(right);
  let count = 0;
  for (const item of new Set(left)) {
    if (rightSet.has(item)) {
      count += 1;
    }
  }
  return count;
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}

function referenceAgeDistance(left: ReferenceSummary, right: ReferenceSummary): number {
  const leftTime = new Date(left.createdAt).getTime();
  const rightTime = new Date(right.createdAt).getTime();
  return Math.abs(leftTime - rightTime) / 86400000;
}

function extractFirstReadableLine(content: string): string | null {
  const line = content
    .split("\n")
    .map((entry) => entry.trim())
    .find((entry) => entry.length > 0 && !entry.startsWith("#") && !entry.startsWith("---") && !entry.includes(": "));
  return line ?? null;
}

function aggregateSignals(signals: SignalTag[]): SignalTag[] {
  const map = new Map<string, SignalTag>();
  for (const signal of signals) {
    const current = map.get(signal.slug);
    if (!current) {
      map.set(signal.slug, { ...signal });
      continue;
    }
    current.score += signal.score;
    current.evidence = Array.from(new Set([...current.evidence, ...signal.evidence]));
  }
  return Array.from(map.values())
    .sort((a, b) => b.score - a.score)
    .slice(0, 5)
    .map((signal) => ({
      ...signal,
      score: Number((signal.score / Math.max(1, Math.ceil(signal.evidence.length / 2))).toFixed(2)),
    }));
}

function buildCreatorPatterns(
  references: ReferenceSummary[],
  themes: SignalTag[],
  motifs: SignalTag[],
  creators: SignalTag[],
): TasteSnapshot["creatorPatterns"] {
  const primaryTheme = themes[0]?.label ?? "a reflective thread";
  const primaryMotif = motifs[0]?.label ?? "soft pacing";
  const secondaryMotif = motifs[1]?.label ?? "textural imagery";
  const primaryCreator = creators[0]?.label;
  const refs = references.slice(0, 3).map((reference) => reference.id);
  const patterns = [
    {
      label: "Emotional orbit",
      summary: `You keep circling ${primaryTheme.toLowerCase()} and presenting it through ${primaryMotif.toLowerCase()}.`,
      sourceReferenceIds: refs,
    },
    {
      label: "Craft rhythm",
      summary: `The archive leans toward ${primaryMotif.toLowerCase()} paired with ${secondaryMotif.toLowerCase()}.`,
      sourceReferenceIds: refs,
    },
  ];
  if (primaryCreator) {
    patterns.push({
      label: "Creator pull",
      summary: `${primaryCreator} is surfacing as a recurring influence in how these references feel.`,
      sourceReferenceIds: refs,
    });
  }
  return patterns;
}

function buildPromptSeeds(
  references: ReferenceSummary[],
  themes: SignalTag[],
  motifs: SignalTag[],
): TasteSnapshot["promptSeeds"] {
  const theme = themes[0]?.label ?? "Private Voice";
  const motif = motifs[0]?.label ?? "Soft Pacing";
  const refs = references.slice(0, 2).map((reference) => reference.id);
  return [
    {
      title: "Reel premise",
      prompt: `Turn ${theme.toLowerCase()} into a short reel that uses ${motif.toLowerCase()} without feeling performative.`,
      referenceIds: refs,
    },
    {
      title: "Journal to script",
      prompt: `Use this week's references to transform one journal thought into a cinematic spoken script.`,
      referenceIds: refs,
    },
    {
      title: "Freelance translation",
      prompt: `Translate your taste for ${theme.toLowerCase()} into a client-safe concept deck with clear visual beats.`,
      referenceIds: refs,
    },
  ];
}

function summarizeSnapshot(
  references: ReferenceSummary[],
  themes: SignalTag[],
  motifs: SignalTag[],
  patterns: TasteSnapshot["creatorPatterns"],
): string {
  if (references.length === 0) {
    return "No captures yet. Save a few references and Aftertaste will turn them into a readable taste snapshot.";
  }
  const theme = themes[0]?.label ?? "Reflection";
  const motif = motifs[0]?.label ?? "Soft Pacing";
  const secondTheme = themes[1]?.label ? ` with a secondary pull toward ${themes[1]!.label.toLowerCase()}` : "";
  return `Lately your archive feels anchored in ${theme.toLowerCase()}${secondTheme}. The strongest craft move is ${motif.toLowerCase()}, and the references keep resolving into a tone that feels quiet, intimate, and deliberate. ${patterns[0]?.summary ?? ""}`;
}

function buildSnapshotPage(snapshot: TasteSnapshot): string {
  const frontmatter = formatFrontmatter({
    title: "Current Taste Snapshot",
    type: "snapshot",
    updated: snapshot.generatedAt.slice(0, 10),
    window_start: snapshot.window.start,
    window_end: snapshot.window.end,
  });
  const themeBullets = snapshot.themes.map((theme) => `- [[themes/${theme.slug}|${theme.label}]]`).join("\n") || "- None yet.";
  const motifBullets = snapshot.motifs.map((motif) => `- [[motifs/${motif.slug}|${motif.label}]]`).join("\n") || "- None yet.";
  const referenceBullets =
    snapshot.notableReferences
      .map((reference) => `- [[references/${reference.id}|${reference.title}]] — ${reference.summary}`)
      .join("\n") || "- None yet.";
  return [
    frontmatter,
    "# Current Taste Snapshot",
    "",
    snapshot.summary,
    "",
    "## Themes",
    themeBullets,
    "",
    "## Motifs",
    motifBullets,
    "",
    "## Pattern Read",
    snapshot.creatorPatterns.map((pattern) => `- **${pattern.label}:** ${pattern.summary}`).join("\n") || "- None yet.",
    "",
    "## Tensions",
    snapshot.tensions.map((tension) => `- **${tension.label}:** ${tension.summary}`).join("\n") || "- None yet.",
    "",
    "## Open Questions",
    snapshot.openQuestions.map((question) => `- ${question}`).join("\n") || "- None yet.",
    "",
    "## Anti-Signals",
    snapshot.antiSignals.map((line) => `- ${line}`).join("\n") || "- None yet.",
    "",
    "## Notable References",
    referenceBullets,
    "",
    "## Prompt Seeds",
    snapshot.promptSeeds.map((seed) => `- **${seed.title}:** ${seed.prompt}`).join("\n"),
    "",
    "## Provenance",
    `- Source capture IDs: ${snapshot.provenance.sourceIds.join(", ") || "None"}`,
    `- Source paths: ${snapshot.provenance.sourcePaths.join(", ") || "None"}`,
    `- Compiled at: ${snapshot.provenance.compiledAt}`,
    "",
  ].join("\n");
}

function buildStyleConstitutionPage(references: ReferenceSummary[]): string {
  const themes = aggregateSignals(references.flatMap((reference) => reference.themes));
  const motifs = aggregateSignals(references.flatMap((reference) => reference.motifs));
  const formats = aggregateSignals(references.flatMap((reference) => reference.formatSignals));
  const frontmatter = formatFrontmatter({
    title: "Style Constitution",
    type: "constitution",
    updated: new Date().toISOString().slice(0, 10),
  });
  return [
    frontmatter,
    "# Style Constitution",
    "",
    references.length === 0
      ? "This page will stabilize as you save more references. Right now it is intentionally sparse."
      : `Across the current archive, the most stable taste constants are ${themes.slice(0, 2).map((theme) => theme.label.toLowerCase()).join(" and ")} expressed through ${motifs.slice(0, 2).map((motif) => motif.label.toLowerCase()).join(" and ")}.`,
    "",
    "## Constants",
    themes.slice(0, 5).map((theme) => `- [[themes/${theme.slug}|${theme.label}]]`).join("\n") || "- None yet.",
    "",
    "## Craft Preferences",
    motifs.slice(0, 5).map((motif) => `- [[motifs/${motif.slug}|${motif.label}]]`).join("\n") || "- None yet.",
    "",
    "## Structural Defaults",
    formats.slice(0, 5).map((format) => `- [[formats/${format.slug}|${format.label}]]`).join("\n") || "- None yet.",
    "",
  ].join("\n");
}

function buildNotMePage(references: ReferenceSummary[]): string {
  const frontmatter = formatFrontmatter({
    title: "Not Me",
    type: "constraint",
    updated: new Date().toISOString().slice(0, 10),
  });
  const patterns = buildNotMeLines(references);
  return [
    frontmatter,
    "# Not Me",
    "",
    "Keep this page as the boundary surface for taste. It should stay shorter and sharper than the rest of the archive.",
    "",
    "## Anti-Patterns",
    patterns.map((line) => `- ${line}`).join("\n"),
    "",
  ].join("\n");
}

function buildIndexPage(references: ReferenceSummary[], snapshot: TasteSnapshot): string {
  const themes = aggregateSignals(references.flatMap((reference) => reference.themes));
  const motifs = aggregateSignals(references.flatMap((reference) => reference.motifs));
  const creators = aggregateSignals(references.flatMap((reference) => reference.creatorSignals));
  const formats = aggregateSignals(references.flatMap((reference) => reference.formatSignals));
  return [
    "# Index — Aftertaste",
    "",
    "> Taste-led knowledge base for creator references, snapshots, and idea prompts.",
    "",
    "## Navigation",
    "- [[snapshots/current|Current Taste Snapshot]]",
    "- [[style-constitution|Style Constitution]]",
    "- [[not-me|Not Me]]",
    "",
    "## References",
    references.length > 0
      ? references.slice(0, 20).map((reference) => `- [[references/${reference.id}|${reference.title}]]`).join("\n")
      : "- *(none yet)*",
    "",
    "## Themes",
    themes.length > 0 ? themes.map((theme) => `- [[themes/${theme.slug}|${theme.label}]]`).join("\n") : "- *(none yet)*",
    "",
    "## Motifs",
    motifs.length > 0 ? motifs.map((motif) => `- [[motifs/${motif.slug}|${motif.label}]]`).join("\n") : "- *(none yet)*",
    "",
    "## Creators",
    creators.length > 0 ? creators.map((creator) => `- [[creators/${creator.slug}|${creator.label}]]`).join("\n") : "- *(none yet)*",
    "",
    "## Formats",
    formats.length > 0 ? formats.map((format) => `- [[formats/${format.slug}|${format.label}]]`).join("\n") : "- *(none yet)*",
    "",
    "## Snapshot Notes",
    `- ${snapshot.summary}`,
    ...(
      snapshot.tensions.length > 0
        ? ["", "## Snapshot Tensions", ...snapshot.tensions.map((tension) => `- ${tension.label}: ${tension.summary}`)]
        : []
    ),
    "",
  ].join("\n");
}

function matchReference(
  reference: ReferenceSummary,
  filters?: {
    theme?: string;
    motif?: string;
    creator?: string;
    format?: string;
    platform?: string;
    q?: string;
  },
): boolean {
  if (!filters) return true;
  if (filters.theme && !reference.themes.some((theme) => theme.slug === filters.theme)) return false;
  if (filters.motif && !reference.motifs.some((motif) => motif.slug === filters.motif)) return false;
  if (filters.creator && !reference.creatorSignals.some((creator) => creator.slug === filters.creator)) return false;
  if (filters.format && !reference.formatSignals.some((format) => format.slug === filters.format)) return false;
  if (filters.platform && sanitizeFileName(reference.platform) !== filters.platform) return false;
  if (filters.q) {
    const needle = filters.q.toLowerCase();
    const haystack = [
      reference.title,
      reference.summary,
      reference.note,
      reference.platform,
      ...reference.themes.map((theme) => theme.label),
      ...reference.motifs.map((motif) => motif.label),
      ...reference.creatorSignals.map((creator) => creator.label),
      ...reference.formatSignals.map((format) => format.label),
    ]
      .join(" ")
      .toLowerCase();
    if (!haystack.includes(needle)) return false;
  }
  return true;
}

function buildFilters(references: ReferenceSummary[]): ReferencesFilters {
  return {
    themes: countFilters(references.flatMap((reference) => reference.themes)),
    motifs: countFilters(references.flatMap((reference) => reference.motifs)),
    creators: countFilters(references.flatMap((reference) => reference.creatorSignals)),
    formats: countFilters(references.flatMap((reference) => reference.formatSignals)),
    platforms: countPlatforms(references),
  };
}

function countFilters(tags: SignalTag[]): ReferencesFilters["themes"] {
  const counts = new Map<string, { slug: string; label: string; count: number }>();
  for (const tag of tags) {
    const current = counts.get(tag.slug) ?? { slug: tag.slug, label: tag.label, count: 0 };
    current.count += 1;
    counts.set(tag.slug, current);
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function countPlatforms(references: ReferenceSummary[]): ReferencesFilters["platforms"] {
  const counts = new Map<string, { slug: string; label: string; count: number }>();
  for (const reference of references) {
    const slug = sanitizeFileName(reference.platform);
    const current = counts.get(slug) ?? { slug, label: reference.platform, count: 0 };
    current.count += 1;
    counts.set(slug, current);
  }
  return Array.from(counts.values()).sort((a, b) => b.count - a.count || a.label.localeCompare(b.label));
}

function selectIdeaReferences(
  request: IdeaRequest,
  snapshot: TasteSnapshot,
  references: ReferenceSummary[],
  brief: ProjectBrief | null,
): ReferenceSummary[] {
  if (request.referenceIds.length > 0) {
    return references.filter((reference) => request.referenceIds.includes(reference.id)).slice(0, 4);
  }
  if (brief?.selectedReferenceIds.length) {
    return references.filter((reference) => brief.selectedReferenceIds.includes(reference.id)).slice(0, 4);
  }
  if (snapshot.notableReferences.length > 0) {
    return snapshot.notableReferences.slice(0, 3);
  }
  return references.slice(0, 3);
}

function buildEffectiveBrief(freeformBrief: string, brief: ProjectBrief | null): string {
  const trimmed = freeformBrief.trim();
  if (!brief) return trimmed;
  const parts = [
    `Project brief: ${brief.title}`,
    `Goal: ${brief.goal}`,
    brief.audience ? `Audience: ${brief.audience}` : null,
    brief.constraints.length > 0 ? `Constraints: ${brief.constraints.join("; ")}` : null,
    brief.voiceGuardrails.length > 0 ? `Voice guardrails: ${brief.voiceGuardrails.join(" | ")}` : null,
    trimmed ? `Additional direction: ${trimmed}` : null,
  ].filter((part): part is string => Boolean(part));
  return parts.join("\n");
}

export function buildIdeaGenerationContext(
  root: string,
  input: {
    outputType: IdeaOutputType;
    briefText: string;
    brief: ProjectBrief | null;
    snapshot: TasteSnapshot;
    selectedReferences: ReferenceSummary[];
  },
): IdeaGenerationContext {
  const allReferences = readCompiledReferences(root);
  const catalysts = readCatalysts(root);
  const relatedReferenceIds = uniqueStrings(
    input.selectedReferences.flatMap((reference) => reference.relatedReferenceIds),
  );
  const selectedReferenceIds = new Set(input.selectedReferences.map((reference) => reference.id));
  const relatedReferences = relatedReferenceIds
    .map((id) => allReferences.find((reference) => reference.id === id))
    .filter((reference): reference is ReferenceSummary => reference != null && !selectedReferenceIds.has(reference.id))
    .slice(0, 6);
  const relevantReferenceIds = new Set([
    ...input.selectedReferences.map((reference) => reference.id),
    ...relatedReferences.map((reference) => reference.id),
  ]);
  const relevantCatalysts = catalysts
    .filter((catalyst) => catalyst.referenceIds.some((referenceId) => relevantReferenceIds.has(referenceId)))
    .slice(0, 8);
  const wikiArticles = uniqueStrings([
    ...input.selectedReferences.flatMap((reference) => buildReferenceSuggestedArticlePaths(reference)),
    "wiki/style-constitution.md",
    "wiki/not-me.md",
    "wiki/snapshots/current.md",
  ])
    .map((articlePath) => {
      try {
        return getWikiArticleDetail(root, articlePath);
      } catch {
        return null;
      }
    })
    .filter((article): article is WikiArticleDetail => article != null)
    .slice(0, 6);

  const transcriptExcerpts: Record<string, string> = {};
  for (const ref of input.selectedReferences) {
    const analysis = readAnalysis(root, ref.id);
    if (analysis?.transcript?.trim()) {
      transcriptExcerpts[ref.id] = truncate(analysis.transcript, 800);
    }
  }

  return {
    budget: "L2",
    outputType: input.outputType,
    briefText: input.briefText,
    brief: input.brief,
    snapshot: input.snapshot,
    selectedReferences: input.selectedReferences,
    relatedReferences,
    catalysts: relevantCatalysts,
    constitutionExcerpt: readTextExcerpt(getAftertastePaths(root).wikiStyleConstitution, 1200),
    notMeExcerpt: readTextExcerpt(getAftertastePaths(root).wikiNotMe, 800),
    transcriptExcerpts,
    wikiArticles: wikiArticles.map((article) => ({
      path: article.path,
      title: article.title,
      excerpt: truncate(article.lead || article.sections[0]?.body || "", 420),
      supportingReferenceIds: article.supportingReferenceIds,
      relatedPaths: article.relatedPaths.map((link) => link.path),
    })),
    recentSessions: readCreativeSessions(root).slice(0, 3),
  };
}

function extractVoiceAnchors(references: ReferenceSummary[]): string[] {
  const phrases: string[] = [];
  for (const ref of references) {
    if (!ref.note) continue;
    // Split on punctuation boundaries and take short, usable fragments
    const fragments = ref.note
      .split(/[.,;—\n]+/)
      .map((f) => f.trim())
      .filter((f) => f.length > 8 && f.length < 80);
    phrases.push(...fragments.slice(0, 2));
  }
  return phrases.slice(0, 3);
}

function buildFallbackIdeaPlan(context: IdeaGenerationContext): IdeaPlan {
  const { outputType, briefText, snapshot, selectedReferences, relatedReferences, catalysts, recentSessions } = context;
  const theme = snapshot.themes[0]?.label ?? "Private Voice";
  const secondaryTheme = snapshot.themes[1]?.label ?? "Daily Texture";
  const motif = snapshot.motifs[0]?.label ?? "Soft Pacing";
  const tone = selectedReferences.flatMap((reference) => reference.toneSignals)[0]?.label ?? theme;
  const visualCue = selectedReferences.flatMap((reference) => reference.visualSignals)[0]?.label ?? motif;
  const audioCue = selectedReferences.flatMap((reference) => reference.audioSignals)[0]?.label ?? "spoken texture";
  const referenceMoment = selectedReferences.flatMap((reference) => reference.moments)[0] ?? null;
  const refTitles = selectedReferences.map((reference) => reference.title);
  const citations = selectedReferences.map((reference) => reference.id);
  const briefNote = briefText.trim() ? briefText.trim() : null;
  const voiceAnchors = extractVoiceAnchors(selectedReferences);
  const anchorLine = voiceAnchors[0] ? `"${voiceAnchors[0]}"` : null;
  const boundary = pickPrimaryBoundary(context);
  const learnedPattern = recentSessions[0]?.learnedPatterns[0] ?? catalysts[0]?.label ?? theme;

  if (outputType === "hooks") {
    const hookShapes = [
      {
        label: "Quiet tension",
        angle: `a small detail carrying ${theme.toLowerCase()} without overexplaining it`,
        structure: [
          referenceMoment
            ? `Open on ${referenceMoment.description} without explaining it too early.`
            : `Opens on something small and specific — a detail, a gesture, a moment that doesn't explain itself yet.`,
          boundary ? `One possibility: keep it away from ${boundary.toLowerCase()}.` : `One possibility: let restraint do more work than explanation.`,
        ],
        anchor: anchorLine ?? `one possibility: a line about what ${theme.toLowerCase()} actually feels like from the inside`,
      },
      {
        label: "Honest admission",
        angle: `an admission grounded in ${secondaryTheme.toLowerCase()} and recent pattern memory`,
        structure: [
          `Starts with something you've been noticing but haven't said out loud. Grounded in ${secondaryTheme.toLowerCase()}.`,
          `This could echo the archive's recent pull toward ${learnedPattern.toLowerCase()} and keep the tone ${tone.toLowerCase()}.`,
        ],
        anchor: voiceAnchors[1] ? `"${voiceAnchors[1]}"` : `one possibility: a line about the pattern you keep returning to`,
      },
      {
        label: "Taste-to-brief bridge",
        angle: `bridge this week's taste read into the active brief`,
        structure: [
          `Names what your archive has been orbiting this week — ${theme.toLowerCase()} + ${motif.toLowerCase()} — then turns it toward the project.`,
          relatedReferences[0]
            ? `This moment might want to borrow the emotional distance of ${relatedReferences[0].title}.`
            : `This moment could stay close to the references without turning generic.`,
        ],
        anchor: briefNote ? `Ground it here: ${briefNote}` : `one possibility: a line about what you trust more than spectacle`,
      },
    ];

    return {
      outputType,
      options: hookShapes.map((shape, i) => {
      const pm = `[YOUR LINE: ${shape.anchor}]`;
      return {
        title: shape.label,
        angle: shape.angle,
        structure: [...shape.structure, "", pm],
        citations,
        rationale: `Shape ${i + 1} of 3 — drawn from the current archive, recent creative memory, and the ${theme.toLowerCase()} thread.`,
        personalMoments: [
          { placeholder: pm, prompt: shape.anchor },
        ],
      };
      }),
    };
  }

  if (outputType === "shotlist") {
    const anchorBeat = `[YOUR MOMENT: the frame that carries the emotional center of this piece — what image keeps coming back to you?]`;
    const briefBeat = briefNote ? `Brief: ${briefNote}` : `Keep it true to the ${theme.toLowerCase()} thread without over-explaining.`;

    return {
      outputType,
      options: [
      {
        title: "Five-beat intimate reel",
        angle: `an intimate five-beat structure grounded in ${motif.toLowerCase()}`,
        structure: [
          `1. Opening texture: a detail shot that sets the emotional temperature. (${visualCue.toLowerCase()} energy)`,
          `2. Mid close-up — slight movement, something intimate. The voiceover starts here.`,
          referenceMoment ? `3. ${referenceMoment.description}` : anchorBeat,
          `4. One static wide to let the tension breathe. No movement.`,
          `5. Close — text, silence, or a small action that lands the feeling without naming it. Let ${audioCue.toLowerCase()} guide how long you hold the last beat.`,
          "",
          boundary ? `${briefBeat} Avoid the archive's current boundary around ${boundary.toLowerCase()}.` : briefBeat,
        ],
        citations,
        rationale: `One possible shape that fits ${theme.toLowerCase()} and ${motif.toLowerCase()} — adjust any beat freely.`,
        personalMoments: [
          { placeholder: anchorBeat, prompt: "the frame that carries the emotional center of this piece — what image keeps coming back to you?" },
        ],
      },
      {
        title: "Client-safe translation",
        angle: `translate the same taste logic into a client-safe visual shape`,
        structure: [
          `1. Subject or product in soft, available light — not staged.`,
          `2. One human gesture to keep the piece from feeling sterile.`,
          `3. Slow movement through the environment.`,
          `[YOUR MOMENT: one frame from your references that captures the mood you want the client to feel]`,
          `5. Closing frame with negative space — room for text or silence.`,
          "",
          briefBeat,
        ],
        citations,
        rationale: `Same taste logic, reframed for a brand or freelance context. Reference anchors: ${refTitles.join(" · ") || "current snapshot"}.`,
        personalMoments: [
          {
            placeholder: `[YOUR MOMENT: one frame from your references that captures the mood you want the client to feel]`,
            prompt: "one frame from your references that captures the mood you want the client to feel",
          },
        ],
      },
      ],
    };
  }

  const hookSlot = `[YOUR LINE: the feeling or observation that started this whole piece — in your words, not cleaned up]`;
  const closeSlot = `[YOUR LINE: what you want someone to feel in the last three seconds — not what you want them to think]`;
  const briefNote2 = briefNote ? `\nBrief context: ${briefNote}` : "";

  return {
    outputType,
    options: [
      {
        title: "Personal reel script",
        angle: `a personal script shaped by ${theme.toLowerCase()} and ${secondaryTheme.toLowerCase()}`,
        structure: [
          "Hook:",
          hookSlot,
          "",
          "Body:",
          `This week the archive keeps returning to ${theme.toLowerCase()} and ${secondaryTheme.toLowerCase()}. The references move through ${motif.toLowerCase()} — slowly, close to the skin. One possibility: let the middle section follow that rhythm without rushing toward a conclusion.${briefNote2}`,
          referenceMoment ? `A useful center beat might be: ${referenceMoment.description}` : "",
          boundary ? `This version might want to avoid sounding like ${boundary.toLowerCase()}.` : "",
          "",
          "Close:",
          closeSlot,
        ].filter(Boolean),
        citations,
        rationale: `One possible shape for a personal reel — built from ${theme.toLowerCase()}, ${secondaryTheme.toLowerCase()}, and the current boundary surface.`,
        personalMoments: [
          { placeholder: hookSlot, prompt: "the feeling or observation that started this whole piece — in your words, not cleaned up" },
          { placeholder: closeSlot, prompt: "what you want someone to feel in the last three seconds — not what you want them to think" },
        ],
      },
      {
        title: "Client concept script",
        angle: `a client-safe concept script anchored in the archive's craft preferences`,
        structure: [
          "Opening:",
          `One possibility: name the emotional direction before naming the visual. Something like — the feeling this piece is after is ${theme.toLowerCase()}, not performance.`,
          "",
          "Core:",
          `The visual grammar borrows from ${visualCue.toLowerCase()} and ${motif.toLowerCase()} — the archive has been leaning that way. That gives the piece room to feel considered without losing warmth.${briefNote2}`,
          referenceMoment ? `One concrete beat to protect: ${referenceMoment.description}` : "",
          relatedReferences[0] ? `This could quietly echo ${relatedReferences[0].title} without copying it.` : "",
          "",
          "Close:",
          `[YOUR LINE: one sentence that tells the client what you want viewers to walk away carrying]`,
        ].filter(Boolean),
        citations,
        rationale: `Uses the same taste signals reframed as a concept brief. Reference anchors: ${refTitles.join(" · ") || "current snapshot"}.`,
        personalMoments: [
          {
            placeholder: `[YOUR LINE: one sentence that tells the client what you want viewers to walk away carrying]`,
            prompt: "one sentence that tells the client what you want viewers to walk away carrying",
          },
        ],
      },
    ],
  };
}

function renderIdeaPlan(plan: IdeaPlan, context: IdeaGenerationContext): IdeaDraft[] {
  const allowedCitations = new Set([
    ...context.selectedReferences.map((reference) => reference.id),
    ...context.relatedReferences.map((reference) => reference.id),
  ]);

  return plan.options.slice(0, 3).map((option) => {
    const personalMoments = option.personalMoments.map((moment, index) =>
      normalizePersonalMoment(moment, context.outputType, index),
    );
    let body = option.structure.join("\n");
    for (const moment of personalMoments) {
      if (!body.includes(moment.placeholder)) {
        body = `${body}\n\n${moment.placeholder}`;
      }
    }
    const citations = uniqueStrings(option.citations.filter((citation) => allowedCitations.has(citation)));
    if (citations.length === 0) {
      citations.push(...context.selectedReferences.slice(0, 2).map((reference) => reference.id));
    }

    return {
      id: crypto.randomUUID(),
      title: option.title,
      body,
      citations,
      rationale: option.rationale,
      outputType: plan.outputType,
      personalMoments,
    };
  });
}

function normalizePersonalMoment(
  moment: PersonalMoment,
  outputType: IdeaOutputType,
  index: number,
): PersonalMoment {
  const prompt = moment.prompt.trim() || `personal beat ${index + 1}`;
  const placeholder = moment.placeholder.trim();
  const marker = outputType === "shotlist" ? "YOUR MOMENT" : "YOUR LINE";
  if (placeholder.startsWith("[YOUR LINE:") || placeholder.startsWith("[YOUR MOMENT:")) {
    return {
      placeholder,
      prompt,
    };
  }
  return {
    placeholder: `[${marker}: ${prompt}]`,
    prompt,
  };
}

function pickPrimaryBoundary(context: IdeaGenerationContext): string | null {
  const antiSignals = [
    ...extractBulletsFromExcerpt(context.notMeExcerpt),
    ...context.recentSessions.flatMap((session) => session.antiSignals),
    ...context.snapshot.antiSignals,
  ];
  return antiSignals[0] ?? null;
}

function buildCreativeSessionRecord(
  context: IdeaGenerationContext,
  plan: IdeaPlan,
  generatedAt: string,
): CreativeSessionRecord {
  return {
    id: `session-${generatedAt.replace(/[-:.TZ]/g, "").slice(0, 14)}-${crypto.randomBytes(2).toString("hex")}`,
    briefId: context.brief?.id ?? null,
    outputType: context.outputType,
    referenceIds: context.selectedReferences.map((reference) => reference.id),
    catalystIds: context.catalysts.map((catalyst) => catalyst.id),
    snapshotId: context.snapshot.id,
    summary: summarizeCreativeSession(context, plan),
    learnedPatterns: uniqueStrings([
      ...context.selectedReferences.flatMap((reference) => reference.themes.slice(0, 1).map((theme) => theme.label)),
      ...context.catalysts.slice(0, 3).map((catalyst) => catalyst.label),
    ]).slice(0, 5),
    openQuestions: uniqueStrings([
      ...context.selectedReferences.flatMap((reference) => reference.openQuestions),
      ...context.snapshot.openQuestions,
    ]).slice(0, 5),
    antiSignals: uniqueStrings([
      ...context.snapshot.antiSignals,
      ...extractBulletsFromExcerpt(context.notMeExcerpt),
    ]).slice(0, 5),
    generatedAt,
  };
}

function summarizeCreativeSession(context: IdeaGenerationContext, plan: IdeaPlan): string {
  const firstOption = plan.options[0];
  const firstReference = context.selectedReferences[0]?.title ?? "current archive";
  if (!firstOption) {
    return `Idea session ran against ${firstReference} with no surviving options.`;
  }
  return `Idea session for ${context.outputType} pulled from ${firstReference} and centered on ${firstOption.angle.toLowerCase()}.`;
}

function extractBulletsFromExcerpt(content: string): string[] {
  return content
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2).trim());
}

function readTextExcerpt(filePath: string, maxChars: number): string {
  if (!fs.existsSync(filePath)) return "";
  return fs.readFileSync(filePath, "utf-8").slice(0, maxChars).trim();
}

function writeCreativeSession(root: string, session: CreativeSessionRecord): void {
  const paths = getAftertastePaths(root);
  const sessions = readCreativeSessions(root);
  sessions.unshift(session);
  writeJson(paths.creativeSessionsJson, sessions);
  syncQueryIndex(root);
  syncTasteGraph(root);
}

export function readCreativeSessions(root: string): CreativeSessionRecord[] {
  const filePath = getAftertastePaths(root).creativeSessionsJson;
  if (!fs.existsSync(filePath)) return [];
  return readJson<CreativeSessionRecord[]>(filePath);
}

function readAllCaptures(root: string): CaptureRecord[] {
  const dir = getAftertastePaths(root).rawCapturesDir;
  if (!fs.existsSync(dir)) return [];
  return fs
    .readdirSync(dir)
    .filter((file) => file.endsWith(".json"))
    .map((file) => withCaptureDefaults(readJson<CaptureRecord>(path.join(dir, file))));
}

function readCapture(root: string, captureId: string): CaptureRecord {
  const filePath = path.join(getAftertastePaths(root).rawCapturesDir, `${captureId}.json`);
  if (!fs.existsSync(filePath)) {
    throw new Error(`capture not found: ${captureId}`);
  }
  return withCaptureDefaults(readJson<CaptureRecord>(filePath));
}

function readAnalysis(root: string, captureId: string): AnalysisResult | null {
  const filePath = path.join(getAftertastePaths(root).rawMediaDir, captureId, "analysis.json");
  if (!fs.existsSync(filePath)) return null;
  return withAnalysisDefaults(readJson<AnalysisResult>(filePath));
}

function readTranscriptArtifact(root: string, captureId: string): TranscriptArtifact | null {
  const filePath = getTranscriptArtifactPath(root, captureId);
  if (!fs.existsSync(filePath)) return null;
  return withTranscriptArtifactDefaults(readJson<TranscriptArtifact>(filePath), {
    captureId,
    sourceUrl: "",
    sourceKind: "reference",
    assetIds: [],
  });
}

function readMediaAnalysisArtifact(root: string, captureId: string): MediaAnalysisArtifact | null {
  const filePath = getMediaAnalysisArtifactPath(root, captureId);
  if (!fs.existsSync(filePath)) return null;
  return withMediaAnalysisArtifactDefaults(readJson<MediaAnalysisArtifact>(filePath), {
    captureId,
  });
}

async function ensureTranscriptArtifact(root: string, capture: CaptureRecord): Promise<TranscriptArtifact> {
  const existing = readTranscriptArtifact(root, capture.id);
  if (existing) {
    const resolved = withTranscriptArtifactDefaults(existing, {
      captureId: capture.id,
      sourceUrl: capture.sourceUrl,
      sourceKind: capture.sourceKind,
      assetIds: capture.assets.map((asset) => asset.id),
      acquisition: capture.acquisition
        ? {
            mode: capture.acquisition.mode,
            provider: capture.acquisition.provider,
          }
        : undefined,
    });
    if (shouldKeepTranscriptArtifact(resolved)) {
      return resolved;
    }
  }

  const artifact = await resolveTranscriptArtifact(root, capture);
  const filePath = getTranscriptArtifactPath(root, capture.id);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  writeJson(filePath, artifact);
  return artifact;
}

async function ensureMediaAnalysisArtifact(
  root: string,
  capture: CaptureRecord,
  transcriptArtifact: TranscriptArtifact,
): Promise<MediaAnalysisArtifact> {
  const existing = readMediaAnalysisArtifact(root, capture.id);
  if (existing) {
    const resolved = withMediaAnalysisArtifactDefaults(existing, {
      captureId: capture.id,
      acquisition: capture.acquisition
        ? {
            mode: capture.acquisition.mode,
            provider: capture.acquisition.provider,
          }
        : undefined,
    });
    if (shouldKeepMediaAnalysisArtifact(resolved)) {
      return resolved;
    }
  }

  const artifact = await resolveMediaAnalysisWithAdapter({
    capture,
    transcriptArtifact,
  });
  const filePath = getMediaAnalysisArtifactPath(root, capture.id);
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  writeJson(filePath, artifact);
  return artifact;
}

function getTranscriptArtifactPath(root: string, captureId: string): string {
  return path.join(getAftertastePaths(root).rawMediaDir, captureId, "transcript.json");
}

function getMediaAnalysisArtifactPath(root: string, captureId: string): string {
  return path.join(getAftertastePaths(root).rawMediaDir, captureId, "media-analysis.json");
}

function buildFallbackTranscriptArtifact(capture: CaptureRecord): TranscriptArtifact {
  const notes = [
    "Fallback transcript assembled from savedReason, note, and fetched page metadata.",
  ];
  if (isInstagramReelUrl(capture.sourceUrl) && capture.assets.length === 0) {
    notes.push(
      "No Instagram Reel media bytes were acquired, so this transcript remains a stitched fallback until a local upload or official access path exists.",
    );
  }
  return {
    captureId: capture.id,
    status: "ok",
    source: "capture-stitch",
    text: buildStitchedTranscriptText(capture),
    segments: [],
    language: null,
    generatedAt: new Date().toISOString(),
    provenance: {
      sourceUrl: capture.sourceUrl,
      sourceKind: capture.sourceKind,
      assetIds: capture.assets.map((asset) => asset.id),
      notes,
      acquisition: capture.acquisition
        ? {
            mode: capture.acquisition.mode,
            provider: capture.acquisition.provider,
          }
        : undefined,
    },
  };
}

function shouldKeepTranscriptArtifact(artifact: TranscriptArtifact): boolean {
  return artifact.status === "ok" && artifact.source !== "capture-stitch";
}

function shouldKeepMediaAnalysisArtifact(artifact: MediaAnalysisArtifact): boolean {
  return artifact.status === "ok" && artifact.source !== "heuristic";
}

async function resolveTranscriptArtifact(root: string, capture: CaptureRecord): Promise<TranscriptArtifact> {
  if (isYouTubeSourceUrl(capture.sourceUrl)) {
    return tryYouTubeTranscriptArtifact(capture);
  }

  // Substack: hit the REST API directly for reliable article body extraction.
  // The API returns clean JSON with body_html, sidestepping Substack's dynamic
  // class names and Next.js hydration structure that break HTML scraping.
  const substackArtifact = await trySubstackApiTranscriptArtifact(capture);
  if (substackArtifact) return substackArtifact;

  // Fetch the source page once and reuse it for all page-based extraction paths.
  // This avoids double-fetching (and potential throttling) when trying podcast
  // transcript blocks, web article body, and RSS feed discovery in sequence.
  // Normalize the URL first — e.g. open.substack.com app-reader links need to
  // be converted to the canonical subdomain before a plain HTTP fetch works.
  let page: Awaited<ReturnType<typeof fetchTextResource>> | null = null;
  if (capture.sourceUrl) {
    try {
      page = await fetchTextResource(normalizeArticleUrl(capture.sourceUrl));
    } catch {
      page = null;
    }
  }

  if (page && !page.ok) {
    return buildErrorTranscriptArtifact(capture, "podcast-page", `source page fetch failed with ${page.status}`);
  }

  if (page?.ok) {
    // 1. Podcast page transcript blocks (explicit transcript sections)
    const podcastTranscript = extractPodcastPageTranscript(page.text);
    if (podcastTranscript) {
      return buildResolvedTranscriptArtifact(capture, {
        source: "podcast-page",
        text: podcastTranscript,
        segments: [],
        language: null,
        notes: ["Transcript recovered from a transcript-friendly source page during analyze."],
      });
    }

    // 2. Web article body (Substack, Medium, blogs, newsletters)
    if (isWebArticleSourceUrl(capture.sourceUrl)) {
      const articleText = extractWebArticleText(page.text, capture.sourceUrl);
      if (articleText) {
        return buildResolvedTranscriptArtifact(capture, {
          source: "web-article",
          text: articleText,
          segments: [],
          language: null,
          notes: ["Article body text extracted from the source page during analyze."],
        });
      }
    }

    // 3. Podcast RSS transcript (uses feed URLs discovered from the same page)
    const feedUrls = extractFeedUrls(page.text, page.url);
    const rssArtifact = await tryPodcastRssTranscriptArtifact(capture, feedUrls);
    if (rssArtifact.status === "ok" || rssArtifact.status === "error") {
      return rssArtifact;
    }
  }

  // 4. Uploaded audio transcription
  const audioArtifact = await tryAudioUploadTranscriptArtifact(root, capture);
  if (audioArtifact) return audioArtifact;

  if (capture.assets.length > 0) {
    return buildFallbackTranscriptArtifact(capture);
  }

  return buildUnavailableTranscriptArtifact(capture, [
    page ? "No transcript block or article body could be extracted from the source page." : "Source page could not be fetched.",
  ]);
}

async function tryAudioUploadTranscriptArtifact(root: string, capture: CaptureRecord): Promise<TranscriptArtifact | null> {
  const audioAssets = capture.assets.filter((asset) => asset.kind === "audio");
  if (audioAssets.length === 0) return null;

  const assetPath = path.join(root, audioAssets[0].path);
  try {
    const result = await transcribeAudioFile(assetPath);
    if (!result) return null;
    return buildResolvedTranscriptArtifact(capture, {
      source: "audio-upload",
      text: result.text,
      segments: result.segments,
      language: result.language,
      notes: ["Transcript generated from uploaded audio via OpenAI Whisper."],
    });
  } catch (error) {
    return buildErrorTranscriptArtifact(capture, "audio-upload", error instanceof Error ? error.message : String(error));
  }
}

function isYouTubeSourceUrl(sourceUrl: string): boolean {
  const host = new URL(sourceUrl).hostname.replace(/^www\./, "");
  return host.includes("youtube") || host === "youtu.be";
}

async function tryYouTubeTranscriptArtifact(capture: CaptureRecord): Promise<TranscriptArtifact> {
  try {
    const page = await fetchTextResource(capture.sourceUrl);
    if (!page.ok) {
      return buildErrorTranscriptArtifact(capture, "youtube", `YouTube page fetch failed with ${page.status}`);
    }
    const captionsUrl = extractYouTubeCaptionsUrl(page.text);
    if (!captionsUrl) {
      return buildUnavailableTranscriptArtifact(capture, [
        "No YouTube caption track was discoverable on the source page.",
      ]);
    }
    const captions = await fetchTextResource(captionsUrl);
    if (!captions.ok) {
      return buildErrorTranscriptArtifact(capture, "youtube", `YouTube captions fetch failed with ${captions.status}`);
    }
    const transcript = parseYouTubeTranscript(captions.text);
    if (!transcript.text) {
      return buildUnavailableTranscriptArtifact(capture, [
        "A YouTube caption track was discovered, but no transcript text could be parsed from it.",
      ]);
    }
    return buildResolvedTranscriptArtifact(capture, {
      source: "youtube",
      text: transcript.text,
      segments: transcript.segments,
      language: transcript.language,
      notes: [
        "Transcript recovered from a YouTube caption track during analyze.",
      ],
    });
  } catch (error) {
    return buildErrorTranscriptArtifact(capture, "youtube", error instanceof Error ? error.message : String(error));
  }
}

async function tryPodcastPageTranscriptArtifact(capture: CaptureRecord): Promise<
  TranscriptArtifact & { feedUrls?: string[] }
> {
  try {
    const page = await fetchTextResource(capture.sourceUrl);
    if (!page.ok) {
      return {
        ...buildErrorTranscriptArtifact(capture, "podcast-page", `podcast page fetch failed with ${page.status}`),
        feedUrls: [],
      };
    }
    const transcriptText = extractPodcastPageTranscript(page.text);
    const feedUrls = extractFeedUrls(page.text, page.url);
    if (!transcriptText) {
      return {
        ...buildUnavailableTranscriptArtifact(capture, [
          "No transcript block was found on the source page.",
        ]),
        feedUrls,
      };
    }
    return {
      ...buildResolvedTranscriptArtifact(capture, {
        source: "podcast-page",
        text: transcriptText,
        segments: [],
        language: null,
        notes: [
          "Transcript recovered from a transcript-friendly source page during analyze.",
        ],
      }),
      feedUrls,
    };
  } catch (error) {
    return {
      ...buildErrorTranscriptArtifact(capture, "podcast-page", error instanceof Error ? error.message : String(error)),
      feedUrls: [],
    };
  }
}

async function tryPodcastRssTranscriptArtifact(
  capture: CaptureRecord,
  feedUrls: string[],
): Promise<TranscriptArtifact> {
  if (feedUrls.length === 0) {
    return buildUnavailableTranscriptArtifact(capture, [
      "No RSS feed URL was discoverable from the source page.",
    ]);
  }

  for (const feedUrl of feedUrls) {
    try {
      const feed = await fetchTextResource(feedUrl);
      if (!feed.ok) continue;
      const item = findMatchingRssItem(feed.text, capture.sourceUrl);
      if (!item) continue;

      const transcriptLink = readPodcastTranscriptLink(item, feed.url);
      if (transcriptLink) {
        const linkedTranscript = await fetchTextResource(transcriptLink.url);
        if (!linkedTranscript.ok) {
          return buildErrorTranscriptArtifact(capture, "podcast-rss", `podcast transcript fetch failed with ${linkedTranscript.status}`);
        }
        const parsed = parseLinkedTranscript(linkedTranscript.text, transcriptLink.type);
        if (parsed) {
          return buildResolvedTranscriptArtifact(capture, {
            source: "podcast-rss",
            text: parsed,
            segments: [],
            language: null,
            notes: [
              `Transcript recovered from podcast RSS metadata at ${feedUrl}.`,
            ],
          });
        }
      }

      const embeddedTranscript = extractEmbeddedRssTranscript(item);
      if (embeddedTranscript) {
        return buildResolvedTranscriptArtifact(capture, {
          source: "podcast-rss",
          text: embeddedTranscript,
          segments: [],
          language: null,
          notes: [
            `Transcript recovered from embedded podcast RSS content at ${feedUrl}.`,
          ],
        });
      }
    } catch {
      continue;
    }
  }

  return buildUnavailableTranscriptArtifact(capture, [
    "No podcast RSS transcript field was discoverable for this source URL.",
  ]);
}

async function fetchTextResource(sourceUrl: string): Promise<{ ok: boolean; status: number; text: string; url: string }> {
  const response = await fetch(sourceUrl, {
    redirect: "follow",
    signal: AbortSignal.timeout(5000),
    headers: {
      "user-agent": "Aftertaste/0.1 (+local-first)",
      accept: "text/html,application/xml,text/xml,text/plain,*/*",
    },
  });
  const text = await response.text();
  return {
    ok: response.ok,
    status: response.status,
    text,
    url: response.url || sourceUrl,
  };
}

function extractYouTubeCaptionsUrl(html: string): string | null {
  const match = html.match(/"captionTracks":\s*\[(.*?)\]/s);
  const block = match?.[1] ?? "";
  const urlMatch = block.match(/"baseUrl":"([^"]+)"/);
  if (!urlMatch?.[1]) return null;
  try {
    return JSON.parse(`"${urlMatch[1]}"`);
  } catch {
    return decodeEntities(urlMatch[1].replace(/\\u0026/g, "&"));
  }
}

function parseYouTubeTranscript(xml: string): {
  text: string;
  segments: Array<{ text: string; startMs?: number; endMs?: number }>;
  language: string | null;
} {
  const rawSegments = Array.from(xml.matchAll(/<(?:text|p)\b([^>]*)>([\s\S]*?)<\/(?:text|p)>/g))
    .map((match): { text: string; startMs?: number; endMs?: number } | null => {
      const attrs = match[1] ?? "";
      const rawText = normalizeTranscriptText(match[2] ?? "");
      if (!rawText) return null;
      const start = readNumericAttr(attrs, ["start", "t"]);
      const dur = readNumericAttr(attrs, ["dur", "d"]);
      return {
        text: rawText,
        startMs: start == null ? undefined : Math.round(start * 1000),
        endMs: start == null || dur == null ? undefined : Math.round((start + dur) * 1000),
      };
    });
  const segments = rawSegments.filter((segment): segment is { text: string; startMs?: number; endMs?: number } => segment !== null);
  const languageMatch = xml.match(/\blang(?:_code|)="([^"]+)"/i);
  return {
    text: uniqueStrings(segments.map((segment) => segment.text)).join(" "),
    segments,
    language: languageMatch?.[1] ?? null,
  };
}

function readNumericAttr(attrs: string, names: string[]): number | null {
  for (const name of names) {
    const match = attrs.match(new RegExp(`${name}="([^"]+)"`, "i"));
    if (match?.[1]) {
      const value = Number(match[1]);
      if (Number.isFinite(value)) return value;
    }
  }
  return null;
}

function extractPodcastPageTranscript(html: string): string | null {
  const transcriptBlockPatterns = [
    /<(?:article|section|div|main)[^>]*(?:id|class|itemprop)=["'][^"']*transcript[^"']*["'][^>]*>([\s\S]{0,12000}?)<\/(?:article|section|div|main)>/i,
    /<h[1-6][^>]*>\s*Transcript\s*<\/h[1-6]>([\s\S]{0,12000}?)(?:<h[1-6][^>]*>|$)/i,
  ];
  for (const pattern of transcriptBlockPatterns) {
    const match = html.match(pattern);
    const text = normalizeTranscriptText(match?.[1] ?? "");
    if (isTranscriptLike(text)) return text;
  }
  return null;
}

function normalizeArticleUrl(sourceUrl: string): string {
  try {
    const parsed = new URL(sourceUrl);
    // open.substack.com/pub/[pub]/p/[slug] is an app-reader URL that returns
    // a JavaScript redirect page when fetched directly. Map it to the canonical
    // subdomain URL so the HTML fetch gets the actual article.
    if (parsed.hostname === "open.substack.com") {
      const match = parsed.pathname.match(/^\/pub\/([^/]+)\/p\/(.+)/);
      if (match) {
        return `https://${match[1]}.substack.com/p/${match[2]}`;
      }
    }
    return sourceUrl;
  } catch {
    return sourceUrl;
  }
}

function isSubstackUrl(sourceUrl: string): boolean {
  try {
    const host = new URL(sourceUrl).hostname;
    return host.endsWith(".substack.com");
  } catch {
    return false;
  }
}

function extractSubstackPubAndSlug(sourceUrl: string): { pub: string; slug: string } | null {
  try {
    const normalized = normalizeArticleUrl(sourceUrl);
    const parsed = new URL(normalized);
    const match = parsed.pathname.match(/^\/p\/([^/?#]+)/);
    if (!match) return null;
    const pub = parsed.hostname.replace(/\.substack\.com$/, "");
    return { pub, slug: match[1] };
  } catch {
    return null;
  }
}

function isWebArticleSourceUrl(sourceUrl: string): boolean {
  try {
    const host = new URL(sourceUrl).hostname.replace(/^www\./, "");
    if (host.includes("youtube") || host === "youtu.be") return false;
    if (host.includes("instagram")) return false;
    if (host.includes("tiktok")) return false;
    if (host.includes("spotify")) return false;
    if (host.includes("soundcloud")) return false;
    if (host.includes("vimeo")) return false;
    if (host.includes("twitch")) return false;
    if (host.includes("podcasts.apple")) return false;
    return true;
  } catch {
    return false;
  }
}

function extractWebArticleText(html: string, sourceUrl: string): string | null {
  // Try __NEXT_DATA__ first — Next.js SSR sites (Substack, Ghost, etc.) embed
  // the full post body as structured JSON, which is more reliable than regex
  // scraping the rendered HTML tree.
  const nextDataMatch = html.match(/<script[^>]*id="__NEXT_DATA__"[^>]*>([\s\S]{0,300000}?)<\/script>/i);
  if (nextDataMatch?.[1]) {
    try {
      const nextData = JSON.parse(nextDataMatch[1]) as Record<string, unknown>;
      const props = nextData.props as Record<string, unknown> | undefined;
      const pageProps = props?.pageProps as Record<string, unknown> | undefined;
      const post = pageProps?.post as Record<string, unknown> | undefined;
      const bodyHtml = post?.body_html ?? post?.body ?? "";
      if (typeof bodyHtml === "string" && bodyHtml.length > 100) {
        const paragraphs = Array.from(bodyHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
          .map((match) => normalizeTranscriptText(match[1] ?? ""))
          .filter((p) => p.trim().length > 20);
        if (paragraphs.length >= 3) {
          return paragraphs.slice(0, 80).join(" ");
        }
      }
    } catch {
      // fall through to HTML parsing
    }
  }

  let searchRegion = html;

  // Try to narrow to a known content container before extracting paragraphs.
  // Substack uses div.body.markup or div.available-content; most other CMS
  // platforms use <article> or <main>.
  const containerPatterns = [
    /<div[^>]*class="[^"]*\bbody\b[^"]*\bmarkup\b[^"]*"[^>]*>([\s\S]{0,60000})/i,
    /<div[^>]*class="[^"]*\bavailable-content\b[^"]*"[^>]*>([\s\S]{0,60000})/i,
    /<article[^>]*>([\s\S]{0,60000})<\/article>/i,
    /<main[^>]*>([\s\S]{0,60000})<\/main>/i,
  ];

  for (const pattern of containerPatterns) {
    const match = html.match(pattern);
    if (match?.[1]) {
      searchRegion = match[1];
      break;
    }
  }

  const paragraphs = Array.from(searchRegion.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
    .map((match) => normalizeTranscriptText(match[1] ?? ""))
    .filter((p) => p.trim().length > 20);

  if (paragraphs.length < 3) return null;

  const combined = paragraphs.slice(0, 80).join(" ");
  return isTranscriptLike(combined) ? combined : null;
}

async function trySubstackApiTranscriptArtifact(capture: CaptureRecord): Promise<TranscriptArtifact | null> {
  if (!isSubstackUrl(capture.sourceUrl)) return null;
  const info = extractSubstackPubAndSlug(capture.sourceUrl);
  if (!info) return null;
  try {
    // Substack's /api/v1/posts/by-slug/ endpoint redirects to the HTML page
    // and the page HTML loads content via JS bundles — neither is scrapeable.
    // The RSS feed at /feed reliably includes the full article body in
    // <content:encoded> for public posts, so use that instead.
    const feedUrl = `https://${info.pub}.substack.com/feed`;
    const res = await fetch(feedUrl, {
      redirect: "follow",
      signal: AbortSignal.timeout(8000),
      headers: {
        "user-agent": "Aftertaste/0.1 (+local-first)",
        accept: "application/rss+xml, application/xml, text/xml, */*",
      },
    });
    if (!res.ok) return null;
    const feedXml = await res.text();
    // Find the <item> whose <link> matches our slug
    const items = Array.from(feedXml.matchAll(/<item>([\s\S]*?)<\/item>/gi));
    const targetItem = items.find((m) => {
      const linkMatch = m[1]?.match(/<link>([^<]+)<\/link>/i);
      const link = linkMatch?.[1]?.trim() ?? "";
      return link.includes(`/p/${info.slug}`);
    });
    if (!targetItem) return null;
    // Extract <content:encoded> CDATA block
    const contentMatch = targetItem[1]?.match(/<content:encoded><!\[CDATA\[([\s\S]*?)\]\]>/i);
    const bodyHtml = contentMatch?.[1];
    if (!bodyHtml || bodyHtml.length < 100) return null;
    const paragraphs = Array.from(bodyHtml.matchAll(/<p[^>]*>([\s\S]*?)<\/p>/gi))
      .map((m) => normalizeTranscriptText(m[1] ?? ""))
      .filter((p) => p.trim().length > 20);
    if (paragraphs.length < 3) return null;
    const text = paragraphs.slice(0, 80).join(" ");
    if (!isTranscriptLike(text)) return null;
    return buildResolvedTranscriptArtifact(capture, {
      source: "web-article",
      text,
      segments: [],
      language: null,
      notes: [`Article body extracted from Substack RSS feed (${info.pub}/${info.slug}).`],
    });
  } catch {
    return null;
  }
}

async function tryWebArticleTranscriptArtifact(capture: CaptureRecord): Promise<TranscriptArtifact | null> {
  if (!capture.sourceUrl || !isWebArticleSourceUrl(capture.sourceUrl)) return null;
  try {
    const page = await fetchTextResource(capture.sourceUrl);
    if (!page.ok) return null;
    const articleText = extractWebArticleText(page.text, capture.sourceUrl);
    if (!articleText) return null;
    return buildResolvedTranscriptArtifact(capture, {
      source: "web-article",
      text: articleText,
      segments: [],
      language: null,
      notes: ["Article body text extracted from the source page during analyze."],
    });
  } catch {
    return null;
  }
}

function extractFeedUrls(html: string, pageUrl: string): string[] {
  const feedMatches = Array.from(html.matchAll(/<link[^>]*type=["']application\/(?:rss|atom)\+xml["'][^>]*href=["']([^"']+)["'][^>]*>/gi))
    .map((match) => match[1] ?? "")
    .filter(Boolean);
  const anchorMatches = Array.from(html.matchAll(/<a[^>]*href=["']([^"']+(?:rss|feed|xml)[^"']*)["'][^>]*>/gi))
    .map((match) => match[1] ?? "")
    .filter(Boolean);
  const resolved = [...feedMatches, ...anchorMatches]
    .map((href) => resolveUrl(pageUrl, href))
    .filter((href): href is string => Boolean(href));
  return uniqueStrings(resolved);
}

function findMatchingRssItem(feedXml: string, sourceUrl: string): string | null {
  const items = Array.from(feedXml.matchAll(/<item\b[\s\S]*?<\/item>/gi)).map((match) => match[0] ?? "");
  return items.find((item) => item.includes(sourceUrl)) ?? items.find((item) => {
    const link = readTagContents(item, "link");
    if (!link) return false;
    return normalizeComparableUrl(link) === normalizeComparableUrl(sourceUrl);
  }) ?? null;
}

function readPodcastTranscriptLink(itemXml: string, baseUrl: string): { url: string; type: string | null } | null {
  const match = itemXml.match(/<podcast:transcript\b[^>]*url=["']([^"']+)["'][^>]*(?:type=["']([^"']+)["'])?[^>]*\/?>/i);
  if (!match?.[1]) return null;
  return {
    url: resolveUrl(baseUrl, match[1]) ?? match[1],
    type: match[2] ?? null,
  };
}

function extractEmbeddedRssTranscript(itemXml: string): string | null {
  const transcriptTag = readTagContents(itemXml, "transcript");
  if (isTranscriptLike(transcriptTag)) {
    return normalizeTranscriptText(transcriptTag);
  }
  const encoded = readTagContents(itemXml, "content:encoded") ?? readTagContents(itemXml, "description");
  const transcriptText = extractPodcastPageTranscript(encoded ?? "");
  return transcriptText && isTranscriptLike(transcriptText) ? transcriptText : null;
}

function readTagContents(xml: string, tagName: string): string | null {
  const pattern = new RegExp(`<${escapeRegex(tagName)}\\b[^>]*>([\\s\\S]*?)<\\/${escapeRegex(tagName)}>`, "i");
  const match = xml.match(pattern);
  return match?.[1] ? stripCdata(match[1]) : null;
}

function stripCdata(value: string): string {
  return value.replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1");
}

function parseLinkedTranscript(text: string, type: string | null): string | null {
  if (/(vtt|plain|text)/i.test(type ?? "") || /^WEBVTT/i.test(text)) {
    const cleaned = text
      .replace(/^WEBVTT[\s\S]*?\n\n/i, "")
      .split(/\n+/)
      .filter((line) => line.trim() && !/^\d+$/.test(line.trim()) && !/^\d{2}:\d{2}:\d{2}\.\d{3}\s+-->\s+\d{2}:\d{2}:\d{2}\.\d{3}/.test(line))
      .join(" ");
    const normalized = normalizeTranscriptText(cleaned);
    return isTranscriptLike(normalized) ? normalized : null;
  }
  const normalized = normalizeTranscriptText(text);
  return isTranscriptLike(normalized) ? normalized : null;
}

function normalizeTranscriptText(value: string): string {
  return decodeEntities(
    value
      .replace(/<s\b[^>]*>/gi, "")
      .replace(/<\/s>/gi, " ")
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<\/p>/gi, "\n")
      .replace(/<[^>]+>/g, " ")
      .replace(/\s+/g, " ")
      .trim(),
  );
}

function isTranscriptLike(value: string | null | undefined): value is string {
  return Boolean(value && value.trim().split(/\s+/).length >= 12);
}

function resolveUrl(baseUrl: string, maybeRelative: string): string | null {
  try {
    return new URL(maybeRelative, baseUrl).toString();
  } catch {
    return null;
  }
}

function normalizeComparableUrl(value: string): string {
  try {
    const parsed = new URL(value);
    parsed.hash = "";
    if (parsed.pathname.endsWith("/")) {
      parsed.pathname = parsed.pathname.slice(0, -1);
    }
    return parsed.toString();
  } catch {
    return value;
  }
}

function buildResolvedTranscriptArtifact(
  capture: CaptureRecord,
  input: {
    source: TranscriptArtifact["source"];
    text: string;
    segments: TranscriptArtifact["segments"];
    language: string | null;
    notes: string[];
  },
): TranscriptArtifact {
  return {
    captureId: capture.id,
    status: "ok",
    source: input.source,
    text: input.text,
    segments: input.segments ?? [],
    language: input.language,
    generatedAt: new Date().toISOString(),
    provenance: {
      sourceUrl: capture.sourceUrl,
      sourceKind: capture.sourceKind,
      assetIds: capture.assets.map((asset) => asset.id),
      notes: input.notes,
      acquisition: capture.acquisition
        ? {
            mode: capture.acquisition.mode,
            provider: capture.acquisition.provider,
          }
        : undefined,
    },
  };
}

function buildUnavailableTranscriptArtifact(capture: CaptureRecord, notes: string[]): TranscriptArtifact {
  const fallback = buildFallbackTranscriptArtifact(capture);
  return {
    ...fallback,
    status: "unavailable",
    provenance: {
      ...fallback.provenance,
      notes: uniqueStrings([...notes, ...fallback.provenance.notes]),
    },
  };
}

function buildErrorTranscriptArtifact(
  capture: CaptureRecord,
  source: "youtube" | "podcast-page" | "podcast-rss" | "audio-upload",
  error: string,
): TranscriptArtifact {
  const fallback = buildFallbackTranscriptArtifact(capture);
  return {
    ...fallback,
    status: "error",
    source,
    error,
    provenance: {
      ...fallback.provenance,
      notes: uniqueStrings([
        `Transcript retrieval error: ${error}`,
        ...fallback.provenance.notes,
      ]),
    },
  };
}

function clearManagedMarkdown(dir: string): void {
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith(".md")) {
      fs.unlinkSync(path.join(dir, file));
    }
  }
}

function clearManagedJson(dir: string): void {
  if (!fs.existsSync(dir)) return;
  for (const file of fs.readdirSync(dir)) {
    if (file.endsWith(".json")) {
      fs.unlinkSync(path.join(dir, file));
    }
  }
}

function withCaptureDefaults(capture: CaptureRecord): CaptureRecord {
  const derivedAcquisition = deriveCaptureAcquisition(capture.sourceUrl, capture.assets ?? [], capture.createdAt);
  return {
    ...capture,
    sourceKind: capture.sourceKind ?? "reference",
    savedReason: capture.savedReason ?? (capture.note.trim() || null),
    collection: capture.collection ?? null,
    projectIds: capture.projectIds ?? [],
    acquisition: capture.acquisition
      ? {
          ...derivedAcquisition,
          ...capture.acquisition,
          notes: capture.acquisition.notes ?? derivedAcquisition.notes,
          sourceUrl: capture.acquisition.sourceUrl ?? derivedAcquisition.sourceUrl,
          acquiredAt: capture.acquisition.acquiredAt ?? derivedAcquisition.acquiredAt,
        }
      : derivedAcquisition,
    rawPaths: {
      inbox: capture.rawPaths?.inbox ?? "",
      capture: capture.rawPaths?.capture ?? "",
      analysis: capture.rawPaths?.analysis ?? null,
      assetsDir: capture.rawPaths?.assetsDir ?? null,
      referencePage: capture.rawPaths?.referencePage ?? null,
      artifacts: {
        transcript: capture.rawPaths?.artifacts?.transcript ?? null,
        mediaAnalysis: capture.rawPaths?.artifacts?.mediaAnalysis ?? null,
      },
    },
  };
}

function withAnalysisDefaults(analysis: AnalysisResult): AnalysisResult {
  return {
    ...analysis,
    transcriptProvenance: {
      artifactPath: analysis.transcriptProvenance?.artifactPath ?? null,
      source: analysis.transcriptProvenance?.source ?? "capture-stitch",
      status: analysis.transcriptProvenance?.status ?? "ok",
      sourceKind: analysis.transcriptProvenance?.sourceKind ?? "reference",
    },
    toneSignals: analysis.toneSignals ?? [],
    visualSignals: analysis.visualSignals ?? [],
    audioSignals: analysis.audioSignals ?? [],
    pacingSignals: analysis.pacingSignals ?? [],
    storySignals: analysis.storySignals ?? [],
    openQuestions: analysis.openQuestions ?? [],
    moments: analysis.moments ?? [],
  };
}

function withTranscriptArtifactDefaults(
  artifact: TranscriptArtifact,
  fallback: {
    captureId: string;
    sourceUrl: string;
    sourceKind: SourceKind;
    assetIds: string[];
    acquisition?: {
      mode: CaptureAcquisitionRecord["mode"];
      provider: CaptureAcquisitionRecord["provider"];
    };
  },
): TranscriptArtifact {
  return {
    ...artifact,
    captureId: artifact.captureId ?? fallback.captureId,
    status: artifact.status ?? "unavailable",
    source: artifact.source ?? "capture-stitch",
    text: artifact.text ?? "",
    segments: artifact.segments ?? [],
    language: artifact.language ?? null,
    generatedAt: artifact.generatedAt ?? new Date(0).toISOString(),
    provenance: {
      sourceUrl: artifact.provenance?.sourceUrl ?? fallback.sourceUrl,
      sourceKind: artifact.provenance?.sourceKind ?? fallback.sourceKind,
      assetIds: artifact.provenance?.assetIds ?? fallback.assetIds,
      notes: artifact.provenance?.notes ?? [],
      acquisition: artifact.provenance?.acquisition ?? fallback.acquisition,
    },
  };
}

function withMediaAnalysisArtifactDefaults(
  artifact: MediaAnalysisArtifact,
  fallback: {
    captureId: string;
    acquisition?: {
      mode: CaptureAcquisitionRecord["mode"];
      provider: CaptureAcquisitionRecord["provider"];
    };
  },
): MediaAnalysisArtifact {
  return {
    ...artifact,
    captureId: artifact.captureId ?? fallback.captureId,
    status: artifact.status ?? "unavailable",
    source: artifact.source ?? "heuristic",
    summary: artifact.summary ?? "",
    visualSignals: artifact.visualSignals ?? [],
    audioSignals: artifact.audioSignals ?? [],
    storySignals: artifact.storySignals ?? [],
    moments: artifact.moments ?? [],
    generatedAt: artifact.generatedAt ?? new Date(0).toISOString(),
    acquisition: artifact.acquisition ?? fallback.acquisition,
    notes: artifact.notes ?? [],
  };
}

function withReferenceDefaults(reference: ReferenceSummary): ReferenceSummary {
  return {
    ...reference,
    sourceKind: reference.sourceKind ?? "reference",
    savedReason: reference.savedReason ?? (reference.note.trim() || null),
    collection: reference.collection ?? null,
    projectIds: reference.projectIds ?? [],
    toneSignals: reference.toneSignals ?? [],
    visualSignals: reference.visualSignals ?? [],
    audioSignals: reference.audioSignals ?? [],
    pacingSignals: reference.pacingSignals ?? [],
    storySignals: reference.storySignals ?? [],
    moments: reference.moments ?? [],
    thumbnailAssetId: reference.thumbnailAssetId ?? null,
    relatedReferenceIds: reference.relatedReferenceIds ?? [],
    bestUseCases: reference.bestUseCases ?? [],
    doNotCopy: reference.doNotCopy ?? [],
    emotionalTone: reference.emotionalTone ?? [],
    openQuestions: reference.openQuestions ?? [],
    contradictions: reference.contradictions ?? [],
    transcriptSource: reference.transcriptSource ?? "capture-stitch",
    provenance: reference.provenance ?? {
      sourceIds: [reference.id],
      sourcePaths: [reference.pagePath],
      compiledAt: reference.createdAt,
      sourceHash: null,
    },
  };
}

function withSnapshotDefaults(snapshot: TasteSnapshot): TasteSnapshot {
  return {
    ...snapshot,
    notableReferences: (snapshot.notableReferences ?? []).map((reference) =>
      withReferenceDefaults(reference),
    ),
    tensions: snapshot.tensions ?? [],
    underexploredDirections: snapshot.underexploredDirections ?? [],
    antiSignals: snapshot.antiSignals ?? [],
    activeProjects: snapshot.activeProjects ?? [],
    openQuestions: snapshot.openQuestions ?? [],
    provenance: snapshot.provenance ?? {
      sourceIds: snapshot.notableReferences?.map((reference) => reference.id) ?? [],
      sourcePaths: [],
      compiledAt: snapshot.generatedAt,
      sourceHash: null,
    },
  };
}

function withProjectBriefDefaults(brief: ProjectBrief): ProjectBrief {
  return {
    ...brief,
    audience: brief.audience ?? "",
    constraints: brief.constraints ?? [],
    selectedReferenceIds: brief.selectedReferenceIds ?? [],
    voiceGuardrails: brief.voiceGuardrails ?? CREATIVE_GUARDRAILS,
  };
}

function withTasteGraphDefaults(graph: TasteGraph): TasteGraph {
  return {
    nodes: (graph.nodes ?? []).map((node) => ({
      ...node,
      degree: node.degree ?? 0,
      title: node.title ?? node.label ?? null,
      summary: node.summary ?? "",
      path: node.path ?? "",
      group: node.group ?? "other",
    })),
    edges: (graph.edges ?? []).map((edge) => ({
      ...edge,
      weight: edge.weight ?? 0.5,
      evidence: {
        referenceIds: edge.evidence?.referenceIds ?? [],
        catalystIds: edge.evidence?.catalystIds ?? [],
        explanation: edge.evidence?.explanation ?? null,
      },
      updatedAt: edge.updatedAt ?? new Date().toISOString(),
    })),
  };
}

function writeIfMissing(filePath: string, content: string): void {
  if (!fs.existsSync(filePath)) {
    writeText(filePath, content);
  }
}

function writeText(filePath: string, content: string): void {
  fs.mkdirSync(path.dirname(filePath), { recursive: true });
  fs.writeFileSync(filePath, content, "utf-8");
}

function writeJson(filePath: string, value: unknown): void {
  writeText(filePath, JSON.stringify(value, null, 2) + "\n");
}

function readJson<T>(filePath: string): T {
  return JSON.parse(fs.readFileSync(filePath, "utf-8")) as T;
}

function toRel(root: string, fullPath: string): string {
  return path.relative(root, fullPath).split(path.sep).join("/");
}

function formatFrontmatter(data: Record<string, unknown>): string {
  return `---\n${yaml.dump(data, { lineWidth: -1 }).trimEnd()}\n---\n`;
}

function defaultClaudeTemplate(): string {
  return [
    "# Aftertaste Knowledge Base",
    "",
    "> Schema document for a taste-led creator knowledge base. Read together with `wiki/index.md`.",
    "",
    "## Scope",
    "",
    "What this wiki covers:",
    "- Personal creator references saved from Instagram, TikTok, YouTube, screenshots, and notes",
    "- Compiled taste signals: themes, motifs, creators, formats, and weekly snapshots",
    "- Idea generation surfaces that turn recent taste into scripts, hooks, and shot lists",
    "",
    "What this wiki deliberately excludes:",
    "- Team collaboration and shared review workflows",
    "- Platform-level auto-sync assumptions",
    "- Black-box embeddings without a file-backed artifact",
    "",
    "## Notes for the LLM",
    "",
    "- Treat `wiki/references/` as the source for specific references.",
    "- Treat `wiki/snapshots/current.md` as the current taste read.",
    "- Update `wiki/style-constitution.md` slowly and conservatively.",
    "- Keep `wiki/not-me.md` sharp and short.",
    "",
  ].join("\n");
}

function defaultStyleConstitutionPage(): string {
  return [
    "---",
    "title: Style Constitution",
    "type: constitution",
    "---",
    "# Style Constitution",
    "",
    "This page will stabilize as the archive grows.",
    "",
  ].join("\n");
}

function defaultNotMePage(): string {
  return [
    "---",
    "title: Not Me",
    "type: constraint",
    "---",
    "# Not Me",
    "",
    "Use this page to define what is useful to study but wrong to imitate.",
    "",
  ].join("\n");
}

function defaultIndexPage(): string {
  return [
    "# Index — Aftertaste",
    "",
    "> Taste-led creator knowledge base.",
    "",
    "## Navigation",
    "- [[snapshots/current|Current Taste Snapshot]]",
    "",
  ].join("\n");
}

function tagLinks(tags: SignalTag[], folder: string): string {
  if (tags.length === 0) return "None yet";
  return tags.map((tag) => `[[${folder}/${tag.slug}|${tag.label}]]`).join(", ");
}

function ensureTodayLog(logDir: string): void {
  const filePath = path.join(logDir, `${new Date().toISOString().slice(0, 10).replace(/-/g, "")}.md`);
  if (!fs.existsSync(filePath)) {
    writeText(filePath, `# ${new Date().toISOString().slice(0, 10)}\n\n`);
  }
}

function appendLog(root: string, entry: string): void {
  const compact = new Date().toISOString().slice(0, 10).replace(/-/g, "");
  const filePath = path.join(getAftertastePaths(root).logDir, `${compact}.md`);
  ensureTodayLog(getAftertastePaths(root).logDir);
  fs.appendFileSync(filePath, `${entry}\n`, "utf-8");
}

function timeStamp(): string {
  return new Date().toISOString().slice(11, 16);
}

function sortByCreatedDesc(a: { createdAt: string }, b: { createdAt: string }): number {
  return b.createdAt.localeCompare(a.createdAt);
}

function makeCaptureId(): string {
  const now = new Date();
  const compact = now.toISOString().replace(/[-:]/g, "").replace(/\..+/, "");
  return `${compact}-${crypto.randomBytes(2).toString("hex")}`;
}

function weeklySnapshotId(date: Date): string {
  const start = new Date(Date.UTC(date.getUTCFullYear(), 0, 1));
  const diffDays = Math.floor((date.getTime() - start.getTime()) / 86400000);
  const week = Math.ceil((diffDays + start.getUTCDay() + 1) / 7);
  return `${date.getUTCFullYear()}-W${String(week).padStart(2, "0")}`;
}

function truncate(value: string, max: number): string {
  return value.length <= max ? value : value.slice(0, max - 1).trimEnd() + "…";
}

function sentenceCase(value: string): string {
  const trimmed = value.trim();
  return trimmed ? trimmed[0]!.toUpperCase() + trimmed.slice(1) : trimmed;
}
