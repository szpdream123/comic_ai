import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./jsx-runtime-BAkIPmuO.js";
import { Ot as r, ht as i, pt as a, si as o, t as s } from "./useAppStore-BH-MdRLu.js";
import { a as c, r as l } from "./ViewportImage-txaOn4PW.js";
import { Nt as ee, qt as te } from "./useTooltipAutoPlacement-D1FArkVS.js";
import { t as u } from "./Select-BkJW9F-N.js";
//#region src/components/WorkflowPanel.tsx
var d = /* @__PURE__ */ e(t(), 1), f = n(), p = [
	{
		value: "ai-text",
		label: "生成文本"
	},
	{
		value: "ai-image",
		label: "生成图像"
	},
	{
		value: "ai-video",
		label: "生成视频"
	},
	{
		value: "ai-audio",
		label: "生成音频"
	}
];
function m() {
	return new Promise((e) => {
		let t = document.createElement("input");
		t.type = "file", t.accept = ".json", t.style.display = "none", document.body.appendChild(t), t.addEventListener("change", () => {
			document.body.removeChild(t), e(t.files?.[0] ?? null);
		}), t.addEventListener("cancel", () => {
			document.body.removeChild(t), e(null);
		}), t.click();
	});
}
var ne = [{
	value: "all",
	label: "全部"
}, ...p], h = {
	"ai-text": "text",
	"ai-image": "image",
	"ai-video": "video",
	"ai-audio": "audio"
};
function g(e) {
	let t = h[e];
	return t ? ` wf-cat-chip--${t}` : "";
}
var _ = {
	prompt: "📝",
	image: "🖼️",
	video: "🎬",
	audio: "🎵"
}, v = {
	prompt: "文本",
	image: "图片",
	video: "视频",
	audio: "音频"
}, y = {
	hidden: { opacity: 0 },
	visible: { opacity: 1 }
}, b = {
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
}, x = {
	hidden: {
		opacity: 0,
		y: 6
	},
	visible: (e) => ({
		opacity: 1,
		y: 0,
		transition: {
			delay: e * .04,
			duration: .2,
			ease: [
				.16,
				1,
				.3,
				1
			]
		}
	})
};
function S() {
	let { workflows: e, workflowPanelOpen: t, setWorkflowPanelOpen: n, addWorkflow: h, deleteWorkflow: S, updateWorkflow: C, resetBuiltIns: w, comfyServers: T, showToast: E } = s(te((e) => ({
		workflows: e.workflows,
		workflowPanelOpen: e.workflowPanelOpen,
		setWorkflowPanelOpen: e.setWorkflowPanelOpen,
		addWorkflow: e.addWorkflow,
		deleteWorkflow: e.deleteWorkflow,
		updateWorkflow: e.updateWorkflow,
		resetBuiltIns: e.resetBuiltInWorkflows,
		comfyServers: e.config.comfyServers,
		showToast: e.showToast
	}))), [D, O] = (0, d.useState)(""), [k, A] = (0, d.useState)("ai-text"), [j, M] = (0, d.useState)(""), [N, P] = (0, d.useState)(""), [F, I] = (0, d.useState)([]), [L, re] = (0, d.useState)("all"), [R, z] = (0, d.useState)(() => /* @__PURE__ */ new Set()), [B, V] = (0, d.useState)(""), [H, U] = (0, d.useState)(""), [W, G] = (0, d.useState)(!1), [K, q] = (0, d.useState)(!1), J = (0, d.useRef)(null);
	(0, d.useEffect)(() => {
		if (!t) return;
		let e = (e) => {
			e.key === "Escape" && n(!1);
		};
		return window.addEventListener("keydown", e), () => window.removeEventListener("keydown", e);
	}, [t, n]);
	let Y = (0, d.useCallback)(() => {
		O(""), M(""), P(""), I([]), V(""), U("");
	}, []), ie = (0, d.useCallback)(() => {
		n(!1), setTimeout(Y, 200);
	}, [n, Y]), X = (0, d.useCallback)(async (e) => {
		if (V(""), U(""), !/\.json$/i.test(e.name)) {
			V("请选择 ComfyUI 导出的 .json 文件");
			return;
		}
		try {
			let t = await e.text(), n = JSON.parse(t);
			if (!n || typeof n != "object") {
				V("不是有效的 JSON 文件");
				return;
			}
			M(e.name), P(t), I(a(t)), O((t) => t || e.name.replace(/\.json$/i, ""));
		} catch {
			V("JSON 解析失败，请检查文件格式");
		}
	}, []), Z = (0, d.useCallback)(async () => {
		let e = await m();
		e && await X(e);
	}, [X]), ae = (0, d.useCallback)((e) => {
		e.preventDefault(), G(!1);
		let t = e.dataTransfer.files?.[0];
		t && X(t);
	}, [X]), oe = (0, d.useCallback)((e) => {
		e.stopPropagation(), M(""), P(""), I([]), V("");
	}, []), se = (0, d.useCallback)(async () => {
		if (!N) {
			V("请先选择一个工作流文件");
			return;
		}
		if (!D.trim()) {
			V("请输入工作流名称");
			return;
		}
		let e = {
			id: `wf-${o()}`,
			name: D.trim(),
			category: k,
			fileName: j,
			fileContent: N,
			ioNodes: F,
			createdAt: Date.now()
		};
		try {
			await h(e), Y(), U(`"${e.name}" 已添加`), setTimeout(() => U(""), 2500);
		} catch {
			V("保存工作流失败，请重试");
		}
	}, [
		N,
		D,
		k,
		j,
		F,
		h,
		Y
	]), ce = (0, d.useCallback)((e, t) => {
		t.stopPropagation(), S(e);
	}, [S]), le = (0, d.useCallback)((e, t) => {
		let n = { ...e.defaultNodes }, r = n[t.type] === t.nodeId;
		r ? delete n[t.type] : n[t.type] = t.nodeId, C(e.id, { defaultNodes: n }).then(() => E(r ? `已取消默认${v[t.type]}节点` : `“${t.title}”已设为默认${v[t.type]}节点`, "success")).catch(() => E("保存默认节点失败", "error"));
	}, [C, E]), ue = (0, d.useCallback)((e) => {
		z((t) => {
			let n = new Set(t);
			return n.has(e) ? n.delete(e) : n.add(e), n;
		});
	}, []), Q = (0, d.useCallback)(async (e, t) => {
		t.stopPropagation();
		try {
			let t = await i(r(e.id) || "http://127.0.0.1:8188", e);
			t.length > 0 && E(`已打开，但 ComfyUI 缺少这些节点：${t.join("、")}`, "error");
		} catch (e) {
			E(typeof e == "string" ? e : e instanceof Error ? e.message : "无法在 ComfyUI 中打开工作流", "error");
		}
	}, [E]), de = (0, d.useCallback)(() => {
		if (!K) {
			q(!0), setTimeout(() => q(!1), 4e3);
			return;
		}
		q(!1), w().then((e) => E(`已恢复 ${e} 个内置工作流`, "success")).catch(() => E("恢复内置工作流失败", "error"));
	}, [
		K,
		w,
		E
	]), $ = p.filter((e) => L === "all" || e.value === L).map((t) => ({
		...t,
		items: e.filter((e) => e.category === t.value)
	})).filter((e) => e.items.length > 0);
	return /* @__PURE__ */ (0, f.jsx)(c, { children: t && /* @__PURE__ */ (0, f.jsxs)(f.Fragment, { children: [/* @__PURE__ */ (0, f.jsx)(l.div, {
		"data-tauri-drag-region": !0,
		className: "wf-panel-backdrop",
		variants: y,
		initial: "hidden",
		animate: "visible",
		exit: "hidden",
		transition: { duration: .2 }
	}), /* @__PURE__ */ (0, f.jsx)("div", {
		className: "wf-panel-wrapper",
		children: /* @__PURE__ */ (0, f.jsxs)(l.div, {
			ref: J,
			className: "wf-panel",
			variants: b,
			initial: "hidden",
			animate: "visible",
			exit: "exit",
			onClick: (e) => e.stopPropagation(),
			children: [/* @__PURE__ */ (0, f.jsxs)("div", {
				className: "wf-panel-card wf-panel-import",
				children: [
					/* @__PURE__ */ (0, f.jsx)("span", {
						className: "wf-section-title",
						children: "导入 ComfyUI 工作流"
					}),
					/* @__PURE__ */ (0, f.jsx)("div", { className: "wf-section-rule" }),
					/* @__PURE__ */ (0, f.jsxs)("div", {
						className: "wf-field",
						children: [/* @__PURE__ */ (0, f.jsx)("label", {
							className: "wf-label",
							children: "工作流名称"
						}), /* @__PURE__ */ (0, f.jsx)("input", {
							type: "text",
							className: "wf-input",
							placeholder: "为你的工作流命名",
							value: D,
							onChange: (e) => O(e.target.value)
						})]
					}),
					/* @__PURE__ */ (0, f.jsxs)("div", {
						className: "wf-field",
						children: [/* @__PURE__ */ (0, f.jsx)("label", {
							className: "wf-label",
							children: "分类"
						}), /* @__PURE__ */ (0, f.jsx)("div", {
							className: "wf-category-row",
							children: p.map((e) => /* @__PURE__ */ (0, f.jsx)(l.button, {
								type: "button",
								className: `wf-cat-chip${g(e.value)} ${k === e.value ? "active" : ""}`,
								onClick: () => A(e.value),
								whileHover: { scale: 1.04 },
								whileTap: { scale: .96 },
								children: e.label
							}, e.value))
						})]
					}),
					/* @__PURE__ */ (0, f.jsxs)("div", {
						className: "wf-field",
						children: [
							/* @__PURE__ */ (0, f.jsx)("label", {
								className: "wf-label",
								children: "工作流文件"
							}),
							/* @__PURE__ */ (0, f.jsxs)(l.div, {
								className: `ui-dropzone${W ? " is-dragover" : ""}`,
								role: "button",
								tabIndex: 0,
								onClick: Z,
								onKeyDown: (e) => {
									(e.key === "Enter" || e.key === " ") && (e.preventDefault(), Z());
								},
								onDragOver: (e) => {
									e.preventDefault(), G(!0);
								},
								onDragLeave: () => G(!1),
								onDrop: ae,
								whileTap: { scale: .995 },
								children: [
									/* @__PURE__ */ (0, f.jsx)("span", {
										className: "ui-dropzone__title",
										children: "把工作流文件拖到这里"
									}),
									/* @__PURE__ */ (0, f.jsx)("span", {
										className: "ui-dropzone__icon",
										"aria-hidden": "true",
										children: /* @__PURE__ */ (0, f.jsxs)("svg", {
											width: "22",
											height: "22",
											viewBox: "0 0 24 24",
											fill: "none",
											stroke: "currentColor",
											strokeWidth: "2",
											strokeLinecap: "round",
											strokeLinejoin: "round",
											children: [
												/* @__PURE__ */ (0, f.jsx)("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
												/* @__PURE__ */ (0, f.jsx)("polyline", { points: "17 8 12 3 7 8" }),
												/* @__PURE__ */ (0, f.jsx)("line", {
													x1: "12",
													y1: "3",
													x2: "12",
													y2: "15"
												})
											]
										})
									}),
									/* @__PURE__ */ (0, f.jsx)("span", {
										className: "ui-dropzone__hint",
										children: "支持 ComfyUI 导出的 .json 工作流文件，点击这里也可以选择。"
									})
								]
							}),
							N && /* @__PURE__ */ (0, f.jsxs)("div", {
								className: "wf-file-card",
								children: [
									/* @__PURE__ */ (0, f.jsx)("span", {
										className: "wf-file-card-icon",
										"aria-hidden": "true",
										children: /* @__PURE__ */ (0, f.jsxs)("svg", {
											width: "16",
											height: "16",
											viewBox: "0 0 24 24",
											fill: "none",
											stroke: "currentColor",
											strokeWidth: "2",
											children: [
												/* @__PURE__ */ (0, f.jsx)("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }),
												/* @__PURE__ */ (0, f.jsx)("polyline", { points: "14 2 14 8 20 8" }),
												/* @__PURE__ */ (0, f.jsx)("line", {
													x1: "16",
													y1: "13",
													x2: "8",
													y2: "13"
												}),
												/* @__PURE__ */ (0, f.jsx)("line", {
													x1: "16",
													y1: "17",
													x2: "8",
													y2: "17"
												})
											]
										})
									}),
									/* @__PURE__ */ (0, f.jsxs)("span", {
										className: "wf-file-card-info",
										children: [/* @__PURE__ */ (0, f.jsx)("span", {
											className: "wf-file-card-name",
											title: j,
											children: j
										}), /* @__PURE__ */ (0, f.jsxs)("span", {
											className: "wf-file-card-meta",
											children: [
												"JSON · ",
												Math.max(1, Math.round(N.length / 1024)),
												" KB · ",
												F.length,
												" 个输入输出节点"
											]
										})]
									}),
									/* @__PURE__ */ (0, f.jsx)("button", {
										type: "button",
										className: "wf-file-card-clear",
										"aria-label": "移除已选文件",
										onClick: oe,
										children: /* @__PURE__ */ (0, f.jsxs)("svg", {
											width: "14",
											height: "14",
											viewBox: "0 0 24 24",
											fill: "none",
											stroke: "currentColor",
											strokeWidth: "2",
											strokeLinecap: "round",
											children: [/* @__PURE__ */ (0, f.jsx)("line", {
												x1: "18",
												y1: "6",
												x2: "6",
												y2: "18"
											}), /* @__PURE__ */ (0, f.jsx)("line", {
												x1: "6",
												y1: "6",
												x2: "18",
												y2: "18"
											})]
										})
									})
								]
							}),
							/* @__PURE__ */ (0, f.jsx)(c, { children: F.length > 0 && /* @__PURE__ */ (0, f.jsx)(l.div, {
								className: "wf-ionodes-preview",
								initial: {
									opacity: 0,
									y: -4
								},
								animate: {
									opacity: 1,
									y: 0
								},
								transition: { duration: .2 },
								children: F.map((e, t) => /* @__PURE__ */ (0, f.jsxs)("span", {
									className: `wf-ionode-badge wf-ionode-${e.type}`,
									children: [
										_[e.type],
										" ",
										e.title,
										/* @__PURE__ */ (0, f.jsxs)("code", { children: ["#", e.nodeId] })
									]
								}, t))
							}) })
						]
					}),
					/* @__PURE__ */ (0, f.jsxs)("div", {
						className: "wf-actions-row",
						children: [
							/* @__PURE__ */ (0, f.jsx)(l.button, {
								type: "button",
								className: "wf-btn wf-btn-ghost",
								onClick: Y,
								disabled: !N && !D,
								whileHover: N || D ? { scale: 1.03 } : {},
								whileTap: N || D ? { scale: .97 } : {},
								children: "取消"
							}),
							/* @__PURE__ */ (0, f.jsxs)(l.button, {
								type: "button",
								className: "wf-btn wf-btn-primary",
								onClick: () => void se(),
								disabled: !N,
								whileHover: N ? { scale: 1.03 } : {},
								whileTap: N ? { scale: .97 } : {},
								children: [/* @__PURE__ */ (0, f.jsxs)("svg", {
									width: "14",
									height: "14",
									viewBox: "0 0 24 24",
									fill: "none",
									stroke: "currentColor",
									strokeWidth: "2",
									children: [/* @__PURE__ */ (0, f.jsx)("line", {
										x1: "12",
										y1: "5",
										x2: "12",
										y2: "19"
									}), /* @__PURE__ */ (0, f.jsx)("line", {
										x1: "5",
										y1: "12",
										x2: "19",
										y2: "12"
									})]
								}), "添加工作流"]
							}),
							/* @__PURE__ */ (0, f.jsxs)(c, { children: [B && /* @__PURE__ */ (0, f.jsx)(l.span, {
								className: "wf-msg wf-msg-error",
								initial: {
									opacity: 0,
									x: -8
								},
								animate: {
									opacity: 1,
									x: 0
								},
								exit: {
									opacity: 0,
									x: -8
								},
								children: B
							}), H && /* @__PURE__ */ (0, f.jsx)(l.span, {
								className: "wf-msg wf-msg-success",
								initial: {
									opacity: 0,
									x: -8
								},
								animate: {
									opacity: 1,
									x: 0
								},
								exit: {
									opacity: 0,
									x: -8
								},
								children: H
							})] })
						]
					})
				]
			}), /* @__PURE__ */ (0, f.jsxs)("div", {
				className: "wf-panel-card wf-panel-list",
				children: [
					/* @__PURE__ */ (0, f.jsxs)("div", {
						className: "wf-list-titlebar",
						children: [
							/* @__PURE__ */ (0, f.jsx)("h2", {
								className: "wf-panel-title",
								children: "工作流管理"
							}),
							/* @__PURE__ */ (0, f.jsxs)(l.button, {
								type: "button",
								className: `wf-reset-btn${K ? " is-armed" : ""}`,
								onClick: de,
								"data-tooltip": "把随包发布的内置工作流恢复回来（删掉的补回，改过的覆盖）",
								"data-tooltip-pos": "bottom",
								whileHover: { scale: 1.03 },
								whileTap: { scale: .97 },
								children: [/* @__PURE__ */ (0, f.jsxs)("svg", {
									width: "13",
									height: "13",
									viewBox: "0 0 24 24",
									fill: "none",
									stroke: "currentColor",
									strokeWidth: "2",
									strokeLinecap: "round",
									children: [/* @__PURE__ */ (0, f.jsx)("polyline", { points: "1 4 1 10 7 10" }), /* @__PURE__ */ (0, f.jsx)("path", { d: "M3.51 15a9 9 0 1 0 2.13-9.36L1 10" })]
								}), K ? "再点一次确认" : "重置内置工作流"]
							}),
							/* @__PURE__ */ (0, f.jsx)(ee, { onClick: ie })
						]
					}),
					/* @__PURE__ */ (0, f.jsxs)("div", {
						className: "wf-list-header",
						children: [/* @__PURE__ */ (0, f.jsxs)("span", {
							className: "wf-section-title",
							children: ["已导入工作流", /* @__PURE__ */ (0, f.jsx)("span", {
								className: "wf-count",
								children: e.length
							})]
						}), /* @__PURE__ */ (0, f.jsx)("div", {
							className: "wf-filter-row",
							children: ne.map((e) => /* @__PURE__ */ (0, f.jsx)("button", {
								type: "button",
								className: `wf-cat-chip wf-filter-chip${g(e.value)} ${L === e.value ? "active" : ""}`,
								onClick: () => re(e.value),
								children: e.label
							}, e.value))
						})]
					}),
					/* @__PURE__ */ (0, f.jsx)("div", { className: "wf-section-rule" }),
					/* @__PURE__ */ (0, f.jsxs)("div", {
						className: "wf-list-scroll",
						children: [/* @__PURE__ */ (0, f.jsxs)("p", {
							className: "wf-hint",
							role: "note",
							children: [/* @__PURE__ */ (0, f.jsxs)("svg", {
								width: "14",
								height: "14",
								viewBox: "0 0 24 24",
								fill: "none",
								stroke: "currentColor",
								strokeWidth: "2",
								"aria-hidden": "true",
								children: [
									/* @__PURE__ */ (0, f.jsx)("path", { d: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0Z" }),
									/* @__PURE__ */ (0, f.jsx)("line", {
										x1: "12",
										y1: "9",
										x2: "12",
										y2: "13"
									}),
									/* @__PURE__ */ (0, f.jsx)("line", {
										x1: "12",
										y1: "17",
										x2: "12.01",
										y2: "17"
									})
								]
							}), /* @__PURE__ */ (0, f.jsxs)("span", { children: [
								"未设置默认节点时，ComfyUI 调用需要在提示词中 ",
								/* @__PURE__ */ (0, f.jsx)("code", {
									className: "wf-hint-code",
									children: "@对应节点"
								}),
								"，提示词或参考图才会写入对应输入。展开下方工作流卡片，点击节点徽章设为该类型默认节点（显示为 ",
								/* @__PURE__ */ (0, f.jsx)("code", {
									className: "wf-hint-code",
									children: "★"
								}),
								"），调用时即可自动注入，无须每次 ",
								/* @__PURE__ */ (0, f.jsx)("code", {
									className: "wf-hint-code",
									children: "@"
								}),
								"。"
							] })]
						}), /* @__PURE__ */ (0, f.jsx)(c, {
							mode: "popLayout",
							children: e.length > 0 && $.length === 0 ? /* @__PURE__ */ (0, f.jsx)(l.div, {
								className: "wf-empty",
								initial: { opacity: 0 },
								animate: { opacity: 1 },
								children: /* @__PURE__ */ (0, f.jsx)("span", { children: "该分类下暂无工作流" })
							}, "filtered-empty") : e.length === 0 ? /* @__PURE__ */ (0, f.jsxs)(l.div, {
								className: "wf-empty",
								initial: {
									opacity: 0,
									y: 8
								},
								animate: {
									opacity: 1,
									y: 0
								},
								transition: { duration: .3 },
								children: [/* @__PURE__ */ (0, f.jsxs)("svg", {
									width: "32",
									height: "32",
									viewBox: "0 0 24 24",
									fill: "none",
									stroke: "currentColor",
									strokeWidth: "1",
									opacity: "0.4",
									children: [
										/* @__PURE__ */ (0, f.jsx)("rect", {
											x: "3",
											y: "3",
											width: "18",
											height: "18",
											rx: "2",
											ry: "2"
										}),
										/* @__PURE__ */ (0, f.jsx)("line", {
											x1: "3",
											y1: "9",
											x2: "21",
											y2: "9"
										}),
										/* @__PURE__ */ (0, f.jsx)("line", {
											x1: "9",
											y1: "21",
											x2: "9",
											y2: "9"
										})
									]
								}), /* @__PURE__ */ (0, f.jsx)("span", { children: "暂无工作流，请导入 ComfyUI 工作流文件" })]
							}, "empty") : /* @__PURE__ */ (0, f.jsx)(l.div, {
								className: "wf-list",
								children: $.map((e, t) => /* @__PURE__ */ (0, f.jsxs)(l.div, {
									className: "wf-group",
									variants: x,
									initial: "hidden",
									animate: "visible",
									custom: t,
									children: [/* @__PURE__ */ (0, f.jsxs)("div", {
										className: "wf-group-header",
										children: [
											/* @__PURE__ */ (0, f.jsx)("span", {
												className: "wf-cat-dot",
												"data-cat": e.value
											}),
											/* @__PURE__ */ (0, f.jsx)("span", {
												className: "wf-group-label",
												children: e.label
											}),
											/* @__PURE__ */ (0, f.jsx)("span", {
												className: "wf-group-count",
												children: e.items.length
											})
										]
									}), e.items.map((e) => {
										let t = e.ioNodes?.length ?? 0, n = e.ioNodes?.filter((t) => e.defaultNodes?.[t.type] === t.nodeId).length ?? 0, r = R.has(e.id);
										return /* @__PURE__ */ (0, f.jsxs)(l.div, {
											className: `wf-item${r ? " is-expanded" : ""}`,
											layout: !0,
											variants: x,
											children: [/* @__PURE__ */ (0, f.jsxs)("div", {
												className: "wf-item-row",
												children: [/* @__PURE__ */ (0, f.jsxs)("div", {
													className: "wf-item-info",
													children: [/* @__PURE__ */ (0, f.jsx)("span", {
														className: "wf-item-name",
														title: e.name,
														children: e.name
													}), /* @__PURE__ */ (0, f.jsxs)("span", {
														className: "wf-item-meta",
														children: [
															/* @__PURE__ */ (0, f.jsx)("span", {
																className: "wf-item-file",
																title: e.fileName,
																children: e.fileName
															}),
															/* @__PURE__ */ (0, f.jsx)("span", {
																className: "wf-item-sep",
																children: "·"
															}),
															/* @__PURE__ */ (0, f.jsx)("span", { children: new Date(e.createdAt).toLocaleDateString("zh-CN", {
																month: "short",
																day: "numeric"
															}) }),
															/* @__PURE__ */ (0, f.jsx)(u, {
																className: "wf-item-cat",
																triggerClassName: "wf-item-cat-trigger",
																value: e.category,
																title: "修改分类",
																options: p.map((e) => ({
																	value: e.value,
																	label: e.label
																})),
																onChange: (t) => {
																	C(e.id, { category: t }).catch(() => E("修改分类失败", "error"));
																}
															}),
															(T?.length ?? 0) > 0 && /* @__PURE__ */ (0, f.jsx)(u, {
																className: "wf-item-cat",
																triggerClassName: "wf-item-cat-trigger",
																value: e.serverId ?? "",
																title: "选择执行这个工作流的 ComfyUI 服务端",
																options: [{
																	value: "",
																	label: "默认服务端"
																}, ...(T ?? []).map((e) => ({
																	value: e.id,
																	label: e.name || e.url
																}))],
																onChange: (t) => {
																	C(e.id, { serverId: t || void 0 }).catch(() => E("绑定服务端失败", "error"));
																}
															})
														]
													})]
												}), /* @__PURE__ */ (0, f.jsxs)("div", {
													className: "flex shrink-0 items-center gap-1",
													children: [
														t > 0 && /* @__PURE__ */ (0, f.jsxs)("button", {
															type: "button",
															className: "wf-item-toggle",
															onClick: () => ue(e.id),
															"data-tooltip": r ? "收起输入输出节点" : "展开输入输出节点",
															"data-tooltip-pos": "left",
															"aria-expanded": r,
															children: [
																/* @__PURE__ */ (0, f.jsx)("svg", {
																	className: "wf-item-chevron",
																	width: "12",
																	height: "12",
																	viewBox: "0 0 24 24",
																	fill: "none",
																	stroke: "currentColor",
																	strokeWidth: "2.5",
																	children: /* @__PURE__ */ (0, f.jsx)("polyline", { points: "9 18 15 12 9 6" })
																}),
																/* @__PURE__ */ (0, f.jsxs)("span", { children: [t, " 节点"] }),
																n > 0 && /* @__PURE__ */ (0, f.jsxs)("span", {
																	className: "wf-item-star",
																	children: ["★", n]
																})
															]
														}),
														/* @__PURE__ */ (0, f.jsx)(l.button, {
															type: "button",
															className: "wf-item-del wf-item-edit",
															onClick: (t) => void Q(e, t),
															"data-tooltip": "在 ComfyUI 中编辑",
															"data-tooltip-pos": "left",
															whileHover: { scale: 1.1 },
															whileTap: { scale: .9 },
															children: /* @__PURE__ */ (0, f.jsxs)("svg", {
																width: "14",
																height: "14",
																viewBox: "0 0 24 24",
																fill: "none",
																stroke: "currentColor",
																strokeWidth: "2",
																children: [/* @__PURE__ */ (0, f.jsx)("path", { d: "M12 20h9" }), /* @__PURE__ */ (0, f.jsx)("path", { d: "M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" })]
															})
														}),
														/* @__PURE__ */ (0, f.jsx)(l.button, {
															type: "button",
															className: "wf-item-del",
															onClick: (t) => ce(e.id, t),
															"data-tooltip": "删除工作流",
															"data-tooltip-pos": "left",
															whileHover: { scale: 1.1 },
															whileTap: { scale: .9 },
															children: /* @__PURE__ */ (0, f.jsxs)("svg", {
																width: "14",
																height: "14",
																viewBox: "0 0 24 24",
																fill: "none",
																stroke: "currentColor",
																strokeWidth: "2",
																children: [/* @__PURE__ */ (0, f.jsx)("polyline", { points: "3 6 5 6 21 6" }), /* @__PURE__ */ (0, f.jsx)("path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" })]
															})
														})
													]
												})]
											}), /* @__PURE__ */ (0, f.jsx)(c, {
												initial: !1,
												children: r && t > 0 && /* @__PURE__ */ (0, f.jsx)(l.div, {
													className: "wf-item-ionodes-wrap",
													initial: {
														height: 0,
														opacity: 0
													},
													animate: {
														height: "auto",
														opacity: 1
													},
													exit: {
														height: 0,
														opacity: 0
													},
													transition: {
														duration: .18,
														ease: [
															.16,
															1,
															.3,
															1
														]
													},
													children: /* @__PURE__ */ (0, f.jsx)("div", {
														className: "wf-item-ionodes",
														children: (e.ioNodes ?? []).map((t, n) => {
															let r = e.defaultNodes?.[t.type] === t.nodeId;
															return /* @__PURE__ */ (0, f.jsxs)("button", {
																type: "button",
																className: `wf-ionode-badge wf-ionode-${t.type}${r ? " is-default" : ""}`,
																onClick: () => le(e, t),
																title: r ? `已是默认${v[t.type]}节点，点击取消` : `设为默认${v[t.type]}节点：提示词框里的${v[t.type]}内容在没 @ 时自动注入这里`,
																children: [
																	r ? "★" : _[t.type],
																	" ",
																	t.title,
																	/* @__PURE__ */ (0, f.jsxs)("code", { children: ["#", t.nodeId] })
																]
															}, n);
														})
													})
												}, "ionodes")
											})]
										}, e.id);
									})]
								}, e.value))
							}, "list")
						})]
					})
				]
			})]
		})
	})] }) });
}
//#endregion
export { S as default };
