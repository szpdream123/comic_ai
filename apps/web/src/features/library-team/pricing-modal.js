import { commercePrototypeNotice } from "../../shared/commerce-fixtures.js";
import { escapeAttr, escapeHtml } from "./markup.js";

const MEMBERSHIP_PAYMENT_MANUAL_REFRESH_DELAY_MS = 30 * 1000;
const DEFAULT_PAID_MEMBERSHIP_AGREEMENT = {
  title: "付费会员服务协议",
  contentHtml: "<p>暂无协议内容。</p>",
};

export function renderPricingModal({
  open = false,
  packages = null,
  membershipPlans = null,
  membershipStatus = null,
  paymentIntent = null,
  paymentAction = null,
  billingOrder = null,
  membershipPaymentState = null,
  pricingTab = "membership",
  paidMembershipAgreement = null,
  paidMembershipAgreementModalOpen = false,
} = {}) {
  if (!open) {
    return "";
  }

  const plans = mapMembershipPlansToPricingPlans(membershipPlans);
  const directRechargePackages = mapDirectRechargePackagesToPlans(packages);
  const activeStatus =
    membershipStatus?.status ??
    membershipStatus?.membership?.status ??
    membershipStatus?.subscription?.status ??
    "";
  const selectedPlan =
    plans.find((plan) => plan.membershipPlanId && plan.membershipPlanId === membershipPaymentState?.pendingMembershipPlanId) ??
    plans.find((plan) => plan.id === "pro") ??
    plans[0] ??
    null;
  const selectedPaymentPlan = membershipPaymentState?.pendingBillingPackageId
    ? null
    : selectedPlan;
  const activeTab = pricingTab === "credits" ? "credits" : "membership";
  const hasActiveMembership = isActiveMembershipStatus(activeStatus);
  const paidAgreement = normalizePaidMembershipAgreement(paidMembershipAgreement);

  return `
    <div class="library-team-modal-backdrop" data-modal="pricing">
      <section
        class="library-team-modal library-team-pricing-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pricing-modal-title"
      >
        <header class="library-team-subscription-header">
          <div>
            <p class="library-team-kicker">会员订阅</p>
            <h2 id="pricing-modal-title">开通会员权益</h2>
            <p>完成扫码支付后，优先生成等个人专业权益会自动生效；团队协作会获得开启资格，可按需创建成员账号。</p>
          </div>
          <button class="library-team-icon-button library-team-pricing-close-button" type="button" data-action="close-pricing" aria-label="关闭定价弹窗">×</button>
        </header>
        <div class="library-team-subscription-layout">
          <div class="library-team-pricing-tabs" role="tablist" aria-label="购买类型">
            ${renderPricingTabButton("membership", "会员订阅", activeTab)}
            ${renderPricingTabButton("credits", "积分直充", activeTab)}
          </div>
          <section class="library-team-subscription-plans" aria-label="会员套餐">
            <div class="library-team-subscription-summary">
              <div>
                <p class="library-team-kicker">当前状态</p>
                <strong>${escapeHtml(membershipStatusLabel(activeStatus))}</strong>
              </div>
            </div>
            <p class="library-team-commerce-notice">${escapeHtml(commercePrototypeNotice)}</p>
            ${activeTab === "credits"
              ? renderDirectRechargeSection(directRechargePackages, { hasActiveMembership })
              : `<div class="library-team-plan-grid">
                  ${plans.length ? plans.map((plan) => renderPricingPlan(plan, selectedPlan?.id)).join("") : renderMembershipPlanEmptyState()}
                </div>`}
          </section>
        </div>
      </section>
    </div>
    ${renderMembershipPaymentModal(paymentIntent, paymentAction, billingOrder, selectedPaymentPlan, membershipPaymentState, {
      directRechargePackages,
      paidMembershipAgreement: paidAgreement,
      paidMembershipAgreementModalOpen,
    })}
  `;
}

function renderPricingTabButton(tab, label, activeTab) {
  const selected = tab === activeTab;
  return `
    <button
      class="library-team-pricing-tab${selected ? " is-active" : ""}"
      type="button"
      role="tab"
      aria-selected="${selected ? "true" : "false"}"
      data-action="switch-pricing-tab"
      data-pricing-tab-target="${escapeAttr(tab)}"
      data-pricing-tab="${escapeAttr(tab)}"
    >${escapeHtml(label)}</button>
  `;
}

function renderDirectRechargeSection(packages, { hasActiveMembership }) {
  if (!hasActiveMembership) {
    return `
      <div class="library-team-empty-state compact" data-direct-recharge-blocked>
        <p>开通会员后可充值积分，积分随会员资格可用。</p>
        <button class="library-team-button library-team-button-primary" type="button" data-action="switch-pricing-tab" data-pricing-tab-target="membership">开通会员</button>
      </div>
    `;
  }
  if (!packages.length) {
    return `
      <div class="library-team-empty-state compact" data-direct-recharge-empty-state>
        <p>暂无可充值积分档位，请联系管理员配置直充套餐。</p>
      </div>
    `;
  }
  return `
    <div class="library-team-plan-grid">
      ${packages.map((plan) => renderDirectRechargePlan(plan)).join("")}
    </div>
  `;
}

function renderDirectRechargePlan(plan) {
  return `
    <article class="library-team-plan-card library-team-direct-recharge-card" data-plan-tier="direct_recharge">
      <span class="library-team-badge is-placeholder" aria-hidden="true"></span>
      <h3>${escapeHtml(plan.name)}</h3>
      <p class="library-team-price">${escapeHtml(plan.price)}</p>
      <p class="library-team-credits">${escapeHtml(plan.credits)}</p>
      <p class="library-team-plan-note">仅增加积分，不延长会员有效期</p>
      ${renderPlanPaymentActions({
        actionName: "purchase-billing-package",
        actionLabel: "立即充值",
        featured: false,
        packageId: plan.packageId,
        planId: plan.id,
        isMembershipPlan: true,
        paymentLabels: ["微信充值", "支付宝充值"],
      })}
      <ul class="library-team-feature-list">
        <li>充值后进入当前组织钱包</li>
        <li>会员有效期内可使用</li>
        <li>会员到期后未用完积分冻结</li>
      </ul>
    </article>
  `;
}

