import { IsArray, IsDateString, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';

export class CreateVisitDto {
  @IsUUID() @IsOptional() voterId?: string;
  @IsUUID() @IsOptional() leaderId?: string;
  @IsDateString() date: string;
  @IsString() @IsOptional() objective?: string;
  @IsString() @IsOptional() result?: string;
  @IsArray() @IsOptional() photos?: string[];
  @IsNumber() @IsOptional() latitude?: number;
  @IsNumber() @IsOptional() longitude?: number;
}
