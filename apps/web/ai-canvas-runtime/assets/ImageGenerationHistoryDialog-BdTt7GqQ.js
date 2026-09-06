import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./react-dom-BhFnNZvF.js";
import { t as r } from "./jsx-runtime-BAkIPmuO.js";
import { a as i } from "./i18n-on3r1DCI.js";
import { t as a } from "./useAppStore-BH-MdRLu.js";
import { i as o } from "./core-D3lATfku.js";
import { D as s } from "./indexedDbService-CqWFA8LG.js";
import { t as c } from "./ViewportImage-txaOn4PW.js";
import { t as l } from "./ModalOverlay-B0YAfIbK.js";
import { Nt as u } from "./useTooltipAutoPlacement-D1FArkVS.js";
import { n as d } from "./rasterImageDimensions-CX1VK2cM.js";
import { t as f } from "./FullscreenOverlay-BTKONk6M.js";
import { t as p } from "./ZoomableImage-CnLO6UOe.js";
//#region src/components/nodes/shared/image/ImageGenerationHistoryDialog.tsx
var m = /* @__PURE__ */ e(t(), 1), h = n(), g = r(), _ = new Intl.DateTimeFormat("zh-CN", {
	month: "numeric",
	day: "numeric",
	hour: "2-digit",
	minute: "2-digit"
});
function v(e) {
	return e.mediaUrl || e.output || "";
}
function y(e) {
	if (e.filePath) try {
		return o(e.filePath);
	} catch {}
	return v(e);
}
function b({ entry: e, onPreview: t }) {
	let n = i(), r = v(e), [a, o] = (0, m.useState)(() => y(e)), [s, l] = (0, m.useState)(!1), u = (0, m.useCallback)(() => {
		if (r && a !== r) {
			o(r);
			return;
		}
		l(!0);
	}, [r, a]);
	if (!a || s) return /* @__PURE__ */ (0, g.jsx)("div", {
		className: "flex aspect-[4/3] items-center justify-center bg-canvas-bg text-canvas-text-muted",
		children: /* @__PURE__ */ (0, g.jsx)(d, {
			icon: "mdi:image-off-outline",
			width: 24,
			height: 24,
			"aria-hidden": "true"
		})
	});
	let f = e.prompt.trim() || n("历史生成图片");
	return /* @__PURE__ */ (0, g.jsxs)("button", {
		type: "button",
		className: "group relative block aspect-[4/3] w-full overflow-hidden bg-canvas-bg focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-inset focus-visible:ring-green-400/70",
		"aria-label": n("放大查看历史图片"),
		onClick: () => t({
			src: a,
			alt: f
		}),
		children: [/* @__PURE__ */ (0, g.jsx)(c, {
			src: a,
			alt: f,
			loading: "lazy",
			decoding: "async",
			rootMargin: "360px 0px",
			unloadDelayMs: 800,
			className: "h-full w-full object-cover transition-transform duration-200 group-hover:scale-[1.02] motion-reduce:transform-none",
			onError: u
		}), /* @__PURE__ */ (0, g.jsx)("span", {
			className: "absolute bottom-2 right-2 flex h-7 w-7 items-center justify-center rounded-md bg-black/60 text-white opacity-0 backdrop-blur-sm transition-opacity group-hover:opacity-100 group-focus-visible:opacity-100",
			children: /* @__PURE__ */ (0, g.jsx)(d, {
				icon: "mdi:magnify-plus-outline",
				width: 16,
				height: 16,
				"aria-hidden": "true"
			})
		})]
	});
}
function x({ isOpen: e, nodeId: t, onClose: n }) {
	let r = i(), o = a((e) => e.currentProjectId), [c, v] = (0, m.useState)([]), [y, x] = (0, m.useState)(null), [S, C] = (0, m.useState)(!1), [w, T] = (0, m.useState)(""), [E, D] = (0, m.useState)(0), [O, k] = (0, m.useState)(null);
	(0, m.useEffect)(() => {
		if (!e || !o) return;
		let n = !0;
		return Promise.resolve().then(async () => {
			if (n) {
				C(!0), T("");
				try {
					let e = await s(o, t);
					n && (v(e), x(o));
				} catch {
					n && (v([]), x(o), T(r("生成历史加载失败")));
				} finally {
					n && C(!1);
				}
			}
		}), () => {
			n = !1;
		};
	}, [
		o,
		e,
		E,
		t,
		r
	]);
	let A = (0, m.useMemo)(() => y === o ? c.filter((e) => e.nodeType === "ai-image" && e.status === "success" && !!(e.filePath || e.mediaUrl || e.output)) : [], [
		o,
		c,
		y
	]), j = (0, m.useCallback)(() => {
		k(null), n();
	}, [n]);
	return (0, h.createPortal)(/* @__PURE__ */ (0, g.jsxs)(g.Fragment, { children: [O === null && /* @__PURE__ */ (0, g.jsxs)(l, {
		isOpen: e,
		onClose: j,
		ariaLabel: r("图片生成历史"),
		className: "max-h-[82vh] w-[min(94vw,880px)] rounded-lg border-canvas-border bg-canvas-surface",
		children: [/* @__PURE__ */ (0, g.jsxs)("div", {
			className: "flex shrink-0 items-center gap-3 border-b border-canvas-border px-4 py-3",
			children: [
				/* @__PURE__ */ (0, g.jsx)("span", {
					className: "flex h-8 w-8 items-center justify-center rounded-md bg-green-500/10 text-green-400",
					children: /* @__PURE__ */ (0, g.jsx)(d, {
						icon: "mdi:history",
						width: 18,
						height: 18,
						"aria-hidden": "true"
					})
				}),
				/* @__PURE__ */ (0, g.jsxs)("div", {
					className: "min-w-0 flex-1",
					children: [/* @__PURE__ */ (0, g.jsx)("h2", {
						className: "text-sm font-semibold text-canvas-text",
						children: r("生成历史")
					}), /* @__PURE__ */ (0, g.jsx)("p", {
						className: "text-[11px] text-canvas-text-muted",
						children: S ? r("正在加载...") : r("{count} 张图片", { count: A.length })
					})]
				}),
				/* @__PURE__ */ (0, g.jsx)(u, { onClick: j })
			]
		}), /* @__PURE__ */ (0, g.jsx)("div", {
			className: "min-h-0 flex-1 overflow-y-auto p-3",
			children: S ? /* @__PURE__ */ (0, g.jsxs)("div", {
				className: "flex min-h-48 items-center justify-center gap-2 text-xs text-canvas-text-muted",
				children: [/* @__PURE__ */ (0, g.jsx)(d, {
					icon: "mdi:loading",
					width: 18,
					height: 18,
					className: "animate-spin",
					"aria-hidden": "true"
				}), /* @__PURE__ */ (0, g.jsx)("span", { children: r("正在加载生成历史") })]
			}) : w ? /* @__PURE__ */ (0, g.jsxs)("div", {
				className: "flex min-h-48 flex-col items-center justify-center gap-3 text-canvas-text-muted",
				children: [
					/* @__PURE__ */ (0, g.jsx)(d, {
						icon: "mdi:alert-circle-outline",
						width: 28,
						height: 28,
						"aria-hidden": "true"
					}),
					/* @__PURE__ */ (0, g.jsx)("p", {
						className: "text-xs",
						children: w
					}),
					/* @__PURE__ */ (0, g.jsx)("button", {
						type: "button",
						className: "rounded-md border border-canvas-border px-3 py-1.5 text-xs text-canvas-text-secondary transition-colors hover:bg-canvas-hover hover:text-canvas-text",
						onClick: () => D((e) => e + 1),
						children: r("重试")
					})
				]
			}) : A.length === 0 ? /* @__PURE__ */ (0, g.jsxs)("div", {
				className: "flex min-h-48 flex-col items-center justify-center gap-3 text-canvas-text-muted",
				children: [/* @__PURE__ */ (0, g.jsx)(d, {
					icon: "mdi:image-multiple-outline",
					width: 32,
					height: 32,
					"aria-hidden": "true"
				}), /* @__PURE__ */ (0, g.jsx)("p", {
					className: "text-xs",
					children: r("这个节点还没有生成过图片")
				})]
			}) : /* @__PURE__ */ (0, g.jsx)("div", {
				className: "grid grid-cols-1 gap-3 sm:grid-cols-2",
				children: A.map((e) => /* @__PURE__ */ (0, g.jsxs)("article", {
					className: "overflow-hidden rounded-lg border border-canvas-border bg-canvas-card",
					children: [/* @__PURE__ */ (0, g.jsx)(b, {
						entry: e,
						onPreview: k
					}), /* @__PURE__ */ (0, g.jsxs)("div", {
						className: "space-y-2.5 p-3",
						children: [/* @__PURE__ */ (0, g.jsxs)("div", {
							className: "flex min-w-0 items-center gap-2 text-[11px]",
							children: [/* @__PURE__ */ (0, g.jsx)("span", {
								className: "min-w-0 truncate rounded bg-canvas-hover px-2 py-1 text-canvas-text-secondary",
								children: [e.provider, e.model].filter(Boolean).join(" / ") || r("未记录模型")
							}), /* @__PURE__ */ (0, g.jsx)("time", {
								className: "ml-auto shrink-0 text-canvas-text-muted",
								dateTime: new Date(e.timestamp).toISOString(),
								children: _.format(e.timestamp)
							})]
						}), /* @__PURE__ */ (0, g.jsx)("p", {
							className: "whitespace-pre-wrap break-words text-xs leading-5 text-canvas-text-secondary",
							children: e.prompt.trim() || r("未记录提示词")
						})]
					})]
				}, e.id))
			})
		})]
	}), O && /* @__PURE__ */ (0, g.jsx)(f, {
		isOpen: e,
		onClose: () => k(null),
		hidePanel: !0,
		className: "fullscreen-overlay--image-preview",
		children: /* @__PURE__ */ (0, g.jsx)(p, {
			src: O.src,
			alt: O.alt,
			className: "fullscreen-img-view",
			onClose: () => k(null),
			onError: () => k(null)
		})
	})] }), document.body);
}
//#endregion
export { x as default };
