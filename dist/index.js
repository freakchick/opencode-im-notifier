import { readFile, writeFile, mkdir } from "node:fs/promises";
import { join } from "node:path";
import { homedir, hostname } from "node:os";
import { sendDingTalk } from "./notifiers/dingtalk.js";
import { sendFeishu } from "./notifiers/feishu.js";
import { sendWeCom } from "./notifiers/wecom.js";
function parseJSONC(text) {
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
function isQuietHours(quietHours) {
    if (!quietHours?.start || !quietHours?.end)
        return false;
    if (quietHours.start === quietHours.end)
        return false;
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
async function notifyAll(config, msg) {
    if (isQuietHours(config.quietHours))
        return;
    const tasks = [];
    const dingEnabled = config.dingtalk && config.dingtalk.enable !== false;
    const feishuEnabled = config.feishu && config.feishu.enable !== false;
    const wecomEnabled = config.wecom && config.wecom.enable !== false;
    if (dingEnabled) {
        tasks.push(sendDingTalk(config.dingtalk, msg).catch((err) => console.error("[opencode-im-notifier] DingTalk error:", err)));
    }
    if (feishuEnabled) {
        tasks.push(sendFeishu(config.feishu, msg).catch((err) => console.error("[opencode-im-notifier] Feishu error:", err)));
    }
    if (wecomEnabled) {
        tasks.push(sendWeCom(config.wecom, msg).catch((err) => console.error("[opencode-im-notifier] WeCom error:", err)));
    }
    await Promise.all(tasks);
}
function formatTime() {
    const d = new Date();
    const pad = (n) => String(n).padStart(2, "0");
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
}
async function resolveSessionTitle(client, sessionID) {
    // Try client.session.get with directory hint
    try {
        const s = client.session;
        const res = await s.get({ sessionID });
        const title = res?.data?.title;
        if (title)
            return title;
    }
    catch {
        // fallback
    }
    // Try session.list to find the session by ID
    try {
        const sessionApi = client.session;
        const listRes = await sessionApi.list({ scope: "project" });
        const sessions = listRes?.data;
        if (Array.isArray(sessions)) {
            const found = sessions.find((s) => s.id === sessionID || s.id?.endsWith(sessionID));
            if (found?.title)
                return found.title;
        }
    }
    catch {
        // fallback
    }
    return sessionID;
}
const CONFIG_FILENAME = "opencode-im-notifier.jsonc";
const CONFIG_FILENAME_LEGACY = "opencode-im-notifier.json";
async function loadConfigFile(path) {
    try {
        const content = await readFile(path, "utf-8");
        return parseJSONC(content);
    }
    catch {
        return null;
    }
}
function mergeConfig(fileCfg, inlineCfg) {
    if (!fileCfg)
        return inlineCfg;
    return {
        dingtalk: inlineCfg.dingtalk ?? fileCfg.dingtalk,
        feishu: inlineCfg.feishu ?? fileCfg.feishu,
        wecom: inlineCfg.wecom ?? fileCfg.wecom,
        quietHours: inlineCfg.quietHours ?? fileCfg.quietHours,
        notifyOn: inlineCfg.notifyOn ?? fileCfg.notifyOn,
        title: inlineCfg.title ?? fileCfg.title,
    };
}
let lastUserQuestion = "";
function truncate(text, max = 100) {
    if (text.length <= max)
        return text;
    return text.slice(0, max) + "…";
}
const plugin = async (input, options) => {
    const inline = (options ?? {});
    // 加载配置文件：自定义路径 > 项目目录/ .opencode/ > 全局配置（支持 .jsonc 和 .json）
    const worktree = input.project?.worktree ?? input.directory;
    const candidates = [
        inline.configFile || null,
        worktree ? join(worktree, CONFIG_FILENAME) : null,
        worktree ? join(worktree, CONFIG_FILENAME_LEGACY) : null,
        worktree ? join(worktree, ".opencode", CONFIG_FILENAME) : null,
        worktree ? join(worktree, ".opencode", CONFIG_FILENAME_LEGACY) : null,
        join(homedir(), ".config", "opencode", CONFIG_FILENAME),
        join(homedir(), ".config", "opencode", CONFIG_FILENAME_LEGACY),
    ].filter(Boolean);
    let fileCfg = null;
    for (const p of candidates) {
        fileCfg = await loadConfigFile(p);
        if (fileCfg)
            break;
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
        }
        catch { /* ignore */ }
    }
    const config = mergeConfig(fileCfg, inline);
    const notifyOn = new Set(config.notifyOn ?? ["idle", "permission", "question", "error"]);
    const projectTitle = config.title && config.title.trim() !== ""
        ? config.title
        : (input.project?.worktree ? input.project.worktree.split("/").pop() : "OpenCode");
    const machineInfo = hostname();
    const client = input.client;
    return {
        event: async ({ event }) => {
            const ev = event;
            try {
                if (ev.type === "session.idle" && notifyOn.has("idle")) {
                    const sessionID = ev.properties.sessionID;
                    const sessionTitle = await resolveSessionTitle(client, sessionID);
                    await notifyAll(config, {
                        title: "✅ OpenCode 执行完成",
                        content: [
                            lastUserQuestion ? `- **用户提问**：${lastUserQuestion}` : "",
                            `- **项目**：${projectTitle}`,
                            `- **会话**：${sessionTitle}`,
                            `- **主机**：${machineInfo}`,
                            `- **时间**：${formatTime()}`,
                        ].filter(Boolean).join("\n"),
                    });
                    return;
                }
                if (ev.type === "permission.asked" && notifyOn.has("permission")) {
                    const sessionID = ev.properties.sessionID;
                    const permission = ev.properties.permission;
                    const patterns = ev.properties.patterns;
                    const sessionTitle = await resolveSessionTitle(client, sessionID);
                    await notifyAll(config, {
                        title: "🔐 OpenCode 需要授权",
                        content: [
                            lastUserQuestion ? `- **用户提问**：${lastUserQuestion}` : "",
                            `- **操作**：\`${permission}\``,
                            `- **指令**：\`${patterns.join(" ")}\``,
                            `- **项目**：${projectTitle}`,
                            `- **会话**：${sessionTitle}`,
                            `- **主机**：${machineInfo}`,
                        ].filter(Boolean).join("\n"),
                    });
                    return;
                }
                if (ev.type === "question.asked" && notifyOn.has("question")) {
                    const sessionID = ev.properties.sessionID;
                    const questions = ev.properties.questions;
                    if (!questions || questions.length === 0)
                        return;
                    const q = questions[0];
                    const sessionTitle = await resolveSessionTitle(client, sessionID);
                    const opts = q.options?.map((o) => o.label).join(" / ") ?? "";
                    await notifyAll(config, {
                        title: "❓ OpenCode 正在询问",
                        content: [
                            lastUserQuestion ? `- **用户提问**：${lastUserQuestion}` : "",
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
                    const sessionID = ev.properties.sessionID ?? "";
                    const errInfo = ev.properties.error;
                    const errName = errInfo?.name ?? "UnknownError";
                    const errMsg = errInfo?.data?.message ?? JSON.stringify(errInfo);
                    const sessionTitle = sessionID
                        ? await resolveSessionTitle(client, sessionID)
                        : "";
                    await notifyAll(config, {
                        title: "❌ OpenCode 执行出错",
                        content: [
                            lastUserQuestion ? `- **用户提问**：${lastUserQuestion}` : "",
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
            }
            catch (err) {
                console.error("[opencode-im-notifier] event handler error:", err);
            }
        },
        "chat.message": async (_input, output) => {
            const texts = output.parts
                .filter((p) => p.type === "text")
                .map((p) => p.text ?? "")
                .join(" ");
            if (texts)
                lastUserQuestion = truncate(texts, 100);
        },
    };
};
export default plugin;
