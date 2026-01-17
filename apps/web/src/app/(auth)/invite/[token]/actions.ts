"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@tally/db";
import { createSessionForUser, hashPassword } from "@/lib/auth";
import { hashToken } from "@/lib/token";

export type AcceptInviteState = {
  error?: string;
};

const acceptInviteSchema = z.object({
  password: z.string().min(12)
});

export const acceptInviteAction = async (
  token: string,
  _prevState: AcceptInviteState,
  formData: FormData
): Promise<AcceptInviteState> => {
  const parsed = acceptInviteSchema.safeParse({
    password: formData.get("password")
  });

  if (!parsed.success) {
    return { error: "Password must be at least 12 characters." };
  }

  const tokenHash = hashToken(token);

  const invite = await prisma.invite.findFirst({
    where: {
      tokenHash,
      status: "PENDING"
    },
    include: {
      user: true
    }
  });

  if (!invite) {
    return { error: "Invite link is invalid or expired." };
  }

  if (invite.expiresAt < new Date()) {
    await prisma.invite.update({
      where: { id: invite.id },
      data: { status: "EXPIRED" }
    });
    return { error: "Invite link has expired." };
  }

  const passwordHash = await hashPassword(parsed.data.password);

  const user = await prisma.user.update({
    where: { id: invite.userId },
    data: {
      passwordHash,
      status: "ACTIVE"
    }
  });

  await prisma.invite.update({
    where: { id: invite.id },
    data: {
      status: "ACCEPTED",
      acceptedAt: new Date()
    }
  });

  await createSessionForUser(user);
  redirect("/dashboard");
};
