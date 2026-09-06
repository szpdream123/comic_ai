import { o as e, t } from "./react-Dfufv8pq.js";
import { t as n } from "./react-dom-BhFnNZvF.js";
import { t as r } from "./jsx-runtime-BAkIPmuO.js";
//#region src/components/shared/Select.tsx
var i = /* @__PURE__ */ e(t(), 1), a = n(), o = r();
function s(e) {
	return "options" in e && Array.isArray(e.options);
}
function c(e) {
	return e == null ? "" : typeof e == "string" || typeof e == "number" || typeof e == "boolean" ? String(e) : "";
}
function l({ value: e, onChange: t, options: n, placeholder: r = "请选择", disabled: l = !1, size: u = "md", className: d = "", triggerClassName: f = "", triggerStyle: p, id: m, title: h, "aria-label": g, fixedMenu: _ = !1 }) {
	let [v, y] = (0, i.useState)(!1), b = (0, i.useRef)(null), x = (0, i.useRef)(null), S = n.flatMap((e) => s(e) ? e.options : [e]).find((t) => t.value === e);
	(0, i.useEffect)(() => {
		if (!v) return;
		let e = (e) => {
			let t = e.target, n = b.current?.contains(t) ?? !1, r = x.current?.contains(t) ?? !1;
			!n && !r && y(!1);
		};
		return document.addEventListener("mousedown", e), () => document.removeEventListener("mousedown", e);
	}, [v]), (0, i.useLayoutEffect)(() => {
		let e = x.current;
		if (!v || !_ || !e) {
			e?.removeAttribute("style");
			return;
		}
		let t = () => {
			let t = b.current?.getBoundingClientRect();
			!t || !e || (e.style.position = "fixed", e.style.top = `${t.bottom + 4}px`, e.style.left = `${t.left}px`, e.style.minWidth = `${t.width}px`, e.style.maxHeight = `calc(100vh - ${t.bottom + 12}px)`, e.style.zIndex = "300");
		};
		return t(), window.addEventListener("resize", t), document.addEventListener("scroll", t, !0), () => {
			window.removeEventListener("resize", t), document.removeEventListener("scroll", t, !0), e.removeAttribute("style");
		};
	}, [v, _]);
	let C = `ui-select ui-select--custom ${u === "sm" ? "ui-select--sm" : u === "lg" ? "ui-select--lg" : ""} ${d}`.trim(), w = `ui-select__trigger ${f}`.trim(), T = (n, r) => /* @__PURE__ */ (0, o.jsx)("button", {
		type: "button",
		role: "option",
		"aria-selected": e === n.value,
		disabled: n.disabled,
		className: `ui-menu__item${e === n.value ? " is-active" : ""}${n.disabled ? " is-disabled" : ""}`,
		onClick: () => {
			t(n.value), y(!1);
		},
		children: n.label
	}, r), E = v ? /* @__PURE__ */ (0, o.jsx)("div", {
		className: "ui-menu",
		role: "listbox",
		ref: x,
		"data-ui-select-portal": _ ? "" : void 0,
		children: n.map((e, t) => s(e) ? /* @__PURE__ */ (0, o.jsxs)("div", { children: [/* @__PURE__ */ (0, o.jsx)("span", {
			className: "ui-menu__label",
			children: e.label
		}), e.options.map((e, n) => T(e, `${t}-${n}`))] }, `group-${t}`) : T(e, t))
	}) : null;
	return /* @__PURE__ */ (0, o.jsxs)("div", {
		className: C,
		ref: b,
		title: h,
		children: [
			/* @__PURE__ */ (0, o.jsxs)("button", {
				id: m,
				type: "button",
				className: w,
				style: p,
				"aria-haspopup": "listbox",
				"aria-expanded": v,
				"aria-label": g,
				disabled: l,
				onClick: () => y((e) => !e),
				children: [/* @__PURE__ */ (0, o.jsx)("span", {
					className: "ui-select__trigger-text",
					children: S?.label ?? r
				}), /* @__PURE__ */ (0, o.jsx)("svg", {
					className: "ui-select__chevron",
					width: "12",
					height: "12",
					viewBox: "0 0 24 24",
					fill: "none",
					stroke: "currentColor",
					strokeWidth: "2.5",
					"aria-hidden": "true",
					children: /* @__PURE__ */ (0, o.jsx)("polyline", { points: "6 9 12 15 18 9" })
				})]
			}),
			/* @__PURE__ */ (0, o.jsx)("select", {
				className: "ui-select__native",
				value: e,
				disabled: l,
				onChange: (e) => t(e.target.value),
				tabIndex: -1,
				"aria-hidden": "true",
				children: n.map((e, t) => s(e) ? /* @__PURE__ */ (0, o.jsx)("optgroup", {
					label: c(e.label),
					children: e.options.map((e) => /* @__PURE__ */ (0, o.jsx)("option", {
						value: e.value,
						disabled: e.disabled,
						children: c(e.label)
					}, e.value))
				}, `group-${t}`) : /* @__PURE__ */ (0, o.jsx)("option", {
					value: e.value,
					disabled: e.disabled,
					children: c(e.label)
				}, e.value))
			}),
			_ ? E ? (0, a.createPortal)(E, document.body) : null : E
		]
	});
}
//#endregion
export { l as t };
