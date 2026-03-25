import { describe, expect, it } from "vitest";
import { firstErrorMessage, toErrorMessage } from "./errors";

describe("toErrorMessage", () => {
  it("uses the original error message when available", () => {
    expect(toErrorMessage(new Error("Boom"), "Fallback")).toBe("Boom");
  });

  it("falls back for non-Error values", () => {
    expect(toErrorMessage("boom", "Fallback")).toBe("Fallback");
  });
});

describe("firstErrorMessage", () => {
  it("returns the first available error message", () => {
    expect(firstErrorMessage("Fallback", null, new Error("First"), new Error("Second"))).toBe("First");
  });

  it("returns null when no errors exist", () => {
    expect(firstErrorMessage("Fallback", null, undefined)).toBeNull();
  });
});
