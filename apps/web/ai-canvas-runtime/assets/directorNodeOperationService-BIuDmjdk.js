import { Ft as e, I as t, It as n, L as r, Lt as i, Pt as a, R as o, Rt as s, _ as c, g as l, oi as u, si as d, t as f, v as p, y as m, zt as h } from "./useAppStore-BH-MdRLu.js";
import { c as g, d as _, g as v, i as y, l as b, n as x, s as S, t as ee, u as te } from "./directorSceneSchema-D22Qlbpb.js";
import { C as ne } from "./fileService-BawXHbsK.js";
import { n as C } from "./directorDeskService-CxTbkz3X.js";
import { n as w } from "./directorBlenderRuntimeService-DVIWpkEc.js";
//#region src/services/directorSceneService.ts
var re = class extends Error {
	name = "DirectorSceneServiceError";
	code = "DIRECTOR_SCENE_SERVICE_INVALID";
}, T = new TextEncoder(), ie = new TextDecoder("utf-8", { fatal: !0 });
function E(e) {
	throw new re(e);
}
function ae(e, t) {
	if (e.byteLength !== t.byteLength) return !1;
	for (let n = 0; n < e.byteLength; n += 1) if (e[n] !== t[n]) return !1;
	return !0;
}
function oe(e, t) {
	try {
		return ie.decode(e);
	} catch {
		E(`${t} 不是有效的 UTF-8`);
	}
}
function D(e) {
	return {
		relativePath: e.relativePath,
		sha256: e.sha256,
		bytes: e.bytes
	};
}
function O(e) {
	return [...e.environment.asset ? [e.environment.asset] : [], ...e.entities.map((e) => e.asset)];
}
function k(e, t) {
	let n = /* @__PURE__ */ new Map(), r = 0;
	for (let i of e) {
		let e = n.get(i.relativePath);
		if (e) {
			(e.sha256 !== i.sha256 || e.bytes !== i.bytes) && E(`${t} 对同一路径声明了不同内容`);
			continue;
		}
		r += i.bytes, (!Number.isSafeInteger(r) || r > 67108864) && E(`${t} 超过 Phase 1-A 的 64 MiB renderer 验证上限`), n.set(i.relativePath, i);
	}
	return [...n.values()];
}
async function A(e, t, n) {
	for (let r of k(t, n)) await l({
		projectId: e,
		reference: r,
		maxBytes: ee
	});
}
function se(e, t) {
	(e.schemaVersion !== t.schemaVersion || e.sceneId !== t.sceneId || e.revision !== t.revision) && E("Director Scene 内容与引用身份不匹配");
}
function j(e, t) {
	let n = te(oe(e, "Director Scene"));
	return se(n, t), ae(e, T.encode(_(n))) || E("Director Scene 不是规范序列化格式"), n;
}
async function ce(e, t) {
	if (!t.parent) return;
	let { data: n, reference: r } = await c({
		projectId: e,
		relativePath: y(t.sceneId, t.parent.revision, t.parent.sha256),
		sha256: t.parent.sha256,
		maxBytes: x
	});
	j(n, {
		schemaVersion: 1,
		sceneId: t.sceneId,
		revision: t.parent.revision,
		...r
	});
}
async function le(e, t, n = {}) {
	let r = g(t);
	if (r.revision === 1) n.previousReference !== void 0 && E("首个 Director Scene revision 不应提供父引用");
	else {
		n.previousReference === void 0 && E("新的 Director Scene revision 缺少父引用");
		let t = b(n.previousReference);
		(t.sceneId !== r.sceneId || t.revision !== r.parent?.revision || t.sha256 !== r.parent?.sha256) && E("新的 Director Scene revision 与父引用不匹配"), await M(e, t);
	}
	await A(e, O(r).map(D), "Director Scene 资产");
	let i = T.encode(_(r)), a = await p(i), o = {
		schemaVersion: 1,
		sceneId: r.sceneId,
		revision: r.revision,
		relativePath: y(r.sceneId, r.revision, a),
		sha256: a,
		bytes: i.byteLength
	};
	return await m({
		projectId: e,
		reference: D(o),
		data: i,
		maxBytes: x
	}), {
		scene: r,
		reference: o
	};
}
async function M(e, t) {
	let n = b(t), r = j(await l({
		projectId: e,
		reference: D(n),
		maxBytes: x
	}), n);
	return await ce(e, r), await A(e, O(r).map(D), "Director Scene 资产"), r;
}
//#endregion
//#region src/services/directorNodeOperationService.ts
var ue = {
	DIRECTOR_CONTEXT_CHANGED: "画布绑定已变化，Blender 结果未写回节点",
	DIRECTOR_NOT_FOUND: "当前项目中找不到该 3D 导演台",
	DIRECTOR_NOT_OWNER: "该 Blender 任务不属于当前项目或会话",
	DIRECTOR_BUSY: "该导演台已有任务，或已有 Blender 编辑会话正在运行",
	DIRECTOR_SETUP_REQUIRED: "请先在导演台中选择 Blender 安装，再通过 MCP 启动任务",
	DIRECTOR_UNAVAILABLE: "Blender 运行时不可用，请检查桌面运行环境和安装状态",
	DIRECTOR_RUNTIME_REQUIRED: "请先将该导演台切换为 Blender 运行时",
	DIRECTOR_INVALID_INPUT: "导演台操作参数无效",
	DIRECTOR_INVALID_FRAME: "目标帧必须位于导演场景的时间线范围内",
	DIRECTOR_SAVED_SCENE_REQUIRED: "尚无已保存的 Blender 工程，请先打开编辑器并保存返回",
	DIRECTOR_DESKTOP_UPDATE_REQUIRED: "保存 Blender 工程模式需要更新并重启桌面软件；当前仍可使用原有导演场景模式",
	DIRECTOR_INVALID_RESULT: "Blender 未返回与当前任务匹配的完整成果",
	DIRECTOR_CANCELLED: "已取消 Blender 任务",
	DIRECTOR_OPERATION_FAILED: "Blender 操作失败，请检查本机 Blender 运行环境"
}, N = class extends Error {
	code;
	constructor(e) {
		super(ue[e]), this.code = e, this.name = "DirectorOperationError";
	}
}, P = /* @__PURE__ */ new Map(), F = /* @__PURE__ */ new Set(), de = 64, fe = new Set([
	"succeeded",
	"cancelled",
	"stale",
	"failed"
]);
function I(e) {
	return !fe.has(e.snapshot.state);
}
function L(e, t) {
	if (!e.disposed) {
		e.snapshot = {
			...e.snapshot,
			...t,
			updatedAt: Date.now()
		};
		for (let e of F) e();
	}
}
function R(e) {
	return structuredClone(e);
}
function z(e) {
	return {
		sceneId: e.sceneId,
		revision: e.revision,
		sha256: e.sha256
	};
}
function B(e, t) {
	return typeof t.directorInstanceId == "string" && t.directorInstanceId ? t.directorInstanceId : e;
}
function V(e) {
	let t = h(e);
	return t.supported && t.kind === "blender";
}
function H(e, t) {
	let n = f.getState();
	if (!e.projectId || n.currentProjectId !== e.projectId || t !== void 0 && n.getCurrentRevision() !== t) throw new N("DIRECTOR_CONTEXT_CHANGED");
	if (e.source === "mcp" && (!e.taskId || !e.conversationId)) throw new N("DIRECTOR_NOT_OWNER");
}
function U(e, t) {
	H(t);
	let n = f.getState().nodes.find((t) => t.id === e && t.type === "ai-director");
	if (!n) throw new N("DIRECTOR_NOT_FOUND");
	if (![
		t.projectId,
		n.id,
		B(n.id, n.data)
	].every((e) => /^[a-zA-Z0-9_-]{1,160}$/.test(e))) throw new N("DIRECTOR_INVALID_INPUT");
	return n;
}
function W(e, t) {
	H(t);
	let n = P.get(e);
	if (!n || n.owner.projectId !== t.projectId || t.source === "mcp" && n.owner.source === "mcp" && t.conversationId !== n.owner.conversationId) throw new N("DIRECTOR_NOT_OWNER");
	return n;
}
function pe(e, t) {
	try {
		let n = e.directorScene === void 0 ? void 0 : b(e.directorScene), r = e.directorResultManifest === void 0 ? void 0 : S(e.directorResultManifest);
		return JSON.stringify(n) === JSON.stringify(t.sceneReference) && JSON.stringify(r) === JSON.stringify(t.previousManifestReference);
	} catch {
		return !1;
	}
}
function G(e) {
	let t = f.getState(), n = t.nodes.find((t) => t.id === e.snapshot.nodeId && t.type === "ai-director");
	return !e.invalidated && r(e.guard, t) && !!n && V(n.data.directorRuntimeKind) && B(n.id, n.data) === e.snapshot.instanceId && pe(n.data, e);
}
function K(e) {
	if (!G(e)) throw new N("DIRECTOR_CONTEXT_CHANGED");
	if (e.controller.signal.aborted) throw new N("DIRECTOR_CANCELLED");
}
function q(e) {
	e.acknowledged || (e.acknowledged = !0, e.detachSignal?.(), e.resolveStart(R(e.snapshot)));
}
function me(e, t) {
	if (!I(e) || e.controller.signal.aborted) return;
	if (!G(e)) {
		e.invalidated = !0, e.controller.abort();
		return;
	}
	if (!/^[a-zA-Z0-9_-]{1,160}$/.test(t.jobId) || t.operation !== e.snapshot.operation || t.sceneId !== e.sceneReference?.sceneId || t.sceneRevision !== e.sceneReference.revision || e.snapshot.jobId && e.snapshot.jobId !== t.jobId) {
		e.failure = new N("DIRECTOR_INVALID_RESULT"), e.controller.abort();
		return;
	}
	let n = t.progress, r = n && [
		"preparing",
		"loading-scene",
		"rendering",
		"saving",
		"finalizing"
	].includes(n.phase) && Number.isSafeInteger(n.completed) && Number.isSafeInteger(n.total) && n.completed >= 0 && n.total >= n.completed ? {
		phase: n.phase,
		completed: n.completed,
		total: n.total
	} : void 0;
	L(e, {
		jobId: t.jobId,
		state: ["awaiting-collection", "collecting"].includes(t.state) ? "collecting" : "running",
		progress: r
	}), q(e);
}
async function he(e) {
	if (e.sceneReference) {
		let t = await M(e.owner.projectId, e.sceneReference);
		return K(e), t;
	}
	let n = await le(e.owner.projectId, w(e.snapshot.instanceId));
	K(e), e.mutating = !0;
	try {
		let r = f.getState();
		r.updateNodeData(e.snapshot.nodeId, {
			directorScene: n.reference,
			error: void 0
		}), r.incrementRevision(), e.sceneReference = b(n.reference), t(e.guard);
		let i = o(f.getState(), e.snapshot.nodeId, { onCancel: () => e.controller.abort() });
		if (!i) throw new N("DIRECTOR_CONTEXT_CHANGED");
		e.guard = i;
	} finally {
		e.mutating = !1;
	}
	return n.scene;
}
function J(e, t) {
	try {
		let n = S(t);
		if (n.sceneId === e.sceneReference?.sceneId && n.sceneRevision === e.sceneReference.revision && n.sceneSha256 === e.sceneReference.sha256 && n.manifestRevision === (e.previousManifestReference?.manifestRevision ?? 0) + 1) return n;
	} catch {}
	throw new N("DIRECTOR_INVALID_RESULT");
}
async function Y(e, t, n, r) {
	if (!t || !t.startsWith("data:") && !n) throw new N("DIRECTOR_INVALID_RESULT");
	if (t.startsWith("data:")) {
		let n = await ne(t, e.owner.projectId, v("导演台", r, "director"));
		if (K(e), !n?.assetUrl || !n.filePath) throw new N("DIRECTOR_INVALID_RESULT");
		return {
			mediaUrl: n.assetUrl,
			filePath: n.filePath
		};
	}
	return {
		mediaUrl: t,
		filePath: n
	};
}
async function X(e, t, n) {
	let r = J(e, t.manifestReference), i = await Y(e, t.mediaUrl || t.dataUrl || "", t.filePath, "png");
	K(e);
	let a = f.getState(), o = U(e.snapshot.nodeId, e.owner);
	return e.mutating = !0, a.commitToHistory(), a.updateNodeDataTransient(o.id, {
		directorCaptureUrls: [...C(o.data), i.mediaUrl].slice(-12),
		directorCaptureFilePaths: [...Array.isArray(o.data.directorCaptureFilePaths) ? o.data.directorCaptureFilePaths : [], i.filePath].slice(-12),
		imageUrl: i.mediaUrl,
		thumbnailUrl: i.mediaUrl,
		filePath: i.filePath,
		directorResultManifest: r,
		status: "success",
		directorStatus: "ready",
		error: void 0
	}), a.incrementRevision(), {
		nodeIds: [o.id],
		manifestRevision: r.manifestRevision,
		hasFrame: !0,
		hasVideo: !1,
		hasBlend: n,
		...t.frame === void 0 ? {} : { frame: t.frame }
	};
}
async function Z(r, o, c) {
	try {
		let t = await n("blender");
		if (K(r), t.state === "unavailable") throw new N("DIRECTOR_UNAVAILABLE");
		if (t.state === "setup-required") {
			if (!c) throw new N("DIRECTOR_SETUP_REQUIRED");
			await s("blender"), K(r), t = await n("blender"), K(r);
		}
		let l = t.state !== "unavailable" && t.supportsSavedScene === !0;
		if (o.sceneSource === "saved-blender" && !l) throw new N("DIRECTOR_DESKTOP_UPDATE_REQUIRED");
		L(r, { sceneSource: o.sceneSource ?? (r.previousManifestReference && l ? "saved-blender" : "director-scene") });
		let p = await he(r);
		K(r), L(r, { scene: z(r.sceneReference) });
		let m = {
			projectId: r.owner.projectId,
			sceneReference: r.sceneReference,
			previousManifestReference: r.previousManifestReference,
			sceneSource: r.snapshot.sceneSource,
			signal: r.controller.signal,
			onStatus: (e) => me(r, e)
		}, h = o.nodeId, g;
		if (o.operation === "open-editor") {
			let e = await i("blender", {
				instanceId: r.snapshot.instanceId,
				theme: f.getState().config.theme === "light" ? "light" : "dark",
				blender: m
			});
			if (K(r), !e?.capture || !e.blendFilePath) throw new N("DIRECTOR_INVALID_RESULT");
			g = await X(r, e.capture, !0);
		} else if (o.operation === "render-frame") {
			let e = o.frame ?? (r.snapshot.sceneSource === "director-scene" ? p.timeline.startFrame : void 0);
			if (r.snapshot.sceneSource === "director-scene" && e !== void 0 && (e < p.timeline.startFrame || e > p.timeline.endFrame)) throw new N("DIRECTOR_INVALID_FRAME");
			let t = await a("blender", r.snapshot.instanceId, {
				position: "current",
				quality: "1080p",
				fileName: "director-frame.png",
				targetFrame: e,
				blender: m
			});
			K(r), g = await X(r, t, !1);
		} else {
			let t = await e("blender", r.snapshot.instanceId, {
				quality: "720p",
				fps: p.timeline.fps,
				fileName: "director-ref.mp4",
				blender: m
			});
			K(r);
			let n = J(r, t.manifestReference), i = await Y(r, t.mediaUrl, t.filePath, "mp4");
			K(r);
			let a = f.getState(), o = U(h, r.owner), s = `node-${d()}`;
			r.mutating = !0, a.commitToHistory(), a.updateNodeDataTransient(h, {
				videoUrl: i.mediaUrl,
				filePath: i.filePath,
				directorResultManifest: n,
				status: "success",
				directorStatus: "ready",
				error: void 0
			}), a.addNodeTransient({
				id: s,
				type: "ai-video",
				...u({
					...o,
					data: {
						...o.data,
						nodeWidth: o.data.nodeWidth || 320
					}
				}),
				data: {
					label: `${o.data.label || "3D 导演台"} 导出视频`,
					type: "ai-video",
					role: "source",
					status: "success",
					videoUrl: i.mediaUrl,
					filePath: i.filePath,
					fileName: t.fileName,
					directorResultManifest: n,
					nodeWidth: 280,
					nodeHeight: 160
				}
			}), a.incrementRevision(), g = {
				nodeIds: [h, s],
				manifestRevision: n.manifestRevision,
				hasFrame: !1,
				hasVideo: !0,
				hasBlend: !1,
				...t.timeline ? { timeline: { ...t.timeline } } : {}
			};
		}
		L(r, {
			state: "succeeded",
			result: g,
			progress: void 0
		}), q(r), f.getState().showToast(o.operation === "render-video" ? "参考视频已导出并创建视频节点" : "Blender 当前镜头已保存并同步到导演台");
	} catch (e) {
		let t = r.invalidated ? new N("DIRECTOR_CONTEXT_CHANGED") : r.failure ? r.failure : e instanceof N ? e : r.controller.signal.aborted || e instanceof Error && e.name === "AbortError" ? new N("DIRECTOR_CANCELLED") : new N("DIRECTOR_OPERATION_FAILED"), n = t.code === "DIRECTOR_CONTEXT_CHANGED" ? "stale" : t.code === "DIRECTOR_CANCELLED" ? "cancelled" : "failed";
		if (!r.disposed && G(r)) {
			r.mutating = !0;
			let e = f.getState(), i = e.nodes.find((e) => e.id === r.snapshot.nodeId);
			e.updateNodeDataTransient(r.snapshot.nodeId, {
				error: n === "cancelled" ? void 0 : t.message,
				directorStatus: i && C(i.data).length ? "ready" : "idle"
			});
		}
		L(r, {
			state: n,
			error: {
				code: t.code,
				message: t.message
			},
			progress: void 0
		}), r.acknowledged && !r.disposed ? f.getState().currentProjectId === r.owner.projectId && f.getState().showToast(t.message, n === "cancelled" ? void 0 : "error") : r.acknowledged || r.rejectStart(t);
	} finally {
		r.unsubscribe?.(), r.detachSignal?.(), t(r.guard);
		for (let [e, t] of P) {
			if (P.size <= de) break;
			I(t) || P.delete(e);
		}
	}
}
function ge(e) {
	return F.add(e), () => {
		F.delete(e);
	};
}
function Q(e) {
	let t = f.getState().currentProjectId;
	return [...P.values()].find((n) => I(n) && n.owner.projectId === t && n.snapshot.nodeId === e)?.snapshot;
}
function $(e, t) {
	return R(W(e, t).snapshot);
}
function _e(e, t) {
	let n = W(e, t);
	return I(n) && (n.controller.abort(), L(n, { state: "cancelling" })), R(n.snapshot);
}
function ve(e, t, n, r) {
	H(n, r);
	let i = U(e, n), a = h(t);
	if (!a.supported || !["blender", "lightweight-web"].includes(String(t))) throw new N("DIRECTOR_INVALID_INPUT");
	if (Q(e)) throw new N("DIRECTOR_BUSY");
	let o = h(i.data.directorRuntimeKind);
	if (o.supported && o.kind === a.kind) return;
	let s = f.getState();
	s.updateNodeData(e, {
		directorRuntimeKind: a.kind,
		directorStatus: "idle",
		error: void 0
	}), s.incrementRevision();
}
async function ye(e, t) {
	let r = U(e, t), i = await n(r.data.directorRuntimeKind), a = U(e, t);
	if (a.data.directorRuntimeKind !== r.data.directorRuntimeKind) throw new N("DIRECTOR_CONTEXT_CHANGED");
	let o = h(a.data.directorRuntimeKind), s = a.data.directorScene === void 0 ? void 0 : b(a.data.directorScene), c = a.data.directorResultManifest === void 0 ? void 0 : S(a.data.directorResultManifest), l = Q(e), u = l ? $(l.operationId, t) : void 0;
	return {
		nodeId: e,
		projectId: t.projectId,
		instanceId: B(e, a.data),
		runtimeKind: o.supported ? o.kind : null,
		availability: i.state,
		scene: s && z(s),
		manifestRevision: c?.manifestRevision,
		activeOperation: u,
		captureCount: C(a.data).length,
		hasVideo: typeof a.data.videoUrl == "string" && !!a.data.videoUrl,
		renderContract: c && i.state !== "unavailable" && i.supportsSavedScene === !0 ? "saved-blender" : "director-scene",
		supportsSavedScene: i.state !== "unavailable" && i.supportsSavedScene === !0
	};
}
async function be(e, t, n = {}) {
	if (H(t, n.baseRevision), n.signal?.aborted) throw new N("DIRECTOR_CANCELLED");
	let r = U(e.nodeId, t);
	if (![
		"open-editor",
		"render-frame",
		"render-video"
	].includes(e.operation) || e.sceneSource !== void 0 && !["director-scene", "saved-blender"].includes(e.sceneSource) || e.frame !== void 0 && (e.operation !== "render-frame" || !Number.isSafeInteger(e.frame) || e.frame < 0 || e.frame > 1e7)) throw new N("DIRECTOR_INVALID_INPUT");
	if (!V(r.data.directorRuntimeKind)) throw new N("DIRECTOR_RUNTIME_REQUIRED");
	if ([...P.values()].some((n) => I(n) && (n.owner.projectId === t.projectId && n.snapshot.nodeId === r.id || e.operation === "open-editor" && n.snapshot.operation === "open-editor"))) throw new N("DIRECTOR_BUSY");
	let i = r.data.directorScene === void 0 ? void 0 : b(r.data.directorScene), a = r.data.directorResultManifest === void 0 ? void 0 : S(r.data.directorResultManifest), s = e.sceneSource ?? "director-scene";
	if (s === "saved-blender" && !a) throw new N("DIRECTOR_SAVED_SCENE_REQUIRED");
	let c = new AbortController(), l = o(f.getState(), r.id, { onCancel: () => c.abort() });
	if (!l) throw new N("DIRECTOR_CONTEXT_CHANGED");
	let u, p, m = new Promise((e, t) => {
		u = e, p = t;
	}), h = Date.now(), g = {
		snapshot: {
			operationId: `director-operation-${d()}`,
			projectId: t.projectId,
			nodeId: r.id,
			instanceId: B(r.id, r.data),
			operation: e.operation,
			sceneSource: s,
			state: "preparing",
			createdAt: h,
			updatedAt: h,
			scene: i && z(i)
		},
		owner: { ...t },
		controller: c,
		guard: l,
		sceneReference: i,
		previousManifestReference: a,
		invalidated: !1,
		mutating: !1,
		acknowledged: !1,
		disposed: !1,
		resolveStart: u,
		rejectStart: p
	};
	P.set(g.snapshot.operationId, g), g.unsubscribe = f.subscribe(() => {
		!g.mutating && I(g) && !G(g) && (g.invalidated = !0, c.abort(), L(g, { state: "cancelling" }));
	});
	let _ = () => {
		c.abort(), L(g, { state: "cancelling" });
	};
	return n.signal?.addEventListener("abort", _, { once: !0 }), g.detachSignal = () => n.signal?.removeEventListener("abort", _), f.getState().updateNodeDataTransient(r.id, {
		error: void 0,
		...e.operation === "open-editor" ? { directorStatus: "open" } : {}
	}), L(g, {}), Z(g, { ...e }, t.source === "ui" && n.allowSetup === !0), m;
}
//#endregion
export { $ as a, ge as c, ye as i, _e as n, ve as o, Q as r, be as s, N as t };
