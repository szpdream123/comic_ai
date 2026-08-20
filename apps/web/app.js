import { creatorApi, resolveApiUrl } from "./src/shared/creator-api.js";
import {
  consumeFirstLoginOnboarding,
  markFirstLoginOnboarding,
} from "./src/features/production-workbench/first-login-onboarding.js";

const root = document.querySelector("#creator-app");
const productionWorkbenchPromise = root
  ? import("./src/features/production-workbench/index.js")
  : null;
const homeUrl =
  window.location.protocol === "file:"
    ? resolveApiUrl("/app.html")
    : new URL("/", window.location.origin).toString();
const LOCAL_STORAGE_PREFIXES = ["comic-ai-project-library", "comic-ai:production-workbench:"];
const OPEN_CREATE_AFTER_LOGIN_KEY = "comic-ai:open-create-after-login";
const CODE_REQUEST_COOLDOWN_SECONDS = 60;
const GLOBAL_TOAST_DURATION_MS = 2000;
const ANONYMOUS_READ_API_METHODS = new Set(["getStoryboardPromptPackages", "getCustomerSupportConfig", "getAnnouncements", "getPromptMarketplace", "getHomeRecommendations"]);

async function bootstrap() {
  renderInitialWorkbenchShell(root);
  const sessionPromise = creatorApi.getSession();
  const { initProductionWorkbench } = await productionWorkbenchPromise;
  let activeSession = createAnonymousSession();
  const workbench = await initProductionWorkbench({
    root,
    session: activeSession,
    api: createAnonymousApi(creatorApi),
    deferInitialRender: true,
    onLogout: async () => {
      if (!activeSession?.user?.id && !activeSession?.user?.phone) {
        clearCreatorBrowserStorage();
        openLoginModal();
        return;
      }
      await creatorApi.logout();
      clearCreatorBrowserStorage();
      window.location.replace(homeUrl);
    },
    onRequireLogin: handleRequireLogin,
  });

  await sessionPromise.then(async (session) => {
    session = consumeFirstLoginOnboarding(session, sessionStorage);
    activeSession = session;
    resolvePublicSeoContentForSession(session);
    await workbench?.updateSession?.(session, creatorApi);
  }).catch(async (error) => {
    const message = error instanceof Error ? error.message : "unknown_error";
    activeSession = createAnonymousSession();
    resolvePublicSeoContentForSession(activeSession);
    if (message === "unauthenticated") {
      await workbench?.updateSession?.(activeSession, createAnonymousApi(creatorApi));
      if (hasInviteCodeInUrl()) {
        openLoginModal();
      }
      return;
    }
    console.error("[creator-app] bootstrap:error", error);
    activeSession = {
      authenticated: false,
      user: {
        id: "",
        phone: "",
      },
      bootstrapError: message,
    };
    await workbench?.updateSession?.(activeSession, createRecoverableApi(creatorApi, message));
  });
}

function renderInitialWorkbenchShell(target) {
  if (!target || target.querySelector?.(".initial-workbench-shell")) {
    return;
  }
  target.innerHTML = `
    <section class="initial-workbench-shell" aria-busy="true" aria-live="polite">
      <strong>灵曦AI</strong>
      <span>正在加载工作台...</span>
    </section>
  `;
}

function resolvePublicSeoContentForSession(session) {
  document.querySelector(".public-seo-content")?.remove();
  document.body.classList.remove("public-seo-page");
  document.body.classList.remove("public-seo-session-pending");
}

function createAnonymousSession() {
  return {
    authenticated: false,
    user: {
      id: "",
      phone: "",
    },
  };
}

function hasInviteCodeInUrl() {
  return Boolean(new URLSearchParams(window.location.search).get("inviteCode")?.trim());
}

function createAnonymousApi(api) {
  return new Proxy(api, {
    get(target, property, receiver) {
      if (property === "getSession") {
        return async () => createAnonymousSession();
      }
      const value = Reflect.get(target, property, receiver);
      if (typeof value !== "function") {
        return value;
      }
      if (ANONYMOUS_READ_API_METHODS.has(String(property))) {
        return value.bind(target);
      }
      return async (...args) => {
        if (isAnonymousReadApiCall(property, args)) {
          return value.apply(target, args);
        }
        throw new Error("unauthenticated");
      };
    },
  });
}

