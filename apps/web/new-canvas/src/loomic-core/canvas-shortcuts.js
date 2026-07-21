export const CANVAS_SHORTCUT_GROUPS = [
  {
    title: "创作",
    items: [
      { label: "成组", keys: ["Ctrl / ⌘", "G"] },
      { label: "合并分镜组", keys: ["Ctrl / ⌘", "Alt / Option", "G"] },
      { label: "解组", keys: ["Ctrl / ⌘", "Shift", "G"] },
      { label: "连线", keys: ["Ctrl / ⌘", "L"] },
      { label: "复制节点和连线", keys: ["Ctrl / ⌘", "D"] },
      { label: "生成", keys: ["Ctrl / ⌘", "Enter"] },
      { label: "新建节点", keys: ["Tab"] },
      { label: "节点复制", keys: ["Alt / Option", "拖动"] },
      { label: "节点创建副本", keys: ["Ctrl / ⌘", "Alt / Option", "拖动"] },
    ],
  },
  {
    title: "缩放",
    items: [
      { label: "放大", keys: ["Ctrl / ⌘", "+"] },
      { label: "缩小", keys: ["Ctrl / ⌘", "-"] },
      { label: "适应画布", keys: ["Ctrl / ⌘", "0"] },
      { label: "触控板", keys: ["双指捏合"] },
      { label: "鼠标", keys: ["Ctrl / ⌘", "滚轮"] },
    ],
  },
  {
    title: "移动画布",
    items: [
      { label: "键盘", keys: ["Space", "拖动"] },
      { label: "触控板", keys: ["双指移动"] },
      { label: "鼠标", keys: ["中键拖动"] },
      { label: "移动", keys: ["V"] },
      { label: "抓手工具", keys: ["H"] },
      { label: "整理画布", keys: ["Alt / Option", "Shift", "F"] },
    ],
  },
  {
    title: "其他",
    items: [
      { label: "撤销", keys: ["Ctrl / ⌘", "Z"] },
      { label: "重做", keys: ["Ctrl / ⌘", "Shift", "Z"] },
      { label: "删除", keys: ["Delete / Backspace"] },
    ],
  },
];

function primaryModifier(event) {
  return Boolean(event?.ctrlKey || event?.metaKey);
}

function keyIs(event, code, key) {
  return event?.code === code || String(event?.key ?? "").toLowerCase() === key;
}

export function matchesCanvasShortcut(event = {}, shortcut) {
  const primary = primaryModifier(event);
  switch (shortcut) {
    case "group": return primary && !event.altKey && !event.shiftKey && keyIs(event, "KeyG", "g");
    case "merge-group": return primary && event.altKey && !event.shiftKey && keyIs(event, "KeyG", "g");
    case "ungroup": return primary && !event.altKey && event.shiftKey && keyIs(event, "KeyG", "g");
    case "connect": return primary && !event.altKey && !event.shiftKey && keyIs(event, "KeyL", "l");
    case "duplicate": return primary && !event.altKey && !event.shiftKey && keyIs(event, "KeyD", "d");
    case "generate": return primary && !event.altKey && !event.shiftKey && event.key === "Enter";
    case "zoom-in": return primary && !event.altKey && (
      event.code === "Equal"
      || event.code === "NumpadAdd"
      || event.key === "+"
      || event.key === "="
    );
    case "zoom-out": return primary && !event.altKey && !event.shiftKey && (
      event.code === "Minus"
      || event.code === "NumpadSubtract"
      || event.key === "-"
    );
    case "fit": return primary && !event.altKey && !event.shiftKey && keyIs(event, "Digit0", "0");
    case "save": return primary && !event.altKey && !event.shiftKey && keyIs(event, "KeyS", "s");
    case "new-node": return !primary && !event.altKey && !event.shiftKey && event.key === "Tab";
    case "arrange": return !primary && event.altKey && event.shiftKey && keyIs(event, "KeyF", "f");
    default: return false;
  }
}
