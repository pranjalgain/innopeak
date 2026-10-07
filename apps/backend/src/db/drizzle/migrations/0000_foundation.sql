-- 'erased' is terminal (set once every user is anonymized); 'suspended' is also the state during
-- the erasure grace period.
CREATE TYPE tenant_status AS ENUM ('pending_activation', 'active', 'suspended', 'erased');
CREATE TYPE tenant_identity_provider AS ENUM ('entra_id', 'google_workspace');
CREATE TYPE user_identity_provider AS ENUM ('entra_id', 'google');
CREATE TYPE user_role AS ENUM ('owner', 'member');
CREATE TYPE user_status AS ENUM ('pending_verification', 'invited', 'active', 'disabled');
-- set_password and delete_account are separate from reset so a code minted for one flow cannot
-- satisfy another.
CREATE TYPE token_purpose AS ENUM ('verify_email', 'invite', 'reset', 'set_password', 'delete_account');
CREATE TYPE platform_admin_status AS ENUM ('invited', 'active', 'disabled');
CREATE TYPE platform_admin_invite_purpose AS ENUM ('invite', 'reset', 'set_password');
CREATE TYPE review_provider AS ENUM ('google');
CREATE TYPE google_connection_status AS ENUM ('active', 'needs_reauth');
CREATE TYPE location_status AS ENUM ('active', 'inactive');
CREATE TYPE sync_health_status AS ENUM ('ok', 'error');
CREATE TYPE review_sentiment AS ENUM ('positive', 'neutral', 'negative');
CREATE TYPE review_classification AS ENUM ('auto_reply_candidate', 'escalated', 'pending_classification');
CREATE TYPE escalation_reason AS ENUM ('low_rating', 'blocklist_match');
CREATE TYPE review_status AS ENUM ('new', 'in_review', 'responded', 'dismissed');
-- imported_reply: the owner's own historical replies pulled in by the onboarding backfill.
CREATE TYPE response_type AS ENUM ('auto_reply_suggestion', 'escalation_snippet', 'imported_reply');
CREATE TYPE response_source AS ENUM ('ai_generated', 'human_edited', 'human_manual', 'imported');
CREATE TYPE response_status AS ENUM ('draft', 'pending_approval', 'approved', 'rejected', 'posted', 'post_failed', 'superseded');
CREATE TYPE notification_type AS ENUM ('escalation');
CREATE TYPE notification_channel_pref AS ENUM ('email', 'teams', 'both');
CREATE TYPE notification_channel AS ENUM ('email', 'teams');
CREATE TYPE notification_status AS ENUM ('pending', 'sent', 'failed');
CREATE TYPE sync_trigger AS ENUM ('scheduled', 'backfill');
CREATE TYPE sync_run_status AS ENUM ('running', 'ok', 'error');
CREATE TYPE user_locale AS ENUM ('en', 'de');
