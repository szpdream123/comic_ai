const MASCOT_BUTTON_SELECTOR = '[aria-label^="打开画布助手"]';
export const AI_CANVAS_MASCOT_SKINS = ["cloud", "cat", "dog", "bunny", "fox", "puff"];
export const AI_CANVAS_MASCOT_DEFAULT_SKIN = "cloud";
const SKIN_LABELS = {
  cloud: "云朵",
  cat: "猫咪",
  dog: "小狗",
  bunny: "兔子",
  fox: "狐狸",
  puff: "绒毛",
};
const SKIN_SHAPE = {
  cloud: 0,
  cat: 1,
  dog: 2,
  bunny: 3,
  fox: 4,
};
const SKIN_BODY = {
  cloud: [0.90, 0.93, 0.99],
  cat: [0.98, 0.86, 0.62],
  dog: [0.82, 0.64, 0.42],
  bunny: [0.97, 0.90, 0.92],
  fox: [0.93, 0.55, 0.28],
};

export function normalizeAiCanvasRuntimeMascotSkin(value) {
  const skin = String(value ?? "").trim();
  return AI_CANVAS_MASCOT_SKINS.includes(skin) ? skin : AI_CANVAS_MASCOT_DEFAULT_SKIN;
}

export function nextAiCanvasRuntimeMascotSkin(value) {
  const skins = AI_CANVAS_MASCOT_SKINS;
  const current = normalizeAiCanvasRuntimeMascotSkin(value);
  return skins[(skins.indexOf(current) + 1) % skins.length];
}

const VERTEX_SHADER = `
attribute vec2 aPos;
varying vec2 vUv;
void main() {
  vUv = aPos * 0.5 + 0.5;
  gl_Position = vec4(aPos, 0.0, 1.0);
}
`;

