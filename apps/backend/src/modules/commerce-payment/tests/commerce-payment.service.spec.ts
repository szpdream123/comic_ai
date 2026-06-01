import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createAuthSession } from "../../identity/session.service.ts";
import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import {
  createCommercePaymentService,
  signPaymentCallback,
} from "../commerce-payment.service.ts";
import {
  createStaticPaymentProviderRegistry,
  PaymentProviderError,
  type PaymentProviderAdapter,
} from "../payment-provider-adapter.ts";
import { consumePaymentSucceededCreditGrant } from "../../credit-billing/payment-succeeded-credit-consumer.service.ts";

const organizationId = "10000000-0000-4000-8000-000000000001";
const workspaceId = "20000000-0000-4000-8000-000000000001";
const ownerUserId = "30000000-0000-4000-8000-000000000001";
const packageId = "90000000-0000-4000-8000-000000000001";
const callbackSecret = "test-payment-secret";
const merchantId = "comic-ai-test-merchant";

describe("commerce payment service", { concurrency: false }, () => {
  it("requires an explicit callback secret before processing provider callbacks", async () => {
    const db = await createMigratedTestDb();

    try {
      const service = createCommercePaymentService({
        db,
        workspaceId,
        merchantId,
      });
      const callbackBody = {
        provider: "wechat_pay" as const,
        providerEventDedupKey: "wechat-missing-secret",
        merchantOrderNo: "ORD-MISSING-SECRET",
        providerTradeId: "wx-missing-secret",
        eventType: "payment_succeeded" as const,
        amountMinor: 9900,
        currency: "CNY",
        merchantId,
      };

      await assert.rejects(
        service.processPaymentCallback({
          body: {
            ...callbackBody,
            signature: signPaymentCallback(callbackBody, "dev-payment-secret"),
          },
          now: new Date("2026-05-21T07:59:00.000Z"),
        }),
        /payment_callback_secret_required/,
      );
    } finally {
      await db.close();
    }
  });

  it("creates a billing order and emits one credit outbox event after a verified success callback", async () => {
    const db = await createMigratedTestDb();

    try {
      const ownerSession = await seedCommerceFixture(db);
      const service = createCommercePaymentService({
        db,
        workspaceId,
        callbackSecret,
        merchantId,
      });

      const orderResponse = await service.createBillingOrder({
        user: { sessionToken: ownerSession.token },
        body: { creditPackageId: packageId },
        idempotencyKey: "order-key-1",
        now: new Date("2026-05-21T08:00:00.000Z"),
      });
      const orderReplay = await service.createBillingOrder({
        user: { sessionToken: ownerSession.token },
        body: { creditPackageId: packageId },
        idempotencyKey: "order-key-1",
        now: new Date("2026-05-21T08:00:01.000Z"),
      });

      assert.equal(orderResponse.status, 200);
      assert.equal(orderResponse.body.order.status, "pending_payment");
      assert.equal(orderResponse.body.order.credits, 120);
      assert.equal(orderReplay.status, 200);
      assert.equal(orderReplay.body.order.id, orderResponse.body.order.id);

      const intentResponse = await service.createPaymentIntent({
        user: { sessionToken: ownerSession.token },
        body: {
          orderId: orderResponse.body.order.id,
          provider: "wechat_pay",
          productMode: "native_qr",
        },
        idempotencyKey: "intent-key-1",
        now: new Date("2026-05-21T08:01:00.000Z"),
      });

      assert.equal(intentResponse.status, 200);
      assert.equal(intentResponse.body.paymentIntent.status, "submitted");
      assert.equal(intentResponse.body.paymentIntent.amountMinor, 9900);
      assert.equal(intentResponse.body.payAction.kind, "mock_qr");

      const callbackBody = {
        provider: "wechat_pay" as const,
        providerEventDedupKey: "wechat-notify-1",
        merchantOrderNo: intentResponse.body.paymentIntent.merchantOrderNo,
        providerTradeId: "wx-trade-1",
        eventType: "payment_succeeded" as const,
        amountMinor: 9900,
        currency: "CNY",
        merchantId,
      };
      const callbackResponse = await service.processPaymentCallback({
        body: {
          ...callbackBody,
          signature: signPaymentCallback(callbackBody, callbackSecret),
        },
        now: new Date("2026-05-21T08:02:00.000Z"),
      });
      const duplicateCallback = await service.processPaymentCallback({
        body: {
          ...callbackBody,
          signature: signPaymentCallback(callbackBody, callbackSecret),
        },
        now: new Date("2026-05-21T08:03:00.000Z"),
      });

      const ledgerCountBeforeConsumer = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM credit_ledger_entries WHERE source_type = 'payment_order'",
      );
      const outbox = await db.query<{
        id: string;
        organization_id: string | null;
        event_type: string;
        payload_json: Record<string, unknown>;
        status: "pending" | "processing" | "processed" | "failed";
        available_at: Date;
        processed_at: Date | null;
        error_message: string | null;
        created_at: Date;
        updated_at: Date;
      }>("SELECT * FROM outbox_events WHERE event_type = 'payment.succeeded'");
      const providerEvents = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM payment_provider_events",
      );

      assert.equal(callbackResponse.status, 200);
      assert.equal(callbackResponse.body.duplicate, false);
      assert.equal(callbackResponse.body.providerEvent.processingStatus, "processed");
      assert.equal(callbackResponse.body.order?.status, "paid");
      assert.equal((callbackResponse.body as { creditGrant?: unknown }).creditGrant, undefined);
      assert.equal(duplicateCallback.status, 200);
      assert.equal(duplicateCallback.body.duplicate, true);
      assert.equal(ledgerCountBeforeConsumer.rows[0]?.count, 0);
      assert.equal(outbox.rows.length, 1);
      assert.equal(providerEvents.rows[0]?.count, 1);

      const consumed = await consumePaymentSucceededCreditGrant(db, {
        event: {
          id: outbox.rows[0]!.id,
          organizationId: outbox.rows[0]!.organization_id,
          eventType: outbox.rows[0]!.event_type,
          payload: outbox.rows[0]!.payload_json,
          status: outbox.rows[0]!.status,
          availableAt: new Date(outbox.rows[0]!.available_at),
          processedAt: outbox.rows[0]!.processed_at,
          errorMessage: outbox.rows[0]!.error_message,
          createdAt: new Date(outbox.rows[0]!.created_at),
          updatedAt: new Date(outbox.rows[0]!.updated_at),
        },
        now: new Date("2026-05-21T08:02:30.000Z"),
      });
      const replay = await consumePaymentSucceededCreditGrant(db, {
        event: {
          id: outbox.rows[0]!.id,
          organizationId: outbox.rows[0]!.organization_id,
          eventType: outbox.rows[0]!.event_type,
          payload: outbox.rows[0]!.payload_json,
          status: outbox.rows[0]!.status,
          availableAt: new Date(outbox.rows[0]!.available_at),
          processedAt: outbox.rows[0]!.processed_at,
          errorMessage: outbox.rows[0]!.error_message,
          createdAt: new Date(outbox.rows[0]!.created_at),
          updatedAt: new Date(outbox.rows[0]!.updated_at),
        },
        now: new Date("2026-05-21T08:02:31.000Z"),
      });
      const ledgerCountAfterConsumer = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM credit_ledger_entries WHERE source_type = 'payment_order'",
      );
      const organization = await db.query<{ credit_balance_cached: number }>(
        "SELECT credit_balance_cached FROM organizations WHERE id = $1",
        [organizationId],
      );

      assert.equal(consumed.kind, "applied");
      assert.equal(replay.kind, "duplicate");
      assert.equal(ledgerCountAfterConsumer.rows[0]?.count, 1);
      assert.equal(organization.rows[0]?.credit_balance_cached, 120);
    } finally {
      await db.close();
    }
  });

  it("creates a PayLab payment intent through the provider adapter and replays idempotently", async () => {
    const db = await createMigratedTestDb();

    try {
      const ownerSession = await seedCommerceFixture(db);
      const providerCalls: Parameters<PaymentProviderAdapter["createPaymentIntent"]>[0][] = [];
      const paylabAdapter = createFakePaymentProviderAdapter({
        provider: "paylab",
        createPaymentIntent: async (input) => {
          providerCalls.push(input);
          return {
            kind: "submitted",
            providerIntentId: "pi_paylab_accepted",
            providerPaymentId: "pay_paylab_accepted",
            providerPayloadHash: "paylab-create-hash",
            providerSafeMetadata: {
              providerIntentId: "pi_paylab_accepted",
              providerPaymentId: "pay_paylab_accepted",
            },
            payAction: {
              kind: "provider_console",
              provider: "paylab",
              merchantOrderNo: input.merchantOrderNo,
              amountMinor: input.amountMinor,
              currency: input.currency,
              url: "https://paylab.test/payments/pi_paylab_accepted",
            },
          };
        },
      });
      const service = createCommercePaymentService({
        db,
        workspaceId,
        callbackSecret,
        merchantId,
        providerRegistry: createStaticPaymentProviderRegistry({
          paylab: paylabAdapter,
        }),
      });
      const orderResponse = await service.createBillingOrder({
        user: { sessionToken: ownerSession.token },
        body: { creditPackageId: packageId },
        idempotencyKey: "order-key-paylab-adapter",
        now: new Date("2026-05-21T09:00:00.000Z"),
      });

      assert.equal(orderResponse.status, 200);

      const intentResponse = await service.createPaymentIntent({
        user: { sessionToken: ownerSession.token },
        body: {
          orderId: orderResponse.body.order.id,
          provider: "paylab",
          productMode: "paylab_redirect",
        },
        idempotencyKey: "intent-key-paylab-adapter",
        now: new Date("2026-05-21T09:01:00.000Z"),
      });
      const replayResponse = await service.createPaymentIntent({
        user: { sessionToken: ownerSession.token },
        body: {
          orderId: orderResponse.body.order.id,
          provider: "paylab",
          productMode: "paylab_redirect",
        },
        idempotencyKey: "intent-key-paylab-adapter",
        now: new Date("2026-05-21T09:01:30.000Z"),
      });
      const intentRows = await db.query<{
        status: string;
        provider_payload_hash: string;
        provider_safe_metadata_json: Record<string, unknown>;
        submitted_at: Date | null;
      }>("SELECT status, provider_payload_hash, provider_safe_metadata_json, submitted_at FROM payment_intents WHERE id = $1", [
        intentResponse.body.paymentIntent.id,
      ]);

      assert.equal(intentResponse.status, 200);
      assert.equal(intentResponse.body.paymentIntent.provider, "paylab");
      assert.equal(intentResponse.body.paymentIntent.status, "submitted");
      assert.equal(intentResponse.body.payAction.kind, "provider_console");
      assert.equal(replayResponse.status, 200);
      assert.equal(replayResponse.body.paymentIntent.id, intentResponse.body.paymentIntent.id);
      assert.equal(providerCalls.length, 1);
      assert.equal(providerCalls[0]?.provider, "paylab");
      assert.equal(providerCalls[0]?.productMode, "paylab_redirect");
      assert.equal(providerCalls[0]?.providerIdempotencyKey, `payment_intent:${intentResponse.body.paymentIntent.id}`);
      assert.equal(intentRows.rows[0]?.status, "submitted");
      assert.equal(intentRows.rows[0]?.provider_payload_hash, "paylab-create-hash");
      assert.equal(intentRows.rows[0]?.provider_safe_metadata_json.providerIntentId, "pi_paylab_accepted");
      assert.ok(intentRows.rows[0]?.submitted_at);
    } finally {
      await db.close();
    }
  });

  it("marks a PayLab intent unknown when provider creation is ambiguous", async () => {
    const db = await createMigratedTestDb();

    try {
      const ownerSession = await seedCommerceFixture(db);
      const service = createCommercePaymentService({
        db,
        workspaceId,
        callbackSecret,
        merchantId,
        providerRegistry: createStaticPaymentProviderRegistry({
          paylab: createFakePaymentProviderAdapter({
            provider: "paylab",
            createPaymentIntent: async () => ({
              kind: "unknown",
              providerPayloadHash: "paylab-timeout-hash",
              providerSafeMetadata: {
                failureCode: "provider_timeout",
              },
              failureCode: "provider_timeout",
            }),
          }),
        }),
      });
      const orderResponse = await service.createBillingOrder({
        user: { sessionToken: ownerSession.token },
        body: { creditPackageId: packageId },
        idempotencyKey: "order-key-paylab-unknown",
        now: new Date("2026-05-21T09:10:00.000Z"),
      });

      assert.equal(orderResponse.status, 200);

      const intentResponse = await service.createPaymentIntent({
        user: { sessionToken: ownerSession.token },
        body: {
          orderId: orderResponse.body.order.id,
          provider: "paylab",
          productMode: "paylab_redirect",
        },
        idempotencyKey: "intent-key-paylab-unknown",
        now: new Date("2026-05-21T09:11:00.000Z"),
      });
      const intentRows = await db.query<{
        status: string;
        provider_payload_hash: string;
        provider_safe_metadata_json: Record<string, unknown>;
        submitted_at: Date | null;
      }>("SELECT status, provider_payload_hash, provider_safe_metadata_json, submitted_at FROM payment_intents WHERE id = $1", [
        intentResponse.body.paymentIntent.id,
      ]);

      assert.equal(intentResponse.status, 200);
      assert.equal(intentResponse.body.paymentIntent.provider, "paylab");
      assert.equal(intentResponse.body.paymentIntent.status, "unknown");
      assert.equal(intentResponse.body.payAction.kind, "manual_confirm");
      assert.equal(intentRows.rows[0]?.status, "unknown");
      assert.equal(intentRows.rows[0]?.provider_payload_hash, "paylab-timeout-hash");
      assert.equal(intentRows.rows[0]?.provider_safe_metadata_json.failureCode, "provider_timeout");
      assert.equal(intentRows.rows[0]?.submitted_at, null);
    } finally {
      await db.close();
    }
  });

  it("marks a PayLab intent unknown and replayable when provider creation is rejected", async () => {
    const db = await createMigratedTestDb();

    try {
      const ownerSession = await seedCommerceFixture(db);
      let providerCalls = 0;
      const service = createCommercePaymentService({
        db,
        workspaceId,
        callbackSecret,
        merchantId,
        providerRegistry: createStaticPaymentProviderRegistry({
          paylab: createFakePaymentProviderAdapter({
            provider: "paylab",
            createPaymentIntent: async () => {
              providerCalls += 1;
              throw new PaymentProviderError("provider_create_failed");
            },
          }),
        }),
      });
      const orderResponse = await service.createBillingOrder({
        user: { sessionToken: ownerSession.token },
        body: { creditPackageId: packageId },
        idempotencyKey: "order-key-paylab-rejected",
        now: new Date("2026-05-21T09:15:00.000Z"),
      });

      assert.equal(orderResponse.status, 200);

      const intentResponse = await service.createPaymentIntent({
        user: { sessionToken: ownerSession.token },
        body: {
          orderId: orderResponse.body.order.id,
          provider: "paylab",
          productMode: "paylab_redirect",
        },
        idempotencyKey: "intent-key-paylab-rejected",
        now: new Date("2026-05-21T09:16:00.000Z"),
      });
      const replayResponse = await service.createPaymentIntent({
        user: { sessionToken: ownerSession.token },
        body: {
          orderId: orderResponse.body.order.id,
          provider: "paylab",
          productMode: "paylab_redirect",
        },
        idempotencyKey: "intent-key-paylab-rejected",
        now: new Date("2026-05-21T09:16:30.000Z"),
      });

      assert.equal(intentResponse.status, 200);
      assert.equal(intentResponse.body.paymentIntent.status, "unknown");
      assert.equal(intentResponse.body.payAction.failureCode, "provider_create_failed");
      assert.equal(replayResponse.status, 200);
      assert.equal(replayResponse.body.paymentIntent.id, intentResponse.body.paymentIntent.id);
      assert.equal(replayResponse.body.paymentIntent.status, "unknown");
      assert.equal(providerCalls, 1);
    } finally {
      await db.close();
    }
  });

  it("processes a verified PayLab success callback through provider events and outbox", async () => {
    const db = await createMigratedTestDb();

    try {
      const ownerSession = await seedCommerceFixture(db);
      const service = createCommercePaymentService({
        db,
        workspaceId,
        callbackSecret,
        merchantId,
        providerRegistry: createStaticPaymentProviderRegistry({
          paylab: createFakePaymentProviderAdapter({ provider: "paylab" }),
        }),
      });
      const orderResponse = await service.createBillingOrder({
        user: { sessionToken: ownerSession.token },
        body: { creditPackageId: packageId },
        idempotencyKey: "order-key-paylab-callback",
        now: new Date("2026-05-21T09:20:00.000Z"),
      });

      assert.equal(orderResponse.status, 200);

      const intentResponse = await service.createPaymentIntent({
        user: { sessionToken: ownerSession.token },
        body: {
          orderId: orderResponse.body.order.id,
          provider: "paylab",
          productMode: "paylab_redirect",
        },
        idempotencyKey: "intent-key-paylab-callback",
        now: new Date("2026-05-21T09:21:00.000Z"),
      });
      const callbackBody = {
        provider: "paylab" as const,
        providerEventDedupKey: "paylab-notify-success",
        merchantOrderNo: intentResponse.body.paymentIntent.merchantOrderNo,
        providerTradeId: "paylab-trade-success",
        eventType: "payment_succeeded" as const,
        amountMinor: 9900,
        currency: "CNY",
        merchantId,
      };
      const callbackResponse = await service.processPaymentCallback({
        body: {
          ...callbackBody,
          signature: signPaymentCallback(callbackBody, callbackSecret),
        },
        now: new Date("2026-05-21T09:22:00.000Z"),
      });
      const outbox = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM outbox_events WHERE event_type = 'payment.succeeded'",
      );

      assert.equal(intentResponse.status, 200);
      assert.equal(callbackResponse.status, 200);
      assert.equal(callbackResponse.body.providerEvent.provider, "paylab");
      assert.equal(callbackResponse.body.providerEvent.processingStatus, "processed");
      assert.equal(callbackResponse.body.order?.status, "paid");
      assert.equal(outbox.rows[0]?.count, 1);
    } finally {
      await db.close();
    }
  });

  it("normalizes a raw PayLab provider callback through the adapter before processing", async () => {
    const db = await createMigratedTestDb();

    try {
      const ownerSession = await seedCommerceFixture(db);
      const service = createCommercePaymentService({
        db,
        workspaceId,
        callbackSecret,
        merchantId,
        providerRegistry: createStaticPaymentProviderRegistry({
          paylab: createFakePaymentProviderAdapter({
            provider: "paylab",
            normalizeCallback: async () => ({
              provider: "paylab",
              merchantOrderNo: intentResponse.body.paymentIntent.merchantOrderNo,
              providerTradeId: "paylab-raw-trade-success",
              eventType: "payment_succeeded",
              amountMinor: 9900,
              currency: "CNY",
              providerEventDedupKey: "paylab-raw-event-success",
              rawPayloadHash: "raw-paylab-event-hash",
              signatureStatus: "verified",
              safeMetadata: {},
            }),
            verifyCallback: async () => ({
              signatureStatus: "verified",
              signatureAlgorithm: "test-hmac",
              replayWindowStatus: "within_window",
            }),
          }),
        }),
      });
      const orderResponse = await service.createBillingOrder({
        user: { sessionToken: ownerSession.token },
        body: { creditPackageId: packageId },
        idempotencyKey: "order-key-paylab-raw-callback",
        now: new Date("2026-05-21T09:30:00.000Z"),
      });

      assert.equal(orderResponse.status, 200);

      const intentResponse = await service.createPaymentIntent({
        user: { sessionToken: ownerSession.token },
        body: {
          orderId: orderResponse.body.order.id,
          provider: "paylab",
          productMode: "paylab_redirect",
        },
        idempotencyKey: "intent-key-paylab-raw-callback",
        now: new Date("2026-05-21T09:31:00.000Z"),
      });
      const callbackResponse = await service.processProviderCallback({
        provider: "paylab",
        rawBody: JSON.stringify({ id: "evt_paylab_raw_success" }),
        headers: { "stripe-signature": "test" },
        now: new Date("2026-05-21T09:32:00.000Z"),
      });
      const providerEventRows = await db.query<{ raw_payload_hash: string }>(
        "SELECT raw_payload_hash FROM payment_provider_events WHERE provider_event_dedup_key = $1",
        ["paylab-raw-event-success"],
      );

      assert.equal(intentResponse.status, 200);
      assert.equal(callbackResponse.status, 200);
      assert.equal(callbackResponse.body.providerEvent.provider, "paylab");
      assert.equal(callbackResponse.body.providerEvent.processingStatus, "processed");
      assert.equal(callbackResponse.body.order?.status, "paid");
      assert.equal(providerEventRows.rows[0]?.raw_payload_hash, "raw-paylab-event-hash");
    } finally {
      await db.close();
    }
  });

  it("reconciles a provider-paid PayLab intent when the webhook is missing", async () => {
    const db = await createMigratedTestDb();

    try {
      const ownerSession = await seedCommerceFixture(db);
      const providerQueries: Parameters<PaymentProviderAdapter["queryPaymentStatus"]>[0][] = [];
      const service = createCommercePaymentService({
        db,
        workspaceId,
        callbackSecret,
        merchantId,
        providerRegistry: createStaticPaymentProviderRegistry({
          paylab: createFakePaymentProviderAdapter({
            provider: "paylab",
            queryPaymentStatus: async (input) => {
              providerQueries.push(input);
              return {
                status: "succeeded",
                providerPayloadHash: "paylab-query-success-hash",
                providerTradeId: "paylab-query-trade-success",
                amountMinor: 9900,
                currency: "CNY",
                providerSafeMetadata: {
                  providerIntentId: input.providerIntentId,
                  providerStatus: "succeeded",
                },
              };
            },
          }),
        }),
      });
      const orderResponse = await service.createBillingOrder({
        user: { sessionToken: ownerSession.token },
        body: { creditPackageId: packageId },
        idempotencyKey: "order-key-paylab-reconcile-success",
        now: new Date("2026-05-21T09:40:00.000Z"),
      });

      assert.equal(orderResponse.status, 200);

      const intentResponse = await service.createPaymentIntent({
        user: { sessionToken: ownerSession.token },
        body: {
          orderId: orderResponse.body.order.id,
          provider: "paylab",
          productMode: "paylab_redirect",
        },
        idempotencyKey: "intent-key-paylab-reconcile-success",
        now: new Date("2026-05-21T09:41:00.000Z"),
      });

      const reconciliation = await service.reconcilePaymentIntent({
        paymentIntentId: intentResponse.body.paymentIntent.id,
        now: new Date("2026-05-21T09:45:00.000Z"),
      });
      const duplicateReconciliation = await service.reconcilePaymentIntent({
        paymentIntentId: intentResponse.body.paymentIntent.id,
        now: new Date("2026-05-21T09:46:00.000Z"),
      });
      const intentRows = await db.query<{
        status: string;
        provider_trade_id: string | null;
      }>("SELECT status, provider_trade_id FROM payment_intents WHERE id = $1", [
        intentResponse.body.paymentIntent.id,
      ]);
      const orderRows = await db.query<{ status: string }>(
        "SELECT status FROM billing_orders WHERE id = $1",
        [orderResponse.body.order.id],
      );
      const providerEvents = await db.query<{
        event_type: string;
        signature_status: string;
        processing_status: string;
        raw_payload_hash: string;
      }>(
        `
          SELECT event_type, signature_status, processing_status, raw_payload_hash
          FROM payment_provider_events
          WHERE payment_intent_id = $1
        `,
        [intentResponse.body.paymentIntent.id],
      );
      const outbox = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM outbox_events WHERE event_type = 'payment.succeeded'",
      );
      const reconciliationItems = await db.query<{
        issue_type: string;
        status: string;
        resolution_json: Record<string, unknown>;
      }>(
        `
          SELECT issue_type, status, resolution_json
          FROM payment_reconciliation_items
          WHERE payment_intent_id = $1
          ORDER BY created_at ASC
        `,
        [intentResponse.body.paymentIntent.id],
      );

      assert.equal(intentResponse.status, 200);
      assert.equal(reconciliation.status, 200);
      assert.equal(reconciliation.body.reconciliation.status, "resolved");
      assert.equal(reconciliation.body.reconciliation.providerStatus, "succeeded");
      assert.equal(duplicateReconciliation.status, 200);
      assert.equal(providerQueries[0]?.providerIntentId, `fake-paylab-${intentResponse.body.paymentIntent.merchantOrderNo}`);
      assert.equal(intentRows.rows[0]?.status, "succeeded");
      assert.equal(intentRows.rows[0]?.provider_trade_id, "paylab-query-trade-success");
      assert.equal(orderRows.rows[0]?.status, "paid");
      assert.deepEqual(providerEvents.rows, [
        {
          event_type: "payment_succeeded",
          signature_status: "unverified",
          processing_status: "processed",
          raw_payload_hash: "paylab-query-success-hash",
        },
      ]);
      assert.equal(outbox.rows[0]?.count, 1);
      assert.deepEqual(
        reconciliationItems.rows.map((row) => ({
          issue_type: row.issue_type,
          status: row.status,
        })),
        [
          { issue_type: "provider_paid_platform_unpaid", status: "resolved" },
          { issue_type: "provider_paid_platform_unpaid", status: "resolved" },
        ],
      );
    } finally {
      await db.close();
    }
  });

  it("keeps a reconciled PayLab success in manual review when the provider amount mismatches", async () => {
    const db = await createMigratedTestDb();

    try {
      const ownerSession = await seedCommerceFixture(db);
      const service = createCommercePaymentService({
        db,
        workspaceId,
        callbackSecret,
        merchantId,
        providerRegistry: createStaticPaymentProviderRegistry({
          paylab: createFakePaymentProviderAdapter({
            provider: "paylab",
            queryPaymentStatus: async () => ({
              status: "succeeded",
              providerPayloadHash: "paylab-query-amount-mismatch-hash",
              providerTradeId: "paylab-query-trade-mismatch",
              amountMinor: 100,
              currency: "CNY",
              providerSafeMetadata: {
                providerStatus: "succeeded",
              },
            }),
          }),
        }),
      });
      const orderResponse = await service.createBillingOrder({
        user: { sessionToken: ownerSession.token },
        body: { creditPackageId: packageId },
        idempotencyKey: "order-key-paylab-reconcile-mismatch",
        now: new Date("2026-05-21T09:50:00.000Z"),
      });

      assert.equal(orderResponse.status, 200);

      const intentResponse = await service.createPaymentIntent({
        user: { sessionToken: ownerSession.token },
        body: {
          orderId: orderResponse.body.order.id,
          provider: "paylab",
          productMode: "paylab_redirect",
        },
        idempotencyKey: "intent-key-paylab-reconcile-mismatch",
        now: new Date("2026-05-21T09:51:00.000Z"),
      });

      const reconciliation = await service.reconcilePaymentIntent({
        paymentIntentId: intentResponse.body.paymentIntent.id,
        now: new Date("2026-05-21T09:55:00.000Z"),
      });
      const orderRows = await db.query<{ status: string }>(
        "SELECT status FROM billing_orders WHERE id = $1",
        [orderResponse.body.order.id],
      );
      const outbox = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM outbox_events WHERE event_type = 'payment.succeeded'",
      );
      const providerEvents = await db.query<{
        processing_status: string;
        failure_code: string | null;
      }>(
        `
          SELECT processing_status, failure_code
          FROM payment_provider_events
          WHERE payment_intent_id = $1
        `,
        [intentResponse.body.paymentIntent.id],
      );
      const risks = await db.query<{ risk_type: string }>(
        "SELECT risk_type FROM payment_risk_events WHERE payment_intent_id = $1",
        [intentResponse.body.paymentIntent.id],
      );
      const reconciliationItems = await db.query<{
        issue_type: string;
        status: string;
      }>(
        "SELECT issue_type, status FROM payment_reconciliation_items WHERE payment_intent_id = $1",
        [intentResponse.body.paymentIntent.id],
      );

      assert.equal(intentResponse.status, 200);
      assert.equal(reconciliation.status, 200);
      assert.equal(reconciliation.body.reconciliation.status, "manual_review_required");
      assert.equal(reconciliation.body.riskEvent?.riskType, "amount_mismatch");
      assert.equal(orderRows.rows[0]?.status, "pending_payment");
      assert.equal(outbox.rows[0]?.count, 0);
      assert.deepEqual(providerEvents.rows, [
        { processing_status: "manual_review_required", failure_code: "amount_mismatch" },
      ]);
      assert.deepEqual(risks.rows, [{ risk_type: "amount_mismatch" }]);
      assert.deepEqual(reconciliationItems.rows, [
        { issue_type: "amount_mismatch", status: "manual_review_required" },
      ]);
    } finally {
      await db.close();
    }
  });

  it("treats reconciliation as resolved when a matching webhook already paid the PayLab intent", async () => {
    const db = await createMigratedTestDb();

    try {
      const ownerSession = await seedCommerceFixture(db);
      const service = createCommercePaymentService({
        db,
        workspaceId,
        callbackSecret,
        merchantId,
        providerRegistry: createStaticPaymentProviderRegistry({
          paylab: createFakePaymentProviderAdapter({
            provider: "paylab",
            queryPaymentStatus: async () => ({
              status: "succeeded",
              providerPayloadHash: "paylab-query-already-paid-hash",
              providerTradeId: "paylab-webhook-trade-paid",
              amountMinor: 9900,
              currency: "CNY",
              providerSafeMetadata: {
                providerStatus: "succeeded",
              },
            }),
          }),
        }),
      });
      const orderResponse = await service.createBillingOrder({
        user: { sessionToken: ownerSession.token },
        body: { creditPackageId: packageId },
        idempotencyKey: "order-key-paylab-already-paid",
        now: new Date("2026-05-21T09:56:00.000Z"),
      });

      assert.equal(orderResponse.status, 200);

      const intentResponse = await service.createPaymentIntent({
        user: { sessionToken: ownerSession.token },
        body: {
          orderId: orderResponse.body.order.id,
          provider: "paylab",
          productMode: "paylab_redirect",
        },
        idempotencyKey: "intent-key-paylab-already-paid",
        now: new Date("2026-05-21T09:57:00.000Z"),
      });
      const callbackBody = {
        provider: "paylab" as const,
        providerEventDedupKey: "paylab-webhook-already-paid",
        merchantOrderNo: intentResponse.body.paymentIntent.merchantOrderNo,
        providerTradeId: "paylab-webhook-trade-paid",
        eventType: "payment_succeeded" as const,
        amountMinor: 9900,
        currency: "CNY",
        merchantId,
      };
      const callbackResponse = await service.processPaymentCallback({
        body: {
          ...callbackBody,
          signature: signPaymentCallback(callbackBody, callbackSecret),
        },
        now: new Date("2026-05-21T09:58:00.000Z"),
      });

      const reconciliation = await service.reconcilePaymentIntent({
        paymentIntentId: intentResponse.body.paymentIntent.id,
        now: new Date("2026-05-21T10:00:00.000Z"),
      });
      const providerEvents = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM payment_provider_events WHERE payment_intent_id = $1",
        [intentResponse.body.paymentIntent.id],
      );
      const risks = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM payment_risk_events WHERE payment_intent_id = $1",
        [intentResponse.body.paymentIntent.id],
      );
      const outbox = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM outbox_events WHERE event_type = 'payment.succeeded'",
      );
      const reconciliationItems = await db.query<{
        status: string;
        resolution_json: Record<string, unknown>;
      }>(
        "SELECT status, resolution_json FROM payment_reconciliation_items WHERE payment_intent_id = $1",
        [intentResponse.body.paymentIntent.id],
      );

      assert.equal(intentResponse.status, 200);
      assert.equal(callbackResponse.status, 200);
      assert.equal(callbackResponse.body.order?.status, "paid");
      assert.equal(reconciliation.status, 200);
      assert.equal(reconciliation.body.reconciliation.status, "resolved");
      assert.equal(reconciliationItems.rows[0]?.resolution_json.alreadySettled, true);
      assert.equal(providerEvents.rows[0]?.count, 1);
      assert.equal(risks.rows[0]?.count, 0);
      assert.equal(outbox.rows[0]?.count, 1);
    } finally {
      await db.close();
    }
  });

  it("returns duplicate when the provider event dedup lookup races with an existing event", async () => {
    const db = await createMigratedTestDb();

    try {
      const ownerSession = await seedCommerceFixture(db);
      const orderService = createCommercePaymentService({
        db,
        workspaceId,
        callbackSecret,
        merchantId,
      });

      const orderResponse = await orderService.createBillingOrder({
        user: { sessionToken: ownerSession.token },
        body: { creditPackageId: packageId },
        idempotencyKey: "order-key-dedup-race",
        now: new Date("2026-05-21T08:10:00.000Z"),
      });
      const intentResponse = await orderService.createPaymentIntent({
        user: { sessionToken: ownerSession.token },
        body: {
          orderId: orderResponse.body.order.id,
          provider: "wechat_pay",
          productMode: "native_qr",
        },
        idempotencyKey: "intent-key-dedup-race",
        now: new Date("2026-05-21T08:11:00.000Z"),
      });

      const callbackBody = {
        provider: "wechat_pay" as const,
        providerEventDedupKey: "wechat-notify-dedup-race",
        merchantOrderNo: intentResponse.body.paymentIntent.merchantOrderNo,
        providerTradeId: "wx-dedup-race",
        eventType: "payment_succeeded" as const,
        amountMinor: 9900,
        currency: "CNY",
        merchantId,
      };
      await insertProviderEventFixture(db, {
        id: "93000000-0000-4000-8000-000000000901",
        orderId: orderResponse.body.order.id,
        paymentIntentId: intentResponse.body.paymentIntent.id,
        providerEventDedupKey: callbackBody.providerEventDedupKey,
        merchantOrderNo: callbackBody.merchantOrderNo,
        providerTradeId: callbackBody.providerTradeId,
        eventType: callbackBody.eventType,
        processingStatus: "processed",
      });

      const service = createCommercePaymentService({
        db: hideFirstProviderDedupRead(db),
        workspaceId,
        callbackSecret,
        merchantId,
      });
      const response = await service.processPaymentCallback({
        body: {
          ...callbackBody,
          signature: signPaymentCallback(callbackBody, callbackSecret),
        },
        now: new Date("2026-05-21T08:12:00.000Z"),
      });
      const providerEvents = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM payment_provider_events WHERE provider_event_dedup_key = $1",
        [callbackBody.providerEventDedupKey],
      );

      assert.equal(response.status, 200);
      assert.equal(response.body.duplicate, true);
      assert.equal(providerEvents.rows[0]?.count, 1);
    } finally {
      await db.close();
    }
  });

  it("records an enterprise contact request as a real backend intake event", async () => {
    const db = await createMigratedTestDb();

    try {
      const ownerSession = await seedCommerceFixture(db);
      const service = createCommercePaymentService({
        db,
        workspaceId,
        callbackSecret,
        merchantId,
      });

      const response = await service.requestEnterpriseContact({
        user: { sessionToken: ownerSession.token },
        body: { source: "pricing_modal", note: "enterprise_plan_interest" },
        idempotencyKey: "enterprise-contact-key-1",
        now: new Date("2026-05-21T08:20:00.000Z"),
      });
      const audit = await db.query<{
        event_type: string;
        target_type: string;
        reason: string | null;
      }>(
        `
          SELECT event_type, target_type, reason
          FROM audit_events
          WHERE event_type = 'billing.enterprise_contact_requested'
          ORDER BY created_at DESC
          LIMIT 1
        `,
      );

      assert.equal(response.status, 200);
      assert.equal(response.body.request.status, "submitted");
      assert.equal(audit.rows[0]?.event_type, "billing.enterprise_contact_requested");
      assert.equal(audit.rows[0]?.target_type, "enterprise_contact_request");
      assert.equal(audit.rows[0]?.reason, "enterprise_pricing_request");
    } finally {
      await db.close();
    }
  });

  it("rejects malformed provider callback payloads before SQL writes", async () => {
    const db = await createMigratedTestDb();

    try {
      const service = createCommercePaymentService({
        db,
        workspaceId,
        callbackSecret,
        merchantId,
      });

      const response = await service.processPaymentCallback({
        body: {
          provider: "stripe",
          providerEventDedupKey: "bad-callback-provider",
          merchantOrderNo: "ORD-BAD-CALLBACK",
          providerTradeId: "bad-trade",
          eventType: "payment_succeeded",
          amountMinor: 9900,
          currency: "CNY",
          merchantId,
          signature: "invalid",
        } as never,
        now: new Date("2026-05-21T08:20:00.000Z"),
      });
      const providerEvents = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM payment_provider_events",
      );

      assert.equal(response.status, 400);
      assert.deepEqual(response.body, { error: "invalid_payment_callback_input" });
      assert.equal(providerEvents.rows[0]?.count, 0);
    } finally {
      await db.close();
    }
  });

  it("does not let invalid signatures reserve the provider dedup key for later valid callbacks", async () => {
    const db = await createMigratedTestDb();

    try {
      const ownerSession = await seedCommerceFixture(db);
      const service = createCommercePaymentService({
        db,
        workspaceId,
        callbackSecret,
        merchantId,
      });
      const order = await createOrderAndIntent(service, {
        sessionToken: ownerSession.token,
        orderKey: "order-key-invalid-signature-dedup",
        intentKey: "intent-key-invalid-signature-dedup",
        now: new Date("2026-05-21T08:21:00.000Z"),
      });
      const callbackBody = {
        provider: "wechat_pay" as const,
        providerEventDedupKey: "wechat-notify-invalid-signature-dedup",
        merchantOrderNo: order.intent.paymentIntent.merchantOrderNo,
        providerTradeId: "wx-invalid-signature-dedup",
        eventType: "payment_succeeded" as const,
        amountMinor: 9900,
        currency: "CNY",
        merchantId,
      };

      const invalidCallback = await service.processPaymentCallback({
        body: {
          ...callbackBody,
          signature: "invalid-signature",
        },
        now: new Date("2026-05-21T08:22:00.000Z"),
      });
      const validCallback = await service.processPaymentCallback({
        body: {
          ...callbackBody,
          signature: signPaymentCallback(callbackBody, callbackSecret),
        },
        now: new Date("2026-05-21T08:23:00.000Z"),
      });

      const realDedupEvents = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM payment_provider_events WHERE provider_event_dedup_key = $1",
        [callbackBody.providerEventDedupKey],
      );
      const risks = await db.query<{ risk_type: string }>(
        "SELECT risk_type FROM payment_risk_events WHERE order_id = $1",
        [order.order.order.id],
      );
      const outboxCount = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM outbox_events WHERE event_type = 'payment.succeeded'",
      );

      assert.equal(invalidCallback.status, 200);
      assert.equal(
        invalidCallback.body.providerEvent.processingStatus,
        "manual_review_required",
      );
      assert.equal(invalidCallback.body.riskEvent?.riskType, "signature_invalid");
      assert.equal(validCallback.status, 200);
      assert.equal(validCallback.body.duplicate, false);
      assert.equal(validCallback.body.providerEvent.processingStatus, "processed");
      assert.equal(validCallback.body.order?.status, "paid");
      assert.equal(realDedupEvents.rows[0]?.count, 1);
      assert.deepEqual(risks.rows, [{ risk_type: "signature_invalid" }]);
      assert.equal(outboxCount.rows[0]?.count, 1);
    } finally {
      await db.close();
    }
  });

  it("records a duplicate trade risk instead of rolling back when a success callback reuses a provider trade", async () => {
    const db = await createMigratedTestDb();

    try {
      const ownerSession = await seedCommerceFixture(db);
      const service = createCommercePaymentService({
        db,
        workspaceId,
        callbackSecret,
        merchantId,
      });

      const firstOrder = await createOrderAndIntent(service, {
        sessionToken: ownerSession.token,
        orderKey: "order-key-duplicate-trade-first",
        intentKey: "intent-key-duplicate-trade-first",
        now: new Date("2026-05-21T08:30:00.000Z"),
      });
      const firstCallbackBody = {
        provider: "wechat_pay" as const,
        providerEventDedupKey: "wechat-notify-duplicate-trade-first",
        merchantOrderNo: firstOrder.intent.paymentIntent.merchantOrderNo,
        providerTradeId: "wx-shared-trade",
        eventType: "payment_succeeded" as const,
        amountMinor: 9900,
        currency: "CNY",
        merchantId,
      };
      const firstCallback = await service.processPaymentCallback({
        body: {
          ...firstCallbackBody,
          signature: signPaymentCallback(firstCallbackBody, callbackSecret),
        },
        now: new Date("2026-05-21T08:31:00.000Z"),
      });

      const secondOrder = await createOrderAndIntent(service, {
        sessionToken: ownerSession.token,
        orderKey: "order-key-duplicate-trade-second",
        intentKey: "intent-key-duplicate-trade-second",
        now: new Date("2026-05-21T08:32:00.000Z"),
      });
      const secondCallbackBody = {
        provider: "wechat_pay" as const,
        providerEventDedupKey: "wechat-notify-duplicate-trade-second",
        merchantOrderNo: secondOrder.intent.paymentIntent.merchantOrderNo,
        providerTradeId: "wx-shared-trade",
        eventType: "payment_succeeded" as const,
        amountMinor: 9900,
        currency: "CNY",
        merchantId,
      };
      const secondCallback = await service.processPaymentCallback({
        body: {
          ...secondCallbackBody,
          signature: signPaymentCallback(secondCallbackBody, callbackSecret),
        },
        now: new Date("2026-05-21T08:33:00.000Z"),
      });

      const secondOrderRows = await db.query<{ status: string }>(
        "SELECT status FROM billing_orders WHERE id = $1",
        [secondOrder.order.order.id],
      );
      const riskRows = await db.query<{
        risk_type: string;
        status: string;
        decision: string;
      }>(
        "SELECT risk_type, status, decision FROM payment_risk_events WHERE order_id = $1",
        [secondOrder.order.order.id],
      );
      const outboxCount = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM outbox_events WHERE event_type = 'payment.succeeded'",
      );

      assert.equal(firstCallback.status, 200);
      assert.equal(firstCallback.body.providerEvent.processingStatus, "processed");
      assert.equal(secondCallback.status, 200);
      assert.equal(
        secondCallback.body.providerEvent.processingStatus,
        "manual_review_required",
      );
      assert.equal(secondCallback.body.riskEvent?.riskType, "duplicate_trade");
      assert.equal(secondOrderRows.rows[0]?.status, "pending_payment");
      assert.deepEqual(riskRows.rows, [
        {
          risk_type: "duplicate_trade",
          status: "open",
          decision: "manual_review",
        },
      ]);
      assert.equal(outboxCount.rows[0]?.count, 1);
    } finally {
      await db.close();
    }
  });

  it("records a duplicate trade risk when the success intent update hits the provider trade unique constraint", async () => {
    const db = await createMigratedTestDb();

    try {
      const ownerSession = await seedCommerceFixture(db);
      const service = createCommercePaymentService({
        db,
        workspaceId,
        callbackSecret,
        merchantId,
      });

      const firstOrder = await createOrderAndIntent(service, {
        sessionToken: ownerSession.token,
        orderKey: "order-key-unique-trade-first",
        intentKey: "intent-key-unique-trade-first",
        now: new Date("2026-05-21T08:34:00.000Z"),
      });
      const firstCallbackBody = {
        provider: "wechat_pay" as const,
        providerEventDedupKey: "wechat-notify-unique-trade-first",
        merchantOrderNo: firstOrder.intent.paymentIntent.merchantOrderNo,
        providerTradeId: "wx-unique-race-trade",
        eventType: "payment_succeeded" as const,
        amountMinor: 9900,
        currency: "CNY",
        merchantId,
      };
      const firstCallback = await service.processPaymentCallback({
        body: {
          ...firstCallbackBody,
          signature: signPaymentCallback(firstCallbackBody, callbackSecret),
        },
        now: new Date("2026-05-21T08:35:00.000Z"),
      });

      const secondOrder = await createOrderAndIntent(service, {
        sessionToken: ownerSession.token,
        orderKey: "order-key-unique-trade-second",
        intentKey: "intent-key-unique-trade-second",
        now: new Date("2026-05-21T08:36:00.000Z"),
      });
      const racedService = createCommercePaymentService({
        db: hideProviderTradeConflictRead(db),
        workspaceId,
        callbackSecret,
        merchantId,
      });
      const secondCallbackBody = {
        provider: "wechat_pay" as const,
        providerEventDedupKey: "wechat-notify-unique-trade-second",
        merchantOrderNo: secondOrder.intent.paymentIntent.merchantOrderNo,
        providerTradeId: "wx-unique-race-trade",
        eventType: "payment_succeeded" as const,
        amountMinor: 9900,
        currency: "CNY",
        merchantId,
      };
      const secondCallback = await racedService.processPaymentCallback({
        body: {
          ...secondCallbackBody,
          signature: signPaymentCallback(secondCallbackBody, callbackSecret),
        },
        now: new Date("2026-05-21T08:37:00.000Z"),
      });

      const secondOrderRows = await db.query<{ status: string }>(
        "SELECT status FROM billing_orders WHERE id = $1",
        [secondOrder.order.order.id],
      );
      const secondIntentRows = await db.query<{
        status: string;
        provider_trade_id: string | null;
      }>(
        "SELECT status, provider_trade_id FROM payment_intents WHERE id = $1",
        [secondOrder.intent.paymentIntent.id],
      );
      const riskRows = await db.query<{
        risk_type: string;
        decision: string;
      }>(
        "SELECT risk_type, decision FROM payment_risk_events WHERE order_id = $1",
        [secondOrder.order.order.id],
      );
      const outboxCount = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM outbox_events WHERE event_type = 'payment.succeeded'",
      );

      assert.equal(firstCallback.status, 200);
      assert.equal(firstCallback.body.providerEvent.processingStatus, "processed");
      assert.equal(secondCallback.status, 200);
      assert.equal(
        secondCallback.body.providerEvent.processingStatus,
        "manual_review_required",
      );
      assert.equal(secondCallback.body.providerEvent.failureCode, "duplicate_trade");
      assert.equal(secondCallback.body.riskEvent?.riskType, "duplicate_trade");
      assert.equal(secondOrderRows.rows[0]?.status, "pending_payment");
      assert.deepEqual(secondIntentRows.rows[0], {
        status: "submitted",
        provider_trade_id: null,
      });
      assert.deepEqual(riskRows.rows, [
        {
          risk_type: "duplicate_trade",
          decision: "manual_review",
        },
      ]);
      assert.equal(outboxCount.rows[0]?.count, 1);
    } finally {
      await db.close();
    }
  });

  it("records a duplicate trade risk when the success intent update hits the order success unique constraint", async () => {
    const db = await createMigratedTestDb();

    try {
      const ownerSession = await seedCommerceFixture(db);
      const service = createCommercePaymentService({
        db,
        workspaceId,
        callbackSecret,
        merchantId,
      });

      const order = await service.createBillingOrder({
        user: { sessionToken: ownerSession.token },
        body: { creditPackageId: packageId },
        idempotencyKey: "order-key-order-success-race",
        now: new Date("2026-05-21T08:42:00.000Z"),
      });
      assert.equal(order.status, 200);
      const firstIntent = await service.createPaymentIntent({
        user: { sessionToken: ownerSession.token },
        body: {
          orderId: order.body.order.id,
          provider: "wechat_pay",
          productMode: "native_qr",
        },
        idempotencyKey: "intent-key-order-success-race-first",
        now: new Date("2026-05-21T08:43:00.000Z"),
      });
      const secondIntent = await service.createPaymentIntent({
        user: { sessionToken: ownerSession.token },
        body: {
          orderId: order.body.order.id,
          provider: "alipay",
          productMode: "native_qr",
        },
        idempotencyKey: "intent-key-order-success-race-second",
        now: new Date("2026-05-21T08:44:00.000Z"),
      });
      assert.equal(firstIntent.status, 200);
      assert.equal(secondIntent.status, 200);
      await db.query(
        `
          UPDATE payment_intents
          SET status = 'succeeded',
              provider_trade_id = $2,
              succeeded_at = $3,
              updated_at = $3
          WHERE id = $1
        `,
        [
          firstIntent.body.paymentIntent.id,
          "wx-existing-order-success",
          new Date("2026-05-21T08:44:30.000Z"),
        ],
      );

      const racedService = createCommercePaymentService({
        db: hideExistingSuccessRead(db),
        workspaceId,
        callbackSecret,
        merchantId,
      });
      const callbackBody = {
        provider: "alipay" as const,
        providerEventDedupKey: "alipay-notify-order-success-race",
        merchantOrderNo: secondIntent.body.paymentIntent.merchantOrderNo,
        providerTradeId: "wx-order-success-race",
        eventType: "payment_succeeded" as const,
        amountMinor: 9900,
        currency: "CNY",
        merchantId,
      };
      const callback = await racedService.processPaymentCallback({
        body: {
          ...callbackBody,
          signature: signPaymentCallback(callbackBody, callbackSecret),
        },
        now: new Date("2026-05-21T08:45:00.000Z"),
      });

      const secondIntentRows = await db.query<{
        status: string;
        provider_trade_id: string | null;
      }>(
        "SELECT status, provider_trade_id FROM payment_intents WHERE id = $1",
        [secondIntent.body.paymentIntent.id],
      );
      const riskRows = await db.query<{
        risk_type: string;
        conflict: string | null;
      }>(
        "SELECT risk_type, metadata_json->>'conflict' AS conflict FROM payment_risk_events WHERE order_id = $1",
        [order.body.order.id],
      );

      assert.equal(callback.status, 200);
      assert.equal(callback.body.providerEvent.processingStatus, "manual_review_required");
      assert.equal(callback.body.providerEvent.failureCode, "duplicate_trade");
      assert.equal(callback.body.riskEvent?.riskType, "duplicate_trade");
      assert.deepEqual(secondIntentRows.rows[0], {
        status: "submitted",
        provider_trade_id: null,
      });
      assert.deepEqual(riskRows.rows, [
        {
          risk_type: "duplicate_trade",
          conflict: "order_success_unique_violation",
        },
      ]);
    } finally {
      await db.close();
    }
  });

  it("records a duplicate trade risk when a non-success callback reuses a provider trade", async () => {
    const db = await createMigratedTestDb();

    try {
      const ownerSession = await seedCommerceFixture(db);
      const service = createCommercePaymentService({
        db,
        workspaceId,
        callbackSecret,
        merchantId,
      });

      const firstOrder = await createOrderAndIntent(service, {
        sessionToken: ownerSession.token,
        orderKey: "order-key-failed-shared-trade-first",
        intentKey: "intent-key-failed-shared-trade-first",
        now: new Date("2026-05-21T08:38:00.000Z"),
      });
      const firstCallbackBody = {
        provider: "wechat_pay" as const,
        providerEventDedupKey: "wechat-notify-failed-shared-trade-first",
        merchantOrderNo: firstOrder.intent.paymentIntent.merchantOrderNo,
        providerTradeId: "wx-failed-shared-trade",
        eventType: "payment_succeeded" as const,
        amountMinor: 9900,
        currency: "CNY",
        merchantId,
      };
      const firstCallback = await service.processPaymentCallback({
        body: {
          ...firstCallbackBody,
          signature: signPaymentCallback(firstCallbackBody, callbackSecret),
        },
        now: new Date("2026-05-21T08:39:00.000Z"),
      });

      const secondOrder = await createOrderAndIntent(service, {
        sessionToken: ownerSession.token,
        orderKey: "order-key-failed-shared-trade-second",
        intentKey: "intent-key-failed-shared-trade-second",
        now: new Date("2026-05-21T08:40:00.000Z"),
      });
      const racedService = createCommercePaymentService({
        db: hideProviderTradeConflictRead(db),
        workspaceId,
        callbackSecret,
        merchantId,
      });
      const secondCallbackBody = {
        provider: "wechat_pay" as const,
        providerEventDedupKey: "wechat-notify-failed-shared-trade-second",
        merchantOrderNo: secondOrder.intent.paymentIntent.merchantOrderNo,
        providerTradeId: "wx-failed-shared-trade",
        eventType: "payment_failed" as const,
        amountMinor: 9900,
        currency: "CNY",
        merchantId,
      };
      const secondCallback = await racedService.processPaymentCallback({
        body: {
          ...secondCallbackBody,
          signature: signPaymentCallback(secondCallbackBody, callbackSecret),
        },
        now: new Date("2026-05-21T08:41:00.000Z"),
      });

      const secondOrderRows = await db.query<{ status: string }>(
        "SELECT status FROM billing_orders WHERE id = $1",
        [secondOrder.order.order.id],
      );
      const secondIntentRows = await db.query<{
        status: string;
        provider_trade_id: string | null;
      }>(
        "SELECT status, provider_trade_id FROM payment_intents WHERE id = $1",
        [secondOrder.intent.paymentIntent.id],
      );

      assert.equal(firstCallback.status, 200);
      assert.equal(firstCallback.body.providerEvent.processingStatus, "processed");
      assert.equal(secondCallback.status, 200);
      assert.equal(
        secondCallback.body.providerEvent.processingStatus,
        "manual_review_required",
      );
      assert.equal(secondCallback.body.providerEvent.failureCode, "duplicate_trade");
      assert.equal(secondCallback.body.riskEvent?.riskType, "duplicate_trade");
      assert.equal(secondOrderRows.rows[0]?.status, "pending_payment");
      assert.deepEqual(secondIntentRows.rows[0], {
        status: "submitted",
        provider_trade_id: null,
      });
    } finally {
      await db.close();
    }
  });

  it("does not mark paid or grant credits for verified non-success callbacks", async () => {
    const cases: Array<{
      eventType: "payment_failed" | "payment_closed" | "refund_succeeded" | "unknown";
      expectedIntentStatus: string;
      expectedProcessingStatus: string;
      expectedRiskType?: "refund_requires_review" | "callback_event_requires_review";
    }> = [
      {
        eventType: "payment_failed",
        expectedIntentStatus: "failed",
        expectedProcessingStatus: "processed",
      },
      {
        eventType: "payment_closed",
        expectedIntentStatus: "closed",
        expectedProcessingStatus: "processed",
      },
      {
        eventType: "refund_succeeded",
        expectedIntentStatus: "submitted",
        expectedProcessingStatus: "manual_review_required",
        expectedRiskType: "refund_requires_review",
      },
      {
        eventType: "unknown",
        expectedIntentStatus: "submitted",
        expectedProcessingStatus: "manual_review_required",
        expectedRiskType: "callback_event_requires_review",
      },
    ];

    for (const testCase of cases) {
      const db = await createMigratedTestDb();

      try {
        const ownerSession = await seedCommerceFixture(db);
        const service = createCommercePaymentService({
          db,
          workspaceId,
          callbackSecret,
          merchantId,
        });

        const orderResponse = await service.createBillingOrder({
          user: { sessionToken: ownerSession.token },
          body: { creditPackageId: packageId },
          idempotencyKey: `order-key-${testCase.eventType}`,
          now: new Date("2026-05-21T10:00:00.000Z"),
        });
        const intentResponse = await service.createPaymentIntent({
          user: { sessionToken: ownerSession.token },
          body: {
            orderId: orderResponse.body.order.id,
            provider: "wechat_pay",
            productMode: "native_qr",
          },
          idempotencyKey: `intent-key-${testCase.eventType}`,
          now: new Date("2026-05-21T10:01:00.000Z"),
        });

        const callbackBody = {
          provider: "wechat_pay" as const,
          providerEventDedupKey: `wechat-notify-${testCase.eventType}`,
          merchantOrderNo: intentResponse.body.paymentIntent.merchantOrderNo,
          providerTradeId: `wx-trade-${testCase.eventType}`,
          eventType: testCase.eventType,
          amountMinor: 9900,
          currency: "CNY",
          merchantId,
        };
        const callbackResponse = await service.processPaymentCallback({
          body: {
            ...callbackBody,
            signature: signPaymentCallback(callbackBody, callbackSecret),
          },
          now: new Date("2026-05-21T10:02:00.000Z"),
        });

        const orderRows = await db.query<{ status: string; paid_at: Date | null }>(
          "SELECT status, paid_at FROM billing_orders WHERE id = $1",
          [orderResponse.body.order.id],
        );
        const intentRows = await db.query<{ status: string }>(
          "SELECT status FROM payment_intents WHERE id = $1",
          [intentResponse.body.paymentIntent.id],
        );
        const ledgerCount = await db.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM credit_ledger_entries WHERE source_type = 'payment_order'",
        );
        const outboxCount = await db.query<{ count: number }>(
          "SELECT count(*)::int AS count FROM outbox_events WHERE event_type = 'payment.succeeded'",
        );
        const riskRows = await db.query<{
          risk_type: string;
          status: string;
          decision: string;
        }>(
          "SELECT risk_type, status, decision FROM payment_risk_events ORDER BY created_at",
        );

        assert.equal(callbackResponse.status, 200);
        assert.equal(
          callbackResponse.body.providerEvent.eventType,
          testCase.eventType,
        );
        assert.equal(
          callbackResponse.body.providerEvent.processingStatus,
          testCase.expectedProcessingStatus,
        );
        assert.equal(orderRows.rows[0]?.status, "pending_payment");
        assert.equal(orderRows.rows[0]?.paid_at, null);
        assert.equal(intentRows.rows[0]?.status, testCase.expectedIntentStatus);
        assert.equal(ledgerCount.rows[0]?.count, 0);
        assert.equal(outboxCount.rows[0]?.count, 0);
        if (testCase.expectedRiskType) {
          assert.equal(
            callbackResponse.body.riskEvent?.riskType,
            testCase.expectedRiskType,
          );
          assert.deepEqual(riskRows.rows, [
            {
              risk_type: testCase.expectedRiskType,
              status: "open",
              decision: "manual_review",
            },
          ]);
        } else {
          assert.equal(callbackResponse.body.riskEvent, undefined);
          assert.deepEqual(riskRows.rows, []);
        }
      } finally {
        await db.close();
      }
    }
  });

  it("records callback amount mismatch as payment risk without granting credits", async () => {
    const db = await createMigratedTestDb();

    try {
      const ownerSession = await seedCommerceFixture(db);
      const service = createCommercePaymentService({
        db,
        workspaceId,
        callbackSecret,
        merchantId,
      });

      const orderResponse = await service.createBillingOrder({
        user: { sessionToken: ownerSession.token },
        body: { creditPackageId: packageId },
        idempotencyKey: "order-key-risk",
        now: new Date("2026-05-21T09:00:00.000Z"),
      });
      const intentResponse = await service.createPaymentIntent({
        user: { sessionToken: ownerSession.token },
        body: {
          orderId: orderResponse.body.order.id,
          provider: "wechat_pay",
          productMode: "native_qr",
        },
        idempotencyKey: "intent-key-risk",
        now: new Date("2026-05-21T09:01:00.000Z"),
      });
      const callbackBody = {
        provider: "wechat_pay" as const,
        providerEventDedupKey: "wechat-notify-risk",
        merchantOrderNo: intentResponse.body.paymentIntent.merchantOrderNo,
        providerTradeId: "wx-trade-risk",
        eventType: "payment_succeeded" as const,
        amountMinor: 1,
        currency: "CNY",
        merchantId,
      };
      const callbackResponse = await service.processPaymentCallback({
        body: {
          ...callbackBody,
          signature: signPaymentCallback(callbackBody, callbackSecret),
        },
        now: new Date("2026-05-21T09:02:00.000Z"),
      });

      const ledgerCount = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM credit_ledger_entries WHERE source_type = 'payment_order'",
      );
      const riskRows = await db.query<{
        risk_type: string;
        status: string;
        decision: string;
      }>("SELECT risk_type, status, decision FROM payment_risk_events");
      const orderRows = await db.query<{ status: string }>(
        "SELECT status FROM billing_orders WHERE id = $1",
        [orderResponse.body.order.id],
      );

      assert.equal(callbackResponse.status, 200);
      assert.equal(
        callbackResponse.body.providerEvent.processingStatus,
        "manual_review_required",
      );
      assert.equal(callbackResponse.body.riskEvent?.riskType, "amount_mismatch");
      assert.equal(ledgerCount.rows[0]?.count, 0);
      assert.deepEqual(riskRows.rows, [
        {
          risk_type: "amount_mismatch",
          status: "open",
          decision: "manual_review",
        },
      ]);
      assert.equal(orderRows.rows[0]?.status, "pending_payment");
    } finally {
      await db.close();
    }
  });

  it("rolls back the provider event when risk recording fails", async () => {
    const db = await createMigratedTestDb();

    try {
      const ownerSession = await seedCommerceFixture(db);
      const service = createCommercePaymentService({
        db: failRiskEventInsertOnce(db),
        workspaceId,
        callbackSecret,
        merchantId,
      });

      const orderService = createCommercePaymentService({
        db,
        workspaceId,
        callbackSecret,
        merchantId,
      });
      const orderResponse = await orderService.createBillingOrder({
        user: { sessionToken: ownerSession.token },
        body: { creditPackageId: packageId },
        idempotencyKey: "order-key-risk-rollback",
        now: new Date("2026-05-21T09:10:00.000Z"),
      });
      const intentResponse = await orderService.createPaymentIntent({
        user: { sessionToken: ownerSession.token },
        body: {
          orderId: orderResponse.body.order.id,
          provider: "wechat_pay",
          productMode: "native_qr",
        },
        idempotencyKey: "intent-key-risk-rollback",
        now: new Date("2026-05-21T09:11:00.000Z"),
      });
      const callbackBody = {
        provider: "wechat_pay" as const,
        providerEventDedupKey: "wechat-notify-risk-rollback",
        merchantOrderNo: intentResponse.body.paymentIntent.merchantOrderNo,
        providerTradeId: "wx-risk-rollback",
        eventType: "payment_succeeded" as const,
        amountMinor: 1,
        currency: "CNY",
        merchantId,
      };

      await assert.rejects(
        () =>
          service.processPaymentCallback({
            body: {
              ...callbackBody,
              signature: signPaymentCallback(callbackBody, callbackSecret),
            },
            now: new Date("2026-05-21T09:12:00.000Z"),
          }),
        /risk_insert_failed/,
      );

      const providerEvents = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM payment_provider_events WHERE provider_event_dedup_key = $1",
        [callbackBody.providerEventDedupKey],
      );
      const risks = await db.query<{ count: number }>(
        "SELECT count(*)::int AS count FROM payment_risk_events",
      );

      assert.equal(providerEvents.rows[0]?.count, 0);
      assert.equal(risks.rows[0]?.count, 0);
    } finally {
      await db.close();
    }
  });
});

