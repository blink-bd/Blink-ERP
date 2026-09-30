import { DataSource } from 'typeorm';
import { Permission } from '@/modules/users/entities/permission.entity';

export async function seedPermissions(dataSource: DataSource): Promise<void> {
  const permissionsRepository = dataSource.getRepository(Permission);

  const permissions = [
    { resource: 'sales', action: 'view', scope: 'all', name: 'sales.view', category: 'sales' },
    { resource: 'sales', action: 'create', scope: 'all', name: 'sales.create', category: 'sales' },
    { resource: 'sales', action: 'update', scope: 'all', name: 'sales.update', category: 'sales' },
    { resource: 'sales', action: 'delete', scope: 'all', name: 'sales.delete', category: 'sales' },
    { resource: 'sales', action: 'return', scope: 'all', name: 'sales.return', category: 'sales' },

    { resource: 'products', action: 'view', scope: 'all', name: 'products.view', category: 'products' },
    { resource: 'products', action: 'create', scope: 'all', name: 'products.create', category: 'products' },
    { resource: 'products', action: 'update', scope: 'all', name: 'products.update', category: 'products' },
    { resource: 'products', action: 'delete', scope: 'all', name: 'products.delete', category: 'products' },

    { resource: 'inventory', action: 'view', scope: 'all', name: 'inventory.view', category: 'inventory' },
    { resource: 'inventory', action: 'adjust', scope: 'all', name: 'inventory.adjust', category: 'inventory' },

    { resource: 'customers', action: 'view', scope: 'all', name: 'customers.view', category: 'customers' },
    { resource: 'customers', action: 'create', scope: 'all', name: 'customers.create', category: 'customers' },
    { resource: 'customers', action: 'update', scope: 'all', name: 'customers.update', category: 'customers' },
    { resource: 'customers', action: 'delete', scope: 'all', name: 'customers.delete', category: 'customers' },

    { resource: 'reports', action: 'view', scope: 'all', name: 'reports.view', category: 'reports' },
    { resource: 'reports', action: 'export', scope: 'all', name: 'reports.export', category: 'reports' },

    { resource: 'settings', action: 'view', scope: 'all', name: 'settings.view', category: 'settings' },
    { resource: 'settings', action: 'update', scope: 'all', name: 'settings.update', category: 'settings' },

    { resource: 'users', action: 'view', scope: 'all', name: 'users.view', category: 'users' },
    { resource: 'users', action: 'create', scope: 'all', name: 'users.create', category: 'users' },
    { resource: 'users', action: 'update', scope: 'all', name: 'users.update', category: 'users' },
    { resource: 'users', action: 'delete', scope: 'all', name: 'users.delete', category: 'users' },
  ];

  for (const permission of permissions) {
    const exists = await permissionsRepository.findOne({ where: { name: permission.name } });
    if (!exists) {
      await permissionsRepository.save(permission);
    }
  }

  console.log('✅ Permissions seeded successfully');
}
