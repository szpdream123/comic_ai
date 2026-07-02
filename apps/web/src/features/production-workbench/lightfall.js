import * as THREE from "/vendor/three.module.js?home-lightfall=1";

const MAX_COLORS = 8;
const DEFAULT_OPTIONS = {
  colors: ["#A6C8FF", "#5227FF", "#FF9FFC"],
  backgroundColor: "#0A29FF",
  speed: 0.5,
  streakCount: 2,
  streakWidth: 1,
  streakLength: 1,
  glow: 1,
  density: 0.6,
  twinkle: 1,
  zoom: 3,
  backgroundGlow: 0.5,
  opacity: 1,
  mouseInteraction: true,
  mouseStrength: 0.5,
  mouseRadius: 1,
  mouseDampening: 0.15,
  maxDpr: 1.35,
};

const VERTEX_SHADER = `
precision highp float;
attribute vec3 position;
attribute vec2 uv;
varying vec2 vUv;

void main() {
  vUv = uv;
  gl_Position = vec4(position.xy, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;

uniform vec3 iResolution;
uniform vec2 iMouse;
uniform float iTime;

uniform vec3 uColor0;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uColor4;
uniform vec3 uColor5;
uniform vec3 uColor6;
uniform vec3 uColor7;
uniform int uColorCount;

uniform vec3 uBgColor;
uniform vec3 uMouseColor;
uniform float uSpeed;
uniform int uStreakCount;
uniform float uStreakWidth;
uniform float uStreakLength;
uniform float uGlow;
uniform float uDensity;
uniform float uTwinkle;
uniform float uZoom;
uniform float uBgGlow;
uniform float uOpacity;
uniform float uMouseEnabled;
uniform float uMouseStrength;
uniform float uMouseRadius;

varying vec2 vUv;

vec3 pickColor(float h) {
  int count = uColorCount;
  if (count < 1) count = 1;
  int idx = int(floor(clamp(h, 0.0, 0.999999) * float(count)));
  if (idx <= 0) return uColor0;
  if (idx == 1) return uColor1;
  if (idx == 2) return uColor2;
  if (idx == 3) return uColor3;
  if (idx == 4) return uColor4;
  if (idx == 5) return uColor5;
  if (idx == 6) return uColor6;
  return uColor7;
}

vec3 toneCurve(vec3 value) {
  return 1.0 - exp(-max(value, vec3(0.0)));
}

vec2 tunnelSpace(vec2 frag, vec2 resolution) {
  vec2 p = (frag + frag - resolution) / resolution.x;
  float depth = 0.0;
  float dist = 1000.0;
  vec4 samplePoint = vec4(0.0);

  for (int i = 0; i < 36; i++) {
    if (dist <= 0.0001) break;
    samplePoint = depth * normalize(vec4(p, uZoom, 0.0)) - vec4(0.0, 4.0, 1.0, 0.0) / 4.5;
    dist = 1.0 - sqrt(length(samplePoint * samplePoint));
    depth += dist;
  }

  return vec2(samplePoint.x, atan(samplePoint.z, samplePoint.y));
}

void main() {
  vec2 resolution = max(iResolution.xy, vec2(1.0));
  vec2 frag = vUv * resolution;
  vec2 centered = (frag + frag - resolution) / resolution.x;
  float time = 0.1 * iTime * uSpeed + 9.0;
  float density = max(uDensity, 0.05);
  float ringCount = max(1.0, floor(6.28318530718 * density + 0.5));
  vec2 cell = vec2(0.005, 6.28318530718 / ringCount);

  vec2 coord = tunnelSpace(frag, resolution);
  vec2 coordDx = tunnelSpace(frag + vec2(1.0, 0.0), resolution) - coord;
  vec2 coordDy = tunnelSpace(frag + vec2(0.0, 1.0), resolution) - coord;
  coordDx.y -= 6.28318530718 * floor(coordDx.y / 6.28318530718 + 0.5);
  coordDy.y -= 6.28318530718 * floor(coordDy.y / 6.28318530718 + 0.5);

  vec2 feather = abs(coordDx) + abs(coordDy);
  vec2 backgroundPoint = vec2(2.0, 1.0) * centered - (resolution / resolution.x) * vec2(0.0, 1.0);
  vec3 glow = uBgColor * 90.0 * uBgGlow / (1000.0 * dot(backgroundPoint, backgroundPoint) + 6.0);

  float mouseGlow = 0.0;
  if (uMouseEnabled > 0.5) {
    vec2 mouseUv = (iMouse + iMouse - resolution) / resolution.x;
    float mouseDistance = length(centered - mouseUv);
    mouseGlow = exp(-mouseDistance * mouseDistance / max(uMouseRadius * uMouseRadius, 0.0001)) * uMouseStrength;
    glow += uMouseColor * mouseGlow * 0.25;
  }

  float streakRadius = 0.0005 * max(uStreakWidth, 0.05);
  vec2 antiAlias = vec2(max(length(feather), 0.00001));
  float tail = 19.0 / max(uStreakLength, 0.05);

  for (int layer = 0; layer < 16; layer++) {
    if (layer >= uStreakCount) break;
    float layerIndex = float(layer) + 1.0;
    float lane = floor(coord.x / cell.x + 0.5);
    float seed = fract(sin(dot(vec2(layerIndex, lane), vec2(7.0, 11.0))) * 73.0);
    vec2 particle = coord - (time + time * seed) * vec2(0.0, 1.0);
    particle -= floor(particle / cell + 0.5) * cell;

    float hue = fract(8663.0 * seed);
    vec3 streakColor = pickColor(hue);
    float shimmer = mix(1.5, 1.0 + sin(time + 7.0 * hue + 4.0), clamp(uTwinkle, 0.0, 1.0));
    shimmer *= 1.0 + mouseGlow * 2.0;

    vec2 inside = vec2(length(max(particle, vec2(-1.0, 0.0))), length(particle) - streakRadius) - streakRadius;
    vec2 streakShape = vec2(1.0) - smoothstep(-antiAlias, antiAlias, inside);
    glow += dot(streakShape, vec2(exp(tail * particle.y), 3.0)) * streakColor * shimmer;
    coord.x += cell.x / 8.0;
  }

  vec3 color = sqrt(toneCurve(max(glow * uGlow - vec3(0.04, 0.08, 0.02), vec3(0.0))));
  gl_FragColor = vec4(color, uOpacity);
}
`;

