"use client"

import { useRef, useEffect, useState } from "react"

/* -----------------------------------------------------------------------
 * Brain3D  --  Interactive 3D brain wireframe with neural-signal simulation
 *
 * Features:
 *   - Full 3D trackball rotation (drag any direction)
 *   - Glowing wireframe edges (additive bloom pass)
 *   - Neural signals that travel long distances, then fade & respawn
 *   - Every visual / performance knob exposed as a prop
 * ----------------------------------------------------------------------- */

declare global {
    interface Window {
        COMPLETE_BRAIN_VERTICES: number[][]
        COMPLETE_BRAIN_EDGES: number[][]
    }
}

/* == Public config interface ============================================ */
export interface Brain3DProps {
    /** Canvas width (px). Ignored when responsive = true. */
    width?: number
    /** Canvas height (px). Ignored when responsive = true. */
    height?: number
    /** Fill parent container and auto-resize. */
    responsive?: boolean
    /** Extra CSS class on the wrapper div. */
    className?: string

    /* -- Performance ---------------------------------------------------- */
    /** Render every Nth edge (1 = all, 2 = half, 4 = quarter). */
    edgeStride?: number
    /** Path to the brain-data.js served from public/. */
    dataPath?: string

    /* -- Neural signals / orbs ----------------------------------------- */
    /** Number of travelling neural signals. */
    orbCount?: number
    /** Trail segments behind each signal. */
    orbTrailLength?: number
    /** Base signal travel speed (0-1 range per frame). */
    orbSpeed?: number
    /** Min hue for signals (HSL). */
    orbHueMin?: number
    /** Max hue for signals (HSL). */
    orbHueMax?: number
    /** Base signal radius (px). */
    orbSize?: number
    /** Start with signals visible? */
    orbsOn?: boolean
    /** Edge-hops a signal survives before fading out & respawning. */
    signalLifespan?: number

    /* -- Rotation ------------------------------------------------------- */
    /** Start with auto-rotation enabled? */
    rotationOn?: boolean
    /** Auto-rotation speed (radians / frame). */
    rotationSpeed?: number
    /** Initial viewing tilt around the X axis (radians). */
    initialTiltX?: number

    /* -- Drag / thread-pull --------------------------------------------- */
    /** BFS depth when pulling vertices (shift+drag). */
    grabDepth?: number
    /** Spring-back factor (0 = never returns, 1 = instant). */
    springBack?: number

    /* -- Wireframe look ------------------------------------------------- */
    /** Core wireframe stroke colour. */
    wireColor?: string
    /** Core wireframe line width (px). */
    wireWidth?: number
    /** Outer-glow intensity multiplier (0 = off). */
    glowIntensity?: number
    /** Outer-glow colour (use low-alpha colour). */
    glowColor?: string
    /** Canvas background colour. */
    bgColor?: string

    /* -- Controls ------------------------------------------------------- */
    /** Show toggle buttons in the corner? */
    showControls?: boolean
}

/* Internal helpers */
interface TrailPoint { edgeIdx: number; t: number }
interface Orb {
    edgeIdx: number; t: number; speed: number; dir: 1 | -1
    hue: number; size: number; trail: TrailPoint[]
    hopsLeft: number; maxHops: number
}

/* Sensible defaults */
const DEFAULTS = {
    width: 960, height: 700, responsive: false,
    edgeStride: 1, dataPath: "/brain-data.js",
    orbCount: 90, orbTrailLength: 60, orbSpeed: 0.02,
    orbHueMin: 185, orbHueMax: 235, orbSize: 3,
    orbsOn: true, signalLifespan: 80,
    rotationOn: true, rotationSpeed: 0.003,
    initialTiltX: Math.PI * 0.45,
    grabDepth: 4, springBack: 0.012,
    wireColor: "rgba(0,170,255,0.18)", wireWidth: 0.5,
    glowIntensity: 1.0, glowColor: "rgba(0,140,255,0.06)",
    bgColor: "#080810", showControls: true,
}

