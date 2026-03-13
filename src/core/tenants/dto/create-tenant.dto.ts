import {
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  Matches,
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

  @IsString()
  @IsOptional()
  bannerUrl?: string;

  @IsString()
  @IsOptional()
  faviconUrl?: string;

  @IsString()
  @IsOptional()
  appName?: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'primaryColor must be a valid hex color (e.g. #1a56db)',
  })
  primaryColor?: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'primaryColorDark must be a valid hex color',
  })
  primaryColorDark?: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'loginBgColor must be a valid hex color',
  })
  loginBgColor?: string;

  @IsOptional()
  @Matches(/^#[0-9a-fA-F]{6}$/, {
    message: 'loginBgColorEnd must be a valid hex color',
  })
  loginBgColorEnd?: string;

  @IsUUID()
  @IsOptional()
  planId?: string;
}
