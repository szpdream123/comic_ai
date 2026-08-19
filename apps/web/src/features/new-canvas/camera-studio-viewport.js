let threePromise = null;

const CAMERA_RADIUS = 2.35;
const LIGHT_RADIUS = 2.25;

export function createCanvasCameraStudioViewportController({
  surface,
  onCameraChange = () => {},
  onLightChange = () => {},
  loadThree = () => {
    threePromise ??= import("/vendor/three.module.js?camera-studio=1");
    return threePromise;
  },
} = {}) {
  const instances = new Map();
  let state = normalizeStudioState();
  let disposed = false;

  const bind = async (nextState) => {
    if (nextState) state = normalizeStudioState(nextState, state);
    if (disposed || !surface?.querySelectorAll) return false;

    const roots = new Set(surface.querySelectorAll("[data-camera-studio-viewport]"));
    for (const [root, instance] of instances) {
      if (!roots.has(root) || !root.isConnected) {
        instance.dispose();
        instances.delete(root);
      }
    }

    for (const root of roots) {
      const rootState = normalizeStudioState(readCameraStudioViewportState(root), state);
      state = rootState;
      const existing = instances.get(root);
      if (existing) {
        existing.update(rootState);
        continue;
      }

      const pending = createPendingInstance(rootState);
      instances.set(root, pending);
      try {
        const THREE = await loadThree();
        if (disposed || instances.get(root) !== pending || !root.isConnected) continue;
        const instance = mountCameraStudioViewport(root, {
          THREE,
          ...pending.state,
          onCameraChange: (patch) => onCameraChange(patch),
          onLightChange: (patch) => onLightChange(patch),
        });
        instances.set(root, instance);
      } catch {
        if (instances.get(root) === pending) {
          root.classList?.add?.("is-three-fallback");
          instances.delete(root);
        }
      }
    }
    return true;
  };

  return {
    bind,
    update(nextState = {}) {
      state = normalizeStudioState(nextState, state);
      for (const instance of instances.values()) instance.update(state);
    },
    dispose() {
      if (disposed) return;
      disposed = true;
      for (const instance of instances.values()) instance.dispose();
      instances.clear();
    },
  };
}

