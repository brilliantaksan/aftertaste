# Aftertaste Implementation Backlog

## Purpose

This is the execution plan for the next meaningful Aftertaste build.

It translates:

- the current repo state,
- the architecture in [aftertaste-architecture.md](./aftertaste-architecture.md),
- the product framing in [aftertaste-report.md](./aftertaste-report.md),
- and the strongest implementation lessons from the Karpathy gist discussion

into a concrete delivery sequence for the current codebase.

This backlog is written against the repo state on **April 12, 2026**.

## What Changed Since The Earlier Backlog

The earlier version of this file treated several contract additions as future work.
That is no longer accurate.

The repo already contains:

- extended capture and analysis fields in [web/shared/contracts.ts](../../web/shared/contracts.ts)
- extended snapshot and reference fields in [web/shared/contracts.ts](../../web/shared/contracts.ts)
- workspace creation for `outputs/catalysts/` and `outputs/briefs/` in [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts)
- a stub catalyst compile step in [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts)
- tests that already assume some of the newer contract fields in [web/server/aftertaste/service.test.ts](../../web/server/aftertaste/service.test.ts)

So the next work is not "extend the types."
The next work is:

- make the compiler actually use the stronger types,
- compile a first-class taste-graph artifact instead of leaving graph logic implicit,
- add a real retrieval/query layer,
- add provenance and contradiction handling,
- file useful creative outputs back into the vault,
- replace heuristic-only idea generation with a guarded LLM pipeline.

## Current Repo Reality

### Already true

- Capture writes immutable raw files through [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts).
- `sourceKind` already exists in the contract and already changes heuristic analysis behavior.
- uploaded assets are already persisted into the vault under `raw/`.
- The app compiles references, category pages, snapshot pages, constitution, and `not-me`.
- Idea generation already preserves the important `[YOUR LINE: ...]` and `[YOUR MOMENT: ...]` pattern.
- LLM-backed idea planning already exists through [web/server/aftertaste/llm.ts](../../web/server/aftertaste/llm.ts), with heuristic fallback when provider config is missing.
- Shared contracts already have room for richer signals, briefs, catalysts, related references, tensions, and anti-signals.

### Not true yet

- `compileCatalysts()` is still effectively a placeholder.
- `ReferenceSummary.relatedReferenceIds` is never meaningfully populated.
- there is no proper `getRelatedReferences()` service or route.
- there is no first-class `taste-graph.json` artifact with typed nodes, typed edges, weights, and evidence.
- there is no saved `ProjectBrief` flow.
- there is no `CreativeSession` or "file-back" loop from idea work into memory.
- there is no provenance model beyond simple citations.
- the current wiki index is still a static page, not a durable query surface.
- there is no real YouTube transcript retrieval.
- there is no podcast transcript extraction from episode pages or RSS feeds.
- there is no uploaded audio transcription.
- there is no content-level video understanding.
- the current `transcript` field is still stitched from note, saved reason, and page metadata rather than fetched spoken content.
- current media handling is still heuristic only.

## Planning Principles

These principles come directly from the strongest recurring ideas in the gist discussion and should shape implementation decisions:

- **Compiler, not chatbot.** Multi-step compile passes beat one giant prompt.
- **Typed intermediate contracts first.** LLM output should be parsed into structured data before rendering markdown or UI output.
- **Voice is canonical.** The creator's language is source material, not something to smooth away.
- **Every task produces two outputs.** The answer the user asked for, plus updates to the knowledge base.
- **Query scale matters early.** Keep markdown canonical, but add a local query/index layer before the archive gets large.
- **Provenance is mandatory.** References, claims, and generated outputs must be traceable to source captures.
- **Contradictions should surface, not disappear.** "Not me", open questions, and unresolved tensions are part of the product.
- **Fallbacks matter.** The app must still work when no LLM provider is configured.

## Critical Path

The work should follow this order:

1. Harden the compiler and make the stronger contract fields real.
2. Add a local retrieval/query layer over the compiled archive.
3. Add briefs and creative-session file-back.
4. Introduce typed LLM idea planning with deterministic rendering.
5. Upgrade analysis and capture surfaces once the downstream memory shape is stable.

If this order is ignored, the likely failure mode is clear:

- you get nicer idea outputs,
- but they are generated against weak context,
- and none of the useful work compounds back into the archive.

## Milestones

| Milestone | Goal | Why it comes now | Main outputs |
|---|---|---|---|
| M0 | Make the compiler trustworthy | everything downstream depends on this | real catalysts, related refs, provenance hooks |
| M1 | Add local query memory | static index will not scale | derived search/index artifacts + retrieval service |
| M2 | Add briefs and creative-session file-back | compounding is the point of the product | reusable briefs + stored synthesis |
| M3 | Add LLM-backed idea planning | highest-value feature gap | typed idea plans rendered into current UI shape |
| M4 | Real transcript and media ingestion | only worth doing once memory and retrieval are stable | file-backed transcript artifacts, source transcript retrieval, audio transcription, transcript-backed analysis |

## Deliverable Definition

The first meaningful "next version" of Aftertaste is done when all of these are true:

- the app can save and reuse a project brief
- idea generation can use a real LLM provider
- idea generation still preserves personal placeholders and never fills them in
- generated outputs cite concrete references
- a creative session writes useful synthesis back into the vault
- a reference can return related references through a real retrieval path
- snapshot and explorer surfaces show tensions, anti-signals, and related trails
- the app works without provider configuration by falling back to deterministic generation

## Tickets

### AT-101: Make The Compile Pipeline Explicit

**Priority**

- P0

**Goal**

- turn `compileAftertaste()` into orchestration over smaller compile passes

