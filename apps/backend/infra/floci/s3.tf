# Public-access-block, versioning, logging, and customer-managed-key encryption intentionally
# omitted (this bucket only ever exists against the local Floci emulator, holds no real data,
# and is destroyed/recreated routinely) — see README "Terraform security exceptions
# (Floci-only)".
#trivy:ignore:AVD-AWS-0086 trivy:ignore:AVD-AWS-0087 trivy:ignore:AVD-AWS-0089 trivy:ignore:AVD-AWS-0090 trivy:ignore:AVD-AWS-0091 trivy:ignore:AVD-AWS-0093 trivy:ignore:AVD-AWS-0094 trivy:ignore:AVD-AWS-0132
resource "aws_s3_bucket" "media" {
  bucket = "${var.app_name}-media-${var.environment}"
}
