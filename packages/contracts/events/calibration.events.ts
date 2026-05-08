import { eventTypes } from "../domain/event-types.ts";
import { baseEnvelopeFields, type EventContract } from "./types.ts";

export const calibrationPassedEvent: EventContract = {
  eventType: eventTypes.calibrationPassed,
  schemaVersion: 1,
  producer: "quality-review",
  envelopeFields: [...baseEnvelopeFields, "project_id"],
  sourceIds: [
    "calibration_session_id",
    "calibration_decision_id",
    "decision_source",
  ],
  deduplicationKeys: ["calibration_decision_id"],
  payloadShape: {
    calibration_session_id: "uuid",
    calibration_decision_id: "uuid",
    decision_source: "actor|system|override",
  },
  consumers: ["shot", "project", "admin-ops"],
};

export const calibrationEventContracts = [calibrationPassedEvent];
