import { o as e, t } from "./react-Dfufv8pq.js";
import { i as n, n as r, r as i, t as a } from "./reduced-motion-BxGVFIo6.js";
//#region node_modules/framer-motion/dist/es/utils/reduced-motion/use-reduced-motion.mjs
var o = /* @__PURE__ */ e(t(), 1);
function s() {
	!r.current && a();
	let [e] = (0, o.useState)(i.current);
	return process.env.NODE_ENV !== "production" && n(e !== !0, "You have Reduced Motion enabled on your device. Animations may not appear as expected.", "reduced-motion-disabled"), e;
}
//#endregion
export { s as t };
