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

test("renders provider qr code images for url-based payment codes", () => {
  const html = renderPricingModal({
    open: true,
    paymentIntent: {
      id: "intent-qr-image",
      orderId: "order-qr-image",
      provider: "alipay",
      status: "submitted",
      amountMinor: 1,
      currency: "CNY",
      merchantOrderNo: "MO-QR-IMAGE",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    },
    paymentAction: {
      kind: "qr_code",
      provider: "alipay",
      merchantOrderNo: "MO-QR-IMAGE",
      amountMinor: 1,
      currency: "CNY",
      url: "https://qr.alipay.com/test",
      codeUrl: "https://qr.alipay.com/test",
      qrCodeImage: "data:image/svg+xml;base64,PHN2Zy8+",
    },
    billingOrder: {
      id: "order-qr-image",
      status: "pending_payment",
      productType: "membership_plan",
    },
  });

  assert.match(html, /library-team-payment-qr-image/);
  assert.match(html, /data:image\/svg\+xml;base64,PHN2Zy8\+/);
  assert.doesNotMatch(html, /打开支付页面/);
});

test("renders real provider code urls as scannable qr svg when no qr image is returned", () => {
  const html = renderPricingModal({
    open: true,
    paymentIntent: {
      id: "intent-code-url",
      orderId: "order-code-url",
      provider: "wechat_pay",
      status: "submitted",
      amountMinor: 1,
      currency: "CNY",
      merchantOrderNo: "MO-CODE-URL",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    },
    paymentAction: {
      kind: "qr_code",
      provider: "wechat_pay",
      merchantOrderNo: "MO-CODE-URL",
      amountMinor: 1,
      currency: "CNY",
      url: "weixin://wxpay/bizpayurl?pr=test-native-code",
      codeUrl: "weixin://wxpay/bizpayurl?pr=test-native-code",
    },
    billingOrder: {
      id: "order-code-url",
      status: "pending_payment",
      productType: "membership_plan",
    },
  });

  assert.match(html, /data-payment-real-action/);
  assert.match(html, /data-payment-code-url/);
  assert.match(html, /library-team-payment-qr-svg/);
  assert.doesNotMatch(html, /打开微信支付支付页面/);
  assert.doesNotMatch(html, /微信支付未返回真实二维码/);
});

test("renders standard qr svg markup for scannable wechat payment payloads", () => {
  const html = renderPricingModal({
    open: true,
    paymentIntent: {
      id: "intent-std-qr",
      orderId: "order-std-qr",
      provider: "wechat_pay",
      status: "submitted",
      amountMinor: 1,
      currency: "CNY",
      merchantOrderNo: "MO-STD-QR",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    },
    paymentAction: {
      kind: "qr_code",
      provider: "wechat_pay",
      merchantOrderNo: "MO-STD-QR",
      amountMinor: 1,
      currency: "CNY",
      url: "weixin://wxpay/bizpayurl?pr=test-native-code",
      codeUrl: "weixin://wxpay/bizpayurl?pr=test-native-code",
    },
    billingOrder: {
      id: "order-std-qr",
      status: "pending_payment",
      productType: "membership_plan",
    },
  });

  assert.match(html, /shape-rendering="crispEdges"/);
  assert.match(html, /<path stroke="#14171d"/);
  assert.doesNotMatch(html, /path fill="#14171d"/);
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
  const paymentModal = html.match(/<div class="library-team-modal-backdrop library-team-payment-modal-backdrop"[\s\S]*$/)?.[0] ?? "";

  assert.match(html, /data-modal="membership-payment"/);
  assert.match(html, /aria-labelledby="membership-payment-title"/);
  assert.match(html, /library-team-payment-card/);
  assert.match(html, /支付成功后自动开通，无需刷新页面/);
  assert.match(html, /微信支付未返回真实二维码/);
  assert.match(html, /请确认微信支付配置已启用/);
  assert.doesNotMatch(html, /data-action="refresh-payment-intent"/);
  assert.doesNotMatch(html, /刷新状态/);
  assert.doesNotMatch(html, /return-membership-plan-selection/);
  assert.doesNotMatch(html, /渠道/);
  assert.doesNotMatch(paymentModal, /支付宝/);
  assert.doesNotMatch(subscriptionLayout, /library-team-payment-panel/);
  assert.match(html, /library-team-payment-qr/);
  assert.match(html, /《付费会员服务协议》/);
});

