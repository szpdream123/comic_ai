import { commercePrototypeNotice } from "../../shared/commerce-fixtures.js";
import { escapeAttr, escapeHtml } from "./markup.js";

const MEMBERSHIP_PAYMENT_MANUAL_REFRESH_DELAY_MS = 30 * 1000;

export function renderPricingModal({
  open = false,
  packages = null,
  membershipPlans = null,
  membershipStatus = null,
  paymentIntent = null,
  paymentAction = null,
  billingOrder = null,
  membershipPaymentState = null,
} = {}) {
  if (!open) {
    return "";
  }

  const plans = mapMembershipPlansToPricingPlans(membershipPlans);
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
          <button class="library-team-icon-button" type="button" data-action="close-pricing" aria-label="关闭定价弹窗">×</button>
        </header>
        <div class="library-team-subscription-layout">
          <section class="library-team-subscription-plans" aria-label="会员套餐">
            <div class="library-team-subscription-summary">
              <span class="library-team-subscription-mark" aria-hidden="true">PRO</span>
              <div>
                <p class="library-team-kicker">当前状态</p>
                <strong>${escapeHtml(membershipStatusLabel(activeStatus))}</strong>
              </div>
            </div>
            <p class="library-team-commerce-notice">${escapeHtml(commercePrototypeNotice)}</p>
            <div class="library-team-plan-grid">
              ${plans.length ? plans.map((plan) => renderPricingPlan(plan, selectedPlan?.id)).join("") : renderMembershipPlanEmptyState()}
            </div>
          </section>
        </div>
      </section>
    </div>
    ${renderMembershipPaymentModal(paymentIntent, paymentAction, billingOrder, selectedPlan, membershipPaymentState)}
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

  return `
    <article
      class="library-team-plan-card${featured ? " is-featured" : ""}${selected ? " is-selected" : ""}"
      data-plan-tier="${escapeAttr(plan.tier ?? plan.id)}"
    >
      <span class="library-team-badge${featured ? "" : " is-placeholder"}" aria-hidden="${featured ? "false" : "true"}">${featured ? "推荐" : ""}</span>
      <h3>${escapeHtml(plan.name)}</h3>
      <p class="library-team-price">${escapeHtml(plan.price)}</p>
      <p class="library-team-credits">${escapeHtml(plan.credits)}</p>
      <p class="library-team-plan-note">${escapeHtml(plan.note || planNote(plan.id))}</p>
      <button
        class="library-team-button${featured ? " library-team-button-primary" : ""}"
        type="button"
        data-action="${escapeAttr(actionName)}"
        data-plan-id="${escapeAttr(planId)}"
        data-package-id="${escapeAttr(packageId)}"
        data-provider="wechat_pay"
      >${escapeHtml(actionLabel)}</button>
      <ul class="library-team-feature-list">
        ${(plan.features?.length ? plan.features : featuresForPlan(plan.id)).map((feature) => `<li>${escapeHtml(feature)}</li>`).join("")}
      </ul>
    </article>
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
  if (!metadata || typeof metadata !== "object" || Array.isArray(metadata)) {
    return [];
  }
  const features = metadata.features ?? metadata.benefits;
  if (!Array.isArray(features)) {
    return [];
  }
  const normalizedFeatures = features.map((feature) => String(feature ?? "").trim()).filter(Boolean);
  if (!Array.isArray(entitlements)) {
    return normalizedFeatures;
  }
  const selectedEntitlementSet = new Set(
    entitlements.map((item) => String(item ?? "").trim()).filter(Boolean),
  );
  return normalizedFeatures.filter((feature) => {
    const entitlementKey = membershipKnownFeatureEntitlement(feature);
    return !entitlementKey || selectedEntitlementSet.has(entitlementKey);
  });
}

function membershipKnownFeatureEntitlement(feature) {
  return new Map([
    ["可使用画布功能", "canvas_access"],
    ["Seedance 2.0 优先排队", "priority_generation"],
    ["团队成员管理", "team_member_management"],
    ["全流程 Agent", "full_flow_agent"],
  ]).get(feature);
}

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

function renderMembershipPaymentModal(paymentIntent, paymentAction, billingOrder, selectedPlan, membershipPaymentState) {
  if (!paymentIntent) {
    return "";
  }
  const amountLabel = formatAmount(paymentIntent.amountMinor, paymentIntent.currency);
  const status = String(paymentIntent.status ?? billingOrder?.status ?? "submitted");
  const orderNo = paymentAction?.merchantOrderNo ?? paymentIntent.merchantOrderNo ?? billingOrder?.orderNo ?? paymentIntent.id ?? "-";
  const expiresAt = membershipPaymentState?.qrExpiresAt ?? paymentIntent.expiresAt ?? null;
  const expired = isExpiredPayment(status, expiresAt);
  const succeeded = isSucceededPayment(status, billingOrder?.status);
  const agreementAccepted = membershipPaymentState?.agreementAccepted !== false;
  const realPaymentUrl = resolvePaymentActionUrl(paymentAction);
  const showManualRefresh = shouldShowManualPaymentRefresh(membershipPaymentState, { expired, succeeded });
  const statusCopy = succeeded
    ? "支付成功，会员权益已生效"
    : expired
      ? "二维码已失效，请重新生成"
      : !agreementAccepted
        ? "请先阅读并同意付费会员服务协议"
        : membershipPaymentState?.polling
          ? "等待支付中，正在自动确认"
          : "等待扫码支付";
  const modalTitle = succeeded ? "会员已开通" : expired ? "二维码已过期" : "确认会员订单";

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
            <p class="library-team-kicker">会员支付</p>
            <h2 id="membership-payment-title">${escapeHtml(modalTitle)}</h2>
            <p>支付成功后自动开通，无需刷新页面。</p>
          </div>
          <button class="library-team-icon-button" type="button" data-action="close-membership-payment" aria-label="关闭支付弹窗">×</button>
        </header>
        <div class="library-team-payment-modal-body">
          <section class="library-team-payment-card" aria-label="会员支付二维码">
            ${succeeded
              ? renderPaymentSuccessState(orderNo)
              : renderPaymentScanState({
                  agreementAccepted,
                  expired,
                  expiresAt,
                  orderNo,
                  realPaymentUrl,
                })}
            <div class="library-team-payment-summary">
              <div class="library-team-payment-total">
                <span>订单金额</span>
                <strong>${escapeHtml(amountLabel)}</strong>
              </div>
              ${selectedPlan ? renderSelectedPlanDigest(selectedPlan) : ""}
              <p class="library-team-payment-status">${escapeHtml(statusCopy)}</p>
              ${renderPaymentFlow({ succeeded, expired })}
              <dl class="library-team-payment-meta">
                <div><dt>订单</dt><dd>${escapeHtml(orderNo)}</dd></div>
                <div><dt>状态</dt><dd>${escapeHtml(paymentStatusLabel(status, billingOrder?.status))}</dd></div>
                <div><dt>支付方式</dt><dd>手机扫码</dd></div>
              </dl>
            </div>
          </section>
          ${renderPaymentActions({
            billingOrder,
            expired,
            paymentAction,
            paymentIntent,
            selectedPlan,
            showManualRefresh,
            membershipPaymentState,
          })}
          ${renderPaymentAgreement(agreementAccepted)}
        </div>
      </section>
    </div>
  `;
}

