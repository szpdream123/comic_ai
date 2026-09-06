//#region node_modules/motion-utils/dist/es/format-error-message.mjs
function e(e, t) {
	return t ? `${e}. For more information and steps for solving, visit https://motion.dev/troubleshooting/${t}` : e;
}
//#endregion
//#region node_modules/motion-utils/dist/es/warn-once.mjs
var t = /* @__PURE__ */ new Set();
function n(n, r, i) {
	n || t.has(r) || (console.warn(e(r, i)), t.add(r));
}
//#endregion
//#region node_modules/motion-dom/dist/es/render/utils/reduced-motion/state.mjs
var r = { current: null }, i = { current: !1 }, a = typeof window < "u";
function o() {
	if (i.current = !0, a) if (window.matchMedia) {
		let e = window.matchMedia("(prefers-reduced-motion)"), t = () => r.current = e.matches;
		e.addEventListener("change", t), t();
	} else r.current = !1;
}
//#endregion
export { e as a, n as i, i as n, r, o as t };