**Why now**

- the current service is good enough for a heuristic prototype, but too monolithic for provenance, contradictions, catalysts, and LLM-backed compilation to land cleanly

**Files**

- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts)
- [web/server/aftertaste/service.test.ts](../../web/server/aftertaste/service.test.ts)

**Required refactor**

- split compile into internal passes:
  - `compileReferences(root)`
  - `compileReferenceSummaries(root, analyses)`
  - `compileAggregates(root, references)`
  - `compileCatalysts(root, references, snapshot)`
  - `compileQueryIndex(root, references, catalysts, snapshot)`
- keep `compileAftertaste(root)` as orchestration only

**Acceptance criteria**

- `compileAftertaste()` is short orchestration logic
- compile outputs remain stable for current test fixtures
- catalyst and query-index passes can be tested independently

### AT-102: Make Catalyst Generation Real

**Priority**

- P0

**Goal**

- populate actual `CatalystRecord` files instead of leaving the layer nominal

**Why now**

- catalysts are the retrieval bridge between "raw tags" and "useful creative context"

**Files**

- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts)
- [web/shared/contracts.ts](../../web/shared/contracts.ts)
- [web/server/aftertaste/service.test.ts](../../web/server/aftertaste/service.test.ts)

**Implementation**

- generate catalysts from:
  - dominant themes
  - dominant motifs
  - creator patterns
  - repeated theme + motif combinations
  - snapshot tensions
  - anti-signals / "not me" clusters
- ensure each catalyst stores:
  - `queryHandles`
  - `referenceIds`
  - `relatedIds`
  - `summary`
  - stable `slug`

**Acceptance criteria**

- a non-trivial vault compile creates stable catalyst files
- repeated compiles with unchanged input produce identical catalyst IDs and slugs
- catalyst summaries are deterministic in fallback mode

### AT-103: Compute Related References At Compile Time

**Priority**

- P0

**Goal**

- fill `ReferenceSummary.relatedReferenceIds` and expose a proper related-reference path

**Why now**

- "what rhymes with this?" is a core creator interaction, and the contract field already exists

**Files**

- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts)
- [web/server/routes/aftertaste.ts](../../web/server/routes/aftertaste.ts)
- [web/shared/contracts.ts](../../web/shared/contracts.ts)
- [web/server/aftertaste/service.test.ts](../../web/server/aftertaste/service.test.ts)

**Implementation**

- compute a similarity score from:
  - catalyst overlap
  - theme overlap
  - motif overlap
  - creator overlap
  - format overlap
  - recency as a small tiebreaker
- write top related IDs into each `ReferenceSummary`
- add:
  - `getRelatedReferences(root, referenceId)`
  - `GET /api/references/:id/related`

**Acceptance criteria**

- each reference can return related references without recomputing the whole archive
- obviously similar references rank above unrelated ones
- missing IDs return 404 from the route

### AT-104: Add A Derived Query Index

**Priority**

- P1

**Goal**

- keep markdown canonical while adding a real local query layer

**Why now**

- the static `index.md` is a good navigation page, but not a scalable retrieval mechanism

**Files**

- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts)
- [web/server/routes/aftertaste.ts](../../web/server/routes/aftertaste.ts)
- [web/shared/contracts.ts](../../web/shared/contracts.ts)
- [web/client/main.ts](../../web/client/main.ts)
- [web/server/aftertaste/service.test.ts](../../web/server/aftertaste/service.test.ts)

**New output**

- `outputs/app/query-index.json`

**Recommended shape**

- one entry per:
  - reference
  - catalyst
  - snapshot
  - constitution
  - not-me
  - later: brief and creative session
- indexed fields:
  - title
  - summary
  - tags
  - handles
  - dates
  - source ids
  - path

**Acceptance criteria**

- the app can answer simple local queries without scanning markdown files directly
- query results can be filtered by theme, motif, format, platform, and date window
- the query index is fully derivable from file-backed artifacts

### AT-113: Compile A First-Class Taste Graph

**Priority**

- P1

**Goal**

- compile the archive into a durable graph artifact instead of reconstructing relationships ad hoc at query time

**Why now**

- the product thesis is not just "wiki pages plus search"
- semantic similarity, multimodal linking, and graph-native retrieval all need an inspectable structure to attach to
- without a compiled graph, weighted relationships stay implicit and hard to debug

**Files**

- [web/shared/contracts.ts](../../web/shared/contracts.ts)
- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts)
- [web/server/routes/aftertaste.ts](../../web/server/routes/aftertaste.ts)
- [web/client/studio.ts](../../web/client/studio.ts)
- [web/server/aftertaste/service.test.ts](../../web/server/aftertaste/service.test.ts)

**New output**

- `outputs/app/taste-graph.json`

**Recommended shape**

- `nodes[]` with typed entities such as:
  - reference
  - catalyst
  - snapshot
  - brief
  - creative-session
  - later: capture asset and extracted moment
- `edges[]` with:
  - `sourceId`
  - `targetId`
  - `kind`
  - `weight`
  - `evidence`
  - `updatedAt`
- recommended edge kinds:
  - `has_theme`
  - `has_motif`
  - `related_reference`
  - `supported_by`
  - `belongs_to_snapshot`
  - `reinforces`
  - `contrasts_with`
  - `anti_signal_of`
  - later: `shares_moment`, `shares_visual_signal`, `shares_audio_signal`

**Implementation**

- compile graph nodes from existing file-backed artifacts:
  - references
  - catalysts
  - current snapshot
  - project briefs
  - creative sessions
