import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./jsx-runtime-BAkIPmuO.js";
import { At as r, Ei as i, F as a, Ft as o, It as s, Mt as c, N as l, Nt as u, P as d, Pt as ee, g as f, h as p, jt as te, kt as ne, m, p as h, t as g, zi as _ } from "./useAppStore-CcUL4Jo0.js";
import { c as re, d as v, g as y, i as b, l as x, n as S, s as C, t as w, u as T } from "./directorSceneSchema-BcP-NXqL.js";
import { C as E } from "./fileService-zQLozbOU.js";
import { n as D } from "./rasterImageDimensions-CX1VK2cM.js";
import { n as ie } from "./directorDeskService-CxTbkz3X.js";
import { a as ae, c as oe, o as O, s as se, t as ce } from "./ResizeHandle-DEPb0GHe.js";
import { n as le } from "./directorBlenderRuntimeService-4walvpJO.js";
//#region src/services/directorSceneService.ts
var k = /* @__PURE__ */ e(t(), 1), A = class extends Error {
	name = "DirectorSceneServiceError";
	code = "DIRECTOR_SCENE_SERVICE_INVALID";
}, j = new TextEncoder(), M = new TextDecoder("utf-8", { fatal: !0 });
function N(e) {
	throw new A(e);
}
function P(e, t) {
	if (e.byteLength !== t.byteLength) return !1;
	for (let n = 0; n < e.byteLength; n += 1) if (e[n] !== t[n]) return !1;
	return !0;
}
function F(e, t) {
	try {
		return M.decode(e);
	} catch {
		N(`${t} 不是有效的 UTF-8`);
	}
}
function I(e) {
	return {
		relativePath: e.relativePath,
		sha256: e.sha256,
		bytes: e.bytes
	};
}
function L(e) {
	return [...e.environment.asset ? [e.environment.asset] : [], ...e.entities.map((e) => e.asset)];
}
function R(e, t) {
	let n = /* @__PURE__ */ new Map(), r = 0;
	for (let i of e) {
		let e = n.get(i.relativePath);
		if (e) {
			(e.sha256 !== i.sha256 || e.bytes !== i.bytes) && N(`${t} 对同一路径声明了不同内容`);
			continue;
		}
		r += i.bytes, (!Number.isSafeInteger(r) || r > 67108864) && N(`${t} 超过 Phase 1-A 的 64 MiB renderer 验证上限`), n.set(i.relativePath, i);
	}
	return [...n.values()];
}
async function z(e, t, n) {
	for (let r of R(t, n)) await h({
		projectId: e,
		reference: r,
		maxBytes: w
	});
}
function B(e, t) {
	(e.schemaVersion !== t.schemaVersion || e.sceneId !== t.sceneId || e.revision !== t.revision) && N("Director Scene 内容与引用身份不匹配");
}
function V(e, t) {
	let n = T(F(e, "Director Scene"));
	return B(n, t), P(e, j.encode(v(n))) || N("Director Scene 不是规范序列化格式"), n;
}
async function H(e, t) {
	if (!t.parent) return;
	let { data: n, reference: r } = await m({
		projectId: e,
		relativePath: b(t.sceneId, t.parent.revision, t.parent.sha256),
		sha256: t.parent.sha256,
		maxBytes: S
	});
	V(n, {
		schemaVersion: 1,
		sceneId: t.sceneId,
		revision: t.parent.revision,
		...r
	});
}
async function ue(e, t, n = {}) {
	let r = re(t);
	if (r.revision === 1) n.previousReference !== void 0 && N("首个 Director Scene revision 不应提供父引用");
	else {
		n.previousReference === void 0 && N("新的 Director Scene revision 缺少父引用");
		let t = x(n.previousReference);
		(t.sceneId !== r.sceneId || t.revision !== r.parent?.revision || t.sha256 !== r.parent?.sha256) && N("新的 Director Scene revision 与父引用不匹配"), await U(e, t);
	}
	await z(e, L(r).map(I), "Director Scene 资产");
	let i = j.encode(v(r)), a = await p(i), o = {
		schemaVersion: 1,
		sceneId: r.sceneId,
		revision: r.revision,
		relativePath: b(r.sceneId, r.revision, a),
		sha256: a,
		bytes: i.byteLength
	};
	return await f({
		projectId: e,
		reference: I(o),
		data: i,
		maxBytes: S
	}), {
		scene: r,
		reference: o
	};
}
async function U(e, t) {
	let n = x(t), r = V(await h({
		projectId: e,
		reference: I(n),
		maxBytes: S
	}), n);
	return await H(e, r), await z(e, L(r).map(I), "Director Scene 资产"), r;
}
//#endregion
//#region src/components/nodes/DirectorDeskNode.tsx
var W = n(), de = 320, fe = 240;
function G(e, t) {
	try {
		let n = x(e);
		return n.schemaVersion === t.schemaVersion && n.sceneId === t.sceneId && n.revision === t.revision && n.relativePath === t.relativePath && n.sha256 === t.sha256 && n.bytes === t.bytes;
	} catch {
		return !1;
	}
}
function pe(e, t) {
	if (e === void 0 && t === void 0) return !0;
	if (e === void 0 || t === void 0) return !1;
	try {
		let n = C(e);
		return n.schemaVersion === t.schemaVersion && n.sceneId === t.sceneId && n.sceneRevision === t.sceneRevision && n.sceneSha256 === t.sceneSha256 && n.manifestRevision === t.manifestRevision && n.relativePath === t.relativePath && n.sha256 === t.sha256 && n.bytes === t.bytes;
	} catch {
		return !1;
	}
}
function K(e) {
	let t = e.progress?.phase ? {
		preparing: "准备 Blender",
		"loading-scene": "载入场景",
		rendering: "渲染",
		saving: "保存结果",
		finalizing: "校验结果"
	}[e.progress.phase] ?? "执行 Blender" : e.state === "starting" ? "启动 Blender" : e.state === "awaiting-collection" || e.state === "collecting" ? "回收结果" : "执行 Blender";
	return !e.progress || e.progress.total <= 0 ? `${t}…` : `${t} ${Math.min(100, Math.round(e.progress.completed / e.progress.total * 100))}%`;
}
function q(e) {
	return e instanceof Error && e.name === "AbortError";
}
function J({ id: e, data: t, selected: n }) {
	let f = g((e) => e.updateNodeData), p = g((e) => e.updateNodeDataTransient), m = g((e) => e.commitToHistory), h = g((e) => e.showToast), re = g((e) => e.config.theme), { displayLabel: v, handleRename: b } = ae(e, t, "3D 导演台"), [S, w] = (0, k.useState)(!1), [T, A] = (0, k.useState)(null), j = (0, k.useRef)(null), M = (0, k.useMemo)(() => typeof t.directorInstanceId == "string" && t.directorInstanceId || e, [t.directorInstanceId, e]), N = (0, k.useMemo)(() => o(t.directorRuntimeKind), [t.directorRuntimeKind]), P = N.supported ? N.kind : null, F = N.supported ? N.descriptor : null, I = N.supported ? N.descriptor.unavailableReason : N.reason, L = (0, k.useMemo)(() => ie(t), [t.imageUrl, t.directorCaptureUrls]), R = (0, k.useMemo)(() => {
		let e = typeof t.imageUrl == "string" ? t.imageUrl.trim() : "";
		return (e ? [...L.filter((t) => t !== e), e] : L).slice(-4);
	}, [L, t.imageUrl]), z = t.nodeWidth || de, B = t.nodeHeight || fe, V = re === "light" ? "light" : "dark";
	(0, k.useEffect)(() => {
		t.directorInstanceId !== M && p(e, { directorInstanceId: M });
	}, [
		t.directorInstanceId,
		e,
		M,
		p
	]);
	let H = (0, k.useCallback)((t, n) => {
		p(e, {
			nodeWidth: t,
			nodeHeight: n
		});
	}, [e, p]), J = (0, k.useCallback)(async () => {
		let t = g.getState(), n = t.currentProjectId, r = t.nodes.find((t) => t.id === e && t.type === "ai-director");
		if (!n || !r) throw Error("当前 3D 导演台不属于有效项目");
		let i = r.data, a = o(i.directorRuntimeKind);
		if (!a.supported || a.kind !== "blender") throw Error("当前节点已不再使用 Blender 运行时");
		let s = typeof i.directorInstanceId == "string" && i.directorInstanceId || e;
		if (i.directorScene !== void 0) {
			let t = x(i.directorScene), r = await U(n, t), a = g.getState(), c = a.nodes.find((t) => t.id === e && t.type === "ai-director")?.data, l = o(c?.directorRuntimeKind), u = typeof c?.directorInstanceId == "string" && c.directorInstanceId || e;
			if (a.currentProjectId !== n || !c || !l.supported || l.kind !== "blender" || u !== s || !G(c.directorScene, t)) throw Error("读取场景期间画布状态已变化");
			return {
				projectId: n,
				instanceId: s,
				scene: r,
				reference: t
			};
		}
		let c = await ue(n, le(s)), l = g.getState(), u = l.nodes.find((t) => t.id === e && t.type === "ai-director")?.data, d = o(u?.directorRuntimeKind), ee = typeof u?.directorInstanceId == "string" && u.directorInstanceId || e;
		if (l.currentProjectId !== n || !u || !d.supported || d.kind !== "blender" || ee !== s) throw Error("创建场景期间画布状态已变化");
		if (u.directorScene !== void 0) {
			let e = x(u.directorScene);
			return {
				projectId: n,
				instanceId: s,
				scene: await U(n, e),
				reference: e
			};
		}
		return l.updateNodeData(e, {
			directorScene: c.reference,
			error: void 0
		}), l.incrementRevision(), {
			projectId: n,
			instanceId: s,
			scene: c.scene,
			reference: c.reference
		};
	}, [e]), Y = (0, k.useCallback)(async () => {
		if (j.current && !j.current.signal.aborted) throw Error("已有 Blender 任务正在执行");
		let t = await J(), n = g.getState(), r = n.nodes.find((t) => t.id === e && t.type === "ai-director")?.data;
		if (!r) throw Error("3D 导演台节点已不存在");
		let i = r.directorResultManifest === void 0 ? void 0 : C(r.directorResultManifest), o = new AbortController(), s = a(n, e, { onCancel: () => o.abort() });
		if (!s) throw Error("无法为当前画布创建 Blender 任务");
		return j.current = o, {
			projectId: t.projectId,
			instanceId: t.instanceId,
			scene: t.scene,
			sceneReference: t.reference,
			previousManifestReference: i,
			controller: o,
			guard: s
		};
	}, [J, e]), X = (0, k.useCallback)((t) => {
		let n = g.getState();
		if (!d(t.guard, n)) return !1;
		let r = n.nodes.find((t) => t.id === e && t.type === "ai-director")?.data;
		if (!r || n.currentProjectId !== t.projectId) return !1;
		let i = o(r.directorRuntimeKind), a = typeof r.directorInstanceId == "string" && r.directorInstanceId || e;
		return i.supported && i.kind === "blender" && a === t.instanceId && G(r.directorScene, t.sceneReference) && pe(r.directorResultManifest, t.previousManifestReference);
	}, [e]), Z = (0, k.useCallback)((e) => {
		l(e.guard), j.current === e.controller && (j.current = null);
	}, []), Q = (0, k.useCallback)(() => {
		j.current?.abort();
	}, []);
	(0, k.useEffect)(() => () => {
		j.current?.abort();
	}, []);
	let $ = (0, k.useCallback)(async (t) => {
		if (!t.length) return;
		let n = g.getState(), r = n.currentProjectId, i = n.nodes.find((t) => t.id === e)?.data;
		if (!i) return;
		let a = Array.isArray(i.directorCaptureUrls) ? [...i.directorCaptureUrls] : [], o = Array.isArray(i.directorCaptureFilePaths) ? [...i.directorCaptureFilePaths] : [], s = 0, c;
		for (let e of t) {
			let t = e.dataUrl?.trim(), n = e.mediaUrl?.trim(), l, u = e.filePath?.trim() || void 0;
			if (t?.startsWith("data:image/")) l = t;
			else if (n && u) l = n;
			else continue;
			if (t?.startsWith("data:image/") && r) try {
				let e = await E(t, r, y(i.label || "导演台", "png", "director"));
				e?.assetUrl && (l = e.assetUrl), e?.filePath && (u = e.filePath);
			} catch (e) {
				console.warn("[DirectorDeskNode] 截图落盘失败，使用 data URL", e);
			}
			a.push(l), u && o.push(u), e.manifestReference && (c = C(e.manifestReference)), s += 1;
		}
		if (s === 0) {
			h("未收到有效截图", "error");
			return;
		}
		let l = a[a.length - 1], u = o[o.length - 1], d = g.getState();
		d.currentProjectId !== r || !d.nodes.some((t) => t.id === e) || (d.updateNodeData(e, {
			directorCaptureUrls: a.slice(-12),
			directorCaptureFilePaths: o.slice(-12),
			imageUrl: l,
			filePath: u,
			thumbnailUrl: l,
			...c ? { directorResultManifest: c } : {},
			status: "success",
			error: void 0,
			directorStatus: "ready"
		}), d.incrementRevision(), h(`已同步 ${s} 张导演台截图到节点`));
	}, [e, h]);
	(0, k.useEffect)(() => s(t.directorRuntimeKind, M, (t) => {
		if (t.type === "ready") {
			w(!0), p(e, {
				directorStatus: "ready",
				error: void 0
			});
			return;
		}
		if (t.type === "closed") {
			w(!1), p(e, { directorStatus: L.length ? "ready" : "idle" });
			return;
		}
		t.type === "captures" && $(t.captures);
	}), [
		L.length,
		t.directorRuntimeKind,
		e,
		M,
		$,
		p
	]);
	let me = (0, k.useCallback)(async () => {
		if (T) return;
		w(!1), p(e, { directorStatus: "open" });
		let n = null;
		try {
			let r = await c(t.directorRuntimeKind);
			if (r.state === "setup-required") if (P === "blender") A("选择 Blender…"), await ee("blender");
			else {
				p(e, {
					directorStatus: "idle",
					error: void 0
				}), g.getState().requestDirectorDeskRuntime(M, !0);
				return;
			}
			if (r.state === "unavailable") throw Error(r.reason);
			if (P === "blender") {
				A("准备 Blender 导演模式…"), n = await Y();
				let e = {
					projectId: n.projectId,
					sceneReference: n.sceneReference,
					previousManifestReference: n.previousManifestReference,
					signal: n.controller.signal,
					onStatus: (e) => A(K(e))
				}, t = await u("blender", {
					instanceId: n.instanceId,
					theme: V,
					blender: e
				});
				if (!X(n)) {
					h("Blender 已返回，但画布绑定已变化，结果未写回节点", "error");
					return;
				}
				if (!t?.capture) throw Error("Blender 保存返回未生成当前镜头图");
				await $([t.capture]), h("Blender 高级编辑已保存并返回 3D 导演台");
				return;
			}
			await u("lightweight-web", {
				instanceId: M,
				theme: V
			});
		} catch (t) {
			if (q(t)) {
				p(e, {
					directorStatus: L.length ? "ready" : "idle",
					error: void 0
				});
				return;
			}
			let n = t instanceof Error ? t.message : "打开 3D 导演台失败";
			w(!1), p(e, {
				directorStatus: "idle",
				error: n
			}), h(n, "error");
		} finally {
			n && Z(n), A(null);
		}
	}, [
		T,
		L.length,
		t.directorRuntimeKind,
		V,
		Z,
		e,
		M,
		X,
		$,
		Y,
		P,
		h,
		p
	]), he = (0, k.useCallback)(async () => {
		if (P !== "blender" && !S) {
			h("请先打开并等待导演台就绪", "error");
			return;
		}
		A("导出当前帧…");
		let n = null;
		try {
			let e, i, a = M;
			P === "blender" && (n = await Y(), a = n.instanceId, i = n.scene.timeline.startFrame, e = {
				projectId: n.projectId,
				sceneReference: n.sceneReference,
				previousManifestReference: n.previousManifestReference,
				signal: n.controller.signal,
				onStatus: (e) => A(K(e))
			});
			let o = await r(P ?? t.directorRuntimeKind, a, {
				position: "current",
				quality: "1080p",
				fileName: `${t.label || "director"}-frame.png`,
				...i === void 0 ? {} : { targetFrame: i },
				...e ? { blender: e } : {}
			});
			if (n && !X(n)) {
				h("Blender 已返回，但画布绑定已变化，当前帧未写回节点", "error");
				return;
			}
			await $([o]);
		} catch (t) {
			if (q(t)) {
				h("已取消 Blender 任务");
				return;
			}
			h(t instanceof Error ? t.message : "导出帧失败", "error"), p(e, { error: t instanceof Error ? t.message : "导出帧失败" });
		} finally {
			n && Z(n), A(null);
		}
	}, [
		t.directorRuntimeKind,
		t.label,
		Z,
		e,
		M,
		X,
		$,
		Y,
		S,
		P,
		h,
		p
	]), ge = (0, k.useCallback)(async () => {
		if (P !== "blender" && !S) {
			h("请先打开并等待导演台就绪", "error");
			return;
		}
		A("导出参考视频…");
		let n = null;
		try {
			let r, i = M;
			P === "blender" && (n = await Y(), i = n.instanceId, r = {
				projectId: n.projectId,
				sceneReference: n.sceneReference,
				previousManifestReference: n.previousManifestReference,
				signal: n.controller.signal,
				onStatus: (e) => A(K(e))
			});
			let a = await te(P ?? t.directorRuntimeKind, i, {
				quality: "720p",
				fps: 24,
				fileName: `${t.label || "director"}-ref.mp4`,
				...r ? { blender: r } : {}
			});
			if (n && !X(n)) {
				h("Blender 已返回，但画布绑定已变化，参考视频未写回节点", "error");
				return;
			}
			let o = a.mediaUrl, s = o, c = a.filePath, l = n?.projectId ?? g.getState().currentProjectId;
			if (l && o.startsWith("data:")) try {
				let e = await E(o, l, y(t.label || "导演台", "mp4", "director-ref"));
				e?.assetUrl && (s = e.assetUrl), e?.filePath && (c = e.filePath);
			} catch {}
			let u = g.getState(), d = u.nodes.find((t) => t.id === e)?.data;
			if (!d || u.currentProjectId !== l) return;
			u.updateNodeData(e, {
				videoUrl: s,
				filePath: c || d.filePath,
				...a.manifestReference ? { directorResultManifest: a.manifestReference } : {},
				status: "success",
				directorStatus: "ready",
				error: void 0
			}), u.incrementRevision(), h("参考视频已写入节点；图生视频请优先使用同步的截图/帧");
		} catch (t) {
			if (q(t)) {
				h("已取消 Blender 任务");
				return;
			}
			h(t instanceof Error ? t.message : "导出视频失败", "error"), p(e, { error: t instanceof Error ? t.message : "导出视频失败" });
		} finally {
			n && Z(n), A(null);
		}
	}, [
		t.directorRuntimeKind,
		t.label,
		Z,
		e,
		M,
		X,
		Y,
		S,
		P,
		h,
		p
	]), _e = (0, k.useCallback)((t) => {
		let n = t.target.value;
		n !== P && (Q(), w(!1), f(e, {
			directorRuntimeKind: n,
			directorStatus: "idle",
			error: void 0
		}), g.getState().incrementRevision());
	}, [
		Q,
		e,
		P,
		f
	]), ve = N.supported && N.descriptor.capabilities.open, ye = N.supported && N.descriptor.capabilities.exportFrame, be = N.supported && N.descriptor.capabilities.exportVideo, xe = P === "blender" || S;
	return /* @__PURE__ */ (0, W.jsx)(W.Fragment, { children: /* @__PURE__ */ (0, W.jsxs)("div", {
		className: "node-wrapper relative",
		style: { width: z },
		children: [
			/* @__PURE__ */ (0, W.jsx)(oe, {
				kind: "ai-director",
				label: v,
				displayId: t.displayId,
				nodeId: e,
				onRename: b
			}),
			/* @__PURE__ */ (0, W.jsxs)("div", {
				className: `node director-node ${n ? "selected" : ""} ${t.status === "loading" ? "loading" : ""}`,
				style: {
					width: z,
					height: B
				},
				onDoubleClick: () => {
					me();
				},
				children: [
					/* @__PURE__ */ (0, W.jsxs)("div", {
						className: "node-preview director-preview",
						children: [
							/* @__PURE__ */ (0, W.jsx)("div", {
								className: "nodrag nopan absolute left-2 top-2 z-10",
								children: /* @__PURE__ */ (0, W.jsxs)("select", {
									value: P ?? "",
									onChange: _e,
									disabled: !!T,
									"aria-label": "3D 导演运行时",
									"data-tooltip": I,
									className: "h-7 max-w-[180px] rounded-md border border-canvas-border bg-canvas-surface/90 px-2 text-[11px] text-canvas-text shadow-sm outline-none focus:border-violet-400",
									children: [!N.supported && /* @__PURE__ */ (0, W.jsx)("option", {
										value: "",
										disabled: !0,
										children: "未知运行时"
									}), ne.map((e) => /* @__PURE__ */ (0, W.jsx)("option", {
										value: e.kind,
										disabled: !e.selectable && P !== e.kind,
										children: e.label
									}, e.kind))]
								})
							}),
							L.length > 0 ? /* @__PURE__ */ (0, W.jsx)("div", {
								className: "director-capture-grid",
								"data-capture-count": R.length,
								children: R.map((e, t) => /* @__PURE__ */ (0, W.jsx)("img", {
									src: e,
									alt: "",
									className: "director-capture-thumb",
									draggable: !1
								}, `${t}-${e.slice(0, 48)}`))
							}) : /* @__PURE__ */ (0, W.jsxs)("div", {
								className: "node-preview-placeholder",
								children: [
									/* @__PURE__ */ (0, W.jsx)(D, {
										icon: "mdi:video-3d",
										width: 28,
										height: 28
									}),
									/* @__PURE__ */ (0, W.jsx)("span", { children: F?.label ?? "未知运行时" }),
									/* @__PURE__ */ (0, W.jsx)("span", {
										className: "text-node-edit-hint",
										children: I || "双击打开 · 同步截图后连线生视频"
									})
								]
							}),
							t.error && /* @__PURE__ */ (0, W.jsx)(se, {
								nodeId: e,
								message: String(t.error)
							})
						]
					}),
					/* @__PURE__ */ (0, W.jsxs)("div", {
						className: "director-node-actions nodrag nopan",
						children: [
							/* @__PURE__ */ (0, W.jsx)("button", {
								type: "button",
								className: "director-node-btn primary",
								disabled: !ve || !!T && P !== "blender",
								onClick: () => {
									T && P === "blender" ? Q() : me();
								},
								"data-tooltip": I,
								children: T && P === "blender" ? "取消任务" : ve ? P === "blender" ? "打开 Blender" : S ? "聚焦导演台" : "打开导演台" : "运行时不可用"
							}),
							/* @__PURE__ */ (0, W.jsx)("button", {
								type: "button",
								className: "director-node-btn grid h-7 w-7 place-items-center p-0",
								disabled: !xe || !ye || !!T,
								onClick: () => {
									he();
								},
								"aria-label": "同步当前帧",
								"data-tooltip": "同步当前帧",
								children: /* @__PURE__ */ (0, W.jsx)(D, {
									icon: "lucide:scan-line",
									width: 14,
									height: 14
								})
							}),
							/* @__PURE__ */ (0, W.jsx)("button", {
								type: "button",
								className: "director-node-btn grid h-7 w-7 place-items-center p-0",
								disabled: !xe || !be || !!T,
								onClick: () => {
									ge();
								},
								"aria-label": "导出参考视频",
								"data-tooltip": "导出参考视频",
								children: /* @__PURE__ */ (0, W.jsx)(D, {
									icon: "lucide:video",
									width: 14,
									height: 14
								})
							}),
							/* @__PURE__ */ (0, W.jsx)("span", {
								className: "director-node-meta",
								children: T || I || (L.length > 0 ? `${L.length} 张参考图` : "未同步截图")
							})
						]
					}),
					/* @__PURE__ */ (0, W.jsx)(i, {
						type: "target",
						position: _.Left,
						id: "left",
						className: "node-handle handle-target handle-director",
						children: /* @__PURE__ */ (0, W.jsx)(O, {
							className: "gooey-btn-left",
							hue: 280
						})
					}),
					/* @__PURE__ */ (0, W.jsx)(i, {
						type: "source",
						position: _.Right,
						id: "right",
						className: "node-handle handle-source handle-director",
						children: /* @__PURE__ */ (0, W.jsx)(O, {
							className: "gooey-btn-right",
							hue: 280
						})
					})
				]
			}),
			/* @__PURE__ */ (0, W.jsx)(ce, {
				nodeId: e,
				currentWidth: z,
				currentHeight: B,
				minWidth: 260,
				minHeight: 180,
				onResizeStart: m,
				onResizeEnd: m,
				onResize: H
			})
		]
	}) });
}
var Y = (0, k.memo)(J);
//#endregion
export { Y as default };
