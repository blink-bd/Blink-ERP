import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddBrandingFooter1700000000019 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tenant_branding
        ADD COLUMN footer_text VARCHAR(255) DEFAULT 'Copyright © 2026 Blink BD',
        ADD COLUMN footer_link_url VARCHAR(500) NULL;

      UPDATE tenant_branding
      SET footer_text = 'Copyright © 2026 Blink BD'
      WHERE footer_text IS NULL;
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      ALTER TABLE tenant_branding
        DROP COLUMN footer_link_url,
        DROP COLUMN footer_text;
    `);
  }
}
