import type {
  BriefListResponse,
  CaptureDetailResponse,
  CaptureListResponse,
  CaptureRecord,
  IdeaOutputType,
  IdeaResponse,
  PersonalMoment,
  ProjectBrief,
  QueryIndexEntry,
  QuerySearchResponse,
  ReferenceSummary,
  ReferencesResponse,
  SignalTag,
  TasteSnapshot,
} from "../shared/contracts.js";
import { StudioController, buildStudioUrl } from "./studio.js";

type ViewName = "home" | "capture" | "references" | "ideas" | "studio";

interface AppConfig {
  author: string;
  wikiRoot: string;
  productName: string;
  wikiTitle: string;
}

interface ReferenceFiltersState {
  theme: string;
  motif: string;
  creator: string;
  format: string;
  platform: string;
  q: string;
}

interface IdeaFormState {
  outputType: IdeaOutputType;
  brief: string;
  referenceIds: string[];
  briefId: string;
}

interface BriefFormState {
  title: string;
  mode: "personal" | "client";
  deliverableType: "hooks" | "script" | "shotlist" | "concept";
  goal: string;
  audience: string;
  constraints: string;
}

interface AppState {
  config: AppConfig | null;
  view: ViewName;
  studioPage: string;
  snapshot: TasteSnapshot | null;
  captures: CaptureRecord[];
  catalog: ReferencesResponse;
  references: ReferencesResponse;
  referenceFilters: ReferenceFiltersState;
  selectedReferenceId: string | null;
  memoryQuery: QuerySearchResponse;
  captureResult: CaptureDetailResponse | null;
  captureStatus: "idle" | "saving";
  captureError: string | null;
  ideaForm: IdeaFormState;
  briefs: ProjectBrief[];
  briefForm: BriefFormState;
  briefStatus: "idle" | "saving";
  briefError: string | null;
  ideas: IdeaResponse | null;
  ideaStatus: "idle" | "generating";
  referenceStatus: "idle" | "loading";
}

const emptyReferences: ReferencesResponse = {
  references: [],
  filters: {
    themes: [],
    motifs: [],
    creators: [],
    formats: [],
    platforms: [],
  },
};

const state: AppState = {
  config: null,
  view: "home",
  studioPage: "wiki/index.md",
  snapshot: null,
  captures: [],
  catalog: emptyReferences,
  references: emptyReferences,
  referenceFilters: {
    theme: "",
    motif: "",
    creator: "",
    format: "",
    platform: "",
    q: "",
  },
  selectedReferenceId: null,
  memoryQuery: {
    results: [],
  },
  captureResult: null,
  captureStatus: "idle",
  captureError: null,
  ideaForm: {
    outputType: "script",
    brief: "",
    referenceIds: [],
    briefId: "",
  },
  briefs: [],
  briefForm: {
    title: "",
    mode: "personal",
    deliverableType: "script",
    goal: "",
    audience: "",
    constraints: "",
  },
  briefStatus: "idle",
  briefError: null,
  ideas: null,
  ideaStatus: "idle",
  referenceStatus: "idle",
};

const viewChrome: Record<ViewName, { title: string; meta: string }> = {
  home: {
    title: "Taste Snapshot",
    meta: "Read the archive like a living moodboard instead of a list of saved links.",
  },
  capture: {
    title: "Capture Desk",
    meta: "Get new material into the vault fast, then let analysis do the slow work later.",
  },
  references: {
    title: "Reference Atlas",
    meta: "Search by feeling, inspect by signal, and keep the surrounding context visible.",
  },
  ideas: {
    title: "Idea Studio",
    meta: "Build from saved taste patterns with a persistent context rail and a clearer output stage.",
  },
  studio: {
    title: "Wiki Studio",
    meta: "Navigate the compiled vault directly when you need the full article and audit surface.",
  },
};

let studioController: StudioController | null = null;

async function main(): Promise<void> {
  state.config = await fetchJson<AppConfig>("/api/config");
  studioController = new StudioController({ author: state.config.author });
  bindGlobalNavigation();
  window.addEventListener("popstate", () => {
    void syncFromLocation();
  });
  await refreshData();
  await syncFromLocation();
}

async function refreshData(): Promise<void> {
  const [snapshot, captures, catalog, briefs] = await Promise.all([
    fetchJson<TasteSnapshot>("/api/snapshot/current"),
    fetchJson<CaptureListResponse>("/api/captures"),
    fetchJson<ReferencesResponse>("/api/references"),
    fetchJson<BriefListResponse>("/api/briefs"),
  ]);
  state.snapshot = snapshot;
  state.captures = captures.captures;
  state.catalog = catalog;
  state.briefs = briefs.briefs;
  if (state.ideaForm.referenceIds.length === 0) {
    state.ideaForm.referenceIds = snapshot.notableReferences.slice(0, 2).map((reference) => reference.id);
  }
  await refreshReferences();
  renderAll();
}

async function refreshReferences(): Promise<void> {
  state.referenceStatus = "loading";
  renderReferencesView();
  const params = new URLSearchParams();
  if (state.referenceFilters.theme) params.set("theme", state.referenceFilters.theme);
  if (state.referenceFilters.motif) params.set("motif", state.referenceFilters.motif);
  if (state.referenceFilters.creator) params.set("creator", state.referenceFilters.creator);
  if (state.referenceFilters.format) params.set("format", state.referenceFilters.format);
  if (state.referenceFilters.platform) params.set("platform", state.referenceFilters.platform);
  if (state.referenceFilters.q) params.set("q", state.referenceFilters.q);
  const url = params.toString() ? `/api/references?${params.toString()}` : "/api/references";
  const queryParams = new URLSearchParams(params);
  queryParams.set("kind", "catalyst");
  queryParams.append("kind", "snapshot");
  queryParams.append("kind", "constitution");
  queryParams.append("kind", "not-me");
  queryParams.append("kind", "brief");
  queryParams.set("limit", "8");
  const queryUrl = `/api/query?${queryParams.toString()}`;
  const [references, memoryQuery] = await Promise.all([
    fetchJson<ReferencesResponse>(url),
    fetchJson<QuerySearchResponse>(queryUrl),
  ]);
  state.references = references;
  state.memoryQuery = memoryQuery;
  if (!state.selectedReferenceId || !state.references.references.some((reference) => reference.id === state.selectedReferenceId)) {
    state.selectedReferenceId = state.references.references[0]?.id ?? null;
  }
  state.referenceStatus = "idle";
  renderReferencesView();
  renderIdeasView();
}

function bindGlobalNavigation(): void {
  document.querySelectorAll("[data-nav-view]").forEach((button) => {
    button.addEventListener("click", () => {
      const view = button.getAttribute("data-nav-view") as ViewName | null;
      if (!view) return;
      void navigate(view);
    });
  });
}

async function syncFromLocation(): Promise<void> {
  const url = new URL(window.location.href);
  const viewParam = url.searchParams.get("view") as ViewName | null;
  const page = url.searchParams.get("page") ?? "wiki/index.md";
  const view = viewParam ?? (url.searchParams.has("page") ? "studio" : "home");
  state.view = view;
  state.studioPage = page;
  updateViewVisibility();
  updateNavState();
  if (view === "studio" && studioController) {
    await studioController.open(page);
  }
}

async function navigate(view: ViewName, extras?: { page?: string; replace?: boolean }): Promise<void> {
  state.view = view;
  if (extras?.page) state.studioPage = extras.page;
  const url = buildViewUrl(view, extras?.page ?? state.studioPage);
  if (extras?.replace) history.replaceState({ view, page: state.studioPage }, "", url);
  else history.pushState({ view, page: state.studioPage }, "", url);
  updateViewVisibility();
  updateNavState();
  if (view === "studio" && studioController) {
    await studioController.open(state.studioPage);
  }
}

function buildViewUrl(view: ViewName, page: string): string {
  if (view === "studio") return buildStudioUrl(page);
  return `/?view=${encodeURIComponent(view)}`;
}

function renderAll(): void {
  renderHeader();
  renderHomeView();
  renderCaptureView();
  renderReferencesView();
  renderIdeasView();
  updateViewVisibility();
  updateNavState();
}

