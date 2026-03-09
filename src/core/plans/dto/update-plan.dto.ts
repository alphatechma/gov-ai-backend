import { PartialType } from '@nestjs/swagger';
import { CreatePlanDto } from './create-plan.dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdatePlanDto extends PartialType(CreatePlanDto) {
  @IsBoolean()
  @IsOptional()
  active?: boolean;
}
