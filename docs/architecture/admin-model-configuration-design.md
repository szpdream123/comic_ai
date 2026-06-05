# Admin Model Configuration Design

## Goal

The admin model configuration page must describe real backend routing and provider payloads, not only UI labels. A model config should be enough for the backend to:

1. Validate user-selected generation parameters.
2. Render the correct creator/admin controls.
3. Convert platform parameters into provider request payload fields.
4. Estimate credits before task creation.
5. Route tasks to the right provider adapter and queue.

This document focuses on the static admin page and the future backend contract it should represent. It does not require changing the current code immediately.

## Placement

The static admin UI lives in `apps/admin/`, as documented in `docs/architecture/admin-static-placement.md`.

Recommended first model pages:

```text
apps/admin/
  models.html
  model-detail.html
```

The first version can use mock model records, but the mock records should use the same shape as `ai_model_configs` and `ai_model_dispatch_policies`.

## Existing Database Fit

The current schema already has the right high-level columns:

- `ai_model_configs.task_modes_json`
- `ai_model_configs.capabilities_json`
- `ai_model_configs.parameter_schema_json`
- `ai_model_configs.default_params_json`
- `ai_model_configs.provider_config_json`
- `ai_model_configs.pricing_json`
- `ai_model_configs.limits_json`
- `ai_model_configs.ui_config_json`
- `ai_model_dispatch_policies.*`

The admin page should make these fields editable through structured controls. It should not reduce model configuration to a flat table.

## Model Config Shape

Use this conceptual shape in admin mock data and future backend DTOs:

```json
{
  "modelCode": "seedance-2-fast-video",
  "displayName": "Seedance 2.0 Fast",
  "providerName": "volcengine",
  "providerModel": "doubao-seedance-2-0-fast-250528",
  "providerProtocol": "volcengine_ark_video",
  "invocationMode": "async_polling",
  "mediaType": "video",
  "taskModes": ["video.text_to_video", "video.image_to_video", "video.reference_guided_video"],
  "capabilities": {},
  "parameterSchema": {},
  "defaultParams": {},
  "providerConfig": {},
  "pricing": {},
  "limits": {},
  "uiConfig": {},
  "dispatchPolicy": {}
}
```

## Video Model Configuration

### Core Fields

Video models need these admin fields:

| Field | Purpose |
| --- | --- |
| `modelCode` | Stable platform model ID sent by frontend/business routes. |
| `providerModel` | Exact upstream model name sent to provider. |
| `providerProtocol` | Adapter selector, for example `volcengine_ark_video`, `custom_http`, `kling_video`, `runway_video`. |
| `invocationMode` | `sync`, `async_polling`, `webhook`, or `stream`. Video is usually async. |
| `taskModes` | Text-to-video, image-to-video, first/last-frame video, reference-guided video, video-to-video. |
| `parameterSchema` | User-selectable controls and validation. |
| `defaultParams` | Defaults used when frontend omits a field. |
| `capabilities` | Whether the model supports first frame, last frame, image refs, video refs, audio refs, seed, audio generation. |
| `limits` | Prompt length, reference counts, MIME types, max file size, duration limits. |
| `providerConfig` | Endpoint, query endpoint, API key env name, request field mapping. |
| `pricing` | Base credits and multipliers by duration, resolution, count, mode. |

### Seedance 2.0 Fast Example

This should match the kind of controls shown in the screenshot: video ratio, resolution, duration mode, seconds slider, output count, image/audio/video references.

