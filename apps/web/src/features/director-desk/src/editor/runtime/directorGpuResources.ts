import type { BufferGeometry, Material, Object3D, Scene, Texture, WebGLRenderer } from "three";

type DisposableSceneObject = Object3D & {
  geometry?: BufferGeometry;
  material?: Material | Material[];
};

const resourcesByRoot = new WeakMap<Node, Map<WebGLRenderer, Scene>>();

function disposeTexture(texture: Texture, disposedTextures: Set<Texture>) {
  if (disposedTextures.has(texture)) return;
  disposedTextures.add(texture);
  texture.dispose();
}

function disposeMaterial(material: Material, disposedMaterials: Set<Material>, disposedTextures: Set<Texture>) {
  if (disposedMaterials.has(material)) return;
  disposedMaterials.add(material);

  Object.values(material).forEach((value) => {
    if ((value as Texture | undefined)?.isTexture) {
      disposeTexture(value as Texture, disposedTextures);
    }
  });
  material.dispose();
}

function disposeScene(
  scene: Scene,
  disposedGeometries: Set<BufferGeometry>,
  disposedMaterials: Set<Material>,
  disposedTextures: Set<Texture>
) {
  scene.traverse((sceneObject) => {
    const object = sceneObject as DisposableSceneObject;
    const geometry = object.geometry;
    if (geometry && !disposedGeometries.has(geometry)) {
      disposedGeometries.add(geometry);
      geometry.dispose();
    }

    const materials = Array.isArray(object.material) ? object.material : object.material ? [object.material] : [];
    materials.forEach((material) => disposeMaterial(material, disposedMaterials, disposedTextures));
  });

  const background = scene.background as Texture | null;
  const environment = scene.environment as Texture | null;
  if (background?.isTexture) disposeTexture(background, disposedTextures);
  if (environment?.isTexture) disposeTexture(environment, disposedTextures);
  scene.clear();
}

export function registerDirectorDeskGpuResources(renderer: WebGLRenderer, scene: Scene) {
  const root = renderer.domElement.getRootNode();
  const resources = resourcesByRoot.get(root) ?? new Map<WebGLRenderer, Scene>();
  resources.set(renderer, scene);
  resourcesByRoot.set(root, resources);
}

export function releaseDirectorDeskGpuResources(root: Node) {
  const resources = resourcesByRoot.get(root);
  if (!resources) return;

  const disposedGeometries = new Set<BufferGeometry>();
  const disposedMaterials = new Set<Material>();
  const disposedTextures = new Set<Texture>();
  resources.forEach((scene, renderer) => {
    try {
      disposeScene(scene, disposedGeometries, disposedMaterials, disposedTextures);
    } catch {
      // Renderer and context release must continue even if a third-party scene resource throws.
    }
    try {
      renderer.renderLists.dispose();
    } catch {
      // Continue releasing the renderer and context.
    }
    try {
      renderer.dispose();
    } catch {
      // Continue releasing the context.
    }
    try {
      renderer.forceContextLoss();
    } catch {
      // Cleanup is best-effort after the host has already unmounted.
    }
  });
  resources.clear();
  resourcesByRoot.delete(root);
}
