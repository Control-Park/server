/* eslint-disable @typescript-eslint/no-unnecessary-condition */
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
 *         sub_heading:
 *           type: array
 *           items:
 *             type: string
 *         is_guest_favorite:
 *           type: boolean
 *         is_popular:
 *           type: boolean
 *         original_price:
 *           type: number
 *           format: float
 *           nullable: true
 *         rating:
 *           type: number
 *           format: float
 *           nullable: true
 *           minimum: 0
 *           maximum: 5
 *         review_count:
 *           type: integer
 *         host_name:
 *           type: string
 *           nullable: true
 *         host_type:
 *           type: string
 *           nullable: true
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
 *   get:
 *     summary: Get all listings
 *     description: Returns all active listings. Supports optional filtering by name, location, price range, and availability date.
 *     tags: [Listings]
 *     parameters:
 *       - in: query
 *         name: name
 *         schema:
 *           type: string
 *         description: Partial text match on title or structure_name
 *       - in: query
 *         name: location
 *         schema:
 *           type: string
 *         description: Partial text match on address
 *       - in: query
 *         name: priceMin
 *         schema:
 *           type: number
 *         description: Minimum price per hour (inclusive)
 *       - in: query
 *         name: priceMax
 *         schema:
 *           type: number
 *         description: Maximum price per hour (inclusive)
 *       - in: query
 *         name: availability
 *         schema:
 *           type: string
 *           format: date-time
 *         description: Date that must fall within available_from and available_until (ISO 8601)
 *     responses:
 *       200:
 *         description: Get all listings successful
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/Listing'
 *       500:
 *         description: Unable to fetch listings
 */
router.get("/", async (req, res) => {
  const { availability, location, name, priceMax, priceMin } = req.query as {
    availability?: string;
    location?: string;
    name?: string;
    priceMax?: string;
    priceMin?: string;
  };

  let query = supabase.from("listings").select("*").eq("is_active", true);

  if (name) {
    query = query.or(`title.ilike.%${name}%,structure_name.ilike.%${name}%`);
  }

  if (location) {
    query = query.ilike("address", `%${location}%`);
  }

  if (priceMin !== undefined) {
    query = query.gte("price_per_hour", Number(priceMin));
  }

  if (priceMax !== undefined) {
    query = query.lte("price_per_hour", Number(priceMax));
  }

  if (availability) {
    query = query.lte("available_from", availability).gte("available_until", availability);
  }

  const { data: listings, error } = await query;

  if (error) {
    res.status(500).json({ error: "Unable to fetch listings" });
    return;
  }

  res.status(200).json({ listings });
});

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
 *               sub_heading:
 *                 type: array
 *                 items:
 *                   type: string
 *               is_guest_favorite:
 *                 type: boolean
 *               is_popular:
 *                 type: boolean
 *               original_price:
 *                 type: number
 *                 format: float
 *               rating:
 *                 type: number
 *                 format: float
 *                 minimum: 0
 *                 maximum: 5
 *               review_count:
 *                 type: integer
 *               host_name:
 *                 type: string
 *               host_type:
 *                 type: string
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
  const { address, amenities, available_from, available_until, description, host_name, host_type, images, incentives, is_guest_favorite, is_popular, original_price, parking_type, perks, price_per_hour, rating, review_count, structure_name, sub_heading, title } = req.body as {
    address?: string;
    amenities?: string[];
    available_from?: string;
    available_until?: string;
    description?: string;
    host_name?: string;
    host_type?: string;
    images?: string[];
    incentives?: string[];
    is_guest_favorite?: boolean;
    is_popular?: boolean;
    original_price?: number;
    parking_type?: string;
    perks?: string[];
    price_per_hour?: number;
    rating?: number;
    review_count?: number;
    structure_name?: string;
    sub_heading?: string[];
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
      host_name: host_name ?? null,
      host_type: host_type ?? null,
      images: images ?? [],
      incentives: incentives ?? [],
      is_guest_favorite: is_guest_favorite ?? false,
      is_popular: is_popular ?? false,
      original_price: original_price ?? null,
      parking_type,
      perks: perks ?? [],
      price_per_hour,
      rating: rating ?? null,
      review_count: review_count ?? 0,
      structure_name: structure_name ?? null,
      sub_heading: sub_heading ?? [],
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
// ─── Host: all own listings (active + inactive + draft) ──────────────────────
router.get("/mine", requireAuth, async (req, res) => {
  const hostId = req.user!.id;

  const { data, error } = await supabase.from("listings").select("*").eq("host_id", hostId).order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: "Failed to fetch listings" });
    return;
  }

  res.status(200).json(data ?? []);
});

