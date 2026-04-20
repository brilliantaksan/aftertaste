import fs from "node:fs";
import path from "node:path";
import type {
  ArtifactProviderReceipt,
  CreatorPattern,
  IdeaGenerationContext,
  IdeaPlan,
  IdeaPlanOption,
  IdeaOutputType,
  PersonalMoment,
  PromptSeed,
  QueryIndexEntry,
  ReferenceSummary,
  SourceKind,
  TasteSnapshot,
  TranscriptArtifactSource,
  WikiArticleKind,
} from "../../shared/contracts.js";

interface OpenAIProviderConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

interface OpenAITranscriptionConfig {
  apiKey: string;
  model: string;
  baseUrl: string;
}

interface AssemblyAITranscriptionConfig {
  apiKey: string;
  baseUrl: string;
  model: string | null;
}

interface OpenAITranscriptionResponse {
  text?: string;
  language?: string;
  segments?: Array<{
    start?: number;
    end?: number;
    text?: string;
  }>;
}

interface AssemblyAIUploadResponse {
  upload_url?: string;
}

interface AssemblyAITranscriptResponse {
  id?: string;
  status?: "queued" | "processing" | "completed" | "error";
  error?: string;
  text?: string;
  language_code?: string;
  utterances?: Array<{
    text?: string;
    start?: number;
    end?: number;
    speaker?: string;
  }>;
  words?: Array<{
    text?: string;
    start?: number;
    end?: number;
    speaker?: string;
  }>;
}

interface OpenAIChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

export interface CaptureSignalPrediction {
  slug: string;
  score: number;
  evidence: string[];
}

export interface CaptureSignalAnalysis {
  themes: CaptureSignalPrediction[];
  motifs: CaptureSignalPrediction[];
  formatSignals: CaptureSignalPrediction[];
  toneSignals: CaptureSignalPrediction[];
  visualSignals: CaptureSignalPrediction[];
  audioSignals: CaptureSignalPrediction[];
  pacingSignals: CaptureSignalPrediction[];
  storySignals: CaptureSignalPrediction[];
  summary: string | null;
  openQuestions: string[];
}

interface CaptureSignalVocabulary {
  themes: Array<{ slug: string; label: string }>;
  motifs: Array<{ slug: string; label: string }>;
  formatSignals: Array<{ slug: string; label: string }>;
  toneSignals: Array<{ slug: string; label: string }>;
  visualSignals: Array<{ slug: string; label: string }>;
  audioSignals: Array<{ slug: string; label: string }>;
  pacingSignals: Array<{ slug: string; label: string }>;
  storySignals: Array<{ slug: string; label: string }>;
}

interface CaptureSignalAnalysisRequest {
  sourceKind: SourceKind;
  transcriptSource: TranscriptArtifactSource;
  hasMediaAssets: boolean;
  captureText: string;
  vocabulary: CaptureSignalVocabulary;
}

export interface SnapshotIntelligence {
  summary: string;
  creatorPatterns: CreatorPattern[];
  promptSeeds: PromptSeed[];
  tensions: Array<{ label: string; summary: string; referenceIds: string[] }>;
  openQuestions: string[];
}

interface SnapshotIntelligenceRequest {
  snapshot: TasteSnapshot;
  references: ReferenceSummary[];
  antiSignals: string[];
}

interface QueryRerankRequest {
  query: string;
  candidates: QueryIndexEntry[];
}

const PLANNING_GUARDRAILS = [
  "Voice-first. Reuse the creator's actual language when it is usable.",
  "Never write the creator's personal lines. Use [YOUR LINE: ...] or [YOUR MOMENT: ...] placeholders instead.",
  "Use exploratory language only. Avoid prescriptive phrasing.",
  "Draw from the archive and its references. Do not invent a generic aesthetic.",
  "Cite references by their exact ids. When a grounded moment is the specific evidence, cite its id from momentExcerpts instead (format: the moment id as-is, e.g. 'ref-abc:media:0').",
  "Return at most 3 options.",
];

type TranscriptionProviderId = "openai" | "assemblyai";

interface AudioTranscriptionSegment {
  startMs: number;
  endMs: number;
  text: string;
  speaker?: string;
}

