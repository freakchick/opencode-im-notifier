import type { FeishuConfig, NotificationMessage } from "../types.js";
export declare function sendFeishu(config: FeishuConfig, msg: NotificationMessage): Promise<void>;
