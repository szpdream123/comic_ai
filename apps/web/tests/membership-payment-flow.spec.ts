import assert from "node:assert/strict";
import { test } from "node:test";

import {
  handleWorkbenchActionForTest,
} from "../src/features/production-workbench/index.js";
import { createStoryboardList } from "../src/features/production-workbench/storyboard-state.js";

test("refreshing a credit package payment does not refresh membership entitlements", async () => {
  const calls = [];
  const workbench = createWorkbench({
    lastBillingOrder: {
      id: "order-credit-1",
      productType: "credit_package",
      status: "pending_payment",
    },
    lastPaymentIntent: {
      id: "intent-credit-1",
      orderId: "order-credit-1",
      status: "submitted",
    },
  }, {
    async getBillingOrder(orderId) {
      calls.push(["getBillingOrder", orderId]);
      return {
        order: {
          id: orderId,
          productType: "credit_package",
          status: "paid",
        },
      };
    },
    async getPaymentIntent(paymentIntentId) {
      calls.push(["getPaymentIntent", paymentIntentId]);
      return {
        paymentIntent: {
          id: paymentIntentId,
          orderId: "order-credit-1",
          status: "succeeded",
        },
      };
    },
    async getMembershipStatus() {
      calls.push("getMembershipStatus");
      throw new Error("membership_refresh_should_not_run");
    },
  });

  await handleWorkbenchActionForTest(workbench, {
    dataset: {
      action: "refresh-payment-intent",
      paymentIntentId: "intent-credit-1",
      orderId: "order-credit-1",
    },
  });

  assert.deepEqual(calls, [
    ["getBillingOrder", "order-credit-1"],
    ["getPaymentIntent", "intent-credit-1"],
  ]);
  assert.equal(workbench.ui.lastBillingOrder.status, "paid");
  assert.equal(workbench.ui.lastPaymentIntent.status, "succeeded");
  assert.match(workbench.ui.toast, /支付状态已刷新/);
  assert.doesNotMatch(workbench.ui.toast, /会员已开通/);
});

test("refreshing a paid membership payment refreshes the active entitlement surfaces", async () => {
  const calls = [];
  const workbench = createWorkbench({
    isLibraryPricingModalOpen: true,
    pendingMembershipPlanId: "plan-pro-month",
    pendingMembershipPaymentProvider: "wechat_pay",
    lastBillingOrder: {
      id: "order-membership-1",
      productType: "membership_plan",
      status: "pending_payment",
    },
    lastPaymentIntent: {
      id: "intent-membership-1",
      orderId: "order-membership-1",
      status: "submitted",
    },
  }, {
    async getBillingOrder(orderId) {
      calls.push(["getBillingOrder", orderId]);
      return {
        order: {
          id: orderId,
          productType: "membership_plan",
          status: "paid",
        },
      };
    },
    async getPaymentIntent(paymentIntentId) {
      calls.push(["getPaymentIntent", paymentIntentId]);
      return {
        paymentIntent: {
          id: paymentIntentId,
          orderId: "order-membership-1",
          status: "succeeded",
        },
      };
    },
    async getMembershipPlans() {
      calls.push("getMembershipPlans");
      return { data: { plans: [] } };
    },
    async getMembershipStatus() {
      calls.push("getMembershipStatus");
      return {
        membership: {
          status: "professional_active",
          entitlements: { teamAssetLibrary: true },
        },
      };
    },
    async getTeamOverview() {
      calls.push("getTeamOverview");
      return { overview: { entitlements: { teamAssetLibrary: true } } };
    },
    async getTeamMembers() {
      calls.push("getTeamMembers");
      return { members: [{ userId: "member-1" }] };
    },
  });

  await handleWorkbenchActionForTest(workbench, {
    dataset: {
      action: "refresh-payment-intent",
      paymentIntentId: "intent-membership-1",
      orderId: "order-membership-1",
    },
  });

  assert.deepEqual(calls, [
    ["getBillingOrder", "order-membership-1"],
    ["getPaymentIntent", "intent-membership-1"],
    "getMembershipPlans",
    "getMembershipStatus",
    "getTeamOverview",
    "getTeamMembers",
  ]);
  assert.equal(workbench.ui.membershipStatus.status, "professional_active");
  assert.equal(workbench.ui.teamMembers[0].userId, "member-1");
  assert.equal(workbench.ui.toast, "");
  assert.equal(workbench.ui.isLibraryPricingModalOpen, false);
  assert.equal(workbench.ui.pendingMembershipPlanId, "");
  assert.equal(workbench.ui.lastBillingOrder, null);
  assert.equal(workbench.ui.lastPaymentIntent, null);
  assert.doesNotMatch(workbench.root.innerHTML, /data-modal="membership-payment"/);
});