```json
{
  "modelCode": "seedance-2-fast-video",
  "displayName": "Seedance 2.0 Fast",
  "providerName": "volcengine",
  "providerModel": "doubao-seedance-2-0-fast-250528",
  "providerProtocol": "volcengine_ark_video",
  "invocationMode": "async_polling",
  "mediaType": "video",
  "taskModes": [
    "video.text_to_video",
    "video.image_to_video",
    "video.first_last_frame",
    "video.reference_guided_video"
  ],
  "capabilities": {
    "prompt": true,
    "firstFrame": true,
    "lastFrame": true,
    "referenceImages": { "enabled": true, "max": 9 },
    "referenceVideos": { "enabled": true, "max": 3 },
    "referenceAudios": { "enabled": true, "max": 3 },
    "generateAudio": true,
    "seed": false,
    "watermark": true
  },
  "parameterSchema": {
    "aspectRatio": {
      "type": "enum",
      "label": "视频比例",
      "providerField": "ratio",
      "enum": ["21:9", "16:9", "4:3", "1:1", "3:4", "9:16", "adaptive"],
      "uiLabels": { "adaptive": "智能" }
    },
    "resolution": {
      "type": "enum",
      "label": "分辨率",
      "providerField": "resolution",
      "enum": ["480p", "720p", "1080p"]
    },
    "durationMode": {
      "type": "enum",
      "label": "视频时长模式",
      "enum": ["seconds", "adaptive"],
      "uiLabels": { "seconds": "按秒数", "adaptive": "智能时长" }
    },
    "durationSec": {
      "type": "integer",
      "label": "视频时长",
      "providerField": "duration",
      "minimum": 4,
      "maximum": 15,
      "unit": "秒",
      "visibleWhen": { "durationMode": "seconds" }
    },
    "count": {
      "type": "integer",
      "label": "选择生成数量",
      "providerField": "count",
      "minimum": 1,
      "maximum": 1,
      "unit": "条"
    },
    "generateAudio": {
      "type": "boolean",
      "label": "生成音频",
      "providerField": "generate_audio"
    },
    "watermark": {
      "type": "boolean",
      "label": "水印",
      "providerField": "watermark"
    }
  },
  "defaultParams": {
    "aspectRatio": "adaptive",
    "resolution": "720p",
    "durationMode": "seconds",
    "durationSec": 4,
    "count": 1,
    "generateAudio": true,
    "watermark": false
  },
  "limits": {
    "promptMaxLength": 2000,
    "referenceImages": {
      "max": 9,
      "allowedMimeTypes": ["image/jpeg", "image/png", "image/webp"],
      "maxBytesEach": 10485760
    },
    "referenceVideos": {
      "max": 3,
      "allowedMimeTypes": ["video/mp4", "video/quicktime"],
      "maxBytesEach": 52428800,
      "maxDurationSecEach": 15
    },
    "referenceAudios": {
      "max": 3,
      "allowedMimeTypes": ["audio/mpeg", "audio/wav", "audio/mp4"],
      "maxBytesEach": 20971520,
      "maxDurationSecEach": 15
    }
  },
  "providerConfig": {
    "baseURL": "https://ark.cn-beijing.volces.com",
    "createTaskEndpoint": "/api/v3/contents/generations/tasks",
    "queryTaskEndpoint": "/api/v3/contents/generations/tasks/{taskId}",
    "apiKeyEnv": "VOLCENGINE_ARK_API_KEY",
    "timeoutMs": 120000,
    "requestFormat": "volcengine_ark_contents_generation"
  },
  "pricing": {
    "baseCredits": 120,
    "unit": "video",
    "durationMultipliers": {
      "4": 1,
      "5": 1.15,
      "10": 1.8,
      "15": 2.5
    },
    "resolutionMultipliers": {
      "480p": 0.8,
      "720p": 1,
      "1080p": 1.6
    },
    "countMultiplierField": "count"
  }
}
```

### Provider Payload Mapping

The backend should turn the above platform params into an upstream request similar to:

