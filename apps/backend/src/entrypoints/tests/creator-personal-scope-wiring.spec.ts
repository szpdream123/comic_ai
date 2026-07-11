import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { describe, it } from "node:test";

describe("creator personal scope wiring", () => {
  it("uses only the authenticated user id for creator credit ledger business ownership", async () => {
    const source = await readFile(
      new URL("../phone-auth-dev-server.ts", import.meta.url),
      "utf8",
    );
    const routeStart = source.indexOf(
      'if (request.method === "GET" && pathname === "/api/creator/credits/ledger")',
    );
    const routeEnd = source.indexOf(
      'if (request.method === "POST" && pathname === "/api/creator/team/members")',
      routeStart,
    );
    assert.ok(routeStart >= 0 && routeEnd > routeStart);

    const routeSource = source.slice(routeStart, routeEnd);
    const ledgerCall = routeSource.match(/listCreatorUserCreditLedger\(\{([\s\S]*?)\}\)/)?.[1] ?? "";
    assert.match(ledgerCall, /userId:\s*authenticated\.user\.id/);
    assert.doesNotMatch(ledgerCall, /organizationId/);
    assert.doesNotMatch(ledgerCall, /workspaceId/);
  });

  it("enriches only the canonical current credit ledger page", async () => {
    const source = await readFile(
      new URL("../phone-auth-dev-server.ts", import.meta.url),
      "utf8",
    );
    const helperStart = source.indexOf("async function listCreatorAdminCreditLedger");
    const helperEnd = source.indexOf("function adminCreatorLedgerFromRow", helperStart);
    assert.ok(helperStart >= 0 && helperEnd > helperStart);

    const helperSource = source.slice(helperStart, helperEnd);
    assert.match(helperSource, /ledger\.id\s*=\s*ANY\(/);
    assert.doesNotMatch(helperSource, /page\s*\*\s*pageSize/);
    assert.doesNotMatch(helperSource, /fetchLimit/);
    assert.doesNotMatch(helperSource, /input\.workspaceId/);
  });

  it("localizes legacy team asset generation credit records", async () => {
    const source = await readFile(
      new URL("../phone-auth-dev-server.ts", import.meta.url),
      "utf8",
    );
    const normalizerStart = source.indexOf("function normalizeLedgerReasonToChinese");
    const normalizerEnd = source.indexOf("function resolveCreditLedgerAccountLabel", normalizerStart);
    const legacyRouteStart = source.indexOf(
      'if (request.method === "POST" && pathname === "/api/creator/team-assets/generate")',
    );
    const legacyRouteEnd = source.indexOf(
      'if (request.method === "PATCH" && pathname.startsWith("/api/creator/team-assets/"))',
      legacyRouteStart,
    );
    assert.ok(normalizerStart >= 0 && normalizerEnd > normalizerStart);
    assert.ok(legacyRouteStart >= 0 && legacyRouteEnd > legacyRouteStart);

    assert.match(
      source.slice(normalizerStart, normalizerEnd),
      /"team asset image generation": "图片生成积分扣减"/,
    );
    assert.match(source.slice(legacyRouteStart, legacyRouteEnd), /reason: "图片生成积分扣减"/);
    assert.doesNotMatch(source.slice(legacyRouteStart, legacyRouteEnd), /reason: "team asset image generation"/);
  });

  it("creates new personal project workspaces under the user's personal compatibility organization", async () => {
    const source = await readFile(
      new URL("../phone-auth-dev-server.ts", import.meta.url),
      "utf8",
    );
    const helperStart = source.indexOf("async function ensurePersonalProjectWorkspaceAccess");
    const helperEnd = source.indexOf(
      "async function repairDevOrganizationLegacyCreditLots",
      helperStart,
    );
    assert.ok(helperStart >= 0 && helperEnd > helperStart);

    const helperSource = source.slice(helperStart, helperEnd);
    assert.match(helperSource, /userProjectCompatibilityWorkspaceIdCandidates\(userId\)/);
    assert.match(helperSource, /await ensurePersonalDevWorkspaceAccess\(db, userId\)/);
    assert.match(helperSource, /billingScope\.organizationId/);
    assert.match(helperSource, /FROM memberships/);
    assert.match(helperSource, /FROM projects/);
    assert.doesNotMatch(
      helperSource,
      /existingWorkspace\?\.organization_id\s*\?\?\s*devOrganizationId/,
    );
  });

  it("resolves membership routes through the same persisted personal billing scope", async () => {
    const source = await readFile(
      new URL("../phone-auth-dev-server.ts", import.meta.url),
      "utf8",
    );
    const routeStart = source.indexOf('if (pathname.startsWith("/api/membership/"))');
    const routeEnd = source.indexOf('if (pathname.startsWith("/api/billing/"))', routeStart);
    assert.ok(routeStart >= 0 && routeEnd > routeStart);

    const routeSource = source.slice(routeStart, routeEnd);
    assert.match(
      routeSource,
      /await resolvePersonalBillingScopeForSession\(db, authenticated\)/,
    );
    assert.doesNotMatch(routeSource, /personalDevTenantScope\(authenticated\.user\.id\)/);
  });

  it("resolves billing compatibility scope from the persisted workspace", async () => {
    const source = await readFile(
      new URL("../phone-auth-dev-server.ts", import.meta.url),
      "utf8",
    );
    const resolverStart = source.indexOf("async function resolvePersonalBillingScopeForSession");
    const resolverEnd = source.indexOf(
      "async function ensurePersonalProjectWorkspaceForSession",
      resolverStart,
    );
    assert.ok(resolverStart >= 0 && resolverEnd > resolverStart);

    const resolverSource = source.slice(resolverStart, resolverEnd);
    assert.match(resolverSource, /return ensurePersonalDevWorkspaceAccess\(db, authenticated\.user\.id\)/);
    assert.doesNotMatch(resolverSource, /resolveActorContext\(db,/);
  });

  it("preserves an existing billing workspace organization instead of forcing a generated id", async () => {
    const source = await readFile(
      new URL("../phone-auth-dev-server.ts", import.meta.url),
      "utf8",
    );
    const helperStart = source.indexOf("async function ensurePersonalDevWorkspaceAccess");
    const helperEnd = source.indexOf(
      "async function resolvePersonalProjectWorkspaceForSession",
      helperStart,
    );
    assert.ok(helperStart >= 0 && helperEnd > helperStart);

    const helperSource = source.slice(helperStart, helperEnd);
    assert.match(helperSource, /userCompatibilityScopeCandidates\(userId\)/);
    assert.match(helperSource, /FROM memberships/);
    assert.match(helperSource, /primaryWorkspaceId/);
    assert.match(helperSource, /other_membership\.user_id\s*<>\s*\$3/);
    assert.match(helperSource, /other_project\.created_by_user_id\s*<>\s*\$3/);
    assert.match(helperSource, /organizationId:\s*existingWorkspace\.organization_id/);
    assert.doesNotMatch(helperSource, /\[scope\.workspaceId, scope\.organizationId\]/);
  });

  it("does not reactivate or grant ownership for an existing personal workspace", async () => {
    const source = await readFile(
      new URL("../phone-auth-dev-server.ts", import.meta.url),
      "utf8",
    );

    for (const [helperName, nextHelperName] of [
      ["ensurePersonalDevWorkspaceAccess", "resolvePersonalProjectWorkspaceForSession"],
      ["ensurePersonalProjectWorkspaceAccess", "repairDevOrganizationLegacyCreditLots"],
    ]) {
      const helperStart = source.indexOf(`async function ${helperName}`);
      const helperEnd = source.indexOf(`async function ${nextHelperName}`, helperStart);
      assert.ok(helperStart >= 0 && helperEnd > helperStart);

      const helperSource = source.slice(helperStart, helperEnd);
      assert.match(helperSource, /if \(existingWorkspace\) \{/);
      assert.match(helperSource, /await db\.query\("BEGIN"\)/);
      assert.match(helperSource, /await db\.query\("ROLLBACK"\)/);
      assert.doesNotMatch(helperSource, /ON CONFLICT \(id\) DO UPDATE[\s\S]*status = 'active'/);
      assert.doesNotMatch(helperSource, /DO UPDATE SET role = 'owner_admin', status = 'active'/);
    }
  });

  it("repairs shared dev projects with resolved user scopes and retries after failure", async () => {
    const source = await readFile(
      new URL("../phone-auth-dev-server.ts", import.meta.url),
      "utf8",
    );
    const cacheStart = source.indexOf("const teamWorkspaceProjectRepairPromises");
    const repairEnd = source.indexOf("function personalProjectWorkspaceId", cacheStart);
    assert.ok(cacheStart >= 0 && repairEnd > cacheStart);

    const repairSource = source.slice(cacheStart, repairEnd);
    assert.match(repairSource, /Map<string, Promise<void>>/);
    assert.match(repairSource, /repairPromises\.delete\(userId\)/);
    assert.match(repairSource, /created_by_user_id = \$4/);
    assert.match(repairSource, /workspace\.organization_id\s*!==\s*devOrganizationId/);
    assert.match(repairSource, /SET workspace_id = \$3/);
    assert.doesNotMatch(repairSource, /SET organization_id\s*=/);
    assert.doesNotMatch(repairSource, /SELECT DISTINCT created_by_user_id/);
    assert.doesNotMatch(repairSource, /substr\('c'/);
  });

  it("keeps legacy shared projects in their existing compatibility organization", async () => {
    const source = await readFile(
      new URL("../phone-auth-dev-server.ts", import.meta.url),
      "utf8",
    );
    const helperStart = source.indexOf("async function ensurePersonalProjectWorkspaceAccess");
    const helperEnd = source.indexOf(
      "async function repairDevOrganizationLegacyCreditLots",
      helperStart,
    );
    assert.ok(helperStart >= 0 && helperEnd > helperStart);

    const helperSource = source.slice(helperStart, helperEnd);
    const legacyProjectLookup = helperSource.indexOf("legacyDevProject");
    const billingScopeLookup = helperSource.indexOf("ensurePersonalDevWorkspaceAccess(db, userId)");
    assert.ok(legacyProjectLookup >= 0);
    assert.ok(billingScopeLookup > legacyProjectLookup);
    assert.match(helperSource, /organization_id = \$1[\s\S]*workspace_id = \$2[\s\S]*created_by_user_id = \$3/);
    assert.match(helperSource, /legacyWorkspace\.organization_id !== devOrganizationId/);
    assert.match(helperSource, /\[workspaceId, devOrganizationId\]/);
    assert.doesNotMatch(helperSource, /legacyProjectWorkspaceId/);
  });
});
