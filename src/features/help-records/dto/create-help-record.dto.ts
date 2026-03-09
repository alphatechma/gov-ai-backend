import { IsArray, IsEnum, IsNotEmpty, IsOptional, IsString, IsUUID } from 'class-validator';
import { HelpCategory } from '../../../shared/enums/features';

export class CreateHelpRecordDto {
  @IsUUID() @IsOptional() voterId?: string;
  @IsEnum(HelpCategory) category: HelpCategory;
  @IsString() @IsNotEmpty() description: string;
  @IsUUID() @IsOptional() responsibleId?: string;
  @IsArray() @IsOptional() documents?: string[];
}
