import { PartialType } from '@nestjs/swagger';
import { CreateTaskDto } from './create-task.dto';
import { IsDateString, IsEnum, IsOptional } from 'class-validator';
import { TaskStatus } from '../../../shared/enums/features';

export class UpdateTaskDto extends PartialType(CreateTaskDto) {
  @IsEnum(TaskStatus) @IsOptional() status?: TaskStatus;
  @IsDateString() @IsOptional() completedAt?: string;
}
