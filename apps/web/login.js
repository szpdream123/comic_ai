/**
 * Comic AI Studio - Login Page
 * Fluid background + particle system + auth logic
 */

/* ===== Canvas Fluid Background ===== */
const canvas = document.querySelector("#fluid-canvas");
const ctx = canvas?.getContext("2d");

let width = 0;
let height = 0;
let mouseX = 0;
let mouseY = 0;
let targetMouseX = 0;
let targetMouseY = 0;
let isMouseOverLogin = false;
let time = 0;

// Particle system
const PARTICLE_COUNT = 80;
const particles = [];

class Particle {
  constructor() {
    this.reset();
  }

  reset() {
    this.x = Math.random() * width;
    this.y = Math.random() * height;
    this.vx = (Math.random() - 0.5) * 0.3;
    this.vy = (Math.random() - 0.5) * 0.3;
    this.size = Math.random() * 1.2 + 0.3;
    this.alpha = Math.random() * 0.4 + 0.1;
    this.phase = Math.random() * Math.PI * 2;
    this.speed = Math.random() * 0.5 + 0.2;
  }

  update() {
    // Gentle drift
    this.x += this.vx * this.speed;
    this.y += this.vy * this.speed;

    // Mouse influence (subtle gravitational pull)
    const dx = mouseX - this.x;
    const dy = mouseY - this.y;
    const dist = Math.sqrt(dx * dx + dy * dy);
    const maxDist = 300;

    if (dist < maxDist && dist > 1) {
      const force = (1 - dist / maxDist) * 0.02;
      this.vx += (dx / dist) * force;
      this.vy += (dy / dist) * force;
    }

    // Damping
    this.vx *= 0.99;
    this.vy *= 0.99;

    // Phase-based pulsing
    this.phase += 0.01;

    // Wrap around edges
    if (this.x < -10) this.x = width + 10;
    if (this.x > width + 10) this.x = -10;
    if (this.y < -10) this.y = height + 10;
    if (this.y > height + 10) this.y = -10;
  }

  draw() {
    const pulse = Math.sin(this.phase) * 0.3 + 0.7;
    const alpha = this.alpha * pulse;

    ctx.beginPath();
    ctx.arc(this.x, this.y, this.size, 0, Math.PI * 2);
    ctx.fillStyle = `rgba(99, 102, 241, ${alpha})`;
    ctx.fill();

    // Subtle glow for larger particles
    if (this.size > 0.8) {
      ctx.beginPath();
      ctx.arc(this.x, this.y, this.size * 3, 0, Math.PI * 2);
      ctx.fillStyle = `rgba(99, 102, 241, ${alpha * 0.15})`;
      ctx.fill();
    }
  }
}

// Noise function for fluid field
function noise(x, y, t) {
  const scale = 0.003;
  const nx = x * scale;
  const ny = y * scale;
  const nt = t * 0.0003;

  return (
    Math.sin(nx * 2.3 + nt * 1.7) *
    Math.cos(ny * 1.7 - nt * 2.1) *
    0.5 +
    Math.sin(nx * 1.1 - ny * 2.3 + nt * 1.3) *
    Math.cos(nx * 2.1 + ny * 1.5 + nt * 0.7) *
    0.3 +
    Math.sin(nx * 3.7 + ny * 0.9 + nt * 2.3) * 0.2
  );
}

function resize() {
  width = window.innerWidth;
  height = window.innerHeight;
  canvas.width = width * window.devicePixelRatio;
  canvas.height = height * window.devicePixelRatio;
  canvas.style.width = width + "px";
  canvas.style.height = height + "px";
  ctx?.scale(window.devicePixelRatio, window.devicePixelRatio);
}

function initParticles() {
  particles.length = 0;
  for (let i = 0; i < PARTICLE_COUNT; i++) {
    particles.push(new Particle());
  }
}

