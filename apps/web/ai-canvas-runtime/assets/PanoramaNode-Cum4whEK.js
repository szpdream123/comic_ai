import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./jsx-runtime-BAkIPmuO.js";
import { a as r } from "./i18n-on3r1DCI.js";
import { Ei as i, F as a, M as o, N as s, P as c, ri as l, t as u, zi as d } from "./useAppStore-CcUL4Jo0.js";
import { g as f } from "./directorSceneSchema-BcP-NXqL.js";
import { C as p } from "./fileService-zQLozbOU.js";
import { F as m, L as h, N as g, R as _, Rt as v } from "./useTooltipAutoPlacement-BSvTkR9V.js";
import { n as y } from "./rasterImageDimensions-CX1VK2cM.js";
import { a as b, c as x, o as S, s as C, t as w } from "./ResizeHandle-DEPb0GHe.js";
import { a as T, l as E, n as D, o as O, r as k, s as A, t as j } from "./useSourceFileUpload-B2rAtvpA.js";
import { t as M } from "./FullscreenOverlay-Dpw1A125.js";
//#region src/components/nodes/shared/PanoramaNodeToolbar.tsx
var N = /* @__PURE__ */ e(t(), 1), P = n();
function F({ nodeId: e, onUpload: t, onToggleMode: n, previewMode: r, onScreenshot: i, onFullscreen: a }) {
	let o = "ai-panorama", s = A({ nodeType: o }), c = s.registry, l = k({ nodeId: e }), d = u((e) => e.userPresets), f = u((e) => e.addNodeWithEdge), p = (0, N.useCallback)((t) => (n) => {
		n.stopPropagation();
		let r = u.getState().nodes.find((t) => t.id === e);
		if (!r) return;
		let i = r.data?.prompt ?? "", a = u.getState().userPresets, s = h(t, o, i, a);
		if (!s) return;
		let { node: c, edge: l } = m(r, s);
		f(c, l), g(c.id, c.data.prompt, s.postProcess, c.data);
	}, [e, f]), b = {
		upload: (e) => {
			e.stopPropagation(), t?.();
		},
		toggleMode: (e) => {
			e.stopPropagation(), n?.();
		},
		screenshot: (e) => {
			e.stopPropagation(), i?.();
		},
		fullscreen: (e) => {
			e.stopPropagation(), a?.();
		}
	}, x = E(c, s.activeButtonKeys), S = (e) => {
		let t = l.renderButton(e);
		if (t) return t;
		let n = c.find((t) => t.key === e), i = b[e], a = !n, s = n ? null : _(e, o, d);
		if (!n && !s) return null;
		let u = n ?? {
			key: e,
			label: s.label,
			icon: s.icon,
			defaultZone: ""
		}, f = i ?? p(e);
		return e === "toggleMode" ? /* @__PURE__ */ (0, P.jsx)(v, {
			className: "ftb-btn icon-only act-mode",
			"data-tooltip": r === "360" ? "切换到图片视图" : "切换到360全景",
			"aria-label": "切换视图模式",
			onClick: f,
			children: r === "360" ? /* @__PURE__ */ (0, P.jsx)(y, {
				icon: "mdi:image-outline",
				width: 14,
				height: 14
			}) : /* @__PURE__ */ (0, P.jsx)(y, {
				icon: "mdi:rotate-3d",
				width: 14,
				height: 14
			})
		}, e) : /* @__PURE__ */ (0, P.jsx)(v, {
			className: `ftb-btn icon-only${a ? " act-preset" : ""}`,
			"data-tooltip": u.label,
			"aria-label": u.label,
			onClick: f,
			children: /* @__PURE__ */ (0, P.jsx)(y, {
				icon: u.icon,
				width: 14,
				height: 14
			})
		}, e);
	};
	return s.isEditing ? /* @__PURE__ */ (0, P.jsx)(O, {
		edit: s,
		nodeType: o
	}) : /* @__PURE__ */ (0, P.jsxs)(P.Fragment, { children: [/* @__PURE__ */ (0, P.jsx)("div", {
		className: "node-floating-toolbar pano-toolbar nodrag",
		...s.longPressHandlers,
		children: /* @__PURE__ */ (0, P.jsx)("div", {
			className: "pano-toolbar-main nodrag",
			children: s.layout.zones.map((e, t) => /* @__PURE__ */ (0, P.jsxs)("div", {
				className: "img-toolbar-zone nodrag",
				children: [e.buttonKeys.map((e) => e === "more" ? /* @__PURE__ */ (0, P.jsx)(T, {
					items: x,
					renderItem: S
				}, e) : S(e)), t < s.layout.zones.length - 1 && /* @__PURE__ */ (0, P.jsx)("div", { className: "ftb-divider pano-toolbar-divider" })]
			}, e.id))
		})
	}), l.dialog] });
}
var I = (0, N.memo)(F), L = (0, N.forwardRef)(function({ imageUrl: e, onLoad: t, onError: n }, r) {
	return (0, N.useImperativeHandle)(r, () => ({ captureScreenshot: () => null }), []), N.createElement("img", {
		src: e,
		alt: "Panorama",
		style: {
			width: "100%",
			height: "100%",
			objectFit: "cover"
		},
		onLoad: t,
		onError: () => n?.("无法加载全景图")
	});
}), R = 4;
function z(e, t) {
	return !t || t <= 0 ? Promise.resolve(e) : new Promise((n) => {
		let r = new Image();
		r.onload = () => {
			let e = r.naturalWidth, i = r.naturalHeight;
			if (!e || !i) {
				n(null);
				return;
			}
			let a = e, o = i;
			e / i > t ? a = Math.round(i * t) : o = Math.round(e / t);
			let s = document.createElement("canvas");
			s.width = a, s.height = o;
			let c = s.getContext("2d");
			if (!c) {
				n(null);
				return;
			}
			c.drawImage(r, Math.round((e - a) / 2), Math.round((i - o) / 2), a, o, 0, 0, a, o), n(s.toDataURL("image/png"));
		}, r.onerror = () => n(null), r.src = e;
	});
}
var B = (0, N.forwardRef)(function({ imageUrl: e, interactive: t = !1, onActivate: n }, i) {
	let a = r(), o = (0, N.useRef)(null), s = (0, N.useRef)(null), [c, l] = (0, N.useState)(0), [u, d] = (0, N.useState)(!0), [f, p] = (0, N.useState)(null);
	return (0, N.useEffect)(() => {
		d(!0), p(null);
	}, [e]), (0, N.useImperativeHandle)(i, () => ({ async captureScreenshot(e) {
		let t = o.current?.captureScreenshot();
		return t ? z(t, e) : null;
	} }), []), /* @__PURE__ */ (0, P.jsxs)("div", {
		className: `xiaoluo-pano-shell is-compact${t ? " is-interactive nodrag nowheel" : ""}`,
		"data-ui-stop": "1",
		children: [
			/* @__PURE__ */ (0, P.jsx)(L, {
				ref: o,
				imageUrl: e,
				initialPitch: 0,
				initialYaw: 180,
				initialHfov: 95,
				onLoad: () => {
					d(!1), p(null);
				},
				onError: (e) => {
					d(!1), p(e || a("无法加载全景图"));
				}
			}, c),
			u ? /* @__PURE__ */ (0, P.jsxs)("div", {
				className: "xiaoluo-pano-status",
				role: "status",
				children: [/* @__PURE__ */ (0, P.jsx)("span", { className: "spinner" }), /* @__PURE__ */ (0, P.jsx)("span", { children: a("载入中...") })]
			}) : null,
			t ? /* @__PURE__ */ (0, P.jsx)("div", {
				className: "xiaoluo-pano-active-badge",
				children: a("视角模式 · Esc 退出")
			}) : !u && !f ? /* @__PURE__ */ (0, P.jsx)("div", {
				className: "xiaoluo-pano-veil",
				onPointerDown: (e) => {
					s.current = {
						x: e.clientX,
						y: e.clientY
					};
				},
				onPointerUp: (e) => {
					let t = s.current;
					s.current = null, t && Math.hypot(e.clientX - t.x, e.clientY - t.y) <= R && n?.();
				},
				onPointerCancel: () => {
					s.current = null;
				},
				children: /* @__PURE__ */ (0, P.jsxs)("span", {
					className: "xiaoluo-pano-veil-hint",
					children: [/* @__PURE__ */ (0, P.jsx)(y, {
						icon: "lucide:move-3d",
						width: "12",
						height: "12"
					}), a("点击转动视角")]
				})
			}) : null,
			f ? /* @__PURE__ */ (0, P.jsxs)("div", {
				className: "xiaoluo-pano-status is-error",
				role: "alert",
				children: [
					/* @__PURE__ */ (0, P.jsx)(y, {
						icon: "mdi:image-broken-variant",
						width: "22",
						height: "22"
					}),
					/* @__PURE__ */ (0, P.jsx)("span", { children: f }),
					/* @__PURE__ */ (0, P.jsx)("button", {
						type: "button",
						className: "xiaoluo-pano-retry",
						onClick: () => {
							p(null), d(!0), l((e) => e + 1);
						},
						children: a("重试")
					})
				]
			}) : null
		]
	});
}), V = (0, N.memo)(B), H = (0, N.lazy)(() => import("./XiaoLuoPanoramaFullscreen-DnryoPLh.js"));
function U(e) {
	return new Promise((t) => {
		let n = new Image();
		n.onload = () => {
			if (!n.naturalWidth || !n.naturalHeight) {
				t(null);
				return;
			}
			t(n.naturalWidth / n.naturalHeight);
		}, n.onerror = () => t(null), n.src = e;
	});
}
function W({ id: e, data: t, selected: n }) {
	let r = D(t.status), m = u((e) => e.updateNodeData), h = u((e) => e.updateNodeDataTransient), g = u((e) => e.commitToHistory), _ = u((e) => e.config.theme), v = t.nodeWidth || 280, T = t.nodeHeight || 200, E = (0, N.useRef)(null), O = (0, N.useRef)(null), k = (0, N.useRef)(!1), [A, F] = (0, N.useState)(!1), L = t.previewMode || "image", R = t.panoFullscreen || !1, z = t.imageUrl || t.thumbnailUrl || "", B = (0, N.useCallback)((t, n) => {
		h(e, {
			nodeWidth: t,
			nodeHeight: n
		});
	}, [e, h]), W = (0, N.useCallback)(() => {
		F(!1), h(e, { previewMode: L === "360" ? "image" : "360" });
	}, [
		e,
		L,
		h
	]), G = (0, N.useCallback)(() => {
		R ? (F(k.current), k.current = !1) : (k.current = A, F(!1)), h(e, { panoFullscreen: !R });
	}, [
		e,
		R,
		A,
		h
	]), K = (0, N.useCallback)(async (t, n) => {
		let r = () => {
			let e = c(n, u.getState());
			return e || o(n), e;
		}, i = `全景截图-${Date.now()}`, a = f(i, "png", "panorama-screenshot"), d = await U(t);
		if (!r()) return !1;
		let m = t, h;
		try {
			let e = await p(t, n.projectId, a);
			e && (m = e.assetUrl || t, h = e.filePath);
		} catch {}
		if (!r()) return !1;
		let g = u.getState(), _ = g.nodes.find((t) => t.id === e)?.position ?? {
			x: 0,
			y: 0
		}, y = v, b = d ? Math.round(y / d) : T;
		return g.addNode({
			id: `node-${l()}`,
			type: "ai-image",
			position: {
				x: _.x + y + 60,
				y: _.y
			},
			data: {
				label: i,
				type: "ai-image",
				role: "source",
				status: "success",
				imageUrl: m,
				filePath: h,
				fileName: a,
				nodeWidth: y,
				nodeHeight: b
			}
		}), s(n), g.showToast("截图已创建为图片节点", "success"), !0;
	}, [
		e,
		T,
		v
	]), q = (0, N.useCallback)(async () => {
		let t = u.getState(), n = a(t, e);
		if (!n) {
			t.showToast("全景节点已失效，请重试", "error");
			return;
		}
		let r;
		try {
			r = await E.current?.captureScreenshot();
		} catch {
			o(n), u.getState().currentProjectId === n.projectId && u.getState().showToast("截图失败", "error");
			return;
		}
		if (!r) {
			let e = c(n, u.getState());
			o(n), e && u.getState().showToast("截图失败", "error");
			return;
		}
		await K(r, n);
	}, [K, e]), ee = (0, N.useCallback)(async ({ dataUrl: t }) => {
		let n = a(u.getState(), e);
		n && await K(t, n);
	}, [K, e]), { isUploading: J, handleUpload: Y } = j(".png,.jpg,.jpeg,.webp"), X = (0, N.useCallback)(async () => {
		let t = await Y();
		if (!t) return;
		let n = new Image();
		n.src = t.dataUrl, await new Promise((e) => {
			n.onload = () => e(), n.onerror = () => e();
		});
		let r = Math.max(160, Math.min(280, n.naturalWidth || 280)), i = r - 4, a = Math.round(i / 2) + 4;
		m(e, {
			imageUrl: t.dataUrl,
			filePath: t.filePath,
			fileName: t.fileName,
			label: t.fileName,
			status: "success",
			previewMode: "360",
			nodeWidth: r,
			nodeHeight: a,
			imageWidth: n.naturalWidth || r,
			imageHeight: n.naturalHeight || a
		});
	}, [
		e,
		m,
		Y
	]), { displayLabel: te, handleRename: ne } = b(e, t, "360全景图"), Z = !!z, Q = Z && L === "360", re = Z && L === "image", $ = Q && A;
	(0, N.useEffect)(() => {
		if (!$ || R) return;
		let e = (e) => {
			let t = e.target;
			t && O.current?.contains(t) || F(!1);
		}, t = (e) => {
			e.key === "Escape" && F(!1);
		};
		return document.addEventListener("pointerdown", e, !0), window.addEventListener("keydown", t), () => {
			document.removeEventListener("pointerdown", e, !0), window.removeEventListener("keydown", t);
		};
	}, [$, R]);
	let ie = (0, N.useCallback)(() => {
		Z && (k.current = A, F(!1), h(e, { panoFullscreen: !0 }));
	}, [
		Z,
		e,
		A,
		h
	]);
	return /* @__PURE__ */ (0, P.jsxs)(P.Fragment, { children: [/* @__PURE__ */ (0, P.jsxs)("div", {
		ref: O,
		className: "node-wrapper",
		style: { width: v },
		children: [
			/* @__PURE__ */ (0, P.jsx)(x, {
				kind: "ai-panorama",
				label: te,
				displayId: t.displayId,
				nodeId: e,
				onRename: ne
			}),
			/* @__PURE__ */ (0, P.jsxs)("div", {
				className: `node pano-node ${n ? "selected" : ""} ${$ ? "is-pano-active" : ""} ${t.status === "loading" || J ? "loading" : ""} ${r ? "just-completed" : ""}`,
				style: { height: T },
				children: [
					/* @__PURE__ */ (0, P.jsxs)("div", {
						className: "node-preview compact",
						onDoubleClick: (e) => {
							e.stopPropagation(), ie();
						},
						children: [!Z && /* @__PURE__ */ (0, P.jsx)("button", {
							type: "button",
							className: "node-upload-btn",
							onClick: (e) => {
								e.stopPropagation(), X();
							},
							"data-tooltip": "上传全景图",
							"aria-label": "上传全景图",
							children: /* @__PURE__ */ (0, P.jsx)(y, {
								icon: "mdi:upload",
								width: "14",
								height: "14"
							})
						}), R && Z ? /* @__PURE__ */ (0, P.jsx)("div", {
							className: "node-preview-placeholder",
							"aria-hidden": "true",
							children: /* @__PURE__ */ (0, P.jsx)(y, {
								icon: "mdi:panorama-sphere-outline",
								width: "36",
								height: "36"
							})
						}) : Q ? /* @__PURE__ */ (0, P.jsx)(V, {
							ref: E,
							imageUrl: z,
							interactive: $,
							onActivate: () => F(!0)
						}) : re ? /* @__PURE__ */ (0, P.jsx)("div", {
							className: "image-preview-container",
							children: /* @__PURE__ */ (0, P.jsx)("img", {
								src: z,
								alt: "360 Panorama",
								className: "image-preview-img compact"
							})
						}) : J ? /* @__PURE__ */ (0, P.jsxs)("div", {
							className: "node-preview-loading",
							children: [/* @__PURE__ */ (0, P.jsx)("div", { className: "spinner large" }), /* @__PURE__ */ (0, P.jsx)("span", { children: "上传中..." })]
						}) : t.status === "loading" ? /* @__PURE__ */ (0, P.jsxs)("div", {
							className: "node-preview-loading",
							children: [/* @__PURE__ */ (0, P.jsx)("div", { className: "spinner large" }), /* @__PURE__ */ (0, P.jsx)("span", { children: "生成全景图中..." })]
						}) : /* @__PURE__ */ (0, P.jsxs)("div", {
							className: "node-preview-placeholder",
							children: [/* @__PURE__ */ (0, P.jsx)(y, {
								icon: "mdi:panorama-sphere-outline",
								width: "36",
								height: "36"
							}), /* @__PURE__ */ (0, P.jsx)("span", {
								className: "text-xs text-canvas-text-muted mt-1",
								children: "上传全景图或连线生成"
							})]
						})]
					}),
					t.error && /* @__PURE__ */ (0, P.jsx)(C, {
						nodeId: e,
						message: t.error
					}),
					/* @__PURE__ */ (0, P.jsx)(i, {
						type: "source",
						position: d.Left,
						id: "left",
						className: "node-handle handle-source handle-panorama",
						children: /* @__PURE__ */ (0, P.jsx)(S, {
							className: "gooey-btn-left",
							hue: 180
						})
					}),
					/* @__PURE__ */ (0, P.jsx)(i, {
						type: "source",
						position: d.Right,
						id: "right",
						className: "node-handle handle-source handle-panorama",
						children: /* @__PURE__ */ (0, P.jsx)(S, {
							className: "gooey-btn-right",
							hue: 180
						})
					})
				]
			}),
			/* @__PURE__ */ (0, P.jsx)(w, {
				nodeId: e,
				currentWidth: v,
				currentHeight: T,
				minWidth: 160,
				minHeight: 120,
				onResizeStart: g,
				onResizeEnd: g,
				onResize: B
			}),
			Z && /* @__PURE__ */ (0, P.jsx)("div", {
				className: `node-toolbar-shell ${n ? "is-visible" : ""}`,
				children: /* @__PURE__ */ (0, P.jsx)(I, {
					nodeId: e,
					onUpload: X,
					onToggleMode: W,
					previewMode: L,
					onScreenshot: q,
					onFullscreen: G
				})
			})
		]
	}), /* @__PURE__ */ (0, P.jsx)(M, {
		isOpen: R && Z,
		onClose: G,
		title: t.label || "360全景图",
		panelWidth: "calc(100vw - 24px)",
		className: "pano-original-overlay",
		hideHeader: !0,
		bodyClassName: "fullscreen-body--pano",
		unmountOnClose: !0,
		children: R && Z && /* @__PURE__ */ (0, P.jsx)(N.Suspense, {
			fallback: /* @__PURE__ */ (0, P.jsx)("div", {
				className: "pano-fullscreen-loading",
				children: /* @__PURE__ */ (0, P.jsx)("span", { className: "spinner" })
			}),
			children: /* @__PURE__ */ (0, P.jsx)(H, {
				imageUrl: z,
				theme: _ === "light" ? "light" : "dark",
				onClose: G,
				onCapture: ee
			})
		})
	})] });
}
var G = (0, N.memo)(W);
//#endregion
export { G as default };
