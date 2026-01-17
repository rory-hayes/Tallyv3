import { randomUUID } from "crypto";
import { prisma, type Role } from "@tally/db";

export const resetDb = async () => {
  await prisma.exception.deleteMany();
  await prisma.checkResult.deleteMany();
  await prisma.pack.deleteMany();
  await prisma.reconciliationRun.deleteMany();
  await prisma.approval.deleteMany();
  await prisma.import.deleteMany();
  await prisma.mappingTemplate.deleteMany();
  await prisma.payRun.deleteMany();
  await prisma.client.deleteMany();
  await prisma.auditEvent.deleteMany();
  await prisma.invite.deleteMany();
  await prisma.user.deleteMany();
  await prisma.firm.deleteMany();
};

export const createFirmWithUser = async (
  role: Role = "ADMIN",
  region: "UK" | "IE" = "UK"
) => {
  const firm = await prisma.firm.create({
    data: {
      name: `Test Firm ${randomUUID()}`,
      region,
      timezone: "Europe/London"
    }
  });

  const user = await prisma.user.create({
    data: {
      firmId: firm.id,
      email: `${randomUUID()}@example.com`,
      role,
      status: "ACTIVE"
    }
  });

  return { firm, user };
};
