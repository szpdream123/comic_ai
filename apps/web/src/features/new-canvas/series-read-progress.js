const SERIES_READ_SUMMARY = /已读取(原著|剧本) (\d+)-(\d+) 字（共 (\d+) 字/;

export function seriesReadChunkSummary(partLabel, offset, end, total, hasMore) {
  return `已读取${partLabel} ${offset + 1}-${end} 字（共 ${total} 字${hasMore ? `，nextOffset=${end}` : "，已读完"}）`;
}

export function seriesReadResumeCursor(steps = [], partLabel) {
  let cursor;
  for (const step of steps) {
    const text = String(step?.outputSummary || step?.toolCall?.resultSummary || step?.summary || "");
    const match = SERIES_READ_SUMMARY.exec(text);
    if (!match) continue;
    if (partLabel && match[1] !== partLabel) continue;
    const end = Number(match[3]);
    const total = Number(match[4]);
    if (!cursor || end > cursor.end) {
      cursor = {
        part: match[1],
        end,
        total,
        done: end >= total || text.includes("已读完"),
      };
    }
  }
  return cursor;
}

export function clampSeriesReadOffset(requestedOffset, cursor) {
  const offset = Math.max(0, Math.floor(Number(requestedOffset) || 0));
  if (!cursor) return offset;
  if (offset < cursor.end) return cursor.end;
  return offset;
}

export function seriesReadResumeHint(cursor) {
  if (!cursor) return "";
  if (cursor.done) {
    return `长文续读：${cursor.part}已读完 ${cursor.end}/${cursor.total} 字，不要再调用 series_read。`;
  }
  const part = cursor.part === "原著" ? "original" : "script";
  return `长文续读：${cursor.part}已读到 ${cursor.end}/${cursor.total} 字。下次必须 series_read({part:"${part}",offset:${cursor.end}})，禁止从 offset=0 重读已完成区间。`;
}

function parseSeriesReadPayload(content) {
  if (typeof content !== "string") return null;
  try {
    const payload = JSON.parse(content);
    const summary = String(payload?.summary ?? "");
    const result = String(payload?.result ?? "");
    if (SERIES_READ_SUMMARY.test(summary) || result.includes("--- 正文开始 ---")) return payload;
  } catch {}
  return null;
}

export function collapseStaleSeriesReadToolResults(messages = []) {
  let last = -1;
  const parsed = messages.map((message) => (
    message?.role === "tool" ? parseSeriesReadPayload(message.content) : null
  ));
  for (let index = 0; index < parsed.length; index += 1) {
    if (parsed[index]) last = index;
  }
  if (last < 0) return messages;
  for (let index = 0; index < last; index += 1) {
    const payload = parsed[index];
    if (!payload) continue;
    messages[index] = {
      ...messages[index],
      content: JSON.stringify({
        status: payload.status,
        summary: payload.summary,
        truncated: true,
        result: `（已折叠）${payload.summary || "已读过的原著分段"}`,
      }),
    };
  }
  return messages;
}
