import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { test } from 'node:test';
import vm from 'node:vm';

const asset = name => readFileSync(new URL(`../ai-canvas-runtime/assets/${name}.js`, import.meta.url), 'utf8');
test('media placeholder retains the 15 second request and image settings for later runs', () => {
  const source = asset('main-upstream-665b2cc');
  const start = source.indexOf('createMediaPlaceholder:');
  const field = source.slice(start, source.indexOf(',settleMediaPlaceholder:', start));
  const state = { nodes: [], projects: [], commitToHistory() {} };
  const create = new Function('t', 'e', 'W', 'KN', 'BN', 'Nm', `return ({${field}}).createMediaPlaceholder`)(
    () => state, fn => Object.assign(state, fn(state)), () => String(state.nodes.length), () => ({ x: 0, y: 0 }), data => data, () => 1,
  );
  create({ kind: 'video', prompt: 'fight', modelRef: 'general/wan', duration: 15, aspectRatio: '16:9', resolution: '1080P' });
  assert.equal(state.nodes[0].data.seedanceDuration, 15);
  assert.equal(state.nodes[0].data.seedanceRatio, '16:9');
  assert.equal(state.nodes[0].data.seedanceResolution, '1080P');
  create({ kind: 'image', prompt: 'portrait', modelRef: 'general/image', aspectRatio: '3:4', resolution: '4K' });
  assert.equal(state.nodes[1].data.aspectRatio, '3:4');
  assert.equal(state.nodes[1].data.imageSize, '4K');
});

const load = () => import('../ai-canvas-runtime/assets/mediaParameterConfirmation.js');
const videoModel = { id: 'wan', name: 'Wan', category: 'video', parameterSchema: {
  durationSec: { type: 'integer', minimum: 3, maximum: 30 },
  aspectRatio: { options: ['16:9', '9:16'] }, resolution: { options: ['720P', '1080P'] },
}, defaultParams: { durationSec: 5, aspectRatio: '16:9', resolution: '720P' } };
const imageModel = { id: 'image', name: 'Image', category: 'image', parameterSchema: {
  aspectRatio: { options: ['1:1', '3:4'] }, quality: { options: ['2K', '4K'] },
} };
const state = () => ({ currentProjectId: 'p', config: { generalModels: [structuredClone(videoModel), imageModel] }, nodes: [], edges: [] });
const input = { kind: 'video', prompt: 'fight', modelRef: 'general/wan', deliveryMode: 'canvas', duration: 5, resolution: '720P', aspectRatio: '16:9' };

test('explicit 15 seconds overrides guessed 5, while omitted choices remain unanswered', async () => {
  const { prepareMediaParameters } = await load();
  const result = prepareMediaParameters(input, '请生成15s的打斗视频', state());
  assert.equal(result.items[0].values.duration, 15);
  assert.equal(result.items[0].values.resolution, undefined);
  assert.equal(result.items[0].values.aspectRatio, undefined);
  assert.equal(result.needsInput, true);
});

test('complete explicit values need no additional question and canonicalize resolution', async () => {
  const { prepareMediaParameters, validateMediaSelection } = await load();
  const s = state(), request = prepareMediaParameters(input, '生成15秒 16:9 1080p的视频', s);
  assert.equal(request.needsInput, false);
  const receipt = validateMediaSelection(request, { items: request.items.map(item => ({ id: item.id, modelRef: item.modelRef, values: item.values })) }, s);
  assert.equal(receipt.items[0].values.duration, 15);
  assert.equal(receipt.items[0].values.resolution, '1080P');
});

test('selection rejects missing values, unsupported duration and stale model capability', async () => {
  const { prepareMediaParameters, validateMediaSelection } = await load();
  const s = state(), request = prepareMediaParameters(input, '15秒视频', s);
  const select = values => ({ items: [{ id: 'media', modelRef: 'general/wan', values }] });
  assert.throws(() => validateMediaSelection(request, select({ duration: 15 }), s), /请选择/);
  assert.throws(() => validateMediaSelection(request, select({ duration: 31, resolution: '720P', aspectRatio: '16:9' }), s), /时长/);
  s.config.generalModels[0].parameterSchema.durationSec.maximum = 10;
  assert.throws(() => validateMediaSelection(request, select({ duration: 15, resolution: '720P', aspectRatio: '16:9' }), s), /变化|时长/);
});

