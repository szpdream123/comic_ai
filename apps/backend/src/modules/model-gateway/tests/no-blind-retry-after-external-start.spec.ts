import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { createMigratedTestDb } from "../../shared/db/test-db.ts";
import type { SqlDatabase } from "../../shared/db/sql.ts";
import {
  markExternalSubmissionStarted,
  createOrReuseProviderRequest,
  markProviderRequestResultUnknown,
  submitProviderRequest,
} from "../provider-request.service.ts";
import type { ProviderAdapter } from "../provider-adapter.contract.ts";

describe("provider request no blind retry after external start", () => {
  it("does not call the provider again once external submission has started", async () => {
    const db = await createMigratedTestDb();
    const adapter = new FailingIfCalledProviderAdapter();

    try {
      const prepared = await createOrReuseProviderRequest(db, providerInput());
      await markExternalSubmissionStarted(db, {
        providerRequestId: prepared.request.id,
        externalRequestId: "external-started",
        now: new Date("2026-05-09T10:01:00.000Z"),
      });

      const retry = await submitProviderRequest(db, {
        ...providerInput(),
        adapter,
        now: new Date("2026-05-09T10:02:00.000Z"),
      });

      assert.equal(retry.kind, "already_started");
      assert.equal(retry.request.id, prepared.request.id);
      assert.equal(retry.request.externalRequestId, "external-started");
      assert.equal(adapter.calls, 0);
    } finally {
      await db.close();
    }
  });

  it("makes the external submission transition one-way", async () => {
    const db = await createMigratedTestDb();

    try {
      const prepared = await createOrReuseProviderRequest(db, {
        ...providerInput(),
        requestKey: "task-transition:attempt-1",
        requestHash: "hash-transition",
        payloadHash: "payload-hash-transition",
        payloadRef: "payloads/task-transition.json",
      });
      const first = await markExternalSubmissionStarted(db, {
        providerRequestId: prepared.request.id,
        externalRequestId: "external-first",
        now: new Date("2026-05-09T10:03:00.000Z"),
      });
      const second = await markExternalSubmissionStarted(db, {
        providerRequestId: prepared.request.id,
        externalRequestId: "external-second",
        now: new Date("2026-05-09T10:04:00.000Z"),
      });

      assert.equal(first.externalRequestId, "external-first");
      assert.equal(second.externalRequestId, "external-first");
      assert.equal(
        second.externalSubmissionStartedAt?.toISOString(),
        "2026-05-09T10:03:00.000Z",
      );
    } finally {
      await db.close();
    }
  });

  it("recovers an external request id without submitting the provider request again", async () => {
    const db = await createMigratedTestDb();
    const adapter = new RecoveringProviderAdapter();
    try {
      const prepared = await createOrReuseProviderRequest(db, {
        ...providerInput(),
        requestKey: "task-recovery:attempt-1",
        requestHash: "hash-recovery",
        payloadHash: "payload-hash-recovery",
        payloadRef: "payloads/task-recovery.json",
      });
      await markExternalSubmissionStarted(db, {
        providerRequestId: prepared.request.id,
        externalRequestId: null,
        now: new Date("2026-05-09T10:05:00.000Z"),
      });
      await markProviderRequestResultUnknown(db, {
        providerRequestId: prepared.request.id,
        failureCode: "worker_crashed_after_external_start",
        now: new Date("2026-05-09T10:05:30.000Z"),
      });

      const retry = await submitProviderRequest(db, {
        ...providerInput(),
        requestKey: "task-recovery:attempt-1",
        requestHash: "hash-recovery",
        payloadHash: "payload-hash-recovery",
        payloadRef: "payloads/task-recovery.json",
        adapter,
        now: new Date("2026-05-09T10:06:00.000Z"),
      });

      assert.equal(retry.kind, "submitted");
      assert.equal(retry.request.externalRequestId, "external-recovered");
      assert.equal(adapter.submitCalls, 0);
      assert.equal(adapter.recoveryCalls, 1);
    } finally {
      await db.close();
    }
  });

  it("keeps an active submitted request in progress when recovery has no external request id yet", async () => {
    const db = await createMigratedTestDb();
    const adapter = new MissingRecoveryProviderAdapter();

    try {
      const input = {
        ...providerInput(),
        requestKey: "task-active-submission:attempt-1",
        requestHash: "hash-active-submission",
        payloadHash: "payload-hash-active-submission",
        payloadRef: "payloads/task-active-submission.json",
      };
      const prepared = await createOrReuseProviderRequest(db, input);
      await markExternalSubmissionStarted(db, {
        providerRequestId: prepared.request.id,
        externalRequestId: null,
        now: new Date("2026-05-09T10:07:00.000Z"),
      });

      const retry = await submitProviderRequest(db, {
        ...input,
        adapter,
        now: new Date("2026-05-09T10:08:00.000Z"),
      });

      assert.equal(retry.kind, "already_started");
      assert.equal(retry.request.status, "submitted");
      assert.equal(retry.request.externalRequestId, null);
      assert.equal(adapter.submitCalls, 0);
      assert.equal(adapter.recoveryCalls, 0);
    } finally {
      await db.close();
    }
  });

  it("fails a legacy result_unknown request when recovery still returns no external request id", async () => {
    const db = await createMigratedTestDb();
    const adapter = new MissingRecoveryProviderAdapter();

    try {
      const input = {
        ...providerInput(),
        requestKey: "task-missing-recovery:attempt-1",
        requestHash: "hash-missing-recovery",
        payloadHash: "payload-hash-missing-recovery",
        payloadRef: "payloads/task-missing-recovery.json",
      };
      const prepared = await createOrReuseProviderRequest(db, input);
      await markExternalSubmissionStarted(db, {
        providerRequestId: prepared.request.id,
        externalRequestId: null,
        now: new Date("2026-05-09T10:07:00.000Z"),
      });
      await markProviderRequestResultUnknown(db, {
        providerRequestId: prepared.request.id,
        failureCode: "worker_crashed_after_external_start",
        now: new Date("2026-05-09T10:08:00.000Z"),
      });

      await assert.rejects(
        submitProviderRequest(db, {
          ...input,
          adapter,
          now: new Date("2026-05-09T10:09:00.000Z"),
        }),
        (error: unknown) => {
          assert.equal((error as { failureCode?: string }).failureCode, "provider_submission_missing_task_id");
          return true;
        },
      );

      const request = await db.query<{ status: string; failure_code: string | null }>(
        "SELECT status, failure_code FROM provider_requests WHERE id = $1",
        [prepared.request.id],
      );
      assert.deepEqual(request.rows[0], {
        status: "failed",
        failure_code: "provider_submission_missing_task_id",
      });
      assert.equal(adapter.submitCalls, 0);
      assert.equal(adapter.recoveryCalls, 1);
    } finally {
      await db.close();
    }
  });

  it("fails a legacy result_unknown request when recovery throws", async () => {
    const db = await createMigratedTestDb();
    const adapter = new ThrowingRecoveryProviderAdapter();

    try {
      const input = legacyRecoveryInput("throwing-recovery");
      const prepared = await seedResultUnknownRequest(db, input);

      await assert.rejects(
        submitProviderRequest(db, {
          ...input,
          adapter,
          now: new Date("2026-05-09T10:09:00.000Z"),
        }),
        hasMissingTaskIdFailure,
      );

      await assertProviderRequestFailedWithoutTaskId(db, prepared.request.id);
      assert.equal(adapter.submitCalls, 0);
      assert.equal(adapter.recoveryCalls, 1);
    } finally {
      await db.close();
    }
  });

  it("fails a legacy result_unknown request when recovery returns a blank external request id", async () => {
    const db = await createMigratedTestDb();
    const adapter = new BlankRecoveryProviderAdapter();

    try {
      const input = legacyRecoveryInput("blank-recovery");
      const prepared = await seedResultUnknownRequest(db, input);

      await assert.rejects(
        submitProviderRequest(db, {
          ...input,
          adapter,
          now: new Date("2026-05-09T10:09:00.000Z"),
        }),
        hasMissingTaskIdFailure,
      );

      await assertProviderRequestFailedWithoutTaskId(db, prepared.request.id);
      assert.equal(adapter.submitCalls, 0);
      assert.equal(adapter.recoveryCalls, 1);
    } finally {
      await db.close();
    }
  });

  it("allows only one concurrent recovery call for a legacy result_unknown request", async () => {
    const db = await createMigratedTestDb();
    const adapter = new BlockingRecoveryProviderAdapter();

    try {
      const input = legacyRecoveryInput("concurrent-recovery");
      const prepared = await seedResultUnknownRequest(db, input);
      const first = submitProviderRequest(db, {
        ...input,
        adapter,
        now: new Date("2026-05-09T10:09:00.000Z"),
      });
      await adapter.started;

      const second = await submitProviderRequest(db, {
        ...input,
        adapter,
        now: new Date("2026-05-09T10:09:01.000Z"),
      });
      adapter.release();
      const recovered = await first;

      assert.equal(second.kind, "already_started");
      assert.equal(second.request.status, "submitted");
      assert.equal(recovered.kind, "submitted");
      assert.equal(recovered.request.externalRequestId, "external-concurrent-recovered");
      assert.equal(adapter.submitCalls, 0);
      assert.equal(adapter.recoveryCalls, 1);

      const request = await db.query<{ status: string; external_request_id: string | null }>(
        "SELECT status, external_request_id FROM provider_requests WHERE id = $1",
        [prepared.request.id],
      );
      assert.deepEqual(request.rows[0], {
        status: "accepted",
        external_request_id: "external-concurrent-recovered",
      });
    } finally {
      adapter.release();
      await db.close();
    }
  });

  it("reclaims a stale provider submission recovery lease", async () => {
    const db = await createMigratedTestDb();
    const adapter = new RecoveringProviderAdapter();

    try {
      const input = legacyRecoveryInput("stale-recovery-lease");
      const prepared = await seedResultUnknownRequest(db, input);
      await db.query(
        `
          UPDATE provider_requests
          SET status = 'submitted',
              failure_code = 'provider_submission_recovery_in_progress',
              updated_at = $2
          WHERE id = $1
        `,
        [prepared.request.id, new Date("2026-05-09T09:55:00.000Z")],
      );

      const recovered = await submitProviderRequest(db, {
        ...input,
        adapter,
        now: new Date("2026-05-09T10:09:00.000Z"),
      });

      assert.equal(recovered.kind, "submitted");
      assert.equal(recovered.request.externalRequestId, "external-recovered");
      assert.equal(adapter.submitCalls, 0);
      assert.equal(adapter.recoveryCalls, 1);
    } finally {
      await db.close();
    }
  });

  it("prevents a stale recovery claimant from overwriting a newer accepted result", async () => {
    const db = await createMigratedTestDb();
    const staleAdapter = new BlockingMissingRecoveryProviderAdapter();
    const freshAdapter = new RecoveringProviderAdapter();

    try {
      const input = legacyRecoveryInput("stale-recovery-claimant");
      const prepared = await seedResultUnknownRequest(db, input);
      const stale = submitProviderRequest(db, {
        ...input,
        adapter: staleAdapter,
        now: new Date("2026-05-09T10:09:00.000Z"),
      });
      await staleAdapter.started;

      const fresh = await submitProviderRequest(db, {
        ...input,
        adapter: freshAdapter,
        now: new Date("2026-05-09T10:20:00.000Z"),
      });
      staleAdapter.release();
      const staleResult = await stale;

      assert.equal(fresh.kind, "submitted");
      assert.equal(fresh.request.externalRequestId, "external-recovered");
      assert.equal(staleResult.kind, "already_started");
      assert.equal(staleResult.request.status, "accepted");
      assert.equal(staleResult.request.externalRequestId, "external-recovered");
      assert.equal(staleAdapter.recoveryCalls, 1);
      assert.equal(freshAdapter.recoveryCalls, 1);

      const request = await db.query<{
        status: string;
        external_request_id: string | null;
        failure_code: string | null;
      }>(
        "SELECT status, external_request_id, failure_code FROM provider_requests WHERE id = $1",
        [prepared.request.id],
      );
      assert.deepEqual(request.rows[0], {
        status: "accepted",
        external_request_id: "external-recovered",
        failure_code: null,
      });
    } finally {
      staleAdapter.release();
      await db.close();
    }
  });

  it("does not return artifacts from a stale recovery claimant", async () => {
    const db = await createMigratedTestDb();
    const staleAdapter = new BlockingAlternativeRecoveryProviderAdapter();
    const freshAdapter = new RecoveringProviderAdapter();

    try {
      const input = legacyRecoveryInput("stale-recovery-artifact");
      await seedResultUnknownRequest(db, input);
      const stale = submitProviderRequest(db, {
        ...input,
        adapter: staleAdapter,
        now: new Date("2026-05-09T10:09:00.000Z"),
      });
      await staleAdapter.started;

      const fresh = await submitProviderRequest(db, {
        ...input,
        adapter: freshAdapter,
        now: new Date("2026-05-09T10:20:00.000Z"),
      });
      staleAdapter.release();
      const staleResult = await stale;

      assert.equal(fresh.kind, "submitted");
      assert.equal(fresh.request.externalRequestId, "external-recovered");
      assert.deepEqual(staleResult, {
        kind: "already_started",
        request: fresh.request,
      });
    } finally {
      staleAdapter.release();
      await db.close();
    }
  });

  it("preserves a returned external request id when acceptance persistence fails", async () => {
    const db = await createMigratedTestDb();
    const adapter = new SuccessfulProviderAdapter();
    let acceptanceWrites = 0;
    const failingDb: SqlDatabase = {
      async query<T>(sql: string, params?: unknown[]) {
        if (
          sql.includes("SET status = $2")
          && sql.includes("external_request_id = $3")
          && sql.includes("provider_requests")
        ) {
          acceptanceWrites += 1;
          throw new Error("simulated_acceptance_write_failure");
        }
        return db.query<T>(sql, params);
      },
    };

    try {
      const input = legacyRecoveryInput("acceptance-persist-failure");
      await assert.rejects(
        submitProviderRequest(failingDb, {
          ...input,
          adapter,
          now: new Date("2026-05-09T10:09:00.000Z"),
        }),
        (error: unknown) => {
          assert.equal((error as { failureCode?: string }).failureCode, "provider_submission_persist_failed");
          return true;
        },
      );

      const request = await db.query<{
        status: string;
        external_request_id: string | null;
        failure_code: string | null;
      }>(
        "SELECT status, external_request_id, failure_code FROM provider_requests WHERE request_key = $1",
        [input.requestKey],
      );
      assert.deepEqual(request.rows[0], {
        status: "result_unknown",
        external_request_id: "external-submitted",
        failure_code: "provider_submission_persist_failed",
      });
      assert.equal(acceptanceWrites, 1);
      assert.equal(adapter.submitCalls, 1);
    } finally {
      await db.close();
    }
  });
});

