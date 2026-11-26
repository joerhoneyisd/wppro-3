/* Hero rocket: a 3D shuttle (three.js) with animated engine flames.
   The model's solid exhaust cones are trimmed off at load and replaced with
   shader flames (same flame as the wppro-2 toy rocket), one per nozzle.
   Rendering stops while the hero is off screen. */
import * as THREE from "three";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { RoomEnvironment } from "three/addons/environments/RoomEnvironment.js";

const host = document.getElementById("rd-alt-hero-visual");
const canvas = host && host.querySelector(".hero-rocket");
if (canvas) start();

function start() {
  let renderer;
  try {
    renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  } catch (e) {
    return; // no WebGL: leave the space empty
  }
  renderer.setPixelRatio(Math.min(window.devicePixelRatio || 1, 2));
  renderer.toneMapping = THREE.ACESFilmicToneMapping;
  renderer.toneMappingExposure = 1.05;
  renderer.setClearColor(0x000000, 0);

  const calm = window.matchMedia("(prefers-reduced-motion: reduce)");
  const scene = new THREE.Scene();
  const pmrem = new THREE.PMREMGenerator(renderer);
  scene.environment = pmrem.fromScene(new RoomEnvironment(), 0.04).texture;
  scene.environmentIntensity = 0.9; // reflections for the gold trim, kept low so the night sky still reads
  pmrem.dispose();

  const camera = new THREE.PerspectiveCamera(30, 1, 0.1, 100);

  // Moonlit key from above left, cool rim from behind, warm engine light below.
  const key = new THREE.DirectionalLight(0xdce9ff, 3.2);
  key.position.set(-2, 5, 3);
  scene.add(key);
  const rim = new THREE.DirectionalLight(0x7fb2ff, 1.4);
  rim.position.set(3, 1, -4);
  scene.add(rim);

  // tilt: nose leans slightly away from the camera, like the toy rocket
  const tilt = new THREE.Group();
  tilt.rotation.x = -0.16;
  scene.add(tilt);
  const sway = new THREE.Group(); // slow left/right yaw
  tilt.add(sway);
  // The model lies along +x with its nose at -x; stand it up, nose to the sky.
  const model = new THREE.Group();
  model.rotation.set(0, -Math.PI / 2, -Math.PI / 2, "YXZ");
  model.position.y = 0.1; // centre the rocket plus flames on the pivot
  sway.add(model);

  /* ---- flames (in model space: nozzles point along +x) ---- */
  const NOZZLES = [
    { x: 0.61, y: -0.011, z: -0.257, r: 0.078, s: 1 },
    { x: 0.63, y: 0.0, z: 0.0, r: 0.09, s: 1.15 },
    { x: 0.61, y: -0.011, z: 0.253, r: 0.078, s: 1 },
  ];
  const vs = `varying vec2 vUv;varying vec3 vN;varying vec3 vV;
void main(){vUv=uv;vec4 mv=modelViewMatrix*vec4(position,1.);vN=normalize(normalMatrix*normal);vV=normalize(-mv.xyz);gl_Position=projectionMatrix*mv;}`;
  const fs = `uniform vec3 uColor;uniform float uTime;uniform float uPow;uniform float uSeed;
varying vec2 vUv;varying vec3 vN;varying vec3 vV;
void main(){float t=vUv.y;
float f=pow(abs(dot(normalize(vN),normalize(vV))),1.4);
float n=0.78+0.22*sin(uTime*34.+t*14.+uSeed)*sin(uTime*21.+t*7.+uSeed*2.);
float a=pow(1.-t,1.25)*f*n*uPow;
gl_FragColor=vec4(uColor*(1.+(1.-t)*.7),a);}`;
  // [radius, length] relative to the nozzle radius, colour, strength
  const LAYERS = [
    [1.05, 8.5, [1, 0.32, 0.05], 1.0],
    [0.7, 6, [1, 0.68, 0.18], 1.1],
    [0.4, 3.8, [1, 0.96, 0.82], 1.3],
  ];
  const layers = [];
  NOZZLES.forEach((n, ni) => {
    const g = new THREE.Group();
    g.position.set(n.x - 0.01, n.y, n.z);
    g.rotation.z = Math.PI / 2; // the group's -y now points out of the nozzle (+x)
    model.add(g);
    LAYERS.forEach(([rr, hh, c, p], i) => {
      const r = rr * n.r, h = hh * n.r * n.s;
      const mesh = new THREE.Mesh(
        new THREE.ConeGeometry(r, h, 32, 1, true),
        new THREE.ShaderMaterial({
          vertexShader: vs,
          fragmentShader: fs,
          transparent: true,
          depthWrite: false,
          blending: THREE.AdditiveBlending,
          side: THREE.DoubleSide,
          toneMapped: false,
          uniforms: {
            uColor: { value: new THREE.Vector3(...c) },
            uTime: { value: 0 },
            uPow: { value: p },
            uSeed: { value: i * 1.7 + ni * 2.3 },
          },
        })
      );
      mesh.rotation.x = Math.PI;
      mesh.userData = { h, i: i + ni * 3 };
      g.add(mesh);
      layers.push(mesh);
    });
  });
  /* Glow: one soft disc over all three nozzles, in front of the whole rocket.
     Its falloff reaches zero with zero slope at the rim, so no circle edge
     shows. It isn't attached to the rocket, so the sway never moves it. */
  function glowTexture() {
    const N = 256, c = document.createElement("canvas");
    c.width = c.height = N;
    const x = c.getContext("2d"), img = x.createImageData(N, N), d = img.data;
    for (let py = 0; py < N; py++) {
      for (let px = 0; px < N; px++) {
        const r = Math.hypot(px + 0.5 - N / 2, py + 0.5 - N / 2) / (N / 2);
        if (r >= 1) continue;
        const a = 0.95 * Math.pow(1 - r, 2.6); // ~0.45 at r = 0.25, like the old gradient
        const m = Math.min(1, r / 0.5); // hot yellow core into orange
        const o = (py * N + px) * 4;
        d[o] = 255;
        d[o + 1] = Math.round(200 - 110 * m);
        d[o + 2] = Math.round(120 - 100 * m);
        d[o + 3] = Math.round(a * 255);
      }
    }
    x.putImageData(img, 0, 0);
    const tex = new THREE.CanvasTexture(c);
    tex.colorSpace = THREE.SRGBColorSpace;
    return tex;
  }
  const glow = new THREE.Sprite(
    new THREE.SpriteMaterial({
      map: glowTexture(),
      toneMapped: false,
      blending: THREE.AdditiveBlending,
      depthWrite: false,
      depthTest: false,
      transparent: true,
    })
  );
  glow.renderOrder = 10;
  scene.add(glow);
  const GLOW_SIZE = 1.4; // world size it had when it sat at the nozzles
  const GLOW_AT = new THREE.Vector3(0.72, 0, 0); // in model space, without the sway
  const GLOW_NEAR = 0.5; // fraction of the way from the camera to that spot
  const glowAnchor = new THREE.Vector3();
  function placeGlow() {
    tilt.updateMatrixWorld();
    model.updateMatrix();
    glowAnchor.copy(GLOW_AT).applyMatrix4(model.matrix).applyMatrix4(tilt.matrixWorld);
    // slide it along the camera ray toward the camera and shrink it to match,
    // so it looks the same size and spot but sits in front of the rocket
    glow.position.copy(camera.position).lerp(glowAnchor, GLOW_NEAR);
    glow.scale.set(GLOW_SIZE * GLOW_NEAR, GLOW_SIZE * GLOW_NEAR, 1);
  }
  const engineLight = new THREE.PointLight(0xff7a2a, 2.5, 3, 1.2);
  engineLight.position.set(0.75, 0, 0.15);
  model.add(engineLight);

  // Trim the model's solid exhaust cones: drop triangles that sit wholly past a nozzle exit.
  function trimExhaust(mesh) {
    const g = mesh.geometry;
    const pos = g.attributes.position;
    const idx = g.index;
    const keep = [];
    const v = new THREE.Vector3();
    const past = (i) => {
      v.fromBufferAttribute(pos, i).applyMatrix4(mesh.matrixWorld); // undo quantization scale
      return NOZZLES.some((n) => v.x > n.x && Math.hypot(v.y - n.y, v.z - n.z) < n.r * 1.6);
    };
    for (let t = 0; t < idx.count; t += 3) {
      const a = idx.getX(t), b = idx.getX(t + 1), c = idx.getX(t + 2);
      if (!(past(a) && past(b) && past(c))) keep.push(a, b, c);
    }
    g.setIndex(keep);
  }

  /* ---- sizing: the rocket keeps the same proportion of the canvas height ---- */
  let running = false;
  function resize() {
    const w = canvas.clientWidth, h = canvas.clientHeight;
    if (!w || !h) return;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    // Scale against the visual box (the canvas overhangs it), then shift the view so
    // the rocket stays centred on the visual rather than on the taller canvas.
    const hostH = host.clientHeight || h;
    const z = 4.6 * Math.max(1, 0.62 / (w / hostH)) * (h / hostH);
    const perPx = (2 * z * Math.tan((camera.fov * Math.PI) / 360)) / h;
    const shift = canvas.offsetTop + h / 2 - hostH / 2;
    camera.position.set(0, -shift * perPx, z);
    camera.updateProjectionMatrix();
    placeGlow();
    if (!running && loaded) renderer.render(scene, camera);
  }

  const clock = new THREE.Clock();
  const FLAME_RATE = 0.25;
  let T = 0;
  function frame() {
    T += Math.min(clock.getDelta(), 0.05);
    const still = calm.matches;
    sway.rotation.y = still ? 0 : Math.sin(T * 0.45) * 0.22;
    // flames pulse on a slowed clock (a quarter of wppro-2's speed)
    const t = still ? 0 : T * FLAME_RATE;
    const k = still ? 1 : 0.9 + 0.1 * Math.sin(t * 38) + 0.06 * Math.sin(t * 23 + 1.3);
    layers.forEach((l) => {
      const i = l.userData.i;
      l.material.uniforms.uTime.value = t;
      l.scale.set(still ? 1 : 1 + 0.06 * Math.sin(t * 29 + i), k, still ? 1 : 1 + 0.06 * Math.cos(t * 31 + i));
      l.position.y = (-l.userData.h * k) / 2;
    });
    glow.material.opacity = still ? 0.9 : 0.8 + 0.2 * Math.sin(t * 26);
    engineLight.intensity = still ? 2.5 : 2.5 + 0.7 * Math.sin(t * 34) + 0.35 * Math.sin(t * 19);
    placeGlow();
    renderer.render(scene, camera);
  }

  /* ---- run only while the hero is on screen and the model is loaded ---- */
  let loaded = false;
  let onScreen = true;
  function sync() {
    const run = loaded && onScreen;
    if (run === running) return;
    running = run;
    if (run) clock.getDelta(); // don't count the time spent paused
    renderer.setAnimationLoop(run ? frame : null);
  }
  if ("IntersectionObserver" in window) {
    new IntersectionObserver((entries) => {
      onScreen = entries[0].isIntersecting;
      sync();
    }).observe(canvas);
  }
  new ResizeObserver(resize).observe(canvas);
  resize();

  new GLTFLoader().load(
    canvas.dataset.model,
    (gltf) => {
      gltf.scene.updateMatrixWorld(true);
      gltf.scene.traverse((o) => {
        if (o.isMesh) trimExhaust(o);
      });
      model.add(gltf.scene);
      loaded = true;
      host.classList.add("is-loaded");
      sync();
      if (!running) frame();
    },
    undefined,
    (e) => console.error("Hero rocket model failed to load", e)
  );
}
