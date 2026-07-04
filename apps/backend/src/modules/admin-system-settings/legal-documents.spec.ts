import assert from "node:assert/strict";
import { test } from "node:test";

import { normalizeLegalDocuments } from "./legal-documents.ts";

test("normalizing legal documents preserves row order when only updatedAt changes for tied sort order", () => {
  const documents = normalizeLegalDocuments(
    [
      {
        id: "legal-service",
        type: "service",
        title: "Service Agreement",
        contentHtml: "<p>Service</p>",
        versionLabel: "2026-07-01",
        status: "enabled",
        sortOrder: 100,
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
      {
        id: "legal-privacy-z",
        type: "privacy",
        title: "Privacy Policy",
        contentHtml: "<p>Privacy</p>",
        versionLabel: "2026-07-01",
        status: "enabled",
        sortOrder: 200,
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-01T00:00:00.000Z",
      },
      {
        id: "legal-recharge-a",
        type: "recharge_terms",
        title: "Paid Membership Agreement",
        contentHtml: "<p>Recharge</p>",
        versionLabel: "2026-07-01",
        status: "disabled",
        sortOrder: 200,
        createdAt: "2026-07-01T00:00:00.000Z",
        updatedAt: "2026-07-04T00:00:00.000Z",
      },
    ],
    new Date("2026-07-04T00:00:00.000Z"),
  );

  assert.deepEqual(
    documents.map((document) => document.id),
    ["legal-service", "legal-privacy-z", "legal-recharge-a"],
  );
});
