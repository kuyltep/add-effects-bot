-- CreateEnum
CREATE TYPE "Language" AS ENUM ('EN', 'RU');

-- AlterTable
ALTER TABLE "UserSettings" ADD COLUMN     "language" "Language" NOT NULL DEFAULT 'EN';
