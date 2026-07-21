function text(value) {
  return typeof value === "string" && value.trim() ? value.trim() : "";
}

function pricingValue(model, key) {
  const pricing = model?.pricing && typeof model.pricing === "object" && !Array.isArray(model.pricing)
    ? model.pricing
    : null;
  return pricing && Object.prototype.hasOwnProperty.call(pricing, key)
    ? pricing[key]
    : model?.[key];
}

function positiveNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

export function estimateCanvasGenerationCredits(model, parameters = {}) {
  const baseCredits = Number(pricingValue(model, "baseCredits"));
  if (!Number.isFinite(baseCredits) || baseCredits < 0) return null;

  const defaults = model?.defaultParams && typeof model.defaultParams === "object"
    ? model.defaultParams
    : {};
  const resolution = text(parameters.resolution)
    || text(parameters.quality)
    || text(parameters.ratio)
    || text(parameters.aspectRatio)
    || text(defaults.resolution)
    || text(defaults.quality)
    || text(defaults.ratio)
    || text(defaults.aspectRatio);
  const resolutionCredits = pricingValue(model, "resolutionCredits");
  const configuredCredits = resolution
    && resolutionCredits
    && typeof resolutionCredits === "object"
    && !Array.isArray(resolutionCredits)
    ? Number(resolutionCredits[resolution])
    : Number.NaN;
  const unitCredits = Number.isFinite(configuredCredits) && configuredCredits >= 0
    ? configuredCredits
    : baseCredits;
  const durationSec = positiveNumber(parameters.durationSec)
    ?? positiveNumber(defaults.durationSec)
    ?? 1;
  const cost = text(pricingValue(model, "billingMode")) === "duration" && model?.mediaType === "video"
    ? unitCredits * durationSec
    : unitCredits;
  if (!Number.isFinite(cost) || cost < 0) return null;
  return cost > 0 && cost < 1 ? 1 : Math.round(cost);
}

export function normalizeCanvasCreditBalance(value) {
  const candidate = value && typeof value === "object"
    ? value.availableCredits ?? value.creditBalance
    : value;
  if (candidate === null || candidate === undefined || candidate === "") return null;
  const parsed = Number(candidate);
  return Number.isFinite(parsed) && parsed >= 0 ? parsed : null;
}

export function resolveCanvasGenerationCreditState(model, parameters, creditBalance) {
  const estimatedCredits = estimateCanvasGenerationCredits(model, parameters);
  const availableCredits = normalizeCanvasCreditBalance(creditBalance);
  return {
    estimatedCredits,
    availableCredits,
    insufficient: estimatedCredits !== null
      && availableCredits !== null
      && availableCredits < estimatedCredits,
  };
}

export function estimateCanvasGenerationBatchCredits(items) {
  const estimates = (Array.isArray(items) ? items : [])
    .map((item) => estimateCanvasGenerationCredits(item?.model, item?.parameters));
  const knownCredits = estimates.reduce((total, value) => total + (value ?? 0), 0);
  const unknownCount = estimates.filter((value) => value === null).length;
  return {
    estimatedCredits: unknownCount ? null : knownCredits,
    knownCredits,
    unknownCount,
    itemCount: estimates.length,
  };
}

export function canvasGenerationCreditMessage(state, balanceStatus) {
  if (state.estimatedCredits === null) return "预计积分暂不可用，提交时以后端校验为准。";
  if (state.insufficient) return `预计 ${state.estimatedCredits} 积分，当前余额 ${state.availableCredits}，积分不足，请先充值。`;
  if (state.availableCredits !== null) return `预计 ${state.estimatedCredits} 积分，当前余额 ${state.availableCredits}。`;
  if (balanceStatus === "loading") return `预计 ${state.estimatedCredits} 积分，正在读取余额…`;
  return `预计 ${state.estimatedCredits} 积分，余额暂不可用，提交时以后端校验为准。`;
}
