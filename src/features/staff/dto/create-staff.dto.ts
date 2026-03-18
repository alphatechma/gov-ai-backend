import {
  IsArray,
  IsBoolean,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
  MinLength,
} from 'class-validator';
import { UserRole } from '../../../shared/enums';

export class CreateStaffDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsOptional() role?: string;
  @IsString() @IsOptional() position?: string;
  @IsString() @IsOptional() phone?: string;
  @IsString() @IsOptional() email?: string;
  @IsNumber() @Min(0) @IsOptional() salary?: number;
  @IsDateString() @IsOptional() startDate?: string;
  @IsBoolean() @IsOptional() createAccess?: boolean;
  @IsString() @MinLength(6) @IsOptional() password?: string;
  @IsEnum(UserRole) @IsOptional() accessRole?: UserRole;
  @IsArray() @IsOptional() allowedModules?: string[];
}
