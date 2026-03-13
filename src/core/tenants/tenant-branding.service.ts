import { Injectable, NotFoundException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { v4 as uuid } from 'uuid';
import { Tenant } from './tenant.entity';
import { StorageService } from '../../shared/storage/storage.service';

const BUCKET = 'branding';

@Injectable()
export class TenantBrandingService {
  constructor(
    @InjectRepository(Tenant)
    private tenantsRepo: Repository<Tenant>,
    private storage: StorageService,
  ) {}

  async getBranding(tenantId: string) {
    const tenant = await this.tenantsRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant não encontrado');
    return this.extractBranding(tenant);
  }

  async getPublicBranding(slug: string) {
    const tenant = await this.tenantsRepo.findOne({ where: { slug } });
    if (!tenant) throw new NotFoundException('Tenant não encontrado');
    return this.extractBranding(tenant);
  }

  async uploadImage(
    tenantId: string,
    type: 'logo' | 'banner' | 'favicon' | 'dashboard-banner',
    buffer: Buffer,
    originalName: string,
    contentType: string,
  ) {
    const tenant = await this.tenantsRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant não encontrado');

    // Delete old image if exists
    const urlFieldMap: Record<string, string> = {
      logo: 'logoUrl',
      banner: 'bannerUrl',
      favicon: 'faviconUrl',
      'dashboard-banner': 'dashboardBannerUrl',
    };
    const urlField = urlFieldMap[type] as keyof Tenant;
    const oldUrl = tenant[urlField] as string | null;
    if (oldUrl) {
      const oldKey = this.extractKeyFromUrl(oldUrl);
      if (oldKey) {
        try {
          await this.storage.delete(BUCKET, oldKey);
        } catch {
          // ignore delete errors
        }
      }
    }

    const ext = originalName.split('.').pop() || 'png';
    const key = `tenants/${tenantId}/${type}-${uuid()}.${ext}`;
    const url = await this.storage.upload(BUCKET, key, buffer, contentType);

    (tenant as any)[urlField] = url;
    await this.tenantsRepo.save(tenant);

    return { url };
  }

  async deleteImage(
    tenantId: string,
    type: 'logo' | 'banner' | 'dashboard-banner',
  ) {
    const tenant = await this.tenantsRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant não encontrado');

    const urlFieldMap: Record<string, string> = {
      logo: 'logoUrl',
      banner: 'bannerUrl',
      'dashboard-banner': 'dashboardBannerUrl',
    };
    const urlField = urlFieldMap[type] as keyof Tenant;
    const oldUrl = tenant[urlField] as string | null;
    if (oldUrl) {
      const oldKey = this.extractKeyFromUrl(oldUrl);
      if (oldKey) {
        try {
          await this.storage.delete(BUCKET, oldKey);
        } catch {
          // ignore
        }
      }
    }

    (tenant as any)[urlField] = null;
    await this.tenantsRepo.save(tenant);
    return { success: true };
  }

  async updateBranding(
    tenantId: string,
    data: {
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
    const tenant = await this.tenantsRepo.findOne({ where: { id: tenantId } });
    if (!tenant) throw new NotFoundException('Tenant não encontrado');

    if (data.appName !== undefined) tenant.appName = data.appName as string;
    if (data.primaryColor !== undefined)
      tenant.primaryColor = data.primaryColor as string;
    if (data.primaryColorDark !== undefined)
      tenant.primaryColorDark = data.primaryColorDark as string;
    if (data.loginBgColor !== undefined)
      tenant.loginBgColor = data.loginBgColor as string;
    if (data.loginBgColorEnd !== undefined)
      tenant.loginBgColorEnd = data.loginBgColorEnd as string;
    if (data.sidebarColor !== undefined)
      tenant.sidebarColor = data.sidebarColor as string;
    if (data.headerColor !== undefined)
      tenant.headerColor = data.headerColor as string;
    if (data.fontFamily !== undefined)
      tenant.fontFamily = data.fontFamily as string;
    if (data.borderRadius !== undefined)
      tenant.borderRadius = data.borderRadius as string;
    if (data.showBannerInSidebar !== undefined)
      tenant.showBannerInSidebar = data.showBannerInSidebar;
    if (data.sidebarBannerPosition !== undefined)
      tenant.sidebarBannerPosition = data.sidebarBannerPosition as string;

    await this.tenantsRepo.save(tenant);
    return this.extractBranding(tenant);
  }

  private extractBranding(tenant: Tenant) {
    return {
      appName: tenant.appName,
      logoUrl: tenant.logoUrl,
      bannerUrl: tenant.bannerUrl,
      faviconUrl: tenant.faviconUrl,
      primaryColor: tenant.primaryColor,
      primaryColorDark: tenant.primaryColorDark,
      loginBgColor: tenant.loginBgColor,
      loginBgColorEnd: tenant.loginBgColorEnd,
      dashboardBannerUrl: tenant.dashboardBannerUrl,
      sidebarColor: tenant.sidebarColor,
      headerColor: tenant.headerColor,
      fontFamily: tenant.fontFamily,
      borderRadius: tenant.borderRadius,
      showBannerInSidebar: tenant.showBannerInSidebar,
      sidebarBannerPosition: tenant.sidebarBannerPosition,
    };
  }

  private extractKeyFromUrl(url: string): string | null {
    // URL format: {publicUrl}/{bucket}/{key}
    const match = url.match(new RegExp(`/${BUCKET}/(.+)$`));
    return match ? match[1] : null;
  }
}
