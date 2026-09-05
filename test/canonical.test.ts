import assert from "node:assert/strict";
import { execFileSync } from "node:child_process";
import { join } from "node:path";
import test from "node:test";
import {
  canonicalJson,
  canonicalJsonV01,
  sha256Digest,
  sha256DigestV01,
} from "../src/index.js";

test("canonical JSON orders object keys by Unicode code units", () => {
  const value = { ö: 5, å: 4, z: 3, ä: 2, a: 1 };
  assert.equal(canonicalJson(value), '{"a":1,"z":3,"ä":2,"å":4,"ö":5}');
});

test("canonical JSON does not let integer-like keys escape canonical ordering", () => {
  assert.equal(
    canonicalJson({ "2": "two", "10": "ten", "01": "leading" }),
    '{"01":"leading","10":"ten","2":"two"}',
  );
});

test("canonical digest is independent of insertion order", () => {
  const first = { z: 1, nested: { b: 2, a: 3 } };
  const second = { nested: { a: 3, b: 2 }, z: 1 };
  assert.equal(sha256Digest(first), sha256Digest(second));
});

test("canonical digest is independent of process locale", () => {
  const script =
    "import { sha256Digest } from './dist/index.js'; process.stdout.write(sha256Digest({ö:5,å:4,z:3,ä:2,a:1}))";
  const root = join(import.meta.dirname, "..");
  const digest = (locale: string): string =>
    execFileSync(process.execPath, ["--input-type=module", "-e", script], {
      cwd: root,
      encoding: "utf8",
      env: { ...process.env, LC_ALL: locale, LANG: locale },
    });

  assert.equal(digest("en_US.UTF-8"), digest("sv_SE.UTF-8"));
});

test("v0.1 locale behavior remains available for explicit migration", () => {
  const value = { z: 1, a: 2 };
  assert.equal(canonicalJsonV01(value), '{"a":2,"z":1}');
  assert.equal(sha256DigestV01(value), sha256Digest(value));
  assert.equal(
    canonicalJsonV01({ "2": "two", "10": "ten", "01": "leading" }),
    '{"2":"two","10":"ten","01":"leading"}',
  );
});

test("canonicalization rejects values that JSON storage would rewrite", () => {
  assert.throws(() => canonicalJson({ value: undefined }), /not JSON-compatible/);
  assert.throws(() => canonicalJson({ value: new Date() }), /object must be plain/);
  assert.throws(() => canonicalJson({ value: Number.POSITIVE_INFINITY }), /must be finite/);
  assert.throws(() => canonicalJson([, "value"]), /sparse array/);
  const arrayWithAccessor = ["safe"];
  Object.defineProperty(arrayWithAccessor, "0", { enumerable: true, get: () => "unsafe" });
  assert.throws(() => canonicalJson(arrayWithAccessor), /array items must be enumerable data values/);
});
