"use client";

import type { KeyboardEvent } from "react";
import {
  CheckCircle,
  Clock,
  Globe,
  Plus,
  Star,
  TrendingUp,
  Video,
  ArrowUpRight,
} from "lucide-react";
import { motion, useReducedMotion } from "framer-motion";

import { cn } from "../../lib/utils.js";

export interface BentoItem {
  id?: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  status?: string;
  tags?: string[];
  meta?: string;
  footer?: string;
  cta?: string;
  image?: string;
  colSpan?: number;
  rowSpan?: number;
  hasPersistentHover?: boolean;
  actionLabel?: string;
  onOpen?: () => void;
  onAction?: () => void;
}

interface BentoGridProps {
  items: BentoItem[];
}

export const itemsSample: BentoItem[] = [
  {
    title: "Analytics Dashboard",
    meta: "v2.4.1",
    description:
      "Real-time metrics with AI-powered insights and predictive analytics",
    icon: <TrendingUp className="h-4 w-4 text-sky-500" />,
    status: "Live",
    tags: ["Statistics", "Reports", "AI"],
    colSpan: 2,
    hasPersistentHover: true,
  },
  {
    title: "Task Manager",
    meta: "84 completed",
    description: "Automated workflow management with priority scheduling",
    icon: <CheckCircle className="h-4 w-4 text-emerald-500" />,
    status: "Updated",
    tags: ["Productivity", "Automation"],
    footer: "2 min read",
  },
  {
    title: "Media Library",
    meta: "12GB used",
    description: "Cloud storage with intelligent content processing",
    icon: <Video className="h-4 w-4 text-rose-500" />,
    tags: ["Storage", "CDN"],
    colSpan: 2,
  },
  {
    title: "Global Network",
    meta: "6 regions",
    description: "Multi-region deployment with edge computing",
    icon: <Globe className="h-4 w-4 text-blue-500" />,
    status: "Beta",
    tags: ["Infrastructure", "Edge"],
    footer: "Explore regions",
  },
];

function handleCardKeyDown(
  event: KeyboardEvent<HTMLElement>,
  onOpen?: () => void,
): void {
  if (!onOpen) return;
  if (event.key !== "Enter" && event.key !== " ") return;
  event.preventDefault();
  onOpen();
}

