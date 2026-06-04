# Tencent SMS Phone Auth Design

**Goal:** Upgrade the existing mainland phone-code login flow to use Tencent Cloud SMS in production, keep local debug login available for development, enforce daily and cooldown limits, record request IP metadata, and extend server-side sessions to a 30-day remember-login period.

**Scope:** This design covers the login module only:
- requesting a verification SMS
- recording SMS send attempts and IP metadata
- verifying the existing 6-digit code challenge
- issuing a 30-day server-side session
- documenting Tencent SMS environment configuration

Out of scope:
- multi-factor authentication
- WeChat, QQ, Alipay, or password login
- global SMS support outside mainland China phone numbers
- IP-based hard blocking beyond request recording

## 1. Current Context

The project already has a phone auth slice:
- `apps/backend/src/modules/identity/login-challenge.service.ts` creates 6-digit code challenges with 5-minute expiry.
- `apps/backend/src/modules/identity/persistent-auth.service.ts` persists challenges and sessions.
- `apps/backend/src/modules/identity/session.service.ts` issues server-side sessions.
- `apps/backend/src/entrypoints/phone-auth-dev-server.ts` exposes `/api/auth/code/request`, `/api/auth/code/verify`, `/api/auth/session`, `/api/auth/logout`, and the development challenge endpoint.
- `apps/web/login.js` calls the auth endpoints from the login page.

The change should extend this slice instead of replacing it.

## 2. Decisions

### 2.1 SMS Provider

Use Tencent Cloud SMS for production delivery.

Reason:
- the user explicitly changed the provider from Aliyun to Tencent Cloud
- Tencent SMS uses an SDK AppID, SignName, TemplateID, region, SecretId, and SecretKey, which can be cleanly represented in `.env`
- a provider adapter keeps development mode independent from production credentials

### 2.2 Development Mode

Keep the existing development debug path.

Rules:
- when `TENCENT_SMS_ENABLED=false`, the backend creates the challenge but does not call Tencent Cloud
- the debug challenge endpoint may expose the plaintext code only under development/debug gates
- production must not expose plaintext verification codes

### 2.3 Verification Code

Keep the existing challenge semantics:
- 6-digit numeric code
- 5-minute validity
- code hash stored at rest
- plaintext code returned only to the SMS provider or the development debug endpoint
- verification errors return stable error codes

### 2.4 Daily Limit

Each phone number may receive at most 3 successfully sent SMS messages per Asia/Shanghai calendar day.

Only records with `status = 'sent'` count toward the daily limit.

Failed provider attempts do not count. Rate-limited attempts do not count.

### 2.5 Cooldown

After a successful SMS send, the same phone number cannot request another code for 60 seconds.

Only the latest `status = 'sent'` record drives cooldown. Provider failures do not start cooldown.

### 2.6 IP Recording

Each SMS request records the request IP as a hash, not raw IP text.

Reason:
- this satisfies the requirement to record the current IP and request record
- raw IP storage is avoided unless the product later needs stricter fraud analysis
- hashing matches the existing identity slice pattern for sensitive metadata

### 2.7 Session Duration

Successful verification issues a server-side session valid for 30 days.

Both sides must agree:
- `auth_sessions.expires_at = now + 30 days`
- cookie includes `Max-Age=2592000`

After 30 days, `/api/auth/session` returns `401 unauthenticated`, and the frontend remains on or redirects to the login page.

## 3. Data Model

Add a dedicated SMS send record table.

```sql
CREATE TABLE sms_send_records (
  id uuid PRIMARY KEY,
  phone_e164 text NOT NULL,
  challenge_id uuid NULL REFERENCES login_challenges(id),
  provider text NOT NULL CHECK (provider IN ('tencent', 'dev')),
  status text NOT NULL CHECK (
    status IN ('requested', 'sent', 'failed', 'rate_limited')
  ),
  ip_address_hash text NULL,
  user_agent_hash text NULL,
  provider_request_id text NULL,
  error_code text NULL,
  created_at timestamptz NOT NULL DEFAULT now()
);

CREATE INDEX sms_send_records_phone_created_idx
  ON sms_send_records (phone_e164, created_at DESC);

CREATE INDEX sms_send_records_phone_status_created_idx
  ON sms_send_records (phone_e164, status, created_at DESC);
```

`login_challenges.created_ip_hash` and `created_user_agent_hash` can continue to exist, but SMS delivery auditing should use `sms_send_records` because one phone may have multiple send attempts and provider outcomes.

## 4. Environment Configuration

Add the following variables to `.env.example`, with Chinese comments. Real secrets belong only in `.env`.

