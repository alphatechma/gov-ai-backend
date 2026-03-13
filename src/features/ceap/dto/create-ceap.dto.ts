import {
  IsDateString,
  IsEnum,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  Min,
} from 'class-validator';
import {
  ExpenseCategory,
  TransactionType,
  TransactionStatus,
} from '../../../shared/enums/features';

export class CreateCeapDto {
  @IsEnum(TransactionType) type: TransactionType;
  @IsEnum(TransactionStatus) @IsOptional() status?: TransactionStatus;
  @IsString() @IsNotEmpty() description: string;
  @IsEnum(ExpenseCategory) category: ExpenseCategory;
  @IsNumber() @Min(0) value: number;
  @IsDateString() date: string;
  @IsString() @IsOptional() supplier?: string;
  @IsString() @IsOptional() supplierCnpj?: string;
  @IsString() @IsOptional() receiptUrl?: string;
}
