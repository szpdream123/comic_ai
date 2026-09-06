import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./react-dom-BhFnNZvF.js";
import { t as r } from "./jsx-runtime-BAkIPmuO.js";
import { a as i } from "./i18n-on3r1DCI.js";
import { oi as a, si as o, t as s } from "./useAppStore-BH-MdRLu.js";
import { n as c } from "./num-vBm-9Bix.js";
import { a as l, r as u } from "./ViewportImage-txaOn4PW.js";
import { I as d, It as f, Nt as p, Vt as m, Y as h } from "./useTooltipAutoPlacement-D1FArkVS.js";
import { n as g } from "./rasterImageDimensions-CX1VK2cM.js";
import { i as _ } from "./clipboardService-Dwr2bAlQ.js";
import { t as v } from "./ModelSelector-BPW0Bkh4.js";
//#region src/services/ai/reversePrompt.ts
var y = /* @__PURE__ */ e(t(), 1), b = n(), x = ["只写画面里真实可见的内容，不要臆测背景故事，不要评价好坏。", "直接输出提示词正文，一整段，不要标题、不要分点、不要任何前后缀说明。"], S = {
	image: [
		"你是 AI 绘画提示词专家。仔细观察这张图，反推出一段能重新生成它的提示词。",
		"需要覆盖：主体与外观、姿态与构图、镜头与视角、光线与氛围、色彩与材质、画风与媒介（写实摄影／2D 插画／3D 渲染／像素等）。",
		...x
	].join("\n"),
	video: [
		"你是 AI 视频提示词专家。下面几张图是同一段视频按时间顺序抽的关键帧（首帧、中间帧、尾帧）。反推出一段能重新生成这段视频的提示词。",
		"先写画面：主体与外观、场景、光线、色彩、画风；再写运动：主体动作如何变化、镜头如何运动（推拉摇移／跟随／固定）、节奏快慢。",
		"运动只写帧与帧之间能看出来的变化，不要编造没有依据的情节。",
		...x
	].join("\n")
}, C = {
	image: "图片",
	video: "视频"
};
function w() {
	let e = d("ai-text");
	if (e && m(e.model)) return e;
	let t = s.getState().config, n = f(t, "ai-text").flatMap((e) => e.models).find((e) => m(e.value));
	if (n) return {
		model: n.value,
		provider: n.provider
	};
	let r = (t?.generalModels || []).find((e) => e.category === "text" && m(e.modelId));
	return r ? {
		model: `general/${r.id}`,
		provider: "general"
	} : e;
}
function T(e) {
	return /image_url|unknown variant|multimodal|vision|image input/i.test(e);
}
async function E(e) {
	if (e.imageUrls.length === 0) throw Error(`没有可反推的${C[e.kind]}`);
	let t = e.extraPrompt?.trim(), n = t ? `${S[e.kind]}\n【额外要求】${t}` : S[e.kind];
	try {
		return (await h({
			prompt: n,
			model: e.model,
			provider: e.provider,
			imageUrls: e.imageUrls
		})).trim();
	} catch (t) {
		let n = t instanceof Error ? t.message : "提示词反推失败";
		throw Error(T(n) ? `模型 ${e.model} 不接受图片输入，请换一个能读图的文本模型（如 GPT-4o / Claude / Gemini / Qwen-VL）。原始报错：${n}` : n, { cause: t });
	}
}
function D(e, t, n) {
	let r = s.getState(), i = r.nodes.find((t) => t.id === e);
	if (!i) return r.showToast("源节点已不存在", "error"), null;
	let l = n.split(/\r?\n/).reduce((e, t) => e + Math.max(1, Math.ceil(t.length / 36)), 0), u = i.data.label?.trim() || i.data.fileName?.trim() || C[t], d = `node-${o()}`, f = {
		id: d,
		type: "ai-text",
		...a(i),
		data: {
			label: `${u} 反推提示词`,
			type: "ai-text",
			role: "source",
			output: n,
			status: "success",
			nodeWidth: 280,
			nodeHeight: c(l)
		}
	}, p = {
		id: o(),
		source: e,
		target: d,
		sourceHandle: "right",
		targetHandle: "left"
	};
	return r.addNodeWithEdge(f, p), r.showToast("已添加为文本节点"), d;
}
//#endregion
//#region src/components/nodes/shared/ReversePromptDialog.tsx
var O = r(), k = {
	hidden: {
		opacity: 0,
		scale: .97,
		y: 12
	},
	visible: {
		opacity: 1,
		scale: 1,
		y: 0,
		transition: {
			type: "spring",
			stiffness: 380,
			damping: 32
		}
	},
	exit: {
		opacity: 0,
		scale: .97,
		y: 8,
		transition: { duration: .14 }
	}
};
function A({ request: e, onClose: t }) {
	let n = i(), r = n(C[e.kind]), a = (0, y.useMemo)(() => w(), []), [o, s] = (0, y.useState)(a?.model ?? ""), [c, l] = (0, y.useState)(a?.provider ?? ""), [d, f] = (0, y.useState)(""), [m, h] = (0, y.useState)(""), [b, x] = (0, y.useState)(""), [S, T] = (0, y.useState)(!1), [A, j] = (0, y.useState)(!1), M = (0, y.useCallback)((e) => {
		s(e.value), l(e.provider);
	}, []), N = (0, y.useCallback)(async () => {
		if (!o || !c) {
			x(n("请先选择一个能读图的文本模型"));
			return;
		}
		T(!0), x("");
		try {
			h(await E({
				kind: e.kind,
				imageUrls: e.imageUrls,
				model: o,
				provider: c,
				extraPrompt: d
			}));
		} catch (e) {
			x(e instanceof Error ? e.message : n("提示词反推失败"));
		} finally {
			T(!1);
		}
	}, [
		d,
		o,
		c,
		e.imageUrls,
		e.kind,
		n
	]), P = (0, y.useCallback)(async () => {
		j(await _(m));
	}, [m]), F = (0, y.useCallback)(() => {
		m.trim() && (D(e.sourceNodeId, e.kind, m.trim()), t());
	}, [
		t,
		e.kind,
		e.sourceNodeId,
		m
	]);
	return /* @__PURE__ */ (0, O.jsxs)(O.Fragment, { children: [/* @__PURE__ */ (0, O.jsx)(u.div, {
		"data-tauri-drag-region": !0,
		className: "preset-modal-overlay",
		initial: { opacity: 0 },
		animate: { opacity: 1 },
		exit: { opacity: 0 },
		onClick: t
	}), /* @__PURE__ */ (0, O.jsx)("div", {
		className: "preset-modal-wrapper",
		children: /* @__PURE__ */ (0, O.jsxs)(u.div, {
			className: "preset-modal reverse-prompt-modal",
			variants: k,
			initial: "hidden",
			animate: "visible",
			exit: "exit",
			role: "dialog",
			"aria-modal": "true",
			"aria-labelledby": "reverse-prompt-title",
			onClick: (e) => e.stopPropagation(),
			children: [
				/* @__PURE__ */ (0, O.jsxs)("header", {
					className: "preset-runner-header",
					children: [/* @__PURE__ */ (0, O.jsxs)("div", {
						className: "preset-runner-heading",
						children: [/* @__PURE__ */ (0, O.jsx)("span", {
							className: "preset-runner-heading-icon",
							children: /* @__PURE__ */ (0, O.jsx)(g, {
								icon: "mdi:text-search",
								width: 20,
								height: 20
							})
						}), /* @__PURE__ */ (0, O.jsxs)("div", { children: [/* @__PURE__ */ (0, O.jsx)("h2", {
							id: "reverse-prompt-title",
							children: n("反推提示词")
						}), /* @__PURE__ */ (0, O.jsx)("p", { children: e.kind === "video" ? n("已抽取 {count} 帧关键帧，连画面带运动一起反推", { count: e.imageUrls.length }) : n("读取这张图，反推出能重新生成它的提示词") })] })]
					}), /* @__PURE__ */ (0, O.jsx)(p, { onClick: t })]
				}),
				/* @__PURE__ */ (0, O.jsxs)("div", {
					className: "preset-runner-body",
					children: [
						/* @__PURE__ */ (0, O.jsx)("div", {
							className: "reverse-prompt-thumbs",
							"aria-label": n("参与反推的{source}", { source: r }),
							children: e.imageUrls.map((e, t) => /* @__PURE__ */ (0, O.jsx)("img", {
								src: e,
								alt: `${r}${t + 1}`
							}, `${e.slice(0, 32)}-${t}`))
						}),
						/* @__PURE__ */ (0, O.jsxs)("label", {
							className: "preset-manager-field",
							children: [/* @__PURE__ */ (0, O.jsx)("span", {
								className: "preset-manager-label",
								children: n("反推模型")
							}), /* @__PURE__ */ (0, O.jsxs)("div", {
								className: "reverse-prompt-model",
								children: [/* @__PURE__ */ (0, O.jsx)(v, {
									nodeType: "ai-text",
									selectedModel: o,
									selectedProvider: c,
									onSelect: M
								}), /* @__PURE__ */ (0, O.jsx)("span", {
									className: "reverse-prompt-hint",
									children: n("需要能读图的模型")
								})]
							})]
						}),
						/* @__PURE__ */ (0, O.jsxs)("label", {
							className: "preset-manager-field",
							children: [/* @__PURE__ */ (0, O.jsx)("span", {
								className: "preset-manager-label",
								children: n("补充要求（可选）")
							}), /* @__PURE__ */ (0, O.jsx)("textarea", {
								className: "preset-manager-input preset-runner-textarea",
								value: d,
								placeholder: n("例如：输出英文提示词 / 只描述角色不描述背景 / 按 Midjourney 风格组织"),
								onChange: (e) => f(e.target.value)
							})]
						}),
						/* @__PURE__ */ (0, O.jsxs)("div", {
							className: "preset-manager-field",
							children: [/* @__PURE__ */ (0, O.jsx)("span", {
								className: "preset-manager-label",
								children: n("反推结果")
							}), S ? /* @__PURE__ */ (0, O.jsxs)("div", {
								className: "reverse-prompt-loading",
								children: [/* @__PURE__ */ (0, O.jsx)("span", { className: "spinner" }), /* @__PURE__ */ (0, O.jsx)("span", { children: n("正在读{source}并反推提示词...", { source: r }) })]
							}) : b ? /* @__PURE__ */ (0, O.jsxs)("div", {
								className: "reverse-prompt-error",
								role: "alert",
								children: [/* @__PURE__ */ (0, O.jsx)(g, {
									icon: "lucide:triangle-alert",
									width: 15,
									height: 15
								}), /* @__PURE__ */ (0, O.jsx)("span", { children: b })]
							}) : /* @__PURE__ */ (0, O.jsx)("textarea", {
								className: "preset-manager-input reverse-prompt-result",
								value: m,
								placeholder: n("点下面的「开始反推」生成提示词，生成后可直接在这里修改"),
								onChange: (e) => {
									h(e.target.value), j(!1);
								}
							})]
						})
					]
				}),
				/* @__PURE__ */ (0, O.jsxs)("footer", {
					className: "preset-modal-actions reverse-prompt-actions",
					children: [/* @__PURE__ */ (0, O.jsxs)("button", {
						type: "button",
						className: "preset-modal-btn-secondary",
						disabled: S || !m.trim(),
						onClick: P,
						children: [/* @__PURE__ */ (0, O.jsx)(g, {
							icon: A ? "mdi:check" : "mdi:content-copy",
							width: 15,
							height: 15
						}), /* @__PURE__ */ (0, O.jsx)("span", { children: n(A ? "已复制" : "复制") })]
					}), /* @__PURE__ */ (0, O.jsxs)("div", { children: [/* @__PURE__ */ (0, O.jsxs)("button", {
						type: "button",
						className: "preset-modal-btn-secondary",
						disabled: S,
						onClick: N,
						children: [/* @__PURE__ */ (0, O.jsx)(g, {
							icon: S ? "mdi:loading" : "mdi:refresh",
							width: 15,
							height: 15
						}), /* @__PURE__ */ (0, O.jsx)("span", { children: n(S ? "反推中..." : m || b ? "重新反推" : "开始反推") })]
					}), /* @__PURE__ */ (0, O.jsxs)("button", {
						type: "button",
						className: "preset-modal-btn-primary ml-1",
						disabled: S || !m.trim(),
						onClick: F,
						children: [/* @__PURE__ */ (0, O.jsx)(g, {
							icon: "mdi:file-document-plus-outline",
							width: 15,
							height: 15
						}), /* @__PURE__ */ (0, O.jsx)("span", { children: n("添加为文本节点") })]
					})] })]
				})
			]
		})
	})] });
}
function j() {
	let e = s((e) => e.reversePromptRequest), t = s((e) => e.setReversePromptRequest), n = (0, y.useCallback)(() => t(null), [t]);
	return (0, y.useEffect)(() => {
		if (!e) return;
		let t = (e) => {
			e.key === "Escape" && (e.stopPropagation(), n());
		};
		return window.addEventListener("keydown", t, !0), () => window.removeEventListener("keydown", t, !0);
	}, [n, e]), (0, b.createPortal)(/* @__PURE__ */ (0, O.jsx)(l, { children: e ? /* @__PURE__ */ (0, O.jsx)(A, {
		request: e,
		onClose: n
	}, `${e.sourceNodeId}:${e.imageUrls.length}`) : null }), document.body);
}
//#endregion
export { j as default };
