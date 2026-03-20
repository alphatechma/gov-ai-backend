import { IsString, IsOptional, IsUUID, IsDateString } from 'class-validator';

export class CreateCabinetVisitDto {
  @IsUUID()
  @IsOptional()
  visitorId?: string;

  @IsUUID()
  @IsOptional()
  voterId?: string;

  @IsString()
  @IsOptional()
  purpose?: string;

  @IsString()
  @IsOptional()
  attendedBy?: string;

  @IsDateString()
  @IsOptional()
  checkInAt?: string;

  @IsString()
  @IsOptional()
  observations?: string;
}
