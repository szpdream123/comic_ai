import { eventTypes } from "../domain/event-types.ts";
import { baseEnvelopeFields, type EventContract } from "./types.ts";

export const exportReadyEvent: EventContract = {
  eventType: eventTypes.exportReady,
  schemaVersion: 1,
  producer: "export",
  envelopeFields: [...baseEnvelopeFields, "project_id"],
  sourceIds: ["export_id", "workflow_id", "asset_version_id"],
  deduplicationKeys: ["export_id"],
  payloadShape: {
    export_id: "uuid",
    workflow_id: "uuid",
    asset_version_id: "uuid",
  },
  consumers: ["admin-ops"],
};

export const exportEventContracts = [exportReadyEvent];