function drawFluid() {
  if (!ctx) return;

  ctx.clearRect(0, 0, width, height);

  // Base void color
  ctx.fillStyle = "#020205";
  ctx.fillRect(0, 0, width, height);

  // Slow down fluid when mouse is over login area
  const timeScale = isMouseOverLogin ? 0.3 : 1.0;
  const currentTime = time * timeScale;

  // Draw fluid field (simplified flow lines)
  const gridSize = 40;
  const cols = Math.ceil(width / gridSize) + 1;
  const rows = Math.ceil(height / gridSize) + 1;

  // Ambient indigo/purple blobs
  const blob1x = width * 0.3 + Math.sin(currentTime * 0.0004) * width * 0.15;
  const blob1y = height * 0.4 + Math.cos(currentTime * 0.0003) * height * 0.1;
  const blob2x = width * 0.7 + Math.cos(currentTime * 0.0005) * width * 0.12;
  const blob2y = height * 0.6 + Math.sin(currentTime * 0.0004) * height * 0.08;

  // Large ambient gradients
  const gradient1 = ctx.createRadialGradient(blob1x, blob1y, 0, blob1x, blob1y, width * 0.35);
  gradient1.addColorStop(0, "rgba(26, 27, 75, 0.5)");
  gradient1.addColorStop(0.5, "rgba(26, 27, 75, 0.15)");
  gradient1.addColorStop(1, "transparent");
  ctx.fillStyle = gradient1;
  ctx.fillRect(0, 0, width, height);

  const gradient2 = ctx.createRadialGradient(blob2x, blob2y, 0, blob2x, blob2y, width * 0.3);
  gradient2.addColorStop(0, "rgba(45, 27, 78, 0.4)");
  gradient2.addColorStop(0.5, "rgba(45, 27, 78, 0.1)");
  gradient2.addColorStop(1, "transparent");
  ctx.fillStyle = gradient2;
  ctx.fillRect(0, 0, width, height);

  // Flow field lines
  ctx.lineWidth = 0.5;
  for (let row = 0; row < rows; row += 2) {
    for (let col = 0; col < cols; col += 2) {
      const x = col * gridSize;
      const y = row * gridSize;
      const angle = noise(x, y, currentTime) * Math.PI * 2;
      const length = gridSize * 0.6;

      const nx = Math.cos(angle) * length;
      const ny = Math.sin(angle) * length;

      // Color based on angle
      const hue = 240 + (angle / (Math.PI * 2)) * 40;
      const alpha = 0.04 + Math.abs(noise(x, y, currentTime)) * 0.06;

      ctx.strokeStyle = `hsla(${hue}, 60%, 60%, ${alpha})`;
      ctx.beginPath();
      ctx.moveTo(x - nx * 0.5, y - ny * 0.5);
      ctx.lineTo(x + nx * 0.5, y + ny * 0.5);
      ctx.stroke();
    }
  }

  // Draw particles
  particles.forEach((p) => {
    p.update();
    p.draw();
  });
}

function animate() {
  time += 16;

  // Smooth mouse interpolation
  mouseX += (targetMouseX - mouseX) * 0.08;
  mouseY += (targetMouseY - mouseY) * 0.08;

  drawFluid();
  requestAnimationFrame(animate);
}

// Mouse tracking
document.addEventListener("mousemove", (e) => {
  targetMouseX = e.clientX;
  targetMouseY = e.clientY;
});

// Detect if mouse is over login area
const loginFrame = document.querySelector(".login-frame");
loginFrame?.addEventListener("mouseenter", () => {
  isMouseOverLogin = true;
});
loginFrame?.addEventListener("mouseleave", () => {
  isMouseOverLogin = false;
});

// Init canvas
if (canvas && ctx) {
  resize();
  initParticles();
  animate();
  window.addEventListener("resize", () => {
    resize();
    initParticles();
  });
}

/* ===== Auth Logic ===== */
const form = document.querySelector("#login-form");
const phoneInput = document.querySelector("#phone-input");
const codeInput = document.querySelector("#code-input");
const requestCodeButton = document.querySelector("#request-code-button");
const verifyButton = document.querySelector("#verify-button");
const statusMessage = document.querySelector("#status-message");
const debugPanel = document.querySelector("#debug-panel");
const authPanel = document.querySelector(".auth-panel");
const phoneLoginTab = document.querySelector("#phone-login-tab");
const passwordLoginTab = document.querySelector("#password-login-tab");
const phoneLoginPanel = document.querySelector("#phone-login-panel");
const passwordLoginPanel = document.querySelector("#password-login-panel");
const passwordLoginForm = document.querySelector("#password-login-form");
const phoneRememberInput = document.querySelector("#phone-remember-input");
const accountInput = document.querySelector("#account-input");
const passwordInput = document.querySelector("#password-input");
const passwordRememberInput = document.querySelector("#password-remember-input");
const passwordVisibilityToggle = document.querySelector("#password-visibility-toggle");
const passwordLoginButton = document.querySelector("#password-login-button");
const agreementsSection = document.querySelector(".agreements-section");
const agreementsCheckbox = document.querySelector("#agreements-checkbox");
const agreementsErrorTooltip = document.querySelector("#agreements-error-tooltip");
const agreementLinks = document.querySelectorAll("[data-agreement]");
const agreementModal = document.querySelector("#agreement-modal");
const agreementModalTitle = document.querySelector("#agreement-modal-title");
const agreementModalContent = document.querySelector("#agreement-modal-content");
const agreementModalCloseButtons = document.querySelectorAll("[data-agreement-close]");

