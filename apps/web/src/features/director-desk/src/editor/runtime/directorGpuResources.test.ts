import { Scene } from "three";
import { registerDirectorDeskGpuResources, releaseDirectorDeskGpuResources } from "./directorGpuResources";

it("releases every registered scene, renderer, and WebGL context exactly once per host mount", () => {
  const host = document.createElement("div");
  const shadowRoot = host.attachShadow({ mode: "open" });
  const canvas = document.createElement("canvas");
  shadowRoot.append(canvas);

  const geometryDispose = vi.fn();
  const materialDispose = vi.fn();
  const textureDispose = vi.fn();
  const scene = new Scene();
  const texture = { isTexture: true, dispose: textureDispose };
  const material = { map: texture, dispose: materialDispose };
  const geometry = { dispose: geometryDispose };
  scene.add(Object.assign(new Scene(), { geometry, material }));
  const secondScene = new Scene();
  secondScene.add(Object.assign(new Scene(), { geometry, material }));

  const renderer = {
    domElement: canvas,
    dispose: vi.fn(),
    forceContextLoss: vi.fn(),
    renderLists: { dispose: vi.fn() },
  };
  const secondCanvas = document.createElement("canvas");
  shadowRoot.append(secondCanvas);
  const secondRenderer = {
    domElement: secondCanvas,
    dispose: vi.fn(),
    forceContextLoss: vi.fn(),
    renderLists: { dispose: vi.fn() },
  };

  registerDirectorDeskGpuResources(renderer as never, scene);
  registerDirectorDeskGpuResources(renderer as never, scene);
  registerDirectorDeskGpuResources(secondRenderer as never, secondScene);
  releaseDirectorDeskGpuResources(shadowRoot);
  releaseDirectorDeskGpuResources(shadowRoot);

  expect(geometryDispose).toHaveBeenCalledTimes(1);
  expect(materialDispose).toHaveBeenCalledTimes(1);
  expect(textureDispose).toHaveBeenCalledTimes(1);
  expect(renderer.renderLists.dispose).toHaveBeenCalledTimes(1);
  expect(renderer.dispose).toHaveBeenCalledTimes(1);
  expect(renderer.forceContextLoss).toHaveBeenCalledTimes(1);
  expect(secondRenderer.renderLists.dispose).toHaveBeenCalledTimes(1);
  expect(secondRenderer.dispose).toHaveBeenCalledTimes(1);
  expect(secondRenderer.forceContextLoss).toHaveBeenCalledTimes(1);
  expect(scene.children).toHaveLength(0);
  expect(secondScene.children).toHaveLength(0);
});

it("accepts a fresh renderer after the same host root is mounted again", () => {
  const host = document.createElement("div");
  const shadowRoot = host.attachShadow({ mode: "open" });

  const createRenderer = () => {
    const canvas = document.createElement("canvas");
    shadowRoot.append(canvas);
    return {
      domElement: canvas,
      dispose: vi.fn(),
      forceContextLoss: vi.fn(),
      renderLists: { dispose: vi.fn() },
    };
  };

  const firstRenderer = createRenderer();
  registerDirectorDeskGpuResources(firstRenderer as never, new Scene());
  releaseDirectorDeskGpuResources(shadowRoot);

  const secondRenderer = createRenderer();
  registerDirectorDeskGpuResources(secondRenderer as never, new Scene());
  releaseDirectorDeskGpuResources(shadowRoot);

  expect(firstRenderer.forceContextLoss).toHaveBeenCalledTimes(1);
  expect(secondRenderer.forceContextLoss).toHaveBeenCalledTimes(1);
});
