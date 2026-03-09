import { PartialType } from '@nestjs/swagger';
import { CreateVotingRecordDto } from './create-voting-record.dto';

export class UpdateVotingRecordDto extends PartialType(CreateVotingRecordDto) {}
