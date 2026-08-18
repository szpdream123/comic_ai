const MODEL_CACHE_KEY = "comic-ai-watermark-removal-model";
const MODEL_CACHE_PATH = "/models/Carve/LaMa-ONNX/lama_fp32.onnx";
const MODEL_URL = "/api/toolbox/watermark-removal/model";
const MODEL_EDGE = 512;
const MODEL_SIZE_BYTES = 208_044_816;
const MAX_INPUT_BYTES = 30 * 1024 * 1024;
const OCR_DETECTION_MODEL_CACHE_PATH = "/models/RapidOCR/PP-OCRv4/det.onnx";
const OCR_RECOGNITION_MODEL_CACHE_PATH = "/models/RapidOCR/PP-OCRv4/rec.onnx";
const OCR_DICTIONARY_CACHE_PATH = "/models/RapidOCR/PP-OCRv4/ppocr_keys_v1.txt";
const OCR_DETECTION_MODEL_URL = "/api/toolbox/watermark-removal/ocr/det";
const OCR_RECOGNITION_MODEL_URL = "/api/toolbox/watermark-removal/ocr/rec";
const OCR_DICTIONARY_URL = "/api/toolbox/watermark-removal/ocr/dict";
const OCR_AUTO_APPLY_THRESHOLD = 0.86;
const OCR_DETECTION_EDGE = 960;
const OCR_RECOGNITION_HEIGHT = 48;
const MASK_ANALYSIS_EDGE = 1024;

let modelSessionPromise = null;
let ocrSessionPromise = null;

function resolveModelUrl() {
  const configured = typeof globalThis.__COMIC_AI_WATERMARK_REMOVAL_MODEL_URL__ === "string"
    ? globalThis.__COMIC_AI_WATERMARK_REMOVAL_MODEL_URL__.trim()
    : "";
  return configured || MODEL_URL;
}

function resolveModelUrls() {
  const configured = typeof globalThis.__COMIC_AI_WATERMARK_REMOVAL_MODEL_URL__ === "string"
    ? globalThis.__COMIC_AI_WATERMARK_REMOVAL_MODEL_URL__.trim()
    : "";
  return [configured || MODEL_URL];
}

export async function checkBrowserWatermarkRemoval() {
  const storage = await getModelStorage();
  if (!storage || typeof globalThis.fetch !== "function" || !globalThis.WebAssembly) {
    return { ready: false, installed: false, error: "当前浏览器不支持本地去水印，请升级或更换浏览器" };
  }
  return {
    ready: true,
    installed: await isBrowserWatermarkRemovalInstalled(storage),
    device: "浏览器本地 WASM",
    version: "LaMa ONNX",
  };
}

export async function isBrowserWatermarkRemovalInstalled(storage = null) {
  const modelStorage = storage ?? await getModelStorage();
  if (!modelStorage) return false;
  try {
    const resources = await Promise.all([
      modelStorage.match(MODEL_CACHE_PATH),
      modelStorage.match(OCR_DETECTION_MODEL_CACHE_PATH),
      modelStorage.match(OCR_RECOGNITION_MODEL_CACHE_PATH),
      modelStorage.match(OCR_DICTIONARY_CACHE_PATH),
    ]);
    return resources.every(Boolean);
  } catch {
    return false;
  }
}

export async function installBrowserWatermarkRemoval({ onProgress } = {}) {
  const support = await checkBrowserWatermarkRemoval();
  if (!support.ready) throw new Error(support.error);
  const storage = await getModelStorage();
  if (!storage) throw new Error("当前浏览器无法保存本地模型");
  if (await isBrowserWatermarkRemovalInstalled(storage)) {
    onProgress?.({ progress: 100, message: "本地去水印插件已安装" });
    return { installed: true, device: support.device };
  }
  onProgress?.({ progress: 0, message: "正在下载本地去水印模型" });
  const downloadedPaths = [];
  try {
    if (!await storage.match(MODEL_CACHE_PATH)) {
      const buffer = await downloadWatermarkRemovalModel((loaded) => {
        const progress = Math.round((Math.min(loaded, MODEL_SIZE_BYTES) / MODEL_SIZE_BYTES) * 88);
        onProgress?.({ progress, message: "正在下载本地去水印模型" });
      });
      await putModelResource(storage, MODEL_CACHE_PATH, buffer, "application/octet-stream");
      downloadedPaths.push(MODEL_CACHE_PATH);
    }
    const ocrResources = [
      [OCR_DETECTION_MODEL_CACHE_PATH, OCR_DETECTION_MODEL_URL, "文字检测模型"],
      [OCR_RECOGNITION_MODEL_CACHE_PATH, OCR_RECOGNITION_MODEL_URL, "文字识别模型"],
      [OCR_DICTIONARY_CACHE_PATH, OCR_DICTIONARY_URL, "文字识别字典"],
    ];
    for (let index = 0; index < ocrResources.length; index += 1) {
      const [path, url, label] = ocrResources[index];
      if (await storage.match(path)) continue;
      onProgress?.({ progress: 89 + index * 3, message: `正在下载${label}` });
      const response = await globalThis.fetch(url, { cache: "no-store", mode: "cors" });
      if (!response.ok) throw new Error(`${label}下载失败（${response.status}）`);
      const buffer = await readResponseBuffer(response);
      await putModelResource(storage, path, buffer, path === OCR_DICTIONARY_CACHE_PATH ? "text/plain;charset=utf-8" : "application/octet-stream");
      downloadedPaths.push(path);
    }
    onProgress?.({ progress: 100, message: "本地去水印插件安装完成" });
    return { installed: true, device: support.device };
  } catch (error) {
    await Promise.all(downloadedPaths.map((path) => storage.delete(path).catch(() => undefined)));
    throw error;
  }
}

