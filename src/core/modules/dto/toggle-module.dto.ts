import { IsBoolean, IsNotEmpty, IsOptional, IsString } from 'class-validator';

export class ToggleModuleDto {
  @IsString()
  @IsNotEmpty()
  moduleKey: string;

  @IsBoolean()
  enabled: boolean;

  @IsOptional()
  config?: Record<string, any>;
}
