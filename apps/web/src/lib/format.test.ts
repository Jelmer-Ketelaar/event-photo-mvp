import { describe, expect, it } from "vitest";
import { formatUploaderFileToken, formatUploaderLabel, sanitizeFileName } from "./format";

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

describe("formatUploaderLabel", () => {
  it("adds a clear attribution when a nickname is present", () => {
    expect(formatUploaderLabel("Sam")).toBe("From Sam");
  });

  it("falls back when no nickname is available", () => {
    expect(formatUploaderLabel(null)).toBe("From a guest");
  });
});

describe("formatUploaderFileToken", () => {
  it("creates a safe token from the uploader nickname", () => {
    expect(formatUploaderFileToken("Sam van Dijk")).toBe("sam-van-dijk");
  });

  it("falls back to guest for empty nicknames", () => {
    expect(formatUploaderFileToken("")).toBe("guest");
  });
});
