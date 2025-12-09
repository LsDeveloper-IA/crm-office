-- CreateEnum
CREATE TYPE "Role" AS ENUM ('ADMIN', 'MANAGER', 'USER');

-- CreateEnum
CREATE TYPE "CompanySectorStatus" AS ENUM ('NOT_REGISTERED', 'PENDING', 'REGISTERED');

-- CreateEnum
CREATE TYPE "CertificateStatus" AS ENUM ('VALID', 'EXPIRED', 'UNKNOWN');

-- CreateEnum
CREATE TYPE "ActivityKind" AS ENUM ('PRIMARY', 'SECONDARY');

-- CreateTable
CREATE TABLE "User" (
    "id" SERIAL NOT NULL,
    "username" TEXT NOT NULL,
    "password" TEXT NOT NULL,
    "role" "Role" NOT NULL DEFAULT 'USER',
    "active" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Form" (
    "id" SERIAL NOT NULL,
    "cnpj" VARCHAR(14),
    "economicGroup" TEXT,
    "taxRegime" TEXT,
    "accountant" TEXT,
    "sector" TEXT,
    "certificate" BOOLEAN,
    "companyCnpj" VARCHAR(14),
    "createdById" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Form_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Company" (
    "cnpj" VARCHAR(14) NOT NULL,
    "name" TEXT,
    "fantasy" TEXT,
    "status" TEXT,
    "type" TEXT,
    "size" TEXT,
    "legalNature" TEXT,
    "publicSpace" TEXT,
    "number" TEXT,
    "district" TEXT,
    "city" TEXT,
    "state" TEXT,
    "zipCode" TEXT,
    "email" TEXT,
    "telephone" TEXT,
    "opening" TIMESTAMP(3),
    "lastUpdate" TIMESTAMP(3),
    "sourceFormId" INTEGER,
    "rawData" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Company_pkey" PRIMARY KEY ("cnpj")
);