interface AudioTranscriptionResult {
  text: string;
  language: string | null;
  segments: AudioTranscriptionSegment[];
  provider: ArtifactProviderReceipt;
  providerLabel: string;
}

interface AudioTranscriptionProvider {
  id: TranscriptionProviderId;
  getReceipt(): ArtifactProviderReceipt | null;
  transcribe(filePath: string): Promise<AudioTranscriptionResult | null>;
}

export async function generateIdeaPlan(context: IdeaGenerationContext): Promise<IdeaPlan | null> {
  const provider = readOpenAIProviderConfig();
  if (!provider) return null;

  try {
    const prompt = buildIdeaPlannerPrompt(context);
    const content = await requestOpenAICompletion(provider, [
      {
        role: "system",
        content: [
          "You are Aftertaste's idea planner.",
          "Return JSON only.",
          ...PLANNING_GUARDRAILS,
        ].join("\n"),
      },
      {
        role: "user",
        content: prompt,
      },
    ]);
    if (!content) return null;

    return validateIdeaPlan(parseJsonObject(content), context.outputType);
  } catch {
    return null;
  }
}

export async function generateConceptArticle(input: {
  kind: WikiArticleKind;
  title: string;
  existingPath: string;
  evidence: Record<string, unknown>;
}): Promise<string | null> {
  const provider = readOpenAIProviderConfig();
  if (!provider) return null;

  try {
    const content = await requestOpenAICompletion(provider, [
      {
        role: "system",
        content: [
          "You are Aftertaste's wiki writer.",
          "Write grounded markdown only. No frontmatter. No code fences.",
          "Do not invent facts outside the provided evidence bundle.",
          "Keep the voice writerly but restrained.",
          "Cite supporting references inline using their exact ids in parentheses, for example: (ref-123, ref-456).",
          "Preserve the section headings exactly when they are requested.",
          ...PLANNING_GUARDRAILS,
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `Rewrite the ${input.kind} article "${input.title}" at ${input.existingPath}.`,
          "Return markdown only with these sections in order:",
          "## Why This Matters",
          "## Recurring Signals",
          "## Tensions And Boundaries",
          "## Canonical References",
          "## Related Concepts",
          "## Open Questions",
          "",
          "Evidence bundle:",
          JSON.stringify(input.evidence, null, 2),
        ].join("\n"),
      },
    ]);
    return normalizeConceptArticle(content);
  } catch {
    return null;
  }
}

export async function analyzeCaptureSignals(
  input: CaptureSignalAnalysisRequest,
): Promise<CaptureSignalAnalysis | null> {
  const provider = readOpenAIProviderConfig();
  if (!provider) return null;

  try {
    const content = await requestOpenAICompletion(provider, [
      {
        role: "system",
        content: [
          "You classify Aftertaste captures into the provided taxonomy.",
          "Return JSON only.",
          "Only emit tags that are directly supported by the supplied capture text.",
          "Evidence strings must be exact short quotes copied verbatim from the supplied capture text.",
          "Do not paraphrase evidence.",
          "If a category is unsupported, return an empty array for that category.",
          "For text-only captures with no media assets, do not infer b-roll, pacing, audio design, or visual style unless the text explicitly describes them.",
          "Never invent creatorly or cinematic tags from vibe alone.",
          "Write a grounded summary in 1-2 sentences about what this capture is actually doing. Do not mention camera language unless it is explicit in the text.",
          "Open questions should only point to real ambiguity still visible in the source.",
          "Use at most 3 tags per category.",
        ].join("\n"),
      },
      {
        role: "user",
        content: buildCaptureSignalAnalysisPrompt(input),
      },
    ]);
    if (!content) return null;
    return validateCaptureSignalAnalysis(parseJsonObject(content));
  } catch {
    return null;
  }
}

