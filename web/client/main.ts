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
  ReferenceMoment,
  ReferenceSummary,
  ReferencesResponse,
  SignalTag,
  SourceKind,
  TasteSnapshot,
} from "../shared/contracts.js";
import { createElement } from "react";
import { createRoot, type Root } from "react-dom/client";
import { StudioController, buildStudioUrl } from "./studio.js";
import { ExpandingSearchDock } from "./components/ui/expanding-search-dock-shadcnui.js";
import { ReferenceSearchResults, type SearchReferenceCardItem } from "./components/ui/reference-search-results.js";
import { mountHomeView } from "./home/index.js";
import { initButtonMotion } from "./lib/button-motion.js";
import { initCardMotion } from "./lib/card-motion.js";
import { PromptInputBox, type PromptSendPayload } from "./components/ui/ai-prompt-box.js";

type ViewName = "home" | "capture" | "references" | "ideas" | "studio";
type ReferenceSearchMediaType = "all" | "webpages" | "videos" | "quotes" | "x-posts" | "images" | "articles" | "notes";

interface AppConfig {
  author: string;
  wikiRoot: string;
  productName: string;
  wikiTitle: string;
}

interface ReferenceFiltersState {
  mediaType: ReferenceSearchMediaType;
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

interface SearchResultLayout {
  colSpan?: number;
  rowSpan?: number;
  hasPersistentHover?: boolean;
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
  captureCollection: string | null;
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
    mediaType: "all",
    q: "",
  },
  selectedReferenceId: null,
  memoryQuery: {
    results: [],
  },
  captureResult: null,
  captureStatus: "idle",
  captureError: null,
  captureCollection: null,
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
    title: "Search Archive",
    meta: "Type what you mean, layer on a few filters, and let the archive surface the closest references.",
  },
  ideas: {
    title: "Create Ideas",
    meta: "Build hooks, scripts, and shot lists from saved taste patterns and active references.",
  },
  studio: {
    title: "Wiki Explorer",
    meta: "Browse the compiled vault directly when you need full pages, links, and audit context.",
  },
};

let studioController: StudioController | null = null;
let capturePromptRoot: Root | null = null;
let referenceResultsRoot: Root | null = null;
let headerSearchDockRoot: Root | null = null;
let referenceRefreshRequestId = 0;
let referenceSearchDebounceId: number | null = null;
let searchViewTransitionResetId: number | null = null;

const SEARCH_VIEW_EXIT_MS = 220;
const SEARCH_VIEW_SETTLE_MS = 460;

