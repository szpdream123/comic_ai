import { randomUUID } from "node:crypto";

import type { ActorContext } from "../organization/actor-context.service.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";

export type LibraryAssetScope = "official" | "team" | "personal";
export type LibraryAssetCategory = "character" | "scene" | "prop" | "image" | "video";

export interface LibraryAssetRecord {
  id: string;
  scope: LibraryAssetScope;
  organizationId: string | null;
  workspaceId: string | null;
  createdByUserId: string | null;
  assetType: LibraryAssetCategory;
  category: LibraryAssetCategory;
  folder: string;
  name: string;
  description: string | null;
  tags: string[];
  status: "active" | "archived";
  requiresProEntitlement: boolean;
  createdAt: Date;
  updatedAt: Date;
}

export interface LibraryAssetVersionRecord {
  id: string;
  libraryAssetId?: string;
  versionNumber: number;
  storageObjectKey: string;
  previewUrl: string | null;
  mimeType: string;
  width: number;
  height: number;
  metadata: Record<string, unknown>;
  createdAt: Date;
}

export interface ListedLibraryAsset extends LibraryAssetRecord {
  previewUrl: string | null;
  latestVersion: LibraryAssetVersionRecord;
}

interface LibraryAssetRow {
  id: string;
  scope: LibraryAssetScope;
  organization_id: string | null;
  workspace_id: string | null;
  created_by_user_id: string | null;
  asset_type: LibraryAssetCategory;
  category: LibraryAssetCategory;
  folder: string;
  name: string;
  description: string | null;
  tags_json: string[] | string;
  status: "active" | "archived";
  requires_pro_entitlement: boolean;
  created_at: Date | string;
  updated_at: Date | string;
  version_id: string;
  version_number: number | string;
  storage_object_key: string;
  preview_url: string | null;
  mime_type: string;
  width: number | string;
  height: number | string;
  metadata_json: Record<string, unknown> | string;
  version_created_at: Date | string;
}

const categories = [
  { id: "character" as const, label: "角色" },
  { id: "scene" as const, label: "场景" },
  { id: "prop" as const, label: "道具" },
];

const officialAssets: Array<{
  id: string;
  category: LibraryAssetCategory;
  folder: string;
  name: string;
  color: string;
  width: number;
  height: number;
  previewAssetPath?: string;
  detailAssetPath?: string;
}> = [
  {
    id: "51000000-0000-4000-8000-000000000101",
    category: "character",
    folder: "国内仿真人-现代都市",
    name: "保姆",
    color: "#c6a47b",
    width: 720,
    height: 960,
    previewAssetPath: "/assets/library/official/characters/nanny.png",
    detailAssetPath: "/assets/library/official/characters/detail/nanny-sheet.png",
  },
  {
    id: "51000000-0000-4000-8000-000000000102",
    category: "character",
    folder: "国内仿真人-现代都市",
    name: "医生",
    color: "#e9edf4",
    width: 720,
    height: 960,
    previewAssetPath: "/assets/library/official/characters/doctor.png",
    detailAssetPath: "/assets/library/official/characters/detail/doctor-sheet.png",
  },
  {
    id: "51000000-0000-4000-8000-000000000103",
    category: "character",
    folder: "国内仿真人-现代都市",
    name: "厨师",
    color: "#f4f4f0",
    width: 720,
    height: 960,
    previewAssetPath: "/assets/library/official/characters/chef.png",
    detailAssetPath: "/assets/library/official/characters/detail/chef-sheet.png",
  },
  {
    id: "51000000-0000-4000-8000-000000000104",
    category: "character",
    folder: "国内仿真人-现代都市",
    name: "老师",
    color: "#d7d9e6",
    width: 720,
    height: 960,
    previewAssetPath: "/assets/library/official/characters/teacher.png",
    detailAssetPath: "/assets/library/official/characters/detail/teacher-sheet.png",
  },
  {
    id: "51000000-0000-4000-8000-000000000105",
    category: "character",
    folder: "国内仿真人-现代都市",
    name: "司机",
    color: "#1f2632",
    width: 720,
    height: 960,
    previewAssetPath: "/assets/library/official/characters/driver.png",
    detailAssetPath: "/assets/library/official/characters/detail/driver-sheet.png",
  },
  {
    id: "51000000-0000-4000-8000-000000000106",
    category: "character",
    folder: "国内仿真人-现代都市",
    name: "记者",
    color: "#cfd6df",
    width: 720,
    height: 960,
    previewAssetPath: "/assets/library/official/characters/reporter.png",
    detailAssetPath: "/assets/library/official/characters/detail/reporter-sheet.png",
  },
  {
    id: "51000000-0000-4000-8000-000000000107",
    category: "character",
    folder: "国内仿真人-现代都市",
    name: "保镖",
    color: "#15171c",
    width: 720,
    height: 960,
    previewAssetPath: "/assets/library/official/characters/security-guard.png",
    detailAssetPath: "/assets/library/official/characters/detail/security-guard-sheet.png",
  },
  {
    id: "51000000-0000-4000-8000-000000000108",
    category: "character",
    folder: "国内仿真人-现代都市",
    name: "管家",
    color: "#252a34",
    width: 720,
    height: 960,
    previewAssetPath: "/assets/library/official/characters/butler.png",
    detailAssetPath: "/assets/library/official/characters/detail/butler-sheet.png",
  },
  {
    id: "51000000-0000-4000-8000-000000000201",
    category: "scene",
    folder: "国内仿真人-现代都市",
    name: "车库",
    color: "#3c3d43",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000202",
    category: "scene",
    folder: "国内仿真人-现代都市",
    name: "别墅",
    color: "#d8d4c9",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000203",
    category: "scene",
    folder: "国内仿真人-现代都市",
    name: "小巷",
    color: "#6f7668",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000204",
    category: "scene",
    folder: "国内仿真人-现代都市",
    name: "医院",
    color: "#d9e8f3",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000205",
    category: "scene",
    folder: "国内仿真人-现代都市",
    name: "办公室",
    color: "#806d58",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000206",
    category: "scene",
    folder: "国内仿真人-现代都市",
    name: "酒店",
    color: "#567453",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000207",
    category: "scene",
    folder: "国内仿真人-现代都市",
    name: "会所",
    color: "#796150",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000208",
    category: "scene",
    folder: "国内仿真人-现代都市",
    name: "机场",
    color: "#9bb6ca",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000401",
    category: "scene",
    folder: "国内仿真人-东方古代",
    name: "牢房",
    color: "#3b2a25",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000402",
    category: "scene",
    folder: "国内仿真人-东方古代",
    name: "王府",
    color: "#8e2f2a",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000403",
    category: "scene",
    folder: "国内仿真人-东方古代",
    name: "市集",
    color: "#9b5a36",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000404",
    category: "scene",
    folder: "国内仿真人-东方古代",
    name: "御书房",
    color: "#5a2d24",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000405",
    category: "scene",
    folder: "国内仿真人-东方古代",
    name: "客栈",
    color: "#6f3f2c",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000406",
    category: "scene",
    folder: "国内仿真人-东方古代",
    name: "酒楼",
    color: "#7a3928",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000407",
    category: "scene",
    folder: "国内仿真人-东方古代",
    name: "御花园",
    color: "#5f8b5f",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000408",
    category: "scene",
    folder: "国内仿真人-东方古代",
    name: "军营",
    color: "#8b765b",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000501",
    category: "scene",
    folder: "3D漫-现代都市",
    name: "未来公寓",
    color: "#4e6b9a",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000502",
    category: "scene",
    folder: "3D漫-现代都市",
    name: "霓虹街区",
    color: "#714dba",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000503",
    category: "scene",
    folder: "3D漫-现代都市",
    name: "直播间",
    color: "#486a9d",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000504",
    category: "scene",
    folder: "3D漫-现代都市",
    name: "学院广场",
    color: "#6a83a8",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000505",
    category: "scene",
    folder: "3D漫-现代都市",
    name: "智能车库",
    color: "#2d3444",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000506",
    category: "scene",
    folder: "3D漫-现代都市",
    name: "云端办公室",
    color: "#546780",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000507",
    category: "scene",
    folder: "3D漫-现代都市",
    name: "赛博商场",
    color: "#5b4fb0",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000508",
    category: "scene",
    folder: "3D漫-现代都市",
    name: "高铁站",
    color: "#486a7c",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000601",
    category: "scene",
    folder: "3D漫-东方修仙",
    name: "云海仙台",
    color: "#a7b6dc",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000602",
    category: "scene",
    folder: "3D漫-东方修仙",
    name: "灵石洞府",
    color: "#52627e",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000603",
    category: "scene",
    folder: "3D漫-东方修仙",
    name: "宗门大殿",
    color: "#7c8db7",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000604",
    category: "scene",
    folder: "3D漫-东方修仙",
    name: "秘境森林",
    color: "#5d8d6a",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000605",
    category: "scene",
    folder: "3D漫-东方修仙",
    name: "试炼山门",
    color: "#8292bc",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000606",
    category: "scene",
    folder: "3D漫-东方修仙",
    name: "仙舟甲板",
    color: "#8798c6",
    width: 1280,
    height: 720,
    previewAssetPath: "/assets/library/official/scenes/xianzhou-deck.png",
  },
  {
    id: "51000000-0000-4000-8000-000000000607",
    category: "scene",
    folder: "3D漫-东方修仙",
    name: "丹房",
    color: "#75608c",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000608",
    category: "scene",
    folder: "3D漫-东方修仙",
    name: "星河悬崖",
    color: "#6e75a8",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000701",
    category: "scene",
    folder: "2D漫-现代都市",
    name: "漫画公寓",
    color: "#9fb4df",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000702",
    category: "scene",
    folder: "2D漫-现代都市",
    name: "街角咖啡店",
    color: "#b98264",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000703",
    category: "scene",
    folder: "2D漫-现代都市",
    name: "黄昏教室",
    color: "#d7a069",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000704",
    category: "scene",
    folder: "2D漫-现代都市",
    name: "天台夜景",
    color: "#33476c",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000705",
    category: "scene",
    folder: "2D漫-现代都市",
    name: "地铁站",
    color: "#7089a8",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000706",
    category: "scene",
    folder: "2D漫-现代都市",
    name: "校园操场",
    color: "#6f8dd9",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000707",
    category: "scene",
    folder: "2D漫-现代都市",
    name: "便利店",
    color: "#91aed8",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000708",
    category: "scene",
    folder: "2D漫-现代都市",
    name: "城市天桥",
    color: "#748aa8",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000801",
    category: "scene",
    folder: "2D漫-东方修仙",
    name: "莲池仙境",
    color: "#8bd0bd",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000802",
    category: "scene",
    folder: "2D漫-东方修仙",
    name: "剑阵山门",
    color: "#8795bc",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000803",
    category: "scene",
    folder: "2D漫-东方修仙",
    name: "竹林秘境",
    color: "#6d9b70",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000804",
    category: "scene",
    folder: "2D漫-东方修仙",
    name: "星河崖畔",
    color: "#5f6fa0",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000805",
    category: "scene",
    folder: "2D漫-东方修仙",
    name: "山谷药庐",
    color: "#7bb8a3",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000806",
    category: "scene",
    folder: "2D漫-东方修仙",
    name: "灵兽庭院",
    color: "#77bfae",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000807",
    category: "scene",
    folder: "2D漫-东方修仙",
    name: "月下古桥",
    color: "#79ada2",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000808",
    category: "scene",
    folder: "2D漫-东方修仙",
    name: "仙门书阁",
    color: "#8da7aa",
    width: 1280,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000301",
    category: "prop",
    folder: "国内仿真人-现代都市",
    name: "工作证",
    color: "#6c7a91",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000302",
    category: "prop",
    folder: "国内仿真人-现代都市",
    name: "手机",
    color: "#263241",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000303",
    category: "prop",
    folder: "国内仿真人-现代都市",
    name: "公文包",
    color: "#8b6545",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000304",
    category: "prop",
    folder: "国内仿真人-现代都市",
    name: "录音笔",
    color: "#4b5f78",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000305",
    category: "prop",
    folder: "国内仿真人-现代都市",
    name: "医疗箱",
    color: "#d7e6f5",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000306",
    category: "prop",
    folder: "国内仿真人-现代都市",
    name: "车钥匙",
    color: "#6d7788",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000307",
    category: "prop",
    folder: "国内仿真人-现代都市",
    name: "相机",
    color: "#293140",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000308",
    category: "prop",
    folder: "国内仿真人-现代都市",
    name: "文件袋",
    color: "#d2a350",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000901",
    category: "prop",
    folder: "国内仿真人-东方古代",
    name: "刀剑",
    color: "#7e8794",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000902",
    category: "prop",
    folder: "国内仿真人-东方古代",
    name: "酒壶",
    color: "#8eb59b",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000903",
    category: "prop",
    folder: "国内仿真人-东方古代",
    name: "令牌",
    color: "#c2954b",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000904",
    category: "prop",
    folder: "国内仿真人-东方古代",
    name: "圣旨",
    color: "#d8a326",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000905",
    category: "prop",
    folder: "国内仿真人-东方古代",
    name: "秘密信息",
    color: "#d1b378",
    width: 960,
    height: 720,
    previewAssetPath: "/assets/library/official/props/prop-ancient-secret-letter.png",
  },
  {
    id: "51000000-0000-4000-8000-000000000906",
    category: "prop",
    folder: "国内仿真人-东方古代",
    name: "毒药",
    color: "#e6e9dd",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000907",
    category: "prop",
    folder: "国内仿真人-东方古代",
    name: "玉佩",
    color: "#8dbfae",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000000908",
    category: "prop",
    folder: "国内仿真人-东方古代",
    name: "印玺",
    color: "#d7c7a6",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003001",
    category: "prop",
    folder: "3D漫-现代都市",
    name: "全息终端",
    color: "#5aaee6",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003002",
    category: "prop",
    folder: "3D漫-现代都市",
    name: "智能手环",
    color: "#536bb0",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003003",
    category: "prop",
    folder: "3D漫-现代都市",
    name: "数据芯片",
    color: "#66c5de",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003004",
    category: "prop",
    folder: "3D漫-现代都市",
    name: "电子耳麦",
    color: "#465f89",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003005",
    category: "prop",
    folder: "3D漫-现代都市",
    name: "悬浮滑板",
    color: "#758cd8",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003006",
    category: "prop",
    folder: "3D漫-现代都市",
    name: "机械钥匙",
    color: "#8da0bd",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003007",
    category: "prop",
    folder: "3D漫-现代都市",
    name: "能量饮料",
    color: "#6bd7bf",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003008",
    category: "prop",
    folder: "3D漫-现代都市",
    name: "追踪器",
    color: "#4f6f9c",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003101",
    category: "prop",
    folder: "3D漫-东方修仙",
    name: "飞剑",
    color: "#8ea7d8",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003102",
    category: "prop",
    folder: "3D漫-东方修仙",
    name: "灵石",
    color: "#8ddbc8",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003103",
    category: "prop",
    folder: "3D漫-东方修仙",
    name: "丹炉",
    color: "#9d7655",
    width: 960,
    height: 720,
    previewAssetPath: "/assets/library/official/props/prop-3d-xianxia-cauldron.png",
  },
  {
    id: "51000000-0000-4000-8000-000000003104",
    category: "prop",
    folder: "3D漫-东方修仙",
    name: "玉简",
    color: "#c8d7c2",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003105",
    category: "prop",
    folder: "3D漫-东方修仙",
    name: "法阵罗盘",
    color: "#b9a56d",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003106",
    category: "prop",
    folder: "3D漫-东方修仙",
    name: "乾坤袋",
    color: "#7aa58f",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003107",
    category: "prop",
    folder: "3D漫-东方修仙",
    name: "灵兽铃",
    color: "#d7bc67",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003108",
    category: "prop",
    folder: "3D漫-东方修仙",
    name: "仙草匣",
    color: "#6fb58c",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003201",
    category: "prop",
    folder: "2D漫-现代都市",
    name: "书包",
    color: "#8b9ed9",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003202",
    category: "prop",
    folder: "2D漫-现代都市",
    name: "耳机",
    color: "#4d5f8f",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003203",
    category: "prop",
    folder: "2D漫-现代都市",
    name: "漫画书",
    color: "#f2a4bd",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003204",
    category: "prop",
    folder: "2D漫-现代都市",
    name: "奶茶",
    color: "#d2a778",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003205",
    category: "prop",
    folder: "2D漫-现代都市",
    name: "地铁卡",
    color: "#78a7d7",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003206",
    category: "prop",
    folder: "2D漫-现代都市",
    name: "拍立得",
    color: "#e8eef5",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003207",
    category: "prop",
    folder: "2D漫-现代都市",
    name: "社团徽章",
    color: "#ffb3ce",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003208",
    category: "prop",
    folder: "2D漫-现代都市",
    name: "便利贴",
    color: "#ffd76b",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003301",
    category: "prop",
    folder: "2D漫-东方修仙",
    name: "符箓",
    color: "#d9a558",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003302",
    category: "prop",
    folder: "2D漫-东方修仙",
    name: "灵剑",
    color: "#95b9e7",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003303",
    category: "prop",
    folder: "2D漫-东方修仙",
    name: "药瓶",
    color: "#91c8a9",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003304",
    category: "prop",
    folder: "2D漫-东方修仙",
    name: "纸伞",
    color: "#e9bfd1",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003305",
    category: "prop",
    folder: "2D漫-东方修仙",
    name: "玉笛",
    color: "#b9d9c8",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003306",
    category: "prop",
    folder: "2D漫-东方修仙",
    name: "莲花灯",
    color: "#f0b7c9",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003307",
    category: "prop",
    folder: "2D漫-东方修仙",
    name: "灵兽蛋",
    color: "#c8e1d6",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000003308",
    category: "prop",
    folder: "2D漫-东方修仙",
    name: "阵法卷轴",
    color: "#caa66b",
    width: 960,
    height: 720,
  },
  {
    id: "51000000-0000-4000-8000-000000001101",
    category: "character",
    folder: "国内仿真人-东方古代",
    name: "皇后",
    color: "#7a4a19",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001102",
    category: "character",
    folder: "国内仿真人-东方古代",
    name: "皇帝",
    color: "#d8a326",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001103",
    category: "character",
    folder: "国内仿真人-东方古代",
    name: "太监",
    color: "#456b8e",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001104",
    category: "character",
    folder: "国内仿真人-东方古代",
    name: "宰相",
    color: "#7a2424",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001105",
    category: "character",
    folder: "国内仿真人-东方古代",
    name: "和尚",
    color: "#d19a35",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001106",
    category: "character",
    folder: "国内仿真人-东方古代",
    name: "宫女",
    color: "#b8cfe2",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001107",
    category: "character",
    folder: "国内仿真人-东方古代",
    name: "侠客",
    color: "#252936",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001108",
    category: "character",
    folder: "国内仿真人-东方古代",
    name: "将军",
    color: "#1b1f25",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001201",
    category: "character",
    folder: "3D漫-现代都市",
    name: "都市男主",
    color: "#2f3442",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001202",
    category: "character",
    folder: "3D漫-现代都市",
    name: "都市女主",
    color: "#d7c7ba",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001203",
    category: "character",
    folder: "3D漫-现代都市",
    name: "霸总",
    color: "#12151b",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001204",
    category: "character",
    folder: "3D漫-现代都市",
    name: "助理",
    color: "#63718a",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001205",
    category: "character",
    folder: "3D漫-现代都市",
    name: "富家千金",
    color: "#bfa5bd",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001206",
    category: "character",
    folder: "3D漫-现代都市",
    name: "律师",
    color: "#20252f",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001301",
    category: "character",
    folder: "3D漫-东方修仙",
    name: "剑修",
    color: "#2c3344",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001302",
    category: "character",
    folder: "3D漫-东方修仙",
    name: "仙尊",
    color: "#e8e9f2",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001303",
    category: "character",
    folder: "3D漫-东方修仙",
    name: "魔尊",
    color: "#231824",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001304",
    category: "character",
    folder: "3D漫-东方修仙",
    name: "灵狐少女",
    color: "#d7c3af",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001305",
    category: "character",
    folder: "3D漫-东方修仙",
    name: "丹师",
    color: "#4f6c5e",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001306",
    category: "character",
    folder: "3D漫-东方修仙",
    name: "宗门长老",
    color: "#6c6f83",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001401",
    category: "character",
    folder: "2D漫-现代都市",
    name: "元气少女",
    color: "#f0a6b4",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001402",
    category: "character",
    folder: "2D漫-现代都市",
    name: "冷面学长",
    color: "#313849",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001403",
    category: "character",
    folder: "2D漫-现代都市",
    name: "偶像练习生",
    color: "#9674d6",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001404",
    category: "character",
    folder: "2D漫-现代都市",
    name: "漫画编辑",
    color: "#697487",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001405",
    category: "character",
    folder: "2D漫-现代都市",
    name: "机车少年",
    color: "#1d222b",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001406",
    category: "character",
    folder: "2D漫-现代都市",
    name: "白领姐姐",
    color: "#dfe3eb",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001501",
    category: "character",
    folder: "2D漫-东方修仙",
    name: "青衣剑客",
    color: "#49766c",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001502",
    category: "character",
    folder: "2D漫-东方修仙",
    name: "白衣仙子",
    color: "#e8edf4",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001503",
    category: "character",
    folder: "2D漫-东方修仙",
    name: "黑衣魔修",
    color: "#181a22",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001504",
    category: "character",
    folder: "2D漫-东方修仙",
    name: "符箓师",
    color: "#c69b4f",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001505",
    category: "character",
    folder: "2D漫-东方修仙",
    name: "灵兽少年",
    color: "#6d7f54",
    width: 720,
    height: 960,
  },
  {
    id: "51000000-0000-4000-8000-000000001506",
    category: "character",
    folder: "2D漫-东方修仙",
    name: "宗门师姐",
    color: "#b4c0d8",
    width: 720,
    height: 960,
  },
];