export async function synthesizeSnapshotIntelligence(
  input: SnapshotIntelligenceRequest,
): Promise<SnapshotIntelligence | null> {
  const provider = readOpenAIProviderConfig();
  if (!provider) return null;

  try {
    const content = await requestOpenAICompletion(provider, [
      {
        role: "system",
        content: [
          "You synthesize Aftertaste's home-page taste snapshot.",
          "Return JSON only.",
          "Everything must stay grounded in the supplied references and existing archive signals.",
          "Do not invent motifs, creators, or tensions that are not supported by the evidence bundle.",
          "Use exact reference ids supplied in the input.",
          "Prefer specificity over poetic filler.",
          "Summary should be 2-4 sentences max.",
          "Return at most 3 creatorPatterns, 3 promptSeeds, 3 tensions, and 5 openQuestions.",
        ].join("\n"),
      },
      {
        role: "user",
        content: buildSnapshotIntelligencePrompt(input),
      },
    ]);
    if (!content) return null;
    return validateSnapshotIntelligence(parseJsonObject(content), new Set(input.references.map((reference) => reference.id)));
  } catch {
    return null;
  }
}

export async function rerankQueryEntries(
  input: QueryRerankRequest,
): Promise<string[] | null> {
  const provider = readOpenAIProviderConfig();
  if (!provider) return null;
  if (input.query.trim().length < 3 || input.candidates.length < 2) return null;

  try {
    const content = await requestOpenAICompletion(provider, [
      {
        role: "system",
        content: [
          "You rerank query results for Aftertaste.",
          "Return JSON only.",
          "Return an array of candidate ids ordered from most relevant to least relevant.",
          "Only use ids from the supplied candidate set.",
          "Prefer entries that directly answer the query over broad archive summaries.",
        ].join("\n"),
      },
      {
        role: "user",
        content: [
          `Query: ${input.query}`,
          "",
          "Candidates:",
          JSON.stringify(
            input.candidates.map((candidate) => ({
              id: candidate.id,
              kind: candidate.kind,
              title: candidate.title,
              summary: candidate.summary,
              tags: candidate.tags,
              sourceIds: candidate.sourceIds,
            })),
            null,
            2,
          ),
          "",
          "Return exactly this shape:",
          JSON.stringify({ rankedIds: input.candidates.map((candidate) => candidate.id) }),
        ].join("\n"),
      },
    ]);
    if (!content) return null;
    return validateRerankedIds(parseJsonObject(content), input.candidates.map((candidate) => candidate.id));
  } catch {
    return null;
  }
}

export function buildIdeaPlannerPrompt(context: IdeaGenerationContext): string {
  return [
    "Create an IdeaPlan JSON object with this exact shape:",
    `{"outputType":"${context.outputType}","options":[{"title":"...","angle":"...","structure":["..."],"citations":["reference-id"],"rationale":"...","personalMoments":[{"placeholder":"[YOUR LINE: ...]","prompt":"..."}]}]}`,
    "",
    "Rules:",
    ...PLANNING_GUARDRAILS.map((rule) => `- ${rule}`),
    "",
    "Available context:",
    JSON.stringify(
      {
        budget: context.budget,
        outputType: context.outputType,
        briefText: context.briefText,
        brief: context.brief,
        snapshot: {
          summary: context.snapshot.summary,
          themes: context.snapshot.themes.map((theme) => theme.label),
          motifs: context.snapshot.motifs.map((motif) => motif.label),
          tensions: context.snapshot.tensions,
          underexploredDirections: context.snapshot.underexploredDirections,
          antiSignals: context.snapshot.antiSignals,
          openQuestions: context.snapshot.openQuestions,
        },
        selectedReferences: context.selectedReferences.map((reference) => ({
          id: reference.id,
          title: reference.title,
          summary: reference.summary,
          sourceKind: reference.sourceKind,
          note: reference.note,
          savedReason: reference.savedReason,
          collection: reference.collection,
          projectIds: reference.projectIds,
          themes: reference.themes.map((theme) => theme.label),
          motifs: reference.motifs.map((motif) => motif.label),
          toneSignals: reference.toneSignals.map((signal) => signal.label),
          visualSignals: reference.visualSignals.map((signal) => signal.label),
          audioSignals: reference.audioSignals.map((signal) => signal.label),
          pacingSignals: reference.pacingSignals.map((signal) => signal.label),
          storySignals: reference.storySignals.map((signal) => signal.label),
          moments: reference.moments,
          openQuestions: reference.openQuestions,
          contradictions: reference.contradictions,
          transcriptExcerpt: context.transcriptExcerpts[reference.id] ?? null,
          momentExcerpts: context.momentExcerpts[reference.id] ?? null,
        })),
        relatedReferences: context.relatedReferences.map((reference) => ({
          id: reference.id,
          title: reference.title,
          summary: reference.summary,
          sourceKind: reference.sourceKind,
          moments: reference.moments,
          toneSignals: reference.toneSignals.map((signal) => signal.label),
          visualSignals: reference.visualSignals.map((signal) => signal.label),
        })),
        catalysts: context.catalysts.map((catalyst) => ({
          id: catalyst.id,
          label: catalyst.label,
          summary: catalyst.summary,
          referenceIds: catalyst.referenceIds,
        })),
        constitutionExcerpt: context.constitutionExcerpt,
        notMeExcerpt: context.notMeExcerpt,
        recentSessions: context.recentSessions,
      },
      null,
      2,
    ),
  ].join("\n");
}

