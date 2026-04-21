import * as d3force from "d3-force";
import * as d3sel from "d3-selection";
import * as d3zoom from "d3-zoom";
import * as d3drag from "d3-drag";
import type { TasteGraph, TasteGraphEdge as TasteGraphEdgeData, TasteGraphNode } from "../shared/contracts.js";

export interface GraphNode extends TasteGraphNode, d3force.SimulationNodeDatum {}

interface GraphEdge extends TasteGraphEdgeData, d3force.SimulationLinkDatum<GraphNode> {
  source: string | GraphNode;
  target: string | GraphNode;
}

export interface GraphOptions {
  onNodeClick?: (node: GraphNode) => void;
  interactive?: boolean;
  showLabels?: boolean;
  showTooltip?: boolean;
  fitToViewport?: boolean;
  fitPadding?: number;
  maxFitScale?: number;
  fitScaleMultiplier?: number;
  staticTicks?: number;
  linkDistance?: number;
  linkStrength?: number;
  chargeStrength?: number;
}

export interface GraphHandle {
  teardown: () => void;
  zoomIn: () => void;
  zoomOut: () => void;
  zoomReset: () => void;
}

// ── Node colours — saturated enough to read on the light particle background
const GROUP_COLOR: Record<string, string> = {
  references: "#e87b3a",
  themes:     "#e8a83a",
  motifs:     "#52a87a",
  creators:   "#e05252",
  formats:    "#c4a820",
  snapshots:  "#62b850",
  briefs:     "#4ab87a",
  sessions:   "#9878c8",
  other:      "#7a8298",
};

function groupColor(g: string): string {
  return GROUP_COLOR[g] ?? GROUP_COLOR.other;
}

function nodeRadius(d: GraphNode): number {
  return 4.5 + Math.sqrt(Math.max(d.degree, 1)) * 2.2;
}

