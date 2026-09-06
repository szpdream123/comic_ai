import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./jsx-runtime-BAkIPmuO.js";
import { a as r, i } from "./i18n-on3r1DCI.js";
import { W as a } from "./fileService-zQLozbOU.js";
//#region src/components/styleGuide/StyleGuideSections.tsx
var o = /* @__PURE__ */ e(t(), 1), s = n();
function c({ id: e, title: t, desc: n, children: r }) {
	return /* @__PURE__ */ (0, s.jsxs)("section", {
		id: e,
		className: "mb-9 scroll-mt-4",
		children: [
			/* @__PURE__ */ (0, s.jsx)("h2", {
				className: "m-0 mb-1 text-base font-semibold text-canvas-text",
				children: t
			}),
			n ? /* @__PURE__ */ (0, s.jsx)("p", {
				className: "m-0 mb-3 text-xs leading-relaxed text-canvas-text-muted",
				children: n
			}) : null,
			/* @__PURE__ */ (0, s.jsx)("div", {
				className: "ui-stack",
				children: r
			})
		]
	});
}
function l({ label: e, code: t, children: n }) {
	let [r, i] = (0, o.useState)(!1), a = (0, o.useRef)(null);
	return (0, o.useEffect)(() => () => {
		a.current && clearTimeout(a.current);
	}, []), /* @__PURE__ */ (0, s.jsxs)("div", {
		className: "rounded-lg border border-canvas-border bg-canvas-card",
		children: [
			e ? /* @__PURE__ */ (0, s.jsx)("div", {
				className: "rounded-t-lg border-b border-canvas-border px-3 py-1.5",
				children: /* @__PURE__ */ (0, s.jsx)("span", {
					className: "text-[11px] font-medium text-canvas-text-secondary",
					children: e
				})
			}) : null,
			/* @__PURE__ */ (0, s.jsx)("div", {
				className: "p-3",
				children: n
			}),
			/* @__PURE__ */ (0, s.jsxs)("button", {
				type: "button",
				onClick: async () => {
					try {
						await navigator.clipboard.writeText(t), i(!0), a.current && clearTimeout(a.current), a.current = setTimeout(() => i(!1), 1200);
					} catch {}
				},
				title: "点击复制类名",
				className: "group flex w-full items-center gap-2 rounded-b-lg border-t border-canvas-border bg-canvas-surface px-3 py-1.5 text-left transition-colors hover:bg-canvas-hover",
				children: [/* @__PURE__ */ (0, s.jsx)("code", {
					className: "min-w-0 flex-1 truncate font-mono text-[11px] text-canvas-text-secondary",
					children: t
				}), /* @__PURE__ */ (0, s.jsx)("span", {
					className: "shrink-0 text-[10px] text-canvas-text-muted group-hover:text-canvas-text-secondary",
					children: r ? "已复制" : "复制"
				})]
			})
		]
	});
}
function u({ cssVar: e, usage: t }) {
	return /* @__PURE__ */ (0, s.jsxs)("div", {
		className: "flex items-center gap-2.5",
		children: [/* @__PURE__ */ (0, s.jsx)("span", {
			className: "h-8 w-8 shrink-0 rounded-md border border-canvas-border",
			style: { background: `var(${e})` },
			"aria-hidden": "true"
		}), /* @__PURE__ */ (0, s.jsxs)("div", {
			className: "min-w-0",
			children: [/* @__PURE__ */ (0, s.jsx)("code", {
				className: "ui-code",
				children: e
			}), /* @__PURE__ */ (0, s.jsx)("p", {
				className: "m-0 mt-0.5 text-[10px] leading-tight text-canvas-text-muted",
				children: t
			})]
		})]
	});
}
function d({ items: e }) {
	return /* @__PURE__ */ (0, s.jsx)("div", {
		className: "grid grid-cols-[repeat(auto-fill,minmax(190px,1fr))] gap-x-4 gap-y-3",
		children: e.map((e) => /* @__PURE__ */ (0, s.jsx)(u, { ...e }, e.cssVar))
	});
}
function f() {
	return /* @__PURE__ */ (0, s.jsxs)(c, {
		id: "sg-colors",
		title: "颜色令牌",
		desc: "全部颜色来自 base.css 的变量。写样式时只引用变量（或 Tailwind 的 canvas-* token），不要写死色值，浅色主题才能自动生效。",
		children: [
			/* @__PURE__ */ (0, s.jsxs)(l, {
				code: "--theme-bg / --theme-surface / --theme-card / --theme-border / --theme-hover",
				children: [/* @__PURE__ */ (0, s.jsx)("p", {
					className: "m-0 mb-2 text-[11px] text-canvas-text-secondary",
					children: "主题层 · 背景与描边"
				}), /* @__PURE__ */ (0, s.jsx)(d, { items: [
					{
						cssVar: "--theme-bg",
						usage: "窗口最底层背景"
					},
					{
						cssVar: "--theme-surface",
						usage: "面板、输入框底"
					},
					{
						cssVar: "--theme-card",
						usage: "卡片、列表块"
					},
					{
						cssVar: "--theme-border",
						usage: "常规描边"
					},
					{
						cssVar: "--theme-hover",
						usage: "悬浮态底色"
					}
				] })]
			}),
			/* @__PURE__ */ (0, s.jsxs)(l, {
				code: "--theme-text / --theme-text-secondary / --theme-text-muted",
				children: [/* @__PURE__ */ (0, s.jsx)("p", {
					className: "m-0 mb-2 text-[11px] text-canvas-text-secondary",
					children: "文本层级 · 三级就够，不要再加"
				}), /* @__PURE__ */ (0, s.jsxs)("div", {
					className: "ui-stack ui-stack--tight",
					children: [
						/* @__PURE__ */ (0, s.jsx)("p", {
							className: "m-0 text-sm text-canvas-text",
							children: "--theme-text 主文本（标题、正文）"
						}),
						/* @__PURE__ */ (0, s.jsx)("p", {
							className: "m-0 text-xs text-canvas-text-secondary",
							children: "--theme-text-secondary 次级（说明、表单标签）"
						}),
						/* @__PURE__ */ (0, s.jsx)("p", {
							className: "m-0 text-xs text-canvas-text-muted",
							children: "--theme-text-muted 弱化（时间戳、占位符）"
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, s.jsxs)(l, {
				code: "--brand / --brand-light / --brand-pale / --brand-alpha-*",
				children: [/* @__PURE__ */ (0, s.jsx)("p", {
					className: "m-0 mb-2 text-[11px] text-canvas-text-secondary",
					children: "品牌色 · 主行动、选中态、焦点环"
				}), /* @__PURE__ */ (0, s.jsx)(d, { items: [
					{
						cssVar: "--brand",
						usage: "主按钮填充"
					},
					{
						cssVar: "--brand-light",
						usage: "浅底上的品牌文字"
					},
					{
						cssVar: "--brand-pale",
						usage: "更浅底上的文字"
					},
					{
						cssVar: "--brand-alpha-15",
						usage: "选中态淡底"
					}
				] })]
			}),
			/* @__PURE__ */ (0, s.jsxs)(l, {
				code: "--success / --info / --warning / --danger",
				children: [/* @__PURE__ */ (0, s.jsx)("p", {
					className: "m-0 mb-2 text-[11px] text-canvas-text-secondary",
					children: "语义色 · 状态提示与危险操作"
				}), /* @__PURE__ */ (0, s.jsxs)("div", {
					className: "ui-row ui-row--loose",
					children: [
						/* @__PURE__ */ (0, s.jsxs)("span", {
							className: "ui-badge ui-badge--success",
							children: [/* @__PURE__ */ (0, s.jsx)("i", { className: "ui-badge__dot" }), "成功"]
						}),
						/* @__PURE__ */ (0, s.jsxs)("span", {
							className: "ui-badge ui-badge--info",
							children: [/* @__PURE__ */ (0, s.jsx)("i", { className: "ui-badge__dot" }), "信息"]
						}),
						/* @__PURE__ */ (0, s.jsxs)("span", {
							className: "ui-badge ui-badge--warning",
							children: [/* @__PURE__ */ (0, s.jsx)("i", { className: "ui-badge__dot" }), "警告"]
						}),
						/* @__PURE__ */ (0, s.jsxs)("span", {
							className: "ui-badge ui-badge--danger",
							children: [/* @__PURE__ */ (0, s.jsx)("i", { className: "ui-badge__dot" }), "危险"]
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, s.jsxs)(l, {
				code: "--node-text / --node-image / --node-video / --node-audio / --node-panorama",
				children: [/* @__PURE__ */ (0, s.jsx)("p", {
					className: "m-0 mb-2 text-[11px] text-canvas-text-secondary",
					children: "节点类型色 · 文本=indigo、图像=green、视频=blue、音频=orange、全景=cyan"
				}), /* @__PURE__ */ (0, s.jsx)(d, { items: [
					{
						cssVar: "--node-text",
						usage: "文本节点"
					},
					{
						cssVar: "--node-image",
						usage: "图像节点"
					},
					{
						cssVar: "--node-video",
						usage: "视频节点"
					},
					{
						cssVar: "--node-audio",
						usage: "音频节点"
					},
					{
						cssVar: "--node-panorama",
						usage: "全景节点"
					}
				] })]
			})
		]
	});
}
function p() {
	return /* @__PURE__ */ (0, s.jsxs)(c, {
		id: "sg-typography",
		title: "排版",
		desc: "字号只有 11 / 12 / 14 / 15 / 17 五档，字重只有 400 / 500 / 600。需要更大的数字用 .ui-stat__value。",
		children: [/* @__PURE__ */ (0, s.jsx)(l, {
			code: "text-[17px] font-semibold / text-[15px] font-semibold / text-[14px] font-medium",
			children: /* @__PURE__ */ (0, s.jsxs)("div", {
				className: "ui-stack ui-stack--tight",
				children: [
					/* @__PURE__ */ (0, s.jsx)("p", {
						className: "m-0 text-[17px] font-semibold text-canvas-text",
						children: "窗口标题 17 / 600"
					}),
					/* @__PURE__ */ (0, s.jsx)("p", {
						className: "m-0 text-[15px] font-semibold text-canvas-text",
						children: "面板标题 15 / 600（.ui-title）"
					}),
					/* @__PURE__ */ (0, s.jsx)("p", {
						className: "m-0 text-[14px] font-medium text-canvas-text",
						children: "分区标题 14 / 500"
					}),
					/* @__PURE__ */ (0, s.jsx)("p", {
						className: "m-0 text-xs text-canvas-text-secondary",
						children: "正文与控件文字 12 / 400"
					}),
					/* @__PURE__ */ (0, s.jsx)("p", {
						className: "m-0 text-[11px] text-canvas-text-muted",
						children: "辅助说明与标签 11 / 400"
					})
				]
			})
		}), /* @__PURE__ */ (0, s.jsx)(l, {
			code: ".ui-code / .ui-kbd / .ui-subtitle",
			children: /* @__PURE__ */ (0, s.jsxs)("div", {
				className: "ui-row ui-row--loose ui-row--baseline",
				children: [
					/* @__PURE__ */ (0, s.jsxs)("span", {
						className: "text-xs text-canvas-text-secondary",
						children: ["内联代码 ", /* @__PURE__ */ (0, s.jsx)("code", {
							className: "ui-code",
							children: "ui-btn--primary"
						})]
					}),
					/* @__PURE__ */ (0, s.jsxs)("span", {
						className: "text-xs text-canvas-text-secondary",
						children: [
							"快捷键 ",
							/* @__PURE__ */ (0, s.jsx)("kbd", {
								className: "ui-kbd",
								children: "Ctrl"
							}),
							" ",
							/* @__PURE__ */ (0, s.jsx)("kbd", {
								className: "ui-kbd",
								children: "K"
							})
						]
					}),
					/* @__PURE__ */ (0, s.jsx)("span", {
						className: "ui-subtitle",
						children: "小标题 uppercase"
					})
				]
			})
		})]
	});
}
function m() {
	return /* @__PURE__ */ (0, s.jsxs)(c, {
		id: "sg-buttons",
		title: "按钮",
		desc: "基础按钮带淡底与淡描边，与工作流面板一致；primary 一个界面只放一个，ghost 用于工具栏，danger 只给不可逆操作。节点主题色按钮让分类切换与节点类型对应。",
		children: [
			/* @__PURE__ */ (0, s.jsx)(l, {
				label: "变体",
				code: "ui-btn ui-btn--primary | --secondary | --ghost | --danger | --link",
				children: /* @__PURE__ */ (0, s.jsxs)("div", {
					className: "ui-row",
					children: [
						/* @__PURE__ */ (0, s.jsx)("button", {
							type: "button",
							className: "ui-btn ui-btn--primary",
							children: "主行动"
						}),
						/* @__PURE__ */ (0, s.jsx)("button", {
							type: "button",
							className: "ui-btn ui-btn--secondary",
							children: "次级"
						}),
						/* @__PURE__ */ (0, s.jsx)("button", {
							type: "button",
							className: "ui-btn ui-btn--ghost",
							children: "幽灵"
						}),
						/* @__PURE__ */ (0, s.jsx)("button", {
							type: "button",
							className: "ui-btn ui-btn--danger",
							children: "删除"
						}),
						/* @__PURE__ */ (0, s.jsx)("button", {
							type: "button",
							className: "ui-btn ui-btn--link",
							children: "了解更多"
						})
					]
				})
			}),
			/* @__PURE__ */ (0, s.jsx)(l, {
				label: "节点主题色按钮",
				code: "ui-btn--node-text | --node-image | --node-video | --node-audio | --node-panorama（配合 .is-active）",
				children: /* @__PURE__ */ (0, s.jsx)("div", {
					className: "ui-row",
					children: [
						{
							key: "text",
							label: "文本"
						},
						{
							key: "image",
							label: "图像"
						},
						{
							key: "video",
							label: "视频"
						},
						{
							key: "audio",
							label: "音频"
						},
						{
							key: "panorama",
							label: "全景"
						}
					].map((e) => /* @__PURE__ */ (0, s.jsx)("button", {
						type: "button",
						className: `ui-btn ui-btn--node-${e.key} is-active`,
						children: e.label
					}, e.key))
				})
			}),
			/* @__PURE__ */ (0, s.jsx)(l, {
				label: "尺寸",
				code: "ui-btn--sm（工具栏）/ 默认 / ui-btn--lg（弹窗主行动）",
				children: /* @__PURE__ */ (0, s.jsxs)("div", {
					className: "ui-row ui-row--baseline",
					children: [
						/* @__PURE__ */ (0, s.jsx)("button", {
							type: "button",
							className: "ui-btn ui-btn--primary ui-btn--sm",
							children: "小号"
						}),
						/* @__PURE__ */ (0, s.jsx)("button", {
							type: "button",
							className: "ui-btn ui-btn--primary",
							children: "默认"
						}),
						/* @__PURE__ */ (0, s.jsx)("button", {
							type: "button",
							className: "ui-btn ui-btn--primary ui-btn--lg",
							children: "大号"
						})
					]
				})
			}),
			/* @__PURE__ */ (0, s.jsx)(l, {
				label: "状态",
				code: ":disabled / .is-active / .is-loading（内部放 .ui-spinner）",
				children: /* @__PURE__ */ (0, s.jsxs)("div", {
					className: "ui-row",
					children: [
						/* @__PURE__ */ (0, s.jsx)("button", {
							type: "button",
							className: "ui-btn ui-btn--secondary",
							disabled: !0,
							children: "禁用"
						}),
						/* @__PURE__ */ (0, s.jsx)("button", {
							type: "button",
							className: "ui-btn ui-btn--secondary is-active",
							children: "选中"
						}),
						/* @__PURE__ */ (0, s.jsxs)("button", {
							type: "button",
							className: "ui-btn ui-btn--primary is-loading",
							children: [/* @__PURE__ */ (0, s.jsx)("span", { className: "ui-spinner" }), "处理中"]
						}),
						/* @__PURE__ */ (0, s.jsx)("button", {
							type: "button",
							className: "ui-btn ui-btn--primary ui-btn--block",
							children: "通栏 ui-btn--block"
						})
					]
				})
			}),
			/* @__PURE__ */ (0, s.jsx)(l, {
				label: "图标按钮与按钮组",
				code: "ui-icon-btn / ui-icon-btn--danger / ui-btn-group",
				children: /* @__PURE__ */ (0, s.jsxs)("div", {
					className: "ui-row ui-row--loose",
					children: [
						/* @__PURE__ */ (0, s.jsx)("button", {
							type: "button",
							className: "ui-icon-btn",
							"aria-label": "设置",
							children: /* @__PURE__ */ (0, s.jsxs)("svg", {
								width: "15",
								height: "15",
								viewBox: "0 0 24 24",
								fill: "none",
								stroke: "currentColor",
								strokeWidth: "2",
								"aria-hidden": "true",
								children: [/* @__PURE__ */ (0, s.jsx)("circle", {
									cx: "12",
									cy: "12",
									r: "3"
								}), /* @__PURE__ */ (0, s.jsx)("path", { d: "M19.4 15a1.65 1.65 0 0 0 .33 1.82l.06.06a2 2 0 0 1-2.83 2.83l-.06-.06a1.65 1.65 0 0 0-1.82-.33 1.65 1.65 0 0 0-1 1.51V21a2 2 0 0 1-4 0v-.09A1.65 1.65 0 0 0 9 19.4a1.65 1.65 0 0 0-1.82.33l-.06.06a2 2 0 0 1-2.83-2.83l.06-.06A1.65 1.65 0 0 0 4.68 15a1.65 1.65 0 0 0-1.51-1H3a2 2 0 0 1 0-4h.09A1.65 1.65 0 0 0 4.6 9a1.65 1.65 0 0 0-.33-1.82l-.06-.06a2 2 0 0 1 2.83-2.83l.06.06A1.65 1.65 0 0 0 9 4.68a1.65 1.65 0 0 0 1-1.51V3a2 2 0 0 1 4 0v.09a1.65 1.65 0 0 0 1 1.51 1.65 1.65 0 0 0 1.82-.33l.06-.06a2 2 0 0 1 2.83 2.83l-.06.06A1.65 1.65 0 0 0 19.4 9a1.65 1.65 0 0 0 1.51 1H21a2 2 0 0 1 0 4h-.09a1.65 1.65 0 0 0-1.51 1z" })]
							})
						}),
						/* @__PURE__ */ (0, s.jsx)("button", {
							type: "button",
							className: "ui-icon-btn ui-icon-btn--danger",
							"aria-label": "删除",
							children: /* @__PURE__ */ (0, s.jsx)("svg", {
								width: "15",
								height: "15",
								viewBox: "0 0 24 24",
								fill: "none",
								stroke: "currentColor",
								strokeWidth: "2",
								"aria-hidden": "true",
								children: /* @__PURE__ */ (0, s.jsx)("path", {
									d: "M3 6h18M8 6V4h8v2M6 6l1 14h10l1-14",
									strokeLinecap: "round",
									strokeLinejoin: "round"
								})
							})
						}),
						/* @__PURE__ */ (0, s.jsxs)("div", {
							className: "ui-btn-group",
							children: [
								/* @__PURE__ */ (0, s.jsx)("button", {
									type: "button",
									className: "ui-btn ui-btn--secondary ui-btn--sm",
									children: "日"
								}),
								/* @__PURE__ */ (0, s.jsx)("button", {
									type: "button",
									className: "ui-btn ui-btn--secondary ui-btn--sm is-active",
									children: "周"
								}),
								/* @__PURE__ */ (0, s.jsx)("button", {
									type: "button",
									className: "ui-btn ui-btn--secondary ui-btn--sm",
									children: "月"
								})
							]
						})
					]
				})
			})
		]
	});
}
function h() {
	let [e, t] = (0, o.useState)("all");
	return /* @__PURE__ */ (0, s.jsxs)(c, {
		id: "sg-chips",
		title: "分类胶囊",
		desc: "工作流面板里「生成文本 / 生成图像」那种紧凑分类按钮。用 ui-chip 做默认品牌色，ui-chip--node-* 做节点主题色分类。",
		children: [/* @__PURE__ */ (0, s.jsx)(l, {
			label: "基础分类",
			code: "ui-chip（.is-active 默认品牌色）",
			children: /* @__PURE__ */ (0, s.jsx)("div", {
				className: "ui-row",
				children: [
					{
						key: "all",
						label: "全部"
					},
					{
						key: "text",
						label: "文本"
					},
					{
						key: "image",
						label: "图像"
					},
					{
						key: "video",
						label: "视频"
					},
					{
						key: "audio",
						label: "音频"
					}
				].map((n) => /* @__PURE__ */ (0, s.jsx)("button", {
					type: "button",
					className: `ui-chip${e === n.key ? " is-active" : ""}`,
					onClick: () => t(n.key),
					children: n.label
				}, n.key))
			})
		}), /* @__PURE__ */ (0, s.jsx)(l, {
			label: "节点主题色分类",
			code: "ui-chip ui-chip--node-text | --node-image | --node-video | --node-audio | --node-panorama",
			children: /* @__PURE__ */ (0, s.jsx)("div", {
				className: "ui-row",
				children: [
					{
						key: "text",
						label: "文本"
					},
					{
						key: "image",
						label: "图像"
					},
					{
						key: "video",
						label: "视频"
					},
					{
						key: "audio",
						label: "音频"
					},
					{
						key: "panorama",
						label: "全景"
					}
				].map((e) => /* @__PURE__ */ (0, s.jsx)("button", {
					type: "button",
					className: `ui-chip ui-chip--node-${e.key} is-active`,
					children: e.label
				}, e.key))
			})
		})]
	});
}
function g() {
	return /* @__PURE__ */ (0, s.jsxs)(c, {
		id: "sg-inputs",
		title: "输入框",
		desc: "统一用 .ui-field 包一层（label + 控件 + hint），间距和错误提示就不用各写一遍了。",
		children: [
			/* @__PURE__ */ (0, s.jsx)(l, {
				label: "基础与尺寸",
				code: "<div className=\"ui-field\"><label className=\"ui-label\"/><input className=\"ui-input\"/></div>",
				children: /* @__PURE__ */ (0, s.jsxs)("div", {
					className: "grid gap-3 sm:grid-cols-3",
					children: [
						/* @__PURE__ */ (0, s.jsxs)("div", {
							className: "ui-field",
							children: [/* @__PURE__ */ (0, s.jsx)("label", {
								className: "ui-label",
								htmlFor: "sg-input-sm",
								children: "小号 ui-input--sm"
							}), /* @__PURE__ */ (0, s.jsx)("input", {
								id: "sg-input-sm",
								className: "ui-input ui-input--sm",
								placeholder: "请输入"
							})]
						}),
						/* @__PURE__ */ (0, s.jsxs)("div", {
							className: "ui-field",
							children: [/* @__PURE__ */ (0, s.jsx)("label", {
								className: "ui-label",
								htmlFor: "sg-input-md",
								children: "默认 ui-input"
							}), /* @__PURE__ */ (0, s.jsx)("input", {
								id: "sg-input-md",
								className: "ui-input",
								placeholder: "请输入"
							})]
						}),
						/* @__PURE__ */ (0, s.jsxs)("div", {
							className: "ui-field",
							children: [/* @__PURE__ */ (0, s.jsx)("label", {
								className: "ui-label",
								htmlFor: "sg-input-lg",
								children: "大号 ui-input--lg"
							}), /* @__PURE__ */ (0, s.jsx)("input", {
								id: "sg-input-lg",
								className: "ui-input ui-input--lg",
								placeholder: "请输入"
							})]
						})
					]
				})
			}),
			/* @__PURE__ */ (0, s.jsx)(l, {
				label: "说明与错误态",
				code: ".ui-hint 说明文字 / .ui-error 校验失败 / .ui-input.is-invalid",
				children: /* @__PURE__ */ (0, s.jsxs)("div", {
					className: "grid gap-3 sm:grid-cols-2",
					children: [/* @__PURE__ */ (0, s.jsxs)("div", {
						className: "ui-field",
						children: [
							/* @__PURE__ */ (0, s.jsx)("label", {
								className: "ui-label",
								htmlFor: "sg-input-hint",
								children: "连接名称"
							}),
							/* @__PURE__ */ (0, s.jsx)("input", {
								id: "sg-input-hint",
								className: "ui-input",
								defaultValue: "OpenAI 主账号"
							}),
							/* @__PURE__ */ (0, s.jsx)("p", {
								className: "ui-hint",
								children: "仅本地保存，用于区分多个厂商连接"
							})
						]
					}), /* @__PURE__ */ (0, s.jsxs)("div", {
						className: "ui-field",
						children: [
							/* @__PURE__ */ (0, s.jsx)("label", {
								className: "ui-label",
								htmlFor: "sg-input-err",
								children: "接口地址"
							}),
							/* @__PURE__ */ (0, s.jsx)("input", {
								id: "sg-input-err",
								className: "ui-input is-invalid",
								defaultValue: "not-a-url"
							}),
							/* @__PURE__ */ (0, s.jsx)("p", {
								className: "ui-error",
								children: "请填写以 http(s):// 开头的完整地址"
							})
						]
					})]
				})
			}),
			/* @__PURE__ */ (0, s.jsx)(l, {
				label: "前后缀",
				code: "ui-input-group + ui-input-affix--leading | --trailing",
				children: /* @__PURE__ */ (0, s.jsxs)("div", {
					className: "grid gap-3 sm:grid-cols-2",
					children: [/* @__PURE__ */ (0, s.jsxs)("div", {
						className: "ui-field",
						children: [/* @__PURE__ */ (0, s.jsx)("label", {
							className: "ui-label",
							htmlFor: "sg-input-search",
							children: "搜索"
						}), /* @__PURE__ */ (0, s.jsxs)("div", {
							className: "ui-input-group",
							children: [/* @__PURE__ */ (0, s.jsx)("span", {
								className: "ui-input-affix ui-input-affix--leading",
								children: /* @__PURE__ */ (0, s.jsxs)("svg", {
									width: "13",
									height: "13",
									viewBox: "0 0 24 24",
									fill: "none",
									stroke: "currentColor",
									strokeWidth: "2",
									"aria-hidden": "true",
									children: [/* @__PURE__ */ (0, s.jsx)("circle", {
										cx: "11",
										cy: "11",
										r: "8"
									}), /* @__PURE__ */ (0, s.jsx)("line", {
										x1: "21",
										y1: "21",
										x2: "16.65",
										y2: "16.65"
									})]
								})
							}), /* @__PURE__ */ (0, s.jsx)("input", {
								id: "sg-input-search",
								className: "ui-input",
								placeholder: "搜索文件名或标签…"
							})]
						})]
					}), /* @__PURE__ */ (0, s.jsxs)("div", {
						className: "ui-field",
						children: [/* @__PURE__ */ (0, s.jsx)("label", {
							className: "ui-label",
							htmlFor: "sg-input-unit",
							children: "采样步数"
						}), /* @__PURE__ */ (0, s.jsxs)("div", {
							className: "ui-input-group",
							children: [/* @__PURE__ */ (0, s.jsx)("input", {
								id: "sg-input-unit",
								className: "ui-input",
								defaultValue: "20"
							}), /* @__PURE__ */ (0, s.jsx)("span", {
								className: "ui-input-affix ui-input-affix--trailing",
								children: "steps"
							})]
						})]
					})]
				})
			}),
			/* @__PURE__ */ (0, s.jsxs)(l, {
				label: "多行文本与禁用",
				code: ".ui-textarea（可纵向拉伸）/ :disabled",
				children: [/* @__PURE__ */ (0, s.jsxs)("div", {
					className: "ui-field",
					children: [
						/* @__PURE__ */ (0, s.jsx)("label", {
							className: "ui-label",
							htmlFor: "sg-textarea",
							children: "提示词"
						}),
						/* @__PURE__ */ (0, s.jsx)("textarea", {
							id: "sg-textarea",
							className: "ui-textarea",
							defaultValue: "一只在雨中奔跑的柴犬，电影感光影"
						}),
						/* @__PURE__ */ (0, s.jsx)("p", {
							className: "ui-hint",
							children: "右下角可拖动改变高度"
						})
					]
				}), /* @__PURE__ */ (0, s.jsxs)("div", {
					className: "ui-field",
					children: [/* @__PURE__ */ (0, s.jsx)("label", {
						className: "ui-label",
						htmlFor: "sg-input-disabled",
						children: "只读字段"
					}), /* @__PURE__ */ (0, s.jsx)("input", {
						id: "sg-input-disabled",
						className: "ui-input",
						defaultValue: "由系统生成，不可编辑",
						disabled: !0
					})]
				})]
			})
		]
	});
}
function _() {
	let [e, t] = (0, o.useState)("flux"), [n, r] = (0, o.useState)(!1), i = (0, o.useRef)(null), a = [
		{
			value: "flux",
			label: "FLUX.1 [dev]"
		},
		{
			value: "sdxl",
			label: "SDXL 1.0"
		},
		{
			value: "kolors",
			label: "可图 Kolors"
		},
		{
			value: "custom",
			label: "自定义（未配置）",
			disabled: !0
		}
	], c = a.find((t) => t.value === e);
	return (0, o.useEffect)(() => {
		if (!n) return;
		let e = (e) => {
			i.current?.contains(e.target) || r(!1);
		};
		return document.addEventListener("mousedown", e), () => document.removeEventListener("mousedown", e);
	}, [n]), /* @__PURE__ */ (0, s.jsxs)("div", {
		className: "ui-field",
		style: { maxWidth: 240 },
		children: [
			/* @__PURE__ */ (0, s.jsx)("label", {
				className: "ui-label",
				htmlFor: "sg-select-custom",
				children: "图像模型"
			}),
			/* @__PURE__ */ (0, s.jsxs)("div", {
				className: "ui-select ui-select--custom",
				ref: i,
				children: [
					/* @__PURE__ */ (0, s.jsxs)("button", {
						id: "sg-select-custom",
						type: "button",
						className: "ui-select__trigger",
						"aria-haspopup": "listbox",
						"aria-expanded": n,
						onClick: () => r((e) => !e),
						children: [/* @__PURE__ */ (0, s.jsx)("span", {
							className: "ui-select__trigger-text",
							children: c?.label
						}), /* @__PURE__ */ (0, s.jsx)("svg", {
							className: "ui-select__chevron",
							width: "12",
							height: "12",
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							strokeWidth: "2.5",
							"aria-hidden": "true",
							children: /* @__PURE__ */ (0, s.jsx)("polyline", { points: "6 9 12 15 18 9" })
						})]
					}),
					/* @__PURE__ */ (0, s.jsx)("select", {
						className: "ui-select__native",
						value: e,
						onChange: (e) => t(e.target.value),
						tabIndex: -1,
						"aria-hidden": "true",
						children: a.map((e) => /* @__PURE__ */ (0, s.jsx)("option", {
							value: e.value,
							disabled: e.disabled,
							children: e.label
						}, e.value))
					}),
					n ? /* @__PURE__ */ (0, s.jsx)("div", {
						className: "ui-menu",
						role: "listbox",
						children: a.map((n) => /* @__PURE__ */ (0, s.jsx)("button", {
							type: "button",
							role: "option",
							"aria-selected": e === n.value,
							disabled: n.disabled,
							className: `ui-menu__item${e === n.value ? " is-active" : ""}${n.disabled ? " is-disabled" : ""}`,
							onClick: () => {
								t(n.value), r(!1);
							},
							children: n.label
						}, n.value))
					}) : null
				]
			}),
			/* @__PURE__ */ (0, s.jsxs)("p", {
				className: "ui-hint",
				children: ["当前值：", e]
			})
		]
	});
}
function v() {
	let [e, t] = (0, o.useState)(!1), [n, r] = (0, o.useState)("最近修改"), i = (0, o.useRef)(null);
	return (0, o.useEffect)(() => {
		if (!e) return;
		let n = (e) => {
			i.current?.contains(e.target) || t(!1);
		};
		return document.addEventListener("mousedown", n), () => document.removeEventListener("mousedown", n);
	}, [e]), /* @__PURE__ */ (0, s.jsxs)("div", {
		className: "ui-dropdown",
		ref: i,
		children: [/* @__PURE__ */ (0, s.jsxs)("button", {
			type: "button",
			className: "ui-btn ui-btn--secondary",
			"aria-haspopup": "menu",
			"aria-expanded": e,
			onClick: () => t((e) => !e),
			children: [n, /* @__PURE__ */ (0, s.jsx)("svg", {
				width: "12",
				height: "12",
				viewBox: "0 0 24 24",
				fill: "none",
				stroke: "currentColor",
				strokeWidth: "2.5",
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, s.jsx)("polyline", { points: "6 9 12 15 18 9" })
			})]
		}), e ? /* @__PURE__ */ (0, s.jsxs)("div", {
			className: "ui-menu",
			role: "menu",
			children: [
				/* @__PURE__ */ (0, s.jsx)("span", {
					className: "ui-menu__label",
					children: "排序"
				}),
				[
					"最近修改",
					"名称 A→Z",
					"创建时间"
				].map((e) => /* @__PURE__ */ (0, s.jsx)("button", {
					type: "button",
					role: "menuitem",
					className: `ui-menu__item${n === e ? " is-active" : ""}`,
					onClick: () => {
						r(e), t(!1);
					},
					children: e
				}, e)),
				/* @__PURE__ */ (0, s.jsx)("div", { className: "ui-menu__sep" }),
				/* @__PURE__ */ (0, s.jsx)("span", {
					className: "ui-menu__label",
					children: "操作"
				}),
				/* @__PURE__ */ (0, s.jsxs)("button", {
					type: "button",
					role: "menuitem",
					className: "ui-menu__item",
					children: ["导出为 JSON", /* @__PURE__ */ (0, s.jsx)("span", {
						className: "ui-menu__shortcut",
						children: "Ctrl+E"
					})]
				}),
				/* @__PURE__ */ (0, s.jsx)("button", {
					type: "button",
					role: "menuitem",
					className: "ui-menu__item is-danger",
					children: "删除工作区"
				})
			]
		}) : null]
	});
}
function y() {
	return /* @__PURE__ */ (0, s.jsxs)(c, {
		id: "sg-selects",
		title: "下拉选择",
		desc: "普通选项用原生 .ui-select（可访问性好、键盘可用）；需要图标、分组、危险项或快捷键时再用 .ui-menu 自定义菜单。",
		children: [/* @__PURE__ */ (0, s.jsx)(l, {
			label: "自定义下拉（视觉与 .ui-menu 一致）",
			code: "ui-select ui-select--custom > ui-select__trigger + ui-select__native + ui-menu",
			children: /* @__PURE__ */ (0, s.jsx)(_, {})
		}), /* @__PURE__ */ (0, s.jsx)(l, {
			label: "自定义菜单",
			code: "ui-dropdown > ui-menu > ui-menu__label / ui-menu__item / ui-menu__sep / ui-menu__shortcut",
			children: /* @__PURE__ */ (0, s.jsxs)("div", {
				className: "pb-32",
				children: [/* @__PURE__ */ (0, s.jsx)(v, {}), /* @__PURE__ */ (0, s.jsx)("p", {
					className: "m-0 mt-2 text-[11px] text-canvas-text-muted",
					children: "菜单浮层用 .ui-menu--right 右对齐、.ui-menu--up 向上展开"
				})]
			})
		})]
	});
}
function b() {
	let [e, t] = (0, o.useState)(!1);
	return /* @__PURE__ */ (0, s.jsx)(c, {
		id: "sg-dropzones",
		title: "上传区",
		desc: "拖放上传的统一样式：虚线边框、中央图标、hover/拖拽悬停时高亮。WorkflowPanel 与 PluginSettings 已统一使用 ui-dropzone。",
		children: /* @__PURE__ */ (0, s.jsx)(l, {
			code: "ui-dropzone > ui-dropzone__title / __icon / __hint（.is-dragover 高亮）",
			children: /* @__PURE__ */ (0, s.jsxs)("div", {
				className: `ui-dropzone${e ? " is-dragover" : ""}`,
				onMouseEnter: () => t(!0),
				onMouseLeave: () => t(!1),
				role: "button",
				tabIndex: 0,
				children: [
					/* @__PURE__ */ (0, s.jsx)("span", {
						className: "ui-dropzone__title",
						children: "把工作流文件拖到这里"
					}),
					/* @__PURE__ */ (0, s.jsx)("span", {
						className: "ui-dropzone__icon",
						"aria-hidden": "true",
						children: /* @__PURE__ */ (0, s.jsxs)("svg", {
							width: "22",
							height: "22",
							viewBox: "0 0 24 24",
							fill: "none",
							stroke: "currentColor",
							strokeWidth: "2",
							strokeLinecap: "round",
							strokeLinejoin: "round",
							children: [
								/* @__PURE__ */ (0, s.jsx)("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
								/* @__PURE__ */ (0, s.jsx)("polyline", { points: "17 8 12 3 7 8" }),
								/* @__PURE__ */ (0, s.jsx)("line", {
									x1: "12",
									y1: "3",
									x2: "12",
									y2: "15"
								})
							]
						})
					}),
					/* @__PURE__ */ (0, s.jsx)("span", {
						className: "ui-dropzone__hint",
						children: "支持 ComfyUI 导出的 .json 工作流文件，点击这里也可以选择。"
					})
				]
			})
		})
	});
}
function x() {
	let [e, t] = (0, o.useState)(!0), [n, r] = (0, o.useState)(!1), [i, a] = (0, o.useState)(65), [u, d] = (0, o.useState)("grid");
	return /* @__PURE__ */ (0, s.jsxs)(c, {
		id: "sg-selection",
		title: "选择控件",
		desc: "开关用 button[aria-checked]，复选框/单选保留原生 input（.ui-checkbox + label 的相邻选择器负责画框），保证键盘与读屏可用。",
		children: [
			/* @__PURE__ */ (0, s.jsx)(l, {
				label: "开关",
				code: "<button className=\"ui-switch\" aria-checked={on} />",
				children: /* @__PURE__ */ (0, s.jsxs)("div", {
					className: "ui-row ui-row--loose",
					children: [
						/* @__PURE__ */ (0, s.jsxs)("label", {
							className: "ui-row ui-row--tight",
							children: [/* @__PURE__ */ (0, s.jsx)("button", {
								type: "button",
								role: "switch",
								"aria-checked": e,
								"aria-label": "自动保存",
								className: "ui-switch",
								onClick: () => t((e) => !e)
							}), /* @__PURE__ */ (0, s.jsxs)("span", {
								className: "text-xs text-canvas-text",
								children: ["自动保存 ", e ? "开" : "关"]
							})]
						}),
						/* @__PURE__ */ (0, s.jsxs)("label", {
							className: "ui-row ui-row--tight",
							children: [/* @__PURE__ */ (0, s.jsx)("button", {
								type: "button",
								role: "switch",
								"aria-checked": n,
								"aria-label": "硬件加速",
								className: "ui-switch",
								onClick: () => r((e) => !e)
							}), /* @__PURE__ */ (0, s.jsxs)("span", {
								className: "text-xs text-canvas-text",
								children: ["硬件加速 ", n ? "开" : "关"]
							})]
						}),
						/* @__PURE__ */ (0, s.jsx)("button", {
							type: "button",
							role: "switch",
							"aria-checked": !1,
							"aria-label": "禁用开关",
							className: "ui-switch",
							disabled: !0
						})
					]
				})
			}),
			/* @__PURE__ */ (0, s.jsxs)(l, {
				label: "复选框与单选",
				code: ".ui-checkbox + label / .ui-radio + label（原生 input，靠相邻选择器绘制）",
				children: [/* @__PURE__ */ (0, s.jsxs)("div", {
					className: "ui-row ui-row--loose",
					children: [
						/* @__PURE__ */ (0, s.jsxs)("div", {
							className: "relative ui-row ui-row--tight",
							children: [/* @__PURE__ */ (0, s.jsx)("input", {
								id: "sg-cb-a",
								type: "checkbox",
								className: "ui-checkbox",
								defaultChecked: !0
							}), /* @__PURE__ */ (0, s.jsx)("label", {
								htmlFor: "sg-cb-a",
								children: "已勾选"
							})]
						}),
						/* @__PURE__ */ (0, s.jsxs)("div", {
							className: "relative ui-row ui-row--tight",
							children: [/* @__PURE__ */ (0, s.jsx)("input", {
								id: "sg-cb-b",
								type: "checkbox",
								className: "ui-checkbox"
							}), /* @__PURE__ */ (0, s.jsx)("label", {
								htmlFor: "sg-cb-b",
								children: "未勾选"
							})]
						}),
						/* @__PURE__ */ (0, s.jsxs)("div", {
							className: "relative ui-row ui-row--tight",
							children: [/* @__PURE__ */ (0, s.jsx)("input", {
								id: "sg-cb-c",
								type: "checkbox",
								className: "ui-checkbox",
								disabled: !0
							}), /* @__PURE__ */ (0, s.jsx)("label", {
								htmlFor: "sg-cb-c",
								children: "禁用"
							})]
						})
					]
				}), /* @__PURE__ */ (0, s.jsxs)("div", {
					className: "ui-row ui-row--loose",
					children: [
						/* @__PURE__ */ (0, s.jsxs)("div", {
							className: "relative ui-row ui-row--tight",
							children: [/* @__PURE__ */ (0, s.jsx)("input", {
								id: "sg-rd-a",
								type: "radio",
								name: "sg-radio",
								className: "ui-radio",
								defaultChecked: !0
							}), /* @__PURE__ */ (0, s.jsx)("label", {
								htmlFor: "sg-rd-a",
								children: "平衡"
							})]
						}),
						/* @__PURE__ */ (0, s.jsxs)("div", {
							className: "relative ui-row ui-row--tight",
							children: [/* @__PURE__ */ (0, s.jsx)("input", {
								id: "sg-rd-b",
								type: "radio",
								name: "sg-radio",
								className: "ui-radio"
							}), /* @__PURE__ */ (0, s.jsx)("label", {
								htmlFor: "sg-rd-b",
								children: "质量优先"
							})]
						}),
						/* @__PURE__ */ (0, s.jsxs)("div", {
							className: "relative ui-row ui-row--tight",
							children: [/* @__PURE__ */ (0, s.jsx)("input", {
								id: "sg-rd-c",
								type: "radio",
								name: "sg-radio",
								className: "ui-radio"
							}), /* @__PURE__ */ (0, s.jsx)("label", {
								htmlFor: "sg-rd-c",
								children: "速度优先"
							})]
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, s.jsx)(l, {
				label: "滑块",
				code: "<input type=\"range\" className=\"ui-slider\" />",
				children: /* @__PURE__ */ (0, s.jsxs)("div", {
					className: "ui-field",
					style: { maxWidth: 320 },
					children: [/* @__PURE__ */ (0, s.jsxs)("label", {
						className: "ui-label",
						htmlFor: "sg-slider",
						children: [
							"画质权重 · ",
							i,
							"%"
						]
					}), /* @__PURE__ */ (0, s.jsx)("input", {
						id: "sg-slider",
						type: "range",
						className: "ui-slider",
						min: 0,
						max: 100,
						value: i,
						onChange: (e) => a(Number(e.target.value))
					})]
				})
			}),
			/* @__PURE__ */ (0, s.jsx)(l, {
				label: "分段控件",
				code: ".ui-segmented > .ui-segmented__item（.is-active 表示选中）",
				children: /* @__PURE__ */ (0, s.jsx)("div", {
					className: "ui-segmented",
					role: "tablist",
					children: [
						{
							key: "grid",
							label: "网格"
						},
						{
							key: "list",
							label: "列表"
						},
						{
							key: "board",
							label: "看板"
						}
					].map((e) => /* @__PURE__ */ (0, s.jsx)("button", {
						type: "button",
						role: "tab",
						"aria-selected": u === e.key,
						className: `ui-segmented__item${u === e.key ? " is-active" : ""}`,
						onClick: () => d(e.key),
						children: e.label
					}, e.key))
				})
			}),
			/* @__PURE__ */ (0, s.jsx)(l, {
				label: "节点主题色分段",
				code: "ui-segmented ui-segmented--node-text | --node-image | --node-video | --node-audio | --node-panorama",
				children: /* @__PURE__ */ (0, s.jsx)("div", {
					className: "ui-segmented ui-segmented--node-text",
					role: "tablist",
					children: [
						{
							key: "text",
							label: "文本"
						},
						{
							key: "image",
							label: "图像"
						},
						{
							key: "video",
							label: "视频"
						},
						{
							key: "audio",
							label: "音频"
						}
					].map((e) => /* @__PURE__ */ (0, s.jsx)("button", {
						type: "button",
						role: "tab",
						"aria-selected": u === e.key,
						className: `ui-segmented__item${u === e.key ? " is-active" : ""}`,
						onClick: () => d(e.key),
						children: e.label
					}, e.key))
				})
			})
		]
	});
}
function S() {
	let [e, t] = (0, o.useState)("shot-02");
	return /* @__PURE__ */ (0, s.jsxs)(c, {
		id: "sg-cards",
		title: "卡片",
		desc: "卡片只负责「一块内容」的容器语义：header 放标题与操作，body 放内容，footer 放行动按钮。选中态用 .is-selected，不要改背景以免和 hover 冲突。",
		children: [
			/* @__PURE__ */ (0, s.jsx)(l, {
				label: "基础卡片",
				code: ".ui-card > .ui-card__header / __title / __body / __footer",
				children: /* @__PURE__ */ (0, s.jsxs)("div", {
					className: "ui-card",
					style: { maxWidth: 360 },
					children: [
						/* @__PURE__ */ (0, s.jsxs)("div", {
							className: "ui-card__header",
							children: [/* @__PURE__ */ (0, s.jsxs)("div", {
								className: "min-w-0",
								children: [/* @__PURE__ */ (0, s.jsx)("h3", {
									className: "ui-card__title",
									children: "分镜脚本"
								}), /* @__PURE__ */ (0, s.jsx)("p", {
									className: "ui-card__desc",
									children: "共 12 个镜头 · 最近修改 2 分钟前"
								})]
							}), /* @__PURE__ */ (0, s.jsx)("div", {
								className: "ui-card__header-actions",
								children: /* @__PURE__ */ (0, s.jsx)("button", {
									type: "button",
									className: "ui-icon-btn ui-icon-btn--sm",
									"aria-label": "更多",
									children: /* @__PURE__ */ (0, s.jsxs)("svg", {
										width: "14",
										height: "14",
										viewBox: "0 0 24 24",
										fill: "currentColor",
										"aria-hidden": "true",
										children: [
											/* @__PURE__ */ (0, s.jsx)("circle", {
												cx: "12",
												cy: "5",
												r: "1.6"
											}),
											/* @__PURE__ */ (0, s.jsx)("circle", {
												cx: "12",
												cy: "12",
												r: "1.6"
											}),
											/* @__PURE__ */ (0, s.jsx)("circle", {
												cx: "12",
												cy: "19",
												r: "1.6"
											})
										]
									})
								})
							})]
						}),
						/* @__PURE__ */ (0, s.jsx)("div", {
							className: "ui-card__body",
							children: "按镜头顺序编排画面描述、景别与运镜，生成时自动串成一条时间线。"
						}),
						/* @__PURE__ */ (0, s.jsxs)("div", {
							className: "ui-card__footer",
							children: [/* @__PURE__ */ (0, s.jsx)("span", {
								className: "ui-badge ui-badge--outline",
								children: "草稿"
							}), /* @__PURE__ */ (0, s.jsxs)("div", {
								className: "ui-card__footer-actions",
								children: [/* @__PURE__ */ (0, s.jsx)("button", {
									type: "button",
									className: "ui-btn ui-btn--ghost ui-btn--sm",
									children: "放弃"
								}), /* @__PURE__ */ (0, s.jsx)("button", {
									type: "button",
									className: "ui-btn ui-btn--primary ui-btn--sm",
									children: "继续编辑"
								})]
							})]
						})
					]
				})
			}),
			/* @__PURE__ */ (0, s.jsx)(l, {
				label: "可交互卡片与选中态",
				code: ".ui-card--interactive / .is-selected",
				children: /* @__PURE__ */ (0, s.jsx)("div", {
					className: "grid gap-3 sm:grid-cols-3",
					children: [
						{
							id: "shot-01",
							title: "开场 · 城市全景",
							desc: "无人机俯拍 · 4s",
							badge: "待生成"
						},
						{
							id: "shot-02",
							title: "特写 · 主角侧脸",
							desc: "85mm 定焦 · 3s",
							badge: "已生成"
						},
						{
							id: "shot-03",
							title: "过肩 · 对话正反打",
							desc: "双机位 · 6s",
							badge: "待生成"
						}
					].map((n) => /* @__PURE__ */ (0, s.jsxs)("button", {
						type: "button",
						"aria-pressed": e === n.id,
						className: `ui-card ui-card--interactive${e === n.id ? " is-selected" : ""}`,
						onClick: () => t(n.id),
						children: [/* @__PURE__ */ (0, s.jsxs)("div", {
							className: "ui-card__body",
							children: [/* @__PURE__ */ (0, s.jsx)("p", {
								className: "m-0 mb-1 text-xs font-medium text-canvas-text",
								children: n.title
							}), /* @__PURE__ */ (0, s.jsx)("p", {
								className: "m-0 text-[11px] text-canvas-text-muted",
								children: n.desc
							})]
						}), /* @__PURE__ */ (0, s.jsx)("div", {
							className: "ui-card__footer",
							children: /* @__PURE__ */ (0, s.jsx)("span", {
								className: `ui-badge ${n.badge === "已生成" ? "ui-badge--success" : "ui-badge--outline"}`,
								children: n.badge
							})
						})]
					}, n.id))
				})
			}),
			/* @__PURE__ */ (0, s.jsx)(l, {
				label: "指标卡",
				code: ".ui-stat > .ui-stat__value / .ui-stat__label",
				children: /* @__PURE__ */ (0, s.jsxs)("div", {
					className: "grid gap-3 sm:grid-cols-3",
					children: [
						/* @__PURE__ */ (0, s.jsxs)("div", {
							className: "ui-stat",
							children: [/* @__PURE__ */ (0, s.jsx)("span", {
								className: "ui-stat__value",
								children: "128"
							}), /* @__PURE__ */ (0, s.jsx)("span", {
								className: "ui-stat__label",
								children: "画布节点"
							})]
						}),
						/* @__PURE__ */ (0, s.jsxs)("div", {
							className: "ui-stat",
							children: [/* @__PURE__ */ (0, s.jsx)("span", {
								className: "ui-stat__value",
								children: "32.4 MB"
							}), /* @__PURE__ */ (0, s.jsx)("span", {
								className: "ui-stat__label",
								children: "项目资产"
							})]
						}),
						/* @__PURE__ */ (0, s.jsxs)("div", {
							className: "ui-stat",
							children: [/* @__PURE__ */ (0, s.jsx)("span", {
								className: "ui-stat__value",
								children: "6"
							}), /* @__PURE__ */ (0, s.jsx)("span", {
								className: "ui-stat__label",
								children: "已接入厂商"
							})]
						})
					]
				})
			})
		]
	});
}
function C() {
	let [e, t] = (0, o.useState)([
		"角色",
		"夜景",
		"雨"
	]);
	return /* @__PURE__ */ (0, s.jsxs)(c, {
		id: "sg-badges",
		title: "徽标与表格",
		desc: "徽标用圆角胶囊 + 淡底；密集列表里改用 .ui-badge--outline，避免底色抢视觉。",
		children: [
			/* @__PURE__ */ (0, s.jsx)(l, {
				label: "徽标",
				code: "ui-badge ui-badge--primary | --success | --info | --warning | --danger | --outline",
				children: /* @__PURE__ */ (0, s.jsxs)("div", {
					className: "ui-row",
					children: [
						/* @__PURE__ */ (0, s.jsx)("span", {
							className: "ui-badge ui-badge--primary",
							children: "品牌"
						}),
						/* @__PURE__ */ (0, s.jsx)("span", {
							className: "ui-badge ui-badge--success",
							children: "成功"
						}),
						/* @__PURE__ */ (0, s.jsx)("span", {
							className: "ui-badge ui-badge--info",
							children: "信息"
						}),
						/* @__PURE__ */ (0, s.jsx)("span", {
							className: "ui-badge ui-badge--warning",
							children: "警告"
						}),
						/* @__PURE__ */ (0, s.jsx)("span", {
							className: "ui-badge ui-badge--danger",
							children: "危险"
						}),
						/* @__PURE__ */ (0, s.jsx)("span", {
							className: "ui-badge",
							children: "中性"
						}),
						/* @__PURE__ */ (0, s.jsx)("span", {
							className: "ui-badge ui-badge--outline",
							children: "描边款"
						}),
						/* @__PURE__ */ (0, s.jsxs)("span", {
							className: "ui-badge ui-badge--success",
							children: [/* @__PURE__ */ (0, s.jsx)("i", { className: "ui-badge__dot" }), "运行中"]
						})
					]
				})
			}),
			/* @__PURE__ */ (0, s.jsx)(l, {
				label: "可移除标签",
				code: ".ui-tag > .ui-tag__remove",
				children: /* @__PURE__ */ (0, s.jsxs)("div", {
					className: "ui-row",
					children: [e.map((e) => /* @__PURE__ */ (0, s.jsxs)("span", {
						className: "ui-tag",
						children: [e, /* @__PURE__ */ (0, s.jsx)("button", {
							type: "button",
							className: "ui-tag__remove",
							"aria-label": `移除 ${e}`,
							onClick: () => t((t) => t.filter((t) => t !== e)),
							children: /* @__PURE__ */ (0, s.jsxs)("svg", {
								width: "9",
								height: "9",
								viewBox: "0 0 24 24",
								fill: "none",
								stroke: "currentColor",
								strokeWidth: "3",
								"aria-hidden": "true",
								children: [/* @__PURE__ */ (0, s.jsx)("line", {
									x1: "18",
									y1: "6",
									x2: "6",
									y2: "18"
								}), /* @__PURE__ */ (0, s.jsx)("line", {
									x1: "6",
									y1: "6",
									x2: "18",
									y2: "18"
								})]
							})
						})]
					}, e)), e.length === 0 ? /* @__PURE__ */ (0, s.jsx)("button", {
						type: "button",
						className: "ui-btn ui-btn--ghost ui-btn--sm",
						onClick: () => t([
							"角色",
							"夜景",
							"雨"
						]),
						children: "重置标签"
					}) : null]
				})
			}),
			/* @__PURE__ */ (0, s.jsx)(l, {
				label: "表格",
				code: ".ui-table",
				children: /* @__PURE__ */ (0, s.jsxs)("table", {
					className: "ui-table",
					children: [/* @__PURE__ */ (0, s.jsx)("thead", { children: /* @__PURE__ */ (0, s.jsxs)("tr", { children: [
						/* @__PURE__ */ (0, s.jsx)("th", { children: "连接" }),
						/* @__PURE__ */ (0, s.jsx)("th", { children: "厂商" }),
						/* @__PURE__ */ (0, s.jsx)("th", { children: "状态" }),
						/* @__PURE__ */ (0, s.jsx)("th", { children: "模型数" })
					] }) }), /* @__PURE__ */ (0, s.jsxs)("tbody", { children: [
						/* @__PURE__ */ (0, s.jsxs)("tr", { children: [
							/* @__PURE__ */ (0, s.jsx)("td", {
								className: "text-canvas-text",
								children: "主账号"
							}),
							/* @__PURE__ */ (0, s.jsx)("td", { children: "OpenAI" }),
							/* @__PURE__ */ (0, s.jsx)("td", { children: /* @__PURE__ */ (0, s.jsxs)("span", {
								className: "ui-badge ui-badge--success",
								children: [/* @__PURE__ */ (0, s.jsx)("i", { className: "ui-badge__dot" }), "可用"]
							}) }),
							/* @__PURE__ */ (0, s.jsx)("td", { children: "24" })
						] }),
						/* @__PURE__ */ (0, s.jsxs)("tr", { children: [
							/* @__PURE__ */ (0, s.jsx)("td", {
								className: "text-canvas-text",
								children: "备用"
							}),
							/* @__PURE__ */ (0, s.jsx)("td", { children: "火山方舟" }),
							/* @__PURE__ */ (0, s.jsx)("td", { children: /* @__PURE__ */ (0, s.jsxs)("span", {
								className: "ui-badge ui-badge--warning",
								children: [/* @__PURE__ */ (0, s.jsx)("i", { className: "ui-badge__dot" }), "限流"]
							}) }),
							/* @__PURE__ */ (0, s.jsx)("td", { children: "11" })
						] }),
						/* @__PURE__ */ (0, s.jsxs)("tr", { children: [
							/* @__PURE__ */ (0, s.jsx)("td", {
								className: "text-canvas-text",
								children: "本地"
							}),
							/* @__PURE__ */ (0, s.jsx)("td", { children: "ComfyUI" }),
							/* @__PURE__ */ (0, s.jsx)("td", { children: /* @__PURE__ */ (0, s.jsx)("span", {
								className: "ui-badge ui-badge--outline",
								children: "未连接"
							}) }),
							/* @__PURE__ */ (0, s.jsx)("td", { children: "0" })
						] })
					] })]
				})
			}),
			/* @__PURE__ */ (0, s.jsx)(l, {
				label: "列表",
				code: ".ui-list > .ui-list__item（--interactive 可点，.is-active 选中）",
				children: /* @__PURE__ */ (0, s.jsxs)("div", {
					className: "ui-list",
					children: [
						/* @__PURE__ */ (0, s.jsxs)("div", {
							className: "ui-list__item ui-list__item--interactive is-active",
							children: ["最近使用", /* @__PURE__ */ (0, s.jsx)("span", {
								className: "ui-list__trailing",
								children: "12"
							})]
						}),
						/* @__PURE__ */ (0, s.jsxs)("div", {
							className: "ui-list__item ui-list__item--interactive",
							children: ["我的收藏", /* @__PURE__ */ (0, s.jsx)("span", {
								className: "ui-list__trailing",
								children: "48"
							})]
						}),
						/* @__PURE__ */ (0, s.jsxs)("div", {
							className: "ui-list__item",
							children: ["回收站", /* @__PURE__ */ (0, s.jsx)("span", {
								className: "ui-list__trailing",
								children: "3"
							})]
						})
					]
				})
			})
		]
	});
}
function w() {
	return /* @__PURE__ */ (0, s.jsxs)(c, {
		id: "sg-feedback",
		title: "反馈与状态",
		desc: "提示条承载一句话结论，进度条只给「可预期等待」，空状态必须给出下一步动作。",
		children: [
			/* @__PURE__ */ (0, s.jsx)(l, {
				label: "提示条",
				code: ".ui-alert--info | --success | --warning | --danger",
				children: /* @__PURE__ */ (0, s.jsxs)("div", {
					className: "ui-stack ui-stack--tight",
					children: [
						/* @__PURE__ */ (0, s.jsxs)("div", {
							className: "ui-alert ui-alert--info",
							children: [/* @__PURE__ */ (0, s.jsx)("span", {
								className: "ui-alert__icon",
								"aria-hidden": "true",
								children: /* @__PURE__ */ (0, s.jsxs)("svg", {
									width: "14",
									height: "14",
									viewBox: "0 0 24 24",
									fill: "none",
									stroke: "currentColor",
									strokeWidth: "2",
									children: [
										/* @__PURE__ */ (0, s.jsx)("circle", {
											cx: "12",
											cy: "12",
											r: "10"
										}),
										/* @__PURE__ */ (0, s.jsx)("line", {
											x1: "12",
											y1: "16",
											x2: "12",
											y2: "12"
										}),
										/* @__PURE__ */ (0, s.jsx)("line", {
											x1: "12",
											y1: "8",
											x2: "12.01",
											y2: "8"
										})
									]
								})
							}), /* @__PURE__ */ (0, s.jsx)("div", {
								className: "ui-alert__body",
								children: "上下文已压缩，较早的对话被折叠为主题摘要。"
							})]
						}),
						/* @__PURE__ */ (0, s.jsxs)("div", {
							className: "ui-alert ui-alert--success",
							children: [/* @__PURE__ */ (0, s.jsx)("span", {
								className: "ui-alert__icon",
								"aria-hidden": "true",
								children: /* @__PURE__ */ (0, s.jsx)("svg", {
									width: "14",
									height: "14",
									viewBox: "0 0 24 24",
									fill: "none",
									stroke: "currentColor",
									strokeWidth: "2",
									children: /* @__PURE__ */ (0, s.jsx)("polyline", { points: "20 6 9 17 4 12" })
								})
							}), /* @__PURE__ */ (0, s.jsxs)("div", {
								className: "ui-alert__body",
								children: [/* @__PURE__ */ (0, s.jsx)("p", {
									className: "ui-alert__title",
									children: "项目已保存"
								}), "共 24 个节点、6 个连接写入本地。"]
							})]
						}),
						/* @__PURE__ */ (0, s.jsxs)("div", {
							className: "ui-alert ui-alert--warning",
							children: [/* @__PURE__ */ (0, s.jsx)("span", {
								className: "ui-alert__icon",
								"aria-hidden": "true",
								children: /* @__PURE__ */ (0, s.jsxs)("svg", {
									width: "14",
									height: "14",
									viewBox: "0 0 24 24",
									fill: "none",
									stroke: "currentColor",
									strokeWidth: "2",
									children: [
										/* @__PURE__ */ (0, s.jsx)("path", { d: "M10.29 3.86 1.82 18a2 2 0 0 0 1.71 3h16.94a2 2 0 0 0 1.71-3L13.71 3.86a2 2 0 0 0-3.42 0z" }),
										/* @__PURE__ */ (0, s.jsx)("line", {
											x1: "12",
											y1: "9",
											x2: "12",
											y2: "13"
										}),
										/* @__PURE__ */ (0, s.jsx)("line", {
											x1: "12",
											y1: "17",
											x2: "12.01",
											y2: "17"
										})
									]
								})
							}), /* @__PURE__ */ (0, s.jsx)("div", {
								className: "ui-alert__body",
								children: "本次生成将消耗约 12 积分，继续？"
							})]
						}),
						/* @__PURE__ */ (0, s.jsxs)("div", {
							className: "ui-alert ui-alert--danger",
							children: [/* @__PURE__ */ (0, s.jsx)("span", {
								className: "ui-alert__icon",
								"aria-hidden": "true",
								children: /* @__PURE__ */ (0, s.jsxs)("svg", {
									width: "14",
									height: "14",
									viewBox: "0 0 24 24",
									fill: "none",
									stroke: "currentColor",
									strokeWidth: "2",
									children: [
										/* @__PURE__ */ (0, s.jsx)("circle", {
											cx: "12",
											cy: "12",
											r: "10"
										}),
										/* @__PURE__ */ (0, s.jsx)("line", {
											x1: "15",
											y1: "9",
											x2: "9",
											y2: "15"
										}),
										/* @__PURE__ */ (0, s.jsx)("line", {
											x1: "9",
											y1: "9",
											x2: "15",
											y2: "15"
										})
									]
								})
							}), /* @__PURE__ */ (0, s.jsx)("div", {
								className: "ui-alert__body",
								children: "厂商连接失败：API Key 无效或已过期。"
							})]
						})
					]
				})
			}),
			/* @__PURE__ */ (0, s.jsx)(l, {
				label: "进度与加载",
				code: ".ui-progress（--success / --danger / --indeterminate）/ .ui-spinner / .ui-skeleton",
				children: /* @__PURE__ */ (0, s.jsxs)("div", {
					className: "ui-stack ui-stack--tight",
					children: [
						/* @__PURE__ */ (0, s.jsx)("div", {
							className: "ui-progress",
							children: /* @__PURE__ */ (0, s.jsx)("div", {
								className: "ui-progress__bar",
								style: { width: "65%" }
							})
						}),
						/* @__PURE__ */ (0, s.jsx)("div", {
							className: "ui-progress ui-progress--success",
							children: /* @__PURE__ */ (0, s.jsx)("div", {
								className: "ui-progress__bar",
								style: { width: "100%" }
							})
						}),
						/* @__PURE__ */ (0, s.jsx)("div", {
							className: "ui-progress ui-progress--danger",
							children: /* @__PURE__ */ (0, s.jsx)("div", {
								className: "ui-progress__bar",
								style: { width: "35%" }
							})
						}),
						/* @__PURE__ */ (0, s.jsx)("div", {
							className: "ui-progress ui-progress--indeterminate",
							children: /* @__PURE__ */ (0, s.jsx)("div", { className: "ui-progress__bar" })
						}),
						/* @__PURE__ */ (0, s.jsxs)("div", {
							className: "ui-row ui-row--loose",
							children: [/* @__PURE__ */ (0, s.jsxs)("span", {
								className: "ui-row ui-row--tight text-xs text-canvas-text-secondary",
								children: [/* @__PURE__ */ (0, s.jsx)("span", { className: "ui-spinner" }), " 加载中"]
							}), /* @__PURE__ */ (0, s.jsxs)("div", {
								className: "ui-stack ui-stack--tight",
								style: { width: 220 },
								children: [/* @__PURE__ */ (0, s.jsx)("div", {
									className: "ui-skeleton",
									style: {
										height: 10,
										width: "100%"
									}
								}), /* @__PURE__ */ (0, s.jsx)("div", {
									className: "ui-skeleton",
									style: {
										height: 10,
										width: "70%"
									}
								})]
							})]
						})
					]
				})
			}),
			/* @__PURE__ */ (0, s.jsx)(l, {
				label: "空状态",
				code: ".ui-empty > .ui-empty__icon / __title / __desc",
				children: /* @__PURE__ */ (0, s.jsxs)("div", {
					className: "ui-empty",
					children: [
						/* @__PURE__ */ (0, s.jsx)("span", {
							className: "ui-empty__icon",
							"aria-hidden": "true",
							children: /* @__PURE__ */ (0, s.jsxs)("svg", {
								width: "26",
								height: "26",
								viewBox: "0 0 24 24",
								fill: "none",
								stroke: "currentColor",
								strokeWidth: "1.5",
								children: [/* @__PURE__ */ (0, s.jsx)("rect", {
									x: "3",
									y: "4",
									width: "18",
									height: "16",
									rx: "2"
								}), /* @__PURE__ */ (0, s.jsx)("path", {
									d: "M8 10h8M8 14h5",
									strokeLinecap: "round"
								})]
							})
						}),
						/* @__PURE__ */ (0, s.jsx)("p", {
							className: "ui-empty__title",
							children: "还没有工作流"
						}),
						/* @__PURE__ */ (0, s.jsx)("p", {
							className: "ui-empty__desc",
							children: "导入 ComfyUI 工作流 JSON，或从模板新建一个。"
						}),
						/* @__PURE__ */ (0, s.jsx)("button", {
							type: "button",
							className: "ui-btn ui-btn--primary ui-btn--sm",
							children: "导入工作流"
						})
					]
				})
			})
		]
	});
}
function T() {
	return /* @__PURE__ */ (0, s.jsxs)(c, {
		id: "sg-layout",
		title: "布局辅助",
		desc: "只把跨模块反复出现的排布收进类里；业务自己的布局仍然优先用 Tailwind。",
		children: [
			/* @__PURE__ */ (0, s.jsx)(l, {
				label: "行与栈",
				code: ".ui-row（--tight / --loose / --between / --baseline）/ .ui-stack（--tight / --loose）",
				children: /* @__PURE__ */ (0, s.jsxs)("div", {
					className: "ui-stack",
					children: [
						/* @__PURE__ */ (0, s.jsxs)("div", {
							className: "ui-row",
							children: [/* @__PURE__ */ (0, s.jsx)("span", {
								className: "ui-badge",
								children: "默认 8px"
							}), /* @__PURE__ */ (0, s.jsx)("span", {
								className: "ui-badge",
								children: "默认 8px"
							})]
						}),
						/* @__PURE__ */ (0, s.jsxs)("div", {
							className: "ui-row ui-row--tight",
							children: [/* @__PURE__ */ (0, s.jsx)("span", {
								className: "ui-badge",
								children: "紧凑 4px"
							}), /* @__PURE__ */ (0, s.jsx)("span", {
								className: "ui-badge",
								children: "紧凑 4px"
							})]
						}),
						/* @__PURE__ */ (0, s.jsxs)("div", {
							className: "ui-row ui-row--between",
							children: [/* @__PURE__ */ (0, s.jsx)("span", {
								className: "text-xs text-canvas-text-secondary",
								children: "两端对齐"
							}), /* @__PURE__ */ (0, s.jsx)("span", {
								className: "ui-badge ui-badge--primary",
								children: "右侧"
							})]
						})
					]
				})
			}),
			/* @__PURE__ */ (0, s.jsxs)(l, {
				label: "分隔线",
				code: ".ui-divider / .ui-divider--vertical",
				children: [/* @__PURE__ */ (0, s.jsxs)("div", {
					className: "ui-stack ui-stack--tight",
					children: [
						/* @__PURE__ */ (0, s.jsx)("span", {
							className: "text-xs text-canvas-text-secondary",
							children: "上方内容"
						}),
						/* @__PURE__ */ (0, s.jsx)("hr", { className: "ui-divider" }),
						/* @__PURE__ */ (0, s.jsx)("span", {
							className: "text-xs text-canvas-text-secondary",
							children: "下方内容"
						})
					]
				}), /* @__PURE__ */ (0, s.jsxs)("div", {
					className: "ui-row",
					style: { height: 20 },
					children: [
						/* @__PURE__ */ (0, s.jsx)("span", {
							className: "text-xs text-canvas-text-secondary",
							children: "左"
						}),
						/* @__PURE__ */ (0, s.jsx)("span", { className: "ui-divider ui-divider--vertical" }),
						/* @__PURE__ */ (0, s.jsx)("span", {
							className: "text-xs text-canvas-text-secondary",
							children: "右"
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, s.jsx)(l, {
				label: "圆角与控件高度",
				code: "--ui-radius-sm 6 / --ui-radius-md 7 / --ui-radius 8 / --ui-radius-lg 12 / --ui-radius-xl 14；--ui-control-h 32（sm 26 / lg 40）",
				children: /* @__PURE__ */ (0, s.jsx)("div", {
					className: "ui-row ui-row--loose",
					children: [
						{
							v: "var(--ui-radius-sm)",
							label: "sm · 6px"
						},
						{
							v: "var(--ui-radius-md)",
							label: "md · 7px（输入/按钮/chip）"
						},
						{
							v: "var(--ui-radius)",
							label: "默认 · 8px"
						},
						{
							v: "var(--ui-radius-lg)",
							label: "lg · 12px"
						},
						{
							v: "var(--ui-radius-xl)",
							label: "xl · 14px（上传区/大卡片）"
						}
					].map((e) => /* @__PURE__ */ (0, s.jsxs)("div", {
						className: "ui-stack ui-stack--tight",
						style: { alignItems: "center" },
						children: [/* @__PURE__ */ (0, s.jsx)("span", {
							className: "h-10 w-10 border border-canvas-border bg-canvas-card",
							style: { borderRadius: e.v },
							"aria-hidden": "true"
						}), /* @__PURE__ */ (0, s.jsx)("span", {
							className: "text-[10px] text-canvas-text-muted",
							children: e.label
						})]
					}, e.label))
				})
			})
		]
	});
}
function E() {
	return /* @__PURE__ */ (0, s.jsxs)(s.Fragment, { children: [
		/* @__PURE__ */ (0, s.jsxs)("header", {
			className: "mb-7",
			children: [/* @__PURE__ */ (0, s.jsx)("h2", {
				className: "m-0 text-lg font-semibold text-canvas-text",
				children: "AI Canvas · UI Kit"
			}), /* @__PURE__ */ (0, s.jsxs)("p", {
				className: "m-0 mt-1 text-xs leading-relaxed text-canvas-text-secondary",
				children: [
					"全应用公用控件一览。样式定义在 ",
					/* @__PURE__ */ (0, s.jsx)("code", {
						className: "ui-code",
						children: "src/styles/ui-kit.css"
					}),
					"， 颜色与间距全部来自 ",
					/* @__PURE__ */ (0, s.jsx)("code", {
						className: "ui-code",
						children: "src/styles/base.css"
					}),
					" 的 CSS 变量。 写新界面时先来这里挑控件，不要另造一套；点击每个样例下方的类名即可复制。"
				]
			})]
		}),
		/* @__PURE__ */ (0, s.jsx)(f, {}),
		/* @__PURE__ */ (0, s.jsx)(p, {}),
		/* @__PURE__ */ (0, s.jsx)(m, {}),
		/* @__PURE__ */ (0, s.jsx)(h, {}),
		/* @__PURE__ */ (0, s.jsx)(g, {}),
		/* @__PURE__ */ (0, s.jsx)(y, {}),
		/* @__PURE__ */ (0, s.jsx)(b, {}),
		/* @__PURE__ */ (0, s.jsx)(x, {}),
		/* @__PURE__ */ (0, s.jsx)(S, {}),
		/* @__PURE__ */ (0, s.jsx)(C, {}),
		/* @__PURE__ */ (0, s.jsx)(w, {}),
		/* @__PURE__ */ (0, s.jsx)(T, {})
	] });
}
//#endregion
//#region src/components/styleGuide/StyleGuideWindow.tsx
var D = [
	{
		id: "sg-colors",
		title: "颜色令牌"
	},
	{
		id: "sg-typography",
		title: "排版"
	},
	{
		id: "sg-buttons",
		title: "按钮"
	},
	{
		id: "sg-chips",
		title: "分类胶囊"
	},
	{
		id: "sg-inputs",
		title: "输入框"
	},
	{
		id: "sg-selects",
		title: "下拉选择"
	},
	{
		id: "sg-dropzones",
		title: "上传区"
	},
	{
		id: "sg-selection",
		title: "选择控件"
	},
	{
		id: "sg-cards",
		title: "卡片"
	},
	{
		id: "sg-badges",
		title: "徽标与表格"
	},
	{
		id: "sg-feedback",
		title: "反馈与状态"
	},
	{
		id: "sg-layout",
		title: "布局辅助"
	}
];
function O(e) {
	return e && (e.canvasBackground === "off-white" || e.theme === "light") ? "light" : "dark";
}
function k() {
	let e = r(), [t, n] = (0, o.useState)("dark"), [c, l] = (0, o.useState)(D[0]?.id ?? ""), u = (0, o.useRef)(null);
	(0, o.useEffect)(() => {
		document.title = "样式预览 · UI Kit";
		let e = !1;
		return (async () => {
			try {
				let t = await a();
				if (e) return;
				let r = O(t);
				n(r), document.documentElement.setAttribute("data-theme", r), document.documentElement.toggleAttribute("data-native-cursor", t?.customCursor === !1), i(t?.language);
			} catch (e) {
				console.warn("[StyleGuideWindow] 读取配置失败，回退暗色主题:", e);
			}
		})(), () => {
			e = !0;
		};
	}, []);
	let d = (0, o.useCallback)((e) => {
		n(e), document.documentElement.setAttribute("data-theme", e);
	}, []), f = (0, o.useCallback)((e) => {
		let t = u.current, n = document.getElementById(e);
		!t || !n || (t.scrollTo({
			top: n.offsetTop - 12,
			behavior: "smooth"
		}), l(e));
	}, []), p = (0, o.useCallback)(() => {
		let e = u.current;
		if (!e) return;
		let t = e.scrollTop, n = D[0]?.id ?? "";
		for (let e of D) {
			let r = document.getElementById(e.id);
			r && r.offsetTop <= t + 96 && (n = e.id);
		}
		l(n);
	}, []), m = (0, o.useCallback)(() => {
		import("./window-WhVtX8QG.js").then((e) => e.getCurrentWindow().minimize()).catch(() => {});
	}, []), h = (0, o.useCallback)(() => {
		import("./window-WhVtX8QG.js").then((e) => e.getCurrentWindow().close()).catch(() => {});
	}, []);
	return /* @__PURE__ */ (0, s.jsxs)("div", {
		className: "fixed inset-0 flex flex-col overflow-hidden rounded-[10px] border border-canvas-border bg-canvas-bg text-canvas-text",
		children: [/* @__PURE__ */ (0, s.jsxs)("header", {
			"data-tauri-drag-region": !0,
			className: "flex h-11 shrink-0 items-center gap-3 px-3 select-none",
			children: [
				/* @__PURE__ */ (0, s.jsx)("h1", {
					className: "m-0 text-[15px] font-semibold text-canvas-text",
					children: "样式预览 · UI Kit"
				}),
				/* @__PURE__ */ (0, s.jsx)("span", {
					className: "text-[11px] text-canvas-text-muted",
					children: "公用控件与类名模板 · 点击代码块可复制"
				}),
				/* @__PURE__ */ (0, s.jsxs)("div", {
					className: "ml-auto flex items-center gap-1",
					children: [
						/* @__PURE__ */ (0, s.jsx)("button", {
							type: "button",
							className: "ui-btn ui-btn--ghost ui-btn--sm",
							onClick: () => d(t === "dark" ? "light" : "dark"),
							"data-tooltip": e("切换明暗主题，仅在本窗口生效"),
							children: t === "dark" ? "暗色" : "浅色"
						}),
						/* @__PURE__ */ (0, s.jsx)("button", {
							type: "button",
							className: "ui-icon-btn",
							onClick: m,
							"aria-label": e("最小化"),
							"data-tooltip": e("最小化"),
							children: /* @__PURE__ */ (0, s.jsx)("svg", {
								width: "10",
								height: "10",
								viewBox: "0 0 10 10",
								"aria-hidden": "true",
								children: /* @__PURE__ */ (0, s.jsx)("rect", {
									x: "0",
									y: "5",
									width: "10",
									height: "1",
									fill: "currentColor"
								})
							})
						}),
						/* @__PURE__ */ (0, s.jsx)("button", {
							type: "button",
							className: "ui-icon-btn ui-icon-btn--danger",
							onClick: h,
							"aria-label": e("关闭"),
							"data-tooltip": e("关闭"),
							children: /* @__PURE__ */ (0, s.jsxs)("svg", {
								width: "10",
								height: "10",
								viewBox: "0 0 10 10",
								"aria-hidden": "true",
								children: [/* @__PURE__ */ (0, s.jsx)("line", {
									x1: "0",
									y1: "0",
									x2: "10",
									y2: "10",
									stroke: "currentColor",
									strokeWidth: "1.2"
								}), /* @__PURE__ */ (0, s.jsx)("line", {
									x1: "10",
									y1: "0",
									x2: "0",
									y2: "10",
									stroke: "currentColor",
									strokeWidth: "1.2"
								})]
							})
						})
					]
				})
			]
		}), /* @__PURE__ */ (0, s.jsxs)("div", {
			className: "flex min-h-0 flex-1",
			children: [/* @__PURE__ */ (0, s.jsx)("nav", {
				className: "ui-scroll w-44 shrink-0 border-r border-canvas-border p-2",
				"aria-label": e("样式分区目录"),
				children: D.map((e) => /* @__PURE__ */ (0, s.jsx)("button", {
					type: "button",
					onClick: () => f(e.id),
					className: `w-full rounded-md px-2.5 py-1.5 text-left text-xs transition-colors ${c === e.id ? "bg-brand/15 text-brand-light" : "text-canvas-text-secondary hover:bg-canvas-hover hover:text-canvas-text"}`,
					children: e.title
				}, e.id))
			}), /* @__PURE__ */ (0, s.jsx)("main", {
				ref: u,
				onScroll: p,
				className: "ui-scroll relative flex-1 px-6 py-5",
				children: /* @__PURE__ */ (0, s.jsx)("div", {
					className: "mx-auto max-w-[860px]",
					children: /* @__PURE__ */ (0, s.jsx)(E, {})
				})
			})]
		})]
	});
}
//#endregion
export { k as default };