```json
{
  "model": "doubao-seedance-2-0-fast-250528",
  "content": [
    { "type": "text", "text": "角色从雨夜街口转身，镜头缓慢推进" },
    {
      "type": "image_url",
      "role": "first_frame",
      "image_url": { "url": "https://cdn.example.com/first.png" }
    },
    {
      "type": "image_url",
      "role": "last_frame",
      "image_url": { "url": "https://cdn.example.com/last.png" }
    },
    {
      "type": "image_url",
      "role": "reference_image",
      "image_url": { "url": "https://cdn.example.com/character.png" }
    },
    {
      "type": "video_url",
      "role": "reference_video",
      "video_url": { "url": "https://cdn.example.com/motion.mp4" }
    },
    {
      "type": "audio_url",
      "role": "reference_audio",
      "audio_url": { "url": "https://cdn.example.com/voice.wav" }
    }
  ],
  "ratio": "adaptive",
  "resolution": "720p",
  "duration": 4,
  "count": 1,
  "generate_audio": true,
  "watermark": false
}
```

The exact provider field names may differ by provider. The important requirement is that `parameterSchema.*.providerField` and `providerConfig.requestFormat` describe the mapping clearly enough that the adapter can build the payload deterministically.

### Video Dependency Rules

The admin should support dependency rules so invalid combinations cannot be enabled:

```json
{
  "rules": [
    {
      "when": { "taskMode": "video.first_last_frame" },
      "requires": ["firstFrame"],
      "allows": ["lastFrame"],
      "disallows": ["referenceVideos", "referenceAudios"]
    },
    {
      "when": { "taskMode": "video.reference_guided_video" },
      "allows": ["referenceImages", "referenceVideos", "referenceAudios"],
      "disallows": ["lastFrame"]
    }
  ]
}
```

## Image Model Configuration

### Core Fields

Image models need:

| Field | Purpose |
| --- | --- |
| `taskModes` | Text-to-image, image-to-image, edit, inpaint, outpaint, reference generate. |
| `size` / `aspectRatio` | Some providers use size strings; others use ratio. |
| `quality` | Provider-specific quality enum. |
| `count` | Number of images. |
| `outputFormat` | PNG, JPEG, WebP, or provider-specific. |
| `outputCompression` | Used for JPEG/WebP when supported. |
| `background` | Transparent/opaque/auto when supported. |
| `referenceImages` | Count, MIME, size, and whether multiple images are supported. |
| `mask` | Required for inpaint/edit flows when supported. |
| `seed`, `guidance`, `steps` | Common in Stable Diffusion/Flux-style providers. |
| `safety` | Moderation, person generation policy, watermark. |

### OpenAI Image Example

```json
{
  "modelCode": "gpt-image",
  "displayName": "GPT Image",
  "providerName": "openai",
  "providerModel": "gpt-image-1",
  "providerProtocol": "openai_images",
  "invocationMode": "sync",
  "mediaType": "image",
  "taskModes": [
    "image.text_to_image",
    "image.edit",
    "image.reference_generate"
  ],
  "capabilities": {
    "prompt": true,
    "referenceImages": { "enabled": true, "max": 16 },
    "mask": true,
    "transparentBackground": true,
    "multipleOutputs": true
  },
  "parameterSchema": {
    "size": {
      "type": "enum",
      "label": "图片尺寸",
      "providerField": "size",
      "enum": ["1024x1024", "1536x1024", "1024x1536", "auto"]
    },
    "quality": {
      "type": "enum",
      "label": "质量",
      "providerField": "quality",
      "enum": ["auto", "low", "medium", "high"]
    },
    "count": {
      "type": "integer",
      "label": "生成数量",
      "providerField": "n",
      "minimum": 1,
      "maximum": 4
    },
    "outputFormat": {
      "type": "enum",
      "label": "输出格式",
      "providerField": "output_format",
      "enum": ["png", "jpeg", "webp"]
    },
    "outputCompression": {
      "type": "integer",
      "label": "输出压缩",
      "providerField": "output_compression",
      "minimum": 0,
      "maximum": 100,
      "visibleWhen": { "outputFormat": ["jpeg", "webp"] }
    },
    "background": {
      "type": "enum",
      "label": "背景",
      "providerField": "background",
      "enum": ["auto", "opaque", "transparent"]
    },
    "moderation": {
      "type": "enum",
      "label": "安全审核",
      "providerField": "moderation",
      "enum": ["auto", "low"]
    }
  },
  "defaultParams": {
    "size": "1024x1536",
    "quality": "high",
    "count": 1,
    "outputFormat": "png",
    "background": "auto",
    "moderation": "auto"
  },
  "limits": {
    "promptMaxLength": 4000,
    "referenceImages": {
      "max": 16,
      "allowedMimeTypes": ["image/jpeg", "image/png", "image/webp"],
      "maxBytesEach": 20971520
    },
    "mask": {
      "allowedMimeTypes": ["image/png"],
      "requiresAlpha": true
    }
  },
  "providerConfig": {
    "baseURL": "https://api.openai.com",
    "endpoint": "/v1/images/generations",
    "editEndpoint": "/v1/images/edits",
    "apiKeyEnv": "OPENAI_API_KEY",
    "requestFormat": "openai_images"
  },
  "pricing": {
    "baseCredits": 90,
    "unit": "image",
    "qualityMultipliers": {
      "low": 0.7,
      "medium": 1,
      "high": 1.5
    },
    "sizeMultipliers": {
      "1024x1024": 1,
      "1536x1024": 1.25,
      "1024x1536": 1.25
    },
    "countMultiplierField": "count"
  }
}
```

