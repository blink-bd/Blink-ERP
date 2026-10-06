import { MigrationInterface, QueryRunner } from 'typeorm';

export class AddHalfWholesalePrice1700000000017 implements MigrationInterface {
  name = 'AddHalfWholesalePrice1700000000017';
  async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE products ADD COLUMN IF NOT EXISTS half_wholesale_price DECIMAL(15,4)`);
  }
  async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`ALTER TABLE products DROP COLUMN IF EXISTS half_wholesale_price`);
  }
}
