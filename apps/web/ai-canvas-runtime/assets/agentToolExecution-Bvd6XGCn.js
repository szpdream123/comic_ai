import { Fr as e, Ir as t, Pr as n, t as r } from "./useAppStore-CcUL4Jo0.js";
import { i } from "./toolRegistry-kXOdXGeA.js";
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
	let m = await import("./agentRoundExecutor-CaRfoBry.js").then((e) => e.t), h = m.getTask(s), g = () => f ?? r.getState().conversations.find((e) => e.id === h.conversationId)?.agentMode ?? h.mode, _ = {
		taskId: s,
		projectId: h.projectId,
		conversationId: h.conversationId,
		mode: g(),
		toolAllowlist: h.toolAllowlist,
		baseRevision: r.getState().getCurrentRevision(),
		signal: l
	};
	m.updateTaskSnapshot(s, (e) => ({
		...e,
		toolCallCount: e.toolCallCount + 1
	})), t(s, "tool_proposed", {
		toolId: c.toolId,
		callId: c.callId
	});
	let v = i(c, _);
	if (!v.ok) return {
		summary: v.result,
		modelContent: v.result.summary
	};
	let y = m.prepareApprovalInput(v.prepared, h.goal), b = y.prepared, x = c;
	_.mode = g();
	let S = a(b.definition, b.input, _);
	if (t(s, "policy_decision", {
		toolId: c.toolId,
		callId: c.callId,
		effect: b.definition.effect,
		decision: S.outcome === "require_approval" ? "require_approval" : S.outcome
	}), n({
		type: "policy.decision",
		taskId: s,
		toolId: c.toolId,
		effect: b.definition.effect,
		outcome: S.outcome
	}), S.outcome === "deny") {
		e(s, { policyDenied: 1 });
		let t = o(c, S.reason);
		return {
			summary: t,
			modelContent: t.summary
		};
	}
	e(s, {
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
		let e = E.approval.id, r = await d(e, l), a, f = r.inputValues?.modelRef?.trim();
		if (r.approved && y.inputRequest) if (!f) a = o(c, "确认生成前必须选择一个可用模型");
		else {
			x = {
				...c,
				input: {
					...b.input,
					modelRef: f
				}
			};
			let e = i(x, _);
			if (!e.ok) a = e.result;
			else {
				let t = e.prepared.definition.authorize?.(_, e.prepared.input);
				t && !t.allowed ? a = o(c, t.reason || "所选模型当前不可用") : b = e.prepared;
			}
		}
		let h = r.approved && !a;
		t(s, "approval_resolved", {
			toolId: c.toolId,
			callId: c.callId,
			approved: r.approved
		}), n({
			type: "approval.resolved",
			taskId: s,
			approvalId: e,
			approved: r.approved
		});
		let g = Date.now();
		if (m.updateTaskSnapshot(s, (e) => ({
			...e,
			steps: e.steps.map((e) => e.id === E.id ? {
				...e,
				status: h ? "running" : r.approved ? "failed" : "skipped",
				updatedAt: g,
				errorCode: a ? "AGENT_APPROVAL_INPUT_INVALID" : e.errorCode,
				errorMessage: a?.summary,
				toolCall: h && e.toolCall ? {
					...e.toolCall,
					inputSummary: m.sanitizePersistentSummary(b.definition.summarizeInput ? b.definition.summarizeInput(b.input) : e.toolCall.inputSummary || "参数已通过本地 schema 校验").slice(0, 500),
					inputDisplay: m.buildToolInputDisplay(b, _)
				} : e.toolCall,
				approval: e.approval ? {
					...e.approval,
					status: r.approved ? "approved" : "rejected",
					resolvedAt: g,
					inputRequest: e.approval.inputRequest ? {
						...e.approval.inputRequest,
						selectedModelRef: f
					} : void 0
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
	return m.executePreparedToolCall(s, x, b, _, E);
}
//#endregion
export { s as executeRegisteredAgentToolCall };
