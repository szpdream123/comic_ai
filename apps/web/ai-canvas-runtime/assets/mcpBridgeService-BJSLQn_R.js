import { i as e } from "./react-Dfufv8pq.js";
import { a as t } from "./core-CoHQ9AE0.js";
//#region src/services/mcp/mcpBridgeService.ts
var n = /* @__PURE__ */ e({
	getMcpBridgeStatus: () => a,
	listenForMcpBridgeRequests: () => s,
	respondToMcpBridge: () => o,
	startMcpBridge: () => r,
	stopMcpBridge: () => i
});
async function r(e, n, r = "stdio") {
	return t("mcp_bridge_start", {
		token: e,
		port: n ?? null,
		transport: r
	});
}
async function i() {
	await t("mcp_bridge_stop");
}
async function a() {
	return t("mcp_bridge_status");
}
async function o(e) {
	await t("mcp_bridge_respond", { response: e });
}
async function s(e) {
	let { listen: t } = await import("./event-h5Ir25pQ.js").then((e) => e.i);
	return t("mcp:request", (t) => {
		e(t.payload);
	});
}
//#endregion
export { r as a, o as i, s as n, i as o, n as r, a as t };
