import type {
  CaptureDetailResponse,
  CaptureListResponse,
  CaptureRecord,
  IdeaOutputType,
  IdeaResponse,
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
  captureResult: CaptureDetailResponse | null;
  captureStatus: "idle" | "saving";
  captureError: string | null;
  ideaForm: IdeaFormState;
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
  captureResult: null,
  captureStatus: "idle",
  captureError: null,
  ideaForm: {
    outputType: "script",
    brief: "",
    referenceIds: [],
  },
  ideas: null,
  ideaStatus: "idle",
  referenceStatus: "idle",
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
  const [snapshot, captures, catalog] = await Promise.all([
    fetchJson<TasteSnapshot>("/api/snapshot/current"),
    fetchJson<CaptureListResponse>("/api/captures"),
    fetchJson<ReferencesResponse>("/api/references"),
  ]);
  state.snapshot = snapshot;
  state.captures = captures.captures;
  state.catalog = catalog;
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
  state.references = await fetchJson<ReferencesResponse>(url);
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
  if (brandLabel) brandLabel.textContent = state.config?.productName ?? "Aftertaste";
  if (brandMeta) {
    const refCount = state.catalog.references.length;
    brandMeta.textContent = `${state.config?.wikiTitle ?? "Local vault"} · ${refCount} reference${refCount === 1 ? "" : "s"}`;
  }
}

function renderHomeView(): void {
  const container = document.getElementById("view-home");
  if (!container || !state.snapshot) return;
  const snapshot = state.snapshot;
  const referenceCount = state.catalog.references.length;
  const captureCount = state.captures.length;
  const topPlatforms = state.catalog.filters.platforms.slice(0, 3).map((item) => item.label).join(" · ") || "No sources yet";
  container.innerHTML = `
    <section class="hero-card">
      <div class="hero-copy">
        <span class="eyebrow">Weekly taste snapshot</span>
        <h1>This is what your archive feels like lately.</h1>
        <p class="hero-summary">${escapeHtml(snapshot.summary)}</p>
        <div class="hero-actions">
          <button class="pill-btn pill-btn-solid" id="home-capture">Capture something</button>
          <button class="pill-btn" id="home-ideas">Turn this into ideas</button>
          <button class="pill-btn pill-btn-muted" id="home-studio">Open Studio</button>
        </div>
      </div>
      <div class="hero-aside">
        <div class="stat-card">
          <span class="stat-label">Saved archive</span>
          <strong>${referenceCount}</strong>
          <span class="stat-meta">${captureCount} capture${captureCount === 1 ? "" : "s"} processed locally</span>
        </div>
        <div class="stat-card">
          <span class="stat-label">Where it comes from</span>
          <strong>${escapeHtml(topPlatforms)}</strong>
          <span class="stat-meta">${snapshot.window.label} · ${snapshot.window.start} to ${snapshot.window.end}</span>
        </div>
      </div>
    </section>

    <section class="stack-grid">
      <article class="surface-card">
        <header class="surface-head">
          <div>
            <span class="eyebrow">Themes</span>
            <h2>Threads you keep pulling</h2>
          </div>
        </header>
        <div class="signal-cloud">${renderSignalChips(snapshot.themes)}</div>
      </article>

      <article class="surface-card">
        <header class="surface-head">
          <div>
            <span class="eyebrow">Motifs</span>
            <h2>Craft moves that keep returning</h2>
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
            <h2>A few things your archive is saying back</h2>
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
            <h2>Quick ways to turn taste into output</h2>
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
  container.innerHTML = `
    <section class="stack-grid capture-grid">
      <article class="surface-card surface-card-accent">
        <header class="surface-head">
          <div>
            <span class="eyebrow">Capture</span>
            <h1>Save first. Let the system understand later.</h1>
          </div>
        </header>
        <form id="capture-form" class="capture-form">
          <label class="field">
            <span>Link</span>
            <input name="sourceUrl" type="url" placeholder="https://www.instagram.com/reel/..." required />
          </label>
          <label class="field">
            <span>Why did you save this?</span>
            <textarea name="note" rows="6" placeholder="Optional, but useful. What about this reference pulled you in?"></textarea>
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

      <article class="surface-card">
        <header class="surface-head">
          <div>
            <span class="eyebrow">Recent activity</span>
            <h2>Latest captures</h2>
          </div>
        </header>
        <div class="capture-history">
          ${latestCaptures.length > 0
            ? latestCaptures.map((capture) => renderCaptureHistory(capture)).join("")
            : `<p class="empty-copy">No captures yet.</p>`}
        </div>
      </article>
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
        <p>${escapeHtml(result.analysis?.summary ?? "The capture was saved and compiled into the vault.")}</p>
        <div class="signal-cloud">${renderSignalChips(result.analysis?.themes ?? [])}</div>
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
}

