import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreatePermissions1700000000002 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    // Permissions table
    await queryRunner.createTable(
      new Table({
        name: 'permissions',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'resource', type: 'varchar', length: '100' },
          { name: 'action', type: 'varchar', length: '50' },
          { name: 'scope', type: 'varchar', length: '20', default: "'all'" },
          { name: 'name', type: 'varchar', length: '255', isUnique: true },
          { name: 'description', type: 'varchar', length: '500', isNullable: true },
          { name: 'category', type: 'varchar', length: '50', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
        ],
      }),
      true
    );

    await queryRunner.createIndex(
      'permissions',
      new TableIndex({ name: 'idx_permissions_resource', columnNames: ['resource'] })
    );
    await queryRunner.createIndex(
      'permissions',
      new TableIndex({ name: 'idx_permissions_category', columnNames: ['category'] })
    );

    // Roles table
    await queryRunner.createTable(
      new Table({
        name: 'roles',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'tenant_id', type: 'uuid' },
          { name: 'name', type: 'varchar', length: '100' },
          { name: 'name_ar', type: 'varchar', length: '100' },
          { name: 'description', type: 'text', isNullable: true },
          { name: 'is_system', type: 'boolean', default: false },
          { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'created_by', type: 'uuid', isNullable: true },
          { name: 'updated_by', type: 'uuid', isNullable: true },
          { name: 'deleted_at', type: 'timestamp', isNullable: true },
        ],
      }),
      true
    );

    await queryRunner.createIndex(
      'roles',
      new TableIndex({
        name: 'idx_roles_tenant_name',
        columnNames: ['tenant_id', 'name'],
        isUnique: true,
      })
    );

    // Role permissions junction table
    await queryRunner.createTable(
      new Table({
        name: 'role_permissions',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'role_id', type: 'uuid' },
          { name: 'permission_id', type: 'uuid' },
          { name: 'granted_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'granted_by', type: 'uuid', isNullable: true },
        ],
      }),
      true
    );

    await queryRunner.createIndex(
      'role_permissions',
      new TableIndex({
        name: 'idx_role_permissions_unique',
        columnNames: ['role_id', 'permission_id'],
        isUnique: true,
      })
    );

    // User roles junction table
    await queryRunner.createTable(
      new Table({
        name: 'user_roles',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'user_id', type: 'uuid' },
          { name: 'role_id', type: 'uuid' },
          { name: 'assigned_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'assigned_by', type: 'uuid', isNullable: true },
        ],
      }),
      true
    );

    await queryRunner.createIndex(
      'user_roles',
      new TableIndex({
        name: 'idx_user_roles_unique',
        columnNames: ['user_id', 'role_id'],
        isUnique: true,
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('user_roles');
    await queryRunner.dropTable('role_permissions');
    await queryRunner.dropTable('roles');
    await queryRunner.dropTable('permissions');
  }
}