export async function uninstallBrowserWatermarkRemoval() {
  const pendingModelSession = modelSessionPromise;
  const pendingOcrSession = ocrSessionPromise;
  modelSessionPromise = null;
  ocrSessionPromise = null;
  await Promise.all([
    releaseWatermarkRemovalSession(pendingModelSession, ["session"]),
    releaseWatermarkRemovalSession(pendingOcrSession, ["detectionSession", "recognitionSession"]),
  ]);
  const resourcePaths = [
    MODEL_CACHE_PATH,
    OCR_DETECTION_MODEL_CACHE_PATH,
    OCR_RECOGNITION_MODEL_CACHE_PATH,
    OCR_DICTIONARY_CACHE_PATH,
  ];
  const cacheDeletion = globalThis.caches?.open
    ? globalThis.caches.open(MODEL_CACHE_KEY)
      .then((cache) => Promise.all(resourcePaths.map((path) => cache.delete(path))))
      .catch(() => undefined)
    : Promise.resolve();
  const indexedDbDeletion = getIndexedDbStorage()
    .then((storage) => storage ? Promise.all(resourcePaths.map((path) => storage.delete(path))) : undefined)
    .catch(() => undefined);
  await Promise.all([cacheDeletion, indexedDbDeletion]);
  return { installed: false };
}

async function releaseWatermarkRemovalSession(pendingSession, sessionKeys) {
  if (!pendingSession) return;
  try {
    const resolved = await pendingSession;
    await Promise.all(sessionKeys.map(async (key) => {
      try {
        await resolved?.[key]?.release?.();
      } catch {
        // Cache removal should continue even when a failed runtime cannot release its session.
      }
    }));
  } catch {
    // A failed initialization has no live session left to release.
  }
}

export async function runBrowserWatermarkRemoval(file, maskDataUrl, { onProgress } = {}) {
  if (!(file instanceof Blob)) throw new Error("请先选择需要去水印的图片。");
  if (file.size > MAX_INPUT_BYTES) throw new Error("图片不能超过 30 MB。");
  if (!String(maskDataUrl ?? "").startsWith("data:image/")) throw new Error("请先框选需要去除的水印区域。");
  const support = await checkBrowserWatermarkRemoval();
  if (!support.ready) throw new Error(support.error);
  if (!support.installed) throw new Error("请先安装本地去水印插件。");

  onProgress?.({ progress: 0, message: "正在准备去除水印" });
  const sourceBitmap = await loadBlobBitmap(file);
  const maskBitmap = await loadDataUrlBitmap(maskDataUrl);
  const sourceWidth = Number(sourceBitmap.width ?? sourceBitmap.naturalWidth ?? MODEL_EDGE) || MODEL_EDGE;
  const sourceHeight = Number(sourceBitmap.height ?? sourceBitmap.naturalHeight ?? MODEL_EDGE) || MODEL_EDGE;
  const maskBounds = resolveWatermarkRemovalMaskBounds(maskBitmap, sourceWidth, sourceHeight);
  if (!maskBounds) {
    sourceBitmap.close?.();
    maskBitmap.close?.();
    throw new Error("请先框选需要去除的水印区域。");
  }
  const repairCrop = resolveWatermarkRemovalCrop(maskBounds, sourceWidth, sourceHeight);
  const imageCanvas = globalThis.document.createElement("canvas");
  const maskCanvas = globalThis.document.createElement("canvas");
  imageCanvas.width = MODEL_EDGE;
  imageCanvas.height = MODEL_EDGE;
  maskCanvas.width = MODEL_EDGE;
  maskCanvas.height = MODEL_EDGE;
  const imageContext = imageCanvas.getContext("2d", { willReadFrequently: true });
  const maskContext = maskCanvas.getContext("2d", { willReadFrequently: true });
  if (!imageContext || !maskContext) throw new Error("当前浏览器无法创建本地处理画布");
  const placement = drawContainedCrop(imageContext, sourceBitmap, repairCrop, MODEL_EDGE, MODEL_EDGE, "#000000");
  drawContainedCrop(maskContext, maskBitmap, repairCrop, MODEL_EDGE, MODEL_EDGE, "#000000", true);
  maskBitmap.close?.();

  const session = await getModelSession(onProgress);
  const imageData = imageContext.getImageData(0, 0, MODEL_EDGE, MODEL_EDGE).data;
  const rawMaskData = maskContext.getImageData(0, 0, MODEL_EDGE, MODEL_EDGE).data;
  // A user-painted selection is authoritative. Narrowing it to high-contrast pixels can leave
  // colored or low-contrast watermark strokes visible after the repair.
  const maskData = rawMaskData;
  const planeSize = MODEL_EDGE * MODEL_EDGE;
  const { imageTensor, maskTensor } = buildWatermarkRemovalInputTensors(imageData, maskData, planeSize);
  onProgress?.({ progress: 24, message: "本机正在去除水印" });
  const ort = session.ort;
  const result = await session.session.run({
    image: new ort.Tensor("float32", imageTensor, [1, 3, MODEL_EDGE, MODEL_EDGE]),
    mask: new ort.Tensor("float32", maskTensor, [1, 1, MODEL_EDGE, MODEL_EDGE]),
  });
  const output = result.output?.data;
  if (!output || output.length < planeSize * 3) throw new Error("本地去水印模型未返回有效结果");
  const outputCanvas = globalThis.document.createElement("canvas");
  outputCanvas.width = MODEL_EDGE;
  outputCanvas.height = MODEL_EDGE;
  const outputContext = outputCanvas.getContext("2d");
  if (!outputContext) throw new Error("当前浏览器无法创建处理结果画布");
  const outputPixels = buildWatermarkRemovalOutputPixels(output, maskData, planeSize);
  outputContext.putImageData(new ImageData(outputPixels, MODEL_EDGE, MODEL_EDGE), 0, 0);
  const resultCanvas = globalThis.document.createElement("canvas");
  resultCanvas.width = sourceWidth;
  resultCanvas.height = sourceHeight;
  const resultContext = resultCanvas.getContext("2d");
  if (!resultContext) throw new Error("当前浏览器无法创建导出画布");
  resultContext.drawImage(sourceBitmap, 0, 0, resultCanvas.width, resultCanvas.height);
  resultContext.drawImage(
    outputCanvas,
    placement.x,
    placement.y,
    placement.width,
    placement.height,
    repairCrop.left,
    repairCrop.top,
    repairCrop.width,
    repairCrop.height,
  );
  const outputBlob = await canvasToBlob(resultCanvas);
  sourceBitmap.close?.();
  onProgress?.({ progress: 100, message: "本地去水印完成" });
  return {
    downloadUrl: globalThis.URL.createObjectURL(outputBlob),
    fileName: `${String(file.name || "image").replace(/\.[^.]+$/, "") || "image"}-watermark-removed.png`,
  };
}

