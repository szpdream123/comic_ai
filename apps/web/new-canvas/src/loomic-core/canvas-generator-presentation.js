import { getImageGenerationDimensions } from "./image-generator-elements.js";

function text(value) {
  return String(value ?? "").trim();
}

function uppercaseResolution(value) {
  return text(value).replace(/p$/i, "P").toUpperCase();
}

export function canvasGeneratorNodePresentation(element) {
  if (!element || element.isDeleted || element.customData?.loomicHidden === true) return null;
  const data = element.customData ?? {};
  if (data.type === "image-generator") {
    const dimensions = getImageGenerationDimensions(data.aspectRatio ?? "1:1", data.quality ?? "hd");
    const specification = text(data.quality).toUpperCase() || "HD";
    const inputUpdated = data.inputUpdated === true;
    return {
      kind: "image",
      title: text(data.title) || "图片节点",
      badge: inputUpdated ? "输入已更新" : specification,
      detail: `${inputUpdated ? `${specification} · ` : ""}${dimensions.width} × ${dimensions.height}`,
      inputUpdated,
    };
  }
  if (data.type === "video-generator") {
    const ratio = text(data.aspectRatio) || "16:9";
    const duration = Number(data.duration);
    const specification = uppercaseResolution(data.resolution) || "720P";
    const inputUpdated = data.inputUpdated === true;
    return {
      kind: "video",
      title: text(data.title) || "视频节点",
      badge: inputUpdated ? "输入已更新" : specification,
      detail: `${inputUpdated ? `${specification} · ` : ""}${ratio}${Number.isFinite(duration) && duration > 0 ? ` · ${duration} 秒` : ""}`,
      inputUpdated,
    };
  }
  return null;
}
