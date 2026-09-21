import { requireAdmin } from "../auth-context";
import { MOCK_AVATAR_URL } from "../constants";
import { mintAdminAccessToken, toAdminInviteResponseDto, toAdminProfileDto } from "../mappers";
import { failure, success } from "../response";
import { defineRoutes } from "../router";
import { getDb, nextMockId } from "../state";

interface SendAdminInviteBody {
  email?: string;
}
interface SetAdminStatusBody {
  enabled?: boolean;
}
interface UpdateAdminLocaleBody {
  locale?: "en" | "de";
}
interface UpdatePlatformSettingsBody {
  ssoLoginEnabled?: boolean;
  passwordLoginEnabled?: boolean;
  socialLoginEnabled?: boolean;
  inviteMembersEnabled?: boolean;
}

function findAdmin(adminId: string) {
  return getDb().admins.find((admin) => admin.id === adminId);
}

export const adminSettingsRoutes = defineRoutes([
  {
    method: "GET",
    pattern: "/v1/admin/settings/profile",
    handler: (ctx) => {
      const auth = requireAdmin(ctx.auth);
      const admin = findAdmin(auth.adminId);
      if (!admin) return failure(401, "Missing or invalid access token.");
      return success(toAdminProfileDto(admin));
    },
  },
  {
    method: "POST",
    pattern: "/v1/admin/settings/profile/change-password",
    handler: (ctx) => {
      requireAdmin(ctx.auth);
      return success(undefined, "Password changed.");
    },
  },
  {
    method: "POST",
    pattern: "/v1/admin/settings/profile/set-password/request-otp",
    handler: (ctx) => {
      requireAdmin(ctx.auth);
      return success({ message: "Verification code sent." });
    },
  },
  {
    method: "POST",
    pattern: "/v1/admin/settings/profile/set-password",
    handler: (ctx) => {
      const auth = requireAdmin(ctx.auth);
      const admin = findAdmin(auth.adminId);
      if (admin) admin.passwordHash = "mock";
      return success({ message: "Password set." });
    },
  },
  {
    method: "PATCH",
    pattern: "/v1/admin/settings/profile/locale",
    handler: (ctx) => {
      const auth = requireAdmin(ctx.auth);
      const admin = findAdmin(auth.adminId);
      if (!admin) return failure(401, "Missing or invalid access token.");
      const body = ctx.body as UpdateAdminLocaleBody;
      if (body.locale) admin.locale = body.locale;
      return success({
        accessToken: mintAdminAccessToken(admin),
        expiresIn: 60 * 60 * 12,
        admin: toAdminProfileDto(admin),
      });
    },
  },
  {
    method: "POST",
    pattern: "/v1/admin/settings/profile/avatar/authorize",
    handler: (ctx) => {
      requireAdmin(ctx.auth);
      return success({
        provider: "noop",
        uploadUrl: "",
        formFields: {},
        providerAssetId: "mock-avatar",
      });
    },
  },
  {
    method: "POST",
    pattern: "/v1/admin/settings/profile/avatar/confirm",
    handler: (ctx) => {
      const auth = requireAdmin(ctx.auth);
      const admin = findAdmin(auth.adminId);
      if (admin) admin.avatarUrl = MOCK_AVATAR_URL;
      return success({ avatarUrl: MOCK_AVATAR_URL });
    },
  },
  {
    method: "GET",
    pattern: "/v1/admin/settings/invites",
    handler: (ctx) => {
      requireAdmin(ctx.auth);
      return success(getDb().admins.map(toAdminInviteResponseDto));
    },
  },
  {
    method: "POST",
    pattern: "/v1/admin/settings/invites",
    handler: (ctx) => {
      requireAdmin(ctx.auth);
      const body = ctx.body as SendAdminInviteBody;
      const email = body.email?.trim();
      if (!email) return failure(400, "An email address is required.");
      if (getDb().admins.some((admin) => admin.email.toLowerCase() === email.toLowerCase())) {
        return failure(409, "That email already belongs to an admin or has a pending invite.");
      }

      const admin = {
        id: nextMockId("admin"),
        email,
        status: "invited" as const,
        invitedAt: new Date().toISOString(),
        expiresAt: new Date(Date.now() + 1000 * 60 * 60 * 24 * 7).toISOString(),
        isRoot: false,
        passwordHash: null,
        avatarUrl: null,
        locale: null,
      };
      getDb().admins.push(admin);
      return success(toAdminInviteResponseDto(admin), "Invite sent.", 201);
    },
  },
  {
    method: "DELETE",
    pattern: "/v1/admin/settings/invites/:inviteId",
    handler: (ctx) => {
      requireAdmin(ctx.auth);
      const db = getDb();
      const index = db.admins.findIndex(
        (admin) => admin.id === ctx.params.inviteId && admin.status === "invited",
      );
      if (index === -1) return failure(404, "No pending invite with that id.");
      db.admins.splice(index, 1);
      return success(undefined, "Invite revoked.");
    },
  },
  {
    method: "PATCH",
    pattern: "/v1/admin/settings/admins/:adminId/status",
    handler: (ctx) => {
      requireAdmin(ctx.auth);
      const admin = findAdmin(ctx.params.adminId!);
      if (!admin) return failure(404, "No admin with that id.");
      if (admin.isRoot) return failure(400, "The founding platform admin cannot be disabled.");
      const body = ctx.body as SetAdminStatusBody;
      admin.status = body.enabled === false ? "disabled" : "active";
      return success(toAdminInviteResponseDto(admin));
    },
  },
  {
    method: "PATCH",
    pattern: "/v1/admin/settings/platform-config",
    handler: (ctx) => {
      requireAdmin(ctx.auth);
      const body = ctx.body as UpdatePlatformSettingsBody;
      Object.assign(getDb().platformSettings, body);
      return success(getDb().platformSettings);
    },
  },
]);
