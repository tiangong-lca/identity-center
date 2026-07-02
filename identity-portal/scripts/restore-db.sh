#!/bin/bash
# 平台数据库恢复(database-backup-restore runbook 配套)。
# 用法:TARGET_URL=... ./scripts/restore-db.sh <dump 文件>
set -euo pipefail

DUMP="${1:?需要 dump 文件路径}"
: "${TARGET_URL:?需要 TARGET_URL(恢复目标库)}"

pg_restore --clean --if-exists --no-owner --no-privileges --dbname "$TARGET_URL" "$DUMP"
echo "恢复完成: $DUMP → $TARGET_URL"
