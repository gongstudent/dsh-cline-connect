# dsh-cline-connect

把 [Cline](https://cline.bot) 网关的**免费模型**（`cline-free/*`）和 **ClinePass 订阅模型**（`cline-pass/*`）接入 [DeepSeek Harness](https://github.com/deepseek-ai/deepseek-harness)。
安装为 dsh 插件后，模型会直接出现在模型列表中，用户只需填一个 Key，无需运行任何代理服务。

## 这个插件解决什么问题

Cline 网关确实对外提供免费模型，列在 `GET /api/v1/ai/cline/recommended-models` 的 `free` 数组里。
但只用 `Authorization` 打它们是会被拒的：

```http
POST https://api.cline.bot/api/v1/chat/completions
Authorization: Bearer <key>

HTTP/1.1 403 Forbidden
{"error":{"code":"API_REQUEST_ERROR_CODE","message":"Error 403: cline-free/<model> is only available via Cline product surfaces. ..."}}
```

这正是官方文档那句话的服务端实现：*Free model usage is not supported through the Cline API. Free models are only available in the Cline IDE Extension and CLI.*

实测（2026-10-19）发现：**网关只校验 `x-client-type` 这个头存不存在，不校验它的值** —— `cline-cli`、`cline`、`vscode` 甚至 `bogus` 都能拿到 200。
带上这个头，免费模型立刻可用。**本插件的全部意义就是把这个头补上** —— dsh 自己不会加它（`attributionHeaders()` 只返回 `user-agent`）。

## 功能

- 自动发现并暴露 `cline-free/*` 与 `cline-pass/*` 两族模型
- 每个请求自动附带 `x-client-type: cline-cli`
- 支持流式输出、工具调用、图片与 reasoning
- 免费模型带 FREE 标记，一眼可见
- 显示账号配额（5 小时 / 每周 / 每月窗口，免费与订阅共用）
- 显示免费模型的用量（今日 / 近 7 天 / 按模型分解）
- 提供 Web 设置面板与可选的 `cline_connect_*` 工具

## 要求

- dsh（本机实测版本 `0.2.1-rc.2`）
- Node.js `>= 20.3`
- 一个 Cline API Key

## 安装

```bash
dsh plugin --profile desktop add -w github:gongstudent/dsh-cline-connect
```

安装后重启 dsh。

## 配置

### API Key

Key 在 [app.cline.bot](https://app.cline.bot) → **Settings → API Keys** 创建。
可以填在 **设置 → Cline Connect** 面板里（存入 dsh 凭据库，界面只显示掩码），也可以启动前设环境变量：

```bash
export CLINE_API_KEY=sk_xxx
```

默认凭据名是 `CLINE_API_KEY`，可在 profile 配置里改成别的。

### 配置文件

在 `$DSH_HOME/profiles/<name>/cordis.patch.yml` 中覆盖默认值：

```yaml
- id: cline-connect
  config:
    apiKeyEnv: CLINE_API_KEY
    exposeTools: true
```

### 管理工具

`cline_connect_*` 工具**默认不注册**。工具定义会出现在每次请求的工具列表里，而管理只是偶尔需要，所以默认让所有对话都不必付这份开销。
需要时在**设置 → Cline Connect** 中勾选「开启工具注入（重启后生效）」，或把 `exposeTools` 设为 `true`。

设置面板不受影响 —— 面板是浏览器页面而非工具，工具关闭时仍然可用。

## 模型发现

免费模型列表**会轮换**（官方说明：offered on a rotating, limited-time basis）。
插件每次激活以及手动刷新时都会重新拉取 `recommended-models`，所以不需要等插件更新就能用上新出现的免费模型。

**能力元数据（上下文窗口 / 是否支持图片 / 是否推理）上游拿不到**：`recommended-models` 只有 `id/name/description/tags`，models.dev 也没有 `cline-free` 这个 provider。
因此插件内置了一张手工维护的能力表（`lib/catalog.js` 的 `FREE_MODEL_CATALOG`），并在配置里支持逐模型覆盖；表里没有的新模型会走**保守兜底**（当作纯文本），并在面板上标记出来。

已知的实测差异：`cline-free/solar-mini4` **不支持图片输入**，其余三个支持。给它发图片时上游会返回 500（不是 4xx），插件会提前按模态拦下并给出可读错误。

## 免费模型的用量

面板里有一块「免费模型用量」，显示今日与近 7 天的 token 数、模型数与费用，以及今日按模型的分解。

### 没有「免费专属额度」这回事

上游**没有**提供免费模型的独立额度，这是实测结论而不是没做：

- `GET /users/me/plan/usage-limits` 返回的三个窗口（5 小时 / 每周 / 每月）是**账号级**的，免费与 ClinePass **共用**。加 `?modelType=cline-free` 数值完全不变（参数被忽略）。
- 不存在免费专属端点：`/users/me/limits`、`/users/me/plan/limits`、`/users/me/free-limit`、`/ai/cline/limits`、`/ai/cline/free-models` 全部 404。
- 免费模型响应里也没有任何 `x-ratelimit-*` 或 `retry-after` 头。
- Cline 官方 SDK **从不查询额度端点**；它识别额度耗尽的方式是字符串匹配 `free limit reached on model`，再从消息里解析 `try again in …`。

换句话说：**免费额度在撞到之前是不可见的**。所以面板显示的 token 用量来自按模型的用量明细，而不是某个额度百分比。

### 用量明细的判别字段

`GET /users/{id}/usages/daily` 返回按「天 × 模型」聚合的行，靠 **`aiModelTypeName`**（`cline-free` / `cline-pass` / `deepseek`）区分族别。

**不能按 `aiModelName` 前缀判断**：它有时是 id（`cline-free/nemotron-3.5-super-vl`），有时是展示名（`Mimo V2.6 Flash`），前缀匹配会静默丢行。

费用字段 `costUsd` 的单位是**微美元（1e-6 USD）**。

## ⚠️ 合规与风险

请在使用前了解以下几点：

1. **官方不鼓励这种用法。** 官方文档明确写着免费模型「not supported through the Cline API」。本插件是借用 CLI 产品面（`x-client-type: cline-cli`）来获取免费额度，**存在账号被限制的风险**。
2. **免费用量可能被用于改进模型。** 官方文档写明 free model usage *may be used to help improve model performance and quality*。敏感内容不要走免费模型。
3. **免费模型会消耗你账号的配额**，不是无限量，与 ClinePass 共用同一套窗口。
4. **列表与模型随时可能变化**，上游未列出的模型会直接 404。

## 与 dsh-cline-pass 的关系

本插件的实现以 MIT 许可的 [`dsh-cline-pass`](https://github.com/yhshzh/dsh-cline-pass) 为蓝本，目标是**替代**它（同时提供 `cline-free/*` 与 `cline-pass/*`）。

迁移时注意：

- 两者的 provider 路由名不同（本插件是 `cline-connect`），所以**可以并存**，不会互相冲突。并存期间模型选择器里会出现两个 provider 下的同名 `cline-pass/*` 模型。
- 路由名刻意不叫 `cline`：`@deepseek-ai/dsh-llm-pi-ai` 的 `providers` 字典键就是 harness 路由名，如果你已经用 pi-ai 配过一个 `cline` provider 作为免费模型的临时方案，两者会在 `registerAdapter` 处撞成 `DUPLICATE_ADAPTER`。
- 切换后需要**重新选一次会话模型** —— dsh 的模型选择是按 provider+model 记录的。
- 本插件**不提供**多账号池、渠道探测/校验/钉住（`probe`/`validate`/`pin`），这是有意的取舍。

## 开发

本仓库只包含插件本体（`lib/`、`locale/`、bundle patch 与包元数据），**不含测试与设计文档**。

> ⚠️ **安装方式决定能不能加载。** 用 `link:`（junction）方式安装时，插件属于 dsh 的 **linked 层**：
> 只有当插件 `package.json` 的 `peerDependencies` 里**列出了**某个包名时，dsh 才会把该裸导入路由到安装目录。
> 所以 `lib/` 里用到的每个 `@deepseek-ai/dsh-*` 都必须声明在 `peerDependencies` —— 漏一个，
> 插件就会**显示已启用、但组件状态是「未运行」**，界面空白且没有任何报错。
> 用 `github:` 方式安装（装进 profile 内部）不受这条限制。

调试时注意：`lib/` 中 `adapter.js`、`engine.js`、`index.js`、`tools.js` 会 import `@deepseek-ai/*`，
那些包只在 dsh 运行时内可解析，纯 node 下无法直接 import。

## License

[MIT](LICENSE)