const officialGeneratedAssetSlugs: Record<string, string> = {
  "character|国内仿真人-现代都市|保姆": "nanny",
  "character|国内仿真人-现代都市|医生": "doctor",
  "character|国内仿真人-现代都市|厨师": "chef",
  "character|国内仿真人-现代都市|老师": "teacher",
  "character|国内仿真人-现代都市|司机": "driver",
  "character|国内仿真人-现代都市|记者": "reporter",
  "character|国内仿真人-现代都市|保镖": "security-guard",
  "character|国内仿真人-现代都市|管家": "butler",
  "character|国内仿真人-东方古代|皇后": "empress",
  "character|国内仿真人-东方古代|皇帝": "emperor",
  "character|国内仿真人-东方古代|太监": "eunuch",
  "character|国内仿真人-东方古代|宰相": "chancellor",
  "character|国内仿真人-东方古代|和尚": "monk",
  "character|国内仿真人-东方古代|宫女": "maid",
  "character|国内仿真人-东方古代|侠客": "wanderer",
  "character|国内仿真人-东方古代|将军": "general",
  "character|3D漫-现代都市|都市男主": "3d-city-hero",
  "character|3D漫-现代都市|都市女主": "3d-city-heroine",
  "character|3D漫-现代都市|霸总": "3d-ceo",
  "character|3D漫-现代都市|助理": "3d-assistant",
  "character|3D漫-现代都市|富家千金": "3d-heiress",
  "character|3D漫-现代都市|律师": "3d-lawyer",
  "character|3D漫-东方修仙|剑修": "3d-xianxia-swordsman",
  "character|3D漫-东方修仙|仙尊": "3d-xianxia-master",
  "character|3D漫-东方修仙|魔尊": "3d-xianxia-demon",
  "character|3D漫-东方修仙|灵狐少女": "3d-xianxia-fox",
  "character|3D漫-东方修仙|丹师": "3d-xianxia-alchemist",
  "character|3D漫-东方修仙|宗门长老": "3d-xianxia-elder",
  "character|2D漫-现代都市|元气少女": "2d-city-girl",
  "character|2D漫-现代都市|冷面学长": "2d-city-senior",
  "character|2D漫-现代都市|偶像练习生": "2d-city-idol",
  "character|2D漫-现代都市|漫画编辑": "2d-city-editor",
  "character|2D漫-现代都市|机车少年": "2d-city-rider",
  "character|2D漫-现代都市|白领姐姐": "2d-city-office",
  "character|2D漫-东方修仙|青衣剑客": "2d-xianxia-green",
  "character|2D漫-东方修仙|白衣仙子": "2d-xianxia-fairy",
  "character|2D漫-东方修仙|黑衣魔修": "2d-xianxia-dark",
  "character|2D漫-东方修仙|符箓师": "2d-xianxia-talisman",
  "character|2D漫-东方修仙|灵兽少年": "2d-xianxia-beast",
  "character|2D漫-东方修仙|宗门师姐": "2d-xianxia-senior",
  "scene|国内仿真人-现代都市|车库": "scene-garage",
  "scene|国内仿真人-现代都市|别墅": "scene-villa",
  "scene|国内仿真人-现代都市|小巷": "scene-alley",
  "scene|国内仿真人-现代都市|医院": "scene-hospital",
  "scene|国内仿真人-现代都市|办公室": "scene-office",
  "scene|国内仿真人-现代都市|酒店": "scene-hotel",
  "scene|国内仿真人-现代都市|会所": "scene-club",
  "scene|国内仿真人-现代都市|机场": "scene-airport",
  "scene|国内仿真人-东方古代|牢房": "scene-ancient-prison",
  "scene|国内仿真人-东方古代|王府": "scene-ancient-mansion",
  "scene|国内仿真人-东方古代|市集": "scene-ancient-market",
  "scene|国内仿真人-东方古代|御书房": "scene-ancient-study",
  "scene|国内仿真人-东方古代|客栈": "scene-ancient-inn",
  "scene|国内仿真人-东方古代|酒楼": "scene-ancient-restaurant",
  "scene|国内仿真人-东方古代|御花园": "scene-ancient-garden",
  "scene|国内仿真人-东方古代|军营": "scene-ancient-barracks",
  "scene|3D漫-现代都市|未来公寓": "scene-3d-future-apartment",
  "scene|3D漫-现代都市|霓虹街区": "scene-3d-neon-street",
  "scene|3D漫-现代都市|直播间": "scene-3d-studio",
  "scene|3D漫-现代都市|学院广场": "scene-3d-campus",
  "scene|3D漫-现代都市|智能车库": "scene-3d-smart-garage",
  "scene|3D漫-现代都市|云端办公室": "scene-3d-cloud-office",
  "scene|3D漫-现代都市|赛博商场": "scene-3d-cyber-mall",
  "scene|3D漫-现代都市|高铁站": "scene-3d-railway",
  "scene|3D漫-东方修仙|云海仙台": "scene-3d-cloud",
  "scene|3D漫-东方修仙|灵石洞府": "scene-3d-cave",
  "scene|3D漫-东方修仙|宗门大殿": "scene-3d-sect",
  "scene|3D漫-东方修仙|秘境森林": "scene-3d-forest",
  "scene|3D漫-东方修仙|试炼山门": "scene-3d-trial-gate",
  "scene|3D漫-东方修仙|仙舟甲板": "scene-3d-airship",
  "scene|3D漫-东方修仙|丹房": "scene-3d-alchemy",
  "scene|3D漫-东方修仙|星河悬崖": "scene-3d-star-cliff",
  "scene|2D漫-现代都市|漫画公寓": "scene-2d-apartment",
  "scene|2D漫-现代都市|街角咖啡店": "scene-2d-cafe",
  "scene|2D漫-现代都市|黄昏教室": "scene-2d-classroom",
  "scene|2D漫-现代都市|天台夜景": "scene-2d-rooftop",
  "scene|2D漫-现代都市|地铁站": "scene-2d-subway",
  "scene|2D漫-现代都市|校园操场": "scene-2d-campus-playground",
  "scene|2D漫-现代都市|便利店": "scene-2d-store",
  "scene|2D漫-现代都市|城市天桥": "scene-2d-city-bridge",
  "scene|2D漫-东方修仙|莲池仙境": "scene-2d-lotus",
  "scene|2D漫-东方修仙|剑阵山门": "scene-2d-sword",
  "scene|2D漫-东方修仙|竹林秘境": "scene-2d-bamboo",
  "scene|2D漫-东方修仙|星河崖畔": "scene-2d-starry",
  "scene|2D漫-东方修仙|山谷药庐": "scene-2d-herb-hut",
  "scene|2D漫-东方修仙|灵兽庭院": "scene-2d-spirit-yard",
  "scene|2D漫-东方修仙|月下古桥": "scene-2d-moon-bridge",
  "scene|2D漫-东方修仙|仙门书阁": "scene-2d-sect-library",
  "prop|国内仿真人-现代都市|工作证": "prop-modern-badge",
  "prop|国内仿真人-现代都市|手机": "prop-modern-phone",
  "prop|国内仿真人-现代都市|公文包": "prop-modern-briefcase",
  "prop|国内仿真人-现代都市|录音笔": "prop-modern-recorder",
  "prop|国内仿真人-现代都市|医疗箱": "prop-modern-medkit",
  "prop|国内仿真人-现代都市|车钥匙": "prop-modern-car-key",
  "prop|国内仿真人-现代都市|相机": "prop-modern-camera",
  "prop|国内仿真人-现代都市|文件袋": "prop-modern-document-bag",
  "prop|国内仿真人-东方古代|刀剑": "prop-ancient-sword",
  "prop|国内仿真人-东方古代|酒壶": "prop-ancient-wine",
  "prop|国内仿真人-东方古代|令牌": "prop-ancient-token",
  "prop|国内仿真人-东方古代|圣旨": "prop-ancient-edict",
  "prop|国内仿真人-东方古代|秘密信息": "prop-ancient-secret-letter",
  "prop|国内仿真人-东方古代|毒药": "prop-ancient-poison",
  "prop|国内仿真人-东方古代|玉佩": "prop-ancient-jade",
  "prop|国内仿真人-东方古代|印玺": "prop-ancient-seal",
  "prop|3D漫-现代都市|全息终端": "prop-3d-modern-holo",
  "prop|3D漫-现代都市|智能手环": "prop-3d-modern-band",
  "prop|3D漫-现代都市|数据芯片": "prop-3d-modern-chip",
  "prop|3D漫-现代都市|电子耳麦": "prop-3d-modern-headset",
  "prop|3D漫-现代都市|悬浮滑板": "prop-3d-modern-hoverboard",
  "prop|3D漫-现代都市|机械钥匙": "prop-3d-modern-mech-key",
  "prop|3D漫-现代都市|能量饮料": "prop-3d-modern-energy",
  "prop|3D漫-现代都市|追踪器": "prop-3d-modern-tracker",
  "prop|3D漫-东方修仙|飞剑": "prop-3d-xianxia-flying-sword",
  "prop|3D漫-东方修仙|灵石": "prop-3d-xianxia-spirit-stone",
  "prop|3D漫-东方修仙|丹炉": "prop-3d-xianxia-cauldron",
  "prop|3D漫-东方修仙|玉简": "prop-3d-xianxia-jade-slip",
  "prop|3D漫-东方修仙|法阵罗盘": "prop-3d-xianxia-compass",
  "prop|3D漫-东方修仙|乾坤袋": "prop-3d-xianxia-bag",
  "prop|3D漫-东方修仙|灵兽铃": "prop-3d-xianxia-bell",
  "prop|3D漫-东方修仙|仙草匣": "prop-3d-xianxia-herb-box",
  "prop|2D漫-现代都市|书包": "prop-2d-modern-backpack",
  "prop|2D漫-现代都市|耳机": "prop-2d-modern-earphone",
  "prop|2D漫-现代都市|漫画书": "prop-2d-modern-comic",
  "prop|2D漫-现代都市|奶茶": "prop-2d-modern-milk-tea",
  "prop|2D漫-现代都市|地铁卡": "prop-2d-modern-subway-card",
  "prop|2D漫-现代都市|拍立得": "prop-2d-modern-polaroid",
  "prop|2D漫-现代都市|社团徽章": "prop-2d-modern-club-badge",
  "prop|2D漫-现代都市|便利贴": "prop-2d-modern-sticky-note",
  "prop|2D漫-东方修仙|符箓": "prop-2d-xianxia-talisman",
  "prop|2D漫-东方修仙|灵剑": "prop-2d-xianxia-sword",
  "prop|2D漫-东方修仙|药瓶": "prop-2d-xianxia-medicine",
  "prop|2D漫-东方修仙|纸伞": "prop-2d-xianxia-umbrella",
  "prop|2D漫-东方修仙|玉笛": "prop-2d-xianxia-flute",
  "prop|2D漫-东方修仙|莲花灯": "prop-2d-xianxia-lantern",
  "prop|2D漫-东方修仙|灵兽蛋": "prop-2d-xianxia-egg",
  "prop|2D漫-东方修仙|阵法卷轴": "prop-2d-xianxia-scroll",
};

