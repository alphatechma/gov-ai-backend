import { PartialType } from '@nestjs/swagger';
import { CreateLeaderDto } from './create-leader.dto';
import { IsBoolean, IsOptional } from 'class-validator';

export class UpdateLeaderDto extends PartialType(CreateLeaderDto) {
  @IsBoolean() @IsOptional() active?: boolean;
}
