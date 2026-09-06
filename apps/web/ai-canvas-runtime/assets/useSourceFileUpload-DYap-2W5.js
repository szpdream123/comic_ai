import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./jsx-runtime-BAkIPmuO.js";
import { I as r, L as i, Li as a, R as o, c as s, l as c, t as l } from "./useAppStore-BH-MdRLu.js";
import { a as u, i as d, o as f, t as p } from "./core-D3lATfku.js";
import { O as m } from "./fileService-BawXHbsK.js";
import { t as h } from "./ModalOverlay-B0YAfIbK.js";
import { B as g, Kt as _, Nt as v } from "./useTooltipAutoPlacement-D1FArkVS.js";
import { n as y } from "./rasterImageDimensions-CX1VK2cM.js";
import { a as b, l as x, o as S, r as C, t as w, u as T } from "./pluginRuntime-DJdo3vtj.js";
//#region src/components/nodes/shared/toolbar/toolbarRegistry.ts
var E = /* @__PURE__ */ e(t(), 1), D = "more";
function O(e) {
	return `${e.pluginId}:${e.tool.id}`;
}
function k(e, t) {
	return S(e, t, "node-toolbar").map((e) => ({
		key: O(e),
		label: `${e.tool.title} · ${e.pluginName}`,
		icon: e.tool.icon || "lucide:blocks",
		defaultZone: "更多"
	}));
}
function A(e) {
	return {
		key: D,
		label: "更多",
		icon: "mdi:dots-horizontal",
		defaultZone: e
	};
}
var j = [
	{
		key: "copy",
		label: "复制",
		icon: "mdi:content-copy",
		defaultZone: "常用"
	},
	{
		key: "clearEmptyLines",
		label: "清除空行",
		icon: "mdi:format-line-spacing",
		defaultZone: "常用"
	},
	{
		key: "showPrompt",
		label: "查看提示词",
		icon: "mdi:message-text-outline",
		defaultZone: "常用"
	},
	{
		key: "fullscreen",
		label: "全屏显示",
		icon: "mdi:fullscreen",
		defaultZone: "常用"
	},
	A("常用")
], M = [
	{
		key: "copyFile",
		label: "复制视频",
		icon: "mdi:content-copy",
		defaultZone: "常用"
	},
	{
		key: "captureFrame",
		label: "截取帧",
		icon: "mdi:camera-outline",
		defaultZone: "常用"
	},
	{
		key: "showPrompt",
		label: "查看提示词",
		icon: "mdi:message-text-outline",
		defaultZone: "常用"
	},
	{
		key: "reversePrompt",
		label: "反推提示词",
		icon: "mdi:text-search",
		defaultZone: "常用"
	},
	{
		key: "fullscreen",
		label: "全屏预览",
		icon: "mdi:fullscreen",
		defaultZone: "常用"
	},
	A("常用")
], N = [
	{
		key: "upload",
		label: "上传全景图",
		icon: "mdi:upload",
		defaultZone: "常用"
	},
	{
		key: "toggleMode",
		label: "切换视图模式",
		icon: "mdi:rotate-3d",
		defaultZone: "常用"
	},
	{
		key: "screenshot",
		label: "截图当前视角",
		icon: "mdi:camera",
		defaultZone: "常用"
	},
	{
		key: "fullscreen",
		label: "全屏显示",
		icon: "mdi:fullscreen",
		defaultZone: "常用"
	},
	A("常用")
], P = [
	{
		key: "matting",
		label: "遮罩编辑器",
		icon: "mdi:circle-edit-outline",
		defaultZone: "Primary"
	},
	{
		key: "expand",
		label: "扩图",
		icon: "mdi:arrow-expand-all",
		defaultZone: "Primary"
	},
	{
		key: "multiGrid",
		label: "宫格裁切",
		icon: "mdi:grid",
		defaultZone: "Primary"
	},
	{
		key: "cameraStudio",
		label: "小逻摄影棚",
		icon: "mdi:camera-control",
		defaultZone: "Primary"
	},
	{
		key: "repaint",
		label: "查看提示词",
		icon: "mdi:message-text-outline",
		defaultZone: "Primary"
	},
	{
		key: "upscale",
		label: "高清超分",
		icon: "mdi:image-auto-adjust",
		defaultZone: "Primary"
	},
	{
		key: "subjectMatting",
		label: "自动识别主体",
		icon: "mdi:hexagon-outline",
		defaultZone: "Primary"
	},
	{
		key: "annotate",
		label: "标注",
		icon: "mdi:draw-pen",
		defaultZone: "Primary"
	},
	{
		key: "crop",
		label: "裁切",
		icon: "mdi:crop",
		defaultZone: "Primary"
	},
	{
		key: "compose",
		label: "多图编辑",
		icon: "mdi:layers-triple-outline",
		defaultZone: "Primary"
	},
	A("Primary"),
	{
		key: "upload",
		label: "上传图片",
		icon: "mdi:upload",
		defaultZone: "Primary"
	},
	{
		key: "reversePrompt",
		label: "反推提示词",
		icon: "mdi:text-search",
		defaultZone: "Primary"
	},
	{
		key: "copyFile",
		label: "复制图像",
		icon: "mdi:content-copy",
		defaultZone: "Secondary"
	},
	{
		key: "history",
		label: "生成历史",
		icon: "mdi:history",
		defaultZone: "Secondary"
	},
	{
		key: "fullscreen",
		label: "全屏显示",
		icon: "mdi:fullscreen",
		defaultZone: "Secondary"
	}
], F = [
	{
		key: "togglePlay",
		label: "播放/暂停",
		icon: "mdi:play-pause",
		defaultZone: "常用"
	},
	{
		key: "speechToText",
		label: "语音转文本",
		icon: "mdi:microphone-message",
		defaultZone: "常用"
	},
	{
		key: "transcribe",
		label: "转录音频",
		icon: "mdi:text-box-search-outline",
		defaultZone: "常用"
	},
	{
		key: "copyFile",
		label: "复制音频",
		icon: "mdi:content-copy",
		defaultZone: "常用"
	},
	{
		key: "upload",
		label: "上传音频",
		icon: "mdi:upload",
		defaultZone: "常用"
	},
	{
		key: "fullscreen",
		label: "全屏显示",
		icon: "mdi:fullscreen",
		defaultZone: "常用"
	},
	A("常用")
];
function I(e, t = 1) {
	let n = /* @__PURE__ */ new Map();
	for (let t of e) {
		let e = n.get(t.defaultZone) || [];
		e.push(t.key), n.set(t.defaultZone, e);
	}
	let r = [], i = 0;
	for (let [e, t] of n) r.push({
		id: `zone-${i++}`,
		name: e,
		buttonKeys: t
	});
	return {
		zones: r,
		version: t
	};
}
var ee = I(j, 2), te = I(M, 2), ne = I(N, 2), re = I(P, 8), ie = I(F, 3);
function ae(e) {
	if (e.version >= 7) return e;
	let t = e.zones.some((e) => e.buttonKeys.includes("cameraStudio")), n = e.zones.map((e) => {
		let n = [];
		for (let r of e.buttonKeys) {
			if (r === "multiAngle") {
				t ||= (n.push("cameraStudio"), !0);
				continue;
			}
			n.push(r);
		}
		return {
			...e,
			buttonKeys: n
		};
	});
	if (!t && e.version < 3) {
		let e = n.findIndex((e) => e.name === "Primary");
		e >= 0 ? n[e] = {
			...n[e],
			buttonKeys: [...n[e].buttonKeys, "cameraStudio"]
		} : n.push({
			id: "zone-camera-studio",
			name: "Primary",
			buttonKeys: ["cameraStudio"]
		});
	}
	if (!n.some((e) => e.buttonKeys.includes("history"))) {
		let e = n.findIndex((e) => e.name === "Secondary");
		if (e >= 0) n[e] = {
			...n[e],
			buttonKeys: [...n[e].buttonKeys, "history"]
		};
		else if (n.length > 0) {
			let e = n.length - 1;
			n[e] = {
				...n[e],
				buttonKeys: [...n[e].buttonKeys, "history"]
			};
		} else n = [{
			id: "zone-image-history",
			name: "Secondary",
			buttonKeys: ["history"]
		}];
	}
	return e.version === 4 && (n = n.map((e) => {
		let t = e.buttonKeys.indexOf("history"), n = e.buttonKeys.indexOf("fullscreen");
		if (t < 0 || n !== t + 1) return e;
		let r = [...e.buttonKeys];
		return [r[t], r[n]] = [r[n], r[t]], {
			...e,
			buttonKeys: r
		};
	})), [[[
		"matting",
		"expand",
		"multiGrid",
		"cameraStudio",
		"repaint",
		"upscale",
		"subjectMatting"
	], [
		"annotate",
		"crop",
		"compose",
		"upload",
		"copyFile",
		"fullscreen",
		"history"
	]], [[
		"matting",
		"expand",
		"multiGrid",
		"cameraStudio",
		"repaint",
		"upscale",
		"subjectMatting",
		"annotate",
		"crop",
		"compose",
		"upload",
		"copyFile"
	], ["fullscreen", "history"]]].some((e) => n.length === e.length && n.every((t, n) => t.buttonKeys.length === e[n].length && t.buttonKeys.every((t, r) => t === e[n][r]))) ? V("ai-image") : {
		...e,
		zones: n,
		version: 7
	};
}
function L(e) {
	if (e.zones.some((e) => e.buttonKeys.includes("speechToText"))) return e;
	let t = e.zones.map((e) => ({
		...e,
		buttonKeys: [...e.buttonKeys]
	})), n = t.findIndex((e) => e.buttonKeys.includes("togglePlay"));
	if (n >= 0) {
		let r = t[n].buttonKeys.indexOf("togglePlay") + 1;
		return t[n].buttonKeys.splice(r, 0, "speechToText"), {
			...e,
			zones: t
		};
	}
	return t.length > 0 ? (t[0].buttonKeys.unshift("speechToText"), {
		...e,
		zones: t
	}) : {
		...e,
		zones: [{
			id: "zone-audio-asr",
			name: "常用",
			buttonKeys: ["speechToText"]
		}]
	};
}
function R(e, t) {
	let n = e === "ai-image" ? 8 : e === "ai-audio" ? 3 : [
		"ai-text",
		"ai-video",
		"ai-panorama"
	].includes(e) ? 2 : t.version;
	if (t.version >= n) return t;
	let r = e === "ai-image" ? ae(t) : e === "ai-audio" ? L(t) : t;
	if (r.version >= n) return r;
	let i = z(e).find((e) => e.key === D);
	if (!i) return r;
	let a = r.zones.map((e) => ({
		...e,
		buttonKeys: [...e.buttonKeys]
	}));
	if (!a.some((e) => e.buttonKeys.includes("more"))) {
		let t = a.findIndex((e) => e.name === i.defaultZone);
		if (t < 0 && (t = a.length - 1), t >= 0) {
			let n = a[t], r = [...n.buttonKeys], i = e === "ai-image" ? r.indexOf("compose") : -1;
			r.splice(i >= 0 ? i + 1 : r.length, 0, D), a[t] = {
				...n,
				buttonKeys: r
			};
		} else a = [{
			id: "zone-more",
			name: i.defaultZone,
			buttonKeys: [D]
		}];
	}
	return {
		...r,
		zones: a,
		version: n
	};
}
function z(e) {
	switch (e) {
		case "ai-text": return j;
		case "ai-video": return M;
		case "ai-panorama": return N;
		case "ai-image": return P;
		case "ai-audio": return F;
		default: return [];
	}
}
function B(e, t) {
	return e.filter((e) => e.key !== "more" && !t.has(e.key));
}
function V(e) {
	let t = (e) => ({
		...e,
		zones: e.zones.map((e) => ({
			...e,
			buttonKeys: [...e.buttonKeys]
		}))
	});
	switch (e) {
		case "ai-text": return t(ee);
		case "ai-video": return t(te);
		case "ai-panorama": return t(ne);
		case "ai-image": return t(re);
		case "ai-audio": return t(ie);
		default: return {
			zones: [],
			version: 1
		};
	}
}
//#endregion
//#region src/hooks/useToolbarEdit.ts
var oe = 600;
function H({ nodeType: e }) {
	let t = l((t) => t.toolbarLayouts[e]), n = l((e) => e.setToolbarLayout), r = l((e) => e.installedPlugins), i = (0, E.useMemo)(() => [...z(e), ...k(r, e)], [r, e]), [a, o] = (0, E.useState)(!1), [s, c] = (0, E.useState)(null), u = (0, E.useMemo)(() => R(e, t ?? V(e)), [e, t]), d = a && s ? s : u, f = (0, E.useRef)(null), p = (0, E.useRef)(!1), m = (0, E.useCallback)(() => {
		f.current &&= (clearTimeout(f.current), null);
	}, []), h = (0, E.useCallback)(() => {
		p.current = !1, f.current = setTimeout(() => {
			p.current = !0, o((e) => (e || c(structuredClone(u)), !e));
		}, oe);
	}, [u]), g = (0, E.useCallback)(() => {
		m();
	}, [m]), _ = (0, E.useCallback)(() => {
		o(!1), s && n(e, s), c(null);
	}, [
		s,
		e,
		n
	]), v = (0, E.useCallback)((e, t) => {
		c((n) => n && {
			...n,
			zones: n.zones.map((n) => n.id === e ? {
				...n,
				buttonKeys: n.buttonKeys.filter((e) => e !== t)
			} : n)
		});
	}, []), y = (0, E.useCallback)((e, t) => {
		c((n) => !n || n.zones.some((e) => e.buttonKeys.includes(t)) ? n : {
			...n,
			zones: n.zones.map((n) => n.id === e ? {
				...n,
				buttonKeys: [...n.buttonKeys, t]
			} : n)
		});
	}, []), b = (0, E.useCallback)((e, t, n, r) => {
		c((i) => {
			if (!i) return i;
			if (e === n) {
				let n = i.zones.findIndex((t) => t.id === e);
				if (n === -1) return i;
				let a = i.zones[n], o = [...a.buttonKeys], [s] = o.splice(t, 1);
				o.splice(r, 0, s);
				let c = [...i.zones];
				return c[n] = {
					...a,
					buttonKeys: o
				}, {
					...i,
					zones: c
				};
			}
			let a = i.zones.find((t) => t.id === e);
			if (!a) return i;
			let o = a.buttonKeys[t];
			if (!o) return i;
			let s = i.zones.map((i) => {
				if (i.id === e) {
					let e = [...i.buttonKeys];
					return e.splice(t, 1), {
						...i,
						buttonKeys: e
					};
				}
				if (i.id === n) {
					let e = [...i.buttonKeys];
					return e.splice(r, 0, o), {
						...i,
						buttonKeys: e
					};
				}
				return i;
			}).filter((t) => t.buttonKeys.length > 0 || t.id === e || t.id === n);
			return {
				...i,
				zones: s
			};
		});
	}, []), x = (0, E.useCallback)(() => {
		c((e) => {
			if (!e) return e;
			let t = `zone-${Date.now()}`;
			return {
				...e,
				zones: [...e.zones, {
					id: t,
					name: "新分区",
					buttonKeys: []
				}]
			};
		});
	}, []), S = (0, E.useCallback)((e) => {
		c((t) => {
			if (!t) return t;
			let n = t.zones.filter((t) => t.id !== e || t.buttonKeys.length > 0);
			return n.length === 0 ? {
				...t,
				zones: [{
					id: "zone-0",
					name: "常用",
					buttonKeys: []
				}]
			} : {
				...t,
				zones: n
			};
		});
	}, []), C = (0, E.useCallback)((e, t) => {
		c((n) => n && {
			...n,
			zones: n.zones.map((n) => n.id === e ? {
				...n,
				name: t
			} : n)
		});
	}, []), w = (0, E.useCallback)((e) => {
		c(structuredClone(e));
	}, []), T = (0, E.useCallback)(() => {
		let t = V(e);
		c(structuredClone(t));
	}, [e]), D = (0, E.useMemo)(() => {
		let e = /* @__PURE__ */ new Set();
		for (let t of d.zones) for (let n of t.buttonKeys) e.add(n);
		return e;
	}, [d]), O = (0, E.useMemo)(() => i.filter((e) => !D.has(e.key)), [i, D]);
	return {
		isEditing: a,
		layout: d,
		exitEdit: _,
		longPressHandlers: (0, E.useMemo)(() => ({
			onMouseDown: h,
			onMouseUp: g,
			onMouseLeave: g,
			onTouchStart: h,
			onTouchEnd: g
		}), [h, g]),
		removeButton: v,
		addButton: y,
		moveButtonAcross: b,
		addZone: x,
		removeZone: S,
		renameZone: C,
		setToolbarLayout: w,
		resetLayout: T,
		registry: i,
		activeButtonKeys: D,
		removedButtons: O
	};
}
//#endregion
//#region src/components/nodes/shared/toolbar/ToolbarEditor.tsx
var U = n(), W = 5, se = 420, ce = 1.2, le = (e) => 1 - (1 - e) ** 3;
function G({ icon: e }) {
	return e ? e.includes(":") ? /* @__PURE__ */ (0, U.jsx)(y, {
		icon: e,
		width: 14,
		height: 14
	}) : /* @__PURE__ */ (0, U.jsx)("span", {
		style: { fontSize: 12 },
		children: e
	}) : null;
}
function ue({ icon: e, label: t, isPreset: n, onClick: r }) {
	return /* @__PURE__ */ (0, U.jsxs)("button", {
		type: "button",
		className: `toolbar-edit-bank-item nodrag${n ? " is-preset" : ""}`,
		onClick: r,
		"data-tooltip": t,
		children: [/* @__PURE__ */ (0, U.jsx)("span", {
			className: "toolbar-edit-bank-icon",
			children: /* @__PURE__ */ (0, U.jsx)(G, { icon: e })
		}), /* @__PURE__ */ (0, U.jsx)("span", {
			className: "toolbar-edit-bank-label",
			children: t
		})]
	});
}
function de({ name: e, onRename: t }) {
	let [n, r] = (0, E.useState)(!1), [i, a] = (0, E.useState)(e), o = (0, E.useRef)(null);
	return (0, E.useEffect)(() => {
		n && o.current && (o.current.focus(), o.current.select());
	}, [n]), n ? /* @__PURE__ */ (0, U.jsx)("input", {
		ref: o,
		className: "toolbar-edit-zone-name-input nodrag",
		value: i,
		onChange: (e) => a(e.target.value),
		onBlur: () => {
			t(i || e), r(!1);
		},
		onKeyDown: (n) => {
			n.key === "Enter" && (t(i || e), r(!1)), n.key === "Escape" && (a(e), r(!1));
		},
		onClick: (e) => e.stopPropagation()
	}) : /* @__PURE__ */ (0, U.jsxs)("span", {
		className: "toolbar-edit-zone-name",
		onClick: (e) => {
			e.stopPropagation(), r(!0);
		},
		"data-tooltip": "点击编辑分区名",
		children: [e, /* @__PURE__ */ (0, U.jsx)(y, {
			icon: "mdi:pencil",
			width: 10,
			height: 10,
			style: {
				marginLeft: 4,
				opacity: .5
			}
		})]
	});
}
function fe({ edit: e, presetItems: t = [], userPresetItems: n = [], nodeType: r }) {
	let i = (0, E.useRef)(null), o = (0, E.useRef)(null), s = (0, E.useRef)(null), c = (0, E.useRef)(null), { getViewport: u, screenToFlowPosition: d, setCenter: f, setViewport: p } = a(), m = (0, E.useRef)(null), h = (0, E.useRef)(null), [_, v] = (0, E.useState)(null), [b, x] = (0, E.useState)(null), [S, C] = (0, E.useState)(null), w = (0, E.useRef)(null), T = e.layout.zones, D = e.moveButtonAcross, O = e.setToolbarLayout, k = e.exitEdit, A = (0, E.useCallback)(() => {
		let e = m.current;
		e && (m.current = null, p(e, {
			duration: se,
			ease: le
		}));
	}, [p]), j = (0, E.useCallback)(() => {
		A(), k();
	}, [k, A]);
	(0, E.useEffect)(() => (h.current !== null && (cancelAnimationFrame(h.current), h.current = null), () => {
		m.current && (h.current = requestAnimationFrame(() => {
			h.current = null, A();
		}));
	}), [A]), (0, E.useEffect)(() => {
		if (!e.isEditing) return;
		m.current ??= u();
		let t = requestAnimationFrame(() => {
			let e = i.current;
			if (!e) return;
			let t = e.getBoundingClientRect(), n = d({
				x: t.left + t.width / 2,
				y: t.top + t.height / 2
			});
			f(n.x, n.y, {
				zoom: ce,
				duration: se,
				ease: le
			});
		});
		return () => cancelAnimationFrame(t);
	}, [
		e.isEditing,
		u,
		d,
		f
	]);
	let M = (0, E.useCallback)((e) => {
		let t = i.current?.querySelector(".toolbar-edit-zones"), n = t ? Array.from(t.querySelectorAll(".toolbar-edit-zone")) : [];
		if (!t || n.length === 0) return null;
		let r = t.getBoundingClientRect();
		if (e < r.top - 24 || e > r.bottom + 24) return null;
		for (let t = 0; t < n.length; t++) {
			let r = n[t].getBoundingClientRect();
			if (e < r.top + r.height / 2) return t;
		}
		return n.length;
	}, []), N = (0, E.useCallback)((e) => {
		C((t) => t === e ? t : e);
	}, []), P = (0, E.useCallback)((e, t, n) => {
		let r = c.current;
		r && (r.style.setProperty("--toolbar-zone-drag-x", `${e - n.offsetX}px`), r.style.setProperty("--toolbar-zone-drag-y", `${t - n.offsetY}px`));
	}, []), F = (0, E.useCallback)((e, t, n) => {
		e.active = !0, x(e.fromIndex), i.current?.classList.add("is-zone-dragging"), document.body.classList.add("toolbar-edit-zone-dragging");
		let r = e.sourceEl.cloneNode(!0);
		r.classList.remove("is-zone-drag-from", "is-zone-drag-over", "is-zone-drag-over-end"), r.classList.add("toolbar-edit-zone-drag-ghost"), r.removeAttribute("data-zone-id"), r.querySelectorAll("[data-tooltip]").forEach((e) => e.removeAttribute("data-tooltip")), r.setAttribute("aria-hidden", "true"), r.style.width = `${e.sourceEl.getBoundingClientRect().width}px`, document.body.appendChild(r), c.current = r, P(t, n, e);
	}, [P]), I = (0, E.useCallback)(() => {
		let e = w.current;
		e && (w.current = null, e.frameId !== null && cancelAnimationFrame(e.frameId), i.current?.classList.remove("is-zone-dragging"), document.body.classList.remove("toolbar-edit-zone-dragging"), c.current?.remove(), c.current = null, x(null), N(null), e.captureEl.hasPointerCapture(e.pointerId) && e.captureEl.releasePointerCapture(e.pointerId));
	}, [N]), ee = (0, E.useCallback)((e, t) => {
		let n = w.current;
		n && (n.lastX = e, n.lastY = t, n.frameId === null && (n.frameId = requestAnimationFrame(() => {
			let e = w.current;
			e?.active && (e.frameId = null, P(e.lastX, e.lastY, e), N(M(e.lastY)));
		})));
	}, [
		M,
		P,
		N
	]), te = (0, E.useCallback)((e, t) => {
		if (!e.isPrimary || e.button !== 0) return;
		e.preventDefault(), e.stopPropagation();
		let n = e.currentTarget;
		n.setPointerCapture(e.pointerId);
		let r = n.closest(".toolbar-edit-zone");
		if (!r) {
			n.releasePointerCapture(e.pointerId);
			return;
		}
		let i = r.getBoundingClientRect();
		w.current = {
			fromIndex: t,
			pointerId: e.pointerId,
			startX: e.clientX,
			startY: e.clientY,
			lastX: e.clientX,
			lastY: e.clientY,
			offsetX: e.clientX - i.left,
			offsetY: e.clientY - i.top,
			active: !1,
			frameId: null,
			sourceEl: r,
			captureEl: n
		};
	}, []), ne = (0, E.useCallback)((e) => {
		let t = w.current;
		if (!(!t || e.pointerId !== t.pointerId)) {
			if (e.preventDefault(), !t.active) {
				let n = e.clientX - t.startX, r = e.clientY - t.startY;
				if (n * n + r * r < W * W) return;
				F(t, e.clientX, e.clientY);
			}
			ee(e.clientX, e.clientY);
		}
	}, [ee, F]), re = (0, E.useCallback)((t) => {
		let n = w.current;
		if (!n || t.pointerId !== n.pointerId) return;
		let r = n.active ? M(t.clientY) : null;
		if (I(), r !== null && r !== n.fromIndex && r !== n.fromIndex + 1) {
			let t = [...T], [i] = t.splice(n.fromIndex, 1), a = r > n.fromIndex ? r - 1 : r;
			t.splice(a, 0, i), O({
				...e.layout,
				zones: t
			});
		}
	}, [
		M,
		e.layout,
		I,
		O,
		T
	]), ie = (0, E.useCallback)((e) => {
		w.current?.pointerId === e.pointerId && I();
	}, [I]), ae = l((e) => e.userPresets), L = (0, E.useMemo)(() => {
		let e = g(r), t = [], n = (e) => {
			for (let r of e) r.promptTemplate && t.push({
				id: r.id,
				title: r.title,
				icon: r.icon,
				description: r.description
			}), r.children && n(r.children);
		};
		return n(e), t;
	}, [r]), R = (0, E.useMemo)(() => ae.filter((e) => e.nodeType === r), [ae, r]), z = (0, E.useCallback)((e, t) => {
		if (!i.current) return null;
		let n = Array.from(i.current.querySelectorAll(".toolbar-edit-zone"));
		for (let r of n) {
			let n = r.getBoundingClientRect();
			if (t >= n.top && t <= n.bottom && e >= n.left && e <= n.right) {
				let n = r.dataset.zoneId;
				if (!n) return null;
				let i = r.querySelector(".toolbar-edit-zone-body"), a = i ? Array.from(i.querySelectorAll(".toolbar-edit-btn")) : [];
				if (a.length === 0) return {
					zoneId: n,
					index: 0
				};
				let o = [];
				a.forEach((e, t) => {
					let n = e.getBoundingClientRect(), r = o.at(-1);
					if (!r || n.top > r.bottom - 2) {
						o.push({
							top: n.top,
							bottom: n.bottom,
							items: [{
								index: t,
								rect: n
							}]
						});
						return;
					}
					r.bottom = Math.max(r.bottom, n.bottom), r.items.push({
						index: t,
						rect: n
					});
				});
				let s = o[0], c = Infinity;
				for (let e of o) {
					let n = t < e.top ? e.top - t : t > e.bottom ? t - e.bottom : 0;
					n < c && (s = e, c = n);
				}
				for (let t of s.items) if (e < t.rect.left + t.rect.width / 2) return {
					zoneId: n,
					index: t.index
				};
				return {
					zoneId: n,
					index: s.items.at(-1).index + 1
				};
			}
		}
		return null;
	}, []), B = (0, E.useCallback)((e) => {
		v((t) => t?.zoneId === e?.zoneId && t?.index === e?.index ? t : e);
	}, []), V = (0, E.useCallback)((e, t, n) => {
		let r = s.current;
		r && (r.style.setProperty("--toolbar-drag-x", `${e - n.offsetX}px`), r.style.setProperty("--toolbar-drag-y", `${t - n.offsetY}px`));
	}, []), oe = (0, E.useCallback)((e, t, n) => {
		e.active = !0, e.sourceEl.classList.add("is-dragging"), i.current?.classList.add("is-dragging"), document.body.classList.add("toolbar-edit-dragging");
		let r = e.sourceEl.cloneNode(!0);
		r.classList.remove("is-dragging"), r.classList.add("toolbar-edit-drag-ghost"), r.removeAttribute("data-tooltip"), r.querySelectorAll("[data-tooltip]").forEach((e) => e.removeAttribute("data-tooltip")), r.setAttribute("aria-hidden", "true"), r.style.width = `${e.sourceEl.getBoundingClientRect().width}px`, document.body.appendChild(r), s.current = r, V(t, n, e);
	}, [V]), H = (0, E.useCallback)(() => {
		let e = o.current;
		e && (o.current = null, e.frameId !== null && cancelAnimationFrame(e.frameId), e.sourceEl.classList.remove("is-dragging"), i.current?.classList.remove("is-dragging"), document.body.classList.remove("toolbar-edit-dragging"), s.current?.remove(), s.current = null, B(null), e.captureEl.hasPointerCapture(e.pointerId) && e.captureEl.releasePointerCapture(e.pointerId));
	}, [B]), fe = (0, E.useCallback)((e, t) => {
		let n = o.current;
		n && (n.lastX = e, n.lastY = t, n.frameId === null && (n.frameId = requestAnimationFrame(() => {
			let e = o.current;
			e?.active && (e.frameId = null, V(e.lastX, e.lastY, e), B(z(e.lastX, e.lastY)));
		})));
	}, [
		z,
		V,
		B
	]), pe = (0, E.useCallback)((e, t, n) => {
		if (!e.isPrimary || e.button !== 0 || e.target.closest("button")) return;
		e.preventDefault(), e.stopPropagation();
		let r = e.currentTarget;
		r.setPointerCapture(e.pointerId);
		let i = r.getBoundingClientRect();
		o.current = {
			zoneId: t,
			index: n,
			pointerId: e.pointerId,
			startX: e.clientX,
			startY: e.clientY,
			lastX: e.clientX,
			lastY: e.clientY,
			offsetX: e.clientX - i.left,
			offsetY: e.clientY - i.top,
			active: !1,
			frameId: null,
			sourceEl: r,
			captureEl: r
		};
	}, []), me = (0, E.useCallback)((e) => {
		let t = o.current;
		if (!(!t || e.pointerId !== t.pointerId)) {
			if (e.preventDefault(), !t.active) {
				let n = e.clientX - t.startX, r = e.clientY - t.startY;
				if (n * n + r * r < W * W) return;
				oe(t, e.clientX, e.clientY);
			}
			fe(e.clientX, e.clientY);
		}
	}, [fe, oe]), he = (0, E.useCallback)((e) => {
		let t = o.current;
		if (!(!t || e.pointerId !== t.pointerId)) {
			if (t.active) {
				let n = z(e.clientX, e.clientY);
				if (n) {
					let e = n.zoneId === t.zoneId && n.index > t.index ? n.index - 1 : n.index;
					(n.zoneId !== t.zoneId || e !== t.index) && D(t.zoneId, t.index, n.zoneId, e);
				}
			}
			H();
		}
	}, [
		z,
		D,
		H
	]), ge = (0, E.useCallback)((e) => {
		o.current?.pointerId === e.pointerId && H();
	}, [H]), K = (0, E.useCallback)((e) => {
		w.current ? ne(e) : me(e);
	}, [me, ne]), _e = (0, E.useCallback)((e) => {
		w.current ? re(e) : he(e);
	}, [he, re]), ve = (0, E.useCallback)((e) => {
		w.current ? ie(e) : ge(e);
	}, [ge, ie]);
	(0, E.useEffect)(() => () => {
		let e = o.current;
		e?.frameId !== null && e?.frameId !== void 0 && cancelAnimationFrame(e.frameId), e?.sourceEl.classList.remove("is-dragging");
		let t = w.current;
		t?.frameId !== null && t?.frameId !== void 0 && cancelAnimationFrame(t.frameId), document.body.classList.remove("toolbar-edit-dragging"), document.body.classList.remove("toolbar-edit-zone-dragging"), s.current?.remove(), c.current?.remove(), s.current = null, c.current = null, o.current = null, w.current = null;
	}, []), (0, E.useEffect)(() => {
		let t = (e) => {
			i.current && !i.current.contains(e.target) && j();
		};
		if (e.isEditing) return document.addEventListener("mousedown", t, !0), () => document.removeEventListener("mousedown", t, !0);
	}, [e.isEditing, j]);
	let q = (0, E.useCallback)((t) => {
		let n = T[0]?.id;
		n && e.addButton(n, t);
	}, [e, T]);
	if (!e.isEditing) return null;
	let ye = e.removedButtons;
	return /* @__PURE__ */ (0, U.jsxs)("div", {
		className: `toolbar-editor nodrag toolbar-editor--${r}`,
		ref: i,
		onPointerMove: K,
		onPointerUp: _e,
		onPointerCancel: ve,
		onLostPointerCapture: ve,
		children: [/* @__PURE__ */ (0, U.jsxs)("div", {
			className: "toolbar-edit-bank nodrag",
			children: [
				/* @__PURE__ */ (0, U.jsxs)("div", {
					className: "toolbar-edit-bank-header",
					children: [/* @__PURE__ */ (0, U.jsx)("span", { children: "按钮库" }), /* @__PURE__ */ (0, U.jsx)("span", {
						className: "toolbar-edit-bank-hint",
						children: "点击添加按钮到下方 Toolbar"
					})]
				}),
				/* @__PURE__ */ (0, U.jsxs)("div", {
					className: "toolbar-edit-bank-list nodrag",
					children: [
						ye.map((e) => /* @__PURE__ */ (0, U.jsx)(ue, {
							icon: e.icon,
							label: e.label,
							onClick: () => q(e.key)
						}, e.key)),
						t.map((t) => e.activeButtonKeys.has(t.id) ? null : /* @__PURE__ */ (0, U.jsx)(ue, {
							icon: t.icon,
							label: t.title,
							isPreset: !0,
							onClick: () => q(t.id)
						}, `preset-${t.id}`)),
						n.map((t) => e.activeButtonKeys.has(t.id) ? null : /* @__PURE__ */ (0, U.jsx)(ue, {
							icon: t.icon || "mdi:star",
							label: t.name,
							isPreset: !0,
							onClick: () => q(t.id)
						}, `upreset-${t.id}`))
					]
				}),
				/* @__PURE__ */ (0, U.jsxs)("div", {
					className: "toolbar-edit-bank-actions",
					children: [/* @__PURE__ */ (0, U.jsxs)("button", {
						type: "button",
						className: "toolbar-edit-action-btn nodrag",
						onClick: e.resetLayout,
						"data-tooltip": "恢复为默认按钮布局",
						children: [/* @__PURE__ */ (0, U.jsx)(y, {
							icon: "mdi:restore",
							width: 14,
							height: 14
						}), /* @__PURE__ */ (0, U.jsx)("span", { children: "恢复默认" })]
					}), /* @__PURE__ */ (0, U.jsxs)("button", {
						type: "button",
						className: "toolbar-edit-action-btn toolbar-edit-action-btn--done nodrag",
						onClick: j,
						children: [/* @__PURE__ */ (0, U.jsx)(y, {
							icon: "mdi:check",
							width: 14,
							height: 14
						}), /* @__PURE__ */ (0, U.jsx)("span", { children: "完成" })]
					})]
				})
			]
		}), /* @__PURE__ */ (0, U.jsxs)("div", {
			className: "toolbar-edit-main nodrag",
			children: [/* @__PURE__ */ (0, U.jsxs)("div", {
				className: "toolbar-edit-zones nodrag",
				children: [T.map((t, n) => /* @__PURE__ */ (0, U.jsxs)("div", {
					className: `toolbar-edit-zone nodrag${_?.zoneId === t.id ? " drag-over" : ""}${b === n ? " is-zone-drag-from" : ""}${S === n ? " is-zone-drag-over" : ""}${S === T.length && n === T.length - 1 ? " is-zone-drag-over-end" : ""}`,
					"data-zone-id": t.id,
					children: [
						/* @__PURE__ */ (0, U.jsxs)("div", {
							className: "toolbar-edit-zone-header",
							children: [
								/* @__PURE__ */ (0, U.jsx)("span", {
									className: "toolbar-edit-btn-grip nodrag toolbar-edit-zone-grip",
									onPointerDown: (e) => te(e, n),
									"data-tooltip": "拖拽调整分区顺序",
									children: /* @__PURE__ */ (0, U.jsx)(y, {
										icon: "mdi:drag-vertical",
										width: 12,
										height: 12
									})
								}),
								/* @__PURE__ */ (0, U.jsx)(de, {
									name: t.name,
									onRename: (n) => e.renameZone(t.id, n)
								}),
								t.buttonKeys.length === 0 && T.length > 1 && /* @__PURE__ */ (0, U.jsx)("button", {
									type: "button",
									className: "toolbar-edit-zone-del nodrag",
									onClick: () => e.removeZone(t.id),
									"data-tooltip": "删除此分区",
									children: /* @__PURE__ */ (0, U.jsx)(y, {
										icon: "mdi:close",
										width: 12,
										height: 12
									})
								})
							]
						}),
						/* @__PURE__ */ (0, U.jsxs)("div", {
							className: "toolbar-edit-zone-body nodrag",
							children: [
								t.buttonKeys.map((n, r) => {
									let i = _?.zoneId === t.id && _?.index === r, a = e.registry.find((e) => e.key === n) ?? (() => {
										let e = L.find((e) => e.id === n), r = R.find((e) => e.id === n);
										return {
											key: n,
											label: e?.title || r?.name || n,
											icon: e?.icon || r?.icon || "mdi:star",
											defaultZone: t.name
										};
									})();
									return /* @__PURE__ */ (0, U.jsxs)("span", {
										style: { display: "contents" },
										children: [i && /* @__PURE__ */ (0, U.jsx)("div", { className: "toolbar-edit-insert-indicator" }), /* @__PURE__ */ (0, U.jsxs)("div", {
											className: "toolbar-edit-btn nodrag",
											"data-tooltip": `${a.label} · 拖拽排序 / 点 × 移除`,
											onPointerDown: (e) => pe(e, t.id, r),
											children: [
												/* @__PURE__ */ (0, U.jsx)("span", {
													className: "toolbar-edit-btn-grip nodrag",
													children: /* @__PURE__ */ (0, U.jsx)(y, {
														icon: "mdi:drag-vertical",
														width: 12,
														height: 12
													})
												}),
												/* @__PURE__ */ (0, U.jsx)("span", {
													className: "toolbar-edit-btn-icon",
													children: /* @__PURE__ */ (0, U.jsx)(G, { icon: a.icon })
												}),
												/* @__PURE__ */ (0, U.jsx)("span", {
													className: "toolbar-edit-btn-label",
													children: a.label
												}),
												/* @__PURE__ */ (0, U.jsx)("button", {
													type: "button",
													className: "toolbar-edit-btn-remove nodrag",
													onClick: (r) => {
														r.stopPropagation(), e.removeButton(t.id, n);
													},
													"data-tooltip": "移除此按钮",
													children: /* @__PURE__ */ (0, U.jsx)(y, {
														icon: "mdi:close",
														width: 12,
														height: 12
													})
												})
											]
										})]
									}, n);
								}),
								_?.zoneId === t.id && (_?.index ?? -1) >= t.buttonKeys.length && /* @__PURE__ */ (0, U.jsx)("div", { className: "toolbar-edit-insert-indicator toolbar-edit-insert-indicator--end" }),
								t.buttonKeys.length === 0 && _?.zoneId !== t.id && /* @__PURE__ */ (0, U.jsx)("div", {
									className: "toolbar-edit-zone-empty",
									children: "拖拽按钮到此处或点击上方按钮添加"
								})
							]
						}),
						T.indexOf(t) < T.length - 1 && /* @__PURE__ */ (0, U.jsx)("div", { className: "toolbar-edit-zone-divider" })
					]
				}, t.id)), /* @__PURE__ */ (0, U.jsxs)("button", {
					type: "button",
					className: "toolbar-edit-add-zone nodrag",
					onClick: e.addZone,
					"data-tooltip": "新建分区",
					children: [/* @__PURE__ */ (0, U.jsx)(y, {
						icon: "mdi:plus",
						width: 14,
						height: 14
					}), /* @__PURE__ */ (0, U.jsx)("span", { children: "新建分区" })]
				})]
			}), (L.length > 0 || R.length > 0) && /* @__PURE__ */ (0, U.jsxs)("div", {
				className: "toolbar-edit-commands nodrag",
				children: [/* @__PURE__ */ (0, U.jsx)("div", {
					className: "toolbar-edit-commands-header",
					children: "快捷指令"
				}), /* @__PURE__ */ (0, U.jsxs)("div", {
					className: "toolbar-edit-commands-list nodrag nowheel",
					children: [L.map((t) => e.activeButtonKeys.has(t.id) ? null : /* @__PURE__ */ (0, U.jsxs)("button", {
						type: "button",
						className: "toolbar-edit-command-item nodrag",
						onClick: () => q(t.id),
						"data-tooltip": t.description,
						children: [/* @__PURE__ */ (0, U.jsx)("span", {
							className: "toolbar-edit-bank-icon",
							children: /* @__PURE__ */ (0, U.jsx)(G, { icon: t.icon })
						}), /* @__PURE__ */ (0, U.jsx)("span", {
							className: "toolbar-edit-command-label",
							children: t.title
						})]
					}, `sc-${t.id}`)), R.map((t) => e.activeButtonKeys.has(t.id) ? null : /* @__PURE__ */ (0, U.jsxs)("button", {
						type: "button",
						className: "toolbar-edit-command-item nodrag",
						onClick: () => q(t.id),
						"data-tooltip": t.description || t.name,
						children: [/* @__PURE__ */ (0, U.jsx)("span", {
							className: "toolbar-edit-bank-icon",
							children: /* @__PURE__ */ (0, U.jsx)(G, { icon: t.icon || "mdi:star" })
						}), /* @__PURE__ */ (0, U.jsx)("span", {
							className: "toolbar-edit-command-label",
							children: t.name
						})]
					}, `up-${t.id}`))]
				})]
			})]
		})]
	});
}
var pe = (0, E.memo)(fe);
//#endregion
//#region src/components/nodes/shared/toolbar/ToolbarMoreMenu.tsx
function me({ items: e, renderItem: t }) {
	let [n, r] = (0, E.useState)(!1), i = (0, E.useRef)(null), a = (0, E.useCallback)((e) => {
		e.stopPropagation(), r((e) => !e);
	}, []);
	return (0, E.useEffect)(() => {
		if (!n) return;
		let e = (e) => {
			i.current?.contains(e.target) || r(!1);
		}, t = (e) => {
			e.key === "Escape" && r(!1);
		};
		return document.addEventListener("mousedown", e, !0), document.addEventListener("keydown", t), () => {
			document.removeEventListener("mousedown", e, !0), document.removeEventListener("keydown", t);
		};
	}, [n]), /* @__PURE__ */ (0, U.jsxs)("div", {
		ref: i,
		className: "toolbar-more-wrap nodrag",
		children: [/* @__PURE__ */ (0, U.jsx)(_, {
			type: "button",
			className: `ftb-btn icon-only act-more${n ? " is-active" : ""}`,
			"data-tooltip": "更多",
			"aria-label": "更多",
			"aria-haspopup": "menu",
			"aria-expanded": n,
			onClick: a,
			children: /* @__PURE__ */ (0, U.jsx)(y, {
				icon: "mdi:dots-horizontal",
				width: 14,
				height: 14
			})
		}), n && /* @__PURE__ */ (0, U.jsx)("div", {
			className: "toolbar-more-menu nodrag",
			role: "menu",
			"aria-label": "已隐藏的工具栏按钮",
			onClick: (e) => {
				e.stopPropagation(), e.target.closest(".act-multigrid") || r(!1);
			},
			children: e.length > 0 ? e.map((e) => /* @__PURE__ */ (0, U.jsx)("div", {
				className: "toolbar-more-menu-item",
				children: t(e.key)
			}, e.key)) : /* @__PURE__ */ (0, U.jsx)("div", {
				className: "toolbar-more-menu-empty",
				children: "暂无隐藏按钮"
			})
		})]
	});
}
var he = (0, E.memo)(me), ge = "<!doctype html>\n<html lang=\"zh-CN\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <meta\n      http-equiv=\"Content-Security-Policy\"\n      content=\"default-src 'none'; script-src 'self' http://plugin-ui.localhost plugin-ui:; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'\"\n    />\n    <title>插件界面</title>\n    <style>\n      html, body, #root { width: 100%; height: 100%; min-width: 0; margin: 0; }\n      html { color-scheme: dark; }\n      html[data-theme='light'] { color-scheme: light; }\n      body { overflow: auto; background: transparent; }\n      .plugin-ui-status {\n        padding: 24px;\n        color: CanvasText;\n        font: 13px/1.6 system-ui, -apple-system, \"Segoe UI\", sans-serif;\n        opacity: 0.72;\n      }\n      .plugin-ui-status-error { font-weight: 600; opacity: 1; }\n    </style>\n  </head>\n  <body>\n    <div id=\"root\"></div>\n    <script src=\"/plugin-ui-bootstrap.js\"><\/script>\n  </body>\n</html>\n", K = "ai-canvas-plugin-ui-v1", _e = 4, ve = 96, q = 12, ye = 4, be = 192, xe = 64, Se = 32, Ce = 8, we = 128, Te = 256, Ee = 256e3, De = new Set([
	"__proto__",
	"constructor",
	"prototype",
	"filePath",
	"relativePath",
	"directorCaptureFilePaths"
]), J = /* @__PURE__ */ new Map(), Oe = !1;
function Y(e, t) {
	let n = e?.trim().toLowerCase().replace(/^sha256-/, "");
	if (!n || !/^[a-f0-9]{64}$/u.test(n)) throw Error(`${t}缺失或无效`);
	return n;
}
function ke(e) {
	let t = e.trim().toLowerCase();
	return t.startsWith("asset:") || t.startsWith("file:") || t.startsWith("blob:") || t.startsWith("data:") || t.startsWith("http://asset.localhost/") || t.startsWith("https://asset.localhost/");
}
function X(e, t = 0) {
	if (!(t > Ce || e === void 0 || typeof e == "function" || typeof e == "symbol")) {
		if (e === null || typeof e == "boolean") return e;
		if (typeof e == "number") return Number.isFinite(e) ? e : void 0;
		if (typeof e == "string") return ke(e) ? void 0 : e.slice(0, Ee);
		if (Array.isArray(e)) return e.slice(0, Te).map((e) => X(e, t + 1)).filter((e) => e !== void 0);
		if (typeof e == "object") {
			let n = {};
			for (let [r, i] of Object.entries(e).slice(0, we)) {
				if (De.has(r)) continue;
				let e = X(i, t + 1);
				e !== void 0 && (n[r] = e);
			}
			return n;
		}
	}
}
function Ae(e, t) {
	let n = {};
	for (let r of e.inputFields) {
		if (De.has(r)) continue;
		let e = X(t[r]);
		e !== void 0 && (n[r] = e);
	}
	return n;
}
function Z(e, t = !0) {
	if (J.get(e.sessionId) !== e) throw Error("插件界面会话已关闭");
	let n = l.getState(), r = n.installedPlugins.find((t) => t.id === e.pluginId);
	if (!r?.enabled) throw Error("插件已停用或卸载");
	if (r.sourceDigest !== e.sourceDigest || r.revisionDigest !== e.revisionDigest) throw Error("插件 revision 已变化");
	if (Y(r.uiDigest ?? r.manifest.ui?.integrity, "插件界面摘要") !== e.uiDigest) throw Error("插件界面已更新");
	if (n.currentProjectId !== e.projectId || !n.nodes.some((t) => t.id === e.nodeId) || t && !i(e.guard, n)) throw Error("画布或项目已变化，插件界面会话已失效");
	return r;
}
function je(e, t) {
	return e.manifest.permissions.includes("models.read") ? x(l.getState().config, T(t.dialog?.fields ?? [])) : [];
}
function Me(e, t) {
	return {
		pluginId: e.id,
		pluginName: e.manifest.name,
		runtime: e.manifest.runtime,
		source: e.source,
		sourceDigest: e.sourceDigest,
		revisionDigest: e.revisionDigest,
		tool: t.tool,
		permissions: e.manifest.permissions
	};
}
function Ne(e, t) {
	return {
		pluginId: t.id,
		sourceDigest: e.sourceDigest,
		revisionDigest: e.revisionDigest,
		invocationId: e.sessionId,
		projectId: e.projectId,
		nodeId: e.nodeId,
		baseRevision: e.guard.baseRevision,
		permissions: t.manifest.permissions,
		state: l.getState()
	};
}
function Pe(e, t, n) {
	e.frameWindow?.postMessage({
		channel: K,
		direction: "response",
		sessionId: e.sessionId,
		requestId: t,
		...n
	}, "*");
}
function Q(e, t) {
	let n = J.get(e);
	n && (J.delete(e), n.unsubscribe?.(), n.effectAbortController?.abort(), s(n.sessionId), r(n.guard), t && queueMicrotask(n.onClose));
}
function Fe(e) {
	if (!e || typeof e != "object" || Array.isArray(e)) return null;
	let t = e;
	return t.channel !== K || t.direction !== "request" || typeof t.sessionId != "string" || t.sessionId.length > 64 || typeof t.requestId != "string" || t.requestId.length > xe || typeof t.kind != "string" || t.kind.length > Se ? null : t;
}
async function Ie(e) {
	let t = Fe(e.data);
	if (!t) return;
	let n = J.get(t.sessionId);
	if (!n || n.transport !== "frame" || !n.frameWindow || e.source !== n.frameWindow) return;
	let r = await Re(n, t);
	J.get(n.sessionId) === n && (Pe(n, t.requestId, r), Le(n));
}
function Le(e) {
	e.completed && Q(e.sessionId, !0);
}
async function Re(e, t) {
	if (!e.ready || e.completed || J.get(e.sessionId) !== e) return {
		ok: !1,
		error: "插件界面会话不可用"
	};
	if (t.kind !== "close" && e.requestCount >= be) return {
		ok: !1,
		error: "插件界面请求次数已达上限"
	};
	t.kind !== "close" && (e.requestCount += 1);
	let n = t.kind === "effect" || t.kind === "set-parameters" || t.kind === "submit";
	if (n && e.requestInFlight) return {
		ok: !1,
		error: "插件界面已有操作正在执行"
	};
	n && (e.requestInFlight = !0);
	try {
		let n = Z(e);
		switch (t.kind) {
			case "context": {
				let t = l.getState(), r = t.nodes.find((t) => t.id === e.nodeId);
				if (!r) throw Error("源节点已不存在");
				let i = Ae(e.tool, r.data);
				return {
					ok: !0,
					value: {
						surface: e.surface,
						theme: t.config.theme,
						node: {
							id: e.nodeId,
							type: r.data.type,
							data: i
						},
						models: je(n, e.tool),
						parameters: e.parameters,
						resources: e.resources
					}
				};
			}
			case "effect": {
				let r = t.payload && typeof t.payload == "object" && "type" in t.payload ? t.payload.type : void 0;
				if (r === "video.extractFrames" || r === "video.detectShots" || r === "video.inspectFrame") {
					if ((e.mediaEffectBudget ?? 0) >= ve) throw Error("本地视频操作达到 96 次上限，请重新打开插件");
					e.mediaEffectBudget = (e.mediaEffectBudget ?? 0) + 1;
				} else if (r === "resource.export" || r === "resource.createText") {
					if ((e.exportEffectBudget ?? 0) >= q) throw Error("本次会话导出达到 12 次上限");
					e.exportEffectBudget = (e.exportEffectBudget ?? 0) + 1;
				} else {
					if (e.effectBudget >= _e) throw Error(`宿主操作不能超过 ${_e} 次`);
					e.effectBudget += 1;
				}
				let i = new AbortController();
				e.effectAbortController = i;
				let a = await b({
					pluginId: n.id,
					projectId: e.projectId,
					title: e.tool.title,
					permissions: n.manifest.permissions,
					nodeId: e.nodeId,
					effect: t.payload,
					models: je(n, e.tool),
					trustedMediaReferences: e.trustedMediaReferences,
					resources: e.resources,
					resourceReadContext: Ne(e, n),
					signal: i.signal
				}).finally(() => {
					e.effectAbortController === i && (e.effectAbortController = void 0);
				});
				return Z(e), {
					ok: !0,
					value: a
				};
			}
			case "set-parameters": {
				let n = X(t.payload);
				if (!n || typeof n != "object" || Array.isArray(n)) throw Error("参数更新必须是对象");
				return e.parameters = {
					...e.parameters,
					...n
				}, {
					ok: !0,
					value: !0
				};
			}
			case "submit": {
				let r = X(t.payload), i = (r && typeof r == "object" && !Array.isArray(r) ? r : {}).data;
				if (i !== void 0) {
					if (!i || typeof i != "object" || Array.isArray(i)) throw Error("提交参数必须是对象");
					e.parameters = {
						...e.parameters,
						...i
					};
				}
				let a = new AbortController();
				return e.effectAbortController = a, e.submitting = !0, await C(Me(n, e), e.nodeId, e.parameters, {
					invocationId: e.sessionId,
					guard: e.guard,
					resources: e.resources,
					trustedMediaReferences: e.trustedMediaReferences,
					signal: a.signal
				}), Z(e, !1), e.completed = !0, {
					ok: !0,
					value: !0
				};
			}
			case "close": return e.completed = !0, {
				ok: !0,
				value: !0
			};
			case "toast": {
				let e = X(t.payload), n = e && typeof e == "object" && !Array.isArray(e) ? e : {}, r = typeof n.message == "string" ? n.message.slice(0, 240) : "";
				return l.getState().showToast(r, n.type === "error" ? "error" : "success"), {
					ok: !0,
					value: !0
				};
			}
			default: throw Error(`未知请求: ${t.kind}`);
		}
	} catch (e) {
		return {
			ok: !1,
			error: e instanceof Error ? e.message : String(e)
		};
	} finally {
		if (n && (e.requestInFlight = !1), t.kind === "submit" && (e.submitting = !1, e.effectAbortController = void 0), !e.completed) try {
			Z(e, !e.submitting);
		} catch {
			Q(e.sessionId, !0);
		}
	}
}
function ze() {
	Oe || (Oe = !0, window.addEventListener("message", (e) => void Ie(e)));
}
async function Be(e, t) {
	if (J.size >= ye) throw Error(`同时最多打开 ${ye} 个插件界面`);
	let n = l.getState(), i = n.installedPlugins.find((t) => t.id === e.plugin.id);
	if (!i?.enabled) throw Error("插件已停用或卸载");
	let a = Y(i.sourceDigest, "插件源码摘要"), u = Y(i.revisionDigest, "插件 revision 摘要");
	if (Y(e.plugin.sourceDigest, "插件源码摘要") !== a || Y(e.plugin.revisionDigest, "插件 revision 摘要") !== u) throw Error("插件 revision 已变化");
	let d = i.manifest.contributes.nodeTools.find((t) => t.id === e.tool.id);
	if (!d || d.dialog?.ui !== e.exportName || !i.manifest.permissions.includes("ui.custom")) throw Error("插件工具界面声明不匹配");
	let f = i.manifest.ui;
	if (!f) throw Error("插件没有声明自定义界面");
	let p = f.exports[e.exportName];
	if (!p) throw Error(`插件未导出组件: ${e.exportName}`);
	let m = Y(i.uiDigest ?? f.integrity, "插件界面摘要"), h = n.currentProjectId;
	if (!h) throw Error("当前项目不存在");
	let g = crypto.randomUUID(), _ = o(n, e.nodeId, { onCancel: () => Q(g, !0) });
	if (!_) throw Error("无法创建插件界面保护");
	try {
		let r = X(e.parameters ?? {});
		if (!r || typeof r != "object" || Array.isArray(r)) throw Error("插件界面初始参数无效");
		let o = n.nodes.find((t) => t.id === e.nodeId);
		if (!o || !d.nodeTypes.includes(o.data.type)) throw Error("插件目标节点无效");
		let s = {
			sessionId: g,
			surface: "tool-dialog",
			pluginId: i.id,
			sourceDigest: a,
			revisionDigest: u,
			uiDigest: m,
			tool: d,
			nodeId: e.nodeId,
			projectId: h,
			parameters: r,
			guard: _,
			transport: t,
			resources: {
				self: [],
				incoming: [],
				inputs: {},
				package: [],
				derived: []
			},
			ready: !1,
			submitting: !1,
			completed: !1,
			effectBudget: 0,
			requestCount: 0,
			requestInFlight: !1,
			trustedMediaReferences: w(o.data.type, Ae(d, o.data)),
			onClose: e.onClose
		};
		return J.set(g, s), s.unsubscribe = l.subscribe(() => {
			try {
				Z(s, !s.submitting && !s.completed);
			} catch {
				Q(g, !0);
			}
		}), s.resources = await c({
			pluginId: i.id,
			sourceDigest: a,
			revisionDigest: u,
			invocationId: g,
			projectId: h,
			nodeId: e.nodeId,
			baseRevision: _.baseRevision,
			access: d.resourceAccess,
			packageResources: i.manifest.resources,
			state: n
		}), Z(s), s.ready = !0, {
			session: s,
			globalExport: p
		};
	} catch (e) {
		throw Q(g, !1), s(g), r(_), e;
	}
}
async function Ve(e) {
	ze();
	let { session: t, globalExport: n } = await Be(e, "frame"), { sessionId: r, uiDigest: i, pluginId: a } = t;
	try {
		let e = new URL(d(a, "plugin-ui"));
		e.searchParams.set("digest", i);
		let t = e.toString();
		return {
			sessionId: r,
			src: `/plugin-ui-host.html?${new URLSearchParams({
				session: r,
				export: n,
				bundle: t
			}).toString()}`,
			attach: (e) => {
				let t = J.get(r);
				t && e && (t.frameWindow = e);
			},
			updateTheme: (e) => {
				J.get(r)?.frameWindow?.postMessage({
					channel: K,
					direction: "event",
					sessionId: r,
					kind: "theme",
					value: e
				}, "*");
			},
			dispose: () => Q(r, !1)
		};
	} catch (e) {
		throw Q(r, !1), e;
	}
}
async function He(e) {
	let { session: t, globalExport: n } = await Be(e, "native");
	return {
		binding: Object.freeze({
			sessionId: t.sessionId,
			identity: Object.freeze({
				pluginId: t.pluginId,
				sourceDigest: t.sourceDigest,
				revisionDigest: t.revisionDigest,
				uiDigest: t.uiDigest,
				toolId: t.tool.id
			}),
			projectId: t.projectId,
			nodeId: t.nodeId,
			canvasRevision: t.guard.baseRevision
		}),
		globalExport: n,
		isActive: () => J.get(t.sessionId) === t,
		request: (e, n) => Re(t, {
			kind: e,
			payload: n
		}),
		finishRequest: () => Le(t),
		dispose: () => Q(t.sessionId, !1)
	};
}
//#endregion
//#region src/services/plugins/pluginUiWindowService.ts
function Ue() {
	return f() ? "独立窗口尚待真实 WebView 隔离验收，暂用主窗口弹窗" : "当前不是 Tauri 桌面环境，将使用主窗口弹窗";
}
var We = /* @__PURE__ */ new Map(), Ge = /^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/u, Ke = new Set([
	"context",
	"effect",
	"set-parameters",
	"submit",
	"close",
	"toast"
]);
function qe(e, t) {
	if (!e || typeof e != "object") return !1;
	let n = e;
	return n.sessionId === t.sessionId && n.projectId === t.projectId && n.nodeId === t.nodeId && n.canvasRevision === t.canvasRevision && n.identity?.pluginId === t.identity.pluginId && n.identity?.toolId === t.identity.toolId && n.identity?.sourceDigest === t.identity.sourceDigest && n.identity?.revisionDigest === t.identity.revisionDigest && n.identity?.uiDigest === t.identity.uiDigest;
}
async function Je(e) {
	if (!(!e.nativeStarted || !e.session)) try {
		await u("close_plugin_ui_window", { binding: e.session.binding });
	} catch {
		l.getState().showToast("插件会话已撤销，但未确认系统窗口关闭，请手动关闭该窗口", "error");
	}
}
function $(e, t) {
	e.disposed || (e.disposed = !0, e.closeTimer && clearTimeout(e.closeTimer), We.get(e.key) === e && We.delete(e.key), e.session?.dispose(), e.channel.onmessage = () => {}, t && Je(e));
}
async function Ye(e, t) {
	let n = e.session;
	if (!(e.disposed || !n)) {
		if (!t || !qe(t.binding, n.binding)) {
			$(e, !0);
			return;
		}
		if (t.type === "closed") {
			$(e, !1);
			return;
		}
		if (t.type !== "request" || !Ge.test(t.requestId) || !Ke.has(t.kind) || e.seenRequests.has(t.requestId) || e.pending >= 8 || e.seenRequests.size >= 192 && t.kind !== "close" || e.seenRequests.size >= 193) {
			$(e, !0);
			return;
		}
		e.seenRequests.add(t.requestId), e.pending += 1;
		try {
			let r = e.awaitingClose ? t.kind === "close" ? {
				ok: !0,
				value: !0
			} : {
				ok: !1,
				error: "插件已提交，请重新打开"
			} : await n.request(t.kind, t.payload);
			if (e.disposed || !e.awaitingClose && !n.isActive()) return;
			t.kind === "submit" && r.ok && (e.awaitingClose = !0, n.dispose(), e.closeTimer = setTimeout(() => $(e, !0), 3e4)), await u("respond_plugin_ui_window_request", {
				binding: n.binding,
				requestId: t.requestId,
				reply: r.error ? {
					...r,
					error: r.error.slice(0, 1024)
				} : r
			}), e.disposed || (e.awaitingClose ? t.kind === "close" && $(e, !0) : n.finishRequest());
		} catch {
			e.disposed || ($(e, !0), l.getState().showToast("插件窗口桥接失败，会话已撤销，请重新打开", "error"));
		} finally {
			--e.pending;
		}
	}
}
function Xe(e, t) {
	if (!e.session?.isActive()) throw Error("插件窗口会话已失效");
	return {
		binding: e.session.binding,
		exportName: e.session.globalExport,
		title: (t.tool.dialog?.title ?? t.tool.title).slice(0, 80)
	};
}
async function Ze(e) {
	if (!f()) throw Error("插件独立窗口仅支持 Tauri 桌面环境");
	let t = l.getState().currentProjectId;
	if (!t) throw Error("当前项目不存在");
	let n = l.getState().installedPlugins.find((t) => t.id === e.plugin.id);
	if (!n?.enabled || n.sourceDigest !== e.plugin.sourceDigest || n.revisionDigest !== e.plugin.revisionDigest) throw Error("插件 revision 已变化");
	let r = JSON.stringify([
		t,
		e.nodeId,
		e.plugin.id,
		e.tool.id
	]), i = We.get(r);
	if (i) {
		let t = await i.ready;
		if (i.disposed || !i.session?.isActive()) throw Error("插件窗口会话已失效");
		try {
			let n = await u("open_plugin_ui_window", {
				options: Xe(i, e),
				channel: i.channel
			});
			if (i.disposed && await Je(i), i.disposed || !qe(n?.binding, t) || n.reused !== !0) throw Error("插件窗口复用身份不匹配");
			return t;
		} catch (e) {
			throw $(i, !0), e;
		}
	}
	let a = new p(), o = {
		key: r,
		channel: a,
		disposed: !1,
		nativeStarted: !1,
		seenRequests: /* @__PURE__ */ new Set(),
		pending: 0,
		ready: Promise.resolve().then(async () => {
			try {
				if (l.getState().currentProjectId !== t) throw Error("当前项目已变化");
				let n = await He({
					...e,
					onClose: () => $(o, !0)
				});
				if (o.session = n, o.disposed || !n.isActive()) throw n.dispose(), Error("插件窗口会话已失效");
				o.nativeStarted = !0;
				let r = await u("open_plugin_ui_window", {
					options: Xe(o, e),
					channel: a
				});
				if (o.disposed) throw await Je(o), Error("插件窗口会话已失效");
				if (!qe(r?.binding, n.binding) || r.reused !== !1) throw Error("插件窗口创建身份不匹配，请关闭旧窗口后重试");
				return n.binding;
			} catch (e) {
				throw $(o, !0), e;
			}
		})
	};
	return a.onmessage = (e) => {
		Ye(o, e);
	}, We.set(r, o), o.ready;
}
//#endregion
//#region src/components/nodes/shared/toolbar/NodePluginToolDialog.tsx
var Qe = "src=\"/plugin-ui-bootstrap.js\"";
function $e(e) {
	return e.replaceAll("&", "&amp;").replaceAll("\"", "&quot;").replaceAll("<", "&lt;").replaceAll(">", "&gt;");
}
function et(e) {
	let t = new URL(e, window.location.href).searchParams.toString();
	if (!t) throw Error("插件界面会话参数缺失");
	let n = $e(new URL("/plugin-ui-bootstrap.js", window.location.href).href), r = ge.replace(Qe, `src="${n}"`);
	if (r === "<!doctype html>\n<html lang=\"zh-CN\">\n  <head>\n    <meta charset=\"UTF-8\" />\n    <meta name=\"viewport\" content=\"width=device-width, initial-scale=1.0\" />\n    <meta\n      http-equiv=\"Content-Security-Policy\"\n      content=\"default-src 'none'; script-src 'self' http://plugin-ui.localhost plugin-ui:; style-src 'unsafe-inline'; img-src data: blob:; media-src data: blob:; font-src data:; connect-src 'none'; object-src 'none'; base-uri 'none'; form-action 'none'\"\n    />\n    <title>插件界面</title>\n    <style>\n      html, body, #root { width: 100%; height: 100%; min-width: 0; margin: 0; }\n      html { color-scheme: dark; }\n      html[data-theme='light'] { color-scheme: light; }\n      body { overflow: auto; background: transparent; }\n      .plugin-ui-status {\n        padding: 24px;\n        color: CanvasText;\n        font: 13px/1.6 system-ui, -apple-system, \"Segoe UI\", sans-serif;\n        opacity: 0.72;\n      }\n      .plugin-ui-status-error { font-weight: 600; opacity: 1; }\n    </style>\n  </head>\n  <body>\n    <div id=\"root\"></div>\n    <script src=\"/plugin-ui-bootstrap.js\"><\/script>\n  </body>\n</html>\n") throw Error("插件界面宿主页无效");
	let i = URL.createObjectURL(new Blob([r], { type: "text/html;charset=utf-8" }));
	return {
		objectUrl: i,
		src: `${i}#${t}`
	};
}
function tt(e) {
	let t = {};
	for (let n of e.tool.dialog?.fields ?? []) n.type === "boolean" ? t[n.id] = n.defaultValue === !0 : n.defaultValue === void 0 ? t[n.id] = "" : t[n.id] = String(n.defaultValue);
	return t;
}
function nt(e) {
	let t = {};
	for (let n of e.tool.dialog?.fields ?? []) n.defaultValue !== void 0 && (n.type === "boolean" ? t[n.id] = n.defaultValue === !0 : n.type === "number" ? t[n.id] = Number(n.defaultValue) : t[n.id] = String(n.defaultValue));
	return t;
}
function rt({ pluginTool: e, nodeId: t, onClose: n }) {
	let r = l((e) => e.showToast), i = l((e) => e.config), a = e.tool.dialog, o = a?.presentation === "window" ? Ue() : null, s = a?.presentation === "window" && o === null, c = (0, E.useMemo)(() => e.permissions.includes("models.read") ? x(i, T(e.tool.dialog?.fields ?? [])) : [], [i, e]), [u, d] = (0, E.useState)(() => tt(e)), [f, p] = (0, E.useState)(null), [m, g] = (0, E.useState)(!1), [b, S] = (0, E.useState)(null), [w, D] = (0, E.useState)(null), [O, k] = (0, E.useState)(!!a?.ui), A = (0, E.useRef)(null), j = (0, E.useRef)(null), M = (0, E.useRef)(n);
	if ((0, E.useEffect)(() => {
		M.current = n;
	}, [n]), (0, E.useEffect)(() => {
		b?.updateTheme(i.theme);
	}, [i.theme, b]), (0, E.useEffect)(() => {
		let n = a?.ui;
		if (!n) return;
		let i = !1, o = l.getState().installedPlugins.find((t) => t.id === e.pluginId);
		return o ? s ? (queueMicrotask(() => {
			i || Ze({
				plugin: o,
				tool: e.tool,
				nodeId: t,
				exportName: n,
				parameters: nt(e)
			}).catch((e) => {
				i || r(e instanceof Error ? e.message : "插件窗口打开失败", "error");
			}).finally(() => {
				i || M.current();
			});
		}), () => {
			i = !0;
		}) : (Ve({
			plugin: o,
			tool: e.tool,
			nodeId: t,
			exportName: n,
			parameters: nt(e),
			onClose: () => M.current()
		}).then((e) => {
			if (i) {
				e.dispose();
				return;
			}
			let t;
			try {
				t = et(e.src);
			} catch (t) {
				throw e.dispose(), t;
			}
			A.current = e, j.current = t, S(e), D(t), p(null), k(!1);
		}).catch((e) => {
			if (i) return;
			k(!1), S(null);
			let t = e instanceof Error ? e.message : "插件界面加载失败";
			p(t), r(t, "error");
		}), () => {
			i = !0, A.current?.dispose(), A.current = null, j.current &&= (URL.revokeObjectURL(j.current.objectUrl), null);
		}) : (queueMicrotask(() => {
			i || (k(!1), S(null), p("找不到已安装的插件"));
		}), () => {
			i = !0;
		});
	}, [
		a?.ui,
		t,
		e,
		r,
		s
	]), !a || s) return null;
	let N = () => {
		m || (A.current?.dispose(), n());
	}, P = (e) => {
		let t = {};
		for (let n of a.fields) {
			let r = u[n.id];
			if (n.type === "boolean") {
				if (e && n.required && r !== !0) return p(`请勾选“${n.label}”`), null;
				t[n.id] = r === !0;
				continue;
			}
			let i = typeof r == "string" ? r : "";
			if (e && n.required && !i.trim()) return p(`请填写“${n.label}”`), null;
			if (!(!i && !n.required)) if (n.type === "number") {
				let e = Number(i);
				if (!Number.isFinite(e)) return p(`“${n.label}”必须是有效数字`), null;
				t[n.id] = e;
			} else t[n.id] = i;
		}
		return t;
	}, F = async (i) => {
		i.preventDefault();
		let o = P(!a.ui);
		if (o) {
			p(null), g(!0);
			try {
				await C(e, t, o), n();
			} catch (e) {
				let t = e instanceof Error ? e.message : "插件工具执行失败";
				p(t), r(t, "error");
			} finally {
				g(!1);
			}
		}
	}, I = "mt-1.5 w-full rounded-lg border border-canvas-border bg-canvas-surface px-3 py-2 text-xs text-canvas-text outline-none transition-colors placeholder:text-canvas-text-muted focus:border-indigo-400/60 focus:ring-2 focus:ring-indigo-400/15";
	return a.ui ? /* @__PURE__ */ (0, U.jsxs)(h, {
		isOpen: !0,
		onClose: N,
		ariaLabel: a.title || e.tool.title,
		className: "h-[calc(100dvh-32px)] max-h-[1100px] w-[calc(100vw-32px)] max-w-[1600px] min-w-0 border-canvas-border",
		closeOnBackdrop: !0,
		motionPreset: "quick",
		children: [
			/* @__PURE__ */ (0, U.jsxs)("header", {
				className: "flex shrink-0 items-center gap-3 border-b border-canvas-border px-4 py-3",
				children: [
					/* @__PURE__ */ (0, U.jsx)("span", {
						className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400",
						children: /* @__PURE__ */ (0, U.jsx)(y, {
							icon: e.tool.icon || "lucide:blocks",
							width: 18,
							height: 18
						})
					}),
					/* @__PURE__ */ (0, U.jsxs)("div", {
						className: "min-w-0 flex-1",
						children: [/* @__PURE__ */ (0, U.jsx)("h2", {
							className: "truncate text-sm font-semibold text-canvas-text",
							children: a.title || e.tool.title
						}), /* @__PURE__ */ (0, U.jsx)("p", {
							className: "mt-0.5 truncate text-[11px] text-canvas-text-muted",
							children: e.pluginName
						})]
					}),
					/* @__PURE__ */ (0, U.jsx)(v, { onClick: N })
				]
			}),
			o && /* @__PURE__ */ (0, U.jsx)("p", {
				role: "status",
				className: "shrink-0 border-b border-canvas-border px-4 py-1 text-xs text-canvas-text-secondary",
				children: o
			}),
			/* @__PURE__ */ (0, U.jsxs)("div", {
				className: "min-h-0 min-w-0 flex-1 overflow-auto bg-canvas-surface",
				children: [
					O && /* @__PURE__ */ (0, U.jsxs)("div", {
						className: "flex h-full items-center justify-center gap-2 text-xs text-canvas-text-secondary",
						children: [/* @__PURE__ */ (0, U.jsx)(y, {
							icon: "lucide:loader-circle",
							width: 16,
							height: 16,
							className: "animate-spin"
						}), "正在加载插件界面…"]
					}),
					!O && f && /* @__PURE__ */ (0, U.jsx)("div", {
						role: "alert",
						className: "m-4 rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-xs leading-5 text-red-300",
						children: f
					}),
					b && w && !f && /* @__PURE__ */ (0, U.jsx)("iframe", {
						ref: (e) => b.attach(e?.contentWindow ?? null),
						src: w.src,
						title: `${e.pluginName} · ${a.title || e.tool.title}`,
						sandbox: "allow-scripts",
						referrerPolicy: "no-referrer",
						className: "block h-full w-full min-w-0 border-0 bg-canvas-surface"
					})
				]
			})
		]
	}) : /* @__PURE__ */ (0, U.jsx)(h, {
		isOpen: !0,
		onClose: N,
		ariaLabel: a.title || e.tool.title,
		className: "w-[min(460px,calc(100vw-32px))] border-canvas-border",
		closeOnBackdrop: !m,
		motionPreset: "quick",
		children: /* @__PURE__ */ (0, U.jsxs)("form", {
			onSubmit: (e) => void F(e),
			children: [
				/* @__PURE__ */ (0, U.jsxs)("header", {
					className: "flex items-center gap-3 border-b border-canvas-border px-4 py-3",
					children: [
						/* @__PURE__ */ (0, U.jsx)("span", {
							className: "flex h-9 w-9 shrink-0 items-center justify-center rounded-lg bg-indigo-500/10 text-indigo-400",
							children: /* @__PURE__ */ (0, U.jsx)(y, {
								icon: e.tool.icon || "lucide:blocks",
								width: 18,
								height: 18
							})
						}),
						/* @__PURE__ */ (0, U.jsxs)("div", {
							className: "min-w-0 flex-1",
							children: [/* @__PURE__ */ (0, U.jsx)("h2", {
								className: "truncate text-sm font-semibold text-canvas-text",
								children: a.title || e.tool.title
							}), /* @__PURE__ */ (0, U.jsx)("p", {
								className: "mt-0.5 truncate text-[11px] text-canvas-text-muted",
								children: e.pluginName
							})]
						}),
						/* @__PURE__ */ (0, U.jsx)(v, {
							disabled: m,
							onClick: N
						})
					]
				}),
				/* @__PURE__ */ (0, U.jsxs)("div", {
					className: "max-h-[min(560px,calc(100vh-180px))] space-y-4 overflow-y-auto px-4 py-4",
					children: [
						(a.description || e.tool.description) && /* @__PURE__ */ (0, U.jsx)("p", {
							className: "text-xs leading-5 text-canvas-text-secondary",
							children: a.description || e.tool.description
						}),
						a.fields.map((e) => /* @__PURE__ */ (0, U.jsx)("label", {
							className: "block text-xs text-canvas-text-secondary",
							children: e.type === "boolean" ? /* @__PURE__ */ (0, U.jsxs)("span", {
								className: "flex items-start gap-2 rounded-lg border border-canvas-border bg-canvas-surface px-3 py-2.5",
								children: [/* @__PURE__ */ (0, U.jsx)("input", {
									type: "checkbox",
									checked: u[e.id] === !0,
									disabled: m,
									className: "mt-0.5 h-3.5 w-3.5 accent-indigo-500",
									onChange: (t) => {
										let n = t.currentTarget.checked;
										d((t) => ({
											...t,
											[e.id]: n
										}));
									}
								}), /* @__PURE__ */ (0, U.jsxs)("span", { children: [/* @__PURE__ */ (0, U.jsx)("span", {
									className: "block font-medium text-canvas-text",
									children: e.label
								}), e.description && /* @__PURE__ */ (0, U.jsx)("span", {
									className: "mt-0.5 block text-[11px] leading-4 text-canvas-text-muted",
									children: e.description
								})] })]
							}) : /* @__PURE__ */ (0, U.jsxs)(U.Fragment, { children: [
								/* @__PURE__ */ (0, U.jsxs)("span", {
									className: "font-medium text-canvas-text",
									children: [e.label, e.required && /* @__PURE__ */ (0, U.jsx)("span", {
										className: "ml-1 text-red-400",
										children: "*"
									})]
								}),
								e.type === "textarea" ? /* @__PURE__ */ (0, U.jsx)("textarea", {
									value: String(u[e.id] ?? ""),
									rows: 4,
									required: e.required,
									disabled: m,
									placeholder: e.placeholder,
									className: `${I} resize-y`,
									onChange: (t) => {
										let n = t.currentTarget.value;
										d((t) => ({
											...t,
											[e.id]: n
										}));
									}
								}) : e.type === "select" ? /* @__PURE__ */ (0, U.jsxs)("select", {
									value: String(u[e.id] ?? ""),
									required: e.required,
									disabled: m,
									className: I,
									onChange: (t) => {
										let n = t.currentTarget.value;
										d((t) => ({
											...t,
											[e.id]: n
										}));
									},
									children: [/* @__PURE__ */ (0, U.jsx)("option", {
										value: "",
										children: e.placeholder || "请选择"
									}), e.options?.map((e) => /* @__PURE__ */ (0, U.jsx)("option", {
										value: e.value,
										children: e.label
									}, e.value))]
								}) : e.type === "model" ? /* @__PURE__ */ (0, U.jsxs)("select", {
									value: String(u[e.id] ?? ""),
									required: e.required,
									disabled: m,
									className: I,
									onChange: (t) => {
										let n = t.currentTarget.value;
										d((t) => ({
											...t,
											[e.id]: n
										}));
									},
									children: [/* @__PURE__ */ (0, U.jsx)("option", {
										value: "",
										children: c.length > 0 ? e.placeholder || "选择可调用模型" : "暂无可调用模型"
									}), c.filter((t) => !e.modelCategories || e.modelCategories.includes(t.category)).map((e) => /* @__PURE__ */ (0, U.jsxs)("option", {
										value: e.id,
										children: [
											e.name,
											" · ",
											e.category
										]
									}, e.id))]
								}) : /* @__PURE__ */ (0, U.jsx)("input", {
									type: e.type === "number" ? "number" : "text",
									value: String(u[e.id] ?? ""),
									required: e.required,
									disabled: m,
									placeholder: e.placeholder,
									className: I,
									onChange: (t) => {
										let n = t.currentTarget.value;
										d((t) => ({
											...t,
											[e.id]: n
										}));
									}
								}),
								e.description && /* @__PURE__ */ (0, U.jsx)("span", {
									className: "mt-1 block text-[11px] leading-4 text-canvas-text-muted",
									children: e.description
								})
							] })
						}, e.id)),
						a.fields.length === 0 && /* @__PURE__ */ (0, U.jsx)("div", {
							className: "rounded-lg border border-canvas-border bg-canvas-surface px-3 py-2.5 text-xs text-canvas-text-secondary",
							children: "确认后将对当前节点执行此插件工具。"
						}),
						f && /* @__PURE__ */ (0, U.jsx)("div", {
							role: "alert",
							className: "rounded-lg border border-red-500/25 bg-red-500/10 px-3 py-2 text-[11px] leading-4 text-red-300",
							children: f
						})
					]
				}),
				/* @__PURE__ */ (0, U.jsxs)("footer", {
					className: "flex justify-end gap-2 border-t border-canvas-border px-4 py-3",
					children: [/* @__PURE__ */ (0, U.jsx)(_, {
						type: "button",
						className: "rounded-lg border border-canvas-border px-3 py-2 text-xs text-canvas-text-secondary hover:bg-canvas-hover",
						disabled: m,
						onClick: N,
						children: "取消"
					}), /* @__PURE__ */ (0, U.jsxs)(_, {
						type: "submit",
						className: "inline-flex min-w-20 items-center justify-center gap-1.5 rounded-lg bg-indigo-500 px-3 py-2 text-xs font-medium text-white hover:bg-indigo-400 disabled:opacity-60",
						disabled: m,
						children: [m && /* @__PURE__ */ (0, U.jsx)(y, {
							icon: "lucide:loader-circle",
							width: 14,
							height: 14,
							className: "animate-spin"
						}), m ? "执行中…" : a.submitLabel || "执行"]
					})]
				})
			]
		})
	});
}
//#endregion
//#region src/components/nodes/shared/toolbar/NodePluginToolbarButtons.tsx
function it({ nodeId: e, iconSize: t = 14, rounded: n = !1 }) {
	let r = l((e) => e.installedPlugins), i = l((t) => t.nodes.find((t) => t.id === e)?.data.type), [a, o] = (0, E.useState)(null), s = (0, E.useMemo)(() => new Map(S(r, i, "node-toolbar").map((e) => [O(e), e])), [i, r]);
	return {
		renderButton: (0, E.useCallback)((e) => {
			let r = s.get(e);
			if (!r) return null;
			let i = `${r.tool.title} · ${r.pluginName}`;
			return /* @__PURE__ */ (0, U.jsx)(_, {
				type: "button",
				className: `ftb-btn icon-only act-plugin${n ? " rounded-[6px]" : ""}`,
				"data-tooltip": i,
				"aria-label": `${r.tool.title}（${r.pluginName}）`,
				onClick: (e) => {
					e.stopPropagation(), o(r);
				},
				children: /* @__PURE__ */ (0, U.jsx)(y, {
					icon: r.tool.icon || "lucide:blocks",
					width: t,
					height: t
				})
			}, e);
		}, [
			t,
			n,
			s
		]),
		dialog: a ? /* @__PURE__ */ (0, U.jsx)(rt, {
			pluginTool: a,
			nodeId: e,
			onClose: () => o(null)
		}, O(a)) : null
	};
}
//#endregion
//#region src/hooks/useCompletionFlash.ts
function at(e, t = 700) {
	let n = (0, E.useRef)(e), [r, i] = (0, E.useState)(!1);
	return (0, E.useEffect)(() => {
		if (n.current === "loading" && e === "success") {
			i(!0);
			let r = setTimeout(() => i(!1), t);
			return n.current = e, () => clearTimeout(r);
		}
		n.current = e;
	}, [e, t]), r;
}
//#endregion
//#region src/components/nodes/shared/useSourceFileUpload.ts
function ot(e) {
	let t = l((e) => e.currentProjectId), [n, r] = (0, E.useState)(!1);
	return {
		isUploading: n,
		handleUpload: (0, E.useCallback)(async () => {
			r(!0);
			try {
				return await m(e, t);
			} catch {
				return null;
			} finally {
				r(!1);
			}
		}, [e, t])
	};
}
//#endregion
export { he as a, D as c, rt as i, B as l, at as n, pe as o, it as r, H as s, ot as t };
