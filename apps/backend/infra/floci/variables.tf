variable "aws_region" {
  description = "Region passed to every AWS resource (Floci accepts any region — no real AWS account is involved)."
  type        = string
  default     = "us-east-1"
}

variable "environment" {
  description = "Matches NODE_ENV — used to namespace the Secrets Manager secret (nestjs-app/{environment})."
  type        = string
  default     = "development"
}

variable "app_name" {
  description = "Prefix used for every named resource (SQS queues, S3 bucket, IAM role/policy)."
  type        = string
  default     = "nestjs-app"
}

variable "floci_endpoint" {
  description = "Floci's unified AWS-service edge endpoint. Matches FLOCI_ENDPOINT in .env.example."
  type        = string
  default     = "http://localhost:4566"
}

variable "db_name" {
  type    = string
  default = "postgres"
}

variable "db_username" {
  type    = string
  default = "postgres"
}

variable "db_password" {
  type      = string
  default   = "postgres"
  sensitive = true
}

variable "app_secrets" {
  description = <<-EOT
    Opaque application secrets with no Terraform-managed infrastructure counterpart — JWT
    signing keys, OAuth client credentials, third-party API keys, provider-selection flags, etc.
    Merged into the single Secrets Manager JSON blob alongside the computed RDS/ElastiCache/
    SQS/S3 values (see secrets.tf). Populate via terraform.tfvars (gitignored) — copy
    terraform.tfvars.example and fill in real values. Never commit real secrets.
  EOT
  type        = map(string)
  default     = {}
  sensitive   = true
}