function renderPricingPlan(plan, selectedPlanId) {
  const featured = plan.id === "pro";
  const selected = plan.id === selectedPlanId;
  const actionLabel = plan.id === "enterprise" ? "联系商务" : "立即订阅";
  const actionName = plan.id === "enterprise"
    ? "request-enterprise-contact"
    : plan.membershipPlanId
      ? "purchase-membership-plan"
      : "purchase-billing-package";
  const packageId = plan.packageId ?? plan.id;
  const planId = plan.membershipPlanId ?? plan.id;
  const note = plan.membershipPlanId ? plan.note : (plan.note || planNote(plan.id));

  return `
    <article
      class="library-team-plan-card${featured ? " is-featured" : ""}${selected ? " is-selected" : ""}"
      data-plan-tier="${escapeAttr(plan.tier ?? plan.id)}"
    >
      <span class="library-team-badge${featured ? "" : " is-placeholder"}" aria-hidden="${featured ? "false" : "true"}">${featured ? "推荐" : ""}</span>
      <h3>${escapeHtml(plan.name)}</h3>
      <p class="library-team-price">${escapeHtml(plan.price)}</p>
      <p class="library-team-credits">${escapeHtml(plan.credits)}</p>
      ${note ? `<p class="library-team-plan-note">${escapeHtml(note)}</p>` : ""}
      ${renderPlanPaymentActions({ actionName, actionLabel, featured, packageId, planId, isMembershipPlan: Boolean(plan.membershipPlanId) })}
      <ul class="library-team-feature-list">
        ${(plan.features?.length ? plan.features : featuresForPlan(plan.id)).map((feature) => `<li>${escapeHtml(feature)}</li>`).join("")}
      </ul>
    </article>
  `;
}

function renderPlanPaymentActions({ actionName, actionLabel, featured, packageId, planId, isMembershipPlan, paymentLabels = ["微信订阅", "支付宝订阅"] }) {
  const buttonClass = `library-team-button${featured ? " library-team-button-primary" : ""}`;
  if (!isMembershipPlan) {
    return `
      <button
        class="${buttonClass}"
        type="button"
        data-action="${escapeAttr(actionName)}"
        data-plan-id="${escapeAttr(planId)}"
        data-package-id="${escapeAttr(packageId)}"
        data-provider="wechat_pay"
      >${escapeHtml(actionLabel)}</button>
    `;
  }

  return `
    <div class="library-team-plan-payment-actions" aria-label="订阅支付方式">
      <button
        class="${buttonClass}"
        type="button"
        data-action="${escapeAttr(actionName)}"
        data-plan-id="${escapeAttr(planId)}"
        data-package-id="${escapeAttr(packageId)}"
        data-provider="wechat_pay"
      >${escapeHtml(paymentLabels[0] ?? "微信支付")}</button>
      <button
        class="library-team-button library-team-button-alipay"
        type="button"
        data-action="${escapeAttr(actionName)}"
        data-plan-id="${escapeAttr(planId)}"
        data-package-id="${escapeAttr(packageId)}"
        data-provider="alipay"
      >${escapeHtml(paymentLabels[1] ?? "支付宝支付")}</button>
    </div>
  `;
}

function renderMembershipPlanEmptyState() {
  return `
    <div class="library-team-empty-state compact" data-membership-empty-state>
      <div class="library-team-empty-icon" aria-hidden="true">PRO</div>
      <p>暂无可订阅会员套餐，请联系管理员配置会员套餐。</p>
    </div>
  `;
}

function mapMembershipPlansToPricingPlans(plans) {
  if (!Array.isArray(plans) || !plans.length) {
    return [];
  }

  const mapped = plans.map((plan) => ({
    id: membershipPricingId(plan),
    membershipPlanId: String(plan?.id ?? ""),
    name: String(plan?.displayName ?? plan?.code ?? "会员套餐"),
    price: formatAmount(plan?.amountMinor, plan?.currency),
    credits: `${Number(plan?.giftCredits ?? 0).toLocaleString()} 会员积分`,
    periodUnit: plan?.periodUnit,
    periodCount: plan?.periodCount,
    tier: plan?.tier,
    note: membershipPlanNoteFromMetadata(plan?.displayMetadata),
    features: membershipPlanFeaturesFromMetadata(plan?.displayMetadata, plan?.entitlements),
    metadata: plan?.displayMetadata ?? {},
  })).filter((plan) => plan.membershipPlanId);

  return [...mapped, {
    id: "enterprise",
    name: "企业版",
    price: "联系商务",
    credits: "定制席位与权益",
  }];
}

function membershipPlanNoteFromMetadata(metadata) {
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return "";
  }
  const note = metadata.note ?? metadata.subtitle ?? metadata.description;
  return typeof note === "string" ? note.trim() : "";
}

function membershipPlanFeaturesFromMetadata(metadata, entitlements) {
  const selectedEntitlementSet = new Set(
    Array.isArray(entitlements)
      ? entitlements.map((item) => String(item ?? "").trim()).filter(Boolean)
      : [],
  );
  const metadataFeatures = metadata && typeof metadata === "object" && !Array.isArray(metadata)
    ? metadata.features ?? metadata.benefits
    : [];
  const normalizedFeatures = Array.isArray(metadataFeatures)
    ? metadataFeatures.map((feature) => String(feature ?? "").trim()).filter(Boolean)
    : [];
  const visibleFeatures = normalizedFeatures.filter((feature) => {
    const entitlementKey = membershipKnownFeatureEntitlement(feature);
    return !entitlementKey || !selectedEntitlementSet.size || selectedEntitlementSet.has(entitlementKey);
  });
  for (const entitlement of selectedEntitlementSet) {
    const label = membershipEntitlementLabel(entitlement);
    if (label && !visibleFeatures.includes(label)) {
      visibleFeatures.push(label);
    }
  }
  return visibleFeatures;
}

function membershipKnownFeatureEntitlement(feature) {
  return membershipFeatureToEntitlementMap.get(feature);
}

function membershipEntitlementLabel(entitlement) {
  return membershipEntitlementLabels.get(entitlement);
}

const membershipEntitlementLabels = new Map([
  ["canvas_access", "可使用画布功能"],
  ["priority_generation", "Seedance 2.0 优先排队"],
  ["team_asset_library", "团队资产库"],
  ["team_member_management", "团队成员管理"],
  ["full_flow_agent", "全流程 Agent"],
]);

const membershipFeatureToEntitlementMap = new Map(
  Array.from(membershipEntitlementLabels.entries()).map(([key, label]) => [label, key]),
);

function membershipPricingId(plan) {
  const tier = String(plan?.tier ?? "");
  const unit = String(plan?.periodUnit ?? "");
  const count = Number(plan?.periodCount ?? 1);
  if (tier === "experience") return "experience";
  if (tier === "professional" && unit === "month" && count === 1) return "pro";
  if (tier === "professional" && unit === "quarter") return "pro-quarter";
  if (tier === "professional" && unit === "year") return "pro-year";
  return String(plan?.code ?? plan?.id ?? "membership");
}

