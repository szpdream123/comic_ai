import { eventTypes } from "../domain/event-types.ts";
import { baseEnvelopeFields, type EventContract } from "./types.ts";

export const workflowCompletedEvent: EventContract = {
  eventType: eventTypes.workflowCompleted,
  schemaVersion: 1,
  producer: "workflow-task",
  envelopeFields: [...baseEnvelopeFields, "project_id"],
  sourceIds: ["workflow_id", "final_workflow_status"],
  deduplicationKeys: ["workflow_id"],
  payloadShape: {
    workflow_id: "uuid",
    final_workflow_status: "workflow status",
    child_task_summary: "array",
  },
  consumers: ["project", "admin-ops"],
};

export const workflowEventContracts = [workflowCompletedEvent];
