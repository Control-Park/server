import { UserRole } from "#enum/user-role.js";

import { IListing } from "./listings-interface.js";
import { IReservation } from "./reservation-interface.js";

export interface IUser {
  address_city?: null | string;
  address_country?: null | string;
  address_line1?: null | string;
  address_line2?: null | string;
  address_postal_code?: null | string;
  address_state?: null | string;
  bio: null | string;
  birth_date: Date;
  created_at: Date;
  email: string;
  first_name: string;
  host: boolean;
  host_display_name?: string;
  id: string;
  last_name: string;
  listings: IListing[];
  phone: string;
  preferred_name?: string;
  profile_image: null | string;
  reservations: IReservation[];
  role: UserRole;
  updated_at: Date;
}
