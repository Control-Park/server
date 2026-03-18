/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { supabase } from "#database/supabase.js";
import { ParkingType } from "#enum/parking-types.js";
import { ReportReason } from "#enum/report-reason.js";
import { IListingReport } from "#interface/listing-report-interface.js";
import { IListing } from "#interface/listings-interface.js";
import { requireAuth } from "#middleware/auth.js";
import { Router } from "express";

const router = Router();

/**
 * @swagger
 * components:
 *   securitySchemes:
 *     bearerAuth:
 *       type: http
 *       scheme: bearer
 *       bearerFormat: JWT
 *   schemas:
 *     Listing:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         host_id:
 *           type: string
 *           format: uuid
 *         structure_name:
 *           type: string
 *           nullable: true
 *         address:
 *           type: string
 *         parking_type:
 *           type: string
 *           enum: [Structure, Driveway, Lot, ETC]
 *         price_per_hour:
 *           type: number
 *           format: float
 *         amenities:
 *           type: array
 *           items:
 *             type: string
 *         images:
 *           type: array
 *           items:
 *             type: string
 *         available_from:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         available_until:
 *           type: string
 *           format: date-time
 *           nullable: true
 *         title:
 *           type: string
 *         description:
 *           type: string
 *         perks:
 *           type: array
 *           items:
 *             type: string
 *         incentives:
 *           type: array
 *           items:
 *             type: string
 *         is_active:
 *           type: boolean
 *         is_saved:
 *           type: boolean
 *           description: Whether the authenticated user has saved this listing (only present when authenticated)
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /listings:
 *   post:
 *     summary: Create a new parking listing
 *     description: Creates a parking listing owned by the authenticated user. Images are stored as file path strings.
 *     tags: [Listings]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [title, description, address, parking_type, price_per_hour]
 *             properties:
 *               title:
 *                 type: string
 *               description:
 *                 type: string
 *               address:
 *                 type: string
 *               structure_name:
 *                 type: string
 *               parking_type:
 *                 type: string
 *                 enum: [Structure, Driveway, Lot, ETC]
 *               price_per_hour:
 *                 type: number
 *                 format: float
 *               amenities:
 *                 type: array
 *                 items:
 *                   type: string
 *               perks:
 *                 type: array
 *                 items:
 *                   type: string
 *               incentives:
 *                 type: array
 *                 items:
 *                   type: string
 *               images:
 *                 type: array
 *                 items:
 *                   type: string
 *                 description: File path strings to the compressed images stored on the client
 *               available_from:
 *                 type: string
 *                 format: date-time
 *               available_until:
 *                 type: string
 *                 format: date-time
 *     responses:
 *       201:
 *         description: Listing created successfully
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Listing'
 *       400:
 *         description: Missing or invalid required fields
 *       401:
 *         description: Unauthorized
 */
router.post("/", requireAuth, async (req, res) => {
  const { address, amenities, available_from, available_until, description, images, incentives, parking_type, perks, price_per_hour, structure_name, title } = req.body as {
    address?: string;
    amenities?: string[];
    available_from?: string;
    available_until?: string;
    description?: string;
    images?: string[];
    incentives?: string[];
    parking_type?: string;
    perks?: string[];
    price_per_hour?: number;
    structure_name?: string;
    title?: string;
  };
  const hostId = req.user!.id;

  if (!title || !description || !address || !parking_type || price_per_hour === undefined) {
    res.status(400).json({ error: "Missing required fields: title, description, address, parking_type, price_per_hour" });
    return;
  }

  const validParkingTypes = Object.values(ParkingType) as string[];
  if (!validParkingTypes.includes(parking_type)) {
    res.status(400).json({ error: `Invalid parking_type. Must be one of: ${validParkingTypes.join(", ")}` });
    return;
  }

  if (typeof price_per_hour !== "number" || price_per_hour < 0) {
    res.status(400).json({ error: "price_per_hour must be a non-negative number" });
    return;
  }

  const { data: listing, error } = await supabase
    .from("listings")
    .insert({
      address,
      amenities: amenities ?? [],
      available_from: available_from ?? null,
      available_until: available_until ?? null,
      description,
      host_id: hostId,
      images: images ?? [],
      incentives: incentives ?? [],
      parking_type,
      perks: perks ?? [],
      price_per_hour,
      structure_name: structure_name ?? null,
      title,
    })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: "Failed to create listing" });
    return;
  }

  res.status(201).json(listing as IListing);
});

/**
 * @swagger
 * /listings/{id}:
 *   get:
 *     summary: Get listing details by ID
 *     description: Returns detailed information about a parking listing. If a valid Bearer token is provided, the response also includes whether the listing is saved by the authenticated user.
 *     tags: [Listings]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The listing UUID
 *     security:
 *       - {}
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: Listing found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Listing'
 *       404:
 *         description: Listing not found
 */
