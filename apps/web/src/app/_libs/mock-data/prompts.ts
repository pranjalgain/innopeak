import { CURRENT_OWNER } from "@/app/_libs/constants/current-owner";
import type { AiPrompt } from "@/types/domain";

export const MOCK_PROMPTS: AiPrompt[] = [
  {
    id: "prompt_positive",
    name: "Positive review reply",
    description: "Used for 4-5 star reviews. Keep it warm and specific to what the reviewer praised.",
    versions: [
      {
        version: 1,
        template:
          "You are replying on behalf of {{business_name}} to a {{rating}}-star review from {{reviewer_name}}.\n\nReview: \"{{review_text}}\"\n\nThank the reviewer for their feedback.",
        updatedAt: "2026-06-02T09:00:00Z",
        updatedByName: CURRENT_OWNER.name,
      },
      {
        version: 2,
        template:
          "You are replying on behalf of {{business_name}} to a {{rating}}-star review from {{reviewer_name}}.\n\nReview: \"{{review_text}}\"\n\nThank the reviewer for their feedback and mention the business name.",
        updatedAt: "2026-06-25T14:30:00Z",
        updatedByName: CURRENT_OWNER.name,
      },
      {
        version: 3,
        template:
          "You are replying on behalf of {{business_name}} to a {{rating}}-star review from {{reviewer_name}}.\n\nReview: \"{{review_text}}\"\n\nWrite a warm thank-you reply. Mention something specific from the review if possible. Keep it under 80 words.",
        updatedAt: "2026-07-18T11:15:00Z",
        updatedByName: CURRENT_OWNER.name,
      },
      {
        version: 4,
        template:
          "You are replying on behalf of {{business_name}} to a {{rating}}-star review from {{reviewer_name}}.\n\nReview: \"{{review_text}}\"\n\nWrite a warm, genuine thank-you reply. Mention something specific from the review if possible. Keep it under 70 words and avoid generic phrases like \"we appreciate your feedback.\"",
        updatedAt: "2026-08-05T16:45:00Z",
        updatedByName: CURRENT_OWNER.name,
      },
      {
        version: 5,
        template:
          "You are replying on behalf of {{business_name}} to a {{rating}}-star review from {{reviewer_name}}.\n\nReview: \"{{review_text}}\"\n\nWrite a warm, genuine thank-you reply. Mention something specific from the review if possible. Keep it under 60 words and avoid generic phrases like \"we appreciate your feedback.\"",
        updatedAt: "2026-08-20T10:00:00Z",
        updatedByName: CURRENT_OWNER.name,
      },
    ],
    tone: "friendly",
  },
  {
    id: "prompt_neutral",
    name: "Neutral review reply",
    description: "Used for 3-star reviews with mixed feedback.",
    versions: [
      {
        version: 1,
        template:
          "You are replying on behalf of {{business_name}} to a {{rating}}-star review from {{reviewer_name}}.\n\nReview: \"{{review_text}}\"\n\nAcknowledge both the positive and constructive points in the review. Invite the reviewer to give the business another visit. Keep it under 70 words.",
        updatedAt: "2026-08-20T10:00:00Z",
        updatedByName: CURRENT_OWNER.name,
      },
    ],
    tone: "professional",
  },
  {
    id: "prompt_negative",
    name: "Negative / escalated review reply",
    description: "Used for 1-2 star reviews and reviews escalated to the team.",
    versions: [
      {
        version: 1,
        template:
          "You are replying on behalf of {{business_name}} to a {{rating}}-star review from {{reviewer_name}}.\n\nReview: \"{{review_text}}\"\n\nApologize sincerely without being defensive, briefly acknowledge the specific issue raised, and invite the reviewer to reach out directly to resolve it. Do not make promises about refunds or compensation. Keep it under 80 words.",
        updatedAt: "2026-08-25T09:30:00Z",
        updatedByName: CURRENT_OWNER.name,
      },
    ],
    tone: "empathetic",
  },
];
