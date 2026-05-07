import { PrismaClient } from "@prisma/client";
import { validateEnv } from "./validateEnv";

// Fail loud and early if required env vars are missing — better than a
// confusing Prisma stack trace deep in a request handler.
validateEnv();

const globalForPrisma = globalThis as unknown as { prisma?: PrismaClient };

export const prisma =
  globalForPrisma.prisma ??
  new PrismaClient({
    log: process.env.NODE_ENV === "development" ? ["error", "warn"] : ["error"],
  });

if (process.env.NODE_ENV !== "production") globalForPrisma.prisma = prisma;
