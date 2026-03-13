import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
} from 'class-validator';
import { RequestType } from '../../../shared/enums/features';

export class CreateExecutiveRequestDto {
  @IsString() @IsOptional() protocolNumber?: string;
  @IsEnum(RequestType) type: RequestType;
  @IsString() @IsNotEmpty() subject: string;
  @IsString() @IsNotEmpty() description: string;
  @IsString() @IsOptional() recipientOrgan?: string;
  @IsDateString() @IsOptional() deadline?: string;
  @IsArray() @IsOptional() documents?: string[];
}