function isAnonymousReadApiCall(property, args = []) {
  const method = String(property);
  if (ANONYMOUS_READ_API_METHODS.has(method)) {
    return true;
  }
  if (method !== "getLibraryAssets") {
    return false;
  }
  const scope = String(args[0]?.scope ?? "official").trim() || "official";
  return scope === "official";
}

function createRecoverableApi(api, bootstrapError) {
  return new Proxy(api, {
    get(target, property, receiver) {
      const value = Reflect.get(target, property, receiver);
      if (property === "getSession") {
        return async () => ({
          authenticated: false,
          user: { id: "", phone: "" },
          bootstrapError,
        });
      }
      return value;
    },
  });
}

function clearCreatorBrowserStorage() {
  try {
    for (let index = localStorage.length - 1; index >= 0; index -= 1) {
      const key = localStorage.key(index);
      if (key && LOCAL_STORAGE_PREFIXES.some((prefix) => key.startsWith(prefix))) {
        localStorage.removeItem(key);
      }
    }
  } catch {
    // Storage can be blocked in private or file-based browser contexts.
  }

  try {
    sessionStorage.clear();
  } catch {
    // Keep navigation working even when browser storage is unavailable.
  }
}

function handleRequireLogin(reason = "") {
  if (reason === "create-project") {
    try {
      sessionStorage.setItem(OPEN_CREATE_AFTER_LOGIN_KEY, "1");
    } catch {
      // Ignore blocked storage; the login modal still works.
    }
  }
  openLoginModal();
}

export function openLoginModal() {
  if (document.querySelector("#app-login-modal")) {
    return;
  }
  const modal = document.createElement("section");
  modal.id = "app-login-modal";
  modal.className = "app-login-modal";
  modal.setAttribute("role", "dialog");
  modal.setAttribute("aria-modal", "true");
  modal.setAttribute("aria-label", "登录灵曦AI");
  modal.innerHTML = renderLoginModalMarkup();
  document.body.appendChild(modal);
  modal.querySelectorAll("[data-login-modal-close]").forEach((button) => {
    button.addEventListener("click", closeLoginModal);
  });
  bindLoginModal(modal);
}

document.addEventListener("click", (event) => {
  const loginTrigger = event.target?.closest?.("[data-public-seo-login]");
  if (!loginTrigger) {
    return;
  }
  event.preventDefault();
  openLoginModal();
});

function closeLoginModal() {
  document.querySelector("#app-login-modal")?.remove();
  try {
    sessionStorage.removeItem(OPEN_CREATE_AFTER_LOGIN_KEY);
  } catch {
    // Ignore blocked storage.
  }
}

function readOpenCreateAfterLoginFlag() {
  try {
    return sessionStorage.getItem(OPEN_CREATE_AFTER_LOGIN_KEY) === "1";
  } catch {
    return false;
  }
}

