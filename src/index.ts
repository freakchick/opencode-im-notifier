import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir, hostname } from "node:os";
import { Plugin } from "@opencode/plugin";
import type { NotifierConfig, NotificationMessage } from "./types.js";
import { sendDingTalk } from "./notifiers/dingtalk.js";
import { sendFeishu } from "./notifiers/feishu.js";
import { sendWeCom } from "./notifiers/wecom.js";

interface SessionInfo {
  title?: string;
  parentID?: string;
}

interface EventPayload {
  type: string;
  data?: Record<string, unknown>;
}

interface FormField {
  title?: string;
  description?: string;
  options?: Array<{ label?: string }>;
}

interface PluginContextLike {
  session: {
    get: (input: { sessionID: string }) => Promise<SessionInfo | undefined>;
  };
}

function parseJSONC(text: string): unknown {
  const stripped = text
    .split("\n")
    .map((line) => {
      // Remove full-line comments: optional whitespace then //
      line = line.replace(/^\s*\/\/.*$/, "");
      // Remove inline comments: // preceded by whitespace (avoid URLs like https://)
      line = line.replace(/(\s)\/\/.*$/, "$1");
      return line;
    })
    .join("\n");
  return JSON.parse(stripped);
}

function isQuietHours(quietHours?: { start: string; end: string }): boolean {
  if (!quietHours?.start || !quietHours?.end) return false;
  if (quietHours.start === quietHours.end) return false;

  const now = new Date();
  const cur = now.getHours() * 60 + now.getMinutes();

  const [sh, sm] = quietHours.start.split(":").map(Number);
  const [eh, em] = quietHours.end.split(":").map(Number);
  const start = sh * 60 + sm;
  const end = eh * 60 + em;

  if (start < end) {
    return cur >= start && cur < end;
  }
  return cur >= start || cur < end;
}

