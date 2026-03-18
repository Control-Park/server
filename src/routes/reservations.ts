/* eslint-disable @typescript-eslint/no-unsafe-enum-comparison */
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

const router = Router();

function computeStatus(startTime: string, endTime: string): ReservationStatus {
  const now = new Date();
  const start = new Date(startTime);
  const end = new Date(endTime);

  if (now < start) return ReservationStatus.Upcoming;
  if (now >= start && now <= end) return ReservationStatus.Active;
  return ReservationStatus.Expired;
}

/**
 * @swagger
 * components:
 *   schemas:
 *     Reservation:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         user_id:
 *           type: string
 *           format: uuid
 *         listing_id:
 *           type: string
 *           format: uuid
 *         vehicle_id:
 *           type: string
 *           format: uuid
 *           nullable: true
 *         start_time:
 *           type: string
 *           format: date-time
 *         end_time:
 *           type: string
 *           format: date-time
 *         total_price:
 *           type: number
 *           format: float
 *         status:
 *           type: string
 *           enum: [upcoming, active, expired]
 *           description: Computed server-side from current time vs reservation window
 *         listing:
 *           $ref: '#/components/schemas/Listing'
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /reservations:
 *   get:
 *     summary: Get all reservations for the authenticated user
 *     description: Returns all reservations belonging to the authenticated user. Status is computed server-side based on current time vs reservation window.
 *     tags: [Reservations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: query
 *         name: status
 *         required: false
 *         schema:
 *           type: string
 *           enum: [upcoming, active, expired]
 *         description: Filter reservations by status
 *     responses:
 *       200:
 *         description: List of reservations
 *         content:
 *           application/json:
 *             schema:
 *               type: array
 *               items:
 *                 $ref: '#/components/schemas/Reservation'
 *       401:
 *         description: Unauthorized
 */
router.get("/", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { status } = req.query as { status?: string };

  const { data, error } = await supabase.from("reservations").select("*, listing:listings(*)").eq("user_id", userId).order("start_time", { ascending: false });

  if (error) {
    res.status(500).json({ error: "Failed to fetch reservations" });
    return;
  }

  let reservations = (data ?? []).map((row) => ({
    ...(row as IReservation),
    status: computeStatus(row.start_time as string, row.end_time as string),
  }));

  if (status) {
    reservations = reservations.filter((r) => r.status === status);
  }

  res.status(200).json(reservations);
});

/**
 * @swagger
 * /reservations/{id}:
 *   get:
 *     summary: Get reservation details by ID
 *     description: Returns detailed information for a single reservation including listing info and computed status.
 *     tags: [Reservations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The reservation UUID
 *     responses:
 *       200:
 *         description: Reservation found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Reservation'
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Reservation not found
 */
router.get("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const { data, error }: PostgrestSingleResponse<IReservation & { listing: IListing }> = await supabase.from("reservations").select("*, listing:listings(*)").eq("id", id).eq("user_id", userId).single();

  if (error || !data) {
    res.status(404).json({ error: "Reservation not found" });
    return;
  }

  res.status(200).json({
    ...data,
    status: computeStatus(data.start_time, data.end_time),
  });
});

/**
 * @swagger
 * /reservations:
 *   post:
 *     summary: Create a reservation
 *     description: Creates a new reservation for a listing. Total price is calculated server-side based on price_per_hour and the selected time window.
 *     tags: [Reservations]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [listing_id, start_time, end_time]
 *             properties:
 *               listing_id:
 *                 type: string
 *                 format: uuid
 *               start_time:
 *                 type: string
 *                 format: date-time
 *               end_time:
 *                 type: string
 *                 format: date-time
 *               vehicle_id:
 *                 type: string
 *                 format: uuid
 *                 nullable: true
 *     responses:
 *       201:
 *         description: Reservation created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Reservation'
 *       400:
 *         description: Missing or invalid fields (e.g. end_time not after start_time)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Listing not found or unavailable
 */
router.post("/", requireAuth, async (req, res) => {
  const { end_time, listing_id, start_time, vehicle_id } = req.body as {
    end_time?: string;
    listing_id?: string;
    start_time?: string;
    vehicle_id?: string;
  };
  const userId = req.user!.id;

  if (!listing_id || !start_time || !end_time) {
    res.status(400).json({ error: "Missing required fields: listing_id, start_time, end_time" });
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

  const { data: listing, error: listingError }: PostgrestSingleResponse<IListing> = await supabase.from("listings").select("*").eq("id", listing_id).eq("is_active", true).single();

  if (listingError || !listing) {
    res.status(404).json({ error: "Listing not found or unavailable" });
    return;
  }

  const durationHours = (endDate.getTime() - startDate.getTime()) / (1000 * 60 * 60);
  const totalPrice = Number((listing.price_per_hour * durationHours).toFixed(2));

  const { data: reservation, error } = await supabase
    .from("reservations")
    .insert({
      end_time,
      listing_id,
      start_time,
      total_price: totalPrice,
      user_id: userId,
      ...(vehicle_id ? { vehicle_id } : {}),
    })
    .select("*, listing:listings(*)")
    .single();

  if (error) {
    res.status(500).json({ error: "Failed to create reservation" });
    return;
  }

  res.status(201).json({
    ...(reservation as IReservation),
    status: computeStatus(start_time, end_time),
  });
});

/**
 * @swagger
 * /reservations/{id}/renew:
 *   post:
 *     summary: Renew a reservation
 *     description: Extends an active reservation by its original duration. The reservation must currently be active or have ended within the last 30 minutes. A new total_price is calculated and added to the existing total.
 *     tags: [Reservations]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The reservation UUID
 *     responses:
 *       200:
 *         description: Reservation renewed successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Reservation'
 *       400:
 *         description: Reservation is not eligible for renewal (expired beyond grace period or listing unavailable)
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Reservation not found
 */
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
  const gracePeriodMs = 30 * 60 * 1000; // 30 minutes

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

  res.status(200).json({
    ...(updated as IReservation),
    status: computeStatus((updated as IReservation).start_time, (updated as IReservation).end_time),
  });
});

export default router;
