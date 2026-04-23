import { Type } from 'class-transformer';
import { IsEnum, IsInt, IsOptional, IsString, Min } from 'class-validator';
import { LeadFunnelStatus } from '../../../shared/enums';

export class ListLeadsDto {
  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  page?: number;

  @Type(() => Number)
  @IsInt()
  @Min(1)
  @IsOptional()
  limit?: number;

  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  email?: string;

  @IsString()
  @IsOptional()
  phone?: string;

  @IsEnum(LeadFunnelStatus)
  @IsOptional()
  funnelStatus?: LeadFunnelStatus;

  @IsString()
  @IsOptional()
  source?: string;
}
