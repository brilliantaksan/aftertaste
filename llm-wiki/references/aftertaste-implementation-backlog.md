# Aftertaste Implementation Backlog

## Purpose

This is the execution layer for [aftertaste-architecture.md](./aftertaste-architecture.md).

It converts the architecture into:

- prioritized milestones,
- concrete tickets,
- exact file-level change targets,
- contract changes,
- acceptance criteria.

This backlog is written against the current repo state on **April 12, 2026**.

## Current Starting Point

The current product already has the right loop:

- capture creation in [service.ts](../../web/server/aftertaste/service.ts#L83)
- rule-based analysis in [service.ts](../../web/server/aftertaste/service.ts#L207)
- compile into references, snapshot, constitution, not-me, and wiki pages in [service.ts](../../web/server/aftertaste/service.ts#L264)
- heuristic idea generation in [service.ts](../../web/server/aftertaste/service.ts#L1163)
- three surface shells in [main.ts](../../web/client/main.ts#L211)

What is missing is not basic plumbing. What is missing is:

- a catalyst layer,
- project briefs,
- related-reference retrieval,
- richer snapshot structure,
- real LLM-backed idea generation,
- a stronger reference explorer.

## Priority Order

### P0: Stabilize the data model and compile pipeline

Reason:

- everything else depends on stronger contracts and cleaner compile boundaries

### P1: Add catalysts and related-reference retrieval

Reason:

- this upgrades both the Snapshot and Reference Explorer surfaces
- it also improves idea generation context later

### P2: Add briefs and real LLM-backed Idea Studio

Reason:

- this is the highest-value product gap
- AGENTS already identifies real idea generation as the top missing capability

### P3: Upgrade the Reference Explorer and richer analysis

Reason:

- once the catalyst and idea layers exist, the explorer becomes a much stronger surface
- richer media analysis should be layered onto stable downstream contracts

## Milestone Map

| Milestone | Goal | Blocks | Surfaces affected |
|---|---|---|---|
| M0 | Contract pass + compile refactor | nothing | all |
| M1 | Catalyst generation + related refs | M0 | Snapshot, Reference Explorer, Idea Studio |
| M2 | Project briefs + LLM idea generation | M0, M1 recommended | Idea Studio |
| M3 | Reference Explorer upgrade + richer analysis | M1 | Reference Explorer, Snapshot |

## Exact Contract Changes

These are the required shared contract changes before deeper work starts.

### `web/shared/contracts.ts`

Add:

```ts
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

export interface RelatedReferencesResponse {
  referenceId: string;
  related: ReferenceSummary[];
  catalysts: CatalystRecord[];
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

export interface BriefCreateRequest {
  title: string;
  mode: "personal" | "client";
  deliverableType: "hooks" | "script" | "shotlist" | "concept";
  goal: string;
  audience?: string;
  constraints?: string[];
  selectedReferenceIds?: string[];
}
```

Extend:

```ts
export interface CaptureRecord {
  sourceKind: SourceKind;
  savedReason: string | null;
  collection: string | null;
  projectIds: string[];
}

export interface AnalysisResult {
  toneSignals: SignalTag[];
  visualSignals: SignalTag[];
  audioSignals: SignalTag[];
  pacingSignals: SignalTag[];
  storySignals: SignalTag[];
  openQuestions: string[];
  moments: Array<{ label: string; description: string; assetId?: string }>;
}

export interface ReferenceSummary {
  relatedReferenceIds: string[];
  bestUseCases: string[];
  doNotCopy: string[];
  emotionalTone: string[];
  thumbnailAssetId: string | null;
}

export interface TasteSnapshot {
  tensions: Array<{ label: string; summary: string; referenceIds: string[] }>;
  underexploredDirections: string[];
  antiSignals: string[];
  activeProjects: string[];
}

export interface IdeaRequest {
  briefId?: string | null;
}
```

## Tickets

### AT-001: Extend Shared Contracts

**Priority**

- P0

**Goal**

- strengthen the shared data model without changing product behavior yet

**Files to change**

- [web/shared/contracts.ts](../../web/shared/contracts.ts#L1)
- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts#L1)
- [web/server/routes/aftertaste.ts](../../web/server/routes/aftertaste.ts#L1)
- [web/client/main.ts](../../web/client/main.ts#L1)
- [web/server/aftertaste/service.test.ts](../../web/server/aftertaste/service.test.ts#L1)

**Exact changes**

- add `SourceKind`, `CatalystRecord`, `RelatedReferencesResponse`, `ProjectBrief`, `BriefCreateRequest`
- extend `CaptureRecord`, `AnalysisResult`, `ReferenceSummary`, `TasteSnapshot`, `IdeaRequest`
- make new fields optional only where required for backward compatibility during migration
- update service return shapes and test fixtures so the app still renders

**Acceptance criteria**

- `npm test` passes
- `npm exec tsc -- --noEmit` passes
- no current route returns a contract shape that violates TypeScript

### AT-002: Split The Compile Pipeline

**Priority**

- P0

**Goal**

- break the current monolithic compile path into smaller units

**Files to change**

- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts#L264)
- [web/server/aftertaste/service.test.ts](../../web/server/aftertaste/service.test.ts#L1)

**New internal functions**

- `compileReferences(root)`
- `compileAggregates(root, references)`
- `compileCatalysts(root, references, snapshot)`
- `compileAftertaste(root)` becomes orchestration only

**Exact changes**

- move per-reference page writes out of `compileAftertaste()`
- move snapshot/style/not-me/index writes into a dedicated aggregate compile pass
- add `outputs/catalysts/` and `outputs/briefs/` to workspace setup

**Acceptance criteria**

- compile output remains identical for current fields
- `compileAftertaste()` becomes short orchestration logic
- future catalyst generation can run without touching reference page build logic

### AT-003: Generate Catalysts

**Priority**

- P1

**Goal**

- add a precomputed thematic retrieval layer over the compiled archive

**Files to change**

- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts#L810)
- [web/shared/contracts.ts](../../web/shared/contracts.ts#L1)
- [web/server/aftertaste/service.test.ts](../../web/server/aftertaste/service.test.ts#L1)

**Writes**

- `outputs/catalysts/*.json`

**Exact changes**

- build catalysts from:
  - top themes
  - top motifs
  - creator patterns
  - repeated theme + motif combinations
  - snapshot tensions
- each catalyst gets:
  - `queryHandles`
  - `referenceIds`
  - `relatedIds`
  - short summary
- keep the first implementation deterministic and file-backed

**Acceptance criteria**

- each non-trivial vault compile produces at least 3 catalyst files
- catalyst files are stable across repeated compiles with unchanged input
- tests verify reference ids and related ids are deterministic

### AT-004: Add Related References Service + API

**Priority**

- P1

**Goal**

- expose useful "what rhymes with this?" retrieval to the app

**Files to change**

- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts#L1)
- [web/server/routes/aftertaste.ts](../../web/server/routes/aftertaste.ts#L1)
- [web/server/index.ts](../../web/server/index.ts#L1)
- [web/shared/contracts.ts](../../web/shared/contracts.ts#L1)
- [web/server/aftertaste/service.test.ts](../../web/server/aftertaste/service.test.ts#L1)

**New API**

- `GET /api/references/:id/related`

**Service function**

- `getRelatedReferences(root, id): RelatedReferencesResponse`

**Ranking logic**

- overlap in catalyst membership
- overlap in themes/motifs/creators/formats
- recency as a minor tiebreaker
- exclude self

**Acceptance criteria**

- every reference detail can return a ranked list of related references
- route returns 404 for missing ids
- tests verify obvious similar references rank above unrelated ones

### AT-005: Enrich Snapshot Structure

**Priority**

- P1

**Goal**

- make Snapshot a stronger product surface, not just a summary blob

**Files to change**

- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts#L810)
- [web/client/main.ts](../../web/client/main.ts#L211)
- [web/client/styles.css](../../web/client/styles.css#L1)
- [web/shared/contracts.ts](../../web/shared/contracts.ts#L1)

**Exact changes**

- add snapshot `tensions`
- add `underexploredDirections`
- add `antiSignals`
- display them in the home view
- add buttons that route tension and prompt seed context directly into Idea Studio

**Acceptance criteria**

- home view shows at least one extra structural layer beyond themes/motifs/patterns
- prompt seeds still work
- snapshot remains readable with sparse vault data

### AT-006: Add Project Brief Storage

**Priority**

- P2

**Goal**

- let Idea Studio work from explicit project context instead of only a freeform brief textarea

**Files to change**

- [web/shared/contracts.ts](../../web/shared/contracts.ts#L1)
- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts#L1)
- [web/server/routes/aftertaste.ts](../../web/server/routes/aftertaste.ts#L1)
- [web/server/index.ts](../../web/server/index.ts#L1)
- [web/client/main.ts](../../web/client/main.ts#L620)
- [web/client/styles.css](../../web/client/styles.css#L1)
- [web/server/aftertaste/service.test.ts](../../web/server/aftertaste/service.test.ts#L1)

**New APIs**

- `POST /api/briefs`
- `GET /api/briefs/:id`
- optional later: `GET /api/briefs`

**Writes**

- `outputs/briefs/<id>.json`

**Exact changes**

- create and persist `ProjectBrief`
- let Idea Studio create a brief inline
- store selected references and delivery mode with the brief
- add `briefId` to `IdeaRequest`

**Acceptance criteria**

- a brief can be created and reused for multiple generations
- brief creation does not break current freeform idea generation
- tests verify persistence and retrieval

### AT-007: Introduce LLM Provider Abstraction For Ideas

**Priority**

- P2

**Goal**

- replace heuristic-only `buildIdeas()` with a real model-backed implementation while preserving guardrails

**Files to change**

- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts#L1163)
- [AGENTS.md](../../AGENTS.md#L1)
- [local-vault/CLAUDE.md](../../local-vault/CLAUDE.md#L1)
- [web/server/aftertaste/service.test.ts](../../web/server/aftertaste/service.test.ts#L1)

**New file recommended**

- `web/server/aftertaste/llm.ts`

**Recommended module responsibilities**

- `buildIdeaPrompt(context)`
- `generateIdeaDrafts(providerConfig, prompt)`
- `parseIdeaResponse(json)`

**Prompt must include**

- voice-first rule
- personal-line placeholder rule
- exploratory-language rule
- citation requirement
- max-3-options rule

**Fallback**

- keep current heuristic generation as fallback when provider config is absent

**Acceptance criteria**

- with provider config absent, the app still works
- with provider config present, idea outputs come from the model
- outputs still contain citations and `personalMoments`
- no output exceeds 3 variants

### AT-008: Use Catalysts + Constitution + Not-Me In Idea Generation

**Priority**

- P2

**Goal**

- make Idea Studio generation use the compiled taste memory, not just the current snapshot summary

**Files to change**

- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts#L318)
- [web/server/aftertaste/llm.ts](../../web/server/aftertaste/llm.ts#L1)
- [web/server/aftertaste/service.test.ts](../../web/server/aftertaste/service.test.ts#L1)

**Exact changes**

- build a generation context object from:
  - `TasteSnapshot`
  - selected `ReferenceSummary` items
  - matching catalysts
  - `style-constitution.md`
  - `not-me.md`
  - optional `ProjectBrief`
- expand the user's brief into multiple retrieval angles before generation
- pass the context object into the LLM prompt builder

**Acceptance criteria**

- generation changes when selected references change
- generation changes when `not-me.md` adds a strong boundary
- tests verify returned citations come from selected references or their near catalyst matches

### AT-009: Upgrade Idea Studio UI

**Priority**

- P2

**Goal**

- make the Idea Studio feel like a real working surface, not just a submit form

**Files to change**

- [web/client/main.ts](../../web/client/main.ts#L620)
- [web/client/styles.css](../../web/client/styles.css#L1)
- [web/shared/contracts.ts](../../web/shared/contracts.ts#L1)

**Exact changes**

- add brief picker / brief builder
- show active constitution cues and not-me warnings
- show citations as clickable reference pills
- render personal placeholders more prominently
- show rationale and selected anchors more clearly

**Acceptance criteria**

- user can see which references drove each output
- user can tell which lines they still need to write themselves
- user can regenerate from a brief without leaving the screen

### AT-010: Upgrade Reference Explorer UI

**Priority**

- P3

**Goal**

- make the reference detail surface into an active memory browser

**Files to change**

- [web/client/main.ts](../../web/client/main.ts#L519)
- [web/client/styles.css](../../web/client/styles.css#L1)
- [web/server/routes/aftertaste.ts](../../web/server/routes/aftertaste.ts#L1)
- [web/shared/contracts.ts](../../web/shared/contracts.ts#L1)

**Exact changes**

- fetch and display related references
- add `bestUseCases`
- add `doNotCopy`
- add emotional tone display
- expose direct audit affordances like:
  - wrong theme
  - wrong motif
  - not my style
  - useful reference, wrong summary

**Acceptance criteria**

- each reference detail shows related references without opening Studio
- user can move from one reference to another by similarity, not only by filter
- audit action is reachable from the explorer surface

### AT-011: Add Richer Analysis Fields

**Priority**

- P3

**Goal**

- upgrade analysis quality without breaking downstream consumers

**Files to change**

- [web/server/aftertaste/service.ts](../../web/server/aftertaste/service.ts#L207)
- [web/shared/contracts.ts](../../web/shared/contracts.ts#L1)
- [web/server/aftertaste/service.test.ts](../../web/server/aftertaste/service.test.ts#L1)

**New file recommended**

- `web/server/aftertaste/media-analysis.ts`

**Exact changes**

- add `toneSignals`, `visualSignals`, `audioSignals`, `pacingSignals`, `storySignals`
- add `moments[]`
- keep the first implementation hybrid:
  - deterministic rules where possible
  - provider hooks for richer media analysis later

**Acceptance criteria**

- compile still works on text-only captures
- richer fields appear when media exists
- tests cover both text-only and upload-backed captures

## Suggested Delivery Sequence

### Week 1

- AT-001
- AT-002

### Week 2

- AT-003
- AT-004
- AT-005

### Week 3

- AT-006
- AT-007
- AT-008

### Week 4

- AT-009
- AT-010
- AT-011

## Minimum Acceptance For “Aftertaste v0.2”

Do not call the next meaningful version done until all of these are true:

- Idea Studio can run with a real LLM provider and still preserve personal placeholders
- the app has a catalyst-backed related-reference path
- the snapshot shows tensions or underexplored directions, not just themes
- a project brief can be saved and reused
- every generated idea cites references

## Not In Scope For This Backlog

- hosted sync
- auth or accounts
- billing
- mobile shell
- Instagram saved-post sync
- team collaboration
- opaque vector-only retrieval with no file-backed artifact

## First Ticket To Start With

If you want the cleanest next engineering move, start with:

1. `AT-001 Extend Shared Contracts`
2. `AT-002 Split The Compile Pipeline`

That unlocks nearly everything else without committing to a provider or UI direction too early.