const FRAGMENT_SHADER = `
precision highp float;
varying vec2 vUv;
uniform vec2 uResolution;
uniform float uTime;
uniform vec2 uLook;
uniform float uBlink;
uniform float uTheme;
uniform vec3 uAccent;
uniform vec3 uBody;
uniform float uShape;

float sdSphere(vec3 p, float r) {
  return length(p) - r;
}

float sdEllipsoid(vec3 p, vec3 r) {
  float k0 = length(p / r);
  float k1 = length(p / (r * r));
  return k0 * (k0 - 1.0) / max(k1, 0.001);
}

float sdCapsule(vec3 p, vec3 a, vec3 b, float r) {
  vec3 pa = p - a;
  vec3 ba = b - a;
  float h = clamp(dot(pa, ba) / dot(ba, ba), 0.0, 1.0);
  return length(pa - ba * h) - r;
}

float smin(float a, float b, float k) {
  float h = clamp(0.5 + 0.5 * (b - a) / k, 0.0, 1.0);
  return mix(b, a, h) - k * h * (1.0 - h);
}

mat2 rot(float a) {
  float c = cos(a);
  float s = sin(a);
  return mat2(c, -s, s, c);
}

float cloudMap(vec3 p) {
  p.y -= sin(uTime * 1.2) * 0.03;
  float d = sdEllipsoid(p - vec3(0.0, -0.08, 0.02), vec3(0.62, 0.28, 0.34));
  d = smin(d, sdSphere(p - vec3(-0.34, 0.08, 0.04), 0.34), 0.14);
  d = smin(d, sdSphere(p - vec3(0.32, 0.06, 0.03), 0.32), 0.14);
  d = smin(d, sdSphere(p - vec3(0.0, 0.24, 0.0), 0.36), 0.16);
  d = smin(d, sdSphere(p - vec3(0.18, 0.16, -0.04), 0.26), 0.12);
  return d;
}

float catMap(vec3 p) {
  float d = sdSphere(p - vec3(0.0, -0.04, 0.02), 0.46);
  d = smin(d, sdEllipsoid(p - vec3(-0.24, 0.36, 0.0), vec3(0.13, 0.24, 0.09)), 0.05);
  d = smin(d, sdEllipsoid(p - vec3(0.24, 0.36, 0.0), vec3(0.13, 0.24, 0.09)), 0.05);
  d = smin(d, sdSphere(p - vec3(-0.22, -0.04, 0.16), 0.18), 0.08);
  d = smin(d, sdSphere(p - vec3(0.22, -0.04, 0.16), 0.18), 0.08);
  return d;
}

float dogMap(vec3 p) {
  float d = sdEllipsoid(p - vec3(0.0, 0.0, 0.0), vec3(0.42, 0.38, 0.40));
  d = smin(d, sdEllipsoid(p - vec3(0.0, -0.08, 0.32), vec3(0.20, 0.16, 0.24)), 0.07);
  d = smin(d, sdEllipsoid(p - vec3(-0.36, -0.02, -0.02), vec3(0.16, 0.26, 0.09)), 0.06);
  d = smin(d, sdEllipsoid(p - vec3(0.36, -0.02, -0.02), vec3(0.16, 0.26, 0.09)), 0.06);
  return d;
}

float bunnyMap(vec3 p) {
  float d = sdSphere(p - vec3(0.0, -0.10, 0.02), 0.40);
  d = smin(d, sdCapsule(p, vec3(-0.13, 0.16, -0.02), vec3(-0.18, 0.68, -0.06), 0.09), 0.05);
  d = smin(d, sdCapsule(p, vec3(0.13, 0.16, -0.02), vec3(0.20, 0.66, -0.06), 0.09), 0.05);
  d = smin(d, sdSphere(p - vec3(0.0, -0.18, 0.28), 0.13), 0.06);
  return d;
}

float foxMap(vec3 p) {
  float d = sdSphere(p - vec3(0.0, -0.02, 0.0), 0.40);
  d = smin(d, sdEllipsoid(p - vec3(0.0, -0.08, 0.36), vec3(0.16, 0.12, 0.30)), 0.06);
  d = smin(d, sdEllipsoid(p - vec3(-0.24, 0.34, 0.0), vec3(0.11, 0.24, 0.08)), 0.04);
  d = smin(d, sdEllipsoid(p - vec3(0.24, 0.34, 0.0), vec3(0.11, 0.24, 0.08)), 0.04);
  return d;
}

float mapShape(vec3 p) {
  if (uShape < 0.5) return cloudMap(p);
  if (uShape < 1.5) return catMap(p);
  if (uShape < 2.5) return dogMap(p);
  if (uShape < 3.5) return bunnyMap(p);
  return foxMap(p);
}

float mapScene(vec3 p) {
  vec3 q = p;
  q.yz *= rot(-0.16 + uLook.y);
  q.xz *= rot(uLook.x);
  return mapShape(q);
}

vec3 calcNormal(vec3 p) {
  vec2 e = vec2(0.0032, 0.0);
  return normalize(vec3(
    mapScene(p + e.xyy) - mapScene(p - e.xyy),
    mapScene(p + e.yxy) - mapScene(p - e.yxy),
    mapScene(p + e.yyx) - mapScene(p - e.yyx)
  ));
}

void main() {
  vec2 uv = (vUv * 2.0 - 1.0);
  uv.x *= uResolution.x / max(uResolution.y, 1.0);
  vec3 ro = vec3(0.0, 0.03, 1.68);
  vec3 rd = normalize(vec3(uv * 0.76, -1.32));
  float t = 0.0;
  float hit = 0.0;
  vec3 p = ro;
  for (int i = 0; i < 56; i++) {
    p = ro + rd * t;
    float d = mapScene(p);
    if (d < 0.002) {
      hit = 1.0;
      break;
    }
    t += max(d, 0.01);
    if (t > 4.0) break;
  }
  if (hit < 0.5) {
    gl_FragColor = vec4(0.0);
    return;
  }

  vec3 n = calcNormal(p);
  vec3 light = normalize(vec3(-0.42, 0.74, 0.82));
  float wrap = clamp(dot(n, light) * 0.55 + 0.45, 0.0, 1.0);
  float rim = pow(1.0 - clamp(dot(n, -rd), 0.0, 1.0), 2.35);
  float spec = pow(clamp(dot(reflect(-light, n), -rd), 0.0, 1.0), 26.0);
  vec3 body = mix(uBody * 0.92, uBody, 0.66 + 0.34 * uTheme);
  vec3 col = body * (0.52 + 0.48 * wrap);
  col += vec3(1.0) * spec * (uShape < 0.5 ? 0.10 : 0.16);
  col += mix(vec3(0.68, 0.78, 1.0), vec3(0.86, 0.92, 1.0), uTheme) * rim * (uShape < 0.5 ? 0.18 : 0.26);
  col += uAccent * (0.08 + rim * 0.16);

  vec3 lp = p;
  lp.yz *= rot(-0.16 + uLook.y);
  lp.xz *= rot(uLook.x);
  if (uShape < 0.5) lp.y -= sin(uTime * 1.2) * 0.03;
  float open = mix(0.16, 1.0, clamp(uBlink, 0.0, 1.0));
  vec2 eyeC = vec2(0.16, 0.06);
  float eyeR = 0.075;
  if (uShape < 0.5) {
    eyeC = vec2(0.14, 0.02);
    eyeR = 0.086;
  } else if (uShape > 2.5 && uShape < 3.5) {
    eyeC = vec2(0.13, -0.02);
    eyeR = 0.07;
  }
  vec2 qL = vec2(lp.x + eyeC.x, (lp.y - eyeC.y) / open);
  vec2 qR = vec2(lp.x - eyeC.x, (lp.y - eyeC.y) / open);
  float facing = smoothstep(0.02, 0.18, lp.z);
  float eL = length(qL) - eyeR;
  float eR = length(qR) - eyeR;
  float eyeMask = (1.0 - smoothstep(-0.01, 0.018, min(eL, eR))) * facing;
  if (eyeMask > 0.02) {
    vec3 eyeCol = mix(vec3(0.10, 0.12, 0.20), vec3(0.07, 0.08, 0.13), uTheme);
    vec2 hl = eL < eR ? qL : qR;
    float spark = smoothstep(0.028, 0.004, length(hl - vec2(-0.018, 0.02)));
    col = mix(col, eyeCol, eyeMask);
    col += vec3(1.0) * spark * eyeMask * 0.95;
  }

  gl_FragColor = vec4(col, 1.0);
}
`;