function renderLoginModalMarkup() {
  return `
    <button class="app-login-modal-backdrop" type="button" data-login-modal-close aria-label="关闭登录"></button>
    <div class="app-login-modal-panel">
      <button class="app-login-modal-close" type="button" data-login-modal-close aria-label="关闭登录">×</button>
      <section class="auth-panel" data-auth-mode="phone">
        <div class="auth-mode-tabs" role="tablist" aria-label="登录方式">
          <button id="phone-login-tab" class="auth-mode-tab" type="button" role="tab" aria-selected="true" aria-controls="phone-login-panel" data-auth-target="phone">验证码登录</button>
          <button id="password-login-tab" class="auth-mode-tab" type="button" role="tab" aria-selected="false" aria-controls="password-login-panel" data-auth-target="password">密码登录</button>
          <button id="team-login-tab" class="auth-mode-tab" type="button" role="tab" aria-selected="false" aria-controls="password-login-panel" data-auth-target="team">团队登录</button>
        </div>

        <div id="phone-login-panel" class="auth-mode-panel" role="tabpanel" aria-labelledby="phone-login-tab">
          <form id="login-form" class="login-form">
            <label class="field">
              <span class="sr-only">手机号</span>
              <input id="phone-input" name="phone" inputmode="numeric" maxlength="11" placeholder="请输入11位手机号（不带+86）" autocomplete="tel" />
            </label>
            <label class="field field-inline">
              <span class="sr-only">验证码</span>
              <span class="field-control">
                <input id="code-input" name="code" inputmode="numeric" maxlength="6" placeholder="请输入验证码" autocomplete="one-time-code" />
                <button id="request-code-button" class="secondary-action inline-action" type="button">发送验证码</button>
              </span>
            </label>
            <label class="field">
              <span class="sr-only">邀请码</span>
              <input id="invite-code-input" name="inviteCode" type="text" placeholder="请输入邀请码（选填）" autocomplete="off" />
            </label>
            <p id="registration-password-hint" class="registration-password-hint" role="note">
              注册默认密码为<span>手机号后六位</span>，请注意修改
            </p>
            <div class="form-options">
              <label class="remember-option">
                <input id="phone-remember-input" type="checkbox" name="remember" checked />
                <span>保持登录</span>
              </label>
            </div>
            <button id="verify-button" class="primary-action" type="submit">立即登录</button>
          </form>
        </div>

        <div id="password-login-panel" class="auth-mode-panel" role="tabpanel" aria-labelledby="password-login-tab" hidden>
          <form id="password-login-form" class="login-form password-form">
            <label class="field">
              <span class="sr-only">账号</span>
              <input id="account-input" name="account" type="text" placeholder="请输入手机号" autocomplete="username" />
            </label>
            <label class="field">
              <span class="sr-only">密码</span>
              <span class="password-input-shell">
                <input id="password-input" name="password" type="password" placeholder="请输入密码" autocomplete="current-password" />
                <button id="password-visibility-toggle" class="password-visibility-toggle" type="button" aria-label="显示密码">
                  <svg viewBox="0 0 24 24" fill="none" aria-hidden="true">
                    <path d="M2.8 12s3.2-5.2 9.2-5.2S21.2 12 21.2 12s-3.2 5.2-9.2 5.2S2.8 12 2.8 12z" stroke="currentColor" stroke-width="1.7" stroke-linecap="round" stroke-linejoin="round"/>
                    <circle cx="12" cy="12" r="2.5" stroke="currentColor" stroke-width="1.7"/>
                  </svg>
                </button>
              </span>
            </label>
            <div class="password-options">
              <label class="remember-option">
                <input id="password-remember-input" type="checkbox" name="remember" checked />
                <span>保持登录</span>
              </label>
              <button id="forgot-password-button" type="button" class="text-action">忘记密码？</button>
            </div>
            <button id="password-login-button" class="primary-action" type="submit">立即登录</button>
          </form>
        </div>

        <div class="social-login">
          <div class="social-divider">
            <span class="social-divider-line"></span>
            <span class="social-divider-text">其他方式登录</span>
            <span class="social-divider-line"></span>
          </div>
          <div class="social-icons" role="group" aria-label="第三方登录方式">
            <button type="button" class="social-btn wechat" aria-label="微信登录" data-provider-label="微信">微</button>
            <button type="button" class="social-btn qq" aria-label="QQ登录" data-provider-label="QQ">Q</button>
            <button type="button" class="social-btn apple" aria-label="Apple 登录" data-provider-label="Apple">A</button>
            <button type="button" class="social-btn douyin" aria-label="抖音登录" data-provider-label="抖音">抖</button>
          </div>
        </div>

        <div class="agreements-section">
          <label class="agreements-check" for="agreements-checkbox">
            <input id="agreements-checkbox" type="checkbox" />
            <span class="agreement-copy">
              <span class="agreement-line">
                我已阅读并同意灵曦科技
                <button type="button" class="agreement-link" data-agreement="service">用户服务协议</button>
                和
                <button type="button" class="agreement-link" data-agreement="privacy">隐私政策</button>，
              </span>
              <span class="agreement-line">未注册手机号登录时会自动创建账号</span>
            </span>
          </label>
          <div id="agreements-error-tooltip" class="agreements-error-tooltip" hidden>请先同意并勾选上述协议</div>
        </div>

        <p id="status-message" class="status-message" aria-live="polite"></p>
      </section>
    </div>
    <div id="agreement-modal" class="agreement-modal" hidden>
      <div class="agreement-modal-backdrop" data-agreement-close></div>
      <section class="agreement-modal-panel" role="dialog" aria-modal="true" aria-labelledby="agreement-modal-title">
        <button type="button" class="agreement-modal-close" data-agreement-close aria-label="关闭协议弹窗">×</button>
        <div class="agreement-modal-head">
          <h3 id="agreement-modal-title">协议详情</h3>
        </div>
        <div id="agreement-modal-content" class="agreement-modal-content agreement-rich-text"></div>
      </section>
    </div>
  `;
}