-- CreateTable
CREATE TABLE "CompanyQsa" (
    "id" SERIAL NOT NULL,
    "companyCnpj" VARCHAR(14) NOT NULL,
    "nome" TEXT NOT NULL,
    "qualificacao" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CompanyQsa_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanyActivity" (
    "id" SERIAL NOT NULL,
    "companyCnpj" VARCHAR(14) NOT NULL,
    "cnaeCode" TEXT NOT NULL,
    "description" TEXT,
    "kind" "ActivityKind" NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CompanyActivity_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Sector" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "description" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Sector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySector" (
    "id" SERIAL NOT NULL,
    "companyCnpj" VARCHAR(14) NOT NULL,
    "sectorId" INTEGER NOT NULL,
    "status" "CompanySectorStatus" NOT NULL DEFAULT 'NOT_REGISTERED',
    "ownerId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "CompanySector_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "System" (
    "id" SERIAL NOT NULL,
    "key" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "System_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "CompanySystem" (
    "id" SERIAL NOT NULL,
    "companyCnpj" VARCHAR(14) NOT NULL,
    "systemId" INTEGER NOT NULL,
    "registered" BOOLEAN NOT NULL DEFAULT false,
    "details" TEXT,
    "registeredAt" TIMESTAMP(3),

    CONSTRAINT "CompanySystem_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Contact" (
    "id" SERIAL NOT NULL,
    "firstName" TEXT NOT NULL,
    "lastName" TEXT,
    "email" TEXT,
    "phone" TEXT,
    "title" TEXT,
    "companyCnpj" VARCHAR(14) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Contact_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Note" (
    "id" SERIAL NOT NULL,
    "content" TEXT NOT NULL,
    "authorId" INTEGER,
    "companyCnpj" VARCHAR(14),
    "companySectorId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Note_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Attachment" (
    "id" SERIAL NOT NULL,
    "companyCnpj" VARCHAR(14) NOT NULL,
    "driveFileId" TEXT,
    "url" TEXT,
    "filename" TEXT,
    "mimetype" TEXT,
    "size" INTEGER,
    "uploadedBy" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Attachment_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Certificate" (
    "id" SERIAL NOT NULL,
    "companyCnpj" VARCHAR(14) NOT NULL,
    "driveFileId" TEXT NOT NULL,
    "filename" TEXT,
    "mimetype" TEXT,
    "size" INTEGER,
    "uploadedBy" INTEGER,
    "uploadedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "subject" TEXT,
    "issuer" TEXT,
    "serialNumber" TEXT,
    "validFrom" TIMESTAMP(3),
    "validTo" TIMESTAMP(3),
    "status" "CertificateStatus" NOT NULL DEFAULT 'UNKNOWN',
    "lastCheckedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "deletedAt" TIMESTAMP(3),

    CONSTRAINT "Certificate_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AuditLog" (
    "id" SERIAL NOT NULL,
    "entity" TEXT NOT NULL,
    "entityId" INTEGER NOT NULL,
    "action" TEXT NOT NULL,
    "payload" JSONB,
    "userId" INTEGER,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AuditLog_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");

-- CreateIndex
CREATE UNIQUE INDEX "Company_sourceFormId_key" ON "Company"("sourceFormId");

-- CreateIndex
CREATE INDEX "CompanyQsa_companyCnpj_idx" ON "CompanyQsa"("companyCnpj");

-- CreateIndex
CREATE INDEX "CompanyActivity_companyCnpj_idx" ON "CompanyActivity"("companyCnpj");

-- CreateIndex
CREATE INDEX "CompanyActivity_cnaeCode_idx" ON "CompanyActivity"("cnaeCode");

-- CreateIndex
CREATE UNIQUE INDEX "Sector_key_key" ON "Sector"("key");

-- CreateIndex
CREATE INDEX "CompanySector_companyCnpj_idx" ON "CompanySector"("companyCnpj");

-- CreateIndex
CREATE INDEX "CompanySector_sectorId_idx" ON "CompanySector"("sectorId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanySector_companyCnpj_sectorId_key" ON "CompanySector"("companyCnpj", "sectorId");

-- CreateIndex
CREATE UNIQUE INDEX "System_key_key" ON "System"("key");

-- CreateIndex
CREATE INDEX "CompanySystem_companyCnpj_idx" ON "CompanySystem"("companyCnpj");

-- CreateIndex
CREATE INDEX "CompanySystem_systemId_idx" ON "CompanySystem"("systemId");

-- CreateIndex
CREATE UNIQUE INDEX "CompanySystem_companyCnpj_systemId_key" ON "CompanySystem"("companyCnpj", "systemId");

-- CreateIndex
CREATE INDEX "Contact_companyCnpj_idx" ON "Contact"("companyCnpj");

-- CreateIndex
CREATE INDEX "Contact_email_idx" ON "Contact"("email");

-- CreateIndex
CREATE UNIQUE INDEX "Attachment_driveFileId_key" ON "Attachment"("driveFileId");

-- CreateIndex
CREATE INDEX "Attachment_companyCnpj_idx" ON "Attachment"("companyCnpj");

-- CreateIndex
CREATE UNIQUE INDEX "Certificate_driveFileId_key" ON "Certificate"("driveFileId");

-- CreateIndex
CREATE INDEX "Certificate_companyCnpj_idx" ON "Certificate"("companyCnpj");

-- CreateIndex
CREATE INDEX "Certificate_validTo_idx" ON "Certificate"("validTo");

-- AddForeignKey
ALTER TABLE "Form" ADD CONSTRAINT "Form_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Company" ADD CONSTRAINT "Company_sourceFormId_fkey" FOREIGN KEY ("sourceFormId") REFERENCES "Form"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyQsa" ADD CONSTRAINT "CompanyQsa_companyCnpj_fkey" FOREIGN KEY ("companyCnpj") REFERENCES "Company"("cnpj") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanyActivity" ADD CONSTRAINT "CompanyActivity_companyCnpj_fkey" FOREIGN KEY ("companyCnpj") REFERENCES "Company"("cnpj") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySector" ADD CONSTRAINT "CompanySector_companyCnpj_fkey" FOREIGN KEY ("companyCnpj") REFERENCES "Company"("cnpj") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySector" ADD CONSTRAINT "CompanySector_sectorId_fkey" FOREIGN KEY ("sectorId") REFERENCES "Sector"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySector" ADD CONSTRAINT "CompanySector_ownerId_fkey" FOREIGN KEY ("ownerId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySystem" ADD CONSTRAINT "CompanySystem_companyCnpj_fkey" FOREIGN KEY ("companyCnpj") REFERENCES "Company"("cnpj") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "CompanySystem" ADD CONSTRAINT "CompanySystem_systemId_fkey" FOREIGN KEY ("systemId") REFERENCES "System"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Contact" ADD CONSTRAINT "Contact_companyCnpj_fkey" FOREIGN KEY ("companyCnpj") REFERENCES "Company"("cnpj") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_authorId_fkey" FOREIGN KEY ("authorId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_companyCnpj_fkey" FOREIGN KEY ("companyCnpj") REFERENCES "Company"("cnpj") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Note" ADD CONSTRAINT "Note_companySectorId_fkey" FOREIGN KEY ("companySectorId") REFERENCES "CompanySector"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Attachment" ADD CONSTRAINT "Attachment_companyCnpj_fkey" FOREIGN KEY ("companyCnpj") REFERENCES "Company"("cnpj") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_uploadedBy_fkey" FOREIGN KEY ("uploadedBy") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Certificate" ADD CONSTRAINT "Certificate_companyCnpj_fkey" FOREIGN KEY ("companyCnpj") REFERENCES "Company"("cnpj") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "AuditLog" ADD CONSTRAINT "AuditLog_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
