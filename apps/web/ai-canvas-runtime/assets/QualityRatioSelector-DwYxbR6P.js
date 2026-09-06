import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./jsx-runtime-BAkIPmuO.js";
import { a as r } from "./i18n-on3r1DCI.js";
import { Rt as i } from "./useTooltipAutoPlacement-BSvTkR9V.js";
//#region src/components/nodes/shared/QualityRatioSelector.tsx
var a = /* @__PURE__ */ e(t(), 1), o = n();
function s({ imageSize: e = "1K", aspectRatio: t = "16:9", onChangeImageSize: n, onChangeAspectRatio: s, showImageSize: c = !0, showAdaptive: l = !0, ratios: u, imageSizes: d = [
	"720p",
	"1K",
	"2K",
	"4K"
], placement: f = "top" }) {
	let p = r(), [m, h] = (0, a.useState)(!1), g = (0, a.useRef)(null);
	(0, a.useEffect)(() => {
		let e = (e) => {
			g.current && !g.current.contains(e.target) && h(!1);
		};
		return m && document.addEventListener("mousedown", e, !0), () => document.removeEventListener("mousedown", e, !0);
	}, [m]), (0, a.useEffect)(() => {
		let e = (e) => {
			e.key === "Escape" && h(!1);
		};
		return m && window.addEventListener("keydown", e), () => window.removeEventListener("keydown", e);
	}, [m]);
	let _ = u || [
		{
			value: "1:1",
			className: "img-rp-sq"
		},
		{
			value: "9:16",
			className: "img-rp-tall"
		},
		{
			value: "16:9",
			className: "img-rp-wide"
		},
		{
			value: "3:4",
			className: "img-rp-p34"
		},
		{
			value: "4:3",
			className: "img-rp-l43"
		},
		{
			value: "3:2",
			className: "img-rp-l32"
		},
		{
			value: "2:3",
			className: "img-rp-p23"
		},
		{
			value: "5:4",
			className: "img-rp-l54"
		},
		{
			value: "4:5",
			className: "img-rp-p45"
		},
		{
			value: "21:9",
			className: "img-rp-ultra"
		},
		{
			value: "1:4",
			className: "img-rp-p14"
		},
		{
			value: "4:1",
			className: "img-rp-l41"
		},
		{
			value: "1:6",
			className: "img-rp-p16"
		},
		{
			value: "6:1",
			className: "img-rp-l61"
		},
		{
			value: "1:8",
			className: "img-rp-p18"
		},
		{
			value: "8:1",
			className: "img-rp-l81"
		}
	];
	return /* @__PURE__ */ (0, o.jsx)("div", {
		className: "ui-schema-renderer",
		"data-ui-schema-model": "apimart/gemini-3.1-flash-image-preview",
		"data-ui-schema-placement": "resolution",
		ref: g,
		children: /* @__PURE__ */ (0, o.jsxs)("div", {
			className: "ui-schema-quality-ratio-pill",
			"data-ui-schema-composite-field": "qualityRatio",
			children: [/* @__PURE__ */ (0, o.jsxs)(i, {
				type: "button",
				className: "img-pill-btn ui-schema-menu-trigger",
				"data-ui-schema-menu-trigger": "qualityRatio",
				onClick: (e) => {
					e.stopPropagation(), h(!m);
				},
				children: [/* @__PURE__ */ (0, o.jsxs)("svg", {
					width: "12",
					height: "12",
					viewBox: "0 0 24 24",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: "2",
					children: [
						/* @__PURE__ */ (0, o.jsx)("rect", {
							x: "3",
							y: "3",
							width: "18",
							height: "18",
							rx: "2"
						}),
						/* @__PURE__ */ (0, o.jsx)("path", { d: "M3 9h18" }),
						/* @__PURE__ */ (0, o.jsx)("path", { d: "M9 21V9" })
					]
				}), /* @__PURE__ */ (0, o.jsx)("span", {
					className: "ui-schema-pill-label ui-schema-quality-ratio-label",
					children: c ? `${t} · ${e}` : t
				})]
			}), m && /* @__PURE__ */ (0, o.jsxs)("div", {
				className: `img-ratio-popup ui-schema-popup ui-schema-quality-ratio-popup${f === "bottom" ? " img-ratio-popup--down" : ""}`,
				style: { display: "block" },
				children: [c && /* @__PURE__ */ (0, o.jsxs)("div", {
					className: "img-rp-quality-area",
					"data-ui-schema-field": "imageSize",
					"data-ui-schema-type": "segmented",
					"data-ui-schema-default": "2K",
					children: [/* @__PURE__ */ (0, o.jsx)("div", {
						className: "img-rp-section-label",
						children: p("画质")
					}), /* @__PURE__ */ (0, o.jsx)("div", {
						className: "img-rp-quality-segmented",
						children: d.map((t) => /* @__PURE__ */ (0, o.jsx)(i, {
							type: "button",
							className: `img-rp-quality-item ui-schema-option ${e === t ? "active" : ""}`,
							"data-ui-schema-value": t,
							"data-ui-schema-option-label": t,
							onClick: () => n?.(t),
							children: t
						}, t))
					})]
				}), /* @__PURE__ */ (0, o.jsxs)("div", {
					className: "img-rp-ratio-area",
					"data-ui-schema-field": "aspectRatio",
					"data-ui-schema-type": "segmented",
					"data-ui-schema-default": l ? "自适应" : "16:9",
					children: [/* @__PURE__ */ (0, o.jsx)("div", {
						className: "img-rp-section-label",
						children: p("比例")
					}), /* @__PURE__ */ (0, o.jsxs)("div", {
						className: `img-rp-ratio-split${l ? " has-adaptive" : ""}`,
						children: [l && /* @__PURE__ */ (0, o.jsx)("div", {
							className: "img-rp-ratio-left",
							children: /* @__PURE__ */ (0, o.jsxs)(i, {
								type: "button",
								className: `img-rp-large-adaptive ui-schema-option ${t === "自适应" ? "active" : ""}`,
								"data-label": "自适应",
								"data-ui-schema-value": "自适应",
								onClick: () => s("自适应"),
								children: [/* @__PURE__ */ (0, o.jsxs)("svg", {
									width: "24",
									height: "24",
									viewBox: "0 0 24 24",
									fill: "none",
									stroke: "currentColor",
									strokeWidth: "2",
									children: [
										/* @__PURE__ */ (0, o.jsx)("rect", {
											x: "3",
											y: "3",
											width: "18",
											height: "18",
											rx: "2"
										}),
										/* @__PURE__ */ (0, o.jsx)("path", { d: "M3 9h18" }),
										/* @__PURE__ */ (0, o.jsx)("path", { d: "M9 21V9" })
									]
								}), /* @__PURE__ */ (0, o.jsx)("span", { children: p("自适应") })]
							})
						}), /* @__PURE__ */ (0, o.jsx)("div", {
							className: "img-rp-ratio-right",
							children: _.map((e) => /* @__PURE__ */ (0, o.jsxs)(i, {
								type: "button",
								className: `img-rp-ratio-item ui-schema-option ${t === e.value ? "active" : ""}`,
								"data-label": e.value,
								"data-ui-schema-value": e.value,
								onClick: () => s(e.value),
								children: [/* @__PURE__ */ (0, o.jsx)("span", { className: `img-rp-icon ${e.className}` }), /* @__PURE__ */ (0, o.jsx)("span", { children: e.value })]
							}, e.value))
						})]
					})]
				})]
			})]
		})
	});
}
//#endregion
export { s as t };
