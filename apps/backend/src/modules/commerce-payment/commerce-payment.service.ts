import { createHash, createHmac, randomUUID } from "node:crypto";

import {
  createBillingOrderCommand,
  createPaymentIntentCommand,
} from "../../../../../packages/contracts/api/billing.commands.ts";
import { eventTypes } from "../../../../../packages/contracts/domain/event-types.ts";
import type {
  OrderStatus,
  PaymentIntentStatus,
  PaymentProviderEventStatus,
  RiskEventDecision,
  RiskEventSeverity,
} from "../../../../../packages/contracts/domain/states.ts";
import { appendAuditEvent } from "../audit/audit.service.ts";
import {
  resolveActorContext,
  type ActorContext,
} from "../organization/actor-context.service.ts";
import { runIdempotentCommand } from "../shared/command/platform-command-runtime.ts";
import type { SqlDatabase } from "../shared/db/sql.ts";
import { queryOne } from "../shared/db/sql.ts";
import {
  beginOrReplayCommand,
  IdempotencyConflictError,
  IdempotencyProcessingError,
  type IdempotencyRecord,
} from "../shared/idempotency/idempotency.service.ts";
import { SqlIdempotencyRecordStore } from "../shared/idempotency/persistent-idempotency.store.ts";
import {
  createDefaultPaymentProviderRegistry,
  isPaymentProvider,
  PaymentProviderError,
  type CreateProviderPaymentIntentResult,
  type NormalizedPaymentStatus,
  type PaymentEventType,
  type PaymentProvider,
  type PaymentProviderAdapter,
  type PaymentProviderRegistry,
  type ProviderPayAction,
  type SignatureStatus,
} from "./payment-provider-adapter.ts";

interface AuthenticatedCommerceUser {
  sessionToken: string;
}

interface CreditPackageRow {
  id: string;
  code: string;
  display_name: string;
  credits: number;
  amount_minor: number;
  currency: string;
  status: string;
}