/* ======================================================================= */
export function Brain3D(props: Brain3DProps) {
    const cfg = { ...DEFAULTS, ...props }

    const wrapperRef = useRef<HTMLDivElement>(null)
    const canvasRef  = useRef<HTMLCanvasElement>(null)
    const [loaded, setLoaded]     = useState(false)
    const [rotating, setRotating] = useState(cfg.rotationOn)
    const [showOrbs, setShowOrbs] = useState(cfg.orbsOn)

    /* refs so the animation loop reads the latest toggle values */
    const rotatingRef = useRef(cfg.rotationOn)
    const showOrbsRef = useRef(cfg.orbsOn)
    rotatingRef.current = rotating
    showOrbsRef.current = showOrbs

    /* responsive size tracking */
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

    /* load brain data */
    useEffect(() => {
        if (window.COMPLETE_BRAIN_VERTICES) { setLoaded(true); return }
        const script = document.createElement("script")
        script.src = cfg.dataPath
        script.onload = () => setLoaded(true)
        document.head.appendChild(script)
        return () => { script.remove() }
    }, [cfg.dataPath])

    /* ==================================================================
     * MAIN RENDER LOOP
     * ================================================================== */
    useEffect(() => {
        if (!loaded || !canvasRef.current) return

        const canvas = canvasRef.current
        const ctx = canvas.getContext("2d")!
        canvas.width  = W
        canvas.height = H

        const allVerts = window.COMPLETE_BRAIN_VERTICES
        const allEdges = window.COMPLETE_BRAIN_EDGES
        if (!allVerts || !allEdges) return

        /* edge decimation */
        const stride = Math.max(1, Math.round(cfg.edgeStride))
        const edges: number[][] = stride === 1
            ? allEdges
            : allEdges.filter((_: number[], i: number) => i % stride === 0)

        const verts    = allVerts
        const numVerts = verts.length
        const numEdges = edges.length

        /* adjacency: vertex -> drawn-edge indices */
        const adj: number[][] = new Array(numVerts)
        for (let i = 0; i < numVerts; i++) adj[i] = []
        for (let i = 0; i < numEdges; i++) {
            adj[edges[i][0]].push(i)
            adj[edges[i][1]].push(i)
        }

        /* vertex adjacency from ALL edges (for thread-pull) */
        const vertAdj: Set<number>[] = new Array(numVerts)
        for (let i = 0; i < numVerts; i++) vertAdj[i] = new Set()
        for (let i = 0; i < allEdges.length; i++) {
            vertAdj[allEdges[i][0]].add(allEdges[i][1])
            vertAdj[allEdges[i][1]].add(allEdges[i][0])
        }

        /* bounding box */
        let minX = Infinity, maxX = -Infinity
        let minY = Infinity, maxY = -Infinity
        let minZ = Infinity, maxZ = -Infinity
        for (let i = 0; i < numVerts; i++) {
            const v = verts[i]
            if (v[0] < minX) minX = v[0]; if (v[0] > maxX) maxX = v[0]
            if (v[1] < minY) minY = v[1]; if (v[1] > maxY) maxY = v[1]
            if (v[2] < minZ) minZ = v[2]; if (v[2] > maxZ) maxZ = v[2]
        }
        const bboxCX = (minX + maxX) / 2
        const bboxCY = (minY + maxY) / 2
        const bboxCZ = (minZ + maxZ) / 2
        const range  = Math.max(maxX - minX, maxY - minY, maxZ - minZ)
        const sc     = (Math.min(W, H) * 0.78) / range

        /* per-vertex displacement buffers (for thread-pull spring) */
        const dxArr = new Float32Array(numVerts)
        const dyArr = new Float32Array(numVerts)
        const projX = new Float32Array(numVerts)
        const projY = new Float32Array(numVerts)

        /* ---- 3-D rotation state (trackball) ---- */
        let angleX = cfg.initialTiltX   // pitch  (vertical tilt)
        let angleY = 0                   // yaw    (horizontal spin)

        /* ---- mouse / touch ---- */
        let mouseDown = false
        let shiftHeld = false
        let mouseX = 0, mouseY = 0, prevMouseX = 0, prevMouseY = 0
        let grabbedVerts: { idx: number; weight: number }[] = []

        /* ==============================================================
         * ORB / SIGNAL HELPERS
         * ============================================================== */
        function nextEdgeFrom(vertIdx: number, avoidEdge: number) {
            const bucket = adj[vertIdx]
            if (!bucket || bucket.length === 0)
                return { edgeIdx: Math.floor(Math.random() * numEdges), dir: 1 as const }
            let pick = bucket[Math.floor(Math.random() * bucket.length)]
            if (bucket.length > 1 && pick === avoidEdge)
                pick = bucket[Math.floor(Math.random() * bucket.length)]
            return {
                edgeIdx: pick,
                dir: (edges[pick][0] === vertIdx ? 1 : -1) as 1 | -1,
            }
        }

        function makeOrb(): Orb {
            const life = Math.round(cfg.signalLifespan * (0.5 + Math.random()))
            return {
                edgeIdx: Math.floor(Math.random() * numEdges),
                t: Math.random(),
                speed: cfg.orbSpeed * (0.6 + Math.random() * 0.8),
                dir: Math.random() > 0.5 ? 1 : -1,
                hue: cfg.orbHueMin + Math.random() * (cfg.orbHueMax - cfg.orbHueMin),
                size: cfg.orbSize * (0.8 + Math.random() * 0.5),
                trail: [],
                hopsLeft: life,
                maxHops: life,
            }
        }

        function respawnOrb(orb: Orb) {
            const life = Math.round(cfg.signalLifespan * (0.5 + Math.random()))
            orb.edgeIdx  = Math.floor(Math.random() * numEdges)
            orb.t        = Math.random()
            orb.speed    = cfg.orbSpeed * (0.6 + Math.random() * 0.8)
            orb.dir      = Math.random() > 0.5 ? 1 : -1
            orb.hue      = cfg.orbHueMin + Math.random() * (cfg.orbHueMax - cfg.orbHueMin)
            orb.size     = cfg.orbSize * (0.8 + Math.random() * 0.5)
            orb.trail    = []
            orb.hopsLeft = life
            orb.maxHops  = life
        }

        /* create initial pool */
        const orbs: Orb[] = []
        for (let i = 0; i < cfg.orbCount; i++) orbs.push(makeOrb())

        let animId: number

        /* ==============================================================
         * PROJECTION  (full 3-D trackball: Y then X rotation)
         * ============================================================== */
        function project() {
            const cosAY = Math.cos(angleY), sinAY = Math.sin(angleY)
            const cosAX = Math.cos(angleX), sinAX = Math.sin(angleX)
            for (let i = 0; i < numVerts; i++) {
                const x = (verts[i][0] - bboxCX) * sc
                const y = (verts[i][1] - bboxCY) * sc
                const z = (verts[i][2] - bboxCZ) * sc
                /* rotate around Y (yaw) */
                const rx = x * cosAY - z * sinAY
                const rz = x * sinAY + z * cosAY
                /* rotate around X (pitch) */
                const ry = y * cosAX - rz * sinAX
                projX[i] = rx + W / 2 + dxArr[i]
                projY[i] = ry + H / 2 + dyArr[i]
            }
        }

        /* ==============================================================
         * GLOWING WIREFRAME  (two-pass: bloom + core)
         * ============================================================== */
        function drawWireframe() {
            /* pass 1 -- additive outer glow */
            if (cfg.glowIntensity > 0) {
                ctx.save()
                ctx.globalCompositeOperation = "lighter"
                ctx.strokeStyle = cfg.glowColor
                ctx.lineWidth   = cfg.wireWidth + 3 * cfg.glowIntensity
                ctx.beginPath()
                for (let j = 0; j < numEdges; j++) {
                    const e = edges[j]
                    ctx.moveTo(projX[e[0]], projY[e[0]])
                    ctx.lineTo(projX[e[1]], projY[e[1]])
                }
                ctx.stroke()
                ctx.restore()
            }

            /* pass 2 -- crisp core wireframe */
            ctx.strokeStyle = cfg.wireColor
            ctx.lineWidth   = cfg.wireWidth
            ctx.beginPath()
            for (let j = 0; j < numEdges; j++) {
                const e = edges[j]
                ctx.moveTo(projX[e[0]], projY[e[0]])
                ctx.lineTo(projX[e[1]], projY[e[1]])
            }
            ctx.stroke()
        }

        /* ==============================================================
         * EDGE INTERPOLATION
         * ============================================================== */
        function edgePos(ei: number, t: number): [number, number] {
            const e = edges[ei]
            return [
                projX[e[0]] + (projX[e[1]] - projX[e[0]]) * t,
                projY[e[0]] + (projY[e[1]] - projY[e[0]]) * t,
            ]
        }

        /* ==============================================================
         * SIGNAL LIFESPAN  (fade-in 8 %, hold, fade-out 30 %)
         * ============================================================== */
        function orbAlpha(orb: Orb): number {
            const lifeFrac = 1 - orb.hopsLeft / orb.maxHops   // 0 = new, 1 = dying
            if (lifeFrac < 0.08) return lifeFrac / 0.08        // fade in
            if (lifeFrac > 0.7)  return (1 - lifeFrac) / 0.3   // fade out
            return 1.0
        }

        /* ==============================================================
         * ADVANCE ORB  (move along edges, count hops, respawn)
         * ============================================================== */
        function advanceOrb(orb: Orb) {
            orb.trail.unshift({ edgeIdx: orb.edgeIdx, t: orb.t })
            if (orb.trail.length > cfg.orbTrailLength)
                orb.trail.length = cfg.orbTrailLength

            orb.t += orb.speed * orb.dir

            if (orb.t > 1) {
                orb.hopsLeft--
                if (orb.hopsLeft <= 0) { respawnOrb(orb); return }
                const ov = orb.t - 1
                const n  = nextEdgeFrom(edges[orb.edgeIdx][1], orb.edgeIdx)
                orb.edgeIdx = n.edgeIdx; orb.dir = n.dir
                orb.t = orb.dir === 1 ? ov : 1 - ov
            } else if (orb.t < 0) {
                orb.hopsLeft--
                if (orb.hopsLeft <= 0) { respawnOrb(orb); return }
                const ov = -orb.t
                const n  = nextEdgeFrom(edges[orb.edgeIdx][0], orb.edgeIdx)
                orb.edgeIdx = n.edgeIdx; orb.dir = n.dir
                orb.t = orb.dir === 1 ? ov : 1 - ov
            }
            orb.t = Math.max(0, Math.min(1, orb.t))
        }

        /* build screen-space trail coords (head first) */
        function buildTrailPts(orb: Orb, ox: number, oy: number) {
            const pts: [number, number][] = [[ox, oy]]
            for (let k = 0; k < orb.trail.length; k++) {
                const [px, py] = edgePos(orb.trail[k].edgeIdx, orb.trail[k].t)
                const prev = pts[pts.length - 1]
                if ((px - prev[0]) ** 2 + (py - prev[1]) ** 2 > 2500) break
                pts.push([px, py])
            }
            return pts
        }

        /* draw one continuous energy trail with lifespan alpha */
        function drawTrailPath(
            pts: [number, number][],
            hue: number,
            baseW: number,
            lifeAlpha: number,
        ) {
            if (pts.length < 2) return
            const len = pts.length
            ctx.lineCap = "round"; ctx.lineJoin = "round"

            /* outer glow pass */
            for (let k = 0; k < len - 1; k++) {
                const frac  = k / len
                const alpha = lifeAlpha * (1 - frac) * 0.25
                const w     = baseW * 6 * (1 - frac * 0.7)
                ctx.strokeStyle = "hsla(" + hue + ",100%,60%," + alpha + ")"
                ctx.lineWidth = w
                ctx.beginPath()
                ctx.moveTo(pts[k][0], pts[k][1])
                ctx.lineTo(pts[k + 1][0], pts[k + 1][1])
                ctx.stroke()
            }

            /* inner bright trail */
            for (let k = 0; k < len - 1; k++) {
                const frac  = k / len
                const alpha = lifeAlpha * (1 - frac) * 0.85
                const lum   = 55 + (1 - frac) * 35
                const w     = baseW * (1.8 - frac * 1.2)
                ctx.strokeStyle = "hsla(" + hue + ",95%," + lum + "%," + alpha + ")"
                ctx.lineWidth = w
                ctx.beginPath()
                ctx.moveTo(pts[k][0], pts[k][1])
                ctx.lineTo(pts[k + 1][0], pts[k + 1][1])
                ctx.stroke()
            }
        }

        /* ==============================================================
         * DRAW ALL SIGNALS
         * ============================================================== */
        function drawOrbs() {
            if (!showOrbsRef.current) return
            for (const orb of orbs) {
                advanceOrb(orb)
                const la = orbAlpha(orb)
                if (la < 0.01) continue   // invisible, skip drawing

                const [ox, oy] = edgePos(orb.edgeIdx, orb.t)

                /* energy trail */
                const pts = buildTrailPts(orb, ox, oy)
                drawTrailPath(pts, orb.hue, orb.size, la)

                /* head glow */
                const g = ctx.createRadialGradient(ox, oy, 0, ox, oy, orb.size * 8)
                g.addColorStop(0,    "hsla(" + orb.hue + ",100%,95%," + (0.95 * la) + ")")
                g.addColorStop(0.08, "hsla(" + orb.hue + ",100%,80%," + (0.7  * la) + ")")
                g.addColorStop(0.25, "hsla(" + orb.hue + ",100%,60%," + (0.25 * la) + ")")
                g.addColorStop(0.5,  "hsla(" + orb.hue + ",90%,50%,"  + (0.08 * la) + ")")
                g.addColorStop(1,    "hsla(" + orb.hue + ",80%,40%,0)")
                ctx.fillStyle = g
                ctx.beginPath(); ctx.arc(ox, oy, orb.size * 8, 0, Math.PI * 2); ctx.fill()

                /* bright core */
                ctx.fillStyle = "hsla(" + orb.hue + ",60%,97%," + (0.95 * la) + ")"
                ctx.beginPath(); ctx.arc(ox, oy, orb.size * 0.8, 0, Math.PI * 2); ctx.fill()
            }
        }

        /* ==============================================================
         * THREAD-PULL  (shift + drag)
         * ============================================================== */
        function closestVertex(sx: number, sy: number): number {
            let best = -1, bestD2 = Infinity
            for (let i = 0; i < numVerts; i++) {
                const d2 = (projX[i] - sx) ** 2 + (projY[i] - sy) ** 2
                if (d2 < bestD2) { bestD2 = d2; best = i }
            }
            return best
        }

        function collectThreadVerts(center: number) {
            const depth = cfg.grabDepth
            const visited = new Map<number, number>()
            const queue: [number, number][] = [[center, 0]]
            visited.set(center, 0)
            while (queue.length > 0) {
                const [vi, d] = queue.shift()!
                if (d >= depth) continue
                for (const nb of vertAdj[vi]) {
                    if (!visited.has(nb)) {
                        visited.set(nb, d + 1)
                        queue.push([nb, d + 1])
                    }
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

        /* ==============================================================
         * MAIN ANIMATION LOOP
         * ============================================================== */
        function draw() {
            ctx.clearRect(0, 0, W, H)
            project()
            drawWireframe()
            drawOrbs()

            /* spring-back displacement */
            for (let i = 0; i < numVerts; i++) {
                dxArr[i] *= (1 - cfg.springBack)
                dyArr[i] *= (1 - cfg.springBack)
            }

            if (rotatingRef.current) angleY += cfg.rotationSpeed
            animId = requestAnimationFrame(draw)
        }

        /* ==============================================================
         * EVENTS  (drag = rotate, shift+drag = pull)
         * ============================================================== */
        function getPos(e: MouseEvent | TouchEvent) {
            const r   = canvas.getBoundingClientRect()
            const pcx = "touches" in e ? e.touches[0].clientX : e.clientX
            const pcy = "touches" in e ? e.touches[0].clientY : e.clientY
            return [(pcx - r.left) * (W / r.width), (pcy - r.top) * (H / r.height)]
        }

        function onDown(e: MouseEvent | TouchEvent) {
            if ("touches" in e) e.preventDefault()
            mouseDown = true
            canvas.style.cursor = "grabbing"
            shiftHeld = !("touches" in e) && (e as MouseEvent).shiftKey
            const p = getPos(e)
            mouseX = prevMouseX = p[0]
            mouseY = prevMouseY = p[1]
            if (shiftHeld) {
                const nearest = closestVertex(mouseX, mouseY)
                if (nearest >= 0) grabbedVerts = collectThreadVerts(nearest)
            }
        }

        function onMove(e: MouseEvent | TouchEvent) {
            if ("touches" in e) e.preventDefault()
            const p = getPos(e)
            mouseX = p[0]; mouseY = p[1]
            const deltaX = mouseX - prevMouseX
            const deltaY = mouseY - prevMouseY
            if (mouseDown) {
                if (shiftHeld && grabbedVerts.length > 0) {
                    applyThreadDrag(deltaX, deltaY)
                } else {
                    /* full 3-D trackball: horizontal drag = yaw, vertical = pitch */
                    angleY += deltaX * 0.005
                    angleX -= deltaY * 0.005
                }
            }
            prevMouseX = mouseX; prevMouseY = mouseY
        }

        function onUp() {
            mouseDown = false; shiftHeld = false
            grabbedVerts = []; canvas.style.cursor = "grab"
        }

        canvas.addEventListener("mousedown",  onDown)
        canvas.addEventListener("mousemove",  onMove)
        canvas.addEventListener("mouseup",    onUp)
        canvas.addEventListener("mouseleave", onUp)
        canvas.addEventListener("touchstart", onDown, { passive: false })
        canvas.addEventListener("touchmove",  onMove, { passive: false })
        canvas.addEventListener("touchend",   onUp)
        canvas.style.cursor = "grab"
        draw()

        return () => {
            cancelAnimationFrame(animId)
            canvas.removeEventListener("mousedown",  onDown)
            canvas.removeEventListener("mousemove",  onMove)
            canvas.removeEventListener("mouseup",    onUp)
            canvas.removeEventListener("mouseleave", onUp)
            canvas.removeEventListener("touchstart", onDown)
            canvas.removeEventListener("touchmove",  onMove)
            canvas.removeEventListener("touchend",   onUp)
        }
    }, [loaded, W, H,
        cfg.edgeStride, cfg.orbCount, cfg.orbTrailLength,
        cfg.orbSpeed, cfg.orbHueMin, cfg.orbHueMax, cfg.orbSize,
        cfg.grabDepth, cfg.springBack, cfg.wireColor, cfg.wireWidth,
        cfg.rotationSpeed, cfg.dataPath, cfg.signalLifespan,
        cfg.glowIntensity, cfg.glowColor, cfg.initialTiltX])

    /* ==================================================================
     * JSX
     * ================================================================== */
    return (
        <div
            ref={wrapperRef}
            className={"relative " + (cfg.responsive ? "w-full h-full " : "") + (cfg.className ?? "")}
        >
            {cfg.showControls && (
                <div className="absolute top-3 right-3 z-10 flex gap-2">
                    <button
                        onClick={() => setRotating(r => !r)}
                        className={
                            "px-3 py-1.5 rounded-lg text-xs font-medium backdrop-blur-sm border transition-all " +
                            (rotating
                                ? "bg-blue-500/20 border-blue-400/40 text-blue-300 hover:bg-blue-500/30"
                                : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10")
                        }
                    >
                        {rotating ? "⟳ Rotation" : "⏸ Rotation"}
                    </button>
                    <button
                        onClick={() => setShowOrbs(o => !o)}
                        className={
                            "px-3 py-1.5 rounded-lg text-xs font-medium backdrop-blur-sm border transition-all " +
                            (showOrbs
                                ? "bg-cyan-500/20 border-cyan-400/40 text-cyan-300 hover:bg-cyan-500/30"
                                : "bg-white/5 border-white/10 text-white/40 hover:bg-white/10")
                        }
                    >
                        {showOrbs ? "⚡ Signals" : "○ Signals"}
                    </button>
                </div>
            )}

            <canvas
                ref={canvasRef}
                className="rounded-xl border border-white/10"
                style={{
                    width:  cfg.responsive ? "100%" : W,
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
