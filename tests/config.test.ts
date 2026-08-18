import { describe, expect, it } from "vitest";
import { deepMerge, deepSet, resolveConfig } from "../src/config";

describe("deepSet", () => {
  it("creates nested objects for a dot path", () => {
    const target: Record<string, unknown> = {};
    deepSet(target, "a.b.c", 1);
    expect(target).toEqual({ a: { b: { c: 1 } } });
  });
});

describe("deepMerge", () => {
  it("merges nested objects and lets source win", () => {
    const target = { a: { x: 1, y: 2 }, keep: true };
    const source = { a: { y: 99 } };
    expect(deepMerge(target, source)).toEqual({ a: { x: 1, y: 99 }, keep: true });
  });

  it("replaces scalars and arrays", () => {
    expect(deepMerge({ a: [1, 2], b: "old" }, { a: [3], b: "new" })).toEqual({ a: [3], b: "new" });
  });
});

describe("resolveConfig", () => {
  it("returns defaults when no overrides", () => {
    const cfg = resolveConfig({});
    expect(cfg.analysis.rubric.criteria.length).toBeGreaterThan(0);
    expect(cfg.source.type).toBe("feed");
  });

  it("applies CLI overrides", () => {
    const cfg = resolveConfig({ output: { format: "json" } });
    expect(cfg.output.format).toBe("json");
  });

  it("normalizes rubric weights", () => {
    const cfg = resolveConfig({
      analysis: {
        rubric: {
          criteria: [
            { key: "a", label: "A", weight: 1, successCriteria: [], scale: 5 },
            { key: "b", label: "B", weight: 1, successCriteria: [], scale: 5 },
          ],
        },
      },
    });
    expect(cfg.analysis.rubric.criteria.map((c) => c.weight)).toEqual([0.5, 0.5]);
  });

  it("replaces source wholesale (no merge across modes)", () => {
    const cfg = resolveConfig({}, undefined, { type: "topic", query: "x" });
    expect(cfg.source).toEqual({ type: "topic", query: "x" });
  });

  it("rejects an invalid source mode", () => {
    expect(() => resolveConfig({}, undefined, { type: "nope" } as never)).toThrow();
  });
});