function renderMembershipPaymentModal(paymentIntent, paymentAction, billingOrder, selectedPlan, membershipPaymentState, context = {}) {
  const creating = Boolean(membershipPaymentState?.creating);
  if (!paymentIntent && !creating) {
    return "";
  }
  const isCreditRechargeOrder = billingOrder?.productType === "credit_package" || Boolean(membershipPaymentState?.pendingBillingPackageId);
  const status = creating ? "creating" : String(paymentIntent?.status ?? billingOrder?.status ?? "submitted");
  const provider = String(paymentIntent?.provider ?? paymentAction?.provider ?? membershipPaymentState?.provider ?? "wechat_pay");
  const providerName = paymentProviderName(provider);
  const orderNo = paymentAction?.merchantOrderNo ?? paymentIntent?.merchantOrderNo ?? billingOrder?.orderNo ?? paymentIntent?.id ?? "-";
  const expiresAt = membershipPaymentState?.qrExpiresAt ?? paymentIntent?.expiresAt ?? null;
  const expired = isExpiredPayment(status, expiresAt);
  const succeeded = isSucceededPayment(status, billingOrder?.status);
  const syncing = Boolean(membershipPaymentState?.syncing && succeeded);
  const agreementAccepted = membershipPaymentState?.agreementAccepted !== false;
  const paidAgreement = normalizePaidMembershipAgreement(context.paidMembershipAgreement);
  const realPaymentAction = resolvePaymentAction(paymentAction);
  const showManualRefresh = paymentIntent ? shouldShowManualPaymentRefresh(membershipPaymentState, { expired, succeeded }) : false;
  const modalTitle = creating
    ? "正在生成支付二维码"
    : succeeded
      ? syncing
        ? isCreditRechargeOrder ? "正在同步积分" : "正在同步权益"
        : isCreditRechargeOrder ? "积分已到账" : "会员已开通"
    : expired
      ? "二维码已过期"
      : isCreditRechargeOrder ? "确认积分充值订单" : "确认会员订单";
  const kicker = isCreditRechargeOrder ? "积分支付" : "会员支付";
  const subtitle = isCreditRechargeOrder ? "支付成功后积分到账，不延长会员有效期。" : "支付成功后自动开通，无需刷新页面。";

  return `
    <div class="library-team-modal-backdrop library-team-payment-modal-backdrop" data-modal="membership-payment">
      <section
        class="library-team-modal library-team-payment-modal ${succeeded ? "is-success" : expired ? "is-expired" : !agreementAccepted ? "is-blocked" : "is-active"}"
        role="dialog"
        aria-modal="true"
        aria-labelledby="membership-payment-title"
      >
        <header class="library-team-payment-modal-header">
          <div class="library-team-payment-title-block">
            <p class="library-team-kicker">${escapeHtml(kicker)}</p>
            <h2 id="membership-payment-title">${escapeHtml(modalTitle)}</h2>
            <p>${escapeHtml(subtitle)}</p>
          </div>
          <button class="library-team-icon-button" type="button" data-action="close-membership-payment" aria-label="关闭支付弹窗">×</button>
        </header>
        <div class="library-team-payment-modal-body">
          <section class="library-team-payment-card" aria-label="会员支付二维码">
            ${creating
              ? renderPaymentCreatingState({ providerName })
              : succeeded
              ? renderPaymentSuccessState({ isCreditRechargeOrder, syncing })
              : renderPaymentScanState({
                  agreementAccepted,
                  expired,
                  expiresAt,
                  isCreditRechargeOrder,
                  orderNo,
                  paidAgreementTitle: paidAgreement.title,
                  realPaymentAction,
                  providerName,
                })}
          </section>
          ${renderPaymentActions({
            billingOrder,
            expired,
            isCreditRechargeOrder,
            paymentAction,
            paymentIntent,
            selectedPlan,
            showManualRefresh,
            membershipPaymentState,
          })}
          ${creating ? "" : renderPaymentAgreement(agreementAccepted, paidAgreement)}
        </div>
      </section>
      ${renderPaidMembershipAgreementModal({
        agreement: paidAgreement,
        open: context.paidMembershipAgreementModalOpen === true,
      })}
    </div>
  `;
}

function renderPaymentScanState({ agreementAccepted, expired, expiresAt, isCreditRechargeOrder = false, orderNo, paidAgreementTitle, realPaymentAction, providerName }) {
  if (expired) {
    return `
      <div class="library-team-payment-scan is-blocked">
        ${renderPaymentExpiredState(orderNo)}
        <p class="library-team-payment-provider">${escapeHtml(providerName)}二维码已过期，请重新生成后扫码支付</p>
      </div>
    `;
  }
  if (!agreementAccepted) {
    return `
      <div class="library-team-payment-scan is-blocked">
        ${renderPaymentAgreementBlockedState(orderNo, paidAgreementTitle)}
        <p class="library-team-payment-provider">勾选协议后将显示支付二维码</p>
      </div>
    `;
  }

  return `
    <div class="library-team-payment-scan">
      <div
        class="library-team-payment-countdown"
        data-payment-countdown
        data-expires-at="${escapeAttr(expiresAt ?? "")}"
      >${escapeHtml(`${formatRemainingTime(expiresAt)} 后过期`)}</div>
      ${realPaymentAction
        ? renderRealPaymentAction(realPaymentAction, orderNo, providerName)
        : renderPaymentProviderPendingState(orderNo, providerName)}
      <p class="library-team-payment-provider">${escapeHtml(providerName)}完成后将自动确认${isCreditRechargeOrder ? "到账" : "权益"}</p>
    </div>
  `;
}

function renderPaymentCreatingState({ providerName } = {}) {
  return `
    <div class="library-team-payment-creating-hero" data-membership-payment-creating>
      <div class="library-team-payment-spinner" aria-hidden="true"></div>
      <div class="library-team-payment-success-copy">
        <strong>正在生成支付二维码</strong>
        <span>${escapeHtml(providerName)}订单创建中</span>
      </div>
    </div>
  `;
}

function renderPaymentSuccessState({ isCreditRechargeOrder = false, syncing = false } = {}) {
  return `
    <div class="library-team-payment-success-hero" data-payment-success-state>
      <div class="library-team-payment-success-mark" aria-hidden="true">✓</div>
      <div class="library-team-payment-success-copy">
        <strong>${escapeHtml(syncing
          ? isCreditRechargeOrder ? "正在同步积分到账" : "正在同步会员权益"
          : isCreditRechargeOrder ? "积分已到账" : "会员权益已生效")}</strong>
      </div>
    </div>
  `;
}

function renderPaymentExpiredState(orderNo) {
  return `
    <div class="library-team-payment-blocked-hero" data-payment-expired-state>
      <div class="library-team-payment-blocked-mark" aria-hidden="true">!</div>
      <div class="library-team-payment-success-copy">
        <strong>二维码已过期</strong>
        <span>订单 ${escapeHtml(orderNo)}</span>
      </div>
      <p>为了避免继续扫描失败，请重新生成新的支付二维码。</p>
    </div>
  `;
}

