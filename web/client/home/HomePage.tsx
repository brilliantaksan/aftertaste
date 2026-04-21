import React, { useState, useEffect, useMemo, useRef } from "react";
import HyperTextParagraph from "./HyperTextParagraph.js";
import { CinematicFooter } from "../components/ui/motion-footer.js";
import type { TasteSnapshot, ReferencesResponse, CaptureRecord, TasteGraph, TasteGraphNode } from "../../shared/contracts.js";
import { renderGraph } from "../graph.js";

interface CaptureListResponse { captures: CaptureRecord[]; }

interface HomePageProps {
  onNavigate: (view: string) => void;
}

interface HomeData {
  snapshot: TasteSnapshot | null;
  referenceCount: number;
  captureCount: number;
  graph: TasteGraph | null;
}

interface InlineTasteGraphPreviewProps {
  graph: TasteGraph;
}

function cleanToken(value: string): string {
  return value.toLowerCase().replace(/[^a-z0-9]/g, "");
}

function splitCleanTokens(value: string): string[] {
  return value
    .split(/\s+/)
    .map(cleanToken)
    .filter(Boolean);
}

function buildHighlightNodeIndex(graph: TasteGraph | null): Map<string, TasteGraphNode> {
  if (!graph) return new Map();
  const index = new Map<string, TasteGraphNode>();
  const groupPriority = new Map<string, number>([
    ["themes", 5],
    ["motifs", 4],
    ["creators", 3],
    ["formats", 2],
    ["references", 1],
  ]);

  for (const node of graph.nodes) {
    const labelTokens = splitCleanTokens(node.label);
    const titleTokens = splitCleanTokens(node.title ?? "");
    const summaryTokens = splitCleanTokens(node.summary ?? "");
    const allTokens = new Set([...labelTokens, ...titleTokens, ...summaryTokens]);
    for (const token of allTokens) {
      const current = index.get(token);
      if (!current) {
        index.set(token, node);
        continue;
      }
      const nodeScore =
        (labelTokens.includes(token) ? 100 : 0) +
        (titleTokens.includes(token) ? 40 : 0) +
        (summaryTokens.includes(token) ? 10 : 0) +
        (groupPriority.get(node.group) ?? 0) * 5 -
        node.label.length * 0.01;
      const currentLabelTokens = splitCleanTokens(current.label);
      const currentTitleTokens = splitCleanTokens(current.title ?? "");
      const currentSummaryTokens = splitCleanTokens(current.summary ?? "");
      const currentScore =
        (currentLabelTokens.includes(token) ? 100 : 0) +
        (currentTitleTokens.includes(token) ? 40 : 0) +
        (currentSummaryTokens.includes(token) ? 10 : 0) +
        (groupPriority.get(current.group) ?? 0) * 5 -
        current.label.length * 0.01;
      if (nodeScore > currentScore) index.set(token, node);
    }
  }

  return index;
}

function buildFocusedSubgraph(graph: TasteGraph, focusedNodeId: string): TasteGraph {
  const focusedEdges = graph.edges.filter((edge) => edge.sourceId === focusedNodeId || edge.targetId === focusedNodeId);
  const relatedNodeIds = new Set<string>([focusedNodeId]);

  for (const edge of focusedEdges) {
    relatedNodeIds.add(edge.sourceId);
    relatedNodeIds.add(edge.targetId);
  }

  return {
    nodes: graph.nodes.filter((node) => relatedNodeIds.has(node.id)),
    edges: focusedEdges,
  };
}

function InlineTasteGraphPreview({ graph }: InlineTasteGraphPreviewProps) {
  const svgRef = useRef<SVGSVGElement | null>(null);

  useEffect(() => {
    if (!svgRef.current) return;
    const handle = renderGraph(svgRef.current, graph, {
      interactive: false,
      showLabels: false,
      showTooltip: false,
      fitToViewport: true,
      fitPadding: 84,
      maxFitScale: 0.72,
      fitScaleMultiplier: 0.92,
      staticTicks: 260,
      linkDistance: 84,
      linkStrength: 0.22,
      chargeStrength: -240,
    });
    return () => handle.teardown();
  }, [graph]);

  return <svg ref={svgRef} className="hero-graph-svg" />;
}

function buildNarrative(snapshot: TasteSnapshot): { text: string; highlights: string[] } {
  const theme = snapshot.themes[0];
  const theme2 = snapshot.themes[1];
  const motif = snapshot.motifs[0];
  const motif2 = snapshot.motifs[1];
  const pattern = snapshot.creatorPatterns[0];

  const highlights: string[] = [];
  [theme, theme2, motif, motif2].filter(Boolean).forEach(tag => {
    tag!.label.split(/\s+/).forEach(w => {
      const c = w.toLowerCase().replace(/[^a-z0-9]/g, "");
      if (c.length > 3) highlights.push(c);
    });
  });

  const parts: string[] = [];

  if (theme && theme2) {
    parts.push(`Your archive has been sitting with ${theme.label} and ${theme2.label}.`);
  } else if (theme) {
    parts.push(`Your archive keeps returning to ${theme.label}.`);
  } else {
    return { text: "Your archive is still finding its voice.", highlights: [] };
  }

  if (motif && motif2) {
    parts.push(`A quiet pull toward ${motif.label} and ${motif2.label} — the kind of thing your eye is already doing without naming it.`);
  } else if (motif) {
    parts.push(`A quiet pull toward ${motif.label} — the kind of thing your eye is already doing.`);
  }

  if (pattern) {
    const short = pattern.summary.split(/[.!?]/)[0];
    if (short && short.length < 80) parts.push(`${short}.`);
  }

  return { text: parts.join(" "), highlights: [...new Set(highlights)] };
}