function hideFirstProviderDedupRead(
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
) {
  let hidden = false;
  return {
    async query(sql: string, params?: unknown[]) {
      if (
        !hidden &&
        sql.includes("FROM payment_provider_events") &&
        sql.includes("provider_event_dedup_key")
      ) {
        hidden = true;
        return { rows: [] };
      }

      return db.query(sql, params);
    },
  };
}

function hideProviderTradeConflictRead(
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
) {
  let hidden = false;
  return {
    async query(sql: string, params?: unknown[]) {
      if (
        !hidden &&
        sql.includes("FROM payment_intents") &&
        sql.includes("provider_trade_id = $2") &&
        sql.includes("id <> $3") &&
        !sql.includes("UPDATE")
      ) {
        hidden = true;
        return { rows: [] };
      }

      return db.query(sql, params);
    },
  };
}

function hideExistingSuccessRead(
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
) {
  let hidden = false;
  return {
    async query(sql: string, params?: unknown[]) {
      if (
        !hidden &&
        sql.includes("FROM payment_intents") &&
        sql.includes("status = 'succeeded'") &&
        sql.includes("order_id = $2") &&
        sql.includes("id <> $3")
      ) {
        hidden = true;
        return { rows: [] };
      }

      return db.query(sql, params);
    },
  };
}

