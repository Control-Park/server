/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { supabase } from "#database/supabase.js";
import { requireAuth } from "#middleware/auth.js";
import { Router } from "express";

const router = Router();

// GET /reviews/user/:userId — all reviews targeting a user (guest reviews)
router.get("/user/:userId", requireAuth, async (req, res) => {
  const { userId } = req.params;

  const { data, error } = await supabase.from("reviews").select("*, reviewer:users!reviews_reviewer_id_fkey(first_name, last_name), reservation:reservations(listing:listings(title))").eq("target_user_id", userId).order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: "Failed to fetch reviews" });
    return;
  }

  res.status(200).json(data ?? []);
});

// GET /reviews/listing/:listingId — all reviews targeting a listing
router.get("/listing/:listingId", requireAuth, async (req, res) => {
  const { listingId } = req.params;

  const { data, error } = await supabase.from("reviews").select("*, reviewer:users!reviews_reviewer_id_fkey(first_name, last_name)").eq("target_listing_id", listingId).order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: "Failed to fetch reviews" });
    return;
  }

  res.status(200).json(data ?? []);
});

// GET /reviews/mine — reservations caller completed but hasn't reviewed yet
router.get("/mine/pending", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  // Completed as host: approved reservations on caller's listings where end_time < now
  const { data: hostRes } = await supabase.from("reservations").select("*, listing:listings!inner(id, title, host_id), guest:users!reservations_user_id_fkey(id, first_name, last_name)").eq("listings.host_id", userId).eq("approval_status", "approved").lt("end_time", new Date().toISOString());

  // Completed as guest: approved reservations by caller where end_time < now
  const { data: guestRes } = await supabase.from("reservations").select("*, listing:listings(id, title)").eq("user_id", userId).eq("approval_status", "approved").lt("end_time", new Date().toISOString());

  // Which ones already reviewed by caller
  const allIds = [...(hostRes ?? []).map((r: { id: string }) => r.id), ...(guestRes ?? []).map((r: { id: string }) => r.id)];

  const { data: doneReviews } = allIds.length ? await supabase.from("reviews").select("reservation_id").eq("reviewer_id", userId).in("reservation_id", allIds) : { data: [] };

  const reviewedIds = new Set((doneReviews ?? []).map((rv: { reservation_id: string }) => rv.reservation_id));

  const pendingHost = (hostRes ?? []).filter((r: { id: string }) => !reviewedIds.has(r.id)).map((r: Record<string, unknown>) => ({ ...r, role: "host" }));

  const pendingGuest = (guestRes ?? []).filter((r: { id: string }) => !reviewedIds.has(r.id)).map((r: Record<string, unknown>) => ({ ...r, role: "guest" }));

  res.status(200).json([...pendingHost, ...pendingGuest]);
});

// POST /reviews — create a review
router.post("/", requireAuth, async (req, res) => {
  const reviewerId = req.user!.id;
  const { comment, rating, reservation_id, target_listing_id, target_user_id } = req.body as {
    comment?: string;
    rating: number;
    reservation_id: string;
    target_listing_id?: string;
    target_user_id?: string;
  };

  if (!reservation_id || !rating) {
    res.status(400).json({ error: "reservation_id and rating required" });
    return;
  }
  if (!target_user_id && !target_listing_id) {
    res.status(400).json({ error: "target_user_id or target_listing_id required" });
    return;
  }

  const { data, error } = await supabase.from("reviews").insert({ comment, rating, reservation_id, reviewer_id: reviewerId, target_listing_id, target_user_id }).select().single();

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(201).json(data);
});

export default router;