async function notifyAll(
  config: NotifierConfig,
  msg: NotificationMessage
): Promise<void> {
  if (isQuietHours(config.quietHours)) return;

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

async function resolveSessionInfo(
  ctx: PluginContextLike,
  sessionID: string
): Promise<{ title: string; parentID?: string }> {
  if (!sessionID) return { title: "" };
  try {
    const session = await ctx.session.get({ sessionID });
    if (session) {
      return { title: session.title ?? sessionID, parentID: session.parentID };
    }
  } catch {
    // fall back to the raw session ID
  }
  return { title: sessionID };
}

const CONFIG_FILENAME = "opencode-im-notifier.jsonc";
const CONFIG_FILENAME_LEGACY = "opencode-im-notifier.json";

async function loadConfigFile(path?: string): Promise<NotifierConfig | null> {
  try {
    const content = await readFile(path!, "utf-8");
    return parseJSONC(content) as NotifierConfig;
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
    quietHours: inlineCfg.quietHours ?? fileCfg.quietHours,
    notifyOn: inlineCfg.notifyOn ?? fileCfg.notifyOn,
    title: inlineCfg.title ?? fileCfg.title,
  };
}

function truncate(text: string, max = 100): string {
  if (text.length <= max) return text;
  return text.slice(0, max) + "…";
}

const plugin = Plugin.define({
  id: "opencode-im-notifier",
  async setup(ctx) {
    const inline = (ctx.options ?? {}) as NotifierConfig;

    // 加载配置文件：自定义路径 > 当前目录/项目目录的 .opencode/ > 全局配置（支持 .jsonc 和 .json）
    const directory = ctx.location?.directory;
    const project = ctx.location?.project;
    const projectDirectory = project?.directory ?? project?.canonical ?? directory;
    const roots = [...new Set([directory, projectDirectory].filter(Boolean))] as string[];
    const candidates = [
      inline.configFile || null,
      ...roots.flatMap((root) => [
        join(root, CONFIG_FILENAME),
        join(root, CONFIG_FILENAME_LEGACY),
        join(root, ".opencode", CONFIG_FILENAME),
        join(root, ".opencode", CONFIG_FILENAME_LEGACY),
      ]),
      join(homedir(), ".config", "opencode", CONFIG_FILENAME),
      join(homedir(), ".config", "opencode", CONFIG_FILENAME_LEGACY),
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
        await writeFile(globalPath, [
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
        ].join("\n") + "\n", "utf-8");
        console.error("[opencode-im-notifier] config file created:", globalPath);
      } catch { /* ignore */ }
    }

    const config = mergeConfig(fileCfg, inline);
    const notifyOn = new Set(config.notifyOn ?? ["idle", "permission", "question", "error"]);
    const projectTitle = config.title && config.title.trim() !== ""
      ? config.title
      : (projectDirectory ? projectDirectory.split("/").pop()! : "OpenCode");
    const machineInfo = hostname();

    // V2: 用户提问通过 session prompt hook 记录，按会话区分，避免多会话串扰
    const questions = new Map<string, string>();
    let lastQuestion = "";
    await ctx.session.hook("prompt", (event) => {
      const text = event.prompt.text?.trim();
      if (text) {
        lastQuestion = truncate(text, 100);
        questions.set(event.sessionID, lastQuestion);
      }
    });

    const questionFor = (sessionID?: string): string =>
      (sessionID ? questions.get(sessionID) : undefined) ?? lastQuestion;

    // V2 中正常会话完成发 session.execution.succeeded；session.idle 仅作兼容，
    // 两者可能先后到达，按会话做短窗口去重，避免重复通知。
    const completionNotifiedAt = new Map<string, number>();
    const notifyCompletion = async (sessionID: string): Promise<void> => {
      const now = Date.now();
      if (now - (completionNotifiedAt.get(sessionID) ?? 0) < 3000) return;
      completionNotifiedAt.set(sessionID, now);

      const { title: sessionTitle, parentID } = await resolveSessionInfo(ctx, sessionID);
      if (parentID) return;

      await notifyAll(config, {
        title: "✅ OpenCode 执行完成",
        content: [
          `### ✅ OpenCode 执行完成`,
          ``,
          questionFor(sessionID) ? `- **用户提问**：${questionFor(sessionID)}` : "",
          `- **项目**：${projectTitle}`,
          `- **会话**：${sessionTitle}`,
          `- **主机**：${machineInfo}`,
          `- **时间**：${formatTime()}`,
        ].filter(Boolean).join("\n"),
      });
    };

    const handleEvent = async (ev: EventPayload): Promise<void> => {
      const data = ev.data ?? {};

      if (
        (ev.type === "session.execution.succeeded" || ev.type === "session.idle") &&
        notifyOn.has("idle")
      ) {
        const sessionID = data.sessionID as string | undefined;
        if (!sessionID) return;
        await notifyCompletion(sessionID);
        return;
      }

      if (ev.type === "permission.asked" && notifyOn.has("permission")) {
        const sessionID = data.sessionID as string | undefined;
        const action = typeof data.action === "string" ? data.action : "unknown";
        const resources = Array.isArray(data.resources)
          ? data.resources.map((r) => String(r))
          : [];
        const message = typeof data.message === "string" ? data.message : "";
        const { title: sessionTitle } = await resolveSessionInfo(ctx, sessionID ?? "");

        await notifyAll(config, {
          title: "🔐 OpenCode 需要授权",
          content: [
            `### 🔐 OpenCode 需要授权`,
            ``,
            sessionID && questionFor(sessionID) ? `- **用户提问**：${questionFor(sessionID)}` : "",
            `- **操作**：\`${action}\``,
            resources.length ? `- **指令**：\`${resources.join(" ")}\`` : "",
            !resources.length && message ? `- **说明**：${message}` : "",
            `- **项目**：${projectTitle}`,
            `- **会话**：${sessionTitle}`,
            `- **主机**：${machineInfo}`,
          ].filter(Boolean).join("\n"),
        });
        return;
      }

      // V2 中 AI 向用户提问以 form.created 事件发出（V1 为 question.asked）
      if (ev.type === "form.created" && notifyOn.has("question")) {
        const form = data.form as
          | { sessionID?: string; title?: string; fields?: FormField[] }
          | undefined;
        if (!form) return;
        const fields = Array.isArray(form.fields) ? form.fields : [];
        const field = fields.find((f) => f.options?.length) ?? fields[0];
        if (!field && !form.title) return;
        const question = field?.title || field?.description || form.title || "问题";
        const opts = field?.options
          ?.map((o) => o.label)
          .filter(Boolean)
          .join(" / ");
        const sessionID = form.sessionID;
        const { title: sessionTitle } = await resolveSessionInfo(ctx, sessionID ?? "");

        await notifyAll(config, {
          title: "❓ OpenCode 正在询问",
          content: [
            `### ❓ OpenCode 正在询问`,
            ``,
            sessionID && questionFor(sessionID) ? `- **用户提问**：${questionFor(sessionID)}` : "",
            `- **问题**：${question}`,
            opts ? `- **选项**：${opts}` : "",
            `- **项目**：${projectTitle}`,
            `- **会话**：${sessionTitle}`,
            `- **主机**：${machineInfo}`,
          ].filter(Boolean).join("\n"),
        });
        return;
      }

      // V2 中 session.error 更名为 session.execution.failed
      if (ev.type === "session.execution.failed" && notifyOn.has("error")) {
        const sessionID = data.sessionID as string | undefined;
        const err = data.error as { type?: string; message?: string } | undefined;
        const errName = err?.type ?? "UnknownError";
        const errMsg = err?.message ?? JSON.stringify(err);
        const { title: sessionTitle, parentID } = await resolveSessionInfo(ctx, sessionID ?? "");
        if (parentID) return;

        await notifyAll(config, {
          title: "❌ OpenCode 执行出错",
          content: [
            `### ❌ OpenCode 执行出错`,
            ``,
            sessionID && questionFor(sessionID) ? `- **用户提问**：${questionFor(sessionID)}` : "",
            `- **错误类型**：\`${errName}\``,
            `- **错误信息**：${errMsg}`,
            `- **项目**：${projectTitle}`,
            sessionTitle ? `- **会话**：${sessionTitle}` : "",
            `- **主机**：${machineInfo}`,
            `- **时间**：${formatTime()}`,
          ].filter(Boolean).join("\n"),
        });
      }
    };

    const controller = new AbortController();
    void (async () => {
      try {
        for await (const event of ctx.event.subscribe({ signal: controller.signal })) {
          try {
            await handleEvent(event as unknown as EventPayload);
          } catch (err) {
            console.error("[opencode-im-notifier] event handler error:", err);
          }
        }
      } catch (err) {
        if (!controller.signal.aborted) {
          console.error("[opencode-im-notifier] event stream error:", err);
        }
      }
    })();

    return () => controller.abort();
  },
});

export default plugin;
