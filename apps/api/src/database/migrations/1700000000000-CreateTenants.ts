import { MigrationInterface, QueryRunner, Table, TableIndex } from 'typeorm';

export class CreateTenants1700000000000 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.createTable(
      new Table({
        name: 'tenants',
        columns: [
          { name: 'id', type: 'uuid', isPrimary: true, default: 'uuid_generate_v4()' },
          { name: 'business_name', type: 'varchar', length: '255' },
          { name: 'business_name_ar', type: 'varchar', length: '255' },
          { name: 'business_name_en', type: 'varchar', length: '255', isNullable: true },
          { name: 'trade_name', type: 'varchar', length: '255', isNullable: true },
          { name: 'email', type: 'varchar', length: '255', isUnique: true },
          { name: 'phone', type: 'varchar', length: '50', isNullable: true },
          { name: 'address', type: 'text', isNullable: true },
          { name: 'city', type: 'varchar', length: '100', isNullable: true },
          { name: 'country', type: 'varchar', length: '100', default: "'Saudi Arabia'" },
          { name: 'currency', type: 'varchar', length: '3', default: "'SAR'" },
          { name: 'timezone', type: 'varchar', length: '50', default: "'Asia/Riyadh'" },
          { name: 'default_language', type: 'varchar', length: '5', default: "'ar'" },
          { name: 'plan_id', type: 'uuid', isNullable: true },
          { name: 'subscription_start_date', type: 'timestamp', isNullable: true },
          { name: 'subscription_end_date', type: 'timestamp', isNullable: true },
          { name: 'subscription_status', type: 'varchar', length: '20', default: "'active'" },
          { name: 'trial_ends_at', type: 'timestamp', isNullable: true },
          { name: 'is_active', type: 'boolean', default: true },
          { name: 'created_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'updated_at', type: 'timestamp', default: 'CURRENT_TIMESTAMP' },
          { name: 'deleted_at', type: 'timestamp', isNullable: true },
        ],
      }),
      true
    );

    await queryRunner.createIndex(
      'tenants',
      new TableIndex({ name: 'idx_tenants_email', columnNames: ['email'] })
    );

    await queryRunner.createIndex(
      'tenants',
      new TableIndex({
        name: 'idx_tenants_active',
        columnNames: ['is_active'],
        where: 'deleted_at IS NULL',
      })
    );
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.dropTable('tenants');
  }
}
