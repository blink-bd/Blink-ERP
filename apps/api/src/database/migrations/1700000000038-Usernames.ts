import { MigrationInterface, QueryRunner } from 'typeorm';

/** Global merchant usernames for username + password sign-in (legacy rows stay NULL). */
export class Usernames1700000000038 implements MigrationInterface {
  name = 'Usernames1700000000038';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE users ADD COLUMN IF NOT EXISTS username VARCHAR(50)`);
    await queryRunner.query(`
      CREATE UNIQUE INDEX IF NOT EXISTS idx_users_username_global_unique
      ON users (LOWER(username))
      WHERE username IS NOT NULL AND deleted_at IS NULL
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP INDEX IF EXISTS idx_users_username_global_unique`);
    await queryRunner.query(`ALTER TABLE users DROP COLUMN IF EXISTS username`);
  }
}
