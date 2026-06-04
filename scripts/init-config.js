#!/usr/bin/env node
import { writeFileSync, existsSync, mkdirSync } from "node:fs";
import { join } from "node:path";
import { homedir } from "node:os";

const configDir = join(homedir(), ".config", "opencode");
const configPath = join(configDir, "opencode-im-notifier.json");

if (existsSync(configPath)) {
  console.log("[opencode-im-notifier] config already exists:", configPath);
  process.exit(0);
}

const example = {
  dingtalk: {
    enable: true,
    webhook: "https://oapi.dingtalk.com/robot/send?access_token=你的token",
    secret: "你的加签密钥（可选）",
  },
  feishu: {
    enable: true,
    webhook: "https://open.feishu.cn/open-apis/bot/v2/hook/你的webhook",
  },
  wecom: {
    enable: true,
    webhook: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=你的key",
  },
  notifyOn: ["idle", "permission", "question"],
  title: "",
};

mkdirSync(configDir, { recursive: true });
writeFileSync(configPath, JSON.stringify(example, null, 2) + "\n", "utf-8");
console.log("[opencode-im-notifier] config created:", configPath);
