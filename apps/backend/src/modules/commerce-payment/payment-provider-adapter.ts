import {
  createDecipheriv,
  createHash,
  createHmac,
  createPrivateKey,
  createPublicKey,
  createSign,
  createVerify,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { readFileSync } from "node:fs";
import QRCode from "qrcode";

export type PaymentProvider = "paylab" | "wechat_pay" | "alipay";

export type PaymentEventType =
  | "payment_succeeded"
  | "payment_failed"
  | "payment_closed"
  | "refund_succeeded"
  | "unknown";

export type SignatureStatus = "unverified" | "verified" | "invalid";

export type ProviderPayAction =
  | {
      kind: "mock_qr";
      provider: PaymentProvider;
      merchantOrderNo: string;
      amountMinor: number;
      currency: "CNY";
    }
  | {
      kind: "provider_console";
      provider: PaymentProvider;
      merchantOrderNo: string;
      amountMinor: number;
      currency: "CNY";
      url: string;
    }
  | {
      kind: "manual_confirm";
      provider: PaymentProvider;
      merchantOrderNo: string;
      amountMinor: number;
      currency: "CNY";
      failureCode?: string;
    }
  | {
      kind: "qr_code";
      provider: PaymentProvider;
      merchantOrderNo: string;
      amountMinor: number;
      currency: "CNY";
      url: string;
      codeUrl?: string;
      qrCodeImage?: string;
      expiresAt?: string;
    }
  | {
      kind: "redirect";
      provider: PaymentProvider;
      merchantOrderNo: string;
      amountMinor: number;
      currency: "CNY";
      url: string;
      html?: string;
    };

export interface CreateProviderPaymentIntentInput {
  provider: PaymentProvider;
  productMode: string;
  merchantOrderNo: string;
  providerIdempotencyKey: string;
  amountMinor: number;
  currency: "CNY";
  subject: string;
  notifyUrl?: string;
  returnUrl?: string;
  expiresAt: Date;
  safeMetadata: Record<string, unknown>;
}

export type CreateProviderPaymentIntentResult =
  | {
      kind: "submitted";
      providerIntentId: string;
      providerPaymentId?: string;
      providerTradeId?: string;
      providerPayloadHash: string;
      providerSafeMetadata: Record<string, unknown>;
      payAction: ProviderPayAction;
    }
  | {
      kind: "unknown";
      providerPayloadHash: string;
      providerSafeMetadata: Record<string, unknown>;
      failureCode: string;
      payAction?: ProviderPayAction;
    };

export interface VerifyCallbackResult {
  signatureStatus: SignatureStatus;
  signatureAlgorithm: string;
  signatureTimestamp?: string;
  replayWindowStatus: "within_window" | "outside_window" | "not_applicable" | "not_checked";
  providerAccountRef?: string;
  failureCode?: string;
}

export interface NormalizedPaymentEvent {
  provider: PaymentProvider;
  merchantOrderNo: string;
  providerTradeId: string;
  eventType: PaymentEventType;
  amountMinor: number;
  currency: "CNY";
  providerEventDedupKey: string;
  rawPayloadHash: string;
  signatureStatus: SignatureStatus;
  providerAccountRef?: string;
  eventOccurredAt?: string;
  safeMetadata: Record<string, unknown>;
}

export interface NormalizedPaymentStatus {
  status: "pending" | "succeeded" | "failed" | "closed" | "expired" | "unknown" | "not_found";
  providerTradeId?: string;
  amountMinor?: number;
  currency?: "CNY";
  providerPayloadHash: string;
  providerSafeMetadata: Record<string, unknown>;
}

export interface PaymentProviderAdapter {
  readonly provider: PaymentProvider;

  createPaymentIntent(
    input: CreateProviderPaymentIntentInput,
  ): Promise<CreateProviderPaymentIntentResult>;

  verifyCallback(
    rawBody: Buffer | string,
    headers: Record<string, string>,
  ): Promise<VerifyCallbackResult> | VerifyCallbackResult;

  normalizeCallback(
    rawBody: Buffer | string,
    headers: Record<string, string>,
    verification: VerifyCallbackResult,
  ): Promise<NormalizedPaymentEvent | null> | NormalizedPaymentEvent | null;

  buildAckResponse(
    result: "accepted" | "rejected",
  ): { status: number; body: string | Record<string, unknown> };

  queryPaymentStatus(input: {
    merchantOrderNo: string;
    providerIntentId?: string;
    providerPaymentId?: string;
    providerTradeId?: string;
  }): Promise<NormalizedPaymentStatus>;
}

export interface PaymentProviderRegistry {
  get(provider: PaymentProvider): PaymentProviderAdapter | undefined;
  require(provider: PaymentProvider): PaymentProviderAdapter;
}

export class PaymentProviderError extends Error {
  readonly code: "provider_not_enabled" | "provider_create_failed" | "provider_rejected";
  readonly details: { ambiguous?: boolean };

  constructor(
    code: "provider_not_enabled" | "provider_create_failed" | "provider_rejected",
    details: { ambiguous?: boolean } = {},
  ) {
    super(code);
    this.code = code;
    this.details = details;
  }
}

export function createStaticPaymentProviderRegistry(
  adapters: Partial<Record<PaymentProvider, PaymentProviderAdapter>>,
): PaymentProviderRegistry {
  return {
    get(provider) {
      return adapters[provider];
    },
    require(provider) {
      const adapter = adapters[provider];
      if (!adapter) {
        throw new PaymentProviderError("provider_not_enabled");
      }
      return adapter;
    },
  };
}

function createLazyPaymentProviderRegistry(
  factories: Partial<Record<PaymentProvider, () => PaymentProviderAdapter>>,
): PaymentProviderRegistry {
  const cache: Partial<Record<PaymentProvider, PaymentProviderAdapter>> = {};

  return {
    get(provider) {
      const cached = cache[provider];
      if (cached) {
        return cached;
      }
      const factory = factories[provider];
      if (!factory) {
        return undefined;
      }
      const adapter = factory();
      cache[provider] = adapter;
      return adapter;
    },
    require(provider) {
      const adapter = this.get(provider);
      if (!adapter) {
        throw new PaymentProviderError("provider_not_enabled");
      }
      return adapter;
    },
  };
}

export function createDefaultPaymentProviderRegistry(): PaymentProviderRegistry {
  return createStaticPaymentProviderRegistry({
    wechat_pay: createLocalProviderAdapter("wechat_pay"),
    alipay: createLocalProviderAdapter("alipay"),
  });
}

export function createEnvPaymentProviderRegistry(
  env: Record<string, string | undefined> = process.env,
): PaymentProviderRegistry {
  const useRealProviders = resolvePaymentProviderMode(env) === "real";
  return createLazyPaymentProviderRegistry({
    wechat_pay: () => useRealProviders && envFlag(env.WECHAT_PAY_ENABLED)
      ? createWechatPayAdapter(readWechatPayConfigFromEnv(env))
      : createLocalProviderAdapter("wechat_pay"),
    alipay: () => useRealProviders && envFlag(env.ALIPAY_ENABLED)
      ? createAlipayAdapter(readAlipayConfigFromEnv(env))
      : createLocalProviderAdapter("alipay"),
  });
}

export function createLocalPaymentProviderAdapter(
  provider: PaymentProvider,
): PaymentProviderAdapter {
  return createLocalProviderAdapter(provider);
}

function createLocalProviderAdapter(provider: PaymentProvider): PaymentProviderAdapter {
  return {
    provider,
    async createPaymentIntent(input) {
      const providerIntentId = `${provider}-${input.merchantOrderNo}`;
      return {
        kind: "submitted",
        providerIntentId,
        providerPayloadHash: hashJson({
          provider,
          merchantOrderNo: input.merchantOrderNo,
          providerIntentId,
          amountMinor: input.amountMinor,
          currency: input.currency,
        }),
        providerSafeMetadata: {
          providerIntentId,
          environment: "local",
        },
        payAction: {
          kind: "mock_qr",
          provider,
          merchantOrderNo: input.merchantOrderNo,
          amountMinor: input.amountMinor,
          currency: input.currency,
        },
      };
    },
    verifyCallback() {
      return {
        signatureStatus: "unverified",
        signatureAlgorithm: "local-hmac",
        replayWindowStatus: "not_applicable",
      };
    },
    normalizeCallback() {
      return null;
    },
    buildAckResponse(result) {
      return {
        status: result === "accepted" ? 200 : 400,
        body: { received: result === "accepted" },
      };
    },
    async queryPaymentStatus() {
      return {
        status: "unknown",
        providerPayloadHash: hashJson({ provider, status: "unknown" }),
        providerSafeMetadata: {
          environment: "local",
        },
      };
    },
  };
}

export interface PayLabAdapterConfig {
  baseUrl: string;
  apiKey?: string;
  webhookSigningSecret?: string;
  dashboardBaseUrl?: string;
  requestTimeoutMs?: number;
}

export interface WechatPayAdapterConfig {
  appId: string;
  mchId: string;
  merchantSerialNo: string;
  apiV3Key: string;
  merchantPrivateKey: string;
  platformPublicKeyOrCertificate?: string;
  notifyUrl?: string;
  apiBaseUrl?: string;
  requestTimeoutMs?: number;
}

export interface AlipayAdapterConfig {
  appId: string;
  merchantPrivateKey: string;
  alipayPublicKey: string;
  notifyUrl?: string;
  returnUrl?: string;
  gatewayUrl?: string;
  signType?: "RSA2";
  requestTimeoutMs?: number;
}

export function createPayLabAdapter(config: PayLabAdapterConfig): PaymentProviderAdapter {
  const baseUrl = config.baseUrl.replace(/\/+$/, "");

  return {
    provider: "paylab",
    async createPaymentIntent(input) {
      const response = await fetchJsonWithTimeout(`${baseUrl}/payment_intents`, {
        method: "POST",
        headers: {
          ...paylabAuthHeaders(config),
          "content-type": "application/json",
          "idempotency-key": input.providerIdempotencyKey,
        },
        body: JSON.stringify({
          amount: input.amountMinor,
          currency: input.currency.toLowerCase(),
          metadata: {
            merchantOrderNo: input.merchantOrderNo,
            subject: input.subject,
            ...input.safeMetadata,
          },
        }),
        timeoutMs: config.requestTimeoutMs,
      });

      if (response.kind === "network_unknown") {
        return {
          kind: "unknown",
          providerPayloadHash: hashJson(response),
          providerSafeMetadata: { failureCode: response.failureCode },
          failureCode: response.failureCode,
        };
      }
      if (!response.ok) {
        throw new PaymentProviderError("provider_create_failed");
      }

      const providerIntentId = stringField(response.body, "id");
      if (!providerIntentId) {
        return {
          kind: "unknown",
          providerPayloadHash: hashJson(response.body),
          providerSafeMetadata: { failureCode: "provider_missing_intent_id" },
          failureCode: "provider_missing_intent_id",
        };
      }

      return {
        kind: "submitted",
        providerIntentId,
        providerPayloadHash: hashJson(response.body),
        providerSafeMetadata: {
          providerIntentId,
          providerStatus: stringField(response.body, "status") ?? "unknown",
        },
        payAction: {
          kind: "provider_console",
          provider: "paylab",
          merchantOrderNo: input.merchantOrderNo,
          amountMinor: input.amountMinor,
          currency: input.currency,
          url: `${(config.dashboardBaseUrl ?? baseUrl).replace(/\/+$/, "")}/payment_intents/${encodeURIComponent(providerIntentId)}`,
        },
      };
    },
    verifyCallback(rawBody, headers) {
      const signatureHeader = headers["stripe-signature"] ?? headers["Stripe-Signature"];
      if (!config.webhookSigningSecret?.trim() || !signatureHeader) {
        return {
          signatureStatus: "unverified",
          signatureAlgorithm: "stripe-hmac-sha256",
          replayWindowStatus: "not_checked",
          failureCode: "signature_unconfigured",
        };
      }

      const parsed = parseStripeSignatureHeader(signatureHeader);
      if (!parsed) {
        return {
          signatureStatus: "invalid",
          signatureAlgorithm: "stripe-hmac-sha256",
          replayWindowStatus: "not_checked",
          failureCode: "signature_malformed",
        };
      }

      const body = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody;
      const expected = createHmac("sha256", config.webhookSigningSecret)
        .update(`${parsed.timestamp}.${body}`)
        .digest("hex");
      const signatureStatus = safeEqualHex(expected, parsed.v1)
        ? "verified"
        : "invalid";

      return {
        signatureStatus,
        signatureAlgorithm: "stripe-hmac-sha256",
        signatureTimestamp: new Date(parsed.timestamp * 1000).toISOString(),
        replayWindowStatus: "within_window",
        failureCode: signatureStatus === "verified" ? undefined : "signature_invalid",
      };
    },
    normalizeCallback(rawBody, _headers, verification) {
      const body = Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody;
      const payload = JSON.parse(body) as Record<string, unknown>;
      const data = recordField(payload, "data");
      const object = data ? recordField(data, "object") : undefined;
      const metadata = object ? recordField(object, "metadata") : undefined;
      const eventType = stringField(payload, "type") ?? "unknown";
      const merchantOrderNo = stringField(metadata ?? {}, "merchantOrderNo");
      const amountMinor = numberField(object ?? {}, "amount");
      const currency = stringField(object ?? {}, "currency")?.toUpperCase();
      if (!merchantOrderNo || !amountMinor || currency !== "CNY") {
        return null;
      }

      return {
        provider: "paylab",
        merchantOrderNo,
        providerTradeId:
          stringField(object ?? {}, "latest_charge") ??
          stringField(object ?? {}, "id") ??
          stringField(payload, "id") ??
          hashJson(payload),
        eventType: paylabEventType(eventType),
        amountMinor,
        currency: "CNY",
        providerEventDedupKey: stringField(payload, "id") ?? hashJson(payload),
        rawPayloadHash: createHash("sha256").update(body).digest("hex"),
        signatureStatus: verification.signatureStatus,
        eventOccurredAt: numberField(payload, "created")
          ? new Date(numberField(payload, "created")! * 1000).toISOString()
          : undefined,
        safeMetadata: {
          paylabEventType: eventType,
          providerObjectId: stringField(object ?? {}, "id"),
        },
      };
    },
    buildAckResponse(result) {
      return {
        status: result === "accepted" ? 200 : 400,
        body: { received: result === "accepted" },
      };
    },
    async queryPaymentStatus(input) {
      if (!input.providerIntentId) {
        return {
          status: "unknown",
          providerPayloadHash: hashJson(input),
          providerSafeMetadata: { failureCode: "provider_intent_id_missing" },
        };
      }

      const response = await fetchJsonWithTimeout(
        `${baseUrl}/payment_intents/${encodeURIComponent(input.providerIntentId)}`,
        {
          method: "GET",
          headers: paylabAuthHeaders(config),
          timeoutMs: config.requestTimeoutMs,
        },
      );
      if (response.kind === "network_unknown" || !response.ok) {
        return {
          status: "unknown",
          providerPayloadHash: hashJson(response),
          providerSafeMetadata: {
            failureCode: response.kind === "network_unknown"
              ? response.failureCode
              : "provider_query_failed",
          },
        };
      }

      return {
        status: paylabPaymentStatus(stringField(response.body, "status")),
        providerTradeId:
          stringField(response.body, "latest_charge") ??
          stringField(response.body, "payment_id") ??
          stringField(response.body, "id"),
        amountMinor: numberField(response.body, "amount"),
        currency:
          stringField(response.body, "currency")?.toUpperCase() === "CNY"
            ? "CNY"
            : undefined,
        providerPayloadHash: hashJson(response.body),
        providerSafeMetadata: {
          providerIntentId: stringField(response.body, "id"),
          providerTradeId:
            stringField(response.body, "latest_charge") ??
            stringField(response.body, "payment_id"),
          providerStatus: stringField(response.body, "status"),
        },
      };
    },
  };
}

export function createWechatPayAdapter(config: WechatPayAdapterConfig): PaymentProviderAdapter {
  const baseUrl = (config.apiBaseUrl ?? "https://api.mch.weixin.qq.com").replace(/\/+$/, "");
  const merchantPrivateKey = createPrivateKey(config.merchantPrivateKey);
  const platformVerifier = config.platformPublicKeyOrCertificate?.trim()
    ? createPublicKey(config.platformPublicKeyOrCertificate)
    : undefined;

  return {
    provider: "wechat_pay",
    async createPaymentIntent(input) {
      const body = {
        appid: config.appId,
        mchid: config.mchId,
        description: input.subject.slice(0, 127),
        out_trade_no: input.merchantOrderNo,
        time_expire: formatWechatTime(input.expiresAt),
        notify_url: input.notifyUrl ?? config.notifyUrl,
        amount: {
          total: input.amountMinor,
          currency: input.currency,
        },
      };
      if (!body.notify_url) {
        throw new PaymentProviderError("provider_create_failed", { ambiguous: false });
      }

      const path = "/v3/pay/transactions/native";
      const bodyText = JSON.stringify(body);
      const response = await fetchJsonWithTimeout(`${baseUrl}${path}`, {
        method: "POST",
        headers: {
          authorization: wechatAuthorizationHeader({
            method: "POST",
            path,
            body: bodyText,
            mchId: config.mchId,
            serialNo: config.merchantSerialNo,
            privateKey: merchantPrivateKey,
          }),
          accept: "application/json",
          "content-type": "application/json",
          "wechatpay-serial": config.merchantSerialNo,
        },
        body: bodyText,
        timeoutMs: config.requestTimeoutMs,
      });

      if (response.kind === "network_unknown") {
        return {
          kind: "unknown",
          providerPayloadHash: hashJson(response),
          providerSafeMetadata: { failureCode: response.failureCode },
          failureCode: response.failureCode,
        };
      }
      if (!response.ok) {
        throw new PaymentProviderError("provider_create_failed");
      }

      const codeUrl = stringField(response.body, "code_url");
      if (!codeUrl) {
        return {
          kind: "unknown",
          providerPayloadHash: hashJson(response.body),
          providerSafeMetadata: { failureCode: "wechat_code_url_missing" },
          failureCode: "wechat_code_url_missing",
        };
      }
      return {
        kind: "submitted",
        providerIntentId: input.merchantOrderNo,
        providerPayloadHash: hashJson(response.body),
        providerSafeMetadata: {
          providerIntentId: input.merchantOrderNo,
          codeUrl,
        },
        payAction: {
          kind: "qr_code",
          provider: "wechat_pay",
          merchantOrderNo: input.merchantOrderNo,
          amountMinor: input.amountMinor,
          currency: input.currency,
          url: codeUrl,
          codeUrl,
          qrCodeImage: await createQrCodeImageDataUrl(codeUrl),
          expiresAt: input.expiresAt.toISOString(),
        },
      };
    },
    verifyCallback(rawBody, headers) {
      if (!platformVerifier) {
        return {
          signatureStatus: "unverified",
          signatureAlgorithm: "WECHATPAY2-SHA256-RSA2048",
          replayWindowStatus: "not_checked",
          providerAccountRef: config.mchId,
          failureCode: "wechat_platform_certificate_unconfigured",
        };
      }

      const timestamp = headerValue(headers, "wechatpay-timestamp");
      const nonce = headerValue(headers, "wechatpay-nonce");
      const signature = headerValue(headers, "wechatpay-signature");
      if (!timestamp || !nonce || !signature) {
        return {
          signatureStatus: "invalid",
          signatureAlgorithm: "WECHATPAY2-SHA256-RSA2048",
          replayWindowStatus: "not_checked",
          providerAccountRef: config.mchId,
          failureCode: "wechat_signature_headers_missing",
        };
      }

      const body = rawBodyToString(rawBody);
      const verifier = createVerify("RSA-SHA256");
      verifier.update(`${timestamp}\n${nonce}\n${body}\n`);
      verifier.end();
      const verified = verifier.verify(platformVerifier, signature, "base64");
      return {
        signatureStatus: verified ? "verified" : "invalid",
        signatureAlgorithm: "WECHATPAY2-SHA256-RSA2048",
        signatureTimestamp: new Date(Number(timestamp) * 1000).toISOString(),
        replayWindowStatus: replayWindowStatus(timestamp),
        providerAccountRef: config.mchId,
        failureCode: verified ? undefined : "wechat_signature_invalid",
      };
    },
    normalizeCallback(rawBody, _headers, verification) {
      const body = JSON.parse(rawBodyToString(rawBody)) as Record<string, unknown>;
      const resource = recordField(body, "resource");
      if (!resource) {
        return null;
      }
      const plaintext = decryptWechatResource(resource, config.apiV3Key);
      const transaction = JSON.parse(plaintext) as Record<string, unknown>;
      const merchantOrderNo = stringField(transaction, "out_trade_no");
      const tradeState = stringField(transaction, "trade_state");
      const transactionId = stringField(transaction, "transaction_id") ?? merchantOrderNo;
      const amount = recordField(transaction, "amount");
      const payerTotal = numberField(amount ?? {}, "payer_total") ?? numberField(amount ?? {}, "total");
      const currency = stringField(amount ?? {}, "currency") ?? "CNY";
      if (!merchantOrderNo || !transactionId || !payerTotal || currency !== "CNY") {
        return null;
      }

      return {
        provider: "wechat_pay",
        merchantOrderNo,
        providerTradeId: transactionId,
        eventType: wechatTradeStateEventType(tradeState),
        amountMinor: payerTotal,
        currency: "CNY",
        providerEventDedupKey:
          stringField(body, "id") ??
          `${merchantOrderNo}:${transactionId}:${stringField(body, "event_type") ?? tradeState ?? "unknown"}`,
        rawPayloadHash: createHash("sha256").update(rawBodyToString(rawBody)).digest("hex"),
        signatureStatus: verification.signatureStatus,
        providerAccountRef: config.mchId,
        eventOccurredAt: stringField(body, "create_time") ?? stringField(transaction, "success_time"),
        safeMetadata: {
          wechatEventType: stringField(body, "event_type"),
          tradeState,
          tradeType: stringField(transaction, "trade_type"),
        },
      };
    },
    buildAckResponse(result) {
      return result === "accepted"
        ? { status: 200, body: { code: "SUCCESS", message: "成功" } }
        : { status: 500, body: { code: "FAIL", message: "失败" } };
    },
    async queryPaymentStatus(input) {
      const merchantOrderNo = input.merchantOrderNo;
      const path = `/v3/pay/transactions/out-trade-no/${encodeURIComponent(merchantOrderNo)}?mchid=${encodeURIComponent(config.mchId)}`;
      const response = await fetchJsonWithTimeout(`${baseUrl}${path}`, {
        method: "GET",
        headers: {
          authorization: wechatAuthorizationHeader({
            method: "GET",
            path,
            body: "",
            mchId: config.mchId,
            serialNo: config.merchantSerialNo,
            privateKey: merchantPrivateKey,
          }),
          accept: "application/json",
        },
        timeoutMs: config.requestTimeoutMs,
      });
      if (response.kind === "network_unknown" || !response.ok) {
        return {
          status: response.kind === "response" && response.status === 404 ? "not_found" : "unknown",
          providerPayloadHash: hashJson(response),
          providerSafeMetadata: {
            failureCode: response.kind === "network_unknown" ? response.failureCode : "wechat_query_failed",
          },
        };
      }

      const amount = recordField(response.body, "amount");
      return {
        status: wechatPaymentStatus(stringField(response.body, "trade_state")),
        providerTradeId: stringField(response.body, "transaction_id"),
        amountMinor: numberField(amount ?? {}, "payer_total") ?? numberField(amount ?? {}, "total"),
        currency: stringField(amount ?? {}, "currency") === "CNY" ? "CNY" : undefined,
        providerPayloadHash: hashJson(response.body),
        providerSafeMetadata: {
          providerIntentId: merchantOrderNo,
          providerTradeId: stringField(response.body, "transaction_id"),
          providerStatus: stringField(response.body, "trade_state"),
        },
      };
    },
  };
}

export function createAlipayAdapter(config: AlipayAdapterConfig): PaymentProviderAdapter {
  const gatewayUrl = config.gatewayUrl ?? "https://openapi.alipay.com/gateway.do";
  const merchantPrivateKey = createPrivateKey(config.merchantPrivateKey);
  const alipayPublicKey = createPublicKey(config.alipayPublicKey);

  return {
    provider: "alipay",
    async createPaymentIntent(input) {
      const method = input.productMode === "pc_page" ? "alipay.trade.page.pay" : "alipay.trade.precreate";
      const bizContent = {
        out_trade_no: input.merchantOrderNo,
        total_amount: (input.amountMinor / 100).toFixed(2),
        subject: input.subject.slice(0, 256),
        timeout_express: alipayTimeoutExpress(input.expiresAt),
      };
      const params = alipaySignedParams({
        app_id: config.appId,
        method,
        format: "JSON",
        charset: "utf-8",
        sign_type: config.signType ?? "RSA2",
        timestamp: formatAlipayTimestamp(new Date()),
        version: "1.0",
        notify_url: input.notifyUrl ?? config.notifyUrl,
        return_url: input.returnUrl ?? config.returnUrl,
        biz_content: JSON.stringify(bizContent),
      }, merchantPrivateKey);

      if (method === "alipay.trade.page.pay") {
        const url = `${gatewayUrl}?${new URLSearchParams(params).toString()}`;
        return {
          kind: "submitted",
          providerIntentId: input.merchantOrderNo,
          providerPayloadHash: hashJson({ method, outTradeNo: input.merchantOrderNo, gatewayUrl }),
          providerSafeMetadata: { providerIntentId: input.merchantOrderNo, method, url },
          payAction: {
            kind: "redirect",
            provider: "alipay",
            merchantOrderNo: input.merchantOrderNo,
            amountMinor: input.amountMinor,
            currency: input.currency,
            url,
          },
        };
      }

      const response = await fetchJsonWithTimeout(gatewayUrl, {
        method: "POST",
        headers: {
          "content-type": "application/x-www-form-urlencoded;charset=utf-8",
        },
        body: new URLSearchParams(params).toString(),
        timeoutMs: config.requestTimeoutMs,
      });
      if (response.kind === "network_unknown") {
        return {
          kind: "unknown",
          providerPayloadHash: hashJson(response),
          providerSafeMetadata: { failureCode: response.failureCode },
          failureCode: response.failureCode,
        };
      }
      const payload = recordField(response.body, "alipay_trade_precreate_response") ?? response.body;
      const code = stringField(payload, "code");
      if (!response.ok || code !== "10000") {
        throw new PaymentProviderError("provider_create_failed");
      }
      const qrCode = stringField(payload, "qr_code");
      if (!qrCode) {
        return {
          kind: "unknown",
          providerPayloadHash: hashJson(response.body),
          providerSafeMetadata: { failureCode: "alipay_qr_code_missing" },
          failureCode: "alipay_qr_code_missing",
        };
      }
      return {
        kind: "submitted",
        providerIntentId: stringField(payload, "out_trade_no") ?? input.merchantOrderNo,
        providerPayloadHash: hashJson(response.body),
        providerSafeMetadata: {
          providerIntentId: input.merchantOrderNo,
          method,
          qrCode,
        },
        payAction: {
          kind: "qr_code",
          provider: "alipay",
          merchantOrderNo: input.merchantOrderNo,
          amountMinor: input.amountMinor,
          currency: input.currency,
          url: qrCode,
          codeUrl: qrCode,
          qrCodeImage: await createQrCodeImageDataUrl(qrCode),
          expiresAt: input.expiresAt.toISOString(),
        },
      };
    },
    verifyCallback(rawBody) {
      const params = parseFormBody(rawBodyToString(rawBody));
      const signature = params.sign;
      if (!signature) {
        return {
          signatureStatus: "invalid",
          signatureAlgorithm: "RSA2",
          replayWindowStatus: "not_checked",
          providerAccountRef: config.appId,
          failureCode: "alipay_signature_missing",
        };
      }
      const content = alipayCanonicalString(params, { excludeSignFields: true });
      const verifier = createVerify("RSA-SHA256");
      verifier.update(content, "utf8");
      verifier.end();
      const verified = verifier.verify(alipayPublicKey, signature, "base64");
      return {
        signatureStatus: verified ? "verified" : "invalid",
        signatureAlgorithm: "RSA2",
        signatureTimestamp: params.notify_time,
        replayWindowStatus: "not_applicable",
        providerAccountRef: params.seller_id ?? config.appId,
        failureCode: verified ? undefined : "alipay_signature_invalid",
      };
    },
    normalizeCallback(rawBody, _headers, verification) {
      const params = parseFormBody(rawBodyToString(rawBody));
      const merchantOrderNo = params.out_trade_no;
      const tradeNo = params.trade_no ?? merchantOrderNo;
      const totalAmount = params.total_amount;
      if (!merchantOrderNo || !tradeNo || !totalAmount) {
        return null;
      }
      const amountMinor = Math.round(Number(totalAmount) * 100);
      if (!Number.isFinite(amountMinor)) {
        return null;
      }

      return {
        provider: "alipay",
        merchantOrderNo,
        providerTradeId: tradeNo,
        eventType: alipayTradeStatusEventType(params.trade_status),
        amountMinor,
        currency: "CNY",
        providerEventDedupKey: params.notify_id ?? `${merchantOrderNo}:${tradeNo}:${params.trade_status ?? "unknown"}`,
        rawPayloadHash: createHash("sha256").update(rawBodyToString(rawBody)).digest("hex"),
        signatureStatus: verification.signatureStatus,
        providerAccountRef: params.seller_id ?? config.appId,
        eventOccurredAt: params.gmt_payment ?? params.notify_time,
        safeMetadata: {
          tradeStatus: params.trade_status,
          buyerId: params.buyer_id,
          appId: params.app_id,
        },
      };
    },
    buildAckResponse(result) {
      return { status: result === "accepted" ? 200 : 400, body: result === "accepted" ? "success" : "fail" };
    },
    async queryPaymentStatus(input) {
      const bizContent = {
        out_trade_no: input.merchantOrderNo,
        ...(input.providerTradeId ? { trade_no: input.providerTradeId } : {}),
      };
      const params = alipaySignedParams({
        app_id: config.appId,
        method: "alipay.trade.query",
        format: "JSON",
        charset: "utf-8",
        sign_type: config.signType ?? "RSA2",
        timestamp: formatAlipayTimestamp(new Date()),
        version: "1.0",
        biz_content: JSON.stringify(bizContent),
      }, merchantPrivateKey);
      const response = await fetchJsonWithTimeout(gatewayUrl, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded;charset=utf-8" },
        body: new URLSearchParams(params).toString(),
        timeoutMs: config.requestTimeoutMs,
      });
      if (response.kind === "network_unknown" || !response.ok) {
        return {
          status: "unknown",
          providerPayloadHash: hashJson(response),
          providerSafeMetadata: {
            failureCode: response.kind === "network_unknown" ? response.failureCode : "alipay_query_failed",
          },
        };
      }
      const payload = recordField(response.body, "alipay_trade_query_response") ?? response.body;
      return {
        status: alipayPaymentStatus(stringField(payload, "trade_status")),
        providerTradeId: stringField(payload, "trade_no"),
        amountMinor: amountStringToMinor(stringField(payload, "total_amount")),
        currency: "CNY",
        providerPayloadHash: hashJson(response.body),
        providerSafeMetadata: {
          providerIntentId: input.merchantOrderNo,
          providerTradeId: stringField(payload, "trade_no"),
          providerStatus: stringField(payload, "trade_status"),
        },
      };
    },
  };
}

