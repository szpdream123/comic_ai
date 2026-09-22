const TABLE_LABEL = /视频(场景|角色|道具)对照表\s*[:：]/gu;
const ASSET_KINDS = { 场景: "scene", 角色: "character", 道具: "prop" };

// Import-only: the existing composer pipeline owns image collection and numbering.
// This compiler reuses resolved attachments, never generates a new attachment order.
export function bindStoryboardBodyAssetMentions({ prompt, sourcePrompt = prompt, imageCount = 0, assets = [], selectedAssets = [], normalizeName = (name) => name.trim() }) {
  const text = String(prompt ?? "");
  const rows = readAssetTable(text);
  const requiredNames = readRequiredAssetNames(String(sourcePrompt ?? ""));
  if (!rows.length && !requiredNames.length) return { prompt: text, warning: "" };
  const sourceRows = readAssetTable(String(sourcePrompt ?? ""));
  const bindings = new Map();
  const unresolved = new Set();
  const ambiguous = new Set();
  for (const [index, row] of rows.entries()) {
    const images = [...row.value.matchAll(/【@图\s*(\d+)】/gu)].map((match) => Number(match[1]));
    const uniqueImages = new Set(images);
    const imageIndex = images[0];
    const token = imageIndex >= 1 && imageIndex <= imageCount ? `【@图${imageIndex}】` : "";
    if (uniqueImages.size > 1) ambiguous.add(row.name);
    const source = sourceRows[index];
    const explicitTargets = [...row.value.matchAll(/【@([^】]+)】/gu)];
    if (explicitTargets.some((match) => !/^图\s*\d+$/u.test(match[1]))) unresolved.add(row.name);
    const targetName = source?.value.match(/^(?:【@([^】]+)】|@([^\s；;，,]+))/u);
    const lookupName = String(targetName?.[1] ?? targetName?.[2] ?? row.name).trim();
    const candidates = assets.filter((asset) => asset.kind === row.kind && asset.names.some((name) => normalizeName(name) === normalizeName(lookupName)));
    const identities = new Set(candidates.map((asset) => asset.url || asset.id).filter(Boolean));
    const selected = candidates.filter((asset) => selectedAssets.some((item) => (
      (asset.id && item.id === asset.id) || (asset.url && item.url === asset.url)
    )));
    const selectedIdentities = new Set(selected.map((asset) => asset.url || asset.id).filter(Boolean));
    if (identities.size > 1 && selectedIdentities.size !== 1) ambiguous.add(row.name);
    if (!token) unresolved.add(row.name);
    if (bindings.has(row.name) && bindings.get(row.name) !== token) ambiguous.add(row.name);
    bindings.set(row.name, token);
  }
  for (const name of requiredNames) {
    if (bindings.has(name)) continue;
    const candidates = assets.filter((asset) => asset.names.some((alias) => normalizeName(alias) === normalizeName(name)));
    if (candidates.length && candidates.every((asset) => asset.kind === "audio" || asset.kind === "video")) continue;
    const selected = candidates.filter((asset) => selectedAssets.some((item) => (
      (asset.id && item.id === asset.id) || (asset.url && item.url === asset.url)
    )));
    const selectedIdentities = new Set(selected.map((asset) => asset.url || asset.id));
    const resolved = selectedIdentities.size === 1 ? selected : candidates;
    const identities = new Set(resolved.map((asset) => asset.url || asset.id));
    const indexes = new Set(resolved.map((asset) => asset.imageIndex).filter((index) => index >= 1 && index <= imageCount));
    if (identities.size > 1 || indexes.size > 1) ambiguous.add(name);
    else if (indexes.size !== 1) unresolved.add(name);
    bindings.set(name, indexes.size === 1 ? `【@图${[...indexes][0]}】` : "");
  }
  for (const name of [...unresolved, ...ambiguous]) bindings.set(name, "");

  // Longest known name wins, including undeclared names, to avoid turning 苏晚晚
  // into a 苏晚 token followed by 晚. Only declared or explicitly mentioned names get replacements.
  const names = [...new Set([...bindings.keys(), ...assets.flatMap((asset) => asset.names)])]
    .filter(Boolean)
    .sort((left, right) => right.length - left.length);
  const namePattern = names.map(escapePattern).join("|");
  const pattern = new RegExp(`【@[^】]*】|【(?:镜头\\s*\\d+|总时长|场景分析|分镜承接|资产对照表)】|(?:https?:\\/\\/|[\\w.+-]+@)[^\\s，。；;]*|${namePattern}`, "gu");
  const compiled = text.split(/(\r?\n|<br\s*\/?>)/iu).map((line) => {
    const tableStart = line.search(/视频(?:场景|角色|道具)对照表\s*[:：]/u);
    const body = tableStart >= 0 ? line.slice(0, tableStart) : line;
    return body.replace(pattern, (name, offset) => {
      const token = bindings.get(name);
      if (!token) return name;
      // Preserve bare explicit mentions and Latin names embedded in longer words.
      if (line[offset - 1] === "@" || (/^[\w]/u.test(name) && /[\w]/u.test(line[offset - 1] ?? "")) ||
          (/[\w]$/u.test(name) && /[\w]/u.test(line[offset + name.length] ?? ""))) return name;
      return token;
    }) + (tableStart >= 0 ? line.slice(tableStart) : "");
  }).join("");
  const warning = [
    unresolved.size ? `以下资产未匹配到可用图片，已保留原名称：${[...unresolved].join("、")}。请补充图片，或在对话框中手动输入 @ 选择引用` : "",
    ambiguous.size ? `以下资产名称存在歧义，已保留原名称：${[...ambiguous].join("、")}。请在对话框中手动选择 @ 引用` : "",
  ].filter(Boolean).join("；");
  return { prompt: compiled, warning };
}

