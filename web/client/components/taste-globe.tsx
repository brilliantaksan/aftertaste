import React, { useCallback, useEffect, useMemo, useRef, useState } from "react"
import { createRoot } from "react-dom/client"
import { Globe } from "./ui/globe.js"
import type { Arc, Marker } from "cobe"
import type { TasteGraph, TasteGraphNode } from "../../shared/contracts.js"

// ─── palette ──────────────────────────────────────────────────────────────────

const GROUP_COLORS: Record<string, string> = {
  references: "#e87b3a",
  themes:     "#e8a83a",
  motifs:     "#52a87a",
  creators:   "#e05252",
  formats:    "#d4b830",
  snapshots:  "#72b860",
  briefs:     "#4ab87a",
  sessions:   "#9878c8",
}

// Cobe marker size scale (0–1 range, ~0.03–0.07 looks right)
const GROUP_MARKER_SIZES: Record<string, number> = {
  references: 0.055,
  themes:     0.048,
  motifs:     0.048,
  creators:   0.062,
  formats:    0.042,
  snapshots:  0.050,
  briefs:     0.042,
  sessions:   0.068,
}

// Hit-zone pixel sizes for mouse events (slightly larger than visual dot)
const HIT_SIZES: Record<string, number> = {
  references: 18, themes: 16, motifs: 16, creators: 20,
  formats: 14, snapshots: 16, briefs: 14, sessions: 22,
}

const GROUP_LAT_BANDS: Record<string, [number, number]> = {
  references: [15,  55],
  themes:     [-10, 15],
  motifs:     [-35, -10],
  creators:   [50,  75],
  formats:    [-60, -35],
  snapshots:  [68,  82],
  briefs:     [-82, -68],
  sessions:   [-25,  25],
}

// ─── helpers ──────────────────────────────────────────────────────────────────

function hexToRgb(hex: string): [number, number, number] {
  const n = parseInt(hex.replace("#", ""), 16)
  return [(n >> 16 & 255) / 255, (n >> 8 & 255) / 255, (n & 255) / 255]
}

// Dim a colour for the "inactive" arc state
function dim(c: [number, number, number], factor = 0.22): [number, number, number] {
  return [c[0] * factor, c[1] * factor, c[2] * factor]
}

// ─── sphere coord assignment ──────────────────────────────────────────────────

interface SphereNode extends TasteGraphNode { lat: number; lng: number }

function assignSphereCoords(nodes: TasteGraphNode[]): SphereNode[] {
  const byGroup: Record<string, TasteGraphNode[]> = {}
  for (const n of nodes) (byGroup[n.group] ??= []).push(n)
  const goldenAngle = 2.399963
  const result: SphereNode[] = []
  for (const [group, members] of Object.entries(byGroup)) {
    const [latMin, latMax] = GROUP_LAT_BANDS[group] ?? [-60, 60]
    members.forEach((node, i) => {
      const t   = members.length > 1 ? i / (members.length - 1) : 0.5
      const lat = latMin + t * (latMax - latMin)
      const lng = (((i * goldenAngle * 180) / Math.PI) % 360) - 180
      result.push({ ...node, lat, lng })
    })
  }
  return result
}

// ─── 3-D → 2-D projection ─────────────────────────────────────────────────────

function project(lat: number, lng: number, phi: number, theta: number) {
  const latR = (lat * Math.PI) / 180
  const lngR = (lng * Math.PI) / 180
  const x0 = Math.cos(latR) * Math.cos(lngR)
  const y0 = Math.sin(latR)
  const z0 = Math.cos(latR) * Math.sin(lngR)
  const x1 =  x0 * Math.cos(phi) + z0 * Math.sin(phi)
  const z1 = -x0 * Math.sin(phi) + z0 * Math.cos(phi)
  const y2 = y0 * Math.cos(theta) - z1 * Math.sin(theta)
  const z2 = y0 * Math.sin(theta) + z1 * Math.cos(theta)
  return { x: x1, y: y2, z: z2 }
}

// ─── component ────────────────────────────────────────────────────────────────

interface TasteGlobeProps {
  graph: TasteGraph
  onNodeClick?: (node: TasteGraphNode) => void
  focusedNodeId?: string | null
  showLegend?: boolean
  showHint?: boolean
}

interface TooltipState {
  node: TasteGraphNode
  neighbours: TasteGraphNode[]
  x: number   // relative to containerRef
  y: number
  above: boolean
}