async function createQrCodeImageDataUrl(value: string) {
  try {
    return await QRCode.toDataURL(value, {
      errorCorrectionLevel: "M",
      margin: 4,
      color: {
        dark: "#14171d",
        light: "#ffffff",
      },
    });
  } catch {
    return undefined;
  }
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function envFlag(value: string | undefined) {
  return value?.trim().toLowerCase() === "true";
}

function resolvePaymentProviderMode(env: Record<string, string | undefined>) {
  const explicitMode = env.PAYMENT_PROVIDER_MODE?.trim().toLowerCase();
  if (explicitMode === "local" || explicitMode === "real") {
    return explicitMode;
  }
  return env.NODE_ENV?.trim().toLowerCase() === "production" ? "real" : "local";
}

function rawBodyToString(rawBody: Buffer | string) {
  return Buffer.isBuffer(rawBody) ? rawBody.toString("utf8") : rawBody;
}

function headerValue(headers: Record<string, string>, key: string) {
  return headers[key] ?? headers[key.toLowerCase()] ?? headers[key.toUpperCase()];
}

function readWechatPayConfigFromEnv(env: Record<string, string | undefined>): WechatPayAdapterConfig {
  const merchantPrivateKeyPath = env.WECHAT_PAY_MERCHANT_PRIVATE_KEY_PATH?.trim();
  const platformPublicKeyOrCertificate =
    env.WECHAT_PAY_PLATFORM_CERT_PATH?.trim() &&
    fileExists(env.WECHAT_PAY_PLATFORM_CERT_PATH.trim())
      ? readFileSync(env.WECHAT_PAY_PLATFORM_CERT_PATH.trim(), "utf8")
      : undefined;
  if (!merchantPrivateKeyPath) {
    throw new Error("wechat_pay_merchant_private_key_path_required");
  }
  return {
    appId: requiredEnv(env.WECHAT_PAY_APP_ID, "WECHAT_PAY_APP_ID"),
    mchId: requiredEnv(env.WECHAT_PAY_MCH_ID, "WECHAT_PAY_MCH_ID"),
    merchantSerialNo: requiredEnv(env.WECHAT_PAY_MERCHANT_SERIAL_NO, "WECHAT_PAY_MERCHANT_SERIAL_NO"),
    apiV3Key: requiredEnv(env.WECHAT_PAY_API_V3_KEY, "WECHAT_PAY_API_V3_KEY"),
    merchantPrivateKey: readFileSync(merchantPrivateKeyPath, "utf8"),
    platformPublicKeyOrCertificate,
    notifyUrl: env.WECHAT_PAY_NOTIFY_URL?.trim() || undefined,
    apiBaseUrl: env.WECHAT_PAY_API_BASE_URL?.trim() || undefined,
  };
}

function readAlipayConfigFromEnv(env: Record<string, string | undefined>): AlipayAdapterConfig {
  const merchantPrivateKeyPath = requiredEnv(env.ALIPAY_MERCHANT_PRIVATE_KEY_PATH, "ALIPAY_MERCHANT_PRIVATE_KEY_PATH");
  const publicKeyPath = requiredEnv(env.ALIPAY_PUBLIC_KEY_PATH, "ALIPAY_PUBLIC_KEY_PATH");
  return {
    appId: requiredEnv(env.ALIPAY_APP_ID, "ALIPAY_APP_ID"),
    merchantPrivateKey: readFileSync(merchantPrivateKeyPath, "utf8"),
    alipayPublicKey: readFileSync(publicKeyPath, "utf8"),
    notifyUrl: env.ALIPAY_NOTIFY_URL?.trim() || undefined,
    returnUrl: env.ALIPAY_RETURN_URL?.trim() || undefined,
    gatewayUrl: env.ALIPAY_GATEWAY_URL?.trim() || undefined,
    signType: "RSA2",
  };
}

function requiredEnv(value: string | undefined, name: string) {
  const normalized = value?.trim();
  if (!normalized) {
    throw new Error(`${name.toLowerCase()}_required`);
  }
  return normalized;
}

function fileExists(path: string) {
  try {
    return Boolean(readFileSync(path, "utf8"));
  } catch {
    return false;
  }
}

function wechatAuthorizationHeader(input: {
  method: "GET" | "POST";
  path: string;
  body: string;
  mchId: string;
  serialNo: string;
  privateKey: ReturnType<typeof createPrivateKey>;
}) {
  const timestamp = Math.floor(Date.now() / 1000).toString();
  const nonce = randomUUID().replace(/-/g, "");
  const message = `${input.method}\n${input.path}\n${timestamp}\n${nonce}\n${input.body}\n`;
  const sign = createSign("RSA-SHA256");
  sign.update(message);
  sign.end();
  const signature = sign.sign(input.privateKey, "base64");
  return `WECHATPAY2-SHA256-RSA2048 mchid="${input.mchId}",nonce_str="${nonce}",timestamp="${timestamp}",serial_no="${input.serialNo}",signature="${signature}"`;
}

function decryptWechatResource(resource: Record<string, unknown>, apiV3Key: string) {
  const ciphertext = stringField(resource, "ciphertext");
  const nonce = stringField(resource, "nonce");
  const associatedData = stringField(resource, "associated_data") ?? "";
  if (!ciphertext || !nonce) {
    throw new Error("wechat_resource_ciphertext_missing");
  }
  const encrypted = Buffer.from(ciphertext, "base64");
  const key = Buffer.from(apiV3Key, "utf8");
  const authTag = encrypted.subarray(encrypted.length - 16);
  const content = encrypted.subarray(0, encrypted.length - 16);
  const decipher = createDecipheriv("aes-256-gcm", key, Buffer.from(nonce, "utf8"));
  decipher.setAuthTag(authTag);
  decipher.setAAD(Buffer.from(associatedData, "utf8"));
  return Buffer.concat([decipher.update(content), decipher.final()]).toString("utf8");
}

function replayWindowStatus(timestamp: string) {
  const ageSeconds = Math.abs(Date.now() / 1000 - Number(timestamp));
  return Number.isFinite(ageSeconds) && ageSeconds <= 300 ? "within_window" : "outside_window";
}

function wechatTradeStateEventType(value: string | undefined): PaymentEventType {
  if (value === "SUCCESS") return "payment_succeeded";
  if (value === "NOTPAY" || value === "USERPAYING") return "payment_failed";
  if (value === "CLOSED" || value === "REVOKED") return "payment_closed";
  if (value === "REFUND") return "refund_succeeded";
  return "unknown";
}

function wechatPaymentStatus(value: string | undefined): NormalizedPaymentStatus["status"] {
  if (value === "SUCCESS") return "succeeded";
  if (value === "NOTPAY" || value === "USERPAYING") return "pending";
  if (value === "CLOSED" || value === "REVOKED") return "closed";
  if (value === "REFUND") return "failed";
  return "unknown";
}

function formatWechatTime(value: Date) {
  return value.toISOString().replace(/\.\d{3}Z$/, "Z");
}

function alipayTimeoutExpress(expiresAt: Date) {
  const minutes = Math.max(1, Math.ceil((expiresAt.getTime() - Date.now()) / 60000));
  return `${Math.min(minutes, 24 * 60)}m`;
}

function formatAlipayTimestamp(value: Date) {
  const pad = (n: number) => String(n).padStart(2, "0");
  return [
    value.getUTCFullYear(),
    "-",
    pad(value.getUTCMonth() + 1),
    "-",
    pad(value.getUTCDate()),
    " ",
    pad(value.getUTCHours()),
    ":",
    pad(value.getUTCMinutes()),
    ":",
    pad(value.getUTCSeconds()),
  ].join("");
}

function alipaySignedParams(
  params: Record<string, string>,
  privateKey: ReturnType<typeof createPrivateKey>,
) {
  const sign = createSign("RSA-SHA256");
  sign.update(alipayCanonicalString(params), "utf8");
  sign.end();
  return {
    ...params,
    sign: sign.sign(privateKey, "base64"),
  };
}

function alipayCanonicalString(params: Record<string, string>, options: { excludeSignFields?: boolean } = {}) {
  return Object.keys(params)
    .filter((key) => params[key] !== "" && (!options.excludeSignFields || (key !== "sign" && key !== "sign_type")))
    .sort()
    .map((key) => `${key}=${params[key]}`)
    .join("&");
}

function parseFormBody(body: string) {
  const entries = new URLSearchParams(body);
  return Object.fromEntries(entries.entries());
}

function alipayTradeStatusEventType(value: string | undefined): PaymentEventType {
  if (value === "TRADE_SUCCESS" || value === "TRADE_FINISHED") return "payment_succeeded";
  if (value === "TRADE_CLOSED") return "payment_closed";
  if (value === "WAIT_BUYER_PAY") return "payment_failed";
  return "unknown";
}

function alipayPaymentStatus(value: string | undefined): NormalizedPaymentStatus["status"] {
  if (value === "TRADE_SUCCESS" || value === "TRADE_FINISHED") return "succeeded";
  if (value === "WAIT_BUYER_PAY") return "pending";
  if (value === "TRADE_CLOSED") return "closed";
  return "unknown";
}

function amountStringToMinor(value: string | undefined) {
  const amount = Number(value);
  return Number.isFinite(amount) ? Math.round(amount * 100) : undefined;
}

function parseMaybeJsonBody(body: string): Record<string, unknown> {
  try {
    const parsed = JSON.parse(body);
    return typeof parsed === "object" && parsed !== null
      ? (parsed as Record<string, unknown>)
      : {};
  } catch {
    return Object.fromEntries(new URLSearchParams(body).entries());
  }
}

function stringFieldAny(value: Record<string, unknown>, keys: string[]): string | undefined {
  for (const key of keys) {
    const result = stringField(value, key);
    if (result) {
      return result;
    }
  }
  return undefined;
}

function amountMinorFieldAny(value: Record<string, unknown>, keys: string[]): number | undefined {
  for (const key of keys) {
    const numberResult = numberField(value, key);
    if (Number.isFinite(numberResult)) {
      return numberResult;
    }
    const stringResult = stringField(value, key);
    if (!stringResult) {
      continue;
    }
    const numeric = Number(stringResult);
    if (!Number.isFinite(numeric)) {
      continue;
    }
    return stringResult.includes(".") ? Math.round(numeric * 100) : Math.round(numeric);
  }
  return undefined;
}

export function isPaymentProvider(value: unknown): value is PaymentProvider {
  return value === "paylab" || value === "wechat_pay" || value === "alipay";
}

function paylabAuthHeaders(config: PayLabAdapterConfig) {
  return config.apiKey?.trim()
    ? { authorization: `Bearer ${config.apiKey.trim()}` }
    : {};
}

async function fetchJsonWithTimeout(
  url: string,
  input: RequestInit & { timeoutMs?: number },
): Promise<
  | { kind: "response"; ok: boolean; status: number; body: Record<string, unknown> }
  | { kind: "network_unknown"; failureCode: string }
> {
  const controller = new AbortController();
  const timeout = setTimeout(
    () => controller.abort(),
    input.timeoutMs ?? 10_000,
  );
  try {
    const response = await fetch(url, { ...input, signal: controller.signal });
    const body = (await response.json().catch(() => ({}))) as Record<string, unknown>;
    return { kind: "response", ok: response.ok, status: response.status, body };
  } catch (error) {
    return {
      kind: "network_unknown",
      failureCode: error instanceof Error && error.name === "AbortError"
        ? "provider_timeout"
        : "provider_network_error",
    };
  } finally {
    clearTimeout(timeout);
  }
}

function parseStripeSignatureHeader(value: string) {
  const parts = Object.fromEntries(
    value.split(",").flatMap((part) => {
      const [key, raw] = part.split("=");
      return key && raw ? [[key, raw]] : [];
    }),
  );
  const timestamp = Number(parts.t);
  const v1 = parts.v1;
  if (!Number.isFinite(timestamp) || !v1) {
    return null;
  }
  return { timestamp, v1 };
}

function safeEqualHex(left: string, right: string): boolean {
  const leftBuffer = Buffer.from(left, "hex");
  const rightBuffer = Buffer.from(right, "hex");
  return (
    leftBuffer.length === rightBuffer.length &&
    timingSafeEqual(leftBuffer, rightBuffer)
  );
}

function paylabEventType(eventType: string): PaymentEventType {
  if (eventType === "payment_intent.succeeded" || eventType === "charge.succeeded") {
    return "payment_succeeded";
  }
  if (eventType === "payment_intent.payment_failed" || eventType === "charge.failed") {
    return "payment_failed";
  }
  if (eventType === "payment_intent.canceled") {
    return "payment_closed";
  }
  return "unknown";
}

function paylabPaymentStatus(status: string | undefined): NormalizedPaymentStatus["status"] {
  if (status === "requires_payment_method" || status === "processing") {
    return "pending";
  }
  if (status === "succeeded") {
    return "succeeded";
  }
  if (status === "canceled") {
    return "closed";
  }
  return "unknown";
}

function recordField(
  value: Record<string, unknown>,
  key: string,
): Record<string, unknown> | undefined {
  const field = value[key];
  return typeof field === "object" && field !== null
    ? (field as Record<string, unknown>)
    : undefined;
}

function stringField(value: Record<string, unknown>, key: string): string | undefined {
  const field = value[key];
  return typeof field === "string" && field.trim() ? field : undefined;
}

function numberField(value: Record<string, unknown>, key: string): number | undefined {
  const field = value[key];
  return typeof field === "number" && Number.isFinite(field) ? field : undefined;
}
