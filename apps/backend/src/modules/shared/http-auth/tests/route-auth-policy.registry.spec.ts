import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { describe, it } from "node:test";

import {
  apiRouteAuthRegistrations,
  apiRouteAuthInventoryCoverage,
  criticalApiRouteAuthPolicyRegistry,
  RouteAuthPolicyRegistry,
  routeAuthPolicyNames,
} from "../route-auth-policy.registry.ts";

const serverSource = readFileSync(
  new URL("../../../../entrypoints/phone-auth-dev-server.ts", import.meta.url),
  "utf8",
);

interface SourceIfStatement {
  condition: string;
  bodyStart: number | null;
  offset: number;
}

function scanDelimited(source: string, start: number, open: string, close: string): number {
  let depth = 0;
  let quote: string | null = null;
  let escaped = false;
  for (let index = start; index < source.length; index += 1) {
    const character = source[index];
    if (quote) {
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === quote) quote = null;
      continue;
    }
    if (character === '"' || character === "'" || character === "`") {
      quote = character;
      continue;
    }
    if (character === open) depth += 1;
    if (character === close && --depth === 0) return index;
  }
  throw new Error(`unterminated_source_delimiter:${start}`);
}

function sourceIfStatements(source: string): SourceIfStatement[] {
  const statements: SourceIfStatement[] = [];
  let offset = source.indexOf("const httpServer = createServer");
  while ((offset = source.indexOf("if", offset)) >= 0) {
    if (/[A-Za-z0-9_$]/.test(source[offset - 1] ?? "") || /[A-Za-z0-9_$]/.test(source[offset + 2] ?? "")) {
      offset += 2;
      continue;
    }
    let conditionStart = offset + 2;
    while (/\s/.test(source[conditionStart] ?? "")) conditionStart += 1;
    if (source[conditionStart] !== "(") {
      offset += 2;
      continue;
    }
    const conditionEnd = scanDelimited(source, conditionStart, "(", ")");
    let bodyStart = conditionEnd + 1;
    while (/\s/.test(source[bodyStart] ?? "")) bodyStart += 1;
    statements.push({
      condition: source.slice(conditionStart + 1, conditionEnd),
      bodyStart: source[bodyStart] === "{" ? bodyStart : null,
      offset,
    });
    offset = conditionEnd + 1;
  }
  return statements;
}

const scannedIfStatements = sourceIfStatements(serverSource);

