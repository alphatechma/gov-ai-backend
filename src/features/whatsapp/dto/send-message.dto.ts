import {
  IsString,
  IsNotEmpty,
  IsOptional,
  IsBoolean,
  IsArray,
  IsUUID,
} from 'class-validator';

export class SendMessageDto {
  @IsUUID()
  @IsNotEmpty()
  connectionId: string;

  @IsString()
  @IsNotEmpty()
  phone: string;

  @IsString()
  @IsNotEmpty()
  content: string;

  @IsString()
  @IsOptional()
  quotedId?: string;
}

export class BroadcastDto {
  @IsUUID()
  @IsNotEmpty()
  connectionId: string;

  @IsArray()
  @IsString({ each: true })
  @IsNotEmpty()
  phones: string[];

  @IsString()
  @IsNotEmpty()
  content: string;
}

export class CreateConnectionDto {
  @IsString()
  @IsOptional()
  label?: string;
}

export class UpdateConnectionDto {
  @IsString()
  @IsOptional()
  label?: string;

  @IsBoolean()
  @IsOptional()
  isDefault?: boolean;
}
