import { t as e } from "./jsx-runtime-BAkIPmuO.js";
import { a as t } from "./i18n-on3r1DCI.js";
import { n } from "./rasterImageDimensions-CX1VK2cM.js";
//#region src/components/nodes/shared/image/ImageEditorZoomControls.tsx
var r = e();
function i({ scale: e, minScale: i, maxScale: a, onZoomChange: o, onReset: s, className: c, step: l = .25 }) {
	let u = t(), d = ["image-editor-zoom-controls", c].filter(Boolean).join(" "), f = e > i + 2 ** -52, p = e < a - 2 ** -52;
	return /* @__PURE__ */ (0, r.jsxs)("div", {
		className: d,
		role: "group",
		"aria-label": u("画布缩放"),
		children: [
			/* @__PURE__ */ (0, r.jsx)("button", {
				type: "button",
				className: "image-editor-zoom-btn",
				"data-tooltip": u("缩小"),
				"aria-label": u("缩小"),
				disabled: !f,
				onClick: () => o(Math.max(i, e - l)),
				children: /* @__PURE__ */ (0, r.jsx)(n, {
					icon: "mdi:magnify-minus-outline",
					width: "16",
					height: "16",
					"aria-hidden": "true"
				})
			}),
			/* @__PURE__ */ (0, r.jsxs)("button", {
				type: "button",
				className: "image-editor-zoom-value",
				"data-tooltip": u("重置缩放"),
				"aria-label": u("重置缩放"),
				onClick: s,
				children: [Math.round(e * 100), "%"]
			}),
			/* @__PURE__ */ (0, r.jsx)("button", {
				type: "button",
				className: "image-editor-zoom-btn",
				"data-tooltip": u("放大"),
				"aria-label": u("放大"),
				disabled: !p,
				onClick: () => o(Math.min(a, e + l)),
				children: /* @__PURE__ */ (0, r.jsx)(n, {
					icon: "mdi:magnify-plus-outline",
					width: "16",
					height: "16",
					"aria-hidden": "true"
				})
			})
		]
	});
}
//#endregion
export { i as t };