export function mountHomeLightfall(mount, options = {}) {
  if (!mount || typeof window === "undefined" || typeof document === "undefined") {
    return { container: mount ?? null, dispose() {} };
  }

  try {
    const instance = createHomeLightfall(mount, {
      ...DEFAULT_OPTIONS,
      ...options,
    });
    mount.dataset.lightfallState = "ready";
    return instance;
  } catch (error) {
    mount.dataset.lightfallState = "failed";
    console.warn("HomeLightfall failed to mount", error);
    return { container: mount, dispose() {} };
  }
}

function createHomeLightfall(mount, options) {
  const palette = preparePalette(options.colors);
  const renderer = new THREE.WebGLRenderer({
    alpha: true,
    antialias: false,
    powerPreference: "high-performance",
  });
  const pixelRatio = Math.min(
    Math.max(Number(options.dpr ?? window.devicePixelRatio ?? 1), 1),
    Math.max(Number(options.maxDpr ?? 1.35), 1),
  );
  const canvas = renderer.domElement;
  canvas.className = "home-lightfall-canvas";
  canvas.setAttribute("aria-hidden", "true");
  canvas.style.mixBlendMode = options.mixBlendMode || "";
  renderer.setPixelRatio(pixelRatio);
  renderer.setClearColor(0x000000, 0);
  mount.append(canvas);

  const uniforms = {
    iResolution: { value: new THREE.Vector3(1, 1, 1) },
    iMouse: { value: new THREE.Vector2(0.5, 0.55) },
    iTime: { value: 0 },
    uColor0: { value: palette.colors[0] },
    uColor1: { value: palette.colors[1] },
    uColor2: { value: palette.colors[2] },
    uColor3: { value: palette.colors[3] },
    uColor4: { value: palette.colors[4] },
    uColor5: { value: palette.colors[5] },
    uColor6: { value: palette.colors[6] },
    uColor7: { value: palette.colors[7] },
    uColorCount: { value: palette.count },
    uBgColor: { value: parseColor(options.backgroundColor) },
    uMouseColor: { value: palette.average },
    uSpeed: { value: Number(options.speed) || DEFAULT_OPTIONS.speed },
    uStreakCount: { value: clampInteger(options.streakCount, 1, 16, DEFAULT_OPTIONS.streakCount) },
    uStreakWidth: { value: Math.max(Number(options.streakWidth) || DEFAULT_OPTIONS.streakWidth, 0.05) },
    uStreakLength: { value: Math.max(Number(options.streakLength) || DEFAULT_OPTIONS.streakLength, 0.05) },
    uGlow: { value: Math.max(Number(options.glow) || DEFAULT_OPTIONS.glow, 0) },
    uDensity: { value: Math.max(Number(options.density) || DEFAULT_OPTIONS.density, 0.05) },
    uTwinkle: { value: Math.max(Number(options.twinkle) || DEFAULT_OPTIONS.twinkle, 0) },
    uZoom: { value: Math.max(Number(options.zoom) || DEFAULT_OPTIONS.zoom, 0.1) },
    uBgGlow: { value: Math.max(Number(options.backgroundGlow) || DEFAULT_OPTIONS.backgroundGlow, 0) },
    uOpacity: { value: Math.max(Math.min(Number(options.opacity) || DEFAULT_OPTIONS.opacity, 1), 0) },
    uMouseEnabled: { value: options.mouseInteraction === false ? 0 : 1 },
    uMouseStrength: { value: Math.max(Number(options.mouseStrength) || DEFAULT_OPTIONS.mouseStrength, 0) },
    uMouseRadius: { value: Math.max(Number(options.mouseRadius) || DEFAULT_OPTIONS.mouseRadius, 0.01) },
  };

  const scene = new THREE.Scene();
  const camera = new THREE.Camera();
  const geometry = new THREE.PlaneGeometry(2, 2);
  const material = new THREE.RawShaderMaterial({
    vertexShader: VERTEX_SHADER,
    fragmentShader: FRAGMENT_SHADER,
    uniforms,
    transparent: true,
    depthWrite: false,
    depthTest: false,
  });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);

  const mouseTarget = new THREE.Vector2(0.5, 0.55);
  const mouseCurrent = new THREE.Vector2(0.5, 0.55);
  const reducedMotion = window.matchMedia?.("(prefers-reduced-motion: reduce)")?.matches ?? false;
  let frameId = null;
  let resizeFrameId = null;
  let running = false;
  let visible = true;
  let lastFrame = performance.now();

  const resize = () => {
    const rect = mount.getBoundingClientRect();
    const width = Math.max(1, Math.floor(rect.width));
    const height = Math.max(1, Math.floor(rect.height));
    renderer.setSize(width, height, false);
    uniforms.iResolution.value.set(canvas.width, canvas.height, 1);
    if (mouseTarget.x <= 1 && mouseTarget.y <= 1) {
      mouseTarget.set(canvas.width * 0.5, canvas.height * 0.55);
      mouseCurrent.copy(mouseTarget);
      uniforms.iMouse.value.copy(mouseCurrent);
    }
    renderFrame(performance.now());
  };

  const scheduleResize = () => {
    if (resizeFrameId) {
      window.cancelAnimationFrame(resizeFrameId);
    }
    resizeFrameId = window.requestAnimationFrame(() => {
      resizeFrameId = null;
      resize();
    });
  };

  const updatePointer = (clientX, clientY) => {
    if (!options.mouseInteraction) return;
    const rect = mount.getBoundingClientRect();
    if (!rect.width || !rect.height) return;
    if (clientX < rect.left || clientX > rect.right || clientY < rect.top || clientY > rect.bottom) {
      return;
    }
    const scaleX = canvas.width / rect.width;
    const scaleY = canvas.height / rect.height;
    mouseTarget.set((clientX - rect.left) * scaleX, (rect.height - (clientY - rect.top)) * scaleY);
  };

  const onPointerMove = (event) => {
    updatePointer(event.clientX, event.clientY);
  };

  const onTouchMove = (event) => {
    if (event.touches.length !== 1) return;
    const touch = event.touches[0];
    updatePointer(touch.clientX, touch.clientY);
  };

  const renderFrame = (now) => {
    const dt = Math.min(Math.max((now - lastFrame) / 1000, 0), 0.1);
    lastFrame = now;
    uniforms.iTime.value = now * 0.001;
    if (options.mouseDampening <= 0) {
      mouseCurrent.copy(mouseTarget);
    } else {
      const factor = 1 - Math.exp(-dt / Math.max(options.mouseDampening, 0.001));
      mouseCurrent.lerp(mouseTarget, Math.min(factor, 1));
    }
    uniforms.iMouse.value.copy(mouseCurrent);
    renderer.render(scene, camera);
  };

  const loop = (now) => {
    if (!running) return;
    renderFrame(now);
    frameId = window.requestAnimationFrame(loop);
  };

  const start = () => {
    if (running || reducedMotion || !visible || document.hidden) return;
    running = true;
    lastFrame = performance.now();
    frameId = window.requestAnimationFrame(loop);
  };

  const pause = () => {
    running = false;
    if (frameId) {
      window.cancelAnimationFrame(frameId);
      frameId = null;
    }
  };

  const onVisibilityChange = () => {
    if (document.hidden) {
      pause();
    } else {
      start();
    }
  };

  const onContextLost = (event) => {
    event.preventDefault();
    mount.dataset.lightfallState = "failed";
    pause();
  };

  window.addEventListener("pointermove", onPointerMove);
  window.addEventListener("touchmove", onTouchMove, { passive: true });
  document.addEventListener("visibilitychange", onVisibilityChange);
  canvas.addEventListener("webglcontextlost", onContextLost);

  let resizeObserver = null;
  if ("ResizeObserver" in window) {
    resizeObserver = new ResizeObserver(scheduleResize);
    resizeObserver.observe(mount);
  }

  let intersectionObserver = null;
  if ("IntersectionObserver" in window) {
    intersectionObserver = new IntersectionObserver(
      (entries) => {
        visible = entries.some((entry) => entry.isIntersecting && entry.intersectionRatio > 0);
        if (visible) {
          start();
          renderFrame(performance.now());
        } else {
          pause();
        }
      },
      { threshold: [0, 0.01, 0.1] },
    );
    intersectionObserver.observe(mount);
  }

  resize();
  if (reducedMotion) {
    renderFrame(performance.now());
  } else {
    start();
  }

  return {
    container: mount,
    dispose() {
      pause();
      if (resizeFrameId) {
        window.cancelAnimationFrame(resizeFrameId);
      }
      if (resizeObserver) {
        resizeObserver.disconnect();
      }
      if (intersectionObserver) {
        intersectionObserver.disconnect();
      }
      window.removeEventListener("pointermove", onPointerMove);
      window.removeEventListener("touchmove", onTouchMove);
      document.removeEventListener("visibilitychange", onVisibilityChange);
      canvas.removeEventListener("webglcontextlost", onContextLost);
      scene.remove(mesh);
      geometry.dispose();
      material.dispose();
      renderer.dispose();
      renderer.forceContextLoss();
      if (canvas.parentNode) {
        canvas.parentNode.removeChild(canvas);
      }
    },
  };
}

function preparePalette(input) {
  const source = Array.isArray(input) && input.length ? input.slice(0, MAX_COLORS) : DEFAULT_OPTIONS.colors;
  const colors = source.map(parseColor);
  const count = colors.length;
  const average = new THREE.Vector3(0, 0, 0);
  for (const color of colors) {
    average.add(color);
  }
  average.divideScalar(Math.max(count, 1));
  while (colors.length < MAX_COLORS) {
    colors.push(colors[colors.length - 1]?.clone?.() ?? new THREE.Vector3(1, 1, 1));
  }
  return { colors, count, average };
}

function parseColor(value) {
  try {
    const color = new THREE.Color(String(value || "#ffffff"));
    return new THREE.Vector3(color.r, color.g, color.b);
  } catch {
    return new THREE.Vector3(1, 1, 1);
  }
}

function clampInteger(value, min, max, fallback) {
  const number = Number(value);
  if (!Number.isFinite(number)) return fallback;
  return Math.min(max, Math.max(min, Math.round(number)));
}
