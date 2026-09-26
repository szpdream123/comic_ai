import { validateParameterValues } from './mediaParameterConfirmation.js';

// React is supplied by the existing bundle, so the card uses the same runtime.
export function createMediaParameterCard(React) {
  const h = React.createElement;
  return function MediaParameterCard({ step, mediaModelAvailability = {}, onResolve }) {
    const approval = step.approval, request = approval.inputRequest;
    const [items, setItems] = React.useState(() => request.items.map(({ id, modelRef, values }) => ({ id, modelRef, values: { ...values } })));
    const [submitted, setSubmitted] = React.useState(false);
    const submitting = React.useRef(false);
    const [error, setError] = React.useState('');
    const modelFor = item => request.models.find(model => model.modelRef === item.modelRef);
    const missing = value => value === undefined || value === null || value === '';
    const withDefaults = item => ({ ...item, values: {
      ...item.values,
      ...Object.fromEntries((modelFor(item)?.fields ?? []).filter(field => missing(item.values[field.key])).map(field => [field.key, field.suggested])),
    } });
    const hasMissing = items.some(item => modelFor(item)?.fields.some(field => missing(item.values[field.key])));
    const update = (id, patch) => {
      setError('');
      setItems(current => current.map(item => item.id === id ? { ...item, ...patch } : item));
    };
    const validation = (useDefaults = false) => {
      if (approval.status !== 'pending') throw Error('本次确认已失效，请继续任务后重新选择');
      return items.map(item => {
        if (!mediaModelAvailability[item.modelRef]) throw Error('请选择当前可用的模型');
        return { ...item, values: validateParameterValues(modelFor(item), useDefaults ? withDefaults(item).values : item.values) };
      });
    };
    let invalid;
    try { validation(); } catch (cause) { invalid = cause.message; }
    let defaultInvalid;
    try { validation(true); } catch (cause) { defaultInvalid = cause.message; }
    const submit = (approved, useDefaults = false) => {
      if (submitting.current || approval.status !== 'pending') return;
      try {
        const values = approved ? validation(useDefaults) : undefined;
        submitting.current = true;
        setSubmitted(true);
        onResolve(approval.id, { approved, ...(approved ? { inputValues: { items: values } } : {}) });
      } catch (cause) { setError(cause.message); }
    };
    return h('div', { className: 'mt-2 border-l-2 border-amber-400/60 bg-amber-400/5 px-3 py-2.5', role: 'group', 'aria-label': '确认生成参数' },
      h('p', { className: 'text-xs font-medium text-amber-300' }, '生成参数（可选调整）'),
      h('p', { className: 'mt-1 text-xs text-canvas-text-secondary' }, '可以自行设置，也可以直接使用默认参数生成。已指定的要求会保留。'),
      ...items.map(item => {
        const original = request.items.find(entry => entry.id === item.id), model = modelFor(item);
        const options = request.models.filter(entry => entry.kind === original.kind);
        return h('fieldset', { key: item.id, disabled: submitted || approval.status !== 'pending', className: 'mt-3 space-y-2 border-t border-amber-300/15 pt-2.5' },
          h('legend', { className: 'text-xs text-canvas-text' }, original.label),
          h('label', { className: 'block text-xs text-canvas-text-secondary' }, '生成模型',
            h('select', { className: 'ui-select__control w-full mt-1', 'aria-label': `${original.label}生成模型`, value: item.modelRef,
              onChange: event => {
                const next = request.models.find(entry => entry.modelRef === event.target.value);
                const values = Object.fromEntries((next?.fields ?? []).filter(field => item.values[field.key] !== undefined).map(field => [field.key, item.values[field.key]]));
                for (const field of next?.fields ?? []) if (field.options.length === 1 && values[field.key] === undefined) values[field.key] = field.options[0];
                update(item.id, { modelRef: event.target.value, values });
              } },
            h('option', { value: '' }, '请选择模型'),
            !options.some(option => option.modelRef === item.modelRef) && item.modelRef ? h('option', { value: item.modelRef, disabled: true }, '当前模型参数能力未配置，请选择其他模型') : null,
            ...options.map(option => h('option', { key: option.modelRef, value: option.modelRef, disabled: !mediaModelAvailability[option.modelRef] }, option.label)))),
          ...(model?.fields ?? []).map(field => {
            const value = item.values[field.key] ?? '';
            const known = field.options.some(option => String(option).toLowerCase() === String(value).toLowerCase());
            const selected = known ? field.options.find(option => String(option).toLowerCase() === String(value).toLowerCase()) : value;
            const props = { 'aria-label': `${original.label}${field.label}`, className: 'ui-select__control w-full mt-1', value: selected,
              onChange: event => update(item.id, { values: { ...item.values, [field.key]: event.target.value === '' ? undefined : field.type === 'number' ? Number(event.target.value) : event.target.value } }) };
            return h('label', { key: field.key, className: 'block text-xs text-canvas-text-secondary' }, field.label,
              original.values[field.key] !== undefined ? h('span', { className: 'ml-1 text-canvas-text-muted' }, '（已指定，可修改）') : null,
              field.unavailable ? h('p', { role: 'alert', className: 'text-amber-300' }, '模型未提供此参数的有效范围，请更换模型或完善配置')
                : field.options.length ? h('select', props, h('option', { value: '' }, '请选择'),
                  value !== '' && !known ? h('option', { value, disabled: true }, `${value}（当前模型不支持）`) : null,
                  ...field.options.map(option => h('option', { key: String(option), value: option }, String(option))))
                  : h('input', { ...props, className: 'ui-input w-full mt-1', type: 'number', min: field.minimum, max: field.maximum, step: field.step,
                    placeholder: `${field.minimum}–${field.maximum}` }));
          }),
          model?.fields.some(field => missing(item.values[field.key])) ? h('p', { className: 'text-xs text-canvas-text-secondary' },
            '未设置项的默认值：', model.fields.filter(field => missing(item.values[field.key])).map(field => `${field.label} ${field.suggested ?? '未配置'}`).join('、')) : null,
          model?.fields.every(field => field.suggested !== undefined) ? h('button', { type: 'button', className: 'ui-btn ui-btn--sm',
            onClick: () => update(item.id, { values: withDefaults(item).values }) }, '填入默认值') : null);
      }),
      error || invalid && defaultInvalid ? h('p', { role: 'status', className: 'mt-2 text-xs text-amber-300' }, error || (hasMissing ? `当前参数无法直接生成：${defaultInvalid}。可自行设置或更换模型。` : invalid)) : null,
      h('div', { className: 'mt-3 flex flex-wrap justify-end gap-2' },
        h('button', { type: 'button', disabled: submitted || approval.status !== 'pending', className: 'ui-btn ui-btn--sm', onClick: () => submit(false) }, '取消本次生成'),
        hasMissing ? h('button', { type: 'button', disabled: submitted || !!defaultInvalid, className: 'ui-btn ui-btn--sm', onClick: () => submit(true, true) }, '使用默认参数生成') : null,
        h('button', { type: 'button', disabled: submitted || !!invalid, className: 'ui-btn ui-btn--sm', onClick: () => submit(true) }, submitted ? '已提交' : '确认并生成')));
  };
}
