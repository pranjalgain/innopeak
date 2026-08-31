# One JSON secret per app/environment (e.g. nestjs-app/development), matching the "everything
# moves to Secrets Manager" decision. `src/config/secrets-bootstrap.ts` fetches this blob at boot
# and copies every key into `process.env`, so `EnvConfig`/Joi validation downstream is unaffected.
locals {
  # Floci's aws_db_instance.address returns the RDS-backing container's Docker-internal bridge IP
  # (unreachable from a host-run app on Linux Docker Engines), but the app connects from the host
  # — same as POSTGRES_HOST in the default docker-compose.yml stack — so "localhost" plus the
  # actual proxied port (exposed via docker-compose.floci.yml's 7001-7099 range) is what's portable.
  rds_host = "localhost"

  # Floci only populates `configuration_endpoint_address` for this replication group (real AWS
  # populates `primary_endpoint_address` instead when cluster mode is disabled, as here) — fall
  # back so this works against both.
  redis_host = coalesce(
    aws_elasticache_replication_group.app.primary_endpoint_address,
    aws_elasticache_replication_group.app.configuration_endpoint_address
  )

  computed_secrets = {
    DEPLOYMENT_TARGET = "aws"
    FLOCI_ENDPOINT    = var.floci_endpoint

    DATABASE_URL      = "postgresql://${var.db_username}:${var.db_password}@${local.rds_host}:${aws_db_instance.app.port}/${var.db_name}"
    POSTGRES_HOST     = local.rds_host
    POSTGRES_PORT     = tostring(aws_db_instance.app.port)
    POSTGRES_DB       = var.db_name
    POSTGRES_USER     = var.db_username
    POSTGRES_PASSWORD = var.db_password

    REDIS_HOST = local.redis_host
    REDIS_PORT = tostring(aws_elasticache_replication_group.app.port)

    AWS_S3_BUCKET = aws_s3_bucket.media.bucket
    AWS_S3_REGION = var.aws_region
  }

  # e.g. "dead-letter" -> DEAD_LETTER_QUEUE_URL — matches the naming convention QueuePublisherProvider
  # implementations read (see src/background/providers/sqs-queue.publisher.ts).
  queue_url_secrets = {
    for name in local.queue_names :
    "${upper(replace(name, "-", "_"))}_QUEUE_URL" => aws_sqs_queue.main[name].id
  }

  secret_blob = merge(local.computed_secrets, local.queue_url_secrets, var.app_secrets)
}

# A customer-managed KMS key is intentionally omitted — see README "Terraform security
# exceptions (Floci-only)".
#trivy:ignore:AVD-AWS-0098
resource "aws_secretsmanager_secret" "app" {
  name = "${var.app_name}/${var.environment}"
}

resource "aws_secretsmanager_secret_version" "app" {
  secret_id     = aws_secretsmanager_secret.app.id
  secret_string = jsonencode(local.secret_blob)
}
