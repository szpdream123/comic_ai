import { Gn as e, Kn as t, Wn as n, Xn as r, an as i, dn as a, er as o, fn as s, ln as c, mn as l, on as u, pn as d, qn as f, sn as p, un as m } from "./useAppStore-BH-MdRLu.js";
import { Q as h, et as ee, rt as g } from "./useTooltipAutoPlacement-D1FArkVS.js";
//#region src/services/ai/providerBaseUrl.ts
var _ = /\/(?:chat\/completions|completions|responses|messages(?:\/count_tokens)?|models(?:\/[^/]+:(?:streamGenerateContent|generateContent))?|embeddings|images\/generations|videos|audio\/(?:speech|transcriptions))\/?$/i;
function v(e, t = "openai-compatible") {
	let n = (e ?? "").trim();
	if (!n) return "";
	let r = /^[a-z][a-z\d+.-]*:\/\//i.test(n) ? n : `https://${n}`, i;
	try {
		i = new URL(r);
	} catch {
		return n.replace(/\/+$/, "");
	}
	return i.hash = "", i.search = "", i.pathname = i.pathname.replace(_, ""), i.toString().replace(/\/+$/, "");
}
function y(e, t = "openai-compatible") {
	let n = v(e, t);
	if (!n) return [];
	let r;
	try {
		r = new URL(n).pathname;
	} catch {
		return [n];
	}
	return /\/v\d/i.test(r) ? [n] : [n, `${n}/${t === "gemini-native" ? "v1beta" : "v1"}`];
}
//#endregion
//#region src/services/ai/providers/xaiModelManifest.ts
var b = "https://api.x.ai/v1", x = {
	version: 2,
	mode: "sync",
	auth: { type: "bearer" },
	submit: {
		method: "POST",
		path: "/images/generations",
		bodyEncoding: "json",
		body: {
			model: "{{model}}",
			prompt: "{{prompt}}",
			response_format: "url"
		}
	},
	response: {
		type: "json",
		result: { urlPath: "data.*.url" },
		errorPath: "error.message"
	}
}, S = {
	method: "GET",
	path: "/videos/{{submit.request_id}}",
	response: {
		statusPath: "status",
		successValues: ["done"],
		failureValues: ["failed", "expired"],
		result: {
			urlPath: "video.url",
			mimeType: "video/mp4"
		},
		errorPath: "error.message",
		progressPath: "progress"
	},
	intervalMs: 1e4,
	maxDurationMs: 36e5,
	retry: {
		httpStatuses: [
			408,
			429,
			500,
			502,
			503,
			504
		],
		maxRetries: 5,
		backoff: "exponential",
		maxDelayMs: 6e4,
		honorRetryAfter: !0,
		retryNetworkErrors: !0
	}
}, C = [
	{
		id: "grok-4.5",
		name: "Grok 4.5",
		category: "text",
		provider: "xai",
		description: "xAI 官方旗舰文本与推理模型",
		executionProfile: { preset: "openai-chat" }
	},
	{
		id: "grok-imagine-image",
		name: "Grok Imagine Image",
		category: "image",
		provider: "xai",
		description: "xAI 官方标准图片生成模型",
		executionProfile: {
			preset: "custom",
			protocol: x
		}
	},
	{
		id: "grok-imagine-image-quality",
		name: "Grok Imagine Image Quality",
		category: "image",
		provider: "xai",
		description: "xAI 官方高质量图片生成模型",
		executionProfile: {
			preset: "custom",
			protocol: x
		}
	},
	{
		id: "grok-imagine-video",
		name: "Grok Imagine Video（文生视频）",
		category: "video",
		provider: "xai",
		description: "xAI 官方文生视频模型",
		executionProfile: {
			preset: "custom",
			protocol: {
				version: 2,
				mode: "async",
				auth: { type: "bearer" },
				submit: {
					method: "POST",
					path: "/videos/generations",
					bodyEncoding: "json",
					body: {
						model: "{{model}}",
						prompt: "{{prompt}}",
						duration: "{{duration}}",
						aspect_ratio: "{{aspectRatio}}",
						resolution: "{{seedanceResolution}}"
					}
				},
				response: {
					type: "json",
					taskIdPath: "request_id",
					errorPath: "error.message"
				},
				poll: S
			}
		}
	},
	{
		id: "grok-imagine-video-1.5",
		name: "Grok Imagine Video 1.5（单图生视频）",
		category: "video",
		provider: "xai",
		description: "xAI 官方单图生视频模型，需要连接一张参考图",
		executionProfile: {
			preset: "custom",
			protocol: {
				version: 2,
				mode: "async",
				auth: { type: "bearer" },
				submit: {
					method: "POST",
					path: "/videos/generations",
					bodyEncoding: "json",
					body: {
						model: "{{model}}",
						prompt: "{{prompt}}",
						image: { url: "{{firstImage}}" },
						duration: "{{duration}}",
						aspect_ratio: "{{aspectRatio}}",
						resolution: "{{seedanceResolution}}"
					}
				},
				response: {
					type: "json",
					taskIdPath: "request_id",
					errorPath: "error.message"
				},
				poll: S
			}
		}
	}
], w = "https://generativelanguage.googleapis.com/v1beta/openai", T = {
	type: "header",
	name: "x-goog-api-key"
}, E = (e, t) => ({
	version: 2,
	mode: "sync",
	auth: T,
	submit: {
		method: "POST",
		path: "/v1beta/interactions",
		pathMode: "origin",
		bodyEncoding: "json",
		body: {
			model: "{{model}}",
			input: "{{prompt}}",
			response_format: {
				type: e,
				aspect_ratio: "{{aspectRatio}}",
				...e === "image" ? { image_size: t ?? "{{imageSize}}" } : {}
			}
		}
	},
	response: {
		type: "json",
		result: {
			base64Path: "steps.*.content.*.data",
			mimeType: e === "image" ? "image/png" : "video/mp4"
		},
		errorPath: "error.message"
	}
}), D = {
	version: 2,
	mode: "sync",
	auth: T,
	submit: {
		method: "POST",
		path: "/v1beta/interactions",
		pathMode: "origin",
		bodyEncoding: "json",
		body: {
			model: "{{model}}",
			input: "{{prompt}}",
			response_format: { type: "audio" },
			generation_config: { speech_config: [{ voice: "Kore" }] }
		}
	},
	response: {
		type: "json",
		result: {
			base64Path: "steps.*.content.*.data",
			mimeType: "audio/wav",
			base64Transform: {
				type: "pcm-s16le-to-wav",
				sampleRate: 24e3,
				channels: 1
			}
		},
		errorPath: "error.message"
	}
}, O = {
	version: 2,
	mode: "async",
	auth: T,
	submit: {
		method: "POST",
		path: "/v1beta/models/{{model}}:predictLongRunning",
		pathMode: "origin",
		bodyEncoding: "json",
		body: {
			instances: [{ prompt: "{{prompt}}" }],
			parameters: { aspectRatio: "{{aspectRatio}}" }
		}
	},
	response: {
		type: "json",
		taskIdPath: "name",
		errorPath: "error.message"
	},
	poll: {
		method: "GET",
		path: "/v1beta/{{submit.name}}",
		pathMode: "origin",
		response: {
			statusPath: "done",
			successValues: ["true"],
			failureValues: [
				"failed",
				"error",
				"cancelled"
			],
			result: {
				urlPath: "response.generateVideoResponse.generatedSamples.*.video.uri",
				mimeType: "video/mp4",
				fetchUrl: !0
			},
			errorPath: "error.message"
		},
		intervalMs: 1e4,
		maxDurationMs: 36e5,
		retry: {
			httpStatuses: [
				408,
				429,
				500,
				502,
				503,
				504
			],
			maxRetries: 5,
			backoff: "exponential",
			maxDelayMs: 6e4,
			honorRetryAfter: !0,
			retryNetworkErrors: !0
		}
	}
}, k = E("image"), te = E("image", "1K"), ne = E("video"), re = [
	{
		id: "gemini-3.6-flash",
		name: "Gemini 3.6 Flash",
		category: "text",
		provider: "google",
		description: "Google 官方生产级文本与多模态模型",
		executionProfile: { preset: "openai-chat" }
	},
	{
		id: "gemini-3.5-flash-lite",
		name: "Gemini 3.5 Flash-Lite",
		category: "text",
		provider: "google",
		description: "Google 官方低延迟、低成本文本模型",
		executionProfile: { preset: "openai-chat" }
	},
	...[
		{
			id: "gemini-3.1-flash-lite-image",
			name: "Gemini 3.1 Flash Lite Image",
			protocol: te
		},
		{
			id: "gemini-3.1-flash-image",
			name: "Gemini 3.1 Flash Image",
			protocol: k
		},
		{
			id: "gemini-3-pro-image",
			name: "Gemini 3 Pro Image",
			protocol: k
		}
	].map(({ id: e, name: t, protocol: n }) => ({
		id: e,
		name: t,
		category: "image",
		provider: "google",
		description: "Google 官方 Nano Banana 图片生成模型（当前接入文生图）",
		executionProfile: {
			preset: "custom",
			protocol: n
		}
	})),
	{
		id: "gemini-omni-flash-preview",
		name: "Gemini Omni Flash Video（文生视频）",
		category: "video",
		provider: "google",
		description: "Google 官方原生多模态视频模型，当前接入文生视频",
		executionProfile: {
			preset: "custom",
			protocol: ne
		}
	},
	{
		id: "veo-3.1-generate-preview",
		name: "Veo 3.1（文生视频）",
		category: "video",
		provider: "google",
		description: "Google 官方高质量异步视频生成模型，自动鉴权下载结果",
		executionProfile: {
			preset: "custom",
			protocol: O
		}
	},
	{
		id: "gemini-3.1-flash-tts-preview",
		name: "Gemini 3.1 Flash TTS（Kore / WAV）",
		category: "audio",
		provider: "google",
		description: "Google 官方语音生成模型，24kHz 单声道 PCM 自动封装为 WAV",
		executionProfile: {
			preset: "custom",
			protocol: D
		}
	}
], ie = "https://sora2u.com", ae = {
	utm_source: "tenney",
	utm_medium: "canvas",
	utm_content: "wx"
}, oe = {
	httpStatuses: [
		408,
		429,
		500,
		502,
		503,
		504
	],
	maxRetries: 5,
	backoff: "exponential",
	maxDelayMs: 6e4,
	honorRetryAfter: !0,
	retryNetworkErrors: !0
};
function se(e) {
	return {
		version: 2,
		mode: "async",
		auth: { type: "bearer" },
		submit: {
			method: "POST",
			path: "/api/v1/videos",
			query: { ...ae },
			bodyEncoding: "json",
			body: {
				model: "{{model}}",
				prompt: "{{prompt}}",
				duration: "{{duration}}",
				aspect_ratio: "{{aspectRatio}}",
				resolution: e === "task.image_url" ? "{{imageSize}}" : "{{seedanceResolution}}",
				disable_audio: "{{disableAudio}}",
				reference_urls: e === "task.image_url" ? "{{imageUrls}}" : "{{referenceUrls}}",
				...e === "task.video_url" ? { references: "{{inlineReferences}}" } : {}
			}
		},
		response: {
			type: "json",
			taskIdPath: "task.id",
			errorPath: "error.message"
		},
		poll: {
			method: "GET",
			path: "/api/v1/videos/{{submit.task.id}}",
			query: { ...ae },
			response: {
				statusPath: "task.status",
				successValues: ["completed"],
				failureValues: ["failed", "canceled"],
				result: { urlPath: e },
				errorPath: "task.error",
				progressPath: "task.progress"
			},
			intervalMs: 5e3,
			maxDurationMs: 36e5,
			retry: oe
		}
	};
}
var ce = se("task.image_url"), le = se("task.video_url"), ue = {
	promptMinCharacters: 10,
	maxBase64DecodedBytes: 20 * 1024 * 1024,
	referenceVideo: {
		width: { min: 300 },
		durationSeconds: {
			max: 15,
			maxExclusive: !0
		}
	},
	referenceAudio: { durationSeconds: {
		min: 3,
		max: 15,
		maxExclusive: !0
	} }
};
function de(e, t) {
	return Array.from({ length: t - e + 1 }, (t, n) => e + n);
}
function fe(e, t, n, r = {}) {
	return {
		durations: de(e, t),
		minDuration: e,
		maxDuration: t,
		defaultDuration: e,
		supportsAudio: !0,
		inputConstraints: ue,
		...n,
		...r
	};
}
function A(e, t, n, r) {
	return {
		id: e,
		name: t,
		category: "video",
		provider: "sora2u",
		description: r,
		videoCapability: n,
		executionProfile: {
			preset: "custom",
			protocol: le
		}
	};
}
var j = fe(5, 15, {
	maxImageReferences: 9,
	maxVideoReferences: 3,
	maxAudioReferences: 3
}, { supportsStandaloneAudio: !0 }), M = fe(5, 30, {
	maxImageReferences: 30,
	maxVideoReferences: 10,
	maxAudioReferences: 10
}, {
	requiresReference: !0,
	supportsStandaloneAudio: !0,
	defaultDuration: 15
}), pe = [
	A("seedance-1.5", "Seedance 1.5", fe(5, 12, {
		maxImageReferences: 1,
		maxVideoReferences: 0,
		maxAudioReferences: 0
	}, {
		requiresReference: !0,
		ratios: ["9:16"],
		defaultRatio: "9:16",
		resolutions: ["720p"],
		defaultResolution: "720p",
		supportsAudio: !1
	}), "Sora2U 图片驱动视频模型"),
	A("seedance-2.0", "Seedance 2.0", j, "Sora2U 全模态视频模型，支持文生视频"),
	A("seedance-2.0-character", "Seedance 2.0 Character", j, "Sora2U 角色一致性全模态视频模型"),
	A("seedance-2.0-character-mono", "Seedance 2.0 Character Mono", j, "Sora2U 单角色一致性全模态视频模型"),
	A("seedance-2.5", "Seedance 2.5", M, "Sora2U 多模态参考视频模型，至少需要一份参考素材"),
	A("seedance-2.5-character", "Seedance 2.5 Character", M, "Sora2U 角色一致性多模态视频模型，至少需要一份参考素材"),
	A("seedance-2.5-character-mono", "Seedance 2.5 Character Mono", {
		...M,
		maxVideoReferences: 3,
		maxAudioReferences: 3
	}, "Sora2U 单角色一致性多模态视频模型，至少需要一份参考素材"),
	{
		id: "gemini-image",
		name: "Gemini Image",
		category: "image",
		provider: "sora2u",
		description: "Sora2U Gemini 图片生成模型，支持最多 4 张参考图",
		inputModalities: ["text", "image"],
		executionProfile: {
			preset: "custom",
			protocol: ce
		}
	},
	{
		id: "kontext-image",
		name: "Kontext Image",
		category: "image",
		provider: "sora2u",
		description: "Sora2U Kontext 图片生成模型，支持最多 4 张参考图",
		inputModalities: ["text", "image"],
		executionProfile: {
			preset: "custom",
			protocol: ce
		}
	}
], N = {
	key: "apiKey",
	label: "API Key",
	required: !0,
	secret: !0
}, me = [
	{
		id: "gpt-5.6",
		name: "GPT-5.6",
		category: "text",
		provider: "cccapi",
		description: "GPT-5.6 通用文本与多模态模型"
	},
	{
		id: "gpt-5.6-sol",
		name: "GPT-5.6 Sol",
		category: "text",
		provider: "cccapi",
		description: "GPT-5.6 Sol 文本与多模态模型"
	},
	{
		id: "gpt-5.6-luna",
		name: "GPT-5.6 Luna",
		category: "text",
		provider: "cccapi",
		description: "GPT-5.6 Luna 文本与多模态模型"
	},
	{
		id: "gpt-5.6-terra",
		name: "GPT-5.6 Terra",
		category: "text",
		provider: "cccapi",
		description: "GPT-5.6 Terra 文本与多模态模型"
	},
	{
		id: "gpt-5.5",
		name: "GPT-5.5",
		category: "text",
		provider: "cccapi",
		description: "GPT-5.5 通用文本与多模态模型"
	},
	{
		id: "gpt-5.4",
		name: "GPT-5.4",
		category: "text",
		provider: "cccapi",
		description: "GPT-5.4 通用文本与多模态模型"
	},
	{
		id: "gpt-5.4-mini",
		name: "GPT-5.4 mini",
		category: "text",
		provider: "cccapi",
		description: "GPT-5.4 mini 轻量文本与多模态模型"
	},
	{
		id: "gpt-5.3-codex-spark",
		name: "GPT-5.3 Codex Spark",
		category: "text",
		provider: "cccapi",
		description: "GPT-5.3 Codex Spark 编码模型"
	},
	{
		id: "gpt-5.2",
		name: "GPT-5.2",
		category: "text",
		provider: "cccapi",
		description: "GPT-5.2 通用文本与多模态模型"
	},
	{
		id: "gpt-5.2-pro",
		name: "GPT-5.2 Pro",
		category: "text",
		provider: "cccapi",
		description: "GPT-5.2 Pro 高能力文本与多模态模型"
	},
	{
		id: "gpt-5",
		name: "GPT-5",
		category: "text",
		provider: "cccapi",
		description: "GPT-5 通用文本与多模态模型"
	},
	{
		id: "o4-mini",
		name: "o4-mini",
		category: "text",
		provider: "cccapi",
		description: "o4-mini 轻量推理模型，支持多模态输入"
	},
	{
		id: "o3",
		name: "o3",
		category: "text",
		provider: "cccapi",
		description: "o3 强推理模型，支持多模态输入"
	},
	{
		id: "o3-mini",
		name: "o3-mini",
		category: "text",
		provider: "cccapi",
		description: "o3-mini 轻量推理模型",
		inputModalities: ["text"]
	},
	{
		id: "gpt-4.1",
		name: "GPT-4.1",
		category: "text",
		provider: "cccapi",
		description: "GPT-4.1 通用文本与多模态模型"
	},
	{
		id: "gpt-4.1-mini",
		name: "GPT-4.1 mini",
		category: "text",
		provider: "cccapi",
		description: "GPT-4.1 mini 轻量文本与多模态模型"
	},
	{
		id: "gpt-4.1-nano",
		name: "GPT-4.1 nano",
		category: "text",
		provider: "cccapi",
		description: "GPT-4.1 nano 极轻量文本与多模态模型"
	},
	{
		id: "gpt-4o",
		name: "GPT-4o",
		category: "text",
		provider: "cccapi",
		description: "GPT-4o 通用文本与多模态模型"
	},
	{
		id: "gpt-4o-mini",
		name: "GPT-4o mini",
		category: "text",
		provider: "cccapi",
		description: "OpenAI 兼容文本与多模态模型",
		inputModalities: ["text", "image"]
	},
	{
		id: "gpt-4-turbo",
		name: "GPT-4 Turbo",
		category: "text",
		provider: "cccapi",
		description: "GPT-4 Turbo 通用文本与多模态模型"
	},
	{
		id: "gpt-4",
		name: "GPT-4",
		category: "text",
		provider: "cccapi",
		description: "GPT-4 通用文本模型",
		inputModalities: ["text"]
	},
	{
		id: "codex-auto-review",
		name: "Codex Auto Review",
		category: "text",
		provider: "cccapi",
		description: "Codex 自动代码评审模型"
	},
	{
		id: "gpt-image-2",
		name: "GPT Image 2",
		category: "image",
		provider: "cccapi",
		description: "OpenAI 兼容图片生成模型",
		imageReferenceRequestMode: "edits-multipart"
	},
	{
		id: "gpt-image-1",
		name: "GPT Image 1",
		category: "image",
		provider: "cccapi",
		description: "OpenAI 兼容图片生成模型（上一代）"
	}
], he = [
	"seedance-2.5",
	"seedance-2.5-character",
	"seedance-2.5-character-mono"
], ge = new Set(he), _e = [
	"tavily",
	"bocha",
	"zhipu-search",
	"exa"
], P = [
	{
		id: "apimart",
		name: "APIMart",
		description: "OpenAI 兼容的多类型模型服务",
		badgeText: "AM",
		authType: "api-key",
		catalogAdapter: "openai-compatible",
		defaultBaseUrl: i,
		modelsPath: "/models",
		allowCustomBaseUrl: !1,
		credentials: [N, {
			key: "baseUrl",
			label: "接口地址",
			required: !1,
			placeholder: i
		}]
	},
	{
		id: "cccapi",
		name: "CCC API",
		description: "群内大佬自建自用中转！平价对接，纯公益不赚一分钱✅，稳定、速度快、出图质量高",
		badgeText: "CCC",
		authType: "api-key",
		catalogAdapter: "openai-compatible",
		defaultBaseUrl: p,
		modelsPath: "/models",
		allowCustomBaseUrl: !1,
		externalUrl: "https://cccapi.cn",
		credentials: [{
			...N,
			placeholder: "sk-..."
		}],
		models: me
	},
	{
		id: "xai",
		name: "xAI / Grok 官方",
		description: "Grok 官方文本、图片与视频模型",
		badgeText: "xAI",
		authType: "api-key",
		catalogAdapter: "local-manifest",
		defaultBaseUrl: b,
		credentials: [{
			...N,
			placeholder: "xai-..."
		}],
		models: C
	},
	{
		id: "google",
		name: "Google Gemini 官方",
		description: "Gemini 文本、Nano Banana 图片、Omni/Veo 视频与 TTS",
		badgeText: "G",
		authType: "api-key",
		catalogAdapter: "local-manifest",
		defaultBaseUrl: w,
		credentials: [{
			...N,
			placeholder: "Google AI Studio API Key"
		}],
		models: re
	},
	{
		id: "sora2u",
		name: "Sora2U",
		description: "Seedance 全模态视频与 Gemini/Kontext 图片模型",
		badgeText: "S2U",
		authType: "api-key",
		catalogAdapter: "openai-compatible",
		defaultBaseUrl: ie,
		modelsPath: "/api/v1/models",
		allowCustomBaseUrl: !1,
		externalUrl: "https://sora2u.com/?utm_source=tenney&utm_medium=canvas&utm_content=wx",
		connectionTestPath: "/api/v1/credits",
		requestQuery: ae,
		hiddenModelIds: he,
		credentials: [{
			...N,
			placeholder: "sk_sora_..."
		}],
		models: pe.filter((e) => !ge.has(e.id))
	},
	{
		id: "volcengine",
		name: "火山方舟",
		description: "火山引擎方舟模型服务",
		badgeText: "V",
		authType: "api-key",
		catalogAdapter: "openai-compatible",
		defaultBaseUrl: d,
		modelsPath: "/models",
		allowCustomBaseUrl: !1,
		credentials: [N, {
			key: "baseUrl",
			label: "接口地址",
			required: !1,
			placeholder: d
		}]
	},
	{
		id: "runninghub-model",
		name: "RunningHub",
		description: "RunningHub 标准模型 API 与工作流",
		badgeText: "RH",
		authType: "api-key",
		catalogAdapter: "local-manifest",
		defaultBaseUrl: a,
		credentials: [{
			...N,
			label: "企业级-共享 API Key",
			placeholder: "用于 RunningHub 标准模型 API"
		}]
	},
	{
		id: "grsai",
		name: "GRSAI",
		description: "图像生成与多模态文本模型服务",
		badgeText: "GR",
		authType: "api-key",
		catalogAdapter: "local-manifest",
		defaultBaseUrl: m,
		allowCustomBaseUrl: !1,
		credentials: [N, {
			key: "baseUrl",
			label: "接口地址",
			required: !1,
			placeholder: m
		}]
	},
	{
		id: "dreamina",
		name: "即梦",
		description: "通过官方 OAuth 登录使用即梦模型",
		badgeText: "JM",
		authType: "oauth",
		catalogAdapter: "local-manifest",
		credentials: []
	},
	{
		id: "tavily",
		name: "Tavily",
		description: "面向 AI Agent 的搜索与来源服务",
		badgeText: "TV",
		authType: "api-key",
		catalogAdapter: "local-manifest",
		defaultBaseUrl: s,
		credentials: [{
			...N,
			placeholder: "tvly-..."
		}],
		kind: "web-search"
	},
	{
		id: "bocha",
		name: "博查 Web Search",
		description: "国内网络环境友好的结构化搜索服务",
		badgeText: "BC",
		authType: "api-key",
		catalogAdapter: "local-manifest",
		defaultBaseUrl: u,
		credentials: [{
			...N,
			placeholder: "sk-..."
		}],
		kind: "web-search"
	},
	{
		id: "zhipu-search",
		name: "智谱联网搜索",
		description: "智谱开放平台提供的 Web Search API",
		badgeText: "ZP",
		authType: "api-key",
		catalogAdapter: "local-manifest",
		defaultBaseUrl: l,
		credentials: [{
			...N,
			placeholder: "智谱 API Key"
		}],
		kind: "web-search"
	},
	{
		id: "exa",
		name: "Exa",
		description: "支持语义检索与网页摘要的搜索服务",
		badgeText: "EX",
		authType: "api-key",
		catalogAdapter: "local-manifest",
		defaultBaseUrl: c,
		credentials: [{
			...N,
			placeholder: "Exa API Key"
		}],
		kind: "web-search"
	},
	{
		id: "custom-openai",
		name: "自定义接口",
		description: "OpenAI 兼容接口；非标准接口用模型的调用协议单独声明",
		badgeText: "API",
		authType: "api-key",
		catalogAdapter: "openai-compatible",
		modelsPath: "/models",
		allowCustomBaseUrl: !0,
		credentials: [N, {
			key: "baseUrl",
			label: "接口地址",
			required: !0
		}]
	}
];
function F(e, t) {
	return e ? !P.find((t) => t.id === e)?.hiddenModelIds?.includes(t) : !0;
}
var ve = new Map(P.map((e) => [e.id, e]));
function ye(e, t) {
	if (e.length <= 300) return e;
	let n = e.filter((e) => t.has(e.id)), r = 300 - n.length;
	return r <= 0 ? n : [...n, ...e.filter((e) => !t.has(e.id)).slice(0, r)];
}
function be() {
	return P;
}
function xe(e) {
	return _e.includes(e);
}
function Se() {
	return P.filter((e) => e.kind === "web-search");
}
function Ce(e) {
	let t = (t) => !!e.providers[t]?.apiKey?.trim();
	return xe(e.webSearchProviderId) && t(e.webSearchProviderId) ? e.webSearchProviderId : t("tavily") ? "tavily" : _e.find(t);
}
function we(e) {
	return e === "custom-openai" ? `custom-${globalThis.crypto?.randomUUID?.().slice(0, 8) ?? `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`}` : e;
}
function Te(e, t) {
	return ve.get(t?.catalogId || e);
}
function Ee(e) {
	let t = e.toLowerCase();
	return /tts|speech|audio|music|voice|whisper|transcri/.test(t) ? "audio" : /video|seedance|sora|veo|kling|hailuo|wan\d|skyreels|vidu|minimax[-\s_.]?h3/.test(t) ? "video" : /image|seedream|imagen|flux|banana|midjourney|recraft|dall-e/.test(t) ? "image" : "text";
}
function De(e) {
	if (Array.isArray(e)) return e;
	if (!e || typeof e != "object") return [];
	let t = e;
	return Array.isArray(t.data) ? t.data : Array.isArray(t.models) ? t.models : [];
}
function Oe(e) {
	if (!Array.isArray(e)) return;
	let t = e.filter((e) => typeof e == "string" && e.trim() !== "");
	return t.length > 0 ? t : void 0;
}
function ke(e) {
	if (!Array.isArray(e)) return;
	let t = e.filter((e) => typeof e == "number" && Number.isFinite(e));
	return t.length > 0 ? t : void 0;
}
function I(e) {
	return typeof e == "number" && Number.isFinite(e) ? e : void 0;
}
function Ae(e) {
	return e && typeof e == "object" && !Array.isArray(e) ? e : void 0;
}
function je(e, t) {
	if (t !== "video") return;
	let n = ke(e.durations), r = Ae(e.duration_range ?? e.durationRange), i = Ae(e.reference_limits ?? e.referenceLimits), a = {
		durations: n,
		minDuration: I(r?.min) ?? (n ? Math.min(...n) : void 0),
		maxDuration: I(r?.max) ?? (n ? Math.max(...n) : void 0),
		defaultDuration: I(e.default_duration ?? e.defaultDuration),
		ratios: Oe(e.aspect_ratios ?? e.aspectRatios),
		defaultRatio: typeof (e.default_aspect_ratio ?? e.defaultAspectRatio) == "string" ? String(e.default_aspect_ratio ?? e.defaultAspectRatio) : void 0,
		resolutions: Oe(e.resolutions),
		defaultResolution: typeof (e.default_resolution ?? e.defaultResolution) == "string" ? String(e.default_resolution ?? e.defaultResolution) : void 0,
		maxImageReferences: I(i?.image),
		maxVideoReferences: I(i?.video),
		maxAudioReferences: I(i?.audio),
		supportsStandaloneAudio: e.supports_audio === !0 ? !0 : void 0,
		requiresReference: e.supports_text_only === !1 ? !0 : void 0
	};
	return Object.values(a).some((e) => e !== void 0) ? a : void 0;
}
function Me(e, t, n) {
	if (typeof e == "string") {
		let n = e.trim();
		return n ? {
			id: n,
			name: n,
			category: Ee(n),
			provider: t
		} : null;
	}
	if (!e || typeof e != "object") return null;
	let r = e, i = r.id ?? r.model ?? r.model_id ?? (n === "gemini-native" ? r.name : void 0);
	if (typeof i != "string" || !i.trim()) return null;
	let a = n === "gemini-native" ? ee(i) : i.trim(), o = n === "gemini-native" ? r.display_name ?? r.displayName : r.name ?? r.display_name ?? r.displayName, s = typeof o == "string" && o.trim() ? o.trim() : a, c = Ee(a);
	return {
		id: a,
		name: s,
		category: c,
		provider: t,
		inputModalities: r.supports_image === !0 || r.supportsImage === !0 ? ["text", "image"] : void 0,
		videoCapability: je(r, c)
	};
}
function Ne(e, t) {
	let n = /* @__PURE__ */ new Map();
	for (let r of e) {
		let e = r.id.trim();
		!e || n.has(e) || n.set(e, {
			...r,
			id: e,
			name: r.name.trim() || e,
			provider: t
		});
	}
	return [...n.values()].sort((e, t) => e.name.localeCompare(t.name, "zh-CN", { sensitivity: "base" }));
}
function Pe(e, t) {
	let n = new Map(t.map((e) => [e.id, e]));
	return e.map((e) => {
		let t = n.get(e.id);
		return t ? {
			...t,
			...e,
			description: e.description ?? t.description,
			inputModalities: e.inputModalities ?? t.inputModalities,
			executionProfile: e.executionProfile ?? t.executionProfile,
			imageReferenceRequestMode: e.imageReferenceRequestMode ?? t.imageReferenceRequestMode,
			videoCapability: e.videoCapability || t.videoCapability ? {
				...t.videoCapability,
				...e.videoCapability
			} : void 0
		} : e;
	});
}
function Fe(e) {
	return e instanceof DOMException && e.name === "AbortError" ? "模型列表拉取已取消" : e instanceof Error && /^模型列表拉取失败 \(HTTP \d{3}\)$/.test(e.message) ? e.message : "无法连接模型目录，请检查接口地址、网络和 API Key";
}
async function Ie(e, t, n, r) {
	return o(e, {
		method: "GET",
		headers: t ? h(n, t, !1) : void 0,
		signal: r
	});
}
async function Le(e, t, n, r, i) {
	let a = new URL(`${e}${t.modelsPath || "/models"}`);
	for (let [e, n] of Object.entries(t.requestQuery ?? {})) a.searchParams.set(e, n);
	let o = await Ie(a.toString(), r.apiKey, g(r.chatApiProtocol), i);
	if (!o.ok) throw Error(`模型列表拉取失败 (HTTP ${o.status})`);
	let s = De(await o.json().catch(() => null)).map((e) => Me(e, n, g(r.chatApiProtocol))).filter((e) => e !== null && F(t.id, e.id));
	if (s.length === 0) throw Error("模型列表拉取失败 (HTTP 200)");
	return Ne(s, n);
}
async function Re(e, t, n, r) {
	let i = y(n.baseUrl || e.defaultBaseUrl, g(n.chatApiProtocol));
	if (i.length === 0) throw Error("请填写接口地址");
	let a;
	for (let o of i) try {
		return {
			models: await Le(o, e, t, n, r),
			baseUrl: o
		};
	} catch (e) {
		if (e instanceof DOMException && e.name === "AbortError") throw e;
		a = e;
	}
	throw a instanceof Error ? a : /* @__PURE__ */ Error("模型列表拉取失败");
}
async function ze(e) {
	let { providerId: t, config: n, fallbackModels: r = [], signal: i } = e;
	if (i?.aborted) throw new DOMException("模型列表拉取已取消", "AbortError");
	let a = Te(t, n);
	if (!a) throw Error("未知厂商目录");
	let o = Ne(r, t).filter((e) => F(a.id, e.id));
	if (a.catalogAdapter === "local-manifest") return {
		models: o,
		source: "local-manifest"
	};
	try {
		let { models: e, baseUrl: r } = await Re(a, t, n, i);
		return {
			models: Pe(e, o),
			source: "remote",
			resolvedBaseUrl: r
		};
	} catch (e) {
		if (e instanceof DOMException && e.name === "AbortError") throw e;
		let t = Fe(e);
		if (o.length > 0) return {
			models: o,
			source: "local-fallback",
			warning: t
		};
		throw Error(t, { cause: e });
	}
}
//#endregion
//#region src/services/ai/modelProtocolImport.ts
var Be = /(?:\b(?:const|let|var)\s+)?\b(?:url|endpoint|api_url|apiUrl)\b\s*=\s*(["'`])(https?:\/\/[^"'`]+)\1/g, Ve = /\bfetch\s*\(\s*(["'`])(https?:\/\/[^"'`]+)\1/g, He = /\b(?:axios|requests|httpx)\.(get|post)\s*\(\s*(["'`])(https?:\/\/[^"'`]+)\2/gi, Ue = /\bmethod\s*:\s*(["'])(GET|POST)\1/i, We = /(?:callback|webhook|notify|notification)[_-]?(?:url|uri)|(?:callback|webhook)/i, Ge = /(?:bearer\s+)?(?:<[^>]+>|\{\{[^}]+}}|\$\{[^}]+}|YOUR_[A-Z_]+|sk-[A-Za-z0-9_-]+|[A-Za-z0-9_-]{20,})/i, Ke = /^(?:api|openai|anthropic|v\d+(?:\.\d+)?)$/i, qe = /^(?:tasks?|jobs?|predictions?|requests?|operations?|videos?|video[_-]generation)$/i, Je = new Set([
	"imageurl",
	"videourl",
	"audiourl"
]), Ye = new Set([
	"imageurl",
	"videourl",
	"audiourl"
]), Xe = /^{{\s*([a-zA-Z][a-zA-Z0-9_]*(?:\.[a-zA-Z0-9_-]+)*)\s*}}$/, Ze = new Set(f), L = /^(?:https?:\/\/|data:[^;,]+;base64,)/i, R = /\/models\/[^/]+:generateContent\/?$/i, z = new Set([
	"__proto__",
	"prototype",
	"constructor"
]), B = "需要人工确认：", Qe = class {
	index = 0;
	source;
	constructor(e) {
		this.source = e;
	}
	parse() {
		this.skipWhitespace();
		let e = this.parseValue();
		return this.skipWhitespace(), e;
	}
	parseValue() {
		this.skipWhitespace();
		let e = this.source[this.index];
		return e === "{" ? this.parseObject() : e === "[" ? this.parseArray() : e === "\"" || e === "'" || e === "`" ? this.parseString() : e === "-" || /\d/.test(e || "") ? this.parseNumber() : this.parseIdentifierValue();
	}
	parseObject() {
		let e = Object.create(null);
		for (this.index += 1, this.skipWhitespace(); this.index < this.source.length && this.source[this.index] !== "}";) {
			let t = this.parseKey();
			if (this.skipWhitespace(), this.source[this.index] !== ":") throw Error("对象字段缺少冒号");
			if (this.index += 1, e[t] = this.parseValue(), this.skipWhitespace(), this.source[this.index] === ",") this.index += 1, this.skipWhitespace();
			else if (this.source[this.index] !== "}") throw Error("对象字段之间缺少逗号");
		}
		if (this.source[this.index] !== "}") throw Error("对象没有结束");
		return this.index += 1, e;
	}
	parseArray() {
		let e = [];
		for (this.index += 1, this.skipWhitespace(); this.index < this.source.length && this.source[this.index] !== "]";) if (e.push(this.parseValue()), this.skipWhitespace(), this.source[this.index] === ",") this.index += 1, this.skipWhitespace();
		else if (this.source[this.index] !== "]") throw Error("数组元素之间缺少逗号");
		if (this.source[this.index] !== "]") throw Error("数组没有结束");
		return this.index += 1, e;
	}
	parseKey() {
		this.skipWhitespace();
		let e = this.source[this.index];
		if (e === "\"" || e === "'" || e === "`") return this.parseString();
		let t = /^[A-Za-z_$][A-Za-z0-9_$-]*/.exec(this.source.slice(this.index));
		if (!t) throw Error("对象字段名无效");
		return this.index += t[0].length, t[0];
	}
	parseString() {
		let e = this.source[this.index];
		this.index += 1;
		let t = "";
		for (; this.index < this.source.length;) {
			let n = this.source[this.index];
			if (this.index += 1, n === e) return t;
			if (n === "$" && e === "`" && this.source[this.index] === "{") throw Error("不支持模板字符串表达式");
			if (n !== "\\") {
				t += n;
				continue;
			}
			let r = this.source[this.index];
			this.index += 1, t += {
				n: "\n",
				r: "\r",
				t: "	",
				b: "\b",
				f: "\f",
				v: "\v",
				0: "\0"
			}[r] ?? r;
		}
		throw Error("字符串没有结束");
	}
	parseNumber() {
		let e = /^-?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i.exec(this.source.slice(this.index));
		if (!e) throw Error("数字无效");
		return this.index += e[0].length, Number(e[0]);
	}
	parseIdentifierValue() {
		let e = /^[A-Za-z_$][A-Za-z0-9_$.]*/.exec(this.source.slice(this.index));
		if (!e) throw Error("值无效");
		return this.index += e[0].length, e[0] === "true" || e[0] === "True" ? !0 : e[0] === "false" || e[0] === "False" ? !1 : e[0] === "null" || e[0] === "None" || e[0] === "undefined" ? null : e[0];
	}
	skipWhitespace() {
		for (; this.index < this.source.length;) {
			if (/\s/.test(this.source[this.index])) {
				this.index += 1;
				continue;
			}
			if (this.source.startsWith("//", this.index)) {
				let e = this.source.indexOf("\n", this.index + 2);
				this.index = e < 0 ? this.source.length : e + 1;
				continue;
			}
			if (this.source.startsWith("/*", this.index)) {
				let e = this.source.indexOf("*/", this.index + 2);
				this.index = e < 0 ? this.source.length : e + 2;
				continue;
			}
			break;
		}
	}
};
function V(e) {
	return !!e && typeof e == "object" && !Array.isArray(e);
}
function $e(e) {
	return [...new Set(e)];
}
function et(e, t) {
	let n = e[t], r = n === "{" ? "}" : n === "[" ? "]" : void 0;
	if (!r) return;
	let i = [r], a = "", o = !1;
	for (let n = t + 1; n < e.length; n += 1) {
		let r = e[n];
		if (a) {
			o ? o = !1 : r === "\\" ? o = !0 : r === a && (a = "");
			continue;
		}
		if (r === "\"" || r === "'" || r === "`") {
			a = r;
			continue;
		}
		if (r === "{") i.push("}");
		else if (r === "[") i.push("]");
		else if (r === i[i.length - 1] && (i.pop(), i.length === 0)) return {
			start: t,
			end: n + 1
		};
	}
}
function tt(e) {
	try {
		return new Qe(e).parse();
	} catch {
		return;
	}
}
function H(e, t) {
	let n = t.map((e) => e.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")).join("|"), r = RegExp(`(?:\\b(?:const|let|var)\\s+)?\\b(?:${n})\\b\\s*=\\s*`, "i").exec(e);
	if (!r) return {};
	let i = r.index + r[0].length;
	for (; /\s/.test(e[i] || "");) i += 1;
	let a = /^JSON\.stringify\s*\(\s*/i.exec(e.slice(i));
	if (a && (i += a[0].length), e[i] !== "{" && e[i] !== "[") return {};
	let o = et(e, i);
	return o ? {
		value: tt(e.slice(o.start, o.end)),
		range: o
	} : {};
}
function nt(e, t) {
	let n = 0, r = {};
	for (; n < e.length;) {
		let i = H(e.slice(n), t);
		if (!i.range) break;
		let a = {
			start: n + i.range.start,
			end: n + i.range.end
		};
		r = {
			value: i.value,
			range: a
		}, n = a.end;
	}
	return r;
}
function rt(e, t) {
	return t.some((t) => e >= t.start && e < t.end);
}
function U(e, t = []) {
	let n = [];
	for (let r = 0; r < e.length; r += 1) {
		if (e[r] !== "{" && e[r] !== "[" || rt(r, t)) continue;
		let i = et(e, r);
		if (i) {
			try {
				let t = JSON.parse(e.slice(i.start, i.end));
				n.push({
					value: t,
					range: i
				});
			} catch {}
			r = i.end - 1;
		}
	}
	return n;
}
function it(e) {
	let t = {};
	for (let n of e.split(/\r?\n/)) {
		let e = /^\s*([^:\s][^:]*):\s*(.+?)\s*$/.exec(n);
		!e || /^(?:https?|const|let|var)$/i.test(e[1]) || (t[e[1].trim()] = e[2].trim());
	}
	return t;
}
function at(e) {
	return V(e) ? Object.fromEntries(Object.entries(e).filter((e) => typeof e[1] == "string")) : {};
}
function W(e, t) {
	if (t === void 0) return;
	let n = Object.entries(e).find(([e]) => e.toLowerCase() === "content-type")?.[1]?.toLowerCase() ?? "";
	return n.includes("multipart/form-data") ? "multipart" : n.includes("application/x-www-form-urlencoded") ? "form-urlencoded" : "json";
}
function ot(e, t) {
	let n = e.slice(t, t + 2e3);
	return /\b(?:requests|httpx)\.(?:get|post)\s*\(/i.test(n) ? "python" : /\baxios\.(?:get|post)\s*\(/i.test(n) ? "axios" : "fetch";
}
function st(e) {
	let t = [];
	for (let n of e.matchAll(Be)) t.push({
		start: n.index,
		url: n[2],
		format: ot(e, n.index)
	});
	for (let n of e.matchAll(Ve)) t.push({
		start: n.index,
		url: n[2],
		format: "fetch"
	});
	for (let n of e.matchAll(He)) t.push({
		start: n.index,
		url: n[3],
		format: /^axios/i.test(n[0]) ? "axios" : "python"
	});
	return t.sort((e, t) => e.start - t.start).filter((e, t, n) => t === 0 || e.start !== n[t - 1].start);
}
function ct(e) {
	let t = st(e);
	return t.map((n, r) => {
		let i = e.slice(n.start, t[r + 1]?.start ?? e.length), a = H(i, [
			"payload",
			"body",
			"data",
			"json"
		]), o = !a.range && /\bbody\b/i.test(i) ? nt(e.slice(0, n.start), [
			"payload",
			"body",
			"data",
			"json"
		]) : {}, s = a.range ? a : o, c = H(i, ["headers", "header"]), l = Ue.exec(i) ?? /\b(?:axios|requests|httpx)\.(get|post)\s*\(/i.exec(i), u = l?.[2] ?? l?.[1], d = String(u || (s.value === void 0 ? "GET" : "POST")).toUpperCase(), f = at(c.value), p = U(i, [a.range, c.range].filter((e) => !!e));
		return {
			start: n.start,
			url: n.url,
			method: d,
			headers: f,
			query: {},
			body: s.value,
			bodyEncoding: W(f, s.value),
			response: p[0]?.value,
			format: n.format
		};
	});
}
function lt(e) {
	return [...e.matchAll(/(?:^|\n)\s*curl\b/g)].map((e) => e.index + e[0].indexOf("curl"));
}
function ut(e) {
	let t = lt(e);
	return t.flatMap((n, r) => {
		let i = e.slice(n, t[r + 1] ?? e.length), a = /https?:\/\/[^\s'"\\]+/.exec(i);
		if (!a) return [];
		let o = /(?:^|\s)(?:-d|--data(?:-raw)?|--data-binary)\s+(["'])([\s\S]*?)\1/.exec(i), s = o ? tt(o[2]) : void 0, c = o && o.index >= 0 ? {
			start: o.index + o[0].indexOf(o[2]),
			end: o.index + o[0].indexOf(o[2]) + o[2].length
		} : void 0, l = {};
		for (let e of i.matchAll(/(?:-H|--header)\s+(["'])([\s\S]*?)\1/g)) {
			let t = e[2].indexOf(":");
			t > 0 && (l[e[2].slice(0, t).trim()] = e[2].slice(t + 1).trim());
		}
		let u = /(?:-X|--request)\s+(GET|POST)/i.exec(i)?.[1], d = String(u || (s === void 0 ? "GET" : "POST")).toUpperCase(), f = U(i, c ? [c] : []);
		return [{
			start: n,
			url: a[0],
			method: d,
			headers: l,
			query: {},
			body: s,
			bodyEncoding: W(l, s),
			response: f[0]?.value,
			format: "curl"
		}];
	});
}
function dt(e) {
	let t = [...e.matchAll(/^(GET|POST)\s+(\S+)\s+HTTP\/\d(?:\.\d)?\s*$/gim)];
	return t.flatMap((n, r) => {
		let i = e.slice(n.index, t[r + 1]?.index ?? e.length), a = i.search(/^HTTP\/\d(?:\.\d)?\s+\d+/im), o = a >= 0 ? i.slice(0, a) : i, s = a >= 0 ? i.slice(a) : "", c = o.search(/\r?\n\s*\r?\n/), l = c >= 0 ? o.slice(0, c) : o, u = c >= 0 ? o.slice(c).replace(/^\s+/, "") : "", d = it(l), f = Object.entries(d).find(([e]) => e.toLowerCase() === "host")?.[1];
		if (!f) return [];
		let p = U(u), m = s.search(/\r?\n\s*\r?\n/), h = U(m >= 0 ? s.slice(m).replace(/^\s+/, "") : s);
		return [{
			start: n.index,
			url: `https://${f}${n[2]}`,
			method: n[1].toUpperCase(),
			headers: d,
			query: {},
			body: p[0]?.value,
			bodyEncoding: W(d, p[0]?.value),
			response: h[0]?.value,
			format: "raw-http"
		}];
	});
}
function ft(e) {
	if (!(!e || typeof e != "object" || Array.isArray(e))) for (let t of Object.values(e)) {
		if (!t || typeof t != "object" || Array.isArray(t)) continue;
		let e = t;
		if (e.example !== void 0) return e.example;
		if (e.examples && typeof e.examples == "object" && !Array.isArray(e.examples)) {
			let t = Object.values(e.examples)[0];
			if (t && typeof t == "object" && !Array.isArray(t)) {
				let e = t.value;
				if (e !== void 0) return e;
			}
		}
	}
}
function pt(e) {
	let t;
	try {
		t = JSON.parse(e);
	} catch {
		return [];
	}
	if (!t || typeof t != "object" || Array.isArray(t)) return [];
	let n = t;
	if (typeof n.openapi != "string" || !n.paths || typeof n.paths != "object" || Array.isArray(n.paths)) return [];
	let r = Array.isArray(n.servers) ? n.servers[0] : void 0, i = r && typeof r == "object" && !Array.isArray(r) ? r.url : void 0;
	if (typeof i != "string") return [];
	let a = n.components && typeof n.components == "object" && !Array.isArray(n.components) ? n.components.securitySchemes : void 0, o = a && typeof a == "object" && !Array.isArray(a) && Object.values(a).some((e) => {
		if (!e || typeof e != "object" || Array.isArray(e)) return !1;
		let t = e;
		return t.type === "http" && String(t.scheme).toLowerCase() === "bearer";
	});
	for (let [e, t] of Object.entries(n.paths)) if (!(!t || typeof t != "object" || Array.isArray(t))) for (let n of ["post", "get"]) {
		let r = t[n];
		if (!r || typeof r != "object" || Array.isArray(r)) continue;
		let a = r, s = ft((a.requestBody && typeof a.requestBody == "object" && !Array.isArray(a.requestBody) ? a.requestBody : void 0)?.content), c = a.responses && typeof a.responses == "object" && !Array.isArray(a.responses) ? a.responses : {}, l = Object.entries(c).find(([e]) => /^2\d\d$/.test(e))?.[1], u = l && typeof l == "object" && !Array.isArray(l) ? l : void 0;
		return [{
			start: 0,
			url: `${i.replace(/\/+$/, "")}/${e.replace(/^\/+/, "")}`,
			method: n.toUpperCase(),
			headers: o ? {
				Authorization: "Bearer <token>",
				"Content-Type": "application/json"
			} : { "Content-Type": "application/json" },
			query: {},
			body: s,
			bodyEncoding: s === void 0 ? void 0 : "json",
			response: ft(u?.content),
			format: "openapi"
		}];
	}
	return [];
}
function mt(e) {
	let t = pt(e);
	if (t.length > 0) return t;
	let n = dt(e);
	if (n.length > 0) return n;
	let r = ut(e);
	return r.length > 0 ? r : ct(e);
}
function ht(e) {
	let t = new URL(e.url);
	for (let [n, r] of t.searchParams.entries()) e.query[n] = r;
	return t.search = "", t;
}
function gt(e) {
	if (e.length === 0 || e.some((t) => t.origin !== e[0].origin)) return;
	let t = e.map((e) => e.pathname.split("/").filter(Boolean)), n = [];
	if (t.length > 1) {
		let e = Math.min(...t.map((e) => e.length));
		for (let r = 0; r < e && t.every((e) => e[r] === t[0][r]); r += 1) n.push(t[0][r]);
	} else n = t[0].filter((e, t) => Ke.test(e));
	let r = n.findLastIndex((e) => Ke.test(e));
	n = r >= 0 ? n.slice(0, r + 1) : [];
	let i = n.length > 0 ? `/${n.join("/")}` : "";
	return {
		baseUrl: `${e[0].origin}${i}`,
		prefix: i
	};
}
function _t(e) {
	let t = e?.trim();
	if (t) try {
		let e = new URL(t);
		if (e.protocol !== "https:" || e.username || e.password || e.port && e.port !== "443") return;
		let n = e.pathname.replace(/\/+$/, ""), r = n === "/" ? "" : n;
		return {
			baseUrl: `${e.origin}${r}`,
			prefix: r
		};
	} catch {
		return;
	}
}
function vt(e, t) {
	return yt(e.pathname, t);
}
function yt(e, t) {
	return t && (e === t || e.startsWith(`${t}/`)) ? e.slice(t.length) || "/" : e || "/";
}
function bt(e, t) {
	return !!t && e.pathname !== t && !e.pathname.startsWith(`${t}/`);
}
function G(e) {
	return e.toLowerCase().replace(/[^a-z0-9]/g, "");
}
function K(e, t, n, i) {
	let a = G(e);
	if (Je.has(a) && V(t)) {
		let e = Object.entries(t).find(([e]) => G(e) === "url");
		if (e && typeof e[1] == "string") {
			let o = r(a, e[1], n);
			if (o) return Object.fromEntries(Object.entries(t).filter(([e]) => !z.has(e)).map(([e, t]) => [e, G(e) === "url" ? o : K(e, t, n, i)]));
		}
	}
	let o = r(a, t, n);
	if (o) return o;
	if (Array.isArray(t)) {
		let e = t.map((e) => Tt(e, n, i));
		return n === "video" && a === "content" ? e.map((e) => wt(e, i)) : e;
	}
	return V(t) ? Object.fromEntries(Object.entries(t).filter(([e]) => !z.has(e)).map(([e, t]) => [e, K(e, t, n, i)])) : t;
}
function xt(e, t = /* @__PURE__ */ new Set()) {
	if (typeof e == "string") {
		let n = Xe.exec(e);
		return n && Ze.has(n[1].split(".")[0]) && t.add(`{{${n[1]}}}`), t;
	}
	return Array.isArray(e) ? (e.forEach((e) => xt(e, t)), t) : (V(e) && Object.values(e).forEach((e) => xt(e, t)), t);
}
function q(e, t) {
	e.includes(t) || e.push(t);
}
function St(e, t) {
	if (e === "imageurl" && t === "firstframe") return {
		variable: "firstImage",
		repeat: !1
	};
	if (e === "imageurl" && t === "lastframe") return {
		variable: "lastImage",
		repeat: !1
	};
	if (e === "imageurl" && (t === "referenceimage" || t === "reference")) return {
		variable: "referenceImageUrls",
		repeat: !0
	};
	if (e === "videourl" && (t === "referencevideo" || t === "reference")) return {
		variable: "referenceVideoUrls",
		repeat: !0
	};
	if (e === "audiourl" && (t === "referenceaudio" || t === "reference")) return {
		variable: "referenceAudioUrls",
		repeat: !0
	};
}
function Ct(e, t, n) {
	return typeof e == "string" ? e === t ? n : e : Array.isArray(e) ? e.map((e) => Ct(e, t, n)) : V(e) ? Object.fromEntries(Object.entries(e).map(([e, r]) => [e, Ct(r, t, n)])) : e;
}
function wt(e, t) {
	let n = [...xt(e)], r = V(e) && typeof e.role == "string" ? G(e.role) : "";
	if (n.length === 0) return r === "reference" && q(t, `${B}content[] 中 role="reference" 的媒体类型或 URL 字段无法高置信映射，禁止保留示例素材地址。`), e;
	if (!V(e)) return q(t, `${B}content[] 中检测到复合参考素材项，无法安全推断缺少素材时的请求结构。`), e;
	let i = typeof e.type == "string" ? G(e.type) : "", a = Ye.has(i) && Object.keys(e).some((e) => G(e) === i), o = new Set([
		"type",
		"role",
		i
	]), s = Object.keys(e).some((e) => !o.has(G(e)));
	if (!a || s || n.length !== 1) return q(t, `${B}content[] 中检测到复合或多参考媒体项，无法安全推断缺少素材时的请求结构。`), e;
	let c = St(i, r);
	if (c) {
		let t = `{{${c.variable}}}`, r = Ct(e, n[0], t);
		return c.repeat ? {
			$forEach: t,
			$value: r
		} : {
			$whenPresent: t,
			$value: r
		};
	}
	return {
		$whenPresent: n[0],
		$value: e
	};
}
function Tt(e, t, n) {
	return Array.isArray(e) ? e.map((e) => Tt(e, t, n)) : V(e) ? Object.fromEntries(Object.entries(e).filter(([e]) => !z.has(e)).map(([e, r]) => [e, K(e, r, t, n)])) : e;
}
function Et(e, t, n) {
	if (!V(e)) return e;
	let r = Object.entries(e).filter(([e]) => z.has(e) ? (q(n, "请求体包含不安全对象键，已从导入协议中移除。"), !1) : !kt(e));
	return Object.fromEntries(r.map(([e, r]) => [e, K(e, r, t, n)]));
}
function Dt(n, r) {
	if (!(r !== "image" || !V(n.body))) for (let [r, i] of Object.entries(n.body)) {
		let a = G(r);
		if (e.includes(a)) return "generation-json-image-urls";
		if (t.includes(a)) {
			if (n.bodyEncoding === "multipart") return "edits-multipart";
			if ((Array.isArray(i) ? i : [i]).some((e) => typeof e == "string" && /^data:image\//i.test(e.trim()))) return "generation-json-image-data-urls";
		}
	}
}
function Ot(e, t) {
	if (t !== "image" || !V(e)) return e;
	let n = Array.isArray(e.contents) ? e.contents : [], r = (n.length > 0 ? n : [{}]).map((e) => {
		let t = V(e) ? e : {}, n = (Array.isArray(t.parts) ? t.parts : []).map((e) => !V(e) || !Object.hasOwn(e, "text") ? e : {
			...e,
			text: "{{prompt}}"
		});
		return n.some((e) => V(e) && Object.hasOwn(e, "text")) || n.unshift({ text: "{{prompt}}" }), {
			...t,
			role: typeof t.role == "string" && t.role !== "string" ? t.role : "user",
			parts: n
		};
	}), i = V(e.generationConfig) ? e.generationConfig : {};
	return {
		...Object.fromEntries(Object.entries(e).filter(([e]) => !["model", "prompt"].includes(G(e)))),
		contents: r,
		generationConfig: {
			...i,
			responseModalities: ["IMAGE"]
		}
	};
}
function kt(e) {
	return [
		"apikey",
		"accesstoken",
		"authorization",
		"secret",
		"token"
	].includes(G(e));
}
function J(e) {
	return Array.isArray(e) ? e.some(J) : V(e) ? Object.entries(e).some(([e, t]) => kt(e) || J(t)) : !1;
}
function At(e) {
	if (!V(e)) return;
	let t = Object.entries(e).find(([e, t]) => [
		"model",
		"modelid",
		"modelname"
	].includes(G(e)) && typeof t == "string");
	return typeof t?.[1] == "string" ? t[1] : void 0;
}
function Y(e, t = "") {
	if (Array.isArray(e)) return e.flatMap((e, n) => Y(e, t ? `${t}.${n}` : String(n)));
	if (e && typeof e == "object") return Object.entries(e).flatMap(([e, n]) => Y(n, t ? `${t}.${e}` : e));
	let n = t.split(".");
	return t ? [{
		path: t,
		key: n[n.length - 1],
		value: e
	}] : [];
}
function jt(e) {
	return e.split(".").map((e) => /^\d+$/.test(e) ? "*" : e).join(".");
}
function X(e, t) {
	return e.map((e) => ({
		leaf: e,
		score: t(e)
	})).filter((e) => e.score > 0).sort((e, t) => t.score - e.score)[0]?.leaf;
}
function Mt(e, t) {
	let n = new URL(e.url).pathname.toLowerCase(), r = V(e.body) ? Object.keys(e.body).map(G) : [], i = Y(t).filter((e) => typeof e.value == "string" && L.test(e.value));
	return /\bvideos?\b|video[_-]generation/.test(n) || r.some((e) => [
		"numframes",
		"framerate",
		"videoduration"
	].includes(e)) ? "video" : /\b(?:audio|speech|music|transcriptions?)\b/.test(n) || r.some((e) => [
		"voice",
		"audiovoice",
		"audioformat"
	].includes(e)) ? "audio" : /\b(?:images?|image-generation)\b/.test(n) || i.some((e) => /\.(?:png|jpe?g|webp)(?:\?|$)/i.test(String(e.value))) ? "image" : "text";
}
function Nt(e) {
	for (let t of e) {
		for (let [e, n] of Object.entries(t.headers)) {
			if (e.toLowerCase() === "authorization") {
				let e = n.match(/^([^<{]*?)(?:<|\{\{|\$\{|YOUR_|sk-)/i)?.[1];
				return {
					type: "bearer",
					...e && e !== "Bearer " ? { prefix: e } : {}
				};
			}
			if (/(?:api[-_]?key|token|authorization)/i.test(e) || Ge.test(n)) return {
				type: "header",
				name: e
			};
		}
		let e = Object.keys(t.query).find((e) => /(?:api[-_]?key|access[-_]?token|token)/i.test(e));
		if (e) return {
			type: "query",
			name: e
		};
	}
	return { type: "none" };
}
function Pt(e, t) {
	let n = Nt(e);
	return n.type === "none" && /(?:["']Authorization["']|Authorization)\s*:?\s*["']?Bearer(?:\s|["'<]|$)/i.test(t) ? { type: "bearer" } : n;
}
function Z(e) {
	let t = Object.entries(e).filter(([e, t]) => {
		let n = e.toLowerCase();
		return !([
			"authorization",
			"content-type",
			"host",
			"content-length"
		].includes(n) || /(?:api[-_]?key|token)/i.test(e) || Ge.test(t));
	});
	return t.length > 0 ? Object.fromEntries(t) : void 0;
}
function Ft(e) {
	if (!e) return;
	let t = Object.keys(e.query).find((e) => /(?:task|job|video|request|prediction).*id|^id$/i.test(e));
	return t ? G(t) : new URL(e.url).pathname.split("/").filter(Boolean).findIndex((e) => qe.test(e)) >= 0 ? "taskid" : void 0;
}
function It(e, t) {
	return X(Y(e), (e) => {
		if (typeof e.value != "string" && typeof e.value != "number") return 0;
		let n = G(e.key), r = 0;
		return t && n === t && (r += 120), [
			"taskid",
			"videoid",
			"jobid",
			"predictionid",
			"requestid"
		].includes(n) ? r += 100 : n === "id" && (r += 45), /task|video|job|prediction|request/i.test(String(e.value)) && (r += 20), r;
	})?.path;
}
function Lt(e) {
	return X(Y(e), (e) => {
		if (typeof e.value != "string") return 0;
		let t = G(e.key);
		return t === "status" ? 100 : ["state", "phase"].includes(t) ? 75 : 0;
	})?.path;
}
function Rt(e) {
	return X(Y(e), (e) => [
		"progress",
		"percentage",
		"percent"
	].includes(G(e.key)) && typeof e.value == "number" ? 100 : 0)?.path;
}
function Q(e) {
	return X(Y(e), (e) => {
		let t = G(e.key);
		return t === "error" ? 100 : t === "message" && /error|fail/i.test(e.path) ? 90 : ["errormessage", "detail"].includes(t) ? 75 : 0;
	})?.path;
}
function zt(e) {
	let t = X(Y(e), (e) => {
		if (typeof e.value != "string" || !L.test(e.value)) return 0;
		let t = G(e.key) === "url" ? 100 : 45;
		return /result|output|data/i.test(e.path) && (t += 25), /\.(?:png|jpe?g|webp|mp4|webm|mov|mp3|wav|flac)(?:\?|$)/i.test(e.value) && (t += 20), t;
	});
	return t ? jt(t.path) : void 0;
}
function Bt(e) {
	let t = X(Y(e), (e) => {
		if (typeof e.value != "string" || L.test(e.value)) return 0;
		let t = G(e.key), n = [
			"content",
			"text",
			"output",
			"answer"
		].includes(t) ? 80 : 0;
		return /choices|message|result/i.test(e.path) && (n += 30), /status|error|id/i.test(e.path) && (n -= 50), n;
	});
	return t ? jt(t.path) : void 0;
}
function Vt(e) {
	let t = X(Y(e), (e) => [
		"b64json",
		"base64",
		"base64data"
	].includes(G(e.key)) && typeof e.value == "string" ? 100 : 0);
	return t ? jt(t.path) : void 0;
}
function Ht(e) {
	if (!V(e) || !Array.isArray(e.candidates)) return;
	let t = !1;
	for (let n of e.candidates) if (!(!V(n) || !V(n.content) || !Array.isArray(n.content.parts))) {
		t = !0;
		for (let e of n.content.parts) if (V(e)) {
			if (V(e.inlineData) && typeof e.inlineData.data == "string") return "candidates.*.content.parts.*.inlineData.data";
			if (V(e.inline_data) && typeof e.inline_data.data == "string") return "candidates.*.content.parts.*.inline_data.data";
		}
	}
	return t ? "candidates.*.content.parts.*.inlineData.data" : void 0;
}
function Ut(e, t) {
	return !t || !R.test(e) ? e : e.replace(/(\/models\/)[^/]+(:generateContent\/?$)/i, "$1{{model}}$2");
}
function Wt(e, t, n, r) {
	let i = `{{submit.${r}}}`, a = { ...t }, o = Object.keys(a).find((e) => /(?:task|job|video|request|prediction).*id|^id$/i.test(e));
	if (o) return a[o] = i, {
		path: e.pathname,
		query: a,
		preferredKey: G(o)
	};
	let s = e.pathname.split("/").filter(Boolean), c = s.findIndex((e) => qe.test(e));
	return c >= 0 && s[c + 1] ? (s[c + 1] = i, {
		path: `/${s.join("/")}`,
		query: a,
		preferredKey: "taskid"
	}) : (n.push("未能确定轮询请求中的任务 ID 位置，请手动检查轮询 path 或 query。"), {
		path: e.pathname,
		query: a
	});
}
function $(e) {
	return Object.keys(e).length > 0 ? e : void 0;
}
function Gt(e) {
	let t = [], n = (n, r, i, a = e.confidence) => {
		i && t.push({
			id: n,
			label: r,
			value: i,
			confidence: a
		});
	};
	return n("base-url", "连接地址", e.baseUrl), n("model", "模型 ID", e.modelId), n("category", "模型分类", e.category), n("image-reference", "参考图请求", e.imageReferenceRequestMode), n("submit", "提交请求", e.protocol ? `${e.protocol.submit.method} ${e.protocol.submit.path}` : void 0), n("task-id", "任务 ID 路径", e.protocol?.response.taskIdPath), n("poll", "查询请求", e.protocol?.poll ? `${e.protocol.poll.method} ${e.protocol.poll.path}` : void 0), n("status", "状态路径", e.protocol?.poll?.response.statusPath), n("result", "结果路径", e.protocol?.mode === "async" ? e.protocol.poll?.response.result.urlPath ?? e.protocol.poll?.response.result.textPath : e.protocol?.response.result?.urlPath ?? e.protocol?.response.result?.textPath), t;
}
function Kt(e) {
	return e >= .82 ? "high" : e >= .55 ? "medium" : "low";
}
function qt(e, t = {}) {
	let n = e.submitRequest.trim(), r = e.submitResponse.trim(), i = e.pollRequest?.trim() ?? "", a = e.pollResponse?.trim() ?? "";
	if (!n) throw Error("请填写提交请求示例");
	if (!r) throw Error("请填写提交响应示例");
	if (!!i != !!a) throw Error("轮询请求示例和轮询响应示例必须同时填写");
	return Jt([
		n,
		r,
		...i ? [i, a] : []
	].join("\n\n"), t);
}
function Jt(e, t = {}) {
	let r = e.replace(/\r\n/g, "\n").trim();
	if (!r) throw Error("请先粘贴接口文档或请求示例");
	let i = mt(r).sort((e, t) => e.start - t.start);
	if (i.length === 0) throw /^\s*(?:openapi|swagger)\s*:/im.test(r) ? Error("检测到 OpenAPI YAML；当前版本请粘贴 JSON 格式规范或文档中的请求/响应代码块") : Error("没有识别到请求示例，请粘贴 Fetch、Axios、cURL、Python requests、Raw HTTP 或 OpenAPI JSON");
	let a = [], o = $e([...i.map((e) => e.format), ...i.some((e) => e.response !== void 0) ? ["json"] : []]), s = i.map(ht), c = _t(t.baseUrl), l = s.some((e) => e.hostname.toLowerCase() === "loading"), u = c ?? (l ? void 0 : gt(s));
	t.baseUrl && !c ? a.push("显式 Base URL 无效，必须是无凭据的标准 HTTPS 地址。") : !u && l ? a.push("请求示例使用 https://loading 占位地址，需要提供实际 Base URL。") : u || a.push("检测到多个不同域名，请确认提交和查询接口是否属于同一连接。");
	let d = i[0], f = i[1], p = d.response, m = f?.response, h = t.category ?? Mt(d, m ?? p), ee = Dt(d, h), g = t.modelId?.trim() || At(d.body);
	g || a.push("未从请求体识别到模型 ID，需要手动填写模型。"), p || a.push("未识别到提交响应示例，无法可靠推断返回值路径。"), V(d.body) && Object.keys(d.body).some((e) => We.test(e)) && a.push("检测到 Webhook/回调地址；当前声明式协议不支持等待外部回调，请改用可轮询的查询接口。");
	let _ = J(d.body) || i.slice(1).some((e) => J(e.body));
	_ && a.push("检测到请求体鉴权字段；当前协议只支持 Header、Bearer 或 Query 鉴权，已移除密钥且禁止直接应用。");
	let v = Pt(i, r), y = u?.prefix ?? "", b = s[0], x = { ...d.query };
	v.type === "query" && v.name && delete x[v.name];
	let S = vt(b, y), C = Et(d.body, h, a), w = {
		method: d.method,
		path: Ut(S, g),
		...Z(d.headers) ? { headers: Z(d.headers) } : {},
		...$(x) ? { query: $(x) } : {},
		...d.bodyEncoding ? { bodyEncoding: d.bodyEncoding } : {},
		...d.body === void 0 ? {} : { body: R.test(b.pathname) ? Ot(C, h) : C }
	}, T = It(p, Ft(f)), E = !!f && !!m && !!T, D;
	if (E && u) {
		let e = s[1], t = { ...f.query };
		v.type === "query" && v.name && delete t[v.name];
		let n = Wt(e, t, a, T), r = Lt(m), i = zt(m), o = h === "text" ? Bt(m) : void 0, c = Vt(m);
		r || a.push("未从查询响应识别到任务状态路径。"), !i && !o && !c && a.push("未从查询响应识别到结果 URL、文本或 Base64 路径。"), r && (i || o || c) && (D = {
			version: 2,
			mode: "async",
			auth: v,
			submit: w,
			response: {
				type: "json",
				taskIdPath: T,
				...Q(p) ? { errorPath: Q(p) } : {}
			},
			poll: {
				method: f.method,
				path: yt(n.path, y),
				...bt(e, y) ? { pathMode: "origin" } : {},
				...Z(f.headers) ? { headers: Z(f.headers) } : {},
				...$(n.query) ? { query: $(n.query) } : {},
				...f.bodyEncoding ? { bodyEncoding: f.bodyEncoding === "multipart" ? "json" : f.bodyEncoding } : {},
				...f.body === void 0 ? {} : { body: Et(f.body, h, a) },
				response: {
					statusPath: r,
					successValues: [
						"completed",
						"succeeded",
						"success",
						"done"
					],
					failureValues: [
						"failed",
						"error",
						"canceled",
						"cancelled"
					],
					result: {
						...i ? { urlPath: i } : {},
						...o ? { textPath: o } : {},
						...c ? {
							base64Path: c,
							mimeType: h === "image" ? "image/png" : "application/octet-stream"
						} : {}
					},
					...Q(m) ? { errorPath: Q(m) } : {},
					...Rt(m) ? { progressPath: Rt(m) } : {}
				},
				intervalMs: 3e3
			}
		});
	} else if (p && u) if (T) a.push("提交响应包含任务 ID，但未识别到完整的查询请求和查询响应，暂不能生成异步协议。");
	else {
		let e = zt(p), t = h === "text" ? Bt(p) : void 0, n = h === "image" && R.test(b.pathname) ? Ht(p) : Vt(p);
		!e && !t && !n && a.push("未从同步响应识别到结果 URL、文本或 Base64 路径。"), (e || t || n) && (D = {
			version: 2,
			mode: "sync",
			auth: v,
			submit: w,
			response: {
				type: "json",
				result: {
					...e ? { urlPath: e } : {},
					...t ? { textPath: t } : {},
					...n ? {
						base64Path: n,
						mimeType: h === "image" ? "image/png" : "application/octet-stream"
					} : {}
				},
				...Q(p) ? { errorPath: Q(p) } : {}
			}
		});
	}
	if (a.some((e) => e.includes("Webhook/回调")) && (D = void 0), _ && (D = void 0), a.some((e) => e.startsWith(B)) && (D = void 0), D) {
		let e = n(D);
		e.length > 0 && (a.push(`生成的协议未通过校验：${e[0]}`), D = void 0);
	}
	let O = 1;
	u || (O -= .35), g || (O -= .2), D || (O -= .35), O -= Math.min(.24, a.length * .06), o.includes("raw-http") && (O -= .05);
	let k = Kt(O), te = {
		baseUrl: u?.baseUrl,
		modelId: g,
		category: h,
		imageReferenceRequestMode: ee,
		protocol: D,
		confidence: k,
		formats: o,
		warnings: a
	};
	return {
		...te,
		fields: Gt(te)
	};
}
//#endregion
export { Te as a, F as c, v as d, ze as i, Ce as l, ye as n, be as o, we as r, Se as s, qt as t, y as u };
