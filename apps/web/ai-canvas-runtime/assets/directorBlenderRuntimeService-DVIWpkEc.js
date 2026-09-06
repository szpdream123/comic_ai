import { i as e } from "./react-Dfufv8pq.js";
import { a as t } from "./core-D3lATfku.js";
import { r as n } from "./dist-js-Cjy7VdJu.js";
import { D as r, M as i, N as a, S as o, c as s, l as c, o as l, r as u, s as d } from "./directorSceneSchema-D22Qlbpb.js";
//#region src/services/directorBlenderRuntimeService.ts
var f = /* @__PURE__ */ e({
	chooseDirectorBlenderInstallation: () => k,
	createDefaultDirectorScene: () => R,
	detectDirectorBlenderInstallation: () => O,
	getDirectorBlenderAvailability: () => A,
	prepareDirectorBlenderInstallation: () => j,
	runDirectorBlenderOperation: () => I
}), p = 300, m = "Blender 导演运行时仅支持 Tauri 桌面端", h = "Blender 原生运行时调用失败", g = null, _ = null;
function v() {
	let e = /* @__PURE__ */ Error("Blender 任务已取消");
	return e.name = "AbortError", e;
}
function y() {
	if (!i()) throw Error(m);
}
function b(e, t = h) {
	if (e instanceof Error) return e;
	let n = typeof e == "string" ? e.trim() : typeof e == "object" && e && typeof e.message == "string" ? e.message.trim() : "";
	return Error(n || t);
}
async function x(e, n) {
	try {
		return n === void 0 ? await t(e) : await t(e, n);
	} catch (e) {
		throw b(e);
	}
}
function S(e) {
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
function C(e) {
	return S(e);
}
function w(e, t) {
	try {
		e?.(t);
	} catch (e) {
		console.error("[directorBlenderRuntimeService] Job 状态回调失败:", e);
	}
}
function T(e) {
	return new Promise((t) => {
		globalThis.setTimeout(t, e);
	});
}
async function E() {
	y();
	let e = await x("discover_blender_installations");
	if (typeof e != "object" || !e || Array.isArray(e)) throw Error("Blender 安装发现结果格式无效");
	let t = e.candidates;
	if (!Array.isArray(t)) throw Error("Blender 安装发现结果格式无效");
	let n = t.map(S);
	return _ = e.supportsSavedScene === !0, n;
}
function D(e) {
	if (g) return C(g);
	let t = e.find((e) => e.source === "user-selected");
	return !t && e.length !== 1 ? null : (g = C(t ?? e[0]), C(g));
}
async function O() {
	return y(), g ? C(g) : D(await E());
}
async function k() {
	y();
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
		throw b(e, "无法打开 Blender 文件选择器");
	}
	if (typeof e != "string" || !e.trim()) throw v();
	return g = S(await x("register_blender_installation", { request: { executablePath: e } })), C(g);
}
async function A() {
	if (!i()) return {
		state: "unavailable",
		reason: m
	};
	try {
		let e = await O();
		return _ === null && await E(), {
			state: e ? "ready" : "setup-required",
			..._ ? { supportsSavedScene: !0 } : {}
		};
	} catch (e) {
		return {
			state: "unavailable",
			reason: e instanceof Error ? e.message : "Blender 安装发现失败"
		};
	}
}
async function j() {
	return y(), await O() || k();
}
function M(e) {
	let t = e.sceneSource ?? "director-scene";
	if (!["director-scene", "saved-blender"].includes(t)) throw Error("Blender 场景来源无效");
	let n = c(e.sceneReference), r = e.previousManifestReference === void 0 ? void 0 : d(e.previousManifestReference);
	if (r && (r.sceneId !== n.sceneId || r.sceneRevision !== n.revision || r.sceneSha256 !== n.sha256)) throw Error("上一份 Blender 结果清单与当前场景不匹配");
	if (e.operation === "render-frame") {
		if (!(t === "saved-blender" && e.targetFrame === void 0) && (!Number.isSafeInteger(e.targetFrame) || e.targetFrame < 0 || e.targetFrame > 1e7)) throw Error("Blender 当前帧必须是范围内的非负安全整数");
	} else if (e.targetFrame !== void 0) throw Error("只有 Blender 单帧渲染可以指定目标帧");
	if (t === "saved-blender" && !r) throw Error("Blender 保存工程模式需要上一份已验证成果");
	return {
		sceneReference: n,
		previousManifestReference: r,
		sceneSource: t
	};
}
function N(e, t) {
	let n = r();
	if (!n) throw Error(m);
	let i = a(e, t.relativePath);
	return {
		mediaUrl: n(i),
		filePath: i,
		fileName: t.relativePath.split("/").at(-1) ?? t.artifactId
	};
}
function P(e, t) {
	return [...e].reverse().find((e) => e.kind === t);
}
function F(e, t, n, r) {
	let i = l(e.manifest), a = d(e.manifestReference);
	if (u(i, n), i.producer.runtime !== "blender") throw Error("Blender Job 返回了错误的结果生产者");
	if (a.sceneId !== i.sceneId || a.sceneRevision !== i.sceneRevision || a.sceneSha256 !== i.sceneSha256 || a.manifestRevision !== i.manifestRevision) throw Error("Blender 结果清单引用与清单身份不匹配");
	let o = r ? r.manifestRevision + 1 : 1;
	if (i.manifestRevision !== o) throw Error("Blender 结果清单 revision 与启动绑定不匹配");
	let s = P(i.artifacts, "frame-image"), c = P(i.artifacts, "reference-video"), f = P(i.artifacts, "blend-project");
	return {
		manifest: i,
		manifestReference: a,
		...s ? { frame: {
			...N(t, s),
			artifact: s
		} } : {},
		...c ? { video: {
			...N(t, c),
			artifact: c
		} } : {},
		...f ? { blend: {
			...N(t, f),
			artifact: f
		} } : {}
	};
}
async function I(e, t = {}) {
	y();
	let { sceneReference: n, previousManifestReference: r, sceneSource: i } = M(e);
	if (t.signal?.aborted) throw v();
	let a = await j();
	if (i === "saved-blender" && (_ === null && await E(), !_)) throw Error("保存 Blender 工程模式需要更新并重启桌面软件");
	let s = await o(e.projectId);
	if (!s) throw Error("无法准备 Blender 项目目录");
	let c = null, l = null, u = null, d = null, f = null, m = !1, h = null, g = () => l ? (u ||= x("cancel_blender_job", { request: { jobId: l } }).then(() => void 0), u) : Promise.resolve(), S = () => {
		g().catch(() => void 0);
	};
	t.signal?.addEventListener("abort", S, { once: !0 });
	try {
		if (t.signal?.aborted || (c = (await x("create_blender_project_grant", { request: {
			projectId: e.projectId,
			projectRoot: s
		} })).projectGrantId, t.signal?.aborted)) throw v();
		let o = await x("start_blender_job", { request: {
			installationId: a.installationId,
			operation: e.operation,
			...i === "saved-blender" ? { sceneSource: i } : {},
			projectGrantId: c,
			projectId: e.projectId,
			directorInstanceId: e.directorInstanceId,
			sceneId: n.sceneId,
			sceneRevision: n.revision,
			sceneSha256: n.sha256,
			previousManifestRevision: r?.manifestRevision ?? null,
			previousManifestSha256: r?.sha256 ?? null,
			targetFrame: e.operation === "render-frame" ? e.targetFrame ?? null : null
		} });
		for (l = o.jobId, w(t.onStatus, o);;) {
			if (t.signal?.aborted) throw await g().catch(() => void 0), v();
			if (o.state === "awaiting-collection" || o.state === "succeeded") {
				d = F(await x("collect_blender_job_result", { request: { jobId: l } }), s, n, r);
				break;
			}
			if (o.state === "failed") throw Error(o.failure?.message || "Blender Job 执行失败");
			if (o.state === "cancelled") throw t.signal?.aborted ? v() : /* @__PURE__ */ Error("Blender 任务已取消");
			await T(p), o = await x("get_blender_job_status", { request: { jobId: l } }), w(t.onStatus, o);
		}
	} catch (e) {
		m = !0, f = e;
	} finally {
		if (t.signal?.removeEventListener("abort", S), t.signal?.aborted && await g().catch(() => void 0), c) try {
			await x("revoke_blender_project_grant", { request: { projectGrantId: c } });
		} catch (e) {
			h = b(e);
		}
	}
	if (m) throw f;
	if (h) throw h;
	if (!d) throw Error("Blender Job 未返回结果");
	return d;
}
function L(e) {
	return `scene-${e.toLowerCase().replace(/[^a-z0-9._-]+/g, "-").replace(/^[^a-z0-9]+|[^a-z0-9]+$/g, "").slice(0, 100).replace(/[^a-z0-9]+$/g, "") || "director"}`;
}
function R(e) {
	return s({
		schemaVersion: 1,
		sceneId: L(e),
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
export { f as i, R as n, O as r, k as t };