export function mountCameraStudioViewport(root, options = {}) {
  const THREE = options.THREE;
  if (!root || !THREE) throw new Error("camera_studio_viewport_mount_invalid");

  const canvas = root.querySelector?.("[data-camera-studio-canvas]")
    ?? root.querySelector?.("canvas")
    ?? createCanvas(root);
  if (!canvas) throw new Error("camera_studio_viewport_canvas_missing");

  let state = normalizeStudioState(options);
  let disposed = false;
  let drag = null;
  let subjectTexture = null;
  let subjectPlane = null;
  let imageRequest = 0;
  const createdCanvas = canvas.dataset?.cameraStudioCreated === "true";
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: true });
  renderer.setPixelRatio(Math.min(2, Math.max(1, finiteNumber(globalThis.devicePixelRatio, 1))));
  if ("outputColorSpace" in renderer && THREE.SRGBColorSpace) renderer.outputColorSpace = THREE.SRGBColorSpace;

  const scene = new THREE.Scene();
  const renderCamera = new THREE.PerspectiveCamera(38, 1, 0.1, 100);
  renderCamera.position.set(0, 0.25, 6.1);
  renderCamera.lookAt(0, 0, 0);

  const colors = studioColors(THREE, root);
  scene.add(new THREE.AmbientLight(0xffffff, 0.95));

  const sphere = new THREE.Mesh(
    new THREE.SphereGeometry(1.72, 18, 12),
    new THREE.MeshBasicMaterial({ color: colors.grid, wireframe: true, transparent: true, opacity: 0.27 }),
  );
  scene.add(sphere);

  const ringGeometry = new THREE.TorusGeometry(1.73, 0.008, 8, 96);
  const horizontalRing = new THREE.Mesh(
    ringGeometry,
    new THREE.MeshBasicMaterial({ color: colors.grid, transparent: true, opacity: 0.7 }),
  );
  horizontalRing.rotation.x = Math.PI / 2;
  const verticalRing = new THREE.Mesh(
    ringGeometry.clone(),
    new THREE.MeshBasicMaterial({ color: colors.grid, transparent: true, opacity: 0.7 }),
  );
  scene.add(horizontalRing, verticalRing);

  const subjectGroup = new THREE.Group();
  subjectGroup.add(new THREE.Mesh(
    new THREE.CircleGeometry(0.83, 48),
    new THREE.MeshBasicMaterial({ color: colors.grid, transparent: true, opacity: 0.24 }),
  ));
  scene.add(subjectGroup);

  const cameraMarker = createCameraMarker(THREE, colors.camera);
  scene.add(cameraMarker);

  const lightMarker = createLightMarker(THREE, colors.light);
  const lightCone = createLightCone(THREE);
  scene.add(lightMarker, lightCone);
  const keyLight = new THREE.PointLight(colors.light, 2.5, 12);
  scene.add(keyLight);

  const setImage = (imageUrl) => {
    const request = ++imageRequest;
    removeSubjectPlane();
    if (!imageUrl) return;
    const textureLoader = new THREE.TextureLoader();
    textureLoader.setCrossOrigin?.("anonymous");
    textureLoader.load(imageUrl, (texture) => {
      if (disposed || request !== imageRequest) {
        texture.dispose?.();
        return;
      }
      subjectTexture = texture;
      if ("colorSpace" in texture && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
      subjectPlane = new THREE.Mesh(
        new THREE.PlaneGeometry(1.45, 1.45),
        new THREE.MeshStandardMaterial({
          map: texture,
          transparent: true,
          side: THREE.DoubleSide,
          roughness: 1,
          metalness: 0,
        }),
      );
      subjectPlane.position.z = 0.02;
      subjectGroup.add(subjectPlane);
      root.classList?.add?.("is-three-ready");
      root.classList?.remove?.("is-three-fallback");
    }, undefined, () => {
      if (!disposed && request === imageRequest) root.classList?.add?.("is-three-fallback");
    });
  };

  function removeSubjectPlane() {
    if (subjectPlane) {
      subjectGroup.remove(subjectPlane);
      subjectPlane.geometry?.dispose?.();
      disposeMaterial(subjectPlane.material);
      subjectPlane = null;
    }
    subjectTexture?.dispose?.();
    subjectTexture = null;
  }

  const resize = () => {
    if (disposed) return;
    const rect = root.getBoundingClientRect?.() ?? {};
    const width = Math.max(1, Math.round(finiteNumber(rect.width ?? root.clientWidth, 1)));
    const height = Math.max(1, Math.round(finiteNumber(rect.height ?? root.clientHeight, 1)));
    renderer.setSize(width, height, false);
    renderCamera.aspect = width / height;
    renderCamera.updateProjectionMatrix();
  };
  const resizeObserver = typeof globalThis.ResizeObserver === "function"
    ? new globalThis.ResizeObserver(resize)
    : null;
  resizeObserver?.observe(root);
  if (!resizeObserver) globalThis.addEventListener?.("resize", resize);
  resize();

  const applyState = (nextState) => {
    const previousImageUrl = state.imageUrl;
    state = normalizeStudioState(nextState, state);
    cameraMarker.visible = state.mode !== "lighting";
    cameraMarker.position.copy(sphericalPosition(THREE, state.camera.yaw, state.camera.pitch, CAMERA_RADIUS));
    cameraMarker.lookAt(0, 0, 0);
    cameraMarker.rotateZ(THREE.MathUtils.degToRad(state.camera.roll));

    lightMarker.visible = state.mode !== "camera";
    const lightPosition = sphericalPosition(THREE, state.light.yaw, state.light.pitch, LIGHT_RADIUS);
    lightMarker.position.copy(lightPosition);
    lightMarker.lookAt(0, 0, 0);
    lightCone.visible = state.mode !== "camera";
    updateLightCone(THREE, lightCone, lightPosition, lightPresentation(state.light));
    keyLight.position.copy(lightPosition);
    keyLight.intensity = 0.35 + state.light.intensity / 22;
    applyLightColor(THREE, lightMarker, lightCone, keyLight, state.light);
    updateReadout(root, state);

    if (state.imageUrl !== previousImageUrl) setImage(state.imageUrl);
  };

  const pointerDown = (event) => {
    if (disposed || event.button > 0) return;
    const target = controlTarget(state);
    const values = target === "lighting" ? state.light : state.camera;
    drag = {
      pointerId: event.pointerId,
      target,
      x: event.clientX,
      y: event.clientY,
      yaw: values.yaw,
      pitch: values.pitch,
    };
    root.setPointerCapture?.(event.pointerId);
    event.preventDefault?.();
  };
  const pointerMove = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    const patch = {
      yaw: normalizeYaw(drag.yaw + (event.clientX - drag.x) * 0.45),
      pitch: clamp(drag.pitch - (event.clientY - drag.y) * 0.35, -80, 80),
    };
    if (drag.target === "lighting") {
      state = normalizeStudioState({ light: patch }, state);
      options.onLightChange?.(patch);
    } else {
      state = normalizeStudioState({ camera: patch }, state);
      options.onCameraChange?.(patch);
    }
    applyState(state);
    event.preventDefault?.();
  };
  const pointerUp = (event) => {
    if (!drag || drag.pointerId !== event.pointerId) return;
    drag = null;
    if (root.hasPointerCapture?.(event.pointerId)) root.releasePointerCapture?.(event.pointerId);
  };
  root.addEventListener?.("pointerdown", pointerDown);
  root.addEventListener?.("pointermove", pointerMove);
  root.addEventListener?.("pointerup", pointerUp);
  root.addEventListener?.("pointercancel", pointerUp);

  setImage(state.imageUrl);
  applyState(state);

  const requestFrame = typeof globalThis.requestAnimationFrame === "function"
    ? globalThis.requestAnimationFrame.bind(globalThis)
    : (callback) => globalThis.setTimeout(callback, 16);
  const cancelFrame = typeof globalThis.cancelAnimationFrame === "function"
    ? globalThis.cancelAnimationFrame.bind(globalThis)
    : globalThis.clearTimeout.bind(globalThis);
  let animationFrame = 0;
  const render = () => {
    if (disposed) return;
    horizontalRing.rotation.z += 0.0008;
    renderer.render(scene, renderCamera);
    animationFrame = requestFrame(render);
  };
  render();

  return {
    update: applyState,
    dispose() {
      if (disposed) return;
      disposed = true;
      imageRequest += 1;
      cancelFrame(animationFrame);
      resizeObserver?.disconnect();
      if (!resizeObserver) globalThis.removeEventListener?.("resize", resize);
      root.removeEventListener?.("pointerdown", pointerDown);
      root.removeEventListener?.("pointermove", pointerMove);
      root.removeEventListener?.("pointerup", pointerUp);
      root.removeEventListener?.("pointercancel", pointerUp);
      root.classList?.remove?.("is-three-ready");
      root.classList?.remove?.("is-three-fallback");
      removeSubjectPlane();
      scene.traverse((object) => {
        if (!object?.isMesh && !(object instanceof THREE.Mesh)) return;
        object.geometry?.dispose?.();
        disposeMaterial(object.material);
      });
      renderer.renderLists?.dispose?.();
      renderer.dispose?.();
      renderer.forceContextLoss?.();
      if (createdCanvas) canvas.remove?.();
    },
  };
}

