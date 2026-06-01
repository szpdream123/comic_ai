export type TextModelGatewayErrorCode =
  | "model_not_configured"
  | "model_disabled"
  | "provider_auth_missing"
  | "provider_request_already_started"
  | "provider_stream_error"
  | "stream_interrupted_before_usage";

export class TextModelGatewayError extends Error {
  constructor(
    readonly code: TextModelGatewayErrorCode,
    message = code,
    readonly cause?: unknown,
  ) {
    super(message);
    this.name = "TextModelGatewayError";
  }
}
