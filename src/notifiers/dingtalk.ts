import { createHmac } from "node:crypto";
import type { DingTalkConfig, NotificationMessage } from "../types.js";

function sign(timestamp: number, secret: string): string {
  const hmac = createHmac("sha256", secret);
  hmac.update(`${timestamp}\n${secret}`);
  return encodeURIComponent(hmac.digest("base64"));
}

export async function sendDingTalk(
  config: DingTalkConfig,
  msg: NotificationMessage
): Promise<void> {
  let url = config.webhook;

  if (config.secret) {
    const timestamp = Date.now();
    url += `&timestamp=${timestamp}&sign=${sign(timestamp, config.secret)}`;
  }

  const body = {
    msgtype: "markdown",
    markdown: {
      title: msg.title,
      text: msg.content,
    },
  };

  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });

  if (!res.ok) {
    const text = await res.text();
    throw new Error(`DingTalk webhook error ${res.status}: ${text}`);
  }
}
