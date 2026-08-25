export type GeoPlatform = {
  id: string;
  label: string;
  group: "general_model" | "ai_search";
  enabled: boolean;
  defaultSelected: boolean;
  monitoring:
    | { mode: "official_api"; providerNames: readonly string[] }
    | { mode: "manual_import"; providerNames: readonly [] };
};

const GEO_PLATFORMS = [
  { id: "deepseek", label: "DeepSeek", group: "general_model", enabled: true, defaultSelected: true, monitoring: { mode: "official_api", providerNames: ["deepseek"] } },
  { id: "doubao", label: "豆包", group: "general_model", enabled: true, defaultSelected: true, monitoring: { mode: "manual_import", providerNames: [] } },
  { id: "baidu", label: "百度文心助手", group: "general_model", enabled: true, defaultSelected: true, monitoring: { mode: "manual_import", providerNames: [] } },
  { id: "yuanbao", label: "腾讯元宝", group: "general_model", enabled: true, defaultSelected: true, monitoring: { mode: "manual_import", providerNames: [] } },
  { id: "kimi", label: "Kimi", group: "general_model", enabled: true, defaultSelected: true, monitoring: { mode: "manual_import", providerNames: [] } },
  { id: "tongyi", label: "通义", group: "general_model", enabled: true, defaultSelected: true, monitoring: { mode: "official_api", providerNames: ["qwen", "dashscope", "aliyun-bailian"] } },
  { id: "zhipu", label: "智谱清言", group: "general_model", enabled: true, defaultSelected: true, monitoring: { mode: "manual_import", providerNames: [] } },
  { id: "xinghuo", label: "讯飞星火", group: "general_model", enabled: true, defaultSelected: true, monitoring: { mode: "manual_import", providerNames: [] } },
  { id: "quark", label: "夸克AI", group: "ai_search", enabled: true, defaultSelected: true, monitoring: { mode: "manual_import", providerNames: [] } },
  { id: "metaso", label: "秘塔AI搜索", group: "ai_search", enabled: true, defaultSelected: true, monitoring: { mode: "manual_import", providerNames: [] } },
  { id: "nami", label: "纳米AI搜索", group: "ai_search", enabled: true, defaultSelected: true, monitoring: { mode: "manual_import", providerNames: [] } },
] as const satisfies readonly GeoPlatform[];

export function listGeoPlatforms(): readonly GeoPlatform[] {
  return GEO_PLATFORMS;
}

export function findGeoPlatform(platformId: string): GeoPlatform | undefined {
  return GEO_PLATFORMS.find((platform) => platform.id === platformId.trim());
}