class FailingIfCalledProviderAdapter implements ProviderAdapter {
  calls = 0;

  async submit(): Promise<never> {
    this.calls += 1;
    throw new Error("provider_should_not_be_called");
  }
}

class SuccessfulProviderAdapter implements ProviderAdapter {
  submitCalls = 0;

  async submit() {
    this.submitCalls += 1;
    return {
      externalRequestId: "external-submitted",
      status: "accepted" as const,
      redactedResponse: { providerStatus: "submitted" },
    };
  }
}

class RecoveringProviderAdapter implements ProviderAdapter {
  submitCalls = 0;
  recoveryCalls = 0;

  async submit(): Promise<never> {
    this.submitCalls += 1;
    throw new Error("provider_should_not_be_called");
  }

  async recoverSubmission() {
    this.recoveryCalls += 1;
    return {
      externalRequestId: "external-recovered",
      status: "accepted" as const,
      redactedResponse: { providerStatus: "submission_recovered" },
    };
  }
}

class MissingRecoveryProviderAdapter implements ProviderAdapter {
  submitCalls = 0;
  recoveryCalls = 0;

  async submit(): Promise<never> {
    this.submitCalls += 1;
    throw new Error("provider_should_not_be_called");
  }

  async recoverSubmission() {
    this.recoveryCalls += 1;
    return null;
  }
}