function buildCaptureSignalAnalysisPrompt(input: CaptureSignalAnalysisRequest): string {
  return [
    "Classify this capture using the exact allowed slugs.",
    "",
    "Return a JSON object with this exact shape:",
    JSON.stringify(
      {
        themes: [{ slug: "slug-name", score: 0.0, evidence: ["exact quote"] }],
        motifs: [{ slug: "slug-name", score: 0.0, evidence: ["exact quote"] }],
        formatSignals: [{ slug: "slug-name", score: 0.0, evidence: ["exact quote"] }],
        toneSignals: [{ slug: "slug-name", score: 0.0, evidence: ["exact quote"] }],
        visualSignals: [{ slug: "slug-name", score: 0.0, evidence: ["exact quote"] }],
        audioSignals: [{ slug: "slug-name", score: 0.0, evidence: ["exact quote"] }],
        pacingSignals: [{ slug: "slug-name", score: 0.0, evidence: ["exact quote"] }],
        storySignals: [{ slug: "slug-name", score: 0.0, evidence: ["exact quote"] }],
        summary: "1-2 sentence grounded summary",
        openQuestions: ["question that stays close to the source"],
      },
      null,
      2,
    ),
    "",
    "Context:",
    JSON.stringify(
      {
        sourceKind: input.sourceKind,
        transcriptSource: input.transcriptSource,
        hasMediaAssets: input.hasMediaAssets,
      },
      null,
      2,
    ),
    "",
    "Allowed vocabulary:",
    JSON.stringify(input.vocabulary, null, 2),
    "",
    "Capture text:",
    input.captureText.slice(0, 12000),
  ].join("\n");
}

function buildSnapshotIntelligencePrompt(input: SnapshotIntelligenceRequest): string {
  return [
    "Synthesize the current home-page taste snapshot.",
    "",
    "Return a JSON object with this exact shape:",
    JSON.stringify(
      {
        summary: "2-4 sentence snapshot read",
        creatorPatterns: [{ label: "Short label", summary: "Grounded summary", sourceReferenceIds: ["ref-id"] }],
        promptSeeds: [{ title: "Prompt title", prompt: "Grounded prompt seed", referenceIds: ["ref-id"] }],
        tensions: [{ label: "Short label", summary: "Grounded tension summary", referenceIds: ["ref-id"] }],
        openQuestions: ["question"],
      },
      null,
      2,
    ),
    "",
    "Current snapshot seed:",
    JSON.stringify(
      {
        themes: input.snapshot.themes.map((signal) => ({ label: signal.label, evidence: signal.evidence })),
        motifs: input.snapshot.motifs.map((signal) => ({ label: signal.label, evidence: signal.evidence })),
        antiSignals: input.antiSignals,
        window: input.snapshot.window,
      },
      null,
      2,
    ),
    "",
    "Reference evidence:",
    JSON.stringify(
      input.references.slice(0, 10).map((reference) => ({
        id: reference.id,
        title: reference.title,
        summary: reference.summary,
        note: reference.note,
        savedReason: reference.savedReason,
        collection: reference.collection,
        themes: reference.themes.map((signal) => signal.label),
        motifs: reference.motifs.map((signal) => signal.label),
        creators: reference.creatorSignals.map((signal) => signal.label),
        formats: reference.formatSignals.map((signal) => signal.label),
        tone: reference.toneSignals.map((signal) => signal.label),
        story: reference.storySignals.map((signal) => signal.label),
        questions: reference.openQuestions,
        contradictions: reference.contradictions,
      })),
      null,
      2,
    ),
  ].join("\n");
}

