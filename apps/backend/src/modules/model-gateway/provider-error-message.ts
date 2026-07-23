import { ModelError, type ModelErrorContext } from "./model-error.ts";

export { ModelError } from "./model-error.ts";

export function translateProviderErrorMessage(value: unknown, context: ModelErrorContext = {}): string {
  if (value === "无法连接模型服务或连接中途断开，请稍后重试。") {
    return "渠道参考内容无法解析、请更换渠道。";
  }
  return ModelError.displayMessage(value, context);
}

export function translateProviderErrorMessageField(key: string | undefined, value: string): string {
  const normalizedKey = String(key ?? "").toLowerCase();
  if (
    normalizedKey.includes("message") ||
    normalizedKey.includes("preview") ||
    normalizedKey.includes("reason") ||
    normalizedKey === "statustext" ||
    normalizedKey === "display"
  ) {
    return translateProviderErrorMessage(value);
  }
  return value;
}