test('legacy node defaults need confirmation and edits invalidate the pending request', async () => {
  const { prepareNodeParameters, validateMediaSelection } = await load();
  const s = state();
  s.nodes = [{ id: 'n', type: 'ai-video', data: { type: 'ai-video', prompt: 'fight', model: 'general/wan', seedanceDuration: 5, seedanceRatio: '16:9', seedanceResolution: '720P' } }];
  const request = prepareNodeParameters(['n'], '生成15s视频', s);
  assert.equal(request.items[0].values.duration, 15);
  assert.equal(request.needsInput, true);
  s.nodes[0].data.prompt = 'changed';
  assert.throws(() => validateMediaSelection(request, { items: [{ id: 'n', modelRef: 'general/wan', values: { duration: 15, resolution: '720P', aspectRatio: '16:9' } }] }, s), /变化/);
});

test('image choices are model specific; forged fields are not accepted', async () => {
  const { prepareMediaParameters, validateMediaSelection } = await load();
  const s = state(), request = prepareMediaParameters({ ...input, kind: 'image', modelRef: 'general/image' }, '画个人像', s);
  assert.deepEqual(request.models.find(m => m.modelRef === 'general/image').fields.map(f => f.key), ['aspectRatio', 'resolution']);
  const selection = { items: [{ id: 'media', modelRef: 'general/image', values: { aspectRatio: '3:4', resolution: '4K' } }] };
  assert.equal(validateMediaSelection(request, selection, s).items[0].values.resolution, '4K');
  selection.items[0].values.apiKey = 'forged';
  assert.throws(() => validateMediaSelection(request, selection, s), /参数/);
});

function bindFunction(file, start, end, name, deps) {
  const source = asset(file), from = source.indexOf(start);
  return new Function(...Object.keys(deps), `${source.slice(from, source.indexOf(end, from))};return ${name}`)(...Object.values(deps));
}

test('real approval preparation asks for missing parameters even in autonomous mode with a selected model', async () => {
  const helper = await load(), s = state();
  const pn = bindFunction('agentRoundExecutor-D3Qh0nGj', 'function pn(', 'function mn(', 'pn', {
    S: { getState: () => s }, resolveCanvasAssistantModelId: () => 'general/wan',
    resolveParameterPreparation: helper.resolveParameterPreparation,
  });
  const result = pn({ definition: { id: 'media_generate', effect: 'media_generation' }, input }, '15s视频', 'autonomous');
  assert.equal(result.inputRequest?.kind, 'media_parameters');
  assert.equal(result.inputRequest.items[0].values.duration, 15);
});

test('real approval selection validates choices and sends the approved model through existing schema validation', async () => {
  const helper = await load(), s = state();
  const request = helper.prepareMediaParameters(input, '15秒视频', s);
  const definition = { authorize: () => ({ allowed: true }) };
  let validationInput;
  const mn = bindFunction('agentRoundExecutor-D3Qh0nGj', 'function mn(', 'async function compressLiveTaskContext(', 'mn', {
    S: { getState: () => s }, Z: s => s, validateMediaSelection: helper.validateMediaSelection, applyMediaSelection: helper.applyMediaSelection,
    ae: (call, context) => { validationInput = call.input; assert.ok(context.mediaParameterApproval); return { ok: true, prepared: { definition, input: call.input } }; },
  });
  const result = mn({ toolId: 'media_generate' }, { definition, input }, request, { approved: true, inputValues: {
    items: [{ id: 'media', modelRef: 'general/wan', values: { duration: 15, resolution: '1080P', aspectRatio: '16:9' } }],
  } }, { mode: 'autonomous' });
  assert.equal(result.error, undefined);
  assert.equal(validationInput.duration, 15);
  assert.ok(result.prepared.mediaParameterApproval);
});

