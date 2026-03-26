/* One Piece visual effects – Raymarched Grand Line ocean.
 *
 * Fullscreen GLSL shader renders a dark, stormy 3D ocean surface using
 * raymarching with an FBM-based wave height field, realistic lighting,
 * Fresnel reflections, volumetric fog, and an atmospheric sky dome.
 * Inspired by the dangerous seas of the Grand Line.
 *
 * Uses Three.js for WebGL setup.  User preference persisted in localStorage
 * key 'op_fx_enabled'.  Default: enabled.
 */
(function () {
    'use strict';

    var STORAGE_KEY = 'op_fx_enabled';

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
    var oceanMesh = null;
    var oceanMat = null;
    var clock = null;

    /* ────────────────────────────────────────────────────────────
     * GLSL shaders – Raymarched ocean surface
     * ──────────────────────────────────────────────────────────── */

    var OCEAN_VERT = [
        'varying vec2 vUv;',
        'void main() {',
        '    vUv = uv;',
        '    gl_Position = vec4(position, 1.0);',
        '}'
    ].join('\n');

    var OCEAN_FRAG = [
        'precision highp float;',
        'uniform float uTime;',
        'uniform vec2  uResolution;',
        '',
        '/* ── Tuning constants ─────────────────────────── */',
        'const int   MARCH_STEPS   = 6;',
        'const int   WAVE_OCTAVES  = 4;',
        'const float WAVE_HEIGHT   = 0.35;',
        'const float WAVE_CHOPPY   = 3.0;',
        'const float WAVE_SPEED    = 0.65;',
        'const float WAVE_FREQ     = 0.18;',
        '',
        '/* Camera setup */',
        'const float CAM_HEIGHT    = 3.2;',
        'const float CAM_PITCH     = -0.38;',
        '',
        '/* ── Colour palette (Grand Line dark ocean) ──── */',
        'const vec3 SKY_DARK    = vec3(0.01, 0.015, 0.04);',
        'const vec3 SKY_HORIZON = vec3(0.02, 0.04,  0.10);',
        'const vec3 WATER_DEEP  = vec3(0.005, 0.02, 0.06);',
        'const vec3 WATER_SURF  = vec3(0.01, 0.06,  0.14);',
        'const vec3 SPEC_COL    = vec3(0.55, 0.50,  0.35);',
        'const vec3 FOG_COL     = vec3(0.01, 0.025, 0.06);',
        '',
        'varying vec2 vUv;',
        '',
        '/* ── Noise primitives ────────────────────────── */',
        'float hash(vec2 p) {',
        '    float h = dot(p, vec2(127.1, 311.7));',
        '    return fract(sin(h) * 43758.5453123);',
        '}',
        '',
        'float noise(vec2 p) {',
        '    vec2 i = floor(p);',
        '    vec2 f = fract(p);',
        '    vec2 u = f * f * (3.0 - 2.0 * f);',
        '    return -1.0 + 2.0 * mix(',
        '        mix(hash(i), hash(i + vec2(1.0, 0.0)), u.x),',
        '        mix(hash(i + vec2(0.0, 1.0)), hash(i + vec2(1.0, 1.0)), u.x),',
        '    u.y);',
        '}',
        '',
        '/* ── Wave height function ────────────────────── */',
        '/* Octave rotation matrix – avoids grid artifacts */',
        'const mat2 OCTAVE_M = mat2(1.6, 1.2, -1.2, 1.6);',
        '',
        'float seaOctave(vec2 uv, float choppy) {',
        '    uv += noise(uv);',
        '    vec2 wv = 1.0 - abs(sin(uv));',
        '    vec2 swv = abs(cos(uv));',
        '    wv = mix(wv, swv, wv);',
        '    return pow(1.0 - pow(wv.x * wv.y, 0.65), choppy);',
        '}',
        '',
        'float mapWaves(vec2 p) {',
        '    float freq  = WAVE_FREQ;',
        '    float amp   = WAVE_HEIGHT;',
        '    float choppy = WAVE_CHOPPY;',
        '    float t     = uTime * WAVE_SPEED;',
        '    vec2  uv    = p;',
        '    uv.x *= 0.75;',
        '',
        '    float h = 0.0;',
        '    for (int i = 0; i < WAVE_OCTAVES; i++) {',
        '        float d  = seaOctave((uv + t) * freq, choppy);',
        '        float d2 = seaOctave((uv - t) * freq, choppy);',
        '        d = (d + d2) * 0.5;',  // average the two for more chaotic movement
        '        h += d * amp;',
        '        uv *= OCTAVE_M;',
        '        freq *= 1.9;',
        '        amp  *= 0.22;',
        '        choppy = mix(choppy, 1.0, 0.2);',
        '    }',
        '    return h;',
        '}',
        '',
        '/* ── Surface normal via central differences ──── */',
        'vec3 getNormal(vec2 p, float eps) {',
        '    float h = mapWaves(p);',
        '    return normalize(vec3(',
        '        mapWaves(vec2(p.x - eps, p.y)) - mapWaves(vec2(p.x + eps, p.y)),',
        '        eps * 2.0,',
        '        mapWaves(vec2(p.x, p.y - eps)) - mapWaves(vec2(p.x, p.y + eps))',
        '    ));',
        '}',
        '',
        '/* ── Heightmap tracing (raymarching the ocean) ─ */',
        'float traceOcean(vec3 ori, vec3 dir) {',
        '    float tm = 0.0;',
        '    float tx = 200.0;',
        '    float hx = mapWaves(ori.xz + dir.xz * tx);',
        '',
        '    /* Early out if the ray goes up and misses */',
        '    if (hx > 0.0) {',
        '        if (dir.y > 0.0) return tx;',
        '        tx = (hx - ori.y) / dir.y;',
        '    }',
        '',
        '    float hm = mapWaves(ori.xz + dir.xz * tm) - ori.y;',
        '',
        '    /* Binary-refined marching */',
        '    for (int i = 0; i < MARCH_STEPS; i++) {',
        '        float tmid = mix(tm, tx, hm / (hm - hx));',
        '        float hmid = mapWaves(ori.xz + dir.xz * tmid) - (ori.y + dir.y * tmid);',
        '        if (hmid < 0.0) {',
        '            tx = tmid;',
        '            hx = hmid;',
        '        } else {',
        '            tm = tmid;',
        '            hm = hmid;',
        '        }',
        '    }',
        '    return mix(tm, tx, hm / (hm - hx));',
        '}',
        '',
        '/* ── Sky gradient ────────────────────────────── */',
        'vec3 getSkyColor(vec3 rd) {',
        '    float t = max(rd.y, 0.0);',
        '    vec3 sky = mix(SKY_HORIZON, SKY_DARK, pow(t, 0.5));',
        '    /* Faint moonlight glow */',
        '    vec3 moonDir = normalize(vec3(0.4, 0.3, 0.5));',
        '    float moonGlow = pow(max(dot(rd, moonDir), 0.0), 128.0);',
        '    sky += vec3(0.15, 0.18, 0.25) * moonGlow;',
        '    /* Subtle warm glow near horizon */',
        '    float horizGlow = pow(1.0 - abs(rd.y), 8.0);',
        '    sky += vec3(0.08, 0.04, 0.01) * horizGlow * 0.5;',
        '    return sky;',
        '}',
        '',
        '/* ── Water shading ───────────────────────────── */',
        'vec3 getSeaColor(vec3 p, vec3 n, vec3 lightDir, vec3 rd, float dist) {',
        '    float fresnel = clamp(1.0 - dot(n, -rd), 0.0, 1.0);',
        '    fresnel = pow(fresnel, 3.0) * 0.65;',
        '',
        '    vec3 reflected = getSkyColor(reflect(rd, n));',
        '    vec3 refracted = mix(WATER_DEEP, WATER_SURF, max(dot(n, -rd), 0.0));',
        '',
        '    vec3 color = mix(refracted, reflected, fresnel);',
        '',
        '    /* Specular highlight from diffuse light source */',
        '    vec3 halfVec = normalize(lightDir - rd);',
        '    float spec = pow(max(dot(n, halfVec), 0.0), 180.0);',
        '    color += SPEC_COL * spec * 0.4;',
        '',
        '    /* Scattered subsurface light in wave peaks */',
        '    float subsurf = max(dot(n, lightDir), 0.0);',
        '    color += vec3(0.01, 0.05, 0.08) * subsurf * 0.25;',
        '',
        '    /* Distance-based darkening and fog */',
        '    float fogAmount = 1.0 - exp(-dist * 0.008);',
        '    color = mix(color, FOG_COL, fogAmount);',
        '',
        '    return color;',
        '}',
        '',
        'void main() {',
        '    vec2 uv = vUv * 2.0 - 1.0;',
        '    uv.x *= uResolution.x / uResolution.y;',
        '',
        '    /* Camera – sweeping slowly along the Grand Line */',
        '    float t = uTime * 0.15;',
        '    vec3 ori = vec3(t * 2.0, CAM_HEIGHT, t * 3.0);',
        '    vec3 lookAt = ori + vec3(sin(t * 0.3) * 0.5, CAM_PITCH, 1.0);',
        '',
        '    /* View matrix */',
        '    vec3 fwd = normalize(lookAt - ori);',
        '    vec3 right = normalize(cross(fwd, vec3(0.0, 1.0, 0.0)));',
        '    vec3 up = cross(right, fwd);',
        '    vec3 rd = normalize(uv.x * right + uv.y * up + 2.0 * fwd);',
        '',
        '    /* Light direction – low angle, dramatic */',
        '    vec3 lightDir = normalize(vec3(0.3, 0.25, 0.6));',
        '',
        '    vec3 color;',
        '',
        '    if (rd.y > 0.0) {',
        '        /* Sky above the horizon */',
        '        color = getSkyColor(rd);',
        '    } else {',
        '        /* Trace the ocean surface */',
        '        float dist = traceOcean(ori, rd);',
        '        vec3 hitPos = ori + rd * dist;',
        '',
        '        /* Surface normal – coarser at distance for perf */',
        '        float eps = max(0.001 * dist, 0.0015);',
        '        vec3 n = getNormal(hitPos.xz, eps);',
        '',
        '        color = getSeaColor(hitPos, n, lightDir, rd, dist);',
        '    }',
        '',
        '    /* Tone-map and slight vignette */',
        '    color = pow(color, vec3(0.85));',
        '    float vig = 1.0 - 0.25 * dot(vUv - 0.5, vUv - 0.5);',
        '    color *= vig;',
        '',
        '    gl_FragColor = vec4(color, 1.0);',
        '}'
    ].join('\n');

    /* ────────────────────────────────────────────────────────────
     * Init / tick / destroy
     * ──────────────────────────────────────────────────────────── */
    function initFX() {
        if (typeof THREE === 'undefined') return;
        if (renderer) return;

        var canvas = document.getElementById('op-fx-canvas');
        if (!canvas) return;

        clock = new THREE.Clock();

        renderer = new THREE.WebGLRenderer({ canvas: canvas, alpha: false, antialias: false });
        renderer.setPixelRatio(Math.min(window.devicePixelRatio, 1.5));
        renderer.setSize(window.innerWidth, window.innerHeight);

        scene = new THREE.Scene();
        camera = new THREE.OrthographicCamera(-1, 1, 1, -1, 0, 1);

        /* Fullscreen ocean quad */
        oceanMat = new THREE.ShaderMaterial({
            uniforms: {
                uTime:       { value: 0.0 },
                uResolution: { value: new THREE.Vector2(window.innerWidth, window.innerHeight) },
            },
            vertexShader:   OCEAN_VERT,
            fragmentShader: OCEAN_FRAG,
            depthWrite: false,
            depthTest: false,
        });
        var quadGeo = new THREE.PlaneGeometry(2, 2);
        oceanMesh = new THREE.Mesh(quadGeo, oceanMat);
        oceanMesh.frustumCulled = false;
        scene.add(oceanMesh);

        window.addEventListener('resize', onResize);
        tick();
    }

    function tick() {
        raf = requestAnimationFrame(tick);
        oceanMat.uniforms.uTime.value = clock.getElapsedTime();
        renderer.render(scene, camera);
    }

    function destroyFX() {
        if (raf) { cancelAnimationFrame(raf); raf = null; }
        window.removeEventListener('resize', onResize);
        if (oceanMesh) {
            if (oceanMesh.geometry) oceanMesh.geometry.dispose();
            oceanMesh = null;
        }
        if (oceanMat) { oceanMat.dispose(); oceanMat = null; }
        if (renderer) { renderer.dispose();  renderer = null; }
        scene = null; camera = null; clock = null;
    }

    function onResize() {
        if (!renderer) return;
        renderer.setSize(window.innerWidth, window.innerHeight);
        if (oceanMat) {
            oceanMat.uniforms.uResolution.value.set(window.innerWidth, window.innerHeight);
        }
    }

    /* ── Bootstrap on DOMContentLoaded ─────────────────────────── */
    document.addEventListener('DOMContentLoaded', function () {
        var btn = document.getElementById('op-fx-toggle');
        if (!btn) return;

        var on = isEnabled();
        updateBtn(btn, on);

        /* Register click handler BEFORE init so the toggle always works
           even if Three.js fails to initialise. */
        btn.addEventListener('click', function () {
            var shouldEnable = !isEnabled();
            localStorage.setItem(STORAGE_KEY, String(shouldEnable));
            updateBtn(btn, shouldEnable);
            try {
                if (shouldEnable) { initFX(); } else { destroyFX(); }
            } catch (_) { /* toggle still works even if FX errors */ }
        });

        if (on) {
            try { initFX(); } catch (_) { /* graceful degradation */ }
        }
    });
}());