function renderHeader(): void {
  const brandLabel = document.getElementById("brand-label");
  const brandMeta = document.getElementById("brand-meta");
  const sidebarReferenceCount = document.getElementById("sidebar-reference-count");
  const sidebarReferenceCopy = document.getElementById("sidebar-reference-copy");
  const sidebarCaptureCount = document.getElementById("sidebar-capture-count");
  const sidebarCaptureCopy = document.getElementById("sidebar-capture-copy");
  const sidebarLeadTheme = document.getElementById("sidebar-lead-theme");
  const sidebarLeadMotif = document.getElementById("sidebar-lead-motif");
  if (brandLabel) brandLabel.textContent = state.config?.productName ?? "Aftertaste";
  const refCount = state.catalog.references.length;
  const captureCount = state.captures.length;
  const memoryLabel = refCount === 1 ? "memory" : "memories";
  if (brandMeta) {
    brandMeta.textContent = `${state.config?.wikiTitle ?? "Local vault"} · ${refCount} ${memoryLabel}`;
  }
  if (sidebarReferenceCount) sidebarReferenceCount.textContent = String(refCount);
  if (sidebarReferenceCopy) sidebarReferenceCopy.textContent = `${memoryLabel} indexed`;
  if (sidebarCaptureCount) sidebarCaptureCount.textContent = String(captureCount);
  if (sidebarCaptureCopy) {
    sidebarCaptureCopy.textContent = `${captureCount === 1 ? "capture" : "captures"} processed`;
  }
  if (sidebarLeadTheme) {
    sidebarLeadTheme.textContent = state.snapshot?.themes[0]?.label ?? "Taste signal forming";
  }
  if (sidebarLeadMotif) {
    sidebarLeadMotif.textContent = state.snapshot?.motifs[0]?.label ?? "A motif is still emerging.";
  }
  syncWorkspaceChrome();
}

function syncWorkspaceChrome(): void {
  const workspaceViewTitle = document.getElementById("workspace-view-title");
  const workspaceViewMeta = document.getElementById("workspace-view-meta");
  const workspaceMemoryChip = document.getElementById("workspace-memory-chip");
  const workspaceCaptureChip = document.getElementById("workspace-capture-chip");
  const workspaceSignalChip = document.getElementById("workspace-signal-chip");
  const chrome = viewChrome[state.view];
  const refCount = state.catalog.references.length;
  const captureCount = state.captures.length;
  const leadTheme = state.snapshot?.themes[0]?.label ?? "Taste signal forming";
  if (workspaceViewTitle) workspaceViewTitle.textContent = chrome.title;
  if (workspaceViewMeta) workspaceViewMeta.textContent = chrome.meta;
  if (workspaceMemoryChip) {
    workspaceMemoryChip.textContent = `${refCount} ${refCount === 1 ? "memory" : "memories"}`;
  }
  if (workspaceCaptureChip) {
    workspaceCaptureChip.textContent = `${captureCount} ${captureCount === 1 ? "capture" : "captures"}`;
  }
  if (workspaceSignalChip) {
    workspaceSignalChip.textContent = `Lead theme · ${leadTheme}`;
  }
}

function renderHomeView(): void {
  const container = document.getElementById("view-home");
  if (!container || !state.snapshot) return;
  const snapshot = state.snapshot;
  const referenceCount = state.catalog.references.length;
  const captureCount = state.captures.length;
  const topPlatforms = state.catalog.filters.platforms.slice(0, 3).map((item) => item.label).join(" · ") || "No sources yet";
  const leadTheme = snapshot.themes[0]?.label ?? "Taste signal forming";
  const leadMotif = snapshot.motifs[0]?.label ?? "A visual instinct is starting to repeat";
  const leadPattern = snapshot.creatorPatterns[0]?.label ?? "A recognizable voice is still emerging";
  const promptSeedCount = snapshot.promptSeeds.length;
  const questionCount = snapshot.openQuestions.length;
  container.innerHTML = `
    <section class="hero-card hero-card-memory">
      <div class="hero-copy">
        <div class="hero-chip-row">
          <span class="workspace-pill workspace-pill-soft">Window · ${escapeHtml(snapshot.window.label)}</span>
          <span class="workspace-pill workspace-pill-soft">${promptSeedCount} prompt seed${promptSeedCount === 1 ? "" : "s"}</span>
          <span class="workspace-pill workspace-pill-soft">${questionCount} open question${questionCount === 1 ? "" : "s"}</span>
        </div>
        <span class="eyebrow">Private taste snapshot</span>
        <h1>Remember what your taste keeps reaching for.</h1>
        <p class="hero-summary">${escapeHtml(snapshot.summary)}</p>
        <p class="hero-meta-line">${referenceCount} references saved locally · ${captureCount} captures processed · ${escapeHtml(topPlatforms)}</p>
        <div class="hero-actions">
          <button class="pill-btn pill-btn-solid" id="home-capture">Capture something</button>
          <button class="pill-btn" id="home-ideas">Turn this into ideas</button>
          <button class="pill-btn pill-btn-muted" id="home-studio">Open Studio</button>
        </div>
      </div>
      <div class="memory-board">
        <article class="memory-note memory-note-feature note-peach">
          <span class="note-label">dominant theme</span>
          <strong>${escapeHtml(leadTheme)}</strong>
          <p>${escapeHtml(snapshot.window.label)} archive weather with a calm emphasis on what you keep saving, not how you file it.</p>
          <div class="memory-mini-pills">${renderMiniSignalPills(snapshot.themes.slice(0, 3))}</div>
        </article>
        <article class="memory-note note-blue">
          <span class="note-label">what keeps resurfacing</span>
          <strong>${escapeHtml(leadMotif)}</strong>
          <div class="memory-mini-pills">${renderMiniSignalPills(snapshot.motifs.slice(0, 3))}</div>
        </article>
        <article class="memory-note note-cream">
          <span class="note-label">archive weather</span>
          <strong>${referenceCount} saved</strong>
          <p>${captureCount} recent capture${captureCount === 1 ? "" : "s"} processed into a local, portable vault across ${escapeHtml(topPlatforms)}.</p>
        </article>
        <article class="memory-note note-rose">
          <span class="note-label">voice signature</span>
          <strong>${escapeHtml(leadPattern)}</strong>
          <p>${promptSeedCount} prompt seed${promptSeedCount === 1 ? "" : "s"} already written in the archive's own language.</p>
        </article>
      </div>
    </section>

    <section class="stack-grid">
      <article class="surface-card">
        <header class="surface-head">
          <div>
            <span class="eyebrow">Themes</span>
            <h2>Threads your archive keeps pulling</h2>
          </div>
        </header>
        <div class="signal-cloud">${renderSignalChips(snapshot.themes)}</div>
      </article>

      <article class="surface-card">
        <header class="surface-head">
          <div>
            <span class="eyebrow">Motifs</span>
            <h2>Craft moves you seem to trust instinctively</h2>
          </div>
        </header>
        <div class="signal-cloud">${renderSignalChips(snapshot.motifs)}</div>
      </article>
    </section>

    <section class="stack-grid">
      <article class="surface-card">
        <header class="surface-head">
          <div>
            <span class="eyebrow">Pattern read</span>
            <h2>A few things your archive is quietly saying back</h2>
          </div>
        </header>
        <div class="pattern-list">
          ${snapshot.creatorPatterns.length > 0
            ? snapshot.creatorPatterns
                .map(
                  (pattern) => `
                    <article class="pattern-card">
                      <strong>${escapeHtml(pattern.label)}</strong>
                      <p>${escapeHtml(pattern.summary)}</p>
                    </article>
                  `,
                )
                .join("")
            : `<p class="empty-copy">Save a few references and the pattern layer will start to sharpen.</p>`}
        </div>
      </article>

      <article class="surface-card">
        <header class="surface-head">
          <div>
            <span class="eyebrow">Prompt seeds</span>
            <h2>Ways to turn memory into output</h2>
          </div>
        </header>
        <div class="prompt-list">
          ${snapshot.promptSeeds
            .map(
              (seed, index) => `
                <button class="prompt-card" type="button" data-seed-index="${index}">
                  <strong>${escapeHtml(seed.title)}</strong>
                  <p>${escapeHtml(seed.prompt)}</p>
                </button>
              `,
            )
            .join("")}
        </div>
      </article>
    </section>

    <section class="stack-grid">
      <article class="surface-card">
        <header class="surface-head">
          <div>
            <span class="eyebrow">Tensions</span>
            <h2>Where the archive is pulling in two directions at once</h2>
          </div>
        </header>
        <div class="pattern-list">
          ${snapshot.tensions.length > 0
            ? snapshot.tensions
                .map(
                  (tension) => `
                    <article class="pattern-card">
                      <strong>${escapeHtml(tension.label)}</strong>
                      <p>${escapeHtml(tension.summary)}</p>
                    </article>
                  `,
                )
                .join("")
            : `<p class="empty-copy">No tensions are explicit yet. They will surface once the archive has stronger internal contrast.</p>`}
        </div>
      </article>

      <article class="surface-card">
        <header class="surface-head">
          <div>
            <span class="eyebrow">Boundary Surface</span>
            <h2>What the archive is steering away from</h2>
          </div>
        </header>
        <div class="pattern-list">
          ${snapshot.antiSignals.length > 0
            ? snapshot.antiSignals
                .map(
                  (line) => `
                    <article class="pattern-card anti-pattern-card">
                      <strong>Not me</strong>
                      <p>${escapeHtml(line)}</p>
                    </article>
                  `,
                )
                .join("")
            : `<p class="empty-copy">No anti-signals called out yet.</p>`}
        </div>
      </article>
    </section>

    <section class="surface-card">
      <header class="surface-head">
        <div>
          <span class="eyebrow">Open Questions</span>
          <h2>Uncertainty that should stay visible</h2>
        </div>
      </header>
      <div class="prompt-list">
        ${snapshot.openQuestions.length > 0
          ? snapshot.openQuestions
              .map(
                (question) => `
                  <article class="prompt-card prompt-card-question">
                    <strong>Needs a sharper read</strong>
                    <p>${escapeHtml(question)}</p>
                  </article>
                `,
              )
              .join("")
          : `<p class="empty-copy">No open questions surfaced in the current snapshot.</p>`}
      </div>
    </section>

    <section class="surface-card">
      <header class="surface-head">
        <div>
          <span class="eyebrow">References</span>
          <h2>What is shaping the current moodboard</h2>
        </div>
        <button class="link-btn" id="home-references">Browse all references</button>
      </header>
      <div class="reference-strip">
        ${snapshot.notableReferences.length > 0
          ? snapshot.notableReferences.map((reference) => renderReferenceStripCard(reference)).join("")
          : `<p class="empty-copy">No references yet. Capture your first link to start compiling the archive.</p>`}
      </div>
    </section>
  `;

  document.getElementById("home-capture")?.addEventListener("click", () => {
    void navigate("capture");
  });
  document.getElementById("home-ideas")?.addEventListener("click", () => {
    state.ideaForm.referenceIds = snapshot.notableReferences.slice(0, 3).map((reference) => reference.id);
    state.ideaForm.brief = snapshot.promptSeeds[0]?.prompt ?? state.ideaForm.brief;
    renderIdeasView();
    void navigate("ideas");
  });
  document.getElementById("home-studio")?.addEventListener("click", () => {
    void navigate("studio", { page: "wiki/snapshots/current.md" });
  });
  document.getElementById("home-references")?.addEventListener("click", () => {
    void navigate("references");
  });
  container.querySelectorAll<HTMLButtonElement>("[data-seed-index]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.getAttribute("data-seed-index"));
      const seed = snapshot.promptSeeds[index];
      if (!seed) return;
      state.ideaForm.brief = seed.prompt;
      state.ideaForm.referenceIds = seed.referenceIds;
      renderIdeasView();
      void navigate("ideas");
    });
  });
  container.querySelectorAll<HTMLButtonElement>("[data-open-reference]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-open-reference");
      if (!id) return;
      state.selectedReferenceId = id;
      renderReferencesView();
      void navigate("references");
    });
  });
}

