import { createHash } from "node:crypto";
import { spawnSync } from "node:child_process";
import { mkdir, mkdtemp, readFile, readdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const repositoryRoot = resolve(dirname(fileURLToPath(import.meta.url)), "..");
const npm = process.platform === "win32" ? "npm.cmd" : "npm";
const temporaryParent = process.env.RUNNER_TEMP ?? tmpdir();

const expectedRuntimeFiles = new Map([
  [
    "ajv",
    { version: "8.20.0", entry: "dist/ajv.js", license: "MIT", licenseFile: "LICENSE" },
  ],
  [
    "ajv-formats",
    { version: "3.0.1", entry: "dist/index.js", license: "MIT", licenseFile: "LICENSE" },
  ],
  [
    "fast-deep-equal",
    { version: "3.1.3", entry: "index.js", license: "MIT", licenseFile: "LICENSE" },
  ],
  [
    "fast-uri",
    {
      version: "3.1.7",
      entry: "index.js",
      license: "BSD-3-Clause",
      licenseFile: "LICENSE",
    },
  ],
  [
    "json-schema-traverse",
    { version: "1.0.0", entry: "index.js", license: "MIT", licenseFile: "LICENSE" },
  ],
  [
    "require-from-string",
    { version: "2.0.2", entry: "index.js", license: "MIT", licenseFile: "license" },
  ],
]);

function run(command, args, cwd = repositoryRoot) {
  const result = spawnSync(command, args, {
    cwd,
    shell: false,
    encoding: "utf8",
    maxBuffer: 10 * 1024 * 1024,
  });
  if (result.error) throw result.error;
  if (result.status !== 0) {
    throw new Error(
      `${command} ${args.join(" ")} failed with status ${result.status}\n${result.stderr}`,
    );
  }
  return result.stdout;
}

function sha256(bytes) {
  return createHash("sha256").update(bytes).digest("hex");
}

async function pack(destination, cwd = repositoryRoot) {
  const output = run(npm, ["pack", "--json", "--pack-destination", destination], cwd);
  const result = JSON.parse(output);
  if (!Array.isArray(result) || result.length !== 1) {
    throw new Error("npm pack must return exactly one package result");
  }
  return result[0];
}

async function assertSameBytes(left, right, label) {
  const [leftBytes, rightBytes] = await Promise.all([readFile(left), readFile(right)]);
  if (!leftBytes.equals(rightBytes)) throw new Error(`${label} bytes differ`);
}

const temporaryRoot = await mkdtemp(join(temporaryParent, "atlasrepo-core-package-verify-"));
try {
  const firstRoot = join(temporaryRoot, "pack-one");
  const secondRoot = join(temporaryRoot, "pack-two");
  const installRoot = join(temporaryRoot, "install");
  const cacheRoot = join(temporaryRoot, "empty-cache");
  const repackRoot = join(temporaryRoot, "repacked");
  const storeRoot = join(temporaryRoot, "store");
  await Promise.all(
    [firstRoot, secondRoot, installRoot, cacheRoot, repackRoot].map((path) =>
      mkdir(path, { recursive: true }),
    ),
  );

  const first = await pack(firstRoot);
  const second = await pack(secondRoot);
  if (first.filename !== second.filename) throw new Error("Repeated pack filenames differ");
  const firstTarball = join(firstRoot, first.filename);
  const secondTarball = join(secondRoot, second.filename);
  await assertSameBytes(firstTarball, secondTarball, "Repeated package");

  const bundled = [...(first.bundled ?? [])].sort();
  const expectedBundled = [...expectedRuntimeFiles.keys()].sort();
  if (JSON.stringify(bundled) !== JSON.stringify(expectedBundled)) {
    throw new Error(
      `Bundled dependency closure mismatch: expected ${expectedBundled.join(", ")}; got ${bundled.join(", ")}`,
    );
  }

  await writeFile(
    join(installRoot, "package.json"),
    `${JSON.stringify({ name: "atlasrepo-core-offline-smoke", private: true }, null, 2)}\n`,
    "utf8",
  );
  if ((await readdir(cacheRoot)).length !== 0) throw new Error("npm cache is not empty");
  run(
    npm,
    [
      "install",
      "--offline",
      "--ignore-scripts",
      "--no-audit",
      "--no-fund",
      "--package-lock=false",
      "--registry=http://127.0.0.1:9/",
      "--cache",
      cacheRoot,
      firstTarball,
    ],
    installRoot,
  );

  const installedPackageRoot = join(installRoot, "node_modules", "@atlasrepo", "core");
  const installedManifest = JSON.parse(
    await readFile(join(installedPackageRoot, "package.json"), "utf8"),
  );
  if (installedManifest.version !== "0.2.1") {
    throw new Error(`Installed package version is ${installedManifest.version}, expected 0.2.1`);
  }

  for (const [name, expected] of expectedRuntimeFiles) {
    const sourceRoot = join(repositoryRoot, "node_modules", name);
    const installedRoot = join(installedPackageRoot, "node_modules", name);
    const installedDependency = JSON.parse(
      await readFile(join(installedRoot, "package.json"), "utf8"),
    );
    if (installedDependency.version !== expected.version) {
      throw new Error(
        `${name} version is ${installedDependency.version}, expected ${expected.version}`,
      );
    }
    if (installedDependency.license !== expected.license) {
      throw new Error(
        `${name} license is ${installedDependency.license}, expected ${expected.license}`,
      );
    }
    await assertSameBytes(
      join(sourceRoot, "package.json"),
      join(installedRoot, "package.json"),
      `${name} package manifest`,
    );
    await assertSameBytes(
      join(sourceRoot, expected.entry),
      join(installedRoot, expected.entry),
      `${name} runtime entry`,
    );
    await assertSameBytes(
      join(sourceRoot, expected.licenseFile),
      join(installedRoot, expected.licenseFile),
      `${name} license text`,
    );
  }

  const dossierFixture = join(
    installedPackageRoot,
    "examples",
    "dify",
    "task-dossier.v0.2.json",
  );
  const importSmoke = [
    "import { createRequire } from 'node:module';",
    "import { readFile } from 'node:fs/promises';",
    "import { assertValidDocument } from '@atlasrepo/core';",
    "const require = createRequire(import.meta.url);",
    "const schemaPath = require.resolve('@atlasrepo/core/schemas/task-dossier.v0.2.schema.json');",
    "const schema = JSON.parse(await readFile(schemaPath, 'utf8'));",
    "if (schema.properties?.schemaVersion?.const !== 'atlasrepo.core/task-dossier/v0.2') process.exit(1);",
    `const fixture = JSON.parse(await readFile(${JSON.stringify(dossierFixture)}, 'utf8'));`,
    "assertValidDocument('task-dossier', fixture);",
  ].join("\n");
  run(process.execPath, ["--input-type=module", "--eval", importSmoke], installRoot);

  const cli = join(installedPackageRoot, "dist", "cli.js");
  const moduleFixture = join(
    installedPackageRoot,
    "examples",
    "dify",
    "workflow-module-release.v0.2.json",
  );
  const exportedModule = join(temporaryRoot, "exported-workflow-module.json");
  run(
    process.execPath,
    [cli, "import", "workflow-module-release", moduleFixture, "--store", storeRoot],
    installRoot,
  );
  run(
    process.execPath,
    [
      cli,
      "export",
      "workflow-module-release",
      "assess-self-hosted-dify@0.2.0",
      "--store",
      storeRoot,
      "--out",
      exportedModule,
    ],
    installRoot,
  );
  const [sourceModule, storedModule] = await Promise.all([
    readFile(moduleFixture, "utf8").then(JSON.parse),
    readFile(exportedModule, "utf8").then(JSON.parse),
  ]);
  if (JSON.stringify(sourceModule) !== JSON.stringify(storedModule)) {
    throw new Error("CLI import changed the v0.2 module");
  }

  const repacked = await pack(repackRoot, installedPackageRoot);
  if (repacked.filename !== first.filename) throw new Error("Installed repack filename differs");
  await assertSameBytes(
    firstTarball,
    join(repackRoot, repacked.filename),
    "Installed package repack",
  );

  const tarballBytes = await readFile(firstTarball);
  process.stdout.write(
    `${JSON.stringify({
      ok: true,
      filename: first.filename,
      bytes: tarballBytes.length,
      sha256: sha256(tarballBytes),
      bundled: expectedBundled,
      offlineInstall: true,
      libraryAndSchemaImport: true,
      cliImport: true,
      licensesVerified: true,
      reproduciblePack: true,
      installedRepack: true,
    })}\n`,
  );
} finally {
  await rm(temporaryRoot, { recursive: true, force: true });
}
