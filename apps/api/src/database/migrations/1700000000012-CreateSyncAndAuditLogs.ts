import { MigrationInterface, QueryRunner } from 'typeorm';

export class CreateSyncAndAuditLogs1700000000012 implements MigrationInterface {
  public async up(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      CREATE TABLE sync_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID NOT NULL REFERENCES tenants(id) ON DELETE CASCADE,
        device_id VARCHAR(255) NOT NULL,
        user_id UUID NOT NULL REFERENCES users(id) ON DELETE CASCADE,
        entity_type VARCHAR(100) NOT NULL,
        entity_id UUID NOT NULL,
        operation VARCHAR(20) NOT NULL,
        idempotency_key UUID NOT NULL UNIQUE,
        checksum VARCHAR(64),
        payload JSONB,
        processed_at TIMESTAMP NOT NULL DEFAULT CURRENT_TIMESTAMP,
        processing_time_ms INTEGER,
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_sync_logs_tenant ON sync_logs(tenant_id);
      CREATE INDEX idx_sync_logs_device ON sync_logs(device_id);
      CREATE UNIQUE INDEX idx_sync_logs_idempotency ON sync_logs(idempotency_key);

      CREATE TABLE audit_logs (
        id UUID PRIMARY KEY DEFAULT uuid_generate_v4(),
        tenant_id UUID REFERENCES tenants(id) ON DELETE CASCADE,
        user_id UUID REFERENCES users(id) ON DELETE SET NULL,
        user_email VARCHAR(255),
        user_ip VARCHAR(45),
        user_agent TEXT,
        action VARCHAR(100) NOT NULL,
        entity_type VARCHAR(100),
        entity_id UUID,
        old_values JSONB,
        new_values JSONB,
        description TEXT,
        severity VARCHAR(20) DEFAULT 'info',
        created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
      );
      CREATE INDEX idx_audit_logs_tenant ON audit_logs(tenant_id);
      CREATE INDEX idx_audit_logs_action ON audit_logs(action);
      CREATE INDEX idx_audit_logs_date ON audit_logs(created_at DESC);
    `);
  }

  public async down(queryRunner: QueryRunner): Promise<void> {
    await queryRunner.query(`
      DROP TABLE IF EXISTS audit_logs;
      DROP TABLE IF EXISTS sync_logs;
    `);
  }
}
