# Promtail Logging Flow - Complete Guide

## Overview

Promtail is a log aggregation agent that collects logs from your NestJS application and sends them to Loki for storage and Grafana for visualization.

---

## Complete Logging Flow

```mermaid
flowchart LR
    App["NestJS App\nWrites logs to /logs/*.log"] --> Promtail["Promtail\nCollects & forwards logs"]
    Promtail --> Loki["Loki\nStores & indexes logs"]
    Loki --> Grafana["Grafana\nVisualizes logs in dashboards"]
```

---

## Component Details

### 1. NestJS Application (Log Source)

- **Log Location**: `/logs/application-YYYY-MM-DD.log`
- **Log Format**: JSON with structured data
- **Log Levels**: info, warn, error, debug
- **Example Log Entry**:

  ```json
  {
    "level": "info",
    "timestamp": "2025-09-22T11:30:59.488Z",
    "message": "Health check completed",
    "context": "HealthController",
    "traceId": "abc123"
  }
  ```

### 2. Promtail (Log Collector)

- **Configuration**: `promtail-config.yml`
- **Watches**: `/logs/*.log` directory
- **Sends to**: `http://loki:3100/loki/api/v1/push`
- **Port**: 9080 (for monitoring)
- **Status**: ✅ Running and collecting logs

### 3. Loki (Log Storage)

- **Configuration**: `loki-config.dev.yml`
- **Storage**: Filesystem-based (development)
- **API Port**: 3100
- **Retention**: 7 days (configurable)
- **Status**: ✅ Running and receiving logs

### 4. Grafana (Log Visualization)

- **Web UI**: <http://localhost:3001>
- **Username**: admin
- **Password**: admin
- **Data Source**: Loki (configured)
- **Status**: ✅ Running and accessible

---

## Testing the Logging Flow

### Step 1: Generate Logs

```bash
# Make API calls to generate logs
curl http://localhost:3000/health
curl http://localhost:3000/metrics
curl http://localhost:3000/tracing/test

# Check if logs are being written
tail -f logs/application-$(date +%Y-%m-%d).log
```

### Step 2: Verify Promtail Collection

```bash
# Check Promtail logs
docker logs promtail --tail 10

# Check Promtail targets
curl http://localhost:9080/targets
```

### Step 3: Check Loki Storage

```bash
# Check Loki is receiving logs
curl http://localhost:3100/ready

# Query logs from Loki API
curl "http://localhost:3100/loki/api/v1/query_range?query={job=\"varlogs\"}&start=$(date -u -d '1 hour ago' +%s)000000000&end=$(date -u +%s)000000000"
```

### Step 4: View in Grafana

1. **Open**: <http://localhost:3001>
2. **Login**: admin / admin
3. **Go to**: Explore → Select Loki data source
4. **Query**: `{job="varlogs"}`

---

## Configuration Files

### Promtail Configuration (`promtail-config.yml`)

```yaml
server:
  http_listen_port: 9080

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: system
    static_configs:
      - targets: [localhost]
        labels:
          job: varlogs
          __path__: /logs/*.log
```

### Loki Configuration (`loki-config.dev.yml`)

```yaml
auth_enabled: false
server:
  http_listen_port: 3100
ingester:
  lifecycler:
    ring:
      kvstore:
        store: inmemory
```

---

## Grafana Dashboard Setup

### 1. Add Loki Data Source

1. Go to **Configuration** → **Data Sources**
2. Click **Add data source**
3. Select **Loki**
4. Set URL: `http://loki:3100`
5. Click **Save & Test**

### 2. Create Log Dashboard

1. Go to **Dashboards** → **New Dashboard**
2. Add **Logs** panel
3. Set query: `{job="varlogs"}`
4. Configure time range and filters

### 3. Useful Queries

```logql
# All logs
{job="varlogs"}

# Error logs only
{job="varlogs"} |= "error"

# Health check logs
{job="varlogs"} |= "health"

# Logs from specific time
{job="varlogs"} |= "2025-09-22"
```

---

## Troubleshooting

> [!TIP]
> **No logs in Grafana?** Work through these checks in order:
>
> 1. **Check Promtail status**
>
>    ```bash
>    docker logs promtail
>    ```
>
> 2. **Verify log files**
>
>    ```bash
>    ls -la logs/
>    tail logs/application-$(date +%Y-%m-%d).log
>    ```
>
> 3. **Check Loki connection**
>
>    ```bash
>    curl http://localhost:3100/ready
>    ```
>
> 4. **Verify Grafana data source**
>    - Go to Grafana → Configuration → Data Sources
>    - Test Loki connection

### Common Issues

1. **Promtail not collecting logs**
   - Check file permissions on `/logs` directory
   - Verify Promtail configuration

2. **Loki not receiving logs**
   - Check network connectivity between Promtail and Loki
   - Verify Loki is running and accessible

3. **Grafana not showing logs**
   - Check data source configuration
   - Verify query syntax
   - Check time range selection

---

## Quick Start Commands

```bash
# 1. Check all services
docker ps | grep -E "(promtail|loki|grafana)"

# 2. Generate test logs
curl http://localhost:3000/health

# 3. Check Promtail
docker logs promtail --tail 5

# 4. Open Grafana
open http://localhost:3001

# 5. Query logs
curl "http://localhost:3100/loki/api/v1/query?query={job=\"varlogs\"}"
```

---

## Benefits of This Setup

1. **Centralized Logging**: All logs in one place
2. **Real-time Monitoring**: Live log streaming
3. **Powerful Queries**: LogQL for complex searches
4. **Visualization**: Grafana dashboards
5. **Scalability**: Easy to scale with more services
6. **Cost-effective**: Open source solution

---

## Useful Links

- [Promtail Documentation](https://grafana.com/docs/loki/latest/clients/promtail/)
- [Loki Documentation](https://grafana.com/docs/loki/latest/)
- [LogQL Query Language](https://grafana.com/docs/loki/latest/logql/)
- [Grafana Logs Panel](https://grafana.com/docs/grafana/latest/panels/visualizations/logs/)
