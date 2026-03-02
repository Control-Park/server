import { HostDisplayName } from "#enum/host-display-name.js";
import { UserRole } from "#enum/user-role.js";

import { Listing } from "./listings-interface.js";

export interface IUser {
  birth_date: Date;
  created_at: Date;
  email: string;
  first_name: string;
  host: boolean;
  host_display_name: HostDisplayName.FIRST;
  id: number;
  last_name: string;
  listings: Listing[];
  password_hash: string;
  phone: string;
  preferred_name?: string;
  role: UserRole.ANON;
  updated_at: Date;
  verified: boolean;
}
