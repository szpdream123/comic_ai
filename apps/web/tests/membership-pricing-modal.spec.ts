import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";

import { renderPricingModal } from "../src/features/library-team/pricing-modal.js";

test("does not render credit packages as membership plans when no membership plans are configured", () => {
  const html = renderPricingModal({
    open: true,
    membershipPlans: [],
    packages: [
      {
        id: "credit-starter-120",
        code: "starter_120",
        displayName: "Starter 120",
        credits: 120,
        amountMinor: 9900,
        currency: "CNY",
      },
    ],
  });

  assert.doesNotMatch(html, /Starter 120/);
  assert.doesNotMatch(html, /purchase-billing-package/);
  assert.match(html, /data-membership-empty-state/);
});

test("renders provider payment links instead of a mock qr when the pay action has a real url", () => {
  const html = renderPricingModal({
    open: true,
    paymentIntent: {
      id: "intent-1",
      orderId: "order-1",
      provider: "wechat_pay",
      status: "submitted",
      amountMinor: 19900,
      currency: "CNY",
      merchantOrderNo: "MO-1",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    },
    paymentAction: {
      kind: "provider_console",
      provider: "wechat_pay",
      merchantOrderNo: "MO-1",
      amountMinor: 19900,
      currency: "CNY",
      url: "https://pay.example.test/orders/MO-1",
    },
    billingOrder: {
      id: "order-1",
      status: "pending_payment",
      productType: "membership_plan",
    },
  });

  assert.match(html, /https:\/\/pay\.example\.test\/orders\/MO-1/);
  assert.match(html, /data-payment-real-action/);
  assert.doesNotMatch(html, /library-team-qr-code/);
});

test("renders membership payment qr in a separate modal instead of the subscription layout", () => {
  const html = renderPricingModal({
    open: true,
    membershipPlans: [
      {
        id: "plan-pro-month",
        code: "professional_monthly",
        displayName: "专业版",
        tier: "professional",
        periodUnit: "month",
        periodCount: 1,
        amountMinor: 29900,
        currency: "CNY",
        giftCredits: 3000,
      },
    ],
    paymentIntent: {
      id: "intent-1",
      orderId: "order-1",
      provider: "wechat_pay",
      status: "submitted",
      amountMinor: 29900,
      currency: "CNY",
      merchantOrderNo: "MO-1",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    },
    paymentAction: {
      kind: "mock_qr",
      provider: "wechat_pay",
      merchantOrderNo: "MO-1",
    },
    billingOrder: {
      id: "order-1",
      status: "pending_payment",
      productType: "membership_plan",
    },
    membershipPaymentState: {
      pendingMembershipPlanId: "plan-pro-month",
      polling: true,
    },
  });

  const subscriptionLayout = html.match(/<div class="library-team-subscription-layout">[\s\S]*?<\/div>\s*<\/section>/)?.[0] ?? "";

  assert.match(html, /data-modal="membership-payment"/);
  assert.match(html, /aria-labelledby="membership-payment-title"/);
  assert.match(html, /library-team-payment-card/);
  assert.match(html, /library-team-payment-flow/);
  assert.match(html, /扫码支付/);
  assert.match(html, /权益生效/);
  assert.match(html, /支付成功后自动开通，无需刷新页面/);
  assert.match(html, /请使用手机扫码支付/);
  assert.match(html, /支付方式/);
  assert.match(html, /手机扫码/);
  assert.doesNotMatch(html, /data-action="refresh-payment-intent"/);
  assert.doesNotMatch(html, /刷新状态/);
  assert.doesNotMatch(html, /return-membership-plan-selection/);
  assert.doesNotMatch(html, /请使用微信\/支付宝扫码支付/);
  assert.doesNotMatch(html, /渠道/);
  assert.doesNotMatch(html, /微信支付/);
  assert.doesNotMatch(html, /支付宝/);
  assert.doesNotMatch(subscriptionLayout, /library-team-payment-panel/);
  assert.match(html, /library-team-payment-qr/);
  assert.match(html, /《付费会员服务协议》/);
});

