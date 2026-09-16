ALTER TABLE "ProfitPartner" ADD COLUMN "qsaPeriods" JSONB;
ALTER TABLE "ProfitPartner" ADD COLUMN "knownBeforeGmail" BOOLEAN NOT NULL DEFAULT true;

CREATE TABLE "GmailQsaImport" (
  "id" SERIAL NOT NULL,
  "mailbox" TEXT NOT NULL,
  "messageId" TEXT NOT NULL,
  "companyCnpj" VARCHAR(14) NOT NULL,
  "sentAt" TIMESTAMP(3) NOT NULL,
  "payload" JSONB NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "GmailQsaImport_pkey" PRIMARY KEY ("id"),
  CONSTRAINT "GmailQsaImport_companyCnpj_fkey" FOREIGN KEY ("companyCnpj") REFERENCES "Company"("cnpj") ON DELETE RESTRICT ON UPDATE CASCADE
);
CREATE UNIQUE INDEX "GmailQsaImport_mailbox_messageId_key" ON "GmailQsaImport"("mailbox", "messageId");
CREATE INDEX "GmailQsaImport_companyCnpj_idx" ON "GmailQsaImport"("companyCnpj");
