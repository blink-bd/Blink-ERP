import { BackupService } from './backup.service';

const TENANT = '11111111-1111-1111-1111-111111111111';

/** قاعدة بيانات وهمية: بترد على استعلام اكتشاف الجداول وعلى SELECT لكل جدول. */
function fakeDataSource(options: { failTable?: string } = {}) {
  const calls: string[] = [];
  const schema = [
    { table_name: 'inventory', columns: ['id', 'tenant_id', 'quantity', 'updated_at'] },
    { table_name: 'products', columns: ['id', 'tenant_id', 'name', 'created_at'] },
    { table_name: 'document_counters', columns: ['tenant_id', 'document_type', 'next_value'] },
    {
      table_name: 'invoice_attachments',
      columns: ['id', 'tenant_id', 'original_name', 'content', 'created_at'],
    },
    { table_name: 'users', columns: ['id', 'tenant_id', 'email', 'password_hash', 'created_at'] },
    { table_name: 'audit_logs', columns: ['id', 'tenant_id', 'created_at'] },
    { table_name: 'api_keys', columns: ['id', 'tenant_id', 'created_at'] },
  ];
  const rows: Record<string, any[]> = {
    inventory: [{ id: 'i1', tenant_id: TENANT, quantity: 5 }],
    products: [{ id: 'p1', tenant_id: TENANT, name: 'منتج' }],
    document_counters: [{ tenant_id: TENANT, document_type: 'sale', next_value: 7 }],
    invoice_attachments: [
      { id: 'a1', tenant_id: TENANT, original_name: 'x.png', content: Buffer.from('PNG') },
    ],
    users: [{ id: 'u1', tenant_id: TENANT, email: 'a@b.c', password_hash: 'secret' }],
  };
  return {
    calls,
    query: jest.fn(async (sql: string) => {
      calls.push(sql);
      if (sql.includes('information_schema.columns')) return schema;
      if (sql.includes('FROM tenants')) return [{ id: TENANT, business_name: 'متجر' }];
      if (sql.includes('user_roles') || sql.includes('role_permissions')) return [];
      const match = sql.match(/FROM "([^"]+)"/);
      const table = match?.[1] || '';
      if (table === options.failTable) throw new Error('boom');
      return rows[table] || [];
    }),
  };
}

describe('BackupService.exportTenantData', () => {
  it('exports tables without created_at (inventory) instead of leaving them empty', async () => {
    const ds = fakeDataSource();
    const backup = await new BackupService(ds as any).exportTenantData(TENANT);

    expect(backup.tables.inventory).toHaveLength(1);
    expect(backup.tables.document_counters).toHaveLength(1);
    expect(backup.meta.skippedTables).toEqual([]);
    expect(backup.meta.rowCounts.inventory).toBe(1);

    const inventorySql = ds.calls.find((sql) => sql.includes('FROM "inventory"'))!;
    expect(inventorySql).toContain('ORDER BY "id"');
    const productsSql = ds.calls.find((sql) => sql.includes('FROM "products"'))!;
    expect(productsSql).toContain('ORDER BY "created_at"');
    const countersSql = ds.calls.find((sql) => sql.includes('FROM "document_counters"'))!;
    expect(countersSql).not.toContain('ORDER BY');
  });

  it('skips secrets, file contents and operational tables', async () => {
    const backup = await new BackupService(fakeDataSource() as any).exportTenantData(TENANT);

    expect(backup.tables.users[0]).not.toHaveProperty('password_hash');
    expect(backup.tables.invoice_attachments[0]).toEqual({
      id: 'a1',
      tenant_id: TENANT,
      original_name: 'x.png',
    });
    expect(backup.tables.audit_logs).toBeUndefined();
    expect(backup.tables.api_keys).toBeUndefined();
  });

  it('reports a failing table in meta.skippedTables instead of silently exporting it empty', async () => {
    const backup = await new BackupService(
      fakeDataSource({ failTable: 'products' }) as any
    ).exportTenantData(TENANT);

    expect(backup.tables.products).toBeUndefined();
    expect(backup.meta.skippedTables).toEqual([{ table: 'products', reason: 'boom' }]);
    expect(backup.tables.inventory).toHaveLength(1);
  });
});
