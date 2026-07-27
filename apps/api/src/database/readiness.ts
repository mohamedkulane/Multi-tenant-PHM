import { prisma } from "./prisma.js";

export interface ReadinessResult {
  database: "up" | "down";
  checkedAt: string;
}

export async function checkDatabaseReadiness(): Promise<ReadinessResult> {
  await prisma.$queryRaw`SELECT 1`;

  return {
    database: "up",
    checkedAt: new Date().toISOString(),
  };
}
