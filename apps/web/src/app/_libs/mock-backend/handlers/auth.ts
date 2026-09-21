import { requireTenantUser } from "../auth-context";
import { MOCK_AVATAR_URL } from "../constants";
import { issueTenantSession, mintTenantAccessToken, toAuthenticatedUserDto } from "../mappers";
import { failure, success } from "../response";
import { defineRoutes } from "../router";
import { clearMockSession, getMockIdentity } from "../session-cookie";
import { getDb, type MockUser, nextMockId } from "../state";

interface LoginBody {
  email?: string;
  password?: string;
}
interface SignupBody {
  businessName?: string;
  ownerName?: string;
  email?: string;
  password?: string;
}
interface VerifyEmailBody {
  email?: string;
  otp?: string;
}
interface ChangePasswordBody {
  currentPassword?: string;
  newPassword?: string;
}
interface SetPasswordBody {
  newPassword?: string;
  otp?: string;
}
interface UpdateLocaleBody {
  locale?: "en" | "de";
}
interface CompleteGoogleSignupBody {
  businessName?: string;
}

function findUserByEmail(email: string): MockUser | undefined {
  const normalized = email.trim().toLowerCase();
  return getDb().users.find((user) => user.email.toLowerCase() === normalized);
}

/**
 * Every credential is accepted — this is a public preview with no real backend, not a security
 * boundary. Typing a seeded demo address (see `constants.ts`) signs in as that specific person
 * (useful for trying the member role, or a second tenant); anything else signs in as the default
 * owner, so a visitor who has never seen this file's contents still gets straight into a fully
 * populated dashboard.
 */
function resolveLoginUser(email: string | undefined): MockUser {
  const match = email ? findUserByEmail(email) : undefined;
  return match ?? getDb().users[0]!;
}

