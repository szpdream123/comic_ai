# Favicon Replacement Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace only the browser-tab favicon with the supplied wing artwork while leaving all in-page branding unchanged.

**Architecture:** Keep the existing PNG favicon asset path so no application component needs a new dependency. Remove the competing SVG favicon declaration, update the PNG URL with a new cache-busting version, and protect the selected declaration with a focused HTML-source test.

**Tech Stack:** Static HTML, PNG asset, Node.js test runner, browser QA

---

### Task 1: Lock the favicon declaration with a failing test

**Files:**
- Modify: `apps/web/tests/login-page.spec.ts:61`
- Test: `apps/web/tests/login-page.spec.ts`

- [ ] **Step 1: Add the expected PNG favicon assertions**

Inside `it("includes a creator workspace shell", ...)`, immediately after loading `app.html`, add:

```ts
assert.match(
  html,
  /<link rel="icon" type="image\/png" sizes="256x256" href="\/assets\/brand\/lingxi-ai-favicon\.png\?v=20260710-wing" \/>/,
);
assert.doesNotMatch(html, /lingxi-ai-favicon\.svg/);
```

- [ ] **Step 2: Run the focused test and verify RED**

Run:

```powershell
node scripts/run-tests.mjs apps/web/tests/login-page.spec.ts
```

Expected: FAIL in `includes a creator workspace shell` because `app.html` still contains the SVG declaration and the PNG URL still uses `v=20260705-wing-final`.

### Task 2: Replace the favicon asset and declaration

**Files:**
- Replace: `apps/web/assets/brand/lingxi-ai-favicon.png`
- Modify: `apps/web/app.html:13-14`
- Test: `apps/web/tests/login-page.spec.ts`

- [ ] **Step 1: Copy the approved source image over the existing PNG asset**

Run:

```powershell
Copy-Item -LiteralPath 'C:\Users\索志朋\AppData\Local\Temp\codex-clipboard-a8e0c9d3-08ec-43e6-8576-60ff85d460a3.png' -Destination 'apps/web/assets/brand/lingxi-ai-favicon.png' -Force
```

- [ ] **Step 2: Make the PNG the only active favicon**

Replace the two current favicon declarations in `apps/web/app.html` with:

```html
<link rel="icon" type="image/png" sizes="256x256" href="/assets/brand/lingxi-ai-favicon.png?v=20260710-wing" />
```

Do not modify `apps/web/assets/brand/lingxi-ai-favicon.svg`; it remains an unused, reversible legacy asset.

- [ ] **Step 3: Run the focused test and verify GREEN**

Run:

```powershell
node scripts/run-tests.mjs apps/web/tests/login-page.spec.ts
```

Expected: 12 tests pass, 0 fail.

- [ ] **Step 4: Verify the copied asset and scoped diff**

Run:

```powershell
Add-Type -AssemblyName System.Drawing
$image = [System.Drawing.Image]::FromFile((Resolve-Path 'apps/web/assets/brand/lingxi-ai-favicon.png'))
try {
  if ($image.Width -ne 256 -or $image.Height -ne 256) { throw 'Unexpected favicon dimensions' }
} finally {
  $image.Dispose()
}
git diff --check -- apps/web/app.html apps/web/assets/brand/lingxi-ai-favicon.png apps/web/tests/login-page.spec.ts
git status --short
```

Expected: the image is 256×256; Git reports changes only to the HTML, PNG, test, and this implementation-plan document.

### Task 3: Verify browser rendering

**Files:**
- Verify: `apps/web/app.html`
- Verify: `apps/web/assets/brand/lingxi-ai-favicon.png`

- [ ] **Step 1: Verify the running server serves the new declaration and asset**

With the existing server at `http://127.0.0.1:4310`, run:

```powershell
$html = (Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:4310/app.html').Content
if ($html -notmatch 'lingxi-ai-favicon\.png\?v=20260710-wing') { throw 'New favicon declaration is not being served' }
$asset = Invoke-WebRequest -UseBasicParsing 'http://127.0.0.1:4310/assets/brand/lingxi-ai-favicon.png?v=20260710-wing'
if ($asset.StatusCode -ne 200) { throw 'Favicon asset is not being served' }
```

Expected: `app.html` contains the versioned PNG URL and the PNG request returns HTTP 200.

- [ ] **Step 2: Inspect the page in the browser**

Open `http://127.0.0.1:4310/app.html`, reload the page, and inspect the browser tab.

Expected: the tab shows the supplied neon wing icon; no in-page logo or navigation icon changes.

- [ ] **Step 3: Commit the implementation**

Run:

```powershell
git add -- apps/web/app.html apps/web/assets/brand/lingxi-ai-favicon.png apps/web/tests/login-page.spec.ts docs/superpowers/plans/2026-07-10-favicon-replacement.md
git commit -m "fix: replace browser favicon"
```

Expected: one implementation commit containing only the favicon declaration, PNG asset, focused test, and implementation plan.
