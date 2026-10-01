import { IsBoolean, IsIn, IsNotEmpty, IsNumber, IsOptional, IsString } from 'class-validator';

export class EnvConfig {
  @IsNotEmpty()
  @IsNumber()
  PORT!: number;

  @IsNotEmpty()
  @IsString()
  NODE_ENV!: string;

  @IsNotEmpty()
  @IsString()
  CORS_ORIGINS!: string;

  // OS-provided, not user-configured — used as an OpenTelemetry span attribute fallback.
  @IsOptional()
  @IsString()
  HOSTNAME?: string;

  @IsNotEmpty()
  @IsNumber()
  PROMETHEUS_PORT!: number;

  @IsNotEmpty()
  @IsNumber()
  PROMETHEUS_PUSH_GATEWAY_PORT!: number;

  @IsNotEmpty()
  @IsNumber()
  PROMTAIL_PORT!: number;

  @IsNotEmpty()
  @IsNumber()
  NODE_EXPORTER_PORT!: number;

  @IsNotEmpty()
  @IsString()
  NESTJS_METRICS_TARGET!: string;

  @IsNotEmpty()
  @IsString()
  NODE_EXPORTER_TARGET!: string;

  @IsNotEmpty()
  @IsNumber()
  GRAFANA_PORT!: number;

  @IsNotEmpty()
  @IsString()
  GRAFANA_ADMIN_PASSWORD!: string;

  @IsNotEmpty()
  @IsNumber()
  LOKI_PORT!: number;

  @IsNotEmpty()
  @IsString()
  LOKI_API_TOKEN!: string;

  @IsNotEmpty()
  @IsNumber()
  OTLP_PORT!: number;

  @IsNotEmpty()
  @IsString()
  OTEL_SERVICE_NAME!: string;

  @IsNotEmpty()
  @IsString()
  OTEL_EXPORTER_OTLP_ENDPOINT!: string;

  @IsNotEmpty()
  @IsNumber()
  JAEGER_PORT!: number;

  @IsNotEmpty()
  @IsNumber()
  JAEGER_COLLECTOR_PORT!: number;

  @IsNotEmpty()
  @IsString()
  JAGER_URL!: string;

  @IsNotEmpty()
  @IsString()
  REDIS_HOST!: string;

  @IsNotEmpty()
  @IsNumber()
  REDIS_PORT!: number;

  @IsNotEmpty()
  @IsString()
  REDIS_PASSWORD!: string;

  @IsNotEmpty()
  @IsBoolean()
  REDIS_TLS_ENABLED!: boolean;

  @IsNotEmpty()
  @IsString()
  POSTGRES_DB!: string;

  @IsNotEmpty()
  @IsString()
  POSTGRES_USER!: string;

  @IsNotEmpty()
  @IsString()
  POSTGRES_PASSWORD!: string;

  @IsNotEmpty()
  @IsString()
  POSTGRES_HOST!: string;

  @IsNotEmpty()
  @IsNumber()
  POSTGRES_PORT!: number;

  @IsNotEmpty()
  @IsString()
  DATABASE_URL!: string;

  @IsNotEmpty()
  @IsNumber()
  DEFAULT_PAGE!: number;

  @IsNotEmpty()
  @IsNumber()
  DEFAULT_PAGE_SIZE!: number;

  @IsNotEmpty()
  @IsString()
  GRAFANA_URL!: string;

  @IsNotEmpty()
  @IsString()
  APP_LOGS_URL!: string;

  @IsNotEmpty()
  @IsString()
  DEV_DOCS_URL!: string;

  @IsNotEmpty()
  @IsString()
  SERVICES_HEALTH_URL!: string;

  // ─── JWT ────────────────────────────────────────────────────────────────────

  @IsNotEmpty()
  @IsString()
  JWT_SECRET!: string;

  @IsOptional()
  @IsString()
  JWT_REFRESH_SECRET?: string;

  // ─── Auth (signup / verification) ────────────────────────────────────────

  @IsOptional()
  @IsString()
  FRONTEND_URL?: string;

  @IsOptional()
  @IsNumber()
  VERIFY_EMAIL_OTP_TTL_MINUTES?: number;

  /**
   * Number of reverse proxies in front of this app, so `req.ip` resolves to the real client and
   * the per-IP rate limits key on it. Default 0 (trust nothing) — correct for local dev and for a
   * directly-exposed app; set it to the real hop count behind a load balancer. See `bootstrap.ts`
   * for why this is a count rather than a boolean.
   */
  @IsOptional()
  @IsNumber()
  TRUST_PROXY_HOPS?: number;

  // Dev-only signup bypass: when set, signup's emailed verification token is this fixed value
  // instead of a random one, so it can be exercised without reading a real email. Forbidden in
  // production by the Joi schema below — never valid to set outside local/dev.
  @IsOptional()
  @IsString()
  DEV_VERIFY_EMAIL_TOKEN?: string;

  // ─── Google OAuth ───────────────────────────────────────────────────────────

  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CLIENT_SECRET?: string;

  @IsOptional()
  @IsString()
  GOOGLE_CALLBACK_URL?: string;

