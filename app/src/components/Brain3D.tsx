"use client"

import { useRef, useEffect, useState, useCallback } from "react"

/* ─────────────────────────────────────────────────────────────────────
 * Brain3D — Interactive 3D brain wireframe with traveling electric orbs
 *
 * Features:
 *  - Pure Canvas 2D, zero 3D-library dependencies
 *  - Click & drag to pull/deform the mesh (spring-back)
 *  - Rotation continues while dragging
 *  - Traveling glowing orbs along random edges
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

interface Orb {
    edgeIdx: number
    t: number          // 0→1 along edge
    speed: number      // units per frame
    hue: number        // color shift
    size: number
}

const ORB_COUNT = 80
const ORB_TRAIL_LEN = 6

export function Brain3D({ width = 960, height = 700, className = "" }: Brain3DProps) {
    const canvasRef = useRef<HTMLCanvasElement>(null)
    const [loaded, setLoaded] = useState(false)
    const [rotating, setRotating] = useState(true)
    const [showOrbs, setShowOrbs] = useState(true)

    // Refs for animation state (avoids re-renders)
    const rotatingRef = useRef(true)
    const showOrbsRef = useRef(true)
    rotatingRef.current = rotating
    showOrbsRef.current = showOrbs

    // Load brain data via script tag
    useEffect(() => {
        if (window.COMPLETE_BRAIN_VERTICES) {
            setLoaded(true)
            return
        }
        const script = document.createElement("script")
        script.src = "/brain-data.js"
        script.onload = () => setLoaded(true)
        document.head.appendChild(script)
        return () => { script.remove() }
    }, [])

    // Main render loop
    useEffect(() => {
        if (!loaded || !canvasRef.current) return

        const canvas = canvasRef.current
        const ctx = canvas.getContext("2d")!
        canvas.width = width
        canvas.height = height

        const verts = window.COMPLETE_BRAIN_VERTICES
        const edges = window.COMPLETE_BRAIN_EDGES
        const numVerts = verts.length
        const numEdges = edges.length

        // ── Bounding box ─────────────────────────────────────────────────
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

        // ── Vertex displacement (for drag interaction) ───────────────────
        const dx = new Float32Array(numVerts)
        const dy = new Float32Array(numVerts)

        // ── Projection buffers ───────────────────────────────────────────
        const projX = new Float32Array(numVerts)
        const projY = new Float32Array(numVerts)

        // ── Tilt so brain is upright ─────────────────────────────────────
        const tilt = Math.PI * 0.45
        const cosT = Math.cos(tilt), sinT = Math.sin(tilt)

        // ── Mouse / touch state ──────────────────────────────────────────
        let mouseDown = false
        let mouseX = 0, mouseY = 0
        let prevMouseX = 0, prevMouseY = 0
        const dragRadius = 50
        const dragStrength = 1.2
        const springBack = 0.06

        // ── Orbs ─────────────────────────────────────────────────────────
        const orbs: Orb[] = []
        for (let i = 0; i < ORB_COUNT; i++) {
            orbs.push({
                edgeIdx: Math.floor(Math.random() * numEdges),
                t: Math.random(),
                speed: 0.008 + Math.random() * 0.015,
                hue: 190 + Math.random() * 40, // blue-cyan range
                size: 2 + Math.random() * 3,
            })
        }

        // ── State ────────────────────────────────────────────────────────
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

        function drawOrbs() {
            if (!showOrbsRef.current) return

            for (let i = 0; i < orbs.length; i++) {
                const orb = orbs[i]

                // Advance orb
                orb.t += orb.speed
                if (orb.t > 1) {
                    // Jump to a random connected edge
                    orb.t = 0
                    const currentEnd = edges[orb.edgeIdx][1]
                    // Find edges starting from currentEnd for continuity
                    let found = false
                    const startSearch = Math.floor(Math.random() * numEdges)
                    for (let k = 0; k < 200; k++) {
                        const idx = (startSearch + k) % numEdges
                        if (edges[idx][0] === currentEnd || edges[idx][1] === currentEnd) {
                            orb.edgeIdx = idx
                            orb.t = edges[idx][0] === currentEnd ? 0 : 1
                            orb.speed = Math.abs(orb.speed) * (orb.t === 0 ? 1 : -1)
                            found = true
                            break
                        }
                    }
                    if (!found) {
                        orb.edgeIdx = Math.floor(Math.random() * numEdges)
                        orb.t = 0
                    }
                }
                if (orb.t < 0) {
                    orb.t = 1
                    const currentEnd = edges[orb.edgeIdx][0]
                    const startSearch = Math.floor(Math.random() * numEdges)
                    let found = false
                    for (let k = 0; k < 200; k++) {
                        const idx = (startSearch + k) % numEdges
                        if (edges[idx][0] === currentEnd || edges[idx][1] === currentEnd) {
                            orb.edgeIdx = idx
                            orb.t = edges[idx][0] === currentEnd ? 0 : 1
                            orb.speed = Math.abs(orb.speed) * (orb.t === 0 ? 1 : -1)
                            found = true
                            break
                        }
                    }
                    if (!found) {
                        orb.edgeIdx = Math.floor(Math.random() * numEdges)
                        orb.t = 1
                    }
                }

                const e = edges[orb.edgeIdx]
                const t = Math.max(0, Math.min(1, orb.t))

                // Interpolate position on edge
                const ox = projX[e[0]] + (projX[e[1]] - projX[e[0]]) * t
                const oy = projY[e[0]] + (projY[e[1]] - projY[e[0]]) * t

                // Outer glow
                const grad = ctx.createRadialGradient(ox, oy, 0, ox, oy, orb.size * 6)
                grad.addColorStop(0, `hsla(${orb.hue}, 100%, 85%, 0.8)`)
                grad.addColorStop(0.15, `hsla(${orb.hue}, 100%, 65%, 0.5)`)
                grad.addColorStop(0.4, `hsla(${orb.hue}, 90%, 50%, 0.15)`)
                grad.addColorStop(1, `hsla(${orb.hue}, 80%, 40%, 0)`)

                ctx.fillStyle = grad
                ctx.beginPath()
                ctx.arc(ox, oy, orb.size * 6, 0, Math.PI * 2)
                ctx.fill()

                // Bright core
                ctx.fillStyle = `hsla(${orb.hue}, 100%, 95%, 0.95)`
                ctx.beginPath()
                ctx.arc(ox, oy, orb.size * 0.8, 0, Math.PI * 2)
                ctx.fill()

                // Edge trail glow - light up nearby edge
                const ex1 = projX[e[0]], ey1 = projY[e[0]]
                const ex2 = projX[e[1]], ey2 = projY[e[1]]

                const trailGrad = ctx.createLinearGradient(ex1, ey1, ex2, ey2)
                const tPos = t
                const spread = 0.15
                trailGrad.addColorStop(Math.max(0, tPos - spread), `hsla(${orb.hue}, 80%, 50%, 0)`)
                trailGrad.addColorStop(Math.max(0, tPos - spread * 0.3), `hsla(${orb.hue}, 90%, 60%, 0.6)`)
                trailGrad.addColorStop(Math.min(1, tPos), `hsla(${orb.hue}, 100%, 80%, 0.9)`)
                trailGrad.addColorStop(Math.min(1, tPos + spread * 0.3), `hsla(${orb.hue}, 90%, 60%, 0.6)`)
                trailGrad.addColorStop(Math.min(1, tPos + spread), `hsla(${orb.hue}, 80%, 50%, 0)`)

                ctx.strokeStyle = trailGrad
                ctx.lineWidth = 1.5
                ctx.beginPath()
                ctx.moveTo(ex1, ey1)
                ctx.lineTo(ex2, ey2)
                ctx.stroke()
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

        // ── Main loop ────────────────────────────────────────────────────
        function draw() {
            ctx.clearRect(0, 0, width, height)

            project()
            drawWireframe()
            drawOrbs()
            drawDragCircle()

            // Spring back
            for (let i = 0; i < numVerts; i++) {
                dx[i] *= (1 - springBack)
                dy[i] *= (1 - springBack)
            }

            // ALWAYS rotate (even while dragging)
            if (rotatingRef.current) angle += 0.005

            animId = requestAnimationFrame(draw)
        }

        // ── Event handlers ───────────────────────────────────────────────
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
