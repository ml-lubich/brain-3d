# Architecture

## Rendering pipeline

Brain3D renders a 47,000-vertex brain wireframe entirely on a 2D Canvas —
no Three.js, no WebGL. The pipeline runs every animation frame:

```
                       ┌──────────────┐
 OBJ vertex data  ───▶ │  Projection  │ ───▶  projected X/Y buffers
                       └──────────────┘
                              │
                       ┌──────┴───────┐
                       │  Wireframe   │  draw all edges in one stroke() call
                       └──────────────┘
                              │
                       ┌──────┴───────┐
                       │    Orbs      │  advance along edges, draw trails + glow
                       └──────────────┘
                              │
                       ┌──────┴───────┐
                       │  Spring-back │  decay per-vertex displacement dx/dy
                       └──────────────┘
```

### Projection

Each vertex is:

1. **Centered** — subtract bounding-box midpoint.
2. **Scaled** — fit inside `min(W, H) × 0.78`.
3. **Tilted** — rotate around the X axis by `π × 0.45` so the brain faces
   the viewer rather than looking straight down from the top.
4. **Spun** — rotate around the Y axis by `angle` (incremented each frame
   when rotation is on).
5. **Displaced** — add per-vertex `dxArr[i]` / `dyArr[i]` offsets applied by
   the drag system.

All projections write into two `Float32Array` buffers (`projX`, `projY`) that
every other subsystem reads from.

### Wireframe

All visible edges are drawn in a single `ctx.beginPath()` / `ctx.stroke()`
call. When `edgeStride > 1`, only every Nth edge is included — reducing draw
calls proportionally.

### Orbs

Each orb lives on a specific edge at parameter `t ∈ [0, 1]`. Every frame:

- `t` is advanced by `speed × dir`.
- When `t` exits `[0, 1]`, the orb hops to an adjacent edge via the
  **adjacency map** (`adj[vertexIdx] → edgeIdx[]`), preserving overshoot.
- A **trail** ring-buffer stores recent positions. The trail is drawn
  oldest→newest with fading opacity and shrinking width.
- A radial-gradient **glow** and solid **core** are drawn at the head.

### Drag (thread-pull)

1. `closestVertex()` — brute-force scan of projected positions.
2. `collectThreadVerts(center)` — BFS out `grabDepth` hops using
   `vertAdj` (vertex→vertex neighbour Set). Each hop gets a weight
   `1 / (1 + hop × 0.6)`.
3. `applyThreadDrag()` — adds mouse delta × weight to `dxArr` / `dyArr`.
4. Every frame, all displacements decay: `dx *= (1 - springBack)`.

`vertAdj` is built from **all** edges (not the stride-filtered set) so the
grab area always reaches the same number of neighbours regardless of
`edgeStride`.

## Data

Vertex and edge arrays are loaded from `/public/brain-data.js` (a plain
`<script>` tag that sets `window.COMPLETE_BRAIN_VERTICES` and
`window.COMPLETE_BRAIN_EDGES`). The data was extracted from `brain-andre.obj`.

| Array      | Length    | Format                    |
|------------|-----------|---------------------------|
| Vertices   | 47,021    | `[x, y, z]` each         |
| Edges      | 282,522   | `[vertIdx0, vertIdx1]`    |
