#!/usr/bin/env bash
# نسخة توافقية: لو خدمة Render لسه مضبوطة على rootDir=apps/api، الأمر
# startCommand: bash scripts/start-production.sh هيلاقي الملف ده وينفّذ
# السكربت الأصلي في جذر المستودع.
set -euo pipefail
exec bash "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/scripts/start-production.sh"
