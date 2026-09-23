import { requireOwner } from "../auth-context";
import { failure, success } from "../response";
import { defineRoutes } from "../router";
import { getDb, nextMockId } from "../state";

interface CreateBlocklistTermBody {
  term?: string;
}
interface UpdateNotificationRecipientBody {
  channel?: "email" | "teams" | "both";
  isActive?: boolean;
}
interface UpdateTenantSettingsBody {
  escalationRatingThreshold?: number;
  autoPostEnabled?: boolean;
  reviewDataRetentionMonths?: number | null;
  aiReplyCount?: number;
}
interface InviteMemberBody {
  email?: string;
}

function initialsFor(name: string): string {
  const parts = name.trim().split(/\s+/);
  return (parts[0]?.[0] ?? "") + (parts.length > 1 ? (parts[parts.length - 1]?.[0] ?? "") : "");
}

function findTenantSettings(tenantId: string) {
  const db = getDb();
  let row = db.tenantSettings.find((s) => s.tenantId === tenantId);
  row ??= {
    tenantId,
    escalationRatingThreshold: 3,
    autoPostEnabled: false,
    reviewDataRetentionMonths: 24,
    aiReplyCount: 1,
    updatedAt: new Date().toISOString(),
  };
  return row;
}

export const settingsRoutes = defineRoutes([
  {
    method: "GET",
    pattern: "/v1/settings/blocklist-terms",
    handler: (ctx) => {
      const auth = requireOwner(ctx.auth);
      const items = getDb().blocklistTerms.filter((term) => term.tenantId === auth.tenantId);
      return success({ items, total: items.length });
    },
  },
  {
    method: "POST",
    pattern: "/v1/settings/blocklist-terms",
    handler: (ctx) => {
      const auth = requireOwner(ctx.auth);
      const body = ctx.body as CreateBlocklistTermBody;
      const term = body.term?.trim();
      if (!term) return failure(400, "A term is required.");
      const row = {
        id: nextMockId("block"),
        tenantId: auth.tenantId,
        term,
        createdAt: new Date().toISOString(),
      };
      getDb().blocklistTerms.push(row);
      return success(row, "Term added.", 201);
    },
  },
  {
    method: "DELETE",
    pattern: "/v1/settings/blocklist-terms/:id",
    handler: (ctx) => {
      const auth = requireOwner(ctx.auth);
      const db = getDb();
      const index = db.blocklistTerms.findIndex(
        (term) => term.id === ctx.params.id && term.tenantId === auth.tenantId,
      );
      if (index === -1) return failure(404, "No such term.");
      const [removed] = db.blocklistTerms.splice(index, 1);
      return success({ id: removed!.id, message: "Term removed." });
    },
  },
  {
    method: "GET",
    pattern: "/v1/settings/notification-recipients",
    handler: (ctx) => {
      const auth = requireOwner(ctx.auth);
      const items = getDb()
        .notificationRecipients.filter((recipient) => recipient.tenantId === auth.tenantId)
        .map((recipient) => {
          const user = getDb().users.find((u) => u.id === recipient.userId);
          return {
            id: recipient.id,
            userId: recipient.userId,
            name: user?.name ?? "Unknown",
            initials: initialsFor(user?.name ?? "?"),
            channel: recipient.channel,
            isActive: recipient.isActive,
          };
        });
      return success({ items });
    },
  },
  {
    method: "PATCH",
    pattern: "/v1/settings/notification-recipients/:recipientId",
    handler: (ctx) => {
      const auth = requireOwner(ctx.auth);
      const recipient = getDb().notificationRecipients.find(
        (r) => r.id === ctx.params.recipientId && r.tenantId === auth.tenantId,
      );
      if (!recipient) return failure(404, "No such recipient.");
      const body = ctx.body as UpdateNotificationRecipientBody;
      if (body.channel) recipient.channel = body.channel;
      if (body.isActive !== undefined) recipient.isActive = body.isActive;
      const user = getDb().users.find((u) => u.id === recipient.userId);
      return success({
        id: recipient.id,
        userId: recipient.userId,
        name: user?.name ?? "Unknown",
        initials: initialsFor(user?.name ?? "?"),
        channel: recipient.channel,
        isActive: recipient.isActive,
      });
    },
  },
  {
    method: "GET",
    pattern: "/v1/settings/platform-config",
    handler: () => success(getDb().platformSettings),
  },
  {
    method: "GET",
    pattern: "/v1/settings/members",
    handler: (ctx) => {
      const auth = requireOwner(ctx.auth);
      const members = getDb()
        .users.filter((user) => user.tenantId === auth.tenantId)
        .map((user) => ({
          id: user.id,
          name: user.name,
          email: user.email,
          role: user.role,
          status: user.status,
          invitedAt: user.invitedAt,
        }));
      return success(members);
    },
  },
  {
    method: "POST",
    pattern: "/v1/settings/members",
    handler: (ctx) => {
      const auth = requireOwner(ctx.auth);
      if (!getDb().platformSettings.inviteMembersEnabled) {
        return failure(403, "Inviting members is disabled platform-wide.");
      }
      const body = ctx.body as InviteMemberBody;
      const email = body.email?.trim();
      if (!email) return failure(400, "An email address is required.");
      if (getDb().users.some((user) => user.email.toLowerCase() === email.toLowerCase())) {
        return failure(409, "A pending invite or account already exists for that email.");
      }
      const member = {
        id: nextMockId("user"),
        tenantId: auth.tenantId,
        name: email,
        email,
        role: "member" as const,
        status: "invited" as const,
        passwordHash: null,
        avatarUrl: null,
        locale: null,
        invitedAt: new Date().toISOString(),
        lastLoginAt: null,
      };
      getDb().users.push(member);
      return success(
        {
          id: member.id,
          name: member.name,
          email: member.email,
          role: member.role,
          status: member.status,
          invitedAt: member.invitedAt,
        },
        "Invite sent.",
        201,
      );
    },
  },
  {
    method: "DELETE",
    pattern: "/v1/settings/members/:memberId",
    handler: (ctx) => {
      const auth = requireOwner(ctx.auth);
      const db = getDb();
      const index = db.users.findIndex(
        (user) =>
          user.id === ctx.params.memberId &&
          user.tenantId === auth.tenantId &&
          user.status === "invited",
      );
      if (index === -1) return failure(404, "No pending invite with that id.");
      db.users.splice(index, 1);
      return success(undefined, "Invite revoked.");
    },
  },
  {
    method: "GET",
    pattern: "/v1/settings",
    handler: (ctx) => {
      const auth = requireOwner(ctx.auth);
      const row = findTenantSettings(auth.tenantId);
      return success({ id: row.tenantId, ...row });
    },
  },
  {
    method: "PUT",
    pattern: "/v1/settings",
    handler: (ctx) => {
      const auth = requireOwner(ctx.auth);
      const db = getDb();
      let row = db.tenantSettings.find((s) => s.tenantId === auth.tenantId);
      const body = ctx.body as UpdateTenantSettingsBody;
      if (!row) {
        row = findTenantSettings(auth.tenantId);
        db.tenantSettings.push(row);
      }
      if (body.escalationRatingThreshold !== undefined)
        row.escalationRatingThreshold = body.escalationRatingThreshold;
      if (body.autoPostEnabled !== undefined) row.autoPostEnabled = body.autoPostEnabled;
      if (body.reviewDataRetentionMonths !== undefined)
        row.reviewDataRetentionMonths = body.reviewDataRetentionMonths;
      if (body.aiReplyCount !== undefined) row.aiReplyCount = body.aiReplyCount;
      row.updatedAt = new Date().toISOString();
      return success({ id: row.tenantId, ...row });
    },
  },
]);