test("paid membership payment closes the qr flow and refreshes even before entitlement sync returns active", async () => {
  const calls = [];
  const reloads = [];
  const workbench = createWorkbench({
    isLibraryPricingModalOpen: true,
    pendingMembershipPlanId: "plan-pro-month",
    pendingMembershipPaymentProvider: "wechat_pay",
    lastBillingOrder: {
      id: "order-membership-1",
      productType: "membership_plan",
      status: "pending_payment",
    },
    lastPaymentIntent: {
      id: "intent-membership-1",
      orderId: "order-membership-1",
      status: "submitted",
    },
    membershipPaymentQrCreatedAt: new Date().toISOString(),
    membershipPaymentPolling: true,
  }, {
    async getBillingOrder(orderId) {
      calls.push(["getBillingOrder", orderId]);
      return {
        order: {
          id: orderId,
          productType: "membership_plan",
          status: "paid",
        },
      };
    },
    async getPaymentIntent(paymentIntentId) {
      calls.push(["getPaymentIntent", paymentIntentId]);
      return {
        paymentIntent: {
          id: paymentIntentId,
          orderId: "order-membership-1",
          status: "succeeded",
        },
      };
    },
    async getMembershipPlans() {
      calls.push("getMembershipPlans");
      return { data: { plans: [] } };
    },
    async getMembershipStatus() {
      calls.push("getMembershipStatus");
      return { membership: { status: "none" } };
    },
    async getTeamOverview() {
      calls.push("getTeamOverview");
      throw new Error("team_refresh_should_not_run");
    },
  });
  workbench.requestPageRefreshAfterMembershipPaymentSuccess = () => {
    reloads.push("reload");
  };
  workbench.paymentPollSetTimeout = (callback, delayMs) => {
    calls.push(["setTimeout", delayMs]);
    return { delayMs };
  };
  workbench.paymentPollClearTimeout = () => {};

  await handleWorkbenchActionForTest(workbench, {
    dataset: {
      action: "refresh-payment-intent",
      paymentIntentId: "intent-membership-1",
      orderId: "order-membership-1",
    },
  });

  assert.equal(workbench.ui.membershipStatus.status, "none");
  assert.equal(workbench.ui.toast, "");
  assert.equal(workbench.ui.isLibraryPricingModalOpen, false);
  assert.equal(workbench.ui.pendingMembershipPlanId, "");
  assert.equal(workbench.ui.lastBillingOrder, null);
  assert.equal(workbench.ui.lastPaymentIntent, null);
  assert.equal(workbench.ui.membershipPaymentPolling, false);
  assert.deepEqual(reloads, ["reload"]);
  assert.doesNotMatch(workbench.root.innerHTML, /data-modal="membership-payment"/);
});

