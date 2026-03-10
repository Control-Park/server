import type { PostgrestSingleResponse } from "@supabase/supabase-js";

import { supabase } from "#database/supabase.js";
import { IUser } from "#interface/user-interface.js";
import { UserRegistration } from "#interface/user-registration-interface.js";
import { Router } from "express";

const router = Router();

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

  const { data, error }: PostgrestSingleResponse<IUser> = await supabase.from("users").select("*").eq("id", id).single();

  if (error) {
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

  const { data, error }: PostgrestSingleResponse<IUser> = await supabase.from("users").select("*").eq("email", email).single();

  if (error) {
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
router.post("/signup", async (req, res) => {
  const { birth_date, email, first_name, last_name, password, phone } = req.body as UserRegistration;

  if (!email || !first_name || !last_name || !password || !birth_date || !phone) {
    res.status(400).json({ error: "Missing required fields" });
    return;
  }

  const { data: authData, error: authError } = await supabase.auth.signUp({
    email,
    password,
  });

  if (authError || !authData.user) {
    res.status(400).json({ error: authError?.message ?? "Sign up failed" });
    return;
  }

  const { error: profileError } = await supabase.from("users").insert({
    birth_date: birth_date,
    email,
    first_name,
    id: authData.user.id,
    last_name,
    phone: phone,
  });

  if (profileError) {
    await supabase.auth.admin.deleteUser(authData.user.id);
    res.status(500).json({ error: "Failed to create user profile" });
    return;
  }

  res.status(201).json({ message: "User created. Check your email to confirm your account." });
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

export default router;