function BentoGrid({ items = itemsSample }: BentoGridProps) {
  const reduceMotion = useReducedMotion();

  return (
    <motion.div
      initial={reduceMotion ? false : "hidden"}
      animate={reduceMotion ? undefined : "show"}
      variants={
        reduceMotion
          ? undefined
          : {
              hidden: {},
              show: {
                transition: {
                  staggerChildren: 0.055,
                  delayChildren: 0.04,
                },
              },
            }
      }
      className="bento-grid mx-auto grid w-full grid-cols-1 gap-3 md:grid-cols-2 xl:grid-cols-3 xl:grid-flow-dense xl:auto-rows-[minmax(214px,auto)]"
    >
      {items.map((item, index) => (
        <motion.article
          key={item.id ?? `${item.title}-${index}`}
          variants={
            reduceMotion
              ? undefined
              : {
                  hidden: {
                    opacity: 0,
                    y: 26,
                    scale: 0.975,
                    filter: "blur(10px)",
                  },
                  show: {
                    opacity: 1,
                    y: 0,
                    scale: 1,
                    filter: "blur(0px)",
                    transition: {
                      duration: 0.48,
                      ease: [0.16, 1, 0.3, 1],
                    },
                  },
                }
          }
          className={cn(
            "bento-grid-card group relative isolate flex min-h-[214px] flex-col overflow-hidden rounded-[26px] border border-white/80 bg-[linear-gradient(180deg,rgba(255,255,255,0.9),rgba(247,243,238,0.8))] p-4 shadow-[0_18px_46px_rgba(48,59,77,0.08)] transition-all duration-300",
            item.onOpen
              ? "cursor-pointer hover:-translate-y-1 hover:border-[rgba(39,51,67,0.14)] hover:shadow-[0_28px_70px_rgba(48,59,77,0.12)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[rgba(39,51,67,0.18)]"
              : "",
            item.colSpan === 2 ? "xl:col-span-2" : "",
            item.rowSpan === 2 ? "xl:row-span-2" : "",
            item.hasPersistentHover
              ? "border-[rgba(39,51,67,0.12)] shadow-[0_24px_64px_rgba(48,59,77,0.1)]"
              : "",
          )}
          onClick={item.onOpen}
          onKeyDown={(event) => handleCardKeyDown(event, item.onOpen)}
          role={item.onOpen ? "button" : undefined}
          tabIndex={item.onOpen ? 0 : undefined}
        >
          <div
            className={cn(
              "pointer-events-none absolute inset-0 opacity-0 transition-opacity duration-300",
              item.hasPersistentHover ? "opacity-100" : "group-hover:opacity-100",
            )}
          >
            <div className="absolute inset-0 bg-[radial-gradient(circle_at_top_right,rgba(205,226,255,0.28),transparent_38%),radial-gradient(circle_at_bottom_left,rgba(255,221,203,0.2),transparent_34%),radial-gradient(circle_at_center,rgba(39,51,67,0.02)_1px,transparent_1px)] bg-[length:auto,auto,5px_5px]" />
          </div>

          {item.image ? (
            <div className="pointer-events-none absolute inset-y-0 right-0 w-[38%] overflow-hidden opacity-20 transition-opacity duration-300 group-hover:opacity-30">
              <img
                src={item.image}
                alt=""
                className="h-full w-full object-cover"
              />
              <div className="absolute inset-0 bg-gradient-to-l from-[rgba(255,255,255,0.08)] via-[rgba(250,246,240,0.58)] to-[rgba(255,255,255,0.94)]" />
            </div>
          ) : null}

          <div className="relative flex h-full flex-col gap-4">
            <div className="flex items-start justify-between gap-3">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-2xl bg-[rgba(39,51,67,0.06)] text-[var(--ink)] transition-colors duration-300 group-hover:bg-[rgba(39,51,67,0.1)]">
                {item.icon}
              </div>
              <div className="flex flex-wrap items-center justify-end gap-2 text-right">
                {item.meta ? (
                  <span className="text-[11px] font-medium uppercase tracking-[0.18em] text-[var(--ink-faint)]">
                    {item.meta}
                  </span>
                ) : null}
                <span className="rounded-full border border-[rgba(68,83,101,0.12)] bg-white/70 px-2.5 py-1 text-[11px] font-medium uppercase tracking-[0.14em] text-[var(--ink-soft)] backdrop-blur-sm">
                  {item.status || "Active"}
                </span>
              </div>
            </div>

            <div className="space-y-2">
              <h3 className="pr-[22%] text-[1.18rem] font-semibold leading-tight tracking-[-0.03em] text-[var(--ink)]">
                {item.title}
              </h3>
              <p
                className={cn(
                  "text-sm leading-6 text-[var(--ink-soft)]",
                  item.colSpan === 2 || item.rowSpan === 2
                    ? "line-clamp-4"
                    : "line-clamp-3",
                )}
              >
                {item.description}
              </p>
            </div>

            <div className="mt-auto flex flex-wrap items-end justify-between gap-3">
              <div className="flex flex-wrap gap-2">
                {item.tags?.map((tag, tagIndex) => (
                  <span
                    key={`${tag}-${tagIndex}`}
                    className="rounded-full border border-[rgba(68,83,101,0.1)] bg-white/72 px-2.5 py-1 text-[12px] font-medium text-[var(--ink-soft)] backdrop-blur-sm"
                  >
                    {tag}
                  </span>
                ))}
              </div>

              <div className="flex flex-wrap items-center justify-end gap-2">
                {item.footer ? (
                  <span className="inline-flex items-center gap-1 rounded-full bg-[rgba(39,51,67,0.05)] px-2.5 py-1 text-[12px] text-[var(--ink-faint)]">
                    <Clock className="h-3.5 w-3.5" />
                    {item.footer}
                  </span>
                ) : null}

                {item.onAction ? (
                  <button
                    type="button"
                    className="inline-flex items-center gap-1.5 rounded-full border border-[rgba(39,51,67,0.12)] bg-[rgba(39,51,67,0.92)] px-3 py-1.5 text-[12px] font-medium text-white shadow-[0_10px_24px_rgba(39,51,67,0.14)] transition-transform duration-200 hover:-translate-y-0.5"
                    onClick={(event) => {
                      event.stopPropagation();
                      item.onAction?.();
                    }}
                  >
                    <Plus className="h-3.5 w-3.5" />
                    {item.actionLabel || "Use in ideas"}
                  </button>
                ) : null}

                <span className="inline-flex items-center gap-1 text-[12px] font-medium text-[var(--ink-faint)] opacity-0 transition-opacity duration-300 group-hover:opacity-100">
                  {item.cta || "Open"}
                  <ArrowUpRight className="h-3.5 w-3.5" />
                </span>
              </div>
            </div>
          </div>
        </motion.article>
      ))}
    </motion.div>
  );
}

export { BentoGrid };
