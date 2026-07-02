# Runbook:数据库备份与恢复

## 备份策略(部署与运维设计)
- 平台数据库:每日 `pg_dump`,保留 30 天 + 月度归档;备份文件加密存储。
- Keycloak 数据库:每日备份;realm 配置每周 `--export` 导出并纳入版本管理。
- RPO 目标:不丢失当天重要业务事件;RTO:30 分钟内恢复。

## 备份
```bash
DATABASE_URL="postgres://identity:***@host:5432/identity_platform" \
  ./scripts/backup-db.sh /var/backups/identity
```
定时:crontab 每日调用;归档上传到加密对象存储。

## 恢复演练(必须定期执行)
```bash
# 1. 新建演练库
createdb -h host -U postgres identity_restore_drill
# 2. 恢复
TARGET_URL="postgres://postgres:***@host:5432/identity_restore_drill" \
  ./scripts/restore-db.sh /var/backups/identity/identity_platform_<stamp>.dump
# 3. 校验:表数量 = 20,关键表行数与源库一致
psql "$TARGET_URL" -c "SELECT count(*) FROM information_schema.tables WHERE table_schema='public';"
# 4. 清理演练库
```

## 演练记录
每次演练记录:备份时间戳、恢复耗时(对照 RTO 30min)、表/行校验结果、发现的问题。
