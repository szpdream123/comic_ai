import { commercePrototypeNotice, pricingPlans } from "../../shared/commerce-fixtures.js";
import { escapeAttr, escapeHtml } from "./markup.js";

export function renderPricingModal({
  open = false,
  packages = null,
  paymentIntent = null,
  paymentAction = null,
  billingOrder = null,
} = {}) {
  if (!open) {
    return "";
  }

  const resolvedPlans = mapBillingPackagesToPlans(packages);

  return `
    <div class="library-team-modal-backdrop" data-modal="pricing">
      <section
        class="library-team-modal library-team-pricing-modal"
        role="dialog"
        aria-modal="true"
        aria-labelledby="pricing-modal-title"
      >
        <header class="library-team-modal-header">
          <div class="library-team-tabs" role="tablist" aria-label="商业功能">
            <button class="library-team-tab is-active" type="button" role="tab" aria-selected="true">积分加量</button>
            <button class="library-team-tab" type="button" role="tab" aria-selected="false" disabled title="兑换码能力暂未开放">兑换码</button>
          </div>
          <button class="library-team-icon-button" type="button" data-action="close-pricing" aria-label="关闭定价弹窗">脳</button>
        </header>
        <div class="library-team-promo" role="note">Seedance 2.0 活动延续至 6 月 1 日，专业版会员最高可享 8.5 折，720P、1080P、2K 多个清晰度可选。</div>
        <p class="library-team-kicker">积分与团队权益</p>
        <h2 id="pricing-modal-title">团队生产扩容</h2>
        <p class="library-team-commerce-notice">${escapeHtml(commercePrototypeNotice)}</p>
        ${renderPaymentIntentPanel(paymentIntent, paymentAction, billingOrder)}
        <div class="library-team-plan-grid">
          ${resolvedPlans.map(renderPricingPlan).join("")}
        </div>
      </section>
    </div>
  `;
}

function renderPricingPlan(plan) {
  const featured = plan.id === "pro";
  const actionLabel =
    plan.id === "enterprise" ? "联系商务" : plan.id === "pro" ? "立即订阅" : "立即购买";
  const actionName = plan.id === "enterprise" ? "request-enterprise-contact" : "purchase-billing-package";
  const packageId = plan.packageId ?? plan.id;

  return `
    <article class="library-team-plan-card${featured ? " is-featured" : ""}">
      ${featured ? '<span class="library-team-badge">最受欢迎</span>' : ""}
      <h3>${escapeHtml(plan.name)}</h3>
      <p class="library-team-price">${escapeHtml(plan.price)}</p>
      <p class="library-team-credits">${escapeHtml(plan.credits)}</p>
      <p class="library-team-plan-note">${escapeHtml(planNote(plan.id))}</p>
      <button
        class="library-team-button${featured ? " library-team-button-primary" : ""}"
        type="button"
        data-action="${escapeAttr(actionName)}"
        data-plan-id="${escapeAttr(plan.id)}"
        data-package-id="${escapeAttr(packageId)}"
        data-provider="wechat_pay"
      >${escapeHtml(actionLabel)}</button>
      <ul class="library-team-feature-list">
        ${featuresForPlan(plan.id).map((feature) => `<li>${escapeHtml(feature)}</li>`).join("")}
      </ul>
    </article>
  `;
}

function renderPaymentIntentPanel(paymentIntent, paymentAction, billingOrder) {
  if (!paymentIntent) {
    return `
      <section class="library-team-payment-panel is-empty" aria-label="支付意图状态">
        <div>
          <p class="library-team-kicker">支付意图</p>
          <h3>选择套餐后创建支付单</h3>
          <p>下单后会在这里显示最新的支付单号、金额和支付方式，方便继续完成充值。</p>
        </div>
      </section>
    `;
  }

  const amountLabel = formatAmount(paymentIntent.amountMinor, paymentIntent.currency);
  return `
    <section class="library-team-payment-panel" aria-label="支付意图状态">
      <div class="library-team-payment-copy">
        <p class="library-team-kicker">支付意图</p>
        <h3>${escapeHtml(amountLabel)}</h3>
        <p>订单号 ${escapeHtml(paymentIntent.merchantOrderNo ?? paymentIntent.id ?? "-")}</p>
        <dl class="library-team-payment-meta">
          <div><dt>状态</dt><dd>${escapeHtml(paymentIntent.status ?? "submitted")}</dd></div>
          <div><dt>渠道</dt><dd>${escapeHtml(paymentIntent.provider ?? paymentAction?.provider ?? "wechat_pay")}</dd></div>
          <div><dt>到期</dt><dd>${escapeHtml(formatTimestamp(paymentIntent.expiresAt))}</dd></div>
        </dl>
        <div class="library-team-payment-actions">
          <button
            class="library-team-button"
            type="button"
            data-action="refresh-payment-intent"
            data-payment-intent-id="${escapeAttr(paymentIntent.id ?? "")}"
            data-order-id="${escapeAttr(billingOrder?.id ?? paymentIntent.orderId ?? "")}"
          >刷新支付状态</button>
        </div>
      </div>
      <div class="library-team-payment-qr" aria-label="模拟支付二维码">
        <strong>${escapeHtml(paymentAction?.kind === "mock_qr" ? "模拟扫码支付" : "待支付")}</strong>
        <span>${escapeHtml(paymentAction?.merchantOrderNo ?? paymentIntent.merchantOrderNo ?? "-")}</span>
      </div>
    </section>
  `;
}

function planNote(id) {
  if (id === "enterprise") {
    return "适合多团队、多项目并行生产。";
  }
  if (id === "pro") {
    return "推荐团队创作，解锁成员管理和团队资产库。";
  }
  return "适合体验完整生成链路。";
}

function featuresForPlan(id) {
  if (id === "enterprise") {
    return ["大客户专属客服", "Agent 创意工作流定制", "更多团队席位支持", "快速响应技术支持"];
  }
  if (id === "pro") {
    return ["Seedance 2.0 免排队", "全流程 Agent", "团队管理", "支持 50 人团队"];
  }
  return ["全流程 Agent", "行业主流模型", "多剧集创作", "无团队管理"];
}

function mapBillingPackagesToPlans(packages) {
  if (!Array.isArray(packages) || !packages.length) {
    return pricingPlans.map((plan) => ({ ...plan, packageId: plan.id }));
  }

  return packages.map((pkg, index) => {
    const amountMinor = Number(pkg?.amountMinor ?? 0);
    const credits = Number(pkg?.credits ?? 0);
    return {
      id: String(pkg?.code ?? pkg?.id ?? `package-${index}`),
      packageId: String(pkg?.id ?? pkg?.code ?? `package-${index}`),
      name: String(pkg?.displayName ?? pkg?.code ?? `套餐 ${index + 1}`),
      price: amountMinor > 0 ? `¥${Math.round(amountMinor / 100)}` : "联系商务",
      credits: credits > 0 ? `${credits}积分` : "定制",
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

function formatTimestamp(value) {
  const date = value ? new Date(value) : null;
  if (!date || Number.isNaN(date.getTime())) {
    return "待创建";
  }
  const month = `${date.getMonth() + 1}`.padStart(2, "0");
  const day = `${date.getDate()}`.padStart(2, "0");
  const hour = `${date.getHours()}`.padStart(2, "0");
  const minute = `${date.getMinutes()}`.padStart(2, "0");
  return `${month}-${day} ${hour}:${minute}`;
}
