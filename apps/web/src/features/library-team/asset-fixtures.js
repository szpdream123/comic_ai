export const personalAssetLibraryFixture = {
  tabs: ["历史创作", "Agent项目", "历史上传", "我的提示词"],
  filters: ["类型筛选", "我的收藏", "批量操作", "时间顺序"],
  folders: ["全部", "角色", "场景", "道具", "未归档"],
  assets: [],
};

export const officialAssetLibraryFixture = {
  scopes: ["官方资产库", "团队资产库"],
  categories: ["角色", "场景", "道具"],
  folders: [
    "国内仿真人·现代都市",
    "国内仿真人·东方古代",
    "3D漫·现代都市",
    "3D漫·东方修仙",
    "2D漫·现代都市",
    "2D漫·东方修仙",
  ],
  assets: [
    {
      id: "doctor",
      name: "医生",
      category: "角色",
      folder: "国内仿真人·现代都市",
      description: "白大褂、身形干练，适用于都市医疗场景的主演或配角。",
    },
    {
      id: "chef",
      name: "厨师",
      category: "角色",
      folder: "国内仿真人·现代都市",
      description: "厨房制作场景常用人物，适合美食、生活类短剧。",
    },
    {
      id: "teacher",
      name: "老师",
      category: "角色",
      folder: "国内仿真人·现代都市",
      description: "教室和校园场景常用人物，气质温和、身份识别度高。",
    },
    {
      id: "driver",
      name: "司机",
      category: "角色",
      folder: "国内仿真人·现代都市",
      description: "适用于出行、追车、城市通勤类场景的基础人设。",
    },
    {
      id: "nanny",
      name: "保姆",
      category: "角色",
      folder: "国内仿真人·现代都市",
      description: "家庭类场景常用角色，可快速复用到亲情、日常或悬疑剧情。",
    },
    {
      id: "guard",
      name: "保镖",
      category: "角色",
      folder: "国内仿真人·现代都市",
      description: "商场、豪宅、街区防护场景常用，适合冲突和紧张氛围。",
    },
    {
      id: "street-corner",
      name: "街角便利店",
      category: "场景",
      folder: "国内仿真人·现代都市",
      description: "夜晚霓虹、便利店和街道组成的都市初遇场景。",
    },
    {
      id: "hospital-lobby",
      name: "医院大堂",
      category: "场景",
      folder: "国内仿真人·现代都市",
      description: "冷白光源、指示牌和接待台组成的医疗功能场景素材。",
    },
    {
      id: "bamboo-courtyard",
      name: "竹林庭院",
      category: "场景",
      folder: "国内仿真人·东方古代",
      description: "青石地板、竹影风声，适合古代、武侠、修仙类场景。",
    },
    {
      id: "vr-hall",
      name: "VR展厅",
      category: "场景",
      folder: "3D漫·现代都市",
      description: "可供科技展厅、未来都市、交互装置类镜头复用。",
    },
    {
      id: "radio",
      name: "旧式通讯器",
      category: "道具",
      folder: "国内仿真人·现代都市",
      description: "废土、追查、潜入类剧情常用的三视图道具资产。",
    },
    {
      id: "scroll",
      name: "古画卷轴",
      category: "道具",
      folder: "国内仿真人·东方古代",
      description: "古代、玄幻场景中可直接复用的道具，支持近景特写。",
    },
  ],
};

export const teamAssetGate = {
  title: "专业版会员权益",
  message: "团队资产库为专业版会员权益，开通后即可同步管理共享素材。",
  cta: "去开通",
};
