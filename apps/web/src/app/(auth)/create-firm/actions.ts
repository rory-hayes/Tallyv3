"use server";

import { z } from "zod";
import { redirect } from "next/navigation";
import { prisma } from "@tally/db";
import { createSessionForUser, hashPassword } from "@/lib/auth";

export type CreateFirmState = {
  error?: string;
};

const createFirmSchema = z.object({
  firmName: z.string().min(2),
  region: z.enum(["UK", "IE"]),
  timezone: z.string().min(1),
  email: z.string().email(),
  password: z.string().min(12)
});

const defaultFirmSettings = {
  requiredSources: {
    register: true,
    bank: true,
    gl: true,
    statutory: false
  },
  redaction: {
    maskEmployeeNames: false,
    maskBankDetails: false,
    maskNiNumbers: false
  }
};

export const createFirmAction = async (
  _prevState: CreateFirmState,
  formData: FormData
): Promise<CreateFirmState> => {
  const parsed = createFirmSchema.safeParse({
    firmName: formData.get("firmName"),
    region: formData.get("region"),
    timezone: formData.get("timezone"),
    email: formData.get("email"),
    password: formData.get("password")
  });

  if (!parsed.success) {
    return { error: "Provide all fields with a strong password." };
  }

  const existingUser = await prisma.user.findUnique({
    where: { email: parsed.data.email }
  });

  if (existingUser) {
    return { error: "An account with this email already exists." };
  }

  const passwordHash = await hashPassword(parsed.data.password);

  const firm = await prisma.firm.create({
    data: {
      name: parsed.data.firmName,
      region: parsed.data.region,
      timezone: parsed.data.timezone,
      defaults: defaultFirmSettings,
      users: {
        create: {
          email: parsed.data.email,
          passwordHash,
          role: "ADMIN",
          status: "ACTIVE"
        }
      }
    },
    include: {
      users: true
    }
  });

  const adminUser = firm.users[0];
  if (!adminUser) {
    return { error: "Unable to create admin user." };
  }

  await createSessionForUser(adminUser);
  redirect("/dashboard");
};