function renderPaymentScanState({ agreementAccepted, expired, expiresAt, orderNo, realPaymentUrl }) {
  if (expired) {
    return `
      <div class="library-team-payment-scan is-blocked">
        ${renderPaymentExpiredState(orderNo)}
        <p class="library-team-payment-provider">二维码已过期，请重新生成后扫码支付</p>
      </div>
    `;
  }
  if (!agreementAccepted) {
    return `
      <div class="library-team-payment-scan is-blocked">
        ${renderPaymentAgreementBlockedState(orderNo)}
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
      ${realPaymentUrl
        ? renderRealPaymentAction(realPaymentUrl, orderNo)
        : renderMockPaymentQr({ expired: false, succeeded: false, orderNo })}
      <p class="library-team-payment-provider">扫码后将自动确认权益</p>
    </div>
  `;
}

function renderPaymentSuccessState(orderNo) {
  return `
    <div class="library-team-payment-success-hero" data-payment-success-state>
      <div class="library-team-payment-success-mark" aria-hidden="true">✓</div>
      <div class="library-team-payment-success-copy">
        <strong>会员权益已生效</strong>
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

function renderPaymentAgreementBlockedState(orderNo) {
  return `
    <div class="library-team-payment-blocked-hero" data-payment-agreement-blocked>
      <div class="library-team-payment-blocked-mark" aria-hidden="true">i</div>
      <div class="library-team-payment-success-copy">
        <strong>请先勾选并同意付费会员服务协议</strong>
        <span>订单 ${escapeHtml(orderNo)}</span>
      </div>
      <p>取消同意后不会展示支付二维码，也不会继续引导扫码付款。</p>
    </div>
  `;
}

function renderPaymentFlow({ succeeded, expired }) {
  return `
    <ol class="library-team-payment-flow" aria-label="支付流程">
      <li class="is-active">
        <span>1</span>
        <strong>扫码支付</strong>
        <small>使用手机完成付款</small>
      </li>
      <li class="${succeeded ? "is-active" : expired ? "is-muted" : ""}">
        <span>2</span>
        <strong>自动确认</strong>
        <small>系统轮询支付结果</small>
      </li>
      <li class="${succeeded ? "is-active" : ""}">
        <span>3</span>
        <strong>权益生效</strong>
        <small>解锁会员权益</small>
      </li>
    </ol>
  `;
}

function renderPaymentActions({
  billingOrder,
  expired,
  paymentAction,
  paymentIntent,
  selectedPlan,
  showManualRefresh,
  membershipPaymentState,
}) {
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
        data-action="regenerate-membership-payment-qr"
        data-plan-id="${escapeAttr(membershipPaymentState?.pendingMembershipPlanId ?? selectedPlan?.membershipPlanId ?? "")}"
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

function renderSelectedPlanDigest(plan) {
  return `
    <div class="library-team-selected-plan">
      <span>${escapeHtml(plan.name)}</span>
      <strong>${escapeHtml(plan.price)}</strong>
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

function renderPaymentAgreement(agreementAccepted = true) {
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
      <a href="#/agreements/paid-membership" target="_blank" rel="noopener noreferrer">《付费会员服务协议》</a>
    </div>
  `;
}

function renderRealPaymentAction(paymentUrl, orderNo) {
  const isImageLike = /^data:image\//i.test(paymentUrl) || /\.(?:png|jpg|jpeg|webp|gif|svg)(?:[?#].*)?$/i.test(paymentUrl);
  return `
    <div class="library-team-payment-qr is-real" aria-label="支付二维码" data-payment-real-action>
      ${
        isImageLike
          ? `<img class="library-team-payment-qr-image" src="${escapeAttr(paymentUrl)}" alt="支付二维码" loading="lazy" />`
          : `<a class="library-team-payment-link" href="${escapeAttr(paymentUrl)}" target="_blank" rel="noopener noreferrer">打开支付页面</a>`
      }
      <strong>请使用支付页面完成付款</strong>
      <span>${escapeHtml(orderNo)}</span>
    </div>
  `;
}

function renderMockPaymentQr({ expired, succeeded, orderNo }) {
  return `
    <div class="library-team-payment-qr${expired ? " is-expired" : ""}${succeeded ? " is-success" : ""}" aria-label="支付二维码">
      <div class="library-team-qr-code" aria-hidden="true">
        ${renderQrCells(orderNo)}
      </div>
      <strong>${escapeHtml(succeeded ? "支付已完成" : expired ? "二维码已过期" : "请使用手机扫码支付")}</strong>
      <span>${escapeHtml(orderNo)}</span>
    </div>
  `;
}

function resolvePaymentActionUrl(paymentAction) {
  for (const key of ["qrCodeUrl", "qr_code_url", "codeUrl", "code_url", "paymentUrl", "payment_url", "url"]) {
    const value = paymentAction?.[key];
    if (typeof value === "string" && value.trim()) {
      const paymentUrl = value.trim();
      if (isSafePaymentUrl(paymentUrl)) {
        return paymentUrl;
      }
    }
  }
  return "";
}

function isSafePaymentUrl(value) {
  if (/^data:image\/(?:png|jpe?g|webp|gif);base64,[a-z0-9+/=]+$/i.test(value)) {
    return true;
  }
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

function formatAmount(amountMinor, currency) {
  const amount = Number(amountMinor ?? 0);
  if (!Number.isFinite(amount) || amount <= 0) {
    return "待确认金额";
  }
  const symbol = currency === "CNY" ? "¥" : `${currency ?? ""} `;
  return `${symbol}${Math.round(amount / 100)}`;
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

function paymentStatusLabel(status, orderStatus) {
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