### OpenAI Image Payload Example

```json
{
  "model": "gpt-image-1",
  "prompt": "A clean storyboard frame",
  "size": "1536x1024",
  "quality": "high",
  "n": 2,
  "output_format": "webp",
  "output_compression": 80,
  "background": "transparent",
  "moderation": "low"
}
```

For image edit/reference flows, the provider adapter should switch to multipart form data and include `image` files and optional `mask`, while preserving the same configured params.

## Admin Page Structure

### Model List

Columns:

- Model code
- Display name
- Provider
- Media type
- Task modes
- Status
- Default resolution/size
- Default duration/count
- Pricing summary
- Queue
- Updated at

### Model Detail Tabs

1. **Basic**
   - Model code, display name, provider, provider model, protocol, invocation mode, status.
2. **Capabilities**
   - First frame, last frame, reference image/video/audio, mask, seed, audio generation, transparent background.
3. **Parameters**
   - Config-driven controls: segmented ratio selector, resolution selector, duration mode tabs, sliders, count stepper, toggles.
4. **Inputs And Limits**
   - MIME types, max count, max bytes, max duration, prompt limit.
5. **Provider Routing**
   - Endpoint, query endpoint, request format, API key env name. Never show raw secret values.
6. **Pricing**
   - Base credits, multipliers, per-duration/per-resolution/per-count rules.
7. **Dispatch**
   - Submit queue, poll queue, finalize queue, RPM, concurrency, polling backoff, retry policy.
8. **Payload Preview**
   - Shows the generated provider payload from the current defaults or sample user selections.

## Backend Validation Requirements

Future implementation should validate in this order:

1. Resolve `modelCode` to active `ai_model_configs`.
2. Confirm requested `taskMode` is in `task_modes_json`.
3. Merge request parameters with `default_params_json`.
4. Validate merged params against `parameter_schema_json`.
5. Validate uploaded/reference media against `limits_json`.
6. Enforce dependency rules.
7. Estimate credits from `pricing_json`.
8. Build provider payload using `provider_config_json.requestFormat` and `parameterSchema.*.providerField`.
9. Store the redacted platform request and redacted provider request for audit.

## Credit Pricing Requirements

Every model configuration must include a pricing rule. The backend should never hardcode "one model equals one fixed credit price" unless that model truly has no configurable cost variables.

Credit consumption is determined by:

1. Model: different upstream models have different base costs.
2. Task mode: text-to-image, image edit, image-to-video, reference-guided video, and video-to-video can cost differently.
3. Output parameters: resolution, size, quality, duration, count, audio generation, and reference modes can change cost.
4. Input materials: some providers charge more for image/video/audio references or advanced edit modes.
5. Output count: generating multiple images/videos multiplies or otherwise increases cost.

