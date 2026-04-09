import {
  Controller,
  Get,
  Post,
  Patch,
  Body,
  Param,
  UseGuards,
  HttpCode,
  HttpStatus,
} from '@nestjs/common';
import { AuthService } from './auth.service';
import { LoginDto } from './dto/login.dto';
import { RegisterDto } from './dto/register.dto';
import { UpdateProfileDto } from './dto/update-profile.dto';
import { JwtAuthGuard } from './guards/jwt-auth.guard';
import { JwtRefreshGuard } from './guards/jwt-refresh.guard';
import { RolesGuard } from './guards/roles.guard';
import { Roles } from './decorators/roles.decorator';
import { CurrentUser } from './decorators/current-user.decorator';
import { UserRole } from '../../shared/enums';

@Controller('auth')
export class AuthController {
  constructor(private authService: AuthService) {}

  @Post('login')
  @HttpCode(HttpStatus.OK)
  login(@Body() dto: LoginDto) {
    return this.authService.login(dto);
  }

  @Post('register')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  register(@Body() dto: RegisterDto) {
    return this.authService.register(dto);
  }

  @Post('refresh')
  @UseGuards(JwtRefreshGuard)
  refresh(@CurrentUser('id') userId: string) {
    return this.authService.refreshToken(userId);
  }

  @Get('me')
  @UseGuards(JwtAuthGuard)
  getProfile(@CurrentUser('id') userId: string) {
    return this.authService.getProfile(userId);
  }

  @Patch('profile')
  @UseGuards(JwtAuthGuard)
  updateProfile(
    @CurrentUser('id') userId: string,
    @Body() dto: UpdateProfileDto,
  ) {
    return this.authService.updateProfile(userId, dto);
  }

  @Post('sessions/kick-all')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  kickAllSessions(@CurrentUser('id') currentUserId: string) {
    return this.authService.kickAllSessions(currentUserId);
  }

  @Post('sessions/kick-tenant/:tenantId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  kickTenantSessions(
    @Param('tenantId') tenantId: string,
    @CurrentUser('id') currentUserId: string,
  ) {
    return this.authService.kickTenantSessions(tenantId, currentUserId);
  }

  @Post('sessions/kick-user/:userId')
  @HttpCode(HttpStatus.OK)
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.SUPER_ADMIN)
  kickUserSession(@Param('userId') userId: string) {
    return this.authService.kickUserSession(userId);
  }
}
