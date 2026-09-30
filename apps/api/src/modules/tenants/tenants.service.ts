import { Injectable, NotFoundException, ConflictException } from '@nestjs/common';
import { InjectRepository } from '@nestjs/typeorm';
import { Repository } from 'typeorm';
import { Tenant } from './entities/tenant.entity';
import { PaymentMethod } from '@/modules/sales/entities/payment-method.entity';
import { CreateTenantDto } from './dto/create-tenant.dto';
import { UpdateTenantDto } from './dto/update-tenant.dto';
import { UsersService } from '@/modules/users/users.service';
import { FeaturesService } from '@/modules/features/features.service';
import { WarehousesService } from '@/modules/inventory/warehouses.service';

const DEFAULT_PAYMENT_METHODS = [
  { name: 'Cash', nameAr: 'نقدي', code: 'cash', sortOrder: 1 },
  { name: 'Card', nameAr: 'بطاقة', code: 'card', sortOrder: 2 },
  { name: 'Bank Transfer', nameAr: 'تحويل بنكي', code: 'bank_transfer', sortOrder: 3 },
  { name: 'Credit', nameAr: 'آجل', code: 'credit', sortOrder: 4 },
];

@Injectable()
export class TenantsService {
  constructor(
    @InjectRepository(Tenant)
    private readonly tenantsRepository: Repository<Tenant>,
    @InjectRepository(PaymentMethod)
    private readonly paymentMethodsRepository: Repository<PaymentMethod>,
    private readonly usersService: UsersService,
    private readonly featuresService: FeaturesService,
    private readonly warehousesService: WarehousesService
  ) {}

  async findAll(): Promise<Tenant[]> {
    return this.tenantsRepository.find();
  }

  async findById(id: string): Promise<Tenant> {
    const tenant = await this.tenantsRepository.findOne({ where: { id } });
    if (!tenant) {
      throw new NotFoundException('Tenant not found');
    }
    return tenant;
  }

  async findByEmail(email: string): Promise<Tenant | null> {
    return this.tenantsRepository.findOne({ where: { email } });
  }

  /**
   * Full tenant onboarding: creates the tenant record, the admin user, the
   * default warehouse, default payment methods, and enables every feature
   * flagged is_default=true — so a brand-new tenant is immediately usable.
   */
  async create(dto: CreateTenantDto): Promise<{ tenant: Tenant; adminUserId: string }> {
    const existing = await this.findByEmail(dto.email);
    if (existing) {
      throw new ConflictException('Tenant with this email already exists');
    }

    const tenant = this.tenantsRepository.create({
      businessName: dto.businessName,
      businessNameAr: dto.businessNameAr,
      businessNameEn: dto.businessNameEn,
      email: dto.email,
      phone: dto.phone,
      address: dto.address,
      city: dto.city,
      planId: dto.planId,
      subscriptionStartDate: dto.subscriptionStartDate ? new Date(dto.subscriptionStartDate) : undefined,
      subscriptionEndDate: dto.subscriptionEndDate ? new Date(dto.subscriptionEndDate) : undefined,
    });

    const savedTenant = await this.tenantsRepository.save(tenant);

    // 1. Admin user
    const adminUser = await this.usersService.create({
      tenantId: savedTenant.id,
      email: dto.adminUser.email,
      password: dto.adminUser.password,
      fullName: dto.adminUser.fullName,
    });

    // 2. Default warehouse
    await this.warehousesService.findOrCreateDefault(savedTenant.id, adminUser.id);

    // 3. Default payment methods
    for (const method of DEFAULT_PAYMENT_METHODS) {
      await this.paymentMethodsRepository.save(
        this.paymentMethodsRepository.create({ ...method, tenantId: savedTenant.id })
      );
    }

    // 4. Enable all default features
    const allFeatures = await this.featuresService.findAll();
    for (const feature of allFeatures.filter((f) => f.isDefault)) {
      await this.featuresService.setFeatureStatus(savedTenant.id, feature.id, true, {});
    }

    return { tenant: savedTenant, adminUserId: adminUser.id };
  }

  async update(id: string, dto: UpdateTenantDto): Promise<Tenant> {
    const tenant = await this.findById(id);
    Object.assign(tenant, dto);
    return this.tenantsRepository.save(tenant);
  }

  async deactivate(id: string): Promise<void> {
    const tenant = await this.findById(id);
    tenant.isActive = false;
    await this.tenantsRepository.save(tenant);
  }
}