function bindLoginModal(modal) {
  const state = {
    activeChallengeId: null,
    requestCodeCooldownTimer: null,
    requestCodeCooldownEndsAt: 0,
    globalToastTimer: null,
    agreementDocuments: {
      serviceAgreement: {
        title: "用户服务协议",
        contentHtml: "<p>协议内容加载中...</p>",
      },
      privacyPolicy: {
        title: "隐私政策",
        contentHtml: "<p>协议内容加载中...</p>",
      },
    },
    agreementDocumentsPromise: null,
  };
  const qs = (selector) => modal.querySelector(selector);
  const qsa = (selector) => [...modal.querySelectorAll(selector)];
  const form = qs("#login-form");
  const phoneInput = qs("#phone-input");
  const codeInput = qs("#code-input");
  const inviteCodeInput = qs("#invite-code-input");
  const requestCodeButton = qs("#request-code-button");
  const verifyButton = qs("#verify-button");
  const statusMessage = qs("#status-message");
  const authPanel = qs(".auth-panel");
  const phoneLoginTab = qs("#phone-login-tab");
  const passwordLoginTab = qs("#password-login-tab");
  const teamLoginTab = qs("#team-login-tab");
  const phoneLoginPanel = qs("#phone-login-panel");
  const passwordLoginPanel = qs("#password-login-panel");
  const passwordLoginForm = qs("#password-login-form");
  const phoneRememberInput = qs("#phone-remember-input");
  const accountInput = qs("#account-input");
  const passwordInput = qs("#password-input");
  const passwordRememberInput = qs("#password-remember-input");
  const passwordVisibilityToggle = qs("#password-visibility-toggle");
  const forgotPasswordButton = qs("#forgot-password-button");
  const passwordLoginButton = qs("#password-login-button");
  const agreementsCheckbox = qs("#agreements-checkbox");
  const agreementsErrorTooltip = qs("#agreements-error-tooltip");
  const agreementModal = qs("#agreement-modal");
  const agreementModalTitle = qs("#agreement-modal-title");
  const agreementModalContent = qs("#agreement-modal-content");
  const inviteCodeFromLink = new URLSearchParams(window.location.search).get("inviteCode");

  if (inviteCodeInput && inviteCodeFromLink) {
    inviteCodeInput.value = inviteCodeFromLink.trim().toUpperCase();
  }

  const setStatus = (message) => {
    if (statusMessage) {
      statusMessage.textContent = message;
    }
  };
  const selectedPasswordAccountType = () => authPanel?.dataset.authMode === "team" ? "team_member" : "user";
  const updatePasswordAccountHint = () => {
    if (!accountInput) {
      return;
    }
    const isTeamMember = selectedPasswordAccountType() === "team_member";
    accountInput.placeholder = isTeamMember
      ? "请输入子账户，例如 director001@u185715"
      : "请输入手机号";
    accountInput.inputMode = isTeamMember ? "text" : "numeric";
    accountInput.autocomplete = isTeamMember ? "username" : "tel";
  };
  const hideAgreementError = () => {
    if (agreementsErrorTooltip) {
      agreementsErrorTooltip.hidden = true;
    }
  };
  const showAgreementHint = (message) => {
    if (!agreementsErrorTooltip) {
      return false;
    }
    agreementsErrorTooltip.textContent = message;
    agreementsErrorTooltip.hidden = false;
    return false;
  };
  const showAgreementError = (message) => {
    if (!agreementsErrorTooltip) {
      return false;
    }
    agreementsErrorTooltip.textContent = message;
    agreementsErrorTooltip.hidden = false;
    agreementsCheckbox?.focus();
    return false;
  };
  const updateAgreementActionState = () => {
    const accepted = Boolean(agreementsCheckbox?.checked);
    if (accepted) {
      hideAgreementError();
    } else {
      showAgreementHint("请先同意并勾选上述协议");
    }
    [verifyButton, passwordLoginButton].forEach((button) => {
      if (!button) {
        return;
      }
      button.classList.toggle("is-disabled", !accepted);
      button.setAttribute("aria-disabled", String(!accepted));
    });
  };
  const validateAgreementsAccepted = () => {
    if (agreementsCheckbox?.checked) {
      hideAgreementError();
      updateAgreementActionState();
      return true;
    }
    const message = "请先同意并勾选上述协议";
    updateAgreementActionState();
    showAgreementError(message);
    showLoginToast(state, "error", "请先同意协议", message);
    return false;
  };
  const setAuthMode = (mode) => {
    const isPhoneMode = mode === "phone";
    const isPasswordMode = mode === "password";
    const isTeamMode = mode === "team";
    if (authPanel) {
      authPanel.dataset.authMode = mode;
    }
    phoneLoginTab?.setAttribute("aria-selected", String(isPhoneMode));
    passwordLoginTab?.setAttribute("aria-selected", String(isPasswordMode));
    teamLoginTab?.setAttribute("aria-selected", String(isTeamMode));
    if (phoneLoginPanel) {
      phoneLoginPanel.hidden = !isPhoneMode;
    }
    if (passwordLoginPanel) {
      passwordLoginPanel.hidden = isPhoneMode;
      passwordLoginPanel.setAttribute("aria-labelledby", isTeamMode ? "team-login-tab" : "password-login-tab");
    }
    if (!isPhoneMode) {
      updatePasswordAccountHint();
      setStatus("");
    }
  };
  const updateRequestCodeButton = () => {
    if (!requestCodeButton) {
      return;
    }
    const remainingSeconds = Math.max(0, Math.ceil((state.requestCodeCooldownEndsAt - Date.now()) / 1000));
    if (remainingSeconds > 0) {
      requestCodeButton.disabled = true;
      requestCodeButton.textContent = `${remainingSeconds} 秒后重新发送`;
      return;
    }
    if (state.requestCodeCooldownTimer) {
      clearInterval(state.requestCodeCooldownTimer);
      state.requestCodeCooldownTimer = null;
    }
    state.requestCodeCooldownEndsAt = 0;
    requestCodeButton.disabled = false;
    requestCodeButton.textContent = "重新发送";
  };
  const resetRequestCodeButton = (label = "获取验证码") => {
    if (state.requestCodeCooldownTimer) {
      clearInterval(state.requestCodeCooldownTimer);
      state.requestCodeCooldownTimer = null;
    }
    state.requestCodeCooldownEndsAt = 0;
    if (requestCodeButton) {
      requestCodeButton.disabled = false;
      requestCodeButton.textContent = label;
    }
  };
  const startRequestCodeCooldown = (seconds = CODE_REQUEST_COOLDOWN_SECONDS) => {
    state.requestCodeCooldownEndsAt = Date.now() + seconds * 1000;
    updateRequestCodeButton();
    if (state.requestCodeCooldownTimer) {
      clearInterval(state.requestCodeCooldownTimer);
    }
    state.requestCodeCooldownTimer = setInterval(updateRequestCodeButton, 250);
  };
  const openAgreementModal = async (kind) => {
    const documentKey = kind === "privacy" ? "privacyPolicy" : "serviceAgreement";
    let documentData = state.agreementDocuments[documentKey];
    if (agreementModalTitle) {
      agreementModalTitle.textContent = documentData?.title || "协议详情";
    }
    if (agreementModalContent) {
      agreementModalContent.innerHTML = sanitizeAgreementHtml(documentData?.contentHtml || "<p>暂无协议内容。</p>");
    }
    if (agreementModal) {
      agreementModal.hidden = false;
    }
    await loadAgreementDocuments(state);
    documentData = state.agreementDocuments[documentKey];
    if (!agreementModal || agreementModal.hidden) {
      return;
    }
    if (agreementModalTitle) {
      agreementModalTitle.textContent = documentData?.title || "协议详情";
    }
    if (agreementModalContent) {
      agreementModalContent.innerHTML = sanitizeAgreementHtml(documentData?.contentHtml || "<p>暂无协议内容。</p>");
    }
  };
  const closeAgreementModal = () => {
    if (agreementModal) {
      agreementModal.hidden = true;
    }
  };
  const completeLoginSuccess = () => {
    const shouldOpenCreate = readOpenCreateAfterLoginFlag();
    closeLoginModal();
    if (shouldOpenCreate) {
      try {
        sessionStorage.setItem(OPEN_CREATE_AFTER_LOGIN_KEY, "1");
      } catch {
        // Ignore blocked storage.
      }
    }
    window.location.reload();
  };

  requestCodeButton?.addEventListener("click", async () => {
    if (requestCodeButton.disabled || !validateAgreementsAccepted()) {
      return;
    }
    const phone = phoneInput?.value?.trim() ?? "";
    if (!isMainlandPhoneInput(phone)) {
      resetRequestCodeButton();
      showLoginToast(state, "error", "验证码发送失败", "请输入11位手机号，且不要带 +86");
      return;
    }
    requestCodeButton.disabled = true;
    requestCodeButton.textContent = "发送中...";
    let requestResponse;
    let requestPayload;
    try {
      requestResponse = await fetch(resolveApiUrl("/api/auth/code/request"), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ phone }),
      });
      requestPayload = await requestResponse.json();
    } catch {
      resetRequestCodeButton();
      showLoginToast(state, "error", "验证码发送失败", "网络连接异常，请稍后再试");
      return;
    }
    if (!requestResponse.ok) {
      resetRequestCodeButton();
      showLoginToast(state, "error", "验证码发送失败", authErrorMessage(requestPayload, "验证码请求失败"));
      return;
    }
    startRequestCodeCooldown();
    state.activeChallengeId = requestPayload.challengeId;
    const remainingText =
      typeof requestPayload.remainingToday === "number"
        ? `，今日还可发送 ${requestPayload.remainingToday} 次`
        : "";
    showLoginToast(state, "success", "验证码已发送", `验证码已发送至 ${requestPayload.maskedPhone}${remainingText}`);
  });

  form?.addEventListener("submit", async (event) => {
    event.preventDefault();
    const phone = phoneInput?.value?.trim() ?? "";
    const code = codeInput?.value?.trim() ?? "";
    const inviteCode = inviteCodeInput?.value?.trim() ?? "";
    if (!isMainlandPhoneInput(phone)) {
      setStatus("请输入11位手机号，且不要带 +86");
      showLoginToast(state, "error", "登录失败", "请输入11位手机号，且不要带 +86");
      return;
    }
    if (!validateAgreementsAccepted()) {
      return;
    }
    if (!state.activeChallengeId) {
      showLoginToast(state, "error", "登录失败", "请先获取验证码");
      return;
    }
    setStatus("正在登录...");
    const verifyResponse = await fetch(resolveApiUrl("/api/auth/code/verify"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({
        challengeId: state.activeChallengeId,
        phone,
        code,
        inviteCode: inviteCode || undefined,
        remember: phoneRememberInput?.checked !== false,
      }),
      credentials: "include",
    });
    const verifyPayload = await verifyResponse.json();
    if (!verifyResponse.ok) {
      const message = authErrorMessage(verifyPayload, "登录失败");
      setStatus(message);
      showLoginToast(state, "error", "登录失败", message);
      return;
    }
    const loginMessage = `登录成功：${verifyPayload.user.phone}`;
    markFirstLoginOnboarding(verifyPayload, sessionStorage);
    setStatus(loginMessage);
    showLoginToast(state, "success", "登录成功", loginMessage);
    setTimeout(completeLoginSuccess, 350);
  });

  passwordLoginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    if (!validateAgreementsAccepted()) {
      return;
    }
    const account = accountInput?.value?.trim() ?? "";
    const password = passwordInput?.value ?? "";
    const remember = passwordRememberInput?.checked !== false;
    const accountType = selectedPasswordAccountType();
    const isTeamMemberLogin = accountType === "team_member";
    if (!isTeamMemberLogin && /^\+86/.test(account)) {
      passwordLoginButton.disabled = false;
      setStatus("请输入11位手机号，且不要带 +86");
      showLoginToast(state, "error", "密码登录失败", "请输入11位手机号，且不要带 +86");
      return;
    }
    if (isTeamMemberLogin && !account.includes("@")) {
      passwordLoginButton.disabled = false;
      setStatus("请输入完整子账户登录账号");
      showLoginToast(state, "error", "子账户登录失败", "请输入管理员创建时生成的完整账号");
      return;
    }
    passwordLoginButton.disabled = true;
    setStatus("正在登录...");
    let loginResponse;
    let loginPayload;
    try {
      loginResponse = await fetch(resolveApiUrl(
        isTeamMemberLogin
          ? "/api/auth/team-member/password/login"
          : "/api/auth/password/login",
      ), {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ account, password, remember }),
        credentials: "include",
      });
      loginPayload = await readJsonResponse(loginResponse);
    } catch {
      passwordLoginButton.disabled = false;
      setStatus(isTeamMemberLogin ? "子账户登录失败" : "密码登录失败");
      showLoginToast(state, "error", isTeamMemberLogin ? "子账户登录失败" : "密码登录失败", "网络连接异常，请稍后再试");
      return;
    }
    if (!loginResponse.ok) {
      passwordLoginButton.disabled = false;
      const message = resolvePasswordLoginError(loginResponse, loginPayload, isTeamMemberLogin);
      setStatus(message);
      showLoginToast(state, "error", isTeamMemberLogin ? "子账户登录失败" : "密码登录失败", message);
      return;
    }
    const loginMessage = isTeamMemberLogin
      ? `登录成功：${loginPayload.memberName || loginPayload.memberLoginAccount}`
      : `登录成功：${loginPayload.user.phone}`;
    setStatus(loginMessage);
    showLoginToast(state, "success", "登录成功", loginMessage);
    setTimeout(completeLoginSuccess, 350);
  });

  verifyButton?.addEventListener("click", (event) => {
    if (agreementsCheckbox?.checked) {
      return;
    }
    event.preventDefault();
    validateAgreementsAccepted();
  });
  passwordLoginButton?.addEventListener("click", (event) => {
    if (agreementsCheckbox?.checked) {
      return;
    }
    event.preventDefault();
    validateAgreementsAccepted();
  });
  phoneLoginTab?.addEventListener("click", () => setAuthMode("phone"));
  passwordLoginTab?.addEventListener("click", () => setAuthMode("password"));
  teamLoginTab?.addEventListener("click", () => setAuthMode("team"));
  agreementsCheckbox?.addEventListener("change", () => {
    if (agreementsCheckbox.checked) {
      hideAgreementError();
    }
    updateAgreementActionState();
  });
  qsa("[data-agreement]").forEach((button) => {
    button.addEventListener("click", () => openAgreementModal(button.dataset.agreement));
  });
  qsa("[data-agreement-close]").forEach((button) => {
    button.addEventListener("click", closeAgreementModal);
  });
  passwordVisibilityToggle?.addEventListener("click", () => {
    if (!passwordInput) {
      return;
    }
    const isPasswordVisible = passwordInput.type === "password";
    passwordInput.type = isPasswordVisible ? "text" : "password";
    passwordVisibilityToggle.setAttribute("aria-label", isPasswordVisible ? "隐藏密码" : "显示密码");
  });
  qsa(".social-btn").forEach((button) => {
    button.addEventListener("click", () => {
      const provider = button.dataset.providerLabel || "第三方";
      setStatus(`${provider} 登录即将上线`);
    });
  });

  forgotPasswordButton?.addEventListener("click", () => {
    if (selectedPasswordAccountType() === "team") {
      setStatus("子账户请联系主账号管理员重置密码。");
      accountInput?.focus();
      return;
    }
    const account = accountInput?.value?.trim() ?? "";
    setAuthMode("phone");
    if (isMainlandPhoneInput(account) && phoneInput) {
      phoneInput.value = account;
    }
    setStatus("请使用短信验证码恢复登录；如需重置密码，请联系平台客服。");
    phoneInput?.focus();
  });

  updatePasswordAccountHint();
  updateAgreementActionState();
}

