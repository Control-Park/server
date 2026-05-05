/* eslint-disable @typescript-eslint/no-unsafe-return */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { supabase } from "#database/supabase.js";
import { IConversation, IMessage } from "#interface/message-interface.js";
import { requireAuth } from "#middleware/auth.js";
import { dispatchNotification } from "#utils/dispatchNotification.js";
import { Router } from "express";

const router = Router();

/**
 * @swagger
 * /conversations:
 *   post:
 *     summary: Get or create a conversation
 *     description: Creates a conversation between the caller (guest) and a host for a listing, or returns the existing one.
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [host_id, listing_id]
 *             properties:
 *               host_id:
 *                 type: string
 *                 format: uuid
 *               listing_id:
 *                 type: string
 *                 format: uuid
 *     responses:
 *       200:
 *         description: Conversation returned or created
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Unauthorized
 */
router.post("/", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { guest_id, host_id, listing_id } = req.body as { guest_id?: string; host_id?: string; listing_id?: string };

  if (!host_id || !listing_id) {
    res.status(400).json({ error: "Missing required fields: host_id, listing_id" });
    return;
  }

  // If caller is the host initiating, they supply guest_id explicitly.
  // Otherwise default to caller as guest.
  const resolvedGuestId = guest_id ?? userId;
  const resolvedHostId = host_id;

  if (resolvedGuestId === resolvedHostId) {
    res.status(400).json({ error: "You cannot message yourself" });
    return;
  }

  // Caller must be one of the participants
  if (userId !== resolvedGuestId && userId !== resolvedHostId) {
    res.status(403).json({ error: "Forbidden" });
    return;
  }

  const { data, error } = await supabase.from("conversations").upsert({ guest_id: resolvedGuestId, host_id: resolvedHostId, listing_id }, { ignoreDuplicates: false, onConflict: "guest_id,host_id,listing_id" }).select().single();

  if (error) {
    res.status(500).json({ error: "Failed to get or create conversation" });
    return;
  }

  res.status(200).json(data as IConversation);
});

/**
 * @swagger
 * /conversations:
 *   get:
 *     summary: List all conversations for the authenticated user
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of conversations
 *       401:
 *         description: Unauthorized
 */
router.get("/", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  const { data: conversations, error } = await supabase.from("conversations").select("id, guest_id, host_id, listing_id, created_at").or(`guest_id.eq.${userId},host_id.eq.${userId}`).order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: "Failed to fetch conversations" });
    return;
  }

  if (!conversations || conversations.length === 0) {
    res.status(200).json({ conversations: [] });
    return;
  }

  // Gather all unique user IDs to fetch names in one query
  const userIds = [...new Set(conversations.flatMap((c) => [c.guest_id, c.host_id]))];
  const listingIds = [...new Set(conversations.map((c) => c.listing_id))];
  const conversationIds = conversations.map((c) => c.id);

  const [usersResult, listingsResult, messagesResult] = await Promise.all([
    supabase.from("users").select("id, first_name, last_name").in("id", userIds),
    supabase.from("listings").select("id, title").in("id", listingIds),
    // Get the latest message per conversation
    supabase.from("messages").select("conversation_id, body, created_at").in("conversation_id", conversationIds).order("created_at", { ascending: false }),
  ]);

  const userMap = new Map((usersResult.data ?? []).map((u) => [u.id, { first_name: u.first_name as string, last_name: u.last_name as string }]));
  const listingMap = new Map((listingsResult.data ?? []).map((l) => [l.id, { title: l.title as string }]));

  // Keep only the first (latest) message per conversation
  const lastMessageMap = new Map<string, { body: string; created_at: string }>();
  for (const msg of messagesResult.data ?? []) {
    if (!lastMessageMap.has(msg.conversation_id as string)) {
      lastMessageMap.set(msg.conversation_id as string, { body: msg.body as string, created_at: msg.created_at as string });
    }
  }

  const enriched: IConversation[] = conversations.map((c) => ({
    created_at: c.created_at as string,
    guest: userMap.get(c.guest_id as string),
    guest_id: c.guest_id as string,
    host: userMap.get(c.host_id as string),
    host_id: c.host_id as string,
    id: c.id as string,
    last_message: lastMessageMap.get(c.id as string),
    listing: listingMap.get(c.listing_id as string),
    listing_id: c.listing_id as string,
  }));

  res.status(200).json({ conversations: enriched });
});

/**
 * @swagger
 * /conversations:
 *   delete:
 *     summary: Delete all conversations for the authenticated user
 *     description: Deletes every conversation where the authenticated user is either the guest or host. Messages are removed by cascade.
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Conversations deleted
 *       401:
 *         description: Unauthorized
 */
