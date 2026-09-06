import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./react-dom-BhFnNZvF.js";
import { t as r } from "./jsx-runtime-BAkIPmuO.js";
import { a as i } from "./i18n-on3r1DCI.js";
import { S as a, ri as o, t as s } from "./useAppStore-CcUL4Jo0.js";
import { S as c, d as l, n as u, t as d } from "./fileService-zQLozbOU.js";
import { t as f } from "./ViewportImage-Dsz9jsTU.js";
import { t as p } from "./ModalOverlay-DopvjrY3.js";
import { St as ee, Tt as te, zt as ne } from "./useTooltipAutoPlacement-BSvTkR9V.js";
import { n as m } from "./rasterImageDimensions-CX1VK2cM.js";
import { t as h } from "./Select-BkJW9F-N.js";
import { a as re, i as g, n as ie, o as ae, t as _ } from "./characterReferencePresentation-BVclYgC2.js";
import oe, { t as se } from "./CharacterAssetDialog-0WVGAeR4.js";
import { t as v } from "./justifiedRows-lVQTbax6.js";
//#region src/components/character/CharacterReferenceGallery.tsx
var y = n(), b = /* @__PURE__ */ e(t(), 1), x = r(), ce = 8;
function le({ references: e, selectedId: t, onSelect: n, onEdit: r, onStageResize: i }) {
	let a = (0, b.useRef)(null), [o, s] = (0, b.useState)({
		width: 0,
		height: 0
	}), [c, l] = (0, b.useState)({});
	(0, b.useLayoutEffect)(() => {
		let e = a.current;
		if (!e) return;
		let t = new ResizeObserver(([e]) => {
			s({
				width: e.contentRect.width,
				height: e.contentRect.height
			});
		});
		return t.observe(e), () => t.disconnect();
	}, [e.length]);
	let u = (t, n) => {
		l((r) => {
			if (r[t] === n) return r;
			let i = Object.entries(r).filter(([t]) => e.some((e) => e.id === t));
			return {
				...Object.fromEntries(i),
				[t]: n
			};
		});
	}, d = (0, b.useMemo)(() => v(e.map((e) => c[e.id] ?? 1), o.width, o.height, ce), [
		o.height,
		o.width,
		c,
		e
	]);
	return (0, b.useEffect)(() => {
		i?.(d ? {
			width: d.width,
			height: d.height
		} : null);
	}, [d, i]), e.length === 0 ? /* @__PURE__ */ (0, x.jsxs)("div", {
		className: "character-reference-empty",
		children: [/* @__PURE__ */ (0, x.jsx)(m, {
			icon: "lucide:images",
			width: "30",
			height: "30",
			"aria-hidden": "true"
		}), /* @__PURE__ */ (0, x.jsx)("span", { children: "还没有参考图" })]
	}) : /* @__PURE__ */ (0, x.jsx)("div", {
		className: "character-reference-grid",
		role: "list",
		"aria-label": "角色参考图",
		ref: a,
		children: d?.rows.map((i, a) => /* @__PURE__ */ (0, x.jsx)("div", {
			className: "character-reference-row",
			style: {
				width: d.width,
				height: i.height
			},
			children: i.items.map((i) => {
				let a = e[i];
				return /* @__PURE__ */ (0, x.jsx)("button", {
					type: "button",
					role: "listitem",
					className: `character-reference-item ${a.id === t ? "is-selected" : ""}`,
					style: { flex: `${c[a.id] ?? 1} 1 0` },
					onClick: () => n(a.id),
					onDoubleClick: () => r(a.id),
					"aria-label": `${_[a.kind]}参考图`,
					children: a.imageUrl ? /* @__PURE__ */ (0, x.jsx)(f, {
						src: a.imageUrl,
						alt: "",
						draggable: !1,
						eager: a.id === t,
						onLoad: (e) => {
							let { naturalWidth: t, naturalHeight: n } = e.currentTarget;
							!t || !n || u(a.id, t / n);
						}
					}) : /* @__PURE__ */ (0, x.jsx)(m, {
						icon: "lucide:image-off",
						width: "24",
						height: "24",
						"aria-hidden": "true"
					})
				}, a.id);
			})
		}, i.items.join("-") || a))
	});
}
//#endregion
//#region src/components/CharacterLibraryPanel.tsx
var ue = [
	{
		id: "standing",
		label: "站立",
		icon: "lucide:person-standing"
	},
	{
		id: "walking",
		label: "行走",
		icon: "lucide:footprints"
	},
	{
		id: "running",
		label: "奔跑",
		icon: "lucide:footprints"
	},
	{
		id: "jumping",
		label: "跳跃",
		icon: "lucide:arrow-up-from-line"
	},
	{
		id: "sitting",
		label: "坐姿",
		icon: "lucide:armchair"
	},
	{
		id: "crouching",
		label: "蹲伏",
		icon: "lucide:move-down"
	},
	{
		id: "lying",
		label: "躺卧",
		icon: "lucide:bed-single"
	},
	{
		id: "climbing",
		label: "攀爬",
		icon: "lucide:mountain"
	},
	{
		id: "swimming",
		label: "游泳",
		icon: "lucide:waves"
	},
	{
		id: "attacking",
		label: "攻击",
		icon: "lucide:sword"
	},
	{
		id: "defending",
		label: "防御",
		icon: "lucide:shield"
	},
	{
		id: "hit",
		label: "受击",
		icon: "lucide:zap"
	},
	{
		id: "death",
		label: "死亡",
		icon: "lucide:skull"
	},
	{
		id: "casting",
		label: "施法",
		icon: "lucide:sparkles"
	},
	{
		id: "interacting",
		label: "互动",
		icon: "lucide:handshake"
	},
	{
		id: "dancing",
		label: "舞蹈",
		icon: "lucide:music-2"
	},
	{
		id: "expression",
		label: "表情动作",
		icon: "lucide:smile"
	},
	{
		id: "custom",
		label: "自定义",
		icon: "lucide:shapes"
	}
], de = "image/png,image/jpeg,image/webp,image/avif,image/gif,video/mp4,video/webm,video/quicktime,video/x-m4v", fe = new Set([
	"png",
	"jpg",
	"jpeg",
	"webp",
	"avif"
]), pe = new Set([
	"mp4",
	"webm",
	"mov",
	"m4v"
]);
function me(e) {
	let t = e.name.split(".").pop()?.toLowerCase();
	return e.type === "image/gif" || t === "gif" ? "gif" : e.type.startsWith("image/") || t && fe.has(t) ? "image" : e.type.startsWith("video/") || t && pe.has(t) ? "video" : null;
}
function he(e) {
	return new Promise((t, n) => {
		let r = new FileReader();
		r.onload = () => typeof r.result == "string" ? t(r.result) : n(/* @__PURE__ */ Error("媒体读取失败")), r.onerror = () => n(r.error ?? /* @__PURE__ */ Error("媒体读取失败")), r.readAsDataURL(e);
	});
}
function ge(e) {
	let t = e.data, n = t.fileName || t.label || "画布动作素材";
	if (t.videoUrl) {
		let e = (t.fileName || t.filePath || t.videoUrl).split(/[?#]/, 1)[0].split(".").pop()?.toLowerCase(), r = e === "webm" ? "video/webm" : e === "mov" ? "video/quicktime" : e === "m4v" ? "video/x-m4v" : "video/mp4", i = Date.now();
		return {
			id: `action-media-${o()}`,
			kind: "video",
			name: n,
			mimeType: r,
			assetId: t.assetId,
			relativePath: t.relativePath,
			filePath: t.filePath,
			url: t.videoUrl,
			createdAt: i,
			updatedAt: i
		};
	}
	let r = t.imageUrl || t.thumbnailUrl;
	if (!r) return null;
	let i = [
		t.fileName,
		t.filePath,
		r
	].filter((e) => typeof e == "string").join(" "), a = /\.gif(?:[?#]|$)/i.test(i) || r.startsWith("data:image/gif"), s = (t.fileName || t.filePath || r).split(/[?#]/, 1)[0].split(".").pop()?.toLowerCase(), c = r.match(/^data:(image\/[^;,]+)/i)?.[1]?.toLowerCase(), l = a ? "image/gif" : c ?? (s === "jpg" || s === "jpeg" ? "image/jpeg" : s === "webp" ? "image/webp" : s === "avif" ? "image/avif" : "image/png"), u = Date.now();
	return {
		id: `action-media-${o()}`,
		kind: a ? "gif" : "image",
		name: n,
		mimeType: l,
		assetId: t.assetId,
		relativePath: t.relativePath,
		filePath: t.filePath,
		url: r,
		createdAt: u,
		updatedAt: u
	};
}
function _e(e) {
	let t = e.referenceImages ?? [];
	return t.find((t) => t.id === e.avatarReferenceImageId) ?? t.find((t) => t.id === e.primaryReferenceImageId) ?? t[0];
}
function ve({ character: e }) {
	let t = _e(e), n = t?.id === e.avatarReferenceImageId && e.avatarCrop;
	return /* @__PURE__ */ (0, x.jsx)("span", {
		className: "character-avatar",
		children: t?.imageUrl ? /* @__PURE__ */ (0, x.jsx)(f, {
			src: t.imageUrl,
			alt: "",
			draggable: !1,
			className: n ? "is-cropped" : "",
			style: n ? g(e.avatarCrop) : void 0
		}) : /* @__PURE__ */ (0, x.jsx)(m, {
			icon: "lucide:user-round",
			width: 22,
			height: 22,
			"aria-hidden": "true"
		})
	});
}
function ye() {
	let e = i(), { open: t, actionLibraryOpen: n, setActionLibraryOpen: r, setOpen: g, projectCharacters: _, globalCharacters: v, globalCharactersLoading: ce, loadGlobalCharacters: fe, copyCharacterToGlobal: pe, copyGlobalCharacterToProject: _e, deleteDramaAsset: ye, deleteGlobalCharacter: be, nodes: S, setCharacterLibraryNodeHidden: xe, createImageNodeFromCharacterReference: Se, bindAudioNodeToCharacterVoice: Ce, removeCharacterVoiceClip: we, setCharacterPrimaryVoice: Te, createAudioNodeFromCharacterVoice: Ee, createVoiceOverNodeFromCharacterVoice: De, addCharacterAction: Oe, addCharacterActionMedia: ke, removeCharacterActionMedia: Ae, removeCharacterAction: je, currentProjectId: C, setSelectedNodeIds: Me, showToast: w } = s(ne((e) => ({
		open: e.characterLibraryOpen,
		setOpen: e.setCharacterLibraryOpen,
		actionLibraryOpen: e.characterActionLibraryOpen,
		setActionLibraryOpen: e.setCharacterActionLibraryOpen,
		projectCharacters: e.dramaAssets.characters,
		globalCharacters: e.globalCharacters,
		globalCharactersLoading: e.globalCharactersLoading,
		loadGlobalCharacters: e.loadGlobalCharacters,
		copyCharacterToGlobal: e.copyCharacterToGlobal,
		copyGlobalCharacterToProject: e.copyGlobalCharacterToProject,
		deleteDramaAsset: e.deleteDramaAsset,
		deleteGlobalCharacter: e.deleteGlobalCharacter,
		nodes: e.nodes,
		setCharacterLibraryNodeHidden: e.setCharacterLibraryNodeHidden,
		createImageNodeFromCharacterReference: e.createImageNodeFromCharacterReference,
		bindAudioNodeToCharacterVoice: e.bindAudioNodeToCharacterVoice,
		removeCharacterVoiceClip: e.removeCharacterVoiceClip,
		setCharacterPrimaryVoice: e.setCharacterPrimaryVoice,
		createAudioNodeFromCharacterVoice: e.createAudioNodeFromCharacterVoice,
		createVoiceOverNodeFromCharacterVoice: e.createVoiceOverNodeFromCharacterVoice,
		addCharacterAction: e.addCharacterAction,
		addCharacterActionMedia: e.addCharacterActionMedia,
		removeCharacterActionMedia: e.removeCharacterActionMedia,
		removeCharacterAction: e.removeCharacterAction,
		currentProjectId: e.currentProjectId,
		setSelectedNodeIds: e.setSelectedNodeIds,
		showToast: e.showToast
	}))), [T, E] = (0, b.useState)("project"), [D, Ne] = (0, b.useState)(""), [Pe, O] = (0, b.useState)(null), [k, Fe] = (0, b.useState)(null), Ie = (0, b.useCallback)((e) => {
		Fe((t) => t?.width === e?.width && t?.height === e?.height ? t : e);
	}, []), [Le, A] = (0, b.useState)(null), [Re, ze] = (0, b.useState)(!1), [Be, Ve] = (0, b.useState)(null), [He, Ue] = (0, b.useState)(null), [j, M] = (0, b.useState)(!1), [N, P] = (0, b.useState)(!1), [We, F] = (0, b.useState)(null), [Ge, Ke] = (0, b.useState)(!1), [qe, Je] = (0, b.useState)(null), [Ye, I] = (0, b.useState)(!1), [L, Xe] = (0, b.useState)("standing"), [R, Ze] = (0, b.useState)("all"), [z, Qe] = (0, b.useState)(""), [$e, et] = (0, b.useState)(""), [tt, nt] = (0, b.useState)(""), [B, V] = (0, b.useState)([]), [rt, it] = (0, b.useState)(null), [H, U] = (0, b.useState)(null), [W, at] = (0, b.useState)(!1), [G, ot] = (0, b.useState)(!1), K = (0, b.useRef)(null), st = (0, b.useRef)(null);
	(0, b.useEffect)(() => {
		(t || n) && fe();
	}, [
		n,
		fe,
		t
	]), (0, b.useEffect)(() => () => r(!1), [r]);
	let ct = T === "project" ? _ : v, q = (0, b.useMemo)(() => {
		let e = D.trim().toLowerCase();
		return [...ct].filter((t) => !e || [
			t.name,
			t.summary,
			t.identity,
			t.storyRole,
			t.visualNotes
		].some((t) => t?.toLowerCase().includes(e))).sort((e, t) => t.updatedAt - e.updatedAt || e.name.localeCompare(t.name));
	}, [D, ct]), J = q.find((e) => e.id === Pe) ?? q[0] ?? null, lt = J?.referenceImages?.some((e) => e.id === Le) ? Le : J?.primaryReferenceImageId ?? J?.referenceImages?.[0]?.id ?? null, Y = J?.referenceImages?.find((e) => e.id === lt) ?? null, X = (0, b.useMemo)(() => !J || !Y ? null : S.find((e) => e.id === Y.sourceNodeId || e.data.characterLibraryLinks?.some((e) => e.scope === T && e.characterId === J.id && e.referenceImageId === Y.id)) ?? null, [
		S,
		T,
		J,
		Y
	]), ut = X ? X.data.hiddenByCharacterLibrary ? e("显示并定位节点") : e("定位画布节点") : e("添加到画布"), dt = X ? X.data.hiddenByCharacterLibrary ? "lucide:eye" : "lucide:locate-fixed" : "lucide:square-plus", ft = (0, b.useMemo)(() => S.filter((e) => !e.data.hiddenByCharacterLibrary && (e.data.imageUrl || e.data.thumbnailUrl)), [S]), pt = (0, b.useMemo)(() => S.filter((e) => a(e)), [S]), mt = (0, b.useMemo)(() => S.filter((e) => ge(e) !== null), [S]), Z = J?.voiceClips ?? [], ht = (J?.actions ?? []).filter((e) => R === "all" || e.category === R), Q = We?.characterId === J?.id ? We?.clipId ?? null : null;
	(0, b.useEffect)(() => {
		K.current?.pause();
	}, [
		t,
		T,
		J?.id
	]);
	let gt = (e) => {
		E(e), O(null), A(null), P(!1);
	}, _t = (t) => {
		let n = K.current;
		if (!(!n || !t.audioUrl || !J)) {
			if (Q === t.id) {
				n.pause();
				return;
			}
			n.src = t.audioUrl, n.play().then(() => F({
				characterId: J.id,
				clipId: t.id
			})).catch(() => w(e("音频播放失败"), "error"));
		}
	}, vt = async (t) => {
		if (!J) return;
		let n = S.find((e) => e.id === t), r = n?.data.audioUrl;
		if (!r) {
			w(e("该节点没有可用的音频"), "error");
			return;
		}
		P(!1), Ke(!0);
		let i = await Ce({
			nodeId: t,
			scope: T,
			characterId: J.id,
			label: n?.data.label,
			durationSec: await se(r)
		});
		Ke(!1), i && w(e(T === "project" ? "已绑定到本项目角色声音" : "已绑定到全局角色声音"));
	}, yt = async (t) => {
		J && (Q === t.id && K.current?.pause(), await we(T, J.id, t.id) && w(e("已移除该声音")));
	}, bt = (e) => {
		g(!1), Me([e]), window.dispatchEvent(new CustomEvent("canvas-focus-node", { detail: { nodeId: e } }));
	}, xt = (e) => {
		if (!J) return;
		let t = Ee(T, J.id, e.id);
		t && bt(t);
	}, St = (t) => {
		if (!J) return;
		let n = De(T, J.id, t.id);
		n && (w(e("已创建配音节点，声音已连线为音色参考")), bt(n));
	}, Ct = async () => {
		if (!J || !z.trim()) return;
		ot(!0);
		let t = await Oe(T, J.id, {
			category: L,
			customCategory: L === "custom" ? tt : void 0,
			name: z,
			prompt: $e,
			media: B
		});
		ot(!1), t && (Qe(""), et(""), V([]), L === "custom" && nt(""), w(e("动作已添加到「{name}」", { name: J.name })));
	}, wt = async (e) => {
		let t = me(e);
		if (!t) return null;
		let n = l(e.type || e.name);
		d(e.size, n, e.name);
		let r, i;
		if (T === "project" && C && C !== "default") {
			let t = await c(new Uint8Array(await e.arrayBuffer()), C, e.name);
			r = t?.assetUrl || void 0, i = t?.filePath;
		}
		r || (r = await he(e), u(r, n, e.name));
		let a = Date.now();
		return {
			id: `action-media-${o()}`,
			kind: t,
			name: e.name,
			mimeType: e.type || void 0,
			filePath: i,
			url: r,
			createdAt: a,
			updatedAt: a
		};
	}, Tt = (e) => {
		it(e), requestAnimationFrame(() => st.current?.click());
	}, Et = async (t) => {
		let n = Array.from(t.target.files ?? []), r = rt;
		if (t.target.value = "", !(n.length === 0 || !J)) {
			at(!0);
			try {
				let t = [];
				for (let e of n) {
					let n = await wt(e);
					n && t.push(n);
				}
				if (t.length === 0) {
					w(e("请选择 PNG、JPG、WebP、AVIF、GIF、MP4、WebM、MOV 或 M4V 文件"), "error");
					return;
				}
				r ? await ke(T, J.id, r, t) && w(e("已添加 {count} 个动作媒体", { count: t.length })) : V((e) => [...e, ...t]);
			} catch {
				w(e("动作媒体读取或保存失败"), "error");
			} finally {
				at(!1), it(null);
			}
		}
	}, Dt = async (t) => {
		if (!J || !H) return;
		let n = J.actions?.find((e) => e.id === H), r = S.find((e) => e.id === t), i = r ? ge(r) : null;
		if (!n || !i) {
			w(e("该节点没有可用的图片、GIF 或视频"), "error");
			return;
		}
		if (n.media?.some((e) => !!(i.assetId && e.assetId === i.assetId) || !!(i.filePath && e.filePath === i.filePath) || e.url === i.url)) {
			w(e("该节点已经添加到这个动作"));
			return;
		}
		await ke(T, J.id, n.id, [i]) && (U(null), w(e("画布节点已添加到动作「{name}」", { name: n.name })));
	}, Ot = () => {
		U(null), r(!1);
	}, $ = (e, t) => {
		Ve(e), Ue(t ?? null), ze(!0);
	}, kt = async () => {
		if (!J) return;
		if (T === "project") {
			let t = await pe(J.id);
			if (!t) return;
			w(e("已复制到全局资产")), E("global"), O(t), A(null);
			return;
		}
		let t = _e(J.id);
		t && (w(e("已复制到本项目")), E("project"), O(t), A(null));
	}, At = async () => {
		if (J) {
			if (I(!1), T === "project") ye("character", J.id);
			else if (!await be(J.id)) return;
			w(e("角色已删除")), O(null), A(null);
		}
	};
	return /* @__PURE__ */ (0, x.jsxs)(x.Fragment, { children: [
		/* @__PURE__ */ (0, x.jsxs)(p, {
			isOpen: t,
			onClose: () => g(!1),
			ariaLabel: e("角色库"),
			className: "character-library-panel",
			children: [
				/* @__PURE__ */ (0, x.jsxs)("div", {
					className: "character-library-toolbar",
					children: [
						/* @__PURE__ */ (0, x.jsxs)("div", {
							className: "character-library-tabs",
							role: "tablist",
							"aria-label": e("角色保存范围"),
							children: [/* @__PURE__ */ (0, x.jsxs)("button", {
								type: "button",
								role: "tab",
								"aria-selected": T === "project",
								className: T === "project" ? "is-active" : "",
								onClick: () => gt("project"),
								children: [e("本项目"), /* @__PURE__ */ (0, x.jsx)("span", { children: _.length })]
							}), /* @__PURE__ */ (0, x.jsxs)("button", {
								type: "button",
								role: "tab",
								"aria-selected": T === "global",
								className: T === "global" ? "is-active" : "",
								onClick: () => gt("global"),
								children: [e("全局资产"), /* @__PURE__ */ (0, x.jsx)("span", { children: v.length })]
							})]
						}),
						/* @__PURE__ */ (0, x.jsxs)("label", {
							className: "character-library-search",
							children: [
								/* @__PURE__ */ (0, x.jsx)(m, {
									icon: "lucide:search",
									width: "15",
									height: "15",
									"aria-hidden": "true"
								}),
								/* @__PURE__ */ (0, x.jsx)("input", {
									value: D,
									onChange: (e) => Ne(e.target.value),
									placeholder: e("搜索角色、身份或简介")
								}),
								D ? /* @__PURE__ */ (0, x.jsx)("button", {
									type: "button",
									"aria-label": e("清空搜索"),
									onClick: () => Ne(""),
									children: /* @__PURE__ */ (0, x.jsx)(m, {
										icon: "lucide:x",
										width: "13",
										height: "13",
										"aria-hidden": "true"
									})
								}) : null
							]
						}),
						/* @__PURE__ */ (0, x.jsxs)("button", {
							type: "button",
							className: "character-library-new",
							onClick: () => $(null),
							children: [/* @__PURE__ */ (0, x.jsx)(m, {
								icon: "lucide:plus",
								width: "13",
								height: "13",
								"aria-hidden": "true"
							}), e("新建角色")]
						}),
						/* @__PURE__ */ (0, x.jsx)(te, { onClick: () => g(!1) })
					]
				}),
				/* @__PURE__ */ (0, x.jsx)("main", {
					className: "character-library-content",
					children: T === "global" && ce ? /* @__PURE__ */ (0, x.jsxs)("div", {
						className: "character-library-empty",
						children: [/* @__PURE__ */ (0, x.jsx)(m, {
							icon: "lucide:loader-circle",
							className: "animate-spin",
							width: "26",
							height: "26",
							"aria-hidden": "true"
						}), /* @__PURE__ */ (0, x.jsx)("p", { children: e("正在读取全局角色…") })]
					}) : J ? /* @__PURE__ */ (0, x.jsxs)("section", {
						className: "character-library-gallery",
						"aria-label": e("多图参考"),
						style: k ? {
							"--character-stage-width": `${k.width}px`,
							"--character-stage-height": `${k.height}px`
						} : void 0,
						children: [
							/* @__PURE__ */ (0, x.jsx)(le, {
								references: J.referenceImages ?? [],
								selectedId: lt,
								onSelect: A,
								onEdit: (e) => $(J, e),
								onStageResize: Ie
							}),
							/* @__PURE__ */ (0, x.jsxs)("div", {
								className: "character-library-dock",
								children: [
									j ? /* @__PURE__ */ (0, x.jsx)("div", {
										className: "character-node-picker",
										role: "listbox",
										"aria-label": e("选择画布图片节点"),
										children: ft.length === 0 ? /* @__PURE__ */ (0, x.jsx)("span", {
											className: "character-node-picker-empty",
											children: e("画布上没有可用的图片节点")
										}) : ft.map((t) => /* @__PURE__ */ (0, x.jsxs)("button", {
											type: "button",
											role: "option",
											"aria-selected": !1,
											onClick: () => {
												Je(t.id), M(!1);
											},
											children: [/* @__PURE__ */ (0, x.jsx)(f, {
												src: t.data.imageUrl ?? t.data.thumbnailUrl,
												alt: "",
												draggable: !1
											}), /* @__PURE__ */ (0, x.jsx)("span", { children: t.data.label || e("图片节点") })]
										}, t.id))
									}) : null,
									/* @__PURE__ */ (0, x.jsxs)("section", {
										className: "character-voice-dock",
										"aria-label": e("角色声音"),
										children: [
											/* @__PURE__ */ (0, x.jsxs)("div", {
												className: "character-voice-dock-head",
												children: [
													/* @__PURE__ */ (0, x.jsx)(m, {
														icon: "lucide:audio-lines",
														width: "14",
														height: "14",
														"aria-hidden": "true"
													}),
													/* @__PURE__ */ (0, x.jsx)("span", { children: e("角色声音") }),
													/* @__PURE__ */ (0, x.jsx)("strong", { children: Z.length }),
													/* @__PURE__ */ (0, x.jsx)("button", {
														type: "button",
														"data-tooltip": e("绑定画布音频节点"),
														"aria-label": e("绑定画布音频节点"),
														"aria-expanded": N,
														className: N ? "is-active" : "",
														disabled: Ge,
														onClick: () => {
															M(!1), P((e) => !e);
														},
														children: /* @__PURE__ */ (0, x.jsx)(m, {
															icon: "lucide:link",
															width: "15",
															height: "15",
															"aria-hidden": "true"
														})
													}),
													/* @__PURE__ */ (0, x.jsx)("button", {
														type: "button",
														"data-tooltip": e("上传音频"),
														"aria-label": e("上传音频"),
														onClick: () => $(J),
														children: /* @__PURE__ */ (0, x.jsx)(m, {
															icon: "lucide:upload",
															width: "15",
															height: "15",
															"aria-hidden": "true"
														})
													})
												]
											}),
											N ? /* @__PURE__ */ (0, x.jsx)("div", {
												className: "character-voice-picker",
												role: "listbox",
												"aria-label": e("选择画布音频节点"),
												children: pt.length === 0 ? /* @__PURE__ */ (0, x.jsx)("span", {
													className: "character-node-picker-empty",
													children: e("画布上没有可用的音频节点")
												}) : pt.map((t) => /* @__PURE__ */ (0, x.jsxs)("button", {
													type: "button",
													role: "option",
													"aria-selected": !1,
													onClick: () => void vt(t.id),
													children: [/* @__PURE__ */ (0, x.jsx)(m, {
														icon: "lucide:audio-lines",
														width: "15",
														height: "15",
														"aria-hidden": "true"
													}), /* @__PURE__ */ (0, x.jsx)("span", { children: t.data.label || e("音频节点") })]
												}, t.id))
											}) : null,
											Z.length === 0 ? /* @__PURE__ */ (0, x.jsx)("p", {
												className: "character-voice-dock-empty",
												children: e(Ge ? "正在绑定…" : "还没有声音，可绑定画布音频节点或上传音频")
											}) : /* @__PURE__ */ (0, x.jsx)("div", {
												className: "character-voice-chips",
												role: "list",
												children: Z.map((t) => /* @__PURE__ */ (0, x.jsxs)("div", {
													role: "listitem",
													className: `character-voice-chip${t.id === J.primaryVoiceClipId ? " is-primary" : ""}`,
													children: [
														/* @__PURE__ */ (0, x.jsx)("button", {
															type: "button",
															className: "character-voice-play",
															"aria-label": Q === t.id ? e("暂停试听") : e("试听"),
															disabled: !t.audioUrl,
															onClick: () => _t(t),
															children: /* @__PURE__ */ (0, x.jsx)(m, {
																icon: Q === t.id ? "lucide:pause" : "lucide:play",
																width: "13",
																height: "13",
																"aria-hidden": "true"
															})
														}),
														/* @__PURE__ */ (0, x.jsxs)("span", {
															className: "character-voice-chip-copy",
															children: [/* @__PURE__ */ (0, x.jsx)("strong", { children: ae(t) }), /* @__PURE__ */ (0, x.jsxs)("span", { children: [
																ie[t.kind],
																" · ",
																re(t.durationSec)
															] })]
														}),
														/* @__PURE__ */ (0, x.jsxs)("span", {
															className: "character-voice-chip-actions",
															children: [
																/* @__PURE__ */ (0, x.jsx)("button", {
																	type: "button",
																	"data-tooltip": e("设为主音色"),
																	"aria-label": e("设为主音色"),
																	className: t.id === J.primaryVoiceClipId ? "is-active" : "",
																	onClick: () => void Te(T, J.id, t.id),
																	children: /* @__PURE__ */ (0, x.jsx)(m, {
																		icon: "lucide:star",
																		width: "13",
																		height: "13",
																		"aria-hidden": "true"
																	})
																}),
																/* @__PURE__ */ (0, x.jsx)("button", {
																	type: "button",
																	"data-tooltip": e("用这个声音生成台词"),
																	"aria-label": e("用这个声音生成台词"),
																	onClick: () => St(t),
																	children: /* @__PURE__ */ (0, x.jsx)(m, {
																		icon: "lucide:mic",
																		width: "13",
																		height: "13",
																		"aria-hidden": "true"
																	})
																}),
																/* @__PURE__ */ (0, x.jsx)("button", {
																	type: "button",
																	"data-tooltip": t.sourceNodeId ? e("定位画布节点") : e("添加到画布"),
																	"aria-label": t.sourceNodeId ? e("定位画布节点") : e("添加到画布"),
																	onClick: () => xt(t),
																	children: /* @__PURE__ */ (0, x.jsx)(m, {
																		icon: t.sourceNodeId ? "lucide:locate-fixed" : "lucide:square-plus",
																		width: "13",
																		height: "13",
																		"aria-hidden": "true"
																	})
																}),
																/* @__PURE__ */ (0, x.jsx)("button", {
																	type: "button",
																	"data-tooltip": e("移除该声音"),
																	"aria-label": e("移除该声音"),
																	onClick: () => void yt(t),
																	children: /* @__PURE__ */ (0, x.jsx)(m, {
																		icon: "lucide:trash-2",
																		width: "13",
																		height: "13",
																		"aria-hidden": "true"
																	})
																})
															]
														})
													]
												}, t.id))
											})
										]
									}),
									/* @__PURE__ */ (0, x.jsxs)("section", {
										className: "character-library-profile",
										"aria-label": e("当前角色"),
										children: [/* @__PURE__ */ (0, x.jsxs)("div", {
											className: "character-library-profile-copy",
											children: [/* @__PURE__ */ (0, x.jsxs)("div", {
												className: "character-library-profile-name",
												children: [
													/* @__PURE__ */ (0, x.jsx)("h3", { children: J.name }),
													J.identity ? /* @__PURE__ */ (0, x.jsx)("span", { children: J.identity }) : null,
													J.storyRole ? /* @__PURE__ */ (0, x.jsx)("span", { children: J.storyRole }) : null
												]
											}), /* @__PURE__ */ (0, x.jsx)("p", { children: J.summary || J.visualNotes || e("尚未填写角色简介") })]
										}), /* @__PURE__ */ (0, x.jsxs)("div", {
											className: "character-library-profile-actions",
											children: [
												Y ? /* @__PURE__ */ (0, x.jsx)("button", {
													type: "button",
													"data-tooltip": ut,
													"aria-label": ut,
													onClick: () => {
														if (!J || !Y) return;
														let t = X?.id ?? null;
														if (X?.data.hiddenByCharacterLibrary) xe(X.id, !1), w(e("节点已显示"));
														else if (!X) {
															if (t = Se(T, J.id, Y.id), !t) return;
															w(e("已将角色参考图添加到画布"));
														}
														t && (g(!1), Me([t]), window.dispatchEvent(new CustomEvent("canvas-focus-node", { detail: { nodeId: t } })));
													},
													children: /* @__PURE__ */ (0, x.jsx)(m, {
														icon: dt,
														width: "16",
														height: "16",
														"aria-hidden": "true"
													})
												}) : null,
												X && !X.data.hiddenByCharacterLibrary ? /* @__PURE__ */ (0, x.jsx)("button", {
													type: "button",
													"data-tooltip": e("在画布中隐藏"),
													"aria-label": e("在画布中隐藏"),
													onClick: () => {
														xe(X.id, !0) && w(e("节点已隐藏"));
													},
													children: /* @__PURE__ */ (0, x.jsx)(m, {
														icon: "lucide:eye-off",
														width: "16",
														height: "16",
														"aria-hidden": "true"
													})
												}) : null,
												/* @__PURE__ */ (0, x.jsx)("button", {
													type: "button",
													"data-tooltip": e("从画布添加视角图"),
													"aria-label": e("从画布添加视角图"),
													"aria-expanded": j,
													className: j ? "is-active" : "",
													onClick: () => {
														P(!1), M((e) => !e);
													},
													children: /* @__PURE__ */ (0, x.jsx)(m, {
														icon: "lucide:image-plus",
														width: "16",
														height: "16",
														"aria-hidden": "true"
													})
												}),
												/* @__PURE__ */ (0, x.jsx)("button", {
													type: "button",
													"data-tooltip": e("编辑角色"),
													"aria-label": e("编辑角色"),
													onClick: () => $(J),
													children: /* @__PURE__ */ (0, x.jsx)(m, {
														icon: "lucide:pencil",
														width: "16",
														height: "16",
														"aria-hidden": "true"
													})
												}),
												/* @__PURE__ */ (0, x.jsx)("button", {
													type: "button",
													"data-tooltip": e("角色动作库"),
													"aria-label": e("打开「{name}」的动作库", { name: J.name }),
													"aria-expanded": n,
													className: n ? "is-active" : "",
													onClick: () => r(!0),
													children: /* @__PURE__ */ (0, x.jsx)(m, {
														icon: "lucide:accessibility",
														width: "16",
														height: "16",
														"aria-hidden": "true"
													})
												}),
												/* @__PURE__ */ (0, x.jsx)("button", {
													type: "button",
													"data-tooltip": e(T === "project" ? "复制到全局资产" : "复制到本项目"),
													"aria-label": e(T === "project" ? "复制到全局资产" : "复制到本项目"),
													onClick: () => void kt(),
													children: /* @__PURE__ */ (0, x.jsx)(m, {
														icon: "lucide:copy-plus",
														width: "16",
														height: "16",
														"aria-hidden": "true"
													})
												}),
												/* @__PURE__ */ (0, x.jsx)("button", {
													type: "button",
													"data-tooltip": e("删除角色"),
													"aria-label": e("删除角色"),
													onClick: () => I(!0),
													children: /* @__PURE__ */ (0, x.jsx)(m, {
														icon: "lucide:trash-2",
														width: "16",
														height: "16",
														"aria-hidden": "true"
													})
												})
											]
										})]
									})
								]
							}),
							/* @__PURE__ */ (0, x.jsx)("audio", {
								ref: K,
								className: "sr-only",
								onPause: () => F(null),
								onEnded: () => F(null)
							})
						]
					}) : /* @__PURE__ */ (0, x.jsxs)("div", {
						className: "character-library-empty",
						children: [
							/* @__PURE__ */ (0, x.jsx)(m, {
								icon: "lucide:contact-round",
								width: "34",
								height: "34",
								"aria-hidden": "true"
							}),
							/* @__PURE__ */ (0, x.jsx)("h3", { children: e(D ? "没有匹配的角色" : "这里还没有角色") }),
							D ? null : /* @__PURE__ */ (0, x.jsxs)("button", {
								type: "button",
								className: "character-button-primary mt-3 text-white",
								onClick: () => $(null),
								children: [/* @__PURE__ */ (0, x.jsx)(m, {
									icon: "lucide:plus",
									width: "15",
									height: "15",
									"aria-hidden": "true"
								}), e("新建角色")]
							})
						]
					})
				}),
				/* @__PURE__ */ (0, x.jsxs)("footer", {
					className: "character-library-strip",
					"aria-label": e("角色列表"),
					children: [/* @__PURE__ */ (0, x.jsxs)("div", {
						className: "character-library-strip-label",
						children: [/* @__PURE__ */ (0, x.jsx)("span", { children: e(T === "project" ? "本项目角色" : "全局角色") }), /* @__PURE__ */ (0, x.jsx)("strong", { children: q.length })]
					}), /* @__PURE__ */ (0, x.jsx)("div", {
						className: "character-library-strip-list",
						role: "list",
						children: q.map((e) => /* @__PURE__ */ (0, x.jsxs)("button", {
							type: "button",
							role: "listitem",
							className: e.id === J?.id ? "is-selected" : "",
							onClick: () => {
								O(e.id), A(null);
							},
							children: [/* @__PURE__ */ (0, x.jsx)(ve, { character: e }), /* @__PURE__ */ (0, x.jsx)("span", { children: e.name })]
						}, e.id))
					})]
				})
			]
		}),
		Re ? (0, y.createPortal)(/* @__PURE__ */ (0, x.jsx)(oe, {
			isOpen: !0,
			scope: T,
			character: Be,
			initialReferenceId: He,
			onClose: () => ze(!1),
			onSaved: (e) => {
				O(e), A(null);
			}
		}), document.body) : null,
		Ye && J ? (0, y.createPortal)(/* @__PURE__ */ (0, x.jsxs)(p, {
			isOpen: !0,
			onClose: () => I(!1),
			ariaLabel: e("确认删除角色"),
			className: "character-confirm-dialog",
			motionPreset: "quick",
			children: [/* @__PURE__ */ (0, x.jsxs)("div", {
				className: "character-confirm-body",
				children: [/* @__PURE__ */ (0, x.jsx)("span", {
					className: "character-confirm-icon",
					"aria-hidden": "true",
					children: /* @__PURE__ */ (0, x.jsx)(m, {
						icon: "lucide:trash-2",
						width: "18",
						height: "18"
					})
				}), /* @__PURE__ */ (0, x.jsxs)("div", { children: [/* @__PURE__ */ (0, x.jsx)("h3", { children: e("删除「{name}」？", { name: J.name }) }), /* @__PURE__ */ (0, x.jsx)("p", { children: e(T === "project" ? "将从本项目移除该角色及其 {count} 张参考图，画布上被收纳的节点会重新显示。" : "将从全局资产永久删除该角色及其 {count} 张参考图，删除后无法恢复。", { count: J.referenceImages?.length ?? 0 }) })] })]
			}), /* @__PURE__ */ (0, x.jsxs)("footer", {
				className: "character-dialog-footer",
				children: [/* @__PURE__ */ (0, x.jsx)("button", {
					type: "button",
					className: "character-button-secondary",
					onClick: () => I(!1),
					children: e("取消")
				}), /* @__PURE__ */ (0, x.jsx)("button", {
					type: "button",
					className: "character-button-danger",
					onClick: () => void At(),
					children: e("删除角色")
				})]
			})]
		}), document.body) : null,
		J ? /* @__PURE__ */ (0, x.jsxs)(p, {
			isOpen: n,
			onClose: Ot,
			ariaLabel: e("「{name}」的动作库", { name: J.name }),
			className: "h-[min(820px,calc(100vh-32px))] w-[min(1180px,calc(100vw-32px))] border-canvas-border bg-canvas-surface text-canvas-text",
			motionPreset: "quick",
			children: [/* @__PURE__ */ (0, x.jsxs)("header", {
				className: "flex items-center gap-3 border-b border-canvas-border px-5 py-4",
				children: [
					/* @__PURE__ */ (0, x.jsx)("span", {
						className: "grid size-10 shrink-0 place-items-center rounded-xl border border-canvas-border bg-canvas-card text-indigo-400",
						children: /* @__PURE__ */ (0, x.jsx)(m, {
							icon: "lucide:accessibility",
							width: "19",
							height: "19",
							"aria-hidden": "true"
						})
					}),
					/* @__PURE__ */ (0, x.jsxs)("div", {
						className: "min-w-0 flex-1",
						children: [/* @__PURE__ */ (0, x.jsx)("h2", {
							className: "truncate text-[15px] font-semibold",
							children: e("{name} · 动作库", { name: J.name })
						}), /* @__PURE__ */ (0, x.jsx)("p", {
							className: "mt-0.5 text-[11px] text-canvas-text-secondary",
							children: e("{count} 个动作 · 支持为每个动作添加多份图片、GIF 和视频", { count: J.actions?.length ?? 0 })
						})]
					}),
					/* @__PURE__ */ (0, x.jsx)(te, { onClick: Ot })
				]
			}), /* @__PURE__ */ (0, x.jsxs)("div", {
				className: "grid min-h-0 flex-1 grid-cols-[minmax(0,1fr)_360px] max-md:block max-md:overflow-y-auto",
				children: [
					/* @__PURE__ */ (0, x.jsxs)("section", {
						className: "flex min-h-0 flex-col",
						"aria-label": e("动作列表"),
						children: [/* @__PURE__ */ (0, x.jsxs)("div", {
							className: "flex items-center gap-3 border-b border-canvas-border px-4 py-3",
							children: [
								/* @__PURE__ */ (0, x.jsxs)("div", {
									className: "min-w-0 flex-1",
									children: [/* @__PURE__ */ (0, x.jsx)("h3", {
										className: "text-xs font-semibold",
										children: e("动作列表")
									}), /* @__PURE__ */ (0, x.jsx)("p", {
										className: "mt-0.5 text-[10px] text-canvas-text-muted",
										children: e("同一动作可继续添加多份演示素材")
									})]
								}),
								/* @__PURE__ */ (0, x.jsxs)("label", {
									className: "flex items-center gap-2 text-[10px] text-canvas-text-secondary",
									children: [e("角色"), /* @__PURE__ */ (0, x.jsx)(h, {
										value: J.id,
										onChange: (e) => O(e),
										className: "min-w-32 max-w-44",
										triggerStyle: { height: 32 },
										fixedMenu: !0,
										options: q.map((e) => ({
											value: e.id,
											label: e.name
										}))
									})]
								}),
								/* @__PURE__ */ (0, x.jsxs)("label", {
									className: "flex items-center gap-2 text-[10px] text-canvas-text-secondary",
									children: [e("筛选"), /* @__PURE__ */ (0, x.jsx)(h, {
										value: R,
										onChange: (e) => Ze(e),
										className: "min-w-32",
										triggerStyle: { height: 32 },
										fixedMenu: !0,
										options: [{
											value: "all",
											label: e("全部类别")
										}, ...ue.map((t) => ({
											value: t.id,
											label: e(t.label)
										}))]
									})]
								})
							]
						}), /* @__PURE__ */ (0, x.jsx)("div", {
							className: "min-h-0 flex-1 overflow-y-auto p-4",
							children: ht.length === 0 ? /* @__PURE__ */ (0, x.jsxs)("div", {
								className: "flex h-full min-h-52 flex-col items-center justify-center rounded-xl border border-dashed border-canvas-border px-6 text-center",
								children: [
									/* @__PURE__ */ (0, x.jsx)(m, {
										icon: "lucide:accessibility",
										width: "28",
										height: "28",
										className: "text-canvas-text-muted",
										"aria-hidden": "true"
									}),
									/* @__PURE__ */ (0, x.jsx)("h3", {
										className: "mt-3 text-sm font-medium",
										children: e(R === "all" ? "还没有动作" : "这个类别还没有动作")
									}),
									/* @__PURE__ */ (0, x.jsx)("p", {
										className: "mt-1 max-w-72 text-xs leading-5 text-canvas-text-secondary",
										children: e("在右侧选择类别并添加动作，可同时上传多份图片、GIF 或视频")
									})
								]
							}) : /* @__PURE__ */ (0, x.jsx)("div", {
								className: "grid grid-cols-2 items-start gap-3 max-lg:grid-cols-1",
								children: ht.map((t) => {
									let n = ue.find((e) => e.id === t.category), r = t.category === "custom" && t.customCategory ? t.customCategory : n?.label ?? "自定义";
									return /* @__PURE__ */ (0, x.jsxs)("article", {
										className: "character-action-card flex min-w-0 flex-col rounded-xl border border-canvas-border bg-canvas-card p-3 shadow-sm",
										children: [
											/* @__PURE__ */ (0, x.jsxs)("div", {
												className: "flex items-start gap-2",
												children: [
													/* @__PURE__ */ (0, x.jsx)("span", {
														className: "grid size-8 shrink-0 place-items-center rounded-lg border border-canvas-border bg-canvas-surface text-indigo-400",
														children: /* @__PURE__ */ (0, x.jsx)(m, {
															icon: n?.icon ?? "lucide:shapes",
															width: "15",
															height: "15",
															"aria-hidden": "true"
														})
													}),
													/* @__PURE__ */ (0, x.jsxs)("div", {
														className: "min-w-0 flex-1",
														children: [/* @__PURE__ */ (0, x.jsx)("h3", {
															className: "truncate text-xs font-semibold",
															children: t.name
														}), /* @__PURE__ */ (0, x.jsx)("span", {
															className: "mt-1 inline-flex rounded-md border border-canvas-border px-1.5 py-0.5 text-[10px] text-canvas-text-secondary",
															children: e(r)
														})]
													}),
													/* @__PURE__ */ (0, x.jsx)("button", {
														type: "button",
														className: "grid size-7 shrink-0 place-items-center rounded-md text-canvas-text-muted transition-[transform,color,background-color] duration-150 ease-out hover:bg-canvas-hover hover:text-canvas-text active:scale-[.97]",
														"aria-label": e("删除动作「{name}」", { name: t.name }),
														onClick: async () => {
															await je(T, J.id, t.id) && w(e("动作已移除"));
														},
														children: /* @__PURE__ */ (0, x.jsx)(m, {
															icon: "lucide:trash-2",
															width: "13",
															height: "13",
															"aria-hidden": "true"
														})
													})
												]
											}),
											/* @__PURE__ */ (0, x.jsx)("p", {
												className: "mt-2 min-h-10 text-[11px] leading-5 text-canvas-text-secondary",
												children: t.prompt || e("未填写动作提示词")
											}),
											/* @__PURE__ */ (0, x.jsxs)("div", {
												className: "mt-3 grid grid-cols-2 gap-2",
												children: [
													(t.media ?? []).map((n) => /* @__PURE__ */ (0, x.jsxs)("figure", {
														className: "group relative m-0 aspect-video overflow-hidden rounded-lg border border-canvas-border bg-canvas-surface",
														children: [
															n.kind === "video" ? /* @__PURE__ */ (0, x.jsx)(ee, {
																src: n.url,
																className: "size-full object-cover",
																controls: !0,
																"aria-label": n.name
															}) : /* @__PURE__ */ (0, x.jsx)(f, {
																src: n.url,
																alt: n.name,
																className: "size-full object-cover",
																draggable: !1
															}),
															/* @__PURE__ */ (0, x.jsx)("span", {
																className: "pointer-events-none absolute bottom-1 left-1 max-w-[calc(100%-8px)] truncate rounded bg-black/60 px-1.5 py-0.5 text-[9px] text-white",
																children: n.name
															}),
															/* @__PURE__ */ (0, x.jsx)("button", {
																type: "button",
																className: "absolute right-1 top-1 grid size-6 place-items-center rounded-md bg-black/60 text-white transition-[transform,background-color] duration-150 ease-out hover:bg-black/80 active:scale-[.97]",
																"aria-label": e("移除媒体「{name}」", { name: n.name }),
																onClick: async () => {
																	await Ae(T, J.id, t.id, n.id) && w(e("动作媒体已移除"));
																},
																children: /* @__PURE__ */ (0, x.jsx)(m, {
																	icon: "lucide:x",
																	width: "12",
																	height: "12",
																	"aria-hidden": "true"
																})
															})
														]
													}, n.id)),
													/* @__PURE__ */ (0, x.jsxs)("button", {
														type: "button",
														disabled: W,
														className: "flex aspect-video min-h-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-canvas-border text-[10px] text-canvas-text-muted transition-[transform,color,background-color,border-color] duration-150 ease-out hover:border-indigo-400 hover:bg-canvas-surface hover:text-canvas-text active:scale-[.98] disabled:opacity-50",
														onClick: () => Tt(t.id),
														children: [/* @__PURE__ */ (0, x.jsx)(m, {
															icon: "lucide:upload",
															width: "16",
															height: "16",
															"aria-hidden": "true"
														}), e("上传图片 / GIF / 视频")]
													}),
													/* @__PURE__ */ (0, x.jsxs)("button", {
														type: "button",
														"aria-expanded": H === t.id,
														className: "flex aspect-video min-h-20 flex-col items-center justify-center gap-1 rounded-lg border border-dashed border-canvas-border text-[10px] text-canvas-text-muted transition-[transform,color,background-color,border-color] duration-150 ease-out hover:border-indigo-400 hover:bg-canvas-surface hover:text-canvas-text active:scale-[.98]",
														onClick: () => U((e) => e === t.id ? null : t.id),
														children: [/* @__PURE__ */ (0, x.jsx)(m, {
															icon: "lucide:panel-top",
															width: "16",
															height: "16",
															"aria-hidden": "true"
														}), e("从画布添加")]
													}),
													H === t.id ? /* @__PURE__ */ (0, x.jsxs)("div", {
														className: "col-span-2 rounded-lg border border-canvas-border bg-canvas-surface p-2",
														children: [/* @__PURE__ */ (0, x.jsxs)("div", {
															className: "flex items-center justify-between gap-2",
															children: [/* @__PURE__ */ (0, x.jsx)("span", {
																className: "text-[10px] font-medium text-canvas-text-secondary",
																children: e("选择画布图片 / GIF / 视频节点")
															}), /* @__PURE__ */ (0, x.jsx)("button", {
																type: "button",
																className: "grid size-6 place-items-center rounded-md text-canvas-text-muted transition-[color,background-color] duration-150 hover:bg-canvas-hover hover:text-canvas-text",
																"aria-label": e("关闭画布节点选择"),
																onClick: () => U(null),
																children: /* @__PURE__ */ (0, x.jsx)(m, {
																	icon: "lucide:x",
																	width: "12",
																	height: "12",
																	"aria-hidden": "true"
																})
															})]
														}), mt.length === 0 ? /* @__PURE__ */ (0, x.jsxs)("div", {
															className: "mt-2 flex min-h-20 flex-col items-center justify-center gap-1 rounded-md border border-dashed border-canvas-border px-3 text-center text-[10px] text-canvas-text-muted",
															children: [/* @__PURE__ */ (0, x.jsx)(m, {
																icon: "lucide:film",
																width: "16",
																height: "16",
																"aria-hidden": "true"
															}), e("画布中暂无图片、GIF 或视频节点")]
														}) : /* @__PURE__ */ (0, x.jsx)("div", {
															className: "mt-2 grid max-h-48 grid-cols-3 gap-2 overflow-y-auto pr-1 max-sm:grid-cols-2",
															children: mt.map((t) => {
																let n = t.data.videoUrl || t.data.imageUrl || t.data.thumbnailUrl, r = t.data.label || t.data.fileName || e("未命名节点");
																return /* @__PURE__ */ (0, x.jsxs)("button", {
																	type: "button",
																	className: "group min-w-0 overflow-hidden rounded-md border border-canvas-border bg-canvas-card text-left transition-[transform,border-color,background-color] duration-150 ease-out hover:border-indigo-400 hover:bg-canvas-hover active:scale-[.98]",
																	onClick: () => void Dt(t.id),
																	children: [/* @__PURE__ */ (0, x.jsx)("span", {
																		className: "block aspect-video overflow-hidden bg-canvas-bg",
																		children: t.data.videoUrl ? /* @__PURE__ */ (0, x.jsx)(ee, {
																			src: n,
																			className: "size-full object-cover",
																			muted: !0,
																			playsInline: !0,
																			preload: "metadata",
																			"aria-hidden": "true"
																		}) : /* @__PURE__ */ (0, x.jsx)(f, {
																			src: n,
																			alt: "",
																			className: "size-full object-cover",
																			draggable: !1
																		})
																	}), /* @__PURE__ */ (0, x.jsx)("span", {
																		className: "block truncate px-2 py-1.5 text-[10px] text-canvas-text-secondary group-hover:text-canvas-text",
																		children: r
																	})]
																}, t.id);
															})
														})]
													}) : null
												]
											})
										]
									}, t.id);
								})
							})
						})]
					}),
					/* @__PURE__ */ (0, x.jsxs)("form", {
						className: "flex min-h-0 flex-col border-l border-canvas-border bg-canvas-card/80 max-md:border-l-0 max-md:border-t",
						onSubmit: (e) => {
							e.preventDefault(), Ct();
						},
						children: [/* @__PURE__ */ (0, x.jsxs)("div", {
							className: "min-h-0 flex-1 overflow-y-auto p-4",
							children: [
								/* @__PURE__ */ (0, x.jsxs)("div", {
									className: "flex items-center gap-2",
									children: [/* @__PURE__ */ (0, x.jsx)("span", {
										className: "grid size-8 place-items-center rounded-lg bg-indigo-500 text-white",
										children: /* @__PURE__ */ (0, x.jsx)(m, {
											icon: "lucide:plus",
											width: "15",
											height: "15",
											"aria-hidden": "true"
										})
									}), /* @__PURE__ */ (0, x.jsxs)("div", { children: [/* @__PURE__ */ (0, x.jsx)("h3", {
										className: "text-xs font-semibold",
										children: e("添加动作")
									}), /* @__PURE__ */ (0, x.jsx)("p", {
										className: "text-[10px] text-canvas-text-muted",
										children: e("类别在添加时选择")
									})] })]
								}),
								/* @__PURE__ */ (0, x.jsxs)("label", {
									className: "mt-4 grid gap-1 text-[10px] text-canvas-text-secondary",
									children: [e("动作类别"), /* @__PURE__ */ (0, x.jsx)(h, {
										value: L,
										onChange: (e) => Xe(e),
										triggerStyle: { height: 36 },
										fixedMenu: !0,
										options: ue.map((t) => ({
											value: t.id,
											label: e(t.label)
										}))
									})]
								}),
								L === "custom" ? /* @__PURE__ */ (0, x.jsxs)("label", {
									className: "mt-3 grid gap-1 text-[10px] text-canvas-text-secondary",
									children: [e("自定义分类名"), /* @__PURE__ */ (0, x.jsx)("input", {
										value: tt,
										onChange: (e) => nt(e.target.value),
										placeholder: e("例如：武术、特殊技能"),
										className: "h-9 rounded-lg border border-canvas-border bg-canvas-surface px-3 text-xs text-canvas-text outline-none transition-[border-color] duration-150 focus:border-indigo-400"
									})]
								}) : null,
								/* @__PURE__ */ (0, x.jsxs)("label", {
									className: "mt-3 grid gap-1 text-[10px] text-canvas-text-secondary",
									children: [e("动作名称"), /* @__PURE__ */ (0, x.jsx)("input", {
										value: z,
										onChange: (e) => Qe(e.target.value),
										placeholder: e("例如：警戒站姿"),
										className: "h-9 rounded-lg border border-canvas-border bg-canvas-surface px-3 text-xs text-canvas-text outline-none transition-[border-color] duration-150 focus:border-indigo-400"
									})]
								}),
								/* @__PURE__ */ (0, x.jsxs)("label", {
									className: "mt-3 grid gap-1 text-[10px] text-canvas-text-secondary",
									children: [e("动作提示词"), /* @__PURE__ */ (0, x.jsx)("textarea", {
										value: $e,
										onChange: (e) => et(e.target.value),
										placeholder: e("描述姿势、重心、手部动作和运动方向…"),
										rows: 4,
										className: "resize-none rounded-lg border border-canvas-border bg-canvas-surface px-3 py-2 text-xs leading-5 text-canvas-text outline-none transition-[border-color] duration-150 focus:border-indigo-400"
									})]
								}),
								/* @__PURE__ */ (0, x.jsxs)("div", {
									className: "mt-4",
									children: [
										/* @__PURE__ */ (0, x.jsxs)("div", {
											className: "flex items-center justify-between gap-2",
											children: [/* @__PURE__ */ (0, x.jsx)("span", {
												className: "text-[10px] text-canvas-text-secondary",
												children: e("动作媒体")
											}), /* @__PURE__ */ (0, x.jsx)("span", {
												className: "text-[9px] text-canvas-text-muted",
												children: e("可多选")
											})]
										}),
										B.length > 0 ? /* @__PURE__ */ (0, x.jsx)("div", {
											className: "mt-2 grid grid-cols-2 gap-2",
											children: B.map((t) => /* @__PURE__ */ (0, x.jsxs)("figure", {
												className: "relative m-0 aspect-video overflow-hidden rounded-lg border border-canvas-border bg-canvas-surface",
												children: [t.kind === "video" ? /* @__PURE__ */ (0, x.jsx)(ee, {
													src: t.url,
													className: "size-full object-cover",
													"aria-label": t.name
												}) : /* @__PURE__ */ (0, x.jsx)(f, {
													src: t.url,
													alt: t.name,
													className: "size-full object-cover",
													draggable: !1
												}), /* @__PURE__ */ (0, x.jsx)("button", {
													type: "button",
													className: "absolute right-1 top-1 grid size-6 place-items-center rounded-md bg-black/60 text-white transition-transform duration-150 ease-out active:scale-[.97]",
													"aria-label": e("移除待添加媒体「{name}」", { name: t.name }),
													onClick: () => V((e) => e.filter((e) => e.id !== t.id)),
													children: /* @__PURE__ */ (0, x.jsx)(m, {
														icon: "lucide:x",
														width: "12",
														height: "12",
														"aria-hidden": "true"
													})
												})]
											}, t.id))
										}) : null,
										/* @__PURE__ */ (0, x.jsxs)("button", {
											type: "button",
											disabled: W,
											className: "mt-2 flex w-full items-center justify-center gap-2 rounded-lg border border-dashed border-canvas-border bg-canvas-surface px-3 py-3 text-[10px] text-canvas-text-secondary transition-[transform,color,border-color] duration-150 ease-out hover:border-indigo-400 hover:text-canvas-text active:scale-[.98] disabled:opacity-50",
											onClick: () => Tt(null),
											children: [/* @__PURE__ */ (0, x.jsx)(m, {
												icon: W ? "lucide:loader-circle" : "lucide:upload",
												className: W ? "animate-spin" : "",
												width: "14",
												height: "14",
												"aria-hidden": "true"
											}), e(W ? "正在处理媒体…" : "添加多份图片、GIF 或视频")]
										})
									]
								})
							]
						}), /* @__PURE__ */ (0, x.jsx)("footer", {
							className: "border-t border-canvas-border p-4",
							children: /* @__PURE__ */ (0, x.jsxs)("button", {
								type: "submit",
								disabled: !z.trim() || G || W,
								className: "inline-flex h-10 w-full items-center justify-center gap-2 rounded-lg bg-indigo-500 px-4 text-xs font-medium text-white transition-[transform,opacity,background-color] duration-150 ease-out hover:bg-indigo-400 active:scale-[.98] disabled:cursor-not-allowed disabled:opacity-50",
								children: [/* @__PURE__ */ (0, x.jsx)(m, {
									icon: G ? "lucide:loader-circle" : "lucide:plus",
									className: G ? "animate-spin" : "",
									width: "14",
									height: "14",
									"aria-hidden": "true"
								}), e(G ? "正在保存…" : "添加到动作库")]
							})
						})]
					}),
					/* @__PURE__ */ (0, x.jsx)("input", {
						ref: st,
						type: "file",
						accept: de,
						multiple: !0,
						className: "sr-only",
						onChange: (e) => void Et(e)
					})
				]
			})]
		}) : null,
		qe ? (0, y.createPortal)(/* @__PURE__ */ (0, x.jsx)(oe, {
			isOpen: !0,
			sourceNodeId: qe,
			initialScope: T,
			initialCharacterId: J?.id,
			onClose: () => Je(null)
		}), document.body) : null
	] });
}
//#endregion
export { ye as default };
