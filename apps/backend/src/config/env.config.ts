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

  /**
   * Bearer token Prometheus must send to scrape `/metrics`. Required in production (see `createMetricsGuard`); unset elsewhere
   * leaves the endpoint open for local development.
   */
  @IsOptional()
  @IsString()
  METRICS_TOKEN?: string;

  /** Postgres pool size per process (API and worker each hold their own pool). Default 10. */
  @IsOptional()
  @IsNumber()
  DB_POOL_MAX?: number;

  /** Idle connections are closed after this long. Default 30000. */
  @IsOptional()
  @IsNumber()
  DB_IDLE_TIMEOUT_MS?: number;

  /** How long to wait for a free connection before failing the query. Default 5000. */
  @IsOptional()
  @IsNumber()
  DB_CONNECTION_TIMEOUT_MS?: number;

  /** Server-side cap on one statement. Default 30000. */
  @IsOptional()
  @IsNumber()
  DB_STATEMENT_TIMEOUT_MS?: number;

  /** `true` connects to Postgres over TLS (certificate verified unless `DB_SSL_REJECT_UNAUTHORIZED=false`). */
  @IsOptional()
  @IsIn(['true', 'false'])
  DB_SSL?: string;

  @IsOptional()
  @IsIn(['true', 'false'])
  DB_SSL_REJECT_UNAUTHORIZED?: string;

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
  JWT_SECRET!: string;

  @IsOptional()
  @IsString()
  JWT_REFRESH_SECRET?: string;

  @IsOptional()
  @IsString()
  FRONTEND_URL?: string;

  @IsOptional()
  @IsNumber()
  VERIFY_EMAIL_OTP_TTL_MINUTES?: number;

  /** Reverse proxies in front of the app, so `req.ip` resolves to the real client for per-IP rate limits. Default 0 (trust nothing); see `bootstrap.ts` for why it's a count, not a boolean. */
  @IsOptional()
  @IsNumber()
  TRUST_PROXY_HOPS?: number;

  // Dev-only: fixed signup verification token instead of a random one. Forbidden in production by the Joi schema.
  @IsOptional()
  @IsString()
  DEV_VERIFY_EMAIL_TOKEN?: string;

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

  @IsOptional()
  @IsString()
  MICROSOFT_CLIENT_ID?: string;

  /** The client secret's *value*, not its ID. */
  @IsOptional()
  @IsString()
  MICROSOFT_CLIENT_SECRET?: string;

  /** Must equal a redirect URI registered on the Azure app, e.g. `http://localhost:3002/v1/auth/microsoft/callback`. */
  @IsOptional()
  @IsString()
  MICROSOFT_CALLBACK_URL?: string;

  /** Defaults to `https://login.microsoftonline.com/common` (any organizational directory and personal accounts). Production only accepts a `login.microsoftonline.com` authority. */
  @IsOptional()
  @IsString()
  MICROSOFT_AUTHORITY?: string;

  /**
   * The Entra directory (a GUID) platform admins sign in from. Unset keeps "Continue with Microsoft" off the admin sign-in
   * page: admin sign-in is pinned to one organization, never to `common`.
   */
  @IsOptional()
  @IsString()
  ADMIN_MICROSOFT_TENANT_ID?: string;

  // Separate from GOOGLE_*: sign-in and the review-data grant need different scopes, and sharing one client would let revoking review access break sign-in.
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

  // HMAC key for the OAuth `state` blob; required in production (env-config.module.ts), since a forgeable state lets an attacker graft their Google account onto another tenant.
  @IsOptional()
  @IsString()
  GBP_STATE_SECRET?: string;

  // base64-encoded 32 bytes; encrypts provider refresh tokens at rest in the local credential store.
  @IsOptional()
  @IsString()
  CREDENTIAL_ENCRYPTION_KEY?: string;

  @IsOptional()
  @IsString()
  GITHUB_CLIENT_ID?: string;

  @IsOptional()
  @IsString()
  GITHUB_CLIENT_SECRET?: string;

  @IsOptional()
  @IsString()
  GITHUB_CALLBACK_URL?: string;

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

  /**
   * Deploy-level master switch for email/password sign-in. Off (the default) makes the server report `emailDeliveryAvailable: false`,
   * so password sign-in is not in effect and an admin cannot turn it on, even when provider credentials are present. Set it to `true`
   * only once this deployment actually delivers email. Applied via `=== 'true'` at the call site, not here.
   */
  @IsOptional()
  @IsIn(['true', 'false'])
  EMAIL_DELIVERY_ENABLED?: string;

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

  @IsOptional()
  @IsString()
  FCM_PROJECT_ID?: string;

  @IsOptional()
  @IsString()
  FCM_PRIVATE_KEY?: string;

  @IsOptional()
  @IsString()
  FCM_CLIENT_EMAIL?: string;

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

  @IsOptional()
  @IsString()
  REVIEW_POST_QUEUE_URL?: string;

  /**
   * The single switch for whether billing exists in this deploy (gates `BillingService.createCheckoutSession` and the public
   * `paymentFeatureEnabled` frontends read). Off, plan limits are lifted for every tenant (`BillingEntitlementsService`).
   * Deliberately the only one: billing being wired up is a deploy-time fact.
   * Defaults to disabled (applied via `=== 'true'` at each call site, not here).
   */
  @IsOptional()
  @IsIn(['true', 'false'])
  PAYMENT_FEATURE_ENABLED?: string;

  @IsOptional()
  @IsString()
  STRIPE_SECRET_KEY?: string;

  @IsOptional()
  @IsString()
  STRIPE_WEBHOOK_SECRET?: string;

  /** Paid plan's Stripe Price id, read by `createCheckoutSession`; the source of truth over `billing_plans.stripe_price_id` (seeded NULL), which is only a fallback. */
  @IsOptional()
  @IsString()
  STRIPE_PRICE_ID_PAID?: string;

  /** Selects the `AiProvider`; defaults to `'azure'` (applied via `?? 'azure'` at the call site), the intended production provider (GDPR/`westeurope`). */
  @IsOptional()
  @IsIn(['openrouter', 'azure'])
  AI_PROVIDER?: string;

  /** Read lazily by `OpenRouterAiProvider` on first call, not at boot, so a missing key must not fail startup the way `STRIPE_SECRET_KEY` does. */
  @IsOptional()
  @IsString()
  OPENROUTER_API_KEY?: string;

  /** No default: OpenRouter's model catalog (including which models are free) changes over time,
   *  so a hardcoded fallback would silently go stale. Paste a model slug from
   *  https://openrouter.ai/models directly, e.g. `nvidia/nemotron-3-super-120b-a12b:free`. */
  @IsOptional()
  @IsString()
  OPENROUTER_MODEL?: string;

  /** Base resource endpoint, e.g. `https://<resource>.openai.azure.com`. Read lazily by
   *  `AzureOpenAiProvider` on its first call, same reasoning as `OPENROUTER_API_KEY`. */
  @IsOptional()
  @IsString()
  AZURE_OPENAI_ENDPOINT?: string;

  @IsOptional()
  @IsString()
  AZURE_OPENAI_API_KEY?: string;

  /** The deployment name (not the underlying model name) — Azure routes by deployment. */
  @IsOptional()
  @IsString()
  AZURE_OPENAI_DEPLOYMENT?: string;

  @IsOptional()
  @IsString()
  AZURE_OPENAI_API_VERSION?: string;

  /** Must be one of `ALLOWED_AZURE_OPENAI_REGIONS` (checked at boot and again when the provider builds its client): GDPR keeps Azure OpenAI in the approved EU regions. */
  @IsOptional()
  @IsString()
  AZURE_OPENAI_REGION?: string;

  /**
   * Days between a removal/erasure request and the nightly `ERASURE_PURGE` cron anonymizing the user(s); shared by
   * `TenantMembersService`, `AdminBusinessesService` and `CronService`. Access is revoked immediately; only anonymization waits.
   */
  @IsOptional()
  @IsNumber()
  ERASURE_GRACE_PERIOD_DAYS?: number;
}
