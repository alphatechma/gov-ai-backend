import {
  IsString,
  IsOptional,
  IsNumber,
  Min,
  Max,
  MaxLength,
  MinLength,
  IsEnum,
} from 'class-validator';
import { BroadcastStatus } from '../entities/broadcast.entity';

export class UpdateBroadcastDto {
  @IsOptional()
  @IsString()
  @MinLength(1)
  @MaxLength(200)
  title?: string;

  @IsOptional()
  @IsString()
  @MaxLength(1000)
  description?: string;

  @IsOptional()
  @IsNumber()
  @Min(0)
  sent?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  failed?: number;

  @IsOptional()
  @IsNumber()
  @Min(0)
  pending?: number;

  /** Ex: "0.1 msg/min" */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  speed?: string;

  /** 0 a 100 */
  @IsOptional()
  @IsNumber()
  @Min(0)
  @Max(100)
  successRate?: number;

  /** Ex: "2h 30min" */
  @IsOptional()
  @IsString()
  @MaxLength(50)
  estimatedTime?: string;

  @IsOptional()
  @IsEnum(BroadcastStatus)
  status?: BroadcastStatus;
}