test('node batch uses the confirmed values and rejects an unconfirmed task before any generation', async () => {
  const helper = await load();
  const { runCanvasAgentBatch } = await import('../ai-canvas-runtime/assets/canvasAgentBatch.js');
  const s = state(), calls = [];
  s.nodes = [{ id: 'n', type: 'ai-video', data: { type: 'ai-video', model: 'general/wan', prompt: 'fight', status: 'idle' } }];
  s.incrementRevision = () => {};
  s.updateNodeDataTransient = (id, patch) => Object.assign(s.nodes.find(n => n.id === id).data, patch);
  const request = helper.prepareNodeParameters(['n'], '15秒 16:9 1080p视频', s);
  const receipt = helper.validateMediaSelection(request, { items: request.items.map(({ id, modelRef, values }) => ({ id, modelRef, values })) }, s);
  const ctx = { taskId: 'task', projectId: 'p', signal: new AbortController().signal };
  const run = async (id, x, y, data) => { calls.push(data); return { success: true }; };
  await assert.rejects(runCanvasAgentBatch(ctx, ['n'], { getState: () => s }, run, () => ({})), /尚未确认/);
  assert.equal(calls.length, 0);
  await runCanvasAgentBatch({ ...ctx, mediaParameterApproval: receipt }, ['n'], { getState: () => s }, run, () => ({}));
  assert.equal(calls[0].seedanceDuration, 15);
  assert.equal(s.nodes[0].data.seedanceDuration, 15);
  const again = helper.prepareNodeParameters(['n'], '重试这个视频', s);
  assert.equal(again.needsInput, false);
  assert.equal(again.items[0].values.duration, 15);
});

test('real image execution receives confirmed aspect ratio and resolution instead of project defaults', async () => {
  let sent;
  const s = { currentProjectId: 'p', projects: [{ id: 'p', settings: { generation: { imageSize: '2K', imageAspectRatio: '1:1' } } }] };
  const execute = bindFunction('conversationExecutionController-CGzzIkBM', 'async function _i(', 'async function vi(', '_i', {
    ui() {}, fi: x => x, w: { getState: () => s }, wt: ({ prompt }) => prompt, si: { image: 'ai-image' },
    pi: () => ({ provider: 'general', requestModel: 'image' }),
    _n: async input => { sent = input; return { url: 'https://example.invalid/result.png' }; }, p: () => undefined,
    hi: async () => ({ status: 'saved' }), gi: async () => {},
  });
  await execute({ kind: 'image', prompt: 'portrait', modelRef: 'general/image', aspectRatio: '3:4', resolution: '4K' }, 'p');
  assert.equal(sent.imageSize, '4K');
  assert.equal(sent.aspectRatio, '3:4');
});

test('backend image profile carries selected ratio and quality to the actual task request template', () => {
  const app = readFileSync(new URL('../app.js', import.meta.url), 'utf8');
  const bridge = app.slice(app.indexOf('function createAiCanvasRuntimeCatalogBridge'), app.indexOf('function createAiCanvasRuntimeScaleBridge'));
  const create = new Function('localStorage', 'resolveAiCanvasRuntimeModelPricing', `${bridge};return createAiCanvasRuntimeCatalogBridge`)(
    { getItem: () => null }, () => ({}),
  );
  let s = { config: {} };
  create({ getState: () => s, setState: patch => { s = { ...s, ...patch }; } }, { models: [{ modelCode: 'image', category: 'image', parameterSchema: imageModel.parameterSchema }] });
  const body = s.config.generalModels[0].executionProfile.protocol.submit.body;
  assert.equal(body.aspectRatio, '{{aspectRatio}}');
  assert.equal(body.quality, '{{imageSize}}');
});

