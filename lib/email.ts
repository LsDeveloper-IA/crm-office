import { Resend } from "resend";

export async function sendProfitDistributionEmail(data: {
  companyName: string;
  companyCnpj: string;
  partnerName: string;
  status: string;
  amount?: number | null;
}) {
  const apiKey = process.env.RESEND_API_KEY;
  const recipients = process.env.EMAIL_TO?.split(",").map((email) => email.trim()).filter(Boolean);
  if (!apiKey || !recipients?.length) {
    console.warn("Profit distribution email skipped: missing email configuration.");
    return;
  }

  const resend = new Resend(apiKey);
  const { error } = await resend.emails.send({
    from: "CRM-OFFICE <tecnologia@office-ce.com.br>",
    to: recipients,
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
  if (error) throw new Error(error.message);
}