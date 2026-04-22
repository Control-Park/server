/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/no-unsafe-member-access */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import type { PostgrestSingleResponse } from "@supabase/supabase-js";

import { supabase } from "#database/supabase.js";
import { ReservationStatus } from "#enum/reservation-status.js";
import { IListing } from "#interface/listings-interface.js";
import { IReservation } from "#interface/reservation-interface.js";
import { requireAuth } from "#middleware/auth.js";
import { Router } from "express";
import Stripe from "stripe";

const router = Router();
const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

function computeTimeStatus(startTime: string, endTime: string): ReservationStatus {
  const now = new Date();
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (now < start) return ReservationStatus.Upcoming;
  if (now >= start && now <= end) return ReservationStatus.Active;
  return ReservationStatus.Expired;
}

function enrichReservation(row: IReservation): IReservation {
  // For approved reservations, compute time-based status; otherwise surface the approval status
  const timeStatus = computeTimeStatus(row.start_time, row.end_time);
  const status = row.approval_status === "approved" ? timeStatus : (row.approval_status as unknown as ReservationStatus);
  return { ...row, status };
}

// ─── Public: booked ranges for a listing ─────────────────────────────────────
router.get("/listing/:listingId/booked", requireAuth, async (req, res) => {
  const { listingId } = req.params;

  const { data, error } = await supabase.from("reservations").select("start_time, end_time").eq("listing_id", listingId).in("approval_status", ["approved", "pending"]);

  if (error) {
    res.status(500).json({ error: "Failed to fetch booked ranges" });
    return;
  }

  res.status(200).json(data ?? []);
});

// ─── Guest: list own reservations ────────────────────────────────────────────
router.get("/", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  const { data, error } = await supabase.from("reservations").select("*, listing:listings(*)").eq("user_id", userId).order("start_time", { ascending: false });

  if (error) {
    res.status(500).json({ error: "Failed to fetch reservations" });
    return;
  }

  const reservations = (data ?? []).map((row) => enrichReservation(row as IReservation));
  res.status(200).json(reservations);
});

// ─── Host: list incoming reservation requests for own listings ───────────────
router.get("/hosting", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  // Fetch all listing ids owned by this user
  const { data: listings } = await supabase.from("listings").select("id").eq("host_id", userId);

  if (!listings || listings.length === 0) {
    res.status(200).json([]);
    return;
  }

  const listingIds = listings.map((l) => l.id as string);

  const { data, error } = await supabase.from("reservations").select("*, listing:listings(*)").in("listing_id", listingIds).order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: "Failed to fetch hosting reservations" });
    return;
  }

  // Enrich with guest info
  const guestIds = [...new Set((data ?? []).map((r) => r.user_id as string))];
  const { data: guests } = await supabase.from("users").select("id, first_name, last_name, email").in("id", guestIds);

  const guestMap = new Map((guests ?? []).map((g) => [g.id, g]));

  const reservations = (data ?? []).map((row) => ({
    ...enrichReservation(row as IReservation),
    guest: guestMap.get(row.user_id as string) ?? null,
  }));

  res.status(200).json(reservations);
});

// ─── Host: earnings stats ─────────────────────────────────────────────────────
router.get("/host/stats", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  const { data: listings } = await supabase.from("listings").select("id").eq("host_id", userId);

  if (!listings || listings.length === 0) {
    res.status(200).json({ completed_bookings: 0, wallet_balance: 0 });
    return;
  }

  const listingIds = listings.map((l) => l.id as string);

  const { data: reservations } = await supabase.from("reservations").select("total_price, end_time").in("listing_id", listingIds).eq("approval_status", "approved");

  const now = new Date();
  let walletBalance = 0;
  let completedBookings = 0;

  for (const r of reservations ?? []) {
    walletBalance += Number(r.total_price ?? 0);
    if (new Date(r.end_time as string) < now) completedBookings++;
  }

  res.status(200).json({
    completed_bookings: completedBookings,
    wallet_balance: Number(walletBalance.toFixed(2)),
  });
});

// ─── Get single reservation ───────────────────────────────────────────────────
router.get("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const { data, error }: PostgrestSingleResponse<IReservation & { listing: IListing }> = await supabase.from("reservations").select("*, listing:listings(*)").eq("id", id).eq("user_id", userId).single();

  if (error || !data) {
    res.status(404).json({ error: "Reservation not found" });
    return;
  }

  res.status(200).json(enrichReservation(data));
});

