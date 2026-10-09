# Runbook:故障响应

## 分级
- P1:身份服务(Keycloak)不可用、门户不可登录、数据泄露风险。
- P2:同步管道积压、Webhook 大面积失败、单业务应用准入异常。
- P3:单用户问题、非关键功能降级。

## Keycloak 不可用(P1)
降级策略(安全设计 §15.1)自动生效:已持有 token 继续可用;新登录 503;管理写操作 503(`assertKeycloakAvailableForWrite`);准入缓存仅拒绝不放行。
1. 确认 Keycloak 容器/DB 状态,恢复服务。
2. 恢复后触发全量对账:`reconcile-keycloak-users`、`reconcile-application-projections`。
3. 审计降级期间的拒绝事件。

## break_glass 应急
Keycloak 或本地 RBAC 损坏时,用 `break_glass_admin` 账号(realm role)登录初始化/修复。使用后:改密、审计留痕、通知负责人。

## 同步管道积压(P2)
1. 查 `outbox_events` status=pending/failed 计数、`dead_letter_events` 增长、RabbitMQ 队列深度。
2. MQ 故障:恢复 RabbitMQ → `dispatch-outbox-events` 自动补发 → `retry-dead-letter-events` 重放死信。
3. Webhook 失败:查 `webhook_deliveries` status=dead + lastError;达到五次上限后保留 dead 与 attempts,不会由周期死信任务自动重排。Consumer 死信同样保留人工处理。

### Webhook 人工单次重排与审计闭环
1. 先修复接收端错误,验证真实路由、签名、消费端幂等表与应用目标。CMS 的 `access.application.granted` 只允许目标 `cms`;其他目标不发送,缺失/畸形目标在发送前隔离并保留未解决审计。解析仅解开一层对象 payload,与部署接收端一致。
2. 按应用、事件类型、投递 UUID 与对应原始死信 UUID 列出精确范围,备份原行。禁止按 source 批量重排、清零 attempts 或将全部死信标记为解决。
3. 经审核后,在带行锁和原行状态校验的事务内仅将明确选定的投递置为 pending 并设置 next_retry_at;保留 attempts、payload 与原始审计。修复后一次人工投递可使 attempts 从 5 到 6;失败再次进入 dead,不自动循环。
4. 先验证投递为 delivered,再按 event_id 核对接收端去重记录及事件类型,最后在独立事务内仅关闭对应原始死信审计。合法 ignored 事件也应有去重记录;不能把 HTTP 2xx 推断为用户或角色被创建。
5. 保留其他应用、错误目标与未验证事件的隔离状态。业务端历史授权事实仍以 application_assignments 为准,不通过事件重排补授不存在的准入。

### 修复随发布保留
- 从包含上述修复的源码构建 worker,记录源码 SHA 与镜像摘要,将最终镜像持久化到正式 Compose;以后 build/up 不应回退到旧 worker 镜像。
- 重建前比较实际容器与候选容器的环境、命令、用户、工作目录、挂载、网络、重启策略与日志轮转。只输出不同键名,不输出密钥值。worker 不发布端口。
- MCMS 的消费端去重表及接收端应用边界由 MCMS 自己的源码/迁移负责;Identity Center 的迁移不代建业务数据库表。发布前执行 MCMS 所有者提供的迁移与兼容性检查。
- 发布后比较两个时间点的投递积压、未解决审计、消费端日志与 binlog 大小,确认周期死信任务确实执行且没有自动复活 dead 记录。容器健康只是其中一项证据。

## 准入撤销投影失败
撤权 API 返回 502 时:事实已 revoked,`project-keycloak-assignments` 每分钟重投;持续失败查 `application_assignments.last_projection_error` + 告警。

## 事后
记录时间线、影响面、根因、修复与预防项;更新监控阈值。