async function main(): Promise<void> {
  state.config = await fetchJson<AppConfig>("/api/config");
  studioController = new StudioController({ author: state.config.author });
  initCardMotion();
  initButtonMotion();
  bindPointerLighting();
  bindGlobalNavigation();
  window.addEventListener("popstate", () => {
    void syncFromLocation();
  });

  // Mount React home view
  mountHomeView();

  // Listen for navigate events from React components
  document.addEventListener("aftertaste:navigate", (e: Event) => {
    const ce = e as CustomEvent<{ view: string }>;
    void navigateWithSearchTransition(ce.detail.view as ViewName);
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
  const requestId = ++referenceRefreshRequestId;
  state.referenceStatus = "loading";
  renderReferencesView();
  const params = new URLSearchParams();
  if (state.referenceFilters.q) params.set("q", state.referenceFilters.q);
  const url = params.toString() ? `/api/references?${params.toString()}` : "/api/references";
  const references = await fetchJson<ReferencesResponse>(url);
  if (requestId !== referenceRefreshRequestId) return;
  state.references = references;
  state.memoryQuery = { results: [] };
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
      void navigateWithSearchTransition(view);
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
  renderReferencesView();
  updateViewVisibility();
  updateNavState();
  renderHeader();
  if (view === "studio" && studioController) {
    await studioController.open(page);
  }
}

function clearSearchViewTransitionState(): void {
  if (searchViewTransitionResetId != null) {
    window.clearTimeout(searchViewTransitionResetId);
    searchViewTransitionResetId = null;
  }
  document.getElementById("workspace-shell")?.removeAttribute("data-search-transition");
  document.getElementById("view-home")?.classList.remove("is-search-transitioning-out", "is-search-transitioning-in");
  document.getElementById("view-references")?.classList.remove("is-search-transitioning-out", "is-search-transitioning-in");
}

async function navigateWithSearchTransition(view: ViewName, extras?: { page?: string; replace?: boolean }): Promise<void> {
  const isHomeToReferences = state.view === "home" && view === "references";
  const isReferencesToHome = state.view === "references" && view === "home";

  if (!isHomeToReferences && !isReferencesToHome) {
    clearSearchViewTransitionState();
    await navigate(view, extras);
    return;
  }

  clearSearchViewTransitionState();

  const workspaceShell = document.getElementById("workspace-shell");
  const outgoingViewId = isHomeToReferences ? "view-home" : "view-references";
  const incomingViewId = isHomeToReferences ? "view-references" : "view-home";
  const outgoingPanel = document.getElementById(outgoingViewId);

  workspaceShell?.setAttribute("data-search-transition", isHomeToReferences ? "to-references" : "to-home");
  outgoingPanel?.classList.add("is-search-transitioning-out");

  await new Promise((resolve) => window.setTimeout(resolve, SEARCH_VIEW_EXIT_MS));

  outgoingPanel?.classList.remove("is-search-transitioning-out");
  await navigate(view, extras);

  const incomingPanel = document.getElementById(incomingViewId);
  incomingPanel?.classList.add("is-search-transitioning-in");

  searchViewTransitionResetId = window.setTimeout(() => {
    clearSearchViewTransitionState();
  }, SEARCH_VIEW_SETTLE_MS);
}

async function navigate(view: ViewName, extras?: { page?: string; replace?: boolean }): Promise<void> {
  state.view = view;
  if (extras?.page) state.studioPage = extras.page;
  const url = buildViewUrl(view, extras?.page ?? state.studioPage);
  if (extras?.replace) history.replaceState({ view, page: state.studioPage }, "", url);
  else history.pushState({ view, page: state.studioPage }, "", url);
  renderReferencesView();
  updateViewVisibility();
  updateNavState();
  renderHeader();
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
  // Home view is handled by React (mounts into #view-home)
  renderCaptureView();
  renderReferencesView();
  renderIdeasView();
  updateViewVisibility();
  updateNavState();
  // Notify React components that data has refreshed
  document.dispatchEvent(new CustomEvent("aftertaste:refresh"));
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
  const dockNode = document.getElementById("header-search-dock-root");
  if (dockNode) {
    if (!headerSearchDockRoot) {
      headerSearchDockRoot = createRoot(dockNode);
    }
    headerSearchDockRoot.render(
      createElement(ExpandingSearchDock, {
        expanded: state.view === "references",
        query: state.referenceFilters.q,
        placeholder: "Search my archive...",
        filters: REFERENCE_MEDIA_TYPES,
        activeFilter: state.referenceFilters.mediaType,
        onExpand: () => {
          if (referenceSearchDebounceId != null) {
            window.clearTimeout(referenceSearchDebounceId);
            referenceSearchDebounceId = null;
          }
          state.referenceFilters = { mediaType: "all", q: "" };
          void refreshReferences();
          void navigateWithSearchTransition("references");
        },
        onCollapse: () => {
          if (referenceSearchDebounceId != null) {
            window.clearTimeout(referenceSearchDebounceId);
            referenceSearchDebounceId = null;
          }
          state.referenceFilters = { mediaType: "all", q: "" };
          void navigateWithSearchTransition("home").then(() => {
            void refreshReferences();
          });
        },
        onQueryChange: (query: string) => {
          state.referenceFilters.q = query;
          renderHeader();
          if (referenceSearchDebounceId != null) {
            window.clearTimeout(referenceSearchDebounceId);
          }
          referenceSearchDebounceId = window.setTimeout(() => {
            void refreshReferences();
          }, 180);
        },
        onSearch: () => {
          void refreshReferences();
        },
        onFilterSelect: (value: string) => {
          const mediaType = (value as ReferenceSearchMediaType) ?? "all";
          state.referenceFilters.mediaType = state.referenceFilters.mediaType === mediaType ? "all" : mediaType;
          renderHeader();
          void refreshReferences();
        },
      }),
    );
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
  const signalScore = Math.min(
    98,
    Math.max(24, Math.round(((snapshot.themes.length * 2 + snapshot.motifs.length + snapshot.creatorPatterns.length) / Math.max(1, referenceCount + 3)) * 28)),
  );
  const promptScore = Math.min(
    96,
    Math.max(18, Math.round((promptSeedCount / Math.max(1, promptSeedCount + questionCount + 1)) * 100)),
  );
  const marqueeItems = [
    `${referenceCount} ${referenceCount === 1 ? "reference" : "references"}`,
    `${captureCount} ${captureCount === 1 ? "capture" : "captures"}`,
    leadTheme,
    leadMotif,
    leadPattern,
    topPlatforms,
  ];
  container.innerHTML = `
    <section class="home-stage">
      <section class="hero-card hero-card-orbit">
        <div class="hero-orbit-grid" aria-hidden="true"></div>
        <div class="hero-copy hero-copy-orbit">
          <div class="hero-chip-row">
            <span class="workspace-pill workspace-pill-soft">Window · ${escapeHtml(snapshot.window.label)}</span>
            <span class="workspace-pill workspace-pill-soft">${promptSeedCount} prompt seed${promptSeedCount === 1 ? "" : "s"}</span>
            <span class="workspace-pill workspace-pill-soft">${questionCount} open question${questionCount === 1 ? "" : "s"}</span>
          </div>
          <span class="eyebrow">Private taste operating system</span>
          <h1>Build the next idea from what your archive already knows.</h1>
          <p class="hero-summary">${escapeHtml(snapshot.summary)}</p>
          <p class="hero-meta-line">${referenceCount} references saved locally · ${captureCount} captures processed · ${escapeHtml(topPlatforms)}</p>
          <div class="hero-actions">
            <button class="pill-btn pill-btn-solid" type="button" data-home-action="capture">Capture something</button>
            <button class="pill-btn" type="button" data-home-action="ideas">Turn this into ideas</button>
            <button class="pill-btn pill-btn-muted" type="button" data-home-action="studio">Browse Wiki</button>
          </div>
          <div class="hero-stat-band">
            <article class="hero-stat-tile">
              <span class="detail-label">Lead theme</span>
              <strong>${escapeHtml(leadTheme)}</strong>
              <p>${escapeHtml(snapshot.window.label)} archive weather with emphasis on what keeps resurfacing.</p>
            </article>
            <article class="hero-stat-tile">
              <span class="detail-label">Motif pulse</span>
              <strong>${escapeHtml(leadMotif)}</strong>
              <p>The strongest craft move currently repeating across the snapshot.</p>
            </article>
            <article class="hero-stat-tile">
              <span class="detail-label">Voice signature</span>
              <strong>${escapeHtml(leadPattern)}</strong>
              <p>${promptSeedCount} prompt seed${promptSeedCount === 1 ? "" : "s"} already phrased in the archive's own language.</p>
            </article>
          </div>
        </div>

        <div class="hero-side-stack">
          <article class="hero-glass-card hero-glass-card-spotlight">
            <div class="hero-card-head">
              <div>
                <span class="eyebrow">Archive pulse</span>
                <h2>Signal is condensing into a usable point of view.</h2>
              </div>
              <span class="hero-card-kicker">${referenceCount} local refs</span>
            </div>

            <div class="hero-metric-block">
              <div>
                <span class="hero-metric-value">${signalScore}%</span>
                <span class="hero-metric-label">taste signal density</span>
              </div>
              <div class="hero-progress-stack">
                <div class="hero-progress-row">
                  <span>Signal read</span>
                  <strong>${signalScore}%</strong>
                </div>
                <div class="hero-progress-track"><span style="width:${signalScore}%"></span></div>
                <div class="hero-progress-row">
                  <span>Prompt readiness</span>
                  <strong>${promptScore}%</strong>
                </div>
                <div class="hero-progress-track hero-progress-track-mint"><span style="width:${promptScore}%"></span></div>
              </div>
            </div>

            <div class="hero-mini-grid">
              <div class="hero-mini-stat">
                <strong>${captureCount}</strong>
                <span>captures processed</span>
              </div>
              <div class="hero-mini-stat">
                <strong>${snapshot.notableReferences.length}</strong>
                <span>active anchors</span>
              </div>
              <div class="hero-mini-stat">
                <strong>${questionCount}</strong>
                <span>open tensions</span>
              </div>
            </div>

            <div class="hero-tag-row">
              <span class="hero-tag hero-tag-live">Local-first</span>
              <span class="hero-tag">Vault-backed</span>
              <span class="hero-tag">Voice-preserving</span>
            </div>
          </article>

          <article class="hero-glass-card hero-marquee-card">
            <div class="hero-card-head">
              <div>
                <span class="eyebrow">Archive atmosphere</span>
                <h2>Everything shaping the current moodboard.</h2>
              </div>
            </div>
            <div class="orbit-marquee">
              <div class="orbit-marquee-track">
                ${renderOrbitMarquee(marqueeItems)}
              </div>
            </div>
            <div class="memory-board memory-board-compact">
              <article class="memory-note memory-note-feature note-peach">
                <span class="note-label">dominant theme</span>
                <strong>${escapeHtml(leadTheme)}</strong>
                <div class="memory-mini-pills">${renderMiniSignalPills(snapshot.themes.slice(0, 3))}</div>
              </article>
              <article class="memory-note note-blue">
                <span class="note-label">top motif</span>
                <strong>${escapeHtml(leadMotif)}</strong>
                <div class="memory-mini-pills">${renderMiniSignalPills(snapshot.motifs.slice(0, 3))}</div>
              </article>
            </div>
          </article>
        </div>
      </section>

      <section class="stack-grid home-grid-top">
        <article class="surface-card surface-card-spotlight">
        <header class="surface-head">
          <div>
            <span class="eyebrow">Themes</span>
            <h2>Threads your archive keeps pulling</h2>
          </div>
        </header>
        <div class="signal-cloud">${renderFilterableSignalChips(snapshot.themes, "theme")}</div>
      </article>

      <article class="surface-card surface-card-spotlight">
        <header class="surface-head">
          <div>
            <span class="eyebrow">Motifs</span>
            <h2>Craft moves you seem to trust instinctively</h2>
          </div>
        </header>
        <div class="signal-cloud">${renderFilterableSignalChips(snapshot.motifs, "motif")}</div>
      </article>
      </section>

      <section class="stack-grid home-grid-middle">
        <article class="surface-card surface-card-story">
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
                      ${renderSupportingReferencePills(pattern.sourceReferenceIds)}
                    </article>
                  `,
                )
                .join("")
            : `<p class="empty-copy">Save a few references and the pattern layer will start to sharpen.</p>`}
        </div>
      </article>

      <article class="surface-card surface-card-story">
        <header class="surface-head">
          <div>
            <span class="eyebrow">Prompt seeds</span>
            <h2>Ways to turn memory into output</h2>
          </div>
        </header>
        <div class="prompt-list">
          ${snapshot.promptSeeds.length > 0
            ? snapshot.promptSeeds
                .map(
                  (seed, index) => `
                    <button class="prompt-card" type="button" data-seed-index="${index}">
                      <strong>${escapeHtml(seed.title)}</strong>
                      <p>${escapeHtml(seed.prompt)}</p>
                    </button>
                  `,
                )
                .join("")
            : `<p class="empty-copy">The archive needs a little more grounded signal before it can suggest useful prompts here.</p>`}
        </div>
      </article>
      </section>

      <section class="stack-grid home-grid-middle">
        <article class="surface-card surface-card-story">
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
                      ${renderSupportingReferencePills(tension.referenceIds)}
                    </article>
                  `,
                )
                .join("")
            : `<p class="empty-copy">No tensions are explicit yet. They will surface once the archive has stronger internal contrast.</p>`}
        </div>
      </article>

      <article class="surface-card surface-card-story">
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

      <section class="stack-grid home-grid-bottom">
        <article class="surface-card surface-card-story">
          <header class="surface-head">
            <div>
              <span class="eyebrow">References</span>
              <h2>What is shaping the current moodboard</h2>
            </div>
            <button class="link-btn" id="home-references" type="button">Browse all references</button>
          </header>
          <div class="reference-strip reference-strip-wide">
            ${snapshot.notableReferences.length > 0
              ? snapshot.notableReferences.map((reference) => renderReferenceStripCard(reference)).join("")
              : `<p class="empty-copy">No references yet. Capture your first link to start compiling the archive.</p>`}
          </div>
        </article>

        <article class="surface-card surface-card-story">
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
        </article>
      </section>

      <section class="home-finale">
        <div class="home-finale-marquee">
          <div class="home-finale-marquee-track">${renderOrbitMarquee(marqueeItems)}</div>
        </div>
        <div class="home-finale-content">
          <span class="eyebrow">Next move</span>
          <h2>Keep the capture loop moving while the vault sharpens your voice.</h2>
          <p>The archive is most useful when capture, recall, and idea-making feel like one continuous surface instead of three different chores.</p>
          <div class="hero-actions">
            <button class="pill-btn pill-btn-solid" type="button" data-home-action="capture">Open capture desk</button>
            <button class="pill-btn" type="button" data-home-action="ideas">Open create ideas</button>
            <button class="pill-btn pill-btn-muted" type="button" data-home-action="studio">Open wiki explorer</button>
          </div>
        </div>
        <div class="home-finale-word" aria-hidden="true">AFTERTASTE</div>
      </section>
    </section>
  `;

  container.querySelectorAll<HTMLButtonElement>("[data-home-action]").forEach((button) => {
    button.addEventListener("click", () => {
      const action = button.getAttribute("data-home-action");
      if (action === "capture") {
        void navigate("capture");
        return;
      }
      if (action === "ideas") {
        state.ideaForm.referenceIds = snapshot.notableReferences.slice(0, 3).map((reference) => reference.id);
        state.ideaForm.brief = snapshot.promptSeeds[0]?.prompt ?? state.ideaForm.brief;
        renderIdeasView();
        void navigate("ideas");
        return;
      }
      if (action === "studio") {
        void navigate("studio", { page: "wiki/snapshots/current.md" });
      }
    });
  });
  document.getElementById("home-references")?.addEventListener("click", () => {
    void navigateWithSearchTransition("references");
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
  container.querySelectorAll<HTMLButtonElement>("[data-signal-filter-kind]").forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.getAttribute("data-signal-filter");
      if (!value) return;
      state.referenceFilters.mediaType = "all";
      state.referenceFilters.q = value;
      void refreshReferences().then(() => navigateWithSearchTransition("references"));
    });
  });
  container.querySelectorAll<HTMLButtonElement>("[data-open-reference]").forEach((button) => {
    button.addEventListener("click", () => {
      const id = button.getAttribute("data-open-reference");
      if (!id) return;
      state.selectedReferenceId = id;
      renderReferencesView();
      void navigateWithSearchTransition("references");
    });
  });
}

