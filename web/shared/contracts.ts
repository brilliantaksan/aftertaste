export type CaptureStatus = "captured" | "analyzed" | "compiled";

export type IngestionMode =
  | "link"
  | "link-note"
  | "link-upload"
  | "link-note-upload";

export type AnalysisMode = "text-first" | "hybrid";

export type IdeaOutputType = "hooks" | "script" | "shotlist";

export interface CaptureAssetInput {
  name: string;
  mediaType: string;
  dataBase64: string;
  size?: number;
}

export interface CaptureAsset {
  id: string;
  fileName: string;
  originalName: string;
  mediaType: string;
  size: number;
  path: string;
  kind: "image" | "video" | "audio" | "document" | "other";
}

export interface UrlMetadata {
  title: string | null;
  description: string | null;
  canonicalUrl: string | null;
  siteName: string | null;
  fetchedAt: string | null;
  status: "ok" | "error" | "skipped";
  error?: string;
}

export interface CaptureRecord {
  id: string;
  sourceUrl: string;
  platform: string;
  note: string;
  assets: CaptureAsset[];
  ingestionMode: IngestionMode;
  status: CaptureStatus;
  createdAt: string;
  updatedAt: string;
  rawPaths: {
    inbox: string;
    capture: string;
    analysis: string | null;
    assetsDir: string | null;
    referencePage: string | null;
  };
  metadata: UrlMetadata;
}

export interface SignalTag {
  slug: string;
  label: string;
  score: number;
  evidence: string[];
}

export interface AnalysisResult {
  captureId: string;
  mode: AnalysisMode;
  caption: string;
  transcript: string;
  ocr: string;
  themes: SignalTag[];
  motifs: SignalTag[];
  creatorSignals: SignalTag[];
  formatSignals: SignalTag[];
  summary: string;
  confidence: number;
  assetInsights: string[];
  generatedAt: string;
}

export interface ReferenceSummary {
  id: string;
  title: string;
  platform: string;
  sourceUrl: string;
  note: string;
  createdAt: string;
  pagePath: string;
  summary: string;
  themes: SignalTag[];
  motifs: SignalTag[];
  creatorSignals: SignalTag[];
  formatSignals: SignalTag[];
  thumbnailLabel: string | null;
  assetCount: number;
  metadataTitle: string | null;
}

export interface PromptSeed {
  title: string;
  prompt: string;
  referenceIds: string[];
}

export interface CreatorPattern {
  label: string;
  summary: string;
  sourceReferenceIds: string[];
}

export interface TasteSnapshot {
  id: string;
  window: {
    label: string;
    start: string;
    end: string;
  };
  summary: string;
  themes: SignalTag[];
  motifs: SignalTag[];
  creatorPatterns: CreatorPattern[];
  notableReferences: ReferenceSummary[];
  promptSeeds: PromptSeed[];
  generatedAt: string;
}

export interface CaptureListResponse {
  captures: CaptureRecord[];
}

export interface CaptureDetailResponse {
  capture: CaptureRecord;
  analysis: AnalysisResult | null;
  reference: ReferenceSummary | null;
}

export interface ReferencesFilters {
  themes: Array<{ slug: string; label: string; count: number }>;
  motifs: Array<{ slug: string; label: string; count: number }>;
  creators: Array<{ slug: string; label: string; count: number }>;
  formats: Array<{ slug: string; label: string; count: number }>;
  platforms: Array<{ slug: string; label: string; count: number }>;
}

export interface ReferencesResponse {
  references: ReferenceSummary[];
  filters: ReferencesFilters;
}

export interface IdeaRequest {
  snapshotId: string | null;
  referenceIds: string[];
  outputType: IdeaOutputType;
  brief: string;
}

export interface IdeaDraft {
  id: string;
  title: string;
  body: string;
  citations: string[];
  rationale: string;
  outputType: IdeaOutputType;
}

export interface IdeaResponse {
  request: IdeaRequest;
  snapshot: TasteSnapshot | null;
  outputs: IdeaDraft[];
  generatedAt: string;
}

export interface CaptureCreateRequest {
  sourceUrl: string;
  note?: string;
  assets?: CaptureAssetInput[];
}
