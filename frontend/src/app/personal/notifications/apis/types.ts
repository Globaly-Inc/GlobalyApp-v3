export interface Paginated<T> {
  data: T[];
  meta: { page: number; limit: number; total: number; totalPages: number };
}

export interface Notification {
  id: number;
  type: string;
  title: string;
  body: string | null;
  reference_type: string | null;
  reference_id: string | null;
  is_read: boolean;
  read_at: string | null;
  created_at: string;
}

export type NotificationChannel = "in_app" | "email" | "push";

export interface NotificationPreference {
  notification_type: string;
  channel: NotificationChannel;
  enabled: boolean;
}

export interface NotificationPreferences {
  channels: NotificationChannel[];
  preferences: NotificationPreference[];
}