function generatedOfficialPreviewPath(asset: {
  category: LibraryAssetCategory;
  folder: string;
  name: string;
}) {
  const slug = officialGeneratedAssetSlugs[officialGeneratedAssetKey(asset)];
  if (!slug) {
    return null;
  }
  if (asset.category === "character") {
    return `/assets/library/official/characters/${slug}.png`;
  }
  if (asset.category === "scene") {
    return `/assets/library/official/scenes/${slug}.png`;
  }
  if (asset.category === "prop") {
    return `/assets/library/official/props/${slug}.png`;
  }
  return null;
}

function generatedOfficialCharacterDetailPath(asset: {
  category: LibraryAssetCategory;
  folder: string;
  name: string;
}) {
  if (asset.category !== "character") {
    return null;
  }
  const slug = officialGeneratedAssetSlugs[officialGeneratedAssetKey(asset)];
  return slug ? `/assets/library/official/characters/detail/${slug}-sheet.png` : null;
}

const officialCharacterFullBodyDetailSlugs = new Set([
  "2d-city-girl",
  "2d-city-senior",
  "2d-city-idol",
  "2d-city-editor",
  "2d-city-rider",
  "2d-city-office",
  "2d-xianxia-green",
  "2d-xianxia-fairy",
  "2d-xianxia-dark",
  "2d-xianxia-talisman",
  "2d-xianxia-beast",
  "2d-xianxia-senior",
]);

function officialGeneratedAssetKey(asset: {
  category: LibraryAssetCategory;
  folder: string;
  name: string;
}) {
  return `${asset.category}|${asset.folder}|${asset.name}`;
}

