# One queue per QueueName (src/background/constants/job.constant.ts). Keep this list in sync with
# that enum — `notification` and `webhook` were left here after those queues were deleted from the
# codebase, which provisioned two queues nothing ever read. Each queue gets
# its own transport-level DLQ via native SQS redrive; this is separate from (and in addition to)
# the application-level DEAD_LETTER queue's own dashboard-visibility DLQ.
#
# `review-sync` is deliberately absent — it runs on BullMQ in every environment, with no SQS
# consumer at all (see ReviewSyncQueueModule's own doc comment). `review-post` is the opposite:
# it follows the full isAws-ternary template (ReviewPostSqsConsumer exists), the same as `email`,
# so it needs a provisioned queue here.
locals {
  queue_names = ["email", "dead-letter", "cron", "review-post"]
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
