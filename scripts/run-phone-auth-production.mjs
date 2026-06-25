import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";
import { join } from "node:path";

const runtime = findNodeRuntime(18);
const serverEntrypoint = join(
  process.cwd(),
  "apps",
  "backend",
  "src",
  "entrypoints",
  "phone-auth-dev-server.ts",
);
const envFilePath = join(process.cwd(), ".env");

if (!existsSync(serverEntrypoint)) {
  console.error(`Unable to find production server entrypoint at ${serverEntrypoint}`);
  process.exit(1);
}

loadDotEnvFile(envFilePath);
process.env.NODE_ENV = "production";

const listenHost = (process.env.HOST ?? "0.0.0.0").trim() || "0.0.0.0";
const publicHost = (process.env.PUBLIC_HOST ?? listenHost).trim() || listenHost;

const result = spawnSync(
  runtime,
  [
    ...resolveTsxRuntimeArgs(runtime),
    "--input-type=module",
    "--eval",
    `import(${JSON.stringify(pathToFileUrl(serverEntrypoint))}).then(async ({ createPhoneAuthDevServer }) => {
      const server = createPhoneAuthDevServer({
        allowProduction: true,
        allowLocalDatabaseUrl: true,
        listenHost: ${JSON.stringify(listenHost)},
        seedTeamEntitlements: false,
      });
      const port = Number(process.env.PORT ?? "4310");
      await server.listen(port);
      console.log("Phone auth production server listening on http://${publicHost}:" + port);
      setInterval(() => {}, 1000);
    }).catch((error) => {
      console.error(error);
      process.exit(1);
    });`,
  ],
  {
    env: process.env,
    stdio: "inherit",
  },
);

process.exit(result.status ?? 1);

function pathToFileUrl(filePath) {
  return `file:///${filePath.replace(/\\/g, "/")}`;
}

function findNodeRuntime(minMajor) {
  const candidates = [];
  const seen = new Set();

  addCandidate(process.execPath);

  const nodeLocator = process.platform === "win32" ? "where.exe" : "which";
  const whereNode = spawnSync(nodeLocator, ["node"], {
    encoding: "utf8",
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

function resolveTsxRuntimeArgs(runtimePath) {
  const version = spawnSync(runtimePath, ["--version"], {
    encoding: "utf8",
  });

  if (version.status !== 0) {
    return ["--loader", "tsx"];
  }

  const match = version.stdout.trim().match(/^v(\d+)\.(\d+)\.(\d+)/);
  if (!match) {
    return ["--loader", "tsx"];
  }

  const major = Number(match[1]);
  const minor = Number(match[2]);
  if (major > 18 || (major === 18 && minor >= 19)) {
    return ["--import", "tsx"];
  }

  return ["--loader", "tsx"];
}

function loadDotEnvFile(targetEnvFilePath) {
  if (!existsSync(targetEnvFilePath)) {
    return;
  }

  const content = readFileSync(targetEnvFilePath, "utf8");
  for (const rawLine of content.split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) {
      continue;
    }

    const separatorIndex = line.indexOf("=");
    if (separatorIndex <= 0) {
      continue;
    }

    const key = line.slice(0, separatorIndex).trim();
    if (!key || process.env[key] !== undefined) {
      continue;
    }

    let value = line.slice(separatorIndex + 1).trim();
    if (
      (value.startsWith("\"") && value.endsWith("\"")) ||
      (value.startsWith("'") && value.endsWith("'"))
    ) {
      value = value.slice(1, -1);
    }

    process.env[key] = value;
  }
}