let activeChallengeId = null;
let requestCodeCooldownTimer = null;
let requestCodeCooldownEndsAt = 0;
let globalToastTimer = null;
let agreementDocuments = {
  serviceAgreement: {
    title: "用户服务协议",
    contentHtml: "<p>协议内容加载中...</p>",
  },
  privacyPolicy: {
    title: "隐私政策",
    contentHtml: "<p>协议内容加载中...</p>",
  },
};
const CODE_REQUEST_COOLDOWN_SECONDS = 60;
const GLOBAL_TOAST_DURATION_MS = 2000;
const appUrl =
  window.location.protocol === "file:"
    ? resolveApiUrl("/app.html#project")
    : new URL("./app.html#project", window.location.href).toString();

function resolveApiUrl(url) {
  if (/^https?:\/\//i.test(url)) {
    return url;
  }
  const origin =
    window.location.protocol === "file:"
      ? "http://127.0.0.1:4310"
      : window.location.origin;
  return new URL(url, origin).toString();
}

async function loadSession() {
  const response = await fetch(resolveApiUrl("/api/auth/session"), {
    credentials: "include",
  });

  if (!response.ok) {
    return;
  }

  await response.json();
  window.location.href = appUrl;
}

function setStatus(message) {
  statusMessage.textContent = message;
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

async function loadAgreementDocuments() {
  try {
    const response = await fetch(resolveApiUrl("/api/public/legal-documents"), {
      credentials: "include",
    });
    const payload = await response.json();
    if (!response.ok) {
      return;
    }
    agreementDocuments = {
      serviceAgreement: payload.data?.serviceAgreement?.document || agreementDocuments.serviceAgreement,
      privacyPolicy: payload.data?.privacyPolicy?.document || agreementDocuments.privacyPolicy,
    };
  } catch {
    // Keep fallback copy when the public agreement endpoint is unavailable.
  }
}

function showAgreementError(message) {
  if (!agreementsErrorTooltip) {
    return false;
  }
  agreementsErrorTooltip.textContent = message;
  agreementsErrorTooltip.hidden = false;
  agreementsCheckbox?.focus();
  return false;
}

function showAgreementHint(message) {
  if (!agreementsErrorTooltip) {
    return false;
  }
  agreementsErrorTooltip.textContent = message;
  agreementsErrorTooltip.hidden = false;
  return false;
}

function hideAgreementError() {
  if (agreementsErrorTooltip) {
    agreementsErrorTooltip.hidden = true;
  }
}

function updateAgreementActionState() {
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
}

function validateAgreementsAccepted() {
  if (agreementsCheckbox?.checked) {
    hideAgreementError();
    updateAgreementActionState();
    return true;
  }
  updateAgreementActionState();
  showAgreementError("请先同意并勾选上述协议");
  return false;
}

function openAgreementModal(kind) {
  const documentKey = kind === "privacy" ? "privacyPolicy" : "serviceAgreement";
  const documentData = agreementDocuments[documentKey];
  if (agreementModalTitle) {
    agreementModalTitle.textContent = documentData?.title || "协议详情";
  }
  if (agreementModalContent) {
    agreementModalContent.innerHTML = sanitizeAgreementHtml(documentData?.contentHtml || "<p>暂无协议内容。</p>");
  }
  if (agreementModal) {
    agreementModal.hidden = false;
  }
}

function closeAgreementModal() {
  if (agreementModal) {
    agreementModal.hidden = true;
  }
}

function setAuthMode(mode) {
  const isPasswordMode = mode === "password";

  document.body.dataset.authMode = mode;

  if (authPanel) {
    authPanel.dataset.authMode = mode;
  }

  if (phoneLoginTab) {
    phoneLoginTab.setAttribute("aria-selected", String(!isPasswordMode));
  }

  if (passwordLoginTab) {
    passwordLoginTab.setAttribute("aria-selected", String(isPasswordMode));
  }

  if (phoneLoginPanel) {
    phoneLoginPanel.hidden = isPasswordMode;
  }

  if (passwordLoginPanel) {
    passwordLoginPanel.hidden = !isPasswordMode;
  }

  if (isPasswordMode) {
    debugPanel.hidden = true;
    setStatus("");
  }
}

function showGlobalToast(type, title, detail) {
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

  if (globalToastTimer) {
    clearTimeout(globalToastTimer);
  }

  globalToastTimer = setTimeout(() => {
    toast.classList.remove("visible");
    globalToastTimer = setTimeout(() => {
      toast.remove();
      globalToastTimer = null;
    }, 220);
  }, GLOBAL_TOAST_DURATION_MS);
}

const errorCopy = {
  invalid_phone: "请输入正确的中国大陆手机号",
  sms_cooldown_active: "验证码已发送，请稍后再试",
  daily_sms_limit_exceeded: "今日验证码发送次数已达上限，请明天再试",
  sms_send_failed: "短信发送失败，请稍后再试",
  code_invalid: "验证码不正确",
  challenge_expired: "验证码已过期，请重新获取",
  verify_locked: "尝试次数过多，请重新获取验证码",
};

function authErrorMessage(payload, fallback) {
  return errorCopy[payload?.error] ?? fallback;
}

function showDebug(message) {
  debugPanel.hidden = false;
  debugPanel.textContent = message;
}

await loadAgreementDocuments();

function updateRequestCodeButton() {
  if (!requestCodeButton) {
    return;
  }

  const remainingSeconds = Math.max(
    0,
    Math.ceil((requestCodeCooldownEndsAt - Date.now()) / 1000),
  );

  if (remainingSeconds > 0) {
    requestCodeButton.disabled = true;
    requestCodeButton.textContent = `${remainingSeconds} 秒后重新发送`;
    return;
  }

  if (requestCodeCooldownTimer) {
    clearInterval(requestCodeCooldownTimer);
    requestCodeCooldownTimer = null;
  }

  requestCodeCooldownEndsAt = 0;
  requestCodeButton.disabled = false;
  requestCodeButton.textContent = "重新发送";
}

function startRequestCodeCooldown(seconds = CODE_REQUEST_COOLDOWN_SECONDS) {
  requestCodeCooldownEndsAt = Date.now() + seconds * 1000;
  updateRequestCodeButton();

  if (requestCodeCooldownTimer) {
    clearInterval(requestCodeCooldownTimer);
  }

  requestCodeCooldownTimer = setInterval(updateRequestCodeButton, 250);
}

function resetRequestCodeButton(label = "获取验证码") {
  if (requestCodeCooldownTimer) {
    clearInterval(requestCodeCooldownTimer);
    requestCodeCooldownTimer = null;
  }

  requestCodeCooldownEndsAt = 0;

  if (requestCodeButton) {
    requestCodeButton.disabled = false;
    requestCodeButton.textContent = label;
  }
}

requestCodeButton?.addEventListener("click", async () => {
  if (requestCodeButton.disabled) {
    return;
  }

  if (!validateAgreementsAccepted()) {
    return;
  }

  const phone = phoneInput?.value?.trim() ?? "";
  requestCodeButton.disabled = true;
  requestCodeButton.textContent = "发送中...";
  setStatus("正在请求验证码...");

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
    setStatus("验证码请求失败");
    showGlobalToast("error", "验证码发送失败", "网络连接异常，请稍后再试");
    return;
  }

  if (!requestResponse.ok) {
    const message = authErrorMessage(requestPayload, "验证码请求失败");
    resetRequestCodeButton();
    setStatus(message);
    showGlobalToast("error", "验证码发送失败", message);
    return;
  }

  startRequestCodeCooldown();
  activeChallengeId = requestPayload.challengeId;
  const remainingText =
    typeof requestPayload.remainingToday === "number"
      ? `，今日还可发送 ${requestPayload.remainingToday} 次`
      : "";
  const deliveredMessage = `验证码已发送至 ${requestPayload.maskedPhone}${remainingText}`;
  setStatus(deliveredMessage);
  showGlobalToast("success", "验证码已发送", deliveredMessage);

  if (requestPayload.devCode) {
    showDebug(`开发验证码：${requestPayload.devCode}`);
    return;
  }

  const debugResponse = await fetch(
    resolveApiUrl(`/api/auth/dev/challenges/${requestPayload.challengeId}`),
    { credentials: "include" },
  );

  if (debugResponse.ok) {
    const debugPayload = await debugResponse.json();
    showDebug(`开发验证码：${debugPayload.code}`);
  }
});

