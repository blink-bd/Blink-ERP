import { ForbiddenException } from '@nestjs/common';

interface TenantLike {
  isActive: boolean;
  subscriptionStatus: string;
  subscriptionEndDate?: Date | null;
}

/** يتأكد إن التاجر مسموح له يستخدم النظام (مفعّل + اشتراك ساري). */
export function assertTenantUsable(tenant: TenantLike | undefined | null): void {
  if (!tenant || !tenant.isActive) {
    throw new ForbiddenException('النشاط التجاري معلق. تواصل مع الإدارة');
  }
  if (tenant.subscriptionStatus !== 'active') {
    throw new ForbiddenException('الاشتراك غير فعّال. تواصل مع الإدارة');
  }
  if (tenant.subscriptionEndDate && new Date(tenant.subscriptionEndDate) <= new Date()) {
    throw new ForbiddenException('انتهى الاشتراك. تواصل مع الإدارة للتجديد');
  }
}
