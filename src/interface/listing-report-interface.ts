import { ReportReason } from "#enum/report-reason.js";

export interface IListingReport {
  created_at: string;
  description?: string;
  id: string;
  listing_id: string;
  reason: ReportReason;
  status: "dismissed" | "pending" | "resolved" | "reviewed";
  updated_at: string;
  user_id: string;
}
