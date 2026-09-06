import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, it } from "node:test";

import {
  canvasApiPaths,
  canvasArtifactApiPaths,
  canvasGenerationHistoryApiPaths,
  canvasRuntimeApiPaths,
  canvasSettingsApiPaths,
  legacyCanvasApiPaths,
} from "../canvas-api.contract.ts";

const openApi = JSON.parse(
  readFileSync(resolve(process.cwd(), "docs/api/canvas.openapi.json"), "utf8"),
) as {
  openapi: string;
  security: Array<Record<string, unknown>>;
  paths: Record<string, Record<string, {
    operationId?: string;
    requestBody?: {
      $ref?: string;
      content?: Record<string, { schema?: { $ref?: string } }>;
    };
    responses?: Record<string, {
      content?: Record<string, { schema?: { $ref?: string } }>;
    }>;
  }>>;
  components: {
    securitySchemes: { cookieAuth: { name: string } };
    schemas: Record<string, {
      required?: string[];
      properties?: Record<string, unknown>;
      additionalProperties?: boolean;
    }>;
  };
};

describe("Canvas API contract", () => {
  it("publishes every formal Canvas resource path in OpenAPI", () => {
    assert.equal(openApi.openapi, "3.1.0");
    assert.deepEqual(openApi.security, [{ cookieAuth: [] }]);
    assert.equal(openApi.components.securitySchemes.cookieAuth.name, "auth_session");
    assert.deepEqual(
      Object.keys(openApi.paths).sort(),
      [...Object.values(canvasApiPaths), ...Object.values(canvasGenerationHistoryApiPaths), ...Object.values(canvasSettingsApiPaths), ...Object.values(canvasArtifactApiPaths), ...Object.values(canvasRuntimeApiPaths)].sort(),
    );
    assert.deepEqual(
      Object.values(openApi.paths)
        .flatMap((path) => Object.values(path))
        .map((operation) => operation.operationId)
        .filter(Boolean)
        .sort(),
      [
        "createCanvas",
        "deleteCanvas",
        "deleteCanvasGenerationHistory",
        "deleteCanvasGenerationRun",
        "getCanvas",
        "getCanvasDocument",
        "getCanvasRevision",
        "getCanvasSettings",
        "listCanvasRevisions",
        "listCanvasGenerationHistory",
        "listCanvases",
        "restoreCanvas",
        "saveCanvasDocument",
        "updateCanvas",
        "updateCanvasArtifactTags",
        "updateCanvasSettings",
        "getCanvasHead",
        "streamCanvasLiveEvents",
        "recordCanvasFrontendError",
        "runCanvasNode",
        "selectCanvasArtifact",
        "listCanvasNodeRuns",
        "exportCanvasVideo",
        "createCanvasGenerationBatch",
        "getCanvasGenerationBatch",
        "reconcileCanvasGenerationBatch",
        "cancelCanvasGenerationBatch",
        "listCanvasConversations",
        "createCanvasConversation",
        "updateCanvasConversation",
        "deleteCanvasConversation",
        "listCanvasConversationMessages",
        "createCanvasAgentTask",
        "listCanvasConversationFileGrants",
        "createCanvasConversationFileGrant",
        "deleteCanvasConversationFileGrant",
        "listCanvasAgentTaskEvents",
        "approveCanvasAgentTask",
        "pauseCanvasAgentTask",
        "resumeCanvasAgentTask",
        "stopCanvasAgentTask",
        "replanCanvasAgentTask",
        "interjectCanvasAgentTask",
        "rewindCanvasAgentTask",
        "listCanvasAgentModels",
        "createCanvasDerivation",
        "getCanvasDerivation",
        "attachCanvasDerivationTask",
        "completeCanvasDerivation",
        "failCanvasDerivation",
        "listCanvasAnnotationLayers",
        "createCanvasAnnotationLayer",
        "createCanvasDirectorArtifact",
      ].sort(),
    );
  });

  it("documents existing Canvas runtime handlers with explicit commands and SSE responses", () => {
    assert.deepEqual(Object.keys(openApi.paths[canvasRuntimeApiPaths.nodeRun] ?? {}), ["parameters", "post"]);
    assert.equal(
      openApi.paths[canvasRuntimeApiPaths.nodeRun]?.post?.requestBody?.$ref,
      "#/components/requestBodies/CanvasNodeRun",
    );
    assert.equal(
      openApi.paths[canvasRuntimeApiPaths.generationBatches]?.post?.requestBody?.$ref,
      "#/components/requestBodies/CreateCanvasGenerationBatch",
    );
    assert.equal(openApi.paths[canvasRuntimeApiPaths.live]?.get?.operationId, "streamCanvasLiveEvents");
    assert.ok(Object.hasOwn(openApi.paths[canvasRuntimeApiPaths.agentTaskEvents]?.get?.responses ?? {}, "200"));
    assert.equal(
      openApi.paths[canvasRuntimeApiPaths.directorArtifacts]?.post?.requestBody?.$ref,
      "#/components/requestBodies/CreateCanvasDirectorArtifact",
    );
  });

  it("documents Canvas artifact tag updates with bounded tags", () => {
    const artifactPath = openApi.paths[canvasArtifactApiPaths.tags];
    assert.deepEqual(Object.keys(artifactPath ?? {}).filter((key) => key !== "parameters"), ["patch"]);
    assert.equal(artifactPath?.patch?.operationId, "updateCanvasArtifactTags");
    assert.equal(
      artifactPath?.patch?.requestBody?.content?.["application/json"]?.schema?.$ref,
      "#/components/schemas/UpdateCanvasArtifactTagsRequest",
    );
    assert.equal(
      artifactPath?.patch?.responses?.["200"]?.content?.["application/json"]?.schema?.$ref,
      "#/components/schemas/CanvasArtifactTagsEnvelope",
    );
    const request = openApi.components.schemas.UpdateCanvasArtifactTagsRequest as {
      required?: string[];
      properties?: Record<string, { maxItems?: number; items?: { minLength?: number; maxLength?: number } }>;
      additionalProperties?: boolean;
    } | undefined;
    assert.deepEqual(request?.required, ["tags"]);
    assert.equal(request?.properties?.tags?.maxItems, 12);
    assert.equal(request?.properties?.tags?.items?.minLength, 1);
    assert.equal(request?.properties?.tags?.items?.maxLength, 32);
    assert.equal(request?.additionalProperties, false);
  });

  it("keeps legacy paths explicit without advertising them as the formal API", () => {
    for (const path of Object.values(legacyCanvasApiPaths)) {
      assert.equal(Object.hasOwn(openApi.paths, path), false, path);
    }
  });

  it("documents Canvas settings revisions, stable style assets, and output-default switches", () => {
    const settingsPath = openApi.paths[canvasSettingsApiPaths.item];
    assert.deepEqual(Object.keys(settingsPath ?? {}).filter((key) => key !== "parameters").sort(), ["get", "patch"]);
    assert.equal(settingsPath?.get?.operationId, "getCanvasSettings");
    assert.equal(settingsPath?.patch?.operationId, "updateCanvasSettings");
    assert.equal(
      settingsPath?.patch?.requestBody?.content?.["application/json"]?.schema?.$ref,
      "#/components/schemas/UpdateCanvasSettingsRequest",
    );
    assert.equal(
      settingsPath?.get?.responses?.["200"]?.content?.["application/json"]?.schema?.$ref,
      "#/components/schemas/CanvasSettingsEnvelope",
    );
    assert.equal(
      settingsPath?.patch?.responses?.["200"]?.content?.["application/json"]?.schema?.$ref,
      "#/components/schemas/CanvasSettingsEnvelope",
    );
    assert.ok(Object.hasOwn(settingsPath?.patch?.responses ?? {}, "404"));
    const request = openApi.components.schemas.UpdateCanvasSettingsRequest;
    assert.deepEqual(request?.required, ["expectedRevision", "patch"]);
    const settings = openApi.components.schemas.CanvasSettings;
    assert.deepEqual(settings?.required, ["schemaVersion", "appearance", "visualStyle", "promptSuffixes", "defaultModels", "generation"]);
    const appearance = settings?.properties?.appearance as {
      properties?: Record<string, unknown>;
      additionalProperties?: boolean;
    } | undefined;
    const mascotPosition = appearance?.properties?.mascotPosition as {
      oneOf?: Array<{
        type?: string;
        required?: string[];
        properties?: Record<string, { type?: string; minimum?: number; maximum?: number }>;
        additionalProperties?: boolean;
      }>;
    } | undefined;
    assert.equal(appearance?.additionalProperties, false);
    assert.deepEqual(mascotPosition?.oneOf?.map((schema) => schema.type), ["null", "object"]);
    assert.deepEqual(mascotPosition?.oneOf?.[1]?.required, ["x", "y"]);
    assert.deepEqual(mascotPosition?.oneOf?.[1]?.properties?.x, { type: "number", minimum: 0, maximum: 1 });
    assert.deepEqual(mascotPosition?.oneOf?.[1]?.properties?.y, { type: "number", minimum: 0, maximum: 1 });
    assert.equal(mascotPosition?.oneOf?.[1]?.additionalProperties, false);
    const appearancePatch = openApi.components.schemas.CanvasAppearancePatch as {
      properties?: Record<string, unknown>;
    } | undefined;
    assert.deepEqual(
      (appearancePatch?.properties?.mascotPosition as typeof mascotPosition | undefined)?.oneOf,
      mascotPosition?.oneOf,
    );
    assert.ok(Object.hasOwn(settings?.properties ?? {}, "visualStyle"));
    const visualStyle = (settings?.properties?.visualStyle as { properties?: Record<string, unknown>; required?: string[] } | undefined);
    assert.ok(visualStyle?.required?.includes("styleReferenceEnabled"));
    assert.deepEqual(
      (visualStyle?.properties?.styleReferenceEnabled as { type?: string } | undefined)?.type,
      "boolean",
    );
    const generation = openApi.components.schemas.CanvasGenerationDefaults;
    assert.deepEqual(generation?.required, ["imageAspectRatio", "imageSize", "imageFollowNode", "videoResolution", "videoDuration", "videoFollowNode"]);
    assert.equal(openApi.components.schemas.CanvasSettingsPatch?.additionalProperties, false);
    const limits = openApi.components.schemas.CanvasProductLimits;
    assert.deepEqual(limits?.required, ["document", "generation", "member"]);
    assert.deepEqual(
      (limits?.properties?.document as { required?: string[] } | undefined)?.required,
      ["maximumBytes", "maximumNodes", "maximumEdges", "maximumJsonDepth"],
    );
    assert.deepEqual(
      (limits?.properties?.generation as { required?: string[] } | undefined)?.required,
      ["maximumBatchNodes", "billingPolicy", "reservationPolicy", "modelLimitsPolicy"],
    );
    assert.deepEqual(
      (limits?.properties?.member as { required?: string[] } | undefined)?.required,
      ["billingPolicy"],
    );
  });
});
