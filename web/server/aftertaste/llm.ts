import fs from "node:fs";
import path from "node:path";
import type {
  IdeaGenerationContext,
  IdeaPlan,
  IdeaPlanOption,
  IdeaOutputType,
  PersonalMoment,
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

interface OpenAITranscriptionResponse {
  text?: string;
  language?: string;
  segments?: Array<{
    start?: number;
    end?: number;
    text?: string;
  }>;
}

interface OpenAIChatCompletionResponse {
  choices?: Array<{
    message?: {
      content?: string | Array<{ type?: string; text?: string }>;
    };
  }>;
}

const PLANNING_GUARDRAILS = [
  "Voice-first. Reuse the creator's actual language when it is usable.",
  "Never write the creator's personal lines. Use [YOUR LINE: ...] or [YOUR MOMENT: ...] placeholders instead.",
  "Use exploratory language only. Avoid prescriptive phrasing.",
  "Draw from the archive and its references. Do not invent a generic aesthetic.",
  "Cite references by their exact ids.",
  "Return at most 3 options.",
];

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

export async function transcribeAudioFile(filePath: string): Promise<{
  text: string;
  language: string | null;
  segments: Array<{ startMs: number; endMs: number; text: string }>;
} | null> {
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
  };
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

function normalizeConceptArticle(value: string): string | null {
  const cleaned = value.trim().replace(/^```(?:markdown)?/i, "").replace(/```$/, "").trim();
  if (!cleaned) return null;
  if (!cleaned.includes("## Why This Matters")) return null;
  if (!cleaned.includes("## Canonical References")) return null;
  return cleaned;
}
