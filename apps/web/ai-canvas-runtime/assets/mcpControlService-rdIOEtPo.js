import { Ar as e, Nr as t, Or as n, jr as r, t as i } from "./useAppStore-CcUL4Jo0.js";
import { i as a, n as o } from "./mcpBridgeService-BJSLQn_R.js";
import { n as s, r as c } from "./toolRegistry-kXOdXGeA.js";
//#region src/services/mcp/mcpControlService.ts
var l = "MCP 控制", u = "autonomous", d = "mcp-tool-discovery", f = /* @__PURE__ */ new Map();
function p(e) {
	return `${e}-${Date.now().toString(36)}-${Math.random().toString(36).slice(2, 8)}`;
}
function m(e) {
	return e.replace(/\b(?:sk|key|token)-[A-Za-z0-9_-]{12,}\b/gi, "[已脱敏密钥]").replace(/\b(?:api[_-]?key|authorization|token)\s*[:=]\s*\S+/gi, "[已脱敏凭据]").replace(/[A-Za-z]:\\(?:[^\\\r\n]+\\)*[^\\\r\n]*/g, "[本地路径]").replace(/\/(?:Users|home)\/[^\s"'`]+/g, "[本地路径]").slice(0, 500);
}
async function h() {
	let { ensureAgentToolsRegistered: e } = await import("./conversationExecutionController-DP-nWpFB.js").then((e) => e.a);
	e();
}
function g(e) {
	let t = i.getState(), n = `mcp-control-${e}`, r = t.conversations.find((e) => e.id === n);
	if (r) {
		if (r.archived || r.deletedAt || r.agentMode !== u) {
			let e = {
				archived: !1,
				deletedAt: void 0,
				agentMode: u
			};
			return t.updateConversation(n, e), {
				...r,
				...e
			};
		}
		return r;
	}
	let a = Date.now(), o = {
		id: n,
		projectId: e,
		title: l,
		titleSource: "user",
		pinned: !0,
		archived: !1,
		agentMode: u,
		createdAt: a,
		updatedAt: a,
		messageCount: 0
	};
	return t.addConversation(o), o;
}
function _() {
	let e = i.getState().currentProjectId;
	return e ? {
		projectId: e,
		conversation: g(e)
	} : null;
}
async function v() {
	await h();
	let e = _();
	return e ? c({
		taskId: d,
		projectId: e.projectId,
		conversationId: e.conversation.id,
		mode: u,
		baseRevision: i.getState().getCurrentRevision()
	}).map((e) => ({
		name: e.id,
		title: e.title,
		description: e.description,
		inputSchema: e.inputSchema
	})) : [];
}
function y(e) {
	i.getState().addMessage(e);
}
async function b(e) {
	await h();
	let a = _();
	if (!a) return {
		isError: !0,
		summary: "当前没有已加载项目，无法调用 AI Canvas 工具",
		content: [{
			type: "text",
			text: "当前没有已加载项目，无法调用 AI Canvas 工具"
		}]
	};
	let o = typeof e.params.name == "string" ? e.params.name : "", c = e.params.arguments && typeof e.params.arguments == "object" ? e.params.arguments : {}, l = s(o), d = (l?.title ?? o) || "未知工具", g = "参数将在本地 schema 校验";
	if (l?.summarizeInput) try {
		g = l.summarizeInput(c);
	} catch {
		g = "参数摘要生成失败，将由本地 schema 校验";
	}
	g = m(g);
	let v = i.getState(), b = Date.now(), x = p("mcp-user"), S = p("mcp-assistant");
	y({
		id: x,
		conversationId: a.conversation.id,
		role: "user",
		content: `MCP 请求：${d}\n${g}`,
		timestamp: b,
		status: "done"
	});
	let C = v.createAgentTask({
		projectId: a.projectId,
		conversationId: a.conversation.id,
		userMessageId: x,
		mode: u,
		goal: `MCP 请求：${d}。${g}`,
		budget: {
			maxModelRounds: 1,
			maxToolCalls: 1,
			maxParallelReadTools: 1
		}
	});
	y({
		id: S,
		conversationId: a.conversation.id,
		role: "assistant",
		content: `正在执行 MCP 工具“${d}”。`,
		timestamp: b + 1,
		status: "executing",
		agentTaskId: C.id
	}), f.set(e.requestId, C.id);
	let w;
	try {
		let a = await n(C.id, async (n) => {
			let { executeRegisteredAgentToolCall: i } = await import("./agentToolExecution-Bvd6XGCn.js");
			return w = await i({
				taskId: C.id,
				call: {
					callId: e.requestId,
					toolId: o,
					input: c
				},
				signal: n,
				transitionTask: r,
				waitForApproval: t,
				policyMode: u
			}), w.summary.status === "success" ? "completed" : "failed";
		}), s = w?.summary.summary ?? a.errorMessage ?? "MCP 工具调用未返回结果", l = w?.summary.status !== "success", d = w !== void 0;
		return i.getState().updateAgentTask(C.id, { resultSummary: s }), i.getState().updateMessage(S, {
			content: s,
			status: d ? "done" : "error"
		}), {
			isError: l,
			summary: s,
			content: w?.mcpContent?.length ? w.mcpContent : [{
				type: "text",
				text: w?.modelContent ?? s
			}]
		};
	} finally {
		f.delete(e.requestId);
	}
}
function x(t) {
	let n = typeof t.params.requestId == "string" ? t.params.requestId : "", r = f.get(n);
	if (!r) return { cancelled: !1 };
	try {
		return e(r), { cancelled: !0 };
	} catch {
		return { cancelled: !1 };
	}
}
async function S(e) {
	switch (e.method) {
		case "tools/list": return { tools: await v() };
		case "tools/call": return b(e);
		case "requests/cancel": return x(e);
		default: throw Error("不支持的 MCP bridge 方法");
	}
}
async function C() {
	let t = await o(async (e) => {
		try {
			let t = await S(e);
			await a({
				sessionId: e.sessionId,
				requestId: e.requestId,
				ok: !0,
				result: t
			});
		} catch (t) {
			await a({
				sessionId: e.sessionId,
				requestId: e.requestId,
				ok: !1,
				error: m(t instanceof Error ? t.message : "AI Canvas MCP 请求失败")
			}).catch(() => {});
		}
	});
	return () => {
		t();
		for (let t of f.values()) try {
			e(t);
		} catch {}
		f.clear();
	};
}
//#endregion
export { C as initMcpControlService };