function renderCaptureView(): void {
  const container = document.getElementById("view-capture");
  if (!container) return;
  const latestCaptures = state.captures.slice(0, 4);
  const result = state.captureResult;
  const topPlatforms = state.catalog.filters.platforms.slice(0, 3).map((item) => item.label).join(" · ") || "No recent source mix yet";
  const leadTheme = state.snapshot?.themes[0]?.label ?? "Taste signal forming";
  container.innerHTML = `
    <section class="capture-layout">
      <article class="surface-card surface-card-accent capture-composer">
        <header class="surface-head">
          <div>
            <span class="eyebrow">Capture</span>
            <h1>Save first. Let meaning arrive after.</h1>
          </div>
        </header>
        <form id="capture-form" class="capture-form">
          <div class="capture-form-grid">
            <label class="field">
              <span>Source kind</span>
              <select name="sourceKind">
                <option value="reference">Reference</option>
                <option value="journal">Journal</option>
                <option value="brief">Brief</option>
                <option value="voice-note">Voice note</option>
                <option value="moodboard">Moodboard</option>
              </select>
            </label>
            <label class="field">
              <span>Collection</span>
              <input name="collection" type="text" placeholder="Linh, Friendships, April client" />
            </label>
          </div>
          <label class="field">
            <span>Link</span>
            <input name="sourceUrl" type="url" placeholder="https://www.instagram.com/reel/..." required />
          </label>
          <label class="field">
            <span>Why are you saving it right now?</span>
            <input name="savedReason" type="text" placeholder="A quick reason you want the future vault to remember" />
          </label>
          <label class="field">
            <span>Note, transcript, or raw text</span>
            <textarea name="note" rows="6" placeholder="Optional, but useful. Paste the journal line, brief, voice-note summary, or what pulled you in."></textarea>
          </label>
          <label class="field">
            <span>Project IDs</span>
            <input name="projectIds" type="text" placeholder="Comma-separated project handles like april-launch, friendships" />
          </label>
          <label class="field">
            <span>Screenshots, audio, or video</span>
            <input name="assets" type="file" multiple />
          </label>
          ${state.captureError ? `<p class="inline-error">${escapeHtml(state.captureError)}</p>` : ""}
          <div class="form-actions">
            <button class="pill-btn pill-btn-solid" type="submit" ${state.captureStatus === "saving" ? "disabled" : ""}>
              ${state.captureStatus === "saving" ? "Capturing..." : "Save to Aftertaste"}
            </button>
            <button class="pill-btn" type="button" id="capture-compile">Rebuild vault</button>
          </div>
        </form>
      </article>

      <aside class="capture-rail">
        <article class="surface-card capture-sidecard">
          <header class="surface-head surface-head-compact">
            <div>
              <span class="eyebrow">Capture atmosphere</span>
              <h2>What the vault is holding right now</h2>
            </div>
          </header>
          <div class="capture-guideline-grid">
            <article class="capture-guideline">
              <span class="detail-label">Processed</span>
              <strong>${state.captures.length}</strong>
              <p>captures already folded into the archive.</p>
            </article>
            <article class="capture-guideline">
              <span class="detail-label">Lead theme</span>
              <strong>${escapeHtml(leadTheme)}</strong>
              <p>The strongest read in the current snapshot.</p>
            </article>
            <article class="capture-guideline capture-guideline-wide">
              <span class="detail-label">Recent source mix</span>
              <strong>${escapeHtml(topPlatforms)}</strong>
              <p>The vault is currently being fed by this blend of platforms and source types.</p>
            </article>
          </div>
        </article>

        <article class="surface-card">
          <header class="surface-head">
            <div>
              <span class="eyebrow">Recent activity</span>
              <h2>Fresh memories entering the vault</h2>
            </div>
          </header>
          <div class="capture-history">
            ${latestCaptures.length > 0
              ? latestCaptures.map((capture) => renderCaptureHistory(capture)).join("")
              : `<p class="empty-copy">No captures yet.</p>`}
          </div>
        </article>
      </aside>
    </section>

    ${
      result
        ? `
      <section class="surface-card success-panel">
        <header class="surface-head">
          <div>
            <span class="eyebrow">Captured</span>
            <h2>${escapeHtml(result.reference?.title ?? result.capture.metadata.title ?? "New reference added")}</h2>
          </div>
        </header>
        <p>${escapeHtml(result.analysis?.summary ?? "The capture was saved and folded back into the archive.")}</p>
        <div class="signal-cloud">${renderSignalChips(result.analysis?.themes ?? [])}</div>
        <div class="signal-cloud signal-cloud-tight">
          <span class="signal-chip">${escapeHtml(result.capture.sourceKind)}</span>
          ${result.capture.collection ? `<span class="signal-chip">${escapeHtml(result.capture.collection)}</span>` : ""}
          ${result.capture.projectIds.map((projectId) => `<span class="signal-chip">${escapeHtml(projectId)}</span>`).join("")}
        </div>
        ${
          (result.analysis?.moments.length ?? 0) > 0
            ? `
              <div class="detail-block">
                <span class="detail-label">Moments surfaced</span>
                <ul class="detail-list">${(result.analysis?.moments ?? []).map((moment) => `<li><strong>${escapeHtml(moment.label)}:</strong> ${escapeHtml(moment.description)}</li>`).join("")}</ul>
              </div>
            `
            : ""
        }
        <div class="hero-actions">
          <button class="pill-btn pill-btn-solid" id="capture-view-home">See snapshot</button>
          <button class="pill-btn" id="capture-open-ideas">Use this in ideas</button>
          <button class="pill-btn pill-btn-muted" id="capture-open-studio">Open Studio page</button>
        </div>
      </section>
    `
        : ""
    }
  `;

  const form = document.getElementById("capture-form") as HTMLFormElement | null;
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void handleCaptureSubmit(form);
  });
  document.getElementById("capture-compile")?.addEventListener("click", () => {
    void rebuildVault();
  });
  document.getElementById("capture-view-home")?.addEventListener("click", () => {
    void navigate("home");
  });
  document.getElementById("capture-open-ideas")?.addEventListener("click", () => {
    if (result?.reference?.id) {
      state.ideaForm.referenceIds = [result.reference.id];
      state.ideaForm.brief = result.analysis?.summary ?? state.ideaForm.brief;
      renderIdeasView();
    }
    void navigate("ideas");
  });
  document.getElementById("capture-open-studio")?.addEventListener("click", () => {
    if (result?.reference?.pagePath) {
      void navigate("studio", { page: result.reference.pagePath });
    }
  });
  document.getElementById("view-capture")?.addEventListener("click", (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".history-delete-btn");
    if (!btn) return;
    const id = btn.dataset.captureId;
    if (!id) return;
    void handleCaptureDelete(id);
  });
}

