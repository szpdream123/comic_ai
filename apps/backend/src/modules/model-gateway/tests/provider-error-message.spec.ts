import assert from "node:assert/strict";
import { describe, it } from "node:test";

import { translateProviderErrorMessage } from "../provider-error-message.ts";

describe("provider error message", () => {
  it("translates a nested provider authentication failure even when the HTTP status is absent", () => {
    assert.equal(
      translateProviderErrorMessage(
        'fail_to_fetch_task:{"error":{"code":"AuthenticationError","message":"The API key format is incorrect.","type":"Unauthorized"}}',
      ),
      "模型服务鉴权失败，请检查 API 密钥和账号权限。",
    );
  });
});
