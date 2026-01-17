"use server";

import { z } from "zod";
import { prisma, type Role, UserStatus } from "@tally/db";
import { env } from "@/lib/env";
import { recordAuditEvent } from "@/lib/audit";
import { generateInviteToken } from "@/lib/token";
import { requireUser } from "@/lib/auth";
import { PermissionError, requirePermission } from "@/lib/permissions";

export type InviteState = {
  error?: string;
  inviteLink?: string;
};

const inviteSchema = z.object({
  email: z.string().email(),
  role: z.enum(["ADMIN", "PREPARER", "REVIEWER"])
});

export const createInviteAction = async (
  _prevState: InviteState,
  formData: FormData
): Promise<InviteState> => {
  const { session, user } = await requireUser();
  try {
    requirePermission(user.role, "user:invite");
  } catch (error) {
    if (error instanceof PermissionError) {
      return { error: "Permission denied." };
    }
    throw error;
  }

  const parsed = inviteSchema.safeParse({
    email: formData.get("email"),
    role: formData.get("role")
  });

  if (!parsed.success) {
    return { error: "Provide a valid email and role." };
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: parsed.data.email }
  });

  if (existingUser) {
    return { error: "A user with this email already exists." };
  }

  const { token, tokenHash } = generateInviteToken();

  const invite = await prisma.$transaction(async (tx) => {
    const createdUser = await tx.user.create({
      data: {
        firmId: session.firmId,
        email: parsed.data.email,
        role: parsed.data.role as Role,
        status: UserStatus.INVITED
      }
    });

    const invite = await tx.invite.create({
      data: {
        firmId: session.firmId,
        userId: createdUser.id,
        email: parsed.data.email,
        tokenHash,
        expiresAt: new Date(Date.now() + 7 * 24 * 60 * 60 * 1000),
        invitedByUserId: session.userId
      }
    });

    return invite;
  });

  await recordAuditEvent(
    {
      action: "USER_INVITED",
      entityType: "USER",
      entityId: invite.userId,
      metadata: {
        role: parsed.data.role
      }
    },
    {
      firmId: session.firmId,
      actorUserId: session.userId
    }
  );

  return {
    inviteLink: `${env.APP_BASE_URL}/invite/${token}`
  };
};

export type RoleUpdateState = {
  error?: string;
  success?: boolean;
};

const roleUpdateSchema = z.object({
  userId: z.string().uuid(),
  role: z.enum(["ADMIN", "PREPARER", "REVIEWER"])
});

export const updateUserRoleAction = async (
  _prevState: RoleUpdateState,
  formData: FormData
): Promise<RoleUpdateState> => {
  const { session, user } = await requireUser();
  try {
    requirePermission(user.role, "user:role-change");
  } catch (error) {
    if (error instanceof PermissionError) {
      return { error: "Permission denied." };
    }
    throw error;
  }

  const parsed = roleUpdateSchema.safeParse({
    userId: formData.get("userId"),
    role: formData.get("role")
  });

  if (!parsed.success) {
    return { error: "Unable to update role." };
  }

  const targetUser = await prisma.user.findFirst({
    where: {
      id: parsed.data.userId,
      firmId: session.firmId
    }
  });

  if (!targetUser) {
    return { error: "User not found." };
  }

  if (targetUser.role === parsed.data.role) {
    return { success: true };
  }

  await prisma.user.update({
    where: { id: targetUser.id },
    data: { role: parsed.data.role as Role }
  });

  await recordAuditEvent(
    {
      action: "USER_ROLE_CHANGED",
      entityType: "USER",
      entityId: targetUser.id,
      metadata: {
        from: targetUser.role,
        to: parsed.data.role
      }
    },
    {
      firmId: session.firmId,
      actorUserId: session.userId
    }
  );

  return { success: true };
};

export const updateUserRoleFromForm = async (formData: FormData) => {
  await updateUserRoleAction({}, formData);
};
