---
docType: reference
scope: repo
status: active
authoritative: true
owner: identity-center
language: zh
whenToUse: 需要确认 KingbaseES 开发环境结论、当前非阻塞预留状态或相关裁决时阅读本文档。
whenToUpdate: KingbaseES 开发环境结论或裁决状态发生变化时更新本文档。
checkPaths:
  - docs/references/kingbasees-environment.md
  - docs/references/kingbasees-compatibility-conventions.md
  - docs/implementation/decisions.md
lastReviewedAt: 2026-07-07
lastReviewedCommit: 3cba77d
---

# KingbaseES 开发环境结论(2026-07-02)

> 状态:**非阻塞预留**(用户裁决,见 `docs/implementation/decisions.md` D-001)。

## 镜像调研结论

| 途径 | 结论 |
|---|---|
| 官方 Docker Hub | **不存在**官方镜像 |
| 官方下载中心(kingbase.com.cn) | 提供 Docker tar 包(如 `KingbaseES_V009R001C010B0004_x86_64_Docker.tar`),需手动下载 + `docker load`,含试用授权 |
| 社区镜像 `warm3snow/kingbase:v8r6` | V8R6,**arm64**(0.35GB)——本机 Apple Silicon 首选 |
| 社区镜像 `huzhihui/kingbase:v8r6` | V008R006C007B0012,amd64(0.47GB),Apple Silicon 需模拟 |

2026-07-02 实测:
- `warm3snow/kingbase:v8r6`(arm64,0.35GB)镜像拉取成功,但**启动失败**——该镜像实为 x86 二进制打包,在 arm64/OrbStack 上报 `Dynamic loader not found: /lib64/ld-linux-x86-64.so.2`,且 initdb 对挂载卷 `chown` 失败。不可用。
- `huzhihui/kingbase:v8r6`(amd64,0.47GB)镜像层多次拉取在网络层反复重试(Docker Hub 吞吐不稳),未能落地。amd64 镜像即便拉到,本机 arm64 需 QEMU 模拟,性能与稳定性存疑。

**结论(D-001 非阻塞)**:开发机本地无可用 KES 容器。双库兼容三件套已就绪(兼容约定成文 + `lib/db` thin adapter + `KES_ENABLED=1` 参数化矩阵),KES 实测推迟到具备 x86 主机或官方授权 tar 镜像的环境执行。PostgreSQL 侧全部迁移与测试已通过,兼容约定已作为 code review 检查项强制执行。

## 已预留的接入点(镜像可得后即插即用)

1. **compose 服务**:`identity-portal/deploy/docker/docker-compose.dev.yml` 中 `kingbase` 服务(profile `kes`),env `SYSTEM_USER/SYSTEM_PWD=kingbase`、端口 54321、数据卷 `kingbase-data`(用法来源:镜像作者部署文档,healthcheck 的 ksql 路径待实测校正)。
2. **thin adapter**:`lib/db` 连接工厂按连接串创建客户端;KES 走 PostgreSQL 兼容模式同一 `pg` 驱动,连接串 `KINGBASE_URL`(`deploy/env/.env.example` 已有样例)。
3. **参数化测试矩阵**:集成测试在 `KES_ENABLED=1` 时对 `KINGBASE_URL` 复跑同套迁移/repository 用例(L1 落地)。
4. **兼容约定**:核心路径禁用 PG 专有特性,约定清单随 L1 交付并作为 code review 检查项。

## 补验步骤(环境可得后)

```bash
# 1. 取得镜像(社区或官方 tar)
docker pull warm3snow/kingbase:v8r6          # 或 docker load -i KingbaseES_*.tar
# 2. 起服务
docker compose --profile kes -f deploy/docker/docker-compose.dev.yml up -d kingbase
# 3. 校正 healthcheck 中 ksql 实际路径;创建 identity 用户与 identity_platform 库
# 4. 跑双库矩阵
KES_ENABLED=1 pnpm test:integration
# 5. 结果回填本文档与 GOAL.md DoD 第 2 条
```

## 默认口径(来自镜像作者文档,待实测确认)

- 默认库 `test`,默认用户/密码 `kingbase/kingbase`,端口 54321
- 容器内 ksql:`cd Server/bin && ./ksql -Ukingbase test`
