import { PartialType } from '@nestjs/swagger';
import { CreateCeapDto } from './create-ceap.dto';

export class UpdateCeapDto extends PartialType(CreateCeapDto) {}
