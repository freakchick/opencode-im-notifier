# opencode-im-notifier

OpenCode 插件 — 当 OpenCode 执行完毕或需要用户确认时，自动发送通知到**钉钉**、**飞书**、**企业微信**群。

## 功能

| 事件 | 触发时机 | 通知示例 |
|------|----------|----------|
| `session.idle` | 会话变为空闲（执行完成） | ✅ OpenCode 执行完成 |
| `permission.asked` | 工具需要用户授权 | 🔐 OpenCode 需要授权 |
| `question.asked` | AI 向用户提问 | ❓ OpenCode 正在询问 |

## 安装

```bash
opencode plugin opencode-im-notifier --global
```

或通过本地路径安装：

```bash
opencode plugin /path/to/opencode-im-notifier --global
```

## 配置

在 `~/.config/opencode/opencode.jsonc`（或项目 `.opencode/opencode.jsonc`）中添加：

```jsonc
{
  "$schema": "https://opencode.ai/config.json",
  "plugin": [
    ["opencode-im-notifier", {
      // 钉钉
      "dingtalk": {
        "enable": true,
        "webhook": "https://oapi.dingtalk.com/robot/send?access_token=xxx",
        "secret": "SEC..."            // 可选，开启签名校验时需要
      },
      // 飞书
      "feishu": {
        "enable": true,
        "webhook": "https://open.feishu.cn/open-apis/bot/v2/hook/xxx"
      },
      // 企业微信
      "wecom": {
        "enable": true,
        "webhook": "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=xxx"
      },
      "notifyOn": ["idle", "permission", "question"],   // 可选，默认全部
      "title": "我的项目"                                  // 可选，自定义项目名称
    }]
  ]
}
```

### 配置说明

- **enable**：每个平台独立的开关，`true` 启用，`false` 关闭。不填时默认为 `true`（只要配置了 webhook）
- **notifyOn**：全局控制哪些事件触发通知，可选值：`idle`、`permission`、`question`
- **title**：通知中显示的项目名称，默认为工作目录名称
- 三个平台可以任意组合，不互斥

### 最小配置（只用飞书）

```jsonc
{
  "plugin": [
    ["opencode-im-notifier", {
      "feishu": {
        "enable": true,
        "webhook": "https://open.feishu.cn/open-apis/bot/v2/hook/xxx"
      }
    }]
  ]
}
```

## 通知格式

### 钉钉（markdown 消息）

```
#### ✅ OpenCode 执行完成

- **项目**：我的项目
- **会话**：修复登录页面样式
- **时间**：2026-06-04 10:30:00
```

### 飞书（交互式卡片）

头部标题 + markdown 正文，内容同上。

### 企业微信（markdown 消息）

```
✅ OpenCode 执行完成
- **项目**：我的项目
- **会话**：修复登录页面样式
- **时间**：2026-06-04 10:30:00
```

## 通知示例

**执行完成：**

> ✅ OpenCode 执行完成
> 项目：my-app
> 会话：添加用户注册功能
> 时间：2026-06-04 10:30:00

**需要授权：**

> 🔐 OpenCode 需要授权
> 操作：bash
> 指令：rm -rf node_modules
> 项目：my-app
> 会话：清理依赖

**正在询问：**

> ❓ OpenCode 正在询问
> 问题：请选择实现方案
> 选项：REST API / GraphQL
> 项目：my-app
> 会话：设计 API 架构

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
