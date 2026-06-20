UPDATE ai_model_configs
SET provider_config_json = COALESCE(provider_config_json, '{}'::jsonb) || jsonb_build_object(
  'inputSchema',
  '{
    "source": {
      "provider": "OpenAI Images API",
      "docUrl": "https://platform.openai.com/docs/guides/image-generation",
      "endpoints": ["/v1/images/generations", "/v1/images/edits"]
    },
    "generationRequest": {
      "model": { "type": "string", "required": true, "example": "gpt-image-2" },
      "prompt": { "type": "string", "required": true, "maxLength": 32000 },
      "size": { "type": "string", "required": false, "default": "1024x1536", "description": "gpt-image-2 supports standard sizes and flexible WIDTHxHEIGHT sizes within official limits." },
      "quality": { "type": "string", "required": false, "enum": ["low", "medium", "high"] },
      "output_format": { "type": "string", "required": false, "enum": ["png", "webp", "jpeg"] },
      "n": { "type": "integer", "required": false, "minimum": 1, "maximum": 4, "default": 1 },
      "response_format": { "type": "string", "required": false, "supported": false, "description": "Not supported for GPT image models; GPT image models return base64-encoded images." }
    },
    "editRequest": {
      "model": { "type": "string", "required": true, "example": "gpt-image-2" },
      "image[]": { "type": "file[]", "required": true, "maximum": 8, "contentTypes": ["image/jpeg", "image/png", "image/webp"] },
      "prompt": { "type": "string", "required": true, "maxLength": 32000 },
      "size": { "type": "string", "required": false, "default": "1024x1536" },
      "output_format": { "type": "string", "required": false, "enum": ["png", "webp", "jpeg"] },
      "response_format": { "type": "string", "required": false, "supported": false, "description": "Not supported for GPT image models; GPT image models return base64-encoded images." }
    }
  }'::jsonb,
  'outputSchema',
  '{
    "source": {
      "provider": "OpenAI Images API",
      "docUrl": "https://platform.openai.com/docs/api-reference/images"
    },
    "response": {
      "created": { "type": "integer", "required": false },
      "data": {
        "type": "array",
        "required": true,
        "items": {
          "b64_json": { "type": "string", "required": true, "description": "Base64 encoded image returned by GPT image models." },
          "url": { "type": "string", "required": false, "supported": false, "description": "URL output is not supported for GPT image models." },
          "revised_prompt": { "type": "string", "required": false }
        }
      }
    }
  }'::jsonb
)
WHERE model_code IN ('gpt-image-2-cn', 'gpt-image-2-reference-cn');

UPDATE ai_model_configs
SET provider_config_json = COALESCE(provider_config_json, '{}'::jsonb) || jsonb_build_object(
  'inputSchema',
  '{
    "source": {
      "provider": "Volcengine Ark / Seedream image generation",
      "docUrl": "https://www.volcengine.com/docs/82379/1541523",
      "endpoint": "/api/v3/images/generations"
    },
    "request": {
      "model": { "type": "string", "required": true, "examples": ["doubao-seedream-5-0-260128", "doubao-seedream-4-5-251128", "doubao-seedream-4-0"] },
      "prompt": { "type": "string", "required": true, "maxLength": 4000 },
      "content": {
        "type": "array",
        "required": false,
        "description": "Use text plus image_url items for image-to-image, edit, and multi-reference generation.",
        "items": {
          "type": { "type": "string", "enum": ["text", "image_url"] },
          "text": { "type": "string", "required": false },
          "image_url": {
            "type": "object",
            "required": false,
            "properties": { "url": { "type": "string", "format": "uri" } }
          }
        }
      },
      "size": { "type": "string", "required": false, "description": "Seedream image size or quality setting, for example 1K/2K/4K or a supported pixel size." },
      "ratio": { "type": "string", "required": false, "enum": ["1:1", "16:9", "9:16", "4:3", "3:4"] },
      "negative_prompt": { "type": "string", "required": false, "maxLength": 2000 },
      "response_format": { "type": "string", "required": false, "enum": ["url", "b64_json"] },
      "output_format": { "type": "string", "required": false, "enum": ["jpeg", "png", "webp"], "description": "Supported by Seedream 5.x models." },
      "seed": { "type": "integer", "required": false, "minimum": 0 },
      "watermark": { "type": "boolean", "required": false, "default": false }
    }
  }'::jsonb,
  'outputSchema',
  '{
    "source": {
      "provider": "Volcengine Ark / Seedream image generation",
      "docUrl": "https://www.volcengine.com/docs/82379/1541523"
    },
    "syncResponse": {
      "id": { "type": "string", "required": false },
      "created": { "type": "integer", "required": false },
      "data": {
        "type": "array",
        "required": false,
        "items": {
          "url": { "type": "string", "required": false, "format": "uri" },
          "b64_json": { "type": "string", "required": false },
          "revised_prompt": { "type": "string", "required": false }
        }
      }
    },
    "asyncResponse": {
      "id": { "type": "string", "required": false },
      "task_id": { "type": "string", "required": false },
      "status": { "type": "string", "required": false },
      "data": { "type": "object", "required": false }
    }
  }'::jsonb
)
WHERE model_code IN ('jimeng-5-image', 'jimeng-4-5-image', 'jimeng-4-0-image');

