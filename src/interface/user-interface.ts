import { UserRole } from "#enum/user-role.js";

import { IListing } from "./listings-interface.js";
import { IReservation } from "./reservation-interface.js";

export interface IUser {
  birth_date: Date;
  created_at: Date;
  first_name: string;
  host: boolean;
  host_display_name?: string;
  id: string;
  last_name: string;
  listings: IListing[];
  phone: string;
  preferred_name?: string;
  reservations: IReservation[];
  role: UserRole;
  updated_at: Date;
}
