import assert from "node:assert/strict";
import { createPublicKey } from "node:crypto";
import { mkdtempSync, rmSync, writeFileSync } from "node:fs";
import { afterEach, describe, it } from "node:test";
import { tmpdir } from "node:os";
import path from "node:path";

import {
  createAlipayAdapter,
  createEnvPaymentProviderRegistry,
  createWechatPayAdapter,
} from "../payment-provider-adapter.ts";

const testPrivateKey = `-----BEGIN PRIVATE KEY-----
MIIEvQIBADANBgkqhkiG9w0BAQEFAASCBKcwggSjAgEAAoIBAQDspHUlzujSAyHV
yMZuVYU0V6iTZAWk0aHhMDzFN6UwnsWYeN99ZBBRAPbq0aNCW6hVtW2Zb+yqhpHp
3KxKKpdVKe13ImsUPt7h+z1u7l6ayRJTeAq6wz6u/+ZRwDTMGdaiW8MVPz6tIEHf
ZM/oSpL7YOEjMRVCs/fKAZxGFsbOnCNRLZ7UYdxmw9tD8+1vBa1LkEFj3CksOQTy
721sAZp3hsQAzo4WyUuwUkyP5K3OdSt/HNg3P9p3uvLaxdDLuPKAgbGmAhDQFo6y
wfm5TFWL4z+zWq2nB23XtZb3wMTn1p9g30+N22uIYBoDAmJXz9+6BZnPczDDJXiN
k+QeA55PAgMBAAECggEAAq8oc6MX1DM4uqUjiNK1UcDftY2prbzPH7lbpod8qkww
YPd17AFiJLeMJa8lIKaWtoFHePcSR62QSsQAt1NVm5KmhoLLNhXGw0f1bdiNkocn
sDR8GIFFtOTl6s3xdA/0L1yWesL9hE+yg81dMTfH2GZ2P55sdURcaYEZQmXb4XXk
NvVOAgj8H9JEzB1ZpI/dQsCjGFCR3v0ZGtYb+25Q+zSefFujMfqlDG8fh21zHzmk
BCF/71CxHDzb5vy6IOZBVctUhQivZf1BmRvEmZgHE4/uBwQ4p29TnkcIiWBH5hAN
LcttvmEDlyT5CPe5x1yxib3hLVUK9XbCh1+VRpO2FQKBgQD27NINM1m3WhTu+sNb
Eob4kSKRILoxMfvefj44oq+kEsl73oQW8irFg3K6g3AJPrsJxNkf2bCBK5ZPltO8
Gf2wWL2FP2r4jJRO6v7MKI7k2E2VkzBZpjRk/oEKd8YvKdf8yicS01sUHkBs+09v
IXmujtmsxR6qXhkdmUY1q1V87QKBgQD2bWq06Q8f90WeJda0ngVUukTRR2kLnMO1
lvn3NEcCQunfgQGy6ck3Wgx6+zVBABd1QqYbmkPkZbMXnQMjJ+cdU5trUqLnwpAI
UymUbuHmWpPGDIIq/qWXBg5p8yabgPXvm3wmm7C4fCz71QMUPbaIdL1A2/8HFbwD
v/YDTmyuyQKBgF5orvRROO38FX6dYtpvRkFX8TYa4nn9+M3hQLgDHJgEs/xSvxFj
of1X+3BSrEyzsvkcTylSOIE4NHup5aGsOxQnCEpCaWZ5MZ5Wwh+l0ygRWy5YuQnK
NoxzyV4O0lFrB0wuh4bcqJqZj9rF0aZFgEyPX8aWIw3HrQVLHh8s9y7dAoGBAMSl
ZDo7S1kOQSh7m0x6JcMcY4kjEyCiLDYOYopxB1WUnfQWEkRb3IwhXKPL1q4TV9mm
2rXi5POFJjQ4/pc4PZkJYNl6a5pA/dULuEvSz/X5l+AopNdKAmB0ae7se7JavRdw
y0fBC8gc+uBdF8iiXyCsTo2bl1wQEmYNwrtoDhoRAoGALx6DiExlpAbV5D5u4jBZ
IuqbOIbQqXBmIkuKdtZqq1vmr/6QGYevRd7Vcrs8N9gm1WJGCBNaNlZJwUXRMUXa
YyVTS/DjOMzClIyfka+mDgeHNGSTymWDDKRsEw7wUG+L0eKwE0sH+Dv0f8PtFYBQ
+CNZ+lETiZrA4kHVkfhwqlA=
-----END PRIVATE KEY-----`;

