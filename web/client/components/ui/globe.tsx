import { useEffect, useRef, useCallback } from "react"
import createGlobe, { type Marker, type Arc } from "cobe"

export interface GlobeProps {
  className?: string
  baseColor?:   [number, number, number]
  markerColor?: [number, number, number]
  glowColor?:   [number, number, number]
  dark?:        number
  diffuse?:     number
  mapSamples?:  number
  mapBrightness?: number
  speed?:       number
  theta?:       number
  arcWidth?:    number
  arcHeight?:   number
  /** Live refs — Globe reads these every animation frame, no recreation needed. */
  markersRef?:  React.MutableRefObject<Marker[]>
  arcsRef?:     React.MutableRefObject<Arc[]>
  /** Called each frame with current phi + theta for hit-zone sync. */
  onFrame?: (phi: number, theta: number) => void
}

export function Globe({
  className = "",
  baseColor    = [1, 0.96, 0.9],
  markerColor  = [0.9, 0.45, 0.1],
  glowColor    = [0.97, 0.85, 0.6],
  dark         = 0,
  diffuse      = 2.2,
  mapSamples   = 300,
  mapBrightness = 0,
  speed        = 0.0028,
  theta        = 0.22,
  arcWidth     = 0.25,
  arcHeight    = 0.08,
  markersRef,
  arcsRef,
  onFrame,
}: GlobeProps) {
  const canvasRef             = useRef<HTMLCanvasElement>(null)
  const pointerInteracting    = useRef<{ x: number; y: number } | null>(null)
  const lastPointer           = useRef<{ x: number; y: number; t: number } | null>(null)
  const dragOffset            = useRef({ phi: 0, theta: 0 })
  const velocity              = useRef({ phi: 0, theta: 0 })
  const phiOffsetRef          = useRef(0)
  const thetaOffsetRef        = useRef(0)
  const isPausedRef           = useRef(false)

  const handlePointerDown = useCallback((e: React.PointerEvent) => {
    pointerInteracting.current = { x: e.clientX, y: e.clientY }
    if (canvasRef.current) canvasRef.current.style.cursor = "grabbing"
    isPausedRef.current = true
  }, [])

  const handlePointerMove = useCallback((e: PointerEvent) => {
    if (!pointerInteracting.current) return
    const dx = e.clientX - pointerInteracting.current.x
    const dy = e.clientY - pointerInteracting.current.y
    dragOffset.current = { phi: dx / 300, theta: dy / 1000 }
    const now = Date.now()
    if (lastPointer.current) {
      const dt = Math.max(now - lastPointer.current.t, 1)
      const cap = 0.15
      velocity.current = {
        phi:   Math.max(-cap, Math.min(cap, ((e.clientX - lastPointer.current.x) / dt) * 0.3)),
        theta: Math.max(-cap, Math.min(cap, ((e.clientY - lastPointer.current.y) / dt) * 0.08)),
      }
    }
    lastPointer.current = { x: e.clientX, y: e.clientY, t: now }
  }, [])

  const handlePointerUp = useCallback(() => {
    if (pointerInteracting.current) {
      phiOffsetRef.current  += dragOffset.current.phi
      thetaOffsetRef.current += dragOffset.current.theta
      dragOffset.current = { phi: 0, theta: 0 }
      lastPointer.current = null
    }
    pointerInteracting.current = null
    if (canvasRef.current) canvasRef.current.style.cursor = "grab"
    isPausedRef.current = false
  }, [])

  useEffect(() => {
    window.addEventListener("pointermove", handlePointerMove, { passive: true })
    window.addEventListener("pointerup", handlePointerUp, { passive: true })
    return () => {
      window.removeEventListener("pointermove", handlePointerMove)
      window.removeEventListener("pointerup", handlePointerUp)
    }
  }, [handlePointerMove, handlePointerUp])

  const onFrameRef = useRef(onFrame)
  useEffect(() => { onFrameRef.current = onFrame }, [onFrame])

  useEffect(() => {
    if (!canvasRef.current) return
    const canvas = canvasRef.current
    let globe: ReturnType<typeof createGlobe> | null = null
    let animId: number
    let phi = 0

    function init() {
      const width = canvas.offsetWidth
      if (width === 0 || globe) return
      const dpr = Math.min(window.devicePixelRatio || 1, 2)

      globe = createGlobe(canvas, {
        devicePixelRatio: dpr,
        width, height: width,
        phi: 0, theta,
        dark, diffuse,
        mapSamples, mapBrightness,
        baseColor, markerColor, glowColor,
        markers: markersRef?.current ?? [],
        arcs:    arcsRef?.current ?? [],
        arcWidth, arcHeight,
        opacity: 0.85,
      })

      function animate() {
        if (!isPausedRef.current) {
          phi += speed
          if (Math.abs(velocity.current.phi) > 0.0001 || Math.abs(velocity.current.theta) > 0.0001) {
            phiOffsetRef.current   += velocity.current.phi
            thetaOffsetRef.current += velocity.current.theta
            velocity.current.phi   *= 0.95
            velocity.current.theta *= 0.95
          }
          const tMin = -0.4, tMax = 0.4
          if (thetaOffsetRef.current < tMin) thetaOffsetRef.current += (tMin - thetaOffsetRef.current) * 0.1
          else if (thetaOffsetRef.current > tMax) thetaOffsetRef.current += (tMax - thetaOffsetRef.current) * 0.1
        }
        const cPhi   = phi + phiOffsetRef.current  + dragOffset.current.phi
        const cTheta = theta + thetaOffsetRef.current + dragOffset.current.theta
        globe!.update({
          phi: cPhi, theta: cTheta,
          dark, mapBrightness,
          baseColor, markerColor, glowColor,
          markers: markersRef?.current ?? [],
          arcs:    arcsRef?.current    ?? [],
          arcWidth, arcHeight,
        })
        onFrameRef.current?.(cPhi, cTheta)
        animId = requestAnimationFrame(animate)
      }
      animate()
      setTimeout(() => { if (canvas) canvas.style.opacity = "1" })
    }

    if (canvas.offsetWidth > 0) {
      init()
    } else {
      const ro = new ResizeObserver((entries) => {
        if (entries[0]?.contentRect.width > 0) { ro.disconnect(); init() }
      })
      ro.observe(canvas)
      return () => ro.disconnect()
    }
    return () => { if (animId) cancelAnimationFrame(animId); if (globe) globe.destroy() }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <div className={`relative aspect-square select-none ${className}`}>
      <canvas
        ref={canvasRef}
        onPointerDown={handlePointerDown}
        style={{
          width: "100%", height: "100%",
          cursor: "grab", opacity: 0,
          transition: "opacity 1.2s ease",
          borderRadius: "50%", touchAction: "none",
        }}
      />
    </div>
  )
}
