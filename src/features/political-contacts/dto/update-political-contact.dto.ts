import { PartialType } from '@nestjs/swagger';
import { CreatePoliticalContactDto } from './create-political-contact.dto';

export class UpdatePoliticalContactDto extends PartialType(
  CreatePoliticalContactDto,
) {}
