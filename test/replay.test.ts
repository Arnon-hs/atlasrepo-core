import assert from "node:assert/strict";
import { readFile, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  FileSystemStore,
  replay,
  type ReplayEvent,
  type TaskDossier,
} from "../src/index.js";

async function dossier(): Promise<TaskDossier> {
  return JSON.parse(
    await readFile(join(import.meta.dirname, "..", "fixtures", "task-dossier.valid.json"), "utf8"),
  ) as TaskDossier;
}

test("the same event stream produces the same snapshot digest", async (t) => {
  const firstPath = join(tmpdir(), `atlasrepo-core-replay-a-${crypto.randomUUID()}`);
  const secondPath = join(tmpdir(), `atlasrepo-core-replay-b-${crypto.randomUUID()}`);
  t.after(() => Promise.all([
    rm(firstPath, { recursive: true, force: true }),
    rm(secondPath, { recursive: true, force: true }),
  ]));
  const initial = await dossier();
  const updated: TaskDossier = {
    ...initial,
    revision: 2,
    updatedAt: "2026-09-05T00:01:00.000Z",
    actions: [{ ...initial.actions[0]!, status: "completed" }],
  };
  const events: ReplayEvent[] = [
    { sequence: 1, operation: "put", kind: "task-dossier", expectedRevision: 0, document: initial },
    { sequence: 2, operation: "put", kind: "task-dossier", expectedRevision: 1, document: updated },
  ];
  const first = await replay(events, new FileSystemStore(firstPath));
  const second = await replay(events, new FileSystemStore(secondPath));
  assert.equal(first.applied, 2);
  assert.equal(first.digest, second.digest);
  assert.match(first.digest, /^sha256:[a-f0-9]{64}$/);
});

test("replay rejects sequence gaps before applying the invalid event", async (t) => {
  const path = join(tmpdir(), `atlasrepo-core-replay-sequence-${crypto.randomUUID()}`);
  t.after(() => rm(path, { recursive: true, force: true }));
  const event: ReplayEvent = {
    sequence: 2,
    operation: "put",
    kind: "task-dossier",
    document: await dossier(),
  };
  await assert.rejects(replay([event], new FileSystemStore(path)), /sequence must be 1/);
});

