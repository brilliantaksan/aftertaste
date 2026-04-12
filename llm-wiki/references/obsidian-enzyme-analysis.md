# Obsidian Enzyme Analysis for Aftertaste

## Thesis

`obsidian-enzyme` feels stronger than most "LLM for notes" products because it is not trying to be a general chatbot. It is a tightly-scoped workflow that:

1. precomputes semantic structure before query time,
2. expands one prompt into multiple retrieval angles,
3. turns search results into a sequenced, clickable digest,
4. delivers that digest inside the exact note where the user is already thinking.

That combination makes it feel less like "ask AI about my vault" and more like "my past thinking is present in the room."

For Aftertaste, the important lesson is not "build an Obsidian plugin." The lesson is:

**compile taste into a durable, navigable artifact, then use that artifact to produce creator-native outputs at the moment of creative work.**

That lines up closely with Andrej Karpathy's LLM Wiki framing and Farza's Farzapedia framing.

## What the project actually is

At the code level, this is a thin Obsidian bridge over a heavier retrieval engine:

- The plugin registers an `enzyme-digest` markdown code block and an insert command.
- It parses a `prompt` and `freq` from the block.
- It asks an LLM to generate multiple semantic queries from that one prompt.
- It runs those queries against the native `enzyme` CLI in parallel.
- It deduplicates and trims the result pool.
- It asks an LLM to weave the pool into a digest with excerpts, chronology, attribution, and pointed follow-up probes.
- It renders the digest directly in the note, with clickable links back to source notes.

This means the plugin is not the core innovation. The plugin is the last-mile UX.

## Why it feels so good

### 1. It solves the right problem

It is not built for factual lookup. It is built for resurfacing latent threads across a long-running corpus.

That is a much better match for creative and reflective work, because the valuable question is rarely:

- "Which note mentions X?"

It is more often:

- "What have I been circling?"
- "Which old references rhyme with this idea?"
- "What contradiction in my past work should shape this draft?"

This is exactly the kind of problem Karpathy and Farza are pointing at: accumulated context is most useful when it becomes structured and revisitable, not when it is rediscovered from scratch on every question.

### 2. It uses preprocessing instead of cold-start retrieval

Enzyme's core argument is that standard RAG has a ceiling for personal knowledge because query-time chunk retrieval is too flat. Enzyme adds a precomputed thematic layer called "catalysts" between the query and the documents.

This matters because it lets the system retrieve by idea neighborhood, not only direct semantic similarity. In other words:

- RAG searches for passages.
- Enzyme searches for patterns.

That distinction is one of the most important lessons for Aftertaste. Taste is not mostly about exact-match retrieval. It is about pattern recurrence across creators, visuals, moods, phrases, and motifs.

### 3. It turns retrieval into an editorial product

Most note-AI products stop after retrieval and show a pile of chunks.

Enzyme goes one step further and converts the pool into an editorial sequence:

- a short intro that names the pattern,
- a time-ordered set of excerpts,
- explicit source labels,
- external-vs-internal distinction,
- a specific probe after each excerpt.

That makes the output useful. The plugin is not just finding things. It is staging them.

For creative work, staging matters. A creator does not want ten vaguely relevant clips or notes. They want:

- the thread,
- the resonance,
- the tension,
- the next move.

### 4. The prompt design is unusually opinionated

The project does not handwave prompt quality.

It explicitly instructs the query generator to search across different registers:

- concrete/sensory,
- social/relational,
- temporal/process,
- systemic/structural,
- existential/philosophical.

Then it explicitly instructs the digest weaver not to ask generic abstract questions and instead produce pointed probes tied to concrete tensions.

That is a big reason the product feels intelligent. The team encoded a worldview about what makes a retrieved connection valuable.

### 5. It keeps internal thinking and external references in the same output

The digest intentionally mixes:

- your own notes,
- imported highlights and saved references.

That is important because creative identity is built from both.

This is especially relevant for Aftertaste, where the creator problem is exactly the fusion of:

- internal signal: diary fragments, voice notes, observations, emotional themes,
- external signal: reels, visual references, edits, hooks, aesthetics, pacing.

Enzyme is strong because it treats imported material as a resonance layer rather than a separate silo.

### 6. It is embedded in the workflow, not added beside it

The output appears as a markdown block in the note itself. It is not a separate chat pane that competes with the writing surface.

This is a subtle but major UX win:

- prompts are saved,
- refresh cadence is saved,
- outputs live near the draft,
- source notes are one click away.

The workflow feels like augmentation of writing, not context-switching into an AI tab.

### 7. The plugin stays thin

The project avoids reimplementing retrieval in TypeScript. It shells out to a native binary and keeps the Obsidian layer focused on:

- setup,
- prompting,
- orchestration,
- rendering.

That architectural restraint is part of why it feels polished. It is opinionated about product experience and unambitious about infrastructure duplication.

## What Enzyme is not

This is important for Aftertaste.

Enzyme is **not** a full Karpathy-style compiled wiki system.

