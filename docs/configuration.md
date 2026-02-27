# Configuration

Every visual and performance knob is a React prop on `<Brain3D />`.
Pass only the ones you want to override — sensible defaults are built in.

## Props reference

### Layout

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `width` | `number` | `960` | Canvas width (px). Ignored when `responsive` is true. |
| `height` | `number` | `700` | Canvas height (px). Ignored when `responsive` is true. |
| `responsive` | `boolean` | `false` | Fill parent container and auto-resize via ResizeObserver. |
| `className` | `string` | `""` | Extra CSS class on the wrapper `<div>`. |

### Performance

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `edgeStride` | `number` | `1` | Draw every Nth edge. `2` = half, `4` = quarter. Great for mobile. |
| `dataPath` | `string` | `"/brain-data.js"` | URL of the brain data script file. |

### Orbs

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `orbCount` | `number` | `90` | Number of traveling orbs. `0` disables them entirely. |
| `orbTrailLength` | `number` | `18` | Trail segments per orb. |
| `orbSpeed` | `number` | `0.015` | Base travel speed (0–1 per frame). |
| `orbHueMin` | `number` | `185` | Minimum HSL hue for random orb colour. |
| `orbHueMax` | `number` | `235` | Maximum HSL hue. |
| `orbSize` | `number` | `2.5` | Base orb radius in CSS px. |
| `orbsOn` | `boolean` | `true` | Start with orbs visible. |

### Rotation

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `rotationOn` | `boolean` | `true` | Start with rotation enabled. |
| `rotationSpeed` | `number` | `0.005` | Radians per frame. |

### Drag / pull

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `grabDepth` | `number` | `4` | BFS hops when pulling. Higher = larger, more dramatic pull area. |
| `springBack` | `number` | `0.012` | Decay per frame (0 = permanent deformation, 1 = instant snap). |

### Wireframe look

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `wireColor` | `string` | `"rgba(0,170,255,0.13)"` | Wireframe stroke colour. |
| `wireWidth` | `number` | `0.4` | Line width. |
| `bgColor` | `string` | `"#080810"` | Canvas background colour. |

### Controls

| Prop | Type | Default | Description |
|------|------|---------|-------------|
| `showControls` | `boolean` | `true` | Show rotation/orb toggle buttons. |

## Recipes

### Minimal — just the wireframe, no orbs, no controls

```tsx
<Brain3D orbCount={0} showControls={false} />
```

### Mobile-friendly — reduced edges, smaller canvas

```tsx
<Brain3D responsive edgeStride={3} orbCount={30} />
```

### Custom colours — purple brain, orange orbs

```tsx
<Brain3D
  wireColor="rgba(150,50,255,0.15)"
  bgColor="#0a0014"
  orbHueMin={15}
  orbHueMax={40}
/>
```

### Extra stretchy pull

```tsx
<Brain3D grabDepth={6} springBack={0.005} />
```
