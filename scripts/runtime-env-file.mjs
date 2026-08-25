import { join } from "node:path";

export function runtimeEnvFilePath(cwd = process.cwd(), options = {}) {
  const production = options.production ?? process.env.NODE_ENV === "production";
  return join(cwd, production ? ".env" : ".env.local");
}
