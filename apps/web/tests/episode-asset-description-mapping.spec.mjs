import assert from "node:assert/strict";
import { test } from "node:test";

import { mapEpisodeAssetContractsForTest } from "../src/features/production-workbench/index.js";

test("episode asset mapping preserves full metadata descriptions from AI storyboard commit assets", () => {
  const fullDescription = [
    "女性，外表约18岁，实际为迷雾鬼，身份不明。",
    "性格诡异、危险，具有欺骗性。",
    "生成一张3x3九宫格角色设定图，专业影视美术角色参考板。",
  ].join("\n");

  const [asset] = mapEpisodeAssetContractsForTest([
    {
      id: "asset-character-1",
      label: "迷雾鬼",
      latestVersion: {
        metadata: {
          label: "迷雾鬼",
          description: fullDescription,
        },
      },
    },
  ], "character");

  assert.equal(asset.description, fullDescription);
});
