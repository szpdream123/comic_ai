import {
  capabilities,
  type Capability,
} from "../../../../../packages/contracts/domain/capabilities.ts";

export type TeamBusinessRole =
  | "admin"
  | "group_admin"
  | "director_plus"
  | "animator_plus"
  | "director"
  | "animator"
  | "screenwriter"
  | "editor";

export interface TeamBusinessRoleMetadata {
  key: TeamBusinessRole;
  displayName: string;
  scope: "team" | "group" | "assigned_projects";
}

const viewAndAssignedProject: Capability[] = [
  capabilities.projectView,
  capabilities.teamKnowledgeTemplateUse,
];

const scriptProduction: Capability[] = [
  capabilities.novelAdaptScript,
  capabilities.scriptAssetCreate,
];

const characterScenePropProduction: Capability[] = [
  capabilities.characterScenePropCreate,
  capabilities.characterScenePropEdit,
];

const episodeProduction: Capability[] = [
  capabilities.episodeAssetCreate,
  capabilities.episodeAssetEdit,
];

const allProduction: Capability[] = [
  ...scriptProduction,
  ...characterScenePropProduction,
  ...episodeProduction,
];

const allDownloads: Capability[] = [
  capabilities.scriptAssetDownload,
  capabilities.characterScenePropDownload,
  capabilities.episodeAssetDownload,
];

const allDeletes: Capability[] = [
  capabilities.scriptAssetDelete,
  capabilities.characterScenePropDelete,
  capabilities.episodeAssetDelete,
];

const allTeamManagement: Capability[] = [
  capabilities.teamMemberRead,
  capabilities.teamMemberManageAll,
  capabilities.teamMemberManageGroup,
  capabilities.teamGroupCreate,
  capabilities.teamGroupUpdate,
  capabilities.teamGroupDelete,
  capabilities.teamCreditAllocateAll,
  capabilities.teamCreditAllocateGroup,
  capabilities.teamDashboardViewAll,
  capabilities.teamDashboardViewGroup,
];

export const teamBusinessRoles: TeamBusinessRoleMetadata[] = [
  { key: "admin", displayName: "管理员", scope: "team" },
  { key: "group_admin", displayName: "组管理员", scope: "group" },
  { key: "director_plus", displayName: "导演（可下载删除）", scope: "assigned_projects" },
  { key: "animator_plus", displayName: "动画师（可下载删除）", scope: "assigned_projects" },
  { key: "director", displayName: "导演", scope: "assigned_projects" },
  { key: "animator", displayName: "动画师", scope: "assigned_projects" },
  { key: "screenwriter", displayName: "编剧", scope: "assigned_projects" },
  { key: "editor", displayName: "剪辑师", scope: "assigned_projects" },
];

const roleCapabilities: Record<TeamBusinessRole, Capability[]> = {
  admin: uniqueCapabilities([
    ...viewAndAssignedProject,
    ...allProduction,
    ...allDownloads,
    ...allDeletes,
    ...allTeamManagement,
    capabilities.projectCreate,
    capabilities.projectEdit,
    capabilities.projectEditInfo,
    capabilities.projectAssignMember,
    capabilities.generationStart,
    capabilities.exportCreate,
    capabilities.toolboxUse,
    capabilities.teamKnowledgeTemplateCreate,
    capabilities.teamKnowledgeTemplateEdit,
    capabilities.teamKnowledgeTemplateDelete,
  ]),
  group_admin: uniqueCapabilities([
    ...viewAndAssignedProject,
    ...allProduction,
    ...allDownloads,
    ...allDeletes,
    capabilities.projectCreate,
    capabilities.projectEdit,
    capabilities.projectEditInfo,
    capabilities.projectAssignMember,
    capabilities.generationStart,
    capabilities.exportCreate,
    capabilities.toolboxUse,
    capabilities.teamMemberRead,
    capabilities.teamMemberManageGroup,
    capabilities.teamGroupUpdate,
    capabilities.teamCreditAllocateGroup,
    capabilities.teamDashboardViewGroup,
    capabilities.teamKnowledgeTemplateCreate,
    capabilities.teamKnowledgeTemplateEdit,
    capabilities.teamKnowledgeTemplateDelete,
  ]),
  director_plus: uniqueCapabilities([
    ...viewAndAssignedProject,
    ...allProduction,
    ...allDownloads,
    capabilities.characterScenePropDelete,
    capabilities.episodeAssetDelete,
    capabilities.generationStart,
    capabilities.exportCreate,
    capabilities.teamKnowledgeTemplateCreate,
    capabilities.teamKnowledgeTemplateEdit,
    capabilities.teamKnowledgeTemplateDelete,
  ]),
  animator_plus: uniqueCapabilities([
    ...viewAndAssignedProject,
    ...episodeProduction,
    capabilities.episodeAssetDownload,
    capabilities.episodeAssetDelete,
    capabilities.generationStart,
    capabilities.exportCreate,
    capabilities.teamKnowledgeTemplateUse,
  ]),
  director: uniqueCapabilities([
    ...viewAndAssignedProject,
    ...allProduction,
    capabilities.generationStart,
    capabilities.exportCreate,
  ]),
  animator: uniqueCapabilities([
    ...viewAndAssignedProject,
    ...episodeProduction,
    capabilities.generationStart,
    capabilities.exportCreate,
  ]),
  screenwriter: uniqueCapabilities([
    ...viewAndAssignedProject,
    ...scriptProduction,
    capabilities.scriptAssetDownload,
  ]),
  editor: uniqueCapabilities([
    ...viewAndAssignedProject,
    capabilities.episodeAssetDownload,
  ]),
};

export function getTeamRoleCapabilities(role: TeamBusinessRole): Capability[] {
  return roleCapabilities[role];
}

export function isTeamBusinessRole(value: string): value is TeamBusinessRole {
  return teamBusinessRoles.some((role) => role.key === value);
}

function uniqueCapabilities(values: Capability[]): Capability[] {
  return [...new Set(values)];
}