form?.addEventListener("submit", async (event) => {
  event.preventDefault();

  const phone = phoneInput?.value?.trim() ?? "";
  const code = codeInput?.value?.trim() ?? "";

  if (!validateAgreementsAccepted()) {
    return;
  }

  if (!activeChallengeId) {
    setStatus("请先获取验证码");
    showGlobalToast("error", "登录失败", "请先获取验证码");
    return;
  }

  setStatus("正在登录...");

  const verifyResponse = await fetch(resolveApiUrl("/api/auth/code/verify"), {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      challengeId: activeChallengeId,
      phone,
      code,
      remember: phoneRememberInput?.checked !== false,
    }),
    credentials: "include",
  });

  const verifyPayload = await verifyResponse.json();

  if (!verifyResponse.ok) {
    const message = authErrorMessage(verifyPayload, "登录失败");
    setStatus(message);
    showGlobalToast("error", "登录失败", message);
    return;
  }

  const loginMessage = `登录成功：${verifyPayload.user.phone}`;
  setStatus(loginMessage);
  showGlobalToast("success", "登录成功", loginMessage);

  const overlay = document.createElement("div");
  overlay.className = "dissolve-overlay";
  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    overlay.classList.add("active");
  });

  setTimeout(() => {
    window.location.href = appUrl;
  }, 800);
});

