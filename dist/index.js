import { sendDingTalk } from "./notifiers/dingtalk.js";
import { sendFeishu } from "./notifiers/feishu.js";
import { sendWeCom } from "./notifiers/wecom.js";
async function notifyAll(config, msg) {
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
const plugin = async (input, options) => {
    const config = (options ?? {});
    const notifyOn = new Set(config.notifyOn ?? ["idle", "permission", "question"]);
    const projectTitle = config.title && config.title.trim() !== ""
        ? config.title
        : (input.project?.worktree ? input.project.worktree.split("/").pop() : "OpenCode");
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
                            `#### ✅ OpenCode 执行完成`,
                            ``,
                            `- **项目**：${projectTitle}`,
                            `- **会话**：${sessionTitle}`,
                            `- **时间**：${formatTime()}`,
                        ].join("\n"),
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
                            `#### 🔐 OpenCode 需要授权`,
                            ``,
                            `- **操作**：\`${permission}\``,
                            `- **指令**：\`${patterns.join(" ")}\``,
                            `- **项目**：${projectTitle}`,
                            `- **会话**：${sessionTitle}`,
                        ].join("\n"),
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
                            `#### ❓ OpenCode 正在询问`,
                            ``,
                            `- **问题**：${q.header || q.question}`,
                            opts ? `- **选项**：${opts}` : "",
                            `- **项目**：${projectTitle}`,
                            `- **会话**：${sessionTitle}`,
                        ].filter(Boolean).join("\n"),
                    });
                    return;
                }
            }
            catch (err) {
                console.error("[opencode-im-notifier] event handler error:", err);
            }
        },
    };
};
export default plugin;
