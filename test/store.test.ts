import assert from "node:assert/strict";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import test from "node:test";
import {
  ConflictError,
  FileSystemStore,
  StoreLockedError,
  type TaskDossier,
  type PinnedRoute,
  type WorkflowModuleRelease,
} from "../src/index.js";

async function temporaryStore(): Promise<{ path: string; store: FileSystemStore }> {
  const path = join(tmpdir(), `atlasrepo-core-test-${crypto.randomUUID()}`);
  return { path, store: new FileSystemStore(path) };
}

async function fixture<T>(name: string): Promise<T> {
  return JSON.parse(
    await readFile(join(import.meta.dirname, "..", "fixtures", name), "utf8"),
  ) as T;
}

test("dossier writes use optimistic revisions", async (t) => {
  const { path, store } = await temporaryStore();
  t.after(() => rm(path, { recursive: true, force: true }));
  const dossier = await fixture<TaskDossier>("task-dossier.valid.json");
  await store.put("task-dossier", dossier, 0);
  const next = { ...dossier, revision: 2, updatedAt: "2026-09-05T00:01:00.000Z" };
  await assert.rejects(store.put("task-dossier", next, 0), ConflictError);
  await store.put("task-dossier", next, 1);
  assert.equal((await store.get("task-dossier", dossier.id) as TaskDossier).revision, 2);
  assert.deepEqual((await store.history(dossier.id)).map((item) => item.revision), [1, 2]);
});

test("pinned routes are idempotent but immutable", async (t) => {
  const { path, store } = await temporaryStore();
  t.after(() => rm(path, { recursive: true, force: true }));
  const route = await fixture<PinnedRoute>("route.valid.json");
  await store.put("route", route);
  await store.put("route", route);
  await assert.rejects(
    store.put("route", { ...route, title: "Changed route" }),
    /route .* is immutable/,
  );
});

test("dossier creation time cannot be rewritten", async (t) => {
  const { path, store } = await temporaryStore();
  t.after(() => rm(path, { recursive: true, force: true }));
  const dossier = await fixture<TaskDossier>("task-dossier.valid.json");
  await store.put("task-dossier", dossier, 0);
  await assert.rejects(
    store.put(
      "task-dossier",
      {
        ...dossier,
        revision: 2,
        createdAt: "2026-09-05T00:01:00.000Z",
        updatedAt: "2026-09-05T00:01:00.000Z",
      },
      1,
    ),
    /createdAt is immutable/,
  );
});

test("workflow releases cannot be changed after storage", async (t) => {
  const { path, store } = await temporaryStore();
  t.after(() => rm(path, { recursive: true, force: true }));
  const release = await fixture<WorkflowModuleRelease>("workflow-module-release.valid.json");
  await store.put("workflow-module-release", release);
  await store.put("workflow-module-release", release);
  await assert.rejects(
    store.put("workflow-module-release", { ...release, title: "Changed title" }),
    ConflictError,
  );
});

test("an active lock fails closed", async (t) => {
  const { path, store } = await temporaryStore();
  t.after(() => rm(path, { recursive: true, force: true }));
  const dossier = await fixture<TaskDossier>("task-dossier.valid.json");
  const lockDir = join(path, ".locks", "task-dossier");
  await mkdir(lockDir, { recursive: true });
  await writeFile(join(lockDir, `${dossier.id}.lock`), "held");
  await assert.rejects(store.put("task-dossier", dossier, 0), StoreLockedError);
});
