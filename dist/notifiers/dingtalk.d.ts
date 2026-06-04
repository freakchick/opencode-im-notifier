import type { DingTalkConfig, NotificationMessage } from "../types.js";
export declare function sendDingTalk(config: DingTalkConfig, msg: NotificationMessage): Promise<void>;
