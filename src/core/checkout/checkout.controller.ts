import {
  Body,
  Controller,
  Get,
  HttpCode,
  HttpStatus,
  Param,
  Post,
  Query,
  Req,
  UseGuards,
} from '@nestjs/common';
import { ApiBearerAuth, ApiSecurity, ApiTags } from '@nestjs/swagger';
import type { Request } from 'express';
import { JwtOrApiKeyGuard } from '../auth/guards/jwt-or-api-key.guard';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { CurrentUser } from '../auth/decorators/current-user.decorator';
import { ApiKeyName } from '../auth/decorators/api-key-name.decorator';
import { UserRole } from '../../shared/enums';
import { CheckoutService } from './checkout.service';
import { CheckoutWebhookService } from './services/checkout-webhook.service';
import { CheckoutSignupService } from './services/checkout-signup.service';
import { SignupTokenService } from './services/signup-token.service';
import { AdminPaymentLinksService } from './services/admin-payment-links.service';
import { CreateCheckoutSessionDto } from './dto/create-checkout-session.dto';
import { CreateAdminPaymentLinkDto } from './dto/create-admin-payment-link.dto';
import { CreateSignupTenantDto } from './dto/create-signup-tenant.dto';
import { CreateSignupUserDto } from './dto/create-signup-user.dto';
import type { MpWebhookBody, MpWebhookQuery } from './dto/mp-webhook.dto';

@ApiTags('Checkout')
@Controller('checkout')
export class CheckoutController {
  constructor(
    private checkoutService: CheckoutService,
    private webhookService: CheckoutWebhookService,
    private signupService: CheckoutSignupService,
    private signupTokenService: SignupTokenService,
    private adminPaymentLinksService: AdminPaymentLinksService,
  ) {}

  @Post('admin/payment-links')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  createAdminPaymentLink(
    @Body() dto: CreateAdminPaymentLinkDto,
    @CurrentUser('id') adminUserId: string,
  ) {
    return this.adminPaymentLinksService.create(adminUserId, dto);
  }

  @Get('admin/payment-links')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  @ApiBearerAuth()
  listAdminPaymentLinks(@Query('limit') limit?: string) {
    const parsed = limit ? Number(limit) : undefined;
    return this.adminPaymentLinksService.list(
      Number.isFinite(parsed) ? (parsed as number) : 50,
    );
  }

  @Post('session')
  @UseGuards(JwtOrApiKeyGuard)
  @ApiKeyName('GOVERNE_AI_API_KEY')
  @ApiBearerAuth()
  @ApiSecurity('governe-ai-key')
  createSession(@Body() dto: CreateCheckoutSessionDto) {
    return this.checkoutService.createSession(dto);
  }

  @Post('webhook')
  @HttpCode(HttpStatus.OK)
  handleWebhook(
    @Body() body: MpWebhookBody,
    @Query() query: MpWebhookQuery,
    @Req() req: Request,
  ) {
    this.webhookService
      .handle(body, query, req.headers as Record<string, string | string[]>)
      .catch(() => {});
    return { received: true };
  }

  @Get('signup-token/:token')
  async getSignupToken(@Param('token') token: string) {
    return this.webhookService.describeSignupToken(token);
  }

  @Get('signup/:token')
  async getSignup(@Param('token') token: string) {
    return this.signupService.describe(token);
  }

  @Post('signup/:token/tenant')
  @HttpCode(HttpStatus.OK)
  async signupTenant(
    @Param('token') token: string,
    @Body() dto: CreateSignupTenantDto,
  ) {
    return this.signupService.createTenantStep(token, dto);
  }

  @Post('signup/:token/user')
  @HttpCode(HttpStatus.OK)
  async signupUser(
    @Param('token') token: string,
    @Body() dto: CreateSignupUserDto,
  ) {
    return this.signupService.createUserStep(token, dto);
  }
}