function createPendingInstance(initialState) {
  let state = initialState;
  return {
    update(nextState) { state = nextState; },
    get state() { return state; },
    dispose() {},
  };
}

function createCanvas(root) {
  const documentRef = root.ownerDocument ?? globalThis.document;
  const canvas = documentRef?.createElement?.("canvas");
  if (!canvas) return null;
  canvas.dataset.cameraStudioCreated = "true";
  canvas.setAttribute("data-camera-studio-canvas", "");
  root.appendChild(canvas);
  return canvas;
}

function createCameraMarker(THREE, color) {
  const marker = new THREE.Group();
  const materialOptions = { color, roughness: 0.35, metalness: 0.25 };
  marker.add(new THREE.Mesh(
    new THREE.BoxGeometry(0.34, 0.23, 0.2),
    new THREE.MeshStandardMaterial(materialOptions),
  ));
  const lens = new THREE.Mesh(
    new THREE.CylinderGeometry(0.09, 0.13, 0.2, 20),
    new THREE.MeshStandardMaterial({ ...materialOptions, roughness: 0.25, metalness: 0.5 }),
  );
  lens.rotation.x = Math.PI / 2;
  lens.position.z = -0.18;
  marker.add(lens);
  return marker;
}

function createLightMarker(THREE, color) {
  const marker = new THREE.Group();
  const bulb = new THREE.Mesh(
    new THREE.SphereGeometry(0.15, 24, 16),
    new THREE.MeshBasicMaterial({ color }),
  );
  bulb.userData.cameraStudioLightPart = true;
  const halo = new THREE.Mesh(
    new THREE.RingGeometry(0.22, 0.27, 32),
    new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.45, side: THREE.DoubleSide }),
  );
  halo.userData.cameraStudioLightPart = true;
  marker.add(bulb, halo);
  return marker;
}

