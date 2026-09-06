import { i as e } from "./react-Dfufv8pq.js";
import { t } from "./useAppStore-BH-MdRLu.js";
import { ct as n, st as r } from "./fileService-BawXHbsK.js";
import { a as i } from "./mcpBridgeService-CbxGlISN.js";
//#region src/services/mcp/mcpSessionConfig.ts
var a = /* @__PURE__ */ e({
	buildMcpClientConfig: () => h,
	buildMcpHttpEndpoint: () => m,
	ensureMcpSessionToken: () => l,
	generateMcpSessionToken: () => c,
	getConfiguredMcpTransport: () => f,
	normalizeMcpPort: () => d,
	rotateMcpSessionToken: () => u,
	startConfiguredMcpBridge: () => p
}), o = "mcp/token", s = /^[0-9a-f]{64}$/;
function c() {
	let e = new Uint8Array(32);
	return crypto.getRandomValues(e), Array.from(e, (e) => e.toString(16).padStart(2, "0")).join("");
}
async function l() {
	let e = (await r(o))?.toLowerCase();
	if (e && s.test(e)) return e;
	let t = c();
	return await n(o, t), t;
}
async function u() {
	let e = c();
	return await n(o, e), e;
}
function d(e) {
	let t = Number(e);
	if (!(!Number.isInteger(t) || t < 1024 || t > 65535)) return t;
}
function f(e) {
	return e === "streamable-http" ? "streamable-http" : "stdio";
}
async function p() {
	let e = await l(), n = t.getState().config;
	return {
		session: await i(e, d(n.mcpPort), f(n.mcpTransport)),
		token: e
	};
}
function m(e) {
	return e.transport === "streamable-http" ? `http://<AI_CANVAS_IP>:${e.port}${e.endpointPath ?? "/mcp"}` : null;
}
function h(e, t) {
	if (e.transport === "streamable-http") {
		let n = m(e);
		return n ? JSON.stringify({ mcpServers: { "ai-canvas": {
			url: n,
			headers: { Authorization: `Bearer ${t}` }
		} } }, null, 2) : null;
	}
	return e.adapterPath ? JSON.stringify({ mcpServers: { "ai-canvas": {
		command: "node",
		args: [
			e.adapterPath,
			"--port",
			String(e.port)
		],
		env: { AI_CANVAS_MCP_TOKEN: t }
	} } }, null, 2) : null;
}
//#endregion
export { d as a, a as i, l as n, u as o, f as r, p as s, h as t };
