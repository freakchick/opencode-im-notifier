# opencode-im-notifier

[![GitHub](https://img.shields.io/badge/GitHub-freakchick/opencode--im--notifier-181717?logo=github)](https://github.com/freakchick/opencode-im-notifier)

OpenCode 插件 — 当 OpenCode 执行完毕或需要用户确认时，自动发送通知到**钉钉**、**飞书**、**企业微信**群。

> **兼容性**：本版本面向 **OpenCode V2**（`@opencode/plugin` 2.3.2），V1 插件实现在 V2 下不会加载。旧版 V1 用户请使用 0.1.x。

## 功能

| 事件（V2 事件名） | 触发时机 | 通知示例 |
|------|----------|----------|
| `session.execution.succeeded`（兼容 `session.idle`） | 会话执行完成 | ✅ OpenCode 执行完成 |
| `permission.asked` | 工具需要用户授权 | 🔐 OpenCode 需要授权 |
| `form.created` | AI 向用户提问/表单 | ❓ OpenCode 正在询问 |
| `session.execution.failed` | 执行出错 | ❌ OpenCode 执行出错 |

> V2 正常会话完成发的是 `session.execution.succeeded`，不一定会发 `session.idle`；插件同时监听两者并按会话去重，不会重复通知。

配置中的 `notifyOn` 仍使用简短名称 `idle` / `permission` / `question` / `error`，由插件内部映射到上述 V2 事件。

额外特性：

- **用户提问追踪**：自动记录最近一次用户提问，在通知中附带，方便追溯上下文
- **静默时段**：可配置 `quietHours`，在指定时间段内不发送通知
- **子 Agent 过滤**：子 Agent（如 `@explore`）的执行完成和出错通知会被自动跳过，避免干扰；但子 Agent 的权限申请和用户提问仍会正常通知

## 安装

```bash
opencode plugin add opencode-im-notifier
```

该命令会把插件加入全局 `~/.config/opencode/opencode.json(c)`。本地开发时直接编辑配置文件：

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["/path/to/opencode-im-notifier"]
}
```

首次加载时会自动在 `~/.config/opencode/opencode-im-notifier.jsonc` 生成示例配置文件，编辑它填入你的 webhook 地址即可使用（配置变更会自动重载，无需重启）。

## 配置

配置有两种方式：**单独配置文件**（推荐）或 **opencode.jsonc 内联**。

### 方式一：单独配置文件（推荐）

在项目目录或全局配置目录创建 `opencode-im-notifier.jsonc`（也兼容旧版 `.json`）：

```json
{
  "dingtalk": {
    "enable": true,
    "webhook": "https://oapi.dingtalk.com/robot/send?access_token=xxx",
    "secret": "SEC..."
  },
  "feishu": {
    "enable": true,
    "webhook": "https://open.feishu.cn/open-apis/bot/v2/hook/xxx"
  },
  "wecom": {
    "enable": true,
    "webhook": "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx"
  },
  "notifyOn": ["idle", "permission", "question", "error"],
  "quietHours": {
    "start": "22:00",
    "end": "08:00"
  },
  "title": "我的项目"
}
```

然后 `opencode.jsonc` 只需要注册插件，不需要写配置：

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": ["opencode-im-notifier"]
}
```

插件会自动按以下顺序查找配置文件（先找到的生效）：

| 优先级 | 路径 |
|--------|------|
| 1 | inline 配置中的 `configFile` 字段指定路径 |
| 2 | `{当前目录}/opencode-im-notifier.jsonc` → `.json`，然后 `{当前目录}/.opencode/` 下同名文件 |
| 3 | `{项目目录}/opencode-im-notifier.jsonc` → `.json`，然后 `{项目目录}/.opencode/` 下同名文件 |
| 4 | `~/.config/opencode/opencode-im-notifier.jsonc` → `.json` |

### 方式二：opencode.jsonc 内联

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugins": [
    {
      "package": "opencode-im-notifier",
      "options": {
        "dingtalk": {
          "enable": true,
          "webhook": "https://oapi.dingtalk.com/robot/send?access_token=xxx",
          "secret": "SEC..."
        },
        "feishu": {
          "enable": true,
          "webhook": "https://open.feishu.cn/open-apis/bot/v2/hook/xxx"
        },
        "wecom": {
          "enable": true,
          "webhook": "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx"
        },
        "notifyOn": ["idle", "permission", "question"],
        "title": "我的项目"
      }
    }
  ]
}
```

> 内联配置优先级高于文件配置，两者同时存在时内联会覆盖文件中的对应字段。

### 配置说明

- **enable**：每个平台独立的开关，`true` 启用，`false` 关闭。不填时默认为 `true`
- **notifyOn**：全局控制哪些事件触发通知，可选值：`idle`、`permission`、`question`、`error`，默认全部
- **title**：通知中显示的项目名称，默认为工作目录名称
- **quietHours**：静默时段，在指定时间段内不发送通知。格式：`{ "start": "22:00", "end": "08:00" }`
- **configFile**：自定义配置文件路径，插件会优先读取该路径

### 最小配置（只用飞书）

`opencode-im-notifier.json`:

```json
{
  "feishu": {
    "enable": true,
    "webhook": "https://open.feishu.cn/open-apis/bot/v2/hook/xxx"
  }
}
```

## 通知格式

### 钉钉（markdown 消息）

```markdown
### ✅ OpenCode 执行完成

