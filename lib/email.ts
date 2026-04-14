import { Resend } from "resend";

const resend = new Resend(process.env.RESEND_API_KEY);

export async function sendProfitDistributionEmail(data: {
  companyName: string;
  companyCnpj: string;
  partnerName: string;
  status: string;
  amount?: number | null;
}) {
  await resend.emails.send({
    from: "CRM-OFFICE <tecnologia@office-ce.com.br>",
    to: process.env.EMAIL_TO!.split(","),
    subject: "🚨 Distribuição de lucro encerrada",
    html: `
      <h2>Distribuição de lucro atualizada</h2>

      <p><strong>Empresa:</strong> ${data.companyName}</p>
      <p><strong>CNPJ:</strong> ${data.companyCnpj}</p>
      <p><strong>Sócio:</strong> ${data.partnerName}</p>
      <p><strong>Status:</strong> ${data.status}</p>
      <p><strong>Valor:</strong> ${data.amount ?? "-"}</p>
    `,
  });
}