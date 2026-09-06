import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./jsx-runtime-BAkIPmuO.js";
import { pi as r, t as i } from "./useAppStore-CcUL4Jo0.js";
import { i as a } from "./core-CoHQ9AE0.js";
import { M as o } from "./directorSceneSchema-BcP-NXqL.js";
import { b as s } from "./fileService-zQLozbOU.js";
import { a as c, r as l } from "./ViewportImage-Dsz9jsTU.js";
import { Rt as u, Tt as d, zt as f } from "./useTooltipAutoPlacement-BSvTkR9V.js";
import { n as p } from "./rasterImageDimensions-CX1VK2cM.js";
//#region src/components/OutputHistoryPanel.tsx
var m = /* @__PURE__ */ e(t(), 1), h = n(), g = [
	.16,
	1,
	.3,
	1
], _ = [
	{
		key: "all",
		label: "全部"
	},
	{
		key: "ai-text",
		label: "文本"
	},
	{
		key: "ai-image",
		label: "图像"
	},
	{
		key: "ai-video",
		label: "视频"
	},
	{
		key: "ai-audio",
		label: "音频"
	}
];
function v(e) {
	let t = Date.now() - e;
	if (t < 6e4) return "刚刚";
	if (t < 36e5) return `${Math.floor(t / 6e4)} 分钟前`;
	if (t < 864e5) return `${Math.floor(t / 36e5)} 小时前`;
	if (t < 6048e5) return `${Math.floor(t / 864e5)} 天前`;
	let n = new Date(e), r = /* @__PURE__ */ new Date();
	return n.getFullYear() === r.getFullYear() ? `${n.getMonth() + 1}月${n.getDate()}日 ${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}` : `${n.getFullYear()}年${n.getMonth() + 1}月${n.getDate()}日 ${String(n.getHours()).padStart(2, "0")}:${String(n.getMinutes()).padStart(2, "0")}`;
}
function y(e, t) {
	return e.length <= t ? e : e.slice(0, t) + "…";
}
function b({ mediaUrl: e, filePath: t }) {
	let [n, r] = (0, m.useState)(() => {
		if (t) try {
			return a(t);
		} catch {}
		return e || "";
	}), [i, o] = (0, m.useState)(!1), s = (0, m.useCallback)(() => {
		!i && e && n !== e && r(e), o(!0);
	}, [
		i,
		e,
		n
	]);
	return n ? /* @__PURE__ */ (0, h.jsx)("img", {
		src: n,
		alt: "",
		loading: "lazy",
		decoding: "async",
		className: "w-12 h-12 rounded object-cover shrink-0",
		onError: s,
		style: i && n === e ? { display: "none" } : void 0
	}) : null;
}
function x() {
	let { outputHistoryRecords: e, historyTotalCount: t, historyHasMore: n, historyLoading: a, historyProjectId: x, currentProjectId: S, historyPanelOpen: C, setHistoryPanelOpen: w, loadHistoryFromDb: T, loadMoreHistoryFromDb: E, getHistoryForExport: D, deleteHistoryEntry: O, clearAllHistory: k, showToast: A } = i(f((e) => ({
		outputHistoryRecords: e.outputHistoryRecords,
		historyTotalCount: e.historyTotalCount,
		historyHasMore: e.historyHasMore,
		historyLoading: e.historyLoading,
		historyProjectId: e.historyProjectId,
		currentProjectId: e.currentProjectId,
		historyPanelOpen: e.historyPanelOpen,
		setHistoryPanelOpen: e.setHistoryPanelOpen,
		loadHistoryFromDb: e.loadHistoryFromDb,
		loadMoreHistoryFromDb: e.loadMoreHistoryFromDb,
		getHistoryForExport: e.getHistoryForExport,
		deleteHistoryEntry: e.deleteHistoryEntry,
		clearAllHistory: e.clearAllHistory,
		showToast: e.showToast
	}))), [j, M] = (0, m.useState)("all"), [N, P] = (0, m.useState)(""), [F, I] = (0, m.useState)(/* @__PURE__ */ new Set()), [L, R] = (0, m.useState)(!1), z = (0, m.useRef)(null), B = (0, m.useRef)(null), V = (0, m.useRef)(null);
	(0, m.useEffect)(() => {
		if (!C) return;
		let e = (e) => {
			e.key === "Escape" && w(!1);
		};
		return window.addEventListener("keydown", e, !0), () => window.removeEventListener("keydown", e, !0);
	}, [C, w]), (0, m.useEffect)(() => {
		C && setTimeout(() => z.current?.focus(), 100);
	}, [C]);
	let H = (0, m.useMemo)(() => ({
		nodeType: j === "all" ? void 0 : j,
		search: N.trim() || void 0
	}), [j, N]);
	(0, m.useEffect)(() => {
		if (!C) return;
		let e = window.setTimeout(() => {
			T(H), B.current?.scrollTo({ top: 0 });
		}, N.trim() ? 200 : 0);
		return () => window.clearTimeout(e);
	}, [
		S,
		C,
		H,
		T,
		N
	]);
	let U = (0, m.useMemo)(() => {
		let t = x === S ? e : [];
		if (j !== "all" && (t = t.filter((e) => e.nodeType === j)), N.trim()) {
			let e = N.trim().toLowerCase();
			t = t.filter((t) => t.prompt.toLowerCase().includes(e) || t.output.toLowerCase().includes(e) || t.model.toLowerCase().includes(e) || t.nodeLabel.toLowerCase().includes(e));
		}
		return t;
	}, [
		S,
		j,
		x,
		e,
		N
	]);
	(0, m.useEffect)(() => {
		let e = V.current;
		if (!C || !n || a || !e) return;
		let t = new IntersectionObserver((e) => {
			e[0]?.isIntersecting && E(H);
		}, {
			root: B.current,
			rootMargin: "300px 0px"
		});
		return t.observe(e), () => t.disconnect();
	}, [
		n,
		a,
		C,
		H,
		E
	]);
	let W = (0, m.useCallback)((e) => {
		I((t) => {
			let n = new Set(t);
			return n.has(e) ? n.delete(e) : n.add(e), n;
		});
	}, []), G = (0, m.useCallback)((e) => {
		O(e.nodeId, e.id);
	}, [O]), K = (0, m.useCallback)(() => {
		k(), R(!1), A("已清空全部历史记录");
	}, [k, A]), q = (0, m.useCallback)((e) => {
		if (!i.getState().nodes.find((t) => t.id === e.nodeId)) {
			A("节点已不存在", "error");
			return;
		}
		w(!1), setTimeout(() => {
			window.dispatchEvent(new CustomEvent("canvas-focus-node", { detail: { nodeId: e.nodeId } }));
		}, 300);
	}, [w, A]), J = (0, m.useCallback)(async (e) => {
		try {
			await navigator.clipboard.writeText(e.output), A("已复制输出内容");
		} catch {
			A("复制失败", "error");
		}
	}, [A]), Y = (0, m.useCallback)(async () => {
		try {
			let e = (await D(H)).map((e) => ({
				time: new Date(e.timestamp).toISOString(),
				node: e.nodeLabel,
				type: e.nodeType,
				model: `${e.provider}/${e.model}`,
				status: e.status,
				prompt: e.prompt,
				output: e.output,
				error: e.error
			})), t = JSON.stringify(e, null, 2), n = `ai-output-history-${(/* @__PURE__ */ new Date()).toISOString().slice(0, 10)}.json`;
			if (o()) {
				let e = await s(t, n, "导出历史记录");
				if (!e) return;
				A(`已导出历史记录到 ${e.fileName}`);
				return;
			}
			let r = new Blob([t], { type: "application/json" }), i = URL.createObjectURL(r), a = document.createElement("a");
			a.href = i, a.download = n, a.click(), URL.revokeObjectURL(i), A("已导出历史记录");
		} catch {
			A("导出历史记录失败", "error");
		}
	}, [
		D,
		H,
		A
	]), X = (0, m.useCallback)((e) => i.getState().nodes.some((t) => t.id === e), []);
	return /* @__PURE__ */ (0, h.jsx)(c, { children: C && /* @__PURE__ */ (0, h.jsxs)(h.Fragment, { children: [/* @__PURE__ */ (0, h.jsx)(l.div, {
		"data-tauri-drag-region": !0,
		className: "fixed inset-0 z-[240] bg-black/50 backdrop-blur-sm",
		initial: { opacity: 0 },
		animate: { opacity: 1 },
		exit: { opacity: 0 },
		transition: { duration: .2 },
		onClick: () => w(!1)
	}), /* @__PURE__ */ (0, h.jsxs)(l.div, {
		className: "fixed inset-x-0 bottom-0 z-[250] mx-auto w-full max-w-[720px] max-h-[75vh] flex flex-col\n                       glass-panel border border-b-0 rounded-t-2xl shadow-2xl overflow-hidden",
		initial: { y: "100%" },
		animate: { y: 0 },
		exit: { y: "100%" },
		transition: {
			duration: .3,
			ease: g
		},
		onClick: (e) => e.stopPropagation(),
		children: [
			/* @__PURE__ */ (0, h.jsxs)("div", {
				className: "flex items-center justify-between px-3 py-2 border-b border-canvas-border shrink-0",
				children: [/* @__PURE__ */ (0, h.jsxs)("div", {
					className: "flex items-center gap-2.5",
					children: [
						/* @__PURE__ */ (0, h.jsxs)("svg", {
							width: "18",
							height: "18",
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							strokeWidth: "2",
							className: "text-canvas-text-secondary",
							children: [/* @__PURE__ */ (0, h.jsx)("circle", {
								cx: "12",
								cy: "12",
								r: "10"
							}), /* @__PURE__ */ (0, h.jsx)("polyline", { points: "12 6 12 12 16 14" })]
						}),
						/* @__PURE__ */ (0, h.jsx)("h2", {
							className: "text-sm font-semibold text-canvas-text",
							children: "输出历史"
						}),
						/* @__PURE__ */ (0, h.jsxs)("span", {
							className: "text-[11px] text-canvas-text-muted",
							children: [
								"共 ",
								t,
								" 条"
							]
						})
					]
				}), /* @__PURE__ */ (0, h.jsx)(d, { onClick: () => w(!1) })]
			}),
			/* @__PURE__ */ (0, h.jsxs)("div", {
				className: "flex items-center gap-2 px-3 pt-3 pb-3 shrink-0",
				children: [_.map(({ key: e, label: t }) => /* @__PURE__ */ (0, h.jsx)("button", {
					type: "button",
					className: `px-3 py-1 rounded-lg text-[11px] font-medium transition-colors shrink-0 ${j === e ? "bg-indigo-500/20 text-indigo-400" : "text-canvas-text-muted hover:text-canvas-text-secondary hover:bg-canvas-hover"}`,
					onClick: () => {
						M(e), B.current?.scrollTo({ top: 0 });
					},
					children: t
				}, e)), /* @__PURE__ */ (0, h.jsxs)("div", {
					className: "relative w-[200px] ml-auto",
					children: [
						/* @__PURE__ */ (0, h.jsxs)("svg", {
							className: "absolute left-3 top-1/2 -translate-y-1/2 text-canvas-text-muted",
							width: "13",
							height: "13",
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							strokeWidth: "2",
							children: [/* @__PURE__ */ (0, h.jsx)("circle", {
								cx: "11",
								cy: "11",
								r: "8"
							}), /* @__PURE__ */ (0, h.jsx)("line", {
								x1: "21",
								y1: "21",
								x2: "16.65",
								y2: "16.65"
							})]
						}),
						/* @__PURE__ */ (0, h.jsx)("input", {
							ref: z,
							type: "text",
							value: N,
							onChange: (e) => {
								P(e.target.value), B.current?.scrollTo({ top: 0 });
							},
							placeholder: "搜索提示词、输出内容或模型...",
							className: "w-full pl-8 pr-3 py-1.5 rounded-lg bg-canvas-bg border border-canvas-border\n                             text-[12px] text-canvas-text placeholder:text-canvas-text-muted\n                             focus:outline-none focus:border-indigo-500/50 transition-colors"
						}),
						N && /* @__PURE__ */ (0, h.jsx)("button", {
							type: "button",
							className: "absolute right-2 top-1/2 -translate-y-1/2 w-5 h-5 rounded flex items-center justify-center text-canvas-text-muted hover:text-canvas-text",
							onClick: () => {
								P(""), B.current?.scrollTo({ top: 0 });
							},
							children: /* @__PURE__ */ (0, h.jsxs)("svg", {
								width: "11",
								height: "11",
								viewBox: "0 0 24 24",
								fill: "none",
								stroke: "currentColor",
								strokeWidth: "2.5",
								children: [/* @__PURE__ */ (0, h.jsx)("line", {
									x1: "18",
									y1: "6",
									x2: "6",
									y2: "18"
								}), /* @__PURE__ */ (0, h.jsx)("line", {
									x1: "6",
									y1: "6",
									x2: "18",
									y2: "18"
								})]
							})
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, h.jsx)("div", {
				ref: B,
				className: "flex-1 overflow-y-auto px-3 pb-3",
				children: U.length === 0 ? /* @__PURE__ */ (0, h.jsxs)("div", {
					className: "flex flex-col items-center justify-center py-8 text-canvas-text-muted",
					children: [/* @__PURE__ */ (0, h.jsxs)("svg", {
						width: "40",
						height: "40",
						viewBox: "0 0 24 24",
						fill: "none",
						stroke: "currentColor",
						strokeWidth: "1.5",
						className: "mb-3 opacity-40",
						children: [
							/* @__PURE__ */ (0, h.jsx)("circle", {
								cx: "12",
								cy: "12",
								r: "10"
							}),
							/* @__PURE__ */ (0, h.jsx)("line", {
								x1: "12",
								y1: "8",
								x2: "12",
								y2: "12"
							}),
							/* @__PURE__ */ (0, h.jsx)("line", {
								x1: "12",
								y1: "16",
								x2: "12.01",
								y2: "16"
							})
						]
					}), /* @__PURE__ */ (0, h.jsx)("p", {
						className: "text-[12px]",
						children: a ? "正在加载历史记录..." : t === 0 ? "暂无生成记录，开始第一次生成后会自动记录" : "没有匹配的记录"
					})]
				}) : /* @__PURE__ */ (0, h.jsxs)("div", {
					className: "space-y-2",
					children: [U.map((e) => {
						let t = F.has(e.id), n = X(e.nodeId), i = e.nodeType === "ai-text", a = e.nodeType === "ai-image", o = e.status === "error", s = r[e.nodeType];
						return /* @__PURE__ */ (0, h.jsxs)(l.div, {
							initial: {
								opacity: 0,
								y: 8
							},
							animate: {
								opacity: 1,
								y: 0
							},
							transition: { duration: .2 },
							className: `rounded-lg border bg-canvas-surface/60 transition-colors ${o ? "border-red-500/20" : "border-canvas-border hover:border-canvas-border/80"}`,
							children: [
								/* @__PURE__ */ (0, h.jsxs)("div", {
									className: "flex items-center gap-2 px-3.5 pt-3 pb-1.5",
									children: [
										/* @__PURE__ */ (0, h.jsx)("span", {
											className: `inline-flex items-center gap-1 px-1.5 py-0.5 rounded text-[10px] font-semibold ${s ? `${s.color} ${s.bg}` : "text-canvas-text-muted bg-canvas-hover"}`,
											children: /* @__PURE__ */ (0, h.jsx)(p, {
												icon: s?.icon || "mdi:help-circle-outline",
												width: "12",
												height: "12"
											})
										}),
										/* @__PURE__ */ (0, h.jsxs)("span", {
											className: "text-[10px] text-canvas-text-muted bg-canvas-hover px-1.5 py-0.5 rounded",
											children: [
												e.provider,
												"/",
												e.model
											]
										}),
										/* @__PURE__ */ (0, h.jsx)("span", {
											className: `text-[10px] font-medium ${o ? "text-red-400" : "text-green-400"}`,
											children: o ? "❌ 失败" : "✅ 成功"
										}),
										/* @__PURE__ */ (0, h.jsx)("div", { className: "flex-1" }),
										/* @__PURE__ */ (0, h.jsx)("button", {
											type: "button",
											disabled: !n,
											onClick: () => q(e),
											className: `text-[10px] transition-colors ${n ? "text-indigo-400 hover:text-indigo-300 cursor-pointer" : "text-canvas-text-muted line-through cursor-default"}`,
											children: n ? `#${e.nodeLabel}` : "节点已删除"
										}),
										/* @__PURE__ */ (0, h.jsx)("span", {
											className: "text-[10px] text-canvas-text-muted tabular-nums",
											children: v(e.timestamp)
										})
									]
								}),
								/* @__PURE__ */ (0, h.jsx)("div", {
									className: "px-3.5 pb-1.5",
									children: /* @__PURE__ */ (0, h.jsxs)("button", {
										type: "button",
										className: "w-full text-left text-[11px] text-canvas-text-secondary leading-relaxed hover:text-canvas-text transition-colors",
										onClick: () => W(e.id),
										children: [/* @__PURE__ */ (0, h.jsx)("span", {
											className: "text-canvas-text-muted",
											children: "提示词："
										}), t ? e.prompt : y(e.prompt, 80)]
									})
								}),
								!o && /* @__PURE__ */ (0, h.jsx)("div", {
									className: "px-3.5 pb-2",
									children: i ? /* @__PURE__ */ (0, h.jsx)("div", {
										className: "rounded-lg bg-canvas-bg/60 px-3 py-2 max-h-24 overflow-y-auto text-[11px] text-canvas-text-secondary leading-relaxed",
										children: /* @__PURE__ */ (0, h.jsx)("span", { children: y(e.output, 150) })
									}) : /* @__PURE__ */ (0, h.jsxs)("div", {
										className: `rounded-lg bg-canvas-bg/60 p-2 ${a && e.mediaUrl ? "flex items-start gap-2.5" : "space-y-1.5"}`,
										children: [a && (e.mediaUrl || e.filePath) && /* @__PURE__ */ (0, h.jsx)(b, {
											mediaUrl: e.mediaUrl,
											filePath: e.filePath
										}), /* @__PURE__ */ (0, h.jsxs)("div", {
											className: "min-w-0 space-y-1",
											children: [
												e.mediaUrl && /* @__PURE__ */ (0, h.jsxs)("div", {
													className: "flex items-center gap-1.5",
													children: [
														/* @__PURE__ */ (0, h.jsx)("span", {
															className: "text-[10px] text-canvas-text-muted shrink-0",
															children: "线上："
														}),
														/* @__PURE__ */ (0, h.jsx)("span", {
															className: "text-[10px] text-canvas-text-secondary truncate",
															children: e.mediaUrl
														}),
														/* @__PURE__ */ (0, h.jsx)("button", {
															type: "button",
															className: "shrink-0 w-4 h-4 rounded text-canvas-text-muted hover:text-canvas-text hover:bg-canvas-hover flex items-center justify-center transition-colors",
															onClick: () => {
																navigator.clipboard.writeText(e.mediaUrl).then(() => A("已复制线上地址"), () => A("复制失败", "error"));
															},
															children: /* @__PURE__ */ (0, h.jsxs)("svg", {
																width: "10",
																height: "10",
																viewBox: "0 0 24 24",
																fill: "none",
																stroke: "currentColor",
																strokeWidth: "2",
																children: [/* @__PURE__ */ (0, h.jsx)("rect", {
																	x: "9",
																	y: "9",
																	width: "13",
																	height: "13",
																	rx: "2",
																	ry: "2"
																}), /* @__PURE__ */ (0, h.jsx)("path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" })]
															})
														})
													]
												}),
												e.filePath && /* @__PURE__ */ (0, h.jsxs)("div", {
													className: "flex items-center gap-1.5",
													children: [
														/* @__PURE__ */ (0, h.jsx)("span", {
															className: "text-[10px] text-canvas-text-muted shrink-0",
															children: "本地："
														}),
														/* @__PURE__ */ (0, h.jsx)("span", {
															className: "text-[10px] text-canvas-text-secondary truncate font-mono",
															children: e.filePath
														}),
														/* @__PURE__ */ (0, h.jsx)("button", {
															type: "button",
															className: "shrink-0 w-4 h-4 rounded text-canvas-text-muted hover:text-canvas-text hover:bg-canvas-hover flex items-center justify-center transition-colors",
															onClick: () => {
																navigator.clipboard.writeText(e.filePath).then(() => A("已复制本地路径"), () => A("复制失败", "error"));
															},
															children: /* @__PURE__ */ (0, h.jsxs)("svg", {
																width: "10",
																height: "10",
																viewBox: "0 0 24 24",
																fill: "none",
																stroke: "currentColor",
																strokeWidth: "2",
																children: [/* @__PURE__ */ (0, h.jsx)("rect", {
																	x: "9",
																	y: "9",
																	width: "13",
																	height: "13",
																	rx: "2",
																	ry: "2"
																}), /* @__PURE__ */ (0, h.jsx)("path", { d: "M5 15H4a2 2 0 0 1-2-2V4a2 2 0 0 1 2-2h9a2 2 0 0 1 2 2v1" })]
															})
														})
													]
												}),
												!e.mediaUrl && !e.filePath && /* @__PURE__ */ (0, h.jsx)("span", {
													className: "text-[10px] text-canvas-text-muted",
													children: e.output || "无预览"
												}),
												e.params && /* @__PURE__ */ (0, h.jsxs)("span", {
													className: "text-[10px] text-canvas-text-muted",
													children: [
														String(e.params.imageSize || ""),
														" ",
														String(e.params.aspectRatio || "")
													]
												})
											]
										})]
									})
								}),
								o && e.error && /* @__PURE__ */ (0, h.jsx)("div", {
									className: "px-3.5 pb-2",
									children: /* @__PURE__ */ (0, h.jsx)("div", {
										className: "rounded-lg bg-red-500/10 border border-red-500/20 px-3 py-1.5 text-[11px] text-red-400",
										children: e.error
									})
								}),
								/* @__PURE__ */ (0, h.jsxs)("div", {
									className: "flex items-center gap-1 px-3.5 pb-3",
									children: [
										!o && i && /* @__PURE__ */ (0, h.jsx)(u, {
											className: "text-[10px] px-2 py-1 rounded-md text-canvas-text-muted hover:text-canvas-text hover:bg-canvas-hover transition-colors",
											onClick: () => J(e),
											children: "复制输出"
										}),
										!o && /* @__PURE__ */ (0, h.jsx)(u, {
											className: "text-[10px] px-2 py-1 rounded-md text-canvas-text-muted hover:text-canvas-text hover:bg-canvas-hover transition-colors",
											onClick: () => q(e),
											children: "查看节点"
										}),
										/* @__PURE__ */ (0, h.jsx)("div", { className: "flex-1" }),
										/* @__PURE__ */ (0, h.jsx)(u, {
											className: "text-[10px] px-2 py-1 rounded-md text-canvas-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors",
											onClick: () => G(e),
											children: "删除"
										})
									]
								})
							]
						}, e.id);
					}), n && /* @__PURE__ */ (0, h.jsx)("div", {
						ref: V,
						className: "h-1 w-full",
						"aria-hidden": "true"
					})]
				})
			}),
			t > 0 && /* @__PURE__ */ (0, h.jsxs)("div", {
				className: "flex items-center justify-between px-3 py-3 border-t border-canvas-border shrink-0 bg-canvas-surface/80",
				children: [L ? /* @__PURE__ */ (0, h.jsxs)("div", {
					className: "flex items-center gap-2",
					children: [
						/* @__PURE__ */ (0, h.jsx)("span", {
							className: "text-[11px] text-canvas-text-secondary",
							children: "确认清空全部历史？"
						}),
						/* @__PURE__ */ (0, h.jsx)(u, {
							className: "text-[11px] px-2.5 py-1 rounded-md bg-red-500/20 text-red-400 hover:bg-red-500/30 transition-colors",
							onClick: K,
							children: "确认清空"
						}),
						/* @__PURE__ */ (0, h.jsx)(u, {
							className: "text-[11px] px-2.5 py-1 rounded-md text-canvas-text-muted hover:text-canvas-text hover:bg-canvas-hover transition-colors",
							onClick: () => R(!1),
							children: "取消"
						})
					]
				}) : /* @__PURE__ */ (0, h.jsx)(u, {
					className: "text-[11px] px-2.5 py-1 rounded-md text-canvas-text-muted hover:text-red-400 hover:bg-red-500/10 transition-colors",
					onClick: () => R(!0),
					children: "清空全部历史"
				}), /* @__PURE__ */ (0, h.jsx)(u, {
					className: "text-[11px] px-2.5 py-1 rounded-md text-indigo-400 hover:text-indigo-300 hover:bg-indigo-500/10 transition-colors",
					onClick: Y,
					disabled: U.length === 0,
					children: "导出 JSON"
				})]
			})
		]
	})] }) });
}
//#endregion
export { x as default };
