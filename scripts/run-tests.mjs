import { spawnSync } from "node:child_process";
import { existsSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";

const ignoredDirectories = new Set([
  "dist",
  "node_modules",
]);

const args = process.argv.slice(2);
const targets = args.length > 0 ? args : ["."];
const testFiles = targets.flatMap((target) => expandTarget(target));
const hasTypeScriptTests = testFiles.some((file) => file.endsWith(".ts"));

if (testFiles.length === 0) {
  console.error(`No test files found for: ${targets.join(", ")}`);
  process.exit(1);
}

const command = resolveTestCommand(testFiles, hasTypeScriptTests);
const result = spawnSync(command.runtime, command.args, {
  stdio: "inherit",
});

process.exit(result.status ?? 1);

function expandTarget(target) {
  const stats = statSync(target);

  if (stats.isDirectory()) {
    return collectTests(target);
  }

  return [target];
}

function collectTests(directory) {
  const files = [];

  for (const entry of readdirSync(directory)) {
    const fullPath = join(directory, entry);
    const stats = statSync(fullPath);

    if (stats.isDirectory()) {
      if (entry.startsWith(".") || ignoredDirectories.has(entry)) {
        continue;
      }

      files.push(...collectTests(fullPath));
      continue;
    }

    if (/\.(spec|test)\.ts$/.test(entry)) {
      files.push(fullPath);
    }
  }

  return files.sort();
}

function resolveTestCommand(testFiles, hasTypeScriptTests) {
  const runtime = findNodeRuntime(18);

  if (hasTypeScriptTests) {
    const tsxEntrypoint = join(process.cwd(), "node_modules", "tsx", "dist", "cli.mjs");

    if (!existsSync(tsxEntrypoint)) {
      console.error("Unable to find tsx runtime at node_modules/tsx/dist/cli.mjs");
      process.exit(1);
    }

    return {
      runtime,
      args: [tsxEntrypoint, "--test", ...testFiles],
    };
  }

  return {
    runtime,
    args: ["--test", ...testFiles],
  };
}

function findNodeRuntime(minMajor) {
  const candidates = [];
  const seen = new Set();

  addCandidate(process.execPath);

  const whereNode = spawnSync("where", ["node"], {
    encoding: "utf8",
    shell: process.platform === "win32",
  });

  if (whereNode.status === 0) {
    for (const line of whereNode.stdout.split(/\r?\n/)) {
      addCandidate(line.trim());
    }
  }

  for (const candidate of candidates) {
    const version = spawnSync(candidate, ["--version"], {
      encoding: "utf8",
    });

    if (version.status !== 0) {
      continue;
    }

    const match = version.stdout.trim().match(/^v(\d+)\./);
    if (match && Number(match[1]) >= minMajor) {
      return candidate;
    }
  }

  console.error(`Unable to find a Node.js runtime >= ${minMajor}.`);
  process.exit(1);

  function addCandidate(candidate) {
    if (!candidate || seen.has(candidate)) {
      return;
    }
    seen.add(candidate);
    candidates.push(candidate);
  }
}
