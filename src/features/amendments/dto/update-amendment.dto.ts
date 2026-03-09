import { PartialType } from '@nestjs/swagger';
import { CreateAmendmentDto } from './create-amendment.dto';
import { IsEnum, IsInt, IsOptional, Max, Min } from 'class-validator';
import { AmendmentStatus } from '../../../shared/enums/features';

export class UpdateAmendmentDto extends PartialType(CreateAmendmentDto) {
  @IsEnum(AmendmentStatus) @IsOptional() status?: AmendmentStatus;
  @IsInt() @Min(0) @Max(100) @IsOptional() executionPercentage?: number;
}
