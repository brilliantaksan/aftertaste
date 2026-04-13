import type {
  CaptureRecord,
  MediaAnalysisArtifact,
  MediaAnalysisMoment,
  SignalTag,
  TranscriptArtifact,
} from "../../shared/contracts.js";

interface MediaSignalRule {
  slug: string;
  label: string;
  keywords: string[];
}

export interface MediaAnalysisAdapterContext {
  capture: CaptureRecord;
  transcriptArtifact: TranscriptArtifact;
}

export interface MediaAnalysisAdapter {
  id: MediaAnalysisArtifact["source"];
  analyze(context: MediaAnalysisAdapterContext): Promise<MediaAnalysisArtifact | null> | MediaAnalysisArtifact | null;
}

const VISUAL_RULES: MediaSignalRule[] = [
  { slug: "close-detail", label: "Close Detail", keywords: ["close-up", "close up", "detail", "hands", "face", "eyes"] },
  { slug: "available-light", label: "Available Light", keywords: ["window light", "natural light", "soft light", "lamp", "sunrise"] },
  { slug: "negative-space", label: "Negative Space", keywords: ["negative space", "empty room", "wide frame", "still frame"] },
  { slug: "handheld-texture", label: "Handheld Texture", keywords: ["handheld", "phone footage", "camcorder", "raw camera"] },
  { slug: "movement-trace", label: "Movement Trace", keywords: ["walk", "train", "transit", "movement", "blur"] },
  { slug: "palette-warm", label: "Warm Palette", keywords: ["warm", "beige", "cream", "muted", "soft color", "palette"] },
];

const AUDIO_RULES: MediaSignalRule[] = [
  { slug: "spoken-voice", label: "Spoken Voice", keywords: ["voiceover", "narration", "voice note", "spoken", "monologue"] },
  { slug: "ambient-room-tone", label: "Ambient Room Tone", keywords: ["ambient", "room tone", "silence", "rain", "street hum"] },
  { slug: "music-led", label: "Music-Led", keywords: ["song", "score", "soundtrack", "music"] },
  { slug: "breath-pauses", label: "Breath And Pauses", keywords: ["breath", "pause", "whisper", "quiet"] },
];

const STORY_RULES: MediaSignalRule[] = [
  { slug: "confession", label: "Confession", keywords: ["admit", "say out loud", "confession", "honest"] },
  { slug: "observation", label: "Observation", keywords: ["noticing", "watching", "small detail", "observing"] },
  { slug: "transformation", label: "Transformation", keywords: ["becoming", "change", "shift", "before and after"] },
  { slug: "memory-return", label: "Memory Return", keywords: ["remember", "returning", "again", "keeps coming back"] },
  { slug: "instruction", label: "Instruction", keywords: ["how to", "breakdown", "explain", "step by step"] },
  { slug: "relationship-tension", label: "Relationship Tension", keywords: ["friend", "love", "apart", "distance", "together"] },
];

const heuristicAdapter: MediaAnalysisAdapter = {
  id: "heuristic",
  analyze(context) {
    return buildHeuristicMediaAnalysisArtifact(context);
  },
};

const MEDIA_ANALYSIS_ADAPTERS: MediaAnalysisAdapter[] = [heuristicAdapter];

export async function resolveMediaAnalysisArtifact(
  context: MediaAnalysisAdapterContext,
): Promise<MediaAnalysisArtifact> {
  for (const adapter of MEDIA_ANALYSIS_ADAPTERS) {
    const artifact = await adapter.analyze(context);
    if (artifact) return artifact;
  }

  return buildUnavailableMediaAnalysisArtifact(context.capture, [
    "No media-analysis adapter was able to process this capture.",
  ]);
}