Karpathy's LLM Wiki pattern emphasizes:

- immutable raw sources,
- a generated wiki layer,
- a schema file that teaches the agent how to maintain the wiki,
- `index.md` and `log.md` as first-class navigation primitives.

Farza's Farzapedia is even closer to that pattern:

- the wiki is built for the agent,
- it is crawlable from `index.md`,
- the agent reads files directly instead of relying on traditional RAG,
- new inputs update existing articles and backlinks.

Enzyme is different:

- it works on top of an existing vault,
- it adds a precomputed retrieval layer,
- it creates a digest at query time,
- it does not maintain a persistent encyclopedia of generated pages as its primary abstraction.

So the deepest takeaway is not "pick Karpathy/Farza or Enzyme."

The right answer for Aftertaste is probably:

**Karpathy/Farza for the durable compiled taste artifact, plus Enzyme for the thematic retrieval layer over that artifact and the raw source stream.**

## What Aftertaste should steal directly

### 1. Multi-register query expansion

Do not let one creator prompt map to one retrieval query.

Instead, translate a brief like:

- "help me make a reel about drifting from ambition into softness"

into multiple search angles such as:

- emotional/tone,
- narrative structure,
- visual grammar,
- creator references,
- pacing/edit motifs,
- personal memory resonance.

For Aftertaste, your registers should be creator-native, not note-native. A better register set might be:

- emotional/tone,
- visual language,
- narrative arc,
- social identity,
- craft technique,
- audience effect.

### 2. Digest-style outputs instead of raw results

Do not show users a retrieval dump.

Show:

- a pattern statement,
- a handful of resonant artifacts,
- why each matters,
- the tension across them,
- one actionable next step.

This can become multiple product surfaces:

- taste digest,
- script brief,
- visual mood brief,
- shot list,
- edit notes,
- brand/aesthetic brief.

### 3. Source click-through and inspectability

Every AI claim should be traceable back to the underlying source artifact.

For creators this means clicking from the synthesis back to:

- the saved reel,
- the screenshot,
- the transcript segment,
- the note,
- the inspiration image,
- the voice memo excerpt.

This is essential for trust. Taste products die when they hallucinate your style.

### 4. Internal + external synthesis

Aftertaste should treat a creator's own reflections and their saved inspiration as one graph, not two separate products.

The best prompts should connect:

- "what I feel",
- "what I keep saving",
- "what I keep making",
- "what I say I want to make next."

### 5. Background compilation

The expensive intelligence should happen before the moment of asking.

That means:

- ingest,
- transcribe,
- extract motifs,
- cluster references,
- generate taste catalysts,
- update profile pages,
- precompute similarity.

Then the query experience becomes fast and cheap.

### 6. Output in the work surface

One of Enzyme's strongest ideas is putting the result where the user is already doing the work.

For Aftertaste, the analog is not necessarily markdown blocks. It is:

- a brief panel inside the script editor,
- a taste block inside a project board,
- a reference digest inside a moodboard,
- a "why this reference matters" layer inside a saved-item detail page.

Do not make the user jump to an "AI tab."

### 7. Opinionated probing

Generic prompts kill products like this.

You want the system to push with specificity:

- "You keep saving quiet confession-style openings, but your own drafts escalate too quickly. Do you actually trust slowness?"
- "These three references all delay the thesis until after a sensory image. Your current script announces the message in line one."
- "This creator's cuts feel intimate because the camera distance narrows over time; your saved references suggest you like escalation through proximity, not through faster pacing."

That kind of probe is where the product starts to feel like taste coaching rather than chat.

## What Aftertaste should not copy blindly

### 1. Desktop-only assumptions

Enzyme can rely on:

- local files,
- shelling out to a binary,
- desktop Obsidian,
- user comfort with setup.

That works for power users. It is not a clean fit for a creator-facing consumer product, especially if mobile capture matters.

You can copy the architecture, not the delivery mechanism.

### 2. File-path heuristics

The plugin often infers source type from file paths and filenames. That is acceptable in a personal vault but weak for a product.

Aftertaste should use explicit typed metadata:

- source type,
- creator,
- platform,
- media kind,
- visual motifs,
- emotional tags,
- project relevance,
- ingestion date,
- user annotation,
- "want to emulate" vs "saved for contrast."

### 3. Text-first assumptions

Enzyme is mostly a text retrieval product.

Aftertaste has to handle multimodal taste:

- visuals,
- editing rhythm,
- motion,
- sound,
- captions,
- transcript,
- typography,
- color,
- framing.

So the semantic layer cannot only be text embeddings over note chunks. It needs creator-native descriptors and media-aware analysis.

### 4. One output type

Enzyme's single output form is a digest.

For Aftertaste, digest is only one of several necessary renderings. The same taste graph should also power:

- ideation,
- comparison,
- critique,
- shot planning,
- moodboarding,
- style calibration,
- "not me" filtering.

### 5. Pure resurfacing