- compile weighted edges from:
  - related-reference similarity scores
  - catalyst membership
  - theme / motif / creator / format overlap
  - snapshot tension support
  - anti-signal membership
- store evidence for each weighted edge:
  - supporting reference IDs
  - supporting catalyst IDs
  - optional short explanation string
- keep it fully derivable from vault artifacts; no opaque runtime-only graph state
- expose:
  - `getTasteGraph(root)`
  - `GET /api/graph/taste`

**Acceptance criteria**

- the archive can be rendered as a typed graph without rescanning markdown relationships
- weighted relationships are inspectable and testable
- graph edges can be traced back to file-backed evidence
- the Studio graph can later switch to this artifact without changing the vault model

### AT-105: Add Provenance And Contradiction Fields To Compiled Outputs

**Priority**

- P1

**Goal**

- make the taste layer inspectable instead of just coherent-sounding

**Why now**

- once LLM output enters the pipeline, drift becomes the main product risk

**Files**

- [web/shared/contracts.ts](../../web/shared/contracts.ts)
- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts)
- [web/client/main.ts](../../web/client/main.ts)
- [web/client/styles.css](../../web/client/styles.css)
- [web/server/aftertaste/service.test.ts](../../web/server/aftertaste/service.test.ts)

**Contract additions**

- add source provenance fields to compiled artifacts:
  - source capture IDs
  - source paths
  - compile timestamp
  - optional source hash placeholder for future stronger invalidation
- add contradiction/open-question surfaces:
  - `ReferenceSummary.openQuestions?: string[]`
  - `ReferenceSummary.contradictions?: string[]`
  - `TasteSnapshot.openQuestions?: string[]`

**Rendering changes**

- show contradictions and data gaps in explorer/snapshot surfaces
- keep "not me" and anti-signals visually separate from positive taste signals

**Acceptance criteria**

- a user can tell which capture(s) support a compiled summary
- unresolved uncertainty is rendered explicitly
- compile outputs never silently drop contradictions into a clean summary blob

### AT-106: Add Project Brief Persistence

**Priority**

- P1

**Goal**

- make project context reusable instead of ephemeral

**Why now**

- brief reuse should exist before model-backed idea generation lands

**Files**

- [web/shared/contracts.ts](../../web/shared/contracts.ts)
- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts)
- [web/server/routes/aftertaste.ts](../../web/server/routes/aftertaste.ts)
- [web/client/main.ts](../../web/client/main.ts)
- [web/client/styles.css](../../web/client/styles.css)
- [web/server/aftertaste/service.test.ts](../../web/server/aftertaste/service.test.ts)

**New APIs**

- `POST /api/briefs`
- `GET /api/briefs/:id`
- `GET /api/briefs`

**Writes**

- `outputs/briefs/<id>.json`

**Acceptance criteria**

- a brief can be created, listed, viewed, and reused
- idea requests can reference `briefId`
- freeform brief text continues to work when no saved brief exists

### AT-107: Add Creative Session File-Back

**Priority**

- P1

**Goal**

- make idea work compound into the archive

**Why now**

- this is the strongest lesson from the gist thread, and currently the largest missing compounding loop

**Files**

- [web/shared/contracts.ts](../../web/shared/contracts.ts)
- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts)
- [web/server/routes/aftertaste.ts](../../web/server/routes/aftertaste.ts)
- [web/client/main.ts](../../web/client/main.ts)
- [web/server/aftertaste/service.test.ts](../../web/server/aftertaste/service.test.ts)

**New artifacts**

- `outputs/ideas/<timestamp>.json` remains
- add `outputs/app/creative-sessions.json`
- optionally add `wiki/projects/` or `wiki/sessions/` summaries later

**Recommended new contract**

```ts
interface CreativeSessionRecord {
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
```

**Behavior**

- every successful generation stores:
  - a short session summary
  - patterns reinforced
  - patterns rejected
  - unresolved questions
- these records become queryable inputs for future sessions

**Acceptance criteria**

- at least one durable artifact is written beyond the raw `IdeaResponse`
- later sessions can reference prior creative-session learnings
- rejected directions can inform `not-me` / anti-signal surfaces

### AT-108: Introduce Typed LLM Idea Planning

**Priority**

- P2

**Goal**

- replace direct heuristic prose generation with a typed planning step

**Why now**

- Aftertaste needs real model-backed idea generation, but the placeholder pattern must remain inviolable

**Files**

- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts)
- [web/server/aftertaste/service.test.ts](../../web/server/aftertaste/service.test.ts)
- [AGENTS.md](../../AGENTS.md)
- [local-vault/CLAUDE.md](../../local-vault/CLAUDE.md)

**New file**

- `web/server/aftertaste/llm.ts`

**Recommended new contract**

```ts
interface IdeaPlan {
  outputType: IdeaOutputType;
  options: Array<{
    title: string;
    angle: string;
    structure: string[];
    citations: string[];
    rationale: string;
    personalMoments: PersonalMoment[];
  }>;
}
```

**Pipeline**

1. build generation context
2. ask the LLM for `IdeaPlan` JSON only
3. validate JSON
4. render `IdeaDraft[]` deterministically into the current UI contract

**Prompt requirements**

- voice-first
- never write the creator's personal lines
- exploratory language only
- cite references
- maximum 3 options
- draw from archive, not generic style invention

**Fallback**

- current heuristic generation remains as fallback when provider config is missing or parsing fails

**Acceptance criteria**

- no model path bypasses placeholder preservation
- all model outputs are parsed into typed structures before rendering
- fallback mode still passes all tests

### AT-109: Build The Real Generation Context

**Priority**

- P2

**Goal**

- give the model the right context object instead of a loose summary blob

**Why now**

