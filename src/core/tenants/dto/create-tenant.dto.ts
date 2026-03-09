import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { PoliticalProfile } from '../../../shared/enums';

export class CreateTenantDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsString()
  @IsNotEmpty()
  slug: string;

  @IsEnum(PoliticalProfile)
  politicalProfile: PoliticalProfile;

  @IsString()
  @IsOptional()
  party?: string;

  @IsString()
  @IsNotEmpty()
  state: string;

  @IsString()
  @IsOptional()
  city?: string;

  @IsString()
  @IsOptional()
  logoUrl?: string;

  @IsUUID()
  @IsOptional()
  planId?: string;
}
