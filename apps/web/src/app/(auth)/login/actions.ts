"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@/lib/prisma";
import { createSessionForUser, verifyPassword } from "@/lib/auth";
import { logServerError } from "@/lib/server-errors";

export type LoginState = {
  error?: string;
};

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string().min(1)
});

export const loginAction = async (
  _prevState: LoginState,
  formData: FormData
): Promise<LoginState> => {
  const parsed = loginSchema.safeParse({
    email: formData.get("email"),
    password: formData.get("password")
  });

  if (!parsed.success) {
    return { error: "Enter a valid email and password." };
  }

  let user = null;
  try {
    user = await prisma.user.findUnique({
      where: { email: parsed.data.email }
    });

    if (!user || user.status !== "ACTIVE") {
      return { error: "Invalid credentials." };
    }

    const isValid = await verifyPassword(parsed.data.password, user.passwordHash);

    if (!isValid) {
      return { error: "Invalid credentials." };
    }
  } catch (error) {
    logServerError({ scope: "login" }, error);
    return { error: "Unable to sign in right now." };
  }

  await createSessionForUser(user);
  redirect("/dashboard");
};
