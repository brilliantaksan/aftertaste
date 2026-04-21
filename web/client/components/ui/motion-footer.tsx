"use client";

import * as React from "react";
import { useEffect, useRef } from "react";
import { gsap } from "gsap";
import { ScrollTrigger } from "gsap/ScrollTrigger";
import {
  ArrowUp,
  BookOpenText,
  FolderPlus,
  Heart,
  Lightbulb,
  Sparkles,
} from "lucide-react";
import { cn } from "../../lib/utils.js";

if (typeof window !== "undefined") {
  gsap.registerPlugin(ScrollTrigger);
}

const STYLES = `
.cinematic-footer-wrapper {
  font-family: var(--font-sans);
  color: var(--ink);
  -webkit-font-smoothing: antialiased;
  --footer-pill-bg-1: rgba(255, 255, 255, 0.72);
  --footer-pill-bg-2: rgba(250, 246, 240, 0.86);
  --footer-pill-border: rgba(68, 83, 101, 0.12);
  --footer-pill-shadow: rgba(48, 59, 77, 0.1);
  --footer-pill-highlight: rgba(255, 255, 255, 0.78);
  --footer-pill-inset-shadow: rgba(244, 238, 230, 0.8);
  --footer-pill-hover-border: rgba(68, 83, 101, 0.24);
  --footer-ink-soft: rgba(79, 93, 112, 0.92);
}

@keyframes footer-breathe {
  0% { transform: translate(-50%, -50%) scale(1); opacity: 0.52; }
  100% { transform: translate(-50%, -50%) scale(1.08); opacity: 0.9; }
}

@keyframes footer-scroll-marquee {
  from { transform: translateX(0); }
  to { transform: translateX(-50%); }
}

@keyframes footer-heartbeat {
  0%, 100% { transform: scale(1); }
  18% { transform: scale(1.16); }
  34% { transform: scale(1.02); }
  52% { transform: scale(1.18); }
}

.animate-footer-breathe {
  animation: footer-breathe 8s ease-in-out infinite alternate;
}

.animate-footer-scroll-marquee {
  animation: footer-scroll-marquee 34s linear infinite;
}

.animate-footer-heartbeat {
  animation: footer-heartbeat 2s cubic-bezier(0.25, 1, 0.5, 1) infinite;
}

.footer-bg-grid {
  background-size: 56px 56px;
  background-image:
    linear-gradient(to right, rgba(68, 83, 101, 0.05) 1px, transparent 1px),
    linear-gradient(to bottom, rgba(68, 83, 101, 0.05) 1px, transparent 1px);
  mask-image: linear-gradient(to bottom, transparent, black 28%, black 72%, transparent);
  -webkit-mask-image: linear-gradient(to bottom, transparent, black 28%, black 72%, transparent);
}

.footer-aurora {
  background:
    radial-gradient(circle at 30% 35%, var(--gold) 0%, transparent 28%),
    radial-gradient(circle at 60% 40%, var(--blue) 0%, transparent 34%),
    radial-gradient(circle at 72% 58%, var(--pink) 0%, transparent 28%),
    radial-gradient(circle at 45% 70%, var(--mint) 0%, transparent 32%);
  opacity: 0.48;
}

.footer-glass-pill {
  background: linear-gradient(145deg, var(--footer-pill-bg-1) 0%, var(--footer-pill-bg-2) 100%);
  box-shadow:
    0 18px 40px -18px var(--footer-pill-shadow),
    inset 0 1px 1px var(--footer-pill-highlight),
    inset 0 -1px 2px var(--footer-pill-inset-shadow);
  border: 1px solid var(--footer-pill-border);
  backdrop-filter: blur(16px);
  -webkit-backdrop-filter: blur(16px);
  transition:
    transform 240ms cubic-bezier(0.16, 1, 0.3, 1),
    box-shadow 240ms cubic-bezier(0.16, 1, 0.3, 1),
    border-color 180ms ease,
    color 180ms ease,
    background 180ms ease;
}

.footer-glass-pill:hover {
  transform: translateY(-2px);
  border-color: var(--footer-pill-hover-border);
  box-shadow:
    0 26px 44px -18px rgba(48, 59, 77, 0.16),
    inset 0 1px 1px rgba(255, 255, 255, 0.82);
}

.footer-giant-bg-text {
  font-family: var(--font-display);
  font-size: 24vw;
  line-height: 0.78;
  font-weight: 400;
  letter-spacing: -0.06em;
  color: transparent;
  -webkit-text-stroke: 1px rgba(39, 51, 67, 0.08);
  background: linear-gradient(180deg, rgba(39, 51, 67, 0.14) 0%, rgba(39, 51, 67, 0) 62%);
  -webkit-background-clip: text;
  background-clip: text;
}

.footer-heading {
  font-family: var(--font-display);
  letter-spacing: -0.05em;
  color: var(--ink);
}

.footer-text-glow {
  background: linear-gradient(180deg, var(--ink) 0%, var(--ink-soft) 100%);
  -webkit-background-clip: text;
  -webkit-text-fill-color: transparent;
  background-clip: text;
  filter: drop-shadow(0 10px 24px rgba(39, 51, 67, 0.12));
}

.footer-meta {
  color: var(--footer-ink-soft);
}
`;

