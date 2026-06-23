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

test("creating a direct credit recharge payment requires active membership and keeps credit tab pending", async () => {
  const calls = [];
  const workbench = createWorkbench({
    activeNavTab: "library",
    isLibraryPricingModalOpen: true,
    membershipStatus: { status: "professional_active" },
  }, {
    async createBillingOrder(input) {
      calls.push(["createBillingOrder", input]);
      return {
        order: {
          id: "order-credit-1",
          orderNo: "CO-1",
          productType: "credit_package",
          creditPackageId: input.creditPackageId,
          status: "pending_payment",
        },
      };
    },
    async createPaymentIntent(input) {
      calls.push(["createPaymentIntent", input]);
      return {
        paymentIntent: {
          id: "intent-credit-1",
          orderId: input.orderId,
          status: "submitted",
          provider: input.provider,
          amountMinor: 19900,
          currency: "CNY",
          merchantOrderNo: "CO-1",
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
        payAction: {
          kind: "mock_qr",
          provider: input.provider,
          merchantOrderNo: "CO-1",
        },
      };
    },
  });

  await handleWorkbenchActionForTest(workbench, {
    dataset: {
      action: "purchase-billing-package",
      packageId: "pkg-direct-500",
      provider: "alipay",
    },
  });

  assert.deepEqual(calls, [
    ["createBillingOrder", { creditPackageId: "pkg-direct-500" }],
    ["createPaymentIntent", {
      orderId: "order-credit-1",
      provider: "alipay",
      productMode: "native_qr",
    }],
  ]);
  assert.equal(workbench.ui.pricingModalTab, "credits");
  assert.equal(workbench.ui.pendingBillingPackageId, "pkg-direct-500");
  assert.equal(workbench.ui.pendingMembershipPlanId, "");
  assert.equal(workbench.ui.pendingMembershipPaymentProvider, "alipay");
  assert.equal(workbench.ui.lastBillingOrder.productType, "credit_package");
  assert.equal(workbench.ui.lastPaymentIntent.provider, "alipay");
});

test("creating a membership payment uses the checkout endpoint when available", async () => {
  const calls = [];
  const workbench = createWorkbench({
    activeNavTab: "library",
    isLibraryPricingModalOpen: true,
  }, {
    async createMembershipCheckout(input) {
      calls.push(["createMembershipCheckout", input]);
      return {
        order: {
          id: "order-membership-1",
          orderNo: "MO-1",
          productType: "membership_plan",
          membershipPlanId: input.membershipPlanId,
          status: "pending_payment",
        },
        paymentIntent: {
          id: "intent-membership-1",
          orderId: "order-membership-1",
          status: "submitted",
          provider: input.provider,
          amountMinor: 9900,
          currency: "CNY",
          merchantOrderNo: "MO-1",
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
        payAction: {
          kind: "qr_code",
          provider: input.provider,
          merchantOrderNo: "MO-1",
          amountMinor: 9900,
          currency: "CNY",
          qrCodeImage: "data:image/png;base64,aGVsbG8=",
        },
      };
    },
    async createMembershipOrder(input) {
      calls.push(["createMembershipOrder", input]);
      throw new Error("legacy_membership_order_should_not_run");
    },
    async createPaymentIntent(input) {
      calls.push(["createPaymentIntent", input]);
      throw new Error("legacy_payment_intent_should_not_run");
    },
  });

  await handleWorkbenchActionForTest(workbench, {
    dataset: {
      action: "purchase-membership-plan",
      planId: "plan-experience",
      provider: "alipay",
    },
  });

  assert.deepEqual(calls, [
    ["createMembershipCheckout", {
      membershipPlanId: "plan-experience",
      provider: "alipay",
      productMode: "native_qr",
    }],
  ]);
  assert.equal(workbench.ui.pendingMembershipPlanId, "plan-experience");
  assert.equal(workbench.ui.pendingMembershipPaymentProvider, "alipay");
  assert.equal(workbench.ui.lastBillingOrder.id, "order-membership-1");
  assert.equal(workbench.ui.lastPaymentIntent.id, "intent-membership-1");
  assert.equal(workbench.ui.membershipPaymentCreating, false);
  assert.match(workbench.root.innerHTML, /library-team-payment-qr-image/);
});

test("creating a membership payment shows the generating modal without a session preflight", async () => {
  const checkoutDeferred = createDeferred();
  const calls = [];
  const workbench = createWorkbench({
    activeNavTab: "library",
    isLibraryPricingModalOpen: true,
  }, {
    async getSession() {
      calls.push("getSession");
      throw new Error("session_preflight_should_not_block_checkout");
    },
    async createMembershipCheckout(input) {
      calls.push(["createMembershipCheckout", input]);
      return checkoutDeferred.promise;
    },
  });

  const actionPromise = handleWorkbenchActionForTest(workbench, {
    dataset: {
      action: "purchase-membership-plan",
      planId: "plan-pro-month",
      provider: "alipay",
    },
  });
  await Promise.resolve();

  assert.deepEqual(calls, [
    ["createMembershipCheckout", {
      membershipPlanId: "plan-pro-month",
      provider: "alipay",
      productMode: "native_qr",
    }],
  ]);
  assert.equal(workbench.ui.pendingMembershipPlanId, "plan-pro-month");
  assert.equal(workbench.ui.pendingMembershipPaymentProvider, "alipay");
  assert.equal(workbench.ui.membershipPaymentCreating, true);
  assert.match(workbench.root.innerHTML, /data-membership-payment-creating/);

  checkoutDeferred.resolve({
    order: {
      id: "order-membership-1",
      orderNo: "MO-1",
      productType: "membership_plan",
      membershipPlanId: "plan-pro-month",
      status: "pending_payment",
    },
    paymentIntent: {
      id: "intent-membership-1",
      orderId: "order-membership-1",
      status: "submitted",
      provider: "alipay",
      amountMinor: 29900,
      currency: "CNY",
      merchantOrderNo: "MO-1",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    },
    payAction: {
      kind: "qr_code",
      provider: "alipay",
      merchantOrderNo: "MO-1",
      amountMinor: 29900,
      currency: "CNY",
      qrCodeImage: "data:image/png;base64,aGVsbG8=",
    },
  });
  await actionPromise;

  assert.equal(workbench.ui.membershipPaymentCreating, false);
  assert.equal(workbench.ui.lastPaymentIntent.id, "intent-membership-1");
});

test("creating a direct credit recharge payment is blocked for non-members", async () => {
  const calls = [];
  const workbench = createWorkbench({
    activeNavTab: "library",
    isLibraryPricingModalOpen: true,
    pricingModalTab: "credits",
    membershipStatus: { status: "expired" },
  }, {
    async createBillingOrder(input) {
      calls.push(["createBillingOrder", input]);
      return { order: { id: "order-credit-1" } };
    },
    async createPaymentIntent(input) {
      calls.push(["createPaymentIntent", input]);
      return { paymentIntent: { id: "intent-credit-1", orderId: input.orderId } };
    },
  });

  await handleWorkbenchActionForTest(workbench, {
    dataset: {
      action: "purchase-billing-package",
      packageId: "pkg-direct-500",
      provider: "wechat_pay",
    },
  });

  assert.deepEqual(calls, []);
  assert.equal(workbench.ui.pricingModalTab, "membership");
  assert.equal(workbench.ui.lastBillingOrder ?? null, null);
  assert.equal(workbench.ui.lastPaymentIntent ?? null, null);
  assert.match(workbench.ui.toast, /请先开通会员/);
});

test("refreshing a paid direct credit recharge refreshes wallet credits without membership entitlement sync", async () => {
  const calls = [];
  const workbench = createWorkbench({
    isLibraryPricingModalOpen: true,
    pricingModalTab: "credits",
    pendingBillingPackageId: "pkg-direct-500",
    membershipPaymentPolling: true,
    membershipPaymentQrCreatedAt: new Date().toISOString(),
    membershipPaymentQrExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
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
    async getSession() {
      calls.push("getSession");
      return { user: { phone: "+86 13800138000", availableCredits: 620 } };
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
    "getSession",
    ["getBillingOrder", "order-credit-1"],
    ["getPaymentIntent", "intent-credit-1"],
    "getSession",
  ]);
  assert.equal(workbench.ui.creditBalance, 620);
  assert.equal(workbench.session.user.availableCredits, 620);
  assert.equal(workbench.ui.membershipPaymentPolling, false);
  assert.deepEqual(workbench.ui.toast, { tone: "success", message: "积分已到账" });
  assert.match(workbench.root.innerHTML, /global-workbench-toast success/);
  assert.match(workbench.root.innerHTML, /积分已到账/);
});

test("paid direct credit recharge shows the success toast on the tools canvas surface", async () => {
  const workbench = createWorkbench({
    activeNavTab: "tools",
    canvasProjectView: "detail",
    membershipStatus: { status: "professional_active" },
    isLibraryPricingModalOpen: true,
    pricingModalTab: "credits",
    pendingBillingPackageId: "pkg-direct-500",
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
      return {
        order: {
          id: orderId,
          productType: "credit_package",
          status: "paid",
        },
      };
    },
    async getPaymentIntent(paymentIntentId) {
      return {
        paymentIntent: {
          id: paymentIntentId,
          orderId: "order-credit-1",
          status: "succeeded",
        },
      };
    },
    async getSession() {
      return { user: { phone: "+86 13800138000", availableCredits: 620 } };
    },
  });

  await handleWorkbenchActionForTest(workbench, {
    dataset: {
      action: "refresh-payment-intent",
      paymentIntentId: "intent-credit-1",
      orderId: "order-credit-1",
    },
  });

  assert.match(workbench.root.innerHTML, /canvas-workspace/);
  assert.match(workbench.root.innerHTML, /global-workbench-toast success/);
  assert.match(workbench.root.innerHTML, /积分已到账/);
});

test("paid direct credit recharge closes the payment modal before wallet refresh resolves", async () => {
  const sessionDeferred = createDeferred();
  const walletRefreshStarted = createDeferred();
  const calls = [];
  let sessionCallCount = 0;
  const workbench = createWorkbench({
    isLibraryPricingModalOpen: true,
    pricingModalTab: "credits",
    pendingBillingPackageId: "pkg-direct-500",
    membershipPaymentPolling: true,
    membershipPaymentQrCreatedAt: new Date().toISOString(),
    membershipPaymentQrExpiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
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
    async getSession() {
      sessionCallCount += 1;
      calls.push(["getSession", sessionCallCount]);
      if (sessionCallCount === 1) {
        return { user: { phone: "+86 13800138000", availableCredits: 120 } };
      }
      walletRefreshStarted.resolve();
      return sessionDeferred.promise;
    },
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
  });

  const actionPromise = handleWorkbenchActionForTest(workbench, {
    dataset: {
      action: "refresh-payment-intent",
      paymentIntentId: "intent-credit-1",
      orderId: "order-credit-1",
    },
  });
  await walletRefreshStarted.promise;

  assert.equal(workbench.ui.isLibraryPricingModalOpen, false);
  assert.equal(workbench.ui.membershipPaymentSyncing, false);
  assert.equal(workbench.ui.lastBillingOrder, null);
  assert.equal(workbench.ui.lastPaymentIntent, null);
  assert.equal(workbench.ui.toast, "");
  assert.doesNotMatch(workbench.root.innerHTML, /正在同步积分到账/);
  assert.doesNotMatch(workbench.root.innerHTML, /data-modal="membership-payment"/);

  sessionDeferred.resolve({ user: { phone: "+86 13800138000", availableCredits: 620 } });
  await actionPromise;

  assert.equal(workbench.ui.creditBalance, 620);
  assert.deepEqual(workbench.ui.toast, { tone: "success", message: "积分已到账" });
  assert.match(workbench.root.innerHTML, /global-workbench-toast success/);
  assert.match(workbench.root.innerHTML, /积分已到账/);
  assert.equal(workbench.ui.isLibraryPricingModalOpen, false);
  assert.doesNotMatch(workbench.root.innerHTML, /data-modal="membership-payment"/);
});

test("regenerating an expired direct credit recharge qr creates a new credit package order", async () => {
  const calls = [];
  const workbench = createWorkbench({
    isLibraryPricingModalOpen: true,
    pricingModalTab: "credits",
    pendingBillingPackageId: "pkg-direct-500",
    pendingMembershipPaymentProvider: "wechat_pay",
    membershipStatus: { status: "professional_active" },
    lastBillingOrder: {
      id: "order-credit-old",
      productType: "credit_package",
      creditPackageId: "pkg-direct-500",
      status: "pending_payment",
    },
    lastPaymentIntent: {
      id: "intent-credit-old",
      orderId: "order-credit-old",
      status: "expired",
      provider: "wechat_pay",
    },
  }, {
    async createMembershipOrder(input) {
      calls.push(["createMembershipOrder", input]);
      throw new Error("membership_order_should_not_run");
    },
    async createBillingOrder(input) {
      calls.push(["createBillingOrder", input]);
      return {
        order: {
          id: "order-credit-new",
          productType: "credit_package",
          creditPackageId: input.creditPackageId,
          status: "pending_payment",
        },
      };
    },
    async createPaymentIntent(input) {
      calls.push(["createPaymentIntent", input]);
      return {
        paymentIntent: {
          id: "intent-credit-new",
          orderId: input.orderId,
          status: "submitted",
          provider: input.provider,
          expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
        },
        payAction: { kind: "mock_qr", provider: input.provider },
      };
    },
  });

  await handleWorkbenchActionForTest(workbench, {
    dataset: {
      action: "regenerate-billing-package-payment-qr",
      packageId: "pkg-direct-500",
      provider: "alipay",
    },
  });

  assert.deepEqual(calls, [
    ["createBillingOrder", { creditPackageId: "pkg-direct-500" }],
    ["createPaymentIntent", {
      orderId: "order-credit-new",
      provider: "alipay",
      productMode: "native_qr",
    }],
  ]);
  assert.equal(workbench.ui.pricingModalTab, "credits");
  assert.equal(workbench.ui.pendingBillingPackageId, "pkg-direct-500");
  assert.equal(workbench.ui.lastBillingOrder.id, "order-credit-new");
  assert.equal(workbench.ui.lastPaymentIntent.id, "intent-credit-new");
  assert.equal(workbench.ui.pendingMembershipPaymentProvider, "alipay");
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
  assert.deepEqual(workbench.ui.toast, { tone: "success", message: "会员权益已开通" });
  assert.match(workbench.root.innerHTML, /global-workbench-toast success/);
  assert.match(workbench.root.innerHTML, /会员权益已开通/);
  assert.equal(workbench.ui.isLibraryPricingModalOpen, false);
  assert.equal(workbench.ui.pendingMembershipPlanId, "");
  assert.equal(workbench.ui.lastBillingOrder, null);
  assert.equal(workbench.ui.lastPaymentIntent, null);
  assert.doesNotMatch(workbench.root.innerHTML, /data-modal="membership-payment"/);
});

test("paid membership payment closes the payment modal without forcing a page refresh", async () => {
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
  assert.deepEqual(workbench.ui.toast, { tone: "success", message: "会员权益已开通" });
  assert.equal(workbench.ui.isLibraryPricingModalOpen, false);
  assert.equal(workbench.ui.pendingMembershipPlanId, "");
  assert.equal(workbench.ui.lastBillingOrder, null);
  assert.equal(workbench.ui.lastPaymentIntent, null);
  assert.equal(workbench.ui.membershipPaymentPolling, false);
  assert.deepEqual(reloads, []);
  assert.doesNotMatch(workbench.root.innerHTML, /data-modal="membership-payment"/);
});

test("simulating a membership payment success runs callback then activates membership", async () => {
  const calls = [];
  const reloads = [];
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
    async simulatePaymentIntentSuccess(input) {
      calls.push(["simulatePaymentIntentSuccess", input]);
      return { simulated: true, order: { id: "order-membership-1", status: "paid" } };
    },
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
  workbench.paymentPollClearTimeout = () => {
    calls.push("paymentPollClearTimeout");
  };
  workbench.membershipPaymentPollTimer = { active: true };
  workbench.requestPageRefreshAfterMembershipPaymentSuccess = () => {
    reloads.push("reload");
  };

  await handleWorkbenchActionForTest(workbench, {
    dataset: {
      action: "simulate-membership-payment-success",
      paymentIntentId: "intent-membership-1",
      orderId: "order-membership-1",
    },
  });

  assert.deepEqual(calls, [
    "paymentPollClearTimeout",
    ["simulatePaymentIntentSuccess", { paymentIntentId: "intent-membership-1" }],
    ["getBillingOrder", "order-membership-1"],
    ["getPaymentIntent", "intent-membership-1"],
    "getMembershipPlans",
    "getMembershipStatus",
    "getTeamOverview",
    "getTeamMembers",
  ]);
  assert.equal(workbench.ui.membershipStatus.status, "professional_active");
  assert.equal(workbench.ui.membershipPaymentPolling, false);
  assert.equal(workbench.membershipPaymentPollTimer, null);
  assert.deepEqual(workbench.ui.toast, { tone: "success", message: "会员权益已开通" });
  assert.equal(workbench.ui.isLibraryPricingModalOpen, false);
  assert.equal(workbench.ui.pendingMembershipPlanId, "");
  assert.equal(workbench.ui.lastBillingOrder, null);
  assert.equal(workbench.ui.lastPaymentIntent, null);
  assert.deepEqual(reloads, []);
  assert.doesNotMatch(workbench.root.innerHTML, /data-modal="membership-payment"/);
});

test("simulating membership payment success shows syncing success state before refresh resolves", async () => {
  const simulateDeferred = createDeferred();
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
    pendingMembershipPlanId: "plan-pro-month",
    membershipPaymentPolling: true,
  }, {
    async simulatePaymentIntentSuccess(input) {
      calls.push(["simulatePaymentIntentSuccess", input]);
      return simulateDeferred.promise;
    },
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
          provider: "wechat_pay",
          amountMinor: 29900,
          currency: "CNY",
          merchantOrderNo: "MO-1",
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
  workbench.paymentPollClearTimeout = () => {
    calls.push("paymentPollClearTimeout");
  };
  workbench.membershipPaymentPollTimer = { active: true };

  const actionPromise = handleWorkbenchActionForTest(workbench, {
    dataset: {
      action: "simulate-membership-payment-success",
      paymentIntentId: "intent-membership-1",
      orderId: "order-membership-1",
    },
  });
  await Promise.resolve();

  assert.equal(workbench.ui.membershipPaymentSyncing, true);
  assert.equal(workbench.ui.membershipPaymentPolling, false);
  assert.equal(workbench.ui.lastBillingOrder.status, "paid");
  assert.equal(workbench.ui.lastPaymentIntent.status, "succeeded");
  assert.match(workbench.root.innerHTML, /data-payment-success-state/);
  assert.match(workbench.root.innerHTML, /正在同步会员权益/);

  simulateDeferred.resolve({ simulated: true, order: { id: "order-membership-1", status: "paid" } });
  await actionPromise;

  assert.equal(workbench.ui.membershipPaymentSyncing, false);
  assert.equal(workbench.ui.membershipStatus.status, "professional_active");
  assert.equal(workbench.ui.isLibraryPricingModalOpen, false);
  assert.equal(workbench.ui.pendingMembershipPlanId, "");
  assert.equal(workbench.ui.lastBillingOrder, null);
  assert.equal(workbench.ui.lastPaymentIntent, null);
  assert.doesNotMatch(workbench.root.innerHTML, /data-modal="membership-payment"/);
});

test("simulated paid membership closes the payment modal before entitlement refresh resolves", async () => {
  const membershipDeferred = createDeferred();
  const membershipRefreshStarted = createDeferred();
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
    async simulatePaymentIntentSuccess(input) {
      calls.push(["simulatePaymentIntentSuccess", input]);
      return { simulated: true, order: { id: "order-membership-1", status: "paid" } };
    },
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
      membershipRefreshStarted.resolve();
      return membershipDeferred.promise;
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

  const actionPromise = handleWorkbenchActionForTest(workbench, {
    dataset: {
      action: "simulate-membership-payment-success",
      paymentIntentId: "intent-membership-1",
      orderId: "order-membership-1",
    },
  });
  await membershipRefreshStarted.promise;

  assert.equal(workbench.ui.isLibraryPricingModalOpen, false);
  assert.equal(workbench.ui.membershipPaymentSyncing, false);
  assert.equal(workbench.ui.lastBillingOrder, null);
  assert.equal(workbench.ui.lastPaymentIntent, null);
  assert.equal(workbench.ui.toast, "");
  assert.doesNotMatch(workbench.root.innerHTML, /正在同步会员权益/);
  assert.doesNotMatch(workbench.root.innerHTML, /data-modal="membership-payment"/);

  membershipDeferred.resolve({
    membership: {
      status: "professional_active",
      entitlements: { teamAssetLibrary: true },
    },
  });
  await actionPromise;

  assert.equal(workbench.ui.membershipStatus.status, "professional_active");
  assert.deepEqual(workbench.ui.toast, { tone: "success", message: "会员权益已开通" });
  assert.match(workbench.root.innerHTML, /global-workbench-toast success/);
  assert.match(workbench.root.innerHTML, /会员权益已开通/);
  assert.equal(workbench.ui.isLibraryPricingModalOpen, false);
  assert.doesNotMatch(workbench.root.innerHTML, /data-modal="membership-payment"/);
});

test("paid membership payment shows the success toast on the tools canvas surface", async () => {
  const workbench = createWorkbench({
    activeNavTab: "tools",
    canvasProjectView: "detail",
    membershipStatus: { status: "professional_active" },
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
      return {
        order: {
          id: orderId,
          productType: "membership_plan",
          status: "paid",
        },
      };
    },
    async getPaymentIntent(paymentIntentId) {
      return {
        paymentIntent: {
          id: paymentIntentId,
          orderId: "order-membership-1",
          status: "succeeded",
        },
      };
    },
    async getMembershipPlans() {
      return { data: { plans: [] } };
    },
    async getMembershipStatus() {
      return {
        membership: {
          status: "professional_active",
          entitlements: { teamAssetLibrary: true },
        },
      };
    },
  });

  await handleWorkbenchActionForTest(workbench, {
    dataset: {
      action: "refresh-payment-intent",
      paymentIntentId: "intent-membership-1",
      orderId: "order-membership-1",
    },
  });

  assert.match(workbench.root.innerHTML, /canvas-workspace/);
  assert.match(workbench.root.innerHTML, /global-workbench-toast success/);
  assert.match(workbench.root.innerHTML, /会员权益已开通/);
});

test("opening and closing the wallet clears the membership payment success toast", async () => {
  const calls = [];
  const workbench = createWorkbench({
    toast: { tone: "success", message: "会员权益已开通" },
  }, {
    async getCreditLedger(input) {
      calls.push(["getCreditLedger", input]);
      return { data: [], summary: { displayAvailableCredits: 120 } };
    },
  });

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "open-credit-ledger" },
  });

  assert.deepEqual(calls, [["getCreditLedger", { pageSize: 80 }]]);
  assert.equal(workbench.ui.creditLedgerOpen, true);
  assert.equal(workbench.ui.toast, "");

  workbench.ui.toast = { tone: "success", message: "会员权益已开通" };

  await handleWorkbenchActionForTest(workbench, {
    dataset: { action: "close-credit-ledger" },
  });

  assert.equal(workbench.ui.creditLedgerOpen, false);
  assert.equal(workbench.ui.toast, "");
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

