import { Injectable } from '@nestjs/common';
import { InjectDataSource } from '@nestjs/typeorm';
import { DataSource } from 'typeorm';
import { SalesService } from '@/modules/sales/sales.service';

export interface SyncOperation {
  operation: 'create' | 'update' | 'delete';
  idempotencyKey: string;
  data: any;
}

export interface SyncResult {
  idempotencyKey: string;
  status: 'synced' | 'already_synced' | 'failed';
  entityId?: string;
  error?: string;
}

@Injectable()
export class SyncService {
  constructor(
    @InjectDataSource() private readonly dataSource: DataSource,
    private readonly salesService: SalesService
  ) {}

  /**
   * Processes a batch of offline-queued sale operations from the desktop app's
   * SQLite outbox (see docs/ARCHITECTURE.md "Offline Synchronization System").
   * Each operation is deduplicated via idempotencyKey against sync_logs so
   * retries from a flaky connection never double-apply a sale.
   */
  async syncSales(tenantId: string, deviceId: string, userId: string, operations: SyncOperation[]) {
    const results: SyncResult[] = [];

    for (const op of operations) {
      const existing = await this.dataSource.query(
        `SELECT entity_id FROM sync_logs WHERE idempotency_key = $1`,
        [op.idempotencyKey]
      );

      if (existing.length > 0) {
        results.push({
          idempotencyKey: op.idempotencyKey,
          status: 'already_synced',
          entityId: existing[0].entity_id,
        });
        continue;
      }

      try {
        let entityId: string;
        if (op.operation === 'create') {
          const sale = await this.salesService.create(tenantId, op.data, userId);
          entityId = sale.id;
        } else {
          throw new Error(`Unsupported sync operation: ${op.operation}`);
        }

        await this.dataSource.query(
          `INSERT INTO sync_logs (tenant_id, device_id, user_id, entity_type, entity_id, operation, idempotency_key, processed_at)
           VALUES ($1, $2, $3, 'sale', $4, $5, $6, CURRENT_TIMESTAMP)`,
          [tenantId, deviceId, userId, entityId, op.operation, op.idempotencyKey]
        );

        results.push({ idempotencyKey: op.idempotencyKey, status: 'synced', entityId });
      } catch (error: any) {
        results.push({ idempotencyKey: op.idempotencyKey, status: 'failed', error: error.message });
      }
    }

    return {
      processed: results.filter((r) => r.status !== 'failed').length,
      failed: results.filter((r) => r.status === 'failed').length,
      results,
    };
  }

  async getStatus(tenantId: string, deviceId: string) {
    const lastSync = await this.dataSource.query(
      `SELECT MAX(processed_at) AS last_sync FROM sync_logs WHERE tenant_id = $1 AND device_id = $2`,
      [tenantId, deviceId]
    );
    return {
      deviceId,
      lastSyncAt: lastSync[0]?.last_sync || null,
      status: 'synced',
    };
  }
}
