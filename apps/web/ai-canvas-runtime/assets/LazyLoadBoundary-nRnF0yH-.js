import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./jsx-runtime-BAkIPmuO.js";
//#region src/components/shared/LazyLoadBoundary.tsx
var r = /* @__PURE__ */ e(t(), 1), i = n();
function a({ label: e, variant: t = "feature" }) {
	return t === "root" ? /* @__PURE__ */ (0, i.jsx)("div", {
		className: "flex min-h-screen w-screen items-center justify-center bg-canvas-bg px-6 text-canvas-text",
		role: "status",
		"aria-live": "polite",
		children: /* @__PURE__ */ (0, i.jsxs)("div", {
			className: "flex flex-col items-center gap-4 text-center",
			children: [/* @__PURE__ */ (0, i.jsx)("span", {
				className: "h-7 w-7 animate-spin rounded-full border-2 border-canvas-border border-t-canvas-text-secondary",
				"aria-hidden": "true"
			}), /* @__PURE__ */ (0, i.jsxs)("p", {
				className: "text-sm text-canvas-text-secondary",
				children: ["正在加载", e]
			})]
		})
	}) : /* @__PURE__ */ (0, i.jsxs)("div", {
		className: "fixed bottom-5 left-1/2 z-[300] flex -translate-x-1/2 items-center gap-2 rounded-md border border-canvas-border bg-canvas-card px-3 py-2 shadow-xl",
		role: "status",
		"aria-live": "polite",
		children: [/* @__PURE__ */ (0, i.jsx)("span", {
			className: "h-3.5 w-3.5 animate-spin rounded-full border border-canvas-text-muted border-t-canvas-text-secondary",
			"aria-hidden": "true"
		}), /* @__PURE__ */ (0, i.jsxs)("span", {
			className: "text-xs text-canvas-text-secondary",
			children: ["正在加载", e]
		})]
	});
}
var o = class extends r.Component {
	state = { failed: !1 };
	static getDerivedStateFromError() {
		return { failed: !0 };
	}
	componentDidCatch(e, t) {
		console.error(`[LazyLoadBoundary] ${this.props.label}加载失败`, e, t.componentStack);
	}
	handleRetry = () => {
		window.location.reload();
	};
	render() {
		return this.state.failed ? this.props.variant === "root" ? /* @__PURE__ */ (0, i.jsx)("div", {
			className: "flex min-h-screen w-screen items-center justify-center bg-canvas-bg px-6 text-canvas-text",
			role: "alert",
			children: /* @__PURE__ */ (0, i.jsxs)("div", {
				className: "flex max-w-sm flex-col items-center text-center",
				children: [
					/* @__PURE__ */ (0, i.jsx)("h1", {
						className: "text-lg font-semibold",
						children: "应用加载失败"
					}),
					/* @__PURE__ */ (0, i.jsxs)("p", {
						className: "mt-2 text-sm leading-6 text-canvas-text-secondary",
						children: [this.props.label, "暂时无法加载，请重新尝试。"]
					}),
					/* @__PURE__ */ (0, i.jsx)("button", {
						type: "button",
						className: "mt-5 rounded-md border border-canvas-border bg-canvas-card px-4 py-2 text-sm text-canvas-text transition-colors hover:bg-canvas-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canvas-text-secondary",
						onClick: this.handleRetry,
						children: "重试"
					})
				]
			})
		}) : /* @__PURE__ */ (0, i.jsxs)("div", {
			className: "fixed bottom-5 left-1/2 z-[300] flex w-[min(420px,calc(100vw-32px))] -translate-x-1/2 items-center gap-4 rounded-md border border-canvas-border bg-canvas-card px-4 py-3 shadow-xl",
			role: "alert",
			children: [/* @__PURE__ */ (0, i.jsxs)("div", {
				className: "min-w-0 flex-1",
				children: [/* @__PURE__ */ (0, i.jsxs)("p", {
					className: "text-sm font-medium text-canvas-text",
					children: [this.props.label, "加载失败"]
				}), /* @__PURE__ */ (0, i.jsx)("p", {
					className: "mt-0.5 text-xs text-canvas-text-secondary",
					children: "画布仍可继续使用"
				})]
			}), /* @__PURE__ */ (0, i.jsx)("button", {
				type: "button",
				className: "shrink-0 rounded-md border border-canvas-border px-3 py-1.5 text-xs text-canvas-text transition-colors hover:bg-canvas-hover focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-canvas-text-secondary",
				onClick: this.handleRetry,
				children: "重试"
			})]
		}) : this.props.children;
	}
};
//#endregion
export { a as n, o as t };
