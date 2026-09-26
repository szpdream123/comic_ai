// Parameter choices are collected before a paid operation. Never treat values
// proposed by the language model (or project defaults) as a user's selection.
const receipts = new WeakSet();
let resolveProfileCapability;
export function setMediaCapabilityResolver(resolver) { resolveProfileCapability = resolver; }
const present = value => value !== undefined && value !== null && value !== '';
const normalizeRef = ref => String(ref ?? '');
const enumValues = value => (Array.isArray(value) ? value : []).filter(v => ['string', 'number'].includes(typeof v));
const same = (a, b) => JSON.stringify(a) === JSON.stringify(b);
const kindOf = node => node?.data?.type === 'ai-video' || node?.type === 'ai-video' ? 'video'
  : ['ai-image', 'ai-panorama', 'ai-animation'].includes(node?.data?.type ?? node?.type) ? 'image' : undefined;

export function mediaParameterModels(state) {
  return (state.config?.generalModels ?? []).filter(m => ['image', 'video'].includes(m.category)).map(model => {
    const schema = model.parameterSchema?.properties ?? model.parameterSchema ?? {};
    const capability = model.videoCapability ?? resolveProfileCapability?.(model.executionProfile) ?? {}, defaults = model.defaultParams ?? {};
    // Agnes' existing preset fixes width/height in the request template, while
    // duration is a variable. Retain the tool's existing 1..3600 input boundary.
    const fixedPreset = model.executionProfile?.preset === 'agnes-video' && !model.videoCapability;
    const field = (key, label, aliases, fallback, type = 'string') => {
      const name = aliases.find(k => schema[k]) ?? aliases[0], definition = schema[name] ?? {};
      const fixedValue = fixedPreset && key !== 'duration' ? (key === 'aspectRatio' ? capability.defaultRatio : capability.defaultResolution) : undefined;
      const options = enumValues(definition.options ?? definition.enum ?? (fallback?.length ? fallback : present(fixedValue) ? [fixedValue] : fallback)).map(v => type === 'number' ? Number(v) : String(v));
      const minimum = definition.minimum ?? definition.min ?? (key === 'duration' ? capability.minDuration ?? (fixedPreset ? 1 : undefined) : undefined);
      const maximum = definition.maximum ?? definition.max ?? (key === 'duration' ? capability.maxDuration ?? (fixedPreset ? 3600 : undefined) : undefined);
      return { key, label, type, options, minimum, maximum, step: definition.step ?? 1,
        suggested: aliases.map(k => defaults[k]).find(present) ?? definition.default
          ?? (key === 'duration' ? capability.defaultDuration : key === 'aspectRatio' ? capability.defaultRatio : key === 'resolution' ? capability.defaultResolution : undefined),
        unavailable: !options.length && !(type === 'number' && Number.isFinite(minimum) && Number.isFinite(maximum)) };
    };
    const fields = [
      field('aspectRatio', '画面比例', ['aspectRatio', 'ratio'], model.supportedRatios?.length ? model.supportedRatios : capability.ratios),
      field('resolution', model.category === 'image' ? '尺寸 / 质量' : '分辨率', ['resolution', 'imageSize', 'quality'],
        model.supportedResolutions?.length ? model.supportedResolutions : model.supportedQuality?.length ? model.supportedQuality : capability.resolutions),
    ];
    // Some reference-video contracts derive the ratio from the input image and
    // deliberately expose no ratio control. Do not invent a required option.
    if (model.category === 'video' && fields[0].unavailable && !schema.aspectRatio && !schema.ratio
      && !present(capability.defaultRatio) && Array.isArray(capability.resolutions)
      && Number.isFinite(capability.minDuration) && Number.isFinite(capability.maxDuration)) fields.shift();
    if (model.category === 'image' && (schema.resolution || schema.imageSize) && schema.quality) fields.push(field('quality', '图片质量', ['quality']));
    if (model.category === 'video') fields.unshift(field('duration', '时长（秒）', ['durationSec', 'duration'], model.supportedDurations?.length ? model.supportedDurations : capability.durations, 'number'));
    return { modelRef: `general/${model.id}`, label: model.name ?? model.id, kind: model.category, fields };
  });
}

export function validateParameterValues(model, values) {
  if (!model) throw Error('请选择一个已配置参数能力的可用模型');
  if (!values || typeof values !== 'object' || Array.isArray(values)) throw Error('生成参数格式无效');
  if (Object.keys(values).some(key => !model.fields.some(field => field.key === key))) throw Error('包含不支持的生成参数');
  const result = {};
  for (const field of model.fields) {
    if (field.unavailable) throw Error(`${field.label}能力配置缺失，请更换模型或完善配置`);
    let value = values[field.key];
    if (!present(value)) throw Error(`请选择${field.label}`);
    if (field.type === 'number') {
      if (typeof value !== 'number' && typeof value !== 'string' || !String(value).trim()) throw Error(`${field.label}无效`);
      value = Number(value);
      if (!Number.isFinite(value) || !Number.isInteger(value) || value <= 0) throw Error(`${field.label}无效`);
      if (Number.isFinite(field.minimum) && value < field.minimum || Number.isFinite(field.maximum) && value > field.maximum
        || Number.isFinite(field.step) && Math.abs((value - (field.minimum ?? 0)) / field.step - Math.round((value - (field.minimum ?? 0)) / field.step)) > 1e-8) throw Error(`${field.label}不在模型支持范围内`);
    }
    if (field.options.length) {
      const canonical = field.options.find(option => String(option).toLowerCase() === String(value).trim().toLowerCase());
      if (canonical === undefined) throw Error(`${field.label}“${value}”不在模型支持范围内，请修改选择或更换模型`);
      value = canonical;
    }
    result[field.key] = value;
  }
  return result;
}