  /** HMAC key for the sign-in OAuth `state` blob. Falls back to JWT_SECRET locally. */
  @IsOptional()
  @IsString()
  GOOGLE_AUTH_STATE_SECRET?: string;

  /** Dev-only: skips Google entirely while still routing through the real callback. */
  @IsOptional()
  @IsString()
  DEV_GOOGLE_AUTH_MOCK?: string;

  /** Dev-only: pins the mock's email, so repeated sign-ins resolve to one account. */
  @IsOptional()
  @IsString()
  DEV_GOOGLE_AUTH_MOCK_EMAIL?: string;

  // ─── Google Business Profile (review data — NOT login) ──────────────────────

  // Deliberately separate from GOOGLE_* above. Those back Google *sign-in*; these back the
  // review-data grant, which needs entirely different scopes. Sharing one OAuth client would mean
  // revoking review access also breaks sign-in for every user in the tenant.
  @IsOptional()
  @IsString()
  GBP_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  GBP_CLIENT_SECRET?: string;

  // Must byte-match the redirect URI registered on the Google Cloud project.
  @IsOptional()
  @IsString()
  GBP_CALLBACK_URL?: string;

  // HMAC key for the OAuth `state` blob. Required in production by the manual check in
  // env-config.module.ts — an unsigned/forgeably-signed state lets an attacker graft their Google
  // account onto someone else's tenant.
  @IsOptional()
  @IsString()
  GBP_STATE_SECRET?: string;

  // base64-encoded 32 bytes. Encrypts provider refresh tokens at rest in the local credential
  // store — see LocalRedisCredentialStoreProvider.
  @IsOptional()
  @IsString()
  CREDENTIAL_ENCRYPTION_KEY?: string;

  // Dev-only: swaps the real Google Business Profile client for a fixture-backed one that still
  // round-trips through our own OAuth callback. Forbidden in production by the Joi schema — a
  // mocked business connection must never ship.
  @IsOptional()
  @IsString()
  DEV_GBP_MOCK?: string;

  // Dev-only: forces the mock's provider account id, so ACCOUNT_MISMATCH can be exercised.
  @IsOptional()
  @IsString()
  DEV_GBP_MOCK_ACCOUNT_ID?: string;

  // ─── GitHub OAuth ───────────────────────────────────────────────────────────

  @IsOptional()
  @IsString()
  GITHUB_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  GITHUB_CLIENT_SECRET?: string;

  @IsOptional()
  @IsString()
  GITHUB_CALLBACK_URL?: string;

  // ─── Media ──────────────────────────────────────────────────────────────

  @IsOptional()
  @IsString()
  STORAGE_PROVIDER?: string;

  @IsOptional()
  @IsString()
  AWS_S3_BUCKET?: string;

  @IsOptional()
  @IsString()
  AWS_S3_REGION?: string;

  @IsOptional()
  @IsString()
  CLOUDINARY_CLOUD_NAME?: string;

  @IsOptional()
  @IsString()
  CLOUDINARY_API_KEY?: string;

  @IsOptional()
  @IsString()
  CLOUDINARY_API_SECRET?: string;

  // ─── Email ──────────────────────────────────────────────────────────────

  @IsOptional()
  @IsString()
  EMAIL_PROVIDER?: string;

  @IsOptional()
  @IsString()
  SMTP_HOST?: string;

  @IsOptional()
  @IsNumber()
  SMTP_PORT?: number;

  @IsOptional()
  @IsString()
  SMTP_USER?: string;

  @IsOptional()
  @IsString()
  SMTP_PASSWORD?: string;

  @IsOptional()
  @IsString()
  EMAIL_FROM?: string;

  // ─── SMS (Twilio) ──────────────────────────────────────────────────────────

  @IsOptional()
  @IsString()
  SMS_PROVIDER?: string;

  @IsOptional()
  @IsString()
  TWILIO_ACCOUNT_SID?: string;

  @IsOptional()
  @IsString()
  TWILIO_AUTH_TOKEN?: string;

  @IsOptional()
  @IsString()
  TWILIO_PHONE_NUMBER?: string;

  // ─── SMS (AWS SNS) ─────────────────────────────────────────────────────────

  @IsOptional()
  @IsString()
  AWS_REGION?: string;

  @IsOptional()
  @IsString()
  AWS_ACCESS_KEY_ID?: string;

  @IsOptional()
  @IsString()
  AWS_SECRET_ACCESS_KEY?: string;

  @IsOptional()
  @IsString()
  AWS_SNS_SENDER_ID?: string;

  // ─── FCM (Firebase Cloud Messaging) ──────────────────────────────────────

  @IsOptional()
  @IsString()
  FCM_PROJECT_ID?: string;

  @IsOptional()
  @IsString()
  FCM_PRIVATE_KEY?: string;

  @IsOptional()
  @IsString()
  FCM_CLIENT_EMAIL?: string;

  // ─── Deployment target (Floci/AWS emulation) ─────────────────────────────

  @IsOptional()
  @IsString()
  DEPLOYMENT_TARGET?: string;

  @IsOptional()
  @IsString()
  FLOCI_ENDPOINT?: string;

