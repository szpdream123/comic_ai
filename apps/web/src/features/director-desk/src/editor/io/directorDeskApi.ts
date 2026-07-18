interface ApiEnvelope<T> {
  requestId: string;
  data: T;
}

interface DirectorDeskSceneData {
  deskKey: string;
  scene: unknown;
  written?: boolean;
}

function getDirectorDeskScenePath(deskKey: string) {
  return `/api/director-desks/${encodeURIComponent(deskKey)}/scene`;
}

async function requestDirectorDeskScene(path: string, init?: RequestInit) {
  const response = await fetch(path, {
    ...init,
    credentials: "include",
    headers: init?.body
      ? {
          "Content-Type": "application/json",
          ...init.headers,
        }
      : init?.headers,
  });

  if (!response.ok) {
    throw new Error(`导演台场景接口请求失败（${response.status}）`);
  }

  return (await response.json() as ApiEnvelope<DirectorDeskSceneData>).data;
}

export async function loadDirectorDeskScene(deskKey: string) {
  const data = await requestDirectorDeskScene(getDirectorDeskScenePath(deskKey));
  return data.scene;
}

export async function saveDirectorDeskScene(deskKey: string, scene: unknown) {
  await requestDirectorDeskScene(getDirectorDeskScenePath(deskKey), {
    method: "PUT",
    keepalive: true,
    body: JSON.stringify({ scene }),
  });
}

export async function saveLegacyDirectorDeskSceneIfEmpty(deskKey: string, scene: unknown) {
  const data = await requestDirectorDeskScene(getDirectorDeskScenePath(deskKey), {
    method: "PUT",
    body: JSON.stringify({ scene, onlyIfEmpty: true }),
  });
  return data.written === true;
}