The backend must calculate credits from the same merged parameters that will be sent to the model provider. This prevents a mismatch where the UI shows one cost but the provider receives a more expensive request.

### Pricing Config Shape

Use `pricing_json` for calculation rules:

```json
{
  "currency": "credits",
  "unit": "video",
  "baseCredits": 120,
  "minimumCredits": 120,
  "rounding": "ceil",
  "modeMultipliers": {
    "video.text_to_video": 1,
    "video.image_to_video": 1.1,
    "video.first_last_frame": 1.25,
    "video.reference_guided_video": 1.4
  },
  "parameterMultipliers": {
    "resolution": {
      "480p": 0.8,
      "720p": 1,
      "1080p": 1.6
    },
    "durationSec": {
      "4": 1,
      "5": 1.15,
      "10": 1.8,
      "15": 2.5
    }
  },
  "parameterAddons": {
    "generateAudio": {
      "true": 20,
      "false": 0
    }
  },
  "referenceAddons": {
    "referenceImages": { "creditsEach": 3 },
    "referenceVideos": { "creditsEach": 15 },
    "referenceAudios": { "creditsEach": 8 }
  },
  "countField": "count",
  "countPricing": "multiply_total",
  "formula": "ceil(max(minimumCredits, (baseCredits * modeMultiplier * resolutionMultiplier * durationMultiplier * count) + addons))"
}
```

For image models:

```json
{
  "currency": "credits",
  "unit": "image",
  "baseCredits": 90,
  "minimumCredits": 60,
  "rounding": "ceil",
  "modeMultipliers": {
    "image.text_to_image": 1,
    "image.reference_generate": 1.2,
    "image.edit": 1.35,
    "image.inpaint": 1.4,
    "image.outpaint": 1.45
  },
  "parameterMultipliers": {
    "quality": {
      "low": 0.7,
      "medium": 1,
      "high": 1.5,
      "auto": 1
    },
    "size": {
      "1024x1024": 1,
      "1536x1024": 1.25,
      "1024x1536": 1.25,
      "auto": 1.25
    }
  },
  "parameterAddons": {
    "background": {
      "transparent": 5,
      "opaque": 0,
      "auto": 0
    }
  },
  "referenceAddons": {
    "referenceImages": { "creditsEach": 4 },
    "mask": { "creditsWhenPresent": 8 }
  },
  "countField": "count",
  "countPricing": "multiply_total",
  "formula": "ceil(max(minimumCredits, (baseCredits * modeMultiplier * qualityMultiplier * sizeMultiplier * count) + addons))"
}
```

### Pricing Calculation Order

The backend should calculate credits in this order:

1. Start with `baseCredits`.
2. Apply task mode multiplier from `modeMultipliers`.
3. Apply parameter multipliers from `parameterMultipliers`.
4. Apply output count rule.
5. Add parameter addons.
6. Add reference/input addons.
7. Apply minimum credits.
8. Apply rounding.
9. Persist the full pricing breakdown with the task snapshot and credit reservation.

The pricing breakdown should be stored and returned in redacted form:

```json
{
  "modelCode": "seedance-2-fast-video",
  "taskMode": "video.reference_guided_video",
  "baseCredits": 120,
  "multipliers": {
    "mode": 1.4,
    "resolution": 1,
    "durationSec": 1
  },
  "count": 1,
  "addons": {
    "generateAudio": 20,
    "referenceImages": 6,
    "referenceVideos": 15,
    "referenceAudios": 8
  },
  "estimatedCredits": 217,
  "rounding": "ceil"
}
```

### Seedance Pricing Example

For this request:

```json
{
  "modelCode": "seedance-2-fast-video",
  "taskMode": "video.reference_guided_video",
  "parameters": {
    "aspectRatio": "adaptive",
    "resolution": "720p",
    "durationSec": 4,
    "count": 1,
    "generateAudio": true
  },
  "references": {
    "referenceImages": 2,
    "referenceVideos": 1,
    "referenceAudios": 1
  }
}
```

