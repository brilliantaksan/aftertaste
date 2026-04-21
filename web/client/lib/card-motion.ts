const CARD_SELECTOR = [
  ".surface-card",
  ".hero-card",
  ".graph-panel",
  ".hero-glass-card",
  ".hero-stat-tile",
  ".pattern-card",
  ".prompt-card",
  ".history-card",
  ".idea-card",
  ".audit-card",
  ".reference-strip-card",
  ".reference-card",
  ".idea-reference-card",
  ".idea-session-card",
  ".article-context-card",
  ".lint-card",
  ".sidebar-card",
  ".brief-summary-card",
].join(", ");

let revealObserver: IntersectionObserver | null = null;
let mutationObserver: MutationObserver | null = null;
let initialized = false;
let revealIndex = 0;

function prefersReducedMotion(): boolean {
  return typeof window !== "undefined" &&
    "matchMedia" in window &&
    window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}

function animateCard(card: HTMLElement): void {
  card.classList.add("motion-card-shell");
  if (prefersReducedMotion()) {
    return;
  }

  const delay = (revealIndex % 6) * 70;
  revealIndex += 1;

  card.animate(
    [
      {
        opacity: 0,
        transform: "translateY(20px)",
      },
      {
        opacity: 1,
        transform: "translateY(0)",
      },
    ],
    {
      duration: 760,
      delay,
      easing: "cubic-bezier(0.22, 1, 0.36, 1)",
      fill: "both",
    },
  );
}

function queueCard(card: HTMLElement): void {
  if (card.dataset.motionCard === "true") {
    return;
  }
  card.dataset.motionCard = "true";

  if (prefersReducedMotion()) {
    animateCard(card);
    return;
  }

  revealObserver?.observe(card);
}

function scanCards(root: ParentNode): void {
  if (root instanceof HTMLElement && root.matches(CARD_SELECTOR)) {
    queueCard(root);
  }
  root.querySelectorAll<HTMLElement>(CARD_SELECTOR).forEach(queueCard);
}

export function initCardMotion(): void {
  if (initialized || typeof window === "undefined" || !document.body) {
    return;
  }
  initialized = true;

  revealObserver = new IntersectionObserver(
    (entries) => {
      entries.forEach((entry) => {
        if (!entry.isIntersecting) {
          return;
        }
        const card = entry.target as HTMLElement;
        revealObserver?.unobserve(card);
        animateCard(card);
      });
    },
    {
      threshold: 0.16,
      rootMargin: "0px 0px -8% 0px",
    },
  );

  mutationObserver = new MutationObserver((records) => {
    records.forEach((record) => {
      record.addedNodes.forEach((node) => {
        if (node instanceof HTMLElement) {
          scanCards(node);
        }
      });
    });
  });

  mutationObserver.observe(document.body, {
    childList: true,
    subtree: true,
  });

  scanCards(document);
}