test("renders expired membership payment as blocked instead of a scannable qr", () => {
  const expiredAt = new Date(Date.now() - 1000).toISOString();
  const html = renderPricingModal({
    open: true,
    membershipPlans: [
      {
        id: "plan-pro-month",
        code: "professional_monthly",
        displayName: "专业版",
        tier: "professional",
        periodUnit: "month",
        periodCount: 1,
        amountMinor: 29900,
        currency: "CNY",
        giftCredits: 3000,
      },
    ],
    paymentIntent: {
      id: "intent-1",
      orderId: "order-1",
      provider: "wechat_pay",
      status: "submitted",
      amountMinor: 29900,
      currency: "CNY",
      merchantOrderNo: "MO-1",
      expiresAt: expiredAt,
    },
    paymentAction: {
      kind: "mock_qr",
      provider: "wechat_pay",
      merchantOrderNo: "MO-1",
    },
    billingOrder: {
      id: "order-1",
      status: "pending_payment",
      productType: "membership_plan",
    },
    membershipPaymentState: {
      pendingMembershipPlanId: "plan-pro-month",
      qrExpiresAt: expiredAt,
      polling: false,
    },
  });

  assert.match(html, /data-payment-expired-state/);
  assert.match(html, /二维码已过期，请重新生成后扫码支付/);
  assert.match(html, /data-action="regenerate-membership-payment-qr"/);
  assert.doesNotMatch(html, /library-team-qr-code/);
  assert.doesNotMatch(html, /data-payment-real-action/);
});

test("hides membership payment qr when the paid agreement is unchecked", () => {
  const html = renderPricingModal({
    open: true,
    membershipPlans: [
      {
        id: "plan-pro-month",
        code: "professional_monthly",
        displayName: "专业版",
        tier: "professional",
        periodUnit: "month",
        periodCount: 1,
        amountMinor: 29900,
        currency: "CNY",
        giftCredits: 3000,
      },
    ],
    paymentIntent: {
      id: "intent-1",
      orderId: "order-1",
      provider: "wechat_pay",
      status: "submitted",
      amountMinor: 29900,
      currency: "CNY",
      merchantOrderNo: "MO-1",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    },
    paymentAction: {
      kind: "mock_qr",
      provider: "wechat_pay",
      merchantOrderNo: "MO-1",
    },
    billingOrder: {
      id: "order-1",
      status: "pending_payment",
      productType: "membership_plan",
    },
    membershipPaymentState: {
      pendingMembershipPlanId: "plan-pro-month",
      polling: true,
      agreementAccepted: false,
    },
  });

  assert.match(html, /data-payment-agreement-blocked/);
  assert.match(html, /请先勾选并同意付费会员服务协议/);
  assert.match(html, /data-action="toggle-membership-payment-agreement"/);
  assert.doesNotMatch(html, /data-action="toggle-membership-payment-agreement"[^>]*checked/);
  assert.doesNotMatch(html, /library-team-qr-code/);
  assert.doesNotMatch(html, /data-payment-real-action/);
});