function failRiskEventInsertOnce(
  db: { query: (sql: string, params?: unknown[]) => Promise<{ rows: unknown[] }> },
) {
  let failed = false;
  return {
    async query(sql: string, params?: unknown[]) {
      if (!failed && sql.includes("INSERT INTO payment_risk_events")) {
        failed = true;
        throw new Error("risk_insert_failed");
      }

      return db.query(sql, params);
    },
  };
}

async function insertProviderEventFixture(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
  input: {
    id: string;
    orderId: string;
    paymentIntentId: string;
    providerEventDedupKey: string;
    merchantOrderNo: string;
    providerTradeId: string;
    eventType: string;
    processingStatus: string;
  },
) {
  await db.query(
    `
      INSERT INTO payment_provider_events (
        id,
        organization_id,
        order_id,
        payment_intent_id,
        provider,
        provider_event_dedup_key,
        merchant_order_no,
        provider_trade_id,
        event_type,
        signature_status,
        processing_status,
        raw_payload_hash,
        normalized_payload_json,
        ack_status,
        failure_code,
        received_at,
        processed_at,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        'wechat_pay',
        $5,
        $6,
        $7,
        $8,
        'verified',
        $9,
        'fixture-hash',
        '{}'::jsonb,
        'sent_success',
        NULL,
        $10,
        $10,
        $10,
        $10
      )
    `,
    [
      input.id,
      organizationId,
      input.orderId,
      input.paymentIntentId,
      input.providerEventDedupKey,
      input.merchantOrderNo,
      input.providerTradeId,
      input.eventType,
      input.processingStatus,
      new Date("2026-05-21T08:11:30.000Z"),
    ],
  );
}