function directMethodPathSignatures(): string[] {
  const signatures = new Set<string>();
  for (const { condition } of scannedIfStatements) {
    const methods = [...condition.matchAll(/request\.method\s*===\s*"(DELETE|GET|PATCH|POST|PUT)"/g)]
      .map((match) => match[1]);
    const paths = [...condition.matchAll(/pathname\s*===\s*"(\/api\/[^"?#]*)"/g)]
      .map((match) => match[1]);
    for (const method of methods) {
      for (const path of paths) signatures.add(`${method} ${path}`);
    }
  }
  return [...signatures].sort();
}

function registrationSample(path: string): string {
  return path.replaceAll(/\{[A-Za-z][A-Za-z0-9_]*\}/g, "sample");
}

function registrationMatcher(path: string): RegExp {
  return new RegExp(`^${path
    .split("/")
    .map((segment) => /^\{[A-Za-z][A-Za-z0-9_]*\}$/.test(segment) ? "[^/]+" : segment.replace(/[.*+?^${}()|[\]\\]/g, "\\$&"))
    .join("/")}$`);
}

function dynamicPathMatchers(): Array<{ name: string; matcher: RegExp; offset: number }> {
  const declarations: Array<{ name: string; matcher: RegExp; offset: number }> = [];
  const declarationPattern = /const\s+(\w+Match)\s*=\s*pathname\.match\(\s*/g;
  for (const declaration of serverSource.matchAll(declarationPattern)) {
    const literalStart = (declaration.index ?? 0) + declaration[0].length;
    assert.equal(serverSource[literalStart], "/", declaration[1]);
    let escaped = false;
    let inCharacterClass = false;
    let literalEnd = literalStart + 1;
    for (; literalEnd < serverSource.length; literalEnd += 1) {
      const character = serverSource[literalEnd];
      if (escaped) escaped = false;
      else if (character === "\\") escaped = true;
      else if (character === "[") inCharacterClass = true;
      else if (character === "]") inCharacterClass = false;
      else if (character === "/" && !inCharacterClass) break;
    }
    let flagsEnd = literalEnd + 1;
    while (/[a-z]/i.test(serverSource[flagsEnd] ?? "")) flagsEnd += 1;
    declarations.push({
      name: declaration[1],
      matcher: new RegExp(
        serverSource.slice(literalStart + 1, literalEnd),
        serverSource.slice(literalEnd + 1, flagsEnd),
      ),
      offset: declaration.index ?? 0,
    });
  }
  return declarations;
}

describe("route auth policy registry", () => {
  it("exposes the complete policy vocabulary", () => {
    assert.deepEqual(routeAuthPolicyNames, [
      "public",
      "user",
      "user-or-admin",
      "optional-user",
      "admin",
      "optional-admin",
      "signed-webhook",
      "test-only",
      "deny",
    ]);
  });

  it("resolves a registered route by method and full pathname", () => {
    const resolution = criticalApiRouteAuthPolicyRegistry.resolve(
      "GET",
      "https://comic.example/api/auth/session?include=profile",
    );

    assert.equal(resolution?.policy, "user");
    assert.equal(resolution?.source, "registered");
    assert.equal(resolution?.registration?.id, "auth.session");
    assert.equal(resolution?.pathname, "/api/auth/session");
  });

  it("does not let another method inherit a pathname policy", () => {
    const resolution = criticalApiRouteAuthPolicyRegistry.resolve(
      "POST",
      "/api/auth/session",
    );

    assert.equal(resolution?.policy, "deny");
    assert.equal(resolution?.source, "api-default");
  });

  it("matches dynamic parameters as one complete path segment", () => {
    const resolution = criticalApiRouteAuthPolicyRegistry.resolve(
      "POST",
      "/api/payment-provider-callbacks/wechat%20pay",
    );

    assert.equal(resolution?.policy, "signed-webhook");
    assert.deepEqual(resolution?.params, { provider: "wechat pay" });
    assert.equal(
      criticalApiRouteAuthPolicyRegistry.resolve(
        "POST",
        "/api/payment-provider-callbacks/wechat/extra",
      )?.policy,
      "deny",
    );
  });

  it("classifies the verified authentication boundaries", () => {
    const examples = [
      ["POST", "/api/auth/password/login", "public"],
      ["POST", "/api/auth/team-member/password/login", "public"],
      ["GET", "/api/home-recommendations", "public"],
      ["GET", "/api/home-recommendations/background/media", "public"],
      ["GET", "/api/home-recommendations/videos/video-1/media", "public"],
      ["GET", "/api/home-recommendations/covers/cover-1/media", "public"],
      ["GET", "/api/public/style-covers/animation", "public"],
      ["PATCH", "/api/auth/profile", "user"],
      ["POST", "/api/auth/logout", "optional-user"],
      ["POST", "/api/admin/auth/login", "public"],
      ["GET", "/api/admin/auth/me", "admin"],
      ["POST", "/api/admin/auth/logout", "optional-admin"],
      ["GET", "/api/auth/dev/challenges/challenge-1", "test-only"],
      ["POST", "/api/billing/payment-callback/mock", "test-only"],
    ] as const;

    for (const [method, path, expectedPolicy] of examples) {
      assert.equal(
        criticalApiRouteAuthPolicyRegistry.resolve(method, path)?.policy,
        expectedPolicy,
        `${method} ${path}`,
      );
    }
  });

  it("registers every Canvas character library route as user-authenticated", () => {
    for (const [method, path] of [
      ["GET", "/api/canvas/canvas-1/characters"],
      ["POST", "/api/canvas/canvas-1/characters"],
      ["GET", "/api/canvas/canvas-1/characters/character-1"],
      ["PATCH", "/api/canvas/canvas-1/characters/character-1"],
      ["DELETE", "/api/canvas/canvas-1/characters/character-1"],
      ["POST", "/api/canvas/canvas-1/characters/character-1/copy"],
      ["POST", "/api/canvas/canvas-1/characters/character-1/references"],
      ["PATCH", "/api/canvas/canvas-1/characters/character-1/references/reference-1"],
      ["DELETE", "/api/canvas/canvas-1/characters/character-1/references/reference-1"],
    ] as const) {
      assert.equal(criticalApiRouteAuthPolicyRegistry.resolve(method, path)?.policy, "user", `${method} ${path}`);
    }
  });

  it("registers every GEO management route as admin-authenticated", () => {
    for (const [method, path] of [
      ["GET", "/api/admin/geo/platforms"],
      ["GET", "/api/admin/geo/questions"],
      ["POST", "/api/admin/geo/questions"],
      ["GET", "/api/admin/geo/evidence"],
      ["POST", "/api/admin/geo/evidence"],
      ["GET", "/api/admin/geo/content"],
      ["POST", "/api/admin/geo/content"],
      ["GET", "/api/admin/geo/content/content-1"],
      ["POST", "/api/admin/geo/generate"],
      ["POST", "/api/admin/geo/preview"],
      ["POST", "/api/admin/geo/assets/uploads"],
      ["POST", "/api/admin/geo/content/content-1/submit-review"],
      ["POST", "/api/admin/geo/content/content-1/publish"],
      ["POST", "/api/admin/geo/content/content-1/rollback"],
      ["POST", "/api/admin/geo/content/content-1/archive"],
      ["GET", "/api/admin/geo/settings"],
      ["PATCH", "/api/admin/geo/settings"],
    ] as const) {
      assert.equal(criticalApiRouteAuthPolicyRegistry.resolve(method, path)?.policy, "admin", `${method} ${path}`);
    }
  });

  it("keeps storage object content authentication route-owned for admin and user sessions", () => {
    assert.equal(
      criticalApiRouteAuthPolicyRegistry.resolve(
        "GET",
        "/api/storage/objects/00000000-0000-4000-8000-000000000001/content",
      )?.policy,
      "user-or-admin",
    );
  });

  it("registers formal and compatibility Canvas resource routes as user-authenticated", () => {
    for (const [method, path] of [
      ["GET", "/api/creator/canvases"],
      ["POST", "/api/creator/canvases"],
      ["GET", "/api/creator/canvases/canvas-1"],
      ["PATCH", "/api/creator/canvases/canvas-1"],
      ["DELETE", "/api/creator/canvases/canvas-1"],
      ["POST", "/api/creator/canvases/canvas-1/restore"],
      ["GET", "/api/creator/canvases/canvas-1/document"],
      ["PUT", "/api/creator/canvases/canvas-1/document"],
      ["GET", "/api/creator/canvases/canvas-1/revisions"],
      ["GET", "/api/creator/canvases/canvas-1/revisions/revision-1"],
      ["GET", "/api/creator/canvas-projects"],
      ["GET", "/api/creator/canvas-projects/canvas-1/canvas"],
    ] as const) {
      assert.equal(criticalApiRouteAuthPolicyRegistry.resolve(method, path)?.policy, "user", `${method} ${path}`);
    }
  });

  it("covers every explicit method and pathname declaration in the server entrypoint", () => {
    const signatures = directMethodPathSignatures();
    assert.equal(signatures.length, 219);

    const uncovered = signatures.filter((signature) => {
      const separator = signature.indexOf(" ");
      const method = signature.slice(0, separator);
      const path = signature.slice(separator + 1);
      return criticalApiRouteAuthPolicyRegistry.resolve(method, path)?.source !== "registered";
    });
    assert.deepEqual(uncovered, []);
  });

  it("covers every regex pathname matcher and each method handled by its branch", () => {
    const matchers = dynamicPathMatchers();
    assert.equal(matchers.length, 155);
    const uncovered: string[] = [];

    for (const declaration of matchers) {
      if (!declaration.matcher.source.startsWith("^\\/api\\/")) {
        continue;
      }
      const branch = scannedIfStatements.find(({ condition, offset }) =>
        offset > declaration.offset && new RegExp(`\\b${declaration.name}\\b`).test(condition)
      );
      assert.ok(branch, `missing branch for ${declaration.name}`);
      const conditionMethods = [...branch.condition.matchAll(
        /request\.method\s*[!=]==?\s*"(DELETE|GET|PATCH|POST|PUT)"/g,
      )];
      const branchBody = conditionMethods.length === 0 && branch.bodyStart !== null
        ? serverSource.slice(
            branch.bodyStart + 1,
            scanDelimited(serverSource, branch.bodyStart, "{", "}"),
          )
        : "";
      const methodSource = `${branch.condition}\n${branchBody}`;
      const methods = new Set(
        [...methodSource.matchAll(/request\.method\s*[!=]==?\s*"(DELETE|GET|PATCH|POST|PUT)"/g)]
          .map((match) => match[1]),
      );
      assert.ok(methods.size > 0, `missing methods for ${declaration.name}`);

      for (const method of methods) {
        const covered = apiRouteAuthRegistrations.some((registration) =>
          registration.method === method
          && declaration.matcher.test(registrationSample(registration.path))
        );
        if (!covered) uncovered.push(`${declaration.name}:${method}`);
      }
    }

    assert.deepEqual(uncovered, []);
  });

  it("keeps partial coverage while wide composite predicates remain non-equivalent", () => {
    const wideCompositePredicates = scannedIfStatements.filter(({ condition }) =>
      /request\.method\s*===/.test(condition)
      && condition.includes("/api/")
      && /pathname\.(?:startsWith|endsWith|includes)/.test(condition)
      && !condition.includes('!pathname.startsWith("/api/")')
    );

    assert.equal(wideCompositePredicates.length, 57);
    assert.deepEqual(apiRouteAuthInventoryCoverage, {
      explicitMethodPath: { discovered: 202, uncovered: 0 },
      regexDynamicMatchers: { discovered: 141, uncovered: 0 },
      wideCompositePredicates: { unresolved: 55 },
      conditionalQueryPolicies: { unresolved: 1 },
      coverage: "partial",
    });
    assert.equal(criticalApiRouteAuthPolicyRegistry.coverage, "partial");
  });

  it("keeps full inventory route shapes non-overlapping within each method", () => {
    const overlaps: string[] = [];
    for (let leftIndex = 0; leftIndex < apiRouteAuthRegistrations.length; leftIndex += 1) {
      const left = apiRouteAuthRegistrations[leftIndex];
      const leftMatcher = registrationMatcher(left.path);
      for (let rightIndex = leftIndex + 1; rightIndex < apiRouteAuthRegistrations.length; rightIndex += 1) {
        const right = apiRouteAuthRegistrations[rightIndex];
        if (left.method !== right.method) continue;
        const rightMatcher = registrationMatcher(right.path);
        if (leftMatcher.test(registrationSample(right.path)) || rightMatcher.test(registrationSample(left.path))) {
          overlaps.push(`${left.method} ${left.path} <-> ${right.path}`);
        }
      }
    }
    assert.deepEqual(overlaps, []);
  });

  it("defaults unknown API routes to deny without managing non-API paths", () => {
    const unknownApi = criticalApiRouteAuthPolicyRegistry.resolve("GET", "/api/not-registered");
    assert.equal(unknownApi?.policy, "deny");
    assert.equal(unknownApi?.source, "api-default");

    assert.equal(criticalApiRouteAuthPolicyRegistry.resolve("GET", "/app.html"), null);
    assert.equal(criticalApiRouteAuthPolicyRegistry.resolve("GET", "/uploads/example.png"), null);
  });

  it("marks the critical-route inventory as partial and blocks accidental enforcement", () => {
    assert.equal(criticalApiRouteAuthPolicyRegistry.coverage, "partial");
    assert.throws(
      () => criticalApiRouteAuthPolicyRegistry.assertEnforcementReady(),
      /route_auth_registry_coverage_incomplete/,
    );

    const completeRegistry = new RouteAuthPolicyRegistry([], { coverage: "complete" });
    assert.doesNotThrow(() => completeRegistry.assertEnforcementReady());
  });

  it("keeps malformed encoded parameters auditable without throwing", () => {
    const resolution = criticalApiRouteAuthPolicyRegistry.resolve(
      "GET",
      "/api/auth/dev/challenges/%E0%A4%A",
    );

    assert.equal(resolution?.policy, "test-only");
    assert.deepEqual(resolution?.params, { challengeId: "%E0%A4%A" });
  });

  it("rejects duplicate ids and ambiguous route shapes", () => {
    assert.throws(
      () => new RouteAuthPolicyRegistry([
        { id: "same", method: "GET", path: "/api/a", policy: "public" },
        { id: "same", method: "POST", path: "/api/b", policy: "user" },
      ]),
      /route_auth_registration_id_duplicate:same/,
    );

    assert.throws(
      () => new RouteAuthPolicyRegistry([
        { id: "first", method: "GET", path: "/api/projects/{projectId}", policy: "user" },
        { id: "second", method: "GET", path: "/api/projects/{id}", policy: "admin" },
      ]),
      /route_auth_registration_conflict:GET \/api\/projects\/\{\}/,
    );
  });

  it("rejects partial or malformed path parameters", () => {
    assert.throws(
      () => new RouteAuthPolicyRegistry([
        { id: "bad", method: "GET", path: "/api/projects/prefix-{id}", policy: "user" },
      ]),
      /route_auth_registration_parameter_invalid/,
    );
  });
});
