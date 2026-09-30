import { MigrationInterface, QueryRunner, Table, TableForeignKey, TableIndex } from 'typeorm';

export class CreateUsers1700000000001 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'users',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'tenant_id', type: 'uuid' },
          { name: 'email', type: 'varchar', length: '255' },
          { name: 'password_hash', type: 'varchar', length: '255' },
          { name: 'full_name', type: 'varchar', length: '255' },
          { name: 'phone', type: 'varchar', length: '50', isNullable: true },
          { name: 'branch_id', type: 'uuid', isNullable: true },
          { name: 'warehouse_id', type: 'uuid', isNullable: true },
          { name: 'is_active', type: 'boolean', default: true },
          { name: 'email_verified', type: 'boolean', default: false },
          { name: 'email_verified_at', type: 'timestamp', isNullable: true },
          { name: 'last_login_at', type: 'timestamp', isNullable: true },
          { name: 'last_login_ip', type: 'varchar', length: '45', isNullable: true },
          { name: 'password_changed_at', type: 'timestamp', isNullable: true },
          { name: 'failed_login_attempts', type: 'integer', default: 0 },
          { name: 'locked_until', type: 'timestamp', isNullable: true },
          { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'deleted_at', type: 'timestamp', isNullable: true },
        ],
      }),
      true
    );

    await queryRunner.createForeignKey(
      'users',
      new TableForeignKey({
        columnNames: ['tenant_id'],
        referencedTableName: 'tenants',
        referencedColumnNames: ['id'],
        onDelete: 'CASCADE',
      })
    );

    await queryRunner.createIndex(
      'users',
      new TableIndex({
        name: 'idx_users_tenant_email',
        columnNames: ['tenant_id', 'email'],
        isUnique: true,
      })
    );

    await queryRunner.createIndex(
      'users',
      new TableIndex({
        name: 'idx_users_tenant_active',
        columnNames: ['tenant_id', 'is_active'],
        where: 'deleted_at IS NULL',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('users');
  }
}