function buildHeuristicMediaAnalysisArtifact(
  context: MediaAnalysisAdapterContext,
): MediaAnalysisArtifact {
  const { capture, transcriptArtifact } = context;
  const mediaAssets = capture.assets.filter((asset) => asset.kind === "image" || asset.kind === "video" || asset.kind === "audio");
  if (mediaAssets.length === 0) {
    return buildUnavailableMediaAnalysisArtifact(capture, [
      "No uploaded image, video, or audio assets are available for media analysis.",
    ]);
  }

  const haystack = [
    capture.note,
    capture.savedReason,
    capture.metadata.title,
    capture.metadata.description,
    transcriptArtifact.text,
    mediaAssets.map((asset) => `${asset.originalName} ${asset.kind}`).join(" "),
  ]
    .filter(Boolean)
    .join(" \n ")
    .toLowerCase();

  const visualSignals = rankSignals(haystack, VISUAL_RULES, collectVisualSeeds(capture));
  const audioSignals = rankSignals(haystack, AUDIO_RULES, collectAudioSeeds(capture));
  const storySignals = rankSignals(haystack, STORY_RULES, collectStorySeeds(capture));
  const moments = buildMediaMoments(capture);
  const notes = buildAdapterNotes(capture, transcriptArtifact);

  return {
    captureId: capture.id,
    status: "ok",
    source: "heuristic",
    summary: summarizeArtifact(capture, visualSignals, audioSignals, storySignals),
    visualSignals,
    audioSignals,
    storySignals,
    moments,
    generatedAt: new Date().toISOString(),
    acquisition: capture.acquisition
      ? {
          mode: capture.acquisition.mode,
          provider: capture.acquisition.provider,
        }
      : undefined,
    notes,
  };
}

function buildUnavailableMediaAnalysisArtifact(
  capture: CaptureRecord,
  notes: string[],
): MediaAnalysisArtifact {
  return {
    captureId: capture.id,
    status: "unavailable",
    source: "heuristic",
    summary: "No media assets are available, so media understanding is unavailable for this capture.",
    visualSignals: [],
    audioSignals: [],
    storySignals: [],
    moments: [],
    generatedAt: new Date().toISOString(),
    acquisition: capture.acquisition
      ? {
          mode: capture.acquisition.mode,
          provider: capture.acquisition.provider,
        }
      : undefined,
    notes: uniqueStrings(notes),
  };
}

function summarizeArtifact(
  capture: CaptureRecord,
  visualSignals: SignalTag[],
  audioSignals: SignalTag[],
  storySignals: SignalTag[],
): string {
  const visualLead = visualSignals[0]?.label.toLowerCase() ?? "visual texture";
  const audioLead = audioSignals[0]?.label.toLowerCase() ?? "audio texture";
  const storyLead = storySignals[0]?.label.toLowerCase() ?? "story movement";
  const hasVideo = capture.assets.some((asset) => asset.kind === "video");
  const lead = hasVideo
    ? "Shallow video handling only."
    : capture.assets.some((asset) => asset.kind === "audio")
      ? "Shallow audio handling only."
      : "Shallow image handling only.";
  return `${lead} The current adapter infers ${visualLead}, ${audioLead}, and ${storyLead} from transcript/context text plus asset type, not from frame-level or speaker-level understanding.`;
}

function buildAdapterNotes(
  capture: CaptureRecord,
  transcriptArtifact: TranscriptArtifact,
): string[] {
  const notes = [
    "v1 uses a heuristic adapter seam so richer providers can write the same media-analysis.json shape later.",
    "Current media analysis only infers from transcript text, saved notes, metadata, asset kind, and filenames.",
  ];

  if (capture.assets.some((asset) => asset.kind === "video")) {
    notes.push(
      "Uploaded video is handled shallowly in v1. No frame-level scene understanding, timestamps, speaker turns, or provider-backed multimodal analysis are available yet.",
    );
  }
  if (capture.assets.some((asset) => asset.kind === "audio") || capture.sourceKind === "voice-note") {
    notes.push(
      "Audio cues are inferred from transcript text and asset presence only. No diarization, speaker-turn extraction, or acoustic event detection is available yet.",
    );
  }
  if (transcriptArtifact.source === "capture-stitch") {
    notes.push(
      "This media analysis is grounded in stitched fallback transcript text, so its evidence is weaker than a source-derived transcript artifact.",
    );
  }

  return uniqueStrings(notes);
}

