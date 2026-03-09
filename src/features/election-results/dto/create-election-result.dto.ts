import { IsBoolean, IsInt, IsOptional, IsString, Min } from 'class-validator';

export class CreateElectionResultDto {
  @IsInt() electionYear: number;
  @IsInt() @Min(1) @IsOptional() round?: number;
  @IsString() candidateName: string;
  @IsString() @IsOptional() candidateNumber?: string;
  @IsString() @IsOptional() candidateParty?: string;
  @IsBoolean() @IsOptional() isTenantCandidate?: boolean;
  @IsString() @IsOptional() zone?: string;
  @IsString() @IsOptional() section?: string;
  @IsString() @IsOptional() city?: string;
  @IsString() @IsOptional() state?: string;
  @IsString() @IsOptional() neighborhood?: string;
  @IsInt() @Min(0) candidateVotes: number;
  @IsInt() @Min(0) @IsOptional() totalVotes?: number;
  @IsString() @IsOptional() party?: string;
}
