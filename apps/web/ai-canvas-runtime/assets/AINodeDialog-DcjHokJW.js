import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./react-dom-BhFnNZvF.js";
import { t as r } from "./jsx-runtime-BAkIPmuO.js";
import { a as i } from "./i18n-on3r1DCI.js";
import { Qt as a, Sr as o, Yt as s, br as c, fi as l, gt as u, it as d, oi as f, pi as p, rt as m, si as h, t as g, vi as _, xi as v, xr as y, yi as b } from "./useAppStore-BH-MdRLu.js";
import { b as x, c as S, l as C, m as w, s as T, t as E } from "./shotlist-DkMSyocu.js";
import { i as D } from "./core-D3lATfku.js";
import { h as O } from "./fileService-BawXHbsK.js";
import { n as k } from "./dramaAssetExtract-TP_lzZcC.js";
import { a as A, r as j } from "./ViewportImage-txaOn4PW.js";
import { A as M, B as N, Ft as P, G as ee, H as F, K as I, Kt as L, Nt as te, O as R, P as z, T as B, U as ne, Ut as V, V as re, Wt as H, Y as ie, a as ae, j as oe, k as se, q as ce, qt as le, z as ue } from "./useTooltipAutoPlacement-D1FArkVS.js";
import { n as U } from "./rasterImageDimensions-CX1VK2cM.js";
import { t as de } from "./QualityRatioSelector-LO9EKHvS.js";
import { a as fe, c as pe, i as W, o as me, r as he, s as ge, t as _e } from "./MentionEditor-BXDyakbM.js";
import { t as ve } from "./FullscreenOverlay-BTKONk6M.js";
import { i as ye } from "./onnxService-NbSJoWgT.js";
import { t as be } from "./ModelSelector-BPW0Bkh4.js";
import { a as xe } from "./cameraStudio-D2rT6ZbS.js";
//#region src/services/shotlistGenerate.ts
var G = /* @__PURE__ */ e(t(), 1), K = r(), Se = {
	shotNo: "字符串，从 \"1\" 起按顺序编号，插入镜可写 \"3a\"",
	shotSize: `从 ${S.join(" / ")} 中选一个`,
	camera: `从 ${T.join(" / ")} 中选一个，可再补一句细节，如「手持，轻微晃动」`,
	content: "一句话说清这一镜拍到什么：主体、动作、环境、光线",
	dialogue: "本镜的台词或字幕原文，没有就给空字符串",
	audio: "音效或配乐，没有就给空字符串",
	transition: `与下一镜的转场，从 ${C.map((e) => e.label).join(" / ")} 中选一个`,
	duration: "数字，单位秒；拿不准就给 3",
	note: "拍摄提示或情绪注记，没有就给空字符串"
};
function Ce(e, t) {
	let n = t.filter((e) => e !== "frame").map((e) => `- ${e}（${E[e]}）：${Se[e]}`);
	return [
		"你是分镜师。按下面的需求拆出一份逐镜清单。",
		"",
		"需求：",
		e.trim(),
		"",
		"每个镜头是一个 JSON 对象，字段只有这些（多写的字段会被丢弃）：",
		...n,
		"",
		"只输出下面结构的 JSON，不要解释、不要前后缀：",
		"{\"shots\": [{ ... }, { ... }]}"
	].join("\n");
}
function q(e) {
	return typeof e == "string" ? e.trim() : e == null ? "" : String(e).trim();
}
function we(e, t) {
	let n = Number(e.duration);
	return {
		...w(`shot-${h()}`, q(e.shotNo) || t + 1),
		shotSize: q(e.shotSize),
		camera: q(e.camera),
		content: q(e.content),
		dialogue: q(e.dialogue),
		audio: q(e.audio),
		transition: q(e.transition),
		note: q(e.note),
		duration: Number.isFinite(n) && n > 0 ? n : 3
	};
}
function Te(e) {
	let t;
	try {
		t = k(e);
	} catch {
		throw Error("模型没有返回 JSON，分镜没能解析出来");
	}
	let n = t?.shots;
	if (!Array.isArray(n)) throw Error("模型返回的 JSON 里没有 shots 数组");
	let r = n.filter((e) => !!e && typeof e == "object").map(we);
	if (r.length === 0) throw Error("模型没有返回任何镜头");
	return r;
}
function Ee(e, t) {
	let n = new Map(e.filter((e) => e.frame).map((e) => [e.shotNo.trim(), e.frame]));
	return n.size === 0 ? t : t.map((e) => {
		let t = n.get(e.shotNo.trim());
		return t ? {
			...e,
			frame: t
		} : e;
	});
}
//#endregion
//#region src/components/nodes/shared/AudioParamSelector.tsx
var De = [
	{
		value: "alloy",
		label: "Alloy"
	},
	{
		value: "echo",
		label: "Echo"
	},
	{
		value: "fable",
		label: "Fable"
	},
	{
		value: "onyx",
		label: "Onyx"
	},
	{
		value: "nova",
		label: "Nova"
	},
	{
		value: "shimmer",
		label: "Shimmer"
	}
], Oe = [
	"wav",
	"opus",
	"aac",
	"flac",
	"pcm"
];
function ke({ purpose: e, voice: t = "alloy", format: n = "wav", speed: r = 1, musicTitle: a = "", musicLyrics: o = "", musicBpm: s, musicDuration: c = 60, autoGenerateLyrics: l = !1, onChangeVoice: u, onChangeFormat: d, onChangeSpeed: f, onChangeMusicTitle: p, onChangeMusicLyrics: m, onChangeMusicBpm: h, onChangeMusicDuration: g, onChangeAutoGenerateLyrics: _, onContinuousEditEnd: v }) {
	let y = i(), [b, x] = (0, G.useState)(!1), S = (0, G.useRef)(null);
	if ((0, G.useEffect)(() => {
		if (!b) return;
		let e = (e) => {
			S.current && !S.current.contains(e.target) && x(!1);
		};
		return document.addEventListener("mousedown", e, !0), () => document.removeEventListener("mousedown", e, !0);
	}, [b]), (0, G.useEffect)(() => {
		if (!b) return;
		let e = (e) => {
			e.key === "Escape" && x(!1);
		};
		return window.addEventListener("keydown", e), () => window.removeEventListener("keydown", e);
	}, [b]), !e) return null;
	let C = e === "speech" ? `${t} · ${n.toUpperCase()} · ${r}x` : `${c}s${s ? ` · ${s} BPM` : ""}`;
	return /* @__PURE__ */ (0, K.jsx)("div", {
		className: "ui-schema-renderer",
		"data-ui-schema-placement": "audioParams",
		ref: S,
		children: /* @__PURE__ */ (0, K.jsxs)("div", {
			className: "ui-schema-quality-ratio-pill",
			children: [/* @__PURE__ */ (0, K.jsxs)(L, {
				type: "button",
				className: "img-pill-btn ui-schema-menu-trigger",
				"aria-expanded": b,
				"data-tooltip": y(e === "speech" ? "语音参数" : "音乐参数"),
				onClick: (e) => {
					e.stopPropagation(), x((e) => !e);
				},
				children: [/* @__PURE__ */ (0, K.jsx)(U, {
					icon: e === "speech" ? "mdi:account-voice" : "mdi:music-note",
					width: 13
				}), /* @__PURE__ */ (0, K.jsx)("span", {
					className: "ui-schema-pill-label ui-schema-quality-ratio-label",
					children: C
				})]
			}), b ? /* @__PURE__ */ (0, K.jsx)("div", {
				className: "img-ratio-popup ui-schema-popup ui-schema-video-params-popup block",
				children: e === "speech" ? /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "rh-v5-meta-panel",
					children: [
						/* @__PURE__ */ (0, K.jsxs)("label", {
							className: "rh-vram-adv-row",
							children: [/* @__PURE__ */ (0, K.jsx)("span", {
								className: "rh-vram-adv-label",
								children: y("音色")
							}), /* @__PURE__ */ (0, K.jsx)("select", {
								className: "w-full rounded-md border border-canvas-border bg-canvas-bg px-2 py-1.5 text-xs text-canvas-text outline-none focus:border-orange-400",
								value: t,
								onChange: (e) => u?.(e.target.value),
								children: De.map((e) => /* @__PURE__ */ (0, K.jsx)("option", {
									value: e.value,
									children: e.label
								}, e.value))
							})]
						}),
						/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "img-rp-quality-area",
							children: [/* @__PURE__ */ (0, K.jsx)("div", {
								className: "img-rp-section-label",
								children: y("输出格式")
							}), /* @__PURE__ */ (0, K.jsx)("div", {
								className: "img-rp-quality-segmented rh-video-resolution-seg",
								children: Oe.map((e) => /* @__PURE__ */ (0, K.jsx)(L, {
									type: "button",
									className: `img-rp-quality-item rh-v5-res-btn ui-schema-option ${n === e ? "active" : ""}`,
									onClick: () => d?.(e),
									children: e.toUpperCase()
								}, e))
							})]
						}),
						/* @__PURE__ */ (0, K.jsxs)("label", {
							className: "rh-vram-adv-row",
							children: [/* @__PURE__ */ (0, K.jsx)("span", {
								className: "rh-vram-adv-label",
								children: y("语速 {speed}x", { speed: r })
							}), /* @__PURE__ */ (0, K.jsx)("input", {
								type: "range",
								className: "rh-duration-input",
								min: .25,
								max: 4,
								step: .05,
								value: r,
								onChange: (e) => f?.(Number(e.target.value)),
								onBlur: v
							})]
						})
					]
				}) : /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "rh-v5-meta-panel",
					children: [
						/* @__PURE__ */ (0, K.jsxs)("label", {
							className: "rh-vram-adv-row",
							children: [/* @__PURE__ */ (0, K.jsx)("span", {
								className: "rh-vram-adv-label",
								children: y("标题")
							}), /* @__PURE__ */ (0, K.jsx)("input", {
								className: "w-full rounded-md border border-canvas-border bg-canvas-bg px-2 py-1.5 text-xs text-canvas-text outline-none focus:border-orange-400",
								value: a,
								maxLength: 120,
								onChange: (e) => p?.(e.target.value),
								onBlur: v
							})]
						}),
						/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "grid grid-cols-2 gap-2",
							children: [/* @__PURE__ */ (0, K.jsxs)("label", {
								className: "rh-vram-adv-row",
								children: [/* @__PURE__ */ (0, K.jsx)("span", {
									className: "rh-vram-adv-label",
									children: "BPM"
								}), /* @__PURE__ */ (0, K.jsx)("input", {
									type: "number",
									className: "w-full rounded-md border border-canvas-border bg-canvas-bg px-2 py-1.5 text-xs text-canvas-text outline-none focus:border-orange-400",
									min: 1,
									value: s ?? "",
									onChange: (e) => {
										let t = e.target.value ? Number(e.target.value) : void 0;
										h?.(t);
									},
									onBlur: v
								})]
							}), /* @__PURE__ */ (0, K.jsxs)("label", {
								className: "rh-vram-adv-row",
								children: [/* @__PURE__ */ (0, K.jsx)("span", {
									className: "rh-vram-adv-label",
									children: y("时长 {duration}s", { duration: c })
								}), /* @__PURE__ */ (0, K.jsx)("input", {
									type: "range",
									className: "rh-duration-input",
									min: 1,
									max: 240,
									step: 1,
									value: c,
									onChange: (e) => g?.(Number(e.target.value)),
									onBlur: v
								})]
							})]
						}),
						/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "flex items-center justify-between gap-3",
							children: [/* @__PURE__ */ (0, K.jsx)("span", {
								className: "rh-vram-adv-label",
								children: y("自动生成歌词")
							}), /* @__PURE__ */ (0, K.jsxs)("label", {
								className: "rh-toggle-switch",
								"data-tooltip": y("先生成歌词，再继续生成音乐"),
								children: [/* @__PURE__ */ (0, K.jsx)("input", {
									type: "checkbox",
									checked: l,
									onChange: (e) => _?.(e.target.checked)
								}), /* @__PURE__ */ (0, K.jsx)("span", {
									className: "rh-toggle-track",
									children: /* @__PURE__ */ (0, K.jsx)("span", { className: "rh-toggle-knob" })
								})]
							})]
						}),
						l ? null : /* @__PURE__ */ (0, K.jsxs)("label", {
							className: "rh-vram-adv-row",
							children: [/* @__PURE__ */ (0, K.jsx)("span", {
								className: "rh-vram-adv-label",
								children: y("歌词")
							}), /* @__PURE__ */ (0, K.jsx)("textarea", {
								className: "min-h-24 w-full resize-y rounded-md border border-canvas-border bg-canvas-bg px-2 py-1.5 text-xs leading-5 text-canvas-text outline-none focus:border-orange-400",
								value: o,
								onChange: (e) => m?.(e.target.value),
								onBlur: v
							})]
						})
					]
				})
			}) : null]
		})
	});
}
var Ae = (0, G.memo)(ke), J = n(), je = "__skills__";
function Me({ nodeType: e, currentPrompt: t, anchorEl: n, userPresets: r, userSkills: i, onSelect: a, onRunAdvancedPreset: o, onSelectSkill: s, onUploadSkill: c, onManageSkills: l, onClose: u, onManagePresets: f }) {
	let p = (0, G.useMemo)(() => i.filter(d), [i]), [m, h] = (0, G.useState)(null), [g, _] = (0, G.useState)(null), [v, y] = (0, G.useState)({
		left: 0,
		top: 0,
		direction: "right"
	}), b = (0, G.useRef)(null), x = (0, G.useRef)(null), S = N(e), C = r.filter((t) => t.nodeType === e), w = (0, G.useCallback)((e) => {
		let t = e.target;
		b.current?.contains(t) || x.current?.contains(t) || u();
	}, [u]);
	(0, G.useEffect)(() => (document.addEventListener("mousedown", w, !0), () => document.removeEventListener("mousedown", w, !0)), [w]), (0, G.useEffect)(() => {
		let e = (e) => {
			e.key === "Escape" && u();
		};
		return document.addEventListener("keydown", e), () => document.removeEventListener("keydown", e);
	}, [u]);
	let T = (e, t = "slash-command-icon") => e.includes(":") ? /* @__PURE__ */ (0, K.jsx)(U, {
		icon: e,
		className: t,
		width: 18,
		height: 18
	}) : /* @__PURE__ */ (0, K.jsx)("span", {
		className: t,
		children: e
	}), E = S.length + C.length + 1 + 1 + +(S.length > 0) + (C.length > 0 ? 2 : 0) + 2, D = (0, G.useMemo)(() => {
		if (!n) return {
			left: 0,
			top: 0
		};
		let e = n.getBoundingClientRect(), t = Math.min(16 + E * 48 + 8, 400);
		return fe(e.left + e.width / 2 - 268 / 2, e.top - t - 8, 268, t);
	}, [n, E]), O = S.find((e) => e.id === m), k = m === je, A = (0, G.useCallback)((e) => {
		b.current && y(me(b.current.getBoundingClientRect(), 268, e * 48 + 16));
	}, []), j = (0, G.useCallback)((e) => {
		e.children && A(e.children.length);
	}, [A]), M = (0, G.useCallback)((e) => {
		if (e.promptTemplate) {
			let n = ue(e.promptTemplate, t), r = {};
			e.imageSize && (r.imageSize = e.imageSize), e.aspectRatio && (r.aspectRatio = e.aspectRatio), e.postProcess && (r.postProcess = e.postProcess), a(n, !0, Object.keys(r).length > 0 ? r : void 0), u();
		}
	}, [
		t,
		a,
		u
	]), P = (0, G.useCallback)((e) => {
		if (B(e)) o(e);
		else if (e.triggerMode === "direct") a(ue(e.promptTemplate, t), !0, e);
		else {
			let n = ue(e.promptTemplate, t);
			a(t ? `${t}\n${n}` : n, !1, e);
		}
		u();
	}, [
		t,
		a,
		o,
		u
	]), ee = (0, G.useCallback)((e) => {
		s(e), u();
	}, [s, u]), F = (0, G.useCallback)((e) => {
		e.children ? (h(e.id), _(e.id), j(e)) : h(null);
	}, [j]), I = (0, G.useCallback)(() => {
		h(je), _(je), A(p.length + 3);
	}, [p.length, A]);
	return (0, J.createPortal)(/* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [
		/* @__PURE__ */ (0, K.jsxs)("div", {
			ref: b,
			className: "slash-command-menu",
			style: D,
			children: [
				S.length > 0 && /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsx)("div", {
					className: "slash-command-header",
					children: "内置快捷指令"
				}), S.map((e) => /* @__PURE__ */ (0, K.jsxs)("div", {
					className: `slash-command-item${e.children ? " has-submenu" : " has-trigger"}${e.children && m === e.id ? " active" : ""}`,
					"data-item-id": e.id,
					onMouseEnter: () => F(e),
					onClick: () => {
						e.children ? (j(e), h(m === e.id ? null : e.id)) : M(e);
					},
					children: [
						T(e.icon),
						/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "slash-command-text",
							children: [/* @__PURE__ */ (0, K.jsxs)("span", {
								className: "slash-command-title",
								children: [e.title, e.children && /* @__PURE__ */ (0, K.jsx)("span", {
									className: "slash-command-arrow",
									children: "›"
								})]
							}), /* @__PURE__ */ (0, K.jsx)("span", {
								className: "slash-command-desc",
								children: e.description
							})]
						}),
						!e.children && /* @__PURE__ */ (0, K.jsx)("span", {
							className: "slash-command-badge",
							children: "直接触发"
						})
					]
				}, e.id))] }),
				C.length > 0 && /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [
					S.length > 0 && /* @__PURE__ */ (0, K.jsx)("div", { className: "slash-command-divider" }),
					/* @__PURE__ */ (0, K.jsx)("div", {
						className: "slash-command-header slash-command-header--user",
						children: "快捷指令"
					}),
					C.map((e) => /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "slash-command-item has-trigger slash-command-user-preset",
						onClick: () => P(e),
						children: [
							T(e.icon || "mdi:star"),
							/* @__PURE__ */ (0, K.jsxs)("div", {
								className: "slash-command-text",
								children: [/* @__PURE__ */ (0, K.jsx)("span", {
									className: "slash-command-title",
									children: e.name
								}), /* @__PURE__ */ (0, K.jsx)("span", {
									className: "slash-command-desc",
									children: e.description || "点击调用这个快捷指令"
								})]
							}),
							/* @__PURE__ */ (0, K.jsx)("span", {
								className: "slash-command-badge",
								children: B(e) ? "顺序执行" : e.triggerMode === "direct" ? "直接触发" : "加入提示词"
							})
						]
					}, e.id))
				] }),
				(S.length > 0 || C.length > 0) && /* @__PURE__ */ (0, K.jsx)("div", { className: "slash-command-divider" }),
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: `slash-command-item has-submenu${k ? " active" : ""}`,
					"data-item-id": je,
					onMouseEnter: I,
					onClick: () => {
						I(), h(k ? null : je);
					},
					children: [/* @__PURE__ */ (0, K.jsx)("span", {
						className: "slash-command-icon",
						children: "⚡"
					}), /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "slash-command-text",
						children: [/* @__PURE__ */ (0, K.jsxs)("span", {
							className: "slash-command-title",
							children: ["Skill", /* @__PURE__ */ (0, K.jsx)("span", {
								className: "slash-command-arrow",
								children: "›"
							})]
						}), /* @__PURE__ */ (0, K.jsx)("span", {
							className: "slash-command-desc",
							children: "调用或上传只读 Skill"
						})]
					})]
				}),
				/* @__PURE__ */ (0, K.jsx)("div", { className: "slash-command-divider" }),
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "slash-command-item slash-command-manage",
					onClick: () => {
						f(), u();
					},
					children: [/* @__PURE__ */ (0, K.jsx)("span", {
						className: "slash-command-icon",
						children: "⚙️"
					}), /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "slash-command-text",
						children: [/* @__PURE__ */ (0, K.jsx)("span", {
							className: "slash-command-title slash-command-manage-title",
							children: "管理快捷指令"
						}), /* @__PURE__ */ (0, K.jsx)("span", {
							className: "slash-command-desc",
							children: "创建和管理自定义提示词模板"
						})]
					})]
				})
			]
		}),
		O && /* @__PURE__ */ (0, K.jsx)("div", {
			ref: x,
			className: "slash-command-submenu",
			style: {
				left: v.left,
				top: v.top
			},
			children: O.children?.map((e) => /* @__PURE__ */ (0, K.jsxs)("div", {
				className: `slash-command-item has-trigger${g === e.id ? " active" : ""}`,
				"data-subitem-id": e.id,
				onClick: () => M(e),
				onMouseEnter: () => _(e.id),
				children: [
					T(e.icon),
					/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "slash-command-text",
						children: [/* @__PURE__ */ (0, K.jsx)("span", {
							className: "slash-command-title",
							children: e.title
						}), /* @__PURE__ */ (0, K.jsx)("span", {
							className: "slash-command-desc",
							children: e.description
						})]
					}),
					/* @__PURE__ */ (0, K.jsx)("span", {
						className: "slash-command-badge",
						children: "直接触发"
					})
				]
			}, e.id))
		}),
		k && /* @__PURE__ */ (0, K.jsxs)("div", {
			ref: x,
			className: "slash-command-submenu",
			style: {
				left: v.left,
				top: v.top
			},
			children: [
				p.map((e) => /* @__PURE__ */ (0, K.jsxs)("div", {
					className: `slash-command-item has-trigger${g === e.id ? " active" : ""}`,
					onClick: () => ee(e),
					onMouseEnter: () => _(e.id),
					children: [/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "slash-command-text",
						children: [/* @__PURE__ */ (0, K.jsx)("span", {
							className: "slash-command-title",
							children: e.name
						}), /* @__PURE__ */ (0, K.jsx)("span", {
							className: "slash-command-desc",
							children: e.description || e.fileName
						})]
					}), /* @__PURE__ */ (0, K.jsx)("span", {
						className: "slash-command-badge",
						children: "调用"
					})]
				}, e.id)),
				p.length > 0 && /* @__PURE__ */ (0, K.jsx)("div", { className: "slash-command-divider" }),
				/* @__PURE__ */ (0, K.jsx)("div", {
					className: "slash-command-item has-trigger",
					onClick: () => {
						l(), u();
					},
					onMouseEnter: () => _("manage-skills"),
					children: /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "slash-command-text",
						children: [/* @__PURE__ */ (0, K.jsx)("span", {
							className: "slash-command-title",
							children: "管理 Skill"
						}), /* @__PURE__ */ (0, K.jsx)("span", {
							className: "slash-command-desc",
							children: "查看内容和删除已上传 Skill"
						})]
					})
				}),
				/* @__PURE__ */ (0, K.jsx)("div", { className: "slash-command-divider" }),
				/* @__PURE__ */ (0, K.jsx)("div", {
					className: "slash-command-item has-trigger",
					onClick: async () => {
						u(), await c("folder");
					},
					onMouseEnter: () => _("upload-folder"),
					children: /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "slash-command-text",
						children: [/* @__PURE__ */ (0, K.jsx)("span", {
							className: "slash-command-title",
							children: "上传 Skill 文件夹"
						}), /* @__PURE__ */ (0, K.jsx)("span", {
							className: "slash-command-desc",
							children: "保存到应用 skill 目录后调用"
						})]
					})
				}),
				/* @__PURE__ */ (0, K.jsx)("div", {
					className: "slash-command-item has-trigger",
					onClick: async () => {
						u(), await c("file");
					},
					onMouseEnter: () => _("upload-file"),
					children: /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "slash-command-text",
						children: [/* @__PURE__ */ (0, K.jsx)("span", {
							className: "slash-command-title",
							children: "上传 Skill 文件"
						}), /* @__PURE__ */ (0, K.jsx)("span", {
							className: "slash-command-desc",
							children: "选择 .md / .txt / .json 文件"
						})]
					})
				})
			]
		})
	] }), document.body);
}
//#endregion
//#region src/components/nodes/shared/PresetAdvancedEditor.tsx
var Ne = {
	text: "单行文本",
	textarea: "多行文本",
	number: "数字",
	select: "单选",
	boolean: "开关"
};
function Pe(e, t, n) {
	if (n < 0 || n >= e.length || t === n) return e;
	let r = [...e], [i] = r.splice(t, 1);
	return r.splice(n, 0, i), r;
}
function Fe(e) {
	return {
		id: "parameter-" + h(),
		key: "param_" + (e + 1),
		label: "参数 " + (e + 1),
		type: "text",
		required: !1,
		defaultValue: ""
	};
}
function Y(e, t) {
	return {
		id: "step-" + h(),
		name: "步骤 " + (t + 1),
		nodeType: e,
		promptTemplate: "{{currentPrompt}}"
	};
}
function Ie({ parameter: e, onChange: t }) {
	if (e.type === "boolean") return /* @__PURE__ */ (0, K.jsxs)("label", {
		className: "preset-advanced-checkbox",
		children: [/* @__PURE__ */ (0, K.jsx)("input", {
			type: "checkbox",
			checked: !!e.defaultValue,
			onChange: (e) => t(e.target.checked)
		}), /* @__PURE__ */ (0, K.jsx)("span", { children: "默认开启" })]
	});
	if (e.type === "select") {
		let n = e.options ?? [];
		return /* @__PURE__ */ (0, K.jsxs)("select", {
			className: "preset-manager-input preset-advanced-compact-input",
			value: String(e.defaultValue ?? ""),
			onChange: (e) => t(e.target.value),
			children: [/* @__PURE__ */ (0, K.jsx)("option", {
				value: "",
				children: "无默认值"
			}), n.filter(Boolean).map((e) => /* @__PURE__ */ (0, K.jsx)("option", {
				value: e,
				children: e
			}, e))]
		});
	}
	return /* @__PURE__ */ (0, K.jsx)("input", {
		className: "preset-manager-input preset-advanced-compact-input",
		type: e.type === "number" ? "number" : "text",
		placeholder: "默认值",
		value: String(e.defaultValue ?? ""),
		onChange: (e) => t(e.target.value)
	});
}
function Le({ config: e, defaultNodeType: t, onChange: n }) {
	let r = g((e) => e.workflows), i = (0, G.useMemo)(() => oe(e), [e]), a = (0, G.useMemo)(() => M(e.parameters), [e.parameters]), o = (t, r) => {
		n({
			...e,
			parameters: e.parameters.map((e) => e.id === t ? {
				...e,
				...r
			} : e)
		});
	}, s = (t, r) => {
		n({
			...e,
			steps: e.steps.map((e) => e.id === t ? {
				...e,
				...r
			} : e)
		});
	}, c = (e, t) => {
		let n = e.promptTemplate && !/\s$/.test(e.promptTemplate) ? " " : "";
		s(e.id, { promptTemplate: e.promptTemplate + n + "{{" + t + "}}" });
	};
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "preset-advanced-editor",
		children: [
			i.length > 0 ? /* @__PURE__ */ (0, K.jsxs)("div", {
				className: "preset-advanced-errors",
				role: "status",
				children: [/* @__PURE__ */ (0, K.jsx)(U, {
					icon: "mdi:alert-circle-outline",
					width: 15,
					height: 15
				}), /* @__PURE__ */ (0, K.jsx)("ul", { children: i.map((e) => /* @__PURE__ */ (0, K.jsx)("li", { children: e }, e)) })]
			}) : null,
			/* @__PURE__ */ (0, K.jsxs)("section", {
				className: "preset-advanced-section",
				"aria-labelledby": "preset-parameters-title",
				children: [/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "preset-advanced-section-header",
					children: [/* @__PURE__ */ (0, K.jsxs)("div", { children: [/* @__PURE__ */ (0, K.jsx)("h3", {
						id: "preset-parameters-title",
						children: "运行参数"
					}), /* @__PURE__ */ (0, K.jsx)("p", { children: "调用指令时填写，变量可插入任意步骤的提示词模板。" })] }), /* @__PURE__ */ (0, K.jsxs)("button", {
						type: "button",
						className: "preset-advanced-add-button",
						onClick: () => n({
							...e,
							parameters: [...e.parameters, Fe(e.parameters.length)]
						}),
						children: [/* @__PURE__ */ (0, K.jsx)(U, {
							icon: "mdi:plus",
							width: 15,
							height: 15
						}), /* @__PURE__ */ (0, K.jsx)("span", { children: "添加参数" })]
					})]
				}), e.parameters.length === 0 ? /* @__PURE__ */ (0, K.jsx)("div", {
					className: "preset-advanced-empty",
					children: "没有运行参数，指令会直接显示执行确认。"
				}) : /* @__PURE__ */ (0, K.jsx)("div", {
					className: "preset-advanced-parameter-list",
					children: e.parameters.map((t, r) => /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "preset-advanced-parameter-row",
						children: [
							/* @__PURE__ */ (0, K.jsx)("span", {
								className: "preset-advanced-index",
								children: r + 1
							}),
							/* @__PURE__ */ (0, K.jsx)("input", {
								className: "preset-manager-input",
								value: t.label,
								"aria-label": "参数 " + (r + 1) + " 名称",
								placeholder: "显示名称",
								onChange: (e) => o(t.id, { label: e.target.value })
							}),
							/* @__PURE__ */ (0, K.jsxs)("div", {
								className: "preset-advanced-key-input",
								children: [
									/* @__PURE__ */ (0, K.jsx)("span", { children: "{{" }),
									/* @__PURE__ */ (0, K.jsx)("input", {
										value: t.key,
										"aria-label": "参数 " + (r + 1) + " 变量名",
										onChange: (e) => o(t.id, { key: e.target.value.trim() })
									}),
									/* @__PURE__ */ (0, K.jsx)("span", { children: "}}" })
								]
							}),
							/* @__PURE__ */ (0, K.jsx)("select", {
								className: "preset-manager-input",
								value: t.type,
								"aria-label": "参数 " + (r + 1) + " 类型",
								onChange: (e) => {
									let n = e.target.value;
									o(t.id, {
										type: n,
										defaultValue: n === "boolean" ? !1 : "",
										options: n === "select" ? ["选项 1", "选项 2"] : void 0
									});
								},
								children: Object.entries(Ne).map(([e, t]) => /* @__PURE__ */ (0, K.jsx)("option", {
									value: e,
									children: t
								}, e))
							}),
							t.type === "select" ? /* @__PURE__ */ (0, K.jsxs)("div", {
								className: "preset-advanced-select-config",
								children: [/* @__PURE__ */ (0, K.jsx)("input", {
									className: "preset-manager-input",
									value: (t.options ?? []).join("，"),
									"aria-label": "参数 " + (r + 1) + " 选项",
									placeholder: "选项 1，选项 2",
									onChange: (e) => o(t.id, { options: e.target.value.split(/[，,]/).map((e) => e.trim()) })
								}), /* @__PURE__ */ (0, K.jsx)(Ie, {
									parameter: t,
									onChange: (e) => o(t.id, { defaultValue: e })
								})]
							}) : /* @__PURE__ */ (0, K.jsx)(Ie, {
								parameter: t,
								onChange: (e) => o(t.id, { defaultValue: e })
							}),
							/* @__PURE__ */ (0, K.jsxs)("label", {
								className: "preset-advanced-required",
								children: [/* @__PURE__ */ (0, K.jsx)("input", {
									type: "checkbox",
									checked: t.required === !0,
									onChange: (e) => o(t.id, { required: e.target.checked })
								}), /* @__PURE__ */ (0, K.jsx)("span", { children: "必填" })]
							}),
							/* @__PURE__ */ (0, K.jsxs)("div", {
								className: "preset-advanced-row-actions",
								children: [
									/* @__PURE__ */ (0, K.jsx)("button", {
										type: "button",
										"aria-label": "上移参数",
										title: "上移",
										disabled: r === 0,
										onClick: () => n({
											...e,
											parameters: Pe(e.parameters, r, r - 1)
										}),
										children: /* @__PURE__ */ (0, K.jsx)(U, {
											icon: "mdi:chevron-up",
											width: 16,
											height: 16
										})
									}),
									/* @__PURE__ */ (0, K.jsx)("button", {
										type: "button",
										"aria-label": "下移参数",
										title: "下移",
										disabled: r === e.parameters.length - 1,
										onClick: () => n({
											...e,
											parameters: Pe(e.parameters, r, r + 1)
										}),
										children: /* @__PURE__ */ (0, K.jsx)(U, {
											icon: "mdi:chevron-down",
											width: 16,
											height: 16
										})
									}),
									/* @__PURE__ */ (0, K.jsx)("button", {
										type: "button",
										"aria-label": "删除参数",
										title: "删除",
										onClick: () => n({
											...e,
											parameters: e.parameters.filter((e) => e.id !== t.id)
										}),
										children: /* @__PURE__ */ (0, K.jsx)(U, {
											icon: "mdi:trash-can-outline",
											width: 15,
											height: 15
										})
									})
								]
							})
						]
					}, t.id))
				})]
			}),
			/* @__PURE__ */ (0, K.jsxs)("section", {
				className: "preset-advanced-section",
				"aria-labelledby": "preset-steps-title",
				children: [/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "preset-advanced-section-header",
					children: [/* @__PURE__ */ (0, K.jsxs)("div", { children: [/* @__PURE__ */ (0, K.jsx)("h3", {
						id: "preset-steps-title",
						children: "顺序步骤"
					}), /* @__PURE__ */ (0, K.jsx)("p", { children: "第一步引用当前节点，后续步骤自动引用前一步生成结果。" })] }), /* @__PURE__ */ (0, K.jsxs)("button", {
						type: "button",
						className: "preset-advanced-add-button",
						onClick: () => n({
							...e,
							steps: [...e.steps, Y(e.steps.at(-1)?.nodeType ?? t, e.steps.length)]
						}),
						children: [/* @__PURE__ */ (0, K.jsx)(U, {
							icon: "mdi:plus",
							width: 15,
							height: 15
						}), /* @__PURE__ */ (0, K.jsx)("span", { children: "添加步骤" })]
					})]
				}), e.steps.length === 0 ? /* @__PURE__ */ (0, K.jsx)("div", {
					className: "preset-advanced-empty",
					children: "添加至少一个生成步骤后才能保存高级指令。"
				}) : /* @__PURE__ */ (0, K.jsx)("div", {
					className: "preset-advanced-step-list",
					children: e.steps.map((t, i) => {
						let o = v(t.nodeType);
						return /* @__PURE__ */ (0, K.jsxs)("article", {
							className: "preset-advanced-step",
							children: [
								/* @__PURE__ */ (0, K.jsxs)("header", {
									className: "preset-advanced-step-header",
									children: [
										/* @__PURE__ */ (0, K.jsx)("span", {
											className: "preset-advanced-step-icon " + o.bg + " " + o.color,
											children: /* @__PURE__ */ (0, K.jsx)(U, {
												icon: o.icon,
												width: 16,
												height: 16
											})
										}),
										/* @__PURE__ */ (0, K.jsx)("span", {
											className: "preset-advanced-step-number",
											children: i + 1
										}),
										/* @__PURE__ */ (0, K.jsx)("input", {
											className: "preset-advanced-step-name",
											value: t.name,
											"aria-label": "步骤 " + (i + 1) + " 名称",
											placeholder: "步骤名称",
											onChange: (e) => s(t.id, { name: e.target.value })
										}),
										/* @__PURE__ */ (0, K.jsx)("select", {
											className: "preset-manager-input preset-advanced-step-type",
											value: t.nodeType,
											"aria-label": "步骤 " + (i + 1) + " 节点类型",
											onChange: (e) => s(t.id, {
												nodeType: e.target.value,
												model: void 0,
												provider: void 0,
												workflowId: void 0,
												imageSize: void 0,
												aspectRatio: void 0
											}),
											children: _.map((e) => /* @__PURE__ */ (0, K.jsx)("option", {
												value: e,
												children: b[e].replace("预设", "生成")
											}, e))
										}),
										/* @__PURE__ */ (0, K.jsxs)("div", {
											className: "preset-advanced-row-actions",
											children: [
												/* @__PURE__ */ (0, K.jsx)("button", {
													type: "button",
													"aria-label": "上移步骤",
													title: "上移",
													disabled: i === 0,
													onClick: () => n({
														...e,
														steps: Pe(e.steps, i, i - 1)
													}),
													children: /* @__PURE__ */ (0, K.jsx)(U, {
														icon: "mdi:chevron-up",
														width: 16,
														height: 16
													})
												}),
												/* @__PURE__ */ (0, K.jsx)("button", {
													type: "button",
													"aria-label": "下移步骤",
													title: "下移",
													disabled: i === e.steps.length - 1,
													onClick: () => n({
														...e,
														steps: Pe(e.steps, i, i + 1)
													}),
													children: /* @__PURE__ */ (0, K.jsx)(U, {
														icon: "mdi:chevron-down",
														width: 16,
														height: 16
													})
												}),
												/* @__PURE__ */ (0, K.jsx)("button", {
													type: "button",
													"aria-label": "删除步骤",
													title: "删除",
													onClick: () => n({
														...e,
														steps: e.steps.filter((e) => e.id !== t.id)
													}),
													children: /* @__PURE__ */ (0, K.jsx)(U, {
														icon: "mdi:trash-can-outline",
														width: 15,
														height: 15
													})
												})
											]
										})
									]
								}),
								/* @__PURE__ */ (0, K.jsxs)("div", {
									className: "preset-advanced-variable-bar",
									children: [
										/* @__PURE__ */ (0, K.jsx)("span", { children: "插入变量" }),
										/* @__PURE__ */ (0, K.jsx)("button", {
											type: "button",
											onClick: () => c(t, "currentPrompt"),
											children: "当前提示词"
										}),
										/* @__PURE__ */ (0, K.jsx)("button", {
											type: "button",
											onClick: () => c(t, R),
											children: i === 0 ? "触发节点" : "上一步结果"
										}),
										e.parameters.map((e) => /* @__PURE__ */ (0, K.jsx)("button", {
											type: "button",
											onClick: () => c(t, e.key),
											children: e.label || e.key
										}, e.id))
									]
								}),
								/* @__PURE__ */ (0, K.jsx)("textarea", {
									className: "preset-manager-input preset-advanced-step-template",
									value: t.promptTemplate,
									"aria-label": "步骤 " + (i + 1) + " 提示词模板",
									placeholder: "输入此步骤的提示词模板",
									onChange: (e) => s(t.id, { promptTemplate: e.target.value })
								}),
								/* @__PURE__ */ (0, K.jsxs)("div", {
									className: "preset-advanced-step-preview",
									children: [/* @__PURE__ */ (0, K.jsx)("span", { children: "预览" }), /* @__PURE__ */ (0, K.jsx)("p", { children: se(t.promptTemplate, a, "当前提示词", i === 0 ? "@触发节点" : "@上一步") })]
								}),
								/* @__PURE__ */ (0, K.jsxs)("div", {
									className: "preset-advanced-step-settings",
									children: [/* @__PURE__ */ (0, K.jsxs)("div", {
										className: "preset-advanced-setting",
										children: [
											/* @__PURE__ */ (0, K.jsx)("span", { children: "模型" }),
											/* @__PURE__ */ (0, K.jsx)(be, {
												nodeType: t.nodeType,
												selectedModel: t.model,
												selectedProvider: t.provider,
												selectedWorkflowId: t.workflowId,
												workflows: r,
												onSelect: (e) => s(t.id, {
													model: e.value,
													provider: e.provider,
													workflowId: void 0
												}),
												onWorkflowSelect: (e) => s(t.id, e ? {
													workflowId: e,
													provider: "comfyui",
													model: "comfyui/workflow"
												} : { workflowId: void 0 })
											}),
											t.model || t.workflowId ? /* @__PURE__ */ (0, K.jsx)("button", {
												type: "button",
												className: "preset-advanced-clear-button",
												onClick: () => s(t.id, {
													model: void 0,
													provider: void 0,
													workflowId: void 0
												}),
												children: "使用默认"
											}) : null
										]
									}), t.nodeType === "ai-image" ? /* @__PURE__ */ (0, K.jsxs)("div", {
										className: "preset-advanced-setting",
										children: [/* @__PURE__ */ (0, K.jsx)("span", { children: "尺寸" }), /* @__PURE__ */ (0, K.jsx)(de, {
											imageSize: t.imageSize,
											aspectRatio: t.aspectRatio,
											onChangeImageSize: (e) => s(t.id, { imageSize: e }),
											onChangeAspectRatio: (e) => s(t.id, { aspectRatio: e }),
											placement: "bottom",
											showImageSize: !0
										})]
									}) : null]
								})
							]
						}, t.id);
					})
				})]
			})
		]
	});
}
//#endregion
//#region src/components/nodes/shared/PresetManager.tsx
var Re = "​";
function X(e) {
	return {
		parameters: [],
		steps: [{
			id: "step-" + h(),
			name: "步骤 1",
			nodeType: e,
			promptTemplate: "{{currentPrompt}}"
		}]
	};
}
function ze(e) {
	let t = document.createElement("span");
	t.className = "preset-placeholder-pill", t.contentEditable = "false", t.setAttribute("data-preset-placeholder", "user-input"), t.textContent = e;
	let n = document.createElement("span");
	return n.appendChild(document.createTextNode(Re)), n.appendChild(t), n.appendChild(document.createTextNode(Re)), n;
}
function Be(e) {
	let t = "", n = (e) => {
		if (e.nodeType === Node.TEXT_NODE) t += (e.textContent || "").replace(new RegExp(Re, "g"), "");
		else if (e.nodeType === Node.ELEMENT_NODE) {
			let r = e;
			if (r.hasAttribute("data-preset-placeholder")) t += "{{ 文章内容 }}";
			else if (r.tagName === "BR") t += "\n";
			else for (let t of Array.from(e.childNodes)) n(t);
		}
	};
	for (let t of Array.from(e.childNodes)) n(t);
	return t.replace(/\n+$/, "");
}
function Ve(e, t) {
	e.innerHTML = "";
	let n = /\{\{ 文章内容 \}\}/g, r = 0, i;
	for (; (i = n.exec(t)) !== null;) i.index > r && e.appendChild(document.createTextNode(t.slice(r, i.index))), e.appendChild(ze("提示词")), r = n.lastIndex;
	r < t.length && t.slice(r).split("\n").forEach((t, n) => {
		n > 0 && e.appendChild(document.createElement("br")), t && e.appendChild(document.createTextNode(t));
	});
}
var He = {
	hidden: { opacity: 0 },
	visible: { opacity: 1 }
}, Ue = {
	hidden: {
		opacity: 0,
		scale: .95,
		y: 20
	},
	visible: {
		opacity: 1,
		scale: 1,
		y: 0,
		transition: {
			type: "spring",
			stiffness: 350,
			damping: 30
		}
	},
	exit: {
		opacity: 0,
		scale: .95,
		y: 20,
		transition: {
			duration: .15,
			ease: "easeIn"
		}
	}
};
function We() {
	let { userPresets: e, presetManagerOpen: t, setPresetManagerOpen: n, addUserPreset: r, updateUserPreset: i, deleteUserPreset: a, showToast: o } = g(le((e) => ({
		userPresets: e.userPresets,
		presetManagerOpen: e.presetManagerOpen,
		setPresetManagerOpen: e.setPresetManagerOpen,
		addUserPreset: e.addUserPreset,
		updateUserPreset: e.updateUserPreset,
		deleteUserPreset: e.deleteUserPreset,
		showToast: e.showToast
	}))), [s, c] = (0, G.useState)("ai-text"), [l, u] = (0, G.useState)(null), [d, f] = (0, G.useState)(""), [p, m] = (0, G.useState)(""), [v, y] = (0, G.useState)(""), [x, S] = (0, G.useState)("direct"), [C, w] = (0, G.useState)("basic"), [T, E] = (0, G.useState)(() => X("ai-text")), [D, O] = (0, G.useState)(), [k, M] = (0, G.useState)(""), [N, P] = (0, G.useState)(""), [ee, F] = (0, G.useState)(""), [I, R] = (0, G.useState)(""), [z, B] = (0, G.useState)(!1), [ne, V] = (0, G.useState)(!1), re = (0, G.useRef)(null), H = (0, G.useRef)(null), ie = s === "ai-image", ae = (0, G.useMemo)(() => e.filter((e) => e.nodeType === s), [s, e]), se = (0, G.useMemo)(() => C === "advanced" ? oe(T)[0] : void 0, [T, C]);
	(0, G.useEffect)(() => {
		t && queueMicrotask(() => {
			if (!l) {
				f(""), m(""), y(""), S("direct"), w("basic"), E(X(s)), O(void 0), M(""), P(""), F(""), R(""), B(!1), V(!1), H.current && (H.current.innerHTML = "");
				return;
			}
			let t = e.find((e) => e.id === l);
			t && (f(t.name), m(t.description), y(t.promptTemplate), S(t.triggerMode), w(t.mode === "advanced" ? "advanced" : "basic"), E(t.advanced ?? X(t.nodeType)), O(t.thumbnail), M(t.model || ""), P(t.provider || ""), F(t.imageSize || ""), R(t.aspectRatio || ""), B(!!t.model), V(!!t.imageSize || !!t.aspectRatio), H.current && Ve(H.current, t.promptTemplate));
		});
	}, [
		s,
		t,
		l,
		e
	]), (0, G.useEffect)(() => {
		let e = ae[0];
		queueMicrotask(() => u(e?.id ?? null));
	}, [s, ae]);
	let ce = (0, G.useCallback)(() => {
		let e = h();
		r({
			id: e,
			nodeType: s,
			name: "自定义快捷指令",
			description: "输入说明与提示词模板",
			promptTemplate: "",
			triggerMode: "direct",
			mode: "basic",
			advanced: X(s)
		}), u(e);
	}, [s, r]), ue = (0, G.useCallback)((t) => {
		a(t), l === t && u(e.filter((e) => e.id !== t && e.nodeType === s)[0]?.id ?? null), o("快捷指令已删除");
	}, [
		a,
		l,
		e,
		s,
		o
	]), U = (0, G.useCallback)(() => {
		if (!l || !d.trim()) return;
		if (C === "advanced") {
			let e = oe(T);
			if (e[0]) {
				o(e[0], "error");
				return;
			}
		}
		let e = C === "basic" && H.current ? Be(H.current) : v;
		i(l, {
			name: d.trim(),
			description: p.trim(),
			promptTemplate: e,
			triggerMode: x,
			thumbnail: D,
			model: z && k || void 0,
			provider: z && N || void 0,
			imageSize: ne && ee || void 0,
			aspectRatio: ne && I || void 0,
			mode: C,
			advanced: T
		}), o("快捷指令已保存");
	}, [
		l,
		d,
		p,
		v,
		x,
		D,
		k,
		N,
		ee,
		I,
		z,
		ne,
		C,
		T,
		i,
		o
	]), fe = (0, G.useCallback)((e) => {
		w(e), e === "basic" && requestAnimationFrame(() => {
			H.current && Ve(H.current, v);
		});
	}, [v]), pe = (0, G.useCallback)((e) => {
		let t = e.target.files?.[0];
		if (!t) return;
		let n = new FileReader();
		n.onload = () => {
			O(n.result);
		}, n.readAsDataURL(t);
	}, []), W = (0, G.useCallback)(() => {
		H.current && y(Be(H.current));
	}, []), me = (0, G.useCallback)(() => {
		if (!H.current) return;
		H.current.focus();
		let e = window.getSelection();
		if (!e || !e.rangeCount) return;
		let t = e.getRangeAt(0);
		t.deleteContents();
		let n = ze("提示词");
		t.insertNode(n), t.setStartAfter(n), t.collapse(!0), e.removeAllRanges(), e.addRange(t), W();
	}, [W]), he = (0, G.useCallback)((e) => {
		e.nativeEvent.isComposing || e.key === "Enter" && !e.shiftKey && (e.preventDefault(), W());
	}, [W]), ge = (0, G.useCallback)((e) => {
		M(e.value), P(e.provider), B(!0);
	}, []), _e = (0, G.useCallback)((e) => {
		F(e), V(!0);
	}, []), ve = (0, G.useCallback)((e) => {
		R(e), V(!0);
	}, []);
	return (0, J.createPortal)(/* @__PURE__ */ (0, K.jsx)(A, { children: t && /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsx)(j.div, {
		"data-tauri-drag-region": !0,
		className: "preset-modal-overlay",
		variants: He,
		initial: "hidden",
		animate: "visible",
		exit: "hidden",
		transition: { duration: .2 },
		onClick: () => n(!1)
	}), /* @__PURE__ */ (0, K.jsx)("div", {
		className: "preset-modal-wrapper",
		children: /* @__PURE__ */ (0, K.jsxs)(j.div, {
			className: "preset-modal preset-modal--manager",
			variants: Ue,
			initial: "hidden",
			animate: "visible",
			exit: "exit",
			onClick: (e) => e.stopPropagation(),
			children: [
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "preset-manager-title-row",
					children: [/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "preset-manager-title-group",
						children: [/* @__PURE__ */ (0, K.jsx)("div", {
							className: "preset-modal-title",
							children: "快捷指令"
						}), /* @__PURE__ */ (0, K.jsxs)("div", {
							className: "preset-modal-desc",
							children: [
								"管理 ",
								b[s].replace("预设", "快捷指令"),
								" 的提示词模板"
							]
						})]
					}), /* @__PURE__ */ (0, K.jsx)(te, { onClick: () => n(!1) })]
				}),
				/* @__PURE__ */ (0, K.jsx)("div", {
					className: "preset-manager-tabs",
					role: "tablist",
					children: _.map((e) => /* @__PURE__ */ (0, K.jsxs)(j.button, {
						type: "button",
						className: `preset-manager-tab${s === e ? " is-active" : ""}`,
						role: "tab",
						"aria-selected": s === e,
						onClick: () => c(e),
						whileHover: { scale: 1.04 },
						whileTap: { scale: .96 },
						children: [/* @__PURE__ */ (0, K.jsxs)("svg", {
							className: "preset-manager-tab-icon",
							width: "16",
							height: "16",
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							strokeWidth: "2",
							"aria-hidden": "true",
							children: [
								e === "ai-text" && /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [
									/* @__PURE__ */ (0, K.jsx)("polyline", { points: "4 7 4 4 20 4 20 7" }),
									/* @__PURE__ */ (0, K.jsx)("line", {
										x1: "9",
										y1: "20",
										x2: "15",
										y2: "20"
									}),
									/* @__PURE__ */ (0, K.jsx)("line", {
										x1: "12",
										y1: "4",
										x2: "12",
										y2: "20"
									})
								] }),
								e === "ai-image" && /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [
									/* @__PURE__ */ (0, K.jsx)("rect", {
										x: "3",
										y: "3",
										width: "18",
										height: "18",
										rx: "2"
									}),
									/* @__PURE__ */ (0, K.jsx)("circle", {
										cx: "8.5",
										cy: "8.5",
										r: "1.5"
									}),
									/* @__PURE__ */ (0, K.jsx)("polyline", { points: "21 15 16 10 5 21" })
								] }),
								e === "ai-video" && /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsx)("polygon", { points: "23 7 16 12 23 17 23 7" }), /* @__PURE__ */ (0, K.jsx)("rect", {
									x: "1",
									y: "5",
									width: "15",
									height: "14",
									rx: "2"
								})] }),
								e === "ai-audio" && /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [
									/* @__PURE__ */ (0, K.jsx)("path", { d: "M9 18V5l12-2v13" }),
									/* @__PURE__ */ (0, K.jsx)("circle", {
										cx: "6",
										cy: "18",
										r: "3"
									}),
									/* @__PURE__ */ (0, K.jsx)("circle", {
										cx: "18",
										cy: "16",
										r: "3"
									})
								] })
							]
						}), /* @__PURE__ */ (0, K.jsx)("span", { children: b[e] })]
					}, e))
				}),
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "preset-manager-shell",
					children: [/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "preset-manager-sidebar",
						children: [/* @__PURE__ */ (0, K.jsx)(L, {
							type: "button",
							className: "preset-manager-new-btn",
							onClick: ce,
							children: "新建"
						}), /* @__PURE__ */ (0, K.jsxs)("div", {
							className: "preset-manager-list",
							children: [ae.map((e) => /* @__PURE__ */ (0, K.jsxs)("div", {
								role: "button",
								tabIndex: 0,
								className: `preset-manager-list-item${l === e.id ? " is-active" : ""}`,
								onClick: () => u(e.id),
								onKeyDown: (t) => {
									t.key === "Enter" && u(e.id);
								},
								children: [
									/* @__PURE__ */ (0, K.jsxs)("label", {
										className: "preset-manager-list-thumb",
										"data-tooltip": "上传缩略图",
										"data-tooltip-source": "native-title",
										"data-native-title": "上传缩略图",
										onClick: (e) => e.stopPropagation(),
										children: [e.thumbnail ? /* @__PURE__ */ (0, K.jsx)("img", {
											className: "preset-manager-list-thumb-img",
											src: e.thumbnail,
											alt: ""
										}) : /* @__PURE__ */ (0, K.jsx)("span", {
											className: "preset-manager-list-thumb-plus",
											children: "+"
										}), /* @__PURE__ */ (0, K.jsx)("input", {
											className: "preset-manager-thumb-input",
											type: "file",
											accept: "image/*",
											onChange: (t) => {
												l === e.id ? pe(t) : (u(e.id), setTimeout(() => pe(t), 0));
											},
											ref: l === e.id ? re : void 0
										})]
									}),
									/* @__PURE__ */ (0, K.jsxs)("span", {
										className: "preset-manager-list-text",
										children: [/* @__PURE__ */ (0, K.jsx)("span", {
											className: "preset-manager-list-title",
											children: e.name
										}), /* @__PURE__ */ (0, K.jsx)("span", {
											className: "preset-manager-list-desc",
											children: e.description || "输入说明与提示词模板"
										})]
									}),
									/* @__PURE__ */ (0, K.jsx)(L, {
										type: "button",
										className: "preset-manager-list-delete",
										"aria-label": `删除 ${e.name}`,
										onClick: (t) => {
											t.stopPropagation(), ue(e.id);
										},
										children: "×"
									})
								]
							}, e.id)), ae.length === 0 && /* @__PURE__ */ (0, K.jsx)("div", {
								className: "preset-manager-list-empty",
								children: "暂无快捷指令，点击「新建」创建"
							})]
						})]
					}), /* @__PURE__ */ (0, K.jsx)("div", {
						className: "preset-manager-detail-pane",
						children: l ? /* @__PURE__ */ (0, K.jsxs)("div", {
							className: "preset-manager-detail",
							children: [
								/* @__PURE__ */ (0, K.jsxs)("label", {
									className: "preset-manager-field",
									children: [/* @__PURE__ */ (0, K.jsx)("span", {
										className: "preset-manager-label",
										children: "名字"
									}), /* @__PURE__ */ (0, K.jsx)("input", {
										className: "preset-manager-input",
										type: "text",
										placeholder: "快捷指令名称",
										value: d,
										onChange: (e) => f(e.target.value)
									})]
								}),
								/* @__PURE__ */ (0, K.jsxs)("label", {
									className: "preset-manager-field",
									children: [/* @__PURE__ */ (0, K.jsx)("span", {
										className: "preset-manager-label",
										children: "说明"
									}), /* @__PURE__ */ (0, K.jsx)("input", {
										className: "preset-manager-input",
										type: "text",
										placeholder: "说明这个快捷指令适合什么场景",
										value: p,
										onChange: (e) => m(e.target.value)
									})]
								}),
								/* @__PURE__ */ (0, K.jsxs)("div", {
									className: "preset-manager-mode-picker",
									children: [/* @__PURE__ */ (0, K.jsxs)("div", { children: [/* @__PURE__ */ (0, K.jsx)("span", {
										className: "preset-manager-label",
										children: "配置模式"
									}), /* @__PURE__ */ (0, K.jsx)("span", {
										className: "preset-manager-mode-help",
										children: C === "basic" ? "适合快速保存单次提示词操作" : "使用参数和步骤定义顺序生成链"
									})] }), /* @__PURE__ */ (0, K.jsxs)("div", {
										className: "preset-manager-mode-segment",
										role: "group",
										"aria-label": "配置模式",
										children: [/* @__PURE__ */ (0, K.jsx)("button", {
											type: "button",
											className: C === "basic" ? "is-active" : "",
											"aria-pressed": C === "basic",
											onClick: () => fe("basic"),
											children: "基础"
										}), /* @__PURE__ */ (0, K.jsx)("button", {
											type: "button",
											className: C === "advanced" ? "is-active" : "",
											"aria-pressed": C === "advanced",
											onClick: () => fe("advanced"),
											children: "高级"
										})]
									})]
								}),
								C === "basic" ? /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [
									/* @__PURE__ */ (0, K.jsxs)("div", {
										className: "preset-manager-template-tools",
										children: [/* @__PURE__ */ (0, K.jsx)("span", {
											className: "preset-manager-label",
											children: "提示词模板"
										}), /* @__PURE__ */ (0, K.jsx)(L, {
											type: "button",
											className: "preset-modal-btn-secondary preset-manager-insert-btn",
											onClick: me,
											children: "点击插入提示词栏内容"
										})]
									}),
									/* @__PURE__ */ (0, K.jsxs)("div", {
										className: "preset-manager-editor-wrap",
										children: [/* @__PURE__ */ (0, K.jsx)("div", {
											ref: H,
											className: "preset-manager-textarea preset-manager-editor",
											contentEditable: !0,
											suppressContentEditableWarning: !0,
											spellCheck: !1,
											onInput: W,
											onKeyDown: he
										}), !v && /* @__PURE__ */ (0, K.jsxs)("div", {
											className: "preset-manager-editor-placeholder",
											"aria-hidden": "true",
											children: [
												"例如：生成全身三视图，包含正视图、45度侧视图、后视图，背景简洁 人物参考",
												" ",
												/* @__PURE__ */ (0, K.jsx)("span", {
													className: "preset-placeholder-pill",
													contentEditable: !1,
													"data-preset-placeholder": "user-input",
													children: "提示词"
												})
											]
										})]
									}),
									/* @__PURE__ */ (0, K.jsxs)("div", {
										className: "preset-manager-section",
										children: [
											/* @__PURE__ */ (0, K.jsx)("span", {
												className: "preset-manager-section-title",
												children: "模型"
											}),
											/* @__PURE__ */ (0, K.jsx)("span", {
												className: "preset-manager-section-desc",
												children: z ? "已指定模型，生图时覆盖节点设置" : "未指定则使用节点当前模型"
											}),
											z ? /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsx)(be, {
												nodeType: s,
												selectedModel: k || void 0,
												selectedProvider: N || void 0,
												onSelect: ge
											}), /* @__PURE__ */ (0, K.jsx)("button", {
												type: "button",
												className: "preset-manager-section-toggle",
												onClick: () => {
													B(!1), M(""), P("");
												},
												children: "取消指定"
											})] }) : /* @__PURE__ */ (0, K.jsx)("button", {
												type: "button",
												className: "preset-manager-section-toggle",
												onClick: () => B(!0),
												children: "+ 指定模型"
											})
										]
									}),
									ie && /* @__PURE__ */ (0, K.jsxs)("div", {
										className: "preset-manager-section",
										children: [
											/* @__PURE__ */ (0, K.jsx)("span", {
												className: "preset-manager-section-title",
												children: "尺寸"
											}),
											/* @__PURE__ */ (0, K.jsx)("span", {
												className: "preset-manager-section-desc",
												children: ne ? "已指定尺寸，生图时覆盖节点设置" : "未指定则使用节点当前画质和比例"
											}),
											ne ? /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsx)(de, {
												imageSize: ee || void 0,
												aspectRatio: I || void 0,
												onChangeImageSize: _e,
												onChangeAspectRatio: ve,
												showImageSize: !0
											}), /* @__PURE__ */ (0, K.jsx)("button", {
												type: "button",
												className: "preset-manager-section-toggle",
												onClick: () => {
													V(!1), F(""), R("");
												},
												children: "取消指定"
											})] }) : /* @__PURE__ */ (0, K.jsx)("button", {
												type: "button",
												className: "preset-manager-section-toggle",
												onClick: () => V(!0),
												children: "+ 指定尺寸"
											})
										]
									})
								] }) : /* @__PURE__ */ (0, K.jsx)(Le, {
									config: T,
									defaultNodeType: s,
									onChange: E
								})
							]
						}) : /* @__PURE__ */ (0, K.jsx)("div", {
							className: "preset-manager-detail-empty",
							children: "选择一个快捷指令或新建一个"
						})
					})]
				}),
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "preset-modal-actions",
					children: [C === "basic" ? /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "preset-manager-trigger-modes",
						role: "group",
						"aria-label": "快捷指令触发方式",
						children: [
							/* @__PURE__ */ (0, K.jsx)("span", {
								className: "preset-manager-trigger-mode-label",
								children: "模式："
							}),
							/* @__PURE__ */ (0, K.jsx)(L, {
								type: "button",
								className: `preset-manager-trigger-mode${x === "direct" ? " is-active" : ""}`,
								"data-trigger-mode": "direct",
								"aria-pressed": x === "direct",
								onClick: () => S("direct"),
								children: "直接触发"
							}),
							/* @__PURE__ */ (0, K.jsx)(L, {
								type: "button",
								className: `preset-manager-trigger-mode${x === "insertPrompt" ? " is-active" : ""}`,
								"data-trigger-mode": "insertPrompt",
								"aria-pressed": x === "insertPrompt",
								onClick: () => S("insertPrompt"),
								children: "加入提示词"
							})
						]
					}) : /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "preset-manager-sequence-mode",
						children: [/* @__PURE__ */ (0, K.jsx)("span", {
							className: "preset-manager-sequence-dot",
							"aria-hidden": "true"
						}), /* @__PURE__ */ (0, K.jsx)("span", { children: "按步骤顺序自动执行，失败时停止" })]
					}), /* @__PURE__ */ (0, K.jsx)(L, {
						type: "button",
						className: "preset-modal-btn-primary",
						onClick: U,
						disabled: !!se,
						title: se,
						children: "保存"
					})]
				})
			]
		})
	})] }) }), document.body);
}
//#endregion
//#region src/components/nodes/shared/SkillManager.tsx
var Ge = {
	hidden: { opacity: 0 },
	visible: { opacity: 1 }
}, Ke = {
	hidden: {
		opacity: 0,
		scale: .95,
		y: 20
	},
	visible: {
		opacity: 1,
		scale: 1,
		y: 0,
		transition: {
			type: "spring",
			stiffness: 350,
			damping: 30
		}
	},
	exit: {
		opacity: 0,
		scale: .95,
		y: 20,
		transition: {
			duration: .15,
			ease: "easeIn"
		}
	}
};
function Z(e) {
	return e ? new Date(e).toLocaleString() : "-";
}
function qe({ open: e, onClose: t }) {
	let n = g((e) => e.userSkills), r = g((e) => e.deleteSkill), i = g((e) => e.showToast), [a, o] = (0, G.useState)(null), s = a ?? n[0]?.id ?? null, c = (0, G.useMemo)(() => n.find((e) => e.id === s) ?? n[0] ?? null, [s, n]), l = (0, G.useCallback)(async (e) => {
		let t = n.find((t) => t.id === e);
		await r(e), o(n.filter((t) => t.id !== e)[0]?.id ?? null), i(`已删除 Skill「${t?.name ?? "未命名 Skill"}」`);
	}, [
		r,
		i,
		n
	]);
	return (0, J.createPortal)(/* @__PURE__ */ (0, K.jsx)(A, { children: e && /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsx)(j.div, {
		"data-tauri-drag-region": !0,
		className: "preset-modal-overlay",
		variants: Ge,
		initial: "hidden",
		animate: "visible",
		exit: "hidden",
		transition: { duration: .2 },
		onClick: t
	}), /* @__PURE__ */ (0, K.jsx)("div", {
		className: "preset-modal-wrapper",
		children: /* @__PURE__ */ (0, K.jsxs)(j.div, {
			className: "preset-modal preset-modal--manager",
			variants: Ke,
			initial: "hidden",
			animate: "visible",
			exit: "exit",
			onClick: (e) => e.stopPropagation(),
			children: [/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "preset-manager-title-row",
				children: [/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "preset-manager-title-group",
					children: [/* @__PURE__ */ (0, K.jsx)("div", {
						className: "preset-modal-title",
						children: "Skill 管理"
					}), /* @__PURE__ */ (0, K.jsx)("div", {
						className: "preset-modal-desc",
						children: "查看已上传 Skill，删除不再使用的 Skill"
					})]
				}), /* @__PURE__ */ (0, K.jsx)(te, { onClick: t })]
			}), /* @__PURE__ */ (0, K.jsxs)("div", {
				className: "preset-manager-shell",
				children: [/* @__PURE__ */ (0, K.jsx)("div", {
					className: "preset-manager-sidebar",
					children: /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "preset-manager-list",
						children: [n.map((e) => /* @__PURE__ */ (0, K.jsxs)("div", {
							role: "button",
							tabIndex: 0,
							className: `preset-manager-list-item${c?.id === e.id ? " is-active" : ""}`,
							onClick: () => o(e.id),
							onKeyDown: (t) => {
								t.key === "Enter" && o(e.id);
							},
							children: [
								/* @__PURE__ */ (0, K.jsx)("span", {
									className: "preset-manager-list-thumb",
									children: /* @__PURE__ */ (0, K.jsx)("span", {
										className: "preset-manager-list-thumb-plus",
										children: "S"
									})
								}),
								/* @__PURE__ */ (0, K.jsxs)("span", {
									className: "preset-manager-list-text",
									children: [/* @__PURE__ */ (0, K.jsx)("span", {
										className: "preset-manager-list-title",
										children: e.name
									}), /* @__PURE__ */ (0, K.jsx)("span", {
										className: "preset-manager-list-desc",
										children: e.description || e.fileName
									})]
								}),
								/* @__PURE__ */ (0, K.jsx)(L, {
									type: "button",
									className: "preset-manager-list-delete",
									"aria-label": `删除 ${e.name}`,
									onClick: (t) => {
										t.stopPropagation(), l(e.id);
									},
									children: "×"
								})
							]
						}, e.id)), n.length === 0 && /* @__PURE__ */ (0, K.jsx)("div", {
							className: "preset-manager-list-empty",
							children: "暂无 Skill，请在 / 指令菜单上传"
						})]
					})
				}), /* @__PURE__ */ (0, K.jsx)("div", {
					className: "preset-manager-detail-pane",
					children: c ? /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "preset-manager-detail",
						children: [
							/* @__PURE__ */ (0, K.jsxs)("label", {
								className: "preset-manager-field",
								children: [/* @__PURE__ */ (0, K.jsx)("span", {
									className: "preset-manager-label",
									children: "名称"
								}), /* @__PURE__ */ (0, K.jsx)("input", {
									className: "preset-manager-input",
									type: "text",
									value: c.name,
									readOnly: !0
								})]
							}),
							/* @__PURE__ */ (0, K.jsxs)("label", {
								className: "preset-manager-field",
								children: [/* @__PURE__ */ (0, K.jsx)("span", {
									className: "preset-manager-label",
									children: "说明"
								}), /* @__PURE__ */ (0, K.jsx)("input", {
									className: "preset-manager-input",
									type: "text",
									value: c.description || "上传的只读 Skill",
									readOnly: !0
								})]
							}),
							/* @__PURE__ */ (0, K.jsxs)("label", {
								className: "preset-manager-field",
								children: [/* @__PURE__ */ (0, K.jsx)("span", {
									className: "preset-manager-label",
									children: "来源"
								}), /* @__PURE__ */ (0, K.jsx)("input", {
									className: "preset-manager-input",
									type: "text",
									value: c.sourceType === "folder" ? "文件夹" : "文件",
									readOnly: !0
								})]
							}),
							/* @__PURE__ */ (0, K.jsxs)("label", {
								className: "preset-manager-field",
								children: [/* @__PURE__ */ (0, K.jsx)("span", {
									className: "preset-manager-label",
									children: "入口文件"
								}), /* @__PURE__ */ (0, K.jsx)("input", {
									className: "preset-manager-input",
									type: "text",
									value: c.entryFileName || c.fileName,
									readOnly: !0
								})]
							}),
							/* @__PURE__ */ (0, K.jsxs)("label", {
								className: "preset-manager-field",
								children: [/* @__PURE__ */ (0, K.jsx)("span", {
									className: "preset-manager-label",
									children: "保存位置"
								}), /* @__PURE__ */ (0, K.jsx)("input", {
									className: "preset-manager-input",
									type: "text",
									value: c.storagePath || "-",
									readOnly: !0
								})]
							}),
							/* @__PURE__ */ (0, K.jsxs)("label", {
								className: "preset-manager-field",
								children: [/* @__PURE__ */ (0, K.jsx)("span", {
									className: "preset-manager-label",
									children: "上传时间"
								}), /* @__PURE__ */ (0, K.jsx)("input", {
									className: "preset-manager-input",
									type: "text",
									value: Z(c.createdAt),
									readOnly: !0
								})]
							}),
							/* @__PURE__ */ (0, K.jsxs)("label", {
								className: "preset-manager-field",
								children: [/* @__PURE__ */ (0, K.jsx)("span", {
									className: "preset-manager-label",
									children: "内容预览"
								}), /* @__PURE__ */ (0, K.jsx)("textarea", {
									className: "preset-manager-input",
									value: c.content,
									readOnly: !0,
									rows: 10
								})]
							})
						]
					}) : /* @__PURE__ */ (0, K.jsx)("div", {
						className: "preset-manager-detail-empty",
						children: "选择左侧 Skill 查看内容"
					})
				})]
			})]
		})
	})] }) }), document.body);
}
//#endregion
//#region src/components/nodes/shared/PromptPanel.tsx
var Je = (0, G.lazy)(() => import("./index.es-ZW4100s5.js").then((e) => ({ default: e.ThinkingOrb }))), Ye = {
	"1:1": "img-rp-sq",
	"9:16": "img-rp-tall",
	"16:9": "img-rp-wide",
	"3:4": "img-rp-p34",
	"4:3": "img-rp-l43",
	"3:2": "img-rp-l32",
	"2:3": "img-rp-p23",
	"21:9": "img-rp-ultra"
}, Xe = [
	"idle",
	"walk",
	"run",
	"jump",
	"attack",
	"hit"
], Ze = Array.from({ length: 7 }, (e, t) => t + 2), Qe = 450, $e = [
	{
		value: "15mm",
		label: "15mm 超广角"
	},
	{
		value: "24mm",
		label: "24mm 广角"
	},
	{
		value: "35mm",
		label: "35mm 电影感"
	},
	{
		value: "50mm",
		label: "50mm 标准"
	},
	{
		value: "85mm",
		label: "85mm 人像"
	},
	{
		value: "200mm",
		label: "200mm 长焦"
	},
	{
		value: "macro",
		label: "100mm 微距"
	},
	{
		value: "fisheye",
		label: "鱼眼"
	}
], et = [
	{
		value: "freeze",
		label: "凝固动作"
	},
	{
		value: "natural",
		label: "自然动态"
	},
	{
		value: "motion",
		label: "动态拖影"
	},
	{
		value: "light-trails",
		label: "光轨效果"
	}
], tt = [
	"f/1.4",
	"f/2",
	"f/2.8",
	"f/4",
	"f/5.6",
	"f/8",
	"f/11",
	"f/16"
], nt = [
	"1/2000s",
	"1/1000s",
	"1/500s",
	"1/250s",
	"1/125s",
	"1/60s",
	"1/30s",
	"1/8s",
	"1/2s",
	"1s",
	"5s"
];
function rt({ settings: e }) {
	let t = i(), n = e.lens, r = n === "macro", a = n === "15mm" ? .66 : n === "24mm" ? .76 : n === "35mm" ? .88 : n === "50mm" ? 1 : n === "85mm" ? 1.18 : n === "200mm" ? 1.38 : r ? 1.55 : .92, o = e.aperture ? Number(e.aperture.slice(2)) : 5.6, s = o <= 1.4 ? 8 : o <= 2 ? 6.5 : o <= 2.8 ? 5 : o <= 4 ? 3.2 : o <= 5.6 ? 1.5 : o <= 8 ? .7 : o <= 11 ? .25 : 0, c = o <= 1.4 ? 14 : o <= 2 ? 11 : o <= 2.8 ? 9 : o <= 4 ? 7 : o <= 5.6 ? 5 : 3, l = o <= 2.8 ? .72 : o <= 5.6 ? .58 : .42, u = e.exposureTime === "5s" ? 1.28 : e.exposureTime === "1s" ? 1.2 : e.exposureTime === "1/2s" ? 1.13 : e.exposureTime === "1/8s" ? 1.06 : e.exposureTime === "1/2000s" ? .68 : e.exposureTime === "1/1000s" ? .76 : e.exposureTime === "1/500s" ? .84 : 1, d = r ? [] : e.shutterEffect === "light-trails" ? [
		42,
		28,
		14
	] : e.shutterEffect === "motion" ? [24, 12] : [], f = n === "fisheye";
	return /* @__PURE__ */ (0, K.jsxs)("svg", {
		viewBox: "0 0 400 168",
		className: "h-full w-full",
		fill: "none",
		"aria-label": t("摄影参数综合成像预览"),
		role: "img",
		children: [/* @__PURE__ */ (0, K.jsxs)("defs", { children: [
			/* @__PURE__ */ (0, K.jsxs)("linearGradient", {
				id: "camera-preview-sky",
				x1: "0",
				y1: "0",
				x2: "0",
				y2: "1",
				children: [/* @__PURE__ */ (0, K.jsx)("stop", { stopColor: "#312e81" }), /* @__PURE__ */ (0, K.jsx)("stop", {
					offset: "1",
					stopColor: "#111827"
				})]
			}),
			/* @__PURE__ */ (0, K.jsxs)("linearGradient", {
				id: "camera-preview-ground",
				x1: "0",
				y1: "0",
				x2: "1",
				y2: "0",
				children: [
					/* @__PURE__ */ (0, K.jsx)("stop", { stopColor: "#111827" }),
					/* @__PURE__ */ (0, K.jsx)("stop", {
						offset: ".5",
						stopColor: "#312e81"
					}),
					/* @__PURE__ */ (0, K.jsx)("stop", {
						offset: "1",
						stopColor: "#111827"
					})
				]
			}),
			/* @__PURE__ */ (0, K.jsx)("filter", {
				id: "camera-preview-background-blur",
				children: /* @__PURE__ */ (0, K.jsx)("feGaussianBlur", { stdDeviation: r ? Math.max(6, s) : s })
			}),
			/* @__PURE__ */ (0, K.jsx)("clipPath", {
				id: "camera-preview-clip",
				children: /* @__PURE__ */ (0, K.jsx)("rect", {
					width: "400",
					height: "168",
					rx: "10"
				})
			})
		] }), /* @__PURE__ */ (0, K.jsxs)("g", {
			clipPath: "url(#camera-preview-clip)",
			children: [
				/* @__PURE__ */ (0, K.jsx)("rect", {
					width: "400",
					height: "168",
					fill: "url(#camera-preview-sky)"
				}),
				/* @__PURE__ */ (0, K.jsxs)("g", {
					filter: "url(#camera-preview-background-blur)",
					opacity: ".9",
					children: [
						/* @__PURE__ */ (0, K.jsx)("circle", {
							cx: "70",
							cy: "43",
							r: "19",
							fill: "#fbbf24",
							opacity: ".72"
						}),
						/* @__PURE__ */ (0, K.jsx)("path", {
							d: f ? "M-18 117Q200 52 418 117V174H-18Z" : "M-10 113 63 54l58 50 65-69 79 73 49-43 96 50v59H-10Z",
							fill: "#172554"
						}),
						/* @__PURE__ */ (0, K.jsx)("path", {
							d: f ? "M-20 135Q200 94 420 135V174H-20Z" : "M-10 130 88 90l67 36 78-48 82 48 95-30v78H-10Z",
							fill: "#1e1b4b"
						}),
						/* @__PURE__ */ (0, K.jsxs)("g", {
							stroke: "#818cf8",
							strokeWidth: "1",
							opacity: ".52",
							children: [/* @__PURE__ */ (0, K.jsx)("path", { d: "M22 126V88h34v38M74 126V99h28v27M292 126V84h38v42M345 126V96h31v30" }), /* @__PURE__ */ (0, K.jsx)("path", { d: "M29 96h8m7 0h7m30 11h14m204-14h8m8 0h8m29 11h17M29 108h8m7 0h7m248-3h8m8 0h8" })]
						}),
						/* @__PURE__ */ (0, K.jsx)("rect", {
							y: "130",
							width: "400",
							height: "38",
							fill: "url(#camera-preview-ground)"
						}),
						/* @__PURE__ */ (0, K.jsx)("path", {
							d: "M0 145h400M56 130l-25 38m313-38 25 38",
							stroke: "#6366f1",
							strokeWidth: "1",
							opacity: ".55"
						}),
						[
							34,
							98,
							302,
							360
						].map((e) => /* @__PURE__ */ (0, K.jsx)("circle", {
							cx: e,
							cy: "116",
							r: c,
							fill: "#fbbf24",
							opacity: l
						}, e))
					]
				}),
				(e.shutterEffect === "motion" || e.shutterEffect === "light-trails") && /* @__PURE__ */ (0, K.jsxs)("g", {
					strokeLinecap: "round",
					children: [
						/* @__PURE__ */ (0, K.jsx)("path", {
							d: "M18 119h126",
							stroke: "#22d3ee",
							strokeWidth: "3",
							opacity: ".5"
						}),
						/* @__PURE__ */ (0, K.jsx)("path", {
							d: "M258 106h124",
							stroke: "#f472b6",
							strokeWidth: "4",
							opacity: ".5"
						}),
						e.shutterEffect === "light-trails" && /* @__PURE__ */ (0, K.jsx)("path", {
							d: "M8 137c88-34 204 31 384-18",
							stroke: "#fde047",
							strokeWidth: "3",
							opacity: ".62"
						})
					]
				}),
				d.map((e, t) => /* @__PURE__ */ (0, K.jsxs)("g", {
					transform: `translate(${e} 0) translate(200 105) scale(${a}) translate(-200 -105)`,
					fill: "#a5b4fc",
					opacity: .08 + t * .05,
					children: [/* @__PURE__ */ (0, K.jsx)("circle", {
						cx: "200",
						cy: "70",
						r: "17"
					}), /* @__PURE__ */ (0, K.jsx)("path", { d: "M169 151c2-43 12-66 31-66s29 23 31 66h-62Z" })]
				}, e)),
				r ? /* @__PURE__ */ (0, K.jsxs)("g", {
					transform: "translate(200 101)",
					children: [
						[
							0,
							60,
							120,
							180,
							240,
							300
						].map((e) => /* @__PURE__ */ (0, K.jsx)("ellipse", {
							cx: "0",
							cy: "-27",
							rx: "18",
							ry: "35",
							fill: "#c4b5fd",
							opacity: ".9",
							transform: `rotate(${e})`
						}, e)),
						/* @__PURE__ */ (0, K.jsx)("circle", {
							r: "24",
							fill: "#fde047"
						}),
						/* @__PURE__ */ (0, K.jsx)("circle", {
							r: "10",
							fill: "#f59e0b"
						}),
						/* @__PURE__ */ (0, K.jsx)("path", {
							d: "M0 23c-4 31 5 43 18 61",
							stroke: "#4ade80",
							strokeWidth: "6",
							strokeLinecap: "round"
						}),
						/* @__PURE__ */ (0, K.jsx)("path", {
							d: "M9 54c18-13 31-10 38 0-17 8-29 8-38 0Z",
							fill: "#4ade80",
							opacity: ".85"
						})
					]
				}) : /* @__PURE__ */ (0, K.jsxs)("g", {
					transform: `translate(200 105) scale(${a}) translate(-200 -105)`,
					children: [
						/* @__PURE__ */ (0, K.jsx)("circle", {
							cx: "200",
							cy: "70",
							r: "17",
							fill: "#f8fafc"
						}),
						/* @__PURE__ */ (0, K.jsx)("path", {
							d: "M169 151c2-43 12-66 31-66s29 23 31 66h-62Z",
							fill: "#c7d2fe"
						}),
						/* @__PURE__ */ (0, K.jsx)("path", {
							d: "M181 105h38",
							stroke: "#818cf8",
							strokeWidth: "4",
							opacity: ".7"
						})
					]
				}),
				u < 1 && /* @__PURE__ */ (0, K.jsx)("rect", {
					width: "400",
					height: "168",
					fill: "#020617",
					opacity: 1 - u
				}),
				u > 1 && /* @__PURE__ */ (0, K.jsx)("rect", {
					width: "400",
					height: "168",
					fill: "#fff7ed",
					opacity: (u - 1) * .45
				}),
				f && /* @__PURE__ */ (0, K.jsx)("path", {
					d: "M2 35Q200 6 398 35M2 142Q200 162 398 142",
					stroke: "#fff",
					opacity: ".22"
				}),
				/* @__PURE__ */ (0, K.jsx)("path", {
					d: "M14 28V14h14M372 14h14v14M386 140v14h-14M28 154H14v-14",
					stroke: "#fff",
					opacity: ".45"
				})
			]
		})]
	});
}
function it({ value: e = {}, onChange: t }) {
	let n = i(), [r, a] = (0, G.useState)(!1), o = (0, G.useRef)(null), s = Object.values(e).filter(Boolean).length, c = (n, r) => {
		let i = {
			...e,
			[n]: r || void 0
		};
		t(Object.values(i).some(Boolean) ? i : void 0);
	};
	return (0, G.useEffect)(() => {
		if (!r) return;
		let e = (e) => {
			o.current?.contains(e.target) || a(!1);
		};
		return document.addEventListener("pointerdown", e, !0), () => document.removeEventListener("pointerdown", e, !0);
	}, [r]), /* @__PURE__ */ (0, K.jsxs)("div", {
		ref: o,
		className: "relative shrink-0",
		children: [/* @__PURE__ */ (0, K.jsx)("button", {
			type: "button",
			className: `prompt-btn${s > 0 ? " text-indigo-400 bg-indigo-500/10" : ""}`,
			"aria-label": s > 0 ? n("摄影参数：已设置 {count} 项", { count: s }) : n("选择摄影参数"),
			"aria-haspopup": "dialog",
			"aria-expanded": r,
			"data-tooltip": s > 0 ? n("摄影参数 · {count} 项", { count: s }) : n("摄影参数"),
			onClick: (e) => {
				e.stopPropagation(), a((e) => !e);
			},
			children: /* @__PURE__ */ (0, K.jsxs)("svg", {
				width: "17",
				height: "17",
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "1.8",
				"aria-hidden": "true",
				children: [
					/* @__PURE__ */ (0, K.jsx)("path", { d: "M4 8.5h3l1.4-2h7.2l1.4 2h3v9H4z" }),
					/* @__PURE__ */ (0, K.jsx)("circle", {
						cx: "12",
						cy: "13",
						r: "3.5"
					}),
					/* @__PURE__ */ (0, K.jsx)("path", {
						d: "M12 9.5 9.5 13l2.5 3.5 2.5-3.5z",
						opacity: ".6"
					})
				]
			})
		}), r && /* @__PURE__ */ (0, K.jsxs)("div", {
			role: "dialog",
			"aria-label": n("摄影参数"),
			className: "absolute bottom-10 left-1/2 z-50 w-[430px] -translate-x-1/2 rounded-xl border border-canvas-border bg-canvas-surface p-3 shadow-2xl",
			onPointerDown: (e) => e.stopPropagation(),
			children: [
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "mb-2 flex items-center justify-between px-0.5",
					children: [/* @__PURE__ */ (0, K.jsx)("span", {
						className: "text-xs font-semibold text-canvas-text",
						children: n("摄影参数")
					}), /* @__PURE__ */ (0, K.jsx)("button", {
						type: "button",
						className: "text-[10px] text-canvas-text-muted hover:text-canvas-text",
						onClick: () => t(void 0),
						children: n("全部自动")
					})]
				}),
				/* @__PURE__ */ (0, K.jsx)("div", {
					className: "h-[168px] overflow-hidden rounded-lg border border-canvas-border bg-canvas-bg text-canvas-text",
					children: /* @__PURE__ */ (0, K.jsx)(rt, { settings: e })
				}),
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "mt-2 grid grid-cols-2 gap-2",
					children: [
						/* @__PURE__ */ (0, K.jsxs)("label", {
							className: "min-w-0 text-[10px] text-canvas-text-muted",
							children: [/* @__PURE__ */ (0, K.jsx)("span", {
								className: "mb-1 block",
								children: n("焦距")
							}), /* @__PURE__ */ (0, K.jsxs)("select", {
								className: "h-8 w-full rounded-md border border-canvas-border bg-canvas-card px-2 text-[11px] text-canvas-text outline-none focus:border-indigo-400",
								value: e.lens ?? "",
								onChange: (e) => c("lens", e.target.value || void 0),
								children: [/* @__PURE__ */ (0, K.jsx)("option", {
									value: "",
									children: n("自动")
								}), $e.map((e) => /* @__PURE__ */ (0, K.jsx)("option", {
									value: e.value,
									children: n(e.label)
								}, e.value))]
							})]
						}),
						/* @__PURE__ */ (0, K.jsxs)("label", {
							className: "min-w-0 text-[10px] text-canvas-text-muted",
							children: [/* @__PURE__ */ (0, K.jsx)("span", {
								className: "mb-1 block",
								children: n("快门效果")
							}), /* @__PURE__ */ (0, K.jsxs)("select", {
								className: "h-8 w-full rounded-md border border-canvas-border bg-canvas-card px-2 text-[11px] text-canvas-text outline-none focus:border-indigo-400",
								value: e.shutterEffect ?? "",
								onChange: (e) => c("shutterEffect", e.target.value || void 0),
								children: [/* @__PURE__ */ (0, K.jsx)("option", {
									value: "",
									children: n("自动")
								}), et.map((e) => /* @__PURE__ */ (0, K.jsx)("option", {
									value: e.value,
									children: n(e.label)
								}, e.value))]
							})]
						}),
						/* @__PURE__ */ (0, K.jsxs)("label", {
							className: "min-w-0 text-[10px] text-canvas-text-muted",
							children: [/* @__PURE__ */ (0, K.jsx)("span", {
								className: "mb-1 block",
								children: n("光圈")
							}), /* @__PURE__ */ (0, K.jsxs)("select", {
								className: "h-8 w-full rounded-md border border-canvas-border bg-canvas-card px-2 text-[11px] text-canvas-text outline-none focus:border-indigo-400",
								value: e.aperture ?? "",
								onChange: (e) => c("aperture", e.target.value || void 0),
								children: [/* @__PURE__ */ (0, K.jsx)("option", {
									value: "",
									children: n("自动")
								}), tt.map((e) => /* @__PURE__ */ (0, K.jsx)("option", {
									value: e,
									children: e
								}, e))]
							})]
						}),
						/* @__PURE__ */ (0, K.jsxs)("label", {
							className: "min-w-0 text-[10px] text-canvas-text-muted",
							children: [/* @__PURE__ */ (0, K.jsx)("span", {
								className: "mb-1 block",
								children: n("曝光时间")
							}), /* @__PURE__ */ (0, K.jsxs)("select", {
								className: "h-8 w-full rounded-md border border-canvas-border bg-canvas-card px-2 text-[11px] text-canvas-text outline-none focus:border-indigo-400",
								value: e.exposureTime ?? "",
								onChange: (e) => c("exposureTime", e.target.value || void 0),
								children: [/* @__PURE__ */ (0, K.jsx)("option", {
									value: "",
									children: n("自动")
								}), nt.map((e) => /* @__PURE__ */ (0, K.jsx)("option", {
									value: e,
									children: e
								}, e))]
							})]
						})
					]
				}),
				/* @__PURE__ */ (0, K.jsx)("p", {
					className: "mt-2 px-0.5 text-[9px] text-canvas-text-muted",
					children: n("自动项不会写入提示词；预览仅用于表达景深、明暗、透视与动态趋势。")
				})
			]
		})]
	});
}
function at({ action: e }) {
	let t = {
		width: 20,
		height: 20,
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: 1.8,
		strokeLinecap: "round",
		strokeLinejoin: "round",
		"aria-hidden": !0
	};
	switch (e) {
		case "walk": return /* @__PURE__ */ (0, K.jsxs)("svg", {
			...t,
			children: [/* @__PURE__ */ (0, K.jsx)("circle", {
				cx: "13",
				cy: "4",
				r: "2"
			}), /* @__PURE__ */ (0, K.jsx)("path", { d: "m12.5 7-1 7m.5-5-4.5 3.5m4-3 4.5 2.5m-4.5 2L7 20m4.5-6 5 5" })]
		});
		case "run": return /* @__PURE__ */ (0, K.jsxs)("svg", {
			...t,
			children: [/* @__PURE__ */ (0, K.jsx)("circle", {
				cx: "14.5",
				cy: "4",
				r: "2"
			}), /* @__PURE__ */ (0, K.jsx)("path", { d: "m13.5 7-3 6m2-4-4.5-2m4 3 5 2m-6.5 1-5 3m5-3 5.5 6" })]
		});
		case "jump": return /* @__PURE__ */ (0, K.jsxs)("svg", {
			...t,
			children: [/* @__PURE__ */ (0, K.jsx)("circle", {
				cx: "12",
				cy: "4",
				r: "2"
			}), /* @__PURE__ */ (0, K.jsx)("path", { d: "M12 7v7m0-5L7 5m5 4 5-4m-5 9-4.5 4m4.5-4 4.5 4" })]
		});
		case "attack": return /* @__PURE__ */ (0, K.jsxs)("svg", {
			...t,
			children: [
				/* @__PURE__ */ (0, K.jsx)("circle", {
					cx: "9",
					cy: "4.5",
					r: "2"
				}),
				/* @__PURE__ */ (0, K.jsx)("path", { d: "m9.5 7 2 7m-1.5-5 7.5 1m-7-1.5L6 12m5.5 2-4.5 6m4.5-6 5 4" }),
				/* @__PURE__ */ (0, K.jsx)("path", { d: "m17.5 7.5 2.5 2.5-2.5 2.5" })
			]
		});
		case "hit": return /* @__PURE__ */ (0, K.jsxs)("svg", {
			...t,
			children: [
				/* @__PURE__ */ (0, K.jsx)("circle", {
					cx: "14.5",
					cy: "4.5",
					r: "2"
				}),
				/* @__PURE__ */ (0, K.jsx)("path", { d: "m13 7-2 7m1-5-5-1m5 2 5 3m-6 1-4 5m4-5 5 5" }),
				/* @__PURE__ */ (0, K.jsx)("path", { d: "m19 5 2-2m-1 5 3-1" })
			]
		});
		default: return /* @__PURE__ */ (0, K.jsxs)("svg", {
			...t,
			children: [/* @__PURE__ */ (0, K.jsx)("circle", {
				cx: "12",
				cy: "4",
				r: "2"
			}), /* @__PURE__ */ (0, K.jsx)("path", { d: "M12 7v7m0-5-4.5 2m4.5-2 4.5 2M12 14l-3.5 6m3.5-6 3.5 6" })]
		});
	}
}
function ot({ nodeType: e, nodeId: t, prompt: n = "", placeholder: r, selectedModel: a, selectedProvider: o, selectedWorkflowId: s, animationAction: c = "idle", onAnimationActionChange: u, animationFrames: d = 8, onAnimationFramesChange: f, canGenerate: p = !0, isGenerating: h = !1, onCancelGeneration: _, onChange: v, onContinuousEditEnd: y, onSubmit: b, onModelSelect: x, onWorkflowSelect: S, onDebug: C, onPassThrough: w, imageSize: T, aspectRatio: E, onChangeImageSize: D, onChangeAspectRatio: O, batchCount: k = 1, onChangeBatchCount: A, cameraSettings: j, onChangeCameraSettings: M, videoResolution: N, videoFps: P, videoFrames: ee, onChangeVideoResolution: F, onChangeVideoFps: I, seedanceResolution: L, seedanceRatio: te, seedanceDuration: R, generateAudio: z, videoReferences: B, onChangeVideoReferences: ne, onChangeSeedanceResolution: re, onChangeSeedanceRatio: ie, onChangeSeedanceDuration: ae, onChangeGenerateAudio: oe, audioPurpose: se, audioVoice: ce, audioFormat: le, audioSpeed: ue, musicTitle: U, musicLyrics: fe, musicBpm: W, musicDuration: me, autoGenerateLyrics: he, onChangeAudioVoice: ve, onChangeAudioFormat: ye, onChangeAudioSpeed: xe, onChangeMusicTitle: Se, onChangeMusicLyrics: Ce, onChangeMusicBpm: q, onChangeMusicDuration: we, onChangeAutoGenerateLyrics: Te, workflows: Ee = [], editorRef: De, selectedStyle: Oe, onStyleChange: ke }) {
	let J = i(), je = r ?? J("输入提示词开始创作   (Enter 生成，Shift+Enter 换行)"), [Ne, Pe] = (0, G.useState)(!1), [Fe, Y] = (0, G.useState)(!1), [Ie, Le] = (0, G.useState)(!1), [Re, X] = (0, G.useState)(null), ze = (0, G.useRef)(null), Be = (0, G.useRef)(null), Ve = (0, G.useRef)(null), He = (0, G.useRef)(null), Ue = (0, G.useRef)(!1), [Ge, Ke] = (0, G.useState)(!1), runtimeModels = g((e) => e.config.generalModels), selectedRuntimeModel = (() => {
		let e = String(a ?? "").replace(/^general\//, "");
		return runtimeModels?.find((t) => t.id === a || t.id === e || t.modelId === a || t.modelId === e || t.id?.replace(/^general\//, "") === e || t.modelId?.replace(/^general\//, "") === e);
	})(), creditCost = (() => {
		if (e !== "ai-image" && e !== "ai-video") return;
		let t = selectedRuntimeModel?.pricing;
		if (!t || typeof t !== "object" || Array.isArray(t)) return;
		let n = Number(t.baseCredits);
		if (!Number.isFinite(n) || n < 0) return;
		let r = n;
		if (e === "ai-video") {
			let e = selectedRuntimeModel?.defaultParams && typeof selectedRuntimeModel.defaultParams === "object" && !Array.isArray(selectedRuntimeModel.defaultParams) ? selectedRuntimeModel.defaultParams : {}, i = String(L ?? e.resolution ?? e.quality ?? te ?? e.aspectRatio ?? e.ratio ?? ""), o = t.resolutionCredits && typeof t.resolutionCredits === "object" && !Array.isArray(t.resolutionCredits) ? t.resolutionCredits : {}, s = Object.entries(o).find(([e]) => e.toLowerCase() === i.toLowerCase())?.[1], c = Number(s);
			Number.isFinite(c) && c >= 0 && (r = c);
			if (t.billingMode === "duration") {
				let t = Number(R ?? e.duration ?? e.durationSec);
				Number.isFinite(t) && t > 0 && (r *= t);
			}
		} else r *= Math.max(1, Number(k) || 1);
		return Number.isFinite(r) ? r > 0 && r < 1 ? 1 : Math.round(r) : void 0;
	})(), Z = e === "ai-image" ? (() => {
		let t = String(a ?? "").replace(/^general\//, ""), n = runtimeModels?.find((e) => e.id === a || e.id === t || e.modelId === a || e.modelId === t || e.id?.replace(/^general\//, "") === t || e.modelId?.replace(/^general\//, "") === t);
		if (!n) return;
		let r = n.parameterSchema && typeof n.parameterSchema === "object" && !Array.isArray(n.parameterSchema) ? n.parameterSchema : {}, i = (e) => Array.isArray(r?.[e]?.options) ? r[e].options.map((e) => String(e).trim()).filter(Boolean) : [], o = Object.prototype.hasOwnProperty.call(r, "quality") ? i("quality") : Object.prototype.hasOwnProperty.call(r, "resolution") ? i("resolution") : Array.isArray(n.supportedQuality) && n.supportedQuality.length ? n.supportedQuality : n.supportedResolutions ?? [], s = Object.prototype.hasOwnProperty.call(r, "aspectRatio") ? i("aspectRatio") : Object.prototype.hasOwnProperty.call(r, "ratio") ? i("ratio") : Array.isArray(n.supportedRatios) ? n.supportedRatios : [], c = n.defaultParams && typeof n.defaultParams === "object" && !Array.isArray(n.defaultParams) ? n.defaultParams : {};
		return o.length || s.length ? { resolutions: o, ratios: s, defaultResolution: String(c.quality ?? c.resolution ?? o.find((e) => /^2k$/i.test(e)) ?? o[0] ?? ""), defaultRatio: String(c.aspectRatio ?? c.ratio ?? s[0] ?? "") } : void 0;
	})() : void 0;
	(0, G.useEffect)(() => {
		if (!Z) return;
		let e = T?.toLowerCase();
		if (!Z.resolutions.some((t) => t.toLowerCase() === e)) {
			let e = Z.resolutions.find((e) => e.toLowerCase() === String(Z.defaultResolution ?? "").toLowerCase()) ?? Z.resolutions[0];
			D?.(e);
		}
		E && Z.ratios?.length && !Z.ratios.includes(E) && O?.(Z.defaultRatio || Z.ratios[0]);
	}, [
		E,
		Z,
		T,
		O,
		D
	]);
	let $e = g((e) => e.config.performanceMode === !0), et = g((e) => e.userPresets), tt = g((e) => e.userSkills), nt = g((e) => e.uploadSkill), rt = g((e) => e.setPresetManagerOpen), ot = g((e) => e.setPresetRunRequest), st = g((e) => e.showToast), ct = g((e) => e.pendingPresetAction), lt = g((e) => e.setPendingPresetAction), ut = (0, G.useCallback)((e, t) => {
		b(m(e ?? n, tt), t);
	}, [
		b,
		n,
		tt
	]), dt = (0, G.useCallback)((e, t) => {
		A?.(1), Ke(!1), ut(e, t);
	}, [ut, A]), Q = (0, G.useCallback)(() => {
		He.current &&= (clearTimeout(He.current), null);
	}, []), $ = e === "ai-image" && !!A && o !== "dreamina" && !s, ft = (0, G.useCallback)((e) => {
		!$ || e.button !== 0 || !p || !n.trim() || (Ue.current = !1, Q(), He.current = setTimeout(() => {
			Ue.current = !0, Ke(!0), He.current = null;
		}, Qe));
	}, [
		$,
		p,
		Q,
		n
	]), pt = (0, G.useCallback)((e) => {
		if (e.stopPropagation(), Q(), Ue.current) {
			Ue.current = !1;
			return;
		}
		p && n.trim() && dt();
	}, [
		p,
		Q,
		dt,
		n
	]), mt = (0, G.useCallback)((e) => (t) => {
		t.stopPropagation(), A?.(e), Ke(!1), ut();
	}, [ut, A]);
	(0, G.useEffect)(() => Q, [Q]), (0, G.useEffect)(() => {
		if (!Ge) return;
		let e = (e) => {
			Ve.current?.contains(e.target) || Ke(!1);
		};
		return document.addEventListener("pointerdown", e, !0), () => document.removeEventListener("pointerdown", e, !0);
	}, [Ge]);
	let ht = (0, G.useCallback)((e, t, n) => {
		Y(!1), n && (n.model && n.provider && x({
			value: n.model,
			provider: n.provider,
			label: n.model,
			nodeTypes: []
		}), n.imageSize && D && D(n.imageSize), n.aspectRatio && O && O(n.aspectRatio)), t ? dt(e, n?.postProcess) : (v(e), y?.());
	}, [
		dt,
		v,
		y,
		x,
		D,
		O
	]);
	(0, G.useEffect)(() => {
		if (!ct || ct.nodeId !== t) return;
		let { filledPrompt: e, shouldTrigger: n, override: r, postProcess: i } = ct;
		lt(null);
		let a = requestAnimationFrame(() => {
			ht(e, n, r ? {
				model: r.model,
				provider: r.provider,
				imageSize: r.imageSize,
				aspectRatio: r.aspectRatio,
				postProcess: i
			} : { postProcess: i });
		});
		return () => cancelAnimationFrame(a);
	}, [
		ct,
		t,
		ht,
		lt
	]);
	let gt = (0, G.useCallback)(() => {
		X(Be.current), Y(!0);
	}, []), _t = (0, G.useCallback)((e) => {
		e.stopPropagation(), X(ze.current), Y((e) => !e);
	}, []), vt = (0, G.useCallback)(() => {
		rt(!0);
	}, [rt]), yt = (0, G.useCallback)((e) => {
		if (!t) {
			st(J("高级快捷指令需要从画布节点中运行"), "error");
			return;
		}
		ot({
			presetId: e.id,
			sourceNodeId: t
		});
	}, [
		t,
		ot,
		st,
		J
	]), bt = (0, G.useCallback)(() => {
		Le(!0);
	}, []), xt = (0, G.useCallback)((e) => {
		Y(!1);
		let t = `@skill{${e.id}|${encodeURIComponent(e.name)}}`;
		v(`${n}${n && !/\s$/.test(n) ? " " : ""}${t}`), y?.();
	}, [
		v,
		y,
		n
	]), St = (0, G.useCallback)(async (e) => {
		Y(!1);
		try {
			await nt(e);
		} catch (e) {
			st(e instanceof Error ? e.message : J("上传 Skill 失败"), "error");
		}
	}, [
		st,
		nt,
		J
	]);
	return /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [
		/* @__PURE__ */ (0, K.jsxs)("div", {
			className: `prompt-panel ${Ne ? "focused" : ""}`,
			children: [/* @__PURE__ */ (0, K.jsx)("div", {
				className: "prompt-input-wrap",
				ref: Be,
				children: /* @__PURE__ */ (0, K.jsx)(_e, {
					ref: De,
					value: n,
					onChange: v,
					onSubmit: dt,
					placeholder: je,
					nodeId: t,
					selectedWorkflowId: s,
					canSubmit: p,
					onFocus: () => Pe(!0),
					onBlur: () => {
						Pe(!1), queueMicrotask(() => y?.());
					},
					onSlashTrigger: gt
				})
			}), /* @__PURE__ */ (0, K.jsxs)("div", {
				className: "prompt-footer",
				children: [
					/* @__PURE__ */ (0, K.jsx)(be, {
						nodeType: e,
						selectedModel: a,
						selectedProvider: o,
						selectedWorkflowId: s,
						onSelect: x,
						onWorkflowSelect: S,
						workflows: Ee
					}),
					e === "ai-animation" && u && /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsx)("div", {
						className: "animation-action-picker",
						role: "group",
						"aria-label": J("动画动作"),
						children: Xe.map((e) => /* @__PURE__ */ (0, K.jsx)("button", {
							type: "button",
							className: `animation-pose-btn${c === e ? " active" : ""}`,
							"data-tooltip": J(l[e]),
							"aria-label": J(l[e]),
							"aria-pressed": c === e,
							onClick: (t) => {
								t.stopPropagation(), u(e);
							},
							children: /* @__PURE__ */ (0, K.jsx)(at, { action: e })
						}, e))
					}), /* @__PURE__ */ (0, K.jsx)("select", {
						className: "animation-frames-select",
						value: d,
						"aria-label": J("生成帧数"),
						onChange: (e) => {
							e.stopPropagation(), f?.(Number(e.target.value));
						},
						children: [
							6,
							8,
							10,
							12,
							16,
							20
						].map((e) => /* @__PURE__ */ (0, K.jsx)("option", {
							value: e,
							children: J("{count} 帧", { count: e })
						}, e))
					})] }),
					(e === "ai-image" || e === "ai-panorama" || e === "ai-video") && /* @__PURE__ */ (0, K.jsx)(pe, {
						nodeType: e,
						selectedStyle: Oe,
						onChange: ke
					}),
					(e === "ai-image" || e === "ai-video") && M && /* @__PURE__ */ (0, K.jsx)(it, {
						value: j,
						onChange: M
					}),
					e === "ai-image" && Z && (Z.resolutions?.length || Z.ratios?.length) > 0 && /* @__PURE__ */ (0, K.jsx)(de, {
						imageSize: T,
						aspectRatio: E,
						onChangeImageSize: D || (() => {}),
						onChangeAspectRatio: O || (() => {}),
						imageSizes: Z.resolutions,
						showImageSize: Z.resolutions?.length > 0,
						showAspectRatio: Z.ratios?.length > 0,
						showAdaptive: !Z,
						ratios: Z ? Z.ratios.map((e) => ({
							value: e,
							className: Ye[e]
						})) : void 0
					}),
					e === "ai-panorama" && /* @__PURE__ */ (0, K.jsx)(de, {
						imageSize: T,
						aspectRatio: E,
						onChangeImageSize: D || (() => {}),
						onChangeAspectRatio: O || (() => {}),
						showAdaptive: !1,
						ratios: [{
							value: "2:1",
							className: "img-rp-pano"
						}, {
							value: "21:9",
							className: "img-rp-ultra"
						}]
					}),
					e === "ai-video" && /* @__PURE__ */ (0, K.jsx)(ge, {
						provider: o,
						selectedModel: a,
						nodeId: t,
						videoReferences: B,
						onChangeVideoReferences: ne,
						videoResolution: N,
						videoFps: P,
						videoFrames: ee,
						onChangeResolution: F || (() => {}),
						onChangeFps: I || (() => {}),
						seedanceResolution: L,
						seedanceRatio: te,
						seedanceDuration: R,
						generateAudio: z,
						onChangeSeedanceResolution: re,
						onChangeSeedanceRatio: ie,
						onChangeSeedanceDuration: ae,
						onChangeGenerateAudio: oe,
						onContinuousEditEnd: y
					}),
					e === "ai-audio" && /* @__PURE__ */ (0, K.jsx)(Ae, {
						purpose: se,
						voice: ce,
						format: le,
						speed: ue,
						musicTitle: U,
						musicLyrics: fe,
						musicBpm: W,
						musicDuration: me,
						autoGenerateLyrics: he,
						onChangeVoice: ve,
						onChangeFormat: ye,
						onChangeSpeed: xe,
						onChangeMusicTitle: Se,
						onChangeMusicLyrics: Ce,
						onChangeMusicBpm: q,
						onChangeMusicDuration: we,
						onChangeAutoGenerateLyrics: Te,
						onContinuousEditEnd: y
					}),
					/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "prompt-actions",
						children: [
							(e === "ai-image" || e === "ai-text") && /* @__PURE__ */ (0, K.jsx)("button", {
								ref: ze,
								type: "button",
								className: `prompt-btn prompt-slash-btn${Fe ? " slash-active" : ""}`,
								"data-tooltip": J("预设提示词"),
								onClick: _t,
								children: "/"
							}),
							C && /* @__PURE__ */ (0, K.jsx)("button", {
								type: "button",
								className: "prompt-btn prompt-debug-btn",
								"data-tooltip": J("调试 API 参数"),
								onClick: (e) => {
									e.stopPropagation(), C();
								},
								children: /* @__PURE__ */ (0, K.jsx)("svg", {
									width: "14",
									height: "14",
									viewBox: "0 0 24 24",
									fill: "none",
									stroke: "currentColor",
									strokeWidth: "2",
									children: /* @__PURE__ */ (0, K.jsx)("path", { d: "M14.7 6.3a1 1 0 0 0 0 1.4l1.6 1.6a1 1 0 0 0 1.4 0l3.77-3.77a6 6 0 0 1-7.94 7.94l-6.91 6.91a2.12 2.12 0 0 1-3-3l6.91-6.91a6 6 0 0 1 7.94-7.94l-3.76 3.76z" })
								})
							}),
							w && /* @__PURE__ */ (0, K.jsx)("button", {
								type: "button",
								className: `prompt-btn prompt-pass-through-btn ${n.trim() ? "" : "disabled"}`,
								disabled: !p || !n.trim(),
								"data-tooltip": J("直接输出（跳过模型调用）"),
								onClick: (e) => {
									e.stopPropagation(), n.trim() && w();
								},
								children: /* @__PURE__ */ (0, K.jsxs)("svg", {
									width: "14",
									height: "14",
									viewBox: "0 0 24 24",
									fill: "none",
									stroke: "currentColor",
									strokeWidth: "2",
									children: [/* @__PURE__ */ (0, K.jsx)("line", {
										x1: "12",
										y1: "19",
										x2: "12",
										y2: "5"
									}), /* @__PURE__ */ (0, K.jsx)("polyline", { points: "5 12 12 5 19 12" })]
								})
							}),
							Number.isFinite(creditCost) && /* @__PURE__ */ (0, K.jsx)("span", {
								className: "prompt-credit-cost",
								title: J("按当前模型与参数预计消耗，不含 Skill 额外费用"),
								children: J("预计 {credits} 积分", { credits: Number.isInteger(creditCost) ? creditCost : creditCost.toFixed(2) })
							}),
							h && _ ? /* @__PURE__ */ (0, K.jsx)("div", {
								className: "prompt-submit-wrap",
								children: /* @__PURE__ */ (0, K.jsxs)("button", {
									type: "button",
									className: "prompt-btn prompt-stop-btn",
									"data-tooltip": J("终止 ComfyUI 任务"),
									"aria-label": J("终止 ComfyUI 任务"),
									onClick: (e) => {
										e.stopPropagation(), _();
									},
									children: [!$e && /* @__PURE__ */ (0, K.jsx)("span", {
										className: "prompt-stop-orb",
										"aria-hidden": "true",
										children: /* @__PURE__ */ (0, K.jsx)(G.Suspense, {
											fallback: null,
											children: /* @__PURE__ */ (0, K.jsx)(Je, {
												state: "composing",
												size: 20
											})
										})
									}), /* @__PURE__ */ (0, K.jsx)("svg", {
										className: "prompt-stop-icon",
										width: "12",
										height: "12",
										viewBox: "0 0 24 24",
										fill: "currentColor",
										"aria-hidden": "true",
										children: /* @__PURE__ */ (0, K.jsx)("rect", {
											x: "5",
											y: "5",
											width: "14",
											height: "14",
											rx: "2"
										})
									})]
								})
							}) : /* @__PURE__ */ (0, K.jsxs)("div", {
								ref: Ve,
								className: `prompt-submit-wrap${Ge ? " batch-open" : ""}`,
								children: [/* @__PURE__ */ (0, K.jsx)("button", {
									type: "button",
									className: `prompt-btn prompt-submit-btn${h ? " is-generating" : ""} ${!p || !n.trim() ? "disabled" : ""}`,
									disabled: !p || !n.trim(),
									"aria-haspopup": $ ? "menu" : void 0,
									"aria-expanded": $ ? Ge : void 0,
									"data-tooltip": J(h ? "生成中" : $ ? "点击生成 1 张，长按选择数量" : "调用模型生成"),
									onPointerDown: ft,
									onPointerUp: Q,
									onPointerCancel: Q,
									onPointerLeave: Q,
									onContextMenu: (e) => {
										$ && e.preventDefault();
									},
									onClick: pt,
									children: h && !$e ? /* @__PURE__ */ (0, K.jsx)(G.Suspense, {
										fallback: null,
										children: /* @__PURE__ */ (0, K.jsx)(Je, {
											state: "composing",
											size: 20,
											"aria-label": J("生成中")
										})
									}) : /* @__PURE__ */ (0, K.jsxs)("svg", {
										width: "14",
										height: "14",
										viewBox: "0 0 24 24",
										fill: "none",
										stroke: "currentColor",
										strokeWidth: "2",
										children: [/* @__PURE__ */ (0, K.jsx)("line", {
											x1: "5",
											y1: "12",
											x2: "19",
											y2: "12"
										}), /* @__PURE__ */ (0, K.jsx)("polyline", { points: "12 5 19 12 12 19" })]
									})
								}), $ && /* @__PURE__ */ (0, K.jsx)("div", {
									className: "image-batch-clip",
									children: /* @__PURE__ */ (0, K.jsx)("div", {
										className: "image-batch-menu",
										role: "menu",
										"aria-label": J("选择批量生成数量"),
										"aria-hidden": !Ge,
										children: Ze.map((e) => /* @__PURE__ */ (0, K.jsx)("button", {
											type: "button",
											role: "menuitem",
											tabIndex: Ge ? 0 : -1,
											className: `image-batch-menu-item${k === e ? " active" : ""}`,
											"aria-label": J("生成 {count} 张图片", { count: e }),
											title: J(e >= 4 ? "生成 {count} 张，费用可能按张计算" : "生成 {count} 张", { count: e }),
											onClick: mt(e),
											children: e
										}, e))
									})
								})]
							})
						]
					})
				]
			})]
		}),
		Fe && /* @__PURE__ */ (0, K.jsx)(Me, {
			nodeType: e,
			currentPrompt: n,
			anchorEl: Re,
			userPresets: et,
			userSkills: tt,
			onSelect: ht,
			onRunAdvancedPreset: yt,
			onSelectSkill: xt,
			onUploadSkill: St,
			onManageSkills: bt,
			onClose: () => Y(!1),
			onManagePresets: vt
		}),
		/* @__PURE__ */ (0, K.jsx)(We, {}),
		/* @__PURE__ */ (0, K.jsx)(qe, {
			open: Ie,
			onClose: () => Le(!1)
		})
	] });
}
function st(e, t, n, r, i = 38) {
	if (t === null || e === t) return 0;
	let a = e - t, o = Math.abs(a), s = Math.sign(a), c = i * (n - 1) / 2, l = i * (r - 1), u = o === 1 ? l / 2 : 0;
	return s * (c + (o > 1 ? l : 0) + u);
}
function ct(e, t = 500, n = 8) {
	let r = null, i = null, a = () => {
		r !== null && clearTimeout(r), r = null, i = null;
	};
	return {
		start: (n, o) => (a(), o.button !== 0 || !o.isPrimary ? !1 : (i = {
			item: n,
			pointerId: o.pointerId,
			clientX: o.clientX,
			clientY: o.clientY
		}, r = setTimeout(() => {
			if (!i) return;
			let t = i.item;
			r = null, i = null, e(t);
		}, t), !0)),
		move: (e) => {
			!i || i.pointerId !== e.pointerId || Math.hypot(e.clientX - i.clientX, e.clientY - i.clientY) > n && a();
		},
		end: (e) => {
			i?.pointerId === e && a();
		},
		cancel: a,
		dispose: a
	};
}
//#endregion
//#region src/components/nodes/shared/ConnectedNodesPreview.tsx
var lt = typeof window < "u" && "__TAURI_INTERNALS__" in window;
function ut(e) {
	if (!(!e || !lt)) try {
		return D(e);
	} catch {
		return;
	}
}
var dt = {
	image: "🖼",
	video: "🎬",
	audio: "🎵",
	text: "T",
	shotlist: "▦"
};
function Q({ nodeId: e, onInsertMention: t, hoverEmphasis: n = "default" }) {
	let r = i(), { nodes: a, edges: o } = g(le((e) => ({
		nodes: e.nodes,
		edges: e.edges
	}))), s = g((e) => e.hoveredMentionNodeId), [c, l] = (0, G.useState)(null), [u, d] = (0, G.useState)(null), f = (0, G.useCallback)(() => {
		l(null), d(null);
	}, []), [p, m] = (0, G.useState)(null), [h, _] = (0, G.useState)(null), v = (0, G.useRef)(null), y = (0, G.useCallback)(() => {
		v.current = setTimeout(() => m(null), 120);
	}, [m]), b = (0, G.useCallback)(() => {
		v.current &&= (clearTimeout(v.current), null);
	}, []);
	(0, G.useEffect)(() => () => {
		v.current && clearTimeout(v.current);
	}, []);
	let x = (0, G.useMemo)(() => {
		if (!e) return [];
		let t = a.find((t) => t.id === e), n = new Set(o.filter((t) => t.target === e).map((e) => e.source));
		t?.parentId && o.filter((e) => e.target === t.parentId).forEach((e) => n.add(e.source));
		let i = /* @__PURE__ */ new Set();
		for (let e of n) a.find((t) => t.id === e)?.type === "group" ? a.filter((t) => t.parentId === e).forEach((e) => i.add(e.id)) : i.add(e);
		return a.filter((t) => t.id !== e && t.type !== "group" && i.has(t.id)).map((e) => {
			let t = e.data, n = t.type === "ai-shotlist", i = n ? t.shotlistRows?.length ?? 0 : 0, a = t.type === "ai-director" || e.type === "ai-director" ? t.imageUrl || (Array.isArray(t.directorCaptureUrls) ? t.directorCaptureUrls[0] : void 0) : void 0, o = n ? "shotlist" : t.imageUrl || a ? "image" : t.videoUrl ? "video" : t.audioUrl ? "audio" : "text", s = o === "image" ? ut(t.filePath) || t.thumbnailUrl || t.imageUrl || a || void 0 : o === "video" && t.thumbnailUrl || void 0, c = t.output ? String(t.output) : void 0, l = o === "text" && c ? c.slice(0, 50) : void 0, u = o === "image" ? ut(t.filePath) || t.imageUrl || a || s : o === "video" ? t.videoUrl : o === "audio" ? t.audioUrl : void 0, d, f, p;
			if (t.type === "ai-storyboard") {
				let n = Math.max(1, t.storyboardCols || 3), i = Math.max(1, t.storyboardRows || 3);
				f = n, p = i;
				let a = t.storyboardExtracted ?? [], o = t.storyboardOverrides ?? [], s = (t.storyboardRowPositions?.length || 0) > 0 || (t.storyboardColPositions?.length || 0) > 0, c = s ? [
					0,
					...t.storyboardRowPositions ?? [],
					100
				] : [], l = s ? [
					0,
					...t.storyboardColPositions ?? [],
					100
				] : [];
				d = [];
				for (let t = 0; t < i; t++) for (let u = 0; u < n; u++) {
					let f = t * n + u;
					if (a[f] && !o[f]) continue;
					let p = o[f], m = {};
					if (!p) {
						let e = s ? l[u] : u / n * 100, r = s ? c[t] : t / i * 100, a = s ? l[u + 1] - l[u] : 100 / n, o = s ? c[t + 1] - c[t] : 100 / i;
						m = {
							backgroundSize: `${100 / a * 100}% ${100 / o * 100}%`,
							backgroundPosition: `${e * 100 / (100 - a)}% ${r * 100 / (100 - o)}%`
						};
					}
					d.push({
						idx: f,
						r: t,
						c: u,
						label: r("第{row}行{col}列", {
							row: t + 1,
							col: u + 1
						}),
						mentionId: `${e.id}/cell/${f}`,
						bgStyle: m,
						overrideUrl: p?.url
					});
				}
			}
			return {
				id: e.id,
				label: t.label || r("节点"),
				displayId: t.displayId,
				outputType: o,
				thumbnailUrl: s,
				textSnippet: l,
				previewText: c,
				mediaUrl: u,
				shotCount: i,
				hasOutput: n ? i > 0 : !!t.output,
				nodeType: t.type,
				status: t.status,
				sbCells: d,
				sbCols: f,
				sbRows: p
			};
		});
	}, [
		e,
		a,
		o,
		r
	]), [S, C] = (0, G.useState)(null), w = (0, G.useCallback)((e) => C(e), []), T = (0, G.useCallback)(() => C(null), []), [E] = (0, G.useState)(() => ct((e) => {
		d(e.id), C(null), l(e);
	}));
	if ((0, G.useEffect)(() => () => E.dispose(), [E]), x.length === 0) return null;
	let D = (e, n) => {
		t?.(`@{${e}:${n}}`);
	}, O = s ? x.findIndex((e) => e.id === s || e.sbCells?.some((e) => e.mentionId === s)) : -1, k = S === null ? O >= 0 ? O : null : S, M = n === "expanded", N = M ? 2.5 : 1.22, P = M ? 1.16 : 1.1, ee = (e) => {
		if (S === null) return 1;
		let t = Math.abs(e - S);
		return t === 0 ? N : t === 1 ? P : 1;
	}, F = (e) => {
		if (S === null) return 0;
		if (M) return st(e, S, N, P);
		let t = e - S, n = Math.abs(t);
		return n === 0 ? 0 : n === 1 ? t * 12 : n === 2 ? t * 5 : 0;
	};
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "connected-nodes-float",
		children: [
			c === null && /* @__PURE__ */ (0, K.jsx)("div", {
				className: "connected-nodes-strip",
				children: x.map((e, t) => {
					let n = ee(t), i = F(t), a = k === t, o = e.nodeType === "ai-storyboard", s = e.nodeType === "ai-shotlist", c = !!(e.mediaUrl || e.thumbnailUrl || e.previewText), l = `${e.label}${e.displayId == null ? "" : ` #${e.displayId}`}`, f = c ? `${r("点击引用")} · ${r("长按全屏显示")}` : r("点击引用");
					return /* @__PURE__ */ (0, K.jsxs)(j.button, {
						type: "button",
						className: `connected-node-thumb ${e.hasOutput ? "" : "thumb-idle"} thumb-${e.outputType}${o ? " thumb-storyboard" : ""}${s ? " thumb-shotlist" : ""}${M ? " origin-bottom" : ""}`,
						"data-tooltip": `${l} — ${f}`,
						"data-tooltip-label": `${l} —`,
						"data-tooltip-action": f,
						onClick: () => {
							if (u === e.id) {
								d(null);
								return;
							}
							D(e.id, e.label);
						},
						onHoverStart: () => w(t),
						onHoverEnd: T,
						onPointerDown: (t) => {
							c && E.start(e, t) && t.currentTarget.setPointerCapture(t.pointerId);
						},
						onPointerMove: (e) => E.move(e),
						onPointerUp: (t) => {
							E.end(t.pointerId), window.setTimeout(() => {
								d((t) => t === e.id ? null : t);
							}, 0);
						},
						onPointerCancel: (e) => E.end(e.pointerId),
						onLostPointerCapture: E.cancel,
						onContextMenu: (e) => {
							c && e.preventDefault();
						},
						onMouseEnter: (t) => {
							o && (b(), m(e.id), _(t.currentTarget.getBoundingClientRect()));
						},
						onMouseLeave: () => {
							o && y();
						},
						animate: {
							scale: n,
							x: i,
							y: a && !M ? -4 : 0,
							opacity: a ? 1 : .85,
							boxShadow: a ? "0 6px 20px rgba(99,102,241,0.25), 0 0 0 2px rgba(99,102,241,0.35)" : "0 0 0 0px rgba(99,102,241,0)",
							borderColor: a ? "rgba(99,102,241,0.6)" : "rgba(195,195,202,0.33)"
						},
						whileTap: { scale: n * .92 },
						transition: {
							type: "spring",
							stiffness: 350,
							damping: 20,
							mass: .7
						},
						children: [
							e.outputType === "image" && e.thumbnailUrl ? /* @__PURE__ */ (0, K.jsx)("img", {
								src: e.thumbnailUrl,
								alt: e.label,
								className: "thumb-img",
								loading: "lazy"
							}) : e.outputType === "video" && e.thumbnailUrl ? /* @__PURE__ */ (0, K.jsxs)("div", {
								className: "thumb-video-wrap",
								children: [/* @__PURE__ */ (0, K.jsx)("img", {
									src: e.thumbnailUrl,
									alt: e.label,
									className: "thumb-img",
									loading: "lazy"
								}), /* @__PURE__ */ (0, K.jsx)("span", {
									className: "thumb-play-icon",
									children: "▶"
								})]
							}) : e.outputType === "text" && e.textSnippet ? /* @__PURE__ */ (0, K.jsx)("span", {
								className: "thumb-text",
								children: e.textSnippet
							}) : /* @__PURE__ */ (0, K.jsx)("span", {
								className: `thumb-icon thumb-icon-${e.outputType}`,
								children: dt[e.outputType] || "?"
							}),
							o && e.sbCells && /* @__PURE__ */ (0, K.jsx)("span", {
								className: "thumb-sb-badge",
								children: e.sbCells.length
							}),
							s && e.shotCount > 0 && /* @__PURE__ */ (0, K.jsx)("span", {
								className: "thumb-shot-badge",
								children: e.shotCount
							}),
							e.status === "loading" && /* @__PURE__ */ (0, K.jsx)("div", {
								className: "thumb-loading",
								children: /* @__PURE__ */ (0, K.jsx)("span", { className: "thumb-spinner" })
							})
						]
					}, e.id);
				})
			}),
			(0, J.createPortal)(/* @__PURE__ */ (0, K.jsx)(A, { children: c === null && p !== null && (() => {
				let e = x.find((e) => e.id === p);
				if (!e?.sbCells) return null;
				let t = h;
				return /* @__PURE__ */ (0, K.jsx)("div", {
					className: "sb-cell-anchor",
					style: t ? {
						left: `${t.left + t.width / 2}px`,
						top: `${t.top - 8}px`,
						transform: "translate(-50%, -100%)"
					} : {
						bottom: 72,
						left: "50%",
						transform: "translateX(-50%)"
					},
					onMouseEnter: b,
					onMouseLeave: () => {
						m(null);
					},
					children: /* @__PURE__ */ (0, K.jsx)(j.div, {
						className: "sb-cell-popup",
						initial: {
							opacity: 0,
							y: 4,
							scale: .96
						},
						animate: {
							opacity: 1,
							y: 0,
							scale: 1
						},
						exit: {
							opacity: 0,
							y: 4,
							scale: .96
						},
						transition: { duration: .18 },
						children: /* @__PURE__ */ (0, K.jsx)("div", {
							className: "sb-cell-grid",
							style: { gridTemplateColumns: `repeat(${e.sbCols}, 1fr)` },
							children: e.sbCells.map((t) => /* @__PURE__ */ (0, K.jsxs)("button", {
								type: "button",
								className: "sb-cell-item",
								title: `${e.label} · ${t.label}`,
								onClick: (n) => {
									n.stopPropagation(), D(t.mentionId, `${e.label} · ${t.label}`);
								},
								children: [t.overrideUrl ? /* @__PURE__ */ (0, K.jsx)("img", {
									src: t.overrideUrl,
									alt: t.label,
									className: "sb-cell-img"
								}) : e.thumbnailUrl ? /* @__PURE__ */ (0, K.jsx)("div", {
									className: "sb-cell-sprite",
									style: {
										backgroundImage: `url(${e.thumbnailUrl})`,
										...t.bgStyle
									}
								}) : /* @__PURE__ */ (0, K.jsxs)("span", {
									className: "sb-cell-placeholder",
									children: [
										t.r + 1,
										",",
										t.c + 1
									]
								}), /* @__PURE__ */ (0, K.jsx)("span", {
									className: "sb-cell-label",
									children: t.label
								})]
							}, t.idx))
						})
					}, `sb-popup-${p}`)
				});
			})() }), document.body),
			/* @__PURE__ */ (0, K.jsx)(ve, {
				isOpen: c !== null,
				onClose: f,
				hidePanel: !0,
				title: c?.label,
				className: "fullscreen-overlay--image-preview",
				children: c && /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "fixed inset-0 flex flex-col items-center justify-center gap-4 px-10 py-12",
					onClick: (e) => e.stopPropagation(),
					children: [/* @__PURE__ */ (0, K.jsx)("div", {
						className: "flex min-h-0 w-full flex-1 items-center justify-center overflow-hidden rounded-2xl",
						children: c.outputType === "image" && (c.mediaUrl || c.thumbnailUrl) ? /* @__PURE__ */ (0, K.jsx)("img", {
							src: c.mediaUrl || c.thumbnailUrl,
							alt: c.label,
							className: "max-h-full max-w-full select-none rounded-2xl object-contain shadow-2xl",
							draggable: !1
						}) : c.outputType === "video" && c.mediaUrl ? /* @__PURE__ */ (0, K.jsx)("video", {
							src: c.mediaUrl,
							className: "max-h-full max-w-full rounded-2xl bg-black shadow-2xl",
							controls: !0,
							autoPlay: !0
						}) : c.outputType === "audio" && c.mediaUrl ? /* @__PURE__ */ (0, K.jsxs)("div", {
							className: "flex w-full max-w-xl flex-col items-center gap-5 rounded-2xl border border-canvas-border bg-canvas-surface/90 p-8 shadow-2xl backdrop-blur-xl",
							children: [/* @__PURE__ */ (0, K.jsx)("span", {
								className: "text-5xl",
								"aria-hidden": "true",
								children: "🎵"
							}), /* @__PURE__ */ (0, K.jsx)("audio", {
								src: c.mediaUrl,
								className: "w-full",
								controls: !0,
								autoPlay: !0
							})]
						}) : c.outputType === "video" && c.thumbnailUrl ? /* @__PURE__ */ (0, K.jsx)("img", {
							src: c.thumbnailUrl,
							alt: c.label,
							className: "max-h-full max-w-full select-none rounded-2xl object-contain shadow-2xl",
							draggable: !1
						}) : /* @__PURE__ */ (0, K.jsx)("div", {
							className: "max-h-full w-full max-w-3xl overflow-y-auto rounded-2xl border border-canvas-border bg-canvas-surface/90 p-6 text-sm leading-7 text-canvas-text shadow-2xl backdrop-blur-xl",
							children: c.previewText || r("暂无可预览内容")
						})
					}), /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "flex shrink-0 flex-col items-center gap-2",
						children: [/* @__PURE__ */ (0, K.jsxs)("span", {
							className: "max-w-[70vw] truncate text-xs text-white/70",
							children: [c.label, c.displayId == null ? "" : ` #${c.displayId}`]
						}), /* @__PURE__ */ (0, K.jsx)("button", {
							type: "button",
							className: "inline-flex min-h-10 items-center justify-center rounded-xl bg-indigo-500 px-5 text-sm font-medium text-white shadow-lg transition-[transform,background-color] duration-150 ease-out hover:bg-indigo-400 active:scale-[.97] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300",
							onClick: () => {
								D(c.id, c.label), f();
							},
							children: r("单击引用")
						})]
					})]
				})
			}),
			/* @__PURE__ */ (0, K.jsx)("style", { children: "\n        .connected-nodes-float {\n          position: relative;\n          width: 540px;\n          max-width: calc(100vw - 32px);\n          background: transparent;\n          padding: 0 14px;\n        }\n        .connected-nodes-strip {\n          display: flex;\n          gap: 6px;\n          scrollbar-width: thin;\n          scrollbar-color: var(--theme-border) transparent;\n        }\n        .connected-nodes-strip::-webkit-scrollbar { height: 3px; }\n        .connected-nodes-strip::-webkit-scrollbar-track { background: transparent; }\n        .connected-nodes-strip::-webkit-scrollbar-thumb { background: var(--theme-border); border-radius: 8px; }\n        .connected-node-thumb {\n          flex-shrink: 0;\n          width: 38px; height: 38px;\n          border-radius: 8px;\n          border: 2px solid rgba(195,195,202,0.33);\n          background: var(--theme-surface);\n          cursor: var(--cursor-pointer, pointer);\n          display: flex; align-items: center; justify-content: center;\n          overflow: hidden; position: relative; padding: 0;\n        }\n        .connected-node-thumb[data-tooltip]:hover { overflow: visible; }\n        .connected-node-thumb.thumb-storyboard { border-color: rgba(244,114,182,0.45); }\n        /* 分镜表：沿用节点自身的琥珀色，和文本节点区分开 */\n        .connected-node-thumb.thumb-shotlist {\n          border-color: rgba(251,191,36,0.5);\n          background: rgba(251,191,36,0.08);\n        }\n        .thumb-img {\n          width: 100%; height: 100%; object-fit: cover; border-radius: 6px;\n        }\n        .thumb-video-wrap {\n          position: relative; width: 100%; height: 100%;\n          display: flex; align-items: center; justify-content: center;\n        }\n        .thumb-video-wrap .thumb-img { position: absolute; inset: 0; width: 100%; height: 100%; }\n        .thumb-play-icon {\n          position: relative; z-index: 1; font-size: 12px;\n          color: rgba(255,255,255,0.9); text-shadow: 0 1px 3px var(--black-alpha-50); pointer-events: none;\n        }\n        .thumb-icon { font-size: 14px; font-weight: 600; opacity: 0.5; }\n        .thumb-icon-image { color: var(--success-text); }\n        .thumb-icon-video { color: var(--node-video-light); }\n        .thumb-icon-audio { color: var(--node-audio-light); }\n        .thumb-icon-text  { color: var(--brand-hover); }\n        .thumb-icon-shotlist { color: #fbbf24; opacity: 0.9; font-size: 16px; }\n        .thumb-text {\n          font-size: 4px; line-height: 1.2; color: var(--theme-text-secondary);\n          padding: 1px; display: -webkit-box;\n          -webkit-line-clamp: 4; -webkit-box-orient: vertical; overflow: hidden; word-break: break-all;\n        }\n        .thumb-loading {\n          position: absolute; inset: 0;\n          background: var(--black-alpha-50);\n          display: flex; align-items: center; justify-content: center;\n        }\n        .thumb-spinner {\n          width: 12px; height: 12px;\n          border: 2px solid rgba(255,255,255,0.2); border-top-color: #fff;\n          border-radius: 50%; animation: thumb-spin 0.6s linear infinite;\n        }\n        @keyframes thumb-spin { to { transform: rotate(360deg); } }\n\n        /* ── 宫格角标 ── */\n        .thumb-sb-badge {\n          position: absolute; bottom: -1px; right: -1px;\n          min-width: 16px; height: 16px; padding: 0 4px;\n          font-size: 10px; font-weight: 600; line-height: 16px;\n          color: #fff; background: #db2777; border-radius: 6px 0 6px 0;\n          z-index: 2;\n        }\n\n        /* ── 分镜表角标 ── */\n        .thumb-shot-badge {\n          position: absolute; bottom: -1px; right: -1px;\n          min-width: 16px; height: 16px; padding: 0 4px;\n          font-size: 10px; font-weight: 600; line-height: 16px;\n          color: #1c1300; background: #fbbf24; border-radius: 6px 0 6px 0;\n          z-index: 2;\n        }\n\n        /* ── 宫格弹出浮层 ── */\n        .sb-cell-anchor {\n          position: fixed;\n          z-index: 9999;\n        }\n        .sb-cell-popup {\n          max-width: calc(100vw - 24px);\n          background: var(--theme-card);\n          border: 1px solid var(--theme-border);\n          border-radius: 12px;\n          padding: 10px;\n          box-shadow: 0 12px 40px rgba(0,0,0,0.5), 0 0 0 1px rgba(244,114,182,0.2);\n        }\n        .sb-cell-grid {\n          display: grid;\n          gap: 5px;\n        }\n        .sb-cell-item {\n          position: relative;\n          width: 54px; height: 54px;\n          border-radius: 6px;\n          border: 1.5px solid rgba(195,195,202,0.28);\n          overflow: hidden;\n          cursor: var(--cursor-pointer, pointer);\n          background: var(--theme-surface);\n          padding: 0;\n          transition: border-color 0.15s, box-shadow 0.15s;\n        }\n        .sb-cell-item:hover {\n          border-color: rgba(244,114,182,0.6);\n          box-shadow: 0 0 12px rgba(244,114,182,0.2);\n        }\n        .sb-cell-img {\n          width: 100%; height: 100%; object-fit: cover; border-radius: 4px;\n        }\n        .sb-cell-sprite {\n          width: 100%; height: 100%;\n          background-repeat: no-repeat;\n          border-radius: 4px;\n        }\n        .sb-cell-placeholder {\n          display: flex; align-items: center; justify-content: center;\n          font-size: 12px; color: var(--theme-text-muted);\n          width: 100%; height: 100%;\n        }\n        .sb-cell-label {\n          position: absolute; bottom: 2px; left: 2px;\n          font-size: 9px; line-height: 13px; padding: 0 4px;\n          color: rgba(255,255,255,0.85);\n          background: rgba(0,0,0,0.55);\n          border-radius: 3px;\n          pointer-events: none;\n        }\n      " })
		]
	});
}
//#endregion
//#region src/components/nodes/AINodeDialog.tsx
var $ = (0, G.lazy)(() => import("./index.es-C2VNoMuv.js").then((e) => ({ default: e.BorderBeam }))), ft = 16;
function pt() {
	let e = i(), { activeNodeId: t, dialogPosition: n, closeNodeDialog: r, updateNodeData: l, updateNodeDataTransient: d, commitToHistory: m, recordOutputHistory: _, showToast: v, workflows: b, currentProjectId: S } = g(le((e) => ({
		activeNodeId: e.activeNodeId,
		dialogPosition: e.dialogPosition,
		closeNodeDialog: e.closeNodeDialog,
		updateNodeData: e.updateNodeData,
		updateNodeDataTransient: e.updateNodeDataTransient,
		commitToHistory: e.commitToHistory,
		recordOutputHistory: e.recordOutputHistory,
		showToast: e.showToast,
		workflows: e.workflows,
		currentProjectId: e.currentProjectId
	}))), C = g((e) => e.activeNodeId ? e.nodes.find((t) => t.id === e.activeNodeId) : void 0), w = g((e) => e.config.performanceMode === !0), T = C?.data, E = T?.type, k = (0, G.useRef)(null), A = (0, G.useRef)(null), j = (0, G.useRef)(/* @__PURE__ */ new Set()), [M, N] = (0, G.useState)(!1);
	(0, G.useLayoutEffect)(() => {
		let e = k.current, n = A.current;
		if (!e || !t || M) return;
	let r = 0, i = 0, a = 0, o = !1, s = !1, c = null, l = (e) => E === "ai-image" || E === "ai-video" ? 2 : e ? 12 : -20, u = (t, r) => {
			let i = l(r);
			e.style.left = `${t.x}px`, e.style.top = `${t.y + i}px`, n && (n.style.left = `${t.x}px`, n.style.top = `${t.y + i - 42}px`);
		}, d = () => {
			if (!t) return !1;
			let e = g.getState().nodes.find((e) => e.id === t)?.data;
			return !!(e?.imageUrl || e?.thumbnailUrl || e?.videoUrl || e?.audioUrl);
		}, f = () => {
			c?.isConnected || (c = document.querySelector(`.react-flow__node[data-id="${t}"]`));
			let e = c?.getBoundingClientRect();
			if (!e) return null;
			let n = {
				x: e.left + e.width / 2,
				y: e.bottom
			};
			return u(n, d()), n;
		}, p = (r, i, c) => {
			cancelAnimationFrame(a), e.style.transition = "none", n && (n.style.transition = "none");
			let l = f();
			if (!l) {
				o = !1, e.style.removeProperty("transition"), n?.style.removeProperty("transition");
				return;
			}
			let p = d();
			ae({
				deltaX: r,
				deltaY: i,
				duration: c,
				onProgress: (e) => {
					s || u({
						x: l.x + e.deltaX,
						y: l.y + e.deltaY
					}, p);
				},
				onComplete: (r) => {
					if (s) return;
					let i = {
						x: l.x + r.deltaX,
						y: l.y + r.deltaY
					};
					u(i, p), g.getState().openNodeDialog(t, i), a = requestAnimationFrame(() => {
						e.style.removeProperty("transition"), n?.style.removeProperty("transition"), o = !1, h();
					});
				}
			});
		}, m = () => {
			if (o) return;
			let t = e.getBoundingClientRect(), n = window.visualViewport, r = e.closest(".app-box")?.getBoundingClientRect(), i = n?.offsetLeft ?? 0, a = n?.offsetTop ?? 0, s = i + (n?.width ?? window.innerWidth), c = a + (n?.height ?? window.innerHeight), l = Math.max(i, r?.left ?? i) + ft, u = Math.max(a, r?.top ?? a) + ft, d = Math.min(s, r?.right ?? s) - ft, f = Math.min(c, r?.bottom ?? c) - ft, m = d - l, h = f - u, g = 0, _ = 0;
			if (t.width <= m && (t.left < l ? g = l - t.left : t.right > d && (g = d - t.right)), t.height <= h && (t.top < u ? _ = u - t.top : t.bottom > f && (_ = f - t.bottom)), Math.abs(g) < .5 && Math.abs(_) < .5) return;
			let v = window.matchMedia("(prefers-reduced-motion: reduce)").matches ? 0 : 280;
			o = !0, p(g, _, v);
		}, h = () => {
			cancelAnimationFrame(r), r = requestAnimationFrame(m);
		}, _ = new ResizeObserver(h);
		_.observe(e);
		let v = e.closest(".app-box");
		return v && _.observe(v), h(), i = window.setTimeout(h, 280), window.addEventListener("resize", h), window.visualViewport?.addEventListener("resize", h), () => {
			s = !0, cancelAnimationFrame(r), cancelAnimationFrame(a), window.clearTimeout(i), e.style.removeProperty("transition"), n?.style.removeProperty("transition"), _.disconnect(), window.removeEventListener("resize", h), window.visualViewport?.removeEventListener("resize", h);
		};
	}, [t, M]), (0, G.useEffect)(() => {
		if (!t || M) return;
		let e = document.querySelector(`.react-flow__node[data-id="${t}"]`);
		if (!e) return;
		let n = new ResizeObserver(() => {
			let n = e.getBoundingClientRect();
			g.getState().openNodeDialog(t, {
				x: n.left + n.width / 2,
				y: n.bottom
			});
		});
		return n.observe(e), () => n.disconnect();
	}, [t, M]);
	let L = (0, G.useRef)(null), te = (0, G.useRef)(!1), R = (0, G.useCallback)(() => {
		te.current &&= (m(), !1);
	}, [m]), B = (0, G.useCallback)((e) => {
		t && (te.current ||= (m(), !0), d(t, e));
	}, [
		t,
		m,
		d
	]), V = (0, G.useCallback)(() => {
		R(), r();
	}, [r, R]);
	(0, G.useEffect)(() => () => R(), [t, R]), (0, G.useEffect)(() => {
		let e = (e) => {
			e.key === "Escape" && (e.stopPropagation(), M ? N(!1) : V());
		};
		return window.addEventListener("keydown", e, !0), () => window.removeEventListener("keydown", e, !0);
	}, [V, M]);
	let H = (0, G.useCallback)((e) => {
		let t = {}, n = /@wf\{([^|]+)\|([^|]+)\|([^|}]+)\}\(([\s\S]*?)\)/g, r;
		for (; (r = n.exec(e)) !== null;) {
			let e = r[1];
			t[e] = r[4].replace(/\n$/, "");
		}
		B({
			prompt: e,
			workflowInputs: Object.keys(t).length > 0 ? t : void 0
		});
	}, [B]), oe = (0, G.useCallback)(async (n, r) => {
		R();
		let i = g.getState(), s = i.nodes.find((e) => e.id === t)?.data;
		if (!s) {
			v(e("节点不存在"), "error");
			return;
		}
		let u = n ?? s.prompt ?? "";
		if (!u.trim()) {
			v(e("请输入提示词"), "error");
			return;
		}
		let m = i.projects.find((e) => e.id === S)?.settings, b = a({
			prompt: u,
			data: s,
			settings: m,
			customStyles: i.customStyles
		}), C = xe(s.cameraSettings), w = C && (E === "ai-image" || E === "ai-video") ? `${b}\n\nCamera settings: ${C}.` : b, T = s?.model, k = s?.provider, A = s?.label ?? "";
		if (!T || !k) {
			v(e("请先在底部模型选择器中选择一个模型"), "error");
			return;
		}
		let j = t, M = S, N = () => {
			let e = g.getState();
			return e.currentProjectId === M && e.nodes.some((e) => e.id === j);
		};
		d(t, {
			status: "loading",
			error: void 0
		});
		let P;
		try {
			let n = Math.min(8, Math.max(1, Math.floor(Number(s.batchCount) || 1)));
			if (E === "ai-image" && n > 1) {
				if (r) throw Error(e("批量生成暂不支持图片后处理，请将数量设为 1"));
				let i = s.imageSize || "2K", a = s.aspectRatio || "1:1";
				P = o({
					nodeId: j,
					count: n,
					projectId: M
				}).nodeIds, v(e("正在批量生成 {count} 张图片", { count: n }));
				let l = await ce({
					prompt: w,
					model: T,
					provider: k,
					imageSize: i,
					aspectRatio: a,
					workflowId: s.workflowId,
					workflowInputs: s.workflowInputs,
					nodeId: t ?? void 0
				}, n);
				if (!N()) return;
				await c({
					nodeId: j,
					targetNodeIds: P,
					batch: l,
					projectId: M,
					prompt: w,
					imageSize: i,
					aspectRatio: a
				});
				return;
			}
			if (E === "ai-image" || E === "ai-animation") {
				let n = E === "ai-animation", i = s.imageSize || "2K", a = s.animationAction ?? "idle", o = s.animationFrames ?? 8, c = n ? W(o, k) : s.aspectRatio || "1:1", u = await I({
					prompt: n ? he(w, a, o, c) : w,
					model: T,
					provider: k,
					imageSize: i,
					aspectRatio: c,
					workflowId: s.workflowId,
					workflowInputs: s.workflowInputs,
					nodeId: t ?? void 0
				});
				if (!N()) return;
				let d = S ? await O(u.url, S, "ai-image", A) : {
					mediaUrl: u.url,
					sourceUrl: u.url
				}, m = d.mediaUrl;
				if (l(t, {
					imageUrl: m,
					sourceUrl: d.sourceUrl,
					filePath: d.filePath,
					thumbnailUrl: m,
					output: d.sourceUrl,
					status: "success",
					imageWidth: u.width,
					imageHeight: u.height,
					...n ? { aspectRatio: c } : {}
				}), g.getState().syncDramaAssetImageFromNode?.(t, m), _(t, {
					nodeId: t,
					nodeLabel: A,
					timestamp: Date.now(),
					prompt: w,
					output: d.sourceUrl,
					nodeType: n ? "ai-animation" : "ai-image",
					model: T,
					provider: k,
					status: "success",
					mediaUrl: m,
					filePath: d.filePath,
					params: n ? {
						imageSize: i,
						aspectRatio: c,
						animationAction: a,
						animationFrames: o,
						grid: p[o]
					} : {
						imageSize: i,
						aspectRatio: c,
						cameraSettings: s.cameraSettings
					}
				}), r === "character-8-direction-grid") if (!d.filePath) v(e("原图已生成，但未能保存到本地，无法自动生成 8 向宫格"), "error");
				else {
					v(e("图片生成完成，正在后台切图生成 8 向宫格"));
					try {
						if (!N()) return;
						let t = await ye(d.filePath);
						if (!N()) return;
						let n = g.getState(), r = n.nodes.find((e) => e.id === j);
						if (!r) return;
						n.addNode({
							id: `node-${h()}`,
							type: "ai-storyboard",
							...f(r, 60),
							data: {
								label: `${A} 8向宫格`,
								type: "ai-storyboard",
								role: "source",
								status: "success",
								imageUrl: D(t.grid_path),
								filePath: t.grid_path,
								imageWidth: t.grid_size,
								imageHeight: t.grid_size,
								storyboardRows: 3,
								storyboardCols: 3,
								nodeWidth: 360,
								nodeHeight: 360
							}
						}), v(e("角色 8 向宫格已生成"));
					} catch (t) {
						v(e("原图已生成，8 向宫格处理失败：{message}", { message: t instanceof Error ? t.message : typeof t == "string" ? t : e("未知错误") }), "error");
					}
				}
				else v(e(n ? "Sprite Sheet 生成完成" : "图片生成完成"));
			} else if (E === "ai-panorama") {
				let n = s.imageSize || "2K", r = s.aspectRatio || "2:1", i = await I({
					prompt: z(w),
					model: T,
					provider: k,
					imageSize: n,
					aspectRatio: r,
					workflowId: s.workflowId,
					workflowInputs: s.workflowInputs,
					nodeId: t ?? void 0
				});
				if (!N()) return;
				let a = S ? await O(i.url, S, "ai-panorama", A) : {
					mediaUrl: i.url,
					sourceUrl: i.url
				}, o = a.mediaUrl;
				l(t, {
					imageUrl: o,
					sourceUrl: a.sourceUrl,
					filePath: a.filePath,
					thumbnailUrl: o,
					output: a.sourceUrl,
					status: "success",
					imageWidth: i.width,
					imageHeight: i.height
				}), _(t, {
					nodeId: t,
					nodeLabel: A,
					timestamp: Date.now(),
					prompt: w,
					output: a.sourceUrl,
					nodeType: "ai-panorama",
					model: T,
					provider: k,
					status: "success",
					mediaUrl: o,
					filePath: a.filePath,
					params: {
						imageSize: n,
						aspectRatio: r
					}
				}), v(e("全景图生成完成"));
			} else if (E === "ai-video") {
				let { videoResolution: n, videoFps: r, videoFrames: i, seedanceResolution: a, seedanceRatio: o, seedanceDuration: c } = ee({
					provider: k,
					workflowId: s.workflowId,
					videoResolution: s.videoResolution,
					videoFps: s.videoFps,
					videoFrames: s.videoFrames,
					seedanceResolution: s.seedanceResolution,
					seedanceRatio: s.seedanceRatio,
					seedanceDuration: s.seedanceDuration
				}), u = s.generateAudio, d = await ne({
					prompt: w,
					model: T,
					provider: k,
					videoResolution: n,
					videoFps: r,
					videoFrames: i,
					seedanceResolution: a,
					seedanceRatio: o,
					seedanceDuration: c,
					generateAudio: u,
					workflowId: s.workflowId,
					workflowInputs: s.workflowInputs,
					nodeId: t ?? void 0
				});
				if (!N()) return;
				let f = S ? await O(d.url, S, "ai-video", A) : {
					mediaUrl: d.url,
					sourceUrl: d.url
				}, p = f.mediaUrl;
				l(t, {
					videoUrl: p,
					sourceUrl: f.sourceUrl,
					filePath: f.filePath,
					thumbnailUrl: p,
					output: f.sourceUrl,
					status: "success"
				}), _(t, {
					nodeId: t,
					nodeLabel: A,
					timestamp: Date.now(),
					prompt: w,
					output: f.sourceUrl,
					nodeType: "ai-video",
					model: T,
					provider: k,
					status: "success",
					mediaUrl: p,
					filePath: f.filePath,
					params: {
						videoResolution: n,
						videoFps: r,
						videoFrames: i,
						seedanceResolution: a,
						seedanceRatio: o,
						seedanceDuration: c,
						generateAudio: u,
						cameraSettings: s.cameraSettings
					}
				}), v(e("视频生成完成"));
			} else if (E === "ai-audio") {
				let n = await re({
					prompt: w,
					model: T,
					provider: k,
					audioVoice: s.audioVoice,
					audioFormat: s.audioFormat,
					audioSpeed: s.audioSpeed,
					musicTitle: s.musicTitle,
					musicLyrics: s.musicLyrics,
					musicBpm: s.musicBpm,
					musicDuration: s.musicDuration,
					autoGenerateLyrics: s.autoGenerateLyrics,
					workflowId: s.workflowId,
					workflowInputs: s.workflowInputs,
					nodeId: t ?? void 0
				});
				if (!N()) {
					n.url.startsWith("blob:") && URL.revokeObjectURL(n.url);
					return;
				}
				let r = await F(n, S, A);
				l(t, {
					audioUrl: r.mediaUrl,
					sourceUrl: r.sourceUrl,
					filePath: r.filePath,
					thumbnailUrl: r.mediaUrl,
					output: r.outputUrl,
					musicClipId: n.clipId,
					...n.title ? { musicTitle: n.title } : {},
					...n.lyrics ? { musicLyrics: n.lyrics } : {},
					status: "success"
				}), _(t, {
					nodeId: t,
					nodeLabel: A,
					timestamp: Date.now(),
					prompt: w,
					output: r.outputUrl,
					nodeType: "ai-audio",
					model: T,
					provider: k,
					status: "success",
					mediaUrl: r.mediaUrl,
					filePath: r.filePath,
					params: {
						audioVoice: s.audioVoice,
						audioFormat: s.audioFormat,
						audioSpeed: s.audioSpeed,
						musicTitle: n.title || s.musicTitle,
						musicBpm: s.musicBpm,
						musicDuration: s.musicDuration,
						autoGenerateLyrics: s.autoGenerateLyrics
					}
				}), v(e("音频生成完成"));
			} else if (E === "ai-shotlist") {
				let n = x(s.shotlistColumns), r = await ie({
					prompt: Ce(w, n),
					model: T,
					provider: k
				});
				if (!N()) return;
				let i = Te(r), a = Ee(g.getState().nodes.find((e) => e.id === j)?.data.shotlistRows ?? [], i);
				l(t, {
					shotlistRows: a,
					status: "success"
				}), _(t, {
					nodeId: t,
					nodeLabel: A,
					timestamp: Date.now(),
					prompt: w,
					output: r,
					nodeType: "ai-shotlist",
					model: T,
					provider: k,
					status: "success",
					params: { columns: n }
				}), v(e("已生成 {count} 个镜头", { count: a.length }));
			} else {
				let n = await ie({
					prompt: w,
					model: T,
					provider: k
				}), { postProcessDramaExtractOutput: r } = await import("./dramaAssetExtract-TP_lzZcC.js").then((e) => e.t), i = r(w, n);
				if (l(t, {
					output: i.output,
					status: "success"
				}), _(t, {
					nodeId: t,
					nodeLabel: A,
					timestamp: Date.now(),
					prompt: w,
					output: i.output,
					nodeType: "ai-text",
					model: T,
					provider: k,
					status: "success"
				}), i.kind) {
					i.ok && i.parsed && g.getState().mergeDramaExtract(i.parsed, {
						sourceNodeId: t,
						modelId: T
					});
					let n = i.kind === "character" ? e("人物") : i.kind === "scene" ? e("场景") : e("道具");
					i.ok ? v(e("{kind}简介已提取并入库 · 「资产管理 > 短剧资产」可查看", { kind: n })) : v(e("已提取，但 JSON 未完全规范化，请检查输出"), "error");
				}
			}
		} catch (n) {
			let r = n instanceof Error ? n.message : typeof n == "string" && n.trim() ? n : e("生成失败");
			if (n instanceof DOMException && n.name === "AbortError" || r === "任务已被取消" || r === "请求已取消" || !N()) return;
			P && y(P, r, M), d(t, {
				status: "error",
				error: r
			}), _(t, {
				nodeId: t,
				nodeLabel: A,
				timestamp: Date.now(),
				prompt: w,
				output: "",
				nodeType: E,
				model: T,
				provider: k,
				status: "error",
				error: r
			}), v(r, "error");
		}
	}, [
		t,
		E,
		S,
		R,
		l,
		d,
		_,
		v,
		e
	]), se = (0, G.useCallback)(async () => {
		if (!t || j.current.has(t)) return;
		let n = t;
		j.current.add(n);
		try {
			await u(n), d(n, {
				status: "idle",
				error: void 0
			}), v(e("已终止 ComfyUI 任务"));
		} catch (t) {
			d(n, {
				status: "idle",
				error: void 0
			}), v(e("已停止本地等待，但{message}", { message: t instanceof Error ? t.message : e("无法终止 ComfyUI 任务") }), "error");
		} finally {
			j.current.delete(n);
		}
	}, [
		t,
		v,
		e,
		d
	]), ue = E !== "ai-image" && E !== "ai-animation" && E !== "ai-video" && E !== "ai-audio" && E !== "ai-shotlist", U = (0, G.useCallback)(() => {
		let e = g.getState().nodes.find((e) => e.id === t)?.data;
		!e?.prompt?.trim() || !e?.type || (l(t, {
			output: e.prompt,
			status: "success"
		}), _(t, {
			nodeId: t,
			nodeLabel: e.label,
			timestamp: Date.now(),
			prompt: e.prompt,
			output: e.prompt,
			nodeType: e.type,
			model: e.model || "passthrough",
			provider: e.provider || "passthrough",
			status: "success"
		}));
	}, [
		t,
		l,
		_
	]), de = (0, G.useCallback)((e) => {
		l(t, {
			model: e.value,
			provider: e.provider,
			audioPurpose: e.audioPurpose,
			...E === "ai-video" && e.provider === "general" ? {
				videoResolution: void 0,
				videoFps: void 0,
				videoFrames: void 0,
				seedanceResolution: void 0,
				seedanceRatio: void 0,
				seedanceDuration: void 0,
				generateAudio: void 0
			} : {},
			...e.provider === "dreamina" ? { batchCount: 1 } : {}
		});
	}, [
		t,
		E,
		l
	]), fe = (0, G.useCallback)((e) => {
		l(t, {
			workflowId: e,
			...e ? {
				provider: "comfyui",
				model: "comfyui/workflow",
				batchCount: 1,
				audioPurpose: void 0
			} : {}
		});
	}, [t, l]), pe = (0, G.useCallback)((e) => l(t, { imageSize: e }), [t, l]), me = (0, G.useCallback)((e) => l(t, { aspectRatio: e }), [t, l]), ge = (0, G.useCallback)((e) => l(t, { batchCount: e }), [t, l]), _e = (0, G.useCallback)((e) => l(t, { cameraSettings: e }), [t, l]), ve = (0, G.useCallback)((e) => B({ videoResolution: e }), [B]), be = (0, G.useCallback)((e) => l(t, { videoFps: e }), [t, l]), Se = (0, G.useCallback)((e) => l(t, { seedanceResolution: e }), [t, l]), q = (0, G.useCallback)((e) => l(t, { seedanceRatio: e }), [t, l]), we = (0, G.useCallback)((e) => B({ seedanceDuration: e }), [B]), De = (0, G.useCallback)((e) => l(t, { generateAudio: e }), [t, l]), Oe = (0, G.useCallback)((e) => l(t, { videoReferences: e }), [t, l]), ke = (0, G.useCallback)((e) => l(t, { audioVoice: e }), [t, l]), Ae = (0, G.useCallback)((e) => l(t, { audioFormat: e }), [t, l]), J = (0, G.useCallback)((e) => B({ audioSpeed: e }), [B]), je = (0, G.useCallback)((e) => B({ musicTitle: e }), [B]), Me = (0, G.useCallback)((e) => B({ musicLyrics: e }), [B]), Ne = (0, G.useCallback)((e) => B({ musicBpm: e }), [B]), Pe = (0, G.useCallback)((e) => B({ musicDuration: e }), [B]), Fe = (0, G.useCallback)((e) => l(t, { autoGenerateLyrics: e }), [t, l]), Y = (0, G.useCallback)((e) => l(t, { style: e }), [t, l]), Ie = (0, G.useCallback)((e) => l(t, { animationAction: e }), [t, l]), Le = (0, G.useCallback)((e) => l(t, { animationFrames: e }), [t, l]);
	if (!t || !C || !T || !E) return null;
	let Re = T.audioPurpose ?? (T.model ? P(T.model)?.audioPurpose : void 0), X = E === "ai-image" || E === "ai-video" ? 2 : T.imageUrl || T.thumbnailUrl || T.videoUrl || T.audioUrl ? 12 : -20, ze = (e) => {
		let n = e.match(/^@\{([^:]+):([^}]+)\}$/);
		if (n && L.current) {
			L.current.insertMentionAtCursor(n[1], n[2]);
			return;
		}
		let r = (g.getState().nodes.find((e) => e.id === t)?.data?.prompt ?? T.prompt) || "";
		B({ prompt: r ? `${r} ${e}` : e });
	};
	return /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [
		!M && /* @__PURE__ */ (0, K.jsx)("div", {
			ref: A,
			className: "ai-dialog-preview-float",
			style: n ? {
				left: `${n.x}px`,
				top: `${n.y + X - 42}px`,
				transform: "translateX(-50%)"
			} : void 0,
			children: /* @__PURE__ */ (0, K.jsx)(Q, {
				nodeId: t,
				onInsertMention: ze
			})
		}),
		M && /* @__PURE__ */ (0, K.jsx)("button", {
			type: "button",
			className: "ai-dialog-expanded-backdrop",
			"aria-label": e("还原"),
			onClick: () => N(!1)
		}),
		/* @__PURE__ */ (0, K.jsxs)("div", {
			ref: k,
			className: `ai-dialog-float${M ? " is-expanded" : ""}`,
			role: M ? "dialog" : void 0,
			"aria-modal": M ? !0 : void 0,
			"aria-label": M ? e("节点生成对话框") : void 0,
			style: M ? void 0 : {
				left: n ? `${n.x}px` : "50%",
				top: n ? `${n.y + X}px` : "50%",
				transform: n ? "translateX(-50%)" : "translate(-50%, -50%)"
			},
			onMouseDown: (e) => e.stopPropagation(),
			children: [
				T.status === "loading" && !w && /* @__PURE__ */ (0, K.jsx)(G.Suspense, {
					fallback: null,
					children: /* @__PURE__ */ (0, K.jsx)($, {
						className: "ai-dialog-beam",
						borderRadius: 14,
						colorVariant: "colorful",
						duration: 5,
						strength: .85,
						theme: typeof document < "u" && document.documentElement.getAttribute("data-theme") === "light" ? "light" : "dark",
						children: null
					})
				}),
				M && /* @__PURE__ */ (0, K.jsx)("div", {
					className: "ai-dialog-preview-float is-expanded",
					children: /* @__PURE__ */ (0, K.jsx)(Q, {
						nodeId: t,
						onInsertMention: ze,
						hoverEmphasis: "expanded"
					})
				}),
				/* @__PURE__ */ (0, K.jsx)("button", {
					type: "button",
					className: "ai-dialog-expand-btn",
					"aria-label": e(M ? "还原" : "最大化"),
					"aria-pressed": M,
					"data-tooltip": e(M ? "还原" : "最大化"),
					onClick: (e) => {
						e.stopPropagation(), N((e) => !e);
					},
					children: M ? /* @__PURE__ */ (0, K.jsx)("svg", {
						width: "16",
						height: "16",
						viewBox: "0 0 24 24",
						fill: "none",
						stroke: "currentColor",
						strokeWidth: "1.8",
						"aria-hidden": "true",
						children: /* @__PURE__ */ (0, K.jsx)("path", { d: "M9 4v5H4M15 20v-5h5M4 9l5-5M20 15l-5 5" })
					}) : /* @__PURE__ */ (0, K.jsx)("svg", {
						width: "16",
						height: "16",
						viewBox: "0 0 24 24",
						fill: "none",
						stroke: "currentColor",
						strokeWidth: "1.8",
						"aria-hidden": "true",
						children: /* @__PURE__ */ (0, K.jsx)("path", { d: "M4 9V4h5M20 15v5h-5M9 4 4 9M15 20l5-5" })
					})
				}),
				/* @__PURE__ */ (0, K.jsx)(ot, {
					editorRef: L,
					nodeType: E,
					nodeId: t,
					prompt: T.prompt || "",
					placeholder: e("描述任何你想要生成的内容，按 @ 引用素材，/呼出指令\n(Enter 生成，Shift+Enter 换行)"),
					selectedModel: T.model,
					selectedProvider: T.provider,
					selectedWorkflowId: T.workflowId,
					animationAction: T.animationAction ?? "idle",
					onAnimationActionChange: Ie,
					animationFrames: T.animationFrames ?? 8,
					onAnimationFramesChange: Le,
					canGenerate: T.status !== "loading",
					isGenerating: T.status === "loading",
					onCancelGeneration: T.provider === "comfyui" ? () => {
						se();
					} : void 0,
					onChange: H,
					onContinuousEditEnd: R,
					onSubmit: oe,
					onModelSelect: de,
					onWorkflowSelect: fe,
					onPassThrough: ue ? U : void 0,
					imageSize: T.imageSize || "2K",
					aspectRatio: T.aspectRatio || (E === "ai-panorama" ? "2:1" : "1:1"),
					onChangeImageSize: pe,
					onChangeAspectRatio: me,
					batchCount: T.batchCount || 1,
					onChangeBatchCount: ge,
					cameraSettings: T.cameraSettings,
					onChangeCameraSettings: _e,
					videoResolution: T.videoResolution,
					videoFps: T.videoFps,
					videoFrames: T.videoFrames,
					onChangeVideoResolution: ve,
					onChangeVideoFps: be,
					seedanceResolution: T.seedanceResolution,
					seedanceRatio: T.seedanceRatio,
					seedanceDuration: T.seedanceDuration,
					generateAudio: T.generateAudio,
					videoReferences: T.videoReferences,
					onChangeVideoReferences: Oe,
					onChangeSeedanceResolution: Se,
					onChangeSeedanceRatio: q,
					onChangeSeedanceDuration: we,
					onChangeGenerateAudio: De,
					audioPurpose: Re,
					audioVoice: T.audioVoice ?? "alloy",
					audioFormat: T.audioFormat ?? "wav",
					audioSpeed: T.audioSpeed ?? 1,
					musicTitle: T.musicTitle ?? "",
					musicLyrics: T.musicLyrics ?? "",
					musicBpm: T.musicBpm,
					musicDuration: T.musicDuration ?? 60,
					autoGenerateLyrics: T.autoGenerateLyrics ?? !1,
					onChangeAudioVoice: ke,
					onChangeAudioFormat: Ae,
					onChangeAudioSpeed: J,
					onChangeMusicTitle: je,
					onChangeMusicLyrics: Me,
					onChangeMusicBpm: Ne,
					onChangeMusicDuration: Pe,
					onChangeAutoGenerateLyrics: Fe,
					workflows: b,
					selectedStyle: T.style,
					onStyleChange: Y
				})
			]
		})
	] });
}
var mt = (0, G.memo)(pt);
//#endregion
export { mt as default };
