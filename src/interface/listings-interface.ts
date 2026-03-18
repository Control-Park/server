import { ParkingType } from "#enum/parking-types.js";

export interface IListing {
  address: string;
  amenities: string[];
  available_from?: string;
  available_until?: string;
  created_at: string;
  description: string;
  host_id: string;
  id: string;
  images: string[];
  incentives: string[];
  is_active: boolean;
  parking_type: ParkingType;
  perks: string[];
  price_per_hour: number;
  structure_name?: string;
  title: string;
  updated_at: string;
}