test('confirmation card requires missing choices, preserves 15 seconds, and submits once', async () => {
  const { createMediaParameterCard } = await import('../ai-canvas-runtime/assets/mediaParameterCard.js');
  const helper = await load(), request = helper.prepareMediaParameters(input, '15秒视频', state());
  const slots = [], refs = []; let cursor = 0, refCursor = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat().filter(Boolean) }),
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useRef(value) { const index = refCursor++; return refs[index] ??= { current: value }; },
  };
  const Card = createMediaParameterCard(React), calls = [];
  const render = () => { cursor = 0; refCursor = 0; return Card({ step: { approval: { id: 'a', status: 'pending', inputRequest: request } }, mediaModelAvailability: { 'general/wan': true }, onResolve: (...args) => calls.push(args) }); };
  const find = (node, predicate) => predicate(node) ? node : node.children?.map(child => typeof child === 'object' ? find(child, predicate) : undefined).find(Boolean);
  let tree = render();
  const confirm = tree => find(tree, node => node.type === 'button' && node.children.includes('确认并生成'));
  assert.equal(confirm(tree).props.disabled, true);
  assert.equal(find(tree, node => node.props['aria-label'] === '生成视频时长（秒）').props.value, 15);
  find(tree, node => node.props['aria-label'] === '生成视频画面比例').props.onChange({ target: { value: '16:9' } });
  tree = render();
  find(tree, node => node.props['aria-label'] === '生成视频分辨率').props.onChange({ target: { value: '1080P' } });
  tree = render();
  const button = confirm(tree);
  assert.equal(button.props.disabled, false);
  button.props.onClick(); button.props.onClick();
  assert.equal(calls.length, 1);
  assert.deepEqual(calls[0][1].inputValues.items[0].values, { duration: 15, aspectRatio: '16:9', resolution: '1080P' });
});

test('adding a chat artifact to the canvas preserves its confirmed video parameters', () => {
  const source = asset('main-upstream-665b2cc'), start = source.indexOf('materializeMediaArtifact:');
  const field = source.slice(start, source.indexOf(',updateNodeData:', start));
  const s = { nodes: [], projects: [], commitToHistory() {} };
  const materialize = new Function('t', 'e', 'W', 'KN', 'BN', 'Nm', `return ({${field}}).materializeMediaArtifact`)(
    () => s, fn => Object.assign(s, fn(s)), () => 'v', () => ({ x: 0, y: 0 }), data => data, () => 1,
  );
  materialize({ id: 'artifact', kind: 'video', modelId: 'general/wan', provider: 'general', prompt: 'fight', url: 'https://example.invalid/video.mp4',
    mediaParameterConfirmation: { modelRef: 'general/wan', values: { duration: 15, aspectRatio: '16:9', resolution: '1080P' } } });
  assert.equal(s.nodes[0].data.seedanceDuration, 15);
  assert.equal(s.nodes[0].data.seedanceResolution, '1080P');
});

