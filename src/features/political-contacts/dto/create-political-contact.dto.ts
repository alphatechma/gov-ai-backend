import { IsEnum, IsNotEmpty, IsOptional, IsString } from 'class-validator';
import { ContactRole, ContactRelationship } from '../../../shared/enums/features';

export class CreatePoliticalContactDto {
  @IsString() @IsNotEmpty() name: string;
  @IsString() @IsOptional() phone?: string;
  @IsString() @IsOptional() email?: string;
  @IsEnum(ContactRole) role: ContactRole;
  @IsEnum(ContactRelationship) @IsOptional() relationship?: ContactRelationship;
  @IsString() @IsOptional() party?: string;
  @IsString() @IsOptional() city?: string;
  @IsString() @IsOptional() state?: string;
  @IsString() @IsOptional() notes?: string;
}