test("shows manual payment refresh only after a long wait or polling failure", () => {
  const basePayment = {
    open: true,
    membershipPlans: [
      {
        id: "plan-pro-month",
        code: "professional_monthly",
        displayName: "专业版",
        tier: "professional",
        periodUnit: "month",
        periodCount: 1,
        amountMinor: 29900,
        currency: "CNY",
        giftCredits: 3000,
      },
    ],
    paymentIntent: {
      id: "intent-1",
      orderId: "order-1",
      provider: "wechat_pay",
      status: "submitted",
      amountMinor: 29900,
      currency: "CNY",
      merchantOrderNo: "MO-1",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    },
    paymentAction: {
      kind: "mock_qr",
      provider: "wechat_pay",
      merchantOrderNo: "MO-1",
    },
    billingOrder: {
      id: "order-1",
      status: "pending_payment",
      productType: "membership_plan",
    },
  };
  const earlyHtml = renderPricingModal({
    ...basePayment,
    membershipPaymentState: {
      pendingMembershipPlanId: "plan-pro-month",
      qrCreatedAt: new Date(Date.now() - 10 * 1000).toISOString(),
      polling: true,
      pollFailureCount: 0,
    },
  });
  const delayedHtml = renderPricingModal({
    ...basePayment,
    membershipPaymentState: {
      pendingMembershipPlanId: "plan-pro-month",
      qrCreatedAt: new Date(Date.now() - 31 * 1000).toISOString(),
      polling: true,
      pollFailureCount: 0,
    },
  });
  const failedPollHtml = renderPricingModal({
    ...basePayment,
    membershipPaymentState: {
      pendingMembershipPlanId: "plan-pro-month",
      qrCreatedAt: new Date(Date.now() - 5 * 1000).toISOString(),
      polling: true,
      pollFailureCount: 1,
    },
  });

  assert.doesNotMatch(earlyHtml, /data-action="refresh-payment-intent"/);
  assert.match(delayedHtml, /data-action="refresh-payment-intent"/);
  assert.match(delayedHtml, /支付后未生效？刷新状态/);
  assert.match(failedPollHtml, /data-action="refresh-payment-intent"/);
  assert.match(failedPollHtml, /支付后未生效？刷新状态/);
});

test("renders a clear membership success state without qr countdown after payment succeeds", () => {
  const html = renderPricingModal({
    open: true,
    membershipPlans: [
      {
        id: "plan-pro-month",
        code: "professional_monthly",
        displayName: "Pro",
        tier: "professional",
        periodUnit: "month",
        periodCount: 1,
        amountMinor: 29900,
        currency: "CNY",
        giftCredits: 3000,
      },
    ],
    paymentIntent: {
      id: "intent-1",
      orderId: "order-1",
      provider: "wechat_pay",
      status: "succeeded",
      amountMinor: 29900,
      currency: "CNY",
      merchantOrderNo: "MO-1",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    },
    paymentAction: {
      kind: "mock_qr",
      provider: "wechat_pay",
      merchantOrderNo: "MO-1",
    },
    billingOrder: {
      id: "order-1",
      status: "paid",
      productType: "membership_plan",
    },
    membershipPaymentState: {
      pendingMembershipPlanId: "plan-pro-month",
      polling: false,
    },
  });

  assert.match(html, /data-payment-success-state/);
  assert.match(html, /library-team-payment-success-hero/);
  assert.doesNotMatch(html, /data-payment-countdown/);
  assert.doesNotMatch(html, /library-team-qr-code/);
  assert.doesNotMatch(html, /data-action="refresh-payment-intent"/);
});

test("renders experience, professional, and enterprise plans as selectable tiers", () => {
  const html = renderPricingModal({
    open: true,
    membershipPlans: [
      {
        id: "plan-experience",
        code: "experience_weekly",
        displayName: "体验版",
        tier: "experience",
        periodUnit: "day",
        periodCount: 7,
        amountMinor: 9900,
        currency: "CNY",
        giftCredits: 300,
      },
      {
        id: "plan-pro-month",
        code: "professional_monthly",
        displayName: "专业版",
        tier: "professional",
        periodUnit: "month",
        periodCount: 1,
        amountMinor: 29900,
        currency: "CNY",
        giftCredits: 3000,
      },
    ],
  });

  assert.match(html, /体验版/);
  assert.match(html, /专业版/);
  assert.match(html, /企业版/);
  assert.match(html, /data-plan-tier="experience"/);
  assert.match(html, /data-plan-tier="professional"/);
  assert.match(html, /request-enterprise-contact/);
});

test("uses subscription copy and canvas benefit for every membership tier", () => {
  const html = renderPricingModal({
    open: true,
    membershipPlans: [
      {
        id: "plan-experience",
        code: "experience_weekly",
        displayName: "体验版",
        tier: "experience",
        periodUnit: "day",
        periodCount: 7,
        amountMinor: 9900,
        currency: "CNY",
        giftCredits: 300,
      },
      {
        id: "plan-pro-month",
        code: "professional_monthly",
        displayName: "专业版月卡",
        tier: "professional",
        periodUnit: "month",
        periodCount: 1,
        amountMinor: 29900,
        currency: "CNY",
        giftCredits: 3000,
      },
    ],
  });

  assert.equal((html.match(/立即订阅/g) ?? []).length, 2);
  assert.doesNotMatch(html, /立即购买/);
  assert.equal((html.match(/可使用画布功能/g) ?? []).length, 3);
  assert.match(html, /data-action="purchase-membership-plan"/);
  assert.match(html, /data-action="request-enterprise-contact"/);
});