function showLoginToast(state, type, title, detail) {
  const tone = type === "success" ? "success" : "error";
  let toast = document.querySelector("#global-toast");

  if (!toast) {
    toast = document.createElement("div");
    toast.id = "global-toast";
    toast.className = "global-toast";
    toast.setAttribute("role", "status");
    toast.setAttribute("aria-live", "polite");
    document.body.appendChild(toast);
  }

  toast.className = `global-toast ${tone}`;
  toast.innerHTML = "";

  const icon = document.createElement("span");
  icon.className = "global-toast-icon";
  icon.textContent = tone === "success" ? "✓" : "!";

  const copy = document.createElement("span");
  copy.className = "global-toast-copy";

  const titleNode = document.createElement("strong");
  titleNode.textContent = title;
  copy.appendChild(titleNode);

  if (detail) {
    const detailNode = document.createElement("span");
    detailNode.textContent = detail;
    copy.appendChild(detailNode);
  }

  toast.append(icon, copy);
  requestAnimationFrame(() => {
    toast.classList.add("visible");
  });

  if (state.globalToastTimer) {
    clearTimeout(state.globalToastTimer);
  }

  state.globalToastTimer = setTimeout(() => {
    toast.classList.remove("visible");
    state.globalToastTimer = setTimeout(() => {
      toast.remove();
      state.globalToastTimer = null;
    }, 220);
  }, GLOBAL_TOAST_DURATION_MS);
}

