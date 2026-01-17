import { describe, expect, it } from "vitest";
import { can, PermissionError, requirePermission } from "@/lib/permissions";

describe("permissions", () => {
  it("allows admins to invite users", () => {
    expect(can("ADMIN", "user:invite")).toBe(true);
  });

  it("prevents preparers from inviting users", () => {
    expect(can("PREPARER", "user:invite")).toBe(false);
  });

  it("throws when permission is missing", () => {
    expect(() => requirePermission("REVIEWER", "user:role-change")).toThrow(
      PermissionError
    );
  });

  it("allows reviewers to manage clients", () => {
    expect(can("REVIEWER", "client:write")).toBe(true);
  });

  it("allows preparers to create pay runs", () => {
    expect(can("PREPARER", "pay-run:create")).toBe(true);
  });

  it("allows reviewers to upload imports", () => {
    expect(can("REVIEWER", "import:upload")).toBe(true);
  });

  it("allows preparers to manage templates", () => {
    expect(can("PREPARER", "template:write")).toBe(true);
  });

  it("allows preparers to run reconciliation", () => {
    expect(can("PREPARER", "reconciliation:run")).toBe(true);
  });
});