function renderOrbitMarquee(items: string[]): string {
  const safeItems = items.filter((item) => item.trim().length > 0);
  const repeated = [...safeItems, ...safeItems];
  return repeated
    .map(
      (item) => `
        <span class="orbit-marquee-item">${escapeHtml(item)}</span>
      `,
    )
    .join("");
}

function unmountCapturePrompt(): void {
  if (!capturePromptRoot) return;
  capturePromptRoot.unmount();
  capturePromptRoot = null;
}

function unmountReferenceResults(): void {
  if (!referenceResultsRoot) return;
  referenceResultsRoot.unmount();
  referenceResultsRoot = null;
}

function inferPromptCaptureSourceKind(message: string, files: File[], sourceUrl: string | null): SourceKind {
  if (sourceUrl) return "reference";
  if (files.some((file) => file.type.startsWith("audio/"))) return "voice-note";
  if (files.some((file) => file.type.startsWith("image/") || file.type.startsWith("video/"))) return "moodboard";
  if (message.trim()) return "journal";
  return "reference";
}

function buildSyntheticCaptureUrl(sourceKind: SourceKind): string {
  const id = `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
  return `https://capture.aftertaste.local/${sourceKind}/${id}`;
}

function getCaptureCollectionOptions(): string[] {
  const ranked = new Map<string, number>();
  const sources = [
    ...state.captures.map((capture) => capture.collection ?? ""),
    ...state.catalog.references.map((reference) => reference.collection ?? ""),
  ];
  for (const source of sources) {
    const value = source.trim();
    if (!value) continue;
    ranked.set(value, (ranked.get(value) ?? 0) + 1);
  }
  return Array.from(ranked.entries())
    .sort((left, right) => right[1] - left[1] || left[0].localeCompare(right[0]))
    .slice(0, 8)
    .map(([value]) => value);
}