type HomeView = "capture" | "references" | "ideas" | "studio";

interface CinematicFooterProps {
  onNavigate?: (view: HomeView) => void;
}

type MagneticButtonProps =
  | ({
      href: string;
    } & React.AnchorHTMLAttributes<HTMLAnchorElement>)
  | ({
      href?: undefined;
    } & React.ButtonHTMLAttributes<HTMLButtonElement>);

function MagneticButton(props: MagneticButtonProps & { className?: string; children: React.ReactNode }) {
  const localRef = useRef<HTMLAnchorElement | HTMLButtonElement | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const element = localRef.current;
    if (!element) return;

    const ctx = gsap.context(() => {
      const handleMouseMove: EventListener = (event) => {
        if (!(event instanceof MouseEvent)) return;
        const rect = element.getBoundingClientRect();
        const centerX = rect.width / 2;
        const centerY = rect.height / 2;
        const x = event.clientX - rect.left - centerX;
        const y = event.clientY - rect.top - centerY;

        gsap.to(element, {
          x: x * 0.18,
          y: y * 0.18,
          rotationX: -y * 0.06,
          rotationY: x * 0.06,
          scale: 1.02,
          ease: "power2.out",
          duration: 0.35,
        });
      };

      const handleMouseLeave = () => {
        gsap.to(element, {
          x: 0,
          y: 0,
          rotationX: 0,
          rotationY: 0,
          scale: 1,
          ease: "elastic.out(1, 0.4)",
          duration: 1,
        });
      };

      element.addEventListener("mousemove", handleMouseMove);
      element.addEventListener("mouseleave", handleMouseLeave);

      return () => {
        element.removeEventListener("mousemove", handleMouseMove);
        element.removeEventListener("mouseleave", handleMouseLeave);
      };
    }, element);

    return () => ctx.revert();
  }, []);

  if (props.href) {
    const { className, children, href, ...anchorProps } = props;
    return (
      <a
        ref={(node) => {
          localRef.current = node;
        }}
        href={href}
        className={cn("cursor-pointer", className)}
        {...anchorProps}
      >
        {children}
      </a>
    );
  }

  const { className, children, type = "button", ...buttonProps } = props as {
    href?: undefined;
    className?: string;
    children: React.ReactNode;
  } & React.ButtonHTMLAttributes<HTMLButtonElement>;
  return (
    <button
      ref={(node) => {
        localRef.current = node;
      }}
      type={type}
      className={cn("cursor-pointer", className)}
      {...buttonProps}
    >
      {children}
    </button>
  );
}

