UPDATE ai_model_configs
SET
  model_code = 'cosyvoice-v2',
  display_name = 'CosyVoice V2',
  provider_name = 'aliyun-bailian',
  provider_model = 'cosyvoice-v2',
  provider_protocol = 'aliyun_bailian_audio',
  invocation_mode = 'sync',
  media_type = 'audio',
  task_modes_json = '["audio.text_to_speech"]'::jsonb,
  capabilities_json = '{"text":true,"voice":true}'::jsonb,
  parameter_schema_json = jsonb_build_object(
    'text', jsonb_build_object('type', 'string', 'required', true, 'maxLength', 20000),
    'voice', jsonb_build_object(
      'type', 'enum', 'label', '音色', 'required', true,
      'options', to_jsonb(ARRAY[
        'longyingxiao','longjiqi','longhouge','longjixin','longanyue','longshange','longanmin','longdaiyu','longgaoseng','longanli','longanlang','longanwen','longanyun','longyumi_v2','longxiaochun_v2','longxiaoxia_v2','longyichen','longwanjun','longlaobo','longlaoyi','longbaizhi','longsanshu','longxiu_v2','longmiao_v2','longyue_v2','longnan_v2','longyuan_v2','longanqin','longanya','longanshuo','longanling','longanzhi','longanrou','longqiang_v2','longhan_v2','longxing_v2','longhua_v2','longwan_v2','longcheng_v2','longfeifei_v2','longxiaocheng_v2','longzhe_v2','longyan_v2','longtian_v2','longze_v2','longshao_v2','longhao_v2','kabuleshen_v2','longhuhu','longanpei','longwangwang','longpaopao','longshanshan','longniuniu','longyingmu','longyingxun','longyingcui','longyingda','longyingjing','longyingyan','longyingtian','longyingbing','longyingtao','longyingling','longanran','longanxuan','longanchong','longanping','longjielidou_v2','longling_v2','longke_v2','longxian_v2','longlaotie_v2','longjiayi_v2','longtao_v2','longfei_v2','libai_v2','longjin_v2','longshu_v2','loongbella_v2','longshuo_v2','longxiaobai_v2','longjing_v2','loongstella_v2','loongyuuna_v2','loongyuuma_v2','loongjihun_v2','loongeva_v2','loongbrian_v2','loongluna_v2','loongluca_v2','loongemily_v2','loongeric_v2','loongabby_v2','loongannie_v2','loongandy_v2','loongava_v2','loongbeth_v2','loongbetty_v2','loongcindy_v2','loongcally_v2','loongdavid_v2','loongdonna_v2','loongkyong_v2','loongtomoka_v2','loongtomoya_v2'
      ]::text[])
    ),
    'format', jsonb_build_object('type', 'enum', 'label', '格式', 'options', to_jsonb(ARRAY['mp3','pcm','wav','opus']::text[])),
    'sampleRate', jsonb_build_object('type', 'enum', 'label', '采样率', 'options', to_jsonb(ARRAY[8000,16000,22050,24000,44100,48000]::integer[])),
    'volume', jsonb_build_object('type', 'integer', 'label', '音量', 'minimum', 0, 'maximum', 100, 'step', 1),
    'rate', jsonb_build_object('type', 'number', 'label', '语速', 'minimum', 0.5, 'maximum', 2, 'step', 0.05),
    'pitch', jsonb_build_object('type', 'number', 'label', '声调', 'minimum', 0.5, 'maximum', 2, 'step', 0.05)
  ),
  default_params_json = '{"voice":"longxiaochun_v2","format":"mp3","sampleRate":22050,"volume":50,"rate":1,"pitch":1}'::jsonb,
  provider_config_json = '{"baseURL":"https://dashscope.aliyuncs.com","createTaskEndpoint":"/api/v1/services/audio/tts/SpeechSynthesizer","apiKeyEnv":"ALIYUNBAILIAN_API_KEY","timeoutMs":120000}'::jsonb,
  limits_json = '{"maxPromptLength":20000,"maxTextLength":20000,"allowedFormats":["mp3","pcm","wav","opus"],"allowedSampleRates":[8000,16000,22050,24000,44100,48000]}'::jsonb,
  ui_config_json = '{"label":"CosyVoice V2","group":"阿里云百炼","recommended":true,"visible":true,"pipeline":"audio","supportedModes":["text_to_speech"]}'::jsonb,
  remark = '官方 CosyVoice V2 非流式 HTTP 同步接口。平台保守默认计费 30 积分/任务，可由管理员配置；不是供应商货币报价。voice 必填，只启用已真实透传的 text、voice、format、sampleRate、volume、rate、pitch。',
  updated_at = now()
WHERE id = '70000000-0000-4000-8000-00000000a001';

UPDATE ai_model_dispatch_policies
SET
  submit_queue_name = 'generation-submit-image',
  poll_queue_name = NULL,
  finalize_queue_name = 'generation-finalize-artifact',
  polling_concurrency_limit = 1,
  polling_backoff_json = '{}'::jsonb,
  retry_policy_json = '{"submitAttempts":3,"finalizeAttempts":3}'::jsonb,
  updated_at = now()
WHERE model_config_id = '70000000-0000-4000-8000-00000000a001';