// ─── Create reservation (guest) ───────────────────────────────────────────────
router.post("/", requireAuth, async (req, res) => {
  const { end_time, listing_id, payment_method_id, start_time, vehicle_id } = req.body as {
    end_time?: string;
    listing_id?: string;
    payment_method_id?: string;
    start_time?: string;
    vehicle_id?: string;
  };
  const userId = req.user!.id;

  if (!listing_id || !start_time || !end_time) {
    res.status(400).json({ error: "Missing required fields: listing_id, start_time, end_time" });
    return;
  }

  if (!vehicle_id) {
    res.status(400).json({ error: "A vehicle is required to make a reservation" });
    return;
  }

  if (!payment_method_id) {
    res.status(400).json({ error: "A payment method is required to make a reservation" });
    return;
  }

  const startDate = new Date(start_time);
  const endDate = new Date(end_time);

  if (isNaN(startDate.getTime()) || isNaN(endDate.getTime())) {
    res.status(400).json({ error: "Invalid date format for start_time or end_time" });
    return;
  }

  if (endDate <= startDate) {
    res.status(400).json({ error: "end_time must be later than start_time" });
    return;
  }

  // Validate vehicle ownership
  const { data: vehicle } = await supabase.from("vehicles").select("id").eq("id", vehicle_id).eq("user_id", userId).maybeSingle();

  if (!vehicle) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }

  // Validate payment method ownership and get Stripe details
  const { data: paymentMethod } = await supabase.from("payment_methods").select("id, stripe_payment_method_id").eq("id", payment_method_id).eq("user_id", userId).maybeSingle();

  if (!paymentMethod) {
    res.status(404).json({ error: "Payment method not found" });
    return;
  }

  // Get listing
  const { data: listing, error: listingError }: PostgrestSingleResponse<IListing> = await supabase.from("listings").select("*").eq("id", listing_id).eq("is_active", true).single();

  if (listingError || !listing) {
    res.status(404).json({ error: "Listing not found or unavailable" });
    return;
  }

  const durationHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
  const totalPrice = Number((listing.price_per_hour * durationHours).toFixed(2));

  // Get or create Stripe customer for this user
  const { data: userData } = await supabase.from("users").select("stripe_customer_id, email").eq("id", userId).single();

  let customerId = userData?.stripe_customer_id as string | undefined;
  if (!customerId) {
    const customer = await stripe.customers.create({
      email: userData?.email as string | undefined,
      metadata: { supabase_user_id: userId },
    });
    customerId = customer.id;
    await supabase.from("users").update({ stripe_customer_id: customerId }).eq("id", userId);
  }

  // Authorize (but don't capture) the payment
  let paymentIntentId: null | string;
  try {
    paymentIntentId = (
      await stripe.paymentIntents.create({
        amount: Math.max(50, Math.round(totalPrice * 100)), // Stripe minimum is $0.50
        capture_method: "manual",
        confirm: true,
        currency: "usd",
        customer: customerId,
        off_session: true,
        payment_method: paymentMethod.stripe_payment_method_id as string,
      })
    ).id;
  } catch (stripeError: unknown) {
    const msg = stripeError instanceof Error ? stripeError.message : "Payment authorization failed";
    res.status(402).json({ error: msg });
    return;
  }

  const { data: reservation, error } = await supabase
    .from("reservations")
    .insert({
      approval_status: "pending",
      end_time,
      listing_id,
      payment_intent_id: paymentIntentId,
      payment_method_id,
      start_time,
      total_price: totalPrice,
      user_id: userId,
      vehicle_id,
    })
    .select("*, listing:listings(*)")
    .single();

  if (error) {
    // Cancel the payment intent if DB insert fails
    if (paymentIntentId) {
      await stripe.paymentIntents.cancel(paymentIntentId).catch(() => null);
    }
    res.status(500).json({ error: "Failed to create reservation" });
    return;
  }

  res.status(201).json(enrichReservation(reservation as IReservation));
});

// ─── Host: approve reservation ────────────────────────────────────────────────
router.patch("/:id/approve", requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const { data: reservation } = await supabase.from("reservations").select("*, listing:listings(host_id)").eq("id", id).maybeSingle();

  if (!reservation) {
    res.status(404).json({ error: "Reservation not found" });
    return;
  }

  if ((reservation.listing as { host_id: string })?.host_id !== userId) {
    res.status(403).json({ error: "Only the listing host can approve this reservation" });
    return;
  }

  if (reservation.approval_status !== "pending") {
    res.status(400).json({ error: `Reservation is already ${reservation.approval_status as string}` });
    return;
  }

  // Capture the authorized Stripe payment
  if (reservation.payment_intent_id) {
    try {
      await stripe.paymentIntents.capture(reservation.payment_intent_id as string);
    } catch (stripeError: unknown) {
      const msg = stripeError instanceof Error ? stripeError.message : "Payment capture failed";
      console.error("PATCH /approve Stripe capture error:", msg);
      res.status(402).json({ error: msg });
      return;
    }
  }

  const { data: updated, error } = await supabase.from("reservations").update({ approval_status: "approved", updated_at: new Date().toISOString() }).eq("id", id).select("*, listing:listings(*)").single();

  if (error) {
    console.error("PATCH /approve DB error:", error.message);
    res.status(500).json({ detail: error.message, error: "Failed to approve reservation" });
    return;
  }

  res.status(200).json(enrichReservation(updated as IReservation));
});

