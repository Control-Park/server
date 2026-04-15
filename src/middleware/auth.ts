import type { NextFunction, Request, Response } from "express";

import { createClient } from "@supabase/supabase-js";

const supabaseUrl = process.env.SUPABASE_URL;
const supabaseAnonKey = process.env.SUPABASE_ANON_KEY;

if (!supabaseUrl || !supabaseAnonKey) {
  throw new Error("Missing SUPABASE_URL or SUPABASE_ANON_KEY in .env");
}

// Use anon key for JWT verification — service role client does not support getUser(jwt)
const authClient = createClient(supabaseUrl, supabaseAnonKey, {
  auth: { autoRefreshToken: false, persistSession: false },
});

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const token = authHeader.slice(7);

  if (!token) {
    res.status(401).json({ error: "Missing token" });
    return;
  }

  const { data, error } = await authClient.auth.getUser(token);

  if (error) {
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  req.user = data.user;
  next();
}