router.get("/:id", async (req, res) => {
  const { id } = req.params;

  const { data: listing, error } = await supabase.from("listings").select("*").eq("id", id).eq("is_active", true).single();

  if (error || !listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  let isSaved = false;
  const authHeader = req.headers.authorization;
  if (authHeader?.startsWith("Bearer ")) {
    const token = authHeader.slice(7);
    const { data: userData } = await supabase.auth.getUser(token);
    if (userData.user) {
      const { data: saved } = await supabase.from("saved_listings").select("id").eq("user_id", userData.user.id).eq("listing_id", id).maybeSingle();
      isSaved = !!saved;
    }
  }

  res.status(200).json({ ...(listing as IListing), is_saved: isSaved });
});

/**
 * @swagger
 * /listings/{id}/report:
 *   post:
 *     summary: Report a listing
 *     description: Flags a listing for admin review. Each user can submit one report per listing per reason.
 *     tags: [Listings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The listing UUID
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [reason]
 *             properties:
 *               reason:
 *                 type: string
 *                 enum: [incorrect_information, scam, inappropriate_content, unavailable, other]
 *               description:
 *                 type: string
 *                 description: Optional additional context for the report
 *     responses:
 *       201:
 *         description: Listing reported successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 report:
 *                   $ref: '#/components/schemas/ListingReport'
 *       400:
 *         description: Missing or invalid required fields
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Listing not found
 */
router.post("/:id/report", requireAuth, async (req, res) => {
  const { id } = req.params;
  const { description, reason } = req.body as { description?: string; reason?: string };
  const userId = req.user!.id;

  const validReasons = Object.values(ReportReason) as string[];
  if (!reason || !validReasons.includes(reason)) {
    res.status(400).json({ error: `Missing or invalid reason. Must be one of: ${validReasons.join(", ")}` });
    return;
  }

  const { data: listing } = await supabase.from("listings").select("id").eq("id", id).eq("is_active", true).maybeSingle();

  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  const { data: report, error } = await supabase.from("listing_reports").insert({ description, listing_id: id, reason, user_id: userId }).select().single();

  if (error) {
    res.status(500).json({ error: "Failed to submit report" });
    return;
  }

  res.status(201).json({ message: "Listing reported successfully", report: report as IListingReport });
});

/**
 * @swagger
 * components:
 *   schemas:
 *     ListingReport:
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
 *         reason:
 *           type: string
 *           enum: [incorrect_information, scam, inappropriate_content, unavailable, other]
 *         description:
 *           type: string
 *           nullable: true
 *         status:
 *           type: string
 *           enum: [pending, reviewed, resolved, dismissed]
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 *     SavedListing:
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
 *         created_at:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /listings/{id}/save:
 *   post:
 *     summary: Save a listing to favourites
 *     description: Adds the listing to the authenticated user's saved listings. If already saved, returns 200 without duplicating.
 *     tags: [Listings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The listing UUID
 *     responses:
 *       201:
 *         description: Listing saved successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *                 saved_listing:
 *                   $ref: '#/components/schemas/SavedListing'
 *       200:
 *         description: Listing was already saved
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Listing not found
 */
router.post("/:id/save", requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const { data: listing } = await supabase.from("listings").select("id").eq("id", id).eq("is_active", true).maybeSingle();

  if (!listing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  const { data: existing } = await supabase.from("saved_listings").select("id").eq("user_id", userId).eq("listing_id", id).maybeSingle();

  if (existing) {
    res.status(200).json({ message: "Listing is already saved" });
    return;
  }

  const { data: savedListing, error } = await supabase.from("saved_listings").insert({ listing_id: id, user_id: userId }).select().single();

  if (error) {
    res.status(500).json({ error: "Failed to save listing" });
    return;
  }

  res.status(201).json({ message: "Listing saved successfully", saved_listing: savedListing });
});

/**
 * @swagger
 * /listings/{id}/save:
 *   delete:
 *     summary: Unsave a listing
 *     description: Removes the listing from the authenticated user's saved listings.
 *     tags: [Listings]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The listing UUID
 *     responses:
 *       200:
 *         description: Listing removed from saved listings
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Saved listing not found
 */
router.delete("/:id/save", requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const { data: existing } = await supabase.from("saved_listings").select("id").eq("user_id", userId).eq("listing_id", id).maybeSingle();

  if (!existing) {
    res.status(404).json({ error: "Saved listing not found" });
    return;
  }

  const { error } = await supabase.from("saved_listings").delete().eq("user_id", userId).eq("listing_id", id);

  if (error) {
    res.status(500).json({ error: "Failed to remove listing from saved" });
    return;
  }

  res.status(200).json({ message: "Listing removed from saved listings" });
});

export default router;
