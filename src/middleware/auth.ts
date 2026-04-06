import type { NextFunction, Request, Response } from "express";

import { supabase } from "#database/supabase.js";

export async function requireAuth(req: Request, res: Response, next: NextFunction): Promise<void> {
  const authHeader = req.headers.authorization;

  if (!authHeader?.startsWith("Bearer ")) {
    res.status(401).json({ error: "Missing or invalid authorization header" });
    return;
  }

  const token = authHeader.slice(7);
  const { data, error } = await supabase.auth.getUser(token);

  if (error) {
    console.error("[requireAuth] supabase.auth.getUser error:", error);
    res.status(401).json({ error: "Invalid or expired token" });
    return;
  }

  req.user = data.user;
  next();
}