async function createOrderAndIntent(
  service: ReturnType<typeof createCommercePaymentService>,
  input: {
    sessionToken: string;
    orderKey: string;
    intentKey: string;
    now: Date;
  },
) {
  const order = await service.createBillingOrder({
    user: { sessionToken: input.sessionToken },
    body: { creditPackageId: packageId },
    idempotencyKey: input.orderKey,
    now: input.now,
  });
  assert.equal(order.status, 200);

  const intent = await service.createPaymentIntent({
    user: { sessionToken: input.sessionToken },
    body: {
      orderId: order.body.order.id,
      provider: "wechat_pay",
      productMode: "native_qr",
    },
    idempotencyKey: input.intentKey,
    now: new Date(input.now.getTime() + 60_000),
  });
  assert.equal(intent.status, 200);

  return { order: order.body, intent: intent.body };
}

function createFakePaymentProviderAdapter(
  input: Partial<PaymentProviderAdapter> & Pick<PaymentProviderAdapter, "provider">,
): PaymentProviderAdapter {
  return {
    provider: input.provider,
    createPaymentIntent:
      input.createPaymentIntent ??
      (async (intentInput) => ({
        kind: "submitted",
        providerIntentId: `fake-${intentInput.provider}-${intentInput.merchantOrderNo}`,
        providerPayloadHash: `fake-hash-${intentInput.provider}-${intentInput.merchantOrderNo}`,
        providerSafeMetadata: {
          providerIntentId: `fake-${intentInput.provider}-${intentInput.merchantOrderNo}`,
        },
        payAction: {
          kind: "provider_console",
          provider: intentInput.provider,
          merchantOrderNo: intentInput.merchantOrderNo,
          amountMinor: intentInput.amountMinor,
          currency: intentInput.currency,
          url: `https://paylab.test/payments/${intentInput.merchantOrderNo}`,
        },
      })),
    verifyCallback:
      input.verifyCallback ??
      (async () => ({
        signatureStatus: "unverified",
        signatureAlgorithm: "test",
        replayWindowStatus: "not_checked",
      })),
    normalizeCallback:
      input.normalizeCallback ??
      (async () => {
        throw new Error("fake_adapter_callback_not_implemented");
      }),
    buildAckResponse:
      input.buildAckResponse ??
      (() => ({
        status: 200,
        body: { received: true },
      })),
    queryPaymentStatus:
      input.queryPaymentStatus ??
      (async () => ({
        status: "unknown",
        providerPayloadHash: "fake-query-hash",
        providerSafeMetadata: {},
      })),
  };
}