async function handleCaptureDelete(id: string): Promise<void> {
  await fetchJson(`/api/captures/${encodeURIComponent(id)}`, { method: "DELETE" });
  state.captures = state.captures.filter((c) => c.id !== id);
  if (state.captureResult?.capture.id === id) state.captureResult = null;
  renderCaptureView();
}

async function handleCaptureSubmit(form: HTMLFormElement): Promise<void> {
  const urlInput = form.elements.namedItem("sourceUrl") as HTMLInputElement | null;
  const noteInput = form.elements.namedItem("note") as HTMLTextAreaElement | null;
  const sourceKindInput = form.elements.namedItem("sourceKind") as HTMLSelectElement | null;
  const savedReasonInput = form.elements.namedItem("savedReason") as HTMLInputElement | null;
  const collectionInput = form.elements.namedItem("collection") as HTMLInputElement | null;
  const projectIdsInput = form.elements.namedItem("projectIds") as HTMLInputElement | null;
  const fileInput = form.elements.namedItem("assets") as HTMLInputElement | null;
  if (!urlInput) return;
  state.captureStatus = "saving";
  state.captureError = null;
  renderCaptureView();
  try {
    const files = Array.from(fileInput?.files ?? []);
    const assets = await Promise.all(
      files.map(async (file) => ({
        name: file.name,
        mediaType: file.type || "application/octet-stream",
        dataBase64: await readFileAsDataUrl(file),
        size: file.size,
      })),
    );
    const result = await fetchJson<CaptureDetailResponse>("/api/captures", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        sourceUrl: urlInput.value,
        note: noteInput?.value ?? "",
        sourceKind: sourceKindInput?.value ?? "reference",
        savedReason: savedReasonInput?.value ?? "",
        collection: collectionInput?.value ?? "",
        projectIds: (projectIdsInput?.value ?? "")
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        assets,
      }),
    });
    state.captureResult = result;
    state.captureStatus = "idle";
    state.captureError = null;
    await refreshData();
    renderCaptureView();
  } catch (error) {
    state.captureStatus = "idle";
    state.captureError = error instanceof Error ? error.message : String(error);
    renderCaptureView();
  }
}

function renderReferencesView(): void {
  const container = document.getElementById("view-references");
  if (!container) return;
  const filters = state.references.filters;
  const selected = state.references.references.find((reference) => reference.id === state.selectedReferenceId) ?? null;
  const memoryResults = state.memoryQuery.results;
  const referenceCount = state.references.references.length;
  const platformCount = filters.platforms.length;
  container.innerHTML = `
    <section class="surface-card">
      <header class="surface-head">
        <div>
          <span class="eyebrow">References</span>
          <h1>Find the things you half remember by feeling.</h1>
        </div>
      </header>
      <form id="reference-filters" class="filter-bar">
        ${renderFilterSelect("theme", "Theme", filters.themes, state.referenceFilters.theme)}
        ${renderFilterSelect("motif", "Motif", filters.motifs, state.referenceFilters.motif)}
        ${renderFilterSelect("creator", "Creator", filters.creators, state.referenceFilters.creator)}
        ${renderFilterSelect("format", "Format", filters.formats, state.referenceFilters.format)}
        ${renderFilterSelect("platform", "Platform", filters.platforms, state.referenceFilters.platform)}
        <label class="field field-search">
          <span>Search</span>
          <input name="q" type="search" value="${escapeAttribute(state.referenceFilters.q)}" placeholder="search title, note, theme" />
        </label>
        <div class="form-actions form-actions-inline">
          <button class="pill-btn pill-btn-solid" type="submit">Apply</button>
          <button class="pill-btn" type="button" id="references-reset">Reset</button>
        </div>
      </form>
      <div class="workspace-status workspace-status-inline">
        <span class="workspace-pill workspace-pill-soft">${referenceCount} match${referenceCount === 1 ? "" : "es"}</span>
        <span class="workspace-pill workspace-pill-soft">${memoryResults.length} derived note${memoryResults.length === 1 ? "" : "s"}</span>
        <span class="workspace-pill workspace-pill-soft">${platformCount} platform${platformCount === 1 ? "" : "s"}</span>
      </div>
    </section>

    <section class="surface-card">
      <header class="surface-head">
        <div>
          <span class="eyebrow">Memory Query</span>
          <h2>Derived context that matches the current filters</h2>
        </div>
      </header>
      <div class="prompt-list">
        ${
          state.referenceStatus === "loading"
            ? skeletonCards(3)
            : memoryResults.length > 0
              ? memoryResults.map((entry) => renderMemoryQueryCard(entry)).join("")
              : `<p class="empty-copy">No non-reference memory matched this search yet.</p>`
        }
      </div>
    </section>

    <section class="reference-layout">
      <div class="reference-grid" id="reference-grid">
        ${
          state.referenceStatus === "loading"
            ? skeletonCards(4)
            : state.references.references.length > 0
              ? state.references.references.map((reference) => renderReferenceCard(reference, reference.id === selected?.id)).join("")
              : `<p class="empty-copy">No references match this filter set yet.</p>`
        }
      </div>
      <aside class="surface-card reference-detail">
        ${
          selected
            ? renderReferenceDetail(selected)
            : `<p class="empty-copy">Choose a reference to inspect its taste signals.</p>`
        }
      </aside>
    </section>
  `;

  const filtersForm = document.getElementById("reference-filters") as HTMLFormElement | null;
  filtersForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    const formData = new FormData(filtersForm);
    state.referenceFilters = {
      theme: String(formData.get("theme") ?? ""),
      motif: String(formData.get("motif") ?? ""),
      creator: String(formData.get("creator") ?? ""),
      format: String(formData.get("format") ?? ""),
      platform: String(formData.get("platform") ?? ""),
      q: String(formData.get("q") ?? ""),
    };
    void refreshReferences();
  });
  document.getElementById("references-reset")?.addEventListener("click", () => {
    state.referenceFilters = { theme: "", motif: "", creator: "", format: "", platform: "", q: "" };
    void refreshReferences();
  });
  container.querySelectorAll<HTMLButtonElement>("[data-reference-id]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-reference-id");
      if (!id) return;
      state.selectedReferenceId = id;
      renderReferencesView();
    });
  });
  container.querySelectorAll<HTMLButtonElement>("[data-query-source-ids]").forEach((button) => {
    button.addEventListener("click", () => {
      const ids = (button.getAttribute("data-query-source-ids") ?? "")
        .split(",")
        .map((value) => value.trim())
        .filter(Boolean);
      const summary = button.getAttribute("data-query-summary") ?? "";
      if (ids.length === 0) return;
      state.ideaForm.referenceIds = ids.slice(0, 4);
      if (!state.ideaForm.brief.trim()) {
        state.ideaForm.brief = summary;
      }
      renderIdeasView();
      void navigate("ideas");
    });
  });
  container.querySelectorAll<HTMLButtonElement>("[data-query-open-page]").forEach((button) => {
    button.addEventListener("click", () => {
      const page = button.getAttribute("data-query-open-page");
      if (!page) return;
      void navigate("studio", { page });
    });
  });
  document.getElementById("reference-use-idea")?.addEventListener("click", () => {
    if (!selected) return;
    state.ideaForm.referenceIds = Array.from(new Set([selected.id, ...state.ideaForm.referenceIds])).slice(0, 4);
    state.ideaForm.brief = selected.summary;
    renderIdeasView();
    void navigate("ideas");
  });
  document.getElementById("reference-rerun-analysis")?.addEventListener("click", () => {
    if (!selected) return;
    void rerunAnalysis(selected.id);
  });
  document.getElementById("reference-open-studio")?.addEventListener("click", () => {
    if (!selected) return;
    void navigate("studio", { page: selected.pagePath });
  });
}

