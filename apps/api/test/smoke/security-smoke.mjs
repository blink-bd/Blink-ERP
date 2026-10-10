#!/usr/bin/env node
/**
 * اختبار دخان (Smoke test) لسيناريوهات الأمان والميزات على سيرفر شغال.
 *
 * الاستخدام:
 *   API_URL=http://localhost:3000/api/v1 \
 *   MASTER_EMAIL=master@example.com MASTER_PASSWORD='...' \
 *   node apps/api/test/smoke/security-smoke.mjs
 *
 * بينشئ تاجر تجريبي جديد في كل تشغيل — لا تشغّله على قاعدة الإنتاج.
 */
const API = process.env.API_URL || 'http://localhost:3000/api/v1';
const MASTER_EMAIL = process.env.MASTER_EMAIL || 'master@example.com';
const MASTER_PASSWORD = process.env.MASTER_PASSWORD || 'ChangeMe!Master#2024';

let failures = 0;
let passes = 0;

async function call(method, path, { token, apiKey, body, headers = {} } = {}) {
  const h = { 'Content-Type': 'application/json', ...headers };
  if (token) h.Authorization = `Bearer ${token}`;
  if (apiKey) h['X-API-Key'] = apiKey;
  const res = await fetch(API + path, {
    method,
    headers: h,
    body: body ? JSON.stringify(body) : undefined,
  });
  const text = await res.text();
  let json;
  try {
    json = JSON.parse(text);
  } catch {
    json = text;
  }
  return { status: res.status, body: json };
}

function check(name, cond, extra) {
  if (cond) {
    passes++;
    console.log(`  ✅ ${name}`);
  } else {
    failures++;
    console.log(`  ❌ ${name}`, extra !== undefined ? JSON.stringify(extra).slice(0, 400) : '');
  }
}

const data = (r) => r.body?.data ?? r.body;
const uniq = Date.now().toString(36);