export function createWatermarkRemovalCanvasWorkspace() {
  const imageCanvas = globalThis.document.createElement("canvas");
  const preparedMaskCanvas = globalThis.document.createElement("canvas");
  const outputCanvas = globalThis.document.createElement("canvas");
  for (const canvas of [imageCanvas, preparedMaskCanvas, outputCanvas]) {
    canvas.width = MODEL_EDGE;
    canvas.height = MODEL_EDGE;
  }
  const imageContext = imageCanvas.getContext("2d", { willReadFrequently: true });
  const maskContext = preparedMaskCanvas.getContext("2d", { willReadFrequently: true });
  const outputContext = outputCanvas.getContext("2d");
  if (!imageContext || !maskContext || !outputContext) throw new Error("当前浏览器无法创建本地处理画布");
  return { imageCanvas, preparedMaskCanvas, outputCanvas, imageContext, maskContext, outputContext };
}

export async function runBrowserWatermarkRemovalCanvas(sourceCanvas, maskCanvas, { onProgress, workspace } = {}) {
  const sourceWidth = Number(sourceCanvas?.width || 0);
  const sourceHeight = Number(sourceCanvas?.height || 0);
  if (!sourceWidth || !sourceHeight || !maskCanvas) throw new Error("当前视频帧无法进行本地去水印。");
  const maskBounds = resolveWatermarkRemovalMaskBounds(maskCanvas, sourceWidth, sourceHeight);
  if (!maskBounds) throw new Error("请先框选需要去除的水印区域。");
  const repairCrop = resolveWatermarkRemovalCrop(maskBounds, sourceWidth, sourceHeight);
  const canvasWorkspace = workspace ?? createWatermarkRemovalCanvasWorkspace();
  const { imageCanvas, preparedMaskCanvas, outputCanvas, imageContext, maskContext, outputContext } = canvasWorkspace;
  const sourceContext = sourceCanvas.getContext("2d");
  if (!imageContext || !maskContext || !outputContext || !sourceContext) throw new Error("当前浏览器无法创建本地处理画布");
  const placement = drawContainedCrop(imageContext, sourceCanvas, repairCrop, MODEL_EDGE, MODEL_EDGE, "#000000");
  drawContainedCrop(maskContext, maskCanvas, repairCrop, MODEL_EDGE, MODEL_EDGE, "#000000", true);

  const session = await getModelSession(onProgress);
  const imageData = imageContext.getImageData(0, 0, MODEL_EDGE, MODEL_EDGE).data;
  const maskData = maskContext.getImageData(0, 0, MODEL_EDGE, MODEL_EDGE).data;
  const planeSize = MODEL_EDGE * MODEL_EDGE;
  const { imageTensor, maskTensor } = buildWatermarkRemovalInputTensors(imageData, maskData, planeSize);
  const ort = session.ort;
  const result = await session.session.run({
    image: new ort.Tensor("float32", imageTensor, [1, 3, MODEL_EDGE, MODEL_EDGE]),
    mask: new ort.Tensor("float32", maskTensor, [1, 1, MODEL_EDGE, MODEL_EDGE]),
  });
  const output = result.output?.data;
  if (!output || output.length < planeSize * 3) throw new Error("本地去水印模型未返回有效结果");
  outputContext.putImageData(new ImageData(buildWatermarkRemovalOutputPixels(output, maskData, planeSize), MODEL_EDGE, MODEL_EDGE), 0, 0);
  sourceContext.drawImage(
    outputCanvas,
    placement.x,
    placement.y,
    placement.width,
    placement.height,
    repairCrop.left,
    repairCrop.top,
    repairCrop.width,
    repairCrop.height,
  );
}

export async function detectBrowserWatermarkRegions(file, { onProgress } = {}) {
  if (!(file instanceof Blob)) throw new Error("请先选择需要识别的图片。");
  if (file.size > MAX_INPUT_BYTES) throw new Error("图片不能超过 30 MB。");
  if (typeof globalThis.document?.createElement !== "function") {
    throw new Error("当前浏览器无法执行本地文字识别");
  }
  onProgress?.({ progress: 4, message: "正在加载本地文字识别" });
  const ocr = await getOcrSession();
  onProgress?.({ progress: 20, message: "正在检测图片中的文字区域" });
  const sourceImage = await loadBlobImage(file);
  const imageWidth = Number(sourceImage.naturalWidth ?? sourceImage.width ?? 0);
  const imageHeight = Number(sourceImage.naturalHeight ?? sourceImage.height ?? 0);
  const detectedRegions = await detectOcrTextRegions(ocr, sourceImage, imageWidth, imageHeight);
  const cornerRegions = detectedRegions.filter((region) => isLikelyCornerWatermark(region, imageWidth, imageHeight));
  onProgress?.({ progress: 58, message: "正在识别角落水印文字" });
  const recognizedItems = [];
  for (let index = 0; index < cornerRegions.length; index += 1) {
    const recognized = await recognizeOcrRegion(ocr, sourceImage, cornerRegions[index]);
    recognizedItems.push(recognized);
    onProgress?.({
      progress: 58 + Math.round(((index + 1) / Math.max(1, cornerRegions.length)) * 28),
      message: "正在识别角落水印文字",
    });
  }
  onProgress?.({ progress: 88, message: "正在核对水印文字与位置" });
  const matches = resolveWatermarkOcrMatches(
    recognizedItems,
    cornerRegions.map(regionToPoints),
    imageWidth,
    imageHeight,
  );
  const maskDataUrl = matches.regions.length
    ? buildWatermarkOcrMaskDataUrl(matches.regions, matches.imageWidth, matches.imageHeight)
    : "";
  onProgress?.({ progress: 100, message: matches.regions.length ? "已识别平台水印" : "未识别到平台水印" });
  return { ...matches, maskDataUrl };
}

