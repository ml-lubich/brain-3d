"use client"

import { useRef, useEffect, useState } from "react"

/* ─────────────────────────────────────────────────────────────────
 * Brain3D — Configurable interactive 3D brain wireframe
 *
 * Every visual/performance knob is exposed as a prop so devs can tune
 * the component for their use-case without touching internals.
 * ───────────────────────────────────────────────────────────────── */

declare global {
    interface Window {
        COMPLETE_BRAIN_VERTICES: number[][]
        COMPLETE_BRAIN_EDGES: number[][]
    }
}

/* ── Public config interface ──────────────────────────────────────── */
export interface Brain3DProps {
    /** Canvas width in CSS pixels. Ignored when `responsive` is true. */
    width?: number
    /** Canvas height in CSS pixels. Ignored when `responsive` is true. */
    height?: number
    /** When true the canvas fills its parent and auto-resizes. */
    responsive?: boolean
    /** Extra CSS class on the wrapper div. */
    className?: string

    // Performance
    /** Render every Nth edge (1 = all, 2 = half, 4 = quarter).
     *  Higher values = cheaper rendering on low-end devices. */
    edgeStride?: number
    /** Path to the brain-data.js file served from public/. */
    dataPath?: string

    // Orbs
    /** Number of traveling orbs. 0 = none. */
    orbCount?: number
    /** How many trail segments each orb leaves behind. */
    orbTrailLength?: number
    /** Base orb travel speed (0-1 range per frame). */
    orbSpeed?: number
    /** Minimum hue for orbs (HSL). */
    orbHueMin?: number
    /** Maximum hue for orbs (HSL). */
    orbHueMax?: number
    /** Base orb radius in px. */
    orbSize?: number
    /** Start with orbs visible? */
    orbsOn?: boolean

    // Rotation
    /** Start with rotation enabled? */
    rotationOn?: boolean
    /** Rotation speed in radians per frame. */
    rotationSpeed?: number

    // Drag / pull
    /** How many hops of neighbours to grab when pulling. */
    grabDepth?: number
    /** Spring-back factor (0 = never returns, 1 = instant snap). */
    springBack?: number

    // Wireframe look
    /** Wireframe colour (any CSS colour string). */
    wireColor?: string
    /** Wireframe line width. */
    wireWidth?: number
    /** Background colour. */
    bgColor?: string

    // Controls
    /** Show the toggle buttons. */
    showControls?: boolean
}

/* Internal types */
interface TrailPoint { edgeIdx: number; t: number }
interface Orb {
    edgeIdx: number; t: number; speed: number; dir: 1 | -1
    hue: number; size: number; trail: TrailPoint[]
}

/* Defaults */
const DEFAULTS = {
    width: 960, height: 700, responsive: false,
    edgeStride: 1, dataPath: "/brain-data.js",
    orbCount: 90, orbTrailLength: 40, orbSpeed: 0.015,
    orbHueMin: 185, orbHueMax: 235, orbSize: 3, orbsOn: true,
    rotationOn: true, rotationSpeed: 0.005,
    grabDepth: 4, springBack: 0.012,
    wireColor: "rgba(0,170,255,0.13)", wireWidth: 0.4,
    bgColor: "#080810", showControls: true,
} as const

