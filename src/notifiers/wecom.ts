import type { WeComConfig, NotificationMessage } from "../types.js";

export async function sendWeCom(
  config: WeComConfig,
  msg: NotificationMessage
): Promise<void> {
  const body = {
    msgtype: "markdown",
    markdown: {
      content: `${msg.title}\n${msg.content}`,
    },
  };

  const res = await fetch(config.webhook, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`WeCom webhook error ${res.status}: ${text}`);
  }
}
