# Standard "Terraform against a LocalStack-compatible endpoint" recipe — every AWS service call
# is routed to Floci instead of real AWS. Credentials are dummy values; Floci doesn't validate them.
provider "aws" {
  region     = var.aws_region
  access_key = "test"
  secret_key = "test"

  skip_credentials_validation = true
  skip_metadata_api_check     = true
  skip_requesting_account_id  = true
  s3_use_path_style           = true

  endpoints {
    s3             = var.floci_endpoint
    sqs            = var.floci_endpoint
    secretsmanager = var.floci_endpoint
    rds            = var.floci_endpoint
    elasticache    = var.floci_endpoint
    iam            = var.floci_endpoint
    sts            = var.floci_endpoint
  }
}
