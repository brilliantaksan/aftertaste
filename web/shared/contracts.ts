export type CaptureStatus = "captured" | "analyzed" | "compiled";

export type IngestionMode =
  | "link"
  | "link-note"
  | "link-upload"
  | "link-note-upload";

export type AnalysisMode = "text-first" | "hybrid";

export type IdeaOutputType = "hooks" | "script" | "shotlist";

export type TranscriptArtifactStatus = "ok" | "unavailable" | "error";

export type TranscriptArtifactSource =
  | "capture-stitch"
  | "manual"
  | "youtube"
  | "podcast-page"
  | "podcast-rss"
  | "audio-upload"
  | "web-article";

export type CaptureAcquisitionMode =
  | "source-link"
  | "official-api"
  | "user-upload"
  | "manual-transcript"
  | "best-effort-extractor"
  | "unavailable";

export type CaptureAcquisitionStatus =
  | "pending"
  | "ok"
  | "partial"
  | "unavailable"
  | "error";

export type CaptureAcquisitionProvider =
  | "meta"
  | "apify"
  | "manual"
  | "local-upload"
  | "unknown";

export type MediaAnalysisArtifactStatus = "ok" | "unavailable" | "error";

export type MediaAnalysisArtifactSource =
  | "manual"
  | "gemini"
  | "twelve-labs"
  | "rekognition"
  | "heuristic";

export type QueryIndexKind =
  | "reference"
  | "catalyst"
  | "wiki-article"
  | "snapshot"
  | "constitution"
  | "not-me"
  | "brief"
  | "creative-session";

export type TasteGraphNodeKind =
  | "reference"
  | "catalyst"
  | "snapshot"
  | "brief"
  | "creative-session";

export type TasteGraphEdgeKind =
  | "has_theme"
  | "has_motif"
  | "related_reference"
  | "supported_by"
  | "belongs_to_snapshot"
  | "reinforces"
  | "contrasts_with"
  | "anti_signal_of";

export type SourceKind =
  | "reference"
  | "journal"
  | "brief"
  | "voice-note"
  | "moodboard";

export type CatalystKind =
  | "theme"
  | "motif"
  | "creator"
  | "format"
  | "tension"
  | "hybrid";

export type WikiArticleKind =
  | "index"
  | "reference"
  | "theme"
  | "motif"
  | "creator"
  | "format"
  | "snapshot"
  | "constitution"
  | "not-me"
  | "concept"
  | "unknown";

export type WikiLintIssueKind =
  | "orphan-reference"
  | "thin-page"
  | "missing-concept"
  | "duplicate-concept"
  | "split-concept"
  | "weak-backlinks"
  | "unsupported-claim";

export type WikiCleanupActionKind =
  | "expand-page"
  | "create-page"
  | "merge-pages"
  | "split-page"
  | "add-backlinks"
  | "relink-reference";

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

export interface TranscriptSegment {
  text: string;
  startMs?: number;
  endMs?: number;
  speaker?: string;
}

export interface TranscriptArtifactProvenance {
  sourceUrl: string;
  sourceKind: SourceKind;
  assetIds: string[];
  notes: string[];
  acquisition?: {
    mode: CaptureAcquisitionMode;
    provider: CaptureAcquisitionProvider;
  };
}

export interface TranscriptArtifact {
  captureId: string;
  status: TranscriptArtifactStatus;
  source: TranscriptArtifactSource;
  text: string;
  segments?: TranscriptSegment[];
  language?: string | null;
  generatedAt: string;
  provenance: TranscriptArtifactProvenance;
  error?: string;
}

export interface CaptureAcquisitionRecord {
  mode: CaptureAcquisitionMode;
  status: CaptureAcquisitionStatus;
  provider: CaptureAcquisitionProvider;
  acquiredAt: string | null;
  sourceUrl: string | null;
  notes: string[];
  error?: string;
}

export interface CaptureRecord {
  id: string;
  sourceUrl: string;
  platform: string;
  note: string;
  sourceKind: SourceKind;
  savedReason: string | null;
  collection: string | null;
  projectIds: string[];
  assets: CaptureAsset[];
  ingestionMode: IngestionMode;
  status: CaptureStatus;
  createdAt: string;
  updatedAt: string;
  acquisition?: CaptureAcquisitionRecord;
  rawPaths: {
    inbox: string;
    capture: string;
    analysis: string | null;
    assetsDir: string | null;
    referencePage: string | null;
    artifacts: {
      transcript: string | null;
      mediaAnalysis: string | null;
    };
  };
  metadata: UrlMetadata;
}

