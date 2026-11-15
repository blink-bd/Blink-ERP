#!/usr/bin/env bash
# ============================================================================
# تشغيل الإنتاج على Render (أو أي منصة تشغيل).
#
# الفرق عن الأمر القديم `npm run db:migrate:prod && npm run db:seed:prod && npm run start:prod`:
#   - فحص سريع للقاعدة (5 ثوانٍ) قبل الـ migrations. القاعدة النائمة كانت
#     بتخلّي محاولة migration تاخد ~دقيقتين، والمنصة تعتبر النشر فاشل.
#   - الـ migrations بتتعاد مرتين بس (مش 5) لتقليل زمن الإقلاع.
#   - فشل الـ seed مش بيمنع تشغيل السيستم (كان بيمنع، فيقعد النظام واقف).
#   - الـ API بيشتغل مهما حصل: لو القاعدة مش متاحة بيرد صفحة صيانة على
#     المنفذ وبيتعافى لوحده لما القاعدة ترجع (مش محتاج إعادة نشر).
# ============================================================================
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() { echo "[start] $*"; }

MIGRATE_ATTEMPTS="${MIGRATE_ATTEMPTS:-2}"
MIGRATE_DELAY="${MIGRATE_DELAY:-15}"

if [ ! -f apps/api/dist/main.js ]; then
  log "dist غير موجود — بشغّل build للـ API"
  npm run build --workspace @erp/api || {
    log "❌ فشل build الـ API"
    exit 1
  }
fi

if node scripts/db-precheck.js; then
  migrate_ok=0
  for attempt in $(seq 1 "$MIGRATE_ATTEMPTS"); do
    log "migrations: محاولة $attempt/$MIGRATE_ATTEMPTS"
    if npm run db:migrate:prod --workspace @erp/api; then
      migrate_ok=1
      break
    fi
    log "⚠️ فشلت المحاولة $attempt — استنى ${MIGRATE_DELAY}s"
    sleep "$MIGRATE_DELAY"
  done

  if [ "$migrate_ok" -ne 1 ]; then
    log "⚠️ الـ migrations فشلت — هنشغّل السيرفر برضه وهيتعافى لما القاعدة ترجع."
  fi

  log "seeds (اختياري — الفشل مش بيمنع التشغيل)"
  npm run db:seed:prod --workspace @erp/api || log "⚠️ الـ seed فشل — بنكمل التشغيل"
else
  log "⚠️ قاعدة البيانات غير متاحة حالياً — تخطي migrations والـ seed."
  log "   السيرفر هيشتغل ويعرض صفحة صيانة، وهيتعافى تلقائياً لما القاعدة ترجع."
fi

log "تشغيل الـ API على المنفذ ${PORT:-3000}"
exec node apps/api/dist/main.js
