import mermaid from "mermaid";
import type { AuditEntry } from "audit-shared";
import { installFeedbackUI } from "./feedback.js";
import type { TasteGraph, WikiArticleDetail, WikiCleanupPreview, WikiLintReport } from "../shared/contracts.js";
import { renderGraph, type GraphHandle, type GraphNode } from "./graph.js";
import { ParticleField } from "./particles.js";
import { renderTree, type TreeNode } from "./tree.js";

interface StudioOptions {
  author: string;
}

interface StudioState {
  currentPath: string;
  rawMarkdown: string;
  author: string;
  lint: WikiLintReport | null;
}

let mermaidConfigured = false;

export function buildStudioUrl(page = "wiki/index.md"): string {
  const params = new URLSearchParams(window.location.search);
  params.set("view", "studio");
  params.set("page", page);
  return `/?${params.toString()}`;
}

export class StudioController {
  private state: StudioState;
  private initialized = false;
  private graphTeardown: (() => void) | null = null;
  private graphZoom: Pick<GraphHandle, "zoomIn" | "zoomOut" | "zoomReset"> | null = null;
  private treeData: TreeNode | null = null;

  constructor(opts: StudioOptions) {
    this.state = {
      currentPath: "wiki/index.md",
      rawMarkdown: "",
      author: opts.author,
      lint: null,
    };
  }

  async open(path = "wiki/index.md"): Promise<void> {
    await this.init();
    await this.refreshTree();
    await this.loadPage(path);
  }

  async refresh(): Promise<void> {
    await this.refreshTree();
    await this.loadPage(this.state.currentPath);
  }

  private async init(): Promise<void> {
    if (this.initialized) return;
    configureMermaid();
    this.installNavigationHandlers();
    this.installGraphHandlers();
    this.installMaintenanceHandlers();
    installFeedbackUI({
      getState: () => this.state,
      onCreated: async () => {
        await this.loadAudits(this.state.currentPath);
      },
    });
    this.initialized = true;
  }

  private installNavigationHandlers(): void {
    document.getElementById("btn-refresh")?.addEventListener("click", () => {
      void this.refresh();
    });

    document.getElementById("page-content")?.addEventListener("click", (event) => {
      const target = (event.target as HTMLElement).closest("a.wikilink") as HTMLAnchorElement | null;
      if (!target) return;
      const href = target.getAttribute("href") ?? "";
      const url = new URL(href, window.location.href);
      const page = url.searchParams.get("page");
      if (!page) return;
      event.preventDefault();
      history.pushState({ view: "studio", page }, "", buildStudioUrl(page));
      void this.loadPage(page);
    });
  }

  private installMaintenanceHandlers(): void {
    document.getElementById("btn-lint")?.addEventListener("click", async () => {
      await this.loadLint();
      this.renderLintList();
    });

    document.getElementById("btn-cleanup")?.addEventListener("click", async () => {
      const preview = (await fetch("/api/wiki/cleanup/preview", {
        method: "POST",
      }).then((response) => response.json())) as WikiCleanupPreview;
      if (preview.actions.length === 0) {
        window.alert("No wiki cleanup actions were proposed.");
        return;
      }
      const confirmed = window.confirm(`Apply ${preview.actions.length} wiki cleanup action${preview.actions.length === 1 ? "" : "s"}?`);
      if (!confirmed) return;
      await fetch("/api/wiki/cleanup/apply", {
        method: "POST",
      });
      await this.refresh();
    });
  }

