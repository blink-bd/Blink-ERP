import { MigrationInterface, QueryRunner } from 'typeorm';

/** Add role permissions for viewing and creating maintenance invoices. */
export class MaintenanceRolePermissions1700000000037 implements MigrationInterface {
  name = 'MaintenanceRolePermissions1700000000037';

  public async up(queryRunner: QueryRunner): Promise<void> {
    for (const action of ['view', 'create']) {
      await queryRunner.query(
        `INSERT INTO permissions (resource, action, scope, name, category)
         VALUES ('maintenance', $1, 'all', $2, 'maintenance')
         ON CONFLICT (name) DO NOTHING`,
        [action, `maintenance.${action}`]
      );
    }

    // Keep existing owners able to use the page after the permission guard is enabled.
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name = 'owner' AND p.name IN ('maintenance.view', 'maintenance.create')
      ON CONFLICT (role_id, permission_id) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM role_permissions
      WHERE permission_id IN (
        SELECT id FROM permissions WHERE name IN ('maintenance.view', 'maintenance.create')
      )
    `);
    await queryRunner.query(
      `DELETE FROM permissions WHERE name IN ('maintenance.view', 'maintenance.create')`
    );
  }
}