- **项目**：我的项目
- **会话**：修复登录页面样式
- **主机**：my-server
- **时间**：2026-06-04 10:30:00
```

### 飞书（交互式卡片）

头部标题 + markdown 正文（自动去掉 `###` 标题行避免重复），内容同上。

### 企业微信（markdown 消息）

```markdown
### ✅ OpenCode 执行完成

- **项目**：我的项目
- **会话**：修复登录页面样式
- **主机**：my-server
- **时间**：2026-06-04 10:30:00
```

## 通知示例

**执行完成：**

> ✅ OpenCode 执行完成
> 用户提问：实现用户登录功能
> 项目：my-app
> 会话：添加用户注册功能
> 主机：my-server
> 时间：2026-06-04 10:30:00

**需要授权：**

> 🔐 OpenCode 需要授权
> 用户提问：清理 node_modules
> 操作：bash
> 指令：rm -rf node_modules
> 项目：my-app
> 会话：清理依赖
> 主机：my-server

**正在询问：**

> ❓ OpenCode 正在询问
> 用户提问：设计 API 架构
> 问题：请选择实现方案
> 选项：REST API / GraphQL
> 项目：my-app
> 会话：设计 API 架构
> 主机：my-server

**执行出错：**

> ❌ OpenCode 执行出错
> 用户提问：部署到生产环境
> 错误类型：RuntimeError
> 错误信息：Connection refused
> 项目：my-app
> 会话：部署脚本
> 主机：my-server
> 时间：2026-06-04 10:30:00

## 获取 Webhook 地址

### 钉钉

1. 群设置 → 智能群助手 → 添加机器人 → 自定义
2. 复制 Webhook 地址
3. 如果开启安全设置中的「加签」，复制 Secret

### 飞书

1. 群设置 → 群机器人 → 添加机器人 → Webhook 机器人
2. 复制 Webhook 地址

### 企业微信

1. 群设置 → 群机器人 → 添加机器人 → 新机器人
2. 给机器人起名，复制 Webhook 地址

## 开发

```bash
# 安装依赖
npm install

# 编译
npm run build

# 本地测试（在 opencode.jsonc 中指向 dist/index.js）
```

### 项目结构

```
opencode-im-notifier/
├── opencode-im-notifier.example.json   # 示例配置文件
├── package.json
├── tsconfig.json
├── README.md
├── src/
│   ├── index.ts            # 插件入口，event hook 分发
│   ├── types.ts            # 配置类型
│   └── notifiers/
│       ├── dingtalk.ts     # 钉钉机器人
│       ├── feishu.ts       # 飞书机器人
│       └── wecom.ts        # 企业微信机器人
└── dist/                   # 编译产物
```

## 技术细节

- 纯 TypeScript，零业务依赖（仅使用 V2 的 `@opencode/plugin` 类型）
- 使用原生 `fetch` 调用 webhook API
- 钉钉支持 HMAC-SHA256 签名校验
- 所有通知请求异步并行发送，不阻塞 OpenCode 事件处理
- 失败时仅打印错误日志，不会影响 OpenCode 正常运行
