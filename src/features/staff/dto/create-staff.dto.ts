import { IsDateString, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateStaffDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsOptional() role?: string;
  @IsString() @IsOptional() position?: string;
  @IsString() @IsOptional() phone?: string;
  @IsString() @IsOptional() email?: string;
  @IsNumber() @Min(0) @IsOptional() salary?: number;
  @IsDateString() @IsOptional() startDate?: string;
}
