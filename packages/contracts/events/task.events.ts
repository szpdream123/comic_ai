import { eventTypes } from "../domain/event-types.ts";
import { baseEnvelopeFields, type EventContract } from "./types.ts";

export const taskSucceededEvent: EventContract = {
  eventType: eventTypes.taskSucceeded,
  schemaVersion: 1,
  producer: "workflow-task",
  envelopeFields: [...baseEnvelopeFields, "project_id"],
  sourceIds: [
    "workflow_id",
    "task_id",
    "attempt_id",
    "target_entity_type",
    "target_entity_id",
  ],
  deduplicationKeys: ["task_id", "attempt_id"],
  payloadShape: {
    workflow_id: "uuid",
    task_id: "uuid",
    attempt_id: "uuid",
    provider_request_id: "uuid?",
    target_entity_type: "string",
    target_entity_id: "uuid",
  },
  consumers: ["shot", "asset", "credit-billing", "admin-ops"],
};

export const taskFailedEvent: EventContract = {
  eventType: eventTypes.taskFailed,
  schemaVersion: 1,
  producer: "workflow-task",
  envelopeFields: [...baseEnvelopeFields, "project_id"],
  sourceIds: ["workflow_id", "task_id", "attempt_id", "failure_code"],
  deduplicationKeys: ["task_id", "attempt_id"],
  payloadShape: {
    workflow_id: "uuid",
    task_id: "uuid",
    attempt_id: "uuid",
    failure_code: "stable error code",
  },
  consumers: ["credit-billing", "admin-ops"],
};

export const taskEventContracts = [taskSucceededEvent, taskFailedEvent];
