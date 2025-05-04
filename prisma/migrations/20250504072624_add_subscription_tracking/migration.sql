-- AlterTable
ALTER TABLE "User" ADD COLUMN     "freeGenerationsGranted" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN     "isSubscribed" BOOLEAN NOT NULL DEFAULT false;
