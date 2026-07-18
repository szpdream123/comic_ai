import { expect, it } from "vitest";
import {
  getModelLibraryItems,
  getModelLibrarySectionId,
  LOCAL_GUO_ASSETS_AVAILABLE,
  MODEL_LIBRARY_SECTIONS,
} from "./modelLibraryCatalog";

it("ships a useful built-in everyday model collection without external files", () => {
  const items = getModelLibraryItems();
  const names = items.map((item) => item.name);

  expect(names).toEqual(expect.arrayContaining([
    "家用轿车",
    "城市SUV",
    "城市公交车",
    "自行车",
    "电动踏板车",
    "沙发",
    "餐桌",
    "冰箱",
    "洗衣机",
    "路灯",
    "绿化树",
    "分类垃圾桶",
    "公交站台",
    "办公桌",
    "咖啡机",
    "医用病床",
    "电影摄影机",
    "景观岩石",
    "双人床",
    "模块墙体",
    "交通信号灯",
    "救护车",
  ]));
  expect(items.filter((item) => item.url.startsWith("builtin://life/"))).toHaveLength(80);
  expect(MODEL_LIBRARY_SECTIONS.map((section) => section.label)).toEqual(expect.arrayContaining([
    "场景",
    "生活",
    "交通",
    "道具",
    "我的模型",
  ]));
  expect(items.find((item) => item.name === "家用轿车")).toMatchObject({
    categoryId: "outdoor",
    fileName: "sedan_low.fbx",
  });
  expect(getModelLibrarySectionId(items.find((item) => item.name === "家用轿车")!)).toBe("transport");
  expect(getModelLibrarySectionId(items.find((item) => item.name === "路灯")!)).toBe("scene");
  expect(getModelLibrarySectionId(items.find((item) => item.name === "背包")!)).toBe("props");
  expect(items.find((item) => item.name === "家用轿车")?.thumbUrl).toBeUndefined();
});

it("indexes the locally installed character and prop libraries", () => {
  const items = getModelLibraryItems();

  if (LOCAL_GUO_ASSETS_AVAILABLE) {
    expect(items.filter((item) => item.kind === "character")).toHaveLength(37);
    expect(items.filter((item) => item.id.startsWith("guo-prop:"))).toHaveLength(150);
    const propNames = items
      .filter((item) => item.id.startsWith("guo-prop:"))
      .map((item) => item.name.trim().toLocaleLowerCase("en-US"));
    expect(new Set(propNames).size).toBe(propNames.length);
    expect(items.find((item) => item.kind === "character")).toMatchObject({
      categoryId: "characters",
    });
    return;
  }

  expect(items.some((item) => item.kind === "character")).toBe(false);
  expect(items.some((item) => item.id.startsWith("guo-prop:"))).toBe(false);
});
