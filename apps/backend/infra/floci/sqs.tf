# One queue per QueueName (src/background/constants/job.constant.ts) that has a live consumer —
# QueueName.MEDIA_UPLOAD is excluded, it's already dead code with no processor. Each queue gets
# its own transport-level DLQ via native SQS redrive; this is separate from (and in addition to)
# the application-level DEAD_LETTER queue's own dashboard-visibility DLQ.
locals {
  queue_names = ["email", "notification", "webhook", "dead-letter", "cron"]
}

# SQS server-side encryption intentionally omitted — see README "Terraform security exceptions
# (Floci-only)".
#trivy:ignore:AVD-AWS-0096
resource "aws_sqs_queue" "dlq" {
  for_each = toset(local.queue_names)

  name                      = "${var.app_name}-${each.key}-dlq"
  message_retention_seconds = 1209600 # 14 days
}

# SQS server-side encryption intentionally omitted — see README "Terraform security exceptions
# (Floci-only)".
#trivy:ignore:AVD-AWS-0096
resource "aws_sqs_queue" "main" {
  for_each = toset(local.queue_names)

  name                       = "${var.app_name}-${each.key}"
  visibility_timeout_seconds = 60

  redrive_policy = jsonencode({
    deadLetterTargetArn = aws_sqs_queue.dlq[each.key].arn
    maxReceiveCount     = 3
  })
}