class ThrowingRecoveryProviderAdapter extends MissingRecoveryProviderAdapter {
  override async recoverSubmission(): Promise<never> {
    this.recoveryCalls += 1;
    throw new Error("provider_recovery_network_error");
  }
}

class BlankRecoveryProviderAdapter extends MissingRecoveryProviderAdapter {
  override async recoverSubmission() {
    this.recoveryCalls += 1;
    return {
      externalRequestId: "   ",
      status: "accepted" as const,
    };
  }
}

class BlockingRecoveryProviderAdapter extends MissingRecoveryProviderAdapter {
  private releaseRecovery!: () => void;
  readonly started: Promise<void>;
  protected readonly recoveryReleased: Promise<void>;

  constructor() {
    super();
    let markStarted!: () => void;
    this.started = new Promise<void>((resolve) => {
      markStarted = resolve;
    });
    this.recoveryReleased = new Promise<void>((resolve) => {
      this.releaseRecovery = resolve;
    });
    this.markStarted = markStarted;
  }

  protected readonly markStarted: () => void;

  override async recoverSubmission() {
    this.recoveryCalls += 1;
    this.markStarted();
    await this.recoveryReleased;
    return {
      externalRequestId: "external-concurrent-recovered",
      status: "accepted" as const,
    };
  }