function readRequiredAssetNames(prompt) {
  const names = new Set();
  let inAssetList = false;
  for (const line of prompt.split(/\r?\n|<br\s*\/?>/iu)) {
    if (/^\s*(?:出场资产锁|所需资产)\s*[:：]\s*$/u.test(line)) {
      inAssetList = true;
      continue;
    }
    if (/视频(?:场景|角色|道具)对照表\s*[:：]/u.test(line)) continue;
    if (/^\s*(?:光影基调池|物理状态遗留|主光方向|光质与光比|色温逻辑|阴影策略)\s*[:：]/u.test(line)) inAssetList = false;
    if (inAssetList) {
      const entry = /^\s*(?:【@([^】]+)】|([^:：<>【】]+))\s*[:：]\s*(.+)$/u.exec(line);
      if (!entry) inAssetList = false;
      else names.add(String(entry[1] ?? entry[2]).replace(/^@/u, "").trim());
    }
    for (const match of line.matchAll(/【@([^】]+)】|(?:^|[=＝:：,，;；、!?！？\s(（"'“”‘’「」『』])@([^\s@【】,，。；;：:!?！？()（）"'“”‘’「」『』]+)/gu)) {
      const name = String(match[1] ?? match[2]).trim();
      if (!/^(?:图(?:片)?|视频|音频)\s*\d+(?:\s*中的(?:场景|角色|道具)形象)?$/u.test(name)) names.add(name);
    }
  }
  return [...names].filter(Boolean);
}

function readAssetTable(prompt) {
  const rows = [];
  for (const line of prompt.split(/\r?\n|<br\s*\/?>/iu)) {
    const labels = [...line.matchAll(TABLE_LABEL)];
    for (const [index, label] of labels.entries()) {
      const content = line.slice(label.index + label[0].length, labels[index + 1]?.index ?? line.length);
      for (const entry of content.split(/[；;]/u)) {
        const pair = /^\s*([^=＝]+?)\s*[=＝]\s*(.+?)\s*$/u.exec(entry);
        if (!pair) continue;
        const name = pair[1].trim();
        if (!name || name === "无") continue;
        rows.push({ name, kind: ASSET_KINDS[label[1]], value: pair[2] });
      }
    }
  }
  return rows;
}

function escapePattern(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");
}
