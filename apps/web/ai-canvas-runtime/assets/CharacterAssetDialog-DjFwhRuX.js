import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./jsx-runtime-BAkIPmuO.js";
import { si as r, t as i, w as a } from "./useAppStore-BH-MdRLu.js";
import { S as o, d as s, n as c, t as l } from "./fileService-BawXHbsK.js";
import { t as u } from "./num-vBm-9Bix.js";
import { i as d } from "./dramaAssetExtract-TP_lzZcC.js";
import { t as f } from "./ModalOverlay-B0YAfIbK.js";
import { Nt as p, qt as m } from "./useTooltipAutoPlacement-D1FArkVS.js";
import { n as h } from "./rasterImageDimensions-CX1VK2cM.js";
import { a as ee, i as te, n as g, o as _, r as v, t as y } from "./characterReferencePresentation-BVclYgC2.js";
//#region src/components/character/characterVoiceMedia.ts
var b = /* @__PURE__ */ e(t(), 1);
function x(e) {
	return new Promise((t, n) => {
		let r = new FileReader();
		r.onload = () => typeof r.result == "string" ? t(r.result) : n(/* @__PURE__ */ Error("音频读取失败")), r.onerror = () => n(r.error ?? /* @__PURE__ */ Error("音频读取失败")), r.readAsDataURL(e);
	});
}
function S(e) {
	return new Promise((t) => {
		let n = new Audio(), r = (e) => {
			n.onloadedmetadata = null, n.onerror = null, t(e);
		};
		n.onloadedmetadata = () => r(Number.isFinite(n.duration) && n.duration > 0 ? n.duration : void 0), n.onerror = () => r(void 0), n.preload = "metadata", n.src = e;
	});
}
//#endregion
//#region src/components/CharacterAssetDialog.tsx
var C = n(), ne = Object.entries(y), w = Object.entries(g), T = 16, E = 16, D = [
	["standing", "站立"],
	["walking", "行走"],
	["running", "奔跑"],
	["jumping", "跳跃"],
	["sitting", "坐姿"],
	["crouching", "蹲伏"],
	["lying", "躺卧"],
	["climbing", "攀爬"],
	["swimming", "游泳"],
	["attacking", "攻击"],
	["defending", "防御"],
	["hit", "受击"],
	["death", "死亡"],
	["casting", "施法"],
	["interacting", "互动"],
	["dancing", "舞蹈"],
	["expression", "表情动作"],
	["custom", "自定义"]
];
function O(e) {
	if (!e) return null;
	let t = e.data, n = t.fileName || t.label || "画布动作素材", i = Date.now();
	if (t.videoUrl) {
		let e = (t.fileName || t.filePath || t.videoUrl).split(/[?#]/, 1)[0].split(".").pop()?.toLowerCase();
		return {
			id: `action-media-${r()}`,
			kind: "video",
			name: n,
			mimeType: e === "webm" ? "video/webm" : e === "mov" ? "video/quicktime" : e === "m4v" ? "video/x-m4v" : "video/mp4",
			assetId: t.assetId,
			relativePath: t.relativePath,
			filePath: t.filePath,
			url: t.videoUrl,
			createdAt: i,
			updatedAt: i
		};
	}
	let a = t.imageUrl || t.thumbnailUrl;
	if (!a) return null;
	let o = [
		t.fileName,
		t.filePath,
		a
	].filter((e) => typeof e == "string").join(" "), s = /\.gif(?:[?#]|$)/i.test(o) || a.startsWith("data:image/gif"), c = (t.fileName || t.filePath || a).split(/[?#]/, 1)[0].split(".").pop()?.toLowerCase(), l = a.match(/^data:(image\/[^;,]+)/i)?.[1]?.toLowerCase(), u = s ? "image/gif" : l ?? (c === "jpg" || c === "jpeg" ? "image/jpeg" : c === "webp" ? "image/webp" : c === "avif" ? "image/avif" : "image/png");
	return {
		id: `action-media-${r()}`,
		kind: s ? "gif" : "image",
		name: n,
		mimeType: u,
		assetId: t.assetId,
		relativePath: t.relativePath,
		filePath: t.filePath,
		url: a,
		createdAt: i,
		updatedAt: i
	};
}
function re() {
	let e = Date.now();
	return {
		id: `character-${r()}`,
		kind: "character",
		name: "",
		key: "",
		identity: "",
		summary: "",
		visualNotes: "",
		importance: "supporting",
		confirmed: !0,
		createdAt: e,
		updatedAt: e,
		source: "manual",
		referenceImages: [],
		voiceClips: []
	};
}
function k(e) {
	return {
		...e,
		relationships: e.relationships?.map((e) => ({ ...e })),
		referenceImages: e.referenceImages?.map((e) => ({ ...e })) ?? [],
		voiceClips: e.voiceClips?.map((e) => ({ ...e })) ?? [],
		avatarCrop: e.avatarCrop ? { ...e.avatarCrop } : void 0
	};
}
function ie(e) {
	return new Promise((t, n) => {
		let r = new FileReader();
		r.onload = () => typeof r.result == "string" ? t(r.result) : n(/* @__PURE__ */ Error("图片读取失败")), r.onerror = () => n(r.error ?? /* @__PURE__ */ Error("图片读取失败")), r.readAsDataURL(e);
	});
}
function A({ reference: e, crop: t, onChange: n }) {
	let [r, i] = (0, b.useState)(1), [a, o] = (0, b.useState)(1.35), [s, c] = (0, b.useState)(.5), [l, d] = (0, b.useState)(.38), f = (0, b.useRef)(null), p = (e, t, n, i = r) => {
		let { baseWidth: a, baseHeight: o } = v(i), s = u(a / e, .04, 1), c = u(o / e, .04, 1);
		return {
			x: u(t * (1 - s), 0, 1 - s),
			y: u(n * (1 - c), 0, 1 - c),
			width: s,
			height: c
		};
	}, m = (r) => {
		let a = r.currentTarget, s = a.naturalWidth / Math.max(1, a.naturalHeight);
		if (i(s), f.current !== e.id) {
			if (f.current = e.id, t) {
				let { baseWidth: e, baseHeight: n } = v(s);
				o(u(Math.min(e / t.width, n / t.height), 1, 3)), c(t.width >= 1 ? .5 : t.x / (1 - t.width)), d(t.height >= 1 ? .5 : t.y / (1 - t.height));
				return;
			}
			n(p(1.35, .5, .38, s));
		}
	}, h = (e = a, t = s, r = l) => {
		o(e), c(t), d(r), n(p(e, t, r));
	};
	return /* @__PURE__ */ (0, C.jsxs)("div", {
		className: "character-crop-editor",
		children: [/* @__PURE__ */ (0, C.jsxs)("div", {
			className: "character-crop-preview",
			"aria-label": "头像裁切预览",
			children: [e.imageUrl ? /* @__PURE__ */ (0, C.jsx)("img", {
				src: e.imageUrl,
				alt: "",
				draggable: !1,
				onLoad: m,
				style: te(t)
			}) : null, /* @__PURE__ */ (0, C.jsx)("span", {
				className: "character-crop-frame",
				"aria-hidden": "true"
			})]
		}), /* @__PURE__ */ (0, C.jsxs)("div", {
			className: "character-crop-controls",
			children: [
				/* @__PURE__ */ (0, C.jsxs)("label", { children: [/* @__PURE__ */ (0, C.jsx)("span", { children: "水平" }), /* @__PURE__ */ (0, C.jsx)("input", {
					type: "range",
					min: "0",
					max: "1",
					step: "0.01",
					value: s,
					onChange: (e) => h(a, Number(e.target.value), l)
				})] }),
				/* @__PURE__ */ (0, C.jsxs)("label", { children: [/* @__PURE__ */ (0, C.jsx)("span", { children: "垂直" }), /* @__PURE__ */ (0, C.jsx)("input", {
					type: "range",
					min: "0",
					max: "1",
					step: "0.01",
					value: l,
					onChange: (e) => h(a, s, Number(e.target.value))
				})] }),
				/* @__PURE__ */ (0, C.jsxs)("label", { children: [/* @__PURE__ */ (0, C.jsx)("span", { children: "缩放" }), /* @__PURE__ */ (0, C.jsx)("input", {
					type: "range",
					min: "1",
					max: "3",
					step: "0.01",
					value: a,
					onChange: (e) => h(Number(e.target.value), s, l)
				})] })
			]
		})]
	});
}
function j({ isOpen: e, sourceNodeId: t, initialScope: n, initialCharacterId: r, onClose: o }) {
	let { sourceNode: s, projectCharacters: c, globalCharacters: l, loadGlobalCharacters: u, captureImageNodeToCharacter: ee, addCharacterAction: te, addCharacterActionMedia: g, showToast: _ } = i(m((e) => ({
		sourceNode: e.nodes.find((e) => e.id === t),
		projectCharacters: e.dramaAssets.characters,
		globalCharacters: e.globalCharacters,
		loadGlobalCharacters: e.loadGlobalCharacters,
		captureImageNodeToCharacter: e.captureImageNodeToCharacter,
		addCharacterAction: e.addCharacterAction,
		addCharacterActionMedia: e.addCharacterActionMedia,
		showToast: e.showToast
	}))), v = a(s) ? s?.data.imageUrl ?? s?.data.thumbnailUrl : void 0, y = (0, b.useMemo)(() => O(s), [s]), [x, S] = (0, b.useState)(v ? "reference" : y ? "action" : "reference"), [w, T] = (0, b.useState)(n ?? "project"), [E, k] = (0, b.useState)(r ? "existing" : "new"), [ie, A] = (0, b.useState)(r ?? (n === "global" ? l[0]?.id : c[0]?.id) ?? ""), [j, M] = (0, b.useState)(s?.data.label || ""), [N, P] = (0, b.useState)(""), [F, I] = (0, b.useState)(""), [L, R] = (0, b.useState)("primary"), [z, ae] = (0, b.useState)(s?.data.prompt ?? ""), [B, V] = (0, b.useState)(!0), [H, U] = (0, b.useState)("new"), [W, G] = (0, b.useState)(""), [K, oe] = (0, b.useState)("standing"), [q, se] = (0, b.useState)(""), [J, ce] = (0, b.useState)(s?.data.label || ""), [le, ue] = (0, b.useState)(s?.data.prompt ?? ""), [de, Y] = (0, b.useState)(!1);
	(0, b.useEffect)(() => {
		w === "global" && u();
	}, [u, w]);
	let X = w === "project" ? c : l, Z = X.some((e) => e.id === ie) ? ie : X[0]?.id ?? "", fe = X.find((e) => e.id === Z), Q = fe?.actions ?? [], $ = Q.some((e) => e.id === W) ? W : Q[0]?.id ?? "", pe = (e) => {
		let t = e === "project" ? c : l;
		T(e), A(t[0]?.id ?? ""), G(""), x === "reference" && k((e) => e === "existing" && t.length === 0 ? "new" : e);
	}, me = (e) => {
		S(e), e === "action" && k("existing");
	}, he = async () => {
		if (!s) {
			_("无法读取来源节点", "error");
			return;
		}
		if (x === "action") {
			if (!y) {
				_("该节点没有可用的图片、GIF 或视频", "error");
				return;
			}
			if (!Z || !fe) {
				_("请选择要添加到的角色", "error");
				return;
			}
			Y(!0);
			let e;
			if (H === "existing") {
				if (!$) {
					Y(!1), _("请选择已有动作", "error");
					return;
				}
				if (Q.find((e) => e.id === $)?.media?.some((e) => !!(y.assetId && e.assetId === y.assetId) || !!(y.filePath && e.filePath === y.filePath) || e.url === y.url)) {
					Y(!1), _("该节点已经添加到这个动作");
					return;
				}
				e = await g(w, Z, $, [y]);
			} else {
				let t = J.trim();
				if (!t) {
					Y(!1), _("请填写动作名称", "error");
					return;
				}
				if (K === "custom" && !q.trim()) {
					Y(!1), _("请填写自定义分类名", "error");
					return;
				}
				e = !!await te(w, Z, {
					category: K,
					customCategory: K === "custom" ? q.trim() : void 0,
					name: t,
					prompt: le.trim(),
					media: [y]
				});
			}
			if (Y(!1), !e) return;
			_(`已添加到「${fe.name}」的动作库`), o();
			return;
		}
		if (!v) {
			_("该节点没有可用的角色图片", "error");
			return;
		}
		let e;
		if (E === "new") {
			let t = j.trim();
			if (!t) {
				_("请填写角色名称", "error");
				return;
			}
			e = {
				...re(),
				name: t,
				key: d(t),
				identity: N.trim(),
				summary: F.trim()
			};
		} else if (!Z) {
			_("请选择角色", "error");
			return;
		}
		Y(!0);
		let n = await ee({
			nodeId: t,
			scope: w,
			characterId: E === "existing" ? Z : void 0,
			newCharacter: e,
			kind: L,
			prompt: z.trim(),
			hideNode: B
		});
		Y(!1), n && (_(B ? "已添加到角色库，画布节点已隐藏" : "已添加到角色库"), o());
	};
	return /* @__PURE__ */ (0, C.jsxs)(f, {
		isOpen: e,
		onClose: o,
		ariaLabel: "添加到角色库",
		className: "character-capture-dialog",
		children: [
			/* @__PURE__ */ (0, C.jsxs)("header", {
				className: "character-dialog-header",
				children: [/* @__PURE__ */ (0, C.jsxs)("div", { children: [/* @__PURE__ */ (0, C.jsx)("h2", { children: "添加到角色库" }), /* @__PURE__ */ (0, C.jsx)("p", { children: s?.data.label || "画布节点" })] }), /* @__PURE__ */ (0, C.jsx)(p, { onClick: o })]
			}),
			/* @__PURE__ */ (0, C.jsxs)("div", {
				className: "flex gap-1 border-b border-canvas-border px-4 py-2",
				role: "tablist",
				"aria-label": "添加类型",
				children: [/* @__PURE__ */ (0, C.jsxs)("button", {
					type: "button",
					role: "tab",
					"aria-selected": x === "reference",
					disabled: !v,
					className: `flex min-h-8 items-center gap-1.5 rounded-md px-3 text-[11px] transition-[color,background-color,transform] duration-150 ease-out active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40 ${x === "reference" ? "bg-canvas-hover text-canvas-text" : "text-canvas-text-muted hover:text-canvas-text"}`,
					onClick: () => me("reference"),
					children: [/* @__PURE__ */ (0, C.jsx)(h, {
						icon: "lucide:image",
						width: "14",
						height: "14",
						"aria-hidden": "true"
					}), "形象参考"]
				}), /* @__PURE__ */ (0, C.jsxs)("button", {
					type: "button",
					role: "tab",
					"aria-selected": x === "action",
					disabled: !y,
					className: `flex min-h-8 items-center gap-1.5 rounded-md px-3 text-[11px] transition-[color,background-color,transform] duration-150 ease-out active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-40 ${x === "action" ? "bg-canvas-hover text-canvas-text" : "text-canvas-text-muted hover:text-canvas-text"}`,
					onClick: () => me("action"),
					children: [/* @__PURE__ */ (0, C.jsx)(h, {
						icon: "lucide:film",
						width: "14",
						height: "14",
						"aria-hidden": "true"
					}), "动作素材"]
				})]
			}),
			/* @__PURE__ */ (0, C.jsxs)("div", {
				className: "character-capture-body",
				children: [/* @__PURE__ */ (0, C.jsxs)("section", {
					className: "character-capture-preview",
					"aria-label": x === "reference" ? "待添加图片" : "待添加动作素材",
					children: [/* @__PURE__ */ (0, C.jsx)("div", {
						className: "grid min-h-80 w-full place-items-center overflow-hidden rounded-lg border border-canvas-border bg-canvas-bg/70 p-1 max-[920px]:mx-auto max-[920px]:max-w-[360px]",
						children: x === "action" && y?.kind === "video" ? /* @__PURE__ */ (0, C.jsx)("video", {
							src: y.url,
							className: "max-h-[min(62vh,720px)] max-w-full object-contain",
							controls: !0,
							muted: !0,
							playsInline: !0,
							preload: "metadata"
						}) : x === "action" && y?.url ? /* @__PURE__ */ (0, C.jsx)("img", {
							src: y.url,
							alt: "",
							className: "block max-h-[min(62vh,720px)] max-w-full object-contain",
							draggable: !1
						}) : v ? /* @__PURE__ */ (0, C.jsx)("img", {
							src: v,
							alt: "",
							className: "block max-h-[min(62vh,720px)] max-w-full object-contain",
							draggable: !1
						}) : /* @__PURE__ */ (0, C.jsx)(h, {
							icon: "lucide:file-x",
							width: "28",
							height: "28",
							"aria-hidden": "true"
						})
					}), /* @__PURE__ */ (0, C.jsxs)("div", { children: [/* @__PURE__ */ (0, C.jsx)("span", { children: "来源节点" }), /* @__PURE__ */ (0, C.jsx)("strong", { children: s?.data.label || "画布节点" })] })]
				}), /* @__PURE__ */ (0, C.jsxs)("section", {
					className: "character-capture-options",
					"aria-label": x === "reference" ? "角色与参考图信息" : "角色与动作信息",
					children: [/* @__PURE__ */ (0, C.jsxs)("div", {
						className: "character-capture-group",
						children: [/* @__PURE__ */ (0, C.jsx)("span", {
							className: "character-capture-label",
							children: "保存范围"
						}), /* @__PURE__ */ (0, C.jsxs)("div", {
							className: "character-capture-segmented",
							role: "tablist",
							"aria-label": "保存范围",
							children: [/* @__PURE__ */ (0, C.jsx)("button", {
								type: "button",
								role: "tab",
								"aria-selected": w === "project",
								className: w === "project" ? "is-active" : "",
								onClick: () => pe("project"),
								children: "本项目"
							}), /* @__PURE__ */ (0, C.jsx)("button", {
								type: "button",
								role: "tab",
								"aria-selected": w === "global",
								className: w === "global" ? "is-active" : "",
								onClick: () => pe("global"),
								children: "全局资产"
							})]
						})]
					}), x === "reference" ? /* @__PURE__ */ (0, C.jsxs)(C.Fragment, { children: [
						/* @__PURE__ */ (0, C.jsxs)("div", {
							className: "character-capture-group",
							children: [/* @__PURE__ */ (0, C.jsx)("span", {
								className: "character-capture-label",
								children: "添加方式"
							}), /* @__PURE__ */ (0, C.jsxs)("div", {
								className: "character-capture-segmented",
								role: "tablist",
								"aria-label": "添加方式",
								children: [/* @__PURE__ */ (0, C.jsx)("button", {
									type: "button",
									role: "tab",
									"aria-selected": E === "new",
									className: E === "new" ? "is-active" : "",
									onClick: () => k("new"),
									children: "新建角色"
								}), /* @__PURE__ */ (0, C.jsx)("button", {
									type: "button",
									role: "tab",
									"aria-selected": E === "existing",
									className: E === "existing" ? "is-active" : "",
									disabled: X.length === 0,
									onClick: () => k("existing"),
									children: "已有角色"
								})]
							})]
						}),
						E === "existing" ? /* @__PURE__ */ (0, C.jsxs)("label", {
							className: "character-field character-field-wide",
							children: [/* @__PURE__ */ (0, C.jsx)("span", { children: "添加到角色" }), /* @__PURE__ */ (0, C.jsx)("select", {
								autoFocus: !0,
								value: Z,
								onChange: (e) => A(e.target.value),
								children: X.map((e) => /* @__PURE__ */ (0, C.jsx)("option", {
									value: e.id,
									children: e.name
								}, e.id))
							})]
						}) : /* @__PURE__ */ (0, C.jsxs)("div", {
							className: "character-capture-new-fields",
							children: [
								/* @__PURE__ */ (0, C.jsxs)("label", {
									className: "character-field character-field-wide",
									children: [/* @__PURE__ */ (0, C.jsx)("span", { children: "角色名称" }), /* @__PURE__ */ (0, C.jsx)("input", {
										autoFocus: !0,
										value: j,
										onChange: (e) => M(e.target.value),
										placeholder: "例如：沈砚"
									})]
								}),
								/* @__PURE__ */ (0, C.jsxs)("label", {
									className: "character-field",
									children: [/* @__PURE__ */ (0, C.jsx)("span", { children: "身份" }), /* @__PURE__ */ (0, C.jsx)("input", {
										value: N,
										onChange: (e) => P(e.target.value),
										placeholder: "职业或身份"
									})]
								}),
								/* @__PURE__ */ (0, C.jsxs)("label", {
									className: "character-field character-field-wide",
									children: [/* @__PURE__ */ (0, C.jsx)("span", { children: "简介" }), /* @__PURE__ */ (0, C.jsx)("textarea", {
										value: F,
										onChange: (e) => I(e.target.value),
										rows: 2,
										placeholder: "角色背景与核心特征"
									})]
								})
							]
						}),
						/* @__PURE__ */ (0, C.jsxs)("div", {
							className: "character-capture-reference-fields",
							children: [/* @__PURE__ */ (0, C.jsxs)("label", {
								className: "character-field",
								children: [/* @__PURE__ */ (0, C.jsx)("span", { children: "图片用途" }), /* @__PURE__ */ (0, C.jsx)("select", {
									value: L,
									onChange: (e) => R(e.target.value),
									children: ne.map(([e, t]) => /* @__PURE__ */ (0, C.jsx)("option", {
										value: e,
										children: t
									}, e))
								})]
							}), /* @__PURE__ */ (0, C.jsxs)("label", {
								className: "character-field character-field-wide",
								children: [/* @__PURE__ */ (0, C.jsx)("span", { children: "图片提示词" }), /* @__PURE__ */ (0, C.jsx)("textarea", {
									value: z,
									onChange: (e) => ae(e.target.value),
									rows: 3,
									placeholder: "记录生成该形象时使用的提示词"
								})]
							})]
						}),
						/* @__PURE__ */ (0, C.jsxs)("label", {
							className: "character-capture-hide-option",
							children: [/* @__PURE__ */ (0, C.jsx)("input", {
								type: "checkbox",
								checked: B,
								onChange: (e) => V(e.target.checked)
							}), /* @__PURE__ */ (0, C.jsx)("span", { children: "添加后隐藏画布节点" })]
						})
					] }) : /* @__PURE__ */ (0, C.jsxs)(C.Fragment, { children: [
						/* @__PURE__ */ (0, C.jsxs)("label", {
							className: "character-field character-field-wide",
							children: [/* @__PURE__ */ (0, C.jsx)("span", { children: "添加到角色" }), /* @__PURE__ */ (0, C.jsxs)("select", {
								autoFocus: !0,
								value: Z,
								disabled: X.length === 0,
								onChange: (e) => {
									A(e.target.value), G("");
								},
								children: [X.length === 0 ? /* @__PURE__ */ (0, C.jsx)("option", {
									value: "",
									children: "当前范围暂无角色"
								}) : null, X.map((e) => /* @__PURE__ */ (0, C.jsx)("option", {
									value: e.id,
									children: e.name
								}, e.id))]
							})]
						}),
						/* @__PURE__ */ (0, C.jsxs)("div", {
							className: "character-capture-group",
							children: [/* @__PURE__ */ (0, C.jsx)("span", {
								className: "character-capture-label",
								children: "动作方式"
							}), /* @__PURE__ */ (0, C.jsxs)("div", {
								className: "character-capture-segmented",
								role: "tablist",
								"aria-label": "动作添加方式",
								children: [/* @__PURE__ */ (0, C.jsx)("button", {
									type: "button",
									role: "tab",
									"aria-selected": H === "new",
									className: H === "new" ? "is-active" : "",
									onClick: () => U("new"),
									children: "新建动作"
								}), /* @__PURE__ */ (0, C.jsx)("button", {
									type: "button",
									role: "tab",
									"aria-selected": H === "existing",
									className: H === "existing" ? "is-active" : "",
									disabled: Q.length === 0,
									onClick: () => U("existing"),
									children: "追加到已有动作"
								})]
							})]
						}),
						H === "existing" ? /* @__PURE__ */ (0, C.jsxs)("label", {
							className: "character-field character-field-wide",
							children: [/* @__PURE__ */ (0, C.jsx)("span", { children: "已有动作" }), /* @__PURE__ */ (0, C.jsx)("select", {
								value: $,
								onChange: (e) => G(e.target.value),
								children: Q.map((e) => /* @__PURE__ */ (0, C.jsx)("option", {
									value: e.id,
									children: e.name
								}, e.id))
							})]
						}) : /* @__PURE__ */ (0, C.jsxs)("div", {
							className: "character-capture-reference-fields",
							children: [
								/* @__PURE__ */ (0, C.jsxs)("label", {
									className: "character-field",
									children: [/* @__PURE__ */ (0, C.jsx)("span", { children: "动作类别" }), /* @__PURE__ */ (0, C.jsx)("select", {
										value: K,
										onChange: (e) => oe(e.target.value),
										children: D.map(([e, t]) => /* @__PURE__ */ (0, C.jsx)("option", {
											value: e,
											children: t
										}, e))
									})]
								}),
								K === "custom" ? /* @__PURE__ */ (0, C.jsxs)("label", {
									className: "character-field",
									children: [/* @__PURE__ */ (0, C.jsx)("span", { children: "自定义分类名" }), /* @__PURE__ */ (0, C.jsx)("input", {
										value: q,
										onChange: (e) => se(e.target.value),
										placeholder: "例如：武术、特殊技能"
									})]
								}) : null,
								/* @__PURE__ */ (0, C.jsxs)("label", {
									className: "character-field character-field-wide",
									children: [/* @__PURE__ */ (0, C.jsx)("span", { children: "动作名称" }), /* @__PURE__ */ (0, C.jsx)("input", {
										value: J,
										onChange: (e) => ce(e.target.value),
										placeholder: "例如：待机呼吸、冲刺"
									})]
								}),
								/* @__PURE__ */ (0, C.jsxs)("label", {
									className: "character-field character-field-wide",
									children: [/* @__PURE__ */ (0, C.jsx)("span", { children: "动作提示词" }), /* @__PURE__ */ (0, C.jsx)("textarea", {
										value: le,
										onChange: (e) => ue(e.target.value),
										rows: 3,
										placeholder: "记录姿态、节奏和镜头表现"
									})]
								})
							]
						}),
						/* @__PURE__ */ (0, C.jsxs)("div", {
							className: "flex min-h-10 items-center gap-2 rounded-lg border border-canvas-border bg-canvas-surface px-3 text-[10px] leading-4 text-canvas-text-muted",
							children: [/* @__PURE__ */ (0, C.jsx)(h, {
								icon: "lucide:link-2",
								width: "14",
								height: "14",
								className: "shrink-0",
								"aria-hidden": "true"
							}), "动作素材会绑定到所选角色，原画布节点保持不变。"]
						})
					] })]
				})]
			}),
			/* @__PURE__ */ (0, C.jsxs)("footer", {
				className: "character-dialog-footer",
				children: [/* @__PURE__ */ (0, C.jsx)("button", {
					type: "button",
					className: "character-button-secondary",
					onClick: o,
					children: "取消"
				}), /* @__PURE__ */ (0, C.jsxs)("button", {
					type: "button",
					className: "character-button-primary text-white",
					disabled: de || !s || x === "reference" && (!v || (E === "existing" ? !Z : !j.trim())) || x === "action" && (!y || !Z || (H === "existing" ? !$ : !J.trim() || K === "custom" && !q.trim())),
					onClick: () => void he(),
					children: [/* @__PURE__ */ (0, C.jsx)(h, {
						icon: x === "action" ? "lucide:film" : "lucide:contact-round",
						width: "15",
						height: "15",
						"aria-hidden": "true"
					}), de ? "添加中…" : x === "action" ? "添加到动作库" : "添加到角色库"]
				})]
			})
		]
	});
}
function M({ isOpen: e, scope: t, character: n, initialReferenceId: a, onClose: u, onSaved: te }) {
	let { saveCharacterCard: v, showToast: D, currentProjectId: O } = i(m((e) => ({
		saveCharacterCard: e.saveCharacterCard,
		showToast: e.showToast,
		currentProjectId: e.currentProjectId
	}))), j = (0, b.useMemo)(() => n ? k(n) : re(), [n]), [M, N] = (0, b.useState)(j), [P, F] = (0, b.useState)(a ?? j.primaryReferenceImageId ?? j.referenceImages?.[0]?.id ?? null), [I, L] = (0, b.useState)(j.primaryVoiceClipId ?? j.voiceClips?.[0]?.id ?? null), [R, z] = (0, b.useState)(null), [ae, B] = (0, b.useState)(!1), V = (0, b.useRef)(null), H = (0, b.useRef)(null), U = (0, b.useRef)(null), W = (0, b.useMemo)(() => M.referenceImages?.find((e) => e.id === P) ?? null, [M.referenceImages, P]), G = (0, b.useMemo)(() => M.voiceClips?.find((e) => e.id === I) ?? null, [M.voiceClips, I]), K = (e) => {
		N((t) => ({
			...t,
			...e,
			updatedAt: Date.now()
		}));
	}, oe = (e) => {
		P && N((t) => ({
			...t,
			updatedAt: Date.now(),
			referenceImages: (t.referenceImages ?? []).map((t) => t.id === P ? {
				...t,
				...e,
				updatedAt: Date.now()
			} : t)
		}));
	}, q = async (e, n) => {
		let r = s(e.type || e.name);
		if (l(e.size, r, e.name), t === "project" && O && O !== "default") {
			let t = await o(new Uint8Array(await e.arrayBuffer()), O, e.name);
			if (t?.assetUrl) return {
				url: t.assetUrl,
				filePath: t.filePath
			};
		}
		let i = await n(e);
		return c(i, r, e.name), { url: i };
	}, se = async (e) => {
		let t = Array.from(e.target.files ?? []), n = Math.max(0, T - (M.referenceImages?.length ?? 0)), i = t.slice(0, n), a = !M.primaryReferenceImageId;
		if (e.target.value = "", i.length === 0) {
			t.length > 0 && D(`每个角色最多保存 ${T} 张参考图`, "error");
			return;
		}
		t.length > i.length && D(`仅添加前 ${i.length} 张：每个角色最多 ${T} 张参考图`);
		try {
			let e = Date.now(), t = [];
			for (let [n, o] of i.entries()) {
				let i = await q(o, ie);
				t.push({
					id: `reference-${r()}`,
					kind: a && n === 0 ? "primary" : "other",
					imageUrl: i.url,
					filePath: i.filePath,
					prompt: "",
					createdAt: e + n,
					updatedAt: e + n
				});
			}
			N((e) => {
				let n = [...e.referenceImages ?? [], ...t];
				return {
					...e,
					referenceImages: n,
					primaryReferenceImageId: e.primaryReferenceImageId ?? t[0]?.id,
					updatedAt: Date.now()
				};
			}), F(t[0]?.id ?? null);
		} catch {
			D("图片读取失败", "error");
		}
	}, J = (e) => {
		I && N((t) => ({
			...t,
			updatedAt: Date.now(),
			voiceClips: (t.voiceClips ?? []).map((t) => t.id === I ? {
				...t,
				...e,
				updatedAt: Date.now()
			} : t)
		}));
	}, ce = async (e) => {
		let t = Array.from(e.target.files ?? []), n = Math.max(0, E - (M.voiceClips?.length ?? 0)), i = t.slice(0, n);
		if (e.target.value = "", i.length === 0) {
			t.length > 0 && D(`每个角色最多保存 ${E} 条声音`, "error");
			return;
		}
		t.length > i.length && D(`仅添加前 ${i.length} 条：每个角色最多 ${E} 条声音`);
		try {
			let e = Date.now(), t = [];
			for (let [n, a] of i.entries()) {
				let i = await q(a, x);
				t.push({
					id: `voice-${r()}`,
					kind: "timbre",
					label: a.name.replace(/\.[^.]+$/, ""),
					audioUrl: i.url,
					filePath: i.filePath,
					transcript: "",
					durationSec: await S(i.url),
					createdAt: e + n,
					updatedAt: e + n
				});
			}
			N((e) => ({
				...e,
				voiceClips: [...e.voiceClips ?? [], ...t],
				primaryVoiceClipId: e.primaryVoiceClipId ?? t[0]?.id,
				updatedAt: Date.now()
			})), L(t[0]?.id ?? null);
		} catch {
			D("音频读取失败", "error");
		}
	}, le = (e) => {
		let t = U.current;
		if (!(!t || !e.audioUrl)) {
			if (R === e.id) {
				t.pause(), z(null);
				return;
			}
			t.src = e.audioUrl, t.play().then(() => z(e.id)).catch(() => D("音频播放失败", "error"));
		}
	}, ue = () => {
		if (!I) return;
		R === I && (U.current?.pause(), z(null));
		let e = (M.voiceClips ?? []).filter((e) => e.id !== I);
		K({
			voiceClips: e,
			primaryVoiceClipId: M.primaryVoiceClipId === I ? e[0]?.id : M.primaryVoiceClipId
		}), L(e[0]?.id ?? null);
	}, de = () => {
		if (!P) return;
		let e = (M.referenceImages ?? []).filter((e) => e.id !== P);
		K({
			referenceImages: e,
			primaryReferenceImageId: M.primaryReferenceImageId === P ? e[0]?.id : M.primaryReferenceImageId,
			avatarReferenceImageId: M.avatarReferenceImageId === P ? void 0 : M.avatarReferenceImageId,
			avatarCrop: M.avatarReferenceImageId === P ? void 0 : M.avatarCrop
		}), F(e[0]?.id ?? null);
	}, Y = async () => {
		let e = M.name.trim();
		if (!e) {
			D("请填写角色名称", "error");
			return;
		}
		B(!0);
		let n = M.referenceImages ?? [], r = n.find((e) => e.id === M.primaryReferenceImageId) ?? n[0], i = {
			...M,
			name: e,
			key: d(e),
			referenceImages: n,
			primaryReferenceImageId: r?.id,
			imageNodeId: r?.sourceNodeId,
			imageUrl: r?.imageUrl,
			updatedAt: Date.now()
		}, a = await v(t, i);
		B(!1), a && (D(t === "project" ? "角色已保存到本项目" : "角色已保存到全局资产"), te(i.id), u());
	};
	return /* @__PURE__ */ (0, C.jsxs)(f, {
		isOpen: e,
		onClose: u,
		ariaLabel: n ? "编辑角色" : "新建角色",
		className: "character-dialog",
		children: [
			/* @__PURE__ */ (0, C.jsxs)("header", {
				className: "character-dialog-header",
				children: [/* @__PURE__ */ (0, C.jsxs)("div", { children: [/* @__PURE__ */ (0, C.jsx)("h2", { children: n ? "编辑角色" : "新建角色" }), /* @__PURE__ */ (0, C.jsx)("p", { children: t === "project" ? "保存到本项目" : "保存到全局资产" })] }), /* @__PURE__ */ (0, C.jsx)(p, { onClick: u })]
			}),
			/* @__PURE__ */ (0, C.jsxs)("div", {
				className: "character-dialog-body",
				children: [/* @__PURE__ */ (0, C.jsxs)("section", {
					className: "character-dialog-fields",
					"aria-label": "角色资料",
					children: [
						/* @__PURE__ */ (0, C.jsxs)("label", {
							className: "character-field character-field-wide",
							children: [/* @__PURE__ */ (0, C.jsx)("span", { children: "角色名称" }), /* @__PURE__ */ (0, C.jsx)("input", {
								autoFocus: !0,
								value: M.name,
								onChange: (e) => K({ name: e.target.value }),
								placeholder: "例如：沈砚"
							})]
						}),
						/* @__PURE__ */ (0, C.jsxs)("label", {
							className: "character-field",
							children: [/* @__PURE__ */ (0, C.jsx)("span", { children: "身份" }), /* @__PURE__ */ (0, C.jsx)("input", {
								value: M.identity,
								onChange: (e) => K({ identity: e.target.value }),
								placeholder: "职业或身份"
							})]
						}),
						/* @__PURE__ */ (0, C.jsxs)("label", {
							className: "character-field",
							children: [/* @__PURE__ */ (0, C.jsx)("span", { children: "故事定位" }), /* @__PURE__ */ (0, C.jsx)("input", {
								value: M.storyRole ?? "",
								onChange: (e) => K({ storyRole: e.target.value || void 0 }),
								placeholder: "主角、反派、导师…"
							})]
						}),
						/* @__PURE__ */ (0, C.jsxs)("label", {
							className: "character-field character-field-wide",
							children: [/* @__PURE__ */ (0, C.jsx)("span", { children: "简介" }), /* @__PURE__ */ (0, C.jsx)("textarea", {
								value: M.summary,
								onChange: (e) => K({ summary: e.target.value }),
								rows: 2,
								placeholder: "角色背景与核心特征"
							})]
						}),
						/* @__PURE__ */ (0, C.jsxs)("label", {
							className: "character-field character-field-wide",
							children: [/* @__PURE__ */ (0, C.jsx)("span", { children: "外观特征" }), /* @__PURE__ */ (0, C.jsx)("textarea", {
								value: M.visualNotes,
								onChange: (e) => K({ visualNotes: e.target.value }),
								rows: 2,
								placeholder: "发型、五官、体态、服饰等稳定视觉特征"
							})]
						}),
						/* @__PURE__ */ (0, C.jsxs)("label", {
							className: "character-field",
							children: [/* @__PURE__ */ (0, C.jsx)("span", { children: "性格" }), /* @__PURE__ */ (0, C.jsx)("input", {
								value: M.personality ?? "",
								onChange: (e) => K({ personality: e.target.value || void 0 })
							})]
						}),
						/* @__PURE__ */ (0, C.jsxs)("label", {
							className: "character-field",
							children: [/* @__PURE__ */ (0, C.jsx)("span", { children: "默认服装" }), /* @__PURE__ */ (0, C.jsx)("input", {
								value: M.wardrobeDefault ?? "",
								onChange: (e) => K({ wardrobeDefault: e.target.value || void 0 })
							})]
						}),
						/* @__PURE__ */ (0, C.jsxs)("label", {
							className: "character-field character-field-wide",
							children: [/* @__PURE__ */ (0, C.jsx)("span", { children: "声音特征" }), /* @__PURE__ */ (0, C.jsx)("input", {
								value: M.voiceNotes ?? "",
								onChange: (e) => K({ voiceNotes: e.target.value || void 0 }),
								placeholder: "音色、口音、语速，例如：低沉沙哑，语速偏慢，带轻微南方口音"
							})]
						})
					]
				}), /* @__PURE__ */ (0, C.jsxs)("section", {
					className: "character-dialog-references",
					"aria-label": "参考图",
					children: [
						/* @__PURE__ */ (0, C.jsxs)("div", {
							className: "character-reference-toolbar",
							children: [
								/* @__PURE__ */ (0, C.jsxs)("div", { children: [/* @__PURE__ */ (0, C.jsx)("h3", { children: "参考图" }), /* @__PURE__ */ (0, C.jsxs)("span", { children: [M.referenceImages?.length ?? 0, " 张"] })] }),
								/* @__PURE__ */ (0, C.jsxs)("button", {
									type: "button",
									onClick: () => V.current?.click(),
									children: [/* @__PURE__ */ (0, C.jsx)(h, {
										icon: "lucide:images",
										width: "15",
										height: "15",
										"aria-hidden": "true"
									}), "添加图片"]
								}),
								/* @__PURE__ */ (0, C.jsx)("input", {
									ref: V,
									className: "sr-only",
									type: "file",
									accept: "image/*",
									multiple: !0,
									onChange: (e) => void se(e)
								})
							]
						}),
						/* @__PURE__ */ (0, C.jsxs)("div", {
							className: "character-dialog-reference-strip",
							role: "list",
							"aria-label": "已添加图片",
							children: [(M.referenceImages ?? []).map((e, t) => /* @__PURE__ */ (0, C.jsx)("button", {
								type: "button",
								role: "listitem",
								className: e.id === P ? "is-selected" : "",
								onClick: () => F(e.id),
								"aria-label": `第 ${t + 1} 张，${y[e.kind]}`,
								children: e.imageUrl ? /* @__PURE__ */ (0, C.jsx)("img", {
									src: e.imageUrl,
									alt: ""
								}) : null
							}, e.id)), (M.referenceImages?.length ?? 0) === 0 ? /* @__PURE__ */ (0, C.jsxs)("button", {
								type: "button",
								className: "character-reference-add-empty",
								onClick: () => V.current?.click(),
								children: [/* @__PURE__ */ (0, C.jsx)(h, {
									icon: "lucide:plus",
									width: "20",
									height: "20",
									"aria-hidden": "true"
								}), /* @__PURE__ */ (0, C.jsx)("span", { children: "添加多张角色参考图" })]
							}) : null]
						}),
						W ? /* @__PURE__ */ (0, C.jsxs)("div", {
							className: "character-reference-editor",
							children: [/* @__PURE__ */ (0, C.jsxs)("div", {
								className: "character-reference-editor-main",
								children: [/* @__PURE__ */ (0, C.jsx)("div", {
									className: "character-reference-editor-image",
									children: W.imageUrl ? /* @__PURE__ */ (0, C.jsx)("img", {
										src: W.imageUrl,
										alt: ""
									}) : null
								}), /* @__PURE__ */ (0, C.jsxs)("div", {
									className: "character-reference-editor-fields",
									children: [
										/* @__PURE__ */ (0, C.jsxs)("label", {
											className: "character-field",
											children: [/* @__PURE__ */ (0, C.jsx)("span", { children: "图片用途" }), /* @__PURE__ */ (0, C.jsx)("select", {
												value: W.kind,
												onChange: (e) => oe({ kind: e.target.value }),
												children: ne.map(([e, t]) => /* @__PURE__ */ (0, C.jsx)("option", {
													value: e,
													children: t
												}, e))
											})]
										}),
										/* @__PURE__ */ (0, C.jsxs)("label", {
											className: "character-field",
											children: [/* @__PURE__ */ (0, C.jsx)("span", { children: "图片提示词" }), /* @__PURE__ */ (0, C.jsx)("textarea", {
												value: W.prompt,
												onChange: (e) => oe({ prompt: e.target.value }),
												rows: 4,
												placeholder: "记录生成该形象时使用的提示词"
											})]
										}),
										/* @__PURE__ */ (0, C.jsxs)("div", {
											className: "character-reference-actions",
											children: [
												/* @__PURE__ */ (0, C.jsxs)("button", {
													type: "button",
													className: M.primaryReferenceImageId === W.id ? "is-active" : "",
													onClick: () => K({ primaryReferenceImageId: W.id }),
													children: [/* @__PURE__ */ (0, C.jsx)(h, {
														icon: "lucide:star",
														width: "14",
														height: "14",
														"aria-hidden": "true"
													}), "主视觉"]
												}),
												/* @__PURE__ */ (0, C.jsxs)("button", {
													type: "button",
													className: M.avatarReferenceImageId === W.id ? "is-active" : "",
													onClick: () => K({
														avatarReferenceImageId: W.id,
														avatarCrop: M.avatarReferenceImageId === W.id ? M.avatarCrop : void 0
													}),
													children: [/* @__PURE__ */ (0, C.jsx)(h, {
														icon: "lucide:scan-face",
														width: "14",
														height: "14",
														"aria-hidden": "true"
													}), "设为头像"]
												}),
												/* @__PURE__ */ (0, C.jsxs)("button", {
													type: "button",
													className: "is-danger",
													onClick: de,
													children: [/* @__PURE__ */ (0, C.jsx)(h, {
														icon: "lucide:trash-2",
														width: "14",
														height: "14",
														"aria-hidden": "true"
													}), "移除"]
												})
											]
										})
									]
								})]
							}), M.avatarReferenceImageId === W.id ? /* @__PURE__ */ (0, C.jsx)(A, {
								reference: W,
								crop: M.avatarCrop,
								onChange: (e) => K({ avatarCrop: e })
							}, W.id) : null]
						}) : null,
						/* @__PURE__ */ (0, C.jsxs)("div", {
							className: "character-voice-block",
							children: [
								/* @__PURE__ */ (0, C.jsxs)("div", {
									className: "character-reference-toolbar",
									children: [
										/* @__PURE__ */ (0, C.jsxs)("div", { children: [/* @__PURE__ */ (0, C.jsx)("h3", { children: "角色声音" }), /* @__PURE__ */ (0, C.jsxs)("span", { children: [M.voiceClips?.length ?? 0, " 段"] })] }),
										/* @__PURE__ */ (0, C.jsxs)("button", {
											type: "button",
											onClick: () => H.current?.click(),
											children: [/* @__PURE__ */ (0, C.jsx)(h, {
												icon: "lucide:audio-lines",
												width: "15",
												height: "15",
												"aria-hidden": "true"
											}), "上传音频"]
										}),
										/* @__PURE__ */ (0, C.jsx)("input", {
											ref: H,
											className: "sr-only",
											type: "file",
											accept: "audio/*",
											multiple: !0,
											onChange: (e) => void ce(e)
										})
									]
								}),
								(M.voiceClips?.length ?? 0) === 0 ? /* @__PURE__ */ (0, C.jsxs)("button", {
									type: "button",
									className: "character-reference-add-empty",
									onClick: () => H.current?.click(),
									children: [/* @__PURE__ */ (0, C.jsx)(h, {
										icon: "lucide:mic",
										width: "20",
										height: "20",
										"aria-hidden": "true"
									}), /* @__PURE__ */ (0, C.jsx)("span", { children: "上传音色参考或台词样本，也可在角色库里绑定画布音频节点" })]
								}) : /* @__PURE__ */ (0, C.jsx)("div", {
									className: "character-voice-clip-list",
									role: "list",
									"aria-label": "已绑定声音",
									children: (M.voiceClips ?? []).map((e) => /* @__PURE__ */ (0, C.jsxs)("div", {
										role: "listitem",
										className: `character-voice-clip${e.id === I ? " is-selected" : ""}`,
										children: [
											/* @__PURE__ */ (0, C.jsx)("button", {
												type: "button",
												className: "character-voice-play",
												"aria-label": R === e.id ? "暂停试听" : "试听",
												disabled: !e.audioUrl,
												onClick: () => le(e),
												children: /* @__PURE__ */ (0, C.jsx)(h, {
													icon: R === e.id ? "lucide:pause" : "lucide:play",
													width: "14",
													height: "14",
													"aria-hidden": "true"
												})
											}),
											/* @__PURE__ */ (0, C.jsxs)("button", {
												type: "button",
												className: "character-voice-clip-main",
												onClick: () => L(e.id),
												children: [/* @__PURE__ */ (0, C.jsx)("strong", { children: _(e) }), /* @__PURE__ */ (0, C.jsxs)("span", { children: [
													g[e.kind],
													" · ",
													ee(e.durationSec),
													e.sourceNodeId ? " · 画布节点" : ""
												] })]
											}),
											M.primaryVoiceClipId === e.id ? /* @__PURE__ */ (0, C.jsx)("span", {
												className: "character-voice-primary-tag",
												children: "主音色"
											}) : null
										]
									}, e.id))
								}),
								G ? /* @__PURE__ */ (0, C.jsxs)("div", {
									className: "character-voice-editor",
									children: [
										/* @__PURE__ */ (0, C.jsxs)("div", {
											className: "character-voice-editor-fields",
											children: [/* @__PURE__ */ (0, C.jsxs)("label", {
												className: "character-field",
												children: [/* @__PURE__ */ (0, C.jsx)("span", { children: "声音名称" }), /* @__PURE__ */ (0, C.jsx)("input", {
													value: G.label ?? "",
													onChange: (e) => J({ label: e.target.value }),
													placeholder: "例如：低沉男声"
												})]
											}), /* @__PURE__ */ (0, C.jsxs)("label", {
												className: "character-field",
												children: [/* @__PURE__ */ (0, C.jsx)("span", { children: "用途" }), /* @__PURE__ */ (0, C.jsx)("select", {
													value: G.kind,
													onChange: (e) => J({ kind: e.target.value }),
													children: w.map(([e, t]) => /* @__PURE__ */ (0, C.jsx)("option", {
														value: e,
														children: t
													}, e))
												})]
											})]
										}),
										/* @__PURE__ */ (0, C.jsxs)("label", {
											className: "character-field",
											children: [/* @__PURE__ */ (0, C.jsx)("span", { children: "台词 / 音色描述" }), /* @__PURE__ */ (0, C.jsx)("textarea", {
												value: G.transcript,
												onChange: (e) => J({ transcript: e.target.value }),
												rows: 3,
												placeholder: "记录该音频的台词内容或音色特征"
											})]
										}),
										/* @__PURE__ */ (0, C.jsxs)("div", {
											className: "character-reference-actions",
											children: [/* @__PURE__ */ (0, C.jsxs)("button", {
												type: "button",
												className: M.primaryVoiceClipId === G.id ? "is-active" : "",
												onClick: () => K({ primaryVoiceClipId: G.id }),
												children: [/* @__PURE__ */ (0, C.jsx)(h, {
													icon: "lucide:star",
													width: "14",
													height: "14",
													"aria-hidden": "true"
												}), "主音色"]
											}), /* @__PURE__ */ (0, C.jsxs)("button", {
												type: "button",
												className: "is-danger",
												onClick: ue,
												children: [/* @__PURE__ */ (0, C.jsx)(h, {
													icon: "lucide:trash-2",
													width: "14",
													height: "14",
													"aria-hidden": "true"
												}), "移除"]
											})]
										})
									]
								}) : null,
								/* @__PURE__ */ (0, C.jsx)("audio", {
									ref: U,
									className: "sr-only",
									onEnded: () => z(null)
								})
							]
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, C.jsxs)("footer", {
				className: "character-dialog-footer",
				children: [/* @__PURE__ */ (0, C.jsx)("button", {
					type: "button",
					className: "character-button-secondary",
					onClick: u,
					children: "取消"
				}), /* @__PURE__ */ (0, C.jsx)("button", {
					type: "button",
					className: "character-button-primary text-white",
					disabled: ae,
					onClick: () => void Y(),
					children: ae ? "保存中…" : "保存角色"
				})]
			})
		]
	});
}
function N(e) {
	return "sourceNodeId" in e ? /* @__PURE__ */ (0, C.jsx)(j, { ...e }) : /* @__PURE__ */ (0, C.jsx)(M, { ...e });
}
//#endregion
export { N as default, S as t };