export const authRoutes = defineRoutes([
  {
    method: "POST",
    pattern: "/v1/auth/login",
    handler: (ctx) => {
      const body = ctx.body as LoginBody;
      const user = resolveLoginUser(body.email);
      return success(issueTenantSession(user), "Signed in.");
    },
  },
  {
    method: "POST",
    pattern: "/v1/auth/signup",
    handler: (ctx) => {
      const body = ctx.body as SignupBody;
      const email = body.email?.trim() || `demo-${nextMockId("signup")}@example.com`;
      const tenantId = nextMockId("tenant");
      const userId = nextMockId("user");

      getDb().tenants.push({
        id: tenantId,
        name: body.businessName?.trim() || "New Business",
        status: "active",
        activeLocationId: null,
        createdAt: new Date().toISOString(),
      });
      getDb().users.push({
        id: userId,
        tenantId,
        name: body.ownerName?.trim() || "New Owner",
        email,
        role: "owner",
        status: "pending_verification",
        passwordHash: "mock",
        avatarUrl: null,
        locale: null,
        invitedAt: new Date().toISOString(),
        lastLoginAt: null,
      });
      getDb().tenantSettings.push({
        tenantId,
        escalationRatingThreshold: 3,
        autoPostEnabled: false,
        reviewDataRetentionMonths: 24,
        aiReplyCount: 1,
        updatedAt: new Date().toISOString(),
      });

      return success(
        {
          tenantId,
          userId,
          status: "pending_verification",
          message: "Check your email for a verification code.",
        },
        "Account created.",
        201,
      );
    },
  },
  {
    method: "POST",
    pattern: "/v1/auth/verify-email",
    handler: (ctx) => {
      // Any 6-character code is accepted, same reasoning as login — there is nothing behind this
      // to actually verify. A pending signup from this browser is activated for real; anything
      // else (someone landing here without going through signup) falls back to the demo owner
      // rather than a dead-end error.
      const body = ctx.body as VerifyEmailBody;
      const pending = body.email ? findUserByEmail(body.email) : undefined;
      const user = pending ?? getDb().users[0]!;
      if (user.status === "pending_verification") user.status = "active";
      return success(issueTenantSession(user), "Email verified.");
    },
  },
  {
    method: "POST",
    pattern: "/v1/auth/resend-verification-otp",
    handler: () => success({ message: "A new code has been sent." }),
  },
  {
    method: "POST",
    pattern: "/v1/auth/refresh",
    handler: () => {
      // No Authorization header reaches this route (`authOptional: true` on the real call) and no
      // request body either — a real backend reads the httpOnly refresh cookie instead. This mock
      // reads `mock_identity` in its place (see `session-cookie.ts`), set by whichever login route
      // last signed someone in. Failing when it's absent matters, not just for fidelity: a plain
      // `success` here would auto-sign in every fresh visitor the instant any guard called this on
      // mount, and the login screen itself would never be reachable to actually try.
      const identity = getMockIdentity();
      const user = identity ? getDb().users.find((u) => u.id === identity) : undefined;
      if (!user) return failure(401, "No session to refresh.");
      return success(issueTenantSession(user));
    },
  },
  {
    method: "POST",
    pattern: "/v1/auth/logout",
    handler: () => {
      clearMockSession();
      return success(undefined, "Signed out.");
    },
  },
  {
    method: "GET",
    pattern: "/v1/auth/me",
    handler: (ctx) => {
      const auth = requireTenantUser(ctx.auth);
      const user = getDb().users.find((u) => u.id === auth.userId);
      if (!user) return failure(401, "Missing or invalid access token.");
      return success(toAuthenticatedUserDto(user));
    },
  },
  {
    method: "POST",
    pattern: "/v1/auth/change-password",
    handler: (ctx) => {
      const auth = requireTenantUser(ctx.auth);
      const body = ctx.body as ChangePasswordBody;
      if (!body.newPassword) return failure(400, "A new password is required.");
      const user = getDb().users.find((u) => u.id === auth.userId);
      if (!user) return failure(401, "Missing or invalid access token.");
      user.passwordHash = "mock";
      return success(issueTenantSession(user), "Password changed.");
    },
  },
  {
    method: "POST",
    pattern: "/v1/auth/set-password/request-otp",
    handler: () => success({ message: "Verification code sent." }),
  },
  {
    method: "POST",
    pattern: "/v1/auth/set-password",
    handler: (ctx) => {
      const auth = requireTenantUser(ctx.auth);
      const body = ctx.body as SetPasswordBody;
      if (!body.newPassword || !body.otp)
        return failure(400, "A code and a new password are required.");
      const user = getDb().users.find((u) => u.id === auth.userId);
      if (!user) return failure(401, "Missing or invalid access token.");
      user.passwordHash = "mock";
      return success(issueTenantSession(user), "Password set.");
    },
  },
  {
    method: "POST",
    pattern: "/v1/auth/locale",
    handler: (ctx) => {
      const auth = requireTenantUser(ctx.auth);
      const body = ctx.body as UpdateLocaleBody;
      const user = getDb().users.find((u) => u.id === auth.userId);
      if (!user) return failure(401, "Missing or invalid access token.");
      if (body.locale) user.locale = body.locale;
      return success({
        accessToken: mintTenantAccessToken(user),
        expiresIn: 60 * 60 * 12,
        user: toAuthenticatedUserDto(user),
      });
    },
  },
  {
    method: "POST",
    pattern: "/v1/auth/google/complete-signup",
    handler: (ctx) => {
      // `AuthService.startGoogleSignup` sends a fresh visitor straight to the business-name
      // screen with no tenant created yet — same as the real callback, which cannot create one
      // without this. Fabricates a plausible Google identity, since there is no real one behind it.
      const body = ctx.body as CompleteGoogleSignupBody;
      const tenantId = nextMockId("tenant");
      const userId = nextMockId("user");

      getDb().tenants.push({
        id: tenantId,
        name: body.businessName?.trim() || "New Business",
        status: "active",
        activeLocationId: null,
        createdAt: new Date().toISOString(),
      });
      const user: MockUser = {
        id: userId,
        tenantId,
        name: "New Owner",
        email: `demo-google-${userId}@example.com`,
        role: "owner",
        status: "active",
        passwordHash: null,
        avatarUrl: null,
        locale: null,
        invitedAt: new Date().toISOString(),
        lastLoginAt: new Date().toISOString(),
      };
      getDb().users.push(user);
      getDb().tenantSettings.push({
        tenantId,
        escalationRatingThreshold: 3,
        autoPostEnabled: false,
        reviewDataRetentionMonths: 24,
        aiReplyCount: 1,
        updatedAt: new Date().toISOString(),
      });

      return success(issueTenantSession(user));
    },
  },
  {
    method: "POST",
    pattern: "/v1/auth/avatar/authorize",
    handler: (ctx) => {
      requireTenantUser(ctx.auth);
      // Empty `uploadUrl` is the real `noop` storage provider's own shape — `uploadAvatarFile`
      // (unmodified real frontend code) already knows to skip straight to confirm for it. See
      // that function's own doc comment.
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
    pattern: "/v1/auth/avatar/confirm",
    handler: (ctx) => {
      const auth = requireTenantUser(ctx.auth);
      const user = getDb().users.find((u) => u.id === auth.userId);
      if (user) user.avatarUrl = MOCK_AVATAR_URL;
      return success({ avatarUrl: MOCK_AVATAR_URL });
    },
  },
  {
    method: "GET",
    pattern: "/v1/auth/invite/:token",
    handler: () => success({ email: "invitee@example.com" }),
  },
  {
    method: "POST",
    pattern: "/v1/auth/invite/accept",
    handler: () => success(issueTenantSession(getDb().users[1]!)),
  },
]);
