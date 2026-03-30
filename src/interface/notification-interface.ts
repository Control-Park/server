export interface INotification {
  body: string;
  created_at: Date;
  id: string;
  is_read: boolean;
  title: string;
  type: "new_listing" | "new_message" | "parking_alert" | "reservation_reminder";
  user_id: string;
}

export interface INotificationSettings {
  all_notifications: boolean;
  created_at: Date;
  id: string;
  new_listing: boolean;
  new_message: boolean;
  parking_alerts: boolean;
  reservation_reminders: boolean;
  updated_at: Date;
  user_id: string;
}
