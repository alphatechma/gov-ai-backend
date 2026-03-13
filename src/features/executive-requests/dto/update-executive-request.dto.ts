import { PartialType } from '@nestjs/swagger';
import { CreateExecutiveRequestDto } from './create-executive-request.dto';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { RequestStatus } from '../../../shared/enums/features';

export class UpdateExecutiveRequestDto extends PartialType(
  CreateExecutiveRequestDto,
) {
  @IsEnum(RequestStatus) @IsOptional() status?: RequestStatus;
  @IsString() @IsOptional() response?: string;
}
