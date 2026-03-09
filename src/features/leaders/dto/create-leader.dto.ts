import { IsInt, IsNotEmpty, IsOptional, IsString, IsUUID, Min } from 'class-validator';

export class CreateLeaderDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsOptional() cpf?: string;
  @IsString() @IsOptional() phone?: string;
  @IsString() @IsOptional() email?: string;
  @IsString() @IsOptional() region?: string;
  @IsString() @IsOptional() neighborhood?: string;
  @IsInt() @Min(0) @IsOptional() votersGoal?: number;
  @IsUUID() @IsOptional() userId?: string;
}
