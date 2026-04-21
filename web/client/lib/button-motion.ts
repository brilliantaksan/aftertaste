import { gsap } from "gsap";

const MAGNETIC_SELECTOR = "button, a.footer-glass-pill";
const INIT_FLAG = "buttonMotionBound";

let initialized = false;

function bindMagneticMotion(element: HTMLElement, motionEnabled: boolean): void {
  if ((element.dataset[INIT_FLAG] ?? "") === "true") return;
  element.dataset[INIT_FLAG] = "true";
  element.classList.add("magnetic-button");

  if (!motionEnabled) return;

  const xTo = gsap.quickTo(element, "x", {
    duration: 0.22,
    ease: "power3.out",
  });
  const yTo = gsap.quickTo(element, "y", {
    duration: 0.22,
    ease: "power3.out",
  });
  const rotateXTo = gsap.quickTo(element, "rotationX", {
    duration: 0.24,
    ease: "power3.out",
  });
  const rotateYTo = gsap.quickTo(element, "rotationY", {
    duration: 0.24,
    ease: "power3.out",
  });
  const scaleTo = gsap.quickTo(element, "scale", {
    duration: 0.22,
    ease: "power3.out",
  });

  const reset = () => {
    xTo(0);
    yTo(0);
    rotateXTo(0);
    rotateYTo(0);
    scaleTo(1);
  };

  const handleMove = (event: PointerEvent) => {
    if (event.pointerType === "touch") return;
    const rect = element.getBoundingClientRect();
    if (rect.width === 0 || rect.height === 0) return;

    const dx = event.clientX - (rect.left + rect.width / 2);
    const dy = event.clientY - (rect.top + rect.height / 2);
    const normalizedX = Math.max(-1, Math.min(1, dx / (rect.width / 2)));
    const normalizedY = Math.max(-1, Math.min(1, dy / (rect.height / 2)));

    xTo(normalizedX * 8);
    yTo(normalizedY * 8);
    rotateXTo(normalizedY * -3);
    rotateYTo(normalizedX * 3);
    scaleTo(1.02);
  };

  element.addEventListener("pointermove", handleMove, { passive: true });
  element.addEventListener("pointerleave", reset);
  element.addEventListener("pointercancel", reset);
  element.addEventListener("blur", reset);
}

function scanButtons(root: ParentNode, motionEnabled: boolean): void {
  if (root instanceof HTMLElement && root.matches(MAGNETIC_SELECTOR)) {
    bindMagneticMotion(root, motionEnabled);
  }

  root.querySelectorAll<HTMLElement>(MAGNETIC_SELECTOR).forEach((element) => {
    bindMagneticMotion(element, motionEnabled);
  });
}

export function initButtonMotion(): void {
  if (initialized || typeof document === "undefined") return;
  initialized = true;

  const motionEnabled = !window.matchMedia("(prefers-reduced-motion: reduce)").matches;

  scanButtons(document, motionEnabled);

  const observer = new MutationObserver((mutations) => {
    mutations.forEach((mutation) => {
      mutation.addedNodes.forEach((node) => {
        if (!(node instanceof HTMLElement)) return;
        scanButtons(node, motionEnabled);
      });
    });
  });

  observer.observe(document.body, {
    childList: true,
    subtree: true,
  });
}
