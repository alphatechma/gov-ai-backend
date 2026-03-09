import { PartialType } from '@nestjs/swagger';
import { CreateBillDto } from './create-bill.dto';
import { IsEnum, IsOptional } from 'class-validator';
import { BillStatus } from '../../../shared/enums/features';

export class UpdateBillDto extends PartialType(CreateBillDto) {
  @IsEnum(BillStatus) @IsOptional() status?: BillStatus;
}
