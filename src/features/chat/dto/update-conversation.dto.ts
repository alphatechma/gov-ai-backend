import { IsOptional, IsString } from 'class-validator';

export class UpdateConversationDto {
  @IsString()
  @IsOptional()
  name?: string;

  @IsString()
  @IsOptional()
  avatarUrl?: string;
}
