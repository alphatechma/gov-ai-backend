import { IsArray, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class CreateProjectDto {
  @IsString() @IsOptional() number?: string;
  @IsString() @IsNotEmpty() title: string;
  @IsString() @IsOptional() summary?: string;
  @IsArray() @IsOptional() timeline?: any[];
  @IsString() @IsOptional() pdfUrl?: string;
}
