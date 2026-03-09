import {
  IsArray,
  IsBoolean,
  IsInt,
  IsNotEmpty,
  IsNumber,
  IsOptional,
  IsString,
  ValidateNested,
} from 'class-validator';
import { Type } from 'class-transformer';

// === Chat ===

class ChatMessageDto {
  @IsString()
  role: 'user' | 'assistant';

  @IsString()
  content: string;
}

export class AiChatDto {
  @IsString()
  @IsNotEmpty()
  message: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => ChatMessageDto)
  @IsOptional()
  conversationHistory?: ChatMessageDto[];

  @IsOptional()
  candidateContext?: Record<string, any>;

  @IsBoolean()
  @IsOptional()
  useContext?: boolean;
}

// === Análise Eleitoral ===

class CompetitorDto {
  @IsString() name: string;
  @IsNumber() votes: number;
}

export class AnalyzeElectionDto {
  @IsString() candidateName: string;
  @IsString() party: string;
  @IsNumber() totalVotes: number;
  @IsInt() year: number;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CompetitorDto)
  @IsOptional()
  competitors?: CompetitorDto[];
}

// === Comparação de Eleições ===

class ElectionDataDto {
  @IsString() party: string;
  @IsNumber() votes: number;
  @IsString() result: string;
  @IsArray() @IsOptional() municipalities?: string[];
}

export class CompareElectionsDto {
  @IsString() candidateName: string;

  @ValidateNested()
  @Type(() => ElectionDataDto)
  election1: ElectionDataDto;

  @IsInt() year1: number;

  @ValidateNested()
  @Type(() => ElectionDataDto)
  election2: ElectionDataDto;

  @IsInt() year2: number;
}

// === Simulação de Cenário ===

class CityVotesDto {
  @IsString() city: string;
  @IsNumber() votes: number;
}

export class SimulateScenarioDto {
  @IsString() candidateName: string;
  @IsString() party: string;
  @IsNumber() currentVotes: number;
  @IsString() scenarioName: string;
  @IsString() scenarioDetails: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CityVotesDto)
  @IsOptional()
  topCities?: CityVotesDto[];
}

// === Projeção ===

class CityResultDto {
  @IsString() city: string;
  @IsNumber() currentVotes: number;
  @IsNumber() projectedVotes: number;
  @IsNumber() difference: number;
  @IsString() percentChange: string;
}

export class AnalyzeProjectionDto {
  @IsString() candidateName: string;
  @IsString() party: string;
  @IsString() @IsOptional() number?: string;
  @IsNumber() currentVotes: number;
  @IsNumber() projectedVotes: number;
  @IsInt() currentRanking: number;
  @IsInt() projectedRanking: number;
  @IsInt() rankingChange: number;
  @IsNumber() @IsOptional() goalVotes?: number;
  @IsNumber() @IsOptional() goalProgress?: number;
  @IsString() @IsOptional() scenarioName?: string;

  @IsArray()
  @ValidateNested({ each: true })
  @Type(() => CityResultDto)
  @IsOptional()
  cityResults?: CityResultDto[];
}
