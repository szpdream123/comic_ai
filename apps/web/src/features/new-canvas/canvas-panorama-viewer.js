import { normalizeCanvasPanoramaView } from "./special-media-nodes.js";

let threePromise = null;

export function createCanvasPanoramaViewerController({
  surface,
  loadThree = () => {
    threePromise ??= import("/vendor/three.module.js?canvas-panorama=1");
    return threePromise;
  },
} = {}) {
  const instances = new Map();
  let disposed = false;

  const bind = async () => {
    if (disposed || !surface?.querySelectorAll) return false;
    const roots = new Set(surface.querySelectorAll("[data-panorama-three-root]"));
    for (const [root, instance] of instances) {
      if (!roots.has(root) || !root.isConnected) {
        instance.dispose?.();
        instances.delete(root);
      }
    }
    for (const root of roots) {
      const url = String(root.dataset.panoramaUrl ?? "");
      const existing = instances.get(root);
      if (existing?.url === url) {
        existing.setView?.(readPanoramaElementView(root));
        continue;
      }
      existing?.dispose?.();
      const pending = { url, dispose() {}, setView() {}, capture: async () => null };
      instances.set(root, pending);
      try {
        const THREE = await loadThree();
        if (disposed || instances.get(root) !== pending || !root.isConnected) continue;
        const instance = mountPanoramaScene(THREE, root, url);
        instances.set(root, instance);
        instance.setView(readPanoramaElementView(root));
      } catch {
        if (instances.get(root) === pending) {
          root.classList.add("is-three-fallback");
          instances.delete(root);
        }
      }
    }
    return true;
  };

  return {
    bind,
    update(root, view) {
      instances.get(root)?.setView?.(view);
    },
    async capture(nodeId) {
      const root = [...instances.keys()].find((element) => String(element.dataset.nodeId ?? "") === String(nodeId ?? ""));
      return root ? instances.get(root)?.capture?.() ?? null : null;
    },
    dispose() {
      disposed = true;
      for (const instance of instances.values()) instance.dispose?.();
      instances.clear();
    },
  };
}

export function panoramaCameraDirection(view = {}) {
  const normalized = normalizeCanvasPanoramaView(view);
  const phi = (90 - normalized.pitch) * Math.PI / 180;
  const theta = normalized.yaw * Math.PI / 180;
  return {
    x: Math.sin(phi) * Math.cos(theta),
    y: Math.cos(phi),
    z: Math.sin(phi) * Math.sin(theta),
  };
}

function mountPanoramaScene(THREE, root, url) {
  const canvas = root.querySelector?.("[data-panorama-three-canvas]");
  if (!canvas || !url) throw new Error("canvas_panorama_mount_invalid");
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, preserveDrawingBuffer: true });
  renderer.setPixelRatio(Math.min(2, Math.max(1, Number(globalThis.devicePixelRatio ?? 1))));
  const scene = new THREE.Scene();
  scene.background = new THREE.Color(0x090d0f);
  const camera = new THREE.PerspectiveCamera(95, 1, 0.1, 1100);
  const geometry = new THREE.SphereGeometry(500, 64, 40);
  geometry.scale(-1, 1, 1);
  const material = new THREE.MeshBasicMaterial({ color: 0xffffff });
  const mesh = new THREE.Mesh(geometry, material);
  scene.add(mesh);
  const textureLoader = new THREE.TextureLoader();
  textureLoader.setCrossOrigin?.("anonymous");
  let texture = null;
  let destroyed = false;

  const render = () => {
    if (!destroyed) renderer.render(scene, camera);
  };
  const resize = () => {
    const rect = root.getBoundingClientRect?.() ?? {};
    const width = Math.max(1, Math.round(Number(rect.width ?? root.clientWidth ?? 1)));
    const height = Math.max(1, Math.round(Number(rect.height ?? root.clientHeight ?? 1)));
    renderer.setSize(width, height, false);
    camera.aspect = width / height;
    camera.updateProjectionMatrix();
    render();
  };
  const resizeObserver = typeof globalThis.ResizeObserver === "function" ? new globalThis.ResizeObserver(resize) : null;
  resizeObserver?.observe(root);
  resize();

  textureLoader.load(url, (loadedTexture) => {
    if (destroyed) {
      loadedTexture.dispose?.();
      return;
    }
    texture = loadedTexture;
    if ("colorSpace" in texture && THREE.SRGBColorSpace) texture.colorSpace = THREE.SRGBColorSpace;
    material.map = texture;
    material.needsUpdate = true;
    root.classList.add("is-three-ready");
    root.classList.remove("is-three-fallback");
    render();
  }, undefined, () => {
    if (!destroyed) root.classList.add("is-three-fallback");
  });

  return {
    url,
    setView(view) {
      const normalized = normalizeCanvasPanoramaView(view);
      const direction = panoramaCameraDirection(normalized);
      camera.fov = normalized.fov;
      camera.updateProjectionMatrix();
      camera.lookAt(direction.x * 500, direction.y * 500, direction.z * 500);
      render();
    },
    capture() {
      render();
      return new Promise((resolve) => {
        if (typeof canvas.toBlob !== "function") {
          resolve(null);
          return;
        }
        canvas.toBlob(resolve, "image/png");
      });
    },
    dispose() {
      if (destroyed) return;
      destroyed = true;
      resizeObserver?.disconnect();
      root.classList.remove("is-three-ready");
      texture?.dispose?.();
      material.dispose?.();
      geometry.dispose?.();
      renderer.renderLists?.dispose?.();
      renderer.dispose?.();
      renderer.forceContextLoss?.();
    },
  };
}

function readPanoramaElementView(root) {
  return normalizeCanvasPanoramaView({
    yaw: root?.dataset?.panoramaYaw,
    pitch: root?.dataset?.panoramaPitch,
    fov: root?.dataset?.panoramaFov,
  });
}