function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

function createMascotSkinRenderer(canvas) {
  const gl = canvas.getContext("webgl", {
    alpha: true,
    antialias: true,
    premultipliedAlpha: false,
    depth: false,
    stencil: false,
  });
  if (!gl) return null;
  const vertex = compileShader(gl, gl.VERTEX_SHADER, VERTEX_SHADER);
  const fragment = compileShader(gl, gl.FRAGMENT_SHADER, FRAGMENT_SHADER);
  if (!vertex || !fragment) return null;
  const program = gl.createProgram();
  gl.attachShader(program, vertex);
  gl.attachShader(program, fragment);
  gl.bindAttribLocation(program, 0, "aPos");
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) return null;
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, new Float32Array([-1, -1, 3, -1, -1, 3]), gl.STATIC_DRAW);
  gl.enable(gl.BLEND);
  gl.blendFunc(gl.SRC_ALPHA, gl.ONE_MINUS_SRC_ALPHA);
  const uniforms = {
    resolution: gl.getUniformLocation(program, "uResolution"),
    time: gl.getUniformLocation(program, "uTime"),
    look: gl.getUniformLocation(program, "uLook"),
    blink: gl.getUniformLocation(program, "uBlink"),
    theme: gl.getUniformLocation(program, "uTheme"),
    accent: gl.getUniformLocation(program, "uAccent"),
    body: gl.getUniformLocation(program, "uBody"),
    shape: gl.getUniformLocation(program, "uShape"),
  };
  const look = { x: 0, y: 0 };
  const targetLook = { x: 0, y: 0 };
  let theme = 0;
  let accent = [0.49, 0.65, 1];
  let body = SKIN_BODY.cloud;
  let shape = 0;
  let blink = 1;
  let blinkUntil = 0;
  let nextBlink = 1800;
  let disposed = false;

  const render = (now) => {
    if (disposed) return;
    const width = Math.max(1, canvas.width);
    const height = Math.max(1, canvas.height);
    look.x += (targetLook.x - look.x) * 0.12;
    look.y += (targetLook.y - look.y) * 0.12;
    if (now >= nextBlink) {
      blinkUntil = now + 120;
      nextBlink = now + 2200 + Math.random() * 1800;
    }
    blink += ((now < blinkUntil ? 0.12 : 1) - blink) * 0.28;
    gl.viewport(0, 0, width, height);
    gl.clearColor(0, 0, 0, 0);
    gl.clear(gl.COLOR_BUFFER_BIT);
    gl.useProgram(program);
    gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
    gl.enableVertexAttribArray(0);
    gl.vertexAttribPointer(0, 2, gl.FLOAT, false, 0, 0);
    gl.uniform2f(uniforms.resolution, width, height);
    gl.uniform1f(uniforms.time, now * 0.001);
    gl.uniform2f(uniforms.look, look.x, look.y);
    gl.uniform1f(uniforms.blink, blink);
    gl.uniform1f(uniforms.theme, theme);
    gl.uniform3f(uniforms.accent, accent[0], accent[1], accent[2]);
    gl.uniform3f(uniforms.body, body[0], body[1], body[2]);
    gl.uniform1f(uniforms.shape, shape);
    gl.drawArrays(gl.TRIANGLES, 0, 3);
  };

  return {
    setLook(x, y) {
      targetLook.x = x;
      targetLook.y = y;
    },
    setTheme(next) {
      theme = next === "light" ? 1 : 0;
    },
    setStatus(status) {
      if (status === "thinking") accent = [0.49, 0.65, 1];
      else if (status === "success") accent = [0.34, 0.78, 0.64];
      else if (status === "error") accent = [0.85, 0.51, 0.57];
      else accent = [0.49, 0.65, 1];
    },
    setSkin(skin) {
      const next = normalizeAiCanvasRuntimeMascotSkin(skin);
      shape = SKIN_SHAPE[next] ?? 0;
      body = SKIN_BODY[next] ?? SKIN_BODY.cloud;
    },
    render,
    dispose() {
      disposed = true;
      gl.deleteBuffer(buffer);
      gl.deleteProgram(program);
      gl.deleteShader(vertex);
      gl.deleteShader(fragment);
    },
  };
}

