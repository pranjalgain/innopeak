import type { Review } from "@/types/domain";

export const MOCK_REVIEWS: Review[] = [
  {
    id: "rev_01",
    reviewerName: "Thomas Reilly",
    rating: 5,
    reviewText:
      "Best seafood in Portland, hands down. The scallops were perfectly seared and our server Priya knew the wine list inside out. Will absolutely be back.",
    reviewedAt: "2026-08-29T18:42:00Z",
    classification: "auto_reply_candidate",
    escalationReason: null,
    status: "responded",
    replyDrafts: [
      {
        id: "rev_01_a",
        label: "A",
        content:
          "Thomas, thank you so much! So glad the scallops landed and that Priya took care of you on the wine list — I'll pass that along to her directly. Can't wait to have you back.",
        originalContent:
          "Thomas, thank you so much! So glad the scallops landed and that Priya took care of you on the wine list — I'll pass that along to her directly. Can't wait to have you back.",
        status: "approved",
        promptId: "prompt_positive",
        promptVersion: 1,
        createdAt: "2026-08-29T18:47:00Z",
        decidedAt: "2026-08-30T09:00:00Z",
      },
      {
        id: "rev_01_b",
        label: "B",
        content:
          "Thank you, Thomas! Hearing the scallops and Priya's wine picks made your night is exactly what we hope for. See you again soon!",
        originalContent:
          "Thank you, Thomas! Hearing the scallops and Priya's wine picks made your night is exactly what we hope for. See you again soon!",
        status: "superseded",
        promptId: "prompt_positive",
        promptVersion: 1,
        createdAt: "2026-08-29T18:47:00Z",
        decidedAt: "2026-08-30T09:00:00Z",
      },
    ],
  },
  {
    id: "rev_02",
    reviewerName: "Nadia Farouk",
    rating: 4,
    reviewText:
      "Lovely atmosphere and the lobster roll was great. Only knock is we waited almost 15 minutes just to get water on a Tuesday night.",
    reviewedAt: "2026-08-30T20:05:00Z",
    classification: "auto_reply_candidate",
    escalationReason: null,
    status: "in_review",
    replyDrafts: [
      {
        id: "rev_02_a",
        label: "A",
        content:
          "Nadia, so glad you loved the atmosphere and the lobster roll! We're sorry about the wait for water — that's feedback we're taking straight to the floor team. Hope to see you again soon.",
        originalContent:
          "Nadia, so glad you loved the atmosphere and the lobster roll! We're sorry about the wait for water — that's feedback we're taking straight to the floor team. Hope to see you again soon.",
        status: "pending_approval",
        promptId: "prompt_positive",
        promptVersion: 1,
        createdAt: "2026-08-30T20:10:00Z",
        decidedAt: null,
      },
      {
        id: "rev_02_b",
        label: "B",
        content:
          "Thank you, Nadia! Thrilled the lobster roll hit the mark. We'll tighten up on drink service so the wait isn't repeated next time — come back and see us again.",
        originalContent:
          "Thank you, Nadia! Thrilled the lobster roll hit the mark. We'll tighten up on drink service so the wait isn't repeated next time — come back and see us again.",
        status: "pending_approval",
        promptId: "prompt_positive",
        promptVersion: 1,
        createdAt: "2026-08-30T20:10:00Z",
        decidedAt: null,
      },
    ],
  },
  {
    id: "rev_03",
    reviewerName: "Connor Blake",
    rating: 2,
    reviewText:
      "Reservation for 7pm, wasn't seated until 7:40 with no apology. Food was fine but honestly not worth the wait or the price.",
    reviewedAt: "2026-08-31T07:15:00Z",
    classification: "escalated",
    escalationReason: "low_rating",
    status: "in_review",
    replyDrafts: [
      {
        id: "rev_03_a",
        label: "A",
        content:
          "Connor, I'm sorry about the wait and that no one acknowledged it — that's not the experience we want for a reservation. I'd like to make this right; please reach out to me directly at maria@coastaltable.com.",
        originalContent:
          "Connor, I'm sorry about the wait and that no one acknowledged it — that's not the experience we want for a reservation. I'd like to make this right; please reach out to me directly at maria@coastaltable.com.",
        status: "pending_approval",
        promptId: "prompt_negative",
        promptVersion: 1,
        createdAt: "2026-08-31T07:20:00Z",
        decidedAt: null,
      },
      {
        id: "rev_03_b",
        label: "B",
        content:
          "Thank you for the honest feedback, Connor. A 40-minute wait past your reservation time is on us, no excuses. I'd love the chance to make it right on your next visit — please email me directly.",
        originalContent:
          "Thank you for the honest feedback, Connor. A 40-minute wait past your reservation time is on us, no excuses. I'd love the chance to make it right on your next visit — please email me directly.",
        status: "pending_approval",
        promptId: "prompt_negative",
        promptVersion: 1,
        createdAt: "2026-08-31T07:20:00Z",
        decidedAt: null,
      },
    ],
  },
  {
    id: "rev_04",
    reviewerName: "Grace Whitfield",
    rating: 1,
    reviewText:
      "Sent back a dish that was clearly undercooked and the kitchen argued with our server about it in front of us. Won't be returning.",
    reviewedAt: "2026-08-22T19:30:00Z",
    classification: "escalated",
    escalationReason: "low_rating",
    status: "responded",
    replyDrafts: [
      {
        id: "rev_04_a",
        label: "A",
        content:
          "Grace, I'm sorry the dish wasn't cooked properly and that the exchange with our kitchen felt dismissive — that's on us, not you. I've addressed this directly with the team and would welcome the chance to have you back.",
        originalContent:
          "We're sorry to hear about your experience with the undercooked dish and the response from our kitchen staff. We have addressed this internally and hope you will consider dining with us again.",
        status: "approved",
        promptId: "prompt_negative",
        promptVersion: 1,
        createdAt: "2026-08-22T19:35:00Z",
        decidedAt: "2026-08-23T09:10:00Z",
      },
      {
        id: "rev_04_b",
        label: "B",
        content:
          "Thank you for flagging this, Grace. An undercooked dish should never happen, and the response you got wasn't acceptable either. Please reach out directly so we can make it right.",
        originalContent:
          "Thank you for flagging this, Grace. An undercooked dish should never happen, and the response you got wasn't acceptable either. Please reach out directly so we can make it right.",
        status: "superseded",
        promptId: "prompt_negative",
        promptVersion: 1,
        createdAt: "2026-08-22T19:35:00Z",
        decidedAt: "2026-08-23T09:10:00Z",
      },
    ],
  },
  {
    id: "rev_05",
    reviewerName: "Marcus Yee",
    rating: 5,
    reviewText:
      "My uncle is a lawyer and even he agreed this was the best deal in town for the tasting menu. Incredible value, ask for the corner table.",
    reviewedAt: "2026-09-01T12:03:00Z",
    classification: "escalated",
    escalationReason: "blocklist_match",
    status: "in_review",
    replyDrafts: [
      {
        id: "rev_05_a",
        label: "A",
        content:
          "Thank you so much, Marcus! We're thrilled the tasting menu and the corner table hit the mark. We'd love to see you and your uncle again soon.",
        originalContent:
          "Thank you so much, Marcus! We're thrilled the tasting menu and the corner table hit the mark. We'd love to see you and your uncle again soon.",
        status: "pending_approval",
        promptId: "prompt_positive",
        promptVersion: 1,
        createdAt: "2026-09-01T12:07:00Z",
        decidedAt: null,
      },
      {
        id: "rev_05_b",
        label: "B",
        content:
          "Marcus, this made our day — thank you for the kind words about the tasting menu. Hope to host you both again soon!",
        originalContent:
          "Marcus, this made our day — thank you for the kind words about the tasting menu. Hope to host you both again soon!",
        status: "pending_approval",
        promptId: "prompt_positive",
        promptVersion: 1,
        createdAt: "2026-09-01T12:07:00Z",
        decidedAt: null,
      },
    ],
  },
  {
    id: "rev_06",
    reviewerName: "Estelle Park",
    rating: 3,
    reviewText:
      "Solid brunch spot. Nothing blew me away but nothing disappointed either. The mimosas were generous, I'll give them that.",
    reviewedAt: "2026-09-01T13:40:00Z",
    classification: "pending_classification",
    escalationReason: null,
    status: "new",
    replyDrafts: [],
  },
  {
    id: "rev_07",
    reviewerName: "Diego Alonso",
    rating: 4,
    reviewText:
      "Great date-night spot. Ambience is a 10/10, food is a solid 8. Would come back for a special occasion.",
    reviewedAt: "2026-08-18T21:10:00Z",
    classification: "auto_reply_candidate",
    escalationReason: null,
    status: "dismissed",
    replyDrafts: [
      {
        id: "rev_07_a",
        label: "A",
        content:
          "Diego, thank you for the kind words about the ambience — glad it made for a great date night! We'll keep working to get the food up to that same 10/10.",
        originalContent:
          "Diego, thank you for the kind words about the ambience — glad it made for a great date night! We'll keep working to get the food up to that same 10/10.",
        status: "rejected",
        promptId: "prompt_positive",
        promptVersion: 1,
        createdAt: "2026-08-18T21:15:00Z",
        decidedAt: "2026-08-19T10:00:00Z",
      },
      {
        id: "rev_07_b",
        label: "B",
        content:
          "Thanks so much, Diego! Really glad the atmosphere delivered for date night. Hope the food impresses even more next time around.",
        originalContent:
          "Thanks so much, Diego! Really glad the atmosphere delivered for date night. Hope the food impresses even more next time around.",
        status: "rejected",
        promptId: "prompt_positive",
        promptVersion: 1,
        createdAt: "2026-08-18T21:15:00Z",
        decidedAt: "2026-08-19T10:00:00Z",
      },
    ],
  },
  {
    id: "rev_08",
    reviewerName: "Holly Bergstrom",
    rating: 2,
    reviewText:
      "Charged us for a bottle of wine we never ordered and it took three attempts to get it corrected on the bill. Food was good otherwise.",
    reviewedAt: "2026-08-27T22:18:00Z",
    classification: "escalated",
    escalationReason: "low_rating",
    status: "in_review",
    replyDrafts: [
      {
        id: "rev_08_a",
        label: "A",
        content:
          "Holly, I'm sorry for the billing mix-up and that it took three attempts to sort out — that's frustrating and not the experience we want. I've flagged this with our team to prevent it happening again.",
        originalContent:
          "Holly, I'm sorry for the billing mix-up and that it took three attempts to sort out — that's frustrating and not the experience we want. I've flagged this with our team to prevent it happening again.",
        status: "pending_approval",
        promptId: "prompt_negative",
        promptVersion: 1,
        createdAt: "2026-08-27T22:23:00Z",
        decidedAt: null,
      },
      {
        id: "rev_08_b",
        label: "B",
        content:
          "Thank you for your patience with the billing error, Holly. That should have been corrected on the first try. We'd love the chance to make your next visit smoother.",
        originalContent:
          "Thank you for your patience with the billing error, Holly. That should have been corrected on the first try. We'd love the chance to make your next visit smoother.",
        status: "rejected",
        promptId: "prompt_negative",
        promptVersion: 1,
        createdAt: "2026-08-27T22:23:00Z",
        decidedAt: "2026-08-28T08:00:00Z",
      },
    ],
  },
  {
    id: "rev_09",
    reviewerName: "Owen Castillo",
    rating: 5,
    reviewText:
      "Been coming here since they opened. Consistently excellent, and the staff remembers regulars by name. That's rare these days.",
    reviewedAt: "2026-05-14T17:55:00Z",
    classification: "unclassified",
    escalationReason: null,
    status: "responded",
    replyDrafts: [],
  },
  {
    id: "rev_10",
    reviewerName: "Aisha Bello",
    rating: 3,
    reviewText:
      "Portions felt small for the price point but the flavors were on point. Might be back if I'm craving something specific.",
    reviewedAt: "2026-08-15T20:00:00Z",
    classification: "auto_reply_candidate",
    escalationReason: null,
    status: "responded",
    replyDrafts: [
      {
        id: "rev_10_a",
        label: "A",
        content:
          "Aisha, thank you for the honest feedback — glad the flavors came through. We'll take a look at our portion sizing relative to price. Hope you'll give us another shot.",
        originalContent:
          "Aisha, thank you for the honest feedback — glad the flavors came through. We'll take a look at our portion sizing relative to price. Hope you'll give us another shot.",
        status: "approved",
        promptId: "prompt_neutral",
        promptVersion: 1,
        createdAt: "2026-08-15T20:05:00Z",
        decidedAt: "2026-08-16T09:30:00Z",
      },
      {
        id: "rev_10_b",
        label: "B",
        content:
          "Thanks, Aisha! Really appreciate you calling out the flavors. We hear you on portion size for the price and will pass that along to the kitchen.",
        originalContent:
          "Thanks, Aisha! Really appreciate you calling out the flavors. We hear you on portion size for the price and will pass that along to the kitchen.",
        status: "superseded",
        promptId: "prompt_neutral",
        promptVersion: 1,
        createdAt: "2026-08-15T20:05:00Z",
        decidedAt: "2026-08-16T09:30:00Z",
      },
    ],
  },
];
