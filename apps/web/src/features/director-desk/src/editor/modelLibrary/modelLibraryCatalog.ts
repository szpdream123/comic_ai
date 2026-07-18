import guoCharactersManifest from "./guoCharactersManifest.json";
import guoPropsManifest from "./guoPropsManifest.json";

export const LOCAL_GUO_ASSETS_AVAILABLE = __LOCAL_GUO_ASSETS_AVAILABLE__;

export type ModelLibraryCategoryId =
  | "characters"
  | "convenience"
  | "home"
  | "architecture"
  | "office"
  | "food"
  | "medical"
  | "studio"
  | "nature"
  | "urban"
  | "outdoor"
  | "tools"
  | "weapons"
  | "my-models";

export type ModelLibraryCategory = {
  directoryName: string;
  id: ModelLibraryCategoryId;
  label: string;
};

export type ModelLibrarySectionId =
  | "characters"
  | "scene"
  | "life"
  | "transport"
  | "props"
  | "weapons"
  | "my-models";

export type ModelLibrarySection = {
  id: ModelLibrarySectionId;
  label: string;
};

export type ModelLibraryItem = {
  categoryId: ModelLibraryCategoryId;
  fileName: string;
  id: string;
  name: string;
  thumbUrl?: string;
  url: string;
  kind?: "character" | "prop";
};

export const MODEL_LIBRARY_CATEGORIES: ModelLibraryCategory[] = [
  ...(LOCAL_GUO_ASSETS_AVAILABLE ? [{ id: "characters" as const, label: "人物", directoryName: "人物" }] : []),
  { id: "convenience", label: "便利生活", directoryName: "便利生活" },
  { id: "home", label: "居家生活", directoryName: "生活家居" },
  { id: "architecture", label: "建筑场景", directoryName: "建筑场景" },
  { id: "office", label: "办公商业", directoryName: "办公商业" },
  { id: "food", label: "餐饮厨房", directoryName: "餐饮厨房" },
  { id: "medical", label: "医疗应急", directoryName: "医疗应急" },
  { id: "studio", label: "影视器材", directoryName: "影视器材" },
  { id: "nature", label: "自然景观", directoryName: "自然景观" },
  { id: "urban", label: "城市设施", directoryName: "城市设施" },
  { id: "outdoor", label: "户外出行", directoryName: "户外出行" },
  { id: "tools", label: "工具配件", directoryName: "工具配件" },
  ...(LOCAL_GUO_ASSETS_AVAILABLE ? [{ id: "weapons" as const, label: "武器", directoryName: "武器" }] : []),
  { id: "my-models", label: "我的模型", directoryName: "" },
];

export const MODEL_LIBRARY_SECTIONS: ModelLibrarySection[] = [
  ...(LOCAL_GUO_ASSETS_AVAILABLE ? [{ id: "characters" as const, label: "人物" }] : []),
  { id: "scene", label: "场景" },
  { id: "life", label: "生活" },
  { id: "transport", label: "交通" },
  { id: "props", label: "道具" },
  ...(LOCAL_GUO_ASSETS_AVAILABLE ? [{ id: "weapons" as const, label: "武器" }] : []),
  { id: "my-models", label: "我的模型" },
];

