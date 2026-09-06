import { a as e, t } from "./core-CoHQ9AE0.js";
//#region node_modules/@tauri-apps/plugin-global-shortcut/dist-js/index.js
async function n(n, r) {
	let i = new t();
	return i.onmessage = r, await e("plugin:global-shortcut|register", {
		shortcuts: Array.isArray(n) ? n : [n],
		handler: i
	});
}
async function r(t) {
	return await e("plugin:global-shortcut|unregister", { shortcuts: Array.isArray(t) ? t : [t] });
}
async function i() {
	return await e("plugin:global-shortcut|unregister_all", {});
}
async function a(t) {
	return await e("plugin:global-shortcut|is_registered", { shortcut: t });
}
//#endregion
export { a as isRegistered, n as register, r as unregister, i as unregisterAll };