function renderPaymentAgreementBlockedState(orderNo, agreementTitle = DEFAULT_PAID_MEMBERSHIP_AGREEMENT.title) {
  return `
    <div class="library-team-payment-blocked-hero" data-payment-agreement-blocked>
      <div class="library-team-payment-blocked-mark" aria-hidden="true">i</div>
      <div class="library-team-payment-success-copy">
        <strong>请先勾选并同意${escapeHtml(agreementTitle || DEFAULT_PAID_MEMBERSHIP_AGREEMENT.title)}</strong>
        <span>订单 ${escapeHtml(orderNo)}</span>
      </div>
      <p>取消同意后不会展示支付二维码，也不会继续引导扫码付款。</p>
    </div>
  `;
}

function renderPaymentActions({
  billingOrder,
  expired,
  isCreditRechargeOrder = false,
  paymentAction,
  paymentIntent,
  selectedPlan,
  showManualRefresh,
  membershipPaymentState,
}) {
  if (!paymentIntent) {
    return "";
  }
  const manualRefreshAction = showManualRefresh
    ? `<button
        class="library-team-payment-refresh-link"
        type="button"
        data-action="refresh-payment-intent"
        data-payment-intent-id="${escapeAttr(paymentIntent.id ?? "")}"
        data-order-id="${escapeAttr(billingOrder?.id ?? paymentIntent.orderId ?? "")}"
      >支付后未生效？刷新状态</button>`
    : "";
  const regenerateAction = expired
    ? `<button
        class="library-team-button library-team-button-primary"
        type="button"
        data-action="${escapeAttr(isCreditRechargeOrder ? "regenerate-billing-package-payment-qr" : "regenerate-membership-payment-qr")}"
        data-plan-id="${escapeAttr(membershipPaymentState?.pendingMembershipPlanId ?? selectedPlan?.membershipPlanId ?? "")}"
        data-package-id="${escapeAttr(membershipPaymentState?.pendingBillingPackageId ?? billingOrder?.creditPackageId ?? billingOrder?.credit_package_id ?? "")}"
        data-provider="${escapeAttr(paymentIntent.provider ?? paymentAction?.provider ?? "wechat_pay")}"
      >重新生成二维码</button>`
    : "";
  if (!manualRefreshAction && !regenerateAction) {
    return "";
  }
  return `
    <div class="library-team-payment-actions${manualRefreshAction && !regenerateAction ? " is-subtle" : ""}">
      ${regenerateAction}
      ${manualRefreshAction}
    </div>
  `;
}

function shouldShowManualPaymentRefresh(membershipPaymentState, { expired, succeeded }) {
  if (!membershipPaymentState || expired || succeeded) {
    return false;
  }
  const pollFailureCount = Number(membershipPaymentState.pollFailureCount ?? 0);
  if (pollFailureCount > 0 || membershipPaymentState.polling === false) {
    return true;
  }
  const createdAt = membershipPaymentState.qrCreatedAt ? new Date(membershipPaymentState.qrCreatedAt) : null;
  if (!createdAt || !Number.isFinite(createdAt.getTime())) {
    return false;
  }
  return Date.now() - createdAt.getTime() >= MEMBERSHIP_PAYMENT_MANUAL_REFRESH_DELAY_MS;
}

function renderPaymentAgreement(agreementAccepted = true, agreement = DEFAULT_PAID_MEMBERSHIP_AGREEMENT) {
  const title = agreement?.title || DEFAULT_PAID_MEMBERSHIP_AGREEMENT.title;
  return `
    <div class="library-team-payment-agreement">
      <label class="library-team-payment-agreement-label">
        <input
          class="library-team-payment-agreement-input"
          type="checkbox"
          data-action="toggle-membership-payment-agreement"
          ${agreementAccepted ? "checked" : ""}
        />
        <span class="library-team-payment-agreement-check" aria-hidden="true">${agreementAccepted ? "✓" : ""}</span>
        <span>支付即表示您已阅读并同意</span>
      </label>
      <button
        class="library-team-payment-agreement-link"
        type="button"
        data-action="open-membership-payment-agreement"
      >《${escapeHtml(title)}》</button>
    </div>
  `;
}

function renderPaidMembershipAgreementModal({ agreement, open = false } = {}) {
  if (!open) {
    return "";
  }
  const normalized = normalizePaidMembershipAgreement(agreement);
  return `
    <div class="library-team-modal-backdrop library-team-agreement-modal-backdrop" data-modal="membership-payment-agreement">
      <section
        class="library-team-modal library-team-agreement-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="membership-payment-agreement-title"
      >
        <header class="library-team-agreement-modal-header">
          <div>
            <h2 id="membership-payment-agreement-title">${escapeHtml(normalized.title)}</h2>
          </div>
          <button class="library-team-icon-button" type="button" data-action="close-membership-payment-agreement" aria-label="关闭会员协议">×</button>
        </header>
        <div class="library-team-agreement-modal-content library-team-agreement-rich-text">
          ${sanitizeAgreementHtml(normalized.contentHtml)}
        </div>
      </section>
    </div>
  `;
}

function normalizePaidMembershipAgreement(value) {
  const document = value?.document && typeof value.document === "object"
    ? value.document
    : value;
  const title = String(document?.title ?? DEFAULT_PAID_MEMBERSHIP_AGREEMENT.title).trim() ||
    DEFAULT_PAID_MEMBERSHIP_AGREEMENT.title;
  const contentHtml = String(
    document?.contentHtml ??
    document?.content_html ??
    DEFAULT_PAID_MEMBERSHIP_AGREEMENT.contentHtml,
  ).trim() || DEFAULT_PAID_MEMBERSHIP_AGREEMENT.contentHtml;
  return {
    title,
    contentHtml,
  };
}

