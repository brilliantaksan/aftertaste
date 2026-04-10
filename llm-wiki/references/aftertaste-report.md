# Taste-Led LLM Knowledge Bases for Creators

## The creator problem you’re actually solving

Your idea isn’t “an app that saves Reels better than Instagram.” It’s closer to: **a compounding taste engine**—a place where what you *watch + save + think* gets turned into a durable, queryable creative identity that stays consistent across whichever AI model you use next week. That maps well onto the “LLM Knowledge Base / LLM Wiki” pattern: *raw inputs → compiled wiki → queries and health checks that keep it coherent over time.* citeturn13view0

Creators (especially “journal-ish / cinematic” creators) often have two messy but valuable streams:

- **Internal signal**: freewrites, voice notes, “I felt something today” fragments, relationship thoughts, themes that recur in your week.
- **External signal**: saved Instagram Reels, TikToks, tweets, reference edits, color palettes, transitions, narrative pacing, on-camera presence, hook patterns.

Individually, these are easy to collect but hard to *use* later—because they’re not structured, cross-linked, or searchable as a coherent worldview/style. Karpathy’s key claim is that value comes from **compilation into a persistent artifact** (the wiki), not repeatedly “rediscovering” knowledge from scratch via classic RAG/file-upload workflows. citeturn13view0

What makes your angle “creator-native” is that your **taste stream is multimodal**, time-sensitive, and style-heavy:
- Idea-based videos need *semantic understanding* (what’s being argued, what premise is being built).
- Cinematic/edit-heavy references need *visual grammar understanding* (shot types, transitions, typography, pacing, sound design cues).

A product that turns those into a persistent, explorable “taste graph” can be meaningfully differentiated from (a) generic bookmarking, (b) generic second brains, and (c) generic “chat with my notes.” That differentiation matters because creator tools are already a paid category: e.g., visual inspiration and organization tools like **entity["company","Milanote","visual moodboard app"]** price individual plans around ~$9.99/month billed annually, and “AI bookmarking” tools like **entity["company","mymind","ai bookmarking app"]** are in the ~$7.99–$12.99/month range depending on features. citeturn15search2turn16search0

## The Karpathy pattern and how your repo operationalizes it

Karpathy’s “LLM Wiki” gist is explicit about the core loop and the mental model:

- **Three layers**: raw sources (immutable), wiki (LLM-generated markdown), and a schema/config file that instructs the agent how to behave. citeturn13view0  
- **Operations**: ingest (integrate a new source across the wiki), query (answer questions by navigating wiki pages), and lint/health-check (find contradictions, missing links, gaps, stale claims). citeturn13view0  
- **Key navigational files**: `index.md` as a content catalog and `log.md` as an append-only history of what changed and when. citeturn13view0

The GitHub project you provided (the **brilliantaksan/llm-wiki-skill** repo) is essentially an “agent-ready packaging” of that idea file into a usable skill + conventions + tooling. It includes:
- A **SKILL** document meant to be copied into an agent workflow (Codex/Claude Code-style) and used as the operating manual for maintaining a wiki. fileciteturn7file0L1-L1  
- A **schema and writing guidance** layer (how pages should be structured and written, so the wiki is consistent and navigable). fileciteturn8file0L1-L1  
- **Linting and scaffolding scripts** to standardize structure and detect common failure modes in a growing knowledge base. fileciteturn12file0L1-L1  
- A notable extra that matters a lot for real users: **audit tooling**—human-in-the-loop feedback capture, anchored to specific text spans, so you can correct the wiki precisely and keep it trustworthy over time. fileciteturn10file0L1-L1

That last part (audits) is unusually relevant to your creator use case. “Taste-led” systems are fragile: if the wiki starts making up what you like, or mislabels a style reference, the whole thing becomes unusable. The repo’s anchored-audit format (a selection + contextual anchors + a target file) is built to survive file drift while keeping feedback attached to the right passage. fileciteturn15file0L1-L1

This combination—**file-first, inspectable, and correctable**—is also exactly why Farza’s “Farzapedia” is a compelling proof point: he explicitly frames it as “built for my agent,” crawlable via `index.md`, and qualitatively better than his previous RAG attempt for tasks like generating landing page aesthetics and copy from personal inspiration sources. citeturn2search4

## Feasibility check: can you truly “auto-ingest my saved Instagram Reels”?

This is the crux: your *product dream* wants “the moment I save a Reel, my creator wiki updates.” The current platform reality makes fully automatic ingestion difficult (and in many cases not possible) if you rely on official APIs, especially for consumer accounts.

### Official API reality

Meta’s newer official Instagram APIs are oriented around **professional accounts (Business/Creator)** and specific managed use cases. Meta’s own Postman collections for the Instagram API emphasize limitations like **not accessing consumer (non-Business/non-Creator) accounts**. citeturn9search4turn9search12