test("creating a membership payment opens a generating qr modal before the order resolves", async () => {
  const orderDeferred = createDeferred();
  const calls = [];
  const workbench = createWorkbench({
    activeNavTab: "library",
    isLibraryPricingModalOpen: true,
  }, {
    async createMembershipOrder(input) {
      calls.push(["createMembershipOrder", input]);
      return orderDeferred.promise;
    },
    async createPaymentIntent(input) {
      calls.push(["createPaymentIntent", input]);
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

  const actionPromise = handleWorkbenchActionForTest(workbench, {
    dataset: {
      action: "purchase-membership-plan",
      planId: "plan-pro-month",
      provider: "alipay",
    },
  });
  await Promise.resolve();

  assert.equal(workbench.ui.pendingMembershipPlanId, "plan-pro-month");
  assert.equal(workbench.ui.pendingMembershipPaymentProvider, "alipay");
  assert.equal(workbench.ui.membershipPaymentCreating, true);
  assert.equal(workbench.ui.lastPaymentIntent ?? null, null);
  assert.match(workbench.root.innerHTML, /data-modal="membership-payment"/);
  assert.match(workbench.root.innerHTML, /data-membership-payment-creating/);
  assert.match(workbench.root.innerHTML, /正在生成支付二维码/);

  orderDeferred.resolve({
    order: {
      id: "order-membership-1",
      orderNo: "MO-1",
      membershipPlanId: "plan-pro-month",
      productType: "membership_plan",
      status: "pending_payment",
    },
  });
  await actionPromise;

  assert.equal(workbench.ui.membershipPaymentCreating, false);
  assert.equal(workbench.ui.lastPaymentIntent.provider, "alipay");
});

test("creating a membership payment uses the selected Alipay provider", async () => {
  const calls = [];
  const workbench = createWorkbench({
    activeNavTab: "library",
    isLibraryPricingModalOpen: true,
  }, {
    async createMembershipOrder(input) {
      calls.push(["createMembershipOrder", input]);
      return { order: { id: "order-membership-1", orderNo: "MO-1", membershipPlanId: input.membershipPlanId } };
    },
    async createPaymentIntent(input) {
      calls.push(["createPaymentIntent", input]);
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

  await handleWorkbenchActionForTest(workbench, {
    dataset: {
      action: "purchase-membership-plan",
      planId: "plan-pro-month",
      provider: "alipay",
    },
  });

  assert.deepEqual(calls.map(([name]) => name), ["createMembershipOrder", "createPaymentIntent"]);
  assert.equal(calls[1][1].provider, "alipay");
  assert.equal(workbench.ui.pendingMembershipPaymentProvider, "alipay");
  assert.equal(workbench.ui.lastPaymentIntent.provider, "alipay");
  assert.equal(workbench.ui.lastPaymentAction.provider, "alipay");
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

test("opening pricing clears an unfinished payment flow and shows the plan list", async () => {
  const workbench = createWorkbench({
    isLibraryPricingModalOpen: false,
    pricingModalTab: "membership",
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
      provider: "wechat_pay",
    },
    lastPaymentAction: {
      kind: "mock_qr",
      provider: "wechat_pay",
    },
  });

  await handleWorkbenchActionForTest(workbench, {
    dataset: {
      action: "open-pricing",
    },
  });

  assert.equal(workbench.ui.isLibraryPricingModalOpen, true);
  assert.equal(workbench.ui.pendingMembershipPlanId, "");
  assert.equal(workbench.ui.pendingMembershipPaymentProvider, "wechat_pay");
  assert.equal(workbench.ui.lastBillingOrder, null);
  assert.equal(workbench.ui.lastPaymentIntent, null);
  assert.equal(workbench.ui.lastPaymentAction, null);
  assert.equal(workbench.ui.membershipPaymentPolling, false);
  assert.equal(workbench.ui.membershipPaymentPollFailureCount, 0);
  assert.match(workbench.root.innerHTML, /data-modal="pricing"/);
  assert.doesNotMatch(workbench.root.innerHTML, /data-modal="membership-payment"/);
});

test("membership payment rerenders preserve the modal scroll position", async () => {
  const root = createScrollableMembershipPaymentRoot(240);
  const workbench = createWorkbench({
    isLibraryPricingModalOpen: true,
    pendingMembershipPlanId: "plan-pro-month",
    pendingMembershipPaymentProvider: "wechat_pay",
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
    },
  });
  workbench.root = root;

  await handleWorkbenchActionForTest(workbench, {
    checked: false,
    dataset: {
      action: "toggle-membership-payment-agreement",
    },
  });

  assert.equal(root.modal.scrollTop, 240);
});

test("pricing modal rerenders preserve the subscription modal scroll position", async () => {
  const root = createScrollableLibraryTeamModalRoot(".library-team-pricing-modal", 0);
  const workbench = createWorkbench({
    activeNavTab: "library",
    isLibraryPricingModalOpen: true,
    pricingModalTab: "membership",
    membershipStatus: { status: "professional_active" },
  });
  workbench.root = root;
  root.modal.scrollTop = 260;

  await handleWorkbenchActionForTest(workbench, {
    dataset: {
      action: "switch-pricing-tab",
      pricingTabTarget: "credits",
    },
  });

  assert.equal(root.modal.scrollTop, 260);
});

test("closing while simulated payment success is syncing keeps the payment modal closed", async () => {
  const simulateDeferred = createDeferred();
  const workbench = createWorkbench({
    isLibraryPricingModalOpen: true,
    pendingMembershipPlanId: "plan-pro-month",
    pendingMembershipPaymentProvider: "wechat_pay",
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
    },
    lastPaymentAction: {
      kind: "mock_qr",
      provider: "wechat_pay",
    },
  }, {
    async simulatePaymentIntentSuccess() {
      return simulateDeferred.promise;
    },
    async getBillingOrder(orderId) {
      return {
        order: {
          id: orderId,
          productType: "membership_plan",
          status: "paid",
        },
      };
    },
    async getPaymentIntent(paymentIntentId) {
      return {
        paymentIntent: {
          id: paymentIntentId,
          orderId: "order-membership-1",
          status: "succeeded",
          provider: "wechat_pay",
          amountMinor: 29900,
          currency: "CNY",
        },
      };
    },
    async getMembershipStatus() {
      return {
        membership: {
          status: "professional_active",
          entitlements: { teamAssetLibrary: true },
        },
      };
    },
  });

  const actionPromise = handleWorkbenchActionForTest(workbench, {
    dataset: {
      action: "simulate-membership-payment-success",
      paymentIntentId: "intent-membership-1",
      orderId: "order-membership-1",
    },
  });
  await Promise.resolve();

  assert.equal(workbench.ui.busy, true);
  assert.equal(workbench.ui.membershipPaymentSyncing, true);

  await handleWorkbenchActionForTest(workbench, {
    dataset: {
      action: "close-membership-payment",
    },
  });

  assert.equal(workbench.ui.isLibraryPricingModalOpen, false);
  assert.doesNotMatch(workbench.root.innerHTML, /data-modal="membership-payment"/);

  simulateDeferred.resolve({ simulated: true });
  await actionPromise;

  assert.equal(workbench.ui.isLibraryPricingModalOpen, false);
  assert.equal(workbench.ui.lastBillingOrder, null);
  assert.equal(workbench.ui.lastPaymentIntent, null);
  assert.equal(workbench.ui.membershipPaymentSyncing, false);
  assert.doesNotMatch(workbench.root.innerHTML, /data-modal="membership-payment"/);
});

function createDeferred() {
  let resolve;
  let reject;
  const promise = new Promise((promiseResolve, promiseReject) => {
    resolve = promiseResolve;
    reject = promiseReject;
  });
  return { promise, resolve, reject };
}

function createScrollableMembershipPaymentRoot(initialScrollTop) {
  return createScrollableLibraryTeamModalRoot(".library-team-payment-modal", initialScrollTop);
}

function createScrollableLibraryTeamModalRoot(modalSelector, initialScrollTop) {
  const modalClassName = modalSelector === ".library-team-payment-modal"
    ? "library-team-modal library-team-payment-modal"
    : "library-team-modal library-team-pricing-modal";
  let modal = { className: modalClassName, scrollTop: initialScrollTop, scrollLeft: 0 };
  return {
    get modal() {
      return modal;
    },
    _innerHTML: "",
    get innerHTML() {
      return this._innerHTML;
    },
    set innerHTML(value) {
      this._innerHTML = value;
      modal = { className: modalClassName, scrollTop: 0, scrollLeft: 0 };
    },
    querySelector(selector) {
      if (selector === ".library-team-payment-modal, .library-team-pricing-modal") {
        return modalSelector === ".library-team-payment-modal" || modalSelector === ".library-team-pricing-modal"
          ? modal
          : null;
      }
      if (
        selector === modalSelector ||
        selector === ".library-team-modal" ||
        selector === "[data-modal=\"pricing\"] .library-team-modal" ||
        selector === "[data-modal=\"membership-payment\"] .library-team-modal"
      ) {
        return modal;
      }
      return null;
    },
    querySelectorAll() {
      return [];
    },
  };
}

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
