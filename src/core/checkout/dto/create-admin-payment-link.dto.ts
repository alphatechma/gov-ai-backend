import { IsEnum, IsUUID } from 'class-validator';
import { PaymentType } from '../../../shared/enums';

export class CreateAdminPaymentLinkDto {
  @IsUUID()
  leadId: string;

  @IsUUID()
  planId: string;

  @IsEnum(PaymentType)
  paymentType: PaymentType;
}
