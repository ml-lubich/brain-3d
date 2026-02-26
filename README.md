# Neural Brain 3D Wireframe

Pure Canvas 2D brain wireframe — zero dependencies.

## Quick Start

```bash
python3 -m http.server 9000
# open http://localhost:9000
```

## Usage (browser)

```html
<canvas id="brain"></canvas>
<script src="complete-brain-wireframe.js"></script>
<script src="brain-wireframe.js"></script>
<script>
  BrainWireframe.render('brain', { width: 900, height: 700 });
</script>
```

## Options

```js
BrainWireframe.render('brain', {
  width: 900,          // canvas width
  height: 700,         // canvas height
  color: 'rgba(0, 170, 255, 0.15)', // edge color
  lineWidth: 0.5,      // edge thickness
  speed: 0.005,        // rotation speed
  autoRotate: true     // auto-rotate on/off
});
```

## Controls

`render()` returns a control object:

```js
const brain = BrainWireframe.render('brain');
brain.stop();          // pause
brain.start();         // resume
brain.setAngle(1.5);   // set rotation angle
brain.setSpeed(0.01);  // change speed
```

## Files

- `brain-wireframe.js` — renderer (importable module)
- `complete-brain-wireframe.js` — brain mesh data (47K vertices, 282K edges)
- `index.html` — minimal demo