- model quality will mostly be determined by context shape, not prompt cleverness

**Files**

- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts)
- [web/server/aftertaste/llm.ts](../../web/server/aftertaste/llm.ts)
- [web/server/aftertaste/service.test.ts](../../web/server/aftertaste/service.test.ts)

**Context object should include**

- selected references
- related references
- relevant catalysts
- snapshot tensions
- underexplored directions
- anti-signals
- style constitution excerpt
- not-me excerpt
- optional project brief
- optional recent creative-session learnings

**Context budget**

- L0: short session context
- L1: snapshot + brief + constitution/not-me excerpt
- L2: selected references + related references + catalysts
- L3: deeper article bodies only if needed later

**Acceptance criteria**

- changing references meaningfully changes outputs
- changing `not-me` can suppress a direction
- generation context is inspectable in tests or debug logs

### AT-110: Upgrade Idea Studio To Match The New Flow

**Priority**

- P2

**Goal**

- make the UI reveal where ideas came from and what still belongs to the creator

**Files**

- [web/client/main.ts](../../web/client/main.ts)
- [web/client/styles.css](../../web/client/styles.css)
- [web/shared/contracts.ts](../../web/shared/contracts.ts)

**UI changes**

- brief picker / builder
- active reference stack
- active catalyst chips
- constitution / not-me strip
- clearer placeholder callouts
- citation pills
- session summary after generation

**Acceptance criteria**

- the user can see why each output exists
- the user can see what is still theirs to write
- the user can regenerate without losing selected context

### AT-111: Add File-Backed Extraction Artifacts

**Priority**

- P3

**Goal**

- make transcript and media enrichment a durable artifact pipeline instead of transient analysis logic

**Why later**

- transcript and media enrichment only compounds if the artifact shape is stable and inspectable

**Files**

- [web/shared/contracts.ts](../../web/shared/contracts.ts)
- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts)
- [web/server/aftertaste/service.test.ts](../../web/server/aftertaste/service.test.ts)

**Public/interface changes**

- extend `CaptureRecord.rawPaths` to expose transcript and media artifact paths, or add a small `artifacts` block under `rawPaths`
- add a typed transcript artifact contract with:
  - `captureId`
  - `status`
  - `source`
  - `text`
  - `segments?`
  - `language?`
  - `generatedAt`
  - `provenance`
- add lightweight transcript provenance fields so `AnalysisResult.transcript` can be traced back to artifact paths and source kind

**Storage**

- `raw/media/<captureId>/transcript.json`
- reserve `raw/media/<captureId>/media-analysis.json` as the later-compatible slot for richer multimodal analysis

**Acceptance criteria**

- analysis reads extracted artifacts if present
- artifacts are file-backed and inspectable
- the fallback path still works when no extraction artifact exists

### AT-112: Retrieve Source Transcripts For Supported Links

**Priority**

- P3

**Goal**

- fetch transcript text for supported source URLs before heuristic analysis runs

**Files**

- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts)
- [web/server/routes/aftertaste.ts](../../web/server/routes/aftertaste.ts)
- [web/server/aftertaste/service.test.ts](../../web/server/aftertaste/service.test.ts)

**Behavior**

- keep `POST /api/captures/:id/analyze` as the enrichment entrypoint
- detect platform from `sourceUrl`
- attempt transcript retrieval in this order:
  1. YouTube transcript path
  2. podcast page transcript blocks
  3. podcast RSS enclosure or show-notes transcript fields when discoverable
- persist the best recovered transcript into `raw/media/<captureId>/transcript.json`
- if nothing is available, record a non-fatal artifact status and continue analysis

**Acceptance criteria**

- supported YouTube links can persist real transcript text
- transcript-friendly podcast sources can persist extracted transcript text
- unsupported sources do not fail analysis
- transcript artifact status distinguishes `ok`, `unavailable`, and `error`

### AT-114: Add Uploaded Audio Transcription Via OpenAI

**Priority**

- P3

**Goal**

- transcribe uploaded audio assets into the same file-backed artifact pipeline

**Files**

- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts)
- [web/server/aftertaste/llm.ts](../../web/server/aftertaste/llm.ts)
- [web/server/aftertaste/service.test.ts](../../web/server/aftertaste/service.test.ts)

**Public/interface changes**

- keep `AFTERTASTE_OPENAI_API_KEY` reusable for transcription
- add a dedicated transcription model env var rather than silently reusing the chat-completions model
- keep the provider seam narrow so later transcript and media adapters can be swapped without reshaping vault artifacts

**Behavior**

- if the capture has audio assets, `analyze` may transcribe them
- persist transcript output into the same transcript artifact shape with source `audio-upload`
- if provider config is missing, skip cleanly and keep heuristic fallback
- if transcription fails, record the failure in the artifact rather than faking success

**Acceptance criteria**

- uploaded audio can produce a real transcript artifact
- missing provider config does not break analysis
- transcription failures are recorded, not swallowed into fake success

### AT-118: Extract Article Body Text For Web Captures

**Priority**

- P3 (deliver before AT-115)

**Goal**

- fetch and persist article body text for written-content URLs so analysis runs against actual article content, not just og:description

**Problem**

- the current `fetchUrlMetadata()` downloads full HTML but only reads `<meta>` tags
- for a Substack article like `liinh.substack.com/p/i-would-peel-oranges-for-you`, analysis only sees the title and a two-sentence og:description excerpt — not the actual article text about love languages, acts of service, etc.
- signal extraction then misses the real content of the capture

**Scope**

- written-content URLs: Substack, Medium, Ghost, generic blogs, newsletters
- explicitly excludes: YouTube, Instagram, TikTok, Spotify, SoundCloud, Vimeo (handled separately or not parseable)