function sanitizeAgreementHtml(html) {
  const template = document.createElement("template");
  template.innerHTML = String(html || "");
  const blockedTags = new Set(["SCRIPT", "STYLE", "IFRAME", "OBJECT", "EMBED", "LINK", "META"]);
  template.content.querySelectorAll("*").forEach((element) => {
    if (blockedTags.has(element.tagName)) {
      element.remove();
      return;
    }
    Array.from(element.attributes).forEach((attribute) => {
      if (/^on/i.test(attribute.name)) {
        element.removeAttribute(attribute.name);
        return;
      }
      if (["href", "src", "xlink:href"].includes(attribute.name) && /^\s*javascript:/i.test(attribute.value)) {
        element.removeAttribute(attribute.name);
      }
    });
    if (element.tagName === "A") {
      element.setAttribute("target", "_blank");
      element.setAttribute("rel", "noopener noreferrer");
    }
  });
  return template.innerHTML;
}

async function loadAgreementDocuments(state) {
  if (state.agreementDocumentsPromise) {
    return state.agreementDocumentsPromise;
  }
  state.agreementDocumentsPromise = (async () => {
    try {
      const response = await fetch(resolveApiUrl("/api/public/legal-documents"), {
        credentials: "include",
      });
      const payload = await response.json();
      if (!response.ok) {
        return;
      }
      state.agreementDocuments = {
        serviceAgreement: payload.data?.serviceAgreement?.document || state.agreementDocuments.serviceAgreement,
        privacyPolicy: payload.data?.privacyPolicy?.document || state.agreementDocuments.privacyPolicy,
      };
    } catch {
      // Keep fallback copy when the public agreement endpoint is unavailable.
    }
  })();
  return state.agreementDocumentsPromise;
}

