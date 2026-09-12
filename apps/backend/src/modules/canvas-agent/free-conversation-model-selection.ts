type Model = { model_code: string; display_name: string; media_type: string; status: string };
const record = (value: unknown): Record<string, unknown> => value && typeof value === "object" ? value as Record<string, unknown> : {};
// Only explicit selection phrases count; a model mentioned in an assistant reply is not a user choice.
const selection = /(?:不要|别|不想|不能)?(?:使用|采用|选用|改用|换成|切换到|指定|用)\s*[「“"']?([a-z\u4e00-\u9fff][a-z0-9_.\u4e00-\u9fff-]*(?:\s+\d[\d.]*)?)/gi;
const requests = (text: string) => [...text.matchAll(selection)].filter(match => !/^(?:不要|别|不想|不能)/.test(match[0]) && !/(?:不|无需)$/.test(text.slice(0, match.index)));
export function hasConversationModelRequest(messages: unknown) {
  return Array.isArray(messages) && messages.some(message => record(message).role === "user" && requests(String(record(record(message).content).text ?? "")).length > 0);
}

export function resolveConversationModelSelection(messages: unknown, catalog: Model[], defaults: Record<string, string>) {
  const models = { ...defaults };
  const snapshots: Record<string, string> = {};
  let error = "";
  const normalize = (value: string) => value.toLowerCase().replace(/\s+/g, "");
  for (const raw of Array.isArray(messages) ? messages : []) {
    const message = record(raw);
    if (message.role !== "user") continue;
    const content = record(message.content);
    for (const [kind, code] of Object.entries(record(content.preferredModels))) {
      if (!["image", "video", "audio"].includes(kind) || typeof code !== "string" || !code) continue;
      if (snapshots[kind] && snapshots[kind] !== code) { models[kind] = code; error = ""; }
      snapshots[kind] = code;
    }
    const text = String(content.text ?? content.message ?? "");
    for (const match of requests(text)) {
      const name = normalize(match[1]);
      const tail = normalize(text.slice(match.index! + match[0].lastIndexOf(match[1])));
      const candidates = catalog.map(model => ({ model, length: Math.max(0, ...[model.model_code, model.display_name.replace(/[（(].*$/, ""), model.model_code.replace(/-(?:r2v|i2v|t2v)$/, "")].map(alias => {
        const key = normalize(alias);
        return key && tail.startsWith(key) && !/[a-z0-9_.-]/.test(tail.charAt(key.length)) ? key.length : 0;
      })) }));
      const longest = Math.max(0, ...candidates.map(candidate => candidate.length));
      const matches = candidates.filter(candidate => candidate.length > 0 && candidate.length === longest).map(candidate => candidate.model);
      // Numbers also occur in sizes, durations and script instructions. Only an
      // explicit model context or a versioned model name warrants this error.
      const modelContext = /模型\s*[：:]?\s*$/.test(text.slice(0, match.index))
        || /^[a-z][a-z0-9_.-]*(?:\s+[a-z0-9_.-]+)*\s*模型/i.test(text.slice(match.index! + match[0].lastIndexOf(match[1])));
      const versionedModel = /^[a-z][a-z_-]*\d+\.\d+/i.test(name);
      const knownModelFamily = catalog.some(model => [model.model_code, model.display_name.replace(/[（(].*$/, "")].some(alias => {
        const family = normalize(alias).match(/^([^\d]+)\d/)?.[1];
        return family && name.startsWith(family) && /^\d/.test(name.slice(family.length));
      }));
      if (!matches.length && !modelContext && !versionedModel && !knownModelFamily) continue;
      if (matches.length !== 1 || matches[0].status !== "active") {
        error = `无法确定可用的「${match[1]}」模型，请在输入区选择具体模型后继续。此次尚未提交生成。`;
        continue;
      }
      models[matches[0].media_type] = matches[0].model_code;
      error = "";
    }
  }
  return { models, error };
}
