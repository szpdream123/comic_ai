import { createRequire } from "node:module";

export interface SmsProvider {
  providerName: "tencent" | "dev";
  sendVerificationCode(input: {
    phoneE164: string;
    code: string;
    expiresInMinutes: number;
  }): Promise<
    | { kind: "sent"; providerRequestId?: string }
    | { kind: "failed"; errorCode: string; message?: string }
  >;
}

export class DevSmsProvider implements SmsProvider {
  providerName = "dev" as const;

  async sendVerificationCode() {
    return { kind: "sent" as const, providerRequestId: "dev" };
  }
}

export interface TencentSmsClientLike {
  SendSms(input: {
    PhoneNumberSet: string[];
    SmsSdkAppId: string;
    SignName: string;
    TemplateId: string;
    TemplateParamSet: string[];
  }): Promise<{
    SendStatusSet?: Array<{ Code?: string; Message?: string; SerialNo?: string }>;
    RequestId?: string;
  }>;
}

export class TencentSmsProvider implements SmsProvider {
  providerName = "tencent" as const;

  constructor(
    private readonly options: {
      client: TencentSmsClientLike;
      sdkAppId: string;
      signName: string;
      templateId: string;
    },
  ) {}

  async sendVerificationCode(input: {
    phoneE164: string;
    code: string;
    expiresInMinutes: number;
  }) {
    try {
      const response = await this.options.client.SendSms({
        PhoneNumberSet: [input.phoneE164],
        SmsSdkAppId: this.options.sdkAppId,
        SignName: this.options.signName,
        TemplateId: this.options.templateId,
        TemplateParamSet: [input.code, String(input.expiresInMinutes)],
      });
      const status = response.SendStatusSet?.[0];
      if (status?.Code === "Ok") {
        return {
          kind: "sent" as const,
          providerRequestId: status.SerialNo ?? response.RequestId,
        };
      }
      return {
        kind: "failed" as const,
        errorCode: status?.Code ?? "tencent_sms_unknown",
        message: status?.Message ?? response.RequestId,
      };
    } catch (error) {
      return {
        kind: "failed" as const,
        errorCode: "tencent_sms_exception",
        message: error instanceof Error ? error.message : String(error),
      };
    }
  }
}

export function createSmsProviderFromEnv(
  env: Record<string, string | undefined> = process.env,
): SmsProvider {
  if (env.TENCENT_SMS_ENABLED !== "true") {
    return new DevSmsProvider();
  }

  const required = [
    "TENCENT_SMS_SECRET_ID",
    "TENCENT_SMS_SECRET_KEY",
    "TENCENT_SMS_SDK_APP_ID",
    "TENCENT_SMS_SIGN_NAME",
    "TENCENT_SMS_TEMPLATE_ID",
  ] as const;
  for (const key of required) {
    if (!env[key]) {
      throw new Error(`missing_env:${key}`);
    }
  }

  const sms = requireTencentSmsSdk();
  const Client = sms.sms?.v20210111?.Client ?? sms.v20210111?.Client;
  if (!Client) {
    throw new Error("tencent_sms_sdk_client_missing");
  }
  const client = new Client({
    credential: {
      secretId: env.TENCENT_SMS_SECRET_ID,
      secretKey: env.TENCENT_SMS_SECRET_KEY,
    },
    region: env.TENCENT_SMS_REGION ?? "ap-guangzhou",
    profile: {
      httpProfile: {
        endpoint: "sms.tencentcloudapi.com",
      },
    },
  }) as TencentSmsClientLike;

  return new TencentSmsProvider({
    client,
    sdkAppId: env.TENCENT_SMS_SDK_APP_ID!,
    signName: env.TENCENT_SMS_SIGN_NAME!,
    templateId: env.TENCENT_SMS_TEMPLATE_ID!,
  });
}

function requireTencentSmsSdk() {
  const require = createRequire(import.meta.url);
  return require("tencentcloud-sdk-nodejs-sms");
}
