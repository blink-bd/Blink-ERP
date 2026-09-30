#!/bin/bash
if [ -z "$1" ]; then
  echo "Usage: ./scripts/create-migration.sh MigrationName"
  exit 1
fi
cd apps/api
npm run typeorm migration:generate -- -n "$1"
