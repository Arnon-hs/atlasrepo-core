import { createHash } from "node:crypto";

type KeyComparator = (left: string, right: string) => number;

const compareUnicodeCodeUnits: KeyComparator = (left, right) =>
  left < right ? -1 : left > right ? 1 : 0;

function serialize(
  value: unknown,
  compare: KeyComparator,
  ancestors = new WeakSet<object>(),
): string {
  if (
    value === undefined ||
    typeof value === "function" ||
    typeof value === "symbol" ||
    typeof value === "bigint"
  ) {
    throw new TypeError(`Value is not JSON-compatible: ${typeof value}`);
  }
  if (typeof value === "number" && !Number.isFinite(value)) {
    throw new TypeError("Value is not JSON-compatible: number must be finite");
  }
  if (value === null || typeof value !== "object") {
    return JSON.stringify(value) as string;
  }

  if (ancestors.has(value)) throw new TypeError("Value is not JSON-compatible: cyclic value");
  ancestors.add(value);
  try {
    if (Array.isArray(value)) {
      const items: unknown[] = [];
      for (let index = 0; index < value.length; index += 1) {
        if (!Object.hasOwn(value, index)) {
          throw new TypeError("Value is not JSON-compatible: sparse array");
        }
        const descriptor = Object.getOwnPropertyDescriptor(value, String(index));
        if (!descriptor?.enumerable || !("value" in descriptor)) {
          throw new TypeError(
            "Value is not JSON-compatible: array items must be enumerable data values",
          );
        }
        items.push(descriptor.value);
      }
      if (
        Object.getOwnPropertySymbols(value).length > 0 ||
        Object.getOwnPropertyNames(value).length !== value.length + 1
      ) {
        throw new TypeError("Value is not JSON-compatible: array has unsupported properties");
      }
      return `[${items.map((item) => serialize(item, compare, ancestors)).join(",")}]`;
    }

    const prototype = Object.getPrototypeOf(value);
    if (prototype !== Object.prototype && prototype !== null) {
      throw new TypeError("Value is not JSON-compatible: object must be plain");
    }
    if (Object.getOwnPropertySymbols(value).length > 0) {
      throw new TypeError("Value is not JSON-compatible: symbol keys are not allowed");
    }

    const record = value as Record<string, unknown>;
    const keys = Object.getOwnPropertyNames(value).sort(compare);
    const entries = keys.map((key) => {
      const descriptor = Object.getOwnPropertyDescriptor(value, key);
      if (!descriptor?.enumerable || !("value" in descriptor)) {
        throw new TypeError(
          "Value is not JSON-compatible: properties must be enumerable data values",
        );
      }
      return `${JSON.stringify(key)}:${serialize(record[key], compare, ancestors)}`;
    });
    return `{${entries.join(",")}}`;
  } finally {
    ancestors.delete(value);
  }
}

export function canonicalJson(value: unknown): string {
  return serialize(value, compareUnicodeCodeUnits);
}

export function sha256Digest(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJson(value)).digest("hex")}`;
}

function sortValueV01(value: unknown): unknown {
  if (Array.isArray(value)) return value.map(sortValueV01);
  if (value !== null && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value as Record<string, unknown>)
        .sort(([left], [right]) => left.localeCompare(right))
        .map(([key, child]) => [key, sortValueV01(child)]),
    );
  }
  return value;
}

/**
 * Reproduces the host-locale-dependent key ordering exported by Core v0.1 for
 * JSON-compatible values. Use only to compare a digest from the same locale.
 */
export function canonicalJsonV01(value: unknown): string {
  return JSON.stringify(sortValueV01(value));
}

/** @see canonicalJsonV01 */
export function sha256DigestV01(value: unknown): string {
  return `sha256:${createHash("sha256").update(canonicalJsonV01(value)).digest("hex")}`;
}
