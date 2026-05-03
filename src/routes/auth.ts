/* eslint-disable perfectionist/sort-imports */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { supabase } from "#database/supabase.js";
import { IUser } from "#interface/user-interface.js";
import { UserRegistration } from "#interface/user-registration-interface.js";
import { requireAuth } from "#middleware/auth.js";
import { Router } from "express";
import type { PostgrestSingleResponse } from "@supabase/supabase-js";

const router = Router();

const USER_PROFILE_SELECT = `
  id,
  email,
  first_name,
  last_name,
  preferred_name,
  phone,
  birth_date,
  role,
  host,
  host_display_name,
  bio,
  address_line1,
  address_line2,
  address_city,
  address_state,
  address_postal_code,
  address_country,
  expo_push_token,
  stripe_customer_id,
  created_at,
  updated_at
`;

/**
 * @swagger
 * components:
 *   schemas:
 *     User:
 *       type: object
 *       properties:
 *         id:
 *           type: string
 *           format: uuid
 *         email:
 *           type: string
 *           format: email
 *         first_name:
 *           type: string
 *         last_name:
 *           type: string
 *         preferred_name:
 *           type: string
 *         phone:
 *           type: string
 *         birth_date:
 *           type: string
 *           format: date
 *         role:
 *           type: string
 *           enum: [GUEST, ANON]
 *         host:
 *           type: boolean
 *         host_display_name:
 *           type: string
 *         bio:
 *           type: string
 *         created_at:
 *           type: string
 *           format: date-time
 *         updated_at:
 *           type: string
 *           format: date-time
 */

/**
 * @swagger
 * /auth/user/{id}:
 *   get:
 *     summary: Get user by ID
 *     tags: [Auth]
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The user's UUID
 *     responses:
 *       200:
 *         description: User found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       404:
 *         description: User not found
 */
