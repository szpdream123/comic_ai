import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./jsx-runtime-BAkIPmuO.js";
import { Ai as r, Bt as i, Ft as a, It as o, Lt as s, Nt as c, Pt as l, Ui as u, t as d, zt as f } from "./useAppStore-BH-MdRLu.js";
import { g as p, s as m } from "./directorSceneSchema-D22Qlbpb.js";
import { C as h } from "./fileService-BawXHbsK.js";
import { n as g } from "./rasterImageDimensions-CX1VK2cM.js";
import { n as _ } from "./directorDeskService-CxTbkz3X.js";
import { a as v, c as y, o as b, s as ee, t as te } from "./ResizeHandle-BHdRIIe-.js";
import { c as x, n as S, o as C, r as w, s as T } from "./directorNodeOperationService-BIuDmjdk.js";
//#region src/components/nodes/DirectorDeskNode.tsx
var E = /* @__PURE__ */ e(t(), 1), D = n(), ne = 320, re = 240;
function ie(e) {
	let t = {
		preparing: "准备 Blender",
		"loading-scene": "载入场景",
		rendering: "渲染",
		saving: "保存结果",
		finalizing: "校验结果"
	};
	if (e.state === "cancelling") return "正在取消 Blender…";
	let n = e.progress?.phase ? t[e.progress.phase] ?? "执行 Blender" : e.state === "preparing" ? "启动 Blender" : e.state === "collecting" ? "回收结果" : "执行 Blender";
	return !e.progress || e.progress.total <= 0 ? `${n}…` : `${n} ${Math.min(100, Math.round(e.progress.completed / e.progress.total * 100))}%`;
}
function ae(e) {
	return e instanceof Error && e.name === "AbortError";
}
function O({ id: e, data: t, selected: n }) {
	let O = d((e) => e.updateNodeDataTransient), k = d((e) => e.commitToHistory), A = d((e) => e.showToast), oe = d((e) => e.config.theme), { displayLabel: j, handleRename: M } = v(e, t, "3D 导演台"), [N, P] = (0, E.useState)(!1), [se, F] = (0, E.useState)(null), I = (0, E.useSyncExternalStore)(x, (0, E.useCallback)(() => w(e), [e]), () => void 0), L = se || (I ? ie(I) : null), R = (0, E.useRef)(!1), z = (0, E.useMemo)(() => typeof t.directorInstanceId == "string" && t.directorInstanceId || e, [t.directorInstanceId, e]), B = (0, E.useMemo)(() => f(t.directorRuntimeKind), [t.directorRuntimeKind]), V = B.supported ? B.kind : null, H = B.supported ? B.descriptor : null, U = B.supported ? B.descriptor.unavailableReason : B.reason, W = (0, E.useMemo)(() => _(t), [t.imageUrl, t.directorCaptureUrls]), G = (0, E.useMemo)(() => {
		let e = typeof t.imageUrl == "string" ? t.imageUrl.trim() : "";
		return (e ? [...W.filter((t) => t !== e), e] : W).slice(-4);
	}, [W, t.imageUrl]), K = t.nodeWidth || ne, q = t.nodeHeight || re, J = oe === "light" ? "light" : "dark";
	(0, E.useEffect)(() => {
		t.directorInstanceId !== z && O(e, { directorInstanceId: z });
	}, [
		t.directorInstanceId,
		e,
		z,
		O
	]);
	let ce = (0, E.useCallback)((t, n) => {
		O(e, {
			nodeWidth: t,
			nodeHeight: n
		});
	}, [e, O]), Y = (0, E.useCallback)(async (t) => {
		if (w(e)) return;
		let n = d.getState().currentProjectId;
		if (n) try {
			await T({
				nodeId: e,
				operation: t
			}, {
				source: "ui",
				projectId: n
			}, { allowSetup: !0 });
		} catch (e) {
			A(e instanceof Error ? e.message : "Blender 操作失败", "error");
		}
	}, [e, A]), le = (0, E.useCallback)(() => {
		let t = w(e), n = d.getState().currentProjectId;
		!t || !n || S(t.operationId, {
			source: "ui",
			projectId: n
		});
	}, [e]), X = (0, E.useCallback)(async (t) => {
		if (!t.length) return;
		let n = d.getState(), r = n.currentProjectId, i = n.nodes.find((t) => t.id === e)?.data;
		if (!i) return;
		let a = Array.isArray(i.directorCaptureUrls) ? [...i.directorCaptureUrls] : [], o = Array.isArray(i.directorCaptureFilePaths) ? [...i.directorCaptureFilePaths] : [], s = 0, c;
		for (let e of t) {
			let t = e.dataUrl?.trim(), n = e.mediaUrl?.trim(), l, u = e.filePath?.trim() || void 0;
			if (t?.startsWith("data:image/")) l = t;
			else if (n && u) l = n;
			else continue;
			if (t?.startsWith("data:image/") && r) try {
				let e = await h(t, r, p(i.label || "导演台", "png", "director"));
				e?.assetUrl && (l = e.assetUrl), e?.filePath && (u = e.filePath);
			} catch (e) {
				console.warn("[DirectorDeskNode] 截图落盘失败，使用 data URL", e);
			}
			a.push(l), u && o.push(u), e.manifestReference && (c = m(e.manifestReference)), s += 1;
		}
		if (s === 0) {
			A("未收到有效截图", "error");
			return;
		}
		let l = a[a.length - 1], u = o[o.length - 1], f = d.getState();
		f.currentProjectId !== r || !f.nodes.some((t) => t.id === e) || (f.updateNodeData(e, {
			directorCaptureUrls: a.slice(-12),
			directorCaptureFilePaths: o.slice(-12),
			imageUrl: l,
			filePath: u,
			thumbnailUrl: l,
			...c ? { directorResultManifest: c } : {},
			status: "success",
			error: void 0,
			directorStatus: "ready"
		}), f.incrementRevision(), A(`已同步 ${s} 张导演台截图到节点`));
	}, [e, A]);
	(0, E.useEffect)(() => i(t.directorRuntimeKind, z, (t) => {
		if (t.type === "ready") {
			P(!0), O(e, {
				directorStatus: "ready",
				error: void 0
			});
			return;
		}
		if (t.type === "closed") {
			P(!1), O(e, { directorStatus: W.length ? "ready" : "idle" });
			return;
		}
		t.type === "captures" && X(t.captures);
	}), [
		W.length,
		t.directorRuntimeKind,
		e,
		z,
		X,
		O
	]);
	let Z = (0, E.useCallback)(async () => {
		let n = globalThis.__COMIC_AI_CANVAS_DIRECTOR_DESK_BRIDGE__?.open;
		if (typeof n === "function") {
			await n({ id: e, type: "ai-director", data: t });
			return;
		}
		if (!L) {
			if (V === "blender") {
				await Y("open-editor");
				return;
			}
			P(!1), O(e, { directorStatus: "open" });
			try {
				let n = await o(t.directorRuntimeKind);
				if (n.state === "setup-required") {
					O(e, {
						directorStatus: "idle",
						error: void 0
					}), d.getState().requestDirectorDeskRuntime(z, !0);
					return;
				}
				if (n.state === "unavailable") throw Error(n.reason);
				await s("lightweight-web", {
					instanceId: z,
					theme: J
				});
			} catch (t) {
				if (ae(t)) {
					O(e, {
						directorStatus: W.length ? "ready" : "idle",
						error: void 0
					});
					return;
				}
				let n = t instanceof Error ? t.message : "打开 3D 导演台失败";
				P(!1), O(e, {
					directorStatus: "idle",
					error: n
				}), A(n, "error");
			} finally {
				F(null);
			}
		}
	}, [
		L,
		W.length,
		t.directorRuntimeKind,
		J,
		e,
		z,
		Y,
		V,
		A,
		O
	]), ue = (0, E.useCallback)(async () => {
		let n = globalThis.__COMIC_AI_CANVAS_DIRECTOR_DESK_BRIDGE__?.syncFrame;
		if (typeof n === "function") {
			await n({ id: e, type: "ai-director", data: t });
			return;
		}
		if (!L) {
			if (V === "blender") {
				await Y("render-frame");
				return;
			}
			if (!N) {
				A("请先打开并等待导演台就绪", "error");
				return;
			}
			F("导出当前帧…");
			try {
				await X([await l(t.directorRuntimeKind, z, {
					position: "current",
					quality: "1080p",
					fileName: `${t.label || "director"}-frame.png`
				})]);
			} catch (t) {
				let n = t instanceof Error ? t.message : "导出帧失败";
				A(n, "error"), O(e, { error: n });
			} finally {
				F(null);
			}
		}
	}, [
		L,
		t.directorRuntimeKind,
		t.label,
		e,
		z,
		X,
		N,
		Y,
		V,
		A,
		O
	]), de = (0, E.useCallback)(async () => {
		let n = globalThis.__COMIC_AI_CANVAS_DIRECTOR_DESK_BRIDGE__?.exportVideo;
		if (typeof n === "function") {
			await n({ id: e, type: "ai-director", data: t });
			return;
		}
		if (!(L || R.current)) {
			if (V === "blender") {
				await Y("render-video");
				return;
			}
			if (!N) {
				A("请先打开并等待导演台就绪", "error");
				return;
			}
			R.current = !0, F("导出参考视频…");
			try {
				let n = await a(t.directorRuntimeKind, z, {
					quality: "720p",
					fps: 24,
					fileName: `${t.label || "director"}-ref.mp4`
				}), r = n.mediaUrl, i = n.filePath, o = d.getState().currentProjectId;
				if (o && r.startsWith("data:")) try {
					let e = await h(r, o, p(t.label || "导演台", "mp4", "director-ref"));
					e?.assetUrl && (r = e.assetUrl), e?.filePath && (i = e.filePath);
				} catch {}
				let s = d.getState(), c = s.nodes.find((t) => t.id === e);
				if (!c || s.currentProjectId !== o) return;
				s.commitToHistory(), s.updateNodeDataTransient(e, {
					videoUrl: r,
					filePath: i || c.data.filePath,
					status: "success",
					directorStatus: "ready",
					error: void 0
				}), s.incrementRevision(), A("参考视频已写入节点；图生视频请优先使用同步的截图/帧");
			} catch (t) {
				let n = t instanceof Error ? t.message : "导出视频失败";
				A(n, "error"), O(e, { error: n });
			} finally {
				R.current = !1, F(null);
			}
		}
	}, [
		L,
		t.directorRuntimeKind,
		t.label,
		e,
		z,
		N,
		Y,
		V,
		A,
		O
	]), fe = (0, E.useCallback)((t) => {
		let n = t.target.value, r = d.getState().currentProjectId;
		if (!(!r || n === V)) try {
			C(e, n, {
				source: "ui",
				projectId: r
			}), P(!1);
		} catch (e) {
			A(e instanceof Error ? e.message : "切换运行时失败", "error");
		}
	}, [
		e,
		V,
		A
	]), Q = B.supported && B.descriptor.capabilities.open, pe = B.supported && B.descriptor.capabilities.exportFrame, me = B.supported && B.descriptor.capabilities.exportVideo, $ = V === "blender" || N;
	return /* @__PURE__ */ (0, D.jsx)(D.Fragment, { children: /* @__PURE__ */ (0, D.jsxs)("div", {
		className: "node-wrapper relative",
		style: { width: K },
		children: [
			/* @__PURE__ */ (0, D.jsx)(y, {
				kind: "ai-director",
				label: j,
				displayId: t.displayId,
				nodeId: e,
				onRename: M
			}),
			/* @__PURE__ */ (0, D.jsxs)("div", {
				className: `node director-node ${n ? "selected" : ""} ${t.status === "loading" ? "loading" : ""}`,
				style: {
					width: K,
					height: q
				},
				onDoubleClick: () => {
					Z();
				},
				children: [
					/* @__PURE__ */ (0, D.jsxs)("div", {
						className: "node-preview director-preview",
						children: [
							/* @__PURE__ */ (0, D.jsx)("div", {
								className: "nodrag nopan absolute left-2 top-2 z-10",
								children: /* @__PURE__ */ (0, D.jsxs)("select", {
									value: V ?? "",
									onChange: fe,
									disabled: !!L,
									"aria-label": "3D 导演运行时",
									"data-tooltip": U,
									className: "h-7 max-w-[180px] rounded-md border border-canvas-border bg-canvas-surface/90 px-2 text-[11px] text-canvas-text shadow-sm outline-none focus:border-violet-400",
									children: [!B.supported && /* @__PURE__ */ (0, D.jsx)("option", {
										value: "",
										disabled: !0,
										children: "未知运行时"
									}), c.map((e) => /* @__PURE__ */ (0, D.jsx)("option", {
										value: e.kind,
										disabled: !e.selectable && V !== e.kind,
										children: e.label
									}, e.kind))]
								})
							}),
							W.length > 0 ? /* @__PURE__ */ (0, D.jsx)("div", {
								className: "director-capture-grid",
								"data-capture-count": G.length,
								children: G.map((e, t) => /* @__PURE__ */ (0, D.jsx)("img", {
									src: e,
									alt: "",
									className: "director-capture-thumb",
									draggable: !1
								}, `${t}-${e.slice(0, 48)}`))
							}) : /* @__PURE__ */ (0, D.jsxs)("div", {
								className: "node-preview-placeholder",
								children: [
									/* @__PURE__ */ (0, D.jsx)(g, {
										icon: "mdi:video-3d",
										width: 28,
										height: 28
									}),
									/* @__PURE__ */ (0, D.jsx)("span", { children: H?.label ?? "未知运行时" }),
									/* @__PURE__ */ (0, D.jsx)("span", {
										className: "text-node-edit-hint",
										children: U || "双击打开 · 同步截图后连线生视频"
									})
								]
							}),
							t.error && /* @__PURE__ */ (0, D.jsx)(ee, {
								nodeId: e,
								message: String(t.error)
							})
						]
					}),
					/* @__PURE__ */ (0, D.jsxs)("div", {
						className: "director-node-actions nodrag nopan",
						children: [
							/* @__PURE__ */ (0, D.jsx)("button", {
								type: "button",
								className: "director-node-btn primary",
								disabled: !Q || !!L && V !== "blender",
								onClick: () => {
									L && V === "blender" ? le() : Z();
								},
								"data-tooltip": U,
								children: L && V === "blender" ? "取消任务" : Q ? V === "blender" ? "打开 Blender" : N ? "聚焦导演台" : "打开导演台" : "运行时不可用"
							}),
							/* @__PURE__ */ (0, D.jsx)("button", {
								type: "button",
								className: "director-node-btn grid h-7 w-7 place-items-center p-0",
								disabled: !$ || !pe || !!L,
								onClick: () => {
									ue();
								},
								"aria-label": "同步当前帧",
								"data-tooltip": "同步当前帧",
								children: /* @__PURE__ */ (0, D.jsx)(g, {
									icon: "lucide:scan-line",
									width: 14,
									height: 14
								})
							}),
							/* @__PURE__ */ (0, D.jsx)("button", {
								type: "button",
								className: "director-node-btn grid h-7 w-7 place-items-center p-0",
								disabled: !$ || !me || !!L,
								onClick: () => {
									de();
								},
								"aria-label": "导出参考视频",
								"data-tooltip": "导出参考视频",
								children: /* @__PURE__ */ (0, D.jsx)(g, {
									icon: "lucide:video",
									width: 14,
									height: 14
								})
							}),
							/* @__PURE__ */ (0, D.jsx)("span", {
								className: "director-node-meta",
								children: L || U || (W.length > 0 ? `${W.length} 张参考图` : "未同步截图")
							})
						]
					}),
					/* @__PURE__ */ (0, D.jsx)(r, {
						type: "target",
						position: u.Left,
						id: "left",
						className: "node-handle handle-target handle-director",
						children: /* @__PURE__ */ (0, D.jsx)(b, {
							className: "gooey-btn-left",
							hue: 280
						})
					}),
					/* @__PURE__ */ (0, D.jsx)(r, {
						type: "source",
						position: u.Right,
						id: "right",
						className: "node-handle handle-source handle-director",
						children: /* @__PURE__ */ (0, D.jsx)(b, {
							className: "gooey-btn-right",
							hue: 280
						})
					})
				]
			}),
			/* @__PURE__ */ (0, D.jsx)(te, {
				nodeId: e,
				currentWidth: K,
				currentHeight: q,
				minWidth: 260,
				minHeight: 180,
				onResizeStart: k,
				onResizeEnd: k,
				onResize: ce
			})
		]
	}) });
}
var k = (0, E.memo)(O);
//#endregion
export { k as default };
