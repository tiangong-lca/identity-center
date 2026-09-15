---
docType: runbook
scope: repo
status: active
authoritative: true
owner: identity-center
language: zh
whenToUse: Webhook 扇出失败、失败队列积压或需要评估历史漏投时。
whenToUpdate: 扇出事务、失败消息保留或恢复命令改变时。
checkPaths:
  - identity-portal/server/jobs/deliver-webhooks.ts
  - identity-portal/lib/mq/rabbitmq-adapter.ts
  - identity-portal/scripts/worker.ts
  - identity-portal/scripts/replay-webhook-fanout.ts
lastReviewedAt: 2026-09-15
---

# Webhook 扇出失败恢复

关联：Issue #19；账号迁移验证见 Issue #14。

## 行为与边界

Worker 将 `processed_events` 的 `webhook-fanout` 标记与该事件的全部 `webhook_deliveries` 放进同一事务。插入失败时一起回滚，重复/并发事件通过标记的复合主键去重。没有有效订阅应用时仍记录已处理，之后新增订阅不会补收该历史事件。

Worker 扇出最多尝试三次，间隔 1 秒、2 秒；耗尽尝试或收到无效 JSON 后，将原始消息转存到 durable quorum 队列 `identity.webhook-fanout.failed`。转存使用 persistent、mandatory 和 publisher confirm；只有消息已路由且收到确认后才 ack 原消息。转存失败则关闭消费通道，未确认消息回队，Worker 以退出码 1 退出，由部署的重启策略恢复消费。部署需保留 RabbitMQ 数据卷及 Worker 重启策略，并监控 Worker 重启次数和失败队列积压。

这是至少一次传输：确认后、ack 前中断可能产生重复，数据库事务提供去重。失败事件不自动循环重放；也不进入数据库 `dead_letter_events`。管理后台的数据库死信重试按钮不处理此 MQ 队列。原有 HTTP Webhook 失败重试仍使用 `webhook_deliveries` 和数据库死信机制。

此修复不更改任何 Supabase 表或用户 ID，不运行账号迁移，不修改数据库结构。部署修复后的 Worker 才能生效。它也不会自动修复旧版本已经形成的“有标记、无投递单”记录。

## 修复原因后，限量恢复

1. 检查 Worker/MQ 日志和数据库可用性，先排除数据库写入失败、连接故障等原因。消息负载含用户信息，不要把完整负载或连接凭证粘贴到公开日志。
2. 确认修复后的 Worker 正在运行、源队列 `identity.webhook-fanout` 和失败队列均存在。失败队列应无自动过期、丢弃型长度限制或破坏性的外部策略。不要持续重启故障消费者：RabbitMQ quorum 的 delivery limit 仍可能限制多次异常回队，需及时修复告警。
3. 在 Worker 的 `/app` 目录，使用该容器已有 `RABBITMQ_URL` 执行小批重放：

   ```bash
   node_modules/.bin/tsx scripts/replay-webhook-fanout.ts --limit 10
   ```

   命令必须显式提供 1–1000 的整数上限。它最多处理启动时失败队列的待消费条数与上限的较小者；只把失败队列消息转回原消费队列，不重置 outbox、不删除处理标记。目标队列不存在或无法确认转存时保留未确认消息并返回非零。中途失败时前几条可能已经入队，不能把非零退出码解释为“本批完全未执行”。
4. 核对本批事件在 `processed_events`、`webhook_deliveries` 中的对应关系、投递状态和业务应用的同步结果。命令输出的 `Requeued` 仅代表成功入队，不代表投递完成。原因未消除或消息格式错误时会再次进入失败队列；先解决原因，再执行下一批。

## 历史漏投处理

旧版本可能已经提交处理标记却没有创建投递单。此类事件不一定在失败队列，直接重发也会被历史标记跳过。

按事件 ID、应用 ID、outbox 原始事件、当时订阅状态及业务端消费记录进行只读审计。没有投递单也可能是当时没有有效订阅应用，不能仅凭这一点认定漏投。确认缺口后，另行准备限定事件及应用的备份、补单和验证方案；禁止全表删除 `processed_events` 或重置所有 outbox。账号迁移仍需单独验证原 UUID、密码登录、SSO、角色和数据可见性。

## 验证

在独立测试 PostgreSQL/RabbitMQ 上运行（只使用测试连接）：

```bash
pnpm exec vitest run --project integration tests/integration/webhook-fanout.test.ts tests/integration/mq-failure-recovery.test.ts tests/integration/mq-adapter.test.ts
```

覆盖失败回滚、并发去重、消费失败转存、无效 JSON 保留、重放成功、转存目标丢失时保留原消息、错误重放参数，以及旧 MQ 选项兼容。源码覆盖到实际部署 Worker 镜像的隔离演练另验证完整出站/签名投递、HTTP 暂时失败、Worker 重启及 RabbitMQ 重启后的恢复；模拟接收器不替代真实 LCA Edge 和浏览器验收。

传输依据：[RabbitMQ publisher confirms](https://www.rabbitmq.com/docs/confirms) 与 [quorum queues](https://www.rabbitmq.com/docs/quorum-queues)。
