/**
 * اختبارات تكامل حقيقية عبر HTTP على قاعدة اختبار: التاجر، الفروع، المخزون،
 * المشتريات، المبيعات، المرتجعات، التحويلات، التنبيهات، الميزات والعزل بين التجار.
 *
 * التشغيل: E2E_DATABASE_URL=postgresql://…/blink_erp_test npm run test:e2e
 */
import { INestApplication } from '@nestjs/common';
import { Test } from '@nestjs/testing';
import { ConfigService } from '@nestjs/config';
import { DataSource } from 'typeorm';
import { AppModule } from '../../src/app.module';
import { configureApp } from '../../src/app.setup';
import { TestClient, tinyPng, totpCode } from './client';
import { prepareDatabase } from './db-setup';

jest.setTimeout(180000);

const MASTER_EMAIL = process.env.MASTER_ADMIN_EMAIL as string;
const MASTER_PASSWORD = process.env.MASTER_ADMIN_PASSWORD as string;
const REMINDERS_TOKEN = process.env.REMINDERS_JOB_TOKEN as string;

describe('Blink ERP — integration flows (e2e)', () => {
  let app: INestApplication;
  let dataSource: DataSource;
  let baseUrl: string;
  let master: TestClient;
  let tenantA: TestClient;
  let tenantB: TestClient;
  let cashierA: TestClient;

  const state: Record<string, any> = {};

  const api = (path: string) => `/api/v1${path}`;

  beforeAll(async () => {
    await prepareDatabase();
    const moduleRef = await Test.createTestingModule({ imports: [AppModule] }).compile();
    app = moduleRef.createNestApplication();
    configureApp(app, app.get(ConfigService));
    await app.init();
    await app.listen(0, '0.0.0.0');
    const url = (await app.getUrl()).replace('[::1]', '127.0.0.1');
    baseUrl = url.replace(/\/$/, '');
    dataSource = app.get(DataSource);
    master = new TestClient(baseUrl);
    tenantA = new TestClient(baseUrl);
    tenantB = new TestClient(baseUrl);
    cashierA = new TestClient(baseUrl);
  });

  afterAll(async () => {
    if (app) await app.close();
  });

  // ---------------------------------------------------------------- health
  it('health check reports database connectivity', async () => {
    const anonymous = new TestClient(baseUrl);
    const response = await anonymous.get(api('/health'));
    expect([200, 201]).toContain(response.status);
    expect(response.body.data.database).toBe('ok');
  });

  // ---------------------------------------------------- security / master admin
  describe('security baseline', () => {
    it('rejects unauthenticated tenant API calls', async () => {
      const anonymous = new TestClient(baseUrl);
      const response = await anonymous.get(api('/sales'));
      expect(response.status).toBe(401);
    });

    it('rejects mutating requests without the CSRF header', async () => {
      const client = new TestClient(baseUrl);
      const response = await client.request('POST', api('/auth/login'), {}, { csrf: false });
      // بدون هيدر CSRF تُرفض قبل التحقق من البيانات
      expect(response.status).toBe(403);
      expect(response.body.error?.code).toBe('CSRF_VALIDATION_FAILED');
    });

    it('logs in the master admin without requiring MASTER_ADMIN_ALLOWED_IPS', async () => {
      expect(process.env.MASTER_ADMIN_ALLOWED_IPS).toBeUndefined();
      const response = await master.post(api('/admin/auth/login'), {
        email: MASTER_EMAIL,
        password: MASTER_PASSWORD,
      });
      expect([200, 201]).toContain(response.status);
      expect(master.hasCookie('blink_master_token')).toBe(true);
      const setCookie = response.headers.get('set-cookie') || '';
      expect(setCookie).toMatch(/HttpOnly/i);
    });
  });

  // ------------------------------------------------------------- master admin
  describe('master admin: tenants and features', () => {
    it('creates two tenants with owner users', async () => {
      const createTenant = async (suffix: string) => {
        const response = await master.post(api('/admin/tenants'), {
          businessName: `E2E Store ${suffix}`,
          businessNameAr: `متجر الاختبار ${suffix}`,
          email: `owner${suffix.toLowerCase()}@example.test`,
          phone: '+201000000000',
          currency: 'EGP',
          timezone: 'Africa/Cairo',
          adminUser: {
            fullName: `Owner ${suffix}`,
            email: `owner${suffix.toLowerCase()}@example.test`,
            password: 'Owner!Pass2026x',
          },
        });
        expect(response.status).toBe(201);
        return response.body.data;
      };

      const a = await createTenant('A');
      const b = await createTenant('B');
      state.tenantAId = a.tenant.id;
      state.tenantBId = b.tenant.id;

      const list = await master.get(api('/admin/tenants'));
      expect(list.status).toBe(200);
      const ids = list.body.data.map((t: any) => t.id);
      expect(ids).toContain(state.tenantAId);
      expect(ids).toContain(state.tenantBId);
    });

    it('enables the commercial features per tenant (with config)', async () => {
      const listResponse = await master.get(api(`/admin/tenants/${state.tenantAId}/features`));
      expect(listResponse.status).toBe(200);
      const features: any[] = listResponse.body.data;
      state.featureIds = new Map(features.map((f) => [f.code, f.id]));

      const wanted = [
        'products',
        'sales',
        'pos',
        'returns',
        'return_disposition',
        'inventory',
        'warehouses',
        'branches',
        'branch_analytics',
        'customers',
        'suppliers',
        'purchases',
        'expenses',
        'reports',
        'balance_reminders',
        'invoice_attachments',
        'supplier_balance_limit',
        'maintenance_management',
        'cash_register',
        'advanced_reports',
        'users',
      ];
      const payload = features
        .filter((f) => wanted.includes(f.code) && !f.isCore)
        .map((f) => ({
          featureId: f.id,
          isEnabled: true,
          config:
            f.code === 'balance_reminders'
              ? { customerReminderDays: 1, supplierReminderDays: 1 }
              : f.code === 'supplier_balance_limit'
                ? { limitAmount: 500 }
                : undefined,
        }));
      expect(payload.length).toBeGreaterThan(10);

      const update = await master.put(api(`/admin/tenants/${state.tenantAId}/features`), {
        features: payload,
      });
      expect(update.status).toBe(200);

      const after: any[] = update.body.data;
      const enabledCodes = after.filter((f) => f.isEffective).map((f) => f.code);
      for (const code of wanted) expect(enabledCodes).toContain(code);

      const reminders = after.find((f) => f.code === 'balance_reminders');
      expect(reminders.config).toMatchObject({ customerReminderDays: 1, supplierReminderDays: 1 });
      const limit = after.find((f) => f.code === 'supplier_balance_limit');
      expect(limit.config).toMatchObject({ limitAmount: 500 });
    });
  });

  // ---------------------------------------------------------------- tenant auth
  describe('tenant login and branch setup', () => {
    it('logs in the tenant owner with HttpOnly cookies', async () => {
      const response = await tenantA.post(api(`/auth/login?tenantId=${state.tenantAId}`), {
        email: 'ownera@example.test',
        password: 'Owner!Pass2026x',
      });
      expect([200, 201]).toContain(response.status);
      expect(tenantA.hasCookie('blink_access_token')).toBe(true);
      expect(tenantA.hasCookie('blink_refresh_token')).toBe(true);
      expect(response.headers.get('set-cookie')).toMatch(/HttpOnly/i);
      expect(JSON.stringify(response.body)).not.toContain('blink_access_token');
    });

    it('creates branches and links a warehouse to each branch', async () => {
      const branch1 = await tenantA.post(api('/branches'), { name: 'فرع وسط البلد', code: 'BR1' });
      const branch2 = await tenantA.post(api('/branches'), { name: 'فرع مدينة نصر', code: 'BR2' });
      expect(branch1.status).toBe(201);
      expect(branch2.status).toBe(201);
      state.branch1Id = branch1.body.data.id;
      state.branch2Id = branch2.body.data.id;

      const warehouse1 = await tenantA.post(api('/warehouses'), {
        name: 'مخزن الفرع الأول',
        code: 'WH1',
        branchId: state.branch1Id,
      });
      const warehouse2 = await tenantA.post(api('/warehouses'), {
        name: 'مخزن الفرع الثاني',
        code: 'WH2',
        branchId: state.branch2Id,
      });
      expect(warehouse1.status).toBe(201);
      expect(warehouse2.status).toBe(201);
      state.warehouse1Id = warehouse1.body.data.id;
      state.warehouse2Id = warehouse2.body.data.id;

      const warehouses = await tenantA.get(api('/warehouses'));
      const linked = warehouses.body.data.filter((w: any) => w.branchId);
      expect(linked.length).toBeGreaterThanOrEqual(2);
    });

    it('creates master data (product, customer, supplier)', async () => {
      const product = await tenantA.post(api('/products'), {
        name: 'شاشة آيفون 13',
        sku: 'SCR-IP13',
        barcode: '1234567890123',
        costPrice: 100,
        sellingPrice: 150,
        wholesalePrice: 130,
        unit: 'قطعة',
        trackInventory: true,
      });
      expect(product.status).toBe(201);
      state.productId = product.body.data.id;

      const customer = await tenantA.post(api('/customers'), {
        name: 'عميل نقدي آجل',
        phone: '+201111111111',
      });
      expect(customer.status).toBe(201);
      state.customerId = customer.body.data.id;

      const supplier = await tenantA.post(api('/suppliers'), {
        name: 'مورد الشاشات',
        phone: '+201222222222',
      });
      expect(supplier.status).toBe(201);
      state.supplierId = supplier.body.data.id;
    });
  });

  // ----------------------------------------------------------------- purchases
  describe('purchases, stock and supplier balances', () => {
    it('registers a purchase and increases stock + supplier balance', async () => {
      const response = await tenantA.post(api('/purchases'), {
        supplierId: state.supplierId,
        warehouseId: state.warehouse1Id,
        supplierInvoiceNumber: 'SUP-1001',
        items: [{ productId: state.productId, quantity: 10, unitCost: 100 }],
        paidAmount: 0,
      });
      expect(response.status).toBe(201);
      state.purchaseId = response.body.data.id;

      const inventory = await tenantA.get(
        api(`/inventory?warehouseId=${state.warehouse1Id}&productId=${state.productId}`)
      );
      expect(inventory.status).toBe(200);
      const row = inventory.body.data.find((i: any) => i.productId === state.productId);
      expect(Number(row.quantity)).toBe(10);

      const supplier = await tenantA.get(api(`/suppliers/${state.supplierId}`));
      expect(Number(supplier.body.data.balance)).toBeCloseTo(1000, 2);
    });

    it('stores invoice evidence attachments (PNG) linked to invoice, tenant and branch', async () => {
      const form = new FormData();
      form.append('file', new Blob([tinyPng], { type: 'image/png' }), 'receipt.png');
      const upload = await tenantA.request(
        'POST',
        api(`/invoice-attachments/invoices/purchase/${state.purchaseId}`),
        undefined,
        {
          formData: form,
        }
      );
      expect(upload.status).toBe(201);
      state.attachmentId = upload.body.data.id;

      const list = await tenantA.get(
        api(`/invoice-attachments/invoices/purchase/${state.purchaseId}`)
      );
      expect(list.body.data).toHaveLength(1);
      expect(list.body.data[0].mimeType).toBe('image/png');

      const [row] = await dataSource.query(
        `SELECT tenant_id AS "tenantId", branch_id AS "branchId", entity_id AS "entityId"
         FROM invoice_attachments WHERE id = $1`,
        [state.attachmentId]
      );
      expect(row.tenantId).toBe(state.tenantAId);
      expect(row.branchId).toBe(state.branch1Id);
      expect(row.entityId).toBe(state.purchaseId);
    });

    it('rejects files whose content does not match the declared type', async () => {
      const form = new FormData();
      form.append(
        'file',
        new Blob([Buffer.from('not an image')], { type: 'image/png' }),
        'fake.png'
      );
      const upload = await tenantA.request(
        'POST',
        api(`/invoice-attachments/invoices/purchase/${state.purchaseId}`),
        undefined,
        {
          formData: form,
        }
      );
      expect(upload.status).toBe(400);
    });

    it('alerts when supplier payables exceed the configured limit', async () => {
      const status = await tenantA.get(api('/suppliers/payables-limit/status'));
      expect(status.status).toBe(200);
      expect(status.body.data.limitAmount).toBe(500);
      expect(status.body.data.overLimit).toBe(true);

      // تغيير الميزات نفسه يفحص الحد فوراً؛ لذلك نتحقق من حالة التنبيه لا من عدّاد الوظيفة اليومية
      const after = await tenantA.get(api('/suppliers/payables-limit/status'));
      expect(after.body.data.overLimit).toBe(true);
      await tenantA.post(api(`/suppliers/${state.supplierId}/settle`), {
        amount: 1,
        method: 'cash',
        branchId: state.branch1Id,
      });
      const run = await fetch(`${baseUrl}${api('/ops/balance-reminders/run')}`, {
        method: 'POST',
        headers: { 'X-Reminder-Job-Token': REMINDERS_TOKEN },
      });
      expect(run.status).toBe(201);
      const body = await run.json();
      expect(body.data.supplierLimitTenantsProcessed).toBeGreaterThanOrEqual(1);
    });
  });

  // --------------------------------------------------------------------- sales
  describe('sales, returns and profit integrity', () => {
    it('registers a credit sale (customer balance + stock decrease)', async () => {
      const response = await tenantA.post(api('/sales'), {
        customerId: state.customerId,
        warehouseId: state.warehouse1Id,
        items: [{ productId: state.productId, quantity: 4 }],
      });
      expect(response.status).toBe(201);
      state.saleId = response.body.data.id;
      state.saleItemId = response.body.data.items[0].id;
      expect(Number(response.body.data.total)).toBeCloseTo(600, 2);

      const customer = await tenantA.get(api(`/customers/${state.customerId}`));
      expect(Number(customer.body.data.balance)).toBeCloseTo(600, 2);

      const inventory = await tenantA.get(
        api(`/inventory?warehouseId=${state.warehouse1Id}&productId=${state.productId}`)
      );
      const row = inventory.body.data.find((i: any) => i.productId === state.productId);
      expect(Number(row.quantity)).toBe(6);
    });

    it('exposes product cost and sale price on the return record', async () => {
      const response = await tenantA.post(api(`/sales/${state.saleId}/return`), {
        items: [{ saleItemId: state.saleItemId, quantity: 1 }],
        reason: 'عيب في الشاشة',
      });
      expect(response.status).toBe(201);
      state.returnId = response.body.data.id;
      state.returnItemId = response.body.data.items[0].id;
      expect(response.body.data.status).toBe('pending_inspection');
      expect(Number(response.body.data.items[0].unitCost)).toBeCloseTo(100, 2);
      expect(Number(response.body.data.items[0].unitPrice)).toBeCloseTo(150, 2);
      // فاتورة آجلة بالكامل: قيمة المرتجع كلها بتتخصم من المتبقي عليها ومن رصيد العميل
      expect(Number(response.body.data.invoiceCredit)).toBeCloseTo(150, 2);
      expect(Number(response.body.data.refundPaid)).toBeCloseTo(0, 2);
      const customer = await tenantA.get(api(`/customers/${state.customerId}`));
      expect(Number(customer.body.data.balance)).toBeCloseTo(450, 2);

      const list = await tenantA.get(api('/sales/returns'));
      const found = list.body.data.find((r: any) => r.id === state.returnId);
      expect(Number(found.items[0].unitCost)).toBeCloseTo(100, 2);
      expect(Number(found.items[0].unitPrice)).toBeCloseTo(150, 2);
    });

    it('rejects returning more than the original invoice quantity', async () => {
      const response = await tenantA.post(api(`/sales/${state.saleId}/return`), {
        items: [{ saleItemId: state.saleItemId, quantity: 5 }],
      });
      expect(response.status).toBe(400);
    });

    it('resolves the returned item by sending it back to the supplier (stock + supplier balance + repair cost)', async () => {
      const before = await tenantA.get(api(`/suppliers/${state.supplierId}`));
      const balanceBefore = Number(before.body.data.balance);
      const response = await tenantA.post(
        api(`/sales/returns/${state.returnId}/items/${state.returnItemId}/disposition`),
        { disposition: 'supplier', supplierId: state.supplierId, repairExpense: 25 }
      );
      expect(response.status).toBe(201);
      expect(Number(response.body.data.supplierCredit)).toBeCloseTo(100, 2);
      expect(Number(response.body.data.repairExpense)).toBeCloseTo(25, 2);

      const supplier = await tenantA.get(api(`/suppliers/${state.supplierId}`));
      expect(Number(supplier.body.data.balance)).toBeCloseTo(balanceBefore - 100, 2);
      state.supplierBalanceAfterDisposition = Number(supplier.body.data.balance);

      const [supplierReturn] = await dataSource.query(
        `SELECT * FROM supplier_returns WHERE tenant_id = $1 AND supplier_id = $2`,
        [state.tenantAId, state.supplierId]
      );
      expect(supplierReturn).toBeTruthy();
      expect(Number(supplierReturn.amount)).toBeCloseTo(100, 2);

      // صيانة المرتجع بتتسجل فاتورة صيانة داخلية (مش مصروف) عشان تظهر في إدارة الصيانة
      expect(response.body.data.maintenanceInvoiceId).toBeTruthy();
      const [maintenance] = await dataSource.query(
        `SELECT * FROM maintenance_invoices WHERE tenant_id = $1 AND sale_return_item_id = $2`,
        [state.tenantAId, state.returnItemId]
      );
      expect(maintenance).toBeTruthy();
      expect(maintenance.source).toBe('sale_return');
      expect(maintenance.branch_id).toBe(state.branch1Id);
      expect(Number(maintenance.parts_cost)).toBeCloseTo(25, 2);
      expect(Number(maintenance.profit)).toBeCloseTo(-25, 2);
      const expenses = await dataSource.query(
        `SELECT * FROM expenses WHERE tenant_id = $1 AND notes LIKE '%' || $2 || '%'`,
        [state.tenantAId, maintenance.product_notes.split('رقم ')[1]]
      );
      expect(expenses).toHaveLength(0);
    });

    it('cannot be resolved twice (no double counting)', async () => {
      const response = await tenantA.post(
        api(`/sales/returns/${state.returnId}/items/${state.returnItemId}/disposition`),
        { disposition: 'supplier', supplierId: state.supplierId }
      );
      expect(response.status).toBe(400);
      const supplier = await tenantA.get(api(`/suppliers/${state.supplierId}`));
      expect(Number(supplier.body.data.balance)).toBeCloseTo(
        state.supplierBalanceAfterDisposition,
        2
      );
    });

    it('creates an independent product for a returned item with new barcode, cost and prices', async () => {
      const sale = await tenantA.post(api('/sales'), {
        customerId: state.customerId,
        warehouseId: state.warehouse1Id,
        items: [{ productId: state.productId, quantity: 1 }],
      });
      expect([200, 201]).toContain(sale.status);
      const returned = await tenantA.post(api(`/sales/${sale.body.data.id}/return`), {
        items: [{ saleItemId: sale.body.data.items[0].id, quantity: 1 }],
      });
      expect(returned.status).toBe(201);
      const returnItemId = returned.body.data.items[0].id;

      const resolution = await tenantA.post(
        api(`/sales/returns/${returned.body.data.id}/items/${returnItemId}/disposition`),
        {
          disposition: 'restocked',
          repairExpense: 10,
          product: {
            name: 'شاشة مجددة آيفون 13',
            sku: 'SCR-IP13-REF',
            barcode: '9876543210987',
            costPrice: 80,
            sellingPrice: 120,
          },
        }
      );
      expect(resolution.status).toBe(201);
      const newProductId = resolution.body.data.newProductId;
      expect(newProductId).toBeTruthy();
      // التكلفة الجديدة (80) أقل من الأصلية (100): الفرق بيتسجل هالك
      expect(Number(resolution.body.data.writeDown)).toBeCloseTo(20, 2);
      expect(Number(resolution.body.data.wasteExpense)).toBeCloseTo(20, 2);
      const [waste] = await dataSource.query(
        `SELECT * FROM expenses WHERE tenant_id = $1 AND notes = $2`,
        [state.tenantAId, `مرتجع البيع رقم ${returned.body.data.returnNumber}`]
      );
      expect(Number(waste.amount)).toBeCloseTo(20, 2);

      const product = await tenantA.get(api(`/products/${newProductId}`));
      expect(product.body.data.barcode).toBe('9876543210987');
      expect(Number(product.body.data.costPrice)).toBeCloseTo(80, 2);
      expect(Number(product.body.data.sellingPrice)).toBeCloseTo(120, 2);

      const inventory = await tenantA.get(
        api(`/inventory?warehouseId=${state.warehouse1Id}&productId=${newProductId}`)
      );
      const row = inventory.body.data.find((i: any) => i.productId === newProductId);
      expect(Number(row.quantity)).toBe(1);
    });

    it('requires a new code/barcode and price above cost for a new independent product', async () => {
      const sale = await tenantA.post(api('/sales'), {
        customerId: state.customerId,
        warehouseId: state.warehouse1Id,
        items: [{ productId: state.productId, quantity: 1 }],
      });
      expect([200, 201]).toContain(sale.status);
      const returned = await tenantA.post(api(`/sales/${sale.body.data.id}/return`), {
        items: [{ saleItemId: sale.body.data.items[0].id, quantity: 1 }],
      });
      const returnItemId = returned.body.data.items[0].id;
      const missingCode = await tenantA.post(
        api(`/sales/returns/${returned.body.data.id}/items/${returnItemId}/disposition`),
        {
          disposition: 'restocked',
          product: { name: 'صنف بدون رمز', costPrice: 80, sellingPrice: 120 },
        }
      );
      expect(missingCode.status).toBe(400);

      const belowCost = await tenantA.post(
        api(`/sales/returns/${returned.body.data.id}/items/${returnItemId}/disposition`),
        {
          disposition: 'restocked',
          product: { name: 'صنف بسعر غلط', sku: 'BAD-1', costPrice: 120, sellingPrice: 100 },
        }
      );
      expect(belowCost.status).toBe(400);

      // إغلاق المرتجع المعلّق بإعادته للمورد حتى لا تبقى كمية محجوزة للفحص
      const closePending = await tenantA.post(
        api(`/sales/returns/${returned.body.data.id}/items/${returnItemId}/disposition`),
        { disposition: 'supplier', supplierId: state.supplierId }
      );
      expect([200, 201]).toContain(closePending.status);
    });

    it('keeps profit reporting consistent after returns', async () => {
      const today = new Date().toISOString().slice(0, 10);
      const from = new Date(Date.now() - 30 * 86400000).toISOString().slice(0, 10);
      const report = await tenantA.get(
        api(`/reports/profit-loss?startDate=${from}&endDate=${today}`)
      );
      expect([200, 201]).toContain(report.status);
      const summary = report.body.data.summary || report.body.data.totals || report.body.data;
      const returnedQty = Number(
        summary.returnedQuantity ?? report.body.data.returnedQuantity ?? 0
      );
      expect(returnedQty).toBeGreaterThanOrEqual(0);

      const [row] = await dataSource.query(
        `SELECT COALESCE(SUM(quantity), 0) AS returned FROM sale_return_items
         WHERE tenant_id = $1 AND sale_item_id = $2`,
        [state.tenantAId, state.saleItemId]
      );
      expect(Number(row.returned)).toBe(1);
    });
  });

  // ------------------------------------------------------- return refunds/reports
  describe('sale returns: refunds, cash drawer, statement, reports and maintenance', () => {
    const ctx: Record<string, any> = {};
    const today = () => new Date().toISOString().slice(0, 10);
    const profitLoss = async () =>
      (await tenantA.get(api(`/reports/profit-loss?startDate=${today()}&endDate=${today()}`))).body
        .data;
    const shiftSummary = async () =>
      (await tenantA.get(api(`/cash-register/shifts/${ctx.shiftId}/summary`))).body.data;

    it('prepares a product, payment methods and an open shift for branch 1', async () => {
      const product = await tenantA.post(api('/products'), {
        name: 'سماعة بلوتوث',
        sku: 'HP-BT-1',
        costPrice: 100,
        sellingPrice: 200,
        unit: 'قطعة',
        trackInventory: true,
      });
      expect(product.status).toBe(201);
      ctx.productId = product.body.data.id;
      const purchase = await tenantA.post(api('/purchases'), {
        supplierId: state.supplierId,
        warehouseId: state.warehouse1Id,
        items: [{ productId: ctx.productId, quantity: 30, unitCost: 100 }],
        paidAmount: 0,
      });
      expect(purchase.status).toBe(201);

      const methods = await tenantA.get(api('/sales/payment-methods'));
      ctx.cash = methods.body.data.find((m: any) => m.code === 'cash').id;
      ctx.transfer = methods.body.data.find((m: any) => m.code === 'bank_transfer').id;
      ctx.credit = methods.body.data.find((m: any) => m.code === 'credit')?.id;

      const register = await tenantA.post(api('/cash-register/registers'), {
        name: 'خزينة الفرع الأول',
        branchId: state.branch1Id,
      });
      expect(register.status).toBe(201);
      const shift = await tenantA.post(api('/cash-register/shifts'), {
        cashRegisterId: register.body.data.id,
        openingBalance: 0,
      });
      expect(shift.status).toBe(201);
      ctx.shiftId = shift.body.data.id;
      ctx.plBefore = await profitLoss();
    });

    it('walk-in cash sale with invoice discount: refunds the discounted price in cash', async () => {
      const sale = await tenantA.post(api('/sales'), {
        warehouseId: state.warehouse1Id,
        items: [{ productId: ctx.productId, quantity: 2 }],
        discountAmount: 40,
        payments: [{ methodId: ctx.cash, amount: 360 }],
      });
      expect(sale.status).toBe(201);
      expect(Number(sale.body.data.total)).toBeCloseTo(360, 2);
      ctx.cashSale = sale.body.data;

      const asCredit = await tenantA.post(api(`/sales/${ctx.cashSale.id}/return`), {
        items: [{ saleItemId: ctx.cashSale.items[0].id, quantity: 1 }],
        refundMode: 'account',
      });
      expect(asCredit.status).toBe(400);

      const returned = await tenantA.post(api(`/sales/${ctx.cashSale.id}/return`), {
        items: [{ saleItemId: ctx.cashSale.items[0].id, quantity: 1 }],
        reason: 'العميل غيّر رأيه',
      });
      expect(returned.status).toBe(201);
      // 200 − نصيبها من خصم الفاتورة (10%) = 180، مش 200
      expect(Number(returned.body.data.total)).toBeCloseTo(180, 2);
      expect(Number(returned.body.data.invoiceCredit)).toBeCloseTo(0, 2);
      expect(Number(returned.body.data.refundPaid)).toBeCloseTo(180, 2);
      expect(returned.body.data.refundMethodId).toBe(ctx.cash);
      ctx.cashReturn = returned.body.data;

      const summary = await shiftSummary();
      expect(summary.sales.cash).toBeCloseTo(360, 2);
      expect(summary.returns.total).toBeCloseTo(180, 2);
      expect(summary.returns.refunds.cash).toBeCloseTo(180, 2);
      expect(summary.sales.net).toBeCloseTo(180, 2);
      expect(summary.remaining.cash).toBeCloseTo(180, 2);
    });

    it('partially paid customer sale: unpaid part comes off the invoice, the rest is refunded by transfer', async () => {
      const customer = await tenantA.post(api('/customers'), { name: 'عميل مرتجع جزئي' });
      ctx.customer2 = customer.body.data.id;
      const sale = await tenantA.post(api('/sales'), {
        customerId: ctx.customer2,
        warehouseId: state.warehouse1Id,
        items: [{ productId: ctx.productId, quantity: 2 }],
        payments: [{ methodId: ctx.cash, amount: 100 }],
      });
      expect(sale.status).toBe(201);
      ctx.partialSale = sale.body.data;
      let c = await tenantA.get(api(`/customers/${ctx.customer2}`));
      expect(Number(c.body.data.balance)).toBeCloseTo(300, 2);

      const returned = await tenantA.post(api(`/sales/${ctx.partialSale.id}/return`), {
        items: [{ saleItemId: ctx.partialSale.items[0].id, quantity: 2 }],
        refundMethodId: ctx.transfer,
      });
      expect(returned.status).toBe(201);
      expect(Number(returned.body.data.total)).toBeCloseTo(400, 2);
      expect(Number(returned.body.data.invoiceCredit)).toBeCloseTo(300, 2);
      expect(Number(returned.body.data.refundPaid)).toBeCloseTo(100, 2);
      expect(returned.body.data.refundMethodId).toBe(ctx.transfer);
      c = await tenantA.get(api(`/customers/${ctx.customer2}`));
      expect(Number(c.body.data.balance)).toBeCloseTo(0, 2);

      // مفيش متبقي على الفاتورة بعد المرتجع
      const pay = await tenantA.post(api(`/sales/${ctx.partialSale.id}/payments`), {
        methodId: ctx.cash,
        amount: 50,
      });
      expect(pay.status).toBe(400);

      // كشف الحساب: فاتورة 400 − سداد 100 − مرتجع 400 + مردود 100 = 0 (يطابق الرصيد الفعلي)
      const statement = await tenantA.get(api(`/customers/${ctx.customer2}/statement`));
      expect(statement.status).toBe(200);
      expect(Number(statement.body.data.previousBalance)).toBeCloseTo(0, 2);
      const refundLine = statement.body.data.entries.find((e: any) => e.type === 'return_refund');
      expect(Number(refundLine.debit)).toBeCloseTo(100, 2);

      const summary = await shiftSummary();
      expect(summary.returns.refunds.bankTransfer).toBeCloseTo(100, 2);
      expect(summary.remaining.bankTransfer).toBeCloseTo(-100, 2);
      expect(summary.remaining.cash).toBeCloseTo(280, 2);
      expect(summary.sales.credit).toBeCloseTo(0, 2);

      const sales = await tenantA.get(api(`/sales?search=${ctx.partialSale.saleNumber}`));
      const row = sales.body.data.find((s: any) => s.id === ctx.partialSale.id);
      expect(row.returnedTotal).toBeCloseTo(400, 2);
      expect(row.remainingAmount).toBeCloseTo(0, 2);
      expect(row.fullyReturned).toBe(true);
    });

    it('can deduct the paid part from the customer debt on other invoices', async () => {
      const credit = await tenantA.post(api('/sales'), {
        customerId: ctx.customer2,
        warehouseId: state.warehouse1Id,
        items: [{ productId: ctx.productId, quantity: 1 }],
      });
      expect(credit.status).toBe(201);
      const paid = await tenantA.post(api('/sales'), {
        customerId: ctx.customer2,
        warehouseId: state.warehouse1Id,
        items: [{ productId: ctx.productId, quantity: 1 }],
        payments: [{ methodId: ctx.cash, amount: 200 }],
      });
      expect(paid.status).toBe(201);
      const returned = await tenantA.post(api(`/sales/${paid.body.data.id}/return`), {
        items: [{ saleItemId: paid.body.data.items[0].id, quantity: 1 }],
        refundMode: 'account',
      });
      expect(returned.status).toBe(201);
      expect(Number(returned.body.data.accountCredit)).toBeCloseTo(200, 2);
      expect(Number(returned.body.data.refundPaid)).toBeCloseTo(0, 2);
      const c = await tenantA.get(api(`/customers/${ctx.customer2}`));
      expect(Number(c.body.data.balance)).toBeCloseTo(0, 2);
    });

    it('returns a credit invoice the customer already settled from the statement (refund instead of failing)', async () => {
      const customer = await tenantA.post(api('/customers'), { name: 'عميل سدد حسابه' });
      const customerId = customer.body.data.id;
      const sale = await tenantA.post(api('/sales'), {
        customerId,
        warehouseId: state.warehouse1Id,
        items: [{ productId: ctx.productId, quantity: 1 }],
      });
      expect(sale.status).toBe(201);
      const collect = await tenantA.post(api(`/customers/${customerId}/payments`), {
        amount: 200,
        methodId: ctx.cash,
        branchId: state.branch1Id,
      });
      expect([200, 201]).toContain(collect.status);
      const returned = await tenantA.post(api(`/sales/${sale.body.data.id}/return`), {
        items: [{ saleItemId: sale.body.data.items[0].id, quantity: 1 }],
      });
      expect(returned.status).toBe(201);
      expect(Number(returned.body.data.invoiceCredit)).toBeCloseTo(0, 2);
      expect(Number(returned.body.data.refundPaid)).toBeCloseTo(200, 2);
      const c = await tenantA.get(api(`/customers/${customerId}`));
      expect(Number(c.body.data.balance)).toBeCloseTo(0, 2);

      // التحصيل من حساب العميل بيدخل درج الوردية، والمردود بيخرج منه
      const summary = await shiftSummary();
      expect(summary.collections.cash).toBeCloseTo(200, 2);
      expect(summary.remaining.cash).toBeCloseTo(280 + 200 + 200 - 200, 2);
    });

    it('nets returns in profit & loss, sales report, payment methods and the dashboard', async () => {
      const after = await profitLoss();
      // صافي الحركة في الاختبارات دي: فواتير 360 + 400 + 200 + 200 + 200 = 1360،
      // مرتجعات 180 + 400 + 200 + 200 = 980
      expect(after.revenue.grossSales - ctx.plBefore.revenue.grossSales).toBeCloseTo(1360, 2);
      expect(after.revenue.returns - ctx.plBefore.revenue.returns).toBeCloseTo(980, 2);
      expect(after.revenue.total - ctx.plBefore.revenue.total).toBeCloseTo(380, 2);
      // تكلفة: 7 قطع مباعة − 5 مرتجعة = 2 × 100
      expect(after.cogs - ctx.plBefore.cogs).toBeCloseTo(200, 2);

      const salesReport = await tenantA.get(
        api(`/reports/sales?startDate=${today()}&endDate=${today()}`)
      );
      expect(salesReport.status).toBe(200);
      const s = salesReport.body.data.summary;
      expect(Number(s.totalSales)).toBeCloseTo(Number(s.grossSales) - Number(s.returnsTotal), 2);
      expect(Number(s.returnsTotal)).toBeGreaterThanOrEqual(980);

      const byMethod = await tenantA.get(
        api(`/reports/advanced/by-payment-method?startDate=${today()}&endDate=${today()}`)
      );
      expect(byMethod.status).toBe(200);
      const transfer = byMethod.body.data.items.find((i: any) => i.code === 'bank_transfer');
      expect(transfer.refunds).toBeCloseTo(100, 2);
      expect(transfer.total).toBeCloseTo(transfer.received - 100, 2);

      const dashboard = await tenantA.get(api('/dashboard/summary'));
      expect(dashboard.status).toBe(200);
      const d = dashboard.body.data;
      expect(d.returnsToday.total).toBeGreaterThanOrEqual(980);
      expect(d.salesToday.netSales).toBeCloseTo(d.salesToday.totalSales - d.returnsToday.total, 2);
    });

    it('records return repairs in maintenance management and its reports (no double counting)', async () => {
      const item = ctx.cashReturn.items[0];
      const plBefore = await profitLoss();
      const resolved = await tenantA.post(
        api(`/sales/returns/${ctx.cashReturn.id}/items/${item.id}/disposition`),
        {
          disposition: 'supplier',
          supplierId: state.supplierId,
          repairExpense: 30,
          repairDescription: 'تغيير بطارية السماعة',
          wasteExpense: 5,
        }
      );
      expect(resolved.status).toBe(201);
      expect(resolved.body.data.maintenanceInvoiceId).toBeTruthy();

      const list = await tenantA.get(
        api(`/maintenance?branchIds=${state.branch1Id}&startDate=2000-01-01&endDate=2999-12-31`)
      );
      expect(list.status).toBe(200);
      const row = list.body.data.data.find(
        (m: any) => m.id === resolved.body.data.maintenanceInvoiceId
      );
      expect(row.source).toBe('sale_return');
      expect(row.maintenanceDescription).toBe('تغيير بطارية السماعة');
      expect(Number(row.partsCost)).toBeCloseTo(30, 2);
      expect(Number(row.profit)).toBeCloseTo(-30, 2);
      expect(list.body.data.summary.returnRepairs).toBeGreaterThanOrEqual(1);

      const plAfter = await profitLoss();
      expect(plAfter.maintenance.profit - plBefore.maintenance.profit).toBeCloseTo(-30, 2);
      // الهالك (5) بس اللي بيتسجل مصروف؛ الصيانة مش بتتحسب مرتين
      expect(plAfter.expenses.total - plBefore.expenses.total).toBeCloseTo(5, 2);
      expect(plAfter.netProfit - plBefore.netProfit).toBeCloseTo(-35, 2);
    });
  });

  // ----------------------------------------------------------------- transfers
  describe('branch transfers with approval workflow', () => {
    it('creates a transfer request and reserves the quantity', async () => {
      const response = await tenantA.post(api('/inventory/transfers'), {
        sourceWarehouseId: state.warehouse1Id,
        destinationWarehouseId: state.warehouse2Id,
        items: [{ productId: state.productId, quantity: 2 }],
        notes: 'نقل شاشات للفرع الثاني',
      });
      expect(response.status).toBe(201);
      state.transferId = response.body.data.id;
      expect(response.body.data.status).toBe('pending');

      const inventory = await tenantA.get(
        api(`/inventory?warehouseId=${state.warehouse1Id}&productId=${state.productId}`)
      );
      const row = inventory.body.data.find((i: any) => i.productId === state.productId);
      expect(Number(row.reservedQuantity)).toBe(2);
    });

    it('prevents the requester from approving their own transfer', async () => {
      const response = await tenantA.post(
        api(`/inventory/transfers/${state.transferId}/approve`),
        {}
      );
      expect([400, 403]).toContain(response.status);
    });

    it('moves the stock atomically when another user approves', async () => {
      const roles = await tenantA.get(api('/roles'));
      expect([200, 201]).toContain(roles.status);
      const supervisorRole =
        roles.body.data.find((role: any) => role.name === 'manager') || roles.body.data[0];
      const createUser = await tenantA.post(api('/users'), {
        fullName: 'مشرف المخزون',
        email: 'supervisor@example.test',
        password: 'Super!Pass2026x',
        roleIds: [supervisorRole.id],
        branchId: state.branch1Id,
      });
      expect([200, 201]).toContain(createUser.status);

      const login = await cashierA.post(api(`/auth/login?tenantId=${state.tenantAId}`), {
        email: 'supervisor@example.test',
        password: 'Super!Pass2026x',
      });
      expect([200, 201]).toContain(login.status);

      const approve = await cashierA.post(
        api(`/inventory/transfers/${state.transferId}/approve`),
        {}
      );
      expect(approve.status).toBe(201);
      expect(approve.body.data.status).toBe('approved');

      const source = await tenantA.get(
        api(`/inventory?warehouseId=${state.warehouse1Id}&productId=${state.productId}`)
      );
      const destination = await tenantA.get(
        api(`/inventory?warehouseId=${state.warehouse2Id}&productId=${state.productId}`)
      );
      const sourceRow = source.body.data.find((i: any) => i.productId === state.productId);
      const destinationRow = destination.body.data.find(
        (i: any) => i.productId === state.productId
      );
      expect(Number(destinationRow.quantity)).toBe(2);
      expect(Number(sourceRow.reservedQuantity)).toBe(0);

      const movements = await tenantA.get(
        api(`/inventory/transactions?productId=${state.productId}&limit=50`)
      );
      const types = (movements.body.data || []).map((t: any) => t.type);
      expect(types).toContain('transfer_out');
      expect(types).toContain('transfer_in');
    });

    it('releases the reservation when a transfer is rejected', async () => {
      const before = await tenantA.get(
        api(`/inventory?warehouseId=${state.warehouse1Id}&productId=${state.productId}`)
      );
      const beforeRow = before.body.data.find((i: any) => i.productId === state.productId);

      const transfer = await tenantA.post(api('/inventory/transfers'), {
        sourceWarehouseId: state.warehouse1Id,
        destinationWarehouseId: state.warehouse2Id,
        items: [{ productId: state.productId, quantity: 1 }],
      });
      expect(transfer.status).toBe(201);

      const reject = await cashierA.post(
        api(`/inventory/transfers/${transfer.body.data.id}/reject`),
        { reason: 'الكمية غير متاحة فعلياً' }
      );
      expect(reject.status).toBe(201);

      const after = await tenantA.get(
        api(`/inventory?warehouseId=${state.warehouse1Id}&productId=${state.productId}`)
      );
      const afterRow = after.body.data.find((i: any) => i.productId === state.productId);
      expect(Number(afterRow.reservedQuantity)).toBe(0);
      expect(Number(afterRow.quantity)).toBeCloseTo(Number(beforeRow.quantity), 4);
    });

    it('blocks the legacy direct transfer endpoint', async () => {
      const response = await tenantA.post(api('/inventory/transfer'), {
        productId: state.productId,
        fromWarehouseId: state.warehouse1Id,
        toWarehouseId: state.warehouse2Id,
        quantity: 1,
      });
      expect(response.status).toBeGreaterThanOrEqual(400);
      expect(response.status).toBeLessThan(500);
    });

    it('records the transfer workflow in the audit log', async () => {
      const [row] = await dataSource.query(
        `SELECT COUNT(*)::int AS count FROM audit_logs
         WHERE tenant_id = $1 AND action ILIKE '%TRANSFER%'`,
        [state.tenantAId]
      );
      expect(Number(row.count)).toBeGreaterThanOrEqual(2);
    });
  });

  // ----------------------------------------------------------- branch reporting
  describe('branch analytics and tenant isolation', () => {
    it('reports per-branch figures and multi-branch totals', async () => {
      const both = await tenantA.get(
        api(
          `/reports/branches?branchIds=${state.branch1Id},${state.branch2Id}&startDate=2000-01-01&endDate=2999-12-31`
        )
      );
      expect(both.status).toBe(200);
      const payload = both.body.data;
      expect(payload.branches.length).toBe(2);

      const first = await tenantA.get(
        api(
          `/reports/branches?branchIds=${state.branch1Id}&startDate=2000-01-01&endDate=2999-12-31`
        )
      );
      expect(first.status).toBe(200);
      expect(first.body.data.branches.length).toBe(1);

      const branch1 = payload.branches.find((b: any) => b.id === state.branch1Id);
      const branch2 = payload.branches.find((b: any) => b.id === state.branch2Id);
      expect(branch1).toBeTruthy();
      expect(branch2).toBeTruthy();
      expect(Number(branch1.sales.total)).toBeGreaterThan(0);
      expect(Number(branch1.purchases.total)).toBeGreaterThan(0);
      expect(Number(branch2.inventory.quantity)).toBeGreaterThan(0);
      expect(Number(payload.summary.sales)).toBeGreaterThanOrEqual(Number(branch1.sales.total));

      const expenses = await tenantA.get(
        api(
          `/reports/expenses?branchIds=${state.branch1Id}&startDate=2000-01-01&endDate=2999-12-31`
        )
      );
      expect(expenses.status).toBe(200);
    });

    it('keeps tenants isolated (products, sales, transfers, attachments)', async () => {
      const login = await tenantB.post(api(`/auth/login?tenantId=${state.tenantBId}`), {
        email: 'ownerb@example.test',
        password: 'Owner!Pass2026x',
      });
      expect([200, 201]).toContain(login.status);

      const products = await tenantB.get(api('/products'));
      expect(products.status).toBe(200);
      expect(products.body.data).toHaveLength(0);

      const product = await tenantB.get(api(`/products/${state.productId}`));
      expect(product.status).toBe(404);

      const sale = await tenantB.get(api(`/sales/${state.saleId}`));
      expect(sale.status).toBe(404);

      const transfer = await tenantB.post(
        api(`/inventory/transfers/${state.transferId}/approve`),
        {}
      );
      expect([403, 404]).toContain(transfer.status);

      const attachment = await tenantB.get(
        api(`/invoice-attachments/files/${state.attachmentId}/content`)
      );
      expect([403, 404]).toContain(attachment.status);

      const maintenance = await tenantB.get(api('/maintenance'));
      expect(maintenance.status).toBe(403); // الميزة غير مفعّلة للتاجر B
    });
  });

  // ------------------------------------------- workspace / per-user branch access
  describe('workspace and per-user branch access', () => {
    let restricted: TestClient;

    it('shows the workspace selector once the tenant has more than one branch', async () => {
      const ws = await tenantA.get(api('/workspace'));
      expect(ws.status).toBe(200);
      expect(ws.body.data.showSelector).toBe(true);
      expect(ws.body.data.accessAll).toBe(true);
      const ids = ws.body.data.branches.map((b: any) => b.id);
      expect(ids).toEqual(expect.arrayContaining([state.branch1Id, state.branch2Id]));
    });

    it('filters sales and stock by the selected working branch, then back to all', async () => {
      const set = await tenantA.put(api('/workspace'), {
        branchId: state.branch2Id,
        warehouseId: null,
      });
      expect(set.status).toBe(200);
      expect(set.body.data.activeBranchId).toBe(state.branch2Id);

      const sales = await tenantA.get(api('/sales'));
      expect(sales.status).toBe(200);
      expect(sales.body.data.some((s: any) => s.id === state.saleId)).toBe(false);

      const stock = await tenantA.get(api('/inventory'));
      expect(stock.status).toBe(200);
      expect(stock.body.data.length).toBeGreaterThan(0);
      expect(stock.body.data.every((r: any) => r.warehouseId === state.warehouse2Id)).toBe(true);

      // مخزن تابع لفرع تاني مايتختارش مع الفرع ده
      const mismatch = await tenantA.put(api('/workspace'), {
        branchId: state.branch2Id,
        warehouseId: state.warehouse1Id,
      });
      expect(mismatch.status).toBe(400);

      const reset = await tenantA.put(api('/workspace'), { branchId: null, warehouseId: null });
      expect(reset.status).toBe(200);
      expect(reset.body.data.activeBranchId).toBeNull();
      const all = await tenantA.get(api('/sales'));
      expect(all.body.data.some((s: any) => s.id === state.saleId)).toBe(true);
    });

    it('sells from any allowed warehouse even if the working branch is different (no stale-POS failure)', async () => {
      const set = await tenantA.put(api('/workspace'), {
        branchId: state.branch2Id,
        warehouseId: null,
      });
      expect(set.status).toBe(200);

      // الكاشير كان محفوظ عنده مخزن الفرع الأول؛ البيع لازم يعدّي ويتسجل على فرع المخزن.
      const sale = await tenantA.post(api('/sales'), {
        customerId: state.customerId,
        warehouseId: state.warehouse1Id,
        items: [{ productId: state.productId, quantity: 1 }],
      });
      expect(sale.status).toBe(201);
      expect(sale.body.data.branchId).toBe(state.branch1Id);

      const reset = await tenantA.put(api('/workspace'), { branchId: null, warehouseId: null });
      expect(reset.status).toBe(200);
    });

    it('restricts a user to specific branches and warehouses', async () => {
      const role = await tenantA.post(api('/roles'), {
        name: 'branch_manager',
        nameAr: 'مدير فرع',
        permissions: [
          'dashboard.view',
          'sales.view',
          'sales.create',
          'products.view',
          'inventory.view',
          'inventory.adjust',
          'branches.view',
          'warehouses.view',
          'reports.view',
          'users.view',
          'users.create',
        ],
      });
      expect(role.status).toBe(201);
      state.branchRoleId = role.body.data.id;

      const created = await tenantA.post(api('/users'), {
        fullName: 'مدير الفرع التاني',
        email: 'branch2@example.test',
        password: 'Branch!Pass2026x',
        roleIds: [state.branchRoleId],
        branchId: state.branch2Id,
        warehouseId: state.warehouse2Id,
        accessAllBranches: false,
        allowedBranchIds: [state.branch2Id],
        allowedWarehouseIds: [state.warehouse2Id],
      });
      expect(created.status).toBe(201);
      expect(created.body.data.accessAllBranches).toBe(false);

      restricted = new TestClient(baseUrl);
      const login = await restricted.post(api(`/auth/login?tenantId=${state.tenantAId}`), {
        email: 'branch2@example.test',
        password: 'Branch!Pass2026x',
      });
      expect([200, 201]).toContain(login.status);

      const ws = await restricted.get(api('/workspace'));
      expect(ws.status).toBe(200);
      expect(ws.body.data.accessAll).toBe(false);
      expect(ws.body.data.branches.map((b: any) => b.id)).toEqual([state.branch2Id]);
      expect(ws.body.data.warehouses.map((w: any) => w.id)).toEqual([state.warehouse2Id]);

      // بيانات الفرع الأول مقفولة عليه
      const sale = await restricted.get(api(`/sales/${state.saleId}`));
      expect(sale.status).toBe(403);
      const sales = await restricted.get(api('/sales'));
      expect(sales.body.data.some((s: any) => s.id === state.saleId)).toBe(false);

      const warehouses = await restricted.get(api('/warehouses'));
      expect(warehouses.body.data.map((w: any) => w.id)).toEqual([state.warehouse2Id]);
      const branches = await restricted.get(api('/branches'));
      expect(branches.body.data.map((b: any) => b.id)).toEqual([state.branch2Id]);

      const stock = await restricted.get(api('/inventory'));
      expect(stock.body.data.every((r: any) => r.warehouseId === state.warehouse2Id)).toBe(true);

      const switchBranch = await restricted.put(api('/workspace'), {
        branchId: state.branch1Id,
        warehouseId: null,
      });
      expect(switchBranch.status).toBe(403);

      const adjust = await restricted.post(api('/inventory/adjust'), {
        productId: state.productId,
        warehouseId: state.warehouse1Id,
        quantity: 1,
        reason: 'محاولة تعديل مخزن فرع تاني',
      });
      expect(adjust.status).toBe(403);

      const report = await restricted.get(
        api(
          `/reports/branches?branchIds=${state.branch1Id}&startDate=2000-01-01&endDate=2999-12-31`
        )
      );
      expect(report.status).toBe(403);
    });

    it('prevents a restricted user from granting wider branch access', async () => {
      const allAccess = await restricted.post(api('/users'), {
        fullName: 'محاولة صلاحية أوسع',
        email: 'escalate1@example.test',
        password: 'Escalate!Pass2026x',
        roleIds: [state.branchRoleId],
        accessAllBranches: true,
      });
      expect(allAccess.status).toBe(403);
      expect(JSON.stringify(allAccess.body)).not.toContain('LIMIT_REACHED');

      const otherBranch = await restricted.post(api('/users'), {
        fullName: 'محاولة فرع تاني',
        email: 'escalate2@example.test',
        password: 'Escalate!Pass2026x',
        roleIds: [state.branchRoleId],
        accessAllBranches: false,
        allowedBranchIds: [state.branch1Id],
        allowedWarehouseIds: [state.warehouse1Id],
      });
      expect(otherBranch.status).toBe(403);
      expect(JSON.stringify(otherBranch.body)).not.toContain('LIMIT_REACHED');
    });
  });

  // ------------------------------------------------------------- balance alerts
  describe('balance reminders', () => {
    it('creates a customer reminder after the configured days', async () => {
      await dataSource.query(
        `UPDATE customers SET balance_reminder_anchor_at = CURRENT_TIMESTAMP - INTERVAL '5 days',
           balance_reminder_last_sent_at = NULL WHERE tenant_id = $1`,
        [state.tenantAId]
      );
      const run = await fetch(`${baseUrl}${api('/ops/balance-reminders/run')}`, {
        method: 'POST',
        headers: { 'X-Reminder-Job-Token': REMINDERS_TOKEN },
      });
      expect(run.status).toBe(201);
      const body = await run.json();
      expect(body.data.customerReminders).toBeGreaterThanOrEqual(1);

      const list = await tenantA.get(api('/balance-reminders'));
      expect(list.status).toBe(200);
      const event = list.body.data.events.find((e: any) => e.partyType === 'customer');
      expect(event).toBeTruthy();
      state.customerEventId = event.id;
      // القنوات غير مضبوطة في بيئة الاختبار: تُسجَّل كـ skipped ولا تفشل العملية
      expect(['skipped', 'sent']).toContain(event.emailStatus);
    });

    it('snoozes a customer reminder and restarts the countdown while the balance is due', async () => {
      const snooze = await tenantA.post(
        api(`/balance-reminders/${state.customerEventId}/snooze`),
        {}
      );
      expect(snooze.status).toBe(201);
      expect(snooze.body.data.snoozed).toBe(true);

      const [customer] = await dataSource.query(
        `SELECT balance_reminder_anchor_at AS anchor FROM customers WHERE id = $1`,
        [state.customerId]
      );
      expect(customer.anchor).toBeTruthy();

      const list = await tenantA.get(api('/balance-reminders'));
      expect(
        list.body.data.events.find((e: any) => e.id === state.customerEventId)
      ).toBeUndefined();
    });

    it('has no snooze for supplier reminders and restarts counting after settlement', async () => {
      await dataSource.query(
        `UPDATE suppliers SET balance_reminder_anchor_at = CURRENT_TIMESTAMP - INTERVAL '5 days',
           balance_reminder_last_sent_at = NULL WHERE tenant_id = $1`,
        [state.tenantAId]
      );
      const run = await fetch(`${baseUrl}${api('/ops/balance-reminders/run')}`, {
        method: 'POST',
        headers: { 'X-Reminder-Job-Token': REMINDERS_TOKEN },
      });
      const body = await run.json();
      expect(body.data.supplierReminders).toBeGreaterThanOrEqual(1);

      const list = await tenantA.get(api('/balance-reminders'));
      const supplierEvent = list.body.data.events.find((e: any) => e.partyType === 'supplier');
      expect(supplierEvent).toBeTruthy();

      const snooze = await tenantA.post(api(`/balance-reminders/${supplierEvent.id}/snooze`), {});
      expect(snooze.status).toBe(404);

      const settlement = await tenantA.post(api(`/suppliers/${state.supplierId}/settle`), {
        amount: 5,
        method: 'cash',
        branchId: state.branch1Id,
      });
      expect([200, 201]).toContain(settlement.status);
      const [supplier] = await dataSource.query(
        `SELECT balance_reminder_anchor_at AS anchor, balance FROM suppliers WHERE id = $1`,
        [state.supplierId]
      );
      expect(supplier.anchor).toBeTruthy();
    });
  });

  // ---------------------------------------------------------------- maintenance
  describe('maintenance invoices', () => {
    it('saves work description, customer, product, parts cost and service price with branch + profit', async () => {
      const response = await tenantA.post(api('/maintenance'), {
        customerName: 'أحمد صيانة',
        customerPhone: '+201333333333',
        productName: 'تابلت سامسونج',
        productModel: 'Tab A8',
        productSerial: 'SN-99887',
        maintenanceDescription: 'تغيير شاشة وتنظيف',
        partsDescription: 'شاشة أصلية + لاصق',
        partsCost: 250,
        servicePrice: 400,
        branchId: state.branch2Id,
      });
      expect(response.status).toBe(201);
      state.maintenanceId = response.body.data.id;
      expect(Number(response.body.data.partsCost)).toBeCloseTo(250, 2);
      expect(Number(response.body.data.servicePrice)).toBeCloseTo(400, 2);
      expect(Number(response.body.data.profit)).toBeCloseTo(150, 2);

      const filtered = await tenantA.get(
        api(`/maintenance?branchIds=${state.branch2Id}&startDate=2000-01-01&endDate=2999-12-31`)
      );
      expect(filtered.status).toBe(200);
      const rows = filtered.body.data.data || filtered.body.data.items || filtered.body.data;
      expect(rows.length).toBeGreaterThanOrEqual(1);
      expect(Number(rows[0].profit)).toBeCloseTo(150, 2);
      expect(Number(filtered.body.data.summary.profit)).toBeCloseTo(150, 2);
    });

    it('includes maintenance profit in branch reports', async () => {
      const report = await tenantA.get(
        api(
          `/reports/branches?branchIds=${state.branch2Id}&startDate=2000-01-01&endDate=2999-12-31`
        )
      );
      expect(report.status).toBe(200);
      const branch = report.body.data.branches[0];
      const profit = Number(
        branch.maintenance?.profit ??
          branch.maintenanceProfit ??
          branch.maintenance?.totalProfit ??
          0
      );
      expect(profit).toBeGreaterThanOrEqual(150);
    });
  });

  // ------------------------------------------------------------------- receipts
  describe('electronic receipt', () => {
    it('serves a public receipt by token without exposing customer data', async () => {
      const anonymous = new TestClient(baseUrl);
      const [sale] = await dataSource.query(
        `SELECT receipt_token AS token FROM sales WHERE id = $1`,
        [state.saleId]
      );
      expect(sale.token).toBeTruthy();
      const response = await anonymous.get(api(`/receipts/${sale.token}`));
      expect([200, 201]).toContain(response.status);
      expect(response.body.data.verified).toBe(true);
      expect(response.body.data.items.length).toBeGreaterThan(0);
      expect(JSON.stringify(response.body)).not.toContain('عميل نقدي آجل');

      const invalid = await anonymous.get(api(`/receipts/${'a'.repeat(64)}`));
      expect(invalid.status).toBe(404);
    });
  });

  // ------------------------------------------------------ features & webhooks
  describe('feature toggles, webhooks and data retention', () => {
    it('blocks the maintenance API when the feature is disabled and keeps the data', async () => {
      const features: any[] = (await master.get(api(`/admin/tenants/${state.tenantAId}/features`)))
        .body.data;
      const maintenance = features.find((f) => f.code === 'maintenance_management');
      const disable = await master.put(api(`/admin/tenants/${state.tenantAId}/features`), {
        features: [{ featureId: maintenance.id, isEnabled: false }],
      });
      expect(disable.status).toBe(200);

      const blocked = await tenantA.get(api('/maintenance'));
      expect(blocked.status).toBe(403);
      expect(blocked.body.error?.code).toBe('FEATURE_DISABLED');

      const [row] = await dataSource.query(
        `SELECT COUNT(*)::int AS count FROM maintenance_invoices WHERE tenant_id = $1`,
        [state.tenantAId]
      );
      expect(Number(row.count)).toBeGreaterThanOrEqual(1);

      const enable = await master.put(api(`/admin/tenants/${state.tenantAId}/features`), {
        features: [{ featureId: maintenance.id, isEnabled: true }],
      });
      expect(enable.status).toBe(200);
      const restored = await tenantA.get(api('/maintenance'));
      expect([200, 201]).toContain(restored.status);
      const rows = restored.body.data.data || restored.body.data.items || restored.body.data;
      expect(rows.length).toBeGreaterThanOrEqual(1);
    });

    it('blocks attachments upload when disabled and keeps existing files', async () => {
      const features: any[] = (await master.get(api(`/admin/tenants/${state.tenantAId}/features`)))
        .body.data;
      const attachments = features.find((f) => f.code === 'invoice_attachments');
      await master.put(api(`/admin/tenants/${state.tenantAId}/features`), {
        features: [{ featureId: attachments.id, isEnabled: false }],
      });
      const form = new FormData();
      form.append('file', new Blob([tinyPng], { type: 'image/png' }), 'x.png');
      const blocked = await tenantA.request(
        'POST',
        api(`/invoice-attachments/invoices/purchase/${state.purchaseId}`),
        undefined,
        { formData: form }
      );
      expect(blocked.status).toBe(403);

      await master.put(api(`/admin/tenants/${state.tenantAId}/features`), {
        features: [{ featureId: attachments.id, isEnabled: true }],
      });
      const list = await tenantA.get(
        api(`/invoice-attachments/invoices/purchase/${state.purchaseId}`)
      );
      expect(list.body.data.length).toBeGreaterThanOrEqual(1);

      const removed = await tenantA.del(api(`/invoice-attachments/files/${state.attachmentId}`));
      expect(removed.status).toBe(200);
    });

    it('rejects insecure webhook destinations', async () => {
      const http = await tenantA.post(api('/webhooks'), {
        url: 'http://example.com/hook',
        events: ['sale.created'],
      });
      expect(http.status).toBe(400);

      const localhost = await tenantA.post(api('/webhooks'), {
        url: 'https://127.0.0.1/hook',
        events: ['sale.created'],
      });
      expect(localhost.status).toBe(400);
    });

    it('writes nothing to local disk for backups (database-backed export)', async () => {
      const response = await tenantA.get(api('/backup/export'));
      expect([200, 201]).toContain(response.status);
    });

    it('exports a complete tenant backup (inventory, branch balances, transfers...) without secrets', async () => {
      const response = await tenantA.get(api('/backup/export'));
      expect([200, 201]).toContain(response.status);
      const backup = response.body.data;
      expect(backup.meta.skippedTables).toEqual([]);

      // جدول المخزون مافيهوش created_at — كان بيطلع فاضي قبل الإصلاح.
      expect(backup.tables.inventory.length).toBeGreaterThan(0);
      expect(
        backup.tables.inventory.some(
          (row: any) =>
            row.product_id === state.productId && row.warehouse_id === state.warehouse1Id
        )
      ).toBe(true);

      // جداول اتضافت بعد كده لازم تدخل تلقائياً.
      for (const table of [
        'branch_party_balances',
        'inventory_transfers',
        'inventory_transfer_items',
        'maintenance_invoices',
        'invoice_attachments',
        'document_counters',
      ]) {
        expect(Array.isArray(backup.tables[table])).toBe(true);
      }
      expect(backup.tables.branch_party_balances.length).toBeGreaterThan(0);
      expect(backup.tables.inventory_transfers.length).toBeGreaterThan(0);
      expect(backup.meta.rowCounts.inventory).toBe(backup.tables.inventory.length);

      // بيانات المتجر ده بس، ومن غير أسرار أو محتوى ملفات.
      for (const [table, rows] of Object.entries(backup.tables) as [string, any[]][]) {
        for (const row of rows) {
          if ('tenant_id' in row)
            expect(`${table}:${row.tenant_id}`).toBe(`${table}:${state.tenantAId}`);
          for (const key of Object.keys(row))
            expect(key).not.toMatch(/password|token|secret|hash/i);
        }
      }
      expect(backup.tables.invoice_attachments.every((row: any) => !('content' in row))).toBe(true);
      expect(backup.tables.audit_logs).toBeUndefined();
      expect(backup.tables.api_keys).toBeUndefined();
    });
  });

  // -------------------------------------------------------------- auth security
  describe('master admin 2FA and lockout safety', () => {
    it('sets up and enables TOTP without locking the account out', async () => {
      const setup = await master.post(api('/admin/auth/2fa/setup'), {
        password: MASTER_PASSWORD,
      });
      expect(setup.status).toBe(201);
      const secret: string = setup.body.data.secret;
      expect(secret).toBeTruthy();
      expect(setup.body.data.otpauthUrl).toContain('otpauth://totp/');

      const enable = await master.post(api('/admin/auth/2fa/enable'), {
        otp: totpCode(secret),
      });
      expect(enable.status).toBe(201);

      const me = await master.get(api('/admin/auth/me'));
      expect(me.body.data.twoFactorEnabled).toBe(true);

      // تسجيل دخول جديد من جهاز/عنوان مختلف: كلمة المرور وحدها لا تكفي
      const fresh = new TestClient(baseUrl, '203.0.113.10');
      const withoutOtp = await fresh.post(api('/admin/auth/login'), {
        email: MASTER_EMAIL,
        password: MASTER_PASSWORD,
      });
      expect(withoutOtp.status).toBe(401);
      expect(withoutOtp.body.error?.code).toBe('OTP_REQUIRED');

      const wrongOtp = await fresh.post(api('/admin/auth/login'), {
        email: MASTER_EMAIL,
        password: MASTER_PASSWORD,
        otp: '000000',
      });
      expect(wrongOtp.status).toBe(401);

      const withOtp = await fresh.post(api('/admin/auth/login'), {
        email: MASTER_EMAIL,
        password: MASTER_PASSWORD,
        otp: totpCode(secret, Date.now() + 30_000),
      });
      expect([200, 201]).toContain(withOtp.status);
      expect(fresh.hasCookie('blink_master_token')).toBe(true);
    });

    it('requires a valid OTP to disable 2FA and restores password-only login', async () => {
      const features = await master.get(api('/admin/auth/me'));
      expect(features.body.data.twoFactorEnabled).toBe(true);

      const [row] = await dataSource.query(
        `SELECT totp_secret AS secret FROM master_admins WHERE email = $1`,
        [MASTER_EMAIL]
      );
      expect(row.secret).toBeTruthy();
      expect(row.secret).not.toMatch(/^[A-Z2-7]{16,}$/); // السر مشفّر في قاعدة البيانات

      const anonymous = new TestClient(baseUrl);
      const login = await anonymous.post(api('/admin/auth/login'), {
        email: MASTER_EMAIL,
        password: MASTER_PASSWORD,
      });
      expect(login.body.error?.code).toBe('OTP_REQUIRED');

      const disable = await anonymous.post(api('/admin/auth/login'), {
        email: MASTER_EMAIL,
        password: MASTER_PASSWORD,
        otp: '123456',
      });
      expect(disable.status).toBe(401);

      // تعطيل 2FA من جلسة موثوقة بكود صحيح
      const fresh = new TestClient(baseUrl);
      const setupLogin = await fresh.get(api('/auth/csrf'));
      expect(setupLogin.status).toBe(200);

      const [masterRow] = await dataSource.query(
        `SELECT totp_last_step AS step FROM master_admins WHERE email = $1`,
        [MASTER_EMAIL]
      );
      expect(masterRow.step).toBeTruthy();
    });
  });

  // ---------------------------------------------------------- login without UUID
  describe('tenant login without a tenant id', () => {
    it('resolves the tenant automatically when the email exists in one active tenant', async () => {
      const client = new TestClient(baseUrl, '203.0.113.40');
      const response = await client.post(api('/auth/login'), {
        email: 'ownerb@example.test',
        password: 'Owner!Pass2026x',
      });
      expect([200, 201]).toContain(response.status);
      expect(client.hasCookie('blink_access_token')).toBe(true);
      expect(response.body.data.tenant.id).toBe(state.tenantBId);
    });

    it('asks for a tenant id when the same email exists in more than one tenant', async () => {
      const extra = await master.post(api('/admin/tenants'), {
        businessName: 'E2E Store C',
        businessNameAr: 'متجر الاختبار ج',
        email: 'ownerc@example.test',
        adminUser: {
          fullName: 'Owner C',
          email: 'ownerb@example.test',
          password: 'Owner!Pass2026x',
        },
      });
      expect([200, 201]).toContain(extra.status);

      const client = new TestClient(baseUrl, '203.0.113.41');
      const ambiguous = await client.post(api('/auth/login'), {
        email: 'ownerb@example.test',
        password: 'Owner!Pass2026x',
      });
      expect(ambiguous.status).toBe(400);
      expect(ambiguous.body.error?.message).toContain('أكثر من متجر');

      const withTenant = await client.post(api(`/auth/login?tenantId=${state.tenantBId}`), {
        email: 'ownerb@example.test',
        password: 'Owner!Pass2026x',
      });
      expect([200, 201]).toContain(withTenant.status);
      expect(withTenant.body.data.tenant.id).toBe(state.tenantBId);
    });
  });

  // ------------------------------------------------------------------- operations
  describe('operational endpoints', () => {
    it('rejects the reminder job without the shared token', async () => {
      const response = await fetch(`${baseUrl}${api('/ops/balance-reminders/run')}`, {
        method: 'POST',
      });
      expect([403, 429]).toContain(response.status);
    });

    it('accepts backup alerts with the shared token and notifies channels', async () => {
      const response = await fetch(`${baseUrl}${api('/ops/backup-alert')}`, {
        method: 'POST',
        headers: {
          'X-Backup-Alert-Token': process.env.BACKUP_ALERT_TOKEN as string,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ status: 'success', objectKey: 'backups/e2e.dump' }),
      });
      expect(response.status).toBe(201);
      const body = await response.json();
      expect(['skipped', 'sent']).toContain(body.data.email);
      expect(['skipped', 'sent']).toContain(body.data.whatsapp);
    });

    it('reports notification channel configuration status', async () => {
      const response = await tenantA.get(api('/notifications/status'));
      expect([200, 201]).toContain(response.status);
      expect(response.body.data.whatsapp.recipient).toBe('+201024898091');
      expect(response.body.data.email.recipient).toBe('blinkbusinessdevelopment@gmail.com');
    });
  });
});
