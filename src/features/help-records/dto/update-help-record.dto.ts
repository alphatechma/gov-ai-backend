import { PartialType } from '@nestjs/swagger';
import { CreateHelpRecordDto } from './create-help-record.dto';
import { IsEnum, IsOptional, IsString } from 'class-validator';
import { HelpStatus } from '../../../shared/enums/features';

export class UpdateHelpRecordDto extends PartialType(CreateHelpRecordDto) {
  @IsEnum(HelpStatus) @IsOptional() status?: HelpStatus;
  @IsString() @IsOptional() resolution?: string;
}
