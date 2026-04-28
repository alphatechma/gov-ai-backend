import { Injectable } from '@nestjs/common';
import { ConfigService } from '@nestjs/config';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes, createHash } from 'crypto';
import { SignupToken, SignupStep } from '../entities/signup-token.entity';

export interface GeneratedSignupToken {
  plaintext: string;
  token: SignupToken;
}

export type SignupTokenValidationResult =
  | { valid: true; token: SignupToken }
  | { valid: false; reason: 'not_found' | 'expired' | 'used' };

@Injectable()
export class SignupTokenService {
  constructor(
    @InjectRepository(SignupToken)
    private tokensRepo: Repository<SignupToken>,
    private configService: ConfigService,
  ) {}

  async generate(checkoutSessionId: string): Promise<GeneratedSignupToken> {
    const plaintext = randomBytes(32).toString('base64url');
    const tokenHash = this.hash(plaintext);
    const ttlHours = Number(
      this.configService.get('SIGNUP_TOKEN_TTL_HOURS') ?? 72,
    );
    const expiresAt = new Date(Date.now() + ttlHours * 60 * 60 * 1000);

    const token = this.tokensRepo.create({
      checkoutSessionId,
      tokenHash,
      expiresAt,
    });
    const saved = await this.tokensRepo.save(token);
    return { plaintext, token: saved };
  }

  async validate(plaintext: string): Promise<SignupTokenValidationResult> {
    const tokenHash = this.hash(plaintext);
    const token = await this.tokensRepo.findOne({ where: { tokenHash } });
    if (!token) return { valid: false, reason: 'not_found' };
    if (token.usedAt) return { valid: false, reason: 'used' };
    if (token.expiresAt.getTime() < Date.now()) {
      return { valid: false, reason: 'expired' };
    }
    return { valid: true, token };
  }

  async markStep(
    tokenId: string,
    step: SignupStep,
    tenantId?: string,
  ): Promise<void> {
    const patch: Partial<SignupToken> = { currentStep: step };
    if (tenantId !== undefined) patch.tenantId = tenantId;
    await this.tokensRepo.update(tokenId, patch);
  }

  async complete(tokenId: string): Promise<void> {
    await this.tokensRepo.update(tokenId, {
      currentStep: 'COMPLETED',
      usedAt: new Date(),
    });
  }

  private hash(plaintext: string): string {
    const pepper = this.configService.get<string>('CHECKOUT_TOKEN_PEPPER') ?? '';
    return createHash('sha256').update(plaintext + pepper).digest('hex');
  }
}