export function TasteGlobe({
  graph,
  onNodeClick,
  focusedNodeId = null,
  showLegend = true,
  showHint = true,
}: TasteGlobeProps) {
  const containerRef = useRef<HTMLDivElement>(null)
  const hitZonesRef  = useRef<Map<string, HTMLDivElement>>(new Map())

  // Live refs read by Globe every animation frame — no re-render needed
  const cobeMarkersRef = useRef<Marker[]>([])
  const cobeArcsRef    = useRef<Arc[]>([])

  const sphereNodes = useMemo(() => assignSphereCoords(graph.nodes), [graph.nodes])
  const sphereMap   = useMemo(() => {
    const m = new Map<string, SphereNode>()
    for (const n of sphereNodes) m.set(n.id, n)
    return m
  }, [sphereNodes])

  // ── build static cobe markers once ────────────────────────────────────────
  const baseMarkers = useMemo<Marker[]>(() =>
    sphereNodes.map((n) => ({
      location: [n.lat, n.lng] as [number, number],
      size:  GROUP_MARKER_SIZES[n.group] ?? 0.05,
      color: hexToRgb(GROUP_COLORS[n.group] ?? "#e87b3a"),
      id:    n.id,
    })),
    [sphereNodes],
  )

  // ── build base arcs — all edges at a near-invisible warm gray ────────────
  const RESTING_ARC_COLOR: [number, number, number] = [0.14, 0.11, 0.08]

  const baseArcs = useMemo<Arc[]>(() => {
    return graph.edges.flatMap((e) => {
      const src = sphereMap.get(e.sourceId)
      const tgt = sphereMap.get(e.targetId)
      if (!src || !tgt) return []
      return [{
        from:  [src.lat, src.lng] as [number, number],
        to:    [tgt.lat, tgt.lng] as [number, number],
        color: RESTING_ARC_COLOR,
        id:    e.id,
      }]
    })
  }, [graph.edges, sphereMap])

  // Write initial values into the live refs
  useEffect(() => {
    cobeMarkersRef.current = baseMarkers
    cobeArcsRef.current    = baseArcs
  }, [baseMarkers, baseArcs])

  // ── adjacency maps ─────────────────────────────────────────────────────────
  const edgesByNode = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const e of graph.edges) {
      ;(m.get(e.sourceId) ?? (m.set(e.sourceId, new Set()), m.get(e.sourceId)!)).add(e.id)
      ;(m.get(e.targetId) ?? (m.set(e.targetId, new Set()), m.get(e.targetId)!)).add(e.id)
    }
    return m
  }, [graph.edges])

  const neighboursByNode = useMemo(() => {
    const m = new Map<string, Set<string>>()
    for (const e of graph.edges) {
      ;(m.get(e.sourceId) ?? (m.set(e.sourceId, new Set()), m.get(e.sourceId)!)).add(e.targetId)
      ;(m.get(e.targetId) ?? (m.set(e.targetId, new Set()), m.get(e.targetId)!)).add(e.sourceId)
    }
    return m
  }, [graph.edges])

  const [tooltip, setTooltip] = useState<TooltipState | null>(null)
  const [hoveredNodeId, setHoveredNodeId] = useState<string | null>(null)

  const activeNodeId = hoveredNodeId ?? focusedNodeId

  const displayMarkers = useMemo<Marker[]>(() => {
    if (!activeNodeId) return baseMarkers
    const neighbourIds = neighboursByNode.get(activeNodeId) ?? new Set<string>()
    return baseMarkers.map((marker) => {
      const id = String(marker.id ?? "")
      const markerColor = marker.color ?? hexToRgb("#e87b3a")
      const isActive = id === activeNodeId
      const isNeighbour = neighbourIds.has(id)
      if (isActive) {
        return {
          ...marker,
          size: marker.size * 1.7,
          color: markerColor,
        }
      }
      if (isNeighbour) {
        return {
          ...marker,
          size: marker.size * 1.22,
          color: markerColor,
        }
      }
      return {
        ...marker,
        size: marker.size * 0.9,
        color: dim(markerColor, 0.34),
      }
    })
  }, [activeNodeId, baseMarkers, neighboursByNode])

  const displayArcs = useMemo<Arc[]>(() => {
    if (!activeNodeId) return baseArcs
    const activeEdgeIds = edgesByNode.get(activeNodeId)
    const activeNode = sphereMap.get(activeNodeId)
    const edgeMap = new Map(graph.edges.map((e) => [e.id, e]))
    return baseArcs.map((arc) => {
      if (!activeEdgeIds?.has(arc.id ?? "")) {
        return { ...arc, color: [0.03, 0.02, 0.015] as [number, number, number] }
      }
      const edge = edgeMap.get(arc.id ?? "")
      const srcNode = edge ? sphereMap.get(edge.sourceId) : undefined
      const colour = hexToRgb(GROUP_COLORS[srcNode?.group ?? activeNode?.group ?? "references"] ?? "#e87b3a")
      return { ...arc, color: colour }
    })
  }, [activeNodeId, baseArcs, edgesByNode, graph.edges, sphereMap])

  // ── per-frame hit-zone sync ────────────────────────────────────────────────
  const handleFrame = useCallback(
    (phi: number, theta: number) => {
      const container = containerRef.current
      if (!container) return
      const w = container.offsetWidth
      if (w === 0) return
      const r = w * 0.44, cx = w / 2, cy = w / 2

      for (const [id, el] of hitZonesRef.current) {
        const sn = sphereMap.get(id)
        if (!sn) continue
        const { x, y, z } = project(sn.lat, sn.lng, phi, theta)
        const half = (HIT_SIZES[sn.group] ?? 16) / 2
        el.style.transform    = `translate(${cx + x * r - half}px, ${cy - y * r - half}px)`
        el.style.pointerEvents = z > 0.08 ? "auto" : "none"
      }
    },
    [sphereMap],
  )

  // ── hover handlers ─────────────────────────────────────────────────────────
  const handleEnter = useCallback(
    (node: TasteGraphNode, e: React.MouseEvent) => {
      const neighbourIds = neighboursByNode.get(node.id)
      // Position the tooltip
      const dotEl   = e.currentTarget as HTMLElement
      const dRect   = dotEl.getBoundingClientRect()
      const cRect   = containerRef.current?.getBoundingClientRect()
      if (!cRect) return

      const x     = dRect.left - cRect.left + dRect.width / 2
      const y     = dRect.top  - cRect.top  + dRect.height / 2
      const above = y > cRect.height * 0.55

      const neighbours = Array.from(neighbourIds ?? [])
        .map((id) => graph.nodes.find((n) => n.id === id))
        .filter((n): n is TasteGraphNode => n !== undefined)
        .slice(0, 6)

      setHoveredNodeId(node.id)
      setTooltip({ node, neighbours, x, y, above })
    },
    [graph.nodes, neighboursByNode],
  )

  const handleLeave = useCallback(() => {
    setHoveredNodeId(null)
    setTooltip(null)
  }, [])

  useEffect(() => {
    cobeMarkersRef.current = displayMarkers
    cobeArcsRef.current = displayArcs
  }, [displayArcs, displayMarkers])

  // ── legend ─────────────────────────────────────────────────────────────────
  const groupCounts = useMemo(() => {
    const c: Record<string, number> = {}
    for (const n of graph.nodes) c[n.group] = (c[n.group] ?? 0) + 1
    return c
  }, [graph.nodes])

  return (
    <div
      style={{
        position: "relative", width: "100%", height: "100%",
        display: "flex", alignItems: "center", justifyContent: "center",
      }}
    >
      <div
        ref={containerRef}
        style={{ position: "relative", height: "100%", aspectRatio: "1 / 1" }}
      >
        {/* cobe renders sphere + markers + animated arcs in WebGL */}
        <Globe
          className="w-full h-full"
          baseColor={[1, 0.96, 0.9]}
          markerColor={[0.9, 0.45, 0.1]}
          glowColor={[0.97, 0.85, 0.6]}
          dark={0} mapBrightness={0} mapSamples={300}
          diffuse={2.2} speed={0.0028} theta={0.22}
          arcWidth={0.25} arcHeight={0.08}
          markersRef={cobeMarkersRef}
          arcsRef={cobeArcsRef}
          onFrame={handleFrame}
        />

        {/* Invisible hit zones — only for pointer events, not visual */}
        <div style={{ position: "absolute", inset: 0, pointerEvents: "none" }}>
          {sphereNodes.map((node) => {
            const hit = HIT_SIZES[node.group] ?? 16
            return (
              <div
                key={node.id}
                ref={(el) => {
                  if (el) hitZonesRef.current.set(node.id, el)
                  else hitZonesRef.current.delete(node.id)
                }}
                style={{
                  position: "absolute", top: 0, left: 0,
                  width: hit, height: hit,
                  borderRadius: "50%",
                  pointerEvents: "auto",
                  cursor: "pointer",
                  // Uncomment to debug hit zones:
                  // background: "rgba(255,0,0,0.2)",
                }}
                onMouseEnter={(e) => handleEnter(node, e)}
                onMouseLeave={handleLeave}
                onClick={() => onNodeClick?.(node)}
              />
            )
          })}
        </div>

        {/* Tooltip — anchored near the hovered dot */}
        {tooltip && (
          <div
            style={{
              position: "absolute",
              left: tooltip.x,
              ...(tooltip.above
                ? { bottom: `calc(100% - ${tooltip.y}px + 14px)` }
                : { top:    tooltip.y + 14 }),
              transform: "translateX(-50%)",
              zIndex: 20,
              pointerEvents: "none",
              width: 200,
            }}
          >
            {/* Main label */}
            <div
              style={{
                background: "rgba(255,251,245,0.97)",
                border: `1.5px solid ${GROUP_COLORS[tooltip.node.group] ?? "#e87b3a"}55`,
                borderRadius: "10px 10px 0 0",
                padding: "0.5rem 0.8rem 0.4rem",
                boxShadow: `0 2px 0 ${GROUP_COLORS[tooltip.node.group] ?? "#e87b3a"}22`,
                backdropFilter: "blur(8px)",
                display: "flex",
                alignItems: "center",
                gap: "0.5rem",
              }}
            >
              <span
                style={{
                  width: 8, height: 8, borderRadius: "50%", flexShrink: 0,
                  background: GROUP_COLORS[tooltip.node.group] ?? "#e87b3a",
                  boxShadow: `0 0 6px 2px ${GROUP_COLORS[tooltip.node.group] ?? "#e87b3a"}88`,
                }}
              />
              <div style={{ minWidth: 0 }}>
                <div
                  style={{
                    fontSize: "0.78rem", fontWeight: 700, color: "#2e1f0e",
                    letterSpacing: "0.005em",
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                  }}
                >
                  {tooltip.node.label}
                </div>
                <div style={{ fontSize: "0.64rem", color: "#9a8570", letterSpacing: "0.06em", textTransform: "uppercase", marginTop: 1 }}>
                  {tooltip.node.group}
                </div>
              </div>
            </div>

            {/* Connected nodes list */}
            {tooltip.neighbours.length > 0 && (
              <div
                style={{
                  background: "rgba(255,251,245,0.94)",
                  border: `1.5px solid ${GROUP_COLORS[tooltip.node.group] ?? "#e87b3a"}30`,
                  borderTop: "none",
                  borderRadius: "0 0 10px 10px",
                  padding: "0.3rem 0.8rem 0.45rem",
                  backdropFilter: "blur(8px)",
                  boxShadow: "0 6px 20px rgba(80,60,30,0.12)",
                }}
              >
                <div style={{ fontSize: "0.6rem", color: "#b09a80", letterSpacing: "0.07em", textTransform: "uppercase", marginBottom: "0.3rem" }}>
                  connected
                </div>
                {tooltip.neighbours.map((n) => (
                  <div
                    key={n.id}
                    style={{ display: "flex", alignItems: "center", gap: "0.45rem", marginBottom: "0.22rem" }}
                  >
                    <span
                      style={{
                        width: 5, height: 5, borderRadius: "50%", flexShrink: 0,
                        background: GROUP_COLORS[n.group] ?? "#e87b3a",
                      }}
                    />
                    <span
                      style={{
                        fontSize: "0.72rem", color: "#4a3020", fontWeight: 500,
                        overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                        lineHeight: 1.3,
                      }}
                    >
                      {n.label}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* Legend */}
      {showLegend && (
        <div className="graph-legend">
          {Object.entries(groupCounts)
            .sort((a, b) => b[1] - a[1])
            .map(([group, count]) => (
              <div key={group} className="legend-row">
                <span className="legend-dot" style={{ background: GROUP_COLORS[group] ?? "#e87b3a" }} />
                {group}
                <span style={{ opacity: 0.45, marginLeft: "0.25rem", fontSize: "0.75em" }}>{count}</span>
              </div>
            ))}
        </div>
      )}

      {showHint && <div className="graph-hint">drag to rotate · hover to explore · click to open</div>}
    </div>
  )
}

// ─── mount / unmount ──────────────────────────────────────────────────────────

let globeRoot: ReturnType<typeof createRoot> | null = null

export function mountTasteGlobe(
  containerId: string,
  graph: TasteGraph,
  onNodeClick: (node: TasteGraphNode) => void,
): () => void {
  const container = document.getElementById(containerId)
  if (!container) return () => {}
  if (!globeRoot) globeRoot = createRoot(container)
  globeRoot.render(
    <React.StrictMode>
      <TasteGlobe graph={graph} onNodeClick={onNodeClick} />
    </React.StrictMode>,
  )
  return () => { globeRoot?.unmount(); globeRoot = null }
}
