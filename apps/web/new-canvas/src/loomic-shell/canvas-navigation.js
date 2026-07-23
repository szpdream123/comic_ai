export async function persistBeforeCanvasNavigation({ storage, canvasId, content }) {
  if (!storage?.save) throw new Error("画布存储尚未准备完成。");
  const result = await storage.save(canvasId, content);
  if (result?.status === "conflict") {
    const error = new Error("当前画布存在保存冲突，请先处理冲突后再切换。");
    error.code = "canvas_navigation_conflict";
    throw error;
  }
  if (result?.source === "local" && result?.cloudPending) {
    const error = new Error("当前画布尚未同步到云端，请恢复网络后再切换。");
    error.code = "canvas_navigation_cloud_pending";
    throw error;
  }
  return result;
}
