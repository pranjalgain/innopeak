/** Explicit column allow-lists: a column added to a table later isn't exported until someone decides it should be. */

export interface ExportBusiness {
  name: string;
  status: string;
  createdAt: string;
}

export interface ExportTeamMember {
  name: string | null;
  email: string | null;
  role: string;
  status: string;
  createdAt: string;
}

export interface ExportSettings {
  escalationRatingThreshold: number;
  autoPostEnabled: boolean;
  reviewDataRetentionMonths: number | null;
  aiReplyCount: number;
}

export interface ExportNotificationRecipient {
  email: string | null;
  notificationType: string;
  channel: string;
  isActive: boolean;
}

export interface ExportLocation {
  id: string;
  name: string;
  address: string | null;
  provider: string;
  status: string;
  createdAt: string;
}

export interface ExportPromptVersion {
  version: number;
  template: string;
  createdAt: string;
}

export interface ExportPrompt {
  category: string;
  name: string;
  description: string | null;
  tone: string;
  versions: ExportPromptVersion[];
}

export interface ExportReview {
  id: string;
  locationId: string;
  rating: number;
  text: string | null;
  /** `null` once the retention job has anonymized the reviewer. */
  reviewerName: string | null;
  reviewedAt: string | null;
  sentiment: string | null;
  classification: string;
  status: string;
}

export interface ExportResponse {
  reviewId: string;
  type: string;
  content: string;
  source: string;
  status: string;
  postedAt: string | null;
  createdAt: string;
}

export interface ExportReceipt {
  invoiceNumber: string | null;
  /** Smallest currency unit. */
  amountPaid: number;
  currency: string;
  paidAt: string;
}

export interface ExportBilling {
  plan: string | null;
  status: string | null;
  currentPeriodEnd: string | null;
  receipts: ExportReceipt[];
}

/** Everything except reviews, which are streamed in batches. */
export interface TenantExportSections {
  business: ExportBusiness | null;
  team: ExportTeamMember[];
  settings: ExportSettings | null;
  blocklist: string[];
  notificationRecipients: ExportNotificationRecipient[];
  locations: ExportLocation[];
  prompts: ExportPrompt[];
  billing: ExportBilling;
}