const BUILTIN_LIFE_MODEL_INPUTS: Array<Omit<ModelLibraryItem, "id" | "thumbUrl" | "url">> = [
  { categoryId: "convenience", fileName: "ATM_low.fbx", name: "自动取款机" },
  { categoryId: "convenience", fileName: "trash_sorting_low.fbx", name: "分类垃圾桶" },
  { categoryId: "home", fileName: "sofa_modern_low.fbx", name: "沙发" },
  { categoryId: "home", fileName: "dining_table_low.fbx", name: "餐桌" },
  { categoryId: "home", fileName: "refrigerator_modern_low.fbx", name: "冰箱" },
  { categoryId: "home", fileName: "washing_machine_modern_low.fbx", name: "洗衣机" },
  { categoryId: "home", fileName: "bed_double_low.fbx", name: "双人床" },
  { categoryId: "home", fileName: "wardrobe_low.fbx", name: "衣柜" },
  { categoryId: "home", fileName: "bookshelf_low.fbx", name: "书架" },
  { categoryId: "home", fileName: "television_low.fbx", name: "电视机" },
  { categoryId: "home", fileName: "coffee_table_low.fbx", name: "茶几" },
  { categoryId: "home", fileName: "dining_chair_low.fbx", name: "餐椅" },
  { categoryId: "home", fileName: "toilet_low.fbx", name: "马桶" },
  { categoryId: "home", fileName: "bathtub_low.fbx", name: "浴缸" },
  { categoryId: "architecture", fileName: "door_single_low.fbx", name: "单开门" },
  { categoryId: "architecture", fileName: "window_wall_low.fbx", name: "窗户" },
  { categoryId: "architecture", fileName: "stairs_low.fbx", name: "楼梯" },
  { categoryId: "architecture", fileName: "fence_low.fbx", name: "围栏" },
  { categoryId: "architecture", fileName: "bus_shelter_low.fbx", name: "公交站台" },
  { categoryId: "architecture", fileName: "wall_panel_low.fbx", name: "模块墙体" },
  { categoryId: "architecture", fileName: "wall_corner_low.fbx", name: "墙角" },
  { categoryId: "architecture", fileName: "floor_slab_low.fbx", name: "地板模块" },
  { categoryId: "architecture", fileName: "roof_tile_low.fbx", name: "屋顶模块" },
  { categoryId: "architecture", fileName: "support_column_low.fbx", name: "建筑立柱" },
  { categoryId: "architecture", fileName: "elevator_door_low.fbx", name: "电梯门" },
  { categoryId: "architecture", fileName: "escalator_low.fbx", name: "自动扶梯" },
  { categoryId: "architecture", fileName: "roller_shutter_low.fbx", name: "卷帘门" },
  { categoryId: "office", fileName: "office_desk_low.fbx", name: "办公桌" },
  { categoryId: "office", fileName: "office_chair_low.fbx", name: "办公椅" },
  { categoryId: "office", fileName: "desktop_computer_low.fbx", name: "台式电脑" },
  { categoryId: "office", fileName: "filing_cabinet_low.fbx", name: "文件柜" },
  { categoryId: "office", fileName: "vending_machine_low.fbx", name: "自动售货机" },
  { categoryId: "food", fileName: "gas_stove_low.fbx", name: "燃气灶" },
  { categoryId: "food", fileName: "microwave_low.fbx", name: "微波炉" },
  { categoryId: "food", fileName: "kitchen_sink_low.fbx", name: "厨房水槽" },
  { categoryId: "food", fileName: "kitchen_cabinet_low.fbx", name: "厨房橱柜" },
  { categoryId: "food", fileName: "coffee_machine_low.fbx", name: "咖啡机" },
  { categoryId: "medical", fileName: "hospital_bed_low.fbx", name: "医用病床" },
  { categoryId: "medical", fileName: "wheelchair_low.fbx", name: "轮椅" },
  { categoryId: "medical", fileName: "first_aid_kit_low.fbx", name: "急救箱" },
  { categoryId: "medical", fileName: "fire_extinguisher_low.fbx", name: "灭火器" },
  { categoryId: "medical", fileName: "emergency_beacon_low.fbx", name: "应急警示灯" },
  { categoryId: "studio", fileName: "cinema_camera_low.fbx", name: "电影摄影机" },
  { categoryId: "studio", fileName: "studio_light_low.fbx", name: "摄影灯" },
  { categoryId: "studio", fileName: "boom_microphone_low.fbx", name: "挑杆麦克风" },
  { categoryId: "studio", fileName: "clapperboard_low.fbx", name: "场记板" },
  { categoryId: "studio", fileName: "speaker_low.fbx", name: "音响" },
  { categoryId: "nature", fileName: "rock_low.fbx", name: "景观岩石" },
  { categoryId: "nature", fileName: "shrub_low.fbx", name: "灌木" },
  { categoryId: "nature", fileName: "flower_pot_low.fbx", name: "花盆" },
  { categoryId: "nature", fileName: "park_bench_low.fbx", name: "公园长椅" },
  { categoryId: "nature", fileName: "direction_sign_low.fbx", name: "方向路牌" },
  { categoryId: "urban", fileName: "traffic_light_low.fbx", name: "交通信号灯" },
  { categoryId: "urban", fileName: "fire_hydrant_low.fbx", name: "消防栓" },
  { categoryId: "urban", fileName: "traffic_cone_low.fbx", name: "交通锥" },
  { categoryId: "urban", fileName: "road_guardrail_low.fbx", name: "道路护栏" },
  { categoryId: "urban", fileName: "road_sign_low.fbx", name: "道路标志牌" },
  { categoryId: "urban", fileName: "phone_booth_low.fbx", name: "电话亭" },
  { categoryId: "urban", fileName: "manhole_cover_low.fbx", name: "井盖" },
  { categoryId: "urban", fileName: "street_bollard_low.fbx", name: "隔离柱" },
  { categoryId: "outdoor", fileName: "sedan_low.fbx", name: "家用轿车" },
  { categoryId: "outdoor", fileName: "suv_city_low.fbx", name: "城市SUV" },
  { categoryId: "outdoor", fileName: "city_bus_low.fbx", name: "城市公交车" },
  { categoryId: "outdoor", fileName: "bicycle_city_low.fbx", name: "自行车" },
  { categoryId: "outdoor", fileName: "electric_scooter_low.fbx", name: "电动踏板车" },
  { categoryId: "urban", fileName: "street_lamp_low.fbx", name: "路灯" },
  { categoryId: "nature", fileName: "street_tree_low.fbx", name: "绿化树" },
  { categoryId: "tools", fileName: "backpack_low.fbx", name: "背包" },
  { categoryId: "tools", fileName: "thermus_low.fbx", name: "保温瓶" },
  { categoryId: "tools", fileName: "deer_skull_low.fbx", name: "鹿头骨" },
  { categoryId: "outdoor", fileName: "motorcycle_low.fbx", name: "摩托车" },
  { categoryId: "outdoor", fileName: "taxi_low.fbx", name: "出租车" },
  { categoryId: "outdoor", fileName: "delivery_truck_low.fbx", name: "厢式货车" },
  { categoryId: "outdoor", fileName: "ambulance_low.fbx", name: "救护车" },
  { categoryId: "outdoor", fileName: "police_car_low.fbx", name: "警车" },
  { categoryId: "outdoor", fileName: "fire_engine_low.fbx", name: "消防车" },
  { categoryId: "outdoor", fileName: "passenger_van_low.fbx", name: "客运面包车" },
  { categoryId: "outdoor", fileName: "pickup_truck_low.fbx", name: "皮卡车" },
  { categoryId: "tools", fileName: "wrench_low.fbx", name: "扳手" },
  { categoryId: "tools", fileName: "drill_press_low.fbx", name: "台钻" },
];

