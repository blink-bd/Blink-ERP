import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateDocumentCounters1700000000022 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE document_counters (
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        document_type VARCHAR(30) NOT NULL,
        document_year INTEGER NOT NULL,
        next_value INTEGER NOT NULL DEFAULT 1,
        PRIMARY KEY (tenant_id, document_type, document_year),
        CONSTRAINT positive_next_document_value CHECK (next_value > 0)
      )
    `);

    await queryRunner.query(`
      INSERT INTO document_counters (tenant_id, document_type, document_year, next_value)
      SELECT tenant_id, 'sale', EXTRACT(YEAR FROM sale_date)::int,
             COALESCE(MAX(CASE WHEN split_part(sale_number, '-', 3) ~ '^[0-9]+$'
               THEN split_part(sale_number, '-', 3)::integer ELSE 0 END), 0) + 1
      FROM sales
      GROUP BY tenant_id, EXTRACT(YEAR FROM sale_date)::int
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO document_counters (tenant_id, document_type, document_year, next_value)
      SELECT tenant_id, 'purchase', EXTRACT(YEAR FROM purchase_date)::int,
             COALESCE(MAX(CASE WHEN split_part(purchase_number, '-', 3) ~ '^[0-9]+$'
               THEN split_part(purchase_number, '-', 3)::integer ELSE 0 END), 0) + 1
      FROM purchases
      GROUP BY tenant_id, EXTRACT(YEAR FROM purchase_date)::int
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO document_counters (tenant_id, document_type, document_year, next_value)
      SELECT tenant_id, 'return', EXTRACT(YEAR FROM return_date)::int,
             COALESCE(MAX(CASE WHEN split_part(return_number, '-', 3) ~ '^[0-9]+$'
               THEN split_part(return_number, '-', 3)::integer ELSE 0 END), 0) + 1
      FROM sale_returns
      GROUP BY tenant_id, EXTRACT(YEAR FROM return_date)::int
      ON CONFLICT DO NOTHING
    `);

    await queryRunner.query(`
      INSERT INTO document_counters (tenant_id, document_type, document_year, next_value)
      SELECT tenant_id, 'payment', EXTRACT(YEAR FROM payment_date)::int,
             COALESCE(MAX(CAST(NULLIF(split_part(payment_number, '-', 3), '') AS INTEGER)), 0) + 1
      FROM payments
      WHERE payment_number ~ '^PAY-[0-9]{4}-[0-9]+$'
      GROUP BY tenant_id, EXTRACT(YEAR FROM payment_date)::int
      ON CONFLICT DO NOTHING
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`DROP TABLE IF EXISTS document_counters`);
  }
}