```env
# 腾讯云短信：是否启用真实短信发送。false 时使用本地开发调试验证码
TENCENT_SMS_ENABLED=false

# 腾讯云短信：SecretId，请在腾讯云访问管理 CAM 中创建
TENCENT_SMS_SECRET_ID=

# 腾讯云短信：SecretKey，只能写入本地 .env，禁止提交到仓库
TENCENT_SMS_SECRET_KEY=

# 腾讯云短信：短信应用 SDK AppID
TENCENT_SMS_SDK_APP_ID=

# 腾讯云短信：短信签名名称，例如「漫剧AI」
TENCENT_SMS_SIGN_NAME=

# 腾讯云短信：验证码模板 ID，模板变量建议为 {1}=验证码，{2}=有效分钟数
TENCENT_SMS_TEMPLATE_ID=

# 腾讯云短信：发送区域，中国大陆默认 ap-guangzhou
TENCENT_SMS_REGION=ap-guangzhou
```

The local `.env` may include the same commented block. Do not commit real credential values.

## 5. Backend API Behavior

### 5.1 `POST /api/auth/code/request`

Request:

```json
{
  "phone": "13800138000"
}
```

Success response:

```json
{
  "challengeId": "uuid",
  "maskedPhone": "138****8000",
  "expiresAt": "2026-06-04T10:05:00.000Z",
  "retryAfterSeconds": 60,
  "remainingToday": 2
}
```

Processing order:
1. Validate and normalize the phone to `+86...`.
2. Hash the request IP and user agent.
3. Count today's `sent` records for this phone in Asia/Shanghai.
4. If count is 3 or more, write a `rate_limited` record and return `daily_sms_limit_exceeded`.
5. Find the latest `sent` record for this phone.
6. If it is less than 60 seconds old, write a `rate_limited` record and return `sms_cooldown_active` with `retryAfterSeconds`.
7. Create a 5-minute login challenge.
8. Call the configured SMS provider.
9. If provider succeeds, write `sent` and return success.
10. If provider fails, revoke the challenge, write `failed`, and return `sms_send_failed`.

### 5.2 `POST /api/auth/code/verify`

Keep the existing behavior.

Important errors:
- `code_invalid`
- `challenge_expired`
- `challenge_consumed`
- `verify_locked`
- `user_disabled`

On success, create a 30-day server-side session and set the 30-day cookie.

### 5.3 `GET /api/auth/session`

Keep the existing behavior, but session validity is now 30 days from login.

### 5.4 `POST /api/auth/logout`

Keep the existing behavior:
- revoke server-side session
- clear cookie

## 6. SMS Provider Boundary

Create a focused provider interface:

```ts
export interface SmsProvider {
  sendVerificationCode(input: {
    phoneE164: string;
    code: string;
    expiresInMinutes: number;
  }): Promise<
    | { kind: "sent"; providerRequestId?: string }
    | { kind: "failed"; errorCode: string; message?: string }
  >;
}
```

`TencentSmsProvider` maps:
- `phoneE164` to Tencent `PhoneNumberSet`
- `TENCENT_SMS_SDK_APP_ID` to `SmsSdkAppId`
- `TENCENT_SMS_SIGN_NAME` to `SignName`
- `TENCENT_SMS_TEMPLATE_ID` to `TemplateId`
- code and validity minutes to `TemplateParamSet`

`DevSmsProvider` returns `sent` without network IO.

## 7. Frontend Behavior

The login page remains a two-field phone/code login.

Request-code button behavior:
- disable while request is in flight
- after success, show masked phone
- start a 60-second resend countdown
- show remaining daily sends if returned

Error copy:
- `invalid_phone` -> `请输入正确的中国大陆手机号`
- `sms_cooldown_active` -> `验证码已发送，请稍后再试`
- `daily_sms_limit_exceeded` -> `今日验证码发送次数已达上限，请明天再试`
- `sms_send_failed` -> `短信发送失败，请稍后再试`
- `code_invalid` -> `验证码不正确`
- `challenge_expired` -> `验证码已过期，请重新获取`
- `verify_locked` -> `尝试次数过多，请重新获取验证码`

## 8. Tests

Backend tests should prove:
- successful SMS requests create a challenge and a `sent` record
- provider failure creates a `failed` record, revokes the challenge, and does not count toward the daily limit
- a fourth successful send on the same Asia/Shanghai day is rejected
- another request within 60 seconds of the latest successful send is rejected
- IP and user agent metadata are hashed
- sessions expire after 30 days, not 7 days
- cookie includes `Max-Age=2592000`

Frontend tests should prove:
- login page maps cooldown, daily limit, and provider failure errors to Chinese copy
- the request-code button starts or reflects the resend cooldown

## 9. Final Recommendation

Proceed with a provider-adapter implementation:
- `SmsProvider` interface
- `TencentSmsProvider`
- `DevSmsProvider`
- `sms_send_records`
- request-code orchestration in the persistent auth service
- 30-day session TTL and cookie `Max-Age`
- environment variables documented in `.env.example` and local `.env` comments

This keeps the existing phone login flow intact while adding the production SMS boundary and abuse controls required for real deployment.