export interface SignalTag {
  slug: string;
  label: string;
  score: number;
  evidence: string[];
}

export interface MediaAnalysisMoment {
  label: string;
  summary: string;
  startMs?: number;
  endMs?: number;
  confidence?: number;
}

export interface MediaAnalysisArtifact {
  captureId: string;
  status: MediaAnalysisArtifactStatus;
  source: MediaAnalysisArtifactSource;
  summary: string;
  visualSignals: SignalTag[];
  audioSignals: SignalTag[];
  storySignals: SignalTag[];
  moments: MediaAnalysisMoment[];
  generatedAt: string;
  acquisition?: {
    mode: CaptureAcquisitionMode;
    provider: CaptureAcquisitionProvider;
  };
  notes?: string[];
  error?: string;
}

export interface ProvenanceRecord {
  sourceIds: string[];
  sourcePaths: string[];
  compiledAt: string;
  sourceHash: string | null;
}

export interface ReferenceMoment {
  label: string;
  description: string;
  assetId?: string;
}

export interface AnalysisResult {
  captureId: string;
  mode: AnalysisMode;
  caption: string;
  transcript: string;
  transcriptProvenance: {
    artifactPath: string | null;
    source: TranscriptArtifactSource;
    status: TranscriptArtifactStatus;
    sourceKind: SourceKind;
  };
  ocr: string;
  themes: SignalTag[];
  motifs: SignalTag[];
  creatorSignals: SignalTag[];
  formatSignals: SignalTag[];
  toneSignals: SignalTag[];
  visualSignals: SignalTag[];
  audioSignals: SignalTag[];
  pacingSignals: SignalTag[];
  storySignals: SignalTag[];
  summary: string;
  confidence: number;
  assetInsights: string[];
  openQuestions: string[];
  moments: ReferenceMoment[];
  generatedAt: string;
}

export interface ReferenceSummary {
  id: string;
  title: string;
  platform: string;
  sourceUrl: string;
  note: string;
  sourceKind: SourceKind;
  savedReason: string | null;
  collection: string | null;
  projectIds: string[];
  createdAt: string;
  pagePath: string;
  summary: string;
  themes: SignalTag[];
  motifs: SignalTag[];
  creatorSignals: SignalTag[];
  formatSignals: SignalTag[];
  toneSignals: SignalTag[];
  visualSignals: SignalTag[];
  audioSignals: SignalTag[];
  pacingSignals: SignalTag[];
  storySignals: SignalTag[];
  moments: ReferenceMoment[];
  thumbnailLabel: string | null;
  thumbnailAssetId: string | null;
  assetCount: number;
  metadataTitle: string | null;
  relatedReferenceIds: string[];
  bestUseCases: string[];
  doNotCopy: string[];
  emotionalTone: string[];
  openQuestions: string[];
  contradictions: string[];
  transcriptSource: TranscriptArtifactSource;
  provenance: ProvenanceRecord;
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
  tensions: Array<{ label: string; summary: string; referenceIds: string[] }>;
  underexploredDirections: string[];
  antiSignals: string[];
  activeProjects: string[];
  openQuestions: string[];
  promptSeeds: PromptSeed[];
  generatedAt: string;
  provenance: ProvenanceRecord;
}

