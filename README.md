# brain-3d

> Interactive 3D brain wireframe rendered with pure **Canvas 2D** — no
> Three.js, no WebGL. 47K vertices, 282K edges, traveling electric orbs,
> click-and-drag mesh deformation. Touch-friendly. Fully configurable
> via props.

```mermaid
flowchart LR
    DATA[("🧠 brain-data.js<br/>47K verts · 282K edges")]
    COMP{{"⚛ <Brain3D /><br/>React component"}}
    PROJ["📐 3D → 2D projection<br/>per frame"]
    DRAW["🎨 Canvas 2D<br/>render loop"]
    ORBS["✨ traveling orbs<br/>color · count · hue"]
    INPUT["🖱 mouse · 👆 touch<br/>grab · drag · spring"]
    CTRL["🎛 props<br/>edgeStride · grabDepth · ..."]
    OUT[/"🖥 <canvas>"/]

    DATA --> COMP
    CTRL --> COMP
    COMP --> PROJ --> DRAW --> OUT
    COMP --> ORBS --> DRAW
    INPUT --> COMP

    classDef io fill:#0e1116,stroke:#2f81f7,stroke-width:1.5px,color:#e6edf3;
    classDef tool fill:#161b22,stroke:#3fb950,stroke-width:1.5px,color:#e6edf3;
    classDef brain fill:#161b22,stroke:#d29922,stroke-width:1.5px,color:#e6edf3;
    classDef out fill:#0e1116,stroke:#a371f7,stroke-width:1.5px,color:#e6edf3;
    class DATA,CTRL,INPUT io;
    class PROJ,DRAW,ORBS tool;
    class COMP brain;
    class OUT out;
```

## Table of contents

- [Install](#install)
- [Render loop (algorithm)](#render-loop-algorithm)
- [Drag interaction (sequence)](#drag-interaction-sequence)
- [Usage (React / Next.js)](#usage-react--nextjs)
- [Key Props](#key-props)
- [Docs](#docs)
- [License](#license)
- [Files](#files)

## Render loop (algorithm)

```mermaid
flowchart LR
    A([requestAnimationFrame])
    B["rotate verts<br/>quaternion · auto-spin"]
    C["3D → 2D project<br/>perspective divide"]
    D{"edge index<br/>% edgeStride == 0?"}
    E["draw edge<br/>Canvas 2D"]
    F["advance orbs<br/>along edges"]
    G["draw orbs<br/>hue ramp"]
    H["spring back<br/>grabbed verts"]
    A --> B --> C --> D
    D -- "yes" --> E --> F --> G --> H --> A
    D -- "no"  --> F
```

## Drag interaction (sequence)

```mermaid
sequenceDiagram
    participant U as user
    participant E as Brain3D events
    participant V as vertex graph
    participant R as render loop

    U->>E: pointerdown(x,y)
    E->>V: pick nearest vertex
    E->>V: BFS up to grabDepth
    U->>E: pointermove(dx,dy)
    E->>V: translate grabbed verts
    R-->>U: redraw with deformed mesh
    U->>E: pointerup
    E->>V: release · springBack
    loop until rest
        R->>V: lerp toward original
    end
```

## Install

```bash
git clone git@github.com:ml-lubich/brain-3d.git
cd brain-3d/app
bun install   # or npm install
bun dev       # → http://localhost:3000
```

## Usage (React / Next.js)

```tsx
import { Brain3D } from "@/components/Brain3D"

// Defaults — just works
<Brain3D />

// Responsive, fewer edges for mobile
<Brain3D responsive edgeStride={3} orbCount={30} />

// Custom look
<Brain3D
  wireColor="rgba(150,50,255,0.15)"
  bgColor="#0a0014"
  orbHueMin={15}
  orbHueMax={40}
  grabDepth={6}
  springBack={0.005}
/>
```

Copy `public/brain-data.js` into your project's static assets.
Import `Brain3D` from `src/components/Brain3D.tsx`.

## Key Props

| Prop | Default | What it does |
|------|---------|-------------|
| `responsive` | `false` | Fill parent container, auto-resize |
| `edgeStride` | `1` | Render every Nth edge (performance) |
| `orbCount` | `90` | Number of traveling orbs |
| `grabDepth` | `4` | Hops of vertices grabbed when pulling |
| `springBack` | `0.012` | How fast mesh snaps back |
| `wireColor` | `rgba(0,170,255,0.13)` | Wireframe colour |
| `showControls` | `true` | Toggle buttons for rotation & orbs |

Full prop reference: [docs/configuration.md](docs/configuration.md)

## Docs

- [Architecture](docs/architecture.md) — how the renderer works
- [Configuration](docs/configuration.md) — all props, defaults, recipes

## License

[MIT](LICENSE)

## Files

- `brain-3d.js` — data + renderer (single file, importable)
- `index.html` — minimal demo
