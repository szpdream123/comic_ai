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

  it("lets people switch between phone code login and password login", async () => {
    const html = await readFile(new URL("../login.html", import.meta.url), "utf8");
    const js = await readFile(new URL("../login.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../login.css", import.meta.url), "utf8");

    assert.match(html, /class="auth-mode-tabs"/);
    assert.doesNotMatch(html, /class="panel-head"/);
    assert.doesNotMatch(html, /id="auth-panel-title"/);
    assert.doesNotMatch(html, /id="auth-panel-copy"/);
    assert.match(html, /id="phone-login-tab"/);
    assert.match(html, /id="password-login-tab"/);
    assert.match(html, /id="phone-login-panel"/);
    assert.match(html, /id="password-login-panel"[^>]*hidden/);
    assert.match(html, /id="password-login-form"/);
    assert.match(html, /id="account-input"/);
    assert.match(html, /id="password-input"/);
    assert.match(html, /id="password-visibility-toggle"/);
    assert.match(html, /id="password-login-button"/);

    assert.match(js, /#phone-login-tab/);
    assert.match(js, /#password-login-tab/);
    assert.doesNotMatch(js, /authModeCopy/);
    assert.match(js, /#password-visibility-toggle/);
    assert.match(js, /function setAuthMode\(mode\)/);
    assert.match(js, /document\.body\.dataset\.authMode = mode/);
    assert.match(js, /passwordInput\.type = isPasswordVisible \? "text" : "password"/);
    assert.match(js, /passwordLoginForm\?\.addEventListener\("submit"/);
    assert.match(js, /\/api\/auth\/password\/login/);
    assert.match(js, /accountInput\?\.value\?\.trim\(\)/);
    assert.match(js, /#phone-remember-input/);
    assert.match(js, /#password-remember-input/);
    assert.match(js, /remember: phoneRememberInput\?\.checked !== false/);
    assert.match(js, /const remember = passwordRememberInput\?\.checked !== false/);
    assert.match(js, /JSON\.stringify\(\{ account, password, remember \}\)/);
    assert.doesNotMatch(js, /password_login_coming_soon/);

    assert.doesNotMatch(css, /\.panel-head/);
    assert.doesNotMatch(css, /\.panel-kicker/);
    assert.match(css, /\.auth-mode-tabs/);
    assert.match(css, /\.auth-mode-tab::after/);
    assert.match(css, /\.auth-mode-tab\[aria-selected="true"\]/);
    assert.match(css, /\.password-input-shell/);
    assert.match(css, /border-bottom/);
    assert.match(css, /\.auth-mode-panel\[hidden\]/);
    assert.match(css, /\.password-form/);
  });

  it("loads backend-managed agreements, requires consent, and opens rich-text documents in a modal", async () => {
    const html = await readFile(new URL("../login.html", import.meta.url), "utf8");
    const js = await readFile(new URL("../login.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../login.css", import.meta.url), "utf8");

    assert.match(html, /id="agreements-checkbox"/);
    assert.match(html, /id="agreements-error-tooltip"/);
    assert.match(html, /data-agreement="service"/);
    assert.match(html, /data-agreement="privacy"/);
    assert.match(html, /id="agreement-modal"/);
    assert.match(html, /id="agreement-modal-title"/);
    assert.match(html, /id="agreement-modal-content"/);

    assert.match(js, /#agreements-checkbox/);
    assert.match(js, /#agreements-error-tooltip/);
    assert.match(js, /data-agreement/);
    assert.match(js, /function validateAgreementsAccepted\(\)/);
    assert.match(js, /function showAgreementHint\(message\)/);
    assert.match(js, /showAgreementHint\("请先同意并勾选上述协议"\)/);
    assert.match(js, /showAgreementError\("请先同意并勾选上述协议"\)/);
    assert.match(js, /agreementsCheckbox\?\.focus\(\)/);
    assert.match(js, /button\.classList\.toggle\("is-disabled", !accepted\)/);
    assert.match(js, /agreementsCheckbox\?\.addEventListener\("change"/);
    assert.match(js, /verifyButton\?\.addEventListener\("click", \(event\) => \{/);
    assert.match(js, /passwordLoginButton\?\.addEventListener\("click", \(event\) => \{/);
    assert.match(js, /\/api\/public\/legal-documents/);
    assert.match(js, /agreementDocuments/);
    assert.match(js, /function loadAgreementDocuments\(\)/);
    assert.match(js, /function sanitizeAgreementHtml\(/);
    assert.match(js, /innerHTML = sanitizeAgreementHtml/);
    assert.match(js, /requestCodeButton\?\.addEventListener\("click", async \(\) => \{[\s\S]*?validateAgreementsAccepted\(\)/);
    assert.match(js, /passwordLoginForm\?\.addEventListener\("submit", async \(event\) => \{[\s\S]*?validateAgreementsAccepted\(\)/);
    assert.doesNotMatch(js, /wechatLoginButton\?\.addEventListener\("click"/);
    assert.match(js, /serviceAgreement/);
    assert.match(js, /privacyPolicy/);

    assert.match(css, /\.agreements-section/);
    assert.match(css, /\.agreement-link/);
    assert.match(css, /\.agreements-error-tooltip/);
    assert.match(css, /position: absolute/);
    assert.match(css, /\.agreements-error-tooltip\[hidden\]/);
    assert.match(css, /\.agreements-error-tooltip::before/);
    assert.match(css, /\.primary-action\.is-disabled/);
    assert.match(css, /\.agreement-modal/);
    assert.match(css, /\.agreement-modal-content/);
    assert.match(css, /\.agreement-rich-text/);
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
    assert.match(detailJs, /id: "home", label:/);
    assert.match(detailJs, /id: "script", label:/);
    assert.match(detailJs, /id: "project", label:/);
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

  it("shows WeChat as a placeholder login option while OAuth is paused", async () => {
    const html = await readFile(new URL("../login.html", import.meta.url), "utf8");
    const js = await readFile(new URL("../login.js", import.meta.url), "utf8");

    assert.match(html, /class="social-btn wechat"/);
    assert.match(html, /data-provider-label="微信"/);
    assert.doesNotMatch(html, /id="wechat-login-modal"/);
    assert.doesNotMatch(html, /id="wechat-login-container"/);
    assert.doesNotMatch(js, /#wechat-login-button/);
    assert.doesNotMatch(js, /\/api\/auth\/wechat\/start/);
    assert.doesNotMatch(js, /res\.wx\.qq\.com\/connect\/zh_CN\/htmledition\/js\/wxLogin\.js/);
    assert.doesNotMatch(js, /new window\.WxLogin/);
    assert.match(js, /querySelectorAll\("\.social-btn"\)/);
    assert.match(js, /\$\{provider\} 登录即将上线/);
  });

  it("maps SMS delivery and limit errors to Chinese copy", async () => {
    const js = await readFile(new URL("../login.js", import.meta.url), "utf8");

    assert.match(js, /sms_cooldown_active/);
    assert.match(js, /daily_sms_limit_exceeded/);
    assert.match(js, /sms_send_failed/);
  });

  it("disables the SMS button for a 60 second resend countdown after delivery", async () => {
    const js = await readFile(new URL("../login.js", import.meta.url), "utf8");

    assert.match(js, /CODE_REQUEST_COOLDOWN_SECONDS = 60/);
    assert.match(js, /startRequestCodeCooldown\(\)/);
    assert.match(js, /requestCodeButton\.disabled = true/);
    assert.match(js, /\$\{remainingSeconds\}/);
    assert.match(js, /requestCodeButton\.disabled = false/);
  });

  it("shows global success and failure popups that disappear after two seconds", async () => {
    const js = await readFile(new URL("../login.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../login.css", import.meta.url), "utf8");

    assert.match(js, /GLOBAL_TOAST_DURATION_MS = 2000/);
    assert.match(js, /function showGlobalToast\(type, title, detail\)/);
    assert.match(js, /global-toast \$\{tone\}/);
    assert.match(css, /\.global-toast\.success/);
    assert.match(css, /\.global-toast\.error/);
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
