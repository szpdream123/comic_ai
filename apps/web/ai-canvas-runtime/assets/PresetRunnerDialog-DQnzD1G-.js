import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./react-dom-BhFnNZvF.js";
import { t as r } from "./jsx-runtime-BAkIPmuO.js";
import { _i as i, hi as a, t as o } from "./useAppStore-CcUL4Jo0.js";
import { a as s, r as c } from "./ViewportImage-Dsz9jsTU.js";
import { A as l, D as u, M as d, T as f, Tt as p } from "./useTooltipAutoPlacement-BSvTkR9V.js";
import { n as m } from "./rasterImageDimensions-CX1VK2cM.js";
//#region src/components/nodes/shared/PresetRunnerDialog.tsx
var h = /* @__PURE__ */ e(t(), 1), g = n(), _ = r(), v = [], y = /* @__PURE__ */ new Map(), b = [], x = {
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
function S({ parameter: e, value: t, onChange: n }) {
	return e.type === "boolean" ? /* @__PURE__ */ (0, _.jsxs)("label", {
		className: "preset-runner-toggle",
		children: [
			/* @__PURE__ */ (0, _.jsx)("input", {
				type: "checkbox",
				checked: t === !0,
				onChange: (e) => n(e.target.checked)
			}),
			/* @__PURE__ */ (0, _.jsx)("span", {
				className: "preset-runner-toggle-track",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, _.jsx)("span", {})
			}),
			/* @__PURE__ */ (0, _.jsx)("span", { children: t === !0 ? "开启" : "关闭" })
		]
	}) : e.type === "select" ? /* @__PURE__ */ (0, _.jsxs)("select", {
		className: "preset-manager-input",
		value: String(t ?? ""),
		onChange: (e) => n(e.target.value),
		children: [/* @__PURE__ */ (0, _.jsx)("option", {
			value: "",
			children: "请选择"
		}), (e.options ?? []).filter(Boolean).map((e) => /* @__PURE__ */ (0, _.jsx)("option", {
			value: e,
			children: e
		}, e))]
	}) : e.type === "textarea" ? /* @__PURE__ */ (0, _.jsx)("textarea", {
		className: "preset-manager-input preset-runner-textarea",
		value: String(t ?? ""),
		placeholder: "输入" + e.label,
		onChange: (e) => n(e.target.value)
	}) : /* @__PURE__ */ (0, _.jsx)("input", {
		className: "preset-manager-input",
		type: e.type === "number" ? "number" : "text",
		value: String(t ?? ""),
		placeholder: "输入" + e.label,
		onChange: (e) => n(e.target.value)
	});
}
function C({ preset: e, sourceNode: t, onClose: n }) {
	let r = e.advanced?.parameters ?? v, s = e.advanced?.steps ?? b, [f, g] = (0, h.useState)(() => {
		let t = l(r), n = y.get(e.id);
		if (!n) return t;
		for (let e of r) e.key in n && (t[e.key] = n[e.key]);
		return t;
	}), C = o((e) => e.showToast), w = (0, h.useMemo)(() => d(r, f), [r, f]);
	return /* @__PURE__ */ (0, _.jsxs)(_.Fragment, { children: [/* @__PURE__ */ (0, _.jsx)(c.div, {
		"data-tauri-drag-region": !0,
		className: "preset-modal-overlay",
		initial: { opacity: 0 },
		animate: { opacity: 1 },
		exit: { opacity: 0 },
		onClick: n
	}), /* @__PURE__ */ (0, _.jsx)("div", {
		className: "preset-modal-wrapper",
		children: /* @__PURE__ */ (0, _.jsxs)(c.div, {
			className: "preset-modal preset-runner-modal",
			variants: x,
			initial: "hidden",
			animate: "visible",
			exit: "exit",
			role: "dialog",
			"aria-modal": "true",
			"aria-labelledby": "preset-runner-title",
			onClick: (e) => e.stopPropagation(),
			children: [
				/* @__PURE__ */ (0, _.jsxs)("header", {
					className: "preset-runner-header",
					children: [/* @__PURE__ */ (0, _.jsxs)("div", {
						className: "preset-runner-heading",
						children: [/* @__PURE__ */ (0, _.jsx)("span", {
							className: "preset-runner-heading-icon",
							children: /* @__PURE__ */ (0, _.jsx)(m, {
								icon: "mdi:play-sequence-outline",
								width: 20,
								height: 20
							})
						}), /* @__PURE__ */ (0, _.jsxs)("div", { children: [/* @__PURE__ */ (0, _.jsx)("h2", {
							id: "preset-runner-title",
							children: e.name
						}), /* @__PURE__ */ (0, _.jsxs)("p", { children: [
							"将从“",
							t.data.label || t.id,
							"”开始顺序执行"
						] })] })]
					}), /* @__PURE__ */ (0, _.jsx)(p, { onClick: n })]
				}),
				/* @__PURE__ */ (0, _.jsxs)("div", {
					className: "preset-runner-body",
					children: [r.length > 0 ? /* @__PURE__ */ (0, _.jsxs)("section", {
						className: "preset-runner-parameters",
						"aria-labelledby": "preset-runner-parameters-title",
						children: [/* @__PURE__ */ (0, _.jsxs)("div", {
							className: "preset-runner-section-heading",
							children: [/* @__PURE__ */ (0, _.jsx)("h3", {
								id: "preset-runner-parameters-title",
								children: "运行参数"
							}), /* @__PURE__ */ (0, _.jsxs)("span", { children: [r.filter((e) => e.required).length, " 项必填"] })]
						}), /* @__PURE__ */ (0, _.jsx)("div", {
							className: "preset-runner-fields",
							children: r.map((e) => /* @__PURE__ */ (0, _.jsxs)("label", {
								className: "preset-manager-field" + (e.type === "textarea" ? " preset-runner-field-wide" : ""),
								children: [/* @__PURE__ */ (0, _.jsxs)("span", {
									className: "preset-manager-label",
									children: [e.label, e.required ? /* @__PURE__ */ (0, _.jsx)("em", { children: "必填" }) : null]
								}), /* @__PURE__ */ (0, _.jsx)(S, {
									parameter: e,
									value: f[e.key],
									onChange: (t) => g((n) => ({
										...n,
										[e.key]: t
									}))
								})]
							}, e.id))
						})]
					}) : null, /* @__PURE__ */ (0, _.jsxs)("section", {
						className: "preset-runner-preview",
						"aria-labelledby": "preset-runner-preview-title",
						children: [
							/* @__PURE__ */ (0, _.jsxs)("div", {
								className: "preset-runner-section-heading",
								children: [/* @__PURE__ */ (0, _.jsx)("h3", {
									id: "preset-runner-preview-title",
									children: "执行预览"
								}), /* @__PURE__ */ (0, _.jsxs)("span", { children: [s.length, " 次模型生成"] })]
							}),
							/* @__PURE__ */ (0, _.jsx)("div", {
								className: "preset-runner-step-list",
								children: s.map((e, t) => {
									let n = i(e.nodeType);
									return /* @__PURE__ */ (0, _.jsxs)("div", {
										className: "preset-runner-step",
										children: [
											/* @__PURE__ */ (0, _.jsx)("span", {
												className: "preset-runner-step-icon " + n.bg + " " + n.color,
												children: /* @__PURE__ */ (0, _.jsx)(m, {
													icon: n.icon,
													width: 16,
													height: 16
												})
											}),
											/* @__PURE__ */ (0, _.jsx)("span", {
												className: "preset-runner-step-index",
												children: t + 1
											}),
											/* @__PURE__ */ (0, _.jsx)("span", {
												className: "preset-runner-step-name",
												children: e.name
											}),
											/* @__PURE__ */ (0, _.jsx)("span", {
												className: "preset-runner-step-type",
												children: a[e.nodeType].replace("预设", "")
											}),
											t < s.length - 1 ? /* @__PURE__ */ (0, _.jsx)(m, {
												className: "preset-runner-step-arrow",
												icon: "mdi:arrow-right",
												width: 15,
												height: 15
											}) : null
										]
									}, e.id);
								})
							}),
							/* @__PURE__ */ (0, _.jsxs)("div", {
								className: "preset-runner-notice",
								children: [/* @__PURE__ */ (0, _.jsx)(m, {
									icon: "mdi:information-outline",
									width: 16,
									height: 16
								}), /* @__PURE__ */ (0, _.jsx)("span", { children: "任一步失败后会停止执行；已完成节点和结果会保留。" })]
							})
						]
					})]
				}),
				/* @__PURE__ */ (0, _.jsxs)("footer", {
					className: "preset-modal-actions preset-runner-actions",
					children: [/* @__PURE__ */ (0, _.jsx)("span", { children: "每完成一个节点记录一次生成历史" }), /* @__PURE__ */ (0, _.jsxs)("div", { children: [/* @__PURE__ */ (0, _.jsx)("button", {
						type: "button",
						className: "preset-modal-btn-secondary",
						onClick: n,
						children: "取消"
					}), /* @__PURE__ */ (0, _.jsxs)("button", {
						type: "button",
						className: "preset-modal-btn-primary",
						disabled: s.length === 0,
						onClick: () => {
							if (w[0]) {
								C(w[0], "error");
								return;
							}
							y.set(e.id, f), n(), u({
								preset: e,
								sourceNodeId: t.id,
								values: f
							}).then((e) => {
								!e.success && e.failedStepIndex === void 0 && e.message && o.getState().showToast(e.message, "error");
							});
						},
						children: [/* @__PURE__ */ (0, _.jsx)(m, {
							icon: "mdi:play",
							width: 15,
							height: 15
						}), /* @__PURE__ */ (0, _.jsxs)("span", { children: [
							"开始执行 ",
							s.length,
							" 步"
						] })]
					})] })]
				})
			]
		})
	})] });
}
function w() {
	let e = o((e) => e.presetRunRequest), t = o((t) => e ? t.userPresets.find((t) => t.id === e.presetId) : void 0), n = o((t) => e ? t.nodes.find((t) => t.id === e.sourceNodeId) : void 0), r = o((e) => e.setPresetRunRequest);
	return (0, h.useEffect)(() => {
		e && (!t || !n || !f(t)) && r(null);
	}, [
		t,
		e,
		r,
		n
	]), (0, g.createPortal)(/* @__PURE__ */ (0, _.jsx)(s, { children: e && t && n && f(t) ? /* @__PURE__ */ (0, _.jsx)(C, {
		preset: t,
		sourceNode: n,
		onClose: () => r(null)
	}, e.presetId + ":" + e.sourceNodeId) : null }), document.body);
}
//#endregion
export { w as default };
