import {
  IsDateString,
  IsEnum,
  IsOptional,
  IsString,
} from 'class-validator';

export enum ReportType {
  VOTERS = 'VOTERS',
  LEADERS = 'LEADERS',
  HELP_RECORDS = 'HELP_RECORDS',
  VISITS = 'VISITS',
  TASKS = 'TASKS',
  APPOINTMENTS = 'APPOINTMENTS',
  BILLS = 'BILLS',
  AMENDMENTS = 'AMENDMENTS',
  CEAP = 'CEAP',
  EXECUTIVE_REQUESTS = 'EXECUTIVE_REQUESTS',
  ELECTION_RESULTS = 'ELECTION_RESULTS',
  POLITICAL_CONTACTS = 'POLITICAL_CONTACTS',
  STAFF = 'STAFF',
  GENERAL = 'GENERAL',
}

export enum ReportFormat {
  JSON = 'JSON',
  CSV = 'CSV',
}

export class GenerateReportDto {
  @IsEnum(ReportType)
  type: ReportType;

  @IsEnum(ReportFormat)
  @IsOptional()
  format?: ReportFormat;

  @IsDateString()
  @IsOptional()
  startDate?: string;

  @IsDateString()
  @IsOptional()
  endDate?: string;

  @IsString()
  @IsOptional()
  filters?: string; // JSON string com filtros específicos do módulo
}
