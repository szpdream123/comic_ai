import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./jsx-runtime-BAkIPmuO.js";
import { a as r, i } from "./i18n-on3r1DCI.js";
import { t as a } from "./useAppStore-CcUL4Jo0.js";
import { a as o } from "./core-CoHQ9AE0.js";
import { H as s } from "./fileService-zQLozbOU.js";
import { a as c } from "./dramaAssets-BblLUZy_.js";
import { t as l } from "./useTooltipAutoPlacement-BSvTkR9V.js";
import { n as u } from "./rasterImageDimensions-CX1VK2cM.js";
import { a as d, r as f, s as p, u as m } from "./ChatMarkdown-DMpOf4pJ.js";
import h from "./ChatPanel-CBS46jRE.js";
//#region src/components/chat/ChatWindow.tsx
var g = /* @__PURE__ */ e(t(), 1), _ = n(), v = {
	conversations: [],
	activeConversationId: null,
	messages: [],
	agentTasks: [],
	projectId: null,
	generalModels: [],
	nodes: [],
	dramaAssets: c(),
	skillOptions: [],
	composerDraft: ""
}, y = 500, b = 8e3;
function x() {
	let e = r();
	l();
	let [t, n] = (0, g.useState)(v), [c, x] = (0, g.useState)(!1), [S, C] = (0, g.useState)(!1), w = (0, g.useRef)(!1), T = (0, g.useRef)(0), E = (0, g.useRef)(!1);
	(0, g.useEffect)(() => {
		let e = !1, t = () => {
			s().then((t) => {
				if (e) return;
				let n = t, r = n?.canvasBackground === "off-white" || n?.theme === "light" ? "light" : "dark";
				document.documentElement.setAttribute("data-theme", r), document.documentElement.toggleAttribute("data-native-cursor", n?.customCursor === !1), i(n?.language);
			});
		};
		return t(), window.addEventListener("focus", t), () => {
			e = !0, window.removeEventListener("focus", t), document.documentElement.removeAttribute("data-theme");
		};
	}, []), (0, g.useEffect)(() => {
		a.setState({
			nodes: t.nodes,
			dramaAssets: t.dramaAssets,
			currentProjectId: t.projectId
		});
	}, [
		t.nodes,
		t.dramaAssets,
		t.projectId
	]);
	let D = (0, g.useCallback)(() => {
		(async () => {
			try {
				await p(), await o("close_chat_window");
			} catch (e) {
				console.error("[ChatWindow] failed to close window:", e);
			}
		})();
	}, []), O = (0, g.useCallback)(() => {
		(async () => {
			try {
				await d({ type: "dock_window" }), await o("close_chat_window");
			} catch (e) {
				console.error("[ChatWindow] failed to dock window:", e);
			}
		})();
	}, []), k = (0, g.useCallback)(async () => {
		let e = !w.current;
		try {
			await o("set_chat_window_locked", { locked: e }), w.current = e, C(e);
		} catch (e) {
			console.error("[ChatWindow] failed to change lock state:", e);
		}
	}, []);
	return (0, g.useEffect)(() => {
		let e = !1, t, r, i = () => {
			r && clearInterval(r), r = void 0;
		};
		return m((e) => {
			e.type === "snapshot" ? (T.current = e.revision, E.current = !1, n(e.snapshot)) : e.baseRevision === T.current ? (T.current = e.revision, n((t) => f(t, e.patch))) : E.current || (E.current = !0, d({ type: "request_sync" })), i(), x(!0);
		}, D).then((n) => {
			if (e) {
				n();
				return;
			}
			t = n;
			let a = Date.now();
			d({ type: "request_sync" }), r = setInterval(() => {
				if (Date.now() - a > b) {
					i(), console.error("[ChatWindow] no snapshot from the main window; sync channel is down"), x(!0);
					return;
				}
				d({ type: "request_sync" });
			}, y);
		}), () => {
			e = !0, i(), t?.();
		};
	}, [D]), (0, g.useEffect)(() => {
		let e = () => {
			p();
		};
		return window.addEventListener("beforeunload", e), () => window.removeEventListener("beforeunload", e);
	}, []), /* @__PURE__ */ (0, _.jsx)(h, {
		detached: !0,
		detachedSnapshot: t,
		detachedInitialized: c,
		detachedHeaderActions: /* @__PURE__ */ (0, _.jsxs)("div", {
			className: "flex items-center gap-1",
			children: [
				/* @__PURE__ */ (0, _.jsx)("button", {
					type: "button",
					className: "pointer-events-auto flex items-center justify-center w-7 h-7 rounded-md\n                   text-canvas-text-muted hover:text-canvas-text hover:bg-canvas-hover transition-colors",
					"data-tooltip": e("收回内嵌"),
					onClick: O,
					children: /* @__PURE__ */ (0, _.jsx)(u, {
						icon: "mdi:dock-left",
						width: "16",
						height: "16"
					})
				}),
				/* @__PURE__ */ (0, _.jsx)("button", {
					type: "button",
					className: `pointer-events-auto flex items-center justify-center w-7 h-7 rounded-md transition-colors
                    ${S ? "text-amber-400 bg-amber-400/15" : "text-canvas-text-muted hover:text-canvas-text hover:bg-canvas-hover"}`,
					"data-tooltip": e(S ? "已锁定到主窗口" : "锁定到主窗口"),
					"aria-label": e(S ? "取消位置锁定" : "锁定到主窗口"),
					onClick: k,
					children: /* @__PURE__ */ (0, _.jsx)(u, {
						icon: S ? "mdi:lock" : "mdi:lock-open-outline",
						width: "16",
						height: "16"
					})
				}),
				/* @__PURE__ */ (0, _.jsx)("button", {
					type: "button",
					className: "pointer-events-auto flex items-center justify-center w-7 h-7 rounded-md\n                   text-canvas-text-muted hover:text-canvas-text hover:bg-red-500/20 transition-colors",
					"aria-label": e("关闭独立窗口"),
					onClick: D,
					children: /* @__PURE__ */ (0, _.jsx)(u, {
						icon: "mdi:close",
						width: "16",
						height: "16"
					})
				})
			]
		})
	});
}
//#endregion
export { x as default };
