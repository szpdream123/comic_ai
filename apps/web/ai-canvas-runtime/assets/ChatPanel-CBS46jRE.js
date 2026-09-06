import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./jsx-runtime-BAkIPmuO.js";
import { a as r } from "./i18n-on3r1DCI.js";
import { A as i, Ar as a, Er as o, Gr as s, I as c, Ir as l, Kr as u, Lr as d, Qr as f, R as p, Wt as m, Xr as h, Yr as g, a as _, ct as v, kr as y, o as b, ot as x, q as S, qr as C, s as w, si as T, st as E, t as D, wr as O, z as k } from "./useAppStore-CcUL4Jo0.js";
import { a as A, i as j } from "./core-CoHQ9AE0.js";
import { a as ee, r as M, t as N } from "./ViewportImage-Dsz9jsTU.js";
import { At as P, Bt as te, C as F, Rt as I, S as ne, St as L, Tt as R, l as re, s as z, zt as ie } from "./useTooltipAutoPlacement-BSvTkR9V.js";
import { n as B } from "./rasterImageDimensions-CX1VK2cM.js";
import { a as V, c as ae, d as H, i as oe, l as se, n as ce, o as le, t as ue } from "./ChatMarkdown-DMpOf4pJ.js";
import { c as de, i as fe, n as pe, o as me, r as U, s as he, t as ge } from "./conversationExecutionController-DP-nWpFB.js";
import { t as W } from "./ModelSelector-BaXUXLCf.js";
import { i as _e, u as ve } from "./agentRoundExecutor-CaRfoBry.js";
//#region src/components/chat/ConversationList.tsx
var G = /* @__PURE__ */ e(t(), 1), K = n();
function ye({ onSelect: e, onNew: t, conversations: n, activeConversationId: i, agentTasks: a, onRenameConversation: o, onTogglePin: s, onArchiveConversation: c, onDeleteConversation: l }) {
	let u = r(), d = !!n, f = te(), p = D(ie((e) => ({
		conversations: e.conversations,
		activeConversationId: e.activeConversationId,
		currentProjectId: e.currentProjectId,
		updateConversation: e.updateConversation,
		removeConversation: e.removeConversation,
		agentTasks: e.agentTasks
	}))), m = n ?? p.conversations, h = i === void 0 ? p.activeConversationId : i, g = a ?? p.agentTasks, _ = /* @__PURE__ */ new Map();
	for (let e of g) {
		if (e.status === "completed" || e.status === "stopped") continue;
		let t = _.get(e.conversationId);
		(!t || t.updatedAt < e.updatedAt) && _.set(e.conversationId, e);
	}
	let [v, y] = (0, G.useState)(""), [b, x] = (0, G.useState)(null), [S, C] = (0, G.useState)(""), w = m.filter((e) => {
		if (e.archived || e.deletedAt) return !1;
		if (!v.trim()) return !0;
		let t = v.toLowerCase();
		return e.title.toLowerCase().includes(t) || (e.lastMessagePreview || "").toLowerCase().includes(t);
	}), T = (0, G.useCallback)((e) => {
		x(e.id), C(e.title);
	}, []), E = (0, G.useCallback)((e) => {
		let t = S.trim();
		t && t !== e.title && (d ? o?.(e.id, t) : p.updateConversation(e.id, {
			title: t,
			titleSource: "user"
		})), x(null);
	}, [
		S,
		d,
		o,
		p
	]), O = (0, G.useCallback)((e) => {
		d ? s?.(e.id) : p.updateConversation(e.id, { pinned: !e.pinned });
	}, [
		d,
		s,
		p
	]), k = (0, G.useCallback)((e) => {
		d ? c?.(e.id) : p.updateConversation(e.id, { archived: !0 });
	}, [
		d,
		c,
		p
	]), A = (0, G.useCallback)((e) => {
		d ? l?.(e.id) : (p.updateConversation(e.id, { deletedAt: Date.now() }), p.removeConversation(e.id));
	}, [
		d,
		l,
		p
	]), j = w.filter((e) => e.pinned), N = w.filter((e) => !e.pinned);
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "flex flex-col h-full",
		children: [
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "flex items-center justify-between px-3 py-3 border-b border-canvas-border",
				children: [/* @__PURE__ */ (0, K.jsx)("span", {
					className: "text-xs font-semibold text-canvas-text-muted",
					children: u("对话")
				}), /* @__PURE__ */ (0, K.jsx)(I, {
					scale: 1.05,
					className: "flex h-7 w-7 items-center justify-center rounded-lg text-canvas-text-secondary transition-colors\n                     hover:bg-canvas-hover hover:text-canvas-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
					onClick: t,
					"data-tooltip": u("新对话"),
					children: /* @__PURE__ */ (0, K.jsx)(B, {
						icon: "mdi:plus",
						width: "16",
						height: "16"
					})
				})]
			}),
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: "px-3 py-2",
				children: /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "relative",
					children: [/* @__PURE__ */ (0, K.jsx)(B, {
						icon: "mdi:magnify",
						width: "14",
						height: "14",
						className: "absolute left-2.5 top-1/2 -translate-y-1/2 text-canvas-text-muted"
					}), /* @__PURE__ */ (0, K.jsx)("input", {
						type: "text",
						value: v,
						onChange: (e) => y(e.target.value),
						"aria-label": u("搜索对话"),
						placeholder: u("搜索对话…"),
						className: "w-full h-8 pl-7 pr-3 text-xs bg-canvas-bg border border-canvas-border rounded-lg\n                       text-canvas-text placeholder:text-canvas-text-muted\n                       focus:outline-none focus:border-canvas-text-secondary transition-colors"
					})]
				})
			}),
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: "flex-1 overflow-y-auto px-2 py-1 space-y-0.5",
				children: /* @__PURE__ */ (0, K.jsxs)(ee, { children: [
					w.length === 0 && /* @__PURE__ */ (0, K.jsxs)(M.div, {
						initial: { opacity: 0 },
						animate: { opacity: 1 },
						transition: { duration: f ? .1 : .18 },
						className: "flex flex-col items-center justify-center py-8 text-xs text-canvas-text-muted",
						children: [/* @__PURE__ */ (0, K.jsx)(B, {
							icon: "mdi:chat-outline",
							width: "28",
							height: "28",
							className: "mb-2 opacity-40"
						}), u(v ? "没有匹配的对话" : "还没有对话")]
					}),
					j.length > 0 && /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsx)("div", {
						className: "px-2 py-1 text-[11px] font-medium text-canvas-text-muted",
						children: u("置顶")
					}), j.map((t) => /* @__PURE__ */ (0, K.jsx)(be, {
						conv: t,
						agentTaskStatus: _.get(t.id)?.status,
						reduceMotion: f,
						active: t.id === h,
						renaming: b === t.id,
						renameValue: S,
						onRenameValueChange: C,
						onRenameConfirm: () => E(t),
						onClick: () => e(t.id),
						onRename: () => T(t),
						onTogglePin: () => O(t),
						onArchive: () => k(t),
						onDelete: () => A(t)
					}, t.id))] }),
					N.length > 0 && /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [j.length > 0 && /* @__PURE__ */ (0, K.jsx)("div", {
						className: "px-2 py-1 text-[11px] font-medium text-canvas-text-muted",
						children: u("最近")
					}), N.map((t) => /* @__PURE__ */ (0, K.jsx)(be, {
						conv: t,
						agentTaskStatus: _.get(t.id)?.status,
						reduceMotion: f,
						active: t.id === h,
						renaming: b === t.id,
						renameValue: S,
						onRenameValueChange: C,
						onRenameConfirm: () => E(t),
						onClick: () => e(t.id),
						onRename: () => T(t),
						onTogglePin: () => O(t),
						onArchive: () => k(t),
						onDelete: () => A(t)
					}, t.id))] })
				] })
			})
		]
	});
}
function be({ conv: e, agentTaskStatus: t, reduceMotion: n, active: i, renaming: a, renameValue: o, onRenameValueChange: s, onRenameConfirm: c, onClick: l, onRename: u, onTogglePin: d, onArchive: f, onDelete: p }) {
	let m = r(), [h, g] = (0, G.useState)(!1);
	return /* @__PURE__ */ (0, K.jsxs)(M.div, {
		layout: !0,
		initial: n ? { opacity: 0 } : {
			opacity: 0,
			y: -4
		},
		animate: {
			opacity: 1,
			y: 0
		},
		exit: n ? { opacity: 0 } : {
			opacity: 0,
			y: -4
		},
		transition: n ? { duration: .1 } : {
			duration: .18,
			ease: [
				.16,
				1,
				.3,
				1
			]
		},
		className: `group relative flex items-center gap-2 px-2.5 py-2 rounded-lg
                  transition-colors text-[13px]
                  ${i ? "bg-brand-alpha-12 text-canvas-text" : "text-canvas-text-secondary hover:bg-canvas-hover hover:text-canvas-text"}`,
		children: [a ? /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsx)("div", {
			className: "flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center bg-canvas-hover",
			children: /* @__PURE__ */ (0, K.jsx)(B, {
				icon: i ? "mdi:chat-processing" : "mdi:chat-outline",
				width: "15",
				height: "15",
				className: i ? "text-indigo-400" : "text-canvas-text-muted"
			})
		}), /* @__PURE__ */ (0, K.jsx)("input", {
			type: "text",
			value: o,
			onChange: (e) => s(e.target.value),
			onBlur: c,
			onKeyDown: (e) => {
				e.key === "Enter" && c(), e.key === "Escape" && c();
			},
			autoFocus: !0,
			className: "h-8 w-full rounded border border-canvas-border bg-canvas-bg px-2 text-[13px]\n                       text-canvas-text focus:outline-none focus:border-indigo-500"
		})] }) : /* @__PURE__ */ (0, K.jsxs)("button", {
			type: "button",
			onClick: l,
			"aria-pressed": i,
			className: "flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
			children: [/* @__PURE__ */ (0, K.jsx)("div", {
				className: "flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center bg-canvas-hover",
				children: /* @__PURE__ */ (0, K.jsx)(B, {
					icon: i ? "mdi:chat-processing" : "mdi:chat-outline",
					width: "15",
					height: "15",
					className: i ? "text-indigo-400" : "text-canvas-text-muted"
				})
			}), /* @__PURE__ */ (0, K.jsxs)("div", {
				className: "min-w-0 flex-1",
				children: [/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "flex items-center gap-1.5",
					children: [/* @__PURE__ */ (0, K.jsx)("div", {
						className: "min-w-0 flex-1 truncate leading-tight",
						children: e.title
					}), t && /* @__PURE__ */ (0, K.jsx)(q, { status: t })]
				}), e.lastMessagePreview && /* @__PURE__ */ (0, K.jsx)("div", {
					className: "truncate text-[11px] text-canvas-text-muted mt-0.5",
					children: e.lastMessagePreview
				})]
			})]
		}), /* @__PURE__ */ (0, K.jsxs)("div", {
			className: "relative",
			children: [/* @__PURE__ */ (0, K.jsx)("button", {
				type: "button",
				className: `flex items-center justify-center w-7 h-7 rounded-md transition-colors
                      ${h ? "opacity-100 bg-canvas-hover" : "opacity-0 group-hover:opacity-100 group-focus-within:opacity-100 focus:opacity-100"}
                      text-canvas-text-muted hover:text-canvas-text hover:bg-canvas-hover`,
				"aria-label": m("打开“{title}”的操作菜单", { title: e.title }),
				"aria-haspopup": "menu",
				"aria-expanded": h,
				onClick: (e) => {
					e.stopPropagation(), g(!h);
				},
				children: /* @__PURE__ */ (0, K.jsx)(B, {
					icon: "mdi:dots-vertical",
					width: "14",
					height: "14"
				})
			}), /* @__PURE__ */ (0, K.jsx)(ee, { children: h && /* @__PURE__ */ (0, K.jsxs)(M.div, {
				initial: n ? { opacity: 0 } : {
					opacity: 0,
					scale: .95
				},
				animate: {
					opacity: 1,
					scale: 1
				},
				exit: n ? { opacity: 0 } : {
					opacity: 0,
					scale: .95
				},
				transition: { duration: n ? .1 : .12 },
				className: "absolute right-0 top-full mt-1 w-36 bg-canvas-card border border-canvas-border\n                         rounded-lg shadow-xl z-50 overflow-hidden",
				role: "menu",
				onClick: (e) => e.stopPropagation(),
				children: [
					/* @__PURE__ */ (0, K.jsx)(J, {
						icon: "mdi:pencil-outline",
						label: m("重命名"),
						onClick: () => {
							u(), g(!1);
						}
					}),
					/* @__PURE__ */ (0, K.jsx)(J, {
						icon: e.pinned ? "mdi:pin-off" : "mdi:pin-outline",
						label: e.pinned ? m("取消置顶") : m("置顶"),
						onClick: () => {
							d(), g(!1);
						}
					}),
					/* @__PURE__ */ (0, K.jsx)(J, {
						icon: "mdi:archive-outline",
						label: m("归档"),
						onClick: () => {
							f(), g(!1);
						}
					}),
					/* @__PURE__ */ (0, K.jsx)("div", { className: "border-t border-canvas-border" }),
					/* @__PURE__ */ (0, K.jsx)(J, {
						icon: "mdi:delete-outline",
						label: m("移入回收站"),
						danger: !0,
						onClick: () => {
							p(), g(!1);
						}
					})
				]
			}) })]
		})]
	});
}
function q({ status: e }) {
	let t = r(), n = {
		queued: {
			label: t("排队"),
			className: "text-slate-400"
		},
		planning: {
			label: t("规划"),
			className: "text-violet-400"
		},
		running: {
			label: t("运行"),
			className: "text-emerald-400"
		},
		waiting_tool: {
			label: t("工具"),
			className: "text-sky-400"
		},
		waiting_approval: {
			label: t("待确认"),
			className: "text-amber-400"
		},
		paused: {
			label: t("暂停"),
			className: "text-slate-400"
		},
		failed: {
			label: t("失败"),
			className: "text-red-400"
		}
	}[e];
	return n ? /* @__PURE__ */ (0, K.jsx)("span", {
		className: `shrink-0 text-[11px] font-medium ${n.className}`,
		children: n.label
	}) : null;
}
function J({ icon: e, label: t, danger: n, onClick: r }) {
	return /* @__PURE__ */ (0, K.jsxs)("button", {
		type: "button",
		role: "menuitem",
		className: `flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors
                  ${n ? "text-red-400 hover:bg-red-500/10" : "text-canvas-text-secondary hover:bg-canvas-hover hover:text-canvas-text"}`,
		onClick: r,
		children: [/* @__PURE__ */ (0, K.jsx)(B, {
			icon: e,
			width: "14",
			height: "14"
		}), t]
	});
}
//#endregion
//#region src/components/chat/MascotAvatar.tsx
function xe({ size: e = 28, className: t = "" }) {
	let n = `mascot-avatar-${(0, G.useId)().replace(/:/g, "")}`;
	return /* @__PURE__ */ (0, K.jsxs)("svg", {
		width: e,
		height: e,
		viewBox: "0 0 32 32",
		className: t,
		"aria-hidden": "true",
		children: [
			/* @__PURE__ */ (0, K.jsx)("defs", { children: /* @__PURE__ */ (0, K.jsxs)("radialGradient", {
				id: n,
				cx: "32%",
				cy: "24%",
				r: "78%",
				children: [
					/* @__PURE__ */ (0, K.jsx)("stop", {
						offset: "0%",
						stopColor: "var(--theme-text)",
						stopOpacity: "0.98"
					}),
					/* @__PURE__ */ (0, K.jsx)("stop", {
						offset: "56%",
						stopColor: "var(--theme-text-secondary)",
						stopOpacity: "0.9"
					}),
					/* @__PURE__ */ (0, K.jsx)("stop", {
						offset: "100%",
						stopColor: "var(--theme-bg)",
						stopOpacity: "0.95"
					})
				]
			}) }),
			/* @__PURE__ */ (0, K.jsx)("circle", {
				cx: "16",
				cy: "16",
				r: "14.5",
				fill: `url(#${n})`,
				stroke: "var(--theme-border)",
				strokeWidth: "0.75"
			}),
			/* @__PURE__ */ (0, K.jsx)("rect", {
				x: "10.25",
				y: "12.5",
				width: "2.8",
				height: "6.4",
				rx: "1.4",
				fill: "var(--theme-bg)"
			}),
			/* @__PURE__ */ (0, K.jsx)("rect", {
				x: "18.95",
				y: "12.5",
				width: "2.8",
				height: "6.4",
				rx: "1.4",
				fill: "var(--theme-bg)"
			})
		]
	});
}
//#endregion
//#region src/components/chat/AgentModeSelector.tsx
var Se = [
	{
		value: "plan",
		label: "规划",
		tooltip: "Plan 模式：仅分析与规划，只能使用只读工具"
	},
	{
		value: "collaborative",
		label: "协作",
		tooltip: "B 协作模式：画布写操作先预览确认"
	},
	{
		value: "autonomous",
		label: "自主",
		tooltip: "C 自主模式：画布操作自动执行，付费媒体和文件写入仍需确认"
	}
];
function Ce({ mode: e, onChange: t, disabled: n = !1 }) {
	let i = r();
	return /* @__PURE__ */ (0, K.jsx)("div", {
		className: "pointer-events-auto flex items-center rounded-md border border-canvas-border bg-canvas-bg/60 p-px",
		role: "group",
		"aria-label": i("Agent 模式"),
		children: Se.map((r) => /* @__PURE__ */ (0, K.jsx)("button", {
			type: "button",
			className: `flex h-6 min-w-9 items-center justify-center rounded px-1.5 text-[10px] font-medium transition-colors
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50
                      ${e === r.value ? r.value === "autonomous" ? "bg-amber-400/15 text-amber-300" : r.value === "plan" ? "bg-emerald-400/15 text-emerald-300" : "bg-indigo-500/20 text-indigo-300" : "text-canvas-text-muted hover:bg-canvas-hover hover:text-canvas-text"} disabled:cursor-not-allowed disabled:opacity-40`,
			"aria-pressed": e === r.value,
			"aria-label": i(r.tooltip),
			"data-tooltip": i(r.tooltip),
			disabled: n,
			onClick: () => t(r.value),
			children: i(r.label)
		}, r.value))
	});
}
//#endregion
//#region src/components/chat/ChatHeader.tsx
function Y({ detached: e, chatPanelDetached: t, projectName: n, showBackButton: i, onBack: a, onDetachToggle: o, onClose: s, agentMode: c, onAgentModeChange: l, agentModeDisabled: u, onOpenMemory: d, onOpenSubAgents: f, onOpenAgents: p, onOpenTasks: m, activeTaskCount: h = 0, detachedHeaderActions: g }) {
	let _ = r();
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		"data-tauri-drag-region": e ? !0 : void 0,
		className: "chat-panel-header flex items-center justify-between gap-2 px-3.5 py-2.5\n                 flex-shrink-0 select-none",
		children: [
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "chat-panel-header-brand flex items-center gap-1.5 min-w-0",
				children: [
					i && /* @__PURE__ */ (0, K.jsx)("button", {
						type: "button",
						className: "chat-panel-back-btn flex items-center justify-center w-8 h-8 -ml-1 rounded-lg\n                       text-canvas-text-muted hover:text-canvas-text hover:bg-canvas-hover\n                       active:scale-95 transition-[color,background-color,box-shadow,transform] duration-150\n                       motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
						onClick: a,
						"aria-label": _("返回会话列表"),
						children: /* @__PURE__ */ (0, K.jsx)(B, {
							icon: "mdi:arrow-left",
							width: "18",
							height: "18"
						})
					}),
					/* @__PURE__ */ (0, K.jsx)(xe, {
						size: 26,
						className: "shrink-0"
					}),
					/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "flex items-center gap-1.5 min-w-0",
						children: [/* @__PURE__ */ (0, K.jsx)("span", {
							className: "chat-panel-title text-sm font-semibold text-canvas-text truncate",
							children: _("AI 助手")
						}), e && n && /* @__PURE__ */ (0, K.jsxs)("span", {
							className: "text-[11px] text-canvas-text-muted truncate max-w-[120px]",
							children: ["· ", n]
						})]
					})
				]
			}),
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "chat-panel-header-actions ml-auto flex items-center gap-1",
				children: [
					/* @__PURE__ */ (0, K.jsx)(Ce, {
						mode: c,
						onChange: l,
						disabled: u
					}),
					/* @__PURE__ */ (0, K.jsx)("span", {
						className: "mx-0.5 h-4 w-px bg-canvas-border",
						"aria-hidden": "true"
					}),
					p && /* @__PURE__ */ (0, K.jsx)("button", {
						type: "button",
						className: "chat-panel-agents-btn flex h-8 w-8 items-center justify-center rounded-lg text-canvas-text-muted\n                       transition-[color,background-color,box-shadow,transform] duration-150 hover:bg-canvas-hover hover:text-canvas-text\n                       active:scale-95 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
						onClick: p,
						"data-tooltip": _("智能体中心"),
						"aria-label": _("智能体中心"),
						children: /* @__PURE__ */ (0, K.jsx)(B, {
							icon: "lucide:bot",
							width: "16",
							height: "16"
						})
					}),
					m && /* @__PURE__ */ (0, K.jsxs)("button", {
						type: "button",
						className: "relative flex h-8 w-8 items-center justify-center rounded-lg text-canvas-text-muted\n                       transition-[color,background-color,box-shadow,transform] duration-150 hover:bg-canvas-hover hover:text-canvas-text\n                       active:scale-95 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
						onClick: m,
						"data-tooltip": _("任务中心"),
						"aria-label": h > 0 ? _("任务中心，{count} 个进行中", { count: h }) : _("任务中心"),
						children: [/* @__PURE__ */ (0, K.jsx)(B, {
							icon: "mdi:progress-wrench",
							width: "16",
							height: "16"
						}), h > 0 && /* @__PURE__ */ (0, K.jsx)("span", {
							className: "absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400",
							"aria-hidden": "true"
						})]
					}),
					d && /* @__PURE__ */ (0, K.jsx)("button", {
						type: "button",
						className: "chat-panel-memory-btn flex items-center justify-center w-8 h-8 rounded-lg\n                       text-canvas-text-muted hover:text-canvas-text hover:bg-canvas-hover\n                       active:scale-95 transition-[color,background-color,box-shadow,transform] duration-150\n                       motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
						onClick: d,
						"data-tooltip": _("项目记忆"),
						"aria-label": _("项目记忆"),
						children: /* @__PURE__ */ (0, K.jsx)(B, {
							icon: "mdi:brain",
							width: "16",
							height: "16"
						})
					}),
					f && /* @__PURE__ */ (0, K.jsx)("button", {
						type: "button",
						className: "chat-panel-sub-agents-btn flex items-center justify-center w-8 h-8 rounded-lg\n                       text-canvas-text-muted hover:text-canvas-text hover:bg-canvas-hover\n                       active:scale-95 transition-[color,background-color,box-shadow,transform] duration-150\n                       motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
						onClick: f,
						"data-tooltip": _("子智能体"),
						"aria-label": _("子智能体"),
						children: /* @__PURE__ */ (0, K.jsx)(B, {
							icon: "lucide:users-round",
							width: "16",
							height: "16"
						})
					})
				]
			}),
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: "chat-panel-header-window-actions flex shrink-0 items-center gap-1",
				children: e ? g : /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsx)("button", {
					type: "button",
					className: "chat-panel-detach-btn flex items-center justify-center w-8 h-8 rounded-lg\n                         text-canvas-text-muted hover:text-canvas-text hover:bg-canvas-hover\n                         active:scale-95 transition-[color,background-color,box-shadow,transform] duration-150\n                         motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
					onClick: o,
					"data-tooltip": _(t ? "收回内嵌" : "独立窗口"),
					"aria-label": _(t ? "收回内嵌" : "独立窗口"),
					children: /* @__PURE__ */ (0, K.jsx)(B, {
						icon: t ? "mdi:dock-left" : "mdi:dock-window",
						width: "16",
						height: "16"
					})
				}), /* @__PURE__ */ (0, K.jsx)(R, { onClick: s })] })
			})
		]
	});
}
//#endregion
//#region src/services/chat/agentErrorCodes.ts
var we = {
	AGENT_STOPPED: {
		title: "已停止",
		hint: "任务已停止。如需重试请点击继续或重新发送消息。"
	},
	AGENT_RUNTIME_ERROR: {
		title: "运行出错",
		hint: "任务执行时出错，可点击继续重试。"
	},
	AGENT_EXECUTION_FAILED: {
		title: "执行失败",
		hint: "任务未完成，可点击继续重试。"
	},
	AGENT_TOOL_EXCEPTION: {
		title: "工具异常",
		hint: "某个工具调用失败，可点击继续让助手重新规划。"
	},
	CONTEXT_BUDGET_EXHAUSTED: {
		title: "上下文接近上限",
		hint: "任务上下文过大，建议切换到更大上下文窗口的模型后继续。"
	},
	CONTEXT_COMPRESSION_FAILED: {
		title: "上下文压缩失败",
		hint: "请检查助手模型是否可用，然后点击继续。"
	},
	CONTEXT_INPUT_TOO_LARGE: {
		title: "输入过大",
		hint: "请精简当前消息，或更换上下文更大的模型。"
	},
	AGENT_LIFETIME_BUDGET_EXHAUSTED: {
		title: "已达任务总预算",
		hint: "该任务累计消耗（轮次 / 工具调用 / token / 继续次数）已达上限，请基于当前结果新建任务继续。"
	},
	AGENT_RESUME_TASK_NOT_FOUND: {
		title: "任务不存在",
		hint: "该任务已不存在，无法继续。"
	},
	AGENT_RESUME_NOT_RESUMABLE: {
		title: "状态不可继续",
		hint: "任务当前状态不支持继续。"
	},
	AGENT_RESUME_PROJECT_NOT_ACTIVE: {
		title: "项目未加载",
		hint: "请先切回该任务所属的项目，再点击继续。"
	},
	AGENT_RESUME_CONVERSATION_GONE: {
		title: "会话已删除",
		hint: "来源对话不存在或已删除，无法继续该任务。"
	},
	AGENT_RESUME_NO_MESSAGE: {
		title: "消息缺失",
		hint: "找不到对应的助手消息，请重新发送消息。"
	},
	AGENT_RESUME_ALREADY_SCHEDULED: {
		title: "已在队列中",
		hint: "该任务已排在执行队列里，等当前任务结束后会自动继续。"
	}
};
function Te(e) {
	return e ? we[e] : void 0;
}
//#endregion
//#region src/components/chat/AgentToolDetails.tsx
var Ee = {
	user: "用户指定",
	project_default: "项目默认",
	model_default: "模型默认",
	resolved: "有效值"
};
function De(e, t) {
	return e === void 0 || e === "" ? t("未设置") : typeof e == "boolean" ? t(e ? "是" : "否") : String(e);
}
function Oe(e) {
	return !!e && !!(e.fields?.length || e.references?.length || e.entities?.length || e.changes?.length || e.note);
}
function ke({ input: e, result: t, defaultExpanded: n = !1 }) {
	let i = r(), [a, o] = (0, G.useState)(n), s = D((e) => e.nodes), c = s.length > 0 ? s : D.getState().nodes;
	if (!Oe(e) && !Oe(t)) return null;
	let l = [...e?.references ?? [], ...t?.references ?? []], u = [...e?.entities ?? [], ...t?.entities ?? []], d = [...e?.changes ?? [], ...t?.changes ?? []];
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "mt-1.5 rounded-md border border-canvas-border bg-canvas-card/80",
		children: [/* @__PURE__ */ (0, K.jsxs)("button", {
			type: "button",
			"aria-expanded": a,
			onClick: () => o((e) => !e),
			className: "flex min-h-7 w-full items-center gap-1.5 rounded-md px-2 text-left text-[11px] text-canvas-text-muted transition-colors hover:bg-canvas-hover hover:text-canvas-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40",
			children: [
				/* @__PURE__ */ (0, K.jsx)(B, {
					icon: "mdi:tune-variant",
					width: "13"
				}),
				/* @__PURE__ */ (0, K.jsx)("span", { children: i("调用详情") }),
				/* @__PURE__ */ (0, K.jsx)(B, {
					icon: a ? "mdi:chevron-up" : "mdi:chevron-down",
					width: "14",
					className: "ml-auto"
				})
			]
		}), a && /* @__PURE__ */ (0, K.jsxs)("div", {
			className: "space-y-2 border-t border-canvas-border px-2 py-2 text-[11px] leading-[17px]",
			children: [
				e?.fields?.length ? /* @__PURE__ */ (0, K.jsxs)("div", { children: [/* @__PURE__ */ (0, K.jsx)("p", {
					className: "mb-1 font-medium text-canvas-text-secondary",
					children: i("参数")
				}), /* @__PURE__ */ (0, K.jsx)("dl", {
					className: "space-y-0.5",
					children: e.fields.map((e, t) => /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "grid grid-cols-[72px_minmax(0,1fr)] gap-2",
						children: [/* @__PURE__ */ (0, K.jsx)("dt", {
							className: "text-canvas-text-muted",
							children: e.label
						}), /* @__PURE__ */ (0, K.jsxs)("dd", {
							className: "min-w-0 break-words text-canvas-text-secondary",
							children: [De(e.value, i), e.source && /* @__PURE__ */ (0, K.jsx)("span", {
								className: "ml-1.5 text-[10px] text-canvas-text-muted",
								children: i(Ee[e.source])
							})]
						})]
					}, `${e.label}-${t}`))
				})] }) : null,
				l.length > 0 && /* @__PURE__ */ (0, K.jsxs)("div", { children: [/* @__PURE__ */ (0, K.jsx)("p", {
					className: "mb-1 font-medium text-canvas-text-secondary",
					children: i("参考素材")
				}), /* @__PURE__ */ (0, K.jsx)("div", {
					className: "grid grid-cols-2 gap-1.5",
					children: l.map((e, t) => {
						let n = e.kind === "node" ? c.find((t) => t.id === e.id) : void 0, r = n && e.mediaKind === "image" ? n.data.imageUrl || n.data.thumbnailUrl : n?.data.thumbnailUrl;
						return /* @__PURE__ */ (0, K.jsxs)("div", {
							className: "flex min-w-0 items-center gap-1.5 rounded border border-canvas-border bg-canvas-surface/60 p-1.5",
							children: [r ? /* @__PURE__ */ (0, K.jsx)("img", {
								src: r,
								alt: "",
								className: "h-9 w-9 shrink-0 rounded object-cover"
							}) : /* @__PURE__ */ (0, K.jsx)("span", {
								className: "flex h-9 w-9 shrink-0 items-center justify-center rounded bg-canvas-hover text-canvas-text-muted",
								children: /* @__PURE__ */ (0, K.jsx)(B, {
									icon: e.mediaKind === "video" ? "mdi:video-outline" : e.mediaKind === "audio" ? "mdi:music-note-outline" : "mdi:image-outline",
									width: "16"
								})
							}), /* @__PURE__ */ (0, K.jsxs)("span", {
								className: "min-w-0",
								children: [/* @__PURE__ */ (0, K.jsx)("span", {
									className: "block truncate text-canvas-text-secondary",
									children: e.label
								}), /* @__PURE__ */ (0, K.jsx)("span", {
									className: "block truncate text-[10px] text-canvas-text-muted",
									children: e.kind === "node" ? n ? e.id : i("素材已不可用") : i("用户上传素材")
								})]
							})]
						}, `${e.kind}-${e.id}-${t}`);
					})
				})] }),
				u.length > 0 && /* @__PURE__ */ (0, K.jsxs)("div", { children: [/* @__PURE__ */ (0, K.jsx)("p", {
					className: "mb-1 font-medium text-canvas-text-secondary",
					children: i("对象")
				}), /* @__PURE__ */ (0, K.jsx)("div", {
					className: "space-y-1",
					children: u.map((e, t) => /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "rounded border border-canvas-border bg-canvas-surface/60 px-2 py-1.5",
						children: [
							/* @__PURE__ */ (0, K.jsx)("p", {
								className: "break-words text-canvas-text-secondary",
								children: e.title
							}),
							e.subtitle && /* @__PURE__ */ (0, K.jsx)("p", {
								className: "text-canvas-text-muted",
								children: e.subtitle
							}),
							e.fields?.map((e, t) => /* @__PURE__ */ (0, K.jsxs)("p", {
								className: "text-canvas-text-muted",
								children: [
									e.label,
									"：",
									/* @__PURE__ */ (0, K.jsx)("span", {
										className: "text-canvas-text-secondary",
										children: De(e.value, i)
									})
								]
							}, `${e.label}-${t}`)),
							e.preview && /* @__PURE__ */ (0, K.jsx)("p", {
								className: "mt-1 break-words border-t border-canvas-border pt-1 text-canvas-text-muted",
								children: e.preview
							})
						]
					}, `${e.id ?? e.title}-${t}`))
				})] }),
				d.length > 0 && /* @__PURE__ */ (0, K.jsxs)("div", { children: [/* @__PURE__ */ (0, K.jsx)("p", {
					className: "mb-1 font-medium text-canvas-text-secondary",
					children: i("变更")
				}), /* @__PURE__ */ (0, K.jsx)("div", {
					className: "space-y-1",
					children: d.map((e, t) => /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "rounded border border-canvas-border bg-canvas-surface/60 px-2 py-1.5",
						children: [/* @__PURE__ */ (0, K.jsxs)("p", {
							className: "truncate text-canvas-text-secondary",
							children: [
								e.targetLabel || e.targetId,
								" · ",
								e.field
							]
						}), /* @__PURE__ */ (0, K.jsxs)("p", {
							className: "break-words text-canvas-text-muted",
							children: [
								De(e.before, i),
								/* @__PURE__ */ (0, K.jsx)(B, {
									icon: "mdi:arrow-right",
									width: "12",
									className: "mx-1 inline"
								}),
								/* @__PURE__ */ (0, K.jsx)("span", {
									className: "text-canvas-text-secondary",
									children: De(e.after, i)
								})
							]
						})]
					}, `${e.targetId}-${e.field}-${t}`))
				})] }),
				t?.fields?.length ? /* @__PURE__ */ (0, K.jsxs)("div", { children: [/* @__PURE__ */ (0, K.jsx)("p", {
					className: "mb-1 font-medium text-canvas-text-secondary",
					children: i("结果")
				}), /* @__PURE__ */ (0, K.jsx)("dl", {
					className: "space-y-0.5",
					children: t.fields.map((e, t) => /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "grid grid-cols-[72px_minmax(0,1fr)] gap-2",
						children: [/* @__PURE__ */ (0, K.jsx)("dt", {
							className: "text-canvas-text-muted",
							children: e.label
						}), /* @__PURE__ */ (0, K.jsx)("dd", {
							className: "break-words text-canvas-text-secondary",
							children: De(e.value, i)
						})]
					}, `${e.label}-${t}`))
				})] }) : null,
				(e?.note || t?.note) && /* @__PURE__ */ (0, K.jsx)("p", {
					className: "break-words text-canvas-text-muted",
					children: t?.note || e?.note
				})
			]
		})]
	});
}
//#endregion
//#region src/components/chat/AgentStepCard.tsx
var Ae = {
	pending: {
		icon: "mdi:clock-outline",
		label: "等待",
		className: "text-canvas-text-muted",
		iconBg: "bg-canvas-hover/60"
	},
	running: {
		icon: "mdi:loading",
		label: "执行中",
		className: "text-indigo-400",
		iconBg: "bg-indigo-500/10",
		spin: !0
	},
	waiting_approval: {
		icon: "mdi:shield-alert-outline",
		label: "待确认",
		className: "text-amber-400",
		iconBg: "bg-amber-500/10"
	},
	succeeded: {
		icon: "mdi:check",
		label: "完成",
		className: "text-emerald-400",
		iconBg: "bg-emerald-500/10"
	},
	failed: {
		icon: "mdi:alert-outline",
		label: "失败",
		className: "text-red-400",
		iconBg: "bg-red-500/10"
	},
	skipped: {
		icon: "mdi:debug-step-over",
		label: "跳过",
		className: "text-canvas-text-muted",
		iconBg: "bg-canvas-hover/60"
	},
	stopped: {
		icon: "mdi:stop",
		label: "停止",
		className: "text-canvas-text-muted",
		iconBg: "bg-canvas-hover/60"
	}
};
function je(e) {
	let t = e.toolCall?.startedAt ?? e.createdAt, n = e.toolCall?.finishedAt;
	if (!n || n < t) return null;
	let r = n - t;
	return r < 1e3 ? `${r}ms` : `${(r / 1e3).toFixed(1)}s`;
}
function Me({ step: e }) {
	let t = r(), n = Ae[e.status], i = je(e), a = e.toolCall?.retryCount ?? 0, o = e.errorMessage || e.outputSummary || e.toolCall?.resultSummary;
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "agent-step-card flex gap-2 rounded-md px-0.5 py-1.5 transition-colors hover:bg-canvas-hover/25",
		children: [/* @__PURE__ */ (0, K.jsx)("span", {
			className: `mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${n.iconBg}`,
			children: /* @__PURE__ */ (0, K.jsx)(B, {
				icon: n.icon,
				width: "12",
				className: `${n.className} ${n.spin ? "animate-spin motion-reduce:animate-none" : ""}`
			})
		}), /* @__PURE__ */ (0, K.jsxs)("div", {
			className: "min-w-0 flex-1",
			children: [
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "flex min-h-5 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-[17px]",
					children: [
						/* @__PURE__ */ (0, K.jsx)("span", {
							className: "truncate text-[12px] text-canvas-text-secondary",
							children: e.title
						}),
						/* @__PURE__ */ (0, K.jsx)("span", {
							className: `shrink-0 text-[10px] ${n.className}`,
							children: t(n.label)
						}),
						a > 0 && /* @__PURE__ */ (0, K.jsxs)("span", {
							className: "shrink-0 text-[10px] text-canvas-text-muted",
							children: ["· ", t("重试 {count}", { count: a })]
						}),
						i && /* @__PURE__ */ (0, K.jsx)("span", {
							className: "ml-auto shrink-0 text-[10px] tabular-nums text-canvas-text-muted",
							children: i
						})
					]
				}),
				e.toolCall?.inputSummary && /* @__PURE__ */ (0, K.jsx)("p", {
					className: "break-words text-[11px] leading-[17px] text-canvas-text-muted",
					children: e.toolCall.inputSummary
				}),
				o && o !== e.toolCall?.inputSummary && /* @__PURE__ */ (0, K.jsx)("p", {
					className: `break-words text-[11px] leading-[17px] ${e.status === "failed" ? "text-red-400/85" : "text-canvas-text-secondary"}`,
					children: o
				}),
				/* @__PURE__ */ (0, K.jsx)(ke, {
					input: e.toolCall?.inputDisplay,
					result: e.toolCall?.resultDisplay
				})
			]
		})]
	});
}
//#endregion
//#region src/components/chat/AgentApprovalCard.tsx
var Ne = {
	user_choice: {
		label: "需要你选择",
		icon: "mdi:format-list-checks"
	},
	canvas_write: {
		label: "画布修改",
		icon: "mdi:vector-square-edit"
	},
	file_write: {
		label: "写入文件",
		icon: "mdi:content-save-outline"
	},
	permanent_delete: {
		label: "永久删除",
		icon: "mdi:delete-alert-outline"
	},
	media_generation: {
		label: "生成媒体",
		icon: "mdi:image-plus-outline"
	},
	memory_write: {
		label: "保存记忆",
		icon: "mdi:brain"
	},
	config_write: {
		label: "API 配置",
		icon: "mdi:api"
	},
	asset_write: {
		label: "资产库写入",
		icon: "mdi:account-box-multiple-outline"
	}
}, Pe = {
	text: "文本",
	image: "图片",
	video: "视频",
	audio: "音频"
}, X = {
	image: "生图",
	video: "视频",
	audio: "音频"
};
function Z({ step: e, mediaModelOptions: t, mediaModelAvailability: n, onResolve: i }) {
	let a = r(), o = e.approval, s = o?.inputRequest, c = s?.kind === "media_model" ? s : void 0, l = s?.kind === "provider_models" ? s : void 0, [u, d] = (0, G.useState)(c?.selectedModelRef), [f, p] = (0, G.useState)([]), m = (0, G.useMemo)(() => {
		let e = /* @__PURE__ */ new Map();
		for (let t of l?.options ?? []) {
			let n = e.get(t.category) ?? [];
			n.push(t), e.set(t.category, n);
		}
		return [
			"text",
			"image",
			"video",
			"audio"
		].flatMap((t) => e.has(t) ? [[t, e.get(t)]] : []);
	}, [l]), h = (e) => {
		p((t) => t.includes(e) ? t.filter((t) => t !== e) : [...t, e]);
	}, g = (e) => {
		p((t) => e.every((e) => t.includes(e)) ? t.filter((t) => !e.includes(t)) : [...new Set([...t, ...e])]);
	}, _ = (0, G.useMemo)(() => {
		if (!c) return [];
		let e = /* @__PURE__ */ new Map();
		for (let n of t) {
			if (n.mediaKind !== c.mediaKind) continue;
			let t = e.get(n.groupName) ?? [];
			t.push(n), e.set(n.groupName, t);
		}
		return [...e.entries()];
	}, [c, t]);
	if (!o) return null;
	let v = Ne[o.kind], y = !!c, b = !!l, x = _.some(([, e]) => e.some((e) => n[e.value])), S = !!u && !!n[u];
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "mt-2 border-l-2 border-amber-400/60 bg-amber-400/5 px-3 py-2.5",
		role: "group",
		"aria-label": a("{label}待确认", { label: a(v.label) }),
		children: [
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "flex items-start gap-2",
				children: [/* @__PURE__ */ (0, K.jsx)(B, {
					icon: v.icon,
					width: "16",
					className: "mt-0.5 shrink-0 text-amber-400"
				}), /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "min-w-0 flex-1",
					children: [
						/* @__PURE__ */ (0, K.jsxs)("p", {
							className: "text-xs font-medium text-amber-300",
							children: [
								a("待确认"),
								" · ",
								a(v.label)
							]
						}),
						/* @__PURE__ */ (0, K.jsx)("p", {
							className: "mt-1 break-words text-xs leading-[18px] text-canvas-text-secondary",
							children: e.toolCall?.inputSummary || o.summary
						}),
						/* @__PURE__ */ (0, K.jsx)(ke, {
							input: e.toolCall?.inputDisplay,
							defaultExpanded: !0
						})
					]
				})]
			}),
			o.kind === "config_write" && /* @__PURE__ */ (0, K.jsxs)("div", {
				className: "mt-2 flex items-start gap-1.5 border-t border-amber-300/15 pt-2 text-xs leading-[18px] text-canvas-text-secondary",
				children: [/* @__PURE__ */ (0, K.jsx)(B, {
					icon: "mdi:shield-key-outline",
					width: "14",
					className: "mt-0.5 shrink-0 text-amber-400"
				}), /* @__PURE__ */ (0, K.jsx)("span", { children: a("不会写入 API Key；新连接保持空白，已有连接保留原值。") })]
			}),
			c && /* @__PURE__ */ (0, K.jsxs)("div", {
				className: "mt-3 border-t border-amber-300/15 pt-2.5",
				children: [/* @__PURE__ */ (0, K.jsx)("p", {
					className: "mb-2 text-[11px] font-medium text-canvas-text",
					children: a("选择{kind}模型", { kind: a(X[c.mediaKind]) })
				}), x ? /* @__PURE__ */ (0, K.jsx)("div", {
					className: "max-h-40 space-y-2 overflow-y-auto pr-1",
					children: _.map(([e, t]) => /* @__PURE__ */ (0, K.jsxs)("div", { children: [/* @__PURE__ */ (0, K.jsx)("p", {
						className: "mb-1 text-[10px] text-canvas-text-muted",
						children: e
					}), /* @__PURE__ */ (0, K.jsx)("div", {
						className: "flex flex-wrap gap-1.5",
						children: t.map((e) => {
							let t = !!n[e.value], r = u === e.value;
							return /* @__PURE__ */ (0, K.jsxs)("button", {
								type: "button",
								disabled: !t,
								"aria-pressed": r,
								title: t ? e.description : a("模型未配置或当前不可用"),
								onClick: () => d(e.value),
								className: `flex min-h-7 max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-left text-[11px] leading-4 transition-colors active:scale-[0.98] motion-reduce:transform-none ${r ? "border-amber-300/70 bg-amber-300/15 text-amber-200" : t ? "border-canvas-border text-canvas-text-secondary hover:border-amber-300/40 hover:text-canvas-text" : "cursor-not-allowed border-canvas-border/50 text-canvas-text-muted opacity-45"}`,
								children: [r && /* @__PURE__ */ (0, K.jsx)(B, {
									icon: "mdi:check",
									width: "13",
									className: "shrink-0"
								}), /* @__PURE__ */ (0, K.jsx)("span", {
									className: "break-words",
									children: e.label
								})]
							}, e.value);
						})
					})] }, e))
				}) : /* @__PURE__ */ (0, K.jsx)("p", {
					className: "text-[11px] leading-[17px] text-canvas-text-muted",
					children: a("暂无可用模型，请先在设置中完成模型配置。")
				})]
			}),
			l && /* @__PURE__ */ (0, K.jsxs)("div", {
				className: "mt-3 border-t border-amber-300/15 pt-2.5",
				children: [/* @__PURE__ */ (0, K.jsx)("p", {
					className: "mb-2 text-[11px] font-medium text-canvas-text",
					children: a("勾选要接入的模型（已选 {selected} / {total}）", {
						selected: f.length,
						total: l.options.length
					})
				}), /* @__PURE__ */ (0, K.jsx)("div", {
					className: "max-h-64 space-y-2.5 overflow-y-auto pr-1",
					children: m.map(([e, t]) => {
						let n = t.map((e) => e.id), r = n.every((e) => f.includes(e));
						return /* @__PURE__ */ (0, K.jsxs)("div", { children: [/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "mb-1 flex items-center justify-between gap-2",
							children: [/* @__PURE__ */ (0, K.jsxs)("p", {
								className: "text-[10px] text-canvas-text-muted",
								children: [
									a(Pe[e]),
									"（",
									t.length,
									"）"
								]
							}), /* @__PURE__ */ (0, K.jsx)("button", {
								type: "button",
								onClick: () => g(n),
								className: "min-h-6 rounded px-1.5 text-[10px] text-canvas-text-secondary hover:text-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50",
								children: a(r ? "取消全选" : "全选")
							})]
						}), /* @__PURE__ */ (0, K.jsx)("div", {
							className: "space-y-1",
							children: t.map((e) => {
								let t = f.includes(e.id);
								return /* @__PURE__ */ (0, K.jsxs)("label", {
									className: `flex min-h-7 cursor-pointer items-start gap-2 rounded border px-2 py-1 text-[11px] leading-4 transition-colors ${t ? "border-amber-300/70 bg-amber-300/10 text-amber-100" : "border-canvas-border text-canvas-text-secondary hover:border-amber-300/40 hover:text-canvas-text"}`,
									children: [/* @__PURE__ */ (0, K.jsx)("input", {
										type: "checkbox",
										checked: t,
										onChange: () => h(e.id),
										className: "mt-0.5 shrink-0 accent-amber-400"
									}), /* @__PURE__ */ (0, K.jsxs)("span", {
										className: "min-w-0 break-words",
										children: [e.name, /* @__PURE__ */ (0, K.jsx)("span", {
											className: "ml-1 text-canvas-text-muted",
											children: e.id
										})]
									})]
								}, e.id);
							})
						})] }, e);
					})
				})]
			}),
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "mt-3 flex justify-end gap-2",
				children: [/* @__PURE__ */ (0, K.jsx)("button", {
					type: "button",
					onClick: () => i(o.id, { approved: !1 }),
					className: "min-h-8 rounded-md px-3 py-1 text-xs text-canvas-text-secondary hover:bg-canvas-hover hover:text-canvas-text focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50",
					children: a("拒绝")
				}), /* @__PURE__ */ (0, K.jsx)("button", {
					type: "button",
					disabled: y && !S || b && f.length === 0,
					onClick: () => {
						i(o.id, {
							approved: !0,
							...y ? { inputValues: { modelRef: u } } : {},
							...b ? { inputValues: { selectedModelIds: f } } : {}
						});
					},
					className: "min-h-8 rounded-md bg-amber-500 px-3 py-1 text-xs font-medium text-black hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400",
					children: y ? a("确认生成") : b ? a("接入选中的 {count} 个模型", { count: f.length }) : a("确认执行")
				})]
			})
		]
	});
}
//#endregion
//#region src/services/chat/agentExecutionRationale.ts
var Fe = {
	waiting_approval: "任务正在等待用户确认",
	paused: "任务已暂停",
	completed: "任务已完成",
	failed: "任务执行失败",
	stopped: "任务已停止"
};
function Ie(e, t) {
	let n = t.data?.callId;
	if (n) return e.steps.find((e) => e.toolCall?.callId === n);
}
function Le(e, t) {
	return Ie(e, t)?.title || t.data?.toolId || "工具操作";
}
function Q(e) {
	if (e !== void 0) return e < 1e3 ? `${Math.max(0, Math.round(e))}ms` : `${(e / 1e3).toFixed(1)}s`;
}
function Re(e) {
	let t = [], n = Q(e.data?.durationMs);
	return n && t.push(n), (e.data?.retryCount ?? 0) > 0 && t.push(`重试 ${e.data?.retryCount} 次`), t.length > 0 ? t.join(" · ") : void 0;
}
function ze(e, t) {
	if (e === "deny") return "本地权限策略拒绝了本次操作。";
	if (e === "require_approval") switch (t) {
		case "canvas_write": return "画布修改需要根据当前协作模式由用户确认。";
		case "media_generation": return "付费媒体生成每次都需要用户确认。";
		case "file_write": return "本地文件写入始终需要用户确认。";
		case "permanent_delete": return "永久删除始终需要用户二次确认。";
		case "memory_write": return "项目记忆必须由用户确认后保存。";
		case "config_write": return "厂商配置写入必须由用户确认。";
		case "asset_write": return "资产库写入必须由用户确认。";
		default: return "此操作执行前需要用户确认。";
	}
	return t === "read" ? "只读操作符合当前权限，可自动执行。" : t === "canvas_write" ? "本地策略允许当前模式执行本次画布修改。" : "本地权限策略允许执行本次操作。";
}
function Be(e, t, n) {
	let r = Ie(e, t), i = Le(e, t), a = {
		id: t.id,
		timestamp: t.timestamp
	};
	switch (t.type) {
		case "task_queued": return {
			...a,
			kind: "control",
			tone: "muted",
			title: "任务已进入执行队列"
		};
		case "model_round_start": return {
			...a,
			kind: "analysis",
			tone: "active",
			title: `第 ${n} 轮：分析任务`,
			detail: "结合任务目标和已有观察，选择下一步可验证操作。"
		};
		case "model_round_end": return {
			...a,
			kind: "analysis",
			tone: "muted",
			title: `第 ${n} 轮：分析完成`,
			meta: Re(t)
		};
		case "interjection_applied": return {
			...a,
			kind: "control",
			tone: "active",
			title: "已纳入用户补充要求"
		};
		case "tool_proposed": return {
			...a,
			kind: "action",
			tone: "active",
			title: `提出工具：${i}`,
			detail: r?.toolCall?.inputSummary
		};
		case "policy_decision": {
			let e = t.data?.decision, n = e === "deny" ? "已阻止" : e === "require_approval" ? "等待确认" : "允许执行";
			return {
				...a,
				kind: "decision",
				tone: e === "deny" ? "error" : e === "require_approval" ? "warning" : "success",
				title: `${n}：${i}`,
				detail: ze(e, t.data?.effect)
			};
		}
		case "approval_resolved": return {
			...a,
			kind: "decision",
			tone: t.data?.approved ? "success" : "warning",
			title: t.data?.approved ? "用户已批准操作" : "用户未批准操作"
		};
		case "tool_start": return {
			...a,
			kind: "action",
			tone: "active",
			title: `开始执行：${i}`,
			detail: r?.toolCall?.inputSummary
		};
		case "tool_end": {
			let e = t.data?.status === "succeeded";
			return {
				...a,
				kind: "observation",
				tone: e ? "success" : "error",
				title: e ? `执行完成：${i}` : `执行失败：${i}`,
				detail: r?.outputSummary || r?.toolCall?.resultSummary || r?.errorMessage,
				meta: Re(t)
			};
		}
		case "canvas_checkpoint": return {
			...a,
			kind: "control",
			tone: "success",
			title: "已记录画布回退点",
			detail: "本次画布修改可从任务时间线回退。"
		};
		case "canvas_rewind": return {
			...a,
			kind: "control",
			tone: "success",
			title: "已回退任务画布修改"
		};
		case "task_status": {
			let e = t.data?.status;
			if (!e || !(e in Fe)) return null;
			let n = e === "failed" ? "error" : e === "waiting_approval" || e === "paused" ? "warning" : e === "completed" ? "success" : "muted";
			return {
				...a,
				kind: "control",
				tone: n,
				title: Fe[e]
			};
		}
		default: return null;
	}
}
function Ve(e) {
	let t = e.events ?? [], n = t.filter((e) => e.type === "model_round_start").length, r = Math.max(0, e.modelRounds - n), i = [];
	for (let n of t) {
		n.type === "model_round_start" && (r += 1);
		let t = Be(e, n, Math.max(r, 1));
		t && i.push(t);
	}
	return i.slice(-16);
}
//#endregion
//#region src/components/chat/AgentExecutionRationale.tsx
var He = new Set([
	"queued",
	"planning",
	"running",
	"waiting_tool",
	"waiting_approval"
]), Ue = {
	analysis: "mdi:head-cog-outline",
	decision: "mdi:shield-check-outline",
	action: "mdi:play-circle-outline",
	observation: "mdi:clipboard-text-outline",
	control: "mdi:source-branch"
}, We = {
	active: "text-indigo-300 bg-indigo-500/10",
	success: "text-emerald-400 bg-emerald-500/10",
	warning: "text-amber-400 bg-amber-500/10",
	error: "text-red-400 bg-red-500/10",
	muted: "text-canvas-text-muted bg-canvas-hover/60"
};
function Ge({ task: e }) {
	let t = r(), n = Ve(e), [i, a] = (0, G.useState)(() => He.has(e.status));
	if (n.length === 0) return null;
	let o = n.at(-1);
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "mt-2 rounded-md border border-canvas-border bg-canvas-card/80",
		children: [/* @__PURE__ */ (0, K.jsxs)("button", {
			type: "button",
			"aria-expanded": i,
			onClick: () => a((e) => !e),
			className: "flex min-h-8 w-full items-center gap-1.5 rounded-md px-2 text-left transition-colors hover:bg-canvas-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40",
			children: [
				/* @__PURE__ */ (0, K.jsx)(B, {
					icon: "mdi:timeline-text-outline",
					width: "14",
					className: "shrink-0 text-indigo-300/90"
				}),
				/* @__PURE__ */ (0, K.jsx)("span", {
					className: "shrink-0 text-[11px] font-medium text-canvas-text-secondary",
					children: t("执行依据")
				}),
				/* @__PURE__ */ (0, K.jsx)("span", {
					className: "min-w-0 truncate text-[10px] text-canvas-text-muted",
					children: o?.title
				}),
				/* @__PURE__ */ (0, K.jsx)("span", {
					className: "ml-auto shrink-0 text-[10px] text-canvas-text-muted",
					children: t("{count} 项", { count: n.length })
				}),
				/* @__PURE__ */ (0, K.jsx)(B, {
					icon: i ? "mdi:chevron-up" : "mdi:chevron-down",
					width: "14",
					className: "shrink-0 text-canvas-text-muted"
				})
			]
		}), i && /* @__PURE__ */ (0, K.jsxs)("div", {
			className: "border-t border-canvas-border px-2 py-2",
			children: [/* @__PURE__ */ (0, K.jsxs)("p", {
				className: "mb-2 flex items-start gap-1.5 text-[10px] leading-4 text-canvas-text-muted",
				children: [/* @__PURE__ */ (0, K.jsx)(B, {
					icon: "mdi:information-outline",
					width: "12",
					className: "mt-0.5 shrink-0"
				}), /* @__PURE__ */ (0, K.jsx)("span", { children: t("来自可验证的任务事件，不包含模型隐藏思维。") })]
			}), /* @__PURE__ */ (0, K.jsx)("ol", {
				className: "space-y-1.5",
				children: n.map((e) => /* @__PURE__ */ (0, K.jsxs)("li", {
					className: "flex gap-2 text-[11px] leading-[17px]",
					children: [/* @__PURE__ */ (0, K.jsx)("span", {
						className: `mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${We[e.tone]}`,
						children: /* @__PURE__ */ (0, K.jsx)(B, {
							icon: Ue[e.kind],
							width: "12"
						})
					}), /* @__PURE__ */ (0, K.jsxs)("span", {
						className: "min-w-0 flex-1",
						children: [/* @__PURE__ */ (0, K.jsxs)("span", {
							className: "flex flex-wrap items-baseline gap-x-1.5",
							children: [/* @__PURE__ */ (0, K.jsx)("span", {
								className: "break-words text-canvas-text-secondary",
								children: e.title
							}), e.meta && /* @__PURE__ */ (0, K.jsx)("span", {
								className: "text-[10px] tabular-nums text-canvas-text-muted",
								children: e.meta
							})]
						}), e.detail && /* @__PURE__ */ (0, K.jsx)("span", {
							className: "block break-words text-canvas-text-muted",
							children: e.detail
						})]
					})]
				}, e.id))
			})]
		})]
	});
}
//#endregion
//#region src/components/chat/AgentTaskTimeline.tsx
var Ke = {
	queued: {
		label: "排队中",
		icon: "mdi:clock-outline",
		className: "text-slate-400"
	},
	planning: {
		label: "规划中",
		icon: "mdi:loading",
		className: "text-violet-400",
		spin: !0
	},
	running: {
		label: "执行中",
		icon: "mdi:loading",
		className: "text-emerald-400",
		spin: !0
	},
	waiting_tool: {
		label: "调用工具",
		icon: "mdi:loading",
		className: "text-sky-400",
		spin: !0
	},
	waiting_approval: {
		label: "等待确认",
		icon: "mdi:shield-alert-outline",
		className: "text-amber-400"
	},
	paused: {
		label: "已暂停",
		icon: "mdi:pause-circle-outline",
		className: "text-slate-400"
	},
	completed: {
		label: "已完成",
		icon: "mdi:check-circle-outline",
		className: "text-emerald-400"
	},
	failed: {
		label: "失败",
		icon: "mdi:alert-circle-outline",
		className: "text-red-400"
	},
	stopped: {
		label: "已停止",
		icon: "mdi:stop-circle-outline",
		className: "text-slate-400"
	}
}, qe = {
	user_paused: "你已暂停",
	model_round_budget_exhausted: "已达模型轮次上限",
	tool_call_budget_exhausted: "已达工具调用上限",
	tool_result_budget_exhausted: "工具结果已达上限",
	context_budget_exhausted: "上下文接近模型上限",
	lifetime_budget_exhausted: "已达任务总预算上限",
	context_compression_failed: "上下文压缩失败",
	step_skipped_replan_required: "已跳过步骤，需重新规划",
	replan_requested: "已请求重新规划",
	app_restarted: "应用重启后暂停"
}, Je = [
	"queued",
	"planning",
	"running",
	"waiting_tool",
	"waiting_approval"
], Ye = {
	web_search: "正在搜索网页",
	web_extract: "正在浏览网页",
	file_list_grants: "正在查看已授权文件",
	file_read_text: "正在读取文件",
	provider_docs_read: "正在读取接口文档"
};
function Xe(e) {
	let t = e.currentStepId ? e.steps.find((t) => t.id === e.currentStepId) : void 0;
	if (t && [
		"pending",
		"running",
		"waiting_approval"
	].includes(t.status)) return t;
	for (let t = e.steps.length - 1; t >= 0; --t) {
		let n = e.steps[t];
		if ([
			"pending",
			"running",
			"waiting_approval"
		].includes(n.status)) return n;
	}
}
function Ze(e, t, n) {
	return e.status === "waiting_approval" || t?.status === "waiting_approval" ? t ? n("等待确认：{title}", { title: t.title }) : n("等待用户确认") : t?.status === "pending" ? n("准备{title}", { title: t.title }) : t?.status === "running" ? Ye[t.toolCall?.toolId ?? ""] ?? n("正在{title}", { title: t.title }) : e.status === "queued" ? n("正在等待执行") : e.status === "planning" ? e.steps.some((e) => e.status === "succeeded") ? n("正在分析工具结果") : n("正在分析请求") : e.status === "waiting_tool" ? n("正在调用工具") : e.status === "running" ? n("正在整理结果") : n(Ke[e.status].label);
}
function Qe(e, t) {
	if (t?.toolCall?.startedAt) return t.toolCall.startedAt;
	let n = e.status === "planning" ? "model_round_start" : "tool_start";
	for (let t = (e.events?.length ?? 0) - 1; t >= 0; --t) {
		let r = e.events?.[t];
		if (r?.type === n) return r.timestamp;
	}
	return e.startedAt ?? e.createdAt;
}
function $e(e, t) {
	let n = Math.max(0, Math.floor((t - e) / 1e3));
	return n < 60 ? `${n}s` : `${Math.floor(n / 60)}m ${n % 60}s`;
}
function et(e) {
	return e < 1e3 ? `${Math.max(0, Math.round(e))}ms` : e < 6e4 ? `${(e / 1e3).toFixed(1)}s` : `${Math.floor(e / 6e4)}m ${Math.floor(e % 6e4 / 1e3)}s`;
}
function tt({ icon: e, label: t, onClick: n, tone: r = "default" }) {
	return /* @__PURE__ */ (0, K.jsxs)("button", {
		type: "button",
		onClick: n,
		"aria-label": t,
		className: `flex min-h-8 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50 ${r === "primary" ? "text-indigo-300 hover:bg-indigo-500/15" : r === "danger" ? "text-red-400 hover:bg-red-500/10" : "text-canvas-text-secondary hover:bg-canvas-hover hover:text-canvas-text"}`,
		children: [/* @__PURE__ */ (0, K.jsx)(B, {
			icon: e,
			width: "14"
		}), t]
	});
}
function nt({ task: e, onResolveApproval: t, mediaModelOptions: n, mediaModelAvailability: i, onPause: a, onResume: o, onStop: s, onSkip: c, onReplan: l, onRewind: u }) {
	let d = r(), p = f.has(e.status), m = !!e.parentTaskId, [h, g] = (0, G.useState)(!p), _ = Ke[e.status], v = Je.includes(e.status), y = Xe(e), b = Ze(e, y, d), x = y?.toolCall?.inputSummary ?? y?.approval?.summary, S = Qe(e, y), [C, w] = (0, G.useState)(() => Date.now());
	(0, G.useEffect)(() => {
		if (!v || e.status === "waiting_approval") return;
		let t = window.setInterval(() => w(Date.now()), 1e3);
		return () => window.clearInterval(t);
	}, [
		y?.id,
		y?.status,
		v,
		e.status
	]);
	let T = e.steps.filter((e) => [
		"succeeded",
		"failed",
		"skipped",
		"stopped"
	].includes(e.status)).length, E = e.steps.find((e) => e.approval?.status === "pending"), D = e.status === "paused" || e.status === "failed" ? Te(e.errorCode) : void 0, O = e.steps.some((e) => e.status === "succeeded" && !!e.toolCall?.canvasCheckpoint), k = e.metrics, A = k ? k.inputTokens + k.outputTokens : 0, j = e.startedAt ? Math.max(0, (e.completedAt ?? e.updatedAt) - e.startedAt) : 0, ee = e.status === "completed" ? d("运行记录") : d(_.label);
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "agent-task-timeline mt-2 max-w-full py-0.5",
		children: [
			/* @__PURE__ */ (0, K.jsxs)("button", {
				type: "button",
				onClick: () => g((e) => !e),
				"aria-expanded": h,
				className: "flex min-h-7 w-full items-center gap-1.5 rounded-md px-0.5 text-left transition-colors hover:bg-canvas-hover/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40",
				children: [
					/* @__PURE__ */ (0, K.jsx)(B, {
						icon: _.icon,
						width: "14",
						className: `shrink-0 ${v ? "text-canvas-text-muted" : _.className} ${_.spin ? "animate-spin motion-reduce:animate-none" : ""}`
					}),
					/* @__PURE__ */ (0, K.jsx)("span", {
						className: "min-w-0 truncate text-[12px] font-medium text-canvas-text-secondary",
						children: v ? b : ee
					}),
					v && e.status !== "waiting_approval" && /* @__PURE__ */ (0, K.jsx)("span", {
						className: "shrink-0 text-[10px] tabular-nums text-canvas-text-muted",
						children: $e(S, C)
					}),
					/* @__PURE__ */ (0, K.jsxs)("span", {
						className: "ml-auto flex shrink-0 items-center gap-1.5 text-[10px] tabular-nums text-canvas-text-muted",
						children: [
							e.steps.length > 0 && /* @__PURE__ */ (0, K.jsx)("span", { children: d("{count} 步", { count: p ? e.steps.length : `${T}/${e.steps.length}` }) }),
							!v && j > 0 && /* @__PURE__ */ (0, K.jsxs)("span", { children: ["· ", et(j)] }),
							/* @__PURE__ */ (0, K.jsx)(B, {
								icon: h ? "mdi:chevron-up" : "mdi:chevron-down",
								width: "15"
							})
						]
					})
				]
			}),
			v && x && /* @__PURE__ */ (0, K.jsx)("p", {
				className: "break-words pl-5 text-[11px] leading-[17px] text-canvas-text-muted",
				children: x
			}),
			!!e.skillBindings?.length && /* @__PURE__ */ (0, K.jsxs)("div", {
				className: "mt-1 flex min-w-0 items-start gap-1.5 pl-5 text-[10px] leading-4 text-canvas-text-muted",
				children: [
					/* @__PURE__ */ (0, K.jsx)(B, {
						icon: "mdi:book-check-outline",
						width: "13",
						className: "mt-0.5 shrink-0 text-indigo-300/80"
					}),
					/* @__PURE__ */ (0, K.jsx)("span", {
						className: "shrink-0",
						children: d("已注入 Skill")
					}),
					/* @__PURE__ */ (0, K.jsx)("span", {
						className: "min-w-0 truncate text-canvas-text-secondary",
						children: e.skillBindings.map((e) => e.name).join("、")
					})
				]
			}),
			/* @__PURE__ */ (0, K.jsx)(Ge, { task: e }),
			h && k && (k.inputTokens > 0 || k.outputTokens > 0 || k.policyDenied > 0 || k.retryCount > 0) && /* @__PURE__ */ (0, K.jsxs)("div", {
				className: "mt-0.5 flex flex-wrap items-center gap-x-2 pl-5 text-[10px] tabular-nums text-canvas-text-muted",
				children: [
					A > 0 && /* @__PURE__ */ (0, K.jsxs)("span", { children: [A.toLocaleString(), " token"] }),
					k.policyDenied > 0 && /* @__PURE__ */ (0, K.jsx)("span", { children: d("{count} 次拒绝", { count: k.policyDenied }) }),
					k.retryCount > 0 && /* @__PURE__ */ (0, K.jsx)("span", { children: d("{count} 次重试", { count: k.retryCount }) })
				]
			}),
			e.status === "paused" && e.pausedReason && /* @__PURE__ */ (0, K.jsx)("p", {
				className: "mt-1.5 text-[11px] leading-[17px] text-amber-300/90",
				children: e.pausedReason ? d(qe[e.pausedReason] ?? e.pausedReason) : ""
			}),
			e.status === "failed" && e.errorMessage && /* @__PURE__ */ (0, K.jsx)("p", {
				className: "mt-1.5 break-words text-[11px] leading-[17px] text-red-400/90",
				children: e.errorMessage
			}),
			D && /* @__PURE__ */ (0, K.jsxs)("p", {
				className: "mt-1 flex items-start gap-1.5 text-[11px] leading-[17px] text-canvas-text-muted",
				children: [/* @__PURE__ */ (0, K.jsx)(B, {
					icon: "mdi:lightbulb-on-outline",
					width: "13",
					className: "mt-0.5 shrink-0 text-amber-400/80"
				}), /* @__PURE__ */ (0, K.jsx)("span", {
					className: "break-words",
					children: D.hint
				})]
			}),
			h && /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [
				e.steps.length > 0 && /* @__PURE__ */ (0, K.jsx)("div", {
					className: "mt-1 space-y-0.5",
					children: e.steps.map((e) => /* @__PURE__ */ (0, K.jsx)(Me, { step: e }, e.id))
				}),
				v && !y && e.status !== "waiting_approval" && /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "mt-0.5 flex items-center gap-1.5 rounded-md bg-canvas-hover/25 px-2 py-1.5",
					children: [
						/* @__PURE__ */ (0, K.jsx)(B, {
							icon: "mdi:loading",
							width: "14",
							className: "shrink-0 animate-spin motion-reduce:animate-none text-violet-400"
						}),
						/* @__PURE__ */ (0, K.jsx)("span", {
							className: "min-w-0 truncate text-[12px] text-canvas-text-secondary",
							children: b
						}),
						/* @__PURE__ */ (0, K.jsx)("span", {
							className: "ml-auto shrink-0 text-[10px] tabular-nums text-canvas-text-muted",
							children: $e(S, C)
						})
					]
				}),
				E && /* @__PURE__ */ (0, K.jsx)(Z, {
					step: E,
					mediaModelOptions: n,
					mediaModelAvailability: i,
					onResolve: t
				}, E.approval?.id),
				!p && !m && /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "mt-2.5 flex flex-wrap items-center gap-1 border-t border-canvas-border/60 pt-2",
					children: [
						v && e.status !== "waiting_approval" && /* @__PURE__ */ (0, K.jsx)(tt, {
							icon: "mdi:pause",
							label: d("暂停"),
							onClick: () => a(e.id)
						}),
						e.status === "paused" && /* @__PURE__ */ (0, K.jsx)(tt, {
							icon: "mdi:play",
							label: d("继续"),
							tone: "primary",
							onClick: () => o(e.id)
						}),
						E && /* @__PURE__ */ (0, K.jsx)(tt, {
							icon: "mdi:debug-step-over",
							label: d("跳过此步"),
							onClick: () => c(e.id, E.id)
						}),
						/* @__PURE__ */ (0, K.jsx)(tt, {
							icon: "mdi:refresh",
							label: d("重新规划"),
							onClick: () => l(e.id)
						}),
						/* @__PURE__ */ (0, K.jsx)(tt, {
							icon: "mdi:stop",
							label: d("停止"),
							tone: "danger",
							onClick: () => s(e.id)
						})
					]
				}),
				e.status === "failed" && !m && /* @__PURE__ */ (0, K.jsx)("div", {
					className: "mt-2.5 flex items-center gap-1 border-t border-canvas-border/60 pt-2",
					children: /* @__PURE__ */ (0, K.jsx)(tt, {
						icon: "mdi:play",
						label: d("继续"),
						tone: "primary",
						onClick: () => o(e.id)
					})
				}),
				!m && !v && O && /* @__PURE__ */ (0, K.jsx)("div", {
					className: "mt-2.5 flex items-center gap-1 border-t border-canvas-border/60 pt-2",
					children: /* @__PURE__ */ (0, K.jsx)(tt, {
						icon: "mdi:backup-restore",
						label: d("回退任务画布修改"),
						onClick: () => u(e.id)
					})
				})
			] })
		]
	});
}
//#endregion
//#region src/components/chat/SourceList.tsx
async function rt(e) {
	let t = de(e);
	if (t) try {
		await import("./dist-js-CtV1w6rx.js").then(({ open: e }) => e(t));
	} catch {
		window.open(t, "_blank", "noopener,noreferrer");
	}
}
function $({ sources: e }) {
	let t = r();
	return e.length === 0 ? null : /* @__PURE__ */ (0, K.jsxs)("details", {
		className: "mt-3 border-t border-canvas-border/70 pt-2",
		children: [/* @__PURE__ */ (0, K.jsxs)("summary", {
			className: "flex cursor-pointer list-none items-center gap-1.5 text-[12px] text-canvas-text-secondary hover:text-canvas-text",
			children: [
				/* @__PURE__ */ (0, K.jsx)(B, {
					icon: "mdi:web",
					width: "14"
				}),
				t("来源（{count}）", { count: e.length }),
				/* @__PURE__ */ (0, K.jsx)(B, {
					icon: "mdi:chevron-down",
					width: "14",
					className: "ml-auto"
				})
			]
		}), /* @__PURE__ */ (0, K.jsx)("div", {
			className: "mt-2 space-y-1.5",
			children: e.map((e, t) => /* @__PURE__ */ (0, K.jsxs)("button", {
				type: "button",
				onClick: () => void rt(e.url),
				title: e.snippet,
				className: "flex w-full items-start gap-2 rounded-md border border-canvas-border/60 bg-canvas-bg/50 px-2 py-1.5 text-left hover:bg-canvas-card",
				children: [
					/* @__PURE__ */ (0, K.jsx)("span", {
						className: "mt-0.5 shrink-0 text-[11px] font-medium text-indigo-400",
						children: e.citationId || `S${t + 1}`
					}),
					/* @__PURE__ */ (0, K.jsxs)("span", {
						className: "min-w-0 flex-1",
						children: [/* @__PURE__ */ (0, K.jsx)("span", {
							className: "block truncate text-[12px] text-canvas-text",
							children: e.title
						}), /* @__PURE__ */ (0, K.jsx)("span", {
							className: "block truncate text-[11px] text-canvas-text-muted",
							children: e.domain
						})]
					}),
					/* @__PURE__ */ (0, K.jsx)(B, {
						icon: "mdi:open-in-new",
						width: "13",
						className: "mt-0.5 shrink-0 text-canvas-text-muted"
					})
				]
			}, `${e.id}-${e.url}`))
		})]
	});
}
//#endregion
//#region src/components/chat/MessageBubble.tsx
function it(e) {
	let t = new Date(e), n = (e) => `${e}`.padStart(2, "0");
	return `${n(t.getHours())}:${n(t.getMinutes())}`;
}
function at({ message: e, agentTask: t, onAddToCanvas: n, onRetryMediaSave: i, onEditMessage: a, regeneratePrompt: o, onRegenerate: s, onNodeActivate: c, onNodeHover: l, onModelActivate: u, agentControls: d }) {
	let f = r(), [p, m] = (0, G.useState)(!1), [h, g] = (0, G.useState)(!1), _ = e.role === "user";
	if (e.role === "system") return /* @__PURE__ */ (0, K.jsx)("div", {
		className: "chat-message-bubble chat-message-system flex justify-center",
		children: /* @__PURE__ */ (0, K.jsx)("span", {
			className: "text-[11px] text-canvas-text-muted bg-canvas-hover px-2.5 py-0.5 rounded-full",
			children: e.content
		})
	});
	let v = e.mediaResult, y = v?.deliveryMode !== "canvas", b = y && v?.kind === "image", x = y && v?.kind === "video", S = y && v?.kind === "audio", C = e.mediaStatus === "queued" || e.mediaStatus === "generating", w = !C && v?.persistence === "failed", T = !!t && !!d && (t.steps.length > 0 || t.status !== "completed"), E = !_ && !e.content && !T && !C && [
		"queued",
		"parsing",
		"streaming"
	].includes(e.status), D = !_ && !!e.content && !!o && !!s && [
		"done",
		"partial",
		"interrupted",
		"error",
		"canceled"
	].includes(e.status), O = async () => {
		if (!(!i || h)) {
			g(!0);
			try {
				await i(e.id);
			} finally {
				g(!1);
			}
		}
	}, k = async () => {
		try {
			await navigator.clipboard.writeText(e.content), m(!0), window.setTimeout(() => m(!1), 1600);
		} catch {
			m(!1);
		}
	};
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: `chat-message-bubble group flex items-end gap-1.5 ${_ ? "justify-end chat-message-user" : "justify-start chat-message-assistant"}`,
		children: [
			!_ && /* @__PURE__ */ (0, K.jsx)(xe, {
				size: 20,
				className: "chat-message-avatar chat-message-avatar-assistant shrink-0 mb-0.5"
			}),
			_ && /* @__PURE__ */ (0, K.jsx)("span", {
				className: "chat-message-time shrink-0 self-end mb-1 text-[11px] tabular-nums text-canvas-text-muted opacity-60 transition-opacity group-hover:opacity-100",
				children: it(e.timestamp)
			}),
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: `chat-message-content max-w-[88%] text-[13px] leading-relaxed
                    ${_ ? "rounded-2xl rounded-br-sm bg-indigo-500/15 px-3.5 py-2 text-canvas-text" : "min-w-0 px-1 py-1 text-canvas-text"}`,
				children: [
					E && /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "flex min-h-8 w-fit items-center gap-2 px-1 py-1.5 text-[12px] text-canvas-text-secondary",
						role: "status",
						"aria-live": "polite",
						children: [/* @__PURE__ */ (0, K.jsx)(B, {
							icon: "mdi:loading",
							width: "15",
							className: "shrink-0 animate-spin text-canvas-text-muted motion-reduce:animate-none"
						}), /* @__PURE__ */ (0, K.jsx)("span", { children: f("正在分析请求") })]
					}),
					e.content && (_ ? /* @__PURE__ */ (0, K.jsx)("div", {
						className: "whitespace-pre-wrap break-words",
						children: /* @__PURE__ */ (0, K.jsx)(ce, {
							value: e.content,
							compact: !0,
							onNodeActivate: c,
							onNodeHover: l,
							onModelActivate: u
						})
					}) : /* @__PURE__ */ (0, K.jsx)("div", {
						className: "rounded-2xl rounded-bl-sm border border-canvas-border/80 bg-canvas-card/80 px-3.5 py-2.5 text-canvas-text shadow-sm shadow-black/10 backdrop-blur-sm",
						children: /* @__PURE__ */ (0, K.jsx)(ue, {
							value: e.content,
							onNodeActivate: c,
							onNodeHover: l,
							onModelActivate: u
						})
					})),
					T && t && d && /* @__PURE__ */ (0, K.jsx)(nt, {
						task: t,
						...d
					}),
					C && /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "chat-message-media-generating flex items-center gap-2 mt-2 text-[11px] text-canvas-text-muted",
						children: [/* @__PURE__ */ (0, K.jsx)("span", { className: "inline-block w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" }), f("正在生成媒体内容...")]
					}),
					b && !C && /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "chat-message-image mt-1 pt-2 rounded-lg overflow-hidden border border-canvas-border",
						children: [/* @__PURE__ */ (0, K.jsx)(N, {
							src: v.url,
							alt: v.prompt || f("生成的图片"),
							className: "w-full h-auto max-h-[280px] object-contain bg-canvas-bg rounded-lg"
						}), v.prompt && /* @__PURE__ */ (0, K.jsx)("p", {
							className: "bg-canvas-bg/60 px-2 py-1.5 text-[11px] leading-[17px] text-canvas-text-muted",
							children: v.prompt
						})]
					}),
					x && !C && /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "chat-message-video mt-2 rounded-lg overflow-hidden border border-canvas-border",
						children: [/* @__PURE__ */ (0, K.jsx)(L, {
							src: v.url,
							controls: !0,
							className: "w-full max-h-[280px] bg-canvas-bg",
							preload: "metadata",
							children: f("您的浏览器不支持视频播放")
						}), v.prompt && /* @__PURE__ */ (0, K.jsx)("p", {
							className: "bg-canvas-bg/60 px-2 py-1.5 text-[11px] leading-[17px] text-canvas-text-muted",
							children: v.prompt
						})]
					}),
					S && !C && /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "chat-message-audio mt-2 rounded-lg border border-canvas-border bg-canvas-bg/60 p-2",
						children: [
							/* @__PURE__ */ (0, K.jsxs)("div", {
								className: "mb-2 flex items-center gap-1.5 text-[11px] text-canvas-text-secondary",
								children: [/* @__PURE__ */ (0, K.jsx)(B, {
									icon: v.audioPurpose === "music" ? "mdi:music-note" : "mdi:account-voice",
									width: "14"
								}), v.audioPurpose === "music" ? f("生成的音乐") : f("生成的语音")]
							}),
							/* @__PURE__ */ (0, K.jsx)("audio", {
								src: v.url,
								controls: !0,
								className: "h-9 w-full",
								preload: "metadata",
								children: f("您的浏览器不支持音频播放")
							}),
							v.prompt && /* @__PURE__ */ (0, K.jsx)("p", {
								className: "mt-1.5 text-[11px] leading-[17px] text-canvas-text-muted",
								children: v.prompt
							})
						]
					}),
					w && /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "chat-message-media-unsaved mt-2 flex flex-wrap items-start gap-1.5 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1.5 text-[11px] text-amber-300",
						children: [
							/* @__PURE__ */ (0, K.jsx)(B, {
								icon: "mdi:content-save-alert-outline",
								width: "13",
								height: "13",
								className: "mt-0.5 shrink-0"
							}),
							/* @__PURE__ */ (0, K.jsx)("span", {
								className: "min-w-0 flex-1",
								children: f("已生成但未保存到项目：{error}", { error: v?.persistError || f("写入项目目录失败") })
							}),
							i && /* @__PURE__ */ (0, K.jsxs)("button", {
								type: "button",
								onClick: () => void O(),
								disabled: h,
								className: "flex min-h-6 shrink-0 items-center gap-1 rounded border border-amber-400/40 px-1.5 text-[11px] text-amber-200\n                           hover:bg-amber-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 disabled:opacity-60",
								children: [/* @__PURE__ */ (0, K.jsx)(B, {
									icon: h ? "mdi:loading" : "mdi:download-outline",
									width: "12",
									className: h ? "animate-spin motion-reduce:animate-none" : void 0
								}), f(h ? "保存中" : "重试保存")]
							})
						]
					}),
					e.mediaStatus === "failed" && /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "chat-message-media-error flex items-start gap-1 mt-2 text-[11px] text-red-400",
						children: [/* @__PURE__ */ (0, K.jsx)(B, {
							icon: "mdi:alert-circle-outline",
							width: "13",
							height: "13",
							className: "mt-0.5 shrink-0"
						}), /* @__PURE__ */ (0, K.jsx)("span", { children: f("媒体生成失败：{error}", { error: e.mediaError || f("未知错误") }) })]
					}),
					e.canvasStatus === "pending" && /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "mt-2 flex items-center gap-1 text-[11px] text-blue-400",
						children: [/* @__PURE__ */ (0, K.jsx)(B, {
							icon: "mdi:vector-square",
							width: "13"
						}), f("正在创建画布节点...")]
					}),
					e.canvasStatus === "created" && e.canvasNodeId && /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "mt-2 flex items-center gap-1 text-[11px] text-green-400",
						children: [/* @__PURE__ */ (0, K.jsx)(B, {
							icon: "mdi:check-circle-outline",
							width: "13"
						}), f("已添加到画布")]
					}),
					e.canvasStatus === "failed" && /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "mt-2 flex items-start gap-1 text-[11px] text-red-400",
						children: [/* @__PURE__ */ (0, K.jsx)(B, {
							icon: "mdi:vector-square-remove",
							width: "13",
							className: "mt-0.5 shrink-0"
						}), /* @__PURE__ */ (0, K.jsx)("span", { children: f("节点创建失败：{error}", { error: e.canvasError || f("未知错误") }) })]
					}),
					!_ && e.sources && e.sources.length > 0 && /* @__PURE__ */ (0, K.jsx)($, { sources: e.sources }),
					v && v.deliveryMode === "chat" && e.canvasStatus !== "created" && n && /* @__PURE__ */ (0, K.jsxs)("button", {
						type: "button",
						onClick: () => n(e.id),
						className: "mt-2 flex min-h-8 items-center gap-1.5 rounded-md border border-canvas-border px-2.5 py-1 text-xs text-canvas-text-secondary\n                       hover:bg-canvas-card hover:text-canvas-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
						children: [/* @__PURE__ */ (0, K.jsx)(B, {
							icon: "mdi:plus-box-outline",
							width: "14"
						}), f("添加到画布")]
					}),
					e.status === "streaming" && !!e.content && /* @__PURE__ */ (0, K.jsx)("span", { className: "chat-message-status chat-message-status-streaming inline-block w-1.5 h-3.5 bg-indigo-400/80 animate-pulse ml-1 align-text-bottom rounded-full" }),
					e.status === "error" && /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "chat-message-status chat-message-status-error flex items-center gap-1 mt-1 text-[11px] text-red-400",
						children: [/* @__PURE__ */ (0, K.jsx)(B, {
							icon: "mdi:alert-circle",
							width: "12",
							height: "12"
						}), f("响应失败")]
					}),
					e.status === "interrupted" && /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "chat-message-status chat-message-status-interrupted flex items-center gap-1 mt-1 text-[11px] text-amber-400",
						children: [/* @__PURE__ */ (0, K.jsx)(B, {
							icon: "mdi:alert-outline",
							width: "12",
							height: "12"
						}), f("响应中断")]
					}),
					!!e.content && /* @__PURE__ */ (0, K.jsxs)("div", {
						className: `mt-1 flex h-7 items-center gap-0.5 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 ${_ ? "justify-end" : "justify-start"}`,
						children: [
							/* @__PURE__ */ (0, K.jsx)("button", {
								type: "button",
								onClick: () => void k(),
								"aria-label": f(p ? "消息已复制" : "复制消息"),
								"data-tooltip": f(p ? "已复制" : "复制"),
								className: "flex h-7 w-7 items-center justify-center rounded-md text-canvas-text-muted transition-colors hover:bg-canvas-hover hover:text-canvas-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
								children: /* @__PURE__ */ (0, K.jsx)(B, {
									icon: p ? "mdi:check" : "mdi:content-copy",
									width: "14"
								})
							}),
							_ && a && /* @__PURE__ */ (0, K.jsx)("button", {
								type: "button",
								onClick: () => a(e.content),
								"aria-label": f("编辑并再次发送"),
								"data-tooltip": f("编辑并再次发送"),
								className: "flex h-7 w-7 items-center justify-center rounded-md text-canvas-text-muted transition-colors hover:bg-canvas-hover hover:text-canvas-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
								children: /* @__PURE__ */ (0, K.jsx)(B, {
									icon: "mdi:pencil-outline",
									width: "14"
								})
							}),
							D && /* @__PURE__ */ (0, K.jsx)("button", {
								type: "button",
								onClick: () => s?.(o || ""),
								"aria-label": f("再次生成回答"),
								"data-tooltip": f("再次生成"),
								className: "flex h-7 w-7 items-center justify-center rounded-md text-canvas-text-muted transition-colors hover:bg-canvas-hover hover:text-canvas-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
								children: /* @__PURE__ */ (0, K.jsx)(B, {
									icon: "mdi:refresh",
									width: "15"
								})
							})
						]
					})
				]
			}),
			!_ && /* @__PURE__ */ (0, K.jsx)("span", {
				className: "chat-message-time shrink-0 self-end mb-1 text-[11px] tabular-nums text-canvas-text-muted opacity-60 transition-opacity group-hover:opacity-100",
				children: it(e.timestamp)
			})
		]
	});
}
var ot = (0, G.memo)(at), st = [
	"现在有几个失败节点？",
	"选中 3 号节点",
	"删除失败节点"
];
function ct({ onNew: e, onList: t, onOpenAgents: n, onExample: i }) {
	let a = r();
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "chat-empty-state flex flex-col items-center justify-center h-full text-center px-6",
		children: [
			/* @__PURE__ */ (0, K.jsx)(xe, {
				size: 72,
				className: "mb-5"
			}),
			/* @__PURE__ */ (0, K.jsx)("h3", {
				className: "text-base font-semibold text-canvas-text mb-2",
				children: a("AI 助手")
			}),
			/* @__PURE__ */ (0, K.jsx)("p", {
				className: "text-sm text-canvas-text-secondary mb-6 max-w-[260px]",
				children: a("直接开始对话，或按需安装智能体来扩展专业能力。没有智能体时，默认助手仍可正常使用。")
			}),
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "chat-empty-state-actions flex flex-col gap-2 w-48",
				children: [
					/* @__PURE__ */ (0, K.jsxs)(I, {
						className: "flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl\n                     bg-brand text-white text-sm font-medium hover:bg-brand-light transition-colors",
						onClick: e,
						children: [/* @__PURE__ */ (0, K.jsx)(B, {
							icon: "mdi:plus",
							width: "16",
							height: "16"
						}), a("新建对话")]
					}),
					/* @__PURE__ */ (0, K.jsxs)(I, {
						className: "flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl\n                     bg-canvas-hover text-canvas-text-secondary text-sm hover:text-canvas-text\n                     hover:bg-canvas-border transition-colors",
						onClick: t,
						children: [/* @__PURE__ */ (0, K.jsx)(B, {
							icon: "mdi:history",
							width: "16",
							height: "16"
						}), a("历史记录")]
					}),
					n && /* @__PURE__ */ (0, K.jsxs)(I, {
						className: "flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl\n                       border border-canvas-border bg-canvas-card text-canvas-text-secondary text-sm\n                       hover:border-brand/40 hover:bg-brand/10 hover:text-canvas-text transition-colors",
						onClick: n,
						children: [/* @__PURE__ */ (0, K.jsx)(B, {
							icon: "lucide:bot",
							width: "16",
							height: "16"
						}), a("智能体中心")]
					})
				]
			}),
			i && /* @__PURE__ */ (0, K.jsxs)("div", {
				className: "chat-empty-state-examples mt-8 space-y-2 w-56",
				children: [/* @__PURE__ */ (0, K.jsx)("p", {
					className: "text-[11px] text-canvas-text-muted mb-2",
					children: a("试试这些：")
				}), st.map((e) => /* @__PURE__ */ (0, K.jsx)("button", {
					type: "button",
					onClick: () => i(e),
					className: "w-full text-left px-3 py-2 text-xs text-canvas-text-secondary bg-canvas-bg\n                         border border-canvas-border rounded-lg transition-colors\n                         hover:border-brand-light/50 hover:text-canvas-text hover:bg-canvas-hover",
					children: a(e)
				}, e))]
			})
		]
	});
}
//#endregion
//#region src/components/chat/ChatMessages.tsx
var lt = [
	"现在有几个失败节点？",
	"选中 3 号节点",
	"删除失败节点"
], ut = [], dt = 80, ft = 60;
function pt(e, t, n = "") {
	let r = [], i = n;
	for (let n of e) {
		if (n.role === "user") {
			i = n.content, r.push(t(n));
			continue;
		}
		let e = n.role === "assistant" && i ? i : void 0;
		r.push(t(n, e));
	}
	return r;
}
function mt({ messages: e, agentTasks: t = ut, showEmptyState: n, detachedInitialized: i, onNewConversation: a, onShowList: o, onOpenAgents: s, onAddMediaToCanvas: c, onRetryMediaSave: l, agentControls: u, onExampleClick: d, onEditMessage: f, onRegenerateMessage: p, onNodeActivate: m, onNodeHover: h, onModelActivate: g }) {
	let _ = r(), v = te(), y = e[0]?.conversationId ?? "", b = (0, G.useRef)(null), x = (0, G.useRef)(!0), S = (0, G.useRef)(y), C = (0, G.useRef)({
		conversationId: y,
		messages: []
	}), w = (0, G.useRef)(null), [T, E] = (0, G.useState)({
		conversationId: y,
		isNearBottom: !0,
		unreadCount: 0
	}), [D, O] = (0, G.useState)({
		conversationId: y,
		limit: dt,
		messageCount: e.length
	}), k = T.conversationId === y ? T.isNearBottom : !0, A = T.conversationId === y ? T.unreadCount : 0, j = D.conversationId === y ? D.limit : dt, ee = D.conversationId === y && !k ? Math.max(0, e.length - D.messageCount) : 0, M = Math.min(e.length, j + ee), N = Math.max(0, e.length - M), P = (0, G.useMemo)(() => N === 0 ? e : e.slice(N), [e, N]), F = (0, G.useMemo)(() => {
		for (let t = N - 1; t >= 0; --t) if (e[t]?.role === "user") return e[t].content;
		return "";
	}, [e, N]), I = N, ne = (0, G.useMemo)(() => new Map(t.map((e) => [e.id, e])), [t]), L = (0, G.useMemo)(() => pt(P, (e, t) => /* @__PURE__ */ (0, K.jsx)(ot, {
		message: e,
		agentTask: e.agentTaskId ? ne.get(e.agentTaskId) : void 0,
		onAddToCanvas: c,
		onRetryMediaSave: l,
		onEditMessage: f,
		regeneratePrompt: t,
		onRegenerate: p,
		onNodeActivate: m,
		onNodeHover: h,
		onModelActivate: g,
		agentControls: u
	}, e.id), F), [
		u,
		ne,
		F,
		c,
		l,
		f,
		g,
		m,
		h,
		p,
		P
	]), R = (0, G.useCallback)(() => {
		let t = b.current;
		t && (w.current = {
			conversationId: y,
			height: t.scrollHeight,
			top: t.scrollTop
		}), O((t) => ({
			conversationId: y,
			limit: Math.min(e.length, (t.conversationId === y ? M : dt) + ft),
			messageCount: e.length
		}));
	}, [
		y,
		e.length,
		M
	]);
	(0, G.useLayoutEffect)(() => {
		if (S.current !== y) {
			S.current = y, x.current = !0, C.current = {
				conversationId: y,
				messages: e
			}, w.current = null, E({
				conversationId: y,
				isNearBottom: !0,
				unreadCount: 0
			}), O({
				conversationId: y,
				limit: dt,
				messageCount: e.length
			});
			let t = b.current;
			t && (t.scrollTop = t.scrollHeight);
			return;
		}
		if (D.conversationId !== y) {
			w.current = null;
			return;
		}
		let t = w.current, n = b.current;
		!t || t.conversationId !== y || !n || (n.scrollTop = t.top + (n.scrollHeight - t.height), w.current = null);
	}, [
		y,
		e,
		M,
		D.conversationId
	]);
	let re = (0, G.useCallback)((t) => {
		let n = t.currentTarget, r = n.scrollHeight - n.scrollTop - n.clientHeight < 80, i = x.current;
		x.current = r, E((e) => ({
			conversationId: y,
			isNearBottom: r,
			unreadCount: r ? 0 : e.conversationId === y ? e.unreadCount : 0
		})), i !== r && O({
			conversationId: y,
			limit: r ? dt : M,
			messageCount: e.length
		});
	}, [
		y,
		e.length,
		M
	]), z = (0, G.useCallback)(() => {
		let e = b.current;
		if (!e) return;
		let t = e.style.scrollBehavior;
		e.style.scrollBehavior = "auto", e.scrollTop = e.scrollHeight, e.style.scrollBehavior = t;
	}, []);
	(0, G.useEffect)(() => {
		let t = C.current, n = t.conversationId === y ? t.messages : [];
		if (C.current = {
			conversationId: y,
			messages: e
		}, x.current) {
			z();
			let e = requestAnimationFrame(() => {
				z();
			});
			return () => cancelAnimationFrame(e);
		}
		let r = new Set(n.map((e) => e.id)), i = e.filter((e) => e.role !== "user" && !r.has(e.id)).length, a = n[n.length - 1], o = e[e.length - 1], s = !!o && o.role === "assistant" && o.id === a?.id && o.content !== a.content;
		(i > 0 || s) && E((e) => {
			let t = e.conversationId === y ? e.unreadCount : 0;
			return {
				conversationId: y,
				isNearBottom: !1,
				unreadCount: i > 0 ? t + i : Math.max(1, t)
			};
		});
	}, [
		y,
		z,
		e
	]);
	let ie = (0, G.useCallback)(() => {
		let t = b.current;
		t && (t.scrollTo({
			top: t.scrollHeight,
			behavior: v ? "auto" : "smooth"
		}), x.current = !0, E({
			conversationId: y,
			isNearBottom: !0,
			unreadCount: 0
		}), O({
			conversationId: y,
			limit: dt,
			messageCount: e.length
		}), requestAnimationFrame(z));
	}, [
		y,
		z,
		e.length,
		v
	]);
	return (0, G.useEffect)(() => () => {
		h?.(null);
	}, [h]), /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "chat-panel-messages-shell relative flex-1 min-h-0",
		children: [/* @__PURE__ */ (0, K.jsxs)("div", {
			ref: b,
			onScroll: re,
			className: "chat-panel-messages h-full min-h-0 overflow-y-auto px-3.5 py-3 flex flex-col gap-3",
			children: [
				n && i && /* @__PURE__ */ (0, K.jsx)(ct, {
					onNew: a,
					onList: o,
					onOpenAgents: s,
					onExample: d
				}),
				!n && e.length === 0 && i && /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "chat-panel-start-hint flex flex-col items-center justify-center h-full text-center px-4",
					children: [
						/* @__PURE__ */ (0, K.jsx)("div", {
							className: "w-11 h-11 rounded-xl bg-indigo-500/12 flex items-center justify-center mb-3",
							children: /* @__PURE__ */ (0, K.jsx)(B, {
								icon: "mdi:chat-processing-outline",
								width: "20",
								height: "20",
								className: "text-indigo-400"
							})
						}),
						/* @__PURE__ */ (0, K.jsx)("p", {
							className: "text-[13px] text-canvas-text-secondary mb-0.5",
							children: _("开始对话")
						}),
						/* @__PURE__ */ (0, K.jsx)("p", {
							className: "text-[11px] text-canvas-text-muted mb-4",
							children: _("用自然语言操作画布，AI 助手帮你完成")
						}),
						d && /* @__PURE__ */ (0, K.jsx)("div", {
							className: "flex flex-wrap justify-center gap-1.5 max-w-[260px]",
							children: lt.map((e) => /* @__PURE__ */ (0, K.jsx)("button", {
								type: "button",
								onClick: () => d(e),
								className: "rounded-full border border-canvas-border px-2.5 py-1 text-[11px] text-canvas-text-secondary\n                               hover:border-indigo-400/50 hover:text-canvas-text transition-colors",
								children: _(e)
							}, e))
						})
					]
				}),
				I > 0 && /* @__PURE__ */ (0, K.jsx)("button", {
					type: "button",
					onClick: R,
					className: "mx-auto min-h-8 rounded-md border border-canvas-border px-3 py-1 text-[11px] text-canvas-text-secondary transition-colors hover:bg-canvas-hover hover:text-canvas-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
					children: _("加载更早消息（还有 {count} 条）", { count: I })
				}),
				L,
				/* @__PURE__ */ (0, K.jsx)("div", {})
			]
		}), !k && /* @__PURE__ */ (0, K.jsxs)("button", {
			type: "button",
			onClick: ie,
			"aria-label": A > 0 ? _("回到最新消息，{count} 条未读", { count: A }) : _("回到最新消息"),
			className: "absolute bottom-3 left-1/2 z-10 flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full border border-canvas-border bg-canvas-surface/95 px-3 text-[11px] font-medium text-canvas-text-secondary shadow-lg shadow-black/25 backdrop-blur-md transition-[border-color,color,transform] hover:border-indigo-400/45 hover:text-canvas-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50 active:translate-y-px",
			children: [
				/* @__PURE__ */ (0, K.jsx)(B, {
					icon: "mdi:arrow-down",
					width: "14"
				}),
				/* @__PURE__ */ (0, K.jsx)("span", { children: _("最新消息") }),
				A > 0 && /* @__PURE__ */ (0, K.jsx)("span", {
					className: "min-w-4 rounded-full bg-indigo-400/20 px-1 text-center text-[10px] tabular-nums text-indigo-200",
					children: A > 99 ? "99+" : A
				})
			]
		})]
	});
}
//#endregion
//#region src/components/chat/ContextUsageIndicator.tsx
var ht = 18, gt = 2.5, _t = (ht - gt) / 2, vt = 2 * Math.PI * _t;
function yt({ usage: e }) {
	let t = r();
	if (!e) return null;
	let n = Math.min(1, Math.max(0, e.ratio)), i = Math.round(e.ratio * 100), a = e.ratio >= .9 ? "#f87171" : e.ratio >= .75 ? "#fbbf24" : "#818cf8", o = e.source === "declared" ? t("模型配置声明") : e.source === "catalog" ? t("按模型 ID 推断") : t("未识别模型，使用保守默认值");
	return /* @__PURE__ */ (0, K.jsx)("span", {
		className: "chat-context-usage inline-flex shrink-0 items-center justify-center",
		title: [
			t("上下文占用（估算）：约 {tokens} token", { tokens: e.estimatedTokens.toLocaleString() }),
			t("模型上下文窗口：{tokens} token（{source}）", {
				tokens: e.contextWindow.toLocaleString(),
				source: o
			}),
			t("输入预算：{tokens} token，已用约 {percent}%", {
				tokens: e.inputBudget.toLocaleString(),
				percent: i
			}),
			e.ratio >= .75 ? t("接近上限时会自动压缩较早的对话，不会删除原始历史") : ""
		].filter(Boolean).join("\n"),
		role: "img",
		"aria-label": t("上下文占用约 {percent}%", { percent: i }),
		children: /* @__PURE__ */ (0, K.jsxs)("svg", {
			width: ht,
			height: ht,
			viewBox: `0 0 ${ht} ${ht}`,
			className: "-rotate-90",
			children: [/* @__PURE__ */ (0, K.jsx)("circle", {
				cx: ht / 2,
				cy: ht / 2,
				r: _t,
				fill: "none",
				stroke: "currentColor",
				strokeWidth: gt,
				className: "text-canvas-border"
			}), /* @__PURE__ */ (0, K.jsx)("circle", {
				cx: ht / 2,
				cy: ht / 2,
				r: _t,
				fill: "none",
				stroke: a,
				strokeWidth: gt,
				strokeLinecap: "round",
				strokeDasharray: vt,
				strokeDashoffset: vt * (1 - n)
			})]
		})
	});
}
//#endregion
//#region src/components/chat/ChatComposerEditor.tsx
var bt = "​", xt = /@\{([^:}\r\n]+):([^}\r\n]+)\}|@model\{([^|}\r\n]+)\|([^}\r\n]*)\}|@skill\{([^|}\r\n]+)\|([^}\r\n]*)\}|@drama\{([^:}\r\n]+):([^}\r\n]+)\}/g, St = /@\{[^:}\r\n]+:[^}\r\n]+\}|@model\{[^|}\r\n]+\|[^}\r\n]*\}|@skill\{[^|}\r\n]+\|[^}\r\n]*\}|@drama\{[^:}\r\n]+:[^}\r\n]+\}/, Ct = {
	node: {
		chip: "border-indigo-400/25 bg-indigo-400/10 text-indigo-100",
		accent: "bg-indigo-300/70"
	},
	model: {
		chip: "border-sky-400/25 bg-sky-400/10 text-sky-100",
		accent: "bg-sky-300/70"
	},
	skill: {
		chip: "border-emerald-400/25 bg-emerald-400/10 text-emerald-100",
		accent: "bg-emerald-300/70"
	},
	drama: {
		chip: "border-violet-400/25 bg-violet-400/10 text-violet-100",
		accent: "bg-violet-300/70"
	}
}, wt = {
	node: "节点",
	model: "模型",
	skill: "Skill",
	drama: "资产"
};
function Tt(e) {
	try {
		return decodeURIComponent(e);
	} catch {
		return e;
	}
}
function Et(e) {
	return e.replace(/}/g, "").trim();
}
function Dt(e) {
	return e.kind === "node" ? `@{${e.id}:${Et(e.label) || "节点"}}` : e.kind === "model" ? `@model{${e.id}|${Et(e.label) || "模型"}}` : e.kind === "drama" ? `@drama{${e.id}:${Et(e.label) || "资产"}}` : `@skill{${e.id}|${encodeURIComponent(e.label)}}`;
}
function Ot(e, t) {
	let n = e[0];
	return e[1] === void 0 ? e[3] === void 0 ? e[5] === void 0 ? {
		kind: "drama",
		id: e[7],
		label: e[8] || "资产",
		raw: n
	} : {
		kind: "skill",
		id: e[5],
		label: Tt(e[6]) || "Skill",
		raw: n
	} : {
		kind: "model",
		id: e[3],
		label: e[4] || "模型",
		raw: n
	} : {
		kind: "node",
		id: e[1],
		label: e[2],
		displayId: t.get(e[1]),
		raw: n
	};
}
function kt(e) {
	return !!e && e.nodeType === Node.ELEMENT_NODE && e.hasAttribute("data-chat-reference");
}
function At(e) {
	return !!e && e.nodeType === Node.ELEMENT_NODE && e.tagName === "BR";
}
function jt(e) {
	let t = e.previousSibling;
	(!t || At(t) || kt(t)) && e.parentNode?.insertBefore(document.createTextNode(bt), e);
}
function Mt(e) {
	let t = document.createElement("span");
	t.contentEditable = "false", t.setAttribute("data-chat-reference", e.kind), t.setAttribute("data-chat-reference-raw", e.raw);
	let n = Ct[e.kind];
	t.setAttribute("aria-label", `${wt[e.kind]} ${e.label}${e.kind === "node" && e.displayId != null ? `，编号 ${e.displayId}` : ""}`), t.className = `mx-0.5 inline-flex max-w-[min(100%,18rem)] select-none items-center align-middle
    rounded-[7px] border px-2 py-1 text-[12px] font-medium leading-none shadow-sm ${n.chip}`;
	let r = document.createElement("span");
	r.setAttribute("aria-hidden", "true"), r.className = `mr-1.5 h-3 w-0.5 shrink-0 rounded-full ${n.accent}`, t.appendChild(r);
	let i = document.createElement("span");
	if (i.className = "max-w-[12rem] truncate", i.textContent = e.kind === "skill" ? `/${e.label}` : e.label, t.appendChild(i), e.kind === "node" && e.displayId != null) {
		let n = document.createElement("span");
		n.className = "ml-1.5 shrink-0 border-l border-indigo-300/20 pl-1.5 text-[10px] font-semibold tabular-nums text-indigo-200/65", n.textContent = `#${e.displayId}`, t.appendChild(n);
	}
	return t;
}
function Nt(e, t) {
	t && t.split("\n").forEach((t, n) => {
		n > 0 && e.push(document.createElement("br")), t && e.push(document.createTextNode(t));
	});
}
function Pt(e, t) {
	let n = [], r = 0;
	for (let i of e.matchAll(xt)) {
		let a = i.index;
		if (a == null) continue;
		Nt(n, e.slice(r, a));
		let o = Mt(Ot(i, t)), s = n[n.length - 1];
		(!s || At(s) || kt(s)) && n.push(document.createTextNode(bt)), n.push(o), r = a + i[0].length;
	}
	return Nt(n, e.slice(r)), n;
}
function Ft(e) {
	let t = "", n = (e) => {
		if (e.nodeType === Node.TEXT_NODE) {
			t += (e.textContent || "").split(bt).join("");
			return;
		}
		if (e.nodeType !== Node.ELEMENT_NODE) return;
		let r = e, i = r.getAttribute("data-chat-reference-raw");
		if (i != null) {
			t += i;
			return;
		}
		if (r.tagName === "BR") {
			t += "\n";
			return;
		}
		for (let e of Array.from(r.childNodes)) n(e);
	};
	for (let t of Array.from(e.childNodes)) n(t);
	return t;
}
function It(e) {
	let t = (e) => e.nodeType === Node.TEXT_NODE ? St.test(e.textContent || "") : e.nodeType !== Node.ELEMENT_NODE || kt(e) ? !1 : Array.from(e.childNodes).some(t);
	return Array.from(e.childNodes).some(t);
}
function Lt(e) {
	let t = window.getSelection();
	if (!t) return;
	let n = document.createRange();
	n.selectNodeContents(e), n.collapse(!1), t.removeAllRanges(), t.addRange(n);
}
function Rt(e) {
	if (e.startContainer.nodeType === Node.TEXT_NODE) return {
		node: e.startContainer,
		offset: e.startOffset
	};
	if (e.startContainer.nodeType !== Node.ELEMENT_NODE || e.startOffset === 0) return null;
	let t = e.startContainer.childNodes[e.startOffset - 1] ?? null;
	for (; t?.nodeType === Node.ELEMENT_NODE && !kt(t);) t = t.lastChild;
	return t?.nodeType === Node.TEXT_NODE ? {
		node: t,
		offset: t.textContent?.length ?? 0
	} : null;
}
var zt = (0, G.forwardRef)(function({ value: e, onChange: t, onSubmit: n, nodeDisplayIds: i, onMentionQueryChange: a, onSlashQueryChange: o, onSuggestionKeyDown: s, suggestionListId: c, activeSuggestionId: l, suggestionsOpen: u = !1, placeholder: d, disabled: f = !1 }, p) {
	let m = r(), h = (0, G.useRef)(null), g = (0, G.useRef)(null), _ = (0, G.useRef)(null), v = (0, G.useCallback)(() => {
		h.current && t(Ft(h.current));
	}, [t]), y = (0, G.useCallback)(() => {
		let e = h.current, t = window.getSelection();
		if (!e || !t?.rangeCount) return;
		let n = t.getRangeAt(0);
		e.contains(n.startContainer) && (g.current = n.cloneRange());
	}, []), b = (0, G.useCallback)(() => {
		let e = h.current, t = window.getSelection();
		if (!e || !t?.rangeCount) return;
		let n = t.getRangeAt(0), r = Rt(n);
		if (!e.contains(n.startContainer) || !r) {
			_.current = null, a(null), o(null);
			return;
		}
		let i = (r.node.textContent || "").slice(0, r.offset), s = /@([^\s@]*)$/.exec(i), c = /(?:^|\s)\/([^\s/]*)$/.exec(i), l = s ?? c;
		if (!l) {
			_.current = null, a(null), o(null);
			return;
		}
		let u = n.cloneRange();
		u.setStart(r.node, r.offset - l[0].trimStart().length), _.current = u, s ? (a(s[1]), o(null)) : (a(null), o(c?.[1] ?? ""));
	}, [a, o]);
	(0, G.useEffect)(() => {
		let t = h.current;
		if (!t || Ft(t) === e && !It(t)) return;
		let n = document.activeElement === t;
		t.innerHTML = "";
		for (let n of Pt(e, i)) t.appendChild(n);
		n && Lt(t);
	}, [i, e]), (0, G.useEffect)(() => {
		let e = () => h.current?.focus();
		return window.addEventListener("chat-focus-composer", e), () => window.removeEventListener("chat-focus-composer", e);
	}, []), (0, G.useImperativeHandle)(p, () => ({
		focus: () => h.current?.focus(),
		insertReference: (e) => {
			let t = h.current;
			if (!t || f) return;
			t.focus();
			let n = window.getSelection(), r = _.current ?? g.current, i = r && t.contains(r.startContainer) ? r.cloneRange() : document.createRange();
			(!r || !t.contains(r.startContainer)) && (i.selectNodeContents(t), i.collapse(!1)), i.deleteContents();
			let s = Dt(e), c = Mt({
				...e,
				raw: s
			});
			i.insertNode(c), jt(c);
			let l = document.createTextNode(" ");
			c.parentNode?.insertBefore(l, c.nextSibling), i.setStart(l, 1), i.collapse(!0), n?.removeAllRanges(), n?.addRange(i), g.current = i.cloneRange(), _.current = null, a(null), o(null), v();
		}
	}), [
		f,
		v,
		a,
		o
	]);
	let x = (0, G.useCallback)(() => {
		let e = h.current;
		e && (!e.textContent && !e.querySelector("[data-chat-reference]") && (e.innerHTML = ""), y(), b(), v());
	}, [
		y,
		b,
		v
	]), S = (0, G.useCallback)((e) => {
		let t = h.current, n = window.getSelection();
		if (!t || !n?.rangeCount) return !1;
		let r = n.getRangeAt(0);
		if (!r.collapsed || !t.contains(r.startContainer)) return !1;
		let i = null;
		if (r.startContainer.nodeType === Node.TEXT_NODE) {
			let t = r.startContainer.textContent || "";
			e === "before" && r.startOffset === 0 && (i = r.startContainer.previousSibling), e === "after" && r.startOffset === t.length && (i = r.startContainer.nextSibling);
		} else r.startContainer.nodeType === Node.ELEMENT_NODE && (i = e === "before" ? r.startContainer.childNodes[r.startOffset - 1] ?? null : r.startContainer.childNodes[r.startOffset] ?? null);
		if (!kt(i)) return !1;
		let a = i.previousSibling;
		return i.remove(), a?.nodeType === Node.TEXT_NODE && a.textContent === bt && a.remove(), v(), !0;
	}, [v]), C = (0, G.useCallback)((t) => {
		if (!t.nativeEvent.isComposing && !s?.(t)) {
			if (t.key === "Enter" && !t.shiftKey) {
				t.preventDefault(), !f && e.trim() && n();
				return;
			}
			if (t.key === "Enter" && t.shiftKey) {
				t.preventDefault();
				let e = window.getSelection();
				if (!e?.rangeCount) return;
				let n = e.getRangeAt(0);
				n.deleteContents();
				let r = document.createElement("br"), i = document.createTextNode(bt);
				n.insertNode(r), r.parentNode?.insertBefore(i, r.nextSibling), n.setStart(i, 1), n.collapse(!0), e.removeAllRanges(), e.addRange(n), v();
				return;
			}
			t.key === "Backspace" && S("before") && t.preventDefault(), t.key === "Delete" && S("after") && t.preventDefault();
		}
	}, [
		f,
		v,
		n,
		s,
		S,
		e
	]), w = (0, G.useCallback)((e) => {
		e.preventDefault();
		let t = window.getSelection();
		if (!t?.rangeCount) return;
		let n = t.getRangeAt(0);
		n.deleteContents();
		let r = document.createTextNode(e.clipboardData.getData("text/plain"));
		n.insertNode(r), n.setStartAfter(r), n.collapse(!0), t.removeAllRanges(), t.addRange(n), x();
	}, [x]);
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "relative min-h-[64px] max-h-[160px]",
		children: [!e && /* @__PURE__ */ (0, K.jsx)("span", {
			className: "pointer-events-none absolute inset-x-0 top-0 text-[13px] leading-5 text-canvas-text-muted",
			children: d
		}), /* @__PURE__ */ (0, K.jsx)("div", {
			ref: h,
			role: "textbox",
			"aria-label": m("对话消息"),
			"aria-multiline": "true",
			"aria-autocomplete": "list",
			"aria-controls": u ? c : void 0,
			"aria-activedescendant": u ? l : void 0,
			"aria-expanded": u,
			contentEditable: !f,
			suppressContentEditableWarning: !0,
			spellCheck: !1,
			onInput: x,
			onKeyDown: C,
			onKeyUp: y,
			onMouseUp: y,
			onPaste: w,
			onBlur: v,
			className: `chat-panel-textarea relative z-10 block w-full min-h-[64px] max-h-[160px]
          overflow-y-auto whitespace-pre-wrap break-words bg-transparent text-[13px] leading-5 text-canvas-text
          outline-none selection:bg-indigo-400/25 rounded-[8px] ${f ? "cursor-not-allowed opacity-50" : ""}`
		})]
	});
}), Bt = typeof window < "u" && "__TAURI_INTERNALS__" in window, Vt = [
	"nodes",
	"assets",
	"models"
], Ht = {
	character: "角色",
	scene: "场景",
	prop: "道具"
}, Ut = {
	nodes: "节点",
	assets: "资产",
	models: "模型"
}, Wt = {
	image: "图片",
	video: "视频",
	audio: "音频"
}, Gt = {
	image: "mdi:image-outline",
	video: "mdi:video-outline",
	audio: "mdi:music-note-outline"
}, Kt = "chat-reference-suggestions", qt = "chat-skill-suggestions";
function Jt(e, t) {
	return e.filter((e) => $t(t, e.name, e.description, e.fileName, e.sourceLabel));
}
function Yt(e) {
	let t = /* @__PURE__ */ new Map();
	for (let n of e) {
		let e = t.get(n.sourceGroupId);
		if (e) {
			e.options.push(n);
			continue;
		}
		t.set(n.sourceGroupId, {
			id: n.sourceGroupId,
			label: n.sourceLabel,
			sourceKind: n.sourceKind,
			options: [n]
		});
	}
	return [...t.values()].sort((e, t) => e.sourceKind === t.sourceKind ? 0 : e.sourceKind === "user" ? -1 : 1);
}
function Xt(e) {
	let t = e.toLocaleLowerCase();
	return t === "n" ? {
		scope: "nodes",
		query: ""
	} : t === "m" ? {
		scope: "models",
		query: ""
	} : t === "a" ? {
		scope: "assets",
		query: ""
	} : {
		scope: "all",
		query: e
	};
}
function Zt(e) {
	if (e.imageUrl) {
		if (e.filePath && Bt) try {
			return j(e.filePath);
		} catch {
			return e.thumbnailUrl || e.imageUrl;
		}
		return e.thumbnailUrl || e.imageUrl;
	}
	return e.thumbnailUrl;
}
function Qt(e, t) {
	let n = t.trim().toLocaleLowerCase().replace(/\s+/g, "");
	if (!n) return !0;
	let r = [
		e.label,
		e.value,
		e.provider,
		e.groupName,
		e.description
	].filter(Boolean).join(" ").toLocaleLowerCase().replace(/\s+/g, "");
	if (r.includes(n)) return !0;
	let i = 0;
	for (let e of n) {
		if (i = r.indexOf(e, i), i < 0) return !1;
		i += 1;
	}
	return !0;
}
function $t(e, ...t) {
	let n = e.trim().toLocaleLowerCase().replace(/\s+/g, "");
	if (!n) return !0;
	let r = t.filter((e) => e != null).join(" ").toLocaleLowerCase().replace(/\s+/g, "");
	if (r.includes(n)) return !0;
	let i = 0;
	for (let e of n) {
		if (i = r.indexOf(e, i), i < 0) return !1;
		i += 1;
	}
	return !0;
}
function en({ assistantModelId: e, onAssistantModelChange: t, mediaModels: n, mediaModelOptions: i, mediaModelAvailability: a, inputValue: o, onInputChange: s, onSend: c, hasActiveTask: l = !1, onInterject: u, localFileGrants: d = [], onAuthorizeLocalFiles: f, onRevokeLocalFile: p, contextUsage: m, disabled: h = !1, allowSkillUpload: g = !0, skillOptions: _ }) {
	let v = r(), y = (0, G.useRef)(null), b = te(), [x, C] = (0, G.useState)(!1), [w, T] = (0, G.useState)(""), [E, O] = (0, G.useState)("nodes"), [k, A] = (0, G.useState)("all"), [j, N] = (0, G.useState)("all"), [P, F] = (0, G.useState)(!1), [L, R] = (0, G.useState)(""), [ie, V] = (0, G.useState)(!1), [ae, H] = (0, G.useState)(0), oe = D((e) => e.nodes), se = D((e) => e.dramaAssets), ce = D((e) => e.userSkills), le = D((e) => e.agentPackageSkills), ue = D((e) => e.uploadSkill), de = D((e) => e.showToast), fe = (0, G.useMemo)(() => S(ce, le), [le, ce]), pe = _ ?? fe, me = i, U = (0, G.useMemo)(() => me.filter((e) => Qt(e, w)), [me, w]), he = (0, G.useMemo)(() => oe.filter((e) => e.type !== "group").filter((e) => $t(w, e.data.label, e.data.displayId, e.data.displayId == null ? void 0 : `#${String(e.data.displayId)}`, e.data.type, e.id)), [oe, w]), ge = (0, G.useMemo)(() => Jt(pe, L), [pe, L]), _e = (0, G.useMemo)(() => Yt(ge), [ge]), ve = (0, G.useMemo)(() => _e.flatMap((e) => e.options), [_e]), ye = (0, G.useMemo)(() => new Map(oe.map((e) => [e.id, e.data.displayId])), [oe]), be = (0, G.useMemo)(() => {
		let e = /* @__PURE__ */ new Map();
		for (let t of U) e.set(t.mediaKind, (e.get(t.mediaKind) ?? 0) + 1);
		return e.size === 0 ? [] : [{
			id: "all",
			label: v("全部"),
			count: U.length
		}, ...[...e].map(([e, t]) => ({
			id: e,
			label: v(Wt[e] ?? e),
			count: t
		}))];
	}, [U, v]), q = (0, G.useMemo)(() => k === "all" ? U : U.filter((e) => e.mediaKind === k), [U, k]), J = (0, G.useMemo)(() => z(se, w), [se, w]), xe = (0, G.useMemo)(() => {
		let e = /* @__PURE__ */ new Map();
		for (let t of J) e.set(t.kind, (e.get(t.kind) ?? 0) + 1);
		return e.size === 0 ? [] : [{
			id: "all",
			label: v("全部"),
			count: J.length
		}, ...[...e].map(([e, t]) => ({
			id: e,
			label: v(Ht[e] ?? e),
			count: t
		}))];
	}, [J, v]), Se = (0, G.useMemo)(() => j === "all" ? J : J.filter((e) => e.kind === j), [j, J]), Ce = {
		nodes: he.length,
		assets: J.length,
		models: U.length
	}, Y = Ce[E] > 0 ? E : Vt.find((e) => Ce[e] > 0) ?? E, we = (0, G.useMemo)(() => Y === "nodes" ? he : [], [he, Y]), Te = (0, G.useMemo)(() => Y === "assets" ? Se : [], [Y, Se]), Ee = (0, G.useMemo)(() => Y === "models" ? q : [], [q, Y]), De = (0, G.useMemo)(() => {
		let e = { "general-models": !0 };
		for (let t of me) e[t.groupId] = e[t.groupId] || !!a[t.value];
		return e;
	}, [me, a]), Oe = (0, G.useCallback)((e) => !!a[e.value], [a]), ke = (0, G.useCallback)((e) => {
		t(e.value.startsWith("general/") ? e.value.slice(8) : e.value);
	}, [t]), Ae = (0, G.useMemo)(() => !e || e.startsWith("general/") ? e : n.some((t) => t.category === "text" && t.id === e) ? `general/${e}` : e, [e, n]), je = (0, G.useCallback)((e) => {
		y.current?.insertReference({
			kind: "model",
			id: e.value,
			label: e.label
		}), C(!1), T(""), O("nodes"), A("all"), H(0);
	}, []), Me = (0, G.useCallback)((e, t, n) => {
		y.current?.insertReference({
			kind: "node",
			id: e,
			label: t,
			displayId: n
		}), C(!1), T(""), O("nodes"), A("all"), H(0);
	}, []), Ne = (0, G.useCallback)((e) => {
		y.current?.insertReference({
			kind: "drama",
			id: e.id,
			label: e.name
		}), C(!1), T(""), O("nodes"), N("all"), H(0);
	}, []), Pe = (0, G.useCallback)((e, t) => {
		y.current?.insertReference({
			kind: "skill",
			id: e,
			label: t
		}), F(!1), R(""), H(0);
	}, []), X = (0, G.useMemo)(() => [
		...we.map((e) => ({
			key: `node:${e.id}`,
			kind: "node",
			nodeId: e.id,
			label: String(e.data.label || v("节点")),
			displayId: e.data.displayId
		})),
		...Te.map((e) => ({
			key: `drama:${e.id}`,
			kind: "drama",
			item: e
		})),
		...Ee.filter(Oe).map((e) => ({
			key: `model:${e.mediaKind}:${e.value}`,
			kind: "model",
			model: e
		}))
	], [
		Oe,
		v,
		we,
		Te,
		Ee
	]), Z = (0, G.useMemo)(() => ve.map((e) => ({
		key: `skill:${e.id}`,
		skill: e
	})), [ve]), Fe = (0, G.useMemo)(() => new Map(Z.map((e, t) => [e.skill.id, t])), [Z]), Ie = (0, G.useMemo)(() => new Map(X.map((e, t) => [e.key, t])), [X]), Le = x ? X.length : P ? Z.length : 0, Q = Le > 0 ? Math.min(ae, Le - 1) : 0, Re = (0, G.useCallback)((e) => {
		e.kind === "node" ? Me(e.nodeId, e.label, e.displayId) : e.kind === "drama" ? Ne(e.item) : je(e.model);
	}, [
		Ne,
		je,
		Me
	]), ze = (0, G.useCallback)((e) => {
		if (!(x || P) || ![
			"ArrowDown",
			"ArrowUp",
			"Enter",
			"Escape"
		].includes(e.key) || e.key === "Enter" && e.shiftKey) return !1;
		if (e.preventDefault(), e.stopPropagation(), e.key === "Escape") return C(!1), F(!1), T(""), R(""), O("nodes"), A("all"), !0;
		let t = x ? X.length : Z.length;
		if (t === 0) return !0;
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			let n = e.key === "ArrowDown" ? 1 : -1;
			return H((e) => (e + n + t) % t), !0;
		}
		if (x) {
			let e = X[Q] ?? X[0];
			e && Re(e);
		} else {
			let e = Z[Q] ?? Z[0];
			e && Pe(e.skill.id, e.skill.name);
		}
		return !0;
	}, [
		Pe,
		x,
		X,
		Q,
		Re,
		P,
		Z
	]), Be = [
		...we.map((e) => {
			let t = String(e.data.label || v("节点")), n = Ie.get(`node:${e.id}`);
			return {
				key: `node:${e.id}`,
				domId: n == null ? void 0 : `chat-reference-suggestion-${n}`,
				label: t,
				thumbnailUrl: Zt(e.data),
				badge: e.data.displayId == null ? void 0 : `#${String(e.data.displayId)}`,
				title: `${t} · ${String(e.data.type)}`,
				onSelect: () => Me(e.id, t, e.data.displayId)
			};
		}),
		...Te.map((e) => {
			let t = Ie.get(`drama:${e.id}`), n = e.imageNodeId ? oe.find((t) => t.id === e.imageNodeId) : void 0, r = (n ? re(n.data) : void 0) || e.imageUrl || e.referenceImages?.find((e) => !!e.imageUrl)?.imageUrl;
			return {
				key: `drama:${e.id}`,
				domId: t == null ? void 0 : `chat-reference-suggestion-${t}`,
				label: e.name,
				thumbnailUrl: r,
				icon: "mdi:account-box-outline",
				badge: v(Ht[e.kind] ?? e.kind),
				title: v(r ? "{name}（引用参考图）" : "{name}（引用设定文字）", { name: e.name }),
				onSelect: () => Ne(e)
			};
		}),
		...Ee.map((e) => {
			let t = Oe(e), n = Ie.get(`model:${e.mediaKind}:${e.value}`);
			return {
				key: `model:${e.mediaKind}:${e.value}`,
				domId: n == null ? void 0 : `chat-reference-suggestion-${n}`,
				label: e.label,
				icon: Gt[e.mediaKind],
				badge: v(t ? Wt[e.mediaKind] : "未配置"),
				disabled: !t,
				title: t ? e.description : v("请先配置对应供应商"),
				onSelect: () => je(e)
			};
		})
	], Ve = x ? X.length > 0 ? `chat-reference-suggestion-${Q}` : void 0 : P && Z.length > 0 ? `chat-skill-suggestion-${Q}` : void 0, He = (0, G.useCallback)(async () => {
		if (!ie) {
			V(!0);
			try {
				await ue("file");
			} catch (e) {
				de(e instanceof Error ? e.message : v("上传 Skill 失败"), "error");
			} finally {
				V(!1);
			}
		}
	}, [
		de,
		ie,
		v,
		ue
	]);
	return (0, G.useEffect)(() => {
		h || y.current?.focus();
	}, [h]), (0, G.useEffect)(() => {
		let e = () => {
			F(!1), R(""), O("models"), A("all"), T(""), C(!0), H(0), requestAnimationFrame(() => y.current?.focus());
		};
		return window.addEventListener("chat-open-reference-menu", e), () => window.removeEventListener("chat-open-reference-menu", e);
	}, []), /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "chat-panel-input-area flex-shrink-0 px-3 pt-2",
		children: [/* @__PURE__ */ (0, K.jsxs)("div", {
			className: "chat-panel-input-box relative flex flex-col bg-canvas-card border border-canvas-border\n                    rounded-[14px] transition-[border-color,box-shadow] duration-200\n                    focus-within:border-brand-light focus-within:ring-2 focus-within:ring-brand/15\n                    px-1.5 py-1.5",
			children: [
				d.length > 0 && /* @__PURE__ */ (0, K.jsx)("div", {
					className: "mb-2 flex max-h-16 flex-wrap gap-1.5 overflow-y-auto",
					children: d.map((e) => /* @__PURE__ */ (0, K.jsxs)("span", {
						title: `${e.displayName} · ${Math.ceil(e.size / 1024)} KB`,
						className: "inline-flex items-center gap-1 rounded-full border border-canvas-border/60\n                           bg-canvas-hover/70 py-1 pl-2.5 pr-1 text-[11px] leading-none text-canvas-text-secondary",
						children: [
							/* @__PURE__ */ (0, K.jsx)(B, {
								icon: "mdi:file-document-outline",
								width: "12",
								className: "shrink-0 text-canvas-text-muted/80"
							}),
							/* @__PURE__ */ (0, K.jsx)("span", {
								className: "max-w-[100px] truncate",
								children: e.displayName
							}),
							p && /* @__PURE__ */ (0, K.jsx)("button", {
								type: "button",
								"aria-label": v("撤销 {name} 的读取授权", { name: e.displayName }),
								onClick: () => p(e.id),
								className: "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-canvas-text-muted transition-colors\n                               hover:bg-red-500/15 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50",
								children: /* @__PURE__ */ (0, K.jsx)(B, {
									icon: "mdi:close",
									width: "11"
								})
							})
						]
					}, e.id))
				}),
				/* @__PURE__ */ (0, K.jsx)(zt, {
					ref: y,
					value: o,
					onChange: s,
					onSubmit: c,
					nodeDisplayIds: ye,
					onMentionQueryChange: (e) => {
						C(e != null), H(0);
						let t = Xt(e ?? "");
						e == null || t.scope === "nodes" ? O("nodes") : t.scope === "assets" ? O("assets") : t.scope === "models" && O("models"), e ?? (A("all"), N("all")), T(t.query), e != null && F(!1);
					},
					onSlashQueryChange: (e) => {
						F(e != null), H(0), R(e ?? ""), e != null && C(!1);
					},
					onSuggestionKeyDown: ze,
					suggestionListId: x ? Kt : qt,
					activeSuggestionId: Ve,
					suggestionsOpen: x || P,
					placeholder: v("输入消息，@n 节点 · @a 资产 · @m 模型 · / 调用 Skill"),
					disabled: h
				}),
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "chat-panel-input-toolbar flex items-end justify-between gap-3",
					children: [
						/* @__PURE__ */ (0, K.jsx)(ee, { children: x && /* @__PURE__ */ (0, K.jsx)(M.div, {
							initial: b ? { opacity: 0 } : {
								opacity: 0,
								y: 6,
								scale: .97
							},
							animate: {
								opacity: 1,
								y: 0,
								scale: 1
							},
							exit: b ? { opacity: 0 } : {
								opacity: 0,
								y: 6,
								scale: .97
							},
							transition: b ? { duration: .1 } : {
								type: "spring",
								visualDuration: .22,
								bounce: 0
							},
							className: "absolute bottom-[calc(100%+8px)] left-0 right-0 z-20",
							children: /* @__PURE__ */ (0, K.jsx)(ne, {
								listId: Kt,
								ariaLabel: v("节点与模型引用"),
								tabs: [
									{
										id: "nodes",
										label: v("画布节点"),
										icon: "mdi:image-multiple-outline"
									},
									{
										id: "assets",
										label: v("资产库"),
										icon: "mdi:bookshelf"
									},
									{
										id: "models",
										label: v("模型"),
										icon: "mdi:cube-outline"
									}
								],
								activeTab: Y,
								onTabChange: (e) => {
									O(e), H(0);
								},
								chips: Y === "models" ? be : Y === "assets" ? xe : void 0,
								activeChip: Y === "assets" ? j : k,
								onChipChange: (e) => {
									Y === "assets" ? N(e) : A(e), H(0);
								},
								items: Be,
								activeKey: X[Q]?.key,
								onItemHover: (e) => {
									let t = Ie.get(e);
									t != null && H(t);
								},
								emptyText: w ? v("没有匹配\"{query}\"的{noun}", {
									query: w,
									noun: v(Ut[Y])
								}) : v("暂无可引用的{noun}", { noun: v(Ut[Y]) })
							})
						}) }),
						/* @__PURE__ */ (0, K.jsx)(ee, { children: P && /* @__PURE__ */ (0, K.jsxs)(M.div, {
							initial: b ? { opacity: 0 } : {
								opacity: 0,
								y: 6,
								scale: .97
							},
							animate: {
								opacity: 1,
								y: 0,
								scale: 1
							},
							exit: b ? { opacity: 0 } : {
								opacity: 0,
								y: 6,
								scale: .97
							},
							transition: b ? { duration: .1 } : {
								type: "spring",
								visualDuration: .22,
								bounce: 0
							},
							id: qt,
							role: "listbox",
							"aria-label": v("Skill 引用"),
							className: "absolute bottom-[calc(100%+8px)] left-0 right-0 z-20 max-h-72 overflow-y-auto rounded-xl border border-canvas-border bg-canvas-surface shadow-xl",
							children: [/* @__PURE__ */ (0, K.jsxs)("div", {
								className: "sticky top-0 z-20 flex items-center justify-between bg-canvas-surface px-3 py-1.5 text-[10px] font-medium text-canvas-text-muted",
								children: [/* @__PURE__ */ (0, K.jsx)("span", { children: "Skill" }), /* @__PURE__ */ (0, K.jsxs)("span", {
									className: "flex items-center gap-2",
									children: [/* @__PURE__ */ (0, K.jsx)("span", { children: ge.length }), g && /* @__PURE__ */ (0, K.jsx)("button", {
										type: "button",
										disabled: ie,
										onClick: (e) => {
											e.stopPropagation(), He();
										},
										"aria-label": v("上传 Skill"),
										title: v("上传 Skill 文件"),
										className: "flex h-7 w-7 items-center justify-center rounded-md text-canvas-text-secondary hover:bg-canvas-hover hover:text-canvas-text\n                               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50 disabled:cursor-wait disabled:opacity-50",
										children: /* @__PURE__ */ (0, K.jsx)(B, {
											icon: ie ? "mdi:loading" : "mdi:plus",
											width: "15",
											className: ie ? "animate-spin" : ""
										})
									})]
								})]
							}), /* @__PURE__ */ (0, K.jsx)("div", {
								className: "px-1 pb-1",
								children: ge.length > 0 ? _e.map((e) => /* @__PURE__ */ (0, K.jsxs)("section", {
									role: "group",
									"aria-label": e.sourceKind === "user" ? v("我的 Skill") : e.label,
									children: [/* @__PURE__ */ (0, K.jsxs)("div", {
										className: "flex items-center justify-between px-3 pb-1 pt-2 text-[10px] font-medium text-canvas-text-muted",
										children: [/* @__PURE__ */ (0, K.jsx)("span", {
											className: "truncate",
											children: e.sourceKind === "user" ? v("我的 Skill") : e.label
										}), /* @__PURE__ */ (0, K.jsx)("span", {
											className: "ml-2 shrink-0",
											children: e.options.length
										})]
									}), e.options.map((e) => {
										let t = Fe.get(e.id) ?? 0;
										return /* @__PURE__ */ (0, K.jsxs)("button", {
											id: `chat-skill-suggestion-${t}`,
											type: "button",
											role: "option",
											"aria-selected": t === Q,
											onMouseEnter: () => H(t),
											onClick: () => Pe(e.id, e.name),
											title: e.description,
											className: `flex min-h-9 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] text-canvas-text transition-colors ${t === Q ? "bg-canvas-hover ring-1 ring-inset ring-indigo-400/25" : "hover:bg-canvas-hover"}`,
											children: [/* @__PURE__ */ (0, K.jsx)(B, {
												icon: e.sourceKind === "agent-package" ? "lucide:bot" : "mdi:puzzle-outline",
												width: "16"
											}), /* @__PURE__ */ (0, K.jsxs)("span", {
												className: "min-w-0 flex-1",
												children: [/* @__PURE__ */ (0, K.jsx)("span", {
													className: "block truncate",
													children: e.name
												}), /* @__PURE__ */ (0, K.jsx)("span", {
													className: "block truncate text-[10px] text-canvas-text-muted",
													children: e.description
												})]
											})]
										}, e.id);
									})]
								}, e.id)) : /* @__PURE__ */ (0, K.jsx)("p", {
									className: "px-3 py-3 text-center text-[11px] text-canvas-text-muted",
									children: L ? v("没有匹配\"{query}\"的 Skill", { query: L }) : v("暂无可调用 Skill")
								})
							})]
						}) }),
						/* @__PURE__ */ (0, K.jsx)("div", {
							className: "flex items-center gap-1.5 min-w-0",
							children: /* @__PURE__ */ (0, K.jsx)(W, {
								nodeType: "ai-text",
								selectedModel: Ae,
								onSelect: ke,
								generalModelsOverride: n,
								groupAvailability: De
							})
						}),
						/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "flex items-end gap-1.5 shrink-0",
							children: [
								/* @__PURE__ */ (0, K.jsxs)("div", {
									className: "flex items-center gap-px",
									children: [
										/* @__PURE__ */ (0, K.jsx)("button", {
											type: "button",
											onClick: () => {
												T(""), O("nodes"), A("all"), F(!1), H(0), C((e) => !e), y.current?.focus();
											},
											"aria-label": v("引用画布节点或媒体模型"),
											title: v("引用画布节点或媒体模型"),
											className: `flex h-7 w-7 items-center justify-center rounded-md transition-[color,background-color,box-shadow]
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50
                  ${x ? "bg-brand/15 text-brand-light" : "text-canvas-text-secondary hover:bg-canvas-surface hover:text-canvas-text"}`,
											children: /* @__PURE__ */ (0, K.jsx)(B, {
												icon: "mdi:at",
												width: "14"
											})
										}),
										/* @__PURE__ */ (0, K.jsx)("span", {
											className: "w-px h-3.5 bg-canvas-border/50",
											"aria-hidden": "true"
										}),
										/* @__PURE__ */ (0, K.jsx)("button", {
											type: "button",
											onClick: () => {
												R(""), C(!1), H(0), F((e) => !e), y.current?.focus();
											},
											"aria-label": v("调用 Skill"),
											title: v("调用 Skill"),
											className: `flex h-7 w-7 items-center justify-center rounded-md transition-[color,background-color,box-shadow]
                  focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50
                  ${P ? "bg-brand/15 text-brand-light" : "text-canvas-text-secondary hover:bg-canvas-surface hover:text-canvas-text"}`,
											children: /* @__PURE__ */ (0, K.jsx)(B, {
												icon: "mdi:slash-forward",
												width: "14"
											})
										}),
										f && /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsx)("span", {
											className: "w-px h-3.5 bg-canvas-border/50",
											"aria-hidden": "true"
										}), /* @__PURE__ */ (0, K.jsx)("button", {
											type: "button",
											onClick: f,
											"aria-label": v("授权当前对话读取本地文件"),
											title: v("选择文本文件；授权仅在当前对话和本次运行期间有效"),
											className: "flex h-7 w-7 items-center justify-center rounded-md text-canvas-text-secondary\n                               hover:bg-canvas-surface hover:text-canvas-text transition-[color,background-color,box-shadow]\n                               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
											children: /* @__PURE__ */ (0, K.jsx)(B, {
												icon: "mdi:paperclip",
												width: "14"
											})
										})] })
									]
								}),
								o.trim() && !h && /* @__PURE__ */ (0, K.jsx)("span", {
									className: "hidden sm:inline text-[11px] text-canvas-text-muted/60 tabular-nums select-none",
									children: "↵ Enter"
								}),
								/* @__PURE__ */ (0, K.jsx)("div", {
									className: "flex h-7 w-7 items-center justify-center",
									children: /* @__PURE__ */ (0, K.jsx)(yt, { usage: m ?? null })
								}),
								l && u && o.trim() && !h && /* @__PURE__ */ (0, K.jsx)("button", {
									type: "button",
									onClick: u,
									"aria-label": v("调整当前任务"),
									title: v("在下一个安全步骤调整当前任务"),
									className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-canvas-border\n                           bg-canvas-surface text-canvas-text-secondary transition-[color,background-color,border-color]\n                           hover:border-brand/40 hover:bg-brand/10 hover:text-brand-light\n                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/70",
									children: /* @__PURE__ */ (0, K.jsx)(B, {
										icon: "mdi:source-branch-sync",
										width: "16",
										height: "16"
									})
								}),
								/* @__PURE__ */ (0, K.jsx)(I, {
									scale: 1.05,
									disabled: !o.trim() || h,
									"aria-label": v(l ? "将消息加入队列" : "发送消息"),
									title: v(l ? "当前任务完成后发送" : "发送消息"),
									className: `chat-panel-send-btn flex shrink-0 items-center justify-center h-8 w-8 rounded-full
                          transition-[color,background-color,box-shadow,opacity,transform] duration-200 active:scale-95
                          motion-reduce:transform-none
                          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/70
                          ${o.trim() && !h ? "bg-brand text-white hover:bg-brand-light shadow-lg shadow-brand/30" : "bg-canvas-hover text-canvas-text-muted cursor-not-allowed"}`,
									onClick: c,
									children: /* @__PURE__ */ (0, K.jsx)(B, {
										icon: l ? "mdi:playlist-plus" : "mdi:arrow-up",
										width: "18",
										height: "18"
									})
								})
							]
						})
					]
				})
			]
		}), /* @__PURE__ */ (0, K.jsx)("div", {
			className: "flex min-h-5 items-center justify-center",
			children: /* @__PURE__ */ (0, K.jsx)("p", {
				className: "chat-panel-disclaimer text-[11px] text-canvas-text-muted/75",
				children: v("重要操作执行前会请求确认")
			})
		})]
	});
}
//#endregion
//#region src/components/chat/ProjectMemoryPanel.tsx
var tn = {
	constraint: "bg-red-400/15 text-red-300",
	decision: "bg-indigo-400/15 text-indigo-300",
	preference: "bg-emerald-400/15 text-emerald-300",
	fact: "bg-sky-400/15 text-sky-300"
};
function nn(e) {
	let t = new Date(e), n = (e) => `${e}`.padStart(2, "0");
	return `${t.getFullYear()}-${n(t.getMonth() + 1)}-${n(t.getDate())} ${n(t.getHours())}:${n(t.getMinutes())}`;
}
function rn({ memory: e, onUpdate: t, onDelete: n }) {
	let a = r(), [o, s] = (0, G.useState)(!1), [c, l] = (0, G.useState)(e.content);
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: `rounded-lg border border-canvas-border p-2.5 ${e.enabled ? "" : "opacity-60"}`,
		children: [
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ (0, K.jsx)("span", {
					className: `text-[10px] px-1.5 py-0.5 rounded font-medium ${tn[e.kind]}`,
					children: a(i[e.kind])
				}), /* @__PURE__ */ (0, K.jsx)("span", {
					className: "text-[10px] text-canvas-text-muted ml-auto",
					children: nn(e.updatedAt)
				})]
			}),
			o ? /* @__PURE__ */ (0, K.jsxs)("div", {
				className: "mt-2",
				children: [/* @__PURE__ */ (0, K.jsx)("textarea", {
					value: c,
					onChange: (e) => l(e.target.value),
					maxLength: 500,
					rows: 3,
					className: "w-full resize-none rounded-md bg-canvas-bg border border-canvas-border px-2 py-1.5 text-xs text-canvas-text focus:outline-none focus:border-indigo-400"
				}), /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "mt-1.5 flex justify-end gap-2",
					children: [/* @__PURE__ */ (0, K.jsx)("button", {
						type: "button",
						onClick: () => {
							l(e.content), s(!1);
						},
						className: "rounded-md px-2 py-1 text-[11px] text-canvas-text-secondary hover:bg-canvas-hover",
						children: a("取消")
					}), /* @__PURE__ */ (0, K.jsx)("button", {
						type: "button",
						onClick: () => {
							let n = c.trim();
							n && n !== e.content && t(e.id, { content: n }), s(!1);
						},
						className: "rounded-md bg-indigo-500 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-400",
						children: a("保存")
					})]
				})]
			}) : /* @__PURE__ */ (0, K.jsx)("p", {
				className: "mt-1.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-canvas-text",
				children: e.content
			}),
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "mt-2 flex items-center gap-3 text-[10px] text-canvas-text-muted",
				children: [/* @__PURE__ */ (0, K.jsxs)("span", {
					className: "flex items-center gap-1",
					children: [/* @__PURE__ */ (0, K.jsx)(B, {
						icon: e.source.unavailable ? "mdi:link-variant-off" : "mdi:message-text-outline",
						width: "12"
					}), e.source.unavailable ? a("来源对话已删除") : a("来自对话")]
				}), /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "ml-auto flex items-center gap-1",
					children: [
						/* @__PURE__ */ (0, K.jsx)("button", {
							type: "button",
							onClick: () => t(e.id, { enabled: !e.enabled }),
							className: "rounded px-1.5 py-0.5 hover:bg-canvas-hover hover:text-canvas-text",
							title: e.enabled ? a("禁用（不再发送给模型）") : a("启用"),
							children: /* @__PURE__ */ (0, K.jsx)(B, {
								icon: e.enabled ? "mdi:eye-outline" : "mdi:eye-off-outline",
								width: "14"
							})
						}),
						!o && /* @__PURE__ */ (0, K.jsx)("button", {
							type: "button",
							onClick: () => {
								l(e.content), s(!0);
							},
							className: "rounded px-1.5 py-0.5 hover:bg-canvas-hover hover:text-canvas-text",
							title: a("编辑"),
							children: /* @__PURE__ */ (0, K.jsx)(B, {
								icon: "mdi:pencil-outline",
								width: "14"
							})
						}),
						/* @__PURE__ */ (0, K.jsx)("button", {
							type: "button",
							onClick: () => n(e.id),
							className: "rounded px-1.5 py-0.5 hover:bg-red-400/10 hover:text-red-400",
							title: a("删除"),
							children: /* @__PURE__ */ (0, K.jsx)(B, {
								icon: "mdi:trash-can-outline",
								width: "14"
							})
						})
					]
				})]
			})
		]
	});
}
function an({ memories: e, onUpdate: t, onDelete: n, onClose: i }) {
	let a = r(), o = [...e].sort((e, t) => t.updatedAt - e.updatedAt);
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "absolute inset-0 z-10 flex flex-col bg-canvas-bg",
		children: [/* @__PURE__ */ (0, K.jsxs)("div", {
			className: "flex items-center justify-between border-b border-canvas-border px-4 py-3",
			children: [/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [
					/* @__PURE__ */ (0, K.jsx)(B, {
						icon: "mdi:brain",
						width: "16",
						className: "text-indigo-400"
					}),
					/* @__PURE__ */ (0, K.jsx)("span", {
						className: "text-sm font-medium text-canvas-text",
						children: a("项目记忆")
					}),
					/* @__PURE__ */ (0, K.jsx)("span", {
						className: "text-[11px] text-canvas-text-muted",
						children: a("{count} 条", { count: o.length })
					})
				]
			}), /* @__PURE__ */ (0, K.jsx)(R, { onClick: i })]
		}), /* @__PURE__ */ (0, K.jsx)("div", {
			className: "flex-1 space-y-2 overflow-y-auto p-3",
			children: o.length === 0 ? /* @__PURE__ */ (0, K.jsxs)("div", {
				className: "flex h-full flex-col items-center justify-center gap-2 text-center text-canvas-text-muted",
				children: [
					/* @__PURE__ */ (0, K.jsx)(B, {
						icon: "mdi:brain",
						width: "32",
						className: "opacity-40"
					}),
					/* @__PURE__ */ (0, K.jsx)("p", {
						className: "text-xs",
						children: a("还没有项目记忆")
					}),
					/* @__PURE__ */ (0, K.jsxs)("p", {
						className: "text-[11px] leading-4",
						children: [
							a("对话中助手会在你确认后保存偏好、事实、约束和决定，"),
							/* @__PURE__ */ (0, K.jsx)("br", {}),
							a("之后的对话会自动参考这些记忆。")
						]
					})
				]
			}) : o.map((e) => /* @__PURE__ */ (0, K.jsx)(rn, {
				memory: e,
				onUpdate: t,
				onDelete: n
			}, e.id))
		})]
	});
}
//#endregion
//#region src/components/settings/SubAgentSettings.tsx
function on() {
	return {
		name: "",
		description: "",
		skillId: void 0,
		instructions: "",
		materials: ["mentioned_nodes"],
		maxRounds: x.defaultRounds
	};
}
function sn({ profiles: e, onEdit: t, onDuplicate: n, onDelete: i }) {
	let a = r();
	return /* @__PURE__ */ (0, K.jsx)("div", {
		className: "space-y-2",
		children: e.map((e) => /* @__PURE__ */ (0, K.jsx)("div", {
			className: "rounded-lg border border-canvas-border bg-canvas-card p-3",
			children: /* @__PURE__ */ (0, K.jsxs)("div", {
				className: "flex items-start justify-between gap-3",
				children: [/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "min-w-0 flex-1",
					children: [
						/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "flex items-center gap-2",
							children: [/* @__PURE__ */ (0, K.jsx)("span", {
								className: "truncate text-xs font-medium text-canvas-text",
								children: e.name
							}), e.builtIn && /* @__PURE__ */ (0, K.jsx)("span", {
								className: "shrink-0 rounded bg-canvas-hover px-1.5 py-0.5 text-[10px] text-canvas-text-muted",
								children: a("内置")
							})]
						}),
						/* @__PURE__ */ (0, K.jsx)("p", {
							className: "mt-1 line-clamp-2 text-[11px] text-canvas-text-secondary",
							children: e.description || a("（未填写说明）")
						}),
						/* @__PURE__ */ (0, K.jsxs)("p", {
							className: "mt-1 text-[10px] text-canvas-text-muted",
							children: [
								a("材料："),
								e.materials.map((e) => a(v[e])).join("、"),
								" · ",
								a("最多 {count} 轮", { count: e.maxRounds }),
								e.skillId ? a(" · 绑定 Skill") : ""
							]
						})
					]
				}), /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "flex shrink-0 items-center gap-1",
					children: [/* @__PURE__ */ (0, K.jsx)(I, {
						onClick: () => n(e),
						className: "rounded p-1.5 text-canvas-text-muted hover:bg-canvas-hover",
						title: a("复制为自定义副本"),
						"aria-label": a("复制 {name}", { name: e.name }),
						children: /* @__PURE__ */ (0, K.jsx)(B, {
							icon: "mdi:content-copy",
							width: "14"
						})
					}), !e.builtIn && /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [/* @__PURE__ */ (0, K.jsx)(I, {
						onClick: () => t(e),
						className: "rounded p-1.5 text-canvas-text-muted hover:bg-canvas-hover",
						title: a("编辑"),
						"aria-label": a("编辑 {name}", { name: e.name }),
						children: /* @__PURE__ */ (0, K.jsx)(B, {
							icon: "mdi:pencil",
							width: "14"
						})
					}), /* @__PURE__ */ (0, K.jsx)(I, {
						onClick: () => i(e),
						className: "rounded p-1.5 text-canvas-text-muted hover:bg-red-500/10 hover:text-red-500",
						title: a("删除"),
						"aria-label": a("删除 {name}", { name: e.name }),
						children: /* @__PURE__ */ (0, K.jsx)(B, {
							icon: "mdi:trash-can-outline",
							width: "14"
						})
					})] })]
				})]
			})
		}, e.id))
	});
}
function cn({ hideHeading: e } = {}) {
	let t = r(), n = D((e) => e.subAgentProfiles), i = D((e) => e.userSkills), a = D((e) => e.createSubAgentProfile), o = D((e) => e.updateSubAgentProfile), s = D((e) => e.deleteSubAgentProfile), l = D((e) => e.showToast), [u, d] = (0, G.useState)(null), [f, m] = (0, G.useState)(null), [h, g] = (0, G.useState)(""), _ = (0, G.useMemo)(() => k(n), [n]), y = () => {
		d("new"), m(on()), g("");
	}, b = (e) => {
		d(e.id), m({
			name: e.name,
			description: e.description,
			skillId: e.skillId,
			instructions: e.instructions ?? "",
			materials: [...e.materials],
			maxRounds: e.maxRounds
		}), g("");
	}, S = (e) => {
		d("new"), m(p(e)), g("");
	}, C = () => {
		d(null), m(null), g("");
	}, w = async () => {
		if (f) try {
			u === "new" ? l(t("已创建子智能体「{name}」", { name: (await a(f)).name })) : u && (await o(u, f), l(t("子智能体已更新"))), C();
		} catch (e) {
			g(e instanceof c || e instanceof Error ? e.message : t("保存失败"));
		}
	}, T = async (e) => {
		try {
			await s(e.id), l(t("已删除「{name}」", { name: e.name })), u === e.id && C();
		} catch (e) {
			l(e instanceof Error ? e.message : t("删除失败"), "error");
		}
	}, O = (e) => {
		if (!f) return;
		let t = f.materials.includes(e);
		m({
			...f,
			materials: t ? f.materials.filter((t) => t !== e) : [...f.materials, e]
		});
	};
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "space-y-4",
		children: [
			/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "space-y-1.5",
				children: [/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "flex items-center justify-between gap-3",
					children: [e ? /* @__PURE__ */ (0, K.jsx)("span", {}) : /* @__PURE__ */ (0, K.jsx)("h3", {
						className: "text-sm font-medium text-canvas-text",
						children: t("子智能体")
					}), /* @__PURE__ */ (0, K.jsxs)(I, {
						onClick: y,
						className: "flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-light",
						children: [/* @__PURE__ */ (0, K.jsx)(B, {
							icon: "mdi:plus",
							width: "14"
						}), t("新建")]
					})]
				}), /* @__PURE__ */ (0, K.jsx)("p", {
					className: "text-[11px] leading-relaxed text-canvas-text-muted",
					children: t("主任务可以并行派出这些只读子智能体做领域分工。它们只能读取你 @ 引用的节点正文和项目短剧资产，不能修改画布或生成媒体；产出需要落地时仍由主任务操作并经你确认。")
				})]
			}),
			/* @__PURE__ */ (0, K.jsx)(sn, {
				profiles: _,
				onEdit: b,
				onDuplicate: S,
				onDelete: (e) => void T(e)
			}),
			f && /* @__PURE__ */ (0, K.jsxs)("div", {
				className: "space-y-3 rounded-lg border border-brand/30 bg-canvas-card p-3",
				children: [
					/* @__PURE__ */ (0, K.jsx)("h4", {
						className: "text-xs font-medium text-canvas-text",
						children: t(u === "new" ? "新建子智能体" : "编辑子智能体")
					}),
					/* @__PURE__ */ (0, K.jsxs)("label", {
						className: "block space-y-1",
						children: [/* @__PURE__ */ (0, K.jsx)("span", {
							className: "text-[11px] text-canvas-text-secondary",
							children: t("名称")
						}), /* @__PURE__ */ (0, K.jsx)("input", {
							value: f.name,
							onChange: (e) => m({
								...f,
								name: e.target.value
							}),
							maxLength: x.nameChars,
							placeholder: t("例如：台词润色师"),
							className: "w-full rounded-md border border-canvas-border bg-canvas-surface px-2.5 py-1.5 text-xs text-canvas-text"
						})]
					}),
					/* @__PURE__ */ (0, K.jsxs)("label", {
						className: "block space-y-1",
						children: [/* @__PURE__ */ (0, K.jsx)("span", {
							className: "text-[11px] text-canvas-text-secondary",
							children: t("何时派它（会展示给模型判断）")
						}), /* @__PURE__ */ (0, K.jsx)("input", {
							value: f.description,
							onChange: (e) => m({
								...f,
								description: e.target.value
							}),
							maxLength: x.descriptionChars,
							placeholder: t("例如：需要把书面台词改得更口语时"),
							className: "w-full rounded-md border border-canvas-border bg-canvas-surface px-2.5 py-1.5 text-xs text-canvas-text"
						})]
					}),
					/* @__PURE__ */ (0, K.jsxs)("label", {
						className: "block space-y-1",
						children: [/* @__PURE__ */ (0, K.jsx)("span", {
							className: "text-[11px] text-canvas-text-secondary",
							children: t("绑定 Skill（可选）")
						}), /* @__PURE__ */ (0, K.jsxs)("select", {
							value: f.skillId ?? "",
							onChange: (e) => m({
								...f,
								skillId: e.target.value || void 0
							}),
							className: "w-full rounded-md border border-canvas-border bg-canvas-surface px-2.5 py-1.5 text-xs text-canvas-text",
							children: [/* @__PURE__ */ (0, K.jsx)("option", {
								value: "",
								children: t("不绑定，使用下方提示词")
							}), i.map((e) => /* @__PURE__ */ (0, K.jsx)("option", {
								value: e.id,
								children: e.name
							}, e.id))]
						})]
					}),
					/* @__PURE__ */ (0, K.jsxs)("label", {
						className: "block space-y-1",
						children: [/* @__PURE__ */ (0, K.jsx)("span", {
							className: "text-[11px] text-canvas-text-secondary",
							children: t("角色提示词（未绑定 Skill 时必填）")
						}), /* @__PURE__ */ (0, K.jsx)("textarea", {
							value: f.instructions ?? "",
							onChange: (e) => m({
								...f,
								instructions: e.target.value
							}),
							maxLength: x.instructionsChars,
							rows: 5,
							placeholder: t("描述这个角色的分析框架和输出格式"),
							className: "w-full resize-y rounded-md border border-canvas-border bg-canvas-surface px-2.5 py-1.5 text-xs text-canvas-text"
						})]
					}),
					/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "space-y-1",
						children: [
							/* @__PURE__ */ (0, K.jsx)("span", {
								className: "text-[11px] text-canvas-text-secondary",
								children: t("可读材料")
							}),
							/* @__PURE__ */ (0, K.jsx)("div", {
								className: "flex flex-wrap gap-2",
								children: E.map((e) => /* @__PURE__ */ (0, K.jsx)(I, {
									onClick: () => O(e),
									className: `rounded-md px-2.5 py-1.5 text-[11px] transition-colors ${f.materials.includes(e) ? "bg-brand text-white" : "bg-canvas-hover text-canvas-text-muted"}`,
									children: t(v[e])
								}, e))
							}),
							f.materials.length === 0 && /* @__PURE__ */ (0, K.jsx)("p", {
								className: "text-[10px] text-amber-400",
								children: t("至少勾选一项，否则子智能体拿不到任何材料。")
							})
						]
					}),
					/* @__PURE__ */ (0, K.jsxs)("label", {
						className: "block space-y-1",
						children: [/* @__PURE__ */ (0, K.jsx)("span", {
							className: "text-[11px] text-canvas-text-secondary",
							children: t("最大轮数（{min}–{max}，越大越贵）", {
								min: x.minRounds,
								max: x.maxRounds
							})
						}), /* @__PURE__ */ (0, K.jsx)("input", {
							type: "number",
							min: x.minRounds,
							max: x.maxRounds,
							value: f.maxRounds,
							onChange: (e) => m({
								...f,
								maxRounds: Number(e.target.value)
							}),
							className: "w-24 rounded-md border border-canvas-border bg-canvas-surface px-2.5 py-1.5 text-xs text-canvas-text"
						})]
					}),
					h && /* @__PURE__ */ (0, K.jsx)("p", {
						className: "text-[11px] text-red-500",
						children: h
					}),
					/* @__PURE__ */ (0, K.jsxs)("div", {
						className: "flex items-center gap-2",
						children: [/* @__PURE__ */ (0, K.jsx)(I, {
							onClick: () => void w(),
							className: "rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-light",
							children: t("保存")
						}), /* @__PURE__ */ (0, K.jsx)(I, {
							onClick: C,
							className: "rounded-lg px-3 py-1.5 text-xs text-canvas-text-secondary hover:bg-canvas-hover",
							children: t("取消")
						})]
					})
				]
			})
		]
	});
}
//#endregion
//#region src/components/chat/SubAgentPanel.tsx
function ln({ onClose: e }) {
	let t = r(), n = k(D((e) => e.subAgentProfiles)).length;
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "absolute inset-0 z-10 flex flex-col bg-canvas-bg",
		children: [/* @__PURE__ */ (0, K.jsxs)("div", {
			className: "flex items-center justify-between border-b border-canvas-border px-4 py-3",
			children: [/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [
					/* @__PURE__ */ (0, K.jsx)(B, {
						icon: "lucide:users-round",
						width: "16",
						className: "text-brand"
					}),
					/* @__PURE__ */ (0, K.jsx)("span", {
						className: "text-sm font-medium text-canvas-text",
						children: t("子智能体")
					}),
					/* @__PURE__ */ (0, K.jsx)("span", {
						className: "text-[11px] text-canvas-text-muted",
						children: t("{count} 个", { count: n })
					})
				]
			}), /* @__PURE__ */ (0, K.jsx)(R, { onClick: e })]
		}), /* @__PURE__ */ (0, K.jsx)("div", {
			className: "flex-1 overflow-y-auto overflow-x-hidden p-3",
			children: /* @__PURE__ */ (0, K.jsx)(cn, { hideHeading: !0 })
		})]
	});
}
//#endregion
//#region src/components/chat/AgentCenterPanel.tsx
var un = {
	ready: "可用",
	degraded: "受限",
	invalid: "无效",
	missing: "来源丢失"
}, dn = {
	ready: "bg-emerald-400/10 text-emerald-300",
	degraded: "bg-amber-400/10 text-amber-300",
	invalid: "bg-red-400/10 text-red-300",
	missing: "bg-red-400/10 text-red-300"
};
function fn(e) {
	if (!Number.isFinite(e) || e <= 0) return "0 B";
	if (e < 1024) return `${e} B`;
	let t = [
		"KB",
		"MB",
		"GB"
	], n = e / 1024, r = 0;
	for (; n >= 1024 && r < t.length - 1;) n /= 1024, r += 1;
	return `${n >= 10 ? n.toFixed(0) : n.toFixed(1)} ${t[r]}`;
}
function pn({ installation: e, busy: t, allowInstall: n, onToggle: i, onToggleMcpSkillRead: a, onRemove: o }) {
	let s = r(), c = e.manifest.name || e.source.displayName;
	return /* @__PURE__ */ (0, K.jsx)("article", {
		className: "rounded-xl border border-canvas-border bg-canvas-card p-3",
		children: /* @__PURE__ */ (0, K.jsxs)("div", {
			className: "flex items-start gap-3",
			children: [
				/* @__PURE__ */ (0, K.jsx)("span", {
					className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-300",
					children: /* @__PURE__ */ (0, K.jsx)(B, {
						icon: "lucide:bot",
						width: "18",
						height: "18"
					})
				}),
				/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "min-w-0 flex-1",
					children: [
						/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "flex flex-wrap items-center gap-1.5",
							children: [
								/* @__PURE__ */ (0, K.jsx)("h4", {
									className: "truncate text-sm font-medium text-canvas-text",
									children: c
								}),
								/* @__PURE__ */ (0, K.jsxs)("span", {
									className: "rounded bg-canvas-surface px-1.5 py-0.5 text-[10px] text-canvas-text-muted",
									children: ["v", e.manifest.version]
								}),
								/* @__PURE__ */ (0, K.jsx)("span", {
									className: `rounded px-1.5 py-0.5 text-[10px] ${dn[e.health]}`,
									children: s(un[e.health])
								})
							]
						}),
						e.manifest.description && /* @__PURE__ */ (0, K.jsx)("p", {
							className: "mt-1 line-clamp-2 text-[11px] leading-4 text-canvas-text-secondary",
							children: e.manifest.description
						}),
						/* @__PURE__ */ (0, K.jsxs)("p", {
							className: "mt-1.5 text-[10px] leading-4 text-canvas-text-muted",
							children: [
								e.source.sourceType === "folder" ? s("链接文件夹") : s("托管压缩包"),
								" · ",
								s("{count} 个 Skill", { count: e.skillCount }),
								" · ",
								s("{count} 个文件", { count: e.fileCount }),
								" · ",
								fn(e.totalBytes)
							]
						}),
						e.warnings.length > 0 && /* @__PURE__ */ (0, K.jsxs)("div", {
							className: "mt-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-2.5 py-2 text-[10px] leading-4 text-amber-200",
							children: [/* @__PURE__ */ (0, K.jsxs)("div", {
								className: "mb-1 flex items-center gap-1 font-medium",
								children: [/* @__PURE__ */ (0, K.jsx)(B, {
									icon: "mdi:alert-outline",
									width: "12"
								}), s("{count} 条预检提醒", { count: e.warnings.length })]
							}), /* @__PURE__ */ (0, K.jsx)("ul", {
								className: "list-disc space-y-0.5 pl-4",
								children: e.warnings.slice(0, 3).map((t, n) => /* @__PURE__ */ (0, K.jsx)("li", {
									className: "break-words",
									children: t
								}, `${e.id}-warning-${n}`))
							})]
						}),
						n && /* @__PURE__ */ (0, K.jsxs)("div", {
							className: "mt-2 flex items-start justify-between gap-3 rounded-lg border border-canvas-border bg-canvas-surface px-2.5 py-2",
							children: [/* @__PURE__ */ (0, K.jsxs)("div", {
								className: "min-w-0",
								children: [/* @__PURE__ */ (0, K.jsx)("p", {
									className: "text-[11px] font-medium text-canvas-text-secondary",
									children: s("MCP 只读")
								}), /* @__PURE__ */ (0, K.jsx)("p", {
									className: "mt-0.5 text-[10px] leading-4 text-canvas-text-muted",
									children: s("仅允许 MCP 客户端列出、加载和读取该智能体中的 Skill，不会执行包内脚本。")
								})]
							}), /* @__PURE__ */ (0, K.jsx)("button", {
								type: "button",
								role: "switch",
								"aria-checked": e.enabled && e.mcpSkillReadEnabled,
								"aria-label": e.mcpSkillReadEnabled ? s("禁止 MCP 读取智能体 {name} 的 Skill", { name: c }) : s("允许 MCP 读取智能体 {name} 的 Skill", { name: c }),
								disabled: t || !e.enabled,
								onClick: a,
								className: `shrink-0 rounded-md px-2 py-1 text-[10px] transition-colors disabled:cursor-not-allowed disabled:opacity-40 ${e.enabled && e.mcpSkillReadEnabled ? "bg-indigo-500/10 text-indigo-300 hover:bg-indigo-500/15" : "bg-canvas-card text-canvas-text-muted hover:bg-canvas-hover"}`,
								children: s(e.enabled && e.mcpSkillReadEnabled ? "已允许" : "未允许")
							})]
						})
					]
				}),
				n && /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "flex shrink-0 flex-col items-end gap-1",
					children: [/* @__PURE__ */ (0, K.jsx)("button", {
						type: "button",
						role: "switch",
						"aria-checked": e.enabled,
						"aria-label": e.enabled ? s("停用智能体 {name}", { name: c }) : s("启用智能体 {name}", { name: c }),
						disabled: t,
						onClick: i,
						className: `rounded-md px-2 py-1 text-[11px] transition-colors disabled:cursor-wait disabled:opacity-50 ${e.enabled ? "bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15" : "bg-canvas-surface text-canvas-text-muted hover:bg-canvas-hover"}`,
						children: s(e.enabled ? "已启用" : "已停用")
					}), /* @__PURE__ */ (0, K.jsx)("button", {
						type: "button",
						disabled: t,
						onClick: o,
						"aria-label": s("移除智能体 {name}", { name: c }),
						className: "flex h-7 w-7 items-center justify-center rounded-md text-canvas-text-muted transition-colors\n                         hover:bg-red-400/10 hover:text-red-300 disabled:cursor-wait disabled:opacity-50",
						children: /* @__PURE__ */ (0, K.jsx)(B, {
							icon: "mdi:trash-can-outline",
							width: "14"
						})
					})]
				})
			]
		})
	});
}
function mn({ onClose: e, allowInstall: t = !1 }) {
	let n = r(), i = D((e) => e.agentPackages), a = D((e) => e.agentCatalogStatus), o = D((e) => e.agentCatalogErrorCode), s = D((e) => e.agentPackageSkillCatalogErrorCode), c = D((e) => e.installAgentPackagePreview), l = D((e) => e.setAgentPackageEnabled), u = D((e) => e.setAgentPackageMcpSkillReadEnabled), d = D((e) => e.removeAgentPackageRecord), f = D((e) => e.showToast), [p, m] = (0, G.useState)(null), [h, g] = (0, G.useState)(""), v = async (e) => {
		try {
			await _(e);
		} catch {
			console.warn("[Agent Center] 智能体来源清理失败");
		}
	}, y = async (e) => {
		if (!t || p) return;
		m(`import:${e}`), g("");
		let r = null, i = !1;
		try {
			let t = D.getState().agentPackages;
			if (r = e === "folder" ? await w() : await b(), !r) return;
			i = t.some((e) => e.source.sourceId === r?.sourceId);
			let a = await c(r), o = t.find((e) => e.id === a.id);
			o && o.source.sourceId !== a.source.sourceId && await v(o.source.sourceId), f(n("已安装智能体「{name}」", { name: r.name }));
		} catch (e) {
			r && !i && await v(r.sourceId);
			let t = e instanceof Error ? e.message : n("智能体上传失败");
			g(t), f(t, "error");
		} finally {
			m(null);
		}
	}, x = async (e) => {
		if (!(!t || p)) {
			m(`toggle:${e.id}`), g("");
			try {
				await l(e.id, !e.enabled);
			} catch (e) {
				let t = e instanceof Error ? e.message : n("智能体状态保存失败");
				g(t), f(t, "error");
			} finally {
				m(null);
			}
		}
	}, S = async (e) => {
		if (!t || p) return;
		let r = e.manifest.name || e.source.displayName;
		if (await F(n("确定从软件中移除智能体「{name}」？外部文件不会被删除。", { name: r }), { title: "移除智能体" })) {
			m(`remove:${e.id}`), g("");
			try {
				await d(e.id), await v(e.source.sourceId), f(n("已移除智能体「{name}」", { name: r }));
			} catch (e) {
				let t = e instanceof Error ? e.message : n("移除智能体失败");
				g(t), f(t, "error");
			} finally {
				m(null);
			}
		}
	}, C = async (e) => {
		if (!(!t || p || !e.enabled)) {
			m(`mcp:${e.id}`), g("");
			try {
				await u(e.id, !e.mcpSkillReadEnabled);
			} catch (e) {
				let t = e instanceof Error ? e.message : n("智能体 MCP 权限保存失败");
				g(t), f(t, "error");
			} finally {
				m(null);
			}
		}
	};
	return /* @__PURE__ */ (0, K.jsxs)("div", {
		className: "absolute inset-0 z-10 flex flex-col bg-canvas-bg",
		children: [/* @__PURE__ */ (0, K.jsxs)("div", {
			className: "flex items-center justify-between border-b border-canvas-border px-4 py-3",
			children: [/* @__PURE__ */ (0, K.jsxs)("div", {
				className: "flex min-w-0 items-center gap-2",
				children: [
					/* @__PURE__ */ (0, K.jsx)(B, {
						icon: "lucide:bot",
						width: "16",
						className: "shrink-0 text-brand"
					}),
					/* @__PURE__ */ (0, K.jsx)("span", {
						className: "truncate text-sm font-medium text-canvas-text",
						children: n("智能体中心")
					}),
					/* @__PURE__ */ (0, K.jsx)("span", {
						className: "shrink-0 text-[11px] text-canvas-text-muted",
						children: n("{count} 个已安装", { count: i.length })
					})
				]
			}), /* @__PURE__ */ (0, K.jsx)(R, { onClick: e })]
		}), /* @__PURE__ */ (0, K.jsxs)("div", {
			className: "flex-1 space-y-3 overflow-y-auto overflow-x-hidden p-3",
			children: [
				/* @__PURE__ */ (0, K.jsx)("section", {
					className: "rounded-xl border border-indigo-400/20 bg-indigo-400/5 p-3",
					children: /* @__PURE__ */ (0, K.jsxs)("div", {
						className: "flex items-start gap-3",
						children: [/* @__PURE__ */ (0, K.jsx)("span", {
							className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300",
							children: /* @__PURE__ */ (0, K.jsx)(B, {
								icon: "mdi:creation-outline",
								width: "18"
							})
						}), /* @__PURE__ */ (0, K.jsxs)("div", {
							className: "min-w-0 flex-1",
							children: [/* @__PURE__ */ (0, K.jsxs)("div", {
								className: "flex flex-wrap items-center gap-1.5",
								children: [/* @__PURE__ */ (0, K.jsx)("h4", {
									className: "text-sm font-medium text-canvas-text",
									children: n("默认助手")
								}), /* @__PURE__ */ (0, K.jsx)("span", {
									className: "rounded bg-emerald-400/10 px-1.5 py-0.5 text-[10px] text-emerald-300",
									children: n("始终可用")
								})]
							}), /* @__PURE__ */ (0, K.jsx)("p", {
								className: "mt-1 text-[11px] leading-4 text-canvas-text-secondary",
								children: n("不安装智能体也能继续使用聊天、画布、工作流和模型功能。")
							})]
						})]
					})
				}),
				t && /* @__PURE__ */ (0, K.jsxs)("section", {
					className: "rounded-xl border border-canvas-border bg-canvas-card p-3",
					children: [
						/* @__PURE__ */ (0, K.jsx)("h3", {
							className: "text-xs font-medium text-canvas-text",
							children: n("上传智能体")
						}),
						/* @__PURE__ */ (0, K.jsx)("p", {
							className: "mt-1 text-[11px] leading-4 text-canvas-text-muted",
							children: n("文件夹会保持只读链接；压缩包会导入软件管理目录。上传只做预检，不会执行包内脚本。")
						}),
						/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "mt-3 grid grid-cols-2 gap-2",
							children: [/* @__PURE__ */ (0, K.jsxs)(I, {
								type: "button",
								disabled: p !== null,
								onClick: () => void y("folder"),
								className: "flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border border-canvas-border\n                           bg-canvas-surface px-3 py-2 text-xs text-canvas-text-secondary hover:border-brand/40 hover:text-canvas-text\n                           disabled:cursor-wait disabled:opacity-50",
								children: [/* @__PURE__ */ (0, K.jsx)(B, {
									icon: p === "import:folder" ? "mdi:loading" : "mdi:folder-plus-outline",
									width: "20",
									className: p === "import:folder" ? "animate-spin" : ""
								}), n("选择文件夹")]
							}), /* @__PURE__ */ (0, K.jsxs)(I, {
								type: "button",
								disabled: p !== null,
								onClick: () => void y("archive"),
								className: "flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border border-canvas-border\n                           bg-canvas-surface px-3 py-2 text-xs text-canvas-text-secondary hover:border-brand/40 hover:text-canvas-text\n                           disabled:cursor-wait disabled:opacity-50",
								children: [/* @__PURE__ */ (0, K.jsx)(B, {
									icon: p === "import:archive" ? "mdi:loading" : "mdi:archive-arrow-up-outline",
									width: "20",
									className: p === "import:archive" ? "animate-spin" : ""
								}), n("选择压缩包")]
							})]
						}),
						/* @__PURE__ */ (0, K.jsx)("p", {
							className: "mt-2 text-center text-[10px] text-canvas-text-muted",
							children: n("支持 .aicanvas-agent、.tgz 和 .tar.gz")
						})
					]
				}),
				(h || o || s) && /* @__PURE__ */ (0, K.jsx)("div", {
					role: "alert",
					className: "rounded-lg border border-red-400/20 bg-red-400/5 px-3 py-2 text-[11px] leading-4 text-red-300",
					children: h || n("智能体目录当前受限（{code}）", { code: o || s || "unknown" })
				}),
				a === "loading" && i.length === 0 ? /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "flex items-center justify-center gap-2 py-8 text-xs text-canvas-text-muted",
					children: [/* @__PURE__ */ (0, K.jsx)(B, {
						icon: "mdi:loading",
						width: "16",
						className: "animate-spin"
					}), n("正在读取智能体目录…")]
				}) : i.length === 0 ? /* @__PURE__ */ (0, K.jsxs)("div", {
					className: "rounded-xl border border-dashed border-canvas-border px-4 py-7 text-center",
					children: [
						/* @__PURE__ */ (0, K.jsx)(B, {
							icon: "lucide:bot-off",
							width: "28",
							className: "mx-auto text-canvas-text-muted/50"
						}),
						/* @__PURE__ */ (0, K.jsx)("p", {
							className: "mt-2 text-xs text-canvas-text-secondary",
							children: n("还没有安装外部智能体")
						}),
						/* @__PURE__ */ (0, K.jsx)("p", {
							className: "mt-1 text-[10px] leading-4 text-canvas-text-muted",
							children: n("这不会影响默认助手和软件其他功能。")
						})
					]
				}) : /* @__PURE__ */ (0, K.jsx)("section", {
					className: "space-y-2",
					children: i.map((e) => /* @__PURE__ */ (0, K.jsx)(pn, {
						installation: e,
						busy: p === `toggle:${e.id}` || p === `mcp:${e.id}` || p === `remove:${e.id}`,
						allowInstall: t,
						onToggle: () => void x(e),
						onToggleMcpSkillRead: () => void C(e),
						onRemove: () => void S(e)
					}, e.id))
				})
			]
		})]
	});
}
//#endregion
//#region src/components/chat/AgentTaskCenter.tsx
var hn = new Set([
	"completed",
	"failed",
	"stopped"
]);
function gn({ tasks: e, conversations: t, onClose: n, ...i }) {
	let a = r(), [o, s] = (0, G.useState)("active"), c = (0, G.useMemo)(() => new Map(t.map((e) => [e.id, e.title])), [t]), l = (0, G.useMemo)(() => e.filter((e) => o === "all" || !hn.has(e.status)).sort((e, t) => t.updatedAt - e.updatedAt), [e, o]), u = e.filter((e) => !hn.has(e.status)).length, d = (0, G.useMemo)(() => new Map(e.map((e) => [e.id, e.goal])), [e]), f = (0, G.useMemo)(() => {
		let t = /* @__PURE__ */ new Map();
		for (let n of e) n.parentTaskId && t.set(n.parentTaskId, (t.get(n.parentTaskId) ?? 0) + 1);
		return t;
	}, [e]);
	return /* @__PURE__ */ (0, K.jsxs)("section", {
		className: "agent-task-center flex min-h-0 flex-1 flex-col",
		"aria-label": a("Agent 任务中心"),
		children: [/* @__PURE__ */ (0, K.jsxs)("header", {
			className: "agent-task-center__header flex min-h-12 shrink-0 items-center gap-2 border-b px-3",
			children: [
				/* @__PURE__ */ (0, K.jsx)("button", {
					type: "button",
					onClick: n,
					"aria-label": a("返回对话"),
					title: a("返回对话"),
					className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-canvas-text-muted\n                     transition-colors hover:bg-canvas-hover hover:text-canvas-text\n                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
					children: /* @__PURE__ */ (0, K.jsx)(B, {
						icon: "mdi:arrow-left",
						width: "18"
					})
				}),
				/* @__PURE__ */ (0, K.jsx)(B, {
					icon: "mdi:progress-wrench",
					width: "17",
					className: "text-[var(--brand)]"
				}),
				/* @__PURE__ */ (0, K.jsx)("h2", {
					className: "text-sm font-semibold text-canvas-text",
					children: a("任务中心")
				}),
				/* @__PURE__ */ (0, K.jsx)("span", {
					className: "text-[11px] tabular-nums text-canvas-text-muted",
					children: a("{count} 运行中", { count: u })
				}),
				/* @__PURE__ */ (0, K.jsx)("div", {
					className: "agent-task-center__tabs ml-auto flex items-center rounded-md border p-0.5",
					role: "tablist",
					children: ["active", "all"].map((e) => /* @__PURE__ */ (0, K.jsx)("button", {
						type: "button",
						role: "tab",
						"aria-selected": o === e,
						onClick: () => s(e),
						className: `agent-task-center__tab min-h-7 rounded px-2 text-[11px] transition-colors ${o === e ? "is-active text-canvas-text" : "text-canvas-text-muted hover:text-canvas-text"}`,
						children: a(e === "active" ? "进行中" : "全部")
					}, e))
				})
			]
		}), /* @__PURE__ */ (0, K.jsx)("div", {
			className: "min-h-0 flex-1 overflow-y-auto",
			children: l.length === 0 ? /* @__PURE__ */ (0, K.jsxs)("div", {
				className: "flex h-full min-h-48 flex-col items-center justify-center gap-2 text-canvas-text-muted",
				children: [/* @__PURE__ */ (0, K.jsx)(B, {
					icon: "mdi:progress-check",
					width: "28"
				}), /* @__PURE__ */ (0, K.jsx)("p", {
					className: "text-xs",
					children: a(o === "active" ? "暂无进行中的任务" : "暂无任务")
				})]
			}) : l.map((e) => /* @__PURE__ */ (0, K.jsxs)("section", {
				className: `agent-task-center__item border-b px-3 py-3 ${e.parentTaskId ? "agent-task-center__item--child ml-4 border-l" : ""}`,
				children: [/* @__PURE__ */ (0, K.jsxs)("div", {
					className: "flex items-start gap-2",
					children: [
						e.parentTaskId && /* @__PURE__ */ (0, K.jsx)(B, {
							icon: e.expertRole ? "mdi:account-search-outline" : "mdi:account-multiple-outline",
							width: "15",
							className: "mt-0.5 shrink-0 text-[var(--success)]"
						}),
						/* @__PURE__ */ (0, K.jsxs)("div", {
							className: "min-w-0 flex-1",
							children: [
								/* @__PURE__ */ (0, K.jsx)("p", {
									className: "truncate text-xs font-medium text-canvas-text",
									children: e.expertRole ? he[e.expertRole] ?? e.goal : e.goal
								}),
								/* @__PURE__ */ (0, K.jsx)("p", {
									className: "mt-0.5 truncate text-[11px] text-canvas-text-muted",
									children: e.parentTaskId ? a("上级任务：{name}", { name: d.get(e.parentTaskId) ?? a("已删除任务") }) : c.get(e.conversationId) ?? a("已删除会话")
								}),
								!e.parentTaskId && (f.get(e.id) ?? 0) > 0 && /* @__PURE__ */ (0, K.jsx)("p", {
									className: "mt-0.5 text-[10px] text-[var(--success)]",
									children: a("{count} 个只读子任务", { count: f.get(e.id) ?? 0 })
								})
							]
						}),
						/* @__PURE__ */ (0, K.jsx)("time", {
							className: "shrink-0 text-[10px] tabular-nums text-canvas-text-muted",
							children: new Date(e.updatedAt).toLocaleTimeString([], {
								hour: "2-digit",
								minute: "2-digit"
							})
						})
					]
				}), /* @__PURE__ */ (0, K.jsx)(nt, {
					task: e,
					...i
				})]
			}, e.id))
		})]
	});
}
//#endregion
//#region src/services/chat/agentRewindService.ts
async function _n(e) {
	let t = D.getState(), n = t.agentTasks.find((t) => t.id === e);
	if (!n) return {
		ok: !1,
		errorCode: "AGENT_REWIND_TASK_NOT_FOUND",
		message: "任务不存在"
	};
	let r = _e(n, t.currentProjectId, t.historyIndex, t.getCurrentRevision());
	if (!r.ok || !r.undoCount) return r;
	for (let e = 0; e < r.undoCount; e += 1) await D.getState().undo();
	let i = D.getState().incrementRevision();
	return l(e, "canvas_rewind", {
		historyIndexBefore: r.lastCheckpoint?.historyIndexAfter,
		historyIndexAfter: D.getState().historyIndex,
		revisionBefore: r.lastCheckpoint?.revisionAfter,
		revisionAfter: i
	}), r;
}
//#endregion
//#region src/services/chat/detachedChatSyncController.ts
var vn = 150, yn = 5e3, bn = typeof window < "u" && "__TAURI__" in window, xn = null, Sn = [], Cn = /* @__PURE__ */ new Map(), wn = /* @__PURE__ */ new Map();
function Tn(e) {
	if (e === xn) return Sn;
	let t = e.length !== Sn.length, n = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map(), i = e.map((e, i) => {
		let a = wn.get(e.id), o = Cn.get(e.id) === e && a ? a : e.skillBindings?.length ? {
			...e,
			skillBindings: e.skillBindings.map((e) => ({
				skillId: e.skillId,
				name: e.name,
				version: e.version,
				content: "",
				allowedTools: e.allowedTools ? [...e.allowedTools] : void 0
			}))
		} : e;
		return o !== Sn[i] && (t = !0), n.set(e.id, e), r.set(e.id, o), o;
	});
	return xn = e, Cn = n, wn = r, t && (Sn = i), Sn;
}
function En(e, t, n, r) {
	return Object.fromEntries(e.map((e) => {
		if (e.workflowId) return [e.value, !0];
		if (e.provider === "general") {
			let r = t.find((t) => `general/${t.id}` === e.value), i = r ? n[r.providerConfigId] : void 0;
			return [e.value, !!i?.baseUrl && !!r?.modelId];
		}
		if (e.provider === "dreamina") return [e.value, r];
		let i = e.groupId === "runninghub" ? "runninghub-model" : e.groupId;
		return [e.value, !!n[i]?.apiKey];
	}));
}
var Dn = {
	x: 0,
	y: 0
}, On = null, kn = [], An = /* @__PURE__ */ new Map();
function jn(e, t) {
	return !!e && e.type === t.type && e.data.label === t.data.label && e.data.type === t.data.type && e.data.displayId === t.data.displayId && e.data.imageUrl === t.data.imageUrl && e.data.thumbnailUrl === t.data.thumbnailUrl;
}
function Mn(e) {
	if (e === On) return kn;
	On = e;
	let t = e.length !== kn.length, n = /* @__PURE__ */ new Map(), r = e.map((e, r) => {
		let i = An.get(e.id), a = jn(i, e) ? i : {
			id: e.id,
			type: e.type,
			position: Dn,
			data: {
				label: e.data.label,
				type: e.data.type,
				displayId: e.data.displayId,
				imageUrl: e.data.imageUrl,
				thumbnailUrl: e.data.thumbnailUrl
			}
		};
		return a !== kn[r] && (t = !0), n.set(e.id, a), a;
	});
	return t ? (kn = r, An = n, kn) : kn;
}
var Nn = null, Pn = {};
function Fn(e) {
	return e === Nn ? Pn : (Nn = e, Pn = En(P(e.generalModels ?? [], e), e.generalModels ?? [], e.providers, !!e.dreaminaAuth?.loggedIn), Pn);
}
function In(e) {
	let t = e.projects.find((t) => t.id === e.currentProjectId);
	return {
		conversations: e.conversations,
		activeConversationId: e.activeConversationId,
		messages: e.messages,
		agentTasks: Tn(e.agentTasks),
		projectId: e.currentProjectId,
		projectName: t?.name,
		generalModels: e.config.generalModels ?? [],
		assistantModelId: m(t?.settings, e.config.assistantModelId)[0],
		assistantImageModelId: e.config.assistantImageModelId,
		assistantVideoModelId: e.config.assistantVideoModelId,
		mediaModelAvailability: Fn(e.config),
		localFileGrants: e.activeConversationId ? C(e.activeConversationId) : [],
		nodes: Mn(e.nodes),
		dramaAssets: e.dramaAssets,
		skillOptions: S(e.userSkills, e.agentPackageSkills),
		composerDraft: e.chatComposerLiveDraft
	};
}
function Ln(e, t) {
	return e.chatPanelDetached !== t.chatPanelDetached || e.conversations !== t.conversations || e.activeConversationId !== t.activeConversationId || e.messages !== t.messages || e.agentTasks !== t.agentTasks || e.currentProjectId !== t.currentProjectId || e.projects !== t.projects || e.config !== t.config || e.nodes !== t.nodes || e.dramaAssets !== t.dramaAssets || e.userSkills !== t.userSkills || e.agentPackageSkills !== t.agentPackageSkills || e.chatComposerLiveDraft !== t.chatComposerLiveDraft;
}
function Rn(e, t) {
	let n = D.getState();
	switch (e.type) {
		case "send_message": {
			e.conversationId !== n.activeConversationId && n.setActiveConversation(e.conversationId);
			let t = n.conversations.find((t) => t.id === e.conversationId);
			fe({
				content: e.content,
				projectId: t?.projectId ?? n.currentProjectId ?? "",
				conversationId: e.conversationId,
				mode: t?.agentMode ?? "collaborative",
				dispatchMode: e.dispatchMode
			});
			break;
		}
		case "switch_conversation":
			n.setActiveConversation(e.conversationId), n.loadConversationMessages(e.conversationId);
			break;
		case "create_conversation":
			n.createConversation(e.projectId, e.title);
			break;
		case "rename_conversation":
			n.updateConversation(e.conversationId, {
				title: e.title,
				titleSource: "user"
			});
			break;
		case "toggle_pin": {
			let t = n.conversations.find((t) => t.id === e.conversationId);
			t && n.updateConversation(e.conversationId, { pinned: !t.pinned });
			break;
		}
		case "archive_conversation":
			n.updateConversation(e.conversationId, { archived: !0 });
			break;
		case "delete_conversation":
			u(e.conversationId), n.updateConversation(e.conversationId, { deletedAt: Date.now() }), n.removeConversation(e.conversationId);
			break;
		case "authorize_local_files":
			s(e.conversationId).then((e) => {
				n.showToast(e.length > 0 ? `已授权 ${e.length} 个文件` : "未新增文件授权", "info");
			}).catch((e) => n.showToast(e instanceof Error ? e.message : "文件授权失败", "error"));
			break;
		case "revoke_local_file":
			g(e.conversationId, e.grantId);
			break;
		case "set_agent_mode":
			n.updateConversation(e.conversationId, { agentMode: e.mode }), n.showToast(ge(e.mode), "info");
			break;
		case "resolve_agent_approval":
			pe(e.approvalId, e.resolution) || n.showToast("该确认已过期，请重新发起操作", "info");
			break;
		case "pause_agent_task":
			d(e.taskId), O(e.taskId);
			break;
		case "resume_agent_task": {
			let t = U(e.taskId);
			t.ok || n.showToast(t.message ?? "无法继续该任务", "error");
			break;
		}
		case "stop_agent_task":
			d(e.taskId), a(e.taskId);
			break;
		case "skip_agent_step":
			try {
				y(e.taskId, e.stepId);
			} catch {
				n.showToast("该步骤已无法跳过", "error");
			}
			break;
		case "replan_agent_task": {
			try {
				d(e.taskId), o(e.taskId);
			} catch {
				n.showToast("该任务当前状态无法重新规划", "error");
				break;
			}
			let t = U(e.taskId);
			t.ok || n.showToast(t.message ?? "无法重新规划该任务", "error");
			break;
		}
		case "rewind_agent_task":
			_n(e.taskId).then((e) => {
				n.showToast(e.ok ? "已回退该任务的画布修改" : e.message ?? "无法回退任务", e.ok ? "info" : "error");
			});
			break;
		case "select_model": {
			let t = {}, r = e.category || "text";
			if (r === "image") t.assistantImageModelId = e.modelId;
			else if (r === "video") t.assistantVideoModelId = e.modelId;
			else {
				let r = n.projects.find((e) => e.id === n.currentProjectId);
				if (r) {
					n.updateProjectSettings({
						...r.settings,
						defaultModels: {
							...r.settings?.defaultModels,
							text: e.modelId
						}
					});
					break;
				}
				t.assistantModelId = e.modelId;
			}
			n.updateConfig(t), n.saveConfig({ silent: !0 });
			break;
		}
		case "focus_node":
			if (!n.nodes.some((t) => t.id === e.nodeId)) {
				n.showToast("引用的节点已不存在", "error");
				break;
			}
			window.dispatchEvent(new CustomEvent("canvas-focus-node", { detail: { nodeId: e.nodeId } }));
			break;
		case "set_hovered_node":
			n.setHoveredMentionNodeId(e.nodeId);
			break;
		case "set_composer_draft":
			n.setChatComposerLiveDraft(e.draft);
			break;
		case "dock_window":
			n.setHoveredMentionNodeId(null), n.setChatPanelDetached(!1), n.openChat();
			break;
		case "request_sync":
			t(!0, !0);
			break;
		case "confirm_commands":
		case "cancel_commands": break;
	}
}
function zn(e = {}) {
	let t = e.enabled ?? bn, n = e.syncIntervalMs ?? vn, r = e.emitSync ?? ae, i = e.initListener ?? H, a = e.now ?? (() => performance.now()), o = null, s = !1, c = !1, l = !1, u = !1, d = 0, f = null, p = 0, m = !1, g = 0, _, v, y, b = () => {
		c = !1, l = !1, m = !1, f = null, p = 0, g = 0, o && clearTimeout(o), o = null;
	}, x = async () => {
		if (o = null, u || s || !c) return;
		let e = D.getState();
		if (!e.chatPanelDetached) {
			b();
			return;
		}
		c = !1, l = !1, s = !0, d = a();
		try {
			let t = In(e), n = f;
			if (!(m || !n)) {
				let e = oe(n, t);
				if (!se(e)) {
					f = t, g = 0;
					return;
				}
				let i = p, a = p + 1;
				await r({
					type: "patch",
					baseRevision: i,
					revision: a,
					patch: e
				}), f = t, p = a, g = 0;
				return;
			}
			let i = p + 1;
			m = !1, await r({
				type: "snapshot",
				revision: i,
				snapshot: t
			}), f = t, p = i, g = 0;
		} catch (e) {
			g += 1, c = !0, m = !0, console.warn("[chatWindow] failed to sync detached window state:", e);
		} finally {
			if (s = !1, !u && c) {
				let e = a() - d, t = g > 0 ? Math.min(yn, Math.max(1, n) * 2 ** Math.min(g - 1, 5)) : 0, r = t > 0 ? t : l ? 0 : Math.max(0, n - e);
				o = setTimeout(() => {
					x();
				}, r);
			}
		}
	}, S = (e = !1, r = !1) => {
		if (!t || u) return;
		if (!D.getState().chatPanelDetached) {
			b();
			return;
		}
		if (c = !0, e && (l = !0), r && (m = !0), o) {
			if (!e) return;
			clearTimeout(o), o = null;
		}
		if (s) return;
		let i = a() - d, f = e ? 0 : Math.max(0, n - i);
		if (f === 0) {
			x();
			return;
		}
		o = setTimeout(() => {
			x();
		}, f);
	};
	return {
		start: async () => {
			if (!t || u || v) return;
			v = D.subscribe((e, t) => {
				if (!e.chatPanelDetached) {
					t.chatPanelDetached && b();
					return;
				}
				if (!Ln(e, t)) return;
				let n = !t.chatPanelDetached;
				S(n, n);
			}), y = h(() => S());
			let e = await i((e) => Rn(e, S), () => {
				D.getState().setHoveredMentionNodeId(null);
			});
			if (u) {
				e();
				return;
			}
			_ = e, D.getState().chatPanelDetached && S(!0, !0);
		},
		dispose: () => {
			u || (u = !0, b(), v?.(), v = void 0, y?.(), y = void 0, _?.(), _ = void 0);
		},
		sync: S
	};
}
//#endregion
//#region src/components/chat/ChatPanel.tsx
var Bn = typeof window < "u" && "__TAURI__" in window, Vn = 300, Hn = 400, Un = 320, Wn = 720, Gn = 64;
function Kn({ detached: e = !1, detachedSnapshot: t, detachedInitialized: n = !0, detachedHeaderActions: i } = {}) {
	let c = r(), l = te(), { chatOpen: u, chatPanelDetached: f, chatComposerDraft: p, closeChat: _, clearChatComposerDraft: v, setChatPanelDetached: b, activeConversationId: x, conversations: S, messages: w, agentTasks: E, currentProjectId: k, projects: j, createConversation: N, setActiveConversation: F, updateConversation: I, loadConversationMessages: ne, showToast: L, assistantModelId: R, generalModels: re, providers: z, dreaminaLoggedIn: B, workflows: ae, updateConfig: H, saveConfig: oe, updateProjectSettings: se, projectMemories: ce, updateProjectMemory: ue, removeProjectMemory: de } = D(ie((e) => ({
		chatOpen: e.chatOpen,
		chatPanelDetached: e.chatPanelDetached,
		chatComposerDraft: e.chatComposerDraft,
		closeChat: e.closeChat,
		clearChatComposerDraft: e.clearChatComposerDraft,
		setChatPanelDetached: e.setChatPanelDetached,
		activeConversationId: e.activeConversationId,
		conversations: e.conversations,
		messages: e.messages,
		agentTasks: e.agentTasks,
		currentProjectId: e.currentProjectId,
		projects: e.projects,
		createConversation: e.createConversation,
		setActiveConversation: e.setActiveConversation,
		updateConversation: e.updateConversation,
		loadConversationMessages: e.loadConversationMessages,
		showToast: e.showToast,
		assistantModelId: e.config.assistantModelId,
		generalModels: e.config.generalModels ?? [],
		providers: e.config.providers,
		dreaminaLoggedIn: !!e.config.dreaminaAuth?.loggedIn,
		workflows: e.workflows,
		updateConfig: e.updateConfig,
		saveConfig: e.saveConfig,
		updateProjectSettings: e.updateProjectSettings,
		projectMemories: e.projectMemories,
		updateProjectMemory: e.updateProjectMemory,
		removeProjectMemory: e.removeProjectMemory
	}))), he = e ? t?.conversations ?? [] : S, W = e ? t?.activeConversationId ?? null : x, _e = e ? t?.messages ?? [] : w, be = e ? t?.agentTasks ?? [] : E, q = e ? t?.projectId ?? null : k, J = e ? t?.projectName : void 0, xe = j.find((e) => e.id === k), Se = m(xe?.settings, R)[0], Ce = e ? t?.assistantModelId : Se, we = (0, G.useMemo)(() => e ? t?.generalModels ?? [] : re, [
		e,
		t?.generalModels,
		re
	]), Te = (0, G.useMemo)(() => ({
		providers: z,
		dreaminaAuth: { loggedIn: B }
	}), [B, z]), Ee = (0, G.useMemo)(() => {
		let n = P(we, e ? void 0 : Te, e ? [] : ae);
		if (!e) return n;
		let r = t?.mediaModelAvailability;
		return r ? n.filter((e) => Object.prototype.hasOwnProperty.call(r, e.value)) : [];
	}, [
		e,
		t?.mediaModelAvailability,
		we,
		Te,
		ae
	]), De = (0, G.useMemo)(() => En(Ee, re, z, B), [
		B,
		re,
		Ee,
		z
	]), Oe = (0, G.useMemo)(() => e ? t?.mediaModelAvailability ?? {} : De, [
		e,
		t?.mediaModelAvailability,
		De
	]), ke = he.find((e) => e.id === W), Ae = ke?.agentMode ?? "collaborative", je = be.some((e) => e.conversationId === W && [
		"planning",
		"running",
		"waiting_tool",
		"waiting_approval"
	].includes(e.status)), [Me, Ne] = (0, G.useState)(""), Pe = (0, G.useRef)(/* @__PURE__ */ new Map()), X = (0, G.useRef)(null), [Z, Fe] = (0, G.useState)("chat"), [Ie, Le] = (0, G.useState)(!1), [Q, Re] = (0, G.useState)(!1), [ze, Be] = (0, G.useState)(!1), [Ve, He] = (0, G.useState)(!1), Ue = (0, G.useRef)(null), We = (0, G.useRef)(Hn), Ge = (0, G.useRef)(!1), Ke = (0, G.useRef)(null), qe = (0, G.useCallback)((e) => {
		let t = Ue.current?.closest(".app-shell");
		if (!t) return;
		let n = Math.max(0, window.innerWidth - Gn), r = Math.min(Un, n), i = Math.min(Math.max(r, Math.min(Wn, n)), Math.max(r, e));
		t.style.setProperty("--chat-panel-width", `${Math.round(i)}px`);
	}, []);
	(0, G.useEffect)(() => {
		if (e || !u || f) return;
		let t = Ue.current;
		if (!t) return;
		let n = t.getBoundingClientRect().width;
		!Ge.current && Number.isFinite(n) && n > 0 && (We.current = Math.min(Wn, Math.max(Un, n)), Ge.current = !0);
		let r = () => {
			qe(We.current);
		};
		return r(), window.addEventListener("resize", r), () => window.removeEventListener("resize", r);
	}, [
		qe,
		u,
		f,
		e
	]), (0, G.useEffect)(() => () => {
		Ke.current = null, document.body.classList.remove("chat-panel-resizing");
	}, []);
	let Je = (0, G.useCallback)((t) => {
		if (e || t.button !== 0) return;
		let n = Ue.current;
		n && (Ke.current = {
			pointerId: t.pointerId,
			startX: t.clientX,
			startWidth: n.getBoundingClientRect().width
		}, t.currentTarget.setPointerCapture(t.pointerId), document.body.classList.add("chat-panel-resizing"), t.preventDefault());
	}, [e]), Ye = (0, G.useCallback)((e) => {
		let t = Ke.current;
		if (!t || t.pointerId !== e.pointerId) return;
		let n = Math.min(Wn, Math.max(Un, t.startWidth + t.startX - e.clientX));
		We.current = n, qe(n);
	}, [qe]), Xe = (0, G.useCallback)((e) => {
		let t = Ke.current;
		!t || t.pointerId !== e.pointerId || (Ke.current = null, document.body.classList.remove("chat-panel-resizing"), e.currentTarget.hasPointerCapture(e.pointerId) && e.currentTarget.releasePointerCapture(e.pointerId));
	}, []), Ze = D((e) => q ? T(e.projects, q) : null), Qe = Ze ? ce.filter((e) => e.projectId === Ze) : [], [, $e] = (0, G.useState)(0);
	(0, G.useEffect)(() => h(() => $e((e) => e + 1)), []);
	let et = e ? t?.localFileGrants ?? [] : W ? C(W) : [], tt = (0, G.useRef)({
		timer: null,
		value: null
	}), nt = (0, G.useCallback)(() => {
		let t = tt.current;
		if (t.timer && clearTimeout(t.timer), t.timer = null, t.value == null) return;
		let n = t.value;
		t.value = null, e ? V({
			type: "set_composer_draft",
			draft: n
		}) : D.getState().setChatComposerLiveDraft(n);
	}, [e]), rt = (0, G.useCallback)((e) => {
		let t = tt.current;
		t.value = e, !t.timer && (t.timer = setTimeout(() => {
			t.timer = null, nt();
		}, Vn));
	}, [nt]);
	(0, G.useEffect)(() => (window.addEventListener("beforeunload", nt), () => {
		window.removeEventListener("beforeunload", nt), nt();
	}), [nt]);
	let $ = (0, G.useCallback)((e) => {
		Ne(e), rt(e), W && (e ? Pe.current.set(W, e) : Pe.current.delete(W));
	}, [W, rt]);
	(0, G.useEffect)(() => {
		if (W && X.current != null) {
			let e = X.current;
			X.current = null, Pe.current.set(W, e), Ne(e);
			return;
		}
		Ne(W ? Pe.current.get(W) ?? "" : "");
	}, [W]);
	let it = (0, G.useRef)(!1);
	(0, G.useEffect)(() => {
		if (!(e ? n : !f)) {
			it.current = !1;
			return;
		}
		if (it.current) return;
		it.current = !0;
		let r = e ? t?.composerDraft ?? "" : D.getState().chatComposerLiveDraft;
		if (!r) return;
		let i = requestAnimationFrame(() => $(r));
		return () => cancelAnimationFrame(i);
	}, [
		f,
		e,
		n,
		t?.composerDraft,
		$
	]);
	let at = (0, G.useCallback)((t) => {
		e ? V({
			type: "select_model",
			modelId: t,
			category: "text"
		}) : xe ? se({
			...xe.settings,
			defaultModels: {
				...xe.settings?.defaultModels,
				text: t
			}
		}) : (H({ assistantModelId: t }), oe({ silent: !0 }));
	}, [
		xe,
		e,
		oe,
		H,
		se
	]), ot = (0, G.useCallback)((t) => {
		if (!(!W || t === Ae)) {
			if (e) {
				V({
					type: "set_agent_mode",
					conversationId: W,
					mode: t
				});
				return;
			}
			I(W, { agentMode: t }), L(ge(t), "info");
		}
	}, [
		e,
		W,
		Ae,
		L,
		I
	]), st = W ? _e.filter((e) => e.conversationId === W) : [], ct = (0, G.useMemo)(() => {
		if (!W) return null;
		let e = Ce?.replace(/^general\//, ""), t = we.find((t) => t.id === e && t.category === "text") ?? null;
		return ve(st, ke?.contextSummary, t);
	}, [
		W,
		Ce,
		we,
		ke?.contextSummary,
		_e
	]), lt = (0, G.useCallback)(() => {
		q && (e ? V({
			type: "create_conversation",
			projectId: q
		}) : N(q), Fe("chat"));
	}, [
		e,
		q,
		N
	]), ut = (0, G.useCallback)((t) => {
		e ? V({
			type: "switch_conversation",
			conversationId: t
		}) : (F(t), ne(t)), Fe("chat");
	}, [
		e,
		F,
		ne
	]), dt = (0, G.useCallback)(() => Fe("list"), []), ft = (0, G.useCallback)((e) => {
		if (!W && q) {
			X.current = e, lt(), Ne(e);
			return;
		}
		$(e);
	}, [
		W,
		q,
		lt,
		$
	]);
	(0, G.useEffect)(() => {
		if (e || !p || !q) return;
		let t = 0, n = requestAnimationFrame(() => {
			ft(p), v(), t = requestAnimationFrame(() => {
				window.dispatchEvent(new CustomEvent("chat-focus-composer"));
			});
		});
		return () => {
			cancelAnimationFrame(n), t && cancelAnimationFrame(t);
		};
	}, [
		p,
		v,
		e,
		q,
		ft
	]);
	let pt = (0, G.useCallback)((t) => {
		if (e) return;
		let n = D.getState(), r = n.messages.find((e) => e.id === t);
		if (r?.mediaResult) {
			n.updateMessage(t, {
				canvasStatus: "pending",
				canvasError: void 0
			});
			try {
				let e = n.materializeMediaArtifact(r.mediaResult);
				n.updateMessage(t, {
					canvasStatus: "created",
					canvasNodeId: e,
					canvasError: void 0
				}), n.showToast(c("已添加到画布"));
			} catch (e) {
				let r = e instanceof Error ? e.message : c("添加节点失败");
				n.updateMessage(t, {
					canvasStatus: "failed",
					canvasError: r
				}), n.showToast(r, "error");
			}
		}
	}, [e, c]), ht = (0, G.useCallback)(async (t) => {
		if (e) return;
		let n = D.getState(), r = n.messages.find((e) => e.id === t);
		if (r?.mediaResult) try {
			let e = await me(r.mediaResult, n.currentProjectId), i = D.getState();
			i.updateMessage(t, { mediaResult: e }), r.canvasNodeId && i.settleMediaPlaceholder(r.canvasNodeId, e), i.showToast(c("产物已保存到项目"));
		} catch (e) {
			D.getState().showToast(e instanceof Error ? e.message : c("保存失败"), "error");
		}
	}, [e, c]), gt = (0, G.useCallback)((t, n) => {
		if (e) {
			V({
				type: "resolve_agent_approval",
				approvalId: t,
				resolution: n
			});
			return;
		}
		pe(t, n) || L(c("该确认已过期，请重新发起操作"), "info");
	}, [
		e,
		L,
		c
	]), _t = (0, G.useCallback)(() => {
		setTimeout(() => {
			document.querySelector(".chat-panel-messages")?.lastElementChild?.scrollIntoView({ behavior: "smooth" });
		}, 100);
	}, []), vt = (0, G.useMemo)(() => ({
		onResolveApproval: gt,
		mediaModelOptions: Ee,
		mediaModelAvailability: Oe,
		onPause: (t) => {
			if (e) {
				V({
					type: "pause_agent_task",
					taskId: t
				});
				return;
			}
			d(t), O(t), L(c("已暂停任务"), "info");
		},
		onResume: (t) => {
			if (e) {
				V({
					type: "resume_agent_task",
					taskId: t
				});
				return;
			}
			let n = U(t, _t);
			L(n.ok ? c("已继续任务") : n.message ?? c("无法继续该任务"), n.ok ? "info" : "error");
		},
		onStop: (t) => {
			if (e) {
				V({
					type: "stop_agent_task",
					taskId: t
				});
				return;
			}
			d(t), a(t), L(c("已停止任务"), "info");
		},
		onSkip: (t, n) => {
			if (e) {
				V({
					type: "skip_agent_step",
					taskId: t,
					stepId: n
				});
				return;
			}
			try {
				y(t, n), L(c("已跳过当前步骤，可继续或重新规划"), "info");
			} catch {
				L(c("该步骤已无法跳过"), "error");
			}
		},
		onReplan: (t) => {
			if (e) {
				V({
					type: "replan_agent_task",
					taskId: t
				});
				return;
			}
			try {
				d(t), o(t);
			} catch {
				L(c("该任务当前状态无法重新规划"), "error");
				return;
			}
			let n = U(t, _t);
			L(n.ok ? c("正在重新规划任务") : n.message ?? c("无法重新规划该任务"), n.ok ? "info" : "error");
		},
		onRewind: (t) => {
			if (e) {
				V({
					type: "rewind_agent_task",
					taskId: t
				});
				return;
			}
			_n(t).then((e) => {
				L(e.ok ? c("已回退该任务的画布修改") : e.message ?? c("无法回退任务"), e.ok ? "info" : "error");
			});
		}
	}), [
		e,
		Oe,
		gt,
		Ee,
		L,
		_t,
		c
	]), yt = (0, G.useCallback)(() => {
		if (W) {
			if (e) {
				V({
					type: "authorize_local_files",
					conversationId: W
				});
				return;
			}
			s(W).then((e) => {
				L(e.length > 0 ? c("已授权 {count} 个文件", { count: e.length }) : c("未新增文件授权"), "info");
			}).catch((e) => L(e instanceof Error ? e.message : c("文件授权失败"), "error"));
		}
	}, [
		e,
		W,
		L,
		c
	]), bt = (0, G.useCallback)((t) => {
		if (W) {
			if (e) {
				V({
					type: "revoke_local_file",
					conversationId: W,
					grantId: t
				});
				return;
			}
			g(W, t);
		}
	}, [e, W]), xt = (0, G.useCallback)((t, n = "queue") => {
		let r = t.trim();
		if (!(!r || !W)) {
			if (e) {
				V({
					type: "send_message",
					content: r,
					conversationId: W,
					dispatchMode: n
				}), $("");
				return;
			}
			fe({
				content: r,
				projectId: q ?? "",
				conversationId: W,
				mode: Ae,
				dispatchMode: n,
				onProgress: _t
			}), $(""), _t();
		}
	}, [
		e,
		W,
		Ae,
		q,
		_t,
		$
	]), St = (0, G.useCallback)(() => {
		xt(Me);
	}, [Me, xt]), Ct = (0, G.useCallback)(() => {
		xt(Me, "interject");
	}, [Me, xt]), wt = (0, G.useCallback)((e) => {
		$(e), window.dispatchEvent(new CustomEvent("chat-focus-composer"));
	}, [$]), Tt = (0, G.useCallback)((e) => {
		xt(e);
	}, [xt]), Et = (0, G.useCallback)((t) => {
		if (e) {
			V({
				type: "focus_node",
				nodeId: t
			});
			return;
		}
		if (!D.getState().nodes.some((e) => e.id === t)) {
			L(c("引用的节点已不存在"), "error");
			return;
		}
		window.dispatchEvent(new CustomEvent("canvas-focus-node", { detail: { nodeId: t } }));
	}, [
		e,
		L,
		c
	]), Dt = (0, G.useCallback)((t) => {
		if (e) {
			V({
				type: "set_hovered_node",
				nodeId: t
			});
			return;
		}
		D.getState().setHoveredMentionNodeId(t);
	}, [e]), Ot = (0, G.useCallback)((e) => {
		window.dispatchEvent(new CustomEvent("chat-open-reference-menu", { detail: {
			kind: "model",
			modelId: e
		} }));
	}, []);
	(0, G.useEffect)(() => {
		if (e) return;
		let t = zn();
		return t.start(), () => t.dispose();
	}, [e]);
	let kt = (0, G.useCallback)(async () => {
		if (!Bn) {
			L(c("独立窗口功能需要 Tauri 环境"), "info");
			return;
		}
		if (f) {
			try {
				await le(), await A("close_chat_window");
			} catch {}
			b(!1);
		} else {
			nt(), b(!0);
			try {
				await A("open_chat_window");
			} catch (e) {
				b(!1), console.error("[ChatPanel] failed to open chat window:", e), L(c("打开独立窗口失败"), "error");
			}
		}
	}, [
		f,
		nt,
		b,
		L,
		c
	]), At = !W && Z === "chat";
	return /* @__PURE__ */ (0, K.jsx)(ee, { children: (e || u && !f) && /* @__PURE__ */ (0, K.jsxs)(M.aside, {
		ref: Ue,
		className: `chat-panel-root ${e ? "chat-panel-detached h-screen w-screen flex flex-col overflow-hidden rounded-[16px] border border-canvas-border bg-[var(--glass-panel-bg)] text-canvas-text backdrop-blur-2xl" : "chat-panel fixed z-50 flex flex-col"}`,
		initial: e ? !1 : l ? { opacity: 0 } : {
			x: "100%",
			opacity: 0
		},
		animate: {
			x: 0,
			opacity: 1
		},
		exit: e ? void 0 : l ? { opacity: 0 } : {
			x: "100%",
			opacity: 0
		},
		transition: l ? { duration: .12 } : {
			type: "spring",
			visualDuration: .35,
			bounce: 0
		},
		children: [
			!e && /* @__PURE__ */ (0, K.jsx)("div", {
				"aria-hidden": "true",
				className: "chat-panel-resize-handle",
				onPointerDown: Je,
				onPointerMove: Ye,
				onPointerUp: Xe,
				onPointerCancel: Xe,
				onLostPointerCapture: Xe
			}),
			/* @__PURE__ */ (0, K.jsx)(Y, {
				detached: e,
				chatPanelDetached: f,
				projectName: J,
				agentMode: Ae,
				onAgentModeChange: ot,
				agentModeDisabled: !W,
				onOpenMemory: !e && q ? () => {
					Be(!1), Re(!1), Le(!0);
				} : void 0,
				onOpenSubAgents: e ? void 0 : () => {
					Be(!1), Le(!1), Re(!0);
				},
				onOpenAgents: e ? void 0 : () => {
					Le(!1), Re(!1), He(!1), Be(!0);
				},
				onOpenTasks: () => {
					Be(!1), Le(!1), Re(!1), He(!0);
				},
				activeTaskCount: be.filter((e) => ![
					"completed",
					"failed",
					"stopped"
				].includes(e.status)).length,
				showBackButton: Z === "chat" && !!W,
				onBack: dt,
				onDetachToggle: kt,
				onClose: _,
				detachedHeaderActions: i
			}),
			/* @__PURE__ */ (0, K.jsx)("div", {
				className: "chat-panel-body flex flex-1 min-h-0",
				children: Ve ? /* @__PURE__ */ (0, K.jsx)(gn, {
					tasks: be.filter((e) => e.projectId === q),
					conversations: he,
					onClose: () => He(!1),
					...vt
				}) : /* @__PURE__ */ (0, K.jsxs)(K.Fragment, { children: [Z === "list" && /* @__PURE__ */ (0, K.jsx)(M.div, {
					initial: l ? { opacity: 0 } : {
						x: -12,
						opacity: 0
					},
					animate: {
						x: 0,
						opacity: 1
					},
					transition: l ? { duration: .12 } : {
						type: "spring",
						visualDuration: .24,
						bounce: 0
					},
					className: "chat-panel-conversation-list flex-shrink-0 w-full overflow-hidden",
					children: /* @__PURE__ */ (0, K.jsx)(ye, {
						...e ? {
							conversations: he,
							activeConversationId: W,
							agentTasks: be,
							projectId: q ?? void 0,
							onRenameConversation: (e, t) => {
								V({
									type: "rename_conversation",
									conversationId: e,
									title: t
								});
							},
							onTogglePin: (e) => {
								V({
									type: "toggle_pin",
									conversationId: e
								});
							},
							onArchiveConversation: (e) => {
								V({
									type: "archive_conversation",
									conversationId: e
								});
							},
							onDeleteConversation: (e) => {
								V({
									type: "delete_conversation",
									conversationId: e
								});
							}
						} : {},
						onSelect: ut,
						onNew: lt
					})
				}), Z === "chat" && /* @__PURE__ */ (0, K.jsxs)(M.div, {
					initial: l ? { opacity: 0 } : {
						x: 12,
						opacity: 0
					},
					animate: {
						x: 0,
						opacity: 1
					},
					transition: l ? { duration: .12 } : {
						type: "spring",
						visualDuration: .24,
						bounce: 0
					},
					className: "chat-panel-chat-area flex-1 flex flex-col min-h-0 min-w-0",
					children: [/* @__PURE__ */ (0, K.jsx)(mt, {
						messages: st,
						agentTasks: be,
						showEmptyState: At,
						detachedInitialized: n,
						onNewConversation: lt,
						onShowList: dt,
						onOpenAgents: e ? void 0 : () => Be(!0),
						onExampleClick: ft,
						onAddMediaToCanvas: e ? void 0 : pt,
						onRetryMediaSave: e ? void 0 : ht,
						onEditMessage: wt,
						onRegenerateMessage: Tt,
						onNodeActivate: Et,
						onNodeHover: Dt,
						onModelActivate: Ot,
						agentControls: vt
					}), !At && /* @__PURE__ */ (0, K.jsx)(en, {
						assistantModelId: Ce,
						onAssistantModelChange: at,
						mediaModels: we,
						mediaModelOptions: Ee,
						mediaModelAvailability: Oe,
						inputValue: Me,
						onInputChange: $,
						onSend: St,
						hasActiveTask: je,
						onInterject: Ct,
						localFileGrants: et,
						onAuthorizeLocalFiles: yt,
						onRevokeLocalFile: bt,
						contextUsage: ct,
						allowSkillUpload: !e,
						skillOptions: e ? t?.skillOptions ?? [] : void 0
					})]
				})] })
			}),
			Ie && !e && /* @__PURE__ */ (0, K.jsx)(an, {
				memories: Qe,
				onUpdate: ue,
				onDelete: de,
				onClose: () => Le(!1)
			}),
			Q && !e && /* @__PURE__ */ (0, K.jsx)(ln, { onClose: () => Re(!1) }),
			ze && !e && /* @__PURE__ */ (0, K.jsx)(mn, {
				allowInstall: !0,
				onClose: () => Be(!1)
			})
		]
	}) });
}
//#endregion
export { Kn as default };