test("membership payment countdown refreshes every second independently from payment polling", async () => {
  const scheduledPolls = [];
  const scheduledCountdowns = [];
  const root = {
    innerHTML: "",
    querySelector(selector) {
      if (selector !== "[data-payment-countdown]") {
        return null;
      }
      const match = this.innerHTML.match(/data-payment-countdown[^>]*data-expires-at="([^"]*)"/);
      if (!match) {
        return null;
      }
      return {
        dataset: { expiresAt: match[1] },
        textContent: "",
        classList: { toggle() {} },
      };
    },
    querySelectorAll: () => [],
  };
  const workbench = createWorkbench({
    activeNavTab: "library",
    isLibraryPricingModalOpen: true,
  }, {
    async createMembershipOrder(input) {
      return { order: { id: "order-membership-1", orderNo: "MO-1", membershipPlanId: input.membershipPlanId } };
    },
    async createPaymentIntent(input) {
      return {
        paymentIntent: {
          id: "intent-membership-1",
          orderId: input.orderId,
          status: "submitted",
          provider: input.provider,
          amountMinor: 29900,
          currency: "CNY",
          merchantOrderNo: "MO-1",
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
        payAction: {
          kind: "mock_qr",
          provider: input.provider,
          merchantOrderNo: "MO-1",
        },
      };
    },
  });
  workbench.root = root;
  workbench.paymentPollSetTimeout = (callback, delayMs) => {
    scheduledPolls.push({ callback, delayMs });
    return { delayMs };
  };
  workbench.paymentPollClearTimeout = () => {};
  workbench.paymentCountdownSetTimeout = (callback, delayMs) => {
    scheduledCountdowns.push({ callback, delayMs });
    return { delayMs };
  };
  workbench.paymentCountdownClearTimeout = () => {};

  await handleWorkbenchActionForTest(workbench, {
    dataset: {
      action: "purchase-membership-plan",
      planId: "plan-pro-month",
      provider: "wechat_pay",
    },
  });

  assert.equal(scheduledPolls.length, 1);
  assert.equal(scheduledPolls[0].delayMs, 2000);
  assert.equal(scheduledCountdowns.length, 1);
  assert.equal(scheduledCountdowns[0].delayMs, 1000);
});

test("unchecking the paid agreement hides the membership payment qr and pauses polling", async () => {
  const clearedPolls = [];
  const workbench = createWorkbench({
    activeNavTab: "library",
    isLibraryPricingModalOpen: true,
    pendingMembershipPlanId: "plan-pro-month",
    pendingMembershipPaymentProvider: "wechat_pay",
    membershipPaymentAgreementAccepted: true,
    membershipPaymentQrCreatedAt: new Date().toISOString(),
    membershipPaymentQrExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    membershipPaymentPolling: true,
    lastBillingOrder: {
      id: "order-membership-1",
      productType: "membership_plan",
      status: "pending_payment",
    },
    lastPaymentIntent: {
      id: "intent-membership-1",
      orderId: "order-membership-1",
      status: "submitted",
      provider: "wechat_pay",
      amountMinor: 29900,
      currency: "CNY",
      merchantOrderNo: "MO-1",
    },
    lastPaymentAction: {
      kind: "mock_qr",
      provider: "wechat_pay",
      merchantOrderNo: "MO-1",
    },
  });
  workbench.membershipPaymentPollTimer = { id: "poll" };
  workbench.paymentPollClearTimeout = (timer) => {
    clearedPolls.push(timer);
  };

  await handleWorkbenchActionForTest(workbench, {
    checked: false,
    dataset: {
      action: "toggle-membership-payment-agreement",
    },
  });

  assert.equal(workbench.ui.membershipPaymentAgreementAccepted, false);
  assert.equal(workbench.ui.membershipPaymentPolling, false);
  assert.equal(clearedPolls.length, 1);
  assert.match(workbench.root.innerHTML, /data-payment-agreement-blocked/);
  assert.doesNotMatch(workbench.root.innerHTML, /library-team-qr-code/);
  assert.match(workbench.ui.toast, /同意付费会员服务协议/);
});

test("checking the paid agreement resumes polling without showing a success toast", async () => {
  const scheduledPolls = [];
  const workbench = createWorkbench({
    activeNavTab: "library",
    isLibraryPricingModalOpen: true,
    pendingMembershipPlanId: "plan-pro-month",
    pendingMembershipPaymentProvider: "wechat_pay",
    membershipPaymentAgreementAccepted: false,
    membershipPaymentQrCreatedAt: new Date().toISOString(),
    membershipPaymentQrExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    membershipPaymentPolling: false,
    toast: "",
    lastBillingOrder: {
      id: "order-membership-1",
      productType: "membership_plan",
      status: "pending_payment",
    },
    lastPaymentIntent: {
      id: "intent-membership-1",
      orderId: "order-membership-1",
      status: "submitted",
      provider: "wechat_pay",
      amountMinor: 29900,
      currency: "CNY",
      merchantOrderNo: "MO-1",
    },
    lastPaymentAction: {
      kind: "mock_qr",
      provider: "wechat_pay",
      merchantOrderNo: "MO-1",
    },
  });
  workbench.paymentPollSetTimeout = (callback, delayMs) => {
    scheduledPolls.push({ callback, delayMs });
    return { delayMs };
  };
  workbench.paymentPollClearTimeout = () => {};

  await handleWorkbenchActionForTest(workbench, {
    checked: true,
    dataset: {
      action: "toggle-membership-payment-agreement",
    },
  });

  assert.equal(workbench.ui.membershipPaymentAgreementAccepted, true);
  assert.equal(scheduledPolls.length, 1);
  assert.equal(workbench.ui.toast, "");
  assert.doesNotMatch(workbench.root.innerHTML, /global-workbench-toast success/);
});