async function rerunAnalysis(referenceId: string): Promise<void> {
  await fetchJson(`/api/captures/${encodeURIComponent(referenceId)}/analyze`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  await rebuildVault();
}

function renderIdeasView(): void {
  const container = document.getElementById("view-ideas");
  if (!container || !state.snapshot) return;
  const references = getIdeaReferenceOptions();
  const ideaContext = state.ideas?.context ?? null;
  const selectedBrief = ideaContext?.brief ?? state.briefs.find((brief) => brief.id === state.ideaForm.briefId) ?? null;
  const activeReferences = ideaContext?.selectedReferences ?? getActiveIdeaReferences();
  const activeCatalysts = ideaContext?.catalysts ?? [];
  const relatedReferences = ideaContext?.relatedReferences ?? [];
  container.innerHTML = `
    <section class="ideas-layout">
      <aside class="surface-card surface-card-accent ideas-builder">
        <header class="surface-head">
          <div>
            <span class="eyebrow">Idea Studio</span>
            <h1>Turn this week's taste into something quietly precise.</h1>
          </div>
        </header>
        <p class="lede">${escapeHtml(state.snapshot.summary)}</p>
        <div class="workspace-status workspace-status-inline">
          <span class="workspace-pill workspace-pill-soft">${references.length} anchor${references.length === 1 ? "" : "s"} ready</span>
          <span class="workspace-pill workspace-pill-soft">${state.briefs.length} saved brief${state.briefs.length === 1 ? "" : "s"}</span>
          <span class="workspace-pill workspace-pill-soft">${state.snapshot.promptSeeds.length} seed${state.snapshot.promptSeeds.length === 1 ? "" : "s"}</span>
        </div>
        <form id="ideas-form" class="ideas-form">
          <label class="field">
            <span>Saved brief</span>
            <select name="briefId">
              <option value="">None</option>
              ${state.briefs
                .map(
                  (brief) => `
                    <option value="${brief.id}" ${state.ideaForm.briefId === brief.id ? "selected" : ""}>${escapeHtml(brief.title)} · ${escapeHtml(brief.deliverableType)}</option>
                  `,
                )
                .join("")}
            </select>
          </label>
          ${
            selectedBrief
              ? `
                <div class="brief-summary-card">
                  <strong>${escapeHtml(selectedBrief.title)}</strong>
                  <p>${escapeHtml(selectedBrief.goal)}</p>
                  <div class="signal-cloud signal-cloud-tight">
                    ${selectedBrief.constraints.length > 0
                      ? selectedBrief.constraints.map((constraint) => `<span class="signal-chip">${escapeHtml(constraint)}</span>`).join("")
                      : `<span class="signal-chip signal-chip-empty">No saved constraints</span>`}
                  </div>
                </div>
              `
              : ""
          }
          <label class="field">
            <span>Output</span>
            <select name="outputType">
              <option value="hooks" ${state.ideaForm.outputType === "hooks" ? "selected" : ""}>Hooks</option>
              <option value="script" ${state.ideaForm.outputType === "script" ? "selected" : ""}>Script</option>
              <option value="shotlist" ${state.ideaForm.outputType === "shotlist" ? "selected" : ""}>Shot list</option>
            </select>
          </label>
          <label class="field">
            <span>Optional brief</span>
            <textarea name="brief" rows="5" placeholder="Give the generator a project, mood, or constraint.">${escapeHtml(state.ideaForm.brief)}</textarea>
          </label>
          <fieldset class="reference-picks">
            <legend>Reference anchors</legend>
            ${
              references.length > 0
                ? references
                    .map(
                      (reference) => `
                        <label class="reference-check">
                          <input type="checkbox" name="referenceIds" value="${reference.id}" ${state.ideaForm.referenceIds.includes(reference.id) ? "checked" : ""} />
                          <span>
                            <strong>${escapeHtml(reference.title)}</strong>
                            <small>${escapeHtml(reference.summary)}</small>
                          </span>
                        </label>
                      `,
                    )
                    .join("")
                : `<p class="empty-copy">Capture a few references first.</p>`
            }
          </fieldset>
          <div class="form-actions">
            <button class="pill-btn pill-btn-solid" type="submit" ${state.ideaStatus === "generating" ? "disabled" : ""}>
              ${state.ideaStatus === "generating" ? "Generating..." : "Generate ideas"}
            </button>
          </div>
        </form>

        <form id="brief-form" class="ideas-form brief-form">
          <header class="surface-head surface-head-compact">
            <div>
              <span class="eyebrow">Project brief</span>
              <h2>Save the current context for reuse</h2>
            </div>
          </header>
          <label class="field">
            <span>Title</span>
            <input name="title" type="text" value="${escapeAttribute(state.briefForm.title)}" placeholder="April client reel" />
          </label>
          <div class="brief-form-grid">
            <label class="field">
              <span>Mode</span>
              <select name="mode">
                <option value="personal" ${state.briefForm.mode === "personal" ? "selected" : ""}>Personal</option>
                <option value="client" ${state.briefForm.mode === "client" ? "selected" : ""}>Client</option>
              </select>
            </label>
            <label class="field">
              <span>Deliverable</span>
              <select name="deliverableType">
                <option value="hooks" ${state.briefForm.deliverableType === "hooks" ? "selected" : ""}>Hooks</option>
                <option value="script" ${state.briefForm.deliverableType === "script" ? "selected" : ""}>Script</option>
                <option value="shotlist" ${state.briefForm.deliverableType === "shotlist" ? "selected" : ""}>Shot list</option>
                <option value="concept" ${state.briefForm.deliverableType === "concept" ? "selected" : ""}>Concept</option>
              </select>
            </label>
          </div>
          <label class="field">
            <span>Goal</span>
            <textarea name="goal" rows="3" placeholder="What this brief is trying to make possible.">${escapeHtml(state.briefForm.goal)}</textarea>
          </label>
          <label class="field">
            <span>Audience</span>
            <input name="audience" type="text" value="${escapeAttribute(state.briefForm.audience)}" placeholder="Who this is for" />
          </label>
          <label class="field">
            <span>Constraints</span>
            <textarea name="constraints" rows="3" placeholder="Comma-separated constraints or guardrails.">${escapeHtml(state.briefForm.constraints)}</textarea>
          </label>
          ${state.briefError ? `<p class="inline-error">${escapeHtml(state.briefError)}</p>` : ""}
          <div class="form-actions">
            <button class="pill-btn" type="submit" ${state.briefStatus === "saving" ? "disabled" : ""}>
              ${state.briefStatus === "saving" ? "Saving brief..." : "Save current brief"}
            </button>
          </div>
        </form>
      </aside>

      <div class="ideas-main">
        <article class="surface-card idea-context-panel">
          <header class="surface-head">
            <div>
              <span class="eyebrow">Active context</span>
              <h2>Why the next output will look the way it does</h2>
            </div>
          </header>
          ${
            activeReferences.length > 0
              ? `
                <div class="idea-reference-stack">
                  ${activeReferences.map((reference) => renderIdeaReferenceStackCard(reference)).join("")}
                </div>
              `
              : `<p class="empty-copy">Choose a few references and they will stack here before generation.</p>`
          }
          <div class="detail-block">
            <span class="detail-label">Active catalysts</span>
            <div class="signal-cloud">
              ${
                activeCatalysts.length > 0
                  ? activeCatalysts.map((catalyst) => `<span class="signal-chip">${escapeHtml(catalyst.label)}</span>`).join("")
                  : `<span class="signal-chip signal-chip-empty">Generate once to see the catalyst layer attached to this run</span>`
              }
            </div>
          </div>
          ${
            relatedReferences.length > 0
              ? `
                <div class="detail-block">
                  <span class="detail-label">Related references brought into context</span>
                  <div class="idea-related-pills">
                    ${relatedReferences
                      .map(
                        (reference) => `
                          <button class="reference-inline-pill" type="button" data-open-reference="${reference.id}">
                            ${escapeHtml(reference.title)}
                          </button>
                        `,
                      )
                      .join("")}
                  </div>
                </div>
              `
              : ""
          }
          ${
            selectedBrief
              ? `
                <div class="detail-block">
                  <span class="detail-label">Current brief</span>
                  <div class="brief-summary-card">
                    <strong>${escapeHtml(selectedBrief.title)}</strong>
                    <p>${escapeHtml(selectedBrief.goal)}</p>
                    <div class="signal-cloud signal-cloud-tight">
                      ${selectedBrief.constraints.length > 0
                        ? selectedBrief.constraints.map((constraint) => `<span class="signal-chip">${escapeHtml(constraint)}</span>`).join("")
                        : `<span class="signal-chip signal-chip-empty">No saved constraints</span>`}
                    </div>
                  </div>
                </div>
              `
              : ""
          }
          ${
            ideaContext
              ? `
                <div class="idea-boundary-grid">
                  ${renderContextStrip("Constitution", ideaContext.constitutionExcerpt, "constitution")}
                  ${renderContextStrip("Not Me", ideaContext.notMeExcerpt, "not-me")}
                </div>
                ${
                  ideaContext.wikiArticles.length > 0
                    ? `
                      <div class="detail-block">
                        <span class="detail-label">Wiki articles shaping this run</span>
                        <div class="prompt-list">
                          ${ideaContext.wikiArticles
                            .map(
                              (article) => `
                                <button class="prompt-card" type="button" data-query-open-page="${escapeAttribute(article.path)}">
                                  <strong>${escapeHtml(article.title)}</strong>
                                  <p>${escapeHtml(article.excerpt)}</p>
                                </button>
                              `,
                            )
                            .join("")}
                        </div>
                      </div>
                    `
                    : ""
                }
              `
              : `
                <div class="idea-boundary-grid">
                  ${renderContextStrip("Constitution", "Generate once to pin the active constitution excerpt for this exact run.", "constitution")}
                  ${renderContextStrip("Not Me", "Generate once to pin the active boundary excerpt and see what directions are being suppressed.", "not-me")}
                </div>
              `
          }
        </article>

        <article class="surface-card">
          <header class="surface-head">
            <div>
              <span class="eyebrow">Seed prompts</span>
              <h2>Start from the archive's own language</h2>
            </div>
          </header>
          <div class="prompt-list">
            ${state.snapshot.promptSeeds
              .map(
                (seed, index) => `
                  <button class="prompt-card" type="button" data-idea-seed="${index}">
                    <strong>${escapeHtml(seed.title)}</strong>
                    <p>${escapeHtml(seed.prompt)}</p>
                  </button>
                `,
              )
              .join("")}
          </div>
        </article>

        <article class="surface-card">
          <header class="surface-head">
            <div>
              <span class="eyebrow">Outputs</span>
              <h2>${state.ideas ? "Generated from your current snapshot" : "Nothing generated yet"}</h2>
            </div>
          </header>
          ${state.ideas ? renderIdeaSessionSummary() : ""}
          <div class="idea-output-grid">
            ${
              state.ideas
                ? state.ideas.outputs
                    .map((output) => renderIdeaCard(output.title, output.body, output.rationale, output.citations, output.personalMoments ?? []))
                    .join("")
                : `<p class="empty-copy">Pick a format, select a few references, and generate an idea set.</p>`
            }
          </div>
        </article>
      </div>
    </section>
  `;

  const form = document.getElementById("ideas-form") as HTMLFormElement | null;
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void handleIdeaSubmit(form);
  });
  const briefSelect = form?.elements.namedItem("briefId") as HTMLSelectElement | null;
  briefSelect?.addEventListener("change", async (event) => {
    const target = event.target as HTMLSelectElement;
    state.ideaForm.briefId = target.value;
    if (!target.value) {
      renderIdeasView();
      return;
    }
    await loadBriefIntoIdeaForm(target.value);
  });
  const briefForm = document.getElementById("brief-form") as HTMLFormElement | null;
  briefForm?.addEventListener("submit", (event) => {
    event.preventDefault();
    void handleBriefSubmit(briefForm);
  });
  container.querySelectorAll<HTMLButtonElement>("[data-idea-seed]").forEach((button) => {
    button.addEventListener("click", () => {
      const index = Number(button.getAttribute("data-idea-seed"));
      const seed = state.snapshot?.promptSeeds[index];
      if (!seed) return;
      state.ideaForm.brief = seed.prompt;
      state.ideaForm.referenceIds = seed.referenceIds;
      renderIdeasView();
    });
  });
  container.querySelectorAll<HTMLButtonElement>("[data-open-reference]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-open-reference");
      if (!id) return;
      state.selectedReferenceId = id;
      renderReferencesView();
      void navigate("references");
    });
  });
}

