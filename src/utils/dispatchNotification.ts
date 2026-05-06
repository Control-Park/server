import type { PostgrestSingleResponse } from "@supabase/supabase-js";

import { supabase } from "#database/supabase.js";
import { INotification, INotificationSettings } from "#interface/notification-interface.js";
import { sendToUser } from "#websocket/wsManager.js";

interface DispatchNotificationArgs {
  authHeader?: string;
  body: string;
  extraPayload?: Record<string, unknown>;
  title: string;
  type: NotificationType;
  userId: string;
}

interface DispatchNotificationResult {
  data: unknown;
  status: number;
}

type NotificationSettingColumn = "new_listing" | "new_message" | "parking_alerts" | "reservation_reminders";
type NotificationType = INotification["type"];

export async function dispatchNotification({ authHeader, body, extraPayload, title, type, userId }: DispatchNotificationArgs): Promise<DispatchNotificationResult> {
  const { data: settings }: PostgrestSingleResponse<INotificationSettings | null> = await supabase.from("notification_settings").select("*").eq("user_id", userId).maybeSingle();
  const typeSettingColumn = getTypeSettingColumn(type);

  if (settings && (!settings.all_notifications || !settings[typeSettingColumn])) {
    return {
      data: { message: "Notification suppressed by user settings" },
      status: 200,
    };
  }

  const { data, error }: PostgrestSingleResponse<INotification> = await supabase.from("notifications").insert({ body, title, type, user_id: userId }).select().single();

  if (!error) {
    sendToUser(userId, { ...toNotificationPayload(data), ...extraPayload });
    return {
      data,
      status: 201,
    };
  }

  console.error("[notifications] database dispatch failed:", error);
  // Keep the in-app realtime experience responsive even if persistence fails.
  void authHeader;
  sendToUser(userId, { body, title, type, ...extraPayload });
  return {
    data: { body, title, type, user_id: userId },
    status: 201,
  };
}

function getTypeSettingColumn(type: NotificationType): NotificationSettingColumn {
  if (type === "parking_alert") return "parking_alerts";
  if (type === "reservation_reminder") return "reservation_reminders";
  return type;
}

function toNotificationPayload(notification: INotification) {
  return {
    body: notification.body,
    created_at: notification.created_at,
    id: notification.id,
    is_read: notification.is_read,
    title: notification.title,
    type: notification.type,
    user_id: notification.user_id,
  };
}
