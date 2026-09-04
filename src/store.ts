import {
  mkdir,
  open,
  readFile,
  readdir,
  rename,
  rm,
  writeFile,
} from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { canonicalJson, sha256Digest } from "./canonical.js";
import { assertValidDocument } from "./validate.js";
import type {
  ArtifactStore,
  CoreDocument,
  DocumentKind,
  TaskDossier,
  WorkflowModuleRelease,
} from "./types.js";

export class NotFoundError extends Error {}
export class ConflictError extends Error {}
export class StoreLockedError extends Error {}

function documentId(kind: DocumentKind, document: CoreDocument): string {
  if (kind === "workflow-module-release") {
    const release = document as WorkflowModuleRelease;
    return `${release.moduleId}@${release.version}`;
  }
  return (document as Exclude<CoreDocument, WorkflowModuleRelease>).id;
}

function safeName(id: string): string {
  return encodeURIComponent(id);
}

export class FileSystemStore implements ArtifactStore {
  readonly root: string;

  constructor(root: string) {
    this.root = resolve(root);
  }

  async init(): Promise<void> {
    await mkdir(this.root, { recursive: true, mode: 0o700 });
    await mkdir(join(this.root, ".locks"), { recursive: true, mode: 0o700 });
  }

  private path(kind: DocumentKind, id: string): string {
    return join(this.root, kind, `${safeName(id)}.json`);
  }

  private historyPath(id: string, revision: number): string {
    return join(
      this.root,
      ".history",
      "task-dossier",
      safeName(id),
      `${revision.toString().padStart(10, "0")}.json`,
    );
  }

  private async writeAtomic(target: string, document: CoreDocument): Promise<void> {
    await mkdir(dirname(target), { recursive: true, mode: 0o700 });
    const temporary = `${target}.${process.pid}.${Date.now()}.tmp`;
    try {
      await writeFile(temporary, `${JSON.stringify(document, null, 2)}\n`, {
        encoding: "utf8",
        mode: 0o600,
        flag: "wx",
      });
      await rename(temporary, target);
    } finally {
      await rm(temporary, { force: true });
    }
  }

  private async withLock<T>(kind: DocumentKind, id: string, work: () => Promise<T>): Promise<T> {
    await this.init();
    const lockDir = join(this.root, ".locks", kind);
    await mkdir(lockDir, { recursive: true, mode: 0o700 });
    const lockPath = join(lockDir, `${safeName(id)}.lock`);
    let handle;
    try {
      handle = await open(lockPath, "wx", 0o600);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "EEXIST") {
        throw new StoreLockedError(`${kind} ${id} is locked`);
      }
      throw error;
    }
    try {
      return await work();
    } finally {
      await handle.close();
      await rm(lockPath, { force: true });
    }
  }

  async put(kind: DocumentKind, document: CoreDocument, expectedRevision?: number): Promise<void> {
    assertValidDocument(kind, document);
    const id = documentId(kind, document);
    await this.withLock(kind, id, async () => {
      const target = this.path(kind, id);
      let existing: CoreDocument | undefined;
      try {
        existing = JSON.parse(await readFile(target, "utf8")) as CoreDocument;
      } catch (error) {
        if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
      }

      if (kind !== "task-dossier" && existing) {
        if (canonicalJson(existing) === canonicalJson(document)) return;
        throw new ConflictError(`${kind} ${id} is immutable`);
      }

      if (kind === "task-dossier") {
        const currentRevision = existing ? (existing as TaskDossier).revision : 0;
        const dossier = document as TaskDossier;
        const nextRevision = dossier.revision;
        if (expectedRevision !== undefined && expectedRevision !== currentRevision) {
          throw new ConflictError(
            `Expected revision ${expectedRevision}, current revision is ${currentRevision}`,
          );
        }
        if (nextRevision !== currentRevision + 1) {
          throw new ConflictError(
            `Dossier revision must be ${currentRevision + 1}, received ${nextRevision}`,
          );
        }
        if (existing) {
          const current = existing as TaskDossier;
          if (dossier.createdAt !== current.createdAt) {
            throw new ConflictError("Dossier createdAt is immutable");
          }
          if (Date.parse(dossier.updatedAt) < Date.parse(current.updatedAt)) {
            throw new ConflictError("Dossier updatedAt must not move backwards");
          }
        }
      }

      if (kind === "task-dossier") {
        const dossier = document as TaskDossier;
        const historyTarget = this.historyPath(id, dossier.revision);
        try {
          const archived = JSON.parse(await readFile(historyTarget, "utf8")) as CoreDocument;
          if (canonicalJson(archived) !== canonicalJson(document)) {
            throw new ConflictError(
              `Dossier revision ${dossier.revision} already has different content`,
            );
          }
        } catch (error) {
          if ((error as NodeJS.ErrnoException).code !== "ENOENT") throw error;
          await this.writeAtomic(historyTarget, document);
        }
      }
      await this.writeAtomic(target, document);
    });
  }

  async get(kind: DocumentKind, id: string): Promise<CoreDocument> {
    try {
      const document: unknown = JSON.parse(await readFile(this.path(kind, id), "utf8"));
      assertValidDocument(kind, document);
      return document;
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") {
        throw new NotFoundError(`${kind} ${id} was not found`);
      }
      throw error;
    }
  }

  async list(kind: DocumentKind): Promise<CoreDocument[]> {
    const directory = join(this.root, kind);
    let files: string[];
    try {
      files = await readdir(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const documents = await Promise.all(
      files.filter((file) => file.endsWith(".json")).sort().map(async (file) => {
        const document: unknown = JSON.parse(await readFile(join(directory, file), "utf8"));
        assertValidDocument(kind, document);
        return document;
      }),
    );
    return documents;
  }

  async history(id: string): Promise<TaskDossier[]> {
    const directory = dirname(this.historyPath(id, 1));
    let files: string[];
    try {
      files = await readdir(directory);
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code === "ENOENT") return [];
      throw error;
    }
    const revisions: TaskDossier[] = [];
    for (const file of files.filter((name) => name.endsWith(".json")).sort()) {
      const document: unknown = JSON.parse(await readFile(join(directory, file), "utf8"));
      assertValidDocument("task-dossier", document);
      revisions.push(document as TaskDossier);
    }
    return revisions;
  }

  async snapshotDigest(): Promise<string> {
    const kinds: DocumentKind[] = [
      "task-dossier",
      "workflow-module-release",
      "route",
      "execution-pack",
      "result-pack",
    ];
    const entries: Array<{ kind: DocumentKind; document: CoreDocument }> = [];
    for (const kind of kinds) {
      for (const document of await this.list(kind)) entries.push({ kind, document });
    }
    return sha256Digest(entries);
  }
}
