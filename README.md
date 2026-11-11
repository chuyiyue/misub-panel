# misub-panel

MiSub 用户面板（Workers 轻量版）：只做「用户 + 套餐 + 到期 + 订阅分发」，节点管理与订阅生成继续由 [MiSub](https://github.com/CrazyForks/MiSub) 负责，两者通过 MiSub 的 External Management API 对接，用户订阅经面板代理分发，MiSub 的订阅组链接不下发给用户

## 架构

- 后端：单个 Cloudflare Worker（Hono），按领域分模块：`auth` / `user` / `admin` / `sub` / `compat-v1`
- 存储：D1（业务数据，9 张表）、KV（低频配置类缓存）、R2（主题资源）、Cache API（订阅内容与 token 状态缓存）
- 设备数：Durable Object `DeviceTracker`（按订阅计数，SQLite 后端）
- 前端：Vue 3 + Vite + TypeScript + Tailwind CSS；用户端是可换的原生主题，管理端固定
- 定时：Cron 每小时刷新 MiSub 订阅组 userInfo，每天清理过期数据

```
apps/worker/     Hono 后端（Workers）
apps/user-web/   默认原生主题（Vue 3）
apps/admin-web/  管理端（Vue 3）
packages/theme-sdk/  原生主题 SDK
packages/shared/     共享类型与校验
themes/          内置主题包
```

## 与 MiSub 的对接（开工前已核对源码）

- 管理接口：`{MISUB_BASE_URL}/api/ext/v1`，Bearer Token 鉴权（需先在 MiSub 设置页启用 External Management API）
- 订阅内容：走 MiSub 的订阅组外链 `/sub/{profileToken}/{customId 或 id}`，其中 `profileToken` 是 MiSub 全局设置，与上面的 Bearer Token 是两回事，两者都要配
- 面板转发订阅时原样透传客户端 User-Agent 与 `target` 等格式参数：格式由这些信息决定，换成浏览器 UA 会被 MiSub 的伪装页拦下
- 强刷参数（`refresh` / `nocache` / `debug`）默认不透传，避免击穿缓存

## 配置（Worker Secrets，不进数据库）

| Secret | 说明 |
| --- | --- |
| `MISUB_BASE_URL` | MiSub 地址，如 `https://misub.example.com` |
| `MISUB_EXT_TOKEN` | External Management API 的 Bearer Token |
| `MISUB_PROFILE_TOKEN` | MiSub 全局设置里的 profileToken，用于取订阅组内容 |
| `SESSION_SECRET` | 会话与令牌签名密钥 |
| `IP_HASH_SALT` | access_log 里 IP 哈希的盐 |

## 里程碑

1. 骨架与对接：Worker 脚手架、D1 迁移、MiSubClient、测试连接
2. 用户与订阅：注册登录、套餐、订阅实例、`/sub/:token` 校验与代理
3. 管理端：用户、套餐、邀请码、公告、系统设置
4. 用户端原生主题：仪表盘、一键导入、教程
5. 主题宿主：zip 安装、R2 静态服务、配置表单
6. 兼容层：`/api/v1` 接口子集，逐个验收 V2Board / Xboard 主题
7. 加固：限频、Turnstile、设备数限制、Cron、备份与监控

## 开发

```bash
pnpm install
pnpm --filter @misub-panel/worker dev
```
