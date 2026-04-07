/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { supabase } from "#database/supabase.js";
import { INotification, INotificationSettings } from "#interface/notification-interface.js";
import { requireAuth } from "#middleware/auth.js";
import { sendToUser } from "#websocket/wsManager.js";
import { Router } from "express";

const router = Router();

/**
 * @swagger
 * components:
 *   schemas:
 *     Notification:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         user_id:
 *           type: string
 *           format: uuid
 *         title:
 *           type: string
 *         body:
 *           type: string
 *         type:
 *           type: string
 *           enum: [new_listing, new_message, parking_alert, reservation_reminder]
 *         is_read:
 *           type: boolean
 *         created_at:
 *           type: string
 *           format: date-time
 *     NotificationSettings:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         user_id:
 *           type: string
 *           format: uuid
 *         all_notifications:
 *           type: boolean
 *         new_listing:
 *           type: boolean
 *         new_message:
 *           type: boolean
 *         parking_alerts:
 *           type: boolean
 *         reservation_reminders:
 *           type: boolean
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 */

const VALID_TYPES = ["new_listing", "new_message", "parking_alert", "reservation_reminder"];

/**
 * @swagger
 * /notifications:
 *   post:
 *     summary: Push a notification to a user
 *     description: Creates a notification for the specified user if their settings permit it. Respects both the master toggle and the per-type toggle.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [user_id, title, body, type]
 *             properties:
 *               user_id:
 *                 type: string
 *                 format: uuid
 *                 description: The recipient's user ID
 *               title:
 *                 type: string
 *               body:
 *                 type: string
 *               type:
 *                 type: string
 *                 enum: [new_listing, new_message, parking_alert, reservation_reminder]
 *     responses:
 *       201:
 *         description: Notification created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Notification'
 *       200:
 *         description: Notification suppressed by user settings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Missing or invalid fields
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Recipient user not found
 */
router.post("/", requireAuth, async (req, res) => {
  const { body, title, type, user_id } = req.body as {
    body?: string;
    title?: string;
    type?: string;
    user_id?: string;
  };

  if (!user_id || !title || !body || !type) {
    res.status(400).json({ error: "Missing required fields: user_id, title, body, type" });
    return;
  }

  if (!VALID_TYPES.includes(type)) {
    res.status(400).json({ error: `Invalid type. Must be one of: ${VALID_TYPES.join(", ")}` });
    return;
  }

  const supabaseUrl = process.env.NODE_ENV === "development" ? "http://127.0.0.1:54321" : process.env.SUPABASE_URL!;

  // Forward the caller's user JWT so the Edge Function can verify it with Supabase auth
  const callerToken = req.headers.authorization!;

  const edgeRes = await fetch(`${supabaseUrl}/functions/v1/send-notification`, {
    body: JSON.stringify({ body, title, type, user_id }),
    headers: {
      Authorization: callerToken,
      "Content-Type": "application/json",
    },
    method: "POST",
  });

  const data = await edgeRes.json();

  // Push to any connected WebSocket sessions for this user
  if (edgeRes.status === 201) {
    sendToUser(user_id, { body, title, type });
  }

  res.status(edgeRes.status).json(data);
});

/**
 * @swagger
 * /notifications:
 *   get:
 *     summary: Get notifications for the authenticated user
 *     description: Returns all notifications for the authenticated user, ordered by most recent first.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Notifications retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 notifications:
 *                   type: array
 *                   items:
 *                     $ref: '#/components/schemas/Notification'
 *       401:
 *         description: Unauthorized
 */
router.get("/", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  const { data: notifications, error } = await supabase.from("notifications").select("*").eq("user_id", userId).order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: "Failed to fetch notifications" });
    return;
  }

  res.status(200).json({ notifications: notifications as INotification[] });
});

/**
 * @swagger
 * /notifications/{id}/read:
 *   patch:
 *     summary: Mark a notification as read
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Notification marked as read
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Notification not found
 */
