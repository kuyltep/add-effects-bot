-- CreateTable
CREATE TABLE "ReveAccount" (
    "id" TEXT NOT NULL,
    "authorization" TEXT NOT NULL,
    "cookie" TEXT NOT NULL,
    "projectId" TEXT NOT NULL,
    "isActive" BOOLEAN NOT NULL DEFAULT true,
    "lastErrorAt" TIMESTAMP(3),
    "lastUsedAt" TIMESTAMP(3),
    "generationCount" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ReveAccount_pkey" PRIMARY KEY ("id")
);
