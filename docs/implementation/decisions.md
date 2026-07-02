# 实施决策记录

> 按 GOAL.md §2:实施中发现的设计缺口、矛盾与用户裁决在此记录。

## D-001 KingbaseES 双库实测降级为非阻塞(2026-07-02,用户裁决)

**背景**:L0 阶段验证 KES 开发环境时,官方无 Docker Hub 镜像(官网 tar 包需手动下载),社区镜像(`warm3snow/kingbase:v8r6` arm64 / `huzhihui/kingbase:v8r6` amd64)因网络原因拉取困难,阻塞 L0 收尾。

**用户裁决**:KingbaseES 只是兼容数据库选择之一,**不作为 GOAL.md 推进的 blocker**;开发过程预留 thin adapter,完成 GOAL.md 除 kingbase 之外的所有任务。

**执行口径**:

1. PostgreSQL 为一等公民,全部测试以 PG 为准。
2. **thin adapter 预留**:`lib/db` 数据库客户端经连接工厂创建(连接串可配置);KES 走 PostgreSQL 兼容模式同一 `pg` 驱动,切换仅需 `KINGBASE_URL`。集成测试矩阵参数化(env 开关 `KES_ENABLED=1` 时同套测试跑 KES),环境可得后一键补验。
3. **兼容约定继续强制执行**:核心路径禁用 PG 专有特性(约定文档随 L1 交付,code review 检查项)。
4. compose 中 `kingbase` 服务(profile `kes`)保留,镜像可得后直接使用。
5. GOAL.md DoD 第 2 条(双库实测)调整为:PG 必须实测;KES 为"约定 + adapter + 参数化矩阵就绪",实测在环境可得后补做,不阻塞交付。
