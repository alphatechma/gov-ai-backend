import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  MaxLength,
} from 'class-validator';
import { PoliticalProfile } from '../../../shared/enums';

export class CreateSignupTenantDto {
  @IsString()
  @IsNotEmpty()
  @MaxLength(120)
  name: string;

  @IsEnum(PoliticalProfile)
  politicalProfile: PoliticalProfile;

  @IsString()
  @IsNotEmpty()
  @MaxLength(2)
  state: string;

  @IsString()
  @IsOptional()
  @MaxLength(60)
  party?: string;

  @IsString()
  @IsOptional()
  @MaxLength(120)
  city?: string;
}