async function getOcrSession() {
  if (!ocrSessionPromise) {
    ocrSessionPromise = (async () => {
      const storage = await getModelStorage();
      const [detectionResponse, recognitionResponse, dictionaryResponse] = await Promise.all([
        storage?.match(OCR_DETECTION_MODEL_CACHE_PATH),
        storage?.match(OCR_RECOGNITION_MODEL_CACHE_PATH),
        storage?.match(OCR_DICTIONARY_CACHE_PATH),
      ]);
      if (!detectionResponse || !recognitionResponse || !dictionaryResponse) {
        throw new Error("请先安装本地去水印插件。");
      }
      const [detectionBuffer, recognitionBuffer, dictionaryText, runtime] = await Promise.all([
        detectionResponse.arrayBuffer(),
        recognitionResponse.arrayBuffer(),
        dictionaryResponse.text(),
        import("/vendor/watermark-removal-ort.bundle.js"),
      ]);
      const { ort } = runtime;
      ort.env.wasm.wasmPaths = "/vendor/";
      ort.env.wasm.proxy = true;
      ort.env.wasm.numThreads = globalThis.crossOriginIsolated
        ? Math.max(1, Math.min(4, Number(globalThis.navigator?.hardwareConcurrency) || 2))
        : 1;
      const sessionOptions = { executionProviders: ["wasm"] };
      const [detectionSession, recognitionSession] = await Promise.all([
        ort.InferenceSession.create(detectionBuffer, sessionOptions),
        ort.InferenceSession.create(recognitionBuffer, sessionOptions),
      ]);
      const dictionary = ["", ...dictionaryText.split(/\r?\n/).filter(Boolean), " "];
      return { ort, detectionSession, recognitionSession, dictionary };
    })().catch((error) => {
        ocrSessionPromise = null;
        throw error;
      });
  }
  return ocrSessionPromise;
}

async function detectOcrTextRegions(ocr, sourceImage, imageWidth, imageHeight) {
  const scale = Math.min(1, OCR_DETECTION_EDGE / Math.max(imageWidth, imageHeight));
  const width = Math.max(32, Math.ceil((imageWidth * scale) / 32) * 32);
  const height = Math.max(32, Math.ceil((imageHeight * scale) / 32) * 32);
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("当前浏览器无法创建文字检测画布");
  context.drawImage(sourceImage, 0, 0, width, height);
  const tensorData = canvasImageToNormalizedTensor(context.getImageData(0, 0, width, height).data, width, height);
  const inputName = ocr.detectionSession.inputNames[0];
  const output = await ocr.detectionSession.run({
    [inputName]: new ocr.ort.Tensor("float32", tensorData, [1, 3, height, width]),
  });
  const probabilityTensor = output[ocr.detectionSession.outputNames[0]] ?? Object.values(output)[0];
  if (!probabilityTensor?.data) throw new Error("文字检测模型未返回有效结果");
  const dimensions = probabilityTensor.dims ?? probabilityTensor.dimensions ?? [];
  const mapWidth = Number(dimensions.at(-1)) || width;
  const mapHeight = Number(dimensions.at(-2)) || height;
  return findOcrTextRegions(probabilityTensor.data, mapWidth, mapHeight, imageWidth, imageHeight);
}

async function recognizeOcrRegion(ocr, sourceImage, region) {
  const imageWidth = Number(sourceImage.naturalWidth ?? sourceImage.width ?? region.right);
  const imageHeight = Number(sourceImage.naturalHeight ?? sourceImage.height ?? region.bottom);
  const horizontalPadding = Math.max(2, region.height * 0.2);
  const verticalPadding = Math.max(3, region.height * 0.35);
  const sourceLeft = Math.max(0, region.left - horizontalPadding);
  const sourceTop = Math.max(0, region.top - verticalPadding);
  const sourceRight = Math.min(imageWidth, region.right + horizontalPadding);
  const sourceBottom = Math.min(imageHeight, region.bottom + verticalPadding);
  const sourceWidth = Math.max(1, Math.ceil(sourceRight - sourceLeft));
  const sourceHeight = Math.max(1, Math.ceil(sourceBottom - sourceTop));
  const recognitionWidth = Math.max(32, Math.min(640, Math.ceil((sourceWidth / sourceHeight) * OCR_RECOGNITION_HEIGHT)));
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = recognitionWidth;
  canvas.height = OCR_RECOGNITION_HEIGHT;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("当前浏览器无法创建文字识别画布");
  context.drawImage(
    sourceImage,
    sourceLeft,
    sourceTop,
    sourceWidth,
    sourceHeight,
    0,
    0,
    recognitionWidth,
    OCR_RECOGNITION_HEIGHT,
  );
  const tensorData = canvasImageToNormalizedTensor(
    context.getImageData(0, 0, recognitionWidth, OCR_RECOGNITION_HEIGHT).data,
    recognitionWidth,
    OCR_RECOGNITION_HEIGHT,
  );
  const inputName = ocr.recognitionSession.inputNames[0];
  const output = await ocr.recognitionSession.run({
    [inputName]: new ocr.ort.Tensor("float32", tensorData, [1, 3, OCR_RECOGNITION_HEIGHT, recognitionWidth]),
  });
  const logits = output[ocr.recognitionSession.outputNames[0]] ?? Object.values(output)[0];
  if (!logits?.data) return { text: "", confidence: 0 };
  return decodeOcrCtc(logits.data, logits.dims ?? logits.dimensions ?? [], ocr.dictionary);
}

function canvasImageToNormalizedTensor(pixels, width, height) {
  const planeSize = width * height;
  const tensor = new Float32Array(planeSize * 3);
  for (let index = 0; index < planeSize; index += 1) {
    tensor[index] = (pixels[index * 4] / 255 - 0.5) / 0.5;
    tensor[planeSize + index] = (pixels[index * 4 + 1] / 255 - 0.5) / 0.5;
    tensor[planeSize * 2 + index] = (pixels[index * 4 + 2] / 255 - 0.5) / 0.5;
  }
  return tensor;
}

function decodeOcrCtc(data, dimensions, dictionary) {
  const classCount = Number(dimensions.at(-1)) || dictionary.length;
  const stepCount = Math.floor(data.length / Math.max(1, classCount));
  let previousIndex = -1;
  const characters = [];
  const confidences = [];
  for (let step = 0; step < stepCount; step += 1) {
    let bestIndex = 0;
    let bestConfidence = -Infinity;
    for (let classIndex = 0; classIndex < classCount; classIndex += 1) {
      const confidence = Number(data[step * classCount + classIndex]);
      if (confidence > bestConfidence) {
        bestIndex = classIndex;
        bestConfidence = confidence;
      }
    }
    if (bestIndex !== 0 && bestIndex !== previousIndex && dictionary[bestIndex] != null) {
      characters.push(dictionary[bestIndex]);
      confidences.push(bestConfidence);
    }
    previousIndex = bestIndex;
  }
  return {
    text: characters.join(""),
    confidence: confidences.length ? confidences.reduce((sum, value) => sum + value, 0) / confidences.length : 0,
  };
}