const authErrorCopy = {
  invalid_phone: "请输入正确的中国大陆手机号",
  sms_cooldown_active: "验证码已发送，请稍后再试",
  daily_sms_limit_exceeded: "当前手机号发送验证码频繁，请于明日再试或前往密码登录。",
  ip_sms_limit_exceeded: "当前ip发送次数过多。",
  sms_send_failed: "短信发送失败，请稍后再试",
  code_invalid: "验证码不正确",
  challenge_expired: "验证码已过期，请重新获取",
  verify_locked: "尝试次数过多，请重新获取验证码",
};

function isMainlandPhoneInput(value) {
  return /^1\d{10}$/.test(String(value || "").trim());
}

function authErrorMessage(payload, fallback) {
  if (payload?.error === "sms_cooldown_active") {
    const cooldownSeconds = Number(payload.cooldownSeconds ?? 0);
    if (cooldownSeconds >= 10 * 60) {
      return "验证码发送频繁，请10分钟后再试";
    }
    if (cooldownSeconds >= 5 * 60) {
      return "验证码发送频繁，请5分钟后再试";
    }
  }
  return authErrorCopy[payload?.error] ?? fallback;
}

async function readJsonResponse(response) {
  const text = await response.text();
  if (!text) {
    return null;
  }
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function resolvePasswordLoginError(response, payload, isTeamMemberLogin) {
  if (isTeamMemberLogin) {
    if (payload?.error === "team_member_disabled") {
      return "子账户已被禁用";
    }
    if (payload?.error === "team_member_deleted") {
      return "子账户已被删除";
    }
    if (payload?.error === "user_disabled") {
      return "管理员账号已被禁用";
    }
    return response.status === 404 ? "子账户登录接口未启动，请重启本地服务" : "子账户或密码不正确";
  }
  if (payload?.error === "invalid_phone") {
    return "请输入正确的手机号";
  }
  if (payload?.error === "user_disabled") {
    return "账号已被禁用";
  }
  return response.status === 404 ? "密码登录接口未启动，请重启本地服务" : "账号或密码不正确";
}

if (root) {
  bootstrap();
}
