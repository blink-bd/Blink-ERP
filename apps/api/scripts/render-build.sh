#!/usr/bin/env bash
# نسخة توافقية: لو خدمة Render مضبوطة على rootDir=apps/api، أمر البناء
# `bash scripts/render-build.sh` هيلاقي الملف ده وينفّذ السكربت الأصلي.
set -euo pipefail
exec bash "$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)/scripts/render-build.sh"
