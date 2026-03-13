import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
  IsUUID,
} from 'class-validator';
import { VoteChoice, VoteResult } from '../../../shared/enums/features';

export class CreateVotingRecordDto {
  @IsString() @IsOptional() session?: string;
  @IsString() subject: string;
  @IsDateString() date: string;
  @IsEnum(VoteChoice) vote: VoteChoice;
  @IsEnum(VoteResult) @IsOptional() result?: VoteResult;
  @IsUUID() @IsOptional() billId?: string;
  @IsString() @IsOptional() notes?: string;
}