  private installGraphHandlers(): void {
    const graphOverlay = document.getElementById("graph-overlay");
    const openButton = document.getElementById("btn-graph");
    const closeButton = document.getElementById("graph-close");
    const resetButton = document.getElementById("graph-reset");

    const closeGraph = () => {
      graphOverlay?.classList.add("hidden");
      if (this.graphTeardown) { this.graphTeardown(); this.graphTeardown = null; }
      this.graphZoom = null;
    };

    document.getElementById("graph-zoom-in")?.addEventListener("click",  () => this.graphZoom?.zoomIn());
    document.getElementById("graph-zoom-out")?.addEventListener("click", () => this.graphZoom?.zoomOut());

    const openGraph = async () => {
      if (!graphOverlay) return;
      graphOverlay.classList.remove("hidden");
      graphOverlay.classList.remove("is-opening");
      void (graphOverlay as HTMLElement).offsetWidth;
      graphOverlay.classList.add("is-opening");
      await new Promise((resolve) => requestAnimationFrame(() => resolve(null)));
      const data = (await fetch("/api/graph/taste").then((r) => r.json())) as TasteGraph;
      const svg    = document.getElementById("graph-svg") as unknown as SVGSVGElement | null;
      const canvas = document.getElementById("graph-particles") as HTMLCanvasElement | null;
      if (!svg || !canvas) return;
      if (this.graphTeardown) this.graphTeardown();
      const particles = new ParticleField(canvas, 55);
      particles.start();
      const handle = renderGraph(svg, data, {
        onNodeClick: (node: GraphNode) => {
          closeGraph();
          history.pushState({ view: "studio", page: node.path }, "", buildStudioUrl(node.path));
          void this.loadPage(node.path);
        },
      });
      this.graphZoom = handle;
      this.graphTeardown = () => { particles.stop(); handle.teardown(); };
    };

    openButton?.addEventListener("click", () => {
      if (graphOverlay?.classList.contains("hidden")) void openGraph();
      else closeGraph();
    });
    closeButton?.addEventListener("click", closeGraph);
    resetButton?.addEventListener("click", () => {
      void openGraph();
    });
    document.addEventListener("keydown", (event) => {
      if (event.key === "Escape" && !graphOverlay?.classList.contains("hidden")) {
        closeGraph();
      }
      if ((event.key === "g" || event.key === "G") && !isEditableFocused()) {
        event.preventDefault();
        if (graphOverlay?.classList.contains("hidden")) void openGraph();
        else closeGraph();
      }
    });
  }

  private async refreshTree(): Promise<void> {
    const container = document.getElementById("tree");
    if (!container) return;
    if (!this.treeData) {
      container.innerHTML = skeletonCards(6);
    }
    const tree = (await fetch("/api/tree").then((response) => response.json())) as TreeNode;
    this.treeData = tree;
    renderTree(container, tree, (page) => {
      history.pushState({ view: "studio", page }, "", buildStudioUrl(page));
      void this.loadPage(page);
    }, this.state.currentPath);
  }

  private async loadPage(pathArg: string): Promise<void> {
    const pageEl = document.getElementById("page-content");
    if (!pageEl) return;
    pageEl.innerHTML = skeletonCards(4);
    try {
      const response = await fetch(`/api/wiki/article?path=${encodeURIComponent(pathArg)}`);
      if (!response.ok) {
        pageEl.innerHTML = `<p class="loading">Failed to load <code>${escapeHtml(pathArg)}</code>.</p>`;
        return;
      }
      const data = (await response.json()) as WikiArticleDetail;
      this.state.currentPath = data.path;
      this.state.rawMarkdown = data.raw ?? "";
      pageEl.innerHTML = data.html ?? '<p class="loading">Article render unavailable.</p>';
      await this.renderMermaidBlocks(pageEl);
      this.highlightTreeSelection(data.path);
      const titleEl = document.getElementById("wiki-title");
      if (titleEl) titleEl.textContent = data.title ?? data.path;
      this.renderArticleContext(data);
      await this.loadLint();
      this.renderLintList();
      await this.loadAudits(data.path);
      (document.querySelector(".studio-main") as HTMLElement | null)?.scrollTo({ top: 0 });
    } catch (error) {
      pageEl.innerHTML = `<p class="loading">Error loading page.</p>`;
      console.error(error);
    }
  }

