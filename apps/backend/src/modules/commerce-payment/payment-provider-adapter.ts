import { createHash, createHmac, timingSafeEqual } from "node:crypto";

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
  constructor(
    readonly code: "provider_not_enabled" | "provider_create_failed" | "provider_rejected",
    readonly details: { ambiguous?: boolean } = {},
  ) {
    super(code);
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

export function createDefaultPaymentProviderRegistry(): PaymentProviderRegistry {
  return createStaticPaymentProviderRegistry({
    paylab: createLocalProviderAdapter("paylab"),
    wechat_pay: createLocalProviderAdapter("wechat_pay"),
    alipay: createLocalProviderAdapter("alipay"),
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

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
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
