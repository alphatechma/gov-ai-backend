import {
  BadRequestException,
  ConflictException,
  Injectable,
  Logger,
  NotFoundException,
} from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { randomBytes } from 'crypto';
import { CheckoutSession } from '../entities/checkout-session.entity';
import { SignupToken } from '../entities/signup-token.entity';
import { Lead } from '../../leads/lead.entity';
import { Plan } from '../../plans/plan.entity';
import { Tenant } from '../../tenants/tenant.entity';
import { Subscriber } from '../../subscribers/subscriber.entity';
import { TenantsService } from '../../tenants/tenants.service';
import { UsersService } from '../../users/users.service';
import { SignupTokenService } from './signup-token.service';
import { CreateSignupTenantDto } from '../dto/create-signup-tenant.dto';
import { CreateSignupUserDto } from '../dto/create-signup-user.dto';
import { UserRole } from '../../../shared/enums';

const SLUG_COLLISION_RETRIES = 5;

@Injectable()
export class CheckoutSignupService {
  private readonly logger = new Logger(CheckoutSignupService.name);

  constructor(
    @InjectRepository(CheckoutSession)
    private sessionsRepo: Repository<CheckoutSession>,
    @InjectRepository(SignupToken)
    private tokensRepo: Repository<SignupToken>,
    @InjectRepository(Lead)
    private leadsRepo: Repository<Lead>,
    @InjectRepository(Plan)
    private plansRepo: Repository<Plan>,
    @InjectRepository(Tenant)
    private tenantsRepo: Repository<Tenant>,
    @InjectRepository(Subscriber)
    private subscribersRepo: Repository<Subscriber>,
    private signupTokenService: SignupTokenService,
    private tenantsService: TenantsService,
    private usersService: UsersService,
  ) {}

  async describe(plaintextToken: string) {
    const result = await this.signupTokenService.validate(plaintextToken);
    if (!result.valid) {
      if (result.reason === 'not_found') {
        throw new NotFoundException('Token não encontrado');
      }
      return {
        valid: false as const,
        expired: result.reason === 'expired',
        used: result.reason === 'used',
      };
    }

    const token = result.token;
    const session = await this.sessionsRepo.findOne({
      where: { id: token.checkoutSessionId },
    });
    if (!session)
      throw new NotFoundException('Sessão de checkout não encontrada');

    const [lead, plan, tenant] = await Promise.all([
      this.leadsRepo.findOne({ where: { id: session.leadId } }),
      this.plansRepo.findOne({ where: { id: session.planId } }),
      token.tenantId
        ? this.tenantsRepo.findOne({ where: { id: token.tenantId } })
        : Promise.resolve(null),
    ]);

    return {
      valid: true as const,
      step: token.currentStep,
      lead: lead
        ? { name: lead.name, email: lead.email, phone: lead.phone }
        : null,
      plan: plan
        ? { id: plan.id, name: plan.name, billingCycle: plan.billingCycle }
        : null,
      tenant: tenant
        ? { id: tenant.id, name: tenant.name, slug: tenant.slug }
        : null,
    };
  }

  async createTenantStep(plaintextToken: string, dto: CreateSignupTenantDto) {
    const validation = await this.signupTokenService.validate(plaintextToken);
    if (!validation.valid) {
      throw new BadRequestException(
        validation.reason === 'expired'
          ? 'Link de cadastro expirado'
          : validation.reason === 'used'
            ? 'Link de cadastro já utilizado'
            : 'Link de cadastro inválido',
      );
    }
    const token = validation.token;

    if (token.currentStep === 'COMPLETED') {
      throw new BadRequestException('Cadastro já concluído');
    }

    if (token.tenantId) {
      const existingTenant = await this.tenantsRepo.findOne({
        where: { id: token.tenantId },
      });
      if (existingTenant) {
        if (token.currentStep !== 'USER') {
          await this.signupTokenService.markStep(token.id, 'USER');
        }
        return { tenant: existingTenant, nextStep: 'USER' as const };
      }
    }

    const session = await this.sessionsRepo.findOne({
      where: { id: token.checkoutSessionId },
    });
    if (!session)
      throw new NotFoundException('Sessão de checkout não encontrada');

    const tenant = await this.createTenantWithSlugRetry(dto, session.planId);

    await this.tenantsService.activatePlanModules(tenant.id, session.planId);
    await this.signupTokenService.markStep(token.id, 'USER', tenant.id);

    this.logger.log(
      `Tenant ${tenant.id} (${tenant.slug}) criado para session ${session.id}`,
    );

    return { tenant, nextStep: 'USER' as const };
  }

