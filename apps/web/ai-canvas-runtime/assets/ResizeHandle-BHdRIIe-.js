import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./jsx-runtime-BAkIPmuO.js";
import { a as r } from "./i18n-on3r1DCI.js";
import { Li as i, Ri as a, t as o, xi as s } from "./useAppStore-BH-MdRLu.js";
import { T as c } from "./directorSceneSchema-D22Qlbpb.js";
import { v as l } from "./fileService-BawXHbsK.js";
import { n as u } from "./rasterImageDimensions-CX1VK2cM.js";
//#region src/components/nodes/shared/NodeLabel.tsx
var d = /* @__PURE__ */ e(t(), 1), f = n();
function p({ kind: e, label: t, displayId: n, isBeta: i, nodeId: a, onRename: o }) {
	let c = r(), l = s(e), [p, m] = (0, d.useState)(!1), [h, g] = (0, d.useState)(t), _ = (0, d.useRef)(null);
	(0, d.useEffect)(() => {
		p && _.current && (_.current.focus(), _.current.select());
	}, [p]);
	let v = (0, d.useCallback)((e) => {
		e.stopPropagation(), g(t), m(!0);
	}, [t]), y = (0, d.useCallback)(() => {
		let e = h.trim();
		e && e !== t && o(e), m(!1);
	}, [
		h,
		t,
		o
	]), b = (0, d.useCallback)((e) => {
		e.key === "Enter" ? (e.preventDefault(), y()) : e.key === "Escape" && (g(t), m(!1));
	}, [y, t]);
	return /* @__PURE__ */ (0, f.jsxs)("div", {
		className: `node-label flex items-center gap-2 px-3 py-2 select-none ${p ? "z-20" : ""}`,
		"data-label-kind": e,
		children: [
			/* @__PURE__ */ (0, f.jsx)("span", {
				className: `node-label-icon w-5 h-5 rounded flex items-center justify-center ${l.color}`,
				"aria-hidden": "true",
				children: /* @__PURE__ */ (0, f.jsx)(u, {
					icon: l.icon,
					width: "14",
					height: "14"
				})
			}),
			p ? /* @__PURE__ */ (0, f.jsx)("input", {
				ref: _,
				className: "node-label-input flex-1 min-w-0 bg-canvas-bg text-xs font-medium text-canvas-text border border-canvas-border rounded px-1 py-0.5 outline-none focus:border-indigo-500",
				value: h,
				onChange: (e) => g(e.target.value),
				onBlur: y,
				onKeyDown: b,
				onMouseDown: (e) => e.stopPropagation()
			}) : /* @__PURE__ */ (0, f.jsx)("span", {
				className: "node-label-text text-xs font-medium text-canvas-text truncate flex-1 min-w-0 cursor-default",
				onDoubleClick: v,
				"data-tooltip": c("双击重命名"),
				children: t
			}),
			/* @__PURE__ */ (0, f.jsxs)("span", {
				className: "ml-auto flex items-center gap-1.5 flex-shrink-0",
				children: [n != null && /* @__PURE__ */ (0, f.jsxs)("span", {
					className: "text-[10px] text-canvas-text-muted font-mono tabular-nums",
					children: ["#", n]
				}), i && /* @__PURE__ */ (0, f.jsx)("span", {
					className: "text-[10px] px-1.5 py-0.5 rounded bg-orange-500/15 text-orange-400",
					children: "Beta"
				})]
			})
		]
	});
}
//#endregion
//#region src/components/nodes/shared/NodeError.tsx
var m = 2e4;
function h({ nodeId: e, message: t }) {
	let n = o((e) => e.updateNodeDataTransient), [r, i] = (0, d.useState)(null), a = r === t;
	return (0, d.useEffect)(() => {
		let r = setTimeout(() => i(t), m), a = setTimeout(() => {
			let t = o.getState().nodes.find((t) => t.id === e), r = { error: void 0 };
			t?.data?.status === "error" && (r.status = "idle"), n(e, r);
		}, 21100);
		return () => {
			clearTimeout(r), clearTimeout(a);
		};
	}, [
		e,
		t,
		n
	]), /* @__PURE__ */ (0, f.jsxs)("div", {
		role: "alert",
		"aria-atomic": "true",
		className: `node-error nodrag nopan nowheel${a ? " node-error--fading" : ""}`,
		children: [/* @__PURE__ */ (0, f.jsx)(u, {
			className: "node-error__icon",
			icon: "lucide:triangle-alert",
			width: 13,
			height: 13,
			"aria-hidden": "true"
		}), /* @__PURE__ */ (0, f.jsx)("span", {
			className: "node-error__message",
			children: t
		})]
	});
}
//#endregion
//#region src/components/nodes/shared/GooeyBtn.tsx
var g = (e) => e.transform[2], _ = ({ className: e, hue: t }) => {
	let n = (0, d.useRef)(null), r = `goo-${(0, d.useId)().replace(/[^a-zA-Z0-9_-]/g, "")}`, i = a(g), o = Math.min(1, 1 / i);
	return (0, d.useEffect)(() => {
		let e = n.current;
		if (!e) return;
		let t = (t) => {
			let n = e.getBoundingClientRect(), r = Math.min(Math.max((t.clientX - n.left) / n.width * 100, 0), 100), i = Math.min(Math.max((t.clientY - n.top) / n.height * 100, 0), 100);
			e.style.setProperty("--x", String(r)), e.style.setProperty("--y", String(i));
		};
		return e.addEventListener("pointermove", t), () => e.removeEventListener("pointermove", t);
	}, []), /* @__PURE__ */ (0, f.jsxs)("div", {
		className: `gooey-btn-wrapper ${e ?? ""}`,
		style: { "--gooey-inv-zoom": o },
		children: [
			/* @__PURE__ */ (0, f.jsx)("svg", {
				width: "0",
				height: "0",
				style: { position: "absolute" },
				children: /* @__PURE__ */ (0, f.jsxs)("filter", {
					id: r,
					x: "-120%",
					y: "-120%",
					width: "340%",
					height: "340%",
					colorInterpolationFilters: "sRGB",
					children: [
						/* @__PURE__ */ (0, f.jsx)("feComponentTransfer", { children: /* @__PURE__ */ (0, f.jsx)("feFuncA", {
							type: "discrete",
							tableValues: "0 1"
						}) }),
						/* @__PURE__ */ (0, f.jsx)("feGaussianBlur", { stdDeviation: "5" }),
						/* @__PURE__ */ (0, f.jsx)("feComponentTransfer", { children: /* @__PURE__ */ (0, f.jsx)("feFuncA", {
							type: "table",
							tableValues: "-5 11"
						}) })
					]
				})
			}),
			/* @__PURE__ */ (0, f.jsx)("button", {
				ref: n,
				className: "gooey-btn",
				style: { "--hue": `${t ?? 170}deg` }
			}),
			/* @__PURE__ */ (0, f.jsx)("style", { children: `
  .gooey-btn {
    --x: 50; --y: 50; --a: 0%;
    --button: hsl(var(--hue), 66%, 66%);

    display: block; /* 避免 inline-block 基线空隙撑高 wrapper，导致按钮整体偏上 */
    width: 40px;
    height: 40px;
    border-radius: 50%;
    background: transparent;
    border: none;
    position: relative;
    cursor: var(--cursor-pointer, pointer);
    transition: scale 0.5s ease;
    isolation: isolate;
  }

  .gooey-btn:hover {
   --a: 100%; scale: 1.1;
   cursor: none;
  }

  .gooey-btn::before {
    content: "";
    position: absolute;
    inset: -10px; 
    border-radius: 50%;
    filter: blur(8px) url(#${r}) drop-shadow(0 2px 4px rgba(0,0,0,0.2));
    
    background-image:
      linear-gradient(0deg, var(--button), var(--button)),
      radial-gradient(
        30% 90% at calc(var(--x) * 1%) calc(var(--y) * 1%),
        hsla(var(--hue), 77%, 77%, var(--a)) 0%,
        transparent 80%
      );
    
    background-clip: content-box, border-box;
    padding: 18px; 
    z-index: -1;
  }
` })
		]
	});
};
//#endregion
//#region src/components/nodes/shared/useNodeRename.ts
function v(e, t, n) {
	let r = o((e) => e.updateNodeData);
	return {
		displayLabel: t.fileName || t.label || n,
		handleRename: (0, d.useCallback)((n) => {
			let i = { label: n };
			t.fileName && (i.fileName = n), r(e, i);
			let a = t.filePath, s = !!(t.imageUrl || t.videoUrl || t.audioUrl);
			if (a && s) {
				let t = o.getState().currentProjectId;
				if (!t) return;
				(async () => {
					let r = await c(a), i = await l(a, n, t);
					if (!i) return;
					let s = o.getState(), u = s.nodes.find((t) => t.id === e)?.data;
					if (!u) return;
					let d = { filePath: i.filePath };
					for (let e of [
						"imageUrl",
						"videoUrl",
						"audioUrl"
					]) u[e] && u[e] === r && (d[e] = i.assetUrl);
					s.updateNodeDataTransient(e, d);
				})();
			}
		}, [
			e,
			r,
			t.fileName,
			t.filePath,
			t.imageUrl,
			t.videoUrl,
			t.audioUrl
		])
	};
}
//#endregion
//#region src/hooks/useNodeSnap.ts
var y = 400, b = 8, x = 2, S = 12;
function C(e) {
	switch (e) {
		case "ai-text": return {
			width: 280,
			height: 160
		};
		case "ai-image": return {
			width: 280,
			height: 158
		};
		case "ai-video": return {
			width: 280,
			height: 160
		};
		case "ai-audio": return {
			width: 260,
			height: 140
		};
		default: return {
			width: 280,
			height: 160
		};
	}
}
function w(e, t) {
	let n = 0, r = 0, i = e.parentId;
	for (; i;) {
		let e = t.get(i);
		if (!e) break;
		n += e.position.x, r += e.position.y, i = e.parentId;
	}
	return {
		x: n,
		y: r
	};
}
function T(e, t) {
	let n = e.measured?.[t];
	if (typeof n == "number" && n > 0) return n;
	let r = e.data?.[t === "width" ? "nodeWidth" : "nodeHeight"];
	if (typeof r == "number") return r;
	if (typeof e[t] == "number") return e[t];
	let i = Number(e.style?.[t]);
	if (Number.isFinite(i) && i > 0) return i;
}
function E(e, t) {
	let n = C(e.type), r = T(e, "width") ?? n.width, i = T(e, "height") ?? n.height, a = e.parentId ? w(e, t) : {
		x: 0,
		y: 0
	}, o = e.position.x + a.x, s = e.position.y + a.y;
	return {
		x: o,
		y: s,
		width: r,
		height: i,
		left: o,
		centerX: o + r / 2,
		right: o + r,
		top: s,
		centerY: s + i / 2,
		bottom: s + i
	};
}
function D(e, t) {
	if (e.length === 0) return null;
	let n = Infinity, r = Infinity, i = -Infinity, a = -Infinity;
	for (let o of e) {
		let e = E(o, t);
		n = Math.min(n, e.left), r = Math.min(r, e.top), i = Math.max(i, e.right), a = Math.max(a, e.bottom);
	}
	let o = i - n, s = a - r;
	return {
		x: n,
		y: r,
		width: o,
		height: s,
		left: n,
		centerX: n + o / 2,
		right: i,
		top: r,
		centerY: r + s / 2,
		bottom: a
	};
}
var O = [
	"start",
	"center",
	"end"
];
function k(e, t) {
	return t === "horizontal" ? e.left : e.top;
}
function A(e, t) {
	return t === "horizontal" ? e.right : e.bottom;
}
function j(e, t) {
	return t === "horizontal" ? e.top : e.left;
}
function M(e, t, n) {
	return t === "horizontal" ? n === "start" ? e.top : n === "center" ? e.centerY : e.bottom : n === "start" ? e.left : n === "center" ? e.centerX : e.right;
}
function N(e, t, n) {
	return O.filter((r) => Math.abs(M(e, n, r) - M(t, n, r)) <= b);
}
function P(e, t, n) {
	let r = [], i = /* @__PURE__ */ new Map();
	for (let t = 0; t < e.length; t += 1) {
		let r = e[t];
		for (let a of O) {
			let o = -1, s = Infinity;
			for (let i = 0; i < e.length; i += 1) {
				if (t === i) continue;
				let c = e[i], l = k(c, n);
				l - A(r, n) < x || l >= s || Math.abs(M(r, n, a) - M(c, n, a)) > b || (o = i, s = l);
			}
			o >= 0 && i.set(`${t}:${o}`, [r, e[o]]);
		}
	}
	for (let [e, a] of i.values()) {
		let i = N(e, a, n), o = k(a, n) - A(e, n);
		r.push({
			axis: n,
			targetStart: k(e, n) - o - t,
			distance: o,
			placement: "before",
			first: e,
			second: a,
			crossAlignmentModes: i
		}), r.push({
			axis: n,
			targetStart: A(a, n) + o,
			distance: o,
			placement: "after",
			first: e,
			second: a,
			crossAlignmentModes: i
		});
		let s = (o - t) / 2;
		s >= x && r.push({
			axis: n,
			targetStart: A(e, n) + s,
			distance: s,
			placement: "between",
			first: e,
			second: a,
			crossAlignmentModes: i
		});
	}
	return r;
}
function F(e, t, n) {
	let r = n - k(e, t);
	return t === "horizontal" ? {
		...e,
		x: e.x + r,
		left: e.left + r,
		centerX: e.centerX + r,
		right: e.right + r
	} : {
		...e,
		y: e.y + r,
		top: e.top + r,
		centerY: e.centerY + r,
		bottom: e.bottom + r
	};
}
function I(e, t) {
	let n = F(t, e.axis, e.targetStart), { first: r, second: i } = e, a;
	return a = e.placement === "before" ? [{
		start: A(n, e.axis),
		end: k(r, e.axis)
	}, {
		start: A(r, e.axis),
		end: k(i, e.axis)
	}] : e.placement === "between" ? [{
		start: A(r, e.axis),
		end: k(n, e.axis)
	}, {
		start: A(n, e.axis),
		end: k(i, e.axis)
	}] : [{
		start: A(r, e.axis),
		end: k(i, e.axis)
	}, {
		start: A(i, e.axis),
		end: k(n, e.axis)
	}], {
		kind: "spacing",
		type: e.axis,
		distance: e.distance,
		crossPosition: Math.min(j(r, e.axis), j(i, e.axis), j(n, e.axis)) - S,
		segments: a
	};
}
function L(e, t, n) {
	let r = k(e, n), i = null;
	for (let a of t) {
		let t = Math.abs(r - a.targetStart);
		t > b || i && t >= i.diff || a.crossAlignmentModes.some((t) => {
			let r = M(e, n, t);
			return Math.abs(r - M(a.first, n, t)) <= b && Math.abs(r - M(a.second, n, t)) <= b;
		}) && (i = {
			targetStart: a.targetStart,
			diff: t,
			guide: I(a, e)
		});
	}
	return i;
}
function R(e, t) {
	let n = null;
	for (let r of e) for (let e of t) {
		let t = Math.abs(r - e);
		t <= b && (!n || t < n.diff) && (n = {
			value: r,
			targetValue: e,
			diff: t
		});
	}
	return n;
}
function z(e, t) {
	return e ? t && t.diff < e.diff ? t : e : t;
}
var B = (0, d.createContext)(null);
function V() {
	let { screenToFlowPosition: e } = i(), [t, n] = (0, d.useState)([]), r = (0, d.useRef)(/* @__PURE__ */ new Map()), a = (0, d.useRef)(null), s = (0, d.useRef)(null), c = (0, d.useCallback)(() => {
		n([]);
	}, []), l = (0, d.useCallback)((t, n) => {
		let r = o.getState().nodes, i = new Map(r.map((e) => [e.id, e])), a = null, s = document.querySelector(".react-flow__pane")?.getBoundingClientRect();
		if (s && s.width > 0 && s.height > 0) {
			let t = e({
				x: s.left,
				y: s.top
			}), n = e({
				x: s.right,
				y: s.bottom
			});
			a = {
				minX: Math.min(t.x, n.x) - y,
				minY: Math.min(t.y, n.y) - y,
				maxX: Math.max(t.x, n.x) + y,
				maxY: Math.max(t.y, n.y) + y
			};
		}
		let c = new Set(r.filter((e) => e.data?.groupCollapsed === !0).map((e) => e.id)), l = [], u = [], d = [], f = [], p = [];
		for (let e of r) {
			if (e.id === t || n?.has(e.id) || e.selected === !0 || e.data?.hiddenByCharacterLibrary === !0 || e.parentId && c.has(e.parentId)) continue;
			let r = E(e, i);
			a && (r.right < a.minX || r.left > a.maxX || r.bottom < a.minY || r.top > a.maxY) || (l.push(r.left, r.right), u.push(r.centerX), d.push(r.top, r.bottom), f.push(r.centerY), p.push(r));
		}
		return {
			nodeMap: i,
			otherXEdges: l,
			otherXCenters: u,
			otherYEdges: d,
			otherYCenters: f,
			otherBounds: p
		};
	}, [e]), u = (0, d.useCallback)((e, t) => {
		r.current.set(t.id, { ...t.position });
		let n = o.getState();
		n.commitToHistory();
		let i = new Set(n.selectedNodeIds), s = i.has(t.id) ? n.nodes.filter((e) => i.has(e.id)) : [t], c = new Set(s.map((e) => e.id)), u = l(t.id, c), d = D(s, u.nodeMap);
		a.current = d ? {
			...u,
			draggedBounds: d,
			horizontalSpacingCandidates: P(u.otherBounds, d.width, "horizontal"),
			verticalSpacingCandidates: P(u.otherBounds, d.height, "vertical")
		} : null;
	}, [l]), f = (0, d.useCallback)((e, t) => {
		let r = a.current;
		if (!r) return t;
		let { nodeMap: i, draggedBounds: o, otherXEdges: s, otherXCenters: c, otherYEdges: l, otherYCenters: u, horizontalSpacingCandidates: d, verticalSpacingCandidates: f } = r, p = i.get(e);
		if (!p) return t;
		let m = E(p, i), h = E({
			...p,
			position: t
		}, i), g = h.x - m.x, _ = h.y - m.y, v = {
			...o,
			x: o.x + g,
			y: o.y + _,
			left: o.left + g,
			centerX: o.centerX + g,
			right: o.right + g,
			top: o.top + _,
			centerY: o.centerY + _,
			bottom: o.bottom + _
		}, y = [], b = 0, x = 0, S = z(R([v.top, v.bottom], l), R([v.centerY], u)), C = L(v, f, "vertical");
		C && (!S || C.diff <= S.diff) ? (x = C.targetStart - v.top, y.push(C.guide)) : S && (x = S.targetValue - S.value, y.push({
			kind: "alignment",
			type: "horizontal",
			position: S.targetValue
		}));
		let w = z(R([v.left, v.right], s), R([v.centerX], c)), T = L(v, d, "horizontal");
		return T && (!w || T.diff <= w.diff) ? (b = T.targetStart - v.left, y.push(T.guide)) : w && (b = w.targetValue - w.value, y.push({
			kind: "alignment",
			type: "vertical",
			position: w.targetValue
		})), n(y), {
			x: t.x + b,
			y: t.y + x
		};
	}, []), p = (0, d.useCallback)((e) => {
		let { nodeMap: t, otherXEdges: n, otherXCenters: r, otherYEdges: i, otherYCenters: a } = l(e), o = t.get(e);
		if (!o) {
			s.current = null;
			return;
		}
		let c = E(o, t);
		s.current = {
			left: c.left,
			top: c.top,
			right: c.right,
			bottom: c.bottom,
			otherX: [...n, ...r],
			otherY: [...i, ...a]
		};
	}, [l]), m = (0, d.useCallback)((e, t, r, i = {
		x: 1,
		y: 1
	}) => {
		let a = s.current;
		if (!a) return {
			width: t,
			height: r
		};
		let { left: o, top: c, right: l, bottom: u, otherX: d, otherY: f } = a, p = [], m = t, h = r;
		if (i.x !== 0) {
			let e = R([i.x === 1 ? o + t : l - t], d);
			e && (m = i.x === 1 ? e.targetValue - o : l - e.targetValue, p.push({
				kind: "alignment",
				type: "vertical",
				position: e.targetValue
			}));
		}
		if (i.y !== 0) {
			let e = R([i.y === 1 ? c + r : u - r], f);
			e && (h = i.y === 1 ? e.targetValue - c : u - e.targetValue, p.push({
				kind: "alignment",
				type: "horizontal",
				position: e.targetValue
			}));
		}
		return n(p), {
			width: m,
			height: h
		};
	}, []), h = (0, d.useCallback)(() => {
		n([]), s.current = null;
	}, []);
	return {
		snapLines: t,
		onNodeDragStart: u,
		applySnap: f,
		onNodeDragStop: (0, d.useCallback)(() => {
			r.current.clear(), n([]), queueMicrotask(() => {
				a.current = null;
			});
		}, []),
		clearSnapLines: c,
		onResizeStart: p,
		applyResizeSnap: m,
		onResizeStop: h
	};
}
//#endregion
//#region src/hooks/useShiftProportional.ts
function H() {
	let e = (0, d.useRef)(!1);
	return (0, d.useEffect)(() => {
		let t = (t) => {
			t.key === "Shift" && !t.repeat && (e.current = !0);
		}, n = (t) => {
			t.key === "Shift" && (e.current = !1);
		}, r = () => {
			e.current = !1;
		};
		return window.addEventListener("keydown", t), window.addEventListener("keyup", n), window.addEventListener("blur", r), () => {
			window.removeEventListener("keydown", t), window.removeEventListener("keyup", n), window.removeEventListener("blur", r);
		};
	}, []), e;
}
function U() {
	let e = (0, d.useRef)({
		w: 0,
		h: 0,
		x: 0,
		y: 0,
		ratio: 1
	});
	return {
		lockRef: e,
		reset: () => {
			e.current = {
				w: 0,
				h: 0,
				x: 0,
				y: 0,
				ratio: 1
			};
		},
		lock: (t, n, r, i) => {
			e.current = {
				w: t,
				h: n,
				x: r,
				y: i,
				ratio: n > 0 ? t / n : 1
			};
		},
		isLocked: () => e.current.w !== 0
	};
}
function W(e, t, n, r, i, a, o, s, c = "both") {
	if (!s) return {
		width: c === "y" ? e : Math.max(a, e + n),
		height: c === "x" ? t : Math.max(o, t + r)
	};
	let l = e + n, u = t + r, d = i > 0 && Number.isFinite(i) ? i : 1, f, p;
	return c === "x" || c === "both" && Math.abs(n) >= Math.abs(r) ? (f = Math.max(a, o * d, l), p = f / d) : (p = Math.max(o, a / d, u), f = p * d), {
		width: f,
		height: p
	};
}
//#endregion
//#region src/hooks/useNodeLocked.ts
function G(e) {
	return o((t) => !!e && t.nodes.find((t) => t.id === e)?.draggable === !1);
}
//#endregion
//#region src/components/nodes/shared/ResizeHandle.tsx
var K = [
	{
		name: "nw",
		x: -1,
		y: -1
	},
	{
		name: "n",
		x: 0,
		y: -1
	},
	{
		name: "ne",
		x: 1,
		y: -1
	},
	{
		name: "w",
		x: -1,
		y: 0
	},
	{
		name: "e",
		x: 1,
		y: 0
	},
	{
		name: "sw",
		x: -1,
		y: 1
	},
	{
		name: "s",
		x: 0,
		y: 1
	},
	{
		name: "se",
		x: 1,
		y: 1
	}
];
function q({ nodeId: e, currentWidth: t, currentHeight: n, minWidth: r = 160, minHeight: i = 120, lockAspectRatio: a = !1, onResizeStart: s, onResizeEnd: c, onResize: l }) {
	let u = (0, d.useRef)(null), p = (0, d.useRef)(!1), m = (0, d.useRef)({
		x: 0,
		y: 0,
		w: 0,
		h: 0,
		left: 0,
		top: 0
	}), h = (0, d.useContext)(B), g = H(), { lockRef: _, reset: v, lock: y } = U(), b = G(e), x = (0, d.useRef)({
		currentWidth: t,
		currentHeight: n,
		minWidth: r,
		minHeight: i,
		lockAspectRatio: a,
		onResizeStart: s,
		onResizeEnd: c,
		onResize: l,
		nodeId: e,
		snap: h
	});
	return (0, d.useEffect)(() => {
		x.current = {
			currentWidth: t,
			currentHeight: n,
			minWidth: r,
			minHeight: i,
			lockAspectRatio: a,
			onResizeStart: s,
			onResizeEnd: c,
			onResize: l,
			nodeId: e,
			snap: h
		};
	}, [
		n,
		t,
		a,
		i,
		r,
		e,
		l,
		c,
		s,
		h
	]), (0, d.useEffect)(() => {
		let e = u.current;
		if (!e) return;
		let t = (t) => {
			let n = t.target?.closest(".node-resize-handle");
			if (!n || !e.contains(n)) return;
			let r = Number(n.dataset.dirX ?? 1), i = Number(n.dataset.dirY ?? 1), a = {
				x: r,
				y: i
			}, s = r === 0 ? "y" : i === 0 ? "x" : "both";
			t.preventDefault(), t.stopPropagation();
			let { currentWidth: c, currentHeight: l, minWidth: u, minHeight: d, lockAspectRatio: f, onResizeStart: h, onResizeEnd: b, onResize: S, nodeId: C, snap: w } = x.current;
			p.current = !0, n.classList.add("is-resizing");
			let T = C ? o.getState().nodes.find((e) => e.id === C)?.position : void 0;
			m.current = {
				x: t.clientX,
				y: t.clientY,
				w: c,
				h: l,
				left: T?.x ?? 0,
				top: T?.y ?? 0
			}, v(), C && w?.onResizeStart(C);
			let E = !1, D = c, O = l, k = (e) => {
				if (!p.current) return;
				let t = m.current.w, n = m.current.h, c = (e.clientX - m.current.x) * r, l = (e.clientY - m.current.y) * i, b = n > 0 ? t / n : 1, x = f;
				!f && g.current ? (_.current.w === 0 && y(t, n, m.current.x, m.current.y), t = _.current.w, n = _.current.h, c = (e.clientX - _.current.x) * r, l = (e.clientY - _.current.y) * i, b = _.current.ratio, x = !0) : v();
				let { width: k, height: A } = W(t, n, c, l, b, u, d, x, s);
				if (C && w && !f) {
					let e = w.applyResizeSnap(C, k, A, a);
					k = Math.max(u, e.width), A = Math.max(d, e.height);
				}
				k === D && A === O || (E ||= (h?.(), !0), D = k, O = A, S(k, A), C && (r === -1 || i === -1) && T && o.getState().updateNodePositionTransient(C, {
					x: r === -1 ? m.current.left + (m.current.w - k) : T.x,
					y: i === -1 ? m.current.top + (m.current.h - A) : T.y
				}));
			}, A = () => {
				p.current = !1, n.classList.remove("is-resizing"), E && b?.(), C && w?.onResizeStop(), document.removeEventListener("pointermove", k), document.removeEventListener("pointerup", A), document.body.style.cursor = "", document.body.style.userSelect = "";
			};
			document.body.style.cursor = getComputedStyle(n).cursor, document.body.style.userSelect = "none", document.addEventListener("pointermove", k), document.addEventListener("pointerup", A);
		};
		return e.addEventListener("pointerdown", t, !0), () => e.removeEventListener("pointerdown", t, !0);
	}, [
		g,
		_,
		v,
		y,
		b
	]), b ? null : /* @__PURE__ */ (0, f.jsx)("div", {
		className: "node-resize-handles",
		ref: u,
		children: K.map(({ name: e, x: t, y: n }) => /* @__PURE__ */ (0, f.jsx)("div", {
			className: `node-resize-handle node-resize-handle--${e} nokey nodrag nopan`,
			"data-dir-x": t,
			"data-dir-y": n
		}, e))
	});
}
//#endregion
export { v as a, p as c, V as i, G as n, _ as o, B as r, h as s, q as t };
