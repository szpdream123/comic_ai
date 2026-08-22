import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { ModelError, translateProviderErrorMessage } from "../provider-error-message.ts";
import {
  providerResponseDiagnostics,
  providerResponseError,
} from "../provider-response-diagnostics.ts";

describe("provider error message", () => {
  it("attributes provider fetch failures to channel reference parsing", () => {
    assert.equal(
      translateProviderErrorMessage("fetch failed"),
      "渠道参考内容无法解析、请更换渠道。",
    );
  });

  it("updates the persisted legacy fetch failure message", () => {
    assert.equal(
      translateProviderErrorMessage("无法连接模型服务或连接中途断开，请稍后重试。"),
      "渠道参考内容无法解析、请更换渠道。",
    );
  });

  it("translates a nested provider authentication failure even when the HTTP status is absent", () => {
    assert.equal(
      translateProviderErrorMessage(
        'fail_to_fetch_task:{"error":{"code":"AuthenticationError","message":"The API key format is incorrect.","type":"Unauthorized"}}',
      ),
      "模型服务鉴权失败，请检查 API 密钥和账号权限。",
    );
  });

  it("extracts a public image URL requirement from provider diagnostics", () => {
    const body = JSON.stringify({
      error: {
        code: "bad_request",
        type: "invalid_request_error",
        message: "image_url must be a publicly reachable http or https URL",
      },
    });
    const error = providerResponseError(
      "cumob_image_400",
      providerResponseDiagnostics(new Response(body, { status: 400 }), body),
    );

    assert.equal(error instanceof ModelError, true);
    assert.equal(error.message, "cumob_image_400");
    assert.equal(error.failureCode, null);
    assert.equal(error.code, "model_reference_url_not_public");
    assert.equal(error.displayMessage, "本地图片无法解析，请上传公网图片。");
    assert.equal(translateProviderErrorMessage(error), "本地图片无法解析，请上传公网图片。");
    const failure = error.toFailureRecord();
    assert.equal(failure.code, "model_reference_url_not_public");
    assert.equal(failure.displayMessage, "本地图片无法解析，请上传公网图片。");
    assert.equal(failure.providerMessage, "本地图片无法解析，请上传公网图片。");
    assert.equal(failure.providerErrorCode, "bad_request");
    assert.deepEqual(failure.details, {
      contentType: "text/plain;charset=UTF-8",
      httpStatus: 400,
    });
    assert.doesNotMatch(JSON.stringify(failure), /image_url must be/i);
  });

  it("unifies oversized reference material provider errors", () => {
    assert.equal(
      translateProviderErrorMessage(
        'global_ai_opc_video_400:{"error":{"message":"File size exceeds maximum allowed size of 20971520 bytes"}}',
      ),
      "参考素材不可大于20M",
    );
    assert.equal(
      translateProviderErrorMessage(new Error("san_bao_payload_too_large"), {
        failureCode: "san_bao_payload_too_large",
      }),
      "参考素材不可大于20M",
    );
  });

  it("extracts nested provider messages from persisted diagnostics-only failures", () => {
    assert.equal(
      translateProviderErrorMessage({
        displayMessage: "图片模型服务返回 HTTP 400，任务没有拿到生成结果。",
        providerDiagnostics: {
          httpStatus: 400,
          responseBodyPreview: '{"error":{"message":"image_url must be a publicly reachable http or https URL"}}',
        },
      }),
      "本地图片无法解析，请上传公网图片。",
    );
  });

  it("keeps unknown provider errors behind a safe fallback", () => {
    assert.equal(
      translateProviderErrorMessage("opaque upstream failure text"),
      "模型服务返回错误，任务没有拿到生成结果，请稍后重试。",
    );
    assert.equal(
      translateProviderErrorMessage("opaque upstream failure text", { mediaType: "video" }),
      "生成失败，请修改素材或提示词后重新生成",
    );
  });

  it("does not classify prompts or unrelated response metadata as provider errors", () => {
    assert.equal(
      translateProviderErrorMessage({
        providerStatus: "failed",
        message: "opaque upstream rejection",
        prompt: "public safety network documentary",
        metadata: { description: "内容安全场景" },
      }),
      "模型服务返回错误，任务没有拿到生成结果，请稍后重试。",
    );
  });

  it("uses the video retry guidance for generic provider failures", () => {
    assert.equal(
      translateProviderErrorMessage("generation failed", { mediaType: "video" }),
      "生成失败，请修改素材或提示词后重新生成",
    );
  });

  it("keeps stable platform model errors ahead of generic provider parsing", () => {
    assert.equal(
      translateProviderErrorMessage(new Error("model_not_configured"), {
        failureCode: "model_not_configured",
      }),
      "模型不可用，请切换模型。",
    );
    assert.equal(
      translateProviderErrorMessage({
        message: "provider response metadata",
        providerDiagnostics: { httpStatus: 200, responseBodyPreview: '{"status":"succeeded"}' },
      }, {
        failureCode: "provider_output_storage_failed",
      }),
      "存储失败，等待人工处理。",
    );
  });

  it("translates documented SanBao account-balance errors through the error factory", () => {
    assert.equal(
      translateProviderErrorMessage(new Error("san_bao_402"), { failureCode: "san_bao_insufficient_balance" }),
      "三宝影像账户积分不足，请联系管理员充值后重试。",
    );
  });

  it("reads OpenAI-compatible SDK status and request identifiers", () => {
    const error = ModelError.fromUnknown({
      status: 429,
      request_id: "req-rate-limit-1",
      error: { code: "rate_limit_exceeded", message: "Too many requests" },
    });

    assert.equal(error.httpStatus, 429);
    assert.equal(error.requestId, "req-rate-limit-1");
    assert.equal(error.retryable, true);
    assert.equal(error.displayMessage, "模型服务请求过于频繁，请稍后重试。");
  });
});
