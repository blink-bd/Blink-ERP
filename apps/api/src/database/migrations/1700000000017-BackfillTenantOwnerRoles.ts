import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * Gives existing tenants a real owner role so enabling PermissionGuard does not
 * lock out their first administrators. Only users without any role are
 * backfilled; explicitly configured roles are left untouched.
 */
export class BackfillTenantOwnerRoles1700000000017 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO roles (tenant_id, name, name_ar, description, is_system)
      SELECT t.id, 'owner', 'مالك النظام', 'صلاحيات كاملة داخل التاجر', true
      FROM tenants t
      WHERE t.deleted_at IS NULL
      ON CONFLICT (tenant_id, name) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name = 'owner'
      ON CONFLICT (role_id, permission_id) DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO user_roles (user_id, role_id)
      SELECT u.id, r.id
      FROM users u
      JOIN roles r ON r.tenant_id = u.tenant_id AND r.name = 'owner'
      WHERE NOT EXISTS (
        SELECT 1 FROM user_roles ur WHERE ur.user_id = u.id
      )
      ON CONFLICT (user_id, role_id) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM user_roles
      WHERE role_id IN (SELECT id FROM roles WHERE name = 'owner' AND is_system = true)
    `);
    await queryRunner.query(`
      DELETE FROM role_permissions
      WHERE role_id IN (SELECT id FROM roles WHERE name = 'owner' AND is_system = true)
    `);
    await queryRunner.query(`DELETE FROM roles WHERE name = 'owner' AND is_system = true`);
  }
}