async function seedCommerceFixture(
  db: { query: (sql: string, params?: unknown[]) => Promise<unknown> },
) {
  await db.query(
    `
      INSERT INTO users (id, phone_e164, status)
      VALUES ($1, '+8613800138001', 'active')
    `,
    [ownerUserId],
  );
  await db.query(
    `
      INSERT INTO organizations (id, name, status)
      VALUES ($1, 'Commerce Org', 'active')
    `,
    [organizationId],
  );
  await db.query(
    `
      INSERT INTO workspaces (id, organization_id, name, status)
      VALUES ($1, $2, 'Commerce Workspace', 'active')
    `,
    [workspaceId, organizationId],
  );
  await db.query(
    `
      INSERT INTO memberships (id, organization_id, workspace_id, user_id, role, status)
      VALUES ($1, $2, $3, $4, 'owner_admin', 'active')
    `,
    [
      "80000000-0000-4000-8000-000000000001",
      organizationId,
      workspaceId,
      ownerUserId,
    ],
  );
  await db.query(
    `
      INSERT INTO credit_packages (
        id,
        code,
        display_name,
        credits,
        amount_minor,
        currency,
        status
      )
      VALUES ($1, 'starter_120', 'Starter 120', 120, 9900, 'CNY', 'active')
    `,
    [packageId],
  );

  const session = await createAuthSession({
    userId: ownerUserId,
    token: "commerce-owner-session",
    now: new Date("2026-05-21T07:00:00.000Z"),
  });
  await db.query(
    `
      INSERT INTO auth_sessions (
        id,
        user_id,
        status,
        session_token_hash,
        session_token_hash_version,
        expires_at,
        last_seen_at,
        revoked_at,
        created_at
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9)
    `,
    [
      session.session.id,
      session.session.userId,
      session.session.status,
      session.session.sessionTokenHash,
      session.session.sessionTokenHashVersion,
      session.session.expiresAt,
      session.session.lastSeenAt,
      session.session.revokedAt,
      new Date("2026-05-21T07:00:00.000Z"),
    ],
  );

  return session;
}
