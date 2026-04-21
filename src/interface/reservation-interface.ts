import { ReservationStatus } from "#enum/reservation-status.js";

import { IListing } from "./listings-interface.js";

export type ApprovalStatus = "approved" | "cancelled" | "pending" | "rejected";

export interface IReservation {
  approval_status: ApprovalStatus;
  created_at: string;
  end_time: string;
  id: string;
  listing?: IListing;
  listing_id: string;
  payment_intent_id: null | string;
  payment_method_id: null | string;
  start_time: string;
  status: ReservationStatus;
  total_price: number;
  updated_at: string;
  user_id: string;
  vehicle_id: null | string;
}