async function handleIdeaSubmit(form: HTMLFormElement): Promise<void> {
  const formData = new FormData(form);
  state.ideaForm = {
    outputType: String(formData.get("outputType") ?? "script") as IdeaOutputType,
    brief: String(formData.get("brief") ?? ""),
    referenceIds: formData
      .getAll("referenceIds")
      .map((value) => String(value))
      .filter(Boolean),
    briefId: String(formData.get("briefId") ?? ""),
  };
  state.ideaStatus = "generating";
  renderIdeasView();
  try {
    state.ideas = await fetchJson<IdeaResponse>("/api/ideas", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        snapshotId: state.snapshot?.id ?? null,
        referenceIds: state.ideaForm.referenceIds,
        outputType: state.ideaForm.outputType,
        brief: state.ideaForm.brief,
        briefId: state.ideaForm.briefId || null,
      }),
    });
  } finally {
    state.ideaStatus = "idle";
    renderIdeasView();
  }
}

async function handleBriefSubmit(form: HTMLFormElement): Promise<void> {
  const formData = new FormData(form);
  state.briefForm = {
    title: String(formData.get("title") ?? ""),
    mode: (String(formData.get("mode") ?? "personal") === "client" ? "client" : "personal"),
    deliverableType: normalizeBriefDeliverable(String(formData.get("deliverableType") ?? "script")),
    goal: String(formData.get("goal") ?? ""),
    audience: String(formData.get("audience") ?? ""),
    constraints: String(formData.get("constraints") ?? ""),
  };
  state.briefStatus = "saving";
  state.briefError = null;
  renderIdeasView();
  try {
    const brief = await fetchJson<ProjectBrief>("/api/briefs", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        title: state.briefForm.title,
        mode: state.briefForm.mode,
        deliverableType: state.briefForm.deliverableType,
        goal: state.briefForm.goal,
        audience: state.briefForm.audience,
        constraints: state.briefForm.constraints
          .split(",")
          .map((value) => value.trim())
          .filter(Boolean),
        selectedReferenceIds: state.ideaForm.referenceIds,
      }),
    });
    state.briefs = (await fetchJson<BriefListResponse>("/api/briefs")).briefs;
    state.ideaForm.briefId = brief.id;
    await loadBriefIntoIdeaForm(brief.id);
    state.briefForm = {
      title: "",
      mode: "personal",
      deliverableType: "script",
      goal: "",
      audience: "",
      constraints: "",
    };
  } catch (error) {
    state.briefError = error instanceof Error ? error.message : String(error);
  } finally {
    state.briefStatus = "idle";
    renderIdeasView();
  }
}

async function loadBriefIntoIdeaForm(briefId: string): Promise<void> {
  const brief = await fetchJson<ProjectBrief>(`/api/briefs/${encodeURIComponent(briefId)}`);
  state.ideaForm.briefId = brief.id;
  state.ideaForm.referenceIds = brief.selectedReferenceIds.length > 0 ? brief.selectedReferenceIds : state.ideaForm.referenceIds;
  state.ideaForm.brief = [brief.goal, brief.audience ? `Audience: ${brief.audience}` : ""].filter(Boolean).join("\n");
  if (brief.deliverableType !== "concept") {
    state.ideaForm.outputType = brief.deliverableType;
  }
  renderIdeasView();
}

async function rebuildVault(): Promise<void> {
  await fetchJson("/api/compile", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
  });
  await refreshData();
}

function updateViewVisibility(): void {
  document.querySelectorAll<HTMLElement>("[data-view-panel]").forEach((panel) => {
    const view = panel.getAttribute("data-view-panel");
    const isActive = view === state.view;
    if (isActive && panel.classList.contains("hidden")) {
      panel.classList.remove("hidden");
      panel.classList.remove("is-entering");
      void panel.offsetWidth; // force reflow so animation restarts
      panel.classList.add("is-entering");
    } else if (!isActive) {
      panel.classList.add("hidden");
      panel.classList.remove("is-entering");
    }
  });
}

function updateNavState(): void {
  document.querySelectorAll<HTMLElement>("[data-nav-view]").forEach((button) => {
    const active = button.getAttribute("data-nav-view") === state.view;
    button.classList.toggle("is-active", active);
  });
  syncWorkspaceChrome();
}

function renderReferenceStripCard(reference: ReferenceSummary): string {
  return `
    <button class="reference-strip-card" type="button" data-open-reference="${reference.id}">
      <span class="reference-platform">${escapeHtml(reference.platform)}</span>
      <strong>${escapeHtml(reference.title)}</strong>
      <p>${escapeHtml(reference.summary)}</p>
      <div class="signal-cloud signal-cloud-tight">${renderSignalChips(reference.themes.slice(0, 2))}</div>
    </button>
  `;
}

function renderCaptureHistory(capture: CaptureRecord): string {
  return `
    <article class="history-card">
      <div>
        <strong>${escapeHtml(capture.metadata.title ?? capture.sourceUrl)}</strong>
        <p>${escapeHtml(capture.platform)} · ${formatDate(capture.createdAt)} · ${capture.status}</p>
        <p>${escapeHtml(capture.sourceKind)}${capture.collection ? ` · ${escapeHtml(capture.collection)}` : ""}</p>
      </div>
      <div class="history-card-actions">
        <span class="history-mode">${escapeHtml(capture.ingestionMode)}</span>
        <button class="history-delete-btn" type="button" data-capture-id="${escapeHtml(capture.id)}" title="Delete capture">×</button>
      </div>
    </article>
  `;
}