  release() {
    this.releaseRecovery();
  }
}

class BlockingMissingRecoveryProviderAdapter extends BlockingRecoveryProviderAdapter {
  override async recoverSubmission() {
    this.recoveryCalls += 1;
    this.markStarted();
    await this.recoveryReleased;
    return null;
  }
}

class BlockingAlternativeRecoveryProviderAdapter extends BlockingRecoveryProviderAdapter {
  override async recoverSubmission() {
    this.recoveryCalls += 1;
    this.markStarted();
    await this.recoveryReleased;
    return {
      externalRequestId: "external-stale-recovered",
      status: "accepted" as const,
      artifacts: [{ mediaType: "image" as const, url: "https://example.invalid/stale.png" }],
    };
  }
}

function legacyRecoveryInput(suffix: string) {
  return {
    ...providerInput(),
    requestKey: `task-${suffix}:attempt-1`,
    requestHash: `hash-${suffix}`,
    payloadHash: `payload-hash-${suffix}`,
    payloadRef: `payloads/task-${suffix}.json`,
  };
}

async function seedResultUnknownRequest(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  input: ReturnType<typeof legacyRecoveryInput>,
) {
  const prepared = await createOrReuseProviderRequest(db, input);
  await markExternalSubmissionStarted(db, {
    providerRequestId: prepared.request.id,
    externalRequestId: null,
    now: new Date("2026-05-09T10:07:00.000Z"),
  });
  await markProviderRequestResultUnknown(db, {
    providerRequestId: prepared.request.id,
    failureCode: "worker_crashed_after_external_start",
    now: new Date("2026-05-09T10:08:00.000Z"),
  });
  return prepared;
}

function hasMissingTaskIdFailure(error: unknown) {
  assert.equal((error as { failureCode?: string }).failureCode, "provider_submission_missing_task_id");
  return true;
}

async function assertProviderRequestFailedWithoutTaskId(
  db: Awaited<ReturnType<typeof createMigratedTestDb>>,
  providerRequestId: string,
) {
  const request = await db.query<{ status: string; failure_code: string | null }>(
    "SELECT status, failure_code FROM provider_requests WHERE id = $1",
    [providerRequestId],
  );
  assert.deepEqual(request.rows[0], {
    status: "failed",
    failure_code: "provider_submission_missing_task_id",
  });
}

function providerInput() {
  return {
    projectId: null,
    providerName: "mock-image",
    providerOperation: "shot.image.generate",
    requestKey: "task-2:attempt-1",
    requestHash: "hash-2",
    payloadRef: "payloads/task-2.json",
    payloadHash: "payload-hash-2",
    redactedPayload: { prompt: "[redacted]" },
    createdByUserId: null,
    now: new Date("2026-05-09T10:00:00.000Z"),
  };
}
