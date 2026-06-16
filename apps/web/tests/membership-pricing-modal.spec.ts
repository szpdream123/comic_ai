import assert from "node:assert/strict";
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
  assert.match(html, /library-team-payment-flow/);
  assert.match(html, /微信扫码支付/);
  assert.match(html, /权益生效/);
  assert.match(html, /支付成功后自动开通，无需刷新页面/);
  assert.match(html, /微信支付未返回真实二维码/);
  assert.match(html, /请确认微信支付配置已启用/);
  assert.match(html, /支付方式/);
  assert.match(html, /微信支付/);
  assert.doesNotMatch(html, /data-action="refresh-payment-intent"/);
  assert.doesNotMatch(html, /刷新状态/);
  assert.doesNotMatch(html, /return-membership-plan-selection/);
  assert.doesNotMatch(html, /请使用微信\/支付宝扫码支付/);
  assert.doesNotMatch(html, /渠道/);
  assert.doesNotMatch(paymentModal, /支付宝/);
  assert.doesNotMatch(subscriptionLayout, /library-team-payment-panel/);
  assert.match(html, /library-team-payment-qr/);
  assert.match(html, /《付费会员服务协议》/);
});

test("renders local payment simulation action on localhost", () => {
  const originalWindow = globalThis.window;
  globalThis.window = { location: { host: "localhost:4310" } };
  try {
    const html = renderPricingModal({
      open: true,
      paymentIntent: {
        id: "intent-local-sim",
        orderId: "order-local-sim",
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
        id: "order-local-sim",
        status: "pending_payment",
        productType: "membership_plan",
      },
    });

    assert.match(html, /simulate-membership-payment-success/);
    assert.match(html, /本地模拟支付成功/);
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

test("renders WeChat and Alipay subscription actions for membership plans", () => {
  const html = renderPricingModal({
    open: true,
    membershipPlans: [
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

  assert.match(html, /微信订阅/);
  assert.match(html, /支付宝订阅/);
  assert.match(html, /data-provider="wechat_pay"/);
  assert.match(html, /data-provider="alipay"/);
  assert.doesNotMatch(html, />立即订阅<\/button>/);
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

  assert.match(paymentModal, /支付宝扫码支付/);
  assert.match(paymentModal, /使用支付宝扫码完成付款/);
  assert.match(paymentModal, /支付宝未返回真实二维码/);
  assert.match(paymentModal, /支付方式<\/dt><dd>支付宝/);
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