export function validateIdeaPlan(value: unknown, outputType: IdeaOutputType): IdeaPlan | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (record.outputType !== outputType) return null;
  if (!Array.isArray(record.options)) return null;

  const options = record.options
    .map((option) => validateIdeaPlanOption(option))
    .filter((option): option is IdeaPlanOption => option !== null)
    .slice(0, 3);

  if (options.length === 0) return null;
  return {
    outputType,
    options,
  };
}

function validateCaptureSignalAnalysis(value: unknown): CaptureSignalAnalysis | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const parsed: CaptureSignalAnalysis = {
    themes: validateCaptureSignalPredictions(record.themes),
    motifs: validateCaptureSignalPredictions(record.motifs),
    formatSignals: validateCaptureSignalPredictions(record.formatSignals),
    toneSignals: validateCaptureSignalPredictions(record.toneSignals),
    visualSignals: validateCaptureSignalPredictions(record.visualSignals),
    audioSignals: validateCaptureSignalPredictions(record.audioSignals),
    pacingSignals: validateCaptureSignalPredictions(record.pacingSignals),
    storySignals: validateCaptureSignalPredictions(record.storySignals),
    summary: typeof record.summary === "string" && record.summary.trim() ? record.summary.trim() : null,
    openQuestions: Array.isArray(record.openQuestions)
      ? record.openQuestions.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 5)
      : [],
  };
  const hasAnyContent =
    parsed.themes.length > 0 ||
    parsed.motifs.length > 0 ||
    parsed.formatSignals.length > 0 ||
    parsed.toneSignals.length > 0 ||
    parsed.visualSignals.length > 0 ||
    parsed.audioSignals.length > 0 ||
    parsed.pacingSignals.length > 0 ||
    parsed.storySignals.length > 0 ||
    Boolean(parsed.summary) ||
    parsed.openQuestions.length > 0;
  return hasAnyContent ? parsed : null;
}

function validateCaptureSignalPredictions(value: unknown): CaptureSignalPrediction[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((entry) => {
      if (!entry || typeof entry !== "object") return null;
      const record = entry as Record<string, unknown>;
      if (typeof record.slug !== "string" || !record.slug.trim()) return null;
      const evidence = Array.isArray(record.evidence)
        ? record.evidence.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 3)
        : [];
      if (evidence.length === 0) return null;
      const rawScore = typeof record.score === "number" ? record.score : 0.75;
      return {
        slug: record.slug.trim(),
        score: Math.min(1, Math.max(0, rawScore)),
        evidence,
      };
    })
    .filter((entry): entry is CaptureSignalPrediction => entry !== null)
    .slice(0, 3);
}

function validateSnapshotIntelligence(
  value: unknown,
  referenceIds: Set<string>,
): SnapshotIntelligence | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  const summary = typeof record.summary === "string" ? record.summary.trim() : "";
  const creatorPatterns = validateCreatorPatterns(record.creatorPatterns, referenceIds);
  const promptSeeds = validatePromptSeeds(record.promptSeeds, referenceIds);
  const tensions = validateSnapshotTensions(record.tensions, referenceIds);
  const openQuestions = Array.isArray(record.openQuestions)
    ? record.openQuestions.filter((item): item is string => typeof item === "string" && item.trim().length > 0).slice(0, 5)
    : [];
  if (!summary) return null;
  return {
    summary,
    creatorPatterns,
    promptSeeds,
    tensions,
    openQuestions,
  };
}

function validateCreatorPatterns(
  value: unknown,
  referenceIds: Set<string>,
): CreatorPattern[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const label = typeof record.label === "string" ? record.label.trim() : "";
      const summary = typeof record.summary === "string" ? record.summary.trim() : "";
      const sourceReferenceIds = Array.isArray(record.sourceReferenceIds)
        ? record.sourceReferenceIds.filter((id): id is string => typeof id === "string" && referenceIds.has(id)).slice(0, 4)
        : [];
      if (!label || !summary || sourceReferenceIds.length === 0) return null;
      return { label, summary, sourceReferenceIds };
    })
    .filter((item): item is CreatorPattern => item !== null)
    .slice(0, 3);
}

