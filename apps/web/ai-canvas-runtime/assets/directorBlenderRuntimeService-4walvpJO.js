import { i as e } from "./react-Dfufv8pq.js";
import { a as t } from "./core-CoHQ9AE0.js";
import { r as n } from "./dist-js-De6wNmmK.js";
import { D as r, M as i, N as a, S as o, c as s, l as c, o as l, r as u, s as d } from "./directorSceneSchema-BcP-NXqL.js";
//#region src/services/directorBlenderRuntimeService.ts
var f = /* @__PURE__ */ e({
	chooseDirectorBlenderInstallation: () => O,
	createDefaultDirectorScene: () => L,
	detectDirectorBlenderInstallation: () => D,
	getDirectorBlenderAvailability: () => k,
	prepareDirectorBlenderInstallation: () => A,
	runDirectorBlenderOperation: () => F
}), p = 300, m = "Blender 导演运行时仅支持 Tauri 桌面端", h = "Blender 原生运行时调用失败", g = null;
function _() {
	let e = /* @__PURE__ */ Error("Blender 任务已取消");
	return e.name = "AbortError", e;
}
function v() {
	if (!i()) throw Error(m);
}
function y(e, t = h) {
	if (e instanceof Error) return e;
	let n = typeof e == "string" ? e.trim() : typeof e == "object" && e && typeof e.message == "string" ? e.message.trim() : "";
	return Error(n || t);
}
async function b(e, n) {
	try {
		return n === void 0 ? await t(e) : await t(e, n);
	} catch (e) {
		throw y(e);
	}
}
function x(e) {
	if (typeof e != "object" || !e || Array.isArray(e)) throw Error("Blender 安装候选格式无效");
	let { installationId: t, displayName: n, source: r, versionHint: i, versionHintIsVerified: a } = e;
	if (typeof t != "string" || !t.trim() || typeof n != "string" || !n.trim() || typeof r != "string" || !r.trim() || i != null && typeof i != "string" || typeof a != "boolean") throw Error("Blender 安装候选格式无效");
	return {
		installationId: t,
		displayName: n,
		source: r,
		...i === void 0 ? {} : { versionHint: i },
		versionHintIsVerified: a
	};
}
function S(e) {
	return x(e);
}
function C(e, t) {
	try {
		e?.(t);
	} catch (e) {
		console.error("[directorBlenderRuntimeService] Job 状态回调失败:", e);
	}
}
function w(e) {
	return new Promise((t) => {
		globalThis.setTimeout(t, e);
	});
}
async function T() {
	v();
	let e = await b("discover_blender_installations");
	if (typeof e != "object" || !e || Array.isArray(e)) throw Error("Blender 安装发现结果格式无效");
	let t = e.candidates;
	if (!Array.isArray(t)) throw Error("Blender 安装发现结果格式无效");
	return t.map(x);
}
function E(e) {
	if (g) return S(g);
	let t = e.find((e) => e.source === "user-selected");
	return !t && e.length !== 1 ? null : (g = S(t ?? e[0]), S(g));
}
async function D() {
	return v(), g ? S(g) : E(await T());
}
async function O() {
	v();
	let e;
	try {
		e = await n({
			title: "选择 Blender 的 blender.exe",
			multiple: !1,
			directory: !1,
			filters: [{
				name: "Blender",
				extensions: ["exe"]
			}]
		});
	} catch (e) {
		throw y(e, "无法打开 Blender 文件选择器");
	}
	if (typeof e != "string" || !e.trim()) throw _();
	return g = x(await b("register_blender_installation", { request: { executablePath: e } })), S(g);
}
async function k() {
	if (!i()) return {
		state: "unavailable",
		reason: m
	};
	try {
		return await D() ? { state: "ready" } : { state: "setup-required" };
	} catch (e) {
		return {
			state: "unavailable",
			reason: e instanceof Error ? e.message : "Blender 安装发现失败"
		};
	}
}
async function A() {
	return v(), await D() || O();
}
function j(e) {
	let t = c(e.sceneReference), n = e.previousManifestReference === void 0 ? void 0 : d(e.previousManifestReference);
	if (n && (n.sceneId !== t.sceneId || n.sceneRevision !== t.revision || n.sceneSha256 !== t.sha256)) throw Error("上一份 Blender 结果清单与当前场景不匹配");
	if (e.operation === "render-frame") {
		if (!Number.isSafeInteger(e.targetFrame) || e.targetFrame <= 0) throw Error("Blender 当前帧必须是正安全整数");
	} else if (e.targetFrame !== void 0) throw Error("只有 Blender 单帧渲染可以指定目标帧");
	return {
		sceneReference: t,
		previousManifestReference: n
	};
}
function M(e, t) {
	let n = r();
	if (!n) throw Error(m);
	let i = a(e, t.relativePath);
	return {
		mediaUrl: n(i),
		filePath: i,
		fileName: t.relativePath.split("/").at(-1) ?? t.artifactId
	};
}
function N(e, t) {
	return [...e].reverse().find((e) => e.kind === t);
}
function P(e, t, n, r) {
	let i = l(e.manifest), a = d(e.manifestReference);
	if (u(i, n), i.producer.runtime !== "blender") throw Error("Blender Job 返回了错误的结果生产者");
	if (a.sceneId !== i.sceneId || a.sceneRevision !== i.sceneRevision || a.sceneSha256 !== i.sceneSha256 || a.manifestRevision !== i.manifestRevision) throw Error("Blender 结果清单引用与清单身份不匹配");
	let o = r ? r.manifestRevision + 1 : 1;
	if (i.manifestRevision !== o) throw Error("Blender 结果清单 revision 与启动绑定不匹配");
	let s = N(i.artifacts, "frame-image"), c = N(i.artifacts, "reference-video"), f = N(i.artifacts, "blend-project");
	return {
		manifest: i,
		manifestReference: a,
		...s ? { frame: {
			...M(t, s),
			artifact: s
		} } : {},
		...c ? { video: {
			...M(t, c),
			artifact: c
		} } : {},
		...f ? { blend: {
			...M(t, f),
			artifact: f
		} } : {}
	};
}
async function F(e, t = {}) {
	v();
	let { sceneReference: n, previousManifestReference: r } = j(e);
	if (t.signal?.aborted) throw _();
	let i = await A(), a = await o(e.projectId);
	if (!a) throw Error("无法准备 Blender 项目目录");
	let s = null, c = null, l = null, u = null, d = null, f = !1, m = null, h = () => c ? (l ||= b("cancel_blender_job", { request: { jobId: c } }).then(() => void 0), l) : Promise.resolve(), g = () => {
		h().catch(() => void 0);
	};
	t.signal?.addEventListener("abort", g, { once: !0 });
	try {
		if (t.signal?.aborted || (s = (await b("create_blender_project_grant", { request: {
			projectId: e.projectId,
			projectRoot: a
		} })).projectGrantId, t.signal?.aborted)) throw _();
		let o = await b("start_blender_job", { request: {
			installationId: i.installationId,
			operation: e.operation,
			projectGrantId: s,
			projectId: e.projectId,
			directorInstanceId: e.directorInstanceId,
			sceneId: n.sceneId,
			sceneRevision: n.revision,
			sceneSha256: n.sha256,
			previousManifestRevision: r?.manifestRevision ?? null,
			previousManifestSha256: r?.sha256 ?? null,
			targetFrame: e.operation === "render-frame" ? e.targetFrame : null
		} });
		for (c = o.jobId, C(t.onStatus, o);;) {
			if (t.signal?.aborted) throw await h().catch(() => void 0), _();
			if (o.state === "awaiting-collection" || o.state === "succeeded") {
				u = P(await b("collect_blender_job_result", { request: { jobId: c } }), a, n, r);
				break;
			}
			if (o.state === "failed") throw Error(o.failure?.message || "Blender Job 执行失败");
			if (o.state === "cancelled") throw t.signal?.aborted ? _() : /* @__PURE__ */ Error("Blender 任务已取消");
			await w(p), o = await b("get_blender_job_status", { request: { jobId: c } }), C(t.onStatus, o);
		}
	} catch (e) {
		f = !0, d = e;
	} finally {
		if (t.signal?.removeEventListener("abort", g), t.signal?.aborted && await h().catch(() => void 0), s) try {
			await b("revoke_blender_project_grant", { request: { projectGrantId: s } });
		} catch (e) {
			m = y(e);
		}
	}
	if (f) throw d;
	if (m) throw m;
	if (!u) throw Error("Blender Job 未返回结果");
	return u;
}
function I(e) {
	return `scene-${e.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "").slice(0, 100).replace(/[^a-z0-9]+$/g, "") || "director"}`;
}
function L(e) {
	return s({
		schemaVersion: 1,
		sceneId: I(e),
		revision: 1,
		parent: null,
		coordinateSystem: {
			handedness: "right",
			upAxis: "Z",
			forwardAxis: "-Y",
			lengthUnit: "meter",
			angleUnit: "degree",
			rotationOrder: "XYZ"
		},
		timeline: {
			fps: 24,
			startFrame: 1,
			endFrame: 120
		},
		environment: { worldColor: {
			r: .035,
			g: .035,
			b: .05
		} },
		entities: [],
		cameras: [{
			cameraId: "camera-main",
			name: "主镜头",
			transform: {
				position: {
					x: 0,
					y: -6,
					z: 2.2
				},
				rotationEuler: {
					x: 70,
					y: 0,
					z: 0
				},
				scale: {
					x: 1,
					y: 1,
					z: 1
				}
			},
			focalLengthMm: 50,
			sensorWidthMm: 36,
			apertureFStop: 2.8,
			focusDistanceM: 6.4,
			keyframes: []
		}],
		shots: [{
			shotId: "shot-main",
			name: "主镜头段落",
			startFrame: 1,
			endFrame: 120,
			cameraId: "camera-main"
		}]
	});
}
//#endregion
export { f as i, L as n, D as r, O as t };