function findOcrTextRegions(probabilities, mapWidth, mapHeight, imageWidth, imageHeight) {
  const binary = new Uint8Array(mapWidth * mapHeight);
  for (let y = 0; y < mapHeight; y += 1) {
    for (let x = 0; x < mapWidth; x += 1) {
      let active = false;
      for (let offsetY = -1; offsetY <= 1 && !active; offsetY += 1) {
        for (let offsetX = -1; offsetX <= 1; offsetX += 1) {
          const sampleX = x + offsetX;
          const sampleY = y + offsetY;
          if (sampleX < 0 || sampleY < 0 || sampleX >= mapWidth || sampleY >= mapHeight) continue;
          if (Number(probabilities[sampleY * mapWidth + sampleX]) >= 0.3) {
            active = true;
            break;
          }
        }
      }
      binary[y * mapWidth + x] = active ? 1 : 0;
    }
  }
  const visited = new Uint8Array(binary.length);
  const components = [];
  for (let start = 0; start < binary.length; start += 1) {
    if (!binary[start] || visited[start]) continue;
    let left = start % mapWidth;
    let right = left;
    let top = Math.floor(start / mapWidth);
    let bottom = top;
    let area = 0;
    const queue = [start];
    visited[start] = 1;
    for (let cursor = 0; cursor < queue.length; cursor += 1) {
      const current = queue[cursor];
      const x = current % mapWidth;
      const y = Math.floor(current / mapWidth);
      left = Math.min(left, x);
      right = Math.max(right, x);
      top = Math.min(top, y);
      bottom = Math.max(bottom, y);
      area += 1;
      for (const [offsetX, offsetY] of [[-1, 0], [1, 0], [0, -1], [0, 1]]) {
        const nextX = x + offsetX;
        const nextY = y + offsetY;
        if (nextX < 0 || nextY < 0 || nextX >= mapWidth || nextY >= mapHeight) continue;
        const next = nextY * mapWidth + nextX;
        if (!binary[next] || visited[next]) continue;
        visited[next] = 1;
        queue.push(next);
      }
    }
    if (area < 6 || right - left < 2 || bottom - top < 2) continue;
    components.push({ left, top, right: right + 1, bottom: bottom + 1 });
  }
  const merged = mergeOcrTextComponents(components);
  const scaleX = imageWidth / mapWidth;
  const scaleY = imageHeight / mapHeight;
  return merged.map((region) => ({
    left: Math.max(0, region.left * scaleX),
    top: Math.max(0, region.top * scaleY),
    right: Math.min(imageWidth, region.right * scaleX),
    bottom: Math.min(imageHeight, region.bottom * scaleY),
    width: Math.max(1, (region.right - region.left) * scaleX),
    height: Math.max(1, (region.bottom - region.top) * scaleY),
  }));
}

function mergeOcrTextComponents(components) {
  const regions = components.map((component) => ({ ...component }));
  let changed = true;
  while (changed) {
    changed = false;
    outer: for (let leftIndex = 0; leftIndex < regions.length; leftIndex += 1) {
      for (let rightIndex = leftIndex + 1; rightIndex < regions.length; rightIndex += 1) {
        const left = regions[leftIndex];
        const right = regions[rightIndex];
        const leftHeight = left.bottom - left.top;
        const rightHeight = right.bottom - right.top;
        const verticalOverlap = Math.max(0, Math.min(left.bottom, right.bottom) - Math.max(left.top, right.top));
        const horizontalGap = Math.max(0, Math.max(left.left, right.left) - Math.min(left.right, right.right));
        const sameLine = verticalOverlap >= Math.min(leftHeight, rightHeight) * 0.35
          && horizontalGap <= Math.max(18, Math.max(leftHeight, rightHeight) * 1.8);
        if (!sameLine) continue;
        regions[leftIndex] = {
          left: Math.min(left.left, right.left),
          top: Math.min(left.top, right.top),
          right: Math.max(left.right, right.right),
          bottom: Math.max(left.bottom, right.bottom),
        };
        regions.splice(rightIndex, 1);
        changed = true;
        break outer;
      }
    }
  }
  return regions;
}

function regionToPoints(region) {
  return [
    [region.left, region.top],
    [region.right, region.top],
    [region.right, region.bottom],
    [region.left, region.bottom],
  ];
}

async function loadBlobImage(blob) {
  const url = globalThis.URL.createObjectURL(blob);
  return new Promise((resolve, reject) => {
    const image = new globalThis.Image();
    image.onload = () => {
      globalThis.URL.revokeObjectURL(url);
      resolve(image);
    };
    image.onerror = () => {
      globalThis.URL.revokeObjectURL(url);
      reject(new Error("读取图片失败"));
    };
    image.src = url;
  });
}

function normalizeWatermarkOcrText(value) {
  return String(value ?? "")
    .normalize("NFKC")
    .replace(/[夢]/g, "梦")
    .replace(/[^\p{L}\p{N}]+/gu, "")
    .toLowerCase();
}

function classifyWatermarkOcrText(value) {
  const normalized = normalizeWatermarkOcrText(value);
  if (normalized.includes("豆包")) return { platform: "豆包", keywordConfidence: normalized.includes("ai") ? 0.99 : 0.98 };
  if (normalized.includes("即梦")) return { platform: "即梦", keywordConfidence: normalized.includes("ai") ? 0.99 : 0.97 };
  if (normalized.includes("抖音")) return { platform: "抖音", keywordConfidence: 0.98 };
  return null;
}

