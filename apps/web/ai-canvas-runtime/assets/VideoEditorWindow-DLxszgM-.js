import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./jsx-runtime-BAkIPmuO.js";
import { a as r, i } from "./i18n-on3r1DCI.js";
import { a } from "./core-D3lATfku.js";
import { $ as o, Q as s, Z as c, at as l, ct as u, dt as d, et as f, ft as p, lt as m, mt as h, nt as g, ot as _, pt as v, rt as y, st as b, tt as x, ut as S } from "./indexedDbService-CqWFA8LG.js";
import { D as C, K as w, g as ee, z as T } from "./directorSceneSchema-D22Qlbpb.js";
import { E, H as D, K as te, O, S as k, ft as ne, m as A, pt as re, q as j, x as ie } from "./fileService-BawXHbsK.js";
import { n as M, t as ae } from "./rasterImageDimensions-CX1VK2cM.js";
import { S as oe, a as se, b as N, c as P, d as ce, f as F, g as I, i as le, l as ue, m as L, n as de, p as fe, s as pe, v as me, x as he, y as ge } from "./videoEditorWindowService-DaiRFSDC.js";
//#region src/components/videoEditor/timelineOps.ts
var R = /* @__PURE__ */ e(t(), 1);
function _e(e, t) {
	let n = [], r = /* @__PURE__ */ new Set(), i = (e) => {
		r.has(e.id) || (r.add(e.id), n.push(e));
	};
	for (let n of e) if (!(n.hidden || n.kind !== "video")) for (let e of _(n, t)) {
		if (y(e, t - e.timelineStart) < 1 && e.transitionIn?.kind === "dissolve") {
			let t = n.clips.indexOf(e), r = t > 0 ? n.clips[t - 1] : void 0;
			r && Math.abs(u(r) - e.timelineStart) < .001 && i(r);
		}
		i(e);
	}
	return n;
}
function ve(e, t) {
	return e.left <= t.right && e.right >= t.left && e.top <= t.bottom && e.bottom >= t.top;
}
function ye(e, t) {
	return e.find((e) => e.id === t)?.locked === !0;
}
function be(e, t) {
	return e.find((e) => e.clips.some((e) => e.id === t))?.locked === !0;
}
function xe(e, t, n) {
	let r = e.findIndex((e) => e.id === t);
	if (r < 0) return e;
	let i = Math.max(0, Math.min(e.length - 1, n));
	if (i === r) return e;
	let a = [...e], [o] = a.splice(r, 1);
	return a.splice(i, 0, o), v(a);
}
function z(e, t) {
	let n = e.findIndex((e) => e.id === t);
	if (n < 0) return e;
	let r = e[n], i = {
		...r,
		id: `${r.id}-copy${Date.now().toString(36)}`
	}, a = [...e];
	return a.splice(n + 1, 0, i), v(a);
}
function B(e, t, n) {
	let r = e.findIndex((e) => e.clips.some((e) => e.id === t));
	if (r < 0) return e;
	let i = e[r], a = i.clips.map((e) => e.id === t ? n(e) : e), o = {
		...i,
		clips: i.kind === "video" && !i.overlay ? v(a) : a
	}, s = [...e];
	return s[r] = o, s;
}
function Se(e, t) {
	let n = e.findIndex((e) => e.clips.some((e) => e.id === t));
	if (n < 0) return e;
	let r = e[n], i = r.clips.findIndex((e) => e.id === t);
	if (i < 0) return e;
	if (r.kind === "video" && !r.overlay) {
		let i = [...e];
		return i[n] = {
			...r,
			clips: z(r.clips, t)
		}, i;
	}
	let a = r.clips[i], o = {
		...a,
		id: `${a.id}-copy${Date.now().toString(36)}`,
		timelineStart: a.timelineStart + b(a)
	}, s = [...r.clips];
	s.splice(i + 1, 0, o);
	let c = [...e];
	return c[n] = {
		...r,
		clips: s
	}, c;
}
function Ce(e, t) {
	let n = t instanceof Set ? t : new Set(t);
	if (e.filter((e) => e.kind === "video").flatMap((e) => e.clips).filter((e) => !n.has(e.id)).length === 0) return e;
	let r = !1, i = e.map((e) => {
		let t = e.clips.filter((e) => !n.has(e.id));
		return t.length === e.clips.length ? e : (r = !0, {
			...e,
			clips: e.kind === "video" && !e.overlay ? v(t) : t
		});
	});
	return r ? i : e;
}
function V(e, t, n, r = 6) {
	if (n <= 0) return e;
	let i = r / n, a = e, o = i;
	for (let n of t) {
		let t = Math.abs(n - e);
		t <= o && (a = n, o = t);
	}
	return a;
}
function we(e) {
	return Math.min(400, Math.max(2, e));
}
function Te(e, t) {
	return e <= 0 || t <= 0 ? 40 : we(t / e);
}
function H(e, t, n) {
	let r = e.filter((e) => e.id !== n), i = 0;
	for (let e of r) {
		if (t < e.timelineStart + b(e) / 2) break;
		i += 1;
	}
	return i;
}
function Ee(e, t) {
	let n = t.filter((t) => t.kind === e);
	return {
		id: `${e}-${Date.now().toString(36)}`,
		kind: e,
		name: e === "video" ? `叠加轨 ${n.length}` : `音频轨 ${n.length + 1}`,
		overlay: e === "video" && n.length > 0,
		clips: []
	};
}
function De(e, t, n) {
	let r = e.findIndex((e) => e.id === t);
	if (r < 0) return e;
	let i = e.findIndex((e) => e.kind === "video"), a = r + n;
	if (a <= i || a >= e.length) return e;
	let o = [...e];
	return [o[r], o[a]] = [o[a], o[r]], o;
}
//#endregion
//#region src/components/videoEditor/rulerTicks.ts
var U = [
	.1,
	.2,
	.5,
	1,
	2,
	5,
	10,
	15,
	30,
	60,
	120,
	300,
	600
], Oe = 8, W = 72;
function ke(e, t) {
	if (e <= 0) return 1;
	let n = t && t > 0 ? W / t : e / Oe;
	return U.find((e) => e >= n) ?? U[U.length - 1];
}
function Ae(e, t) {
	if (e >= 60) {
		let t = Math.floor(e / 60);
		return `${t}:${(e - t * 60).toFixed(0).padStart(2, "0")}`;
	}
	return t < 1 ? e.toFixed(1) : String(Math.round(e));
}
function je(e, t) {
	if (e <= 0 || t <= 0) return [];
	let n = [], r = t / 5;
	for (let i = 0; i * r <= e + 1e-6; i += 1) {
		let e = i * r, a = Math.abs(e / t - Math.round(e / t)) < 1e-6;
		n.push({
			time: e,
			major: a
		});
	}
	return n;
}
//#endregion
//#region src/components/videoEditor/VideoEditorRuler.tsx
var G = n();
function Me({ duration: e, playhead: t, pixelsPerSecond: n, onScrub: i }) {
	let a = r(), o = ke(e, n), s = je(e, o);
	return /* @__PURE__ */ (0, G.jsxs)("div", {
		className: "video-editor-ruler",
		onPointerDown: i,
		role: "slider",
		"aria-label": a("播放头"),
		"aria-valuenow": t,
		"aria-valuemin": 0,
		"aria-valuemax": e,
		tabIndex: 0,
		children: [s.map((e, t) => /* @__PURE__ */ (0, G.jsx)("span", {
			className: `video-editor-tick ${e.major ? "major" : ""}`,
			style: { left: e.time * n },
			children: e.major && e.time > 0 && /* @__PURE__ */ (0, G.jsx)("em", {
				className: "video-editor-tick-label",
				children: Ae(e.time, o)
			})
		}, t)), /* @__PURE__ */ (0, G.jsx)("div", {
			className: "video-editor-ruler-handle",
			style: { left: t * n }
		})]
	});
}
var Ne = (0, R.memo)(Me);
//#endregion
//#region src/components/videoEditor/VideoEditorWaveform.tsx
function Pe({ peaks: e }) {
	let t = r();
	if (e.length === 0) return /* @__PURE__ */ (0, G.jsx)("div", {
		className: "video-editor-waveform-empty",
		children: t("解析波形中…")
	});
	let n = 100 / Math.max(1, e.length - 1);
	return /* @__PURE__ */ (0, G.jsx)("svg", {
		className: "video-editor-waveform",
		viewBox: "0 0 100 100",
		preserveAspectRatio: "none",
		children: /* @__PURE__ */ (0, G.jsx)("polygon", { points: `${e.map((e, t) => `${t * n},${50 - e * 48}`).join(" ")} ${e.map((t, r) => `${(e.length - 1 - r) * n},${50 + t * 48}`).reverse().join(" ")}` })
	});
}
var Fe = (0, R.memo)(Pe), Ie = {
	dissolve: "交叠淡入",
	fade: "黑场淡入",
	none: "硬切"
}, Le = .1, Re = 4, ze = "application/x-video-editor-clip-id", Be = {
	compact: {
		height: 48,
		textHeight: 26,
		label: "紧凑"
	},
	normal: {
		height: 64,
		textHeight: 30,
		label: "标准"
	},
	large: {
		height: 84,
		textHeight: 38,
		label: "宽大"
	}
}, Ve = {
	video: "🎬",
	audio: "🔊",
	caption: "💬"
}, He = [
	"var(--track-color-1, #6366f1)",
	"var(--track-color-2, #22c55e)",
	"var(--track-color-3, #f59e0b)",
	"var(--track-color-4, #3b82f6)",
	"var(--track-color-5, #ec4899)",
	"var(--track-color-6, #14b8a6)"
];
function Ue(e) {
	return He[e % He.length];
}
function We(e) {
	return e.kind === "video" && e.overlay === !0 && e.clips.length > 0 && e.clips.every((e) => e.kind === "text");
}
var Ge = 64, Ke = 360;
function qe(e, t, n) {
	if (e.kind === "text" || !t) return [];
	let r = b(e), i = Math.max(1, Math.min(Ke, Math.ceil(r * n / Ge)));
	if (t.thumbnails.length === 0) return [];
	if (e.kind === "image") return Array(i).fill(t.thumbnails[0]);
	let a = t.probe?.duration ?? 0;
	return a <= 0 ? [] : Array.from({ length: i }, (n, o) => {
		let s = e.sourceIn + (o + .5) / i * r, c = Math.min(t.thumbnails.length - 1, Math.max(0, Math.floor(s / a * t.thumbnails.length)));
		return t.thumbnails[c];
	});
}
function Je({ tracks: e, duration: t, playhead: n, selectedClipIds: i, getSource: a, snapEnabled: o, onToggleSnap: s, onPlayheadChange: c, onSelectClips: l, onTrimClip: u, onMoveClip: d, onMoveClipToTrack: f, onMoveClipInOverlay: p, onCreateTrackAndMove: m, onSplit: h, onDeleteSelected: g, onDuplicateClip: _, onEditTransition: v, onTracksChange: y, onAddTrack: x, onMoveTrack: S, onBeginInteraction: C, onEndInteraction: w, canSplit: ee, canUndo: T, canRedo: E, onUndo: D, onRedo: te }) {
	let O = r(), k = (0, R.useRef)(null), ne = (0, R.useRef)(null), [A, re] = (0, R.useState)(40), [j, ie] = (0, R.useState)(!0), [ae, oe] = (0, R.useState)("normal"), [se, N] = (0, R.useState)(null), [P, ce] = (0, R.useState)(null), [F, I] = (0, R.useState)(null), [le, ue] = (0, R.useState)(null), L = (0, R.useMemo)(() => new Set(i), [i]), de = (0, R.useMemo)(() => [...e.filter((e) => e.kind === "video").reverse(), ...e.filter((e) => e.kind !== "video")], [e]), fe = (0, R.useMemo)(() => e.filter((e) => e.kind === "video").reduce((e, t) => e + t.clips.length, 0), [e]), pe = (0, R.useMemo)(() => e.flatMap((e) => e.clips.filter((t) => L.has(t.id) && !e.locked).map((t) => ({
		clip: t,
		track: e
	}))), [L, e]), me = pe.filter(({ track: e }) => e.kind === "video").length, he = pe.length > 0 && fe - me > 0, ge = (0, R.useMemo)(() => {
		let t = [];
		for (let n of e) if (n.kind === "video") for (let e of n.clips) t.push({
			clip: e,
			trackId: n.id
		});
		return t;
	}, [e]), _e = (0, R.useMemo)(() => ge.find(({ clip: e }) => e.id === i[0])?.clip ?? null, [ge, i]), ye = le ? e.some((e) => e.locked && e.clips.some((e) => e.id === le.clipId)) : !1, be = Math.max(0, t * A), xe = (0, R.useMemo)(() => {
		if (!F) return null;
		let t = e.find((e) => e.id === F.targetTrackId);
		if (!t || t.overlay) return F.position * A;
		let n = t.clips.filter((e) => e.id !== F.clipId), r = 0;
		for (let e = 0; e < Math.min(F.position, n.length); e += 1) r += b(n[e]);
		return r * A;
	}, [
		F,
		A,
		e
	]);
	(0, R.useLayoutEffect)(() => {
		if (!j) return;
		let e = k.current;
		if (!e || t <= 0) return;
		let n = () => re(Te(t, e.clientWidth - 24));
		n();
		let r = new ResizeObserver(n);
		return r.observe(e), () => r.disconnect();
	}, [j, t]);
	let z = (0, R.useCallback)((e) => {
		let n = k.current;
		if (!n || A <= 0) return 0;
		let r = e - n.getBoundingClientRect().left + n.scrollLeft;
		return Math.min(t, Math.max(0, r / A));
	}, [t, A]), B = (0, R.useCallback)((t, r) => {
		if (!o) return N(null), t;
		let i = [0];
		for (let t of e) if (t.kind === "video") for (let e of t.clips) e.id !== r && (i.push(e.timelineStart), i.push(e.timelineStart + b(e)));
		i.push(n);
		let a = V(t, [...new Set(i)].sort((e, t) => e - t), A);
		return N(a === t ? null : a), a;
	}, [
		A,
		n,
		o,
		e
	]);
	(0, R.useEffect)(() => {
		let e = k.current;
		if (!e) return;
		let t = (t) => {
			if (t.ctrlKey || t.metaKey) {
				t.preventDefault();
				let n = e.getBoundingClientRect(), r = (t.clientX - n.left + e.scrollLeft) / A, i = Math.sign(t.deltaY) * Math.min(Math.abs(t.deltaY), 30), a = we(A * Math.exp(-i / 180));
				ie(!1), re(a), requestAnimationFrame(() => {
					e.scrollLeft = r * a - (t.clientX - n.left);
				});
				return;
			}
			if (t.shiftKey || Math.abs(t.deltaX) > Math.abs(t.deltaY)) {
				t.preventDefault();
				let n = Math.abs(t.deltaX) > Math.abs(t.deltaY) ? t.deltaX : t.deltaY;
				e.scrollLeft += Math.sign(n) * Math.min(Math.abs(n), 80);
			}
		};
		return e.addEventListener("wheel", t, { passive: !1 }), () => e.removeEventListener("wheel", t);
	}, [A]), (0, R.useEffect)(() => {
		if (!le) return;
		let e = () => ue(null);
		return document.addEventListener("pointerdown", e), () => document.removeEventListener("pointerdown", e);
	}, [le]);
	let Se = (0, R.useCallback)((e) => {
		e.stopPropagation();
		let t = e.currentTarget;
		t.setPointerCapture(e.pointerId), c(B(z(e.clientX)));
		let n = (e) => {
			c(B(z(e.clientX)));
		}, r = (e) => {
			t.releasePointerCapture(e.pointerId), t.removeEventListener("pointermove", n), t.removeEventListener("pointerup", r), t.removeEventListener("pointercancel", r), N(null);
		};
		t.addEventListener("pointermove", n), t.addEventListener("pointerup", r), t.addEventListener("pointercancel", r);
	}, [
		B,
		c,
		z
	]), Ce = (0, R.useCallback)((e) => {
		if (e.button !== 0 || e.target.closest(".video-editor-clip, .video-editor-ruler")) return;
		let t = ne.current;
		if (!t) return;
		e.preventDefault();
		let n = e.currentTarget;
		n.setPointerCapture(e.pointerId);
		let r = t.getBoundingClientRect(), a = e.clientX, o = e.clientY, s = a - r.left, u = o - r.top, d = e.shiftKey || e.metaKey || e.ctrlKey ? i : [], f = !1, p = (e) => {
			if (!f && Math.abs(e.clientX - a) < Re && Math.abs(e.clientY - o) < Re) return;
			f = !0;
			let n = e.clientX - r.left, i = e.clientY - r.top, c = {
				left: Math.min(a, e.clientX),
				top: Math.min(o, e.clientY),
				right: Math.max(a, e.clientX),
				bottom: Math.max(o, e.clientY)
			};
			ce({
				left: Math.min(s, n),
				top: Math.min(u, i),
				width: Math.abs(n - s),
				height: Math.abs(i - u)
			});
			let p = [...t.querySelectorAll("[data-clip-id]")].filter((e) => ve(c, e.getBoundingClientRect())).map((e) => e.dataset.clipId).filter((e) => !!e);
			l([...new Set([...d, ...p])]);
		}, m = (e) => {
			n.hasPointerCapture(e.pointerId) && n.releasePointerCapture(e.pointerId), n.removeEventListener("pointermove", p), n.removeEventListener("pointerup", m), n.removeEventListener("pointercancel", m), ce(null), f || (l([]), c(B(z(e.clientX))), N(null));
		};
		n.addEventListener("pointermove", p), n.addEventListener("pointerup", m), n.addEventListener("pointercancel", m);
	}, [
		B,
		c,
		l,
		i,
		z
	]), Ee = (0, R.useCallback)((e, t, n) => {
		n.preventDefault(), n.stopPropagation();
		let r = n.currentTarget;
		r.setPointerCapture(n.pointerId), C();
		let i = (n) => {
			let r = B(z(n), e.id), i = e.sourceIn + (r - e.timelineStart);
			t === "in" ? u(e.id, Math.max(0, Math.min(i, e.sourceOut - Le)), e.sourceOut) : u(e.id, e.sourceIn, Math.max(i, e.sourceIn + Le));
		}, a = (e) => i(e.clientX), o = (e) => {
			r.releasePointerCapture(e.pointerId), r.removeEventListener("pointermove", a), r.removeEventListener("pointerup", o), r.removeEventListener("pointercancel", o), N(null), w();
		};
		r.addEventListener("pointermove", a), r.addEventListener("pointerup", o), r.addEventListener("pointercancel", o);
	}, [
		B,
		C,
		w,
		u,
		z
	]), De = (0, R.useCallback)((n, r, a) => {
		if (a.stopPropagation(), a.button !== 0) return;
		let o = a.currentTarget;
		o.setPointerCapture(a.pointerId);
		let s = a.clientX, c = a.clientY, u = s - o.getBoundingClientRect().left, h = a.shiftKey || a.metaKey || a.ctrlKey, g = !1, _ = !1, v = e.find((e) => e.id === r), y = v?.overlay ?? !1, b = (t) => {
			let n = e.filter((e) => e.kind === "video" && !e.locked);
			if (n.length === 0) return null;
			let i = 0;
			for (let e of n) {
				let n = document.querySelector(`[data-track-id="${e.id}"]`);
				if (!n) continue;
				let r = n.getBoundingClientRect();
				if (r.bottom > i && (i = r.bottom), t >= r.top && t <= r.bottom) return e.id;
			}
			return t > i ? null : r;
		}, x = (e) => {
			let n = k.current;
			if (!n || A <= 0) return 0;
			let r = n.getBoundingClientRect(), i = e - u - r.left + n.scrollLeft;
			return Math.min(t, Math.max(0, i / A));
		}, S = (t) => {
			if (!g && Math.abs(t.clientX - s) < Re && Math.abs(t.clientY - c) < Re) return;
			g || (g = !0, l([n.id]));
			let i = b(t.clientY), a = x(t.clientX);
			if (i === null) {
				let e = B(a, n.id);
				I({
					clipId: n.id,
					sourceTrackId: r,
					targetTrackId: "__new__",
					position: e,
					offsetPx: t.clientX - s,
					offsetY: t.clientY - c
				});
				return;
			}
			let o = e.find((e) => e.id === i), u = B(a, n.id);
			if (o?.overlay) I({
				clipId: n.id,
				sourceTrackId: r,
				targetTrackId: i,
				position: u,
				offsetPx: t.clientX - s,
				offsetY: t.clientY - c
			});
			else {
				let e = H(o?.clips ?? [], a, n.id);
				I({
					clipId: n.id,
					sourceTrackId: r,
					targetTrackId: i,
					position: e,
					offsetPx: t.clientX - s,
					offsetY: t.clientY - c
				});
			}
		}, ee = (e) => {
			o.hasPointerCapture(e) && o.releasePointerCapture(e), o.removeEventListener("pointermove", S), o.removeEventListener("pointerup", E), o.removeEventListener("pointercancel", T);
		}, T = (e) => {
			ee(e.pointerId), I(null), N(null);
		}, E = (t) => {
			if (ee(t.pointerId), g) {
				let i = b(t.clientY), a = x(t.clientX);
				if (_ || (_ = !0, C()), i === null) {
					let e = B(a, n.id);
					m(n.id, r, e);
				} else if (i !== r) {
					let t = e.find((e) => e.id === i);
					if (t?.overlay) {
						let e = B(a, n.id);
						f(n.id, r, i, e);
					} else {
						let e = H(t?.clips ?? [], a, n.id);
						f(n.id, r, i, e);
					}
				} else if (y) {
					let e = B(a, n.id);
					p(n.id, r, e);
				} else {
					let e = H(v?.clips ?? [], a, n.id);
					d(n.id, e);
				}
				w();
			} else l(h ? L.has(n.id) ? i.filter((e) => e !== n.id) : [...i, n.id] : [n.id]);
			I(null), N(null);
		};
		o.addEventListener("pointermove", S), o.addEventListener("pointerup", E), o.addEventListener("pointercancel", T);
	}, [
		B,
		t,
		C,
		m,
		w,
		d,
		p,
		f,
		l,
		A,
		i,
		L,
		e
	]), U = (0, R.useCallback)((t, n) => {
		C(), y(e.map((e) => e.id === t ? {
			...e,
			[n]: !e[n]
		} : e)), w();
	}, [
		C,
		w,
		y,
		e
	]), Oe = (0, R.useCallback)((e) => {
		ie(!1), re((t) => we(t * e));
	}, []), W = (0, R.useCallback)(() => {
		oe((e) => e === "compact" ? "normal" : e === "normal" ? "large" : "compact");
	}, []), ke = (0, R.useCallback)((n, r) => {
		if (r.preventDefault(), r.stopPropagation(), n.locked || n.kind !== "video") return;
		let i = r.dataTransfer.getData(ze);
		if (!i) return;
		let a = e.find((e) => e.clips.some((e) => e.id === i));
		if (!a || a.locked) return;
		let o = k.current;
		if (!o || A <= 0) return;
		let s = o.getBoundingClientRect(), c = Math.max(0, Math.min(t, (r.clientX - s.left + o.scrollLeft) / A));
		if (C(), n.overlay) {
			let e = B(c, i);
			a.id === n.id ? p(i, n.id, e) : f(i, a.id, n.id, e);
		} else {
			let e = H(n.clips, c, i);
			a.id === n.id ? d(i, e) : f(i, a.id, n.id, e);
		}
		l([i]), w(), N(null);
	}, [
		B,
		t,
		C,
		w,
		d,
		p,
		f,
		l,
		A,
		e
	]), Ae = Be[ae];
	return /* @__PURE__ */ (0, G.jsxs)("section", {
		className: "video-editor-timeline",
		style: {
			"--video-editor-track-h": `${Ae.height}px`,
			"--video-editor-text-track-h": `${Ae.textHeight}px`
		},
		children: [
			/* @__PURE__ */ (0, G.jsxs)("div", {
				className: "video-editor-timeline-head",
				children: [
					/* @__PURE__ */ (0, G.jsxs)("div", {
						className: "video-editor-timeline-actions",
						children: [
							/* @__PURE__ */ (0, G.jsxs)("span", {
								className: "video-editor-timeline-title",
								children: [/* @__PURE__ */ (0, G.jsx)(M, {
									icon: "lucide:panel-bottom",
									width: 13,
									height: 13
								}), O("时间轴")]
							}),
							/* @__PURE__ */ (0, G.jsxs)("div", {
								className: "video-editor-toolgroup compact",
								"aria-label": O("历史操作"),
								children: [/* @__PURE__ */ (0, G.jsx)("button", {
									type: "button",
									className: "video-editor-timeline-btn icon-only",
									onClick: D,
									disabled: !T,
									"data-tooltip": O("撤销 Ctrl+Z"),
									"aria-label": O("撤销"),
									children: /* @__PURE__ */ (0, G.jsx)(M, {
										icon: "lucide:undo-2",
										width: 13,
										height: 13
									})
								}), /* @__PURE__ */ (0, G.jsx)("button", {
									type: "button",
									className: "video-editor-timeline-btn icon-only",
									onClick: te,
									disabled: !E,
									"data-tooltip": O("重做 Ctrl+Shift+Z"),
									"aria-label": O("重做"),
									children: /* @__PURE__ */ (0, G.jsx)(M, {
										icon: "lucide:redo-2",
										width: 13,
										height: 13
									})
								})]
							}),
							/* @__PURE__ */ (0, G.jsxs)("div", {
								className: "video-editor-toolgroup",
								"aria-label": O("片段操作"),
								children: [
									/* @__PURE__ */ (0, G.jsxs)("button", {
										type: "button",
										className: "video-editor-timeline-btn emphasis",
										onClick: h,
										disabled: !ee,
										"data-tooltip": O("在播放头处分割 S"),
										children: [
											/* @__PURE__ */ (0, G.jsx)(M, {
												icon: "lucide:scissors",
												width: 13,
												height: 13
											}),
											O("分割"),
											/* @__PURE__ */ (0, G.jsx)("kbd", { children: "S" })
										]
									}),
									/* @__PURE__ */ (0, G.jsx)("button", {
										type: "button",
										className: "video-editor-timeline-btn icon-only",
										onClick: () => _e && _(_e.id),
										disabled: !_e,
										"data-tooltip": O("复制片段 Ctrl+D"),
										"aria-label": O("复制片段"),
										children: /* @__PURE__ */ (0, G.jsx)(M, {
											icon: "lucide:copy",
											width: 13,
											height: 13
										})
									}),
									/* @__PURE__ */ (0, G.jsx)("button", {
										type: "button",
										className: "video-editor-timeline-btn danger icon-only",
										onClick: g,
										disabled: !he,
										"data-tooltip": O("删除选中片段 Del"),
										"aria-label": O("删除选中片段"),
										children: /* @__PURE__ */ (0, G.jsx)(M, {
											icon: "lucide:trash-2",
											width: 13,
											height: 13
										})
									})
								]
							}),
							/* @__PURE__ */ (0, G.jsxs)("button", {
								type: "button",
								className: `video-editor-timeline-btn ${o ? "active" : ""}`,
								onClick: s,
								"data-tooltip": O("边界吸附"),
								"aria-pressed": o,
								children: [/* @__PURE__ */ (0, G.jsx)(M, {
									icon: "lucide:magnet",
									width: 13,
									height: 13
								}), O("吸附")]
							}),
							/* @__PURE__ */ (0, G.jsxs)("div", {
								className: "video-editor-toolgroup",
								"aria-label": O("添加轨道"),
								children: [/* @__PURE__ */ (0, G.jsxs)("button", {
									type: "button",
									className: "video-editor-timeline-btn",
									onClick: () => x("video"),
									"data-tooltip": O("新增叠加轨（画中画 / 贴纸）"),
									children: [/* @__PURE__ */ (0, G.jsx)(M, {
										icon: "lucide:layers",
										width: 13,
										height: 13
									}), O("叠加轨")]
								}), /* @__PURE__ */ (0, G.jsxs)("button", {
									type: "button",
									className: "video-editor-timeline-btn",
									onClick: () => x("audio"),
									"data-tooltip": O("新增音频轨"),
									children: [/* @__PURE__ */ (0, G.jsx)(M, {
										icon: "lucide:audio-lines",
										width: 13,
										height: 13
									}), O("音频轨")]
								})]
							})
						]
					}),
					/* @__PURE__ */ (0, G.jsx)("div", {
						className: "video-editor-timeline-selection",
						"aria-live": "polite",
						children: _e ? /* @__PURE__ */ (0, G.jsxs)(G.Fragment, { children: [/* @__PURE__ */ (0, G.jsx)(M, {
							icon: "lucide:film",
							width: 12,
							height: 12
						}), /* @__PURE__ */ (0, G.jsxs)("span", {
							className: "video-editor-timeline-range",
							children: [
								_e.fileName,
								" · ",
								b(_e).toFixed(2),
								"s"
							]
						})] }) : i.length > 1 ? /* @__PURE__ */ (0, G.jsx)("span", {
							className: "video-editor-timeline-range",
							children: O("已选中 {count} 个片段", { count: i.length })
						}) : /* @__PURE__ */ (0, G.jsx)("span", {
							className: "video-editor-timeline-range dim",
							children: O("选择片段后可编辑")
						})
					}),
					/* @__PURE__ */ (0, G.jsxs)("div", {
						className: "video-editor-zoom",
						children: [
							/* @__PURE__ */ (0, G.jsx)("button", {
								type: "button",
								className: "video-editor-timeline-btn",
								onClick: W,
								"data-tooltip": `${O("轨道高度：紧凑/标准/宽大")}`,
								"aria-label": `${O("轨道高度：紧凑/标准/宽大")}`,
								children: /* @__PURE__ */ (0, G.jsx)(M, {
									icon: "lucide:rows-3",
									width: 13,
									height: 13
								})
							}),
							/* @__PURE__ */ (0, G.jsx)("button", {
								type: "button",
								className: "video-editor-timeline-btn",
								onClick: () => Oe(1 / 1.4),
								"data-tooltip": O("缩小"),
								children: /* @__PURE__ */ (0, G.jsx)(M, {
									icon: "lucide:zoom-out",
									width: 13,
									height: 13
								})
							}),
							/* @__PURE__ */ (0, G.jsx)("input", {
								type: "range",
								min: 2,
								max: 400,
								value: A,
								style: { "--range-progress": `${(A - 2) / 398 * 100}%` },
								onChange: (e) => {
									ie(!1), re(Number(e.target.value));
								},
								"aria-label": O("时间轴缩放"),
								"aria-valuetext": O("{value} 像素每秒", { value: Math.round(A) })
							}),
							/* @__PURE__ */ (0, G.jsx)("button", {
								type: "button",
								className: "video-editor-timeline-btn",
								onClick: () => Oe(1.4),
								"data-tooltip": O("放大"),
								children: /* @__PURE__ */ (0, G.jsx)(M, {
									icon: "lucide:zoom-in",
									width: 13,
									height: 13
								})
							}),
							/* @__PURE__ */ (0, G.jsx)("button", {
								type: "button",
								className: `video-editor-timeline-btn ${j ? "active" : ""}`,
								onClick: () => ie(!0),
								"data-tooltip": "适应窗口",
								"aria-pressed": j,
								children: /* @__PURE__ */ (0, G.jsx)(M, {
									icon: "lucide:move-horizontal",
									width: 13,
									height: 13
								})
							})
						]
					})
				]
			}),
			/* @__PURE__ */ (0, G.jsxs)("div", {
				className: `video-editor-timeline-body ${F ? "dragging" : ""}`,
				children: [/* @__PURE__ */ (0, G.jsxs)("div", {
					className: "video-editor-track-labels",
					children: [/* @__PURE__ */ (0, G.jsx)("div", { className: "video-editor-ruler-spacer" }), de.map((t) => {
						let n = e.findIndex((e) => e.id === t.id), r = We(t);
						return /* @__PURE__ */ (0, G.jsxs)("div", {
							className: [
								"video-editor-track-label",
								r ? "compact-text" : "",
								t.locked ? "is-locked" : "",
								t.hidden ? "is-hidden" : "",
								t.muted ? "is-muted" : ""
							].filter(Boolean).join(" "),
							style: { borderLeft: t.kind === "video" && !t.overlay ? `3px solid ${Ue(n)}` : void 0 },
							children: [
								/* @__PURE__ */ (0, G.jsx)("span", {
									className: "video-editor-track-icon",
									children: r ? /* @__PURE__ */ (0, G.jsx)(M, {
										icon: "lucide:type",
										width: 13,
										height: 13
									}) : Ve[t.kind] ?? "🎞"
								}),
								/* @__PURE__ */ (0, G.jsx)("span", {
									className: "video-editor-track-name",
									children: O(t.name)
								}),
								/* @__PURE__ */ (0, G.jsx)("button", {
									type: "button",
									className: `video-editor-track-flag is-mute ${t.muted ? "active" : ""}`,
									onClick: () => U(t.id, "muted"),
									"data-tooltip": t.muted ? O("取消静音") : O("静音"),
									children: "M"
								}),
								/* @__PURE__ */ (0, G.jsx)("button", {
									type: "button",
									className: `video-editor-track-flag is-lock ${t.locked ? "active" : ""}`,
									onClick: () => U(t.id, "locked"),
									"data-tooltip": t.locked ? O("解锁轨道") : O("锁定轨道"),
									children: /* @__PURE__ */ (0, G.jsx)(M, {
										icon: t.locked ? "lucide:lock" : "lucide:unlock",
										width: 10,
										height: 10
									})
								}),
								/* @__PURE__ */ (0, G.jsx)("button", {
									type: "button",
									className: `video-editor-track-flag is-visibility ${t.hidden ? "active" : ""}`,
									onClick: () => U(t.id, "hidden"),
									"data-tooltip": t.hidden ? O("显示轨道") : O("隐藏轨道"),
									children: /* @__PURE__ */ (0, G.jsx)(M, {
										icon: t.hidden ? "lucide:eye-off" : "lucide:eye",
										width: 10,
										height: 10
									})
								}),
								t.overlay || t.kind === "audio" ? /* @__PURE__ */ (0, G.jsx)("button", {
									type: "button",
									className: "video-editor-track-flag",
									disabled: t.locked,
									onClick: () => S(t.id, 1),
									"data-tooltip": O("上移一层"),
									children: /* @__PURE__ */ (0, G.jsx)(M, {
										icon: "lucide:chevron-up",
										width: 10,
										height: 10
									})
								}) : null
							]
						}, t.id);
					})]
				}), /* @__PURE__ */ (0, G.jsx)("div", {
					className: "video-editor-scroll",
					ref: k,
					children: /* @__PURE__ */ (0, G.jsxs)("div", {
						ref: ne,
						className: "video-editor-canvas",
						style: { width: be },
						onPointerDown: Ce,
						children: [
							/* @__PURE__ */ (0, G.jsx)(Ne, {
								duration: t,
								playhead: n,
								pixelsPerSecond: A,
								onScrub: Se
							}),
							de.map((e) => {
								let t = We(e);
								return /* @__PURE__ */ (0, G.jsxs)("div", {
									"data-track-id": e.id,
									className: [
										"video-editor-track-lane",
										t ? "compact-text" : "",
										e.locked ? "locked" : "",
										e.hidden ? "is-hidden" : "",
										e.muted ? "is-muted" : ""
									].filter(Boolean).join(" "),
									onDragOver: (t) => {
										e.kind === "video" && !e.locked && t.dataTransfer.types.includes(ze) && (t.preventDefault(), t.dataTransfer.dropEffect = "move");
									},
									onDrop: (t) => ke(e, t),
									children: [e.kind === "video" ? e.clips.map((t, n) => {
										let r = L.has(t.id), i = F?.clipId === t.id, o = b(t), s = t.transitionIn, c = !!s && s.kind !== "none" && s.duration > 0, u = !e.overlay && !e.locked && n > 0 && !F;
										return /* @__PURE__ */ (0, G.jsxs)(R.Fragment, { children: [/* @__PURE__ */ (0, G.jsxs)("div", {
											"data-clip-id": t.id,
											className: [
												"video-editor-clip",
												t.kind,
												r ? "selected" : "",
												i ? "dragging" : ""
											].filter(Boolean).join(" "),
											style: {
												left: t.timelineStart * A,
												width: Math.max(2, o * A),
												transform: i ? `translate(${F.offsetPx}px, ${F.offsetY}px)` : void 0
											},
											onPointerDown: (n) => {
												e.locked || De(t, e.id, n);
											},
											onContextMenu: (e) => {
												e.preventDefault(), e.stopPropagation(), r || l([t.id]), ue({
													clipId: t.id,
													x: e.clientX,
													y: e.clientY
												});
											},
											children: [
												/* @__PURE__ */ (0, G.jsx)("div", {
													className: "video-editor-clip-thumbs",
													children: qe(t, a(t), A).map((e, t) => e ? /* @__PURE__ */ (0, G.jsx)("img", {
														src: e,
														alt: "",
														draggable: !1
													}, t) : /* @__PURE__ */ (0, G.jsx)("span", { className: "video-editor-thumb-blank" }, t))
												}),
												c && /* @__PURE__ */ (0, G.jsx)("span", {
													className: `video-editor-clip-transition ${s.kind}`,
													style: { width: Math.max(4, s.duration * A) },
													"aria-hidden": "true"
												}),
												/* @__PURE__ */ (0, G.jsxs)("span", {
													className: "video-editor-clip-name",
													children: [
														t.kind === "text" && /* @__PURE__ */ (0, G.jsx)(M, {
															icon: "lucide:type",
															width: 10,
															height: 10
														}),
														t.kind === "image" && /* @__PURE__ */ (0, G.jsx)(M, {
															icon: "lucide:image",
															width: 10,
															height: 10
														}),
														t.fileName
													]
												}),
												/* @__PURE__ */ (0, G.jsxs)("span", {
													className: "video-editor-clip-hover",
													children: [o.toFixed(1), "s"]
												}),
												r && !e.locked && /* @__PURE__ */ (0, G.jsxs)(G.Fragment, { children: [/* @__PURE__ */ (0, G.jsx)("div", {
													className: "video-editor-trim-handle in",
													onPointerDown: (e) => Ee(t, "in", e),
													role: "slider",
													"aria-label": O("入点"),
													"aria-valuenow": t.sourceIn,
													"aria-valuemin": 0,
													"aria-valuemax": o,
													tabIndex: 0
												}), /* @__PURE__ */ (0, G.jsx)("div", {
													className: "video-editor-trim-handle out",
													onPointerDown: (e) => Ee(t, "out", e),
													role: "slider",
													"aria-label": O("出点"),
													"aria-valuenow": t.sourceOut,
													"aria-valuemin": 0,
													"aria-valuemax": o,
													tabIndex: 0
												})] })
											]
										}), u && /* @__PURE__ */ (0, G.jsx)("button", {
											type: "button",
											className: `video-editor-seam ${c ? "has-transition" : ""}`,
											style: { left: t.timelineStart * A },
											"aria-label": O(c ? "编辑转场：{name}" : "在这里添加转场：{name}", { name: t.fileName }),
											"data-tooltip": c ? `${O(Ie[s.kind])} ${s.duration.toFixed(1)}s` : O("添加转场"),
											onPointerDown: (e) => e.stopPropagation(),
											onClick: (e) => {
												e.stopPropagation(), v(t.id);
											},
											children: /* @__PURE__ */ (0, G.jsx)(M, {
												icon: c ? "lucide:blend" : "lucide:plus",
												width: 11,
												height: 11
											})
										})] }, t.id);
									}) : e.kind === "audio" ? e.clips.map((t) => /* @__PURE__ */ (0, G.jsxs)("div", {
										"data-clip-id": t.id,
										className: `video-editor-clip audio ${L.has(t.id) ? "selected" : ""}`,
										style: {
											left: t.timelineStart * A,
											width: Math.max(2, b(t) * A)
										},
										onPointerDown: (n) => {
											e.locked || (n.stopPropagation(), l([t.id]));
										},
										children: [/* @__PURE__ */ (0, G.jsx)(Fe, { peaks: a(t)?.waveform ?? [] }), /* @__PURE__ */ (0, G.jsx)("span", {
											className: "video-editor-clip-name",
											children: t.fileName
										})]
									}, t.id)) : /* @__PURE__ */ (0, G.jsx)("div", {
										className: "video-editor-track-placeholder",
										children: O("字幕轨二期开放")
									}), e.kind === "video" && xe !== null && F?.targetTrackId === e.id && /* @__PURE__ */ (0, G.jsx)("div", {
										className: "video-editor-drop-indicator",
										style: { left: xe }
									})]
								}, e.id);
							}),
							/* @__PURE__ */ (0, G.jsx)("div", {
								className: "video-editor-playhead",
								style: { left: n * A }
							}),
							se !== null && /* @__PURE__ */ (0, G.jsx)("div", {
								className: "video-editor-timeline-snap-indicator",
								style: { left: se * A }
							}),
							P && /* @__PURE__ */ (0, G.jsx)("div", {
								className: "video-editor-timeline-selection-box",
								style: P
							})
						]
					})
				})]
			}),
			le && /* @__PURE__ */ (0, G.jsxs)("div", {
				className: "video-editor-clip-menu",
				style: {
					left: le.x,
					top: le.y
				},
				onPointerDown: (e) => e.stopPropagation(),
				children: [
					/* @__PURE__ */ (0, G.jsx)("button", {
						type: "button",
						onClick: () => {
							h(), ue(null);
						},
						disabled: !ee,
						children: O("在播放头分割 · S")
					}),
					/* @__PURE__ */ (0, G.jsx)("button", {
						type: "button",
						onClick: () => {
							_(le.clipId), ue(null);
						},
						disabled: ye,
						children: O("复制片段 · Ctrl D")
					}),
					/* @__PURE__ */ (0, G.jsx)("button", {
						type: "button",
						className: "danger",
						onClick: () => {
							g(), ue(null);
						},
						disabled: !he,
						children: O("删除 · Del")
					})
				]
			})
		]
	});
}
var Ye = (0, R.memo)(Je), Xe = 48, Ze = 96, Qe = 240;
function $e(e, t) {
	let n = new Set(t), r = Object.entries(e).filter(([e]) => n.has(e));
	return r.length === Object.keys(e).length ? e : Object.fromEntries(r);
}
function K(e) {
	let t = C();
	return e.filePath && t ? t(e.filePath) : e.sourceUrl ?? "";
}
function et(e, t) {
	let [n, r] = (0, R.useState)({}), i = (0, R.useRef)(n);
	i.current = n;
	let [a, o] = (0, R.useState)(!1), s = (0, R.useRef)(t);
	s.current = t;
	let c = e.map(K).filter(Boolean);
	return (0, R.useEffect)(() => {
		let t = [...new Set(c)];
		if (r((e) => $e(e, t)), t.length === 0) {
			o(!1);
			return;
		}
		let n = !0;
		return o(!0), (async () => {
			for (let a of t) {
				if (!n) return;
				if (Object.prototype.hasOwnProperty.call(i.current, a)) continue;
				if (e.find((e) => K(e) === a)?.kind === "image") {
					r((e) => ({
						...e,
						[a]: {
							url: a,
							probe: null,
							thumbnails: [a]
						}
					}));
					continue;
				}
				let t = null;
				try {
					t = await F(a);
					let e = await me(t);
					if (!n) return;
					r((t) => ({
						...t,
						[a]: {
							url: a,
							probe: e,
							thumbnails: []
						}
					})), s.current?.(a, e);
					let i = await I(t, {
						count: Xe,
						height: Ze,
						duration: e.duration
					});
					if (!n) return;
					r((t) => ({
						...t,
						[a]: {
							...t[a],
							url: a,
							probe: e,
							thumbnails: i
						}
					}));
					let o = e.audioCodec ? await ge(t, {
						buckets: Qe,
						duration: e.duration
					}) : [];
					if (!n) return;
					r((t) => ({
						...t,
						[a]: {
							...t[a],
							url: a,
							probe: e,
							thumbnails: i,
							waveform: o
						}
					}));
				} catch (e) {
					if (!n) return;
					r((t) => ({
						...t,
						[a]: {
							url: a,
							probe: null,
							thumbnails: [],
							error: e instanceof Error ? e.message : String(e)
						}
					}));
				} finally {
					t?.dispose();
				}
			}
			n && o(!1);
		})(), () => {
			n = !1;
		};
	}, [c.join("|")]), {
		sources: n,
		getSource: (0, R.useCallback)((e) => n[K(e)], [n]),
		loading: a
	};
}
//#endregion
//#region src/components/videoEditor/VideoEditorPreview.tsx
function q(e) {
	if (!Number.isFinite(e) || e < 0) return "00:00.00";
	let t = Math.floor(e / 60), n = e - t * 60;
	return `${String(t).padStart(2, "0")}:${n.toFixed(2).padStart(5, "0")}`;
}
function J(e) {
	let t = e.trim().split(":").map(Number);
	return t.length < 1 || t.length > 3 || t.some((e) => !Number.isFinite(e) || e < 0) ? null : t.length === 3 ? t[0] * 3600 + t[1] * 60 + t[2] : t.length === 2 ? t[0] * 60 + t[1] : t[0];
}
function tt({ clip: e, playhead: t, playing: n, muted: r, volume: i, canvasDisplayScale: a }) {
	let o = (0, R.useRef)(null), [s, c] = (0, R.useState)(null), l = K(e), u = !!l && s === l, d = e.sourceIn + (t - e.timelineStart);
	if ((0, R.useEffect)(() => {
		let t = o.current;
		!t || e.kind !== "video" || Math.abs(t.currentTime - d) > .05 && (t.currentTime = Math.max(0, d));
	}, [
		e.kind,
		d,
		l
	]), (0, R.useEffect)(() => {
		let t = o.current;
		!t || e.kind !== "video" || u || (n ? t.play().catch(() => {}) : t.pause());
	}, [
		e.kind,
		u,
		n,
		l
	]), (0, R.useEffect)(() => {
		o.current && (o.current.volume = Math.max(0, Math.min(1, i)));
	}, [i]), e.kind === "text") {
		let t = {
			...f,
			...e.textStyle
		};
		return /* @__PURE__ */ (0, G.jsx)("div", {
			className: "video-editor-overlay-text",
			style: {
				color: t.color,
				fontFamily: t.fontFamily,
				fontSize: `${Math.max(8, t.fontSize * a)}px`,
				fontWeight: t.fontWeight,
				textAlign: t.align
			},
			children: t.content || f.content
		});
	}
	return !l || u ? /* @__PURE__ */ (0, G.jsx)("div", {
		className: "video-editor-stage-empty",
		children: "素材无法预览"
	}) : e.kind === "image" ? /* @__PURE__ */ (0, G.jsx)("img", {
		src: l,
		alt: "",
		draggable: !1,
		className: "video-editor-overlay-img",
		onError: () => c(l)
	}) : /* @__PURE__ */ (0, G.jsx)("video", {
		ref: o,
		src: l,
		className: "video-editor-overlay-img",
		preload: "auto",
		muted: r,
		playsInline: !0,
		onError: () => c(l)
	});
}
function nt(e, t, n, r) {
	let i = N(e && e.width > 0 && e.height > 0 ? e : t, t, n);
	return {
		left: `${i.x / Math.max(1, t.width) * 100}%`,
		top: `${i.y / Math.max(1, t.height) * 100}%`,
		width: `${i.width / Math.max(1, t.width) * 100}%`,
		height: `${i.height / Math.max(1, t.height) * 100}%`,
		opacity: r,
		transform: `rotate(${n.rotation}deg)`
	};
}
function rt({ clip: e, sourceTime: t, playing: n, style: r }) {
	let i = (0, R.useRef)(null), a = K(e), o = Math.max(0, t);
	return (0, R.useEffect)(() => {
		let e = i.current;
		!e || e.readyState === 0 || Math.abs(e.currentTime - o) > .08 && (e.currentTime = o);
	}, [o]), (0, R.useEffect)(() => {
		let e = i.current;
		e && (n ? e.play().catch(() => {}) : e.pause());
	}, [n, a]), !a || e.kind === "text" ? null : e.kind === "image" ? /* @__PURE__ */ (0, G.jsx)("img", {
		src: a,
		alt: "",
		draggable: !1,
		className: "video-editor-video underlay",
		style: r
	}) : /* @__PURE__ */ (0, G.jsx)("video", {
		ref: i,
		src: a,
		className: "video-editor-video underlay",
		style: r,
		preload: "auto",
		muted: !0,
		playsInline: !0,
		onLoadedMetadata: () => {
			let e = i.current;
			e && (e.currentTime = o, n && e.play().catch(() => {}));
		}
	});
}
function it({ clip: e, playhead: t, playing: n, muted: r, volume: i }) {
	let a = (0, R.useRef)(null), o = K(e), s = e.sourceIn + (t - e.timelineStart);
	return (0, R.useEffect)(() => {
		let e = a.current;
		e && Math.abs(e.currentTime - s) > .05 && (e.currentTime = Math.max(0, s));
	}, [s, o]), (0, R.useEffect)(() => {
		let e = a.current;
		e && (n ? e.play().catch(() => {}) : e.pause());
	}, [n, o]), (0, R.useEffect)(() => {
		a.current && (a.current.volume = Math.max(0, Math.min(1, i)));
	}, [i]), o ? /* @__PURE__ */ (0, G.jsx)("audio", {
		ref: a,
		src: o,
		preload: "auto",
		muted: r
	}) : null;
}
function at({ clip: e, clipUrl: t, playhead: n, timelineDuration: i, tracks: a, selectedClipIds: o, canvasSize: s, sourceSize: c, onPlayheadChange: l, onSelectClips: d, onBeginInteraction: f, onEndInteraction: p, onTransformChange: h }) {
	let g = r(), v = (0, R.useRef)(null), C = (0, R.useRef)(null), w = (0, R.useRef)(null), ee = (0, R.useRef)(null), [T, E] = (0, R.useState)(!1), [D, te] = (0, R.useState)("fit"), [O, k] = (0, R.useState)(!1), [ne, A] = (0, R.useState)(!1), [re, j] = (0, R.useState)(() => q(n)), [ie, ae] = (0, R.useState)(1), [oe, se] = (0, R.useState)({
		width: 0,
		height: 0
	}), N = (0, R.useRef)(!1), [P, ce] = (0, R.useState)(null), [F, I] = (0, R.useState)({
		x: !1,
		y: !1
	}), le = e ? e.timelineStart + b(e) : 0, ue = e ? e.sourceIn + (n - e.timelineStart) : 0, L = (0, R.useMemo)(() => S(a), [a]), de = L?.hidden === !0, fe = L?.muted === !0 || de, pe = (L?.volume ?? 1) * (e?.volume ?? 1);
	(0, R.useEffect)(() => {
		let e = () => k(document.fullscreenElement === v.current);
		return document.addEventListener("fullscreenchange", e), () => document.removeEventListener("fullscreenchange", e);
	}, []);
	let me = (0, R.useCallback)(() => {
		let e = J(re);
		e === null ? j(q(n)) : l(Math.min(i, e)), A(!1);
	}, [
		l,
		n,
		re,
		i
	]), he = (0, R.useCallback)(() => {
		let e = v.current;
		if (e) {
			if (document.fullscreenElement) {
				document.exitFullscreen().catch(() => {});
				return;
			}
			e.requestFullscreen().catch(() => {});
		}
	}, []);
	(0, R.useEffect)(() => {
		let e = w.current;
		if (!e) return;
		let t = () => {
			let t = window.getComputedStyle(e), n = (Number.parseFloat(t.paddingLeft) || 0) + (Number.parseFloat(t.paddingRight) || 0), r = (Number.parseFloat(t.paddingTop) || 0) + (Number.parseFloat(t.paddingBottom) || 0);
			se({
				width: Math.max(0, e.clientWidth - n),
				height: Math.max(0, e.clientHeight - r)
			});
		};
		t();
		let n = new ResizeObserver(t);
		return n.observe(e), () => n.disconnect();
	}, []), (0, R.useEffect)(() => {
		let e = ee.current;
		if (!e || s.width <= 0) return;
		let t = () => ae(e.clientWidth / s.width);
		t();
		let n = new ResizeObserver(t);
		return n.observe(e), () => n.disconnect();
	}, [s.width]);
	let ge = (0, R.useRef)(0);
	(0, R.useEffect)(() => {
		ge.current = Math.max(0, ue);
	}, [ue]), (0, R.useEffect)(() => {
		let t = C.current;
		!t || !e || e.kind !== "video" || N.current || t.readyState !== 0 && Math.abs(t.currentTime - ue) > .05 && (t.currentTime = ue);
	}, [e, ue]);
	let _e = (0, R.useCallback)(() => {
		let e = C.current;
		if (!e) return;
		let t = ge.current;
		Math.abs(e.currentTime - t) > .05 && (e.currentTime = t), T && e.paused && e.play().catch(() => {});
	}, [T]), ve = (0, R.useRef)(n);
	(0, R.useEffect)(() => {
		ve.current = n;
	}, [n]);
	let ye = (0, R.useCallback)((e) => {
		if (e < le - .001) {
			l(e);
			return;
		}
		if (le >= i - .001) {
			C.current?.pause(), E(!1), l(i);
			return;
		}
		l(le + .001);
	}, [
		le,
		l,
		i
	]);
	(0, R.useEffect)(() => {
		if (!T || e?.kind !== "image") return;
		let t = setInterval(() => ye(ve.current + .1), 100);
		return () => clearInterval(t);
	}, [
		ye,
		e?.kind,
		T
	]);
	let be = (0, R.useCallback)(() => {
		let t = C.current;
		!t || !e || (N.current = !0, ye(e.timelineStart + (t.currentTime - e.sourceIn)), N.current = !1);
	}, [ye, e]), xe = (0, R.useCallback)(() => {
		let t = C.current;
		if (T) {
			t?.pause(), E(!1);
			return;
		}
		n >= i - .01 && l(0), E(!0), e?.kind === "video" && t?.play().catch(() => E(!1));
	}, [
		e?.kind,
		l,
		n,
		T,
		i
	]), z = (0, R.useCallback)(() => {
		C.current?.pause(), E(!1);
	}, []);
	(0, R.useEffect)(() => {
		let e = (e) => {
			e.metaKey || e.ctrlKey || e.altKey || e.repeat || e.target?.closest("input, textarea, select, button, [contenteditable=\"true\"]") || (e.code === "Space" ? (e.preventDefault(), xe()) : e.key === "k" || e.key === "K" ? (e.preventDefault(), z()) : e.key === "l" || e.key === "L" ? (e.preventDefault(), T || xe()) : (e.key === "j" || e.key === "J") && (e.preventDefault(), z(), l(Math.max(0, n - 1))));
		};
		return window.addEventListener("keydown", e), () => window.removeEventListener("keydown", e);
	}, [
		l,
		z,
		n,
		T,
		xe
	]), (0, R.useEffect)(() => {
		let t = C.current;
		!t || e?.kind !== "video" || (T && t.paused && t.play().catch(() => {}), !T && !t.paused && t.pause());
	}, [
		e?.kind,
		t,
		T
	]), (0, R.useEffect)(() => {
		C.current && (C.current.volume = Math.max(0, Math.min(1, pe)));
	}, [pe]);
	let B = (0, R.useCallback)((e) => {
		E(!1), C.current?.pause(), l(Math.min(i, Math.max(0, n + e / 30)));
	}, [
		l,
		n,
		i
	]), Se = (0, R.useMemo)(() => m(a).filter((e) => e.kind === "video"), [a]), Ce = (0, R.useMemo)(() => {
		let e = [];
		for (let t of Se) if (!t.hidden) for (let r of _(t, n)) e.push({
			clip: r,
			track: t
		});
		return e;
	}, [Se, n]), V = (0, R.useMemo)(() => {
		let e = [];
		for (let t of a) if (!(t.kind !== "audio" || t.hidden)) for (let r of _(t, n)) e.push({
			clip: r,
			track: t
		});
		return e;
	}, [n, a]), we = (0, R.useCallback)((e, t, n, r) => {
		if (n.stopPropagation(), n.preventDefault(), n.button !== 0) return;
		n.currentTarget.setPointerCapture(n.pointerId);
		let i = ee.current;
		if (!i) return;
		let a = i.getBoundingClientRect();
		f(), I({
			x: !1,
			y: !1
		}), ce({
			clipId: e.id,
			mode: t,
			handle: r,
			startClientX: n.clientX,
			startClientY: n.clientY,
			startTransform: e.transform ?? x,
			frameRect: a
		}), d([e.id]);
	}, [f, d]);
	(0, R.useEffect)(() => {
		if (!P) return;
		let e = (e) => {
			let t = e.clientX - P.startClientX, n = e.clientY - P.startClientY, { width: r, height: i } = P.frameRect;
			if (!(r <= 0 || i <= 0)) if (P.mode === "move") {
				let e = t / r, a = n / i, o = Math.max(0, Math.min(1, P.startTransform.x + e)), s = Math.max(0, Math.min(1, P.startTransform.y + a)), c = Math.abs(o - .5) <= 6 / r, l = Math.abs(s - .5) <= 6 / i;
				I({
					x: c,
					y: l
				}), h(P.clipId, {
					x: c ? .5 : o,
					y: l ? .5 : s
				});
			} else {
				I({
					x: !1,
					y: !1
				});
				let t = P.frameRect.left + P.startTransform.x * r, n = P.frameRect.top + P.startTransform.y * i;
				if (P.mode === "scale" && P.handle) {
					let r = P.startClientX - t, i = P.startClientY - n, a = Math.sqrt(r * r + i * i), o = Math.sqrt((e.clientX - t) ** 2 + (e.clientY - n) ** 2);
					if (a > 4) {
						let e = o / a;
						h(P.clipId, { scale: Math.max(.05, Math.min(5, P.startTransform.scale * e)) });
					}
					return;
				}
				let a = Math.atan2(P.startClientY - n, P.startClientX - t), o = (Math.atan2(e.clientY - n, e.clientX - t) - a) * 180 / Math.PI, s = ((P.startTransform.rotation + o + 180) % 360 + 360) % 360 - 180, c = [
					-180,
					-90,
					0,
					90,
					180
				].find((e) => Math.abs(s - e) <= 3);
				h(P.clipId, { rotation: c ?? s });
			}
		}, t = () => {
			ce(null), I({
				x: !1,
				y: !1
			}), p();
		};
		return document.addEventListener("pointermove", e), document.addEventListener("pointerup", t), document.addEventListener("pointercancel", t), () => {
			document.removeEventListener("pointermove", e), document.removeEventListener("pointerup", t), document.removeEventListener("pointercancel", t);
		};
	}, [
		P,
		p,
		h
	]);
	let Te = (0, R.useCallback)((e) => {
		let t = e.currentTarget, n = t.getBoundingClientRect(), r = (e) => {
			l(Math.max(0, Math.min(1, (e - n.left) / n.width)) * i);
		};
		r(e.clientX), t.setPointerCapture(e.pointerId);
		let a = (e) => r(e.clientX), o = (e) => {
			t.releasePointerCapture(e.pointerId), t.removeEventListener("pointermove", a), t.removeEventListener("pointerup", o);
		};
		t.addEventListener("pointermove", a), t.addEventListener("pointerup", o);
	}, [l, i]), H = i > 0 ? n / i * 100 : 0, Ee = (0, R.useMemo)(() => s.width <= 0 || s.height <= 0 ? null : `${s.width}×${s.height}`, [s]), De = s.width > 0 && s.height > 0 ? `${s.width} / ${s.height}` : "16 / 9", U = (0, R.useMemo)(() => {
		if (D !== "fit") return {
			aspectRatio: De,
			width: `${s.width * (D / 100)}px`,
			height: `${s.height * (D / 100)}px`
		};
		if (s.width <= 0 || s.height <= 0 || oe.width <= 0 || oe.height <= 0) return { aspectRatio: De };
		let e = Math.min(oe.width / s.width, oe.height / s.height);
		return {
			aspectRatio: De,
			width: `${s.width * e}px`,
			height: `${s.height * e}px`
		};
	}, [
		De,
		s.height,
		s.width,
		D,
		oe
	]), Oe = e ? y(e, n - e.timelineStart) : 1, W = (0, R.useMemo)(() => {
		if (!e || de || Oe >= 1 || e.transitionIn?.kind !== "dissolve") return null;
		let t = L?.clips.indexOf(e) ?? -1;
		if (t <= 0) return null;
		let n = L.clips[t - 1];
		return Math.abs(u(n) - e.timelineStart) > .001 ? null : n;
	}, [
		e,
		L,
		de,
		Oe
	]), ke = (0, R.useMemo)(() => nt(c, s, e?.transform ?? x, de ? 0 : (e?.transform ?? x).opacity * Oe), [
		s,
		e?.transform,
		de,
		c,
		Oe
	]), Ae = (0, R.useMemo)(() => ({
		...ke,
		opacity: 1
	}), [ke]), je = (0, R.useMemo)(() => nt(null, s, W?.transform ?? x, (W?.transform ?? x).opacity), [s, W?.transform]), Me = !!e && o.includes(e.id), Ne = L?.locked === !0;
	return /* @__PURE__ */ (0, G.jsxs)("section", {
		ref: v,
		className: "video-editor-preview",
		children: [
			/* @__PURE__ */ (0, G.jsx)("div", {
				ref: w,
				className: `video-editor-stage ${T ? "playing" : ""}`,
				children: /* @__PURE__ */ (0, G.jsxs)("div", {
					ref: ee,
					className: `video-editor-canvas-frame ${D === "fit" ? "fit" : "zoomed"}`,
					style: U,
					"aria-label": Ee ? `${g("输出画布")} ${Ee}` : g("输出画布"),
					children: [
						W && e && /* @__PURE__ */ (0, G.jsx)(rt, {
							clip: W,
							sourceTime: W.sourceOut + (n - e.timelineStart),
							playing: T,
							style: je
						}, W.id),
						!e || !t ? /* @__PURE__ */ (0, G.jsx)("div", {
							className: "video-editor-stage-empty",
							children: g("无可预览的素材")
						}) : e.kind === "image" ? /* @__PURE__ */ (0, G.jsx)("img", {
							src: t,
							className: `video-editor-video ${de ? "track-hidden" : ""}`,
							style: ke,
							alt: "",
							draggable: !1
						}) : /* @__PURE__ */ (0, G.jsx)("video", {
							ref: C,
							src: t,
							className: `video-editor-video ${de ? "track-hidden" : ""}`,
							style: ke,
							onTimeUpdate: be,
							onLoadedMetadata: _e,
							onCanPlay: _e,
							onPause: () => {
								T || E(!1);
							},
							preload: "auto",
							muted: fe
						}),
						de && /* @__PURE__ */ (0, G.jsx)("div", {
							className: "video-editor-stage-empty",
							children: g("主视频轨已隐藏")
						}),
						e && t && !de && /* @__PURE__ */ (0, G.jsx)("div", {
							className: [
								"video-editor-main-selection",
								Me ? "selected" : "",
								Ne ? "locked" : ""
							].filter(Boolean).join(" "),
							style: Ae,
							"aria-label": g("画面内调整 {name}", { name: e.fileName }),
							onPointerDown: Ne ? (t) => {
								t.stopPropagation(), d([e.id]);
							} : (t) => we(e, "move", t),
							children: Me && !Ne && /* @__PURE__ */ (0, G.jsxs)(G.Fragment, { children: [
								[
									"nw",
									"ne",
									"sw",
									"se"
								].map((t) => /* @__PURE__ */ (0, G.jsx)("button", {
									type: "button",
									className: `video-editor-overlay-handle ${t}`,
									"aria-label": g("等比缩放"),
									onPointerDown: (n) => we(e, "scale", n, t)
								}, t)),
								/* @__PURE__ */ (0, G.jsx)("span", {
									className: "video-editor-rotation-stem",
									"aria-hidden": "true"
								}),
								/* @__PURE__ */ (0, G.jsx)("button", {
									type: "button",
									className: "video-editor-rotation-handle",
									"aria-label": g("旋转"),
									onPointerDown: (t) => we(e, "rotate", t),
									children: /* @__PURE__ */ (0, G.jsx)(M, {
										icon: "lucide:rotate-cw",
										width: 11,
										height: 11
									})
								})
							] })
						}),
						Ce.map(({ clip: e, track: t }) => {
							let r = e.transform ?? x, i = o.includes(e.id), a = t.locked === !0, s = e.kind === "text";
							return /* @__PURE__ */ (0, G.jsxs)("div", {
								className: [
									"video-editor-overlay",
									s ? "text" : "",
									i ? "selected" : "",
									a ? "locked" : ""
								].filter(Boolean).join(" "),
								style: s ? {
									left: `${r.x * 100}%`,
									top: `${r.y * 100}%`,
									transform: `translate(-50%, -50%) rotate(${r.rotation}deg) scale(${r.scale})`,
									opacity: r.opacity
								} : {
									left: `${r.x * 100}%`,
									top: `${r.y * 100}%`,
									width: `${r.scale * 100}%`,
									height: `${r.scale * 100}%`,
									transform: `translate(-50%, -50%) rotate(${r.rotation}deg)`,
									opacity: r.opacity
								},
								onPointerDown: a ? (t) => {
									t.stopPropagation(), d([e.id]);
								} : (t) => we(e, "move", t),
								children: [/* @__PURE__ */ (0, G.jsx)(tt, {
									clip: e,
									playhead: n,
									playing: T,
									muted: t.muted === !0,
									volume: (t.volume ?? 1) * (e.volume ?? 1),
									canvasDisplayScale: ie
								}), i && !a && /* @__PURE__ */ (0, G.jsxs)(G.Fragment, { children: [
									[
										"nw",
										"ne",
										"sw",
										"se"
									].map((t) => /* @__PURE__ */ (0, G.jsx)("button", {
										type: "button",
										className: `video-editor-overlay-handle ${t}`,
										"aria-label": g("等比缩放"),
										onPointerDown: (n) => we(e, "scale", n, t)
									}, t)),
									/* @__PURE__ */ (0, G.jsx)("span", {
										className: "video-editor-rotation-stem",
										"aria-hidden": "true"
									}),
									/* @__PURE__ */ (0, G.jsx)("button", {
										type: "button",
										className: "video-editor-rotation-handle",
										"aria-label": g("旋转"),
										onPointerDown: (t) => we(e, "rotate", t),
										children: /* @__PURE__ */ (0, G.jsx)(M, {
											icon: "lucide:rotate-cw",
											width: 11,
											height: 11
										})
									})
								] })]
							}, e.id);
						}),
						F.x && /* @__PURE__ */ (0, G.jsx)("span", {
							className: "video-editor-snap-guide vertical",
							"aria-hidden": "true"
						}),
						F.y && /* @__PURE__ */ (0, G.jsx)("span", {
							className: "video-editor-snap-guide horizontal",
							"aria-hidden": "true"
						}),
						V.map(({ clip: e, track: t }) => /* @__PURE__ */ (0, G.jsx)(it, {
							clip: e,
							playhead: n,
							playing: T,
							muted: t.muted === !0,
							volume: (t.volume ?? 1) * (e.volume ?? 1)
						}, `${t.id}:${e.id}`)),
						/* @__PURE__ */ (0, G.jsx)("div", {
							className: "video-editor-stage-passthrough",
							onPointerDown: (e) => {
								e.target === e.currentTarget && d([]);
							}
						})
					]
				})
			}),
			Ee && /* @__PURE__ */ (0, G.jsxs)("div", {
				className: "video-editor-stage-info",
				children: [
					/* @__PURE__ */ (0, G.jsx)("span", {
						className: "video-editor-canvas-size-label",
						children: g("输出画布")
					}),
					/* @__PURE__ */ (0, G.jsx)("span", { children: Ee }),
					Ce.length > 0 && /* @__PURE__ */ (0, G.jsxs)("span", {
						className: "dim",
						children: ["· ", g("{count} 个叠加层", { count: Ce.length })]
					}),
					/* @__PURE__ */ (0, G.jsxs)("span", {
						className: "dim",
						children: ["· ", D === "fit" ? g("适应窗口") : `${D}%`]
					})
				]
			}),
			/* @__PURE__ */ (0, G.jsxs)("div", {
				className: "video-editor-progress-bar",
				onPointerDown: Te,
				children: [/* @__PURE__ */ (0, G.jsx)("div", {
					className: "video-editor-progress-fill",
					style: { width: `${H}%` }
				}), /* @__PURE__ */ (0, G.jsx)("div", {
					className: "video-editor-progress-thumb",
					style: { left: `${H}%` }
				})]
			}),
			/* @__PURE__ */ (0, G.jsxs)("div", {
				className: "video-editor-transport",
				children: [
					/* @__PURE__ */ (0, G.jsxs)("div", {
						className: "video-editor-transport-time",
						children: [
							ne ? /* @__PURE__ */ (0, G.jsx)("input", {
								autoFocus: !0,
								className: "video-editor-timecode-input",
								value: re,
								"aria-label": g("当前时间码"),
								onChange: (e) => j(e.target.value),
								onBlur: me,
								onKeyDown: (e) => {
									e.key === "Enter" && e.currentTarget.blur(), e.key === "Escape" && (j(q(n)), A(!1));
								}
							}) : /* @__PURE__ */ (0, G.jsx)("button", {
								type: "button",
								className: "video-editor-timecode-edit",
								"aria-label": g("编辑当前时间码"),
								onClick: () => {
									j(q(n)), A(!0);
								},
								children: q(n)
							}),
							/* @__PURE__ */ (0, G.jsx)("span", {
								className: "video-editor-timecode-separator",
								children: "/"
							}),
							/* @__PURE__ */ (0, G.jsx)("span", {
								className: "video-editor-timecode-total",
								children: q(i)
							})
						]
					}),
					/* @__PURE__ */ (0, G.jsxs)("div", {
						className: "video-editor-transport-playback",
						children: [
							/* @__PURE__ */ (0, G.jsx)("button", {
								type: "button",
								className: "video-editor-transport-btn",
								onClick: () => B(-1),
								"aria-label": g("上一帧"),
								children: /* @__PURE__ */ (0, G.jsx)(M, {
									icon: "lucide:chevron-first",
									width: 16,
									height: 16
								})
							}),
							/* @__PURE__ */ (0, G.jsx)("button", {
								type: "button",
								className: "video-editor-transport-btn primary",
								onClick: xe,
								"aria-label": g(T ? "暂停" : "播放"),
								"aria-keyshortcuts": "Space",
								"data-tooltip": g(T ? "暂停 Space" : "播放 Space"),
								children: /* @__PURE__ */ (0, G.jsx)(M, {
									icon: T ? "lucide:pause" : "lucide:play",
									width: 16,
									height: 16
								})
							}),
							/* @__PURE__ */ (0, G.jsx)("button", {
								type: "button",
								className: "video-editor-transport-btn",
								onClick: () => B(1),
								"aria-label": g("下一帧"),
								children: /* @__PURE__ */ (0, G.jsx)(M, {
									icon: "lucide:chevron-last",
									width: 16,
									height: 16
								})
							}),
							/* @__PURE__ */ (0, G.jsx)("span", {
								className: "video-editor-shortcut-hint",
								"aria-hidden": "true",
								children: /* @__PURE__ */ (0, G.jsx)("kbd", { children: "Space" })
							})
						]
					}),
					/* @__PURE__ */ (0, G.jsxs)("div", {
						className: "video-editor-transport-view",
						children: [
							/* @__PURE__ */ (0, G.jsxs)("label", {
								className: "video-editor-preview-zoom",
								children: [/* @__PURE__ */ (0, G.jsx)(M, {
									icon: "lucide:search",
									width: 13,
									height: 13
								}), /* @__PURE__ */ (0, G.jsxs)("select", {
									value: D,
									"aria-label": g("预览缩放"),
									onChange: (e) => {
										let t = e.target.value;
										te(t === "fit" ? "fit" : Number(t));
									},
									children: [
										/* @__PURE__ */ (0, G.jsx)("option", {
											value: "fit",
											children: g("适应")
										}),
										/* @__PURE__ */ (0, G.jsx)("option", {
											value: "25",
											children: "25%"
										}),
										/* @__PURE__ */ (0, G.jsx)("option", {
											value: "50",
											children: "50%"
										}),
										/* @__PURE__ */ (0, G.jsx)("option", {
											value: "100",
											children: "100%"
										})
									]
								})]
							}),
							/* @__PURE__ */ (0, G.jsx)("button", {
								type: "button",
								className: "video-editor-transport-btn",
								"aria-label": g(O ? "退出全屏" : "全屏预览"),
								onClick: he,
								children: /* @__PURE__ */ (0, G.jsx)(M, {
									icon: O ? "lucide:minimize-2" : "lucide:maximize-2",
									width: 16,
									height: 16
								})
							}),
							/* @__PURE__ */ (0, G.jsxs)("details", {
								className: "video-editor-shortcuts",
								children: [/* @__PURE__ */ (0, G.jsx)("summary", {
									"aria-label": g("查看快捷键"),
									"data-tooltip": g("快捷键"),
									children: /* @__PURE__ */ (0, G.jsx)(M, {
										icon: "lucide:keyboard",
										width: 16,
										height: 16
									})
								}), /* @__PURE__ */ (0, G.jsxs)("div", {
									className: "video-editor-shortcuts-popover",
									children: [
										/* @__PURE__ */ (0, G.jsx)("strong", { children: g("快捷键") }),
										/* @__PURE__ */ (0, G.jsxs)("span", { children: [/* @__PURE__ */ (0, G.jsx)("em", { children: g("播放 / 暂停") }), /* @__PURE__ */ (0, G.jsx)("kbd", { children: "Space" })] }),
										/* @__PURE__ */ (0, G.jsxs)("span", { children: [/* @__PURE__ */ (0, G.jsx)("em", { children: g("后退 1 秒 / 暂停 / 播放") }), /* @__PURE__ */ (0, G.jsx)("kbd", { children: "J K L" })] }),
										/* @__PURE__ */ (0, G.jsxs)("span", { children: [/* @__PURE__ */ (0, G.jsx)("em", { children: g("逐帧 / 跳转 1 秒") }), /* @__PURE__ */ (0, G.jsx)("kbd", { children: "← → / Shift" })] }),
										/* @__PURE__ */ (0, G.jsxs)("span", { children: [/* @__PURE__ */ (0, G.jsx)("em", { children: g("分割 / 复制 / 删除") }), /* @__PURE__ */ (0, G.jsx)("kbd", { children: "S / ⌘D / Del" })] }),
										/* @__PURE__ */ (0, G.jsxs)("span", { children: [/* @__PURE__ */ (0, G.jsx)("em", { children: g("撤销 / 重做") }), /* @__PURE__ */ (0, G.jsx)("kbd", { children: "⌘Z / ⇧⌘Z" })] })
									]
								})]
							})
						]
					})
				]
			})
		]
	});
}
var ot = (0, R.memo)(at);
//#endregion
//#region src/components/videoEditor/VideoEditorMediaPanel.tsx
function Y({ clips: e, getSource: t, selectedClipId: n, libraryAssets: i, projectImages: a, addingMedia: o, uploadingSticker: s, onSelectClip: c, onAddLocal: l, onAddLibraryAsset: u, onAddCanvasImage: d, onUploadSticker: f }) {
	let p = r(), [m, h] = (0, R.useState)("closed"), [g, _] = (0, R.useState)(""), [v, y] = (0, R.useState)("all"), [x, S] = (0, R.useState)(""), C = (0, R.useRef)(null), w = (0, R.useMemo)(() => {
		let e = g.trim().toLocaleLowerCase();
		return e ? i.filter((t) => t.name.toLocaleLowerCase().includes(e)) : i;
	}, [i, g]), ee = (0, R.useMemo)(() => {
		let e = g.trim().toLocaleLowerCase();
		return e ? a.filter((t) => t.label.toLocaleLowerCase().includes(e)) : a;
	}, [a, g]);
	(0, R.useEffect)(() => {
		if (m === "closed") return;
		let e = (e) => {
			C.current?.contains(e.target) || h("closed");
		}, t = (e) => {
			e.key === "Escape" && h("closed");
		};
		return document.addEventListener("pointerdown", e), document.addEventListener("keydown", t), () => {
			document.removeEventListener("pointerdown", e), document.removeEventListener("keydown", t);
		};
	}, [m]);
	let T = e.filter((e) => {
		let n = t(e);
		return e.kind === "video" && n?.probe && !n.probe.decodable;
	}), E = e.filter((e) => t(e)?.error), D = (0, R.useMemo)(() => {
		let t = x.trim().toLocaleLowerCase();
		return e.filter((e) => (v === "all" || e.kind === v) && (!t || e.fileName.toLocaleLowerCase().includes(t)));
	}, [
		e,
		v,
		x
	]), te = (0, R.useMemo)(() => {
		let e = x.trim().toLocaleLowerCase();
		return e ? a.filter((t) => t.label.toLocaleLowerCase().includes(e)) : a;
	}, [x, a]);
	return /* @__PURE__ */ (0, G.jsxs)("aside", {
		className: "video-editor-media",
		children: [
			/* @__PURE__ */ (0, G.jsxs)("div", {
				className: "video-editor-panel-head video-editor-media-head",
				children: [/* @__PURE__ */ (0, G.jsx)("span", { children: p("素材 · {count}", { count: e.length }) }), /* @__PURE__ */ (0, G.jsxs)("div", {
					ref: C,
					className: "video-editor-media-add-wrap",
					children: [/* @__PURE__ */ (0, G.jsx)("button", {
						type: "button",
						className: "video-editor-media-add",
						"aria-label": p(o ? "正在添加素材" : "添加素材"),
						"aria-expanded": m !== "closed",
						disabled: o,
						onClick: () => {
							_(""), h((e) => e === "closed" ? "root" : "closed");
						},
						children: /* @__PURE__ */ (0, G.jsx)(M, {
							icon: o ? "lucide:loader-circle" : "lucide:plus",
							width: 15,
							height: 15
						})
					}), m !== "closed" && /* @__PURE__ */ (0, G.jsx)("div", {
						className: "video-editor-media-add-menu",
						children: m === "root" ? /* @__PURE__ */ (0, G.jsxs)("div", {
							className: "video-editor-media-add-sources",
							children: [
								/* @__PURE__ */ (0, G.jsxs)("button", {
									type: "button",
									onClick: () => h("library"),
									children: [
										/* @__PURE__ */ (0, G.jsx)(M, {
											icon: "lucide:library",
											width: 16,
											height: 16
										}),
										/* @__PURE__ */ (0, G.jsxs)("span", { children: [/* @__PURE__ */ (0, G.jsx)("strong", { children: p("素材库") }), /* @__PURE__ */ (0, G.jsx)("em", { children: p("{count} 个可用素材", { count: i.length }) })] }),
										/* @__PURE__ */ (0, G.jsx)(M, {
											icon: "lucide:chevron-right",
											width: 14,
											height: 14
										})
									]
								}),
								/* @__PURE__ */ (0, G.jsxs)("button", {
									type: "button",
									disabled: o,
									onClick: () => {
										l(), h("closed");
									},
									children: [/* @__PURE__ */ (0, G.jsx)(M, {
										icon: o ? "lucide:loader-circle" : "lucide:hard-drive-upload",
										width: 16,
										height: 16
									}), /* @__PURE__ */ (0, G.jsxs)("span", { children: [/* @__PURE__ */ (0, G.jsx)("strong", { children: p(o ? "正在导入…" : "本机文件") }), /* @__PURE__ */ (0, G.jsx)("em", { children: p("视频或图片") })] })]
								}),
								/* @__PURE__ */ (0, G.jsxs)("button", {
									type: "button",
									onClick: () => h("canvas"),
									children: [
										/* @__PURE__ */ (0, G.jsx)(M, {
											icon: "lucide:workflow",
											width: 16,
											height: 16
										}),
										/* @__PURE__ */ (0, G.jsxs)("span", { children: [/* @__PURE__ */ (0, G.jsx)("strong", { children: p("画布图片节点") }), /* @__PURE__ */ (0, G.jsx)("em", { children: p("{count} 张图片", { count: a.length }) })] }),
										/* @__PURE__ */ (0, G.jsx)(M, {
											icon: "lucide:chevron-right",
											width: 14,
											height: 14
										})
									]
								})
							]
						}) : /* @__PURE__ */ (0, G.jsxs)(G.Fragment, { children: [
							/* @__PURE__ */ (0, G.jsxs)("div", {
								className: "video-editor-media-picker-head",
								children: [/* @__PURE__ */ (0, G.jsx)("button", {
									type: "button",
									onClick: () => {
										_(""), h("root");
									},
									"aria-label": p("返回"),
									children: /* @__PURE__ */ (0, G.jsx)(M, {
										icon: "lucide:arrow-left",
										width: 14,
										height: 14
									})
								}), /* @__PURE__ */ (0, G.jsx)("strong", { children: p(m === "library" ? "素材库" : "画布图片节点") })]
							}),
							/* @__PURE__ */ (0, G.jsxs)("label", {
								className: "video-editor-media-search",
								children: [/* @__PURE__ */ (0, G.jsx)(M, {
									icon: "lucide:search",
									width: 13,
									height: 13
								}), /* @__PURE__ */ (0, G.jsx)("input", {
									autoFocus: !0,
									value: g,
									placeholder: p("搜索素材"),
									onChange: (e) => _(e.target.value)
								})]
							}),
							/* @__PURE__ */ (0, G.jsxs)("div", {
								className: "video-editor-media-picker-list",
								children: [m === "library" ? w.map((e) => /* @__PURE__ */ (0, G.jsxs)("button", {
									type: "button",
									onClick: () => {
										u(e), h("closed");
									},
									children: [
										/* @__PURE__ */ (0, G.jsx)("span", {
											className: "video-editor-media-picker-thumb",
											children: e.category === "image" && e.assetUrl ? /* @__PURE__ */ (0, G.jsx)("img", {
												src: e.assetUrl,
												alt: "",
												loading: "lazy"
											}) : /* @__PURE__ */ (0, G.jsx)(M, {
												icon: e.category === "image" ? "lucide:image" : "lucide:film",
												width: 16,
												height: 16
											})
										}),
										/* @__PURE__ */ (0, G.jsxs)("span", { children: [/* @__PURE__ */ (0, G.jsx)("strong", { children: e.name }), /* @__PURE__ */ (0, G.jsx)("em", { children: e.category === "image" ? p("图片") : p("视频") })] }),
										/* @__PURE__ */ (0, G.jsx)(M, {
											icon: "lucide:plus",
											width: 14,
											height: 14
										})
									]
								}, e.assetId ?? e.path)) : ee.map((e) => /* @__PURE__ */ (0, G.jsxs)("button", {
									type: "button",
									onClick: () => {
										d(e), h("closed");
									},
									children: [
										/* @__PURE__ */ (0, G.jsx)("span", {
											className: "video-editor-media-picker-thumb",
											children: /* @__PURE__ */ (0, G.jsx)("img", {
												src: e.sourceUrl,
												alt: "",
												loading: "lazy"
											})
										}),
										/* @__PURE__ */ (0, G.jsxs)("span", { children: [/* @__PURE__ */ (0, G.jsx)("strong", { children: e.label }), /* @__PURE__ */ (0, G.jsx)("em", { children: p("图片") })] }),
										/* @__PURE__ */ (0, G.jsx)(M, {
											icon: "lucide:plus",
											width: 14,
											height: 14
										})
									]
								}, e.nodeId)), (m === "library" && w.length === 0 || m === "canvas" && ee.length === 0) && /* @__PURE__ */ (0, G.jsx)("div", {
									className: "video-editor-media-picker-empty",
									children: p("没有可用素材")
								})]
							})
						] })
					})]
				})]
			}),
			/* @__PURE__ */ (0, G.jsxs)("div", {
				className: "video-editor-media-tools",
				children: [/* @__PURE__ */ (0, G.jsx)("div", {
					className: "video-editor-media-filters",
					role: "tablist",
					"aria-label": p("素材类型"),
					children: [
						["all", p("全部")],
						["video", p("视频")],
						["image", p("图片")]
					].map(([e, t]) => /* @__PURE__ */ (0, G.jsx)("button", {
						type: "button",
						role: "tab",
						"aria-selected": v === e,
						className: v === e ? "active" : "",
						onClick: () => y(e),
						children: t
					}, e))
				}), /* @__PURE__ */ (0, G.jsxs)("label", {
					className: "video-editor-media-list-search",
					children: [
						/* @__PURE__ */ (0, G.jsx)(M, {
							icon: "lucide:search",
							width: 13,
							height: 13
						}),
						/* @__PURE__ */ (0, G.jsx)("input", {
							value: x,
							placeholder: p("搜索工程素材"),
							onChange: (e) => S(e.target.value)
						}),
						x && /* @__PURE__ */ (0, G.jsx)("button", {
							type: "button",
							onClick: () => S(""),
							"aria-label": p("清空搜索"),
							children: /* @__PURE__ */ (0, G.jsx)(M, {
								icon: "lucide:x",
								width: 12,
								height: 12
							})
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, G.jsxs)("div", {
				className: "video-editor-media-list",
				children: [
					v === "image" && /* @__PURE__ */ (0, G.jsxs)("div", {
						className: "video-editor-media-stickers",
						children: [
							/* @__PURE__ */ (0, G.jsxs)("button", {
								type: "button",
								className: "video-editor-layer-add",
								disabled: s,
								onClick: f,
								children: [/* @__PURE__ */ (0, G.jsx)(M, {
									icon: s ? "lucide:loader-circle" : "lucide:upload",
									width: 15,
									height: 15
								}), p(s ? "正在导入…" : "上传本地贴图")]
							}),
							/* @__PURE__ */ (0, G.jsxs)("div", {
								className: "video-editor-layer-section-head",
								children: [/* @__PURE__ */ (0, G.jsx)("span", { children: p("项目图片节点") }), /* @__PURE__ */ (0, G.jsx)("em", { children: te.length })]
							}),
							te.length > 0 ? /* @__PURE__ */ (0, G.jsx)("div", {
								className: "video-editor-project-image-grid",
								children: te.map((e) => /* @__PURE__ */ (0, G.jsxs)("button", {
									type: "button",
									title: e.label,
									onClick: () => d(e),
									children: [/* @__PURE__ */ (0, G.jsx)("img", {
										src: e.sourceUrl,
										alt: "",
										loading: "lazy",
										draggable: !1
									}), /* @__PURE__ */ (0, G.jsx)("span", { children: e.label })]
								}, e.nodeId))
							}) : /* @__PURE__ */ (0, G.jsxs)("div", {
								className: "video-editor-layer-empty compact",
								children: [/* @__PURE__ */ (0, G.jsx)(M, {
									icon: "lucide:image-off",
									width: 18,
									height: 18
								}), /* @__PURE__ */ (0, G.jsx)("span", { children: a.length === 0 ? p("当前项目还没有可用的图片节点") : p("没有匹配的图片节点") })]
							}),
							/* @__PURE__ */ (0, G.jsx)("p", {
								className: "video-editor-layer-hint",
								children: p("点击即可作为贴图加入叠加轨；位置、缩放与不透明度在右侧「属性 → 画面」中调整")
							}),
							/* @__PURE__ */ (0, G.jsxs)("div", {
								className: "video-editor-layer-section-head",
								children: [/* @__PURE__ */ (0, G.jsx)("span", { children: p("工程内图片片段") }), /* @__PURE__ */ (0, G.jsx)("em", { children: D.length })]
							})
						]
					}),
					D.length === 0 && /* @__PURE__ */ (0, G.jsx)("div", {
						className: "video-editor-panel-empty",
						children: e.length === 0 ? p("工程内暂无素材") : p("没有匹配的素材")
					}),
					D.map((r) => {
						let i = e.findIndex((e) => e.id === r.id), a = t(r), o = r.kind === "image" ? r.sourceUrl : a?.thumbnails[0];
						return /* @__PURE__ */ (0, G.jsxs)("button", {
							type: "button",
							draggable: !0,
							className: `video-editor-media-item ${r.id === n ? "selected" : ""}`,
							onClick: () => c(r.id),
							onDragStart: (e) => {
								e.dataTransfer.effectAllowed = "move", e.dataTransfer.setData("application/x-video-editor-clip-id", r.id), e.dataTransfer.setData("text/plain", r.id);
							},
							children: [/* @__PURE__ */ (0, G.jsx)("div", {
								className: "video-editor-media-thumb",
								children: o ? /* @__PURE__ */ (0, G.jsx)("img", {
									src: o,
									alt: "",
									draggable: !1
								}) : /* @__PURE__ */ (0, G.jsx)(M, {
									icon: r.kind === "image" ? "lucide:image" : "lucide:film",
									width: 18,
									height: 18
								})
							}), /* @__PURE__ */ (0, G.jsxs)("div", {
								className: "video-editor-media-info",
								children: [/* @__PURE__ */ (0, G.jsxs)("span", {
									className: "video-editor-media-name",
									title: r.fileName,
									children: [
										i + 1,
										". ",
										r.fileName
									]
								}), /* @__PURE__ */ (0, G.jsx)("span", {
									className: "video-editor-media-sub",
									children: p(r.kind === "image" ? "图片 · {time}s" : "视频 · {time}s", { time: b(r).toFixed(1) })
								})]
							})]
						}, r.id);
					})
				]
			}),
			D.length > 0 && /* @__PURE__ */ (0, G.jsxs)("div", {
				className: "video-editor-media-drag-hint",
				children: [/* @__PURE__ */ (0, G.jsx)(M, {
					icon: "lucide:mouse-pointer-2",
					width: 12,
					height: 12
				}), p("拖动素材到时间轴可调整位置与层级")]
			}),
			T.length > 0 && /* @__PURE__ */ (0, G.jsx)("div", {
				className: "video-editor-panel-warning",
				children: p("有 {count} 个片段当前系统无法解码，缩略图不可用；直通裁剪导出仍可进行", { count: T.length })
			}),
			E.length > 0 && /* @__PURE__ */ (0, G.jsx)("div", {
				className: "video-editor-panel-warning",
				children: p("有 {count} 个片段读取失败：{detail}", {
					count: E.length,
					detail: t(E[0])?.error ?? ""
				})
			})
		]
	});
}
var st = (0, R.memo)(Y), ct = [
	{
		label: "H.264 720p",
		codec: "avc1.42001f",
		width: 1280,
		height: 720
	},
	{
		label: "H.264 1080p",
		codec: "avc1.4d0028",
		width: 1920,
		height: 1080
	},
	{
		label: "H.264 4K",
		codec: "avc1.640033",
		width: 3840,
		height: 2160
	},
	{
		label: "HEVC 1080p",
		codec: "hvc1.1.6.L93.B0",
		width: 1920,
		height: 1080
	},
	{
		label: "VP9 1080p",
		codec: "vp09.00.10.08",
		width: 1920,
		height: 1080
	},
	{
		label: "AV1 1080p",
		codec: "av01.0.08M.08",
		width: 1920,
		height: 1080
	}
];
async function X(e) {
	let t = {
		codec: e.codec,
		width: e.width,
		height: e.height,
		bitrate: 2e6,
		framerate: 30
	}, n, r;
	try {
		n = (await VideoEncoder.isConfigSupported(t)).supported ? "supported" : "unsupported";
	} catch (e) {
		n = "throw", r = e instanceof Error ? `${e.name}: ${e.message}` : String(e);
	}
	let i = await new Promise((n) => {
		let i = !1, a = (e, t) => {
			i || (i = !0, t && !r && (r = t), n(e));
		};
		try {
			let n = new VideoEncoder({
				output: () => a("ok"),
				error: (e) => a("failed", e.message)
			});
			n.configure(t);
			let r = new VideoFrame(new Uint8Array(e.width * e.height * 4), {
				format: "RGBA",
				codedWidth: e.width,
				codedHeight: e.height,
				timestamp: 0
			});
			n.encode(r, { keyFrame: !0 }), r.close(), n.flush().then(() => a("ok")).catch((e) => a("failed", e instanceof Error ? `${e.name}: ${e.message}` : String(e))).finally(() => {
				try {
					n.close();
				} catch {}
			});
		} catch (e) {
			a("failed", e instanceof Error ? `${e.name}: ${e.message}` : String(e));
		}
	});
	return {
		...e,
		declared: n,
		actual: i,
		detail: r
	};
}
async function lt() {
	let e = typeof VideoEncoder < "u", t = {
		hasVideoEncoder: e,
		hasVideoDecoder: typeof VideoDecoder < "u",
		hasAudioEncoder: typeof AudioEncoder < "u",
		hasAudioDecoder: typeof AudioDecoder < "u"
	};
	if (!e) return {
		...t,
		results: []
	};
	let n = [];
	for (let e of ct) n.push(await X(e));
	return {
		...t,
		results: n
	};
}
//#endregion
//#region src/components/videoEditor/VideoEditorCodecPanel.tsx
function ut() {
	let e = r(), t = {
		supported: e("支持"),
		unsupported: e("不支持"),
		throw: e("抛异常")
	}, [n, i] = (0, R.useState)(null), [a, o] = (0, R.useState)(!1), s = (0, R.useCallback)(async () => {
		o(!0);
		try {
			i(await lt());
		} finally {
			o(!1);
		}
	}, []), c = (0, R.useCallback)(() => {
		if (!n) return;
		let e = [
			`VideoEncoder: ${n.hasVideoEncoder}`,
			`VideoDecoder: ${n.hasVideoDecoder}`,
			`AudioEncoder: ${n.hasAudioEncoder}`,
			`AudioDecoder: ${n.hasAudioDecoder}`,
			...n.results.map((e) => `${e.label} (${e.codec}) 声明=${e.declared} 实测=${e.actual}` + (e.detail ? ` — ${e.detail}` : ""))
		];
		navigator.clipboard?.writeText(e.join("\n")).catch(() => {});
	}, [n]);
	return /* @__PURE__ */ (0, G.jsxs)("div", {
		className: "video-editor-inspect-group",
		children: [
			/* @__PURE__ */ (0, G.jsxs)("div", {
				className: "video-editor-inspect-title",
				children: [
					e("编码能力自检"),
					/* @__PURE__ */ (0, G.jsx)("button", {
						type: "button",
						className: "video-editor-probe-btn",
						onClick: () => {
							s();
						},
						disabled: a,
						children: e(a ? "检测中…" : "运行")
					}),
					n && /* @__PURE__ */ (0, G.jsx)("button", {
						type: "button",
						className: "video-editor-probe-btn",
						onClick: c,
						children: e("复制")
					})
				]
			}),
			!n && /* @__PURE__ */ (0, G.jsx)("div", {
				className: "video-editor-inspect-hint",
				children: e("实测本机能否编码，用来判断转场 / 合成 / 音轨路线是否可行")
			}),
			n && /* @__PURE__ */ (0, G.jsxs)(G.Fragment, { children: [
				/* @__PURE__ */ (0, G.jsxs)("div", {
					className: "video-editor-inspect-row",
					children: [/* @__PURE__ */ (0, G.jsx)("span", { children: "VideoEncoder" }), /* @__PURE__ */ (0, G.jsx)("span", { children: n.hasVideoEncoder ? e("存在") : e("缺失") })]
				}),
				/* @__PURE__ */ (0, G.jsxs)("div", {
					className: "video-editor-inspect-row",
					children: [/* @__PURE__ */ (0, G.jsx)("span", { children: "VideoDecoder" }), /* @__PURE__ */ (0, G.jsx)("span", { children: n.hasVideoDecoder ? e("存在") : e("缺失") })]
				}),
				/* @__PURE__ */ (0, G.jsxs)("div", {
					className: "video-editor-inspect-row",
					children: [/* @__PURE__ */ (0, G.jsx)("span", { children: "AudioEncoder" }), /* @__PURE__ */ (0, G.jsx)("span", { children: n.hasAudioEncoder ? e("存在") : e("缺失") })]
				}),
				/* @__PURE__ */ (0, G.jsxs)("div", {
					className: "video-editor-inspect-row",
					children: [/* @__PURE__ */ (0, G.jsx)("span", { children: "AudioDecoder" }), /* @__PURE__ */ (0, G.jsx)("span", { children: n.hasAudioDecoder ? e("存在") : e("缺失") })]
				}),
				!n.hasAudioEncoder && /* @__PURE__ */ (0, G.jsx)("div", {
					className: "video-editor-inspect-hint",
					children: e("本机没有 AudioEncoder，合成导出无法混流；满足条件时会改用音频分组直通")
				}),
				n.results.map((n) => /* @__PURE__ */ (0, G.jsxs)("div", {
					className: "video-editor-probe-row",
					title: n.detail,
					children: [
						/* @__PURE__ */ (0, G.jsx)(M, {
							icon: n.actual === "ok" ? "lucide:check-circle-2" : "lucide:x-circle",
							width: 12,
							height: 12,
							className: n.actual === "ok" ? "ok" : "bad"
						}),
						/* @__PURE__ */ (0, G.jsx)("span", {
							className: "video-editor-probe-label",
							children: n.label
						}),
						/* @__PURE__ */ (0, G.jsxs)("span", {
							className: "video-editor-probe-verdict",
							children: [
								e("实测"),
								n.actual === "ok" ? e("可用") : e("失败"),
								/* @__PURE__ */ (0, G.jsxs)("em", { children: [
									"（",
									e("声明"),
									t[n.declared] ?? n.declared,
									"）"
								] })
							]
						})
					]
				}, n.label))
			] })
		]
	});
}
var dt = (0, R.memo)(ut), ft = [
	{
		label: "系统默认",
		value: "system-ui, -apple-system, \"Segoe UI\", sans-serif"
	},
	{
		label: "无衬线",
		value: "sans-serif"
	},
	{
		label: "衬线",
		value: "serif"
	},
	{
		label: "等宽",
		value: "monospace"
	}
], pt = null;
function mt(e) {
	return `"${e.replace(/["\\]/g, "\\$&")}"`;
}
function ht() {
	return ft;
}
async function gt() {
	if (pt) return pt;
	let e = globalThis, t;
	if (e.queryLocalFonts) try {
		t = (await e.queryLocalFonts()).map((e) => e.family);
	} catch {
		t = await a("list_local_fonts");
	}
	else t = await a("list_local_fonts");
	let n = [...new Set(t.map((e) => e.trim()).filter(Boolean))].sort((e, t) => e.localeCompare(t));
	return pt = [...ft, ...n.map((e) => ({
		label: e,
		value: mt(e)
	}))], pt;
}
//#endregion
//#region src/components/videoEditor/VideoEditorTextPanel.tsx
function _t({ selectedClip: e, onAddText: t, onPatchText: n, onBeginInteraction: i, onEndInteraction: a }) {
	let o = r(), s = [
		{
			value: "left",
			icon: "lucide:align-left",
			label: o("左对齐")
		},
		{
			value: "center",
			icon: "lucide:align-center",
			label: o("居中")
		},
		{
			value: "right",
			icon: "lucide:align-right",
			label: o("右对齐")
		}
	], [c, l] = (0, R.useState)(ht), [u, d] = (0, R.useState)(!1), [p, m] = (0, R.useState)(""), [h, g] = (0, R.useState)(!1), [_, v] = (0, R.useState)(""), y = (0, R.useRef)(null), b = (0, R.useMemo)(() => {
		let e = _.trim().toLocaleLowerCase();
		return e ? c.filter((t) => t.label.toLocaleLowerCase().includes(e)) : c;
	}, [c, _]);
	(0, R.useEffect)(() => {
		if (!h) return;
		let e = (e) => {
			y.current?.contains(e.target) || g(!1);
		}, t = (e) => {
			e.key === "Escape" && g(!1);
		};
		return document.addEventListener("pointerdown", e), document.addEventListener("keydown", t), () => {
			document.removeEventListener("pointerdown", e), document.removeEventListener("keydown", t);
		};
	}, [h]);
	let x = async () => {
		d(!0), m("");
		try {
			let e = await gt();
			l(e), g(!0), m(o("已读取 {count} 个本机字体", { count: Math.max(0, e.length - ht().length) }));
		} catch (e) {
			m(e instanceof Error ? e.message : o("读取本机字体失败"));
		} finally {
			d(!1);
		}
	}, S = e?.kind === "text", C = {
		...f,
		...e?.textStyle
	};
	return /* @__PURE__ */ (0, G.jsxs)("div", {
		className: "video-editor-layer-panel",
		children: [/* @__PURE__ */ (0, G.jsxs)("button", {
			type: "button",
			className: "video-editor-layer-add",
			onClick: t,
			children: [/* @__PURE__ */ (0, G.jsx)(M, {
				icon: "lucide:type",
				width: 16,
				height: 16
			}), o("添加文字")]
		}), S ? /* @__PURE__ */ (0, G.jsxs)("div", {
			className: "video-editor-layer-controls",
			children: [
				/* @__PURE__ */ (0, G.jsxs)("label", {
					className: "video-editor-field-stack",
					children: [/* @__PURE__ */ (0, G.jsx)("span", { children: o("文字内容") }), /* @__PURE__ */ (0, G.jsx)("textarea", {
						value: C.content,
						rows: 3,
						maxLength: 240,
						onFocus: i,
						onBlur: a,
						onChange: (e) => n({ content: e.target.value })
					})]
				}),
				/* @__PURE__ */ (0, G.jsxs)("div", {
					className: "video-editor-field-stack",
					children: [
						/* @__PURE__ */ (0, G.jsx)("span", { children: o("字体") }),
						/* @__PURE__ */ (0, G.jsxs)("div", {
							ref: y,
							className: "video-editor-font-picker",
							children: [/* @__PURE__ */ (0, G.jsxs)("div", {
								className: "video-editor-font-select-wrap",
								children: [/* @__PURE__ */ (0, G.jsxs)("button", {
									type: "button",
									className: "video-editor-font-trigger",
									"aria-haspopup": "listbox",
									"aria-expanded": h,
									onClick: () => g((e) => !e),
									children: [/* @__PURE__ */ (0, G.jsx)("span", {
										style: { fontFamily: C.fontFamily },
										children: c.find((e) => e.value === C.fontFamily)?.label ?? o("当前字体")
									}), /* @__PURE__ */ (0, G.jsx)(M, {
										icon: "lucide:chevron-down",
										width: 14,
										height: 14
									})]
								}), h && /* @__PURE__ */ (0, G.jsxs)("div", {
									className: "video-editor-font-menu",
									children: [/* @__PURE__ */ (0, G.jsxs)("div", {
										className: "video-editor-font-search",
										children: [/* @__PURE__ */ (0, G.jsx)(M, {
											icon: "lucide:search",
											width: 14,
											height: 14
										}), /* @__PURE__ */ (0, G.jsx)("input", {
											autoFocus: !0,
											value: _,
											placeholder: o("搜索字体"),
											"aria-label": o("搜索字体"),
											onChange: (e) => v(e.target.value)
										})]
									}), /* @__PURE__ */ (0, G.jsxs)("div", {
										className: "video-editor-font-options",
										role: "listbox",
										"aria-label": o("字体"),
										children: [b.map((e) => {
											let t = e.value === C.fontFamily;
											return /* @__PURE__ */ (0, G.jsxs)("button", {
												type: "button",
												role: "option",
												"aria-selected": t,
												className: t ? "selected" : "",
												style: { fontFamily: e.value },
												onClick: () => {
													i(), n({ fontFamily: e.value }), a(), g(!1), v("");
												},
												children: [/* @__PURE__ */ (0, G.jsx)("span", { children: e.label }), t && /* @__PURE__ */ (0, G.jsx)(M, {
													icon: "lucide:check",
													width: 14,
													height: 14
												})]
											}, e.value);
										}), b.length === 0 && /* @__PURE__ */ (0, G.jsx)("span", {
											className: "video-editor-font-no-result",
											children: o("没有匹配的字体")
										})]
									})]
								})]
							}), /* @__PURE__ */ (0, G.jsxs)("button", {
								type: "button",
								className: "video-editor-font-load",
								disabled: u,
								onClick: () => void x(),
								children: [/* @__PURE__ */ (0, G.jsx)(M, {
									icon: u ? "lucide:loader-circle" : "lucide:scan-search",
									width: 14,
									height: 14
								}), o(u ? "读取中" : "本机字体")]
							})]
						}),
						p && /* @__PURE__ */ (0, G.jsx)("em", {
							className: "video-editor-font-message",
							children: p
						})
					]
				}),
				/* @__PURE__ */ (0, G.jsxs)("label", {
					className: "video-editor-inspect-slider",
					children: [
						/* @__PURE__ */ (0, G.jsx)("span", { children: o("字号") }),
						/* @__PURE__ */ (0, G.jsx)("input", {
							type: "range",
							min: 16,
							max: 180,
							step: 1,
							value: C.fontSize,
							style: { "--range-progress": `${(C.fontSize - 16) / 164 * 100}%` },
							onPointerDown: i,
							onPointerUp: a,
							onPointerCancel: a,
							onKeyDown: i,
							onKeyUp: a,
							onChange: (e) => n({ fontSize: Number(e.target.value) })
						}),
						/* @__PURE__ */ (0, G.jsxs)("em", { children: [C.fontSize, "px"] })
					]
				}),
				/* @__PURE__ */ (0, G.jsxs)("div", {
					className: "video-editor-field-row",
					children: [/* @__PURE__ */ (0, G.jsx)("span", { children: o("颜色") }), /* @__PURE__ */ (0, G.jsxs)("label", {
						className: "video-editor-color-field",
						children: [/* @__PURE__ */ (0, G.jsx)("input", {
							type: "color",
							value: C.color,
							"aria-label": o("文字颜色"),
							onFocus: i,
							onBlur: a,
							onChange: (e) => n({ color: e.target.value })
						}), /* @__PURE__ */ (0, G.jsx)("code", { children: C.color.toUpperCase() })]
					})]
				}),
				/* @__PURE__ */ (0, G.jsxs)("div", {
					className: "video-editor-field-row",
					children: [/* @__PURE__ */ (0, G.jsx)("span", { children: o("字重") }), /* @__PURE__ */ (0, G.jsx)("div", {
						className: "video-editor-segmented",
						children: [
							400,
							600,
							700
						].map((e) => /* @__PURE__ */ (0, G.jsx)("button", {
							type: "button",
							className: C.fontWeight === e ? "active" : "",
							onClick: () => {
								i(), n({ fontWeight: e }), a();
							},
							children: o(e === 400 ? "常规" : e === 600 ? "中等" : "粗体")
						}, e))
					})]
				}),
				/* @__PURE__ */ (0, G.jsxs)("div", {
					className: "video-editor-field-row",
					children: [/* @__PURE__ */ (0, G.jsx)("span", { children: o("对齐") }), /* @__PURE__ */ (0, G.jsx)("div", {
						className: "video-editor-segmented icon-only",
						children: s.map((e) => /* @__PURE__ */ (0, G.jsx)("button", {
							type: "button",
							className: C.align === e.value ? "active" : "",
							"aria-label": e.label,
							"data-tooltip": e.label,
							onClick: () => {
								i(), n({ align: e.value }), a();
							},
							children: /* @__PURE__ */ (0, G.jsx)(M, {
								icon: e.icon,
								width: 14,
								height: 14
							})
						}, e.value))
					})]
				}),
				/* @__PURE__ */ (0, G.jsx)("p", {
					className: "video-editor-layer-hint",
					children: o("可直接在预览画面拖动、缩放；显示时长在时间轴调整")
				})
			]
		}) : /* @__PURE__ */ (0, G.jsxs)("div", {
			className: "video-editor-layer-empty",
			children: [/* @__PURE__ */ (0, G.jsx)(M, {
				icon: "lucide:mouse-pointer-2",
				width: 20,
				height: 20
			}), /* @__PURE__ */ (0, G.jsx)("span", { children: o("添加或选中一段文字后编辑样式") })]
		})]
	});
}
var vt = (0, R.memo)(_t), yt = [
	2,
	3,
	4,
	5
];
function Z({ models: e, busy: t, status: n, error: i, canGenerate: a, onRefreshModels: o, onGenerate: s }) {
	let c = r(), [l, u] = (0, R.useState)(!1), [d, f] = (0, R.useState)(""), [p, m] = (0, R.useState)(""), [h, g] = (0, R.useState)(3), _ = (0, R.useMemo)(() => e.find((e) => e.value === p) ?? e[0], [p, e]);
	return /* @__PURE__ */ (0, G.jsxs)("div", {
		className: "video-editor-ai-transition",
		children: [/* @__PURE__ */ (0, G.jsxs)("button", {
			type: "button",
			className: "video-editor-ai-transition-toggle",
			"aria-expanded": l,
			onClick: () => u((e) => !e),
			children: [
				/* @__PURE__ */ (0, G.jsx)(M, {
					icon: "lucide:sparkles",
					width: 13,
					height: 13
				}),
				/* @__PURE__ */ (0, G.jsx)("span", { children: c("AI 生成转场") }),
				/* @__PURE__ */ (0, G.jsx)(M, {
					icon: l ? "lucide:chevron-up" : "lucide:chevron-down",
					width: 13,
					height: 13
				})
			]
		}), l && /* @__PURE__ */ (0, G.jsxs)("div", {
			className: "video-editor-ai-transition-body",
			children: [
				/* @__PURE__ */ (0, G.jsx)("p", {
					className: "video-editor-ai-transition-hint",
					children: c("取前一段的尾帧作首帧、本段的首帧作尾帧，按提示词生成一段过渡视频并插入两段之间")
				}),
				/* @__PURE__ */ (0, G.jsxs)("label", {
					className: "video-editor-field-stack",
					children: [/* @__PURE__ */ (0, G.jsx)("span", { children: c("转场描述") }), /* @__PURE__ */ (0, G.jsx)("textarea", {
						rows: 3,
						value: d,
						maxLength: 500,
						placeholder: c("例如：镜头快速推近穿过火光，自然过渡到下一场景"),
						onChange: (e) => f(e.target.value)
					})]
				}),
				/* @__PURE__ */ (0, G.jsxs)("label", {
					className: "video-editor-inspect-slider",
					children: [/* @__PURE__ */ (0, G.jsx)("span", { children: c("模型") }), /* @__PURE__ */ (0, G.jsxs)("select", {
						value: _?.value ?? "",
						disabled: e.length === 0 || t,
						onChange: (e) => m(e.target.value),
						children: [e.length === 0 && /* @__PURE__ */ (0, G.jsx)("option", {
							value: "",
							children: c("暂无可用视频模型")
						}), e.map((e) => /* @__PURE__ */ (0, G.jsx)("option", {
							value: e.value,
							children: c("{group} · {name}", {
								group: e.groupName,
								name: e.label
							})
						}, e.value))]
					})]
				}),
				/* @__PURE__ */ (0, G.jsxs)("label", {
					className: "video-editor-inspect-slider",
					children: [/* @__PURE__ */ (0, G.jsx)("span", { children: c("时长") }), /* @__PURE__ */ (0, G.jsx)("select", {
						value: h,
						disabled: t,
						onChange: (e) => g(Number(e.target.value)),
						children: yt.map((e) => /* @__PURE__ */ (0, G.jsxs)("option", {
							value: e,
							children: [e, "s"]
						}, e))
					})]
				}),
				/* @__PURE__ */ (0, G.jsxs)("div", {
					className: "video-editor-ai-transition-actions",
					children: [/* @__PURE__ */ (0, G.jsxs)("button", {
						type: "button",
						className: "video-editor-ai-transition-refresh",
						disabled: t,
						onClick: o,
						children: [/* @__PURE__ */ (0, G.jsx)(M, {
							icon: "lucide:refresh-cw",
							width: 12,
							height: 12
						}), c("刷新模型")]
					}), /* @__PURE__ */ (0, G.jsxs)("button", {
						type: "button",
						className: `video-editor-ai-transition-submit${t ? " busy" : ""}`,
						disabled: t || !a || !_ || !d.trim(),
						onClick: () => {
							!_ || !d.trim() || t || !a || s({
								prompt: d.trim(),
								model: _.value,
								provider: _.provider,
								duration: h
							});
						},
						children: [/* @__PURE__ */ (0, G.jsx)(M, {
							icon: t ? "lucide:loader-circle" : "lucide:wand-sparkles",
							width: 13,
							height: 13
						}), c(t ? "生成中…" : "生成转场")]
					})]
				}),
				!a && /* @__PURE__ */ (0, G.jsx)("p", {
					className: "video-editor-ai-transition-note",
					children: c("请先在主轨上选中第二段及之后的片段——转场要插在它与前一段之间")
				}),
				n && /* @__PURE__ */ (0, G.jsx)("p", {
					className: "video-editor-ai-transition-note",
					children: n
				}),
				i && /* @__PURE__ */ (0, G.jsx)("p", {
					className: "video-editor-ai-transition-note error",
					children: i
				}),
				e.length === 0 && /* @__PURE__ */ (0, G.jsx)("p", {
					className: "video-editor-ai-transition-note",
					children: c("没有收到可用模型：请确认主窗口仍开着该视频节点所在的项目，并已在「设置 → API Key」中配置视频模型")
				})
			]
		})]
	});
}
var bt = (0, R.memo)(Z), xt = .1, St = 3;
function Ct({ clip: e, locked: t, onTransitionChange: n, onBeginInteraction: i, onEndInteraction: a, aiModels: o, aiTransitionBusy: s, aiTransitionStatus: c, aiTransitionError: l, canGenerateAiTransition: u, onRefreshAiModels: d, onGenerateAiTransition: f }) {
	let p = r(), m = e?.transitionIn ?? {
		kind: "none",
		duration: .5
	}, h = {
		onPointerDown: i,
		onPointerUp: a,
		onPointerCancel: a,
		onKeyDown: i,
		onKeyUp: a,
		onBlur: a
	}, g = (m.duration - xt) / (St - xt) * 100;
	return /* @__PURE__ */ (0, G.jsxs)("div", {
		className: "video-editor-inspect-group",
		children: [/* @__PURE__ */ (0, G.jsxs)("div", {
			className: "video-editor-inspect-title",
			children: [
				p("转场"),
				p("与前一段"),
				t && /* @__PURE__ */ (0, G.jsx)("span", {
					className: "video-editor-inspect-badge",
					children: p("已锁定")
				})
			]
		}), e ? /* @__PURE__ */ (0, G.jsxs)(G.Fragment, { children: [
			/* @__PURE__ */ (0, G.jsxs)("label", {
				className: "video-editor-inspect-slider",
				children: [/* @__PURE__ */ (0, G.jsx)("span", { children: p("类型") }), /* @__PURE__ */ (0, G.jsxs)("select", {
					value: m.kind,
					disabled: t,
					...h,
					onChange: (e) => n(e.target.value, m.duration),
					children: [
						/* @__PURE__ */ (0, G.jsx)("option", {
							value: "none",
							children: p("硬切")
						}),
						/* @__PURE__ */ (0, G.jsx)("option", {
							value: "dissolve",
							children: p("交叠淡入")
						}),
						/* @__PURE__ */ (0, G.jsx)("option", {
							value: "fade",
							children: p("黑场淡入")
						})
					]
				})]
			}),
			/* @__PURE__ */ (0, G.jsxs)("label", {
				className: "video-editor-inspect-slider",
				children: [
					/* @__PURE__ */ (0, G.jsx)("span", { children: p("时长") }),
					/* @__PURE__ */ (0, G.jsx)("input", {
						type: "range",
						min: xt,
						max: St,
						step: .1,
						value: m.duration,
						style: { "--range-progress": `${Math.max(0, Math.min(100, g))}%` },
						disabled: t || m.kind === "none",
						...h,
						onChange: (e) => n(m.kind, Number(e.target.value))
					}),
					/* @__PURE__ */ (0, G.jsxs)("em", { children: [m.duration.toFixed(1), "s"] })
				]
			}),
			/* @__PURE__ */ (0, G.jsx)(bt, {
				models: o,
				busy: s,
				status: c,
				error: l,
				canGenerate: u,
				onRefreshModels: d,
				onGenerate: f
			})
		] }) : /* @__PURE__ */ (0, G.jsxs)("div", {
			className: "video-editor-layer-empty",
			children: [/* @__PURE__ */ (0, G.jsx)(M, {
				icon: "lucide:mouse-pointer-2",
				width: 20,
				height: 20
			}), /* @__PURE__ */ (0, G.jsx)("span", { children: p("选中一个片段后设置它与前一段之间的转场") })]
		})]
	});
}
var wt = (0, R.memo)(Ct), Tt = ["滤镜"];
function Q(e, t, n) {
	let r = n > t ? (e - t) / (n - t) * 100 : 0;
	return { "--range-progress": `${Math.max(0, Math.min(100, r))}%` };
}
function Et({ clip: e, locked: t, probe: n, clipCount: i, timelineDuration: a, canvasSize: o, compositing: s, mixedSources: c, frameRate: l, onFrameRateChange: u, outputScale: d, onOutputScaleChange: f, onBeginInteraction: p, onEndInteraction: m, onTransformChange: h, onTransitionChange: g, onVolumeChange: _, onAddText: v, onPatchText: y, activeTab: S, onActiveTabChange: C, aiModels: w, aiTransitionBusy: ee, aiTransitionStatus: T, aiTransitionError: E, canGenerateAiTransition: D, onRefreshAiModels: te, onGenerateAiTransition: O }) {
	let k = r(), [ne, A] = (0, R.useState)("clip"), re = e ? b(e) : 0, j = e?.transform ?? x, ie = {
		onPointerDown: p,
		onPointerUp: m,
		onPointerCancel: m,
		onKeyDown: p,
		onKeyUp: m,
		onBlur: m
	}, ae = /* @__PURE__ */ (0, G.jsx)("div", {
		className: "video-editor-panel-head video-editor-inspector-tabs",
		role: "tablist",
		"aria-label": k("视频编辑工具"),
		children: [
			[
				"properties",
				"lucide:sliders-horizontal",
				k("属性")
			],
			[
				"text",
				"lucide:type",
				k("文字")
			],
			[
				"transition",
				"lucide:blend",
				k("转场")
			]
		].map(([e, t, n]) => /* @__PURE__ */ (0, G.jsxs)("button", {
			type: "button",
			role: "tab",
			"aria-selected": S === e,
			className: S === e ? "active" : "",
			onClick: () => C(e),
			children: [/* @__PURE__ */ (0, G.jsx)(M, {
				icon: t,
				width: 13,
				height: 13
			}), n]
		}, e))
	});
	if (S === "text") return /* @__PURE__ */ (0, G.jsxs)("aside", {
		className: "video-editor-inspector",
		children: [ae, /* @__PURE__ */ (0, G.jsx)(vt, {
			selectedClip: e,
			onAddText: v,
			onPatchText: y,
			onBeginInteraction: p,
			onEndInteraction: m
		})]
	});
	if (S === "transition") return /* @__PURE__ */ (0, G.jsxs)("aside", {
		className: "video-editor-inspector",
		children: [ae, /* @__PURE__ */ (0, G.jsx)(wt, {
			clip: e,
			locked: t,
			onTransitionChange: g,
			onBeginInteraction: p,
			onEndInteraction: m,
			aiModels: w,
			aiTransitionBusy: ee,
			aiTransitionStatus: T,
			aiTransitionError: E,
			canGenerateAiTransition: D,
			onRefreshAiModels: te,
			onGenerateAiTransition: O
		})]
	});
	let oe = [
		[
			"clip",
			"lucide:film",
			k("片段")
		],
		[
			"transform",
			"lucide:move-3d",
			k("画面")
		],
		[
			"audio",
			"lucide:audio-lines",
			k("音频")
		],
		[
			"export",
			"lucide:settings-2",
			k("工程")
		]
	].filter(([t]) => t !== "audio" || e?.kind === "video" || !!n?.audioCodec), se = oe.some(([e]) => e === ne) ? ne : "clip";
	return /* @__PURE__ */ (0, G.jsxs)("aside", {
		className: "video-editor-inspector",
		children: [
			ae,
			/* @__PURE__ */ (0, G.jsx)("div", {
				className: "video-editor-property-tabs",
				role: "tablist",
				"aria-label": k("属性分类"),
				children: oe.map(([e, t, n]) => /* @__PURE__ */ (0, G.jsxs)("button", {
					type: "button",
					role: "tab",
					"aria-selected": se === e,
					className: se === e ? "active" : "",
					onClick: () => A(e),
					children: [/* @__PURE__ */ (0, G.jsx)(M, {
						icon: t,
						width: 14,
						height: 14
					}), /* @__PURE__ */ (0, G.jsx)("span", { children: n })]
				}, e))
			}),
			se === "clip" && /* @__PURE__ */ (0, G.jsxs)(G.Fragment, { children: [
				/* @__PURE__ */ (0, G.jsxs)("div", {
					className: "video-editor-inspect-group",
					children: [
						/* @__PURE__ */ (0, G.jsx)("div", {
							className: "video-editor-inspect-title",
							children: k("时间轴")
						}),
						/* @__PURE__ */ (0, G.jsxs)("div", {
							className: "video-editor-inspect-row",
							children: [/* @__PURE__ */ (0, G.jsx)("span", { children: k("片段数") }), /* @__PURE__ */ (0, G.jsx)("span", { children: i })]
						}),
						/* @__PURE__ */ (0, G.jsxs)("div", {
							className: "video-editor-inspect-row",
							children: [/* @__PURE__ */ (0, G.jsx)("span", { children: k("总时长") }), /* @__PURE__ */ (0, G.jsxs)("span", { children: [a.toFixed(2), "s"] })]
						})
					]
				}),
				/* @__PURE__ */ (0, G.jsxs)("div", {
					className: "video-editor-inspect-group",
					children: [
						/* @__PURE__ */ (0, G.jsxs)("div", {
							className: "video-editor-inspect-title",
							children: [k("片段"), t && /* @__PURE__ */ (0, G.jsx)("span", {
								className: "video-editor-inspect-badge",
								children: k("已锁定")
							})]
						}),
						/* @__PURE__ */ (0, G.jsxs)("div", {
							className: "video-editor-inspect-row",
							children: [/* @__PURE__ */ (0, G.jsx)("span", { children: k("名称") }), /* @__PURE__ */ (0, G.jsx)("span", {
								className: "video-editor-inspect-ellipsis",
								title: e?.fileName,
								children: e?.fileName ?? "—"
							})]
						}),
						/* @__PURE__ */ (0, G.jsxs)("div", {
							className: "video-editor-inspect-row",
							children: [/* @__PURE__ */ (0, G.jsx)("span", { children: k("类型") }), /* @__PURE__ */ (0, G.jsx)("span", { children: e ? e.kind === "image" ? k("图片") : e.kind === "text" ? k("文字") : k("视频") : "—" })]
						}),
						/* @__PURE__ */ (0, G.jsxs)("div", {
							className: "video-editor-inspect-row",
							children: [/* @__PURE__ */ (0, G.jsx)("span", { children: k("入点") }), /* @__PURE__ */ (0, G.jsx)("span", { children: e ? `${e.sourceIn.toFixed(2)}s` : "—" })]
						}),
						/* @__PURE__ */ (0, G.jsxs)("div", {
							className: "video-editor-inspect-row",
							children: [/* @__PURE__ */ (0, G.jsx)("span", { children: k("出点") }), /* @__PURE__ */ (0, G.jsx)("span", { children: e ? `${e.sourceOut.toFixed(2)}s` : "—" })]
						}),
						/* @__PURE__ */ (0, G.jsxs)("div", {
							className: "video-editor-inspect-row",
							children: [/* @__PURE__ */ (0, G.jsx)("span", { children: k("保留时长") }), /* @__PURE__ */ (0, G.jsx)("span", { children: e ? `${re.toFixed(2)}s` : "—" })]
						})
					]
				}),
				/* @__PURE__ */ (0, G.jsxs)("div", {
					className: "video-editor-inspect-group",
					children: [
						/* @__PURE__ */ (0, G.jsx)("div", {
							className: "video-editor-inspect-title",
							children: k("源素材")
						}),
						/* @__PURE__ */ (0, G.jsxs)("div", {
							className: "video-editor-inspect-row",
							children: [/* @__PURE__ */ (0, G.jsx)("span", { children: k("分辨率") }), /* @__PURE__ */ (0, G.jsx)("span", { children: n ? `${n.width}×${n.height}` : "—" })]
						}),
						/* @__PURE__ */ (0, G.jsxs)("div", {
							className: "video-editor-inspect-row",
							children: [/* @__PURE__ */ (0, G.jsx)("span", { children: k("总时长") }), /* @__PURE__ */ (0, G.jsx)("span", { children: n ? `${n.duration.toFixed(2)}s` : "—" })]
						}),
						/* @__PURE__ */ (0, G.jsxs)("div", {
							className: "video-editor-inspect-row",
							children: [/* @__PURE__ */ (0, G.jsx)("span", { children: k("视频编码") }), /* @__PURE__ */ (0, G.jsx)("span", { children: n?.videoCodec ?? "—" })]
						}),
						/* @__PURE__ */ (0, G.jsxs)("div", {
							className: "video-editor-inspect-row",
							children: [/* @__PURE__ */ (0, G.jsx)("span", { children: k("音频编码") }), /* @__PURE__ */ (0, G.jsx)("span", { children: n?.audioCodec ?? "—" })]
						})
					]
				})
			] }),
			se === "transform" && /* @__PURE__ */ (0, G.jsxs)(G.Fragment, { children: [/* @__PURE__ */ (0, G.jsxs)("div", {
				className: "video-editor-inspect-group",
				children: [/* @__PURE__ */ (0, G.jsx)("div", {
					className: "video-editor-inspect-title",
					children: k("画面变换")
				}), [
					[
						k("水平位置"),
						"x",
						0,
						1,
						.01
					],
					[
						k("垂直位置"),
						"y",
						0,
						1,
						.01
					],
					[
						k("缩放"),
						"scale",
						.05,
						2,
						.01
					],
					[
						k("旋转"),
						"rotation",
						-180,
						180,
						1
					],
					[
						k("不透明度"),
						"opacity",
						0,
						1,
						.01
					]
				].map(([n, r, i, a, o]) => /* @__PURE__ */ (0, G.jsxs)("label", {
					className: "video-editor-inspect-slider",
					children: [
						/* @__PURE__ */ (0, G.jsx)("span", { children: n }),
						/* @__PURE__ */ (0, G.jsx)("input", {
							type: "range",
							min: i,
							max: a,
							step: o,
							value: j[r],
							style: Q(j[r], i, a),
							disabled: !e || t,
							...ie,
							onChange: (e) => h({ [r]: Number(e.target.value) })
						}),
						/* @__PURE__ */ (0, G.jsx)("em", { children: r === "rotation" ? `${j[r]}°` : j[r].toFixed(2) })
					]
				}, r))]
			}), Tt.map((e) => /* @__PURE__ */ (0, G.jsx)("div", {
				className: "video-editor-inspect-group pending",
				children: /* @__PURE__ */ (0, G.jsxs)("div", {
					className: "video-editor-inspect-title",
					children: [k(e), /* @__PURE__ */ (0, G.jsx)("span", {
						className: "video-editor-inspect-badge",
						children: k("规划中")
					})]
				})
			}, e))] }),
			se === "audio" && /* @__PURE__ */ (0, G.jsxs)("div", {
				className: "video-editor-inspect-group",
				children: [/* @__PURE__ */ (0, G.jsx)("div", {
					className: "video-editor-inspect-title",
					children: k("音量")
				}), /* @__PURE__ */ (0, G.jsxs)("label", {
					className: "video-editor-inspect-slider",
					children: [
						/* @__PURE__ */ (0, G.jsx)("span", { children: k("片段增益") }),
						/* @__PURE__ */ (0, G.jsx)("input", {
							type: "range",
							min: 0,
							max: 2,
							step: .05,
							value: e?.volume ?? 1,
							style: Q(e?.volume ?? 1, 0, 2),
							disabled: !e || t,
							...ie,
							onChange: (e) => _(Number(e.target.value))
						}),
						/* @__PURE__ */ (0, G.jsxs)("em", { children: [((e?.volume ?? 1) * 100).toFixed(0), "%"] })
					]
				})]
			}),
			se === "export" && /* @__PURE__ */ (0, G.jsxs)(G.Fragment, { children: [/* @__PURE__ */ (0, G.jsxs)("div", {
				className: "video-editor-inspect-group",
				children: [
					/* @__PURE__ */ (0, G.jsx)("div", {
						className: "video-editor-inspect-title",
						children: k("导出")
					}),
					/* @__PURE__ */ (0, G.jsxs)("div", {
						className: "video-editor-inspect-row",
						children: [/* @__PURE__ */ (0, G.jsx)("span", { children: k("方式") }), /* @__PURE__ */ (0, G.jsx)("span", { children: k(s ? "合成（重编码）" : "无损直通") })]
					}),
					c && /* @__PURE__ */ (0, G.jsx)("div", {
						className: "video-editor-inspect-hint",
						children: k("素材分辨率或编码不一致，无法直通拼接，将归一到同一画布导出")
					}),
					/* @__PURE__ */ (0, G.jsxs)("div", {
						className: "video-editor-inspect-row",
						children: [/* @__PURE__ */ (0, G.jsx)("span", { children: k("画布") }), /* @__PURE__ */ (0, G.jsxs)("span", { children: [
							o.width,
							"×",
							o.height
						] })]
					}),
					/* @__PURE__ */ (0, G.jsxs)("label", {
						className: "video-editor-inspect-slider",
						children: [/* @__PURE__ */ (0, G.jsx)("span", { children: k("分辨率") }), /* @__PURE__ */ (0, G.jsxs)("select", {
							value: d,
							disabled: !s,
							onChange: (e) => f(Number(e.target.value)),
							children: [
								/* @__PURE__ */ (0, G.jsx)("option", {
									value: 1,
									children: k("原始")
								}),
								/* @__PURE__ */ (0, G.jsx)("option", {
									value: .5,
									children: "50%"
								}),
								/* @__PURE__ */ (0, G.jsx)("option", {
									value: .25,
									children: "25%"
								})
							]
						})]
					}),
					/* @__PURE__ */ (0, G.jsxs)("label", {
						className: "video-editor-inspect-slider",
						children: [/* @__PURE__ */ (0, G.jsx)("span", { children: k("帧率") }), /* @__PURE__ */ (0, G.jsx)("select", {
							value: l,
							disabled: !s,
							onChange: (e) => u(Number(e.target.value)),
							children: [
								24,
								25,
								30,
								50,
								60
							].map((e) => /* @__PURE__ */ (0, G.jsxs)("option", {
								value: e,
								children: [e, " fps"]
							}, e))
						})]
					})
				]
			}), /* @__PURE__ */ (0, G.jsx)(dt, {})] })
		]
	});
}
var Dt = (0, R.memo)(Et);
//#endregion
//#region src/components/videoEditor/useTimelineHistory.ts
function Ot() {
	let [e, t] = (0, R.useState)([]), [n, r] = (0, R.useState)([]), i = (0, R.useRef)(!1), a = (0, R.useCallback)((e) => {
		t((t) => [...t, e].slice(-50)), r([]);
	}, []), o = (0, R.useCallback)((e) => {
		i.current = !1, a(e);
	}, [a]), s = (0, R.useCallback)((e) => {
		i.current || (i.current = !0, a(e));
	}, [a]), c = (0, R.useCallback)(() => {
		i.current = !1;
	}, []), l = (0, R.useCallback)((n) => {
		if (i.current = !1, e.length === 0) return null;
		let a = e[e.length - 1];
		return t((e) => e.slice(0, -1)), r((e) => [...e, n]), a;
	}, [e]), u = (0, R.useCallback)((e) => {
		if (i.current = !1, n.length === 0) return null;
		let a = n[n.length - 1];
		return r((e) => e.slice(0, -1)), t((t) => [...t, e]), a;
	}, [n]), d = (0, R.useCallback)(() => {
		i.current = !1, t([]), r([]);
	}, []);
	return {
		canUndo: e.length > 0,
		canRedo: n.length > 0,
		commit: o,
		begin: s,
		end: c,
		undo: l,
		redo: u,
		reset: d
	};
}
//#endregion
//#region src/components/videoEditor/VideoEditorWindow.tsx
var kt = .02, At = 256 * 1024 * 1024;
async function jt(e, t, n) {
	let r = await fetch(e);
	if (!r.ok) throw Error(`读取图片素材失败：HTTP ${r.status}`);
	let i = await r.blob(), a = await ae(i);
	if (!a) throw RangeError("无法在解码前确认图片素材尺寸，请先转换为 PNG、JPEG、WebP、GIF、BMP 或带固定尺寸的 SVG");
	let o = a.width * a.height * 4;
	if (!Number.isSafeInteger(o) || o < 1 || t + o > At) {
		let e = Math.ceil((t + Math.max(0, o)) / (1024 * 1024));
		throw RangeError(`图片素材解码后累计约 ${e} MiB，超过视频合成 256 MiB 安全上限，请减少大图贴图或先降低分辨率`);
	}
	let s = Math.min(1, n.width / a.width, n.height / a.height), c = Math.max(1, Math.round(a.width * s)), l = Math.max(1, Math.round(a.height * s)), u = await createImageBitmap(i, {
		imageOrientation: "from-image",
		resizeWidth: c,
		resizeHeight: l,
		resizeQuality: "high"
	}), d = u.width * u.height * 4;
	if (!Number.isSafeInteger(d) || d < 1 || t + d > At) {
		u.close();
		let e = Math.ceil((t + Math.max(0, d)) / (1024 * 1024));
		throw RangeError(`图片素材解码后累计约 ${e} MiB，超过视频合成 256 MiB 安全上限，请减少大图贴图或先降低分辨率`);
	}
	return {
		bitmap: u,
		bytes: d
	};
}
function Mt(e) {
	let t = /* @__PURE__ */ new Set();
	for (let n of e) {
		let e = n.bitmap;
		!e || t.has(e) || (t.add(e), e.close());
	}
}
function Nt(e) {
	if (!Array.isArray(e)) return [];
	let t = [];
	for (let n of e) {
		if (!n || typeof n != "object") continue;
		let e = n, r = e.data;
		if (!r || typeof r != "object") continue;
		let i = r;
		if (i.type !== "ai-image") continue;
		let a = [
			i.imageUrl,
			i.thumbnailUrl,
			i.output
		].find((e) => typeof e == "string" && e.trim().length > 0);
		a && t.push({
			nodeId: typeof e.id == "string" ? e.id : `image-${t.length + 1}`,
			label: typeof i.label == "string" && i.label.trim() ? i.label.trim() : `图片 ${t.length + 1}`,
			sourceUrl: a,
			filePath: typeof i.filePath == "string" ? i.filePath : void 0,
			assetId: typeof i.assetId == "string" ? i.assetId : void 0
		});
	}
	return t;
}
function Pt(e, t) {
	let n = t.kind === "text" ? "文字" : "贴图", r = e.findIndex((e) => e.kind === "video" && e.overlay && (e.name === n || e.name === "文字与贴图" && e.clips.every((e) => e.kind === t.kind)));
	if (r >= 0) return e.map((e, n) => n === r ? {
		...e,
		clips: [...e.clips, t]
	} : e);
	let i = Ee("video", e);
	return i.name = n, i.clips = [t], [...e, i];
}
function Ft(e, t) {
	return t instanceof Error ? {
		stage: e,
		message: `${t.name}: ${t.message}`,
		detail: t.stack || `${t.name}: ${t.message}`
	} : {
		stage: e,
		message: String(t),
		detail: String(t)
	};
}
async function It(e, t) {
	try {
		return await t();
	} catch (t) {
		if (t instanceof ce) throw t;
		let n = Ft(e, t), r = /* @__PURE__ */ Error(`${e}：${n.message}`);
		throw r.stack = n.detail, r;
	}
}
function Lt({ failure: e, fallback: t, copyDetailsLabel: n, stackLabel: r, failedSuffix: i }) {
	if (!e) return /* @__PURE__ */ (0, G.jsx)("span", { children: t });
	let a = `[${e.stage}] ${e.message}\n${e.detail}`;
	return /* @__PURE__ */ (0, G.jsxs)("div", {
		className: "video-editor-failure",
		children: [/* @__PURE__ */ (0, G.jsxs)("div", {
			className: "video-editor-failure-line",
			children: [
				/* @__PURE__ */ (0, G.jsxs)("strong", { children: [e.stage, i] }),
				e.message,
				/* @__PURE__ */ (0, G.jsx)("button", {
					type: "button",
					className: "video-editor-failure-copy",
					onClick: () => {
						navigator.clipboard?.writeText(a).catch(() => {});
					},
					children: n
				})
			]
		}), e.detail && e.detail !== e.message && /* @__PURE__ */ (0, G.jsxs)("details", {
			className: "video-editor-failure-detail",
			children: [/* @__PURE__ */ (0, G.jsx)("summary", { children: r }), /* @__PURE__ */ (0, G.jsx)("pre", { children: e.detail })]
		})]
	});
}
function Rt() {
	let e = new URLSearchParams(window.location.search), t = e.get("instanceId")?.trim(), n = e.get("projectId")?.trim(), r = e.get("nodeId")?.trim();
	return !t || !n || !r ? null : {
		instanceId: t,
		projectId: n,
		nodeId: r,
		theme: e.get("theme") === "light" ? "light" : "dark"
	};
}
function $() {
	let e = r(), t = (0, R.useMemo)(() => Rt(), []), [n, a] = (0, R.useState)(t ? "loading" : "error"), [u, m] = (0, R.useState)(t ? null : {
		stage: "启动",
		message: e("缺少必要的会话参数，无法打开编辑器"),
		detail: ""
	}), [_, y] = (0, R.useState)(null), [b, C] = (0, R.useState)([]), [ae, N] = (0, R.useState)([]), [I, me] = (0, R.useState)(!1), [ge, ve] = (0, R.useState)(!1), [z, V] = (0, R.useState)([]), [we, Te] = (0, R.useState)(!0), [H, U] = (0, R.useState)(0), [Oe, W] = (0, R.useState)(null), [ke, Ae] = (0, R.useState)(!1), [je, Me] = (0, R.useState)(0), [Ne, Pe] = (0, R.useState)(null), [Fe, Ie] = (0, R.useState)(30), [Le, Re] = (0, R.useState)(!1), [ze, Be] = (0, R.useState)(1), Ve = (0, R.useRef)(null), [He, Ue] = (0, R.useState)([]), [We, Ge] = (0, R.useState)(null), [Ke, qe] = (0, R.useState)(null), [Je, Xe] = (0, R.useState)(!1), Ze = (0, R.useRef)(null), [Qe, $e] = (0, R.useState)("properties"), q = (0, R.useMemo)(() => _?.tracks ?? [], [_]), J = S(q), tt = (0, R.useMemo)(() => J?.clips ?? [], [J]), nt = (0, R.useMemo)(() => q.filter((e) => e.kind === "video").flatMap((e) => e.clips), [q]), rt = (0, R.useMemo)(() => nt.filter((e) => e.kind !== "text"), [nt]), it = (0, R.useMemo)(() => q.flatMap((e) => e.clips), [q]), at = (0, R.useCallback)((e) => {
		y((t) => {
			if (!t) return t;
			let n = {
				...t,
				tracks: e,
				updatedAt: Date.now()
			};
			return o(n).catch((e) => {
				console.error("[videoEditor] 工程保存失败:", e);
			}), n;
		});
	}, []), Y = (0, R.useCallback)((e) => {
		y((t) => {
			if (!t) return t;
			let n = e(t.tracks);
			if (n === t.tracks) return t;
			let r = {
				...t,
				tracks: n,
				updatedAt: Date.now()
			};
			return o(r).catch((e) => {
				console.error("[videoEditor] 工程保存失败:", e);
			}), r;
		});
	}, []), { getSource: ct } = et(rt, (0, R.useCallback)((e, t) => {
		t.duration <= 0 || y((n) => {
			if (!n) return n;
			let r = !1, i = n.tracks.map((n) => {
				if (n.kind !== "video") return n;
				let i = !1, a = n.clips.map((n) => n.sourceOut > 0 || K(n) !== e ? n : (r = !0, i = !0, {
					...n,
					sourceOut: t.duration
				}));
				return i ? {
					...n,
					clips: n.overlay ? a : v(a)
				} : n;
			});
			if (!r) return n;
			let a = {
				...n,
				tracks: i,
				updatedAt: Date.now()
			};
			return o(a).catch((e) => {
				console.error("[videoEditor] 工程保存失败:", e);
			}), a;
		});
	}, [])), X = g(q), lt = l(tt, H)?.clip ?? tt[0] ?? null, ut = lt ? K(lt) : "", dt = lt ? ct(lt)?.probe ?? null : null, ft = it.find((e) => e.id === z[0]) ?? null, pt = ft ?? lt, mt = pt ? be(q, pt.id) : !1, ht = pt ? ct(pt)?.probe ?? null : null, gt = (pt ? tt.findIndex((e) => e.id === pt.id) : -1) > 0 && !J?.locked, _t = tt.map((e) => ct(e)?.probe).find((e) => e && e.width > 0 && e.height > 0), vt = _t?.width || 1920, yt = _t?.height || 1080, Z = (0, R.useMemo)(() => ze === 1 ? {
		width: vt,
		height: yt
	} : {
		width: Math.max(2, Math.round(vt * ze / 2) * 2),
		height: Math.max(2, Math.round(yt * ze / 2) * 2)
	}, [
		yt,
		vt,
		ze
	]), bt = d(tt.map((e) => {
		let t = ct(e)?.probe;
		return t && {
			codec: t.videoCodec,
			width: t.width,
			height: t.height
		};
	})), xt = p(q) || bt;
	(0, R.useEffect)(() => {
		if (!t) return;
		let e = !0;
		return (async () => {
			try {
				let n = await D();
				if (document.documentElement.setAttribute("data-theme", n?.theme === "light" ? "light" : t.theme), document.documentElement.toggleAttribute("data-native-cursor", n?.customCursor === !1), i(n?.language), w(n?.baseDataDir), await E(n ?? {}), T(await j()), !e) return;
				let [r, o, l, u] = await Promise.all([
					te(t.projectId),
					A(t.projectId),
					re(),
					ne(n?.assetFolders ?? [])
				]);
				if (!e) return;
				C(Nt(r?.nodes));
				let d = /* @__PURE__ */ new Set();
				N([
					...o,
					...l,
					...u
				].filter((e) => e.category !== "image" && e.category !== "video" || !e.path || d.has(e.path) ? !1 : (d.add(e.path), !0)));
				let f = await s(c(t.projectId, t.nodeId));
				if (!f) throw Error("未找到该节点的剪辑工程");
				if (!e) return;
				y(f), a("ready"), P(t.instanceId).catch(() => {});
			} catch (t) {
				if (!e) return;
				m(Ft("载入", t)), a("error"), console.error("[videoEditor] 载入失败:", t);
			}
		})(), () => {
			e = !1;
		};
	}, [t]);
	let St = Ot(), Ct = St.begin, wt = St.end, Tt = St.commit, Q = (0, R.useRef)(q);
	(0, R.useEffect)(() => {
		Q.current = q;
	}, [q]);
	let Et = (0, R.useCallback)(() => {
		Ct(Q.current);
	}, [Ct]), At = (0, R.useCallback)(() => {
		wt();
	}, [wt]), $ = (0, R.useCallback)(() => {
		Tt(Q.current);
	}, [Tt]), zt = (0, R.useCallback)(() => {
		let e = St.undo(Q.current);
		e && at(e);
	}, [St, at]), Bt = (0, R.useCallback)(() => {
		let e = St.redo(Q.current);
		e && at(e);
	}, [St, at]), Vt = (0, R.useCallback)((e, t, n) => {
		be(Q.current, e) || Y((r) => B(r, e, (e) => ({
			...e,
			sourceIn: t,
			sourceOut: n
		})));
	}, [Y]), Ht = (0, R.useCallback)(() => {
		if (!J) return;
		if (J.locked) {
			W(e("轨道已锁定，无法分割片段"));
			return;
		}
		let t = h(J.clips, H);
		if (!t) {
			W(e("当前播放头不在可分割的位置"));
			return;
		}
		W(null), $(), Y((e) => e.map((e) => e.id === J.id ? {
			...e,
			clips: t
		} : e));
	}, [
		$,
		H,
		e,
		Y,
		J
	]), Ut = (0, R.useCallback)(() => {
		if (z.length === 0) return;
		let t = z.filter((e) => !be(Q.current, e));
		if (t.length === 0) {
			W(e("选中片段所在轨道已锁定"));
			return;
		}
		let n = new Set(t);
		if (nt.filter((e) => e.kind !== "text" && !n.has(e.id)).length === 0) {
			W(e("至少要保留一个片段"));
			return;
		}
		W(null), $(), Y((e) => Ce(e, t)), V((e) => e.filter((e) => !n.has(e)));
	}, [
		nt,
		$,
		z,
		e,
		Y
	]), Wt = (0, R.useCallback)((t) => {
		if (be(Q.current, t)) {
			W(e("轨道已锁定，无法复制片段"));
			return;
		}
		W(null), $(), Y((e) => Se(e, t));
	}, [
		$,
		e,
		Y
	]), Gt = (0, R.useCallback)((e) => {
		let t = z[0] ?? lt?.id;
		t && (be(Q.current, t) || Y((n) => B(n, t, e)));
	}, [
		lt?.id,
		z,
		Y
	]), Kt = (0, R.useCallback)((e, t) => {
		be(Q.current, e) || Y((n) => B(n, e, t));
	}, [Y]), qt = (0, R.useCallback)(() => {
		let e = Math.max(.1, X), t = Math.min(Math.max(0, H), Math.max(0, e - .1));
		return {
			timelineStart: t,
			sourceIn: 0,
			sourceOut: Math.max(.1, Math.min(3, e - t))
		};
	}, [H, X]), Jt = (0, R.useCallback)(() => {
		let e = `text-${Date.now().toString(36)}`, t = {
			id: e,
			kind: "text",
			fileName: f.content,
			...qt(),
			transform: { ...x },
			textStyle: { ...f }
		};
		$(), Y((e) => Pt(e, t)), V([e]);
	}, [
		$,
		qt,
		Y
	]), Yt = (0, R.useCallback)((e) => {
		let t = `sticker-${Date.now().toString(36)}`, n = {
			id: t,
			kind: "image",
			fileName: e.label,
			nodeId: e.nodeId,
			sourceUrl: e.sourceUrl,
			filePath: e.filePath,
			assetId: e.assetId,
			...qt(),
			transform: {
				...x,
				scale: .32
			}
		};
		$(), Y((e) => Pt(e, n)), V([t]);
	}, [
		$,
		qt,
		Y
	]), Xt = (0, R.useCallback)(async () => {
		if (!(!_ || ge)) {
			ve(!0), W(null);
			try {
				let e = await O(".png,.jpg,.jpeg,.webp,.gif", _.projectId);
				if (!e) return;
				let t = {
					nodeId: `local-${Date.now().toString(36)}`,
					label: e.fileName,
					sourceUrl: e.dataUrl,
					filePath: e.filePath
				};
				C((e) => [t, ...e]), Yt(t);
			} catch (t) {
				W(t instanceof Error ? e("贴图导入失败：{message}", { message: t.message }) : e("贴图导入失败"));
			} finally {
				ve(!1);
			}
		}
	}, [
		Yt,
		_,
		e,
		ge
	]), Zt = (0, R.useCallback)((e) => {
		let t = `media-${Date.now().toString(36)}`, n = {
			id: t,
			kind: "video",
			fileName: e.fileName,
			filePath: e.filePath,
			sourceUrl: e.sourceUrl,
			assetId: e.assetId,
			timelineStart: 0,
			sourceIn: 0,
			sourceOut: 0
		};
		$(), Y((e) => {
			let t = S(e);
			return t ? e.map((e) => e.id === t.id ? {
				...e,
				clips: v([...e.clips, n])
			} : e) : e;
		}), V([t]);
	}, [$, Y]), Qt = (0, R.useCallback)((e) => {
		if (W(null), e.category === "image") {
			Yt({
				nodeId: `asset-${e.assetId ?? Date.now().toString(36)}`,
				label: e.name,
				sourceUrl: e.assetUrl ?? "",
				filePath: e.path,
				assetId: e.assetId
			});
			return;
		}
		Zt({
			fileName: e.name,
			filePath: e.path,
			sourceUrl: e.assetUrl,
			assetId: e.assetId
		});
	}, [Yt, Zt]), $t = (0, R.useCallback)(async () => {
		if (!(!_ || I)) {
			me(!0), W(null);
			try {
				let e = await O(".mp4,.mov,.m4v,.webm,.avi,.mkv,.png,.jpg,.jpeg,.webp,.gif", _.projectId);
				if (!e) return;
				/\.(?:png|jpe?g|webp|gif)$/i.test(e.fileName) ? Yt({
					nodeId: `local-${Date.now().toString(36)}`,
					label: e.fileName,
					sourceUrl: e.dataUrl,
					filePath: e.filePath
				}) : Zt({
					fileName: e.fileName,
					filePath: e.filePath,
					sourceUrl: e.dataUrl
				});
			} catch (t) {
				W(t instanceof Error ? e("素材导入失败：{message}", { message: t.message }) : e("素材导入失败"));
			} finally {
				me(!1);
			}
		}
	}, [
		I,
		Yt,
		Zt,
		_,
		e
	]), en = (0, R.useCallback)((e) => {
		Gt((t) => {
			if (t.kind !== "text") return t;
			let n = {
				...f,
				...t.textStyle,
				...e
			};
			return {
				...t,
				fileName: n.content.trim() || "文字",
				textStyle: n
			};
		});
	}, [Gt]), tn = (0, R.useCallback)((e) => {
		$(), at([...Q.current, Ee(e, Q.current)]);
	}, [$, at]), nn = (0, R.useCallback)((t, n) => {
		if (ye(Q.current, t)) {
			W(e("请先解锁轨道再调整层级"));
			return;
		}
		W(null), $(), at(De(Q.current, t, n));
	}, [
		$,
		at,
		e
	]), rn = (0, R.useCallback)((e, t) => {
		J && (J.locked || be(Q.current, e) || Y((n) => n.map((n) => n.id === J.id ? {
			...n,
			clips: xe(n.clips, e, t)
		} : n)));
	}, [Y, J]), an = (0, R.useCallback)((e, t, n, r) => {
		y((i) => {
			if (!i) return i;
			let a = i.tracks.find((e) => e.id === t), s = i.tracks.find((e) => e.id === n);
			if (!a || !s || a.locked || s.locked) return i;
			let c = a.clips.findIndex((t) => t.id === e);
			if (c < 0) return i;
			let l = a.clips[c], u = i.tracks.map((i) => {
				if (i.id === t) {
					let t = i.clips.filter((t) => t.id !== e);
					return {
						...i,
						clips: i.overlay ? t : v(t)
					};
				}
				if (i.id === n) {
					if (i.overlay) return {
						...i,
						clips: [...i.clips, {
							...l,
							timelineStart: Math.max(0, r)
						}]
					};
					let e = [...i.clips];
					return e.splice(Math.min(r, e.length), 0, l), {
						...i,
						clips: v(e)
					};
				}
				return i;
			}), d = {
				...i,
				tracks: u,
				updatedAt: Date.now()
			};
			return o(d).catch((e) => {
				console.error("[videoEditor] 工程保存失败:", e);
			}), d;
		});
	}, []), on = (0, R.useCallback)((e, t, n) => {
		y((r) => {
			if (!r || ye(r.tracks, t)) return r;
			let i = r.tracks.map((r) => r.id === t ? {
				...r,
				clips: r.clips.map((t) => t.id === e ? {
					...t,
					timelineStart: Math.max(0, n)
				} : t)
			} : r), a = {
				...r,
				tracks: i,
				updatedAt: Date.now()
			};
			return o(a).catch((e) => {
				console.error("[videoEditor] 工程保存失败:", e);
			}), a;
		});
	}, []), sn = (0, R.useCallback)((e, t, n) => {
		y((r) => {
			if (!r) return r;
			let i = r.tracks.find((e) => e.id === t);
			if (!i || i.locked) return r;
			let a = i.clips.findIndex((t) => t.id === e);
			if (a < 0) return r;
			let s = i.clips[a], c = Ee("video", r.tracks), l = r.tracks.map((n) => {
				if (n.id === t) {
					let t = n.clips.filter((t) => t.id !== e);
					return {
						...n,
						clips: n.overlay ? t : v(t)
					};
				}
				return n;
			});
			c.clips = [{
				...s,
				timelineStart: Math.max(0, n)
			}];
			let u = {
				...r,
				tracks: [...l, c],
				updatedAt: Date.now()
			};
			return o(u).catch((e) => {
				console.error("[videoEditor] 工程保存失败:", e);
			}), u;
		});
	}, []), cn = !!J && !J.locked && !!l(tt, H);
	(0, R.useEffect)(() => {
		if (n !== "ready") return;
		let e = (e) => {
			if (e.target?.closest("input, textarea, select, button, [contenteditable=\"true\"]")) return;
			let t = e.metaKey || e.ctrlKey;
			if (t && (e.key === "z" || e.key === "Z")) {
				e.preventDefault(), e.shiftKey ? Bt() : zt();
				return;
			}
			if (t && (e.key === "y" || e.key === "Y")) {
				e.preventDefault(), Bt();
				return;
			}
			if (t && (e.key === "d" || e.key === "D")) {
				e.preventDefault(), z[0] && Wt(z[0]);
				return;
			}
			if (t && (e.key === "a" || e.key === "A")) {
				e.preventDefault(), V(q.flatMap((e) => e.clips.map((e) => e.id)));
				return;
			}
			t || (e.key === "s" || e.key === "S" ? (e.preventDefault(), Ht()) : e.key === "Delete" || e.key === "Backspace" ? (e.preventDefault(), Ut()) : e.key === "ArrowLeft" ? (e.preventDefault(), U((t) => Math.max(0, t - (e.shiftKey ? 1 : 1 / 30)))) : e.key === "ArrowRight" ? (e.preventDefault(), U((t) => Math.min(X, t + (e.shiftKey ? 1 : 1 / 30)))) : e.key === "Home" ? (e.preventDefault(), U(0)) : e.key === "End" ? (e.preventDefault(), U(X)) : e.key === "Escape" && V([]));
		};
		return window.addEventListener("keydown", e), () => window.removeEventListener("keydown", e);
	}, [
		Ut,
		Wt,
		Bt,
		Ht,
		zt,
		n,
		z,
		X,
		q
	]);
	let ln = (0, R.useCallback)(async (n) => {
		if (!t || !_) return;
		let r = q.flatMap((e) => e.hidden ? [] : e.clips);
		if (r.length === 0) return;
		let i = new AbortController();
		Ve.current = i, Ae(!0), Me(0), m(null), W(null), Pe(null);
		let a = [];
		try {
			let o = /* @__PURE__ */ new Map();
			await It("打开素材", async () => {
				for (let e of r) {
					if (e.kind === "text" || e.kind === "image") continue;
					let t = K(e);
					if (!t || o.has(t)) continue;
					let n = await F(t);
					o.set(t, n), a.push(n);
				}
			});
			let s = (e) => o.get(K(e)), c, l = [], u = null, d = async () => {
				let t = /* @__PURE__ */ new Map(), n = 0;
				try {
					return await It("准备合成", async () => {
						for (let [e, n] of o) {
							let r = await he(n);
							r && t.set(e, r);
						}
						for (let e of r) {
							if (e.kind !== "image") continue;
							let r = K(e);
							if (!r || t.has(r)) continue;
							let i = await jt(r, n, Z);
							n += i.bytes, t.set(r, {
								bitmap: i.bitmap,
								width: i.bitmap.width,
								height: i.bitmap.height
							});
						}
					}), await It("合成导出", () => fe({
						tracks: q,
						duration: X,
						canvas: Z,
						frameRate: Fe,
						resolveVideo: (e) => t.get(K(e)),
						resolveAudio: s,
						onProgress: Me,
						onStage: Pe,
						onAudioMode: (t, n) => {
							u = t === "encode" ? e("音频已重新混流（AAC）") : t === "copy" ? e("音频以原始分组直通保留，未重编码") : t === "pcm" ? e("音频已混流为未压缩 PCM 音轨：{reason}", { reason: n ?? "" }) : e("未输出音轨：{reason}", { reason: n ?? e("无可用音频") });
						},
						signal: i.signal
					}));
				} finally {
					Mt(t.values());
				}
			};
			if (xt) c = await d(), l.push(e("已合成导出 {count} 个片段 · {width}×{height} · {fps}fps", {
				count: r.length,
				width: Z.width,
				height: Z.height,
				fps: Fe
			})), bt && l.push(e("素材分辨率或编码不一致，已归一到同一画布")), l.push(e("画面经过一次重编码")), u && l.push(u);
			else {
				let t = tt.map((e) => ({
					input: s(e),
					start: e.sourceIn,
					end: e.sourceOut,
					label: e.fileName
				}));
				try {
					let n = await It("无损裁剪导出", () => L({
						segments: t,
						onProgress: Me,
						signal: i.signal
					}));
					c = n.bytes;
					let r = tt[0].sourceIn - n.actualStart;
					l.push(e("已无损导出 {count} 个片段，共 {time}s", {
						count: tt.length,
						time: X.toFixed(2)
					})), r > .05 && l.push(e("首段按关键帧对齐，实际入点 {actual}s（比设定早 {drift}s）", {
						actual: n.actualStart.toFixed(2),
						drift: r.toFixed(2)
					})), l.push(n.audioKept ? e("音轨已按原始分组直通保留") : e("未输出音轨：{reason}", { reason: n.audioDropReason ?? e("未知原因") }));
				} catch (t) {
					if (t instanceof ce) throw t;
					console.warn("[videoEditor] 无损直通不可用，改走合成:", t), Me(0), c = await d(), l.push(e("无损直通不可用，已改用合成导出 · {width}×{height} · {fps}fps", {
						width: Z.width,
						height: Z.height,
						fps: Fe
					})), u && l.push(u), l.push(t instanceof Error ? t.message : String(t));
				}
			}
			let f = ee(_.name, "mp4", "edited");
			if (n === "local") {
				if (!await It("保存到本地", () => ie(c, f))) {
					W(e("已取消保存到本地"));
					return;
				}
				l.push(e("已保存到本地：{fileName}", { fileName: f }));
			} else {
				let n = await It("写入项目目录", async () => {
					let e = await k(c, _.projectId, f);
					if (!e) throw Error("项目数据目录不可写");
					return e;
				});
				await It("输出到画布", () => le(t.instanceId, {
					videoUrl: n.assetUrl,
					filePath: n.filePath,
					fileName: f,
					duration: X,
					width: xt ? Z.width : _t?.width ?? 0,
					height: xt ? Z.height : _t?.height ?? 0
				})), l.push(e("已创建画布视频节点"));
			}
			W(l.join("；"));
		} catch (e) {
			e instanceof ce || (m(Ft("导出", e)), console.error("[videoEditor] 导出失败:", e));
		} finally {
			a.forEach((e) => e.dispose()), Ve.current = null, Ae(!1), Me(0), Pe(null);
		}
	}, [
		Z,
		tt,
		xt,
		Fe,
		_t?.height,
		_t?.width,
		bt,
		_,
		t,
		e,
		X,
		q
	]), un = (0, R.useCallback)(async (e, t, n) => {
		let r = n ?? Q.current, i = _e(r, e);
		if (i.length === 0) throw Error("时间轴上没有可渲染的片段");
		let a = [], o = /* @__PURE__ */ new Map(), s = 0, c = null;
		try {
			await It(`准备${t}`, async () => {
				for (let e of i) {
					if (e.kind === "text") continue;
					let t = K(e);
					if (!t || o.has(t)) continue;
					if (e.kind === "image") {
						let e = await jt(t, s, Z);
						s += e.bytes, o.set(t, {
							bitmap: e.bitmap,
							width: e.bitmap.width,
							height: e.bitmap.height
						});
						continue;
					}
					let n = await F(t);
					a.push(n);
					let r = await he(n);
					r && o.set(t, r);
				}
			}), c = document.createElement("canvas");
			let n = c;
			n.width = Z.width, n.height = Z.height;
			let l = n.getContext("2d");
			if (!l) throw Error("画布上下文不可用");
			return await It(`渲染${t}`, () => oe(l, Z, r, e, (e) => o.get(K(e)))), await It(`编码${t}`, async () => {
				let e = await new Promise((e) => {
					n.toBlob((t) => e(t), "image/png");
				});
				if (!e) throw Error(`${t}编码失败`);
				return new Uint8Array(await e.arrayBuffer());
			});
		} finally {
			Mt(o.values()), a.forEach((e) => e.dispose()), c && (c.width = 1, c.height = 1);
		}
	}, [Z]), dn = (0, R.useCallback)(async () => {
		if (!(!t || !_ || ke || Le) && it.length !== 0) {
			Re(!0), m(null), W(null);
			try {
				let n = await un(H, "当前帧"), r = `${Math.round(H * 1e3)}ms`, i = ee(`${_.name} 帧${r}`, "png", `frame-${r}`), a = await It("写入项目目录", async () => {
					let e = await k(n, _.projectId, i);
					if (!e) throw Error("项目数据目录不可写");
					return e;
				});
				await It("输出到画布", () => se(t.instanceId, {
					imageUrl: a.assetUrl,
					filePath: a.filePath,
					fileName: i,
					time: H,
					width: Z.width,
					height: Z.height
				})), W(e("已导出 {time}s 的画面为图片节点 · {width}×{height}", {
					time: H.toFixed(2),
					width: Z.width,
					height: Z.height
				}));
			} catch (e) {
				m(Ft("导出当前帧", e)), console.error("[videoEditor] 导出当前帧失败:", e);
			} finally {
				Re(!1);
			}
		}
	}, [
		it.length,
		Z,
		ke,
		Le,
		H,
		_,
		un,
		t,
		e
	]), fn = (0, R.useCallback)((e, t) => {
		let n = S(Q.current);
		if (!n || n.locked || !n.clips.some((t) => t.id === e)) return !1;
		let r = {
			id: `ai-transition-${Date.now().toString(36)}`,
			kind: "video",
			fileName: t.fileName,
			filePath: t.filePath,
			sourceUrl: t.videoUrl,
			timelineStart: 0,
			sourceIn: 0,
			sourceOut: 0
		};
		return $(), Y((t) => t.map((t) => {
			if (t.id !== n.id) return t;
			let i = t.clips.findIndex((t) => t.id === e);
			if (i < 0) return t;
			let a = [...t.clips];
			return a.splice(i, 0, r), {
				...t,
				clips: v(a)
			};
		})), V([r.id]), !0;
	}, [$, Y]);
	(0, R.useEffect)(() => {
		if (!t) return;
		let n = ue(t.instanceId, (t) => {
			if (t.type === "storyai:video-editor-models") {
				let e = t.payload?.models;
				Ue(Array.isArray(e) ? e : []);
				return;
			}
			if (t.type !== "storyai:video-editor-ai-transition-result") return;
			let n = t.payload ?? {}, r = Ze.current;
			if (!r || n.requestId !== r.requestId) return;
			if (Ze.current = null, Xe(!1), Ge(null), n.error || !n.videoUrl) {
				qe(n.error || e("AI 转场生成失败"));
				return;
			}
			let i = fn(r.beforeClipId, {
				videoUrl: n.videoUrl,
				filePath: typeof n.filePath == "string" ? n.filePath : void 0,
				fileName: n.fileName || "AI 转场"
			});
			qe(i ? null : e("转场已生成，但原片段已不在主轨上，未能插入")), i && W(e("AI 转场已插入主轨"));
		});
		return pe(t.instanceId).catch((e) => {
			console.error("[videoEditor] 请求视频模型列表失败:", e);
		}), n;
	}, [
		fn,
		t,
		e
	]);
	let pn = (0, R.useCallback)((e) => {
		let t = Q.current.flatMap((e) => e.clips).find((t) => t.id === e);
		if (!t) return;
		let n = t.transitionIn;
		(!n || n.kind === "none" || n.duration <= 0) && ($(), Y((t) => B(t, e, (e) => ({
			...e,
			transitionIn: {
				kind: "dissolve",
				duration: .5
			}
		})))), V([e]), $e("transition");
	}, [$, Y]), mn = (0, R.useCallback)(() => {
		t && pe(t.instanceId).catch((e) => {
			qe(e instanceof Error ? e.message : String(e));
		});
	}, [t]), hn = (0, R.useCallback)(async (n) => {
		if (!t || !_ || Je) return;
		let r = S(Q.current), i = z[0] ?? lt?.id, a = r ? r.clips.findIndex((e) => e.id === i) : -1;
		if (!r || a < 0) {
			qe(e("请先在主轨上选中一个片段"));
			return;
		}
		if (a === 0) {
			qe(e("首个片段之前没有画面可衔接，请选中第二段及之后的片段"));
			return;
		}
		if (r.locked) {
			qe(e("主轨已锁定，无法插入转场"));
			return;
		}
		let o = r.clips[a];
		Xe(!0), qe(null), m(null), Ge(e("正在取首尾帧…"));
		try {
			let r = Q.current.map((e) => ({
				...e,
				clips: e.clips.map((e) => e.transitionIn ? {
					...e,
					transitionIn: void 0
				} : e)
			})), i = o.timelineStart, a = await un(Math.max(0, i - kt), "转场首帧", r), s = await un(i + kt, "转场尾帧", r), c = Date.now().toString(36);
			Ge(e("正在暂存首尾帧…"));
			let l = await k(a, _.projectId, `AI转场首帧-${c}.png`), u = await k(s, _.projectId, `AI转场尾帧-${c}.png`);
			if (!l || !u) throw Error("项目数据目录不可写，无法暂存首尾帧");
			let d = `ait-${c}-${Math.random().toString(36).slice(2, 8)}`;
			Ze.current = {
				requestId: d,
				beforeClipId: o.id
			}, Ge(e("已提交主窗口，正在生成转场…")), await de(t.instanceId, {
				requestId: d,
				prompt: n.prompt,
				model: n.model,
				provider: n.provider,
				duration: n.duration,
				firstFrameUrl: l.assetUrl,
				firstFrameFilePath: l.filePath,
				lastFrameUrl: u.assetUrl,
				lastFrameFilePath: u.filePath
			});
		} catch (e) {
			Ze.current = null, Xe(!1), Ge(null), qe(e instanceof Error ? e.message : String(e)), console.error("[videoEditor] AI 转场提交失败:", e);
		}
	}, [
		lt?.id,
		Je,
		_,
		un,
		z,
		t,
		e
	]), gn = (0, R.useCallback)(async () => {
		let { getCurrentWindow: e } = await import("./window-Mv3S1g6R.js");
		await e().close();
	}, []), _n = (0, R.useCallback)(async () => {
		let { getCurrentWindow: e } = await import("./window-Mv3S1g6R.js");
		await e().minimize();
	}, []);
	return /* @__PURE__ */ (0, G.jsxs)("div", {
		className: "video-editor-root",
		children: [
			/* @__PURE__ */ (0, G.jsxs)("header", {
				className: "video-editor-header",
				"data-tauri-drag-region": !0,
				children: [
					/* @__PURE__ */ (0, G.jsx)("h1", {
						className: "video-editor-title",
						children: _?.name || e("视频编辑器")
					}),
					ht && /* @__PURE__ */ (0, G.jsxs)("span", {
						className: "video-editor-meta",
						children: [
							ht.width,
							"×",
							ht.height,
							" · ",
							nt.length,
							e("个片段"),
							" ·",
							" ",
							X.toFixed(2),
							"s"
						]
					}),
					/* @__PURE__ */ (0, G.jsxs)("div", {
						className: "video-editor-winctrls",
						children: [
							ke ? /* @__PURE__ */ (0, G.jsxs)(G.Fragment, { children: [/* @__PURE__ */ (0, G.jsxs)("span", {
								className: "video-editor-progress",
								children: [
									Ne ?? e("导出中"),
									" ",
									Math.round(je * 100),
									"%"
								]
							}), /* @__PURE__ */ (0, G.jsx)("button", {
								type: "button",
								className: "video-editor-btn",
								onClick: () => Ve.current?.abort(),
								children: e("取消")
							})] }) : /* @__PURE__ */ (0, G.jsxs)(G.Fragment, { children: [
								/* @__PURE__ */ (0, G.jsxs)("button", {
									type: "button",
									className: "video-editor-btn",
									onClick: () => {
										dn();
									},
									disabled: n !== "ready" || nt.length === 0 || Le,
									title: e("把播放头所在的画面导出为画布图片节点"),
									children: [/* @__PURE__ */ (0, G.jsx)(M, {
										icon: "lucide:image-down",
										width: 13,
										height: 13
									}), e(Le ? "导出当前帧…" : "导出当前帧")]
								}),
								/* @__PURE__ */ (0, G.jsxs)("button", {
									type: "button",
									className: "video-editor-btn",
									onClick: () => {
										ln("local");
									},
									disabled: n !== "ready" || nt.length === 0 || Le,
									children: [/* @__PURE__ */ (0, G.jsx)(M, {
										icon: "lucide:download",
										width: 13,
										height: 13
									}), e("导出到本地")]
								}),
								/* @__PURE__ */ (0, G.jsxs)("button", {
									type: "button",
									className: "video-editor-btn primary",
									onClick: () => {
										ln("canvas");
									},
									disabled: n !== "ready" || nt.length === 0 || Le,
									children: [/* @__PURE__ */ (0, G.jsx)(M, {
										icon: "lucide:upload",
										width: 13,
										height: 13
									}), e("导出为新节点")]
								})
							] }),
							/* @__PURE__ */ (0, G.jsx)("button", {
								type: "button",
								className: "video-editor-winbtn",
								onClick: () => {
									_n();
								},
								"aria-label": e("最小化"),
								children: /* @__PURE__ */ (0, G.jsx)("svg", {
									width: "10",
									height: "10",
									viewBox: "0 0 10 10",
									children: /* @__PURE__ */ (0, G.jsx)("rect", {
										x: "0",
										y: "5",
										width: "10",
										height: "1",
										fill: "currentColor"
									})
								})
							}),
							/* @__PURE__ */ (0, G.jsx)("button", {
								type: "button",
								className: "video-editor-winbtn close",
								onClick: () => {
									gn();
								},
								"aria-label": e("关闭"),
								children: /* @__PURE__ */ (0, G.jsxs)("svg", {
									width: "10",
									height: "10",
									viewBox: "0 0 10 10",
									children: [/* @__PURE__ */ (0, G.jsx)("line", {
										x1: "0",
										y1: "0",
										x2: "10",
										y2: "10",
										stroke: "currentColor",
										strokeWidth: "1.2"
									}), /* @__PURE__ */ (0, G.jsx)("line", {
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
			}),
			n === "error" && /* @__PURE__ */ (0, G.jsx)("div", {
				className: "video-editor-error",
				children: /* @__PURE__ */ (0, G.jsx)(Lt, {
					failure: u,
					fallback: e("编辑器加载失败"),
					copyDetailsLabel: e("复制详情"),
					stackLabel: e("调用栈"),
					failedSuffix: e("失败：")
				})
			}),
			n === "loading" && /* @__PURE__ */ (0, G.jsx)("div", {
				className: "video-editor-loading",
				children: e("正在载入素材…")
			}),
			n === "ready" && _ && /* @__PURE__ */ (0, G.jsxs)(G.Fragment, { children: [
				u && /* @__PURE__ */ (0, G.jsx)("div", {
					className: "video-editor-error inline",
					children: /* @__PURE__ */ (0, G.jsx)(Lt, {
						failure: u,
						fallback: e("导出失败"),
						copyDetailsLabel: e("复制详情"),
						stackLabel: e("调用栈"),
						failedSuffix: e("失败：")
					})
				}),
				Oe && /* @__PURE__ */ (0, G.jsx)("div", {
					className: "video-editor-notice",
					children: Oe
				}),
				/* @__PURE__ */ (0, G.jsxs)("div", {
					className: "video-editor-body",
					children: [
						/* @__PURE__ */ (0, G.jsx)(st, {
							clips: rt,
							getSource: ct,
							selectedClipId: z[0] ?? null,
							libraryAssets: ae,
							projectImages: b,
							addingMedia: I,
							uploadingSticker: ge,
							onSelectClip: (e) => V([e]),
							onAddLocal: () => {
								$t();
							},
							onAddLibraryAsset: Qt,
							onAddCanvasImage: Yt,
							onUploadSticker: () => {
								Xt();
							}
						}),
						/* @__PURE__ */ (0, G.jsx)(ot, {
							clip: lt,
							clipUrl: ut,
							playhead: H,
							timelineDuration: X,
							tracks: q,
							selectedClipIds: z,
							canvasSize: Z,
							sourceSize: dt ? {
								width: dt.width,
								height: dt.height
							} : null,
							onPlayheadChange: U,
							onSelectClips: V,
							onBeginInteraction: Et,
							onEndInteraction: At,
							onTransformChange: (e, t) => Kt(e, (e) => ({
								...e,
								transform: {
									...x,
									...e.transform,
									...t
								}
							}))
						}),
						/* @__PURE__ */ (0, G.jsx)(Dt, {
							clip: ft ?? lt,
							locked: mt,
							probe: ht,
							clipCount: nt.length,
							timelineDuration: X,
							canvasSize: Z,
							compositing: xt,
							mixedSources: bt,
							frameRate: Fe,
							onFrameRateChange: Ie,
							outputScale: ze,
							onOutputScaleChange: Be,
							onBeginInteraction: Et,
							onEndInteraction: At,
							onTransformChange: (e) => Gt((t) => ({
								...t,
								transform: {
									...x,
									...t.transform,
									...e
								}
							})),
							onTransitionChange: (e, t) => Gt((n) => ({
								...n,
								transitionIn: {
									kind: e,
									duration: t
								}
							})),
							onVolumeChange: (e) => Gt((t) => ({
								...t,
								volume: e
							})),
							onAddText: Jt,
							onPatchText: en,
							activeTab: Qe,
							onActiveTabChange: $e,
							aiModels: He,
							aiTransitionBusy: Je,
							aiTransitionStatus: We,
							aiTransitionError: Ke,
							canGenerateAiTransition: gt,
							onRefreshAiModels: mn,
							onGenerateAiTransition: (e) => {
								hn(e);
							}
						})
					]
				}),
				/* @__PURE__ */ (0, G.jsx)(Ye, {
					tracks: q,
					duration: X,
					playhead: H,
					selectedClipIds: z,
					getSource: ct,
					snapEnabled: we,
					onToggleSnap: () => Te((e) => !e),
					onPlayheadChange: U,
					onSelectClips: V,
					onTrimClip: Vt,
					onMoveClip: rn,
					onMoveClipToTrack: an,
					onMoveClipInOverlay: on,
					onCreateTrackAndMove: sn,
					onSplit: Ht,
					onDeleteSelected: Ut,
					onDuplicateClip: Wt,
					onEditTransition: pn,
					onTracksChange: at,
					onAddTrack: tn,
					onMoveTrack: nn,
					onBeginInteraction: Et,
					onEndInteraction: At,
					canSplit: cn,
					canUndo: St.canUndo,
					canRedo: St.canRedo,
					onUndo: zt,
					onRedo: Bt
				})
			] })
		]
	});
}
//#endregion
export { $ as default };
