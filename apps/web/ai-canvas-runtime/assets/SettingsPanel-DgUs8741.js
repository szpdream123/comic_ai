import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./react-dom-BhFnNZvF.js";
import { t as r } from "./jsx-runtime-BAkIPmuO.js";
import { a as i, n as a, r as o, t as s } from "./i18n-on3r1DCI.js";
import { An as c, Bn as l, D as u, En as d, Gn as f, Ln as p, Mn as m, Nn as h, O as g, Rn as _, Wn as v, Xn as y, _ as b, _i as x, di as S, t as C, v as w, y as T, zn as E } from "./useAppStore-CcUL4Jo0.js";
import { a as D } from "./core-CoHQ9AE0.js";
import { a as O, l as k, n as A, s as j } from "./dist-js-DL_alM4B.js";
import { r as M } from "./dist-js-De6wNmmK.js";
import { E as N, M as P, N as F, O as I, j as L, m as R, w as ee } from "./directorSceneSchema-BcP-NXqL.js";
import { k as te, ot as z, x as B } from "./fileService-zQLozbOU.js";
import { a as V, r as H } from "./ViewportImage-Dsz9jsTU.js";
import { t as ne } from "./ModalOverlay-DopvjrY3.js";
import { C as U, Et as re, Rt as W, Tt as ie, W as G, zt as ae } from "./useTooltipAutoPlacement-BSvTkR9V.js";
import { n as K } from "./rasterImageDimensions-CX1VK2cM.js";
import { c as oe } from "./pluginRuntime-BcmSSkf4.js";
import { a as se, i as ce } from "./clipboardService-CzwkqkrP.js";
import { a as q, c as le, d as ue, i as de, l as fe, n as pe, o as me, r as he, s as ge, t as _e, u as ve } from "./modelProtocolImport-BSjvFVfl.js";
import { o as J, t as Y } from "./ChatMarkdown-DMpOf4pJ.js";
import { a as ye, o as be, r as X } from "./directorDeskRuntimeService-BVEhEsXx.js";
import { t as xe } from "./directorDeskWindowService-DpsH4KfE.js";
import { o as Se, t as Ce } from "./mcpBridgeService-BJSLQn_R.js";
import { a as we, n as Z, o as Te, r as Ee, s as De, t as Oe } from "./mcpSessionConfig-CUo3K807.js";
import { r as ke, t as Ae } from "./directorBlenderRuntimeService-4walvpJO.js";
//#region src/styles/settings.css
var Q = /* @__PURE__ */ e(t(), 1), je = "ai-canvas/provider-connection", Me = 1, Ne = Object.keys(S), Pe = [
	"generation-json-image-urls",
	"generation-json-image-data-urls",
	"edits-multipart"
];
function Fe(e) {
	return typeof e == "object" && !!e && !Array.isArray(e);
}
function Ie(e) {
	return typeof e == "string" && e.trim() ? e.trim() : void 0;
}
function Le(e) {
	return JSON.stringify({
		kind: je,
		version: Me,
		connection: {
			name: e.name,
			catalogId: e.catalogId,
			baseUrl: e.baseUrl,
			selectedModels: e.selectedModels,
			catalogModels: e.catalogModels,
			visibleModelCategories: e.visibleModelCategories
		}
	}, null, 2);
}
function Re(e) {
	if (!Fe(e)) return null;
	let t = Ie(e.id);
	if (!t) return null;
	let n = Ne.includes(e.category) ? e.category : "text", r = {
		id: t,
		name: Ie(e.name) || t,
		category: n,
		provider: "",
		categoryManual: e.categoryManual === !0
	}, i = Ie(e.description);
	i && (r.description = i.slice(0, 500)), typeof e.contextWindow == "number" && Number.isFinite(e.contextWindow) && (r.contextWindow = Math.max(0, Math.floor(e.contextWindow))), Array.isArray(e.inputModalities) && (r.inputModalities = e.inputModalities.filter((e) => e === "text" || e === "image")), Fe(e.videoCapability) && (r.videoCapability = e.videoCapability), Pe.includes(e.imageReferenceRequestMode) && (r.imageReferenceRequestMode = e.imageReferenceRequestMode);
	let a = e.executionProfile;
	return Fe(a) && typeof a.preset == "string" && (a.preset === "custom" ? l(a.protocol).length === 0 && (r.executionProfile = {
		preset: "custom",
		protocol: a.protocol
	}) : r.executionProfile = { preset: a.preset }), r;
}
function ze(e) {
	if (Array.isArray(e)) return e.map(Re).filter((e) => e !== null);
}
function Be(e) {
	let t;
	try {
		t = JSON.parse(e);
	} catch {
		return null;
	}
	if (!Fe(t) || t.kind !== je) return null;
	let n = Fe(t.connection) ? t.connection : null;
	if (!n) return null;
	let r = Ie(n.catalogId) || "custom-openai", i = Array.isArray(n.visibleModelCategories) ? Ne.filter((e) => n.visibleModelCategories.includes(e)) : void 0;
	return {
		catalogId: r,
		config: {
			name: Ie(n.name) || "导入的连接",
			apiKey: "",
			baseUrl: ue(Ie(n.baseUrl)) || void 0,
			catalogId: r,
			selectedModels: ze(n.selectedModels),
			catalogModels: ze(n.catalogModels),
			visibleModelCategories: i
		}
	};
}
//#endregion
//#region src/components/settings/apiKeySettingsUtils.ts
function Ve(e, t) {
	return t === "oauth" || !!e.apiKey.trim() || e.catalogId === "custom-openai";
}
//#endregion
//#region src/services/testConnection.ts
function He(e) {
	if (!e || typeof e != "object") return;
	let t = e;
	if (typeof t.message == "string") return t.message;
	if (typeof t.errorMessage == "string") return t.errorMessage;
	if (typeof t.error == "string") return t.error;
	if (t.error && typeof t.error == "object") {
		let e = t.error;
		if (typeof e.message == "string") return e.message;
	}
}
async function Ue(e, t) {
	let n = ve(t);
	if (n.length === 0) return {
		success: !1,
		error: "请先填写接口地址"
	};
	let r = {
		success: !1,
		error: "接口地址不可达"
	};
	for (let t of n) {
		let n = await y(`${t}/models`, {
			method: "GET",
			headers: { Authorization: `Bearer ${e}` }
		});
		if (n.ok) return {
			success: !0,
			baseUrl: t
		};
		let i = He(await n.json().catch(() => null));
		if (r = {
			success: !1,
			error: i ? `HTTP ${n.status}: ${i}` : `HTTP ${n.status}`
		}, n.status === 401 || n.status === 403) return r;
	}
	return r;
}
async function We(e, t, n, r = {}) {
	let i = ve(t)[0];
	if (!i) return {
		success: !1,
		error: "请先填写接口地址"
	};
	let a = new URL(n, `${i}/`);
	for (let [e, t] of Object.entries(r)) a.searchParams.set(e, t);
	let o = await y(a.toString(), {
		method: "GET",
		headers: { Authorization: `Bearer ${e}` }
	}), s = await o.json().catch(() => null);
	if (!o.ok) {
		let e = He(s);
		return {
			success: !1,
			error: e ? `HTTP ${o.status}: ${e}` : `HTTP ${o.status}`
		};
	}
	let c = s && typeof s == "object" ? s : {}, l = c.balance, u = typeof c.currency == "string" ? c.currency.trim() : "";
	return {
		success: !0,
		balance: typeof l == "number" || typeof l == "string" ? `${l}${u ? ` ${u}` : ""}` : void 0,
		baseUrl: i
	};
}
async function Ge(e) {
	let t = await (await y("https://www.runninghub.cn/uc/openapi/accountStatus", {
		method: "POST",
		headers: { "Content-Type": "application/json" },
		body: JSON.stringify({ apikey: e })
	})).json().catch(() => ({}));
	if (t.code === 0 && t.data) {
		let e = t.data.remainCoins, n = t.data.currentTaskCounts, r = [];
		return e != null && r.push(`${e} 积分`), n != null && n !== "0" && r.push(`${n} 任务运行中`), {
			success: !0,
			balance: r.join("，") || void 0
		};
	}
	return {
		success: !1,
		error: t.msg || t.errorMessage || `code=${t.code}`
	};
}
async function Ke() {
	return {
		success: !1,
		unsupported: !0,
		error: "GRSAI 未提供已确认无计费的目录或鉴权端点，本次未发送网络请求"
	};
}
async function qe(e, t) {
	return typeof window > "u" || !("__TAURI__" in window || "__TAURI_INTERNALS__" in window) ? {
		success: !1,
		error: "联网搜索连接测试仅在 Tauri 桌面环境可用"
	} : (await D("assistant_web_search", { request: {
		provider: e,
		apiKey: t,
		query: "AI Canvas connection test",
		maxResults: 1,
		topic: "general"
	} }), { success: !0 });
}
var Je = {
	apimart: (e, t) => Ue(e, t || "https://api.apib.ai/v1"),
	volcengine: (e, t) => Ue(e, t || "https://ark.cn-beijing.volces.com/api/v3"),
	"runninghub-model": Ge,
	grsai: Ke,
	tavily: (e) => qe("tavily", e),
	bocha: (e) => qe("bocha", e),
	"zhipu-search": (e) => qe("zhipu-search", e),
	exa: (e) => qe("exa", e)
};
async function Ye(e, t, n) {
	if (!t) return {
		success: !1,
		error: "请先填写 API 密钥"
	};
	let r = Je[e];
	try {
		if (r) return await r(t, n);
		let i = q(e);
		if (i?.authType === "oauth") return {
			success: !1,
			unsupported: !0,
			error: `${i.name} 使用 OAuth 登录，无需验证密钥`
		};
		let a = n?.trim() || i?.defaultBaseUrl;
		return a ? i?.connectionTestPath ? await We(t, a, i.connectionTestPath, i.requestQuery) : await Ue(t, a) : {
			success: !1,
			error: `未知厂商: ${e}`
		};
	} catch (e) {
		return {
			success: !1,
			error: `网络错误: ${e instanceof Error ? e.message : String(e)}`
		};
	}
}
//#endregion
//#region src/components/settings/DreaminaLoginModal.tsx
var Xe = n(), $ = r();
function Ze({ isOpen: e, runtime: t, onClose: n, onOpenUrl: r, onCopy: a }) {
	let o = i(), s = t?.phase || "preparing", c = t?.verificationUrl || "", l = t?.userCode || "", u = s === "oauth_ready" || s === "polling", d = s === "preparing" || s === "starting";
	return (0, Xe.createPortal)(/* @__PURE__ */ (0, $.jsx)(V, { children: e && /* @__PURE__ */ (0, $.jsx)(H.div, {
		"data-tauri-drag-region": !0,
		className: "dreamina-login-overlay",
		initial: { opacity: 0 },
		animate: { opacity: 1 },
		exit: { opacity: 0 },
		transition: { duration: .18 },
		onClick: n,
		children: /* @__PURE__ */ (0, $.jsxs)(H.div, {
			className: "dreamina-login-modal dreamina-login-modal--guide-open",
			role: "dialog",
			"aria-modal": "true",
			"aria-label": o("即梦登录"),
			initial: {
				opacity: 0,
				scale: .95,
				y: 16
			},
			animate: {
				opacity: 1,
				scale: 1,
				y: 0
			},
			exit: {
				opacity: 0,
				scale: .96,
				y: 10
			},
			transition: {
				type: "spring",
				stiffness: 350,
				damping: 30
			},
			onClick: (e) => e.stopPropagation(),
			children: [
				/* @__PURE__ */ (0, $.jsx)(ie, {
					ariaLabel: o("关闭即梦登录窗口"),
					className: "absolute right-3.5 top-3",
					onClick: n
				}),
				/* @__PURE__ */ (0, $.jsx)("div", {
					className: "dreamina-login-modal-badge",
					children: o("即梦账号")
				}),
				/* @__PURE__ */ (0, $.jsx)("div", {
					className: "dreamina-login-modal-message",
					children: t?.message || o("OAuth 登录已启动，请按下方步骤完成授权。")
				}),
				d && /* @__PURE__ */ (0, $.jsxs)("div", {
					className: "dreamina-login-modal-wait",
					children: [/* @__PURE__ */ (0, $.jsx)("div", {
						className: "dreamina-login-modal-spinner",
						"aria-hidden": "true"
					}), /* @__PURE__ */ (0, $.jsx)("div", {
						className: "dreamina-login-modal-wait-text",
						children: o("正在准备授权链接，请稍候…")
					})]
				}),
				u && /* @__PURE__ */ (0, $.jsxs)("div", {
					className: "dreamina-manual-guide",
					children: [
						/* @__PURE__ */ (0, $.jsx)("div", {
							className: "dreamina-manual-guide-head",
							children: /* @__PURE__ */ (0, $.jsx)("div", {
								className: "dreamina-manual-guide-title",
								children: o("OAuth 登录（2 步）")
							})
						}),
						/* @__PURE__ */ (0, $.jsxs)("div", {
							className: "dreamina-manual-quick",
							children: [
								/* @__PURE__ */ (0, $.jsx)("div", {
									className: "dreamina-manual-step",
									children: o("1) 打开即梦授权链接")
								}),
								/* @__PURE__ */ (0, $.jsxs)("div", {
									className: "dreamina-manual-link-row",
									children: [
										/* @__PURE__ */ (0, $.jsx)("input", {
											className: "dreamina-manual-link-input",
											readOnly: !0,
											"aria-label": o("即梦授权链接"),
											value: c
										}),
										/* @__PURE__ */ (0, $.jsx)("button", {
											type: "button",
											className: "settings-save-btn",
											disabled: !c,
											onClick: () => c && r(c),
											children: o("打开")
										}),
										/* @__PURE__ */ (0, $.jsx)("button", {
											type: "button",
											className: "settings-save-btn settings-btn-ghost",
											disabled: !c,
											onClick: () => c && a(c, o("授权链接")),
											children: o("复制")
										})
									]
								}),
								/* @__PURE__ */ (0, $.jsx)("div", {
									className: "dreamina-manual-step",
									children: o("2) 在授权页面输入验证码")
								}),
								/* @__PURE__ */ (0, $.jsxs)("div", {
									className: "dreamina-manual-link-row",
									children: [/* @__PURE__ */ (0, $.jsx)("input", {
										className: "dreamina-manual-link-input dreamina-manual-code-input",
										readOnly: !0,
										"aria-label": o("即梦验证码"),
										value: l
									}), /* @__PURE__ */ (0, $.jsx)("button", {
										type: "button",
										className: "settings-save-btn settings-btn-ghost",
										disabled: !l,
										onClick: () => l && a(l, o("验证码")),
										children: o("复制验证码")
									})]
								})
							]
						}),
						/* @__PURE__ */ (0, $.jsxs)("div", {
							className: "dreamina-login-modal-wait dreamina-login-modal-wait--inline",
							children: [/* @__PURE__ */ (0, $.jsx)("div", {
								className: "dreamina-login-modal-spinner",
								"aria-hidden": "true"
							}), /* @__PURE__ */ (0, $.jsx)("div", {
								className: "dreamina-login-modal-wait-text",
								children: o("请打开授权链接，在页面输入验证码；系统会自动同步登录状态。")
							})]
						})
					]
				}),
				s === "failed" && /* @__PURE__ */ (0, $.jsx)("div", {
					className: "dreamina-login-modal-error",
					children: t?.error || o("登录失败，请重试。")
				}),
				/* @__PURE__ */ (0, $.jsx)("div", {
					className: "dreamina-login-modal-actions",
					children: /* @__PURE__ */ (0, $.jsx)("button", {
						type: "button",
						className: "settings-save-btn settings-btn-ghost",
						onClick: n,
						children: o("收起登录引导")
					})
				})
			]
		})
	}) }), document.body);
}
//#endregion
//#region src/components/settings/providerConnection/providerConnectionShared.ts
var Qe = [
	"text",
	"image",
	"video",
	"audio"
], $e = [
	"16:9",
	"9:16",
	"1:1",
	"4:3",
	"3:4",
	"21:9",
	"adaptive"
], et = [
	"480p",
	"540p",
	"720p",
	"1080p",
	"2K",
	"4K",
	"480",
	"640",
	"832",
	"1280"
], tt = [
	16,
	24,
	25,
	30,
	48,
	60
], nt = [
	2,
	3,
	4,
	5,
	6,
	8,
	10,
	12,
	15,
	20,
	30
], rt = 3600, it = {
	apimart: "https://apimart.ai/register?aff=ZnmCKm",
	volcengine: "https://console.volcengine.com/ark/region:ark+cn-beijing/apiKey",
	"runninghub-model": "https://www.runninghub.cn?inviteCode=iadc40jt",
	grsai: "https://grsai.com/zh/dashboard/api-keys",
	dreamina: "https://jimeng.jianying.com/ai-tool/home/",
	tavily: "https://app.tavily.com",
	bocha: "https://open.bochaai.com/dashboard",
	"zhipu-search": "https://open.bigmodel.cn/usercenter/apikeys",
	exa: "https://dashboard.exa.ai/api-keys"
};
function at(e, t) {
	let n = t.trim().replace(/\/+$/, ""), r = n ? `${n}/docs` : "【请在这里粘贴该中转站的文档或模型列表页面 HTTPS 链接（若上面的接口地址已填，这里可留空，我会自动尝试 /docs）】";
	return [
		"请帮我把这个「中转站 / 聚合 API」里的模型添加为自定义接口配置。",
		"",
		`目标连接名称：${e || "（未填，可自定义）"}`,
		n ? `接口地址（Base URL）：${n} —— 所有模型都用这个真实接口地址，不要拿文档站域名当 Base URL。` : "接口地址（Base URL）：未填。请从文档 / 中转站地址确定真实 API 接口地址（不是文档站域名）；new-api / one-api 中转站的文档域名通常就是 API 域名。",
		"",
		"请这样操作：",
		"1. 用 provider_docs_read 阅读该中转站的文档首页，拿到模型清单以及每个模型的接口页链接。",
		"2. 调用 provider_models_select，把清单里的全部模型作为候选传进去，我会在勾选卡片里选。不要在正文里罗列清单让我打字回复，也不要自作主张全部添加。",
		"3. 我勾选之后，对选中的每个模型用 provider_docs_read 打开它自己的接口页（形如 /docs/videos/{模型ID}），只读这些。只有那里才有该模型真实的参数表、固定能力和请求示例。",
		"4. 逐个核对模型 ID、显示名称、类型。请求路径和请求体字段一律以该模型自己的文档为准：文档有「请求示例」JSON 就原样用，只有参数表就只写表里的字段。只有文档明确声明 OpenAI 兼容时才能采用对应标准端点；文档没有端点或字段时必须报告资料不足，禁止猜测 /v1/videos、/videos/generations 等路径。多写一个该模型不认识的字段，接口就会返回 400 unsupported field，所以宁可暂停配置也不要凭印象补字段。",
		"4.1 文档写明的固定能力（固定时长、宽高比枚举、参考图上限等）用 videoCapability 声明出来，画布上的参数面板会据此约束用户，避免发出该模型不支持的取值。",
		"5. 读完所选模型的接口页后必须立即调用 provider_config_preview 生成草稿，再调用 provider_config_apply 保存；不要只报告一遍字段就结束任务（同一 Base URL，单次最多 16 个，超出就分多次保存）。",
		"6. 不要写入 API Key，把其余内容都填好即可；保存后我会自己补填 API Key。",
		"",
		"中转站文档 / 模型列表链接：",
		r
	].join("\n");
}
async function ot(e) {
	try {
		await import("./dist-js-CtV1w6rx.js").then(({ open: t }) => t(e));
	} catch {
		window.open(e, "_blank", "noopener,noreferrer");
	}
}
//#endregion
//#region src/components/settings/providerConnection/ProviderConnectionForm.tsx
function st({ editing: e, definition: t, isWebSearchProvider: n, connectionName: r, setConnectionName: a, apiKey: o, setApiKey: s, baseUrl: c, setBaseUrl: l, workflowApiKey: u, setWorkflowApiKey: d, dreaminaLoggedIn: f, dreaminaLoading: p, onDreaminaLogin: m, duplicateConnectionName: h, catalogStatus: g, catalogMessage: _, missingCredentials: v, onReturnToPicker: y, onTestConnection: b }) {
	let x = i();
	return /* @__PURE__ */ (0, $.jsxs)("section", {
		className: "provider-config-section",
		children: [
			/* @__PURE__ */ (0, $.jsxs)("div", {
				className: "provider-section-heading",
				children: [/* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsx)("h4", { children: x("连接信息") }), /* @__PURE__ */ (0, $.jsx)("p", { children: t.description })] }), !e && !n && /* @__PURE__ */ (0, $.jsx)(W, {
					type: "button",
					className: "provider-text-btn",
					onClick: y,
					children: x("更换厂商")
				})]
			}),
			t.id === "custom-openai" && /* @__PURE__ */ (0, $.jsxs)("div", {
				className: "provider-catalog-message is-warning provider-custom-openai-warning",
				children: [/* @__PURE__ */ (0, $.jsx)(K, {
					icon: "mdi:alert-circle-outline",
					width: "16"
				}), /* @__PURE__ */ (0, $.jsx)("span", { children: x("提示：每个中转站提供的模型和参数规则都不一样，从接口拉取下来的模型，不一定能直接拿来用。不同中转站对同一个模型的名字、传入图片、尺寸等参数往往不同，直接使用可能会报错。请先查看你所用中转站的官方文档，把对应的参数改成文档里的值。如果你不会改，可以这样做：直接把中转站的文档发给对话助手，或者开启智能体并接入 MCP，让助手照着文档帮你添加和配置。") })]
			}),
			t.id === "custom-openai" && /* @__PURE__ */ (0, $.jsxs)("label", {
				className: "provider-field",
				children: [/* @__PURE__ */ (0, $.jsx)("span", { children: x("连接名称") }), /* @__PURE__ */ (0, $.jsx)("input", {
					type: "text",
					value: r,
					placeholder: x("例如：团队模型网关"),
					onChange: (e) => a(e.target.value)
				})]
			}),
			t.authType === "oauth" ? /* @__PURE__ */ (0, $.jsxs)("div", {
				className: "provider-oauth-row",
				children: [
					/* @__PURE__ */ (0, $.jsx)("span", { className: `provider-connection-dot${f ? " is-online" : ""}` }),
					/* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsx)("strong", { children: x(f ? "即梦账号已登录" : "即梦账号未登录") }), /* @__PURE__ */ (0, $.jsx)("small", { children: x("模型调用使用桌面端 OAuth 登录态") })] }),
					/* @__PURE__ */ (0, $.jsx)(W, {
						type: "button",
						className: "provider-secondary-btn",
						disabled: p,
						onClick: m,
						children: x(p ? "处理中..." : f ? "重新登录" : "OAuth 登录")
					})
				]
			}) : /* @__PURE__ */ (0, $.jsxs)("div", {
				className: "provider-fields-grid",
				children: [t.credentials.map((e) => {
					let n = e.key === "apiKey" ? o : c, r = e.key === "baseUrl" && t.allowCustomBaseUrl === !1;
					return /* @__PURE__ */ (0, $.jsxs)("label", {
						className: "provider-field",
						children: [/* @__PURE__ */ (0, $.jsxs)("span", { children: [e.label, e.required ? " *" : ""] }), /* @__PURE__ */ (0, $.jsx)("input", {
							type: e.secret ? "password" : "text",
							value: n,
							placeholder: e.placeholder,
							readOnly: r,
							disabled: r,
							onChange: (t) => {
								e.key === "apiKey" ? s(t.target.value) : l(t.target.value);
							},
							onBlur: (t) => {
								e.key === "baseUrl" && l(ue(t.target.value));
							}
						})]
					}, e.key);
				}), t.id === "runninghub-model" && /* @__PURE__ */ (0, $.jsxs)("label", {
					className: "provider-field",
					children: [/* @__PURE__ */ (0, $.jsx)("span", { children: x("消费级-会员 API Key") }), /* @__PURE__ */ (0, $.jsx)("input", {
						type: "password",
						value: u,
						placeholder: x("用于 RunningHub 工作流执行（可选）"),
						onChange: (e) => d(e.target.value)
					})]
				})]
			}),
			h && /* @__PURE__ */ (0, $.jsxs)("div", {
				className: "provider-catalog-message is-warning",
				children: [/* @__PURE__ */ (0, $.jsx)(K, {
					icon: "mdi:content-duplicate",
					width: "14"
				}), /* @__PURE__ */ (0, $.jsx)("span", { children: x("已有连接「{name}」使用相同接口地址。继续保存会新建第二条同网关连接；如果只是想加模型，建议回列表编辑「{name}」。", { name: h }) })]
			}),
			(t.externalUrl || it[t.id]) && /* @__PURE__ */ (0, $.jsxs)("button", {
				type: "button",
				className: "provider-external-link",
				onClick: () => void ot(t.externalUrl || it[t.id]),
				children: [/* @__PURE__ */ (0, $.jsx)(K, {
					icon: "mdi:open-in-new",
					width: "13"
				}), t.id === "grsai" ? x("前往 API Key 页面") : x("前往厂商控制台")]
			}),
			t.authType !== "oauth" && /* @__PURE__ */ (0, $.jsxs)("div", {
				className: "mt-3 flex flex-wrap items-center gap-2",
				children: [/* @__PURE__ */ (0, $.jsxs)(W, {
					type: "button",
					className: "provider-secondary-btn",
					disabled: v || g === "loading",
					onClick: () => void b(),
					children: [/* @__PURE__ */ (0, $.jsx)(K, {
						icon: g === "loading" ? "mdi:loading" : "mdi:connection",
						className: g === "loading" ? "settings-spin" : void 0,
						width: "15"
					}), x(g === "loading" ? "验证中" : "验证连接")]
				}), n && _ && /* @__PURE__ */ (0, $.jsxs)("div", {
					className: `provider-catalog-message is-${g} m-0 flex-1`,
					children: [/* @__PURE__ */ (0, $.jsx)(K, {
						icon: g === "error" ? "mdi:alert-circle-outline" : "mdi:information-outline",
						width: "14"
					}), /* @__PURE__ */ (0, $.jsx)("span", { children: _ })]
				})]
			})
		]
	});
}
//#endregion
//#region src/components/settings/modelProtocolTestRun.ts
function ct(e, t, n) {
	return e === "legacy" ? "legacy-preset" : n.trim() ? t.trim() ? null : "missing-api-key" : "missing-base-url";
}
//#endregion
//#region src/components/settings/ModelProtocolEditor.tsx
var lt = {
	legacy: "自动兼容（旧方式）",
	"openai-chat": "OpenAI Chat",
	"openai-image": "OpenAI 同步图片",
	"agnes-video": "Agnes 异步视频",
	custom: "高级自定义"
}, ut = {
	text: v("text"),
	image: v("image"),
	video: v("video"),
	audio: v("audio")
}, dt = "仅用于轮询请求：提交响应中解析出的任务 ID";
function ft(e) {
	return f(e) ?? "调用时替换为节点中的实际值";
}
function pt(e) {
	let t = {
		model: e.id,
		prompt: "A cinematic product shot"
	};
	return e.category === "text" ? {
		...t,
		messages: [{
			role: "user",
			content: "介绍这个模型"
		}],
		stream: !1
	} : e.category === "image" ? {
		...t,
		imageSize: "1K",
		aspectRatio: "1:1",
		size: "1024x1024",
		width: 1024,
		height: 1024,
		n: 1,
		batchCount: 1,
		imageUrls: ["data:image/png;base64,iVBORw0KGgo="]
	} : e.category === "video" ? {
		...t,
		size: "1152x768",
		width: 1152,
		height: 768,
		frames: 121,
		frames8n1: 121,
		fps: 24,
		duration: 5,
		videoResolution: 768,
		videoFrames: 121,
		videoFps: 24,
		seedanceResolution: "720p",
		seedanceRatio: "16:9",
		seedanceDuration: 5,
		generateAudio: !1,
		videoOperation: "video-to-video",
		imageUrls: ["https://cdn.example/reference-first.png", "https://cdn.example/reference-last.png"],
		firstImage: "https://cdn.example/reference-first.png",
		lastImage: "https://cdn.example/reference-last.png",
		imageWithRoles: [{
			url: "https://cdn.example/reference-first.png",
			role: "first_frame"
		}, {
			url: "https://cdn.example/reference-last.png",
			role: "last_frame"
		}],
		referenceImageUrls: ["https://cdn.example/reference-first.png"],
		videoUrls: ["https://cdn.example/reference.mp4"],
		referenceVideoUrl: "https://cdn.example/reference.mp4",
		referenceVideoUrls: ["https://cdn.example/reference.mp4"],
		audioUrls: ["https://cdn.example/reference.mp3"],
		audioUrl: "https://cdn.example/reference.mp3",
		referenceAudioUrls: ["https://cdn.example/reference.mp3"]
	} : {
		...t,
		audioVoice: "alloy",
		audioFormat: "wav",
		audioSpeed: 1,
		duration: 10,
		musicTitle: "Sample Track",
		musicLyrics: "",
		musicBpm: 120,
		n: 1,
		batchCount: 1,
		audioUrls: ["https://cdn.example/reference.mp3"],
		audioUrl: "https://cdn.example/reference.mp3",
		referenceAudioUrls: ["https://cdn.example/reference.mp3"]
	};
}
function mt() {
	return {
		task_id: "task_example",
		video_id: "video_example",
		id: "task_example",
		status: "completed",
		progress: 100,
		url: "https://cdn.example/result.mp4",
		video_url: "https://cdn.example/result.mp4",
		data: [{
			url: "https://cdn.example/result.png",
			b64_json: "aGVsbG8=",
			caption: "生成完成"
		}],
		result: {
			url: "https://cdn.example/result.png",
			text: "生成完成"
		},
		choices: [{ message: { content: "生成完成" } }],
		error: null
	};
}
function ht(e) {
	return e === "text" ? [
		"legacy",
		"openai-chat",
		"custom"
	] : e === "image" ? [
		"legacy",
		"openai-image",
		"custom"
	] : e === "video" ? [
		"legacy",
		"agnes-video",
		"custom"
	] : ["legacy", "custom"];
}
function gt(e) {
	try {
		let t = JSON.parse(e), n = l(t);
		return n.length > 0 ? { error: n[0] } : { protocol: _(t) };
	} catch (e) {
		return { error: e instanceof Error ? e.message : "协议 JSON 无效" };
	}
}
function _t(e) {
	return JSON.stringify(e ?? {}, null, 2);
}
function vt(e) {
	return !!e && typeof e == "object" && !Array.isArray(e);
}
function yt({ fieldId: e, label: t, value: n, kind: r = "object", rows: i = 4, onChange: a, onValidityChange: o }) {
	let [s, c] = (0, Q.useState)(() => _t(n)), [l, u] = (0, Q.useState)(null), d = (t) => {
		c(t);
		try {
			let n = JSON.parse(t);
			if (r === "object" && !vt(n)) throw Error("必须是 JSON 对象");
			u(null), o(e), a(n);
		} catch (t) {
			let n = t instanceof Error ? t.message : "JSON 无效";
			u(n), o(e, n);
		}
	};
	return /* @__PURE__ */ (0, $.jsxs)("label", {
		className: "provider-protocol-field provider-protocol-json-field",
		children: [
			/* @__PURE__ */ (0, $.jsx)("span", { children: t }),
			/* @__PURE__ */ (0, $.jsx)("textarea", {
				value: s,
				rows: i,
				spellCheck: !1,
				"aria-invalid": !!l,
				onChange: (e) => d(e.target.value)
			}),
			l ? /* @__PURE__ */ (0, $.jsx)("small", {
				role: "alert",
				children: l
			}) : null
		]
	});
}
function bt(e) {
	return {
		method: "GET",
		path: e === "video" ? "" : "/tasks/{{submit.task_id}}",
		response: {
			statusPath: "status",
			successValues: ["completed"],
			failureValues: ["failed", "error"],
			result: e === "text" ? { textPath: "result.text" } : { urlPath: "url" },
			errorPath: "error.message",
			progressPath: "progress"
		},
		intervalMs: 3e3
	};
}
function xt({ model: e, apiKey: t, baseUrl: n, onChange: r, onImageReferenceRequestModeChange: a, onValidityChange: o, onClose: s }) {
	let u = i(), f = e.executionProfile?.preset ?? "legacy", g = e.executionProfile?.preset === "custom" && e.executionProfile.protocol ? _(e.executionProfile.protocol) : m(e.category), [v, y] = (0, Q.useState)(f), [b, x] = (0, Q.useState)(g), [S, C] = (0, Q.useState)("form"), [w, T] = (0, Q.useState)(() => _t(g)), [D, O] = (0, Q.useState)(null), [k, A] = (0, Q.useState)(0), [j, M] = (0, Q.useState)(() => _t(pt(e))), [N, P] = (0, Q.useState)(() => _t(mt())), F = (0, Q.useId)(), I = `${F}-error`, L = (0, Q.useId)(), R = `${L}-error`, ee = (0, Q.useId)(), te = `${ee}-help`, z = (0, Q.useRef)(/* @__PURE__ */ new Set()), [B, V] = (0, Q.useState)({ status: "idle" }), H = (0, Q.useRef)(null);
	(0, Q.useEffect)(() => () => H.current?.abort(), []);
	let ne = (e) => {
		x(e), T(_t(e));
		let t = l(e);
		O(t[0] ?? null);
		let n = t.length === 0 && z.current.size === 0;
		o(n), n && r({
			preset: "custom",
			protocol: _(e)
		});
	}, U = (e) => {
		let t = structuredClone(b);
		e(t), ne(t);
	}, re = (e, t) => {
		t ? z.current.add(e) : z.current.delete(e);
		let n = l(b);
		O(n[0] ?? null), o(n.length === 0 && z.current.size === 0);
	}, W = (e) => {
		T(e);
		let t = gt(e);
		O(t.error ?? null), o(!!t.protocol), t.protocol && (z.current.clear(), x(t.protocol), r({
			preset: "custom",
			protocol: t.protocol
		}));
	}, G = (e) => {
		z.current.clear(), O(null), T(_t(b)), C(e), o(l(b).length === 0);
	}, ae = (e) => {
		if (y(e), O(null), z.current.clear(), e === "legacy") {
			o(!0), r(void 0);
			return;
		}
		if (e === "custom") {
			ne(v !== "legacy" && v !== "custom" ? h(v) : b);
			return;
		}
		let t = h(e);
		x(t), T(_t(t)), o(!0), r({ preset: e });
	}, oe = (t) => {
		U((n) => {
			n.mode = t, t === "sync" ? (delete n.poll, n.response = {
				type: "json",
				result: e.category === "text" ? { textPath: "choices.0.message.content" } : { urlPath: "data.*.url" },
				errorPath: n.response.errorPath
			}) : (n.response = {
				type: "json",
				taskIdPath: n.response.taskIdPath ?? "task_id",
				errorPath: n.response.errorPath
			}, n.poll ??= bt(e.category));
		});
	}, se = (e) => {
		U((t) => {
			e === "header" ? t.auth = {
				type: e,
				name: "X-API-Key"
			} : e === "query" ? t.auth = {
				type: e,
				name: "api_key"
			} : t.auth = { type: e };
		});
	}, ce = (t) => {
		U((n) => {
			if (n.response.type = t, t === "json") {
				let t = n.response.result ?? {};
				!t.urlPath && !t.textPath && !t.base64Path && (e.category === "text" ? t.textPath = "choices.0.message.content" : t.urlPath = "data.*.url"), n.response.result = t;
				return;
			}
			t === "text" ? delete n.response.result : n.response.result = n.response.result?.mimeType ? { mimeType: n.response.result.mimeType } : {};
		});
	}, q = (e) => {
		e && (U((t) => {
			let n = vt(t.submit.body) ? t.submit.body : {};
			e === "size" && (n.size = "{{size}}"), e === "dimensions" && (n.width = "{{width}}", n.height = "{{height}}"), e === "image-semantic" && (n.resolution = "{{imageSize}}", n.aspect_ratio = "{{aspectRatio}}"), e === "video-standard" && (n.resolution = "{{videoResolution}}", n.num_frames = "{{videoFrames}}", n.frame_rate = "{{videoFps}}"), e === "seedance" && (n.resolution = "{{seedanceResolution}}", n.ratio = "{{seedanceRatio}}", n.duration = "{{seedanceDuration}}"), e === "seedance-openai" && (n.resolution = "{{seedanceResolution}}", n.aspect_ratio = "{{aspectRatio}}", n.duration = "{{duration}}", n.generate_audio = "{{generateAudio}}"), t.submit.body = n;
		}), A((e) => e + 1));
	}, le = (e) => {
		e && (U((t) => {
			let n = vt(t.submit.body) ? t.submit.body : {};
			n[e] = {
				$file: "{{imageUrls.0}}",
				filename: "reference.png"
			}, t.submit.bodyEncoding = "multipart", t.submit.body = n;
		}), A((e) => e + 1));
	}, ue = (e) => {
		e && (U((t) => {
			let n = vt(t.submit.body) ? t.submit.body : {};
			n[e] = "{{imageUrls}}", t.submit.bodyEncoding = "json", t.submit.body = n;
		}), A((e) => e + 1));
	}, de = (e) => {
		let t = {
			image_urls: "imageUrls",
			first_image: "firstImage",
			last_image: "lastImage",
			reference_image_urls: "referenceImageUrls",
			video_urls: "videoUrls",
			reference_video_url: "referenceVideoUrl",
			reference_video_urls: "referenceVideoUrls",
			audio_urls: "audioUrls",
			audio_url: "audioUrl",
			reference_audio_urls: "referenceAudioUrls"
		}[e];
		t && (U((n) => {
			let r = vt(n.submit.body) ? n.submit.body : {};
			r[e] = `{{${t}}}`, n.submit.bodyEncoding = "json", n.submit.body = r;
		}), A((e) => e + 1));
	}, fe = (e) => {
		U((t) => {
			t.submit = {
				...t.submit,
				...e
			};
		});
	}, pe = (t) => {
		U((n) => {
			n.poll = {
				...n.poll ?? bt(e.category),
				...t
			};
		});
	}, me = (e) => {
		U((t) => {
			t.response = {
				...t.response,
				...e
			};
		});
	}, he = (e) => {
		U((t) => {
			t.response.result = {
				...t.response.result ?? {},
				...e
			};
		});
	}, ge = (t) => {
		U((n) => {
			let r = n.poll ?? bt(e.category);
			r.response = {
				...r.response,
				...t
			}, n.poll = r;
		});
	}, _e = (t) => {
		U((n) => {
			let r = n.poll ?? bt(e.category);
			r.response.result = {
				...r.response.result,
				...t
			}, n.poll = r;
		});
	}, ve = (t) => {
		U((n) => {
			let r = n.poll ?? bt(e.category);
			r.retry = {
				...c(),
				...r.retry,
				...t
			}, n.poll = r;
		});
	}, J = b.auth ?? { type: "bearer" }, Y = b.poll, ye = b.response.result ?? {}, be = Y?.response, X = be?.result, xe = {
		...c(),
		...Y?.retry
	}, Se = (0, Q.useMemo)(() => {
		if (v !== "custom") return {};
		try {
			let e = JSON.parse(j);
			if (!vt(e)) throw Error("示例变量必须是 JSON 对象");
			return { preview: p({
				baseUrl: "https://preview.invalid",
				protocol: b,
				variables: e
			}) };
		} catch (e) {
			return { error: e instanceof Error ? e.message : "请求预览失败" };
		}
	}, [
		v,
		j,
		b
	]), Ce = b.mode === "async" || b.response.type === "json", we = (0, Q.useMemo)(() => {
		if (v !== "custom" || !Ce) return {};
		try {
			let e = JSON.parse(N);
			if (!vt(e) && !Array.isArray(e)) throw Error("响应示例必须是 JSON 对象或数组");
			return { entries: E(b, e) };
		} catch (e) {
			return { error: e instanceof Error ? e.message : "返回值结构预览失败" };
		}
	}, [
		v,
		b,
		N,
		Ce
	]), Z = async () => {
		if (ct(v, t, n)) return;
		let e;
		try {
			let t = JSON.parse(j);
			if (!vt(t)) throw Error("示例变量必须是 JSON 对象");
			e = t;
		} catch (e) {
			V({
				status: "error",
				message: e instanceof Error ? e.message : "示例变量解析失败"
			});
			return;
		}
		H.current?.abort();
		let r = new AbortController();
		H.current = r, V({ status: "running" });
		try {
			let i = await d({
				apiKey: t,
				baseUrl: n,
				protocol: b,
				variables: e,
				signal: r.signal
			});
			if (r.signal.aborted) return;
			V({
				status: "success",
				message: [
					i.urls?.length ? u("返回 {count} 个结果地址", { count: i.urls.length }) : "",
					i.text ? u("返回文本 {count} 字", { count: i.text.length }) : "",
					i.taskId ? u("任务 ID {id}", { id: i.taskId }) : ""
				].filter(Boolean).join("，") || u("调用成功，但没有解析出结果"),
				detail: _t(i)
			});
		} catch (e) {
			if (r.signal.aborted) return;
			V({
				status: "error",
				message: e instanceof Error ? e.message : u("试跑失败")
			});
		}
	}, Te = () => {
		H.current?.abort(), H.current = null, V({ status: "idle" });
	}, Ee = ct(v, t, n), De = Ee === "legacy-preset" ? u("「自动兼容」不走声明式协议，无法试跑") : Ee === "missing-base-url" ? u("先填写接口地址") : Ee === "missing-api-key" ? u("先填写 API Key") : "";
	return /* @__PURE__ */ (0, $.jsxs)("section", {
		className: "provider-protocol-editor is-small",
		"aria-label": u("{name} 调用协议", { name: e.name }),
		children: [
			/* @__PURE__ */ (0, $.jsxs)("div", {
				className: "provider-protocol-editor-head",
				children: [/* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("模型调用协议") }), /* @__PURE__ */ (0, $.jsx)("strong", { children: e.name })] }), /* @__PURE__ */ (0, $.jsx)(ie, {
					ariaLabel: u("关闭协议设置"),
					onClick: s
				})]
			}),
			/* @__PURE__ */ (0, $.jsxs)("div", {
				className: `provider-protocol-topbar ${e.category === "image" ? "has-reference-mode" : ""}`,
				children: [
					/* @__PURE__ */ (0, $.jsxs)("label", {
						className: "provider-protocol-field",
						children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("协议预设") }), /* @__PURE__ */ (0, $.jsx)("select", {
							value: v,
							onChange: (e) => ae(e.target.value),
							children: ht(e.category).map((e) => /* @__PURE__ */ (0, $.jsx)("option", {
								value: e,
								children: u(lt[e])
							}, e))
						})]
					}),
					e.category === "image" ? /* @__PURE__ */ (0, $.jsxs)("label", {
						className: "provider-protocol-field",
						children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("参考图请求") }), /* @__PURE__ */ (0, $.jsxs)("select", {
							value: e.imageReferenceRequestMode ?? "generation-json-image-urls",
							onChange: (e) => a(e.target.value),
							children: [
								/* @__PURE__ */ (0, $.jsx)("option", {
									value: "generation-json-image-urls",
									children: u("生成接口 JSON（image_urls）")
								}),
								/* @__PURE__ */ (0, $.jsx)("option", {
									value: "generation-json-image-data-urls",
									children: u("生成接口 JSON（image，data URL 数组）")
								}),
								/* @__PURE__ */ (0, $.jsx)("option", {
									value: "edits-multipart",
									children: u("编辑接口 Multipart（图片文件）")
								})
							]
						})]
					}) : null,
					v === "custom" ? /* @__PURE__ */ (0, $.jsxs)("div", {
						className: "provider-protocol-view-tabs",
						role: "tablist",
						"aria-label": u("协议编辑方式"),
						children: [/* @__PURE__ */ (0, $.jsx)("button", {
							type: "button",
							role: "tab",
							"aria-selected": S === "form",
							className: S === "form" ? "is-active" : "",
							onClick: () => G("form"),
							children: u("表单")
						}), /* @__PURE__ */ (0, $.jsx)("button", {
							type: "button",
							role: "tab",
							"aria-selected": S === "json",
							className: S === "json" ? "is-active" : "",
							onClick: () => G("json"),
							children: "JSON"
						})]
					}) : null
				]
			}),
			/* @__PURE__ */ (0, $.jsxs)("div", {
				className: "provider-protocol-testrun",
				"aria-live": "polite",
				children: [
					/* @__PURE__ */ (0, $.jsxs)("div", {
						className: "flex flex-wrap items-center gap-2",
						children: [
							/* @__PURE__ */ (0, $.jsxs)("button", {
								type: "button",
								className: "provider-secondary-btn h-7",
								disabled: !!De || B.status === "running",
								title: De || void 0,
								onClick: () => void Z(),
								children: [/* @__PURE__ */ (0, $.jsx)(K, {
									icon: B.status === "running" ? "mdi:loading" : "mdi:play-circle-outline",
									className: B.status === "running" ? "settings-spin" : void 0,
									width: "14"
								}), B.status === "running" ? u("试跑中") : u("试跑")]
							}),
							B.status === "running" ? /* @__PURE__ */ (0, $.jsx)("button", {
								type: "button",
								className: "provider-text-btn h-7",
								onClick: Te,
								children: u("取消")
							}) : null,
							/* @__PURE__ */ (0, $.jsx)("small", {
								className: "text-[11px] text-canvas-text-muted",
								children: De || u("用上面的示例变量真发一次请求，会产生真实调用与计费")
							})
						]
					}),
					B.message ? /* @__PURE__ */ (0, $.jsxs)("div", {
						className: `provider-catalog-message is-${B.status === "error" ? "error" : "ready"} mt-2`,
						children: [/* @__PURE__ */ (0, $.jsx)(K, {
							icon: B.status === "error" ? "mdi:alert-circle-outline" : "mdi:check-circle-outline",
							width: "14"
						}), /* @__PURE__ */ (0, $.jsx)("span", {
							className: "break-all",
							children: B.message
						})]
					}) : null,
					B.detail ? /* @__PURE__ */ (0, $.jsx)("pre", {
						className: "mt-2 max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md border border-canvas-border bg-canvas-bg/40 p-2.5 font-mono text-[12px] leading-relaxed text-canvas-text-secondary",
						children: B.detail
					}) : null
				]
			}),
			v === "custom" && S === "form" ? /* @__PURE__ */ (0, $.jsxs)("div", {
				className: "provider-protocol-form",
				children: [
					/* @__PURE__ */ (0, $.jsxs)("section", {
						className: "provider-protocol-form-section",
						children: [
							/* @__PURE__ */ (0, $.jsxs)("div", {
								className: "provider-protocol-section-title",
								children: [/* @__PURE__ */ (0, $.jsx)(K, {
									icon: "mdi:shield-key-outline",
									width: "14"
								}), /* @__PURE__ */ (0, $.jsx)("span", { children: u("协议与鉴权") })]
							}),
							/* @__PURE__ */ (0, $.jsxs)("div", {
								className: "provider-protocol-grid is-three",
								children: [
									/* @__PURE__ */ (0, $.jsxs)("label", {
										className: "provider-protocol-field",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("执行模式") }), /* @__PURE__ */ (0, $.jsxs)("select", {
											value: b.mode,
											onChange: (e) => oe(e.target.value),
											children: [/* @__PURE__ */ (0, $.jsx)("option", {
												value: "sync",
												children: u("同步返回")
											}), /* @__PURE__ */ (0, $.jsx)("option", {
												value: "async",
												children: u("异步轮询")
											})]
										})]
									}),
									/* @__PURE__ */ (0, $.jsxs)("label", {
										className: "provider-protocol-field",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("鉴权方式") }), /* @__PURE__ */ (0, $.jsxs)("select", {
											value: J.type,
											onChange: (e) => se(e.target.value),
											children: [
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "bearer",
													children: "Bearer"
												}),
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "header",
													children: u("自定义 Header")
												}),
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "query",
													children: u("Query 参数")
												}),
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "none",
													children: u("无需鉴权")
												})
											]
										})]
									}),
									J.type === "header" || J.type === "query" ? /* @__PURE__ */ (0, $.jsxs)("label", {
										className: "provider-protocol-field",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: J.type === "header" ? u("Header 名称") : u("Query 名称") }), /* @__PURE__ */ (0, $.jsx)("input", {
											value: J.name ?? "",
											onChange: (e) => U((t) => {
												t.auth = {
													...J,
													name: e.target.value
												};
											})
										})]
									}) : /* @__PURE__ */ (0, $.jsxs)("label", {
										className: "provider-protocol-field",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("密钥前缀") }), /* @__PURE__ */ (0, $.jsx)("input", {
											value: J.prefix ?? "",
											placeholder: J.type === "bearer" ? "Bearer " : "",
											disabled: J.type === "none",
											onChange: (e) => U((t) => {
												t.auth = {
													...J,
													prefix: e.target.value
												};
											})
										})]
									})
								]
							}),
							J.type === "header" || J.type === "query" ? /* @__PURE__ */ (0, $.jsxs)("label", {
								className: "provider-protocol-field provider-protocol-prefix-field",
								children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("密钥前缀") }), /* @__PURE__ */ (0, $.jsx)("input", {
									value: J.prefix ?? "",
									placeholder: u("可选"),
									onChange: (e) => U((t) => {
										t.auth = {
											...J,
											prefix: e.target.value
										};
									})
								})]
							}) : null,
							e.category === "text" ? /* @__PURE__ */ (0, $.jsxs)("label", {
								className: "provider-protocol-toggle",
								children: [/* @__PURE__ */ (0, $.jsx)("input", {
									type: "checkbox",
									checked: b.streamFormat === "openai-sse",
									onChange: (e) => U((t) => {
										e.target.checked ? t.streamFormat = "openai-sse" : delete t.streamFormat;
									})
								}), /* @__PURE__ */ (0, $.jsx)("span", { children: u("OpenAI SSE 对话兼容") })]
							}) : null
						]
					}),
					/* @__PURE__ */ (0, $.jsxs)("section", {
						className: "provider-protocol-form-section",
						children: [
							/* @__PURE__ */ (0, $.jsxs)("div", {
								className: "provider-protocol-section-title",
								children: [/* @__PURE__ */ (0, $.jsx)(K, {
									icon: "mdi:send-outline",
									width: "14"
								}), /* @__PURE__ */ (0, $.jsx)("span", { children: u("提交请求") })]
							}),
							/* @__PURE__ */ (0, $.jsxs)("div", {
								className: "provider-protocol-grid is-request",
								children: [
									/* @__PURE__ */ (0, $.jsxs)("label", {
										className: "provider-protocol-field",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("方法") }), /* @__PURE__ */ (0, $.jsxs)("select", {
											value: b.submit.method,
											onChange: (e) => fe({ method: e.target.value }),
											children: [/* @__PURE__ */ (0, $.jsx)("option", {
												value: "POST",
												children: "POST"
											}), /* @__PURE__ */ (0, $.jsx)("option", {
												value: "GET",
												children: "GET"
											})]
										})]
									}),
									/* @__PURE__ */ (0, $.jsxs)("label", {
										className: "provider-protocol-field",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("路径") }), /* @__PURE__ */ (0, $.jsx)("input", {
											value: b.submit.path,
											onChange: (e) => fe({ path: e.target.value })
										})]
									}),
									/* @__PURE__ */ (0, $.jsxs)("label", {
										className: "provider-protocol-field",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("路径基准") }), /* @__PURE__ */ (0, $.jsxs)("select", {
											value: b.submit.pathMode ?? "append",
											onChange: (e) => fe({ pathMode: e.target.value }),
											children: [/* @__PURE__ */ (0, $.jsx)("option", {
												value: "append",
												children: u("连接地址")
											}), /* @__PURE__ */ (0, $.jsx)("option", {
												value: "origin",
												children: u("域名根路径")
											})]
										})]
									})
								]
							}),
							/* @__PURE__ */ (0, $.jsxs)("div", {
								className: "provider-protocol-grid",
								children: [
									/* @__PURE__ */ (0, $.jsxs)("label", {
										className: "provider-protocol-field",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("请求体编码") }), /* @__PURE__ */ (0, $.jsxs)("select", {
											value: b.submit.bodyEncoding ?? "json",
											onChange: (e) => fe({ bodyEncoding: e.target.value }),
											children: [
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "json",
													children: "JSON"
												}),
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "form-urlencoded",
													children: "Form URL Encoded"
												}),
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "multipart",
													children: "Multipart Form Data"
												})
											]
										})]
									}),
									e.category === "image" || e.category === "video" ? /* @__PURE__ */ (0, $.jsxs)("label", {
										className: "provider-protocol-field provider-protocol-size-insert",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("插入尺寸字段") }), /* @__PURE__ */ (0, $.jsxs)("select", {
											value: "",
											onChange: (e) => q(e.target.value),
											children: [
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "",
													children: u("选择映射")
												}),
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "size",
													children: "size: widthxheight"
												}),
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "dimensions",
													children: "width + height"
												}),
												e.category === "image" ? /* @__PURE__ */ (0, $.jsx)("option", {
													value: "image-semantic",
													children: "resolution + aspect_ratio"
												}) : null,
												e.category === "video" ? /* @__PURE__ */ (0, $.jsx)("option", {
													value: "video-standard",
													children: "resolution + num_frames + frame_rate"
												}) : null,
												e.category === "video" ? /* @__PURE__ */ (0, $.jsx)("option", {
													value: "seedance",
													children: "Seedance resolution + ratio + duration"
												}) : null,
												e.category === "video" ? /* @__PURE__ */ (0, $.jsx)("option", {
													value: "seedance-openai",
													children: "Seedance resolution + aspect_ratio + duration"
												}) : null
											]
										})]
									}) : null,
									e.category === "image" && b.submit.bodyEncoding === "multipart" ? /* @__PURE__ */ (0, $.jsxs)("label", {
										className: "provider-protocol-field",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("插入文件字段") }), /* @__PURE__ */ (0, $.jsxs)("select", {
											value: "",
											onChange: (e) => le(e.target.value),
											children: [
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "",
													children: u("选择字段")
												}),
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "image",
													children: "image: imageUrls.0"
												}),
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "file",
													children: "file: imageUrls.0"
												}),
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "reference_image",
													children: "reference_image: imageUrls.0"
												})
											]
										})]
									}) : null,
									e.category === "image" && b.submit.bodyEncoding !== "multipart" ? /* @__PURE__ */ (0, $.jsxs)("label", {
										className: "provider-protocol-field",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("插入参考图字段") }), /* @__PURE__ */ (0, $.jsxs)("select", {
											value: "",
											onChange: (e) => ue(e.target.value),
											children: [
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "",
													children: u("选择字段")
												}),
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "image",
													children: "image: imageUrls"
												}),
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "image_urls",
													children: "image_urls: imageUrls"
												})
											]
										})]
									}) : null,
									e.category === "video" && b.submit.bodyEncoding !== "multipart" ? /* @__PURE__ */ (0, $.jsxs)("label", {
										className: "provider-protocol-field",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("插入参考素材字段") }), /* @__PURE__ */ (0, $.jsxs)("select", {
											value: "",
											onChange: (e) => de(e.target.value),
											children: [
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "",
													children: u("选择字段")
												}),
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "image_urls",
													children: "image_urls"
												}),
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "first_image",
													children: "first_image"
												}),
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "last_image",
													children: "last_image"
												}),
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "reference_image_urls",
													children: "reference_image_urls"
												}),
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "video_urls",
													children: "video_urls"
												}),
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "reference_video_url",
													children: "reference_video_url"
												}),
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "reference_video_urls",
													children: "reference_video_urls"
												}),
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "audio_urls",
													children: "audio_urls"
												}),
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "audio_url",
													children: "audio_url"
												}),
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "reference_audio_urls",
													children: "reference_audio_urls"
												})
											]
										})]
									}) : null
								]
							}),
							/* @__PURE__ */ (0, $.jsxs)("div", {
								className: "provider-protocol-json-grid",
								children: [/* @__PURE__ */ (0, $.jsx)(yt, {
									fieldId: "submit-headers",
									label: u("请求头 JSON"),
									value: b.submit.headers,
									rows: 4,
									onValidityChange: re,
									onChange: (e) => fe({ headers: e })
								}), /* @__PURE__ */ (0, $.jsx)(yt, {
									fieldId: "submit-query",
									label: u("Query JSON"),
									value: b.submit.query,
									rows: 4,
									onValidityChange: re,
									onChange: (e) => fe({ query: e })
								})]
							}),
							/* @__PURE__ */ (0, $.jsx)(yt, {
								fieldId: "submit-body",
								label: u("请求体 JSON"),
								value: b.submit.body,
								kind: "value",
								rows: 8,
								onValidityChange: re,
								onChange: (e) => fe({ body: e })
							}, `submit-body-${k}`)
						]
					}),
					/* @__PURE__ */ (0, $.jsxs)("section", {
						className: "provider-protocol-form-section",
						children: [
							/* @__PURE__ */ (0, $.jsxs)("div", {
								className: "provider-protocol-section-title",
								children: [/* @__PURE__ */ (0, $.jsx)(K, {
									icon: "mdi:code-json",
									width: "14"
								}), /* @__PURE__ */ (0, $.jsx)("span", { children: b.mode === "sync" ? u("返回值结构") : u("任务与返回值结构") })]
							}),
							b.mode === "sync" ? /* @__PURE__ */ (0, $.jsxs)($.Fragment, { children: [/* @__PURE__ */ (0, $.jsxs)("div", {
								className: "provider-protocol-grid is-three",
								children: [
									/* @__PURE__ */ (0, $.jsxs)("label", {
										className: "provider-protocol-field",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("响应类型") }), /* @__PURE__ */ (0, $.jsxs)("select", {
											value: b.response.type,
											onChange: (e) => ce(e.target.value),
											children: [
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "json",
													children: "JSON"
												}),
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "text",
													children: u("原始文本")
												}),
												/* @__PURE__ */ (0, $.jsx)("option", {
													value: "binary",
													children: u("原始二进制")
												})
											]
										})]
									}),
									b.response.type === "binary" ? /* @__PURE__ */ (0, $.jsxs)("label", {
										className: "provider-protocol-field",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("备用 MIME 类型") }), /* @__PURE__ */ (0, $.jsx)("input", {
											value: ye.mimeType ?? "",
											placeholder: e.category === "video" ? "video/mp4" : e.category === "audio" ? "audio/mpeg" : "image/png",
											onChange: (e) => he({ mimeType: e.target.value || void 0 })
										})]
									}) : null,
									/* @__PURE__ */ (0, $.jsxs)("label", {
										className: "provider-protocol-field",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("错误路径") }), /* @__PURE__ */ (0, $.jsx)("input", {
											value: b.response.errorPath ?? "",
											onChange: (e) => me({ errorPath: e.target.value || void 0 })
										})]
									})
								]
							}), b.response.type === "json" ? /* @__PURE__ */ (0, $.jsxs)("div", {
								className: "provider-protocol-grid is-three",
								children: [
									/* @__PURE__ */ (0, $.jsxs)("label", {
										className: "provider-protocol-field",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("URL 结果路径") }), /* @__PURE__ */ (0, $.jsx)("input", {
											value: ye.urlPath ?? "",
											onChange: (e) => he({ urlPath: e.target.value || void 0 })
										})]
									}),
									/* @__PURE__ */ (0, $.jsxs)("label", {
										className: "provider-protocol-field",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("文本结果路径") }), /* @__PURE__ */ (0, $.jsx)("input", {
											value: ye.textPath ?? "",
											onChange: (e) => he({ textPath: e.target.value || void 0 })
										})]
									}),
									/* @__PURE__ */ (0, $.jsxs)("label", {
										className: "provider-protocol-field",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("Base64 结果路径") }), /* @__PURE__ */ (0, $.jsx)("input", {
											value: ye.base64Path ?? "",
											onChange: (e) => he({ base64Path: e.target.value || void 0 })
										})]
									}),
									ye.base64Path ? /* @__PURE__ */ (0, $.jsxs)("label", {
										className: "provider-protocol-field",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("Base64 MIME 类型") }), /* @__PURE__ */ (0, $.jsx)("input", {
											value: ye.mimeType ?? "",
											placeholder: e.category === "video" ? "video/mp4" : e.category === "audio" ? "audio/mpeg" : "image/png",
											onChange: (e) => he({ mimeType: e.target.value || void 0 })
										})]
									}) : null
								]
							}) : null] }) : Y ? /* @__PURE__ */ (0, $.jsxs)($.Fragment, { children: [
								/* @__PURE__ */ (0, $.jsxs)("div", {
									className: "provider-protocol-grid",
									children: [
										/* @__PURE__ */ (0, $.jsxs)("label", {
											className: "provider-protocol-field",
											children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("任务 ID 路径") }), /* @__PURE__ */ (0, $.jsx)("input", {
												value: b.response.taskIdPath ?? "",
												onChange: (e) => me({ taskIdPath: e.target.value })
											})]
										}),
										/* @__PURE__ */ (0, $.jsxs)("label", {
											className: "provider-protocol-field",
											children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("轮询方法") }), /* @__PURE__ */ (0, $.jsxs)("select", {
												value: Y.method,
												onChange: (e) => pe({ method: e.target.value }),
												children: [/* @__PURE__ */ (0, $.jsx)("option", {
													value: "GET",
													children: "GET"
												}), /* @__PURE__ */ (0, $.jsx)("option", {
													value: "POST",
													children: "POST"
												})]
											})]
										}),
										/* @__PURE__ */ (0, $.jsxs)("label", {
											className: "provider-protocol-field",
											children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("轮询间隔 ms") }), /* @__PURE__ */ (0, $.jsx)("input", {
												type: "number",
												min: 1e3,
												max: 6e4,
												value: Y.intervalMs ?? 3e3,
												onChange: (e) => pe({ intervalMs: Number(e.target.value) })
											})]
										}),
										/* @__PURE__ */ (0, $.jsxs)("label", {
											className: "provider-protocol-field",
											children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("轮询请求体编码") }), /* @__PURE__ */ (0, $.jsxs)("select", {
												value: Y.bodyEncoding ?? "json",
												onChange: (e) => pe({ bodyEncoding: e.target.value }),
												children: [/* @__PURE__ */ (0, $.jsx)("option", {
													value: "json",
													children: "JSON"
												}), /* @__PURE__ */ (0, $.jsx)("option", {
													value: "form-urlencoded",
													children: "Form URL Encoded"
												})]
											})]
										})
									]
								}),
								/* @__PURE__ */ (0, $.jsxs)("div", {
									className: "provider-protocol-grid is-request",
									children: [/* @__PURE__ */ (0, $.jsxs)("label", {
										className: "provider-protocol-field provider-protocol-path-field",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("轮询路径") }), /* @__PURE__ */ (0, $.jsx)("input", {
											value: Y.path,
											onChange: (e) => pe({ path: e.target.value })
										})]
									}), /* @__PURE__ */ (0, $.jsxs)("label", {
										className: "provider-protocol-field",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("路径基准") }), /* @__PURE__ */ (0, $.jsxs)("select", {
											value: Y.pathMode ?? "append",
											onChange: (e) => pe({ pathMode: e.target.value }),
											children: [/* @__PURE__ */ (0, $.jsx)("option", {
												value: "append",
												children: u("连接地址")
											}), /* @__PURE__ */ (0, $.jsx)("option", {
												value: "origin",
												children: u("域名根路径")
											})]
										})]
									})]
								}),
								/* @__PURE__ */ (0, $.jsxs)("div", {
									className: "provider-protocol-json-grid",
									children: [/* @__PURE__ */ (0, $.jsx)(yt, {
										fieldId: "poll-headers",
										label: u("轮询请求头 JSON"),
										value: Y.headers,
										rows: 4,
										onValidityChange: re,
										onChange: (e) => pe({ headers: e })
									}), /* @__PURE__ */ (0, $.jsx)(yt, {
										fieldId: "poll-query",
										label: u("轮询 Query JSON"),
										value: Y.query,
										rows: 4,
										onValidityChange: re,
										onChange: (e) => pe({ query: e })
									})]
								}),
								/* @__PURE__ */ (0, $.jsx)(yt, {
									fieldId: "poll-body",
									label: u("轮询请求体 JSON"),
									value: Y.body,
									kind: "value",
									rows: 5,
									onValidityChange: re,
									onChange: (e) => pe({ body: e })
								}),
								/* @__PURE__ */ (0, $.jsxs)("div", {
									className: "provider-protocol-grid is-three",
									children: [
										/* @__PURE__ */ (0, $.jsxs)("label", {
											className: "provider-protocol-field",
											children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("状态路径") }), /* @__PURE__ */ (0, $.jsx)("input", {
												value: be?.statusPath ?? "",
												onChange: (e) => ge({ statusPath: e.target.value })
											})]
										}),
										/* @__PURE__ */ (0, $.jsxs)("label", {
											className: "provider-protocol-field",
											children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("成功状态") }), /* @__PURE__ */ (0, $.jsx)("input", {
												value: be?.successValues.join(", ") ?? "",
												onChange: (e) => ge({ successValues: e.target.value.split(",").map((e) => e.trim()).filter(Boolean) })
											})]
										}),
										/* @__PURE__ */ (0, $.jsxs)("label", {
											className: "provider-protocol-field",
											children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("失败状态") }), /* @__PURE__ */ (0, $.jsx)("input", {
												value: be?.failureValues.join(", ") ?? "",
												onChange: (e) => ge({ failureValues: e.target.value.split(",").map((e) => e.trim()).filter(Boolean) })
											})]
										})
									]
								}),
								/* @__PURE__ */ (0, $.jsxs)("div", {
									className: "provider-protocol-grid is-three",
									children: [
										/* @__PURE__ */ (0, $.jsxs)("label", {
											className: "provider-protocol-field",
											children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("URL 结果路径") }), /* @__PURE__ */ (0, $.jsx)("input", {
												value: X?.urlPath ?? "",
												onChange: (e) => _e({ urlPath: e.target.value || void 0 })
											})]
										}),
										/* @__PURE__ */ (0, $.jsxs)("label", {
											className: "provider-protocol-field",
											children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("文本结果路径") }), /* @__PURE__ */ (0, $.jsx)("input", {
												value: X?.textPath ?? "",
												onChange: (e) => _e({ textPath: e.target.value || void 0 })
											})]
										}),
										/* @__PURE__ */ (0, $.jsxs)("label", {
											className: "provider-protocol-field",
											children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("Base64 结果路径") }), /* @__PURE__ */ (0, $.jsx)("input", {
												value: X?.base64Path ?? "",
												onChange: (e) => _e({ base64Path: e.target.value || void 0 })
											})]
										}),
										X?.base64Path ? /* @__PURE__ */ (0, $.jsxs)("label", {
											className: "provider-protocol-field",
											children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("Base64 MIME 类型") }), /* @__PURE__ */ (0, $.jsx)("input", {
												value: X.mimeType ?? "",
												placeholder: e.category === "video" ? "video/mp4" : e.category === "audio" ? "audio/mpeg" : "image/png",
												onChange: (e) => _e({ mimeType: e.target.value || void 0 })
											})]
										}) : null
									]
								}),
								/* @__PURE__ */ (0, $.jsxs)("div", {
									className: "provider-protocol-grid",
									children: [/* @__PURE__ */ (0, $.jsxs)("label", {
										className: "provider-protocol-field",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("错误路径") }), /* @__PURE__ */ (0, $.jsx)("input", {
											value: be?.errorPath ?? "",
											onChange: (e) => ge({ errorPath: e.target.value || void 0 })
										})]
									}), /* @__PURE__ */ (0, $.jsxs)("label", {
										className: "provider-protocol-field",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("进度路径") }), /* @__PURE__ */ (0, $.jsx)("input", {
											value: be?.progressPath ?? "",
											onChange: (e) => ge({ progressPath: e.target.value || void 0 })
										})]
									})]
								}),
								/* @__PURE__ */ (0, $.jsxs)("details", {
									className: "border-t border-canvas-border pt-2.5 text-[12px] text-canvas-text-muted",
									children: [/* @__PURE__ */ (0, $.jsx)("summary", {
										className: "w-fit cursor-pointer select-none text-canvas-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-canvas-text-muted",
										children: u("轮询与重试策略")
									}), /* @__PURE__ */ (0, $.jsxs)("div", {
										className: "mt-2 flex min-w-0 flex-col gap-2",
										children: [
											/* @__PURE__ */ (0, $.jsxs)("div", {
												className: "provider-protocol-grid is-three",
												children: [
													/* @__PURE__ */ (0, $.jsxs)("label", {
														className: "provider-protocol-field",
														children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("最大轮询次数") }), /* @__PURE__ */ (0, $.jsx)("input", {
															type: "number",
															min: 1,
															max: 1e4,
															value: Y.maxAttempts ?? "",
															onChange: (e) => pe({ maxAttempts: Number.isFinite(e.target.valueAsNumber) ? e.target.valueAsNumber : void 0 })
														})]
													}),
													/* @__PURE__ */ (0, $.jsxs)("label", {
														className: "provider-protocol-field",
														children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("最长时长（秒）") }), /* @__PURE__ */ (0, $.jsx)("input", {
															type: "number",
															min: 1,
															max: 86400,
															value: Y.maxDurationMs === void 0 ? "" : Y.maxDurationMs / 1e3,
															onChange: (e) => pe({ maxDurationMs: Number.isFinite(e.target.valueAsNumber) ? Math.round(e.target.valueAsNumber * 1e3) : void 0 })
														})]
													}),
													/* @__PURE__ */ (0, $.jsxs)("label", {
														className: "provider-protocol-field",
														children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("错误重试次数") }), /* @__PURE__ */ (0, $.jsx)("input", {
															type: "number",
															min: 0,
															max: 10,
															value: xe.maxRetries,
															onChange: (e) => ve({ maxRetries: e.target.valueAsNumber })
														})]
													})
												]
											}),
											/* @__PURE__ */ (0, $.jsxs)("div", {
												className: "provider-protocol-grid is-three",
												children: [
													/* @__PURE__ */ (0, $.jsxs)("label", {
														className: "provider-protocol-field",
														children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("退避策略") }), /* @__PURE__ */ (0, $.jsxs)("select", {
															value: xe.backoff,
															onChange: (e) => ve({ backoff: e.target.value }),
															children: [
																/* @__PURE__ */ (0, $.jsx)("option", {
																	value: "fixed",
																	children: u("固定间隔")
																}),
																/* @__PURE__ */ (0, $.jsx)("option", {
																	value: "linear",
																	children: u("线性增加")
																}),
																/* @__PURE__ */ (0, $.jsx)("option", {
																	value: "exponential",
																	children: u("指数增加")
																})
															]
														})]
													}),
													/* @__PURE__ */ (0, $.jsxs)("label", {
														className: "provider-protocol-field",
														children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("最大重试间隔 ms") }), /* @__PURE__ */ (0, $.jsx)("input", {
															type: "number",
															min: 1e3,
															max: 3e5,
															value: xe.maxDelayMs,
															onChange: (e) => ve({ maxDelayMs: e.target.valueAsNumber })
														})]
													}),
													/* @__PURE__ */ (0, $.jsxs)("label", {
														className: "provider-protocol-field",
														children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("重试 HTTP 状态码") }), /* @__PURE__ */ (0, $.jsx)("input", {
															value: xe.httpStatuses.join(", "),
															onChange: (e) => ve({ httpStatuses: e.target.value.split(",").map((e) => e.trim()).filter(Boolean).map(Number) })
														})]
													})
												]
											}),
											/* @__PURE__ */ (0, $.jsxs)("div", {
												className: "flex flex-wrap items-center gap-x-4 gap-y-2",
												children: [/* @__PURE__ */ (0, $.jsxs)("label", {
													className: "provider-protocol-toggle",
													children: [/* @__PURE__ */ (0, $.jsx)("input", {
														type: "checkbox",
														checked: xe.honorRetryAfter,
														onChange: (e) => ve({ honorRetryAfter: e.target.checked })
													}), /* @__PURE__ */ (0, $.jsx)("span", { children: u("遵循 Retry-After") })]
												}), /* @__PURE__ */ (0, $.jsxs)("label", {
													className: "provider-protocol-toggle",
													children: [/* @__PURE__ */ (0, $.jsx)("input", {
														type: "checkbox",
														checked: xe.retryNetworkErrors,
														onChange: (e) => ve({ retryNetworkErrors: e.target.checked })
													}), /* @__PURE__ */ (0, $.jsx)("span", { children: u("重试网络错误") })]
												})]
											})
										]
									})]
								})
							] }) : null,
							Ce ? /* @__PURE__ */ (0, $.jsxs)("details", {
								className: "provider-protocol-response-preview",
								open: !0,
								children: [/* @__PURE__ */ (0, $.jsx)("summary", { children: u("响应示例与路径校验") }), /* @__PURE__ */ (0, $.jsxs)("div", {
									className: "provider-protocol-response-preview-content",
									children: [/* @__PURE__ */ (0, $.jsxs)("div", {
										className: "provider-protocol-field min-w-0",
										children: [
											/* @__PURE__ */ (0, $.jsx)("label", {
												htmlFor: L,
												children: u("响应示例 JSON")
											}),
											/* @__PURE__ */ (0, $.jsx)("textarea", {
												id: L,
												value: N,
												rows: 8,
												spellCheck: !1,
												autoComplete: "off",
												"aria-invalid": !!we.error,
												"aria-describedby": we.error ? R : void 0,
												onChange: (e) => P(e.target.value)
											}),
											we.error ? /* @__PURE__ */ (0, $.jsx)("small", {
												id: R,
												role: "alert",
												children: we.error
											}) : null
										]
									}), /* @__PURE__ */ (0, $.jsxs)("div", {
										className: "provider-protocol-response-results",
										"aria-live": "polite",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("路径解析结果") }), we.entries?.map((e) => /* @__PURE__ */ (0, $.jsxs)("div", {
											className: "provider-protocol-response-result",
											children: [/* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsx)("strong", { children: e.label }), /* @__PURE__ */ (0, $.jsx)("code", { children: e.path })] }), /* @__PURE__ */ (0, $.jsx)("code", {
												className: e.matchCount > 0 ? "is-matched" : "",
												children: e.matchCount > 0 ? e.values.join(" | ") : u("未匹配")
											})]
										}, e.id))]
									})]
								})]
							}) : null
						]
					}),
					/* @__PURE__ */ (0, $.jsxs)("details", {
						className: "provider-protocol-variables",
						children: [/* @__PURE__ */ (0, $.jsx)("summary", { children: u("可用变量") }), /* @__PURE__ */ (0, $.jsxs)("div", { children: [ut[e.category].map((e) => /* @__PURE__ */ (0, $.jsx)("code", {
							"data-tooltip": u(ft(e)),
							children: `{{${e}}}`
						}, e)), b.mode === "async" ? /* @__PURE__ */ (0, $.jsx)("code", {
							"data-tooltip": u(dt),
							children: "{{submit.task_id}}"
						}) : null] })]
					}),
					/* @__PURE__ */ (0, $.jsxs)("details", {
						className: "border-t border-canvas-border pt-2.5 text-[12px] text-canvas-text-muted",
						children: [/* @__PURE__ */ (0, $.jsx)("summary", {
							className: "w-fit cursor-pointer select-none text-canvas-text-secondary focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-canvas-text-muted",
							children: u("本地请求预览")
						}), /* @__PURE__ */ (0, $.jsxs)("div", {
							className: "mt-2 grid min-w-0 grid-cols-2 gap-2 max-[700px]:grid-cols-1",
							children: [/* @__PURE__ */ (0, $.jsxs)("div", {
								className: "provider-protocol-field min-w-0",
								children: [
									/* @__PURE__ */ (0, $.jsx)("label", {
										htmlFor: F,
										className: "text-[12px] text-canvas-text-muted",
										children: u("示例变量 JSON")
									}),
									/* @__PURE__ */ (0, $.jsx)("textarea", {
										id: F,
										value: j,
										rows: 10,
										spellCheck: !1,
										autoComplete: "off",
										"aria-invalid": !!Se.error,
										"aria-describedby": Se.error ? I : void 0,
										onChange: (e) => M(e.target.value)
									}),
									Se.error ? /* @__PURE__ */ (0, $.jsx)("small", {
										id: I,
										role: "alert",
										className: "text-[var(--danger-light)]",
										children: Se.error
									}) : null
								]
							}), /* @__PURE__ */ (0, $.jsxs)("div", {
								className: "flex min-w-0 flex-col gap-2",
								"aria-live": "polite",
								children: [
									/* @__PURE__ */ (0, $.jsxs)("div", {
										className: "flex min-w-0 items-center gap-2 rounded-md border border-canvas-border bg-canvas-bg/40 px-2.5 py-2",
										children: [/* @__PURE__ */ (0, $.jsx)("span", {
											className: "shrink-0 font-mono text-[12px] font-semibold text-canvas-text-secondary",
											children: Se.preview?.method ?? "--"
										}), /* @__PURE__ */ (0, $.jsx)("code", {
											className: "min-w-0 break-all text-[12px] text-canvas-text",
											children: Se.preview?.relativeUrl ?? u("请求路径不可用")
										})]
									}),
									/* @__PURE__ */ (0, $.jsxs)("div", {
										className: "provider-protocol-field min-w-0",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("Header 预览") }), /* @__PURE__ */ (0, $.jsx)("pre", {
											className: "max-h-32 min-h-20 overflow-auto whitespace-pre-wrap break-all rounded-md border border-canvas-border bg-canvas-bg/40 p-2.5 font-mono text-[12px] leading-relaxed text-canvas-text-secondary",
											children: Se.preview ? _t(Se.preview.headers) : "{}"
										})]
									}),
									/* @__PURE__ */ (0, $.jsxs)("div", {
										className: "provider-protocol-field min-w-0",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: u("Body 预览") }), /* @__PURE__ */ (0, $.jsx)("pre", {
											className: "max-h-48 min-h-28 overflow-auto whitespace-pre-wrap break-all rounded-md border border-canvas-border bg-canvas-bg/40 p-2.5 font-mono text-[12px] leading-relaxed text-canvas-text-secondary",
											children: Se.preview?.body === void 0 ? u("无请求体") : _t(Se.preview.body)
										})]
									})
								]
							})]
						})]
					})
				]
			}) : null,
			v === "custom" && S === "json" ? /* @__PURE__ */ (0, $.jsxs)("div", {
				className: "provider-protocol-field provider-protocol-full-json",
				children: [
					/* @__PURE__ */ (0, $.jsxs)("div", {
						className: "provider-protocol-json-variables",
						"aria-label": u("当前模型可用变量"),
						children: [/* @__PURE__ */ (0, $.jsxs)("div", {
							className: "provider-protocol-json-guide-title",
							children: [
								/* @__PURE__ */ (0, $.jsx)(K, {
									icon: "mdi:code-braces",
									width: "13"
								}),
								/* @__PURE__ */ (0, $.jsx)("strong", { children: u("可用变量") }),
								/* @__PURE__ */ (0, $.jsx)("span", { children: u("可放入 path、query、headers 或 body，调用时会替换为节点中的实际值") }),
								/* @__PURE__ */ (0, $.jsx)("span", { children: u("（鼠标在变量上悬浮可查看详细说明）") })
							]
						}), /* @__PURE__ */ (0, $.jsxs)("div", {
							className: "provider-protocol-json-variable-list",
							children: [ut[e.category].map((e) => /* @__PURE__ */ (0, $.jsx)("code", {
								"data-tooltip": u(ft(e)),
								children: `{{${e}}}`
							}, e)), b.mode === "async" ? /* @__PURE__ */ (0, $.jsx)("code", {
								"data-tooltip": u(dt),
								children: "{{submit.task_id}}"
							}) : null]
						})]
					}),
					/* @__PURE__ */ (0, $.jsx)("label", {
						htmlFor: ee,
						children: u("声明式协议 JSON")
					}),
					/* @__PURE__ */ (0, $.jsx)("textarea", {
						id: ee,
						value: w,
						spellCheck: !1,
						"aria-invalid": !!D,
						"aria-describedby": te,
						onChange: (e) => W(e.target.value)
					}),
					/* @__PURE__ */ (0, $.jsxs)("aside", {
						id: te,
						className: "provider-protocol-json-help",
						children: [
							/* @__PURE__ */ (0, $.jsxs)("div", {
								className: "provider-protocol-json-guide-title",
								children: [
									/* @__PURE__ */ (0, $.jsx)(K, {
										icon: "mdi:information-outline",
										width: "13"
									}),
									/* @__PURE__ */ (0, $.jsx)("strong", { children: u("配置说明") }),
									/* @__PURE__ */ (0, $.jsx)("span", { children: u("不确定如何填写时，可先在“表单”模式配置，再切回 JSON 查看结果") })
								]
							}),
							/* @__PURE__ */ (0, $.jsxs)("dl", { children: [
								/* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsxs)("dt", { children: [
									/* @__PURE__ */ (0, $.jsx)("code", { children: "version" }),
									" / ",
									/* @__PURE__ */ (0, $.jsx)("code", { children: "mode" })
								] }), /* @__PURE__ */ (0, $.jsx)("dd", { children: u("协议版本固定为 2；mode 使用 sync 同步返回或 async 异步轮询。") })] }),
								/* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsx)("dt", { children: /* @__PURE__ */ (0, $.jsx)("code", { children: "auth" }) }), /* @__PURE__ */ (0, $.jsx)("dd", { children: u("定义 API Key 的注入方式。只配置 type、name、prefix，不要把真实密钥写进 JSON。") })] }),
								/* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsx)("dt", { children: /* @__PURE__ */ (0, $.jsx)("code", { children: "submit" }) }), /* @__PURE__ */ (0, $.jsx)("dd", { children: u("首次请求规则，包括 method、path、query、headers、bodyEncoding 和 body。") })] }),
								/* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsx)("dt", { children: /* @__PURE__ */ (0, $.jsx)("code", { children: "response" }) }), /* @__PURE__ */ (0, $.jsx)("dd", { children: u("首次响应的解析规则。同步模式从 result 取结果；异步模式用 taskIdPath 取得任务 ID。") })] }),
								/* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsx)("dt", { children: /* @__PURE__ */ (0, $.jsx)("code", { children: "poll" }) }), /* @__PURE__ */ (0, $.jsx)("dd", { children: u("仅异步模式需要，定义查询请求、完成/失败状态、结果路径、查询间隔与重试策略。") })] }),
								/* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsx)("dt", { children: u("响应路径") }), /* @__PURE__ */ (0, $.jsx)("dd", { children: u("用点号读取嵌套字段，例如 data.0.url；用 data.*.url 读取数组内全部 URL。") })] })
							] }),
							b.mode === "async" ? /* @__PURE__ */ (0, $.jsx)("p", { children: u("异步流程先按 response.taskIdPath 取得任务 ID，再在 poll 中通过 {{submit.task_id}} 引用。") }) : null
						]
					})
				]
			}) : null,
			D ? /* @__PURE__ */ (0, $.jsxs)("div", {
				className: "provider-protocol-error",
				role: "alert",
				children: [/* @__PURE__ */ (0, $.jsx)(K, {
					icon: "mdi:alert-circle-outline",
					width: "14"
				}), /* @__PURE__ */ (0, $.jsx)("span", { children: D })]
			}) : null
		]
	});
}
//#endregion
//#region src/components/settings/ProtocolImportPanel.tsx
var St = {
	fetch: "Fetch",
	axios: "Axios",
	curl: "cURL",
	python: "Python",
	"raw-http": "Raw HTTP",
	openapi: "OpenAPI JSON",
	json: "JSON 响应"
}, Ct = {
	high: "高置信度",
	medium: "需要检查",
	low: "低置信度"
}, wt = {
	high: "border-emerald-500/25 bg-emerald-500/10 text-emerald-300",
	medium: "border-amber-500/25 bg-amber-500/10 text-amber-300",
	low: "border-red-500/25 bg-red-500/10 text-red-300"
}, Tt = {
	submitRequest: "",
	submitResponse: "",
	pollRequest: "",
	pollResponse: ""
};
function Et({ label: e, value: t, placeholder: n, onChange: r }) {
	return /* @__PURE__ */ (0, $.jsxs)("label", {
		className: "flex min-w-0 flex-col gap-1.5",
		children: [/* @__PURE__ */ (0, $.jsxs)("span", {
			className: "flex items-center gap-1.5 text-canvas-text-secondary",
			children: [/* @__PURE__ */ (0, $.jsx)(K, {
				icon: "mdi:code-json",
				width: "14",
				className: "text-canvas-text-muted"
			}), e]
		}), /* @__PURE__ */ (0, $.jsx)("textarea", {
			value: t,
			rows: 8,
			spellCheck: !1,
			autoComplete: "off",
			placeholder: n,
			className: "min-h-36 w-full resize-y rounded-md border border-[var(--border-secondary)] bg-[var(--theme-surface)] px-2.5 py-2 font-mono text-[12px] leading-relaxed text-[var(--theme-text)] outline-none transition-colors placeholder:text-[var(--theme-text-muted)] hover:border-[var(--theme-text-muted)] focus:border-indigo-400/70",
			onChange: (e) => r(e.target.value)
		})]
	});
}
function Dt({ onApply: e, onClose: t }) {
	let n = i(), [r, a] = (0, Q.useState)(Tt), [o, s] = (0, Q.useState)(!1), [c, l] = (0, Q.useState)(null), [u, d] = (0, Q.useState)(null), [f, p] = (0, Q.useState)(!1), m = !!c?.baseUrl && !!c.modelId && !!c.category && !!c.protocol && (c.confidence !== "low" || f), h = (0, Q.useMemo)(() => {
		if (!c?.protocol) return "";
		let e = c.protocol, t = [`${e.submit.method} ${e.submit.path}`];
		return e.mode === "async" && e.poll && t.push(`${e.poll.method} ${e.poll.path}`), t.join("  ->  ");
	}, [c]), g = Object.values(r).some((e) => !!e?.trim()), _ = !!r.submitRequest.trim() && !!r.submitResponse.trim() && (!o || !!r.pollRequest?.trim() && !!r.pollResponse?.trim()), v = (e, t) => {
		a((n) => ({
			...n,
			[e]: t
		})), l(null), d(null), p(!1);
	}, y = (e) => {
		try {
			l(_e({
				submitRequest: r.submitRequest,
				submitResponse: r.submitResponse,
				...o ? {
					pollRequest: r.pollRequest,
					pollResponse: r.pollResponse
				} : {}
			}, e ? { category: e } : void 0)), d(null), p(!1);
		} catch (e) {
			l(null), d(e instanceof Error ? e.message : n("接口文档解析失败")), p(!1);
		}
	};
	return /* @__PURE__ */ (0, $.jsxs)("section", {
		className: "mb-3 flex min-w-0 flex-col gap-3 border-y border-canvas-border bg-black/10 px-3 py-3 text-[12px]",
		"aria-label": n("从接口文档导入"),
		children: [
			/* @__PURE__ */ (0, $.jsxs)("div", {
				className: "flex min-w-0 items-start justify-between gap-3",
				children: [/* @__PURE__ */ (0, $.jsxs)("div", {
					className: "min-w-0",
					children: [/* @__PURE__ */ (0, $.jsxs)("div", {
						className: "flex items-center gap-1.5 font-medium text-canvas-text",
						children: [/* @__PURE__ */ (0, $.jsx)(K, {
							icon: "mdi:file-import-outline",
							width: "15",
							className: "text-indigo-300"
						}), n("从接口文档导入")]
					}), /* @__PURE__ */ (0, $.jsx)("p", {
						className: "mt-1 text-[12px] leading-relaxed text-canvas-text-muted",
						children: n("分别粘贴文档中的请求代码和响应 JSON，支持 Fetch、Axios、cURL、Python、Raw HTTP 与 OpenAPI JSON。")
					})]
				}), /* @__PURE__ */ (0, $.jsx)("button", {
					type: "button",
					className: "flex h-7 w-7 shrink-0 items-center justify-center rounded-md text-canvas-text-muted transition-colors hover:bg-white/[0.06] hover:text-canvas-text",
					"aria-label": n("关闭接口文档导入"),
					title: n("关闭"),
					onClick: t,
					children: /* @__PURE__ */ (0, $.jsx)(K, {
						icon: "mdi:close",
						width: "16"
					})
				})]
			}),
			/* @__PURE__ */ (0, $.jsxs)("div", {
				className: "flex min-w-0 flex-col gap-2.5 border-t border-canvas-border pt-3",
				children: [/* @__PURE__ */ (0, $.jsxs)("div", {
					className: "flex items-center justify-between gap-2",
					children: [/* @__PURE__ */ (0, $.jsx)("strong", {
						className: "text-[12px] font-medium text-canvas-text",
						children: n("提交阶段")
					}), /* @__PURE__ */ (0, $.jsx)("span", {
						className: "text-[11px] text-canvas-text-muted",
						children: n("请求与响应均必填")
					})]
				}), /* @__PURE__ */ (0, $.jsxs)("div", {
					className: "grid min-w-0 grid-cols-2 gap-3 max-[700px]:grid-cols-1",
					children: [/* @__PURE__ */ (0, $.jsx)(Et, {
						label: n("提交请求示例"),
						value: r.submitRequest,
						placeholder: n("粘贴 Fetch、cURL、Python 或 Raw HTTP 请求..."),
						onChange: (e) => v("submitRequest", e)
					}), /* @__PURE__ */ (0, $.jsx)(Et, {
						label: n("提交响应示例"),
						value: r.submitResponse,
						placeholder: n("粘贴提交接口返回的 JSON..."),
						onChange: (e) => v("submitResponse", e)
					})]
				})]
			}),
			/* @__PURE__ */ (0, $.jsxs)("div", {
				className: "flex min-w-0 flex-col gap-2.5 border-t border-canvas-border pt-3",
				children: [/* @__PURE__ */ (0, $.jsxs)("div", {
					className: "flex w-fit items-center gap-2 text-canvas-text-secondary",
					children: [/* @__PURE__ */ (0, $.jsx)("button", {
						type: "button",
						role: "switch",
						"aria-label": n("包含异步轮询"),
						"aria-checked": o,
						className: `relative h-4 w-7 rounded-full border transition-colors focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/50 focus-visible:ring-offset-1 focus-visible:ring-offset-[var(--theme-surface)] ${o ? "border-indigo-500/70 bg-indigo-500/70" : "border-[var(--border-secondary)] bg-[var(--theme-hover)]"}`,
						onClick: () => {
							s((e) => !e), l(null), d(null), p(!1);
						},
						children: /* @__PURE__ */ (0, $.jsx)("span", { className: `absolute left-0.5 top-0.5 h-3 w-3 rounded-full border shadow-sm transition-all ${o ? "translate-x-3 border-white/70 bg-white" : "border-[var(--border-secondary)] bg-[var(--theme-surface)]"}` })
					}), /* @__PURE__ */ (0, $.jsx)("span", { children: n("包含异步轮询") })]
				}), o ? /* @__PURE__ */ (0, $.jsxs)("div", {
					className: "grid min-w-0 grid-cols-2 gap-3 max-[700px]:grid-cols-1",
					children: [/* @__PURE__ */ (0, $.jsx)(Et, {
						label: n("轮询请求示例"),
						value: r.pollRequest ?? "",
						placeholder: n("粘贴查询任务状态的请求代码..."),
						onChange: (e) => v("pollRequest", e)
					}), /* @__PURE__ */ (0, $.jsx)(Et, {
						label: n("轮询响应示例"),
						value: r.pollResponse ?? "",
						placeholder: n("粘贴任务完成时返回的 JSON..."),
						onChange: (e) => v("pollResponse", e)
					})]
				}) : null]
			}),
			/* @__PURE__ */ (0, $.jsxs)("div", {
				className: "flex flex-wrap items-center justify-between gap-2",
				children: [/* @__PURE__ */ (0, $.jsx)("span", {
					className: "text-[12px] text-canvas-text-muted",
					children: n("只在本地静态解析，不执行代码、不请求接口、不导入密钥")
				}), /* @__PURE__ */ (0, $.jsxs)("div", {
					className: "flex items-center gap-2",
					children: [g ? /* @__PURE__ */ (0, $.jsx)("button", {
						type: "button",
						className: "h-7 rounded-md px-2.5 text-[12px] text-canvas-text-secondary hover:bg-white/[0.05] hover:text-canvas-text",
						onClick: () => {
							a(Tt), s(!1), l(null), d(null), p(!1);
						},
						children: n("清空")
					}) : null, /* @__PURE__ */ (0, $.jsxs)(W, {
						type: "button",
						className: "provider-secondary-btn h-7",
						disabled: !_,
						onClick: () => y(),
						children: [/* @__PURE__ */ (0, $.jsx)(K, {
							icon: "mdi:auto-fix",
							width: "14"
						}), n("识别文档")]
					})]
				})]
			}),
			u ? /* @__PURE__ */ (0, $.jsxs)("div", {
				className: "flex items-start gap-2 rounded-md border border-red-500/20 bg-red-500/[0.07] px-2.5 py-2 text-red-300",
				role: "alert",
				children: [/* @__PURE__ */ (0, $.jsx)(K, {
					icon: "mdi:alert-circle-outline",
					width: "15",
					className: "mt-0.5 shrink-0"
				}), /* @__PURE__ */ (0, $.jsx)("span", {
					className: "min-w-0 leading-relaxed",
					children: u
				})]
			}) : null,
			c ? /* @__PURE__ */ (0, $.jsxs)("div", {
				className: "flex min-w-0 flex-col gap-3",
				"aria-live": "polite",
				children: [
					/* @__PURE__ */ (0, $.jsxs)("div", {
						className: "flex min-w-0 flex-wrap items-center gap-1.5 border-t border-canvas-border pt-3",
						children: [/* @__PURE__ */ (0, $.jsx)("span", {
							className: `rounded border px-1.5 py-0.5 text-[11px] ${wt[c.confidence]}`,
							children: n(Ct[c.confidence])
						}), c.formats.map((e) => /* @__PURE__ */ (0, $.jsx)("span", {
							className: "rounded bg-white/[0.05] px-1.5 py-0.5 text-[11px] text-canvas-text-secondary",
							children: St[e]
						}, e))]
					}),
					/* @__PURE__ */ (0, $.jsx)("div", {
						className: "grid min-w-0 grid-cols-2 gap-x-5 gap-y-2 max-[700px]:grid-cols-1",
						children: c.fields.map((e) => /* @__PURE__ */ (0, $.jsxs)("div", {
							className: "grid min-w-0 grid-cols-[88px_minmax(0,1fr)] items-start gap-2 border-b border-canvas-border/70 pb-2",
							children: [/* @__PURE__ */ (0, $.jsx)("span", {
								className: "text-canvas-text-muted",
								children: e.label
							}), /* @__PURE__ */ (0, $.jsx)("code", {
								className: "min-w-0 break-all font-mono text-canvas-text-secondary",
								children: e.id === "category" ? n(S[e.value] ?? e.value) : e.value
							})]
						}, e.id))
					}),
					c.category ? /* @__PURE__ */ (0, $.jsxs)("label", {
						className: "flex min-w-0 items-center gap-2",
						children: [/* @__PURE__ */ (0, $.jsx)("span", {
							className: "shrink-0 text-canvas-text-muted",
							children: n("模型分类")
						}), /* @__PURE__ */ (0, $.jsx)("select", {
							value: c.category,
							className: "h-7 min-w-28 rounded-md border border-canvas-border bg-canvas-bg/60 px-2 text-[12px] text-canvas-text outline-none focus:border-indigo-400/60",
							onChange: (e) => y(e.target.value),
							children: Object.keys(S).map((e) => /* @__PURE__ */ (0, $.jsx)("option", {
								value: e,
								children: n(S[e])
							}, e))
						})]
					}) : null,
					h ? /* @__PURE__ */ (0, $.jsxs)("div", {
						className: "flex min-w-0 items-start gap-2 rounded-md bg-white/[0.025] px-2.5 py-2",
						children: [/* @__PURE__ */ (0, $.jsx)(K, {
							icon: "mdi:source-branch",
							width: "15",
							className: "mt-0.5 shrink-0 text-canvas-text-muted"
						}), /* @__PURE__ */ (0, $.jsx)("code", {
							className: "min-w-0 break-all font-mono text-canvas-text-secondary",
							children: h
						})]
					}) : null,
					c.warnings.length > 0 ? /* @__PURE__ */ (0, $.jsx)("div", {
						className: "flex min-w-0 flex-col gap-1.5 border-l-2 border-amber-400/40 pl-2.5 text-amber-200/90",
						children: c.warnings.map((e) => /* @__PURE__ */ (0, $.jsx)("p", {
							className: "m-0 leading-relaxed",
							children: e
						}, e))
					}) : null,
					c.confidence === "low" ? /* @__PURE__ */ (0, $.jsxs)("label", {
						className: "flex cursor-pointer items-start gap-2 text-canvas-text-secondary",
						children: [/* @__PURE__ */ (0, $.jsx)("input", {
							type: "checkbox",
							checked: f,
							className: "mt-0.5 accent-indigo-500",
							onChange: (e) => p(e.target.checked)
						}), /* @__PURE__ */ (0, $.jsx)("span", { children: n("我已检查低置信度字段，确认将识别结果应用到当前草稿") })]
					}) : null,
					/* @__PURE__ */ (0, $.jsxs)("div", {
						className: "flex flex-wrap items-center justify-between gap-2 border-t border-canvas-border pt-3",
						children: [/* @__PURE__ */ (0, $.jsx)("span", {
							className: "text-canvas-text-muted",
							children: n("应用后仍需保存厂商设置；现有 API Key 不会被覆盖")
						}), /* @__PURE__ */ (0, $.jsxs)(W, {
							type: "button",
							className: "provider-primary-btn h-7",
							disabled: !m,
							onClick: () => c && e(c),
							children: [/* @__PURE__ */ (0, $.jsx)(K, {
								icon: "mdi:check",
								width: "14"
							}), n("应用识别结果")]
						})]
					})
				]
			}) : null
		]
	});
}
//#endregion
//#region src/components/settings/providerConnection/providerConnectionModels.ts
function Ot(e, t) {
	let n = new Map(e.map((e) => [e.id, e]));
	for (let e of t) {
		let t = n.get(e.id), r = e.name.trim().toLowerCase() === e.id.trim().toLowerCase(), i = t && t.name.trim().toLowerCase() !== t.id.trim().toLowerCase(), a = r && i, o = !!t?.categoryManual || a;
		n.set(e.id, {
			...t,
			...e,
			name: a ? t.name : e.name,
			category: o && t ? t.category : e.category,
			description: t?.descriptionManual ? t.description : e.description || t?.description,
			descriptionManual: t?.descriptionManual ?? e.descriptionManual,
			inputModalities: t?.inputModalitiesManual ? t.inputModalities : e.inputModalities ?? t?.inputModalities,
			inputModalitiesManual: t?.inputModalitiesManual ?? e.inputModalitiesManual,
			categoryManual: t?.categoryManual ?? e.categoryManual
		});
	}
	return [...n.values()];
}
function kt(e) {
	return {
		...e,
		...e?.ratios ? { ratios: [...e.ratios] } : {},
		...e?.resolutions ? { resolutions: [...e.resolutions] } : {},
		...e?.frameRates ? { frameRates: [...e.frameRates] } : {},
		...e?.durations ? { durations: [...e.durations] } : {}
	};
}
function At(e, t) {
	return e !== void 0 && t.includes(e) ? e : void 0;
}
function jt(e) {
	for (let t of e) if (!(t.category !== "video" || !t.videoCapability)) try {
		G(t.videoCapability);
	} catch (e) {
		let n = e instanceof Error ? e.message : "能力声明无效";
		throw Error(`视频模型“${t.name}”的能力配置无效：${n}`, { cause: e });
	}
}
//#endregion
//#region src/components/settings/providerConnection/VideoCapabilityEditor.tsx
function Mt(e, t = {}) {
	if (!e.trim()) return;
	let n = Number(e);
	if (!Number.isFinite(n) || n < 0) return;
	let r = n * (t.scale ?? 1);
	return t.integer ? Math.round(r) : r;
}
function Nt({ model: e, onChange: t, onClose: n }) {
	let [r, i] = (0, Q.useState)(""), [a, o] = (0, Q.useState)(""), [s, c] = (0, Q.useState)(""), [l, u] = (0, Q.useState)(""), d = kt(e.videoCapability), f = d.durations?.length ? [...d.durations].sort((e, t) => e - t) : void 0, p = [...new Set([...$e, ...d.ratios ?? []])], m = [...new Set([...et, ...d.resolutions ?? []])], h = [...new Set([...tt, ...d.frameRates ?? []])].sort((e, t) => e - t), g = [...new Set([...nt, ...f ?? []])].sort((e, t) => e - t), _ = d.inputConstraints ?? {}, v = Math.min(rt, Math.max(1, d.minDuration ?? Math.min(...d.durations ?? [1]))), y = Math.max(v, Math.min(rt, d.maxDuration ?? Math.max(...d.durations ?? [15]))), b = (e) => t(kt(e)), x = (e) => b({
		...d,
		inputConstraints: e
	}), S = (e, t, n) => {
		let r = d[e] ?? [];
		if (r.includes(n) && r.length === 1) return;
		let i = r.includes(n) ? r.filter((e) => e !== n) : [...r, n];
		b({
			...d,
			[e]: i,
			[t]: At(d[t], i)
		});
	}, C = (e, t, n, r) => {
		let i = n.trim();
		if (!i) return;
		let a = d[e] ?? [];
		b({
			...d,
			[e]: a.includes(i) ? a : [...a, i],
			[t]: d[t]
		}), r();
	}, w = (e) => {
		let t = d.frameRates ?? [];
		if (t.includes(e) && t.length === 1) return;
		let n = t.includes(e) ? t.filter((t) => t !== e) : [...t, e].sort((e, t) => e - t);
		b({
			...d,
			frameRates: n,
			defaultFrameRate: At(d.defaultFrameRate, n)
		});
	}, T = (e) => {
		let t = f ?? [];
		if (t.includes(e) && t.length === 1) return;
		let n = t.includes(e) ? t.filter((t) => t !== e) : [...t, e].sort((e, t) => e - t);
		b({
			...d,
			durations: n,
			...d.minDuration === void 0 ? {} : { minDuration: Math.min(...n) },
			...d.maxDuration === void 0 ? {} : { maxDuration: Math.max(...n) },
			defaultDuration: At(d.defaultDuration, n)
		});
	}, E = (e) => `min-h-7 rounded-md border px-2.5 py-1 text-[11px] transition-colors ${e ? "border-indigo-400/70 bg-indigo-500/20 text-indigo-100" : "border-canvas-border bg-black/10 text-canvas-text-secondary hover:border-indigo-400/40 hover:text-canvas-text"}`;
	return /* @__PURE__ */ (0, $.jsxs)("div", {
		className: "mt-3 rounded-xl border border-canvas-border bg-canvas-surface/80 p-4 shadow-xl shadow-black/10",
		children: [
			/* @__PURE__ */ (0, $.jsxs)("div", {
				className: "mb-4 flex items-start justify-between gap-4",
				children: [/* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsxs)("div", {
					className: "flex items-center gap-2 text-sm font-semibold text-canvas-text",
					children: [/* @__PURE__ */ (0, $.jsx)(K, {
						icon: "lucide:video",
						width: "17",
						className: "text-indigo-300"
					}), "视频参数能力"]
				}), /* @__PURE__ */ (0, $.jsxs)("p", {
					className: "mt-1 text-[11px] leading-5 text-canvas-text-secondary",
					children: [e.name, " · 勾选模型实际支持的值，视频节点只会展示这些选项。"]
				})] }), /* @__PURE__ */ (0, $.jsx)(ie, {
					"aria-label": "关闭视频参数能力",
					onClick: n
				})]
			}),
			/* @__PURE__ */ (0, $.jsxs)("div", {
				className: "space-y-4",
				children: [
					/* @__PURE__ */ (0, $.jsxs)("section", { children: [/* @__PURE__ */ (0, $.jsxs)("div", {
						className: "mb-2 flex items-center justify-between gap-3",
						children: [/* @__PURE__ */ (0, $.jsx)("span", {
							className: "text-xs font-medium text-canvas-text",
							children: "画面比例（可多选）"
						}), /* @__PURE__ */ (0, $.jsxs)("label", {
							className: "flex items-center gap-2 text-[10px] text-canvas-text-secondary",
							children: ["默认", /* @__PURE__ */ (0, $.jsxs)("select", {
								className: "h-7 rounded-md border border-canvas-border bg-canvas-card px-2 text-[11px] text-canvas-text",
								value: d.defaultRatio ?? "",
								onChange: (e) => b({
									...d,
									defaultRatio: e.target.value || void 0
								}),
								children: [/* @__PURE__ */ (0, $.jsx)("option", {
									value: "",
									children: "模型默认（未声明）"
								}), d.ratios?.map((e) => /* @__PURE__ */ (0, $.jsx)("option", { children: e }, e))]
							})]
						})]
					}), /* @__PURE__ */ (0, $.jsxs)("div", {
						className: "flex flex-wrap gap-1.5",
						children: [p.map((e) => /* @__PURE__ */ (0, $.jsx)("button", {
							type: "button",
							"aria-pressed": d.ratios?.includes(e),
							className: E(d.ratios?.includes(e) ?? !1),
							onClick: () => S("ratios", "defaultRatio", e),
							children: e === "adaptive" ? "自适应" : e
						}, e)), /* @__PURE__ */ (0, $.jsxs)("span", {
							className: "flex min-h-7 overflow-hidden rounded-md border border-dashed border-canvas-border focus-within:border-indigo-400/60",
							children: [/* @__PURE__ */ (0, $.jsx)("input", {
								className: "w-20 bg-transparent px-2 text-[11px] text-canvas-text outline-none",
								value: r,
								placeholder: "自定义",
								onChange: (e) => i(e.target.value),
								onKeyDown: (e) => {
									e.key === "Enter" && C("ratios", "defaultRatio", r, () => i(""));
								}
							}), /* @__PURE__ */ (0, $.jsx)("button", {
								type: "button",
								className: "border-l border-canvas-border px-2 text-indigo-300",
								"aria-label": "添加自定义比例",
								onClick: () => C("ratios", "defaultRatio", r, () => i("")),
								children: "+"
							})]
						})]
					})] }),
					/* @__PURE__ */ (0, $.jsxs)("section", { children: [
						/* @__PURE__ */ (0, $.jsxs)("div", {
							className: "mb-2 flex items-center justify-between gap-3",
							children: [/* @__PURE__ */ (0, $.jsx)("span", {
								className: "text-xs font-medium text-canvas-text",
								children: "分辨率（可多选）"
							}), /* @__PURE__ */ (0, $.jsxs)("label", {
								className: "flex items-center gap-2 text-[10px] text-canvas-text-secondary",
								children: ["默认", /* @__PURE__ */ (0, $.jsxs)("select", {
									className: "h-7 rounded-md border border-canvas-border bg-canvas-card px-2 text-[11px] text-canvas-text",
									value: d.defaultResolution ?? "",
									onChange: (e) => b({
										...d,
										defaultResolution: e.target.value || void 0
									}),
									children: [/* @__PURE__ */ (0, $.jsx)("option", {
										value: "",
										children: "模型默认（未声明）"
									}), d.resolutions?.map((e) => /* @__PURE__ */ (0, $.jsx)("option", { children: e }, e))]
								})]
							})]
						}),
						/* @__PURE__ */ (0, $.jsxs)("div", {
							className: "flex flex-wrap gap-1.5",
							children: [m.map((e) => /* @__PURE__ */ (0, $.jsx)("button", {
								type: "button",
								"aria-pressed": d.resolutions?.includes(e),
								className: E(d.resolutions?.includes(e) ?? !1),
								onClick: () => S("resolutions", "defaultResolution", e),
								children: e
							}, e)), /* @__PURE__ */ (0, $.jsxs)("span", {
								className: "flex min-h-7 overflow-hidden rounded-md border border-dashed border-canvas-border focus-within:border-indigo-400/60",
								children: [/* @__PURE__ */ (0, $.jsx)("input", {
									className: "w-20 bg-transparent px-2 text-[11px] text-canvas-text outline-none",
									value: a,
									placeholder: "自定义",
									onChange: (e) => o(e.target.value),
									onKeyDown: (e) => {
										e.key === "Enter" && C("resolutions", "defaultResolution", a, () => o(""));
									}
								}), /* @__PURE__ */ (0, $.jsx)("button", {
									type: "button",
									className: "border-l border-canvas-border px-2 text-indigo-300",
									"aria-label": "添加自定义分辨率",
									onClick: () => C("resolutions", "defaultResolution", a, () => o("")),
									children: "+"
								})]
							})]
						}),
						/* @__PURE__ */ (0, $.jsx)("p", {
							className: "mt-1.5 text-[10px] text-canvas-text-muted",
							children: "同时提供 480p/1080p 等接口档位和 480/832 等长边像素；请按厂商文档勾选。"
						})
					] }),
					/* @__PURE__ */ (0, $.jsxs)("section", { children: [/* @__PURE__ */ (0, $.jsxs)("div", {
						className: "mb-2 flex items-center justify-between gap-3",
						children: [/* @__PURE__ */ (0, $.jsx)("span", {
							className: "text-xs font-medium text-canvas-text",
							children: "帧率（可多选）"
						}), /* @__PURE__ */ (0, $.jsxs)("label", {
							className: "flex items-center gap-2 text-[10px] text-canvas-text-secondary",
							children: ["默认", /* @__PURE__ */ (0, $.jsxs)("select", {
								className: "h-7 rounded-md border border-canvas-border bg-canvas-card px-2 text-[11px] text-canvas-text",
								value: d.defaultFrameRate ?? "",
								onChange: (e) => b({
									...d,
									defaultFrameRate: e.target.value ? Number(e.target.value) : void 0
								}),
								children: [/* @__PURE__ */ (0, $.jsx)("option", {
									value: "",
									children: "模型默认（未声明）"
								}), d.frameRates?.map((e) => /* @__PURE__ */ (0, $.jsxs)("option", {
									value: e,
									children: [e, " FPS"]
								}, e))]
							})]
						})]
					}), /* @__PURE__ */ (0, $.jsxs)("div", {
						className: "flex flex-wrap gap-1.5",
						children: [h.map((e) => /* @__PURE__ */ (0, $.jsxs)("button", {
							type: "button",
							"aria-pressed": d.frameRates?.includes(e),
							className: E(d.frameRates?.includes(e) ?? !1),
							onClick: () => w(e),
							children: [e, " FPS"]
						}, e)), /* @__PURE__ */ (0, $.jsxs)("span", {
							className: "flex min-h-7 overflow-hidden rounded-md border border-dashed border-canvas-border focus-within:border-indigo-400/60",
							children: [/* @__PURE__ */ (0, $.jsx)("input", {
								type: "number",
								min: "1",
								max: "240",
								className: "w-20 bg-transparent px-2 text-[11px] text-canvas-text outline-none",
								value: s,
								placeholder: "自定义",
								onChange: (e) => c(e.target.value),
								onKeyDown: (e) => {
									if (e.key === "Enter") {
										let e = Number(s);
										Number.isInteger(e) && e > 0 && e <= 240 && (d.frameRates?.includes(e) || w(e), c(""));
									}
								}
							}), /* @__PURE__ */ (0, $.jsx)("button", {
								type: "button",
								className: "border-l border-canvas-border px-2 text-indigo-300",
								"aria-label": "添加自定义帧率",
								onClick: () => {
									let e = Number(s);
									Number.isInteger(e) && e > 0 && e <= 240 && (d.frameRates?.includes(e) || w(e), c(""));
								},
								children: "+"
							})]
						})]
					})] }),
					/* @__PURE__ */ (0, $.jsxs)("section", {
						className: "rounded-lg border border-canvas-border bg-black/10 p-3",
						children: [/* @__PURE__ */ (0, $.jsxs)("div", {
							className: "mb-3 flex flex-wrap items-center justify-between gap-3",
							children: [/* @__PURE__ */ (0, $.jsx)("span", {
								className: "text-xs font-medium text-canvas-text",
								children: "生成时长"
							}), /* @__PURE__ */ (0, $.jsxs)("div", {
								className: "flex rounded-md border border-canvas-border bg-canvas-card p-0.5",
								role: "group",
								"aria-label": "时长模式",
								children: [/* @__PURE__ */ (0, $.jsx)("button", {
									type: "button",
									className: `rounded px-2.5 py-1 text-[10px] ${f ? "text-canvas-text-secondary" : "bg-indigo-500/25 text-indigo-100"}`,
									onClick: () => b({
										...d,
										durations: void 0,
										minDuration: d.minDuration ?? 1,
										maxDuration: d.maxDuration ?? 15
									}),
									children: "连续范围"
								}), /* @__PURE__ */ (0, $.jsx)("button", {
									type: "button",
									className: `rounded px-2.5 py-1 text-[10px] ${f ? "bg-indigo-500/25 text-indigo-100" : "text-canvas-text-secondary"}`,
									onClick: () => b({
										...d,
										durations: [d.defaultDuration ?? 5]
									}),
									children: "固定档位"
								})]
							})]
						}), f ? /* @__PURE__ */ (0, $.jsxs)("div", {
							className: "flex flex-wrap gap-1.5",
							children: [
								g.map((e) => /* @__PURE__ */ (0, $.jsxs)("button", {
									type: "button",
									"aria-pressed": f.includes(e),
									className: E(f.includes(e)),
									onClick: () => T(e),
									children: [e, "s"]
								}, e)),
								/* @__PURE__ */ (0, $.jsxs)("span", {
									className: "flex min-h-7 overflow-hidden rounded-md border border-dashed border-canvas-border focus-within:border-indigo-400/60",
									children: [/* @__PURE__ */ (0, $.jsx)("input", {
										type: "number",
										min: 1,
										max: rt,
										className: "w-20 bg-transparent px-2 text-[11px] text-canvas-text outline-none",
										value: l,
										placeholder: "自定义秒",
										onChange: (e) => u(e.target.value)
									}), /* @__PURE__ */ (0, $.jsx)("button", {
										type: "button",
										className: "border-l border-canvas-border px-2 text-indigo-300",
										"aria-label": "添加自定义时长",
										onClick: () => {
											let e = Number(l);
											Number.isInteger(e) && e >= 1 && e <= 3600 && (f.includes(e) || T(e), u(""));
										},
										children: "+"
									})]
								}),
								/* @__PURE__ */ (0, $.jsxs)("label", {
									className: "ml-auto flex items-center gap-2 text-[10px] text-canvas-text-secondary",
									children: ["默认", /* @__PURE__ */ (0, $.jsxs)("select", {
										className: "h-7 rounded-md border border-canvas-border bg-canvas-card px-2 text-[11px] text-canvas-text",
										value: d.defaultDuration ?? "",
										onChange: (e) => b({
											...d,
											defaultDuration: e.target.value ? Number(e.target.value) : void 0
										}),
										children: [/* @__PURE__ */ (0, $.jsx)("option", {
											value: "",
											children: "模型默认（未声明）"
										}), f.map((e) => /* @__PURE__ */ (0, $.jsxs)("option", {
											value: e,
											children: [e, "s"]
										}, e))]
									})]
								})
							]
						}) : /* @__PURE__ */ (0, $.jsxs)("div", { children: [
							/* @__PURE__ */ (0, $.jsxs)("div", {
								className: "mb-2 flex items-center justify-between text-[11px] font-medium text-canvas-text",
								children: [/* @__PURE__ */ (0, $.jsxs)("span", { children: ["最短 ", d.minDuration ?? "未声明"] }), /* @__PURE__ */ (0, $.jsxs)("span", { children: ["最长 ", d.maxDuration ?? "未声明"] })]
							}),
							d.minDuration === void 0 && d.maxDuration === void 0 && /* @__PURE__ */ (0, $.jsx)("p", {
								className: "mb-2 text-[10px] text-canvas-text-muted",
								children: "当前未声明时长范围；滑动端点后才会写入限制。"
							}),
							/* @__PURE__ */ (0, $.jsxs)("div", {
								className: "relative h-8",
								children: [
									/* @__PURE__ */ (0, $.jsx)("div", { className: "absolute inset-x-0 top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-canvas-card" }),
									/* @__PURE__ */ (0, $.jsx)("div", {
										className: "pointer-events-none absolute top-1/2 h-1.5 -translate-y-1/2 rounded-full bg-indigo-500 shadow-[0_0_8px_rgba(99,102,241,0.35)]",
										style: {
											left: `${(v - 1) / (rt - 1) * 100}%`,
											width: `${(y - v) / (rt - 1) * 100}%`
										}
									}),
									/* @__PURE__ */ (0, $.jsx)("input", {
										type: "range",
										min: 1,
										max: rt,
										step: "1",
										value: v,
										"aria-label": "最短生成时长",
										className: "rh-duration-input pointer-events-none absolute inset-0 z-20 [&::-moz-range-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:pointer-events-auto",
										style: {
											position: "absolute",
											top: 4,
											left: 0,
											right: 0,
											zIndex: 20
										},
										onChange: (e) => {
											let t = Math.min(Number(e.target.value), y);
											b({
												...d,
												minDuration: t,
												...d.defaultDuration === void 0 ? {} : { defaultDuration: Math.max(t, d.defaultDuration) }
											});
										}
									}),
									/* @__PURE__ */ (0, $.jsx)("input", {
										type: "range",
										min: 1,
										max: rt,
										step: "1",
										value: y,
										"aria-label": "最长生成时长",
										className: "rh-duration-input pointer-events-none absolute inset-0 z-10 [&::-moz-range-thumb]:pointer-events-auto [&::-webkit-slider-thumb]:pointer-events-auto",
										style: {
											position: "absolute",
											top: 4,
											left: 0,
											right: 0,
											zIndex: 10
										},
										onChange: (e) => {
											let t = Math.max(Number(e.target.value), v);
											b({
												...d,
												maxDuration: t,
												...d.defaultDuration === void 0 ? {} : { defaultDuration: Math.min(t, d.defaultDuration) }
											});
										}
									})
								]
							}),
							/* @__PURE__ */ (0, $.jsx)("div", {
								className: "flex justify-between text-[9px] text-canvas-text-muted",
								"aria-hidden": "true",
								children: [
									2,
									6,
									10,
									14,
									18,
									22,
									26,
									30
								].map((e) => /* @__PURE__ */ (0, $.jsxs)("span", { children: [e, "s"] }, e))
							}),
							/* @__PURE__ */ (0, $.jsxs)("label", {
								className: "mt-3 flex items-center justify-end gap-2 text-[10px] text-canvas-text-secondary",
								children: ["默认时长", /* @__PURE__ */ (0, $.jsxs)("select", {
									className: "h-7 rounded-md border border-canvas-border bg-canvas-card px-2 text-[11px] text-canvas-text",
									value: d.defaultDuration ?? "",
									onChange: (e) => b({
										...d,
										defaultDuration: e.target.value ? Number(e.target.value) : void 0
									}),
									children: [/* @__PURE__ */ (0, $.jsx)("option", {
										value: "",
										children: "模型默认（未声明）"
									}), Array.from({ length: y - v + 1 }, (e, t) => v + t).map((e) => /* @__PURE__ */ (0, $.jsxs)("option", {
										value: e,
										children: [e, "s"]
									}, e))]
								})]
							})
						] })]
					}),
					/* @__PURE__ */ (0, $.jsxs)("section", {
						className: "rounded-lg border border-canvas-border bg-black/10 p-3",
						children: [/* @__PURE__ */ (0, $.jsxs)("div", {
							className: "mb-3",
							children: [/* @__PURE__ */ (0, $.jsx)("span", {
								className: "text-xs font-medium text-canvas-text",
								children: "提交前输入校验"
							}), /* @__PURE__ */ (0, $.jsx)("p", {
								className: "mt-1 text-[10px] leading-4 text-canvas-text-muted",
								children: "留空表示不限制；不符合时会在创建远端任务前拦截，避免无效请求产生费用。"
							})]
						}), /* @__PURE__ */ (0, $.jsxs)("div", {
							className: "grid gap-3 sm:grid-cols-2",
							children: [
								/* @__PURE__ */ (0, $.jsxs)("label", {
									className: "space-y-1 text-[10px] text-canvas-text-secondary",
									children: [/* @__PURE__ */ (0, $.jsx)("span", { children: "提示词最少字符" }), /* @__PURE__ */ (0, $.jsx)("input", {
										type: "number",
										min: "0",
										step: "1",
										className: "h-8 w-full rounded-md border border-canvas-border bg-canvas-card px-2 text-[11px] text-canvas-text outline-none focus:border-indigo-400/60",
										value: _.promptMinCharacters ?? "",
										placeholder: "不限",
										onChange: (e) => x({
											..._,
											promptMinCharacters: Mt(e.target.value, { integer: !0 })
										})
									})]
								}),
								/* @__PURE__ */ (0, $.jsxs)("label", {
									className: "space-y-1 text-[10px] text-canvas-text-secondary",
									children: [/* @__PURE__ */ (0, $.jsx)("span", { children: "Base64 解码后总上限（MiB）" }), /* @__PURE__ */ (0, $.jsx)("input", {
										type: "number",
										min: "0",
										step: "0.1",
										className: "h-8 w-full rounded-md border border-canvas-border bg-canvas-card px-2 text-[11px] text-canvas-text outline-none focus:border-indigo-400/60",
										value: _.maxBase64DecodedBytes === void 0 ? "" : Number((_.maxBase64DecodedBytes / (1024 * 1024)).toFixed(2)),
										placeholder: "不限",
										onChange: (e) => x({
											..._,
											maxBase64DecodedBytes: Mt(e.target.value, {
												integer: !0,
												scale: 1024 * 1024
											})
										})
									})]
								}),
								/* @__PURE__ */ (0, $.jsxs)("label", {
									className: "space-y-1 text-[10px] text-canvas-text-secondary",
									children: [/* @__PURE__ */ (0, $.jsx)("span", { children: "参考视频最小宽度（px）" }), /* @__PURE__ */ (0, $.jsx)("input", {
										type: "number",
										min: "0",
										step: "1",
										className: "h-8 w-full rounded-md border border-canvas-border bg-canvas-card px-2 text-[11px] text-canvas-text outline-none focus:border-indigo-400/60",
										value: _.referenceVideo?.width?.min ?? "",
										placeholder: "不限",
										onChange: (e) => x({
											..._,
											referenceVideo: {
												..._.referenceVideo,
												width: {
													..._.referenceVideo?.width,
													min: Mt(e.target.value, { integer: !0 })
												}
											}
										})
									})]
								}),
								/* @__PURE__ */ (0, $.jsxs)("div", {
									className: "grid grid-cols-2 gap-2",
									children: [/* @__PURE__ */ (0, $.jsxs)("label", {
										className: "space-y-1 text-[10px] text-canvas-text-secondary",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: "视频最短（秒）" }), /* @__PURE__ */ (0, $.jsx)("input", {
											type: "number",
											min: "0",
											step: "0.1",
											className: "h-8 w-full rounded-md border border-canvas-border bg-canvas-card px-2 text-[11px] text-canvas-text outline-none focus:border-indigo-400/60",
											value: _.referenceVideo?.durationSeconds?.min ?? "",
											placeholder: "不限",
											onChange: (e) => x({
												..._,
												referenceVideo: {
													..._.referenceVideo,
													durationSeconds: {
														..._.referenceVideo?.durationSeconds,
														min: Mt(e.target.value)
													}
												}
											})
										})]
									}), /* @__PURE__ */ (0, $.jsxs)("label", {
										className: "space-y-1 text-[10px] text-canvas-text-secondary",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: "视频最长（秒）" }), /* @__PURE__ */ (0, $.jsx)("input", {
											type: "number",
											min: "0",
											step: "0.1",
											className: "h-8 w-full rounded-md border border-canvas-border bg-canvas-card px-2 text-[11px] text-canvas-text outline-none focus:border-indigo-400/60",
											value: _.referenceVideo?.durationSeconds?.max ?? "",
											placeholder: "不限",
											onChange: (e) => x({
												..._,
												referenceVideo: {
													..._.referenceVideo,
													durationSeconds: {
														..._.referenceVideo?.durationSeconds,
														max: Mt(e.target.value)
													}
												}
											})
										})]
									})]
								}),
								/* @__PURE__ */ (0, $.jsxs)("div", {
									className: "grid grid-cols-2 gap-2",
									children: [/* @__PURE__ */ (0, $.jsxs)("label", {
										className: "space-y-1 text-[10px] text-canvas-text-secondary",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: "音频最短（秒）" }), /* @__PURE__ */ (0, $.jsx)("input", {
											type: "number",
											min: "0",
											step: "0.1",
											className: "h-8 w-full rounded-md border border-canvas-border bg-canvas-card px-2 text-[11px] text-canvas-text outline-none focus:border-indigo-400/60",
											value: _.referenceAudio?.durationSeconds?.min ?? "",
											placeholder: "不限",
											onChange: (e) => x({
												..._,
												referenceAudio: {
													..._.referenceAudio,
													durationSeconds: {
														..._.referenceAudio?.durationSeconds,
														min: Mt(e.target.value)
													}
												}
											})
										})]
									}), /* @__PURE__ */ (0, $.jsxs)("label", {
										className: "space-y-1 text-[10px] text-canvas-text-secondary",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: "音频最长（秒）" }), /* @__PURE__ */ (0, $.jsx)("input", {
											type: "number",
											min: "0",
											step: "0.1",
											className: "h-8 w-full rounded-md border border-canvas-border bg-canvas-card px-2 text-[11px] text-canvas-text outline-none focus:border-indigo-400/60",
											value: _.referenceAudio?.durationSeconds?.max ?? "",
											placeholder: "不限",
											onChange: (e) => x({
												..._,
												referenceAudio: {
													..._.referenceAudio,
													durationSeconds: {
														..._.referenceAudio?.durationSeconds,
														max: Mt(e.target.value)
													}
												}
											})
										})]
									})]
								}),
								/* @__PURE__ */ (0, $.jsxs)("div", {
									className: "flex flex-wrap items-center gap-x-4 gap-y-2 text-[10px] text-canvas-text-secondary",
									children: [/* @__PURE__ */ (0, $.jsxs)("label", {
										className: "flex items-center gap-2",
										children: [/* @__PURE__ */ (0, $.jsx)("input", {
											type: "checkbox",
											className: "h-3.5 w-3.5 accent-indigo-500",
											checked: _.referenceVideo?.durationSeconds?.maxExclusive ?? !1,
											disabled: _.referenceVideo?.durationSeconds?.max === void 0,
											onChange: (e) => x({
												..._,
												referenceVideo: {
													..._.referenceVideo,
													durationSeconds: {
														..._.referenceVideo?.durationSeconds,
														maxExclusive: e.target.checked
													}
												}
											})
										}), "视频最长严格小于"]
									}), /* @__PURE__ */ (0, $.jsxs)("label", {
										className: "flex items-center gap-2",
										children: [/* @__PURE__ */ (0, $.jsx)("input", {
											type: "checkbox",
											className: "h-3.5 w-3.5 accent-indigo-500",
											checked: _.referenceAudio?.durationSeconds?.maxExclusive ?? !1,
											disabled: _.referenceAudio?.durationSeconds?.max === void 0,
											onChange: (e) => x({
												..._,
												referenceAudio: {
													..._.referenceAudio,
													durationSeconds: {
														..._.referenceAudio?.durationSeconds,
														maxExclusive: e.target.checked
													}
												}
											})
										}), "音频最长严格小于"]
									})]
								})
							]
						})]
					})
				]
			}),
			/* @__PURE__ */ (0, $.jsx)("div", {
				className: "mt-4 flex justify-end",
				children: /* @__PURE__ */ (0, $.jsx)("button", {
					type: "button",
					className: "text-[11px] text-canvas-text-secondary hover:text-canvas-text",
					onClick: () => t(void 0),
					children: "清除自定义限制，恢复通用默认"
				})
			})
		]
	});
}
//#endregion
//#region src/components/settings/providerConnection/ProviderModelSection.tsx
function Pt({ definition: e, models: t, filteredModels: n, selectedModels: r, selectedIds: a, query: o, setQuery: s, category: c, setCategory: l, visibleModelCategories: u, catalogStatus: d, catalogMessage: f, missingCredentials: p, apiKey: m, baseUrl: h, setProtocolValid: g, protocolImportOpen: _, setProtocolImportOpen: v, protocolImportSnapshot: y, protocolModel: b, videoCapabilityModel: x, setProtocolModelId: C, setVideoCapabilityModelId: w, categoryEditModelId: T, setCategoryEditModelId: E, manualModelId: D, setManualModelId: O, manualModelName: k, setManualModelName: A, manualCategory: j, setManualCategory: M, onToggleModel: N, onToggleVisibleModels: P, onToggleVisibleCategory: F, onToggleAllVisibleCategories: I, onAddManualModel: L, onUpdateModelCategory: R, onUpdateModelContextWindow: ee, onUpdateModelDescription: te, onUpdateModelVisionCapability: z, onUpdateModelProtocol: B, onUpdateVideoCapability: V, onUpdateImageReferenceRequestMode: H, onCloseProtocolEditor: ne, onApplyProtocolImport: U, onUndoProtocolImport: re, onFetchModels: ie }) {
	let G = i();
	return /* @__PURE__ */ (0, $.jsxs)("section", {
		className: "provider-model-section",
		children: [
			/* @__PURE__ */ (0, $.jsxs)("div", {
				className: "provider-section-heading provider-model-heading",
				children: [/* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsx)("h4", { children: G("启用模型") }), /* @__PURE__ */ (0, $.jsx)("p", { children: G("仅勾选会在应用中使用的模型") })] }), /* @__PURE__ */ (0, $.jsxs)("div", {
					className: "flex flex-wrap items-center justify-end gap-1.5",
					children: [e.id === "custom-openai" ? /* @__PURE__ */ (0, $.jsxs)($.Fragment, { children: [y ? /* @__PURE__ */ (0, $.jsxs)(W, {
						type: "button",
						className: "provider-text-btn h-7",
						onClick: re,
						children: [/* @__PURE__ */ (0, $.jsx)(K, {
							icon: "mdi:undo-variant",
							width: "14"
						}), G("撤销导入")]
					}) : null, /* @__PURE__ */ (0, $.jsxs)(W, {
						type: "button",
						className: "provider-secondary-btn h-7",
						"aria-expanded": _,
						onClick: () => v((e) => !e),
						children: [/* @__PURE__ */ (0, $.jsx)(K, {
							icon: "mdi:file-import-outline",
							width: "14"
						}), G("导入文档")]
					})] }) : null, /* @__PURE__ */ (0, $.jsxs)(W, {
						type: "button",
						className: "provider-fetch-btn",
						disabled: p || d === "loading",
						onClick: () => void ie(),
						children: [/* @__PURE__ */ (0, $.jsx)(K, {
							icon: d === "loading" ? "mdi:loading" : "mdi:cloud-download-outline",
							className: d === "loading" ? "settings-spin" : void 0,
							width: "15"
						}), G(d === "loading" ? "拉取中" : "拉取模型")]
					})]
				})]
			}),
			e.id === "custom-openai" && _ ? /* @__PURE__ */ (0, $.jsx)(Dt, {
				onApply: U,
				onClose: () => v(!1)
			}) : null,
			/* @__PURE__ */ (0, $.jsxs)("div", {
				className: "mb-3 flex min-h-8 items-center justify-between gap-3 rounded-md border border-canvas-border bg-white/[0.03] px-2.5 py-1.5",
				children: [/* @__PURE__ */ (0, $.jsxs)("span", {
					className: "flex shrink-0 items-center gap-1.5 text-[10px] text-canvas-text-secondary",
					children: [/* @__PURE__ */ (0, $.jsx)(K, {
						icon: "mdi:eye-outline",
						width: "14"
					}), G("是否在对应类型节点中显示")]
				}), /* @__PURE__ */ (0, $.jsxs)("div", {
					className: "flex min-w-0 flex-wrap justify-end gap-1",
					role: "group",
					"aria-label": G("节点列表显示分类"),
					children: [/* @__PURE__ */ (0, $.jsx)("button", {
						type: "button",
						"aria-pressed": u.size === Qe.length,
						className: `provider-category-choice is-all h-6 rounded px-2 text-[9px] ${u.size === Qe.length ? "is-active" : ""}`,
						onClick: I,
						children: G("全部")
					}), Qe.map((e) => /* @__PURE__ */ (0, $.jsx)("button", {
						type: "button",
						"aria-pressed": u.has(e),
						className: `provider-category-choice is-${e} h-6 rounded px-2 text-[9px] ${u.has(e) ? "is-active" : ""}`,
						onClick: () => F(e),
						children: S[e]
					}, e))]
				})]
			}),
			f && /* @__PURE__ */ (0, $.jsxs)("div", {
				className: `provider-catalog-message is-${d}`,
				children: [/* @__PURE__ */ (0, $.jsx)(K, {
					icon: d === "error" ? "mdi:alert-circle-outline" : "mdi:information-outline",
					width: "14"
				}), /* @__PURE__ */ (0, $.jsx)("span", { children: f })]
			}),
			t.length > 0 && /* @__PURE__ */ (0, $.jsxs)($.Fragment, { children: [
				/* @__PURE__ */ (0, $.jsxs)("div", {
					className: "provider-model-toolbar",
					children: [/* @__PURE__ */ (0, $.jsxs)("label", {
						className: "provider-search",
						children: [/* @__PURE__ */ (0, $.jsx)(K, {
							icon: "mdi:magnify",
							width: "15"
						}), /* @__PURE__ */ (0, $.jsx)("input", {
							type: "search",
							value: o,
							placeholder: G("搜索模型 ID 或名称"),
							onChange: (e) => s(e.target.value)
						})]
					}), /* @__PURE__ */ (0, $.jsxs)("div", {
						className: "provider-category-tabs",
						"aria-label": G("模型类别"),
						children: [/* @__PURE__ */ (0, $.jsx)("button", {
							type: "button",
							"aria-pressed": c === "all",
							className: `provider-category-choice is-all ${c === "all" ? "is-active" : ""}`,
							onClick: () => l("all"),
							children: G("全部")
						}), Qe.map((e) => /* @__PURE__ */ (0, $.jsx)("button", {
							type: "button",
							"aria-pressed": c === e,
							className: `provider-category-choice is-${e} ${c === e ? "is-active" : ""}`,
							onClick: () => l(e),
							children: S[e]
						}, e))]
					})]
				}),
				/* @__PURE__ */ (0, $.jsxs)("div", {
					className: "provider-model-list-head",
					children: [/* @__PURE__ */ (0, $.jsxs)("label", { children: [/* @__PURE__ */ (0, $.jsx)("input", {
						type: "checkbox",
						checked: n.length > 0 && n.every((e) => a.has(e.id)),
						onChange: P
					}), /* @__PURE__ */ (0, $.jsx)("span", { children: G("选择当前结果") })] }), /* @__PURE__ */ (0, $.jsxs)("span", { children: [r.length, " 个已选"] })]
				}),
				/* @__PURE__ */ (0, $.jsx)("div", {
					className: "provider-model-list",
					children: n.length > 0 ? n.map((t) => /* @__PURE__ */ (0, $.jsxs)("div", {
						className: `provider-model-row ${T === t.id ? "provider-model-row--editing" : ""}`,
						children: [
							/* @__PURE__ */ (0, $.jsx)("button", {
								type: "button",
								className: `provider-model-kind is-${t.category}`,
								"aria-label": `修改 ${t.name} 的模型分类，当前为${S[t.category]}`,
								title: "点击修改模型分类",
								"aria-expanded": T === t.id,
								onClick: () => E((e) => e === t.id ? null : t.id),
								children: S[t.category]
							}),
							/* @__PURE__ */ (0, $.jsxs)("label", {
								className: "provider-model-select",
								children: [/* @__PURE__ */ (0, $.jsx)("input", {
									type: "checkbox",
									checked: a.has(t.id),
									onChange: () => N(t.id)
								}), /* @__PURE__ */ (0, $.jsxs)("span", {
									className: "provider-model-copy",
									children: [/* @__PURE__ */ (0, $.jsx)("strong", { children: t.name }), /* @__PURE__ */ (0, $.jsx)("small", { children: t.id })]
								})]
							}),
							e.id === "custom-openai" && a.has(t.id) ? /* @__PURE__ */ (0, $.jsxs)($.Fragment, { children: [t.category === "video" ? /* @__PURE__ */ (0, $.jsx)(W, {
								type: "button",
								className: `provider-model-protocol-btn ${t.videoCapability ? "is-configured" : ""}`,
								"aria-label": `配置 ${t.name} 视频参数能力`,
								title: "视频参数能力",
								onClick: () => {
									w(t.id), C(null), g(!0);
								},
								children: /* @__PURE__ */ (0, $.jsx)(K, {
									icon: "lucide:video",
									width: "16"
								})
							}) : null, /* @__PURE__ */ (0, $.jsx)(W, {
								type: "button",
								className: `provider-model-protocol-btn ${t.executionProfile ? "is-configured" : ""}`,
								"aria-label": `配置 ${t.name} 调用协议`,
								title: "调用协议",
								onClick: () => {
									C(t.id), w(null), g(!0);
								},
								children: /* @__PURE__ */ (0, $.jsx)(K, {
									icon: "mdi:tune-variant",
									width: "15"
								})
							})] }) : null,
							T === t.id ? /* @__PURE__ */ (0, $.jsxs)("div", {
								className: "provider-model-category-editor",
								role: "group",
								"aria-label": `选择 ${t.name} 的模型分类`,
								children: [
									/* @__PURE__ */ (0, $.jsx)("span", {
										className: "provider-model-category-editor-title",
										children: "分类"
									}),
									Qe.map((e) => /* @__PURE__ */ (0, $.jsx)("button", {
										type: "button",
										"aria-pressed": t.category === e,
										className: `provider-category-choice is-${e} ${t.category === e ? "is-active" : ""}`,
										onClick: () => {
											t.category === e ? E(null) : R(t.id, e);
										},
										children: S[e]
									}, e)),
									t.category === "text" ? /* @__PURE__ */ (0, $.jsxs)($.Fragment, { children: [/* @__PURE__ */ (0, $.jsxs)("label", {
										className: "provider-model-capability-toggle",
										children: [/* @__PURE__ */ (0, $.jsx)("input", {
											type: "checkbox",
											checked: t.inputModalities?.includes("image") ?? !1,
											onChange: (e) => z(t.id, e.target.checked)
										}), /* @__PURE__ */ (0, $.jsx)("span", { children: "支持图片输入" })]
									}), /* @__PURE__ */ (0, $.jsxs)("label", {
										className: "provider-model-context-window",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: "上下文窗口（token）" }), /* @__PURE__ */ (0, $.jsx)("input", {
											type: "text",
											inputMode: "numeric",
											value: t.contextWindow ?? "",
											placeholder: "留空则按模型 ID 推断",
											onChange: (e) => ee(t.id, e.target.value)
										})]
									})] }) : null,
									/* @__PURE__ */ (0, $.jsxs)("label", {
										className: "provider-model-description-editor",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: "Agent 选型说明" }), /* @__PURE__ */ (0, $.jsx)("textarea", {
											value: t.description ?? "",
											maxLength: 500,
											rows: 2,
											placeholder: "例如：适合中文 OCR、角色图分析，速度快、成本低",
											onChange: (e) => te(t.id, e.target.value)
										})]
									})
								]
							}) : null
						]
					}, t.id)) : /* @__PURE__ */ (0, $.jsx)("div", {
						className: "provider-model-empty",
						children: "没有匹配的模型"
					})
				}),
				e.id === "custom-openai" && x && x.category === "video" && a.has(x.id) ? /* @__PURE__ */ (0, $.jsx)(Nt, {
					model: x,
					onChange: (e) => V(x.id, e),
					onClose: () => w(null)
				}, x.id) : null,
				e.id === "custom-openai" && b && a.has(b.id) ? /* @__PURE__ */ (0, $.jsx)(xt, {
					model: b,
					apiKey: m.trim(),
					baseUrl: ue(h) || e.defaultBaseUrl || "",
					onChange: (e) => B(b.id, e),
					onImageReferenceRequestModeChange: (e) => H(b.id, e),
					onValidityChange: g,
					onClose: ne
				}, b.id) : null
			] }),
			e.id === "custom-openai" && /* @__PURE__ */ (0, $.jsx)("div", {
				className: "provider-manual-model",
				children: /* @__PURE__ */ (0, $.jsxs)("div", {
					className: "provider-manual-fields",
					children: [
						/* @__PURE__ */ (0, $.jsx)("input", {
							type: "text",
							value: D,
							placeholder: "手动输入模型 ID",
							onChange: (e) => O(e.target.value)
						}),
						/* @__PURE__ */ (0, $.jsx)("input", {
							type: "text",
							value: k,
							placeholder: "显示名称（可选）",
							onChange: (e) => A(e.target.value)
						}),
						/* @__PURE__ */ (0, $.jsx)("select", {
							value: j,
							onChange: (e) => M(e.target.value),
							children: Qe.map((e) => /* @__PURE__ */ (0, $.jsx)("option", {
								value: e,
								children: S[e]
							}, e))
						}),
						/* @__PURE__ */ (0, $.jsx)(W, {
							type: "button",
							className: "provider-icon-btn",
							"aria-label": "添加手动模型",
							disabled: !D.trim(),
							onClick: L,
							children: /* @__PURE__ */ (0, $.jsx)(K, {
								icon: "mdi:plus",
								width: "17"
							})
						})
					]
				})
			})
		]
	});
}
//#endregion
//#region src/components/settings/providerConnection/ProviderWebSearchPicker.tsx
function Ft({ definitions: e, providerConfigs: t, currentDefinition: n, onChoose: r }) {
	let a = i();
	return /* @__PURE__ */ (0, $.jsxs)("section", {
		className: "provider-model-section",
		children: [/* @__PURE__ */ (0, $.jsx)("div", {
			className: "provider-section-heading",
			children: /* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsx)("h4", { children: a("搜索厂商") }), /* @__PURE__ */ (0, $.jsx)("p", { children: a("选择当前使用的服务，其他厂商密钥会保留在本地") })] })
		}), /* @__PURE__ */ (0, $.jsx)("div", {
			className: "provider-picker-grid",
			children: e.map((e) => {
				let i = e.id === n.id, o = !!t[e.id]?.apiKey?.trim();
				return /* @__PURE__ */ (0, $.jsxs)("button", {
					type: "button",
					"aria-pressed": i,
					className: `provider-picker-item ${i ? "ring-1 ring-indigo-400/60 bg-indigo-500/10" : ""}`,
					onClick: () => r(e),
					children: [
						/* @__PURE__ */ (0, $.jsx)("span", {
							className: `provider-badge provider-badge--${e.id}`,
							children: e.badgeText
						}),
						/* @__PURE__ */ (0, $.jsxs)("span", {
							className: "provider-picker-copy",
							children: [/* @__PURE__ */ (0, $.jsx)("strong", { children: e.name }), /* @__PURE__ */ (0, $.jsx)("small", { children: o ? a("API Key 已配置") : e.description })]
						}),
						/* @__PURE__ */ (0, $.jsx)(K, {
							icon: i ? "mdi:check-circle" : "mdi:chevron-right",
							width: "18"
						})
					]
				}, e.id);
			})
		})]
	});
}
//#endregion
//#region src/components/settings/ProviderConnectionDialog.tsx
function It({ isOpen: e, connectionId: t, initialConfig: n, providerConfigs: r, connectedProviderIds: a, fallbackModels: o, dreaminaLoggedIn: s, dreaminaLoading: c, runninghubWorkflowApiKey: l = "", onDreaminaLogin: u, onClose: d, onSave: f }) {
	let p = i(), m = !!t && !!n, h = n?.catalogId || t || "", g = q(h, n), _ = n?.selectedModels || [], v = n?.catalogModels || [], y = g && o[g.id] || [], [b, x] = (0, Q.useState)(h), [S, w] = (0, Q.useState)(n?.name || g?.name || ""), [T, E] = (0, Q.useState)(n?.apiKey || ""), [D, O] = (0, Q.useState)(n?.baseUrl || g?.defaultBaseUrl || ""), [k, A] = (0, Q.useState)(l), [j, M] = (0, Q.useState)(Ot(Ot(y, v), _)), [N, P] = (0, Q.useState)(() => new Set(_.map((e) => e.id))), [F, I] = (0, Q.useState)(_.length > 0 || y.length > 0 ? "ready" : "idle"), [L, R] = (0, Q.useState)(v.length > 0 ? p("已加载本地缓存 {count} 个模型", { count: v.length }) : ""), [ee, te] = (0, Q.useState)(""), [z, B] = (0, Q.useState)("all"), [V, H] = (0, Q.useState)(() => new Set(n?.visibleModelCategories ?? Qe)), [U, re] = (0, Q.useState)(""), [G, ae] = (0, Q.useState)(""), [oe, se] = (0, Q.useState)("text"), [ce, le] = (0, Q.useState)(null), [fe, _e] = (0, Q.useState)(null), [ve, Y] = (0, Q.useState)(!0), [ye, be] = (0, Q.useState)(!1), [X, xe] = (0, Q.useState)(null), [Se, Ce] = (0, Q.useState)(null), we = (0, Q.useRef)(null), Z = q(b), Te = me(), Ee = ge(), De = Z?.kind === "web-search", Oe = Ee.some((e) => !!r[e.id]?.apiKey?.trim());
	(0, Q.useEffect)(() => () => we.current?.abort(), []);
	let ke = Te.filter((e) => e.kind === "web-search" ? e.id === "tavily" && (!Oe || De) : e.id === "custom-openai" || e.id === h || !a.includes(e.id)), Ae = (0, Q.useMemo)(() => {
		let e = ee.trim().toLowerCase();
		return j.filter((t) => (z === "all" || t.category === z) && (!e || t.name.toLowerCase().includes(e) || t.id.toLowerCase().includes(e)));
	}, [
		z,
		j,
		ee
	]), je = (0, Q.useMemo)(() => j.filter((e) => N.has(e.id)), [j, N]), Me = (0, Q.useMemo)(() => j.find((e) => e.id === fe), [j, fe]), Ne = (0, Q.useMemo)(() => j.find((e) => e.id === ce), [j, ce]), Pe = (0, Q.useMemo)(() => {
		if (m || Z?.id !== "custom-openai") return "";
		let e = ue(D);
		return e && Object.values(r).find((t) => t.catalogId === "custom-openai" && ue(t.baseUrl) === e)?.name?.trim() || "";
	}, [
		D,
		Z,
		m,
		r
	]), Fe = (0, Q.useMemo)(() => Z ? Z.authType === "oauth" ? !s : T.trim() ? Z.credentials.some((e) => e.required && e.key === "baseUrl" && !D.trim()) : !0 : !0, [
		T,
		D,
		Z,
		s
	]), Ie = (e) => {
		let t = e.kind === "web-search" ? r[e.id] : void 0;
		x(e.id), w(t?.name || e.name), E(t?.apiKey || ""), O(t?.baseUrl || e.defaultBaseUrl || ""), A("");
		let n = o[e.id] || [];
		M(n), P(/* @__PURE__ */ new Set()), I(n.length > 0 ? "ready" : "idle"), R(""), te(""), B("all"), H(new Set(Qe)), re(""), ae(""), se("text"), le(null), _e(null), Y(!0), be(!1), xe(null), Ce(null);
	}, Le = (e) => {
		let t = ue(D);
		if (!(!e || !t || e === t)) return O(e), e;
	}, Re = async () => {
		if (!Z || Fe) return;
		we.current?.abort();
		let e = new AbortController();
		we.current = e, I("loading"), R("");
		try {
			if (Z.id === "runninghub-model") {
				let e = await Ye("runninghub-model", T.trim());
				if (!e.success) throw Error(e.error || p("RunningHub API Key 验证失败"));
			}
			let t = await de({
				providerId: Z.id,
				config: {
					name: S.trim() || Z.name,
					apiKey: T.trim(),
					baseUrl: D.trim() || void 0,
					catalogId: Z.id
				},
				fallbackModels: o[Z.id] || [],
				signal: e.signal
			});
			M((e) => Ot(e, t.models)), I(t.warning ? "warning" : "ready");
			let n = Le(t.resolvedBaseUrl);
			R(t.warning || (n ? p("已获取 {count} 个模型，接口地址已更正为 {url}", {
				count: t.models.length,
				url: n
			}) : p("已获取 {count} 个模型", { count: t.models.length })));
		} catch (e) {
			if (e instanceof DOMException && e.name === "AbortError") return;
			I("error"), R(e instanceof Error ? e.message : p("模型列表拉取失败"));
		}
	}, ze = async () => {
		let e = C.getState();
		e.chatPanelDetached && await J(), e.openChatWithDraft(at(S.trim(), ue(D)));
	}, Be = async () => {
		if (!Z || Fe) return;
		I("loading"), R(p("正在验证 {name} 连接...", { name: Z.name }));
		let e = await Ye(Z.id, T.trim(), D.trim() || void 0);
		if (e.success) {
			let t = Le(e.baseUrl);
			I("ready"), R([
				p("{name} 连接验证成功", { name: Z.name }),
				e.balance,
				t && p("接口地址已更正为 {url}", { url: t })
			].filter(Boolean).join("，"));
			return;
		}
		I(e.unsupported ? "warning" : "error"), R(e.error || p("{name} 连接验证失败", { name: Z.name }));
	}, Ve = () => {
		_e(null), Y(!0);
	}, He = (e) => {
		N.has(e) && fe === e && Ve(), N.has(e) && ce === e && le(null), P((t) => {
			let n = new Set(t);
			return n.has(e) ? n.delete(e) : n.add(e), n;
		});
	}, Ue = () => {
		let e = Ae.length > 0 && Ae.every((e) => N.has(e.id));
		e && fe && Ae.some((e) => e.id === fe) && Ve(), e && ce && Ae.some((e) => e.id === ce) && le(null), P((t) => {
			let n = new Set(t);
			for (let t of Ae) e ? n.delete(t.id) : n.add(t.id);
			return n;
		});
	}, We = (e) => {
		H((t) => {
			let n = new Set(t);
			return n.has(e) ? n.delete(e) : n.add(e), n;
		});
	}, Ge = () => {
		H((e) => e.size === Qe.length ? /* @__PURE__ */ new Set() : new Set(Qe));
	}, Ke = () => {
		let e = U.trim();
		if (!e || !Z) return;
		let n = {
			id: e,
			name: G.trim() || e,
			category: oe,
			provider: t || Z.id,
			categoryManual: !0
		};
		M((e) => Ot(e, [n])), P((t) => new Set(t).add(e)), re(""), ae("");
	}, qe = (e, t) => {
		M((n) => n.map((n) => n.id === e ? {
			...n,
			category: t,
			categoryManual: !0,
			...t === "video" ? {} : { videoCapability: void 0 }
		} : n)), t !== "video" && ce === e && le(null), H((e) => new Set(e).add(t)), Ce(null);
	}, Je = (e, t) => {
		let n = Number.parseInt(t.replace(/[^\d]/g, ""), 10), r = Number.isFinite(n) && n > 0 ? n : void 0;
		M((t) => t.map((t) => t.id === e ? {
			...t,
			contextWindow: r
		} : t));
	}, Ze = (e, t) => {
		M((n) => n.map((n) => n.id === e ? {
			...n,
			description: t.slice(0, 500),
			descriptionManual: !0
		} : n));
	}, $e = (e, t) => {
		M((n) => n.map((n) => n.id === e ? {
			...n,
			inputModalities: t ? ["text", "image"] : ["text"],
			inputModalitiesManual: !0
		} : n));
	}, et = (e, t) => {
		M((n) => n.map((n) => n.id === e ? {
			...n,
			executionProfile: t
		} : n));
	}, tt = (e, t) => {
		M((n) => n.map((n) => n.id === e ? {
			...n,
			videoCapability: t
		} : n));
	}, nt = (e, t) => {
		M((n) => n.map((n) => n.id === e ? {
			...n,
			imageReferenceRequestMode: t
		} : n));
	}, rt = (e) => {
		if (Z?.id !== "custom-openai" || !e.baseUrl || !e.modelId || !e.category || !e.protocol) return;
		xe({
			baseUrl: D,
			models: structuredClone(j),
			selectedIds: new Set(N),
			visibleModelCategories: new Set(V),
			category: z,
			protocolModelId: fe,
			protocolValid: ve,
			catalogStatus: F,
			catalogMessage: L
		});
		let n = e.modelId, r = {
			id: n,
			name: j.find((e) => e.id === n)?.name || n,
			category: e.category,
			provider: t || Z.id,
			executionProfile: {
				preset: "custom",
				protocol: e.protocol
			},
			categoryManual: !0
		};
		O(e.baseUrl), M((e) => e.find((e) => e.id === n) ? e.map((e) => e.id === n ? {
			...e,
			category: r.category,
			executionProfile: r.executionProfile,
			categoryManual: !0
		} : e) : [...e, r]), P((e) => new Set(e).add(n)), H((e) => new Set(e).add(r.category)), B("all"), _e(n), Y(!0), I("ready"), R(p("已从接口文档导入模型 {id}，保存前可继续检查调用协议", { id: n })), be(!1);
	}, it = () => {
		X && (O(X.baseUrl), M(X.models), P(X.selectedIds), H(X.visibleModelCategories), B(X.category), _e(X.protocolModelId), Y(X.protocolValid), I(X.catalogStatus), R(X.catalogMessage), xe(null), be(!1));
	}, ot = () => {
		be(!1), xe(null), d();
	}, ct = () => {
		be(!1), xe(null), x("");
	}, lt = async () => {
		if (!Z || Fe || !De && je.length === 0 || !ve) return;
		try {
			jt(je);
		} catch (e) {
			I("error"), R(e instanceof Error ? e.message : p("视频能力配置无效"));
			return;
		}
		let e = De ? Z.id : t || he(Z.id), n = De ? {} : {
			selectedModels: je.map((t) => ({
				...t,
				provider: e
			})),
			catalogModels: pe(j, N).map((t) => ({
				...t,
				provider: e
			})),
			visibleModelCategories: Qe.filter((e) => V.has(e)),
			catalogUpdatedAt: Date.now()
		};
		await f(e, {
			name: S.trim() || Z.name,
			apiKey: Z.authType === "oauth" ? "" : T.trim(),
			baseUrl: ue(D) || void 0,
			catalogId: Z.id,
			...n
		}, Z.id === "runninghub-model" ? { runninghubWorkflowApiKey: k.trim() } : void 0);
	};
	return (0, Xe.createPortal)(/* @__PURE__ */ (0, $.jsxs)(ne, {
		isOpen: e,
		onClose: ot,
		ariaLabel: p(m ? "编辑 API 厂商" : "添加 API 厂商"),
		className: "provider-dialog",
		closeOnBackdrop: !1,
		children: [/* @__PURE__ */ (0, $.jsxs)("header", {
			className: "provider-dialog-header",
			children: [/* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsx)("span", {
				className: "provider-dialog-kicker",
				children: p(m ? "编辑连接" : "新建连接")
			}), /* @__PURE__ */ (0, $.jsx)("h3", { children: De ? p("联网搜索") : Z ? Z.name : p("选择 API 厂商") })] }), /* @__PURE__ */ (0, $.jsxs)("div", {
				className: "flex items-center gap-2",
				children: [Z?.id === "custom-openai" && /* @__PURE__ */ (0, $.jsxs)(W, {
					type: "button",
					className: "provider-secondary-btn h-7",
					onClick: () => void ze(),
					children: [/* @__PURE__ */ (0, $.jsx)(K, {
						icon: "mdi:message-processing-outline",
						width: "14"
					}), p("调用助手添加")]
				}), /* @__PURE__ */ (0, $.jsx)(ie, { onClick: ot })]
			})]
		}), Z ? /* @__PURE__ */ (0, $.jsxs)($.Fragment, { children: [/* @__PURE__ */ (0, $.jsxs)("div", {
			className: "provider-dialog-body",
			children: [
				/* @__PURE__ */ (0, $.jsx)(st, {
					editing: m,
					definition: Z,
					isWebSearchProvider: De,
					connectionName: S,
					setConnectionName: w,
					apiKey: T,
					setApiKey: E,
					baseUrl: D,
					setBaseUrl: O,
					workflowApiKey: k,
					setWorkflowApiKey: A,
					dreaminaLoggedIn: s,
					dreaminaLoading: c,
					onDreaminaLogin: u,
					duplicateConnectionName: Pe,
					catalogStatus: F,
					catalogMessage: L,
					missingCredentials: Fe,
					onReturnToPicker: ct,
					onTestConnection: Be
				}),
				De && /* @__PURE__ */ (0, $.jsx)(Ft, {
					definitions: Ee,
					providerConfigs: r,
					currentDefinition: Z,
					onChoose: Ie
				}),
				!De && /* @__PURE__ */ (0, $.jsx)(Pt, {
					definition: Z,
					models: j,
					filteredModels: Ae,
					selectedModels: je,
					selectedIds: N,
					query: ee,
					setQuery: te,
					category: z,
					setCategory: B,
					visibleModelCategories: V,
					catalogStatus: F,
					catalogMessage: L,
					missingCredentials: Fe,
					apiKey: T,
					baseUrl: D,
					setProtocolValid: Y,
					protocolImportOpen: ye,
					setProtocolImportOpen: be,
					protocolImportSnapshot: X,
					protocolModel: Me,
					videoCapabilityModel: Ne,
					setProtocolModelId: _e,
					setVideoCapabilityModelId: le,
					categoryEditModelId: Se,
					setCategoryEditModelId: Ce,
					manualModelId: U,
					setManualModelId: re,
					manualModelName: G,
					setManualModelName: ae,
					manualCategory: oe,
					setManualCategory: se,
					onToggleModel: He,
					onToggleVisibleModels: Ue,
					onToggleVisibleCategory: We,
					onToggleAllVisibleCategories: Ge,
					onAddManualModel: Ke,
					onUpdateModelCategory: qe,
					onUpdateModelContextWindow: Je,
					onUpdateModelDescription: Ze,
					onUpdateModelVisionCapability: $e,
					onUpdateModelProtocol: et,
					onUpdateVideoCapability: tt,
					onUpdateImageReferenceRequestMode: nt,
					onCloseProtocolEditor: Ve,
					onApplyProtocolImport: rt,
					onUndoProtocolImport: it,
					onFetchModels: Re
				})
			]
		}), /* @__PURE__ */ (0, $.jsxs)("footer", {
			className: "provider-dialog-footer",
			children: [/* @__PURE__ */ (0, $.jsx)("span", { children: De ? `当前使用 ${Z.name}` : je.length > 0 ? p("将启用 {count} 个模型", { count: je.length }) : p("至少选择一个模型") }), /* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsx)(W, {
				type: "button",
				className: "provider-secondary-btn",
				onClick: ot,
				children: p("取消")
			}), /* @__PURE__ */ (0, $.jsx)(W, {
				type: "button",
				className: "provider-primary-btn",
				disabled: Fe || !De && je.length === 0 || !ve,
				onClick: () => void lt(),
				children: p(m ? "保存更改" : "添加厂商")
			})] })]
		})] }) : /* @__PURE__ */ (0, $.jsx)("div", {
			className: "provider-dialog-body provider-picker-body",
			children: /* @__PURE__ */ (0, $.jsx)("div", {
				className: "provider-picker-grid",
				children: ke.map((e) => /* @__PURE__ */ (0, $.jsxs)("button", {
					type: "button",
					className: "provider-picker-item",
					onClick: () => Ie(e),
					children: [
						/* @__PURE__ */ (0, $.jsx)("span", {
							className: `provider-badge provider-badge--${e.id}`,
							children: e.badgeText
						}),
						/* @__PURE__ */ (0, $.jsxs)("span", {
							className: "provider-picker-copy",
							children: [/* @__PURE__ */ (0, $.jsx)("strong", { children: e.kind === "web-search" ? p("联网搜索") : e.name }), /* @__PURE__ */ (0, $.jsx)("small", { children: e.kind === "web-search" ? p("Tavily、博查、智谱与 Exa") : e.description })]
						}),
						/* @__PURE__ */ (0, $.jsx)(K, {
							icon: "mdi:chevron-right",
							width: "18"
						})
					]
				}, e.id))
			})
		})]
	}), document.body);
}
//#endregion
//#region src/components/settings/ApiKeySettings.tsx
function Lt(e) {
	return e.nodeTypes.includes("ai-video") ? "video" : e.nodeTypes.includes("ai-audio") ? "audio" : e.nodeTypes.includes("ai-image") || e.nodeTypes.includes("ai-animation") ? "image" : "text";
}
function Rt(e, t) {
	let n = e.baseUrl || t;
	if (!n) return "";
	try {
		let e = new URL(n);
		return `${e.host}${e.pathname.replace(/\/$/, "")}`;
	} catch {
		return n;
	}
}
function zt() {
	return "__TAURI_INTERNALS__" in window;
}
function Bt({ onClose: e }) {
	let t = i(), { config: n, updateConfig: r, setProviderConfig: a, saveProviderConfig: o, removeProviderConfig: s, saveConfig: c, pendingApiKeyConnectionId: l, setPendingApiKeyConnectionId: u } = C(ae((e) => ({
		config: e.config,
		updateConfig: e.updateConfig,
		setProviderConfig: e.setProviderConfig,
		saveProviderConfig: e.saveProviderConfig,
		removeProviderConfig: e.removeProviderConfig,
		saveConfig: e.saveConfig,
		pendingApiKeyConnectionId: e.pendingApiKeyConnectionId,
		setPendingApiKeyConnectionId: e.setPendingApiKeyConnectionId
	}))), [d, f] = (0, Q.useState)({
		open: !1,
		revision: 0
	}), [p, m] = (0, Q.useState)(), [h, g] = (0, Q.useState)({}), _ = (0, Q.useRef)(/* @__PURE__ */ new Set()), v = (0, Q.useRef)(!0), [y, b] = (0, Q.useState)(!0), [x, S] = (0, Q.useState)(!1), [w, T] = (0, Q.useState)(() => t("首次登录时会自动准备即梦组件")), [E, O] = (0, Q.useState)(!1), [k, A] = (0, Q.useState)(null), j = (0, Q.useRef)(!1), M = n.dreaminaAuth, N = fe(n), P = (0, Q.useMemo)(() => {
		let e = {};
		for (let t of me()) t.models && (e[t.id] = t.models.map((e) => ({ ...e })));
		for (let t of re) {
			let n = t.id === "runninghub" ? "runninghub-model" : t.id;
			if (!q(n)) continue;
			let r = e[n] || [];
			for (let e of t.models) {
				let t = e.value.includes("/") ? e.value.slice(e.value.indexOf("/") + 1) : e.value;
				r.some((e) => e.id === t) || r.push({
					id: t,
					name: e.label,
					category: Lt(e),
					provider: n,
					description: e.description
				});
			}
			e[n] = r;
		}
		return e;
	}, []), F = (0, Q.useMemo)(() => {
		let e = [];
		for (let [t, r] of Object.entries(n.providers)) {
			if (t === "runninghub") continue;
			let n = q(t, r);
			n && (n.kind === "web-search" && t !== N || Ve(r, n.authType) && e.push({
				id: t,
				config: r
			}));
		}
		n.providers.runninghub?.apiKey && !n.providers["runninghub-model"] && e.push({
			id: "runninghub-model",
			config: {
				name: "RunningHub",
				apiKey: "",
				catalogId: "runninghub-model"
			}
		}), M?.loggedIn && !n.providers.dreamina && e.push({
			id: "dreamina",
			config: {
				name: "即梦",
				apiKey: "",
				catalogId: "dreamina"
			}
		});
		let t = [
			"apimart",
			"xai",
			"google",
			"volcengine",
			"runninghub-model",
			"grsai",
			"dreamina",
			"web-search",
			"custom-openai"
		];
		return e.sort((e, n) => {
			let r = q(e.id, e.config), i = q(n.id, n.config), a = r?.kind === "web-search" ? "web-search" : r?.id || "custom-openai", o = i?.kind === "web-search" ? "web-search" : i?.id || "custom-openai";
			return t.indexOf(a) - t.indexOf(o);
		});
	}, [
		N,
		n.providers,
		M?.loggedIn
	]), I = (0, Q.useMemo)(() => F.map((e) => q(e.id, e.config)?.id || e.id), [F]), L = l && n.providers[l] ? l : null, R = d.open || !!L, ee = L ?? d.connectionId, te = L ? `pending-${L}` : d.revision, B = ee ? F.find((e) => e.id === ee)?.config : void 0, V = (0, Q.useCallback)(async (e, t) => D(e, t), []);
	(0, Q.useEffect)(() => {
		let e = !1;
		return z().then((t) => {
			e || b(t);
		}), () => {
			e = !0;
		};
	}, []), (0, Q.useEffect)(() => (v.current = !0, () => {
		v.current = !1;
	}), []), (0, Q.useEffect)(() => {
		let e = !1;
		for (let [t, r] of Object.entries(n.providers)) {
			let n = r.catalogId || q(t, r)?.id;
			if (n !== "sora2u") continue;
			let i = r.selectedModels?.filter((e) => le(n, e.id)), a = r.catalogModels?.filter((e) => le(n, e.id));
			i?.length === r.selectedModels?.length && a?.length === r.catalogModels?.length || (e = !0, o(t, {
				...r,
				selectedModels: i,
				catalogModels: a
			}));
		}
		e && c({ silent: !0 });
	}, [
		n.providers,
		c,
		o
	]), (0, Q.useEffect)(() => {
		for (let e of F) {
			let t = q(e.id, e.config);
			if (t?.id !== "sora2u" || !e.config.apiKey.trim()) continue;
			let n = `${e.id}\u0000${e.config.apiKey}\u0000${e.config.baseUrl || ""}`;
			_.current.has(n) || (_.current.add(n), g((t) => {
				let n = { ...t };
				return delete n[e.id], n;
			}), Ye(t.id, e.config.apiKey.trim(), e.config.baseUrl).then((t) => {
				let n = t.balance;
				!v.current || !t.success || !n || g((t) => ({
					...t,
					[e.id]: n
				}));
			}));
		}
	}, [F]);
	let H = (0, Q.useCallback)((e) => {
		A(e), e.message && T(e.message), !(e.phase !== "success" && !e.loggedIn) && (r({ dreaminaAuth: {
			loggedIn: !0,
			username: e.username || t("即梦用户"),
			credit: e.credit || void 0,
			loginTs: Date.now()
		} }), !j.current && (j.current = !0, C.getState().showToast(t("即梦登录成功")), setTimeout(() => O(!1), 800)));
	}, [t, r]), ne = (0, Q.useCallback)(async (e = !1) => {
		if (!zt()) {
			T(t("OAuth 登录仅在桌面应用中可用")), C.getState().showToast(t("OAuth 登录仅在桌面应用中可用"), "error");
			return;
		}
		j.current = !1, S(!0), A(null), O(!0);
		try {
			A(await V("dreamina_login_start", { force: e }));
		} catch (e) {
			T(typeof e == "string" ? e : e?.message || t("启动登录失败"));
		} finally {
			S(!1);
		}
	}, [t, V]), U = (0, Q.useCallback)(async () => {
		S(!0);
		try {
			zt() && await V("dreamina_logout");
		} catch {}
		r({ dreaminaAuth: void 0 }), A(null), T(t("已退出登录")), S(!1);
	}, [
		t,
		V,
		r
	]), ie = (0, Q.useCallback)(async (e) => {
		try {
			await import("./dist-js-CtV1w6rx.js").then(({ open: t }) => t(e));
		} catch {
			window.open(e, "_blank", "noopener,noreferrer");
		}
	}, []), G = (0, Q.useCallback)((e, n) => {
		navigator.clipboard?.writeText(e).catch(() => {}), C.getState().showToast(t("已复制{label}", { label: n }));
	}, [t]);
	(0, Q.useEffect)(() => {
		if (!E || !zt()) return;
		let e, t = !1;
		import("./event-h5Ir25pQ.js").then((e) => e.i).then(({ listen: e }) => e("dreamina-login-runtime", (e) => H(e.payload))).then((n) => {
			t ? n() : e = n;
		}).catch(() => {});
		let n = setInterval(async () => {
			try {
				H(await V("dreamina_login_runtime"));
			} catch {}
		}, 1500);
		return () => {
			t = !0, e?.(), clearInterval(n);
		};
	}, [
		H,
		E,
		V
	]), (0, Q.useEffect)(() => {
		!zt() || !M?.loggedIn || V("dreamina_status").then((e) => {
			e.loggedIn && (A(e), T(t("即梦已登录")), r({ dreaminaAuth: {
				loggedIn: !0,
				username: e.username || t("即梦用户"),
				credit: e.credit || void 0,
				loginTs: M.loginTs || Date.now()
			} }));
		}).catch(() => {});
	}, []);
	let oe = async (e) => {
		let r = n.providers[e];
		if (!r) return;
		let i = await ce(Le(r));
		C.getState().showToast(t(i ? "连接配置已复制（不含 API Key）" : "复制失败"), i ? "success" : "error");
	}, ue = async () => {
		let e = Be(await se());
		if (!e) {
			C.getState().showToast(t("剪贴板里没有可导入的连接配置"), "error");
			return;
		}
		let r = q(e.catalogId);
		if (!r || r.authType === "oauth") {
			C.getState().showToast(t("该连接类型不支持导入"), "error");
			return;
		}
		let i = he(e.catalogId);
		if (n.providers[i]) {
			C.getState().showToast(t("已存在 {name} 连接，请先删除后再导入", { name: r.name }), "error");
			return;
		}
		let a = e.config.selectedModels?.map((e) => ({
			...e,
			provider: i
		}));
		o(i, {
			...e.config,
			selectedModels: a,
			catalogModels: e.config.catalogModels?.map((e) => ({
				...e,
				provider: i
			}))
		}), await c(), C.getState().showToast(t("已导入连接，请补填 API Key")), u(i);
	}, de = () => {
		u(null), f((e) => ({
			open: !0,
			connectionId: void 0,
			revision: e.revision + 1
		}));
	}, pe = (e) => {
		u(null), f((t) => ({
			open: !0,
			connectionId: e,
			revision: t.revision + 1
		}));
	}, _e = () => {
		u(null), f((e) => ({
			open: !1,
			connectionId: void 0,
			revision: e.revision
		}));
	}, ve = async (e, t, i) => {
		o(e, t);
		let l = q(e, t);
		l?.kind === "web-search" ? r({ webSearchProviderId: l.id }) : i?.runninghubWorkflowApiKey ? a("runninghub", {
			name: "RunningHub 工作流",
			apiKey: i.runninghubWorkflowApiKey
		}) : i && n.providers.runninghub && await s("runninghub"), await c(), _e();
	}, J = async (e) => {
		let t = n.providers[e], i = q(e, t);
		if (e === "dreamina" && await U(), i?.kind === "web-search") {
			for (let e of ge()) await s(e.id);
			r({ webSearchProviderId: void 0 });
		} else await s(e);
		e === "runninghub-model" && await s("runninghub"), m(void 0), await c();
	};
	return /* @__PURE__ */ (0, $.jsxs)("div", {
		className: "settings-pane",
		children: [
			/* @__PURE__ */ (0, $.jsxs)("div", {
				className: "settings-pane-heading",
				children: [/* @__PURE__ */ (0, $.jsx)("h2", {
					className: "settings-pane-title",
					children: "API Key"
				}), /* @__PURE__ */ (0, $.jsxs)("div", {
					className: "flex items-center gap-1.5",
					children: [/* @__PURE__ */ (0, $.jsx)(W, {
						type: "button",
						className: "settings-add-provider-btn",
						"aria-label": t("从剪贴板导入连接"),
						"data-tooltip": t("从剪贴板导入连接"),
						onClick: () => void ue(),
						children: /* @__PURE__ */ (0, $.jsx)(K, {
							icon: "mdi:clipboard-arrow-down-outline",
							width: "17"
						})
					}), /* @__PURE__ */ (0, $.jsx)(W, {
						type: "button",
						className: "settings-add-provider-btn",
						"aria-label": t("添加 API 厂商"),
						"data-tooltip": t("添加 API 厂商"),
						onClick: de,
						children: /* @__PURE__ */ (0, $.jsx)(K, {
							icon: "mdi:plus",
							width: "18"
						})
					})]
				})]
			}),
			/* @__PURE__ */ (0, $.jsxs)("div", {
				className: "settings-pane-body provider-settings-body",
				children: [!y && /* @__PURE__ */ (0, $.jsxs)("p", {
					className: "provider-secret-warning",
					children: [/* @__PURE__ */ (0, $.jsx)(K, {
						icon: "mdi:shield-alert-outline",
						width: "14"
					}), t("当前环境无法保存凭据，API Key 不会写入本地，仅本次会话有效。")]
				}), F.length === 0 ? /* @__PURE__ */ (0, $.jsxs)("div", {
					className: "provider-empty-state",
					children: [
						/* @__PURE__ */ (0, $.jsx)("span", {
							className: "provider-empty-icon",
							children: /* @__PURE__ */ (0, $.jsx)(K, {
								icon: "mdi:key-chain-variant",
								width: "24"
							})
						}),
						/* @__PURE__ */ (0, $.jsx)("strong", { children: t("尚未添加 API 厂商") }),
						/* @__PURE__ */ (0, $.jsxs)(W, {
							type: "button",
							className: "provider-primary-btn",
							onClick: de,
							children: [/* @__PURE__ */ (0, $.jsx)(K, {
								icon: "mdi:plus",
								width: "15"
							}), t("添加厂商")]
						})
					]
				}) : /* @__PURE__ */ (0, $.jsx)("div", {
					className: "provider-connection-list",
					children: F.map((e) => {
						let r = q(e.id, e.config);
						if (!r) return null;
						let i = e.config.selectedModels?.length, a = Rt(e.config, r.defaultBaseUrl), o = r.id === "dreamina", s = r.id === "runninghub-model", c = r.kind === "web-search", l = r.authType !== "oauth" && !e.config.apiKey.trim(), u = s && !!e.config.apiKey.trim(), d = s && !!n.providers.runninghub?.apiKey.trim(), f = Number(u) + Number(d), g = c ? t("联网搜索") : r.id === "custom-openai" && e.config.name.trim() || r.name, _ = o ? t("OAuth 已连接") : s ? t("{count}/2 密钥已配置", { count: f }) : t(l ? "待填写 API Key" : "已连接");
						return /* @__PURE__ */ (0, $.jsxs)("div", {
							className: "provider-connection-card",
							children: [
								/* @__PURE__ */ (0, $.jsx)("div", {
									className: `provider-badge provider-badge--${r.id}`,
									children: r.badgeText
								}),
								/* @__PURE__ */ (0, $.jsxs)("div", {
									className: "provider-connection-copy",
									children: [/* @__PURE__ */ (0, $.jsxs)("div", {
										className: "provider-connection-title-row",
										children: [
											/* @__PURE__ */ (0, $.jsx)("strong", { children: g }),
											/* @__PURE__ */ (0, $.jsx)("span", {
												className: `provider-list-status${l || s && f < 2 ? " is-limited" : ""}`,
												children: _
											}),
											h[e.id] && /* @__PURE__ */ (0, $.jsx)("span", {
												className: "shrink-0 text-xs font-medium text-canvas-text-secondary",
												children: h[e.id]
											})
										]
									}), /* @__PURE__ */ (0, $.jsx)("div", {
										className: "provider-connection-meta",
										children: s ? /* @__PURE__ */ (0, $.jsxs)($.Fragment, { children: [
											/* @__PURE__ */ (0, $.jsx)("span", { children: t(u ? "企业级-共享已配置" : "企业级-共享未配置") }),
											/* @__PURE__ */ (0, $.jsx)("span", { children: t(d ? "消费级-会员已配置" : "消费级-会员未配置") }),
											u && /* @__PURE__ */ (0, $.jsx)("span", { children: i === void 0 ? t("沿用内置模型目录") : t("{count} 个模型", { count: i }) })
										] }) : c ? /* @__PURE__ */ (0, $.jsxs)($.Fragment, { children: [/* @__PURE__ */ (0, $.jsx)("span", { children: t("当前厂商：{name}", { name: r.name }) }), a && /* @__PURE__ */ (0, $.jsx)("span", { children: a })] }) : /* @__PURE__ */ (0, $.jsxs)($.Fragment, { children: [/* @__PURE__ */ (0, $.jsx)("span", { children: i === void 0 ? t("沿用内置模型目录") : t("{count} 个模型", { count: i }) }), a && /* @__PURE__ */ (0, $.jsx)("span", { children: a })] })
									})]
								}),
								p === e.id ? /* @__PURE__ */ (0, $.jsxs)("div", {
									className: "provider-delete-confirm",
									children: [
										/* @__PURE__ */ (0, $.jsx)("span", { children: t("移除此连接？") }),
										/* @__PURE__ */ (0, $.jsx)(W, {
											type: "button",
											className: "provider-icon-btn",
											"aria-label": t("取消删除"),
											onClick: () => m(void 0),
											children: /* @__PURE__ */ (0, $.jsx)(K, {
												icon: "mdi:close",
												width: "15"
											})
										}),
										/* @__PURE__ */ (0, $.jsx)(W, {
											type: "button",
											className: "provider-icon-btn is-danger",
											"aria-label": t("确认删除"),
											onClick: () => void J(e.id),
											children: /* @__PURE__ */ (0, $.jsx)(K, {
												icon: "mdi:check",
												width: "15"
											})
										})
									]
								}) : /* @__PURE__ */ (0, $.jsxs)("div", {
									className: "provider-card-actions",
									children: [
										!o && !c && /* @__PURE__ */ (0, $.jsx)(W, {
											type: "button",
											className: "provider-icon-btn",
											"aria-label": t("复制 {name} 配置", { name: r.name }),
											"data-tooltip": t("复制配置（不含 API Key）"),
											onClick: () => void oe(e.id),
											children: /* @__PURE__ */ (0, $.jsx)(K, {
												icon: "mdi:content-copy",
												width: "15"
											})
										}),
										/* @__PURE__ */ (0, $.jsx)(W, {
											type: "button",
											className: "provider-icon-btn",
											"aria-label": t("编辑 {name}", { name: r.name }),
											"data-tooltip": t("编辑连接"),
											onClick: () => pe(e.id),
											children: /* @__PURE__ */ (0, $.jsx)(K, {
												icon: "mdi:pencil-outline",
												width: "16"
											})
										}),
										/* @__PURE__ */ (0, $.jsx)(W, {
											type: "button",
											className: "provider-icon-btn",
											"aria-label": t("删除 {name}", { name: r.name }),
											"data-tooltip": t("删除连接"),
											onClick: () => m(e.id),
											children: /* @__PURE__ */ (0, $.jsx)(K, {
												icon: "mdi:trash-can-outline",
												width: "16"
											})
										})
									]
								})
							]
						}, e.id);
					})
				})]
			}),
			/* @__PURE__ */ (0, $.jsx)("div", {
				className: "settings-pane-footer",
				children: /* @__PURE__ */ (0, $.jsx)("div", {
					className: "settings-save-row",
					children: /* @__PURE__ */ (0, $.jsx)(W, {
						type: "button",
						className: "settings-save-btn",
						onClick: async () => {
							await c(), e();
						},
						children: t("完成")
					})
				})
			}),
			/* @__PURE__ */ (0, $.jsx)(It, {
				isOpen: R,
				connectionId: ee,
				initialConfig: B,
				providerConfigs: n.providers,
				connectedProviderIds: I,
				fallbackModels: P,
				dreaminaLoggedIn: !!M?.loggedIn,
				dreaminaLoading: x,
				runninghubWorkflowApiKey: n.providers.runninghub?.apiKey,
				onDreaminaLogin: () => void ne(!!M?.loggedIn),
				onClose: _e,
				onSave: ve
			}, te),
			/* @__PURE__ */ (0, $.jsx)(Ze, {
				isOpen: E,
				runtime: k,
				onClose: () => O(!1),
				onOpenUrl: ie,
				onCopy: G
			}),
			/* @__PURE__ */ (0, $.jsx)("span", {
				className: "sr-only",
				"aria-live": "polite",
				children: w
			})
		]
	});
}
//#endregion
//#region src/services/fs/storageHealth.ts
async function Vt(e) {
	let t = [];
	if (!P()) return t;
	try {
		let n = await O(e);
		for (let r of n) {
			let n = F(e, r.name);
			if (r.isDirectory) {
				if (r.name === ".trash" || r.name === "AppData") continue;
				let e = await Vt(n);
				t.push(...e);
			} else if (r.isFile) try {
				let e = await k(n);
				t.push({
					name: r.name,
					path: n,
					size: e.size ?? 0
				});
			} catch {}
		}
	} catch {}
	return t;
}
async function Ht(e) {
	if (!P()) return null;
	let t = await L(e.id);
	if (!t) return {
		projectId: e.id,
		projectName: e.name,
		dataDir: null,
		fileSize: 0,
		fileCount: 0,
		categories: {}
	};
	let n = await Vt(t), r = {}, i = 0;
	for (let e of n) {
		let t = Ut(e.name);
		r[t] || (r[t] = {
			count: 0,
			size: 0
		}), r[t].count++, r[t].size += e.size, i += e.size;
	}
	return {
		projectId: e.id,
		projectName: e.name,
		dataDir: t,
		fileSize: i,
		fileCount: n.length,
		categories: r
	};
}
function Ut(e) {
	let t = `.${e.split(".").pop()?.toLowerCase()}`;
	return [
		".png",
		".jpg",
		".jpeg",
		".gif",
		".webp",
		".svg",
		".bmp"
	].includes(t) ? "图片" : [
		".mp4",
		".webm",
		".mov",
		".avi",
		".mkv"
	].includes(t) ? "视频" : [
		".mp3",
		".wav",
		".ogg",
		".aac",
		".flac"
	].includes(t) ? "音频" : [
		".txt",
		".md",
		".json",
		".csv",
		".xml",
		".html"
	].includes(t) ? "文本" : "其他";
}
async function Wt(e) {
	if (!P()) return null;
	let t = await L(e.id);
	if (!t) return null;
	let n = F(t, ".trash");
	try {
		if (!await A(n)) return null;
		let t = await Vt(n), r = t.reduce((e, t) => e + t.size, 0);
		return {
			projectId: e.id,
			projectName: e.name,
			trashDir: n,
			trashSize: r,
			fileCount: t.length
		};
	} catch {
		return null;
	}
}
async function Gt(e, t) {
	if (!P()) return [];
	let n = await L(e.id);
	return n ? (await Vt(n)).filter((e) => !t.has(e.path)).map((t) => ({
		path: t.path,
		name: t.name,
		size: t.size,
		projectId: e.id,
		projectName: e.name
	})) : [];
}
async function Kt(e) {
	if (!P()) return [];
	let t = [];
	for (let n of e) {
		let e = await L(n.id);
		if (!e) continue;
		let r = await Vt(e);
		for (let e of r) t.push({
			path: e.path,
			name: e.name,
			size: e.size,
			projectId: n.id,
			projectName: n.name
		});
	}
	let n = /* @__PURE__ */ new Map();
	for (let e of t) {
		let t = `${e.size}|${e.name}`;
		n.has(t) || n.set(t, []), n.get(t).push(e);
	}
	return Array.from(n.values()).filter((e) => e.length >= 2).map((e) => ({
		key: `${e[0].size}|${e[0].name}`,
		files: e,
		reclaimableSize: e[0].size * (e.length - 1)
	}));
}
function qt(e) {
	let t = /* @__PURE__ */ new Set();
	for (let n of e) {
		let e = n.data?.filePath;
		e && typeof e == "string" && t.add(e);
	}
	return t;
}
async function Jt(e, t, n = []) {
	let r = {
		projects: [],
		trashes: [],
		orphans: [],
		duplicates: [],
		offlineFolders: [],
		scannedAt: Date.now(),
		totalSize: 0,
		reclaimableSize: 0
	};
	if (!P()) return r;
	for (let t of e) {
		let e = await Ht(t);
		e && (r.projects.push(e), r.totalSize += e.fileSize);
	}
	for (let t of e) {
		let e = await Wt(t);
		e && (r.trashes.push(e), r.reclaimableSize += e.trashSize);
	}
	for (let n of e) {
		let e = await Gt(n, t);
		r.orphans.push(...e), r.reclaimableSize += e.reduce((e, t) => e + t.size, 0);
	}
	r.duplicates = await Kt(e);
	for (let e of r.duplicates) r.reclaimableSize += e.reclaimableSize;
	for (let e of n) try {
		await A(e.path) || r.offlineFolders.push({
			path: e.path,
			label: e.label,
			online: !1
		});
	} catch {
		r.offlineFolders.push({
			path: e.path,
			label: e.label,
			online: !1
		});
	}
	return r;
}
async function Yt(e) {
	if (P()) try {
		if (!await A(e)) return;
		let t = await O(e);
		for (let n of t) {
			let t = F(e, n.name);
			try {
				n.isFile ? await j(t) : n.isDirectory && (await Xt(t), await j(t));
			} catch {}
		}
		await j(e).catch(() => {});
	} catch {}
}
async function Xt(e) {
	try {
		let t = await O(e);
		for (let n of t) {
			let t = F(e, n.name);
			n.isDirectory && await Xt(t), await j(t).catch(() => {});
		}
	} catch {}
}
async function Zt(e) {
	if (!P()) return !1;
	try {
		return await j(e), !0;
	} catch {
		return !1;
	}
}
async function Qt(e) {
	if (!P()) return !1;
	try {
		return await j(e), !0;
	} catch {
		return !1;
	}
}
//#endregion
//#region src/components/settings/StorageHealthCenter.tsx
var $t = {
	图片: "#34d399",
	视频: "#60a5fa",
	音频: "#fbbf24",
	文本: "#a78bfa",
	其他: "#94a3b8"
}, en = [
	"#6366f1",
	"#22d3ee",
	"#34d399",
	"#f472b6",
	"#fbbf24",
	"#a78bfa",
	"#fb923c",
	"#38bdf8",
	"#4ade80",
	"#facc15"
];
function tn(e, t = 42) {
	if (e.length <= t) return e;
	let n = e.replace(/\\/g, "/").split("/");
	if (n.length <= 2) return e;
	let r = n.slice(0, 1).join("/"), i = `${r}/.../${n.slice(-2).join("/")}`;
	return i.length > t ? `${r}/.../${n[n.length - 1]}` : i;
}
function nn(e, t, n, r) {
	let i = (r - 90) * Math.PI / 180;
	return {
		x: e + n * Math.cos(i),
		y: t + n * Math.sin(i)
	};
}
function rn(e, t, n, r, i, a, o, s) {
	let c = i + s / 2, l = a - s / 2, u = l - c;
	if (u <= 0) return "";
	let d = +(u > 180), f = Math.PI / 180 * u, p = Math.min(o, (r - n) / 2, n * f / 2), m = p / r * (180 / Math.PI), h = p / n * (180 / Math.PI), g = nn(e, t, r, c + m), _ = nn(e, t, r, l - m), v = nn(e, t, r, l), y = nn(e, t, r - p, l), b = nn(e, t, n + p, l), x = nn(e, t, n, l), S = nn(e, t, n, l - h), C = nn(e, t, n, c + h), w = nn(e, t, n, c), T = nn(e, t, n + p, c), E = nn(e, t, r - p, c), D = nn(e, t, r, c);
	return [
		`M ${g.x} ${g.y}`,
		`A ${r} ${r} 0 ${d} 1 ${_.x} ${_.y}`,
		`Q ${v.x} ${v.y} ${y.x} ${y.y}`,
		`L ${b.x} ${b.y}`,
		`Q ${x.x} ${x.y} ${S.x} ${S.y}`,
		`A ${n} ${n} 0 ${d} 0 ${C.x} ${C.y}`,
		`Q ${w.x} ${w.y} ${T.x} ${T.y}`,
		`L ${E.x} ${E.y}`,
		`Q ${D.x} ${D.y} ${g.x} ${g.y}`,
		"Z"
	].join(" ");
}
function an({ segments: e, total: t, size: n = 160 }) {
	let r = i(), a = n / 2, o = n / 2, s = n * .27, c = n * .46, l = n * .02, [u, d] = (0, Q.useState)(null);
	if (e.length === 0 || t === 0) return /* @__PURE__ */ (0, $.jsxs)("div", {
		className: "flex flex-col items-center gap-3",
		children: [/* @__PURE__ */ (0, $.jsxs)("svg", {
			width: n,
			height: n,
			viewBox: `0 0 ${n} ${n}`,
			children: [/* @__PURE__ */ (0, $.jsx)("circle", {
				cx: a,
				cy: o,
				r: c,
				fill: "none",
				stroke: "#1a1a26",
				strokeWidth: c - s
			}), /* @__PURE__ */ (0, $.jsx)("text", {
				x: a,
				y: o,
				textAnchor: "middle",
				fill: "#e8e8ed",
				fontSize: "13",
				fontWeight: "600",
				children: "0 B"
			})]
		}), /* @__PURE__ */ (0, $.jsx)("div", {
			className: "text-[11px] text-canvas-text-muted",
			children: r("暂无数据")
		})]
	});
	let f = 0, p = [];
	for (let n of e) {
		let e = n.value / t * 360;
		p.push({
			...n,
			start: f,
			sweep: e,
			pct: n.value / t * 100
		}), f += e;
	}
	return /* @__PURE__ */ (0, $.jsxs)("div", {
		className: "flex flex-col items-center gap-3",
		children: [/* @__PURE__ */ (0, $.jsx)("div", {
			className: "flex flex-wrap justify-center gap-x-3 gap-y-1",
			children: p.map((e, t) => /* @__PURE__ */ (0, $.jsxs)("div", {
				className: "flex items-center gap-1.5 text-[11px] cursor-default",
				onMouseEnter: () => d(t),
				onMouseLeave: () => d(null),
				children: [/* @__PURE__ */ (0, $.jsx)("span", {
					className: "w-2.5 h-2.5 rounded-sm shrink-0",
					style: { backgroundColor: e.color }
				}), /* @__PURE__ */ (0, $.jsx)("span", {
					className: "text-canvas-text-secondary",
					children: r(e.label)
				})]
			}, t))
		}), /* @__PURE__ */ (0, $.jsxs)("svg", {
			width: n,
			height: n,
			viewBox: `0 0 ${n} ${n}`,
			children: [p.map((e, t) => /* @__PURE__ */ (0, $.jsx)("path", {
				d: rn(a, o, s, c, e.start, e.start + e.sweep, l, 2),
				fill: e.color,
				onMouseEnter: () => d(t),
				onMouseLeave: () => d(null),
				style: {
					cursor: "pointer",
					opacity: u === null || u === t ? .92 : .4,
					transition: "opacity 0.2s ease",
					filter: u === t ? "drop-shadow(0 0 3px rgba(0,0,0,0.3))" : void 0
				}
			}, t)), u === null ? /* @__PURE__ */ (0, $.jsxs)($.Fragment, { children: [/* @__PURE__ */ (0, $.jsx)("text", {
				x: a,
				y: o - 4,
				textAnchor: "middle",
				dominantBaseline: "middle",
				fill: "#e8e8ed",
				fontSize: "15",
				fontWeight: "600",
				children: g(t).split(" ")[0]
			}), /* @__PURE__ */ (0, $.jsxs)("text", {
				x: a,
				y: o + 13,
				textAnchor: "middle",
				dominantBaseline: "middle",
				fill: "#8888a0",
				fontSize: "11",
				children: ["/ ", g(t).split(" ")[1] || "B"]
			})] }) : /* @__PURE__ */ (0, $.jsxs)($.Fragment, { children: [/* @__PURE__ */ (0, $.jsxs)("text", {
				x: a,
				y: o - 12,
				textAnchor: "middle",
				fill: "#e8e8ed",
				fontSize: "20",
				fontWeight: "bold",
				children: [p[u].pct.toFixed(0), "%"]
			}), /* @__PURE__ */ (0, $.jsx)("text", {
				x: a,
				y: o + 8,
				textAnchor: "middle",
				fill: "#e8e8ed",
				fontSize: "15",
				fontWeight: "600",
				children: g(p[u].value)
			})] })]
		})]
	});
}
function on({ items: e }) {
	let t = i(), n = e.reduce((e, t) => e + t.value, 0);
	if (e.length === 0 || n === 0) return /* @__PURE__ */ (0, $.jsx)("div", {
		className: "flex items-center justify-center py-8 text-xs text-canvas-text-muted",
		children: t("暂无项目数据")
	});
	let r = e.map((e) => ({
		...e,
		pct: e.value / n * 100
	}));
	return /* @__PURE__ */ (0, $.jsxs)("div", {
		className: "space-y-3",
		children: [/* @__PURE__ */ (0, $.jsx)("div", {
			className: "flex h-6 rounded-lg overflow-hidden bg-canvas-surface border border-canvas-border",
			children: r.map((e, n) => {
				let i = n === 0, a = n === r.length - 1;
				return /* @__PURE__ */ (0, $.jsx)("div", {
					className: "h-full transition-[width] duration-500 ease-out motion-reduce:transition-none relative group min-w-[3px]",
					style: {
						width: `${e.pct}%`,
						backgroundColor: e.color,
						opacity: .88,
						borderRadius: i ? "7px 0 0 7px" : a ? "0 7px 7px 0" : void 0
					},
					title: `${t(e.label)}: ${g(e.value)} (${e.pct.toFixed(1)}%)`
				}, n);
			})
		}), /* @__PURE__ */ (0, $.jsx)("div", {
			className: "flex flex-wrap gap-x-4 gap-y-1.5",
			children: r.map((e, n) => /* @__PURE__ */ (0, $.jsxs)("div", {
				className: "flex items-center gap-1.5 text-[11px]",
				children: [
					/* @__PURE__ */ (0, $.jsx)("span", {
						className: "w-2.5 h-2.5 rounded-sm shrink-0",
						style: { backgroundColor: e.color }
					}),
					/* @__PURE__ */ (0, $.jsx)("span", {
						className: "text-canvas-text-secondary truncate max-w-[80px]",
						title: t(e.label),
						children: t(e.label)
					}),
					/* @__PURE__ */ (0, $.jsxs)("span", {
						className: "text-canvas-text-muted tabular-nums",
						children: [e.pct.toFixed(0), "%"]
					}),
					/* @__PURE__ */ (0, $.jsx)("span", {
						className: "text-canvas-text-muted tabular-nums",
						children: g(e.value)
					})
				]
			}, n))
		})]
	});
}
function sn() {
	let e = i(), { projects: t, nodes: n, showToast: r } = C(ae((e) => ({
		projects: e.projects,
		currentProjectId: e.currentProjectId,
		nodes: e.nodes,
		showToast: e.showToast
	}))), [a, o] = (0, Q.useState)(!1), [s, c] = (0, Q.useState)(null), [l, d] = (0, Q.useState)(null), [f, p] = (0, Q.useState)("overview"), [m, h] = (0, Q.useState)(/* @__PURE__ */ new Set()), _ = (0, Q.useRef)(!1), v = (0, Q.useCallback)(async () => {
		o(!0);
		try {
			u().then(d);
			let i = await Jt(t, qt(n), []);
			c(i), _.current = !0;
			let a = g(i.totalSize), o = g(i.reclaimableSize), s = i.trashes.length + i.orphans.length + i.duplicates.length + i.offlineFolders.length;
			s > 0 ? r(e("总占用 {total}，可释放 {reclaim}，发现 {count} 个问题", {
				total: a,
				reclaim: o,
				count: s
			}), i.reclaimableSize > 0 ? "info" : "success") : r(e("总占用 {total}，一切正常", { total: a }));
		} catch (t) {
			console.error("Storage scan failed:", t), r(e("扫描失败，请重试"), "error");
		} finally {
			o(!1);
		}
	}, [
		t,
		n,
		r,
		e
	]);
	(0, Q.useEffect)(() => (_.current || v(), () => {
		_.current = !1;
	}), []);
	let y = (0, Q.useCallback)(async (t) => {
		h((e) => new Set(e).add(t.trashDir));
		try {
			await Yt(t.trashDir), r(e("已清空「{name}」的回收站缓存", { name: t.projectName })), _.current = !1, await v();
		} catch {
			r(e("清理失败"), "error");
		} finally {
			h((e) => {
				let n = new Set(e);
				return n.delete(t.trashDir), n;
			});
		}
	}, [
		r,
		v,
		e
	]), b = (0, Q.useCallback)(async (t) => {
		h((e) => new Set(e).add(t.path));
		try {
			await Zt(t.path) ? (r(e("已删除：{name}", { name: t.name })), _.current = !1, await v()) : r(e("删除失败"), "error");
		} catch {
			r(e("删除失败"), "error");
		} finally {
			h((e) => {
				let n = new Set(e);
				return n.delete(t.path), n;
			});
		}
	}, [
		r,
		v,
		e
	]), x = (0, Q.useCallback)(async (t) => {
		h((e) => new Set(e).add(t.path));
		try {
			await Qt(t.path) ? (r(e("已删除：{name}", { name: t.name })), _.current = !1, await v()) : r(e("删除失败"), "error");
		} catch {
			r(e("删除失败"), "error");
		} finally {
			h((e) => {
				let n = new Set(e);
				return n.delete(t.path), n;
			});
		}
	}, [
		r,
		v,
		e
	]), S = (0, Q.useCallback)(async () => {
		if (s) {
			for (let e of s.trashes) await Yt(e.trashDir);
			r(e("已清空所有回收站缓存")), _.current = !1, await v();
		}
	}, [
		s,
		r,
		v,
		e
	]), w = (0, Q.useCallback)(async () => {
		if (!s) return;
		let t = 0;
		for (let e of s.orphans) await Zt(e.path) && t++;
		r(e("已删除 {count} 个孤儿文件", { count: t })), _.current = !1, await v();
	}, [
		s,
		r,
		v,
		e
	]), T = (0, Q.useMemo)(() => {
		if (!s) return null;
		let t = {};
		for (let e of s.projects) for (let [n, r] of Object.entries(e.categories)) t[n] = (t[n] || 0) + r.size;
		return {
			donutSegments: Object.entries(t).map(([e, t]) => ({
				label: e,
				value: t,
				color: $t[e] || "#94a3b8"
			})).sort((e, t) => t.value - e.value),
			projectBars: s.projects.map((e, t) => ({
				label: e.projectName,
				value: e.fileSize,
				color: en[t % en.length]
			})).sort((e, t) => t.value - e.value),
			issueSections: [
				{
					id: "trash",
					label: e("回收站残留"),
					count: s.trashes.length,
					totalSize: s.trashes.reduce((e, t) => e + t.trashSize, 0),
					color: "#fbbf24"
				},
				{
					id: "orphans",
					label: e("孤儿文件"),
					count: s.orphans.length,
					totalSize: s.orphans.reduce((e, t) => e + t.size, 0),
					color: "#f472b6"
				},
				{
					id: "duplicates",
					label: e("重复文件"),
					count: s.duplicates.length,
					totalSize: s.duplicates.reduce((e, t) => e + t.reclaimableSize, 0),
					color: "#fb923c"
				},
				{
					id: "offline",
					label: e("离线文件夹"),
					count: s.offlineFolders.length,
					totalSize: 0,
					color: "#ef4444"
				}
			].filter((e) => e.count > 0)
		};
	}, [s, e]), E = !s || s.projects.length === 0 && s.trashes.length === 0;
	return /* @__PURE__ */ (0, $.jsxs)("div", {
		className: "space-y-5",
		children: [
			/* @__PURE__ */ (0, $.jsxs)("div", {
				className: "flex items-center justify-between",
				children: [/* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsx)("h3", {
					className: "text-sm font-semibold text-canvas-text",
					children: e("存储健康中心")
				}), /* @__PURE__ */ (0, $.jsx)("p", {
					className: "text-[11px] text-canvas-text-muted mt-0.5",
					children: e("检测各项目的存储占用与可优化空间")
				})] }), /* @__PURE__ */ (0, $.jsx)(W, {
					type: "button",
					className: "flex items-center gap-1.5 px-3 py-2 rounded-lg text-xs font-medium bg-indigo-500/15 text-indigo-400 hover:bg-indigo-500/25 transition-colors",
					onClick: v,
					disabled: a,
					children: a ? /* @__PURE__ */ (0, $.jsxs)($.Fragment, { children: [/* @__PURE__ */ (0, $.jsx)("svg", {
						className: "animate-spin",
						width: "13",
						height: "13",
						viewBox: "0 0 24 24",
						fill: "none",
						stroke: "currentColor",
						strokeWidth: "2.5",
						children: /* @__PURE__ */ (0, $.jsx)("circle", {
							cx: "12",
							cy: "12",
							r: "10",
							strokeDasharray: "32",
							strokeDashoffset: "8"
						})
					}), e("扫描中…")] }) : /* @__PURE__ */ (0, $.jsxs)($.Fragment, { children: [/* @__PURE__ */ (0, $.jsxs)("svg", {
						width: "13",
						height: "13",
						viewBox: "0 0 24 24",
						fill: "none",
						stroke: "currentColor",
						strokeWidth: "2",
						children: [/* @__PURE__ */ (0, $.jsx)("polyline", { points: "1 4 1 10 7 10" }), /* @__PURE__ */ (0, $.jsx)("path", { d: "M3.51 15a9 9 0 102.13-9.36L1 10" })]
					}), e("重新扫描")] })
				})]
			}),
			l && l.quota > 0 && (() => {
				let t = Math.min(1, l.ratio), n = t >= .85;
				return /* @__PURE__ */ (0, $.jsxs)("div", {
					className: `rounded-[10px] p-3 border ${n ? "border-amber-500/40 bg-amber-500/10" : "border-canvas-border bg-canvas-card"}`,
					children: [
						/* @__PURE__ */ (0, $.jsxs)("div", {
							className: "flex items-center justify-between mb-2",
							children: [/* @__PURE__ */ (0, $.jsx)("div", {
								className: "text-xs font-medium text-canvas-text",
								children: e("浏览器存储配额")
							}), /* @__PURE__ */ (0, $.jsxs)("div", {
								className: "text-[11px] text-canvas-text-secondary",
								children: [
									g(l.usage),
									" / ",
									g(l.quota),
									"（",
									(t * 100).toFixed(1),
									"%）"
								]
							})]
						}),
						/* @__PURE__ */ (0, $.jsx)("div", {
							className: "h-2 rounded-full bg-canvas-hover overflow-hidden",
							children: /* @__PURE__ */ (0, $.jsx)("div", {
								className: `h-full rounded-full transition-[width] ${n ? "bg-amber-400" : "bg-indigo-400"}`,
								style: { width: `${Math.max(2, t * 100)}%` }
							})
						}),
						/* @__PURE__ */ (0, $.jsx)("p", {
							className: "text-[11px] text-canvas-text-muted mt-1.5",
							children: e(n ? "配额即将用尽，自动保存可能失败，建议清理下方可释放空间或导出并删除旧项目" : "项目画布数据存放在浏览器存储中，配额用尽会导致自动保存失败")
						})
					]
				});
			})(),
			a && !s && /* @__PURE__ */ (0, $.jsxs)("div", {
				className: "flex flex-col items-center justify-center py-8 gap-3",
				children: [/* @__PURE__ */ (0, $.jsx)("svg", {
					className: "animate-spin text-indigo-400",
					width: "32",
					height: "32",
					viewBox: "0 0 24 24",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: "2",
					children: /* @__PURE__ */ (0, $.jsx)("circle", {
						cx: "12",
						cy: "12",
						r: "10",
						strokeDasharray: "32",
						strokeDashoffset: "8"
					})
				}), /* @__PURE__ */ (0, $.jsx)("p", {
					className: "text-xs text-canvas-text-secondary",
					children: e("正在分析存储状况…")
				})]
			}),
			s && !E && T && /* @__PURE__ */ (0, $.jsxs)("div", {
				className: "space-y-5",
				children: [
					/* @__PURE__ */ (0, $.jsx)("div", {
						className: "bg-canvas-card border border-canvas-border rounded-[10px] p-3",
						children: /* @__PURE__ */ (0, $.jsxs)("div", {
							className: "flex items-center gap-6",
							children: [/* @__PURE__ */ (0, $.jsx)(an, {
								segments: T.donutSegments,
								total: s.totalSize,
								size: 160
							}), /* @__PURE__ */ (0, $.jsxs)("div", {
								className: "flex-1 space-y-2.5",
								children: [
									/* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsx)("div", {
										className: "text-[11px] text-canvas-text-muted mb-0.5",
										children: e("总占用空间")
									}), /* @__PURE__ */ (0, $.jsx)("div", {
										className: "text-lg font-semibold text-canvas-text",
										children: g(s.totalSize)
									})] }),
									/* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsx)("div", {
										className: "text-[11px] text-canvas-text-muted mb-0.5",
										children: e("可释放空间")
									}), /* @__PURE__ */ (0, $.jsx)("div", {
										className: `text-lg font-semibold ${s.reclaimableSize > 0 ? "text-emerald-400" : "text-canvas-text"}`,
										children: g(s.reclaimableSize)
									})] }),
									/* @__PURE__ */ (0, $.jsxs)("div", {
										className: "flex gap-3 text-[11px] text-canvas-text-muted",
										children: [/* @__PURE__ */ (0, $.jsx)("span", { children: e("{count} 个项目", { count: s.projects.length }) }), /* @__PURE__ */ (0, $.jsx)("span", { children: e("{count} 个文件", { count: s.projects.reduce((e, t) => e + t.fileCount, 0) }) })]
									}),
									T.issueSections.length > 0 && /* @__PURE__ */ (0, $.jsx)("div", {
										className: "flex flex-wrap gap-1.5",
										children: T.issueSections.map((e) => /* @__PURE__ */ (0, $.jsxs)("button", {
											type: "button",
											onClick: () => p(e.id),
											className: `storage-health-selection inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] font-medium transition-[color,background-color,box-shadow]
                          ${f === e.id ? "is-active" : "bg-canvas-hover text-canvas-text-secondary hover:text-canvas-text"}`,
											children: [
												/* @__PURE__ */ (0, $.jsx)("span", {
													className: "w-1.5 h-1.5 rounded-full",
													style: { backgroundColor: e.color }
												}),
												e.label,
												/* @__PURE__ */ (0, $.jsx)("span", {
													className: "opacity-60",
													children: e.count
												})
											]
										}, e.id))
									})
								]
							})]
						})
					}),
					/* @__PURE__ */ (0, $.jsxs)("div", {
						className: "bg-canvas-card border border-canvas-border rounded-[10px] p-3",
						children: [/* @__PURE__ */ (0, $.jsx)("h4", {
							className: "text-sm font-medium text-canvas-text mb-4",
							children: e("各项目占用空间")
						}), /* @__PURE__ */ (0, $.jsx)(on, { items: T.projectBars })]
					}),
					/* @__PURE__ */ (0, $.jsx)("div", {
						className: "flex gap-1.5 border-b border-canvas-border pb-1",
						children: [
							{
								id: "overview",
								label: e("概览")
							},
							{
								id: "trash",
								label: `${e("回收站残留")} ${s.trashes.length > 0 ? `(${s.trashes.length})` : ""}`
							},
							{
								id: "orphans",
								label: `${e("孤儿文件")} ${s.orphans.length > 0 ? `(${s.orphans.length})` : ""}`
							},
							{
								id: "duplicates",
								label: `${e("重复文件")} ${s.duplicates.length > 0 ? `(${s.duplicates.length})` : ""}`
							}
						].map((e) => /* @__PURE__ */ (0, $.jsx)("button", {
							type: "button",
							className: `storage-health-selection px-3 py-1.5 text-xs rounded-md transition-[color,background-color,box-shadow] ${f === e.id ? "is-active font-medium" : "text-canvas-text-secondary hover:text-canvas-text hover:bg-canvas-hover"}`,
							onClick: () => p(e.id),
							children: e.label
						}, e.id))
					}),
					f === "overview" && /* @__PURE__ */ (0, $.jsx)("div", {
						className: "space-y-3",
						children: s.projects.map((t) => /* @__PURE__ */ (0, $.jsxs)("div", {
							className: "bg-canvas-hover rounded-lg p-3 border border-canvas-border",
							children: [/* @__PURE__ */ (0, $.jsxs)("div", {
								className: "flex items-center justify-between mb-2",
								children: [/* @__PURE__ */ (0, $.jsx)("span", {
									className: "text-xs font-medium text-canvas-text",
									children: t.projectName
								}), /* @__PURE__ */ (0, $.jsx)("span", {
									className: "text-[11px] text-canvas-text-secondary",
									children: g(t.fileSize)
								})]
							}), /* @__PURE__ */ (0, $.jsxs)("div", {
								className: "flex gap-2 flex-wrap",
								children: [Object.entries(t.categories).map(([t, n]) => /* @__PURE__ */ (0, $.jsxs)("span", {
									className: "inline-flex items-center gap-1 px-2 py-0.5 rounded text-[10px] bg-canvas-surface text-canvas-text-secondary",
									children: [
										/* @__PURE__ */ (0, $.jsx)("span", {
											className: "w-1.5 h-1.5 rounded-full",
											style: { backgroundColor: $t[t] || "#94a3b8" }
										}),
										e(t),
										" ",
										n.count,
										e("个"),
										" · ",
										g(n.size)
									]
								}, t)), Object.keys(t.categories).length === 0 && /* @__PURE__ */ (0, $.jsx)("span", {
									className: "text-[10px] text-canvas-text-muted",
									children: e("暂无文件")
								})]
							})]
						}, t.projectId))
					}),
					f === "trash" && /* @__PURE__ */ (0, $.jsx)("div", {
						className: "space-y-3",
						children: s.trashes.length === 0 ? /* @__PURE__ */ (0, $.jsxs)("div", {
							className: "text-center py-4 text-xs text-canvas-text-muted",
							children: [/* @__PURE__ */ (0, $.jsx)("svg", {
								width: "28",
								height: "28",
								viewBox: "0 0 24 24",
								fill: "none",
								stroke: "currentColor",
								strokeWidth: "1.5",
								className: "mx-auto mb-2 opacity-40",
								children: /* @__PURE__ */ (0, $.jsx)("path", { d: "M9 9l6 6m0-6l-6 6m-7 3h20L19 4H5L2 18z" })
							}), e("没有发现回收站残留，很好！")]
						}) : /* @__PURE__ */ (0, $.jsxs)($.Fragment, { children: [/* @__PURE__ */ (0, $.jsx)("div", {
							className: "flex justify-end",
							children: /* @__PURE__ */ (0, $.jsx)(W, {
								type: "button",
								className: "text-[11px] text-red-400 hover:text-red-300 px-2 py-1 rounded hover:bg-red-400/10 transition-colors",
								onClick: S,
								children: e("清空全部")
							})
						}), s.trashes.map((t) => /* @__PURE__ */ (0, $.jsx)("div", {
							className: "bg-canvas-hover rounded-lg p-3 border border-canvas-border",
							children: /* @__PURE__ */ (0, $.jsxs)("div", {
								className: "flex items-center justify-between",
								children: [/* @__PURE__ */ (0, $.jsxs)("div", {
									className: "min-w-0 flex-1",
									children: [
										/* @__PURE__ */ (0, $.jsx)("div", {
											className: "text-xs font-medium text-canvas-text",
											children: t.projectName
										}),
										/* @__PURE__ */ (0, $.jsx)("div", {
											className: "text-[10px] text-canvas-text-secondary truncate mt-0.5",
											title: t.trashDir,
											children: tn(t.trashDir)
										}),
										/* @__PURE__ */ (0, $.jsxs)("div", {
											className: "text-[11px] text-amber-400 mt-1",
											children: [
												g(t.trashSize),
												" · ",
												e("{count} 个文件", { count: t.fileCount })
											]
										})
									]
								}), /* @__PURE__ */ (0, $.jsx)(W, {
									type: "button",
									className: "shrink-0 ml-3 text-[11px] text-red-400 hover:text-red-300 px-2.5 py-1.5 rounded hover:bg-red-400/10 transition-colors",
									onClick: () => y(t),
									disabled: m.has(t.trashDir),
									children: m.has(t.trashDir) ? e("清理中…") : e("清空")
								})]
							})
						}, t.trashDir))] })
					}),
					f === "orphans" && /* @__PURE__ */ (0, $.jsx)("div", {
						className: "space-y-3",
						children: s.orphans.length === 0 ? /* @__PURE__ */ (0, $.jsxs)("div", {
							className: "text-center py-4 text-xs text-canvas-text-muted",
							children: [/* @__PURE__ */ (0, $.jsxs)("svg", {
								width: "28",
								height: "28",
								viewBox: "0 0 24 24",
								fill: "none",
								stroke: "currentColor",
								strokeWidth: "1.5",
								className: "mx-auto mb-2 opacity-40",
								children: [/* @__PURE__ */ (0, $.jsx)("path", { d: "M22 11.08V12a10 10 0 11-5.93-9.14" }), /* @__PURE__ */ (0, $.jsx)("polyline", { points: "22 4 12 14.01 9 11.01" })]
							}), e("没有发现孤儿文件，所有文件均有引用")]
						}) : /* @__PURE__ */ (0, $.jsxs)($.Fragment, { children: [/* @__PURE__ */ (0, $.jsxs)("div", {
							className: "flex justify-between text-[11px] text-canvas-text-muted mb-1",
							children: [/* @__PURE__ */ (0, $.jsx)("span", { children: e("共 {count} 个孤儿文件，可释放 {size}", {
								count: s.orphans.length,
								size: g(s.orphans.reduce((e, t) => e + t.size, 0))
							}) }), /* @__PURE__ */ (0, $.jsx)(W, {
								type: "button",
								className: "text-red-400 hover:text-red-300 px-2 py-0.5 rounded hover:bg-red-400/10 transition-colors",
								onClick: w,
								children: e("全部清理")
							})]
						}), /* @__PURE__ */ (0, $.jsx)("div", {
							className: "max-h-[300px] overflow-y-auto space-y-1.5",
							children: s.orphans.map((t) => /* @__PURE__ */ (0, $.jsxs)("div", {
								className: "flex items-center justify-between bg-canvas-hover rounded-lg px-3 py-2 border border-canvas-border group",
								children: [/* @__PURE__ */ (0, $.jsxs)("div", {
									className: "min-w-0 flex-1",
									children: [/* @__PURE__ */ (0, $.jsx)("div", {
										className: "text-[11px] text-canvas-text truncate",
										title: t.path,
										children: t.name
									}), /* @__PURE__ */ (0, $.jsxs)("div", {
										className: "text-[10px] text-canvas-text-muted mt-0.5",
										children: [
											t.projectName,
											" · ",
											g(t.size)
										]
									})]
								}), /* @__PURE__ */ (0, $.jsx)(W, {
									type: "button",
									className: "shrink-0 ml-2 text-[10px] text-canvas-text-muted hover:text-red-400 px-2 py-1 rounded hover:bg-red-400/10 transition-colors opacity-0 group-hover:opacity-100",
									onClick: () => b(t),
									disabled: m.has(t.path),
									children: m.has(t.path) ? "…" : e("删除")
								})]
							}, t.path))
						})] })
					}),
					f === "duplicates" && /* @__PURE__ */ (0, $.jsx)("div", {
						className: "space-y-3",
						children: s.duplicates.length === 0 ? /* @__PURE__ */ (0, $.jsxs)("div", {
							className: "text-center py-4 text-xs text-canvas-text-muted",
							children: [/* @__PURE__ */ (0, $.jsxs)("svg", {
								width: "28",
								height: "28",
								viewBox: "0 0 24 24",
								fill: "none",
								stroke: "currentColor",
								strokeWidth: "1.5",
								className: "mx-auto mb-2 opacity-40",
								children: [/* @__PURE__ */ (0, $.jsx)("rect", {
									x: "8",
									y: "2",
									width: "8",
									height: "4",
									rx: "1"
								}), /* @__PURE__ */ (0, $.jsx)("path", { d: "M16 4h2a2 2 0 012 2v14a2 2 0 01-2 2H6a2 2 0 01-2-2V6a2 2 0 012-2h2" })]
							}), e("没有发现重复文件")]
						}) : /* @__PURE__ */ (0, $.jsx)("div", {
							className: "max-h-[300px] overflow-y-auto space-y-2",
							children: s.duplicates.map((t) => /* @__PURE__ */ (0, $.jsxs)("div", {
								className: "bg-canvas-hover rounded-lg p-3 border border-canvas-border",
								children: [/* @__PURE__ */ (0, $.jsxs)("div", {
									className: "flex items-center justify-between mb-2",
									children: [/* @__PURE__ */ (0, $.jsx)("div", {
										className: "text-[11px] font-medium text-canvas-text truncate max-w-[280px]",
										title: t.files[0]?.name,
										children: t.files[0]?.name || e("未知文件")
									}), /* @__PURE__ */ (0, $.jsx)("span", {
										className: "text-[10px] text-orange-400 shrink-0 ml-2",
										children: e("{count} 份 · 可释放 {size}", {
											count: t.files.length,
											size: g(t.reclaimableSize)
										})
									})]
								}), /* @__PURE__ */ (0, $.jsx)("div", {
									className: "space-y-1",
									children: t.files.map((t, n) => /* @__PURE__ */ (0, $.jsxs)("div", {
										className: "flex items-center justify-between text-[10px] pl-2 border-l-2 border-canvas-border",
										children: [
											/* @__PURE__ */ (0, $.jsxs)("span", {
												className: "text-canvas-text-secondary truncate min-w-0 flex-1",
												title: t.path,
												children: [
													t.projectName,
													" / ",
													t.name
												]
											}),
											/* @__PURE__ */ (0, $.jsx)("span", {
												className: "text-canvas-text-muted shrink-0 ml-2",
												children: g(t.size)
											}),
											n > 0 && /* @__PURE__ */ (0, $.jsx)(W, {
												type: "button",
												className: "shrink-0 ml-2 text-[10px] text-canvas-text-muted hover:text-red-400 px-1.5 py-0.5 rounded hover:bg-red-400/10 transition-colors",
												onClick: () => x(t),
												disabled: m.has(t.path),
												children: m.has(t.path) ? "…" : e("删除")
											})
										]
									}, t.path))
								})]
							}, t.key))
						})
					})
				]
			}),
			s && E && /* @__PURE__ */ (0, $.jsxs)("div", {
				className: "text-center py-6",
				children: [
					/* @__PURE__ */ (0, $.jsxs)("svg", {
						width: "36",
						height: "36",
						viewBox: "0 0 24 24",
						fill: "none",
						stroke: "currentColor",
						strokeWidth: "1.5",
						className: "mx-auto mb-3 text-canvas-text-muted opacity-40",
						children: [/* @__PURE__ */ (0, $.jsx)("path", { d: "M4 19.5A2.5 2.5 0 016.5 17H20" }), /* @__PURE__ */ (0, $.jsx)("path", { d: "M6.5 2H20v20H6.5A2.5 2.5 0 014 19.5v-15A2.5 2.5 0 016.5 2z" })]
					}),
					/* @__PURE__ */ (0, $.jsx)("p", {
						className: "text-sm text-canvas-text-secondary mb-1",
						children: e("暂无存储数据")
					}),
					/* @__PURE__ */ (0, $.jsx)("p", {
						className: "text-[11px] text-canvas-text-muted mb-4",
						children: e("尚未创建项目或项目目录为空")
					}),
					/* @__PURE__ */ (0, $.jsx)(W, {
						type: "button",
						className: "text-xs px-3 py-1.5 rounded-lg bg-canvas-hover text-canvas-text-secondary hover:text-canvas-text transition-colors",
						onClick: v,
						children: e("重新扫描")
					})
				]
			})
		]
	});
}
//#endregion
//#region src/components/settings/DirectorDeskStorageManager.tsx
function cn(e) {
	return e <= 0 ? "0 MB" : `${(e / 1024 / 1024).toFixed(e >= 100 * 1024 * 1024 ? 0 : 1)} MB`;
}
function ln() {
	let e = i(), t = C((e) => e.showToast), n = ye(), [r, a] = (0, Q.useState)(null), [o, s] = (0, Q.useState)(n), [c, l] = (0, Q.useState)(!1), [u, d] = (0, Q.useState)(!1);
	(0, Q.useEffect)(() => {
		if (!n) return;
		let e = !0;
		return X().then((t) => {
			e && a(t);
		}).catch((n) => {
			e && t(n instanceof Error ? n.message : String(n), "error");
		}).finally(() => {
			e && s(!1);
		}), () => {
			e = !1;
		};
	}, [n, t]);
	let f = async () => {
		l(!0);
		try {
			await xe(), a(await be()), d(!1), t(e("已删除 3D 导演台本地资源"), "success");
		} catch (e) {
			t(e instanceof Error ? e.message : String(e), "error");
		} finally {
			l(!1);
		}
	};
	return /* @__PURE__ */ (0, $.jsxs)("section", {
		className: "mt-5 border-t border-canvas-border pt-5",
		children: [/* @__PURE__ */ (0, $.jsxs)("div", {
			className: "mb-3 flex items-start justify-between gap-3",
			children: [/* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsx)("h3", {
				className: "text-sm font-semibold text-canvas-text",
				children: e("3D 导演台资源")
			}), /* @__PURE__ */ (0, $.jsx)("p", {
				className: "mt-1 text-xs text-canvas-text-muted",
				children: e("按需下载的运行资源由所有导演台节点共用。")
			})] }), /* @__PURE__ */ (0, $.jsx)("div", {
				className: "grid h-8 w-8 shrink-0 place-items-center rounded-lg bg-violet-500/15 text-violet-400",
				children: /* @__PURE__ */ (0, $.jsx)(K, {
					icon: "mdi:video-3d",
					width: "18",
					height: "18"
				})
			})]
		}), /* @__PURE__ */ (0, $.jsxs)("div", {
			className: "flex items-center justify-between gap-3 rounded-lg border border-canvas-border bg-canvas-card p-3",
			children: [/* @__PURE__ */ (0, $.jsxs)("div", {
				className: "min-w-0",
				children: [/* @__PURE__ */ (0, $.jsx)("p", {
					className: "text-xs font-medium text-canvas-text",
					children: o ? e("正在读取...") : r?.installed ? e("已安装 v{version}", { version: r.version }) : e("未安装")
				}), /* @__PURE__ */ (0, $.jsx)("p", {
					className: "mt-1 text-[11px] text-canvas-text-muted",
					children: r?.installed ? e("占用 {size}", { size: cn(r.installedBytes) }) : e("创建或打开导演台节点时可下载")
				})]
			}), r?.installed && (u ? /* @__PURE__ */ (0, $.jsxs)("div", {
				className: "flex shrink-0 gap-2",
				children: [/* @__PURE__ */ (0, $.jsx)("button", {
					type: "button",
					className: "rounded-lg bg-canvas-hover px-2.5 py-1.5 text-xs text-canvas-text-secondary hover:bg-canvas-border",
					onClick: () => d(!1),
					disabled: c,
					children: e("取消")
				}), /* @__PURE__ */ (0, $.jsx)("button", {
					type: "button",
					className: "rounded-lg bg-red-500/15 px-2.5 py-1.5 text-xs text-red-400 hover:bg-red-500/25 disabled:opacity-50",
					onClick: () => {
						f();
					},
					disabled: c,
					children: e(c ? "正在删除..." : "确认删除")
				})]
			}) : /* @__PURE__ */ (0, $.jsxs)("button", {
				type: "button",
				className: "inline-flex shrink-0 items-center gap-1.5 rounded-lg bg-canvas-hover px-2.5 py-1.5 text-xs text-canvas-text-secondary hover:bg-canvas-border",
				onClick: () => d(!0),
				children: [/* @__PURE__ */ (0, $.jsx)(K, {
					icon: "lucide:trash-2",
					width: "13",
					height: "13"
				}), e("删除资源")]
			}))]
		})]
	});
}
//#endregion
//#region src/components/settings/mcpConnectionRequirements.ts
var un = [
	{
		icon: "lucide:app-window",
		title: "AI Canvas 桌面端",
		description: "软件需保持运行，并开启上方“本地控制会话”。"
	},
	{
		icon: "lucide:terminal",
		title: "Node.js 运行环境",
		description: "需已安装 Node.js，且系统可直接运行 node 命令。"
	},
	{
		icon: "lucide:plug-zap",
		title: "支持 MCP 的客户端",
		description: "客户端需支持 stdio 类型的 MCP 服务配置，例如 Claude Desktop、Cursor 或 Codex。"
	},
	{
		icon: "lucide:monitor",
		title: "在同一台电脑连接",
		description: "控制服务只监听 127.0.0.1，不能从局域网或其他电脑远程连接。"
	}
], dn = [
	{
		icon: "lucide:app-window",
		title: "AI Canvas 桌面端",
		description: "软件需保持运行，并开启上方“远程控制会话”。"
	},
	{
		icon: "lucide:network",
		title: "可达的局域网地址",
		description: "客户端需能访问这台电脑的局域网 IP 和所选端口；Docker 可使用 host.docker.internal。"
	},
	{
		icon: "lucide:plug-zap",
		title: "支持 Streamable HTTP",
		description: "客户端需支持 Streamable HTTP MCP，并允许配置 Authorization 请求头。"
	},
	{
		icon: "lucide:key-round",
		title: "Bearer Token 鉴权",
		description: "每次请求都必须携带本机凭据存储中的 256 位令牌。"
	}
];
function fn(e) {
	return e === "streamable-http" ? dn : un;
}
//#endregion
//#region src/components/settings/McpControlSettings.tsx
var pn = typeof window < "u" && "__TAURI__" in window;
function mn() {
	let e = i(), { config: t, updateConfig: n, saveConfig: r } = C(ae((e) => ({
		config: e.config,
		updateConfig: e.updateConfig,
		saveConfig: e.saveConfig
	}))), [a, o] = (0, Q.useState)(null), [s, c] = (0, Q.useState)(""), [l, u] = (0, Q.useState)(!1), [d, f] = (0, Q.useState)(""), [p, m] = (0, Q.useState)(!1), [h, g] = (0, Q.useState)(!1), _ = (0, Q.useRef)(null);
	(0, Q.useEffect)(() => {
		if (!pn) return;
		let t = !1;
		return Ce().then(async (e) => {
			t || (o(e), e && c(await Z()));
		}).catch(() => {
			t || f(e("无法读取 MCP 会话状态"));
		}), () => {
			t = !0;
		};
	}, [e]);
	let v = (0, Q.useMemo)(() => a && s ? Oe(a, s) : null, [a, s]), y = (e) => {
		n(e), r();
	}, b = async () => {
		u(!0), f(""), m(!1);
		try {
			let e = await De();
			c(e.token), o(e.session);
		} catch (e) {
			c(""), o(null), f(e instanceof Error ? e.message : String(e));
		} finally {
			u(!1);
		}
	}, x = async () => {
		u(!0), f("");
		try {
			await Se(), o(null), c(""), m(!1);
		} catch (e) {
			f(e instanceof Error ? e.message : String(e));
		} finally {
			u(!1);
		}
	}, S = async () => {
		u(!0), f(""), m(!1);
		try {
			let e = await Te();
			if (a) {
				await Se();
				let e = await De();
				o(e.session), c(e.token);
			} else c(e);
		} catch (e) {
			f(e instanceof Error ? e.message : String(e));
		} finally {
			u(!1);
		}
	}, w = () => {
		let e = 2e4 + Math.floor(Math.random() * 25e3);
		_.current && (_.current.value = String(e)), f(""), y({ mcpPort: e });
	}, T = async () => {
		if (v) try {
			await navigator.clipboard.writeText(v), m(!0);
		} catch {
			f(e("复制客户端配置失败"));
		}
	}, E = (e) => {
		if (e !== Ee(t.mcpTransport)) {
			if (e === "streamable-http") {
				g(!0);
				return;
			}
			f(""), y({ mcpTransport: e });
		}
	}, D = () => {
		g(!1), f(""), y({ mcpTransport: "streamable-http" });
	}, O = we(t.mcpPort), k = Ee(t.mcpTransport), A = a !== null && O !== void 0 && O !== a.port, j = a !== null && k !== a.transport, M = fn(k);
	return pn ? /* @__PURE__ */ (0, $.jsxs)("div", {
		className: "space-y-4",
		children: [
			/* @__PURE__ */ (0, $.jsxs)("div", {
				className: "flex items-center justify-between gap-4 border-b border-canvas-border pb-4",
				children: [/* @__PURE__ */ (0, $.jsxs)("div", {
					className: "min-w-0",
					children: [/* @__PURE__ */ (0, $.jsxs)("div", {
						className: "flex items-center gap-2 text-sm font-medium text-canvas-text",
						children: [/* @__PURE__ */ (0, $.jsx)("span", {
							className: `h-2 w-2 rounded-full ${a ? "bg-green-400" : "bg-canvas-text-muted"}`,
							"aria-hidden": "true"
						}), e(a ? "本地控制会话已开启" : "本地控制会话已关闭")]
					}), /* @__PURE__ */ (0, $.jsx)("p", {
						className: "mt-1 text-xs text-canvas-text-muted",
						children: a ? a.transport === "streamable-http" ? e("远程 HTTP 端口 {port}{mode}", {
							port: a.port,
							mode: e(O === void 0 ? "（随机）" : "（固定）")
						}) : e("回环端口 {port}{mode}", {
							port: a.port,
							mode: e(O === void 0 ? "（随机）" : "（固定）")
						}) : t.mcpAutoStart ? e("启动软件时自动开启") : e("默认关闭")
					})]
				}), /* @__PURE__ */ (0, $.jsxs)(W, {
					type: "button",
					className: "settings-save-btn shrink-0 text-xs",
					onClick: a ? x : b,
					disabled: l,
					children: [/* @__PURE__ */ (0, $.jsx)(K, {
						icon: a ? "lucide:power-off" : "lucide:power",
						width: "14",
						height: "14"
					}), e(l ? "处理中" : a ? "停止" : "开启")]
				})]
			}),
			/* @__PURE__ */ (0, $.jsxs)("label", {
				className: "flex items-start gap-3 rounded-md border border-canvas-border bg-canvas-card px-3 py-2.5",
				children: [/* @__PURE__ */ (0, $.jsx)("input", {
					type: "checkbox",
					className: "mt-0.5 h-4 w-4 shrink-0 accent-indigo-500",
					checked: t.mcpAutoStart === !0,
					onChange: (e) => y({ mcpAutoStart: e.target.checked })
				}), /* @__PURE__ */ (0, $.jsxs)("span", {
					className: "min-w-0",
					children: [/* @__PURE__ */ (0, $.jsx)("span", {
						className: "block text-xs font-medium text-canvas-text",
						children: e("启动软件时自动开启")
					}), /* @__PURE__ */ (0, $.jsx)("span", {
						className: "mt-0.5 block text-[11px] text-canvas-text-muted",
						children: e("外部客户端无需每次手动开启会话；令牌固定保存在本机凭据存储中。")
					})]
				})]
			}),
			/* @__PURE__ */ (0, $.jsxs)("div", {
				className: "rounded-md border border-canvas-border bg-canvas-card px-3 py-2.5",
				children: [
					/* @__PURE__ */ (0, $.jsx)("div", {
						className: "text-xs font-medium text-canvas-text",
						children: e("连接传输")
					}),
					/* @__PURE__ */ (0, $.jsxs)("div", {
						className: "mt-2 grid grid-cols-2 gap-2",
						children: [/* @__PURE__ */ (0, $.jsxs)("button", {
							type: "button",
							className: `rounded-md border px-3 py-2 text-left transition-colors ${k === "stdio" ? "border-indigo-500/60 bg-indigo-500/10 text-canvas-text" : "border-canvas-border bg-canvas-surface text-canvas-text-secondary hover:bg-canvas-hover"}`,
							onClick: () => E("stdio"),
							children: [/* @__PURE__ */ (0, $.jsx)("span", {
								className: "block text-xs font-medium",
								children: e("本机 stdio")
							}), /* @__PURE__ */ (0, $.jsx)("span", {
								className: "mt-0.5 block text-[11px] text-canvas-text-muted",
								children: e("只允许本机客户端通过 127.0.0.1 连接")
							})]
						}), /* @__PURE__ */ (0, $.jsxs)("button", {
							type: "button",
							className: `rounded-md border px-3 py-2 text-left transition-colors ${k === "streamable-http" ? "border-red-500/60 bg-red-500/10 text-canvas-text" : "border-canvas-border bg-canvas-surface text-canvas-text-secondary hover:bg-canvas-hover"}`,
							onClick: () => E("streamable-http"),
							children: [/* @__PURE__ */ (0, $.jsx)("span", {
								className: "block text-xs font-medium",
								children: e("远程 Streamable HTTP")
							}), /* @__PURE__ */ (0, $.jsx)("span", {
								className: "mt-0.5 block text-[11px] text-canvas-text-muted",
								children: e("监听 0.0.0.0，允许其他机器或 Docker 连接")
							})]
						})]
					}),
					j && /* @__PURE__ */ (0, $.jsx)("p", {
						className: "mt-2 text-[11px] text-amber-300",
						children: e("传输方式将在下次开启会话时生效。")
					})
				]
			}),
			k === "streamable-http" && /* @__PURE__ */ (0, $.jsxs)("div", {
				className: "rounded-md border border-red-500/40 bg-red-500/10 px-3 py-2.5 text-xs leading-relaxed text-red-200",
				children: [/* @__PURE__ */ (0, $.jsx)("div", {
					className: "font-medium",
					children: e("远程 MCP 以最大权限运行")
				}), /* @__PURE__ */ (0, $.jsx)("p", {
					className: "mt-1 text-[11px] text-red-200/80",
					children: e("已连接的客户端可自动删除项目、写入文件、修改配置和调用付费媒体模型，不会出现逐次审批。仅在受信网络或隔离环境中开启。")
				})]
			}),
			/* @__PURE__ */ (0, $.jsxs)("div", {
				className: "rounded-md border border-canvas-border bg-canvas-card px-3 py-2.5",
				children: [
					/* @__PURE__ */ (0, $.jsx)("div", {
						className: "text-xs font-medium text-canvas-text",
						children: e(k === "streamable-http" ? "固定 HTTP 端口" : "固定回环端口")
					}),
					/* @__PURE__ */ (0, $.jsxs)("div", {
						className: "mt-2 flex items-center gap-2",
						children: [/* @__PURE__ */ (0, $.jsx)("input", {
							ref: _,
							type: "number",
							min: 1024,
							max: 65535,
							placeholder: e("留空则每次随机分配"),
							defaultValue: O ?? "",
							className: "min-w-0 flex-1 rounded-md border border-canvas-border bg-canvas-surface px-3 py-2 text-sm text-canvas-text placeholder-canvas-text-muted transition-colors focus:border-indigo-500 focus:outline-none",
							onBlur: (t) => {
								let n = t.target.value.trim(), r = n ? we(n) : void 0;
								if (n && r === void 0) {
									f(e("端口需在 1024-65535 之间")), t.target.value = String(O ?? "");
									return;
								}
								f(""), t.target.value = r ? String(r) : "", y({ mcpPort: r });
							}
						}), /* @__PURE__ */ (0, $.jsxs)("button", {
							type: "button",
							className: "inline-flex h-[38px] shrink-0 items-center gap-1.5 rounded-md border border-canvas-border bg-canvas-surface px-3 text-xs text-canvas-text-secondary transition-colors hover:bg-canvas-hover hover:text-canvas-text",
							onClick: w,
							title: e("随机挑一个固定端口"),
							children: [/* @__PURE__ */ (0, $.jsx)(K, {
								icon: "lucide:dices",
								width: "14",
								height: "14"
							}), e("随机")]
						})]
					}),
					/* @__PURE__ */ (0, $.jsxs)("p", {
						className: "mt-2 text-[11px] text-canvas-text-muted",
						children: [e("固定端口后客户端配置不再变化，写一次即可。"), A ? e(" 新端口在下次开启会话时生效。") : ""]
					})
				]
			}),
			a && !s && /* @__PURE__ */ (0, $.jsx)("div", {
				className: "rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-xs text-amber-300",
				children: e("本页没有当前令牌。停止后重新开启以生成新的客户端配置。")
			}),
			v && /* @__PURE__ */ (0, $.jsxs)("div", {
				className: "space-y-2",
				children: [
					/* @__PURE__ */ (0, $.jsxs)("div", {
						className: "flex items-center justify-between gap-3",
						children: [/* @__PURE__ */ (0, $.jsx)("span", {
							className: "text-xs font-medium text-canvas-text-secondary",
							children: e("客户端配置片段")
						}), /* @__PURE__ */ (0, $.jsxs)("div", {
							className: "flex items-center gap-1",
							children: [/* @__PURE__ */ (0, $.jsxs)("button", {
								type: "button",
								className: "inline-flex h-7 items-center gap-1 rounded-md px-2 text-[11px] text-canvas-text-secondary transition-colors hover:bg-canvas-hover hover:text-canvas-text disabled:opacity-50",
								onClick: S,
								disabled: l,
								title: e("生成新令牌，旧配置立即失效"),
								children: [/* @__PURE__ */ (0, $.jsx)(K, {
									icon: "lucide:refresh-cw",
									width: "12",
									height: "12"
								}), e("重置令牌")]
							}), /* @__PURE__ */ (0, $.jsx)("button", {
								type: "button",
								className: "inline-flex h-7 w-7 items-center justify-center rounded-md text-canvas-text-secondary transition-colors hover:bg-canvas-hover hover:text-canvas-text",
								onClick: T,
								"aria-label": e("复制 MCP 客户端配置"),
								title: e("复制客户端配置"),
								children: /* @__PURE__ */ (0, $.jsx)(K, {
									icon: p ? "lucide:check" : "lucide:copy",
									width: "14",
									height: "14"
								})
							})]
						})]
					}),
					/* @__PURE__ */ (0, $.jsx)("pre", {
						className: "max-h-40 overflow-auto whitespace-pre-wrap break-all rounded-md border border-canvas-border bg-canvas-bg px-3 py-2 text-[11px] leading-relaxed text-canvas-text-secondary select-all",
						children: v
					}),
					/* @__PURE__ */ (0, $.jsx)("p", {
						className: "text-[11px] text-canvas-text-muted",
						children: e("粘贴到 Claude Desktop / Cursor 等客户端的 MCP 配置中。会话未开启时客户端调用会报错，重新开启即可继续用同一份配置。")
					}),
					a?.transport === "streamable-http" && /* @__PURE__ */ (0, $.jsx)("p", {
						className: "text-[11px] text-amber-300",
						children: e("复制前请把 <AI_CANVAS_IP> 替换为运行 AI Canvas 电脑的局域网 IP。不同客户端的 HTTP 配置字段可能略有差异。")
					})
				]
			}),
			/* @__PURE__ */ (0, $.jsxs)("section", {
				className: "rounded-md border border-canvas-border bg-canvas-card px-3 py-3",
				"aria-labelledby": "mcp-connection-requirements-title",
				children: [
					/* @__PURE__ */ (0, $.jsxs)("div", {
						className: "flex items-center gap-2",
						children: [/* @__PURE__ */ (0, $.jsx)(K, {
							icon: "lucide:circle-check-big",
							width: "14",
							height: "14",
							className: "text-indigo-400"
						}), /* @__PURE__ */ (0, $.jsx)("h3", {
							id: "mcp-connection-requirements-title",
							className: "text-xs font-medium text-canvas-text",
							children: e("连接环境要求")
						})]
					}),
					/* @__PURE__ */ (0, $.jsx)("div", {
						className: "mt-3 grid gap-2 sm:grid-cols-2",
						children: M.map((t) => /* @__PURE__ */ (0, $.jsxs)("div", {
							className: "flex items-start gap-2 rounded-md bg-canvas-surface px-2.5 py-2",
							children: [/* @__PURE__ */ (0, $.jsx)(K, {
								icon: t.icon,
								width: "14",
								height: "14",
								className: "mt-0.5 shrink-0 text-canvas-text-secondary"
							}), /* @__PURE__ */ (0, $.jsxs)("div", {
								className: "min-w-0",
								children: [/* @__PURE__ */ (0, $.jsx)("div", {
									className: "text-[11px] font-medium text-canvas-text",
									children: e(t.title)
								}), /* @__PURE__ */ (0, $.jsx)("p", {
									className: "mt-0.5 text-[11px] leading-relaxed text-canvas-text-muted",
									children: e(t.description)
								})]
							})]
						}, t.title))
					}),
					/* @__PURE__ */ (0, $.jsxs)("div", {
						className: "mt-3 border-t border-canvas-border pt-2.5 text-[11px] leading-relaxed text-canvas-text-muted",
						children: [/* @__PURE__ */ (0, $.jsxs)("p", { children: [/* @__PURE__ */ (0, $.jsx)("span", {
							className: "font-medium text-canvas-text-secondary",
							children: e("首次连接：")
						}), e("开启会话 → 复制上方配置 → 粘贴到客户端的 MCP 配置中 → 完全重启客户端。")] }), /* @__PURE__ */ (0, $.jsx)("p", {
							className: "mt-1",
							children: e("修改端口或重置令牌后，需要重新复制配置并重启客户端。调用联网、云端模型或本地模型功能时，还需提前配置对应的网络、API Key 或模型环境。")
						})]
					})
				]
			}),
			a && s && !v && /* @__PURE__ */ (0, $.jsx)("div", {
				className: "rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300",
				children: e("未找到本地 MCP 适配器脚本。")
			}),
			/* @__PURE__ */ (0, $.jsxs)(ne, {
				isOpen: h,
				onClose: () => g(!1),
				ariaLabel: e("确认开启远程 MCP"),
				closeOnBackdrop: !1,
				className: "w-[min(520px,calc(100vw-32px))] bg-canvas-surface",
				children: [
					/* @__PURE__ */ (0, $.jsx)("div", {
						className: "border-b border-canvas-border px-5 py-4",
						children: /* @__PURE__ */ (0, $.jsxs)("div", {
							className: "flex items-center gap-2 text-sm font-semibold text-red-300",
							children: [/* @__PURE__ */ (0, $.jsx)(K, {
								icon: "lucide:shield-alert",
								width: "18",
								height: "18"
							}), e("确认暴露远程 MCP 服务")]
						})
					}),
					/* @__PURE__ */ (0, $.jsxs)("div", {
						className: "space-y-3 px-5 py-4 text-xs leading-relaxed text-canvas-text-secondary",
						children: [
							/* @__PURE__ */ (0, $.jsx)("p", { children: e("服务将监听 0.0.0.0，局域网内能够到达该端口的设备都可以尝试连接。") }),
							/* @__PURE__ */ (0, $.jsx)("p", { children: e("持有 Bearer Token 的客户端按自主模式运行，可无审批执行永久删除、文件写入、配置写入和付费媒体生成。") }),
							/* @__PURE__ */ (0, $.jsx)("p", {
								className: "rounded-md border border-amber-500/30 bg-amber-500/10 px-3 py-2 text-amber-200",
								children: e("请确认运行在受信网络、Docker 或其他隔离环境中，并继续保留独立备份。")
							})
						]
					}),
					/* @__PURE__ */ (0, $.jsxs)("div", {
						className: "flex justify-end gap-2 border-t border-canvas-border px-5 py-3",
						children: [/* @__PURE__ */ (0, $.jsx)("button", {
							type: "button",
							className: "rounded-md border border-canvas-border px-3 py-2 text-xs text-canvas-text-secondary hover:bg-canvas-hover",
							onClick: () => g(!1),
							children: e("取消")
						}), /* @__PURE__ */ (0, $.jsx)("button", {
							type: "button",
							className: "rounded-md bg-red-500 px-3 py-2 text-xs font-medium text-white hover:bg-red-400",
							onClick: D,
							children: e("我了解风险，切换到远程模式")
						})]
					})
				]
			}),
			d && /* @__PURE__ */ (0, $.jsx)("div", {
				className: "rounded-md border border-red-500/30 bg-red-500/10 px-3 py-2 text-xs text-red-300",
				children: d
			})
		]
	}) : /* @__PURE__ */ (0, $.jsx)("div", {
		className: "rounded-md border border-canvas-border bg-canvas-surface px-4 py-3 text-sm text-canvas-text-secondary",
		children: e("MCP 控制仅在 Tauri 桌面应用中可用。")
	});
}
//#endregion
//#region src/components/settings/SettingsNavigation.tsx
var hn = [
	{
		id: "general",
		label: "常规"
	},
	{
		id: "files",
		label: "文件与应用"
	},
	{
		id: "api",
		label: "API Key"
	},
	{
		id: "storage",
		label: "存储健康"
	},
	{
		id: "comfyui",
		label: "ComfyUI"
	},
	{
		id: "shortcuts",
		label: "快捷键"
	},
	{
		id: "plugins",
		label: "插件"
	},
	{
		id: "mcp",
		label: "MCP 控制"
	}
];
function gn({ tab: e }) {
	return e === "mcp" ? /* @__PURE__ */ (0, $.jsx)(K, {
		icon: "lucide:plug-zap",
		width: "14",
		height: "14"
	}) : e === "plugins" ? /* @__PURE__ */ (0, $.jsx)(K, {
		icon: "lucide:blocks",
		width: "14",
		height: "14"
	}) : /* @__PURE__ */ (0, $.jsxs)("svg", {
		width: "14",
		height: "14",
		viewBox: "0 0 24 24",
		fill: "none",
		stroke: "currentColor",
		strokeWidth: "2",
		children: [
			e === "storage" && /* @__PURE__ */ (0, $.jsxs)($.Fragment, { children: [
				/* @__PURE__ */ (0, $.jsx)("ellipse", {
					cx: "12",
					cy: "5",
					rx: "9",
					ry: "3"
				}),
				/* @__PURE__ */ (0, $.jsx)("path", { d: "M21 12c0 1.66-4 3-9 3s-9-1.34-9-3" }),
				/* @__PURE__ */ (0, $.jsx)("path", { d: "M3 5v14c0 1.66 4 3 9 3s9-1.34 9-3V5" })
			] }),
			e === "api" && /* @__PURE__ */ (0, $.jsxs)($.Fragment, { children: [
				/* @__PURE__ */ (0, $.jsx)("path", { d: "M14 2H6a2 2 0 00-2 2v16a2 2 0 002 2h12a2 2 0 002-2V8z" }),
				/* @__PURE__ */ (0, $.jsx)("polyline", { points: "14 2 14 8 20 8" }),
				/* @__PURE__ */ (0, $.jsx)("line", {
					x1: "16",
					y1: "13",
					x2: "8",
					y2: "13"
				}),
				/* @__PURE__ */ (0, $.jsx)("line", {
					x1: "16",
					y1: "17",
					x2: "8",
					y2: "17"
				})
			] }),
			e === "files" && /* @__PURE__ */ (0, $.jsxs)($.Fragment, { children: [/* @__PURE__ */ (0, $.jsx)("path", { d: "M3 7a2 2 0 012-2h4l2 3h8a2 2 0 012 2v8a2 2 0 01-2 2H5a2 2 0 01-2-2V7z" }), /* @__PURE__ */ (0, $.jsx)("path", { d: "M8 13h8" })] }),
			e === "comfyui" && /* @__PURE__ */ (0, $.jsx)($.Fragment, { children: /* @__PURE__ */ (0, $.jsx)("path", { d: "M9 3H5a2 2 0 00-2 2v4m6-6h10a2 2 0 012 2v4M9 3v18m0 0h10a2 2 0 002-2V9M9 21H5a2 2 0 01-2-2V9m0 0h18" }) }),
			e === "general" && /* @__PURE__ */ (0, $.jsxs)($.Fragment, { children: [
				/* @__PURE__ */ (0, $.jsx)("rect", {
					x: "3",
					y: "3",
					width: "7",
					height: "7",
					rx: "1"
				}),
				/* @__PURE__ */ (0, $.jsx)("rect", {
					x: "14",
					y: "3",
					width: "7",
					height: "7",
					rx: "1"
				}),
				/* @__PURE__ */ (0, $.jsx)("rect", {
					x: "14",
					y: "14",
					width: "7",
					height: "7",
					rx: "1"
				}),
				/* @__PURE__ */ (0, $.jsx)("rect", {
					x: "3",
					y: "14",
					width: "7",
					height: "7",
					rx: "1"
				})
			] }),
			e === "shortcuts" && /* @__PURE__ */ (0, $.jsxs)($.Fragment, { children: [
				/* @__PURE__ */ (0, $.jsx)("rect", {
					x: "2",
					y: "4",
					width: "20",
					height: "16",
					rx: "2",
					ry: "2"
				}),
				/* @__PURE__ */ (0, $.jsx)("line", {
					x1: "6",
					y1: "8",
					x2: "6.01",
					y2: "8"
				}),
				/* @__PURE__ */ (0, $.jsx)("line", {
					x1: "10",
					y1: "8",
					x2: "10.01",
					y2: "8"
				}),
				/* @__PURE__ */ (0, $.jsx)("line", {
					x1: "14",
					y1: "8",
					x2: "14.01",
					y2: "8"
				}),
				/* @__PURE__ */ (0, $.jsx)("line", {
					x1: "18",
					y1: "8",
					x2: "18.01",
					y2: "8"
				}),
				/* @__PURE__ */ (0, $.jsx)("line", {
					x1: "8",
					y1: "12",
					x2: "8.01",
					y2: "12"
				}),
				/* @__PURE__ */ (0, $.jsx)("line", {
					x1: "12",
					y1: "12",
					x2: "12.01",
					y2: "12"
				}),
				/* @__PURE__ */ (0, $.jsx)("line", {
					x1: "16",
					y1: "12",
					x2: "16.01",
					y2: "12"
				}),
				/* @__PURE__ */ (0, $.jsx)("line", {
					x1: "7",
					y1: "16",
					x2: "17",
					y2: "16"
				})
			] })
		]
	});
}
function _n({ activeTab: e, onSelect: t }) {
	let n = i();
	return /* @__PURE__ */ (0, $.jsx)("nav", {
		className: "w-44 border-r border-canvas-border p-3 space-y-0.5 shrink-0",
		children: hn.map(({ id: r, label: i }) => /* @__PURE__ */ (0, $.jsxs)(W, {
			onClick: () => t(r),
			className: `w-full flex items-center gap-2.5 px-3 py-2 rounded-lg text-sm text-left transition-colors ${e === r ? "bg-indigo-500/15 text-indigo-400" : "text-canvas-text-secondary hover:bg-canvas-hover"}`,
			children: [/* @__PURE__ */ (0, $.jsx)(gn, { tab: r }), n(i)]
		}, r))
	});
}
//#endregion
//#region src/components/settings/ShortcutSettings.tsx
var vn = typeof navigator < "u" && /Macintosh|Mac OS X/.test(navigator.userAgent);
function yn() {
	let e = vn ? "⌘" : "Ctrl", t = vn ? "⌃" : "Ctrl", n = vn ? "⌥" : "Alt", r = vn ? "⇧" : "Shift", i = vn ? "⌫ Delete" : "Delete / Backspace";
	return [
		{
			action: "保存画布",
			key: `${e} + S`
		},
		{
			action: "撤销",
			key: `${e} + Z`
		},
		{
			action: "重做",
			key: `${e} + Y  /  ${e} + ${r} + Z`
		},
		{
			action: "复制节点",
			key: `${e} + C`
		},
		{
			action: "粘贴节点",
			key: `${e} + V`
		},
		{
			action: "删除节点",
			key: i
		},
		{
			action: "分组 / 取消分组",
			key: `${e} + G`
		},
		{
			action: "创建生成节点（文本 / 图像 / 视频 / 音频 / 全景 / 动画）",
			key: "1–6"
		},
		{
			action: "创建源节点（文本 / 图像 / 视频 / 音频 / Markdown）",
			key: `${n} + 1–5`
		},
		{
			action: "弹出对话框",
			key: "选中节点+Space"
		},
		{
			action: "锁定比例缩放",
			key: `缩放时按住 ${r}`
		},
		{
			action: "关闭菜单 / 设置",
			key: "Escape"
		},
		{
			action: "画布复位",
			key: "F"
		},
		{
			action: "小地图",
			key: "M"
		},
		{
			action: "资源搜索窗口",
			key: `${n} + Space  /  ${t} + ${r} + Space`
		},
		{
			action: "显示/隐藏吉祥物",
			key: `${e} + ${r} + M`
		}
	];
}
function bn() {
	let e = i();
	return /* @__PURE__ */ (0, $.jsxs)("div", {
		className: "space-y-1",
		children: [/* @__PURE__ */ (0, $.jsx)("p", {
			className: "text-sm text-canvas-text-muted mb-4",
			children: e("键盘快捷键配置")
		}), yn().map(({ action: t, key: n }) => /* @__PURE__ */ (0, $.jsxs)("div", {
			className: "flex items-center justify-between py-2 px-2.5 rounded-lg hover:bg-canvas-hover",
			children: [/* @__PURE__ */ (0, $.jsx)("span", {
				className: "text-sm text-canvas-text",
				children: e(t)
			}), /* @__PURE__ */ (0, $.jsx)("kbd", {
				className: "px-2 py-0.5 bg-canvas-card border border-canvas-border rounded text-[11px] text-canvas-text-secondary font-mono",
				children: n
			})]
		}, t))]
	});
}
//#endregion
//#region src/components/settings/ComfyUISettings.tsx
var xn = "text-xs bg-canvas-surface border border-canvas-border rounded-md px-2.5 py-1.5 text-canvas-text placeholder-canvas-text-muted focus:outline-none focus:border-indigo-500 transition-colors";
function Sn() {
	let { config: e, updateConfig: t, saveConfig: n, workflows: r, setSettingsOpen: a, setWorkflowPanelOpen: o, showToast: s } = C(ae((e) => ({
		config: e.config,
		updateConfig: e.updateConfig,
		saveConfig: e.saveConfig,
		workflows: e.workflows,
		setSettingsOpen: e.setSettingsOpen,
		setWorkflowPanelOpen: e.setWorkflowPanelOpen,
		showToast: e.showToast
	}))), c = i(), [l, u] = (0, Q.useState)(!1), [d, f] = (0, Q.useState)(!1), [p, m] = (0, Q.useState)("idle"), h = e.comfyUIPath, g = async () => {
		let t = e.comfyUIUrl?.trim() || "http://127.0.0.1:8188";
		f(!0);
		try {
			await D("open_comfyui_window", { comfyUrl: t });
		} catch (e) {
			s(typeof e == "string" ? e : c("打开 ComfyUI 页面失败"), "error");
		} finally {
			f(!1);
		}
	}, _ = async () => {
		try {
			let e = await M({
				directory: !0,
				title: c("选择 ComfyUI 安装目录")
			});
			e && typeof e == "string" && (t({ comfyUIPath: e }), await n());
		} catch {}
	}, v = async () => {
		let t = e.comfyUIPath?.trim();
		if (!t) {
			s(c("请先设置 ComfyUI 安装目录"), "error");
			return;
		}
		u(!0), m("starting");
		try {
			await D("launch_comfyui", { comfyPath: t });
			let n = (e.comfyUIUrl?.trim() || "http://127.0.0.1:8188").replace(/\/+$/, ""), r = Date.now() + 3e5, i = !1;
			for (; Date.now() < r;) try {
				await fetch(`${n}/system_stats`, { mode: "no-cors" }), i = !0;
				break;
			} catch {
				await new Promise((e) => setTimeout(e, 2e3));
			}
			m(i ? "ready" : "failed"), i && await g(), s(c(i ? "ComfyUI 服务已就绪" : "ComfyUI 进程已启动，但等待服务就绪超时，请查看终端窗口日志"), i ? "success" : "error");
		} catch (e) {
			m("failed"), s(typeof e == "string" ? e : c("启动 ComfyUI 失败"), "error");
		} finally {
			u(!1);
		}
	}, y = e.comfyServers ?? [], b = async (e) => {
		t({ comfyServers: e }), await n();
	}, x = () => b([...y, {
		id: crypto.randomUUID(),
		name: c("服务端 {index}", { index: y.length + 1 }),
		url: ""
	}]), S = (e, t) => b(y.map((n) => n.id === e ? {
		...n,
		...t
	} : n)), w = (e) => b(y.filter((t) => t.id !== e));
	return /* @__PURE__ */ (0, $.jsxs)("div", {
		className: "space-y-4",
		children: [
			/* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsx)("h3", {
				className: "text-sm font-medium text-canvas-text mb-2",
				children: c("ComfyUI 安装目录")
			}), /* @__PURE__ */ (0, $.jsxs)("div", {
				className: "bg-canvas-card border border-canvas-border rounded-lg p-2",
				children: [
					/* @__PURE__ */ (0, $.jsx)("div", {
						className: "text-xs text-canvas-text-muted mb-1.5",
						children: c("ComfyUI 根目录路径")
					}),
					/* @__PURE__ */ (0, $.jsxs)("div", {
						className: "flex items-center gap-2 mb-3",
						children: [/* @__PURE__ */ (0, $.jsx)("div", {
							className: `flex-1 min-w-0 text-[11px] leading-4 break-all bg-canvas-surface rounded-md px-2.5 py-1 border border-canvas-border ${h ? "text-canvas-text-secondary font-mono select-all" : "text-canvas-text-muted italic"}`,
							children: h || c("未设置")
						}), /* @__PURE__ */ (0, $.jsx)(W, {
							type: "button",
							className: "settings-save-btn self-stretch shrink-0 text-xs",
							onClick: _,
							children: c(h ? "更换" : "选择文件夹")
						})]
					}),
					/* @__PURE__ */ (0, $.jsx)("p", {
						className: "text-[11px] text-canvas-text-muted leading-relaxed mb-3",
						children: c("选择 ComfyUI 的安装根目录，支持 GitHub 源码版 / 秋叶整合包 / 官方便携版 / Comfy Desktop（选安装基目录，如 F:\\ComfyUI）。将以 API 模式直接启动，跳过启动器检测")
					}),
					/* @__PURE__ */ (0, $.jsxs)("div", {
						className: "pt-2 border-t border-canvas-border",
						children: [
							/* @__PURE__ */ (0, $.jsxs)("div", {
								className: "grid grid-cols-2 gap-2",
								children: [/* @__PURE__ */ (0, $.jsx)(W, {
									type: "button",
									className: "flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-purple-500/15 text-purple-400 hover:bg-purple-500/25 transition-colors text-xs font-medium",
									onClick: v,
									disabled: l,
									children: l ? /* @__PURE__ */ (0, $.jsxs)($.Fragment, { children: [/* @__PURE__ */ (0, $.jsx)("svg", {
										className: "animate-spin",
										width: "14",
										height: "14",
										viewBox: "0 0 24 24",
										fill: "none",
										stroke: "currentColor",
										strokeWidth: "2",
										children: /* @__PURE__ */ (0, $.jsx)("circle", {
											cx: "12",
											cy: "12",
											r: "10",
											strokeDasharray: "32",
											strokeDashoffset: "8"
										})
									}), c("正在启动…")] }) : /* @__PURE__ */ (0, $.jsxs)($.Fragment, { children: [/* @__PURE__ */ (0, $.jsx)(K, {
										icon: "lucide:play",
										width: "14",
										height: "14"
									}), c("启动 ComfyUI")] })
								}), /* @__PURE__ */ (0, $.jsxs)(W, {
									type: "button",
									className: "flex items-center justify-center gap-1.5 py-1.5 rounded-md bg-canvas-surface border border-canvas-border text-canvas-text-secondary hover:bg-canvas-hover hover:text-canvas-text transition-colors text-xs font-medium",
									onClick: () => void g(),
									disabled: d,
									children: [/* @__PURE__ */ (0, $.jsx)(K, {
										icon: d ? "lucide:loader-circle" : "lucide:external-link",
										width: "14",
										height: "14",
										className: d ? "animate-spin" : ""
									}), c("打开 ComfyUI 页面")]
								})]
							}),
							p === "starting" && /* @__PURE__ */ (0, $.jsxs)("p", {
								className: "text-[11px] text-canvas-text-secondary mt-2 flex items-center gap-1.5",
								children: [/* @__PURE__ */ (0, $.jsx)("span", { className: "w-1.5 h-1.5 rounded-full bg-amber-400 animate-pulse shrink-0" }), c("正在等待 ComfyUI 服务就绪，首次启动可能需要几分钟时间…")]
							}),
							p === "ready" && /* @__PURE__ */ (0, $.jsxs)("p", {
								className: "text-[11px] text-emerald-400 mt-2 flex items-center gap-1.5",
								children: [/* @__PURE__ */ (0, $.jsx)("span", { className: "w-1.5 h-1.5 rounded-full bg-emerald-400 shrink-0" }), c("ComfyUI 服务已就绪（{url}），可以开始使用", { url: e.comfyUIUrl?.trim() || "http://127.0.0.1:8188" })]
							}),
							p === "failed" && /* @__PURE__ */ (0, $.jsxs)("p", {
								className: "text-[11px] text-red-400 mt-2 flex items-center gap-1.5",
								children: [/* @__PURE__ */ (0, $.jsx)("span", { className: "w-1.5 h-1.5 rounded-full bg-red-400 shrink-0" }), c("服务未就绪，请查看弹出的终端窗口中的日志")]
							}),
							p === "idle" && /* @__PURE__ */ (0, $.jsx)("p", {
								className: "text-[11px] text-canvas-text-muted mt-2",
								children: c("服务就绪后会自动在软件内打开 ComfyUI 窗口，也可以使用右侧按钮手动打开")
							})
						]
					})
				]
			})] }),
			/* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsx)("h3", {
				className: "text-sm font-medium text-canvas-text mb-2",
				children: c("ComfyUI 服务地址")
			}), /* @__PURE__ */ (0, $.jsxs)("div", {
				className: "bg-canvas-card border border-canvas-border rounded-lg p-2",
				children: [
					/* @__PURE__ */ (0, $.jsx)("div", {
						className: "text-xs text-canvas-text-muted mb-1.5",
						children: c("默认地址")
					}),
					/* @__PURE__ */ (0, $.jsx)("input", {
						type: "text",
						className: `${xn} w-full`,
						placeholder: "http://127.0.0.1:8188",
						defaultValue: e.comfyUIUrl || "",
						onBlur: async (e) => {
							t({ comfyUIUrl: e.target.value }), await n();
						}
					}),
					/* @__PURE__ */ (0, $.jsx)("p", {
						className: "text-[11px] text-canvas-text-muted mt-2",
						children: c("ComfyUI 后端服务的地址，用于执行导入的工作流。默认端口为 8188")
					}),
					/* @__PURE__ */ (0, $.jsxs)("div", {
						className: "mt-3 pt-3 border-t border-canvas-border",
						children: [/* @__PURE__ */ (0, $.jsxs)("div", {
							className: "flex items-center justify-between mb-1.5",
							children: [/* @__PURE__ */ (0, $.jsx)("span", {
								className: "text-xs text-canvas-text-muted",
								children: c("其他服务端")
							}), /* @__PURE__ */ (0, $.jsxs)("button", {
								type: "button",
								className: "flex items-center gap-1 text-[11px] text-indigo-400 hover:text-indigo-300 transition-colors",
								onClick: () => void x(),
								children: [/* @__PURE__ */ (0, $.jsx)(K, {
									icon: "lucide:plus",
									width: "13",
									height: "13"
								}), c("添加服务端")]
							})]
						}), y.length === 0 ? /* @__PURE__ */ (0, $.jsx)("p", {
							className: "text-[11px] text-canvas-text-muted",
							children: c("图片与视频分开部署时，在这里添加另一台服务端，再到「工作流管理」里把工作流绑定过去")
						}) : /* @__PURE__ */ (0, $.jsxs)("div", {
							className: "space-y-2",
							children: [y.map((e) => /* @__PURE__ */ (0, $.jsxs)("div", {
								className: "flex items-center gap-2",
								children: [
									/* @__PURE__ */ (0, $.jsx)("input", {
										type: "text",
										className: `${xn} w-28 shrink-0`,
										placeholder: c("服务端名称"),
										defaultValue: e.name,
										onBlur: (t) => void S(e.id, { name: t.target.value.trim() })
									}),
									/* @__PURE__ */ (0, $.jsx)("input", {
										type: "text",
										className: `${xn} min-w-0 flex-1`,
										placeholder: "http://127.0.0.1:8189",
										defaultValue: e.url,
										onBlur: (t) => void S(e.id, { url: t.target.value.trim() })
									}),
									/* @__PURE__ */ (0, $.jsx)("button", {
										type: "button",
										className: "shrink-0 w-7 h-7 flex items-center justify-center rounded-md text-canvas-text-muted hover:bg-red-500/10 hover:text-red-400 transition-colors",
										"aria-label": c("删除服务端"),
										"data-tooltip": c("删除服务端"),
										onClick: () => void w(e.id),
										children: /* @__PURE__ */ (0, $.jsx)(K, {
											icon: "lucide:trash-2",
											width: "14",
											height: "14"
										})
									})
								]
							}, e.id)), /* @__PURE__ */ (0, $.jsx)("p", {
								className: "text-[11px] text-canvas-text-muted",
								children: c("在「工作流管理」里给工作流选择服务端；删掉服务端后，绑过它的工作流回落到默认地址")
							})]
						})]
					})
				]
			})] }),
			/* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsx)("h3", {
				className: "text-sm font-medium text-canvas-text mb-2",
				children: c("ComfyUI 工作流")
			}), /* @__PURE__ */ (0, $.jsxs)("div", {
				className: "bg-canvas-card border border-canvas-border rounded-lg p-2 flex items-center gap-3",
				children: [
					/* @__PURE__ */ (0, $.jsx)("div", {
						className: "w-9 h-9 rounded-lg bg-purple-500/15 text-purple-400 flex items-center justify-center shrink-0",
						children: /* @__PURE__ */ (0, $.jsx)(K, {
							icon: "lucide:workflow",
							width: "18",
							height: "18"
						})
					}),
					/* @__PURE__ */ (0, $.jsxs)("div", {
						className: "flex-1 min-w-0",
						children: [/* @__PURE__ */ (0, $.jsx)("div", {
							className: "text-xs font-medium text-canvas-text",
							children: c("工作流管理")
						}), /* @__PURE__ */ (0, $.jsx)("div", {
							className: "text-[11px] text-canvas-text-muted mt-0.5",
							children: c("已导入 {count} 个工作流", { count: r.length })
						})]
					}),
					/* @__PURE__ */ (0, $.jsxs)(W, {
						type: "button",
						className: "settings-save-btn shrink-0 text-xs flex items-center gap-1.5",
						onClick: () => {
							a(!1), o(!0);
						},
						children: [c("管理工作流"), /* @__PURE__ */ (0, $.jsx)(K, {
							icon: "lucide:chevron-right",
							width: "14",
							height: "14"
						})]
					})
				]
			})] })
		]
	});
}
//#endregion
//#region src/components/settings/FileAppSettings.tsx
function Cn(e) {
	let t = e.versionHint?.trim();
	return !t || e.displayName.includes(t) ? e.displayName : `${e.displayName} · ${t}`;
}
function wn({ active: e }) {
	let t = i(), { config: n, updateConfig: r, saveConfig: a, currentProjectId: o } = C(ae((e) => ({
		config: e.config,
		updateConfig: e.updateConfig,
		saveConfig: e.saveConfig,
		currentProjectId: e.currentProjectId
	}))), [s, c] = (0, Q.useState)(null), [l, u] = (0, Q.useState)(null), [d, f] = (0, Q.useState)(null), [p, m] = (0, Q.useState)(!1), [h, g] = (0, Q.useState)(null), [_, v] = (0, Q.useState)(!0), [y, b] = (0, Q.useState)(null);
	(0, Q.useEffect)(() => {
		if (!e) return;
		let t = !1, n = () => {
			m(!0), Promise.all([
				o ? L(o) : Promise.resolve(null),
				I(),
				ee()
			]).then(([e, n, r]) => {
				t || (c(e), u(n), f(r));
			}).catch(() => {
				t || (c(null), u(null), f(null));
			}).finally(() => {
				t || m(!1);
			});
		};
		return n(), window.addEventListener(R, n), () => {
			t = !0, window.removeEventListener(R, n);
		};
	}, [e, o]), (0, Q.useEffect)(() => {
		if (!e) return;
		let t = !1;
		return ke().then((e) => {
			t || (g(e), b(null));
		}).catch((e) => {
			t || (g(null), b(e instanceof Error ? e.message : "Blender 安装检测失败"));
		}).finally(() => {
			t || v(!1);
		}), () => {
			t = !0;
		};
	}, [e]);
	let x = async (e, t) => {
		try {
			let n = await M({
				directory: !0,
				title: e
			});
			n && typeof n == "string" && (r(t(n)), await a());
		} catch {}
	}, S = async (e, t, n) => {
		try {
			let i = await M({
				multiple: !1,
				title: e,
				filters: [{
					name: t,
					extensions: ["exe", "app"]
				}]
			});
			i && typeof i == "string" && (r(n(i)), await a());
		} catch {}
	}, w = async () => {
		v(!0), b(null);
		try {
			g(await Ae());
		} catch (e) {
			e instanceof Error && e.name === "AbortError" || b(e instanceof Error ? e.message : "Blender 选择失败");
		} finally {
			v(!1);
		}
	}, T = n.baseDataDir, E = [
		{
			id: "photoshop",
			label: "Photoshop",
			path: n.photoshopPath,
			description: t("用于图片节点的「在 PS 中打开」"),
			onChoose: () => S(t("选择 Photoshop.exe"), "Photoshop", (e) => ({ photoshopPath: e }))
		},
		{
			id: "jianying",
			label: "剪映专业版",
			path: n.jianyingPath,
			description: t("用于视频节点的「在剪映中打开」"),
			onChoose: () => S(t("选择剪映专业版"), "剪映专业版", (e) => ({ jianyingPath: e }))
		},
		{
			id: "premiere",
			label: "Adobe Premiere Pro",
			path: n.premierePath,
			description: t("用于视频节点的「在 PR 中打开」"),
			onChoose: () => S(t("选择 Adobe Premiere Pro"), "Adobe Premiere Pro", (e) => ({ premierePath: e }))
		}
	];
	return /* @__PURE__ */ (0, $.jsxs)("div", {
		className: "space-y-4",
		children: [/* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsx)("h3", {
			className: "text-sm font-medium text-canvas-text mb-2",
			children: t("文件保存位置")
		}), /* @__PURE__ */ (0, $.jsxs)("div", {
			className: "bg-canvas-card border border-canvas-border rounded-lg p-2",
			children: [
				/* @__PURE__ */ (0, $.jsxs)("div", {
					className: "mb-3",
					children: [/* @__PURE__ */ (0, $.jsx)("div", {
						className: "text-xs text-canvas-text-muted mb-1.5",
						children: t("保存根目录")
					}), /* @__PURE__ */ (0, $.jsxs)("div", {
						className: "flex items-center gap-2",
						children: [/* @__PURE__ */ (0, $.jsx)("div", {
							className: `flex-1 min-w-0 text-[11px] break-all rounded-md px-3 py-1.5 border border-canvas-border ${T ? "text-canvas-text-secondary font-mono leading-relaxed bg-canvas-surface select-all" : "text-canvas-text-muted bg-canvas-surface italic"}`,
							children: T || t("未设置（使用系统默认目录）")
						}), /* @__PURE__ */ (0, $.jsx)(W, {
							type: "button",
							className: "settings-save-btn shrink-0 text-xs",
							onClick: () => x(t("选择文件保存根目录"), (e) => ({ baseDataDir: e })),
							children: t(T ? "更换" : "选择文件夹")
						})]
					})]
				}),
				/* @__PURE__ */ (0, $.jsxs)("div", {
					className: "text-[11px] text-canvas-text-muted leading-relaxed mb-3",
					children: [t("文件保存为："), /* @__PURE__ */ (0, $.jsxs)("span", {
						className: "text-canvas-text-secondary font-mono",
						children: [
							T || t("系统目录"),
							"/",
							"{项目ID}",
							"/..."
						]
					})]
				}),
				/* @__PURE__ */ (0, $.jsx)("div", {
					className: "space-y-2 py-2 border-y border-canvas-border",
					children: [[t("应用所在目录"), d], [t("默认存储目录"), l]].map(([e, n]) => /* @__PURE__ */ (0, $.jsxs)("div", {
						className: "min-w-0",
						children: [/* @__PURE__ */ (0, $.jsx)("div", {
							className: "text-xs text-canvas-text-muted mb-0.5",
							children: e
						}), /* @__PURE__ */ (0, $.jsx)("div", {
							className: `text-[11px] break-all leading-relaxed select-all ${n ? "text-canvas-text-secondary font-mono" : "text-canvas-text-muted italic"}`,
							children: p ? t("加载中…") : n || t("仅在 Tauri 桌面环境中可用")
						})]
					}, e))
				}),
				/* @__PURE__ */ (0, $.jsx)("div", {
					className: "pt-2",
					children: p ? /* @__PURE__ */ (0, $.jsx)("div", {
						className: "text-xs text-canvas-text-muted",
						children: t("加载中…")
					}) : s ? /* @__PURE__ */ (0, $.jsxs)("div", {
						className: "space-y-2",
						children: [/* @__PURE__ */ (0, $.jsxs)("div", {
							className: "flex items-start gap-2 min-w-0",
							children: [/* @__PURE__ */ (0, $.jsx)("svg", {
								className: "shrink-0 mt-0.5",
								width: "16",
								height: "16",
								viewBox: "0 0 24 24",
								fill: "none",
								stroke: "currentColor",
								strokeWidth: "1.5",
								children: /* @__PURE__ */ (0, $.jsx)("path", { d: "M22 19a2 2 0 0 1-2 2H4a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5l2 3h9a2 2 0 0 1 2 2z" })
							}), /* @__PURE__ */ (0, $.jsxs)("div", {
								className: "min-w-0 flex-1",
								children: [/* @__PURE__ */ (0, $.jsx)("div", {
									className: "text-xs text-canvas-text-muted mb-0.5",
									children: t("当前项目目录")
								}), /* @__PURE__ */ (0, $.jsx)("div", {
									className: "text-[11px] text-canvas-text-secondary break-all font-mono leading-relaxed select-all",
									children: s
								})]
							})]
						}), /* @__PURE__ */ (0, $.jsxs)(W, {
							type: "button",
							className: "settings-save-btn",
							onClick: async () => {
								try {
									let e = T || await N();
									e && await te(e);
								} catch (e) {
									console.warn("无法打开文件夹:", e);
								}
							},
							children: [/* @__PURE__ */ (0, $.jsxs)("svg", {
								width: "14",
								height: "14",
								viewBox: "0 0 24 24",
								fill: "none",
								stroke: "currentColor",
								strokeWidth: "2",
								children: [
									/* @__PURE__ */ (0, $.jsx)("path", { d: "M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6" }),
									/* @__PURE__ */ (0, $.jsx)("polyline", { points: "15 3 21 3 21 9" }),
									/* @__PURE__ */ (0, $.jsx)("line", {
										x1: "10",
										y1: "14",
										x2: "21",
										y2: "3"
									})
								]
							}), t("打开文件夹")]
						})]
					}) : /* @__PURE__ */ (0, $.jsx)("div", {
						className: "text-xs text-canvas-text-muted",
						children: t("仅在 Tauri 桌面环境中可用")
					})
				})
			]
		})] }), /* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsx)("h3", {
			className: "text-sm font-medium text-canvas-text mb-2",
			children: t("外部编辑器")
		}), /* @__PURE__ */ (0, $.jsxs)("div", {
			className: "bg-canvas-card border border-canvas-border rounded-lg p-2 divide-y divide-canvas-border",
			children: [E.map((e) => /* @__PURE__ */ (0, $.jsxs)("div", {
				className: "py-2 first:pt-0 last:pb-0",
				children: [
					/* @__PURE__ */ (0, $.jsx)("div", {
						className: "text-xs text-canvas-text-muted mb-1.5",
						children: e.label
					}),
					/* @__PURE__ */ (0, $.jsxs)("div", {
						className: "flex items-center gap-2",
						children: [/* @__PURE__ */ (0, $.jsx)("div", {
							className: `flex-1 min-w-0 text-[11px] break-all leading-relaxed rounded-md px-3 py-1.5 border border-canvas-border ${e.path ? "text-canvas-text-secondary font-mono bg-canvas-surface select-all" : "text-canvas-text-muted bg-canvas-surface italic"}`,
							children: e.path || t("未设置（自动检测）")
						}), /* @__PURE__ */ (0, $.jsx)(W, {
							type: "button",
							className: "settings-save-btn shrink-0 text-xs",
							onClick: () => {
								e.onChoose();
							},
							children: e.path ? t("更换") : t("选择文件")
						})]
					}),
					/* @__PURE__ */ (0, $.jsxs)("p", {
						className: "text-[11px] text-canvas-text-muted leading-relaxed mt-1.5",
						children: [
							e.description,
							"；",
							t("手动路径优先，未设置时自动检测常见安装位置")
						]
					})
				]
			}, e.id)), /* @__PURE__ */ (0, $.jsxs)("div", {
				className: "py-2 first:pt-0 last:pb-0",
				children: [
					/* @__PURE__ */ (0, $.jsx)("div", {
						className: "text-xs text-canvas-text-muted mb-1.5",
						children: "Blender"
					}),
					/* @__PURE__ */ (0, $.jsxs)("div", {
						className: "flex items-center gap-2",
						children: [/* @__PURE__ */ (0, $.jsx)("div", {
							className: `flex-1 min-w-0 text-[11px] break-words leading-relaxed rounded-md px-3 py-1.5 border border-canvas-border bg-canvas-surface ${h ? "text-canvas-text-secondary" : "text-canvas-text-muted italic"}`,
							children: _ ? t("检测中…") : h ? Cn(h) : t("未检测到唯一安装，请选择 blender.exe")
						}), /* @__PURE__ */ (0, $.jsx)(W, {
							type: "button",
							className: "settings-save-btn shrink-0 text-xs",
							disabled: _,
							onClick: () => {
								w();
							},
							children: t(h ? "重新选择" : "选择 Blender")
						})]
					}),
					/* @__PURE__ */ (0, $.jsx)("p", {
						className: "text-[11px] text-canvas-text-muted leading-relaxed mt-1.5",
						children: t("用于 3D 导演台的高级编辑、当前帧截图和参考视频渲染；安装仅在当前运行会话登记，启动前会重新校验")
					}),
					y && /* @__PURE__ */ (0, $.jsx)("p", {
						className: "mt-1 text-[11px] leading-relaxed text-red-400",
						role: "alert",
						children: y
					})
				]
			})]
		})] })]
	});
}
//#endregion
//#region doc/插件开发规范.md?raw
var Tn = "# AI Canvas 插件开发规范\n\n> 适用宿主版本：AI Canvas `0.9.2`；Plugin API v1<br>\n> 最后更新：2026-09-03；插件入口：设置 → 插件 → 导入插件文件夹 / 插件市场\n\n本文档说明如何为 AI Canvas 编写用户插件。当前只有一套 Plugin API v1：节点工具、自定义节点、宿主管理的模型调用、节点/连线/包资源句柄、主窗口隔离弹窗，以及由用户明确授权的可信 Python 运行时都属于同一份首版契约，不存在旧版本兼容分支。\n\n## 1. 当前能力范围\n\nPlugin API v1 支持：\n\n- 在节点右键菜单中注册一个或多个工具；\n- 在文本、图片、视频、音频和全景节点的上方工具栏中注册按钮；\n- 由宿主根据 Manifest 渲染统一操作弹窗，或在同一主窗口 Modal 内挂载隔离的插件 UI；\n- 指定每个工具适用的节点类型；\n- 读取 Manifest 中声明的节点顶层字段；\n- 返回 JSON 数据更新当前节点；\n- 返回 JSON 数据创建派生节点；\n- 在独立 QuickJS 沙箱中执行同步 JavaScript。\n- 通过本机 Python 3 和当前环境已安装的包执行可信 `main.py` 插件；\n- 通过 `contributes.nodes` 注册带字段和输入输出端口的自定义节点；\n- 向自定义节点与节点工具提供当前可调用模型的安全目录，并由宿主代为调用模型；\n- 在操作弹窗中提供模型下拉，并通过 `model.generate` 把参考图与提示词一起交给多模态模型；\n- 通过调用级不透明 `resourceId` 读取当前节点文件、直接输入连线文件和 Manifest 声明的包资源；\n- 通过宿主在项目目录创建新的文本输出，不向插件暴露真实路径；\n- 从符合发布规范的 GitHub Release 安装插件，并检查稳定版更新。\n\nJavaScript 沙箱当前暂不支持：\n\n- 自定义设置面板或任意挂入宿主 DOM 的 HTML/React；\n- 任意网络请求、任意路径文件访问、目录遍历、删除、系统命令或 Tauri API；\n- `import`、`require`、第三方 npm 包或多个 JavaScript 文件；\n- Promise、`async` 工具或后台任务；\n- 获取真实本地路径、跨项目文件、非直接连线文件或修改受保护的资产字段；\n- 构造新的远程媒体 URL 交给宿主加载；远程媒体只能从真实媒体输入或本轮宿主媒体模型结果中原样传递。\n\n## 2. 插件目录结构\n\n每个插件是一个独立文件夹。JavaScript 与 Python 插件分别使用以下结构：\n\n```text\nmy-plugin/\n├── manifest.json\n├── main.js\n├── ui.js                    # 仅声明 manifest.ui 时需要\n└── resources/               # 仅放 manifest.resources 声明的包资源\n    └── template.txt\n\nmy-python-plugin/\n├── manifest.json\n└── main.py\n```\n\n- 文件名区分大小写；\n- `manifest.json` 和入口文件必须位于同一级目录；\n- 文件夹中必须且只能有一个 `manifest.json`；\n- JavaScript 入口固定为 `main.js`；可信 Python 插件固定为 `main.py`；\n- `ui.entry` 和 `resources[].path` 必须是插件目录内的安全相对路径并通过字节数与 SHA-256 校验；\n- 未在 Manifest 中声明的其他文件不会被插件运行时加载。\n\n## 3. 最小可运行示例\n\n下面的插件会为文本节点增加“输出转大写”右键工具和工具栏按钮。由于工具声明了 `dialog`，两个入口都会在主窗口中打开同一个操作弹窗。\n\n### manifest.json\n\n```json\n{\n  \"apiVersion\": 1,\n  \"id\": \"com.example.uppercase\",\n  \"name\": \"文本大写工具\",\n  \"version\": \"1.0.0\",\n  \"author\": \"Your Name\",\n  \"description\": \"把文本节点的输出内容转换为大写\",\n  \"category\": \"content\",\n  \"keywords\": [\"文本\", \"格式化\"],\n  \"entry\": \"main.js\",\n  \"permissions\": [\"node.read\", \"node.write\"],\n  \"contributes\": {\n    \"nodeTools\": [\n      {\n        \"id\": \"uppercase-output\",\n        \"title\": \"输出转大写\",\n        \"description\": \"把当前节点的 output 转换为大写\",\n        \"placements\": [\"node-context-menu\", \"node-toolbar\"],\n        \"icon\": \"lucide:case-upper\",\n        \"dialog\": {\n          \"title\": \"输出转大写\",\n          \"description\": \"可选填写前缀；确认后插件会处理当前节点输出。\",\n          \"submitLabel\": \"转换\",\n          \"fields\": [\n            {\n              \"id\": \"prefix\",\n              \"label\": \"结果前缀\",\n              \"type\": \"text\",\n              \"placeholder\": \"例如：标题：\"\n            }\n          ]\n        },\n        \"nodeTypes\": [\"ai-text\", \"source-text\"],\n        \"inputFields\": [\"output\"],\n        \"output\": {\n          \"mode\": \"update-current\",\n          \"fields\": [\"output\"]\n        }\n      }\n    ]\n  }\n}\n```\n\n### main.js\n\n```javascript\ndefinePlugin({\n  tools: {\n    \"uppercase-output\": (input) => ({\n      data: {\n        output: String(input.parameters.prefix || \"\")\n          + String(input.node.data.output || \"\").toUpperCase()\n      },\n      message: \"已将节点输出转换为大写\"\n    })\n  }\n});\n```\n\n安装后，在画布中选择 `ai-text` 或 `source-text` 节点，节点上方工具栏会显示插件图标；右键菜单中也会出现“输出转大写”。\n\n## 4. Manifest 顶层字段\n\n| 字段 | 类型 | 必填 | 规则 |\n|---|---|---:|---|\n| `apiVersion` | number | 是 | 固定为 `1` |\n| `runtime` | string | 否 | `javascript`（默认）或 `python` |\n| `id` | string | 是 | 插件唯一 ID，建议使用反向域名；仅允许小写字母、数字、点、下划线和短横线，最长 128 字符 |\n| `name` | string | 是 | 用户可见名称，最长 80 字符 |\n| `version` | string | 是 | 插件版本，最长 32 字符；建议使用语义化版本，如 `1.2.0` |\n| `author` | string | 否 | 作者名称，最长 80 字符 |\n| `description` | string | 否 | 插件用途说明，最长 240 字符 |\n| `repository` | string | GitHub 发布必填 | GitHub HTTPS 仓库地址，格式为 `https://github.com/作者/仓库` |\n| `homepage` | string | 否 | 插件主页，必须使用 HTTPS |\n| `license` | string | 否 | 开源许可证标识，如 `MIT`、`Apache-2.0` |\n| `category` | string | 是 | 插件分类，见下表 |\n| `keywords` | string[] | 否 | 1–12 个关键词，每项最长 128 字符 |\n| `entry` | string | 是 | JavaScript 固定为 `main.js`；Python 固定为 `main.py` |\n| `permissions` | string[] | 是 | 插件权限，见权限章节 |\n| `contributes.nodeTools` | object[] | 条件必填 | 插件贡献的节点工具，最多 64 个 |\n| `resources` | object[] | 否 | 当前 revision 随包安装的不可变资源，最多 64 项、合计 64 MiB |\n| `ui` | object | 否 | 自定义 UI bundle、SHA-256 与导出映射；使用时必须声明 `ui.custom` |\n| `contributes.nodes` | object[] | 条件必填 | 自定义节点，最多 32 个；两类贡献至少填写一种 |\n\n### category 可选值\n\n| 值 | 含义 |\n|---|---|\n| `content` | 文本、提示词、结构化内容处理 |\n| `media` | 图片、视频、音频相关的元数据处理 |\n| `workflow` | 工作流内容或参数处理 |\n| `utility` | 不属于以上分类的通用工具 |\n\n分类用于向用户说明插件用途，不会自动授予额外权限。\n\n## 5. 节点工具声明\n\n`contributes.nodeTools` 中的每一项表示一个节点工具。同一个工具可以同时出现在右键菜单和节点工具栏。\n\n| 字段 | 类型 | 必填 | 规则 |\n|---|---|---:|---|\n| `id` | string | 是 | 工具在当前插件内的唯一 ID，最长 64 字符；仅允许小写字母、数字、点、下划线和短横线 |\n| `title` | string | 是 | 菜单、工具提示和弹窗中的工具名称，最长 80 字符 |\n| `description` | string | 否 | 工具用途说明，最长 240 字符 |\n| `placements` | string[] | 是 | 可填写 `node-context-menu`、`node-toolbar`，也可同时填写两者 |\n| `icon` | string | 工具栏入口必填 | Iconify 图标名，例如 `lucide:wand-sparkles`；不接受 URL、SVG 或 HTML |\n| `dialog` | object | 工具栏入口必填 | 点击后由宿主渲染声明式表单，或在主窗口 Modal 中挂载隔离自定义 UI |\n| `nodeTypes` | string[] | 是 | 工具适用的节点类型 |\n| `inputFields` | string[] | 是 | 允许传给插件的节点数据顶层字段，数量为 1–64 个 |\n| `output` | object | 是 | 工具的写入方式和允许输出的字段 |\n\nManifest 中的工具 ID 必须与 `main.js` 的 `tools` 键完全一致。\n\n### placements 与交互方式\n\n| 值 | 出现位置 | 点击行为 |\n|---|---|---|\n| `node-context-menu` | 节点右键菜单 | 声明 `dialog` 时打开同一个主窗口弹窗；未声明时立即执行，`input.parameters` 为空对象 |\n| `node-toolbar` | 匹配节点的上方工具栏 | 打开 Manifest 声明的宿主弹窗，用户确认后执行 |\n\n同一工具从工具栏或右键菜单触发时复用同一个弹窗。只要声明了 `dialog`，即使没有必填字段也会打开它；完全不需要 UI 的一键工具可以省略 `dialog`，插件需自行处理空的 `input.parameters`。\n\n工具栏按钮会自动追加到现有节点工具栏，不进入用户的内置工具栏排序配置。按钮提示格式为“工具标题 · 插件名称”。目前实际提供上方工具栏的节点族包括文本、图片、视频、音频和全景；对应的源节点复用同一工具栏，但仍按 `nodeTypes` 精确匹配。\n\n### icon 规则\n\n工具栏入口必须提供 `icon`。它必须是 Iconify 的 `集合:图标名` 格式，只能使用小写字母、数字和短横线，例如：\n\n```json\n\"icon\": \"lucide:wand-sparkles\"\n```\n\n插件不能传入远程图标 URL、SVG 字符串、HTML 或本地文件路径。\n\n### dialog 规则\n\n`node-toolbar` 工具必须声明 `dialog`：\n\n```json\n\"dialog\": {\n  \"title\": \"整理文本\",\n  \"description\": \"选择处理方式并填写附加说明。\",\n  \"submitLabel\": \"开始处理\",\n  \"fields\": [\n    {\n      \"id\": \"instruction\",\n      \"label\": \"附加说明\",\n      \"type\": \"textarea\",\n      \"placeholder\": \"请输入要求\",\n      \"required\": true\n    },\n    {\n      \"id\": \"tone\",\n      \"label\": \"语气\",\n      \"type\": \"select\",\n      \"defaultValue\": \"brief\",\n      \"options\": [\n        { \"label\": \"简洁\", \"value\": \"brief\" },\n        { \"label\": \"详细\", \"value\": \"detailed\" }\n      ]\n    }\n  ]\n}\n```\n\n`dialog` 支持以下字段：\n\n| 字段 | 类型 | 必填 | 规则 |\n|---|---|---:|---|\n| `title` | string | 否 | 弹窗标题，缺省使用工具 `title` |\n| `description` | string | 否 | 弹窗说明，缺省使用工具 `description` |\n| `submitLabel` | string | 否 | 确认按钮文字，缺省为“执行” |\n| `fields` | object[] | 是 | 0–16 个表单字段；空数组表示仅确认后执行 |\n\n表单字段支持 `text`、`textarea`、`number`、`select` 和 `boolean`。每项可声明 `id`、`label`、`type`、`description`、`placeholder`、`required` 与 `defaultValue`；`select` 还必须声明 1–32 个 `{ \"label\", \"value\" }` 选项。字段 `id` 在当前弹窗中必须唯一，只能使用字母开头的字母、数字和下划线组合。\n\nAPI v1 还支持 `model` 类型，用于让用户在弹窗里选择模型：\n\n| 类型 | 说明 | 额外字段 |\n|---|---|---|\n| `model` | 渲染当前已配置且可调用的模型下拉。插件只拿到用户选择的模型 ID，拿不到 API Key、接口地址或任何厂商凭据 | 可选 `modelCategories`：`text`、`image`、`video`、`audio` 的数组，缺省表示不限分类 |\n\n```json\n{\n  \"id\": \"model\",\n  \"label\": \"分析模型\",\n  \"type\": \"model\",\n  \"modelCategories\": [\"text\"],\n  \"required\": true\n}\n```\n\n`model` 字段要求插件声明 `models.read`；`modelCategories` 只能用在 `model` 字段上。模型下拉只列出已配置凭据的模型，未配置的厂商不会出现。\n\n### 支持的 nodeTypes\n\n| 节点类型 | 用途 |\n|---|---|\n| `ai-text` | AI 文本节点 |\n| `ai-image` | AI 图片节点 |\n| `ai-video` | AI 视频节点 |\n| `ai-audio` | AI 音频节点 |\n| `ai-animation` | AI 动画节点 |\n| `ai-panorama` | AI 全景节点 |\n| `ai-markdown` | Markdown 节点 |\n| `ai-storyboard` | 宫格分镜节点 |\n| `ai-shotlist` | 分镜表节点 |\n| `ai-director` | 导演台节点 |\n| `source-image` | 图片源节点 |\n| `source-video` | 视频源节点 |\n| `source-audio` | 音频源节点 |\n| `source-text` | 文本源节点 |\n| `canvas-note` | 画布笔记 |\n| `comment` | 评论节点 |\n\n一个工具可以同时声明多个节点类型：\n\n```json\n\"nodeTypes\": [\"ai-text\", \"source-text\", \"ai-markdown\"]\n```\n\n## 6. 输入数据\n\n工具函数接收一个 `input` 对象：\n\n```typescript\ninterface PluginInput {\n  projectId: string;\n  iteration: number;\n  parameters: Record<string, JsonValue>;\n  node: {\n    id: string;\n    type: string;\n    data: Record<string, JsonValue>;\n  };\n  models: PluginModelSummary[];\n  effectResult?: PluginNodeHostEffectResult;\n}\n```\n\n`input.parameters` 来自宿主弹窗。工具栏按钮总会先打开弹窗；右键菜单是直接执行入口，通常该值为 `{}`，但工具声明了必填字段时宿主会先打开弹窗（见第 5 节）。插件应为可选参数提供缺省处理：\n\n```javascript\nconst prefix = String(input.parameters.prefix || \"\");\nconst confirmed = input.parameters.confirmed === true;\n```\n\n另外三个字段与宿主 effect 相关，详见「宿主 effect」：\n\n| 字段 | 含义 |\n|---|---|\n| `iteration` | 当前是第几轮调用，首次为 `0`；每完成一次宿主 effect 加一 |\n| `models` | 当前可调用模型目录，每项包含 `id`、`name`、`provider`、`category` 与 `inputModalities`，不含任何凭据；未声明 `models.read` 时为空数组 |\n| `effectResult` | 上一轮宿主 effect 的结果，`{ type, ok, value?, error? }`；首次调用时不存在 |\n\n```javascript\nconst models = input.models.filter((model) => model.category === \"text\");\nif (input.effectResult && !input.effectResult.ok) {\n  return { data: { output: `调用失败：${input.effectResult.error}` } };\n}\n```\n\n其中 `input.node.data` 只包含当前工具在 `inputFields` 中声明、并且可以安全转换为 JSON 的字段。例如：\n\n```json\n\"inputFields\": [\"label\", \"prompt\", \"output\"]\n```\n\n对应的插件代码：\n\n```javascript\nconst label = input.node.data.label;\nconst prompt = input.node.data.prompt;\nconst output = input.node.data.output;\n```\n\n常用节点字段包括：\n\n| 字段 | 常见类型 | 含义 |\n|---|---|---|\n| `label` | string | 节点名称 |\n| `prompt` | string | 提示词 |\n| `output` | string | 文本结果或媒体 URL |\n| `status` | string | `idle`、`loading`、`success` 或 `error` |\n| `model` | string | 当前模型 ID |\n| `provider` | string | 当前供应商 ID |\n| `workflowId` | string | 当前工作流 ID |\n| `workflowInputs` | object | 工作流输入映射 |\n| `imageUrl` | string | 图片展示 URL |\n| `videoUrl` | string | 视频展示 URL |\n| `audioUrl` | string | 音频展示 URL |\n| `thumbnailUrl` | string | 缩略图 URL |\n| `style` | string | 画风 ID |\n| `aspectRatio` | string | 宽高比 |\n| `imageWidth` / `imageHeight` | number | 图片尺寸 |\n| `videoWidth` / `videoHeight` | number | 视频尺寸 |\n| `note` | object | 画布笔记数据 |\n\n不同节点不一定拥有所有字段。插件必须处理字段不存在或值为空的情况。\n\n以下本地敏感字段禁止出现在 `inputFields` 中：\n\n- `filePath`\n- `relativePath`\n- `directorCaptureFilePaths`\n- `__proto__`\n- `constructor`\n- `prototype`\n\n## 7. main.js 注册规则\n\n入口文件必须且只能调用一次全局函数 `definePlugin`：\n\n```javascript\ndefinePlugin({\n  tools: {\n    \"tool-id\": (input) => {\n      return {\n        data: {\n          output: \"插件处理结果\"\n        },\n        message: \"可选的完成提示\"\n      };\n    }\n  }\n});\n```\n\n规则如下：\n\n- `tools` 的键是 Manifest 中声明的工具 ID；\n- 每个工具值必须是同步函数；\n- 工具必须返回可 JSON 序列化的普通对象；\n- 返回对象必须包含非空的 `data` 对象，或包含一个 `effect` 请求宿主代执行模型/资源能力；\n- `message` 可选，用于执行完成后的短提示，最长保留 240 字符；\n- 不要修改 `input`，应根据输入创建并返回新数据；\n- 不要返回函数、Symbol、循环引用、`undefined`、Promise 或其他不可 JSON 序列化的值。\n\n返回 `effect` 的多阶段写法见第 9 节「宿主 effect」；节点工具与自定义节点都可以使用，两者只是取模型 ID 的位置不同。\n\nPlugin API 的 JSON 值范围为：\n\n```typescript\ntype JsonValue =\n  | null\n  | boolean\n  | number\n  | string\n  | JsonValue[]\n  | { [key: string]: JsonValue };\n```\n\n### 7.1 main.py 注册规则\n\n可信 Python 插件同样使用 API v1，并显式声明运行时：\n\n```json\n{\n  \"apiVersion\": 1,\n  \"runtime\": \"python\",\n  \"entry\": \"main.py\"\n}\n```\n\n`main.py` 必须调用一次 `define_plugin`，工具函数接收与 JavaScript 相同的 JSON 输入并返回可 JSON 序列化的字典：\n\n```python\ndef uppercase(input_value):\n    output = str(input_value[\"node\"][\"data\"].get(\"output\", \"\"))\n    return {\n        \"data\": {\"output\": output.upper()},\n        \"message\": \"已转换输出\",\n    }\n\ndefine_plugin({\"tools\": {\"uppercase-output\": uppercase}})\n```\n\n宿主按顺序探测 macOS/Linux 的 `python3`、`python`，以及 Windows 的 `python`、`py -3`、`python3`。解释器必须是 Python 3。插件直接使用该环境的标准库和 site-packages；AI Canvas 不下载 Python、不创建虚拟环境，也不读取或自动执行 `requirements.txt`。\n\nPython 工具同样必须同步返回 JSON 数据；不接受 coroutine。每次调用使用一个独立子进程，默认最长运行 30 秒。源码通过标准输入传递，不拼接到 Shell 命令中。\n\n> **安全警告：** Python 插件不是沙箱。它以当前用户身份运行，可以绕过 Manifest 权限自行访问本机文件、网络和环境变量，也可以启动其他程序。Manifest 权限只约束 AI Canvas 代办的模型、资源和画布能力。只安装并启用你信任且已审查源码的 Python 插件。\n\n## 8. 输出规则\n\n### 更新当前节点\n\n使用 `update-current` 将结果合并到当前节点：\n\n```json\n\"output\": {\n  \"mode\": \"update-current\",\n  \"fields\": [\"label\", \"output\"]\n}\n```\n\n```javascript\ndefinePlugin({\n  tools: {\n    \"format-output\": (input) => ({\n      data: {\n        label: `${input.node.data.label}（已处理）`,\n        output: String(input.node.data.output || \"\").trim()\n      }\n    })\n  }\n});\n```\n\n### 创建派生节点\n\n使用 `create-node` 在源节点右侧创建新节点：\n\n```json\n\"output\": {\n  \"mode\": \"create-node\",\n  \"nodeType\": \"source-text\",\n  \"fields\": [\"label\", \"output\"]\n}\n```\n\n```javascript\ndefinePlugin({\n  tools: {\n    \"create-summary\": (input) => ({\n      data: {\n        label: \"内容摘要\",\n        output: String(input.node.data.output || \"\").slice(0, 120)\n      },\n      message: \"已创建摘要节点\"\n    })\n  }\n});\n```\n\n`nodeType` 仅对 `create-node` 有效；省略时沿用源节点类型。未返回 `label` 时，宿主会根据源节点和工具名称生成新节点名称。\n\n插件只能返回 `output.fields` 中预先声明的字段。如果返回未声明字段，整次执行会失败，不会进行部分写入。\n\nJavaScript 节点工具返回 `imageUrl`、`thumbnailUrl`、`videoUrl`、`audioUrl`、`sourceUrl` 或其他宿主媒体载体时，远程地址必须与本次输入中的真实媒体引用完全一致。插件不能拼接、改写查询参数或从普通文本、JSON、文件正文、弹窗参数中构造新的 `http/https` 媒体地址。插件同样不能猜测或自行返回 `asset:`、`file:`、`blob:` 等本地引用；只有宿主在本轮模型结果中发出的精确本地引用可以原样回传。普通文本节点的 `output` 仍可包含网页链接；只有会被宿主作为媒体加载的字段受此限制。\n\n`ai-markdown` 的 `output` 需要额外遵守同一规则：普通 Markdown 链接可以正常输出，但 `![说明](URL)` 图片会被宿主加载，因此其中的远程 URL 必须来自该 Markdown 节点原有的图片引用或其他受信媒体来源。\n\n以下字段属于宿主身份、本地资产或内部关联信息，禁止写入：\n\n- `type`\n- `displayId`\n- `filePath`\n- `relativePath`\n- `assetId`\n- `artifactId`\n- `role`\n- `dramaAssetId`\n- `dramaAssetKind`\n- `characterLibraryLinks`\n- `hiddenByCharacterLibrary`\n- `directorInstanceId`\n- `directorCaptureFilePaths`\n- `__proto__`\n- `constructor`\n- `prototype`\n\n## 9. 自定义节点与资源端口\n\n自定义节点由宿主统一渲染。Manifest 决定节点字段和端口，`main.js` / `main.py` 中与节点 `id` 同名的 `tools` 函数负责编排数据及宿主能力。\n\n```json\n{\n  \"apiVersion\": 1,\n  \"permissions\": [\n    \"node.read\",\n    \"node.write\",\n    \"models.read\",\n    \"models.invoke\",\n    \"files.connected.read\",\n    \"files.output.create\",\n    \"plugin.resources.read\"\n  ],\n  \"resources\": [{\n    \"id\": \"system-prompt\",\n    \"path\": \"resources/system-prompt.txt\",\n    \"integrity\": \"sha256-<64位十六进制摘要>\",\n    \"mediaType\": \"text/plain\",\n    \"bytes\": 128\n  }],\n  \"contributes\": {\n    \"nodeTools\": [],\n    \"nodes\": [{\n      \"id\": \"writer\",\n      \"title\": \"写作节点\",\n      \"description\": \"读取直接连入的资料并调用文本模型\",\n      \"icon\": \"lucide:sparkles\",\n      \"inputs\": [{\n        \"id\": \"source\",\n        \"label\": \"资料\",\n        \"type\": \"resource\",\n        \"multiple\": true,\n        \"accept\": [\"text/*\", \"application/json\"],\n        \"maxBytes\": 1048576\n      }],\n      \"outputs\": [{ \"id\": \"result\", \"label\": \"结果\", \"type\": \"text\" }],\n      \"fields\": [\n        { \"id\": \"prompt\", \"label\": \"提示词\", \"type\": \"textarea\", \"required\": true },\n        { \"id\": \"model\", \"label\": \"模型\", \"type\": \"model\", \"modelCategories\": [\"text\"] }\n      ],\n      \"resourceAccess\": { \"self\": true, \"incoming\": true, \"portIds\": [\"source\"] }\n    }]\n  }\n}\n```\n\n### 节点字段\n\n`fields` 最多 16 项，支持 `text`、`textarea`、`number`、`select`、`boolean` 和 `model`。`modelCategories` 可包含 `text`、`image`、`video`、`audio`；模型下拉只显示当前已配置且可调用的模型。文件不再作为表单字段保存，统一通过 `resourceAccess` 和 `input.resources` 获得短期句柄。\n\n### 输入输出端口\n\n`inputs`、`outputs` 各最多 16 项，端口类型支持 `text`、`image`、`video`、`audio`、`json` 和 `resource`。输入端口可声明 `required` 和 `multiple`；媒体与 `resource` 端口还可声明 MIME `accept` 与单文件 `maxBytes`。插件最终只能返回 Manifest 已声明的字段和输出端口。\n\n插件节点之间的连线按来源 `plugin-out-<outputId>` 和目标 `plugin-in-<inputId>` 精确路由。目标 Handle 缺失或未知时不会回退到第一个输入端口。显式插件端口要求来源插件、节点和端口仍属于当前活动 revision，且来源与目标端口类型完全一致；例如 `image` 不能直接连接到 `text`。来源插件被卸载、节点被移除、端口被改名或连线被替换时会立即失效，不会回退到其它输出端口。\n\n### 文件资源授权\n\n`resourceAccess` 默认不授予任何文件：\n\n- `self: true`：当前目标节点自身引用的项目文件；\n- `incoming: true`：当前节点的一跳直接输入连线所引用的项目文件；\n- `portIds`：仅自定义节点可用，把入边授权进一步限制到指定输入端口，且必须与 `incoming: true` 同时声明；\n- `resources[]`：插件包内不可变资源，按 ID、相对路径、字节数和 SHA-256 随完整 revision 登记。\n\n项目文件要求位于当前项目目录中，路径及父目录均不得是符号链接。宿主只把以下结构放进 `input.resources`，不提供绝对路径或项目相对路径：\n\n```json\n{\n  \"self\": [],\n  \"incoming\": [{\n    \"resourceId\": \"plugin-resource-<opaque>\",\n    \"origin\": \"connection\",\n    \"displayName\": \"frame.png\",\n    \"mediaType\": \"image/png\",\n    \"size\": 123456,\n    \"access\": \"read\",\n    \"source\": { \"nodeId\": \"source-node\", \"edgeId\": \"edge-1\", \"portId\": \"source\" }\n  }],\n  \"inputs\": { \"source\": [{\n    \"resourceId\": \"plugin-resource-<opaque>\",\n    \"origin\": \"connection\",\n    \"displayName\": \"frame.png\",\n    \"mediaType\": \"image/png\",\n    \"size\": 123456,\n    \"access\": \"read\",\n    \"source\": { \"nodeId\": \"source-node\", \"edgeId\": \"edge-1\", \"portId\": \"source\" }\n  }] },\n  \"package\": []\n}\n```\n\n`resourceId` 只在本次调用或 UI 会话内有效，并绑定插件 ID、入口源码摘要、完整 revision 摘要、项目、节点、画布 revision、连线和端口。读取前宿主会重新检查这些条件以及文件大小、修改时间和普通文件身份；任一变化都会撤销授权。\n\n当前单个 `image`、`video` 或 `audio` 输出端口应返回一个媒体 URL 字符串。JavaScript 插件可以原样返回真实远程媒体输入、本轮宿主发出的模型结果，或受支持的安全内联媒体；自行构造的 `asset:`、`file:`、`blob:` 和不安全 `data:` 引用会被拒绝。需要把本地图片交给模型时，应使用 `model.generate.resourceIds`，由宿主解析句柄；插件不会看到本地 URL。\n\n### 宿主 effect\n\n插件 JavaScript 仍是同步函数。需要异步模型或资源能力时返回一个 `effect`；宿主完成后**再次调用同一个函数**，并在 `input.effectResult` 中给出结果。单次节点、工具或自定义 UI 会话最多执行 4 个 effect。\n\n自定义节点与**节点工具**都可以使用 effect。区别只在于模型 ID 从哪里来：自定义节点读 `input.node.values`，节点工具读弹窗传来的 `input.parameters`。\n\n```js\ndefinePlugin({\n  tools: {\n    \"analyze-frames\": (input) => {\n      // 第一轮：请求宿主调用模型\n      if (!input.effectResult) {\n        return {\n          effect: {\n            type: \"model.generate\",\n            modelId: input.parameters.model,\n            prompt: \"请逐帧分析这些画面的景别、运镜与光线。\",\n            resourceIds: input.resources.incoming\n              .filter((resource) => resource.mediaType.startsWith(\"image/\"))\n              .map((resource) => resource.resourceId)\n          }\n        };\n      }\n      // 第二轮：effectResult 已就绪\n      if (!input.effectResult.ok) {\n        return { data: { output: `模型调用失败：${input.effectResult.error}` } };\n      }\n      return {\n        data: { output: input.effectResult.value.text },\n        message: \"分析完成\"\n      };\n    }\n  }\n});\n```\n\n`input.iteration` 表示当前是第几轮（首次为 `0`），可用于区分更多阶段。不需要多阶段的工具直接返回 `data` 即可，宿主不会再发起第二次调用。\n\n支持的 effect：\n\n| `type` | 权限 | 输入 | 返回值 |\n|---|---|---|---|\n| `model.generate` | `models.invoke` | `modelId`、`prompt`、可选受信远程 `imageUrls`、本次会话的 `resourceIds` 与 `parameters` | 文本为 `{text}`；媒体为 `{url}` |\n| `resource.readText` | `files.connected.read` 或 `plugin.resources.read` | 本次授权的 `resourceId`、可选 `maxBytes` | `{resource, content}`，最多读取 256 KiB UTF-8 文本 |\n| `resource.readRange` | `files.connected.read` 或 `plugin.resources.read` | `resourceId`、`offset`、`length` | `{resource, offset, bytes, base64}`，单次最多 256 KiB |\n| `resource.createText` | `files.output.create` | `content`、可选 `suggestedName` | 在当前项目目录创建新文本，返回 `{fileName, bytes}`；不显示路径且不覆盖上游文件 |\n\n宿主操作失败时不会中断整个工具，而是以 `{ ok: false, error }` 的形式回到 `effectResult`，由插件决定降级还是报错；权限不足、模型不在目录、模型请求异常都走这条路径。\n\n模型目录通过 `input.models` 提供，只包含 ID、名称、分类、用途和输入模态，不包含 API Key、接口地址或厂商凭据；未声明 `models.read` 时该数组为空。模型实际请求始终由宿主现有生成服务执行。\n\n**随模型一起提交的参考图**：远程参考仍可从真实媒体输入原样传递；本地节点或直接连线文件使用本次 `input.resources` 中的 `resourceId`，放进 `model.generate.resourceIds`。宿主会确认资源属于当前调用且 MIME 为图片，再在插件不可见的边界内解析为模型输入。\n\n`imageUrls` 的来源规则：\n\n| 运行时 | 规则 |\n|---|---|\n| JavaScript | 每一项必须已经存在于本次 `inputFields` 声明的媒体引用中，或是本轮宿主模型产生的结果。自行拼接的远程地址会被拒绝，整次运行失败 |\n| Python | 不做来源限制——可信 Python 本身已具备当前用户的联网能力，该校验没有沙箱意义 |\n\n宿主只把成功的图片、视频或音频模型返回 URL 加入本次运行的受信媒体来源集合；文本模型结果和资源正文不会获得该资格。来源集合与资源句柄都不会跨节点、跨 invocation 或跨 UI 会话持久化。\n\n### 主窗口自定义弹窗\n\n节点工具可以用 `dialog.ui` 引用 `manifest.ui.exports` 的逻辑键，用插件自定义视图替换声明式表单。宿主仍使用自己的 `ModalOverlay`、标题栏、关闭行为和主题容器；插件 bundle 只运行在 Modal 内部的 `<iframe sandbox=\"allow-scripts\">`，不会打开额外系统窗口，也拿不到主窗口 DOM、Store、Tauri IPC 或网络能力。\n\nPlugin API v1 只允许节点工具使用自定义 UI。`contributes.nodes` 的节点主体始终由宿主根据 `fields`、`inputs` 与 `outputs` 渲染，不接受 `nodes[].ui`；这样可以保持画布拖拽、缩放、主题、焦点和错误边界一致。\n\n```json\n{\n  \"permissions\": [\"node.read\", \"node.write\", \"ui.custom\"],\n  \"ui\": {\n    \"entry\": \"ui.js\",\n    \"integrity\": \"sha256-<ui.js 的 64 位十六进制摘要>\",\n    \"exports\": { \"toolDialog\": \"ToolDialog\" }\n  },\n  \"contributes\": {\n    \"nodeTools\": [{\n      \"id\": \"compose\",\n      \"title\": \"组合处理\",\n      \"placements\": [\"node-toolbar\", \"node-context-menu\"],\n      \"icon\": \"lucide:panels-top-left\",\n      \"dialog\": { \"fields\": [], \"ui\": \"toolDialog\" },\n      \"nodeTypes\": [\"ai-image\"],\n      \"inputFields\": [\"output\"],\n      \"output\": { \"mode\": \"update-current\", \"fields\": [\"output\"] }\n    }]\n  }\n}\n```\n\n`ui.js` 必须是自包含的 IIFE/UMD bundle。插件可以使用原生 DOM，也可以把 React、Vue 等框架打进自己的 bundle；宿主不会把主窗口的 React 实例交给插件。bundle 需要把挂载函数写入 `window.__AI_CANVAS_PLUGIN_HOST__.exports.ToolDialog`，签名固定为 `(root, props) => cleanup?`：\n\n```js\n(function () {\n  window.__AI_CANVAS_PLUGIN_HOST__.exports.ToolDialog = function mount(root, props) {\n    const button = document.createElement('button');\n    button.textContent = '执行';\n    button.onclick = () => void props.submit({ confirmed: true });\n    root.appendChild(button);\n    return () => button.remove();\n  };\n})();\n```\n\n挂载函数只能操作 iframe 内传入的 `root`。它收到的 `props` 只有：\n\n- `surface`（v1 固定为 `tool-dialog`）、`theme`、裁剪后的 `node`、安全模型目录和 `parameters`；\n- 本会话的不透明 `resources`；\n- `runEffect()`、`setParameters()`、`submit()`、`close()`、`toast()` 与 `busy`。\n\niframe 与宿主只通过 `window.postMessage` 交换带随机 `sessionId` 的有界 JSON。宿主同时绑定消息的 `event.source`、插件双摘要、项目、节点和画布 revision；伪造来源、更新插件、切换项目、修改画布或断开连线都会使会话失败关闭。UI 点击提交时沿用同一 invocation 的资源句柄和受信媒体集合，不会在提交瞬间换发一组不兼容的 ID。主窗口深浅主题会实时同步到 `theme` getter 与 iframe 的 `data-theme`，同时派发 `ai-canvas-theme-change` 事件；插件负责为两种主题提供可读配色。iframe 内按 `Esc` 也会请求宿主关闭当前 Modal。\n\n宿主启动自定义 UI 前还会确认该 iframe 没有获得 `window.__TAURI__`、`window.__TAURI_INTERNALS__` 或其它 Tauri 初始化标记；检测到即停止加载插件 bundle。这个 iframe 是能力隔离边界，不承诺独立进程或 CPU/内存隔离：死循环或过重渲染仍可能影响主窗口响应，因此常规设置优先使用宿主声明式 `dialog.fields`，自定义 UI 应限制依赖、动画和大对象处理。\n\n## 10. 权限声明\n\n支持以下权限：\n\n| 权限 | 含义 |\n|---|---|\n| `node.read` | 读取 `inputFields` 声明的节点字段 |\n| `node.write` | 更新当前节点或创建派生节点 |\n| `models.read` | 读取不含凭据的可调用模型目录 |\n| `models.invoke` | 请求宿主调用目录中的模型 |\n| `files.connected.read` | 读取 `resourceAccess` 明确允许的当前节点或直接入边项目文件 |\n| `files.output.create` | 通过宿主在项目目录创建派生输出，当前开放文本输出 |\n| `plugin.resources.read` | 读取 `manifest.resources` 随当前 revision 登记的包资源 |\n| `ui.custom` | 在主窗口隔离 Modal 中加载经摘要校验的自定义 UI bundle；代码可能影响主窗口响应 |\n\n节点工具必须声明 `node.write`。只要工具声明了输入字段，也必须声明 `node.read`。模型、资源和 UI 权限不会隐式授予。节点工具的常规配置如下：\n\n```json\n\"permissions\": [\"node.read\", \"node.write\"]\n```\n\n需要模型能力的节点工具再加上模型权限：\n\n```json\n\"permissions\": [\"node.read\", \"node.write\", \"models.read\", \"models.invoke\"]\n```\n\n| 权限 | 对节点工具的作用 |\n|---|---|\n| `models.read` | 填充 `input.models`，并允许弹窗使用 `model` 字段 |\n| `models.invoke` | 允许发出 `model.generate` |\n\n只声明 `models.read` 而没有 `models.invoke` 时，`model.generate` 会被拒绝，并以 `{ ok: false, error }` 回到 `effectResult`，不会中断工具。读取节点/连线文件、包资源和创建输出分别需要对应权限；拥有权限但未声明精确 `resourceAccess` 或资源清单时仍得不到句柄。\n\n声明权限不代表插件能绕过字段白名单；运行时仍会分别校验输入和输出字段。\n\n## 11. 安全与资源限制\n\nJavaScript 插件每次调用都会创建独立 QuickJS Runtime。宿主只传入裁剪后的 JSON 快照和不透明资源句柄，不向 JavaScript 暴露 DOM、网络、文件系统或 Tauri 宿主函数。自定义 UI 运行在主窗口 sandboxed iframe 中，CSP 禁止网络连接且没有 Tauri capability。Python 插件每次调用创建独立本机子进程，但它是可信代码，不受 QuickJS 或 iframe 沙箱保护。\n\nQuickJS 运行时还会在写回画布前检查媒体引用来源。检查覆盖直接媒体 URL、媒体节点的 `output` 回退、Markdown 图片、分镜/导演台/视频参考等嵌套媒体数据。`http/https` 地址（包括本机和局域网地址）不会因目标位置而豁免。画布笔记的 `strokeColor` 和 `backgroundColor` 只接受宿主当前色板值或 `#RGB`、`#RGBA`、`#RRGGBB`、`#RRGGBBAA`，不接受任意 CSS 函数或转义。此规则用于维持“JavaScript 无任意网络能力”的边界；可信 Python 插件本身已经能以当前用户权限联网，因此不受该来源集合约束。\n\n同一套来源集合也用于校验 `model.generate` 的 `imageUrls`：JavaScript 插件只能把本次输入已有的媒体引用交给模型，Python 不受限制。模型请求由宿主发起，因此这条能力不会给 JavaScript 沙箱带来新的网络出口。\n\n节点工具使用 effect 时，宿主会在每一轮结束后重新核对插件版本与画布状态；期间发生项目切换、节点变化、插件更新、停用或卸载，过期结果都不会继续请求宿主操作，也不会写入画布。\n\n### 原生信任注册与代码摘要\n\n安装或更新时，应用会计算入口源码 `sourceDigest`，Rust 还会把规范化 Manifest、入口源码、UI bundle 和按 ID 排序的包资源字节共同计算为 `revisionDigest`。可信 Python 或自定义 UI 的确认会显示来源、完整摘要、宿主权限及对应风险；Renderer 传入的布尔值不能替代 Rust 原生授权。声明的字节数、资源/UI 摘要或两端身份不一致时拒绝安装。\n\n入口源码、UI 和包资源随后以不可变快照登记到应用私有的 `plugin-private` 目录。运行命令只提交插件 ID、`sourceDigest`、`revisionDigest`、工具 ID、调用 ID 和结构化输入，不再把 `main.js` / `main.py` 或 runtime 交给执行命令。Rust 会确认插件已启用、双摘要属于活动 revision、工具由该 revision 声明，并在每次执行和资源读取前重新核对私有快照。\n\n`plugin-private` 不能通过普通文件 API、asset URL 或通用路径命令读取。不要手动编辑其中的 `registry.json` 或源码快照；注册缺失、摘要不一致或快照损坏会让插件失败关闭，而不会退回到直接执行 IndexedDB 源码。\n\n`sourceDigest` 只绑定 `main.js` / `main.py` 的精确字节；`revisionDigest` 绑定本次实际启用的 Manifest、入口、UI 和包资源。两者都不是作者签名或仓库签名，不能证明来源可信；作者和用户仍须核对来源并审查可信 Python 代码与 UI bundle。\n\n| 项目 | 限制 |\n|---|---:|\n| `manifest.json` | 最大 64 KiB |\n| `main.js` / `main.py` | 最大 512 KiB |\n| `ui.js` | 最大 2 MiB |\n| 单个包资源 | 最大 16 MiB；单插件最多 64 项、合计 64 MiB |\n| 单次资源分段读取 | 最大 256 KiB |\n| 单次输入 JSON | 最大 1 MiB |\n| 单次输出 JSON | 最大 1 MiB |\n| 沙箱内存 | 最大 64 MiB |\n| JavaScript 栈 | 最大 512 KiB |\n| JavaScript 单次执行时间 | 最长 2 秒 |\n| Python 单次执行时间 | 解释器探测与正文执行合计最长 30 秒；Windows 使用 Job Object，macOS/Linux 使用独立进程组；管道回收另有 2 秒关闭上限 |\n| 单插件节点工具 | 最多 64 个 |\n| 单插件自定义节点 | 最多 32 个 |\n| 单节点输入/输出端口 | 各最多 16 个 |\n| 单节点/单工具宿主 effect | 最多 4 次 |\n| 单工具输入字段 | 最多 64 个 |\n| 单工具输出字段 | 最多 64 个 |\n\n传入和返回的数据还会进行边界化处理：\n\n- 字符串最长保留 256,000 个字符；\n- 数组最多保留 256 项；\n- 单个对象最多保留 128 个键；\n- JSON 嵌套深度最多 8 层；\n- 非有限数字、函数、Symbol 和危险对象键会被拒绝或移除。\n\n画布在插件执行期间发生项目切换、节点变化、插件 revision 更新、插件停用或卸载时，过期结果不会继续请求宿主 effect，也不会写入画布。更新、停用和卸载会在原生 mutation 前先撤销前端版本租约和资源句柄；旧 revision 的资源不会自动交给新代码。\n\n## 12. 安装、更新、启停与卸载\n\n### 安装\n\n1. 打开“设置”；\n2. 选择“插件”；\n3. 将插件文件夹拖到上传区，或点击上传区打开目录选择器；\n4. 选择包含同级 `manifest.json` 与 `main.js` 或 `main.py` 的插件目录；\n5. 可信 Python 或自定义 UI 插件会先显示来源、入口源码摘要、完整 revision 摘要、宿主权限和对应风险；\n6. 随后的 Rust 原生 Warning 会再次绑定插件 ID、版本与当前 revision。只有原生确认通过后才会暂存代码、UI 和声明资源；\n7. 安装成功后，在匹配类型的节点上打开右键菜单，或选择节点查看上方工具栏按钮。\n\n也可以在“插件市场”中点击安装，或粘贴 GitHub 仓库地址。GitHub 安装仍会经过与本地导入完全相同的 Manifest、权限、源码大小和沙箱校验。\n\nPython 或自定义 UI 插件在安装、更新和从停用状态重新启用时，都会先经过前端来源、摘要、宿主权限和风险复核，再经过 Rust 原生 Warning。确认表示用户信任该 revision，并不表示 AI Canvas 已对其完成安全审计。\n\n原生注册表会保留上一批准 revision，供更新失败补偿或内部回滚使用；它不是插件页中的手动降级功能。任何真实切换到上一 Python revision 的原生流程都必须重新显示高风险授权，不能沿用当前版本的批准状态。\n\n### GitHub 发布规范\n\n需要被插件市场追踪的仓库必须满足：\n\n1. 公开 GitHub 仓库根目录包含 `manifest.json` 和 Manifest 声明的 `main.js` 或 `main.py`；\n2. Manifest 填写规范化的 `repository`，且必须与当前仓库一致；\n3. `version` 使用稳定三段版本号，如 `1.2.0`；\n4. 创建正式 GitHub Release，标签使用 `vX.Y.Z`，如 `v1.2.0`；\n5. Release 标签中的版本必须与 Manifest `version` 完全一致；\n6. 不使用 Draft 或 Pre-release 作为市场稳定版。\n\n示例发布字段：\n\n```json\n{\n  \"version\": \"1.2.0\",\n  \"repository\": \"https://github.com/example/my-ai-canvas-plugin\",\n  \"homepage\": \"https://example.com/my-ai-canvas-plugin\",\n  \"license\": \"MIT\"\n}\n```\n\n应用读取 GitHub 的最新正式 Release，再从该 Release 标签对应的仓库快照读取根目录文件。仓库地址、Release 标签和 Manifest 版本任一不匹配时都会拒绝安装。\n\n### 提交到插件市场\n\n插件市场索引位于项目的 `public/plugin-marketplace.json`。作者通过 Pull Request 添加仓库地址：\n\n```json\n{\n  \"schemaVersion\": 1,\n  \"plugins\": [\n    {\n      \"repository\": \"https://github.com/example/my-ai-canvas-plugin\",\n      \"featured\": false\n    }\n  ]\n}\n```\n\n市场收录只登记仓库，不复制插件源码。收录后，作者发布新的稳定版 Release，应用会在刷新插件页时自动识别新版本。未收录的公开仓库仍可通过仓库地址直接安装；直接安装后也会继续检查更新。\n\n### 更新\n\n修改 Manifest、入口、UI 或包资源后重新导入相同 `id` 的插件，会先暂存新的不可执行快照。安装记录保存成功后，宿主先撤销旧版本租约和资源句柄，再原子激活新 `revisionDigest`，并保留原来的启用或停用状态；原生层同时保留上一批准 revision 供本次失败补偿，不代表用户可以手动降级。摘要比较、数据库保存或激活任一步失败，都会回切旧 active 或移除首次注册，并丢弃未提交的 staged 快照。\n\n完整 revision 身份包含 Manifest、入口源码、UI 和包资源；只修改其中任一部分都会形成新的 `revisionDigest`，不需要为了改变 Manifest 而人为改动入口源码。\n\nGitHub 插件有新稳定版时会显示“可更新”。更新必须由用户点击确认，不会静默替换本地插件。检查结果会短期缓存，以避免频繁消耗 GitHub API 限额。\n\n### 启用、停用与卸载\n\n- 从停用状态重新启用时，宿主重新激活已登记的 active 摘要；可信 Python 必须重新通过前端复核和 Rust 原生 Warning，JavaScript 不获得 Python 授权语义；\n- 停用后，插件工具不会显示在节点右键菜单或工具栏中；\n- 停用、卸载或切换 revision 时，前端会先撤销版本租约并清除资源句柄，原生层随后阻止新调用并取消活动 Python 调用；\n- 卸载成功后会移除应用内的原生注册、IndexedDB 安装记录和私有源码快照，但不会删除用户最初选择的插件开发目录，也不会修改 GitHub 仓库；\n- 已经写入节点的数据不会随插件卸载而自动撤销，可通过画布历史记录撤销最近操作。\n\n## 13. 常见错误\n\n### 插件工具没有出现在右键菜单或工具栏\n\n检查：\n\n- 插件是否处于“已启用”状态；\n- 当前节点类型是否包含在 `nodeTypes` 中；\n- `placements` 是否包含目标入口：`node-context-menu` 或 `node-toolbar`；\n- 工具栏入口是否配置了合法的 `icon` 和 `dialog`；\n- Manifest 工具 ID 是否与 `main.js` 中的 `tools` 键一致。\n\n### 安装时报“请求了不允许暴露给插件的本地字段”\n\n`inputFields` 中包含了本地路径或受保护字段。请改为读取安全的展示字段，例如 `output`、`imageUrl` 或 `fileName`。\n\n### 执行时报“返回了未声明字段”\n\n插件返回的 `data` 包含了 `output.fields` 未声明的字段。将需要写入的安全字段加入 Manifest，或者从返回值中删除该字段。\n\n### 执行时报“未经宿主授权的远程媒体引用”或“未经宿主授权的本地媒体引用”\n\nJavaScript 插件返回了一个并非来自真实媒体输入或本轮宿主媒体模型结果的媒体 URL。请改为原样透传输入，或通过 `model.generate` 让宿主创建媒体；不要自行拼接 CDN、跟踪像素、查询参数、局域网地址，也不要猜测 `asset:`、`file:` 或 `blob:` 本地引用。\n\n### 执行时报“端口类型不兼容”\n\n插件输出端口与目标输入端口的声明类型不同。请连接相同的 `text`、`image`、`video`、`audio` 或 `json` 类型；需要格式转换时，应使用一个显式转换节点。\n\n### 模型调用后 `input.models` 是空数组，或模型下拉为空\n\n插件没有声明 `models.read`，或当前没有已配置凭据的模型。下拉只列出已配置且可调用的模型，未配置的厂商不会出现；声明 `models.read` 后仍为空时，请检查设置中的厂商连接。\n\n### 宿主操作返回 `ok: false`，提示未声明 models.invoke\n\n工具发出了 `model.generate`，但 Manifest 只声明了 `models.read`。宿主不会抛出错误，而是把 `{ ok: false, error: \"插件未声明 models.invoke 权限\" }` 放进 `effectResult` 交回插件。在 `permissions` 中加入 `models.invoke`，或在插件里对该结果做降级处理。\n\n### 执行时报“模型调用的 imageUrls 必须是字符串数组”或“未经宿主授权的远程媒体引用”\n\n`imageUrls` 必须是字符串数组，且 JavaScript 插件只能提交本次 `inputFields` 中已有的媒体引用或本轮宿主模型结果。不要从文本、JSON、文件正文或弹窗参数里拼接新的 `http/https` 地址；确实需要新图时改用 Python 运行时，或让宿主先生成媒体再引用。\n\n### 执行时报“来源插件未安装或已卸载”\n\n当前连线指向一个无法从安装记录解析的显式插件输出端口。请重新安装提供该节点的兼容插件，或删除这条失效连线后重新连接；宿主不会把遗留的通用输出静默代替目标端口。\n\n### 执行时报“不允许的画布笔记颜色”\n\nJavaScript 插件为画布笔记返回了任意 CSS 表达式。请使用宿主色板中的现有值，或使用 3、4、6、8 位十六进制颜色；不要使用 `url()`、转义函数或其他 CSS 代码。\n\n### 执行时报“源码摘要”或“插件未注册”\n\n安装记录与原生私有注册表不一致，或者源码快照已损坏。请停用插件并从原始本地目录或可信仓库重新安装。应用不会为了兼容而直接执行 IndexedDB 中的源码。\n\n### 执行时报“首版插件工具不支持异步返回值”\n\n工具返回了 Promise，或使用了 `async`。v1 工具必须同步完成并直接返回普通对象。\n\n### 执行超过 2 秒\n\n减少输入规模和循环次数，避免无限循环。超过时间限制的执行会被沙箱中断，结果不会写入画布。\n\n### 未找到可用的 Python 3\n\n在插件设置页点击“重新检测”。确认终端中能直接运行 `python3`、`python`，或 Windows 的 `py -3`。AI Canvas 不会自动下载解释器或安装依赖。\n\n### Python 插件输出不是有效 JSON\n\n工具必须返回可由 `json.dumps` 序列化的字典。不要向原始 stdout 写入额外协议内容；普通 `print` 会被 runner 捕获，但直接写文件描述符或子进程继承 stdout 仍可能破坏 JSON 输出。\n\n## 14. 发布前检查清单\n\n- [ ] 文件夹根目录包含 `manifest.json` 和对应的 `main.js` 或 `main.py`；\n- [ ] `apiVersion` 固定为 `1`；JavaScript 使用 `main.js`，Python 使用 `runtime: python` 与 `main.py`；\n- [ ] 插件 ID 稳定且不会随版本变化；\n- [ ] GitHub 发布填写了正确的 `repository`、`license` 和三段式 `version`；\n- [ ] GitHub Release 标签为与 Manifest 版本一致的 `vX.Y.Z`；\n- [ ] 每个 Manifest 工具 ID 都在 `definePlugin().tools` 或 `define_plugin()[\"tools\"]` 中注册；\n- [ ] 工具栏工具配置了合法的 Iconify `icon` 和声明式 `dialog`；\n- [ ] `nodeTypes` 只包含实际支持的节点类型；\n- [ ] `inputFields` 只申请工具确实需要的数据；\n- [ ] `output.fields` 与工具实际返回的 `data` 字段完全一致；\n- [ ] 对缺失、空字符串、空数组等输入进行了处理；\n- [ ] 工具同步执行；JavaScript 正常数据规模下远低于 2 秒，Python 远低于 30 秒；\n- [ ] JavaScript 未使用任意网络、任意路径、DOM、Tauri、npm 包或异步 API；模型和资源操作只返回受支持 effect；\n- [ ] JavaScript 的远程媒体输出只原样透传真实媒体输入或本轮宿主媒体模型结果，没有自行拼接 URL；\n- [ ] Markdown 图片和画布笔记颜色没有形成新的远程资源加载入口；\n- [ ] 自定义节点的来源/目标端口类型一致，并已验证多个输出端口分别连线时的结果；\n- [ ] Python 插件的本机访问、依赖和供应链风险已经由作者与用户审查；\n- [ ] 已测试“更新当前节点”和“创建派生节点”是否符合预期；\n- [ ] `name`、`description` 和工具标题能让用户理解插件用途与出现位置；\n- [ ] 使用模型能力时声明了 `models.read`（目录与模型下拉）与 `models.invoke`（`model.generate`）；\n- [ ] `resourceAccess` 只包含确实需要的 `self`、直接 `incoming` 和端口；没有依赖真实路径；\n- [ ] `resources[]` 的路径、字节数、MIME 与 SHA-256 和发布包实际文件一致；\n- [ ] 自定义 UI 在主窗口 Modal 的深浅主题下均可读，且只通过 props / `runEffect` 使用宿主能力；\n- [ ] 弹窗 `model` 字段的 `modelCategories` 与实际调用的模型分类一致；\n- [ ] 用 `input.effectResult` 或 `input.iteration` 区分了 effect 前后两种阶段，并处理了 `ok: false`；\n- [ ] JavaScript 插件提交的 `imageUrls` 都来自本次输入已有的媒体引用或本轮宿主模型结果。\n\n## 15. 版本约定\n\n- 当前只接受 `apiVersion: 1`，它直接包含本文档列出的节点工具、自定义节点、资源、effect、可信 Python 与主窗口隔离 UI；\n- 不存在更早插件格式的加载、迁移或运行兜底；缺少有效 `sourceDigest` / `revisionDigest` 或原生私有快照的记录会失败关闭，必须重新安装；\n- 插件自身的 `version` 用于展示、更新和发布管理，不决定 API 兼容性；同一插件升级时保持 `id` 不变；\n- 已发布工具和节点应尽量保持各自 `id` 稳定；改变端口 ID 会让现有连线按安全规则失效；\n- 插件不得依赖未在本文档中声明的宿主内部对象。后续能力优先通过 v1 的可选声明扩展；只有出现无法安全表达的破坏性变化时才重新评估 API 版本。\n\n相关架构设计见：[用户插件平台设计](./plans/2026-08-23-user-plugin-platform.md)、[ADR 0009：可信 Python 插件运行时](./adr/0009-trusted-python-plugin-runtime.md)与[原生信任注册表 ADR（0010-native-plugin-trust-registry.md）](./adr/0010-native-plugin-trust-registry.md)。\n", En = "https://raw.githubusercontent.com/Tenney95/AI-Canvas-tauri/master/public/plugin-marketplace.json", Dn = "/plugin-marketplace.json", On = 900 * 1e3, kn = 15e3, An = 128 * 1024, jn = 256 * 1024, Mn = 64 * 1024, Nn = 512 * 1024, Pn = 100, Fn = /^v?(\d+\.\d+\.\d+)$/, In = /* @__PURE__ */ new Map();
function Ln(e, t) {
	if (!e || typeof e != "object" || Array.isArray(e)) throw Error(`${t} 必须是对象`);
	return e;
}
function Rn(e) {
	let t = e.trim();
	return b(t.includes("://") ? t : `https://github.com/${t}`);
}
function zn(e) {
	let t = new URL(e).pathname.split("/").filter(Boolean);
	return [t[0], t[1]];
}
async function Bn(e, t, n, r) {
	let i = new AbortController(), a = setTimeout(() => i.abort(), kn);
	try {
		let a = await e(t, {
			signal: i.signal,
			headers: r ? { Accept: r } : void 0
		});
		if (!a.ok) throw Error(`请求失败（HTTP ${a.status}）`);
		let o = Number(a.headers.get("content-length"));
		if (Number.isFinite(o) && o > n) throw Error("下载内容过大");
		let s = await a.text();
		if (new Blob([s]).size > n) throw Error("下载内容过大");
		return s;
	} catch (e) {
		throw e instanceof DOMException && e.name === "AbortError" ? Error("请求超时", { cause: e }) : e;
	} finally {
		clearTimeout(a);
	}
}
async function Vn(e, t, n) {
	let r = new AbortController(), i = setTimeout(() => r.abort(), kn);
	try {
		let i = await e(t, { signal: r.signal });
		if (!i.ok) throw Error(`请求失败（HTTP ${i.status}）`);
		let a = Number(i.headers.get("content-length"));
		if (Number.isFinite(a) && a > n) throw Error("下载内容过大");
		let o = new Uint8Array(await i.arrayBuffer());
		if (o.byteLength > n) throw Error("下载内容过大");
		return o;
	} catch (e) {
		throw e instanceof DOMException && e.name === "AbortError" ? Error("请求超时", { cause: e }) : e;
	} finally {
		clearTimeout(i);
	}
}
function Hn(e) {
	if (new Blob([e]).size > An) throw Error("插件市场索引过大");
	let t;
	try {
		t = JSON.parse(e);
	} catch {
		throw Error("插件市场索引不是有效 JSON");
	}
	let n = Ln(t, "插件市场索引");
	if (n.schemaVersion !== 1) throw Error("不支持的插件市场索引版本");
	if (!Array.isArray(n.plugins) || n.plugins.length > Pn) throw Error(`插件市场索引最多允许 ${Pn} 个插件`);
	let r = /* @__PURE__ */ new Set();
	return n.plugins.map((e, t) => {
		let n = Ln(e, `plugins[${t}]`);
		if (typeof n.repository != "string") throw Error(`plugins[${t}].repository 必须是字符串`);
		if (n.featured !== void 0 && typeof n.featured != "boolean") throw Error(`plugins[${t}].featured 必须是布尔值`);
		let i = Rn(n.repository);
		if (r.has(i)) throw Error(`插件市场索引包含重复仓库：${i}`);
		return r.add(i), {
			repository: i,
			featured: n.featured === !0
		};
	});
}
function Un(e) {
	let t = /^(\d+)\.(\d+)\.(\d+)$/.exec(e);
	if (!t) throw Error(`版本号必须使用 X.Y.Z 格式：${e}`);
	return [
		Number(t[1]),
		Number(t[2]),
		Number(t[3])
	];
}
function Wn(e, t) {
	let n = Un(e), r = Un(t);
	for (let e = 0; e < n.length; e += 1) if (n[e] !== r[e]) return n[e] > r[e] ? 1 : -1;
	return 0;
}
async function Gn(e, t = {}) {
	let n = t.fetcher ?? fetch, r = Rn(e), i = In.get(r);
	if (!t.force && i && i.expiresAt > Date.now()) return i.plugin;
	let [a, o] = zn(r), s = await Bn(n, `https://api.github.com/repos/${a}/${o}/releases/latest`, jn, "application/vnd.github+json"), c = Ln(JSON.parse(s), "GitHub Release"), l = typeof c.tag_name == "string" ? c.tag_name : "", u = Fn.exec(l);
	if (!u) throw Error("最新 GitHub Release 标签必须使用 vX.Y.Z");
	if (c.draft === !0 || c.prerelease === !0) throw Error("不能安装草稿或预发布版本");
	let d = `https://raw.githubusercontent.com/${a}/${o}/${l}`, f = await Bn(n, `${d}/manifest.json`, Mn), p = await Bn(n, `${d}/${T(f).entry}`, Nn), m = w(f, p);
	if (!m.repository || m.repository !== r) throw Error("Manifest repository 与 GitHub 仓库不一致");
	if (m.version !== u[1]) throw Error(`Manifest 版本 ${m.version} 与 Release 标签 ${l} 不一致`);
	let h = m.ui ? await Bn(n, `${d}/${m.ui.entry}`, 2 * 1024 * 1024) : void 0, g = await Promise.all((m.resources ?? []).map(async (e) => ({
		id: e.id,
		bytes: Array.from(await Vn(n, `${d}/${e.path}`, e.bytes))
	}))), _ = {
		repository: r,
		releaseTag: l,
		releaseUrl: typeof c.html_url == "string" ? c.html_url : `${r}/releases/tag/${l}`,
		publishedAt: typeof c.published_at == "string" ? c.published_at : void 0,
		manifest: m,
		manifestText: f,
		source: p,
		uiSource: h,
		resourcePayloads: g
	};
	return In.set(r, {
		expiresAt: Date.now() + On,
		plugin: _
	}), _;
}
async function Kn(e) {
	let t;
	try {
		return Hn(await Bn(e, En, An));
	} catch (e) {
		t = e;
	}
	try {
		return Hn(await Bn(e, Dn, An));
	} catch {
		throw t;
	}
}
async function qn(e = [], t = {}) {
	let n = t.fetcher ?? fetch, r = await Kn(n), i = new Map(r.map((e) => [e.repository, e.featured]));
	for (let t of e) {
		let e = Rn(t);
		i.has(e) || i.set(e, !1);
	}
	return (await Promise.all(Array.from(i, async ([e, r]) => {
		try {
			return {
				...await Gn(e, {
					fetcher: n,
					force: t.force
				}),
				status: "ready",
				featured: r
			};
		} catch (t) {
			return {
				status: "error",
				repository: e,
				featured: r,
				error: t instanceof Error ? t.message : "无法读取插件仓库"
			};
		}
	}))).sort((e, t) => Number(t.featured) - Number(e.featured));
}
//#endregion
//#region src/components/settings/PluginSettings.tsx
var Jn = {
	content: "内容处理",
	media: "媒体处理",
	workflow: "工作流",
	utility: "通用工具"
};
function Yn(e, t) {
	try {
		return Wn(e, t) > 0;
	} catch {
		return e !== t;
	}
}
var Xn = JSON.stringify({
	apiVersion: 1,
	id: "com.ai-canvas.example-uppercase",
	name: "文本大写示例",
	version: "1.0.0",
	author: "AI Canvas",
	description: "演示如何读取文本节点输出并写回结构化结果",
	category: "content",
	keywords: ["文本", "示例"],
	entry: "main.js",
	permissions: [
		"node.read",
		"node.write",
		"models.read",
		"models.invoke"
	],
	contributes: {
		nodeTools: [{
			id: "uppercase-output",
			title: "输出转大写",
			description: "把当前节点的 output 转为大写",
			placements: ["node-context-menu", "node-toolbar"],
			icon: "lucide:case-upper",
			dialog: {
				title: "输出转大写",
				description: "可选填写前缀；确认后插件会处理当前节点输出。",
				submitLabel: "转换",
				fields: [{
					id: "prefix",
					label: "结果前缀",
					type: "text",
					placeholder: "例如：标题："
				}]
			},
			nodeTypes: ["ai-text", "source-text"],
			inputFields: ["output"],
			output: {
				mode: "update-current",
				fields: ["output"]
			}
		}],
		nodes: [{
			id: "prompt-writer",
			title: "提示词写作节点",
			description: "选择已配置模型生成文本，可连接其他文本节点作为上下文。",
			icon: "lucide:sparkles",
			inputs: [{
				id: "context",
				label: "上下文",
				type: "text",
				multiple: !0
			}],
			outputs: [{
				id: "result",
				label: "文本结果",
				type: "text"
			}],
			fields: [{
				id: "prompt",
				label: "提示词",
				type: "textarea",
				required: !0
			}, {
				id: "model",
				label: "模型",
				type: "model",
				modelCategories: ["text"],
				required: !0
			}]
		}]
	}
}, null, 2), Zn = "definePlugin({\n  tools: {\n    \"uppercase-output\": (input) => ({\n      data: {\n        output: String(input.parameters.prefix || \"\") + String(input.node.data.output || \"\").toUpperCase()\n      },\n      message: \"已将节点输出转换为大写\"\n    }),\n    \"prompt-writer\": (input) => {\n      if (!input.effectResult) {\n        return {\n          effect: {\n            type: \"model.generate\",\n            modelId: String(input.node.values.model || \"\"),\n            prompt: [String(input.node.values.prompt || \"\"), ...(input.inputs.context || [])].join(\"\\n\")\n          }\n        };\n      }\n      if (!input.effectResult.ok) throw new Error(input.effectResult.error || \"模型调用失败\");\n      return {\n        data: { outputs: { result: String(input.effectResult.value.text || \"\") } },\n        message: \"文本生成完成\"\n      };\n    }\n  }\n});", Qn = JSON.stringify({
	apiVersion: 1,
	runtime: "python",
	id: "com.ai-canvas.example-python-uppercase",
	name: "Python 文本大写示例",
	version: "1.0.0",
	author: "AI Canvas",
	description: "演示可信 Python 插件读取文本节点并返回结构化结果",
	category: "content",
	keywords: [
		"Python",
		"文本",
		"示例"
	],
	entry: "main.py",
	permissions: ["node.read", "node.write"],
	contributes: { nodeTools: [{
		id: "python-uppercase-output",
		title: "Python 输出转大写",
		placements: ["node-context-menu"],
		nodeTypes: ["ai-text", "source-text"],
		inputFields: ["output"],
		output: {
			mode: "update-current",
			fields: ["output"]
		}
	}] }
}, null, 2), $n = "def uppercase_output(input_value):\n    output = str(input_value[\"node\"][\"data\"].get(\"output\", \"\"))\n    return {\n        \"data\": {\"output\": output.upper()},\n        \"message\": \"已使用本机 Python 转换输出\",\n    }\n\ndefine_plugin({\"tools\": {\"python-uppercase-output\": uppercase_output}})\n", er = "AI-Canvas-插件开发规范.md", tr = 256, nr = {
	"node.read": "读取声明的画布节点字段",
	"node.write": "修改节点或创建插件节点",
	"models.read": "读取脱敏模型目录",
	"models.invoke": "调用可能产生费用的模型",
	"files.connected.read": "读取当前节点及直接输入连线的项目资源",
	"files.output.create": "在当前项目目录创建新的文本输出",
	"plugin.resources.read": "读取当前插件 revision 声明的包资源",
	"ui.custom": "在主窗口隔离弹窗中运行自定义界面代码（可能影响界面响应）"
};
function rr(e) {
	return e.permissions.map((e) => nr[e] ?? e).join("；");
}
async function ir(e) {
	let t = await globalThis.crypto.subtle.digest("SHA-256", new TextEncoder().encode(e));
	return Array.from(new Uint8Array(t), (e) => e.toString(16).padStart(2, "0")).join("");
}
async function ar(e, t, n, r) {
	let i = await ir(t);
	return e.runtime === "python" ? await U(`${n}可信 Python 插件「${e.name}」？\n\n来源：${r}\n代码 SHA-256：${i}\n宿主代办权限：${rr(e) || "无"}\n\nPython 插件会以你的当前系统权限运行，可以读取或修改本机文件、访问网络和环境变量，也可以启动其他程序。

只对你信任并已审查源码的插件继续。下一步 Rust 原生确认必须显示相同的完整摘要。`, { title: `${n}可信 Python 插件` }) ? i : null : i;
}
async function or(e, t) {
	return e.runtime === "python" ? U(`启用可信 Python 插件「${e.name}」？\n\n已登记代码 SHA-256：${t ?? "旧记录待原生迁移"}\n宿主代办权限：${rr(e) || "无"}\n\n启用后插件会以你的当前系统权限运行，可以读取或修改本机文件、访问网络和环境变量，也可以启动其他程序。

继续后还必须通过 Rust 原生确认，且完整摘要应与这里一致。`, { title: "启用可信 Python 插件" }) : !0;
}
function sr(e) {
	return e.isFile;
}
function cr(e) {
	return e.isDirectory;
}
async function lr(e) {
	let t = e.createReader(), n = [];
	for (;;) {
		let e = await new Promise((e, n) => {
			t.readEntries(e, n);
		});
		if (e.length === 0) return n;
		if (n.push(...e), n.length > tr) throw Error("插件文件夹包含的文件过多");
	}
}
async function ur(e, t, n) {
	if (n.length >= tr) throw Error("插件文件夹包含的文件过多");
	let r = `${t}${e.name}`;
	if (sr(e)) {
		let t = await new Promise((t, n) => e.file(t, n));
		n.push({
			file: t,
			path: r
		});
		return;
	}
	if (!cr(e)) return;
	let i = await lr(e);
	for (let e of i) await ur(e, `${r}/`, n);
}
async function dr(e) {
	let t = Array.from(e.items).map((e) => e.webkitGetAsEntry?.()).filter((e) => !!e);
	if (t.length === 0) return Array.from(e.files).map((e) => ({
		file: e,
		path: e.name
	}));
	let n = [];
	for (let e of t) await ur(e, "", n);
	return n;
}
function fr(e) {
	return e.replace(/\\/g, "/");
}
async function pr(e, t, n) {
	if (!n.ui) return;
	let r = `${t}${n.ui.entry}`, i = e.find(({ path: e }) => e === r);
	if (!i) throw Error(`插件声明了自定义界面，但同级目录缺少 ${n.ui.entry}`);
	return i.file.text();
}
async function mr(e, t, n) {
	return Promise.all((n.resources ?? []).map(async (n) => {
		let r = `${t}${n.path}`, i = e.find(({ path: e }) => e === r);
		if (!i) throw Error(`插件包缺少资源 ${n.path}`);
		if (i.file.size !== n.bytes) throw Error(`插件包资源 ${n.path} 字节数不匹配`);
		return {
			id: n.id,
			bytes: Array.from(new Uint8Array(await i.file.arrayBuffer()))
		};
	}));
}
async function hr(e, t, n) {
	if (!(await e.stat(t)).isDirectory) {
		n.push(t);
		return;
	}
	for (let r of await e.readDir(t)) {
		if (n.length >= tr) throw Error("插件文件夹包含的文件过多");
		await hr(e, `${t.replace(/[\\/]+$/, "")}/${r.name}`, n);
	}
}
function gr() {
	let e = (0, Q.useRef)(null), t = C((e) => e.installedPlugins), n = C((e) => e.installPluginBundle), r = C((e) => e.setPluginEnabled), i = C((e) => e.deletePlugin), a = C((e) => e.showToast), [o, s] = (0, Q.useState)(!1), [c, l] = (0, Q.useState)(!1), [u, d] = (0, Q.useState)(!1), [f, p] = (0, Q.useState)([]), [m, h] = (0, Q.useState)(!0), [g, _] = (0, Q.useState)(""), [v, y] = (0, Q.useState)(""), [b, S] = (0, Q.useState)(""), [w, E] = (0, Q.useState)(""), [D, O] = (0, Q.useState)(null), [k, A] = (0, Q.useState)(!1), j = (0, Q.useMemo)(() => t.flatMap((e) => e.manifest.repository ? [e.manifest.repository] : []), [t]), M = (0, Q.useCallback)(async (e = !1) => {
		h(!0), _("");
		try {
			p(await qn(j, { force: e }));
		} catch (e) {
			_(e instanceof Error ? e.message : "插件市场加载失败");
		} finally {
			h(!1);
		}
	}, [j]), N = (0, Q.useCallback)(async () => {
		if (!P()) {
			O({
				available: !1,
				error: "请在 Tauri 桌面版中检测本机 Python"
			});
			return;
		}
		A(!0);
		try {
			O(await oe());
		} catch (e) {
			O({
				available: !1,
				error: e instanceof Error ? e.message : "Python 环境检测失败"
			});
		} finally {
			A(!1);
		}
	}, []);
	(0, Q.useEffect)(() => {
		let e = window.setTimeout(() => void M(), 0);
		return () => window.clearTimeout(e);
	}, [M]), (0, Q.useEffect)(() => {
		let e = window.setTimeout(() => void N(), 0);
		return () => window.clearTimeout(e);
	}, [N]);
	let F = (0, Q.useMemo)(() => {
		let e = v.trim().toLocaleLowerCase();
		return e ? f.filter((t) => t.status === "error" ? t.repository.toLocaleLowerCase().includes(e) : [
			t.manifest.name,
			t.manifest.description,
			t.manifest.author,
			t.repository,
			...t.manifest.keywords ?? []
		].some((t) => t?.toLocaleLowerCase().includes(e))) : f;
	}, [f, v]), I = async (e, r) => {
		if (!(!e.trim() || w)) {
			E(e);
			try {
				let i = r?.status === "ready" ? r : await Gn(e, { force: !0 }), a = t.some((e) => e.id === i.manifest.id) ? "更新" : "安装", o = await ar(i.manifest, i.source, a, i.repository);
				if (!o) return;
				await n(i.manifestText, i.source, {
					trustedPythonConfirmed: i.manifest.runtime === "python",
					expectedSourceDigest: o,
					uiSource: i.uiSource,
					resourcePayloads: i.resourcePayloads
				}), S(""), await M(!0);
			} catch (e) {
				a(e instanceof Error ? e.message : "GitHub 插件安装失败", "error");
			} finally {
				E("");
			}
		}
	}, L = async () => {
		try {
			if (P()) {
				await B(new TextEncoder().encode("# AI Canvas 插件开发规范\n\n> 适用宿主版本：AI Canvas `0.9.2`；Plugin API v1<br>\n> 最后更新：2026-09-03；插件入口：设置 → 插件 → 导入插件文件夹 / 插件市场\n\n本文档说明如何为 AI Canvas 编写用户插件。当前只有一套 Plugin API v1：节点工具、自定义节点、宿主管理的模型调用、节点/连线/包资源句柄、主窗口隔离弹窗，以及由用户明确授权的可信 Python 运行时都属于同一份首版契约，不存在旧版本兼容分支。\n\n## 1. 当前能力范围\n\nPlugin API v1 支持：\n\n- 在节点右键菜单中注册一个或多个工具；\n- 在文本、图片、视频、音频和全景节点的上方工具栏中注册按钮；\n- 由宿主根据 Manifest 渲染统一操作弹窗，或在同一主窗口 Modal 内挂载隔离的插件 UI；\n- 指定每个工具适用的节点类型；\n- 读取 Manifest 中声明的节点顶层字段；\n- 返回 JSON 数据更新当前节点；\n- 返回 JSON 数据创建派生节点；\n- 在独立 QuickJS 沙箱中执行同步 JavaScript。\n- 通过本机 Python 3 和当前环境已安装的包执行可信 `main.py` 插件；\n- 通过 `contributes.nodes` 注册带字段和输入输出端口的自定义节点；\n- 向自定义节点与节点工具提供当前可调用模型的安全目录，并由宿主代为调用模型；\n- 在操作弹窗中提供模型下拉，并通过 `model.generate` 把参考图与提示词一起交给多模态模型；\n- 通过调用级不透明 `resourceId` 读取当前节点文件、直接输入连线文件和 Manifest 声明的包资源；\n- 通过宿主在项目目录创建新的文本输出，不向插件暴露真实路径；\n- 从符合发布规范的 GitHub Release 安装插件，并检查稳定版更新。\n\nJavaScript 沙箱当前暂不支持：\n\n- 自定义设置面板或任意挂入宿主 DOM 的 HTML/React；\n- 任意网络请求、任意路径文件访问、目录遍历、删除、系统命令或 Tauri API；\n- `import`、`require`、第三方 npm 包或多个 JavaScript 文件；\n- Promise、`async` 工具或后台任务；\n- 获取真实本地路径、跨项目文件、非直接连线文件或修改受保护的资产字段；\n- 构造新的远程媒体 URL 交给宿主加载；远程媒体只能从真实媒体输入或本轮宿主媒体模型结果中原样传递。\n\n## 2. 插件目录结构\n\n每个插件是一个独立文件夹。JavaScript 与 Python 插件分别使用以下结构：\n\n```text\nmy-plugin/\n├── manifest.json\n├── main.js\n├── ui.js                    # 仅声明 manifest.ui 时需要\n└── resources/               # 仅放 manifest.resources 声明的包资源\n    └── template.txt\n\nmy-python-plugin/\n├── manifest.json\n└── main.py\n```\n\n- 文件名区分大小写；\n- `manifest.json` 和入口文件必须位于同一级目录；\n- 文件夹中必须且只能有一个 `manifest.json`；\n- JavaScript 入口固定为 `main.js`；可信 Python 插件固定为 `main.py`；\n- `ui.entry` 和 `resources[].path` 必须是插件目录内的安全相对路径并通过字节数与 SHA-256 校验；\n- 未在 Manifest 中声明的其他文件不会被插件运行时加载。\n\n## 3. 最小可运行示例\n\n下面的插件会为文本节点增加“输出转大写”右键工具和工具栏按钮。由于工具声明了 `dialog`，两个入口都会在主窗口中打开同一个操作弹窗。\n\n### manifest.json\n\n```json\n{\n  \"apiVersion\": 1,\n  \"id\": \"com.example.uppercase\",\n  \"name\": \"文本大写工具\",\n  \"version\": \"1.0.0\",\n  \"author\": \"Your Name\",\n  \"description\": \"把文本节点的输出内容转换为大写\",\n  \"category\": \"content\",\n  \"keywords\": [\"文本\", \"格式化\"],\n  \"entry\": \"main.js\",\n  \"permissions\": [\"node.read\", \"node.write\"],\n  \"contributes\": {\n    \"nodeTools\": [\n      {\n        \"id\": \"uppercase-output\",\n        \"title\": \"输出转大写\",\n        \"description\": \"把当前节点的 output 转换为大写\",\n        \"placements\": [\"node-context-menu\", \"node-toolbar\"],\n        \"icon\": \"lucide:case-upper\",\n        \"dialog\": {\n          \"title\": \"输出转大写\",\n          \"description\": \"可选填写前缀；确认后插件会处理当前节点输出。\",\n          \"submitLabel\": \"转换\",\n          \"fields\": [\n            {\n              \"id\": \"prefix\",\n              \"label\": \"结果前缀\",\n              \"type\": \"text\",\n              \"placeholder\": \"例如：标题：\"\n            }\n          ]\n        },\n        \"nodeTypes\": [\"ai-text\", \"source-text\"],\n        \"inputFields\": [\"output\"],\n        \"output\": {\n          \"mode\": \"update-current\",\n          \"fields\": [\"output\"]\n        }\n      }\n    ]\n  }\n}\n```\n\n### main.js\n\n```javascript\ndefinePlugin({\n  tools: {\n    \"uppercase-output\": (input) => ({\n      data: {\n        output: String(input.parameters.prefix || \"\")\n          + String(input.node.data.output || \"\").toUpperCase()\n      },\n      message: \"已将节点输出转换为大写\"\n    })\n  }\n});\n```\n\n安装后，在画布中选择 `ai-text` 或 `source-text` 节点，节点上方工具栏会显示插件图标；右键菜单中也会出现“输出转大写”。\n\n## 4. Manifest 顶层字段\n\n| 字段 | 类型 | 必填 | 规则 |\n|---|---|---:|---|\n| `apiVersion` | number | 是 | 固定为 `1` |\n| `runtime` | string | 否 | `javascript`（默认）或 `python` |\n| `id` | string | 是 | 插件唯一 ID，建议使用反向域名；仅允许小写字母、数字、点、下划线和短横线，最长 128 字符 |\n| `name` | string | 是 | 用户可见名称，最长 80 字符 |\n| `version` | string | 是 | 插件版本，最长 32 字符；建议使用语义化版本，如 `1.2.0` |\n| `author` | string | 否 | 作者名称，最长 80 字符 |\n| `description` | string | 否 | 插件用途说明，最长 240 字符 |\n| `repository` | string | GitHub 发布必填 | GitHub HTTPS 仓库地址，格式为 `https://github.com/作者/仓库` |\n| `homepage` | string | 否 | 插件主页，必须使用 HTTPS |\n| `license` | string | 否 | 开源许可证标识，如 `MIT`、`Apache-2.0` |\n| `category` | string | 是 | 插件分类，见下表 |\n| `keywords` | string[] | 否 | 1–12 个关键词，每项最长 128 字符 |\n| `entry` | string | 是 | JavaScript 固定为 `main.js`；Python 固定为 `main.py` |\n| `permissions` | string[] | 是 | 插件权限，见权限章节 |\n| `contributes.nodeTools` | object[] | 条件必填 | 插件贡献的节点工具，最多 64 个 |\n| `resources` | object[] | 否 | 当前 revision 随包安装的不可变资源，最多 64 项、合计 64 MiB |\n| `ui` | object | 否 | 自定义 UI bundle、SHA-256 与导出映射；使用时必须声明 `ui.custom` |\n| `contributes.nodes` | object[] | 条件必填 | 自定义节点，最多 32 个；两类贡献至少填写一种 |\n\n### category 可选值\n\n| 值 | 含义 |\n|---|---|\n| `content` | 文本、提示词、结构化内容处理 |\n| `media` | 图片、视频、音频相关的元数据处理 |\n| `workflow` | 工作流内容或参数处理 |\n| `utility` | 不属于以上分类的通用工具 |\n\n分类用于向用户说明插件用途，不会自动授予额外权限。\n\n## 5. 节点工具声明\n\n`contributes.nodeTools` 中的每一项表示一个节点工具。同一个工具可以同时出现在右键菜单和节点工具栏。\n\n| 字段 | 类型 | 必填 | 规则 |\n|---|---|---:|---|\n| `id` | string | 是 | 工具在当前插件内的唯一 ID，最长 64 字符；仅允许小写字母、数字、点、下划线和短横线 |\n| `title` | string | 是 | 菜单、工具提示和弹窗中的工具名称，最长 80 字符 |\n| `description` | string | 否 | 工具用途说明，最长 240 字符 |\n| `placements` | string[] | 是 | 可填写 `node-context-menu`、`node-toolbar`，也可同时填写两者 |\n| `icon` | string | 工具栏入口必填 | Iconify 图标名，例如 `lucide:wand-sparkles`；不接受 URL、SVG 或 HTML |\n| `dialog` | object | 工具栏入口必填 | 点击后由宿主渲染声明式表单，或在主窗口 Modal 中挂载隔离自定义 UI |\n| `nodeTypes` | string[] | 是 | 工具适用的节点类型 |\n| `inputFields` | string[] | 是 | 允许传给插件的节点数据顶层字段，数量为 1–64 个 |\n| `output` | object | 是 | 工具的写入方式和允许输出的字段 |\n\nManifest 中的工具 ID 必须与 `main.js` 的 `tools` 键完全一致。\n\n### placements 与交互方式\n\n| 值 | 出现位置 | 点击行为 |\n|---|---|---|\n| `node-context-menu` | 节点右键菜单 | 声明 `dialog` 时打开同一个主窗口弹窗；未声明时立即执行，`input.parameters` 为空对象 |\n| `node-toolbar` | 匹配节点的上方工具栏 | 打开 Manifest 声明的宿主弹窗，用户确认后执行 |\n\n同一工具从工具栏或右键菜单触发时复用同一个弹窗。只要声明了 `dialog`，即使没有必填字段也会打开它；完全不需要 UI 的一键工具可以省略 `dialog`，插件需自行处理空的 `input.parameters`。\n\n工具栏按钮会自动追加到现有节点工具栏，不进入用户的内置工具栏排序配置。按钮提示格式为“工具标题 · 插件名称”。目前实际提供上方工具栏的节点族包括文本、图片、视频、音频和全景；对应的源节点复用同一工具栏，但仍按 `nodeTypes` 精确匹配。\n\n### icon 规则\n\n工具栏入口必须提供 `icon`。它必须是 Iconify 的 `集合:图标名` 格式，只能使用小写字母、数字和短横线，例如：\n\n```json\n\"icon\": \"lucide:wand-sparkles\"\n```\n\n插件不能传入远程图标 URL、SVG 字符串、HTML 或本地文件路径。\n\n### dialog 规则\n\n`node-toolbar` 工具必须声明 `dialog`：\n\n```json\n\"dialog\": {\n  \"title\": \"整理文本\",\n  \"description\": \"选择处理方式并填写附加说明。\",\n  \"submitLabel\": \"开始处理\",\n  \"fields\": [\n    {\n      \"id\": \"instruction\",\n      \"label\": \"附加说明\",\n      \"type\": \"textarea\",\n      \"placeholder\": \"请输入要求\",\n      \"required\": true\n    },\n    {\n      \"id\": \"tone\",\n      \"label\": \"语气\",\n      \"type\": \"select\",\n      \"defaultValue\": \"brief\",\n      \"options\": [\n        { \"label\": \"简洁\", \"value\": \"brief\" },\n        { \"label\": \"详细\", \"value\": \"detailed\" }\n      ]\n    }\n  ]\n}\n```\n\n`dialog` 支持以下字段：\n\n| 字段 | 类型 | 必填 | 规则 |\n|---|---|---:|---|\n| `title` | string | 否 | 弹窗标题，缺省使用工具 `title` |\n| `description` | string | 否 | 弹窗说明，缺省使用工具 `description` |\n| `submitLabel` | string | 否 | 确认按钮文字，缺省为“执行” |\n| `fields` | object[] | 是 | 0–16 个表单字段；空数组表示仅确认后执行 |\n\n表单字段支持 `text`、`textarea`、`number`、`select` 和 `boolean`。每项可声明 `id`、`label`、`type`、`description`、`placeholder`、`required` 与 `defaultValue`；`select` 还必须声明 1–32 个 `{ \"label\", \"value\" }` 选项。字段 `id` 在当前弹窗中必须唯一，只能使用字母开头的字母、数字和下划线组合。\n\nAPI v1 还支持 `model` 类型，用于让用户在弹窗里选择模型：\n\n| 类型 | 说明 | 额外字段 |\n|---|---|---|\n| `model` | 渲染当前已配置且可调用的模型下拉。插件只拿到用户选择的模型 ID，拿不到 API Key、接口地址或任何厂商凭据 | 可选 `modelCategories`：`text`、`image`、`video`、`audio` 的数组，缺省表示不限分类 |\n\n```json\n{\n  \"id\": \"model\",\n  \"label\": \"分析模型\",\n  \"type\": \"model\",\n  \"modelCategories\": [\"text\"],\n  \"required\": true\n}\n```\n\n`model` 字段要求插件声明 `models.read`；`modelCategories` 只能用在 `model` 字段上。模型下拉只列出已配置凭据的模型，未配置的厂商不会出现。\n\n### 支持的 nodeTypes\n\n| 节点类型 | 用途 |\n|---|---|\n| `ai-text` | AI 文本节点 |\n| `ai-image` | AI 图片节点 |\n| `ai-video` | AI 视频节点 |\n| `ai-audio` | AI 音频节点 |\n| `ai-animation` | AI 动画节点 |\n| `ai-panorama` | AI 全景节点 |\n| `ai-markdown` | Markdown 节点 |\n| `ai-storyboard` | 宫格分镜节点 |\n| `ai-shotlist` | 分镜表节点 |\n| `ai-director` | 导演台节点 |\n| `source-image` | 图片源节点 |\n| `source-video` | 视频源节点 |\n| `source-audio` | 音频源节点 |\n| `source-text` | 文本源节点 |\n| `canvas-note` | 画布笔记 |\n| `comment` | 评论节点 |\n\n一个工具可以同时声明多个节点类型：\n\n```json\n\"nodeTypes\": [\"ai-text\", \"source-text\", \"ai-markdown\"]\n```\n\n## 6. 输入数据\n\n工具函数接收一个 `input` 对象：\n\n```typescript\ninterface PluginInput {\n  projectId: string;\n  iteration: number;\n  parameters: Record<string, JsonValue>;\n  node: {\n    id: string;\n    type: string;\n    data: Record<string, JsonValue>;\n  };\n  models: PluginModelSummary[];\n  effectResult?: PluginNodeHostEffectResult;\n}\n```\n\n`input.parameters` 来自宿主弹窗。工具栏按钮总会先打开弹窗；右键菜单是直接执行入口，通常该值为 `{}`，但工具声明了必填字段时宿主会先打开弹窗（见第 5 节）。插件应为可选参数提供缺省处理：\n\n```javascript\nconst prefix = String(input.parameters.prefix || \"\");\nconst confirmed = input.parameters.confirmed === true;\n```\n\n另外三个字段与宿主 effect 相关，详见「宿主 effect」：\n\n| 字段 | 含义 |\n|---|---|\n| `iteration` | 当前是第几轮调用，首次为 `0`；每完成一次宿主 effect 加一 |\n| `models` | 当前可调用模型目录，每项包含 `id`、`name`、`provider`、`category` 与 `inputModalities`，不含任何凭据；未声明 `models.read` 时为空数组 |\n| `effectResult` | 上一轮宿主 effect 的结果，`{ type, ok, value?, error? }`；首次调用时不存在 |\n\n```javascript\nconst models = input.models.filter((model) => model.category === \"text\");\nif (input.effectResult && !input.effectResult.ok) {\n  return { data: { output: `调用失败：${input.effectResult.error}` } };\n}\n```\n\n其中 `input.node.data` 只包含当前工具在 `inputFields` 中声明、并且可以安全转换为 JSON 的字段。例如：\n\n```json\n\"inputFields\": [\"label\", \"prompt\", \"output\"]\n```\n\n对应的插件代码：\n\n```javascript\nconst label = input.node.data.label;\nconst prompt = input.node.data.prompt;\nconst output = input.node.data.output;\n```\n\n常用节点字段包括：\n\n| 字段 | 常见类型 | 含义 |\n|---|---|---|\n| `label` | string | 节点名称 |\n| `prompt` | string | 提示词 |\n| `output` | string | 文本结果或媒体 URL |\n| `status` | string | `idle`、`loading`、`success` 或 `error` |\n| `model` | string | 当前模型 ID |\n| `provider` | string | 当前供应商 ID |\n| `workflowId` | string | 当前工作流 ID |\n| `workflowInputs` | object | 工作流输入映射 |\n| `imageUrl` | string | 图片展示 URL |\n| `videoUrl` | string | 视频展示 URL |\n| `audioUrl` | string | 音频展示 URL |\n| `thumbnailUrl` | string | 缩略图 URL |\n| `style` | string | 画风 ID |\n| `aspectRatio` | string | 宽高比 |\n| `imageWidth` / `imageHeight` | number | 图片尺寸 |\n| `videoWidth` / `videoHeight` | number | 视频尺寸 |\n| `note` | object | 画布笔记数据 |\n\n不同节点不一定拥有所有字段。插件必须处理字段不存在或值为空的情况。\n\n以下本地敏感字段禁止出现在 `inputFields` 中：\n\n- `filePath`\n- `relativePath`\n- `directorCaptureFilePaths`\n- `__proto__`\n- `constructor`\n- `prototype`\n\n## 7. main.js 注册规则\n\n入口文件必须且只能调用一次全局函数 `definePlugin`：\n\n```javascript\ndefinePlugin({\n  tools: {\n    \"tool-id\": (input) => {\n      return {\n        data: {\n          output: \"插件处理结果\"\n        },\n        message: \"可选的完成提示\"\n      };\n    }\n  }\n});\n```\n\n规则如下：\n\n- `tools` 的键是 Manifest 中声明的工具 ID；\n- 每个工具值必须是同步函数；\n- 工具必须返回可 JSON 序列化的普通对象；\n- 返回对象必须包含非空的 `data` 对象，或包含一个 `effect` 请求宿主代执行模型/资源能力；\n- `message` 可选，用于执行完成后的短提示，最长保留 240 字符；\n- 不要修改 `input`，应根据输入创建并返回新数据；\n- 不要返回函数、Symbol、循环引用、`undefined`、Promise 或其他不可 JSON 序列化的值。\n\n返回 `effect` 的多阶段写法见第 9 节「宿主 effect」；节点工具与自定义节点都可以使用，两者只是取模型 ID 的位置不同。\n\nPlugin API 的 JSON 值范围为：\n\n```typescript\ntype JsonValue =\n  | null\n  | boolean\n  | number\n  | string\n  | JsonValue[]\n  | { [key: string]: JsonValue };\n```\n\n### 7.1 main.py 注册规则\n\n可信 Python 插件同样使用 API v1，并显式声明运行时：\n\n```json\n{\n  \"apiVersion\": 1,\n  \"runtime\": \"python\",\n  \"entry\": \"main.py\"\n}\n```\n\n`main.py` 必须调用一次 `define_plugin`，工具函数接收与 JavaScript 相同的 JSON 输入并返回可 JSON 序列化的字典：\n\n```python\ndef uppercase(input_value):\n    output = str(input_value[\"node\"][\"data\"].get(\"output\", \"\"))\n    return {\n        \"data\": {\"output\": output.upper()},\n        \"message\": \"已转换输出\",\n    }\n\ndefine_plugin({\"tools\": {\"uppercase-output\": uppercase}})\n```\n\n宿主按顺序探测 macOS/Linux 的 `python3`、`python`，以及 Windows 的 `python`、`py -3`、`python3`。解释器必须是 Python 3。插件直接使用该环境的标准库和 site-packages；AI Canvas 不下载 Python、不创建虚拟环境，也不读取或自动执行 `requirements.txt`。\n\nPython 工具同样必须同步返回 JSON 数据；不接受 coroutine。每次调用使用一个独立子进程，默认最长运行 30 秒。源码通过标准输入传递，不拼接到 Shell 命令中。\n\n> **安全警告：** Python 插件不是沙箱。它以当前用户身份运行，可以绕过 Manifest 权限自行访问本机文件、网络和环境变量，也可以启动其他程序。Manifest 权限只约束 AI Canvas 代办的模型、资源和画布能力。只安装并启用你信任且已审查源码的 Python 插件。\n\n## 8. 输出规则\n\n### 更新当前节点\n\n使用 `update-current` 将结果合并到当前节点：\n\n```json\n\"output\": {\n  \"mode\": \"update-current\",\n  \"fields\": [\"label\", \"output\"]\n}\n```\n\n```javascript\ndefinePlugin({\n  tools: {\n    \"format-output\": (input) => ({\n      data: {\n        label: `${input.node.data.label}（已处理）`,\n        output: String(input.node.data.output || \"\").trim()\n      }\n    })\n  }\n});\n```\n\n### 创建派生节点\n\n使用 `create-node` 在源节点右侧创建新节点：\n\n```json\n\"output\": {\n  \"mode\": \"create-node\",\n  \"nodeType\": \"source-text\",\n  \"fields\": [\"label\", \"output\"]\n}\n```\n\n```javascript\ndefinePlugin({\n  tools: {\n    \"create-summary\": (input) => ({\n      data: {\n        label: \"内容摘要\",\n        output: String(input.node.data.output || \"\").slice(0, 120)\n      },\n      message: \"已创建摘要节点\"\n    })\n  }\n});\n```\n\n`nodeType` 仅对 `create-node` 有效；省略时沿用源节点类型。未返回 `label` 时，宿主会根据源节点和工具名称生成新节点名称。\n\n插件只能返回 `output.fields` 中预先声明的字段。如果返回未声明字段，整次执行会失败，不会进行部分写入。\n\nJavaScript 节点工具返回 `imageUrl`、`thumbnailUrl`、`videoUrl`、`audioUrl`、`sourceUrl` 或其他宿主媒体载体时，远程地址必须与本次输入中的真实媒体引用完全一致。插件不能拼接、改写查询参数或从普通文本、JSON、文件正文、弹窗参数中构造新的 `http/https` 媒体地址。插件同样不能猜测或自行返回 `asset:`、`file:`、`blob:` 等本地引用；只有宿主在本轮模型结果中发出的精确本地引用可以原样回传。普通文本节点的 `output` 仍可包含网页链接；只有会被宿主作为媒体加载的字段受此限制。\n\n`ai-markdown` 的 `output` 需要额外遵守同一规则：普通 Markdown 链接可以正常输出，但 `![说明](URL)` 图片会被宿主加载，因此其中的远程 URL 必须来自该 Markdown 节点原有的图片引用或其他受信媒体来源。\n\n以下字段属于宿主身份、本地资产或内部关联信息，禁止写入：\n\n- `type`\n- `displayId`\n- `filePath`\n- `relativePath`\n- `assetId`\n- `artifactId`\n- `role`\n- `dramaAssetId`\n- `dramaAssetKind`\n- `characterLibraryLinks`\n- `hiddenByCharacterLibrary`\n- `directorInstanceId`\n- `directorCaptureFilePaths`\n- `__proto__`\n- `constructor`\n- `prototype`\n\n## 9. 自定义节点与资源端口\n\n自定义节点由宿主统一渲染。Manifest 决定节点字段和端口，`main.js` / `main.py` 中与节点 `id` 同名的 `tools` 函数负责编排数据及宿主能力。\n\n```json\n{\n  \"apiVersion\": 1,\n  \"permissions\": [\n    \"node.read\",\n    \"node.write\",\n    \"models.read\",\n    \"models.invoke\",\n    \"files.connected.read\",\n    \"files.output.create\",\n    \"plugin.resources.read\"\n  ],\n  \"resources\": [{\n    \"id\": \"system-prompt\",\n    \"path\": \"resources/system-prompt.txt\",\n    \"integrity\": \"sha256-<64位十六进制摘要>\",\n    \"mediaType\": \"text/plain\",\n    \"bytes\": 128\n  }],\n  \"contributes\": {\n    \"nodeTools\": [],\n    \"nodes\": [{\n      \"id\": \"writer\",\n      \"title\": \"写作节点\",\n      \"description\": \"读取直接连入的资料并调用文本模型\",\n      \"icon\": \"lucide:sparkles\",\n      \"inputs\": [{\n        \"id\": \"source\",\n        \"label\": \"资料\",\n        \"type\": \"resource\",\n        \"multiple\": true,\n        \"accept\": [\"text/*\", \"application/json\"],\n        \"maxBytes\": 1048576\n      }],\n      \"outputs\": [{ \"id\": \"result\", \"label\": \"结果\", \"type\": \"text\" }],\n      \"fields\": [\n        { \"id\": \"prompt\", \"label\": \"提示词\", \"type\": \"textarea\", \"required\": true },\n        { \"id\": \"model\", \"label\": \"模型\", \"type\": \"model\", \"modelCategories\": [\"text\"] }\n      ],\n      \"resourceAccess\": { \"self\": true, \"incoming\": true, \"portIds\": [\"source\"] }\n    }]\n  }\n}\n```\n\n### 节点字段\n\n`fields` 最多 16 项，支持 `text`、`textarea`、`number`、`select`、`boolean` 和 `model`。`modelCategories` 可包含 `text`、`image`、`video`、`audio`；模型下拉只显示当前已配置且可调用的模型。文件不再作为表单字段保存，统一通过 `resourceAccess` 和 `input.resources` 获得短期句柄。\n\n### 输入输出端口\n\n`inputs`、`outputs` 各最多 16 项，端口类型支持 `text`、`image`、`video`、`audio`、`json` 和 `resource`。输入端口可声明 `required` 和 `multiple`；媒体与 `resource` 端口还可声明 MIME `accept` 与单文件 `maxBytes`。插件最终只能返回 Manifest 已声明的字段和输出端口。\n\n插件节点之间的连线按来源 `plugin-out-<outputId>` 和目标 `plugin-in-<inputId>` 精确路由。目标 Handle 缺失或未知时不会回退到第一个输入端口。显式插件端口要求来源插件、节点和端口仍属于当前活动 revision，且来源与目标端口类型完全一致；例如 `image` 不能直接连接到 `text`。来源插件被卸载、节点被移除、端口被改名或连线被替换时会立即失效，不会回退到其它输出端口。\n\n### 文件资源授权\n\n`resourceAccess` 默认不授予任何文件：\n\n- `self: true`：当前目标节点自身引用的项目文件；\n- `incoming: true`：当前节点的一跳直接输入连线所引用的项目文件；\n- `portIds`：仅自定义节点可用，把入边授权进一步限制到指定输入端口，且必须与 `incoming: true` 同时声明；\n- `resources[]`：插件包内不可变资源，按 ID、相对路径、字节数和 SHA-256 随完整 revision 登记。\n\n项目文件要求位于当前项目目录中，路径及父目录均不得是符号链接。宿主只把以下结构放进 `input.resources`，不提供绝对路径或项目相对路径：\n\n```json\n{\n  \"self\": [],\n  \"incoming\": [{\n    \"resourceId\": \"plugin-resource-<opaque>\",\n    \"origin\": \"connection\",\n    \"displayName\": \"frame.png\",\n    \"mediaType\": \"image/png\",\n    \"size\": 123456,\n    \"access\": \"read\",\n    \"source\": { \"nodeId\": \"source-node\", \"edgeId\": \"edge-1\", \"portId\": \"source\" }\n  }],\n  \"inputs\": { \"source\": [{\n    \"resourceId\": \"plugin-resource-<opaque>\",\n    \"origin\": \"connection\",\n    \"displayName\": \"frame.png\",\n    \"mediaType\": \"image/png\",\n    \"size\": 123456,\n    \"access\": \"read\",\n    \"source\": { \"nodeId\": \"source-node\", \"edgeId\": \"edge-1\", \"portId\": \"source\" }\n  }] },\n  \"package\": []\n}\n```\n\n`resourceId` 只在本次调用或 UI 会话内有效，并绑定插件 ID、入口源码摘要、完整 revision 摘要、项目、节点、画布 revision、连线和端口。读取前宿主会重新检查这些条件以及文件大小、修改时间和普通文件身份；任一变化都会撤销授权。\n\n当前单个 `image`、`video` 或 `audio` 输出端口应返回一个媒体 URL 字符串。JavaScript 插件可以原样返回真实远程媒体输入、本轮宿主发出的模型结果，或受支持的安全内联媒体；自行构造的 `asset:`、`file:`、`blob:` 和不安全 `data:` 引用会被拒绝。需要把本地图片交给模型时，应使用 `model.generate.resourceIds`，由宿主解析句柄；插件不会看到本地 URL。\n\n### 宿主 effect\n\n插件 JavaScript 仍是同步函数。需要异步模型或资源能力时返回一个 `effect`；宿主完成后**再次调用同一个函数**，并在 `input.effectResult` 中给出结果。单次节点、工具或自定义 UI 会话最多执行 4 个 effect。\n\n自定义节点与**节点工具**都可以使用 effect。区别只在于模型 ID 从哪里来：自定义节点读 `input.node.values`，节点工具读弹窗传来的 `input.parameters`。\n\n```js\ndefinePlugin({\n  tools: {\n    \"analyze-frames\": (input) => {\n      // 第一轮：请求宿主调用模型\n      if (!input.effectResult) {\n        return {\n          effect: {\n            type: \"model.generate\",\n            modelId: input.parameters.model,\n            prompt: \"请逐帧分析这些画面的景别、运镜与光线。\",\n            resourceIds: input.resources.incoming\n              .filter((resource) => resource.mediaType.startsWith(\"image/\"))\n              .map((resource) => resource.resourceId)\n          }\n        };\n      }\n      // 第二轮：effectResult 已就绪\n      if (!input.effectResult.ok) {\n        return { data: { output: `模型调用失败：${input.effectResult.error}` } };\n      }\n      return {\n        data: { output: input.effectResult.value.text },\n        message: \"分析完成\"\n      };\n    }\n  }\n});\n```\n\n`input.iteration` 表示当前是第几轮（首次为 `0`），可用于区分更多阶段。不需要多阶段的工具直接返回 `data` 即可，宿主不会再发起第二次调用。\n\n支持的 effect：\n\n| `type` | 权限 | 输入 | 返回值 |\n|---|---|---|---|\n| `model.generate` | `models.invoke` | `modelId`、`prompt`、可选受信远程 `imageUrls`、本次会话的 `resourceIds` 与 `parameters` | 文本为 `{text}`；媒体为 `{url}` |\n| `resource.readText` | `files.connected.read` 或 `plugin.resources.read` | 本次授权的 `resourceId`、可选 `maxBytes` | `{resource, content}`，最多读取 256 KiB UTF-8 文本 |\n| `resource.readRange` | `files.connected.read` 或 `plugin.resources.read` | `resourceId`、`offset`、`length` | `{resource, offset, bytes, base64}`，单次最多 256 KiB |\n| `resource.createText` | `files.output.create` | `content`、可选 `suggestedName` | 在当前项目目录创建新文本，返回 `{fileName, bytes}`；不显示路径且不覆盖上游文件 |\n\n宿主操作失败时不会中断整个工具，而是以 `{ ok: false, error }` 的形式回到 `effectResult`，由插件决定降级还是报错；权限不足、模型不在目录、模型请求异常都走这条路径。\n\n模型目录通过 `input.models` 提供，只包含 ID、名称、分类、用途和输入模态，不包含 API Key、接口地址或厂商凭据；未声明 `models.read` 时该数组为空。模型实际请求始终由宿主现有生成服务执行。\n\n**随模型一起提交的参考图**：远程参考仍可从真实媒体输入原样传递；本地节点或直接连线文件使用本次 `input.resources` 中的 `resourceId`，放进 `model.generate.resourceIds`。宿主会确认资源属于当前调用且 MIME 为图片，再在插件不可见的边界内解析为模型输入。\n\n`imageUrls` 的来源规则：\n\n| 运行时 | 规则 |\n|---|---|\n| JavaScript | 每一项必须已经存在于本次 `inputFields` 声明的媒体引用中，或是本轮宿主模型产生的结果。自行拼接的远程地址会被拒绝，整次运行失败 |\n| Python | 不做来源限制——可信 Python 本身已具备当前用户的联网能力，该校验没有沙箱意义 |\n\n宿主只把成功的图片、视频或音频模型返回 URL 加入本次运行的受信媒体来源集合；文本模型结果和资源正文不会获得该资格。来源集合与资源句柄都不会跨节点、跨 invocation 或跨 UI 会话持久化。\n\n### 主窗口自定义弹窗\n\n节点工具可以用 `dialog.ui` 引用 `manifest.ui.exports` 的逻辑键，用插件自定义视图替换声明式表单。宿主仍使用自己的 `ModalOverlay`、标题栏、关闭行为和主题容器；插件 bundle 只运行在 Modal 内部的 `<iframe sandbox=\"allow-scripts\">`，不会打开额外系统窗口，也拿不到主窗口 DOM、Store、Tauri IPC 或网络能力。\n\nPlugin API v1 只允许节点工具使用自定义 UI。`contributes.nodes` 的节点主体始终由宿主根据 `fields`、`inputs` 与 `outputs` 渲染，不接受 `nodes[].ui`；这样可以保持画布拖拽、缩放、主题、焦点和错误边界一致。\n\n```json\n{\n  \"permissions\": [\"node.read\", \"node.write\", \"ui.custom\"],\n  \"ui\": {\n    \"entry\": \"ui.js\",\n    \"integrity\": \"sha256-<ui.js 的 64 位十六进制摘要>\",\n    \"exports\": { \"toolDialog\": \"ToolDialog\" }\n  },\n  \"contributes\": {\n    \"nodeTools\": [{\n      \"id\": \"compose\",\n      \"title\": \"组合处理\",\n      \"placements\": [\"node-toolbar\", \"node-context-menu\"],\n      \"icon\": \"lucide:panels-top-left\",\n      \"dialog\": { \"fields\": [], \"ui\": \"toolDialog\" },\n      \"nodeTypes\": [\"ai-image\"],\n      \"inputFields\": [\"output\"],\n      \"output\": { \"mode\": \"update-current\", \"fields\": [\"output\"] }\n    }]\n  }\n}\n```\n\n`ui.js` 必须是自包含的 IIFE/UMD bundle。插件可以使用原生 DOM，也可以把 React、Vue 等框架打进自己的 bundle；宿主不会把主窗口的 React 实例交给插件。bundle 需要把挂载函数写入 `window.__AI_CANVAS_PLUGIN_HOST__.exports.ToolDialog`，签名固定为 `(root, props) => cleanup?`：\n\n```js\n(function () {\n  window.__AI_CANVAS_PLUGIN_HOST__.exports.ToolDialog = function mount(root, props) {\n    const button = document.createElement('button');\n    button.textContent = '执行';\n    button.onclick = () => void props.submit({ confirmed: true });\n    root.appendChild(button);\n    return () => button.remove();\n  };\n})();\n```\n\n挂载函数只能操作 iframe 内传入的 `root`。它收到的 `props` 只有：\n\n- `surface`（v1 固定为 `tool-dialog`）、`theme`、裁剪后的 `node`、安全模型目录和 `parameters`；\n- 本会话的不透明 `resources`；\n- `runEffect()`、`setParameters()`、`submit()`、`close()`、`toast()` 与 `busy`。\n\niframe 与宿主只通过 `window.postMessage` 交换带随机 `sessionId` 的有界 JSON。宿主同时绑定消息的 `event.source`、插件双摘要、项目、节点和画布 revision；伪造来源、更新插件、切换项目、修改画布或断开连线都会使会话失败关闭。UI 点击提交时沿用同一 invocation 的资源句柄和受信媒体集合，不会在提交瞬间换发一组不兼容的 ID。主窗口深浅主题会实时同步到 `theme` getter 与 iframe 的 `data-theme`，同时派发 `ai-canvas-theme-change` 事件；插件负责为两种主题提供可读配色。iframe 内按 `Esc` 也会请求宿主关闭当前 Modal。\n\n宿主启动自定义 UI 前还会确认该 iframe 没有获得 `window.__TAURI__`、`window.__TAURI_INTERNALS__` 或其它 Tauri 初始化标记；检测到即停止加载插件 bundle。这个 iframe 是能力隔离边界，不承诺独立进程或 CPU/内存隔离：死循环或过重渲染仍可能影响主窗口响应，因此常规设置优先使用宿主声明式 `dialog.fields`，自定义 UI 应限制依赖、动画和大对象处理。\n\n## 10. 权限声明\n\n支持以下权限：\n\n| 权限 | 含义 |\n|---|---|\n| `node.read` | 读取 `inputFields` 声明的节点字段 |\n| `node.write` | 更新当前节点或创建派生节点 |\n| `models.read` | 读取不含凭据的可调用模型目录 |\n| `models.invoke` | 请求宿主调用目录中的模型 |\n| `files.connected.read` | 读取 `resourceAccess` 明确允许的当前节点或直接入边项目文件 |\n| `files.output.create` | 通过宿主在项目目录创建派生输出，当前开放文本输出 |\n| `plugin.resources.read` | 读取 `manifest.resources` 随当前 revision 登记的包资源 |\n| `ui.custom` | 在主窗口隔离 Modal 中加载经摘要校验的自定义 UI bundle；代码可能影响主窗口响应 |\n\n节点工具必须声明 `node.write`。只要工具声明了输入字段，也必须声明 `node.read`。模型、资源和 UI 权限不会隐式授予。节点工具的常规配置如下：\n\n```json\n\"permissions\": [\"node.read\", \"node.write\"]\n```\n\n需要模型能力的节点工具再加上模型权限：\n\n```json\n\"permissions\": [\"node.read\", \"node.write\", \"models.read\", \"models.invoke\"]\n```\n\n| 权限 | 对节点工具的作用 |\n|---|---|\n| `models.read` | 填充 `input.models`，并允许弹窗使用 `model` 字段 |\n| `models.invoke` | 允许发出 `model.generate` |\n\n只声明 `models.read` 而没有 `models.invoke` 时，`model.generate` 会被拒绝，并以 `{ ok: false, error }` 回到 `effectResult`，不会中断工具。读取节点/连线文件、包资源和创建输出分别需要对应权限；拥有权限但未声明精确 `resourceAccess` 或资源清单时仍得不到句柄。\n\n声明权限不代表插件能绕过字段白名单；运行时仍会分别校验输入和输出字段。\n\n## 11. 安全与资源限制\n\nJavaScript 插件每次调用都会创建独立 QuickJS Runtime。宿主只传入裁剪后的 JSON 快照和不透明资源句柄，不向 JavaScript 暴露 DOM、网络、文件系统或 Tauri 宿主函数。自定义 UI 运行在主窗口 sandboxed iframe 中，CSP 禁止网络连接且没有 Tauri capability。Python 插件每次调用创建独立本机子进程，但它是可信代码，不受 QuickJS 或 iframe 沙箱保护。\n\nQuickJS 运行时还会在写回画布前检查媒体引用来源。检查覆盖直接媒体 URL、媒体节点的 `output` 回退、Markdown 图片、分镜/导演台/视频参考等嵌套媒体数据。`http/https` 地址（包括本机和局域网地址）不会因目标位置而豁免。画布笔记的 `strokeColor` 和 `backgroundColor` 只接受宿主当前色板值或 `#RGB`、`#RGBA`、`#RRGGBB`、`#RRGGBBAA`，不接受任意 CSS 函数或转义。此规则用于维持“JavaScript 无任意网络能力”的边界；可信 Python 插件本身已经能以当前用户权限联网，因此不受该来源集合约束。\n\n同一套来源集合也用于校验 `model.generate` 的 `imageUrls`：JavaScript 插件只能把本次输入已有的媒体引用交给模型，Python 不受限制。模型请求由宿主发起，因此这条能力不会给 JavaScript 沙箱带来新的网络出口。\n\n节点工具使用 effect 时，宿主会在每一轮结束后重新核对插件版本与画布状态；期间发生项目切换、节点变化、插件更新、停用或卸载，过期结果都不会继续请求宿主操作，也不会写入画布。\n\n### 原生信任注册与代码摘要\n\n安装或更新时，应用会计算入口源码 `sourceDigest`，Rust 还会把规范化 Manifest、入口源码、UI bundle 和按 ID 排序的包资源字节共同计算为 `revisionDigest`。可信 Python 或自定义 UI 的确认会显示来源、完整摘要、宿主权限及对应风险；Renderer 传入的布尔值不能替代 Rust 原生授权。声明的字节数、资源/UI 摘要或两端身份不一致时拒绝安装。\n\n入口源码、UI 和包资源随后以不可变快照登记到应用私有的 `plugin-private` 目录。运行命令只提交插件 ID、`sourceDigest`、`revisionDigest`、工具 ID、调用 ID 和结构化输入，不再把 `main.js` / `main.py` 或 runtime 交给执行命令。Rust 会确认插件已启用、双摘要属于活动 revision、工具由该 revision 声明，并在每次执行和资源读取前重新核对私有快照。\n\n`plugin-private` 不能通过普通文件 API、asset URL 或通用路径命令读取。不要手动编辑其中的 `registry.json` 或源码快照；注册缺失、摘要不一致或快照损坏会让插件失败关闭，而不会退回到直接执行 IndexedDB 源码。\n\n`sourceDigest` 只绑定 `main.js` / `main.py` 的精确字节；`revisionDigest` 绑定本次实际启用的 Manifest、入口、UI 和包资源。两者都不是作者签名或仓库签名，不能证明来源可信；作者和用户仍须核对来源并审查可信 Python 代码与 UI bundle。\n\n| 项目 | 限制 |\n|---|---:|\n| `manifest.json` | 最大 64 KiB |\n| `main.js` / `main.py` | 最大 512 KiB |\n| `ui.js` | 最大 2 MiB |\n| 单个包资源 | 最大 16 MiB；单插件最多 64 项、合计 64 MiB |\n| 单次资源分段读取 | 最大 256 KiB |\n| 单次输入 JSON | 最大 1 MiB |\n| 单次输出 JSON | 最大 1 MiB |\n| 沙箱内存 | 最大 64 MiB |\n| JavaScript 栈 | 最大 512 KiB |\n| JavaScript 单次执行时间 | 最长 2 秒 |\n| Python 单次执行时间 | 解释器探测与正文执行合计最长 30 秒；Windows 使用 Job Object，macOS/Linux 使用独立进程组；管道回收另有 2 秒关闭上限 |\n| 单插件节点工具 | 最多 64 个 |\n| 单插件自定义节点 | 最多 32 个 |\n| 单节点输入/输出端口 | 各最多 16 个 |\n| 单节点/单工具宿主 effect | 最多 4 次 |\n| 单工具输入字段 | 最多 64 个 |\n| 单工具输出字段 | 最多 64 个 |\n\n传入和返回的数据还会进行边界化处理：\n\n- 字符串最长保留 256,000 个字符；\n- 数组最多保留 256 项；\n- 单个对象最多保留 128 个键；\n- JSON 嵌套深度最多 8 层；\n- 非有限数字、函数、Symbol 和危险对象键会被拒绝或移除。\n\n画布在插件执行期间发生项目切换、节点变化、插件 revision 更新、插件停用或卸载时，过期结果不会继续请求宿主 effect，也不会写入画布。更新、停用和卸载会在原生 mutation 前先撤销前端版本租约和资源句柄；旧 revision 的资源不会自动交给新代码。\n\n## 12. 安装、更新、启停与卸载\n\n### 安装\n\n1. 打开“设置”；\n2. 选择“插件”；\n3. 将插件文件夹拖到上传区，或点击上传区打开目录选择器；\n4. 选择包含同级 `manifest.json` 与 `main.js` 或 `main.py` 的插件目录；\n5. 可信 Python 或自定义 UI 插件会先显示来源、入口源码摘要、完整 revision 摘要、宿主权限和对应风险；\n6. 随后的 Rust 原生 Warning 会再次绑定插件 ID、版本与当前 revision。只有原生确认通过后才会暂存代码、UI 和声明资源；\n7. 安装成功后，在匹配类型的节点上打开右键菜单，或选择节点查看上方工具栏按钮。\n\n也可以在“插件市场”中点击安装，或粘贴 GitHub 仓库地址。GitHub 安装仍会经过与本地导入完全相同的 Manifest、权限、源码大小和沙箱校验。\n\nPython 或自定义 UI 插件在安装、更新和从停用状态重新启用时，都会先经过前端来源、摘要、宿主权限和风险复核，再经过 Rust 原生 Warning。确认表示用户信任该 revision，并不表示 AI Canvas 已对其完成安全审计。\n\n原生注册表会保留上一批准 revision，供更新失败补偿或内部回滚使用；它不是插件页中的手动降级功能。任何真实切换到上一 Python revision 的原生流程都必须重新显示高风险授权，不能沿用当前版本的批准状态。\n\n### GitHub 发布规范\n\n需要被插件市场追踪的仓库必须满足：\n\n1. 公开 GitHub 仓库根目录包含 `manifest.json` 和 Manifest 声明的 `main.js` 或 `main.py`；\n2. Manifest 填写规范化的 `repository`，且必须与当前仓库一致；\n3. `version` 使用稳定三段版本号，如 `1.2.0`；\n4. 创建正式 GitHub Release，标签使用 `vX.Y.Z`，如 `v1.2.0`；\n5. Release 标签中的版本必须与 Manifest `version` 完全一致；\n6. 不使用 Draft 或 Pre-release 作为市场稳定版。\n\n示例发布字段：\n\n```json\n{\n  \"version\": \"1.2.0\",\n  \"repository\": \"https://github.com/example/my-ai-canvas-plugin\",\n  \"homepage\": \"https://example.com/my-ai-canvas-plugin\",\n  \"license\": \"MIT\"\n}\n```\n\n应用读取 GitHub 的最新正式 Release，再从该 Release 标签对应的仓库快照读取根目录文件。仓库地址、Release 标签和 Manifest 版本任一不匹配时都会拒绝安装。\n\n### 提交到插件市场\n\n插件市场索引位于项目的 `public/plugin-marketplace.json`。作者通过 Pull Request 添加仓库地址：\n\n```json\n{\n  \"schemaVersion\": 1,\n  \"plugins\": [\n    {\n      \"repository\": \"https://github.com/example/my-ai-canvas-plugin\",\n      \"featured\": false\n    }\n  ]\n}\n```\n\n市场收录只登记仓库，不复制插件源码。收录后，作者发布新的稳定版 Release，应用会在刷新插件页时自动识别新版本。未收录的公开仓库仍可通过仓库地址直接安装；直接安装后也会继续检查更新。\n\n### 更新\n\n修改 Manifest、入口、UI 或包资源后重新导入相同 `id` 的插件，会先暂存新的不可执行快照。安装记录保存成功后，宿主先撤销旧版本租约和资源句柄，再原子激活新 `revisionDigest`，并保留原来的启用或停用状态；原生层同时保留上一批准 revision 供本次失败补偿，不代表用户可以手动降级。摘要比较、数据库保存或激活任一步失败，都会回切旧 active 或移除首次注册，并丢弃未提交的 staged 快照。\n\n完整 revision 身份包含 Manifest、入口源码、UI 和包资源；只修改其中任一部分都会形成新的 `revisionDigest`，不需要为了改变 Manifest 而人为改动入口源码。\n\nGitHub 插件有新稳定版时会显示“可更新”。更新必须由用户点击确认，不会静默替换本地插件。检查结果会短期缓存，以避免频繁消耗 GitHub API 限额。\n\n### 启用、停用与卸载\n\n- 从停用状态重新启用时，宿主重新激活已登记的 active 摘要；可信 Python 必须重新通过前端复核和 Rust 原生 Warning，JavaScript 不获得 Python 授权语义；\n- 停用后，插件工具不会显示在节点右键菜单或工具栏中；\n- 停用、卸载或切换 revision 时，前端会先撤销版本租约并清除资源句柄，原生层随后阻止新调用并取消活动 Python 调用；\n- 卸载成功后会移除应用内的原生注册、IndexedDB 安装记录和私有源码快照，但不会删除用户最初选择的插件开发目录，也不会修改 GitHub 仓库；\n- 已经写入节点的数据不会随插件卸载而自动撤销，可通过画布历史记录撤销最近操作。\n\n## 13. 常见错误\n\n### 插件工具没有出现在右键菜单或工具栏\n\n检查：\n\n- 插件是否处于“已启用”状态；\n- 当前节点类型是否包含在 `nodeTypes` 中；\n- `placements` 是否包含目标入口：`node-context-menu` 或 `node-toolbar`；\n- 工具栏入口是否配置了合法的 `icon` 和 `dialog`；\n- Manifest 工具 ID 是否与 `main.js` 中的 `tools` 键一致。\n\n### 安装时报“请求了不允许暴露给插件的本地字段”\n\n`inputFields` 中包含了本地路径或受保护字段。请改为读取安全的展示字段，例如 `output`、`imageUrl` 或 `fileName`。\n\n### 执行时报“返回了未声明字段”\n\n插件返回的 `data` 包含了 `output.fields` 未声明的字段。将需要写入的安全字段加入 Manifest，或者从返回值中删除该字段。\n\n### 执行时报“未经宿主授权的远程媒体引用”或“未经宿主授权的本地媒体引用”\n\nJavaScript 插件返回了一个并非来自真实媒体输入或本轮宿主媒体模型结果的媒体 URL。请改为原样透传输入，或通过 `model.generate` 让宿主创建媒体；不要自行拼接 CDN、跟踪像素、查询参数、局域网地址，也不要猜测 `asset:`、`file:` 或 `blob:` 本地引用。\n\n### 执行时报“端口类型不兼容”\n\n插件输出端口与目标输入端口的声明类型不同。请连接相同的 `text`、`image`、`video`、`audio` 或 `json` 类型；需要格式转换时，应使用一个显式转换节点。\n\n### 模型调用后 `input.models` 是空数组，或模型下拉为空\n\n插件没有声明 `models.read`，或当前没有已配置凭据的模型。下拉只列出已配置且可调用的模型，未配置的厂商不会出现；声明 `models.read` 后仍为空时，请检查设置中的厂商连接。\n\n### 宿主操作返回 `ok: false`，提示未声明 models.invoke\n\n工具发出了 `model.generate`，但 Manifest 只声明了 `models.read`。宿主不会抛出错误，而是把 `{ ok: false, error: \"插件未声明 models.invoke 权限\" }` 放进 `effectResult` 交回插件。在 `permissions` 中加入 `models.invoke`，或在插件里对该结果做降级处理。\n\n### 执行时报“模型调用的 imageUrls 必须是字符串数组”或“未经宿主授权的远程媒体引用”\n\n`imageUrls` 必须是字符串数组，且 JavaScript 插件只能提交本次 `inputFields` 中已有的媒体引用或本轮宿主模型结果。不要从文本、JSON、文件正文或弹窗参数里拼接新的 `http/https` 地址；确实需要新图时改用 Python 运行时，或让宿主先生成媒体再引用。\n\n### 执行时报“来源插件未安装或已卸载”\n\n当前连线指向一个无法从安装记录解析的显式插件输出端口。请重新安装提供该节点的兼容插件，或删除这条失效连线后重新连接；宿主不会把遗留的通用输出静默代替目标端口。\n\n### 执行时报“不允许的画布笔记颜色”\n\nJavaScript 插件为画布笔记返回了任意 CSS 表达式。请使用宿主色板中的现有值，或使用 3、4、6、8 位十六进制颜色；不要使用 `url()`、转义函数或其他 CSS 代码。\n\n### 执行时报“源码摘要”或“插件未注册”\n\n安装记录与原生私有注册表不一致，或者源码快照已损坏。请停用插件并从原始本地目录或可信仓库重新安装。应用不会为了兼容而直接执行 IndexedDB 中的源码。\n\n### 执行时报“首版插件工具不支持异步返回值”\n\n工具返回了 Promise，或使用了 `async`。v1 工具必须同步完成并直接返回普通对象。\n\n### 执行超过 2 秒\n\n减少输入规模和循环次数，避免无限循环。超过时间限制的执行会被沙箱中断，结果不会写入画布。\n\n### 未找到可用的 Python 3\n\n在插件设置页点击“重新检测”。确认终端中能直接运行 `python3`、`python`，或 Windows 的 `py -3`。AI Canvas 不会自动下载解释器或安装依赖。\n\n### Python 插件输出不是有效 JSON\n\n工具必须返回可由 `json.dumps` 序列化的字典。不要向原始 stdout 写入额外协议内容；普通 `print` 会被 runner 捕获，但直接写文件描述符或子进程继承 stdout 仍可能破坏 JSON 输出。\n\n## 14. 发布前检查清单\n\n- [ ] 文件夹根目录包含 `manifest.json` 和对应的 `main.js` 或 `main.py`；\n- [ ] `apiVersion` 固定为 `1`；JavaScript 使用 `main.js`，Python 使用 `runtime: python` 与 `main.py`；\n- [ ] 插件 ID 稳定且不会随版本变化；\n- [ ] GitHub 发布填写了正确的 `repository`、`license` 和三段式 `version`；\n- [ ] GitHub Release 标签为与 Manifest 版本一致的 `vX.Y.Z`；\n- [ ] 每个 Manifest 工具 ID 都在 `definePlugin().tools` 或 `define_plugin()[\"tools\"]` 中注册；\n- [ ] 工具栏工具配置了合法的 Iconify `icon` 和声明式 `dialog`；\n- [ ] `nodeTypes` 只包含实际支持的节点类型；\n- [ ] `inputFields` 只申请工具确实需要的数据；\n- [ ] `output.fields` 与工具实际返回的 `data` 字段完全一致；\n- [ ] 对缺失、空字符串、空数组等输入进行了处理；\n- [ ] 工具同步执行；JavaScript 正常数据规模下远低于 2 秒，Python 远低于 30 秒；\n- [ ] JavaScript 未使用任意网络、任意路径、DOM、Tauri、npm 包或异步 API；模型和资源操作只返回受支持 effect；\n- [ ] JavaScript 的远程媒体输出只原样透传真实媒体输入或本轮宿主媒体模型结果，没有自行拼接 URL；\n- [ ] Markdown 图片和画布笔记颜色没有形成新的远程资源加载入口；\n- [ ] 自定义节点的来源/目标端口类型一致，并已验证多个输出端口分别连线时的结果；\n- [ ] Python 插件的本机访问、依赖和供应链风险已经由作者与用户审查；\n- [ ] 已测试“更新当前节点”和“创建派生节点”是否符合预期；\n- [ ] `name`、`description` 和工具标题能让用户理解插件用途与出现位置；\n- [ ] 使用模型能力时声明了 `models.read`（目录与模型下拉）与 `models.invoke`（`model.generate`）；\n- [ ] `resourceAccess` 只包含确实需要的 `self`、直接 `incoming` 和端口；没有依赖真实路径；\n- [ ] `resources[]` 的路径、字节数、MIME 与 SHA-256 和发布包实际文件一致；\n- [ ] 自定义 UI 在主窗口 Modal 的深浅主题下均可读，且只通过 props / `runEffect` 使用宿主能力；\n- [ ] 弹窗 `model` 字段的 `modelCategories` 与实际调用的模型分类一致；\n- [ ] 用 `input.effectResult` 或 `input.iteration` 区分了 effect 前后两种阶段，并处理了 `ok: false`；\n- [ ] JavaScript 插件提交的 `imageUrls` 都来自本次输入已有的媒体引用或本轮宿主模型结果。\n\n## 15. 版本约定\n\n- 当前只接受 `apiVersion: 1`，它直接包含本文档列出的节点工具、自定义节点、资源、effect、可信 Python 与主窗口隔离 UI；\n- 不存在更早插件格式的加载、迁移或运行兜底；缺少有效 `sourceDigest` / `revisionDigest` 或原生私有快照的记录会失败关闭，必须重新安装；\n- 插件自身的 `version` 用于展示、更新和发布管理，不决定 API 兼容性；同一插件升级时保持 `id` 不变；\n- 已发布工具和节点应尽量保持各自 `id` 稳定；改变端口 ID 会让现有连线按安全规则失效；\n- 插件不得依赖未在本文档中声明的宿主内部对象。后续能力优先通过 v1 的可选声明扩展；只有出现无法安全表达的破坏性变化时才重新评估 API 版本。\n\n相关架构设计见：[用户插件平台设计](./plans/2026-08-23-user-plugin-platform.md)、[ADR 0009：可信 Python 插件运行时](./adr/0009-trusted-python-plugin-runtime.md)与[原生信任注册表 ADR（0010-native-plugin-trust-registry.md）](./adr/0010-native-plugin-trust-registry.md)。\n"), er, [{
					name: "Markdown 文档",
					extensions: ["md"]
				}]) && a("插件开发规范已保存");
				return;
			}
			let e = URL.createObjectURL(new Blob([Tn], { type: "text/markdown;charset=utf-8" })), t = document.createElement("a");
			t.href = e, t.download = er, document.body.appendChild(t), t.click(), t.remove(), window.setTimeout(() => URL.revokeObjectURL(e), 0), a("插件开发规范已下载");
		} catch (e) {
			a(e instanceof Error ? e.message : "插件开发规范下载失败", "error");
		}
	}, R = async (r) => {
		if (r.length !== 0) {
			s(!0);
			try {
				let e = r.filter(({ file: e }) => e.name === "manifest.json");
				if (e.length !== 1) throw Error("插件文件夹必须且只能包含一个 manifest.json");
				let i = e[0], a = await i.file.text(), o = T(a), s = i.path.slice(0, Math.max(0, i.path.length - i.file.name.length)), c = r.find(({ path: e }) => e === `${s}${o.entry}`);
				if (!c) throw Error(`manifest.json 同级目录缺少 ${o.entry}`);
				let l = t.some((e) => e.id === o.id) ? "更新" : "安装", u = await c.file.text(), d = await pr(r, s, o), f = await mr(r, s, o), p = await ar(o, u, l, "本地文件夹");
				if (!p) return;
				await n(a, u, {
					trustedPythonConfirmed: o.runtime === "python",
					expectedSourceDigest: p,
					uiSource: d,
					resourcePayloads: f
				});
			} catch (e) {
				a(e instanceof Error ? e.message : "插件安装失败", "error");
			} finally {
				s(!1), e.current && (e.current.value = "");
			}
		}
	}, ee = async (e) => {
		if (!(o || e.length === 0)) {
			s(!0);
			try {
				let r = await import("./dist-js-DL_alM4B.js").then((e) => e.t), i = [];
				for (let t of e) await hr(r, t, i);
				let a = i.map((e) => ({
					raw: e,
					path: fr(e)
				})), o = a.filter(({ path: e }) => e.endsWith("/manifest.json"));
				if (o.length === 0) return;
				if (o.length > 1) throw Error("插件文件夹必须且只能包含一个 manifest.json");
				let s = o[0], c = new TextDecoder().decode(await r.readFile(s.raw)), l = T(c), u = s.path.slice(0, s.path.length - 13), d = a.find(({ path: e }) => e === `${u}${l.entry}`);
				if (!d) throw Error(`manifest.json 同级目录缺少 ${l.entry}`);
				let f = t.some((e) => e.id === l.id) ? "更新" : "安装", p = new TextDecoder().decode(await r.readFile(d.raw)), m = l.ui, h;
				if (m) {
					let e = a.find(({ path: e }) => e === `${u}${m.entry}`);
					if (!e) throw Error(`插件声明了自定义界面，但同级目录缺少 ${m.entry}`);
					h = new TextDecoder().decode(await r.readFile(e.raw));
				}
				let g = await Promise.all((l.resources ?? []).map(async (e) => {
					let t = a.find(({ path: t }) => t === `${u}${e.path}`);
					if (!t) throw Error(`插件包缺少资源 ${e.path}`);
					let n = await r.readFile(t.raw);
					if (n.byteLength !== e.bytes) throw Error(`插件包资源 ${e.path} 字节数不匹配`);
					return {
						id: e.id,
						bytes: Array.from(n)
					};
				})), _ = await ar(l, p, f, "本地文件夹");
				if (!_) return;
				await n(c, p, {
					trustedPythonConfirmed: l.runtime === "python",
					expectedSourceDigest: _,
					uiSource: h,
					resourcePayloads: g
				});
			} catch (e) {
				a(e instanceof Error ? e.message : "插件安装失败", "error");
			} finally {
				s(!1);
			}
		}
	}, te = (0, Q.useRef)(ee);
	(0, Q.useEffect)(() => {
		te.current = ee;
	}), (0, Q.useEffect)(() => {
		if (!P()) return;
		let e = !1, t;
		return (async () => {
			let { listen: n } = await import("./event-h5Ir25pQ.js").then((e) => e.i);
			e || (t = await n("tauri://drag-drop", (e) => {
				te.current(e.payload?.paths ?? []);
			}));
		})(), () => {
			e = !0, t?.();
		};
	}, []);
	let z = async (e) => {
		let t = !e.enabled;
		t && !await or(e.manifest, e.sourceDigest) || await r(e.id, t, { trustedPythonConfirmed: t && e.manifest.runtime === "python" });
	}, V = async (e) => {
		if (e.preventDefault(), l(!1), !o) try {
			let t = await dr(e.dataTransfer);
			if (t.length === 0) return;
			await R(t);
		} catch (e) {
			a(e instanceof Error ? e.message : "无法读取插件文件夹", "error");
		}
	};
	return /* @__PURE__ */ (0, $.jsxs)("div", {
		className: "space-y-4",
		children: [
			/* @__PURE__ */ (0, $.jsxs)("section", {
				className: "rounded-xl border border-canvas-border bg-canvas-card p-3",
				children: [
					/* @__PURE__ */ (0, $.jsxs)("div", { children: [
						/* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsx)("h3", {
							className: "text-sm font-medium text-canvas-text",
							children: "用户插件"
						}), /* @__PURE__ */ (0, $.jsx)("p", {
							className: "mt-1 text-[11px] leading-5 text-canvas-text-muted",
							children: "JavaScript 插件使用 QuickJS 沙箱；可信 Python 插件使用本机 Python 和已安装依赖，并拥有当前用户的本机权限。"
						})] }),
						/* @__PURE__ */ (0, $.jsxs)(H.div, {
							className: `ui-dropzone mt-3${c ? " is-dragover" : ""}${o ? " pointer-events-none opacity-60" : ""}`,
							role: "button",
							tabIndex: o ? -1 : 0,
							"aria-disabled": o,
							"aria-busy": o,
							onClick: () => e.current?.click(),
							onKeyDown: (t) => {
								(t.key === "Enter" || t.key === " ") && (t.preventDefault(), e.current?.click());
							},
							onDragOver: (e) => {
								e.preventDefault(), o || l(!0);
							},
							onDragLeave: () => l(!1),
							onDrop: (e) => void V(e),
							whileTap: o ? void 0 : { scale: .995 },
							children: [
								/* @__PURE__ */ (0, $.jsx)("span", {
									className: "ui-dropzone__title",
									children: o ? "正在校验并安装插件…" : "把插件文件夹拖到这里"
								}),
								/* @__PURE__ */ (0, $.jsx)("span", {
									className: "ui-dropzone__icon",
									"aria-hidden": "true",
									children: /* @__PURE__ */ (0, $.jsxs)("svg", {
										width: "22",
										height: "22",
										viewBox: "0 0 24 24",
										fill: "none",
										stroke: "currentColor",
										strokeWidth: "2",
										strokeLinecap: "round",
										strokeLinejoin: "round",
										children: [
											/* @__PURE__ */ (0, $.jsx)("path", { d: "M21 15v4a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2v-4" }),
											/* @__PURE__ */ (0, $.jsx)("polyline", { points: "17 8 12 3 7 8" }),
											/* @__PURE__ */ (0, $.jsx)("line", {
												x1: "12",
												y1: "3",
												x2: "12",
												y2: "15"
											})
										]
									})
								}),
								/* @__PURE__ */ (0, $.jsx)("span", {
									className: "ui-dropzone__hint",
									children: "支持 manifest.json + main.js 或 main.py，点击这里也可以选择。"
								})
							]
						}),
						/* @__PURE__ */ (0, $.jsx)("input", {
							ref: e,
							type: "file",
							className: "hidden",
							multiple: !0,
							webkitdirectory: "",
							onChange: (e) => void R(Array.from(e.currentTarget.files ?? []).map((e) => ({
								file: e,
								path: e.webkitRelativePath || e.name
							})))
						})
					] }),
					/* @__PURE__ */ (0, $.jsxs)("div", {
						className: `mt-3 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 ${D?.available ? "border-emerald-500/20 bg-emerald-500/5" : "border-amber-500/20 bg-amber-500/5"}`,
						children: [/* @__PURE__ */ (0, $.jsxs)("div", {
							className: "min-w-0",
							children: [/* @__PURE__ */ (0, $.jsxs)("div", {
								className: "flex items-center gap-1.5 text-xs font-medium text-canvas-text",
								children: [/* @__PURE__ */ (0, $.jsx)(K, {
									icon: "lucide:terminal-square",
									width: 14,
									height: 14,
									className: D?.available ? "text-emerald-400" : "text-amber-400"
								}), "本机 Python"]
							}), /* @__PURE__ */ (0, $.jsx)("div", {
								className: "mt-0.5 break-words text-[11px] text-canvas-text-muted",
								children: k ? "正在检测 Python 3…" : D?.available ? `可用：${D.command} · Python ${D.version}` : D?.error || "尚未检测"
							})]
						}), /* @__PURE__ */ (0, $.jsx)(W, {
							type: "button",
							disabled: k,
							className: "shrink-0 rounded-md px-2.5 py-1.5 text-xs text-indigo-400 hover:bg-indigo-500/10 disabled:opacity-50",
							onClick: () => void N(),
							children: "重新检测"
						})]
					}),
					/* @__PURE__ */ (0, $.jsxs)("div", {
						className: "mt-3 flex items-center justify-between gap-3 rounded-lg border border-canvas-border bg-canvas-surface px-3 py-2",
						children: [/* @__PURE__ */ (0, $.jsxs)("div", {
							className: "min-w-0",
							children: [/* @__PURE__ */ (0, $.jsxs)("div", {
								className: "flex items-center gap-1.5 text-xs font-medium text-canvas-text",
								children: [/* @__PURE__ */ (0, $.jsx)(K, {
									icon: "lucide:book-open-text",
									width: 14,
									height: 14,
									className: "text-indigo-400"
								}), "插件开发规范"]
							}), /* @__PURE__ */ (0, $.jsx)("div", {
								className: "mt-0.5 text-[11px] text-canvas-text-muted",
								children: "查看 Manifest、节点输入输出、权限和沙箱规则"
							})]
						}), /* @__PURE__ */ (0, $.jsxs)("div", {
							className: "flex shrink-0 items-center gap-1",
							children: [/* @__PURE__ */ (0, $.jsx)(W, {
								type: "button",
								className: "rounded-md px-2.5 py-1.5 text-xs text-indigo-400 hover:bg-indigo-500/10",
								onClick: () => d(!0),
								children: "查看规范"
							}), /* @__PURE__ */ (0, $.jsxs)(W, {
								type: "button",
								scale: 1.02,
								tapScale: .97,
								"aria-label": "下载插件开发规范 Markdown",
								className: "inline-flex h-8 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-canvas-border bg-canvas-card px-2.5 text-[11px] font-medium text-canvas-text-secondary transition-colors duration-150 hover:border-indigo-400/35 hover:bg-indigo-500/10 hover:text-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/45",
								onClick: () => void L(),
								children: [/* @__PURE__ */ (0, $.jsx)(K, {
									icon: "lucide:download",
									width: 14,
									height: 14,
									className: "shrink-0"
								}), "下载"]
							})]
						})]
					}),
					/* @__PURE__ */ (0, $.jsxs)("div", {
						className: "mt-2 flex items-center justify-between gap-3 rounded-lg border border-canvas-border bg-canvas-surface px-3 py-2",
						children: [/* @__PURE__ */ (0, $.jsxs)("div", {
							className: "min-w-0",
							children: [/* @__PURE__ */ (0, $.jsx)("div", {
								className: "text-xs font-medium text-canvas-text",
								children: "开发者示例"
							}), /* @__PURE__ */ (0, $.jsx)("div", {
								className: "mt-0.5 text-[11px] text-canvas-text-muted",
								children: "安装文本工具和一个可调用模型的自定义写作节点"
							})]
						}), /* @__PURE__ */ (0, $.jsxs)("div", {
							className: "flex shrink-0 items-center gap-1",
							children: [/* @__PURE__ */ (0, $.jsx)(W, {
								type: "button",
								className: "rounded-md px-2.5 py-1.5 text-xs text-indigo-400 hover:bg-indigo-500/10",
								onClick: () => void n(Xn, Zn).catch((e) => {
									a(e instanceof Error ? e.message : "示例插件安装失败", "error");
								}),
								children: "JavaScript"
							}), /* @__PURE__ */ (0, $.jsx)(W, {
								type: "button",
								className: "rounded-md px-2.5 py-1.5 text-xs text-amber-400 hover:bg-amber-500/10",
								onClick: () => void (async () => {
									let e = await ar(T(Qn), $n, "安装", "应用内置开发者示例");
									e && await n(Qn, $n, {
										trustedPythonConfirmed: !0,
										expectedSourceDigest: e
									});
								})().catch((e) => {
									a(e instanceof Error ? e.message : "Python 示例安装失败", "error");
								}),
								children: "Python"
							})]
						})]
					})
				]
			}),
			/* @__PURE__ */ (0, $.jsxs)("section", {
				className: "rounded-xl border border-canvas-border bg-canvas-card p-3",
				children: [
					/* @__PURE__ */ (0, $.jsxs)("div", {
						className: "flex items-start justify-between gap-3",
						children: [/* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsxs)("div", {
							className: "flex items-center gap-1.5 text-sm font-medium text-canvas-text",
							children: [/* @__PURE__ */ (0, $.jsx)(K, {
								icon: "lucide:store",
								width: 16,
								height: 16,
								className: "text-indigo-400"
							}), "插件市场"]
						}), /* @__PURE__ */ (0, $.jsx)("p", {
							className: "mt-1 text-[11px] leading-5 text-canvas-text-muted",
							children: "从已登记的 GitHub Release 安装插件，并检查已安装 GitHub 插件的新版本。"
						})] }), /* @__PURE__ */ (0, $.jsx)(W, {
							type: "button",
							"aria-label": "刷新插件市场",
							disabled: m,
							className: "rounded-md p-1.5 text-canvas-text-muted hover:bg-indigo-500/10 hover:text-indigo-400 disabled:opacity-50",
							onClick: () => void M(!0),
							children: /* @__PURE__ */ (0, $.jsx)(K, {
								icon: "lucide:refresh-cw",
								width: 14,
								height: 14,
								className: m ? "animate-spin" : ""
							})
						})]
					}),
					/* @__PURE__ */ (0, $.jsxs)("div", {
						className: "mt-3 flex gap-2",
						children: [/* @__PURE__ */ (0, $.jsx)("input", {
							value: b,
							onChange: (e) => S(e.target.value),
							onKeyDown: (e) => {
								e.key === "Enter" && I(b);
							},
							placeholder: "GitHub 仓库地址，例如 owner/my-plugin",
							"aria-label": "GitHub 插件仓库地址",
							className: "min-w-0 flex-1 rounded-lg border border-canvas-border bg-canvas-surface px-3 py-2 text-xs text-canvas-text outline-none placeholder:text-canvas-text-muted focus:border-indigo-400/50"
						}), /* @__PURE__ */ (0, $.jsx)(W, {
							type: "button",
							disabled: !b.trim() || !!w,
							className: "shrink-0 rounded-lg bg-indigo-500/15 px-3 text-xs font-medium text-indigo-400 hover:bg-indigo-500/20 disabled:cursor-not-allowed disabled:opacity-50",
							onClick: () => void I(b),
							children: w === b ? "读取中…" : "从仓库安装"
						})]
					}),
					(f.length > 0 || v) && /* @__PURE__ */ (0, $.jsxs)("div", {
						className: "relative mt-3",
						children: [/* @__PURE__ */ (0, $.jsx)(K, {
							icon: "lucide:search",
							width: 14,
							height: 14,
							className: "pointer-events-none absolute left-3 top-1/2 -translate-y-1/2 text-canvas-text-muted"
						}), /* @__PURE__ */ (0, $.jsx)("input", {
							value: v,
							onChange: (e) => y(e.target.value),
							placeholder: "搜索插件、作者或关键词",
							"aria-label": "搜索插件市场",
							className: "w-full rounded-lg border border-canvas-border bg-canvas-surface py-2 pl-8 pr-3 text-xs text-canvas-text outline-none placeholder:text-canvas-text-muted focus:border-indigo-400/50"
						})]
					}),
					/* @__PURE__ */ (0, $.jsxs)("div", {
						className: "mt-3 space-y-2",
						children: [
							m && f.length === 0 && /* @__PURE__ */ (0, $.jsx)("div", {
								className: "rounded-lg border border-dashed border-canvas-border px-3 py-6 text-center text-xs text-canvas-text-muted",
								children: "正在读取 GitHub 插件列表…"
							}),
							g && /* @__PURE__ */ (0, $.jsx)("div", {
								className: "rounded-lg border border-red-500/20 bg-red-500/5 px-3 py-2 text-xs text-red-400",
								children: g
							}),
							!m && !g && f.length === 0 && /* @__PURE__ */ (0, $.jsx)("div", {
								className: "rounded-lg border border-dashed border-canvas-border px-3 py-6 text-center text-xs text-canvas-text-muted",
								children: "市场暂未收录插件，可先粘贴 GitHub 仓库地址安装。"
							}),
							F.map((e) => {
								if (e.status === "error") return /* @__PURE__ */ (0, $.jsxs)("article", {
									className: "rounded-lg border border-canvas-border bg-canvas-surface p-3",
									children: [/* @__PURE__ */ (0, $.jsx)("div", {
										className: "truncate text-xs font-medium text-canvas-text",
										children: e.repository
									}), /* @__PURE__ */ (0, $.jsx)("div", {
										className: "mt-1 text-[11px] text-red-400",
										children: e.error
									})]
								}, e.repository);
								let n = t.find((t) => t.id === e.manifest.id), r = n ? Yn(e.manifest.version, n.manifest.version) : !1, i = !!(n && !r) || !!w;
								return /* @__PURE__ */ (0, $.jsx)("article", {
									className: "rounded-lg border border-canvas-border bg-canvas-surface p-3",
									children: /* @__PURE__ */ (0, $.jsxs)("div", {
										className: "flex items-start gap-3",
										children: [
											/* @__PURE__ */ (0, $.jsx)("span", {
												className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400",
												children: /* @__PURE__ */ (0, $.jsx)(K, {
													icon: "lucide:blocks",
													width: 18,
													height: 18
												})
											}),
											/* @__PURE__ */ (0, $.jsxs)("div", {
												className: "min-w-0 flex-1",
												children: [
													/* @__PURE__ */ (0, $.jsxs)("div", {
														className: "flex flex-wrap items-center gap-1.5",
														children: [
															/* @__PURE__ */ (0, $.jsx)("span", {
																className: "truncate text-sm font-medium text-canvas-text",
																children: e.manifest.name
															}),
															/* @__PURE__ */ (0, $.jsxs)("span", {
																className: "rounded bg-canvas-card px-1.5 py-0.5 text-[10px] text-canvas-text-muted",
																children: ["v", e.manifest.version]
															}),
															e.featured && /* @__PURE__ */ (0, $.jsx)("span", {
																className: "rounded bg-amber-500/10 px-1.5 py-0.5 text-[10px] text-amber-400",
																children: "推荐"
															}),
															e.manifest.runtime === "python" && /* @__PURE__ */ (0, $.jsx)("span", {
																className: "rounded bg-red-500/10 px-1.5 py-0.5 text-[10px] text-red-400",
																children: "可信本机代码"
															}),
															r && /* @__PURE__ */ (0, $.jsx)("span", {
																className: "rounded bg-emerald-500/10 px-1.5 py-0.5 text-[10px] text-emerald-400",
																children: "可更新"
															})
														]
													}),
													/* @__PURE__ */ (0, $.jsx)("p", {
														className: "mt-1 text-[11px] leading-4 text-canvas-text-secondary",
														children: e.manifest.description || "未提供说明"
													}),
													/* @__PURE__ */ (0, $.jsx)("a", {
														href: e.repository,
														target: "_blank",
														rel: "noreferrer",
														className: "mt-1 block truncate text-[10px] text-canvas-text-muted hover:text-indigo-400",
														children: e.repository.replace("https://github.com/", "")
													}),
													/* @__PURE__ */ (0, $.jsxs)("div", {
														className: "mt-1 text-[10px] text-canvas-text-muted",
														children: [
															Jn[e.manifest.category],
															" · 权限：",
															e.manifest.permissions.join("、")
														]
													})
												]
											}),
											/* @__PURE__ */ (0, $.jsx)(W, {
												type: "button",
												disabled: i,
												className: "shrink-0 rounded-md bg-indigo-500/10 px-2.5 py-1.5 text-[11px] font-medium text-indigo-400 hover:bg-indigo-500/15 disabled:cursor-not-allowed disabled:bg-canvas-card disabled:text-canvas-text-muted",
												onClick: () => void I(e.repository, e),
												children: w === e.repository ? "安装中…" : r ? "更新" : n ? "已安装" : "安装"
											})
										]
									})
								}, e.repository);
							}),
							!m && f.length > 0 && F.length === 0 && /* @__PURE__ */ (0, $.jsx)("div", {
								className: "py-4 text-center text-xs text-canvas-text-muted",
								children: "没有匹配的插件"
							})
						]
					})
				]
			}),
			/* @__PURE__ */ (0, $.jsxs)("section", {
				className: "space-y-2",
				children: [t.map((e) => {
					let t = [...new Set(e.manifest.contributes.nodeTools.flatMap((e) => e.nodeTypes))], n = e.manifest.contributes.nodes ?? [], r = [...new Set(e.manifest.contributes.nodeTools.flatMap((e) => e.inputFields))], o = [...new Set(e.manifest.contributes.nodeTools.flatMap((e) => e.output.fields))], s = new Set(e.manifest.contributes.nodeTools.flatMap((e) => e.placements)), c = [s.has("node-context-menu") ? "节点右键菜单" : null, s.has("node-toolbar") ? "节点工具栏" : null].filter(Boolean).join("、");
					return /* @__PURE__ */ (0, $.jsx)("article", {
						className: "rounded-xl border border-canvas-border bg-canvas-card p-3",
						children: /* @__PURE__ */ (0, $.jsxs)("div", {
							className: "flex items-start gap-3",
							children: [
								/* @__PURE__ */ (0, $.jsx)("span", {
									className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400",
									children: /* @__PURE__ */ (0, $.jsx)(K, {
										icon: "lucide:blocks",
										width: 18,
										height: 18
									})
								}),
								/* @__PURE__ */ (0, $.jsxs)("div", {
									className: "min-w-0 flex-1",
									children: [
										/* @__PURE__ */ (0, $.jsxs)("div", {
											className: "flex flex-wrap items-center gap-2",
											children: [
												/* @__PURE__ */ (0, $.jsx)("h4", {
													className: "truncate text-sm font-medium text-canvas-text",
													children: e.manifest.name
												}),
												/* @__PURE__ */ (0, $.jsxs)("span", {
													className: "rounded bg-canvas-surface px-1.5 py-0.5 text-[10px] text-canvas-text-muted",
													children: ["v", e.manifest.version]
												}),
												/* @__PURE__ */ (0, $.jsx)("span", {
													className: "rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] text-indigo-400",
													children: Jn[e.manifest.category]
												}),
												/* @__PURE__ */ (0, $.jsx)("span", {
													className: `rounded px-1.5 py-0.5 text-[10px] ${e.manifest.runtime === "python" ? "bg-red-500/10 text-red-400" : "bg-emerald-500/10 text-emerald-400"}`,
													children: e.manifest.runtime === "python" ? "Python · 可信本机代码" : "JavaScript · 沙箱"
												})
											]
										}),
										/* @__PURE__ */ (0, $.jsx)("p", {
											className: "mt-1 text-[11px] leading-4 text-canvas-text-secondary",
											children: e.manifest.description || "未提供说明"
										}),
										/* @__PURE__ */ (0, $.jsxs)("div", {
											className: "mt-2 flex flex-wrap gap-1",
											children: [t.map((e) => /* @__PURE__ */ (0, $.jsx)("span", {
												className: "rounded bg-canvas-surface px-1.5 py-0.5 text-[10px] text-canvas-text-muted",
												children: x(e).label
											}, e)), n.map((e) => /* @__PURE__ */ (0, $.jsx)("span", {
												className: "rounded bg-indigo-500/10 px-1.5 py-0.5 text-[10px] text-indigo-400",
												children: e.title
											}, e.id))]
										}),
										/* @__PURE__ */ (0, $.jsxs)("div", {
											className: "mt-2 text-[10px] leading-4 text-canvas-text-muted",
											children: [
												"API v",
												e.manifest.apiVersion,
												" · ",
												e.manifest.entry,
												" · 入口：",
												c || (n.length ? "节点选择器" : "未声明"),
												/* @__PURE__ */ (0, $.jsx)("br", {}),
												"工具 ",
												e.manifest.contributes.nodeTools.length,
												" 个 · 自定义节点 ",
												n.length,
												" 个",
												/* @__PURE__ */ (0, $.jsx)("br", {}),
												"读取：",
												r.join("、") || "无",
												" · 写入：",
												o.join("、") || "无",
												/* @__PURE__ */ (0, $.jsx)("br", {}),
												"权限：",
												e.manifest.permissions.join("、"),
												/* @__PURE__ */ (0, $.jsx)("br", {}),
												"代码 SHA-256：",
												/* @__PURE__ */ (0, $.jsx)("span", {
													className: "break-all font-mono",
													title: e.sourceDigest,
													children: e.sourceDigest ?? "待原生迁移"
												})
											]
										})
									]
								}),
								/* @__PURE__ */ (0, $.jsxs)("div", {
									className: "flex shrink-0 items-center gap-1",
									children: [/* @__PURE__ */ (0, $.jsx)(W, {
										type: "button",
										role: "switch",
										"aria-checked": e.enabled,
										className: `rounded-md px-2 py-1 text-[11px] ${e.enabled ? "bg-emerald-500/10 text-emerald-400" : "bg-canvas-surface text-canvas-text-muted"}`,
										onClick: () => void z(e).catch((e) => {
											a(e instanceof Error ? e.message : "插件状态保存失败", "error");
										}),
										children: e.enabled ? "已启用" : "已停用"
									}), /* @__PURE__ */ (0, $.jsx)(W, {
										type: "button",
										"aria-label": `卸载 ${e.manifest.name}`,
										className: "rounded-md p-1.5 text-canvas-text-muted hover:bg-red-500/10 hover:text-red-400",
										onClick: () => {
											U(`确定卸载插件「${e.manifest.name}」吗？`, { title: "卸载插件" }).then((t) => {
												t && i(e.id).catch((e) => {
													a(e instanceof Error ? e.message : "插件卸载失败", "error");
												});
											});
										},
										children: /* @__PURE__ */ (0, $.jsx)(K, {
											icon: "lucide:trash-2",
											width: 14,
											height: 14
										})
									})]
								})
							]
						})
					}, e.id);
				}), t.length === 0 && /* @__PURE__ */ (0, $.jsx)("div", {
					className: "rounded-xl border border-dashed border-canvas-border p-8 text-center text-xs text-canvas-text-muted",
					children: "还没有安装插件"
				})]
			}),
			/* @__PURE__ */ (0, $.jsxs)(ne, {
				isOpen: u,
				onClose: () => d(!1),
				ariaLabel: "AI Canvas 插件开发规范",
				className: "h-[min(780px,calc(100vh-40px))] w-[min(920px,calc(100vw-40px))] border-canvas-border",
				motionPreset: "quick",
				children: [/* @__PURE__ */ (0, $.jsxs)("header", {
					className: "flex shrink-0 items-center gap-3 border-b border-canvas-border px-4 py-3",
					children: [
						/* @__PURE__ */ (0, $.jsx)("span", {
							className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400",
							children: /* @__PURE__ */ (0, $.jsx)(K, {
								icon: "lucide:book-open-text",
								width: 18,
								height: 18
							})
						}),
						/* @__PURE__ */ (0, $.jsxs)("div", {
							className: "min-w-0 flex-1",
							children: [/* @__PURE__ */ (0, $.jsx)("h2", {
								className: "text-sm font-semibold text-canvas-text",
								children: "AI Canvas 插件开发规范"
							}), /* @__PURE__ */ (0, $.jsx)("p", {
								className: "mt-0.5 text-[11px] text-canvas-text-muted",
								children: "Plugin API v1 · 与当前插件运行时同步"
							})]
						}),
						/* @__PURE__ */ (0, $.jsxs)(W, {
							type: "button",
							scale: 1.015,
							tapScale: .97,
							className: "inline-flex h-8 shrink-0 items-center justify-center gap-1.5 whitespace-nowrap rounded-lg border border-canvas-border bg-canvas-surface px-3 text-[11px] font-medium text-canvas-text-secondary transition-colors duration-150 hover:border-indigo-400/35 hover:bg-indigo-500/10 hover:text-indigo-400 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-indigo-400/45",
							onClick: () => void L(),
							children: [
								/* @__PURE__ */ (0, $.jsx)(K, {
									icon: "lucide:download",
									width: 14,
									height: 14,
									className: "shrink-0"
								}),
								/* @__PURE__ */ (0, $.jsx)("span", {
									className: "hidden sm:inline",
									children: "下载 Markdown"
								}),
								/* @__PURE__ */ (0, $.jsx)("span", {
									className: "sm:hidden",
									children: "下载"
								})
							]
						}),
						/* @__PURE__ */ (0, $.jsx)(ie, {
							ariaLabel: "关闭插件开发规范",
							onClick: () => d(!1)
						})
					]
				}), /* @__PURE__ */ (0, $.jsx)("div", {
					className: "min-h-0 flex-1 overflow-y-auto px-5 py-4 text-[12px] leading-6 text-canvas-text-secondary sm:px-7 sm:py-6",
					children: /* @__PURE__ */ (0, $.jsx)(Y, { value: Tn })
				})]
			})
		]
	});
}
//#endregion
//#region src/components/backgrounds/backgroundOptions.ts
var _r = [
	{
		value: "default",
		label: "默认暗色",
		preview: "canvas-bg",
		theme: "dark"
	},
	{
		value: "solar-system",
		label: "太阳系",
		preview: "solar-system",
		theme: "dark"
	},
	{
		value: "nebula",
		label: "星云",
		preview: "nebula",
		theme: "dark"
	},
	{
		value: "off-white",
		label: "米白浅色",
		preview: "off-white",
		theme: "light"
	},
	{
		value: "frosted-glass",
		label: "磨砂暖光",
		preview: "frosted-glass",
		theme: "light"
	},
	{
		value: "custom",
		label: "自定义图片",
		preview: "custom",
		theme: "dark"
	}
];
//#endregion
//#region src/services/backgroundService.ts
function vr(e) {
	return new Promise((t, n) => {
		let r = new Image();
		r.onload = () => {
			let e = document.createElement("canvas"), i = Math.round(r.height / r.width * 50) || 50;
			e.width = 50, e.height = i;
			let a = e.getContext("2d");
			if (!a) {
				n(/* @__PURE__ */ Error("无法创建 canvas 上下文"));
				return;
			}
			a.drawImage(r, 0, 0, 50, i);
			let o = a.getImageData(0, 0, 50, i).data, s = 0, c = 0;
			for (let e = 0; e < o.length; e += 4) {
				let t = o[e], n = o[e + 1], r = o[e + 2], i = .299 * t + .587 * n + .114 * r;
				s += i, c++;
			}
			let l = c > 0 ? s / c : 128;
			t({
				isDark: l < 128,
				brightness: Math.round(l)
			});
		}, r.onerror = () => n(/* @__PURE__ */ Error("图片加载失败")), r.src = e;
	});
}
function yr(e) {
	return e.size > 10 * 1024 * 1024 ? Promise.reject(/* @__PURE__ */ Error("图片大小不能超过 10MB")) : new Promise((t, n) => {
		let r = new FileReader();
		r.onload = () => t(r.result), r.onerror = () => n(/* @__PURE__ */ Error("文件读取失败")), r.readAsDataURL(e);
	});
}
function br(e) {
	if (e.size > 10 * 1024 * 1024) return Promise.reject(/* @__PURE__ */ Error("图片大小不能超过 10MB"));
	let t = e.size, n = e.type.split("/")[1] || e.name.split(".").pop() || "file";
	return new Promise((r, i) => {
		let a = new Image(), o = URL.createObjectURL(e), s = !1, c = () => {
			s ||= (URL.revokeObjectURL(o), !0);
		};
		a.onload = () => {
			c(), (async () => {
				let o = null;
				try {
					let { naturalWidth: i, naturalHeight: s } = a;
					if (i * s > 4096 * 4096) throw Error(`图片分辨率过高（${i}×${s}），请使用 ≤4096×4096 的图片`);
					o = document.createElement("canvas"), o.width = i, o.height = s;
					let c = o.getContext("2d");
					if (!c) throw Error("无法创建 canvas 上下文");
					c.drawImage(a, 0, 0);
					let [l, u] = await Promise.all([xr(o, "image/png"), xr(o, "image/webp", 1)]);
					if (!l) throw Error("PNG 编码失败");
					let d = u && u.size < l.size, f = d ? u : l, p = d ? "webp" : "png";
					if (f.size >= t) {
						r({
							dataUrl: await yr(e),
							originalSize: t,
							compressedSize: t,
							compressionRatio: 0,
							format: n,
							keptOriginal: !0
						});
						return;
					}
					r({
						dataUrl: await Sr(f),
						originalSize: t,
						compressedSize: f.size,
						compressionRatio: Math.round((1 - f.size / t) * 100),
						format: p,
						keptOriginal: !1
					});
				} catch (e) {
					i(e);
				} finally {
					o && (o.width = 0, o.height = 0), c();
				}
			})();
		}, a.onerror = () => {
			c(), i(/* @__PURE__ */ Error("图片加载失败"));
		}, a.src = o;
	});
}
function xr(e, t, n) {
	return new Promise((r) => {
		e.toBlob((e) => r(e), t, n);
	});
}
function Sr(e) {
	return new Promise((t, n) => {
		let r = new FileReader();
		r.onload = () => t(r.result), r.onerror = () => n(/* @__PURE__ */ Error("Data URL 转换失败")), r.readAsDataURL(e);
	});
}
//#endregion
//#region src/components/SettingsPanel.tsx
var Cr = [
	{
		id: "16:9",
		presets: [
			{
				w: 1280,
				h: 720,
				label: "紧凑"
			},
			{
				w: 1600,
				h: 900,
				label: "标准"
			},
			{
				w: 1920,
				h: 1080,
				label: "大屏"
			}
		]
	},
	{
		id: "16:10",
		presets: [
			{
				w: 1280,
				h: 800,
				label: "紧凑"
			},
			{
				w: 1440,
				h: 900,
				label: "标准"
			},
			{
				w: 1680,
				h: 1050,
				label: "大屏"
			}
		]
	},
	{
		id: "4:3",
		presets: [
			{
				w: 1024,
				h: 768,
				label: "紧凑"
			},
			{
				w: 1280,
				h: 960,
				label: "标准"
			},
			{
				w: 1440,
				h: 1080,
				label: "大屏"
			}
		]
	}
];
async function wr(e, t) {
	try {
		let { getCurrentWindow: n, LogicalSize: r, currentMonitor: i } = await import("./window-WhVtX8QG.js"), a = n();
		await a.isFullscreen() && await a.setFullscreen(!1), await a.isMaximized() && await a.unmaximize();
		let o = e, s = t, c = await i();
		if (c) {
			let e = c.size.width / c.scaleFactor - 40, t = c.size.height / c.scaleFactor - 80, n = Math.min(1, e / o, t / s);
			o = Math.round(o * n), s = Math.round(s * n);
		}
		await a.setSize(new r(o, s)), await a.center();
	} catch (e) {
		console.warn("[窗口尺寸] 设置失败:", e);
	}
}
var Tr = [{
	id: "default",
	title: "Figma 模式",
	badge: "选择优先",
	description: "左键框选，滚轮直接缩放，适合高频编辑节点",
	gestures: [
		{
			key: "左键拖动",
			action: "框选节点"
		},
		{
			key: "右键 / 中键",
			action: "平移画布"
		},
		{
			key: "滚轮",
			action: "缩放画布"
		},
		{
			key: "Shift + 点击",
			action: "追加多选"
		},
		{
			key: "右键轻点",
			action: "打开菜单"
		}
	]
}, {
	id: "classic",
	title: "经典模式",
	badge: "导航优先",
	description: "左键拖动画布，组合键缩放，适合大范围浏览",
	gestures: [
		{
			key: "左键拖动",
			action: "平移画布"
		},
		{
			key: "Shift + 左键",
			action: "框选节点"
		},
		{
			key: "滚轮",
			action: "垂直平移"
		},
		{
			key: "Shift + 滚轮",
			action: "水平平移"
		},
		{
			key: "Ctrl + 滚轮",
			action: "缩放画布"
		},
		{
			key: "鼠标右键",
			action: "打开菜单"
		}
	]
}], Er = [{
	id: "icons",
	label: "极简图标",
	icon: "lucide:circle-dot"
}, {
	id: "icons-and-text",
	label: "图标 + 文本",
	icon: "lucide:panel-top"
}], Dr = [{
	id: "last-project",
	label: "上次画布",
	description: "恢复关闭软件时正在编辑的项目",
	icon: "lucide:history"
}, {
	id: "project-library",
	label: "项目列表",
	description: "启动后先选择要打开的项目",
	icon: "lucide:layout-grid"
}], Or = typeof navigator < "u" && /Macintosh|Mac OS X/.test(navigator.userAgent);
function kr(e) {
	return e < 1024 ? `${e} B` : e < 1024 * 1024 ? `${(e / 1024).toFixed(1)} KB` : `${(e / (1024 * 1024)).toFixed(2)} MB`;
}
function Ar() {
	let e = i(), t = o(), { settingsOpen: n, setSettingsOpen: r, settingsInitialTab: c, setSettingsInitialTab: l, config: u, updateConfig: d, saveConfig: f, showToast: p } = C(ae((e) => ({
		settingsOpen: e.settingsOpen,
		setSettingsOpen: e.setSettingsOpen,
		settingsInitialTab: e.settingsInitialTab,
		setSettingsInitialTab: e.setSettingsInitialTab,
		config: e.config,
		updateConfig: e.updateConfig,
		saveConfig: e.saveConfig,
		showToast: e.showToast
	}))), m = u.sidebarFloating === !0, h = u.windowGlassFrame !== !1, g = u.performanceMode === !0, _ = u.windowAspectRatio ?? "16:9", v = u.windowAspectLocked === !0, y = u.customCursor !== !1, [b, x] = (0, Q.useState)(null);
	(0, Q.useEffect)(() => {
		if (!n) return;
		let e = !1, t;
		return (async () => {
			try {
				let { getCurrentWindow: n } = await import("./window-WhVtX8QG.js"), r = n(), i = async () => {
					let e = (await r.innerSize()).toLogical(await r.scaleFactor());
					x({
						w: Math.round(e.width),
						h: Math.round(e.height)
					});
				};
				await i();
				let a = await r.onResized(() => {
					i();
				});
				e ? a() : t = a;
			} catch {}
		})(), () => {
			e = !0, t?.();
		};
	}, [n]);
	let S = h && !g, w = u.interactionMode ?? "default", T = u.nodeToolbarMode ?? "icons", E = u.nodeLabelVisible !== !1, D = u.canvasNoteToolbarVisible !== !1, O = u.startupView ?? "last-project", k = Tr.find((e) => e.id === w) ?? Tr[0], [A, j] = (0, Q.useState)("general"), [M, N] = (0, Q.useState)(!1), [P, F] = (0, Q.useState)(null), I = (0, Q.useRef)(null), L = (n ? c : null) ?? A;
	return /* @__PURE__ */ (0, $.jsxs)(ne, {
		isOpen: n,
		onClose: () => r(!1),
		ariaLabel: e("设置"),
		className: "w-[640px] h-[80vh]",
		closeOnBackdrop: !1,
		children: [/* @__PURE__ */ (0, $.jsxs)("div", {
			className: "flex items-center justify-between px-3.5 py-2.5 border-b border-canvas-border",
			children: [/* @__PURE__ */ (0, $.jsx)("h2", {
				className: "text-base font-semibold text-canvas-text",
				children: e("设置")
			}), /* @__PURE__ */ (0, $.jsx)(ie, {
				ariaLabel: e("关闭设置"),
				onClick: () => r(!1)
			})]
		}), /* @__PURE__ */ (0, $.jsxs)("div", {
			className: "flex flex-1 min-h-0",
			children: [/* @__PURE__ */ (0, $.jsx)(_n, {
				activeTab: L,
				onSelect: (e) => {
					j(e), l(null);
				}
			}), /* @__PURE__ */ (0, $.jsxs)("div", {
				className: "settings-content flex-1 overflow-y-auto overflow-x-hidden p-3",
				children: [
					L === "api" && /* @__PURE__ */ (0, $.jsx)(Bt, { onClose: () => r(!1) }),
					L === "comfyui" && /* @__PURE__ */ (0, $.jsx)(Sn, {}),
					L === "general" && /* @__PURE__ */ (0, $.jsxs)("div", {
						className: "space-y-4",
						children: [
							/* @__PURE__ */ (0, $.jsxs)("section", { children: [/* @__PURE__ */ (0, $.jsx)("h3", {
								className: "mb-2 text-sm font-medium text-canvas-text",
								children: e("界面语言")
							}), /* @__PURE__ */ (0, $.jsx)("div", {
								className: "grid grid-cols-4 gap-1 rounded-lg border border-canvas-border bg-canvas-card p-1",
								role: "radiogroup",
								"aria-label": e("界面语言"),
								children: s.map((e) => {
									let n = t === e;
									return /* @__PURE__ */ (0, $.jsx)(W, {
										type: "button",
										role: "radio",
										"aria-checked": n,
										onClick: async () => {
											n || (d({ language: e }), await f());
										},
										className: `flex h-9 items-center justify-center gap-2 rounded-md text-xs font-medium transition-colors ${n ? "bg-indigo-500/15 text-indigo-400 shadow-sm" : "text-canvas-text-secondary hover:bg-canvas-hover hover:text-canvas-text"}`,
										children: /* @__PURE__ */ (0, $.jsx)("span", { children: a[e] })
									}, e);
								})
							})] }),
							/* @__PURE__ */ (0, $.jsxs)("section", { children: [/* @__PURE__ */ (0, $.jsx)("h3", {
								className: "mb-2 text-sm font-medium text-canvas-text",
								children: e("启动时打开")
							}), /* @__PURE__ */ (0, $.jsx)("div", {
								className: "grid grid-cols-2 gap-2",
								role: "radiogroup",
								"aria-label": e("软件启动时打开"),
								children: Dr.map((t) => {
									let n = O === t.id;
									return /* @__PURE__ */ (0, $.jsxs)(W, {
										type: "button",
										role: "radio",
										"aria-checked": n,
										onClick: async () => {
											n || (d({ startupView: t.id }), await f());
										},
										className: `flex items-start gap-3 rounded-lg border p-3 text-left transition-colors ${n ? "border-indigo-500 bg-indigo-500/10 text-indigo-400" : "border-canvas-border bg-canvas-card text-canvas-text-secondary hover:border-canvas-hover"}`,
										children: [/* @__PURE__ */ (0, $.jsx)("span", {
											className: `flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${n ? "bg-indigo-500/15" : "bg-canvas-surface"}`,
											"aria-hidden": "true",
											children: /* @__PURE__ */ (0, $.jsx)(K, {
												icon: t.icon,
												width: "16",
												height: "16"
											})
										}), /* @__PURE__ */ (0, $.jsxs)("span", {
											className: "min-w-0",
											children: [/* @__PURE__ */ (0, $.jsx)("span", {
												className: "block text-xs font-medium text-canvas-text",
												children: e(t.label)
											}), /* @__PURE__ */ (0, $.jsx)("span", {
												className: "mt-1 block whitespace-nowrap text-[11px] leading-4 text-canvas-text-muted",
												children: e(t.description)
											})]
										})]
									}, t.id);
								})
							})] }),
							/* @__PURE__ */ (0, $.jsxs)("section", { children: [
								/* @__PURE__ */ (0, $.jsx)("h3", {
									className: "mb-2 text-sm font-medium text-canvas-text",
									children: e("应用窗口大小")
								}),
								/* @__PURE__ */ (0, $.jsx)("div", {
									className: "mb-2 grid grid-cols-3 gap-1 rounded-lg border border-canvas-border bg-canvas-card p-1",
									role: "radiogroup",
									"aria-label": e("窗口比例"),
									children: Cr.map(({ id: e }) => {
										let t = _ === e;
										return /* @__PURE__ */ (0, $.jsx)(W, {
											type: "button",
											role: "radio",
											"aria-checked": t,
											onClick: async () => {
												t || (d({ windowAspectRatio: e }), await f());
											},
											className: `flex h-9 items-center justify-center rounded-md text-xs font-medium transition-colors ${t ? "bg-indigo-500/15 text-indigo-400 shadow-sm" : "text-canvas-text-secondary hover:bg-canvas-hover hover:text-canvas-text"}`,
											children: e
										}, e);
									})
								}),
								/* @__PURE__ */ (0, $.jsx)("div", {
									className: "grid grid-cols-3 gap-2",
									role: "radiogroup",
									"aria-label": e("应用窗口大小"),
									children: (Cr.find((e) => e.id === _) ?? Cr[0]).presets.map(({ w: t, h: n, label: r }) => {
										let i = b != null && Math.abs(b.w - t) <= 2 && Math.abs(b.h - n) <= 2;
										return /* @__PURE__ */ (0, $.jsxs)(W, {
											type: "button",
											role: "radio",
											"aria-checked": i,
											onClick: () => {
												wr(t, n);
											},
											className: `flex flex-col items-center gap-0.5 rounded-lg border px-2 py-2 transition-colors ${i ? "border-indigo-500 bg-indigo-500/10" : "border-canvas-border bg-canvas-card hover:border-canvas-hover"}`,
											children: [/* @__PURE__ */ (0, $.jsxs)("span", {
												className: `text-xs font-medium ${i ? "text-indigo-400" : "text-canvas-text"}`,
												children: [
													t,
													" × ",
													n
												]
											}), /* @__PURE__ */ (0, $.jsx)("span", {
												className: `text-[11px] ${i ? "text-indigo-400/70" : "text-canvas-text-muted"}`,
												children: e(r)
											})]
										}, `${t}x${n}`);
									})
								}),
								/* @__PURE__ */ (0, $.jsxs)("button", {
									type: "button",
									onClick: () => {
										d({ windowAspectLocked: !v }), f();
									},
									"aria-pressed": v,
									className: `sidebar-pref-card mt-2${v ? " is-floating" : ""}`,
									children: [
										/* @__PURE__ */ (0, $.jsx)("span", {
											className: `flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${v ? "bg-indigo-500/15 text-indigo-400" : "bg-canvas-surface text-canvas-text-secondary"}`,
											"aria-hidden": "true",
											children: /* @__PURE__ */ (0, $.jsx)(K, {
												icon: v ? "mdi:lock-outline" : "mdi:lock-open-variant-outline",
												width: "16",
												height: "16"
											})
										}),
										/* @__PURE__ */ (0, $.jsxs)("div", {
											className: "sidebar-pref-text",
											children: [/* @__PURE__ */ (0, $.jsx)("div", {
												className: "sidebar-pref-title",
												children: e("固定窗口比例")
											}), /* @__PURE__ */ (0, $.jsx)("div", {
												className: "sidebar-pref-desc",
												children: v ? e("拖拽缩放窗口时自动保持 {ratio}", { ratio: _ }) : e("拖拽缩放窗口时不限制宽高比")
											})]
										}),
										/* @__PURE__ */ (0, $.jsx)("div", {
											className: "sidebar-pref-switch",
											"aria-hidden": "true",
											children: /* @__PURE__ */ (0, $.jsx)("span", {})
										})
									]
								})
							] }),
							/* @__PURE__ */ (0, $.jsxs)("div", { children: [
								/* @__PURE__ */ (0, $.jsx)("h3", {
									className: "text-sm font-medium text-canvas-text mb-2",
									children: e("画布背景")
								}),
								/* @__PURE__ */ (0, $.jsx)("div", {
									className: "grid grid-cols-3 gap-2",
									children: _r.map(({ value: t, label: n, theme: r }) => /* @__PURE__ */ (0, $.jsxs)(W, {
										onClick: async () => {
											if (t === "custom") {
												u.customBackgroundUrl ? (d({
													canvasBackground: "custom",
													theme: u.customBackgroundIsDark ? u.theme : "light"
												}), await f()) : I.current?.click();
												return;
											}
											d({
												canvasBackground: t,
												theme: r
											}), F(null), await f();
										},
										className: `flex flex-col items-center gap-1.5 p-1 rounded-lg border transition-colors ${(u.canvasBackground || "default") === t ? "border-indigo-500 bg-indigo-500/10 text-indigo-400" : "border-canvas-border bg-canvas-card text-canvas-text-secondary hover:border-canvas-hover"}`,
										children: [/* @__PURE__ */ (0, $.jsxs)("div", {
											className: `w-full h-12 rounded overflow-hidden border border-canvas-border flex items-center justify-center ${t === "default" ? "bg-[#0a0a1a]" : t === "solar-system" ? "bg-gradient-to-br from-[#0a0a1a] via-[#1a1030] to-[#0a1020]" : t === "nebula" ? "bg-gradient-to-b from-[#0a0514] via-[#14081e] to-[#0a0514]" : t === "off-white" ? "bg-[#F4F6FB]" : t === "frosted-glass" ? "canvas-bg-frosted-preview" : t === "custom" ? u.customBackgroundUrl ? "" : "bg-canvas-surface" : "bg-black"}`,
											style: t === "custom" && u.customBackgroundUrl ? {
												backgroundImage: `url(${u.customBackgroundUrl})`,
												backgroundSize: "cover",
												backgroundPosition: "center"
											} : void 0,
											children: [
												t === "default" && /* @__PURE__ */ (0, $.jsx)("div", {
													className: "w-full h-full",
													style: {
														backgroundImage: "radial-gradient(circle, rgba(255,255,255,0.08) 1px, transparent 1px)",
														backgroundSize: "8px 8px"
													}
												}),
												t === "solar-system" && /* @__PURE__ */ (0, $.jsxs)("div", {
													className: "w-full h-full flex items-center justify-center relative",
													children: [/* @__PURE__ */ (0, $.jsx)("div", { className: "w-5 h-5 rounded-full bg-gradient-to-br from-purple-400 to-orange-400 opacity-80 shadow-lg shadow-orange-500/30" }), /* @__PURE__ */ (0, $.jsx)("div", {
														className: "absolute bottom-1 left-0 right-0 flex justify-center",
														children: /* @__PURE__ */ (0, $.jsx)("div", {
															className: "w-8 h-1 rounded-full",
															style: {
																borderRadius: "50% 50% 0 0",
																borderTop: "1px solid var(--white-alpha-15)"
															}
														})
													})]
												}),
												t === "nebula" && /* @__PURE__ */ (0, $.jsxs)("div", {
													className: "w-full h-full flex items-center justify-center gap-1.5 relative",
													children: [/* @__PURE__ */ (0, $.jsxs)("div", {
														className: "flex gap-1.5 opacity-60",
														children: [
															/* @__PURE__ */ (0, $.jsx)("div", { className: "w-2 h-3 rounded-sm bg-purple-600/60 blur-[2px]" }),
															/* @__PURE__ */ (0, $.jsx)("div", { className: "w-2 h-3 rounded-sm bg-fuchsia-600/50 blur-[2px]" }),
															/* @__PURE__ */ (0, $.jsx)("div", { className: "w-2 h-3 rounded-sm bg-violet-600/40 blur-[2px]" })
														]
													}), /* @__PURE__ */ (0, $.jsx)("div", {
														className: "absolute inset-0",
														style: {
															backgroundImage: "radial-gradient(1px 1px, rgba(180,150,255,0.3) 0%, transparent 100%)",
															backgroundSize: "12px 12px"
														}
													})]
												}),
												t === "off-white" && /* @__PURE__ */ (0, $.jsx)("div", {
													className: "w-full h-full",
													style: {
														backgroundImage: "radial-gradient(circle, rgba(0,0,0,0.06) 1px, transparent 1px)",
														backgroundSize: "8px 8px"
													}
												}),
												t === "custom" && !u.customBackgroundUrl && /* @__PURE__ */ (0, $.jsx)($.Fragment, { children: /* @__PURE__ */ (0, $.jsxs)("svg", {
													width: "18",
													height: "18",
													viewBox: "0 0 24 24",
													fill: "none",
													stroke: "currentColor",
													strokeWidth: "1.5",
													className: "text-canvas-text-muted",
													children: [
														/* @__PURE__ */ (0, $.jsx)("path", { d: "M21 15v4a2 2 0 01-2 2H5a2 2 0 01-2-2v-4" }),
														/* @__PURE__ */ (0, $.jsx)("polyline", { points: "17 8 12 3 7 8" }),
														/* @__PURE__ */ (0, $.jsx)("line", {
															x1: "12",
															y1: "3",
															x2: "12",
															y2: "15"
														})
													]
												}) })
											]
										}), /* @__PURE__ */ (0, $.jsx)("span", {
											className: "text-[11px] font-medium",
											children: e(n)
										})]
									}, t))
								}),
								u.canvasBackground === "custom" && u.customBackgroundUrl && /* @__PURE__ */ (0, $.jsx)("div", {
									className: "mt-3 bg-canvas-card border border-canvas-border rounded-lg p-2 space-y-3",
									children: /* @__PURE__ */ (0, $.jsxs)("div", {
										className: "flex items-center gap-3",
										children: [/* @__PURE__ */ (0, $.jsx)("div", {
											className: "w-20 h-14 rounded border border-canvas-border shrink-0",
											style: {
												backgroundImage: `url(${u.customBackgroundUrl})`,
												backgroundSize: "cover",
												backgroundPosition: "center"
											}
										}), /* @__PURE__ */ (0, $.jsxs)("div", {
											className: "flex-1 min-w-0 space-y-1.5",
											children: [
												/* @__PURE__ */ (0, $.jsxs)("div", {
													className: "flex items-center gap-2 flex-wrap",
													children: [/* @__PURE__ */ (0, $.jsx)(W, {
														type: "button",
														className: "settings-save-btn text-xs",
														onClick: () => I.current?.click(),
														disabled: M,
														children: e(M ? "识别中…" : "更换图片")
													}), /* @__PURE__ */ (0, $.jsx)(W, {
														type: "button",
														className: "text-xs px-3 py-1 rounded-md text-red-400 hover:bg-red-500/10 transition-colors",
														onClick: async () => {
															d({
																canvasBackground: "default",
																customBackgroundUrl: void 0,
																customBackgroundIsDark: void 0
															}), F(null), await f(), p(e("已恢复默认背景"));
														},
														children: e("移除背景")
													})]
												}),
												/* @__PURE__ */ (0, $.jsxs)("div", {
													className: "flex items-center gap-2",
													children: [/* @__PURE__ */ (0, $.jsx)("div", { className: `w-2 h-2 rounded-full shrink-0 ${P ? P.isDark ? "bg-indigo-400" : "bg-amber-400" : "bg-canvas-border"}` }), /* @__PURE__ */ (0, $.jsx)("span", {
														className: "text-[11px] text-canvas-text-secondary",
														children: P ? e("已识别为{tone}背景（亮度: {brightness}/255）", {
															tone: P.isDark ? e("深色") : e("浅色"),
															brightness: P.brightness
														}) : u.customBackgroundIsDark === void 0 ? e("未检测") : e("已识别为{tone}背景", { tone: u.customBackgroundIsDark ? e("深色") : e("浅色") })
													})]
												}),
												/* @__PURE__ */ (0, $.jsxs)("div", {
													className: "flex items-center gap-2",
													children: [
														/* @__PURE__ */ (0, $.jsx)("span", {
															className: "text-[11px] text-canvas-text-muted shrink-0",
															children: e("透明度")
														}),
														/* @__PURE__ */ (0, $.jsx)("input", {
															type: "range",
															min: "5",
															max: "100",
															value: Math.round((u.customBackgroundOpacity ?? .3) * 100),
															onChange: (e) => {
																d({ customBackgroundOpacity: Number(e.target.value) / 100 }), f();
															},
															className: "flex-1 h-1 accent-indigo-500 cursor-pointer"
														}),
														/* @__PURE__ */ (0, $.jsxs)("span", {
															className: "text-[11px] text-canvas-text-secondary w-8 text-right tabular-nums",
															children: [Math.round((u.customBackgroundOpacity ?? .3) * 100), "%"]
														})
													]
												})
											]
										})]
									})
								}),
								/* @__PURE__ */ (0, $.jsx)("input", {
									ref: I,
									type: "file",
									accept: "image/*",
									className: "hidden",
									onChange: async (t) => {
										let n = t.target.files?.[0];
										if (n) {
											if (!n.type.startsWith("image/")) {
												p(e("请选择图片文件"), "error");
												return;
											}
											N(!0), F(null);
											try {
												let t = await br(n), r = await vr(t.dataUrl);
												F(r), d({
													canvasBackground: "custom",
													customBackgroundUrl: t.dataUrl,
													customBackgroundIsDark: r.isDark,
													theme: r.isDark ? u.theme : "light"
												}), await f();
												let i = kr(t.compressedSize), a = t.keptOriginal ? e("（保留原图，重编码会增大）") : t.compressionRatio > 0 ? e("（缩减 {ratio}%，{format}）", {
													ratio: t.compressionRatio,
													format: t.format.toUpperCase()
												}) : e("（已最优，{format}）", { format: t.format.toUpperCase() });
												p(e("{tone}背景 · {size} {ratio}", {
													tone: r.isDark ? e("深色") : e("浅色"),
													size: i,
													ratio: a
												}), "success");
											} catch (t) {
												p(t instanceof Error ? t.message : e("背景图片处理失败"), "error");
											} finally {
												N(!1), I.current && (I.current.value = "");
											}
										}
									}
								})
							] }),
							!Or && /* @__PURE__ */ (0, $.jsxs)("section", {
								className: "canvas-interaction-settings",
								children: [
									/* @__PURE__ */ (0, $.jsxs)("div", {
										className: "canvas-interaction-heading",
										children: [/* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsx)("h3", { children: e("画布交互方式") }), /* @__PURE__ */ (0, $.jsx)("p", { children: e("选择更符合你操作习惯的画布手感") })] }), /* @__PURE__ */ (0, $.jsx)("span", { children: e("即时生效") })]
									}),
									/* @__PURE__ */ (0, $.jsx)("div", {
										className: "canvas-interaction-mode-grid",
										role: "radiogroup",
										"aria-label": e("画布交互方式"),
										children: Tr.map((t) => {
											let n = w === t.id;
											return /* @__PURE__ */ (0, $.jsxs)("button", {
												type: "button",
												role: "radio",
												"aria-checked": n,
												onClick: () => {
													d({ interactionMode: t.id }), f();
												},
												className: `canvas-interaction-mode-card${n ? " is-active" : ""}`,
												children: [
													/* @__PURE__ */ (0, $.jsxs)("div", {
														className: `canvas-interaction-preview is-${t.id}`,
														"aria-hidden": "true",
														children: [
															/* @__PURE__ */ (0, $.jsx)("span", { className: "canvas-preview-grid" }),
															/* @__PURE__ */ (0, $.jsx)("span", { className: "canvas-preview-node node-a" }),
															/* @__PURE__ */ (0, $.jsx)("span", { className: "canvas-preview-node node-b" }),
															t.id === "default" ? /* @__PURE__ */ (0, $.jsxs)($.Fragment, { children: [/* @__PURE__ */ (0, $.jsxs)("span", {
																className: "canvas-preview-selection",
																children: [
																	/* @__PURE__ */ (0, $.jsx)("i", {}),
																	/* @__PURE__ */ (0, $.jsx)("i", {}),
																	/* @__PURE__ */ (0, $.jsx)("i", {}),
																	/* @__PURE__ */ (0, $.jsx)("i", {})
																]
															}), /* @__PURE__ */ (0, $.jsx)("span", {
																className: "canvas-preview-cursor",
																children: "↖"
															})] }) : /* @__PURE__ */ (0, $.jsxs)($.Fragment, { children: [
																/* @__PURE__ */ (0, $.jsx)("span", { className: "canvas-preview-pan-axis axis-x" }),
																/* @__PURE__ */ (0, $.jsx)("span", { className: "canvas-preview-pan-axis axis-y" }),
																/* @__PURE__ */ (0, $.jsx)("span", {
																	className: "canvas-preview-hand",
																	children: "✥"
																})
															] })
														]
													}),
													/* @__PURE__ */ (0, $.jsxs)("div", {
														className: "canvas-interaction-mode-copy",
														children: [/* @__PURE__ */ (0, $.jsxs)("div", {
															className: "canvas-interaction-mode-title",
															children: [/* @__PURE__ */ (0, $.jsx)("strong", { children: e(t.title) }), /* @__PURE__ */ (0, $.jsx)("span", { children: e(t.badge) })]
														}), /* @__PURE__ */ (0, $.jsx)("p", { children: e(t.description) })]
													}),
													/* @__PURE__ */ (0, $.jsx)("span", {
														className: "canvas-interaction-check",
														"aria-hidden": "true",
														children: /* @__PURE__ */ (0, $.jsx)("svg", {
															width: "11",
															height: "11",
															viewBox: "0 0 12 12",
															fill: "none",
															children: /* @__PURE__ */ (0, $.jsx)("path", {
																d: "m2.4 6.1 2.1 2.1 5-5",
																stroke: "currentColor",
																strokeWidth: "1.7",
																strokeLinecap: "round",
																strokeLinejoin: "round"
															})
														})
													})
												]
											}, t.id);
										})
									}),
									/* @__PURE__ */ (0, $.jsxs)("div", {
										className: "canvas-interaction-gesture-map",
										children: [/* @__PURE__ */ (0, $.jsxs)("div", {
											className: "canvas-gesture-map-heading",
											children: [/* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsx)("span", { className: "canvas-gesture-status-dot" }), e("当前手势地图")] }), /* @__PURE__ */ (0, $.jsx)("strong", { children: e(k.title) })]
										}), /* @__PURE__ */ (0, $.jsx)("div", {
											className: "canvas-gesture-grid",
											children: k.gestures.map((t) => /* @__PURE__ */ (0, $.jsxs)("div", {
												className: "canvas-gesture-item",
												children: [/* @__PURE__ */ (0, $.jsx)("kbd", { children: e(t.key) }), /* @__PURE__ */ (0, $.jsx)("span", { children: e(t.action) })]
											}, t.key))
										})]
									})
								]
							}),
							/* @__PURE__ */ (0, $.jsxs)("section", { children: [/* @__PURE__ */ (0, $.jsx)("h3", {
								className: "mb-2 text-sm font-medium text-canvas-text",
								children: e("鼠标指针")
							}), /* @__PURE__ */ (0, $.jsxs)("button", {
								type: "button",
								onClick: () => {
									d({ customCursor: !y }), f();
								},
								"aria-pressed": y,
								className: `sidebar-pref-card${y ? " is-floating" : ""}`,
								children: [
									/* @__PURE__ */ (0, $.jsx)("span", {
										className: `flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${y ? "bg-indigo-500/15 text-indigo-400" : "bg-canvas-surface text-canvas-text-secondary"}`,
										"aria-hidden": "true",
										children: /* @__PURE__ */ (0, $.jsx)(K, {
											icon: "mdi:cursor-default-outline",
											width: "16",
											height: "16"
										})
									}),
									/* @__PURE__ */ (0, $.jsxs)("div", {
										className: "sidebar-pref-text",
										children: [/* @__PURE__ */ (0, $.jsx)("div", {
											className: "sidebar-pref-title",
											children: e("自定义指针样式")
										}), /* @__PURE__ */ (0, $.jsx)("div", {
											className: "sidebar-pref-desc",
											children: e(y ? "使用内置指针，跟随明暗主题自动切换黑白" : "使用系统默认指针")
										})]
									}),
									/* @__PURE__ */ (0, $.jsx)("div", {
										className: "sidebar-pref-switch",
										"aria-hidden": "true",
										children: /* @__PURE__ */ (0, $.jsx)("span", {})
									})
								]
							})] }),
							/* @__PURE__ */ (0, $.jsxs)("section", { children: [/* @__PURE__ */ (0, $.jsx)("h3", {
								className: "text-sm font-medium text-canvas-text mb-2",
								children: e("节点工具栏")
							}), /* @__PURE__ */ (0, $.jsx)("div", {
								className: "grid grid-cols-2 gap-1 rounded-lg border border-canvas-border bg-canvas-card p-1",
								role: "radiogroup",
								"aria-label": e("节点工具栏显示方式"),
								children: Er.map((t) => {
									let n = T === t.id;
									return /* @__PURE__ */ (0, $.jsxs)(W, {
										type: "button",
										role: "radio",
										"aria-checked": n,
										onClick: async () => {
											d({ nodeToolbarMode: t.id }), await f();
										},
										className: `flex h-9 items-center justify-center gap-2 rounded-md text-xs font-medium transition-colors ${n ? "bg-indigo-500/15 text-indigo-400 shadow-sm" : "text-canvas-text-secondary hover:bg-canvas-hover hover:text-canvas-text"}`,
										children: [/* @__PURE__ */ (0, $.jsx)(K, {
											icon: t.icon,
											width: "14",
											height: "14",
											"aria-hidden": "true"
										}), /* @__PURE__ */ (0, $.jsx)("span", { children: e(t.label) })]
									}, t.id);
								})
							})] }),
							/* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsx)("h3", {
								className: "text-sm font-medium text-canvas-text mb-2",
								children: e("画布笔记工具栏")
							}), /* @__PURE__ */ (0, $.jsxs)("button", {
								type: "button",
								onClick: () => {
									d({ canvasNoteToolbarVisible: !D }), f();
								},
								"aria-pressed": D,
								className: `sidebar-pref-card${D ? " is-floating" : ""}`,
								children: [
									/* @__PURE__ */ (0, $.jsx)("div", {
										className: "sidebar-pref-window flex items-end justify-center pb-2",
										"aria-hidden": "true",
										children: /* @__PURE__ */ (0, $.jsxs)("div", {
											className: `flex items-center gap-1 rounded-md border border-canvas-border bg-canvas-bg p-1 transition-opacity duration-200 ${D ? "opacity-100" : "opacity-30"}`,
											children: [
												/* @__PURE__ */ (0, $.jsx)("span", { className: "h-3 w-3 rounded-[3px] bg-indigo-400/60" }),
												/* @__PURE__ */ (0, $.jsx)("span", { className: "h-3 w-3 rounded-[3px] border border-canvas-text-muted" }),
												/* @__PURE__ */ (0, $.jsx)("span", { className: "h-3 w-3 rounded-full border border-canvas-text-muted" })
											]
										})
									}),
									/* @__PURE__ */ (0, $.jsxs)("div", {
										className: "sidebar-pref-text",
										children: [/* @__PURE__ */ (0, $.jsx)("div", {
											className: "sidebar-pref-title",
											children: e("显示笔记工具栏")
										}), /* @__PURE__ */ (0, $.jsx)("div", {
											className: "sidebar-pref-desc",
											children: e(D ? "在画布左下角显示绘图与笔记工具" : "隐藏工具栏，已有笔记仍可编辑")
										})]
									}),
									/* @__PURE__ */ (0, $.jsx)("div", {
										className: "sidebar-pref-switch",
										"aria-hidden": "true",
										children: /* @__PURE__ */ (0, $.jsx)("span", {})
									})
								]
							})] }),
							/* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsx)("h3", {
								className: "text-sm font-medium text-canvas-text mb-2",
								children: e("节点标题")
							}), /* @__PURE__ */ (0, $.jsxs)("button", {
								type: "button",
								onClick: () => {
									d({ nodeLabelVisible: !E }), f();
								},
								"aria-pressed": E,
								className: `sidebar-pref-card${E ? " is-floating" : ""}`,
								children: [
									/* @__PURE__ */ (0, $.jsx)("div", {
										className: "sidebar-pref-window flex items-center justify-center pt-2",
										"aria-hidden": "true",
										children: /* @__PURE__ */ (0, $.jsxs)("div", {
											className: "relative w-[52px]",
											children: [/* @__PURE__ */ (0, $.jsxs)("div", {
												className: `absolute -top-[9px] left-0 right-0 flex items-center gap-1 transition-opacity duration-200 ${E ? "opacity-100" : "opacity-0"}`,
												children: [/* @__PURE__ */ (0, $.jsx)("span", { className: "h-1.5 w-1.5 shrink-0 rounded-[2px] bg-indigo-400/70" }), /* @__PURE__ */ (0, $.jsx)("span", { className: "h-1 flex-1 rounded-full bg-canvas-border" })]
											}), /* @__PURE__ */ (0, $.jsx)("div", { className: "h-7 w-full rounded-[5px] border border-canvas-border bg-canvas-bg" })]
										})
									}),
									/* @__PURE__ */ (0, $.jsxs)("div", {
										className: "sidebar-pref-text",
										children: [/* @__PURE__ */ (0, $.jsx)("div", {
											className: "sidebar-pref-title",
											children: e("显示节点标题")
										}), /* @__PURE__ */ (0, $.jsx)("div", {
											className: "sidebar-pref-desc",
											children: e(E ? "节点上方显示类型图标与名称，双击可重命名" : "隐藏节点上方的标题栏，画布更简洁")
										})]
									}),
									/* @__PURE__ */ (0, $.jsx)("div", {
										className: "sidebar-pref-switch",
										"aria-hidden": "true",
										children: /* @__PURE__ */ (0, $.jsx)("span", {})
									})
								]
							})] }),
							/* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsx)("h3", {
								className: "text-sm font-medium text-canvas-text mb-2",
								children: e("窗口外观")
							}), /* @__PURE__ */ (0, $.jsxs)("button", {
								type: "button",
								onClick: () => {
									d({ windowGlassFrame: !h }), f();
								},
								disabled: g,
								"aria-pressed": S,
								className: `sidebar-pref-card${S ? " is-floating" : ""}`,
								children: [
									/* @__PURE__ */ (0, $.jsx)("div", {
										className: `sidebar-pref-window overflow-hidden${S ? " glass-bevel" : ""}`,
										"aria-hidden": "true",
										children: /* @__PURE__ */ (0, $.jsxs)("div", {
											className: `absolute flex items-center gap-2 overflow-hidden border border-canvas-border bg-canvas-bg px-2 transition-[inset,border-radius] duration-200 ${S ? "inset-[5px] rounded-[5px]" : "inset-0 rounded-[8px]"}`,
											children: [/* @__PURE__ */ (0, $.jsx)("span", { className: "h-6 w-1.5 shrink-0 rounded-sm bg-indigo-400/35" }), /* @__PURE__ */ (0, $.jsx)("span", { className: "h-1 flex-1 rounded-full bg-canvas-border" })]
										})
									}),
									/* @__PURE__ */ (0, $.jsxs)("div", {
										className: "sidebar-pref-text",
										children: [/* @__PURE__ */ (0, $.jsx)("div", {
											className: "sidebar-pref-title",
											children: e("玻璃外框")
										}), /* @__PURE__ */ (0, $.jsx)("div", {
											className: "sidebar-pref-desc",
											children: e(g ? "性能模式下已关闭玻璃外框" : S ? "显示 5px 玻璃带与双层边缘高光" : "内容贴合窗口边缘，不显示外框")
										})]
									}),
									/* @__PURE__ */ (0, $.jsx)("div", {
										className: "sidebar-pref-switch",
										"aria-hidden": "true",
										children: /* @__PURE__ */ (0, $.jsx)("span", {})
									})
								]
							})] }),
							/* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsx)("h3", {
								className: "text-sm font-medium text-canvas-text mb-2",
								children: e("图形与性能")
							}), /* @__PURE__ */ (0, $.jsxs)("button", {
								type: "button",
								onClick: () => {
									d({ performanceMode: !g }), f();
								},
								"aria-pressed": g,
								className: `sidebar-pref-card${g ? " is-floating" : ""}`,
								children: [
									/* @__PURE__ */ (0, $.jsx)("div", {
										className: "sidebar-pref-window overflow-hidden",
										"aria-hidden": "true",
										children: /* @__PURE__ */ (0, $.jsxs)("div", {
											className: `absolute inset-[5px] rounded-[5px] border border-canvas-border px-2 py-1.5 transition-colors duration-200 ${g ? "bg-canvas-surface" : "bg-canvas-surface/60 backdrop-blur-md"}`,
											children: [/* @__PURE__ */ (0, $.jsx)("span", { className: "block h-1 w-2/3 rounded-full bg-canvas-text-muted/50" }), /* @__PURE__ */ (0, $.jsx)("span", { className: "mt-1.5 block h-3 rounded-[3px] bg-indigo-500/20" })]
										})
									}),
									/* @__PURE__ */ (0, $.jsxs)("div", {
										className: "sidebar-pref-text",
										children: [/* @__PURE__ */ (0, $.jsxs)("div", {
											className: "flex flex-wrap items-center gap-1.5",
											children: [/* @__PURE__ */ (0, $.jsx)("div", {
												className: "sidebar-pref-title",
												children: e("性能模式")
											}), /* @__PURE__ */ (0, $.jsx)("span", {
												className: "rounded-full border border-amber-400/30 bg-amber-500/10 px-1.5 py-0.5 text-[9px] font-medium leading-none text-amber-300",
												children: e("卡顿或页面显示不全时开启")
											})]
										}), /* @__PURE__ */ (0, $.jsx)("div", {
											className: "sidebar-pref-desc",
											children: e(g ? "已关闭毛玻璃、自定义圆角、玻璃外框和装饰动画，保留 Windows 默认圆角" : "保留完整视觉效果与界面动画")
										})]
									}),
									/* @__PURE__ */ (0, $.jsx)("div", {
										className: "sidebar-pref-switch",
										"aria-hidden": "true",
										children: /* @__PURE__ */ (0, $.jsx)("span", {})
									})
								]
							})] }),
							/* @__PURE__ */ (0, $.jsxs)("div", { children: [/* @__PURE__ */ (0, $.jsx)("h3", {
								className: "text-sm font-medium text-canvas-text mb-2",
								children: e("侧边栏")
							}), /* @__PURE__ */ (0, $.jsxs)("button", {
								type: "button",
								onClick: () => {
									d({ sidebarFloating: !m }), f();
								},
								"aria-pressed": m,
								className: `sidebar-pref-card${m ? " is-floating" : ""}`,
								children: [
									/* @__PURE__ */ (0, $.jsxs)("div", {
										className: "sidebar-pref-window",
										"aria-hidden": "true",
										children: [/* @__PURE__ */ (0, $.jsxs)("div", {
											className: "sidebar-pref-content",
											children: [
												/* @__PURE__ */ (0, $.jsx)("span", {}),
												/* @__PURE__ */ (0, $.jsx)("span", {}),
												/* @__PURE__ */ (0, $.jsx)("span", {})
											]
										}), /* @__PURE__ */ (0, $.jsx)("div", { className: "sidebar-pref-bar" })]
									}),
									/* @__PURE__ */ (0, $.jsxs)("div", {
										className: "sidebar-pref-text",
										children: [/* @__PURE__ */ (0, $.jsx)("div", {
											className: "sidebar-pref-title",
											children: e("悬浮显示")
										}), /* @__PURE__ */ (0, $.jsx)("div", {
											className: "sidebar-pref-desc",
											children: e(m ? "侧边栏半隐于窗口边缘，悬浮在画布之上" : "侧边栏停靠在窗口内侧")
										})]
									}),
									/* @__PURE__ */ (0, $.jsx)("div", {
										className: "sidebar-pref-switch",
										"aria-hidden": "true",
										children: /* @__PURE__ */ (0, $.jsx)("span", {})
									})
								]
							})] })
						]
					}),
					L === "files" && /* @__PURE__ */ (0, $.jsx)(wn, { active: !0 }),
					L === "shortcuts" && /* @__PURE__ */ (0, $.jsx)(bn, {}),
					L === "storage" && /* @__PURE__ */ (0, $.jsxs)($.Fragment, { children: [/* @__PURE__ */ (0, $.jsx)(sn, {}), /* @__PURE__ */ (0, $.jsx)(ln, {})] }),
					L === "mcp" && /* @__PURE__ */ (0, $.jsx)(mn, {}),
					L === "plugins" && /* @__PURE__ */ (0, $.jsx)(gr, {})
				]
			})]
		})]
	});
}
//#endregion
export { Ar as default };
