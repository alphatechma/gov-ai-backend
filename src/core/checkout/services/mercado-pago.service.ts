import { Injectable, InternalServerErrorException, Logger } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import axios from 'axios';
import { randomUUID } from 'crypto';
import { MercadoPagoConfig, PreApproval, Preference, Payment } from 'mercadopago';

export interface CreatePreferenceParams {
  sessionId: string;
  payer: { name: string; email: string };
  items: Array<{ title: string; quantity: number; unitPrice: number }>;
  backUrls: { success: string; pending: string; failure: string };
  notificationUrl: string;
  metadata?: Record<string, unknown>;
}

export interface CreatePreapprovalParams {
  sessionId: string;
  reason: string;
  payerEmail: string;
  backUrl: string;
  notificationUrl: string;
  transactionAmount: number;
  frequency: number;
  frequencyType: 'months' | 'days';
}

export interface MpPaymentLookup {
  id: string;
  status?: string;
  status_detail?: string;
  external_reference?: string;
  transaction_amount?: number;
  metadata?: Record<string, unknown>;
  preapproval_id?: string;
  raw: Record<string, unknown>;
}

export interface MpAuthorizedPaymentLookup {
  id: string;
  preapprovalId?: string;
  paymentId?: string;
  paymentStatus?: string;
  transactionAmount?: number;
  raw: Record<string, unknown>;
}

export interface MpPreapprovalLookup {
  id: string;
  status?: string;
  payerEmail?: string;
  externalReference?: string;
  transactionAmount?: number;
  raw: Record<string, unknown>;
}

export interface MpMerchantOrderPayment {
  id: string;
  status?: string;
}

export interface MpMerchantOrderLookup {
  id: string;
  status?: string;
  externalReference?: string;
  preferenceId?: string;
  payments: MpMerchantOrderPayment[];
  raw: Record<string, unknown>;
}

@Injectable()
export class MercadoPagoService {
  private readonly logger = new Logger(MercadoPagoService.name);
  private readonly client: MercadoPagoConfig;
  private readonly preApproval: PreApproval;
  private readonly preference: Preference;
  private readonly payment: Payment;

  constructor(private configService: ConfigService) {
    const accessToken = this.configService.get<string>(
      'MERCADO_PAGO_ACCESS_TOKEN',
    );
    if (!accessToken) {
      throw new InternalServerErrorException(
        'MERCADO_PAGO_ACCESS_TOKEN não configurado',
      );
    }
    this.client = new MercadoPagoConfig({ accessToken });
    this.preApproval = new PreApproval(this.client);
    this.preference = new Preference(this.client);
    this.payment = new Payment(this.client);
  }

  async createPreference(params: CreatePreferenceParams) {
    const result = await this.preference.create({
      body: {
        items: params.items.map((item, index) => ({
          id: `${params.sessionId}-${index}`,
          title: item.title,
          quantity: item.quantity,
          unit_price: item.unitPrice,
          currency_id: 'BRL',
        })),
        payer: {
          name: params.payer.name,
          email: params.payer.email,
        },
        payment_methods: {
          excluded_payment_types: [],
          excluded_payment_methods: [],
          installments: 1,
        },
        back_urls: params.backUrls,
        auto_return: 'approved',
        external_reference: params.sessionId,
        notification_url: params.notificationUrl,
        metadata: params.metadata,
      },
      requestOptions: { idempotencyKey: randomUUID() },
    });

    const id = result.id;
    const initPoint = result.init_point ?? result.sandbox_init_point;
    if (!id || !initPoint) {
      throw new InternalServerErrorException(
        'Mercado Pago não retornou id/init_point para a preference',
      );
    }

    return {
      id,
      initPoint,
      sandboxInitPoint: result.sandbox_init_point,
    };
  }

  async createPreapproval(params: CreatePreapprovalParams) {
    const result = await this.preApproval.create({
      body: {
        reason: params.reason,
        external_reference: params.sessionId,
        payer_email: params.payerEmail,
        back_url: params.backUrl,
        status: 'pending',
        auto_recurring: {
          frequency: params.frequency,
          frequency_type: params.frequencyType,
          transaction_amount: params.transactionAmount,
          currency_id: 'BRL',
        },
      },
    });

    const id = result.id;
    const initPoint = result.init_point;
    if (!id || !initPoint) {
      throw new InternalServerErrorException(
        'Mercado Pago não retornou id/init_point para a preapproval',
      );
    }

    await this.registerNotificationUrl(id, params.notificationUrl).catch(
      (err) => {
        this.logger.warn(
          `Falha ao registrar notification_url no preapproval ${id}: ${(err as Error).message}`,
        );
      },
    );

    return {
      id,
      initPoint,
      status: result.status,
    };
  }