function pointsToWatermarkRegion(points, imageWidth, imageHeight) {
  const validPoints = Array.isArray(points)
    ? points.filter((point) => Array.isArray(point) && Number.isFinite(Number(point[0])) && Number.isFinite(Number(point[1])))
    : [];
  if (validPoints.length < 3) return null;
  const xs = validPoints.map((point) => Math.max(0, Math.min(imageWidth, Number(point[0]))));
  const ys = validPoints.map((point) => Math.max(0, Math.min(imageHeight, Number(point[1]))));
  const left = Math.min(...xs);
  const right = Math.max(...xs);
  const top = Math.min(...ys);
  const bottom = Math.max(...ys);
  if (right - left < 1 || bottom - top < 1) return null;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function isLikelyCornerWatermark(region, imageWidth, imageHeight) {
  const nearHorizontalEdge = region.left <= imageWidth * 0.22 || region.right >= imageWidth * 0.78;
  const nearVerticalEdge = region.top <= imageHeight * 0.2 || region.bottom >= imageHeight * 0.8;
  return nearHorizontalEdge
    && nearVerticalEdge
    && region.width <= imageWidth * 0.45
    && region.height <= imageHeight * 0.14;
}

function resolveWatermarkOcrMatches(textItems, pointItems, imageWidth, imageHeight) {
  const width = Math.max(1, Math.round(Number(imageWidth) || 1));
  const height = Math.max(1, Math.round(Number(imageHeight) || 1));
  const texts = Array.isArray(textItems) ? textItems : [];
  const points = Array.isArray(pointItems) ? pointItems : [];
  const regions = [];
  for (let index = 0; index < Math.min(texts.length, points.length); index += 1) {
    const item = typeof texts[index] === "object" && texts[index] !== null
      ? texts[index]
      : { text: texts[index], confidence: 1 };
    const classification = classifyWatermarkOcrText(item.text);
    const region = pointsToWatermarkRegion(points[index], width, height);
    if (!classification || !region || !isLikelyCornerWatermark(region, width, height)) continue;
    const recognitionConfidence = Number.isFinite(Number(item.confidence))
      ? Math.max(0, Math.min(1, Number(item.confidence)))
      : 0;
    const confidence = recognitionConfidence * classification.keywordConfidence;
    if (confidence < OCR_AUTO_APPLY_THRESHOLD) continue;
    regions.push({ ...region, text: String(item.text ?? ""), platform: classification.platform, confidence });
  }
  return {
    imageWidth: width,
    imageHeight: height,
    regions,
    confidence: regions.length ? Math.min(...regions.map((region) => region.confidence)) : 0,
    platforms: [...new Set(regions.map((region) => region.platform))],
  };
}

function buildWatermarkOcrMaskDataUrl(regions, imageWidth, imageHeight) {
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = imageWidth;
  canvas.height = imageHeight;
  const context = canvas.getContext("2d");
  if (!context) throw new Error("当前浏览器无法创建自动识别蒙版");
  context.fillStyle = "#ffffff";
  for (const region of regions) {
    const padding = Math.max(2, Math.min(12, region.height * 0.18));
    const left = Math.max(0, Math.floor(region.left - padding));
    const top = Math.max(0, Math.floor(region.top - padding));
    const right = Math.min(imageWidth, Math.ceil(region.right + padding));
    const bottom = Math.min(imageHeight, Math.ceil(region.bottom + padding));
    context.fillRect(left, top, Math.max(1, right - left), Math.max(1, bottom - top));
  }
  return canvas.toDataURL("image/png");
}

export function resolveWatermarkOcrMatchesForTest(textItems, pointItems, imageWidth, imageHeight) {
  return resolveWatermarkOcrMatches(textItems, pointItems, imageWidth, imageHeight);
}

async function getModelSession(onProgress) {
  if (!modelSessionPromise) {
    modelSessionPromise = (async () => {
      const storage = await getModelStorage();
      const modelResponse = await storage?.match(MODEL_CACHE_PATH);
      if (!modelResponse) throw new Error("请先安装本地去水印插件。");
      const modelBuffer = await modelResponse.arrayBuffer();
      onProgress?.({ progress: 18, message: "正在加载本地去水印模型" });
      const { ort } = await import("/vendor/watermark-removal-ort.bundle.js");
      ort.env.wasm.wasmPaths = "/vendor/";
      ort.env.wasm.proxy = true;
      ort.env.wasm.numThreads = globalThis.crossOriginIsolated
        ? Math.max(1, Math.min(4, Number(globalThis.navigator?.hardwareConcurrency) || 2))
        : 1;
      let session;
      let device = "浏览器本地 WASM";
      if (globalThis.navigator?.gpu) {
        try {
          ort.env.webgpu.powerPreference = "high-performance";
          session = await ort.InferenceSession.create(modelBuffer, { executionProviders: ["webgpu"] });
          device = "浏览器 WebGPU";
        } catch {
          // Some integrated GPUs do not support every operator used by the repair model.
        }
      }
      session ??= await ort.InferenceSession.create(modelBuffer, { executionProviders: ["wasm"] });
      onProgress?.({ progress: 22, message: "本地去水印模型已加载" });
      return { ort, session, device };
    })().catch((error) => {
      modelSessionPromise = null;
      throw error;
    });
  }
  return modelSessionPromise;
}

async function loadBlobBitmap(blob) {
  if (typeof globalThis.createImageBitmap === "function") return globalThis.createImageBitmap(blob);
  return loadImageElement(globalThis.URL.createObjectURL(blob));
}

async function loadDataUrlBitmap(dataUrl) {
  const response = await globalThis.fetch(dataUrl);
  return loadBlobBitmap(await response.blob());
}

function resolveWatermarkRemovalMaskBounds(maskBitmap, sourceWidth, sourceHeight) {
  const scale = Math.min(1, MASK_ANALYSIS_EDGE / Math.max(sourceWidth, sourceHeight));
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const canvas = globalThis.document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d", { willReadFrequently: true });
  if (!context) throw new Error("当前浏览器无法读取水印蒙版");
  context.drawImage(maskBitmap, 0, 0, width, height);
  const bounds = findWatermarkRemovalMaskBounds(context.getImageData(0, 0, width, height).data, width, height);
  if (!bounds) return null;
  const left = Math.max(0, Math.floor(bounds.left / scale));
  const top = Math.max(0, Math.floor(bounds.top / scale));
  const right = Math.min(sourceWidth, Math.ceil(bounds.right / scale));
  const bottom = Math.min(sourceHeight, Math.ceil(bounds.bottom / scale));
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function findWatermarkRemovalMaskBounds(pixels, width, height) {
  let left = width;
  let top = height;
  let right = -1;
  let bottom = -1;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (pixels[(y * width + x) * 4] <= 8) continue;
      left = Math.min(left, x);
      top = Math.min(top, y);
      right = Math.max(right, x + 1);
      bottom = Math.max(bottom, y + 1);
    }
  }
  if (right <= left || bottom <= top) return null;
  return { left, top, right, bottom, width: right - left, height: bottom - top };
}