router.delete("/", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  const { data: conversations, error: fetchError } = await supabase.from("conversations").select("id").or(`guest_id.eq.${userId},host_id.eq.${userId}`);

  if (fetchError) {
    console.error("[conversations] fetch before delete all error:", fetchError);
    res.status(500).json({ error: "Failed to delete conversations" });
    return;
  }

  const conversationIds = (conversations ?? []).map((conversation) => conversation.id as string);

  if (conversationIds.length === 0) {
    res.status(200).json({
      deleted_conversation_count: 0,
      message: "No conversations to delete",
    });
    return;
  }

  const { data, error } = await supabase.from("conversations").delete().in("id", conversationIds).select("id");

  if (error) {
    console.error("[conversations] delete all error:", error);
    res.status(500).json({ error: "Failed to delete conversations" });
    return;
  }

  res.status(200).json({
    deleted_conversation_count: data?.length ?? 0,
    message: "Conversations deleted successfully",
  });
});

/**
 * @swagger
 * /conversations/{id}/messages:
 *   get:
 *     summary: Get messages for a conversation
 *     tags: [Messages]
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
 *         description: Messages for the conversation
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not a participant in this conversation
 *       404:
 *         description: Conversation not found
 */
router.get("/:id/messages", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const { data: conversation } = await supabase.from("conversations").select("guest_id, host_id").eq("id", id).maybeSingle();

  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  if (conversation.guest_id !== userId && conversation.host_id !== userId) {
    res.status(403).json({ error: "Not a participant in this conversation" });
    return;
  }

  const { data: messages, error } = await supabase.from("messages").select("id, conversation_id, sender_id, body, created_at").eq("conversation_id", id).order("created_at", { ascending: true });

  if (error) {
    res.status(500).json({ error: "Failed to fetch messages" });
    return;
  }

  res.status(200).json({ messages: (messages ?? []) as IMessage[] });
});

/**
 * @swagger
 * /conversations/{id}/messages:
 *   post:
 *     summary: Send a message in a conversation
 *     tags: [Messages]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [body]
 *             properties:
 *               body:
 *                 type: string
 *     responses:
 *       201:
 *         description: Message sent
 *       400:
 *         description: Missing body
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not a participant in this conversation
 *       404:
 *         description: Conversation not found
 */
router.post("/:id/messages", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const { body } = req.body as { body?: string };

  if (!body?.trim()) {
    res.status(400).json({ error: "Message body is required" });
    return;
  }

  const { data: conversation } = await supabase.from("conversations").select("guest_id, host_id").eq("id", id).maybeSingle();

  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  if (conversation.guest_id !== userId && conversation.host_id !== userId) {
    res.status(403).json({ error: "Not a participant in this conversation" });
    return;
  }

  const { data: message, error } = await supabase.from("messages").insert({ body: body.trim(), conversation_id: id, sender_id: userId }).select().single();

  if (error) {
    res.status(500).json({ error: "Failed to send message" });
    return;
  }

  // Push real-time event to the recipient
  const recipientId = conversation.guest_id === userId ? conversation.host_id : conversation.guest_id;

  const { data: sender } = await supabase.from("users").select("first_name, last_name").eq("id", userId).maybeSingle();

  const senderName = sender ? `${sender.first_name as string} ${sender.last_name as string}`.trim() : "Someone";
  const notificationTitle = `New message from ${senderName}`;
  const notificationBody = body.trim();

  await dispatchNotification({
    authHeader: req.headers.authorization,
    body: notificationBody,
    extraPayload: {
      conversationId: id,
      senderId: userId,
      title: notificationTitle,
    },
    title: notificationTitle,
    type: "new_message",
    userId: recipientId as string,
  });

  res.status(201).json(message as IMessage);
});

/**
 * @swagger
 * /conversations/{id}:
 *   delete:
 *     summary: Delete a conversation
 *     description: Deletes a conversation if the authenticated user is a participant. Messages are removed by cascade.
 *     tags: [Messages]
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
 *         description: Conversation deleted
 *       401:
 *         description: Unauthorized
 *       403:
 *         description: Not a participant in this conversation
 *       404:
 *         description: Conversation not found
 */
router.delete("/:id", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const { data: conversation, error: findError } = await supabase.from("conversations").select("guest_id, host_id").eq("id", id).maybeSingle();

  if (findError) {
    console.error("[conversations/:id] lookup before delete error:", findError);
    res.status(500).json({ error: "Failed to delete conversation" });
    return;
  }

  if (!conversation) {
    res.status(404).json({ error: "Conversation not found" });
    return;
  }

  if (conversation.guest_id !== userId && conversation.host_id !== userId) {
    res.status(403).json({ error: "Not a participant in this conversation" });
    return;
  }

  const { error } = await supabase.from("conversations").delete().eq("id", id);

  if (error) {
    console.error("[conversations/:id] delete error:", error);
    res.status(500).json({ error: "Failed to delete conversation" });
    return;
  }

  res.status(200).json({
    conversation_id: id,
    message: "Conversation deleted successfully",
  });
});

export default router;
