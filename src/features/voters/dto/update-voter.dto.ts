import { PartialType } from '@nestjs/swagger';
import { CreateVoterDto } from './create-voter.dto';

export class UpdateVoterDto extends PartialType(CreateVoterDto) {}
