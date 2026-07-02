#!/bin/bash
# 平台数据库备份(database-backup-restore runbook 配套)。
# 用法:DATABASE_URL=... ./scripts/backup-db.sh [输出目录]
set -euo pipefail

OUT_DIR="${1:-./backups}"
mkdir -p "$OUT_DIR"
STAMP=$(date -u +%Y%m%dT%H%M%SZ)
FILE="$OUT_DIR/identity_platform_${STAMP}.dump"

: "${DATABASE_URL:?需要 DATABASE_URL}"
pg_dump --format=custom --no-owner --no-privileges "$DATABASE_URL" --file "$FILE"
echo "备份完成: $FILE ($(du -h "$FILE" | cut -f1))"
