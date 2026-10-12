export const WEBHOOK_EVENTS = [
  'sale.created',
  'purchase.created',
  'inventory.low_stock',
  'inventory.transfer.requested',
  'inventory.transfer.approved',
  'inventory.transfer.rejected',
  'backup.completed',
  'webhook.test',
] as const;

export type WebhookEventName = (typeof WEBHOOK_EVENTS)[number];
