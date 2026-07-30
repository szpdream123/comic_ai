const MENTION_TOKEN_PATTERN = /\u3010@([^\u3011]+)\u3011/g;

export function createPromptEditorDocument(prompt = "", mentionReferences = []) {
  const references = Array.isArray(mentionReferences) ? mentionReferences : [];
  const referenceByName = new Map();
  for (const reference of references) {
    const name = normalizeMentionLabel(reference?.name ?? labelFromMentionToken(reference?.token));
    if (name && !referenceByName.has(name)) {
      referenceByName.set(name, reference);
    }
  }

  const paragraphs = String(prompt ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => ({
      type: "paragraph",
      content: parsePromptLine(line, referenceByName),
    }));

  return {
    type: "doc",
    content: paragraphs.length ? paragraphs : [{ type: "paragraph" }],
  };
}

export function serializePromptEditorDocument(document = null) {
  if (!document || typeof document !== "object") {
    return "";
  }
  if (document.type !== "doc") {
    return serializePromptNode(document);
  }
  return (document.content ?? []).map((node) => serializePromptNode(node)).join("\n");
}

export function collectPromptEditorMentions(document = null) {
  const mentions = [];
  walkPromptNodes(document, (node) => {
    if (node?.type !== "assetMention") {
      return;
    }
    const attrs = normalizeMentionAttributes(node.attrs ?? {});
    if (attrs.label) {
      mentions.push(attrs);
    }
  });
  return mentions;
}

export function promptEditorMentionSignature(mentions = []) {
  return (Array.isArray(mentions) ? mentions : [])
    .map((mention) => {
      const attrs = normalizeMentionAttributes(mention ?? {});
      return [attrs.referenceId, attrs.assetId, attrs.assetKind, attrs.label].join(":");
    })
    .join("|");
}

export function normalizePromptEditorSuggestion(item = {}) {
  const label = normalizeMentionLabel(item.label ?? item.name ?? item.id ?? "\u7d20\u6750");
  const assetKind = String(item.assetKind ?? item.kind ?? "character").trim() || "character";
  const assetId = String(item.assetId ?? item.id ?? "").trim();
  const referenceId = String(
    item.referenceId ?? `mention-ref:${assetKind}:${assetId || label}`,
  ).trim();
  const source = resolvePromptEditorMentionMediaSource(item, assetKind);
  return {
    ...item,
    id: assetId || referenceId,
    assetId,
    assetKind,
    label,
    name: label,
    preview: resolvePromptEditorMentionPreview(item, assetKind),
    ...(source ? { source } : {}),
    description: String(item.description ?? "").trim(),
    referenceId,
  };
}

export function resolvePromptEditorMentionPreview(item = {}, assetKind = null) {
  const kind = String(assetKind ?? item.assetKind ?? item.kind ?? "character").trim() || "character";
  const genericCandidates = [item.preview, item.previewUrl];
  if (kind !== "audio" && kind !== "video") {
    return firstPreviewValue([
      ...genericCandidates,
      item.fixedImageUrl,
      item.imageUrl,
      item.thumbnailUrl,
      item.posterUrl,
      item.coverImageUrl,
      item.publicUrl,
      item.sourceUrl,
      item.src,
      item.url,
      item.downloadUrl,
      item.latestVersion?.previewUrl,
      item.latestVersion?.metadata?.previewUrl,
      item.latestVersion?.metadata?.fixedImageUrl,
    ]);
  }
  const explicitImagePreview = firstPreviewValue([
    item.thumbnailUrl,
    item.thumbnail,
    item.posterUrl,
    item.poster,
    item.coverImageUrl,
    item.coverUrl,
    item.fixedImageUrl,
    item.imageUrl,
    item.publicUrl,
    item.sourceUrl,
    item.src,
    item.url,
    item.downloadUrl,
    item.latestVersion?.previewUrl,
    item.latestVersion?.thumbnailUrl,
    item.latestVersion?.metadata?.previewUrl,
    item.latestVersion?.metadata?.thumbnailUrl,
    item.latestVersion?.metadata?.coverImageUrl,
  ], { rejectMediaSource: true });
  if (explicitImagePreview) {
    return explicitImagePreview;
  }
  return genericCandidates
    .map((candidate) => String(candidate ?? "").trim())
    .find((candidate) => isLikelyImagePreview(candidate)) ?? "";
}

