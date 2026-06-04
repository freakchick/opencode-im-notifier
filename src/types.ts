export interface DingTalkConfig {
  enable?: boolean;
  webhook: string;
  secret?: string;
}

export interface FeishuConfig {
  enable?: boolean;
  webhook: string;
}

export interface WeComConfig {
  enable?: boolean;
  webhook: string;
}

export type NotifyEvent = "idle" | "permission" | "question";

export interface NotifierConfig {
  dingtalk?: DingTalkConfig;
  feishu?: FeishuConfig;
  wecom?: WeComConfig;
  notifyOn?: NotifyEvent[];
  title?: string;
}

export interface NotificationMessage {
  title: string;
  content: string;
}
