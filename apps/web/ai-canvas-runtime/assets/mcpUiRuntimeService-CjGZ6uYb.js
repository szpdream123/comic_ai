import { i as e } from "./react-Dfufv8pq.js";
import { n as t } from "./es-DmOAeai0.js";
//#region src/services/mcp/mcpUiRuntimeService.ts
var n = /* @__PURE__ */ e({
	APP_WINDOW_LABELS: () => r,
	captureAppWindow: () => g,
	focusAppWindow: () => m,
	getAppWindowState: () => f,
	installMcpScreenshotResponder: () => _,
	listAppWindows: () => d,
	setAppWindowBounds: () => h
}), r = [
	"main",
	"chat-assistant",
	"asset-search",
	"video-editor",
	"director-desk",
	"comfyui"
], i = "mcp-ui-capture-request", a = "mcp-ui-capture-response", o = 26e5;
function s() {
	return typeof window < "u" && "__TAURI_INTERNALS__" in window;
}
function c(e) {
	if (e.closest("[data-mcp-sensitive=\"true\"]")) return !0;
	if (!(e instanceof HTMLInputElement)) return !1;
	let t = `${e.name} ${e.id} ${e.autocomplete}`.toLowerCase();
	return e.type === "password" || /(api.?key|token|secret|password|authorization)/.test(t);
}
async function l(e) {
	let n = document.getElementById("root") ?? document.body, r = Math.max(1, n.clientWidth || window.innerWidth), i = Math.max(1, n.clientHeight || window.innerHeight), a = Math.min(r, e.maxWidth), s = Math.max(1, Math.round(a / r * i)), l = e.quality, u = "";
	for (let r = 0; r < 4 && (u = await t(n, {
		backgroundColor: getComputedStyle(document.documentElement).backgroundColor || "#0a0a0f",
		canvasWidth: a,
		canvasHeight: s,
		pixelRatio: 1,
		quality: l,
		cacheBust: !1,
		filter: e.redactSensitive ? (e) => !c(e) : void 0
	}), !(u.length <= o)); r += 1) a = Math.max(320, Math.round(a * .75)), s = Math.max(180, Math.round(s * .75)), l = Math.max(.4, l - .12);
	if (u.length > o) throw Error("截图压缩后仍超过 MCP 图像上限");
	let d = u.indexOf("base64,");
	if (d < 0) throw Error("截图编码格式无效");
	return {
		data: u.slice(d + 7),
		mimeType: "image/jpeg",
		width: a,
		height: s
	};
}
async function u(e) {
	let [t, n, r, i, a, o, s, c, l] = await Promise.all([
		e.outerPosition(),
		e.innerSize(),
		e.outerSize(),
		e.scaleFactor(),
		e.isFocused(),
		e.isVisible(),
		e.isMinimized(),
		e.isMaximized(),
		e.isFullscreen()
	]);
	return {
		label: e.label,
		position: {
			x: t.x,
			y: t.y
		},
		innerSize: {
			width: n.width,
			height: n.height
		},
		outerSize: {
			width: r.width,
			height: r.height
		},
		scaleFactor: i,
		focused: a,
		visible: o,
		minimized: s,
		maximized: c,
		fullscreen: l
	};
}
async function d() {
	if (!s()) return [{
		label: "main",
		innerSize: {
			width: window.innerWidth,
			height: window.innerHeight
		},
		outerSize: {
			width: window.outerWidth,
			height: window.outerHeight
		},
		scaleFactor: window.devicePixelRatio,
		focused: document.hasFocus(),
		visible: document.visibilityState === "visible",
		minimized: !1,
		maximized: !1,
		fullscreen: !!document.fullscreenElement
	}];
	let { getAllWindows: e } = await import("./window-Mv3S1g6R.js"), t = new Set(r);
	return Promise.all((await e()).filter((e) => t.has(e.label)).map(u));
}
async function f(e) {
	let t = (await d()).find((t) => t.label === e);
	if (!t) throw Error(`应用窗口未打开: ${e}`);
	return t;
}
async function p(e) {
	if (!s()) throw Error("当前不是 Tauri 桌面运行环境");
	let { Window: t } = await import("./window-Mv3S1g6R.js"), n = await t.getByLabel(e);
	if (!n) throw Error(`应用窗口未打开: ${e}`);
	return n;
}
async function m(e) {
	let t = await p(e);
	await t.isMinimized() && await t.unminimize(), await t.show(), await t.setFocus();
}
async function h(e, t) {
	let n = await p(e), { PhysicalPosition: r, PhysicalSize: i } = await import("./dpi-BPgL8ARP.js").then((e) => e.s);
	t.x !== void 0 && t.y !== void 0 && await n.setPosition(new r(t.x, t.y)), t.width !== void 0 && t.height !== void 0 && await n.setSize(new i(t.width, t.height));
}
async function g(e) {
	if (!s()) return l(e);
	let { getCurrentWindow: t } = await import("./window-Mv3S1g6R.js");
	if (t().label === e.target) return l(e);
	let { emitTo: n, listen: r } = await import("./event-BlmvLUFr.js").then((e) => e.i), o = `capture-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
	return new Promise((t, s) => {
		let c, l = window.setTimeout(() => {
			c?.(), s(/* @__PURE__ */ Error(`窗口截图响应超时: ${e.target}`));
		}, 12e3);
		r(a, (e) => {
			e.payload.requestId === o && (window.clearTimeout(l), c?.(), e.payload.result ? t(e.payload.result) : s(Error(e.payload.error || "窗口截图失败")));
		}).then((t) => (c = t, n(e.target, i, {
			requestId: o,
			options: e
		}))).catch((e) => {
			window.clearTimeout(l), c?.(), s(e);
		});
	});
}
async function _() {
	if (!s()) return () => {};
	let { emitTo: e, listen: t } = await import("./event-BlmvLUFr.js").then((e) => e.i);
	return t(i, (t) => {
		l(t.payload.options).then((n) => e("main", a, {
			requestId: t.payload.requestId,
			result: n
		})).catch((n) => e("main", a, {
			requestId: t.payload.requestId,
			error: n instanceof Error ? n.message : "窗口截图失败"
		}));
	});
}
//#endregion
export { n as a, d as i, m as n, h as o, f as r, g as t };