Separately, Meta’s deprecation of older consumer-friendly access mechanisms has been widely reported as disruptive to third-party apps that relied on user media import; TechCrunch’s coverage described how shutting down the Basic Display API cut off consumer developer apps and forced services (like journaling apps that imported Instagram content) to discontinue automatic importing. citeturn6search4

Also: multiple developer community threads (Stack Overflow) consistently report **no official API endpoint for a user’s saved posts/collections**, which is exactly what you’d need to mirror Instagram “Saved” into your own system. citeturn10search3turn17search4

### Practical ways around it (and what you should build first)

You *can* still build a great product if you design for realistic ingestion paths:

**Share-to-Inbox (highly feasible, best MVP path)**  
Creators already share links to friends/tools. You can make “Save to your Taste Wiki” a one-tap share target (mobile share sheet). This mirrors how other capture-first products work; for example, **Readwise Reader** explicitly supports saving via mobile share sheets and treats it as a core capture method. citeturn15search5

**Periodic import from Instagram data export (feasible, semi-automated)**  
Instagram/Meta provide a “Download/Export your information” route through Accounts Center, allowing data exports with selectable date ranges and formats (HTML/JSON). citeturn3search0turn10search0  
Some developers report using this export specifically to access “Saved” content/collections indirectly (not guaranteed or stable, but workable as a fallback). citeturn17search4turn10search3

**Browser capture (feasible, but more engineering + fragile)**  
A browser extension can capture the rendered page (thumbnail, caption text, on-screen text via OCR, etc.) when you view a Reel, and store the snapshot as an immutable raw source. This is conceptually similar to how Obsidian’s Web Clipper captures web content into a vault. citeturn14search3

**“True automation the instant you hit Save in Instagram” (not reliably feasible today)**  
Without an official “Saved posts” API, you can’t count on a background sync that notices a newly saved Reel and fetches it. citeturn10search3turn9search4  
So your product should treat Instagram “Save” as *a UI habit to replace*, not a system primitive you depend on.

### Visual understanding feasibility

Even if you get the link into your system, you still need to “understand” the Reel. There are two different technical regimes:

- **Text-first understanding** (cheap, robust): caption + transcript + your note (“why I saved this”) gets you surprisingly far for idea-based content.
- **True multimodal video understanding** (expensive, powerful): embeddings + timestamps + scene-level descriptors.

If you want serious multimodal capability without reinventing video ML, **entity["company","Twelve Labs","video understanding ai company"]** is a strong fit:  
- Their product materials describe a split between an embeddings model (Marengo) and a generative video-to-text model (Pegasus). citeturn12search8turn12search13  
- Their docs state Pegasus supports longer videos (up to ~1 hour) and can generate descriptions with temporal grounding (timestamps). citeturn12search13  
- Their API and SDK ecosystem is designed for developers. citeturn12search7turn12search15  
- Their models are also available via Amazon Bedrock, which can matter later for enterprise positioning and procurement. citeturn12search10  

The big caveat: you still need lawful access to the video bytes (or at least frames/audio) to run analysis. Your ingestion UX should therefore support *multiple artifact types* per saved item: link-only, screenshot bundle, screen recording, downloaded media file, transcript-only, etc.

## A creator-native architecture that stays true to the LLM Wiki philosophy

This section is the “make it your own” part: you’re not building a research wiki; you’re building a **taste wiki** that can output *scripts, hooks, shot lists, editing notes, and moodboards*—and stay consistent across models.

### Core vault structure

Stay aligned with Karpathy’s immutable-raw / generated-wiki separation and the index/log navigation strategy. citeturn13view0  
Use the repo’s skill conventions and tooling as your base operating system. fileciteturn7file0L1-L1

A practical creator-focused vault could look like:

- `raw/inbox/`  
  New captures land here: Reel URLs, exported JSON chunks, screenshots, voice notes, drafts.
- `raw/media/<source_id>/`  
  Optional: frames, audio, transcript, thumbnails, and “capture context” (timestamp, collection name like “Linh”, where you found it).
- `wiki/`  
  **Generated** pages only. No manual edits except via the audit workflow.
  - `wiki/themes/` (e.g., long-distance, identity, ambition, boredom, discipline)
  - `wiki/creators/` (style fingerprints of creators you admire)
  - `wiki/motifs/` (editing rhythms, color palettes, typography, transitions, sound design)
  - `wiki/formats/` (your recurring reel structures: hook → tension → reveal → journal close)
  - `wiki/projects/` (Freelance client references vs personal reels)
- `index.md`  
  Your agent’s navigation entry point, updated every ingest. citeturn13view0
- `log.md`  
  Append-only record of ingests, queries, and lint passes. citeturn13view0
- `audit/` and `audit/resolved/`  
  Human corrections and trust maintenance, using the anchored audit format from your repo tooling. fileciteturn10file0L1-L1