test('optional parameter reminder generates with defaults, preserving explicit and edited values', async () => {
  const { createMediaParameterCard } = await import('../ai-canvas-runtime/assets/mediaParameterCard.js');
  const helper = await load(), s = state();
  const request = helper.prepareMediaParameters(input, '15秒视频', s);
  const slots = [], refs = []; let cursor = 0, refCursor = 0;
  const React = {
    createElement: (type, props, ...children) => ({ type, props: props ?? {}, children: children.flat().filter(Boolean) }),
    useState(initial) { const index = cursor++; if (!(index in slots)) slots[index] = typeof initial === 'function' ? initial() : initial; return [slots[index], value => { slots[index] = typeof value === 'function' ? value(slots[index]) : value; }]; },
    useRef(value) { const index = refCursor++; return refs[index] ??= { current: value }; },
  };
  const Card = createMediaParameterCard(React), calls = [];
  const render = () => { cursor = 0; refCursor = 0; return Card({ step: { approval: { id: 'a', status: 'pending', inputRequest: request } }, mediaModelAvailability: { 'general/wan': true }, onResolve: (...args) => calls.push(args) }); };
  const find = (node, predicate) => predicate(node) ? node : node.children?.map(child => typeof child === 'object' ? find(child, predicate) : undefined).find(Boolean);
  const defaultsButton = tree => find(tree, node => node.type === 'button' && node.children.includes('使用默认参数生成'));
  let tree = render();
  assert.equal(defaultsButton(tree)?.props.disabled, false);
  find(tree, node => node.props['aria-label'] === '生成视频画面比例').props.onChange({ target: { value: '9:16' } });
  tree = render();
  defaultsButton(tree).props.onClick(); defaultsButton(tree).props.onClick();
  assert.equal(calls.length, 1);
  const receipt = helper.validateMediaSelection(request, calls[0][1].inputValues, s);
  assert.deepEqual(receipt.items[0].values, { duration: 15, aspectRatio: '9:16', resolution: '720P' });
  slots.length = 0; refs.length = 0;
  request.items[0].values.duration = 31;
  tree = render();
  assert.equal(defaultsButton(tree).props.disabled, true, 'defaults cannot silently reduce an unsupported explicit duration');
  defaultsButton(tree).props.onClick();
  assert.equal(calls.length, 1);
  slots.length = 0; refs.length = 0;
  request.items[0].values.duration = 15;
  delete request.models.find(m => m.modelRef === 'general/wan').fields.find(f => f.key === 'resolution').suggested;
  assert.equal(defaultsButton(render()).props.disabled, true, 'an unconfigured default cannot be invented');
});

test('a downstream node edited during the first wave cannot consume the old approval', async () => {
  const helper = await load(), { runCanvasAgentBatch } = await import('../ai-canvas-runtime/assets/canvasAgentBatch.js');
  const s = state(), calls = [];
  s.nodes = ['a', 'b'].map(id => ({ id, type: 'ai-video', data: { type: 'ai-video', model: 'general/wan', prompt: 'fight', status: 'idle' } }));
  s.edges = [{ source: 'a', target: 'b' }]; s.incrementRevision = () => {};
  s.updateNodeDataTransient = (id, patch) => Object.assign(s.nodes.find(n => n.id === id).data, patch);
  const request = helper.prepareNodeParameters(['a', 'b'], '', s);
  const receipt = helper.validateMediaSelection(request, { items: request.items.map(({ id, modelRef }) => ({ id, modelRef, values: { duration: 15, aspectRatio: '16:9', resolution: '1080P' } })) }, s);
  const result = await runCanvasAgentBatch({ taskId: 'task', projectId: 'p', signal: new AbortController().signal, mediaParameterApproval: receipt }, ['a', 'b'], { getState: () => s }, async id => {
    calls.push(id); s.nodes[1].data.prompt = 'different paid request'; return { success: true };
  }, () => ({}));
  assert.deepEqual(calls, ['a']);
  assert.equal(result[1].status, 'failed');
  assert.match(result[1].message, /变化/);
});

test('resolution and quality remain separate when an image model defines both', async () => {
  const { mediaParameterModels, validateParameterValues, confirmedNodePatch } = await load();
  const s = state();
  s.config.generalModels[1] = { ...imageModel, parameterSchema: { aspectRatio: { options: ['1:1'] }, resolution: { options: ['1024x1024'] }, quality: { options: ['standard', 'hd'] } } };
  const model = mediaParameterModels(s).find(m => m.kind === 'image');
  assert.deepEqual(model.fields.map(f => f.key), ['aspectRatio', 'resolution', 'quality']);
  const values = validateParameterValues(model, { aspectRatio: '1:1', resolution: '1024x1024', quality: 'hd' });
  assert.equal(confirmedNodePatch({ kind: 'image', modelRef: model.modelRef, values }).imageQuality, 'hd');
});

