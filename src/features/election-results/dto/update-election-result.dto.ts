import { PartialType } from '@nestjs/swagger';
import { CreateElectionResultDto } from './create-election-result.dto';

export class UpdateElectionResultDto extends PartialType(CreateElectionResultDto) {}
