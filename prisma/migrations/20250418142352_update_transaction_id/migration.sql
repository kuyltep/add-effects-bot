/*
  Warnings:

  - You are about to drop the column `planType` on the `Payment` table. All the data in the column will be lost.
  - The `transactionId` column on the `Payment` table would be dropped and recreated. This will lead to data loss if there is data in the column.

*/
-- AlterTable
ALTER TABLE "Payment" DROP COLUMN "planType",
DROP COLUMN "transactionId",
ADD COLUMN     "transactionId" SERIAL NOT NULL;

-- CreateIndex
CREATE UNIQUE INDEX "Payment_transactionId_key" ON "Payment"("transactionId");
