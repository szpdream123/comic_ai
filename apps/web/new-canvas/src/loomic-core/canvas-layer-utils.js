export const LAYER_TYPE_OPTIONS = [
  { value: "all", label: "全部类型" },
  { value: "text", label: "文本" },
  { value: "image", label: "图片" },
  { value: "video", label: "视频" },
  { value: "shape", label: "图形" },
  { value: "connection", label: "连接" },
];

export function getLayerType(element) {
  if (element?.customData?.type === "image-generator" || element?.type === "image") return "image";
  if (element?.customData?.type === "video-generator" || element?.type === "embeddable") return "video";
  if (element?.type === "text") return "text";
  if (element?.type === "arrow") return "connection";
  return "shape";
}

export function filterCanvasLayers(elements, { query = "", type = "all", getLabel = () => "" } = {}) {
  const normalizedQuery = String(query).trim().toLocaleLowerCase();
  return elements.filter((element) => {
    if (type !== "all" && getLayerType(element) !== type) return false;
    if (!normalizedQuery) return true;
    return `${getLabel(element)} ${element.type ?? ""} ${element.customData?.type ?? ""} ${Object.values(element.customData?.loomicGroupNames ?? {}).join(" ")}`
      .toLocaleLowerCase()
      .includes(normalizedQuery);
  });
}

export function buildCanvasLayerTree(elements) {
  const root = [];
  const groups = new Map();
  for (const element of Array.isArray(elements) ? elements : []) {
    const groupIds = Array.isArray(element?.groupIds) ? element.groupIds.filter(Boolean) : [];
    let children = root;
    const path = [];
    for (const groupId of groupIds) {
      path.push(groupId);
      const key = path.join("\u0000");
      let group = groups.get(key);
      if (!group) {
        group = {
          kind: "group",
          id: groupId,
          key,
          depth: path.length - 1,
          groupIds: [...path],
          parentGroupIds: path.slice(0, -1),
          name: String(element.customData?.loomicGroupNames?.[groupId] ?? "").trim() || "图层组",
          elementIds: [],
          children: [],
        };
        groups.set(key, group);
        children.push(group);
      }
      if (group.name === "图层组") {
        group.name = String(element.customData?.loomicGroupNames?.[groupId] ?? "").trim() || group.name;
      }
      group.elementIds.push(element.id);
      children = group.children;
    }
    children.push({ kind: "element", id: element.id, key: `element:${element.id}`, depth: groupIds.length, groupIds, element });
  }
  return root;
}

export function getCanvasLayerGroupElementIds(elements, groupIds) {
  const path = Array.isArray(groupIds) ? groupIds.filter(Boolean) : [];
  if (!path.length) return [];
  return (Array.isArray(elements) ? elements : []).flatMap((element) => {
    const elementPath = Array.isArray(element?.groupIds) ? element.groupIds : [];
    return path.every((groupId, index) => elementPath[index] === groupId) ? [element.id] : [];
  });
}