function explicitValues(goal, kind) {
  const values = {}, text = String(goal ?? '');
  const unique = pattern => { const all = [...text.matchAll(pattern)].map(m => m[1]); return new Set(all).size === 1 ? all[0] : undefined; };
  if (kind === 'video') {
    const duration = unique(/(?:^|[^\d.])(\d+(?:\.\d+)?)\s*(?:秒|s(?:ec(?:onds?)?)?)(?![a-z])/gi);
    if (duration !== undefined) values.duration = Number(duration);
  }
  const ratio = unique(/(?:^|[^\d])(\d+\s*[:：]\s*\d+)(?!\d)/g);
  if (ratio) values.aspectRatio = ratio.replace(/\s/g, '').replace('：', ':');
  const resolution = unique(/(?:^|[^\w])(\d+\s*[pk])(?![a-z0-9])/gi);
  if (resolution) values.resolution = resolution.replace(/\s/g, '').toUpperCase();
  return values;
}

function nodeValues(node, kind) {
  const data = node.data ?? {};
  return kind === 'video' ? { duration: data.seedanceDuration, aspectRatio: data.seedanceRatio, resolution: data.seedanceResolution }
    : { aspectRatio: data.aspectRatio, resolution: data.imageSize, ...(data.imageQuality !== undefined ? { quality: data.imageQuality } : {}) };
}

function referenceSnapshot(prompt, state, sourceIds = [], excludedIds = []) {
  const ids = [...new Set([...sourceIds, ...[...String(prompt ?? '').matchAll(/@\{([^:}]+):[^}]+\}/g)].map(match => match[1].split('/cell/')[0])])].filter(id => !excludedIds.includes(id));
  return JSON.stringify(ids.map(id => {
    const data = state.nodes?.find(node => node.id === id)?.data;
    return [id, data ? [data.imageUrl, data.videoUrl, data.audioUrl, data.output, data.sourceUrl] : null];
  }));
}

function nodeSnapshot(node, state) {
  if (!node) return null;
  const d = node.data ?? {};
  return JSON.stringify({ model: d.model, provider: d.provider, prompt: d.prompt, workflowId: d.workflowId, workflowInputs: d.workflowInputs,
    values: nodeValues(node, kindOf(node)),
    references: (state.edges ?? []).filter(e => e.target === node.id).map(e => [e.source, e.sourceHandle, e.targetHandle]),
  });
}

function requestFor(items, state) {
  const models = mediaParameterModels(state);
  for (const item of items) {
    const model = models.find(model => model.modelRef === item.modelRef && model.kind === item.kind);
    for (const field of model?.fields ?? []) if (field.options.length === 1 && !present(item.values[field.key])) item.values[field.key] = field.options[0];
  }
  const request = { kind: 'media_parameters', projectId: state.currentProjectId, models, items };
  request.needsInput = items.some(item => {
    try { validateParameterValues(models.find(m => m.modelRef === item.modelRef && m.kind === item.kind), item.values); return false; }
    catch { return true; }
  });
  return request;
}

