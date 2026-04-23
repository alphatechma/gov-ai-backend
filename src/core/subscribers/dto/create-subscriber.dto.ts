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

  @IsBoolean()
  @IsOptional()
  active?: boolean;

  @IsDateString()
  startDate: string;

  @IsDateString()
  @IsOptional()
  endDate?: string | null;
}
