# Aftertaste — Codex agent context

Read this before writing any code. It covers what this project is, how to run it, where things live, and what not to break.

## What this project is

Aftertaste is a local-first knowledge base for solo short-form video creators. The core loop: capture a URL + note + optional media → analyze for themes/motifs → compile into a markdown vault → generate ideas (hooks, scripts, shot lists) in the creator's voice.

The vault is the source of truth. The web app is the everyday surface. Obsidian is a studio/debug layer.

## Setup and commands

All commands run from `web/`:

```bash
# Install (do this first)
cd audit-shared && npm install && npm run build
cd ../web && npm install

# Run dev server (requires --wiki path)
npm run dev -- --wiki /path/to/vault --port 4175
# Or against the included dev vault:
npm run dev -- --wiki ../local-vault --port 4175

# Run tests
npm test

# Type check
npm exec tsc -- --noEmit

# Build client bundle
npm run build
```

After any change: run `npm test` and `npm exec tsc -- --noEmit`. Both must pass.

## File map

```
web/
├── client/
│   ├── main.ts           # SPA controller — all view rendering lives here
│   ├── studio.ts         # Studio mode (graph, tree, audit)
│   ├── styles.css        # Design system (CSS custom properties, all components)
│   └── index.html        # HTML shell
├── server/
│   ├── index.ts          # Express setup and route registration
│   ├── config.ts         # CLI arg parsing (--wiki, --port)
│   ├── aftertaste/
│   │   └── service.ts    # All business logic: capture, analyze, compile, ideas
│   └── routes/           # Thin route handlers that call service.ts
└── shared/
    └── contracts.ts      # All TypeScript interfaces shared by client and server
```

Other top-level directories:

```
audit-shared/     # Shared audit schema (Zod), serializer, ID generator
llm-wiki/         # Wiki skill docs and reference material
plugins/          # Obsidian audit plugin
local-vault/      # Example vault for development
```

## What to build next

The highest-priority gap is **real LLM-backed idea generation**. Currently `buildIdeas` in `web/server/aftertaste/service.ts` is entirely heuristic/template-based. The structure is already in place for an LLM to replace it:

- `IdeaDraft` has a `personalMoments: PersonalMoment[]` field — these are the beats the creator writes, not the AI
- `[YOUR LINE: context]` / `[YOUR MOMENT: context]` markers in the body string render as styled callouts in the Idea Studio UI
- When implementing LLM generation, preserve this pattern — the LLM should write structure, not the personal lines

Other likely next steps (from the roadmap):
- Provider adapters for richer media analysis (e.g. Twelve Labs for video)
- Lazy-loading Studio tooling to reduce bundle size
- Stronger mobile-first capture path

## Creative guardrails — do not break these

These govern all AI-generated creative output (ideas, scripts, voiceovers). They are also in `local-vault/CLAUDE.md`.

- **Voice-first.** When a capture note contains usable phrases, echo them back into the output. Don't replace the creator's words.
- **Mark personal moments, don't fill them in.** Use `[YOUR LINE: context]` at emotionally specific beats. The creator writes those. The AI writes the structure around them.
- **Exploratory language only.** Never "you should", "make sure to". Use "one possibility", "this could be", "this moment might want to...".
- **Connection-finder role.** Draw from what the creator has already saved. Cite references. Don't invent new aesthetic ideas from scratch.
- **Small palette.** Max 3 options on any idea output.

When implementing LLM integration, any prompt sent to the model must include these rules. They should not be bypassed or softened.

## What's intentionally out of scope — don't add these

- Hosted sync or cloud storage
- Auth or user accounts
- Billing
- Instagram Saved API integration (no official API exists for consumer accounts)
- Mobile shell
- Black-box embeddings without a file-backed artifact
- Team collaboration features

## Design system constraints

CSS lives in `web/client/styles.css`. Design tokens:
- `--bg`, `--bg-strong`, `--bg-soft` — backgrounds
- `--ink`, `--ink-soft`, `--ink-faint` — text hierarchy
- `--gold`, `--mint`, `--cream`, `--rose`, `--pink`, `--blue` — accent colors
- `--radius-sm`, `--radius-md` — border radii

Don't add new CSS variables without a strong reason. Don't introduce a CSS framework — the design system is intentionally hand-written.

## Vault structure (for reference)

```
<vault>/
├── CLAUDE.md               # Vault schema + creative guardrails
├── audit/                  # Human corrections (anchored feedback files)
├── log/                    # Daily operation logs
├── outputs/
│   ├── app/                # snapshot-current.json, references.json
│   └── ideas/              # Generated idea outputs
├── raw/
│   ├── captures/           # Immutable capture records (JSON)
│   ├── inbox/              # One .md per capture
│   └── media/              # Uploaded assets + analysis.json per capture
└── wiki/                   # Compiled output — never manually edited
    ├── references/
    ├── themes/
    ├── motifs/
    ├── creators/
    ├── formats/
    ├── snapshots/
    ├── index.md
    ├── style-constitution.md
    └── not-me.md
```

`raw/` is immutable source. `wiki/` is generated output. Never write directly to `wiki/` — go through the compile pipeline in `service.ts`.
