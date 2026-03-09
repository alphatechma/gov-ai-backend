import { IsArray, IsDateString, IsEnum, IsNotEmpty, IsNumber, IsOptional, IsString, IsUUID } from 'class-validator';
import { AppointmentType } from '../../../shared/enums/features';

export class CreateAppointmentDto {
  @IsString() @IsNotEmpty() title: string;
  @IsString() @IsOptional() description?: string;
  @IsEnum(AppointmentType) type: AppointmentType;
  @IsDateString() startDate: string;
  @IsDateString() @IsOptional() endDate?: string;
  @IsString() @IsOptional() location?: string;
  @IsNumber() @IsOptional() latitude?: number;
  @IsNumber() @IsOptional() longitude?: number;
  @IsUUID() @IsOptional() voterId?: string;
  @IsUUID() @IsOptional() leaderId?: string;
  @IsArray() @IsOptional() reminders?: any[];
  @IsString() @IsOptional() notes?: string;
}
