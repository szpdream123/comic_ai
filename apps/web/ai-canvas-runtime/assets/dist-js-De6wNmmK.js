import { i as e } from "./react-Dfufv8pq.js";
import { a as t } from "./core-CoHQ9AE0.js";
//#region node_modules/@tauri-apps/plugin-dialog/dist-js/index.js
var n = /* @__PURE__ */ e({
	ask: () => s,
	confirm: () => c,
	open: () => i,
	save: () => a
});
function r(e) {
	if (e !== void 0) {
		if (typeof e == "string") return e;
		if ("ok" in e && "cancel" in e) return { OkCancelCustom: [e.ok, e.cancel] };
		if ("yes" in e && "no" in e && "cancel" in e) return { YesNoCancelCustom: [
			e.yes,
			e.no,
			e.cancel
		] };
		if ("ok" in e) return { OkCustom: e.ok };
	}
}
async function i(e = {}) {
	return typeof e == "object" && Object.freeze(e), await t("plugin:dialog|open", { options: e });
}
async function a(e = {}) {
	return typeof e == "object" && Object.freeze(e), await t("plugin:dialog|save", { options: e });
}
async function o(e, n) {
	return await t("plugin:dialog|message", {
		message: e,
		title: n?.title,
		kind: n?.kind,
		buttons: r(n?.buttons)
	});
}
async function s(e, t) {
	let n = typeof t == "string" ? { title: t } : t, r = n?.okLabel || n?.cancelLabel, i = n?.okLabel ?? "Yes";
	return await o(e, {
		title: n?.title,
		kind: n?.kind,
		buttons: r ? {
			ok: i,
			cancel: n.cancelLabel ?? "No"
		} : "YesNo"
	}) === i;
}
async function c(e, t) {
	let n = typeof t == "string" ? { title: t } : t, r = n?.okLabel || n?.cancelLabel, i = n?.okLabel ?? "Ok";
	return await o(e, {
		title: n?.title,
		kind: n?.kind,
		buttons: r ? {
			ok: i,
			cancel: n.cancelLabel ?? "Cancel"
		} : "OkCancel"
	}) === i;
}
//#endregion
export { a as i, n, i as r, c as t };
