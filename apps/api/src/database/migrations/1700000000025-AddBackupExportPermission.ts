import { MigrationInterface, QueryRunner } from 'typeorm';

/** Keep tenant backup export behind the same server-side permission system as other data exports. */
export class AddBackupExportPermission1700000000025 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      INSERT INTO permissions (resource, action, scope, name, category)
      VALUES ('backup', 'export', 'all', 'backup.export', 'settings')
      ON CONFLICT (name) DO NOTHING
    `);
    await queryRunner.query(`
      INSERT INTO role_permissions (role_id, permission_id)
      SELECT r.id, p.id
      FROM roles r
      CROSS JOIN permissions p
      WHERE r.name = 'owner' AND p.name = 'backup.export'
      ON CONFLICT (role_id, permission_id) DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DELETE FROM role_permissions
      WHERE permission_id IN (SELECT id FROM permissions WHERE name = 'backup.export')
    `);
    await queryRunner.query(`DELETE FROM permissions WHERE name = 'backup.export'`);
  }
}