function mascotStatusFromLabel(label) {
  const value = String(label ?? "");
  if (value.includes("思考")) return "thinking";
  if (value.includes("完成")) return "success";
  if (value.includes("失败")) return "error";
  return "idle";
}

function readDocumentTheme(doc) {
  return doc?.documentElement?.getAttribute?.("data-theme") === "light" ? "light" : "dark";
}

function resolveMascotWrap(button) {
  return button?.parentElement?.parentElement ?? button?.parentElement ?? null;
}

function isCustomMascotSkin(skin) {
  return normalizeAiCanvasRuntimeMascotSkin(skin) !== "puff";
}

function isCanvasInteracting(doc) {
  return doc?.documentElement?.classList?.contains("canvas-interacting") === true;
}

const LINGXI_MARK_TEXT = "灵曦";
let lingxiMarkSeq = 0;

function mascotAvatarMarkup(id = "host-lingxi-mark") {
  return `
    <defs>
      <mask id="${id}">
        <rect width="64" height="22" fill="black"></rect>
        <text class="host-lingxi-glyph" x="32" y="16.6" text-anchor="middle" font-size="15" font-weight="800" font-family="Microsoft YaHei, PingFang SC, sans-serif">${LINGXI_MARK_TEXT}</text>
      </mask>
    </defs>
    <g mask="url(#${id})">
      <rect class="host-lingxi-ink" width="64" height="22"></rect>
      <rect class="host-lingxi-water" x="-28" y="0" width="26" height="22"></rect>
    </g>
  `;
}

function createMascotAvatarIcon(doc, skin) {
  const svg = doc.createElementNS("http://www.w3.org/2000/svg", "svg");
  svg.setAttribute("viewBox", "0 0 64 22");
  svg.setAttribute("aria-hidden", "true");
  svg.setAttribute("focusable", "false");
  svg.classList.add("host-mascot-avatar-icon", "host-lingxi-mark");
  svg.setAttribute("data-host-lingxi-mark", "true");
  svg.innerHTML = mascotAvatarMarkup(`host-lingxi-${++lingxiMarkSeq}`);
  return svg;
}

function isNativeMascotAvatar(node) {
  return node?.getAttribute?.("viewBox") === "0 0 32 32"
    && Boolean(node.querySelector?.("radialGradient[id^='mascot-avatar-']"));
}

