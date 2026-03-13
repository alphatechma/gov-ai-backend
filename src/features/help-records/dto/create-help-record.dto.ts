import {
  IsArray,
  IsDateString,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';

export class CreateHelpRecordDto {
  @IsUUID() @IsOptional() voterId?: string;
  @IsString() @IsNotEmpty() type: string;
  @IsString() @IsOptional() category?: string;
  @IsString() @IsOptional() observations?: string;
  @IsUUID() @IsOptional() responsibleId?: string;
  @IsUUID() @IsOptional() leaderId?: string;
  @IsDateString() @IsOptional() date?: string;
  @IsArray() @IsOptional() documents?: string[];
}
