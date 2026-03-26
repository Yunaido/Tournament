/* One Piece visual effects – Three.js floating-particle ocean.
 * Loaded only when THREE global is available (three.min.js must load first).
 * User preference is persisted in localStorage under the key 'op_fx_enabled'.
 * Default: enabled.
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'op_fx_enabled';
    var PCOUNT = 180;

    /* ── Preference helpers ─────────────────────────────────────── */
    function isEnabled() {
        var val = localStorage.getItem(STORAGE_KEY);
        return val === null || val === 'true';
    }

    function updateBtn(btn, on) {
        btn.textContent = on ? '✨' : '💤';
        btn.title = on
            ? 'Visual effects ON – click to disable'
            : 'Visual effects OFF – click to enable';
    }

    /* ── Three.js state ─────────────────────────────────────────── */
    var raf = null;
    var renderer = null;
    var scene = null;
    var camera = null;
    var pts = null;
    var t = 0;

    /* One Piece colour palette: ocean blues, gold (treasure), white (sea foam), red (Luffy) */
    var PALETTE = [
        [0.05, 0.35, 0.60],
        [0.10, 0.55, 0.90],
        [0.00, 0.73, 0.83],
        [1.00, 0.84, 0.00],
        [1.00, 1.00, 1.00],
        [0.88, 0.27, 0.27],
    ];

    function initFX() {
        if (typeof THREE === 'undefined') return;
        if (renderer) return; // already running

        var canvas = document.getElementById('op-fx-canvas');
        if (!canvas) return;

        renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: true, antialias: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 2));
        renderer.setSize(window.innerWidth, window.innerHeight);
        renderer.setClearColor(0x000000, 0);

        scene = new THREE.Scene();
        camera = new THREE.PerspectiveCamera(60, window.innerWidth / window.innerHeight, 0.1, 500);
        camera.position.z = 60;

        var pos = new Float32Array(PCOUNT * 3);
        var col = new Float32Array(PCOUNT * 3);

        for (var i = 0; i < PCOUNT; i++) {
            pos[i * 3]     = (Math.random() - 0.5) * 130;
            pos[i * 3 + 1] = (Math.random() - 0.5) * 90;
            pos[i * 3 + 2] = (Math.random() - 0.5) * 40;

            var c = PALETTE[Math.floor(Math.random() * PALETTE.length)];
            col[i * 3]     = c[0];
            col[i * 3 + 1] = c[1];
            col[i * 3 + 2] = c[2];
        }

        var geo = new THREE.BufferGeometry();
        geo.setAttribute('position', new THREE.BufferAttribute(pos, 3));
        geo.setAttribute('color',    new THREE.BufferAttribute(col, 3));

        var mat = new THREE.PointsMaterial({
            size: 1.8,
            vertexColors: true,
            transparent: true,
            opacity: 0.65,
            sizeAttenuation: true,
        });

        pts = new THREE.Points(geo, mat);
        scene.add(pts);

        window.addEventListener('resize', onResize);
        tick();
    }

    function tick() {
        raf = requestAnimationFrame(tick);
        t += 0.008;

        var pos = pts.geometry.attributes.position.array;
        for (var i = 0; i < PCOUNT; i++) {
            /* Float upward with gentle sway */
            pos[i * 3 + 1] += 0.025 + Math.sin(t + i * 0.4) * 0.008;
            pos[i * 3]     += Math.sin(t * 0.6 + i * 0.25) * 0.015;
            /* Wrap: when a particle drifts above the top, reset to the bottom */
            if (pos[i * 3 + 1] > 50) {
                pos[i * 3 + 1] = -50;
                pos[i * 3]     = (Math.random() - 0.5) * 130;
            }
        }
        pts.geometry.attributes.position.needsUpdate = true;
        pts.rotation.y = Math.sin(t * 0.08) * 0.08;

        renderer.render(scene, camera);
    }

    function destroyFX() {
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        if (renderer) { renderer.dispose(); renderer = null; }
        if (pts && pts.geometry) { pts.geometry.dispose(); }
        if (pts && pts.material) { pts.material.dispose(); }
        scene = null; camera = null; pts = null;
    }

    function onResize() {
        if (!renderer || !camera) return;
        camera.aspect = window.innerWidth / window.innerHeight;
        camera.updateProjectionMatrix();
        renderer.setSize(window.innerWidth, window.innerHeight);
    }

    /* ── Bootstrap on DOMContentLoaded ─────────────────────────── */
    document.addEventListener('DOMContentLoaded', function () {
        var btn = document.getElementById('op-fx-toggle');
        if (!btn) return;

        var on = isEnabled();
        updateBtn(btn, on);
        if (on) { initFX(); }

        btn.addEventListener('click', function () {
            var shouldEnable = !isEnabled();
            localStorage.setItem(STORAGE_KEY, String(shouldEnable));
            updateBtn(btn, shouldEnable);
            if (shouldEnable) { initFX(); } else { destroyFX(); }
        });
    });
}());
