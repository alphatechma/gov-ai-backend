import { PartialType } from '@nestjs/swagger';
import { CreateProjectDto } from './create-project.dto';
import { IsEnum, IsInt, IsOptional, Min } from 'class-validator';
import { ProjectStatus } from '../../../shared/enums/features';

export class UpdateProjectDto extends PartialType(CreateProjectDto) {
  @IsEnum(ProjectStatus) @IsOptional() status?: ProjectStatus;
  @IsInt() @Min(0) @IsOptional() votesFor?: number;
  @IsInt() @Min(0) @IsOptional() votesAgainst?: number;
}
