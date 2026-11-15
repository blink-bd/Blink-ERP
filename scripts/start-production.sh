#!/usr/bin/env bash
# ============================================================================
# تشغيل الإنتاج على Render (أو أي منصة تشغيل).
#
# الفرق عن الأمر القديم `npm run db:migrate:prod && npm run db:seed:prod && npm run start:prod`:
#   - الـ migrations بتتعاد عليها لو قاعدة البيانات كانت نائمة/مقطوعة.
#   - فشل الـ seed مش بيمنع تشغيل السيستم (كان بيمنع، فيقعد النظام واقف).
#   - لو الـ migrations فشلت كل المحاولات بنكمّل تشغيل برضه، والسيرفر بيرجع
#     503 على /api/v1/health لحد ما القاعدة ترجع، بدل ما العملية تموت وتعيد
#     التشغيل في حلقة مقفولة.
# ============================================================================
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() { echo "[start] $*"; }

MIGRATE_ATTEMPTS="${MIGRATE_ATTEMPTS:-5}"
MIGRATE_DELAY="${MIGRATE_DELAY:-15}"

if [ ! -f apps/api/dist/main.js ]; then
  log "dist غير موجود — بشغّل build للـ API"
  npm run build --workspace @erp/api || {
    log "❌ فشل build الـ API"
    exit 1
  }
fi

migrate_ok=0
for attempt in $(seq 1 "$MIGRATE_ATTEMPTS"); do
  log "migrations: محاولة $attempt/$MIGRATE_ATTEMPTS"
  if npm run db:migrate:prod --workspace @erp/api; then
    migrate_ok=1
    break
  fi
  log "⚠️ فشلت المحاولة $attempt — استنى ${MIGRATE_DELAY}s (قاعدة البيانات ممكن تكون بتصحى)"
  sleep "$MIGRATE_DELAY"
done

if [ "$migrate_ok" -ne 1 ]; then
  log "⚠️ الـ migrations فشلت بعد كل المحاولات — هنشغّل السيرفر برضه،"
  log "   وفحص /api/v1/health هيفضل 503 لحد ما قاعدة البيانات ترجع."
fi

log "seeds (اختياري — الفشل مش بيمنع التشغيل)"
npm run db:seed:prod --workspace @erp/api || log "⚠️ الـ seed فشل — بنكمل التشغيل"

log "تشغيل الـ API على المنفذ ${PORT:-3000}"
exec node apps/api/dist/main.js