function createLightCone(THREE) {
  const cone = new THREE.Mesh(
    new THREE.ConeGeometry(0.62, 1.8, 32, 1, true),
    new THREE.MeshBasicMaterial({
      color: 0xffffff,
      transparent: true,
      opacity: 0.14,
      side: THREE.DoubleSide,
      depthWrite: false,
      depthTest: false,
    }),
  );
  cone.renderOrder = 3;
  cone.userData.cameraStudioLightCone = true;
  return cone;
}

function updateLightCone(THREE, cone, lightPosition, presentation) {
  const target = new THREE.Vector3(0, 0, 0);
  const directionFromTarget = lightPosition.clone().sub(target).normalize();
  const length = lightPosition.distanceTo(target);
  cone.position.copy(lightPosition).add(target).multiplyScalar(0.5);
  cone.scale.set(presentation.coneRadiusScale, length / 1.8, presentation.coneRadiusScale);
  cone.material.opacity = presentation.coneOpacity;
  // ConeGeometry's +Y tip stays at the light; its wide base opens toward the photo center.
  cone.quaternion.setFromUnitVectors(new THREE.Vector3(0, 1, 0), directionFromTarget);
}

function sphericalPosition(THREE, yaw, pitch, radius) {
  const yawRad = THREE.MathUtils.degToRad(yaw);
  const pitchRad = THREE.MathUtils.degToRad(pitch);
  return new THREE.Vector3(
    Math.sin(yawRad) * Math.cos(pitchRad) * radius,
    Math.sin(pitchRad) * radius,
    Math.cos(yawRad) * Math.cos(pitchRad) * radius,
  );
}

function lightPresentation(light) {
  const base = {
    softbox: { coneRadiusScale: 0.9, coneOpacity: 0.13, markerScale: 1 },
    three_point: { coneRadiusScale: 0.66, coneOpacity: 0.18, markerScale: 0.95 },
    rim_light: { coneRadiusScale: 0.32, coneOpacity: 0.25, markerScale: 0.82 },
    natural: { coneRadiusScale: 1.3, coneOpacity: 0.08, markerScale: 1.2 },
  }[light.preset] ?? { coneRadiusScale: 0.9, coneOpacity: 0.13, markerScale: 1 };
  const intensityScale = 0.35 + light.intensity / 100 * 0.65;
  return { ...base, coneOpacity: base.coneOpacity * intensityScale };
}

function applyLightColor(THREE, marker, cone, keyLight, light) {
  const colorValue = normalizeLightColor(light.color)
    ?? (light.temperature === "cool" ? 0x90c8ff : light.temperature === "warm" ? 0xffa652 : 0xffffff);
  const color = new THREE.Color(colorValue);
  keyLight.color?.copy?.(color);
  cone.material?.color?.copy?.(color);
  marker.scale.setScalar(lightPresentation(light).markerScale);
  marker.traverse?.((object) => {
    if (object?.userData?.cameraStudioLightPart) object.material?.color?.copy?.(color);
  });
}

function studioColors(THREE, root) {
  const styles = typeof globalThis.getComputedStyle === "function" ? globalThis.getComputedStyle(root) : null;
  return {
    camera: safeThreeColor(THREE, styles?.getPropertyValue?.("--node-panorama-light"), 0x45d4e8),
    light: safeThreeColor(THREE, styles?.getPropertyValue?.("--warning-light"), 0xffc45c),
    grid: safeThreeColor(THREE, styles?.getPropertyValue?.("--theme-text-muted"), 0x6f7b88),
  };
}

function safeThreeColor(THREE, value, fallback) {
  const normalized = String(value ?? "").trim();
  try {
    return new THREE.Color(normalized || fallback);
  } catch {
    return new THREE.Color(fallback);
  }
}

function updateReadout(root, state) {
  const target = controlTarget(state);
  const values = target === "lighting" ? state.light : state.camera;
  const label = root.querySelector?.("[data-camera-studio-readout-label], [data-camera-studio-readout-kind]");
  const value = root.querySelector?.("[data-camera-studio-readout-value]");
  if (label) label.textContent = target === "lighting" ? "LIGHT" : "CAM";
  if (value) value.textContent = `${Math.round(values.yaw)}°`;
}

