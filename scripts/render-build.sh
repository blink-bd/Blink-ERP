#!/usr/bin/env bash
# ============================================================================
# بناء الإنتاج على Render (أو أي منصة).
#
# بيشتغل من جذر المستودع أو من apps/api — عشان ما يهمش إعداد Root Directory
# في لوحة Render.
#
#  1) تثبيت الحزم (npm ci، ولو فشل npm install).
#  2) بناء الـ API — إجباري؛ لو فشل البناء كله يفشل (صح).
#  3) بناء الواجهة — منفصل ومتسلسل (مش متوازي) لتقليل استهلاك الذاكرة،
#     ولو فشل ما بنفشّلش النشر: الـ API يشتغل، والواجهة تتضاف بعدها.
#  4) نسخ apps/web/dist إلى apps/api/public عشان الـ API يقدّمها.
# ============================================================================
set -uo pipefail

ROOT_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
cd "$ROOT_DIR"

log() { echo "[build] $*"; }

if [ ! -f package-lock.json ]; then
  log "❌ package-lock.json مش موجود في $ROOT_DIR — تأكد إن Root Directory مش جوه apps/api"
  exit 1
fi

log "تثبيت الحزم (npm ci)"
if ! npm ci --include=dev --no-audit --no-fund; then
  log "⚠️ npm ci فشل — بجرّب npm install"
  npm install --include=dev --no-audit --no-fund || {
    log "❌ فشل تثبيت الحزم"
    exit 1
  }
fi

log "بناء الـ API"
npm run build --workspace @erp/api || {
  log "❌ فشل بناء الـ API"
  exit 1
}

log "بناء الواجهة (متسلسل — تقليل الذاكرة)"
if NODE_OPTIONS="--max-old-space-size=${WEB_BUILD_HEAP_MB:-512}" \
  npm run build --workspace @erp/web; then
  rm -rf apps/api/public
  cp -r apps/web/dist apps/api/public
  log "✅ الواجهة اتبنت واتنسخت إلى apps/api/public"
else
  log "⚠️ بناء الواجهة فشل (غالباً ذاكرة) — الـ API هينشر من غير واجهة."
  log "   الحل: زوّد ذاكرة البناء، أو ابنِ الواجهة على استضافة ثابتة وحدّد VITE_API_URL."
fi

log "تم"