export interface CatalystRecord {
  id: string;
  slug: string;
  label: string;
  kind: CatalystKind;
  summary: string;
  queryHandles: string[];
  referenceIds: string[];
  relatedIds: string[];
  updatedAt: string;
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

export interface RelatedReferencesResponse {
  referenceId: string;
  related: ReferenceSummary[];
  catalysts: CatalystRecord[];
}

export interface QueryIndexEntry {
  id: string;
  kind: QueryIndexKind;
  title: string;
  summary: string;
  tags: string[];
  handles: string[];
  dates: {
    createdAt?: string;
    updatedAt?: string;
    start?: string;
    end?: string;
  };
  sourceIds: string[];
  path: string;
  relatedPaths?: string[];
  supportingReferenceIds?: string[];
  pageHealth?: WikiLintIssueKind[];
  articleKind?: WikiArticleKind | null;
}

export interface QuerySearchResponse {
  results: QueryIndexEntry[];
}

export interface WikiArticleLink {
  path: string;
  title: string;
}

export interface WikiArticleSection {
  heading: string;
  body: string;
}

export interface WikiArticleDetail {
  path: string;
  title: string;
  kind: WikiArticleKind;
  lead: string;
  sections: WikiArticleSection[];
  backlinks: WikiArticleLink[];
  relatedPaths: WikiArticleLink[];
  supportingReferenceIds: string[];
  tensions: string[];
  openQuestions: string[];
  lastCompiledAt: string | null;
  health: WikiLintIssueKind[];
  html?: string;
  raw?: string;
}

export interface WikiLintIssue {
  id: string;
  kind: WikiLintIssueKind;
  severity: "info" | "warn" | "error";
  title: string;
  summary: string;
  path: string | null;
  relatedPaths: string[];
  supportingReferenceIds: string[];
}

export interface WikiLintReport {
  generatedAt: string;
  issueCounts: Record<WikiLintIssueKind, number>;
  issues: WikiLintIssue[];
}

export interface WikiCleanupAction {
  id: string;
  kind: WikiCleanupActionKind;
  title: string;
  path: string | null;
  targetPath: string | null;
  summary: string;
  relatedPaths: string[];
  supportingReferenceIds: string[];
}

export interface WikiCleanupPreview {
  generatedAt: string;
  sourceReportGeneratedAt: string;
  actions: WikiCleanupAction[];
}

export interface TasteGraphEvidence {
  referenceIds: string[];
  catalystIds: string[];
  explanation: string | null;
}

export interface TasteGraphNode {
  id: string;
  kind: TasteGraphNodeKind;
  label: string;
  title: string | null;
  summary: string;
  path: string;
  group: string;
  degree: number;
}

export interface TasteGraphEdge {
  id: string;
  sourceId: string;
  targetId: string;
  kind: TasteGraphEdgeKind;
  weight: number;
  evidence: TasteGraphEvidence;
  updatedAt: string;
}

export interface TasteGraph {
  nodes: TasteGraphNode[];
  edges: TasteGraphEdge[];
}

export interface IdeaRequest {
  snapshotId: string | null;
  referenceIds: string[];
  outputType: IdeaOutputType;
  brief: string;
  briefId?: string | null;
}

export interface PersonalMoment {
  placeholder: string;
  prompt: string;
}

export interface IdeaPlanOption {
  title: string;
  angle: string;
  structure: string[];
  citations: string[];
  rationale: string;
  personalMoments: PersonalMoment[];
}

export interface IdeaPlan {
  outputType: IdeaOutputType;
  options: IdeaPlanOption[];
}

export interface IdeaDraft {
  id: string;
  title: string;
  body: string;
  citations: string[];
  rationale: string;
  outputType: IdeaOutputType;
  personalMoments: PersonalMoment[];
}

export interface IdeaResponse {
  request: IdeaRequest;
  snapshot: TasteSnapshot | null;
  context: IdeaGenerationContext;
  session: CreativeSessionRecord;
  outputs: IdeaDraft[];
  generatedAt: string;
}

export interface CreativeSessionRecord {
  id: string;
  briefId: string | null;
  outputType: IdeaOutputType;
  referenceIds: string[];
  catalystIds: string[];
  snapshotId: string | null;
  summary: string;
  learnedPatterns: string[];
  openQuestions: string[];
  antiSignals: string[];
  generatedAt: string;
}

export interface IdeaGenerationContext {
  budget: "L0" | "L1" | "L2" | "L3";
  outputType: IdeaOutputType;
  briefText: string;
  brief: ProjectBrief | null;
  snapshot: TasteSnapshot;
  selectedReferences: ReferenceSummary[];
  relatedReferences: ReferenceSummary[];
  catalysts: CatalystRecord[];
  constitutionExcerpt: string;
  notMeExcerpt: string;
  transcriptExcerpts: Record<string, string>;
  wikiArticles: Array<{
    path: string;
    title: string;
    excerpt: string;
    supportingReferenceIds: string[];
    relatedPaths: string[];
  }>;
  recentSessions: CreativeSessionRecord[];
}

export interface ProjectBrief {
  id: string;
  title: string;
  mode: "personal" | "client";
  deliverableType: "hooks" | "script" | "shotlist" | "concept";
  goal: string;
  audience: string;
  constraints: string[];
  selectedReferenceIds: string[];
  voiceGuardrails: string[];
  createdAt: string;
  updatedAt: string;
}

export interface BriefListResponse {
  briefs: ProjectBrief[];
}

export interface CaptureCreateRequest {
  sourceUrl: string;
  note?: string;
  sourceKind?: SourceKind;
  savedReason?: string | null;
  collection?: string | null;
  projectIds?: string[];
  assets?: CaptureAssetInput[];
}

export interface BriefCreateRequest {
  title: string;
  mode: "personal" | "client";
  deliverableType: "hooks" | "script" | "shotlist" | "concept";
  goal: string;
  audience?: string;
  constraints?: string[];
  selectedReferenceIds?: string[];
}
