/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { supabase } from "#database/supabase.js";
import { requireAuth } from "#middleware/auth.js";
import { Router } from "express";

const router = Router();

async function updateListingReviewStats(listingId: string): Promise<{ id: string; rating: null | number; review_count: number }> {
  const { data: reviews, error: reviewsError } = await supabase.from("reviews").select("rating").eq("target_listing_id", listingId);

  if (reviewsError) {
    throw new Error(reviewsError.message);
  }

  const ratings = (reviews ?? []).map((review) => Number(review.rating));
  const reviewCount = ratings.length;
  const rating = reviewCount > 0 ? Number((ratings.reduce((sum, value) => sum + value, 0) / reviewCount).toFixed(2)) : null;

  const { data: listing, error: listingError } = await supabase
    .from("listings")
    .update({
      rating,
      review_count: reviewCount,
      updated_at: new Date().toISOString(),
    })
    .eq("id", listingId)
    .select("id, rating, review_count")
    .single();

  if (listingError) {
    throw new Error(listingError.message);
  }

  return {
    id: listing.id as string,
    rating: listing.rating === null ? null : Number(listing.rating),
    review_count: Number(listing.review_count),
  };
}

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

  // Reviews are independent per reservation target: guest review and listing review
  const allIds = [...(hostRes ?? []).map((r: { id: string }) => r.id), ...(guestRes ?? []).map((r: { id: string }) => r.id)];

  const { data: doneReviews } = allIds.length ? await supabase.from("reviews").select("reservation_id, target_user_id, target_listing_id").eq("reviewer_id", userId).in("reservation_id", allIds) : { data: [] };

  const reviewedGuestKeys = new Set((doneReviews ?? []).filter((rv: { target_user_id?: null | string }) => !!rv.target_user_id).map((rv: { reservation_id: string; target_user_id: string }) => `${rv.reservation_id}:guest:${rv.target_user_id}`));

  const reviewedListingKeys = new Set((doneReviews ?? []).filter((rv: { target_listing_id?: null | string }) => !!rv.target_listing_id).map((rv: { reservation_id: string; target_listing_id: string }) => `${rv.reservation_id}:listing:${rv.target_listing_id}`));

  const pendingHost = (hostRes ?? [])
    .filter((r: { guest?: { id?: string }; id: string }) => {
      const guestId = r.guest?.id;
      if (!guestId) return false;
      return !reviewedGuestKeys.has(`${r.id}:guest:${guestId}`);
    })
    .map((r: Record<string, unknown>) => ({ ...r, role: "host" }));

  const pendingGuest = (guestRes ?? []).filter((r: { id: string; listing_id: string }) => !reviewedListingKeys.has(`${r.id}:listing:${r.listing_id}`)).map((r: Record<string, unknown>) => ({ ...r, role: "guest" }));

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

  if (!reservation_id || rating === undefined) {
    res.status(400).json({ error: "reservation_id and rating required" });
    return;
  }

  if (!Number.isInteger(rating) || rating < 1 || rating > 5) {
    res.status(400).json({ error: "rating must be an integer from 1 to 5" });
    return;
  }

  const targetCount = Number(!!target_user_id) + Number(!!target_listing_id);
  if (targetCount !== 1) {
    res.status(400).json({ error: "Provide exactly one review target" });
    return;
  }

  const { data: reservation, error: reservationError } = await supabase.from("reservations").select("id, user_id, listing_id, approval_status, end_time, listing:listings(host_id)").eq("id", reservation_id).single();

  if (reservationError || !reservation) {
    res.status(404).json({ error: "Reservation not found" });
    return;
  }

  if (reservation.approval_status !== "approved" || new Date(reservation.end_time as string) > new Date()) {
    res.status(400).json({ error: "Only completed approved reservations can be reviewed" });
    return;
  }

  const listingHostId = (reservation.listing as null | { host_id?: string })?.host_id;
  const guestUserId = reservation.user_id as string;
  const listingId = reservation.listing_id as string;

  if (target_user_id) {
    if (target_user_id === reviewerId) {
      res.status(400).json({ error: "You cannot review yourself" });
      return;
    }

    if (reviewerId !== listingHostId || target_user_id !== guestUserId) {
      res.status(403).json({ error: "Invalid guest review target" });
      return;
    }
  }

  if (target_listing_id) {
    if (listingHostId === reviewerId) {
      res.status(400).json({ error: "You cannot review your own listing" });
      return;
    }

    if (reviewerId !== guestUserId || target_listing_id !== listingId) {
      res.status(403).json({ error: "Invalid listing review target" });
      return;
    }
  }

  const { data, error } = await supabase
    .from("reviews")
    .insert({ comment: comment?.trim() ? comment.trim() : null, rating, reservation_id, reviewer_id: reviewerId, target_listing_id, target_user_id })
    .select()
    .single();

  if (error) {
    if (error.code === "23505") {
      res.status(409).json({ error: "You have already submitted this review" });
      return;
    }

    res.status(400).json({ error: error.message });
    return;
  }

  if (!target_listing_id) {
    res.status(201).json(data);
    return;
  }

  try {
    const listing = await updateListingReviewStats(target_listing_id);
    res.status(201).json({
      ...data,
      listing,
      listing_rating: listing.rating,
      listing_review_count: listing.review_count,
    });
  } catch (statsError) {
    console.error("[reviews] listing stats update error:", statsError);
    res.status(201).json(data);
  }
});

export default router;
