import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir, hostname } from "node:os";
import type { Plugin } from "@opencode-ai/plugin";
import type { NotifierConfig, NotificationMessage } from "./types.js";
import { sendDingTalk } from "./notifiers/dingtalk.js";
import { sendFeishu } from "./notifiers/feishu.js";
import { sendWeCom } from "./notifiers/wecom.js";

interface SessionInfo {
  title?: string;
  id?: string;
}

interface EventPayload {
  type: string;
  properties: Record<string, unknown>;
}

async function notifyAll(
  config: NotifierConfig,
  msg: NotificationMessage
): Promise<void> {
  const tasks: Promise<void>[] = [];

  const dingEnabled = config.dingtalk && config.dingtalk.enable !== false;
  const feishuEnabled = config.feishu && config.feishu.enable !== false;
  const wecomEnabled = config.wecom && config.wecom.enable !== false;

  if (dingEnabled) {
    tasks.push(
      sendDingTalk(config.dingtalk!, msg).catch((err) =>
        console.error("[opencode-im-notifier] DingTalk error:", err)
      )
    );
  }

  if (feishuEnabled) {
    tasks.push(
      sendFeishu(config.feishu!, msg).catch((err) =>
        console.error("[opencode-im-notifier] Feishu error:", err)
      )
    );
  }

  if (wecomEnabled) {
    tasks.push(
      sendWeCom(config.wecom!, msg).catch((err) =>
        console.error("[opencode-im-notifier] WeCom error:", err)
      )
    );
  }

  await Promise.all(tasks);
}

function formatTime(): string {
  const d = new Date();
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}

async function resolveSessionTitle(
  client: Record<string, unknown>,
  sessionID: string
): Promise<string> {
  // Try client.session.get with directory hint
  try {
    const s = client.session as {
      get: (params: { sessionID: string; directory?: string; workspace?: string }) => Promise<{
        data?: SessionInfo;
      }>;
    };
    const res = await s.get({ sessionID });
    const title = res?.data?.title;
    if (title) return title;
  } catch {
    // fallback
  }

  // Try session.list to find the session by ID
  try {
    const sessionApi = client.session as {
      list: (params?: { scope?: string }) => Promise<{ data?: SessionInfo[] }>;
    };
    const listRes = await sessionApi.list({ scope: "project" });
    const sessions = listRes?.data;
    if (Array.isArray(sessions)) {
      const found = sessions.find((s) => s.id === sessionID || s.id?.endsWith(sessionID));
      if (found?.title) return found.title;
    }
  } catch {
    // fallback
  }

  return sessionID;
}

const CONFIG_FILENAME = "opencode-im-notifier.json";

async function loadConfigFile(path?: string): Promise<NotifierConfig | null> {
  try {
    const content = await readFile(path!, "utf-8");
    return JSON.parse(content) as NotifierConfig;
  } catch {
    return null;
  }
}

function mergeConfig(fileCfg: NotifierConfig | null, inlineCfg: NotifierConfig): NotifierConfig {
  if (!fileCfg) return inlineCfg;
  return {
    dingtalk: inlineCfg.dingtalk ?? fileCfg.dingtalk,
    feishu: inlineCfg.feishu ?? fileCfg.feishu,
    wecom: inlineCfg.wecom ?? fileCfg.wecom,
    notifyOn: inlineCfg.notifyOn ?? fileCfg.notifyOn,
    title: inlineCfg.title ?? fileCfg.title,
  };
}

