//#region src/services/videoEditorWindowService.ts
var e = "video-editor", t = "video-editor:host-message", n = "video-editor:message", r = new Set([
	"storyai:video-editor-ready",
	"storyai:video-editor-close",
	"storyai:video-editor-exported",
	"storyai:video-editor-frame-exported",
	"storyai:video-editor-models-request",
	"storyai:video-editor-ai-transition-request"
]), i = new Set([
	"storyai:video-editor-session",
	"storyai:video-editor-models",
	"storyai:video-editor-ai-transition-result"
]), a = /* @__PURE__ */ new Map(), o = null, s = /* @__PURE__ */ new Map(), c = null;
function l(e) {
	if (typeof e != "string") return null;
	let t = e.trim();
	return !t || t.length > 128 ? null : t;
}
function u(e, t) {
	if (!e || typeof e != "object") return null;
	let n = e, r = l(n.instanceId);
	if (!r || !n.message || typeof n.message != "object") return null;
	let i = n.message;
	return typeof i.type != "string" || !t.has(i.type) || i.payload !== void 0 && (!i.payload || typeof i.payload != "object") ? null : {
		instanceId: r,
		message: {
			type: i.type,
			...i.payload ? { payload: i.payload } : {}
		}
	};
}
function d(e) {
	return u(e, r);
}
function f(e) {
	return u(e, i);
}
function p() {
	return typeof window < "u" && ("__TAURI__" in window || "__TAURI_INTERNALS__" in window);
}
function m(e, t, n) {
	for (let r of e.get(t) ?? []) r(n);
}
async function h() {
	return o || (o = (async () => {
		let { listen: e } = await import("./event-h5Ir25pQ.js").then((e) => e.i);
		await e(n, (e) => {
			let t = d(e.payload);
			t && m(a, t.instanceId, t.message);
		});
	})().catch((e) => {
		throw o = null, e;
	}), o);
}
async function g() {
	return c || (c = (async () => {
		let { listen: e } = await import("./event-h5Ir25pQ.js").then((e) => e.i);
		await e(t, (e) => {
			let t = f(e.payload);
			t && m(s, t.instanceId, t.message);
		});
	})().catch((e) => {
		throw c = null, e;
	}), c);
}
function _(e) {
	return `index.html?${new URLSearchParams({
		view: "video-editor",
		instanceId: e.instanceId,
		projectId: e.projectId,
		nodeId: e.nodeId,
		theme: e.theme
	}).toString()}`;
}
async function v(n) {
	let r = l(n.instanceId);
	if (!r) throw Error("剪辑工程标识无效");
	if (!p()) throw Error("视频编辑器独立窗口仅支持 Tauri 桌面端");
	let i = n.theme === "light" ? "light" : "dark";
	await h();
	let { WebviewWindow: o } = await import("./webviewWindow-B_qR0hzx.js"), s = await o.getByLabel(e);
	if (s) {
		await s.show().catch(() => {}), await s.unminimize().catch(() => {}), await s.setFocus().catch(() => {});
		let { emitTo: a } = await import("./event-h5Ir25pQ.js").then((e) => e.i);
		await a(e, t, {
			instanceId: r,
			message: {
				type: "storyai:video-editor-session",
				payload: {
					instanceId: r,
					projectId: n.projectId,
					nodeId: n.nodeId,
					theme: i
				}
			}
		});
		return;
	}
	let c = new o(e, {
		url: _({
			instanceId: r,
			projectId: n.projectId,
			nodeId: n.nodeId,
			theme: i
		}),
		title: "视频编辑器",
		width: 1440,
		height: 900,
		minWidth: 1080,
		minHeight: 680,
		center: !0,
		resizable: !0,
		decorations: !1,
		transparent: !0,
		shadow: !1
	});
	await new Promise((e, t) => {
		c.once("tauri://created", () => e()), c.once("tauri://error", (e) => {
			t(/* @__PURE__ */ Error(`创建视频编辑器窗口失败：${String(e.payload ?? "unknown")}`));
		});
	}), c.once("tauri://destroyed", () => {
		m(a, r, { type: "storyai:video-editor-close" });
	});
}
function y(e, t) {
	let n = l(e);
	if (!n) return () => {};
	let r = a.get(n) ?? /* @__PURE__ */ new Set();
	return r.add(t), a.set(n, r), h().catch((e) => {
		console.error("[videoEditorWindow] 初始化事件监听失败:", e);
	}), () => {
		r.delete(t), r.size === 0 && a.delete(n);
	};
}
async function b(e, t) {
	let { emitTo: r } = await import("./event-h5Ir25pQ.js").then((e) => e.i);
	await r("main", n, {
		instanceId: e,
		message: {
			type: "storyai:video-editor-exported",
			payload: { ...t }
		}
	});
}
async function x(e, t) {
	let { emitTo: r } = await import("./event-h5Ir25pQ.js").then((e) => e.i);
	await r("main", n, {
		instanceId: e,
		message: {
			type: "storyai:video-editor-frame-exported",
			payload: { ...t }
		}
	});
}
async function S(e) {
	let { emitTo: t } = await import("./event-h5Ir25pQ.js").then((e) => e.i);
	await t("main", n, {
		instanceId: e,
		message: { type: "storyai:video-editor-ready" }
	});
}
async function C(e) {
	let { emitTo: t } = await import("./event-h5Ir25pQ.js").then((e) => e.i);
	await t("main", n, {
		instanceId: e,
		message: { type: "storyai:video-editor-models-request" }
	});
}
async function w(e, t) {
	let { emitTo: r } = await import("./event-h5Ir25pQ.js").then((e) => e.i);
	await r("main", n, {
		instanceId: e,
		message: {
			type: "storyai:video-editor-ai-transition-request",
			payload: { ...t }
		}
	});
}
function T(e, t) {
	let n = l(e);
	if (!n) return () => {};
	let r = s.get(n) ?? /* @__PURE__ */ new Set();
	return r.add(t), s.set(n, r), g().catch((e) => {
		console.error("[videoEditorWindow] 初始化主窗口消息监听失败:", e);
	}), () => {
		r.delete(t), r.size === 0 && s.delete(n);
	};
}
async function E(n, r) {
	let { emitTo: i } = await import("./event-h5Ir25pQ.js").then((e) => e.i);
	await i(e, t, {
		instanceId: n,
		message: {
			type: "storyai:video-editor-models",
			payload: { models: r }
		}
	});
}
async function D(n, r) {
	let { emitTo: i } = await import("./event-h5Ir25pQ.js").then((e) => e.i);
	await i(e, t, {
		instanceId: n,
		message: {
			type: "storyai:video-editor-ai-transition-result",
			payload: { ...r }
		}
	});
}
//#endregion
export { x as a, S as c, b as i, T as l, w as n, E as o, D as r, C as s, v as t, y as u };