  @IsOptional()
  @IsNumber()
  FLOCI_PORT?: number;

  @IsOptional()
  @IsString()
  SECRETS_MANAGER_SECRET_ID?: string;

  // ─── SQS queue URLs (DEPLOYMENT_TARGET=aws only — see getQueueUrlEnvKey) ────

  @IsOptional()
  @IsString()
  EMAIL_QUEUE_URL?: string;

  @IsOptional()
  @IsString()
  NOTIFICATION_QUEUE_URL?: string;

  @IsOptional()
  @IsString()
  WEBHOOK_QUEUE_URL?: string;

  @IsOptional()
  @IsString()
  DEAD_LETTER_QUEUE_URL?: string;

  @IsOptional()
  @IsString()
  CRON_QUEUE_URL?: string;

  @IsOptional()
  @IsString()
  REVIEW_SYNC_QUEUE_URL?: string;

  // ─── Billing (Stripe) ─────────────────────────────────────────────────────

  /**
   * The single switch controlling whether billing exists in this deploy at all — read by
   * `BillingService.createCheckoutSession` (gates the upgrade entry point), the public
   * `GET /v1/settings/platform-config` response (`paymentFeatureEnabled`, read by every
   * tenant/admin frontend to decide whether to render anything payment-related: the onboarding
   * Paid-plan card, the tenant Settings Billing tab, the admin Billing nav item/dashboard), and
   * nowhere else.
   *
   * Deliberately the *only* switch — there used to also be an admin-toggleable
   * `platform_settings.billing_enabled` DB column, requiring both to be on for anything to show.
   * That second switch added a state (env on, DB off, or vice versa) nobody actually needed to
   * distinguish: an environment either has billing wired up (real or dummy Stripe keys configured,
   * ready to sell) or it doesn't, and that's a deploy-time fact, not something a platform admin
   * should be flipping at runtime. Collapsing to one flag removes that whole state space along
   * with the toggle UI, the PATCH field, and the extra DB read on every checkout attempt.
   *
   * Defaults to disabled (applied via `=== 'true'` at each call site, not a class-level default
   * here).
   */
  @IsOptional()
  @IsIn(['true', 'false'])
  PAYMENT_FEATURE_ENABLED?: string;

  /** Selects the `PaymentProvider` implementation — same DI-swap shape as `STORAGE_PROVIDER`.
   *  Defaults to `'dummy'` (applied via `?? 'dummy'` at the call site, per this file's own
   *  `ConfigService.get()` convention, not a class-level default here). */
  @IsOptional()
  @IsIn(['dummy', 'stripe'])
  PAYMENT_PROVIDER?: string;

  @IsOptional()
  @IsString()
  STRIPE_SECRET_KEY?: string;

  @IsOptional()
  @IsString()
  STRIPE_WEBHOOK_SECRET?: string;

  /** The Paid plan's real Stripe Price id — read directly by `BillingService.createCheckoutSession`
   *  rather than hardcoded in the migration (`billing_plans.stripe_price_id` is seeded `NULL`;
   *  this env var is the actual source of truth once real Stripe objects exist, with that column
   *  only as a fallback for an operator who prefers to set it there instead). */
  @IsOptional()
  @IsString()
  STRIPE_PRICE_ID_PAID?: string;

  /** Selects the `AiProvider` implementation — same DI-swap shape as `PAYMENT_PROVIDER`.
   *  `'openrouter'` is the only implementation built so far; `'azure'` is reserved for the
   *  Azure OpenAI switch documented in `apps/documentation/docs/backend/ai/overview.md`, not
   *  yet a real branch in `AiModule`'s factory. Defaults to `'openrouter'` (applied via
   *  `?? 'openrouter'` at the call site, not a class-level default here). */
  @IsOptional()
  @IsIn(['openrouter'])
  AI_PROVIDER?: string;

  /** Read lazily by `OpenRouterAiProvider` on its first call, not at boot — this feature isn't
   *  wired into anything load-bearing yet (dry-run testing only, see the module doc), so a missing
   *  key must not fail app startup the way `STRIPE_SECRET_KEY` does for a live payment provider. */
  @IsOptional()
  @IsString()
  OPENROUTER_API_KEY?: string;

  /** No default: OpenRouter's model catalog (including which models are free) changes over time,
   *  so a hardcoded fallback would silently go stale. Paste a model slug from
   *  https://openrouter.ai/models directly, e.g. `nvidia/nemotron-3-super-120b-a12b:free`. */
  @IsOptional()
  @IsString()
  OPENROUTER_MODEL?: string;

  // ─── GDPR erasure (team-member removal / tenant erasure) ─────────────────

  /**
   * Days between a removal/erasure request and the nightly `ERASURE_PURGE` cron job actually
   * anonymizing the affected user(s) — read by `TenantMembersService`/`AdminBusinessesService` (for
   * the "takes effect in N days" message) and by `CronService` (for the purge query itself), so all
   * three share one default rather than duplicating it. Access is revoked the moment the request is
   * made; only the irreversible anonymization step waits out this window.
   */
  @IsOptional()
  @IsNumber()
  ERASURE_GRACE_PERIOD_DAYS?: number;
}