function validatePromptSeeds(
  value: unknown,
  referenceIds: Set<string>,
): PromptSeed[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const title = typeof record.title === "string" ? record.title.trim() : "";
      const prompt = typeof record.prompt === "string" ? record.prompt.trim() : "";
      const ids = Array.isArray(record.referenceIds)
        ? record.referenceIds.filter((id): id is string => typeof id === "string" && referenceIds.has(id)).slice(0, 4)
        : [];
      if (!title || !prompt || ids.length === 0) return null;
      return { title, prompt, referenceIds: ids };
    })
    .filter((item): item is PromptSeed => item !== null)
    .slice(0, 3);
}

function validateSnapshotTensions(
  value: unknown,
  referenceIds: Set<string>,
): Array<{ label: string; summary: string; referenceIds: string[] }> {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const record = item as Record<string, unknown>;
      const label = typeof record.label === "string" ? record.label.trim() : "";
      const summary = typeof record.summary === "string" ? record.summary.trim() : "";
      const ids = Array.isArray(record.referenceIds)
        ? record.referenceIds.filter((id): id is string => typeof id === "string" && referenceIds.has(id)).slice(0, 6)
        : [];
      if (!label || !summary || ids.length === 0) return null;
      return { label, summary, referenceIds: ids };
    })
    .filter((item): item is { label: string; summary: string; referenceIds: string[] } => item !== null)
    .slice(0, 3);
}

function validateRerankedIds(value: unknown, candidateIds: string[]): string[] | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (!Array.isArray(record.rankedIds)) return null;
  const allowed = new Set(candidateIds);
  const ranked = record.rankedIds.filter((id): id is string => typeof id === "string" && allowed.has(id));
  return ranked.length > 0 ? Array.from(new Set(ranked)) : null;
}

function validateIdeaPlanOption(value: unknown): IdeaPlanOption | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.title !== "string" || !record.title.trim()) return null;
  if (typeof record.angle !== "string" || !record.angle.trim()) return null;
  if (!Array.isArray(record.structure) || record.structure.some((line) => typeof line !== "string")) return null;
  if (typeof record.rationale !== "string" || !record.rationale.trim()) return null;

  const citations = Array.isArray(record.citations) ? record.citations.filter((citation): citation is string => typeof citation === "string") : [];
  const personalMoments = Array.isArray(record.personalMoments)
    ? record.personalMoments.map((moment) => validatePersonalMoment(moment)).filter((moment): moment is PersonalMoment => moment !== null)
    : [];

  return {
    title: record.title.trim(),
    angle: record.angle.trim(),
    structure: record.structure.map((line) => String(line)),
    citations,
    rationale: record.rationale.trim(),
    personalMoments,
  };
}

function validatePersonalMoment(value: unknown): PersonalMoment | null {
  if (!value || typeof value !== "object") return null;
  const record = value as Record<string, unknown>;
  if (typeof record.placeholder !== "string" || typeof record.prompt !== "string") return null;
  if (!record.prompt.trim()) return null;
  return {
    placeholder: record.placeholder.trim(),
    prompt: record.prompt.trim(),
  };
}

function readOpenAIProviderConfig(): OpenAIProviderConfig | null {
  const apiKey = process.env.AFTERTASTE_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
  const model = process.env.AFTERTASTE_OPENAI_MODEL ?? process.env.OPENAI_MODEL ?? "";
  const baseUrl = process.env.AFTERTASTE_OPENAI_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  if (!apiKey || !model) return null;
  return {
    apiKey,
    model,
    baseUrl: baseUrl.replace(/\/+$/, ""),
  };
}

function readOpenAITranscriptionConfig(): OpenAITranscriptionConfig | null {
  const apiKey = process.env.AFTERTASTE_OPENAI_API_KEY ?? process.env.OPENAI_API_KEY ?? "";
  const model = process.env.AFTERTASTE_OPENAI_TRANSCRIPTION_MODEL ?? "whisper-1";
  const baseUrl = process.env.AFTERTASTE_OPENAI_BASE_URL ?? process.env.OPENAI_BASE_URL ?? "https://api.openai.com/v1";
  if (!apiKey) return null;
  return {
    apiKey,
    model,
    baseUrl: baseUrl.replace(/\/+$/, ""),
  };
}

