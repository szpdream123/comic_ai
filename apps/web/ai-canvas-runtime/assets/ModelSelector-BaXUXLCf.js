import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./jsx-runtime-BAkIPmuO.js";
import { a as r } from "./i18n-on3r1DCI.js";
import { t as i, vi as a } from "./useAppStore-CcUL4Jo0.js";
import { Et as o, Ot as s, kt as c } from "./useTooltipAutoPlacement-BSvTkR9V.js";
//#region src/components/nodes/shared/ModelSelector.tsx
var l = /* @__PURE__ */ e(t(), 1), u = n(), d = "canvas-model-prefs", f = {
	"ai-panorama": "ai-image",
	"ai-animation": "ai-image",
	"ai-shotlist": "ai-text"
};
function p() {
	try {
		let e = localStorage.getItem(d);
		return e ? JSON.parse(e) : {};
	} catch {
		return {};
	}
}
function m(e, t) {
	try {
		let n = p();
		n[e] = t, e === "ai-image" && (n["ai-panorama"] = t), localStorage.setItem(d, JSON.stringify(n));
	} catch {}
}
function h({ nodeType: e, selectedModel: t, selectedWorkflowId: n, onSelect: d, onWorkflowSelect: h, groups: g = o, workflows: _ = [], generalModelsOverride: v, groupAvailability: y, defaultExpandedGroupIds: b = [] }) {
	let x = r(), [S, C] = (0, l.useState)(!1), w = f[e] ?? e, T = i((e) => e.config), E = T.providers, D = T.generalModels || [], O = !!T.dreaminaAuth?.loggedIn, k = v ?? D, A = (0, l.useMemo)(() => s(T, w, g, { filterSelectedModels: g === o }), [
		T,
		g,
		w
	]), j = (0, l.useMemo)(() => c(k, T, w, {
		genericName: x("通用模型"),
		genericDescription: x("用户自定义的兼容接口模型")
	}), [
		T,
		k,
		w,
		x
	]), M = (0, l.useMemo)(() => [...A, ...j], [A, j]), [N, P] = (0, l.useState)(() => {
		let e = M.map((e) => ({
			...e,
			models: e.models.filter((e) => e.nodeTypes.includes(w))
		})).filter((e) => e.models.length > 0).map((e) => e.id).filter((e) => !b.includes(e) && e !== "general-models");
		return new Set(e);
	}), F = (0, l.useCallback)((e) => e === "general-models" || e.startsWith("general-provider-") ? !0 : y && e in y ? y[e] : e === "dreamina" ? O : !!E[e === "runninghubwf" ? "runninghub" : e === "runninghub" ? "runninghub-model" : e]?.apiKey, [
		E,
		O,
		y
	]), I = (0, l.useRef)(null), L = (0, l.useRef)(null), [R, z] = (0, l.useState)("up"), [B, V] = (0, l.useState)(!1);
	(0, l.useLayoutEffect)(() => {
		if (!S) return;
		let e = requestAnimationFrame(() => {
			let e = I.current?.querySelector(".model-selector-trigger");
			if (!e) return;
			let t = e.getBoundingClientRect(), n = window.innerHeight, r = window.innerWidth, i = t.top - 8;
			if (i < 360) {
				let e = n - t.bottom - 8;
				z(e >= 360 || e > i ? "down" : "up");
			} else z("up");
			t.left + 280 > r - 8 ? V(!0) : V(!1);
		});
		return () => cancelAnimationFrame(e);
	}, [S]), (0, l.useEffect)(() => {
		let e = (e) => {
			I.current && !I.current.contains(e.target) && C(!1);
		};
		return S && document.addEventListener("mousedown", e, !0), () => document.removeEventListener("mousedown", e, !0);
	}, [S]), (0, l.useEffect)(() => {
		let e = (e) => {
			e.key === "Escape" && C(!1);
		};
		return S && window.addEventListener("keydown", e), () => window.removeEventListener("keydown", e);
	}, [S]);
	let H = M.map((e) => ({
		...e,
		models: e.models.filter((e) => e.nodeTypes.includes(w))
	})).filter((e) => e.models.length > 0), U = (0, l.useMemo)(() => {
		let n = p(), r = f[e];
		return t || n[e] || (r ? n[r] : void 0) || void 0;
	}, [t, e]), W = U ? H.flatMap((e) => e.models).find((e) => e.value === U) : void 0, G = a(e), K = (0, l.useMemo)(() => G ? _.filter((e) => e.category === G) : [], [_, G]), q = n ? K.find((e) => e.id === n) : void 0, J = q ? q.name : W?.label ?? x("选择模型"), Y = (e) => {
		F(e) && P((t) => {
			let n = new Set(t);
			return n.has(e) ? n.delete(e) : n.add(e), n;
		});
	};
	return /* @__PURE__ */ (0, u.jsxs)("div", {
		className: "model-selector",
		ref: I,
		children: [/* @__PURE__ */ (0, u.jsxs)("button", {
			type: "button",
			className: `model-selector-trigger${n ? " has-workflow" : ""}${W ? " has-model" : ""}`,
			onClick: (e) => {
				e.stopPropagation(), C(!S);
			},
			children: [
				/* @__PURE__ */ (0, u.jsx)("span", {
					className: "model-selector-icon",
					children: n ? /* @__PURE__ */ (0, u.jsxs)("svg", {
						width: "14",
						height: "14",
						viewBox: "0 0 24 24",
						fill: "none",
						stroke: "currentColor",
						strokeWidth: "2",
						children: [/* @__PURE__ */ (0, u.jsx)("path", { d: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20" }), /* @__PURE__ */ (0, u.jsx)("path", { d: "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" })]
					}) : W?.badgeText ? /* @__PURE__ */ (0, u.jsx)("span", {
						className: "text-model-icon text-model-icon-mini",
						"data-badge": W.badgeText,
						children: W.badgeText
					}) : null
				}),
				/* @__PURE__ */ (0, u.jsx)("span", {
					className: "model-selector-label",
					children: J
				}),
				/* @__PURE__ */ (0, u.jsx)("svg", {
					className: "caret",
					width: "10",
					height: "10",
					viewBox: "0 0 24 24",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: "2",
					children: /* @__PURE__ */ (0, u.jsx)("polyline", { points: "6 9 12 15 18 9" })
				})
			]
		}), S && /* @__PURE__ */ (0, u.jsxs)("div", {
			ref: L,
			className: `model-dropdown${R === "down" ? " drop-down" : ""}${B ? " drop-align-right" : ""}`,
			children: [H.map((t) => {
				let n = N.has(t.id), r = t.models.some((e) => e.value === U), i = F(t.id);
				return /* @__PURE__ */ (0, u.jsxs)("div", {
					className: `model-group${r ? " has-active" : ""}`,
					children: [/* @__PURE__ */ (0, u.jsxs)("button", {
						type: "button",
						className: `model-group-header${i ? "" : " disabled"}`,
						"data-tooltip": i ? void 0 : x("请先在设置中配置 {name} API Key", { name: t.name }),
						onClick: (e) => {
							e.stopPropagation(), Y(t.id);
						},
						children: [
							t.iconType === "badge" && t.badgeText && /* @__PURE__ */ (0, u.jsx)("span", {
								className: "text-model-icon text-model-icon-badge",
								"data-badge": t.badgeText,
								children: t.badgeText
							}),
							/* @__PURE__ */ (0, u.jsxs)("div", {
								className: "model-group-info",
								children: [/* @__PURE__ */ (0, u.jsx)("div", {
									className: "model-group-name",
									children: t.name
								}), /* @__PURE__ */ (0, u.jsx)("div", {
									className: "model-group-desc",
									children: t.description
								})]
							}),
							i ? /* @__PURE__ */ (0, u.jsx)("svg", {
								className: `model-group-chevron${n ? " collapsed" : ""}`,
								width: "12",
								height: "12",
								viewBox: "0 0 24 24",
								fill: "none",
								stroke: "currentColor",
								strokeWidth: "2",
								children: /* @__PURE__ */ (0, u.jsx)("polyline", { points: "6 9 12 15 18 9" })
							}) : /* @__PURE__ */ (0, u.jsxs)("svg", {
								className: "model-lock-icon",
								width: "12",
								height: "12",
								viewBox: "0 0 24 24",
								fill: "none",
								stroke: "currentColor",
								strokeWidth: "2",
								children: [/* @__PURE__ */ (0, u.jsx)("rect", {
									x: "3",
									y: "11",
									width: "18",
									height: "11",
									rx: "2",
									ry: "2"
								}), /* @__PURE__ */ (0, u.jsx)("path", { d: "M7 11V7a5 5 0 0 1 10 0v4" })]
							})
						]
					}), /* @__PURE__ */ (0, u.jsx)("div", {
						className: `model-group-items${n ? " collapsed" : ""}`,
						children: t.models.map((t) => /* @__PURE__ */ (0, u.jsxs)("button", {
							type: "button",
							className: `model-item${U === t.value ? " active" : ""}${i ? "" : " disabled"}`,
							onClick: (n) => {
								n.stopPropagation(), i && (m(e, t.value), d(t), h?.(void 0), C(!1));
							},
							children: [
								t.iconType === "badge" && t.badgeText && /* @__PURE__ */ (0, u.jsx)("span", {
									className: "text-model-icon text-model-icon-mini",
									"data-badge": t.badgeText,
									children: t.badgeText
								}),
								/* @__PURE__ */ (0, u.jsxs)("div", {
									className: "model-item-info",
									children: [/* @__PURE__ */ (0, u.jsx)("div", {
										className: "model-item-name",
										children: t.label
									}), t.description && /* @__PURE__ */ (0, u.jsx)("div", {
										className: "model-item-desc",
										children: t.description
									})]
								}),
								U === t.value && /* @__PURE__ */ (0, u.jsx)("svg", {
									className: "model-item-check",
									width: "14",
									height: "14",
									viewBox: "0 0 24 24",
									fill: "none",
									stroke: "currentColor",
									strokeWidth: "2.5",
									children: /* @__PURE__ */ (0, u.jsx)("polyline", { points: "20 6 9 17 4 12" })
								})
							]
						}, t.value))
					})]
				}, t.id);
			}), G && h && /* @__PURE__ */ (0, u.jsxs)("div", {
				className: "model-group model-group-wf",
				children: [/* @__PURE__ */ (0, u.jsxs)("div", {
					className: "model-group-header",
					children: [/* @__PURE__ */ (0, u.jsx)("span", {
						className: "text-model-icon text-model-icon-wf",
						children: /* @__PURE__ */ (0, u.jsxs)("svg", {
							width: "12",
							height: "12",
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							strokeWidth: "2",
							children: [/* @__PURE__ */ (0, u.jsx)("path", { d: "M4 19.5A2.5 2.5 0 0 1 6.5 17H20" }), /* @__PURE__ */ (0, u.jsx)("path", { d: "M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" })]
						})
					}), /* @__PURE__ */ (0, u.jsxs)("div", {
						className: "model-group-info",
						children: [/* @__PURE__ */ (0, u.jsx)("div", {
							className: "model-group-name",
							children: x("ComfyUI 工作流")
						}), /* @__PURE__ */ (0, u.jsx)("div", {
							className: "model-group-desc",
							children: x("用户导入的本地工作流")
						})]
					})]
				}), /* @__PURE__ */ (0, u.jsx)("div", {
					className: "model-group-items",
					children: K.length === 0 ? /* @__PURE__ */ (0, u.jsxs)("div", {
						className: "model-wf-empty",
						children: [/* @__PURE__ */ (0, u.jsxs)("svg", {
							width: "16",
							height: "16",
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							strokeWidth: "1.5",
							children: [
								/* @__PURE__ */ (0, u.jsx)("circle", {
									cx: "12",
									cy: "12",
									r: "10"
								}),
								/* @__PURE__ */ (0, u.jsx)("line", {
									x1: "12",
									y1: "8",
									x2: "12",
									y2: "12"
								}),
								/* @__PURE__ */ (0, u.jsx)("line", {
									x1: "12",
									y1: "16",
									x2: "12.01",
									y2: "16"
								})
							]
						}), /* @__PURE__ */ (0, u.jsx)("span", { children: x("暂无匹配的工作流，请在设置中导入") })]
					}) : /* @__PURE__ */ (0, u.jsx)(u.Fragment, { children: K.map((e) => /* @__PURE__ */ (0, u.jsxs)("button", {
						type: "button",
						className: `model-item${n === e.id ? " active" : ""}`,
						onClick: (t) => {
							t.stopPropagation(), h(e.id), C(!1);
						},
						children: [
							/* @__PURE__ */ (0, u.jsx)("span", { className: "text-model-icon text-model-icon-mini wf-dot" }),
							/* @__PURE__ */ (0, u.jsxs)("div", {
								className: "model-item-info",
								children: [/* @__PURE__ */ (0, u.jsx)("div", {
									className: "model-item-name",
									children: e.name
								}), e.fileName && /* @__PURE__ */ (0, u.jsx)("div", {
									className: "model-item-desc",
									children: e.fileName
								})]
							}),
							n === e.id && /* @__PURE__ */ (0, u.jsx)("svg", {
								className: "model-item-check",
								width: "14",
								height: "14",
								viewBox: "0 0 24 24",
								fill: "none",
								stroke: "currentColor",
								strokeWidth: "2.5",
								children: /* @__PURE__ */ (0, u.jsx)("polyline", { points: "20 6 9 17 4 12" })
							})
						]
					}, e.id)) })
				})]
			})]
		})]
	});
}
//#endregion
export { h as t };