function findMascotAvatarHosts(root) {
  return Array.from(root.querySelectorAll?.("svg[viewBox='0 0 32 32']") ?? [])
    .filter((node) => isNativeMascotAvatar(node) || node.classList?.contains("host-mascot-avatar-icon"));
}

function isHostMascotNode(node) {
  if (!node || node.nodeType !== 1) return false;
  return Boolean(
    node.classList?.contains("host-mascot-cloud-layer")
    || node.classList?.contains("host-mascot-skin-switch")
    || node.classList?.contains("host-mascot-avatar-icon")
    || node.dataset?.hostMascotCloud
    || node.dataset?.hostMascotSkinSwitch
    || node.dataset?.hostMascotNativeHidden
    || node.closest?.(".host-mascot-cloud-layer, .host-mascot-skin-switch, .host-mascot-avatar-icon"),
  );
}

function isHostMascotMutation(record) {
  if (isHostMascotNode(record.target)) return true;
  const nodes = [...(record.addedNodes ?? []), ...(record.removedNodes ?? [])];
  return nodes.length > 0 && nodes.every(isHostMascotNode);
}

function applyMascotAvatarIcon(node, skin, doc) {
  if (!node) return;
  const icon = node.classList?.contains("host-mascot-avatar-icon")
    ? node
    : node.parentElement?.querySelector?.(":scope > .host-mascot-avatar-icon");
  if (icon) {
    if (node !== icon && isNativeMascotAvatar(node)) {
      node.setAttribute("data-host-mascot-native-hidden", "true");
      node.setAttribute("hidden", "");
    }
    icon.classList.add("host-lingxi-mark");
    icon.setAttribute("data-host-lingxi-mark", "true");
    icon.setAttribute("viewBox", "0 0 64 22");
    if (icon.getAttribute("data-host-lingxi-ready") !== "1") {
      icon.innerHTML = mascotAvatarMarkup(`host-lingxi-${++lingxiMarkSeq}`);
      icon.setAttribute("data-host-lingxi-ready", "1");
    }
    if (icon.getAttribute("data-host-mascot-skin") === skin) return;
    icon.setAttribute("data-host-mascot-skin", skin);
    icon.innerHTML = createMascotAvatarIcon(doc, skin).innerHTML;
    return;
  }
  if (!isNativeMascotAvatar(node)) return;
  const next = createMascotAvatarIcon(doc, skin);
  const width = node.getAttribute("width");
  const height = node.getAttribute("height");
  if (width) next.setAttribute("width", width);
  if (height) next.setAttribute("height", height);
  next.setAttribute("class", `${node.getAttribute("class") || ""} host-mascot-avatar-icon host-lingxi-mark`.trim());
  next.setAttribute("data-host-mascot-skin", skin);
  node.setAttribute("data-host-mascot-native-hidden", "true");
  node.setAttribute("hidden", "");
  node.after(next);
}

function restoreMascotAvatarIcon(node) {
  node?.parentElement?.querySelectorAll?.(":scope > .host-mascot-avatar-icon").forEach((child) => child.remove());
  if (node?.hasAttribute?.("data-host-mascot-native-hidden")) {
    node.removeAttribute("data-host-mascot-native-hidden");
    node.removeAttribute("hidden");
  }
}

