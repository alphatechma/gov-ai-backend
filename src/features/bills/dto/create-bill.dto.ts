import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { BillType, BillAuthorship } from '../../../shared/enums/features';

export class CreateBillDto {
  @IsString() @IsOptional() number?: string;
  @IsString() @IsNotEmpty() title: string;
  @IsString() @IsOptional() summary?: string;
  @IsEnum(BillType) type: BillType;
  @IsEnum(BillAuthorship) @IsOptional() authorship?: BillAuthorship;
  @IsString() @IsOptional() committee?: string;
  @IsString() @IsOptional() documentUrl?: string;
}