**Files**

- [web/shared/contracts.ts](../../web/shared/contracts.ts)
- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts)

**Contract change**

- add `"web-article"` to `TranscriptArtifactSource`

**Implementation**

- add `isWebArticleSourceUrl(sourceUrl)` — returns false for video/audio-first platforms, true otherwise
- add `extractWebArticleText(html, sourceUrl)` — extracts article body using:
  - Substack: `div.body.markup`, `div.available-content`
  - generic: `<article>`, `<main>`
  - fallback: `<p>` density scan across the narrowed region
  - minimum 3 paragraphs, each >20 chars; returns null if threshold not met
- add `tryWebArticleTranscriptArtifact(capture)` — fetches page, calls extractor, returns `TranscriptArtifact | null`
- wire into `resolveTranscriptArtifact()` after audio upload check, before final fallback
- artifact `source` is `"web-article"`, notes record that text was extracted from article body

**Behavior**

- if extraction fails or returns fewer than 3 paragraphs, return null and fall through to existing fallback
- non-blocking: any error returns null silently
- reuses existing `fetchTextResource`, `normalizeTranscriptText`, `isTranscriptLike`, `buildResolvedTranscriptArtifact` helpers

**Acceptance criteria**

- a Substack article URL produces a `transcript.json` artifact with `source: "web-article"` and article body text
- signal extraction for that capture uses the article text, not just og:description
- unsupported or failed URLs fall through to existing fallback without error
- platform-exclusion list covers YouTube, Instagram, TikTok, Spotify, SoundCloud, Vimeo

### AT-115: Make Analysis And Ideas Consume Real Transcript Text

**Priority**

- P3

**Goal**

- shift analysis and idea generation from metadata-plus-heuristics to artifact-backed text when available

**Files**

- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts)
- [web/server/aftertaste/llm.ts](../../web/server/aftertaste/llm.ts)
- [web/shared/contracts.ts](../../web/shared/contracts.ts)
- [web/server/aftertaste/service.test.ts](../../web/server/aftertaste/service.test.ts)

**Behavior**

- `buildTranscript()` should assemble the best available extracted text instead of concatenating note and metadata first
- title and description metadata remain fallback context, not the primary transcript source
- `moments[]`, `openQuestions`, and signal extraction should prefer transcript-derived evidence when transcript artifacts exist
- idea-generation context should include transcript-derived moments and provenance without weakening `[YOUR LINE: ...]` and `[YOUR MOMENT: ...]` protection

**Acceptance criteria**

- transcript-backed captures produce materially different analysis than link-only metadata captures
- idea plans can cite references grounded in transcript content
- placeholder preservation and creative guardrails remain unchanged

### AT-116: Defer Rich Video Understanding Behind An Adapter Seam

Status: done on April 13, 2026

**Priority**

- P4

**Goal**

- keep the roadmap honest without over-scoping v1

**Files**

- [llm-wiki/references/aftertaste-implementation-backlog.md](./aftertaste-implementation-backlog.md)

**Behavior**

- explicitly defer frame-level video analysis, timestamps, speaker turns, and richer multimodal providers to post-transcript work
- state clearly that uploaded video still only gets shallow handling in v1 unless a later adapter lands
- keep the storage shape compatible with later provider-backed `media-analysis.json` artifacts
- current implementation uses a heuristic adapter seam that writes `raw/media/<captureId>/media-analysis.json`
- the v1 adapter is allowed to infer from transcript text, saved notes, metadata, asset kind, and filenames only
- the v1 adapter is not allowed to imply frame understanding, diarization, scene segmentation, or provider-backed multimodal claims

**Acceptance criteria**

- the backlog makes clear what “real media understanding” does not yet include
- uploaded video is not misrepresented as content-level understanding
- no ambiguity remains about what is deferred
- the current fallback path stays compatible with later provider adapters that can populate the same artifact shape

### AT-117: Formalize Instagram Reel Ingestion And Acquisition Provenance

**Priority**

- P4

**Goal**

- make the Instagram Reel path explicit so the product does not promise reliable understanding of media it cannot lawfully or technically access

**Why now**

- Reel handling is the main place where "capture a URL" and "understand the content" can be confused
- Aftertaste needs a durable distinction between:
  - source URL metadata
  - acquired media bytes
  - transcript extraction
  - richer media understanding

**Files**

- [web/shared/contracts.ts](../../web/shared/contracts.ts)
- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts)
- [web/server/aftertaste/service.test.ts](../../web/server/aftertaste/service.test.ts)
- [llm-wiki/references/aftertaste-implementation-backlog.md](./aftertaste-implementation-backlog.md)

**Recommended contract additions**

- add an acquisition surface that makes access mode inspectable instead of implicit:
  - `CaptureAcquisitionMode = "source-link" | "official-api" | "user-upload" | "manual-transcript" | "best-effort-extractor" | "unavailable"`
  - `CaptureAcquisitionStatus = "pending" | "ok" | "partial" | "unavailable" | "error"`
- add a provider field so the system can distinguish official access from third-party extraction:
  - `CaptureAcquisitionProvider = "meta" | "apify" | "manual" | "local-upload" | "unknown"`
- add a small acquisition block either on `CaptureRecord` or on a future `media-analysis.json` provenance object:
  - `mode`
  - `status`
  - `provider`
  - `acquiredAt`
  - `notes`
- keep transcript provenance and media-analysis provenance separate so "we got text" is not conflated with "we understood the video"

**Behavior**

