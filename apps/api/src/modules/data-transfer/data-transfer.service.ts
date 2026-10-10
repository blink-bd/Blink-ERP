import { BadRequestException, ForbiddenException, Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { plainToInstance } from 'class-transformer';
import { validate } from 'class-validator';
import { DataSource } from 'typeorm';
import { ProductsService } from '@/modules/products/products.service';
import { CustomersService } from '@/modules/customers/customers.service';
import { SuppliersService } from '@/modules/suppliers/suppliers.service';
import { FeaturesService } from '@/modules/features/features.service';
import { getFeatureDefinition } from '@/modules/features/features.catalog';
import { AuditService, actorFromRequest } from '@/modules/audit/audit.service';
import { CreateProductDto } from '@/modules/products/dto/create-product.dto';
import { CustomerDto } from '@/modules/customers/dto/customer.dto';
import { SupplierDto } from '@/modules/suppliers/dto/supplier.dto';
import { MAX_IMPORT_ROWS, parseCsv, toCsv } from './csv.util';
import { ColumnDef, DATA_ENTITIES, DataEntity, EntityDef } from './data-transfer.definitions';

export const IMPORT_EXPORT_FEATURE = 'import_export';

interface Actor {
  id: string;
  tenantId: string;
  roles: string[];
  permissions: string[];
}

export interface RowError {
  row: number; // رقم السطر في الملف (1 = العناوين)
  field?: string;
  message: string;
}

interface PreparedRow {
  row: number;
  values: Record<string, any>;
  existingId?: string;
  action: 'create' | 'update';
}

const DTO_FOR: Record<DataEntity, new () => object> = {
  products: CreateProductDto,
  customers: CustomerDto,
  suppliers: SupplierDto,
};

@Injectable()
export class DataTransferService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly products: ProductsService,
    private readonly customers: CustomersService,
    private readonly suppliers: SuppliersService,
    private readonly features: FeaturesService,
    private readonly audit: AuditService
  ) {}

  // ---------------------------------------------------------------- access
  private async assertAccess(actor: Actor, def: EntityDef, mode: 'export' | 'import') {
    for (const code of [IMPORT_EXPORT_FEATURE, def.feature]) {
      if (!(await this.features.tenantHasFeature(actor.tenantId, code))) {
        throw new ForbiddenException({
          code: 'FEATURE_DISABLED',
          feature: code,
          message: `ميزة "${getFeatureDefinition(code)?.nameAr || code}" غير مفعّلة لحسابك`,
        });
      }
    }
    const perms = new Set(actor.permissions || []);
    const needed =
      mode === 'export'
        ? ['data.export', def.viewPermission]
        : ['data.import', def.createPermission, def.updatePermission];
    const missing = needed.filter((p) => !perms.has(p));
    if (missing.length) {
      throw new ForbiddenException(`ليس لديك الصلاحيات المطلوبة: ${missing.join(', ')}`);
    }
  }

  // ---------------------------------------------------------------- export
  async template(actor: Actor, def: EntityDef) {
    await this.assertAccess(actor, def, 'import');
    const cols = def.columns.filter((c) => !c.exportOnly);
    return toCsv(
      cols.map((c) => c.label),
      [cols.map((c) => c.example ?? '')]
    );
  }

  async export(actor: Actor, def: EntityDef, req: any) {
    await this.assertAccess(actor, def, 'export');
    const rows = await this.loadExportRows(actor.tenantId, def.entity);
    const cols = def.columns.filter((c) => !c.createOnly);
    const csv = toCsv(
      cols.map((c) => c.label),
      rows.map((r) => cols.map((c) => r[c.key]))
    );
    await this.audit.log({
      ...actorFromRequest(req),
      action: 'DATA_EXPORTED',
      entityType: def.entity,
      newValues: { rows: rows.length },
      severity: def.entity === 'products' ? 'info' : 'warning',
    });
    return { csv, count: rows.length };
  }

  private async loadExportRows(
    tenantId: string,
    entity: DataEntity
  ): Promise<Record<string, any>[]> {
    const q = (sql: string) => this.dataSource.query(sql, [tenantId]);
    if (entity === 'products') {
      return q(`
        SELECT p.name, p.sku, p.barcode, c.name AS category, p.unit,
               p.cost_price::float AS "costPrice", p.selling_price::float AS "sellingPrice",
               p.wholesale_price::float AS "wholesalePrice", p.half_wholesale_price::float AS "halfWholesalePrice",
               p.min_stock_level AS "minStockLevel", p.tax_rate::float AS "taxRate",
               COALESCE((SELECT SUM(i.quantity) FROM inventory i
                         WHERE i.product_id = p.id AND i.tenant_id = p.tenant_id), 0)::float AS stock
        FROM products p
        LEFT JOIN categories c ON c.id = p.category_id
        WHERE p.tenant_id = $1 AND p.deleted_at IS NULL
        ORDER BY p.name`);
    }
    if (entity === 'customers') {
      return q(`
        SELECT name, phone, email, address, city, price_tier AS "priceTier",
               credit_limit::float AS "creditLimit", tax_number AS "taxNumber", notes,
               balance::float AS balance
        FROM customers WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name`);
    }
    return q(`
      SELECT name, phone, email, contact_person AS "contactPerson", address, city,
             tax_number AS "taxNumber", payment_terms AS "paymentTerms", notes, balance::float AS balance
      FROM suppliers WHERE tenant_id = $1 AND deleted_at IS NULL ORDER BY name`);
  }

  // ---------------------------------------------------------------- import
  async import(actor: Actor, def: EntityDef, fileText: string, dryRun: boolean, req: any) {
    await this.assertAccess(actor, def, 'import');

    const table = parseCsv(fileText);
    if (table.length < 2) throw new BadRequestException('الملف فاضي أو مافيهوش غير العناوين');
    if (table.length - 1 > MAX_IMPORT_ROWS) {
      throw new BadRequestException(`الحد الأقصى ${MAX_IMPORT_ROWS} سطر في الملف الواحد`);
    }

    const columnIndex = this.mapHeaders(def, table[0]);
    const errors: RowError[] = [];
    const prepared: PreparedRow[] = [];
    const seen = new Map<string, number>(); // تكرار داخل الملف نفسه

    const existing = await this.loadMatchIndex(actor.tenantId, def);

    for (let i = 1; i < table.length; i++) {
      const rowNo = i + 1;
      const raw = table[i];
      const values: Record<string, any> = {};
      let rowHasError = false;

      for (const col of def.columns) {
        if (col.exportOnly) continue;
        const idx = columnIndex.get(col.key);
        const cell = idx === undefined ? '' : this.cleanCell(raw[idx]);
        if (cell === '') {
          if (col.required) {
            errors.push({ row: rowNo, field: col.label, message: 'حقل مطلوب' });
            rowHasError = true;
          }
          continue;
        }
        const parsed = this.parseValue(col, cell);
        if (parsed === undefined) {
          errors.push({
            row: rowNo,
            field: col.label,
            message: `قيمة غير صحيحة: "${cell.slice(0, 50)}"`,
          });
          rowHasError = true;
          continue;
        }
        values[col.key] = parsed;
      }
      if (rowHasError) continue;

      // تكرار داخل الملف
      for (const key of def.matchBy) {
        const v = values[key];
        if (!v) continue;
        const k = `${key}:${String(v).toLowerCase()}`;
        if (seen.has(k)) {
          errors.push({ row: rowNo, field: key, message: `مكرر مع السطر ${seen.get(k)}` });
          rowHasError = true;
        } else seen.set(k, rowNo);
      }
      if (rowHasError) continue;

      // مطابقة مع سجل موجود
      let existingId: string | undefined;
      for (const key of def.matchBy) {
        const v = values[key];
        if (v && existing[key]?.has(String(v).toLowerCase())) {
          const id = existing[key].get(String(v).toLowerCase())!;
          if (existingId && existingId !== id) {
            errors.push({ row: rowNo, message: 'الكود والباركود بيشاوروا على منتجين مختلفين' });
            rowHasError = true;
            break;
          }
          existingId = id;
        }
      }
      if (rowHasError) continue;

      // نفس قواعد التحقق بتاعة الـ API
      const dtoErrors = await this.validateWithDto(def, values, !!existingId);
      if (dtoErrors.length) {
        for (const message of dtoErrors) errors.push({ row: rowNo, message });
        continue;
      }
      prepared.push({ row: rowNo, values, existingId, action: existingId ? 'update' : 'create' });
    }

    const summary = {
      totalRows: table.length - 1,
      valid: prepared.length,
      toCreate: prepared.filter((p) => p.action === 'create').length,
      toUpdate: prepared.filter((p) => p.action === 'update').length,
      created: 0,
      updated: 0,
      failed: 0,
    };

    // كل-أو-لا شيء على مستوى التحقق: لو فيه أي خطأ مش هنكتب حاجة
    if (dryRun || errors.length) {
      return { dryRun: true, applied: false, summary, errors: errors.slice(0, 500) };
    }

    const categoryCache = new Map<string, string>();
    for (const item of prepared) {
      try {
        await this.writeRow(actor, def.entity, item, categoryCache);
        if (item.action === 'create') summary.created++;
        else summary.updated++;
      } catch (e: any) {
        summary.failed++;
        const msg = e?.response?.message || e?.message || 'خطأ غير متوقع';
        errors.push({ row: item.row, message: Array.isArray(msg) ? msg.join('، ') : String(msg) });
      }
    }

    await this.audit.log({
      ...actorFromRequest(req),
      action: 'DATA_IMPORTED',
      entityType: def.entity,
      newValues: { created: summary.created, updated: summary.updated, failed: summary.failed },
      severity: 'warning',
    });

    return { dryRun: false, applied: true, summary, errors: errors.slice(0, 500) };
  }

  private mapHeaders(def: EntityDef, header: string[]): Map<string, number> {
    const normalize = (s: string) => this.cleanCell(s).toLowerCase().replace(/\s+/g, ' ');
    const map = new Map<string, number>();
    header.forEach((h, idx) => {
      const n = normalize(h);
      const col = def.columns.find((c) => c.key.toLowerCase() === n || normalize(c.label) === n);
      if (col && !map.has(col.key)) map.set(col.key, idx);
    });
    const missingRequired = def.columns.filter((c) => c.required && !map.has(c.key));
    if (missingRequired.length) {
      throw new BadRequestException(
        `أعمدة مطلوبة ناقصة في الملف: ${missingRequired.map((c) => c.label).join('، ')}. نزّل القالب واستخدمه`
      );
    }
    return map;
  }

  private cleanCell(v: string | undefined): string {
    let s = (v ?? '').trim();
    // التصدير بيضيف ' قبل الخلايا اللي شبه المعادلات — نشيلها عند الاستيراد
    if (/^'[=+\-@]/.test(s)) s = s.slice(1);
    return s;
  }

  private parseValue(col: ColumnDef, cell: string): any {
    if (col.type === 'number') {
      const n = Number(
        cell.replace(/[,\s]/g, '').replace(/[٠-٩]/g, (d) => String('٠١٢٣٤٥٦٧٨٩'.indexOf(d)))
      );
      return Number.isFinite(n) ? n : undefined;
    }
    if (col.type === 'boolean') {
      const v = cell.toLowerCase();
      if (['1', 'true', 'yes', 'نعم'].includes(v)) return true;
      if (['0', 'false', 'no', 'لا'].includes(v)) return false;
      return undefined;
    }
    return cell.slice(0, 2000);
  }

  private async validateWithDto(def: EntityDef, values: Record<string, any>, isUpdate: boolean) {
    const payload = { ...values };
    delete payload.category; // بيتحول لـ categoryId وقت الحفظ
    if (isUpdate) for (const c of def.columns) if (c.createOnly) delete payload[c.key];
    const instance = plainToInstance(DTO_FOR[def.entity], payload);
    const result = await validate(instance as object, {
      whitelist: true,
      forbidNonWhitelisted: false,
    });
    return result.flatMap((e) =>
      Object.values(e.constraints || {}).map((m) => `${e.property}: ${m}`)
    );
  }

  private async loadMatchIndex(tenantId: string, def: EntityDef) {
    const index: Record<string, Map<string, string>> = {};
    const table = def.entity;
    for (const key of def.matchBy) {
      const column = key; // sku / barcode / phone نفس الاسم في الجدول
      const rows: { id: string; v: string }[] = await this.dataSource.query(
        `SELECT id, LOWER(${column}) AS v FROM ${table}
         WHERE tenant_id = $1 AND deleted_at IS NULL AND ${column} IS NOT NULL AND ${column} <> ''`,
        [tenantId]
      );
      index[key] = new Map(rows.map((r) => [r.v, r.id]));
    }
    return index;
  }

  private async resolveCategory(
    tenantId: string,
    userId: string,
    name: string,
    cache: Map<string, string>
  ) {
    const key = name.trim().toLowerCase();
    if (cache.has(key)) return cache.get(key)!;
    const [found] = await this.dataSource.query(
      `SELECT id FROM categories WHERE tenant_id = $1 AND deleted_at IS NULL AND LOWER(name) = $2 LIMIT 1`,
      [tenantId, key]
    );
    let id = found?.id;
    if (!id) {
      const [created] = await this.dataSource.query(
        `INSERT INTO categories (tenant_id, name, created_by) VALUES ($1, $2, $3) RETURNING id`,
        [tenantId, name.trim().slice(0, 255), userId]
      );
      id = created.id;
    }
    cache.set(key, id);
    return id as string;
  }

  private async writeRow(
    actor: Actor,
    entity: DataEntity,
    item: PreparedRow,
    categoryCache: Map<string, string>
  ) {
    const { tenantId, id: userId } = actor;
    const values = { ...item.values };
    if (entity === 'products') {
      if (values.category) {
        values.categoryId = await this.resolveCategory(
          tenantId,
          userId,
          values.category,
          categoryCache
        );
      }
      delete values.category;
      if (item.existingId) {
        delete values.initialQuantity; // تعديل المخزون يتم من شاشة المخزون (حركة موثقة) مش من الاستيراد
        await this.products.update(tenantId, item.existingId, values, userId);
      } else {
        await this.products.create(tenantId, values as CreateProductDto, userId);
      }
      return;
    }
    const service = entity === 'customers' ? this.customers : this.suppliers;
    if (item.existingId) {
      delete values.previousBalance; // الرصيد الافتتاحي بيتعدل من الشاشة مع سبب موثق
      await service.update(tenantId, item.existingId, { ...values, updatedBy: userId });
    } else {
      await service.create(tenantId, values, userId);
    }
  }
}

export function getEntityDef(entity: string): EntityDef {
  const def = (DATA_ENTITIES as Record<string, EntityDef>)[entity];
  if (!def)
    throw new BadRequestException('نوع بيانات غير مدعوم. المتاح: products, customers, suppliers');
  return def;
}