test("creating a membership payment is blocked while the paid agreement is unchecked", async () => {
  const calls = [];
  const workbench = createWorkbench({
    activeNavTab: "library",
    isLibraryPricingModalOpen: true,
    membershipPaymentAgreementAccepted: false,
  }, {
    async createMembershipOrder(input) {
      calls.push(["createMembershipOrder", input]);
      return { order: { id: "order-membership-1", orderNo: "MO-1", membershipPlanId: input.membershipPlanId } };
    },
    async createPaymentIntent(input) {
      calls.push(["createPaymentIntent", input]);
      return { paymentIntent: { id: "intent-membership-1", orderId: input.orderId } };
    },
  });

  await handleWorkbenchActionForTest(workbench, {
    dataset: {
      action: "purchase-membership-plan",
      planId: "plan-pro-month",
      provider: "wechat_pay",
    },
  });

  assert.deepEqual(calls, []);
  assert.equal(workbench.ui.lastBillingOrder ?? null, null);
  assert.equal(workbench.ui.lastPaymentIntent ?? null, null);
  assert.match(workbench.ui.toast, /同意付费会员服务协议/);
});

test("creating a membership payment requires an active login session", async () => {
  const calls = [];
  const workbench = createWorkbench({
    isLibraryPricingModalOpen: true,
  }, {
    async getSession() {
      calls.push("getSession");
      const error = new Error("unauthenticated");
      error.status = 401;
      error.errorCode = "unauthenticated";
      throw error;
    },
    async createMembershipOrder(input) {
      calls.push(["createMembershipOrder", input]);
      return { order: { id: "order-membership-1", orderNo: "MO-1" } };
    },
    async createPaymentIntent(input) {
      calls.push(["createPaymentIntent", input]);
      return { paymentIntent: { id: "intent-membership-1", orderId: input.orderId } };
    },
  });
  workbench.session = null;
  workbench.onLogout = async () => {
    calls.push("onLogout");
  };

  await handleWorkbenchActionForTest(workbench, {
    dataset: {
      action: "purchase-membership-plan",
      planId: "plan-pro-month",
      provider: "wechat_pay",
    },
  });

  assert.deepEqual(calls, ["onLogout"]);
  assert.equal(workbench.ui.lastBillingOrder, null);
  assert.equal(workbench.ui.lastPaymentIntent, null);
  assert.match(workbench.ui.toast, /请先登录/);
  assert.doesNotMatch(workbench.root.innerHTML, /membership-payment/);
});

test("refreshing an open membership payment requires an active login session", async () => {
  const calls = [];
  const workbench = createWorkbench({
    isLibraryPricingModalOpen: true,
    lastBillingOrder: {
      id: "order-membership-1",
      productType: "membership_plan",
      status: "pending_payment",
    },
    lastPaymentIntent: {
      id: "intent-membership-1",
      orderId: "order-membership-1",
      status: "submitted",
    },
    lastPaymentAction: {
      kind: "mock_qr",
      provider: "wechat_pay",
    },
    pendingMembershipPlanId: "plan-pro-month",
    membershipPaymentPolling: true,
  }, {
    async getSession() {
      calls.push("getSession");
      const error = new Error("unauthenticated");
      error.status = 401;
      error.errorCode = "unauthenticated";
      throw error;
    },
    async getBillingOrder(orderId) {
      calls.push(["getBillingOrder", orderId]);
      return { order: { id: orderId, status: "paid", productType: "membership_plan" } };
    },
  });
  workbench.onLogout = async () => {
    calls.push("onLogout");
  };

  await handleWorkbenchActionForTest(workbench, {
    dataset: {
      action: "refresh-payment-intent",
      paymentIntentId: "intent-membership-1",
      orderId: "order-membership-1",
    },
  });

  assert.deepEqual(calls, ["getSession", "onLogout"]);
  assert.equal(workbench.ui.pendingMembershipPlanId, "");
  assert.equal(workbench.ui.lastBillingOrder, null);
  assert.equal(workbench.ui.lastPaymentIntent, null);
  assert.equal(workbench.ui.membershipPaymentPolling, false);
  assert.match(workbench.ui.toast, /请先登录/);
  assert.doesNotMatch(workbench.root.innerHTML, /membership-payment/);
});

