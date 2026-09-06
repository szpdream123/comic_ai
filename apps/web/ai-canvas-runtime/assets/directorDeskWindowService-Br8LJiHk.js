import { i as e } from "./react-Dfufv8pq.js";
import { t } from "./directorDeskService-CxTbkz3X.js";
//#region src/services/directorDeskWindowService.ts
var n = /* @__PURE__ */ e({
	DIRECTOR_DESK_HOST_EVENT: () => i,
	DIRECTOR_DESK_MESSAGE_EVENT: () => a,
	DIRECTOR_DESK_WINDOW_LABEL: () => r,
	closeDirectorDeskWindow: () => S,
	isTauriDirectorWindowAvailable: () => p,
	openDirectorDeskWindow: () => y,
	parseDirectorDeskWindowEnvelope: () => f,
	requestDirectorWindowAction: () => x,
	subscribeDirectorDeskWindow: () => b
}), r = "director-desk", i = "director-desk:host-message", a = "director-desk:message", o = new Set([
	"storyai:director-desk-ready",
	"storyai:director-desk-close",
	"storyai:director-desk-captures-sent",
	"storyai:director-desk:response"
]), s = /* @__PURE__ */ new Map(), c = /* @__PURE__ */ new Map(), l = null, u = null;
function d(e) {
	if (typeof e != "string") return null;
	let t = e.trim();
	return !t || t.length > 128 ? null : t;
}
function f(e) {
	if (!e || typeof e != "object") return null;
	let t = e, n = d(t.instanceId);
	if (!n || !t.message || typeof t.message != "object") return null;
	let r = t.message;
	return typeof r.type != "string" || !o.has(r.type) || r.payload !== void 0 && (!r.payload || typeof r.payload != "object") ? null : {
		instanceId: n,
		message: {
			type: r.type,
			...r.payload ? { payload: r.payload } : {}
		}
	};
}
function p() {
	return typeof window < "u" && ("__TAURI__" in window || "__TAURI_INTERNALS__" in window);
}
function m(e) {
	let { instanceId: t, message: n } = e;
	if (n.type === "storyai:director-desk:response") {
		let e = typeof n.payload?.requestId == "string" ? n.payload.requestId : "", r = c.get(e);
		if (r && r.instanceId === t) if (clearTimeout(r.timer), c.delete(e), n.payload?.ok === !1) {
			let e = n.payload.error;
			r.reject(Error(typeof e?.message == "string" ? e.message : "3D 导演台请求失败"));
		} else r.resolve(n.payload?.data);
	}
	h(t, n), n.type === "storyai:director-desk-close" && S();
}
function h(e, t) {
	for (let n of s.get(e) ?? []) n(t);
}
function g(e) {
	let t = u;
	if (u = e, !(!t || t === e)) {
		for (let [e, n] of c) n.instanceId === t && (clearTimeout(n.timer), c.delete(e), n.reject(/* @__PURE__ */ Error("3D 导演台已切换到其他节点")));
		h(t, { type: "storyai:director-desk-close" });
	}
}
async function _() {
	return l || (l = (async () => {
		let { listen: e } = await import("./event-BlmvLUFr.js").then((e) => e.i);
		await e(a, (e) => {
			let t = f(e.payload);
			t && m(t);
		});
	})().catch((e) => {
		throw l = null, e;
	}), l);
}
async function v(e) {
	let { emitTo: t } = await import("./event-BlmvLUFr.js").then((e) => e.i);
	await t(r, i, e);
}
async function y({ instanceId: e, theme: n = "dark" }) {
	let i = d(e);
	if (!i) throw Error("导演台节点标识无效");
	if (!p()) throw Error("3D 导演台独立窗口仅支持 Tauri 桌面端");
	await _();
	let { WebviewWindow: a } = await import("./webviewWindow-DrkgzeEA.js"), o = await a.getByLabel(r);
	if (g(i), o) {
		await o.show().catch(() => {}), await o.unminimize().catch(() => {}), await o.setFocus(), await v({
			instanceId: i,
			message: {
				type: "storyai:director-desk-session",
				payload: {
					instanceId: i,
					theme: n
				}
			}
		});
		return;
	}
	let s = new a(r, {
		url: t(i, n),
		title: "3D 导演台",
		width: 1280,
		height: 820,
		minWidth: 900,
		minHeight: 640,
		center: !0,
		resizable: !0,
		decorations: !0,
		visible: !0,
		parent: "main"
	});
	await new Promise((e, t) => {
		s.once("tauri://created", () => e()), s.once("tauri://error", (e) => {
			u = null, t(/* @__PURE__ */ Error(`创建 3D 导演台窗口失败：${String(e.payload ?? "unknown")}`));
		});
	}), s.once("tauri://destroyed", () => {
		let e = u;
		u = null, e && m({
			instanceId: e,
			message: { type: "storyai:director-desk-close" }
		});
	});
}
function b(e, t) {
	let n = d(e);
	if (!n) return () => {};
	let r = s.get(n) ?? /* @__PURE__ */ new Set();
	return r.add(t), s.set(n, r), _().catch((e) => {
		console.error("[directorDeskWindow] 初始化事件监听失败:", e);
	}), () => {
		r.delete(t), r.size === 0 && s.delete(n);
	};
}
function x(e, t, n, r = 3e4) {
	let i = crypto.randomUUID();
	return new Promise((a, o) => {
		let s = setTimeout(() => {
			c.delete(i), o(/* @__PURE__ */ Error(`3D 导演台请求超时：${t}`));
		}, r);
		c.set(i, {
			instanceId: e,
			resolve: a,
			reject: o,
			timer: s
		}), _().then(() => v({
			instanceId: e,
			message: {
				type: "storyai:director-desk:request",
				payload: {
					requestId: i,
					action: t,
					...n ? { options: n } : {}
				}
			}
		})).catch((e) => {
			clearTimeout(s), c.delete(i), o(e);
		});
	});
}
async function S() {
	try {
		let { WebviewWindow: e } = await import("./webviewWindow-DrkgzeEA.js"), t = await e.getByLabel(r);
		t && await t.close();
	} catch {}
}
//#endregion
export { n, S as t };
