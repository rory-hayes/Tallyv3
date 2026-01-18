import "server-only";
// IMPORTANT: Import prisma-setup BEFORE @tally/db to ensure engine path is set
import "./prisma-setup";
import { prisma } from "@tally/db";

export { prisma };
