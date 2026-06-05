export async function sendWeCom(config, msg) {
    const body = {
        msgtype: "markdown",
        markdown: {
            content: msg.content,
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
