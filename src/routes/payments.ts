/* eslint-disable @typescript-eslint/no-non-null-assertion */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
import { supabase } from "#database/supabase.js";
import { IPaymentMethod } from "#interface/payment-interface.js";
import { requireAuth } from "#middleware/auth.js";
import { Router } from "express";
import Stripe from "stripe";

const router = Router();

const stripe = new Stripe(process.env.STRIPE_SECRET_KEY!);

// Retrieves or creates a Stripe Customer for the authenticated user
async function getOrCreateStripeCustomer(userId: string): Promise<string> {
  const { data: user } = await supabase.from("users").select("stripe_customer_id, email").eq("id", userId).single();

  if (user?.stripe_customer_id) {
    return user.stripe_customer_id as string;
  }

  const customer = await stripe.customers.create({
    email: user?.email as string | undefined,
    metadata: { supabase_user_id: userId },
  });

  await supabase.from("users").update({ stripe_customer_id: customer.id }).eq("id", userId);

  return customer.id;
}

/**
 * @swagger
 * /payments/setup-intent:
 *   post:
 *     summary: Create a Stripe SetupIntent
 *     description: Creates or retrieves the Stripe Customer for the user, then returns a SetupIntent client_secret. Use this on the frontend with the Stripe SDK to securely collect and tokenize card details without sending them to your server.
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: SetupIntent created
 *         content:
 *           application/json:
 *             schema:
 *               type: object
 *               properties:
 *                 client_secret:
 *                   type: string
 *                 customer_id:
 *                   type: string
 *       401:
 *         description: Unauthorized
 */
router.post("/setup-intent", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  const customerId = await getOrCreateStripeCustomer(userId);

  const setupIntent = await stripe.setupIntents.create({
    customer: customerId,
    payment_method_types: ["card"],
  });

  res.status(200).json({
    client_secret: setupIntent.client_secret,
    customer_id: customerId,
  });
});

/**
 * @swagger
 * /payments/payment-methods:
 *   post:
 *     summary: Save a payment method after Stripe confirmation
 *     description: Attaches a Stripe PaymentMethod (obtained from the frontend SDK after confirming a SetupIntent) to the user's Stripe Customer and persists its details in the database.
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     requestBody:
 *       required: true
 *       content:
 *         application/json:
 *           schema:
 *             type: object
 *             required: [payment_method_id]
 *             properties:
 *               payment_method_id:
 *                 type: string
 *                 description: The Stripe PaymentMethod ID (pm_...)
 *               holder_name:
 *                 type: string
 *     responses:
 *       201:
 *         description: Payment method saved
 *       400:
 *         description: Missing payment_method_id or already saved
 *       401:
 *         description: Unauthorized
 */
router.post("/payment-methods", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { holder_name, payment_method_id } = req.body as {
    holder_name?: string;
    payment_method_id?: string;
  };

  if (!payment_method_id) {
    res.status(400).json({ error: "Missing payment_method_id" });
    return;
  }

  const customerId = await getOrCreateStripeCustomer(userId);

  // Attach the client-created PaymentMethod to the customer
  let pm: Stripe.PaymentMethod;
  try {
    await stripe.paymentMethods.attach(payment_method_id, { customer: customerId });
    pm = await stripe.paymentMethods.retrieve(payment_method_id);
  } catch (err) {
    console.error("[Stripe] attach error:", err);
    const message = err instanceof Error ? err.message : "Failed to attach payment method";
    res.status(500).json({ error: message });
    return;
  }

  const card = pm.card;

  if (!card) {
    res.status(400).json({ error: "Payment method has no card details" });
    return;
  }

  const { data: existing } = await supabase.from("payment_methods").select("id").eq("user_id", userId).eq("stripe_payment_method_id", pm.id).maybeSingle();

  if (existing) {
    res.status(400).json({ error: "Payment method already saved" });
    return;
  }

  const { data, error } = await supabase
    .from("payment_methods")
    .insert({
      brand: card.brand,
      exp_month: card.exp_month,
      exp_year: card.exp_year,
      holder_name: holder_name ?? pm.billing_details.name ?? null,
      last4: card.last4,
      stripe_payment_method_id: pm.id,
      user_id: userId,
    })
    .select()
    .single();

  if (error) {
    res.status(500).json({ error: "Failed to save payment method" });
    return;
  }

  res.status(201).json(data as IPaymentMethod);
});

/**
 * @swagger
 * /payments/payment-methods:
 *   get:
 *     summary: List saved payment methods
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     responses:
 *       200:
 *         description: List of saved payment methods
 *       401:
 *         description: Unauthorized
 */
router.get("/payment-methods", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  const { data, error } = await supabase.from("payment_methods").select("*").eq("user_id", userId).order("created_at", { ascending: false });

  if (error) {
    res.status(500).json({ error: "Failed to fetch payment methods" });
    return;
  }

  res.status(200).json({ payment_methods: data as IPaymentMethod[] });
});

/**
 * @swagger
 * /payments/payment-methods/{id}:
 *   delete:
 *     summary: Remove a saved payment method
 *     tags: [Payments]
 *     security:
 *       - bearerAuth: []
 *     parameters:
 *       - in: path
 *         name: id
 *         required: true
 *         schema:
 *           type: string
 *           format: uuid
 *         description: The internal payment method UUID
 *     responses:
 *       200:
 *         description: Payment method removed
 *       401:
 *         description: Unauthorized
 *       404:
 *         description: Payment method not found
 */
router.delete("/payment-methods/:id", requireAuth, async (req, res) => {
  const { id } = req.params;
  const userId = req.user!.id;

  const { data: existing } = await supabase.from("payment_methods").select("stripe_payment_method_id").eq("id", id).eq("user_id", userId).maybeSingle();

  if (!existing) {
    res.status(404).json({ error: "Payment method not found" });
    return;
  }

  // Detach from Stripe
  await stripe.paymentMethods.detach(existing.stripe_payment_method_id as string);

  const { error } = await supabase.from("payment_methods").delete().eq("id", id).eq("user_id", userId);

  if (error) {
    res.status(500).json({ error: "Failed to remove payment method" });
    return;
  }

  res.status(200).json({ message: "Payment method removed" });
});

export default router;