test('preset-only video models reuse the existing capability resolver', async () => {
  const { mediaParameterModels, setMediaCapabilityResolver } = await load();
  const s = state();
  s.config.generalModels[0] = { id: 'preset', category: 'video', executionProfile: { preset: 'test' } };
  setMediaCapabilityResolver(profile => profile?.preset === 'test' ? { durations: [5, 15], ratios: ['16:9'], resolutions: ['720P'] } : undefined);
  try { assert.equal(mediaParameterModels(s)[0].fields.every(field => !field.unavailable), true); }
  finally { setMediaCapabilityResolver(undefined); }
});

test('reference-video capabilities without ratio controls accept their configured defaults', async () => {
  const helper = await load(), s = state();
  s.config.generalModels[0] = { id: 'wan', category: 'video', videoCapability: {
    resolutions: ['480P', '720P', '1080P'], defaultResolution: '720P', minDuration: 2, maxDuration: 15, defaultDuration: 5,
  } };
  const request = helper.prepareMediaParameters(input, '15秒视频', s);
  const model = request.models[0];
  assert.deepEqual(model.fields.map(field => field.key), ['duration', 'resolution']);
  const values = Object.fromEntries(model.fields.map(field => [field.key, request.items[0].values[field.key] ?? field.suggested]));
  const receipt = helper.validateMediaSelection(request, { items: [{ id: 'media', modelRef: 'general/wan', values }] }, s);
  const approved = helper.applyMediaSelection(input, receipt);
  assert.equal(approved.duration, 15);
  assert.equal(approved.resolution, '720P');
  assert.equal(approved.aspectRatio, undefined, 'an LLM-invented ratio must not leak into the provider request');
  const catalog = asset('mcpToolCatalog-BYg95YCR'), controller = asset('conversationExecutionController-CGzzIkBM');
  const validate = vm.runInNewContext(`${catalog.slice(0, catalog.indexOf('var r='))}; n`);
  const start = controller.indexOf('inputSchema:', controller.indexOf('E({id:`media_generate`')) + 'inputSchema:'.length;
  const schema = vm.runInNewContext(`(${controller.slice(start, controller.indexOf(',effect:', start))})`);
  assert.equal(validate(schema, approved).valid, true, 'absent optional fields must remain absent for the real tool validator');
  assert.throws(() => helper.validateParameterValues(model, { ...values, aspectRatio: '9:16' }), /不支持/);
});

test('legacy non-general models retain their existing execution contract', async () => {
  const helper = await load(), s = state();
  const { runCanvasAgentBatch } = await import('../ai-canvas-runtime/assets/canvasAgentBatch.js');
  for (const model of ['runninghub/legacy', 'dreamina/legacy']) {
    assert.equal(helper.prepareMediaParameters({ ...input, modelRef: model }, '15秒视频', s), undefined);
    s.nodes = [{ id: 'n', type: 'ai-video', data: { type: 'ai-video', model, prompt: 'fight', status: 'idle' } }];
    assert.equal(helper.prepareNodeParameters(['n'], '', s), undefined);
    s.incrementRevision = () => {};
    let calls = 0;
    await runCanvasAgentBatch({ taskId: 'task', projectId: 'p', signal: new AbortController().signal }, ['n'], { getState: () => s },
      async () => { calls++; return { success: true }; }, () => ({}));
    assert.equal(calls, 1);
  }
});