describe("payment provider adapters", () => {
  const originalFetch = globalThis.fetch;

  afterEach(() => {
    globalThis.fetch = originalFetch;
  });

  it("keeps WeChat and Alipay local unless env explicitly enables them", async () => {
    const registry = createEnvPaymentProviderRegistry({
      WECHAT_PAY_ENABLED: "false",
      ALIPAY_ENABLED: "false",
    });

    const wechat = await registry.require("wechat_pay").createPaymentIntent({
      provider: "wechat_pay",
      productMode: "native_qr",
      merchantOrderNo: "ORD-LOCAL",
      providerIdempotencyKey: "idem",
      amountMinor: 100,
      currency: "CNY",
      subject: "test",
      expiresAt: new Date("2026-06-16T00:15:00.000Z"),
      safeMetadata: {},
    });

    assert.equal(wechat.kind, "submitted");
    assert.equal(wechat.payAction.kind, "mock_qr");

    const alipay = await registry.require("alipay").createPaymentIntent({
      provider: "alipay",
      productMode: "native_qr",
      merchantOrderNo: "ORD-ALIPAY-LOCAL",
      providerIdempotencyKey: "idem-alipay",
      amountMinor: 100,
      currency: "CNY",
      subject: "test",
      expiresAt: new Date("2026-06-16T00:15:00.000Z"),
      safeMetadata: {},
    });

    assert.equal(alipay.kind, "submitted");
    assert.equal(alipay.payAction.kind, "mock_qr");

  });

  it("keeps payment providers local in development even when env enables them", async () => {
    const registry = createEnvPaymentProviderRegistry({
      NODE_ENV: "development",
      WECHAT_PAY_ENABLED: "true",
      ALIPAY_ENABLED: "true",
    });

    const wechat = await registry.require("wechat_pay").createPaymentIntent({
      provider: "wechat_pay",
      productMode: "native_qr",
      merchantOrderNo: "ORD-DEV",
      providerIdempotencyKey: "idem-dev",
      amountMinor: 100,
      currency: "CNY",
      subject: "test",
      expiresAt: new Date("2026-06-16T00:15:00.000Z"),
      safeMetadata: {},
    });

    assert.equal(wechat.kind, "submitted");
    assert.equal(wechat.payAction.kind, "mock_qr");
  });

  it("allows explicit real mode to use configured WeChat provider adapters", async () => {
    const tempDir = mkdtempSync(path.join(tmpdir(), "payment-provider-adapter-"));
    try {
      const merchantPrivateKeyPath = path.join(tempDir, "wechat-merchant-private-key.pem");
      const platformPublicKeyPath = path.join(tempDir, "wechat-platform-public-key.pem");
      writeFileSync(merchantPrivateKeyPath, testPrivateKey, "utf8");
      writeFileSync(
        platformPublicKeyPath,
        createPublicKey(testPrivateKey).export({ type: "spki", format: "pem" }).toString(),
        "utf8",
      );

      globalThis.fetch = async () =>
        new Response(JSON.stringify({
          code_url: "weixin://wxpay/bizpayurl?pr=test-real-code",
        }), {
          status: 200,
          headers: { "content-type": "application/json" },
        });

      const registry = createEnvPaymentProviderRegistry({
        NODE_ENV: "development",
        PAYMENT_PROVIDER_MODE: "real",
        WECHAT_PAY_ENABLED: "true",
        WECHAT_PAY_APP_ID: "wx-test",
        WECHAT_PAY_MCH_ID: "mch-test",
        WECHAT_PAY_MERCHANT_SERIAL_NO: "serial-test",
        WECHAT_PAY_API_V3_KEY: "12345678901234567890123456789012",
        WECHAT_PAY_MERCHANT_PRIVATE_KEY_PATH: merchantPrivateKeyPath,
        WECHAT_PAY_PLATFORM_CERT_PATH: platformPublicKeyPath,
        WECHAT_PAY_NOTIFY_URL: "https://example.test/api/pay/wechat/notify",
        WECHAT_PAY_API_BASE_URL: "https://wechat.example.test",
      });

      const wechat = await registry.require("wechat_pay").createPaymentIntent({
        provider: "wechat_pay",
        productMode: "native_qr",
        merchantOrderNo: "ORD-REAL",
        providerIdempotencyKey: "idem-real",
        amountMinor: 100,
        currency: "CNY",
        subject: "test",
        expiresAt: new Date("2026-06-16T00:15:00.000Z"),
        safeMetadata: {},
      });

      assert.equal(wechat.kind, "submitted");
      assert.equal(wechat.payAction.kind, "qr_code");
      assert.equal(wechat.payAction.codeUrl, "weixin://wxpay/bizpayurl?pr=test-real-code");
    } finally {
      rmSync(tempDir, { recursive: true, force: true });
    }
  });

  it("uses provider-specific callback acknowledgements", () => {
    const testPublicKey = createPublicKey(testPrivateKey).export({
      type: "spki",
      format: "pem",
    }).toString();
    const wechat = createWechatPayAdapter({
      appId: "wx-test",
      mchId: "mch-test",
      merchantSerialNo: "serial-test",
      apiV3Key: "12345678901234567890123456789012",
      merchantPrivateKey: testPrivateKey,
      platformPublicKeyOrCertificate: testPublicKey,
      notifyUrl: "https://example.test/api/pay/wechat/notify",
    });
    const alipay = createAlipayAdapter({
      appId: "ali-test",
      merchantPrivateKey: testPrivateKey,
      alipayPublicKey: testPublicKey,
      notifyUrl: "https://example.test/api/payment-provider-callbacks/alipay",
    });

    assert.deepEqual(wechat.buildAckResponse("accepted"), {
      status: 200,
      body: { code: "SUCCESS", message: "成功" },
    });
    assert.deepEqual(alipay.buildAckResponse("accepted"), {
      status: 200,
      body: "success",
    });
  });

  it("returns WeChat Native code_url with server-side qr image rendering", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({
        code_url: "weixin://wxpay/bizpayurl?pr=test-native-code",
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const testPublicKey = createPublicKey(testPrivateKey).export({
      type: "spki",
      format: "pem",
    }).toString();
    const wechat = createWechatPayAdapter({
      appId: "wx-test",
      mchId: "mch-test",
      merchantSerialNo: "serial-test",
      apiV3Key: "12345678901234567890123456789012",
      merchantPrivateKey: testPrivateKey,
      platformPublicKeyOrCertificate: testPublicKey,
      notifyUrl: "https://example.test/api/pay/wechat/notify",
      apiBaseUrl: "https://wechat.example.test",
    });

    const result = await wechat.createPaymentIntent({
      provider: "wechat_pay",
      productMode: "native_qr",
      merchantOrderNo: "ORD-WECHAT-QR",
      providerIdempotencyKey: "idem-wechat-qr",
      amountMinor: 1,
      currency: "CNY",
      subject: "test",
      expiresAt: new Date("2026-06-16T00:15:00.000Z"),
      safeMetadata: {},
    });

    assert.equal(result.kind, "submitted");
    assert.equal(result.payAction.kind, "qr_code");
    assert.equal(result.payAction.codeUrl, "weixin://wxpay/bizpayurl?pr=test-native-code");
    assert.match(result.payAction.qrCodeImage ?? "", /^data:image\/png;base64,/);
  });

  it("returns Alipay precreate qr_code with server-side qr image rendering", async () => {
    globalThis.fetch = async () =>
      new Response(JSON.stringify({
        alipay_trade_precreate_response: {
          code: "10000",
          msg: "Success",
          out_trade_no: "ORD-ALIPAY-QR",
          qr_code: "https://qr.alipay.com/test-alipay-code",
        },
      }), {
        status: 200,
        headers: { "content-type": "application/json" },
      });
    const testPublicKey = createPublicKey(testPrivateKey).export({
      type: "spki",
      format: "pem",
    }).toString();
    const alipay = createAlipayAdapter({
      appId: "ali-test",
      merchantPrivateKey: testPrivateKey,
      alipayPublicKey: testPublicKey,
      notifyUrl: "https://example.test/api/payment-provider-callbacks/alipay",
      gatewayUrl: "https://alipay.example.test/gateway.do",
    });

    const result = await alipay.createPaymentIntent({
      provider: "alipay",
      productMode: "native_qr",
      merchantOrderNo: "ORD-ALIPAY-QR",
      providerIdempotencyKey: "idem-alipay-qr",
      amountMinor: 1,
      currency: "CNY",
      subject: "test",
      expiresAt: new Date("2026-06-16T00:15:00.000Z"),
      safeMetadata: {},
    });

    assert.equal(result.kind, "submitted");
    assert.equal(result.payAction.kind, "qr_code");
    assert.equal(result.payAction.codeUrl, "https://qr.alipay.com/test-alipay-code");
    assert.match(result.payAction.qrCodeImage ?? "", /^data:image\/png;base64,/);
  });

});
