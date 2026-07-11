export interface UserCompatibilityScope {
  organizationId: string;
  workspaceId: string;
}

export function userCompatibilityScope(userId: string): UserCompatibilityScope {
  const normalized = normalizeUserId(userId);
  return {
    organizationId: compatibilityUuid("organization", normalized),
    workspaceId: compatibilityUuid("workspace", normalized),
  };
}

export function userProjectCompatibilityWorkspaceId(userId: string) {
  const normalized = normalizeUserId(userId);
  return compatibilityUuid("project-workspace", normalized);
}

export function userCompatibilityScopeCandidates(userId: string): UserCompatibilityScope[] {
  const primary = userCompatibilityScope(userId);
  const legacy = legacyUserCompatibilityScope(userId);
  return primary.workspaceId === legacy.workspaceId ? [primary] : [primary, legacy];
}

export function userProjectCompatibilityWorkspaceIdCandidates(userId: string): string[] {
  const primary = userProjectCompatibilityWorkspaceId(userId);
  const legacy = legacyUserProjectCompatibilityWorkspaceId(userId);
  return primary === legacy ? [primary] : [primary, legacy];
}

function normalizeUserId(userId: string) {
  const value = String(userId ?? "").trim().toLowerCase();
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/.test(value)) {
    throw new TypeError("user_id_invalid");
  }
  return value.replace(/-/g, "");
}

function compatibilityUuid(kind: "organization" | "workspace" | "project-workspace", normalizedUserId: string) {
  const versionByKind = {
    organization: "1",
    workspace: "2",
    "project-workspace": "3",
  } as const;
  return formatUuid(
    `${normalizedUserId.slice(0, 12)}${versionByKind[kind]}${normalizedUserId.slice(13)}`,
  );
}

function legacyUserCompatibilityScope(userId: string): UserCompatibilityScope {
  const normalized = normalizeUserId(userId);
  return {
    organizationId: legacyUuidFromHex(`a${normalized.slice(1, 32)}`),
    workspaceId: legacyUuidFromHex(`b${normalized.slice(1, 32)}`),
  };
}

function legacyUserProjectCompatibilityWorkspaceId(userId: string) {
  const normalized = normalizeUserId(userId);
  return legacyUuidFromHex(`c${normalized.slice(1, 32)}`);
}

function legacyUuidFromHex(hex: string) {
  const value = hex.padEnd(32, "0").slice(0, 32);
  return `${value.slice(0, 8)}-${value.slice(8, 12)}-4${value.slice(13, 16)}-8${value.slice(17, 20)}-${value.slice(20, 32)}`;
}

function formatUuid(hex: string) {
  return `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20, 32)}`;
}
