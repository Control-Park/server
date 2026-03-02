import { UserRole } from "#enum/user-role.js";

import { Listing } from "./listings-interface.js";

export interface IUser {
  birth_date: Date;
  created_at: Date;
  first_name: string;
  host: boolean;
  host_display_name?: string;
  id: string;
  last_name: string;
  listings: Listing[];
  phone: string;
  preferred_name?: string;
  role: UserRole;
  updated_at: Date;
}
