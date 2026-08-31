output "database_url" {
  value     = local.computed_secrets.DATABASE_URL
  sensitive = true
}

output "redis_host" {
  value = local.computed_secrets.REDIS_HOST
}

output "media_bucket" {
  value = aws_s3_bucket.media.bucket
}

output "secrets_manager_secret_id" {
  value = aws_secretsmanager_secret.app.name
}

output "queue_urls" {
  value = { for name, q in aws_sqs_queue.main : name => q.id }
}

output "dlq_urls" {
  value = { for name, q in aws_sqs_queue.dlq : name => q.id }
}

output "iam_role_arn" {
  value = aws_iam_role.app.arn
}