### The creator schema file is the product

Karpathy is direct that the schema/config document is what makes the agent behave like a disciplined maintainer rather than a generic chatbot. citeturn13view0

Your creator schema should define page types and update rules around “taste.” For example:

- Every captured Reel produces a **Reference page** with:
  - what it’s about (semantic)
  - what it feels like (tone)
  - why you saved it (your annotation)
  - what craft elements it demonstrates (motifs)
  - links to related themes/creators/motifs

- Every ingest updates:
  - a weekly “Taste Snapshot” page (what you’re orbiting right now)
  - your long-term “Style Constitution” page (slower-changing: your aesthetic constants)
  - a “Banned / Not-me” page (what you saved but *don’t* want to emulate—useful for clarity)

This is also where you can encode the “two modes” you described:
- **Journal-ish personal reels mode** (thought nuance, narrative, honesty, pacing)
- **Professional cinematic/edit mode** (shot lists, references, color, typography, transitions)

### Obsidian as the front-end you don’t have to build yet

Karpathy explicitly uses Obsidian as the “IDE” for browsing the compiled wiki output. citeturn13view0  
Obsidian’s core plugin set includes **Graph view** and **Canvas** (infinite visual space), which map perfectly to your “graph node structure + visual references” vision. citeturn14search13  
And Obsidian’s official Web Clipper supports capturing web material into the vault, again consistent with the file-first approach. citeturn14search3

That suggests a strong sequencing strategy:
1) Build the vault + ingestion + compilation pipeline first.  
2) Use Obsidian Graph/Canvas as your “v1 UI.”  
3) Only build a custom Gen Z-friendly UI once you’ve proven retention + willingness to pay.

image_group{"layout":"carousel","aspect_ratio":"16:9","query":["Obsidian graph view screenshot","Obsidian Canvas screenshot","Milanote moodboard board screenshot","mymind app grid interface screenshot"],"num_per_query":1}

### Where Twelve Labs fits, concretely

Use Twelve Labs when you actually need multimodal signal:
- Generate **video embeddings** (Marengo) to power “find me things with this vibe” retrieval. citeturn12search8turn12search7  
- Generate **structured descriptions/summaries with timestamps** (Pegasus) so the wiki can cite “the moment where X happens” inside a reference. citeturn12search13turn12search10  

A clean approach that stays true to Karpathy’s “no complicated infra required” claim is:
- Store embeddings/analysis outputs as **files** in `raw/media/<id>/analysis.json` (immutable once written for that ingest run).
- Let the wiki compilation step read those files and incorporate the insights into markdown pages.

If later you outgrow index-only navigation, Karpathy’s gist even calls out “optional CLI tools” (e.g., proper markdown search) as something you can layer in when necessary. citeturn13view0

## A build plan you can execute with Codex and Claude Code

You asked for a plan that works with Codex / Claude Code-style agents. The core principle: **make the agent competent by giving it a stable repo structure, explicit instructions, and safe tool affordances.**

### Agent operating environment

For Codex:
- OpenAI describes using **AGENTS.md** files inside repos to guide Codex on conventions and commands, similar to a repo’s “developer handbook.” citeturn18search1  
- Codex CLI is designed as a local coding agent with approval modes (suggest vs auto-edit vs full auto) so you can choose how much autonomy it has while building. citeturn18search0  

For Claude Code:
- Anthropic’s docs describe connecting tools via **Model Context Protocol (MCP)** and using Claude Code as a client that can call external tools/resources. citeturn19search0turn19search1  

Practical take: treat your vault system as a codebase + data repository, then expose the minimal set of tools needed for safe operations (create file, update file, run lint, run ingest pipeline).

### Milestone sequence designed to de-risk the hardest parts

**Milestone: Creator vault MVP (no Instagram automation yet)**  
Goal: prove the “compiled taste wiki” loop works for you personally.

- Fork/clone your repo and create a `vault/` example that matches your intended structure.
- Use the provided skill + schema guidance to define your creator page taxonomy and write rules (what pages exist, how they link, what the index must contain). fileciteturn7file0L1-L1  
- Wire in scaffold + lint scripts to keep the vault healthy. fileciteturn12file0L1-L1  
- Add the audit loop early (Obsidian plugin / web viewer workflow in your repo) so you can correct mistakes without “rewriting the whole system.” fileciteturn10file0L1-L1  

**Milestone: Capture pipeline MVP (Share-to-Inbox)**  
Goal: one-tap capture into `raw/inbox/` with enough metadata to be useful.

- Implement “capture artifacts” as files:
  - `raw/inbox/<timestamp>_<source>.md` (URL + your note)
  - optional screenshot bundle (if user provides)
- This is the same product shape as Readwise’s “save via share sheet” capture, except your destination is a local vault. citeturn15search5  

