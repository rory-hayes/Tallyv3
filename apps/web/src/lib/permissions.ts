import type { Role } from "@tally/db";

export type Permission =
  | "firm:manage"
  | "user:invite"
  | "user:role-change"
  | "audit:view"
  | "client:write"
  | "pay-run:create"
  | "pay-run:transition"
  | "pay-run:revision"
  | "import:upload"
  | "template:write"
  | "reconciliation:run";

const rolePermissions: Record<Role, Permission[]> = {
  ADMIN: [
    "firm:manage",
    "user:invite",
    "user:role-change",
    "audit:view",
    "client:write",
    "pay-run:create",
    "pay-run:transition",
    "pay-run:revision",
    "import:upload",
    "template:write",
    "reconciliation:run"
  ],
  PREPARER: [
    "audit:view",
    "client:write",
    "pay-run:create",
    "pay-run:transition",
    "pay-run:revision",
    "import:upload",
    "template:write",
    "reconciliation:run"
  ],
  REVIEWER: [
    "audit:view",
    "client:write",
    "pay-run:create",
    "pay-run:transition",
    "pay-run:revision",
    "import:upload",
    "template:write",
    "reconciliation:run"
  ]
};

export const can = (role: Role, permission: Permission): boolean =>
  rolePermissions[role].includes(permission);

export class PermissionError extends Error {
  constructor() {
    super("Permission denied");
  }
}

export const requirePermission = (role: Role, permission: Permission): void => {
  if (!can(role, permission)) {
    throw new PermissionError();
  }
};
