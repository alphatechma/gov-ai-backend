import { IsInt, IsOptional, IsString, Min } from 'class-validator';
import { Type } from 'class-transformer';

export class ElectionQueryDto {
  @IsInt() @Min(2000) @IsOptional() @Type(() => Number) electionYear?: number;
  @IsInt() @Min(1) @IsOptional() @Type(() => Number) round?: number;
  @IsString() @IsOptional() candidateName?: string;
  @IsString() @IsOptional() zone?: string;
}
