import { ParkingType } from "#enum/parking-types.js";

export interface IListing {
  address: string;
  amenities: string[];
  available_from?: string;
  available_until?: string;
  created_at: string;
  description: string;
  host_id: string;
  host_name?: string;
  host_type?: string;
  id: string;
  images: string[];
  incentives: string[];
  is_active: boolean;
  is_draft?: boolean;
  is_guest_favorite: boolean;
  is_popular: boolean;
  original_price?: number;
  parking_type: ParkingType;
  perks: string[];
  price_per_hour: number;
  rating?: number;
  review_count: number;
  structure_name?: string;
  sub_heading: string[];
  title: string;
  updated_at: string;
}
