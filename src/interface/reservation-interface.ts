import { ReservationStatus } from "#enum/reservation-status.js";

import { IListing } from "./listings-interface.js";

export interface IReservation {
  created_at: string;
  end_time: string;
  id: string;
  listing?: IListing;
  listing_id: string;
  start_time: string;
  status: ReservationStatus;
  total_price: number;
  updated_at: string;
  user_id: string;
  vehicle_id?: string;
}