function parseCapturePromptMessage(message: string): { sourceUrl: string | null; note: string } {
  const match = message.match(/https?:\/\/[^\s<>"']+/i);
  if (!match || typeof match.index !== "number") {
    return { sourceUrl: null, note: message.trim() };
  }
  const rawUrl = match[0].replace(/[),.;!?]+$/, "");
  const before = message.slice(0, match.index).trim();
  const after = message.slice(match.index + match[0].length).trim();
  return {
    sourceUrl: rawUrl,
    note: [before, after].filter(Boolean).join("\n\n"),
  };
}

function renderCaptureView(): void {
  const container = document.getElementById("view-capture");
  if (!container) return;
  unmountCapturePrompt();
  const result = state.captureResult;
  const collectionOptions = getCaptureCollectionOptions();
  container.innerHTML = `
    <section class="capture-landing">
      <article class="capture-stage">
        <div class="capture-stage-copy">
          <span class="eyebrow">Capture</span>
          <h1>Ready to drop something in?</h1>
          <p>Paste a link, speak a voice note, or throw in screenshots and loose thoughts. One possible next move is to trust the archive to organize what you hand it.</p>
        </div>
        <div class="capture-stage-chat" id="capture-prompt-root"></div>
        ${state.captureError ? `<p class="inline-error capture-inline-error capture-stage-error">${escapeHtml(state.captureError)}</p>` : ""}
        <div class="capture-stage-actions">
          <button class="pill-btn" type="button" id="capture-compile">Rebuild vault</button>
        </div>
        ${
          result
            ? `
              <section class="surface-card success-panel capture-success-panel capture-success-inline">
                <header class="surface-head">
                  <div>
                    <span class="eyebrow">Captured</span>
                    <h2>${escapeHtml(result.reference?.title ?? result.capture.metadata.title ?? "New reference added")}</h2>
                  </div>
                </header>
                <p>${escapeHtml(result.analysis?.summary ?? "The capture was saved and folded back into the archive.")}</p>
                <div class="signal-cloud signal-cloud-tight">
                  <span class="signal-chip">${escapeHtml(result.capture.sourceKind)}</span>
                  <span class="signal-chip">${escapeHtml(result.capture.acquisitionCoverage ?? "url-only")}</span>
                  ${result.capture.collection ? `<span class="signal-chip">${escapeHtml(result.capture.collection)}</span>` : ""}
                </div>
                <div class="hero-actions">
                  <button class="pill-btn pill-btn-solid" id="capture-view-home">See snapshot</button>
                  <button class="pill-btn" id="capture-open-ideas">Use this in ideas</button>
                </div>
              </section>
            `
            : ""
        }
        <div class="capture-stage-word" aria-hidden="true">CAPTURE</div>
      </article>
    </section>
  `;

  const promptRootNode = document.getElementById("capture-prompt-root");
  if (promptRootNode) {
    capturePromptRoot = createRoot(promptRootNode);
    capturePromptRoot.render(
      createElement(PromptInputBox, {
        isLoading: state.captureStatus === "saving",
        collectionOptions,
        selectedCollection: state.captureCollection,
        onCollectionChange: (value: string | null) => {
          state.captureCollection = value;
        },
        onSend: (payload: PromptSendPayload) => {
          void handlePromptCaptureSubmit(payload);
        },
      }),
    );
  }

  document.getElementById("capture-compile")?.addEventListener("click", () => {
    void rebuildVault();
  });
  document.getElementById("capture-view-home")?.addEventListener("click", () => {
    void navigateWithSearchTransition("home");
  });
  document.getElementById("capture-open-ideas")?.addEventListener("click", () => {
    if (result?.reference?.id) {
      state.ideaForm.referenceIds = [result.reference.id];
      state.ideaForm.brief = result.analysis?.summary ?? state.ideaForm.brief;
      renderIdeasView();
    }
    void navigateWithSearchTransition("ideas");
  });
  document.getElementById("view-capture")?.addEventListener("click", (event) => {
    const btn = (event.target as HTMLElement).closest<HTMLButtonElement>(".history-delete-btn");
    if (!btn) return;
    const id = btn.dataset.captureId;
    if (!id) return;
    void handleCaptureDelete(id);
  });
}

async function handlePromptCaptureSubmit(payload: PromptSendPayload): Promise<void> {
  const parsed = parseCapturePromptMessage(payload.message);
  const appendedContext = payload.pastedContents
    .map((content) => content.trim())
    .filter((content) => content.length > 0)
    .map((content) => `Pasted context:\n${content}`);
  const note = [parsed.note, ...appendedContext].filter((segment) => segment.length > 0).join("\n\n");
  const sourceKind = inferPromptCaptureSourceKind(
    [payload.message, ...payload.pastedContents].filter(Boolean).join("\n\n"),
    payload.files,
    parsed.sourceUrl,
  );
  const sourceUrl = parsed.sourceUrl ?? buildSyntheticCaptureUrl(sourceKind);
  await handleCaptureSubmit({
    sourceUrl,
    note,
    collection: payload.collection,
    files: payload.files,
    sourceKind,
  });
}

async function handleCaptureDelete(id: string): Promise<void> {
  await fetchJson(`/api/captures/${encodeURIComponent(id)}`, { method: "DELETE" });
  state.captures = state.captures.filter((c) => c.id !== id);
  if (state.captureResult?.capture.id === id) state.captureResult = null;
  renderCaptureView();
}

async function handleCaptureSubmit(input: {
  sourceUrl: string;
  note: string;
  collection: string | null;
  files: File[];
  sourceKind: SourceKind;
}): Promise<void> {
  state.captureStatus = "saving";
  state.captureError = null;
  renderCaptureView();
  try {
    const assets = await Promise.all(
      input.files.map(async (file) => ({
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
        sourceUrl: input.sourceUrl,
        note: input.note,
        sourceKind: input.sourceKind,
        collection: input.collection ?? "",
        projectIds: [],
        assets,
      }),
    });
    state.captureResult = result;
    state.captureStatus = "idle";
    state.captureError = null;
    state.captureCollection = null;
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
  unmountReferenceResults();
  const hasSearchQuery = state.referenceFilters.q.trim().length > 0;
  const hasActiveMediaType = state.referenceFilters.mediaType !== "all";
  const hasVisibleResults = state.view === "references" || hasSearchQuery || hasActiveMediaType;
  const filteredReferences = state.references.references
    .filter((reference) => matchesReferenceMediaType(reference, state.referenceFilters.mediaType))
    .map((reference, index) => ({ reference, layout: getSearchResultLayout(index, reference) }));
  container.innerHTML = `
    ${
      hasVisibleResults
        ? `
          <section class="reference-results-surface">
            <header class="surface-head surface-head-compact">
              <div>
                <span class="eyebrow">Results</span>
                <h2>${
                  hasSearchQuery || hasActiveMediaType
                    ? `${filteredReferences.length} match${filteredReferences.length === 1 ? "" : "es"}${hasActiveMediaType ? ` · ${escapeHtml(getReferenceMediaTypeLabel(state.referenceFilters.mediaType))}` : ""}`
                    : `${filteredReferences.length} reference${filteredReferences.length === 1 ? "" : "s"} in the archive`
                }</h2>
              </div>
            </header>
            <div id="reference-results-react-root" class="reference-results-board">
              ${
                state.referenceStatus === "loading"
                  ? skeletonCards(6)
                  : filteredReferences.length > 0
                    ? ""
                    : `
                      <article class="search-empty-state">
                        <span class="eyebrow">No results</span>
                        <h3>Nothing matched that search.</h3>
                        <p>Try a different phrase, or switch the type chip if you are looking for a video, article, image, quote, or note.</p>
                      </article>
                    `
              }
            </div>
          </section>
        `
        : ""
    }
  `;
  if (!hasVisibleResults || state.referenceStatus === "loading" || filteredReferences.length === 0) return;
  const rootNode = document.getElementById("reference-results-react-root");
  if (!rootNode) return;
  const items: SearchReferenceCardItem[] = filteredReferences.map(({ reference, layout }) => {
    const mediaType = classifyReferenceMediaType(reference);
    return {
      id: reference.id,
      title: reference.title,
      excerpt: truncateText(reference.summary, layout.colSpan === 2 ? 190 : 132),
      image: getReferenceCardImage(reference),
      mediaType,
      status: getReferenceMediaTypeLabel(mediaType),
      authorName: reference.platform,
      date: formatDate(reference.createdAt),
      readTime: getReferenceCardReadTime(reference),
      tags: getReferenceCardTags(reference),
      colSpan: layout.colSpan,
      rowSpan: layout.rowSpan,
      hasPersistentHover: layout.hasPersistentHover,
      onOpen: () => {
        void navigate("studio", { page: reference.pagePath });
      },
      onAction: () => {
        state.ideaForm.referenceIds = Array.from(new Set([reference.id, ...state.ideaForm.referenceIds])).slice(0, 4);
        if (!state.ideaForm.brief.trim()) {
          state.ideaForm.brief = reference.summary;
        }
        renderIdeasView();
        void navigate("ideas");
      },
    };
  });
  referenceResultsRoot = createRoot(rootNode);
  referenceResultsRoot.render(createElement(ReferenceSearchResults, { items }));
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
            <span class="eyebrow">Create Ideas</span>
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
      void navigateWithSearchTransition("references");
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
  const workspaceShell = document.getElementById("workspace-shell");
  if (workspaceShell) {
    workspaceShell.classList.toggle("view-is-home", state.view === "home");
    workspaceShell.classList.toggle("view-is-capture", state.view === "capture");
    workspaceShell.classList.toggle("view-is-references", state.view === "references");
    workspaceShell.classList.toggle("view-is-studio", state.view === "studio");
    workspaceShell.setAttribute("data-active-view", state.view);
  }
  const siteHeader = document.querySelector<HTMLElement>(".site-header");
  if (siteHeader) {
    siteHeader.setAttribute("data-active-view", state.view);
  }
  const workspaceTopbar = document.querySelector<HTMLElement>(".workspace-topbar");
  if (workspaceTopbar) {
    workspaceTopbar.hidden = state.view === "references";
  }
  document.body.classList.toggle("capture-no-scroll", state.view === "capture");
  document.documentElement.classList.toggle("capture-no-scroll", state.view === "capture");
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
        <span class="history-mode">${escapeHtml(capture.acquisitionCoverage ?? "url-only")}</span>
        <span class="history-mode">${escapeHtml(capture.ingestionMode)}</span>
        <button class="history-delete-btn" type="button" data-capture-id="${escapeHtml(capture.id)}" title="Delete capture">×</button>
      </div>
    </article>
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
        <button class="link-btn" type="button" data-query-open-page="${escapeAttribute(pagePath)}">Open in Wiki</button>
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

function renderMemoryQueryCard(entry: QueryIndexEntry, variant = ""): string {
  if (entry.kind === "moment") {
    return renderMomentQueryCard(entry, variant);
  }
  const canOpenStudio = entry.path.endsWith(".md");
  const sourceCount = entry.sourceIds.length;
  return `
    <article class="search-result-card search-result-card-memory ${variant}">
      <div class="search-card-topline">
        <span class="reference-platform">${escapeHtml(entry.kind)}</span>
        <span class="search-card-kind">archive</span>
      </div>
      <strong>${escapeHtml(entry.title)}</strong>
      <p>${escapeHtml(entry.summary)}</p>
      <div class="meta-row">
        <span>${sourceCount} source${sourceCount === 1 ? "" : "s"}</span>
        <span>${entry.dates.updatedAt ? formatDate(entry.dates.updatedAt) : entry.dates.createdAt ? formatDate(entry.dates.createdAt) : "Derived"}</span>
      </div>
      ${entry.tags.length > 0 ? `<div class="signal-cloud signal-cloud-tight">${entry.tags.slice(0, 4).map((tag) => `<span class="signal-chip">${escapeHtml(tag.replace(/^signal:/, ""))}</span>`).join("")}</div>` : ""}
      <div class="detail-inline-actions">
        ${sourceCount > 0
          ? `<button class="pill-btn pill-btn-solid" type="button" data-query-source-ids="${escapeAttribute(entry.sourceIds.join(","))}" data-query-summary="${escapeAttribute(entry.summary)}">Use sources in ideas</button>`
          : ""}
        ${canOpenStudio
          ? `<button class="pill-btn" type="button" data-query-open-page="${escapeAttribute(entry.path)}">Open in Wiki</button>`
          : ""}
      </div>
    </article>
  `;
}

function renderMomentQueryCard(entry: QueryIndexEntry, variant = ""): string {
  const referenceId = entry.sourceIds[0] ?? "";
  const startLabel = entry.momentStartMs != null ? formatMs(entry.momentStartMs) : null;
  const endLabel = entry.momentEndMs != null ? formatMs(entry.momentEndMs) : null;
  const timeRange = startLabel ? (endLabel ? `${startLabel}–${endLabel}` : startLabel) : null;
  const signalSlugs = entry.tags.filter((t) => t.startsWith("signal:")).map((t) => t.slice(7));
  return `
    <article class="search-result-card search-result-card-memory search-result-card-moment ${variant}">
      <div class="search-card-topline">
        <span class="reference-platform">moment · ${escapeHtml(entry.momentKind ?? "beat")}</span>
        <span class="search-card-kind">archive</span>
      </div>
      <strong>${escapeHtml(entry.title)}</strong>
      ${timeRange ? `<span class="moment-timestamp">${escapeHtml(timeRange)}</span>` : ""}
      <p>${escapeHtml(entry.summary)}</p>
      ${signalSlugs.length > 0 ? `
        <div class="signal-row">
          ${signalSlugs.map((slug) => `<span class="signal-chip">${escapeHtml(slug)}</span>`).join("")}
        </div>
      ` : ""}
      <div class="detail-inline-actions">
        ${referenceId ? `<button class="pill-btn" type="button" data-open-reference="${escapeAttribute(referenceId)}">Open reference</button>` : ""}
        ${referenceId ? `<button class="pill-btn pill-btn-solid" type="button" data-query-source-ids="${escapeAttribute(referenceId)}" data-query-summary="${escapeAttribute(entry.summary)}">Use in ideas</button>` : ""}
      </div>
    </article>
  `;
}

function renderSupportingReferencePills(referenceIds: string[]): string {
  const references = referenceIds
    .map((id) => state.catalog.references.find((candidate) => candidate.id === id))
    .filter((reference): reference is ReferenceSummary => reference != null)
    .slice(0, 3);
  if (references.length === 0) return "";
  return `
    <div class="detail-inline-actions">
      ${references
        .map(
          (reference) => `
            <button class="reference-inline-pill" type="button" data-open-reference="${reference.id}">
              ${escapeHtml(reference.title)}
            </button>
          `,
        )
        .join("")}
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

  // Build a flat lookup of grounded moments from momentExcerpts
  const momentById = new Map<string, ReferenceMoment>();
  for (const moments of Object.values(state.ideas?.context.momentExcerpts ?? {})) {
    for (const moment of moments) {
      if (moment.id) momentById.set(moment.id, moment);
    }
  }

  return `
    <div class="citation-row">
      ${citations
        .map((citation) => {
          const moment = momentById.get(citation);
          if (moment) {
            // Moment citation: extract parent reference ID (format: captureId:type:index)
            const referenceId = citation.split(":")[0] ?? citation;
            const timestamp = moment.startMs != null ? formatMs(moment.startMs) : null;
            return `
              <button class="citation-pill citation-pill-moment" type="button" data-open-reference="${escapeAttribute(referenceId)}">
                ${escapeHtml(moment.label)}${timestamp ? ` · ${escapeHtml(timestamp)}` : ""}
              </button>
            `;
          }
          const reference = byId.get(citation);
          return `
            <button class="citation-pill" type="button" data-open-reference="${escapeAttribute(citation)}">
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
        <span class="signal-chip" title="${escapeAttribute(buildSignalTooltip(signal))}">
          <strong>${escapeHtml(signal.label)}</strong>
        </span>
      `,
    )
    .join("");
}

function renderFilterableSignalChips(
  signals: SignalTag[],
  kind: "theme" | "motif",
): string {
  if (signals.length === 0) {
    return `<span class="signal-chip signal-chip-empty">Still collecting signal</span>`;
  }
  return signals
    .map(
      (signal) => `
        <button
          class="signal-chip signal-chip-button"
          type="button"
          data-signal-filter-kind="${kind}"
          data-signal-filter="${escapeAttribute(signal.slug)}"
          title="${escapeAttribute(buildSignalTooltip(signal))}"
        >
          <strong>${escapeHtml(signal.label)}</strong>
        </button>
      `,
    )
    .join("");
}

function renderSignalEvidenceList(signals: SignalTag[]): string {
  if (signals.length === 0) {
    return `<p class="empty-copy">Still collecting signal</p>`;
  }
  return `
    <ul class="detail-list compact-list signal-evidence-list">
      ${signals
        .map(
          (signal) => `
            <li>
              <strong>${escapeHtml(signal.label)}:</strong>
              ${escapeHtml(formatSignalEvidence(signal.evidence))}
            </li>
          `,
        )
        .join("")}
    </ul>
  `;
}

function formatSignalEvidence(evidence: string[]): string {
  if (evidence.length === 0) return "Grounded in the captured source.";
  return evidence
    .slice(0, 2)
    .map((item) => `"${truncateText(item.trim(), 96)}"`)
    .join(" · ");
}

function buildSignalTooltip(signal: SignalTag): string {
  const evidence = formatSignalEvidence(signal.evidence);
  return evidence ? `${signal.label}: ${evidence}` : signal.label;
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

function getSearchResultLayout(index: number, reference: ReferenceSummary): SearchResultLayout {
  const density = reference.title.length + reference.summary.length + reference.note.length;
  const shouldFeature = (index === 0 || index % 9 === 0) && density > 110;
  return {
    colSpan: shouldFeature ? 2 : 1,
    hasPersistentHover: shouldFeature,
  };
}

const REFERENCE_MEDIA_TYPES: Array<{ value: ReferenceSearchMediaType; label: string }> = [
  { value: "webpages", label: "Web Pages" },
  { value: "videos", label: "Videos" },
  { value: "quotes", label: "Quotes" },
  { value: "x-posts", label: "X Posts" },
  { value: "images", label: "Images" },
  { value: "articles", label: "Articles" },
  { value: "notes", label: "Notes" },
];

function matchesReferenceMediaType(reference: ReferenceSummary, mediaType: ReferenceSearchMediaType): boolean {
  if (mediaType === "all") return true;
  return classifyReferenceMediaType(reference) === mediaType;
}

function classifyReferenceMediaType(reference: ReferenceSummary): Exclude<ReferenceSearchMediaType, "all"> {
  const sourceUrl = reference.sourceUrl.toLowerCase();
  const platform = reference.platform.toLowerCase();
  const title = reference.title.toLowerCase();
  const summary = reference.summary.toLowerCase();
  const note = reference.note.toLowerCase();
  const formats = reference.formatSignals.map((signal) => signal.label.toLowerCase()).join(" ");
  const haystack = [sourceUrl, platform, title, summary, note, formats].join(" ");
  const isMatch = (...needles: string[]): boolean => needles.some((needle) => haystack.includes(needle));

  if (reference.sourceKind === "journal" || reference.sourceKind === "brief" || reference.sourceKind === "voice-note") return "notes";
  if (isMatch("x.com", "twitter.com", "x post", "tweet")) return "x-posts";
  if (reference.transcriptSource === "web-article" || isMatch("substack", "medium.com", "article", "essay", "open.substack.com")) return "articles";
  if (reference.sourceKind === "moodboard" || isMatch("pinterest", "image", "photo", "screenshot")) return "images";
  if (isMatch("youtube", "youtu.be", "tiktok", "instagram.com/reel", "vimeo", "video", "voiceover montage", "talking head", "pov diary", "tutorial")) return "videos";
  if (isMatch("quote", "quotation", "aphorism", "favorite line")) return "quotes";
  return "webpages";
}

function getReferenceMediaTypeLabel(mediaType: ReferenceSearchMediaType): string {
  return REFERENCE_MEDIA_TYPES.find((item) => item.value === mediaType)?.label ?? "Web Pages";
}

function getReferenceCardTags(reference: ReferenceSummary): string[] {
  return [
    ...reference.themes.slice(0, 1).map((signal) => signal.label),
    ...reference.formatSignals.slice(0, 1).map((signal) => signal.label),
    ...(reference.emotionalTone[0] ? [reference.emotionalTone[0]] : []),
    ...(reference.collection ? [reference.collection] : []),
  ]
    .filter((value, index, values) => value.length > 0 && values.indexOf(value) === index)
    .slice(0, 3);
}

function getReferenceCardReadTime(reference: ReferenceSummary): string {
  const mediaType = classifyReferenceMediaType(reference);
  if (mediaType === "videos") return reference.assetCount > 0 ? `${reference.assetCount} clips` : "Video";
  if (mediaType === "images") return reference.assetCount > 0 ? `${reference.assetCount} images` : "Image";
  if (mediaType === "quotes") return "Quote";
  if (mediaType === "x-posts") return "X post";
  if (mediaType === "notes") return reference.sourceKind.replace("-", " ");
  if (mediaType === "articles") return "Article";
  return "Web page";
}

function getReferenceCardImage(reference: ReferenceSummary): string {
  const mediaType = classifyReferenceMediaType(reference);
  const images: Record<Exclude<ReferenceSearchMediaType, "all">, string> = {
    webpages: "https://images.unsplash.com/photo-1498050108023-c5249f4df085?w=1200&q=80",
    videos: "https://images.unsplash.com/photo-1492691527719-9d1e07e534b4?w=1200&q=80",
    quotes: "https://images.unsplash.com/photo-1516321318423-f06f85e504b3?w=1200&q=80",
    "x-posts": "https://images.unsplash.com/photo-1611162616305-c69b3fa7fbe0?w=1200&q=80",
    images: "https://images.unsplash.com/photo-1513542789411-b6a5d4f31634?w=1200&q=80",
    articles: "https://images.unsplash.com/photo-1499750310107-5fef28a66643?w=1200&q=80",
    notes: "https://images.unsplash.com/photo-1455390582262-044cdead277a?w=1200&q=80",
  };
  return images[mediaType];
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

function bindPointerLighting(): void {
  const root = document.documentElement;
  const update = (x: number, y: number) => {
    root.style.setProperty("--pointer-x", `${x}px`);
    root.style.setProperty("--pointer-y", `${y}px`);
  };
  update(window.innerWidth * 0.7, Math.min(window.innerHeight * 0.25, 220));
  window.addEventListener(
    "pointermove",
    (event) => {
      update(event.clientX, event.clientY);
    },
    { passive: true },
  );
}

function formatMs(ms: number): string {
  const totalSeconds = Math.floor(ms / 1000);
  const minutes = Math.floor(totalSeconds / 60);
  const seconds = totalSeconds % 60;
  return `${minutes}:${seconds.toString().padStart(2, "0")}`;
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