test("renders membership payment generating state before payment intent exists", () => {
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
    membershipPaymentState: {
      pendingMembershipPlanId: "plan-pro-month",
      provider: "alipay",
      creating: true,
    },
  });

  assert.match(html, /data-modal="membership-payment"/);
  assert.match(html, /data-membership-payment-creating/);
  assert.match(html, /正在生成支付二维码/);
  assert.match(html, /支付宝订单创建中/);
  assert.doesNotMatch(html, /data-payment-countdown/);
  assert.doesNotMatch(html, /data-action="refresh-payment-intent"/);
});

test("does not render local payment simulation action on localhost", () => {
  const originalWindow = globalThis.window;
  globalThis.window = { location: { host: "localhost:4310" } };
  try {
    const html = renderPricingModal({
      open: true,
      paymentIntent: {
        id: "intent-no-simulation",
        orderId: "order-no-simulation",
        provider: "wechat_pay",
        status: "submitted",
        amountMinor: 1,
        currency: "CNY",
        merchantOrderNo: "MO-LOCAL-SIM",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      },
      paymentAction: {
        kind: "qr_code",
        provider: "wechat_pay",
        merchantOrderNo: "MO-LOCAL-SIM",
        amountMinor: 1,
        currency: "CNY",
        url: "weixin://wxpay/bizpayurl?pr=test",
        qrCodeImage: "data:image/png;base64,aGVsbG8=",
      },
      billingOrder: {
        id: "order-no-simulation",
        status: "pending_payment",
        productType: "membership_plan",
      },
    });

    assert.doesNotMatch(html, /simulate-membership-payment-success/);
    assert.doesNotMatch(html, /本地模拟支付成功/);
  } finally {
    globalThis.window = originalWindow;
  }
});

