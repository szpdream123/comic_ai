import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./jsx-runtime-BAkIPmuO.js";
import { a as r } from "./i18n-on3r1DCI.js";
import { $r as i, Ar as a, Br as o, H as s, Jt as c, N as l, Nr as u, Or as d, Pr as f, V as p, Vr as m, X as h, Xr as g, Yr as _, Zr as v, a as y, di as b, dt as x, ei as S, lt as C, ni as w, o as T, s as E, t as D, ut as O, z as k } from "./useAppStore-BH-MdRLu.js";
import { a as A, i as j } from "./core-D3lATfku.js";
import { a as M, r as N, t as P } from "./ViewportImage-txaOn4PW.js";
import { t as ee } from "./use-reduced-motion-BNk9FtxG.js";
import { At as F, C as I, Kt as L, Nt as R, Rt as te, S as ne, l as re, qt as z, s as ie } from "./useTooltipAutoPlacement-D1FArkVS.js";
import { n as B } from "./rasterImageDimensions-CX1VK2cM.js";
import { a as V, c as ae, d as H, i as oe, l as se, n as ce, o as le, t as ue } from "./ChatMarkdown-C0G_rnzS.js";
import { i as de, u as fe, v as pe, y as U } from "./agentRoundExecutor-D9sjIsEG.js";
import { c as W, i as me, n as he, o as ge, r as _e, s as ve, t as ye } from "./conversationExecutionController-D8HECszZ.js";
import { t as G } from "./ModelSelector-BPW0Bkh4.js";
//#region src/components/chat/ConversationList.tsx
var K = /* @__PURE__ */ e(t(), 1), q = n();
function be({ onSelect: e, onNew: t, conversations: n, activeConversationId: i, agentTasks: a, onRenameConversation: o, onTogglePin: s, onArchiveConversation: c, onDeleteConversation: l }) {
	let u = r(), d = !!n, f = ee(), p = D(z((e) => ({
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
	let [v, y] = (0, K.useState)(""), [b, x] = (0, K.useState)(null), [S, C] = (0, K.useState)(""), w = m.filter((e) => {
		if (e.archived || e.deletedAt) return !1;
		if (!v.trim()) return !0;
		let t = v.toLowerCase();
		return e.title.toLowerCase().includes(t) || (e.lastMessagePreview || "").toLowerCase().includes(t);
	}), T = (0, K.useCallback)((e) => {
		x(e.id), C(e.title);
	}, []), E = (0, K.useCallback)((e) => {
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
	]), O = (0, K.useCallback)((e) => {
		d ? s?.(e.id) : p.updateConversation(e.id, { pinned: !e.pinned });
	}, [
		d,
		s,
		p
	]), k = (0, K.useCallback)((e) => {
		d ? c?.(e.id) : p.updateConversation(e.id, { archived: !0 });
	}, [
		d,
		c,
		p
	]), A = (0, K.useCallback)((e) => {
		d ? l?.(e.id) : (p.updateConversation(e.id, { deletedAt: Date.now() }), p.removeConversation(e.id));
	}, [
		d,
		l,
		p
	]), j = w.filter((e) => e.pinned), P = w.filter((e) => !e.pinned);
	return /* @__PURE__ */ (0, q.jsxs)("div", {
		className: "flex flex-col h-full",
		children: [
			/* @__PURE__ */ (0, q.jsxs)("div", {
				className: "flex items-center justify-between px-3 py-3 border-b border-canvas-border",
				children: [/* @__PURE__ */ (0, q.jsx)("span", {
					className: "text-xs font-semibold text-canvas-text-muted",
					children: u("对话")
				}), /* @__PURE__ */ (0, q.jsx)(L, {
					scale: 1.05,
					className: "flex h-7 w-7 items-center justify-center rounded-lg text-canvas-text-secondary transition-colors\n                     hover:bg-canvas-hover hover:text-canvas-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
					onClick: t,
					"data-tooltip": u("新对话"),
					children: /* @__PURE__ */ (0, q.jsx)(B, {
						icon: "mdi:plus",
						width: "16",
						height: "16"
					})
				})]
			}),
			/* @__PURE__ */ (0, q.jsx)("div", {
				className: "px-3 py-2",
				children: /* @__PURE__ */ (0, q.jsxs)("div", {
					className: "relative",
					children: [/* @__PURE__ */ (0, q.jsx)(B, {
						icon: "mdi:magnify",
						width: "14",
						height: "14",
						className: "absolute left-2.5 top-1/2 -translate-y-1/2 text-canvas-text-muted"
					}), /* @__PURE__ */ (0, q.jsx)("input", {
						type: "text",
						value: v,
						onChange: (e) => y(e.target.value),
						"aria-label": u("搜索对话"),
						placeholder: u("搜索对话…"),
						className: "w-full h-8 pl-7 pr-3 text-xs bg-canvas-bg border border-canvas-border rounded-lg\n                       text-canvas-text placeholder:text-canvas-text-muted\n                       focus:outline-none focus:border-canvas-text-secondary transition-colors"
					})]
				})
			}),
			/* @__PURE__ */ (0, q.jsx)("div", {
				className: "flex-1 overflow-y-auto px-2 py-1 space-y-0.5",
				children: /* @__PURE__ */ (0, q.jsxs)(M, { children: [
					w.length === 0 && /* @__PURE__ */ (0, q.jsxs)(N.div, {
						initial: { opacity: 0 },
						animate: { opacity: 1 },
						transition: { duration: f ? .1 : .18 },
						className: "flex flex-col items-center justify-center py-8 text-xs text-canvas-text-muted",
						children: [/* @__PURE__ */ (0, q.jsx)(B, {
							icon: "mdi:chat-outline",
							width: "28",
							height: "28",
							className: "mb-2 opacity-40"
						}), u(v ? "没有匹配的对话" : "还没有对话")]
					}),
					j.length > 0 && /* @__PURE__ */ (0, q.jsxs)(q.Fragment, { children: [/* @__PURE__ */ (0, q.jsx)("div", {
						className: "px-2 py-1 text-[11px] font-medium text-canvas-text-muted",
						children: u("置顶")
					}), j.map((t) => /* @__PURE__ */ (0, q.jsx)(xe, {
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
					P.length > 0 && /* @__PURE__ */ (0, q.jsxs)(q.Fragment, { children: [j.length > 0 && /* @__PURE__ */ (0, q.jsx)("div", {
						className: "px-2 py-1 text-[11px] font-medium text-canvas-text-muted",
						children: u("最近")
					}), P.map((t) => /* @__PURE__ */ (0, q.jsx)(xe, {
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
function xe({ conv: e, agentTaskStatus: t, reduceMotion: n, active: i, renaming: a, renameValue: o, onRenameValueChange: s, onRenameConfirm: c, onClick: l, onRename: u, onTogglePin: d, onArchive: f, onDelete: p }) {
	let m = r(), [h, g] = (0, K.useState)(!1);
	return /* @__PURE__ */ (0, q.jsxs)(N.div, {
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
		children: [a ? /* @__PURE__ */ (0, q.jsxs)(q.Fragment, { children: [/* @__PURE__ */ (0, q.jsx)("div", {
			className: "flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center bg-canvas-hover",
			children: /* @__PURE__ */ (0, q.jsx)(B, {
				icon: i ? "mdi:chat-processing" : "mdi:chat-outline",
				width: "15",
				height: "15",
				className: i ? "text-indigo-400" : "text-canvas-text-muted"
			})
		}), /* @__PURE__ */ (0, q.jsx)("input", {
			type: "text",
			value: o,
			onChange: (e) => s(e.target.value),
			onBlur: c,
			onKeyDown: (e) => {
				e.key === "Enter" && c(), e.key === "Escape" && c();
			},
			autoFocus: !0,
			className: "h-8 w-full rounded border border-canvas-border bg-canvas-bg px-2 text-[13px]\n                       text-canvas-text focus:outline-none focus:border-indigo-500"
		})] }) : /* @__PURE__ */ (0, q.jsxs)("button", {
			type: "button",
			onClick: l,
			"aria-pressed": i,
			className: "flex min-w-0 flex-1 items-center gap-2 rounded-md text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
			children: [/* @__PURE__ */ (0, q.jsx)("div", {
				className: "flex-shrink-0 w-7 h-7 rounded-lg flex items-center justify-center bg-canvas-hover",
				children: /* @__PURE__ */ (0, q.jsx)(B, {
					icon: i ? "mdi:chat-processing" : "mdi:chat-outline",
					width: "15",
					height: "15",
					className: i ? "text-indigo-400" : "text-canvas-text-muted"
				})
			}), /* @__PURE__ */ (0, q.jsxs)("div", {
				className: "min-w-0 flex-1",
				children: [/* @__PURE__ */ (0, q.jsxs)("div", {
					className: "flex items-center gap-1.5",
					children: [/* @__PURE__ */ (0, q.jsx)("div", {
						className: "min-w-0 flex-1 truncate leading-tight",
						children: e.title
					}), t && /* @__PURE__ */ (0, q.jsx)(Se, { status: t })]
				}), e.lastMessagePreview && /* @__PURE__ */ (0, q.jsx)("div", {
					className: "truncate text-[11px] text-canvas-text-muted mt-0.5",
					children: e.lastMessagePreview
				})]
			})]
		}), /* @__PURE__ */ (0, q.jsxs)("div", {
			className: "relative",
			children: [/* @__PURE__ */ (0, q.jsx)("button", {
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
				children: /* @__PURE__ */ (0, q.jsx)(B, {
					icon: "mdi:dots-vertical",
					width: "14",
					height: "14"
				})
			}), /* @__PURE__ */ (0, q.jsx)(M, { children: h && /* @__PURE__ */ (0, q.jsxs)(N.div, {
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
					/* @__PURE__ */ (0, q.jsx)(Ce, {
						icon: "mdi:pencil-outline",
						label: m("重命名"),
						onClick: () => {
							u(), g(!1);
						}
					}),
					/* @__PURE__ */ (0, q.jsx)(Ce, {
						icon: e.pinned ? "mdi:pin-off" : "mdi:pin-outline",
						label: e.pinned ? m("取消置顶") : m("置顶"),
						onClick: () => {
							d(), g(!1);
						}
					}),
					/* @__PURE__ */ (0, q.jsx)(Ce, {
						icon: "mdi:archive-outline",
						label: m("归档"),
						onClick: () => {
							f(), g(!1);
						}
					}),
					/* @__PURE__ */ (0, q.jsx)("div", { className: "border-t border-canvas-border" }),
					/* @__PURE__ */ (0, q.jsx)(Ce, {
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
function Se({ status: e }) {
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
	return n ? /* @__PURE__ */ (0, q.jsx)("span", {
		className: `shrink-0 text-[11px] font-medium ${n.className}`,
		children: n.label
	}) : null;
}
function Ce({ icon: e, label: t, danger: n, onClick: r }) {
	return /* @__PURE__ */ (0, q.jsxs)("button", {
		type: "button",
		role: "menuitem",
		className: `flex items-center gap-2 w-full px-3 py-2 text-xs transition-colors
                  ${n ? "text-red-400 hover:bg-red-500/10" : "text-canvas-text-secondary hover:bg-canvas-hover hover:text-canvas-text"}`,
		onClick: r,
		children: [/* @__PURE__ */ (0, q.jsx)(B, {
			icon: e,
			width: "14",
			height: "14"
		}), t]
	});
}
//#endregion
//#region src/components/chat/MascotAvatar.tsx
function we({ size: e = 28, className: t = "" }) {
	let n = `mascot-avatar-${(0, K.useId)().replace(/:/g, "")}`;
	return /* @__PURE__ */ (0, q.jsxs)("svg", {
		width: e,
		height: e,
		viewBox: "0 0 32 32",
		className: t,
		"aria-hidden": "true",
		children: [
			/* @__PURE__ */ (0, q.jsx)("defs", { children: /* @__PURE__ */ (0, q.jsxs)("radialGradient", {
				id: n,
				cx: "32%",
				cy: "24%",
				r: "78%",
				children: [
					/* @__PURE__ */ (0, q.jsx)("stop", {
						offset: "0%",
						stopColor: "var(--theme-text)",
						stopOpacity: "0.98"
					}),
					/* @__PURE__ */ (0, q.jsx)("stop", {
						offset: "56%",
						stopColor: "var(--theme-text-secondary)",
						stopOpacity: "0.9"
					}),
					/* @__PURE__ */ (0, q.jsx)("stop", {
						offset: "100%",
						stopColor: "var(--theme-bg)",
						stopOpacity: "0.95"
					})
				]
			}) }),
			/* @__PURE__ */ (0, q.jsx)("circle", {
				cx: "16",
				cy: "16",
				r: "14.5",
				fill: `url(#${n})`,
				stroke: "var(--theme-border)",
				strokeWidth: "0.75"
			}),
			/* @__PURE__ */ (0, q.jsx)("rect", {
				x: "10.25",
				y: "12.5",
				width: "2.8",
				height: "6.4",
				rx: "1.4",
				fill: "var(--theme-bg)"
			}),
			/* @__PURE__ */ (0, q.jsx)("rect", {
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
var J = [
	{
		value: "plan",
		label: "规划",
		icon: "lucide:clipboard-list",
		tooltip: "Plan 模式：仅分析与规划，只能使用只读工具"
	},
	{
		value: "collaborative",
		label: "协作",
		icon: "lucide:handshake",
		tooltip: "B 协作模式：画布写操作先预览确认"
	},
	{
		value: "autonomous",
		label: "自主",
		icon: "lucide:circle-check",
		tooltip: "C 自主模式：画布操作自动执行，付费媒体和文件写入仍需确认"
	}
];
function Te({ mode: e, onChange: t, disabled: n = !1 }) {
	let i = r(), [a, o] = (0, K.useState)(!1), s = J.find((t) => t.value === e) ?? J[1];
	return /* @__PURE__ */ (0, q.jsxs)("div", {
		className: "agent-mode-selector pointer-events-auto relative",
		children: [
			/* @__PURE__ */ (0, q.jsxs)("button", {
				type: "button",
				className: `flex h-7 w-7 items-center justify-center rounded-md border border-canvas-border bg-canvas-bg/60 text-[10px] font-medium transition-colors
                      focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50
                      ${a ? "bg-canvas-hover text-canvas-text" : s.value === "autonomous" ? "text-amber-300" : s.value === "plan" ? "text-emerald-300" : "text-indigo-300"} disabled:cursor-not-allowed disabled:opacity-40`,
				"aria-haspopup": "listbox",
				"aria-expanded": a,
				"aria-label": i(`选择 Agent 模式，当前为${s.label}`),
				"data-tooltip": i(`${s.label}模式`),
				disabled: n,
				onClick: () => o((e) => !e),
				children: [
					/* @__PURE__ */ (0, q.jsx)(B, { icon: s.icon, width: "15", height: "15", "aria-hidden": "true" }),
					/* @__PURE__ */ (0, q.jsx)("span", { className: "sr-only", children: i(s.label) })
				]
			}),
				a && /* @__PURE__ */ (0, q.jsx)("div", {
					className: "agent-mode-menu absolute bottom-full left-0 z-20 mb-2 grid min-w-40 gap-0.5 rounded-md border border-canvas-border bg-canvas-card p-1 shadow-xl",
				role: "listbox",
				"aria-label": i("Agent 模式"),
				children: J.map((r) => /* @__PURE__ */ (0, q.jsxs)("button", {
					type: "button",
					className: `flex items-center gap-2 rounded px-2 py-1.5 text-left text-xs transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50 ${e === r.value ? "bg-canvas-hover text-canvas-text" : "text-canvas-text-secondary hover:bg-canvas-hover hover:text-canvas-text"}`,
					role: "option",
					"aria-selected": e === r.value,
					"aria-label": i(r.tooltip),
					disabled: n,
					onClick: () => {
						t(r.value);
						o(!1);
					},
					children: [
						(0, q.jsx)(B, { icon: r.icon, width: "15", height: "15", "aria-hidden": "true" }),
						(0, q.jsx)("span", { children: i(r.label) }),
						e === r.value && (0, q.jsx)(B, { icon: "lucide:check", width: "14", height: "14", className: "ml-auto" })
					]
				}, r.value))
			})
		]
	});
}
//#endregion
//#region src/components/chat/ChatHeader.tsx
function Ee({ detached: e, chatPanelDetached: t, projectName: n, showBackButton: i, onBack: a, onDetachToggle: o, onClose: s, agentMode: c, onAgentModeChange: l, agentModeDisabled: u, onOpenMemory: d, onOpenSubAgents: f, onOpenAgents: p, onOpenTasks: m, activeTaskCount: h = 0, detachedHeaderActions: g }) {
	let _ = r();
	return /* @__PURE__ */ (0, q.jsxs)("div", {
		"data-tauri-drag-region": e ? !0 : void 0,
		className: "chat-panel-header flex items-center justify-between gap-2 px-3.5 py-2.5\n                 flex-shrink-0 select-none",
		children: [
			/* @__PURE__ */ (0, q.jsxs)("div", {
				className: "chat-panel-header-brand flex items-center gap-1.5 min-w-0",
				children: [
					i && /* @__PURE__ */ (0, q.jsx)("button", {
						type: "button",
						className: "chat-panel-back-btn flex items-center justify-center w-8 h-8 -ml-1 rounded-lg\n                       text-canvas-text-muted hover:text-canvas-text hover:bg-canvas-hover\n                       active:scale-95 transition-[color,background-color,box-shadow,transform] duration-150\n                       motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
						onClick: a,
						"aria-label": _("返回会话列表"),
						children: /* @__PURE__ */ (0, q.jsx)(B, {
							icon: "mdi:arrow-left",
							width: "18",
							height: "18"
						})
					}),
					/* @__PURE__ */ (0, q.jsx)(we, {
						size: 26,
						className: "shrink-0"
					}),
					/* @__PURE__ */ (0, q.jsxs)("div", {
						className: "flex items-center gap-1.5 min-w-0",
						children: [/* @__PURE__ */ (0, q.jsx)("span", {
							className: "chat-panel-title text-sm font-semibold text-canvas-text truncate",
							children: _("AI 助手")
						}), e && n && /* @__PURE__ */ (0, q.jsxs)("span", {
							className: "text-[11px] text-canvas-text-muted truncate max-w-[120px]",
							children: ["· ", n]
						})]
					})
				]
			}),
			/* @__PURE__ */ (0, q.jsxs)("div", {
				className: "chat-panel-header-actions ml-auto flex items-center gap-1",
				children: [
					p && /* @__PURE__ */ (0, q.jsx)("button", {
						type: "button",
						className: "chat-panel-agents-btn flex h-8 w-8 items-center justify-center rounded-lg text-canvas-text-muted\n                       transition-[color,background-color,box-shadow,transform] duration-150 hover:bg-canvas-hover hover:text-canvas-text\n                       active:scale-95 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
						onClick: p,
						"data-tooltip": _("智能体中心"),
						"aria-label": _("智能体中心"),
						children: /* @__PURE__ */ (0, q.jsx)(B, {
							icon: "lucide:bot",
							width: "16",
							height: "16"
						})
					}),
					m && /* @__PURE__ */ (0, q.jsxs)("button", {
						type: "button",
						className: "relative flex h-8 w-8 items-center justify-center rounded-lg text-canvas-text-muted\n                       transition-[color,background-color,box-shadow,transform] duration-150 hover:bg-canvas-hover hover:text-canvas-text\n                       active:scale-95 motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
						onClick: () => {
							const event = new CustomEvent("ai-canvas-open-project-task-center", { cancelable: true });
							globalThis.dispatchEvent(event);
							if (!event.defaultPrevented) m();
						},
						"data-tooltip": _("任务中心"),
						"aria-label": h > 0 ? _("任务中心，{count} 个进行中", { count: h }) : _("任务中心"),
						children: [/* @__PURE__ */ (0, q.jsx)(B, {
							icon: "mdi:progress-wrench",
							width: "16",
							height: "16"
						}), h > 0 && /* @__PURE__ */ (0, q.jsx)("span", {
							className: "absolute right-0.5 top-0.5 h-1.5 w-1.5 rounded-full bg-emerald-400",
							"aria-hidden": "true"
						})]
					}),
					d && /* @__PURE__ */ (0, q.jsx)("button", {
						type: "button",
						className: "chat-panel-memory-btn flex items-center justify-center w-8 h-8 rounded-lg\n                       text-canvas-text-muted hover:text-canvas-text hover:bg-canvas-hover\n                       active:scale-95 transition-[color,background-color,box-shadow,transform] duration-150\n                       motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
						onClick: d,
						"data-tooltip": _("项目记忆"),
						"aria-label": _("项目记忆"),
						children: /* @__PURE__ */ (0, q.jsx)(B, {
							icon: "mdi:brain",
							width: "16",
							height: "16"
						})
					}),
					f && /* @__PURE__ */ (0, q.jsx)("button", {
						type: "button",
						className: "chat-panel-sub-agents-btn flex items-center justify-center w-8 h-8 rounded-lg\n                       text-canvas-text-muted hover:text-canvas-text hover:bg-canvas-hover\n                       active:scale-95 transition-[color,background-color,box-shadow,transform] duration-150\n                       motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
						onClick: f,
						"data-tooltip": _("子智能体"),
						"aria-label": _("子智能体"),
						children: /* @__PURE__ */ (0, q.jsx)(B, {
							icon: "lucide:users-round",
							width: "16",
							height: "16"
						})
					})
				]
			}),
			/* @__PURE__ */ (0, q.jsx)("div", {
				className: "chat-panel-header-window-actions flex shrink-0 items-center gap-1",
				children: e ? g : /* @__PURE__ */ (0, q.jsxs)(q.Fragment, { children: [/* @__PURE__ */ (0, q.jsx)("button", {
					type: "button",
					className: "chat-panel-detach-btn flex items-center justify-center w-8 h-8 rounded-lg\n                         text-canvas-text-muted hover:text-canvas-text hover:bg-canvas-hover\n                         active:scale-95 transition-[color,background-color,box-shadow,transform] duration-150\n                         motion-reduce:transform-none focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
					onClick: o,
					"data-tooltip": _(t ? "收回内嵌" : "独立窗口"),
					"aria-label": _(t ? "收回内嵌" : "独立窗口"),
					children: /* @__PURE__ */ (0, q.jsx)(B, {
						icon: t ? "mdi:dock-left" : "mdi:dock-window",
						width: "16",
						height: "16"
					})
				}), /* @__PURE__ */ (0, q.jsx)(R, { onClick: s })] })
			})
		]
	});
}
//#endregion
//#region src/services/chat/agentErrorCodes.ts
var De = {
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
function Oe(e) {
	return e ? De[e] : void 0;
}
//#endregion
//#region src/components/chat/AgentToolDetails.tsx
var ke = {
	user: "用户指定",
	project_default: "项目默认",
	model_default: "模型默认",
	resolved: "有效值"
};
function Ae(e, t) {
	return e === void 0 || e === "" ? t("未设置") : typeof e == "boolean" ? t(e ? "是" : "否") : String(e);
}
function je(e) {
	return !!e && !!(e.fields?.length || e.references?.length || e.entities?.length || e.changes?.length || e.note);
}
function Me({ input: e, result: t, defaultExpanded: n = !1 }) {
	let i = r(), [a, o] = (0, K.useState)(n), s = D((e) => e.nodes), c = s.length > 0 ? s : D.getState().nodes;
	if (!je(e) && !je(t)) return null;
	let l = [...e?.references ?? [], ...t?.references ?? []], u = [...e?.entities ?? [], ...t?.entities ?? []], d = [...e?.changes ?? [], ...t?.changes ?? []];
	return /* @__PURE__ */ (0, q.jsxs)("div", {
		className: "mt-1.5 rounded-md border border-canvas-border bg-canvas-card/80",
		children: [/* @__PURE__ */ (0, q.jsxs)("button", {
			type: "button",
			"aria-expanded": a,
			onClick: () => o((e) => !e),
			className: "flex min-h-7 w-full items-center gap-1.5 rounded-md px-2 text-left text-[11px] text-canvas-text-muted transition-colors hover:bg-canvas-hover hover:text-canvas-text-secondary focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40",
			children: [
				/* @__PURE__ */ (0, q.jsx)(B, {
					icon: "mdi:tune-variant",
					width: "13"
				}),
				/* @__PURE__ */ (0, q.jsx)("span", { children: i("调用详情") }),
				/* @__PURE__ */ (0, q.jsx)(B, {
					icon: a ? "mdi:chevron-up" : "mdi:chevron-down",
					width: "14",
					className: "ml-auto"
				})
			]
		}), a && /* @__PURE__ */ (0, q.jsxs)("div", {
			className: "space-y-2 border-t border-canvas-border px-2 py-2 text-[11px] leading-[17px]",
			children: [
				e?.fields?.length ? /* @__PURE__ */ (0, q.jsxs)("div", { children: [/* @__PURE__ */ (0, q.jsx)("p", {
					className: "mb-1 font-medium text-canvas-text-secondary",
					children: i("参数")
				}), /* @__PURE__ */ (0, q.jsx)("dl", {
					className: "space-y-0.5",
					children: e.fields.map((e, t) => /* @__PURE__ */ (0, q.jsxs)("div", {
						className: "grid grid-cols-[72px_minmax(0,1fr)] gap-2",
						children: [/* @__PURE__ */ (0, q.jsx)("dt", {
							className: "text-canvas-text-muted",
							children: e.label
						}), /* @__PURE__ */ (0, q.jsxs)("dd", {
							className: "min-w-0 break-words text-canvas-text-secondary",
							children: [Ae(e.value, i), e.source && /* @__PURE__ */ (0, q.jsx)("span", {
								className: "ml-1.5 text-[10px] text-canvas-text-muted",
								children: i(ke[e.source])
							})]
						})]
					}, `${e.label}-${t}`))
				})] }) : null,
				l.length > 0 && /* @__PURE__ */ (0, q.jsxs)("div", { children: [/* @__PURE__ */ (0, q.jsx)("p", {
					className: "mb-1 font-medium text-canvas-text-secondary",
					children: i("参考素材")
				}), /* @__PURE__ */ (0, q.jsx)("div", {
					className: "grid grid-cols-2 gap-1.5",
					children: l.map((e, t) => {
						let n = e.kind === "node" ? c.find((t) => t.id === e.id) : void 0, r = n && e.mediaKind === "image" ? n.data.imageUrl || n.data.thumbnailUrl : n?.data.thumbnailUrl;
						return /* @__PURE__ */ (0, q.jsxs)("div", {
							className: "flex min-w-0 items-center gap-1.5 rounded border border-canvas-border bg-canvas-surface/60 p-1.5",
							children: [r ? /* @__PURE__ */ (0, q.jsx)("img", {
								src: r,
								alt: "",
								className: "h-9 w-9 shrink-0 rounded object-cover"
							}) : /* @__PURE__ */ (0, q.jsx)("span", {
								className: "flex h-9 w-9 shrink-0 items-center justify-center rounded bg-canvas-hover text-canvas-text-muted",
								children: /* @__PURE__ */ (0, q.jsx)(B, {
									icon: e.mediaKind === "video" ? "mdi:video-outline" : e.mediaKind === "audio" ? "mdi:music-note-outline" : "mdi:image-outline",
									width: "16"
								})
							}), /* @__PURE__ */ (0, q.jsxs)("span", {
								className: "min-w-0",
								children: [/* @__PURE__ */ (0, q.jsx)("span", {
									className: "block truncate text-canvas-text-secondary",
									children: e.label
								}), /* @__PURE__ */ (0, q.jsx)("span", {
									className: "block truncate text-[10px] text-canvas-text-muted",
									children: e.kind === "node" ? n ? e.id : i("素材已不可用") : i("用户上传素材")
								})]
							})]
						}, `${e.kind}-${e.id}-${t}`);
					})
				})] }),
				u.length > 0 && /* @__PURE__ */ (0, q.jsxs)("div", { children: [/* @__PURE__ */ (0, q.jsx)("p", {
					className: "mb-1 font-medium text-canvas-text-secondary",
					children: i("对象")
				}), /* @__PURE__ */ (0, q.jsx)("div", {
					className: "space-y-1",
					children: u.map((e, t) => /* @__PURE__ */ (0, q.jsxs)("div", {
						className: "rounded border border-canvas-border bg-canvas-surface/60 px-2 py-1.5",
						children: [
							/* @__PURE__ */ (0, q.jsx)("p", {
								className: "break-words text-canvas-text-secondary",
								children: e.title
							}),
							e.subtitle && /* @__PURE__ */ (0, q.jsx)("p", {
								className: "text-canvas-text-muted",
								children: e.subtitle
							}),
							e.fields?.map((e, t) => /* @__PURE__ */ (0, q.jsxs)("p", {
								className: "text-canvas-text-muted",
								children: [
									e.label,
									"：",
									/* @__PURE__ */ (0, q.jsx)("span", {
										className: "text-canvas-text-secondary",
										children: Ae(e.value, i)
									})
								]
							}, `${e.label}-${t}`)),
							e.preview && /* @__PURE__ */ (0, q.jsx)("p", {
								className: "mt-1 break-words border-t border-canvas-border pt-1 text-canvas-text-muted",
								children: e.preview
							})
						]
					}, `${e.id ?? e.title}-${t}`))
				})] }),
				d.length > 0 && /* @__PURE__ */ (0, q.jsxs)("div", { children: [/* @__PURE__ */ (0, q.jsx)("p", {
					className: "mb-1 font-medium text-canvas-text-secondary",
					children: i("变更")
				}), /* @__PURE__ */ (0, q.jsx)("div", {
					className: "space-y-1",
					children: d.map((e, t) => /* @__PURE__ */ (0, q.jsxs)("div", {
						className: "rounded border border-canvas-border bg-canvas-surface/60 px-2 py-1.5",
						children: [/* @__PURE__ */ (0, q.jsxs)("p", {
							className: "truncate text-canvas-text-secondary",
							children: [
								e.targetLabel || e.targetId,
								" · ",
								e.field
							]
						}), /* @__PURE__ */ (0, q.jsxs)("p", {
							className: "break-words text-canvas-text-muted",
							children: [
								Ae(e.before, i),
								/* @__PURE__ */ (0, q.jsx)(B, {
									icon: "mdi:arrow-right",
									width: "12",
									className: "mx-1 inline"
								}),
								/* @__PURE__ */ (0, q.jsx)("span", {
									className: "text-canvas-text-secondary",
									children: Ae(e.after, i)
								})
							]
						})]
					}, `${e.targetId}-${e.field}-${t}`))
				})] }),
				t?.fields?.length ? /* @__PURE__ */ (0, q.jsxs)("div", { children: [/* @__PURE__ */ (0, q.jsx)("p", {
					className: "mb-1 font-medium text-canvas-text-secondary",
					children: i("结果")
				}), /* @__PURE__ */ (0, q.jsx)("dl", {
					className: "space-y-0.5",
					children: t.fields.map((e, t) => /* @__PURE__ */ (0, q.jsxs)("div", {
						className: "grid grid-cols-[72px_minmax(0,1fr)] gap-2",
						children: [/* @__PURE__ */ (0, q.jsx)("dt", {
							className: "text-canvas-text-muted",
							children: e.label
						}), /* @__PURE__ */ (0, q.jsx)("dd", {
							className: "break-words text-canvas-text-secondary",
							children: Ae(e.value, i)
						})]
					}, `${e.label}-${t}`))
				})] }) : null,
				(e?.note || t?.note) && /* @__PURE__ */ (0, q.jsx)("p", {
					className: "break-words text-canvas-text-muted",
					children: t?.note || e?.note
				})
			]
		})]
	});
}
//#endregion
//#region src/components/chat/AgentStepCard.tsx
var Ne = {
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
function Pe(e) {
	let t = e.toolCall?.startedAt ?? e.createdAt, n = e.toolCall?.finishedAt;
	if (!n || n < t) return null;
	let r = n - t;
	return r < 1e3 ? `${r}ms` : `${(r / 1e3).toFixed(1)}s`;
}
function Fe({ step: e }) {
	let t = r(), n = Ne[e.status], i = Pe(e), a = e.toolCall?.retryCount ?? 0, o = e.errorMessage || e.outputSummary || e.toolCall?.resultSummary;
	return /* @__PURE__ */ (0, q.jsxs)("div", {
		className: "agent-step-card flex gap-2 rounded-md px-0.5 py-1.5 transition-colors hover:bg-canvas-hover/25",
		children: [/* @__PURE__ */ (0, q.jsx)("span", {
			className: `mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${n.iconBg}`,
			children: /* @__PURE__ */ (0, q.jsx)(B, {
				icon: n.icon,
				width: "12",
				className: `${n.className} ${n.spin ? "animate-spin motion-reduce:animate-none" : ""}`
			})
		}), /* @__PURE__ */ (0, q.jsxs)("div", {
			className: "min-w-0 flex-1",
			children: [
				/* @__PURE__ */ (0, q.jsxs)("div", {
					className: "flex min-h-5 flex-wrap items-center gap-x-1.5 gap-y-0.5 text-[11px] leading-[17px]",
					children: [
						/* @__PURE__ */ (0, q.jsx)("span", {
							className: "truncate text-[12px] text-canvas-text-secondary",
							children: e.title
						}),
						/* @__PURE__ */ (0, q.jsx)("span", {
							className: `shrink-0 text-[10px] ${n.className}`,
							children: t(n.label)
						}),
						a > 0 && /* @__PURE__ */ (0, q.jsxs)("span", {
							className: "shrink-0 text-[10px] text-canvas-text-muted",
							children: ["· ", t("重试 {count}", { count: a })]
						}),
						i && /* @__PURE__ */ (0, q.jsx)("span", {
							className: "ml-auto shrink-0 text-[10px] tabular-nums text-canvas-text-muted",
							children: i
						})
					]
				}),
				e.toolCall?.inputSummary && /* @__PURE__ */ (0, q.jsx)("p", {
					className: "break-words text-[11px] leading-[17px] text-canvas-text-muted",
					children: e.toolCall.inputSummary
				}),
				o && o !== e.toolCall?.inputSummary && /* @__PURE__ */ (0, q.jsx)("p", {
					className: `break-words text-[11px] leading-[17px] ${e.status === "failed" ? "text-red-400/85" : "text-canvas-text-secondary"}`,
					children: o
				}),
				/* @__PURE__ */ (0, q.jsx)(Me, {
					input: e.toolCall?.inputDisplay,
					result: e.toolCall?.resultDisplay
				})
			]
		})]
	});
}
//#endregion
//#region src/components/chat/AgentApprovalCard.tsx
var Y = {
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
}, X = {
	text: "文本",
	image: "图片",
	video: "视频",
	audio: "音频"
}, Ie = {
	image: "生图",
	video: "视频",
	audio: "音频"
};
function Le(e) {
	return /* @__PURE__ */ (0, q.jsx)(Re, { ...e }, e.step.approval?.id ?? e.step.id);
}
function Re({ step: e, mediaModelOptions: t, mediaModelAvailability: n, onResolve: i }) {
	let a = r(), o = e.approval, s = o?.inputRequest, c = s?.kind === "media_model" ? s : void 0, l = s?.kind === "provider_models" ? s : void 0, [u, d] = (0, K.useState)(c?.selectedModelRef), [f, p] = (0, K.useState)([]), [m, h] = (0, K.useState)(""), [g, _] = (0, K.useState)(""), [v, y] = (0, K.useState)(1), b = Math.min(l?.maxSelection ?? 16, 16), x = (0, K.useMemo)(() => pe(l?.options ?? [], m, g, v), [
		l,
		m,
		g,
		v
	]), S = l?.catalog?.expiresAt, [C, w] = (0, K.useState)(() => Date.now());
	(0, K.useEffect)(() => {
		if (!S) return;
		let e = setTimeout(() => w(Date.now()), Math.max(0, S - Date.now()));
		return () => clearTimeout(e);
	}, [S]);
	let T = !!S && S <= C, E = (0, K.useMemo)(() => {
		let e = /* @__PURE__ */ new Map();
		for (let t of x.options) {
			let n = e.get(t.category) ?? [];
			n.push(t), e.set(t.category, n);
		}
		return [
			"text",
			"image",
			"video",
			"audio"
		].flatMap((t) => e.has(t) ? [[t, e.get(t)]] : []);
	}, [x]), D = (e) => {
		p((t) => U(t, [e], b));
	}, O = (e) => {
		p((t) => U(t, e, b));
	}, k = (0, K.useMemo)(() => {
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
	let A = Y[o.kind], j = !!c, M = !!l, N = k.some(([, e]) => e.some((e) => n[e.value])), P = !!u && !!n[u];
	return /* @__PURE__ */ (0, q.jsxs)("div", {
		className: "mt-2 border-l-2 border-amber-400/60 bg-amber-400/5 px-3 py-2.5",
		role: "group",
		"aria-label": a("{label}待确认", { label: a(A.label) }),
		children: [
			/* @__PURE__ */ (0, q.jsxs)("div", {
				className: "flex items-start gap-2",
				children: [/* @__PURE__ */ (0, q.jsx)(B, {
					icon: A.icon,
					width: "16",
					className: "mt-0.5 shrink-0 text-amber-400"
				}), /* @__PURE__ */ (0, q.jsxs)("div", {
					className: "min-w-0 flex-1",
					children: [
						/* @__PURE__ */ (0, q.jsxs)("p", {
							className: "text-xs font-medium text-amber-300",
							children: [
								a("待确认"),
								" · ",
								a(A.label)
							]
						}),
						/* @__PURE__ */ (0, q.jsx)("p", {
							className: "mt-1 break-words text-xs leading-[18px] text-canvas-text-secondary",
							children: e.toolCall?.inputSummary || o.summary
						}),
						/* @__PURE__ */ (0, q.jsx)(Me, {
							input: e.toolCall?.inputDisplay,
							defaultExpanded: !0
						})
					]
				})]
			}),
			o.kind === "config_write" && /* @__PURE__ */ (0, q.jsxs)("div", {
				className: "mt-2 flex items-start gap-1.5 border-t border-amber-300/15 pt-2 text-xs leading-[18px] text-canvas-text-secondary",
				children: [/* @__PURE__ */ (0, q.jsx)(B, {
					icon: "mdi:shield-key-outline",
					width: "14",
					className: "mt-0.5 shrink-0 text-amber-400"
				}), /* @__PURE__ */ (0, q.jsx)("span", { children: a("不会写入 API Key；新连接保持空白，已有连接保留原值。") })]
			}),
			c && /* @__PURE__ */ (0, q.jsxs)("div", {
				className: "mt-3 border-t border-amber-300/15 pt-2.5",
				children: [/* @__PURE__ */ (0, q.jsx)("p", {
					className: "mb-2 text-[11px] font-medium text-canvas-text",
					children: a("选择{kind}模型", { kind: a(Ie[c.mediaKind]) })
				}), N ? /* @__PURE__ */ (0, q.jsx)("div", {
					className: "max-h-40 space-y-2 overflow-y-auto pr-1",
					children: k.map(([e, t]) => /* @__PURE__ */ (0, q.jsxs)("div", { children: [/* @__PURE__ */ (0, q.jsx)("p", {
						className: "mb-1 text-[10px] text-canvas-text-muted",
						children: e
					}), /* @__PURE__ */ (0, q.jsx)("div", {
						className: "flex flex-wrap gap-1.5",
						children: t.map((e) => {
							let t = !!n[e.value], r = u === e.value;
							return /* @__PURE__ */ (0, q.jsxs)("button", {
								type: "button",
								disabled: !t,
								"aria-pressed": r,
								title: t ? e.description : a("模型未配置或当前不可用"),
								onClick: () => d(e.value),
								className: `flex min-h-7 max-w-full items-center gap-1 rounded-full border px-2.5 py-1 text-left text-[11px] leading-4 transition-colors active:scale-[0.98] motion-reduce:transform-none ${r ? "border-amber-300/70 bg-amber-300/15 text-amber-200" : t ? "border-canvas-border text-canvas-text-secondary hover:border-amber-300/40 hover:text-canvas-text" : "cursor-not-allowed border-canvas-border/50 text-canvas-text-muted opacity-45"}`,
								children: [r && /* @__PURE__ */ (0, q.jsx)(B, {
									icon: "mdi:check",
									width: "13",
									className: "shrink-0"
								}), /* @__PURE__ */ (0, q.jsx)("span", {
									className: "break-words",
									children: e.label
								})]
							}, e.value);
						})
					})] }, e))
				}) : /* @__PURE__ */ (0, q.jsx)("p", {
					className: "text-[11px] leading-[17px] text-canvas-text-muted",
					children: a("暂无可用模型，请先在设置中完成模型配置。")
				})]
			}),
			l && /* @__PURE__ */ (0, q.jsxs)("div", {
				className: "mt-3 border-t border-amber-300/15 pt-2.5",
				children: [
					/* @__PURE__ */ (0, q.jsx)("p", {
						className: "mb-2 text-[11px] font-medium text-canvas-text",
						children: a("勾选要接入的模型（已选 {selected} / {total}）", {
							selected: f.length,
							total: l.options.length
						})
					}),
					/* @__PURE__ */ (0, q.jsx)("p", {
						className: "mb-2 text-xs text-canvas-text-muted",
						role: "status",
						children: a("每批最多 {count} 个；筛选和翻页会保留已选项。", { count: b })
					}),
					T && /* @__PURE__ */ (0, q.jsx)("p", {
						role: "alert",
						className: "mb-2 text-xs text-canvas-text-secondary",
						children: a("模型目录已过期，请拒绝本次选择并重新读取目录。")
					}),
					/* @__PURE__ */ (0, q.jsxs)("div", {
						className: "mb-2 flex flex-wrap items-center gap-2",
						children: [
							/* @__PURE__ */ (0, q.jsx)("input", {
								className: "ui-input min-w-0 flex-1",
								"aria-label": a("搜索模型名称或 ID"),
								placeholder: a("搜索模型名称或 ID"),
								value: m,
								onChange: (e) => {
									h(e.target.value), y(1);
								}
							}),
							/* @__PURE__ */ (0, q.jsxs)("select", {
								className: "ui-select__control",
								"aria-label": a("模型分类"),
								value: g,
								onChange: (e) => {
									_(e.target.value), y(1);
								},
								children: [/* @__PURE__ */ (0, q.jsx)("option", {
									value: "",
									children: a("全部分类")
								}), Object.entries(X).map(([e, t]) => /* @__PURE__ */ (0, q.jsx)("option", {
									value: e,
									children: a(t)
								}, e))]
							}),
							/* @__PURE__ */ (0, q.jsx)("button", {
								type: "button",
								className: "ui-btn ui-btn--sm",
								disabled: !f.length,
								onClick: () => p([]),
								children: a("清空已选")
							})
						]
					}),
					x.total === 0 && /* @__PURE__ */ (0, q.jsx)("p", {
						className: "py-2 text-xs text-canvas-text-muted",
						children: a("没有匹配的模型")
					}),
					/* @__PURE__ */ (0, q.jsx)("div", {
						className: "max-h-64 space-y-2.5 overflow-y-auto pr-1",
						children: E.map(([e, t]) => {
							let n = t.map((e) => e.id), r = n.every((e) => f.includes(e));
							return /* @__PURE__ */ (0, q.jsxs)("div", { children: [/* @__PURE__ */ (0, q.jsxs)("div", {
								className: "mb-1 flex items-center justify-between gap-2",
								children: [/* @__PURE__ */ (0, q.jsxs)("p", {
									className: "text-[10px] text-canvas-text-muted",
									children: [
										a(X[e]),
										"（",
										t.length,
										"）"
									]
								}), /* @__PURE__ */ (0, q.jsx)("button", {
									type: "button",
									onClick: () => O(n),
									disabled: T || !r && f.length >= b,
									className: "min-h-6 rounded px-1.5 text-[10px] text-canvas-text-secondary hover:text-amber-300 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50",
									children: a(r ? "取消本页此类选择" : "选取本页此类（受批次上限限制）")
								})]
							}), /* @__PURE__ */ (0, q.jsx)("div", {
								className: "space-y-1",
								children: t.map((e) => {
									let t = f.includes(e.id);
									return /* @__PURE__ */ (0, q.jsxs)("label", {
										className: `flex min-h-7 cursor-pointer items-start gap-2 rounded border px-2 py-1 text-[11px] leading-4 transition-colors ${t ? "border-amber-300/70 bg-amber-300/10 text-amber-100" : "border-canvas-border text-canvas-text-secondary hover:border-amber-300/40 hover:text-canvas-text"}`,
										children: [/* @__PURE__ */ (0, q.jsx)("input", {
											type: "checkbox",
											checked: t,
											disabled: T || !t && f.length >= b,
											onChange: () => D(e.id),
											className: "mt-0.5 shrink-0 accent-amber-400"
										}), /* @__PURE__ */ (0, q.jsxs)("span", {
											className: "min-w-0 break-words",
											children: [e.name, /* @__PURE__ */ (0, q.jsx)("span", {
												className: "ml-1 text-canvas-text-muted",
												children: e.id
											})]
										})]
									}, e.id);
								})
							})] }, e);
						})
					}),
					/* @__PURE__ */ (0, q.jsxs)("div", {
						className: "mt-2 flex flex-wrap items-center justify-between gap-2 text-xs text-canvas-text-secondary",
						children: [/* @__PURE__ */ (0, q.jsxs)("span", { children: [
							a("筛选结果 {count} 个", { count: x.total }),
							" · ",
							x.page,
							" / ",
							x.pageCount
						] }), /* @__PURE__ */ (0, q.jsxs)("div", {
							className: "flex gap-2",
							children: [/* @__PURE__ */ (0, q.jsx)("button", {
								type: "button",
								className: "ui-btn ui-btn--sm",
								disabled: x.page <= 1,
								onClick: () => y(x.page - 1),
								children: a("上一页")
							}), /* @__PURE__ */ (0, q.jsx)("button", {
								type: "button",
								className: "ui-btn ui-btn--sm",
								disabled: x.page >= x.pageCount,
								onClick: () => y(x.page + 1),
								children: a("下一页")
							})]
						})]
					})
				]
			}),
			/* @__PURE__ */ (0, q.jsxs)("div", {
				className: "mt-3 flex justify-end gap-2",
				children: [/* @__PURE__ */ (0, q.jsx)("button", {
					type: "button",
					onClick: () => i(o.id, { approved: !1 }),
					className: "min-h-8 rounded-md px-3 py-1 text-xs text-canvas-text-secondary hover:bg-canvas-hover hover:text-canvas-text focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50",
					children: a("拒绝")
				}), /* @__PURE__ */ (0, q.jsx)("button", {
					type: "button",
					disabled: j && !P || o.status !== "pending" || T || M && (f.length === 0 || f.length > b),
					onClick: () => {
						o.status !== "pending" || l?.catalog && l.catalog.expiresAt <= Date.now() || M && (!f.length || f.length > b) || i(o.id, {
							approved: !0,
							...j ? { inputValues: { modelRef: u } } : {},
							...M ? { inputValues: { selectedModelIds: f } } : {}
						});
					},
					className: "min-h-8 rounded-md bg-amber-500 px-3 py-1 text-xs font-medium text-black hover:bg-amber-400 disabled:cursor-not-allowed disabled:opacity-40 focus:outline-none focus-visible:ring-2 focus-visible:ring-amber-400",
					children: j ? a("确认生成") : M ? a("接入选中的 {count} 个模型", { count: f.length }) : a("确认执行")
				})]
			})
		]
	});
}
//#endregion
//#region src/services/chat/agentExecutionRationale.ts
var Z = {
	waiting_approval: "任务正在等待用户确认",
	paused: "任务已暂停",
	completed: "任务已完成",
	failed: "任务执行失败",
	stopped: "任务已停止"
};
function ze(e, t) {
	let n = t.data?.callId;
	if (n) return e.steps.find((e) => e.toolCall?.callId === n);
}
function Be(e, t) {
	return ze(e, t)?.title || t.data?.toolId || "工具操作";
}
function Ve(e) {
	if (e !== void 0) return e < 1e3 ? `${Math.max(0, Math.round(e))}ms` : `${(e / 1e3).toFixed(1)}s`;
}
function He(e) {
	let t = [], n = Ve(e.data?.durationMs);
	return n && t.push(n), (e.data?.retryCount ?? 0) > 0 && t.push(`重试 ${e.data?.retryCount} 次`), t.length > 0 ? t.join(" · ") : void 0;
}
function Ue(e, t) {
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
function We(e, t, n) {
	let r = ze(e, t), i = Be(e, t), a = {
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
			meta: He(t)
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
				detail: Ue(e, t.data?.effect)
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
				meta: He(t)
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
			if (!e || !(e in Z)) return null;
			let n = e === "failed" ? "error" : e === "waiting_approval" || e === "paused" ? "warning" : e === "completed" ? "success" : "muted";
			return {
				...a,
				kind: "control",
				tone: n,
				title: Z[e]
			};
		}
		default: return null;
	}
}
function Ge(e) {
	let t = e.events ?? [], n = t.filter((e) => e.type === "model_round_start").length, r = Math.max(0, e.modelRounds - n), i = [];
	for (let n of t) {
		n.type === "model_round_start" && (r += 1);
		let t = We(e, n, Math.max(r, 1));
		t && i.push(t);
	}
	return i.slice(-16);
}
//#endregion
//#region src/components/chat/AgentExecutionRationale.tsx
var Ke = new Set([
	"queued",
	"planning",
	"running",
	"waiting_tool",
	"waiting_approval"
]), qe = {
	analysis: "mdi:head-cog-outline",
	decision: "mdi:shield-check-outline",
	action: "mdi:play-circle-outline",
	observation: "mdi:clipboard-text-outline",
	control: "mdi:source-branch"
}, Je = {
	active: "text-indigo-300 bg-indigo-500/10",
	success: "text-emerald-400 bg-emerald-500/10",
	warning: "text-amber-400 bg-amber-500/10",
	error: "text-red-400 bg-red-500/10",
	muted: "text-canvas-text-muted bg-canvas-hover/60"
};
function Ye({ task: e }) {
	let t = r(), n = Ge(e), [i, a] = (0, K.useState)(() => Ke.has(e.status));
	if (n.length === 0) return null;
	let o = n.at(-1);
	return /* @__PURE__ */ (0, q.jsxs)("div", {
		className: "mt-2 rounded-md border border-canvas-border bg-canvas-card/80",
		children: [/* @__PURE__ */ (0, q.jsxs)("button", {
			type: "button",
			"aria-expanded": i,
			onClick: () => a((e) => !e),
			className: "flex min-h-8 w-full items-center gap-1.5 rounded-md px-2 text-left transition-colors hover:bg-canvas-hover focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40",
			children: [
				/* @__PURE__ */ (0, q.jsx)(B, {
					icon: "mdi:timeline-text-outline",
					width: "14",
					className: "shrink-0 text-indigo-300/90"
				}),
				/* @__PURE__ */ (0, q.jsx)("span", {
					className: "shrink-0 text-[11px] font-medium text-canvas-text-secondary",
					children: t("执行依据")
				}),
				/* @__PURE__ */ (0, q.jsx)("span", {
					className: "min-w-0 truncate text-[10px] text-canvas-text-muted",
					children: o?.title
				}),
				/* @__PURE__ */ (0, q.jsx)("span", {
					className: "ml-auto shrink-0 text-[10px] text-canvas-text-muted",
					children: t("{count} 项", { count: n.length })
				}),
				/* @__PURE__ */ (0, q.jsx)(B, {
					icon: i ? "mdi:chevron-up" : "mdi:chevron-down",
					width: "14",
					className: "shrink-0 text-canvas-text-muted"
				})
			]
		}), i && /* @__PURE__ */ (0, q.jsxs)("div", {
			className: "border-t border-canvas-border px-2 py-2",
			children: [/* @__PURE__ */ (0, q.jsxs)("p", {
				className: "mb-2 flex items-start gap-1.5 text-[10px] leading-4 text-canvas-text-muted",
				children: [/* @__PURE__ */ (0, q.jsx)(B, {
					icon: "mdi:information-outline",
					width: "12",
					className: "mt-0.5 shrink-0"
				}), /* @__PURE__ */ (0, q.jsx)("span", { children: t("来自可验证的任务事件，不包含模型隐藏思维。") })]
			}), /* @__PURE__ */ (0, q.jsx)("ol", {
				className: "space-y-1.5",
				children: n.map((e) => /* @__PURE__ */ (0, q.jsxs)("li", {
					className: "flex gap-2 text-[11px] leading-[17px]",
					children: [/* @__PURE__ */ (0, q.jsx)("span", {
						className: `mt-px flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${Je[e.tone]}`,
						children: /* @__PURE__ */ (0, q.jsx)(B, {
							icon: qe[e.kind],
							width: "12"
						})
					}), /* @__PURE__ */ (0, q.jsxs)("span", {
						className: "min-w-0 flex-1",
						children: [/* @__PURE__ */ (0, q.jsxs)("span", {
							className: "flex flex-wrap items-baseline gap-x-1.5",
							children: [/* @__PURE__ */ (0, q.jsx)("span", {
								className: "break-words text-canvas-text-secondary",
								children: e.title
							}), e.meta && /* @__PURE__ */ (0, q.jsx)("span", {
								className: "text-[10px] tabular-nums text-canvas-text-muted",
								children: e.meta
							})]
						}), e.detail && /* @__PURE__ */ (0, q.jsx)("span", {
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
var Xe = {
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
}, Ze = {
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
}, Qe = [
	"queued",
	"planning",
	"running",
	"waiting_tool",
	"waiting_approval"
], $e = {
	web_search: "正在搜索网页",
	web_extract: "正在浏览网页",
	file_list_grants: "正在查看已授权文件",
	file_read_text: "正在读取文件",
	provider_docs_read: "正在读取接口文档"
};
function et(e) {
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
function tt(e, t, n) {
	return e.status === "waiting_approval" || t?.status === "waiting_approval" ? t ? n("等待确认：{title}", { title: t.title }) : n("等待用户确认") : t?.status === "pending" ? n("准备{title}", { title: t.title }) : t?.status === "running" ? $e[t.toolCall?.toolId ?? ""] ?? n("正在{title}", { title: t.title }) : e.status === "queued" ? n("正在等待执行") : e.status === "planning" ? e.steps.some((e) => e.status === "succeeded") ? n("正在分析工具结果") : n("正在分析请求") : e.status === "waiting_tool" ? n("正在调用工具") : e.status === "running" ? n("正在整理结果") : n(Xe[e.status].label);
}
function nt(e, t) {
	if (t?.toolCall?.startedAt) return t.toolCall.startedAt;
	let n = e.status === "planning" ? "model_round_start" : "tool_start";
	for (let t = (e.events?.length ?? 0) - 1; t >= 0; --t) {
		let r = e.events?.[t];
		if (r?.type === n) return r.timestamp;
	}
	return e.startedAt ?? e.createdAt;
}
function rt(e, t) {
	let n = Math.max(0, Math.floor((t - e) / 1e3));
	return n < 60 ? `${n}s` : `${Math.floor(n / 60)}m ${n % 60}s`;
}
function it(e) {
	return e < 1e3 ? `${Math.max(0, Math.round(e))}ms` : e < 6e4 ? `${(e / 1e3).toFixed(1)}s` : `${Math.floor(e / 6e4)}m ${Math.floor(e % 6e4 / 1e3)}s`;
}
function Q({ icon: e, label: t, onClick: n, tone: r = "default" }) {
	return /* @__PURE__ */ (0, q.jsxs)("button", {
		type: "button",
		onClick: n,
		"aria-label": t,
		className: `flex min-h-8 items-center gap-1.5 rounded-md px-2.5 py-1 text-xs transition-colors
                  focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50 ${r === "primary" ? "text-indigo-300 hover:bg-indigo-500/15" : r === "danger" ? "text-red-400 hover:bg-red-500/10" : "text-canvas-text-secondary hover:bg-canvas-hover hover:text-canvas-text"}`,
		children: [/* @__PURE__ */ (0, q.jsx)(B, {
			icon: e,
			width: "14"
		}), t]
	});
}
function at({ task: e, onResolveApproval: t, mediaModelOptions: n, mediaModelAvailability: i, onPause: a, onResume: o, onStop: s, onSkip: c, onReplan: l, onRewind: u }) {
	let d = r(), f = w.has(e.status), p = !!e.parentTaskId, [m, h] = (0, K.useState)(!f), g = Xe[e.status], _ = Qe.includes(e.status), v = et(e), y = tt(e, v, d), b = v?.toolCall?.inputSummary ?? v?.approval?.summary, x = nt(e, v), [S, C] = (0, K.useState)(() => Date.now());
	(0, K.useEffect)(() => {
		if (!_ || e.status === "waiting_approval") return;
		let t = window.setInterval(() => C(Date.now()), 1e3);
		return () => window.clearInterval(t);
	}, [
		v?.id,
		v?.status,
		_,
		e.status
	]);
	let T = e.steps.filter((e) => [
		"succeeded",
		"failed",
		"skipped",
		"stopped"
	].includes(e.status)).length, E = e.steps.find((e) => e.approval?.status === "pending"), D = e.status === "paused" || e.status === "failed" ? Oe(e.errorCode) : void 0, O = e.steps.some((e) => e.status === "succeeded" && !!e.toolCall?.canvasCheckpoint), k = e.metrics, A = k ? k.inputTokens + k.outputTokens : 0, j = e.startedAt ? Math.max(0, (e.completedAt ?? e.updatedAt) - e.startedAt) : 0, M = e.status === "completed" ? d("运行记录") : d(g.label);
	return /* @__PURE__ */ (0, q.jsxs)("div", {
		className: "agent-task-timeline mt-2 max-w-full py-0.5",
		children: [
			/* @__PURE__ */ (0, q.jsxs)("button", {
				type: "button",
				onClick: () => h((e) => !e),
				"aria-expanded": m,
				className: "flex min-h-7 w-full items-center gap-1.5 rounded-md px-0.5 text-left transition-colors hover:bg-canvas-hover/35 focus:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/40",
				children: [
					/* @__PURE__ */ (0, q.jsx)(B, {
						icon: g.icon,
						width: "14",
						className: `shrink-0 ${_ ? "text-canvas-text-muted" : g.className} ${g.spin ? "animate-spin motion-reduce:animate-none" : ""}`
					}),
					/* @__PURE__ */ (0, q.jsx)("span", {
						className: "min-w-0 truncate text-[12px] font-medium text-canvas-text-secondary",
						children: _ ? y : M
					}),
					_ && e.status !== "waiting_approval" && /* @__PURE__ */ (0, q.jsx)("span", {
						className: "shrink-0 text-[10px] tabular-nums text-canvas-text-muted",
						children: rt(x, S)
					}),
					/* @__PURE__ */ (0, q.jsxs)("span", {
						className: "ml-auto flex shrink-0 items-center gap-1.5 text-[10px] tabular-nums text-canvas-text-muted",
						children: [
							e.steps.length > 0 && /* @__PURE__ */ (0, q.jsx)("span", { children: d("{count} 步", { count: f ? e.steps.length : `${T}/${e.steps.length}` }) }),
							!_ && j > 0 && /* @__PURE__ */ (0, q.jsxs)("span", { children: ["· ", it(j)] }),
							/* @__PURE__ */ (0, q.jsx)(B, {
								icon: m ? "mdi:chevron-up" : "mdi:chevron-down",
								width: "15"
							})
						]
					})
				]
			}),
			_ && b && /* @__PURE__ */ (0, q.jsx)("p", {
				className: "break-words pl-5 text-[11px] leading-[17px] text-canvas-text-muted",
				children: b
			}),
			!!e.skillBindings?.length && /* @__PURE__ */ (0, q.jsxs)("div", {
				className: "mt-1 flex min-w-0 items-start gap-1.5 pl-5 text-[10px] leading-4 text-canvas-text-muted",
				children: [
					/* @__PURE__ */ (0, q.jsx)(B, {
						icon: "mdi:book-check-outline",
						width: "13",
						className: "mt-0.5 shrink-0 text-indigo-300/80"
					}),
					/* @__PURE__ */ (0, q.jsx)("span", {
						className: "shrink-0",
						children: d("已注入 Skill")
					}),
					/* @__PURE__ */ (0, q.jsx)("span", {
						className: "min-w-0 truncate text-canvas-text-secondary",
						children: e.skillBindings.map((e) => e.name).join("、")
					})
				]
			}),
			/* @__PURE__ */ (0, q.jsx)(Ye, { task: e }),
			m && k && (k.inputTokens > 0 || k.outputTokens > 0 || k.policyDenied > 0 || k.retryCount > 0) && /* @__PURE__ */ (0, q.jsxs)("div", {
				className: "mt-0.5 flex flex-wrap items-center gap-x-2 pl-5 text-[10px] tabular-nums text-canvas-text-muted",
				children: [
					A > 0 && /* @__PURE__ */ (0, q.jsxs)("span", { children: [A.toLocaleString(), " token"] }),
					k.policyDenied > 0 && /* @__PURE__ */ (0, q.jsx)("span", { children: d("{count} 次拒绝", { count: k.policyDenied }) }),
					k.retryCount > 0 && /* @__PURE__ */ (0, q.jsx)("span", { children: d("{count} 次重试", { count: k.retryCount }) })
				]
			}),
			e.status === "paused" && e.pausedReason && /* @__PURE__ */ (0, q.jsx)("p", {
				className: "mt-1.5 text-[11px] leading-[17px] text-amber-300/90",
				children: e.pausedReason ? d(Ze[e.pausedReason] ?? e.pausedReason) : ""
			}),
			e.status === "failed" && e.errorMessage && /* @__PURE__ */ (0, q.jsx)("p", {
				className: "mt-1.5 break-words text-[11px] leading-[17px] text-red-400/90",
				children: e.errorMessage
			}),
			D && /* @__PURE__ */ (0, q.jsxs)("p", {
				className: "mt-1 flex items-start gap-1.5 text-[11px] leading-[17px] text-canvas-text-muted",
				children: [/* @__PURE__ */ (0, q.jsx)(B, {
					icon: "mdi:lightbulb-on-outline",
					width: "13",
					className: "mt-0.5 shrink-0 text-amber-400/80"
				}), /* @__PURE__ */ (0, q.jsx)("span", {
					className: "break-words",
					children: D.hint
				})]
			}),
			m && /* @__PURE__ */ (0, q.jsxs)(q.Fragment, { children: [
				e.steps.length > 0 && /* @__PURE__ */ (0, q.jsx)("div", {
					className: "mt-1 space-y-0.5",
					children: e.steps.map((e) => /* @__PURE__ */ (0, q.jsx)(Fe, { step: e }, e.id))
				}),
				_ && !v && e.status !== "waiting_approval" && /* @__PURE__ */ (0, q.jsxs)("div", {
					className: "mt-0.5 flex items-center gap-1.5 rounded-md bg-canvas-hover/25 px-2 py-1.5",
					children: [
						/* @__PURE__ */ (0, q.jsx)(B, {
							icon: "mdi:loading",
							width: "14",
							className: "shrink-0 animate-spin motion-reduce:animate-none text-violet-400"
						}),
						/* @__PURE__ */ (0, q.jsx)("span", {
							className: "min-w-0 truncate text-[12px] text-canvas-text-secondary",
							children: y
						}),
						/* @__PURE__ */ (0, q.jsx)("span", {
							className: "ml-auto shrink-0 text-[10px] tabular-nums text-canvas-text-muted",
							children: rt(x, S)
						})
					]
				}),
				E && /* @__PURE__ */ (0, q.jsx)(Le, {
					step: E,
					mediaModelOptions: n,
					mediaModelAvailability: i,
					onResolve: t
				}, E.approval?.id),
				!f && !p && /* @__PURE__ */ (0, q.jsxs)("div", {
					className: "mt-2.5 flex flex-wrap items-center gap-1 border-t border-canvas-border/60 pt-2",
					children: [
						_ && e.status !== "waiting_approval" && /* @__PURE__ */ (0, q.jsx)(Q, {
							icon: "mdi:pause",
							label: d("暂停"),
							onClick: () => a(e.id)
						}),
						e.status === "paused" && /* @__PURE__ */ (0, q.jsx)(Q, {
							icon: "mdi:play",
							label: d("继续"),
							tone: "primary",
							onClick: () => o(e.id)
						}),
						E && /* @__PURE__ */ (0, q.jsx)(Q, {
							icon: "mdi:debug-step-over",
							label: d("跳过此步"),
							onClick: () => c(e.id, E.id)
						}),
						/* @__PURE__ */ (0, q.jsx)(Q, {
							icon: "mdi:refresh",
							label: d("重新规划"),
							onClick: () => l(e.id)
						}),
						/* @__PURE__ */ (0, q.jsx)(Q, {
							icon: "mdi:stop",
							label: d("停止"),
							tone: "danger",
							onClick: () => s(e.id)
						})
					]
				}),
				e.status === "failed" && !p && /* @__PURE__ */ (0, q.jsx)("div", {
					className: "mt-2.5 flex items-center gap-1 border-t border-canvas-border/60 pt-2",
					children: /* @__PURE__ */ (0, q.jsx)(Q, {
						icon: "mdi:play",
						label: d("继续"),
						tone: "primary",
						onClick: () => o(e.id)
					})
				}),
				!p && !_ && O && /* @__PURE__ */ (0, q.jsx)("div", {
					className: "mt-2.5 flex items-center gap-1 border-t border-canvas-border/60 pt-2",
					children: /* @__PURE__ */ (0, q.jsx)(Q, {
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
async function ot(e) {
	let t = W(e);
	if (t) try {
		await import("./dist-js-BTabQsg0.js").then(({ open: e }) => e(t));
	} catch {
		window.open(t, "_blank", "noopener,noreferrer");
	}
}
function st({ sources: e }) {
	let t = r();
	return e.length === 0 ? null : /* @__PURE__ */ (0, q.jsxs)("details", {
		className: "mt-3 border-t border-canvas-border/70 pt-2",
		children: [/* @__PURE__ */ (0, q.jsxs)("summary", {
			className: "flex cursor-pointer list-none items-center gap-1.5 text-[12px] text-canvas-text-secondary hover:text-canvas-text",
			children: [
				/* @__PURE__ */ (0, q.jsx)(B, {
					icon: "mdi:web",
					width: "14"
				}),
				t("来源（{count}）", { count: e.length }),
				/* @__PURE__ */ (0, q.jsx)(B, {
					icon: "mdi:chevron-down",
					width: "14",
					className: "ml-auto"
				})
			]
		}), /* @__PURE__ */ (0, q.jsx)("div", {
			className: "mt-2 space-y-1.5",
			children: e.map((e, t) => /* @__PURE__ */ (0, q.jsxs)("button", {
				type: "button",
				onClick: () => void ot(e.url),
				title: e.snippet,
				className: "flex w-full items-start gap-2 rounded-md border border-canvas-border/60 bg-canvas-bg/50 px-2 py-1.5 text-left hover:bg-canvas-card",
				children: [
					/* @__PURE__ */ (0, q.jsx)("span", {
						className: "mt-0.5 shrink-0 text-[11px] font-medium text-indigo-400",
						children: e.citationId || `S${t + 1}`
					}),
					/* @__PURE__ */ (0, q.jsxs)("span", {
						className: "min-w-0 flex-1",
						children: [/* @__PURE__ */ (0, q.jsx)("span", {
							className: "block truncate text-[12px] text-canvas-text",
							children: e.title
						}), /* @__PURE__ */ (0, q.jsx)("span", {
							className: "block truncate text-[11px] text-canvas-text-muted",
							children: e.domain
						})]
					}),
					/* @__PURE__ */ (0, q.jsx)(B, {
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
function ct(e) {
	let t = new Date(e), n = (e) => `${e}`.padStart(2, "0");
	return `${n(t.getHours())}:${n(t.getMinutes())}`;
}
function lt({ message: e, agentTask: t, onAddToCanvas: n, onRetryMediaSave: i, onEditMessage: a, regeneratePrompt: o, onRegenerate: s, onNodeActivate: c, onNodeHover: l, onModelActivate: u, agentControls: d }) {
	let f = r(), [p, m] = (0, K.useState)(!1), [h, g] = (0, K.useState)(!1), _ = e.role === "user";
	if (e.role === "system") return /* @__PURE__ */ (0, q.jsx)("div", {
		className: "chat-message-bubble chat-message-system flex justify-center",
		children: /* @__PURE__ */ (0, q.jsx)("span", {
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
	return /* @__PURE__ */ (0, q.jsxs)("div", {
		className: `chat-message-bubble group flex items-end gap-1.5 ${_ ? "justify-end chat-message-user" : "justify-start chat-message-assistant"}`,
		children: [
			!_ && /* @__PURE__ */ (0, q.jsx)(we, {
				size: 20,
				className: "chat-message-avatar chat-message-avatar-assistant shrink-0 mb-0.5"
			}),
			_ && /* @__PURE__ */ (0, q.jsx)("span", {
				className: "chat-message-time shrink-0 self-end mb-1 text-[11px] tabular-nums text-canvas-text-muted opacity-60 transition-opacity group-hover:opacity-100",
				children: ct(e.timestamp)
			}),
			/* @__PURE__ */ (0, q.jsxs)("div", {
				className: `chat-message-content max-w-[88%] text-[13px] leading-relaxed
                    ${_ ? "rounded-2xl rounded-br-sm bg-indigo-500/15 px-3.5 py-2 text-canvas-text" : "min-w-0 px-1 py-1 text-canvas-text"}`,
				children: [
					E && /* @__PURE__ */ (0, q.jsxs)("div", {
						className: "flex min-h-8 w-fit items-center gap-2 px-1 py-1.5 text-[12px] text-canvas-text-secondary",
						role: "status",
						"aria-live": "polite",
						children: [/* @__PURE__ */ (0, q.jsx)(B, {
							icon: "mdi:loading",
							width: "15",
							className: "shrink-0 animate-spin text-canvas-text-muted motion-reduce:animate-none"
						}), /* @__PURE__ */ (0, q.jsx)("span", { children: f("正在分析请求") })]
					}),
					e.content && (_ ? /* @__PURE__ */ (0, q.jsx)("div", {
						className: "whitespace-pre-wrap break-words",
						children: /* @__PURE__ */ (0, q.jsx)(ce, {
							value: e.content,
							compact: !0,
							onNodeActivate: c,
							onNodeHover: l,
							onModelActivate: u
						})
					}) : /* @__PURE__ */ (0, q.jsx)("div", {
						className: "rounded-2xl rounded-bl-sm border border-canvas-border/80 bg-canvas-card/80 px-3.5 py-2.5 text-canvas-text shadow-sm shadow-black/10 backdrop-blur-sm",
						children: /* @__PURE__ */ (0, q.jsx)(ue, {
							value: e.content,
							onNodeActivate: c,
							onNodeHover: l,
							onModelActivate: u
						})
					})),
					T && t && d && /* @__PURE__ */ (0, q.jsx)(at, {
						task: t,
						...d
					}),
					C && /* @__PURE__ */ (0, q.jsxs)("div", {
						className: "chat-message-media-generating flex items-center gap-2 mt-2 text-[11px] text-canvas-text-muted",
						children: [/* @__PURE__ */ (0, q.jsx)("span", { className: "inline-block w-4 h-4 border-2 border-indigo-400 border-t-transparent rounded-full animate-spin" }), f("正在生成媒体内容...")]
					}),
					b && !C && /* @__PURE__ */ (0, q.jsxs)("div", {
						className: "chat-message-image mt-1 pt-2 rounded-lg overflow-hidden border border-canvas-border",
						children: [/* @__PURE__ */ (0, q.jsx)(P, {
							src: v.url,
							alt: v.prompt || f("生成的图片"),
							className: "w-full h-auto max-h-[280px] object-contain bg-canvas-bg rounded-lg"
						}), v.prompt && /* @__PURE__ */ (0, q.jsx)("p", {
							className: "bg-canvas-bg/60 px-2 py-1.5 text-[11px] leading-[17px] text-canvas-text-muted",
							children: v.prompt
						})]
					}),
					x && !C && /* @__PURE__ */ (0, q.jsxs)("div", {
						className: "chat-message-video mt-2 rounded-lg overflow-hidden border border-canvas-border",
						children: [/* @__PURE__ */ (0, q.jsx)(F, {
							src: v.url,
							controls: !0,
							className: "w-full max-h-[280px] bg-canvas-bg",
							preload: "metadata",
							children: f("您的浏览器不支持视频播放")
						}), v.prompt && /* @__PURE__ */ (0, q.jsx)("p", {
							className: "bg-canvas-bg/60 px-2 py-1.5 text-[11px] leading-[17px] text-canvas-text-muted",
							children: v.prompt
						})]
					}),
					S && !C && /* @__PURE__ */ (0, q.jsxs)("div", {
						className: "chat-message-audio mt-2 rounded-lg border border-canvas-border bg-canvas-bg/60 p-2",
						children: [
							/* @__PURE__ */ (0, q.jsxs)("div", {
								className: "mb-2 flex items-center gap-1.5 text-[11px] text-canvas-text-secondary",
								children: [/* @__PURE__ */ (0, q.jsx)(B, {
									icon: v.audioPurpose === "music" ? "mdi:music-note" : "mdi:account-voice",
									width: "14"
								}), v.audioPurpose === "music" ? f("生成的音乐") : f("生成的语音")]
							}),
							/* @__PURE__ */ (0, q.jsx)("audio", {
								src: v.url,
								controls: !0,
								className: "h-9 w-full",
								preload: "metadata",
								children: f("您的浏览器不支持音频播放")
							}),
							v.prompt && /* @__PURE__ */ (0, q.jsx)("p", {
								className: "mt-1.5 text-[11px] leading-[17px] text-canvas-text-muted",
								children: v.prompt
							})
						]
					}),
					w && /* @__PURE__ */ (0, q.jsxs)("div", {
						className: "chat-message-media-unsaved mt-2 flex flex-wrap items-start gap-1.5 rounded-md border border-amber-400/30 bg-amber-400/10 px-2 py-1.5 text-[11px] text-amber-300",
						children: [
							/* @__PURE__ */ (0, q.jsx)(B, {
								icon: "mdi:content-save-alert-outline",
								width: "13",
								height: "13",
								className: "mt-0.5 shrink-0"
							}),
							/* @__PURE__ */ (0, q.jsx)("span", {
								className: "min-w-0 flex-1",
								children: f("已生成但未保存到项目：{error}", { error: v?.persistError || f("写入项目目录失败") })
							}),
							i && /* @__PURE__ */ (0, q.jsxs)("button", {
								type: "button",
								onClick: () => void O(),
								disabled: h,
								className: "flex min-h-6 shrink-0 items-center gap-1 rounded border border-amber-400/40 px-1.5 text-[11px] text-amber-200\n                           hover:bg-amber-400/15 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-amber-400/50 disabled:opacity-60",
								children: [/* @__PURE__ */ (0, q.jsx)(B, {
									icon: h ? "mdi:loading" : "mdi:download-outline",
									width: "12",
									className: h ? "animate-spin motion-reduce:animate-none" : void 0
								}), f(h ? "保存中" : "重试保存")]
							})
						]
					}),
					e.mediaStatus === "failed" && /* @__PURE__ */ (0, q.jsxs)("div", {
						className: "chat-message-media-error flex items-start gap-1 mt-2 text-[11px] text-red-400",
						children: [/* @__PURE__ */ (0, q.jsx)(B, {
							icon: "mdi:alert-circle-outline",
							width: "13",
							height: "13",
							className: "mt-0.5 shrink-0"
						}), /* @__PURE__ */ (0, q.jsx)("span", { children: f("媒体生成失败：{error}", { error: e.mediaError || f("未知错误") }) })]
					}),
					e.canvasStatus === "pending" && /* @__PURE__ */ (0, q.jsxs)("div", {
						className: "mt-2 flex items-center gap-1 text-[11px] text-blue-400",
						children: [/* @__PURE__ */ (0, q.jsx)(B, {
							icon: "mdi:vector-square",
							width: "13"
						}), f("正在创建画布节点...")]
					}),
					e.canvasStatus === "created" && e.canvasNodeId && /* @__PURE__ */ (0, q.jsxs)("div", {
						className: "mt-2 flex items-center gap-1 text-[11px] text-green-400",
						children: [/* @__PURE__ */ (0, q.jsx)(B, {
							icon: "mdi:check-circle-outline",
							width: "13"
						}), f("已添加到画布")]
					}),
					e.canvasStatus === "failed" && /* @__PURE__ */ (0, q.jsxs)("div", {
						className: "mt-2 flex items-start gap-1 text-[11px] text-red-400",
						children: [/* @__PURE__ */ (0, q.jsx)(B, {
							icon: "mdi:vector-square-remove",
							width: "13",
							className: "mt-0.5 shrink-0"
						}), /* @__PURE__ */ (0, q.jsx)("span", { children: f("节点创建失败：{error}", { error: e.canvasError || f("未知错误") }) })]
					}),
					!_ && e.sources && e.sources.length > 0 && /* @__PURE__ */ (0, q.jsx)(st, { sources: e.sources }),
					v && v.deliveryMode === "chat" && e.canvasStatus !== "created" && n && /* @__PURE__ */ (0, q.jsxs)("button", {
						type: "button",
						onClick: () => n(e.id),
						className: "mt-2 flex min-h-8 items-center gap-1.5 rounded-md border border-canvas-border px-2.5 py-1 text-xs text-canvas-text-secondary\n                       hover:bg-canvas-card hover:text-canvas-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
						children: [/* @__PURE__ */ (0, q.jsx)(B, {
							icon: "mdi:plus-box-outline",
							width: "14"
						}), f("添加到画布")]
					}),
					e.status === "streaming" && !!e.content && /* @__PURE__ */ (0, q.jsx)("span", { className: "chat-message-status chat-message-status-streaming inline-block w-1.5 h-3.5 bg-indigo-400/80 animate-pulse ml-1 align-text-bottom rounded-full" }),
					e.status === "error" && /* @__PURE__ */ (0, q.jsxs)("div", {
						className: "chat-message-status chat-message-status-error flex items-center gap-1 mt-1 text-[11px] text-red-400",
						children: [/* @__PURE__ */ (0, q.jsx)(B, {
							icon: "mdi:alert-circle",
							width: "12",
							height: "12"
						}), f("响应失败")]
					}),
					e.status === "interrupted" && /* @__PURE__ */ (0, q.jsxs)("div", {
						className: "chat-message-status chat-message-status-interrupted flex items-center gap-1 mt-1 text-[11px] text-amber-400",
						children: [/* @__PURE__ */ (0, q.jsx)(B, {
							icon: "mdi:alert-outline",
							width: "12",
							height: "12"
						}), f("响应中断")]
					}),
					!!e.content && /* @__PURE__ */ (0, q.jsxs)("div", {
						className: `mt-1 flex h-7 items-center gap-0.5 transition-opacity sm:opacity-0 sm:group-hover:opacity-100 sm:group-focus-within:opacity-100 ${_ ? "justify-end" : "justify-start"}`,
						children: [
							/* @__PURE__ */ (0, q.jsx)("button", {
								type: "button",
								onClick: () => void k(),
								"aria-label": f(p ? "消息已复制" : "复制消息"),
								"data-tooltip": f(p ? "已复制" : "复制"),
								className: "flex h-7 w-7 items-center justify-center rounded-md text-canvas-text-muted transition-colors hover:bg-canvas-hover hover:text-canvas-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
								children: /* @__PURE__ */ (0, q.jsx)(B, {
									icon: p ? "mdi:check" : "mdi:content-copy",
									width: "14"
								})
							}),
							_ && a && /* @__PURE__ */ (0, q.jsx)("button", {
								type: "button",
								onClick: () => a(e.content),
								"aria-label": f("编辑并再次发送"),
								"data-tooltip": f("编辑并再次发送"),
								className: "flex h-7 w-7 items-center justify-center rounded-md text-canvas-text-muted transition-colors hover:bg-canvas-hover hover:text-canvas-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
								children: /* @__PURE__ */ (0, q.jsx)(B, {
									icon: "mdi:pencil-outline",
									width: "14"
								})
							}),
							D && /* @__PURE__ */ (0, q.jsx)("button", {
								type: "button",
								onClick: () => s?.(o || ""),
								"aria-label": f("再次生成回答"),
								"data-tooltip": f("再次生成"),
								className: "flex h-7 w-7 items-center justify-center rounded-md text-canvas-text-muted transition-colors hover:bg-canvas-hover hover:text-canvas-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
								children: /* @__PURE__ */ (0, q.jsx)(B, {
									icon: "mdi:refresh",
									width: "15"
								})
							})
						]
					})
				]
			}),
			!_ && /* @__PURE__ */ (0, q.jsx)("span", {
				className: "chat-message-time shrink-0 self-end mb-1 text-[11px] tabular-nums text-canvas-text-muted opacity-60 transition-opacity group-hover:opacity-100",
				children: ct(e.timestamp)
			})
		]
	});
}
var ut = (0, K.memo)(lt), dt = [
	"现在有几个失败节点？",
	"选中 3 号节点",
	"删除失败节点"
];
function ft({ onNew: e, onList: t, onOpenAgents: n, onExample: i }) {
	let a = r();
	return /* @__PURE__ */ (0, q.jsxs)("div", {
		className: "chat-empty-state flex flex-col items-center justify-center h-full text-center px-6",
		children: [
			/* @__PURE__ */ (0, q.jsx)(we, {
				size: 72,
				className: "mb-5"
			}),
			/* @__PURE__ */ (0, q.jsx)("h3", {
				className: "text-base font-semibold text-canvas-text mb-2",
				children: a("AI 助手")
			}),
			/* @__PURE__ */ (0, q.jsx)("p", {
				className: "text-sm text-canvas-text-secondary mb-6 max-w-[260px]",
				children: a("直接开始对话，或按需安装智能体来扩展专业能力。没有智能体时，默认助手仍可正常使用。")
			}),
			/* @__PURE__ */ (0, q.jsxs)("div", {
				className: "chat-empty-state-actions flex flex-col gap-2 w-48",
				children: [
					/* @__PURE__ */ (0, q.jsxs)(L, {
						className: "flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl\n                     bg-brand text-white text-sm font-medium hover:bg-brand-light transition-colors",
						onClick: e,
						children: [/* @__PURE__ */ (0, q.jsx)(B, {
							icon: "mdi:plus",
							width: "16",
							height: "16"
						}), a("新建对话")]
					}),
					/* @__PURE__ */ (0, q.jsxs)(L, {
						className: "flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl\n                     bg-canvas-hover text-canvas-text-secondary text-sm hover:text-canvas-text\n                     hover:bg-canvas-border transition-colors",
						onClick: t,
						children: [/* @__PURE__ */ (0, q.jsx)(B, {
							icon: "mdi:history",
							width: "16",
							height: "16"
						}), a("历史记录")]
					}),
					n && /* @__PURE__ */ (0, q.jsxs)(L, {
						className: "flex items-center justify-center gap-2 w-full px-4 py-2.5 rounded-xl\n                       border border-canvas-border bg-canvas-card text-canvas-text-secondary text-sm\n                       hover:border-brand/40 hover:bg-brand/10 hover:text-canvas-text transition-colors",
						onClick: n,
						children: [/* @__PURE__ */ (0, q.jsx)(B, {
							icon: "lucide:bot",
							width: "16",
							height: "16"
						}), a("智能体中心")]
					})
				]
			}),
			i && /* @__PURE__ */ (0, q.jsxs)("div", {
				className: "chat-empty-state-examples mt-8 space-y-2 w-56",
				children: [/* @__PURE__ */ (0, q.jsx)("p", {
					className: "text-[11px] text-canvas-text-muted mb-2",
					children: a("试试这些：")
				}), dt.map((e) => /* @__PURE__ */ (0, q.jsx)("button", {
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
var pt = [
	"现在有几个失败节点？",
	"选中 3 号节点",
	"删除失败节点"
], mt = [], ht = 80, gt = 60;
function _t(e, t, n = "") {
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
function vt({ messages: e, agentTasks: t = mt, showEmptyState: n, detachedInitialized: i, onNewConversation: a, onShowList: o, onOpenAgents: s, onAddMediaToCanvas: c, onRetryMediaSave: l, agentControls: u, onExampleClick: d, onEditMessage: f, onRegenerateMessage: p, onNodeActivate: m, onNodeHover: h, onModelActivate: g }) {
	let _ = r(), v = ee(), y = e[0]?.conversationId ?? "", b = (0, K.useRef)(null), x = (0, K.useRef)(!0), S = (0, K.useRef)(y), C = (0, K.useRef)({
		conversationId: y,
		messages: []
	}), w = (0, K.useRef)(null), [T, E] = (0, K.useState)({
		conversationId: y,
		isNearBottom: !0,
		unreadCount: 0
	}), [D, O] = (0, K.useState)({
		conversationId: y,
		limit: ht,
		messageCount: e.length
	}), k = T.conversationId === y ? T.isNearBottom : !0, A = T.conversationId === y ? T.unreadCount : 0, j = D.conversationId === y ? D.limit : ht, M = D.conversationId === y && !k ? Math.max(0, e.length - D.messageCount) : 0, N = Math.min(e.length, j + M), P = Math.max(0, e.length - N), F = (0, K.useMemo)(() => P === 0 ? e : e.slice(P), [e, P]), I = (0, K.useMemo)(() => {
		for (let t = P - 1; t >= 0; --t) if (e[t]?.role === "user") return e[t].content;
		return "";
	}, [e, P]), L = P, R = (0, K.useMemo)(() => new Map(t.map((e) => [e.id, e])), [t]), te = (0, K.useMemo)(() => _t(F, (e, t) => /* @__PURE__ */ (0, q.jsx)(ut, {
		message: e,
		agentTask: e.agentTaskId ? R.get(e.agentTaskId) : void 0,
		onAddToCanvas: c,
		onRetryMediaSave: l,
		onEditMessage: f,
		regeneratePrompt: t,
		onRegenerate: p,
		onNodeActivate: m,
		onNodeHover: h,
		onModelActivate: g,
		agentControls: u
	}, e.id), I), [
		u,
		R,
		I,
		c,
		l,
		f,
		g,
		m,
		h,
		p,
		F
	]), ne = (0, K.useCallback)(() => {
		let t = b.current;
		t && (w.current = {
			conversationId: y,
			height: t.scrollHeight,
			top: t.scrollTop
		}), O((t) => ({
			conversationId: y,
			limit: Math.min(e.length, (t.conversationId === y ? N : ht) + gt),
			messageCount: e.length
		}));
	}, [
		y,
		e.length,
		N
	]);
	(0, K.useLayoutEffect)(() => {
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
				limit: ht,
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
		N,
		D.conversationId
	]);
	let re = (0, K.useCallback)((t) => {
		let n = t.currentTarget, r = n.scrollHeight - n.scrollTop - n.clientHeight < 80, i = x.current;
		x.current = r, E((e) => ({
			conversationId: y,
			isNearBottom: r,
			unreadCount: r ? 0 : e.conversationId === y ? e.unreadCount : 0
		})), i !== r && O({
			conversationId: y,
			limit: r ? ht : N,
			messageCount: e.length
		});
	}, [
		y,
		e.length,
		N
	]), z = (0, K.useCallback)(() => {
		let e = b.current;
		if (!e) return;
		let t = e.style.scrollBehavior;
		e.style.scrollBehavior = "auto", e.scrollTop = e.scrollHeight, e.style.scrollBehavior = t;
	}, []);
	(0, K.useEffect)(() => {
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
	let ie = (0, K.useCallback)(() => {
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
			limit: ht,
			messageCount: e.length
		}), requestAnimationFrame(z));
	}, [
		y,
		z,
		e.length,
		v
	]);
	return (0, K.useEffect)(() => () => {
		h?.(null);
	}, [h]), /* @__PURE__ */ (0, q.jsxs)("div", {
		className: "chat-panel-messages-shell relative flex-1 min-h-0",
		children: [/* @__PURE__ */ (0, q.jsxs)("div", {
			ref: b,
			onScroll: re,
			className: "chat-panel-messages h-full min-h-0 overflow-y-auto px-3.5 py-3 flex flex-col gap-3",
			children: [
				n && i && /* @__PURE__ */ (0, q.jsx)(ft, {
					onNew: a,
					onList: o,
					onOpenAgents: s,
					onExample: d
				}),
				!n && e.length === 0 && i && /* @__PURE__ */ (0, q.jsxs)("div", {
					className: "chat-panel-start-hint flex flex-col items-center justify-center h-full text-center px-4",
					children: [
						/* @__PURE__ */ (0, q.jsx)("div", {
							className: "w-11 h-11 rounded-xl bg-indigo-500/12 flex items-center justify-center mb-3",
							children: /* @__PURE__ */ (0, q.jsx)(B, {
								icon: "mdi:chat-processing-outline",
								width: "20",
								height: "20",
								className: "text-indigo-400"
							})
						}),
						/* @__PURE__ */ (0, q.jsx)("p", {
							className: "text-[13px] text-canvas-text-secondary mb-0.5",
							children: _("开始对话")
						}),
						/* @__PURE__ */ (0, q.jsx)("p", {
							className: "text-[11px] text-canvas-text-muted mb-4",
							children: _("用自然语言操作画布，AI 助手帮你完成")
						}),
						d && /* @__PURE__ */ (0, q.jsx)("div", {
							className: "flex flex-wrap justify-center gap-1.5 max-w-[260px]",
							children: pt.map((e) => /* @__PURE__ */ (0, q.jsx)("button", {
								type: "button",
								onClick: () => d(e),
								className: "rounded-full border border-canvas-border px-2.5 py-1 text-[11px] text-canvas-text-secondary\n                               hover:border-indigo-400/50 hover:text-canvas-text transition-colors",
								children: _(e)
							}, e))
						})
					]
				}),
				L > 0 && /* @__PURE__ */ (0, q.jsx)("button", {
					type: "button",
					onClick: ne,
					className: "mx-auto min-h-8 rounded-md border border-canvas-border px-3 py-1 text-[11px] text-canvas-text-secondary transition-colors hover:bg-canvas-hover hover:text-canvas-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
					children: _("加载更早消息（还有 {count} 条）", { count: L })
				}),
				te,
				/* @__PURE__ */ (0, q.jsx)("div", {})
			]
		}), !k && /* @__PURE__ */ (0, q.jsxs)("button", {
			type: "button",
			onClick: ie,
			"aria-label": A > 0 ? _("回到最新消息，{count} 条未读", { count: A }) : _("回到最新消息"),
			className: "absolute bottom-3 left-1/2 z-10 flex h-8 -translate-x-1/2 items-center gap-1.5 rounded-full border border-canvas-border bg-canvas-surface/95 px-3 text-[11px] font-medium text-canvas-text-secondary shadow-lg shadow-black/25 backdrop-blur-md transition-[border-color,color,transform] hover:border-indigo-400/45 hover:text-canvas-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50 active:translate-y-px",
			children: [
				/* @__PURE__ */ (0, q.jsx)(B, {
					icon: "mdi:arrow-down",
					width: "14"
				}),
				/* @__PURE__ */ (0, q.jsx)("span", { children: _("最新消息") }),
				A > 0 && /* @__PURE__ */ (0, q.jsx)("span", {
					className: "min-w-4 rounded-full bg-indigo-400/20 px-1 text-center text-[10px] tabular-nums text-indigo-200",
					children: A > 99 ? "99+" : A
				})
			]
		})]
	});
}
//#endregion
//#region src/components/chat/ContextUsageIndicator.tsx
var $ = 18, yt = 2.5, bt = ($ - yt) / 2, xt = 2 * Math.PI * bt;
function St({ usage: e }) {
	let t = r();
	if (!e) return null;
	let n = Math.min(1, Math.max(0, e.ratio)), i = Math.round(e.ratio * 100), a = e.ratio >= .9 ? "#f87171" : e.ratio >= .75 ? "#fbbf24" : "#818cf8", o = e.source === "declared" ? t("模型配置声明") : e.source === "catalog" ? t("按模型 ID 推断") : t("未识别模型，使用保守默认值");
	return /* @__PURE__ */ (0, q.jsx)("span", {
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
		children: /* @__PURE__ */ (0, q.jsxs)("svg", {
			width: $,
			height: $,
			viewBox: `0 0 ${$} ${$}`,
			className: "-rotate-90",
			children: [/* @__PURE__ */ (0, q.jsx)("circle", {
				cx: $ / 2,
				cy: $ / 2,
				r: bt,
				fill: "none",
				stroke: "currentColor",
				strokeWidth: yt,
				className: "text-canvas-border"
			}), /* @__PURE__ */ (0, q.jsx)("circle", {
				cx: $ / 2,
				cy: $ / 2,
				r: bt,
				fill: "none",
				stroke: a,
				strokeWidth: yt,
				strokeLinecap: "round",
				strokeDasharray: xt,
				strokeDashoffset: xt * (1 - n)
			})]
		})
	});
}
//#endregion
//#region src/components/chat/ChatComposerEditor.tsx
var Ct = "​", wt = /@\{([^:}\r\n]+):([^}\r\n]+)\}|@model\{([^|}\r\n]+)\|([^}\r\n]*)\}|@skill\{([^|}\r\n]+)\|([^}\r\n]*)\}|@drama\{([^:}\r\n]+):([^}\r\n]+)\}/g, Tt = /@\{[^:}\r\n]+:[^}\r\n]+\}|@model\{[^|}\r\n]+\|[^}\r\n]*\}|@skill\{[^|}\r\n]+\|[^}\r\n]*\}|@drama\{[^:}\r\n]+:[^}\r\n]+\}/, Et = {
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
}, Dt = {
	node: "节点",
	model: "模型",
	skill: "Skill",
	drama: "资产"
};
function Ot(e) {
	try {
		return decodeURIComponent(e);
	} catch {
		return e;
	}
}
function kt(e) {
	return e.replace(/}/g, "").trim();
}
function At(e) {
	return e.kind === "node" ? `@{${e.id}:${kt(e.label) || "节点"}}` : e.kind === "model" ? `@model{${e.id}|${kt(e.label) || "模型"}}` : e.kind === "drama" ? `@drama{${e.id}:${kt(e.label) || "资产"}}` : `@skill{${e.id}|${encodeURIComponent(e.label)}}`;
}
function jt(e, t) {
	let n = e[0];
	return e[1] === void 0 ? e[3] === void 0 ? e[5] === void 0 ? {
		kind: "drama",
		id: e[7],
		label: e[8] || "资产",
		raw: n
	} : {
		kind: "skill",
		id: e[5],
		label: Ot(e[6]) || "Skill",
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
function Mt(e) {
	return !!e && e.nodeType === Node.ELEMENT_NODE && e.hasAttribute("data-chat-reference");
}
function Nt(e) {
	return !!e && e.nodeType === Node.ELEMENT_NODE && e.tagName === "BR";
}
function Pt(e) {
	let t = e.previousSibling;
	(!t || Nt(t) || Mt(t)) && e.parentNode?.insertBefore(document.createTextNode(Ct), e);
}
function Ft(e) {
	let t = document.createElement("span");
	t.contentEditable = "false", t.setAttribute("data-chat-reference", e.kind), t.setAttribute("data-chat-reference-raw", e.raw);
	let n = Et[e.kind];
	t.setAttribute("aria-label", `${Dt[e.kind]} ${e.label}${e.kind === "node" && e.displayId != null ? `，编号 ${e.displayId}` : ""}`), t.className = `mx-0.5 inline-flex max-w-[min(100%,18rem)] select-none items-center align-middle
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
function It(e, t) {
	t && t.split("\n").forEach((t, n) => {
		n > 0 && e.push(document.createElement("br")), t && e.push(document.createTextNode(t));
	});
}
function Lt(e, t) {
	let n = [], r = 0;
	for (let i of e.matchAll(wt)) {
		let a = i.index;
		if (a == null) continue;
		It(n, e.slice(r, a));
		let o = Ft(jt(i, t)), s = n[n.length - 1];
		(!s || Nt(s) || Mt(s)) && n.push(document.createTextNode(Ct)), n.push(o), r = a + i[0].length;
	}
	return It(n, e.slice(r)), n;
}
function Rt(e) {
	let t = "", n = (e) => {
		if (e.nodeType === Node.TEXT_NODE) {
			t += (e.textContent || "").split(Ct).join("");
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
function zt(e) {
	let t = (e) => e.nodeType === Node.TEXT_NODE ? Tt.test(e.textContent || "") : e.nodeType !== Node.ELEMENT_NODE || Mt(e) ? !1 : Array.from(e.childNodes).some(t);
	return Array.from(e.childNodes).some(t);
}
function Bt(e) {
	let t = window.getSelection();
	if (!t) return;
	let n = document.createRange();
	n.selectNodeContents(e), n.collapse(!1), t.removeAllRanges(), t.addRange(n);
}
function Vt(e) {
	if (e.startContainer.nodeType === Node.TEXT_NODE) return {
		node: e.startContainer,
		offset: e.startOffset
	};
	if (e.startContainer.nodeType !== Node.ELEMENT_NODE || e.startOffset === 0) return null;
	let t = e.startContainer.childNodes[e.startOffset - 1] ?? null;
	for (; t?.nodeType === Node.ELEMENT_NODE && !Mt(t);) t = t.lastChild;
	return t?.nodeType === Node.TEXT_NODE ? {
		node: t,
		offset: t.textContent?.length ?? 0
	} : null;
}
var Ht = (0, K.forwardRef)(function({ value: e, onChange: t, onSubmit: n, nodeDisplayIds: i, onMentionQueryChange: a, onSlashQueryChange: o, onSuggestionKeyDown: s, suggestionListId: c, activeSuggestionId: l, suggestionsOpen: u = !1, placeholder: d, disabled: f = !1 }, p) {
	let m = r(), h = (0, K.useRef)(null), g = (0, K.useRef)(null), _ = (0, K.useRef)(null), v = (0, K.useCallback)(() => {
		h.current && t(Rt(h.current));
	}, [t]), y = (0, K.useCallback)(() => {
		let e = h.current, t = window.getSelection();
		if (!e || !t?.rangeCount) return;
		let n = t.getRangeAt(0);
		e.contains(n.startContainer) && (g.current = n.cloneRange());
	}, []), b = (0, K.useCallback)(() => {
		let e = h.current, t = window.getSelection();
		if (!e || !t?.rangeCount) return;
		let n = t.getRangeAt(0), r = Vt(n);
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
	(0, K.useEffect)(() => {
		let t = h.current;
		if (!t || Rt(t) === e && !zt(t)) return;
		let n = document.activeElement === t;
		t.innerHTML = "";
		for (let n of Lt(e, i)) t.appendChild(n);
		n && Bt(t);
	}, [i, e]), (0, K.useEffect)(() => {
		let e = () => h.current?.focus();
		return window.addEventListener("chat-focus-composer", e), () => window.removeEventListener("chat-focus-composer", e);
	}, []), (0, K.useImperativeHandle)(p, () => ({
		focus: () => h.current?.focus(),
		insertReference: (e) => {
			let t = h.current;
			if (!t || f) return;
			t.focus();
			let n = window.getSelection(), r = _.current ?? g.current, i = r && t.contains(r.startContainer) ? r.cloneRange() : document.createRange();
			(!r || !t.contains(r.startContainer)) && (i.selectNodeContents(t), i.collapse(!1)), i.deleteContents();
			let s = At(e), c = Ft({
				...e,
				raw: s
			});
			i.insertNode(c), Pt(c);
			let l = document.createTextNode(" ");
			c.parentNode?.insertBefore(l, c.nextSibling), i.setStart(l, 1), i.collapse(!0), n?.removeAllRanges(), n?.addRange(i), g.current = i.cloneRange(), _.current = null, a(null), o(null), v();
		}
	}), [
		f,
		v,
		a,
		o
	]);
	let x = (0, K.useCallback)(() => {
		let e = h.current;
		e && (!e.textContent && !e.querySelector("[data-chat-reference]") && (e.innerHTML = ""), y(), b(), v());
	}, [
		y,
		b,
		v
	]), S = (0, K.useCallback)((e) => {
		let t = h.current, n = window.getSelection();
		if (!t || !n?.rangeCount) return !1;
		let r = n.getRangeAt(0);
		if (!r.collapsed || !t.contains(r.startContainer)) return !1;
		let i = null;
		if (r.startContainer.nodeType === Node.TEXT_NODE) {
			let t = r.startContainer.textContent || "";
			e === "before" && r.startOffset === 0 && (i = r.startContainer.previousSibling), e === "after" && r.startOffset === t.length && (i = r.startContainer.nextSibling);
		} else r.startContainer.nodeType === Node.ELEMENT_NODE && (i = e === "before" ? r.startContainer.childNodes[r.startOffset - 1] ?? null : r.startContainer.childNodes[r.startOffset] ?? null);
		if (!Mt(i)) return !1;
		let a = i.previousSibling;
		return i.remove(), a?.nodeType === Node.TEXT_NODE && a.textContent === Ct && a.remove(), v(), !0;
	}, [v]), C = (0, K.useCallback)((t) => {
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
				let r = document.createElement("br"), i = document.createTextNode(Ct);
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
	]), w = (0, K.useCallback)((e) => {
		e.preventDefault();
		let t = window.getSelection();
		if (!t?.rangeCount) return;
		let n = t.getRangeAt(0);
		n.deleteContents();
		let r = document.createTextNode(e.clipboardData.getData("text/plain"));
		n.insertNode(r), n.setStartAfter(r), n.collapse(!0), t.removeAllRanges(), t.addRange(n), x();
	}, [x]);
	return /* @__PURE__ */ (0, q.jsxs)("div", {
		className: "relative min-h-[64px] max-h-[160px]",
		children: [!e && /* @__PURE__ */ (0, q.jsx)("span", {
			className: "pointer-events-none absolute inset-x-0 top-0 text-[13px] leading-5 text-canvas-text-muted",
			children: d
		}), /* @__PURE__ */ (0, q.jsx)("div", {
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
}), Ut = typeof window < "u" && "__TAURI_INTERNALS__" in window, Wt = [
	"nodes",
	"assets",
	"models"
], Gt = {
	character: "角色",
	scene: "场景",
	prop: "道具"
}, Kt = {
	nodes: "节点",
	assets: "资产",
	models: "模型"
}, qt = {
	image: "图片",
	video: "视频",
	audio: "音频"
}, Jt = {
	image: "mdi:image-outline",
	video: "mdi:video-outline",
	audio: "mdi:music-note-outline"
}, Yt = "chat-reference-suggestions", Xt = "chat-skill-suggestions";
function Zt(e, t) {
	return e.filter((e) => nn(t, e.name, e.description, e.fileName, e.sourceLabel));
}
function Qt(e) {
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
function $t(e) {
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
function en(e) {
	if (e.imageUrl) {
		if (e.filePath && Ut) try {
			return j(e.filePath);
		} catch {
			return e.thumbnailUrl || e.imageUrl;
		}
		return e.thumbnailUrl || e.imageUrl;
	}
	return e.thumbnailUrl;
}
function tn(e, t) {
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
function nn(e, ...t) {
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
function rn({ assistantModelId: e, onAssistantModelChange: t, mediaModels: n, mediaModelOptions: i, mediaModelAvailability: a, inputValue: o, onInputChange: s, onSend: c, hasActiveTask: l = !1, onInterject: u, localFileGrants: d = [], onAuthorizeLocalFiles: f, onRevokeLocalFile: p, contextUsage: m, disabled: g = !1, allowSkillUpload: _ = !0, skillOptions: v, agentMode: mode = "collaborative", onAgentModeChange: handleModeChange, agentModeDisabled: modeDisabled = !1 }) {
	let y = r(), b = (0, K.useRef)(null), x = ee(), [S, C] = (0, K.useState)(!1), [w, T] = (0, K.useState)(""), [E, O] = (0, K.useState)("nodes"), [k, A] = (0, K.useState)("all"), [j, P] = (0, K.useState)("all"), [F, I] = (0, K.useState)(!1), [R, te] = (0, K.useState)(""), [z, V] = (0, K.useState)(!1), [ae, H] = (0, K.useState)(0), oe = D((e) => e.nodes), se = D((e) => e.dramaAssets), ce = D((e) => e.userSkills), le = D((e) => e.agentPackageSkills), ue = D((e) => e.uploadSkill), de = D((e) => e.showToast), fe = (0, K.useMemo)(() => h(ce, le), [le, ce]), pe = v ?? fe, U = i, W = (0, K.useMemo)(() => U.filter((e) => tn(e, w)), [U, w]), me = (0, K.useMemo)(() => oe.filter((e) => e.type !== "group").filter((e) => nn(w, e.data.label, e.data.displayId, e.data.displayId == null ? void 0 : `#${String(e.data.displayId)}`, e.data.type, e.id)), [oe, w]), he = (0, K.useMemo)(() => Zt(pe, R), [pe, R]), ge = (0, K.useMemo)(() => Qt(he), [he]), _e = (0, K.useMemo)(() => ge.flatMap((e) => e.options), [ge]), ve = (0, K.useMemo)(() => new Map(oe.map((e) => [e.id, e.data.displayId])), [oe]), ye = (0, K.useMemo)(() => {
		let e = /* @__PURE__ */ new Map();
		for (let t of W) e.set(t.mediaKind, (e.get(t.mediaKind) ?? 0) + 1);
		return e.size === 0 ? [] : [{
			id: "all",
			label: y("全部"),
			count: W.length
		}, ...[...e].map(([e, t]) => ({
			id: e,
			label: y(qt[e] ?? e),
			count: t
		}))];
	}, [W, y]), be = (0, K.useMemo)(() => k === "all" ? W : W.filter((e) => e.mediaKind === k), [W, k]), xe = (0, K.useMemo)(() => ie(se, w), [se, w]), Se = (0, K.useMemo)(() => {
		let e = /* @__PURE__ */ new Map();
		for (let t of xe) e.set(t.kind, (e.get(t.kind) ?? 0) + 1);
		return e.size === 0 ? [] : [{
			id: "all",
			label: y("全部"),
			count: xe.length
		}, ...[...e].map(([e, t]) => ({
			id: e,
			label: y(Gt[e] ?? e),
			count: t
		}))];
	}, [xe, y]), Ce = (0, K.useMemo)(() => j === "all" ? xe : xe.filter((e) => e.kind === j), [j, xe]), we = {
		nodes: me.length,
		assets: xe.length,
		models: W.length
	}, J = we[E] > 0 ? E : Wt.find((e) => we[e] > 0) ?? E, nodeItems = (0, K.useMemo)(() => J === "nodes" ? me : [], [me, J]), Ee = (0, K.useMemo)(() => J === "assets" ? Ce : [], [J, Ce]), De = (0, K.useMemo)(() => J === "models" ? be : [], [be, J]), Oe = (0, K.useMemo)(() => {
		let e = { "general-models": !0 };
		for (let t of U) e[t.groupId] = e[t.groupId] || !!a[t.value];
		return e;
	}, [U, a]), ke = (0, K.useCallback)((e) => !!a[e.value], [a]), Ae = (0, K.useCallback)((e) => {
		t(e.value.startsWith("general/") ? e.value.slice(8) : e.value);
	}, [t]), je = (0, K.useMemo)(() => !e || e.startsWith("general/") ? e : n.some((t) => t.category === "text" && t.id === e) ? `general/${e}` : e, [e, n]), Me = (0, K.useCallback)((e) => {
		b.current?.insertReference({
			kind: "model",
			id: e.value,
			label: e.label
		}), C(!1), T(""), O("nodes"), A("all"), H(0);
	}, []), Ne = (0, K.useCallback)((e, t, n) => {
		b.current?.insertReference({
			kind: "node",
			id: e,
			label: t,
			displayId: n
		}), C(!1), T(""), O("nodes"), A("all"), H(0);
	}, []), Pe = (0, K.useCallback)((e) => {
		b.current?.insertReference({
			kind: "drama",
			id: e.id,
			label: e.name
		}), C(!1), T(""), O("nodes"), P("all"), H(0);
	}, []), Fe = (0, K.useCallback)((e, t) => {
		b.current?.insertReference({
			kind: "skill",
			id: e,
			label: t
		}), I(!1), te(""), H(0);
	}, []), Y = (0, K.useMemo)(() => [
		...nodeItems.map((e) => ({
			key: `node:${e.id}`,
			kind: "node",
			nodeId: e.id,
			label: String(e.data.label || y("节点")),
			displayId: e.data.displayId
		})),
		...Ee.map((e) => ({
			key: `drama:${e.id}`,
			kind: "drama",
			item: e
		})),
		...De.filter(ke).map((e) => ({
			key: `model:${e.mediaKind}:${e.value}`,
			kind: "model",
			model: e
		}))
	], [
		ke,
		y,
		nodeItems,
		Ee,
		De
	]), X = (0, K.useMemo)(() => _e.map((e) => ({
		key: `skill:${e.id}`,
		skill: e
	})), [_e]), Ie = (0, K.useMemo)(() => new Map(X.map((e, t) => [e.skill.id, t])), [X]), Le = (0, K.useMemo)(() => new Map(Y.map((e, t) => [e.key, t])), [Y]), Re = S ? Y.length : F ? X.length : 0, Z = Re > 0 ? Math.min(ae, Re - 1) : 0, ze = (0, K.useCallback)((e) => {
		e.kind === "node" ? Ne(e.nodeId, e.label, e.displayId) : e.kind === "drama" ? Pe(e.item) : Me(e.model);
	}, [
		Pe,
		Me,
		Ne
	]), Be = (0, K.useCallback)((e) => {
		if (!(S || F) || ![
			"ArrowDown",
			"ArrowUp",
			"Enter",
			"Escape"
		].includes(e.key) || e.key === "Enter" && e.shiftKey) return !1;
		if (e.preventDefault(), e.stopPropagation(), e.key === "Escape") return C(!1), I(!1), T(""), te(""), O("nodes"), A("all"), !0;
		let t = S ? Y.length : X.length;
		if (t === 0) return !0;
		if (e.key === "ArrowDown" || e.key === "ArrowUp") {
			let n = e.key === "ArrowDown" ? 1 : -1;
			return H((e) => (e + n + t) % t), !0;
		}
		if (S) {
			let e = Y[Z] ?? Y[0];
			e && ze(e);
		} else {
			let e = X[Z] ?? X[0];
			e && Fe(e.skill.id, e.skill.name);
		}
		return !0;
	}, [
		Fe,
		S,
		Y,
		Z,
		ze,
		F,
		X
	]), Ve = [
		...nodeItems.map((e) => {
			let t = String(e.data.label || y("节点")), n = Le.get(`node:${e.id}`);
			return {
				key: `node:${e.id}`,
				domId: n == null ? void 0 : `chat-reference-suggestion-${n}`,
				label: t,
				thumbnailUrl: en(e.data),
				badge: e.data.displayId == null ? void 0 : `#${String(e.data.displayId)}`,
				title: `${t} · ${String(e.data.type)}`,
				onSelect: () => Ne(e.id, t, e.data.displayId)
			};
		}),
		...Ee.map((e) => {
			let t = Le.get(`drama:${e.id}`), n = e.imageNodeId ? oe.find((t) => t.id === e.imageNodeId) : void 0, r = (n ? re(n.data) : void 0) || e.imageUrl || e.referenceImages?.find((e) => !!e.imageUrl)?.imageUrl;
			return {
				key: `drama:${e.id}`,
				domId: t == null ? void 0 : `chat-reference-suggestion-${t}`,
				label: e.name,
				thumbnailUrl: r,
				icon: "mdi:account-box-outline",
				badge: y(Gt[e.kind] ?? e.kind),
				title: y(r ? "{name}（引用参考图）" : "{name}（引用设定文字）", { name: e.name }),
				onSelect: () => Pe(e)
			};
		}),
		...De.map((e) => {
			let t = ke(e), n = Le.get(`model:${e.mediaKind}:${e.value}`);
			return {
				key: `model:${e.mediaKind}:${e.value}`,
				domId: n == null ? void 0 : `chat-reference-suggestion-${n}`,
				label: e.label,
				icon: Jt[e.mediaKind],
				badge: y(t ? qt[e.mediaKind] : "未配置"),
				disabled: !t,
				title: t ? e.description : y("请先配置对应供应商"),
				onSelect: () => Me(e)
			};
		})
	], He = S ? Y.length > 0 ? `chat-reference-suggestion-${Z}` : void 0 : F && X.length > 0 ? `chat-skill-suggestion-${Z}` : void 0, Ue = (0, K.useCallback)(async () => {
		if (!z) {
			V(!0);
			try {
				await ue("file");
			} catch (e) {
				de(e instanceof Error ? e.message : y("上传 Skill 失败"), "error");
			} finally {
				V(!1);
			}
		}
	}, [
		de,
		z,
		y,
		ue
	]);
	return (0, K.useEffect)(() => {
		g || b.current?.focus();
	}, [g]), (0, K.useEffect)(() => {
		let e = () => {
			I(!1), te(""), O("models"), A("all"), T(""), C(!0), H(0), requestAnimationFrame(() => b.current?.focus());
		};
		return window.addEventListener("chat-open-reference-menu", e), () => window.removeEventListener("chat-open-reference-menu", e);
	}, []), /* @__PURE__ */ (0, q.jsxs)("div", {
		className: "chat-panel-input-area flex-shrink-0 px-3 pt-2",
		children: [/* @__PURE__ */ (0, q.jsxs)("div", {
			className: "chat-panel-input-box relative flex flex-col bg-canvas-card border border-canvas-border\n                    rounded-[14px] transition-[border-color,box-shadow] duration-200\n                    focus-within:border-brand-light focus-within:ring-2 focus-within:ring-brand/15\n                    px-1.5 py-1.5",
			children: [
				d.length > 0 && /* @__PURE__ */ (0, q.jsx)("div", {
					className: "mb-2 flex max-h-16 flex-wrap gap-1.5 overflow-y-auto",
					children: d.map((e) => /* @__PURE__ */ (0, q.jsxs)("span", {
						title: `${e.displayName} · ${Math.ceil(e.size / 1024)} KB`,
						className: "inline-flex items-center gap-1 rounded-full border border-canvas-border/60\n                           bg-canvas-hover/70 py-1 pl-2.5 pr-1 text-[11px] leading-none text-canvas-text-secondary",
						children: [
							/* @__PURE__ */ (0, q.jsx)(B, {
								icon: "mdi:file-document-outline",
								width: "12",
								className: "shrink-0 text-canvas-text-muted/80"
							}),
							/* @__PURE__ */ (0, q.jsx)("span", {
								className: "max-w-[100px] truncate",
								children: e.displayName
							}),
							p && /* @__PURE__ */ (0, q.jsx)("button", {
								type: "button",
								"aria-label": y("撤销 {name} 的读取授权", { name: e.displayName }),
								onClick: () => p(e.id),
								className: "flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-canvas-text-muted transition-colors\n                               hover:bg-red-500/15 hover:text-red-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-red-400/50",
								children: /* @__PURE__ */ (0, q.jsx)(B, {
									icon: "mdi:close",
									width: "11"
								})
							})
						]
					}, e.id))
				}),
				/* @__PURE__ */ (0, q.jsx)(Ht, {
					ref: b,
					value: o,
					onChange: s,
					onSubmit: c,
					nodeDisplayIds: ve,
					onMentionQueryChange: (e) => {
						C(e != null), H(0);
						let t = $t(e ?? "");
						e == null || t.scope === "nodes" ? O("nodes") : t.scope === "assets" ? O("assets") : t.scope === "models" && O("models"), e ?? (A("all"), P("all")), T(t.query), e != null && I(!1);
					},
					onSlashQueryChange: (e) => {
						I(e != null), H(0), te(e ?? ""), e != null && C(!1);
					},
					onSuggestionKeyDown: Be,
					suggestionListId: S ? Yt : Xt,
					activeSuggestionId: He,
					suggestionsOpen: S || F,
					placeholder: y("输入消息，@n 节点 · @a 资产 · @m 模型 · / 调用 Skill"),
					disabled: g
				}),
				/* @__PURE__ */ (0, q.jsxs)("div", {
					className: "chat-panel-input-toolbar flex items-end justify-between gap-3",
					children: [
						/* @__PURE__ */ (0, q.jsx)(M, { children: S && /* @__PURE__ */ (0, q.jsx)(N.div, {
							initial: x ? { opacity: 0 } : {
								opacity: 0,
								y: 6,
								scale: .97
							},
							animate: {
								opacity: 1,
								y: 0,
								scale: 1
							},
							exit: x ? { opacity: 0 } : {
								opacity: 0,
								y: 6,
								scale: .97
							},
							transition: x ? { duration: .1 } : {
								type: "spring",
								visualDuration: .22,
								bounce: 0
							},
							className: "absolute bottom-[calc(100%+8px)] left-0 right-0 z-20",
							children: /* @__PURE__ */ (0, q.jsx)(ne, {
								listId: Yt,
								ariaLabel: y("节点与模型引用"),
								tabs: [
									{
										id: "nodes",
										label: y("画布节点"),
										icon: "mdi:image-multiple-outline"
									},
									{
										id: "assets",
										label: y("资产库"),
										icon: "mdi:bookshelf"
									},
									{
										id: "models",
										label: y("模型"),
										icon: "mdi:cube-outline"
									}
								],
								activeTab: J,
								onTabChange: (e) => {
									O(e), H(0);
								},
								chips: J === "models" ? ye : J === "assets" ? Se : void 0,
								activeChip: J === "assets" ? j : k,
								onChipChange: (e) => {
									J === "assets" ? P(e) : A(e), H(0);
								},
								items: Ve,
								activeKey: Y[Z]?.key,
								onItemHover: (e) => {
									let t = Le.get(e);
									t != null && H(t);
								},
								emptyText: w ? y("没有匹配\"{query}\"的{noun}", {
									query: w,
									noun: y(Kt[J])
								}) : y("暂无可引用的{noun}", { noun: y(Kt[J]) })
							})
						}) }),
						/* @__PURE__ */ (0, q.jsx)(M, { children: F && /* @__PURE__ */ (0, q.jsxs)(N.div, {
							initial: x ? { opacity: 0 } : {
								opacity: 0,
								y: 6,
								scale: .97
							},
							animate: {
								opacity: 1,
								y: 0,
								scale: 1
							},
							exit: x ? { opacity: 0 } : {
								opacity: 0,
								y: 6,
								scale: .97
							},
							transition: x ? { duration: .1 } : {
								type: "spring",
								visualDuration: .22,
								bounce: 0
							},
							id: Xt,
							role: "listbox",
							"aria-label": y("Skill 引用"),
							className: "absolute bottom-[calc(100%+8px)] left-0 right-0 z-20 max-h-72 overflow-y-auto rounded-xl border border-canvas-border bg-canvas-surface shadow-xl",
							children: [/* @__PURE__ */ (0, q.jsxs)("div", {
								className: "sticky top-0 z-20 flex items-center justify-between bg-canvas-surface px-3 py-1.5 text-[10px] font-medium text-canvas-text-muted",
								children: [/* @__PURE__ */ (0, q.jsx)("span", { children: "Skill" }), /* @__PURE__ */ (0, q.jsxs)("span", {
									className: "flex items-center gap-2",
									children: [/* @__PURE__ */ (0, q.jsx)("span", { children: he.length }), _ && /* @__PURE__ */ (0, q.jsx)("button", {
										type: "button",
										disabled: z,
										onClick: (e) => {
											e.stopPropagation(), Ue();
										},
										"aria-label": y("上传 Skill"),
										title: y("上传 Skill 文件"),
										className: "flex h-7 w-7 items-center justify-center rounded-md text-canvas-text-secondary hover:bg-canvas-hover hover:text-canvas-text\n                               focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50 disabled:cursor-wait disabled:opacity-50",
										children: /* @__PURE__ */ (0, q.jsx)(B, {
											icon: z ? "mdi:loading" : "mdi:plus",
											width: "15",
											className: z ? "animate-spin" : ""
										})
									})]
								})]
							}), /* @__PURE__ */ (0, q.jsx)("div", {
								className: "px-1 pb-1",
								children: he.length > 0 ? ge.map((e) => /* @__PURE__ */ (0, q.jsxs)("section", {
									role: "group",
									"aria-label": e.sourceKind === "user" ? y("我的 Skill") : e.label,
									children: [/* @__PURE__ */ (0, q.jsxs)("div", {
										className: "flex items-center justify-between px-3 pb-1 pt-2 text-[10px] font-medium text-canvas-text-muted",
										children: [/* @__PURE__ */ (0, q.jsx)("span", {
											className: "truncate",
											children: e.sourceKind === "user" ? y("我的 Skill") : e.label
										}), /* @__PURE__ */ (0, q.jsx)("span", {
											className: "ml-2 shrink-0",
											children: e.options.length
										})]
									}), e.options.map((e) => {
										let t = Ie.get(e.id) ?? 0;
										return /* @__PURE__ */ (0, q.jsxs)("button", {
											id: `chat-skill-suggestion-${t}`,
											type: "button",
											role: "option",
											"aria-selected": t === Z,
											onMouseEnter: () => H(t),
											onClick: () => Fe(e.id, e.name),
											title: e.description,
											className: `flex min-h-9 w-full items-center gap-2 rounded-lg px-3 py-2 text-left text-[11px] text-canvas-text transition-colors ${t === Z ? "bg-canvas-hover ring-1 ring-inset ring-indigo-400/25" : "hover:bg-canvas-hover"}`,
											children: [/* @__PURE__ */ (0, q.jsx)(B, {
												icon: e.sourceKind === "agent-package" ? "lucide:bot" : "mdi:puzzle-outline",
												width: "16"
											}), /* @__PURE__ */ (0, q.jsxs)("span", {
												className: "min-w-0 flex-1",
												children: [/* @__PURE__ */ (0, q.jsx)("span", {
													className: "block truncate",
													children: e.name
												}), /* @__PURE__ */ (0, q.jsx)("span", {
													className: "block truncate text-[10px] text-canvas-text-muted",
													children: e.description
												})]
											})]
										}, e.id);
									})]
								}, e.id)) : /* @__PURE__ */ (0, q.jsx)("p", {
									className: "px-3 py-3 text-center text-[11px] text-canvas-text-muted",
									children: R ? y("没有匹配\"{query}\"的 Skill", { query: R }) : y("暂无可调用 Skill")
								})
							})]
						}) }),
						/* @__PURE__ */ (0, q.jsxs)("div", {
							className: "chat-panel-input-toolbar-left flex min-w-0 flex-1 items-center gap-1.5",
							children: [
								f && /* @__PURE__ */ (0, q.jsx)("button", {
									type: "button",
									onClick: f,
									"aria-label": y("授权当前对话读取本地文件"),
									"data-tooltip": y("上传"),
									title: y("选择文本文件；授权仅在当前对话和本次运行期间有效"),
									className: "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-canvas-text-secondary hover:bg-canvas-surface hover:text-canvas-text transition-[color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
									children: /* @__PURE__ */ (0, q.jsx)(B, {
										icon: "mdi:paperclip",
										width: "14"
									})
								}),
								/* @__PURE__ */ (0, q.jsx)("div", {
									className: "flex min-w-0 items-center",
									children: /* @__PURE__ */ (0, q.jsx)(G, {
										nodeType: "ai-text",
										selectedModel: je,
										onSelect: Ae,
										generalModelsOverride: n,
										groupAvailability: Oe
									})
								}),
								/* @__PURE__ */ (0, q.jsx)("button", {
									type: "button",
									onClick: () => {
										te(""), C(!1), H(0), I((e) => !e), b.current?.focus();
									},
									"aria-label": y("调用 Skill"),
									"data-tooltip": y("Skill"),
									title: y("调用 Skill"),
									className: `flex h-7 w-7 shrink-0 items-center justify-center rounded-md transition-[color,background-color,box-shadow] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50 ${F ? "bg-brand/15 text-brand-light" : "text-canvas-text-secondary hover:bg-canvas-surface hover:text-canvas-text"}`,
									children: /* @__PURE__ */ (0, q.jsx)(B, {
										icon: "lucide:notebook-pen",
										width: "14"
									})
								}),
								/* @__PURE__ */ (0, q.jsx)(Te, {
									mode,
									onChange: handleModeChange,
									disabled: modeDisabled
								}),
							]
						}),
						/* @__PURE__ */ (0, q.jsxs)("div", {
							className: "flex shrink-0 items-end gap-1.5",
							children: [
								o.trim() && !g && /* @__PURE__ */ (0, q.jsx)("span", {
									className: "hidden sm:inline text-[11px] text-canvas-text-muted/60 tabular-nums select-none",
									children: "↵ Enter"
								}),
								/* @__PURE__ */ (0, q.jsx)("div", {
									className: "flex h-7 w-7 items-center justify-center",
									children: /* @__PURE__ */ (0, q.jsx)(St, { usage: m ?? null })
								}),
								l && u && o.trim() && !g && /* @__PURE__ */ (0, q.jsx)("button", {
									type: "button",
									onClick: u,
									"aria-label": y("调整当前任务"),
									title: y("在下一个安全步骤调整当前任务"),
									className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-full border border-canvas-border\n                           bg-canvas-surface text-canvas-text-secondary transition-[color,background-color,border-color]\n                           hover:border-brand/40 hover:bg-brand/10 hover:text-brand-light\n                           focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/70",
									children: /* @__PURE__ */ (0, q.jsx)(B, {
										icon: "mdi:source-branch-sync",
										width: "16",
										height: "16"
									})
								}),
								/* @__PURE__ */ (0, q.jsx)(L, {
									scale: 1.05,
									disabled: !o.trim() || g,
									"aria-label": y(l ? "将消息加入队列" : "发送消息"),
									title: y(l ? "当前任务完成后发送" : "发送消息"),
									className: `chat-panel-send-btn flex shrink-0 items-center justify-center h-8 w-8 rounded-full
                          transition-[color,background-color,box-shadow,opacity,transform] duration-200 active:scale-95
                          motion-reduce:transform-none
                          focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-300/70
                          ${o.trim() && !g ? "bg-brand text-white hover:bg-brand-light shadow-lg shadow-brand/30" : "bg-canvas-hover text-canvas-text-muted cursor-not-allowed"}`,
									onClick: c,
									children: /* @__PURE__ */ (0, q.jsx)(B, {
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
		}), /* @__PURE__ */ (0, q.jsx)("div", {
			className: "flex min-h-5 items-center justify-center",
			children: /* @__PURE__ */ (0, q.jsx)("p", {
				className: "chat-panel-disclaimer text-[11px] text-canvas-text-muted/75",
				children: y("重要操作执行前会请求确认")
			})
		})]
	});
}
//#endregion
//#region src/components/chat/ProjectMemoryPanel.tsx
var an = {
	constraint: "bg-red-400/15 text-red-300",
	decision: "bg-indigo-400/15 text-indigo-300",
	preference: "bg-emerald-400/15 text-emerald-300",
	fact: "bg-sky-400/15 text-sky-300"
};
function on(e) {
	let t = new Date(e), n = (e) => `${e}`.padStart(2, "0");
	return `${t.getFullYear()}-${n(t.getMonth() + 1)}-${n(t.getDate())} ${n(t.getHours())}:${n(t.getMinutes())}`;
}
function sn({ memory: e, onUpdate: t, onDelete: n }) {
	let i = r(), [a, o] = (0, K.useState)(!1), [s, c] = (0, K.useState)(e.content);
	return /* @__PURE__ */ (0, q.jsxs)("div", {
		className: `rounded-lg border border-canvas-border p-2.5 ${e.enabled ? "" : "opacity-60"}`,
		children: [
			/* @__PURE__ */ (0, q.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [/* @__PURE__ */ (0, q.jsx)("span", {
					className: `text-[10px] px-1.5 py-0.5 rounded font-medium ${an[e.kind]}`,
					children: i(l[e.kind])
				}), /* @__PURE__ */ (0, q.jsx)("span", {
					className: "text-[10px] text-canvas-text-muted ml-auto",
					children: on(e.updatedAt)
				})]
			}),
			a ? /* @__PURE__ */ (0, q.jsxs)("div", {
				className: "mt-2",
				children: [/* @__PURE__ */ (0, q.jsx)("textarea", {
					value: s,
					onChange: (e) => c(e.target.value),
					maxLength: 500,
					rows: 3,
					className: "w-full resize-none rounded-md bg-canvas-bg border border-canvas-border px-2 py-1.5 text-xs text-canvas-text focus:outline-none focus:border-indigo-400"
				}), /* @__PURE__ */ (0, q.jsxs)("div", {
					className: "mt-1.5 flex justify-end gap-2",
					children: [/* @__PURE__ */ (0, q.jsx)("button", {
						type: "button",
						onClick: () => {
							c(e.content), o(!1);
						},
						className: "rounded-md px-2 py-1 text-[11px] text-canvas-text-secondary hover:bg-canvas-hover",
						children: i("取消")
					}), /* @__PURE__ */ (0, q.jsx)("button", {
						type: "button",
						onClick: () => {
							let n = s.trim();
							n && n !== e.content && t(e.id, { content: n }), o(!1);
						},
						className: "rounded-md bg-indigo-500 px-2 py-1 text-[11px] font-medium text-white hover:bg-indigo-400",
						children: i("保存")
					})]
				})]
			}) : /* @__PURE__ */ (0, q.jsx)("p", {
				className: "mt-1.5 whitespace-pre-wrap break-words text-xs leading-relaxed text-canvas-text",
				children: e.content
			}),
			/* @__PURE__ */ (0, q.jsxs)("div", {
				className: "mt-2 flex items-center gap-3 text-[10px] text-canvas-text-muted",
				children: [/* @__PURE__ */ (0, q.jsxs)("span", {
					className: "flex items-center gap-1",
					children: [/* @__PURE__ */ (0, q.jsx)(B, {
						icon: e.source.unavailable ? "mdi:link-variant-off" : "mdi:message-text-outline",
						width: "12"
					}), e.source.unavailable ? i("来源对话已删除") : i("来自对话")]
				}), /* @__PURE__ */ (0, q.jsxs)("div", {
					className: "ml-auto flex items-center gap-1",
					children: [
						/* @__PURE__ */ (0, q.jsx)("button", {
							type: "button",
							onClick: () => t(e.id, { enabled: !e.enabled }),
							className: "rounded px-1.5 py-0.5 hover:bg-canvas-hover hover:text-canvas-text",
							title: e.enabled ? i("禁用（不再发送给模型）") : i("启用"),
							children: /* @__PURE__ */ (0, q.jsx)(B, {
								icon: e.enabled ? "mdi:eye-outline" : "mdi:eye-off-outline",
								width: "14"
							})
						}),
						!a && /* @__PURE__ */ (0, q.jsx)("button", {
							type: "button",
							onClick: () => {
								c(e.content), o(!0);
							},
							className: "rounded px-1.5 py-0.5 hover:bg-canvas-hover hover:text-canvas-text",
							title: i("编辑"),
							children: /* @__PURE__ */ (0, q.jsx)(B, {
								icon: "mdi:pencil-outline",
								width: "14"
							})
						}),
						/* @__PURE__ */ (0, q.jsx)("button", {
							type: "button",
							onClick: () => n(e.id),
							className: "rounded px-1.5 py-0.5 hover:bg-red-400/10 hover:text-red-400",
							title: i("删除"),
							children: /* @__PURE__ */ (0, q.jsx)(B, {
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
function cn({ memories: e, onUpdate: t, onDelete: n, onClose: i }) {
	let a = r(), o = [...e].sort((e, t) => t.updatedAt - e.updatedAt);
	return /* @__PURE__ */ (0, q.jsxs)("div", {
		className: "absolute inset-0 z-10 flex flex-col bg-canvas-bg",
		children: [/* @__PURE__ */ (0, q.jsxs)("div", {
			className: "flex items-center justify-between border-b border-canvas-border px-4 py-3",
			children: [/* @__PURE__ */ (0, q.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [
					/* @__PURE__ */ (0, q.jsx)(B, {
						icon: "mdi:brain",
						width: "16",
						className: "text-indigo-400"
					}),
					/* @__PURE__ */ (0, q.jsx)("span", {
						className: "text-sm font-medium text-canvas-text",
						children: a("项目记忆")
					}),
					/* @__PURE__ */ (0, q.jsx)("span", {
						className: "text-[11px] text-canvas-text-muted",
						children: a("{count} 条", { count: o.length })
					})
				]
			}), /* @__PURE__ */ (0, q.jsx)(R, { onClick: i })]
		}), /* @__PURE__ */ (0, q.jsx)("div", {
			className: "flex-1 space-y-2 overflow-y-auto p-3",
			children: o.length === 0 ? /* @__PURE__ */ (0, q.jsxs)("div", {
				className: "flex h-full flex-col items-center justify-center gap-2 text-center text-canvas-text-muted",
				children: [
					/* @__PURE__ */ (0, q.jsx)(B, {
						icon: "mdi:brain",
						width: "32",
						className: "opacity-40"
					}),
					/* @__PURE__ */ (0, q.jsx)("p", {
						className: "text-xs",
						children: a("还没有项目记忆")
					}),
					/* @__PURE__ */ (0, q.jsxs)("p", {
						className: "text-[11px] leading-4",
						children: [
							a("对话中助手会在你确认后保存偏好、事实、约束和决定，"),
							/* @__PURE__ */ (0, q.jsx)("br", {}),
							a("之后的对话会自动参考这些记忆。")
						]
					})
				]
			}) : o.map((e) => /* @__PURE__ */ (0, q.jsx)(sn, {
				memory: e,
				onUpdate: t,
				onDelete: n
			}, e.id))
		})]
	});
}
//#endregion
//#region src/components/settings/SubAgentSettings.tsx
function ln() {
	return {
		name: "",
		description: "",
		skillId: void 0,
		instructions: "",
		materials: ["mentioned_nodes"],
		maxRounds: C.defaultRounds
	};
}
function un({ profiles: e, onEdit: t, onDuplicate: n, onDelete: i }) {
	let a = r();
	return /* @__PURE__ */ (0, q.jsx)("div", {
		className: "space-y-2",
		children: e.map((e) => /* @__PURE__ */ (0, q.jsx)("div", {
			className: "rounded-lg border border-canvas-border bg-canvas-card p-3",
			children: /* @__PURE__ */ (0, q.jsxs)("div", {
				className: "flex items-start justify-between gap-3",
				children: [/* @__PURE__ */ (0, q.jsxs)("div", {
					className: "min-w-0 flex-1",
					children: [
						/* @__PURE__ */ (0, q.jsxs)("div", {
							className: "flex items-center gap-2",
							children: [/* @__PURE__ */ (0, q.jsx)("span", {
								className: "truncate text-xs font-medium text-canvas-text",
								children: e.name
							}), e.builtIn && /* @__PURE__ */ (0, q.jsx)("span", {
								className: "shrink-0 rounded bg-canvas-hover px-1.5 py-0.5 text-[10px] text-canvas-text-muted",
								children: a("内置")
							})]
						}),
						/* @__PURE__ */ (0, q.jsx)("p", {
							className: "mt-1 line-clamp-2 text-[11px] text-canvas-text-secondary",
							children: e.description || a("（未填写说明）")
						}),
						/* @__PURE__ */ (0, q.jsxs)("p", {
							className: "mt-1 text-[10px] text-canvas-text-muted",
							children: [
								a("材料："),
								e.materials.map((e) => a(x[e])).join("、"),
								" · ",
								a("最多 {count} 轮", { count: e.maxRounds }),
								e.skillId ? a(" · 绑定 Skill") : ""
							]
						})
					]
				}), /* @__PURE__ */ (0, q.jsxs)("div", {
					className: "flex shrink-0 items-center gap-1",
					children: [/* @__PURE__ */ (0, q.jsx)(L, {
						onClick: () => n(e),
						className: "rounded p-1.5 text-canvas-text-muted hover:bg-canvas-hover",
						title: a("复制为自定义副本"),
						"aria-label": a("复制 {name}", { name: e.name }),
						children: /* @__PURE__ */ (0, q.jsx)(B, {
							icon: "mdi:content-copy",
							width: "14"
						})
					}), !e.builtIn && /* @__PURE__ */ (0, q.jsxs)(q.Fragment, { children: [/* @__PURE__ */ (0, q.jsx)(L, {
						onClick: () => t(e),
						className: "rounded p-1.5 text-canvas-text-muted hover:bg-canvas-hover",
						title: a("编辑"),
						"aria-label": a("编辑 {name}", { name: e.name }),
						children: /* @__PURE__ */ (0, q.jsx)(B, {
							icon: "mdi:pencil",
							width: "14"
						})
					}), /* @__PURE__ */ (0, q.jsx)(L, {
						onClick: () => i(e),
						className: "rounded p-1.5 text-canvas-text-muted hover:bg-red-500/10 hover:text-red-500",
						title: a("删除"),
						"aria-label": a("删除 {name}", { name: e.name }),
						children: /* @__PURE__ */ (0, q.jsx)(B, {
							icon: "mdi:trash-can-outline",
							width: "14"
						})
					})] })]
				})]
			})
		}, e.id))
	});
}
function dn({ hideHeading: e } = {}) {
	let t = r(), n = D((e) => e.subAgentProfiles), i = D((e) => e.userSkills), a = D((e) => e.createSubAgentProfile), o = D((e) => e.updateSubAgentProfile), c = D((e) => e.deleteSubAgentProfile), l = D((e) => e.showToast), [u, d] = (0, K.useState)(null), [f, m] = (0, K.useState)(null), [h, g] = (0, K.useState)(""), _ = (0, K.useMemo)(() => s(n), [n]), v = () => {
		d("new"), m(ln()), g("");
	}, y = (e) => {
		d(e.id), m({
			name: e.name,
			description: e.description,
			skillId: e.skillId,
			instructions: e.instructions ?? "",
			materials: [...e.materials],
			maxRounds: e.maxRounds
		}), g("");
	}, b = (e) => {
		d("new"), m(p(e)), g("");
	}, S = () => {
		d(null), m(null), g("");
	}, w = async () => {
		if (f) try {
			u === "new" ? l(t("已创建子智能体「{name}」", { name: (await a(f)).name })) : u && (await o(u, f), l(t("子智能体已更新"))), S();
		} catch (e) {
			g(e instanceof k || e instanceof Error ? e.message : t("保存失败"));
		}
	}, T = async (e) => {
		try {
			await c(e.id), l(t("已删除「{name}」", { name: e.name })), u === e.id && S();
		} catch (e) {
			l(e instanceof Error ? e.message : t("删除失败"), "error");
		}
	}, E = (e) => {
		if (!f) return;
		let t = f.materials.includes(e);
		m({
			...f,
			materials: t ? f.materials.filter((t) => t !== e) : [...f.materials, e]
		});
	};
	return /* @__PURE__ */ (0, q.jsxs)("div", {
		className: "space-y-4",
		children: [
			/* @__PURE__ */ (0, q.jsxs)("div", {
				className: "space-y-1.5",
				children: [/* @__PURE__ */ (0, q.jsxs)("div", {
					className: "flex items-center justify-between gap-3",
					children: [e ? /* @__PURE__ */ (0, q.jsx)("span", {}) : /* @__PURE__ */ (0, q.jsx)("h3", {
						className: "text-sm font-medium text-canvas-text",
						children: t("子智能体")
					}), /* @__PURE__ */ (0, q.jsxs)(L, {
						onClick: v,
						className: "flex items-center gap-1.5 rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-light",
						children: [/* @__PURE__ */ (0, q.jsx)(B, {
							icon: "mdi:plus",
							width: "14"
						}), t("新建")]
					})]
				}), /* @__PURE__ */ (0, q.jsx)("p", {
					className: "text-[11px] leading-relaxed text-canvas-text-muted",
					children: t("主任务可以并行派出这些只读子智能体做领域分工。它们只能读取你 @ 引用的节点正文和项目短剧资产，不能修改画布或生成媒体；产出需要落地时仍由主任务操作并经你确认。")
				})]
			}),
			/* @__PURE__ */ (0, q.jsx)(un, {
				profiles: _,
				onEdit: y,
				onDuplicate: b,
				onDelete: (e) => void T(e)
			}),
			f && /* @__PURE__ */ (0, q.jsxs)("div", {
				className: "space-y-3 rounded-lg border border-brand/30 bg-canvas-card p-3",
				children: [
					/* @__PURE__ */ (0, q.jsx)("h4", {
						className: "text-xs font-medium text-canvas-text",
						children: t(u === "new" ? "新建子智能体" : "编辑子智能体")
					}),
					/* @__PURE__ */ (0, q.jsxs)("label", {
						className: "block space-y-1",
						children: [/* @__PURE__ */ (0, q.jsx)("span", {
							className: "text-[11px] text-canvas-text-secondary",
							children: t("名称")
						}), /* @__PURE__ */ (0, q.jsx)("input", {
							value: f.name,
							onChange: (e) => m({
								...f,
								name: e.target.value
							}),
							maxLength: C.nameChars,
							placeholder: t("例如：台词润色师"),
							className: "w-full rounded-md border border-canvas-border bg-canvas-surface px-2.5 py-1.5 text-xs text-canvas-text"
						})]
					}),
					/* @__PURE__ */ (0, q.jsxs)("label", {
						className: "block space-y-1",
						children: [/* @__PURE__ */ (0, q.jsx)("span", {
							className: "text-[11px] text-canvas-text-secondary",
							children: t("何时派它（会展示给模型判断）")
						}), /* @__PURE__ */ (0, q.jsx)("input", {
							value: f.description,
							onChange: (e) => m({
								...f,
								description: e.target.value
							}),
							maxLength: C.descriptionChars,
							placeholder: t("例如：需要把书面台词改得更口语时"),
							className: "w-full rounded-md border border-canvas-border bg-canvas-surface px-2.5 py-1.5 text-xs text-canvas-text"
						})]
					}),
					/* @__PURE__ */ (0, q.jsxs)("label", {
						className: "block space-y-1",
						children: [/* @__PURE__ */ (0, q.jsx)("span", {
							className: "text-[11px] text-canvas-text-secondary",
							children: t("绑定 Skill（可选）")
						}), /* @__PURE__ */ (0, q.jsxs)("select", {
							value: f.skillId ?? "",
							onChange: (e) => m({
								...f,
								skillId: e.target.value || void 0
							}),
							className: "w-full rounded-md border border-canvas-border bg-canvas-surface px-2.5 py-1.5 text-xs text-canvas-text",
							children: [/* @__PURE__ */ (0, q.jsx)("option", {
								value: "",
								children: t("不绑定，使用下方提示词")
							}), i.map((e) => /* @__PURE__ */ (0, q.jsx)("option", {
								value: e.id,
								children: e.name
							}, e.id))]
						})]
					}),
					/* @__PURE__ */ (0, q.jsxs)("label", {
						className: "block space-y-1",
						children: [/* @__PURE__ */ (0, q.jsx)("span", {
							className: "text-[11px] text-canvas-text-secondary",
							children: t("角色提示词（未绑定 Skill 时必填）")
						}), /* @__PURE__ */ (0, q.jsx)("textarea", {
							value: f.instructions ?? "",
							onChange: (e) => m({
								...f,
								instructions: e.target.value
							}),
							maxLength: C.instructionsChars,
							rows: 5,
							placeholder: t("描述这个角色的分析框架和输出格式"),
							className: "w-full resize-y rounded-md border border-canvas-border bg-canvas-surface px-2.5 py-1.5 text-xs text-canvas-text"
						})]
					}),
					/* @__PURE__ */ (0, q.jsxs)("div", {
						className: "space-y-1",
						children: [
							/* @__PURE__ */ (0, q.jsx)("span", {
								className: "text-[11px] text-canvas-text-secondary",
								children: t("可读材料")
							}),
							/* @__PURE__ */ (0, q.jsx)("div", {
								className: "flex flex-wrap gap-2",
								children: O.map((e) => /* @__PURE__ */ (0, q.jsx)(L, {
									onClick: () => E(e),
									className: `rounded-md px-2.5 py-1.5 text-[11px] transition-colors ${f.materials.includes(e) ? "bg-brand text-white" : "bg-canvas-hover text-canvas-text-muted"}`,
									children: t(x[e])
								}, e))
							}),
							f.materials.length === 0 && /* @__PURE__ */ (0, q.jsx)("p", {
								className: "text-[10px] text-amber-400",
								children: t("至少勾选一项，否则子智能体拿不到任何材料。")
							})
						]
					}),
					/* @__PURE__ */ (0, q.jsxs)("label", {
						className: "block space-y-1",
						children: [/* @__PURE__ */ (0, q.jsx)("span", {
							className: "text-[11px] text-canvas-text-secondary",
							children: t("最大轮数（{min}–{max}，越大越贵）", {
								min: C.minRounds,
								max: C.maxRounds
							})
						}), /* @__PURE__ */ (0, q.jsx)("input", {
							type: "number",
							min: C.minRounds,
							max: C.maxRounds,
							value: f.maxRounds,
							onChange: (e) => m({
								...f,
								maxRounds: Number(e.target.value)
							}),
							className: "w-24 rounded-md border border-canvas-border bg-canvas-surface px-2.5 py-1.5 text-xs text-canvas-text"
						})]
					}),
					h && /* @__PURE__ */ (0, q.jsx)("p", {
						className: "text-[11px] text-red-500",
						children: h
					}),
					/* @__PURE__ */ (0, q.jsxs)("div", {
						className: "flex items-center gap-2",
						children: [/* @__PURE__ */ (0, q.jsx)(L, {
							onClick: () => void w(),
							className: "rounded-lg bg-brand px-3 py-1.5 text-xs font-medium text-white hover:bg-brand-light",
							children: t("保存")
						}), /* @__PURE__ */ (0, q.jsx)(L, {
							onClick: S,
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
function fn({ onClose: e }) {
	let t = r(), n = s(D((e) => e.subAgentProfiles)).length;
	return /* @__PURE__ */ (0, q.jsxs)("div", {
		className: "absolute inset-0 z-10 flex flex-col bg-canvas-bg",
		children: [/* @__PURE__ */ (0, q.jsxs)("div", {
			className: "flex items-center justify-between border-b border-canvas-border px-4 py-3",
			children: [/* @__PURE__ */ (0, q.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [
					/* @__PURE__ */ (0, q.jsx)(B, {
						icon: "lucide:users-round",
						width: "16",
						className: "text-brand"
					}),
					/* @__PURE__ */ (0, q.jsx)("span", {
						className: "text-sm font-medium text-canvas-text",
						children: t("子智能体")
					}),
					/* @__PURE__ */ (0, q.jsx)("span", {
						className: "text-[11px] text-canvas-text-muted",
						children: t("{count} 个", { count: n })
					})
				]
			}), /* @__PURE__ */ (0, q.jsx)(R, { onClick: e })]
		}), /* @__PURE__ */ (0, q.jsx)("div", {
			className: "flex-1 overflow-y-auto overflow-x-hidden p-3",
			children: /* @__PURE__ */ (0, q.jsx)(dn, { hideHeading: !0 })
		})]
	});
}
//#endregion
//#region src/components/chat/AgentCenterPanel.tsx
var pn = {
	ready: "可用",
	degraded: "受限",
	invalid: "无效",
	missing: "来源丢失"
}, mn = {
	ready: "bg-emerald-400/10 text-emerald-300",
	degraded: "bg-amber-400/10 text-amber-300",
	invalid: "bg-red-400/10 text-red-300",
	missing: "bg-red-400/10 text-red-300"
};
function hn(e) {
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
function gn({ installation: e, busy: t, allowInstall: n, onToggle: i, onToggleMcpSkillRead: a, onRemove: o }) {
	let s = r(), c = e.manifest.name || e.source.displayName;
	return /* @__PURE__ */ (0, q.jsx)("article", {
		className: "rounded-xl border border-canvas-border bg-canvas-card p-3",
		children: /* @__PURE__ */ (0, q.jsxs)("div", {
			className: "flex items-start gap-3",
			children: [
				/* @__PURE__ */ (0, q.jsx)("span", {
					className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-300",
					children: /* @__PURE__ */ (0, q.jsx)(B, {
						icon: "lucide:bot",
						width: "18",
						height: "18"
					})
				}),
				/* @__PURE__ */ (0, q.jsxs)("div", {
					className: "min-w-0 flex-1",
					children: [
						/* @__PURE__ */ (0, q.jsxs)("div", {
							className: "flex flex-wrap items-center gap-1.5",
							children: [
								/* @__PURE__ */ (0, q.jsx)("h4", {
									className: "truncate text-sm font-medium text-canvas-text",
									children: c
								}),
								/* @__PURE__ */ (0, q.jsxs)("span", {
									className: "rounded bg-canvas-surface px-1.5 py-0.5 text-[10px] text-canvas-text-muted",
									children: ["v", e.manifest.version]
								}),
								/* @__PURE__ */ (0, q.jsx)("span", {
									className: `rounded px-1.5 py-0.5 text-[10px] ${mn[e.health]}`,
									children: s(pn[e.health])
								})
							]
						}),
						e.manifest.description && /* @__PURE__ */ (0, q.jsx)("p", {
							className: "mt-1 line-clamp-2 text-[11px] leading-4 text-canvas-text-secondary",
							children: e.manifest.description
						}),
						/* @__PURE__ */ (0, q.jsxs)("p", {
							className: "mt-1.5 text-[10px] leading-4 text-canvas-text-muted",
							children: [
								e.source.sourceType === "folder" ? s("链接文件夹") : s("托管压缩包"),
								" · ",
								s("{count} 个 Skill", { count: e.skillCount }),
								" · ",
								s("{count} 个文件", { count: e.fileCount }),
								" · ",
								hn(e.totalBytes)
							]
						}),
						e.warnings.length > 0 && /* @__PURE__ */ (0, q.jsxs)("div", {
							className: "mt-2 rounded-lg border border-amber-400/20 bg-amber-400/5 px-2.5 py-2 text-[10px] leading-4 text-amber-200",
							children: [/* @__PURE__ */ (0, q.jsxs)("div", {
								className: "mb-1 flex items-center gap-1 font-medium",
								children: [/* @__PURE__ */ (0, q.jsx)(B, {
									icon: "mdi:alert-outline",
									width: "12"
								}), s("{count} 条预检提醒", { count: e.warnings.length })]
							}), /* @__PURE__ */ (0, q.jsx)("ul", {
								className: "list-disc space-y-0.5 pl-4",
								children: e.warnings.slice(0, 3).map((t, n) => /* @__PURE__ */ (0, q.jsx)("li", {
									className: "break-words",
									children: t
								}, `${e.id}-warning-${n}`))
							})]
						}),
						n && /* @__PURE__ */ (0, q.jsxs)("div", {
							className: "mt-2 flex items-start justify-between gap-3 rounded-lg border border-canvas-border bg-canvas-surface px-2.5 py-2",
							children: [/* @__PURE__ */ (0, q.jsxs)("div", {
								className: "min-w-0",
								children: [/* @__PURE__ */ (0, q.jsx)("p", {
									className: "text-[11px] font-medium text-canvas-text-secondary",
									children: s("MCP 只读")
								}), /* @__PURE__ */ (0, q.jsx)("p", {
									className: "mt-0.5 text-[10px] leading-4 text-canvas-text-muted",
									children: s("仅允许 MCP 客户端列出、加载和读取该智能体中的 Skill，不会执行包内脚本。")
								})]
							}), /* @__PURE__ */ (0, q.jsx)("button", {
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
				n && /* @__PURE__ */ (0, q.jsxs)("div", {
					className: "flex shrink-0 flex-col items-end gap-1",
					children: [/* @__PURE__ */ (0, q.jsx)("button", {
						type: "button",
						role: "switch",
						"aria-checked": e.enabled,
						"aria-label": e.enabled ? s("停用智能体 {name}", { name: c }) : s("启用智能体 {name}", { name: c }),
						disabled: t,
						onClick: i,
						className: `rounded-md px-2 py-1 text-[11px] transition-colors disabled:cursor-wait disabled:opacity-50 ${e.enabled ? "bg-emerald-500/10 text-emerald-300 hover:bg-emerald-500/15" : "bg-canvas-surface text-canvas-text-muted hover:bg-canvas-hover"}`,
						children: s(e.enabled ? "已启用" : "已停用")
					}), /* @__PURE__ */ (0, q.jsx)("button", {
						type: "button",
						disabled: t,
						onClick: o,
						"aria-label": s("移除智能体 {name}", { name: c }),
						className: "flex h-7 w-7 items-center justify-center rounded-md text-canvas-text-muted transition-colors\n                         hover:bg-red-400/10 hover:text-red-300 disabled:cursor-wait disabled:opacity-50",
						children: /* @__PURE__ */ (0, q.jsx)(B, {
							icon: "mdi:trash-can-outline",
							width: "14"
						})
					})]
				})
			]
		})
	});
}
function _n({ onClose: e, allowInstall: t = !1 }) {
	let n = r(), i = D((e) => e.agentPackages), a = D((e) => e.agentCatalogStatus), o = D((e) => e.agentCatalogErrorCode), s = D((e) => e.agentPackageSkillCatalogErrorCode), c = D((e) => e.installAgentPackagePreview), l = D((e) => e.setAgentPackageEnabled), u = D((e) => e.setAgentPackageMcpSkillReadEnabled), d = D((e) => e.removeAgentPackageRecord), f = D((e) => e.showToast), [p, m] = (0, K.useState)(null), [h, g] = (0, K.useState)(""), _ = async (e) => {
		try {
			await y(e);
		} catch {
			console.warn("[Agent Center] 智能体来源清理失败");
		}
	}, v = async (e) => {
		if (!t || p) return;
		if (typeof window === "undefined" || typeof window.__TAURI_INTERNALS__?.invoke !== "function") {
			let e = n("智能体上传需要桌面客户端");
			g(e), f(e, "error");
			return;
		}
		m(`import:${e}`), g("");
		let r = null, i = !1;
		try {
			let t = D.getState().agentPackages;
			if (r = e === "folder" ? await E() : await T(), !r) return;
			i = t.some((e) => e.source.sourceId === r?.sourceId);
			let a = await c(r), o = t.find((e) => e.id === a.id);
			o && o.source.sourceId !== a.source.sourceId && await _(o.source.sourceId), f(n("已安装智能体「{name}」", { name: r.name }));
		} catch (e) {
			r && !i && await _(r.sourceId);
			let t = e instanceof Error ? e.message : n("智能体上传失败");
			g(t), f(t, "error");
		} finally {
			m(null);
		}
	}, b = async (e) => {
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
	}, x = async (e) => {
		if (!t || p) return;
		let r = e.manifest.name || e.source.displayName;
		if (await I(n("确定从软件中移除智能体「{name}」？外部文件不会被删除。", { name: r }), { title: "移除智能体" })) {
			m(`remove:${e.id}`), g("");
			try {
				await d(e.id), await _(e.source.sourceId), f(n("已移除智能体「{name}」", { name: r }));
			} catch (e) {
				let t = e instanceof Error ? e.message : n("移除智能体失败");
				g(t), f(t, "error");
			} finally {
				m(null);
			}
		}
	}, S = async (e) => {
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
	return /* @__PURE__ */ (0, q.jsxs)("div", {
		className: "absolute inset-0 z-10 flex flex-col bg-canvas-bg",
		children: [/* @__PURE__ */ (0, q.jsxs)("div", {
			className: "flex items-center justify-between border-b border-canvas-border px-4 py-3",
			children: [/* @__PURE__ */ (0, q.jsxs)("div", {
				className: "flex min-w-0 items-center gap-2",
				children: [
					/* @__PURE__ */ (0, q.jsx)(B, {
						icon: "lucide:bot",
						width: "16",
						className: "shrink-0 text-brand"
					}),
					/* @__PURE__ */ (0, q.jsx)("span", {
						className: "truncate text-sm font-medium text-canvas-text",
						children: n("智能体中心")
					}),
					/* @__PURE__ */ (0, q.jsx)("span", {
						className: "shrink-0 text-[11px] text-canvas-text-muted",
						children: n("{count} 个已安装", { count: i.length })
					})
				]
			}), /* @__PURE__ */ (0, q.jsx)(R, { onClick: e })]
		}), /* @__PURE__ */ (0, q.jsxs)("div", {
			className: "flex-1 space-y-3 overflow-y-auto overflow-x-hidden p-3",
			children: [
				/* @__PURE__ */ (0, q.jsx)("section", {
					className: "rounded-xl border border-indigo-400/20 bg-indigo-400/5 p-3",
					children: /* @__PURE__ */ (0, q.jsxs)("div", {
						className: "flex items-start gap-3",
						children: [/* @__PURE__ */ (0, q.jsx)("span", {
							className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-300",
							children: /* @__PURE__ */ (0, q.jsx)(B, {
								icon: "mdi:creation-outline",
								width: "18"
							})
						}), /* @__PURE__ */ (0, q.jsxs)("div", {
							className: "min-w-0 flex-1",
							children: [/* @__PURE__ */ (0, q.jsxs)("div", {
								className: "flex flex-wrap items-center gap-1.5",
								children: [/* @__PURE__ */ (0, q.jsx)("h4", {
									className: "text-sm font-medium text-canvas-text",
									children: n("默认助手")
								}), /* @__PURE__ */ (0, q.jsx)("span", {
									className: "rounded bg-emerald-400/10 px-1.5 py-0.5 text-[10px] text-emerald-300",
									children: n("始终可用")
								})]
							}), /* @__PURE__ */ (0, q.jsx)("p", {
								className: "mt-1 text-[11px] leading-4 text-canvas-text-secondary",
								children: n("不安装智能体也能继续使用聊天、画布、工作流和模型功能。")
							})]
						})]
					})
				}),
				t && /* @__PURE__ */ (0, q.jsxs)("section", {
					className: "rounded-xl border border-canvas-border bg-canvas-card p-3",
					children: [
						/* @__PURE__ */ (0, q.jsx)("h3", {
							className: "text-xs font-medium text-canvas-text",
							children: n("上传智能体")
						}),
						/* @__PURE__ */ (0, q.jsx)("p", {
							className: "mt-1 text-[11px] leading-4 text-canvas-text-muted",
							children: n("文件夹会保持只读链接；压缩包会导入软件管理目录。上传只做预检，不会执行包内脚本。")
						}),
						/* @__PURE__ */ (0, q.jsxs)("div", {
							className: "mt-3 grid grid-cols-2 gap-2",
							children: [/* @__PURE__ */ (0, q.jsxs)(L, {
								type: "button",
								disabled: p !== null || typeof window === "undefined" || typeof window.__TAURI_INTERNALS__?.invoke !== "function",
								onClick: () => void v("folder"),
								className: "flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border border-canvas-border\n                           bg-canvas-surface px-3 py-2 text-xs text-canvas-text-secondary hover:border-brand/40 hover:text-canvas-text\n                           disabled:cursor-wait disabled:opacity-50",
								children: [/* @__PURE__ */ (0, q.jsx)(B, {
									icon: p === "import:folder" ? "mdi:loading" : "mdi:folder-plus-outline",
									width: "20",
									className: p === "import:folder" ? "animate-spin" : ""
								}), n("选择文件夹")]
							}), /* @__PURE__ */ (0, q.jsxs)(L, {
								type: "button",
								disabled: p !== null || typeof window === "undefined" || typeof window.__TAURI_INTERNALS__?.invoke !== "function",
								onClick: () => void v("archive"),
								className: "flex min-h-16 flex-col items-center justify-center gap-1.5 rounded-xl border border-canvas-border\n                           bg-canvas-surface px-3 py-2 text-xs text-canvas-text-secondary hover:border-brand/40 hover:text-canvas-text\n                           disabled:cursor-wait disabled:opacity-50",
								children: [/* @__PURE__ */ (0, q.jsx)(B, {
									icon: p === "import:archive" ? "mdi:loading" : "mdi:archive-arrow-up-outline",
									width: "20",
									className: p === "import:archive" ? "animate-spin" : ""
								}), n("选择压缩包")]
							})]
						}),
						/* @__PURE__ */ (0, q.jsx)("p", {
							className: "mt-2 text-center text-[10px] text-canvas-text-muted",
							children: n("支持 .aicanvas-agent、.tgz 和 .tar.gz")
						}), (typeof window === "undefined" || typeof window.__TAURI_INTERNALS__?.invoke !== "function") && /* @__PURE__ */ (0, q.jsx)("p", {
							className: "mt-2 text-center text-[10px] text-canvas-text-muted",
							children: n("智能体上传需在桌面客户端完成")
						})
					]
				}),
				(h || o || s) && /* @__PURE__ */ (0, q.jsx)("div", {
					role: "alert",
					className: "rounded-lg border border-red-400/20 bg-red-400/5 px-3 py-2 text-[11px] leading-4 text-red-300",
					children: h || n("智能体目录当前受限（{code}）", { code: o || s || "unknown" })
				}),
				a === "loading" && i.length === 0 ? /* @__PURE__ */ (0, q.jsxs)("div", {
					className: "flex items-center justify-center gap-2 py-8 text-xs text-canvas-text-muted",
					children: [/* @__PURE__ */ (0, q.jsx)(B, {
						icon: "mdi:loading",
						width: "16",
						className: "animate-spin"
					}), n("正在读取智能体目录…")]
				}) : i.length === 0 ? /* @__PURE__ */ (0, q.jsxs)("div", {
					className: "rounded-xl border border-dashed border-canvas-border px-4 py-7 text-center",
					children: [
						/* @__PURE__ */ (0, q.jsx)(B, {
							icon: "lucide:bot-off",
							width: "28",
							className: "mx-auto text-canvas-text-muted/50"
						}),
						/* @__PURE__ */ (0, q.jsx)("p", {
							className: "mt-2 text-xs text-canvas-text-secondary",
							children: n("还没有安装外部智能体")
						}),
						/* @__PURE__ */ (0, q.jsx)("p", {
							className: "mt-1 text-[10px] leading-4 text-canvas-text-muted",
							children: n("这不会影响默认助手和软件其他功能。")
						})
					]
				}) : /* @__PURE__ */ (0, q.jsx)("section", {
					className: "space-y-2",
					children: i.map((e) => /* @__PURE__ */ (0, q.jsx)(gn, {
						installation: e,
						busy: p === `toggle:${e.id}` || p === `mcp:${e.id}` || p === `remove:${e.id}`,
						allowInstall: t,
						onToggle: () => void b(e),
						onToggleMcpSkillRead: () => void S(e),
						onRemove: () => void x(e)
					}, e.id))
				})
			]
		})]
	});
}
//#endregion
//#region src/components/chat/AgentTaskCenter.tsx
var vn = new Set([
	"completed",
	"failed",
	"stopped"
]);
function yn({ tasks: e, conversations: t, onClose: n, ...i }) {
	let a = r(), [o, s] = (0, K.useState)("active"), c = (0, K.useMemo)(() => new Map(t.map((e) => [e.id, e.title])), [t]), l = (0, K.useMemo)(() => e.filter((e) => o === "all" || !vn.has(e.status)).sort((e, t) => t.updatedAt - e.updatedAt), [e, o]), u = e.filter((e) => !vn.has(e.status)).length, d = (0, K.useMemo)(() => new Map(e.map((e) => [e.id, e.goal])), [e]), f = (0, K.useMemo)(() => {
		let t = /* @__PURE__ */ new Map();
		for (let n of e) n.parentTaskId && t.set(n.parentTaskId, (t.get(n.parentTaskId) ?? 0) + 1);
		return t;
	}, [e]);
	return /* @__PURE__ */ (0, q.jsxs)("section", {
		className: "agent-task-center flex min-h-0 flex-1 flex-col",
		"aria-label": a("Agent 任务中心"),
		children: [/* @__PURE__ */ (0, q.jsxs)("header", {
			className: "agent-task-center__header flex min-h-12 shrink-0 items-center gap-2 border-b px-3",
			children: [
				/* @__PURE__ */ (0, q.jsx)("button", {
					type: "button",
					onClick: n,
					"aria-label": a("返回对话"),
					title: a("返回对话"),
					className: "flex h-8 w-8 shrink-0 items-center justify-center rounded-md text-canvas-text-muted\n                     transition-colors hover:bg-canvas-hover hover:text-canvas-text\n                     focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
					children: /* @__PURE__ */ (0, q.jsx)(B, {
						icon: "mdi:arrow-left",
						width: "18"
					})
				}),
				/* @__PURE__ */ (0, q.jsx)(B, {
					icon: "mdi:progress-wrench",
					width: "17",
					className: "text-[var(--brand)]"
				}),
				/* @__PURE__ */ (0, q.jsx)("h2", {
					className: "text-sm font-semibold text-canvas-text",
					children: a("任务中心")
				}),
				/* @__PURE__ */ (0, q.jsx)("span", {
					className: "text-[11px] tabular-nums text-canvas-text-muted",
					children: a("{count} 运行中", { count: u })
				}),
				/* @__PURE__ */ (0, q.jsx)("div", {
					className: "agent-task-center__tabs ml-auto flex items-center rounded-md border p-0.5",
					role: "tablist",
					children: ["active", "all"].map((e) => /* @__PURE__ */ (0, q.jsx)("button", {
						type: "button",
						role: "tab",
						"aria-selected": o === e,
						onClick: () => s(e),
						className: `agent-task-center__tab min-h-7 rounded px-2 text-[11px] transition-colors ${o === e ? "is-active text-canvas-text" : "text-canvas-text-muted hover:text-canvas-text"}`,
						children: a(e === "active" ? "进行中" : "全部")
					}, e))
				})
			]
		}), /* @__PURE__ */ (0, q.jsx)("div", {
			className: "min-h-0 flex-1 overflow-y-auto",
			children: l.length === 0 ? /* @__PURE__ */ (0, q.jsxs)("div", {
				className: "flex h-full min-h-48 flex-col items-center justify-center gap-2 text-canvas-text-muted",
				children: [/* @__PURE__ */ (0, q.jsx)(B, {
					icon: "mdi:progress-check",
					width: "28"
				}), /* @__PURE__ */ (0, q.jsx)("p", {
					className: "text-xs",
					children: a(o === "active" ? "暂无进行中的任务" : "暂无任务")
				})]
			}) : l.map((e) => /* @__PURE__ */ (0, q.jsxs)("section", {
				className: `agent-task-center__item border-b px-3 py-3 ${e.parentTaskId ? "agent-task-center__item--child ml-4 border-l" : ""}`,
				children: [/* @__PURE__ */ (0, q.jsxs)("div", {
					className: "flex items-start gap-2",
					children: [
						e.parentTaskId && /* @__PURE__ */ (0, q.jsx)(B, {
							icon: e.expertRole ? "mdi:account-search-outline" : "mdi:account-multiple-outline",
							width: "15",
							className: "mt-0.5 shrink-0 text-[var(--success)]"
						}),
						/* @__PURE__ */ (0, q.jsxs)("div", {
							className: "min-w-0 flex-1",
							children: [
								/* @__PURE__ */ (0, q.jsx)("p", {
									className: "truncate text-xs font-medium text-canvas-text",
									children: e.expertRole ? ve[e.expertRole] ?? e.goal : e.goal
								}),
								/* @__PURE__ */ (0, q.jsx)("p", {
									className: "mt-0.5 truncate text-[11px] text-canvas-text-muted",
									children: e.parentTaskId ? a("上级任务：{name}", { name: d.get(e.parentTaskId) ?? a("已删除任务") }) : c.get(e.conversationId) ?? a("已删除会话")
								}),
								!e.parentTaskId && (f.get(e.id) ?? 0) > 0 && /* @__PURE__ */ (0, q.jsx)("p", {
									className: "mt-0.5 text-[10px] text-[var(--success)]",
									children: a("{count} 个只读子任务", { count: f.get(e.id) ?? 0 })
								})
							]
						}),
						/* @__PURE__ */ (0, q.jsx)("time", {
							className: "shrink-0 text-[10px] tabular-nums text-canvas-text-muted",
							children: new Date(e.updatedAt).toLocaleTimeString([], {
								hour: "2-digit",
								minute: "2-digit"
							})
						})
					]
				}), /* @__PURE__ */ (0, q.jsx)(at, {
					task: e,
					...i
				})]
			}, e.id))
		})]
	});
}
//#endregion
//#region src/services/chat/agentRewindService.ts
async function bn(e) {
	let t = D.getState(), n = t.agentTasks.find((t) => t.id === e);
	if (!n) return {
		ok: !1,
		errorCode: "AGENT_REWIND_TASK_NOT_FOUND",
		message: "任务不存在"
	};
	let r = de(n, t.currentProjectId, t.historyIndex, t.getCurrentRevision());
	if (!r.ok || !r.undoCount) return r;
	for (let e = 0; e < r.undoCount; e += 1) await D.getState().undo();
	let i = D.getState().incrementRevision();
	return o(e, "canvas_rewind", {
		historyIndexBefore: r.lastCheckpoint?.historyIndexAfter,
		historyIndexAfter: D.getState().historyIndex,
		revisionBefore: r.lastCheckpoint?.revisionAfter,
		revisionAfter: i
	}), r;
}
//#endregion
//#region src/services/chat/detachedChatSyncController.ts
var xn = 150, Sn = 5e3, Cn = typeof window < "u" && "__TAURI__" in window, wn = null, Tn = [], En = /* @__PURE__ */ new Map(), Dn = /* @__PURE__ */ new Map();
function On(e) {
	if (e === wn) return Tn;
	let t = e.length !== Tn.length, n = /* @__PURE__ */ new Map(), r = /* @__PURE__ */ new Map(), i = e.map((e, i) => {
		let a = Dn.get(e.id), o = En.get(e.id) === e && a ? a : e.skillBindings?.length ? {
			...e,
			skillBindings: e.skillBindings.map((e) => ({
				skillId: e.skillId,
				name: e.name,
				version: e.version,
				content: "",
				allowedTools: e.allowedTools ? [...e.allowedTools] : void 0
			}))
		} : e;
		return o !== Tn[i] && (t = !0), n.set(e.id, e), r.set(e.id, o), o;
	});
	return wn = e, En = n, Dn = r, t && (Tn = i), Tn;
}
function kn(e, t, n, r) {
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
var An = {
	x: 0,
	y: 0
}, jn = null, Mn = [], Nn = /* @__PURE__ */ new Map();
function Pn(e, t) {
	return !!e && e.type === t.type && e.data.label === t.data.label && e.data.type === t.data.type && e.data.displayId === t.data.displayId && e.data.imageUrl === t.data.imageUrl && e.data.thumbnailUrl === t.data.thumbnailUrl;
}
function Fn(e) {
	if (e === jn) return Mn;
	jn = e;
	let t = e.length !== Mn.length, n = /* @__PURE__ */ new Map(), r = e.map((e, r) => {
		let i = Nn.get(e.id), a = Pn(i, e) ? i : {
			id: e.id,
			type: e.type,
			position: An,
			data: {
				label: e.data.label,
				type: e.data.type,
				displayId: e.data.displayId,
				imageUrl: e.data.imageUrl,
				thumbnailUrl: e.data.thumbnailUrl
			}
		};
		return a !== Mn[r] && (t = !0), n.set(e.id, a), a;
	});
	return t ? (Mn = r, Nn = n, Mn) : Mn;
}
var In = null, Ln = {};
function Rn(e) {
	return e === In ? Ln : (In = e, Ln = kn(te(e.generalModels ?? [], e), e.generalModels ?? [], e.providers, !!e.dreaminaAuth?.loggedIn), Ln);
}
function zn(e) {
	let t = e.projects.find((t) => t.id === e.currentProjectId);
	return {
		conversations: e.conversations,
		activeConversationId: e.activeConversationId,
		messages: e.messages,
		agentTasks: On(e.agentTasks),
		projectId: e.currentProjectId,
		projectName: t?.name,
		generalModels: e.config.generalModels ?? [],
		assistantModelId: c(t?.settings, e.config.assistantModelId)[0],
		assistantImageModelId: e.config.assistantImageModelId,
		assistantVideoModelId: e.config.assistantVideoModelId,
		mediaModelAvailability: Rn(e.config),
		localFileGrants: e.activeConversationId ? v(e.activeConversationId) : [],
		nodes: Fn(e.nodes),
		dramaAssets: e.dramaAssets,
		skillOptions: h(e.userSkills, e.agentPackageSkills),
		composerDraft: e.chatComposerLiveDraft
	};
}
function Bn(e, t) {
	return e.chatPanelDetached !== t.chatPanelDetached || e.conversations !== t.conversations || e.activeConversationId !== t.activeConversationId || e.messages !== t.messages || e.agentTasks !== t.agentTasks || e.currentProjectId !== t.currentProjectId || e.projects !== t.projects || e.config !== t.config || e.nodes !== t.nodes || e.dramaAssets !== t.dramaAssets || e.userSkills !== t.userSkills || e.agentPackageSkills !== t.agentPackageSkills || e.chatComposerLiveDraft !== t.chatComposerLiveDraft;
}
function Vn(e, t) {
	let n = D.getState();
	switch (e.type) {
		case "send_message": {
			e.conversationId !== n.activeConversationId && n.setActiveConversation(e.conversationId);
			let t = n.conversations.find((t) => t.id === e.conversationId);
			me({
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
			g(e.conversationId), n.updateConversation(e.conversationId, { deletedAt: Date.now() }), n.removeConversation(e.conversationId);
			break;
		case "authorize_local_files":
			_(e.conversationId).then((e) => {
				n.showToast(e.length > 0 ? `已授权 ${e.length} 个文件` : "未新增文件授权", "info");
			}).catch((e) => n.showToast(e instanceof Error ? e.message : "文件授权失败", "error"));
			break;
		case "revoke_local_file":
			i(e.conversationId, e.grantId);
			break;
		case "set_agent_mode":
			n.updateConversation(e.conversationId, { agentMode: e.mode }), n.showToast(ye(e.mode), "info");
			break;
		case "resolve_agent_approval":
			he(e.approvalId, e.resolution) || n.showToast("该确认已过期，请重新发起操作", "info");
			break;
		case "pause_agent_task":
			m(e.taskId), d(e.taskId);
			break;
		case "resume_agent_task": {
			let t = _e(e.taskId);
			t.ok || n.showToast(t.message ?? "无法继续该任务", "error");
			break;
		}
		case "stop_agent_task":
			m(e.taskId), f(e.taskId);
			break;
		case "skip_agent_step":
			try {
				u(e.taskId, e.stepId);
			} catch {
				n.showToast("该步骤已无法跳过", "error");
			}
			break;
		case "replan_agent_task": {
			try {
				m(e.taskId), a(e.taskId);
			} catch {
				n.showToast("该任务当前状态无法重新规划", "error");
				break;
			}
			let t = _e(e.taskId);
			t.ok || n.showToast(t.message ?? "无法重新规划该任务", "error");
			break;
		}
		case "rewind_agent_task":
			bn(e.taskId).then((e) => {
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
function Hn(e = {}) {
	let t = e.enabled ?? Cn, n = e.syncIntervalMs ?? xn, r = e.emitSync ?? ae, i = e.initListener ?? H, a = e.now ?? (() => performance.now()), o = null, s = !1, c = !1, l = !1, u = !1, d = 0, f = null, p = 0, m = !1, h = 0, g, _, v, y = () => {
		c = !1, l = !1, m = !1, f = null, p = 0, h = 0, o && clearTimeout(o), o = null;
	}, b = async () => {
		if (o = null, u || s || !c) return;
		let e = D.getState();
		if (!e.chatPanelDetached) {
			y();
			return;
		}
		c = !1, l = !1, s = !0, d = a();
		try {
			let t = zn(e), n = f;
			if (!(m || !n)) {
				let e = oe(n, t);
				if (!se(e)) {
					f = t, h = 0;
					return;
				}
				let i = p, a = p + 1;
				await r({
					type: "patch",
					baseRevision: i,
					revision: a,
					patch: e
				}), f = t, p = a, h = 0;
				return;
			}
			let i = p + 1;
			m = !1, await r({
				type: "snapshot",
				revision: i,
				snapshot: t
			}), f = t, p = i, h = 0;
		} catch (e) {
			h += 1, c = !0, m = !0, console.warn("[chatWindow] failed to sync detached window state:", e);
		} finally {
			if (s = !1, !u && c) {
				let e = a() - d, t = h > 0 ? Math.min(Sn, Math.max(1, n) * 2 ** Math.min(h - 1, 5)) : 0, r = t > 0 ? t : l ? 0 : Math.max(0, n - e);
				o = setTimeout(() => {
					b();
				}, r);
			}
		}
	}, x = (e = !1, r = !1) => {
		if (!t || u) return;
		if (!D.getState().chatPanelDetached) {
			y();
			return;
		}
		if (c = !0, e && (l = !0), r && (m = !0), o) {
			if (!e) return;
			clearTimeout(o), o = null;
		}
		if (s) return;
		let i = a() - d, f = e ? 0 : Math.max(0, n - i);
		if (f === 0) {
			b();
			return;
		}
		o = setTimeout(() => {
			b();
		}, f);
	};
	return {
		start: async () => {
			if (!t || u || _) return;
			_ = D.subscribe((e, t) => {
				if (!e.chatPanelDetached) {
					t.chatPanelDetached && y();
					return;
				}
				if (!Bn(e, t)) return;
				let n = !t.chatPanelDetached;
				x(n, n);
			}), v = S(() => x());
			let e = await i((e) => Vn(e, x), () => {
				D.getState().setHoveredMentionNodeId(null);
			});
			if (u) {
				e();
				return;
			}
			g = e, D.getState().chatPanelDetached && x(!0, !0);
		},
		dispose: () => {
			u || (u = !0, y(), _?.(), _ = void 0, v?.(), v = void 0, g?.(), g = void 0);
		},
		sync: x
	};
}
//#endregion
//#region src/components/chat/ChatPanel.tsx
var Un = typeof window < "u" && "__TAURI__" in window, Wn = 300, Gn = 400, Kn = 320, qn = 720, Jn = 64;
function Yn({ detached: e = !1, detachedSnapshot: t, detachedInitialized: n = !0, detachedHeaderActions: o } = {}) {
	let s = r(), l = ee(), { chatOpen: p, chatPanelDetached: h, chatComposerDraft: g, closeChat: y, clearChatComposerDraft: x, setChatPanelDetached: C, activeConversationId: w, conversations: T, messages: E, agentTasks: O, currentProjectId: k, projects: j, createConversation: P, setActiveConversation: F, updateConversation: I, loadConversationMessages: L, showToast: R, assistantModelId: ne, generalModels: re, providers: ie, dreaminaLoggedIn: B, workflows: ae, updateConfig: H, saveConfig: oe, updateProjectSettings: se, projectMemories: ce, updateProjectMemory: ue, removeProjectMemory: de } = D(z((e) => ({
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
	}))), pe = e ? t?.conversations ?? [] : T, U = e ? t?.activeConversationId ?? null : w, W = e ? t?.messages ?? [] : E, ve = e ? t?.agentTasks ?? [] : O, G = e ? t?.projectId ?? null : k, xe = e ? t?.projectName : void 0, Se = j.find((e) => e.id === k), Ce = c(Se?.settings, ne)[0], we = e ? t?.assistantModelId : Ce, J = (0, K.useMemo)(() => e ? t?.generalModels ?? [] : re, [
		e,
		t?.generalModels,
		re
	]), Te = (0, K.useMemo)(() => ({
		providers: ie,
		dreaminaAuth: { loggedIn: B }
	}), [B, ie]), De = (0, K.useMemo)(() => {
		let n = te(J, e ? void 0 : Te, e ? [] : ae);
		if (!e) return n;
		let r = t?.mediaModelAvailability;
		return r ? n.filter((e) => Object.prototype.hasOwnProperty.call(r, e.value)) : [];
	}, [
		e,
		t?.mediaModelAvailability,
		J,
		Te,
		ae
	]), Oe = (0, K.useMemo)(() => kn(De, re, ie, B), [
		B,
		re,
		De,
		ie
	]), ke = (0, K.useMemo)(() => e ? t?.mediaModelAvailability ?? {} : Oe, [
		e,
		t?.mediaModelAvailability,
		Oe
	]), Ae = pe.find((e) => e.id === U), je = Ae?.agentMode ?? "collaborative", Me = ve.some((e) => e.conversationId === U && [
		"planning",
		"running",
		"waiting_tool",
		"waiting_approval"
	].includes(e.status)), [Ne, Pe] = (0, K.useState)(""), Fe = (0, K.useRef)(/* @__PURE__ */ new Map()), Y = (0, K.useRef)(null), [X, Ie] = (0, K.useState)("chat"), [Le, Re] = (0, K.useState)(!1), [Z, ze] = (0, K.useState)(!1), [Be, Ve] = (0, K.useState)(!1), [He, Ue] = (0, K.useState)(!1), We = (0, K.useRef)(null), Ge = (0, K.useRef)(Gn), Ke = (0, K.useRef)(!1), qe = (0, K.useRef)(null), Je = (0, K.useCallback)((e) => {
		let t = We.current?.closest(".app-shell");
		if (!t) return;
		let n = Math.max(0, window.innerWidth - Jn), r = Math.min(Kn, n), i = Math.min(Math.max(r, Math.min(qn, n)), Math.max(r, e));
		t.style.setProperty("--chat-panel-width", `${Math.round(i)}px`);
	}, []);
	(0, K.useEffect)(() => {
		if (e || !p || h) return;
		let t = We.current;
		if (!t) return;
		let n = t.getBoundingClientRect().width;
		!Ke.current && Number.isFinite(n) && n > 0 && (Ge.current = Math.min(qn, Math.max(Kn, n)), Ke.current = !0);
		let r = () => {
			Je(Ge.current);
		};
		return r(), window.addEventListener("resize", r), () => window.removeEventListener("resize", r);
	}, [
		Je,
		p,
		h,
		e
	]), (0, K.useEffect)(() => () => {
		qe.current = null, document.body.classList.remove("chat-panel-resizing");
	}, []);
	let Ye = (0, K.useCallback)((t) => {
		if (e || t.button !== 0) return;
		let n = We.current;
		n && (qe.current = {
			pointerId: t.pointerId,
			startX: t.clientX,
			startWidth: n.getBoundingClientRect().width
		}, t.currentTarget.setPointerCapture(t.pointerId), document.body.classList.add("chat-panel-resizing"), t.preventDefault());
	}, [e]), Xe = (0, K.useCallback)((e) => {
		let t = qe.current;
		if (!t || t.pointerId !== e.pointerId) return;
		let n = Math.min(qn, Math.max(Kn, t.startWidth + t.startX - e.clientX));
		Ge.current = n, Je(n);
	}, [Je]), Ze = (0, K.useCallback)((e) => {
		let t = qe.current;
		!t || t.pointerId !== e.pointerId || (qe.current = null, document.body.classList.remove("chat-panel-resizing"), e.currentTarget.hasPointerCapture(e.pointerId) && e.currentTarget.releasePointerCapture(e.pointerId));
	}, []), Qe = D((e) => G ? b(e.projects, G) : null), $e = Qe ? ce.filter((e) => e.projectId === Qe) : [], [, et] = (0, K.useState)(0);
	(0, K.useEffect)(() => S(() => et((e) => e + 1)), []);
	let tt = e ? t?.localFileGrants ?? [] : U ? v(U) : [], nt = (0, K.useRef)({
		timer: null,
		value: null
	}), rt = (0, K.useCallback)(() => {
		let t = nt.current;
		if (t.timer && clearTimeout(t.timer), t.timer = null, t.value == null) return;
		let n = t.value;
		t.value = null, e ? V({
			type: "set_composer_draft",
			draft: n
		}) : D.getState().setChatComposerLiveDraft(n);
	}, [e]), it = (0, K.useCallback)((e) => {
		let t = nt.current;
		t.value = e, !t.timer && (t.timer = setTimeout(() => {
			t.timer = null, rt();
		}, Wn));
	}, [rt]);
	(0, K.useEffect)(() => (window.addEventListener("beforeunload", rt), () => {
		window.removeEventListener("beforeunload", rt), rt();
	}), [rt]);
	let Q = (0, K.useCallback)((e) => {
		Pe(e), it(e), U && (e ? Fe.current.set(U, e) : Fe.current.delete(U));
	}, [U, it]);
	(0, K.useEffect)(() => {
		if (U && Y.current != null) {
			let e = Y.current;
			Y.current = null, Fe.current.set(U, e), Pe(e);
			return;
		}
		Pe(U ? Fe.current.get(U) ?? "" : "");
	}, [U]);
	let at = (0, K.useRef)(!1);
	(0, K.useEffect)(() => {
		if (!(e ? n : !h)) {
			at.current = !1;
			return;
		}
		if (at.current) return;
		at.current = !0;
		let r = e ? t?.composerDraft ?? "" : D.getState().chatComposerLiveDraft;
		if (!r) return;
		let i = requestAnimationFrame(() => Q(r));
		return () => cancelAnimationFrame(i);
	}, [
		h,
		e,
		n,
		t?.composerDraft,
		Q
	]);
	let ot = (0, K.useCallback)((t) => {
		e ? V({
			type: "select_model",
			modelId: t,
			category: "text"
		}) : Se ? se({
			...Se.settings,
			defaultModels: {
				...Se.settings?.defaultModels,
				text: t
			}
		}) : (H({ assistantModelId: t }), oe({ silent: !0 }));
	}, [
		Se,
		e,
		oe,
		H,
		se
	]), st = (0, K.useCallback)((t) => {
		if (!(!U || t === je)) {
			if (e) {
				V({
					type: "set_agent_mode",
					conversationId: U,
					mode: t
				});
				return;
			}
			I(U, { agentMode: t }), R(ye(t), "info");
		}
	}, [
		e,
		U,
		je,
		R,
		I
	]), ct = U ? W.filter((e) => e.conversationId === U) : [], lt = (0, K.useMemo)(() => {
		if (!U) return null;
		let e = we?.replace(/^general\//, ""), t = J.find((t) => t.id === e && t.category === "text") ?? null;
		return fe(ct, Ae?.contextSummary, t);
	}, [
		U,
		we,
		J,
		Ae?.contextSummary,
		W
	]), ut = (0, K.useCallback)(() => {
		G && (e ? V({
			type: "create_conversation",
			projectId: G
		}) : P(G), Ie("chat"));
	}, [
		e,
		G,
		P
	]), dt = (0, K.useCallback)((t) => {
		e ? V({
			type: "switch_conversation",
			conversationId: t
		}) : (F(t), L(t)), Ie("chat");
	}, [
		e,
		F,
		L
	]), ft = (0, K.useCallback)(() => Ie("list"), []), pt = (0, K.useCallback)((e) => {
		if (!U && G) {
			Y.current = e, ut(), Pe(e);
			return;
		}
		Q(e);
	}, [
		U,
		G,
		ut,
		Q
	]);
	(0, K.useEffect)(() => {
		if (e || !g || !G) return;
		let t = 0, n = requestAnimationFrame(() => {
			pt(g), x(), t = requestAnimationFrame(() => {
				window.dispatchEvent(new CustomEvent("chat-focus-composer"));
			});
		});
		return () => {
			cancelAnimationFrame(n), t && cancelAnimationFrame(t);
		};
	}, [
		g,
		x,
		e,
		G,
		pt
	]);
	let mt = (0, K.useCallback)((t) => {
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
				}), n.showToast(s("已添加到画布"));
			} catch (e) {
				let r = e instanceof Error ? e.message : s("添加节点失败");
				n.updateMessage(t, {
					canvasStatus: "failed",
					canvasError: r
				}), n.showToast(r, "error");
			}
		}
	}, [e, s]), ht = (0, K.useCallback)(async (t) => {
		if (e) return;
		let n = D.getState(), r = n.messages.find((e) => e.id === t);
		if (r?.mediaResult) try {
			let e = await ge(r.mediaResult, n.currentProjectId), i = D.getState();
			i.updateMessage(t, { mediaResult: e }), r.canvasNodeId && i.settleMediaPlaceholder(r.canvasNodeId, e), i.showToast(s("产物已保存到项目"));
		} catch (e) {
			D.getState().showToast(e instanceof Error ? e.message : s("保存失败"), "error");
		}
	}, [e, s]), gt = (0, K.useCallback)((t, n) => {
		if (e) {
			V({
				type: "resolve_agent_approval",
				approvalId: t,
				resolution: n
			});
			return;
		}
		he(t, n) || R(s("该确认已过期，请重新发起操作"), "info");
	}, [
		e,
		R,
		s
	]), _t = (0, K.useCallback)(() => {
		setTimeout(() => {
			document.querySelector(".chat-panel-messages")?.lastElementChild?.scrollIntoView({ behavior: "smooth" });
		}, 100);
	}, []), $ = (0, K.useMemo)(() => ({
		onResolveApproval: gt,
		mediaModelOptions: De,
		mediaModelAvailability: ke,
		onPause: (t) => {
			if (e) {
				V({
					type: "pause_agent_task",
					taskId: t
				});
				return;
			}
			m(t), d(t), R(s("已暂停任务"), "info");
		},
		onResume: (t) => {
			if (e) {
				V({
					type: "resume_agent_task",
					taskId: t
				});
				return;
			}
			let n = _e(t, _t);
			R(n.ok ? s("已继续任务") : n.message ?? s("无法继续该任务"), n.ok ? "info" : "error");
		},
		onStop: (t) => {
			if (e) {
				V({
					type: "stop_agent_task",
					taskId: t
				});
				return;
			}
			m(t), f(t), R(s("已停止任务"), "info");
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
				u(t, n), R(s("已跳过当前步骤，可继续或重新规划"), "info");
			} catch {
				R(s("该步骤已无法跳过"), "error");
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
				m(t), a(t);
			} catch {
				R(s("该任务当前状态无法重新规划"), "error");
				return;
			}
			let n = _e(t, _t);
			R(n.ok ? s("正在重新规划任务") : n.message ?? s("无法重新规划该任务"), n.ok ? "info" : "error");
		},
		onRewind: (t) => {
			if (e) {
				V({
					type: "rewind_agent_task",
					taskId: t
				});
				return;
			}
			bn(t).then((e) => {
				R(e.ok ? s("已回退该任务的画布修改") : e.message ?? s("无法回退任务"), e.ok ? "info" : "error");
			});
		}
	}), [
		e,
		ke,
		gt,
		De,
		R,
		_t,
		s
	]), yt = (0, K.useCallback)(() => {
		if (U) {
			if (e) {
				V({
					type: "authorize_local_files",
					conversationId: U
				});
				return;
			}
			_(U).then((e) => {
				R(e.length > 0 ? s("已授权 {count} 个文件", { count: e.length }) : s("未新增文件授权"), "info");
			}).catch((e) => R(e instanceof Error ? e.message : s("文件授权失败"), "error"));
		}
	}, [
		e,
		U,
		R,
		s
	]), bt = (0, K.useCallback)((t) => {
		if (U) {
			if (e) {
				V({
					type: "revoke_local_file",
					conversationId: U,
					grantId: t
				});
				return;
			}
			i(U, t);
		}
	}, [e, U]), xt = (0, K.useCallback)((t, n = "queue") => {
		let r = t.trim();
		if (!(!r || !U)) {
			if (e) {
				V({
					type: "send_message",
					content: r,
					conversationId: U,
					dispatchMode: n
				}), Q("");
				return;
			}
			me({
				content: r,
				projectId: G ?? "",
				conversationId: U,
				mode: je,
				dispatchMode: n,
				onProgress: _t
			}), Q(""), _t();
		}
	}, [
		e,
		U,
		je,
		G,
		_t,
		Q
	]), St = (0, K.useCallback)(() => {
		xt(Ne);
	}, [Ne, xt]), Ct = (0, K.useCallback)(() => {
		xt(Ne, "interject");
	}, [Ne, xt]), wt = (0, K.useCallback)((e) => {
		Q(e), window.dispatchEvent(new CustomEvent("chat-focus-composer"));
	}, [Q]), Tt = (0, K.useCallback)((e) => {
		xt(e);
	}, [xt]), Et = (0, K.useCallback)((t) => {
		if (e) {
			V({
				type: "focus_node",
				nodeId: t
			});
			return;
		}
		if (!D.getState().nodes.some((e) => e.id === t)) {
			R(s("引用的节点已不存在"), "error");
			return;
		}
		window.dispatchEvent(new CustomEvent("canvas-focus-node", { detail: { nodeId: t } }));
	}, [
		e,
		R,
		s
	]), Dt = (0, K.useCallback)((t) => {
		if (e) {
			V({
				type: "set_hovered_node",
				nodeId: t
			});
			return;
		}
		D.getState().setHoveredMentionNodeId(t);
	}, [e]), Ot = (0, K.useCallback)((e) => {
		window.dispatchEvent(new CustomEvent("chat-open-reference-menu", { detail: {
			kind: "model",
			modelId: e
		} }));
	}, []);
	(0, K.useEffect)(() => {
		if (e) return;
		let t = Hn();
		return t.start(), () => t.dispose();
	}, [e]);
	let kt = (0, K.useCallback)(async () => {
		if (!Un) {
			R(s("独立窗口功能需要 Tauri 环境"), "info");
			return;
		}
		if (h) {
			try {
				await le(), await A("close_chat_window");
			} catch {}
			C(!1);
		} else {
			rt(), C(!0);
			try {
				await A("open_chat_window");
			} catch (e) {
				C(!1), console.error("[ChatPanel] failed to open chat window:", e), R(s("打开独立窗口失败"), "error");
			}
		}
	}, [
		h,
		rt,
		C,
		R,
		s
	]), At = !U && X === "chat";
	return /* @__PURE__ */ (0, q.jsx)(M, { children: (e || p && !h) && /* @__PURE__ */ (0, q.jsxs)(N.aside, {
		ref: We,
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
			!e && /* @__PURE__ */ (0, q.jsx)("div", {
				"aria-hidden": "true",
				className: "chat-panel-resize-handle",
				onPointerDown: Ye,
				onPointerMove: Xe,
				onPointerUp: Ze,
				onPointerCancel: Ze,
				onLostPointerCapture: Ze
			}),
			/* @__PURE__ */ (0, q.jsx)(Ee, {
				detached: e,
				chatPanelDetached: h,
				projectName: xe,
				agentMode: je,
				onAgentModeChange: st,
				agentModeDisabled: !U,
				onOpenMemory: !e && G ? () => {
					Ve(!1), ze(!1), Re(!0);
				} : void 0,
				onOpenSubAgents: e ? void 0 : () => {
					Ve(!1), Re(!1), ze(!0);
				},
				onOpenAgents: e ? void 0 : () => {
					Re(!1), ze(!1), Ue(!1), Ve(!0);
				},
				onOpenTasks: () => {
					Ve(!1), Re(!1), ze(!1), Ue(!0);
				},
				activeTaskCount: ve.filter((e) => ![
					"completed",
					"failed",
					"stopped"
				].includes(e.status)).length,
				showBackButton: X === "chat" && !!U,
				onBack: ft,
				onDetachToggle: kt,
				onClose: y,
				detachedHeaderActions: o
			}),
			/* @__PURE__ */ (0, q.jsx)("div", {
				className: "chat-panel-body flex flex-1 min-h-0",
				children: He ? /* @__PURE__ */ (0, q.jsx)(yn, {
					tasks: ve.filter((e) => e.projectId === G),
					conversations: pe,
					onClose: () => Ue(!1),
					...$
				}) : /* @__PURE__ */ (0, q.jsxs)(q.Fragment, { children: [X === "list" && /* @__PURE__ */ (0, q.jsx)(N.div, {
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
					children: /* @__PURE__ */ (0, q.jsx)(be, {
						...e ? {
							conversations: pe,
							activeConversationId: U,
							agentTasks: ve,
							projectId: G ?? void 0,
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
						onSelect: dt,
						onNew: ut
					})
				}), X === "chat" && /* @__PURE__ */ (0, q.jsxs)(N.div, {
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
					children: [/* @__PURE__ */ (0, q.jsx)(vt, {
						messages: ct,
						agentTasks: ve,
						showEmptyState: At,
						detachedInitialized: n,
						onNewConversation: ut,
						onShowList: ft,
						onOpenAgents: e ? void 0 : () => Ve(!0),
						onExampleClick: pt,
						onAddMediaToCanvas: e ? void 0 : mt,
						onRetryMediaSave: e ? void 0 : ht,
						onEditMessage: wt,
						onRegenerateMessage: Tt,
						onNodeActivate: Et,
						onNodeHover: Dt,
						onModelActivate: Ot,
						agentControls: $
					}), !At && /* @__PURE__ */ (0, q.jsx)(rn, {
						assistantModelId: we,
						onAssistantModelChange: ot,
						mediaModels: J,
						mediaModelOptions: De,
						mediaModelAvailability: ke,
						inputValue: Ne,
						onInputChange: Q,
						onSend: St,
						hasActiveTask: Me,
						onInterject: Ct,
						localFileGrants: tt,
						onAuthorizeLocalFiles: yt,
						onRevokeLocalFile: bt,
						contextUsage: lt,
						allowSkillUpload: !e,
						skillOptions: e ? t?.skillOptions ?? [] : void 0,
						agentMode: je,
						onAgentModeChange: st,
						agentModeDisabled: !U
					})]
				})] })
			}),
			Le && !e && /* @__PURE__ */ (0, q.jsx)(cn, {
				memories: $e,
				onUpdate: ue,
				onDelete: de,
				onClose: () => Re(!1)
			}),
			Z && !e && /* @__PURE__ */ (0, q.jsx)(fn, { onClose: () => ze(!1) }),
			Be && !e && /* @__PURE__ */ (0, q.jsx)(_n, {
				allowInstall: !0,
				onClose: () => Ve(!1)
			})
		]
	}) });
}
//#endregion
export { Yn as default };
