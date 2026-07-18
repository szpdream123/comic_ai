import { Canvas, useThree } from "@react-three/fiber";
import { useCallback, useEffect, useLayoutEffect, useRef, useState } from "react";
import { Box3, Vector3, type Group, type PerspectiveCamera } from "three";
import { BuiltInLifeModel } from "./BuiltInLifeModel";
import type { ModelLibraryItem } from "./modelLibraryCatalog";

const thumbnailCache = new Map<string, string>();
const THUMBNAIL_STORAGE_PREFIX = "director:model-library-thumbnail:v1:";

export function getCachedModelLibraryThumbnail(itemId: string) {
  const memoryThumbnail = thumbnailCache.get(itemId);
  if (memoryThumbnail) return memoryThumbnail;

  try {
    const storedThumbnail = localStorage.getItem(`${THUMBNAIL_STORAGE_PREFIX}${itemId}`);
    if (storedThumbnail?.startsWith("data:image/")) {
      thumbnailCache.set(itemId, storedThumbnail);
      return storedThumbnail;
    }
  } catch {
    return undefined;
  }

  return undefined;
}

function cacheModelLibraryThumbnail(itemId: string, thumbnailUrl: string) {
  thumbnailCache.set(itemId, thumbnailUrl);
  try {
    localStorage.setItem(`${THUMBNAIL_STORAGE_PREFIX}${itemId}`, thumbnailUrl);
  } catch {
    // The in-memory cache remains available when browser storage is full or disabled.
  }
}

function ThumbnailScene({
  item,
  onCapture,
}: {
  item: ModelLibraryItem;
  onCapture: (itemId: string, thumbnailUrl: string) => void;
}) {
  const modelRef = useRef<Group>(null);
  const { camera, gl, invalidate, scene } = useThree();

  useLayoutEffect(() => {
    const model = modelRef.current;
    if (!model) return;

    model.updateWorldMatrix(true, true);
    const bounds = new Box3().setFromObject(model);
    const center = bounds.getCenter(new Vector3());
    const size = bounds.getSize(new Vector3());
    const maxDimension = Math.max(size.x, size.y, size.z, 0.1);
    const perspectiveCamera = camera as PerspectiveCamera;
    const viewDirection = new Vector3(1.35, 0.85, 1.5).normalize();
    perspectiveCamera.position.copy(center).addScaledVector(viewDirection, maxDimension * 2.05);
    perspectiveCamera.near = Math.max(0.001, maxDimension / 100);
    perspectiveCamera.far = Math.max(100, maxDimension * 100);
    perspectiveCamera.lookAt(center);
    perspectiveCamera.updateProjectionMatrix();
    invalidate();

    const captureTimer = window.setTimeout(() => {
      invalidate();
      gl.render(scene, perspectiveCamera);
      try {
        const thumbnailUrl = gl.domElement.toDataURL("image/webp", 0.84);
        cacheModelLibraryThumbnail(item.id, thumbnailUrl);
        onCapture(item.id, thumbnailUrl);
      } catch {
        // The card keeps its loading fallback when WebGL export is unavailable.
      }
    }, 80);

    return () => {
      window.clearTimeout(captureTimer);
    };
  }, [camera, gl, invalidate, item, onCapture, scene]);

  return (
    <>
      <ambientLight intensity={1.7} />
      <directionalLight intensity={2.1} position={[5, 7, 6]} />
      <directionalLight intensity={0.8} position={[-4, 3, -2]} />
      <group ref={modelRef} rotation={[0, -0.35, 0]}>
        <BuiltInLifeModel modelId={item.fileName} />
      </group>
    </>
  );
}

export function ModelLibraryThumbnailRenderer({
  items,
  onCapture,
}: {
  items: ModelLibraryItem[];
  onCapture: (itemId: string, thumbnailUrl: string) => void;
}) {
  const [currentIndex, setCurrentIndex] = useState(0);
  const item = items[currentIndex];

  useEffect(() => {
    if (item && getCachedModelLibraryThumbnail(item.id)) {
      setCurrentIndex((index) => index + 1);
    }
  }, [item]);

  const handleCapture = useCallback((itemId: string, thumbnailUrl: string) => {
    onCapture(itemId, thumbnailUrl);
    setCurrentIndex((index) => index + 1);
  }, [onCapture]);

  if (!item) return null;

  return (
    <div className="model-library-thumbnail-renderer" aria-hidden="true">
      <Canvas
        camera={{ fov: 34, position: [4, 3, 5] }}
        dpr={1}
        frameloop="demand"
        gl={{ alpha: false, antialias: true, preserveDrawingBuffer: true }}
        onCreated={({ gl }) => gl.setClearColor("#1b2026", 1)}
      >
        <ThumbnailScene key={item.id} item={item} onCapture={handleCapture} />
      </Canvas>
    </div>
  );
}