test("does not render local mock payment actions as a scannable acceptance qr", () => {
  const originalWindow = globalThis.window;
  globalThis.window = { location: { host: "127.0.0.1:4310" } };
  try {
    const html = renderPricingModal({
      open: true,
      paymentIntent: {
        id: "intent-local-qr",
        orderId: "order-local-qr",
        provider: "alipay",
        status: "submitted",
        amountMinor: 1,
        currency: "CNY",
        merchantOrderNo: "MO-LOCAL-QR",
        expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
      },
      paymentAction: {
        kind: "mock_qr",
        provider: "alipay",
        merchantOrderNo: "MO-LOCAL-QR",
        amountMinor: 1,
        currency: "CNY",
      },
      billingOrder: {
        id: "order-local-qr",
        status: "pending_payment",
        productType: "membership_plan",
      },
    });

    assert.doesNotMatch(html, /data-payment-local-qr/);
    assert.doesNotMatch(html, /comic-ai-local-payment:\/\/alipay\/MO-LOCAL-QR/);
    assert.doesNotMatch(html, /library-team-payment-qr-svg/);
    assert.doesNotMatch(html, /本地验收二维码/);
    assert.match(html, /支付宝未返回真实二维码/);
  } finally {
    globalThis.window = originalWindow;
  }
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

test("keeps backend membership plan order in the pricing grid", () => {
  const html = renderPricingModal({
    open: true,
    membershipPlans: [
      {
        id: "plan-second-price",
        code: "second_price",
        displayName: "后台第一张会员卡",
        tier: "professional",
        periodUnit: "month",
        periodCount: 1,
        amountMinor: 39900,
        currency: "CNY",
        giftCredits: 3000,
      },
      {
        id: "plan-first-price",
        code: "first_price",
        displayName: "后台第二张会员卡",
        tier: "experience",
        periodUnit: "day",
        periodCount: 7,
        amountMinor: 9900,
        currency: "CNY",
        giftCredits: 300,
      },
    ],
  });

  assert.ok(html.indexOf("后台第一张会员卡") < html.indexOf("后台第二张会员卡"));
});

test("renders WeChat and Alipay subscription actions for membership plans", () => {
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

  assert.doesNotMatch(html, /立即购买/);
  assert.equal((html.match(/可使用画布功能/g) ?? []).length, 3);
  assert.match(html, /data-action="purchase-membership-plan"/);
  assert.match(html, /data-action="request-enterprise-contact"/);
  assert.match(html, /微信订阅/);
  assert.match(html, /支付宝订阅/);
  assert.match(html, /data-provider="wechat_pay"/);
  assert.match(html, /data-provider="alipay"/);
  assert.doesNotMatch(html, />立即订阅<\/button>/);
});

test("renders direct recharge tab with active member package actions", () => {
  const html = renderPricingModal({
    open: true,
    pricingTab: "credits",
    membershipStatus: { status: "professional_active" },
    packages: [
      {
        id: "pkg-direct-500",
        code: "direct_500",
        displayName: "500 积分",
        credits: 500,
        amountMinor: 19900,
        currency: "CNY",
        metadata: { kind: "direct_recharge" },
      },
      {
        id: "pkg-legacy",
        code: "legacy",
        displayName: "Legacy",
        credits: 10,
        amountMinor: 100,
        currency: "CNY",
      },
    ],
  });

  assert.match(html, /data-pricing-tab="credits"/);
  assert.match(html, /积分直充/);
  assert.match(html, /500 积分/);
  assert.match(html, /仅增加积分，不延长会员有效期/);
  assert.match(html, /data-action="purchase-billing-package"/);
  assert.match(html, /data-package-id="pkg-direct-500"/);
  assert.match(html, /微信充值/);
  assert.match(html, /支付宝充值/);
  assert.doesNotMatch(html, /Legacy/);
});

test("keeps backend direct recharge package order in the pricing grid", () => {
  const html = renderPricingModal({
    open: true,
    pricingTab: "credits",
    membershipStatus: { status: "professional_active" },
    packages: [
      {
        id: "pkg-backend-first",
        code: "backend_first",
        displayName: "后台第一张积分卡",
        credits: 500,
        amountMinor: 39900,
        currency: "CNY",
        metadata: { kind: "direct_recharge" },
      },
      {
        id: "pkg-backend-second",
        code: "backend_second",
        displayName: "后台第二张积分卡",
        credits: 100,
        amountMinor: 9900,
        currency: "CNY",
        metadata: { kind: "direct_recharge" },
      },
    ],
  });

  assert.ok(html.indexOf("后台第一张积分卡") < html.indexOf("后台第二张积分卡"));
});

test("blocks direct recharge tab for non-members", () => {
  const html = renderPricingModal({
    open: true,
    pricingTab: "credits",
    membershipStatus: { status: "expired" },
    packages: [
      {
        id: "pkg-direct-500",
        code: "direct_500",
        displayName: "500 积分",
        credits: 500,
        amountMinor: 19900,
        currency: "CNY",
        metadata: { kind: "direct_recharge" },
      },
    ],
  });

  assert.match(html, /data-direct-recharge-blocked/);
  assert.match(html, /开通会员后可充值积分/);
  assert.match(html, />开通会员<\/button>/);
  assert.doesNotMatch(html, /先开通会员/);
  assert.match(html, /data-action="switch-pricing-tab"/);
  assert.match(html, /data-pricing-tab-target="membership"/);
  assert.doesNotMatch(html, /purchase-billing-package/);
  assert.doesNotMatch(html, /library-team-empty-icon[^>]*>C</);
  assert.doesNotMatch(html, /library-team-subscription-mark[^>]*>C</);
});

test("renders credit recharge payment copy instead of membership entitlement copy", () => {
  const html = renderPricingModal({
    open: true,
    pricingTab: "credits",
    membershipStatus: { status: "professional_active" },
    packages: [
      {
        id: "pkg-direct-500",
        code: "direct_500",
        displayName: "500 积分",
        credits: 500,
        amountMinor: 19900,
        currency: "CNY",
        metadata: { kind: "direct_recharge" },
      },
    ],
    paymentIntent: {
      id: "intent-credit",
      orderId: "order-credit",
      provider: "wechat_pay",
      status: "succeeded",
      amountMinor: 19900,
      currency: "CNY",
      merchantOrderNo: "MO-CREDIT",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    },
    paymentAction: {
      kind: "mock_qr",
      provider: "wechat_pay",
      merchantOrderNo: "MO-CREDIT",
    },
    billingOrder: {
      id: "order-credit",
      status: "paid",
      productType: "credit_package",
      creditPackageId: "pkg-direct-500",
      credits: 500,
    },
    membershipPaymentState: {
      pendingBillingPackageId: "pkg-direct-500",
      polling: false,
    },
  });

  assert.match(html, /积分已到账/);
  assert.match(html, /积分支付/);
  assert.match(html, /500 积分/);
  assert.doesNotMatch(html, /会员权益已生效/);
  assert.doesNotMatch(html, /权益生效/);
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
        entitlements: [
          "canvas_access",
          "priority_generation",
          "team_asset_library",
          "team_member_management",
          "full_flow_agent",
        ],
        displayMetadata: {
          note: "后台配置的专业会员权益说明",
          features: [
            "Seedance 2.0 优先排队",
            "团队成员管理",
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
  assert.match(html, /团队资产库/);
  assert.match(html, /团队成员管理/);
  assert.match(html, /全流程 Agent/);
  assert.doesNotMatch(html, /支持 50 人团队/);
});

test("does not render a hard-coded note for backend membership plans", () => {
  const html = renderPricingModal({
    open: true,
    membershipPlans: [
      {
        id: "plan-basic",
        code: "basic_weekly",
        displayName: "基础版套餐",
        tier: "experience",
        periodUnit: "day",
        periodCount: 7,
        amountMinor: 9900,
        currency: "CNY",
        giftCredits: 100,
        entitlements: ["canvas_access"],
        displayMetadata: { features: ["可使用画布功能"] },
      },
    ],
  });

  assert.doesNotMatch(html, /适合短期体验专业权益和会员积分。/);
  assert.equal((html.match(/library-team-plan-note/g) || []).length, 1);
});

test("keeps membership cards aligned with backend entitlement configuration", () => {
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
        entitlements: ["canvas_access", "priority_generation", "full_flow_agent"],
        displayMetadata: {
          features: [
            "Seedance 2.0 优先排队",
          ],
        },
      },
    ],
  });

  assert.match(html, /可使用画布功能/);
  assert.match(html, /Seedance 2\.0 优先排队/);
  assert.match(html, /全流程 Agent/);
  assert.doesNotMatch(html, /团队成员管理/);
});