function resolveWatermarkRemovalCrop(maskBounds, sourceWidth, sourceHeight) {
  const desiredWidth = Math.min(
    sourceWidth,
    Math.max(256, Math.ceil(maskBounds.width * 2.5), Math.ceil(maskBounds.height * 4)),
  );
  const desiredHeight = Math.min(
    sourceHeight,
    Math.max(256, Math.ceil(maskBounds.height * 4), Math.ceil(maskBounds.width * 1.2)),
  );
  const horizontal = resolveWatermarkRemovalCropAxis(maskBounds.left, maskBounds.right, sourceWidth, desiredWidth);
  const vertical = resolveWatermarkRemovalCropAxis(maskBounds.top, maskBounds.bottom, sourceHeight, desiredHeight);
  return {
    left: horizontal.start,
    top: vertical.start,
    right: horizontal.start + horizontal.size,
    bottom: vertical.start + vertical.size,
    width: horizontal.size,
    height: vertical.size,
  };
}

function resolveWatermarkRemovalCropAxis(maskStart, maskEnd, sourceSize, desiredSize) {
  const size = Math.max(maskEnd - maskStart, Math.min(sourceSize, Math.ceil(desiredSize)));
  const centeredStart = Math.round((maskStart + maskEnd - size) / 2);
  return { start: Math.max(0, Math.min(sourceSize - size, centeredStart)), size };
}

function loadImageElement(url) {
  return new Promise((resolve, reject) => {
    const image = new Image();
    image.onload = () => { globalThis.URL.revokeObjectURL(url); resolve(image); };
    image.onerror = () => { globalThis.URL.revokeObjectURL(url); reject(new Error("读取图片失败")); };
    image.src = url;
  });
}

function drawContained(context, image, targetWidth, targetHeight, fillStyle, isMask = false) {
  context.fillStyle = fillStyle;
  context.fillRect(0, 0, targetWidth, targetHeight);
  const sourceWidth = Number(image.width ?? image.naturalWidth ?? 1);
  const sourceHeight = Number(image.height ?? image.naturalHeight ?? 1);
  const scale = Math.min(targetWidth / sourceWidth, targetHeight / sourceHeight);
  const width = Math.max(1, Math.round(sourceWidth * scale));
  const height = Math.max(1, Math.round(sourceHeight * scale));
  const x = Math.round((targetWidth - width) / 2);
  const y = Math.round((targetHeight - height) / 2);
  if (isMask) context.filter = "grayscale(1)";
  context.drawImage(image, x, y, width, height);
  context.filter = "none";
  return {
    x,
    y,
    width,
    height,
  };
}

function drawContainedCrop(context, image, crop, targetWidth, targetHeight, fillStyle, isMask = false) {
  context.fillStyle = fillStyle;
  context.fillRect(0, 0, targetWidth, targetHeight);
  const scale = Math.min(targetWidth / crop.width, targetHeight / crop.height);
  const width = Math.max(1, Math.round(crop.width * scale));
  const height = Math.max(1, Math.round(crop.height * scale));
  const x = Math.round((targetWidth - width) / 2);
  const y = Math.round((targetHeight - height) / 2);
  if (isMask) context.filter = "grayscale(1)";
  context.drawImage(image, crop.left, crop.top, crop.width, crop.height, x, y, width, height);
  context.filter = "none";
  return { x, y, width, height };
}

function clampByte(value) {
  return Math.max(0, Math.min(255, Math.round(Number(value) || 0)));
}

function refineWatermarkRemovalMaskData(imageData, rawMaskData, width, height) {
  const selectedLuminances = [];
  const pixelCount = width * height;
  for (let index = 0; index < pixelCount; index += 1) {
    if (rawMaskData[index * 4] <= 8) continue;
    const offset = index * 4;
    selectedLuminances.push(
      imageData[offset] * 0.2126
      + imageData[offset + 1] * 0.7152
      + imageData[offset + 2] * 0.0722,
    );
  }
  if (selectedLuminances.length < 16) return new Uint8ClampedArray(rawMaskData.length);
  selectedLuminances.sort((left, right) => left - right);
  const percentile = (ratio) => selectedLuminances[
    Math.max(0, Math.min(selectedLuminances.length - 1, Math.floor((selectedLuminances.length - 1) * ratio)))
  ];
  const low = percentile(0.1);
  const median = percentile(0.5);
  const high = percentile(0.9);
  const brightThreshold = Math.min(255, Math.max(185, high - 10, median + 30));
  const darkThreshold = Math.max(0, Math.min(120, low + 12, median - 30));
  const brightCandidates = new Uint8Array(pixelCount);
  const darkCandidates = new Uint8Array(pixelCount);
  let brightCount = 0;
  let darkCount = 0;
  for (let index = 0; index < pixelCount; index += 1) {
    if (rawMaskData[index * 4] <= 8) continue;
    const offset = index * 4;
    const luminance = imageData[offset] * 0.2126
      + imageData[offset + 1] * 0.7152
      + imageData[offset + 2] * 0.0722;
    if (Math.round(luminance) >= brightThreshold) {
      brightCandidates[index] = 1;
      brightCount += 1;
    }
    if (Math.round(luminance) <= darkThreshold) {
      darkCandidates[index] = 1;
      darkCount += 1;
    }
  }
  const minimumCandidateCount = Math.max(4, Math.ceil(selectedLuminances.length * 0.005));
  const maximumBrightCandidateCount = Math.floor(selectedLuminances.length * 0.78);
  const maximumDarkCandidateCount = Math.floor(selectedLuminances.length * 0.42);
  const brightValid = brightCount >= minimumCandidateCount && brightCount <= maximumBrightCandidateCount;
  const darkValid = darkCount >= minimumCandidateCount && darkCount <= maximumDarkCandidateCount;
  const candidates = brightValid && (!darkValid || brightCount <= darkCount)
    ? brightCandidates
    : darkValid
      ? darkCandidates
      : null;
  if (!candidates) return new Uint8ClampedArray(rawMaskData.length);
  const refined = new Uint8ClampedArray(rawMaskData.length);
  const dilationRadius = 2;
  for (let y = 0; y < height; y += 1) {
    for (let x = 0; x < width; x += 1) {
      if (!candidates[y * width + x]) continue;
      for (let offsetY = -dilationRadius; offsetY <= dilationRadius; offsetY += 1) {
        for (let offsetX = -dilationRadius; offsetX <= dilationRadius; offsetX += 1) {
          const targetX = x + offsetX;
          const targetY = y + offsetY;
          if (targetX < 0 || targetY < 0 || targetX >= width || targetY >= height) continue;
          const targetIndex = targetY * width + targetX;
          if (rawMaskData[targetIndex * 4] <= 8) continue;
          const targetOffset = targetIndex * 4;
          refined[targetOffset] = 255;
          refined[targetOffset + 1] = 255;
          refined[targetOffset + 2] = 255;
          refined[targetOffset + 3] = 255;
        }
      }
    }
  }
  return refined;
}

