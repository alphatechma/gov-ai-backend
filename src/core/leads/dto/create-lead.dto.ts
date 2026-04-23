import {
  IsDateString,
  IsEmail,
  IsEnum,
  IsInt,
  IsNotEmpty,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import { LeadFunnelStatus } from '../../../shared/enums';

export class CreateLeadDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsEmail()
  email: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsOptional()
  notes?: string;

  @IsString()
  @IsOptional()
  source?: string;

  @IsEnum(LeadFunnelStatus)
  @IsOptional()
  funnelStatus?: LeadFunnelStatus;

  @IsDateString()
  @IsOptional()
  lastInteraction?: string;

  @IsDateString()
  @IsOptional()
  nextInteraction?: string;

  @IsInt()
  @Min(0)
  @IsOptional()
  contactAttempts?: number;
}
