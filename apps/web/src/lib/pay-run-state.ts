import type { PayRunStatus, Role } from "@tally/db";
import { ValidationError } from "./errors";

export type ActorRole = Role | "SYSTEM";

type TransitionRule = {
  from: PayRunStatus;
  to: PayRunStatus;
  roles: ActorRole[];
};

const transitionRules: TransitionRule[] = [
  { from: "DRAFT", to: "IMPORTED", roles: ["ADMIN", "PREPARER"] },
  { from: "IMPORTED", to: "MAPPED", roles: ["ADMIN", "PREPARER"] },
  { from: "IMPORTED", to: "RECONCILING", roles: ["ADMIN", "PREPARER"] },
  { from: "MAPPED", to: "RECONCILING", roles: ["ADMIN", "PREPARER"] },
  { from: "RECONCILED", to: "RECONCILING", roles: ["ADMIN", "PREPARER"] },
  { from: "RECONCILING", to: "RECONCILED", roles: ["SYSTEM"] },
  { from: "RECONCILED", to: "READY_FOR_REVIEW", roles: ["ADMIN", "PREPARER"] },
  { from: "READY_FOR_REVIEW", to: "APPROVED", roles: ["ADMIN", "REVIEWER"] },
  { from: "READY_FOR_REVIEW", to: "RECONCILED", roles: ["ADMIN", "REVIEWER"] },
  { from: "APPROVED", to: "PACKED", roles: ["ADMIN", "PREPARER", "REVIEWER"] },
  { from: "PACKED", to: "LOCKED", roles: ["ADMIN", "REVIEWER"] },
  { from: "LOCKED", to: "ARCHIVED", roles: ["ADMIN"] }
];

export const canTransitionPayRun = (
  from: PayRunStatus,
  to: PayRunStatus,
  actorRole: ActorRole
): boolean =>
  transitionRules.some(
    (rule) =>
      rule.from === from && rule.to === to && rule.roles.includes(actorRole)
  );

export const assertPayRunTransition = (
  from: PayRunStatus,
  to: PayRunStatus,
  actorRole: ActorRole
) => {
  if (!canTransitionPayRun(from, to, actorRole)) {
    throw new ValidationError(
      `Illegal pay run transition from ${from} to ${to} for ${actorRole}.`
    );
  }
};

export const getAllowedTransitions = (
  from: PayRunStatus,
  actorRole: ActorRole
): PayRunStatus[] =>
  transitionRules
    .filter((rule) => rule.from === from && rule.roles.includes(actorRole))
    .map((rule) => rule.to);
