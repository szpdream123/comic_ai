import { Br as e, Rr as t, t as n, zr as r } from "./useAppStore-BH-MdRLu.js";
import { i } from "./toolRegistry-C1y--kbp.js";
import { t as a } from "./policyEngine-D7L35rTf.js";
//#region src/services/chat/agentToolExecution.ts
function o(e, t) {
	return {
		callId: e.callId,
		toolId: e.toolId,
		status: "denied",
		summary: t,
		truncated: !1
	};
}
async function s({ taskId: s, call: c, signal: l, transitionTask: u, waitForApproval: d, policyMode: f, onApprovalRequired: p }) {
	let m = await import("./agentRoundExecutor-D9sjIsEG.js").then((e) => e.t);
	m.assertAgentTaskActive(s, l);
	let h = m.getTask(s), g = () => m.resolveAgentExecutionMode(m.getTask(s), f), _ = {
		taskId: s,
		projectId: h.projectId,
		conversationId: h.conversationId,
		mode: g(),
		toolAllowlist: h.toolAllowlist,
		baseRevision: n.getState().getCurrentRevision(),
		signal: l
	};
	m.updateTaskSnapshot(s, (e) => ({
		...e,
		toolCallCount: e.toolCallCount + 1
	})), e(s, "tool_proposed", {
		toolId: c.toolId,
		callId: c.callId
	});
	let v = i(c, _);
	if (!v.ok) return {
		summary: v.result,
		modelContent: v.result.summary
	};
	let y = m.prepareApprovalInput(v.prepared, h.goal, g()), b = y.prepared, x = c;
	_.mode = g();
	let S = a(b.definition, b.input, _);
	if (e(s, "policy_decision", {
		toolId: c.toolId,
		callId: c.callId,
		effect: b.definition.effect,
		decision: S.outcome === "require_approval" ? "require_approval" : S.outcome
	}), t({
		type: "policy.decision",
		taskId: s,
		toolId: c.toolId,
		effect: b.definition.effect,
		outcome: S.outcome
	}), S.outcome === "deny") {
		r(s, { policyDenied: 1 });
		let e = o(c, S.reason);
		return {
			summary: e,
			modelContent: e.summary
		};
	}
	r(s, {
		policyAllowed: +(S.outcome === "allow"),
		approvalCount: +(S.outcome === "require_approval")
	});
	let C = Date.now(), w = m.getTask(s).steps.length, T = m.createStepId(s, w), E = {
		id: T,
		taskId: s,
		index: w,
		kind: S.outcome === "require_approval" ? "approval" : "tool",
		title: b.definition.title,
		status: S.outcome === "require_approval" ? "waiting_approval" : "running",
		createdAt: C,
		updatedAt: C,
		toolCall: {
			callId: c.callId,
			toolId: c.toolId,
			inputSummary: m.sanitizePersistentSummary(b.definition.summarizeInput ? b.definition.summarizeInput(b.input) : "参数已通过本地 schema 校验").slice(0, 500),
			inputDisplay: m.buildToolInputDisplay(b, _),
			retryCount: 0,
			startedAt: C,
			effect: b.definition.effect
		},
		...S.outcome === "require_approval" ? { approval: {
			id: `${T}-approval`,
			kind: S.approvalKind,
			status: "pending",
			summary: S.reason,
			requestedAt: C,
			inputRequest: y.inputRequest
		} } : {}
	};
	if (m.appendStep(s, E), S.outcome === "require_approval") {
		u(s, "waiting_approval"), p?.(E);
		let n = E.approval.id, r = await d(n, l);
		m.assertAgentTaskActive(s, l), _.mode = g();
		let i = m.resolveApprovalSelection(c, b, y.inputRequest, r, _), a = i.error;
		x = i.call, b = i.prepared;
		let f = r.approved && !a;
		e(s, "approval_resolved", {
			toolId: c.toolId,
			callId: c.callId,
			approved: r.approved
		}), t({
			type: "approval.resolved",
			taskId: s,
			approvalId: n,
			approved: r.approved
		});
		let h = Date.now();
		if (m.updateTaskSnapshot(s, (e) => ({
			...e,
			steps: e.steps.map((e) => e.id === E.id ? {
				...e,
				status: f ? "running" : r.approved ? "failed" : "skipped",
				updatedAt: h,
				errorCode: a ? "AGENT_APPROVAL_INPUT_INVALID" : e.errorCode,
				errorMessage: a?.summary,
				toolCall: f && e.toolCall ? {
					...e.toolCall,
					inputSummary: m.sanitizePersistentSummary(b.definition.summarizeInput ? b.definition.summarizeInput(b.input) : e.toolCall.inputSummary || "参数已通过本地 schema 校验").slice(0, 500),
					inputDisplay: m.buildToolInputDisplay(b, _)
				} : e.toolCall,
				approval: e.approval ? {
					...e.approval,
					status: r.approved ? "approved" : "rejected",
					resolvedAt: h,
					inputRequest: i.inputRequest
				} : void 0
			} : e)
		})), u(s, "running"), !r.approved) {
			let e = o(c, "用户拒绝了本次操作");
			return {
				summary: e,
				modelContent: e.summary
			};
		}
		if (a) return {
			summary: a,
			modelContent: a.summary
		};
	}
	return m.executePreparedToolCall(s, x, b, _, E, f);
}
//#endregion
export { s as executeRegisteredAgentToolCall };
