import { spawnSync } from "node:child_process";
import { chmodSync, existsSync } from "node:fs";

if (!existsSync("src") || !existsSync("test")) {
  if (!existsSync("dist/index.js") || !existsSync("dist/cli.js")) {
    throw new Error("Published package is missing compiled entry points");
  }
  if (process.platform !== "win32") chmodSync("dist/cli.js", 0o755);
  process.exit(0);
}

const npm = process.platform === "win32" ? "npm.cmd" : "npm";
for (const script of ["clean", "check", "test", "build"]) {
  const result = spawnSync(npm, ["run", script, "--silent"], {
    shell: false,
    stdio: ["ignore", "ignore", "inherit"],
  });
  if (result.error) throw result.error;
  if (result.status !== 0) process.exit(result.status ?? 1);
}

if (process.platform !== "win32") chmodSync("dist/cli.js", 0o755);
