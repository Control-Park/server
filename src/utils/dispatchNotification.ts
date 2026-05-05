import { sendToUser } from "#websocket/wsManager.js";

interface DispatchNotificationArgs {
  authHeader?: string;
  body: string;
  extraPayload?: Record<string, unknown>;
  title: string;
  type: "new_listing" | "new_message" | "parking_alert" | "reservation_reminder";
  userId: string;
}

interface DispatchNotificationResult {
  data: unknown;
  status: number;
}

export async function dispatchNotification({ authHeader, body, extraPayload, title, type, userId }: DispatchNotificationArgs): Promise<DispatchNotificationResult> {
  if (!authHeader) {
    sendToUser(userId, { body, title, type, ...extraPayload });
    return {
      data: { body, title, type, user_id: userId },
      status: 201,
    };
  }

  const supabaseUrl = process.env.NODE_ENV === "development" ? "http://127.0.0.1:54321" : process.env.SUPABASE_URL;

  if (!supabaseUrl) {
    throw new Error("SUPABASE_URL is required");
  }

  try {
    const edgeRes = await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
      body: JSON.stringify({
        body,
        title,
        type,
        user_id: userId,
      }),
      headers: {
        Authorization: authHeader,
        "Content-Type": "application/json",
      },
      method: "POST",
    });

    let data: unknown = null;
    try {
      data = await edgeRes.json();
    } catch {
      data = { message: "Notification edge function returned a non-JSON response" };
    }

    // Keep the in-app realtime experience responsive even if push delivery/storage
    // has issues upstream. The websocket event is what drives the toast + screen refresh.
    sendToUser(userId, { body, title, type, ...extraPayload });

    return {
      data,
      status: edgeRes.status,
    };
  } catch (error) {
    console.error("[notifications] edge function dispatch failed:", error);
  }

  sendToUser(userId, { body, title, type, ...extraPayload });
  return {
    data: { body, title, type, user_id: userId },
    status: 201,
  };
}