function sanitizeAgreementHtml(value) {
  const html = String(value ?? "").trim() || DEFAULT_PAID_MEMBERSHIP_AGREEMENT.contentHtml;
  return html
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*>[\s\S]*?<\s*\/\s*\1\s*>/gi, "")
    .replace(/<\s*(script|style|iframe|object|embed|link|meta)\b[^>]*\/?\s*>/gi, "")
    .replace(/\s+on[a-z]+\s*=\s*(?:"[^"]*"|'[^']*'|[^\s>]+)/gi, "")
    .replace(/\s+(href|src|xlink:href)\s*=\s*(["'])\s*javascript:[\s\S]*?\2/gi, "")
    .replace(/\s+(href|src|xlink:href)\s*=\s*javascript:[^\s>]+/gi, "");
}

function renderRealPaymentAction(paymentAction, orderNo, providerName) {
  if (paymentAction.kind === "qr_payload") {
    const qrSvg = renderPaymentQrSvg(paymentAction.value);
    if (!qrSvg) {
      return renderPaymentProviderPendingState(orderNo, providerName);
    }
    return `
      <div
        class="library-team-payment-qr is-real"
        aria-label="支付二维码"
        data-payment-real-action
        data-payment-code-url="${escapeAttr(paymentAction.value)}"
      >
        ${qrSvg}
        <strong>请使用${escapeHtml(providerName)}扫码支付</strong>
        <span>${escapeHtml(orderNo)}</span>
      </div>
    `;
  }

  return `
    <div class="library-team-payment-qr is-real" aria-label="支付二维码" data-payment-real-action>
      ${
        paymentAction.kind === "image"
          ? `<img class="library-team-payment-qr-image" src="${escapeAttr(paymentAction.value)}" alt="支付二维码" loading="lazy" />`
          : `<a class="library-team-payment-link" href="${escapeAttr(paymentAction.value)}" target="_blank" rel="noopener noreferrer">打开${escapeHtml(providerName)}支付页面</a>`
      }
      <strong>请使用${escapeHtml(providerName)}支付页面完成付款</strong>
      <span>${escapeHtml(orderNo)}</span>
    </div>
  `;
}

function renderPaymentProviderPendingState(orderNo, providerName) {
  return `
    <div class="library-team-payment-qr is-blocked" aria-label="支付二维码待生成">
      <div class="library-team-payment-blocked-mark" aria-hidden="true">!</div>
      <strong>${escapeHtml(providerName)}未返回真实二维码</strong>
      <span>${escapeHtml(orderNo)}</span>
      <small>请确认${escapeHtml(providerName)}配置已启用，并检查下单接口返回的 code_url 字段。</small>
    </div>
  `;
}

function paymentProviderName(provider) {
  return provider === "alipay" ? "支付宝" : "微信支付";
}

function paymentProviderFlowName(provider) {
  return provider === "alipay" ? "支付宝" : "微信";
}

function resolvePaymentAction(paymentAction) {
  const imageUrl = findPaymentActionString(paymentAction, [
    "qrCodeImage",
    "qr_code_image",
    "qrCodeUrl",
    "qr_code_url",
    "qrcodeUrl",
    "qrcode_url",
  ]);
  if (imageUrl && isSafePaymentImageUrl(imageUrl)) {
    return { kind: "image", value: imageUrl };
  }

  const codeUrl = findPaymentActionString(paymentAction, [
    "codeUrl",
    "code_url",
    "qrCode",
    "qr_code",
    "url",
  ]);
  if (paymentAction?.kind === "qr_code" && codeUrl && isScannablePaymentCodePayload(codeUrl)) {
    return { kind: "qr_payload", value: codeUrl };
  }

  const linkUrl = findPaymentActionString(paymentAction, [
    "paymentUrl",
    "payment_url",
    "payUrl",
    "pay_url",
    "url",
  ]);
  if (linkUrl && isSafePaymentUrl(linkUrl)) {
    return { kind: "link", value: linkUrl };
  }

  return null;
}

function findPaymentActionString(paymentAction, keys) {
  for (const key of keys) {
    const value = paymentAction?.[key];
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function isSafePaymentImageUrl(value) {
  return /^data:image\/(?:png|jpe?g|webp|gif|svg\+xml);base64,[a-z0-9+/=]+$/i.test(value) ||
    /\.(?:png|jpg|jpeg|webp|gif|svg)(?:[?#].*)?$/i.test(value) && isSafePaymentUrl(value);
}

function isSafePaymentUrl(value) {
  try {
    const url = new URL(value);
    if (url.protocol === "https:") {
      return true;
    }
    return url.protocol === "http:" && /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function isScannablePaymentCodePayload(value) {
  if (!value || value.length > 512) {
    return false;
  }
  try {
    const url = new URL(value);
    if (url.protocol === "https:" || url.protocol === "weixin:" || url.protocol === "alipay:" || url.protocol === "alipays:") {
      return true;
    }
    return url.protocol === "http:" && /^(localhost|127\.0\.0\.1|\[::1\])$/i.test(url.hostname);
  } catch {
    return false;
  }
}

function renderPaymentQrSvg(payload) {
  try {
    const matrix = createPaymentQrMatrix(payload);
    const margin = 4;
    const size = matrix.size + margin * 2;
    return `
      <svg
        class="library-team-payment-qr-svg"
        xmlns="http://www.w3.org/2000/svg"
        viewBox="0 0 ${size} ${size}"
        role="img"
        aria-label="支付二维码"
        focusable="false"
        shape-rendering="crispEdges"
      >
        <path fill="#ffffff" d="M0 0h${size}v${size}H0z"></path>
        <path stroke="#14171d" d="${paymentQrPath(matrix, margin)}"></path>
      </svg>
    `;
  } catch {
    return "";
  }
}

function paymentQrPath(matrix, margin) {
  let path = "";
  let moveBy = 0;
  let newRow = false;
  let lineLength = 0;

  for (let index = 0; index < matrix.size * matrix.size; index += 1) {
    const col = index % matrix.size;
    const row = Math.floor(index / matrix.size);

    if (!col && !newRow) {
      newRow = true;
    }

    if (matrix.get(row, col)) {
      lineLength += 1;

      if (!(index > 0 && col > 0 && matrix.get(row, col - 1))) {
        path += newRow
          ? paymentQrSvgCommand("M", col + margin, row + margin + 0.5)
          : paymentQrSvgCommand("m", moveBy, 0);
        moveBy = 0;
        newRow = false;
      }

      if (!(col + 1 < matrix.size && matrix.get(row, col + 1))) {
        path += paymentQrSvgCommand("h", lineLength);
        lineLength = 0;
      }
    } else {
      moveBy += 1;
    }
  }

  return path;
}

function paymentQrSvgCommand(command, x, y) {
  let text = `${command}${x}`;
  if (typeof y !== "undefined") {
    text += ` ${y}`;
  }
  return text;
}

function createPaymentQrMatrix(payload) {
  const bytes = encodePaymentQrBytes(payload);
  const version = choosePaymentQrVersion(bytes.length);
  const dataCodewords = createPaymentQrDataCodewords(bytes, version);
  const finalCodewords = addPaymentQrErrorCorrection(dataCodewords, version);
  const size = paymentQrSymbolSize(version);
  const matrix = new PaymentQrMatrix(size);

  setupPaymentQrFinderPatterns(matrix);
  setupPaymentQrTimingPatterns(matrix);
  setupPaymentQrAlignmentPatterns(matrix, version);
  setupPaymentQrFormatInfo(matrix, 0);
  if (version >= 7) {
    setupPaymentQrVersionInfo(matrix, version);
  }
  setupPaymentQrData(matrix, finalCodewords);
  applyPaymentQrMask(matrix, 0);
  setupPaymentQrFormatInfo(matrix, 0);

  return matrix;
}

function encodePaymentQrBytes(value) {
  if (typeof TextEncoder !== "undefined") {
    return new TextEncoder().encode(String(value));
  }
  return Uint8Array.from(String(value), (char) => char.charCodeAt(0) & 0xff);
}

function choosePaymentQrVersion(byteLength) {
  for (let version = 1; version < PAYMENT_QR_TOTAL_CODEWORDS.length; version += 1) {
    if (byteLength <= paymentQrByteCapacity(version)) {
      return version;
    }
  }
  throw new Error("payment_qr_payload_too_large");
}

function paymentQrByteCapacity(version) {
  const dataCodewords = PAYMENT_QR_TOTAL_CODEWORDS[version] - PAYMENT_QR_EC_CODEWORDS_M[version];
  const charCountBits = version < 10 ? 8 : 16;
  return Math.floor((dataCodewords * 8 - 4 - charCountBits) / 8);
}

function createPaymentQrDataCodewords(bytes, version) {
  const dataCodewordCount = PAYMENT_QR_TOTAL_CODEWORDS[version] - PAYMENT_QR_EC_CODEWORDS_M[version];
  const targetBits = dataCodewordCount * 8;
  const bits = [];
  const putBits = (value, length) => {
    for (let bit = length - 1; bit >= 0; bit -= 1) {
      bits.push((value >>> bit) & 1);
    }
  };

  putBits(0b0100, 4);
  putBits(bytes.length, version < 10 ? 8 : 16);
  for (const byte of bytes) {
    putBits(byte, 8);
  }
  const terminatorBits = Math.min(4, targetBits - bits.length);
  for (let index = 0; index < terminatorBits; index += 1) {
    bits.push(0);
  }
  while (bits.length % 8 !== 0) {
    bits.push(0);
  }

  const codewords = [];
  for (let index = 0; index < bits.length; index += 8) {
    let codeword = 0;
    for (let bit = 0; bit < 8; bit += 1) {
      codeword = (codeword << 1) | bits[index + bit];
    }
    codewords.push(codeword);
  }
  for (let padIndex = 0; codewords.length < dataCodewordCount; padIndex += 1) {
    codewords.push(padIndex % 2 === 0 ? 0xec : 0x11);
  }
  return Uint8Array.from(codewords);
}

function addPaymentQrErrorCorrection(dataCodewords, version) {
  const totalCodewords = PAYMENT_QR_TOTAL_CODEWORDS[version];
  const ecCodewordCount = PAYMENT_QR_EC_CODEWORDS_M[version];
  const dataCodewordCount = totalCodewords - ecCodewordCount;
  const blockCount = PAYMENT_QR_EC_BLOCKS_M[version];
  const group2Blocks = totalCodewords % blockCount;
  const group1Blocks = blockCount - group2Blocks;
  const group1TotalCodewords = Math.floor(totalCodewords / blockCount);
  const group1DataCodewords = Math.floor(dataCodewordCount / blockCount);
  const group2DataCodewords = group1DataCodewords + 1;
  const ecPerBlock = group1TotalCodewords - group1DataCodewords;
  const dataBlocks = [];
  const ecBlocks = [];
  let offset = 0;
  let maxDataSize = 0;

  for (let block = 0; block < blockCount; block += 1) {
    const dataSize = block < group1Blocks ? group1DataCodewords : group2DataCodewords;
    const dataBlock = dataCodewords.slice(offset, offset + dataSize);
    dataBlocks.push(dataBlock);
    ecBlocks.push(createPaymentQrRsCodewords(dataBlock, ecPerBlock));
    offset += dataSize;
    maxDataSize = Math.max(maxDataSize, dataSize);
  }

  const result = new Uint8Array(totalCodewords);
  let index = 0;
  for (let position = 0; position < maxDataSize; position += 1) {
    for (let block = 0; block < blockCount; block += 1) {
      if (position < dataBlocks[block].length) {
        result[index] = dataBlocks[block][position];
        index += 1;
      }
    }
  }
  for (let position = 0; position < ecPerBlock; position += 1) {
    for (let block = 0; block < blockCount; block += 1) {
      result[index] = ecBlocks[block][position];
      index += 1;
    }
  }
  return result;
}

function createPaymentQrRsCodewords(data, degree) {
  const generator = paymentQrGeneratorPolynomial(degree);
  const message = new Uint8Array(data.length + degree);
  message.set(data);
  for (let offset = 0; offset < data.length; offset += 1) {
    const coefficient = message[offset];
    if (!coefficient) {
      continue;
    }
    for (let index = 0; index < generator.length; index += 1) {
      message[offset + index] ^= paymentQrGfMultiply(generator[index], coefficient);
    }
  }
  return message.slice(data.length);
}

function paymentQrGeneratorPolynomial(degree) {
  const cached = paymentQrGeneratorPolynomial.cache.get(degree);
  if (cached) {
    return cached;
  }
  let polynomial = Uint8Array.from([1]);
  for (let index = 0; index < degree; index += 1) {
    polynomial = multiplyPaymentQrPolynomials(polynomial, Uint8Array.from([1, PAYMENT_QR_GF_EXP[index]]));
  }
  paymentQrGeneratorPolynomial.cache.set(degree, polynomial);
  return polynomial;
}
paymentQrGeneratorPolynomial.cache = new Map();

function multiplyPaymentQrPolynomials(left, right) {
  const result = new Uint8Array(left.length + right.length - 1);
  for (let leftIndex = 0; leftIndex < left.length; leftIndex += 1) {
    for (let rightIndex = 0; rightIndex < right.length; rightIndex += 1) {
      result[leftIndex + rightIndex] ^= paymentQrGfMultiply(left[leftIndex], right[rightIndex]);
    }
  }
  return result;
}

function paymentQrGfMultiply(left, right) {
  if (!left || !right) {
    return 0;
  }
  return PAYMENT_QR_GF_EXP[PAYMENT_QR_GF_LOG[left] + PAYMENT_QR_GF_LOG[right]];
}

function setupPaymentQrFinderPatterns(matrix) {
  const last = matrix.size - 7;
  setupPaymentQrFinderPattern(matrix, 0, 0);
  setupPaymentQrFinderPattern(matrix, 0, last);
  setupPaymentQrFinderPattern(matrix, last, 0);
}

function setupPaymentQrFinderPattern(matrix, originRow, originCol) {
  for (let row = -1; row <= 7; row += 1) {
    for (let col = -1; col <= 7; col += 1) {
      const targetRow = originRow + row;
      const targetCol = originCol + col;
      if (!matrix.has(targetRow, targetCol)) {
        continue;
      }
      const inPattern = row >= 0 && row <= 6 && col >= 0 && col <= 6;
      const dark = inPattern && (
        row === 0 ||
        row === 6 ||
        col === 0 ||
        col === 6 ||
        (row >= 2 && row <= 4 && col >= 2 && col <= 4)
      );
      matrix.set(targetRow, targetCol, dark, true);
    }
  }
}

function setupPaymentQrTimingPatterns(matrix) {
  for (let position = 8; position < matrix.size - 8; position += 1) {
    const dark = position % 2 === 0;
    matrix.set(6, position, dark, true);
    matrix.set(position, 6, dark, true);
  }
}

function setupPaymentQrAlignmentPatterns(matrix, version) {
  const positions = paymentQrAlignmentPositions(version);
  const last = matrix.size - 7;
  for (const row of positions) {
    for (const col of positions) {
      if (
        (row === 6 && col === 6) ||
        (row === 6 && col === last) ||
        (row === last && col === 6)
      ) {
        continue;
      }
      setupPaymentQrAlignmentPattern(matrix, row, col);
    }
  }
}

function setupPaymentQrAlignmentPattern(matrix, centerRow, centerCol) {
  for (let row = -2; row <= 2; row += 1) {
    for (let col = -2; col <= 2; col += 1) {
      const dark = row === -2 || row === 2 || col === -2 || col === 2 || (row === 0 && col === 0);
      matrix.set(centerRow + row, centerCol + col, dark, true);
    }
  }
}

function paymentQrAlignmentPositions(version) {
  if (version === 1) {
    return [];
  }
  const count = Math.floor(version / 7) + 2;
  const size = paymentQrSymbolSize(version);
  const interval = size === 145 ? 26 : Math.ceil((size - 13) / (2 * count - 2)) * 2;
  const positions = [size - 7];
  for (let index = 1; index < count - 1; index += 1) {
    positions[index] = positions[index - 1] - interval;
  }
  positions.push(6);
  return positions.reverse();
}

function setupPaymentQrData(matrix, data) {
  let direction = -1;
  let row = matrix.size - 1;
  let bitIndex = 7;
  let byteIndex = 0;

  for (let col = matrix.size - 1; col > 0; col -= 2) {
    if (col === 6) {
      col -= 1;
    }
    while (true) {
      for (let offset = 0; offset < 2; offset += 1) {
        const targetCol = col - offset;
        if (matrix.isReserved(row, targetCol)) {
          continue;
        }
        const dark = byteIndex < data.length ? ((data[byteIndex] >>> bitIndex) & 1) === 1 : false;
        matrix.set(row, targetCol, dark);
        bitIndex -= 1;
        if (bitIndex < 0) {
          byteIndex += 1;
          bitIndex = 7;
        }
      }
      row += direction;
      if (row < 0 || row >= matrix.size) {
        row -= direction;
        direction = -direction;
        break;
      }
    }
  }
}

function applyPaymentQrMask(matrix, maskPattern) {
  for (let row = 0; row < matrix.size; row += 1) {
    for (let col = 0; col < matrix.size; col += 1) {
      if (!matrix.isReserved(row, col) && paymentQrMaskAt(maskPattern, row, col)) {
        matrix.xor(row, col);
      }
    }
  }
}

function paymentQrMaskAt(maskPattern, row, col) {
  switch (maskPattern) {
    case 0:
      return (row + col) % 2 === 0;
    default:
      return false;
  }
}

function setupPaymentQrFormatInfo(matrix, maskPattern) {
  const bits = encodedPaymentQrFormatBits(maskPattern);
  for (let index = 0; index < 15; index += 1) {
    const dark = ((bits >>> index) & 1) === 1;
    if (index < 6) {
      matrix.set(index, 8, dark, true);
    } else if (index < 8) {
      matrix.set(index + 1, 8, dark, true);
    } else {
      matrix.set(matrix.size - 15 + index, 8, dark, true);
    }

    if (index < 8) {
      matrix.set(8, matrix.size - index - 1, dark, true);
    } else if (index < 9) {
      matrix.set(8, 15 - index, dark, true);
    } else {
      matrix.set(8, 14 - index, dark, true);
    }
  }
  matrix.set(matrix.size - 8, 8, true, true);
}

function encodedPaymentQrFormatBits(maskPattern) {
  const data = maskPattern;
  let remainder = data << 10;
  while (paymentQrBchDigit(remainder) - PAYMENT_QR_G15_BCH >= 0) {
    remainder ^= PAYMENT_QR_G15 << (paymentQrBchDigit(remainder) - PAYMENT_QR_G15_BCH);
  }
  return ((data << 10) | remainder) ^ PAYMENT_QR_G15_MASK;
}

function setupPaymentQrVersionInfo(matrix, version) {
  const bits = encodedPaymentQrVersionBits(version);
  for (let index = 0; index < 18; index += 1) {
    const row = Math.floor(index / 3);
    const col = index % 3 + matrix.size - 11;
    const dark = ((bits >>> index) & 1) === 1;
    matrix.set(row, col, dark, true);
    matrix.set(col, row, dark, true);
  }
}

function encodedPaymentQrVersionBits(version) {
  let remainder = version << 12;
  while (paymentQrBchDigit(remainder) - PAYMENT_QR_G18_BCH >= 0) {
    remainder ^= PAYMENT_QR_G18 << (paymentQrBchDigit(remainder) - PAYMENT_QR_G18_BCH);
  }
  return (version << 12) | remainder;
}

function paymentQrBchDigit(value) {
  let digit = 0;
  let data = value;
  while (data !== 0) {
    digit += 1;
    data >>>= 1;
  }
  return digit;
}

function paymentQrSymbolSize(version) {
  return version * 4 + 17;
}

class PaymentQrMatrix {
  constructor(size) {
    this.size = size;
    this.data = new Uint8Array(size * size);
    this.reserved = new Uint8Array(size * size);
  }

  has(row, col) {
    return row >= 0 && col >= 0 && row < this.size && col < this.size;
  }

  index(row, col) {
    return row * this.size + col;
  }

  set(row, col, value, reserved = false) {
    if (!this.has(row, col)) {
      return;
    }
    const index = this.index(row, col);
    this.data[index] = value ? 1 : 0;
    if (reserved) {
      this.reserved[index] = 1;
    }
  }

  get(row, col) {
    return this.data[this.index(row, col)];
  }

  xor(row, col) {
    this.data[this.index(row, col)] ^= 1;
  }

  isReserved(row, col) {
    return Boolean(this.reserved[this.index(row, col)]);
  }
}

const PAYMENT_QR_TOTAL_CODEWORDS = [
  0, 26, 44, 70, 100, 134, 172, 196, 242, 292, 346,
  404, 466, 532, 581, 655, 733, 815, 901, 991, 1085,
];
const PAYMENT_QR_EC_BLOCKS_M = [
  0, 1, 1, 2, 2, 2, 4, 4, 4, 5, 5,
  5, 8, 9, 9, 10, 10, 11, 13, 14, 16,
];
const PAYMENT_QR_EC_CODEWORDS_M = [
  0, 10, 16, 26, 36, 48, 64, 72, 88, 110, 130,
  150, 176, 198, 216, 240, 280, 308, 338, 364, 416,
];
const PAYMENT_QR_G15 = (1 << 10) | (1 << 8) | (1 << 5) | (1 << 4) | (1 << 2) | (1 << 1) | 1;
const PAYMENT_QR_G15_MASK = (1 << 14) | (1 << 12) | (1 << 10) | (1 << 4) | (1 << 1);
const PAYMENT_QR_G15_BCH = paymentQrBchDigit(PAYMENT_QR_G15);
const PAYMENT_QR_G18 = (1 << 12) | (1 << 11) | (1 << 10) | (1 << 9) | (1 << 8) | (1 << 5) | (1 << 2) | 1;
const PAYMENT_QR_G18_BCH = paymentQrBchDigit(PAYMENT_QR_G18);
const PAYMENT_QR_GF_EXP = new Uint8Array(512);
const PAYMENT_QR_GF_LOG = new Uint8Array(256);
for (let index = 0, value = 1; index < 255; index += 1) {
  PAYMENT_QR_GF_EXP[index] = value;
  PAYMENT_QR_GF_LOG[value] = index;
  value <<= 1;
  if (value & 0x100) {
    value ^= 0x11d;
  }
}
for (let index = 255; index < PAYMENT_QR_GF_EXP.length; index += 1) {
  PAYMENT_QR_GF_EXP[index] = PAYMENT_QR_GF_EXP[index - 255];
}

function renderQrCells(seed) {
  const text = String(seed ?? "membership-payment");
  let hash = 0;
  for (const char of text) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0;
  }
  const size = 21;
  const isFinder = (row, col, originRow, originCol) => {
    const r = row - originRow;
    const c = col - originCol;
    if (r < 0 || c < 0 || r > 6 || c > 6) {
      return false;
    }
    return (
      r === 0 ||
      r === 6 ||
      c === 0 ||
      c === 6 ||
      (r >= 2 && r <= 4 && c >= 2 && c <= 4)
    );
  };
  return Array.from({ length: size * size }, (_, index) => {
    const row = Math.floor(index / size);
    const col = index % size;
    const finder =
      isFinder(row, col, 0, 0) ||
      isFinder(row, col, 0, size - 7) ||
      isFinder(row, col, size - 7, 0);
    const timing = row === 6 || col === 6;
    const mixed = (hash + row * 17 + col * 29 + ((hash >> ((row + col) % 16)) & 7)) % 5;
    const active = finder || (timing ? (row + col) % 2 === 0 : mixed === 0 || mixed === 3);
    return `<i class="${active ? "is-on" : ""}"></i>`;
  }).join("");
}

function planNote(id) {
  if (id === "enterprise") {
    return "适合多团队、多项目并行生产。";
  }
  if (id === "pro") {
    return "推荐团队创作，解锁成员管理和团队资产库。";
  }
  if (id === "pro-quarter" || id === "pro-year") {
    return "适合稳定团队生产，权益按会员周期生效。";
  }
  if (id === "experience") {
    return "适合短期体验专业权益和会员积分。";
  }
  return "适合体验完整生成链路。";
}

function featuresForPlan(id) {
  if (id === "enterprise") {
    return ["可使用画布功能", "大客户专属服务", "Agent 创意工作流定制", "更多团队席位支持", "快速响应技术支持"];
  }
  if (id === "pro") {
    return ["可使用画布功能", "Seedance 2.0 优先队列", "全流程 Agent", "团队成员管理", "支持 50 人团队"];
  }
  if (id === "pro-quarter" || id === "pro-year") {
    return ["可使用画布功能", "Seedance 系列优先队列", "团队成员管理", "会员积分到期清零", "适合长期项目"];
  }
  if (id === "experience") {
    return ["可使用画布功能", "体验专业会员权益", "会员赠送积分", "短周期试用", "到期自动回收权益"];
  }
  return ["可使用画布功能", "全流程 Agent", "行业主流模型", "多剧集创作", "无团队管理"];
}

function mapBillingPackagesToPlans(packages) {
  if (!Array.isArray(packages) || !packages.length) {
    return [];
  }

  return packages.map((pkg, index) => {
    const amountMinor = Number(pkg?.amountMinor ?? 0);
    const credits = Number(pkg?.credits ?? 0);
    return {
      id: String(pkg?.code ?? pkg?.id ?? `package-${index}`),
      packageId: String(pkg?.id ?? pkg?.code ?? `package-${index}`),
      name: String(pkg?.displayName ?? pkg?.code ?? `套餐 ${index + 1}`),
      price: amountMinor > 0 ? `¥${Math.round(amountMinor / 100)}` : "联系商务",
      credits: credits > 0 ? `${credits} 积分` : "定制",
    };
  });
}

function mapDirectRechargePackagesToPlans(packages) {
  return mapBillingPackagesToPlans(
    Array.isArray(packages)
      ? packages.filter((pkg) => normalizeObject(pkg?.metadata ?? pkg?.metadataJson ?? pkg?.metadata_json).kind === "direct_recharge")
      : [],
  );
}

function isActiveMembershipStatus(status) {
  const normalizedStatus = String(status ?? "");
  return normalizedStatus === "active" || normalizedStatus.endsWith("_active");
}

function formatAmount(amountMinor, currency) {
  const amount = Number(amountMinor ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return "待确认金额";
  }
  const symbol = currency === "CNY" ? "¥" : `${currency ?? ""} `;
  const major = amount / 100;
  return `${symbol}${Number.isInteger(major) ? String(major) : major.toFixed(2)}`;
}

function formatRemainingTime(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return "15:00";
  }
  const remainingMs = Math.max(0, date.getTime() - Date.now());
  const totalSeconds = Math.ceil(remainingMs / 1000);
  const minutes = `${Math.floor(totalSeconds / 60)}`.padStart(2, "0");
  const seconds = `${totalSeconds % 60}`.padStart(2, "0");
  return `${minutes}:${seconds}`;
}

function membershipStatusLabel(status) {
  if (status === "professional_active") return "专业版生效中";
  if (status === "experience_active") return "体验会员生效中";
  if (status === "expired") return "会员已过期";
  return "暂未开通";
}

function normalizeObject(value) {
  if (typeof value === "string") {
    try {
      return normalizeObject(JSON.parse(value));
    } catch {
      return {};
    }
  }
  if (!value || typeof value !== "object" || Array.isArray(value)) {
    return {};
  }
  return value;
}

function paymentStatusLabel(status, orderStatus) {
  if (status === "creating") return "生成中";
  if (isSucceededPayment(status, orderStatus)) return "已支付";
  if (status === "expired" || status === "closed") return "已失效";
  if (status === "failed") return "支付失败";
  return "待支付";
}

function isSucceededPayment(status, orderStatus) {
  return status === "succeeded" || status === "paid" || orderStatus === "paid";
}

function isExpiredPayment(status, expiresAt) {
  if (status === "expired" || status === "closed") {
    return true;
  }
  const expires = expiresAt ? new Date(expiresAt) : null;
  return Boolean(expires && Number.isFinite(expires.getTime()) && expires.getTime() <= Date.now());
}
