import { BillingCycle, MpResourceType } from '../../../shared/enums';

export class CheckoutSessionResponseDto {
  checkoutSessionId: string;
  mpResourceType: MpResourceType;
  mpResourceId: string;
  initPoint: string;
  sandboxInitPoint?: string;
  billingCycle: BillingCycle;
  amounts: {
    adhesion: number;
    plan: number;
    firstCharge: number;
    recurring: number | null;
    currency: 'BRL';
  };
}
