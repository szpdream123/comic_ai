export function buildProjectCreateRequest({
  name,
  aspectRatio,
  projectType,
  resolution = "1080p",
  scriptInput,
  scriptUploadSessionId,
  scriptStorageObjectId,
  scriptFileName,
  scriptContentType,
} = {}) {
  return {
    name,
    scriptInput:
      scriptInput ??
      `待上传剧本：${name}。请在项目详情中通过剧本上传或剧本库补充正式素材。`,
    aspectRatio,
    resolution,
    projectType,
    scriptUploadSessionId,
    scriptStorageObjectId,
    scriptFileName,
    scriptContentType,
  };
}
