import "server-only";
// Prisma engine setup is handled in @tally/db/src/client.ts
// It runs before PrismaClient is imported, so no need for separate setup here
import { prisma } from "@tally/db";

export { prisma };