function buildWatermarkRemovalOutputPixels(output, maskData, planeSize) {
  const outputPixels = new Uint8ClampedArray(planeSize * 4);
  const outputScale = resolveWatermarkRemovalOutputScale(output);
  for (let index = 0; index < planeSize; index += 1) {
    outputPixels[index * 4] = clampByte(output[index] * outputScale);
    outputPixels[index * 4 + 1] = clampByte(output[planeSize + index] * outputScale);
    outputPixels[index * 4 + 2] = clampByte(output[planeSize * 2 + index] * outputScale);
    outputPixels[index * 4 + 3] = clampByte(maskData[index * 4]);
  }
  return outputPixels;
}

function buildWatermarkRemovalInputTensors(imageData, maskData, planeSize) {
  const imageTensor = new Float32Array(3 * planeSize);
  const maskTensor = new Float32Array(planeSize);
  for (let index = 0; index < planeSize; index += 1) {
    const offset = index * 4;
    const selected = maskData[offset] > 8;
    imageTensor[index] = selected ? 0 : imageData[offset] / 255;
    imageTensor[planeSize + index] = selected ? 0 : imageData[offset + 1] / 255;
    imageTensor[planeSize * 2 + index] = selected ? 0 : imageData[offset + 2] / 255;
    maskTensor[index] = selected ? 1 : 0;
  }
  return { imageTensor, maskTensor };
}

function resolveWatermarkRemovalOutputScale(output) {
  let largestValue = 0;
  for (let index = 0; index < output.length; index += 1) {
    largestValue = Math.max(largestValue, Math.abs(Number(output[index]) || 0));
    if (largestValue > 2) return 1;
  }
  return 255;
}

export function buildWatermarkRemovalOutputPixelsForTest(output, maskData, planeSize) {
  return buildWatermarkRemovalOutputPixels(output, maskData, planeSize);
}

function canvasToBlob(canvas) {
  return new Promise((resolve, reject) => {
    canvas.toBlob((blob) => blob ? resolve(blob) : reject(new Error("处理结果导出失败")), "image/png");
  });
}

async function downloadWatermarkRemovalModel(onProgress) {
  let lastError = null;
  for (const modelUrl of resolveModelUrls()) {
    try {
      const response = await globalThis.fetch(modelUrl, { cache: "no-store", mode: "cors" });
      if (response.ok) return readResponseBuffer(response, onProgress);
      lastError = new Error(`本地去水印模型下载失败（${response.status}）`);
    } catch (error) {
      lastError = error;
    }
  }
  throw lastError ?? new Error("本地去水印模型下载失败");
}

async function putModelResource(storage, path, buffer, contentType) {
  await storage.put(path, new Response(buffer, {
    status: 200,
    headers: { "content-type": contentType, "content-length": String(buffer.byteLength) },
  }));
}

async function readResponseBuffer(response, onProgress) {
  if (!response.body?.getReader) return response.arrayBuffer();
  const reader = response.body.getReader();
  const chunks = [];
  let loaded = 0;
  for (;;) {
    const { done, value } = await reader.read();
    if (done) break;
    chunks.push(value);
    loaded += value.byteLength;
    onProgress?.(loaded);
  }
  const buffer = new Uint8Array(loaded);
  let offset = 0;
  for (const chunk of chunks) { buffer.set(chunk, offset); offset += chunk.byteLength; }
  return buffer;
}

async function getModelStorage() {
  if (globalThis.caches?.open) {
    try {
      const cache = await globalThis.caches.open(MODEL_CACHE_KEY);
      return { match: (path) => cache.match(path), put: (path, response) => cache.put(path, response), delete: (path) => cache.delete(path) };
    } catch {
      // IndexedDB keeps the model available when Cache Storage is disabled.
    }
  }
  return getIndexedDbStorage();
}

async function getIndexedDbStorage() {
  if (!globalThis.indexedDB) return null;
  try {
    const database = await openModelDatabase();
    return {
      async match(path) {
        const entry = await indexedDbRequest(database, "readonly", (store) => store.get(path));
        return entry ? new Response(entry.body, { status: 200, headers: entry.headers }) : undefined;
      },
      async put(path, response) {
        const body = await response.arrayBuffer();
        await indexedDbRequest(database, "readwrite", (store) => store.put({ body, headers: [...response.headers.entries()] }, path));
      },
      delete: (path) => indexedDbRequest(database, "readwrite", (store) => store.delete(path)),
    };
  } catch {
    return null;
  }
}

function openModelDatabase() {
  return new Promise((resolve, reject) => {
    const request = globalThis.indexedDB.open("comic-ai-watermark-removal-model", 1);
    request.onupgradeneeded = () => request.result.createObjectStore("resources");
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

function indexedDbRequest(database, mode, operation) {
  return new Promise((resolve, reject) => {
    const request = operation(database.transaction("resources", mode).objectStore("resources"));
    request.onsuccess = () => resolve(request.result);
    request.onerror = () => reject(request.error);
  });
}

export const __browserWatermarkRemovalTestUtils = {
  MODEL_CACHE_PATH,
  MODEL_SIZE_BYTES,
  OCR_DETECTION_MODEL_CACHE_PATH,
  OCR_RECOGNITION_MODEL_CACHE_PATH,
  OCR_DICTIONARY_CACHE_PATH,
  decodeOcrCtc,
  findWatermarkRemovalMaskBounds,
  findOcrTextRegions,
  mergeOcrTextComponents,
  refineWatermarkRemovalMaskData,
  buildWatermarkRemovalInputTensors,
  resolveWatermarkRemovalCrop,
  resolveModelUrl,
};
