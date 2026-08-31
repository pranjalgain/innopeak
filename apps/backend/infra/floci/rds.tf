# Floci's RDS emulation proxies to a real Postgres container it spawns itself — Drizzle/`pg`
# don't need any code change, only a different DATABASE_URL/POSTGRES_HOST.
#
# Backup retention, storage encryption, performance insights, IAM auth, and deletion protection
# intentionally omitted, and `publicly_accessible = true` is required (Floci proxies RDS to a
# host-reachable port; there is no real public internet exposure since this only ever targets
# the local Floci emulator, never real AWS) — see README "Terraform security exceptions
# (Floci-only)".
#trivy:ignore:AVD-AWS-0077 trivy:ignore:AVD-AWS-0080 trivy:ignore:AVD-AWS-0133 trivy:ignore:AVD-AWS-0176 trivy:ignore:AVD-AWS-0177 trivy:ignore:AVD-AWS-0180
resource "aws_db_instance" "app" {
  identifier          = "${var.app_name}-${var.environment}"
  engine              = "postgres"
  engine_version      = "17"
  instance_class      = "db.t3.micro"
  allocated_storage   = 20
  db_name             = var.db_name
  username            = var.db_username
  password            = var.db_password
  port                = 5432
  publicly_accessible = true
  skip_final_snapshot = true
  apply_immediately   = true
}
