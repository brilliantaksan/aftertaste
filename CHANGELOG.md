# Changelog

All notable changes to this project will be documented in this file.

## [0.2.0] - 2026-04-20

### Added

- **Compile pipeline** — `compileAftertaste()` is now orchestration over clean discrete passes: `compileReferences`, `compileReferenceSummaries`, `compileAggregates`, `compileCatalysts`, `compileQueryIndex`, `compileTasteGraph`. Each pass is independently testable.
- **Catalyst generation** — `compileCatalysts()` produces real `CatalystRecord` files from themes, motifs, creator patterns, theme-motif combinations, snapshot tensions, and anti-signals. Each catalyst stores stable slugs, query handles, reference IDs, and a summary.
- **Related references** — `buildRelatedReferenceMap()` computes similarity scores from catalyst/theme/motif/creator/format overlap and fills `ReferenceSummary.relatedReferenceIds` at compile time. `GET /api/references/:id/related` exposes this.
- **First-class taste graph** — `compileTasteGraph()` writes `outputs/app/taste-graph.json` with typed nodes (reference, catalyst, snapshot, brief, creative-session), weighted edges (has_theme, has_motif, related_reference, supported_by, reinforces, contrasts_with, anti_signal_of), and evidence traces.
- **Query index** — `compileQueryIndex()` writes `outputs/app/query-index.json` covering references, catalysts, wiki articles, snapshots, constitution, not-me, briefs, creative sessions, and moments. `searchQueryIndex()` supports filtering by theme, motif, format, platform, and date.
- **Provenance + contradiction fields** — compiled outputs now carry source capture IDs, compile timestamps, `openQuestions`, and `contradictions`. The explorer surfaces uncertainty explicitly rather than smoothing it into clean summaries.
- **Project briefs** — `createProjectBrief()`, `listProjectBriefs()`, `getProjectBrief()`, and `POST /api/briefs` / `GET /api/briefs/:id`. Idea requests can reference a saved brief by ID. Briefs are file-backed at `outputs/briefs/<id>.json`.
- **Creative session file-back** — `generateIdeas()` writes a `CreativeSessionRecord` to `outputs/app/creative-sessions.json` after every successful generation. Sessions include reference IDs, catalyst IDs, snapshot ID, a summary, learned patterns, open questions, and anti-signals. Sessions feed into future generation contexts.
- **Typed LLM idea planning** — `generateIdeaPlan()` in `llm.ts` sends an `IdeaGenerationContext` to the model, expects an `IdeaPlan` JSON response, validates it, and renders `IdeaDraft[]` deterministically. Heuristic fallback remains when no provider is configured.
- **Rich generation context** — `buildIdeaGenerationContext()` assembles selected references, related references, relevant catalysts, snapshot tensions, anti-signals, style constitution excerpt, not-me excerpt, optional brief, and recent creative session learnings.
- **File-backed transcript artifacts** — `TranscriptArtifact` records at `raw/media/<captureId>/transcript.json` with typed status, source, and provenance. Analysis prefers artifact-backed text over metadata-stitched fallback.
- **YouTube transcript retrieval** — captures from `youtube.com` attempt to fetch caption tracks before falling back to description metadata.
- **Podcast transcript extraction** — podcast page captures check for transcript blocks in HTML; podcast RSS captures check enclosure and show-notes fields.
- **Web article body extraction** — `extractWebArticleText()` parses article body from Substack, Medium, Ghost, and generic blogs using DOM-targeted selectors and p-density fallback. Platform exclusion list covers YouTube, Instagram, TikTok, Spotify, SoundCloud, Vimeo.
- **Uploaded audio transcription** — `llm.ts` supports OpenAI Whisper transcription for uploaded audio assets. Provider config is optional; missing config skips cleanly.
- **Instagram Reel acquisition provenance** — `CaptureAcquisitionRecord` tracks mode, status, provider, and acquisition notes. A Reel URL with no uploaded media records the gap explicitly rather than implying media understanding.
- **Capture moments artifact** — `buildCaptureMomentsArtifact()` normalizes transcript segments, visual beats, audio beats, story beats, anchor lines, and asset beats into a shared shape stored at `raw/media/<captureId>/moments.json`.
- **Media analysis artifact seam** — `media-analysis.ts` provides a heuristic adapter that writes `raw/media/<captureId>/media-analysis.json`. Provider-backed adapters (Gemini, Twelve Labs) can slot into the same artifact path later.
- **Async compile after analyze** — `POST /api/captures/:id/analyze` returns the analysis result immediately; compile runs via `setImmediate()` in the background, removing the latency block at 30+ references.
- **LLM-enhanced snapshot and search** — `getCurrentSnapshotSmart()` and `searchQueryIndexSmart()` apply optional model-backed intelligence (reranking, synthesis) on top of the deterministic base.
- **Voice-note capture kind** — `sourceKind: "voice-note"` shifts analysis toward audio and story signals.
- **Reddit verification fallback** — captures from reddit.com fall back to the JSON API endpoint when HTML is blocked by a verification page.
- **Idea Studio UI upgrade** — reference selection, brief picker, active catalyst chips, citation pills, and session summary after generation.
- **Graph explorer** — D3-backed taste graph visualization in studio view, backed by `GET /api/graph/taste`.

### Changed

- `compileAftertaste()` is now short orchestration logic (~30 lines) delegating to named compile passes.
- `AnalysisResult.transcript` is now artifact-backed when a transcript artifact exists, falling back to metadata-stitched text.
- Signal extraction for LLM-backed analysis is constrained to evidence found in the capture text — tags not grounded in the actual content are suppressed.
- `buildCreativeSessionRecord()` runs after every `generateIdeas()` call regardless of provider path.

### Fixed

- Compile no longer blocks the analyze HTTP response. Latency at 30+ references is eliminated.
- Repeated `Date.now()` collisions produce distinct creative session IDs.
- Failed creative session writes do not corrupt the previously saved sessions array.
