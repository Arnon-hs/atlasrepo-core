import { createHash } from "node:crypto";
import { open, realpath } from "node:fs/promises";
import { isAbsolute, relative, resolve } from "node:path";
import type { WorkflowModuleReleaseV02 } from "./types.js";
import { assertValidDocument } from "./validate.js";

export interface MaterialVerification {
  id: string;
  status: "verified" | "external";
  digest: string;
  bytes?: number;
}

export interface MaterialVerificationLimits {
  maxBytesPerMaterial?: number;
  maxTotalBytes?: number;
}

const defaultMaxBytesPerMaterial = 64 * 1024 * 1024;
const defaultMaxTotalBytes = 256 * 1024 * 1024;

function positiveInteger(value: number, name: string): number {
  if (!Number.isSafeInteger(value) || value <= 0) {
    throw new Error(`${name} must be a positive safe integer`);
  }
  return value;
}

function containedBy(root: string, target: string): boolean {
  const path = relative(root, target);
  return path === "" || (!path.startsWith("..") && !isAbsolute(path));
}

export async function verifyWorkflowMaterials(
  release: WorkflowModuleReleaseV02,
  bundleRoot: string,
  limits: MaterialVerificationLimits = {},
): Promise<MaterialVerification[]> {
  assertValidDocument("workflow-module-release", release);
  const maxBytesPerMaterial = positiveInteger(
    limits.maxBytesPerMaterial ?? defaultMaxBytesPerMaterial,
    "maxBytesPerMaterial",
  );
  const maxTotalBytes = positiveInteger(
    limits.maxTotalBytes ?? defaultMaxTotalBytes,
    "maxTotalBytes",
  );
  const root = await realpath(resolve(bundleRoot));
  const results: MaterialVerification[] = [];
  let totalBytes = 0;

  for (const material of release.materials) {
    if (!material.bundlePath) {
      results.push({ id: material.id, status: "external", digest: material.digest });
      continue;
    }

    const target = await realpath(resolve(root, material.bundlePath));
    if (!containedBy(root, target)) {
      throw new Error(`Material ${material.id} resolves outside the bundle root`);
    }

    const handle = await open(target, "r");
    try {
      const metadata = await handle.stat();
      if (!metadata.isFile()) throw new Error(`Material ${material.id} is not a regular file`);
      if (metadata.size > maxBytesPerMaterial) {
        throw new Error(`Material ${material.id} exceeds maxBytesPerMaterial`);
      }
      if (totalBytes + metadata.size > maxTotalBytes) {
        throw new Error("Workflow materials exceed maxTotalBytes");
      }

      const hash = createHash("sha256");
      let bytes = 0;
      for await (const chunk of handle.createReadStream({ autoClose: false })) {
        const buffer = Buffer.isBuffer(chunk) ? chunk : Buffer.from(chunk);
        bytes += buffer.byteLength;
        if (bytes > maxBytesPerMaterial || totalBytes + bytes > maxTotalBytes) {
          throw new Error(`Material ${material.id} exceeds verification byte limits`);
        }
        hash.update(buffer);
      }
      const digest = `sha256:${hash.digest("hex")}`;
      if (digest !== material.digest) {
        throw new Error(
          `Material ${material.id} digest mismatch: expected ${material.digest}, received ${digest}`,
        );
      }
      totalBytes += bytes;
      results.push({ id: material.id, status: "verified", digest, bytes });
    } finally {
      await handle.close();
    }
  }
  return results;
}