function readAssemblyAITranscriptionConfig(): AssemblyAITranscriptionConfig | null {
  const apiKey = process.env.AFTERTASTE_ASSEMBLYAI_API_KEY ?? "";
  const baseUrl = process.env.AFTERTASTE_ASSEMBLYAI_BASE_URL ?? "https://api.assemblyai.com/v2";
  const model = process.env.AFTERTASTE_ASSEMBLYAI_TRANSCRIPTION_MODEL?.trim() || null;
  if (!apiKey) return null;
  return {
    apiKey,
    baseUrl: baseUrl.replace(/\/+$/, ""),
    model,
  };
}

const openAITranscriptionProvider: AudioTranscriptionProvider = {
  id: "openai",
  getReceipt() {
    const config = readOpenAITranscriptionConfig();
    if (!config) return null;
    return {
      id: "openai",
      model: config.model,
      receiptId: null,
    };
  },
  async transcribe(filePath) {
    const config = readOpenAITranscriptionConfig();
    if (!config) return null;

    const fileBuffer = fs.readFileSync(filePath);
    const fileName = path.basename(filePath);
    const form = new FormData();
    form.append("file", new Blob([fileBuffer]), fileName);
    form.append("model", config.model);
    form.append("response_format", "verbose_json");

    const response = await fetch(`${config.baseUrl}/audio/transcriptions`, {
      method: "POST",
      headers: {
        authorization: `Bearer ${config.apiKey}`,
      },
      body: form,
    });

    if (!response.ok) {
      throw new Error(`OpenAI transcription request failed with status ${response.status}`);
    }

    const payload = (await response.json()) as OpenAITranscriptionResponse;
    if (!payload.text) {
      throw new Error("OpenAI transcription response contained no text");
    }

    return {
      text: payload.text,
      language: payload.language ?? null,
      segments: (payload.segments ?? []).map((segment) => ({
        startMs: Math.round((segment.start ?? 0) * 1000),
        endMs: Math.round((segment.end ?? 0) * 1000),
        text: segment.text ?? "",
      })),
      provider: {
        id: "openai",
        model: config.model,
        receiptId: null,
      },
      providerLabel: `OpenAI ${config.model}`,
    };
  },
};

const assemblyAITranscriptionProvider: AudioTranscriptionProvider = {
  id: "assemblyai",
  getReceipt() {
    const config = readAssemblyAITranscriptionConfig();
    if (!config) return null;
    return {
      id: "assemblyai",
      model: config.model,
      receiptId: null,
    };
  },
  async transcribe(filePath) {
    const config = readAssemblyAITranscriptionConfig();
    if (!config) return null;

    const fileBuffer = fs.readFileSync(filePath);
    const uploadResponse = await fetch(`${config.baseUrl}/upload`, {
      method: "POST",
      headers: {
        authorization: config.apiKey,
        "content-type": "application/octet-stream",
      },
      body: fileBuffer,
    });
    if (!uploadResponse.ok) {
      throw new Error(`AssemblyAI upload failed with status ${uploadResponse.status}`);
    }
    const uploadPayload = (await uploadResponse.json()) as AssemblyAIUploadResponse;
    if (!uploadPayload.upload_url) {
      throw new Error("AssemblyAI upload response contained no upload_url");
    }

    const transcriptRequest: Record<string, unknown> = {
      audio_url: uploadPayload.upload_url,
      speaker_labels: true,
      punctuate: true,
      format_text: true,
    };
    if (config.model) {
      transcriptRequest.speech_model = config.model;
    }
    const createResponse = await fetch(`${config.baseUrl}/transcript`, {
      method: "POST",
      headers: {
        authorization: config.apiKey,
        "content-type": "application/json",
      },
      body: JSON.stringify(transcriptRequest),
    });
    if (!createResponse.ok) {
      throw new Error(`AssemblyAI transcript create failed with status ${createResponse.status}`);
    }
    const createPayload = (await createResponse.json()) as AssemblyAITranscriptResponse;
    if (!createPayload.id) {
      throw new Error("AssemblyAI transcript create response contained no id");
    }

    let transcriptPayload: AssemblyAITranscriptResponse | null = null;
    for (let attempt = 0; attempt < 20; attempt += 1) {
      const pollResponse = await fetch(`${config.baseUrl}/transcript/${createPayload.id}`, {
        headers: {
          authorization: config.apiKey,
        },
      });
      if (!pollResponse.ok) {
        throw new Error(`AssemblyAI transcript poll failed with status ${pollResponse.status}`);
      }
      const pollPayload = (await pollResponse.json()) as AssemblyAITranscriptResponse;
      if (pollPayload.status === "completed") {
        transcriptPayload = pollPayload;
        break;
      }
      if (pollPayload.status === "error") {
        throw new Error(pollPayload.error || "AssemblyAI transcript failed");
      }
      await delay(250);
    }

    if (!transcriptPayload?.text) {
      throw new Error("AssemblyAI transcript did not complete with text");
    }

    const utterances = (transcriptPayload.utterances ?? transcriptPayload.words ?? [])
      .filter((item) => Boolean(item.text))
      .map((item) => ({
        startMs: Math.round(item.start ?? 0),
        endMs: Math.round(item.end ?? item.start ?? 0),
        text: item.text ?? "",
        speaker: item.speaker ?? undefined,
      }));

    return {
      text: transcriptPayload.text,
      language: transcriptPayload.language_code ?? null,
      segments: utterances,
      provider: {
        id: "assemblyai",
        model: config.model,
        receiptId: createPayload.id,
      },
      providerLabel: `AssemblyAI${config.model ? ` ${config.model}` : ""}`,
    };
  },
};