  private async renderMermaidBlocks(pageEl: HTMLElement): Promise<void> {
    const blocks = pageEl.querySelectorAll("pre.mermaid-block code.language-mermaid");
    for (let index = 0; index < blocks.length; index += 1) {
      const code = blocks[index] as HTMLElement;
      const pre = code.parentElement as HTMLElement | null;
      if (!pre) continue;
      const source = code.textContent ?? "";
      try {
        const { svg } = await mermaid.render(`aftertaste-mermaid-${Date.now()}-${index}`, source);
        const container = document.createElement("div");
        container.className = "mermaid-block";
        container.innerHTML = svg;
        const sourceLine = pre.getAttribute("data-source-line");
        if (sourceLine) container.setAttribute("data-source-line", sourceLine);
        pre.replaceWith(container);
      } catch (error) {
        console.error("mermaid render failed", error);
      }
    }
  }

  private highlightTreeSelection(pathValue: string): void {
    const container = document.getElementById("tree");
    if (!container || !this.treeData) return;
    renderTree(container, this.treeData, (page) => {
      history.pushState({ view: "studio", page }, "", buildStudioUrl(page));
      void this.loadPage(page);
    }, pathValue);
  }

  private async loadLint(): Promise<void> {
    try {
      this.state.lint = (await fetch("/api/wiki/lint").then((response) => response.json())) as WikiLintReport;
    } catch (error) {
      console.error(error);
      this.state.lint = null;
    }
  }

  private renderArticleContext(article: WikiArticleDetail): void {
    const container = document.getElementById("article-context");
    if (!container) return;
    container.innerHTML = `
      <div class="article-context">
        <article class="article-context-card">
          <span class="eyebrow">${escapeHtml(article.kind)}</span>
          <strong>${escapeHtml(article.title)}</strong>
          <p>${escapeHtml(article.lead || "No lead summary available yet.")}</p>
        </article>
        <article class="article-context-card">
          <span class="detail-label">Supporting references</span>
          <div class="article-context-list">
            ${article.supportingReferenceIds.length > 0
              ? article.supportingReferenceIds
                  .map((referenceId) => `<button class="reference-inline-pill" type="button" data-open-page="wiki/references/${escapeAttribute(referenceId)}.md">${escapeHtml(referenceId)}</button>`)
                  .join("")
              : `<span class="empty-copy">No supporting references listed yet.</span>`}
          </div>
        </article>
        <article class="article-context-card">
          <span class="detail-label">Related concepts</span>
          <div class="article-context-list">
            ${article.relatedPaths.length > 0
              ? article.relatedPaths
                  .map((link) => `<button class="reference-inline-pill" type="button" data-open-page="${escapeAttribute(link.path)}">${escapeHtml(link.title)}</button>`)
                  .join("")
              : `<span class="empty-copy">No related concepts surfaced yet.</span>`}
          </div>
        </article>
        <article class="article-context-card">
          <span class="detail-label">Backlinks</span>
          <div class="article-context-list">
            ${article.backlinks.length > 0
              ? article.backlinks
                  .map((link) => `<button class="reference-inline-pill" type="button" data-open-page="${escapeAttribute(link.path)}">${escapeHtml(link.title)}</button>`)
                  .join("")
              : `<span class="empty-copy">Nothing links back here yet.</span>`}
          </div>
        </article>
        <article class="article-context-card">
          <span class="detail-label">Open questions</span>
          ${article.openQuestions.length > 0
            ? `<ul>${article.openQuestions.map((question) => `<li>${escapeHtml(question)}</li>`).join("")}</ul>`
            : `<p class="empty-copy">No open questions surfaced on this page.</p>`}
        </article>
      </div>
    `;
    container.querySelectorAll<HTMLElement>("[data-open-page]").forEach((button) => {
      button.addEventListener("click", () => {
        const nextPath = button.getAttribute("data-open-page");
        if (!nextPath) return;
        history.pushState({ view: "studio", page: nextPath }, "", buildStudioUrl(nextPath));
        void this.loadPage(nextPath);
      });
    });
  }

