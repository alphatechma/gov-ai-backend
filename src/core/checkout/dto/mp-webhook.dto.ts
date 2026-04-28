export interface MpWebhookBody {
  id?: string | number;
  live_mode?: boolean;
  type?: string;
  topic?: string;
  action?: string;
  date_created?: string;
  user_id?: number;
  api_version?: string;
  data?: {
    id?: string | number;
  };
  resource?: string;
  [key: string]: unknown;
}

export interface MpWebhookQuery {
  type?: string;
  topic?: string;
  id?: string;
  'data.id'?: string;
  [key: string]: string | undefined;
}
