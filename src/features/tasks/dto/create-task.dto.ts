import { IsDateString, IsEnum, IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';
import { TaskPriority } from '../../../shared/enums/features';

export class CreateTaskDto {
  @IsString() @IsNotEmpty() title: string;
  @IsString() @IsOptional() description?: string;
  @IsEnum(TaskPriority) @IsOptional() priority?: TaskPriority;
  @IsUUID() @IsOptional() assigneeId?: string;
  @IsDateString() @IsOptional() dueDate?: string;
  @IsString() @IsOptional() column?: string;
  @IsInt() @Min(0) @IsOptional() position?: number;
}