- treat `instagram.com/reel/...` URLs as source pointers, not guaranteed ingestable assets
- support two first-class Reel paths:
  1. managed-account Reel access through official Meta surfaces for the creator's own professional account
  2. public reference Reel capture through URL + note, with optional user-uploaded media file
- do not use Instagram oEmbed as an analysis or persistence path; it is for embedding, not archive enrichment
- if a Reel URL has no acquired media bytes and no transcript artifact, analysis stays metadata-plus-note driven and records that gap explicitly
- any unofficial extractor path must be:
  - optional
  - non-blocking
  - clearly marked as lower-reliability provenance
  - never the only supported path for core product behavior
- rich media understanding providers only run after media bytes are actually available

**Recommended internal adapter seam**

```ts
interface ReelAcquirer {
  name: "meta" | "apify" | "manual" | "local-upload";
  canAcquire(input: {
    sourceUrl: string;
    platform: string;
    sourceKind: SourceKind;
  }): boolean;
  acquire(input: {
    captureId: string;
    sourceUrl: string;
    assets: CaptureAsset[];
  }): Promise<{
    acquisition: CaptureAcquisitionRecord;
    transcriptArtifact?: TranscriptArtifact | null;
    mediaFileUrl?: string | null;
    mediaAnalysis?: MediaAnalysisArtifact | null;
  }>;
}
```

**Fallback behavior**

- `MetaReelAcquirer` should only run for authenticated, managed professional-account access.
- `ApifyReelAcquirer` should run only as a best-effort public Reel acquisition path and should never be required for capture success.
- if `ApifyReelAcquirer` fails:
  - keep the capture
  - write acquisition status as `unavailable` or `error`
  - preserve the URL, note, and saved reason
  - do not block compile or idea generation
- if the user uploads the Reel media manually later, that should supersede prior best-effort acquisition status and promote the capture into the higher-trust `user-upload` path
- `Twelve Labs` or `Gemini` should only run once one of these is true:
  - a local uploaded media asset exists
  - an official provider returned durable video bytes
  - a best-effort extractor returned usable video bytes and acquisition provenance records that fact

**Acceptance criteria**

- the app can distinguish "saved a Reel URL" from "acquired media for understanding"
- transcript and media analysis artifacts expose how the content was acquired
- a public Reel URL with no upload still produces fallback analysis without pretending the video was parsed
- a user-uploaded Reel export can flow into transcript and later media-analysis adapters without reshaping vault artifacts
- the repo contains no product language implying arbitrary public Reel parsing is reliable by default

## Transcript And Media Interface Notes

- `POST /api/captures/:id/analyze` becomes the enrichment orchestrator for:
  - source transcript retrieval
  - uploaded audio transcription
  - artifact persistence
  - final analysis generation
- `CaptureRecord` should expose artifact paths or artifact status in a typed way
- `AnalysisResult.transcript` stays, but it becomes artifact-backed rather than metadata-stitched by default
- transcript status and provenance should be tracked separately from `metadata.status`
- capture create should remain fast and local-first; enrichment happens later during analyze

## Instagram Reel Strategy

- The Reel strategy should separate:
  - reference capture
  - media acquisition
  - transcript extraction
  - deeper media understanding
- Official Meta integrations should be treated as an owned-media path for authenticated professional accounts, not as a general public-Reel parser.
- Instagram oEmbed should only be treated as a display/embed surface, not a source for archive enrichment, extraction, analytics, or persistence.
- For arbitrary public Reels, the dependable path is:
  - save the URL
  - save the note and saved reason
  - optionally upload the media file or paste a transcript later
- If Aftertaste later experiments with non-official extractors, those should remain optional adapters with lower-trust provenance and should never become a hidden requirement for core product success.

## Media Provider Roles

- `OpenAI`
  - first-pass speech transcription provider for uploaded audio or video where spoken words are the main need
  - best fit for AT-114 and the initial transcript-first branch
- `AssemblyAI`
  - alternative speech-first provider if stronger transcript metadata, utterances, chapters, or topic extraction become more important than provider consolidation
- `Google Gemini / Vertex AI`
  - general multimodal analyst once video bytes are available
  - good fit for prompt-shaped questions, timestamp-oriented prompts, and one-off analysis against uploaded clips
- `Twelve Labs`
  - strongest fit when Aftertaste needs video-native understanding across a library of short-form references
  - use for `media-analysis.json`, searchable moments, visual motif extraction, pacing patterns, and cross-video retrieval after transcript-first work proves useful
- `AWS Rekognition`
  - lower-level computer-vision utility for labels, OCR/text, faces, people, and moderation
  - useful as a narrower signal source, not as the main creative understanding layer

## Transcript And Media Acceptance Scenarios

- a YouTube capture with transcript available writes `transcript.json` and analysis uses spoken content
- a podcast URL with transcript-friendly page or RSS writes `transcript.json`
- uploaded audio with provider configured writes a transcript artifact and shifts analysis toward actual words
- an unsupported URL records a clean transcript status and still produces fallback analysis
- an Instagram Reel URL with no acquired media bytes remains a reference capture and records an acquisition gap explicitly
- an Instagram Reel with a user-uploaded media file can later feed provider-backed `transcript.json` and `media-analysis.json` artifacts
- missing provider config still produces fallback analysis without throwing
- idea generation uses transcript-derived context while preserving `[YOUR LINE: ...]`, `[YOUR MOMENT: ...]`, and citations
- compile and provenance surfaces can trace transcript-backed analysis to file paths

## Transcript And Media Assumptions