for (const approve of [true, false]) test(`real autonomous round waits for choices, then ${approve ? 'executes approved parameters' : 'cancels without execution'}`, async () => {
  const helper = await load(), s = state();
  let task = { id: 'task', projectId: 'p', conversationId: 'c', mode: 'autonomous', goal: '生成15s视频', steps: [], modelRounds: 0, toolCallCount: 0, budget: { maxParallelReadTools: 2 } };
  s.getCurrentRevision = () => 0; s.historyIndex = 0;
  let finishApproval, calls = [];
  const definition = { id: 'media_generate', effect: 'media_generation', title: '生成媒体内容', authorize: () => ({ allowed: true }),
    execute: async (ctx, input) => { assert.ok(ctx.mediaParameterApproval); calls.push(input); return { status: 'success', summary: 'ok', modelContent: 'ok' }; } };
  const deps = {
    ...helper, resolveCanvasAssistantModelId: () => 'general/wan',
    K() {}, J: () => task, S: { getState: () => s }, Y: (id, fn) => { task = fn(task); }, q: t => t.mode,
    Kt: () => [], nn: new WeakMap(), p: () => ({ exceeded: false }), foldSeriesReadTools: m => m,
    jt: () => ({ inputBudget: 100000 }), At: () => 0, oe: () => [], s() {}, l() {}, n() {},
    H: async ({ onEvent }) => onEvent({ type: 'tool.call.final', call: { callId: 'call', toolId: 'media_generate', input } }),
    filterRepeatedAgentReads: (t, calls) => calls,
    ae: call => ({ ok: true, prepared: { definition, input: call.input } }), se: () => ({ outcome: 'allow' }), on: () => 'step', Z: x => x,
    Jt: () => 'fingerprint', cn: () => undefined, an: (id, step) => task.steps.push(step),
    fn: async (items, limit, run) => { for (const item of items) await run(item); },
    ln: () => 0, X: (id, step, patch) => Object.assign(task.steps.find(s => s.id === step), patch), Yt: () => undefined, $: x => x,
  };
  deps.pn = bindFunction('agentRoundExecutor-D3Qh0nGj', 'function pn(', 'function mn(', 'pn', deps);
  deps.mn = bindFunction('agentRoundExecutor-D3Qh0nGj', 'function mn(', 'async function compressLiveTaskContext(', 'mn', deps);
  deps.dn = bindFunction('agentRoundExecutor-D3Qh0nGj', 'async function dn(', 'async function fn(', 'dn', deps);
  const hn = bindFunction('agentRoundExecutor-D3Qh0nGj', 'async function hn(', 'export{', 'hn', deps);
  const running = hn({ taskId: 'task', signal: new AbortController().signal, messages: [], fullText: '', totalToolResultChars: 0,
    transitionTask: (id, status, patch) => { task = { ...task, status, ...patch }; }, callbacks: {},
    waitForApproval: () => new Promise(resolve => { finishApproval = resolve; }),
  });
  await new Promise(resolve => setImmediate(resolve));
  assert.equal(task.status, 'waiting_approval');
  assert.equal(calls.length, 0);
  finishApproval({ approved: approve, inputValues: { items: [{ id: 'media', modelRef: 'general/wan', values: { duration: 15, resolution: '1080P', aspectRatio: '16:9' } }] } });
  const result = await running;
  assert.equal(calls.length, approve ? 1 : 0);
  if (approve) assert.equal(calls[0].duration, 15);
  else assert.equal(result.outcome, 'paused');
});

test('the runtime template validator accepts the independent imageQuality variable', () => {
  const source = asset('main-upstream-665b2cc');
  const validate = new Function(`${source.slice(source.indexOf('var zD='), source.indexOf('function KO('))};return value=>{const errors=[];GO(value,false,'请求体',errors);return errors}`)();
  assert.deepEqual(validate({ resolution: '{{imageSize}}', quality: '{{imageQuality}}' }), []);
  assert.equal(validate({ key: '{{secretKey}}' }).length, 1, 'unknown variables remain rejected');
});

test('changing a referenced image while confirming invalidates the original media request', async () => {
  const helper = await load(), s = state();
  s.nodes = [{ id: 'ref', data: { imageUrl: 'https://example.invalid/original.png' } }];
  const request = helper.prepareMediaParameters({ ...input, prompt: 'fight with @{ref:人物}' }, '15s 16:9 1080P', s);
  s.nodes[0].data.imageUrl = 'https://example.invalid/replacement.png';
  assert.throws(() => helper.validateMediaSelection(request, { items: request.items.map(({ id, modelRef, values }) => ({ id, modelRef, values })) }, s), /参考素材.*变化/);
});