function parsePromptLine(line, referenceByName) {
  const content = [];
  let cursor = 0;
  MENTION_TOKEN_PATTERN.lastIndex = 0;
  let match;
  while ((match = MENTION_TOKEN_PATTERN.exec(line)) !== null) {
    if (match.index > cursor) {
      content.push({ type: "text", text: line.slice(cursor, match.index) });
    }
    const label = normalizeMentionLabel(match[1]);
    const reference = referenceByName.get(label) ?? null;
    content.push({
      type: "assetMention",
      attrs: normalizeMentionAttributes({
        id: reference?.assetId ?? reference?.id ?? label,
        assetId: reference?.assetId ?? "",
        assetKind: reference?.assetKind ?? reference?.kind ?? "character",
        description: reference?.description ?? "",
        label,
        name: label,
        preview: reference?.preview ?? reference?.previewUrl ?? "",
        source: reference?.source ?? reference?.src ?? reference?.url ?? "",
        referenceId: reference?.id ?? "",
      }),
    });
    cursor = match.index + match[0].length;
  }
  if (cursor < line.length) {
    content.push({ type: "text", text: line.slice(cursor) });
  }
  return content.length ? content : undefined;
}

function normalizeMentionAttributes(attrs) {
  const label = normalizeMentionLabel(attrs.label ?? attrs.name ?? attrs.id ?? "\u7d20\u6750");
  const assetKind = String(attrs.assetKind ?? attrs.kind ?? "character").trim() || "character";
  const assetId = String(attrs.assetId ?? "").trim();
  const referenceId = String(
    attrs.referenceId ?? (assetId ? `mention-ref:${assetKind}:${assetId}` : ""),
  ).trim();
  const source = resolvePromptEditorMentionMediaSource(attrs, assetKind);
  return {
    id: String(attrs.id ?? assetId ?? referenceId ?? label).trim() || label,
    assetId,
    assetKind,
    description: String(attrs.description ?? "").trim(),
    label,
    name: label,
    preview: resolvePromptEditorMentionPreview(attrs, assetKind),
    ...(source ? { source } : {}),
    referenceId,
  };
}

function resolvePromptEditorMentionMediaSource(item = {}, assetKind = null) {
  const kind = String(assetKind ?? item.assetKind ?? item.kind ?? "").trim();
  if (kind !== "video") {
    return "";
  }
  const explicitSource = firstPreviewValue([
    item.source,
    item.videoUrl,
    item.resultVideoUrl,
    item.sourceUrl,
    item.src,
    item.url,
    item.downloadUrl,
    item.latestVersion?.videoUrl,
    item.latestVersion?.sourceUrl,
    item.latestVersion?.src,
    item.latestVersion?.url,
  ]);
  if (explicitSource) {
    return explicitSource;
  }
  return [item.preview, item.previewUrl]
    .map((candidate) => String(candidate ?? "").trim())
    .find((candidate) => isMediaSourcePreview(candidate)) ?? "";
}

function firstPreviewValue(candidates, { rejectMediaSource = false } = {}) {
  return candidates
    .map((candidate) => String(candidate ?? "").trim())
    .find((candidate) => candidate && (!rejectMediaSource || !isMediaSourcePreview(candidate))) ?? "";
}

function isLikelyImagePreview(value) {
  const preview = String(value ?? "").trim();
  return Boolean(preview) && (
    /^data:image\//i.test(preview) ||
    /\.(?:avif|bmp|gif|jpe?g|png|svg|webp)(?:[?#]|$)/i.test(preview)
  );
}

function isMediaSourcePreview(value) {
  const preview = String(value ?? "").trim();
  return (
    /^data:(?:audio|video)\//i.test(preview) ||
    /\.(?:aac|flac|m4a|mp3|ogg|wav|webm|m4v|mov|mp4|mpeg|mpg)(?:[?#]|$)/i.test(preview)
  );
}

function serializePromptNode(node) {
  if (!node || typeof node !== "object") {
    return "";
  }
  if (node.type === "text") {
    return String(node.text ?? "");
  }
  if (node.type === "hardBreak") {
    return "\n";
  }
  if (node.type === "assetMention") {
    const label = normalizeMentionLabel(node.attrs?.label ?? node.attrs?.name ?? node.attrs?.id);
    return label ? `\u3010@${label}\u3011` : "";
  }
  return (node.content ?? []).map((child) => serializePromptNode(child)).join("");
}

function walkPromptNodes(node, visitor) {
  if (!node || typeof node !== "object") {
    return;
  }
  visitor(node);
  for (const child of node.content ?? []) {
    walkPromptNodes(child, visitor);
  }
}

function labelFromMentionToken(token) {
  const match = /^\u3010@([^\u3011]+)\u3011$/u.exec(String(token ?? "").trim());
  return match?.[1] ?? "";
}

function normalizeMentionLabel(value) {
  return String(value ?? "").trim();
}
