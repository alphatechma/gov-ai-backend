import { IsArray, IsNotEmpty, IsNumber, IsOptional, IsString, Min } from 'class-validator';

export class CreateAmendmentDto {
  @IsString() @IsOptional() code?: string;
  @IsString() @IsNotEmpty() description: string;
  @IsNumber() @Min(0) value: number;
  @IsString() @IsOptional() beneficiary?: string;
  @IsString() @IsOptional() city?: string;
  @IsArray() @IsOptional() documents?: string[];
}
