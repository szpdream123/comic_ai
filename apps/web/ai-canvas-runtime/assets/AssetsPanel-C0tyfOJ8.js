import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./jsx-runtime-BAkIPmuO.js";
import { b as r, t as i } from "./useAppStore-CcUL4Jo0.js";
import { a, h as o, z as s } from "./indexedDbService-wXUqJvjT.js";
import { p as c } from "./directorSceneSchema-BcP-NXqL.js";
import { c as l, ft as u, ht as d, lt as f, m as ee, mt as te, pt as ne, ut as re } from "./fileService-zQLozbOU.js";
import { a as p, r as m } from "./ViewportImage-Dsz9jsTU.js";
import { Tt as ie, zt as ae } from "./useTooltipAutoPlacement-BSvTkR9V.js";
import { n as h } from "./rasterImageDimensions-CX1VK2cM.js";
import { i as oe, n as se, o as g, t as ce, u as le } from "./assetFormat-UuOoHpLo.js";
import { t as ue } from "./Select-BkJW9F-N.js";
import { n as de, r as fe, t as _ } from "./AssetThumb-BRhivWP9.js";
//#region src/components/assets/waterfallColumns.ts
var v = /* @__PURE__ */ e(t(), 1);
function pe(e, t) {
	let n = Math.max(1, Math.floor(t)), r = Array.from({ length: n }, () => []);
	return e.forEach((e, t) => {
		r[t % n].push(e);
	}), r;
}
//#endregion
//#region src/components/AssetsPanel.tsx
var y = n(), me = (0, v.lazy)(() => import("./DramaAssetsPanel-Bv05Sl8t.js"));
function he(e) {
	return !!e.path && !e.path.startsWith("node://") && !e.path.startsWith("virtual://");
}
var b = 48, ge = 24, _e = 2, ve = 6, x = 3;
function S(e) {
	return typeof e != "number" || !Number.isFinite(e) ? x : Math.min(ve, Math.max(_e, Math.round(e)));
}
function C(e) {
	return e.assetId ?? e.path;
}
var ye = {
	hidden: { opacity: 0 },
	visible: { opacity: 1 }
}, be = {
	hidden: {
		opacity: 0,
		scale: .95,
		y: 20
	},
	visible: {
		opacity: 1,
		scale: 1,
		y: 0,
		transition: le
	},
	exit: {
		opacity: 0,
		scale: .95,
		y: 20,
		transition: g
	}
};
function w() {
	let { assetsPanelOpen: e, setAssetsPanelOpen: t, dramaAssetsPanelOpen: n, setDramaAssetsPanelOpen: _, markDramaAssetsViewed: x, unreadDramaAssetCount: w, dramaAssetCount: Se, currentProjectId: T, projects: Ce, assetFolders: we, assetWaterfallColumns: Te, updateConfig: E, saveConfig: D } = i(ae((e) => ({
		assetsPanelOpen: e.assetsPanelOpen,
		setAssetsPanelOpen: e.setAssetsPanelOpen,
		dramaAssetsPanelOpen: e.dramaAssetsPanelOpen,
		setDramaAssetsPanelOpen: e.setDramaAssetsPanelOpen,
		markDramaAssetsViewed: e.markDramaAssetsViewed,
		unreadDramaAssetCount: r(e.dramaAssets),
		dramaAssetCount: e.dramaAssets.characters.length + e.dramaAssets.scenes.length + e.dramaAssets.props.length,
		currentProjectId: e.currentProjectId,
		projects: e.projects,
		assetFolders: e.config.assetFolders,
		assetWaterfallColumns: e.config.assetWaterfallColumns,
		updateConfig: e.updateConfig,
		saveConfig: e.saveConfig
	}))), [O, Ee] = (0, v.useState)("project"), k = n ? "drama" : O, [A, De] = (0, v.useState)(null), [j, M] = (0, v.useState)(null), [N, Oe] = (0, v.useState)(null), [P, ke] = (0, v.useState)(""), Ae = (0, v.useDeferredValue)(P), F = S(Te), [je, Me] = (0, v.useState)([]), [Ne, Pe] = (0, v.useState)([]), [I, Fe] = (0, v.useState)({}), [Ie, Le] = (0, v.useState)(!1), [Re, L] = (0, v.useState)(!1), [ze, Be] = (0, v.useState)(null), [R, z] = (0, v.useState)(b), [B, V] = (0, v.useState)(!1), [Ve, He] = (0, v.useState)(null), [Ue, H] = (0, v.useState)(""), [U, W] = (0, v.useState)(!1), [We, Ge] = (0, v.useState)(!1), [G, Ke] = (0, v.useState)(Infinity), qe = (0, v.useRef)(null), Je = (0, v.useRef)(null), K = (0, v.useMemo)(() => we ?? [], [we]), q = (0, v.useCallback)((e) => {
		Be(e), setTimeout(() => Be(null), 2e3);
	}, []), Ye = (0, v.useCallback)((e) => {
		let t = S(i.getState().config.assetWaterfallColumns), n = S(t + e);
		n !== t && (E({ assetWaterfallColumns: n }), D({ silent: !0 }).catch(() => q("列数设置保存失败")));
	}, [
		D,
		q,
		E
	]), Xe = (0, v.useCallback)(async () => {
		try {
			let e = await o(), t = {};
			for (let n of e) n.tags?.length && (t[n.assetId] = n.tags);
			Fe(t);
		} catch {}
	}, []), J = (0, v.useCallback)(async () => {
		Le(!0);
		try {
			if (O === "project") {
				let e = A ?? T;
				if (!e) {
					Me([]);
					return;
				}
				let t = await ee(e), n = new Set(t.map((e) => e.path)), r = [];
				if (e === T) for (let e of i.getState().nodes) {
					let t = l(e.data);
					t && !n.has(t.path) && (r.push(t), n.add(t.path));
				}
				Me([...t, ...r]);
			} else {
				let [e, t] = await Promise.all([ne(), u(K)]), n = /* @__PURE__ */ new Set(), r = [];
				for (let i of [...e, ...t]) n.has(i.path) || (n.add(i.path), r.push(i));
				Pe(r);
			}
		} catch {} finally {
			Le(!1);
		}
	}, [
		O,
		T,
		A,
		K
	]);
	(0, v.useEffect)(() => {
		e && (J().then(Xe), de());
	}, [
		e,
		J,
		Xe
	]), (0, v.useEffect)(() => {
		!e || k !== "drama" || (w > 0 || i.getState().dramaAssets.lastViewedAt === void 0) && x();
	}, [
		e,
		x,
		w,
		k
	]);
	let Y = (0, v.useCallback)(() => {
		De(null), W(!1), t(!1);
	}, [t]), Ze = (0, v.useCallback)((e, n) => {
		he(e) && (n.preventDefault(), fe(e), t(!1));
	}, [t]);
	(0, v.useEffect)(() => {
		if (!e) return;
		let t = (e) => {
			e.key === "Escape" && Y();
		};
		return window.addEventListener("keydown", t), () => window.removeEventListener("keydown", t);
	}, [e, Y]);
	let Qe = (0, v.useRef)(null);
	(0, v.useEffect)(() => {
		if (!B) return;
		let e = (e) => {
			Qe.current && !Qe.current.contains(e.target) && V(!1);
		};
		return document.addEventListener("mousedown", e), () => document.removeEventListener("mousedown", e);
	}, [B]);
	let $e = O === "project" ? je : Ne, X = (0, v.useMemo)(() => $e.map((e) => I[C(e)] ? {
		...e,
		tags: I[C(e)]
	} : e), [$e, I]), Z = (0, v.useMemo)(() => {
		let e = {
			image: 0,
			video: 0,
			audio: 0,
			text: 0,
			other: 0
		};
		for (let t of X) e[t.category]++;
		return e;
	}, [X]), et = (0, v.useMemo)(() => {
		let e = /* @__PURE__ */ new Map();
		for (let t of X) for (let n of t.tags ?? []) e.set(n, (e.get(n) ?? 0) + 1);
		return [...e.entries()].sort((e, t) => t[1] - e[1]).slice(0, ge);
	}, [X]), tt = (0, v.useMemo)(() => ce.filter((e) => Z[e] > 0), [Z]), nt = (0, v.useCallback)(() => {
		let e = qe.current, t = Je.current;
		if (!e || !t) return;
		let n = window.getComputedStyle(e), r = e.clientWidth - (Number.parseFloat(n.paddingLeft) || 0) - (Number.parseFloat(n.paddingRight) || 0), i = Number.parseFloat(n.columnGap) || 0, a = Number.parseFloat(window.getComputedStyle(t).columnGap) || 0, o = Array.from(t.children), s = o.map((e) => {
			let t = window.getComputedStyle(e);
			return e.getBoundingClientRect().width + (Number.parseFloat(t.marginLeft) || 0) + (Number.parseFloat(t.marginRight) || 0);
		}), c = s.reduce((e, t) => e + t, 0) + Math.max(0, o.length - 1) * a > r + 1;
		if (Ge(c), !c) {
			Ke(o.length), W(!1);
			return;
		}
		if (U) {
			Ke(o.length);
			return;
		}
		let l = r - 28 - i, u = 0, d = 0;
		for (let e of s) {
			let t = u + (d > 0 ? a : 0) + e;
			if (t > l) break;
			u = t, d++;
		}
		o[d - 1]?.hasAttribute("data-filter-separator") && d--, Ke(d);
	}, [U]);
	(0, v.useEffect)(() => {
		if (!e || k === "drama") return;
		let t = qe.current;
		if (!t) return;
		let n = window.requestAnimationFrame(nt), r = new ResizeObserver(nt);
		return r.observe(t), () => {
			window.cancelAnimationFrame(n), r.disconnect();
		};
	}, [
		e,
		Z,
		nt,
		et,
		k
	]);
	let Q = (0, v.useMemo)(() => {
		let e = Ae.trim().toLowerCase();
		return X.filter((t) => {
			if (j && t.category !== j || N && !(t.tags ?? []).includes(N)) return !1;
			if (e) {
				let n = t.name.toLowerCase().includes(e), r = (t.tags ?? []).some((t) => t.toLowerCase().includes(e));
				if (!n && !r) return !1;
			}
			return !0;
		});
	}, [
		X,
		j,
		N,
		Ae
	]), rt = (0, v.useMemo)(() => Q.slice(0, R), [Q, R]), it = (0, v.useRef)(null);
	(0, v.useEffect)(() => {
		let e = it.current;
		if (!e) return;
		let t = new IntersectionObserver((e) => {
			e[0]?.isIntersecting && z((e) => e < Q.length ? e + b : e);
		}, { rootMargin: "300px" });
		return t.observe(e), () => t.disconnect();
	}, [Q.length, rt.length]);
	let at = (0, v.useCallback)(async () => {
		V(!1), L(!0);
		try {
			let e = await f();
			e > 0 && (q(`已添加 ${e} 个文件`), O === "permanent" && await J());
		} catch {
			q("添加失败");
		} finally {
			L(!1);
		}
	}, [
		O,
		J,
		q
	]), ot = (0, v.useCallback)(async () => {
		V(!1), L(!0);
		try {
			let e = await te();
			e && !K.includes(e) && (E({ assetFolders: [...K, e] }), await D(), q(`已添加文件夹: ${oe(e)}`), O === "permanent" && await J());
		} catch {
			q("添加失败");
		} finally {
			L(!1);
		}
	}, [
		K,
		E,
		D,
		O,
		J,
		q
	]), st = (0, v.useCallback)(async (e) => {
		E({ assetFolders: K.filter((t) => t !== e) }), await D(), O === "permanent" && await J();
	}, [
		K,
		E,
		D,
		O,
		J
	]), ct = (0, v.useCallback)(async (e) => {
		let t = await d(e);
		q(t ? `已保存: ${e.name}` : "保存失败"), t && O === "permanent" && await J();
	}, [
		O,
		J,
		q
	]), lt = (0, v.useCallback)(async (e) => {
		await re(e.path), Pe((t) => t.filter((t) => t.path !== e.path)), q(`已删除: ${e.name}`);
	}, [q]), $ = (0, v.useCallback)(async (e, t, n) => {
		Fe((t) => {
			let r = { ...t };
			return n.length ? r[e] = n : delete r[e], r;
		});
		try {
			n.length ? await s({
				assetId: e,
				path: t,
				tags: n,
				taggedBy: "manual",
				updatedAt: Date.now()
			}) : await a(e);
		} catch {}
	}, []), ut = (0, v.useCallback)((e, t) => {
		let n = t.trim();
		if (!n) return;
		let r = C(e), i = I[r] ?? [];
		i.includes(n) || $(r, e.path, [...i, n]);
	}, [I, $]), dt = (0, v.useCallback)((e, t) => {
		let n = C(e);
		$(n, e.path, (I[n] ?? []).filter((e) => e !== t));
	}, [I, $]), ft = (0, v.useCallback)((e) => {
		e === "drama" ? _(!0) : (Ee(e), _(!1)), M(null), Oe(null), He(null), z(b);
	}, [_]);
	return e ? /* @__PURE__ */ (0, y.jsx)(p, { children: e && /* @__PURE__ */ (0, y.jsxs)(y.Fragment, { children: [/* @__PURE__ */ (0, y.jsx)(m.div, {
		"data-tauri-drag-region": !0,
		className: "assets-panel-backdrop",
		variants: ye,
		initial: "hidden",
		animate: "visible",
		exit: "hidden",
		transition: { duration: .2 },
		onClick: Y
	}), /* @__PURE__ */ (0, y.jsx)("div", {
		className: "assets-panel-wrapper",
		children: /* @__PURE__ */ (0, y.jsxs)(m.div, {
			className: "assets-panel",
			variants: be,
			initial: "hidden",
			animate: "visible",
			exit: "exit",
			onClick: (e) => e.stopPropagation(),
			children: [
				/* @__PURE__ */ (0, y.jsxs)("div", {
					className: "assets-panel-header",
					children: [/* @__PURE__ */ (0, y.jsxs)("h2", {
						className: "assets-panel-title",
						children: ["资产管理", /* @__PURE__ */ (0, y.jsx)("span", {
							className: "assets-panel-subtitle",
							children: k === "drama" ? "管理人物、场景和道具简介与绑图" : "拖拽卡片到画布即可添加节点"
						})]
					}), /* @__PURE__ */ (0, y.jsx)(ie, { onClick: Y })]
				}),
				/* @__PURE__ */ (0, y.jsxs)("div", {
					className: "assets-tabs",
					children: [[
						"project",
						"permanent",
						"drama"
					].map((e) => /* @__PURE__ */ (0, y.jsxs)(m.button, {
						type: "button",
						className: `assets-tab ${k === e ? "active" : ""}`,
						onClick: () => ft(e),
						whileHover: { scale: k === e ? 1 : 1.03 },
						whileTap: { scale: .97 },
						children: [e === "project" ? "项目文件" : e === "permanent" ? "全局资产" : "创作资产", /* @__PURE__ */ (0, y.jsx)("span", {
							className: "assets-tab-count",
							children: e === "project" ? je.length : e === "permanent" ? Ne.length : Se
						})]
					}, e)), k === "drama" ? null : /* @__PURE__ */ (0, y.jsxs)("div", {
						className: "assets-toolbar ml-auto",
						children: [
							O === "project" && /* @__PURE__ */ (0, y.jsx)(ue, {
								className: "assets-project-select-wrap",
								triggerClassName: "assets-project-select",
								value: A ?? T ?? "",
								onChange: (e) => De(e || null),
								options: Ce.map((e) => ({
									value: e.id,
									label: e.id === T ? `${e.name}（当前）` : e.name
								}))
							}),
							/* @__PURE__ */ (0, y.jsxs)("div", {
								className: "assets-search",
								children: [
									/* @__PURE__ */ (0, y.jsxs)("svg", {
										width: "14",
										height: "14",
										viewBox: "0 0 24 24",
										fill: "none",
										stroke: "currentColor",
										strokeWidth: "2",
										children: [/* @__PURE__ */ (0, y.jsx)("circle", {
											cx: "11",
											cy: "11",
											r: "8"
										}), /* @__PURE__ */ (0, y.jsx)("line", {
											x1: "21",
											y1: "21",
											x2: "16.65",
											y2: "16.65"
										})]
									}),
									/* @__PURE__ */ (0, y.jsx)("input", {
										type: "text",
										placeholder: "搜索名称或标签…",
										value: P,
										onChange: (e) => {
											ke(e.target.value), z(b);
										}
									}),
									P && /* @__PURE__ */ (0, y.jsx)("button", {
										type: "button",
										className: "assets-search-clear",
										onClick: () => {
											ke(""), z(b);
										},
										"aria-label": "清空",
										children: /* @__PURE__ */ (0, y.jsxs)("svg", {
											width: "12",
											height: "12",
											viewBox: "0 0 24 24",
											fill: "none",
											stroke: "currentColor",
											strokeWidth: "2.5",
											children: [/* @__PURE__ */ (0, y.jsx)("line", {
												x1: "18",
												y1: "6",
												x2: "6",
												y2: "18"
											}), /* @__PURE__ */ (0, y.jsx)("line", {
												x1: "6",
												y1: "6",
												x2: "18",
												y2: "18"
											})]
										})
									})
								]
							}),
							/* @__PURE__ */ (0, y.jsxs)("div", {
								className: "assets-column-stepper",
								role: "group",
								"aria-label": "瀑布流列数",
								children: [
									/* @__PURE__ */ (0, y.jsx)(h, {
										icon: "lucide:columns-3",
										className: "assets-column-stepper-icon",
										"aria-hidden": "true"
									}),
									/* @__PURE__ */ (0, y.jsx)("button", {
										type: "button",
										"aria-label": "减少瀑布流列数",
										disabled: F <= _e,
										onClick: () => Ye(-1),
										children: /* @__PURE__ */ (0, y.jsx)(h, {
											icon: "lucide:minus",
											"aria-hidden": "true"
										})
									}),
									/* @__PURE__ */ (0, y.jsx)("output", {
										"aria-label": `当前 ${F} 列`,
										children: F
									}),
									/* @__PURE__ */ (0, y.jsx)("button", {
										type: "button",
										"aria-label": "增加瀑布流列数",
										disabled: F >= ve,
										onClick: () => Ye(1),
										children: /* @__PURE__ */ (0, y.jsx)(h, {
											icon: "lucide:plus",
											"aria-hidden": "true"
										})
									})
								]
							}),
							O === "permanent" && /* @__PURE__ */ (0, y.jsxs)("div", {
								className: "assets-add-wrap",
								ref: Qe,
								children: [/* @__PURE__ */ (0, y.jsxs)(m.button, {
									type: "button",
									className: "assets-add-btn",
									disabled: Re,
									onClick: () => V((e) => !e),
									whileHover: { scale: 1.03 },
									whileTap: { scale: .97 },
									children: [/* @__PURE__ */ (0, y.jsxs)("svg", {
										width: "14",
										height: "14",
										viewBox: "0 0 24 24",
										fill: "none",
										stroke: "currentColor",
										strokeWidth: "2.2",
										children: [/* @__PURE__ */ (0, y.jsx)("line", {
											x1: "12",
											y1: "5",
											x2: "12",
											y2: "19"
										}), /* @__PURE__ */ (0, y.jsx)("line", {
											x1: "5",
											y1: "12",
											x2: "19",
											y2: "12"
										})]
									}), "添加"]
								}), /* @__PURE__ */ (0, y.jsx)(p, { children: B && /* @__PURE__ */ (0, y.jsxs)(m.div, {
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
										transition: g
									},
									transition: le,
									children: [/* @__PURE__ */ (0, y.jsx)("button", {
										type: "button",
										onClick: at,
										children: "📄 添加文件"
									}), /* @__PURE__ */ (0, y.jsx)("button", {
										type: "button",
										onClick: ot,
										children: "📁 添加文件夹"
									})]
								}) })]
							})
						]
					})]
				}),
				k === "drama" ? /* @__PURE__ */ (0, y.jsx)(v.Suspense, {
					fallback: /* @__PURE__ */ (0, y.jsx)("div", {
						className: "flex flex-1 items-center justify-center text-xs text-canvas-text-muted",
						children: "正在加载短剧资产..."
					}),
					children: /* @__PURE__ */ (0, y.jsx)(me, {})
				}) : /* @__PURE__ */ (0, y.jsxs)(y.Fragment, { children: [
					O === "permanent" && K.length > 0 && /* @__PURE__ */ (0, y.jsx)("div", {
						className: "assets-folder-row",
						children: K.map((e) => /* @__PURE__ */ (0, y.jsxs)("span", {
							className: "assets-folder-chip",
							children: [
								"📁 ",
								oe(e),
								/* @__PURE__ */ (0, y.jsx)("button", {
									type: "button",
									onClick: () => st(e),
									"aria-label": "移除",
									children: "×"
								})
							]
						}, e))
					}),
					/* @__PURE__ */ (0, y.jsxs)("div", {
						ref: qe,
						className: `assets-category-row ${U ? "expanded" : ""}`,
						children: [/* @__PURE__ */ (0, y.jsxs)("div", {
							ref: Je,
							id: "assets-filter-list",
							className: "assets-category-list",
							children: [
								/* @__PURE__ */ (0, y.jsxs)("button", {
									type: "button",
									className: `assets-cat-chip ${j === null ? "active" : ""} ${U || G > 0 ? "" : "assets-filter-item-hidden"}`,
									onClick: () => {
										M(null), z(b);
									},
									children: ["全部", /* @__PURE__ */ (0, y.jsx)("span", {
										className: "assets-cat-count",
										children: X.length
									})]
								}),
								tt.map((e, t) => /* @__PURE__ */ (0, y.jsxs)("button", {
									type: "button",
									className: `assets-cat-chip ${j === e ? "active" : ""} ${U || t + 1 < G ? "" : "assets-filter-item-hidden"}`,
									onClick: () => {
										M(e), z(b);
									},
									children: [
										se[e],
										" ",
										c[e],
										/* @__PURE__ */ (0, y.jsx)("span", {
											className: "assets-cat-count",
											children: Z[e]
										})
									]
								}, e)),
								et.length > 0 && /* @__PURE__ */ (0, y.jsx)("span", {
									"data-filter-separator": !0,
									className: `assets-chip-sep ${U || tt.length + 1 < G ? "" : "assets-filter-item-hidden"}`
								}),
								et.map(([e, t], n) => /* @__PURE__ */ (0, y.jsxs)("button", {
									type: "button",
									className: `assets-cat-chip assets-tag-chip ${N === e ? "active" : ""} ${U || tt.length + n + 2 < G ? "" : "assets-filter-item-hidden"}`,
									onClick: () => {
										Oe((t) => t === e ? null : e), z(b);
									},
									children: [
										"#",
										e,
										/* @__PURE__ */ (0, y.jsx)("span", {
											className: "assets-cat-count",
											children: t
										})
									]
								}, e))
							]
						}), We && /* @__PURE__ */ (0, y.jsx)("button", {
							type: "button",
							className: "assets-filter-more",
							"aria-controls": "assets-filter-list",
							"aria-expanded": U,
							"aria-label": U ? "收起标签" : "展开更多标签",
							title: U ? "收起标签" : "更多标签",
							onClick: () => W((e) => !e),
							children: /* @__PURE__ */ (0, y.jsx)(h, {
								icon: U ? "lucide:chevron-up" : "lucide:ellipsis",
								"aria-hidden": "true"
							})
						})]
					}),
					/* @__PURE__ */ (0, y.jsx)("div", {
						className: "assets-file-scroll-shell",
						children: /* @__PURE__ */ (0, y.jsx)("div", {
							className: "assets-file-scroll",
							children: /* @__PURE__ */ (0, y.jsx)("div", {
								className: "assets-file-waterfall",
								"data-columns": F,
								children: Ie ? /* @__PURE__ */ (0, y.jsxs)("div", {
									className: "assets-empty",
									children: [/* @__PURE__ */ (0, y.jsx)(m.div, {
										className: "assets-spinner",
										animate: { rotate: 360 },
										transition: {
											repeat: Infinity,
											duration: .6,
											ease: "linear"
										}
									}), /* @__PURE__ */ (0, y.jsx)("span", { children: "加载中..." })]
								}) : Q.length === 0 ? /* @__PURE__ */ (0, y.jsxs)("div", {
									className: "assets-empty",
									children: [/* @__PURE__ */ (0, y.jsxs)("svg", {
										width: "40",
										height: "40",
										viewBox: "0 0 24 24",
										fill: "none",
										stroke: "currentColor",
										strokeWidth: "1",
										opacity: "0.3",
										children: [
											/* @__PURE__ */ (0, y.jsx)("path", { d: "M14 2H6a2 2 0 0 0-2 2v16a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8z" }),
											/* @__PURE__ */ (0, y.jsx)("polyline", { points: "14 2 14 8 20 8" }),
											/* @__PURE__ */ (0, y.jsx)("line", {
												x1: "9",
												y1: "15",
												x2: "15",
												y2: "15"
											})
										]
									}), /* @__PURE__ */ (0, y.jsx)("span", { children: P || j || N ? "没有匹配的文件" : O === "project" ? "暂无项目文件" : "暂无文件，点击「添加」导入" })]
								}) : /* @__PURE__ */ (0, y.jsxs)(y.Fragment, { children: [/* @__PURE__ */ (0, y.jsx)("div", {
									className: "assets-waterfall-cols",
									children: pe(rt, F).map((e, t) => /* @__PURE__ */ (0, y.jsx)("div", {
										className: "assets-waterfall-col",
										children: e.map((e) => /* @__PURE__ */ (0, y.jsx)(xe, {
											file: e,
											isProject: O === "project",
											draggable: he(e),
											onDragStart: (t) => Ze(e, t),
											editing: Ve === C(e),
											tagDraft: Ve === C(e) ? Ue : "",
											onToggleEdit: () => {
												let t = C(e);
												He((e) => e === t ? null : t), H("");
											},
											onTagDraftChange: H,
											onAddTag: (t) => {
												ut(e, t), H("");
											},
											onRemoveTag: (t) => dt(e, t),
											onSave: () => ct(e),
											onDelete: () => lt(e)
										}, C(e)))
									}, t))
								}), R < Q.length && /* @__PURE__ */ (0, y.jsx)("div", {
									ref: it,
									className: "assets-load-sentinel",
									children: "加载更多…"
								})] })
							})
						})
					})
				] }),
				/* @__PURE__ */ (0, y.jsx)(p, { children: ze && /* @__PURE__ */ (0, y.jsx)(m.div, {
					className: "assets-toast",
					initial: {
						opacity: 0,
						y: 12,
						scale: .92
					},
					animate: {
						opacity: 1,
						y: 0,
						scale: 1
					},
					exit: {
						opacity: 0,
						y: -8,
						scale: .92,
						transition: g
					},
					transition: le,
					children: ze
				}) })
			]
		})
	})] }) }) : null;
}
function xe({ file: e, isProject: t, draggable: n, onDragStart: r, editing: i, tagDraft: a, onToggleEdit: o, onTagDraftChange: s, onAddTag: c, onRemoveTag: l, onSave: u, onDelete: d }) {
	let f = e.tags ?? [];
	return /* @__PURE__ */ (0, y.jsxs)("div", {
		className: "assets-waterfall-card anim-card-in",
		draggable: n,
		onDragStart: r,
		children: [
			/* @__PURE__ */ (0, y.jsx)(_, {
				assetUrl: e.assetUrl,
				name: e.name,
				category: e.category,
				size: e.size,
				badge: e.source === "folder" ? "外部" : void 0,
				children: /* @__PURE__ */ (0, y.jsx)(Se, {
					isProject: t,
					onSave: u,
					onDelete: d,
					onToggleEdit: o
				})
			}),
			(f.length > 0 || i) && /* @__PURE__ */ (0, y.jsxs)("div", {
				className: "assets-card-tags",
				children: [f.map((e) => /* @__PURE__ */ (0, y.jsxs)("span", {
					className: "assets-card-tag",
					children: [e, i && /* @__PURE__ */ (0, y.jsx)("button", {
						type: "button",
						onClick: () => l(e),
						"aria-label": "移除标签",
						children: "×"
					})]
				}, e)), i && /* @__PURE__ */ (0, y.jsx)("input", {
					className: "assets-tag-input",
					autoFocus: !0,
					value: a,
					placeholder: "加标签…",
					onChange: (e) => s(e.target.value),
					onKeyDown: (e) => {
						e.key === "Enter" && (e.preventDefault(), c(a));
					},
					onBlur: () => {
						a.trim() && c(a);
					}
				})]
			}),
			!t && /* @__PURE__ */ (0, y.jsx)("div", {
				className: "assets-card-name",
				children: e.name
			})
		]
	});
}
function Se({ isProject: e, onSave: t, onDelete: n, onToggleEdit: r }) {
	return /* @__PURE__ */ (0, y.jsxs)("div", {
		className: "assets-card-actions",
		children: [/* @__PURE__ */ (0, y.jsx)("button", {
			type: "button",
			className: "assets-card-action-btn",
			onClick: r,
			children: /* @__PURE__ */ (0, y.jsxs)("svg", {
				width: "14",
				height: "14",
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				children: [/* @__PURE__ */ (0, y.jsx)("path", { d: "M20.59 13.41l-7.17 7.17a2 2 0 0 1-2.83 0L2 12V2h10l8.59 8.59a2 2 0 0 1 0 2.82z" }), /* @__PURE__ */ (0, y.jsx)("line", {
					x1: "7",
					y1: "7",
					x2: "7.01",
					y2: "7"
				})]
			})
		}), e ? /* @__PURE__ */ (0, y.jsx)("button", {
			type: "button",
			className: "assets-card-action-btn",
			onClick: t,
			children: /* @__PURE__ */ (0, y.jsx)("svg", {
				width: "14",
				height: "14",
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				children: /* @__PURE__ */ (0, y.jsx)("path", { d: "M19 21l-7-5-7 5V5a2 2 0 0 1 2-2h10a2 2 0 0 1 2 2z" })
			})
		}) : /* @__PURE__ */ (0, y.jsx)("button", {
			type: "button",
			className: "assets-card-action-btn assets-card-delete",
			onClick: n,
			children: /* @__PURE__ */ (0, y.jsxs)("svg", {
				width: "14",
				height: "14",
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2",
				children: [/* @__PURE__ */ (0, y.jsx)("polyline", { points: "3 6 5 6 21 6" }), /* @__PURE__ */ (0, y.jsx)("path", { d: "M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6m3 0V4a2 2 0 0 1 2-2h4a2 2 0 0 1 2 2v2" })]
			})
		})]
	});
}
//#endregion
export { w as default };
