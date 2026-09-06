import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./jsx-runtime-BAkIPmuO.js";
import { a as r } from "./i18n-on3r1DCI.js";
//#region node_modules/xiaoluo-vr-panorama/dist/xiaoluo-vr-panorama.js
var i = /* @__PURE__ */ e(t(), 1);
function a({ imageUrl: e, onClose: t, onCapture: n, closeText: r = "退出", className: a = "" }) {
	return i.createElement("div", {
		className: a,
		style: {
			position: "fixed",
			inset: 0,
			background: "#111",
			zIndex: 1e3
		}
	}, i.createElement("img", {
		src: e,
		alt: "Panorama",
		style: {
			width: "100%",
			height: "100%",
			objectFit: "contain"
		}
	}), i.createElement("button", {
		type: "button",
		onClick: t
	}, r));
}
//#endregion
//#region src/components/nodes/panorama/XiaoLuoPanoramaFullscreen.tsx
var o = n();
function s({ imageUrl: e, theme: t, onClose: n, onCapture: i }) {
	return /* @__PURE__ */ (0, o.jsx)(a, {
		imageUrl: e,
		imageLoadStrategy: "direct",
		captureMode: "ratio",
		theme: t,
		cornerRadius: "6px",
		closeText: r()("退出"),
		onClose: n,
		onCapture: i,
		className: "xiaoluo-panorama-compact nodrag nowheel"
	});
}
var c = (0, i.memo)(s);
//#endregion
export { c as default };
