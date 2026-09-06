import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./jsx-runtime-BAkIPmuO.js";
import { i as r } from "./i18n-on3r1DCI.js";
import { h as i } from "./indexedDbService-wXUqJvjT.js";
import { K as a, p as o, z as ee } from "./directorSceneSchema-BcP-NXqL.js";
import { E as s, H as c, N as l, Q as u, ft as te, lt as d, m as f, mt as p, pt as ne, q as m } from "./fileService-zQLozbOU.js";
import { a as h, r as g } from "./ViewportImage-Dsz9jsTU.js";
import { i as _, n as v, o as y, t as b, u as x } from "./assetFormat-UuOoHpLo.js";
import { n as S, r as C, t as w } from "./AssetThumb-BRhivWP9.js";
//#region src/components/AssetSearchWindow.tsx
var T = /* @__PURE__ */ e(t(), 1), E = n(), D = 60;
function O() {
	let [e, t] = (0, T.useState)([]), [n, w] = (0, T.useState)({}), [O, ie] = (0, T.useState)([{
		key: "all",
		label: "全部来源"
	}]), [k, A] = (0, T.useState)(""), j = (0, T.useDeferredValue)(k), [M, ae] = (0, T.useState)("all"), [N, P] = (0, T.useState)(null), [F, I] = (0, T.useState)(!0), [L, R] = (0, T.useState)(D), z = (0, T.useCallback)(async () => {
		I(!0);
		try {
			let e = await c();
			document.documentElement.setAttribute("data-theme", e?.theme === "light" ? "light" : "dark"), document.documentElement.toggleAttribute("data-native-cursor", e?.customCursor === !1), r(e?.language), a(e?.baseDataDir), await s(e ?? {});
			let n = await m();
			ee(n);
			let o = e?.assetFolders ?? [], [l, u, d] = await Promise.all([
				Promise.all(n.map(async (e) => (await f(e.id)).map((t) => ({
					...t,
					source: "project",
					projectId: e.id,
					projectName: e.name
				})))),
				ne(),
				te(o)
			]), p = /* @__PURE__ */ new Set(), h = [];
			for (let e of [
				...l.flat(),
				...u,
				...d
			]) p.has(e.path) || (p.add(e.path), h.push(e));
			t(h);
			let g = [{
				key: "all",
				label: "全部来源"
			}];
			for (let e of n) g.push({
				key: `project:${e.id}`,
				label: e.name,
				group: "项目"
			});
			u.length > 0 && g.push({
				key: "global",
				label: "全局资产库",
				group: "其他"
			});
			for (let e of o) g.push({
				key: `folder:${e}`,
				label: _(e),
				group: "文件夹"
			});
			ie(g);
			try {
				let e = await i(), t = {};
				for (let n of e) n.tags?.length && (t[n.assetId] = n.tags);
				w(t);
			} catch {}
		} catch (e) {
			console.error("[AssetSearchWindow] 加载失败:", e);
		} finally {
			I(!1);
		}
	}, []);
	(0, T.useEffect)(() => {
		document.title = "资源搜索", S(), z();
	}, [z]);
	let [B, V] = (0, T.useState)(!1), [H, U] = (0, T.useState)(!1), W = (0, T.useRef)(null);
	(0, T.useEffect)(() => {
		if (!B) return;
		let e = (e) => {
			W.current && !W.current.contains(e.target) && V(!1);
		};
		return document.addEventListener("mousedown", e), () => document.removeEventListener("mousedown", e);
	}, [B]);
	let G = (0, T.useCallback)(async () => {
		V(!1), U(!0);
		try {
			await d() > 0 && await z();
		} catch (e) {
			console.error("[AssetSearchWindow] 添加文件失败:", e);
		} finally {
			U(!1);
		}
	}, [z]), K = (0, T.useCallback)(async () => {
		V(!1), U(!0);
		try {
			let e = await p();
			if (e) {
				let t = await c(), n = t?.assetFolders ?? [];
				n.includes(e) || (await u({
					...t,
					assetFolders: [...n, e]
				}), await z());
			}
		} catch (e) {
			console.error("[AssetSearchWindow] 添加文件夹失败:", e);
		} finally {
			U(!1);
		}
	}, [z]), q = (0, T.useMemo)(() => e.map((e) => {
		let t = e.assetId ?? e.path;
		return n[t] ? {
			...e,
			tags: n[t]
		} : e;
	}), [e, n]), J = (0, T.useMemo)(() => {
		if (M === "all") return q;
		if (M === "global") return q.filter((e) => e.source === "global");
		if (M.startsWith("project:")) {
			let e = M.slice(8);
			return q.filter((t) => t.source === "project" && t.projectId === e);
		}
		if (M.startsWith("folder:")) {
			let e = M.slice(7);
			return q.filter((t) => t.source === "folder" && t.folderRoot === e);
		}
		return q;
	}, [q, M]), Y = (0, T.useMemo)(() => {
		let e = {
			image: 0,
			video: 0,
			audio: 0,
			text: 0,
			other: 0
		};
		for (let t of J) e[t.category]++;
		return e;
	}, [J]), X = (0, T.useMemo)(() => {
		let e = j.trim().toLowerCase();
		return J.filter((t) => {
			if (N && t.category !== N) return !1;
			if (e) {
				let n = t.name.toLowerCase().includes(e), r = (t.tags ?? []).some((t) => t.toLowerCase().includes(e));
				if (!n && !r) return !1;
			}
			return !0;
		});
	}, [
		J,
		N,
		j
	]);
	(0, T.useEffect)(() => {
		R(D);
	}, [
		M,
		N,
		j
	]);
	let Z = (0, T.useMemo)(() => X.slice(0, L), [X, L]), Q = (0, T.useRef)(null);
	(0, T.useEffect)(() => {
		let e = Q.current;
		if (!e) return;
		let t = new IntersectionObserver((e) => {
			e[0]?.isIntersecting && R((e) => e < X.length ? e + D : e);
		}, { rootMargin: "300px" });
		return t.observe(e), () => t.disconnect();
	}, [X.length, Z.length]);
	let oe = (0, T.useCallback)((e) => {
		l(e).catch(() => {});
	}, []), se = (0, T.useCallback)(() => {
		import("./window-WhVtX8QG.js").then((e) => e.getCurrentWindow().minimize()).catch(() => {});
	}, []), ce = (0, T.useCallback)(() => {
		import("./window-WhVtX8QG.js").then((e) => e.getCurrentWindow().close()).catch(() => {});
	}, []), $ = (0, T.useMemo)(() => {
		let e = O.filter((e) => !e.group), t = /* @__PURE__ */ new Map();
		for (let e of O) {
			if (!e.group) continue;
			let n = t.get(e.group) ?? [];
			n.push(e), t.set(e.group, n);
		}
		return {
			flat: e,
			groups: [...t.entries()]
		};
	}, [O]);
	return /* @__PURE__ */ (0, E.jsxs)("div", {
		className: "asset-search-root",
		children: [
			/* @__PURE__ */ (0, E.jsxs)("div", {
				className: "asset-search-header",
				"data-tauri-drag-region": !0,
				children: [
					/* @__PURE__ */ (0, E.jsx)("h1", {
						className: "asset-search-title",
						children: "资源搜索"
					}),
					/* @__PURE__ */ (0, E.jsxs)("span", {
						className: "asset-search-total",
						children: [
							X.length,
							" / ",
							e.length
						]
					}),
					/* @__PURE__ */ (0, E.jsx)("span", {
						className: "asset-search-hint",
						children: "拖拽至画布可创建节点"
					}),
					/* @__PURE__ */ (0, E.jsxs)("div", {
						className: "asset-search-winctrls",
						children: [
							/* @__PURE__ */ (0, E.jsx)("button", {
								type: "button",
								className: "asset-search-refresh",
								onClick: z,
								disabled: F,
								"data-tooltip": "刷新",
								children: /* @__PURE__ */ (0, E.jsxs)("svg", {
									width: "15",
									height: "15",
									viewBox: "0 0 24 24",
									fill: "none",
									stroke: "currentColor",
									strokeWidth: "2",
									children: [
										/* @__PURE__ */ (0, E.jsx)("polyline", { points: "23 4 23 10 17 10" }),
										/* @__PURE__ */ (0, E.jsx)("polyline", { points: "1 20 1 14 7 14" }),
										/* @__PURE__ */ (0, E.jsx)("path", { d: "M3.51 9a9 9 0 0 1 14.85-3.36L23 10M1 14l4.64 4.36A9 9 0 0 0 20.49 15" })
									]
								})
							}),
							/* @__PURE__ */ (0, E.jsx)("button", {
								type: "button",
								className: "asset-search-winbtn",
								onClick: se,
								"aria-label": "最小化",
								"data-tooltip": "最小化",
								children: /* @__PURE__ */ (0, E.jsx)("svg", {
									width: "10",
									height: "10",
									viewBox: "0 0 10 10",
									children: /* @__PURE__ */ (0, E.jsx)("rect", {
										x: "0",
										y: "5",
										width: "10",
										height: "1",
										fill: "currentColor"
									})
								})
							}),
							/* @__PURE__ */ (0, E.jsx)("button", {
								type: "button",
								className: "asset-search-winbtn close",
								onClick: ce,
								"aria-label": "关闭",
								"data-tooltip": "关闭",
								children: /* @__PURE__ */ (0, E.jsxs)("svg", {
									width: "10",
									height: "10",
									viewBox: "0 0 10 10",
									children: [/* @__PURE__ */ (0, E.jsx)("line", {
										x1: "0",
										y1: "0",
										x2: "10",
										y2: "10",
										stroke: "currentColor",
										strokeWidth: "1.2"
									}), /* @__PURE__ */ (0, E.jsx)("line", {
										x1: "10",
										y1: "0",
										x2: "0",
										y2: "10",
										stroke: "currentColor",
										strokeWidth: "1.2"
									})]
								})
							})
						]
					})
				]
			}),
			/* @__PURE__ */ (0, E.jsxs)("div", {
				className: "asset-search-toolbar",
				children: [
					/* @__PURE__ */ (0, E.jsxs)("div", {
						className: "assets-search asset-search-input",
						children: [
							/* @__PURE__ */ (0, E.jsxs)("svg", {
								width: "14",
								height: "14",
								viewBox: "0 0 24 24",
								fill: "none",
								stroke: "currentColor",
								strokeWidth: "2",
								children: [/* @__PURE__ */ (0, E.jsx)("circle", {
									cx: "11",
									cy: "11",
									r: "8"
								}), /* @__PURE__ */ (0, E.jsx)("line", {
									x1: "21",
									y1: "21",
									x2: "16.65",
									y2: "16.65"
								})]
							}),
							/* @__PURE__ */ (0, E.jsx)("input", {
								type: "text",
								placeholder: "搜索文件名或标签…",
								autoFocus: !0,
								value: k,
								onChange: (e) => A(e.target.value)
							}),
							k && /* @__PURE__ */ (0, E.jsx)("button", {
								type: "button",
								className: "assets-search-clear",
								onClick: () => A(""),
								"aria-label": "清空",
								children: /* @__PURE__ */ (0, E.jsxs)("svg", {
									width: "12",
									height: "12",
									viewBox: "0 0 24 24",
									fill: "none",
									stroke: "currentColor",
									strokeWidth: "2.5",
									children: [/* @__PURE__ */ (0, E.jsx)("line", {
										x1: "18",
										y1: "6",
										x2: "6",
										y2: "18"
									}), /* @__PURE__ */ (0, E.jsx)("line", {
										x1: "6",
										y1: "6",
										x2: "18",
										y2: "18"
									})]
								})
							})
						]
					}),
					/* @__PURE__ */ (0, E.jsxs)("select", {
						className: "assets-project-select",
						value: M,
						onChange: (e) => ae(e.target.value),
						"data-tooltip": "按项目 / 文件夹筛选",
						children: [$.flat.map((e) => /* @__PURE__ */ (0, E.jsx)("option", {
							value: e.key,
							children: e.label
						}, e.key)), $.groups.map(([e, t]) => /* @__PURE__ */ (0, E.jsx)("optgroup", {
							label: e,
							children: t.map((e) => /* @__PURE__ */ (0, E.jsx)("option", {
								value: e.key,
								children: e.label
							}, e.key))
						}, e))]
					}),
					/* @__PURE__ */ (0, E.jsxs)("div", {
						className: "assets-add-wrap",
						ref: W,
						children: [/* @__PURE__ */ (0, E.jsxs)(g.button, {
							type: "button",
							className: "assets-add-btn",
							disabled: H,
							onClick: () => V((e) => !e),
							whileHover: { scale: 1.03 },
							whileTap: { scale: .97 },
							children: [/* @__PURE__ */ (0, E.jsxs)("svg", {
								width: "14",
								height: "14",
								viewBox: "0 0 24 24",
								fill: "none",
								stroke: "currentColor",
								strokeWidth: "2.2",
								children: [/* @__PURE__ */ (0, E.jsx)("line", {
									x1: "12",
									y1: "5",
									x2: "12",
									y2: "19"
								}), /* @__PURE__ */ (0, E.jsx)("line", {
									x1: "5",
									y1: "12",
									x2: "19",
									y2: "12"
								})]
							}), "添加"]
						}), /* @__PURE__ */ (0, E.jsx)(h, { children: B && /* @__PURE__ */ (0, E.jsxs)(g.div, {
							className: "assets-add-menu",
							initial: {
								opacity: 0,
								y: -6,
								scale: .96
							},
							animate: {
								opacity: 1,
								y: 0,
								scale: 1
							},
							exit: {
								opacity: 0,
								y: -6,
								scale: .96,
								transition: y
							},
							transition: x,
							children: [/* @__PURE__ */ (0, E.jsx)("button", {
								type: "button",
								onClick: G,
								children: "📄 添加文件"
							}), /* @__PURE__ */ (0, E.jsx)("button", {
								type: "button",
								onClick: K,
								children: "📁 添加文件夹"
							})]
						}) })]
					})
				]
			}),
			/* @__PURE__ */ (0, E.jsxs)("div", {
				className: "assets-category-row asset-search-cats",
				children: [/* @__PURE__ */ (0, E.jsxs)("button", {
					type: "button",
					className: `assets-cat-chip ${N === null ? "active" : ""}`,
					onClick: () => P(null),
					children: ["全部", /* @__PURE__ */ (0, E.jsx)("span", {
						className: "assets-cat-count",
						children: J.length
					})]
				}), b.filter((e) => Y[e] > 0).map((e) => /* @__PURE__ */ (0, E.jsxs)("button", {
					type: "button",
					className: `assets-cat-chip ${N === e ? "active" : ""}`,
					onClick: () => P(e),
					children: [
						v[e],
						" ",
						o[e],
						/* @__PURE__ */ (0, E.jsx)("span", {
							className: "assets-cat-count",
							children: Y[e]
						})
					]
				}, e))]
			}),
			/* @__PURE__ */ (0, E.jsx)("div", {
				className: "asset-search-scroll",
				children: F ? /* @__PURE__ */ (0, E.jsxs)("div", {
					className: "assets-empty",
					children: [/* @__PURE__ */ (0, E.jsx)("div", { className: "assets-spinner asset-search-spinner" }), /* @__PURE__ */ (0, E.jsx)("span", { children: "加载中…" })]
				}) : X.length === 0 ? /* @__PURE__ */ (0, E.jsxs)("div", {
					className: "assets-empty",
					children: [/* @__PURE__ */ (0, E.jsxs)("svg", {
						width: "40",
						height: "40",
						viewBox: "0 0 24 24",
						fill: "none",
						stroke: "currentColor",
						strokeWidth: "1",
						opacity: "0.3",
						children: [/* @__PURE__ */ (0, E.jsx)("circle", {
							cx: "11",
							cy: "11",
							r: "8"
						}), /* @__PURE__ */ (0, E.jsx)("line", {
							x1: "21",
							y1: "21",
							x2: "16.65",
							y2: "16.65"
						})]
					}), /* @__PURE__ */ (0, E.jsx)("span", { children: k || N || M !== "all" ? "没有匹配的文件" : "暂无文件" })]
				}) : /* @__PURE__ */ (0, E.jsxs)(E.Fragment, { children: [/* @__PURE__ */ (0, E.jsx)("div", {
					className: "asset-search-masonry",
					children: Z.map((e) => /* @__PURE__ */ (0, E.jsx)(re, {
						file: e,
						onReveal: () => oe(e.path),
						onDragStart: (t) => {
							t.preventDefault(), C(e);
						}
					}, e.path))
				}), L < X.length && /* @__PURE__ */ (0, E.jsx)("div", {
					ref: Q,
					className: "assets-load-sentinel",
					children: "加载更多…"
				})] })
			})
		]
	});
}
function re({ file: e, onReveal: t, onDragStart: n }) {
	let r = e.tags ?? [], i = e.source === "project" ? e.projectName || "项目" : e.source === "folder" ? _(e.folderRoot || "") : "全局";
	return /* @__PURE__ */ (0, E.jsxs)("div", {
		className: "assets-waterfall-card anim-card-in",
		draggable: !0,
		onDragStart: n,
		"data-tooltip": "拖拽到主窗口画布以添加节点",
		"data-tooltip-pos": "bottom",
		children: [
			/* @__PURE__ */ (0, E.jsx)(w, {
				assetUrl: e.assetUrl,
				name: e.name,
				category: e.category,
				size: e.size,
				badge: i,
				children: /* @__PURE__ */ (0, E.jsx)("div", {
					className: "assets-card-actions",
					children: /* @__PURE__ */ (0, E.jsx)("button", {
						type: "button",
						className: "assets-card-action-btn",
						"data-tooltip": "在文件夹中显示",
						onClick: t,
						children: /* @__PURE__ */ (0, E.jsx)("svg", {
							width: "14",
							height: "14",
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							strokeWidth: "2",
							children: /* @__PURE__ */ (0, E.jsx)("path", { d: "M3 7a2 2 0 0 1 2-2h4l2 2h8a2 2 0 0 1 2 2v8a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" })
						})
					})
				})
			}),
			r.length > 0 && /* @__PURE__ */ (0, E.jsx)("div", {
				className: "assets-card-tags",
				children: r.map((e) => /* @__PURE__ */ (0, E.jsx)("span", {
					className: "assets-card-tag",
					children: e
				}, e))
			}),
			/* @__PURE__ */ (0, E.jsx)("div", {
				className: "assets-card-name",
				"data-tooltip": e.name,
				children: e.name
			})
		]
	});
}
//#endregion
export { O as default };
