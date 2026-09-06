import { i as e } from "./react-Dfufv8pq.js";
import { a as t } from "./core-CoHQ9AE0.js";
import { a as n } from "./event-h5Ir25pQ.js";
//#region src/services/directorDeskRuntimeService.ts
var r = /* @__PURE__ */ e({
	DIRECTOR_DESK_INSTALL_PROGRESS_EVENT: () => i,
	cancelDirectorDeskInstall: () => c,
	getDirectorDeskRuntimeStatus: () => o,
	installDirectorDeskRuntime: () => s,
	isDirectorDeskRuntimeAvailable: () => a,
	removeDirectorDeskRuntime: () => l,
	subscribeDirectorDeskInstallProgress: () => u
}), i = "director-desk:install-progress";
function a() {
	return typeof window < "u" && ("__TAURI__" in window || "__TAURI_INTERNALS__" in window);
}
function o() {
	return t("director_desk_runtime_status");
}
function s(e) {
	return t("install_director_desk_runtime", { archivePath: e ?? null });
}
function c() {
	return t("cancel_director_desk_install");
}
function l() {
	return t("remove_director_desk_runtime");
}
function u(e) {
	return n(i, (t) => {
		e(t.payload);
	});
}
//#endregion
export { a, s as i, r as n, l as o, o as r, u as s, c as t };