- the first branch does not include deep video or frame-level understanding
- OpenAI is the only implemented transcription provider in the first pass, but the artifact and service seams should stay adapter-friendly
- manual transcript paste is not a first-class UI project in this backlog update; if added later it should write the same `transcript.json` shape
- official Instagram support should be treated as a managed-account path, not proof that arbitrary public Reels can be parsed reliably
- public Reel understanding should assume user-uploaded media unless a later adapter proves otherwise
- no hosted sync or cloud storage is introduced; transcript and media outputs remain file-backed in the local vault

## Suggested Delivery Sequence

### Sprint 1

- [x] AT-101 Make The Compile Pipeline Explicit
- [x] AT-102 Make Catalyst Generation Real
- [x] AT-103 Compute Related References At Compile Time

### Sprint 2

- [x] AT-104 Add A Derived Query Index
- [x] AT-113 Compile A First-Class Taste Graph
- [x] AT-105 Add Provenance And Contradiction Fields To Compiled Outputs
- [x] AT-106 Add Project Brief Persistence

### Sprint 3

- [x] AT-107 Add Creative Session File-Back
- [x] AT-108 Introduce Typed LLM Idea Planning
- [x] AT-109 Build The Real Generation Context

### Sprint 4

- [x] AT-110 Upgrade Idea Studio To Match The New Flow
- [x] AT-111 Add File-Backed Extraction Artifacts
- [x] AT-112 Retrieve Source Transcripts For Supported Links
- [x] AT-114 Add Uploaded Audio Transcription Via OpenAI
- [x] AT-118 Extract Article Body Text For Web Captures
- [x] AT-115 Make Analysis And Ideas Consume Real Transcript Text
- [x] AT-116 Defer Rich Video Understanding Behind An Adapter Seam

### Sprint 5

- [x] AT-117 Formalize Instagram Reel Ingestion And Acquisition Provenance

## Research Update: What Actually Comes Next

The multimodal research changes the backlog in one important way:

- the next phase is **not** "fetch more transcript text"
- the next phase is **artifact quality and grounding**
- the repo already has the transcript-first spine
- what it lacks is:
  - explicit acquisition-policy handling
  - versioned provider receipts
  - stronger timestamped segment normalization
  - a real provider-backed media-analysis adapter
  - retrieval over grounded multimodal moments instead of only page-level summaries

In other words, the right next branch is:

1. make acquisition and provider outputs inspectable
2. normalize moments/timestamps into reusable artifacts
3. add one serious media provider behind the current adapter seam
4. compile/query those grounded moments without breaking the local-first vault model

## New Post-V1 Tickets

### AT-119: Version Artifact Generations And Provider Receipts

**Priority**

- P1

**Goal**

- make `transcript.json` and `media-analysis.json` durable across provider changes instead of silently overwriting one opaque latest result

**Why now**

- the current artifact paths are correct, but the research makes the operational risk clear:
  provider/model behavior changes over time, and Aftertaste needs inspectable receipts for re-compile, audit, and provider swaps

**Files**

- [web/shared/contracts.ts](../../web/shared/contracts.ts)
- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts)
- [web/server/aftertaste/media-analysis.ts](../../web/server/aftertaste/media-analysis.ts)
- [web/server/aftertaste/service.test.ts](../../web/server/aftertaste/service.test.ts)

**Implementation**

- add versioning metadata to transcript and media artifacts:
  - provider id
  - provider model
  - artifact schema version
  - input fingerprint / source hash placeholder
  - generatedAt
- stop treating the artifact file as "just the current value"
- either:
  - keep `transcript.json` and `media-analysis.json` as the latest pointer plus a `history/` directory
  - or add a `generationId` + append-only generation log in the same capture folder
- record enough receipt data to answer:
  - what bytes/text were analyzed
  - which provider/model produced this output
  - whether a later re-run superseded it

**Acceptance criteria**

- provider/model changes do not destroy prior artifact provenance
- artifact generations are comparable in tests
- compile can still read a stable "current artifact" path without learning provider-specific logic

### AT-120: Add An Explicit Acquisition Adapter Ladder

**Priority**

- P1

**Goal**

- turn media acquisition into a first-class adapter seam instead of scattered per-platform conditionals

**Why now**

- the research reinforces that the main multimodal bottleneck is lawful, reliable acquisition, not downstream summarization

**Files**

- [web/shared/contracts.ts](../../web/shared/contracts.ts)
- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts)
- [web/server/routes/aftertaste.ts](../../web/server/routes/aftertaste.ts)
- [web/server/aftertaste/service.test.ts](../../web/server/aftertaste/service.test.ts)

**Implementation**

- formalize acquisition attempts as ordered adapters:
  - source-link only
  - official-api
  - user-upload
  - manual transcript / pasted text
  - best-effort extractor
- persist an acquisition attempt log per capture, not just the latest status summary
- make "user-provided artifacts" a first-class path, especially for Reels/TikToks
- keep all unofficial extraction explicitly optional and non-blocking
- expose enough state for the UI to show:
  - what the app actually acquired
  - what remains missing
  - whether deeper analysis is eligible yet

**Acceptance criteria**

- capture detail can distinguish URL-only, metadata-only, transcript-backed, and byte-backed states
- failed best-effort extraction never blocks capture or compile
- a later manual upload can upgrade the same capture into a higher-trust acquisition state

### AT-121: Normalize Timestamped Segments Into Reusable Moment Artifacts

**Priority**

- P1

**Goal**

- promote transcript segments and media moments into a shared, queryable timeline shape

**Why now**

- the current contracts already have `segments` and `moments`, but they are still provider-specific and too shallow for grounded retrieval

**Files**

- [web/shared/contracts.ts](../../web/shared/contracts.ts)
- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts)
- [web/server/aftertaste/media-analysis.ts](../../web/server/aftertaste/media-analysis.ts)
- [web/server/aftertaste/service.test.ts](../../web/server/aftertaste/service.test.ts)