async function main() {
  console.log(`API: ${API}`);

  // ------------------------------------------------------------ master admin
  console.log('\n[1] Master admin');
  const badMaster = await call('POST', '/admin/auth/login', {
    body: { email: MASTER_EMAIL, password: 'wrong-password-123' },
  });
  check('wrong master password → 401', badMaster.status === 401, badMaster);
  const ml = await call('POST', '/admin/auth/login', {
    body: { email: MASTER_EMAIL, password: MASTER_PASSWORD },
  });
  check('master login', ml.status < 300 && data(ml)?.accessToken, ml);
  const mt = data(ml)?.accessToken;
  if (!mt) throw new Error('cannot continue without master token');
  const noTok = await call('GET', '/admin/dashboard');
  check('admin dashboard without token → 401', noTok.status === 401, noTok);

  // ------------------------------------------------------------ tenant
  console.log('\n[2] Tenant onboarding');
  const ownerEmail = `owner-${uniq}@example.com`;
  const ownerPassword = 'Owner#Pass2024!x';
  const ct = await call('POST', '/admin/tenants', {
    token: mt,
    body: {
      businessName: `Smoke ${uniq}`,
      businessNameAr: `متجر ${uniq}`,
      email: `shop-${uniq}@example.com`,
      adminUser: { fullName: 'Owner', email: ownerEmail, password: ownerPassword },
    },
  });
  check('create tenant', ct.status < 300, ct);
  const tenantId = data(ct)?.tenant?.id || data(ct)?.id;
  check('tenant id returned', !!tenantId, data(ct));

  const tokenRes = await call('POST', `/auth/login?tenantId=${tenantId}`, {
    body: { email: ownerEmail, password: ownerPassword },
  });
  check('owner login', tokenRes.status < 300, tokenRes);
  let ot = data(tokenRes)?.accessToken;

  const crossTenant = await call(
    'POST',
    `/auth/login?tenantId=00000000-0000-4000-8000-000000000000`,
    {
      body: { email: ownerEmail, password: ownerPassword },
    }
  );
  check('login against another tenant id → 401', crossTenant.status === 401, crossTenant);
  const badTenantId = await call('POST', `/auth/login?tenantId=abc`, {
    body: { email: ownerEmail, password: ownerPassword },
  });
  check('malformed tenantId → 400', badTenantId.status === 400, badTenantId);

  // ------------------------------------------------------------ features
  console.log('\n[3] Feature gating');
  const feats = await call('GET', `/admin/tenants/${tenantId}/features`, { token: mt });
  check('list tenant features (admin)', feats.status < 300, feats);
  const featList = data(feats) || [];
  const byCode = Object.fromEntries(
    (Array.isArray(featList) ? featList : featList.features || []).map((f) => [f.code, f])
  );
  const setFeature = async (code, isEnabled) => {
    const f = byCode[code];
    if (!f) return { status: 0, body: `feature ${code} not found` };
    return call('PUT', `/admin/tenants/${tenantId}/features`, {
      token: mt,
      body: { features: [{ featureId: f.featureId || f.id, isEnabled }] },
    });
  };

  // warehouses: create 2nd warehouse requires feature
  await setFeature('warehouses', false);
  const wh2Off = await call('POST', '/warehouses', { token: ot, body: { name: 'مخزن 2' } });
  check('2nd warehouse blocked when feature off → 403', wh2Off.status === 403, wh2Off);
  const r1 = await setFeature('warehouses', true);
  check('enable warehouses feature', r1.status < 300, r1);
  const wh2On = await call('POST', '/warehouses', { token: ot, body: { name: 'مخزن 2' } });
  check('2nd warehouse allowed when feature on', wh2On.status < 300, wh2On);

  // limits
  const lim = await call('PUT', `/admin/tenants/${tenantId}/limits`, {
    token: mt,
    body: { maxUsers: 2, maxWarehouses: 2, maxBranches: null },
  });
  check('set tenant limits', lim.status < 300, lim);
  const wh3 = await call('POST', '/warehouses', { token: ot, body: { name: 'مخزن 3' } });
  check(
    'warehouse over limit → 403 LIMIT_REACHED',
    wh3.status === 403 && JSON.stringify(wh3.body).includes('LIMIT_REACHED'),
    wh3
  );
  const usage = await call('GET', `/admin/tenants/${tenantId}/usage`, { token: mt });
  check('tenant usage', usage.status < 300, usage);

  // barcode labels
  await setFeature('barcode_printing', false);
  const prod = await call('POST', '/products', {
    token: ot,
    body: {
      name: `منتج ${uniq}`,
      sellingPrice: 10,
      costPrice: 5,
      barcode: `99${Date.now()}`.slice(0, 13),
      initialQuantity: 20,
    },
  });
  check('create product', prod.status < 300, prod);
  const productId = data(prod)?.id;
  const lblOff = await call('POST', '/products/barcode-labels', {
    token: ot,
    body: { items: [{ productId, copies: 2 }] },
  });
  check('barcode labels blocked when feature off', lblOff.status === 403, lblOff);
  await setFeature('barcode_printing', true);
  const lblOn = await call('POST', '/products/barcode-labels', {
    token: ot,
    body: { items: [{ productId, copies: 2 }] },
  });
  check('barcode labels allowed when feature on', lblOn.status < 300, lblOn);

  // ------------------------------------------------------------ users & roles
  console.log('\n[4] Users, roles & privilege escalation');
  const roles = data(await call('GET', '/roles', { token: ot })) || [];
  const ownerRole = roles.find((r) => r.name === 'owner');
  check('roles listed (owner role present)', !!ownerRole, roles);

  const perms = await call('GET', '/roles/permissions', { token: ot });
  check('permissions catalog with labels', perms.status < 300 && Array.isArray(data(perms)), perms);

  const cashierRole = await call('POST', '/roles', {
    token: ot,
    body: {
      name: `cashier_${uniq}`,
      nameAr: 'كاشير',
      permissions: ['sales.view', 'sales.create', 'products.view', 'users.update', 'users.view'],
    },
  });
  check('create custom role', cashierRole.status < 300, cashierRole);
  const cashierRoleId = data(cashierRole)?.id;

  const cashierEmail = `cashier-${uniq}@example.com`;
  const cashierPassword = 'Cashier#Pass2024!';
  const cu = await call('POST', '/users', {
    token: ot,
    body: {
      email: cashierEmail,
      fullName: 'Cashier',
      password: cashierPassword,
      roleIds: [cashierRoleId],
    },
  });
  check('create cashier user', cu.status < 300, cu);
  const cashierId = data(cu)?.id;

  const third = await call('POST', '/users', {
    token: ot,
    body: {
      email: `third-${uniq}@example.com`,
      fullName: 'Third',
      password: cashierPassword,
      roleIds: [cashierRoleId],
    },
  });
  check('maxUsers=2 enforced → 403', third.status === 403, third);

  const cl = await call('POST', `/auth/login?tenantId=${tenantId}`, {
    body: { email: cashierEmail, password: cashierPassword },
  });
  check('cashier login', cl.status < 300, cl);
  const ctok = data(cl)?.accessToken;

  const meOwner = data(await call('GET', '/users/me', { token: ot }));
  const ownerId = meOwner?.id;
  const takeover = await call('POST', `/users/${ownerId}/reset-password`, {
    token: ctok,
    body: { newPassword: 'Hacked#Pass2024!' },
  });
  check(
    'cashier with users.update cannot reset owner password → 403',
    takeover.status === 403,
    takeover
  );
  const escalate = await call('PUT', `/users/${cashierId}`, {
    token: ctok,
    body: { roleIds: [ownerRole?.id] },
  });
  check('cashier cannot grant himself owner role → 403', escalate.status === 403, escalate);
  const selfRole = await call('POST', '/roles', {
    token: ctok,
    body: { name: `evil_${uniq}`, nameAr: 'شرير', permissions: ['settings.update'] },
  });
  check('cashier cannot create roles (no roles.manage) → 403', selfRole.status === 403, selfRole);
  const editOwnerRole = await call('PUT', `/roles/${ownerRole?.id}`, {
    token: ot,
    body: { permissions: [] },
  });
  check('system owner role is immutable → 403', editOwnerRole.status === 403, editOwnerRole);
  const selfDelete = await call('DELETE', `/users/${ownerId}`, { token: ot });
  check('owner cannot delete himself → 400', selfDelete.status === 400, selfDelete);

  // POS gating for JWT users
  await setFeature('pos', false);
  const saleBody = { warehouseId: data(wh2On)?.id, items: [{ productId, quantity: 1 }] };
  const posOff = await call('POST', '/sales', { token: ot, body: saleBody });
  check('POST /sales without POS feature → 403', posOff.status === 403, posOff);
  await setFeature('pos', true);
  await setFeature('warehouses', false);
  const nonMain = await call('POST', '/sales', { token: ot, body: saleBody });
  check(
    'sale from non-main warehouse blocked when warehouses off → 403',
    nonMain.status === 403,
    nonMain
  );
  await setFeature('warehouses', true);
  const whList = data(await call('GET', '/warehouses', { token: ot })) || [];
  check('warehouses list returns all when feature on', whList.length >= 2, whList);
  const mainWh = whList.find((w) => w.isMain);
  const methods = data(await call('GET', '/sales/payment-methods', { token: ot })) || [];
  const sale = await call('POST', '/sales', {
    token: ot,
    body: {
      warehouseId: mainWh?.id,
      items: [{ productId, quantity: 3 }],
      payments: [{ methodId: methods[0]?.id, amount: 30 }],
    },
  });
  check('real sale from main warehouse', sale.status < 300, sale);
  const badTier = await call('POST', '/sales', {
    token: ot,
    body: { warehouseId: mainWh?.id, items: [{ productId, quantity: 1, priceTier: 'free' }] },
  });
  check('invalid priceTier rejected → 400', badTier.status === 400, badTier);

  // reset cashier password by owner → old token revoked
  const rp = await call('POST', `/users/${cashierId}/reset-password`, {
    token: ot,
    body: { newPassword: 'NewCashier#2024!' },
  });
  check('owner resets cashier password', rp.status < 300, rp);
  const oldTok = await call('GET', '/users/me', { token: ctok });
  check('cashier old token revoked → 401', oldTok.status === 401, oldTok);

  // ------------------------------------------------------------ API keys
  console.log('\n[5] API keys');
  await setFeature('api_access', false);
  const akOff = await call('POST', '/api-keys', {
    token: ot,
    body: { name: 'shop', permissions: ['products.view'] },
  });
  check('API key creation blocked without api_access', akOff.status === 403, akOff);
  await setFeature('api_access', true);
  const ak = await call('POST', '/api-keys', {
    token: ot,
    body: { name: 'shop', permissions: ['products.view'] },
  });
  check('create API key', ak.status < 300 && data(ak)?.key?.startsWith('blk_live_'), ak);
  const key = data(ak)?.key;
  const viaKey = await call('GET', '/products', { apiKey: key });
  check('API key can list products', viaKey.status < 300, viaKey);
  const keyWrite = await call('POST', '/products', {
    apiKey: key,
    body: { name: 'x', sellingPrice: 1 },
  });
  check('API key without products.create cannot write → 403', keyWrite.status === 403, keyWrite);
  const keyUsers = await call('GET', '/users', { apiKey: key });
  check(
    'API key cannot reach users management',
    keyUsers.status === 401 || keyUsers.status === 403,
    keyUsers
  );
  const keyKeys = await call('POST', '/api-keys', {
    apiKey: key,
    body: { name: 'x', permissions: ['products.view'] },
  });
  check('API key cannot mint new keys', keyKeys.status === 401 || keyKeys.status === 403, keyKeys);
  const badKey = await call('GET', '/products', { apiKey: 'blk_live_invalid' });
  check('invalid API key → 401', badKey.status === 401, badKey);
  await call('DELETE', `/api-keys/${data(ak)?.id}`, { token: ot });
  const revoked = await call('GET', '/products', { apiKey: key });
  check('revoked API key → 401', revoked.status === 401, revoked);

  // ------------------------------------------------------------ change password
  console.log('\n[6] Change own password');
  const cpBad = await call('POST', '/auth/change-password', {
    token: ot,
    body: { currentPassword: 'wrong-wrong-1', newPassword: 'Another#Pass2024!' },
  });
  check('change password with wrong current → 401', cpBad.status === 401, cpBad);
  const cp = await call('POST', '/auth/change-password', {
    token: ot,
    body: { currentPassword: ownerPassword, newPassword: 'Another#Pass2024!' },
  });
  check('change password OK + new token', cp.status < 300 && data(cp)?.accessToken, cp);
  const stale = await call('GET', '/users/me', { token: ot });
  check('old owner token revoked after password change', stale.status === 401, stale);
  ot = data(cp)?.accessToken;

  // ------------------------------------------------------------ audit
  console.log('\n[7] Audit trail');
  const logs = await call('GET', `/admin/tenants/${tenantId}/audit-logs?limit=100`, { token: mt });
  const actions = new Set((data(logs) || []).map((l) => l.action));
  for (const a of [
    'TENANT_LOGIN',
    'USER_CREATED',
    'USER_PASSWORD_RESET',
    'PASSWORD_CHANGED',
    'API_KEY_CREATED',
  ]) {
    check(`audit has ${a}`, actions.has(a), Array.from(actions));
  }

  // ------------------------------------------------------------ advanced reports
  console.log('\n[8] Advanced reports');
  await setFeature('advanced_reports', false);
  const advOff = await call('GET', '/reports/advanced/product-profitability', { token: ot });
  check('advanced report blocked when feature off', advOff.status === 403, advOff);
  const advOn = await setFeature('advanced_reports', true);
  check('enable advanced_reports', advOn.status < 300, advOn);
  for (const r of [
    'product-profitability',
    'by-cashier',
    'by-payment-method',
    'inventory-valuation',
    'dead-stock?days=30',
    'sales-heatmap',
    'top-customers',
  ]) {
    const res = await call('GET', `/reports/advanced/${r}`, { token: ot });
    check(`report ${r}`, res.status < 300, res);
    if (r === 'product-profitability')
      check(
        'profitability shows the sale (qty 3, profit 15)',
        data(res)?.items?.[0]?.quantity === 3 && data(res)?.items?.[0]?.profit === 15,
        data(res)
      );
  }
  const pl = await call('GET', '/reports/profit-loss', { token: ot });
  check('profit-loss net sales = 30', data(pl)?.revenue?.sales === 30, data(pl));

  // ------------------------------------------------------------ import / export
  console.log('\n[9] CSV import / export');
  await setFeature('import_export', false);
  const expOff = await call('GET', '/data/export/products', { token: ot });
  check('export blocked when import_export off', expOff.status === 403, expOff);
  await setFeature('import_export', true);
  const expRes = await fetch(API + '/data/export/products', {
    headers: { Authorization: `Bearer ${ot}` },
  });
  const expBytes = new Uint8Array(await expRes.arrayBuffer());
  const expText = new TextDecoder().decode(expBytes);
  const hasBom = expBytes[0] === 0xef && expBytes[1] === 0xbb && expBytes[2] === 0xbf;
  check(
    'export products CSV (UTF-8 BOM for Excel)',
    expRes.status === 200 && hasBom && expText.includes(`منتج ${uniq}`),
    expText.slice(0, 200)
  );
  const upload = async (entity, csv, dryRun) => {
    const fd = new FormData();
    fd.append('file', new Blob([csv], { type: 'text/csv' }), `${entity}.csv`);
    const res = await fetch(`${API}/data/import/${entity}?dryRun=${dryRun}`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${ot}` },
      body: fd,
    });
    return { status: res.status, body: await res.json() };
  };
  const csv =
    'اسم المنتج,كود المنتج,سعر التكلفة,سعر البيع,القسم\n"=HYPERLINK(""x"")",IMP-1,5,9,مستورد\nمنتج مستورد 2,IMP-2,abc,9,\n';
  const dry = await upload('products', csv, true);
  check(
    'dry-run reports row errors without writing',
    dry.status < 300 && data(dry)?.applied === false && data(dry)?.errors?.length === 1,
    dry
  );
  const good =
    'اسم المنتج,كود المنتج,سعر التكلفة,سعر البيع,القسم\n"=cmd|calc",IMP-1,5,9,مستورد\nمنتج مستورد 2,IMP-2,6,12,مستورد\n';
  const applied = await upload('products', good, false);
  check('import applies 2 products', data(applied)?.summary?.created === 2, applied);
  const again = await upload('products', good.replace(',9,', ',11,'), false);
  check(
    're-import updates by SKU (no duplicates)',
    data(again)?.summary?.updated === 2 && data(again)?.summary?.created === 0,
    again
  );
  const exp2 = await (
    await fetch(API + '/data/export/products', { headers: { Authorization: `Bearer ${ot}` } })
  ).text();
  check(
    'export neutralizes formula cells (CSV injection)',
    exp2.includes("'=cmd|calc"),
    exp2.slice(0, 400)
  );
  const custCsv =
    'الاسم,الموبايل,شريحة السعر\nعميل 1,0100000001,wholesale\nعميل 2,0100000002,vip\n';
  const cust = await upload('customers', custCsv, true);
  check('customer import validates priceTier', data(cust)?.errors?.length === 1, cust);
  const keyExport = await call('GET', '/data/export/customers', { apiKey: 'blk_live_whatever' });
  check(
    'API key cannot export data',
    keyExport.status === 401 || keyExport.status === 403,
    keyExport
  );

  // cleanup: suspend smoke tenant
  const susp = await call('PATCH', `/admin/tenants/${tenantId}/status`, {
    token: mt,
    body: { isActive: false },
  });
  check('suspend tenant', susp.status < 300, susp);
  const afterSuspend = await call('GET', '/products', { token: ot });
  check(
    'suspended tenant token rejected',
    afterSuspend.status === 401 || afterSuspend.status === 403,
    afterSuspend
  );

  console.log(`\nResult: ${passes} passed, ${failures} failed`);
  process.exit(failures ? 1 : 0);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});
