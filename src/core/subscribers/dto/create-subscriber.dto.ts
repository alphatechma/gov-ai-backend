import {
  IsBoolean,
  IsDateString,
  IsOptional,
  IsUUID,
} from 'class-validator';

export class CreateSubscriberDto {
  @IsUUID()
  leadId: string;

  @IsUUID()
  planId: string;

  @IsUUID()
  @IsOptional()
  userId?: string | null;

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsDateString()
  startDate: string;

  @IsDateString()
  @IsOptional()
  endDate?: string | null;
}