**Milestone: Instagram reality-compatible ingestion**  
Goal: support Instagram without pretending you can sync Saved automatically.

Offer three ingest modes in-product:
1) **Share link** (default)  
2) **Import from Instagram export ZIP** (periodic) citeturn3search0turn10search0  
3) **Attach screen recording / downloaded Reel** (for deeper analysis)

Be explicit in UX: “Instagram doesn’t provide an official Saved-items API; if you want full automation, use our share-to-inbox habit.” citeturn10search3turn9search4  

**Milestone: Multimodal understanding tier**  
Goal: “vibe search” and visual grammar extraction.

- Integrate Twelve Labs API for video analysis (Pegasus summaries/timestamps; Marengo embeddings). citeturn12search7turn12search13turn12search8  
- Store outputs as immutable raw files, then compile them into wiki pages (keeping to Karpathy’s raw→wiki discipline). citeturn13view0  

**Milestone: Query products that feel like magic to creators**  
This is where willingness-to-pay is won.

A few high-leverage commands your agent should support:
- “Given my current Taste Snapshot, brainstorm 10 reel premises in my voice that rhyme with this week’s themes.”
- “Generate a script that matches the structure of my favorite creator references, but uses my lived experiences from this week’s notes.”
- “Find 5 visual references with the same vibe as this new freelance brief; produce a shot list and edit notes.”

Farza’s own description of using his personal wiki to generate landing page aesthetics from saved inspiration is a close cousin to what you want—just creator-focused instead of startup-focused. citeturn2search4  

### How to use MCP to make it scalable later

Once your pipeline exists, you can make it model-agnostic in practice by exposing it as an MCP server:
- Claude Code can connect to tools via MCP, and MCP is defined as a standardized way for applications to provide tool/data access to LLMs. citeturn19search0turn19search1  

That gives you a clean architecture boundary:
- “Vault MCP server” offers tools: `capture_url`, `import_export_zip`, `run_compile`, `run_lint`, `search_index`.
- Any agent (Claude Code today, others later) can call those tools.

This lines up with the spirit of Karpathy’s BYO-agent ideology (idea files + portable formats) and avoids vendor lock-in. citeturn13view0

## Will people pay, and how you should position it

### Evidence that “paying for taste/inspiration organization” is real
There’s already a healthy paid market for “save and organize creative inputs” and “second brain” tools:

- **Milanote**: individual paid plans around ~$9.99/month billed annually for moodboards and creative project organization. citeturn15search2  
- **mymind**: ~$7.99/month and ~$12.99/month tiers positioned around AI tagging, vibe grouping, and private saving. citeturn16search0turn16search1  
- **Cosmos**: subscription pricing visible in the App Store (~$8/month). citeturn15search8  
- **Readwise**: ~$9.99/month billed annually for “save everything + highlight + export to Obsidian,” demonstrating willingness to pay for durable capture + retrieval. citeturn15search0turn15search4  

So “people pay for collecting inspiration” is already true. Your bet is that they’ll pay *more* (or churn less) for **taste → synthesis → output**.

### Your sharpest wedge

If you try to be “Instagram Saved, but better,” you’ll fight platform constraints and clone incumbents.

Your wedge should be:

**A creator’s personal Wikipedia that stays consistent across models, and can generate new work in your style because it compiles your taste into a durable, inspectable artifact.**

That is: the Karpathy/Farzapedia philosophy applied to creators, with multimodal inputs and creator-native page types.

### Pricing strategy that fits technical reality

Because multimodal video analysis has real cost, a tiered model is natural:

- **Local-first core**: capture → compile → query, with link-only + transcript-only options.
- **Pro tier**: multimodal “vibe search” and visual grammar extraction (Twelve Labs or equivalent), billed by minutes processed or as a higher monthly tier.

This matches what mymind does conceptually (advanced AI features as higher tier), but your differentiator is the **explicit wiki + backlinks + auditability** rather than “black box magic organization.” citeturn16search0turn13view0

### Name directions that fit the product

Given your “journal-ish, taste-led, persistent wiki” identity, here are name families that won’t feel enterprise-cold:

- **Tastecraft**  
- **ReelAtlas**  
- **VibeIndex**  
- **LumenVault**  
- **MuseGraph**  
- **ReelRover**  
- **Archive of Me**  
- **TasteMap**  
- **Threadlight** (for idea threads + visuals)  
- **BrioWiki** (brio = vigor/style; “wiki” signals structure)

If you want a name that explicitly nods to the philosophy without copying it, you can also do “-pedia” *only if* your product is actually “a personal encyclopedia for creators,” but avoid sounding like a derivative clone unless you’re leaning into that lineage on purpose.

The strongest brand position is: **a space where your taste becomes legible—first to an agent, then to you—so you can make better work faster, without losing your voice.**