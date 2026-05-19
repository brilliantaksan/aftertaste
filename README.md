# Aftertaste

Aftertaste is a local-first, taste-led knowledge base for creators.

The product idea is simple:

- save references you actually care about
- compile them into a durable markdown vault
- surface patterns in your taste over time
- turn those patterns into hooks, scripts, and shot lists

This repo is no longer just a generic `llm-wiki` fork. It now contains the first Aftertaste MVP built on top of that file-native wiki philosophy.

## Product Direction

Aftertaste is aimed at solo short-form creators, especially people working in:

- journal-ish personal reels
- cinematic references
- voice-led storytelling
- visual moodboarding
- creator research that should compound instead of disappearing into saved folders

The core product call is:

- markdown vault as source of truth
- custom web app as the main surface
- Obsidian as studio/debug mode

So the system is designed around:

1. capture
2. analyze
3. compile
4. browse
5. generate

## Current State

This is a working local prototype, not a packaged app. A technical friend should
be able to run their own instance locally with Node.js and a folder to use as the
vault, but they should expect rough product edges and optional provider setup if
they want LLM or richer media behavior.

What works without any API keys:

- A local web app with 5 surfaces:
  - `Home`
  - `Capture`
  - `References`
  - `Idea Studio`
  - `Studio`
- A filesystem-backed creator vault that is scaffolded automatically
- Capture flow for:
  - URL only
  - URL + note
  - URL + note + uploaded assets
- Local analysis pipeline:
  - text-first by default
  - hybrid when uploaded media exists
- Compilation into markdown pages for:
  - `wiki/references/`
  - `wiki/themes/`
  - `wiki/motifs/`
  - `wiki/creators/`
  - `wiki/formats/`
  - `wiki/snapshots/`
  - `wiki/style-constitution.md`
  - `wiki/not-me.md`
- JSON app outputs for snapshot and references
- Existing Studio mode preserved for:
  - page browsing
  - graph view
  - audit filing
  - audit resolution
- Obsidian audit plugin still in the repo

What works with optional provider keys:

- OpenAI-compatible LLM calls for richer text analysis and idea planning
- OpenAI or AssemblyAI transcription for uploaded/source media
- Gemini media analysis for byte-backed video captures
- A private cobalt instance for fetching source media bytes from supported URLs

What is still intentionally incomplete:

- no hosted sync
- no auth
- no billing
- no Instagram Saved auto-sync
- no mobile shell
- no one-click installer or packaged desktop app
- no production-grade provider setup wizard
- no fully polished mobile-first capture flow

## How It Works

Aftertaste keeps a local vault on disk and writes product state as files.

When you save a capture:

1. the raw capture is written to `raw/inbox/` and `raw/captures/`
2. optional uploaded media is written to `raw/media/<capture-id>/`
3. local analysis generates themes, motifs, formats, and creator signals
4. the compiler updates markdown pages inside `wiki/`
5. the web app reads the compiled output back through JSON APIs

That means the app is inspectable and portable.

The vault is the product memory.

## Repo Layout

```text
aftertaste/
├── audit-shared/            # Shared audit schema + serializer
├── llm-wiki/                # Original skill/docs lineage and reference material
├── plugins/
│   └── obsidian-audit/      # Obsidian plugin for filing audits into the vault
├── web/                     # Current Aftertaste web app and server
│   ├── client/              # SPA shell and Studio UI
│   ├── server/              # Express APIs, vault services, markdown rendering
│   └── shared/              # Client/server contracts
└── ops/                     # Optional local/private service scaffolds
```

## Quick Start

Prerequisites:

- Node.js 20+
- npm
- a local folder to use as the Aftertaste vault

From a fresh clone, install dependencies:

```bash
cd audit-shared
npm install
npm run build

cd ../web
npm install
```

Create an empty vault folder, then start the app:

```bash
mkdir -p ../aftertaste-vault
npm run dev -- --wiki ../aftertaste-vault --port 4175
```

Then open:

```text
http://127.0.0.1:4175
```

Important:

- `--wiki` must point to a real directory
- if the directory is empty, Aftertaste scaffolds the vault structure for you
- if the directory does not exist, the server exits with an error
- the server is local-only by default because it binds to `127.0.0.1`

For a production-style local run, build the client and start the server:

```bash
npm start -- --wiki ../aftertaste-vault --port 4175
```

## Optional Provider Setup

Aftertaste runs without provider keys. In that mode it uses heuristic/local
analysis and still writes a real file-backed vault.

To try provider-backed paths, copy the example environment file from the repo
root and fill in only the providers you want:

```bash
cd ..
cp .env.example .env
```

The `web` scripts load the repo-root `.env` automatically.

### Private cobalt API

If you want Aftertaste to acquire source media bytes from supported public URLs, a private `cobalt` deployment scaffold now lives in [ops/cobalt/README.md](ops/cobalt/README.md).

## First Test Flow

To test the MVP manually:

1. Open `Capture`
2. Paste a URL
3. Add a short note like `love the soft voiceover and close-up pacing`
4. Optionally upload screenshots or a short video
5. Submit
6. Check `Home` for the updated snapshot
7. Check `References` for the compiled entry and filters
8. Check `Idea Studio` for generated hooks/scripts/shot lists
9. Check `Studio` to inspect the underlying wiki and graph

## API Surfaces

Main product APIs:

- `POST /api/captures`
- `GET /api/captures`
- `GET /api/captures/:id`
- `POST /api/captures/:id/analyze`
- `POST /api/compile`
- `GET /api/snapshot/current`
- `GET /api/references`
- `POST /api/ideas`

Studio / wiki APIs kept from the original stack:

- `GET /api/tree`
- `GET /api/graph`
- `GET /api/page`
- `GET /api/raw`
- `GET /api/audit`
- `POST /api/audit`
- `PATCH /api/audit/:id/resolve`

## Testing

```bash
cd web
npm test
npm exec tsc -- --noEmit
npm run build
```

Current automated coverage focuses on:

- link-only capture
- capture with note + upload
- compile output
- references filtering
- idea outputs citing source references

## Vault Shape

A running Aftertaste vault currently looks like this:

```text
<vault>/
├── CLAUDE.md
├── audit/
├── log/
├── outputs/
│   ├── app/
│   └── ideas/
├── raw/
│   ├── captures/
│   ├── inbox/
│   └── media/
└── wiki/
    ├── creators/
    ├── formats/
    ├── motifs/
    ├── references/
    ├── snapshots/
    ├── themes/
    ├── index.md
    ├── not-me.md
    └── style-constitution.md
```

## Design Intent

The web UI is aiming for:

- warm, low-pressure visual language
- sparse chrome
- content-first cards
- snapshot-driven homepage instead of graph-first UX
- Obsidian kept as a power-user/studio layer, not the main emotional surface

## Roadmap

Likely next steps:

- replace heuristic idea generation with real LLM-backed generation
- add provider adapters for richer media analysis
- improve bundle size by lazy-loading Studio tooling
- improve capture ingestion for real creator workflows
- add stronger vault schema and starter content
- build a better mobile-first capture path

## Lineage

This project still builds on the Karpathy-style `llm-wiki` pattern:

- raw sources
- compiled markdown wiki
- queryable and auditable artifact

But the product direction here is now specifically Aftertaste, not a generic wiki skill.

## License

MIT