const plugin: Plugin = async (input, options) => {
  const inline = (options ?? {}) as NotifierConfig;

  // 加载配置文件：自定义路径 > 项目目录 > 项目 .opencode/ > 全局配置
  const worktree = input.project?.worktree ?? input.directory;
  const candidates = [
    inline.configFile || null,
    worktree ? join(worktree, CONFIG_FILENAME) : null,
    worktree ? join(worktree, ".opencode", CONFIG_FILENAME) : null,
    join(homedir(), ".config", "opencode", CONFIG_FILENAME),
  ].filter(Boolean) as string[];

  let fileCfg: NotifierConfig | null = null;
  for (const p of candidates) {
    fileCfg = await loadConfigFile(p);
    if (fileCfg) break;
  }

  // 如果没有任何配置文件，自动生成全局配置
  if (!fileCfg && (!inline.dingtalk && !inline.feishu && !inline.wecom)) {
    const globalPath = join(homedir(), ".config", "opencode", CONFIG_FILENAME);
    try {
      await mkdir(join(homedir(), ".config", "opencode"), { recursive: true });
      await writeFile(globalPath, JSON.stringify({
        dingtalk: { enable: true, webhook: "https://oapi.dingtalk.com/robot/send?access_token=你的token", secret: "你的加签密钥（可选）" },
        feishu: { enable: true, webhook: "https://open.feishu.cn/open-apis/bot/v2/hook/你的webhook" },
        wecom: { enable: true, webhook: "https://qyapi.weixin.qq.com/cgi-bin/webhook/send?key=你的key" },
        notifyOn: ["idle", "permission", "question", "error"],
        title: "",
      }, null, 2) + "\n", "utf-8");
      console.error("[opencode-im-notifier] config file created:", globalPath);
    } catch { /* ignore */ }
  }

  const config = mergeConfig(fileCfg, inline);
  const notifyOn = new Set(config.notifyOn ?? ["idle", "permission", "question", "error"]);
  const projectTitle = config.title && config.title.trim() !== ""
    ? config.title
    : (input.project?.worktree ? input.project.worktree.split("/").pop()! : "OpenCode");
  const machineInfo = hostname();
  const client = input.client as unknown as Record<string, unknown>;

  return {
    event: async ({ event }) => {
      const ev = event as unknown as EventPayload;

      try {
        if (ev.type === "session.idle" && notifyOn.has("idle")) {
          const sessionID = ev.properties.sessionID as string;
          const sessionTitle = await resolveSessionTitle(client, sessionID);

          await notifyAll(config, {
            title: "✅ OpenCode 执行完成",
            content: [
              `### ✅ OpenCode 执行完成`,
              ``,
              `- **项目**：${projectTitle}`,
              `- **会话**：${sessionTitle}`,
              `- **主机**：${machineInfo}`,
              `- **时间**：${formatTime()}`,
            ].join("\n"),
          });
          return;
        }

        if (ev.type === "permission.asked" && notifyOn.has("permission")) {
          const sessionID = ev.properties.sessionID as string;
          const permission = ev.properties.permission as string;
          const patterns = ev.properties.patterns as string[];
          const sessionTitle = await resolveSessionTitle(client, sessionID);

          await notifyAll(config, {
            title: "🔐 OpenCode 需要授权",
            content: [
              `### 🔐 OpenCode 需要授权`,
              ``,
              `- **操作**：\`${permission}\``,
              `- **指令**：\`${patterns.join(" ")}\``,
              `- **项目**：${projectTitle}`,
              `- **会话**：${sessionTitle}`,
              `- **主机**：${machineInfo}`,
            ].join("\n"),
          });
          return;
        }

        if (ev.type === "question.asked" && notifyOn.has("question")) {
          const sessionID = ev.properties.sessionID as string;
          const questions = ev.properties.questions as Array<{
            header?: string;
            question: string;
            options?: Array<{ label: string }>;
          }>;
          if (!questions || questions.length === 0) return;
          const q = questions[0];
          const sessionTitle = await resolveSessionTitle(client, sessionID);
          const opts = q.options?.map((o) => o.label).join(" / ") ?? "";

          await notifyAll(config, {
            title: "❓ OpenCode 正在询问",
            content: [
              `### ❓ OpenCode 正在询问`,
              ``,
              `- **问题**：${q.header || q.question}`,
              opts ? `- **选项**：${opts}` : "",
              `- **项目**：${projectTitle}`,
              `- **会话**：${sessionTitle}`,
              `- **主机**：${machineInfo}`,
            ].filter(Boolean).join("\n"),
          });
          return;
        }

        if (ev.type === "session.error" && notifyOn.has("error")) {
          const sessionID = (ev.properties.sessionID as string) ?? "";
          const errInfo = ev.properties.error as {
            name?: string;
            data?: { message?: string };
          } | undefined;
          const errName = errInfo?.name ?? "UnknownError";
          const errMsg = errInfo?.data?.message ?? JSON.stringify(errInfo);
          const sessionTitle = sessionID
            ? await resolveSessionTitle(client, sessionID)
            : "";

          await notifyAll(config, {
            title: "❌ OpenCode 执行出错",
            content: [
              `### ❌ OpenCode 执行出错`,
              ``,
              `- **错误类型**：\`${errName}\``,
              `- **错误信息**：${errMsg}`,
              `- **项目**：${projectTitle}`,
              sessionTitle ? `- **会话**：${sessionTitle}` : "",
              `- **主机**：${machineInfo}`,
              `- **时间**：${formatTime()}`,
            ].filter(Boolean).join("\n"),
          });
          return;
        }
      } catch (err) {
        console.error("[opencode-im-notifier] event handler error:", err);
      }
    },
  };
};

export default plugin;