export default function HomePage({ onNavigate }: HomePageProps) {
  const [data, setData] = useState<HomeData>({ snapshot: null, referenceCount: 0, captureCount: 0, graph: null });
  const [loading, setLoading] = useState(true);
  const [hoveredWord, setHoveredWord] = useState<string | null>(null);

  async function fetchData() {
    try {
      const [snapshotRes, capturesRes, refsRes, graph] = await Promise.all([
        fetch("/api/snapshot/current"),
        fetch("/api/captures"),
        fetch("/api/references"),
        fetch("/api/graph/taste")
          .then(async (response) => {
            if (!response.ok) return null;
            return await response.json() as TasteGraph;
          })
          .catch(() => null),
      ]);
      const snapshot = await snapshotRes.json() as TasteSnapshot;
      const captures = await capturesRes.json() as CaptureListResponse;
      const refs = await refsRes.json() as ReferencesResponse;
      setData({ snapshot, referenceCount: refs.references.length, captureCount: captures.captures.length, graph });
    } catch (err) {
      console.error("HomePage fetch failed:", err);
    } finally {
      setLoading(false);
    }
  }

  useEffect(() => {
    void fetchData();
    const handler = () => void fetchData();
    document.addEventListener("aftertaste:refresh", handler);
    return () => document.removeEventListener("aftertaste:refresh", handler);
  }, []);

  const { snapshot, referenceCount, captureCount } = data;
  const highlightNodeIndex = useMemo(() => buildHighlightNodeIndex(data.graph), [data.graph]);
  const focusedNode = useMemo(() => {
    if (!hoveredWord) return null;
    return highlightNodeIndex.get(cleanToken(hoveredWord)) ?? null;
  }, [highlightNodeIndex, hoveredWord]);
  const focusedPreviewGraph = useMemo(() => {
    if (!data.graph || !focusedNode) return null;
    return buildFocusedSubgraph(data.graph, focusedNode.id);
  }, [data.graph, focusedNode]);
  const showGraphPreview = Boolean(hoveredWord && data.graph && focusedNode);

  if (loading || !snapshot) {
    return (
      <div className="absolute inset-0 flex items-center justify-center">
        <div style={{ display: "grid", gap: "0.75rem", width: "100%", maxWidth: "36rem", padding: "2rem" }}>
          {[75, 100, 83, 66].map((w, i) => (
            <div key={i} className="animate-pulse" style={{ height: "1rem", borderRadius: "6px", background: "rgba(39,51,67,0.08)", width: `${w}%` }} />
          ))}
        </div>
      </div>
    );
  }

  const narrative = buildNarrative(snapshot);
  const leadTheme = snapshot.themes[0]?.label ?? "Taste signal forming";
  const leadMotif = snapshot.motifs[0]?.label ?? "A visual instinct is repeating";
  const leadPattern = snapshot.creatorPatterns[0]?.label ?? "A recognizable voice is emerging";
  const promptSeedCount = snapshot.promptSeeds.length;
  const questionCount = snapshot.openQuestions.length;

  const signalScore = Math.min(98, Math.max(24, Math.round(
    ((snapshot.themes.length * 2 + snapshot.motifs.length + snapshot.creatorPatterns.length) /
      Math.max(1, referenceCount + 3)) * 28
  )));
  const promptScore = Math.min(96, Math.max(18, Math.round(
    (promptSeedCount / Math.max(1, promptSeedCount + questionCount + 1)) * 100
  )));


  return (
    <div className="home-screen-root relative overflow-x-hidden">
      <section
        className="home-screen-stage relative z-10"
        style={{
          display: "grid",
          gridTemplateColumns: "minmax(0, 1.28fr) minmax(320px, 0.92fr)",
          alignItems: "start",
          gap: "1.1rem",
          padding: "1.5rem 1.5rem clamp(12rem, 18vw, 16rem)",
          minHeight: "clamp(40rem, calc(100svh - 8rem), 47rem)",
        }}
      >

        {/* Left column — narrative */}
        <div className="hero-copy hero-copy-orbit" style={{ justifyContent: "flex-start", gap: "0.75rem" }}>
          <div className="hero-chip-row">
            <span className="workspace-pill workspace-pill-soft">Window · {snapshot.window.label}</span>
            <span className="workspace-pill workspace-pill-soft">{promptSeedCount} prompt seed{promptSeedCount !== 1 ? "s" : ""}</span>
            <span className="workspace-pill workspace-pill-soft">{questionCount} open question{questionCount !== 1 ? "s" : ""}</span>
          </div>

          <div>
            <HyperTextParagraph
              text={narrative.text}
              highlightWords={narrative.highlights}
              className="hero-narrative"
              onWordClick={() => onNavigate("references")}
              onWordHoverStart={(word) => setHoveredWord(word)}
              onWordHoverEnd={(word) => setHoveredWord((current) => cleanToken(current ?? "") === cleanToken(word) ? null : current)}
            />
            <p style={{ marginTop: "0.5rem", fontFamily: "var(--font-mono)", fontSize: "0.72rem", color: "var(--ink-faint)" }}>
              Hover highlighted words to see where they live in the archive
            </p>
          </div>

          <div style={{ display: "flex", flexWrap: "wrap", gap: "0.4rem" }}>
            {snapshot.themes.slice(0, 4).map(t => (
              <button key={t.slug} className="signal-chip" onClick={() => onNavigate("references")}>
                {t.label}
              </button>
            ))}
            {snapshot.motifs.slice(0, 3).map(m => (
              <button key={m.slug} className="signal-chip" style={{ opacity: 0.7 }} onClick={() => onNavigate("references")}>
                {m.label}
              </button>
            ))}
          </div>

          <div className="hero-actions">
            <button className="pill-btn pill-btn-solid" type="button" onClick={() => onNavigate("capture")}>
              Capture something
            </button>
            <button className="pill-btn" type="button" onClick={() => onNavigate("ideas")}>
              Turn this into ideas
            </button>
            <button className="pill-btn pill-btn-muted" type="button" onClick={() => onNavigate("studio")}>
              Browse Wiki
            </button>
          </div>

          <div className="hero-stat-band">
            <article className="hero-stat-tile">
              <span className="detail-label">Lead theme</span>
              <strong>{leadTheme}</strong>
            </article>
            <article className="hero-stat-tile">
              <span className="detail-label">Motif pulse</span>
              <strong>{leadMotif}</strong>
            </article>
            <article className="hero-stat-tile">
              <span className="detail-label">Voice signature</span>
              <strong>{leadPattern}</strong>
            </article>
          </div>
        </div>

        {/* Right column — side cards */}
        <div className="hero-side-stack">
          {showGraphPreview && focusedNode && focusedPreviewGraph ? (
            <article className="hero-glass-card hero-glass-card-spotlight hero-graph-card">
              <div className="hero-card-head hero-card-head-graph">
                <div>
                  <span className="eyebrow">Archive graph</span>
                  <h2>{focusedNode.label} is active in the archive.</h2>
                </div>
                <span className="hero-card-kicker">{focusedNode.group}</span>
              </div>

              <div className="hero-graph-meta">
                <span className="hero-tag hero-tag-live">hover: {cleanToken(hoveredWord ?? "")}</span>
                <span className="hero-tag">{focusedPreviewGraph.nodes.length - 1} links</span>
                <span className="hero-tag">{focusedNode.kind}</span>
              </div>

              <div className="hero-graph-preview">
                <InlineTasteGraphPreview graph={focusedPreviewGraph} />
              </div>

              <p className="hero-graph-caption">
                The graph preview follows the highlighted word and returns to Archive pulse when the hover ends.
              </p>
            </article>
          ) : (
            <article className="hero-glass-card hero-glass-card-spotlight">
              <div className="hero-card-head">
                <div>
                  <span className="eyebrow">Archive pulse</span>
                  <h2>Signal is condensing into a usable point of view.</h2>
                </div>
                <span className="hero-card-kicker">{referenceCount} local refs</span>
              </div>

              <div className="hero-metric-block">
                <div>
                  <span className="hero-metric-value">{signalScore}%</span>
                  <span className="hero-metric-label">taste signal density</span>
                </div>
                <div className="hero-progress-stack">
                  <div className="hero-progress-row">
                    <span>Signal read</span>
                    <strong>{signalScore}%</strong>
                  </div>
                  <div className="hero-progress-track"><span style={{ width: `${signalScore}%` }} /></div>
                  <div className="hero-progress-row">
                    <span>Prompt readiness</span>
                    <strong>{promptScore}%</strong>
                  </div>
                  <div className="hero-progress-track hero-progress-track-mint"><span style={{ width: `${promptScore}%` }} /></div>
                </div>
              </div>

              <div className="hero-mini-grid">
                <div className="hero-mini-stat"><strong>{captureCount}</strong><span>captures processed</span></div>
                <div className="hero-mini-stat"><strong>{snapshot.notableReferences.length}</strong><span>active anchors</span></div>
                <div className="hero-mini-stat"><strong>{questionCount}</strong><span>open tensions</span></div>
              </div>

              <div className="hero-tag-row">
                <span className="hero-tag hero-tag-live">Local-first</span>
                <span className="hero-tag">Vault-backed</span>
                <span className="hero-tag">Voice-preserving</span>
              </div>
            </article>
          )}

        </div>
      </section>
      <div className="home-screen-finale">
        <CinematicFooter onNavigate={(view) => onNavigate(view)} />
      </div>
    </div>
  );
}