test("renders Alipay copy when the payment intent uses Alipay", () => {
  const html = renderPricingModal({
    open: true,
    paymentIntent: {
      id: "intent-alipay",
      orderId: "order-alipay",
      provider: "alipay",
      status: "submitted",
      amountMinor: 29900,
      currency: "CNY",
      merchantOrderNo: "MO-ALIPAY",
      expiresAt: new Date(Date.now() + 15 * 60 * 1000).toISOString(),
    },
    paymentAction: {
      kind: "mock_qr",
      provider: "alipay",
      merchantOrderNo: "MO-ALIPAY",
    },
    billingOrder: {
      id: "order-alipay",
      status: "pending_payment",
      productType: "membership_plan",
    },
  });

  const paymentModal = html.match(/<div class="library-team-modal-backdrop library-team-payment-modal-backdrop"[\s\S]*$/)?.[0] ?? "";

  assert.match(paymentModal, /支付宝未返回真实二维码/);
  assert.doesNotMatch(paymentModal, /微信扫码支付/);
});

test("renders sub-yuan membership prices with cents", () => {
  const html = renderPricingModal({
    open: true,
    membershipPlans: [
      {
        id: "plan-test-cent",
        code: "experience_test_cent",
        displayName: "测试版",
        tier: "experience",
        periodUnit: "day",
        periodCount: 1,
        amountMinor: 1,
        currency: "CNY",
        giftCredits: 1,
        displayMetadata: { sortOrder: 1 },
      },
    ],
  });

  assert.match(html, /测试版/);
  assert.match(html, /¥0\.01/);
});

test("renders a prominent accessible close button for the membership pricing modal", () => {
  const html = renderPricingModal({ open: true });
  const css = readFileSync(
    new URL("../src/features/library-team/library-team.css", import.meta.url),
    "utf8",
  );

  assert.match(
    html,
    /class="library-team-icon-button library-team-pricing-close-button"[^>]*aria-label="关闭定价弹窗"/,
  );
  assert.match(
    css,
    /\.library-team-pricing-modal \.library-team-icon-button\.library-team-pricing-close-button\s*\{[^}]*width:\s*48px;[^}]*height:\s*48px;[^}]*font-size:\s*28px;/,
  );
  assert.match(
    css,
    /\.library-team-pricing-modal \.library-team-icon-button\.library-team-pricing-close-button:hover\s*\{/,
  );
  assert.match(
    css,
    /\.library-team-pricing-modal \.library-team-icon-button\.library-team-pricing-close-button:focus-visible\s*\{/,
  );
});

test("keeps membership pricing card actions on the same horizontal row", () => {
  const css = readFileSync(
    new URL("../src/features/library-team/library-team.css", import.meta.url),
    "utf8",
  );

  assert.match(css, /\.library-team-plan-card\s*\{[\s\S]*display:\s*grid/);
  assert.match(css, /\.library-team-plan-card\s*\{[\s\S]*grid-template-rows:\s*auto\s+auto\s+auto\s+auto\s+minmax\(3\.4em,\s*auto\)\s+auto\s+1fr/);
  assert.match(css, /\.library-team-plan-payment-actions\s*\{[\s\S]*grid-template-columns:\s*repeat\(2,\s*minmax\(0,\s*1fr\)\)/);
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
  assert.match(html, /微信支付未返回真实二维码/);
});
