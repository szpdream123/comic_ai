import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("app login modal shell", () => {
  it("loads the production workbench module in parallel with the session request", async () => {
    const js = await readFile(new URL("../app.js", import.meta.url), "utf8");
    const html = await readFile(new URL("../app.html", import.meta.url), "utf8");

    assert.match(js, /const productionWorkbenchPromise = root\s*\? import\(/);
    assert.match(js, /session: activeSession/);
    assert.match(js, /api: createAnonymousApi\(creatorApi\)/);
    assert.match(js, /deferInitialRender: true/);
    assert.match(js, /const sessionPromise = creatorApi\.getSession\(\)/);
    assert.match(js, /await sessionPromise\.then\(async \(session\)/);
    assert.match(js, /updateSession\?\.\(session, creatorApi\)/);
    const workbenchJs = await readFile(
      new URL("../src/features/production-workbench/index.js", import.meta.url),
      "utf8",
    );
    assert.match(workbenchJs, /workbench\.updateSession = async \(nextSession/);
    assert.match(workbenchJs, /if \(!deferInitialRender\) \{[\s\S]*?await refresh\(workbench\);[\s\S]*?scheduleLazySurfaceLoad\(workbench\);[\s\S]*?\}/);
    assert.match(workbenchJs, /if \(deferInitialRender\) syncAnnouncementUnreadState\(workbench\)/);
    assert.match(js, /resolvePublicSeoContentForSession\(session\)/);
    assert.match(js, /resolvePublicSeoContentForSession\(activeSession\)/);
    assert.match(
      js,
      /function resolvePublicSeoContentForSession\(session\) \{\s*document\.querySelector\("\.public-seo-content"\)\?\.remove\(\);\s*document\.body\.classList\.remove\("public-seo-page"\);/,
    );
    assert.match(js, /classList\.remove\("public-seo-session-pending"\)/);
    assert.match(html, /rel="modulepreload" href="\/src\/features\/production-workbench\/index\.js\?/);
  });

  it("contains phone and code steps inside the homepage modal", async () => {
    const js = await readFile(new URL("../app.js", import.meta.url), "utf8");

    assert.match(js, /id="login-form"/);
    assert.match(js, /request-code-button/);
    assert.match(js, /verify-button/);
    assert.match(js, /请输入11位手机号（不带\+86）/);
    assert.match(js, /id="registration-password-hint"/);
    assert.match(js, /注册默认密码为<span>手机号后六位<\/span>，请注意修改/);
  });

  it("lets people switch between phone code, password, and team login", async () => {
    const js = await readFile(new URL("../app.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../login.css", import.meta.url), "utf8");

    assert.match(js, /class="auth-mode-tabs"/);
    assert.match(js, /id="phone-login-tab"/);
    assert.match(js, /id="password-login-tab"/);
    assert.match(js, /id="team-login-tab"/);
    assert.match(js, /团队登录/);
    assert.match(js, /id="password-login-form"/);
    assert.match(js, /id="account-input"/);
    assert.match(js, /id="password-input"/);
    assert.doesNotMatch(js, /initial-password-hint/);
    assert.match(js, /id="password-visibility-toggle"/);
    assert.match(js, /\/api\/auth\/password\/login/);
    assert.match(js, /\/api\/auth\/team-member\/password\/login/);
    assert.match(js, /const selectedPasswordAccountType = \(\) =>/);
    assert.match(js, /id="forgot-password-button"/);
    assert.match(js, /forgotPasswordButton\?\.addEventListener\("click"/);
    assert.match(js, /请使用短信验证码恢复登录；如需重置密码，请联系平台客服。/);
    assert.match(js, /子账户请联系主账号管理员重置密码。/);

    assert.match(css, /\.auth-mode-tabs/);
    assert.match(css, /\.auth-mode-tab::after/);
    assert.match(css, /\.auth-mode-tab\[aria-selected="true"\]/);
    assert.match(css, /\.password-input-shell/);
    assert.match(css, /\.registration-password-hint/);
    assert.match(css, /\.auth-mode-panel\[hidden\]/);
  });

  it("loads backend-managed agreements and requires consent in the modal", async () => {
    const js = await readFile(new URL("../app.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../login.css", import.meta.url), "utf8");

    assert.match(js, /id="agreements-checkbox"/);
    assert.match(js, /id="agreements-error-tooltip"/);
    assert.match(js, /data-agreement="service"/);
    assert.match(js, /data-agreement="privacy"/);
    assert.match(js, /id="agreement-modal"/);
    assert.match(js, /const validateAgreementsAccepted = \(\) =>/);
    assert.match(js, /\/api\/public\/legal-documents/);
    assert.match(js, /function sanitizeAgreementHtml\(/);
    assert.match(js, /我已阅读并同意灵曦科技/);
    assert.doesNotMatch(js, /我已阅读并同意万兴科技/);

    assert.match(css, /\.agreements-section/);
    assert.match(css, /\.agreement-link/);
    assert.match(css, /\.agreements-error-tooltip/);
    assert.match(css, /\.agreement-modal/);
    assert.match(css, /\.agreement-rich-text/);
  });

  it("includes a creator panel shell", async () => {
    const html = await readFile(new URL("../app.html", import.meta.url), "utf8");

    assert.match(
      html,
      /<link rel="icon" type="image\/png" sizes="256x256" href="\/assets\/brand\/lingxi-ai-favicon\.png\?v=20260710-wing" \/>/,
    );
    assert.doesNotMatch(html, /lingxi-ai-favicon\.svg/);
    assert.match(html, /灵曦AI/);
    assert.doesNotMatch(html, /灵曦剧厂/);
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
    assert.match(indexJs, /灵曦AI/);
    assert.doesNotMatch(indexJs, /灵曦剧厂/);
    assert.match(detailJs, /灵曦AI/);
    assert.doesNotMatch(detailJs, /灵曦剧厂/);
  });
});

describe("app login modal client flow", () => {
  it("calls the auth endpoints without exposing development verification codes", async () => {
    const js = await readFile(new URL("../app.js", import.meta.url), "utf8");
    const apiJs = await readFile(new URL("../src/shared/creator-api.js", import.meta.url), "utf8");

    assert.match(js, /\/api\/auth\/code\/request/);
    assert.match(js, /\/api\/auth\/code\/verify/);
    assert.match(apiJs, /\/api\/auth\/session/);
    assert.doesNotMatch(js, /devCode/);
    assert.doesNotMatch(js, /\/api\/auth\/dev\/challenges\//);
    assert.doesNotMatch(js, /debug-panel/);
    assert.match(js, /\/app\.html/);
    assert.match(js, /window\.location\.protocol === "file:"/);
  });

  it("keeps logout on the homepage instead of the removed login page", async () => {
    const js = await readFile(new URL("../app.js", import.meta.url), "utf8");

    assert.match(js, /const homeUrl =/);
    assert.match(js, /window\.location\.replace\(homeUrl\)/);
    assert.doesNotMatch(js, /loginUrl/);
    assert.doesNotMatch(js, /\/login\.html/);
  });

  it("allows anonymous visitors to read public announcements", async () => {
    const js = await readFile(new URL("../app.js", import.meta.url), "utf8");

    assert.match(
      js,
      /ANONYMOUS_READ_API_METHODS = new Set\(\[[^\]]*"getAnnouncements"[^\]]*\]\)/,
    );
  });

  it("allows anonymous visitors to read the prompt marketplace catalog", async () => {
    const js = await readFile(new URL("../app.js", import.meta.url), "utf8");

    assert.match(
      js,
      /ANONYMOUS_READ_API_METHODS = new Set\(\[[^\]]*"getPromptMarketplace"[^\]]*\]\)/,
    );
    assert.doesNotMatch(
      js,
      /ANONYMOUS_READ_API_METHODS = new Set\(\[[^\]]*"getPromptMarketplaceLibrary"[^\]]*\]\)/,
    );
  });

  it("blocks protected api methods locally for anonymous visitors", async () => {
    const js = await readFile(new URL("../app.js", import.meta.url), "utf8");
    const anonymousApiBlock = js.match(/function createAnonymousApi\(api\) \{[\s\S]*?\n\}/)?.[0] ?? "";

    assert.match(anonymousApiBlock, /throw new Error\("unauthenticated"\)/);
    assert.doesNotMatch(anonymousApiBlock, /target\.getSession\(/);
  });

  it("shows WeChat as a placeholder login option while OAuth is paused", async () => {
    const js = await readFile(new URL("../app.js", import.meta.url), "utf8");

    assert.match(js, /class="social-btn wechat"/);
    assert.match(js, /data-provider-label="微信"/);
    assert.doesNotMatch(js, /id="wechat-login-modal"/);
    assert.doesNotMatch(js, /id="wechat-login-container"/);
    assert.doesNotMatch(js, /#wechat-login-button/);
    assert.doesNotMatch(js, /\/api\/auth\/wechat\/start/);
    assert.doesNotMatch(js, /res\.wx\.qq\.com\/connect\/zh_CN\/htmledition\/js\/wxLogin\.js/);
    assert.doesNotMatch(js, /new window\.WxLogin/);
    assert.match(js, /qsa\("\.social-btn"\)/);
    assert.match(js, /\$\{provider\} 登录即将上线/);
  });

  it("maps SMS delivery and limit errors to Chinese copy", async () => {
    const js = await readFile(new URL("../app.js", import.meta.url), "utf8");

    assert.match(js, /sms_cooldown_active/);
    assert.match(js, /验证码发送频繁，请5分钟后再试/);
    assert.match(js, /验证码发送频繁，请10分钟后再试/);
    assert.match(js, /daily_sms_limit_exceeded/);
    assert.match(js, /当前手机号发送验证码频繁，请于明日再试或前往密码登录。/);
    assert.match(js, /ip_sms_limit_exceeded/);
    assert.match(js, /ip_sms_limit_exceeded: "当前ip发送次数过多。"/);
    assert.match(js, /sms_send_failed/);
    assert.match(js, /请输入11位手机号，且不要带 \+86/);
  });

  it("disables the SMS button for a 60 second resend countdown after delivery", async () => {
    const js = await readFile(new URL("../app.js", import.meta.url), "utf8");

    assert.match(js, /CODE_REQUEST_COOLDOWN_SECONDS = 60/);
    assert.match(js, /startRequestCodeCooldown\(\)/);
    assert.match(js, /requestCodeButton\.disabled = true/);
    assert.match(js, /\$\{remainingSeconds\}/);
    assert.match(js, /requestCodeButton\.disabled = false/);
  });

  it("shows global success and failure popups that disappear after two seconds", async () => {
    const js = await readFile(new URL("../app.js", import.meta.url), "utf8");
    const css = await readFile(new URL("../login.css", import.meta.url), "utf8");

    assert.match(js, /GLOBAL_TOAST_DURATION_MS = 2000/);
    assert.match(js, /function showLoginToast\(state, type, title, detail\)/);
    assert.match(js, /global-toast \$\{tone\}/);
    assert.match(css, /\.global-toast\.success/);
    assert.match(css, /\.global-toast\.error/);
  });

  it("wires the creator panel to the mock creator APIs", async () => {
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