function renderReferenceCard(reference: ReferenceSummary, isActive: boolean): string {
  return `
    <button class="reference-card ${isActive ? "reference-card-active" : ""}" type="button" data-reference-id="${reference.id}">
      <span class="reference-platform">${escapeHtml(reference.platform)}</span>
      <strong>${escapeHtml(reference.title)}</strong>
      <p>${escapeHtml(reference.summary)}</p>
      <div class="meta-row">
        <span>${formatDate(reference.createdAt)}</span>
        <span>${reference.assetCount} asset${reference.assetCount === 1 ? "" : "s"}</span>
      </div>
      <div class="signal-cloud signal-cloud-tight">${renderSignalChips(reference.themes.slice(0, 2))}</div>
    </button>
  `;
}

function getIdeaReferenceOptions(): ReferenceSummary[] {
  const selectedIds = new Set(state.ideaForm.referenceIds);
  const selected = state.catalog.references.filter((reference) => selectedIds.has(reference.id));
  const recent = state.catalog.references.filter((reference) => !selectedIds.has(reference.id)).slice(0, 8);
  return [...selected, ...recent].slice(0, 10);
}

function getActiveIdeaReferences(): ReferenceSummary[] {
  const selectedIds = new Set(state.ideaForm.referenceIds);
  if (selectedIds.size > 0) {
    return state.catalog.references.filter((reference) => selectedIds.has(reference.id));
  }
  return state.snapshot?.notableReferences.slice(0, 3) ?? [];
}

function renderIdeaReferenceStackCard(reference: ReferenceSummary): string {
  return `
    <article class="idea-reference-card">
      <div class="meta-row">
        <span>${escapeHtml(reference.sourceKind)}</span>
        <span>${escapeHtml(reference.collection ?? reference.platform)}</span>
      </div>
      <strong>${escapeHtml(reference.title)}</strong>
      <p>${escapeHtml(reference.summary)}</p>
      <div class="signal-cloud signal-cloud-tight">
        ${renderSignalChips([...reference.themes.slice(0, 2), ...reference.toneSignals.slice(0, 1)])}
      </div>
      ${
        reference.moments.length > 0
          ? `
            <ul class="detail-list compact-list">
              ${reference.moments.slice(0, 2).map((moment) => `<li><strong>${escapeHtml(moment.label)}:</strong> ${escapeHtml(moment.description)}</li>`).join("")}
            </ul>
          `
          : ""
      }
      <div class="detail-inline-actions">
        <button class="link-btn" type="button" data-open-reference="${reference.id}">Inspect reference</button>
        <button class="link-btn" type="button" data-query-open-page="${escapeAttribute(reference.pagePath)}">Open wiki page</button>
      </div>
    </article>
  `;
}

function renderContextStrip(title: string, excerpt: string, kind: "constitution" | "not-me"): string {
  const safeExcerpt = excerpt.trim() ? truncateText(excerpt.trim(), 220) : "No excerpt available yet.";
  const pagePath = kind === "constitution" ? "wiki/style-constitution.md" : "wiki/not-me.md";
  return `
    <article class="context-strip context-strip-${kind}">
      <span class="eyebrow">${escapeHtml(title)}</span>
      <p>${escapeHtml(safeExcerpt)}</p>
      <div class="detail-inline-actions">
        <button class="link-btn" type="button" data-query-open-page="${escapeAttribute(pagePath)}">Open in Studio</button>
      </div>
    </article>
  `;
}

function renderIdeaSessionSummary(): string {
  if (!state.ideas) return "";
  const session = state.ideas.session;
  return `
    <article class="idea-session-card">
      <div class="surface-head surface-head-compact">
        <div>
          <span class="eyebrow">Latest session</span>
          <h2>${escapeHtml(session.summary)}</h2>
        </div>
      </div>
      <div class="meta-row">
        <span>${escapeHtml(formatDateTime(state.ideas.generatedAt))}</span>
        <span>${escapeHtml(session.outputType)}</span>
      </div>
      <div class="detail-block">
        <span class="detail-label">Patterns reinforced</span>
        <div class="signal-cloud signal-cloud-tight">
          ${session.learnedPatterns.length > 0
            ? session.learnedPatterns.map((pattern) => `<span class="signal-chip">${escapeHtml(pattern)}</span>`).join("")
            : `<span class="signal-chip signal-chip-empty">No explicit pattern callouts</span>`}
        </div>
      </div>
      <div class="detail-block">
        <span class="detail-label">Open questions</span>
        ${
          session.openQuestions.length > 0
            ? `<ul class="detail-list compact-list">${session.openQuestions.map((question) => `<li>${escapeHtml(question)}</li>`).join("")}</ul>`
            : `<p class="empty-copy">No open questions were saved for this run.</p>`
        }
      </div>
    </article>
  `;
}

function renderMemoryQueryCard(entry: QueryIndexEntry): string {
  const canOpenStudio = entry.path.endsWith(".md");
  const sourceCount = entry.sourceIds.length;
  return `
    <article class="prompt-card memory-query-card">
      <span class="reference-platform">${escapeHtml(entry.kind)}</span>
      <strong>${escapeHtml(entry.title)}</strong>
      <p>${escapeHtml(entry.summary)}</p>
      <div class="meta-row">
        <span>${sourceCount} source${sourceCount === 1 ? "" : "s"}</span>
        <span>${entry.dates.updatedAt ? formatDate(entry.dates.updatedAt) : entry.dates.createdAt ? formatDate(entry.dates.createdAt) : "Derived"}</span>
      </div>
      <div class="detail-inline-actions">
        ${sourceCount > 0
          ? `<button class="pill-btn pill-btn-solid" type="button" data-query-source-ids="${escapeAttribute(entry.sourceIds.join(","))}" data-query-summary="${escapeAttribute(entry.summary)}">Use sources in ideas</button>`
          : ""}
        ${canOpenStudio
          ? `<button class="pill-btn" type="button" data-query-open-page="${escapeAttribute(entry.path)}">Open in Studio</button>`
          : ""}
      </div>
    </article>
  `;
}

