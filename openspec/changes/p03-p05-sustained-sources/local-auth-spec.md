# 本机经营者／维护者登录差异 spec（已确认并实施）

2026-11-21 · 独立复核 F02 触发的受影响范围变更。用户已确认直接复用正式 `styles.css` 与工作台 shell 的[修正版可点击 Demo](../../../docs/prototypes/p03-p05-local-auth/index.html)，随后实施正式登录产品代码。

## 当前差异与验收

当前 `startLocalHost` 只固定 owner 和同源 loopback，未认证工作台用户；正常 HTTP 不带登录即可建委托。独立 Spec R2 判定这不满足 P05 的“登录身份、企业与委托 owner 绑定、普通经营者与维护者权限各自生效”。本变更不引入生产 SSO、HTTPS 或企业管理面，它们继续 NOT_RUN。

| 路径 | 当前 | 拟变更 |
| --- | --- | --- |
| 工作台首次打开 | 直接读取固定 owner 的委托 | 先显示登录页；未登录不读取业务 API |
| 经营者 | 无显式身份/角色 | 使用管理员在私有 Host 配置的一次性本机令牌登录；会话绑定 `local-trial/local-operator` 和 operator 角色，可建/读/控制自己的委托 |
| 维护者 | 无独立入口 | 使用不同令牌登录，只能查看本机维护状态和组件/出口事实，不能读取或修改经营委托 |
| 维护接口 | 无 | 只读 `/api/maintenance`；operator 得 403，maintainer 可读 |
| 业务接口 | 无角色检查 | maintainer 得 403；operator 按原 owner 路径工作 |
| 退出 | 无 | 退出并撤销当前会话；原业务数据不删除 |

## 最小接口与安全边界

- 私有 Host 配置只保存两个角色各自的 **token SHA256**、owner 和会话时限；原 token 仅由管理员在本机首次配置时输入，不进公开仓库、日志、profile manifest 或页面投影。
- `POST /api/login` 只接收 token，不接收 enterprise/principal/role。Host 根据 hash 判定角色，创建随机会话；浏览器得到 `HttpOnly; SameSite=Strict; Path=/` 的随机会话 cookie。数据库只保存会话 hash、角色、owner、创建/到期时间。
- `GET /api/session` 返回当前角色、owner 和过期时间；`POST /api/logout` 撤销当前会话。其他业务 API 必须有效 operator 会话，维护 API 必须有效 maintainer 会话。`/api/health` 与静态资源保持可访问但不泄露业务数据。
- 401 表示未登录/会话失效，403 表示角色不允许；统一安全错误，不区分 token 是否存在。登录限流，请求体上限沿用，日志不记录 token/cookie。
- 未登录时前端不请求 `/api/delegations`。登录后清理 token 输入框；JS 后续只使用 HttpOnly 会话 cookie。刷新、浏览器重开和 Host 重开可按会话到期时间恢复。
- 既有官方 Harness/Engine/Runtime、owner/grant、来源与计算边界不变。没有第二身份权威：Host 的角色会话是唯一工作台身份来源，委托仍绑定原 owner。

## 四原则检查

- **Host 管环境：** 管理员配置角色 token hash 和 owner；Host 认证、授权、限流、撤销和审计。新增的人工作业仅是必要的登录/退出，不是普通读取或研究逐步审批。
- **Agent 自主：** 角色只约束浏览器和维护 API，不改变 Agent 的研究方法、工具选择或官方 Runtime。
- **SDK 复用：** 使用 Node 标准 crypto/HTTP/SQLite 与既有 Host，不新增第三方依赖、SDK 版本或身份插件。
- **减少操作：** 本机管理员一次配置两个角色 token；经营者正常使用只需登录和必要退出，无 owner/机器 ID 填写、逐步确认或维护者操作。

## 验证清单

- [x] 无 cookie/无效 token 不能读取或创建委托，401 安全错误且不泄露 owner 业务数据。
- [x] operator 登录、建单、刷新和重开均绑定配置 owner；operator 调维护 API 为 403。
- [x] maintainer 只能读取维护状态；其业务 API 为 403，不能通过请求体替换 owner/role。
- [x] token 不明文出现在 SQLite、原生会话、HTTP、控制台、日志或备份 manifest；cookie 不可被 JS 读取。
- [x] logout 后原会话 401；过期/撤销/篡改 cookie 均失败；登录有限流。
- [x] 真实浏览器验证登录/退出、键盘、错误状态、390px、operator/maintainer 分权；既有 U01–U12 回归。
- [ ] 旧服务数据不变；试用切换时在私有 Host 配置角色 hash，向用户单独交付本机 token 位置。

## Demo 边界

Demo 只用虚构内存状态，展示 operator/maintainer 两种登录、403、退出和移动布局；不调用网络、SDK、真实 token 或业务资料。Demo 通过只代表允许实施上述本机交互，不表示生产 SSO/HTTPS/身份隔离已确认或通过。
