import type { BusinessBillingInfo } from "@/types/domain";

export const MOCK_ADMIN_BILLING: BusinessBillingInfo[] = [
  {
    businessId: "business_coastal_table",
    businessName: "The Coastal Table",
    plan: "growth",
    mrr: 149,
    reviewsThisMonth: 62,
    status: "active",
  },
  {
    businessId: "business_riverside_bistro",
    businessName: "Riverside Bistro",
    plan: "starter",
    mrr: 49,
    reviewsThisMonth: 21,
    status: "active",
  },
  {
    businessId: "business_summit_dental",
    businessName: "Summit Dental Group",
    plan: "scale",
    mrr: 399,
    reviewsThisMonth: 184,
    status: "active",
  },
  {
    businessId: "business_oak_hardware",
    businessName: "Oak & Iron Hardware",
    plan: "starter",
    mrr: 0,
    reviewsThisMonth: 3,
    status: "suspended",
  },
  {
    businessId: "business_bluewave_spa",
    businessName: "Bluewave Day Spa",
    plan: "growth",
    mrr: 149,
    reviewsThisMonth: 34,
    status: "active",
  },
  {
    businessId: "business_pinecrest_auto",
    businessName: "Pinecrest Auto Repair",
    plan: "starter",
    mrr: 49,
    reviewsThisMonth: 12,
    status: "active",
  },
];
