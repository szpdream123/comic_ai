import { t as e } from "./jsx-runtime-BAkIPmuO.js";
import { a as t, t as n } from "./core-D3lATfku.js";
import { N as r, b as i } from "./directorSceneSchema-D22Qlbpb.js";
import "./fileService-BawXHbsK.js";
import { t as a } from "./ViewportImage-txaOn4PW.js";
import { n as o, r as s } from "./assetFormat-UuOoHpLo.js";
//#region node_modules/@crabnebula/tauri-plugin-drag/dist-js/index.js
async function c(e, r) {
	let i = new n();
	r && (i.onmessage = r), await t("plugin:drag|start_drag", {
		item: e.item,
		image: e.icon,
		options: { mode: e.mode },
		onEvent: i
	});
}
//#endregion
//#region src/utils/assetDrag.ts
var l = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==", u = null;
async function d() {
	if (!u) try {
		let { appDataDir: e } = await import("./path-gl9BKl4b.js").then((e) => e.a), t = r(r(await e(), ".cache"), "drag-icon.png"), n = atob(l), a = new Uint8Array(n.length);
		for (let e = 0; e < n.length; e++) a[e] = n.charCodeAt(e);
		await i(t, a), u = t;
	} catch {}
}
function f(e) {
	if (!e.path) return;
	let t = e.category === "image" ? e.path : u || e.path;
	c({
		item: [e.path],
		icon: t,
		mode: "copy"
	}).catch((e) => console.warn("[assetDrag] startDrag 失败:", e));
}
//#endregion
//#region src/components/shared/AssetThumb.tsx
var p = e();
function m({ assetUrl: e, name: t, category: n, size: r, badge: i, children: c }) {
	return e ? /* @__PURE__ */ (0, p.jsxs)("div", {
		className: "assets-card-img-wrap",
		children: [
			/* @__PURE__ */ (0, p.jsx)(a, {
				src: e,
				alt: t,
				className: "assets-card-img",
				draggable: !1
			}),
			/* @__PURE__ */ (0, p.jsx)("span", {
				className: "assets-card-size",
				children: s(r)
			}),
			i && /* @__PURE__ */ (0, p.jsx)("span", {
				className: "assets-card-badge",
				children: i
			}),
			c
		]
	}) : /* @__PURE__ */ (0, p.jsxs)("div", {
		className: "assets-card-icon-wrap",
		children: [
			/* @__PURE__ */ (0, p.jsx)("span", {
				className: "assets-card-icon",
				children: o[n]
			}),
			/* @__PURE__ */ (0, p.jsx)("span", {
				className: "assets-card-size",
				children: s(r)
			}),
			i && /* @__PURE__ */ (0, p.jsx)("span", {
				className: "assets-card-badge",
				children: i
			}),
			c
		]
	});
}
//#endregion
export { d as n, f as r, m as t };
