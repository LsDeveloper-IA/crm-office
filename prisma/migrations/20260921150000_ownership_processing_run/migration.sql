CREATE TYPE "OwnershipProcessingStatus" AS ENUM (
  'RECEIVED', 'EXTRACTING', 'VALIDATING', 'VALIDATED', 'PERSISTING', 'PERSISTED',
  'NEEDS_REVIEW', 'FAILED_RETRYABLE', 'FAILED_PERMANENT'
);

CREATE TABLE "OwnershipProcessingRun" (
  "id" TEXT NOT NULL,
  "correlationId" VARCHAR(36) NOT NULL,
  "companyCnpj" VARCHAR(14) NOT NULL,
  "status" "OwnershipProcessingStatus" NOT NULL DEFAULT 'RECEIVED',
  "stage" VARCHAR(40) NOT NULL,
  "attempt" INTEGER NOT NULL DEFAULT 1,
  "audit" JSONB,
  "errorCode" VARCHAR(80),
  "errorMessage" TEXT,
  "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  "finishedAt" TIMESTAMP(3),
  "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "OwnershipProcessingRun_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "OwnershipProcessingRun_correlationId_key" ON "OwnershipProcessingRun"("correlationId");
CREATE INDEX "OwnershipProcessingRun_companyCnpj_startedAt_idx" ON "OwnershipProcessingRun"("companyCnpj", "startedAt");
CREATE INDEX "OwnershipProcessingRun_status_updatedAt_idx" ON "OwnershipProcessingRun"("status", "updatedAt");
