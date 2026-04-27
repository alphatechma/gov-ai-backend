import { Injectable, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios, { AxiosError } from 'axios';

export interface SendHtmlInput {
  to: string;
  subject: string;
  html: string;
}

const RETRY_DELAYS_MS = [200, 1000, 3000];

@Injectable()
export class MailService {
  private readonly logger = new Logger(MailService.name);

  constructor(private configService: ConfigService) {}

  async sendHtml({ to, subject, html }: SendHtmlInput): Promise<void> {
    const url = this.configService.get<string>('MAIL_SERVICE_URL');
    const apiKey = this.configService.get<string>('MAIL_SERVICE_API_KEY');
    const senderEmail = this.configService.get<string>('MAIL_SENDER_EMAIL');
    const senderAppPassword = this.configService.get<string>(
      'MAIL_SENDER_APP_PASSWORD',
    );

    if (!url || !apiKey || !senderEmail || !senderAppPassword) {
      this.logger.error(
        'Configuração do serviço de email incompleta — email não enviado',
        { to, subject },
      );
      return;
    }

    const body = {
      senderEmail,
      senderAppPassword,
      recipients: [to],
      subject,
      body: html,
      html: true,
    };

    let lastError: unknown;
    for (let attempt = 0; attempt <= RETRY_DELAYS_MS.length; attempt++) {
      try {
        await axios.post(url, body, {
          headers: {
            'Content-Type': 'application/json',
            'X-API-Key': apiKey,
          },
          timeout: 15000,
        });
        if (attempt > 0) {
          this.logger.log(
            `Email enviado após ${attempt} retentativa(s) (to=${to})`,
          );
        }
        return;
      } catch (err) {
        lastError = err;
        const status = (err as AxiosError)?.response?.status;
        const isRetryable = !status || status >= 500;
        const nextDelay = RETRY_DELAYS_MS[attempt];
        if (!isRetryable || nextDelay === undefined) break;
        await new Promise((r) => setTimeout(r, nextDelay));
      }
    }

    const status = (lastError as AxiosError)?.response?.status;
    const data = (lastError as AxiosError)?.response?.data;
    this.logger.error(
      `Falha ao enviar email (to=${to}, subject=${subject}, status=${status})`,
      typeof data === 'object' ? JSON.stringify(data) : String(data),
    );
  }
}
