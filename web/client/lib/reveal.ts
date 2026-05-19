const REVEAL_SELECTOR = [
  ":scope > *",
  ":scope .surface-head > *",
  ":scope .capture-stage-copy > *",
  ":scope .capture-stage-chat",
  ":scope .capture-stage-actions",
  ":scope .capture-success-panel",
  ":scope .hero-copy > *",
  ":scope .hero-side-stack > *",
  ":scope .hero-stat-band > *",
  ":scope .hero-mini-grid > *",
  ":scope .workspace-status-inline > *",
  ":scope .ideas-form > *",
  ":scope .reference-picks > *",
  ":scope .discovery-main > *",
  ":scope .ideas-main > *",
  ":scope .idea-reference-stack > *",
  ":scope .prompt-list > *",
  ":scope .idea-output-grid > *",
  ":scope .signal-cloud > *",
  ":scope .detail-block",
  ":scope .discovery-card > *",
  ":scope .discovery-report > *",
  ":scope .reference-results-surface > *",
  ":scope .reference-results-board > *",
  ":scope .studio-grid > *",
  ":scope .studio-page-toolbar > *",
  ":scope #page-content > *",
  ":scope .article-context > *",
  ":scope #lint-list > *",
  ":scope #audit-list > *",
].join(",");

interface RevealOptions {
  baseDelay?: number;
  limit?: number;
}

const reducedMotionQuery = window.matchMedia("(prefers-reduced-motion: reduce)");

export function applyReveal(container: HTMLElement, options: RevealOptions = {}): void {
  if (reducedMotionQuery.matches) return;

  const baseDelay = options.baseDelay ?? 0;
  const limit = options.limit ?? 90;
  const runId = `${Date.now()}-${Math.random().toString(36).slice(2)}`;
  const seen = new Set<HTMLElement>();
  const targets = Array.from(container.querySelectorAll<HTMLElement>(REVEAL_SELECTOR))
    .filter((element) => {
      if (seen.has(element)) return false;
      seen.add(element);
      if (element.classList.contains("hidden") || element.hasAttribute("hidden")) return false;
      if (element.closest("[data-no-reveal]")) return false;
      return true;
    })
    .slice(0, limit);

  for (const element of targets) {
    element.classList.remove("reveal-in");
    element.style.removeProperty("--reveal-delay");
  }

  void container.offsetWidth;

  targets.forEach((element, index) => {
    const delay = baseDelay + Math.min(index, 18) * 42;
    element.dataset.revealRun = runId;
    element.style.setProperty("--reveal-delay", `${delay}ms`);
    element.classList.add("reveal-in");
    window.setTimeout(() => {
      if (element.dataset.revealRun !== runId) return;
      element.classList.remove("reveal-in");
      element.style.removeProperty("--reveal-delay");
      delete element.dataset.revealRun;
    }, delay + 700);
  });
}