UPDATE ai_model_configs
SET provider_config_json = COALESCE(provider_config_json, '{}'::jsonb) || jsonb_build_object(
  'inputSchema',
  '{
    "source": {
      "provider": "Alibaba Cloud Model Studio / DashScope HappyHorse",
      "docUrl": "https://help.aliyun.com/zh/model-studio/happyhorse-reference-to-video-api-reference",
      "createTaskEndpoint": "/api/v1/services/aigc/video-generation/video-synthesis",
      "queryTaskEndpoint": "/api/v1/tasks/{taskId}"
    },
    "createTaskRequest": {
      "model": { "type": "string", "required": true, "example": "happyhorse-1.0-r2v" },
      "input": {
        "type": "object",
        "required": true,
        "properties": {
          "prompt": { "type": "string", "required": true, "maxLength": 800 },
          "media": {
            "type": "array",
            "required": true,
            "minItems": 1,
            "maxItems": 9,
            "items": {
              "type": { "type": "string", "required": true, "enum": ["reference_image"] },
              "url": { "type": "string", "required": true, "format": "uri" }
            }
          }
        }
      },
      "parameters": {
        "type": "object",
        "required": false,
        "properties": {
          "ratio": { "type": "string", "required": false, "enum": ["16:9", "9:16", "3:4", "4:3", "4:5", "5:4", "1:1", "9:21", "21:9"], "default": "16:9" },
          "duration": { "type": "integer", "required": false, "minimum": 3, "maximum": 15, "default": 5 },
          "resolution": { "type": "string", "required": false, "enum": ["720P", "1080P"], "default": "1080P" },
          "seed": { "type": "integer", "required": false, "minimum": 0, "maximum": 2147483647 },
          "watermark": { "type": "boolean", "required": false, "default": true }
        }
      }
    }
  }'::jsonb,
  'outputSchema',
  '{
    "source": {
      "provider": "Alibaba Cloud Model Studio / DashScope HappyHorse",
      "docUrl": "https://help.aliyun.com/zh/model-studio/happyhorse-reference-to-video-api-reference"
    },
    "createTaskResponse": {
      "request_id": { "type": "string", "required": false },
      "output": {
        "type": "object",
        "required": true,
        "properties": {
          "task_id": { "type": "string", "required": true },
          "task_status": { "type": "string", "required": true }
        }
      }
    },
    "queryTaskResponse": {
      "request_id": { "type": "string", "required": false },
      "output": {
        "type": "object",
        "required": true,
        "properties": {
          "task_id": { "type": "string", "required": false },
          "task_status": { "type": "string", "required": true },
          "video_url": { "type": "string", "required": false, "format": "uri" },
          "code": { "type": "string", "required": false },
          "message": { "type": "string", "required": false }
        }
      }
    }
  }'::jsonb
)
WHERE model_code = 'happyhorse-1.0-r2v';
