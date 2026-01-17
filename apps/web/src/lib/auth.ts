import "server-only";
import { compare, hash } from "bcryptjs";
import { redirect } from "next/navigation";
import { prisma, type User } from "@tally/db";
import { getSession } from "./session";

export const requireSession = async () => {
  const session = await getSession();
  if (!session.userId) {
    redirect("/login");
  }
  return session;
};

export const requireUser = async () => {
  const session = await requireSession();
  const user = await prisma.user.findFirst({
    where: {
      id: session.userId,
      status: "ACTIVE"
    }
  });

  if (!user) {
    redirect("/login");
  }

  return { session, user };
};

export const createSessionForUser = async (user: User): Promise<void> => {
  const session = await getSession();
  session.userId = user.id;
  session.firmId = user.firmId;
  session.role = user.role;
  await session.save();
};

export const verifyPassword = async (
  password: string,
  passwordHash: string | null
): Promise<boolean> => {
  if (!passwordHash) {
    return false;
  }
  return compare(password, passwordHash);
};

export const hashPassword = async (password: string): Promise<string> => hash(password, 12);

export const getActiveUser = async () => {
  const session = await getSession();
  if (!session.userId) {
    return null;
  }
  return prisma.user.findFirst({
    where: {
      id: session.userId,
      status: "ACTIVE"
    }
  });
};
