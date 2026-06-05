# opencode-im-notifier

OpenCode 插件 — 当 OpenCode 执行完毕或需要用户确认时，自动发送通知到**钉钉**、**飞书**、**企业微信**群。

## 功能

| 事件 | 触发时机 | 通知示例 |
|------|----------|----------|
| `session.idle` | 会话变为空闲（执行完成） | ✅ OpenCode 执行完成 |
| `permission.asked` | 工具需要用户授权 | 🔐 OpenCode 需要授权 |
| `question.asked` | AI 向用户提问 | ❓ OpenCode 正在询问 |
| `session.error` | 执行出错 | ❌ OpenCode 执行出错 |

额外特性：

- **用户提问追踪**：自动记录最近一次用户提问，在通知中附带，方便追溯上下文
- **静默时段**：可配置 `quietHours`，在指定时间段内不发送通知
- **子 Agent 过滤**：子 Agent（如 `@explore`）的执行完成和出错通知会被自动跳过，避免干扰；但子 Agent 的权限申请和用户提问仍会正常通知

## 安装

```bash
opencode plugin opencode-im-notifier --global
```

或通过本地路径安装：

```bash
opencode plugin /path/to/opencode-im-notifier --global
```

安装后会自动在 `~/.config/opencode/opencode-im-notifier.json` 生成示例配置文件，编辑它填入你的 webhook 地址即可使用。

## 配置

配置有两种方式：**单独配置文件**（推荐）或 **opencode.jsonc 内联**。

### 方式一：单独配置文件（推荐）

在项目目录或全局配置目录创建 `opencode-im-notifier.json`：

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
  "plugin": ["opencode-im-notifier"]
}
```

插件会自动按以下顺序查找配置文件（先找到的生效）：

| 优先级 | 路径 |
|--------|------|
| 1 | `opencode.jsonc` 中 `configFile` 字段指定的路径 |
| 2 | `{项目目录}/opencode-im-notifier.json` |
| 3 | `{项目目录}/.opencode/opencode-im-notifier.json` |
| 4 | `~/.config/opencode/opencode-im-notifier.json` |

### 方式二：opencode.jsonc 内联

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    ["opencode-im-notifier", {
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
    }]
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

- 纯 TypeScript，零外部依赖（仅使用 `@opencode-ai/plugin` 类型）
- 使用原生 `fetch` 调用 webhook API
- 钉钉支持 HMAC-SHA256 签名校验
- 所有通知请求异步并行发送，不阻塞 OpenCode 事件处理
- 失败时仅打印错误日志，不会影响 OpenCode 正常运行
