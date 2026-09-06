import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./react-dom-BhFnNZvF.js";
import { t as r } from "./jsx-runtime-BAkIPmuO.js";
import { t as i } from "./ModalOverlay-DopvjrY3.js";
import { S as a, Tt as o, p as s } from "./useTooltipAutoPlacement-BSvTkR9V.js";
import { n as c } from "./rasterImageDimensions-CX1VK2cM.js";
//#region src/components/HelpMentionDemo.tsx
var l = n(), u = /* @__PURE__ */ e(t(), 1), d = r(), f = "夜色中的机械猫，霓虹反光", p = [{
	id: "nodes",
	label: "工作流节点"
}], m = [
	"在提示词框里输入 @，列出当前工作流的输入节点。",
	"选中要写入的输入节点（这里是正向提示词节点 #6）。",
	"提示词写进 @ 出来的节点里，调用时才会送到 ComfyUI 对应输入。"
];
function h() {
	return typeof window < "u" && window.matchMedia("(prefers-reduced-motion: reduce)").matches;
}
function g() {
	let e = (0, u.useRef)(null), t = (0, u.useRef)(null), [n, r] = (0, u.useState)(0), [i, o] = (0, u.useState)(() => h() ? "wf:6" : void 0), [l, g] = (0, u.useState)(() => h() ? m.length - 1 : 0), _ = (0, u.useCallback)(() => r((e) => e + 1), []);
	return (0, u.useEffect)(() => {
		let e = t.current;
		if (!e) return;
		let n = s("6", "正向提示词", "prompt"), r = n.querySelector(".prompt-chip-wf-value");
		r && (r.contentEditable = "false", r.textContent = f), e.replaceChildren(n);
	}, []), (0, u.useEffect)(() => {
		let n = e.current;
		if (!n) return;
		let r = n.querySelector("[data-demo-query]"), i = n.querySelector("[data-demo-picker]"), a = t.current, s = n.querySelector("[data-demo-caret]"), c = n.querySelector("[data-demo-result]");
		if (!r || !i || !a || !s || !c) return;
		if (h()) {
			r.style.display = "none", i.style.opacity = "0", c.style.opacity = "1";
			return;
		}
		let l = !1, u;
		return import("./gsap-C1ZKf3Iq.js").then((e) => e.n).then(({ gsap: t }) => {
			l || !e.current || (u = t.context(() => {
				let e = t.timeline();
				t.set(s, { opacity: 1 }), t.to(s, {
					opacity: .15,
					duration: .5,
					repeat: -1,
					yoyo: !0,
					ease: "steps(1)"
				}), e.set(r, {
					display: "inline",
					clipPath: "inset(0 100% 0 0)"
				}).set(a, { display: "none" }).set(i, {
					opacity: 0,
					y: 8,
					scale: .98,
					transformOrigin: "top center"
				}).set(c, {
					opacity: 0,
					y: 8
				}).call(() => {
					g(0), o(void 0);
				}).to(r, {
					clipPath: "inset(0 0% 0 0)",
					duration: .45,
					ease: "steps(4)"
				}).to(i, {
					opacity: 1,
					y: 0,
					scale: 1,
					duration: .3,
					ease: "power3.out"
				}).call(() => {
					g(1), o("wf:6");
				}).to({}, { duration: .7 }).to(i, {
					opacity: 0,
					y: 6,
					scale: .98,
					duration: .22,
					ease: "power2.in"
				}).set(r, { display: "none" }).set(a, { display: "inline" }).fromTo(a, {
					opacity: 0,
					scale: .86
				}, {
					opacity: 1,
					scale: 1,
					duration: .32,
					ease: "back.out(2)"
				}).call(() => g(2)).to(c, {
					opacity: 1,
					y: 0,
					duration: .3,
					ease: "power3.out"
				}, "<0.05");
			}, n));
		}), () => {
			l = !0, u?.revert();
		};
	}, [n]), /* @__PURE__ */ (0, d.jsxs)("section", {
		ref: e,
		"aria-label": "@ 工作流节点操作演示",
		className: "help-dialog__demo relative mt-4 overflow-hidden rounded-lg border border-canvas-border bg-canvas-bg/60 px-3 py-3",
		children: [
			/* @__PURE__ */ (0, d.jsx)("div", {
				className: "pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(var(--separator-color)_1px,transparent_1px)] [background-size:12px_12px]",
				"aria-hidden": "true"
			}),
			/* @__PURE__ */ (0, d.jsxs)("div", {
				className: "relative mb-3 flex items-center justify-between gap-3",
				children: [/* @__PURE__ */ (0, d.jsx)("span", {
					className: "text-[11px] font-medium text-canvas-text-secondary",
					children: "@ 节点演示"
				}), /* @__PURE__ */ (0, d.jsx)("button", {
					type: "button",
					"aria-label": "重新播放 @ 节点演示",
					"data-tooltip": "重新播放",
					onClick: _,
					className: "flex h-7 w-7 items-center justify-center rounded-lg text-canvas-text-muted transition-colors hover:bg-canvas-hover hover:text-canvas-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
					children: /* @__PURE__ */ (0, d.jsx)(c, {
						icon: "lucide:rotate-ccw",
						width: "14",
						height: "14",
						"aria-hidden": "true"
					})
				})]
			}),
			/* @__PURE__ */ (0, d.jsxs)("div", {
				className: "relative flex flex-col gap-2 pt-[168px]",
				children: [/* @__PURE__ */ (0, d.jsxs)("div", {
					className: "pointer-events-none absolute inset-x-0 top-0 flex h-[160px] justify-center",
					children: [/* @__PURE__ */ (0, d.jsx)("div", {
						"data-demo-picker": !0,
						className: "pointer-events-auto w-full max-w-[280px] self-end",
						children: /* @__PURE__ */ (0, d.jsx)(a, {
							ariaLabel: "工作流输入节点",
							tabs: p,
							activeTab: "nodes",
							onTabChange: () => {},
							activeKey: i,
							items: [{
								key: "wf:6",
								label: "正向提示词",
								icon: "mdi:text-box-outline",
								badge: "工作流",
								onSelect: _
							}, {
								key: "wf:12",
								label: "参考图输入",
								icon: "mdi:image-outline",
								badge: "工作流",
								onSelect: _
							}]
						})
					}), /* @__PURE__ */ (0, d.jsxs)("div", {
						"data-demo-result": !0,
						className: "absolute inset-0 flex flex-col items-center justify-center gap-1.5 px-4 text-center",
						children: [/* @__PURE__ */ (0, d.jsxs)("span", {
							className: "flex items-center gap-1.5 text-xs font-medium text-emerald-400",
							children: [/* @__PURE__ */ (0, d.jsx)(c, {
								icon: "lucide:check-circle-2",
								width: "15",
								height: "15",
								"aria-hidden": "true"
							}), "提示词已写入 #6 正向提示词节点"]
						}), /* @__PURE__ */ (0, d.jsx)("span", {
							className: "text-[11px] leading-5 text-canvas-text-secondary",
							children: "在“工作流管理”里点节点徽章把它设为 ★ 默认节点，下次不 @ 也会自动注入。"
						})]
					})]
				}), /* @__PURE__ */ (0, d.jsxs)("div", {
					className: "min-h-11 rounded-xl border border-canvas-border bg-canvas-card px-3 py-2 text-[13px] leading-6 text-canvas-text",
					children: [
						/* @__PURE__ */ (0, d.jsx)("span", {
							"data-demo-query": !0,
							className: "text-canvas-text-secondary",
							children: "@正向"
						}),
						/* @__PURE__ */ (0, d.jsx)("span", {
							"data-demo-chip": !0,
							ref: t
						}),
						/* @__PURE__ */ (0, d.jsx)("span", {
							"data-demo-caret": !0,
							"aria-hidden": "true",
							className: "ml-px inline-block h-3.5 w-px translate-y-0.5 bg-indigo-400"
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, d.jsx)("p", {
				className: "relative mt-3 text-pretty text-[11px] leading-5 text-canvas-text-secondary",
				children: m[l]
			})
		]
	});
}
//#endregion
//#region src/components/HelpCenterDialog.tsx
var _ = [
	{
		id: "getting-started",
		label: "快速开始",
		icon: "mdi:rocket-launch-outline",
		summary: "从创建节点到获得第一份结果",
		items: [
			{
				title: "创建内容节点",
				description: "点击左侧加号选择文本、图像、视频、音频、全景、动画或 3D 导演台节点。也可以直接按数字键 1-7 快速创建对应节点。"
			},
			{
				title: "补充输入与模型",
				description: "选中节点后填写提示词、选择模型，并按需要添加参考素材。模型不可用时，先到“设置 > API Key”完成对应服务配置。"
			},
			{
				title: "生成并继续编排",
				description: "在节点中发起生成。结果会保留在当前项目中，可继续连接到下游节点，也可在左侧“输出历史”中回看。"
			}
		]
	},
	{
		id: "canvas",
		label: "画布导航",
		icon: "mdi:cursor-move",
		summary: "选择、平移、缩放与快速定位",
		items: [
			{
				title: "选择与多选",
				description: "点击节点进行选择；按住 Shift 点击可追加选择。框选手势会跟随“设置 > 常规”中的画布交互模式。",
				shortcut: "Shift + 点击"
			},
			{
				title: "平移与缩放",
				description: "Figma 模式使用右键或中键拖动画布、滚轮缩放；经典模式使用左键拖动画布、Ctrl + 滚轮缩放。触控板可直接使用双指手势。"
			},
			{
				title: "找回画布内容",
				description: "按 F 将全部内容适配到当前视野；按 M 显示或隐藏小地图。画布右下角的缩放控件可精确调整比例。",
				shortcut: "F / M"
			},
			{
				title: "使用画布右键菜单",
				description: "在画布空白处右键可创建生成节点或源节点，也可粘贴、撤销、重做和打开项目文件夹；存在选中内容时还可复制节点文件或删除所选内容。",
				shortcut: "右键画布空白处"
			}
		]
	},
	{
		id: "nodes",
		label: "节点与连线",
		icon: "mdi:vector-polyline",
		summary: "组织节点、建立数据流与批量编辑",
		items: [
			{
				title: "移动与编辑节点",
				description: "拖动节点标题区域调整位置。单独选中一个节点后按 Space，可直接打开该节点的提示词对话框，集中调整提示词、参数和参考内容。",
				shortcut: "选中节点 + Space"
			},
			{
				title: "自定义节点工具栏",
				description: "单独选中节点后，长按节点上方的浮动工具栏可进入工具栏编辑状态；可添加、移除或拖拽排序按钮，完成后会保存当前布局。",
				shortcut: "长按节点上方工具栏"
			},
			{
				title: "连接上下游",
				description: "从节点的输出连接点拖向另一个节点的输入连接点。把连线释放到画布空白处时，可从菜单中创建后续节点。"
			},
			{
				title: "批量整理",
				description: "多选节点后可使用浮动工具栏对齐、分布或分组。Ctrl + G 用于分组或取消分组，误操作可用 Ctrl + Z 撤销。",
				shortcut: "Ctrl/⌘ + G"
			},
			{
				title: "快速复制与节点菜单",
				description: "按住 Ctrl/⌘ 拖动非分组节点，会在原位置留下一个副本。右键节点可复制、剪切、创建副本、另存为或打开文件位置，媒体节点还会按类型提供角色库和外部编辑器入口。",
				shortcut: "Ctrl/⌘ + 拖动节点"
			}
		]
	},
	{
		id: "shortcuts",
		label: "快捷操作",
		icon: "mdi:keyboard-outline",
		summary: "少点几次鼠标，更快完成高频编辑",
		items: [
			{
				title: "快速打开提示词",
				description: "先单独选中一个普通内容节点，再按 Space 打开提示词对话框。正在输入文字、多选节点、分组节点或 Markdown 节点时不会触发。",
				shortcut: "选中节点 + Space"
			},
			{
				title: "锁定节点缩放比例",
				description: "拖动节点右下角的尺寸控制点时按住 Shift，宽高会按当前比例一起变化；拖拽过程中也可以随时按下或松开 Shift 切换。",
				shortcut: "拖拽缩放 + Shift"
			},
			{
				title: "在鼠标位置创建节点",
				description: "按 1-7 创建文本、图像、视频、音频、全景、动画和 3D 导演台节点；按 Alt + 1-5 创建文本、图像、视频、音频和 Markdown 源节点。",
				shortcut: "1-7 / Alt + 1-5"
			},
			{
				title: "复制、粘贴与删除",
				description: "Ctrl/⌘ + C 和 Ctrl/⌘ + V 用于复制、粘贴选中节点；未复制节点时，直接粘贴外部图片或文件会将内容导入画布。Delete 或 Backspace 删除当前选择。",
				shortcut: "Ctrl/⌘ + C / V"
			},
			{
				title: "保存、撤销与重做",
				description: "Ctrl/⌘ + S 保存当前项目；Ctrl/⌘ + Z 撤销；Ctrl/⌘ + Y 或 Ctrl/⌘ + Shift + Z 重做。快捷键在输入框内会优先保留文字编辑行为。",
				shortcut: "Ctrl/⌘ + S / Z / Y"
			},
			{
				title: "定位与资源搜索",
				description: "F 适配全部画布内容，M 切换小地图，Esc 关闭当前弹窗或菜单。Alt + Space 或 Ctrl + Shift + Space 可打开资源搜索窗口。",
				shortcut: "F / M / Esc"
			}
		]
	},
	{
		id: "generation",
		label: "AI 生成",
		icon: "mdi:creation-outline",
		summary: "配置模型、引用素材与处理生成结果",
		items: [
			{
				title: "配置服务",
				description: "在“设置 > API Key”中添加模型服务和密钥。ComfyUI 用户还需在对应设置页配置服务地址或安装目录。"
			},
			{
				title: "选择正确的输入",
				description: "不同媒体节点会显示各自支持的参数。参考图、首尾帧或音频素材可通过节点连接或节点内的素材入口补充。"
			},
			{
				title: "批量生成图片",
				description: "图片节点使用支持批量的普通模型且未选择工作流时，填写提示词后长按生成按钮，可选择一次生成 2-8 张；费用可能按实际张数计算。",
				shortcut: "长按图片生成按钮"
			},
			{
				title: "使用 ComfyUI 工作流",
				description: "先在“设置 > ComfyUI”配置服务并进入工作流管理，导入工作流 JSON、确认分类和输入节点。保存后可在对应生成节点的模型选择器中直接选择。"
			},
			{
				title: "ComfyUI 调用要指定输入节点",
				description: "未设置默认节点时，ComfyUI 调用需要在提示词中 @ 对应节点，提示词或参考图才会写入该输入。在工作流管理里展开工作流卡片、点击节点徽章设为该类型默认节点（显示为 ★），之后调用会自动注入，无须每次 @。",
				shortcut: "@节点 / ★ 默认节点"
			},
			{
				title: "留意付费操作",
				description: "通过画布助手生成图片、视频或音频时，本轮应显式 @ 对应模型；B 协作模式会在实际调用前确认，C 自主模式和 MCP 控制会直接执行。"
			}
		]
	},
	{
		id: "commands",
		label: "快捷指令与 Skill",
		icon: "mdi:lightning-bolt-outline",
		summary: "复用提示词、串联步骤并加载只读能力",
		items: [
			{
				title: "打开 / 指令菜单",
				description: "在生成节点的提示词输入框中键入 /，或点击输入框下方的 / 按钮，可打开内置指令、自定义快捷指令和 Skill 菜单。",
				shortcut: "输入 /"
			},
			{
				title: "调用内置快捷指令",
				description: "内置指令会按当前节点类型提供可用模板；选择后可能直接发起生成，也可能先展开子菜单或把内容填入提示词供你继续修改。"
			},
			{
				title: "创建自己的快捷指令",
				description: "在 / 菜单中进入“管理快捷指令”，可设置名称、模板、触发方式、模型和图片尺寸；高级模式还能定义参数与多步骤生成序列，任一步失败都会停止后续执行。"
			},
			{
				title: "上传并引用 Skill",
				description: "可从 / 菜单上传 Skill 文件或文件夹，并在提示词中引用可调用的 Skill。Skill 内容只用于补充生成上下文，不能修改应用权限或确认规则。"
			}
		]
	},
	{
		id: "projects",
		label: "项目与文件",
		icon: "mdi:folder-outline",
		summary: "切换项目、导入素材与管理产出",
		items: [
			{
				title: "管理项目",
				description: "点击左上角项目入口可新建、切换或删除项目。每个项目拥有独立的画布、对话、任务、资产和记忆。"
			},
			{
				title: "导入本地素材",
				description: "从左侧加号选择“上传文件”，或将支持的文件拖入画布。素材会按类型创建为可继续连接和编辑的节点。"
			},
			{
				title: "查找历史内容",
				description: "“资产”用于浏览项目素材，“输出历史”用于回看生成结果。文件保存位置和外部程序路径可在设置中管理。"
			}
		]
	},
	{
		id: "assets",
		label: "资产与角色",
		icon: "mdi:image-multiple-outline",
		summary: "搜索、复用并沉淀项目中的视觉资产",
		items: [
			{
				title: "复用项目与全局资产",
				description: "“资产”面板可切换项目文件和全局资产，按名称、类型或标签筛选。将可拖拽的卡片拖回画布，会按媒体类型创建对应节点。"
			},
			{
				title: "整理短剧资产",
				description: "短剧资产用于集中管理人物、场景和关键道具的简介与绑定图片，便于后续在提示词和生成流程中重复引用。"
			},
			{
				title: "建立角色多图参考",
				description: "可新建角色，或从图片节点右键选择“添加到角色库”。角色支持项目与全局两种范围，并可继续从画布补充多张视角参考图。"
			},
			{
				title: "回看并定位生成结果",
				description: "“输出历史”会保留文本和媒体生成记录，可复制文本、线上地址或本地路径，也可回到对应画布节点；删除历史只应在确认不再需要记录后进行。"
			},
			{
				title: "跨范围搜索资产",
				description: "按 Alt + Space 或 Ctrl + Shift + Space 打开资源搜索，可聚合查询项目文件、全局资产和已添加的外部文件夹，并将结果拖入画布。",
				shortcut: "Alt + Space"
			}
		]
	},
	{
		id: "assistant",
		label: "画布助手",
		icon: "mdi:message-processing-outline",
		summary: "用自然语言查询、配置并执行项目任务",
		items: [
			{
				title: "理解项目与画布",
				description: "查询当前项目、画布结构、节点、连线、可用模型、工作流、对话和任务状态；需要时还可发起独立的只读专家复核。"
			},
			{
				title: "编辑画布内容",
				description: "选择、新建和批量更新节点，建立连线、组合或删除节点，并可撤销或重做画布操作。创建节点与实际调用生成模型是两个独立步骤。"
			},
			{
				title: "生成媒体内容",
				description: "生成图片、视频、音乐或语音，并把结果交付到对话或画布。B 协作模式每次实际调用都需要确认；C 自主模式和 MCP 控制直接执行，且不会自动重试付费调用。"
			},
			{
				title: "管理快捷指令",
				description: "查询和读取已有快捷指令，按你的要求创建或修改快捷指令，也可填写参数并分步执行其中的文本、图片、视频或音频流程。"
			},
			{
				title: "根据接口文档补全 API 配置",
				description: "读取你明确提供的 HTTPS 厂商接口文档，整理模型、请求、响应和轮询配置，生成草稿并在你确认后保存到“API Key”设置；真实 API Key 仍由你本人填写。"
			},
			{
				title: "联网查找资料",
				description: "搜索最新网络资料、读取公开网页并继续浏览相关链接，在回答中保留可追溯来源。网页内容只作为不可信资料读取，不能改变助手权限。"
			},
			{
				title: "处理授权文件",
				description: "列出并读取你为当前对话授权的 UTF-8 文本文件，将内容导入画布源节点，或通过原生保存对话框写出文本文件；助手不会看到本地绝对路径。"
			},
			{
				title: "建立项目记忆",
				description: "根据对话提议保存简短的项目约定、偏好或事实，供后续会话使用。B 协作模式需要确认；C 自主模式和 MCP 控制直接写入。"
			},
			{
				title: "引用对象并控制任务",
				description: "可在输入中 @ 节点、模型、声音或资产来减少歧义。任务步骤会显示在时间线中，可暂停、继续或取消；B 模式对写操作保留确认，C 模式自动执行全部已注册工具。"
			}
		]
	},
	{
		id: "maintenance",
		label: "设置与维护",
		icon: "mdi:tune-variant",
		summary: "配置操作环境、桌面集成与本地存储",
		items: [
			{
				title: "调整外观与操作习惯",
				description: "在“设置 > 常规”中切换画布背景、交互方式、玻璃外框和侧边栏显示方式；完整按键说明可在“设置 > 快捷键”中查看。"
			},
			{
				title: "配置文件与外部应用",
				description: "“设置 > 文件与应用”可选择文件保存根目录，并配置 Photoshop、剪映专业版和 Premiere Pro。配置后，本地媒体节点的右键菜单会显示相应入口。"
			},
			{
				title: "检查存储健康",
				description: "“设置 > 存储健康”可扫描空间占用、回收站残留、孤儿文件、重复文件和离线文件夹。清理前应先核对列表，避免删除仍需保留的本地素材。"
			},
			{
				title: "使用 MCP 本地控制",
				description: "桌面端可在“设置 > MCP 控制”开启本地控制会话，并把配置片段粘贴到 Claude Desktop / Cursor 等客户端。MCP 可无须应用内确认地执行当前已注册且可用的全部工具；参数校验、项目与画布 revision 校验、文件路径授权、审计、取消和撤销边界仍然生效。"
			}
		]
	}
], v = {
	"getting-started": {
		caption: "创建节点，补充模型与输入，然后获得第一份生成结果。",
		steps: [
			{
				icon: "lucide:plus",
				label: "创建节点",
				tone: "border-indigo-400/25 bg-indigo-500/10 text-indigo-400"
			},
			{
				icon: "lucide:settings-2",
				label: "选择模型",
				tone: "border-blue-400/25 bg-blue-500/10 text-blue-400"
			},
			{
				icon: "lucide:sparkles",
				label: "生成结果",
				tone: "border-emerald-400/25 bg-emerald-500/10 text-emerald-400"
			}
		]
	},
	canvas: {
		caption: "先选中内容，再平移或缩放画布，最后快速适配全部节点。",
		steps: [
			{
				icon: "lucide:mouse-pointer-2",
				label: "选择内容",
				tone: "border-indigo-400/25 bg-indigo-500/10 text-indigo-400"
			},
			{
				icon: "lucide:move",
				label: "平移缩放",
				tone: "border-cyan-400/25 bg-cyan-500/10 text-cyan-400"
			},
			{
				icon: "lucide:scan",
				label: "适配视野",
				tone: "border-emerald-400/25 bg-emerald-500/10 text-emerald-400"
			}
		]
	},
	nodes: {
		caption: "选中节点后按 Space，可直接进入提示词与参数编辑。",
		steps: [
			{
				icon: "lucide:box-select",
				label: "选中节点",
				tone: "border-blue-400/25 bg-blue-500/10 text-blue-400"
			},
			{
				icon: "lucide:keyboard",
				label: "按 Space",
				tone: "border-amber-400/25 bg-amber-500/10 text-amber-400"
			},
			{
				icon: "lucide:panel-top-open",
				label: "打开编辑",
				tone: "border-indigo-400/25 bg-indigo-500/10 text-indigo-400"
			}
		]
	},
	shortcuts: {
		caption: "拖动节点尺寸时按住 Shift，可随时切换为等比缩放。",
		steps: [
			{
				icon: "lucide:move-diagonal-2",
				label: "拖动尺寸",
				tone: "border-blue-400/25 bg-blue-500/10 text-blue-400"
			},
			{
				icon: "lucide:arrow-up",
				label: "按住 Shift",
				tone: "border-amber-400/25 bg-amber-500/10 text-amber-400"
			},
			{
				icon: "lucide:proportions",
				label: "锁定比例",
				tone: "border-emerald-400/25 bg-emerald-500/10 text-emerald-400"
			}
		]
	},
	generation: {
		caption: "在画布助手中明确引用模型，确认调用后再生成媒体内容。",
		steps: [
			{
				icon: "lucide:at-sign",
				label: "引用模型",
				tone: "border-indigo-400/25 bg-indigo-500/10 text-indigo-400"
			},
			{
				icon: "lucide:badge-check",
				label: "确认调用",
				tone: "border-amber-400/25 bg-amber-500/10 text-amber-400"
			},
			{
				icon: "lucide:image",
				label: "生成内容",
				tone: "border-emerald-400/25 bg-emerald-500/10 text-emerald-400"
			}
		]
	},
	commands: {
		caption: "打开 / 菜单，选择快捷指令或 Skill，再决定直接执行或继续编辑。",
		steps: [
			{
				icon: "lucide:slash",
				label: "打开菜单",
				tone: "border-indigo-400/25 bg-indigo-500/10 text-indigo-400"
			},
			{
				icon: "lucide:library-big",
				label: "选择能力",
				tone: "border-amber-400/25 bg-amber-500/10 text-amber-400"
			},
			{
				icon: "lucide:play",
				label: "填入或执行",
				tone: "border-emerald-400/25 bg-emerald-500/10 text-emerald-400"
			}
		]
	},
	projects: {
		caption: "项目、导入素材与资产历史保持在同一个独立工作空间中。",
		steps: [
			{
				icon: "lucide:folder-plus",
				label: "新建项目",
				tone: "border-indigo-400/25 bg-indigo-500/10 text-indigo-400"
			},
			{
				icon: "lucide:file-up",
				label: "导入素材",
				tone: "border-blue-400/25 bg-blue-500/10 text-blue-400"
			},
			{
				icon: "lucide:archive",
				label: "管理资产",
				tone: "border-emerald-400/25 bg-emerald-500/10 text-emerald-400"
			}
		]
	},
	assets: {
		caption: "搜索现有资产，选择合适版本，再拖入画布或沉淀为角色参考。",
		steps: [
			{
				icon: "lucide:search",
				label: "搜索筛选",
				tone: "border-indigo-400/25 bg-indigo-500/10 text-indigo-400"
			},
			{
				icon: "lucide:images",
				label: "选择资产",
				tone: "border-blue-400/25 bg-blue-500/10 text-blue-400"
			},
			{
				icon: "lucide:panel-top-open",
				label: "拖入画布",
				tone: "border-emerald-400/25 bg-emerald-500/10 text-emerald-400"
			}
		]
	},
	assistant: {
		caption: "描述任务并确认执行计划，助手会把每一步结果写回正确项目。",
		steps: [
			{
				icon: "lucide:message-square",
				label: "描述任务",
				tone: "border-blue-400/25 bg-blue-500/10 text-blue-400"
			},
			{
				icon: "lucide:list-checks",
				label: "确认计划",
				tone: "border-amber-400/25 bg-amber-500/10 text-amber-400"
			},
			{
				icon: "lucide:workflow",
				label: "执行画布",
				tone: "border-emerald-400/25 bg-emerald-500/10 text-emerald-400"
			}
		]
	},
	maintenance: {
		caption: "先完成环境配置，再扫描存储状态，按需连接桌面与外部工具。",
		steps: [
			{
				icon: "lucide:settings-2",
				label: "配置环境",
				tone: "border-indigo-400/25 bg-indigo-500/10 text-indigo-400"
			},
			{
				icon: "lucide:scan-search",
				label: "扫描存储",
				tone: "border-amber-400/25 bg-amber-500/10 text-amber-400"
			},
			{
				icon: "lucide:plug-zap",
				label: "连接工具",
				tone: "border-emerald-400/25 bg-emerald-500/10 text-emerald-400"
			}
		]
	}
};
function y({ categoryId: e }) {
	let t = (0, u.useRef)(null), [n, r] = (0, u.useState)(0), i = v[e];
	return (0, u.useEffect)(() => {
		let e = t.current;
		if (!e || window.matchMedia("(prefers-reduced-motion: reduce)").matches) return;
		let n = !1, r;
		return import("./gsap-C1ZKf3Iq.js").then((e) => e.n).then(({ gsap: i }) => {
			n || !t.current || (r = i.context(() => {
				let t = i.utils.toArray("[data-help-demo-step]"), n = i.utils.toArray("[data-help-demo-connector]"), r = e.querySelector("[data-help-demo-caption]");
				i.set(t, {
					opacity: .35,
					transform: "translateY(4px) scale(0.96)"
				}), i.set(n, {
					opacity: .35,
					transform: "scaleX(0)",
					transformOrigin: "left center"
				}), r && i.set(r, {
					opacity: 0,
					transform: "translateY(4px)"
				});
				let a = i.timeline();
				t.forEach((e, t) => {
					a.to(e, {
						opacity: 1,
						transform: "translateY(0) scale(1)",
						duration: .28,
						ease: "power3.out"
					}, t === 0 ? 0 : ">+0.06");
					let r = n[t];
					r && a.to(r, {
						opacity: 1,
						transform: "scaleX(1)",
						duration: .32,
						ease: "power2.inOut"
					}, ">-0.04");
				}), r && a.to(r, {
					opacity: 1,
					transform: "translateY(0)",
					duration: .24,
					ease: "power3.out"
				}, ">-0.05");
			}, e));
		}), () => {
			n = !0, r?.revert();
		};
	}, [e, n]), /* @__PURE__ */ (0, d.jsxs)("section", {
		ref: t,
		"aria-label": `${i.caption} 操作演示`,
		className: "help-dialog__demo relative mb-5 overflow-hidden rounded-lg border border-canvas-border bg-canvas-bg/60 px-3 py-3",
		children: [
			/* @__PURE__ */ (0, d.jsx)("div", {
				className: "pointer-events-none absolute inset-0 opacity-30 [background-image:radial-gradient(var(--separator-color)_1px,transparent_1px)] [background-size:12px_12px]",
				"aria-hidden": "true"
			}),
			/* @__PURE__ */ (0, d.jsxs)("div", {
				className: "relative mb-3 flex items-center justify-between gap-3",
				children: [/* @__PURE__ */ (0, d.jsx)("span", {
					className: "text-[11px] font-medium text-canvas-text-secondary",
					children: "操作演示"
				}), /* @__PURE__ */ (0, d.jsx)("button", {
					type: "button",
					"aria-label": "重新播放操作演示",
					"data-tooltip": "重新播放",
					onClick: () => r((e) => e + 1),
					className: "flex h-7 w-7 items-center justify-center rounded-lg text-canvas-text-muted transition-colors hover:bg-canvas-hover hover:text-canvas-text focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50",
					children: /* @__PURE__ */ (0, d.jsx)(c, {
						icon: "lucide:rotate-ccw",
						width: "14",
						height: "14",
						"aria-hidden": "true"
					})
				})]
			}),
			/* @__PURE__ */ (0, d.jsx)("div", {
				className: "relative flex min-h-14 items-center",
				children: i.steps.map((e, t) => /* @__PURE__ */ (0, d.jsxs)("div", {
					className: "contents",
					children: [/* @__PURE__ */ (0, d.jsxs)("div", {
						"data-help-demo-step": !0,
						className: `flex h-14 min-w-0 flex-1 flex-col items-center justify-center gap-1.5 rounded-lg border px-1.5 ${e.tone}`,
						children: [/* @__PURE__ */ (0, d.jsx)(c, {
							icon: e.icon,
							width: "17",
							height: "17",
							"aria-hidden": "true"
						}), /* @__PURE__ */ (0, d.jsx)("span", {
							className: "max-w-full truncate text-[10px] font-medium text-canvas-text-secondary",
							children: e.label
						})]
					}), t < i.steps.length - 1 ? /* @__PURE__ */ (0, d.jsx)("div", {
						"data-help-demo-connector": !0,
						className: "mx-2 h-px min-w-3 flex-[0.35] bg-[var(--separator-color)]",
						"aria-hidden": "true"
					}) : null]
				}, e.label))
			}),
			/* @__PURE__ */ (0, d.jsx)("p", {
				"data-help-demo-caption": !0,
				className: "relative mt-3 text-pretty text-[11px] leading-5 text-canvas-text-secondary",
				children: i.caption
			})
		]
	});
}
function b({ onClose: e }) {
	let [t, n] = (0, u.useState)("getting-started"), r = _.find(({ id: e }) => e === t) ?? _[0];
	return /* @__PURE__ */ (0, d.jsx)(d.Fragment, { children: (0, l.createPortal)(/* @__PURE__ */ (0, d.jsx)(i, {
		isOpen: !0,
		onClose: e,
		ariaLabel: "AI Canvas 使用帮助",
		className: "help-dialog h-[min(620px,calc(100vh-24px))] w-[min(760px,calc(100vw-24px))]",
		children: /* @__PURE__ */ (0, d.jsxs)("div", {
			className: "flex min-h-0 flex-1 flex-col",
			children: [/* @__PURE__ */ (0, d.jsxs)("header", {
				className: "help-dialog__header flex shrink-0 items-center justify-between border-b border-canvas-border px-4 py-3",
				children: [/* @__PURE__ */ (0, d.jsxs)("div", {
					className: "flex min-w-0 items-center gap-3",
					children: [/* @__PURE__ */ (0, d.jsx)("div", {
						className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/15 text-indigo-400",
						children: /* @__PURE__ */ (0, d.jsx)(c, {
							icon: "mdi:book-open-page-variant-outline",
							width: "20",
							height: "20",
							"aria-hidden": "true"
						})
					}), /* @__PURE__ */ (0, d.jsxs)("div", {
						className: "min-w-0",
						children: [/* @__PURE__ */ (0, d.jsx)("h2", {
							className: "text-sm font-semibold text-canvas-text",
							children: "使用帮助"
						}), /* @__PURE__ */ (0, d.jsx)("p", {
							className: "mt-0.5 truncate text-xs text-canvas-text-secondary",
							children: "按场景查找常用操作和注意事项"
						})]
					})]
				}), /* @__PURE__ */ (0, d.jsx)(o, {
					ariaLabel: "关闭帮助",
					onClick: () => e()
				})]
			}), /* @__PURE__ */ (0, d.jsxs)("div", {
				className: "flex min-h-0 flex-1 flex-col sm:flex-row",
				children: [/* @__PURE__ */ (0, d.jsx)("nav", {
					"aria-label": "帮助分类",
					className: "help-dialog__nav flex shrink-0 gap-1 overflow-x-auto border-b border-canvas-border p-2 sm:w-48 sm:flex-col sm:overflow-y-auto sm:border-b-0 sm:border-r sm:p-3",
					children: _.map((e) => {
						let r = e.id === t;
						return /* @__PURE__ */ (0, d.jsxs)("button", {
							type: "button",
							"aria-current": r ? "page" : void 0,
							onClick: () => n(e.id),
							className: `help-dialog__category group flex min-w-max items-center gap-2 rounded-lg px-3 py-2 text-left text-xs transition-colors sm:min-w-0 ${r ? "bg-indigo-500/15 font-medium text-indigo-300" : "text-canvas-text-secondary hover:bg-canvas-hover hover:text-canvas-text"}`,
							children: [/* @__PURE__ */ (0, d.jsx)(c, {
								icon: e.icon,
								width: "16",
								height: "16",
								className: r ? "text-indigo-400" : "text-canvas-text-muted group-hover:text-canvas-text-secondary",
								"aria-hidden": "true"
							}), /* @__PURE__ */ (0, d.jsx)("span", { children: e.label })]
						}, e.id);
					})
				}), /* @__PURE__ */ (0, d.jsx)("main", {
					className: "help-dialog__main min-h-0 flex-1 overflow-y-auto px-4 py-4 sm:px-5 sm:py-4",
					children: /* @__PURE__ */ (0, d.jsxs)("div", {
						className: "mx-auto max-w-xl",
						children: [
							/* @__PURE__ */ (0, d.jsxs)("div", {
								className: "mb-5",
								children: [/* @__PURE__ */ (0, d.jsx)("p", {
									className: "help-dialog__accent text-[11px] font-medium text-indigo-400",
									children: r.label
								}), /* @__PURE__ */ (0, d.jsx)("h3", {
									className: "mt-1 text-lg font-semibold text-canvas-text",
									children: r.summary
								})]
							}),
							/* @__PURE__ */ (0, d.jsx)(y, { categoryId: t }),
							/* @__PURE__ */ (0, d.jsx)("ol", {
								className: "space-y-1",
								children: r.items.map((e, t) => /* @__PURE__ */ (0, d.jsxs)("li", {
									className: "flex gap-4 border-b border-canvas-border/70 py-3 first:pt-0 last:border-b-0",
									children: [/* @__PURE__ */ (0, d.jsx)("span", {
										className: "help-dialog__index flex h-6 w-6 shrink-0 items-center justify-center rounded-md bg-canvas-hover text-[11px] font-semibold text-canvas-text-secondary",
										children: t + 1
									}), /* @__PURE__ */ (0, d.jsxs)("div", {
										className: "min-w-0",
										children: [/* @__PURE__ */ (0, d.jsxs)("div", {
											className: "flex flex-wrap items-center gap-2",
											children: [/* @__PURE__ */ (0, d.jsx)("h4", {
												className: "text-sm font-medium text-canvas-text",
												children: e.title
											}), "shortcut" in e && e.shortcut ? /* @__PURE__ */ (0, d.jsx)("kbd", {
												className: "rounded-md border border-canvas-border bg-canvas-hover px-1.5 py-0.5 font-sans text-[10px] font-medium text-canvas-text-secondary",
												children: e.shortcut
											}) : null]
										}), /* @__PURE__ */ (0, d.jsx)("p", {
											className: "mt-1.5 text-xs leading-5 text-canvas-text-secondary",
											children: e.description
										})]
									})]
								}, e.title))
							}),
							t === "generation" ? /* @__PURE__ */ (0, d.jsx)(g, {}) : null,
							/* @__PURE__ */ (0, d.jsxs)("div", {
								className: "mt-5 flex items-start gap-2 border-t border-canvas-border pt-4 text-xs leading-5 text-canvas-text-muted",
								children: [/* @__PURE__ */ (0, d.jsx)(c, {
									icon: "mdi:keyboard-outline",
									width: "16",
									height: "16",
									className: "mt-0.5 shrink-0",
									"aria-hidden": "true"
								}), /* @__PURE__ */ (0, d.jsx)("p", { children: "完整快捷键可在“设置 > 快捷键”中查看；按 Esc 可随时关闭当前弹窗或菜单。" })]
							})
						]
					})
				})]
			})]
		})
	}), document.body) });
}
//#endregion
export { b as default };
