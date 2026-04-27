import { BillingCycle } from '../../enums';

export interface SignupInvitationParams {
  firstName: string;
  planName: string;
  billingCycle: BillingCycle;
  ctaUrl: string;
  whatsappUrl?: string;
  ttlHours?: number;
}

const escapeHtml = (value: string): string =>
  value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');

export function buildSignupInvitationHtml(params: SignupInvitationParams): string {
  const {
    firstName,
    planName,
    billingCycle,
    ctaUrl,
    whatsappUrl,
    ttlHours = 72,
  } = params;

  const safeFirstName = escapeHtml(firstName || 'parlamentar');
  const safePlanName = escapeHtml(planName);
  const safeCtaUrl = escapeHtml(ctaUrl);
  const cycleLabel =
    billingCycle === BillingCycle.YEARLY ? 'anual' : 'mensal';

  const whatsappLine = whatsappUrl
    ? `<a href="${escapeHtml(whatsappUrl)}" style="color:#0066CC;text-decoration:none;">Fale com nosso time no WhatsApp</a>`
    : 'Em caso de dúvidas, responda este email.';

  return `<!DOCTYPE html>
<html lang="pt-BR">
  <head>
    <meta charset="UTF-8" />
    <meta name="viewport" content="width=device-width,initial-scale=1" />
    <title>Bem-vindo(a) à GoverneAI</title>
  </head>
  <body style="margin:0;padding:0;background:#F8FAFC;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Oxygen,Ubuntu,Cantarell,sans-serif;">
    <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background:#F8FAFC;">
      <tr>
        <td align="center" style="padding:32px 16px;">
          <table role="presentation" width="600" cellspacing="0" cellpadding="0" border="0" style="max-width:600px;width:100%;background:#FFFFFF;border-radius:12px;overflow:hidden;box-shadow:0 1px 3px rgba(15,23,42,0.08);">
            <tr>
              <td style="background:linear-gradient(135deg,#0066CC 0%,#004C99 100%);padding:32px 32px 28px 32px;text-align:left;">
                <p style="margin:0;color:#DBEAFE;font-size:12px;font-weight:600;letter-spacing:1.5px;text-transform:uppercase;">GoverneAI</p>
                <h1 style="margin:8px 0 0 0;color:#FFFFFF;font-size:24px;line-height:1.3;font-weight:700;">Pagamento confirmado</h1>
                <p style="margin:8px 0 0 0;color:#DBEAFE;font-size:14px;line-height:1.5;">Falta só mais um passo para você começar a usar a plataforma.</p>
              </td>
            </tr>
            <tr>
              <td style="padding:32px 32px 8px 32px;">
                <h2 style="margin:0 0 12px 0;color:#0F172A;font-size:22px;line-height:1.3;font-weight:700;">Olá, ${safeFirstName}!</h2>
                <p style="margin:0 0 16px 0;color:#1E293B;font-size:16px;line-height:1.6;">
                  Recebemos seu pagamento referente ao plano <strong style="color:#0F172A;">${safePlanName}</strong> (${cycleLabel}). Obrigado por confiar na GoverneAI para apoiar seu mandato.
                </p>
                <p style="margin:0 0 24px 0;color:#1E293B;font-size:16px;line-height:1.6;">
                  Para finalizar seu cadastro, criar seu acesso e configurar seu gabinete na plataforma, clique no botão abaixo:
                </p>
              </td>
            </tr>
            <tr>
              <td align="center" style="padding:0 32px 8px 32px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0">
                  <tr>
                    <td style="background:#0066CC;border-radius:8px;">
                      <a href="${safeCtaUrl}" style="display:inline-block;padding:14px 32px;color:#FFFFFF;font-size:16px;font-weight:600;text-decoration:none;border-radius:8px;">
                        Finalizar meu cadastro →
                      </a>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px 0 32px;">
                <p style="margin:0 0 8px 0;color:#64748B;font-size:13px;line-height:1.5;">
                  Se o botão não funcionar, copie e cole este link no seu navegador:
                </p>
                <p style="margin:0;color:#1E293B;font-size:13px;line-height:1.5;word-break:break-all;">
                  <a href="${safeCtaUrl}" style="color:#0066CC;text-decoration:underline;">${safeCtaUrl}</a>
                </p>
              </td>
            </tr>
            <tr>
              <td style="padding:24px 32px;">
                <div style="height:2px;background:#8B5CF6;opacity:0.6;"></div>
              </td>
            </tr>
            <tr>
              <td style="padding:0 32px 24px 32px;">
                <p style="margin:0 0 8px 0;color:#64748B;font-size:13px;line-height:1.5;">
                  <strong style="color:#0F172A;">Atenção:</strong> este link expira em ${ttlHours} horas por segurança.
                </p>
                <p style="margin:0;color:#64748B;font-size:13px;line-height:1.5;">
                  ${whatsappLine}
                </p>
              </td>
            </tr>
            <tr>
              <td style="background:#F8FAFC;padding:20px 32px;border-top:1px solid #E2E8F0;">
                <p style="margin:0;color:#64748B;font-size:12px;line-height:1.5;text-align:center;">
                  © GoverneAI. Todos os direitos reservados.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`;
}