// ─── Host: reject reservation ─────────────────────────────────────────────────
router.patch("/:id/reject", requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const { data: reservation } = await supabase.from("reservations").select("*, listing:listings(host_id)").eq("id", id).maybeSingle();

  if (!reservation) {
    res.status(404).json({ error: "Reservation not found" });
    return;
  }

  if ((reservation.listing as { host_id: string })?.host_id !== userId) {
    res.status(403).json({ error: "Only the listing host can reject this reservation" });
    return;
  }

  if (reservation.approval_status !== "pending") {
    res.status(400).json({ error: `Reservation is already ${reservation.approval_status as string}` });
    return;
  }

  // Cancel the Stripe authorization — no charge
  if (reservation.payment_intent_id) {
    try {
      await stripe.paymentIntents.cancel(reservation.payment_intent_id as string);
    } catch {
      // Non-fatal — continue even if cancel fails (intent may already be cancelled)
    }
  }

  const { data: updated, error } = await supabase.from("reservations").update({ approval_status: "rejected", updated_at: new Date().toISOString() }).eq("id", id).select("*, listing:listings(*)").single();

  if (error) {
    console.error("PATCH /reject DB error:", error.message);
    res.status(500).json({ detail: error.message, error: "Failed to reject reservation" });
    return;
  }

  res.status(200).json(enrichReservation(updated as IReservation));
});

// ─── Guest: cancel reservation ────────────────────────────────────────────────
router.patch("/:id/cancel", requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const { data: reservation } = await supabase.from("reservations").select("approval_status, payment_intent_id, user_id").eq("id", id).maybeSingle();

  if (reservation?.user_id !== userId) {
    res.status(404).json({ error: "Reservation not found" });
    return;
  }

  if (reservation.approval_status === "cancelled") {
    res.status(400).json({ error: "Reservation is already cancelled" });
    return;
  }

  if (reservation.payment_intent_id) {
    try {
      const intent = await stripe.paymentIntents.retrieve(reservation.payment_intent_id as string);
      if (intent.status === "requires_capture") {
        await stripe.paymentIntents.cancel(reservation.payment_intent_id as string);
      }
    } catch {
      // Non-fatal
    }
  }

  const { data: updated, error } = await supabase.from("reservations").update({ approval_status: "cancelled", updated_at: new Date().toISOString() }).eq("id", id).select("*, listing:listings(*)").single();

  if (error) {
    res.status(500).json({ error: "Failed to cancel reservation" });
    return;
  }

  res.status(200).json(enrichReservation(updated as IReservation));
});

// ─── Renew reservation ────────────────────────────────────────────────────────
router.post("/:id/renew", requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const { data: reservation, error: fetchError }: PostgrestSingleResponse<IReservation & { listing: IListing }> = await supabase.from("reservations").select("*, listing:listings(*)").eq("id", id).eq("user_id", userId).single();

  if (fetchError || !reservation) {
    res.status(404).json({ error: "Reservation not found" });
    return;
  }

  const now = new Date();
  const endTime = new Date(reservation.end_time);
  const gracePeriodMs = 30 * 60 * 1000;

  if (now > new Date(endTime.getTime() + gracePeriodMs)) {
    res.status(400).json({ error: "Reservation has expired and is no longer eligible for renewal" });
    return;
  }

  if (!reservation.listing?.is_active) {
    res.status(400).json({ error: "The listing is no longer available for renewal" });
    return;
  }

  const originalDurationMs = new Date(reservation.end_time).getTime() - new Date(reservation.start_time).getTime();
  const newEndTime = new Date(endTime.getTime() + originalDurationMs);
  const additionalHours = originalDurationMs / (1000 * 60 * 60);
  const additionalPrice = Number((reservation.listing.price_per_hour * additionalHours).toFixed(2));
  const newTotalPrice = Number((reservation.total_price + additionalPrice).toFixed(2));

  const { data: updated, error: updateError } = await supabase
    .from("reservations")
    .update({
      end_time: newEndTime.toISOString(),
      total_price: newTotalPrice,
      updated_at: new Date().toISOString(),
    })
    .eq("id", id)
    .select("*, listing:listings(*)")
    .single();

  if (updateError) {
    res.status(500).json({ error: "Failed to renew reservation" });
    return;
  }

  res.status(200).json(enrichReservation(updated as IReservation));
});

export default router;
