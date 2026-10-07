import { DataSource } from 'typeorm';
import { Permission } from '@/modules/users/entities/permission.entity';

const resources: Array<{
  resource: string;
  actions: string[];
  category: string;
}> = [
  { resource: 'dashboard', actions: ['view'], category: 'dashboard' },
  {
    resource: 'sales',
    actions: ['view', 'create', 'payment', 'void', 'return'],
    category: 'sales',
  },
  {
    resource: 'products',
    actions: ['view', 'create', 'update', 'delete', 'manage'],
    category: 'products',
  },
  { resource: 'inventory', actions: ['view', 'adjust', 'transfer'], category: 'inventory' },
  { resource: 'categories', actions: ['view', 'manage'], category: 'products' },
  { resource: 'brands', actions: ['view', 'manage'], category: 'products' },
  {
    resource: 'customers',
    actions: ['view', 'create', 'update', 'delete', 'payment'],
    category: 'customers',
  },
  {
    resource: 'suppliers',
    actions: ['view', 'create', 'update', 'delete', 'settle'],
    category: 'suppliers',
  },
  { resource: 'purchases', actions: ['view', 'create'], category: 'purchases' },
  { resource: 'expenses', actions: ['view', 'create', 'manage'], category: 'expenses' },
  { resource: 'cash_register', actions: ['view', 'manage'], category: 'cash_register' },
  { resource: 'branches', actions: ['view', 'manage'], category: 'inventory' },
  { resource: 'warehouses', actions: ['view', 'manage'], category: 'inventory' },
  { resource: 'reports', actions: ['view', 'export'], category: 'reports' },
  { resource: 'advanced_reports', actions: ['view'], category: 'reports' },
  { resource: 'branding', actions: ['view', 'update'], category: 'settings' },
  { resource: 'settings', actions: ['view', 'update'], category: 'settings' },
  { resource: 'users', actions: ['view', 'create', 'update', 'delete'], category: 'users' },
];

export async function seedPermissions(dataSource: DataSource): Promise<void> {
  const repository = dataSource.getRepository(Permission);

  for (const definition of resources) {
    for (const action of definition.actions) {
      const name = `${definition.resource}.${action}`;
      const exists = await repository.findOne({ where: { name } });
      if (!exists) {
        await repository.save(
          repository.create({
            resource: definition.resource,
            action,
            scope: 'all',
            name,
            category: definition.category,
          })
        );
      }
    }
  }

  // Migrations can run before seeds, so attach the complete permission set to
  // owner roles here as well as in the backfill migration.
  await dataSource.query(`
    INSERT INTO role_permissions (role_id, permission_id)
    SELECT r.id, p.id
    FROM roles r
    CROSS JOIN permissions p
    WHERE r.name = 'owner'
    ON CONFLICT (role_id, permission_id) DO NOTHING
  `);

  console.log('✅ Permissions seeded successfully');
}