export const BUILTIN_LIFE_MODELS: ModelLibraryItem[] = BUILTIN_LIFE_MODEL_INPUTS.map((item) => ({
  ...item,
  id: `builtin:${item.fileName}`,
  url: `builtin://life/${item.fileName}`,
}));

type GuoCharacterManifestItem = {
  id: string;
  label: string;
  localModelPath: string;
  localThumbnailPath: string;
};

type GuoPropManifestItem = {
  id: string;
  label: string;
  categoryId: string;
  localModelPath: string;
  localThumbnailPath: string;
};

const localAssetUrl = (path: string) => `${import.meta.env.BASE_URL}local-assets/guo-3d-assets/${path}`;

export const GUO_CHARACTER_MODELS: ModelLibraryItem[] = (guoCharactersManifest.items as GuoCharacterManifestItem[]).map((item) => ({
  id: `guo-character:${item.id}`,
  kind: "character",
  categoryId: "characters",
  fileName: item.localModelPath.split("/").pop() ?? `${item.id}.fbx`,
  name: item.label,
  url: localAssetUrl(`guo-skeleton-models/${item.localModelPath}`),
  thumbUrl: localAssetUrl(`guo-skeleton-models/${item.localThumbnailPath}`),
}));

function mapGuoPropCategory(categoryId: string): ModelLibraryCategoryId {
  if (categoryId === "furniture") return "home";
  if (categoryId === "vehicle") return "outdoor";
  if (categoryId === "environment") return "architecture";
  if (categoryId === "firearms" || categoryId === "melee") return "weapons";
  if (categoryId === "accessory") return "convenience";
  return "tools";
}

export const GUO_PROP_MODELS: ModelLibraryItem[] = (guoPropsManifest.items as GuoPropManifestItem[]).map((item) => ({
  id: `guo-prop:${item.id}`,
  kind: "prop",
  categoryId: mapGuoPropCategory(item.categoryId),
  fileName: item.localModelPath.split("/").pop() ?? `${item.id}.fbx`,
  name: item.label,
  url: localAssetUrl(`guo-mounted-props-200/${item.localModelPath}`),
  thumbUrl: localAssetUrl(`guo-mounted-props-200/${item.localThumbnailPath}`),
}));

export function getModelLibrarySectionId(item: ModelLibraryItem): ModelLibrarySectionId {
  if (item.categoryId === "characters") return "characters";
  if (item.categoryId === "architecture" || item.categoryId === "nature" || item.categoryId === "urban") return "scene";
  if (
    item.categoryId === "convenience"
    || item.categoryId === "home"
    || item.categoryId === "office"
    || item.categoryId === "food"
    || item.categoryId === "medical"
  ) return "life";
  if (item.categoryId === "outdoor") return "transport";
  if (item.categoryId === "weapons") return "weapons";
  if (item.categoryId === "my-models") return "my-models";
  return "props";
}

function removeDuplicateModelNames(items: ModelLibraryItem[]) {
  const seenNames = new Set<string>();

  return items.filter((item) => {
    const normalizedName = `${item.kind ?? "prop"}:${item.name.trim().toLocaleLowerCase("en-US")}`;
    if (seenNames.has(normalizedName)) return false;
    seenNames.add(normalizedName);
    return true;
  });
}

export function getModelLibraryItems() {
  const localModels = LOCAL_GUO_ASSETS_AVAILABLE ? [...GUO_CHARACTER_MODELS, ...GUO_PROP_MODELS] : [];
  return [...removeDuplicateModelNames(localModels), ...BUILTIN_LIFE_MODELS].sort((a, b) => {
    const categoryIndexA = MODEL_LIBRARY_CATEGORIES.findIndex((category) => category.id === a.categoryId);
    const categoryIndexB = MODEL_LIBRARY_CATEGORIES.findIndex((category) => category.id === b.categoryId);

    if (categoryIndexA !== categoryIndexB) return categoryIndexA - categoryIndexB;

    return a.name.localeCompare(b.name, "zh-CN");
  });
}