function buildMediaMoments(capture: CaptureRecord): MediaAnalysisMoment[] {
  return capture.assets.slice(0, 3).map((asset) => {
    if (asset.kind === "video") {
      return {
        label: "Video context",
        summary: `${asset.originalName} contributes pacing and movement clues only through surrounding context and file presence. No frame-level timestamps are available yet.`,
      };
    }
    if (asset.kind === "audio") {
      return {
        label: "Audio context",
        summary: `${asset.originalName} contributes cadence clues only through transcript/context text. No speaker-turn timing is available yet.`,
      };
    }
    return {
      label: "Image context",
      summary: `${asset.originalName} contributes framing and palette clues through surrounding context, not content-level vision analysis.`,
    };
  });
}

function collectVisualSeeds(capture: CaptureRecord): SignalTag[] {
  const seeded: SignalTag[] = [];
  if (capture.assets.some((asset) => asset.kind === "image")) {
    seeded.push(seedSignal("close-detail", "Close Detail", "image asset"));
    seeded.push(seedSignal("palette-warm", "Warm Palette", "image asset", 0.68));
  }
  if (capture.assets.some((asset) => asset.kind === "video")) {
    seeded.push(seedSignal("movement-trace", "Movement Trace", "video asset"));
    seeded.push(seedSignal("handheld-texture", "Handheld Texture", "video asset", 0.68));
  }
  if (capture.sourceKind === "moodboard") {
    seeded.push(seedSignal("palette-warm", "Warm Palette", "moodboard source kind", 0.7));
  }
  return seeded;
}

function collectAudioSeeds(capture: CaptureRecord): SignalTag[] {
  const seeded: SignalTag[] = [];
  if (capture.assets.some((asset) => asset.kind === "audio")) {
    seeded.push(seedSignal("spoken-voice", "Spoken Voice", "audio asset"));
    seeded.push(seedSignal("ambient-room-tone", "Ambient Room Tone", "audio asset", 0.68));
  }
  if (capture.sourceKind === "voice-note") {
    seeded.push(seedSignal("spoken-voice", "Spoken Voice", "voice-note source kind", 0.8));
    seeded.push(seedSignal("breath-pauses", "Breath And Pauses", "voice-note source kind", 0.7));
  }
  return seeded;
}

function collectStorySeeds(capture: CaptureRecord): SignalTag[] {
  const seeded: SignalTag[] = [];
  if (capture.sourceKind === "voice-note" || capture.sourceKind === "journal") {
    seeded.push(seedSignal("confession", "Confession", `${capture.sourceKind} source kind`, 0.78));
  }
  if (capture.sourceKind === "brief") {
    seeded.push(seedSignal("instruction", "Instruction", "brief source kind", 0.78));
  }
  if (capture.assets.some((asset) => asset.kind === "video" || asset.kind === "image")) {
    seeded.push(seedSignal("observation", "Observation", "visual media asset", 0.68));
  }
  return seeded;
}

function seedSignal(slug: string, label: string, evidence: string, score = 0.74): SignalTag {
  return { slug, label, score, evidence: [evidence] };
}

function rankSignals(haystack: string, rules: MediaSignalRule[], seeds: SignalTag[]): SignalTag[] {
  const ranked = rules
    .map((rule) => {
      const evidence: string[] = [];
      let matches = 0;
      for (const keyword of rule.keywords) {
        if (haystack.includes(keyword.toLowerCase())) {
          matches += 1;
          evidence.push(keyword);
        }
      }
      if (matches === 0) return null;
      return {
        slug: rule.slug,
        label: rule.label,
        score: Math.min(0.96, 0.52 + matches * 0.16),
        evidence,
      };
    })
    .filter((signal): signal is SignalTag => signal !== null);

  return aggregateSignals([...ranked, ...seeds]).slice(0, 4);
}

function aggregateSignals(signals: SignalTag[]): SignalTag[] {
  const bySlug = new Map<string, SignalTag>();
  for (const signal of signals) {
    const existing = bySlug.get(signal.slug);
    if (!existing || signal.score > existing.score) {
      bySlug.set(signal.slug, {
        ...signal,
        evidence: uniqueStrings(signal.evidence),
      });
      continue;
    }
    existing.evidence = uniqueStrings([...existing.evidence, ...signal.evidence]);
  }
  return Array.from(bySlug.values()).sort((left, right) => right.score - left.score || left.label.localeCompare(right.label));
}

function uniqueStrings(values: string[]): string[] {
  return Array.from(new Set(values.filter(Boolean)));
}
