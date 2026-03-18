import {
  IsArray,
  IsDateString,
  IsEnum,
  IsNumber,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { VisitStatus } from '../../../shared/enums/features';

export class CreateVisitDto {
  @IsUUID() @IsOptional() voterId?: string;
  @IsUUID() @IsOptional() leaderId?: string;
  @IsString() @IsOptional() visitorName?: string;
  @IsDateString() date: string;
  @IsString() @IsOptional() visitorAddress?: string;
  @IsString() @IsOptional() areaType?: string;
  @IsString() @IsOptional() district?: string;
  @IsString() @IsOptional() neighborhood?: string;
  @IsString() @IsOptional() requestType?: string;
  @IsString() @IsOptional() requestTypeOther?: string;
  @IsString() @IsOptional() objective?: string;
  @IsString() @IsOptional() result?: string;
  @IsEnum(VisitStatus) @IsOptional() status?: VisitStatus;
  @IsString() @IsOptional() requestDescription?: string;
  @IsArray() @IsOptional() photos?: string[];
  @IsNumber() @IsOptional() latitude?: number;
  @IsNumber() @IsOptional() longitude?: number;
}
