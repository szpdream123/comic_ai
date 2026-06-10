export function validateCanvasConnection(sourcePort, targetPort) {
  if (!sourcePort || !targetPort) {
    return { ok: false, reason: "canvas_connection_port_missing" };
  }
  if (sourcePort.direction !== "out" || targetPort.direction !== "in") {
    return { ok: false, reason: "canvas_connection_direction_invalid" };
  }
  if (sourcePort.kind !== targetPort.kind && targetPort.kind !== "any") {
    return { ok: false, reason: "canvas_connection_kind_mismatch" };
  }
  return { ok: true };
}
