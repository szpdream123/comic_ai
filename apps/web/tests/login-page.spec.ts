import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("login page shell", () => {
  it("contains phone and code steps", async () => {
    const html = await readFile(new URL("../login.html", import.meta.url), "utf8");

    assert.match(html, /id="login-form"/);
    assert.match(html, /request-code-button/);
    assert.match(html, /verify-button/);
  });

  it("includes a creator workspace shell", async () => {
    const html = await readFile(new URL("../app.html", import.meta.url), "utf8");

    assert.match(html, /Comic AI Studio/);
    assert.match(html, /id="creator-app"/);
    assert.match(html, /production-workbench\.css/);
  });

  it("renders production workbench controls and Chinese copy", async () => {
    const indexJs = await readFile(
      new URL("../src/features/production-workbench/index.js", import.meta.url),
      "utf8",
    );
    const detailJs = await readFile(
      new URL("../src/features/production-workbench/project-detail.js", import.meta.url),
      "utf8",
    );

    assert.match(indexJs, /set-nav-tab/);
    assert.match(detailJs, /id: "home", label: "首页"/);
    assert.match(detailJs, /id: "script", label: "剧本"/);
    assert.match(detailJs, /id: "project", label: "项目"/);
  });
});

describe("login page client flow", () => {
  it("calls the auth endpoints and includes a development debug panel", async () => {
    const js = await readFile(new URL("../login.js", import.meta.url), "utf8");

    assert.match(js, /\/api\/auth\/code\/request/);
    assert.match(js, /\/api\/auth\/code\/verify/);
    assert.match(js, /\/api\/auth\/session/);
    assert.match(js, /devCode/);
    assert.match(js, /\/api\/auth\/dev\/challenges\//);
    assert.match(js, /debug-panel/);
    assert.match(js, /\/app\.html/);
    assert.match(js, /window\.location\.protocol === "file:"/);
  });

  it("maps SMS delivery and limit errors to Chinese copy", async () => {
    const js = await readFile(new URL("../login.js", import.meta.url), "utf8");

    assert.match(js, /sms_cooldown_active/);
    assert.match(js, /验证码已发送，请稍后再试/);
    assert.match(js, /daily_sms_limit_exceeded/);
    assert.match(js, /今日验证码发送次数已达上限，请明天再试/);
    assert.match(js, /sms_send_failed/);
    assert.match(js, /短信发送失败，请稍后再试/);
  });

  it("disables the SMS button for a 60 second resend countdown after delivery", async () => {
    const js = await readFile(new URL("../login.js", import.meta.url), "utf8");

    assert.match(js, /CODE_REQUEST_COOLDOWN_SECONDS = 60/);
    assert.match(js, /startRequestCodeCooldown\(\)/);
    assert.match(js, /requestCodeButton\.disabled = true/);
    assert.match(js, /\$\{remainingSeconds\} 秒后重新发送/);
    assert.match(js, /requestCodeButton\.disabled = false/);
    assert.match(js, /requestCodeButton\.textContent = "重新发送"/);
  });

  it("shows global success and failure popups that disappear after two seconds", async () => {
    const js = await readFile(new URL("../login.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../login.css", import.meta.url), "utf8");

    assert.match(js, /GLOBAL_TOAST_DURATION_MS = 2000/);
    assert.match(js, /function showGlobalToast\(type, title, detail\)/);
    assert.match(js, /global-toast \$\{tone\}/);
    assert.match(js, /showGlobalToast\("success", "验证码已发送"/);
    assert.match(js, /showGlobalToast\("error", "验证码发送失败"/);
    assert.match(js, /showGlobalToast\("success", "登录成功"/);
    assert.match(js, /showGlobalToast\("error", "登录失败"/);
    assert.match(css, /\.global-toast\.success/);
    assert.match(css, /oklch\(74% 0\.16 154/);
    assert.match(css, /\.global-toast\.error/);
    assert.match(css, /oklch\(66% 0\.22 25/);
  });

  it("wires the creator workspace to the mock creator APIs", async () => {
    const js = await readFile(
      new URL("../src/shared/creator-api.js", import.meta.url),
      "utf8",
    );

    assert.match(js, /\/api\/creator\/project\/create/);
    assert.match(js, /\/api\/creator\/parse/);
    assert.match(js, /\/api\/creator\/assets\/confirm-all/);
    assert.match(js, /\/api\/creator\/calibration\/run/);
    assert.match(js, /\/api\/creator\/calibration\/skip/);
    assert.match(js, /\/api\/creator\/calibration\/override/);
    assert.match(js, /\/api\/creator\/images\/generate/);
    assert.match(js, /\/api\/creator\/videos\/generate/);
    assert.match(js, /\/api\/creator\/export\/preview/);
    assert.match(js, /\/api\/creator\/export\/history/);
  });
});
