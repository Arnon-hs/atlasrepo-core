import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { validateDocument, verifyWorkflowMaterials } from "../src/index.js";
import { validWorkflowV02 } from "./v02-fixtures.js";

test("local workflow materials are verified against their raw-byte digest", async (context) => {
  const root = await mkdtemp(join(tmpdir(), "atlasrepo-core-materials-"));
  context.after(async () => rm(root, { recursive: true, force: true }));
  await mkdir(join(root, "materials"));
  const bytes = Buffer.from("pinned guide\n", "utf8");
  await writeFile(join(root, "materials", "dify-guide.md"), bytes);

  const workflow = validWorkflowV02();
  workflow.materials[0]!.digest =
    `sha256:${createHash("sha256").update(bytes).digest("hex")}`;

  assert.deepEqual(await verifyWorkflowMaterials(workflow, root), [
    {
      id: "dify-guide",
      status: "verified",
      digest: workflow.materials[0]!.digest,
      bytes: bytes.byteLength,
    },
  ]);

  await assert.rejects(
    () => verifyWorkflowMaterials(workflow, root, { maxBytesPerMaterial: 1 }),
    /exceeds maxBytesPerMaterial/,
  );

  workflow.materials[0]!.digest = `sha256:${"f".repeat(64)}`;
  await assert.rejects(
    () => verifyWorkflowMaterials(workflow, root),
    /Material dify-guide digest mismatch/,
  );
});

test("workflow material paths cannot escape the bundle", () => {
  const workflow = validWorkflowV02();
  workflow.materials[0]!.bundlePath = "../private.txt";
  const result = validateDocument("workflow-module-release", workflow);
  assert.equal(result.ok, false);
  if (!result.ok) {
    assert.match(
      result.issues.map(({ path, message }) => `${path} ${message}`).join("; "),
      /must be a relative path contained by the bundle/,
    );
  }
});