export async function ensureDefaultOfficialLibraryAssets(
  db: SqlDatabase,
  input: { now: Date },
) {
  for (const asset of officialAssets) {
    const generatedPreviewPath = asset.previewAssetPath ?? generatedOfficialPreviewPath(asset);
    const generatedDetailAssetPath =
      asset.detailAssetPath ?? generatedOfficialCharacterDetailPath(asset);
    const previewUrl = generatedPreviewPath ?? buildOfficialPreviewSvg(asset);
    const storageObjectKey = generatedPreviewPath
      ? generatedPreviewPath.replace(/^\/assets\/library\//, "")
      : `official/${asset.category}/${asset.name}.svg`;
    const mimeType = generatedPreviewPath ? "image/png" : "image/svg+xml";
    const metadata: Record<string, unknown> = {
      source: generatedPreviewPath ? "official_seed_imagegen" : "official_seed",
    };

    if (generatedDetailAssetPath) {
      const detailBasePath = generatedDetailAssetPath.replace(/-sheet\.png$/, "");
      const detailSlug = detailBasePath.match(/\/([^/]+)$/)?.[1] ?? "";
      const fullBodyPath = officialCharacterFullBodyDetailSlugs.has(detailSlug)
        ? `${detailBasePath}-full-body.png`
        : previewUrl;
      metadata.detailViews = {
        turnaround: generatedDetailAssetPath,
        front: `${detailBasePath}-front.png`,
        side: `${detailBasePath}-side.png`,
        back: `${detailBasePath}-back.png`,
        fullBody: fullBodyPath,
      };
    }

    await upsertLibraryAssetWithVersion(db, {
      asset: {
        id: asset.id,
        scope: "official",
        organizationId: null,
        workspaceId: null,
        createdByUserId: null,
        assetType: asset.category,
        category: asset.category,
        folder: asset.folder,
        name: asset.name,
        description: `${asset.name}官方参考资产`,
        tags: [],
        status: "active",
        requiresProEntitlement: false,
        createdAt: input.now,
        updatedAt: input.now,
      },
      version: {
        id: officialVersionIdFor(asset.id),
        versionNumber: 1,
        storageObjectKey,
        previewUrl,
        mimeType,
        width: asset.width,
        height: asset.height,
        metadata,
        createdAt: input.now,
      },
    });
  }
}

export async function upsertLibraryAssetWithVersion(
  db: SqlDatabase,
  input: {
    asset: LibraryAssetRecord;
    version: Omit<LibraryAssetVersionRecord, "libraryAssetId">;
  },
) {
  await db.query(
    `
      INSERT INTO library_assets (
        id,
        scope,
        organization_id,
        workspace_id,
        created_by_user_id,
        asset_type,
        category,
        folder,
        name,
        description,
        tags_json,
        status,
        requires_pro_entitlement,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11::jsonb, $12, $13, $14, $15)
      ON CONFLICT (id) DO UPDATE
      SET folder = EXCLUDED.folder,
          name = EXCLUDED.name,
          description = EXCLUDED.description,
          tags_json = EXCLUDED.tags_json,
          status = EXCLUDED.status,
          requires_pro_entitlement = EXCLUDED.requires_pro_entitlement,
          updated_at = EXCLUDED.updated_at
    `,
    [
      input.asset.id,
      input.asset.scope,
      input.asset.organizationId,
      input.asset.workspaceId,
      input.asset.createdByUserId,
      input.asset.assetType,
      input.asset.category,
      input.asset.folder,
      input.asset.name,
      input.asset.description,
      JSON.stringify(input.asset.tags),
      input.asset.status,
      input.asset.requiresProEntitlement,
      input.asset.createdAt,
      input.asset.updatedAt,
    ],
  );

  await db.query(
    `
      INSERT INTO library_asset_versions (
        id,
        library_asset_id,
        version_number,
        storage_object_key,
        preview_url,
        mime_type,
        width,
        height,
        metadata_json,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9::jsonb, $10)
      ON CONFLICT (library_asset_id, version_number) DO UPDATE
      SET storage_object_key = EXCLUDED.storage_object_key,
          preview_url = EXCLUDED.preview_url,
          mime_type = EXCLUDED.mime_type,
          width = EXCLUDED.width,
          height = EXCLUDED.height,
          metadata_json = EXCLUDED.metadata_json
    `,
    [
      input.version.id,
      input.asset.id,
      input.version.versionNumber,
      input.version.storageObjectKey,
      input.version.previewUrl,
      input.version.mimeType,
      input.version.width,
      input.version.height,
      JSON.stringify(input.version.metadata),
      input.version.createdAt,
    ],
  );
}

export async function listLibraryAssetsForActor(
  db: SqlDatabase,
  input: {
    actor: ActorContext;
    scope: LibraryAssetScope;
    category?: LibraryAssetCategory | null;
    folder?: string | null;
    query?: string | null;
    now: Date;
  },
) {
  const entitlement = await resolveLibraryEntitlement(db, {
    actor: input.actor,
    now: input.now,
  });

  if (input.scope === "team" && !entitlement.hasTeamAssetLibrary) {
    return {
      scope: input.scope,
      categories,
      folders: [] as string[],
      assets: [] as ListedLibraryAsset[],
      entitlement,
    };
  }

  const conditions = ["la.status = 'active'", "la.scope = $1"];
  const params: unknown[] = [input.scope];

  if (input.scope === "team") {
    params.push(input.actor.organizationId, input.actor.workspaceId);
    conditions.push(`la.organization_id = $${params.length - 1}`);
    conditions.push(`la.workspace_id = $${params.length}`);
  } else if (input.scope === "personal") {
    params.push(input.actor.organizationId, input.actor.workspaceId, input.actor.actorId);
    conditions.push(`la.organization_id = $${params.length - 2}`);
    conditions.push(`la.workspace_id = $${params.length - 1}`);
    conditions.push(`la.created_by_user_id = $${params.length}`);
  }

  const searchQuery = input.query?.trim();

  if (input.category && !searchQuery) {
    params.push(input.category);
    conditions.push(`la.category = $${params.length}`);
  }

  const folderConditions = [...conditions];
  const folderParams = [...params];

  if (input.folder && !searchQuery) {
    params.push(input.folder);
    conditions.push(`la.folder = $${params.length}`);
  }

  if (searchQuery) {
    params.push(`%${searchQuery.toLowerCase()}%`);
    conditions.push(`(
      LOWER(la.name) LIKE $${params.length}
      OR LOWER(COALESCE(la.description, '')) LIKE $${params.length}
      OR LOWER(la.tags_json::text) LIKE $${params.length}
    )`);
  }

  const rows = await db.query<LibraryAssetRow>(
    `
      SELECT
        la.*,
        lav.id AS version_id,
        lav.version_number,
        lav.storage_object_key,
        lav.preview_url,
        lav.mime_type,
        lav.width,
        lav.height,
        lav.metadata_json,
        lav.created_at AS version_created_at
      FROM library_assets la
      JOIN LATERAL (
        SELECT *
        FROM library_asset_versions
        WHERE library_asset_id = la.id
        ORDER BY version_number DESC
        LIMIT 1
      ) lav ON true
      WHERE ${conditions.join(" AND ")}
      ORDER BY la.updated_at DESC, la.name ASC
    `,
    params,
  );

  const assets = rows.rows.map(libraryAssetFromRow);
  const folderRows = await db.query<{ folder: string }>(
    `
      SELECT la.folder
      FROM library_assets la
      WHERE ${folderConditions.join(" AND ")}
      GROUP BY la.folder
      ORDER BY MIN(la.id::text) ASC
    `,
    folderParams,
  );

  return {
    scope: input.scope,
    categories,
    folders: folderRows.rows.map((row) => row.folder),
    assets,
    entitlement,
  };
}

async function resolveLibraryEntitlement(
  db: SqlDatabase,
  input: { actor: ActorContext; now: Date },
) {
  const row = await queryOne<{ id: string }>(
    db,
    `
      SELECT id
      FROM organization_entitlements
      WHERE organization_id = $1
        AND entitlement_key = 'team_asset_library'
        AND status = 'active'
        AND (expires_at IS NULL OR expires_at > $2)
      LIMIT 1
    `,
    [input.actor.organizationId, input.now],
  );

  return {
    hasTeamAssetLibrary: Boolean(row),
    blockReason: row ? null : "team_asset_library_entitlement_required",
  };
}

function libraryAssetFromRow(row: LibraryAssetRow): ListedLibraryAsset {
  const metadata = normalizeJsonObject(row.metadata_json);
  const latestVersion = {
    id: row.version_id,
    libraryAssetId: row.id,
    versionNumber: Number(row.version_number),
    storageObjectKey: row.storage_object_key,
    previewUrl: row.preview_url,
    mimeType: row.mime_type,
    width: Number(row.width),
    height: Number(row.height),
    metadata,
    createdAt: new Date(row.version_created_at),
  };

  return {
    id: row.id,
    scope: row.scope,
    organizationId: row.organization_id,
    workspaceId: row.workspace_id,
    createdByUserId: row.created_by_user_id,
    assetType: row.asset_type,
    category: row.category,
    folder: row.folder,
    name: row.name,
    description: row.description,
    tags: normalizeJsonArray(row.tags_json),
    status: row.status,
    requiresProEntitlement: row.requires_pro_entitlement,
    createdAt: new Date(row.created_at),
    updatedAt: new Date(row.updated_at),
    previewUrl: row.preview_url,
    latestVersion,
  };
}

function normalizeJsonObject(value: Record<string, unknown> | string) {
  return typeof value === "string" ? JSON.parse(value) : value;
}

function normalizeJsonArray(value: string[] | string) {
  return Array.isArray(value) ? value : (JSON.parse(value) as string[]);
}

function officialVersionIdFor(assetId: string) {
  return assetId.replace("51000000", "52000000");
}

type OfficialPreviewAsset = {
  id: string;
  category: LibraryAssetCategory;
  folder: string;
  name: string;
  color: string;
};

interface CharacterPreviewProfile {
  body: string;
  sleeve: string;
  lower: string;
  trim: string;
  accent: string;
  hair: string;
  bg: string;
  outfit:
    | "apron"
    | "doctor"
    | "chef"
    | "teacher"
    | "uniform"
    | "reporter"
    | "suit"
    | "tuxedo"
    | "imperial"
    | "court"
    | "monk"
    | "maid"
    | "wanderer"
    | "armor"
    | "urban3d"
    | "dress3d"
    | "xianxia3d"
    | "animeCity"
    | "animeXianxia";
  headwear?: "cap" | "chefHat" | "crown" | "emperorCrown" | "courtHat" | "bun" | "fox" | "beast";
  accessory?:
    | "stethoscope"
    | "book"
    | "wheel"
    | "mic"
    | "badge"
    | "sunglasses"
    | "beads"
    | "sword"
    | "fan"
    | "talisman"
    | "potion"
    | "halo";
}

function buildOfficialPreviewSvg(asset: OfficialPreviewAsset) {
  const { name, category, color } = asset;
  if (category === "scene") {
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1280 720">
        ${buildScenePreviewBody(name, color)}
      </svg>
    `)}`;
  }

  if (category === "prop") {
    return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
      <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 960 720">
        ${buildPropPreviewBody(asset)}
      </svg>
    `)}`;
  }

  return buildCharacterPreviewSvg(asset);
}

function buildPropPreviewBody(asset: OfficialPreviewAsset) {
  const profile = propPreviewProfile(asset);
  return `
    <defs>
      <linearGradient id="propBg" x1="0" x2="1" y1="0" y2="1">
        <stop offset="0" stop-color="${profile.bgA}"/>
        <stop offset="1" stop-color="${profile.bgB}"/>
      </linearGradient>
      <radialGradient id="propGlow" cx=".44" cy=".24" r=".76">
        <stop offset="0" stop-color="#ffffff" stop-opacity=".78"/>
        <stop offset=".5" stop-color="${profile.glow}" stop-opacity=".22"/>
        <stop offset="1" stop-color="${profile.glow}" stop-opacity="0"/>
      </radialGradient>
      <filter id="propShadow" x="-30%" y="-30%" width="160%" height="170%">
        <feDropShadow dx="0" dy="24" stdDeviation="24" flood-color="#0d1018" flood-opacity=".22"/>
      </filter>
    </defs>
    <rect width="960" height="720" rx="28" fill="url(#propBg)"/>
    <rect width="960" height="720" rx="28" fill="url(#propGlow)"/>
    <path d="M96 120c148-72 282-90 402-52c120 38 238 18 366-58v168c-132 72-248 88-366 50c-124-40-254-18-402 62z" fill="${profile.accent}" opacity=".08"/>
    <ellipse cx="480" cy="610" rx="245" ry="34" fill="#111722" opacity=".12"/>
    <g filter="url(#propShadow)">
      ${renderPropGlyph(profile)}
    </g>
  `;
}

function propPreviewProfile(asset: OfficialPreviewAsset) {
  const id = String(asset.id ?? "");
  const name = String(asset.name ?? "");
  const folder = String(asset.folder ?? "");
  const isAncient = folder.includes("东方古代");
  const isXianxia = folder.includes("修仙");
  const isAnime = folder.includes("2D漫");
  const is3d = folder.includes("3D漫");
  const profile = {
    kind: "document",
    bgA: isAnime ? "#fff7fb" : isXianxia ? "#edf8f4" : isAncient ? "#fbf0df" : is3d ? "#edf3ff" : "#f7f8fb",
    bgB: isAnime ? "#e8eefc" : isXianxia ? "#d7eee5" : isAncient ? "#ead2aa" : is3d ? "#dce8ff" : "#e6ebf4",
    body: isAnime ? "#a48bea" : isXianxia ? "#65a58b" : isAncient ? "#b28a4d" : is3d ? "#5d7eba" : asset.color,
    body2: isAnime ? "#5667a4" : isXianxia ? "#2f6f68" : isAncient ? "#7a5030" : is3d ? "#263a64" : "#56657a",
    accent: isAnime ? "#ff9dbf" : isXianxia ? "#93dec8" : isAncient ? "#d5a853" : is3d ? "#7bd7ff" : "#c59cff",
    trim: "#ffffff",
    dark: "#202734",
    glow: isAnime ? "#ffcce1" : isXianxia ? "#b7fff0" : isAncient ? "#ffe3a8" : is3d ? "#bde7ff" : "#d7c8ff",
  };
  const has = (values: string[]) => values.some((value) => name.includes(value) || id.includes(value));
  if (has(["剑", "刀", "sword"])) return { ...profile, kind: "blade" };
  if (has(["壶", "毒药", "药瓶", "奶茶", "饮料", "bottle"])) return { ...profile, kind: "bottle" };
  if (has(["手机", "终端", "手环", "芯片", "耳麦", "追踪器", "录音笔", "相机"])) return { ...profile, kind: "tech" };
  if (has(["令牌", "玉佩", "印玺", "灵石", "罗盘", "徽章", "铃", "蛋", "灯", "笛"])) return { ...profile, kind: "ornament" };
  if (has(["书包", "公文包", "医疗箱", "乾坤袋", "匣"])) return { ...profile, kind: "case" };
  if (has(["纸伞", "滑板"])) return { ...profile, kind: "long" };
  return profile;
}

function renderPropGlyph(profile: ReturnType<typeof propPreviewProfile>) {
  if (profile.kind === "blade") {
    return `<path d="M500 96 562 410 500 574 438 410Z" fill="#edf3fa"/><path d="M500 110 524 408 500 522 476 408Z" fill="#cfd9e8"/><rect x="402" y="398" width="196" height="28" rx="14" fill="${profile.accent}"/><rect x="468" y="410" width="64" height="124" rx="20" fill="${profile.body2}"/><circle cx="500" cy="568" r="26" fill="${profile.accent}"/>`;
  }
  if (profile.kind === "bottle") {
    return `<rect x="438" y="112" width="84" height="70" rx="24" fill="${profile.body2}"/><path d="M420 178h120l18 62c78 72 84 224 24 292H378c-60-68-54-220 24-292z" fill="${profile.body}"/><path d="M406 282c48 34 100 38 158 12v170c-44 32-104 34-168 6z" fill="${profile.trim}" opacity=".28"/><path d="M438 238c34 20 78 22 118 4" stroke="#ffffff" stroke-width="14" stroke-linecap="round" opacity=".45"/>`;
  }
  if (profile.kind === "tech") {
    return `<rect x="348" y="136" width="264" height="424" rx="48" fill="${profile.dark}"/><rect x="380" y="186" width="200" height="284" rx="28" fill="${profile.body}"/><circle cx="480" cy="510" r="22" fill="${profile.accent}"/><path d="M414 246h132M414 306h96M414 366h152" stroke="${profile.trim}" stroke-width="16" stroke-linecap="round" opacity=".72"/><circle cx="572" cy="178" r="10" fill="${profile.accent}"/>`;
  }
  if (profile.kind === "ornament") {
    return `<circle cx="480" cy="328" r="148" fill="${profile.body}"/><circle cx="480" cy="328" r="104" fill="${profile.trim}" opacity=".22"/><path d="M480 172 516 276 626 276 536 340 570 448 480 382 390 448 424 340 334 276 444 276z" fill="${profile.accent}"/><path d="M480 96v80M480 480v104M300 328h78M582 328h78" stroke="${profile.body2}" stroke-width="18" stroke-linecap="round"/>`;
  }
  if (profile.kind === "case") {
    return `<rect x="314" y="214" width="332" height="286" rx="34" fill="${profile.body}"/><path d="M404 214v-42c0-24 20-44 44-44h64c24 0 44 20 44 44v42" fill="none" stroke="${profile.body2}" stroke-width="28" stroke-linecap="round"/><rect x="314" y="304" width="332" height="42" fill="${profile.body2}" opacity=".5"/><rect x="452" y="294" width="56" height="66" rx="10" fill="${profile.accent}"/><path d="M356 438h248" stroke="${profile.trim}" stroke-width="20" stroke-linecap="round" opacity=".42"/>`;
  }
  if (profile.kind === "long") {
    return `<path d="M250 296c112-132 350-132 460 0z" fill="${profile.body}"/><path d="M250 296c112-70 350-70 460 0" fill="${profile.trim}" opacity=".25"/><path d="M480 148v360c0 48-42 70-78 38" fill="none" stroke="${profile.body2}" stroke-width="22" stroke-linecap="round"/><path d="M314 296h332" stroke="${profile.accent}" stroke-width="14" stroke-linecap="round"/>`;
  }
  return `<rect x="338" y="126" width="284" height="438" rx="28" fill="${profile.trim}"/><rect x="366" y="158" width="228" height="374" rx="14" fill="${profile.body}" opacity=".22"/><path d="M402 236h156M402 300h118M402 364h156M402 428h92" stroke="${profile.body2}" stroke-width="20" stroke-linecap="round"/><rect x="404" y="462" width="154" height="42" rx="10" fill="${profile.accent}"/>`;
}

function buildCharacterPreviewSvg(asset: OfficialPreviewAsset) {
  const profile = characterPreviewProfile(asset);
  return `data:image/svg+xml;charset=UTF-8,${encodeURIComponent(`
    <svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 720 960">
      <defs>
        <linearGradient id="bg" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="#ffffff"/>
          <stop offset="1" stop-color="${profile.bg}"/>
        </linearGradient>
        <linearGradient id="body" x1="0" x2="1" y1="0" y2="1">
          <stop offset="0" stop-color="${profile.body}"/>
          <stop offset="1" stop-color="${profile.sleeve}"/>
        </linearGradient>
      </defs>
      <rect width="720" height="960" rx="28" fill="url(#bg)"/>
      <path d="M58 136C168 68 270 44 380 78c106 33 190 6 286-34v226c-94 42-190 44-286 10C270 242 170 270 58 342Z" fill="${profile.trim}" opacity=".08"/>
      <path d="M92 782c132-58 256-74 390-34 62 18 102 22 146 12v102H92Z" fill="${profile.accent}" opacity=".08"/>
      ${buildCharacterAura(profile)}
      <ellipse cx="360" cy="884" rx="168" ry="25" fill="#141820" opacity=".13"/>
      ${buildBackAccessory(profile)}
      ${buildCharacterLegs(profile)}
      ${buildCharacterSleeves(profile)}
      ${buildCharacterTorso(profile)}
      ${buildCharacterHead(profile)}
      ${buildCharacterAccessory(profile)}
    </svg>
  `)}`;
}

function characterPreviewProfile(asset: OfficialPreviewAsset): CharacterPreviewProfile {
  const fallback: CharacterPreviewProfile = {
    body: asset.color,
    sleeve: asset.color,
    lower: "#20242c",
    trim: "#8f98a8",
    accent: "#c59cff",
    hair: "#20242c",
    bg: "#f6f7fb",
    outfit: "urban3d",
  };
  const profiles: Record<string, CharacterPreviewProfile> = {
    "0101": { ...fallback, body: "#d1ad82", sleeve: "#8a6b4b", lower: "#5a3b2e", trim: "#5d3b25", accent: "#d9c0a0", outfit: "apron", headwear: "bun" },
    "0102": { ...fallback, body: "#f0f4fb", sleeve: "#dbe6f3", lower: "#1d2532", trim: "#6c7f95", accent: "#80b6d9", outfit: "doctor", accessory: "stethoscope" },
    "0103": { ...fallback, body: "#f7f4ee", sleeve: "#e9e3d6", lower: "#23262d", trim: "#c9bca8", accent: "#f3c96b", outfit: "chef", headwear: "chefHat" },
    "0104": { ...fallback, body: "#d8dae8", sleeve: "#aeb7c8", lower: "#7b7f8d", trim: "#4c566b", accent: "#b8a0d7", outfit: "teacher", accessory: "book", headwear: "bun" },
    "0105": { ...fallback, body: "#202734", sleeve: "#111821", lower: "#151a22", trim: "#596274", accent: "#f0f0f0", outfit: "uniform", headwear: "cap", accessory: "wheel" },
    "0106": { ...fallback, body: "#d2d9e4", sleeve: "#b9c1ce", lower: "#171c25", trim: "#3e6fa0", accent: "#c23d49", outfit: "reporter", accessory: "mic" },
    "0107": { ...fallback, body: "#14171d", sleeve: "#262a33", lower: "#101318", trim: "#6e7685", accent: "#ffffff", outfit: "suit", accessory: "sunglasses" },
    "0108": { ...fallback, body: "#242936", sleeve: "#11151d", lower: "#151821", trim: "#ffffff", accent: "#c9a66b", outfit: "tuxedo", accessory: "badge" },
    "1101": { ...fallback, body: "#6b3f1e", sleeve: "#171210", lower: "#312016", trim: "#d8a326", accent: "#e6c56d", hair: "#1a1412", bg: "#fbf3e7", outfit: "imperial", headwear: "crown", accessory: "fan" },
    "1102": { ...fallback, body: "#d8a326", sleeve: "#7f271f", lower: "#4f2814", trim: "#b91f24", accent: "#e9c45e", hair: "#1d1714", bg: "#fbf4df", outfit: "imperial", headwear: "emperorCrown" },
    "1103": { ...fallback, body: "#496f94", sleeve: "#9aaec8", lower: "#1f2530", trim: "#243047", accent: "#c8d1dd", hair: "#1b1d22", bg: "#eef4fb", outfit: "court", headwear: "courtHat" },
    "1104": { ...fallback, body: "#7a2424", sleeve: "#2d1a1a", lower: "#301818", trim: "#c7a058", accent: "#d6b66d", hair: "#171210", bg: "#fbefeb", outfit: "court", headwear: "courtHat" },
    "1105": { ...fallback, body: "#d19a35", sleeve: "#e1b75b", lower: "#7c4b21", trim: "#7c4b21", accent: "#b97b35", hair: "#6f4a2f", bg: "#f8f0dc", outfit: "monk", accessory: "beads" },
    "1106": { ...fallback, body: "#b8cfe2", sleeve: "#e5edf5", lower: "#809fbd", trim: "#7ba4c4", accent: "#d7b5cb", hair: "#1b1718", bg: "#f4f8fb", outfit: "maid", headwear: "bun" },
    "1107": { ...fallback, body: "#34443f", sleeve: "#7d8a78", lower: "#2a2926", trim: "#8b5f37", accent: "#c8d1ba", hair: "#181717", bg: "#edf2ed", outfit: "wanderer", accessory: "sword" },
    "1108": { ...fallback, body: "#1b1f25", sleeve: "#2d3139", lower: "#13171e", trim: "#c29b4b", accent: "#6b5c45", hair: "#151515", bg: "#f0eee8", outfit: "armor", accessory: "sword", headwear: "courtHat" },
    "1201": { ...fallback, body: "#303642", sleeve: "#677283", lower: "#141922", trim: "#a9b7c9", accent: "#70b7ff", outfit: "urban3d" },
    "1202": { ...fallback, body: "#d7c7ba", sleeve: "#f0e7dd", lower: "#1d222c", trim: "#a47b65", accent: "#e8b4c1", outfit: "dress3d", headwear: "bun" },
    "1203": { ...fallback, body: "#12151b", sleeve: "#232936", lower: "#0f1218", trim: "#ffffff", accent: "#7a88ff", outfit: "suit" },
    "1204": { ...fallback, body: "#63718a", sleeve: "#c4cad6", lower: "#242b38", trim: "#eef2fa", accent: "#86c3df", outfit: "urban3d", accessory: "badge" },
    "1205": { ...fallback, body: "#bfa5bd", sleeve: "#efd7e8", lower: "#6b526e", trim: "#f4eff6", accent: "#dca4c5", outfit: "dress3d", headwear: "bun" },
    "1206": { ...fallback, body: "#20252f", sleeve: "#384255", lower: "#151a22", trim: "#e7edf6", accent: "#8fa6c6", outfit: "suit", accessory: "book" },
    "1301": { ...fallback, body: "#2c3344", sleeve: "#b8c2d7", lower: "#1d2433", trim: "#8ea7d8", accent: "#8bd7ff", bg: "#eef5ff", outfit: "xianxia3d", accessory: "sword" },
    "1302": { ...fallback, body: "#e8e9f2", sleeve: "#cfd7e8", lower: "#7c869b", trim: "#a99cff", accent: "#ffffff", bg: "#f6f7ff", outfit: "xianxia3d", accessory: "halo" },
    "1303": { ...fallback, body: "#231824", sleeve: "#4e1725", lower: "#161017", trim: "#b13d57", accent: "#6a233b", bg: "#f7eef3", outfit: "xianxia3d", accessory: "sword" },
    "1304": { ...fallback, body: "#d7c3af", sleeve: "#f3e1d0", lower: "#5a4150", trim: "#d79fbe", accent: "#f1c5dc", hair: "#31202c", bg: "#fff6fb", outfit: "xianxia3d", headwear: "fox" },
    "1305": { ...fallback, body: "#4f6c5e", sleeve: "#9eb8a8", lower: "#2b3831", trim: "#d2bd75", accent: "#89d9a6", bg: "#eef8f1", outfit: "xianxia3d", accessory: "potion" },
    "1306": { ...fallback, body: "#6c6f83", sleeve: "#c2c6d2", lower: "#313441", trim: "#b6a27a", accent: "#d5d0bf", hair: "#4b4b4f", bg: "#f3f2ee", outfit: "xianxia3d", accessory: "book" },
    "1401": { ...fallback, body: "#f0a6b4", sleeve: "#ffd8e0", lower: "#4c5870", trim: "#ffffff", accent: "#ffca66", hair: "#2a2535", bg: "#fff4f7", outfit: "animeCity", headwear: "bun" },
    "1402": { ...fallback, body: "#313849", sleeve: "#576075", lower: "#1c2230", trim: "#e7edf8", accent: "#8db0ff", hair: "#12151d", bg: "#eef2fb", outfit: "animeCity", accessory: "book" },
    "1403": { ...fallback, body: "#9674d6", sleeve: "#d7c3ff", lower: "#25233c", trim: "#ffffff", accent: "#ffc6e0", hair: "#2c2442", bg: "#f7f1ff", outfit: "animeCity", accessory: "mic" },
    "1404": { ...fallback, body: "#697487", sleeve: "#c8cfdb", lower: "#242934", trim: "#f2f4fa", accent: "#ffb469", hair: "#22252d", bg: "#f3f5f8", outfit: "animeCity", accessory: "book" },
    "1405": { ...fallback, body: "#1d222b", sleeve: "#56616f", lower: "#11161f", trim: "#e35d5d", accent: "#ffd166", hair: "#111318", bg: "#f4f1ec", outfit: "animeCity", accessory: "wheel" },
    "1406": { ...fallback, body: "#dfe3eb", sleeve: "#9ca7ba", lower: "#252b38", trim: "#6c7c9a", accent: "#8ed0c8", hair: "#2f2730", bg: "#f7f8fb", outfit: "animeCity", accessory: "badge" },
    "1501": { ...fallback, body: "#49766c", sleeve: "#c7d8d1", lower: "#243a37", trim: "#b8d7ca", accent: "#7bd0b7", bg: "#edf8f5", outfit: "animeXianxia", accessory: "sword" },
    "1502": { ...fallback, body: "#e8edf4", sleeve: "#c9d6ec", lower: "#7c8ba4", trim: "#f6fbff", accent: "#c7b6ff", hair: "#20212a", bg: "#f7f8ff", outfit: "animeXianxia", accessory: "halo" },
    "1503": { ...fallback, body: "#181a22", sleeve: "#383040", lower: "#11121a", trim: "#8a496f", accent: "#c0486a", hair: "#111116", bg: "#f6eef4", outfit: "animeXianxia", accessory: "sword" },
    "1504": { ...fallback, body: "#c69b4f", sleeve: "#ead7a7", lower: "#534329", trim: "#8f5f29", accent: "#dfb45e", hair: "#241f1a", bg: "#fbf5e8", outfit: "animeXianxia", accessory: "talisman" },
    "1505": { ...fallback, body: "#6d7f54", sleeve: "#c2d0a8", lower: "#334229", trim: "#d9e4ad", accent: "#b6d76d", hair: "#2a3023", bg: "#f3f8ed", outfit: "animeXianxia", headwear: "beast" },
    "1506": { ...fallback, body: "#b4c0d8", sleeve: "#e1e7f3", lower: "#5e6b86", trim: "#7186b0", accent: "#d8a7c8", hair: "#232530", bg: "#f5f6fb", outfit: "animeXianxia", headwear: "bun" },
  };
  return profiles[asset.id.slice(-4)] ?? fallback;
}

function buildCharacterAura(profile: CharacterPreviewProfile) {
  if (!["xianxia3d", "animeXianxia"].includes(profile.outfit)) {
    return "";
  }
  return `
    <circle cx="360" cy="330" r="224" fill="${profile.accent}" opacity=".08"/>
    <path d="M144 356c104-96 310-126 432-20" stroke="${profile.accent}" stroke-width="10" stroke-linecap="round" opacity=".22" fill="none"/>
  `;
}

function buildBackAccessory(profile: CharacterPreviewProfile) {
  if (profile.accessory !== "sword") {
    return "";
  }
  return `
    <path d="M520 188 232 732" stroke="${profile.trim}" stroke-width="18" stroke-linecap="round" opacity=".76"/>
    <path d="M548 142 500 216" stroke="${profile.accent}" stroke-width="13" stroke-linecap="round"/>
    <path d="M256 688 204 784" stroke="#2b2f38" stroke-width="22" stroke-linecap="round"/>
  `;
}

function buildCharacterLegs(profile: CharacterPreviewProfile) {
  if (["imperial", "court", "monk", "maid", "wanderer", "armor", "xianxia3d", "animeXianxia", "dress3d"].includes(profile.outfit)) {
    return `
      <path d="M268 696h184l34 190H234Z" fill="${profile.lower}" opacity=".94"/>
      <path d="M330 704v176" stroke="${profile.trim}" stroke-width="10" opacity=".45"/>
      <rect x="236" y="874" width="122" height="28" rx="14" fill="#17191f"/>
      <rect x="362" y="874" width="122" height="28" rx="14" fill="#17191f"/>
    `;
  }
  return `
    <rect x="270" y="670" width="76" height="208" rx="30" fill="${profile.lower}"/>
    <rect x="374" y="670" width="76" height="208" rx="30" fill="${profile.lower}"/>
    <rect x="238" y="874" width="126" height="28" rx="14" fill="#17191f"/>
    <rect x="356" y="874" width="126" height="28" rx="14" fill="#17191f"/>
  `;
}

function buildCharacterSleeves(profile: CharacterPreviewProfile) {
  if (["imperial", "court", "monk", "maid", "wanderer", "xianxia3d", "animeXianxia"].includes(profile.outfit)) {
    return `
      <path d="M272 286 170 538c-14 34 4 74 42 82l74 16 38-286Z" fill="${profile.sleeve}"/>
      <path d="M448 286 550 538c14 34-4 74-42 82l-74 16-38-286Z" fill="${profile.sleeve}"/>
    `;
  }
  if (profile.outfit === "armor") {
    return `
      <path d="M240 312h-80l-20 86 102 34Z" fill="${profile.trim}"/>
      <path d="M480 312h80l20 86-102 34Z" fill="${profile.trim}"/>
      <rect x="192" y="392" width="76" height="214" rx="32" fill="${profile.sleeve}"/>
      <rect x="452" y="392" width="76" height="214" rx="32" fill="${profile.sleeve}"/>
    `;
  }
  return `
    <rect x="196" y="304" width="76" height="300" rx="34" fill="${profile.sleeve}"/>
    <rect x="448" y="304" width="76" height="300" rx="34" fill="${profile.sleeve}"/>
  `;
}

function buildCharacterTorso(profile: CharacterPreviewProfile) {
  const robe = `
    <path d="M250 260h220l58 448H192Z" fill="url(#body)"/>
    <path d="M360 266 244 704h232Z" fill="${profile.body}" opacity=".88"/>
    <path d="M250 444h220" stroke="${profile.trim}" stroke-width="18" stroke-linecap="round"/>
    <path d="M360 274v426" stroke="${profile.trim}" stroke-width="8" opacity=".5"/>
  `;
  const modern = `
    <rect x="252" y="258" width="216" height="428" rx="74" fill="url(#body)"/>
    <path d="M278 286c42 42 122 42 164 0" stroke="${profile.trim}" stroke-width="16" stroke-linecap="round" opacity=".72"/>
    <path d="M360 298v360" stroke="${profile.trim}" stroke-width="7" stroke-linecap="round" opacity=".58"/>
  `;
  switch (profile.outfit) {
    case "doctor":
      return `
        <rect x="252" y="258" width="216" height="428" rx="46" fill="#f7f9fd"/>
        <path d="M292 266 360 392l68-126" fill="#e4ebf5"/>
        <path d="M360 300v360" stroke="${profile.trim}" stroke-width="8" opacity=".55"/>
        <rect x="322" y="424" width="76" height="22" rx="11" fill="#6d88a5" opacity=".5"/>
      `;
    case "chef":
      return `
        <rect x="252" y="258" width="216" height="428" rx="56" fill="#fbfaf5"/>
        <path d="M318 300h84v364h-84Z" fill="#e2ddd0"/>
        <circle cx="332" cy="374" r="8" fill="#c7b99e"/>
        <circle cx="388" cy="374" r="8" fill="#c7b99e"/>
        <path d="M274 292c44 34 128 34 172 0" stroke="${profile.trim}" stroke-width="12" stroke-linecap="round" opacity=".55"/>
      `;
    case "teacher":
      return `
        <path d="M260 258h200l32 296-80 136H308l-80-136Z" fill="url(#body)"/>
        <path d="M312 500h96l46 186H266Z" fill="${profile.lower}"/>
        <path d="M306 280h108v120H306Z" fill="#f4f2ec" opacity=".9"/>
      `;
    case "uniform":
      return `
        <rect x="252" y="258" width="216" height="428" rx="48" fill="${profile.body}"/>
        <path d="M288 288h144l26 82H262Z" fill="${profile.sleeve}"/>
        <path d="M316 332h88" stroke="${profile.accent}" stroke-width="12" stroke-linecap="round"/>
      `;
    case "reporter":
      return `
        ${modern}
        <rect x="302" y="328" width="116" height="84" rx="14" fill="#ffffff" opacity=".72"/>
        <path d="M316 354h88M316 382h64" stroke="${profile.trim}" stroke-width="10" stroke-linecap="round"/>
      `;
    case "suit":
    case "tuxedo":
      return `
        <rect x="252" y="258" width="216" height="428" rx="50" fill="${profile.body}"/>
        <path d="M288 258 360 418l72-160v428H288Z" fill="${profile.sleeve}" opacity=".9"/>
        <path d="M314 276 360 356l46-80" fill="${profile.trim}"/>
        <path d="M348 360h24l18 132h-60Z" fill="${profile.accent}"/>
      `;
    case "imperial":
      return `
        ${robe}
        <path d="M292 326c38 52 98 52 136 0" stroke="${profile.accent}" stroke-width="16" stroke-linecap="round"/>
        <path d="M284 526h152M306 594h108" stroke="${profile.accent}" stroke-width="12" stroke-linecap="round" opacity=".74"/>
      `;
    case "court":
      return `
        ${robe}
        <path d="M306 322h108v112H306Z" fill="${profile.accent}" opacity=".24"/>
      `;
    case "monk":
      return `
        <path d="M254 258h214l54 440H198Z" fill="${profile.body}"/>
        <path d="M250 300c78 28 150 130 210 318" stroke="${profile.sleeve}" stroke-width="62" opacity=".9"/>
        <path d="M270 478h180" stroke="${profile.trim}" stroke-width="14" stroke-linecap="round"/>
      `;
    case "maid":
      return `
        <path d="M250 258h220l48 440H202Z" fill="${profile.body}"/>
        <path d="M296 278h128l38 142H258Z" fill="#eef5fb"/>
        <path d="M270 484h180" stroke="${profile.trim}" stroke-width="14" stroke-linecap="round"/>
      `;
    case "wanderer":
      return `
        ${robe}
        <path d="M232 374h256" stroke="#7a4e32" stroke-width="30" stroke-linecap="round"/>
        <path d="M302 334 220 600" stroke="${profile.trim}" stroke-width="18" opacity=".45"/>
      `;
    case "armor":
      return `
        <rect x="250" y="258" width="220" height="428" rx="34" fill="${profile.body}"/>
        <path d="M272 300h176v86H272Z" fill="${profile.trim}"/>
        <path d="M286 416h148M286 476h148M286 536h148" stroke="${profile.trim}" stroke-width="17"/>
        <path d="M318 314h84l28 52H290Z" fill="${profile.accent}" opacity=".58"/>
      `;
    case "dress3d":
      return `
        <path d="M262 258h196l42 438H220Z" fill="url(#body)"/>
        <path d="M300 308h120l36 156H264Z" fill="#fff7f1" opacity=".66"/>
        <path d="M270 476h180" stroke="${profile.trim}" stroke-width="14" stroke-linecap="round"/>
      `;
    case "xianxia3d":
      return `
        ${robe}
        <path d="M284 334c42 38 110 38 152 0" stroke="${profile.accent}" stroke-width="12" stroke-linecap="round" opacity=".76"/>
        <path d="M220 636c80 28 200 28 280 0" stroke="${profile.accent}" stroke-width="10" opacity=".36"/>
      `;
    case "animeCity":
      return `
        <path d="M262 258h196l42 410H220Z" fill="url(#body)"/>
        <path d="M298 292h124v108H298Z" fill="#ffffff" opacity=".72"/>
        <path d="M276 450h168" stroke="${profile.trim}" stroke-width="15" stroke-linecap="round"/>
      `;
    case "animeXianxia":
      return `
        ${robe}
        <path d="M292 320c42 40 94 40 136 0" stroke="${profile.accent}" stroke-width="14" stroke-linecap="round"/>
      `;
    default:
      return modern;
  }
}

function buildCharacterHead(profile: CharacterPreviewProfile) {
  const anime = ["animeCity", "animeXianxia"].includes(profile.outfit);
  const faceRadius = anime ? 70 : 64;
  const eyes = anime
    ? `<circle cx="334" cy="182" r="8" fill="#2c2f38"/><circle cx="386" cy="182" r="8" fill="#2c2f38"/>`
    : "";
  const headwear = buildHeadwear(profile);
  return `
    <circle cx="360" cy="172" r="${faceRadius}" fill="#efe1d7"/>
    <path d="M292 154c26-58 112-70 138 2-22-19-50-28-79-26-22 1-42 9-59 24Z" fill="${profile.hair}"/>
    <path d="M294 166c32 22 100 20 132-2" stroke="${profile.hair}" stroke-width="18" stroke-linecap="round"/>
    ${eyes}
    ${headwear}
  `;
}

function buildHeadwear(profile: CharacterPreviewProfile) {
  switch (profile.headwear) {
    case "cap":
      return `<path d="M290 134h140l28 42H262Z" fill="${profile.trim}"/><path d="M306 112h108v34H306Z" fill="${profile.body}"/>`;
    case "chefHat":
      return `<path d="M286 120c-10-48 42-58 60-28 22-38 86-18 74 30 32-2 50 40 22 62H278c-30-24-16-66 8-64Z" fill="#ffffff" stroke="#e6e0d2" stroke-width="8"/>`;
    case "crown":
      return `<path d="M282 102 318 154l42-72 42 72 36-52 18 82H264Z" fill="${profile.trim}"/><circle cx="360" cy="86" r="12" fill="${profile.accent}"/>`;
    case "emperorCrown":
      return `<rect x="294" y="100" width="132" height="54" rx="8" fill="${profile.trim}"/><path d="M274 112h172" stroke="${profile.accent}" stroke-width="16"/><path d="M360 62v62" stroke="${profile.trim}" stroke-width="18" stroke-linecap="round"/>`;
    case "courtHat":
      return `<path d="M294 112h132l28 58H266Z" fill="${profile.trim}"/><rect x="250" y="128" width="220" height="24" rx="12" fill="${profile.hair}"/>`;
    case "bun":
      return `<circle cx="288" cy="154" r="28" fill="${profile.hair}"/><circle cx="432" cy="154" r="28" fill="${profile.hair}"/><path d="M300 118h120" stroke="${profile.trim}" stroke-width="10" stroke-linecap="round"/>`;
    case "fox":
      return `<path d="M302 100 328 150 276 142Z" fill="${profile.hair}"/><path d="M418 100 392 150 444 142Z" fill="${profile.hair}"/><path d="M310 114 326 142 296 138Z" fill="#f0c9d2"/><path d="M410 114 394 142 424 138Z" fill="#f0c9d2"/>`;
    case "beast":
      return `<path d="M306 102 332 148 282 142Z" fill="${profile.hair}"/><path d="M414 102 388 148 438 142Z" fill="${profile.hair}"/>`;
    default:
      return "";
  }
}

function buildCharacterAccessory(profile: CharacterPreviewProfile) {
  switch (profile.accessory) {
    case "stethoscope":
      return `<path d="M312 338c0 64 96 64 96 0" stroke="#43566e" stroke-width="12" fill="none"/><circle cx="408" cy="420" r="18" fill="#43566e"/>`;
    case "book":
      return `<rect x="430" y="492" width="86" height="118" rx="12" fill="${profile.accent}"/><path d="M448 522h46M448 552h34" stroke="#ffffff" stroke-width="8" stroke-linecap="round" opacity=".75"/>`;
    case "wheel":
      return `<circle cx="502" cy="506" r="48" fill="none" stroke="${profile.accent}" stroke-width="12"/><path d="M502 458v96M454 506h96" stroke="${profile.accent}" stroke-width="10"/>`;
    case "mic":
      return `<rect x="456" y="438" width="48" height="88" rx="24" fill="#2d3340"/><path d="M480 526v82" stroke="#2d3340" stroke-width="14" stroke-linecap="round"/><path d="M438 608h84" stroke="#2d3340" stroke-width="14" stroke-linecap="round"/>`;
    case "badge":
      return `<rect x="414" y="334" width="64" height="86" rx="10" fill="#e9edf5"/><path d="M428 366h36M428 392h24" stroke="${profile.trim}" stroke-width="8" stroke-linecap="round"/>`;
    case "sunglasses":
      return `<rect x="306" y="168" width="44" height="20" rx="8" fill="#0f1116"/><rect x="370" y="168" width="44" height="20" rx="8" fill="#0f1116"/><path d="M350 178h20" stroke="#0f1116" stroke-width="8"/>`;
    case "beads":
      return `<path d="M298 346c32 62 92 82 138 14" stroke="#7b4e24" stroke-width="10" fill="none"/><circle cx="300" cy="348" r="10" fill="#6b3d1f"/><circle cx="328" cy="384" r="10" fill="#6b3d1f"/><circle cx="362" cy="398" r="10" fill="#6b3d1f"/>`;
    case "fan":
      return `<path d="M440 424c64-48 116-38 142 22-44 18-88 18-142-22Z" fill="${profile.accent}"/><path d="M448 432 570 444M462 416l96 52M482 404l54 78" stroke="#5d351b" stroke-width="7"/>`;
    case "talisman":
      return `<rect x="456" y="416" width="72" height="128" rx="6" fill="#f4d36e"/><path d="M478 446h28M474 480h36M492 506v24" stroke="#8f4f23" stroke-width="8" stroke-linecap="round"/>`;
    case "potion":
      return `<path d="M472 438h42v42l30 92c8 24-8 48-34 48h-34c-26 0-42-24-34-48l30-92Z" fill="#8ad8a6"/><path d="M454 552h78" stroke="#ffffff" stroke-width="12" opacity=".6"/>`;
    case "halo":
      return `<ellipse cx="360" cy="92" rx="76" ry="18" fill="none" stroke="${profile.accent}" stroke-width="10" opacity=".82"/>`;
    default:
      return "";
  }
}

function buildScenePreviewBody(name: string, color: string) {
  const label = escapeSvgText(name);
  const commonSky = `<rect width="1280" height="720" rx="24" fill="#dfeaf5"/><rect y="430" width="1280" height="290" fill="#d8d2c5"/>`;
  if (name === "车库") {
    return `
      <rect width="1280" height="720" rx="24" fill="#1f2027"/>
      <path d="M0 210h1280v510H0Z" fill="#2a2b32"/>
      <path d="M150 236h980l120 484H30Z" fill="#3a3835"/>
      <path d="M320 84h640l96 94H224Z" fill="#35333a"/>
      <path d="M230 250h820" stroke="#e9dfc8" stroke-width="16" opacity=".7"/>
      <path d="M156 480h260M864 480h260M88 610h300M900 610h300" stroke="#e8e1d0" stroke-width="10" opacity=".75"/>
      <rect x="170" y="420" width="190" height="72" rx="34" fill="#7d443b"/>
      <rect x="912" y="420" width="190" height="72" rx="34" fill="#314d72"/>
      <rect x="520" y="388" width="240" height="86" rx="40" fill="${color}"/>
    `;
  }
  if (name === "别墅") {
    return `
      ${commonSky}
      <rect x="300" y="190" width="680" height="350" rx="12" fill="#f6f1e8"/>
      <path d="M270 214 640 70l370 144Z" fill="#a89a8d"/>
      <rect x="550" y="376" width="180" height="164" rx="82" fill="#1d2028"/>
      <rect x="368" y="280" width="116" height="116" rx="10" fill="#a8bfd2"/>
      <rect x="796" y="280" width="116" height="116" rx="10" fill="#a8bfd2"/>
      <path d="M220 560h840" stroke="#20242c" stroke-width="18"/>
      <circle cx="260" cy="526" r="58" fill="#5b7b4d"/>
      <circle cx="1020" cy="526" r="58" fill="#5b7b4d"/>
    `;
  }
  if (name === "小巷") {
    return `
      <rect width="1280" height="720" rx="24" fill="#d7e5f2"/>
      <path d="M0 190h350v530H0Z" fill="#6d5b4a"/>
      <path d="M930 170h350v550H930Z" fill="#514237"/>
      <path d="M330 720 554 238h172l224 482Z" fill="#9a9488"/>
      <path d="M416 720 604 244M864 720 676 244" stroke="#70695f" stroke-width="14"/>
      <path d="M32 270h230M1000 246h210" stroke="#2b2b2d" stroke-width="16"/>
      <path d="M860 188c120 28 166 90 208 182" stroke="#7da064" stroke-width="18" fill="none"/>
      <circle cx="980" cy="276" r="42" fill="#6f9e5b"/>
      <text x="640" y="92" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="700" fill="#58606b" opacity=".34">${label}</text>
    `;
  }
  if (name === "医院") {
    return `
      <rect width="1280" height="720" rx="24" fill="#d9edf8"/>
      <rect y="530" width="1280" height="190" fill="#bec7d3"/>
      <rect x="210" y="178" width="820" height="352" rx="16" fill="#f3f7fb"/>
      <rect x="980" y="250" width="180" height="280" rx="12" fill="#e6eef5"/>
      <rect x="552" y="380" width="136" height="150" rx="20" fill="#56677a"/>
      <path d="M600 226h40v88h88v40h-88v88h-40v-88h-88v-40h88Z" fill="#c94343"/>
      <g fill="#9fb8cb">
        <rect x="286" y="258" width="86" height="64" rx="8"/><rect x="410" y="258" width="86" height="64" rx="8"/>
        <rect x="744" y="258" width="86" height="64" rx="8"/><rect x="868" y="258" width="86" height="64" rx="8"/>
      </g>
    `;
  }
  if (name === "办公室") {
    return `
      <rect width="1280" height="720" rx="24" fill="#c9d7e6"/>
      <rect y="430" width="1280" height="290" fill="#c4a77f"/>
      <rect x="0" y="0" width="1280" height="430" fill="#27303a"/>
      <g stroke="#6f8196" stroke-width="10">
        <path d="M160 0v430M340 0v430M520 0v430M700 0v430M880 0v430M1060 0v430"/>
        <path d="M0 140h1280M0 286h1280"/>
      </g>
      <path d="M80 430c160-120 260-80 360-170 120 110 220 28 344 126 132-88 234-62 416 44Z" fill="#728398" opacity=".72"/>
      <rect x="470" y="464" width="340" height="118" rx="16" fill="#5e4536"/>
      <rect x="418" y="560" width="444" height="22" rx="11" fill="#382b24"/>
    `;
  }
  if (name === "酒店") {
    return `
      <rect width="1280" height="720" rx="24" fill="#d6e4d0"/>
      <rect y="520" width="1280" height="200" fill="#8b8c77"/>
      <path d="M160 520c180-220 350-240 520-140 148-130 278-118 446-8v348H160Z" fill="#5d7a4e"/>
      <path d="M220 560c150-100 268-116 402-62 118-68 240-58 430 32" stroke="#f0efe5" stroke-width="26" fill="none"/>
      <path d="M248 250h784v284H248Z" fill="#f7f3e7"/>
      <path d="M248 350h784" stroke="#3a3a34" stroke-width="18"/>
      <circle cx="360" cy="566" r="72" fill="#476b3e"/>
      <circle cx="946" cy="550" r="86" fill="#476b3e"/>
    `;
  }
  if (name === "会所") {
    return `
      <rect width="1280" height="720" rx="24" fill="#19161a"/>
      <rect x="120" y="96" width="1040" height="520" rx="42" fill="#2a2222"/>
      <ellipse cx="640" cy="522" rx="360" ry="92" fill="#c3ad86" opacity=".42"/>
      <ellipse cx="640" cy="508" rx="230" ry="58" fill="#3b3130"/>
      <path d="M420 126h440l92 138H328Z" fill="#8d7254"/>
      <path d="M640 120v210" stroke="#ead6a7" stroke-width="10"/>
      <circle cx="640" cy="300" r="88" fill="#d6be88" opacity=".72"/>
      <rect x="214" y="398" width="204" height="104" rx="40" fill="#1f2334"/>
      <rect x="862" y="398" width="204" height="104" rx="40" fill="#1f2334"/>
    `;
  }
  if (["牢房", "王府", "市集", "御书房", "客栈", "酒楼", "御花园", "军营"].includes(name)) {
    return buildAncientScenePreviewBody(name, color);
  }
  if (
    [
      "未来公寓",
      "霓虹街区",
      "直播间",
      "学院广场",
      "智能车库",
      "云端办公室",
      "赛博商场",
      "高铁站",
    ].includes(name)
  ) {
    return buildModernComicScenePreviewBody(name, color);
  }
  if (
    [
      "云海仙台",
      "灵石洞府",
      "宗门大殿",
      "秘境森林",
      "试炼山门",
      "仙舟甲板",
      "丹房",
      "星河悬崖",
      "莲池仙境",
      "剑阵山门",
      "竹林秘境",
      "星河崖畔",
      "山谷药庐",
      "灵兽庭院",
      "月下古桥",
      "仙门书阁",
    ].includes(name)
  ) {
    return buildXianxiaScenePreviewBody(name, color);
  }
  if (
    [
      "漫画公寓",
      "街角咖啡店",
      "黄昏教室",
      "天台夜景",
      "地铁站",
      "校园操场",
      "便利店",
      "城市天桥",
    ].includes(name)
  ) {
    return buildAnimeCityScenePreviewBody(name, color);
  }
  return `
    <rect width="1280" height="720" rx="24" fill="#d8e8f6"/>
    <rect y="486" width="1280" height="234" fill="#4c5968"/>
    <rect x="0" y="0" width="1280" height="486" fill="#a9c6dd"/>
    <g stroke="#f7fbff" stroke-width="8" opacity=".7">
      <path d="M120 0v486M320 0v486M520 0v486M720 0v486M920 0v486M1120 0v486"/>
      <path d="M0 154h1280M0 316h1280"/>
    </g>
    <path d="M720 246 1046 172l26 26-238 112 160 56-30 24-218-42-170 80-34-28 132-110-136-68 30-24Z" fill="#2d3642" opacity=".85"/>
    <rect x="130" y="560" width="260" height="72" rx="28" fill="#252a34"/>
    <rect x="506" y="560" width="260" height="72" rx="28" fill="#252a34"/>
    <rect x="882" y="560" width="260" height="72" rx="28" fill="#252a34"/>
  `;
}

function buildAncientScenePreviewBody(name: string, color: string) {
  const label = escapeSvgText(name);
  if (name === "牢房") {
    return `
      <rect width="1280" height="720" rx="24" fill="#171615"/>
      <rect y="450" width="1280" height="270" fill="#4b382e"/>
      <rect x="96" y="86" width="1088" height="478" rx="24" fill="#3b2b27"/>
      <g stroke="#191514" stroke-width="24" opacity=".9">
        <path d="M160 94v454M252 94v454M344 94v454M436 94v454M528 94v454"/>
        <path d="M644 94v454M736 94v454M828 94v454M920 94v454M1012 94v454"/>
        <path d="M96 194h1088M96 364h1088"/>
      </g>
      <path d="M670 90c118 36 202 122 234 250" stroke="#cde4ff" stroke-width="22" fill="none" opacity=".42"/>
      <rect x="230" y="492" width="336" height="42" rx="12" fill="#654b39"/>
      <text x="640" y="638" text-anchor="middle" font-family="Arial, sans-serif" font-size="44" font-weight="800" fill="#e9d4bb" opacity=".72">${label}</text>
    `;
  }
  if (["御书房", "客栈", "酒楼"].includes(name)) {
    return `
      <rect width="1280" height="720" rx="24" fill="#241916"/>
      <rect y="456" width="1280" height="264" fill="#7b553c"/>
      <rect x="86" y="92" width="1108" height="488" rx="24" fill="${color}"/>
      <g stroke="#c99745" stroke-width="8" opacity=".58">
        <path d="M168 120v392M338 120v392M508 120v392M678 120v392M848 120v392M1018 120v392"/>
        <path d="M110 230h1060M110 394h1060"/>
      </g>
      <circle cx="640" cy="344" r="62" fill="#d8a24d" opacity=".82"/>
      <rect x="398" y="490" width="480" height="70" rx="16" fill="#4f291d"/>
      <rect x="466" y="528" width="344" height="18" rx="9" fill="#211611"/>
      <text x="640" y="70" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="800" fill="#e9c27a" opacity=".55">${label}</text>
    `;
  }
  if (name === "御花园") {
    return `
      <rect width="1280" height="720" rx="24" fill="#dcebd6"/>
      <rect y="510" width="1280" height="210" fill="#7f9b69"/>
      <path d="M150 520c184-208 382-236 566-116 148-116 278-98 420 18v298H150Z" fill="#5f8b5f"/>
      <path d="M220 560c150-100 278-118 420-58 122-64 260-54 430 30" stroke="#f0efe5" stroke-width="26" fill="none"/>
      <path d="M260 250h760v284H260Z" fill="#f7f3e7"/>
      <path d="M260 350h760" stroke="#344d30" stroke-width="18"/>
      <circle cx="358" cy="566" r="74" fill="#476b3e"/>
      <circle cx="940" cy="550" r="86" fill="#476b3e"/>
    `;
  }
  return `
    <rect width="1280" height="720" rx="24" fill="#f0dcc0"/>
    <rect y="506" width="1280" height="214" fill="#a2734d"/>
    <path d="M126 274 640 84l514 190Z" fill="#3a1c18"/>
    <rect x="178" y="270" width="924" height="250" rx="8" fill="${color}"/>
    <path d="M244 186h792" stroke="#d8a53d" stroke-width="18"/>
    <rect x="538" y="356" width="204" height="164" rx="8" fill="#351917"/>
    <g fill="#c99d67" opacity=".88">
      <rect x="270" y="324" width="112" height="86" rx="8"/>
      <rect x="438" y="324" width="112" height="86" rx="8"/>
      <rect x="730" y="324" width="112" height="86" rx="8"/>
      <rect x="898" y="324" width="112" height="86" rx="8"/>
    </g>
    <text x="640" y="638" text-anchor="middle" font-family="Arial, sans-serif" font-size="44" font-weight="800" fill="#fff0d4" opacity=".52">${label}</text>
  `;
}

function buildModernComicScenePreviewBody(name: string, color: string) {
  const label = escapeSvgText(name);
  if (name === "智能车库") {
    return buildScenePreviewBody("车库", color);
  }
  if (name === "直播间") {
    return `
      <rect width="1280" height="720" rx="24" fill="#1a2030"/>
      <rect x="118" y="96" width="1044" height="520" rx="42" fill="#31436b"/>
      <ellipse cx="640" cy="520" rx="370" ry="108" fill="#55d3ff" opacity=".3"/>
      <ellipse cx="640" cy="510" rx="230" ry="58" fill="#1d1b20"/>
      <path d="M420 126h440l92 138H328Z" fill="#d9e7ff" opacity=".88"/>
      <path d="M640 110v230" stroke="#61d7ff" stroke-width="9"/>
      <circle cx="640" cy="286" r="90" fill="#61d7ff" opacity=".62"/>
      <rect x="214" y="398" width="204" height="104" rx="40" fill="#8b6cff"/>
      <rect x="862" y="398" width="204" height="104" rx="40" fill="#8b6cff"/>
    `;
  }
  return `
    <rect width="1280" height="720" rx="24" fill="#d8ecff"/>
    <rect y="455" width="1280" height="265" fill="#35405c"/>
    <rect x="86" y="138" width="210" height="348" rx="18" fill="#6e83aa"/>
    <rect x="342" y="74" width="244" height="420" rx="22" fill="#1b2335"/>
    <rect x="644" y="118" width="228" height="374" rx="20" fill="${color}"/>
    <rect x="930" y="84" width="282" height="418" rx="22" fill="#182033"/>
    <g fill="#61d7ff" opacity=".78">
      <rect x="136" y="192" width="54" height="38" rx="8"/>
      <rect x="136" y="266" width="54" height="38" rx="8"/>
      <rect x="424" y="154" width="62" height="46" rx="8"/>
      <rect x="424" y="246" width="62" height="46" rx="8"/>
      <rect x="722" y="198" width="58" height="42" rx="8"/>
      <rect x="1028" y="170" width="66" height="48" rx="8"/>
    </g>
    <path d="M0 530c190-64 326-60 476-16c138 40 250 26 406-28c140-48 256-34 398 34v200H0Z" fill="#182033" opacity=".76"/>
    <rect x="186" y="564" width="248" height="64" rx="30" fill="#192033"/>
    <rect x="516" y="552" width="250" height="72" rx="34" fill="#8b6cff"/>
    <rect x="844" y="564" width="258" height="64" rx="30" fill="#192033"/>
    <text x="640" y="638" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="800" fill="#eaf8ff" opacity=".36">${label}</text>
  `;
}

function buildXianxiaScenePreviewBody(name: string, color: string) {
  const label = escapeSvgText(name);
  if (["宗门大殿", "试炼山门", "剑阵山门", "仙门书阁"].includes(name)) {
    return `
      <rect width="1280" height="720" rx="24" fill="#eaf1ff"/>
      <rect y="492" width="1280" height="228" fill="#8ca0c8"/>
      <path d="M160 286 640 104l480 182Z" fill="#2d3655"/>
      <rect x="230" y="286" width="820" height="258" rx="10" fill="#f7f9ff"/>
      <path d="M320 220h640" stroke="#b49cff" stroke-width="18"/>
      <rect x="560" y="384" width="160" height="160" rx="10" fill="#2d3655"/>
      <g fill="#c5d2ea">
        <rect x="340" y="350" width="100" height="82" rx="8"/>
        <rect x="470" y="350" width="100" height="82" rx="8"/>
        <rect x="710" y="350" width="100" height="82" rx="8"/>
        <rect x="840" y="350" width="100" height="82" rx="8"/>
      </g>
    `;
  }
  if (["秘境森林", "莲池仙境", "竹林秘境", "山谷药庐", "灵兽庭院", "月下古桥"].includes(name)) {
    return `
      <rect width="1280" height="720" rx="24" fill="#e9fff7"/>
      <rect y="505" width="1280" height="215" fill="#7eb89f"/>
      <path d="M110 520c190-214 390-232 570-118 154-118 300-100 488 28v290H110Z" fill="${color}"/>
      <path d="M210 562c154-100 280-116 420-56 122-62 268-54 438 32" stroke="#f9fff4" stroke-width="24" fill="none" opacity=".88"/>
      <circle cx="980" cy="230" r="76" fill="#d6b4ff" opacity=".55"/>
      <path d="M204 330c76-84 132-94 206-32M880 284c86-64 158-66 238 10" stroke="#78cdb3" stroke-width="20" fill="none"/>
    `;
  }
  return `
    <rect width="1280" height="720" rx="24" fill="#e8efff"/>
    <rect y="500" width="1280" height="220" fill="#8492bd"/>
    <path d="M0 500c160-132 308-164 490-104c118 40 212 24 326-38c160-86 296-60 464 56v306H0Z" fill="${color}" opacity=".78"/>
    <path d="M206 560c154-92 312-112 464-56c132 48 260 28 478-58" stroke="#ffffff" stroke-width="24" fill="none" opacity=".74"/>
    <circle cx="986" cy="210" r="82" fill="#b49cff" opacity=".58"/>
    <path d="M462 410 640 168l178 242Z" fill="#f7f9ff" opacity=".62"/>
    <path d="M640 178v360" stroke="#72cfe9" stroke-width="8" opacity=".66"/>
    <text x="640" y="638" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="800" fill="#ffffff" opacity=".38">${label}</text>
  `;
}

function buildAnimeCityScenePreviewBody(name: string, color: string) {
  const label = escapeSvgText(name);
  if (["天台夜景", "地铁站", "城市天桥"].includes(name)) {
    return buildModernComicScenePreviewBody(name, color);
  }
  return `
    <rect width="1280" height="720" rx="24" fill="#fff4ee"/>
    <rect y="450" width="1280" height="270" fill="#9ca4b5"/>
    <rect x="110" y="172" width="520" height="300" rx="22" fill="${color}"/>
    <rect x="164" y="232" width="410" height="176" rx="16" fill="#fffaf0"/>
    <rect x="740" y="172" width="330" height="300" rx="18" fill="#28304c" opacity=".9"/>
    <path d="M782 220h230M782 276h230M782 332h230" stroke="#ffb3cf" stroke-width="8" opacity=".58"/>
    <circle cx="1028" cy="140" r="42" fill="#ffb3cf" opacity=".72"/>
    <rect x="674" y="496" width="320" height="60" rx="20" fill="#6b4a3b"/>
    <rect x="412" y="514" width="244" height="88" rx="40" fill="#7cc7ff" opacity=".84"/>
    <path d="M730 552v104M930 552v104" stroke="#3d2b25" stroke-width="15" stroke-linecap="round"/>
    <text x="640" y="638" text-anchor="middle" font-family="Arial, sans-serif" font-size="42" font-weight="800" fill="#ffffff" opacity=".34">${label}</text>
  `;
}

function escapeSvgText(value: string) {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}