export function prepareMediaParameters(input, goal, state) {
  if (!['image', 'video'].includes(input.kind)) return undefined;
  // Workflow parameters use workflowInputs and retain their existing contracts.
  if (/^(?:runninghubwf|workflow-api|comfyui)\//.test(input.modelRef ?? '')) return undefined;
  if (input.modelRef && !input.modelRef.startsWith('general/')) return undefined;
  return requestFor([{ id: 'media', kind: input.kind, label: input.kind === 'video' ? '生成视频' : '生成图片',
    modelRef: normalizeRef(input.modelRef), values: explicitValues(goal, input.kind), prompt: input.prompt,
    referenceSnapshot: referenceSnapshot(input.prompt, state) }], state);
}

export function prepareNodeParameters(nodeIds, goal, state) {
  const nodes = nodeIds.map(id => state.nodes.find(n => n.id === id)).filter(node => kindOf(node) && node.data.status !== 'loading');
  const items = nodes.filter(node => !node.data.workflowId).map(node => {
    const kind = kindOf(node), modelRef = node.data.model || state.config?.[kind === 'video' ? 'assistantVideoModelId' : 'assistantImageModelId'] || '';
    const ref = state.config?.generalModels?.some(m => m.id === modelRef) ? `general/${modelRef}` : modelRef;
    const previous = node.data.mediaParameterConfirmation;
    const current = nodeValues(node, kind);
    const confirmed = previous?.modelRef === ref && Object.entries(previous.values ?? {}).every(([k, v]) => current[k] === v) ? previous.values : {};
    return { id: node.id, kind, label: node.data.label || `节点 #${node.data.displayId ?? node.id}`, modelRef: ref,
      values: { ...confirmed, ...(nodes.length === 1 ? explicitValues(goal, kind) : {}) },
      prompt: node.data.prompt, referenceExclusions: nodeIds,
      referenceSnapshot: referenceSnapshot(node.data.prompt, state, (state.edges ?? []).filter(edge => edge.target === node.id).map(edge => edge.source), nodeIds),
      snapshot: nodeSnapshot(node, state) };
  }).filter(item => !item.modelRef || item.modelRef.startsWith('general/'));
  return items.length ? requestFor(items, state) : undefined;
}

export function validateMediaSelection(request, selection, state) {
  if (request.projectId !== state.currentProjectId) throw Error('项目已变化，请重新确认');
  if (!Array.isArray(selection?.items) || selection.items.length !== request.items.length) throw Error('请补齐所有节点的生成参数');
  const models = mediaParameterModels(state), seen = new Set();
  const items = selection.items.map(selected => {
    if (!selected || Object.keys(selected).some(k => !['id', 'modelRef', 'values'].includes(k))) throw Error('生成参数格式无效');
    const original = request.items.find(i => i.id === selected.id);
    if (!original || seen.has(selected.id)) throw Error('生成参数包含重复或未知节点');
    seen.add(selected.id);
    if (original.snapshot !== undefined && original.snapshot !== nodeSnapshot(state.nodes.find(n => n.id === original.id), state)) throw Error('节点已变化，请重新确认生成参数');
    const sources = original.snapshot === undefined ? [] : (state.edges ?? []).filter(edge => edge.target === original.id).map(edge => edge.source);
    if (original.referenceSnapshot !== referenceSnapshot(original.prompt, state, sources, original.referenceExclusions)) throw Error('参考素材已变化，请重新确认生成参数');
    const model = models.find(m => m.modelRef === selected.modelRef && m.kind === original.kind);
    const shown = request.models.find(m => m.modelRef === selected.modelRef && m.kind === original.kind);
    if (!model || !shown || !same(model, shown)) throw Error('模型能力已变化，请重新确认');
    return { ...original, modelRef: model.modelRef, values: validateParameterValues(model, selected.values) };
  });
  const receipt = { ...request, items, needsInput: false };
  receipts.add(receipt);
  return receipt;
}

export function applyMediaSelection(input, receipt) {
  const item = receipt.items.find(i => i.id === 'media');
  if (!item) return input;
  const { duration, aspectRatio, resolution, quality, ...remaining } = input;
  return { ...remaining, modelRef: item.modelRef, ...item.values };
}

export function assertMediaParameterReceipt(receipt, state, nodeIds) {
  if (!receipt || !receipts.has(receipt)) throw Error('生成参数尚未确认，请先选择参数');
  if (nodeIds && receipt.items.some(item => !nodeIds.includes(item.id))) throw Error('生成节点已变化，请重新确认');
  if (nodeIds) {
    const current = prepareNodeParameters(nodeIds, '', state)?.items ?? [];
    if (current.length !== receipt.items.length || current.some(item => !receipt.items.some(approved => approved.id === item.id))) throw Error('生成节点已变化，请重新确认');
  }
  validateMediaSelection(receipt, { items: receipt.items.map(({ id, modelRef, values }) => ({ id, modelRef, values })) }, state);
  return receipt;
}

export function confirmedNodePatch(item) {
  return { model: item.modelRef, provider: item.modelRef.startsWith('general/') ? 'general' : undefined,
    ...item.kind === 'video' ? { seedanceDuration: item.values.duration, seedanceRatio: item.values.aspectRatio, seedanceResolution: item.values.resolution }
      : { aspectRatio: item.values.aspectRatio, imageSize: item.values.resolution, imageQuality: item.values.quality },
    mediaParameterConfirmation: { modelRef: item.modelRef, values: { ...item.values } } };
}

export function assertNodeParameterReceipt(receipt, item, state) {
  if (!receipt || !receipts.has(receipt) || !receipt.items.includes(item)) throw Error('生成参数尚未确认');
  validateMediaSelection({ ...receipt, items: [item] }, { items: [{ id: item.id, modelRef: item.modelRef, values: item.values }] }, state);
}

export function resolveParameterPreparation(prepared, goal, state) {
  const request = prepared.definition.id === 'media_generate' ? prepareMediaParameters(prepared.input, goal, state)
    : prepared.definition.prepareMediaParameters?.(prepared.input, goal, state);
  if (!request) return undefined;
  if (request.needsInput) return { prepared, inputRequest: request };
  const receipt = validateMediaSelection(request, { items: request.items.map(({ id, modelRef, values }) => ({ id, modelRef, values })) }, state);
  return { prepared: { ...prepared, input: applyMediaSelection(prepared.input, receipt), mediaParameterApproval: receipt } };
}
