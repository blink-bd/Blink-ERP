#!/usr/bin/env bash
# ============================================================================
# فحص سريع لحالة السيستم المنشور.
#
# الاستخدام:
#   ./scripts/check-system.sh
#   ./scripts/check-system.sh https://erp-api-dad5.onrender.com
#
# بيقولك بالظبط إيه اللي واقع: خدمة الـ API، قاعدة البيانات، ولا الواجهة.
# ============================================================================
set -uo pipefail

API_URL="${1:-${API_URL:-https://erp-api-dad5.onrender.com}}"
API_URL="${API_URL%/}"

green() { printf '\033[32m%s\033[0m\n' "$*"; }
red() { printf '\033[31m%s\033[0m\n' "$*"; }
yellow() { printf '\033[33m%s\033[0m\n' "$*"; }
step() { printf '\n\033[1m%s\033[0m\n' "$*"; }

http_code() {
  curl -sS -o /tmp/check-system.out -w '%{http_code}' --max-time "${2:-90}" "$1" 2>/dev/null || echo "000"
}

echo "🔎 فحص: $API_URL"
echo "   (أول طلب ممكن ياخد 30-60 ثانية لو خدمة Render المجانية كانت نائمة)"

step "1) فحص حياة الخدمة (liveness) — مش محتاج قاعدة بيانات"
code=$(http_code "$API_URL/api/v1/health/live" 120)
if [ "$code" = "200" ]; then
  green "   ✅ الخدمة شغالة (HTTP $code)"
else
  red "   ❌ الخدمة مش بترد (HTTP $code)"
  yellow "   ➜ Render Dashboard → erp-api → Events/Logs. الأسباب الشائعة:"
  echo "      • الخدمة نائمة (free plan) — أول طلب بيصحّيها في 30-60 ثانية، أعد المحاولة"
  echo "      • آخر deploy فشل — راجع Deploy Logs"
  echo "      • النشر لسه بيتم / الخدمة اتعملها suspend لتجاوز حدود الخطة"
  echo "      • متغيرات بيئة ناقصة — الرسالة بتظهر في الـ Logs"
  exit 1
fi

step "2) فحص قاعدة البيانات (readiness)"
code=$(http_code "$API_URL/api/v1/health" 60)
body=$(cat /tmp/check-system.out 2>/dev/null || true)
if [ "$code" = "200" ]; then
  green "   ✅ قاعدة البيانات شغالة (HTTP $code)"
else
  red "   ❌ قاعدة البيانات مش بترد (HTTP $code)"
  echo "      $body"
  yellow "   ➜ Supabase Dashboard: لو المشروع Paused اضغط Restore/Resume."
  yellow "   ➜ تأكد إن DATABASE_URL على Render صح وإن قاعدة البيانات مش محذوفة."
fi

step "3) الواجهة (Web)"
code=$(http_code "$API_URL/" 60)
if [ "$code" = "200" ]; then
  green "   ✅ الواجهة متقدمة من نفس الخدمة (HTTP $code)"
else
  red "   ❌ الواجهة مش متقدمة من الخدمة (HTTP $code)"
  yellow "   ➜ تأكد إن الـ build بينسخ apps/web/dist إلى apps/api/public"
  echo "      (راجع buildCommand في render.yaml)"
fi

step "الخلاصة"
if [ "$code" = "200" ]; then
  green "السيستم شغال. افتح: $API_URL"
else
  yellow "راجع الخطوات اللي فوق، والتفاصيل الكاملة في docs/INCIDENT_RECOVERY.md"
fi