  async updatePreapprovalAmount(id: string, amount: number): Promise<void> {
    await this.preApproval.update({
      id,
      body: {
        auto_recurring: {
          frequency: 1,
          frequency_type: 'months',
          transaction_amount: amount,
          currency_id: 'BRL',
        },
      } as never,
    });
  }

  async cancelPreapproval(id: string): Promise<void> {
    await this.preApproval.update({
      id,
      body: { status: 'cancelled' } as never,
    });
  }

  async refundPayment(paymentId: string): Promise<void> {
    const accessToken = this.configService.get<string>(
      'MERCADO_PAGO_ACCESS_TOKEN',
    );
    await axios.post(
      `https://api.mercadopago.com/v1/payments/${encodeURIComponent(paymentId)}/refunds`,
      {},
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
          'X-Idempotency-Key': `refund-${paymentId}`,
        },
        timeout: 15000,
      },
    );
  }

  async getPayment(id: string): Promise<MpPaymentLookup> {
    const result = await this.payment.get({ id });
    return {
      id: String(result.id ?? id),
      status: result.status,
      status_detail: (result as unknown as { status_detail?: string })
        .status_detail,
      external_reference: result.external_reference,
      transaction_amount: result.transaction_amount,
      metadata: (result.metadata ?? undefined) as
        | Record<string, unknown>
        | undefined,
      raw: result as unknown as Record<string, unknown>,
    };
  }

  async getPreapproval(id: string): Promise<MpPreapprovalLookup> {
    const result = await this.preApproval.get({ id });
    return {
      id: String(result.id ?? id),
      status: result.status,
      payerEmail: result.payer_email,
      externalReference: result.external_reference,
      transactionAmount: result.auto_recurring?.transaction_amount,
      raw: result as unknown as Record<string, unknown>,
    };
  }

  async getMerchantOrder(id: string): Promise<MpMerchantOrderLookup> {
    const accessToken = this.configService.get<string>(
      'MERCADO_PAGO_ACCESS_TOKEN',
    );
    const { data } = await axios.get(
      `https://api.mercadopago.com/merchant_orders/${encodeURIComponent(id)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 15000,
      },
    );
    const payments = Array.isArray(data.payments)
      ? (data.payments as Array<{ id: number | string; status?: string }>).map(
          (p) => ({ id: String(p.id), status: p.status }),
        )
      : [];
    return {
      id: String(data.id ?? id),
      status: data.status,
      externalReference: data.external_reference,
      preferenceId: data.preference_id,
      payments,
      raw: data,
    };
  }

  async getAuthorizedPayment(id: string): Promise<MpAuthorizedPaymentLookup> {
    const accessToken = this.configService.get<string>(
      'MERCADO_PAGO_ACCESS_TOKEN',
    );
    const { data } = await axios.get(
      `https://api.mercadopago.com/authorized_payments/${encodeURIComponent(id)}`,
      {
        headers: { Authorization: `Bearer ${accessToken}` },
        timeout: 15000,
      },
    );
    return {
      id: String(data.id ?? id),
      preapprovalId: data.preapproval_id,
      paymentId: data.payment?.id ? String(data.payment.id) : undefined,
      paymentStatus: data.payment?.status ?? data.status,
      transactionAmount: data.transaction_amount,
      raw: data,
    };
  }

  private async registerNotificationUrl(
    preapprovalId: string,
    notificationUrl: string,
  ): Promise<void> {
    const accessToken = this.configService.get<string>(
      'MERCADO_PAGO_ACCESS_TOKEN',
    );
    await axios.put(
      `https://api.mercadopago.com/preapproval/${encodeURIComponent(preapprovalId)}`,
      { notification_url: notificationUrl },
      {
        headers: {
          Authorization: `Bearer ${accessToken}`,
          'Content-Type': 'application/json',
        },
        timeout: 15000,
      },
    );
  }
}