Example calculation:

```text
baseCredits = 120
modeMultiplier(video.reference_guided_video) = 1.4
resolutionMultiplier(720p) = 1
durationMultiplier(4s) = 1
count = 1
generateAudio addon = 20
referenceImages addon = 2 * 3 = 6
referenceVideos addon = 1 * 15 = 15
referenceAudios addon = 1 * 8 = 8

estimatedCredits = ceil((120 * 1.4 * 1 * 1 * 1) + 20 + 6 + 15 + 8)
estimatedCredits = 217
```

The backend must reserve 217 credits before dispatching this provider request.

### GPT Image Pricing Example

For this request:

```json
{
  "modelCode": "gpt-image",
  "taskMode": "image.text_to_image",
  "parameters": {
    "size": "1536x1024",
    "quality": "high",
    "count": 2,
    "outputFormat": "webp",
    "background": "transparent"
  },
  "references": {
    "referenceImages": 0
  }
}
```

Example calculation:

```text
baseCredits = 90
modeMultiplier(image.text_to_image) = 1
qualityMultiplier(high) = 1.5
sizeMultiplier(1536x1024) = 1.25
count = 2
transparent background addon = 5

estimatedCredits = ceil((90 * 1 * 1.5 * 1.25 * 2) + 5)
estimatedCredits = 343
```

The backend must reserve 343 credits before sending this image request.

### Admin Pricing UI

The model detail page should include a **Pricing** tab with:

- Base credits.
- Mode multipliers.
- Parameter multipliers.
- Per-reference addons.
- Count pricing rule.
- Minimum credits.
- Rounding rule.
- Live "sample request cost" preview.
- Generated breakdown JSON preview.

The UI should let an operator select sample parameters like ratio, resolution, duration, count, references, and quality, then immediately show the estimated credits. This makes it obvious whether the configuration produces sane pricing before it is enabled.

### Pricing Safety Rules

- A model cannot be set to `active` without `pricing_json`.
- A model cannot be set to `active` if any user-selectable parameter lacks either a pricing rule or an explicit `noCostImpact: true`.
- If a request contains an unknown parameter value, the backend must reject the request instead of silently using the cheapest price.
- Credit estimation and provider payload construction must use the same normalized parameter object.
- The task snapshot should store both the final estimated credits and the pricing breakdown used.
- Manual admin edits to pricing must create an audit event.

## Recommended First Static Mock Models

Start with models that exercise different parameter needs:

- `seedance-2-fast-video`: video ratio, resolution, duration, count, first/last frame, image/video/audio references.
- `seedance-2-pro-video`: similar to fast but higher quality/default pricing.
- `kling-video`: image-to-video with duration and quality mode.
- `runway-gen4-video`: reference image/video constraints and fixed output ratios.
- `luma-ray-video`: keyframes, loop, aspect ratio.
- `gpt-image`: image size, quality, count, output format, background, edit/mask.
- `imagen`: aspect ratio, sample count, safety/person-generation controls.
- `flux-or-stable-image`: seed, guidance/CFG, steps, scheduler, output format.

## Non-Goals For The Static Page

- No real API calls.
- No raw API keys.
- No mutation of existing `apps/web` code.
- No assumption that every provider uses the same field names.
- No fake "universal" config that cannot be mapped to provider payloads.

## Sources Checked

- OpenAI image generation documentation for image size, quality, output format, compression, background, moderation, edits, and reference image flows.
- Volcengine/Ark Seedance API documentation for `content` based video requests, ratio, resolution, duration, multi-modal references, async create/query flow, and API key routing.
- Google Imagen/Veo, Runway, Luma, Kling, Stability/Flux style documentation patterns for common model configuration categories.

Provider docs evolve. Before implementing a real provider adapter, verify the exact current upstream request schema and update `providerConfig.requestFormat` plus adapter tests.
