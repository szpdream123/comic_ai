import { i as e } from "./react-Dfufv8pq.js";
import { a as t } from "./core-CoHQ9AE0.js";
import { a as n } from "./event-h5Ir25pQ.js";
//#region src/services/onnxService.ts
var r = /* @__PURE__ */ e({
	ASR_MODEL: () => a,
	ASR_VOCAB: () => o,
	checkModelExists: () => u,
	createCharacterDirectionGrid: () => h,
	downloadModel: () => d,
	getModelsDir: () => l,
	imageUpscale: () => f,
	speechToText: () => m,
	subjectMatting: () => p
}), i = {
	"realesrgan-x4.onnx": "https://huggingface.co/AXERA-TECH/Real-ESRGAN/resolve/main/onnx/realesrgan-x4.onnx",
	"rmbg-1.4.onnx": "https://huggingface.co/briaai/RMBG-1.4/resolve/main/onnx/model.onnx",
	"sensevoice-small-int8.onnx": "https://huggingface.co/OpenVoiceOS/sensevoice-small-onnx/resolve/main/model_int8.onnx",
	"sensevoice-vocab.txt": "https://huggingface.co/OpenVoiceOS/sensevoice-small-onnx/resolve/main/vocab.txt"
}, a = "sensevoice-small-int8.onnx", o = "sensevoice-vocab.txt";
function s() {
	return globalThis.crypto?.randomUUID?.() ?? `onnx-download-${Date.now()}-${Math.random().toString(36).slice(2)}`;
}
function c() {
	return typeof window < "u" && "__TAURI_INTERNALS__" in window;
}
async function l() {
	if (!c()) return null;
	try {
		return await t("get_models_dir");
	} catch {
		return null;
	}
}
async function u(e) {
	let n = await l();
	if (!n) return null;
	try {
		return await t("check_model_exists", { modelName: e }) ? `${n}${n.endsWith("\\") || n.endsWith("/") ? "" : "\\"}${e}` : null;
	} catch {
		return null;
	}
}
async function d(e, r) {
	let a = i[e];
	if (!a) throw Error(`未知模型: ${e}，请联系开发者添加下载地址`);
	if (r?.signal?.aborted) throw new DOMException("Model download aborted", "AbortError");
	let o = r?.taskId ?? s(), c, l = !1, u = () => {
		l || (l = !0, t("cancel_file_transfer", { taskId: o }).catch((e) => {
			console.warn("[onnxService] cancel_file_transfer failed:", e);
		}));
	};
	try {
		if (r?.onProgress && (c = await n("file-transfer-progress", ({ payload: e }) => {
			e.taskId === o && r.onProgress?.(e);
		})), r?.signal?.aborted) throw new DOMException("Model download aborted", "AbortError");
		r?.signal?.addEventListener("abort", u, { once: !0 });
		let i = await t("download_onnx_model", {
			modelName: e,
			url: a,
			taskId: o
		});
		if (r?.signal?.aborted) throw new DOMException("Model download aborted", "AbortError");
		return JSON.parse(i);
	} catch (e) {
		throw r?.signal?.aborted ? new DOMException("Model download aborted", "AbortError") : e;
	} finally {
		r?.signal?.removeEventListener("abort", u), c?.();
	}
}
async function f(e, n, r, i) {
	let a = await t("image_upscale", {
		inputPath: e,
		outputPath: n,
		modelName: r,
		taskId: i
	});
	return JSON.parse(a);
}
async function p(e, n, r, i) {
	let a = await t("subject_matting", {
		inputPath: e,
		outputPath: n,
		modelName: r,
		taskId: i
	});
	return JSON.parse(a);
}
async function m(e, n, r, i, a = "auto") {
	let o = await t("speech_to_text", {
		inputPath: e,
		modelName: n,
		vocabName: r,
		taskId: i,
		language: a
	});
	return JSON.parse(o);
}
async function h(e) {
	let n = await t("character_direction_grid", { inputPath: e });
	return JSON.parse(n);
}
//#endregion
export { d as a, m as c, h as i, p as l, o as n, f as o, u as r, r as s, a as t };
