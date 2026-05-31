import { mkdir, writeFile } from "node:fs/promises";
import { resolve, join } from "node:path";

import { renderLibraryTeam } from "../apps/web/src/features/library-team/index.js";

const artifactDir = resolve(process.cwd(), "artifacts", "library-team-qa");
await mkdir(artifactDir, { recursive: true });

const routes = [
  { id: "assets-personal", html: renderLibraryTeam({ route: "assets", assetScope: "personal" }) },
  { id: "assets-official", html: renderLibraryTeam({ route: "assets", assetScope: "official" }) },
  { id: "assets-team", html: renderLibraryTeam({ route: "assets", assetScope: "team" }) },
  { id: "team", html: renderLibraryTeam({ route: "team" }) },
  { id: "team-dashboard", html: renderLibraryTeam({ route: "team-dashboard" }) },
];

const report = {
  generatedAt: new Date().toISOString(),
  routes: routes.map((route) => {
    const html = route.html;
    return {
      id: route.id,
      length: html.length,
      hasLibraryShell: html.includes("library-team-page"),
      hasDialogSupport:
        html.includes('data-action="open-pricing"') || html.includes('data-action="open-member-rules"'),
      hasPlaceholderGate: html.includes('data-action="show-library-placeholder"'),
    };
  }),
};

await writeFile(
  join(artifactDir, "library-team-browser-qa-report.json"),
  `${JSON.stringify(report, null, 2)}\n`,
  "utf8",
);

console.log(JSON.stringify(report, null, 2));
