import { IListing } from "./listings-interface.js";

export interface ISavedListing {
  created_at: string;
  id: string;
  listing?: IListing;
  listing_id: string;
  user_id: string;
}