export function installAiCanvasRuntimeMascotSkinSwitcher(surface, options = {}) {
  const root = surface?.querySelector?.(".new-canvas-root") ?? surface;
  const doc = surface?.ownerDocument ?? globalThis.document;
  if (!root || !doc?.createElement || typeof MutationObserver !== "function") return () => {};

  const readSkin = typeof options.readSkin === "function" ? options.readSkin : () => AI_CANVAS_MASCOT_DEFAULT_SKIN;
  const persistSkin = typeof options.persistSkin === "function" ? options.persistSkin : () => {};
  const readVisible = typeof options.readVisible === "function" ? options.readVisible : () => true;
  const readRunning = typeof options.readRunning === "function" ? options.readRunning : () => false;

  let disposed = false;
  let nesting = false;
  let pendingSync = false;
  let skin = normalizeAiCanvasRuntimeMascotSkin(readSkin());
  let visible = readVisible() !== false;
  let taskRunning = readRunning() === true;
  let raf = 0;
  let renderer = null;
  let lastPointer = null;

  const overlay = doc.createElement("div");
  overlay.className = "host-mascot-cloud-layer";
  overlay.dataset.hostMascotCloud = "true";
  overlay.setAttribute("aria-hidden", "true");
  const canvas = doc.createElement("canvas");
  canvas.dataset.hostMascotCloudCanvas = "true";
  overlay.append(canvas);

  const switcher = doc.createElement("button");
  switcher.type = "button";
  switcher.className = "host-mascot-skin-switch";
  switcher.dataset.hostMascotSkinSwitch = "true";
  switcher.textContent = "切换桌宠";
  switcher.setAttribute("aria-label", "切换桌宠");

  const syncSwitcherLabel = () => {
    const next = nextAiCanvasRuntimeMascotSkin(skin);
    switcher.title = `切换桌宠（下一个：${SKIN_LABELS[next]}）`;
  };

  const isMascotVisible = () => visible !== false;

  const ensureRenderer = () => {
    if (!isMascotVisible() || !isCustomMascotSkin(skin)) return null;
    if (!renderer) renderer = createMascotSkinRenderer(canvas);
    renderer?.setSkin?.(skin);
    return renderer;
  };

  const releaseRenderer = () => {
    stopLoop();
    renderer?.dispose?.();
    renderer = null;
  };

  const stopLoop = () => {
    if (!raf) return;
    globalThis.cancelAnimationFrame?.(raf);
    raf = 0;
  };

  const applyChatAvatars = () => {
    if (root.getAttribute("data-host-mascot-skin") !== skin) {
      root.setAttribute("data-host-mascot-skin", skin);
    }
    findMascotAvatarHosts(root).forEach((node) => applyMascotAvatarIcon(node, skin, doc));
    root.querySelectorAll?.(".host-lingxi-mark").forEach((icon) => {
      icon.classList.toggle("is-running", taskRunning);
    });
  };

  const applySkin = (wrap, button) => {
    const custom = isMascotVisible() && isCustomMascotSkin(skin) && Boolean(ensureRenderer());
    const nextSkin = custom ? skin : "puff";
    if (wrap?.getAttribute?.("data-host-mascot-skin") !== nextSkin) {
      wrap?.setAttribute?.("data-host-mascot-skin", nextSkin);
    }
    if (button?.getAttribute?.("data-host-mascot-skin") !== nextSkin) {
      button?.setAttribute?.("data-host-mascot-skin", nextSkin);
    }
    overlay.hidden = !custom;
    applyChatAvatars();
    if (!custom) releaseRenderer();
  };

  const attach = (wrap) => {
    if (!wrap) return;
    if (overlay.parentElement !== wrap) wrap.append(overlay);
    if (switcher.parentElement !== wrap) wrap.append(switcher);
  };

  const renderFrame = (now) => {
    if (disposed || !isMascotVisible() || !isCustomMascotSkin(skin) || !renderer) {
      if (!isMascotVisible()) releaseRenderer();
      else stopLoop();
      return;
    }
    if (isCanvasInteracting(doc)) {
      raf = globalThis.requestAnimationFrame?.(loop) ?? 0;
      return;
    }
    const button = root.querySelector?.(MASCOT_BUTTON_SELECTOR);
    const wrap = resolveMascotWrap(button);
    if (!button || !wrap) return;
    const rect = wrap.getBoundingClientRect();
    const dpr = Math.min(globalThis.devicePixelRatio || 1, 2);
    const width = Math.max(1, Math.round(rect.width * 1.28 * dpr));
    const height = Math.max(1, Math.round(rect.height * 1.28 * dpr));
    if (canvas.width !== width) canvas.width = width;
    if (canvas.height !== height) canvas.height = height;
    const cx = rect.left + rect.width / 2;
    const cy = rect.top + rect.height / 2;
    renderer.setLook(
      lastPointer ? Math.max(-0.42, Math.min(0.42, (lastPointer.x - cx) / Math.max(rect.width, 1) * 0.55)) : 0,
      lastPointer ? Math.max(-0.28, Math.min(0.28, (cy - lastPointer.y) / Math.max(rect.height, 1) * 0.4)) : 0,
    );
    renderer.setTheme(readDocumentTheme(doc));
    renderer.setStatus(mascotStatusFromLabel(button.getAttribute("aria-label")));
    renderer.setSkin(skin);
    renderer.render(now);
    raf = globalThis.requestAnimationFrame?.(loop) ?? 0;
  };

  const loop = (now) => {
    raf = 0;
    renderFrame(now);
  };

  const startLoop = () => {
    if (disposed || raf || !isMascotVisible() || !isCustomMascotSkin(skin) || !renderer) return;
    raf = globalThis.requestAnimationFrame?.(loop) ?? 0;
  };

  const observer = new MutationObserver((records) => {
    if (disposed || nesting || isCanvasInteracting(doc)) return;
    if (records.every(isHostMascotMutation)) return;
    scheduleSync();
  });

  const detach = () => {
    overlay.remove();
    switcher.remove();
    releaseRenderer();
  };

  const sync = () => {
    if (disposed || nesting) return;
    const button = root.querySelector?.(MASCOT_BUTTON_SELECTOR);
    const wrap = resolveMascotWrap(button);
    if (!isMascotVisible() || !button || !wrap) {
      nesting = true;
      observer.disconnect();
      try {
        detach();
        applyChatAvatars();
      } finally {
        nesting = false;
        if (!disposed) observer.observe(root, { childList: true, subtree: true });
      }
      return;
    }
    nesting = true;
    observer.disconnect();
    try {
      attach(wrap);
      applySkin(wrap, button);
      syncSwitcherLabel();
      startLoop();
    } finally {
      nesting = false;
      if (!disposed) observer.observe(root, { childList: true, subtree: true });
    }
  };

  const scheduleSync = () => {
    if (disposed || nesting || pendingSync) return;
    pendingSync = true;
    const run = () => {
      pendingSync = false;
      sync();
    };
    if (typeof globalThis.queueMicrotask === "function") globalThis.queueMicrotask(run);
    else run();
  };

  const onPointerMove = (event) => {
    if (isCanvasInteracting(doc)) return;
    lastPointer = { x: event.clientX, y: event.clientY };
  };

  const isSwitcherEvent = (event) => event.target === switcher || switcher.contains?.(event.target);

  const onSwitcherPointerDown = (event) => {
    if (!isSwitcherEvent(event)) return;
    event.stopPropagation();
    event.stopImmediatePropagation?.();
  };

  let lastCycleAt = 0;
  const cycleSkin = (event) => {
    event.preventDefault();
    event.stopPropagation();
    event.stopImmediatePropagation?.();
    const now = Date.now();
    if (now - lastCycleAt < 250) return;
    lastCycleAt = now;
    skin = nextAiCanvasRuntimeMascotSkin(skin);
    persistSkin(skin);
    sync();
  };

  switcher.addEventListener("click", cycleSkin);
  switcher.addEventListener("pointerup", (event) => {
    if (event.button !== 0) return;
    cycleSkin(event);
  });

  syncSwitcherLabel();
  const unsubscribeRunning = typeof options.subscribe === "function"
    ? options.subscribe(() => {
      if (disposed) return;
      const next = readRunning() === true;
      if (next === taskRunning) return;
      taskRunning = next;
      scheduleSync();
    }) ?? (() => {})
    : () => {};
  observer.observe(root, { childList: true, subtree: true });
  doc.addEventListener?.("pointermove", onPointerMove, { passive: true });
  doc.addEventListener?.("pointerdown", onSwitcherPointerDown, true);
  sync();

  const dispose = () => {
    disposed = true;
    observer.disconnect();
    unsubscribeRunning?.();
    stopLoop();
    doc.removeEventListener?.("pointermove", onPointerMove);
    doc.removeEventListener?.("pointerdown", onSwitcherPointerDown, true);
    releaseRenderer();
    overlay.remove();
    switcher.remove();
    root.querySelectorAll?.("[data-host-mascot-skin]").forEach((node) => {
      node.removeAttribute("data-host-mascot-skin");
    });
    findMascotAvatarHosts(root).forEach((node) => restoreMascotAvatarIcon(node));
    root.querySelectorAll?.(".host-mascot-avatar-icon").forEach((node) => node.remove());
  };
  dispose.setVisible = (nextVisible) => {
    const next = nextVisible !== false;
    if (visible === next) return;
    visible = next;
    sync();
  };
  return dispose;
}
