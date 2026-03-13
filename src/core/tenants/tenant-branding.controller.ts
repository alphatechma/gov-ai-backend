import {
  Controller,
  Get,
  Post,
  Patch,
  Delete,
  Param,
  Body,
  Query,
  UseGuards,
  UseInterceptors,
  UploadedFile,
  ParseUUIDPipe,
  BadRequestException,
} from '@nestjs/common';
import { FileInterceptor } from '@nestjs/platform-express';
import { TenantBrandingService } from './tenant-branding.service';
import { JwtAuthGuard } from '../auth/guards/jwt-auth.guard';
import { RolesGuard } from '../auth/guards/roles.guard';
import { Roles } from '../auth/decorators/roles.decorator';
import { UserRole } from '../../shared/enums';

const MAX_LOGO = 2 * 1024 * 1024; // 2MB
const MAX_BANNER = 5 * 1024 * 1024; // 5MB
const MAX_FAVICON = 512 * 1024; // 512KB

@Controller('tenants')
export class TenantBrandingController {
  constructor(private brandingService: TenantBrandingService) {}

  // ─── Public endpoint (no auth) ───
  @Get('branding/public')
  getPublicBranding(@Query('slug') slug: string) {
    if (!slug) throw new BadRequestException('slug is required');
    return this.brandingService.getPublicBranding(slug);
  }

  // ─── Authenticated endpoints ───
  @Get(':id/branding')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPER_ADMIN)
  getBranding(@Param('id', ParseUUIDPipe) id: string) {
    return this.brandingService.getBranding(id);
  }

  @Patch(':id/branding')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPER_ADMIN)
  updateBranding(
    @Param('id', ParseUUIDPipe) id: string,
    @Body()
    body: {
      appName?: string | null;
      primaryColor?: string | null;
      primaryColorDark?: string | null;
      loginBgColor?: string | null;
      loginBgColorEnd?: string | null;
      sidebarColor?: string | null;
      headerColor?: string | null;
      fontFamily?: string | null;
      borderRadius?: string | null;
      showBannerInSidebar?: boolean;
      sidebarBannerPosition?: string | null;
    },
  ) {
    return this.brandingService.updateBranding(id, body);
  }

  @Post(':id/branding/logo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  uploadLogo(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    this.validateFile(file, MAX_LOGO, 'image/');
    return this.brandingService.uploadImage(
      id,
      'logo',
      file.buffer,
      file.originalname,
      file.mimetype,
    );
  }

  @Post(':id/branding/banner')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  uploadBanner(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    this.validateFile(file, MAX_BANNER, 'image/');
    return this.brandingService.uploadImage(
      id,
      'banner',
      file.buffer,
      file.originalname,
      file.mimetype,
    );
  }

  @Post(':id/branding/favicon')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  uploadFavicon(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    this.validateFile(file, MAX_FAVICON);
    return this.brandingService.uploadImage(
      id,
      'favicon',
      file.buffer,
      file.originalname,
      file.mimetype,
    );
  }

  @Delete(':id/branding/logo')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPER_ADMIN)
  deleteLogo(@Param('id', ParseUUIDPipe) id: string) {
    return this.brandingService.deleteImage(id, 'logo');
  }

  @Delete(':id/branding/banner')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPER_ADMIN)
  deleteBanner(@Param('id', ParseUUIDPipe) id: string) {
    return this.brandingService.deleteImage(id, 'banner');
  }

  @Post(':id/branding/dashboard-banner')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPER_ADMIN)
  @UseInterceptors(FileInterceptor('file'))
  uploadDashboardBanner(
    @Param('id', ParseUUIDPipe) id: string,
    @UploadedFile() file: Express.Multer.File,
  ) {
    this.validateFile(file, MAX_BANNER, 'image/');
    return this.brandingService.uploadImage(
      id,
      'dashboard-banner',
      file.buffer,
      file.originalname,
      file.mimetype,
    );
  }

  @Delete(':id/branding/dashboard-banner')
  @UseGuards(JwtAuthGuard, RolesGuard)
  @Roles(UserRole.TENANT_ADMIN, UserRole.SUPER_ADMIN)
  deleteDashboardBanner(@Param('id', ParseUUIDPipe) id: string) {
    return this.brandingService.deleteImage(id, 'dashboard-banner');
  }

  private validateFile(
    file: Express.Multer.File,
    maxSize: number,
    mimePrefix?: string,
  ) {
    if (!file) throw new BadRequestException('File is required');
    if (file.size > maxSize) {
      throw new BadRequestException(
        `File too large. Max: ${Math.round(maxSize / 1024)}KB`,
      );
    }
    if (mimePrefix && !file.mimetype.startsWith(mimePrefix)) {
      throw new BadRequestException(
        `Invalid file type. Expected: ${mimePrefix}*`,
      );
    }
  }
}