router.get("/user/:id", async (req, res) => {
  const { id } = req.params;

  const { data, error }: PostgrestSingleResponse<IUser> = await supabase.from("users").select(USER_PROFILE_SELECT).eq("id", id).single();

  if (error) {
    console.error("[auth/user/:id] profile fetch error:", error);
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.status(200).json(data);
});

/**
 * @swagger
 * /auth/user:
 *   get:
 *     summary: Get user by email
 *     tags: [Auth]
 *     parameters:
 *       - in: query
 *         name: email
 *         required: true
 *         schema:
 *           type: string
 *           format: email
 *         description: The user's email address
 *     responses:
 *       200:
 *         description: User found
 *         content:
 *           application/json:
 *             schema:
 *               $ref: '#/components/schemas/User'
 *       400:
 *         description: Missing email query parameter
 *       404:
 *         description: User not found
 */
router.get("/user", async (req, res) => {
  const { email } = req.query as { email?: string };

  if (!email) {
    res.status(400).json({ error: "Missing email query parameter" });
    return;
  }

  const { data, error }: PostgrestSingleResponse<IUser> = await supabase.from("users").select(USER_PROFILE_SELECT).eq("email", email).single();

  if (error) {
    console.error("[auth/user] profile fetch error:", error);
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.status(200).json(data);
});

/**
 * @swagger
 * /auth/signup:
 *   post:
 *     summary: Register a new user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password, first_name, last_name, birth_date, phone]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               birth_date:
 *                 type: string
 *                 format: date
 *               phone:
 *                 type: string
 *     responses:
 *       201:
 *         description: User created successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Missing required fields or sign up failed
 *       500:
 *         description: Failed to create user profile
 */
// Temporarily holds signup data while the user verifies their email via OTP.
// Keyed by email address.
const pendingSignups = new Map<string, UserRegistration>();

/**
 * Step 1 — collect signup data and send a 6-digit OTP to the email.
 */
router.post("/signup", async (req, res) => {
  const { birth_date, email, first_name, last_name, password, phone } = req.body as UserRegistration;

  if (!email || !first_name || !last_name || !password || !birth_date || !phone) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  // Check if email is already registered
  const { data: existing } = await supabase.from("users").select("id").eq("email", email).maybeSingle();
  if (existing) {
    res.status(400).json({ error: "An account with this email already exists" });
    return;
  }

  // Store signup data and send OTP for email verification
  pendingSignups.set(email, { birth_date, email, first_name, last_name, password, phone });

  // shouldCreateUser: true so Supabase creates a temporary auth entry and sends the OTP
  const { error: otpError } = await supabase.auth.signInWithOtp({
    email,
    options: { shouldCreateUser: true },
  });

  if (otpError) {
    pendingSignups.delete(email);
    res.status(500).json({ error: otpError.message });
    return;
  }

  res.status(200).json({ message: "Verification code sent to your email." });
});

/**
 * Step 2 — verify the OTP and create the full account.
 */
router.post("/signup/verify", async (req, res) => {
  const { email, otp } = req.body as { email?: string; otp?: string };

  if (!email || !otp) {
    res.status(400).json({ error: "Missing email or otp" });
    return;
  }

  const pending = pendingSignups.get(email);
  if (!pending) {
    res.status(400).json({ error: "No pending signup for this email — start over" });
    return;
  }

  // Verify OTP — type must be "signup" to match what signInWithOtp sends for new users
  const { data: verifyData, error: verifyError } = await supabase.auth.verifyOtp({
    email,
    token: otp,
    type: "signup",
  });

  if (verifyError || !verifyData.user) {
    res.status(400).json({ error: "Invalid or expired verification code" });
    return;
  }

  const userId = verifyData.user.id;

  // Set the real password on the now-verified auth user
  const { error: pwError } = await supabase.auth.admin.updateUserById(userId, {
    password: pending.password,
  });

  if (pwError) {
    res.status(500).json({ error: "Failed to set password" });
    return;
  }

  // Check if profile already exists (e.g. user retried after partial failure)
  const { data: existingProfile } = await supabase.from("users").select("id").eq("id", userId).maybeSingle();

  if (!existingProfile) {
    const { error: profileError } = await supabase.from("users").insert({
      birth_date: pending.birth_date,
      email,
      first_name: pending.first_name,
      id: userId,
      last_name: pending.last_name,
      phone: pending.phone,
    });

    if (profileError) {
      console.error("[signup/verify] profile insert error:", profileError);
      await supabase.auth.admin.deleteUser(userId);
      res.status(500).json({ error: profileError.message });
      return;
    }
  }

  pendingSignups.delete(email);

  res.status(201).json({ message: "Account created successfully." });
});

/**
 * @swagger
 * /auth/signin:
 *   post:
 *     summary: Sign in a user
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Sign in successful
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 access_token:
 *                   type: string
 *                 user_id:
 *                   type: string
 *                   format: uuid
 *       400:
 *         description: Missing required fields
 *       401:
 *         description: Invalid credentials
 */
router.post("/signin", async (req, res) => {
  const { email, password } = req.body as { email: string; password: string };

  if (!email || !password) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const { data, error } = await supabase.auth.signInWithPassword({ email, password });

  if (error) {
    res.status(401).json({ error: error.message });
    return;
  }

  res.status(200).json({ access_token: data.session.access_token, user_id: data.user.id });
});

/**
 * @swagger
 * /auth/forgot-password:
 *   post:
 *     summary: Request a password reset OTP
 *     description: Sends a 6-digit OTP code to the user's email via Supabase. The OTP is valid for a limited time.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *     responses:
 *       200:
 *         description: OTP sent (response is intentionally vague for security)
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Missing email field
 */
router.post("/forgot-password", async (req, res) => {
  const { email } = req.body as { email?: string };

  if (!email) {
    res.status(400).json({ error: "Missing email field" });
    return;
  }

  await supabase.auth.resetPasswordForEmail(email);

  // Always return 200 to avoid leaking whether an account exists
  res.status(200).json({ message: "If an account with that email exists, a password reset code has been sent." });
});

/**
 * @swagger
 * /auth/reset-password:
 *   post:
 *     summary: Reset password using a 6-digit OTP
 *     description: Verifies the OTP sent to the user's email and updates their password.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp, new_password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               otp:
 *                 type: string
 *                 description: The 6-digit OTP code received via email
 *                 example: "123456"
 *               new_password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Password updated successfully
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 message:
 *                   type: string
 *       400:
 *         description: Missing required fields or invalid/expired OTP
 */
router.post("/reset-password", async (req, res) => {
  const { email, new_password, otp } = req.body as { email?: string; new_password?: string; otp?: string };

  if (!email || !otp || !new_password) {
    res.status(400).json({ error: "Missing required fields: email, otp, and new_password" });
    return;
  }

  const { data, error: verifyError } = await supabase.auth.verifyOtp({ email, token: otp, type: "recovery" });

  if (verifyError || !data.user) {
    res.status(400).json({ error: "Invalid or expired OTP" });
    return;
  }

  const { error } = await supabase.auth.admin.updateUserById(data.user.id, { password: new_password });

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(200).json({ message: "Password updated successfully." });
});

/**
 * @swagger
 * /auth/push-token:
 *   post:
 *     summary: Register or update the authenticated user's Expo push token
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [expo_push_token]
 *             properties:
 *               expo_push_token:
 *                 type: string
 *     responses:
 *       200:
 *         description: Push token saved successfully
 *       400:
 *         description: Missing expo_push_token
 *       401:
 *         description: Unauthorized
 */
/**
 * @swagger
 * /auth/me:
 *   get:
 *     summary: Get the authenticated user's profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: User profile
 *       401:
 *         description: Unauthorized
 */
router.get("/me", requireAuth, async (req, res) => {
  const { data, error }: PostgrestSingleResponse<IUser> = await supabase.from("users").select(USER_PROFILE_SELECT).eq("id", req.user!.id).single();

  if (error) {
    console.error("[auth/me] profile fetch error:", error);
    res.status(404).json({ error: "User not found" });
    return;
  }

  res.status(200).json(data);
});

/**
 * @swagger
 * /auth/me:
 *   patch:
 *     summary: Update the authenticated user's profile
 *     tags: [Auth]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             properties:
 *               first_name:
 *                 type: string
 *               last_name:
 *                 type: string
 *               preferred_name:
 *                 type: string
 *               phone:
 *                 type: string
 *               host_display_name:
 *                 type: string
 *               bio:
 *                 type: string
 *               address_line1:
 *                 type: string
 *               address_line2:
 *                 type: string
 *               address_city:
 *                 type: string
 *               address_state:
 *                 type: string
 *               address_postal_code:
 *                 type: string
 *               address_country:
 *                 type: string
 *     responses:
 *       200:
 *         description: Profile updated
 *       401:
 *         description: Unauthorized
 */
router.patch("/me", requireAuth, async (req, res) => {
  const { address_city, address_country, address_line1, address_line2, address_postal_code, address_state, bio, first_name, host_display_name, last_name, phone, preferred_name } = req.body as Partial<IUser>;

  const updates: Partial<IUser> = {};

  if (first_name !== undefined) updates.first_name = first_name;
  if (last_name !== undefined) updates.last_name = last_name;
  if (preferred_name !== undefined) updates.preferred_name = preferred_name;
  if (phone !== undefined) updates.phone = phone;
  if (host_display_name !== undefined) updates.host_display_name = host_display_name;
  if (address_line1 !== undefined) updates.address_line1 = address_line1;
  if (address_line2 !== undefined) updates.address_line2 = address_line2;
  if (address_city !== undefined) updates.address_city = address_city;
  if (address_state !== undefined) updates.address_state = address_state;
  if (address_postal_code !== undefined) {
    updates.address_postal_code = address_postal_code;
  }
  if (address_country !== undefined) updates.address_country = address_country;
  if (bio !== undefined) updates.bio = bio;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No fields to update" });
    return;
  }

  const { data, error }: PostgrestSingleResponse<IUser> = await supabase.from("users").update(updates).eq("id", req.user!.id).select(USER_PROFILE_SELECT).single();

  if (error) {
    console.error("[auth/me] profile update error:", error);
    res.status(500).json({ error: "Failed to update profile" });
    return;
  }

  res.status(200).json(data);
});

// In-memory store for pending email changes: userId -> newEmail
// (sufficient for single-server; replace with Redis for multi-instance)
const pendingEmailChanges = new Map<string, string>();

/**
 * Step 1 — request email change: sends OTP to the CURRENT email to verify identity.
 */
router.post("/email-change/request", requireAuth, async (req, res) => {
  const { new_email } = req.body as { new_email?: string };

  if (!new_email) {
    res.status(400).json({ error: "Missing new_email" });
    return;
  }

  const currentEmail = req.user!.email;
  if (!currentEmail) {
    res.status(400).json({ error: "No email on account" });
    return;
  }

  if (new_email === currentEmail) {
    res.status(400).json({ error: "New email must differ from current email" });
    return;
  }

  // Store the intended new email while we wait for verification
  pendingEmailChanges.set(req.user!.id, new_email);

  // Send OTP to CURRENT email to confirm identity
  await supabase.auth.signInWithOtp({ email: currentEmail, options: { shouldCreateUser: false } });

  res.status(200).json({ message: "Verification code sent to your current email address." });
});

/**
 * Step 2 — verify current email OTP, then send OTP to the new email.
 */
router.post("/email-change/verify-current", requireAuth, async (req, res) => {
  const { otp } = req.body as { otp?: string };

  if (!otp) {
    res.status(400).json({ error: "Missing otp" });
    return;
  }

  const currentEmail = req.user!.email;
  if (!currentEmail) {
    res.status(400).json({ error: "No email on account" });
    return;
  }

  const newEmail = pendingEmailChanges.get(req.user!.id);
  if (!newEmail) {
    res.status(400).json({ error: "No pending email change — start over" });
    return;
  }

  // Verify OTP against current email
  const { error } = await supabase.auth.verifyOtp({ email: currentEmail, token: otp, type: "email" });
  if (error) {
    res.status(400).json({ error: "Invalid or expired verification code" });
    return;
  }

  // Identity confirmed — send OTP to the NEW email
  await supabase.auth.signInWithOtp({ email: newEmail, options: { shouldCreateUser: false } });

  res.status(200).json({ message: "Verification code sent to your new email address." });
});

/**
 * Step 3 — verify new email OTP and complete the email change.
 */
router.post("/email-change/verify-new", requireAuth, async (req, res) => {
  const { otp } = req.body as { otp?: string };

  if (!otp) {
    res.status(400).json({ error: "Missing otp" });
    return;
  }

  const userId = req.user!.id;
  const newEmail = pendingEmailChanges.get(userId);
  if (!newEmail) {
    res.status(400).json({ error: "No pending email change — start over" });
    return;
  }

  // Verify OTP against new email
  const { error: verifyError } = await supabase.auth.verifyOtp({ email: newEmail, token: otp, type: "email" });
  if (verifyError) {
    res.status(400).json({ error: "Invalid or expired verification code" });
    return;
  }

  // Update email in Supabase Auth and our users table
  const { error: authError } = await supabase.auth.admin.updateUserById(userId, { email: newEmail, email_confirm: true });
  if (authError) {
    res.status(500).json({ error: authError.message });
    return;
  }

  await supabase.from("users").update({ email: newEmail }).eq("id", userId);

  pendingEmailChanges.delete(userId);

  res.status(200).json({ message: "Email updated successfully." });
});

/**
 * @swagger
 * /auth/change-password:
 *   post:
 *     summary: Change password using a 6-digit OTP
 *     description: Verifies the OTP sent via /auth/forgot-password and updates the password. No auth token required — the OTP is the proof of identity.
 *     tags: [Auth]
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [email, otp, new_password]
 *             properties:
 *               email:
 *                 type: string
 *                 format: email
 *               otp:
 *                 type: string
 *               new_password:
 *                 type: string
 *                 format: password
 *     responses:
 *       200:
 *         description: Password updated
 *       400:
 *         description: Missing fields or invalid/expired OTP
 */
router.post("/change-password", async (req, res) => {
  const { email, new_password, otp } = req.body as { email?: string; new_password?: string; otp?: string };

  if (!email || !otp || !new_password) {
    res.status(400).json({ error: "Missing required fields: email, otp, new_password" });
    return;
  }

  const { data, error: verifyError } = await supabase.auth.verifyOtp({ email, token: otp, type: "recovery" });

  if (verifyError || !data.user) {
    res.status(400).json({ error: "Invalid or expired verification code" });
    return;
  }

  const { error } = await supabase.auth.admin.updateUserById(data.user.id, { password: new_password });

  if (error) {
    res.status(400).json({ error: error.message });
    return;
  }

  res.status(200).json({ message: "Password updated successfully." });
});

router.post("/push-token", requireAuth, async (req, res) => {
  const { expo_push_token } = req.body as { expo_push_token?: string };

  if (!expo_push_token) {
    res.status(400).json({ error: "Missing expo_push_token" });
    return;
  }

  const { error } = await supabase.from("users").update({ expo_push_token }).eq("id", req.user!.id);

  if (error) {
    res.status(500).json({ error: "Failed to save push token" });
    return;
  }

  res.status(200).json({ message: "Push token saved successfully" });
});

export default router;
