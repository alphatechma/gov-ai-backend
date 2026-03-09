import {
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { BillingCycle } from '../../../shared/enums';

export class CreatePlanDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsInt()
  @Min(1)
  maxUsers: number;

  @IsNumber()
  @Min(0)
  price: number;

  @IsEnum(BillingCycle)
  @IsOptional()
  billingCycle?: BillingCycle;
}
