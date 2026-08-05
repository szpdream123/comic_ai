import { env, pipeline } from "../node_modules/@huggingface/transformers/dist/transformers.web.min.js";

const MODEL_ID = "onnx-community/depth-anything-v2-small";
let estimatorPromise;

env.allowLocalModels = false;

export function estimateDepth(canvas) {
  if (!estimatorPromise) {
    estimatorPromise = pipeline("depth-estimation", MODEL_ID, {
      device: "webgpu",
      dtype: "q8"
    });
  }
  return estimatorPromise.then((estimator) => estimator(canvas));
}
