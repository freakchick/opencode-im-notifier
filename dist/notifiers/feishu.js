export async function sendFeishu(config, msg) {
    const body = {
        msg_type: "interactive",
        card: {
            header: {
                title: { tag: "plain_text", content: msg.title },
            },
            elements: [
                {
                    tag: "markdown",
                    content: msg.content,
                },
            ],
        },
    };
    const res = await fetch(config.webhook, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify(body),
    });
    if (!res.ok) {
        const text = await res.text();
        throw new Error(`Feishu webhook error ${res.status}: ${text}`);
    }
}
