import { normalizeName, validCnpj } from './data-utils.mjs';
import { projectPartner } from './crm.mjs';

/** Cada mensagem é atômica. Nenhum valor financeiro ou cadastro de empresa é apagado. */
export class PrismaCRM {
  constructor(prisma) { this.prisma = prisma; }

  async updateCompanyInCRM(mailbox, alteration, year = 2026) {
    if (!mailbox || !alteration.messageId || !validCnpj(alteration.cnpj)
      || !alteration.changes?.length || Number.isNaN(Date.parse(alteration.sentAt))) {
      throw new Error('Alteração incompleta; importação cancelada.');
    }
    return this.prisma.$transaction(async tx => {
      // Serializa importações da mesma empresa.
      await tx.$executeRaw`SELECT pg_advisory_xact_lock(hashtextextended(${`qsa:${alteration.cnpj}`}, 0))`;
      if (await tx.gmailQsaImport.findUnique({ where: { mailbox_messageId: { mailbox, messageId: alteration.messageId } } })) {
        return { duplicate: true, companyCnpj: alteration.cnpj };
      }
      const company = await tx.company.findFirst({ where: { cnpj: alteration.cnpj, deletedAt: null }, select: { cnpj: true } });
      if (!company) throw new Error('Empresa não cadastrada ou excluída; concilie o CNPJ antes de importar.');
      const partners = await tx.profitPartner.findMany({ where: { companyCnpj: alteration.cnpj } });
      const resolved = [];
      for (const change of alteration.changes) {
        const matches = partners.filter(p => normalizeName(p.name) === normalizeName(change.name));
        if (matches.length > 1) throw new Error('Mais de um cadastro para o mesmo sócio; conciliação necessária.');
        let partner = matches[0];
        if (!partner) {
          partner = await tx.profitPartner.create({ data: {
            companyCnpj: alteration.cnpj, name: change.name, knownBeforeGmail: false,
          } });
          partners.push(partner);
        }
        resolved.push({ ...change, partnerId: partner.id });
      }
      await tx.gmailQsaImport.create({ data: {
        mailbox, messageId: alteration.messageId, companyCnpj: alteration.cnpj,
        sentAt: new Date(alteration.sentAt), payload: { ...alteration, changes: resolved },
      } });
      const imports = await tx.gmailQsaImport.findMany({ where: { companyCnpj: alteration.cnpj }, orderBy: { sentAt: 'asc' } });
      const updated = [];
      for (const partnerId of new Set(resolved.map(change => change.partnerId))) {
        const partner = partners.find(p => p.id === partnerId);
        const events = imports.flatMap(item => item.payload.changes
          .filter(change => change.partnerId === partnerId)
          .map(change => ({ ...change, sentAt: item.payload.sentAt, effectiveDate: item.payload.effectiveDate, messageId: item.messageId })));
        const projection = projectPartner(events, year, partner.knownBeforeGmail);
        await tx.profitPartner.update({ where: { id: partnerId }, data: { qsaPeriods: projection.periods } });
        updated.push({ id: partnerId, ...projection });
      }
      return { companyCnpj: alteration.cnpj, companyName: alteration.companyName, year, partners: updated };
    }, { maxWait: 15000, timeout: 30000 });
  }
}
