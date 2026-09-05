import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  composeDecisionPack,
  ConflictError,
  FileSystemStore,
  replay,
  sha256Digest,
  type ReplayEvent,
  type TaskDossier,
  type TaskDossierV02,
} from "../src/index.js";
import { clone, validComposition } from "./v02-fixtures.js";

function temporaryPath(label: string): string {
  return join(tmpdir(), `atlasrepo-core-v02-${label}-${crypto.randomUUID()}`);
}

test("v0.2 dossier revisions are stored and replayed with immutable artifacts", async (t) => {
  const directPath = temporaryPath("direct");
  const replayPath = temporaryPath("replay");
  t.after(() => Promise.all([
    rm(directPath, { recursive: true, force: true }),
    rm(replayPath, { recursive: true, force: true }),
  ]));

  const input = validComposition();
  const pack = composeDecisionPack(input);
  const updatedDossier: TaskDossierV02 = {
    ...clone(input.dossier),
    revision: 2,
    updatedAt: "2026-09-05T00:30:00.000Z",
    actions: [
      {
        ...input.dossier.actions[0]!,
        status: "completed",
        resultEvidenceIds: ["dossier-evidence"],
      },
    ],
  };
  const events: ReplayEvent[] = [
    {
      sequence: 1,
      operation: "put",
      kind: "task-dossier",
      expectedRevision: 0,
      document: input.dossier,
    },
    {
      sequence: 2,
      operation: "put",
      kind: "task-dossier",
      expectedRevision: 1,
      document: updatedDossier,
    },
    {
      sequence: 3,
      operation: "put",
      kind: "workflow-module-release",
      document: input.modules[0]!,
    },
    {
      sequence: 4,
      operation: "put",
      kind: "route",
      document: input.route,
    },
    {
      sequence: 5,
      operation: "put",
      kind: "decision-pack",
      document: pack,
    },
  ];

  const direct = await replay(events, new FileSystemStore(directPath));
  const replayed = await replay(clone(events), new FileSystemStore(replayPath));
  assert.equal(direct.applied, 5);
  assert.equal(direct.digest, replayed.digest);

  const store = new FileSystemStore(directPath);
  assert.deepEqual(
    (await store.history(input.dossier.id)).map(({ revision }) => revision),
    [1, 2],
  );
  assert.deepEqual(await store.get("decision-pack", pack.id), pack);
  assert.match(await store.snapshotDigest(), /^sha256:[a-f0-9]{64}$/);
});

test("v0.2 workflow releases are idempotent and immutable", async (t) => {
  const path = temporaryPath("release");
  t.after(() => rm(path, { recursive: true, force: true }));
  const store = new FileSystemStore(path);
  const release = validComposition().modules[0]!;

  await store.put("workflow-module-release", release);
  await store.put("workflow-module-release", clone(release));
  await assert.rejects(
    store.put("workflow-module-release", { ...release, title: "Changed release" }),
    ConflictError,
  );
});

test("decision packs are idempotent and immutable", async (t) => {
  const path = temporaryPath("decision-pack");
  t.after(() => rm(path, { recursive: true, force: true }));
  const store = new FileSystemStore(path);
  const pack = composeDecisionPack(validComposition());

  await store.put("decision-pack", pack);
  await store.put("decision-pack", clone(pack));
  await assert.rejects(
    store.put("decision-pack", { ...pack, answer: "Changed answer" }),
    ConflictError,
  );
  assert.equal(sha256Digest(await store.get("decision-pack", pack.id)), sha256Digest(pack));
});

test("a dossier cannot downgrade from v0.2 to v0.1", async (t) => {
  const path = temporaryPath("downgrade");
  t.after(() => rm(path, { recursive: true, force: true }));
  const store = new FileSystemStore(path);
  const current = validComposition().dossier;
  await store.put("task-dossier", current, 0);

  const legacy = JSON.parse(
    await readFile(join(import.meta.dirname, "..", "fixtures", "task-dossier.valid.json"), "utf8"),
  ) as TaskDossier;
  legacy.id = current.id;
  legacy.revision = 2;
  legacy.createdAt = current.createdAt;
  legacy.updatedAt = "2026-09-05T00:30:00.000Z";

  await assert.rejects(
    store.put("task-dossier", legacy, 1),
    /schemaVersion cannot move backwards/,
  );
});
