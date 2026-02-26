# brain-3d

Interactive 3D brain wireframe — one file, zero dependencies, pure Canvas 2D.  
Click & drag to pull the mesh. Touch-friendly.

## Quick Start

```bash
python3 -m http.server 9000
# open http://localhost:9000
```

## Usage

```html
<canvas id="brain"></canvas>
<script src="brain-3d.js"></script>
<script>
  Brain3D.render('brain');
</script>
```

## Options

```js
Brain3D.render('brain', {
  width: 900,              // canvas width
  height: 700,             // canvas height
  color: 'rgba(0,170,255,0.15)', // wireframe color
  lineWidth: 0.5,          // edge thickness
  speed: 0.005,            // rotation speed
  autoRotate: true,        // auto-rotate
  interactive: true,       // click & drag mesh
  dragRadius: 40,          // pull radius (px)
  dragStrength: 1.0,       // pull force
  springBack: 0.05         // snap-back speed
});
```

## Controls

```js
const brain = Brain3D.render('brain');
brain.stop();            // pause
brain.start();           // resume
brain.setAngle(1.5);     // set rotation
brain.setSpeed(0.01);    // change speed
brain.reset();           // reset mesh deformation
```

## Files

- `brain-3d.js` — data + renderer (single file, importable)
- `index.html` — minimal demo
