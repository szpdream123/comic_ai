#!/usr/bin/env node

import { readFileSync, readdirSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";

// Build the markers from fragments so this gate does not report its own source.
const TARGETS = [
  ["organization", "_id"].join(""),
  ["organization", "Id"].join(""),
  ["workspace", "_id"].join(""),
  ["workspace", "Id"].join(""),
];
const TARGET_PATTERN = new RegExp(`\\b(?:${TARGETS.join("|")})\\b`, "g");
const IGNORED_DIRECTORIES = new Set([".git", "node_modules"]);

export function scanRoot(rootDirectory) {
  const root = resolve(rootDirectory);
  const findings = [];
  walk(root, root, findings);
  return findings;
}

function walk(root, directory, findings) {
  for (const entry of readdirSync(directory, { withFileTypes: true }).sort((a, b) => a.name.localeCompare(b.name))) {
    if (entry.isDirectory()) {
      if (IGNORED_DIRECTORIES.has(entry.name)) continue;
      walk(root, join(directory, entry.name), findings);
      continue;
    }
    if (!entry.isFile()) continue;

    const filePath = join(directory, entry.name);
    const content = readFileSync(filePath);
    if (content.includes(0)) continue;
    const text = content.toString("utf8");
    const lines = text.split(/\r?\n/);
    for (let lineNumber = 0; lineNumber < lines.length; lineNumber += 1) {
      TARGET_PATTERN.lastIndex = 0;
      let match;
      while ((match = TARGET_PATTERN.exec(lines[lineNumber])) !== null) {
        findings.push({
          file: relative(root, filePath).replaceAll("\\", "/"),
          line: lineNumber + 1,
          column: match.index + 1,
          token: match[0],
        });
      }
    }
  }
}

function parseArgs(argv) {
  let root = process.cwd();
  let json = false;
  for (let index = 0; index < argv.length; index += 1) {
    const argument = argv[index];
    if (argument === "--json") {
      json = true;
      continue;
    }
    if (argument === "--root") {
      root = argv[index + 1];
      index += 1;
      continue;
    }
    throw new Error(`unknown_argument:${argument}`);
  }
  return { root, json };
}

export function main(argv = process.argv.slice(2)) {
  const { root, json } = parseArgs(argv);
  const findings = scanRoot(root);
  if (json) {
    process.stdout.write(`${JSON.stringify({ root: resolve(root), findings }, null, 2)}\n`);
  } else if (findings.length > 0) {
    const preview = findings.slice(0, 200);
    for (const finding of preview) {
      process.stdout.write(`${finding.file}:${finding.line}:${finding.column} ${finding.token}\n`);
    }
    if (findings.length > preview.length) {
      process.stdout.write(`... ${findings.length - preview.length} more findings\n`);
    }
  }
  if (findings.length > 0) {
    process.stderr.write(`user_scope_zero_reference_gate_failed:${findings.length}\n`);
    return 1;
  }
  process.stdout.write("user_scope_zero_reference_gate_passed\n");
  return 0;
}

if (process.argv[1] && fileURLToPath(import.meta.url) === resolve(process.argv[1])) {
  process.exitCode = main();
}
