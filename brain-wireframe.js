/**
 * Neural Brain 3D Wireframe
 * Pure Canvas 2D — zero dependencies
 *
 * Usage (browser):
 *   <script src="brain-wireframe.js"></script>
 *   <script>
 *     BrainWireframe.render('myCanvasId', { width: 900, height: 700 });
 *   </script>
 *
 * Usage (ES module):
 *   import { render } from './brain-wireframe.js';
 *   render('myCanvasId');
 */

(function (root, factory) {
    if (typeof module !== 'undefined' && module.exports) {
        module.exports = factory();
    } else if (typeof define === 'function' && define.amd) {
        define(factory);
    } else {
        root.BrainWireframe = factory();
    }
}(typeof self !== 'undefined' ? self : this, function () {
    'use strict';

    // The brain data (vertices & edges) must be loaded before this script.
    // They are expected as globals: COMPLETE_BRAIN_VERTICES, COMPLETE_BRAIN_EDGES

    function render(canvasId, opts) {
        opts = opts || {};
        var width  = opts.width  || 900;
        var height = opts.height || 700;
        var color  = opts.color  || 'rgba(0, 170, 255, 0.15)';
        var lineWidth = opts.lineWidth || 0.5;
        var speed  = opts.speed  || 0.005;
        var autoRotate = opts.autoRotate !== undefined ? opts.autoRotate : true;

        var canvas = typeof canvasId === 'string'
            ? document.getElementById(canvasId)
            : canvasId;

        if (!canvas) throw new Error('Canvas element not found: ' + canvasId);

        var ctx = canvas.getContext('2d');
        canvas.width = width;
        canvas.height = height;

        var verts = COMPLETE_BRAIN_VERTICES;
        var edges = COMPLETE_BRAIN_EDGES;

        // Compute bounding box
        var minX=Infinity, maxX=-Infinity, minY=Infinity, maxY=-Infinity, minZ=Infinity, maxZ=-Infinity;
        for (var i = 0; i < verts.length; i++) {
            var v = verts[i];
            if (v[0]<minX) minX=v[0]; if (v[0]>maxX) maxX=v[0];
            if (v[1]<minY) minY=v[1]; if (v[1]>maxY) maxY=v[1];
            if (v[2]<minZ) minZ=v[2]; if (v[2]>maxZ) maxZ=v[2];
        }
        var cx = (minX+maxX)/2, cy = (minY+maxY)/2, cz = (minZ+maxZ)/2;
        var range = Math.max(maxX-minX, maxY-minY, maxZ-minZ);
        var scale = (Math.min(width, height) * 0.78) / range;

        var angle = 0;
        var animId = null;

        // Tilt so brain is upright (viewed from front, not top-down)
        var tilt = Math.PI * 0.45;
        var cosT = Math.cos(tilt), sinT = Math.sin(tilt);

        function draw() {
            ctx.clearRect(0, 0, width, height);

            var cosA = Math.cos(angle), sinA = Math.sin(angle);
            var projected = new Float32Array(verts.length * 2);

            for (var i = 0; i < verts.length; i++) {
                var x = (verts[i][0] - cx) * scale;
                var y = (verts[i][1] - cy) * scale;
                var z = (verts[i][2] - cz) * scale;
                // Tilt around X axis
                var ty = y * cosT - z * sinT;
                var tz = y * sinT + z * cosT;
                // Rotate around vertical axis (horizontal spin)
                var rx = x * cosA - tz * sinA;
                projected[i*2]   = rx + width/2;
                projected[i*2+1] = ty + height/2;
            }

            ctx.strokeStyle = color;
            ctx.lineWidth = lineWidth;
            ctx.beginPath();
            for (var j = 0; j < edges.length; j++) {
                var e = edges[j];
                ctx.moveTo(projected[e[0]*2], projected[e[0]*2+1]);
                ctx.lineTo(projected[e[1]*2], projected[e[1]*2+1]);
            }
            ctx.stroke();

            if (autoRotate) angle += speed;
            animId = requestAnimationFrame(draw);
        }

        draw();

        // Return controls
        return {
            stop: function () { if (animId) cancelAnimationFrame(animId); animId = null; },
            start: function () { if (!animId) draw(); },
            setAngle: function (a) { angle = a; },
            setSpeed: function (s) { speed = s; },
            canvas: canvas
        };
    }

    return { render: render };
}));
