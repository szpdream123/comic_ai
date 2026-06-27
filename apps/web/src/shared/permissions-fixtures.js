export const teamRoleOptions = [
  { key: "admin", label: "管理员" },
  { key: "group_admin", label: "组管理员" },
  { key: "director_plus", label: "导演（可下载删除）" },
  { key: "animator_plus", label: "动画师（可下载删除）" },
  { key: "director", label: "导演" },
  { key: "animator", label: "动画师" },
  { key: "screenwriter", label: "编剧" },
  { key: "editor", label: "剪辑师" },
];

export const teamRoles = teamRoleOptions.map((role) => role.label);

export const legacyRoleLabels = {
  creator: "历史角色：创作者",
  producer: "历史角色：制片",
  viewer: "历史角色：查看者",
};

export const permissionRows = [
  {
    category: "创作生产类权限",
    capability: "参与项目",
    values: [
      "默认参与团队全部项目",
      "默认参与成员组内全部项目",
      "指定项目",
      "指定项目",
      "指定项目",
      "指定项目",
      "指定项目",
      "指定项目",
    ],
  },
  {
    category: "创作生产类权限",
    capability: "查看项目",
    values: ["✔", "✔", "✔", "✔", "✔", "✔", "✔", "✔"],
  },
  {
    category: "创作生产类权限",
    capability: "小说改编剧本",
    values: ["✔", "✔", "✔", "✖", "✖", "✖", "✔", "✖"],
  },
  {
    category: "创作生产类权限",
    capability: "添加剧本资产",
    values: ["✔", "✔", "✔", "✖", "✔", "✖", "✔", "✖"],
  },
  {
    category: "创作生产类权限",
    capability: "添加角色/场景/道具资产",
    values: ["✔", "✔", "✔", "✖", "✔", "✖", "✖", "✖"],
  },
  {
    category: "创作生产类权限",
    capability: "添加剧集资产",
    values: ["✔", "✔", "✔", "✔", "✔", "✔", "✖", "✖"],
  },
  {
    category: "创作生产类权限",
    capability: "编辑角色/场景/道具资产",
    values: ["✔", "✔", "✔", "✖", "✔", "✖", "✖", "✖"],
  },
  {
    category: "创作生产类权限",
    capability: "编辑剧集资产",
    values: ["✔", "✔", "✔", "✔", "✔", "✔", "✖", "✖"],
  },
  {
    category: "创作生产类权限",
    capability: "下载剧本资产",
    values: ["✔", "✔", "✔", "✖", "✖", "✖", "✔", "✖"],
  },
  {
    category: "创作生产类权限",
    capability: "下载角色/场景/道具资产",
    values: ["✔", "✔", "✔", "✖", "✖", "✖", "✖", "✖"],
  },
  {
    category: "创作生产类权限",
    capability: "下载剧集资产",
    values: ["✔", "✔", "✔", "✔", "✖", "✖", "✖", "✔"],
  },
  {
    category: "创作生产类权限",
    capability: "删除剧本资产",
    values: ["✔", "✔", "✖", "✖", "✖", "✖", "✖", "✖"],
  },
  {
    category: "创作生产类权限",
    capability: "删除角色/场景/道具资产",
    values: ["✔", "✔", "✔", "✖", "✖", "✖", "✖", "✖"],
  },
  {
    category: "创作生产类权限",
    capability: "删除剧集资产",
    values: ["✔", "✔", "✔", "✔", "✖", "✖", "✖", "✖"],
  },
  {
    category: "创作生产类权限",
    capability: "编辑项目信息",
    values: ["✔", "✔", "✖", "✖", "✖", "✖", "✖", "✖"],
  },
  {
    category: "创作生产类权限",
    capability: "使用 AI 工具箱",
    values: ["✔", "✔", "✖", "✖", "✖", "✖", "✖", "✖"],
  },
  {
    category: "团队管理类权限",
    capability: "管理全部成员与项目",
    values: ["✔", "✖", "✖", "✖", "✖", "✖", "✖", "✖"],
  },
  {
    category: "团队管理类权限",
    capability: "管理成员组内成员与项目",
    values: ["✔", "✔", "✖", "✖", "✖", "✖", "✖", "✖"],
  },
  {
    category: "团队管理类权限",
    capability: "新建成员组",
    values: ["✔", "✖", "✖", "✖", "✖", "✖", "✖", "✖"],
  },
  {
    category: "团队管理类权限",
    capability: "删除成员组",
    values: ["✔", "✖", "✖", "✖", "✖", "✖", "✖", "✖"],
  },
  {
    category: "团队管理类权限",
    capability: "新建团队知识库模版",
    values: ["✔", "✔", "✔", "✖", "✖", "✖", "✖", "✖"],
  },
  {
    category: "团队管理类权限",
    capability: "编辑团队知识库模版",
    values: ["✔", "✔", "✔", "✖", "✖", "✖", "✖", "✖"],
  },
  {
    category: "团队管理类权限",
    capability: "使用团队知识库模版",
    values: ["✔", "✔", "✔", "✔", "✔", "✔", "✖", "✖"],
  },
  {
    category: "团队管理类权限",
    capability: "删除团队知识库模版",
    values: ["✔", "✔", "✔", "✖", "✖", "✖", "✖", "✖"],
  },
];
