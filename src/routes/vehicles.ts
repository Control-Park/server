/* eslint-disable @typescript-eslint/no-unnecessary-condition */
/* eslint-disable @typescript-eslint/no-unsafe-assignment */
/* eslint-disable @typescript-eslint/no-non-null-assertion */
import { supabase } from "#database/supabase.js";
import { requireAuth } from "#middleware/auth.js";
import { Router } from "express";

const router = Router();

export interface IVehicle {
  color: string;
  created_at: string;
  id: string;
  make: string;
  model: string;
  nickname: null | string;
  plate: string;
  user_id: string;
  year: string;
}

router.get("/", requireAuth, async (req, res) => {
  const userId = req.user!.id;

  const { data, error } = await supabase.from("vehicles").select("*").eq("user_id", userId).order("created_at", { ascending: true });

  if (error) {
    res.status(500).json({ error: "Failed to fetch vehicles" });
    return;
  }

  res.status(200).json({ vehicles: (data ?? []) as IVehicle[] });
});

router.post("/", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { color, make, model, nickname, plate, year } = req.body as {
    color?: string;
    make?: string;
    model?: string;
    nickname?: string;
    plate?: string;
    year?: string;
  };

  if (!make || !model || !year || !color || !plate) {
    res.status(400).json({ error: "Missing required fields: make, model, year, color, plate" });
    return;
  }

  const { data, error } = await supabase
    .from("vehicles")
    .insert({
      color: color.trim(),
      make: make.trim(),
      model: model.trim(),
      nickname: nickname?.trim() ?? null,
      plate: plate.trim().toUpperCase(),
      user_id: userId,
      year: year.trim(),
    })
    .select()
    .single();

  if (error) {
    console.error("POST /vehicles error:", error.message);
    res.status(500).json({ detail: error.message, error: "Failed to add vehicle" });
    return;
  }

  res.status(201).json(data as IVehicle);
});

router.patch("/:id", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { id } = req.params;
  const { color, make, model, nickname, plate, year } = req.body as {
    color?: string;
    make?: string;
    model?: string;
    nickname?: string;
    plate?: string;
    year?: string;
  };

  const { data: existing } = await supabase.from("vehicles").select("id").eq("id", id).eq("user_id", userId).maybeSingle();

  if (!existing) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }

  const updates: Record<string, null | string> = {};
  if (make !== undefined) updates.make = make.trim();
  if (model !== undefined) updates.model = model.trim();
  if (year !== undefined) updates.year = year.trim();
  if (color !== undefined) updates.color = color.trim();
  if (plate !== undefined) updates.plate = plate.trim().toUpperCase();
  if (nickname !== undefined) updates.nickname = nickname.trim() || null;

  if (Object.keys(updates).length === 0) {
    res.status(400).json({ error: "No valid fields to update" });
    return;
  }

  const { data, error } = await supabase.from("vehicles").update(updates).eq("id", id).eq("user_id", userId).select().single();

  if (error) {
    res.status(500).json({ error: "Failed to update vehicle" });
    return;
  }

  res.status(200).json(data as IVehicle);
});

router.delete("/:id", requireAuth, async (req, res) => {
  const userId = req.user!.id;
  const { id } = req.params;

  const { data: existing } = await supabase.from("vehicles").select("id").eq("id", id).eq("user_id", userId).maybeSingle();

  if (!existing) {
    res.status(404).json({ error: "Vehicle not found" });
    return;
  }

  const { error } = await supabase.from("vehicles").delete().eq("id", id).eq("user_id", userId);

  if (error) {
    res.status(500).json({ error: "Failed to delete vehicle" });
    return;
  }

  res.status(200).json({ message: "Vehicle deleted" });
});

export default router;
