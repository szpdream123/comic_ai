export interface DirectorDeskRecord {
  id: string;
  name: string;
  createdAt: string;
  updatedAt: string;
  lastOpenedAt?: string | null;
}

interface ApiEnvelope<T> {
  requestId: string;
  data: T;
}

const DIRECTOR_DESKS_API_PATH = "/api/director-desks";

async function requestDirectorDeskApi<T>(path: string, init?: RequestInit) {
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
    throw new Error(`导演台接口请求失败（${response.status}）`);
  }

  return (await response.json() as ApiEnvelope<T>).data;
}

export async function listDirectorDeskRecords() {
  const { desks } = await requestDirectorDeskApi<{ desks: DirectorDeskRecord[] }>(DIRECTOR_DESKS_API_PATH);
  return desks;
}

export async function createDirectorDeskRecord(name?: string, deskKey?: string) {
  const body = {
    ...(name?.trim() ? { name: name.trim() } : {}),
    ...(deskKey?.trim() ? { deskKey: deskKey.trim() } : {}),
  };
  const { desk } = await requestDirectorDeskApi<{ desk: DirectorDeskRecord }>(DIRECTOR_DESKS_API_PATH, {
    method: "POST",
    body: JSON.stringify(body),
  });
  return desk;
}

export async function openDirectorDeskRecord(id: string) {
  const { desk } = await requestDirectorDeskApi<{ desk: DirectorDeskRecord }>(
    `${DIRECTOR_DESKS_API_PATH}/${encodeURIComponent(id)}/open`,
    { method: "POST" }
  );
  return desk;
}

export async function renameDirectorDeskRecord(id: string, name: string) {
  const { desk } = await requestDirectorDeskApi<{ desk: DirectorDeskRecord }>(
    `${DIRECTOR_DESKS_API_PATH}/${encodeURIComponent(id)}`,
    {
      method: "PATCH",
      body: JSON.stringify({ name: name.trim() }),
    }
  );
  return desk;
}

export async function deleteDirectorDeskRecord(id: string) {
  await requestDirectorDeskApi<{ deletedDeskKey: string }>(
    `${DIRECTOR_DESKS_API_PATH}/${encodeURIComponent(id)}`,
    { method: "DELETE" }
  );
}

export function upsertDirectorDeskRecord(records: DirectorDeskRecord[], record: DirectorDeskRecord) {
  const exists = records.some((item) => item.id === record.id);
  return exists
    ? records.map((item) => item.id === record.id ? record : item)
    : [...records, record];
}