Enzyme is about resurfacing older thinking.

Aftertaste should also help a creator make decisions:

- what to save,
- what to ignore,
- what style is becoming overfit,
- what motifs recur too often,
- what references fit a current brief,
- what directions are underexplored.

## The strongest synthesis with Karpathy and Farza

Karpathy's key insight is that the value comes from a persistent artifact, not repeated rediscovery.

Farza's key product insight is that the artifact should be built for the agent first:

- explicit files,
- backlinks,
- crawlable index,
- durable pages about people, projects, inspirations, themes.

Enzyme adds the missing layer:

- precomputed thematic retrieval over the artifact and corpus.

For Aftertaste, the ideal architecture is a hybrid:

### Layer 1: raw source archive

- reel links,
- screenshots,
- clips,
- transcripts,
- captions,
- saved images,
- voice notes,
- journal fragments,
- client briefs.

Immutable.

### Layer 2: compiled taste wiki

Generated pages such as:

- creators,
- themes,
- motifs,
- visual grammar,
- emotional territories,
- recurring formats,
- project-specific style pages,
- anti-taste / not-me pages,
- style constitution,
- current fascinations.

This is the Karpathy/Farza layer.

### Layer 3: catalyst / thematic retrieval layer

Precompute creator-native catalysts such as:

- "confession through indirect imagery"
- "intimacy created by camera stillness"
- "humor used to soften vulnerability"
- "nostalgia as texture, not premise"
- "aspirational but anti-hustle framing"

This is the Enzyme layer.

### Layer 4: creator-native outputs

- taste digest,
- reel concept brief,
- script draft scaffolding,
- visual reference board,
- shot list,
- edit memo,
- weekly taste snapshot.

This is the actual product.

## Product directions I would prioritize for Aftertaste

### 1. Taste Snapshot

A recurring digest that answers:

- what am I circling emotionally?
- what visual language keeps recurring?
- which creators are influencing me this month?
- what is becoming too familiar?
- what is underexplored?

This is the closest analog to Enzyme's current digest and likely the fastest thing to make feel magical.

### 2. Reference-to-brief transformation

Let a creator select:

- a client brief,
- a saved reel,
- a few inspirations,
- one personal note,

and generate:

- a concept direction,
- shot ideas,
- copy angles,
- tone guardrails,
- references worth revisiting.

This is directly in the Farzapedia spirit of using a structured knowledge base to generate landing page aesthetics or creative direction.

### 3. Style Constitution

A slower-changing page that encodes:

- what the creator is actually drawn to,
- what they keep saying yes to,
- what they want to avoid,
- what contradictions define their work.

This is a creator-native version of a persistent wiki page that an agent can consult repeatedly.

### 4. Anti-taste / not-me memory

This is underrated.

Creators do not just need "what I like." They need:

- what I admire but should not imitate,
- what reads as derivative for me,
- what conflicts with the identity I am building,
- what belongs to client work but not personal work.

That can sharply improve output quality.

### 5. Creative probe engine

Instead of generic reflection prompts, build a probe system that compares:

- saved references vs published work,
- current draft vs long-term taste,
- internal themes vs external aesthetic choices.

This can become one of the most defensible parts of Aftertaste.

## A practical MVP sequence

### Phase 1: creator ingestion and compilation

Build:

- share-to-inbox,
- link/screenshot/transcript ingestion,
- per-item metadata extraction,
- initial creator wiki pages.

Do not start with full Instagram saved-post automation.

### Phase 2: taste digest

Build the Enzyme-like product surface:

- one prompt,
- multi-angle retrieval,
- a sequenced digest,
- source click-through,
- one action to convert digest into a script or brief.

### Phase 3: creator-specific outputs

Add:

- script brief,
- shot list,
- moodboard synthesis,
- style critique.

### Phase 4: deeper multimodal retrieval

Only after the above feels useful:

- video embeddings,
- scene-level descriptors,
- transition/shot pattern detection,
- visual similarity search.

## Bottom line

`obsidian-enzyme` is good because it understands that the magic is not "AI + notes." The magic is:

- a preprocessed semantic layer,
- a strong editorial output,
- retrieval that spans internal and external material,
- delivery inside the creator's existing work surface.

Karpathy and Farza point toward durable compiled knowledge artifacts. Enzyme points toward a better retrieval and resurfacing layer over that artifact.

If Aftertaste combines both, it can become more than a bookmarking app or a second brain. It can become a creator's operational taste memory.

## Sources

- https://github.com/jshph/obsidian-enzyme
- https://www.enzyme.garden/blog/enzyme-vs-rag/
- https://www.enzyme.garden/blog/approximate-search-personal-knowledge/
- https://www.enzyme.garden/docs/in-practice/
- https://gist.github.com/karpathy/442a6bf555914893e9891c11519de94f
- https://www.linkedin.com/posts/farza-majeed-76685612a_this-is-farzapedia-i-had-an-llm-take-2500-activity-7446408553596166144-vwS2
