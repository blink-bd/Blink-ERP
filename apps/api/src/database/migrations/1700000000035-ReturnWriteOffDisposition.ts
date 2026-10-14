import { MigrationInterface, QueryRunner } from 'typeorm';

/**
 * الصنف المرتجع التالف تماماً كان لازم يتسجل «صنف مستقل» بتكلفة صفر + تسوية مخزون
 * يدوية عشان الكمية تخرج — خطوتين وممكن التاجر يغلط فيهم ويتسجل الهالك مرتين.
 * دلوقتي فيه مصير صريح «هالك/إتلاف»: بيشيل الكمية من المخزون ويسجل الخسارة بقيمة
 * التكلفة الأصلية في خطوة واحدة.
 */
export class ReturnWriteOffDisposition1700000000035 implements MigrationInterface {
  name = 'ReturnWriteOffDisposition1700000000035';

  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE sale_return_items DROP CONSTRAINT IF EXISTS sale_return_item_disposition_check`
    );
    await queryRunner.query(`
      ALTER TABLE sale_return_items ADD CONSTRAINT sale_return_item_disposition_check
        CHECK (disposition IN ('pending', 'supplier', 'restocked', 'original', 'write_off'))
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(
      `ALTER TABLE sale_return_items DROP CONSTRAINT IF EXISTS sale_return_item_disposition_check`
    );
    await queryRunner.query(`
      ALTER TABLE sale_return_items ADD CONSTRAINT sale_return_item_disposition_check
        CHECK (disposition IN ('pending', 'supplier', 'restocked', 'original'))
    `);
  }
}
