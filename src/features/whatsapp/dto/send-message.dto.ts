import { IsString, IsNotEmpty, IsOptional } from 'class-validator';

export class SendMessageDto {
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
  @IsString({ each: true })
  @IsNotEmpty()
  phones: string[];

  @IsString()
  @IsNotEmpty()
  content: string;
}
