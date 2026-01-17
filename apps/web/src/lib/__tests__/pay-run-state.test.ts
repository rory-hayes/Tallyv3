import { describe, expect, it } from "vitest";
import {
  assertPayRunTransition,
  canTransitionPayRun,
  getAllowedTransitions
} from "@/lib/pay-run-state";
import { ValidationError } from "@/lib/errors";

describe("pay run state machine", () => {
  it("allows draft to imported for preparers", () => {
    expect(canTransitionPayRun("DRAFT", "IMPORTED", "PREPARER")).toBe(true);
    expect(() =>
      assertPayRunTransition("DRAFT", "IMPORTED", "PREPARER")
    ).not.toThrow();
  });

  it("blocks reviewers from approving without review", () => {
    expect(() =>
      assertPayRunTransition("DRAFT", "APPROVED", "REVIEWER")
    ).toThrow(ValidationError);
  });

  it("allows reviewers to approve ready pay runs", () => {
    expect(canTransitionPayRun("READY_FOR_REVIEW", "APPROVED", "REVIEWER")).toBe(
      true
    );
  });

  it("allows system to complete reconciling", () => {
    expect(
      canTransitionPayRun("RECONCILING", "RECONCILED", "SYSTEM")
    ).toBe(true);
  });

  it("allows preparers to re-run reconciliation", () => {
    expect(
      canTransitionPayRun("RECONCILED", "RECONCILING", "PREPARER")
    ).toBe(true);
  });

  it("rejects locking by preparers", () => {
    expect(() =>
      assertPayRunTransition("PACKED", "LOCKED", "PREPARER")
    ).toThrow(ValidationError);
  });

  it("lists allowed transitions", () => {
    const transitions = getAllowedTransitions("READY_FOR_REVIEW", "REVIEWER");
    expect(transitions).toEqual(["APPROVED", "RECONCILED"]);
  });
});
