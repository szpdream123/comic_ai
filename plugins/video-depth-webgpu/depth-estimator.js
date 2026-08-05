import { env, pipeline } from "@huggingface/transformers";

const MODEL_ID = "onnx-community/depth-anything-v2-small";
let estimatorPromise;

env.allowLocalModels = false;

export async function estimateDepth(canvas, onProgress) {
  const estimator = await getEstimator(onProgress);
  return estimator(canvas);
}

async function getEstimator(onProgress) {
  if (!estimatorPromise) {
    estimatorPromise = pipeline("depth-estimation", MODEL_ID, {
      device: "webgpu",
      dtype: "q8",
      progress_callback: (progress) => {
        const status = String(progress?.status ?? "");
        const loaded = Number(progress?.loaded ?? 0);
        const total = Number(progress?.total ?? 0);
        const percent = total > 0 ? Math.round((loaded / total) * 100) : 0;
        onProgress?.({ status, progress: percent });
      },
    });
  }
  return estimatorPromise;
}
