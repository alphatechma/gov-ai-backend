import {
  IsArray,
  IsEnum,
  IsNotEmpty,
  IsOptional,
  IsString,
  IsUUID,
  ArrayMinSize,
} from 'class-validator';
import { ConversationType } from '../entities/conversation.entity';

export class CreateDirectConversationDto {
  @IsUUID()
  participantId: string;
}

export class CreateGroupConversationDto {
  @IsString()
  @IsNotEmpty()
  name: string;

  @IsArray()
  @IsUUID('4', { each: true })
  @ArrayMinSize(1)
  participantIds: string[];

  @IsString()
  @IsOptional()
  avatarUrl?: string;
}
