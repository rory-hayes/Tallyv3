import { describe, expect, it } from "vitest";
import { ConflictError, NotFoundError, ValidationError } from "@/lib/errors";

describe("error classes", () => {
  it("sets default names and messages", () => {
    const notFound = new NotFoundError();
    const conflict = new ConflictError();
    const validation = new ValidationError();

    expect(notFound.name).toBe("NotFoundError");
    expect(conflict.name).toBe("ConflictError");
    expect(validation.name).toBe("ValidationError");
  });

  it("accepts custom messages", () => {
    const error = new ValidationError("Custom");
    expect(error.message).toBe("Custom");
  });
});
