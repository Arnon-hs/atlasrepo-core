import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import test from "node:test";

test("the runtime package remains provider neutral", async () => {
  const packageJson = JSON.parse(
    await readFile(join(import.meta.dirname, "..", "package.json"), "utf8"),
  ) as { dependencies?: Record<string, string> };
  const dependencies = Object.keys(packageJson.dependencies ?? {}).sort();

  assert.deepEqual(dependencies, ["ajv", "ajv-formats"]);
  assert.equal(
    dependencies.some((name) =>
      /openai|anthropic|qwen|zai|gemini|groq|ollama|langchain/i.test(name),
    ),
    false,
  );
});