function renderReferenceDetail(reference: ReferenceSummary): string {
  const relatedReferences = reference.relatedReferenceIds
    .map((id) => state.catalog.references.find((candidate) => candidate.id === id))
    .filter((item): item is ReferenceSummary => item != null);
  return `
    <header class="surface-head">
      <div>
        <span class="eyebrow">${escapeHtml(reference.platform)}</span>
        <h2>${escapeHtml(reference.title)}</h2>
      </div>
      <div class="hero-actions">
        <button class="pill-btn pill-btn-solid" type="button" id="reference-use-idea">Use in ideas</button>
        <button class="pill-btn" type="button" id="reference-open-studio">Open Studio</button>
      </div>
    </header>
    <p class="lede">${escapeHtml(reference.summary)}</p>
    <div class="detail-block">
      <span class="detail-label">Capture context</span>
      <ul class="detail-list">
        <li>Source kind: ${escapeHtml(reference.sourceKind)}</li>
        <li>Saved reason: ${escapeHtml(reference.savedReason ?? "None")}</li>
        <li>Collection: ${escapeHtml(reference.collection ?? "None")}</li>
        <li>Project IDs: ${escapeHtml(reference.projectIds.join(", ") || "None")}</li>
        <li>Analyzed from: ${escapeHtml(describeTranscriptSource(reference.transcriptSource))}</li>
      </ul>
    </div>
    <div class="detail-block">
      <span class="detail-label">Themes</span>
      <div class="signal-cloud">${renderSignalChips(reference.themes)}</div>
    </div>
    <div class="detail-block">
      <span class="detail-label">Motifs</span>
      <div class="signal-cloud">${renderSignalChips(reference.motifs)}</div>
    </div>
    <div class="detail-block">
      <span class="detail-label">Formats</span>
      <div class="signal-cloud">${renderSignalChips(reference.formatSignals)}</div>
    </div>
    <div class="detail-block">
      <span class="detail-label">Creators</span>
      <div class="signal-cloud">${renderSignalChips(reference.creatorSignals)}</div>
    </div>
    <div class="detail-block">
      <span class="detail-label">Tone</span>
      <div class="signal-cloud">${renderSignalChips(reference.toneSignals)}</div>
    </div>
    <div class="detail-block">
      <span class="detail-label">Visual cues</span>
      <div class="signal-cloud">${renderSignalChips(reference.visualSignals)}</div>
    </div>
    <div class="detail-block">
      <span class="detail-label">Audio cues</span>
      <div class="signal-cloud">${renderSignalChips(reference.audioSignals)}</div>
    </div>
    <div class="detail-block">
      <span class="detail-label">Pacing</span>
      <div class="signal-cloud">${renderSignalChips(reference.pacingSignals)}</div>
    </div>
    <div class="detail-block">
      <span class="detail-label">Story moves</span>
      <div class="signal-cloud">${renderSignalChips(reference.storySignals)}</div>
    </div>
    <div class="detail-block">
      <span class="detail-label">Moments</span>
      ${
        reference.moments.length > 0
          ? `<ul class="detail-list">${reference.moments.map((moment) => `<li><strong>${escapeHtml(moment.label)}:</strong> ${escapeHtml(moment.description)}</li>`).join("")}</ul>`
          : `<p class="empty-copy">No scene-level moments surfaced yet.</p>`
      }
    </div>
    <div class="detail-block">
      <span class="detail-label">Related references</span>
      ${
        relatedReferences.length > 0
          ? relatedReferences
              .map(
                (related) => `
                  <button class="reference-inline-pill" type="button" data-reference-id="${related.id}">
                    ${escapeHtml(related.title)}
                  </button>
                `,
              )
              .join("")
          : `<p class="empty-copy">No related trail surfaced yet.</p>`
      }
    </div>
    ${
      reference.note
        ? `
      <div class="detail-block">
        <span class="detail-label">Saved note</span>
        <p class="detail-note">${escapeHtml(reference.note)}</p>
      </div>
    `
        : ""
    }
    <div class="detail-block">
      <span class="detail-label">Open questions</span>
      ${
        reference.openQuestions.length > 0
          ? `<ul class="detail-list">${reference.openQuestions.map((question) => `<li>${escapeHtml(question)}</li>`).join("")}</ul>`
          : `<p class="empty-copy">No explicit uncertainty flagged.</p>`
      }
    </div>
    <div class="detail-block">
      <span class="detail-label">Tensions</span>
      ${
        reference.contradictions.length > 0
          ? `<ul class="detail-list">${reference.contradictions.map((line) => `<li>${escapeHtml(line)}</li>`).join("")}</ul>`
          : `<p class="empty-copy">No internal contradiction surfaced.</p>`
      }
    </div>
    <div class="detail-block">
      <span class="detail-label">Provenance</span>
      <ul class="detail-list">
        <li>Source IDs: ${escapeHtml(reference.provenance.sourceIds.join(", ") || "None")}</li>
        <li>Paths: ${escapeHtml(reference.provenance.sourcePaths.join(", ") || "None")}</li>
        <li>Compiled: ${escapeHtml(formatDateTime(reference.provenance.compiledAt))}</li>
      </ul>
    </div>
    <div class="detail-block detail-inline-actions">
      <button class="pill-btn pill-btn-muted" type="button" id="reference-rerun-analysis">Re-run local analysis</button>
      <a class="pill-btn" href="${escapeAttribute(reference.sourceUrl)}" target="_blank" rel="noreferrer">Open source</a>
    </div>
  `;
}

function renderIdeaBody(body: string): string {
  const markerRe = /\[(YOUR LINE|YOUR MOMENT): ([^\]]+)\]/g;
  const parts: string[] = [];
  let lastIndex = 0;
  let match: RegExpExecArray | null;
  while ((match = markerRe.exec(body)) !== null) {
    if (match.index > lastIndex) {
      parts.push(escapeHtml(body.slice(lastIndex, match.index)));
    }
    const prompt = match[2]!;
    parts.push(
      `<span class="personal-prompt"><span class="personal-prompt-label">your words</span>${escapeHtml(prompt)}</span>`,
    );
    lastIndex = match.index + match[0].length;
  }
  if (lastIndex < body.length) {
    parts.push(escapeHtml(body.slice(lastIndex)));
  }
  return parts.join("");
}

function renderIdeaCard(title: string, body: string, rationale: string, citations: string[], personalMoments: PersonalMoment[] = []): string {
  const hasPrompts = personalMoments.length > 0;
  return `
    <article class="idea-card${hasPrompts ? " idea-card-has-prompts" : ""}">
      <header>
        <strong>${escapeHtml(title)}</strong>
      </header>
      <pre class="idea-body">${renderIdeaBody(body)}</pre>
      <p>${escapeHtml(rationale)}</p>
      ${
        hasPrompts
          ? `
            <div class="idea-prompt-list">
              <span class="detail-label">Still yours to write</span>
              <ul class="detail-list compact-list">
                ${personalMoments.map((moment) => `<li>${escapeHtml(moment.prompt)}</li>`).join("")}
              </ul>
            </div>
          `
          : ""
      }
      <footer>${renderCitationPills(citations)}</footer>
    </article>
  `;
}

function renderCitationPills(citations: string[]): string {
  if (citations.length === 0) return "No citations";
  const contextReferences = [
    ...(state.ideas?.context.selectedReferences ?? []),
    ...(state.ideas?.context.relatedReferences ?? []),
    ...state.catalog.references,
  ];
  const byId = new Map(contextReferences.map((reference) => [reference.id, reference] as const));
  return `
    <div class="citation-row">
      ${citations
        .map((citation) => {
          const reference = byId.get(citation);
          return `
            <button class="citation-pill" type="button" data-open-reference="${citation}">
              ${escapeHtml(reference?.title ?? citation)}
            </button>
          `;
        })
        .join("")}
    </div>
  `;
}

function renderSignalChips(signals: SignalTag[]): string {
  if (signals.length === 0) {
    return `<span class="signal-chip signal-chip-empty">Still collecting signal</span>`;
  }
  return signals
    .map(
      (signal) => `
        <span class="signal-chip">
          <strong>${escapeHtml(signal.label)}</strong>
        </span>
      `,
    )
    .join("");
}

function renderMiniSignalPills(signals: SignalTag[]): string {
  if (signals.length === 0) {
    return `<span class="memory-mini-pill memory-mini-pill-empty">Still collecting signals</span>`;
  }
  return signals
    .map(
      (signal) => `
        <span class="memory-mini-pill">${escapeHtml(signal.label)}</span>
      `,
    )
    .join("");
}

function renderFilterSelect(
  name: keyof ReferenceFiltersState,
  label: string,
  items: Array<{ slug: string; label: string; count: number }>,
  selected: string,
): string {
  return `
    <label class="field">
      <span>${label}</span>
      <select name="${name}">
        <option value="">All</option>
        ${items
          .map(
            (item) => `
              <option value="${escapeAttribute(item.slug)}" ${selected === item.slug ? "selected" : ""}>
                ${escapeHtml(item.label)} (${item.count})
              </option>
            `,
          )
          .join("")}
      </select>
    </label>
  `;
}

async function fetchJson<T>(url: string, init?: RequestInit): Promise<T> {
  const response = await fetch(url, init);
  if (!response.ok) {
    const data = (await response.json().catch(() => ({}))) as { error?: string };
    throw new Error(data.error ?? response.statusText);
  }
  return (await response.json()) as T;
}

function readFileAsDataUrl(file: File): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error ?? new Error("failed to read file"));
    reader.readAsDataURL(file);
  });
}

function formatDate(value: string): string {
  return new Date(value).toLocaleDateString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function formatDateTime(value: string): string {
  return new Date(value).toLocaleString(undefined, {
    month: "short",
    day: "numeric",
    year: "numeric",
    hour: "numeric",
    minute: "2-digit",
  });
}

function normalizeBriefDeliverable(value: string): BriefFormState["deliverableType"] {
  if (value === "hooks" || value === "shotlist" || value === "concept") return value;
  return "script";
}

function truncateText(value: string, max: number): string {
  return value.length > max ? `${value.slice(0, max - 1)}…` : value;
}

function describeTranscriptSource(source: string | null | undefined): string {
  switch (source) {
    case "web-article": return "article body extracted";
    case "youtube": return "YouTube transcript";
    case "podcast-page": return "podcast page transcript";
    case "podcast-rss": return "podcast RSS transcript";
    case "audio-upload": return "audio transcribed";
    case "manual": return "manual transcript";
    default: return "metadata only (no body text)";
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function escapeAttribute(value: string): string {
  return escapeHtml(value).replace(/'/g, "&#39;");
}

function skeletonCards(n: number): string {
  return Array.from({ length: n }, () =>
    `<div class="skeleton-card">
      <div class="skeleton-line" style="width:55%"></div>
      <div class="skeleton-line" style="width:78%"></div>
      <div class="skeleton-line"></div>
    </div>`,
  ).join("");
}

void main().catch((error) => {
  console.error(error);
  const home = document.getElementById("view-home");
  if (home) {
    home.innerHTML = `<section class="surface-card"><p class="inline-error">${escapeHtml(String(error))}</p></section>`;
  }
});
