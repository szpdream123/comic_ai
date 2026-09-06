import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./react-dom-BhFnNZvF.js";
import { t as r } from "./jsx-runtime-BAkIPmuO.js";
import { Ft as i, Nt as a, t as o } from "./useAppStore-CcUL4Jo0.js";
import { r as s } from "./dist-js-De6wNmmK.js";
import { t as c } from "./ModalOverlay-DopvjrY3.js";
import { n as l } from "./rasterImageDimensions-CX1VK2cM.js";
import { a as u, i as d, r as f, s as p, t as m } from "./directorDeskRuntimeService-BVEhEsXx.js";
//#region src/components/director/DirectorDeskDownloadDialog.tsx
var h = /* @__PURE__ */ e(t(), 1), g = n(), _ = r();
function v({ phase: e, version: t, progress: n, stageText: r, error: i, cancelling: a, onConfirm: o, onSelectArchive: s, onCancel: u, onRetry: d }) {
	let f = e === "downloading";
	return (0, g.createPortal)(/* @__PURE__ */ (0, _.jsx)(c, {
		isOpen: !0,
		onClose: f ? () => {} : u,
		ariaLabel: "下载 3D 导演台",
		className: "w-[min(420px,calc(100vw-32px))]",
		closeOnBackdrop: !f,
		motionPreset: "quick",
		children: /* @__PURE__ */ (0, _.jsxs)("div", {
			className: "p-5",
			children: [
				/* @__PURE__ */ (0, _.jsxs)("div", {
					className: "mb-4 flex items-start gap-3",
					children: [/* @__PURE__ */ (0, _.jsx)("div", {
						className: "grid h-10 w-10 shrink-0 place-items-center rounded-lg bg-violet-500/15 text-violet-400",
						children: /* @__PURE__ */ (0, _.jsx)(l, {
							icon: "mdi:video-3d",
							width: "22",
							height: "22"
						})
					}), /* @__PURE__ */ (0, _.jsxs)("div", {
						className: "min-w-0 flex-1",
						children: [/* @__PURE__ */ (0, _.jsx)("h2", {
							className: "text-sm font-semibold text-canvas-text",
							children: e === "error" ? "3D 导演台安装失败" : "下载 3D 导演台"
						}), /* @__PURE__ */ (0, _.jsx)("p", {
							className: "mt-1 text-xs leading-5 text-canvas-text-secondary",
							children: e === "prompt" ? `首次使用需要下载 v${t} 运行资源，下载约 54 MB，安装后约占 82 MB。` : e === "error" ? i : r
						})]
					})]
				}),
				f && /* @__PURE__ */ (0, _.jsxs)("div", {
					className: "mb-4",
					role: "status",
					"aria-live": "polite",
					children: [/* @__PURE__ */ (0, _.jsxs)("div", {
						className: "mb-1.5 flex items-center justify-between text-[11px] text-canvas-text-muted",
						children: [/* @__PURE__ */ (0, _.jsx)("span", { children: r }), /* @__PURE__ */ (0, _.jsxs)("span", { children: [Math.round(n), "%"] })]
					}), /* @__PURE__ */ (0, _.jsx)("div", {
						className: "h-1.5 overflow-hidden rounded-full bg-canvas-hover",
						children: /* @__PURE__ */ (0, _.jsx)("div", {
							className: "h-full rounded-full bg-violet-500 transition-[width] duration-200",
							style: { width: `${Math.max(0, Math.min(100, n))}%` }
						})
					})]
				}),
				/* @__PURE__ */ (0, _.jsxs)("div", {
					className: "flex justify-end gap-2",
					children: [
						/* @__PURE__ */ (0, _.jsx)("button", {
							type: "button",
							className: "rounded-lg bg-canvas-hover px-3 py-2 text-xs text-canvas-text-secondary transition-colors hover:bg-canvas-border disabled:cursor-not-allowed disabled:opacity-50",
							onClick: u,
							disabled: a,
							children: f ? a ? "正在取消..." : "取消安装" : "取消"
						}),
						(e === "prompt" || e === "error") && /* @__PURE__ */ (0, _.jsxs)("button", {
							type: "button",
							className: "inline-flex items-center gap-1.5 rounded-lg bg-canvas-hover px-3 py-2 text-xs text-canvas-text-secondary transition-colors hover:bg-canvas-border",
							onClick: s,
							children: [/* @__PURE__ */ (0, _.jsx)(l, {
								icon: "lucide:folder-open",
								width: "14",
								height: "14"
							}), "选择安装包"]
						}),
						e === "prompt" && /* @__PURE__ */ (0, _.jsxs)("button", {
							type: "button",
							className: "inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-500",
							onClick: o,
							children: [/* @__PURE__ */ (0, _.jsx)(l, {
								icon: "lucide:download",
								width: "14",
								height: "14"
							}), "下载并打开"]
						}),
						e === "error" && /* @__PURE__ */ (0, _.jsxs)("button", {
							type: "button",
							className: "inline-flex items-center gap-1.5 rounded-lg bg-violet-600 px-3 py-2 text-xs font-medium text-white transition-colors hover:bg-violet-500",
							onClick: d,
							children: [/* @__PURE__ */ (0, _.jsx)(l, {
								icon: "lucide:rotate-cw",
								width: "14",
								height: "14"
							}), "重试"]
						})
					]
				})
			]
		})
	}), document.body);
}
//#endregion
//#region src/components/director/DirectorDeskRuntimeManager.tsx
var y = "0.3.1";
function b(e) {
	let t = e.totalBytes > 0 ? Math.min(1, e.transferredBytes / e.totalBytes) : 0;
	return e.stage === "downloading" ? {
		percent: t * 78,
		text: "正在下载运行资源..."
	} : e.stage === "verifying" ? {
		percent: 82,
		text: "正在校验安装包..."
	} : e.stage === "extracting" ? {
		percent: 84 + t * 15,
		text: "正在安装本地资源..."
	} : {
		percent: 100,
		text: "安装完成"
	};
}
function x() {
	let e = o((e) => e.directorDeskRuntimeRequest);
	return e ? /* @__PURE__ */ (0, _.jsx)(S, { request: e }, e.instanceId) : null;
}
function S({ request: e }) {
	let t = o((e) => e.clearDirectorDeskRuntimeRequest), n = o((e) => e.config.theme), r = o((e) => e.showToast), c = u(), [l, g] = (0, h.useState)(c ? "checking" : "error"), [x, S] = (0, h.useState)(y), [C, w] = (0, h.useState)(0), [T, E] = (0, h.useState)("正在准备下载..."), [D, O] = (0, h.useState)(c ? null : "3D 导演台运行资源仅支持 Tauri 桌面端下载"), [k, A] = (0, h.useState)(!1), j = (0, h.useRef)(!1), M = (0, h.useRef)(!1);
	(0, h.useEffect)(() => {
		if (!c) return;
		let e = !0;
		return f().then((n) => {
			if (e) {
				if (S(n.version), n.installed) {
					t();
					return;
				}
				g("prompt");
			}
		}).catch((t) => {
			e && (O(t instanceof Error ? t.message : String(t)), g("error"));
		}), () => {
			e = !1;
		};
	}, [t, c]);
	let N = (0, h.useCallback)(async (r) => {
		if (M.current) return;
		M.current = !0, g("downloading"), O(null), w(r ? 78 : 0), E(r ? "正在读取本地安装包..." : "正在连接下载服务..."), A(!1), j.current = !1;
		let s;
		try {
			if (s = await p((e) => {
				let t = b(e);
				w(t.percent), E(t.text);
			}), j.current) {
				t();
				return;
			}
			let c = await d(r);
			if (j.current) {
				t();
				return;
			}
			S(c.version), w(100), t();
			let l = o.getState().nodes.find((t) => t.type === "ai-director" ? (typeof t.data.directorInstanceId == "string" ? t.data.directorInstanceId : t.id) === e.instanceId : !1), u = l ? i(l.data.directorRuntimeKind) : null;
			e.openAfterInstall && l && u?.supported && u.kind === "lightweight-web" && await a(l.data.directorRuntimeKind, {
				instanceId: e.instanceId,
				theme: n === "light" ? "light" : "dark"
			});
		} catch (e) {
			if (j.current) {
				t();
				return;
			}
			O(e instanceof Error ? e.message : String(e)), g("error");
		} finally {
			s?.(), M.current = !1, A(!1);
		}
	}, [
		t,
		e,
		n
	]), P = (0, h.useCallback)(async () => {
		try {
			let e = await s({
				multiple: !1,
				directory: !1,
				title: `选择 director-desk-v${x}.tar.gz`,
				filters: [{
					name: "3D 导演台安装包（.tar.gz）",
					extensions: ["gz"]
				}]
			});
			typeof e == "string" && await N(e);
		} catch (e) {
			O(e instanceof Error ? e.message : String(e)), g("error");
		}
	}, [N, x]), F = (0, h.useCallback)(() => {
		if (l !== "downloading") {
			t();
			return;
		}
		j.current = !0, A(!0), m().catch((e) => {
			j.current = !1, A(!1);
			let t = e instanceof Error ? e.message : String(e);
			O(t), g("error"), r(t, "error");
		});
	}, [
		t,
		l,
		r
	]);
	return l === "checking" ? null : /* @__PURE__ */ (0, _.jsx)(v, {
		phase: l,
		version: x,
		progress: C,
		stageText: T,
		error: D,
		cancelling: k,
		onConfirm: () => {
			N();
		},
		onSelectArchive: () => {
			P();
		},
		onCancel: F,
		onRetry: () => {
			N();
		}
	});
}
//#endregion
export { x as default };
