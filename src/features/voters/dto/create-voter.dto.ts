import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsNumber,
  IsArray,
  IsDateString,
  IsUUID,
} from 'class-validator';
import { SupportLevel, ConfidenceLevel } from '../../../shared/enums/features';

export class CreateVoterDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString() @IsOptional() cpf?: string;
  @IsString() @IsOptional() phone?: string;
  @IsString() @IsOptional() email?: string;
  @IsDateString() @IsOptional() birthDate?: string;
  @IsString() @IsOptional() gender?: string;
  @IsString() @IsOptional() address?: string;
  @IsString() @IsOptional() neighborhood?: string;
  @IsString() @IsOptional() city?: string;
  @IsString() @IsOptional() state?: string;
  @IsString() @IsOptional() zipCode?: string;
  @IsNumber() @IsOptional() latitude?: number;
  @IsNumber() @IsOptional() longitude?: number;
  @IsString() @IsOptional() voterRegistration?: string;
  @IsString() @IsOptional() votingZone?: string;
  @IsString() @IsOptional() votingSection?: string;
  @IsUUID() @IsOptional() leaderId?: string;
  @IsEnum(SupportLevel) @IsOptional() supportLevel?: SupportLevel;
  @IsEnum(ConfidenceLevel) @IsOptional() confidenceLevel?: ConfidenceLevel;
  @IsArray() @IsOptional() tags?: string[];
  @IsString() @IsOptional() notes?: string;
}
