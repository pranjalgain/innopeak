# Floci's ElastiCache emulation proxies to a real Redis container it spawns itself — `ioredis`
# doesn't need any code change, only a different REDIS_HOST/REDIS_PORT.
#
# Redis/Valkey engines are provisioned via CreateReplicationGroup, not CreateCacheCluster (the
# latter is memcached-only) — hence aws_elasticache_replication_group here, even for this
# single-node instance.
#
# Encryption at rest/in-transit intentionally omitted — see README "Terraform security
# exceptions (Floci-only)".
#trivy:ignore:AVD-AWS-0045 trivy:ignore:AVD-AWS-0051
resource "aws_elasticache_replication_group" "app" {
  replication_group_id = "${var.app_name}-${var.environment}"
  description          = "Redis cache for ${var.app_name} (${var.environment})"
  engine               = "redis"
  engine_version       = "7.0"
  node_type            = "cache.t3.micro"
  num_cache_clusters   = 1
  port                 = 6379
  apply_immediately    = true
}
