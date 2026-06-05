#!/usr/bin/env node
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const configDir = join(homedir(), ".config", "opencode");
const configPath = join(configDir, "opencode-im-notifier.jsonc");

if (existsSync(configPath)) {
  console.log("[opencode-im-notifier] config already exists:", configPath);
  process.exit(0);
}

const lines = [
  `{`,
  `  "dingtalk": {`,
  `    "enable": true,`,
  `    "webhook": "https://oapi.dingtalk.com/robot/send?access_token=你的token",`,
  `    "secret": "你的加签密钥（可选）"`,
  `  },`,
  `  "feishu": {`,
  `    "enable": true,`,
  `    "webhook": "https://open.feishu.cn/open-apis/bot/v2/hook/你的webhook"`,
  `  },`,
  `  "wecom": {`,
  `    "enable": true,`,
  `    "webhook": "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=你的key"`,
  `  },`,
  `  // 可选：静默时段，在此时间段内不发送通知`,
  `  // start / end 格式：HH:mm（24小时制），留空或相同表示不启用`,
  `  "quietHours": {`,
  `    "start": "",    // 例如 "23:00"`,
  `    "end": ""       // 例如 "09:00"`,
  `  },`,
  `  "notifyOn": ["idle", "permission", "question", "error"],`,
  `  "title": ""`,
  `}`,
];

mkdirSync(configDir, { recursive: true });
writeFileSync(configPath, lines.join("\n") + "\n", "utf-8");
console.log("[opencode-im-notifier] config created:", configPath);
