import { BadRequestException } from '@nestjs/common';
import { EntityManager } from 'typeorm';

export type PartyType = 'customer' | 'supplier';

export async function resolveTenantBranch(
  manager: EntityManager,
  tenantId: string,
  requestedBranchId?: string | null
): Promise<string | undefined> {
  const branchId = requestedBranchId || undefined;
  if (branchId) {
    const rows = await manager.query(
      `SELECT id FROM branches
       WHERE id = $1 AND tenant_id = $2 AND is_active = true AND deleted_at IS NULL`,
      [branchId, tenantId]
    );
    if (!rows.length) throw new BadRequestException('الفرع المحدد غير موجود أو غير نشط');
    return rows[0].id;
  }

  const rows = await manager.query(
    `SELECT id FROM branches
     WHERE tenant_id = $1 AND is_main = true AND is_active = true AND deleted_at IS NULL
     ORDER BY created_at ASC LIMIT 1`,
    [tenantId]
  );
  return rows[0]?.id;
}

export async function adjustBranchPartyBalance(
  manager: EntityManager,
  tenantId: string,
  partyType: PartyType,
  partyId: string,
  delta: number,
  branchId?: string | null
): Promise<string | undefined> {
  if (!Number.isFinite(delta) || Math.abs(delta) < 0.0000001) return undefined;
  const resolvedBranchId = await resolveTenantBranch(manager, tenantId, branchId);
  if (!resolvedBranchId) return undefined;
  await manager.query(
    `INSERT INTO branch_party_balances
       (tenant_id, branch_id, party_type, party_id, balance, created_at, updated_at)
     VALUES ($1, $2, $3, $4, $5, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)
     ON CONFLICT (tenant_id, branch_id, party_type, party_id)
     DO UPDATE SET balance = branch_party_balances.balance + EXCLUDED.balance,
                   updated_at = CURRENT_TIMESTAMP`,
    [tenantId, resolvedBranchId, partyType, partyId, delta]
  );
  return resolvedBranchId;
}