**Implementation**

- define a normalized moment/timeline contract that can absorb:
  - transcript segments
  - speaker turns
  - chapter-like sections
  - visual beats
  - audio events
- preserve provider-specific raw detail, but compile into one stable shape for Aftertaste:
  - `id`
  - `captureId`
  - `kind`
  - `label`
  - `summary`
  - `startMs`
  - `endMs`
  - `speaker?`
  - `signalTags`
  - `evidence`
- derive `ReferenceSummary.moments` from this normalized layer rather than directly from ad hoc analysis helpers
- keep it file-backed under `raw/media/<captureId>/`

**Acceptance criteria**

- one capture can expose multiple grounded moments with timestamps
- transcript-backed and media-backed moments share a common shape
- later providers can add detail without changing downstream compile behavior

### AT-122: Add A Real Speech Adapter Interface Beyond The OpenAI Happy Path

**Priority**

- P2

**Goal**

- keep the current OpenAI path, but stop making it the only route to stronger timing and speaker structure

**Why now**

- the research points to a clean fork:
  local-first STT for privacy/cost control or managed STT for faster iteration
- Aftertaste needs the seam before it picks the next provider

**Files**

- [web/server/aftertaste/llm.ts](../../web/server/aftertaste/llm.ts)
- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts)
- [web/shared/contracts.ts](../../web/shared/contracts.ts)
- [web/server/aftertaste/service.test.ts](../../web/server/aftertaste/service.test.ts)

**Implementation**

- extract audio transcription behind a provider interface
- keep the current OpenAI transcription adapter
- add room for:
  - local Whisper / WhisperX worker
  - AssemblyAI or equivalent managed STT
- map all providers into the same transcript artifact contract
- preserve graceful fallback when no provider is configured

**Acceptance criteria**

- transcription provider choice does not leak into compile or idea generation
- stronger providers can add word timings / speaker labels without reshaping the vault
- missing provider config still falls back cleanly

### AT-123: Ship The First Provider-Backed Media Analysis Adapter

**Priority**

- P2

**Goal**

- replace heuristic-only media understanding with one real adapter for captures that actually have video bytes

**Why now**

- the current `media-analysis.ts` seam is correct, but still intentionally shallow
- the research strongly supports a provider-backed path only after byte acquisition is real and inspectable

**Files**

- [web/server/aftertaste/media-analysis.ts](../../web/server/aftertaste/media-analysis.ts)
- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts)
- [web/shared/contracts.ts](../../web/shared/contracts.ts)
- [web/server/aftertaste/service.test.ts](../../web/server/aftertaste/service.test.ts)

**Implementation**

- add one production adapter behind the existing seam:
  - preferred library-scale path: `twelve-labs`
  - acceptable prompt-shaped path: `gemini`
- only run this adapter when durable media bytes exist
- persist:
  - provider id
  - model/version
  - returned moments
  - returned visual/audio/story signals
  - provider receipt ids needed for later refresh/reindex
- keep the current heuristic adapter as fallback
- do not imply frame-level understanding when the provider path did not run

**Acceptance criteria**

- byte-backed video captures can produce non-heuristic `media-analysis.json`
- output includes timestamped moments and provider provenance
- captures without media bytes still stay on the current shallow fallback path

### AT-124: Compile And Query Grounded Multimodal Moments

**Priority**

- P2

**Goal**

- let retrieval operate on grounded moments, not only whole-reference summaries

**Why now**

- the research makes the next value step obvious:
  creators want "the clip where this feeling or pacing move happens," not just "references vaguely like this one"

**Files**

- [web/shared/contracts.ts](../../web/shared/contracts.ts)
- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts)
- [web/server/routes/aftertaste.ts](../../web/server/routes/aftertaste.ts)
- [web/client/main.ts](../../web/client/main.ts)
- [web/client/studio.ts](../../web/client/studio.ts)
- [web/server/aftertaste/service.test.ts](../../web/server/aftertaste/service.test.ts)

**Implementation**

- compile grounded moments into:
  - query-index entries
  - taste-graph nodes or evidence
  - related-reference explanations
- add query support for:
  - visual signal
  - audio signal
  - story beat
  - time-bounded moment labels
- surface top moments in Reference Explorer and Idea Studio citations
- keep markdown canonical; do not invent a second hidden database as source of truth

**Acceptance criteria**

- a query can return relevant moments, not only references
- citations in idea generation can point to grounded moments when available
- graph and retrieval outputs remain fully derivable from vault artifacts

## Best First Move

If only one concrete branch should start now, it should be:

1. AT-119
2. AT-120
3. AT-121
4. AT-123

That sequence creates the smallest durable multimodal base for everything else:

- it keeps the local-first artifact model intact,
- it avoids over-investing in provider output before acquisition state is trustworthy,
- it gives later STT and video providers a stable target shape,
- and it upgrades retrieval with grounded evidence instead of generic multimodal claims.

## Not In Scope

- hosted sync
- auth or user accounts
- billing
- mobile shell
- Instagram saved-post sync
- arbitrary public Instagram Reel scraping as a required product dependency
- team collaboration
- opaque vector-only retrieval with no file-backed artifact

## Implementation Note

Do not treat "multimodal" as "turn on more model calls."

The correct order is:

- formalize acquisition policy first,
- then version provider-backed artifacts,
- then normalize moments/timelines,
- then add one serious speech or video provider behind the existing seams,
- then compile/query grounded moments.

Otherwise Aftertaste will claim richer understanding while still running on weak acquisition and non-comparable artifacts.
