export function validateCanvasConnection(sourcePort, targetPort) {
  if (!sourcePort || !targetPort) {
    return { ok: false, reason: "canvas_connection_port_missing" };
  }
  if (sourcePort.direction !== "out" || targetPort.direction !== "in") {
    return { ok: false, reason: "canvas_connection_direction_invalid" };
  }
  const targetAccepts = Array.isArray(targetPort.accepts) ? targetPort.accepts : [];
  if (sourcePort.kind !== targetPort.kind && targetPort.kind !== "any" && !targetAccepts.includes(sourcePort.kind)) {
    return { ok: false, reason: "canvas_connection_kind_mismatch" };
  }
  return { ok: true };
}