test("renders membership benefits from backend display metadata before fallback copy", () => {
  const html = renderPricingModal({
    open: true,
    membershipPlans: [
      {
        id: "plan-pro-month",
        code: "专业版月卡299",
        displayName: "专业版会员套餐",
        tier: "professional",
        periodUnit: "month",
        periodCount: 1,
        amountMinor: 29900,
        currency: "CNY",
        giftCredits: 3000,
        displayMetadata: {
          note: "后台配置的专业会员权益说明",
          features: [
            "可使用画布功能",
            "Seedance 2.0 优先排队",
            "团队成员管理",
            "全流程 Agent",
          ],
        },
      },
    ],
  });

  assert.match(html, /专业版会员套餐/);
  assert.match(html, /¥299/);
  assert.match(html, /3,000 会员积分/);
  assert.match(html, /后台配置的专业会员权益说明/);
  assert.match(html, /可使用画布功能/);
  assert.match(html, /Seedance 2\.0 优先排队/);
  assert.match(html, /团队成员管理/);
  assert.match(html, /全流程 Agent/);
  assert.doesNotMatch(html, /支持 50 人团队/);
});

test("filters known membership benefits when backend entitlements do not include them", () => {
  const html = renderPricingModal({
    open: true,
    membershipPlans: [
      {
        id: "plan-experience",
        code: "experience",
        displayName: "Experience",
        tier: "experience",
        periodUnit: "day",
        periodCount: 7,
        amountMinor: 9900,
        currency: "CNY",
        giftCredits: 100,
        entitlements: ["canvas_access"],
        displayMetadata: {
          features: [
            "可使用画布功能",
            "团队成员管理",
            "自定义运营文案",
          ],
        },
      },
    ],
  });

  assert.match(html, /可使用画布功能/);
  assert.match(html, /自定义运营文案/);
  assert.doesNotMatch(html, /团队成员管理/);
});

test("keeps membership pricing card actions on the same horizontal row", () => {
  const css = readFileSync(
    new URL("../src/features/library-team/library-team.css", import.meta.url),
    "utf8",
  );

  assert.match(css, /\.library-team-plan-card\s*\{[\s\S]*display:\s*grid/);
  assert.match(css, /\.library-team-plan-card\s*\{[\s\S]*grid-template-rows:\s*auto\s+auto\s+auto\s+auto\s+minmax\(3\.4em,\s*auto\)\s+auto\s+1fr/);
  assert.match(css, /\.library-team-badge\.is-placeholder\s*\{[\s\S]*visibility:\s*hidden/);
  assert.match(css, /\.library-team-plan-card\s+\.library-team-button\s*\{[\s\S]*align-self:\s*end/);
});

test("ignores unsafe provider payment urls in the payment modal", () => {
  const html = renderPricingModal({
    open: true,
    paymentIntent: {
      id: "intent-1",
      orderId: "order-1",
      provider: "wechat_pay",
      status: "submitted",
      amountMinor: 19900,
      currency: "CNY",
      merchantOrderNo: "MO-1",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    },
    paymentAction: {
      kind: "provider_console",
      provider: "wechat_pay",
      merchantOrderNo: "MO-1",
      amountMinor: 19900,
      currency: "CNY",
      url: "javascript:alert(1)",
    },
    billingOrder: {
      id: "order-1",
      status: "pending_payment",
      productType: "membership_plan",
    },
  });

  assert.doesNotMatch(html, /javascript:alert/);
  assert.doesNotMatch(html, /data-payment-real-action/);
  assert.match(html, /library-team-qr-code/);
});