test("closing a membership payment clears the pending qr flow", async () => {
  const workbench = createWorkbench({
    isLibraryPricingModalOpen: true,
    pendingMembershipPlanId: "plan-pro-month",
    pendingMembershipPaymentProvider: "wechat_pay",
    membershipPaymentQrCreatedAt: new Date().toISOString(),
    membershipPaymentQrExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    membershipPaymentPolling: true,
    membershipPaymentPollFailureCount: 1,
    lastBillingOrder: {
      id: "order-membership-1",
      productType: "membership_plan",
      status: "pending_payment",
    },
    lastPaymentIntent: {
      id: "intent-membership-1",
      orderId: "order-membership-1",
      status: "submitted",
    },
    lastPaymentAction: {
      kind: "mock_qr",
      provider: "wechat_pay",
    },
  });

  await handleWorkbenchActionForTest(workbench, {
    dataset: {
      action: "close-membership-payment",
    },
  });

  assert.equal(workbench.ui.isLibraryPricingModalOpen, false);
  assert.equal(workbench.ui.pendingMembershipPlanId, "");
  assert.equal(workbench.ui.pendingMembershipPaymentProvider, "wechat_pay");
  assert.equal(workbench.ui.lastBillingOrder, null);
  assert.equal(workbench.ui.lastPaymentIntent, null);
  assert.equal(workbench.ui.lastPaymentAction, null);
  assert.equal(workbench.ui.membershipPaymentQrCreatedAt, null);
  assert.equal(workbench.ui.membershipPaymentQrExpiresAt, null);
  assert.equal(workbench.ui.membershipPaymentPolling, false);
  assert.equal(workbench.ui.membershipPaymentPollFailureCount, 0);
});

function createWorkbench(uiOverrides = {}, api = {}) {
  const state = buildProjectState();
  const storyboards = createStoryboardList(state);
  return {
    root: {
      innerHTML: "",
      querySelector: () => null,
      querySelectorAll: () => [],
    },
    state,
    session: { user: { phone: "+86 13800138000" } },
    api,
    ui: {
      activeNavTab: "project",
      storyboards,
      selectedStoryboard: storyboards[0],
      selectedModelId: "vidu-q3-pro",
      prompt: "",
      busy: false,
      projectPanelMode: "library",
      projectLibrary: [],
      validationMessage: "",
      toast: "",
      isScriptModalOpen: false,
      isCreateModalOpen: false,
      scriptTab: "script-upload",
      uploadNotice: "",
      defaultScript: "Episode 1",
      ...uiOverrides,
    },
  };
}

function buildProjectState() {
  return {
    project: {
      id: "project-1",
      name: "try",
      phase: "asset_review",
      aspectRatio: "9:16",
      resolution: "1080p",
    },
    assetReview: { readyForGeneration: false },
    assetCandidates: {
      characters: [{ assetKey: "hero", label: "hero", required: true, confirmed: false }],
      scenes: [{ assetKey: "city", label: "city", required: true, confirmed: false }],
      props: [{ assetKey: "sword", label: "sword", required: false, confirmed: false }],
    },
    calibration: null,
    shots: [{
      id: "shot-1",
      title: "Shot 001",
      currentImageAssetVersionId: null,
      currentVideoAssetVersionId: null,
    }],
    exportPreview: null,
  };
}
