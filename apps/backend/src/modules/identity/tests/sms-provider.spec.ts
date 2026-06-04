import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

import {
  createSmsProviderFromEnv,
  DevSmsProvider,
  type TencentSmsClientLike,
  TencentSmsProvider,
} from "../sms-provider.ts";

describe("SMS providers", () => {
  it("uses the dev provider when Tencent SMS is disabled", async () => {
    const provider = createSmsProviderFromEnv({
      TENCENT_SMS_ENABLED: "false",
    });

    assert.ok(provider instanceof DevSmsProvider);
    assert.deepEqual(
      await provider.sendVerificationCode({
        phoneE164: "+8613800138000",
        code: "123456",
        expiresInMinutes: 5,
      }),
      { kind: "sent", providerRequestId: "dev" },
    );
  });

  it("maps Tencent success responses to sent", async () => {
    const calls: unknown[] = [];
    const client: TencentSmsClientLike = {
      async SendSms(input) {
        calls.push(input);
        return {
          SendStatusSet: [{ Code: "Ok", SerialNo: "serial-1" }],
          RequestId: "request-1",
        };
      },
    };
    const provider = new TencentSmsProvider({
      client,
      sdkAppId: "1400000000",
      signName: "漫剧AI",
      templateId: "123456",
    });

    const result = await provider.sendVerificationCode({
      phoneE164: "+8613800138000",
      code: "654321",
      expiresInMinutes: 5,
    });

    assert.deepEqual(result, {
      kind: "sent",
      providerRequestId: "serial-1",
    });
    assert.deepEqual(calls, [
      {
        PhoneNumberSet: ["+8613800138000"],
        SmsSdkAppId: "1400000000",
        SignName: "漫剧AI",
        TemplateId: "123456",
        TemplateParamSet: ["654321", "5"],
      },
    ]);
  });

  it("maps Tencent non-Ok responses to failed", async () => {
    const client: TencentSmsClientLike = {
      async SendSms() {
        return {
          SendStatusSet: [{ Code: "FailedOperation.SignatureIncorrectOrUnapproved" }],
          RequestId: "request-2",
        };
      },
    };
    const provider = new TencentSmsProvider({
      client,
      sdkAppId: "1400000000",
      signName: "漫剧AI",
      templateId: "123456",
    });

    assert.deepEqual(
      await provider.sendVerificationCode({
        phoneE164: "+8613800138000",
        code: "654321",
        expiresInMinutes: 5,
      }),
      {
        kind: "failed",
        errorCode: "FailedOperation.SignatureIncorrectOrUnapproved",
        message: "request-2",
      },
    );
  });

  it("creates the Tencent provider from enabled environment config", () => {
    const provider = createSmsProviderFromEnv({
      TENCENT_SMS_ENABLED: "true",
      TENCENT_SMS_SECRET_ID: "secret-id",
      TENCENT_SMS_SECRET_KEY: "secret-key",
      TENCENT_SMS_SDK_APP_ID: "1400000000",
      TENCENT_SMS_SIGN_NAME: "漫剧AI",
      TENCENT_SMS_TEMPLATE_ID: "123456",
      TENCENT_SMS_REGION: "ap-guangzhou",
    });

    assert.ok(provider instanceof TencentSmsProvider);
  });

  it("documents Tencent SMS environment variables with Chinese comments", async () => {
    const example = await readFile(
      new URL("../../../../../../.env.example", import.meta.url),
      "utf8",
    );

    assert.match(example, /腾讯云短信：是否启用真实短信发送/);
    assert.match(example, /TENCENT_SMS_ENABLED=false/);
    assert.match(example, /TENCENT_SMS_SECRET_ID=/);
    assert.match(example, /TENCENT_SMS_SECRET_KEY=/);
    assert.match(example, /TENCENT_SMS_SDK_APP_ID=/);
    assert.match(example, /TENCENT_SMS_SIGN_NAME=/);
    assert.match(example, /TENCENT_SMS_TEMPLATE_ID=/);
    assert.match(example, /TENCENT_SMS_REGION=ap-guangzhou/);
  });
});
