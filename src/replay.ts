import { readFile } from "node:fs/promises";
import type { FileSystemStore } from "./store.js";
import { inferDocumentKind } from "./validate.js";
import type { CoreDocument, DocumentKind } from "./types.js";

export interface ReplayEvent {
  sequence: number;
  operation: "put";
  kind: DocumentKind;
  expectedRevision?: number;
  document: CoreDocument;
}

export interface ReplayResult {
  applied: number;
  digest: string;
}

export async function replay(events: ReplayEvent[], store: FileSystemStore): Promise<ReplayResult> {
  for (const [index, event] of events.entries()) {
    const expectedSequence = index + 1;
    if (event.sequence !== expectedSequence) {
      throw new Error(`Replay sequence must be ${expectedSequence}, received ${event.sequence}`);
    }
    if (event.operation !== "put") {
      throw new Error(`Unsupported replay operation: ${String(event.operation)}`);
    }
    if (inferDocumentKind(event.document) !== event.kind) {
      throw new Error(`Replay event ${event.sequence} kind does not match document schemaVersion`);
    }
    await store.put(event.kind, event.document, event.expectedRevision);
  }
  return { applied: events.length, digest: await store.snapshotDigest() };
}

export async function readReplayFile(path: string): Promise<ReplayEvent[]> {
  const lines = (await readFile(path, "utf8"))
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);
  return lines.map((line, index) => {
    try {
      return JSON.parse(line) as ReplayEvent;
    } catch {
      throw new Error(`Invalid JSON on replay line ${index + 1}`);
    }
  });
}

