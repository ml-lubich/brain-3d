"use client"

import { useRef, useEffect, useState } from "react"

/* ─────────────────────────────────────────────────────────────────────
 * Brain3D — Interactive 3D brain wireframe with traveling electric orbs
 *
 * Features:
 *  - Pure Canvas 2D, zero 3D-library dependencies
 *  - Click & drag to pull/deform the mesh (spring-back) — extra stretchy
 *  - Rotation continues while dragging
 *  - Orbs travel continuously along edges like neural signals
 *    with a trailing energy path that fades behind them
 *  - Toggle rotation on/off
 *  - Toggle orbs on/off
 * ───────────────────────────────────────────────────────────────────── */

declare global {
    interface Window {
        COMPLETE_BRAIN_VERTICES: number[][]
        COMPLETE_BRAIN_EDGES: number[][]
    }
}

interface Brain3DProps {
    width?: number
    height?: number
    className?: string
}

/* Each orb keeps a history of the last N (edge, t) positions so we can
   draw a fading energy trail behind it. */
interface TrailPoint {
    edgeIdx: number
    t: number
}

interface Orb {
    edgeIdx: number
    t: number
    speed: number       // always positive — direction encoded in `dir`
    dir: 1 | -1         // +1 = 0→1, -1 = 1→0
    hue: number
    size: number
    trail: TrailPoint[] // recent positions, newest first
}

const ORB_COUNT = 90
const TRAIL_LENGTH = 18            // how many trail dots per orb