verifyButton?.addEventListener("click", (event) => {
  if (agreementsCheckbox?.checked) {
    return;
  }
  event.preventDefault();
  validateAgreementsAccepted();
});

phoneLoginTab?.addEventListener("click", () => {
  setAuthMode("phone");
});

passwordLoginTab?.addEventListener("click", () => {
  setAuthMode("password");
});

agreementsCheckbox?.addEventListener("change", () => {
  if (agreementsCheckbox.checked) {
    hideAgreementError();
  }
  updateAgreementActionState();
});

agreementLinks.forEach((button) => {
  button.addEventListener("click", () => {
    openAgreementModal(button.dataset.agreement);
  });
});

agreementModalCloseButtons.forEach((button) => {
  button.addEventListener("click", closeAgreementModal);
});

passwordVisibilityToggle?.addEventListener("click", () => {
  if (!passwordInput) {
    return;
  }

  const isPasswordVisible = passwordInput.type === "password";
  passwordInput.type = isPasswordVisible ? "text" : "password";
  passwordVisibilityToggle.setAttribute(
    "aria-label",
    isPasswordVisible ? "隐藏密码" : "显示密码",
  );
});

passwordLoginButton?.addEventListener("click", (event) => {
  if (agreementsCheckbox?.checked) {
    return;
  }
  event.preventDefault();
  validateAgreementsAccepted();
});

passwordLoginForm?.addEventListener("submit", async (event) => {
  event.preventDefault();
  if (!validateAgreementsAccepted()) {
    return;
  }

  const account = accountInput?.value?.trim() ?? "";
  const password = passwordInput?.value ?? "";
  const remember = passwordRememberInput?.checked !== false;
  passwordLoginButton.disabled = true;
  setStatus("正在登录...");

  let loginResponse;
  let loginPayload;
  try {
    loginResponse = await fetch(resolveApiUrl("/api/auth/password/login"), {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ account, password, remember }),
      credentials: "include",
    });
    loginPayload = await loginResponse.json();
  } catch {
    passwordLoginButton.disabled = false;
    setStatus("密码登录失败");
    showGlobalToast("error", "密码登录失败", "网络连接异常，请稍后再试");
    return;
  }

  if (!loginResponse.ok) {
    passwordLoginButton.disabled = false;
    const message =
      loginPayload?.error === "invalid_phone"
        ? "请输入正确的手机号"
        : loginPayload?.error === "user_disabled"
          ? "账号已被禁用"
          : "账号或密码不正确";
    setStatus(message);
    showGlobalToast("error", "密码登录失败", message);
    return;
  }

  const loginMessage = `登录成功：${loginPayload.user.phone}`;
  setStatus(loginMessage);
  showGlobalToast("success", "登录成功", loginMessage);

  const overlay = document.createElement("div");
  overlay.className = "dissolve-overlay";
  document.body.appendChild(overlay);

  requestAnimationFrame(() => {
    overlay.classList.add("active");
  });

  setTimeout(() => {
    window.location.href = appUrl;
  }, 800);
});

/* ===== Social Login Placeholders ===== */
const socialButtons = document.querySelectorAll(".social-btn");

socialButtons.forEach((btn) => {
  btn.addEventListener("click", () => {
    const provider = btn.dataset.providerLabel || "第三方";
    setStatus(`${provider} 登录即将上线`);
  });
});

updateAgreementActionState();

await loadSession();