async function handleCaptureSubmit(form: HTMLFormElement): Promise<void> {
  const urlInput = form.elements.namedItem("sourceUrl") as HTMLInputElement | null;
  const noteInput = form.elements.namedItem("note") as HTMLTextAreaElement | null;
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
  container.innerHTML = `
    <section class="surface-card">
      <header class="surface-head">
        <div>
          <span class="eyebrow">References</span>
          <h1>Browse the compiled archive, not just a pile of saves.</h1>
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
    </section>

    <section class="reference-layout">
      <div class="reference-grid" id="reference-grid">
        ${
          state.referenceStatus === "loading"
            ? `<p class="empty-copy">Loading references...</p>`
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
  const references = state.catalog.references.slice(0, 8);
  container.innerHTML = `
    <section class="stack-grid ideas-grid">
      <article class="surface-card surface-card-accent">
        <header class="surface-head">
          <div>
            <span class="eyebrow">Idea Studio</span>
            <h1>Turn this week's taste into something you can actually make.</h1>
          </div>
        </header>
        <p class="lede">${escapeHtml(state.snapshot.summary)}</p>
        <form id="ideas-form" class="ideas-form">
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
    </section>

    <section class="surface-card">
      <header class="surface-head">
        <div>
          <span class="eyebrow">Outputs</span>
          <h2>${state.ideas ? "Generated from your current snapshot" : "Nothing generated yet"}</h2>
        </div>
      </header>
      <div class="idea-output-grid">
        ${
          state.ideas
            ? state.ideas.outputs.map((output) => renderIdeaCard(output.title, output.body, output.rationale, output.citations)).join("")
            : `<p class="empty-copy">Pick a format, select a few references, and generate an idea set.</p>`
        }
      </div>
    </section>
  `;

  const form = document.getElementById("ideas-form") as HTMLFormElement | null;
  form?.addEventListener("submit", (event) => {
    event.preventDefault();
    void handleIdeaSubmit(form);
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
      }),
    });
  } finally {
    state.ideaStatus = "idle";
    renderIdeasView();
  }
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
    panel.classList.toggle("hidden", view !== state.view);
  });
}

function updateNavState(): void {
  document.querySelectorAll<HTMLElement>("[data-nav-view]").forEach((button) => {
    const active = button.getAttribute("data-nav-view") === state.view;
    button.classList.toggle("is-active", active);
  });
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
      </div>
      <span class="history-mode">${escapeHtml(capture.ingestionMode)}</span>
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

function renderReferenceDetail(reference: ReferenceSummary): string {
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
    <div class="detail-block detail-inline-actions">
      <button class="pill-btn pill-btn-muted" type="button" id="reference-rerun-analysis">Re-run local analysis</button>
      <a class="pill-btn" href="${escapeAttribute(reference.sourceUrl)}" target="_blank" rel="noreferrer">Open source</a>
    </div>
  `;
}

function renderIdeaCard(title: string, body: string, rationale: string, citations: string[]): string {
  return `
    <article class="idea-card">
      <header>
        <strong>${escapeHtml(title)}</strong>
      </header>
      <pre>${escapeHtml(body)}</pre>
      <p>${escapeHtml(rationale)}</p>
      <footer>${citations.length > 0 ? `Cites ${citations.map(escapeHtml).join(", ")}` : "No citations"}</footer>
    </article>
  `;
}

function renderSignalChips(signals: SignalTag[]): string {
  if (signals.length === 0) {
    return `<span class="signal-chip signal-chip-empty">Not enough signal yet</span>`;
  }
  return signals
    .map(
      (signal) => `
        <span class="signal-chip">
          <strong>${escapeHtml(signal.label)}</strong>
          <small>${Math.round(signal.score * 100)}%</small>
        </span>
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

void main().catch((error) => {
  console.error(error);
  const home = document.getElementById("view-home");
  if (home) {
    home.innerHTML = `<section class="surface-card"><p class="inline-error">${escapeHtml(String(error))}</p></section>`;
  }
});