export function readCameraStudioViewportState(root) {
  const dataset = root?.dataset ?? {};
  return {
    imageUrl: dataset.sourceUrl,
    mode: dataset.studioMode,
    activeControl: dataset.activeControl,
    camera: {
      yaw: dataset.cameraYaw,
      pitch: dataset.cameraPitch,
      roll: dataset.cameraRoll,
    },
    light: {
      yaw: dataset.lightYaw,
      pitch: dataset.lightPitch,
      intensity: dataset.lightIntensity,
      temperature: dataset.lightTemperature,
      color: dataset.lightColor,
      preset: dataset.lightPreset,
      rimLight: dataset.lightRim,
      fillLight: dataset.lightFill,
    },
  };
}

function controlTarget(state) {
  return state.mode === "dual" ? state.activeControl : state.mode;
}

function normalizeStudioState(input = {}, previous = {}) {
  const previousCamera = previous.camera ?? {};
  const previousLight = previous.light ?? {};
  const camera = input.camera ?? {};
  const light = input.light ?? {};
  const requestedMode = String(input.mode ?? input.cameraStudioMode ?? previous.mode ?? "camera");
  const mode = ["camera", "lighting", "dual"].includes(requestedMode) ? requestedMode : "camera";
  const requestedControl = String(input.activeControl ?? input.cameraStudioActiveControl ?? previous.activeControl ?? "camera");
  return {
    imageUrl: String(input.imageUrl ?? input.sourceUrl ?? previous.imageUrl ?? ""),
    mode,
    activeControl: mode === "dual" && requestedControl === "lighting" ? "lighting" : mode === "lighting" ? "lighting" : "camera",
    camera: {
      yaw: normalizeYaw(finiteNumber(camera.yaw ?? camera.yawDegrees ?? input.cameraYawDegrees, previousCamera.yaw ?? 0)),
      pitch: clamp(finiteNumber(camera.pitch ?? camera.pitchDegrees ?? input.cameraPitchDegrees, previousCamera.pitch ?? 0), -80, 80),
      roll: clamp(finiteNumber(camera.roll ?? camera.rollDegrees ?? input.cameraRollDegrees, previousCamera.roll ?? 0), -45, 45),
    },
    light: {
      yaw: normalizeYaw(finiteNumber(light.yaw ?? light.yawDegrees ?? input.lightYawDegrees, previousLight.yaw ?? 45)),
      pitch: clamp(finiteNumber(light.pitch ?? light.pitchDegrees ?? input.lightPitchDegrees, previousLight.pitch ?? 30), -80, 80),
      intensity: clamp(finiteNumber(light.intensity ?? light.intensityPercent ?? input.lightIntensityPercent, previousLight.intensity ?? 65), 0, 100),
      temperature: normalizeTemperature(light.temperature ?? input.lightTemperature ?? previousLight.temperature),
      color: normalizeLightColor(light.color ?? input.lightColor ?? previousLight.color) ?? temperatureColor(light.temperature ?? input.lightTemperature ?? previousLight.temperature),
      preset: normalizeLightPreset(light.preset ?? input.lightPreset ?? input.cameraLightingPreset ?? previousLight.preset),
      rimLight: Boolean(light.rimLight ?? input.lightRimEnabled ?? previousLight.rimLight),
      fillLight: Boolean(light.fillLight ?? input.lightFillEnabled ?? previousLight.fillLight),
    },
  };
}

function normalizeTemperature(value) {
  const temperature = String(value ?? "neutral");
  return ["cool", "neutral", "warm", "custom"].includes(temperature) ? temperature : "neutral";
}

function temperatureColor(value) {
  return ({ cool: "#90c8ff", warm: "#ffa652", neutral: "#ffffff" })[String(value ?? "")] ?? "#ffffff";
}

function normalizeLightColor(value) {
  const color = String(value ?? "").trim();
  return /^#[0-9a-f]{6}$/i.test(color) ? color : null;
}

function normalizeLightPreset(value) {
  const preset = String(value ?? "softbox");
  return ["softbox", "three_point", "rim_light", "natural"].includes(preset) ? preset : "softbox";
}

function normalizeYaw(value) {
  const yaw = finiteNumber(value, 0);
  return ((yaw + 180) % 360 + 360) % 360 - 180;
}

function finiteNumber(value, fallback) {
  const number = Number(value);
  return Number.isFinite(number) ? number : fallback;
}

function clamp(value, min, max) {
  return Math.min(max, Math.max(min, value));
}

function disposeMaterial(material) {
  const materials = Array.isArray(material) ? material : [material];
  for (const entry of materials) entry?.dispose?.();
}