function MarqueeItem() {
  return (
    <div className="flex items-center gap-5 px-6">
      <span>Voice-first generation</span>
      <Sparkles className="h-3.5 w-3.5 text-[var(--ink-faint)]" />
      <span>Vault-backed references</span>
      <Sparkles className="h-3.5 w-3.5 text-[var(--ink-faint)]" />
      <span>Personal lines stay yours</span>
      <Sparkles className="h-3.5 w-3.5 text-[var(--ink-faint)]" />
      <span>Context before output</span>
    </div>
  );
}

export function CinematicFooter({ onNavigate }: CinematicFooterProps) {
  const wrapperRef = useRef<HTMLDivElement>(null);
  const giantTextRef = useRef<HTMLDivElement>(null);
  const headingRef = useRef<HTMLHeadingElement>(null);
  const copyRef = useRef<HTMLParagraphElement>(null);
  const linksRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!wrapperRef.current) return;

    const ctx = gsap.context(() => {
      gsap.fromTo(
        giantTextRef.current,
        { y: "12vh", scale: 0.84, opacity: 0 },
        {
          y: "0vh",
          scale: 1,
          opacity: 1,
          ease: "power1.out",
          scrollTrigger: {
            trigger: wrapperRef.current,
            start: "top 82%",
            end: "bottom bottom",
            scrub: 1,
          },
        }
      );

      gsap.fromTo(
        [headingRef.current, copyRef.current, linksRef.current],
        { y: 42, opacity: 0 },
        {
          y: 0,
          opacity: 1,
          stagger: 0.12,
          ease: "power3.out",
          scrollTrigger: {
            trigger: wrapperRef.current,
            start: "top 46%",
            end: "bottom bottom",
            scrub: 1,
          },
        }
      );
    }, wrapperRef);

    return () => ctx.revert();
  }, []);

  const scrollToTop = () => {
    window.scrollTo({ top: 0, behavior: "smooth" });
  };

  return (
    <>
      <style dangerouslySetInnerHTML={{ __html: STYLES }} />
      <div
        ref={wrapperRef}
        className="home-screen-finale relative z-0 -mt-24 h-[100svh] w-full md:-mt-32"
        style={{ clipPath: "polygon(0% 0, 100% 0%, 100% 100%, 0 100%)" }}
      >
        <footer
          className="cinematic-footer-wrapper pointer-events-none fixed bottom-0 left-0 z-0 flex h-[100svh] w-full flex-col justify-between overflow-hidden"
          style={{
            background:
              "linear-gradient(180deg, rgb(250, 246, 240) 0%, rgb(244, 238, 230) 52%, rgb(239, 231, 221) 100%)",
          }}
        >
          <div className="footer-aurora pointer-events-none absolute left-1/2 top-1/2 z-0 h-[60vh] w-[80vw] -translate-x-1/2 -translate-y-1/2 animate-footer-breathe rounded-[50%] blur-[80px]" />
          <div className="footer-bg-grid pointer-events-none absolute inset-0 z-0" />

          <div
            ref={giantTextRef}
            className="footer-giant-bg-text pointer-events-none absolute -bottom-[3vh] left-1/2 z-0 -translate-x-1/2 select-none whitespace-nowrap"
          >
            AFTERTASTE
          </div>

          <div className="absolute left-0 top-35 z-10 w-full -rotate-[1.6deg] scale-[1.03] overflow-hidden border-y border-[rgba(68,83,101,0.12)] bg-[rgba(255,255,255,0.58)] py-4 shadow-[0_18px_42px_rgba(48,59,77,0.07)] backdrop-blur-md">
            <div className="animate-footer-scroll-marquee flex w-max items-center text-[0.68rem] font-semibold uppercase tracking-[0.28em] text-[var(--ink-soft)] md:text-xs">
              <MarqueeItem />
              <MarqueeItem />
            </div>
          </div>

          <div className="pointer-events-auto relative z-10 mx-auto mt-24 flex w-full max-w-5xl flex-1 flex-col items-center justify-center px-6 text-center">
            <h2
              ref={headingRef}
              className="footer-heading footer-text-glow mb-6 text-5xl md:text-8xl"
            >
              Ready to keep the thread?
            </h2>

            <p
              ref={copyRef}
              className="footer-meta mx-auto mb-10 max-w-2xl text-sm leading-7 md:text-base"
            >
              One possible next move is to capture a fresh reference, then let the
              vault pull it back toward the patterns already forming in your archive.
            </p>

            <div ref={linksRef} className="flex w-full flex-col items-center gap-5">
              <div className="flex w-full flex-wrap justify-center gap-4">
                <MagneticButton
                  className="footer-glass-pill flex items-center gap-3 rounded-full px-8 py-4 text-sm font-semibold text-[var(--ink)] md:px-10 md:py-5 md:text-base"
                  onClick={() => onNavigate?.("capture")}
                >
                  <FolderPlus className="h-5 w-5 text-[var(--ink-soft)]" />
                  Open Capture Desk
                </MagneticButton>

                <MagneticButton
                  className="footer-glass-pill flex items-center gap-3 rounded-full px-8 py-4 text-sm font-semibold text-[var(--ink)] md:px-10 md:py-5 md:text-base"
                  onClick={() => onNavigate?.("ideas")}
                >
                  <Lightbulb className="h-5 w-5 text-[var(--ink-soft)]" />
                  Build Ideas
                </MagneticButton>
              </div>

              <div className="flex w-full flex-wrap justify-center gap-3 md:gap-5">
                <MagneticButton
                  className="footer-glass-pill rounded-full px-5 py-3 text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-soft)] md:text-sm"
                  onClick={() => onNavigate?.("references")}
                >
                  Reference Atlas
                </MagneticButton>
                <MagneticButton
                  className="footer-glass-pill rounded-full px-5 py-3 text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-soft)] md:text-sm"
                  onClick={() => onNavigate?.("studio")}
                >
                  Wiki Explorer
                </MagneticButton>
                <MagneticButton
                  className="footer-glass-pill rounded-full px-5 py-3 text-xs font-medium uppercase tracking-[0.14em] text-[var(--ink-soft)] md:text-sm"
                  onClick={() => onNavigate?.("ideas")}
                >
                  Personal Moments
                </MagneticButton>
              </div>
            </div>
          </div>

          <div className="pointer-events-auto relative z-20 flex w-full flex-col items-center justify-between gap-5 px-6 pb-8 md:flex-row md:px-12">
            <div className="order-2 text-[10px] font-semibold uppercase tracking-[0.22em] text-[var(--ink-faint)] md:order-1 md:text-xs">
              © 2026 Aftertaste. Local vault, living memory.
            </div>

            <div className="footer-glass-pill order-1 flex cursor-default items-center gap-2 rounded-full px-5 py-3 md:order-2">
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--ink-faint)] md:text-xs">
                built with
              </span>
              <Heart className="animate-footer-heartbeat h-4 w-4 fill-[var(--rose)] text-[var(--rose)] md:h-4.5 md:w-4.5" />
              <span className="text-[10px] font-semibold uppercase tracking-[0.2em] text-[var(--ink-faint)] md:text-xs">
                for voice-first creators
              </span>
            </div>

            <div className="order-3 flex items-center gap-3">
              <div className="footer-glass-pill hidden items-center gap-2 rounded-full px-4 py-3 text-[10px] font-semibold uppercase tracking-[0.18em] text-[var(--ink-soft)] md:flex">
                <BookOpenText className="h-4 w-4" />
                Cite the archive
              </div>
              <MagneticButton
                className="footer-glass-pill flex h-12 w-12 items-center justify-center rounded-full text-[var(--ink-soft)]"
                onClick={scrollToTop}
              >
                <ArrowUp className="h-5 w-5" />
              </MagneticButton>
            </div>
          </div>
        </footer>
      </div>
    </>
  );
}
