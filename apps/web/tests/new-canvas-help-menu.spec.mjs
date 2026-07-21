import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";

const toolMenu = await readFile(
  new URL("../new-canvas/src/loomic-core/CanvasToolMenu.jsx", import.meta.url),
  "utf8",
);
const coreStyles = await readFile(
  new URL("../new-canvas/src/loomic-core/loomic-core.css", import.meta.url),
  "utf8",
);

test("central canvas toolbar exposes the LibTV tutorial menu in the audited order", () => {
  assert.match(toolMenu, /aria-label="教程"[\s\S]*?aria-haspopup="menu"/);
  const labels = ["使用教程", "联系客服", "联系销售", "关注公众号"];
  let previousIndex = -1;
  for (const label of labels) {
    const index = toolMenu.indexOf(`<span>${label}</span>`);
    assert.ok(index > previousIndex, `${label} should follow the audited menu order`);
    previousIndex = index;
  }
  assert.match(coreStyles, /\.loomic-tool-button \{ width: 32px; height: 32px;/);
  assert.match(coreStyles, /\.loomic-help-menu \{[\s\S]*?bottom: calc\(100% \+ 8px\);[\s\S]*?width: 104px;/);
});

test("tutorial and contact actions only use real project-owned sources", () => {
  assert.match(toolMenu, /const CREATOR_GUIDE_URL = "https:\/\/hcn2azjrtd3x\.feishu\.cn\/wiki\/K20Awy1POixjIUk2RMEc5T1dnDp\?from=from_copylink"/);
  assert.match(toolMenu, /creatorApi\.getCustomerSupportConfig\(\)/);
  assert.match(toolMenu, /communityImageUrl: String\(config\?\.communityImageUrl/);
  assert.match(toolMenu, /enterpriseContactImageUrl: String\(config\?\.enterpriseContactImageUrl/);
  assert.match(toolMenu, /resolveApiUrl\(supportConfig\.communityImageUrl\)/);
  assert.match(toolMenu, /resolveApiUrl\(supportConfig\.enterpriseContactImageUrl\)/);
  assert.match(toolMenu, /disabled=\{!supportConfig\.communityImageUrl\}/);
  assert.match(toolMenu, /disabled=\{!supportConfig\.enterpriseContactImageUrl\}/);
  assert.match(toolMenu, /disabled title="暂未配置公众号联系方式"/);
  assert.match(toolMenu, /<img src=\{helpContact\.imageUrl\} alt=\{`\$\{helpContact\.title\}二维码`\}/);
});

test("tutorial menu participates in the shared dismissal behavior", () => {
  assert.match(toolMenu, /const closeToolPopovers = useCallback\([\s\S]*?setHelpOpen\(false\);[\s\S]*?setHelpContact\(null\);/);
  assert.match(toolMenu, /event\.key === "Escape"[\s\S]*?closeToolPopovers\(\)/);
  assert.match(toolMenu, /document\.addEventListener\("pointerdown", handlePointerDown, true\)/);
  assert.match(toolMenu, /current\.status === "loading" \? \{ \.\.\.current, status: "idle" \} : current/);
  assert.match(toolMenu, /if \(!helpOpen\) setHelpContact\(null\)/);
});
