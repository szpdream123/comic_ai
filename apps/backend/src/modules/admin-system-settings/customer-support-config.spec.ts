import assert from "node:assert/strict";
import test from "node:test";

import {
  defaultCustomerSupportConfig,
  normalizeCustomerSupportConfig,
  readPublicCustomerSupportConfigFromDb,
} from "./admin-system-settings.service.ts";

test("normalizes the enterprise contact qr independently from the community qr", () => {
  assert.deepEqual(
    normalizeCustomerSupportConfig({
      communityImageUrl: " https://cdn.example.test/community.png ",
      enterpriseContactImageUrl: " https://cdn.example.test/enterprise.png ",
    }),
    {
      ...defaultCustomerSupportConfig,
      communityImageUrl: "https://cdn.example.test/community.png",
      enterpriseContactImageUrl: "https://cdn.example.test/enterprise.png",
    },
  );
});

test("keeps legacy customer support configs compatible", () => {
  assert.equal(normalizeCustomerSupportConfig({ communityImageUrl: "/community.png" }).enterpriseContactImageUrl, "");
});

test("returns the enterprise contact qr from the public customer support config", async () => {
  const db = {
    async query() {
      return {
        rows: [{
          value_json: {
            communityImageUrl: "/community.png",
            enterpriseContactImageUrl: "/enterprise.png",
          },
        }],
      };
    },
  };

  const config = await readPublicCustomerSupportConfigFromDb(db as never);

  assert.equal(config.communityImageUrl, "/community.png");
  assert.equal(config.enterpriseContactImageUrl, "/enterprise.png");
});
