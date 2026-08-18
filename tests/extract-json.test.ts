import { describe, expect, it } from "vitest";
import { extractJson } from "../src/llm/client";

describe("extractJson", () => {
  it("parses plain JSON", () => {
    expect(extractJson('{"a":1}')).toEqual({ a: 1 });
  });

  it("parses arrays", () => {
    expect(extractJson('[1,2,3]')).toEqual([1, 2, 3]);
  });

  it("strips markdown fences", () => {
    expect(extractJson('```json\n{"a":1}\n```')).toEqual({ a: 1 });
  });

  it("isolates JSON from surrounding prose", () => {
    expect(extractJson('Here is the result: {"a":1} thanks')).toEqual({ a: 1 });
  });

  it("returns null when no JSON present", () => {
    expect(extractJson("just some text")).toBeNull();
  });
});