  private renderLintList(): void {
    const container = document.getElementById("lint-list");
    if (!container) return;
    const issues = this.state.lint?.issues.filter((issue) => issue.path === this.state.currentPath || issue.relatedPaths.includes(this.state.currentPath)) ?? [];
    if (issues.length === 0) {
      container.innerHTML = `<div class="empty-state"><span class="empty-state-icon">✦</span><span>No lint issues on this page</span></div>`;
      return;
    }
    container.innerHTML = issues
      .map((issue) => `
        <article class="lint-card lint-sev-${issue.severity}">
          <span class="audit-severity sev-${issue.severity}">${escapeHtml(issue.kind)}</span>
          <strong>${escapeHtml(issue.title)}</strong>
          <p>${escapeHtml(issue.summary)}</p>
        </article>
      `)
      .join("");
  }

  private async loadAudits(targetPath: string): Promise<void> {
    const container = document.getElementById("audit-list");
    if (!container) return;
    container.innerHTML = skeletonCards(2);
    try {
      const response = await fetch(`/api/audit?target=${encodeURIComponent(targetPath)}&mode=open`);
      const data = (await response.json()) as { entries: AuditEntry[] };
      if (data.entries.length === 0) {
        container.innerHTML = `<div class="empty-state"><span class="empty-state-icon">◎</span><span>No open feedback here</span></div>`;
        return;
      }
      container.innerHTML = data.entries.map((entry) => renderAudit(entry)).join("");
      container.querySelectorAll("button[data-resolve]").forEach((button) => {
        button.addEventListener("click", async () => {
          const id = button.getAttribute("data-resolve");
          if (!id) return;
          const resolution = window.prompt("Resolution note (optional):", "") ?? "";
          const result = await fetch(`/api/audit/${id}/resolve`, {
            method: "PATCH",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ resolution }),
          });
          if (result.ok) await this.loadAudits(targetPath);
        });
      });
    } catch (error) {
      container.innerHTML = '<p class="muted" style="padding: 0.2rem 0;">Failed to load audits.</p>';
      console.error(error);
    }
  }
}

function configureMermaid(): void {
  if (mermaidConfigured) return;
  mermaidConfigured = true;
  mermaid.initialize({
    startOnLoad: false,
    theme: "base",
    securityLevel: "loose",
    fontFamily: "Satoshi, Maison Neue, system-ui, sans-serif",
    themeVariables: {
      background: "#f5efe5",
      primaryColor: "#efe5d4",
      primaryTextColor: "#3e3528",
      primaryBorderColor: "#8f7357",
      secondaryColor: "#e6d8c5",
      secondaryTextColor: "#3e3528",
      secondaryBorderColor: "#b18a5f",
      tertiaryColor: "#f7f0e8",
      tertiaryTextColor: "#3e3528",
      tertiaryBorderColor: "#cfb699",
      lineColor: "#8f7357",
      textColor: "#3e3528",
      mainBkg: "#f7f0e8",
      clusterBkg: "#efe5d4",
      clusterBorder: "#cfb699",
      titleColor: "#3e3528",
    },
  });
}

function renderAudit(entry: AuditEntry): string {
  return [
    `<article class="audit-card">`,
    `<span class="audit-severity sev-${entry.severity}">${entry.severity}</span>`,
    `<p>${escapeHtml(extractComment(entry.body))}</p>`,
    `<footer>`,
    `<span>${new Date(entry.created).toLocaleDateString()}</span>`,
    `<button class="pill-btn pill-btn-muted" type="button" data-resolve="${entry.id}">Resolve</button>`,
    `</footer>`,
    `</article>`,
  ].join("");
}

function extractComment(body: string): string {
  const match = body.match(/# Comment\s+([\s\S]*?)\s+# Resolution/i);
  return (match?.[1] ?? body).trim();
}

function isEditableFocused(): boolean {
  const element = document.activeElement;
  if (!element) return false;
  const tag = element.tagName;
  return tag === "INPUT" || tag === "TEXTAREA" || (element as HTMLElement).isContentEditable;
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

function cssEscape(value: string): string {
  return value.replace(/["\\]/g, "\\$&");
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