export function Brain3D(props: Brain3DProps) {
    const cfg = { ...DEFAULTS, ...props }

    const wrapperRef = useRef<HTMLDivElement>(null)
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [loaded, setLoaded] = useState(false)
    const [rotating, setRotating] = useState(cfg.rotationOn)
    const [showOrbs, setShowOrbs] = useState(cfg.orbsOn)

    // Sync toggles to animation via refs (no re-render)
    const rotatingRef = useRef(cfg.rotationOn)
    const showOrbsRef = useRef(cfg.orbsOn)
    rotatingRef.current = rotating
    showOrbsRef.current = showOrbs

    // Responsive size tracking
    const [size, setSize] = useState({ w: cfg.width, h: cfg.height })

    useEffect(() => {
        if (!cfg.responsive || !wrapperRef.current) return
        const ro = new ResizeObserver(([entry]) => {
            const { width: w, height: h } = entry.contentRect
            if (w > 0 && h > 0) setSize({ w: Math.round(w), h: Math.round(h) })
        })
        ro.observe(wrapperRef.current)
        return () => ro.disconnect()
    }, [cfg.responsive])

    const W = cfg.responsive ? size.w : cfg.width
    const H = cfg.responsive ? size.h : cfg.height

    // Load brain data
    useEffect(() => {
        if (window.COMPLETE_BRAIN_VERTICES) { setLoaded(true); return }
        const script = document.createElement("script")
        script.src = cfg.dataPath
        script.onload = () => setLoaded(true)
        document.head.appendChild(script)
        return () => { script.remove() }
    }, [cfg.dataPath])

    // Main render loop
    useEffect(() => {
        if (!loaded || !canvasRef.current) return

        const canvas = canvasRef.current
        const ctx = canvas.getContext("2d")!
        canvas.width = W
        canvas.height = H

        const allVerts = window.COMPLETE_BRAIN_VERTICES
        const allEdges = window.COMPLETE_BRAIN_EDGES
        if (!allVerts || !allEdges) return

        // Apply edgeStride for performance
        const stride = Math.max(1, Math.round(cfg.edgeStride))
        const edges: number[][] = stride === 1
            ? allEdges
            : allEdges.filter((_: number[], i: number) => i % stride === 0)

        const verts = allVerts
        const numVerts = verts.length
        const numEdges = edges.length

        // Build adjacency (vertex -> edge indices in drawn edges)
        const adj: number[][] = new Array(numVerts)
        for (let i = 0; i < numVerts; i++) adj[i] = []
        for (let i = 0; i < numEdges; i++) {
            adj[edges[i][0]].push(i)
            adj[edges[i][1]].push(i)
        }

        // Vertex adjacency (vertex -> neighbour vertex indices)
        // Built from ALL edges so pulling always finds neighbours
        // even when edgeStride > 1.
        const vertAdj: Set<number>[] = new Array(numVerts)
        for (let i = 0; i < numVerts; i++) vertAdj[i] = new Set()
        for (let i = 0; i < allEdges.length; i++) {
            vertAdj[allEdges[i][0]].add(allEdges[i][1])
            vertAdj[allEdges[i][1]].add(allEdges[i][0])
        }

        // Bounding box
        let minX = Infinity, maxX = -Infinity
        let minY = Infinity, maxY = -Infinity
        let minZ = Infinity, maxZ = -Infinity
        for (let i = 0; i < numVerts; i++) {
            const v = verts[i]
            if (v[0] < minX) minX = v[0]; if (v[0] > maxX) maxX = v[0]
            if (v[1] < minY) minY = v[1]; if (v[1] > maxY) maxY = v[1]
            if (v[2] < minZ) minZ = v[2]; if (v[2] > maxZ) maxZ = v[2]
        }
        const bboxCX = (minX + maxX) / 2, bboxCY = (minY + maxY) / 2, bboxCZ = (minZ + maxZ) / 2
        const range = Math.max(maxX - minX, maxY - minY, maxZ - minZ)
        const sc = (Math.min(W, H) * 0.78) / range

        // Buffers
        const dxArr = new Float32Array(numVerts)
        const dyArr = new Float32Array(numVerts)
        const projX = new Float32Array(numVerts)
        const projY = new Float32Array(numVerts)

        const tilt = Math.PI * 0.45
        const cosT = Math.cos(tilt), sinT = Math.sin(tilt)

        // Mouse / touch state
        let mouseDown = false
        let shiftHeld = false
        let mouseX = 0, mouseY = 0, prevMouseX = 0, prevMouseY = 0
        let grabbedVerts: { idx: number; weight: number }[] = []

        // Orb helpers
        function nextEdgeFrom(vertIdx: number, avoidEdge: number) {
            const bucket = adj[vertIdx]
            if (!bucket || bucket.length === 0) return { edgeIdx: Math.floor(Math.random() * numEdges), dir: 1 as const }
            let pick = bucket[Math.floor(Math.random() * bucket.length)]
            if (bucket.length > 1 && pick === avoidEdge) pick = bucket[Math.floor(Math.random() * bucket.length)]
            return { edgeIdx: pick, dir: (edges[pick][0] === vertIdx ? 1 : -1) as 1 | -1 }
        }

        // Create orbs
        const orbs: Orb[] = []
        for (let i = 0; i < cfg.orbCount; i++) {
            orbs.push({
                edgeIdx: Math.floor(Math.random() * numEdges),
                t: Math.random(),
                speed: cfg.orbSpeed * (0.6 + Math.random() * 0.8),
                dir: Math.random() > 0.5 ? 1 : -1,
                hue: cfg.orbHueMin + Math.random() * (cfg.orbHueMax - cfg.orbHueMin),
                size: cfg.orbSize * (0.8 + Math.random() * 0.5),
                trail: [],
            })
        }

        let angle = 0
        let animId: number

        // Projection
        function project() {
            const cosA = Math.cos(angle), sinA = Math.sin(angle)
            for (let i = 0; i < numVerts; i++) {
                const x = (verts[i][0] - bboxCX) * sc
                const y = (verts[i][1] - bboxCY) * sc
                const z = (verts[i][2] - bboxCZ) * sc
                const ty = y * cosT - z * sinT
                const tz = y * sinT + z * cosT
                projX[i] = (x * cosA - tz * sinA) + W / 2 + dxArr[i]
                projY[i] = ty + H / 2 + dyArr[i]
            }
        }

        // Draw wireframe
        function drawWireframe() {
            ctx.strokeStyle = cfg.wireColor
            ctx.lineWidth = cfg.wireWidth
            ctx.beginPath()
            for (let j = 0; j < numEdges; j++) {
                const e = edges[j]
                ctx.moveTo(projX[e[0]], projY[e[0]])
                ctx.lineTo(projX[e[1]], projY[e[1]])
            }
            ctx.stroke()
        }

        // Edge interpolation
        function edgePos(ei: number, t: number): [number, number] {
            const e = edges[ei]
            return [
                projX[e[0]] + (projX[e[1]] - projX[e[0]]) * t,
                projY[e[0]] + (projY[e[1]] - projY[e[0]]) * t,
            ]
        }

        // Advance orb along edges
        function advanceOrb(orb: Orb) {
            orb.trail.unshift({ edgeIdx: orb.edgeIdx, t: orb.t })
            if (orb.trail.length > cfg.orbTrailLength) orb.trail.length = cfg.orbTrailLength
            orb.t += orb.speed * orb.dir
            if (orb.t > 1) {
                const ov = orb.t - 1, n = nextEdgeFrom(edges[orb.edgeIdx][1], orb.edgeIdx)
                orb.edgeIdx = n.edgeIdx; orb.dir = n.dir; orb.t = orb.dir === 1 ? ov : 1 - ov
            } else if (orb.t < 0) {
                const ov = -orb.t, n = nextEdgeFrom(edges[orb.edgeIdx][0], orb.edgeIdx)
                orb.edgeIdx = n.edgeIdx; orb.dir = n.dir; orb.t = orb.dir === 1 ? ov : 1 - ov
            }
            orb.t = Math.max(0, Math.min(1, orb.t))
        }

        // Build trail screen-coords for one orb (head position prepended)
        function buildTrailPts(orb: Orb, ox: number, oy: number) {
            const pts: [number, number][] = [[ox, oy]]
            for (let k = 0; k < orb.trail.length; k++) {
                const [px, py] = edgePos(orb.trail[k].edgeIdx, orb.trail[k].t)
                // skip if huge jump (edge wrap)
                const prev = pts[pts.length - 1]
                if ((px - prev[0]) ** 2 + (py - prev[1]) ** 2 > 2500) break
                pts.push([px, py])
            }
            return pts
        }

        // Draw a continuous energy trail path
        function drawTrailPath(pts: [number, number][], hue: number, baseW: number) {
            if (pts.length < 2) return
            const len = pts.length

            // Outer glow pass — wide, very transparent
            ctx.lineCap = "round"; ctx.lineJoin = "round"
            for (let k = 0; k < len - 1; k++) {
                const frac = k / len  // 0 at head, 1 at tail
                const alpha = (1 - frac) * 0.25
                const w = baseW * 6 * (1 - frac * 0.7)
                ctx.strokeStyle = `hsla(${hue},100%,60%,${alpha})`
                ctx.lineWidth = w
                ctx.beginPath(); ctx.moveTo(pts[k][0], pts[k][1]); ctx.lineTo(pts[k + 1][0], pts[k + 1][1]); ctx.stroke()
            }

            // Inner bright trail — narrower, higher opacity
            for (let k = 0; k < len - 1; k++) {
                const frac = k / len
                const alpha = (1 - frac) * 0.85
                const lum = 55 + (1 - frac) * 35
                const w = baseW * (1.8 - frac * 1.2)
                ctx.strokeStyle = `hsla(${hue},95%,${lum}%,${alpha})`
                ctx.lineWidth = w
                ctx.beginPath(); ctx.moveTo(pts[k][0], pts[k][1]); ctx.lineTo(pts[k + 1][0], pts[k + 1][1]); ctx.stroke()
            }
        }

        // Draw orbs + energy trails
        function drawOrbs() {
            if (!showOrbsRef.current) return
            for (const orb of orbs) {
                advanceOrb(orb)
                const [ox, oy] = edgePos(orb.edgeIdx, orb.t)

                // Energy trail
                const pts = buildTrailPts(orb, ox, oy)
                drawTrailPath(pts, orb.hue, orb.size)

                // Head glow
                const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, orb.size * 8)
                g.addColorStop(0, `hsla(${orb.hue},100%,95%,0.95)`)
                g.addColorStop(0.08, `hsla(${orb.hue},100%,80%,0.7)`)
                g.addColorStop(0.25, `hsla(${orb.hue},100%,60%,0.25)`)
                g.addColorStop(0.5, `hsla(${orb.hue},90%,50%,0.08)`)
                g.addColorStop(1, `hsla(${orb.hue},80%,40%,0)`)
                ctx.fillStyle = g; ctx.beginPath(); ctx.arc(ox, oy, orb.size * 8, 0, Math.PI * 2); ctx.fill()

                // Bright core
                ctx.fillStyle = `hsla(${orb.hue},60%,97%,0.95)`
                ctx.beginPath(); ctx.arc(ox, oy, orb.size * 0.8, 0, Math.PI * 2); ctx.fill()
            }
        }

        // Thread-pull: find nearest vertex
        function closestVertex(sx: number, sy: number): number {
            let best = -1, bestD2 = Infinity
            for (let i = 0; i < numVerts; i++) {
                const d2 = (projX[i] - sx) ** 2 + (projY[i] - sy) ** 2
                if (d2 < bestD2) { bestD2 = d2; best = i }
            }
            return best
        }

        // Thread-pull: BFS collect with weight falloff
        function collectThreadVerts(center: number) {
            const depth = cfg.grabDepth
            const visited = new Map<number, number>()
            const queue: [number, number][] = [[center, 0]]
            visited.set(center, 0)
            while (queue.length > 0) {
                const [vi, d] = queue.shift()!
                if (d >= depth) continue
                for (const nb of vertAdj[vi]) {
                    if (!visited.has(nb)) { visited.set(nb, d + 1); queue.push([nb, d + 1]) }
                }
            }
            const result: { idx: number; weight: number }[] = []
            visited.forEach((hop, idx) => {
                result.push({ idx, weight: 1 / (1 + hop * 0.6) })
            })
            return result
        }

        function applyThreadDrag(mx: number, my: number) {
            for (const gv of grabbedVerts) {
                dxArr[gv.idx] += mx * gv.weight
                dyArr[gv.idx] += my * gv.weight
            }
        }

        // Main loop
        function draw() {
            ctx.clearRect(0, 0, W, H)
            project()
            drawWireframe()
            drawOrbs()

            for (let i = 0; i < numVerts; i++) {
                dxArr[i] *= (1 - cfg.springBack)
                dyArr[i] *= (1 - cfg.springBack)
            }

            if (rotatingRef.current) angle += cfg.rotationSpeed
            animId = requestAnimationFrame(draw)
        }

        // Events
        function getPos(e: MouseEvent | TouchEvent) {
            const r = canvas.getBoundingClientRect()
            const pcx = "touches" in e ? e.touches[0].clientX : e.clientX
            const pcy = "touches" in e ? e.touches[0].clientY : e.clientY
            return [(pcx - r.left) * (W / r.width), (pcy - r.top) * (H / r.height)]
        }

        function onDown(e: MouseEvent | TouchEvent) {
            if ("touches" in e) e.preventDefault()
            mouseDown = true; canvas.style.cursor = "grabbing"
            shiftHeld = !("touches" in e) && (e as MouseEvent).shiftKey
            const p = getPos(e); mouseX = prevMouseX = p[0]; mouseY = prevMouseY = p[1]
            if (shiftHeld) {
                // Shift+drag = pull mesh
                const nearest = closestVertex(mouseX, mouseY)
                if (nearest >= 0) grabbedVerts = collectThreadVerts(nearest)
            }
        }
        function onMove(e: MouseEvent | TouchEvent) {
            if ("touches" in e) e.preventDefault()
            const p = getPos(e); mouseX = p[0]; mouseY = p[1]
            const deltaX = mouseX - prevMouseX
            const deltaY = mouseY - prevMouseY
            if (mouseDown) {
                if (shiftHeld && grabbedVerts.length > 0) {
                    // Pull mesh
                    applyThreadDrag(deltaX, deltaY)
                } else {
                    // Rotate brain
                    angle += deltaX * 0.005
                }
            }
            prevMouseX = mouseX; prevMouseY = mouseY
        }
        function onUp() { mouseDown = false; shiftHeld = false; grabbedVerts = []; canvas.style.cursor = "grab" }

        canvas.addEventListener("mousedown", onDown)
        canvas.addEventListener("mousemove", onMove)
        canvas.addEventListener("mouseup", onUp)
        canvas.addEventListener("mouseleave", onUp)
        canvas.addEventListener("touchstart", onDown, { passive: false })
        canvas.addEventListener("touchmove", onMove, { passive: false })
        canvas.addEventListener("touchend", onUp)
        canvas.style.cursor = "grab"
        draw()

        return () => {
            cancelAnimationFrame(animId)
            canvas.removeEventListener("mousedown", onDown)
            canvas.removeEventListener("mousemove", onMove)
            canvas.removeEventListener("mouseup", onUp)
            canvas.removeEventListener("mouseleave", onUp)
            canvas.removeEventListener("touchstart", onDown)
            canvas.removeEventListener("touchmove", onMove)
            canvas.removeEventListener("touchend", onUp)
        }
    }, [loaded, W, H, cfg.edgeStride, cfg.orbCount, cfg.orbTrailLength,
        cfg.orbSpeed, cfg.orbHueMin, cfg.orbHueMax, cfg.orbSize,
        cfg.grabDepth, cfg.springBack, cfg.wireColor, cfg.wireWidth,
        cfg.rotationSpeed, cfg.dataPath])

    return (
        <div
            ref={wrapperRef}
            className={`relative ${cfg.responsive ? "w-full h-full" : ""} ${cfg.className ?? ""}`}
        >
            {cfg.showControls && (
                <div className="absolute top-3 right-3 z-10 flex gap-2">
                    <button
                        onClick={() => setRotating(r => !r)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium backdrop-blur-sm border transition-all ${rotating
                            ? "bg-blue-500/20 border-blue-400/40 text-blue-300 hover:bg-blue-500/30"
                            : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"
                            }`}
                    >
                        {rotating ? "⟳ Rotation" : "⏸ Rotation"}
                    </button>
                    <button
                        onClick={() => setShowOrbs(o => !o)}
                        className={`px-3 py-1.5 rounded-lg text-xs font-medium backdrop-blur-sm border transition-all ${showOrbs
                            ? "bg-cyan-500/20 border-cyan-400/40 text-cyan-300 hover:bg-cyan-500/30"
                            : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10"
                            }`}
                    >
                        {showOrbs ? "⚡ Orbs" : "○ Orbs"}
                    </button>
                </div>
            )}

            <canvas
                ref={canvasRef}
                className="rounded-xl border border-white/10"
                style={{
                    width: cfg.responsive ? "100%" : W,
                    height: cfg.responsive ? "100%" : H,
                    background: cfg.bgColor,
                }}
            />

            {!loaded && (
                <div className="absolute inset-0 flex items-center justify-center text-white/30 text-sm">
                    Loading brain data…
                </div>
            )}
        </div>
    )
}