  async createUserStep(plaintextToken: string, dto: CreateSignupUserDto) {
    const validation = await this.signupTokenService.validate(plaintextToken);
    if (!validation.valid) {
      throw new BadRequestException(
        validation.reason === 'expired'
          ? 'Link de cadastro expirado'
          : validation.reason === 'used'
            ? 'Link de cadastro já utilizado'
            : 'Link de cadastro inválido',
      );
    }
    const token = validation.token;

    if (token.currentStep !== 'USER' || !token.tenantId) {
      throw new BadRequestException(
        'Cadastro do tenant ainda não foi concluído',
      );
    }

    const session = await this.sessionsRepo.findOne({
      where: { id: token.checkoutSessionId },
    });
    if (!session)
      throw new NotFoundException('Sessão de checkout não encontrada');

    const lead = await this.leadsRepo.findOne({
      where: { id: session.leadId },
    });
    if (!lead) throw new NotFoundException('Lead não encontrado');

    const tenant = await this.tenantsRepo.findOne({
      where: { id: token.tenantId },
    });
    if (!tenant) throw new NotFoundException('Tenant não encontrado');

    const user = await this.usersService.create({
      name: dto.name,
      email: lead.email,
      password: dto.password,
      role: UserRole.TENANT_ADMIN,
      phone: dto.phone ?? lead.phone,
      cpf: dto.cpf,
      tenantId: tenant.id,
    });

    await this.subscribersRepo
      .createQueryBuilder()
      .update(Subscriber)
      .set({ userId: user.id })
      .where('checkoutSessionId = :sessionId AND userId IS NULL', {
        sessionId: session.id,
      })
      .execute();

    await this.signupTokenService.complete(token.id);

    this.logger.log(
      `User admin ${user.id} criado para tenant ${tenant.id} (session ${session.id})`,
    );

    return {
      success: true as const,
      tenantSlug: tenant.slug,
    };
  }

  private async createTenantWithSlugRetry(
    dto: CreateSignupTenantDto,
    planId: string,
  ): Promise<Tenant> {
    const baseSlug = slugify(dto.name);
    if (!baseSlug) {
      throw new BadRequestException(
        'Nome do tenant inválido — não foi possível gerar identificador',
      );
    }

    let lastError: unknown;
    for (let attempt = 0; attempt < SLUG_COLLISION_RETRIES; attempt++) {
      const slug =
        attempt === 0
          ? baseSlug
          : `${baseSlug}-${randomBytes(2).toString('hex')}`;
      try {
        return await this.tenantsService.create({
          name: dto.name,
          slug,
          politicalProfile: dto.politicalProfile,
          state: dto.state,
          party: dto.party,
          city: dto.city,
          planId,
        });
      } catch (err) {
        if (err instanceof ConflictException) {
          lastError = err;
          continue;
        }
        throw err;
      }
    }
    this.logger.error(
      `Não foi possível gerar slug único após ${SLUG_COLLISION_RETRIES} tentativas (base=${baseSlug})`,
    );
    throw (
      lastError ??
      new ConflictException('Não foi possível gerar identificador único')
    );
  }
}

function slugify(input: string): string {
  return input
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '');
}
