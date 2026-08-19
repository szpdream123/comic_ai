export type GeoPlatform = {
  id: string;
  label: string;
  group: "general_model" | "ai_search";
  enabled: boolean;
  defaultSelected: boolean;
};

const GEO_PLATFORMS = [
  { id: "deepseek", label: "DeepSeek", group: "general_model", enabled: true, defaultSelected: true },
  { id: "doubao", label: "豆包", group: "general_model", enabled: true, defaultSelected: true },
  { id: "baidu", label: "百度文心助手", group: "general_model", enabled: true, defaultSelected: true },
  { id: "yuanbao", label: "腾讯元宝", group: "general_model", enabled: true, defaultSelected: true },
  { id: "kimi", label: "Kimi", group: "general_model", enabled: true, defaultSelected: true },
  { id: "tongyi", label: "通义", group: "general_model", enabled: true, defaultSelected: true },
  { id: "zhipu", label: "智谱清言", group: "general_model", enabled: true, defaultSelected: true },
  { id: "xinghuo", label: "讯飞星火", group: "general_model", enabled: true, defaultSelected: true },
  { id: "quark", label: "夸克AI", group: "ai_search", enabled: true, defaultSelected: true },
  { id: "metaso", label: "秘塔AI搜索", group: "ai_search", enabled: true, defaultSelected: true },
  { id: "nami", label: "纳米AI搜索", group: "ai_search", enabled: true, defaultSelected: true },
] as const satisfies readonly GeoPlatform[];

export function listGeoPlatforms(): readonly GeoPlatform[] {
  return GEO_PLATFORMS;
}