// ─── Host: save listing as draft ─────────────────────────────────────────────
router.post("/draft", requireAuth, async (req, res) => {
  const hostId = req.user!.id;
  const { address, description, images, incentives, parking_type, perks, price_per_hour, structure_name, sub_heading, title } = req.body as {
    address?: string;
    description?: string;
    images?: string[];
    incentives?: string[];
    parking_type?: string;
    perks?: string[];
    price_per_hour?: number;
    structure_name?: string;
    sub_heading?: string[];
    title?: string;
  };

  if (!title?.trim()) {
    res.status(400).json({ error: "title is required to save as draft" });
    return;
  }

  const { data, error } = await supabase
    .from("listings")
    .insert({
      address: address ? address.trim() : "",
      amenities: [],
      description: description ? description.trim() : null,
      host_id: hostId,
      images: images ?? [],
      incentives: incentives ?? [],
      is_active: false,
      is_draft: true,
      parking_type: parking_type ?? "Lot",
      perks: perks ?? [],
      price_per_hour: price_per_hour ?? 0,
      structure_name: structure_name ?? null,
      sub_heading: sub_heading ?? [],
      title: title.trim(),
    })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: error.message });
    return;
  }

  res.status(201).json(data);
});

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
router.patch("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const hostId = req.user!.id;

  const { data: existing } = await supabase.from("listings").select("id").eq("id", id).eq("host_id", hostId).maybeSingle();

  if (!existing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  const { address, amenities, available_from, available_until, description, images, incentives, is_active, is_guest_favorite, is_popular, original_price, parking_type, perks, price_per_hour, rating, review_count, structure_name, sub_heading, title } = req.body as Partial<IListing>;

  const updates: Record<string, unknown> = { updated_at: new Date().toISOString() };
  if (title !== undefined) updates.title = title;
  if (description !== undefined) updates.description = description;
  if (address !== undefined) updates.address = address;
  if (price_per_hour !== undefined) updates.price_per_hour = price_per_hour;
  if (is_active !== undefined) updates.is_active = is_active;
  if (parking_type !== undefined) updates.parking_type = parking_type;
  if (amenities !== undefined) updates.amenities = amenities;
  if (perks !== undefined) updates.perks = perks;
  if (incentives !== undefined) updates.incentives = incentives;
  if (images !== undefined) updates.images = images;
  if (structure_name !== undefined) updates.structure_name = structure_name;
  if (sub_heading !== undefined) updates.sub_heading = sub_heading;
  if (available_from !== undefined) updates.available_from = available_from;
  if (available_until !== undefined) updates.available_until = available_until;
  if (is_guest_favorite !== undefined) updates.is_guest_favorite = is_guest_favorite;
  if (is_popular !== undefined) updates.is_popular = is_popular;
  if (original_price !== undefined) updates.original_price = original_price;
  if (rating !== undefined) updates.rating = rating;
  if (review_count !== undefined) updates.review_count = review_count;

  const { data: updated, error } = await supabase.from("listings").update(updates).eq("id", id).select().single();

  if (error) {
    console.error("PATCH /listings/:id error:", error.message);
    res.status(500).json({ error: "Failed to update listing" });
    return;
  }

  res.status(200).json(updated as IListing);
});

router.delete("/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const hostId = req.user!.id;

  const { data: existing } = await supabase.from("listings").select("id").eq("id", id).eq("host_id", hostId).maybeSingle();

  if (!existing) {
    res.status(404).json({ error: "Listing not found" });
    return;
  }

  const { data: activeReservations } = await supabase.from("reservations").select("id").eq("listing_id", id).in("approval_status", ["pending", "approved"]).limit(1);

  if (activeReservations && activeReservations.length > 0) {
    res.status(409).json({ error: "Cannot delete a listing with active or pending reservations" });
    return;
  }

  const { error } = await supabase.from("listings").update({ is_active: false, updated_at: new Date().toISOString() }).eq("id", id);

  if (error) {
    console.error("DELETE /listings/:id error:", error.message);
    res.status(500).json({ error: "Failed to delete listing" });
    return;
  }

  res.status(200).json({ message: "Listing deleted" });
});

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
