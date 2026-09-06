import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./react-dom-BhFnNZvF.js";
import { t as r } from "./jsx-runtime-BAkIPmuO.js";
import { a as i, d as a, o, p as s, r as c } from "./ViewportImage-Dsz9jsTU.js";
import { Bt as l } from "./useTooltipAutoPlacement-BSvTkR9V.js";
import { c as u, o as d, s as f, u as p } from "./assetFormat-UuOoHpLo.js";
//#region node_modules/framer-motion/dist/es/value/use-motion-value.mjs
var m = /* @__PURE__ */ e(t(), 1);
function h(e) {
	let t = s(() => a(e)), { isStatic: n } = (0, m.useContext)(o);
	if (n) {
		let [, n] = (0, m.useState)(e);
		(0, m.useEffect)(() => t.on("change", n), []);
	}
	return t;
}
//#endregion
//#region node_modules/framer-motion/dist/es/gestures/drag/use-drag-controls.mjs
var g = class {
	constructor() {
		this.componentControls = /* @__PURE__ */ new Set();
	}
	subscribe(e) {
		return this.componentControls.add(e), () => this.componentControls.delete(e);
	}
	start(e, t) {
		this.componentControls.forEach((n) => {
			n.start(e.nativeEvent || e, t);
		});
	}
	cancel() {
		this.componentControls.forEach((e) => {
			e.cancel();
		});
	}
	stop() {
		this.componentControls.forEach((e) => {
			e.stop();
		});
	}
}, _ = () => new g();
function v() {
	return s(_);
}
//#endregion
//#region src/components/shared/ModalOverlay.tsx
var y = n(), b = r();
function x({ isOpen: e, onClose: t, children: n, ariaLabel: r, className: a = "", closeOnBackdrop: o = !0, draggable: s = !1, motionPreset: g = "spring", backdropBlur: _ = !0 }) {
	let x = l(), S = g === "quick", C = (0, m.useRef)(null), w = (0, m.useRef)(null), T = (0, m.useRef)(t), E = v(), D = h(0), O = h(0), k = (0, m.useCallback)(() => {
		let e = w.current;
		if (!e) return;
		let t = e.getBoundingClientRect(), n = 0, r = 0;
		t.left < 8 ? n = 8 - t.left : t.right > window.innerWidth - 8 && (n = window.innerWidth - 8 - t.right), t.top < 8 ? r = 8 - t.top : t.bottom > window.innerHeight - 8 && (r = window.innerHeight - 8 - t.bottom), n !== 0 && D.set(D.get() + n), r !== 0 && O.set(O.get() + r);
	}, [D, O]), A = (e) => {
		if (!s || e.button !== 0) return;
		let t = e.target instanceof HTMLElement ? e.target : null;
		!t?.closest("[data-modal-drag-handle]") || t?.closest("button, a, input, select, textarea, [role=\"button\"]") || (e.preventDefault(), E.start(e));
	};
	return (0, m.useEffect)(() => {
		T.current = t;
	}, [t]), (0, m.useEffect)(() => {
		if (!e || !s) {
			D.set(0), O.set(0);
			return;
		}
		let t = () => requestAnimationFrame(k);
		return window.addEventListener("resize", t), () => window.removeEventListener("resize", t);
	}, [
		k,
		D,
		O,
		s,
		e
	]), (0, m.useEffect)(() => {
		if (!e) return;
		let t = document.activeElement instanceof HTMLElement ? document.activeElement : null, n = w.current;
		if (!n) return;
		let r = () => Array.from(n.querySelectorAll("button:not([disabled]), [href], input:not([disabled]), select:not([disabled]), textarea:not([disabled]), [tabindex]:not([tabindex=\"-1\"])")).filter((e) => e.getClientRects().length > 0), i = requestAnimationFrame(() => {
			(r()[0] ?? n).focus();
		}), a = (e) => {
			if (e.key === "Escape") {
				e.preventDefault(), e.stopPropagation(), T.current();
				return;
			}
			if (e.key !== "Tab") return;
			let t = r();
			if (t.length === 0) {
				e.preventDefault(), n.focus();
				return;
			}
			let i = t[0], a = t[t.length - 1], o = document.activeElement;
			e.shiftKey && (o === i || !n.contains(o)) ? (e.preventDefault(), a.focus()) : !e.shiftKey && (o === a || !n.contains(o)) && (e.preventDefault(), i.focus());
		};
		return document.addEventListener("keydown", a, !0), () => {
			cancelAnimationFrame(i), document.removeEventListener("keydown", a, !0), t?.isConnected && t.focus();
		};
	}, [e]), (0, y.createPortal)(/* @__PURE__ */ (0, b.jsx)(i, { children: e && /* @__PURE__ */ (0, b.jsxs)(c.div, {
		ref: C,
		className: "fixed inset-0 z-[250] flex items-center justify-center overflow-hidden rounded-2xl",
		initial: { opacity: 0 },
		animate: { opacity: 1 },
		exit: { opacity: 0 },
		transition: S ? d : f,
		children: [/* @__PURE__ */ (0, b.jsx)(c.div, {
			"data-tauri-drag-region": !0,
			"aria-hidden": "true",
			className: `absolute inset-0 bg-black/50 ${_ ? "backdrop-blur-sm" : ""}`,
			initial: S ? !1 : { opacity: 0 },
			animate: S ? void 0 : { opacity: 1 },
			exit: S ? void 0 : { opacity: 0 },
			onClick: o ? t : void 0
		}), /* @__PURE__ */ (0, b.jsx)(c.div, {
			ref: w,
			role: "dialog",
			"aria-modal": "true",
			"aria-label": r,
			tabIndex: -1,
			className: `relative glass-panel border rounded-2xl shadow-2xl overflow-hidden overscroll-contain flex flex-col ${a}`,
			style: s ? {
				x: D,
				y: O
			} : void 0,
			...u(!!x, S, s),
			transition: x || S ? d : p,
			drag: s,
			dragControls: E,
			dragListener: !1,
			dragConstraints: s ? C : void 0,
			dragElastic: 0,
			dragMomentum: !1,
			onDragEnd: k,
			onPointerDown: A,
			onClick: (e) => e.stopPropagation(),
			children: n
		})]
	}) }), document.body);
}
//#endregion
export { h as n, x as t };