router.patch("/:id/read", requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const { data: existing } = await supabase.from("notifications").select("id").eq("id", id).eq("user_id", userId).maybeSingle();

  if (!existing) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  const { error } = await supabase.from("notifications").update({ is_read: true }).eq("id", id).eq("user_id", userId);

  if (error) {
    res.status(500).json({ error: "Failed to mark notification as read" });
    return;
  }

  res.status(200).json({ message: "Notification marked as read" });
});

/**
 * @swagger
 * /notifications/{id}:
 *   delete:
 *     summary: Delete a single notification
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     responses:
 *       200:
 *         description: Notification deleted
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Notification not found
 */
router.delete("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const { data: existing } = await supabase.from("notifications").select("id").eq("id", id).eq("user_id", userId).maybeSingle();

  if (!existing) {
    res.status(404).json({ error: "Notification not found" });
    return;
  }

  const { error } = await supabase.from("notifications").delete().eq("id", id).eq("user_id", userId);

  if (error) {
    res.status(500).json({ error: "Failed to delete notification" });
    return;
  }

  res.status(200).json({ message: "Notification deleted" });
});

/**
 * @swagger
 * /notifications:
 *   delete:
 *     summary: Clear all notifications for the authenticated user
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: All notifications cleared
 *       401:
 *         description: Unauthorized
 */
router.delete("/", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  const { error } = await supabase.from("notifications").delete().eq("user_id", userId);

  if (error) {
    res.status(500).json({ error: "Failed to clear notifications" });
    return;
  }

  res.status(200).json({ message: "All notifications cleared" });
});

/**
 * @swagger
 * /notifications/settings:
 *   get:
 *     summary: Get notification settings for the authenticated user
 *     description: Returns the user's notification preference toggles. Creates default settings if none exist yet.
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Settings retrieved successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotificationSettings'
 *       401:
 *         description: Unauthorized
 */
router.get("/settings", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  const { data: existing } = await supabase.from("notification_settings").select("*").eq("user_id", userId).maybeSingle();

  if (existing) {
    res.status(200).json(existing as INotificationSettings);
    return;
  }

  // Create default settings on first access
  const { data: created, error } = await supabase
    .from("notification_settings")
    .insert({
      all_notifications: true,
      new_listing: true,
      new_message: true,
      parking_alerts: true,
      reservation_reminders: true,
      user_id: userId,
    })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: "Failed to create notification settings" });
    return;
  }

  res.status(200).json(created as INotificationSettings);
});

/**
 * @swagger
 * /notifications/settings:
 *   patch:
 *     summary: Update notification settings for the authenticated user
 *     tags: [Notifications]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               all_notifications:
 *                 type: boolean
 *               new_listing:
 *                 type: boolean
 *               new_message:
 *                 type: boolean
 *               parking_alerts:
 *                 type: boolean
 *               reservation_reminders:
 *                 type: boolean
 *     responses:
 *       200:
 *         description: Settings updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/NotificationSettings'
 *       400:
 *         description: No valid fields provided
 *       401:
 *         description: Unauthorized
 */
router.patch("/settings", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { all_notifications, new_listing, new_message, parking_alerts, reservation_reminders } = req.body as {
    all_notifications?: boolean;
    new_listing?: boolean;
    new_message?: boolean;
    parking_alerts?: boolean;
    reservation_reminders?: boolean;
  };

  const updates: Record<string, boolean> = {};
  if (all_notifications !== undefined) updates.all_notifications = all_notifications;
  if (new_listing !== undefined) updates.new_listing = new_listing;
  if (new_message !== undefined) updates.new_message = new_message;
  if (parking_alerts !== undefined) updates.parking_alerts = parking_alerts;
  if (reservation_reminders !== undefined) updates.reservation_reminders = reservation_reminders;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields provided" });
    return;
  }

  const { data, error } = await supabase
    .from("notification_settings")
    .upsert({ ...updates, user_id: userId }, { onConflict: "user_id" })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: "Failed to update notification settings" });
    return;
  }

  res.status(200).json(data as INotificationSettings);
});

export default router;
