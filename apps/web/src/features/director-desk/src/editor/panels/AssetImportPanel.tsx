import { useState } from "react";
import { inspectCharacterAnimationFile } from "../loaders/characterAnimationInspection";
import { inspectCharacterAssetFile } from "../loaders/characterAssetInspection";
import { readLocalModelFile } from "../loaders/localModelImport";
import { useDirectorStore } from "../store/directorStore";

function getCharacterRigProfile(boneNames: string[]) {
  const names = boneNames.map((name) => name.toLowerCase().replace(/[^a-z0-9]/g, ""));
  if (names.some((name) => name.includes("mixamorig1"))) return "mixamo-alt" as const;
  if (names.some((name) => name.includes("mixamorig"))) return "mixamo" as const;
  return names.length ? "generic-humanoid" as const : "unknown" as const;
}

export function AssetImportPanel() {
  const addImportedAsset = useDirectorStore((state) => state.addImportedAsset);
  const addImportedAnimationAsset = useDirectorStore((state) => state.addImportedAnimationAsset);
  const assets = useDirectorStore((state) => state.project.assets);
  const [importError, setImportError] = useState<string | null>(null);

  const latestLocalModel = [...assets].reverse().find((item) => item.sourceType === "model");

  async function handleLocalModel(file: File) {
    setImportError(null);
    const result = await readLocalModelFile(file);
    addImportedAsset({ kind: "prop", ...result });
  }

  async function handleCharacterModel(file: File) {
    setImportError(null);
    const [report, result] = await Promise.all([inspectCharacterAssetFile(file), readLocalModelFile(file)]);
    if (report.readiness === "static-only") {
      throw new Error("该模型没有可用骨架，不能作为角色导入");
    }
    addImportedAsset({
      kind: "character",
      ...result,
      modelFormat: report.format,
      characterRigProfile: getCharacterRigProfile(report.boneNames),
      characterImportReadiness: report.readiness,
      characterBoneNames: report.boneNames,
      characterBoneMap: report.boneMap,
    });
  }

  async function handleCharacterAnimation(file: File) {
    setImportError(null);
    const [report, result] = await Promise.all([inspectCharacterAnimationFile(file), readLocalModelFile(file)]);
    if (!report.hasValidMotion) {
      throw new Error(report.warnings[0] ?? "未检测到可播放的角色动作");
    }
    addImportedAnimationAsset({
      ...result,
      modelFormat: report.format,
      rigProfile: report.rigProfile,
      clips: report.clips,
    });
  }

  return (
    <section className="panel-card">
      <h2>导入</h2>
      <label className="asset-import-item">
        导入本地模型
        <input
          aria-label="导入本地模型"
          accept=".fbx,.obj,.glb"
          type="file"
          onChange={async (event) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (!file) return;
            try {
              await handleLocalModel(file);
            } catch (error) {
              setImportError(error instanceof Error ? error.message : "本地模型导入失败");
            } finally {
              input.value = "";
            }
          }}
        />
        <p className="asset-import-status">
          {latestLocalModel ? `已导入本地模型: ${latestLocalModel.fileName}` : "支持 FBX / OBJ / GLB 模型文件"}
        </p>
      </label>
      {importError ? <p className="capture-status">{importError}</p> : null}
      <label className="asset-import-item">
        导入角色模型
        <input
          aria-label="导入角色模型"
          accept=".fbx,.glb"
          type="file"
          onChange={async (event) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (!file) return;
            try {
              await handleCharacterModel(file);
            } catch (error) {
              setImportError(error instanceof Error ? error.message : "角色模型导入失败");
            } finally {
              input.value = "";
            }
          }}
        />
        <p className="asset-import-status">支持 FBX / GLB，导入后可检查并修正骨骼映射</p>
      </label>
      <label className="asset-import-item">
        导入角色动作
        <input
          aria-label="导入角色动作"
          accept=".fbx,.glb"
          type="file"
          onChange={async (event) => {
            const input = event.currentTarget;
            const file = input.files?.[0];
            if (!file) return;
            try {
              await handleCharacterAnimation(file);
            } catch (error) {
              setImportError(error instanceof Error ? error.message : "角色动作导入失败");
            } finally {
              input.value = "";
            }
          }}
        />
        <p className="asset-import-status">支持 FBX / GLB 动作文件，选择角色后可在“动作”中绑定</p>
      </label>
    </section>
  );
}
