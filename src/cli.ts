#!/usr/bin/env node

import { randomUUID } from "node:crypto";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { extname, join, resolve } from "node:path";
import { FileSystemStore } from "./store.js";
import { readReplayFile, replay } from "./replay.js";
import {
  assertValidDocument,
  inferDocumentKind,
  validateDocument,
} from "./validate.js";
import type { CoreDocument, DocumentKind, TaskDossier } from "./types.js";

const kinds: DocumentKind[] = [
  "task-dossier",
  "workflow-module-release",
  "route",
  "execution-pack",
  "result-pack",
];

function usage(): string {
  return `AtlasRepo Core v0.1

Usage:
  atlasrepo-core validate <kind> <file>
  atlasrepo-core store init --dir <path>
  atlasrepo-core dossier create --title <title> [--description <text>] --store <path>
  atlasrepo-core dossier put <file> --store <path> [--expected-revision <number>]
  atlasrepo-core dossier get <id> --store <path>
  atlasrepo-core dossier history <id> --store <path>
  atlasrepo-core import <kind> <file> --store <path> [--expected-revision <number>]
  atlasrepo-core export <kind> <id> --store <path> --out <file>
  atlasrepo-core replay <events.jsonl> --store <path>
  atlasrepo-core schema-smoke --schema-root <atlasrepo-schema>

Kinds: ${kinds.join(", ")}
`;
}

function option(args: string[], name: string, required = true): string | undefined {
  const index = args.indexOf(name);
  const value = index >= 0 ? args[index + 1] : undefined;
  if (required && (!value || value.startsWith("--"))) {
    throw new Error(`Missing required option ${name}`);
  }
  return value;
}

function parseKind(value: string | undefined): DocumentKind {
  if (!value || !kinds.includes(value as DocumentKind)) {
    throw new Error(`Unsupported document kind: ${String(value)}`);
  }
  return value as DocumentKind;
}

async function readJson(path: string): Promise<unknown> {
  return JSON.parse(await readFile(resolve(path), "utf8")) as unknown;
}

async function writeJson(path: string, value: unknown): Promise<void> {
  const target = resolve(path);
  await mkdir(resolve(target, ".."), { recursive: true });
  await writeFile(target, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

async function jsonFiles(directory: string): Promise<string[]> {
  const entries = await readdir(directory, { withFileTypes: true });
  const paths: string[] = [];
  for (const entry of entries.sort((a, b) => a.name.localeCompare(b.name))) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) paths.push(...(await jsonFiles(path)));
    if (entry.isFile() && extname(entry.name) === ".json") paths.push(path);
  }
  return paths;
}

async function schemaSmoke(schemaRoot: string): Promise<void> {
  const fixtureRoot = resolve(schemaRoot, "contracts", "atlasrepo-core", "fixtures");
  const files = await jsonFiles(fixtureRoot);
  if (files.length === 0) throw new Error(`No JSON fixtures found in ${fixtureRoot}`);
  for (const file of files) {
    const document = await readJson(file);
    const kind = inferDocumentKind(document);
    assertValidDocument(kind, document);
  }
  process.stdout.write(`${JSON.stringify({ ok: true, fixtures: files.length })}\n`);
}

async function main(args: string[]): Promise<void> {
  const [command, subject, ...rest] = args;
  if (!command || command === "help" || command === "--help" || command === "-h") {
    process.stdout.write(usage());
    return;
  }

  if (command === "validate") {
    const kind = parseKind(subject);
    const file = rest[0];
    if (!file) throw new Error("Missing JSON file");
    const result = validateDocument(kind, await readJson(file));
    process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
    if (!result.ok) process.exitCode = 1;
    return;
  }

  if (command === "store" && subject === "init") {
    const store = new FileSystemStore(option(rest, "--dir")!);
    await store.init();
    process.stdout.write(`${JSON.stringify({ ok: true, store: store.root })}\n`);
    return;
  }

  if (command === "dossier" && subject === "create") {
    const title = option(rest, "--title")!;
    const description = option(rest, "--description", false) ?? title;
    const now = new Date().toISOString();
    const dossier: TaskDossier = {
      schemaVersion: "atlasrepo.core/task-dossier/v0.1",
      id: randomUUID(),
      revision: 1,
      createdAt: now,
      updatedAt: now,
      title,
      context: { description, constraints: [] },
      evidence: [],
      hypotheses: [],
      checks: [],
      actions: [],
    };
    const store = new FileSystemStore(option(rest, "--store")!);
    await store.put("task-dossier", dossier, 0);
    process.stdout.write(`${JSON.stringify(dossier, null, 2)}\n`);
    return;
  }

  if (command === "dossier" && subject === "put") {
    const file = rest[0];
    if (!file) throw new Error("Missing dossier JSON file");
    const document = await readJson(file);
    assertValidDocument("task-dossier", document);
    const expected = option(rest, "--expected-revision", false);
    const store = new FileSystemStore(option(rest, "--store")!);
    await store.put(
      "task-dossier",
      document,
      expected === undefined ? undefined : Number.parseInt(expected, 10),
    );
    process.stdout.write(`${JSON.stringify({ ok: true, id: (document as TaskDossier).id })}\n`);
    return;
  }

  if (command === "dossier" && subject === "get") {
    const id = rest[0];
    if (!id) throw new Error("Missing dossier id");
    const store = new FileSystemStore(option(rest, "--store")!);
    process.stdout.write(`${JSON.stringify(await store.get("task-dossier", id), null, 2)}\n`);
    return;
  }

  if (command === "dossier" && subject === "history") {
    const id = rest[0];
    if (!id) throw new Error("Missing dossier id");
    const store = new FileSystemStore(option(rest, "--store")!);
    process.stdout.write(`${JSON.stringify(await store.history(id), null, 2)}\n`);
    return;
  }

  if (command === "import") {
    const kind = parseKind(subject);
    const file = rest[0];
    if (!file) throw new Error("Missing JSON file");
    const document = await readJson(file);
    assertValidDocument(kind, document);
    const expected = option(rest, "--expected-revision", false);
    const store = new FileSystemStore(option(rest, "--store")!);
    await store.put(
      kind,
      document,
      expected === undefined ? undefined : Number.parseInt(expected, 10),
    );
    process.stdout.write(`${JSON.stringify({ ok: true })}\n`);
    return;
  }

  if (command === "export") {
    const kind = parseKind(subject);
    const id = rest[0];
    if (!id) throw new Error("Missing document id");
    const store = new FileSystemStore(option(rest, "--store")!);
    await writeJson(option(rest, "--out")!, await store.get(kind, id));
    process.stdout.write(`${JSON.stringify({ ok: true })}\n`);
    return;
  }

  if (command === "replay") {
    const file = subject;
    if (!file) throw new Error("Missing replay JSONL file");
    const store = new FileSystemStore(option(rest, "--store")!);
    const result = await replay(await readReplayFile(file), store);
    process.stdout.write(`${JSON.stringify(result)}\n`);
    return;
  }

  if (command === "schema-smoke") {
    await schemaSmoke(option(args.slice(1), "--schema-root")!);
    return;
  }

  throw new Error(`Unknown command: ${args.join(" ")}\n\n${usage()}`);
}

main(process.argv.slice(2)).catch((error: unknown) => {
  const message = error instanceof Error ? error.message : String(error);
  process.stderr.write(`atlasrepo-core: ${message}\n`);
  process.exitCode = 1;
});
