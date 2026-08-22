import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { generationFailureDisplayMessage } from "../phone-auth-dev-server.ts";

describe("generation failure display messages", () => {
  it("keeps generic fetch failures provider-neutral for video models", () => {
    const message = generationFailureDisplayMessage({
      failureCode: "provider_failed",
      snapshotFailure: {
        displayMessage: "fetch failed",
      },
      providerMessage: "fetch failed",
      requestSnapshot: {
        kind: "video",
        model: "cvk",
        modelDisplayName: "Seedance 2.0 720p(限时特价)",
        providerExecutor: "seedance",
      },
    });

    assert.equal(
      message,
      "无法连接Seedance 2.0 720p(限时特价)，后端没有收到提交响应，无法确认任务是否已创建。请检查网络、模型配置和服务状态后重试。",
    );
    assert.doesNotMatch(message, /GPT Image 2|灵动|中转/);
  });

  it("keeps GPT Image 2 wording for image fetch failures", () => {
    const message = generationFailureDisplayMessage({
      failureCode: "provider_failed",
      snapshotFailure: {
        displayMessage: "fetch failed",
      },
      providerMessage: "fetch failed",
      requestSnapshot: {
        kind: "image",
        model: "gpt-image-2-cn",
      },
    });

    assert.equal(
      message,
      "无法连接 GPT Image 2 供应商或中转站，后端没有收到响应。请检查网络、中转站地址和服务状态后重试。",
    );
  });

  it("maps unavailable Lingdong video channel errors to a public message", () => {
    const rawProviderMessage = "lingdong_api_video_400:fail to fetch task({\"error\":{\"message\":\"测试通道暂时不可用，请稍后重试\",\"code\":\"invalid_request_error\",\"type\":\"invalid_request_error\"}})";
    const message = generationFailureDisplayMessage({
      failureCode: "provider_failed",
      snapshotFailure: {
        displayMessage: rawProviderMessage,
      },
      providerMessage: rawProviderMessage,
      requestSnapshot: {
        kind: "video",
        model: "cvk",
        modelDisplayName: "Seedance 2.0 720p(限时特价)",
      },
    });

    assert.equal(message, "渠道暂不可用");
  });

  it("uses the generic video retry guidance for unknown provider failures", () => {
    const message = generationFailureDisplayMessage({
      failureCode: "provider_failed",
      snapshotFailure: {
        displayMessage: "模型服务返回错误，任务没有拿到生成结果，请稍后重试。",
      },
      requestSnapshot: {
        kind: "video",
      },
    });

    assert.equal(message, "生成失败，请修改素材或提示词后重新生成");
  });

  it("prefers a concrete provider response over a persisted generic image failure", () => {
    const message = generationFailureDisplayMessage({
      failureCode: "provider_failed",
      snapshotFailure: {
        displayMessage: "图片生成服务失败，请稍后重试",
      },
      providerResponse: {
        diagnostics: {
          httpStatus: 400,
          responseBodyPreview: '{"error":{"code":"bad_request","message":"image_url must be a publicly reachable http or https URL"}}',
        },
      },
      requestSnapshot: {
        kind: "image",
        model: "gpt-image-2-cn",
      },
    });

    assert.equal(message, "本地图片无法解析，请上传公网图片。");
  });

  it("does not replace platform storage failures with successful provider diagnostics", () => {
    for (const [failureCode, expected] of [
      ["provider_output_download_failed", "存储超时，正在重试。"],
      ["provider_output_upload_failed", "存储超时，正在重试。"],
      ["provider_output_storage_failed", "存储失败，等待人工处理。"],
    ]) {
      assert.equal(
        generationFailureDisplayMessage({
          failureCode,
          snapshotFailure: {},
          providerResponse: {
            diagnostics: {
              httpStatus: 200,
              responseBodyPreview: '{"status":"succeeded"}',
            },
          },
        }),
        expected,
      );
    }
  });
});
