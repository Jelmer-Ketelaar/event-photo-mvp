import { describe, expect, it } from "vitest";
import { sanitizeFileName } from "./format";

describe("sanitizeFileName", () => {
  it("normalizes mixed casing and spacing", () => {
    expect(sanitizeFileName("Friday Garden Party")).toBe("friday-garden-party");
  });

  it("collapses symbols into single dashes", () => {
    expect(sanitizeFileName("A&B /// C")).toBe("a-b-c");
  });

  it("trims leading and trailing separators", () => {
    expect(sanitizeFileName("  -- EventFrame --  ")).toBe("eventframe");
  });
});