export function Brain3D({ width = 960, height = 700, className = "" }: Brain3DProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [loaded, setLoaded] = useState(false)
    const [rotating, setRotating] = useState(true)
    const [showOrbs, setShowOrbs] = useState(true)

    const rotatingRef = useRef(true)
    const showOrbsRef = useRef(true)
    rotatingRef.current = rotating
    showOrbsRef.current = showOrbs

    // Load brain data via script tag
    useEffect(() => {
        if (window.COMPLETE_BRAIN_VERTICES) { setLoaded(true); return }
        const script = document.createElement("script")
        script.src = "/brain-data.js"
        script.onload = () => setLoaded(true)
        document.head.appendChild(script)
        return () => { script.remove() }
    }, [])

    // ── Main render loop ─────────────────────────────────────────────
    useEffect(() => {
        if (!loaded || !canvasRef.current) return

        const canvas = canvasRef.current
        const ctx = canvas.getContext("2d")!
        canvas.width = width
        canvas.height = height

        const verts = window.COMPLETE_BRAIN_VERTICES
        const edges = window.COMPLETE_BRAIN_EDGES
        if (!verts || !edges) return

        const numVerts = verts.length
        const numEdges = edges.length

        // ── Build adjacency map (vertex → edge indices) ──────────────
        // This lets orbs find connected edges instantly instead of
        // random-searching, so they never "despawn".
        const adj: number[][] = new Array(numVerts)
        for (let i = 0; i < numVerts; i++) adj[i] = []
        for (let i = 0; i < numEdges; i++) {
            adj[edges[i][0]].push(i)
            adj[edges[i][1]].push(i)
        }

        // ── Bounding box ─────────────────────────────────────────────
        let minX = Infinity, maxX = -Infinity
        let minY = Infinity, maxY = -Infinity
        let minZ = Infinity, maxZ = -Infinity
        for (let i = 0; i < numVerts; i++) {
            const v = verts[i]
            if (v[0] < minX) minX = v[0]; if (v[0] > maxX) maxX = v[0]
            if (v[1] < minY) minY = v[1]; if (v[1] > maxY) maxY = v[1]
            if (v[2] < minZ) minZ = v[2]; if (v[2] > maxZ) maxZ = v[2]
        }
        const cx = (minX + maxX) / 2
        const cy = (minY + maxY) / 2
        const cz = (minZ + maxZ) / 2
        const range = Math.max(maxX - minX, maxY - minY, maxZ - minZ)
        const scale = (Math.min(width, height) * 0.78) / range

        // ── Vertex displacement (for drag interaction) ───────────────
        const dx = new Float32Array(numVerts)
        const dy = new Float32Array(numVerts)

        // ── Projection buffers ───────────────────────────────────────
        const projX = new Float32Array(numVerts)
        const projY = new Float32Array(numVerts)

        // ── Tilt so brain is upright ─────────────────────────────────
        const tilt = Math.PI * 0.45
        const cosT = Math.cos(tilt), sinT = Math.sin(tilt)

        // ── Mouse / touch state ──────────────────────────────────────
        let mouseDown = false
        let mouseX = 0, mouseY = 0
        let prevMouseX = 0, prevMouseY = 0
        // ⬇ STRETCHIER: bigger radius, stronger pull, softer spring
        const dragRadius = 120
        const dragStrength = 2.4
        const springBack = 0.025

        // ── Helper: pick a random connected edge from a vertex ───────
        function nextEdgeFrom(vertIdx: number, avoidEdge: number): { edgeIdx: number; dir: 1 | -1 } {
            const bucket = adj[vertIdx]
            if (!bucket || bucket.length === 0) {
                // orphan vertex — shouldn't happen but be safe
                const e = Math.floor(Math.random() * numEdges)
                return { edgeIdx: e, dir: 1 }
            }
            // pick a random neighbour edge (prefer not the one we came from)
            let pick = bucket[Math.floor(Math.random() * bucket.length)]
            if (bucket.length > 1 && pick === avoidEdge) {
                pick = bucket[Math.floor(Math.random() * bucket.length)]
            }
            const dir: 1 | -1 = edges[pick][0] === vertIdx ? 1 : -1
            return { edgeIdx: pick, dir }
        }

        // ── Create orbs ──────────────────────────────────────────────
        const orbs: Orb[] = []
        for (let i = 0; i < ORB_COUNT; i++) {
            const edgeIdx = Math.floor(Math.random() * numEdges)
            orbs.push({
                edgeIdx,
                t: Math.random(),
                speed: 0.012 + Math.random() * 0.018,
                dir: Math.random() > 0.5 ? 1 : -1,
                hue: 185 + Math.random() * 50,  // cyan-blue
                size: 2 + Math.random() * 2.5,
                trail: [],
            })
        }

        // ── State ────────────────────────────────────────────────────
        let angle = 0
        let animId: number

        function project() {
            const cosA = Math.cos(angle), sinA = Math.sin(angle)
            for (let i = 0; i < numVerts; i++) {
                const x = (verts[i][0] - cx) * scale
                const y = (verts[i][1] - cy) * scale
                const z = (verts[i][2] - cz) * scale
                const ty = y * cosT - z * sinT
                const tz = y * sinT + z * cosT
                const rx = x * cosA - tz * sinA
                projX[i] = rx + width / 2 + dx[i]
                projY[i] = ty + height / 2 + dy[i]
            }
        }

        function drawWireframe() {
            ctx.strokeStyle = "rgba(0, 170, 255, 0.13)"
            ctx.lineWidth = 0.4
            ctx.beginPath()
            for (let j = 0; j < numEdges; j++) {
                const e = edges[j]
                ctx.moveTo(projX[e[0]], projY[e[0]])
                ctx.lineTo(projX[e[1]], projY[e[1]])
            }
            ctx.stroke()
        }

        /* ── Interpolate a (edgeIdx, t) pair to screen coords ──────── */
        function edgePos(edgeIdx: number, t: number): [number, number] {
            const e = edges[edgeIdx]
            const x = projX[e[0]] + (projX[e[1]] - projX[e[0]]) * t
            const y = projY[e[0]] + (projY[e[1]] - projY[e[0]]) * t
            return [x, y]
        }

        /* ── Advance an orb and handle edge transitions ────────────── */
        function advanceOrb(orb: Orb) {
            // Push current position to trail BEFORE moving
            orb.trail.unshift({ edgeIdx: orb.edgeIdx, t: orb.t })
            if (orb.trail.length > TRAIL_LENGTH) orb.trail.length = TRAIL_LENGTH

            // Move
            orb.t += orb.speed * orb.dir

            // Crossed an endpoint → hop to a connected edge
            if (orb.t > 1) {
                const overshoot = orb.t - 1
                const endVert = edges[orb.edgeIdx][1]
                const next = nextEdgeFrom(endVert, orb.edgeIdx)
                orb.edgeIdx = next.edgeIdx
                orb.dir = next.dir
                orb.t = orb.dir === 1 ? overshoot : 1 - overshoot
            } else if (orb.t < 0) {
                const overshoot = -orb.t
                const endVert = edges[orb.edgeIdx][0]
                const next = nextEdgeFrom(endVert, orb.edgeIdx)
                orb.edgeIdx = next.edgeIdx
                orb.dir = next.dir
                orb.t = orb.dir === 1 ? overshoot : 1 - overshoot
            }
            // Clamp (safety)
            orb.t = Math.max(0, Math.min(1, orb.t))
        }

        function drawOrbs() {
            if (!showOrbsRef.current) return

            for (let i = 0; i < orbs.length; i++) {
                const orb = orbs[i]
                advanceOrb(orb)

                const [ox, oy] = edgePos(orb.edgeIdx, orb.t)

                // ── Trailing energy path ──────────────────────────────
                // Draw from oldest to newest so newer segments paint on top
                const trail = orb.trail
                if (trail.length > 1) {
                    for (let k = trail.length - 1; k >= 1; k--) {
                        const age = k / trail.length  // 1 = oldest, ~0 = newest
                        const alpha = (1 - age) * 0.7
                        const lum = 50 + (1 - age) * 35  // brighter near head
                        const [x1, y1] = edgePos(trail[k].edgeIdx, trail[k].t)
                        const [x2, y2] = edgePos(trail[k - 1].edgeIdx, trail[k - 1].t)

                        // Skip if the two trail points are very far apart
                        // (different edges that aren't visually connected)
                        const d2 = (x2 - x1) ** 2 + (y2 - y1) ** 2
                        if (d2 > 2500) continue  // ~50px gap = edge hop

                        ctx.strokeStyle = `hsla(${orb.hue}, 95%, ${lum}%, ${alpha})`
                        ctx.lineWidth = orb.size * (1 - age * 0.65)
                        ctx.beginPath()
                        ctx.moveTo(x1, y1)
                        ctx.lineTo(x2, y2)
                        ctx.stroke()
                    }

                    // Line from newest trail point to current position
                    const [tx, ty] = edgePos(trail[0].edgeIdx, trail[0].t)
                    const d2 = (ox - tx) ** 2 + (oy - ty) ** 2
                    if (d2 < 2500) {
                        ctx.strokeStyle = `hsla(${orb.hue}, 100%, 78%, 0.8)`
                        ctx.lineWidth = orb.size * 0.9
                        ctx.beginPath()
                        ctx.moveTo(tx, ty)
                        ctx.lineTo(ox, oy)
                        ctx.stroke()
                    }
                }

                // ── Outer glow ────────────────────────────────────────
                const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, orb.size * 7)
                grad.addColorStop(0, `hsla(${orb.hue}, 100%, 92%, 0.9)`)
                grad.addColorStop(0.12, `hsla(${orb.hue}, 100%, 70%, 0.55)`)
                grad.addColorStop(0.35, `hsla(${orb.hue}, 90%, 50%, 0.15)`)
                grad.addColorStop(1, `hsla(${orb.hue}, 80%, 40%, 0)`)
                ctx.fillStyle = grad
                ctx.beginPath()
                ctx.arc(ox, oy, orb.size * 7, 0, Math.PI * 2)
                ctx.fill()

                // ── White-hot core ────────────────────────────────────
                ctx.fillStyle = `hsla(${orb.hue}, 60%, 97%, 0.95)`
                ctx.beginPath()
                ctx.arc(ox, oy, orb.size * 0.7, 0, Math.PI * 2)
                ctx.fill()
            }
        }

        function drawDragCircle() {
            if (!mouseDown) return
            ctx.strokeStyle = "rgba(0, 255, 180, 0.35)"
            ctx.lineWidth = 1
            ctx.beginPath()
            ctx.arc(mouseX, mouseY, dragRadius, 0, Math.PI * 2)
            ctx.stroke()
        }

        function applyDrag(mx: number, my: number, pmx: number, pmy: number) {
            const moveX = mx - pmx
            const moveY = my - pmy
            const r2 = dragRadius * dragRadius
            for (let i = 0; i < numVerts; i++) {
                const distX = projX[i] - mx
                const distY = projY[i] - my
                const d2 = distX * distX + distY * distY
                if (d2 < r2) {
                    const influence = (1 - d2 / r2) * dragStrength
                    dx[i] += moveX * influence
                    dy[i] += moveY * influence
                }
            }
        }

        // ── Main loop ────────────────────────────────────────────────
        function draw() {
            ctx.clearRect(0, 0, width, height)
            project()
            drawWireframe()
            drawOrbs()
            drawDragCircle()

            // Spring back (soft)
            for (let i = 0; i < numVerts; i++) {
                dx[i] *= (1 - springBack)
                dy[i] *= (1 - springBack)
            }

            if (rotatingRef.current) angle += 0.005
            animId = requestAnimationFrame(draw)
        }

        // ── Event handlers ───────────────────────────────────────────
        function getPos(e: MouseEvent | TouchEvent) {
            const rect = canvas.getBoundingClientRect()
            const clientX = "touches" in e ? e.touches[0].clientX : e.clientX
            const clientY = "touches" in e ? e.touches[0].clientY : e.clientY
            return [
                (clientX - rect.left) * (width / rect.width),
                (clientY - rect.top) * (height / rect.height),
            ]
        }

        function onDown(e: MouseEvent | TouchEvent) {
            if ("touches" in e) e.preventDefault()
            mouseDown = true
            canvas.style.cursor = "grabbing"
            const p = getPos(e)
            mouseX = prevMouseX = p[0]
            mouseY = prevMouseY = p[1]
        }

        function onMove(e: MouseEvent | TouchEvent) {
            if ("touches" in e) e.preventDefault()
            const p = getPos(e)
            mouseX = p[0]; mouseY = p[1]
            if (mouseDown) {
                applyDrag(mouseX, mouseY, prevMouseX, prevMouseY)
                prevMouseX = mouseX; prevMouseY = mouseY
            }
        }

        function onUp() {
            mouseDown = false
            canvas.style.cursor = "grab"
        }

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
    }, [loaded, width, height])

    return (
        <div className={`relative ${className}`}>
            {/* Controls */}
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

            {/* Canvas */}
            <canvas
                ref={canvasRef}
                className="rounded-xl border border-white/10 bg-[#080810]"
                style={{ width, height }}
            />

            {!loaded && (
                <div className="absolute inset-0 flex items-center justify-center text-white/30 text-sm">
                    Loading brain data…
                </div>
            )}
        </div>
    )
}