const AUDIO_TRANSCRIPTION_PROVIDERS: Record<TranscriptionProviderId, AudioTranscriptionProvider> = {
  openai: openAITranscriptionProvider,
  assemblyai: assemblyAITranscriptionProvider,
};

function resolveAudioTranscriptionProvider(): AudioTranscriptionProvider | null {
  const preferred = process.env.AFTERTASTE_TRANSCRIPTION_PROVIDER?.trim().toLowerCase() as TranscriptionProviderId | undefined;
  if (preferred) {
    return AUDIO_TRANSCRIPTION_PROVIDERS[preferred] ?? null;
  }
  return openAITranscriptionProvider.getReceipt()
    ? openAITranscriptionProvider
    : assemblyAITranscriptionProvider.getReceipt()
      ? assemblyAITranscriptionProvider
      : null;
}

export function getConfiguredTranscriptionProviderReceipt(): ArtifactProviderReceipt | null {
  return resolveAudioTranscriptionProvider()?.getReceipt() ?? null;
}

export async function transcribeAudioFile(filePath: string): Promise<AudioTranscriptionResult | null> {
  const provider = resolveAudioTranscriptionProvider();
  if (!provider) return null;
  return provider.transcribe(filePath);
}

async function requestOpenAICompletion(
  provider: OpenAIProviderConfig,
  messages: Array<{ role: "system" | "user"; content: string }>,
): Promise<string> {
  const response = await fetch(`${provider.baseUrl}/chat/completions`, {
    method: "POST",
    headers: {
      "content-type": "application/json",
      authorization: `Bearer ${provider.apiKey}`,
    },
    body: JSON.stringify({
      model: provider.model,
      temperature: 0.5,
      messages,
    }),
  });

  if (!response.ok) {
    return "";
  }

  const payload = (await response.json()) as OpenAIChatCompletionResponse;
  return readCompletionContent(payload);
}

function readCompletionContent(payload: OpenAIChatCompletionResponse): string {
  const content = payload.choices?.[0]?.message?.content;
  if (typeof content === "string") return content;
  if (Array.isArray(content)) {
    return content.map((item) => item.text ?? "").join("\n");
  }
  return "";
}

function parseJsonObject(value: string): unknown {
  try {
    return JSON.parse(value);
  } catch {
    const start = value.indexOf("{");
    const end = value.lastIndexOf("}");
    if (start >= 0 && end > start) {
      return JSON.parse(value.slice(start, end + 1));
    }
    throw new Error("no json object found");
  }
}

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

function normalizeConceptArticle(value: string): string | null {
  const cleaned = value.trim().replace(/^```(?:markdown)?/i, "").replace(/```$/, "").trim();
  if (!cleaned) return null;
  if (!cleaned.includes("## Why This Matters")) return null;
  if (!cleaned.includes("## Canonical References")) return null;
  return cleaned;
}