interface BillingOrderRow {
  id: string;
  organization_id: string;
  created_by_user_id: string;
  order_no: string;
  credit_package_id: string;
  package_snapshot_json: Record<string, unknown> | string;
  credits: number;
  amount_minor: number;
  currency: string;
  status: OrderStatus;
  idempotency_record_id: string | null;
  idempotency_key: string | null;
  expires_at: Date | string;
  paid_at: Date | string | null;
  successful_payment_intent_id: string | null;
  credit_grant_ledger_entry_id: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface PaymentIntentRow {
  id: string;
  organization_id: string;
  order_id: string;
  provider: PaymentProvider;
  product_mode: string;
  status: PaymentIntentStatus;
  amount_minor: number;
  currency: string;
  merchant_order_no: string;
  provider_trade_id: string | null;
  provider_payload_hash: string;
  provider_safe_metadata_json: Record<string, unknown> | string;
  submitted_at: Date | string | null;
  succeeded_at: Date | string | null;
  expires_at: Date | string;
  idempotency_record_id: string | null;
  idempotency_key: string | null;
  created_at: Date | string;
  updated_at: Date | string;
}

interface ProviderEventRow {
  id: string;
  organization_id: string | null;
  order_id: string | null;
  payment_intent_id: string | null;
  provider: PaymentProvider;
  provider_event_dedup_key: string;
  merchant_order_no: string | null;
  provider_trade_id: string | null;
  event_type: PaymentEventType;
  signature_status: SignatureStatus;
  processing_status: PaymentProviderEventStatus;
  raw_payload_hash: string;
  normalized_payload_json: Record<string, unknown> | string | null;
  ack_status: string | null;
  failure_code: string | null;
  received_at: Date | string;
  processed_at: Date | string | null;
}

interface PaymentRiskEventRow {
  id: string;
  organization_id: string | null;
  user_id: string | null;
  order_id: string | null;
  payment_intent_id: string | null;
  provider_event_id: string | null;
  risk_type: string;
  severity: RiskEventSeverity;
  decision: RiskEventDecision;
  status: string;
  metadata_json: Record<string, unknown> | string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface PaymentReconciliationItemRow {
  id: string;
  organization_id: string | null;
  run_id: string | null;
  order_id: string | null;
  payment_intent_id: string | null;
  provider_trade_id: string | null;
  issue_type:
    | "missing_callback"
    | "paid_without_credit"
    | "amount_mismatch"
    | "provider_paid_platform_unpaid"
    | "platform_paid_provider_unpaid"
    | "refund_mismatch"
    | "invoice_refund_mismatch";
  status: "open" | "resolved" | "manual_review_required" | "ignored_with_reason";
  resolution_json: Record<string, unknown> | string;
  created_at: Date | string;
  updated_at: Date | string;
}

interface CallbackOrderJoinRow extends BillingOrderRow {
  payment_intent_id: string;
  payment_intent_status: PaymentIntentStatus;
  provider: PaymentProvider;
}

type PaymentCallbackRisk = {
  riskType: "duplicate_trade";
  severity: RiskEventSeverity;
  conflict:
    | "order_not_payable"
    | "provider_trade_reused"
    | "order_already_succeeded"
    | "order_success_unique_violation"
    | "provider_trade_unique_violation";
};

type PaymentIntentUpdateResult<T> =
  | { kind: "updated"; value: T }
  | { kind: "provider_trade_conflict"; risk: PaymentCallbackRisk };

export interface PaymentCallbackSignatureInput {
  provider: PaymentProvider;
  providerEventDedupKey: string;
  merchantOrderNo: string;
  providerTradeId: string;
  eventType: PaymentEventType;
  amountMinor: number;
  currency: string;
  merchantId: string;
}

type PaymentCallbackBody = PaymentCallbackSignatureInput & { signature: string };

interface CommercePaymentServiceDeps {
  db: SqlDatabase;
  workspaceId: string;
  callbackSecret?: string;
  merchantId?: string;
  providerRegistry?: PaymentProviderRegistry;
  providerCallbackBaseUrl?: string;
  paymentReturnUrl?: string;
}

export function createCommercePaymentService(deps: CommercePaymentServiceDeps) {
  const merchantId = deps.merchantId ?? "comic-ai-dev-merchant";
  const providerRegistry =
    deps.providerRegistry ?? createDefaultPaymentProviderRegistry();

  return {
    async listCreditPackages(): Promise<{
      status: 200;
      body: { packages: ReturnType<typeof packageViewFromRow>[] };
    }> {
      const packages = await deps.db.query<CreditPackageRow>(
        `
          SELECT *
          FROM credit_packages
          WHERE status = 'active'
            AND (valid_from IS NULL OR valid_from <= now())
            AND (valid_until IS NULL OR valid_until > now())
          ORDER BY amount_minor ASC, code ASC
        `,
      );

      return {
        status: 200,
        body: {
          packages: packages.rows.map(packageViewFromRow),
        },
      };
    },

    async createBillingOrder(input: {
      user: AuthenticatedCommerceUser;
      body: { creditPackageId: string };
      idempotencyKey: string;
      now: Date;
    }) {
      if (!input.body.creditPackageId || !input.idempotencyKey.trim()) {
        return { status: 400, body: { error: "invalid_billing_input" } };
      }

      try {
        const executed = await runIdempotentCommand({
          db: deps.db,
          operationName: createBillingOrderCommand.operationName,
          capability: createBillingOrderCommand.capability,
          idempotencyKey: input.idempotencyKey,
          requestHash: hashJson({ creditPackageId: input.body.creditPackageId }),
          now: input.now,
          resolveActor: (db) =>
            resolveActorContext(db, {
              sessionToken: input.user.sessionToken,
              workspaceId: deps.workspaceId,
              capability: createBillingOrderCommand.capability,
              now: input.now,
            }),
          replay: async ({ idempotencyRecord }) => {
            const order = await findOrderById(deps.db, idempotencyRecord.responseResourceId);
            if (!order) {
              throw new Error("billing_order_replay_missing_resource");
            }
            return { order: orderViewFromRow(order) };
          },
          execute: async ({ actor, idempotencyRecord }) => {
            const creditPackage = await findActivePackage(deps.db, {
              creditPackageId: input.body.creditPackageId,
            });
            if (!creditPackage) {
              throw new CommercePaymentError("credit_package_not_found");
            }

            const orderId = randomUUID();
            const packageSnapshot = {
              code: creditPackage.code,
              displayName: creditPackage.display_name,
              credits: creditPackage.credits,
              amountMinor: creditPackage.amount_minor,
              currency: creditPackage.currency,
            };
            const order = await queryOne<BillingOrderRow>(
              deps.db,
              `
                INSERT INTO billing_orders (
                  id,
                  organization_id,
                  created_by_user_id,
                  order_no,
                  credit_package_id,
                  package_snapshot_json,
                  credits,
                  amount_minor,
                  currency,
                  status,
                  idempotency_record_id,
                  idempotency_key,
                  expires_at,
                  created_at,
                  updated_at
                )
                VALUES (
                  $1,
                  $2,
                  $3,
                  $4,
                  $5,
                  $6::jsonb,
                  $7,
                  $8,
                  $9,
                  'pending_payment',
                  $10,
                  $11,
                  $12,
                  $13,
                  $13
                )
                RETURNING *
              `,
              [
                orderId,
                actor.organizationId,
                actor.actorId,
                createOrderNo(input.now),
                creditPackage.id,
                JSON.stringify(packageSnapshot),
                creditPackage.credits,
                creditPackage.amount_minor,
                creditPackage.currency,
                idempotencyRecord.id,
                input.idempotencyKey,
                new Date(input.now.getTime() + 30 * 60 * 1000),
                input.now,
              ],
            );
            const result = { order: orderViewFromRow(order!) };

            return {
              result,
              responseResourceType: "billing_order",
              responseResourceId: order!.id,
              responseSnapshot: result,
              audit: {
                eventType: createBillingOrderCommand.auditEvent,
                targetType: "billing_order",
                targetId: order!.id,
                workspaceId: actor.workspaceId,
                metadata: {
                  creditPackageId: creditPackage.id,
                  amountMinor: creditPackage.amount_minor,
                  currency: creditPackage.currency,
                },
              },
            };
          },
        });

        return { status: 200, body: executed.result };
      } catch (error) {
        return mapCommerceError(error);
      }
    },

    async createPaymentIntent(input: {
      user: AuthenticatedCommerceUser;
      body: { orderId: string; provider: PaymentProvider; productMode: string };
      idempotencyKey: string;
      now: Date;
    }) {
      if (
        !input.body.orderId ||
        !isPaymentProvider(input.body.provider) ||
        !input.body.productMode.trim() ||
        !input.idempotencyKey.trim()
      ) {
        return { status: 400, body: { error: "invalid_payment_intent_input" } };
      }

      try {
        const adapter = providerRegistry.require(input.body.provider);
        const prepared = await preparePaymentIntentSubmission(deps.db, {
          input,
          workspaceId: deps.workspaceId,
        });
        if (prepared.kind === "replayed") {
          return { status: 200, body: intentResponseBody(prepared.intent) };
        }

        const providerResult = await createProviderIntentSafely(adapter, {
          provider: prepared.intent.provider,
          productMode: prepared.intent.product_mode,
          merchantOrderNo: prepared.intent.merchant_order_no,
          providerIdempotencyKey: providerIdempotencyKey(prepared.intent),
          amountMinor: prepared.intent.amount_minor,
          currency: prepared.intent.currency as "CNY",
          subject: `Credit package ${prepared.order.credits}`,
          notifyUrl: providerCallbackUrl(deps.providerCallbackBaseUrl, prepared.intent.provider),
          returnUrl: deps.paymentReturnUrl,
          expiresAt: new Date(prepared.intent.expires_at),
          safeMetadata: {
            orderId: prepared.order.id,
            creditPackageId: prepared.order.credit_package_id,
            idempotencyRecordId: prepared.idempotencyRecord.id,
          },
        });
        const completed = await completePaymentIntentSubmission(deps.db, {
          prepared,
          providerResult,
          now: input.now,
        });

        return { status: 200, body: intentResponseBody(completed) };
      } catch (error) {
        return mapCommerceError(error);
      }
    },

    async processPaymentCallback(input: {
      body: PaymentCallbackSignatureInput & { signature: string };
      rawPayloadHash?: string;
      signatureStatus?: SignatureStatus;
      now: Date;
    }) {
      const body = parsePaymentCallbackBody(input.body);
      if (!body) {
        return {
          status: 400,
          body: { error: "invalid_payment_callback_input" },
        };
      }

      const callbackSecret = requiredCallbackSecret(deps.callbackSecret);
      const rawPayloadHash = input.rawPayloadHash ?? hashJson(body);
      const expectedSignature = signPaymentCallback(body, callbackSecret);
      const signatureStatus =
        input.signatureStatus ??
        (expectedSignature === body.signature ? "verified" : "invalid");
      const joined = await findCallbackOrder(deps.db, {
        provider: body.provider,
        merchantOrderNo: body.merchantOrderNo,
      });

      if (signatureStatus === "invalid") {
        return createCallbackRiskResponse(deps.db, {
          body: callbackBodyWithProviderEventDedupKey(
            body,
            invalidSignatureProviderEventDedupKey(rawPayloadHash),
          ),
          originalProviderEventDedupKey: body.providerEventDedupKey,
          joined,
          rawPayloadHash,
          signatureStatus,
          processingStatus: "manual_review_required",
          riskType: "signature_invalid",
          failureCode: "signature_invalid",
          severity: "critical",
          now: input.now,
        });
      }

      const existing = await findProviderEventByDedup(deps.db, {
        provider: body.provider,
        providerEventDedupKey: body.providerEventDedupKey,
      });
      if (existing) {
        return {
          status: 200,
          body: {
            acknowledged: true,
            duplicate: true,
            providerEvent: providerEventViewFromRow(existing),
          },
        };
      }

      if (!joined) {
        return createCallbackRiskResponse(deps.db, {
          body,
          joined: undefined,
          rawPayloadHash,
          signatureStatus,
          processingStatus: "unmatched",
          riskType: "merchant_mismatch",
          failureCode: "merchant_order_not_found",
          severity: "critical",
          now: input.now,
        });
      }

      const mismatch = callbackMismatch(body, joined, merchantId);
      if (mismatch) {
        return createCallbackRiskResponse(deps.db, {
          body,
          joined,
          rawPayloadHash,
          signatureStatus,
          processingStatus: "manual_review_required",
          riskType: mismatch,
          failureCode: mismatch,
          severity: "critical",
          now: input.now,
        });
      }

      const callbackIntentStatus = paymentIntentStatusForCallbackEvent(
        body.eventType,
      );
      const manualReviewRisk = manualReviewRiskForCallbackEvent(
        body.eventType,
      );

      await deps.db.query("BEGIN");
      try {
        const paymentRisk = await paymentRiskForCallback(deps.db, {
          joined,
          body,
        });
        const providerEventInsert = await insertProviderEventOnce(deps.db, {
          body,
          joined,
          rawPayloadHash,
          signatureStatus,
          processingStatus: paymentRisk
            ? "manual_review_required"
            : callbackIntentStatus
              ? "processed"
              : "manual_review_required",
          failureCode: paymentRisk
            ? paymentRisk.riskType
            : manualReviewRisk
              ? manualReviewRisk.riskType
              : null,
          now: input.now,
        });
        if (providerEventInsert.kind === "duplicate") {
          await deps.db.query("COMMIT");
          return duplicateProviderEventResponse(providerEventInsert.providerEvent);
        }
        const providerEvent = providerEventInsert.providerEvent;

        if (paymentRisk) {
          const riskResult = await recordPaymentCallbackRisk(deps.db, {
            joined,
            providerEvent,
            body,
            risk: paymentRisk,
            now: input.now,
          });

          await deps.db.query("COMMIT");
          return {
            status: 200,
            body: {
              acknowledged: true,
              duplicate: false,
              providerEvent: providerEventViewFromRow(riskResult.providerEvent),
              riskEvent: riskEventViewFromRow(riskResult.riskEvent),
            },
          };
        }

        if (!shouldMarkOrderPaid(body.eventType)) {
          const riskEvent = manualReviewRisk
            ? await insertPaymentRiskEvent(deps.db, {
                joined,
                providerEventId: providerEvent.id,
                riskType: manualReviewRisk.riskType,
                severity: manualReviewRisk.severity,
                decision: "manual_review",
                metadata: {
                  provider: body.provider,
                  merchantOrderNo: body.merchantOrderNo,
                  providerTradeId: body.providerTradeId,
                  callbackEventType: body.eventType,
                  paymentIntentStatus: joined.payment_intent_status,
                  orderStatus: joined.status,
                },
                now: input.now,
              })
            : null;

          if (callbackIntentStatus) {
            const intentUpdate = await updatePaymentIntentForNonSuccessCallback(
              deps.db,
              {
                joined,
                body,
                callbackIntentStatus,
                now: input.now,
              },
            );
            if (intentUpdate.kind === "provider_trade_conflict") {
              const riskResult = await recordPaymentCallbackRisk(deps.db, {
                joined,
                providerEvent,
                body,
                risk: intentUpdate.risk,
                now: input.now,
              });

              await deps.db.query("COMMIT");
              return {
                status: 200,
                body: {
                  acknowledged: true,
                  duplicate: false,
                  providerEvent: providerEventViewFromRow(riskResult.providerEvent),
                  riskEvent: riskEventViewFromRow(riskResult.riskEvent),
                },
              };
            }
          }

          await deps.db.query("COMMIT");
          return {
            status: 200,
            body: {
              acknowledged: true,
              duplicate: false,
              providerEvent: providerEventViewFromRow(providerEvent),
              ...(riskEvent
                ? { riskEvent: riskEventViewFromRow(riskEvent) }
                : {}),
            },
          };
        }

        const intentUpdate = await updatePaymentIntentForSuccessCallback(deps.db, {
          joined,
          body,
          now: input.now,
        });
        if (intentUpdate.kind === "provider_trade_conflict") {
          const riskResult = await recordPaymentCallbackRisk(deps.db, {
            joined,
            providerEvent,
            body,
            risk: intentUpdate.risk,
            now: input.now,
          });

          await deps.db.query("COMMIT");
          return {
            status: 200,
            body: {
              acknowledged: true,
              duplicate: false,
              providerEvent: providerEventViewFromRow(riskResult.providerEvent),
              riskEvent: riskEventViewFromRow(riskResult.riskEvent),
            },
          };
        }

        const updatedIntent = intentUpdate.value;
        const paidOrder = updatedIntent
          ? await queryOne<BillingOrderRow>(
              deps.db,
              `
                UPDATE billing_orders
                SET status = 'paid',
                    paid_at = COALESCE(paid_at, $4),
                    successful_payment_intent_id = $3,
                    updated_at = $4
                WHERE organization_id = $1
                  AND id = $2
                  AND status = 'pending_payment'
                RETURNING *
              `,
              [
                joined.organization_id,
                joined.id,
                joined.payment_intent_id,
                input.now,
              ],
            )
          : null;

        if (!paidOrder) {
          const riskResult = await recordPaymentCallbackRisk(deps.db, {
            joined,
            providerEvent,
            body,
            risk: {
              riskType: "duplicate_trade",
              severity: "critical",
              conflict: "order_not_payable",
            },
            now: input.now,
          });

          await deps.db.query("COMMIT");
          return {
            status: 200,
            body: {
              acknowledged: true,
              duplicate: false,
              providerEvent: providerEventViewFromRow(riskResult.providerEvent),
              riskEvent: riskEventViewFromRow(riskResult.riskEvent),
            },
          };
        }

        await appendPaymentSucceededOutboxEvent(deps.db, {
          order: paidOrder,
          paymentIntentId: joined.payment_intent_id,
          providerEventId: providerEvent.id,
          now: input.now,
        });

        await deps.db.query("COMMIT");
        return {
          status: 200,
          body: {
            acknowledged: true,
            duplicate: false,
            providerEvent: providerEventViewFromRow(providerEvent),
            order: orderViewFromRow(paidOrder),
          },
        };
      } catch (error) {
        await deps.db.query("ROLLBACK");
        throw error;
      }
    },

    async processProviderCallback(input: {
      provider: PaymentProvider;
      rawBody: string;
      headers: Record<string, string>;
      now: Date;
    }) {
      if (!isPaymentProvider(input.provider)) {
        return {
          status: 400,
          body: { error: "invalid_payment_provider" },
        };
      }

      const adapter = providerRegistry.require(input.provider);
      const verification = await adapter.verifyCallback(input.rawBody, input.headers);
      const event = await adapter.normalizeCallback(
        input.rawBody,
        input.headers,
        verification,
      );
      if (!event) {
        return {
          status: 400,
          body: { error: "invalid_provider_callback" },
        };
      }

      const callbackBody: PaymentCallbackSignatureInput = {
        provider: event.provider,
        providerEventDedupKey: event.providerEventDedupKey,
        merchantOrderNo: event.merchantOrderNo,
        providerTradeId: event.providerTradeId,
        eventType: event.eventType,
        amountMinor: event.amountMinor,
        currency: event.currency,
        merchantId: event.providerAccountRef ?? merchantId,
      };

      return this.processPaymentCallback({
        body: {
          ...callbackBody,
          signature:
            verification.signatureStatus === "verified"
              ? signPaymentCallback(
                  callbackBody,
                  requiredCallbackSecret(deps.callbackSecret),
                )
              : "invalid-provider-signature",
        },
        rawPayloadHash: event.rawPayloadHash,
        signatureStatus: event.signatureStatus,
        now: input.now,
      });
    },

    async reconcilePaymentIntent(input: {
      paymentIntentId: string;
      now: Date;
    }) {
      const intent = await findPaymentIntentById(deps.db, input.paymentIntentId);
      if (!intent) {
        return {
          status: 404,
          body: { error: "payment_intent_not_found" },
        };
      }

      const adapter = providerRegistry.require(intent.provider);
      const metadata = normalizeJson(intent.provider_safe_metadata_json);
      const providerStatus = await adapter.queryPaymentStatus({
        merchantOrderNo: intent.merchant_order_no,
        providerIntentId: stringMetadata(metadata, "providerIntentId"),
        providerPaymentId: stringMetadata(metadata, "providerPaymentId"),
        providerTradeId:
          intent.provider_trade_id ?? stringMetadata(metadata, "providerTradeId"),
      });
      const reconciliation = await createPaymentReconciliationAttempt(deps.db, {
        intent,
        providerStatus,
        now: input.now,
      });
      if (providerStatusAlreadyAppliedToIntent(intent, providerStatus)) {
        const updated = await finishPaymentReconciliationAttempt(deps.db, {
          itemId: reconciliation.item.id,
          runId: reconciliation.runId,
          status: "resolved",
          resolution: {
            providerStatus: providerStatus.status,
            providerPayloadHash: providerStatus.providerPayloadHash,
            alreadySettled: true,
          },
          now: input.now,
        });

        return {
          status: 200,
          body: {
            reconciliation: reconciliationViewFromItem(updated, providerStatus),
          },
        };
      }
      const callbackBody = paymentCallbackBodyForReconciliation({
        intent,
        providerStatus,
        merchantId,
      });

      if (!callbackBody) {
        const status =
          providerStatus.status === "unknown" || providerStatus.status === "not_found"
            ? "open"
            : "manual_review_required";
        const updated = await finishPaymentReconciliationAttempt(deps.db, {
          itemId: reconciliation.item.id,
          runId: reconciliation.runId,
          status,
          resolution: {
            providerStatus: providerStatus.status,
            providerPayloadHash: providerStatus.providerPayloadHash,
            failureCode: "provider_status_not_actionable",
          },
          now: input.now,
        });

        return {
          status: 200,
          body: {
            reconciliation: reconciliationViewFromItem(updated, providerStatus),
          },
        };
      }

      const callbackResponse = await this.processPaymentCallback({
        body: {
          ...callbackBody,
          signature: signPaymentCallback(
            callbackBody,
            requiredCallbackSecret(deps.callbackSecret),
          ),
        },
        rawPayloadHash: providerStatus.providerPayloadHash,
        signatureStatus: "unverified",
        now: input.now,
      });
      const callbackBodyView = callbackResponse.body as {
        providerEvent?: ReturnType<typeof providerEventViewFromRow>;
        order?: ReturnType<typeof orderViewFromRow>;
        riskEvent?: ReturnType<typeof riskEventViewFromRow>;
      };
      const reconciliationStatus = callbackBodyView.riskEvent
        ? "manual_review_required"
        : callbackBodyView.providerEvent
          ? "resolved"
          : "open";
      const updated = await finishPaymentReconciliationAttempt(deps.db, {
        itemId: reconciliation.item.id,
        runId: reconciliation.runId,
        status: reconciliationStatus,
        resolution: {
          providerStatus: providerStatus.status,
          providerPayloadHash: providerStatus.providerPayloadHash,
          providerEventId: callbackBodyView.providerEvent?.id,
          riskEventId: callbackBodyView.riskEvent?.id,
          orderId: callbackBodyView.order?.id,
        },
        now: input.now,
      });

      return {
        status: callbackResponse.status,
        body: {
          reconciliation: reconciliationViewFromItem(updated, providerStatus),
          ...callbackResponse.body,
        },
      };
    },
  };
}

type PreparedPaymentIntentSubmission =
  | { kind: "replayed"; intent: PaymentIntentRow }
  | {
      kind: "created";
      actor: ActorContext;
      idempotencyRecord: IdempotencyRecord;
      order: BillingOrderRow;
      intent: PaymentIntentRow;
    };

async function preparePaymentIntentSubmission(
  db: SqlDatabase,
  input: {
    input: {
      user: AuthenticatedCommerceUser;
      body: { orderId: string; provider: PaymentProvider; productMode: string };
      idempotencyKey: string;
      now: Date;
    };
    workspaceId: string;
  },
): Promise<PreparedPaymentIntentSubmission> {
  await db.query("BEGIN");
  try {
    const actor = await resolveActorContext(db, {
      sessionToken: input.input.user.sessionToken,
      workspaceId: input.workspaceId,
      capability: createPaymentIntentCommand.capability,
      now: input.input.now,
    });
    const store = new SqlIdempotencyRecordStore(db);
    const started = await beginOrReplayCommand(store, {
      organizationId: actor.organizationId,
      operationName: createPaymentIntentCommand.operationName,
      idempotencyKey: input.input.idempotencyKey,
      requestHash: hashJson(input.input.body),
    });

    if (started.kind === "replayed") {
      const intent = await findPaymentIntentById(
        db,
        started.record.responseResourceId,
      );
      if (!intent) {
        throw new Error("payment_intent_replay_missing_resource");
      }
      await db.query("COMMIT");
      return { kind: "replayed", intent };
    }

    if (started.kind === "processing") {
      const existingIntent = await findPaymentIntentByIdempotencyRecord(db, {
        idempotencyRecordId: started.record.id,
      });
      if (!existingIntent) {
        throw new IdempotencyProcessingError(started.record);
      }

      if (existingIntent.status !== "created") {
        const result = intentResponseBody(existingIntent);
        await store.update({
          ...started.record,
          responseResourceType: "payment_intent",
          responseResourceId: existingIntent.id,
          responseSnapshot: result,
          status: "succeeded",
          updatedAt: input.input.now,
        });
        await db.query("COMMIT");
        return { kind: "replayed", intent: existingIntent };
      }

      const order = await findOrderForActor(db, {
        organizationId: actor.organizationId,
        orderId: existingIntent.order_id,
      });
      if (!order) {
        throw new CommercePaymentError("order_not_payable");
      }

      await db.query("COMMIT");
      return {
        kind: "created",
        actor,
        idempotencyRecord: started.record,
        order,
        intent: existingIntent,
      };
    }

    const order = await findOrderForActor(db, {
      organizationId: actor.organizationId,
      orderId: input.input.body.orderId,
    });
    if (
      !order ||
      order.status !== "pending_payment" ||
      new Date(order.expires_at).getTime() <= input.input.now.getTime()
    ) {
      throw new CommercePaymentError("order_not_payable");
    }

    const intent = await insertCreatedPaymentIntent(db, {
      actor,
      order,
      body: input.input.body,
      idempotencyRecord: started.record,
      idempotencyKey: input.input.idempotencyKey,
      now: input.input.now,
    });

    await db.query("COMMIT");
    return {
      kind: "created",
      actor,
      idempotencyRecord: started.record,
      order,
      intent,
    };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

async function insertCreatedPaymentIntent(
  db: SqlDatabase,
  input: {
    actor: ActorContext;
    order: BillingOrderRow;
    body: { provider: PaymentProvider; productMode: string };
    idempotencyRecord: IdempotencyRecord;
    idempotencyKey: string;
    now: Date;
  },
): Promise<PaymentIntentRow> {
  const intentId = randomUUID();
  const initialPayloadHash = hashJson({
    orderId: input.order.id,
    provider: input.body.provider,
    amountMinor: input.order.amount_minor,
    currency: input.order.currency,
    status: "created",
  });
  const intent = await queryOne<PaymentIntentRow>(
    db,
    `
      INSERT INTO payment_intents (
        id,
        organization_id,
        order_id,
        provider,
        product_mode,
        status,
        amount_minor,
        currency,
        merchant_order_no,
        provider_payload_hash,
        provider_safe_metadata_json,
        submitted_at,
        expires_at,
        idempotency_record_id,
        idempotency_key,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        'created',
        $6,
        $7,
        $8,
        $9,
        $10::jsonb,
        NULL,
        $11,
        $12,
        $13,
        $14,
        $14
      )
      RETURNING *
    `,
    [
      intentId,
      input.actor.organizationId,
      input.order.id,
      input.body.provider,
      input.body.productMode,
      input.order.amount_minor,
      input.order.currency,
      input.order.order_no,
      initialPayloadHash,
      JSON.stringify({
        mode: input.body.productMode,
        actionKind: "pending_provider_submission",
      }),
      input.order.expires_at,
      input.idempotencyRecord.id,
      input.idempotencyKey,
      input.now,
    ],
  );
  if (!intent) {
    throw new Error("payment_intent_create_failed");
  }

  return intent;
}

async function createProviderIntentSafely(
  adapter: Pick<PaymentProviderAdapter, "createPaymentIntent">,
  input: Parameters<PaymentProviderAdapter["createPaymentIntent"]>[0],
): Promise<CreateProviderPaymentIntentResult> {
  try {
    return await adapter.createPaymentIntent(input);
  } catch (error) {
    if (error instanceof PaymentProviderError) {
      if (error.code === "provider_not_enabled") {
        throw error;
      }
      return {
        kind: "unknown",
        providerPayloadHash: hashJson({
          failureCode: error.code,
          ambiguous: error.details.ambiguous ?? false,
        }),
        providerSafeMetadata: {
          failureCode: error.code,
          ambiguous: error.details.ambiguous ?? false,
        },
        failureCode: error.code,
      };
    }
    return {
      kind: "unknown",
      providerPayloadHash: hashJson({
        failureCode: "provider_submission_error",
        message: error instanceof Error ? error.message : String(error),
      }),
      providerSafeMetadata: {
        failureCode: "provider_submission_error",
      },
      failureCode: "provider_submission_error",
    };
  }
}

async function completePaymentIntentSubmission(
  db: SqlDatabase,
  input: {
    prepared: Extract<PreparedPaymentIntentSubmission, { kind: "created" }>;
    providerResult: CreateProviderPaymentIntentResult;
    now: Date;
  },
): Promise<PaymentIntentRow> {
  await db.query("BEGIN");
  try {
    const intent = await updatePaymentIntentProviderSubmission(db, {
      intent: input.prepared.intent,
      providerResult: input.providerResult,
      now: input.now,
    });
    const result = intentResponseBody(intent);
    const store = new SqlIdempotencyRecordStore(db);
    await store.update({
      ...input.prepared.idempotencyRecord,
      responseResourceType: "payment_intent",
      responseResourceId: intent.id,
      responseSnapshot: result,
      status: "succeeded",
      updatedAt: input.now,
    });
    await appendAuditEvent(db, {
      organizationId: input.prepared.actor.organizationId,
      workspaceId: input.prepared.actor.workspaceId,
      actorUserId: input.prepared.actor.actorId,
      eventType: createPaymentIntentCommand.auditEvent,
      targetType: "payment_intent",
      targetId: intent.id,
      metadata: {
        orderId: input.prepared.order.id,
        provider: intent.provider,
        amountMinor: intent.amount_minor,
        providerResult: input.providerResult.kind,
      },
      occurredAt: input.now,
    });

    await db.query("COMMIT");
    return intent;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

async function updatePaymentIntentProviderSubmission(
  db: SqlDatabase,
  input: {
    intent: PaymentIntentRow;
    providerResult: CreateProviderPaymentIntentResult;
    now: Date;
  },
): Promise<PaymentIntentRow> {
  const payAction =
    input.providerResult.kind === "submitted"
      ? input.providerResult.payAction
      : input.providerResult.payAction ?? manualConfirmPayAction(input.intent, input.providerResult.failureCode);
  const providerSafeMetadata = {
    ...input.providerResult.providerSafeMetadata,
    mode: input.intent.product_mode,
    actionKind: payAction.kind,
    payAction,
    ...(input.providerResult.kind === "submitted"
      ? {
          providerIntentId: input.providerResult.providerIntentId,
          providerPaymentId: input.providerResult.providerPaymentId,
        }
      : {
          failureCode: input.providerResult.failureCode,
        }),
  };
  const intent = await queryOne<PaymentIntentRow>(
    db,
    `
      UPDATE payment_intents
      SET status = $2,
          provider_trade_id = COALESCE($3, provider_trade_id),
          provider_payload_hash = $4,
          provider_safe_metadata_json = $5::jsonb,
          submitted_at = $6,
          updated_at = $7
      WHERE id = $1
      RETURNING *
    `,
    [
      input.intent.id,
      input.providerResult.kind === "submitted" ? "submitted" : "unknown",
      input.providerResult.kind === "submitted"
        ? input.providerResult.providerTradeId ?? null
        : null,
      input.providerResult.providerPayloadHash,
      JSON.stringify(providerSafeMetadata),
      input.providerResult.kind === "submitted" ? input.now : null,
      input.now,
    ],
  );
  if (!intent) {
    throw new Error("payment_intent_submission_update_failed");
  }

  return intent;
}

function providerIdempotencyKey(intent: PaymentIntentRow) {
  return `payment_intent:${intent.id}`;
}

function providerCallbackUrl(
  baseUrl: string | undefined,
  provider: PaymentProvider,
) {
  const normalized = baseUrl?.trim().replace(/\/+$/, "");
  return normalized
    ? `${normalized}/api/payment-provider-callbacks/${provider}`
    : undefined;
}

function manualConfirmPayAction(
  intent: PaymentIntentRow,
  failureCode?: string,
): ProviderPayAction {
  return {
    kind: "manual_confirm",
    provider: intent.provider,
    merchantOrderNo: intent.merchant_order_no,
    amountMinor: intent.amount_minor,
    currency: intent.currency as "CNY",
    failureCode,
  };
}

async function createPaymentReconciliationAttempt(
  db: SqlDatabase,
  input: {
    intent: PaymentIntentRow;
    providerStatus: NormalizedPaymentStatus;
    now: Date;
  },
) {
  await db.query("BEGIN");
  try {
    const runId = randomUUID();
    await db.query(
      `
        INSERT INTO payment_reconciliation_runs (
          id,
          organization_id,
          provider,
          run_type,
          status,
          summary_json,
          started_at,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          'recent',
          'running',
          $4::jsonb,
          $5,
          $5,
          $5
        )
      `,
      [
        runId,
        input.intent.organization_id,
        input.intent.provider,
        JSON.stringify({
          paymentIntentId: input.intent.id,
          merchantOrderNo: input.intent.merchant_order_no,
          providerStatus: input.providerStatus.status,
        }),
        input.now,
      ],
    );
    const item = await queryOne<PaymentReconciliationItemRow>(
      db,
      `
        INSERT INTO payment_reconciliation_items (
          id,
          organization_id,
          run_id,
          order_id,
          payment_intent_id,
          provider_trade_id,
          issue_type,
          status,
          resolution_json,
          created_at,
          updated_at
        )
        VALUES (
          $1,
          $2,
          $3,
          $4,
          $5,
          $6,
          $7,
          'open',
          $8::jsonb,
          $9,
          $9
        )
        RETURNING *
      `,
      [
        randomUUID(),
        input.intent.organization_id,
        runId,
        input.intent.order_id,
        input.intent.id,
        input.providerStatus.providerTradeId ?? input.intent.provider_trade_id,
        reconciliationIssueType(input.intent, input.providerStatus),
        JSON.stringify({
          providerStatus: input.providerStatus.status,
          providerPayloadHash: input.providerStatus.providerPayloadHash,
          providerSafeMetadata: input.providerStatus.providerSafeMetadata,
        }),
        input.now,
      ],
    );
    if (!item) {
      throw new Error("payment_reconciliation_item_create_failed");
    }

    await db.query("COMMIT");
    return { runId, item };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

async function finishPaymentReconciliationAttempt(
  db: SqlDatabase,
  input: {
    runId: string;
    itemId: string;
    status: PaymentReconciliationItemRow["status"];
    resolution: Record<string, unknown>;
    now: Date;
  },
) {
  await db.query("BEGIN");
  try {
    const item = await queryOne<PaymentReconciliationItemRow>(
      db,
      `
        UPDATE payment_reconciliation_items
        SET status = $3,
            resolution_json = resolution_json || $4::jsonb,
            updated_at = $5
        WHERE run_id = $1
          AND id = $2
        RETURNING *
      `,
      [
        input.runId,
        input.itemId,
        input.status,
        JSON.stringify(input.resolution),
        input.now,
      ],
    );
    if (!item) {
      throw new Error("payment_reconciliation_item_finish_failed");
    }

    await db.query(
      `
        UPDATE payment_reconciliation_runs
        SET status = $2,
            finished_at = $3,
            summary_json = summary_json || $4::jsonb,
            updated_at = $3
        WHERE id = $1
      `,
      [
        input.runId,
        input.status === "manual_review_required" ? "partial_failed" : "succeeded",
        input.now,
        JSON.stringify({
          itemStatus: input.status,
          resolution: input.resolution,
        }),
      ],
    );

    await db.query("COMMIT");
    return item;
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

function reconciliationIssueType(
  intent: PaymentIntentRow,
  providerStatus: NormalizedPaymentStatus,
): PaymentReconciliationItemRow["issue_type"] {
  if (
    providerStatus.status === "succeeded" &&
    ((providerStatus.amountMinor !== undefined &&
      providerStatus.amountMinor !== intent.amount_minor) ||
      (providerStatus.currency !== undefined &&
        providerStatus.currency !== intent.currency))
  ) {
    return "amount_mismatch";
  }
  if (providerStatus.status === "succeeded") {
    return "provider_paid_platform_unpaid";
  }
  if (providerStatus.status === "failed" || providerStatus.status === "closed") {
    return "missing_callback";
  }
  return "missing_callback";
}

function providerStatusAlreadyAppliedToIntent(
  intent: PaymentIntentRow,
  providerStatus: NormalizedPaymentStatus,
) {
  if (!providerStatusMatchesIntentFacts(intent, providerStatus)) {
    return false;
  }
  if (providerStatus.status === "succeeded") {
    return intent.status === "succeeded";
  }
  if (providerStatus.status === "failed") {
    return intent.status === "failed";
  }
  if (providerStatus.status === "closed" || providerStatus.status === "expired") {
    return intent.status === "closed" || intent.status === "expired";
  }
  return false;
}

function providerStatusMatchesIntentFacts(
  intent: PaymentIntentRow,
  providerStatus: NormalizedPaymentStatus,
) {
  if (
    providerStatus.amountMinor !== undefined &&
    providerStatus.amountMinor !== intent.amount_minor
  ) {
    return false;
  }
  if (
    providerStatus.currency !== undefined &&
    providerStatus.currency !== intent.currency
  ) {
    return false;
  }
  if (
    providerStatus.providerTradeId &&
    intent.provider_trade_id &&
    providerStatus.providerTradeId !== intent.provider_trade_id
  ) {
    return false;
  }
  return true;
}

function paymentCallbackBodyForReconciliation(input: {
  intent: PaymentIntentRow;
  providerStatus: NormalizedPaymentStatus;
  merchantId: string;
}): PaymentCallbackSignatureInput | null {
  const eventType = paymentEventTypeForProviderStatus(input.providerStatus.status);
  if (!eventType) {
    return null;
  }
  const amountMinor = input.providerStatus.amountMinor ?? input.intent.amount_minor;
  const currency = input.providerStatus.currency ?? (input.intent.currency as "CNY");
  const providerTradeId =
    input.providerStatus.providerTradeId ?? input.intent.provider_trade_id;
  if (!providerTradeId || currency !== "CNY") {
    return null;
  }

  return {
    provider: input.intent.provider,
    providerEventDedupKey: reconciliationProviderEventDedupKey(
      input.intent,
      input.providerStatus,
    ),
    merchantOrderNo: input.intent.merchant_order_no,
    providerTradeId,
    eventType,
    amountMinor,
    currency,
    merchantId: input.merchantId,
  };
}

function paymentEventTypeForProviderStatus(
  status: NormalizedPaymentStatus["status"],
): PaymentEventType | null {
  if (status === "succeeded") {
    return "payment_succeeded";
  }
  if (status === "failed") {
    return "payment_failed";
  }
  if (status === "closed" || status === "expired") {
    return "payment_closed";
  }
  return null;
}

function reconciliationProviderEventDedupKey(
  intent: PaymentIntentRow,
  providerStatus: NormalizedPaymentStatus,
) {
  return [
    "reconciliation",
    intent.provider,
    intent.merchant_order_no,
    providerStatus.status,
    providerStatus.providerPayloadHash,
  ].join(":");
}

function reconciliationViewFromItem(
  item: PaymentReconciliationItemRow,
  providerStatus: NormalizedPaymentStatus,
) {
  return {
    runId: item.run_id,
    itemId: item.id,
    issueType: item.issue_type,
    status: item.status,
    providerStatus: providerStatus.status,
    resolution: normalizeJson(item.resolution_json),
  };
}

function requiredCallbackSecret(secret: string | undefined): string {
  const normalized = secret?.trim();
  if (!normalized) {
    throw new Error("payment_callback_secret_required");
  }
  return normalized;
}

function parsePaymentCallbackBody(payload: unknown): PaymentCallbackBody | null {
  if (typeof payload !== "object" || payload === null) {
    return null;
  }
  const value = payload as Record<string, unknown>;
  if (
    !isPaymentProvider(value.provider) ||
    !isPaymentEventType(value.eventType) ||
    !isNonEmptyString(value.providerEventDedupKey) ||
    !isNonEmptyString(value.merchantOrderNo) ||
    !isNonEmptyString(value.providerTradeId) ||
    !Number.isInteger(value.amountMinor) ||
    value.amountMinor <= 0 ||
    value.currency !== "CNY" ||
    !isNonEmptyString(value.merchantId) ||
    !isNonEmptyString(value.signature)
  ) {
    return null;
  }

  return {
    provider: value.provider,
    providerEventDedupKey: value.providerEventDedupKey,
    merchantOrderNo: value.merchantOrderNo,
    providerTradeId: value.providerTradeId,
    eventType: value.eventType,
    amountMinor: value.amountMinor,
    currency: value.currency,
    merchantId: value.merchantId,
    signature: value.signature,
  };
}

function isPaymentEventType(value: unknown): value is PaymentEventType {
  return (
    value === "payment_succeeded" ||
    value === "payment_failed" ||
    value === "payment_closed" ||
    value === "refund_succeeded" ||
    value === "unknown"
  );
}

function isNonEmptyString(value: unknown): value is string {
  return typeof value === "string" && value.trim().length > 0;
}

export async function ensureDefaultCreditPackage(
  db: SqlDatabase,
  input: { now: Date },
) {
  await db.query(
    `
      INSERT INTO credit_packages (
        id,
        code,
        display_name,
        credits,
        amount_minor,
        currency,
        status,
        created_at,
        updated_at
      )
      VALUES (
        '90000000-0000-4000-8000-000000000001',
        'starter_120',
        'Starter 120',
        120,
        9900,
        'CNY',
        'active',
        $1,
        $1
      )
      ON CONFLICT (code) DO UPDATE
      SET display_name = EXCLUDED.display_name,
          credits = EXCLUDED.credits,
          amount_minor = EXCLUDED.amount_minor,
          currency = EXCLUDED.currency,
          status = 'active',
          updated_at = EXCLUDED.updated_at
    `,
    [input.now],
  );
}

export function signPaymentCallback(
  input: PaymentCallbackSignatureInput,
  secret: string,
): string {
  return createHmac("sha256", secret).update(callbackSignatureBase(input)).digest("hex");
}

function callbackBodyWithProviderEventDedupKey(
  body: PaymentCallbackBody,
  providerEventDedupKey: string,
): PaymentCallbackBody {
  return {
    ...body,
    providerEventDedupKey,
  };
}

function invalidSignatureProviderEventDedupKey(rawPayloadHash: string): string {
  return `invalid-signature:${rawPayloadHash}`;
}

class CommercePaymentError extends Error {
  constructor(readonly code: string) {
    super(code);
  }
}

async function createCallbackRiskResponse(
  db: SqlDatabase,
  input: {
    body: PaymentCallbackSignatureInput & { signature: string };
    originalProviderEventDedupKey?: string;
    joined: CallbackOrderJoinRow | undefined;
    rawPayloadHash: string;
    signatureStatus: SignatureStatus;
    processingStatus: PaymentProviderEventStatus;
    riskType: string;
    failureCode: string;
    severity: RiskEventSeverity;
    now: Date;
  },
) {
  await db.query("BEGIN");
  try {
    const providerEventInsert = await insertProviderEventOnce(db, {
      body: input.body,
      joined: input.joined,
      rawPayloadHash: input.rawPayloadHash,
      signatureStatus: input.signatureStatus,
      processingStatus: input.processingStatus,
      failureCode: input.failureCode,
      now: input.now,
    });
    if (providerEventInsert.kind === "duplicate") {
      await db.query("COMMIT");
      return duplicateProviderEventResponse(providerEventInsert.providerEvent);
    }

    const providerEvent = providerEventInsert.providerEvent;
    const riskEvent = await insertPaymentRiskEvent(db, {
      joined: input.joined,
      providerEventId: providerEvent.id,
      riskType: input.riskType,
      severity: input.severity,
      decision: "manual_review",
      metadata: {
        provider: input.body.provider,
        providerEventDedupKey:
          input.originalProviderEventDedupKey ?? input.body.providerEventDedupKey,
        merchantOrderNo: input.body.merchantOrderNo,
        callbackAmountMinor: input.body.amountMinor,
        callbackCurrency: input.body.currency,
      },
      now: input.now,
    });

    await db.query("COMMIT");
    return {
      status: 200,
      body: {
        acknowledged: true,
        duplicate: false,
        providerEvent: providerEventViewFromRow(providerEvent),
        riskEvent: riskEventViewFromRow(riskEvent),
      },
    };
  } catch (error) {
    await db.query("ROLLBACK");
    throw error;
  }
}

function duplicateProviderEventResponse(providerEvent: ProviderEventRow) {
  return {
    status: 200,
    body: {
      acknowledged: true,
      duplicate: true,
      providerEvent: providerEventViewFromRow(providerEvent),
    },
  };
}

function callbackMismatch(
  body: PaymentCallbackSignatureInput,
  joined: CallbackOrderJoinRow,
  expectedMerchantId: string,
) {
  if (body.merchantId !== expectedMerchantId) {
    return "merchant_mismatch";
  }
  if (body.amountMinor !== joined.amount_minor) {
    return "amount_mismatch";
  }
  if (body.currency !== joined.currency) {
    return "currency_mismatch";
  }
  return null;
}

function paymentIntentStatusForCallbackEvent(
  eventType: PaymentEventType,
): PaymentIntentStatus | null {
  if (eventType === "payment_succeeded") {
    return "succeeded";
  }
  if (eventType === "payment_failed") {
    return "failed";
  }
  if (eventType === "payment_closed") {
    return "closed";
  }
  return null;
}

function manualReviewRiskForCallbackEvent(
  eventType: PaymentEventType,
): { riskType: "refund_requires_review" | "callback_event_requires_review"; severity: RiskEventSeverity } | null {
  if (eventType === "refund_succeeded") {
    return { riskType: "refund_requires_review", severity: "warning" };
  }
  if (eventType === "unknown") {
    return { riskType: "callback_event_requires_review", severity: "critical" };
  }
  return null;
}

function shouldMarkOrderPaid(eventType: PaymentEventType): boolean {
  return eventType === "payment_succeeded";
}

async function findActivePackage(
  db: SqlDatabase,
  input: { creditPackageId: string },
) {
  return queryOne<CreditPackageRow>(
    db,
    `
      SELECT *
      FROM credit_packages
      WHERE id = $1
        AND status = 'active'
        AND (valid_from IS NULL OR valid_from <= now())
        AND (valid_until IS NULL OR valid_until > now())
      LIMIT 1
    `,
    [input.creditPackageId],
  );
}

async function findOrderForActor(
  db: SqlDatabase,
  input: { organizationId: string; orderId: string },
) {
  return queryOne<BillingOrderRow>(
    db,
    "SELECT * FROM billing_orders WHERE organization_id = $1 AND id = $2",
    [input.organizationId, input.orderId],
  );
}

async function findOrderById(db: SqlDatabase, orderId: string | undefined) {
  if (!orderId) {
    return undefined;
  }
  return queryOne<BillingOrderRow>(
    db,
    "SELECT * FROM billing_orders WHERE id = $1",
    [orderId],
  );
}

async function findPaymentIntentById(
  db: SqlDatabase,
  paymentIntentId: string | undefined,
) {
  if (!paymentIntentId) {
    return undefined;
  }
  return queryOne<PaymentIntentRow>(
    db,
    "SELECT * FROM payment_intents WHERE id = $1",
    [paymentIntentId],
  );
}

async function findPaymentIntentByIdempotencyRecord(
  db: SqlDatabase,
  input: { idempotencyRecordId: string },
) {
  return queryOne<PaymentIntentRow>(
    db,
    "SELECT * FROM payment_intents WHERE idempotency_record_id = $1 LIMIT 1",
    [input.idempotencyRecordId],
  );
}

async function paymentRiskForCallback(
  db: SqlDatabase,
  input: {
    joined: CallbackOrderJoinRow;
    body: PaymentCallbackBody;
  },
): Promise<PaymentCallbackRisk | null> {
  const marksPaid = shouldMarkOrderPaid(input.body.eventType);
  if (
    marksPaid &&
    (input.joined.status !== "pending_payment" ||
      !["created", "submitted", "unknown"].includes(input.joined.payment_intent_status))
  ) {
    return {
      riskType: "duplicate_trade",
      severity: "critical",
      conflict: "order_not_payable",
    };
  }

  const conflictingTrade = await findConflictingProviderTrade(db, input);
  if (conflictingTrade) {
    return {
      riskType: "duplicate_trade",
      severity: "critical",
      conflict: "provider_trade_reused",
    };
  }

  if (!marksPaid) {
    return null;
  }

  const existingSuccess = await queryOne<{ id: string }>(
    db,
    `
      SELECT id
      FROM payment_intents
      WHERE organization_id = $1
        AND order_id = $2
        AND status = 'succeeded'
        AND id <> $3
      LIMIT 1
    `,
    [
      input.joined.organization_id,
      input.joined.id,
      input.joined.payment_intent_id,
    ],
  );
  if (existingSuccess) {
    return {
      riskType: "duplicate_trade",
      severity: "critical",
      conflict: "order_already_succeeded",
    };
  }

  return null;
}

async function findConflictingProviderTrade(
  db: SqlDatabase,
  input: {
    joined: CallbackOrderJoinRow;
    body: PaymentCallbackBody;
  },
) {
  return queryOne<{ id: string }>(
    db,
    `
      SELECT id
      FROM payment_intents
      WHERE provider = $1
        AND provider_trade_id = $2
        AND id <> $3
      LIMIT 1
    `,
    [
      input.body.provider,
      input.body.providerTradeId,
      input.joined.payment_intent_id,
    ],
  );
}

async function updatePaymentIntentForNonSuccessCallback(
  db: SqlDatabase,
  input: {
    joined: CallbackOrderJoinRow;
    body: PaymentCallbackBody;
    callbackIntentStatus: PaymentIntentStatus;
    now: Date;
  },
): Promise<PaymentIntentUpdateResult<void>> {
  return runPaymentIntentTradeUpdate(db, {
    savepointName: "payment_intent_non_success_trade_update",
    update: async () => {
      await db.query(
        `
          UPDATE payment_intents
          SET status = $3,
              provider_trade_id = COALESCE(provider_trade_id, $4),
              updated_at = $5
          WHERE organization_id = $1
            AND id = $2
            AND status IN ('created', 'submitted', 'unknown')
        `,
        [
          input.joined.organization_id,
          input.joined.payment_intent_id,
          input.callbackIntentStatus,
          input.body.providerTradeId,
          input.now,
        ],
      );
    },
  });
}

async function updatePaymentIntentForSuccessCallback(
  db: SqlDatabase,
  input: {
    joined: CallbackOrderJoinRow;
    body: PaymentCallbackBody;
    now: Date;
  },
): Promise<PaymentIntentUpdateResult<PaymentIntentRow | undefined>> {
  return runPaymentIntentTradeUpdate(db, {
    savepointName: "payment_intent_success_trade_update",
    update: () =>
      queryOne<PaymentIntentRow>(
        db,
        `
          UPDATE payment_intents
          SET status = 'succeeded',
              provider_trade_id = $3,
              succeeded_at = $4,
              updated_at = $4
          WHERE organization_id = $1
            AND id = $2
            AND status IN ('created', 'submitted', 'unknown')
          RETURNING *
        `,
        [
          input.joined.organization_id,
          input.joined.payment_intent_id,
          input.body.providerTradeId,
          input.now,
        ],
      ),
  });
}

async function runPaymentIntentTradeUpdate<T>(
  db: SqlDatabase,
  input: { savepointName: string; update: () => Promise<T> },
): Promise<PaymentIntentUpdateResult<T>> {
  await db.query(`SAVEPOINT ${input.savepointName}`);
  try {
    const value = await input.update();
    await db.query(`RELEASE SAVEPOINT ${input.savepointName}`);
    return { kind: "updated", value };
  } catch (error) {
    await db.query(`ROLLBACK TO SAVEPOINT ${input.savepointName}`);
    await db.query(`RELEASE SAVEPOINT ${input.savepointName}`);
    const conflict = paymentIntentUniqueViolationConflict(error);
    if (conflict) {
      return {
        kind: "provider_trade_conflict",
        risk: {
          riskType: "duplicate_trade",
          severity: "critical",
          conflict,
        },
      };
    }

    throw error;
  }
}

function paymentIntentUniqueViolationConflict(
  error: unknown,
): PaymentCallbackRisk["conflict"] | null {
  if (typeof error !== "object" || error === null) {
    return null;
  }
  const details = error as { code?: unknown; constraint?: unknown };
  if (details.code !== "23505") {
    return null;
  }
  if (details.constraint === "payment_intents_provider_trade_unique") {
    return "provider_trade_unique_violation";
  }
  if (details.constraint === "payment_intents_order_success_unique") {
    return "order_success_unique_violation";
  }
  return null;
}

async function findProviderEventByDedup(
  db: SqlDatabase,
  input: { provider: PaymentProvider; providerEventDedupKey: string },
) {
  return queryOne<ProviderEventRow>(
    db,
    `
      SELECT *
      FROM payment_provider_events
      WHERE provider = $1
        AND provider_event_dedup_key = $2
      LIMIT 1
    `,
    [input.provider, input.providerEventDedupKey],
  );
}

async function findCallbackOrder(
  db: SqlDatabase,
  input: { provider: PaymentProvider; merchantOrderNo: string },
) {
  return queryOne<CallbackOrderJoinRow>(
    db,
    `
      SELECT
        bo.*,
        pi.id AS payment_intent_id,
        pi.status AS payment_intent_status,
        pi.provider AS provider
      FROM payment_intents pi
      JOIN billing_orders bo
        ON bo.organization_id = pi.organization_id
       AND bo.id = pi.order_id
      WHERE pi.provider = $1
        AND pi.merchant_order_no = $2
      ORDER BY pi.created_at DESC
      LIMIT 1
    `,
    [input.provider, input.merchantOrderNo],
  );
}

async function insertProviderEventOnce(
  db: SqlDatabase,
  input: {
    body: PaymentCallbackSignatureInput & { signature: string };
    joined: CallbackOrderJoinRow | undefined;
    rawPayloadHash: string;
    signatureStatus: SignatureStatus;
    processingStatus: PaymentProviderEventStatus;
    failureCode: string | null;
    now: Date;
  },
): Promise<
  | { kind: "inserted"; providerEvent: ProviderEventRow }
  | { kind: "duplicate"; providerEvent: ProviderEventRow }
> {
  const inserted = await queryOne<ProviderEventRow>(
    db,
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
        $5,
        $6,
        $7,
        $8,
        $9,
        $10,
        $11,
        $12,
        $13::jsonb,
        'sent_success',
        $14,
        $15,
        $15,
        $15,
        $15
      )
      ON CONFLICT (provider, provider_event_dedup_key) DO NOTHING
      RETURNING *
    `,
    [
      randomUUID(),
      input.joined?.organization_id ?? null,
      input.joined?.id ?? null,
      input.joined?.payment_intent_id ?? null,
      input.body.provider,
      input.body.providerEventDedupKey,
      input.body.merchantOrderNo,
      input.body.providerTradeId,
      input.body.eventType,
      input.signatureStatus,
      input.processingStatus,
      input.rawPayloadHash,
      JSON.stringify({
        merchantOrderNo: input.body.merchantOrderNo,
        providerTradeId: input.body.providerTradeId,
        amountMinor: input.body.amountMinor,
        currency: input.body.currency,
        merchantId: input.body.merchantId,
      }),
      input.failureCode,
      input.now,
    ],
  );

  if (inserted) {
    return { kind: "inserted", providerEvent: inserted };
  }

  const existing = await findProviderEventByDedup(db, {
    provider: input.body.provider,
    providerEventDedupKey: input.body.providerEventDedupKey,
  });
  if (!existing) {
    throw new Error("payment_provider_event_dedup_conflict_missing");
  }

  return { kind: "duplicate", providerEvent: existing };
}

async function recordPaymentCallbackRisk(
  db: SqlDatabase,
  input: {
    joined: CallbackOrderJoinRow;
    providerEvent: ProviderEventRow;
    body: PaymentCallbackBody;
    risk: PaymentCallbackRisk;
    now: Date;
  },
) {
  const providerEvent =
    input.providerEvent.processing_status === "manual_review_required" &&
    input.providerEvent.failure_code === input.risk.riskType
      ? input.providerEvent
      : await markProviderEventManualReviewRequired(db, {
          providerEventId: input.providerEvent.id,
          failureCode: input.risk.riskType,
          now: input.now,
        });
  const riskEvent = await insertPaymentRiskEvent(db, {
    joined: input.joined,
    providerEventId: providerEvent.id,
    riskType: input.risk.riskType,
    severity: input.risk.severity,
    decision: "manual_review",
    metadata: {
      provider: input.body.provider,
      merchantOrderNo: input.body.merchantOrderNo,
      providerTradeId: input.body.providerTradeId,
      callbackEventType: input.body.eventType,
      paymentIntentStatus: input.joined.payment_intent_status,
      orderStatus: input.joined.status,
      conflict: input.risk.conflict,
    },
    now: input.now,
  });

  return { providerEvent, riskEvent };
}

async function markProviderEventManualReviewRequired(
  db: SqlDatabase,
  input: { providerEventId: string; failureCode: string; now: Date },
) {
  const providerEvent = await queryOne<ProviderEventRow>(
    db,
    `
      UPDATE payment_provider_events
      SET processing_status = 'manual_review_required',
          failure_code = $2,
          updated_at = $3
      WHERE id = $1
      RETURNING *
    `,
    [input.providerEventId, input.failureCode, input.now],
  );
  if (!providerEvent) {
    throw new Error("payment_provider_event_missing_for_risk");
  }

  return providerEvent;
}

async function insertPaymentRiskEvent(
  db: SqlDatabase,
  input: {
    joined: CallbackOrderJoinRow | undefined;
    providerEventId: string;
    riskType: string;
    severity: RiskEventSeverity;
    decision: RiskEventDecision;
    metadata: Record<string, unknown>;
    now: Date;
  },
) {
  return queryOne<PaymentRiskEventRow>(
    db,
    `
      INSERT INTO payment_risk_events (
        id,
        organization_id,
        user_id,
        order_id,
        payment_intent_id,
        provider_event_id,
        risk_type,
        severity,
        decision,
        status,
        metadata_json,
        created_at,
        updated_at
      )
      VALUES (
        $1,
        $2,
        $3,
        $4,
        $5,
        $6,
        $7,
        $8,
        $9,
        'open',
        $10::jsonb,
        $11,
        $11
      )
      RETURNING *
    `,
    [
      randomUUID(),
      input.joined?.organization_id ?? null,
      input.joined?.created_by_user_id ?? null,
      input.joined?.id ?? null,
      input.joined?.payment_intent_id ?? null,
      input.providerEventId,
      input.riskType,
      input.severity,
      input.decision,
      JSON.stringify(input.metadata),
      input.now,
    ],
  ).then((row) => row!);
}

async function appendPaymentSucceededOutboxEvent(
  db: SqlDatabase,
  input: {
    order: BillingOrderRow;
    paymentIntentId: string;
    providerEventId: string;
    now: Date;
  },
) {
  await db.query(
    `
      INSERT INTO outbox_events (
        id,
        organization_id,
        event_type,
        payload_json,
        status,
        available_at,
        created_at,
        updated_at
      )
      VALUES ($1, $2, $3, $4::jsonb, 'pending', $5, $5, $5)
    `,
    [
      randomUUID(),
      input.order.organization_id,
      eventTypes.paymentSucceeded,
      JSON.stringify({
        order_id: input.order.id,
        payment_intent_id: input.paymentIntentId,
        payment_provider_event_id: input.providerEventId,
        amount_minor: input.order.amount_minor,
        currency: input.order.currency,
      }),
      input.now,
    ],
  );
}

function packageViewFromRow(row: CreditPackageRow) {
  return {
    id: row.id,
    code: row.code,
    displayName: row.display_name,
    credits: row.credits,
    amountMinor: row.amount_minor,
    currency: row.currency,
    status: row.status,
  };
}

function orderViewFromRow(row: BillingOrderRow) {
  return {
    id: row.id,
    orderNo: row.order_no,
    status: row.status,
    creditPackageId: row.credit_package_id,
    packageSnapshot: normalizeJson(row.package_snapshot_json),
    credits: row.credits,
    amountMinor: row.amount_minor,
    currency: row.currency,
    paidAt: row.paid_at ? new Date(row.paid_at).toISOString() : null,
    successfulPaymentIntentId: row.successful_payment_intent_id,
    creditGrantLedgerEntryId: row.credit_grant_ledger_entry_id,
    expiresAt: new Date(row.expires_at).toISOString(),
  };
}

function paymentIntentViewFromRow(row: PaymentIntentRow) {
  return {
    id: row.id,
    orderId: row.order_id,
    provider: row.provider,
    productMode: row.product_mode,
    status: row.status,
    amountMinor: row.amount_minor,
    currency: row.currency,
    merchantOrderNo: row.merchant_order_no,
    providerTradeId: row.provider_trade_id,
    submittedAt: row.submitted_at ? new Date(row.submitted_at).toISOString() : null,
    succeededAt: row.succeeded_at ? new Date(row.succeeded_at).toISOString() : null,
    expiresAt: new Date(row.expires_at).toISOString(),
  };
}

function providerEventViewFromRow(row: ProviderEventRow) {
  return {
    id: row.id,
    provider: row.provider,
    providerEventDedupKey: row.provider_event_dedup_key,
    merchantOrderNo: row.merchant_order_no,
    eventType: row.event_type,
    signatureStatus: row.signature_status,
    processingStatus: row.processing_status,
    failureCode: row.failure_code,
  };
}

function riskEventViewFromRow(row: PaymentRiskEventRow) {
  return {
    id: row.id,
    organizationId: row.organization_id,
    orderId: row.order_id,
    paymentIntentId: row.payment_intent_id,
    providerEventId: row.provider_event_id,
    riskType: row.risk_type,
    severity: row.severity,
    decision: row.decision,
    status: row.status,
    metadata: normalizeJson(row.metadata_json),
    createdAt: new Date(row.created_at).toISOString(),
  };
}

function intentResponseBody(intent: PaymentIntentRow) {
  const paymentIntent = paymentIntentViewFromRow(intent);
  const metadata = normalizeJson(intent.provider_safe_metadata_json);
  return {
    paymentIntent,
    payAction: providerPayActionFromMetadata(metadata, intent),
  };
}

function providerPayActionFromMetadata(
  metadata: Record<string, unknown>,
  intent: PaymentIntentRow,
): ProviderPayAction {
  const payAction = metadata.payAction;
  if (isProviderPayAction(payAction, intent)) {
    return payAction;
  }

  if (intent.status === "unknown") {
    return manualConfirmPayAction(intent, stringMetadata(metadata, "failureCode"));
  }

  return {
    kind: "mock_qr",
    provider: intent.provider,
    merchantOrderNo: intent.merchant_order_no,
    amountMinor: intent.amount_minor,
    currency: intent.currency as "CNY",
  };
}

function isProviderPayAction(
  value: unknown,
  intent: PaymentIntentRow,
): value is ProviderPayAction {
  if (typeof value !== "object" || value === null) {
    return false;
  }
  const action = value as Record<string, unknown>;
  return (
    typeof action.kind === "string" &&
    action.provider === intent.provider &&
    action.merchantOrderNo === intent.merchant_order_no &&
    action.amountMinor === intent.amount_minor &&
    action.currency === intent.currency
  );
}

function stringMetadata(
  metadata: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = metadata[key];
  return typeof value === "string" ? value : undefined;
}

function hashJson(value: unknown) {
  return createHash("sha256").update(JSON.stringify(value)).digest("hex");
}

function callbackSignatureBase(input: PaymentCallbackSignatureInput) {
  return [
    input.provider,
    input.providerEventDedupKey,
    input.merchantOrderNo,
    input.providerTradeId,
    input.eventType,
    input.amountMinor,
    input.currency,
    input.merchantId,
  ].join("|");
}

function createOrderNo(now: Date) {
  const stamp = now.toISOString().replace(/[-:.TZ]/g, "").slice(0, 14);
  return `ORD-${stamp}-${randomUUID().slice(0, 8)}`;
}

function normalizeJson(value: Record<string, unknown> | string | null) {
  if (!value) {
    return {};
  }
  return typeof value === "string" ? JSON.parse(value) : value;
}

function mapCommerceError(error: unknown) {
  if (error instanceof CommercePaymentError) {
    const status = error.code === "credit_package_not_found" ? 404 : 409;
    return { status, body: { error: error.code } };
  }
  if (error instanceof IdempotencyConflictError) {
    return { status: 409, body: { error: error.code } };
  }
  if (error instanceof IdempotencyProcessingError) {
    return { status: 202, body: { error: error.code } };
  }
  if (error instanceof PaymentProviderError) {
    const status = error.code === "provider_not_enabled" ? 409 : 502;
    return { status, body: { error: error.code } };
  }
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof (error as { code?: unknown }).code === "string"
  ) {
    return { status: 403, body: { error: (error as { code: string }).code } };
  }
  throw error;
}
