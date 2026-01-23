-- CreateTable
CREATE TABLE "CompanySectorOwner" (
    "id" SERIAL NOT NULL,
    "companySectorId" INTEGER NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "CompanySectorOwner_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "CompanySectorOwner_companySectorId_idx" ON "CompanySectorOwner"("companySectorId");

-- AddForeignKey
ALTER TABLE "CompanySectorOwner" ADD CONSTRAINT "CompanySectorOwner_companySectorId_fkey" FOREIGN KEY ("companySectorId") REFERENCES "CompanySector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