export function renderGraph(
  svgEl: SVGSVGElement,
  data: TasteGraph,
  opts: GraphOptions = {},
): GraphHandle {
  const interactive = opts.interactive ?? true;
  const showLabels = opts.showLabels ?? true;
  const tooltipEnabled = opts.showTooltip ?? interactive;
  const fitToViewport = opts.fitToViewport ?? false;
  const fitPadding = opts.fitPadding ?? 36;
  const maxFitScale = opts.maxFitScale ?? 1.15;
  const fitScaleMultiplier = opts.fitScaleMultiplier ?? 1;
  const staticTicks = opts.staticTicks ?? 0;
  const linkDistance = opts.linkDistance ?? 160;
  const linkStrength = opts.linkStrength ?? 0.18;
  const chargeStrength = opts.chargeStrength ?? -700;

  const svg = d3sel.select(svgEl);
  svg.selectAll("*").remove();

  const width  = svgEl.clientWidth  || 1200;
  const height = svgEl.clientHeight || 800;
  svg.attr("viewBox", `0 0 ${width} ${height}`);

  // ── Defs ───────────────────────────────────────────────────────────────────

  const defs = svg.append("defs");

  // Soft glow filter used by node halos
  defs.append("filter")
    .attr("id", "node-glow")
    .attr("x", "-80%").attr("y", "-80%")
    .attr("width", "260%").attr("height", "260%")
    .append("feGaussianBlur")
    .attr("in", "SourceGraphic")
    .attr("stdDeviation", "3.5");

  // ── Layers ─────────────────────────────────────────────────────────────────

  const root      = svg.append("g").attr("class", "graph-root");
  const linkLayer = root.append("g").attr("class", "links");
  const nodeLayer = root.append("g").attr("class", "nodes");

  // ── Data ───────────────────────────────────────────────────────────────────

  const nodes: GraphNode[] = data.nodes.map((n) => ({ ...n }));
  const links: GraphEdge[] = data.edges.map((e) => ({
    ...e,
    source: e.sourceId,
    target: e.targetId,
  }));

  // Seed tight cluster at centre so physics spreads them naturally
  for (const n of nodes) {
    const a = Math.random() * Math.PI * 2;
    const r = 30 + Math.random() * 40;
    n.x = width  / 2 + Math.cos(a) * r;
    n.y = height / 2 + Math.sin(a) * r;
  }

  const adjacency = new Map<string, Set<string>>();
  for (const n of nodes) adjacency.set(n.id, new Set());
  for (const e of data.edges) {
    adjacency.get(e.sourceId)?.add(e.targetId);
    adjacency.get(e.targetId)?.add(e.sourceId);
  }

  // ── Physics ────────────────────────────────────────────────────────────────

  const sim = d3force
    .forceSimulation<GraphNode>(nodes)
    .force("link",
      d3force.forceLink<GraphNode, GraphEdge>(links)
        .id((d) => d.id)
        .distance(linkDistance)
        .strength(linkStrength),
    )
    .force("charge", d3force.forceManyBody<GraphNode>().strength(chargeStrength).distanceMax(900))
    .force("center",    d3force.forceCenter(width / 2, height / 2))
    .force("collision", d3force.forceCollide<GraphNode>().radius((d) => nodeRadius(d) + 12).strength(0.85))
    .force("x", d3force.forceX(width  / 2).strength(0.02))
    .force("y", d3force.forceY(height / 2).strength(0.02))
    .alphaDecay(0.006)
    .velocityDecay(0.3)
    .alphaTarget(0.012);

  // Gentle ambient jitter — keeps the graph feeling alive
  if (interactive) {
    sim.force("noise", () => {
      for (const n of nodes) {
        if (n.fx != null) continue;
        n.vx = (n.vx ?? 0) + (Math.random() - 0.5) * 0.07;
        n.vy = (n.vy ?? 0) + (Math.random() - 0.5) * 0.07;
      }
    });
  }

  // ── Links ──────────────────────────────────────────────────────────────────

  // Build a quick id→group map before forceLink mutates source/target
  const nodeGroupById = new Map(data.nodes.map((n) => [n.id, n.group]));

  const linkSel = linkLayer
    .selectAll<SVGLineElement, GraphEdge>("line")
    .data(links)
    .enter()
    .append("line")
    .attr("class", "link")
    .attr("stroke-linecap", "round")
    // sourceId is from the original edge datum and is never mutated by D3
    .attr("stroke",       (d) => groupColor(nodeGroupById.get(d.sourceId) ?? "other"))
    .attr("stroke-width", (d) => 0.8 + d.weight * 0.7)
    .attr("opacity",      (d) => 0.38 + d.weight * 0.22);

  // ── Nodes ──────────────────────────────────────────────────────────────────

  const nodeSel = nodeLayer
    .selectAll<SVGGElement, GraphNode>("g.node")
    .data(nodes)
    .enter()
    .append("g")
    .attr("class",          (d) => `node group-${sanitizeGroup(d.group)}`)
    .attr("pointer-events", "all")
    .attr("cursor",         "pointer");

  const nodeInner = nodeSel
    .append("g")
    .attr("class", "node-inner")
    .style("animation-delay", (_, i) => `${Math.min(800, i * 16)}ms`);

  // Glow halo
  nodeInner.append("circle")
    .attr("class", "node-halo")
    .attr("r",      (d) => nodeRadius(d) * 2.2)
    .attr("fill",   (d) => groupColor(d.group))
    .attr("opacity", 0.18)
    .attr("filter", "url(#node-glow)");

  // Main filled circle
  nodeInner.append("circle")
    .attr("class", "node-main")
    .attr("r",    (d) => nodeRadius(d))
    .attr("fill", (d) => groupColor(d.group));

  // Label — visible by default, positioned to the right of the node
  nodeInner.append("text")
    .attr("class", "node-label")
    .attr("x", (d) => nodeRadius(d) + 6)
    .attr("dy", "0.35em")
    .attr("fill", "rgba(30, 20, 10, 0.82)")
    .attr("font-size", "11px")
    .attr("font-weight", "500")
    .attr("font-family", "system-ui, sans-serif")
    .attr("pointer-events", "none")
    .attr("opacity", showLabels ? 1 : 0)
    .attr("paint-order", "stroke")
    .attr("stroke", "rgba(255,252,248,0.92)")
    .attr("stroke-width", "3")
    .attr("stroke-linejoin", "round")
    .text((d) => d.title || d.label);

  // ── Drag ───────────────────────────────────────────────────────────────────

  if (interactive) {
    nodeSel.call(
      d3drag.drag<SVGGElement, GraphNode>()
        .on("start", (event, d) => {
          if (!event.active) sim.alphaTarget(0.2).restart();
          d.fx = d.x; d.fy = d.y;
        })
        .on("drag", (event, d) => { d.fx = event.x; d.fy = event.y; })
        .on("end", (event, d) => {
          if (!event.active) sim.alphaTarget(0.012);
          d.fx = null; d.fy = null;
        }),
    );
  }

  // ── Zoom / pan ─────────────────────────────────────────────────────────────

  const zoomBehavior = d3zoom
    .zoom<SVGSVGElement, unknown>()
    .scaleExtent([0.15, 5])
    .on("zoom", (event) => {
      root.attr("transform", event.transform.toString());
      // Labels always visible at k≥0.4; fade out only when very zoomed out
      const k = event.transform.k;
      nodeLayer.selectAll<SVGTextElement, GraphNode>(".node-label")
        .attr("opacity", Math.max(0, Math.min(1, k * 2 - 0.1)));
    });

  if (interactive) {
    svg.call(zoomBehavior);
  }

  // ── Tooltip ────────────────────────────────────────────────────────────────

  const wrap = svgEl.parentElement!;
  const tooltip = document.createElement("div");
  if (tooltipEnabled) {
    tooltip.className = "graph-tooltip";
    tooltip.style.display = "none";
    wrap.appendChild(tooltip);
  }

  function showTooltip(event: MouseEvent, d: GraphNode): void {
    const wrapRect = wrap.getBoundingClientRect();
    // Sorted neighbours: strongest edge weight first, cap at 7
    const neighbourNodes = data.edges
      .filter((e) => e.sourceId === d.id || e.targetId === d.id)
      .sort((a, b) => b.weight - a.weight)
      .slice(0, 7)
      .map((e) => {
        const otherId = e.sourceId === d.id ? e.targetId : e.sourceId;
        return nodes.find((n) => n.id === otherId);
      })
      .filter((n): n is GraphNode => n !== undefined);

    const connRows = neighbourNodes.map((n) => `
      <div class="gt-conn-row">
        <span class="gt-dot" style="background:${groupColor(n.group)}"></span>
        <span class="gt-conn-name">${n.title || n.label}</span>
      </div>`).join("");

    tooltip.innerHTML = `
      <div class="gt-header">
        <span class="gt-dot gt-dot-lg" style="background:${groupColor(d.group)};box-shadow:0 0 6px 2px ${groupColor(d.group)}55"></span>
        <div>
          <div class="gt-name">${d.title || d.label}</div>
          <div class="gt-type">${d.group}</div>
        </div>
      </div>
      ${connRows ? `<div class="gt-divider"></div><div class="gt-connections">${connRows}</div>` : ""}`;

    tooltip.style.display = "block";

    // Position: to the right of the cursor, flip left if near right edge
    const x = event.clientX - wrapRect.left + 14;
    const y = event.clientY - wrapRect.top  - 10;
    const ttW = 210;
    tooltip.style.left = (x + ttW > wrapRect.width - 8) ? `${x - ttW - 28}px` : `${x}px`;
    tooltip.style.top  = `${Math.max(8, y)}px`;
  }

  // ── Hover ──────────────────────────────────────────────────────────────────

  if (interactive) {
    nodeSel
      .on("mouseenter", (event: MouseEvent, d) => {
        const neighbours = adjacency.get(d.id) ?? new Set();
        nodeSel.classed("dim",       (n) => n.id !== d.id && !neighbours.has(n.id));
        nodeSel.classed("highlight", (n) => n.id === d.id || neighbours.has(n.id));
        linkSel.classed("dim",       (l) => edgeId(l) !== d.id && edgeTgt(l) !== d.id);
        linkSel.classed("highlight", (l) => edgeId(l) === d.id || edgeTgt(l) === d.id);
        if (tooltipEnabled) showTooltip(event, d);
      })
      .on("mouseleave", () => {
        nodeSel.classed("dim", false).classed("highlight", false);
        linkSel.classed("dim", false).classed("highlight", false);
        if (tooltipEnabled) tooltip.style.display = "none";
      })
      .on("click", (_event, d) => opts.onNodeClick?.(d));
  }

  function updatePositions(): void {
    linkSel
      .attr("x1", (d) => (d.source as GraphNode).x ?? 0)
      .attr("y1", (d) => (d.source as GraphNode).y ?? 0)
      .attr("x2", (d) => (d.target as GraphNode).x ?? 0)
      .attr("y2", (d) => (d.target as GraphNode).y ?? 0);

    nodeSel.attr("transform", (d) => `translate(${d.x ?? 0},${d.y ?? 0})`);
  }

  function fitGraphToViewport(): void {
    if (!fitToViewport || nodes.length === 0) return;

    const minX = Math.min(...nodes.map((n) => (n.x ?? 0) - nodeRadius(n) - 12));
    const maxX = Math.max(...nodes.map((n) => (n.x ?? 0) + nodeRadius(n) + 12));
    const minY = Math.min(...nodes.map((n) => (n.y ?? 0) - nodeRadius(n) - 12));
    const maxY = Math.max(...nodes.map((n) => (n.y ?? 0) + nodeRadius(n) + 12));

    const graphWidth = Math.max(1, maxX - minX);
    const graphHeight = Math.max(1, maxY - minY);
    const innerWidth = Math.max(1, width - fitPadding * 2);
    const innerHeight = Math.max(1, height - fitPadding * 2);
    const scale = Math.min(innerWidth / graphWidth, innerHeight / graphHeight, maxFitScale) * fitScaleMultiplier;
    const tx = width / 2 - ((minX + maxX) / 2) * scale;
    const ty = height / 2 - ((minY + maxY) / 2) * scale;
    const transform = d3zoom.zoomIdentity.translate(tx, ty).scale(scale);

    if (interactive) {
      svg.call(zoomBehavior.transform, transform);
    } else {
      root.attr("transform", transform.toString());
    }
  }

  // ── Tick ───────────────────────────────────────────────────────────────────
  if (staticTicks > 0) {
    sim.stop();
    for (let i = 0; i < staticTicks; i += 1) sim.tick();
    updatePositions();
    fitGraphToViewport();
  } else {
    sim.on("tick", () => {
      updatePositions();
    });
    if (fitToViewport) {
      window.setTimeout(() => fitGraphToViewport(), 220);
    }
  }

  return {
    teardown: () => { sim.stop(); svg.selectAll("*").remove(); tooltip.remove(); },
    zoomIn:    () => zoomBehavior.scaleBy(svg, 1.45),
    zoomOut:   () => zoomBehavior.scaleBy(svg, 0.69),
    zoomReset: () => fitToViewport ? fitGraphToViewport() : zoomBehavior.transform(svg, d3zoom.zoomIdentity),
  };
}

function sanitizeGroup(g: string): string {
  return ["references","themes","motifs","creators","formats","snapshots","briefs","sessions"].includes(g)
    ? g : "other";
}

function edgeId(l: GraphEdge): string {
  return typeof l.source === "string" ? l.source : (l.source as GraphNode).id;
}
function edgeTgt(l: GraphEdge): string {
  return typeof l.target === "string" ? l.target : (l.target as GraphNode).id;
}
