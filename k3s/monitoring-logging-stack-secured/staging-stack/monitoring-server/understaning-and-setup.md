# 🚀 Monitoring & Logging Stack – Usage Guide

This stack sets up a **Prometheus + Grafana + Loki + Promtail + Pushgateway + Node Exporter + Jaeger** environment.

The configuration files are already included — you only need to tweak values in `.env` and configs to match your apps.

---

## 1. 🔧 What You Need to Change

### Environment Variables (`.env`)

- **Ports** → Change only if they clash with other services.
- **APP_METRICS_TARGET** → Set to your application’s metrics endpoint, e.g.:
    
    ```
    APP_METRICS_TARGET=my-app:8080
    
    ```
    
- **NODE_EXPORTER_TARGET** → If monitoring the same host, keep as:
    
    ```
    NODE_EXPORTER_TARGET=node-exporter:9100
    
    ```
    
- **GRAFANA_ADMIN_PASSWORD** → Change for security.

---

### Prometheus Config (`monitoring-configs/prometheus/prometheus.yml`)

- Add or remove `scrape_configs` depending on which apps expose `/metrics`.
    
    Example:
    
    ```yaml
    - job_name: 'my-service'
      static_configs:
        - targets: ['my-service:8080']
    
    ```
    

---

### Promtail Config (`monitoring-configs/promtail/promtail-config.yml`)

- Update log paths to where your apps write logs.
    
    Example:
    
    ```yaml
    scrape_configs:
      - job_name: backend
        static_configs:
          - targets: [localhost]
            labels:
              job: backend
              __path__: /var/log/backend/*.log
    
    ```
    

---

### Grafana Dashboards

- Place JSON dashboards into:
    
    ```
    monitoring-logging-configs/grafana/provisioning/dashboards
    
    ```
    
- They will be auto-loaded by Grafana.

---

## 2. ▶️ Running the Stack

Start services in the background:

```bash
docker-compose up -d

```

Check running containers:

```bash
docker ps

```

View logs for a service (e.g., Grafana):

```bash
docker-compose logs -f grafana

```

---

## 3. ⏹️ Stopping the Stack

Stop containers but keep data:

```bash
docker-compose down

```

Stop and remove **containers + volumes** (fresh start):

```bash
docker-compose down -v

```

---

##

# 📄 Monitoring & Logging Stack (Docker Compose Template)

This stack runs a full observability setup using **Prometheus**, **Grafana**, **Node Exporter**, **Loki**, **Promtail**, **Pushgateway**, and **Jaeger**.

---

## 1. Docker Compose File

Save as `docker-compose.yml`:

```yaml
version: '3.6'

services:
  prometheus:
    image: prom/prometheus:latest
    container_name: prometheus
    env_file:
      - .env
    ports:
      - '${PROMETHEUS_PORT}:9090'
    volumes:
      - ./monitoring-configs/prometheus/prometheus.yml:/etc/prometheus/prometheus.yml
      - prometheus-data:/etc/prometheus
    command:
      - '--storage.tsdb.retention.time=15d'
      - '--config.file=/etc/prometheus/prometheus.yml'
      - '--storage.tsdb.path=/prometheus'
    environment:
      - APP_METRICS_TARGET=${APP_METRICS_TARGET}
      - NODE_EXPORTER_TARGET=${NODE_EXPORTER_TARGET}
    restart: unless-stopped
    networks:
      - monitoring

  grafana:
    image: grafana/grafana:latest
    container_name: grafana
    env_file:
      - .env
    ports:
      - '${GRAFANA_PORT}:3000'
    volumes:
      - ./monitoring-logging-configs/grafana/provisioning:/etc/grafana/provisioning
      - ./monitoring-logging-configs/grafana/provisioning/dashboards:/etc/grafana/provisioning/dashboards
      - ./monitoring-logging-configs/grafana/provisioning/dashboards:/var/lib/grafana/dashboards
      - grafana_data:/var/lib/grafana
    restart: unless-stopped
    environment:
      GF_SECURITY_ADMIN_PASSWORD: ${GRAFANA_ADMIN_PASSWORD}
    networks:
      - monitoring

  node-exporter:
    image: prom/node-exporter:latest
    container_name: node-exporter
    env_file:
      - .env
    ports:
      - '${NODE_EXPORTER_PORT}:9100'
    restart: unless-stopped
    networks:
      - monitoring

  loki:
    image: grafana/loki:2.7.0
    container_name: loki
    env_file:
      - .env
    ports:
      - '${LOKI_PORT}:3100'
    user: '0:0'
    volumes:
      - ./monitoring-configs/loki/loki-config.yml:/etc/loki/local-config.yaml
      - loki_data:/loki-data
    command: -config.file=/etc/loki/local-config.yaml
    restart: unless-stopped
    networks:
      - monitoring

  promtail:
    image: grafana/promtail:latest
    container_name: promtail
    env_file:
      - .env
    ports:
      - '${PROMTAIL_PORT}:9080'
    volumes:
      - /path/to/app1/logs:/app1-logs
      - /path/to/app2/logs:/app2-logs
      - ./monitoring-configs/promtail/promtail-config.yml:/etc/promtail/promtail-config.yml
    command: -config.file=/etc/promtail/promtail-config.yml
    restart: unless-stopped
    networks:
      - monitoring

  pushgateway:
    image: prom/pushgateway:latest
    container_name: pushgateway
    env_file:
      - .env
    ports:
      - '${PUSHGATEWAY_PORT}:9091'
    restart: unless-stopped
    networks:
      - monitoring

  jaeger:
    image: jaegertracing/all-in-one:latest
    container_name: jaeger
    env_file:
      - .env
    ports:
      - "${JAEGER_UI_PORT}:16686"        # UI
      - "${JAEGER_COLLECTOR_PORT}:14268" # HTTP collector
      - "${OTLP_PORT}:4318"              # OTLP endpoint
    networks:
      - monitoring
    restart: unless-stopped

volumes:
  prometheus-data:
  grafana_data:
  loki_data:

networks:
  monitoring:
    driver: bridge

```

---

## 2. Prometheus Config Template

`./monitoring-configs/prometheus/prometheus.yml`

```yaml
global:
  scrape_interval: 30s
  scrape_timeout: 15s
  evaluation_interval: 30s

rule_files:
  - 'rules.yml'
  - 'alerts.yml'

scrape_configs:
  - job_name: 'application'
    metrics_path: '/metrics'
    scheme: http
    scrape_interval: 15s
    scrape_timeout: 10s
    static_configs:
      - targets:
          - '${APP_METRICS_TARGET}'
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance
        regex: '(.*):.*'
        replacement: '${1}'
        action: replace

  - job_name: 'node_exporter'
    metrics_path: '/metrics'
    scheme: http
    scrape_interval: 5s
    static_configs:
      - targets:
          - '${NODE_EXPORTER_TARGET}'
    relabel_configs:
      - source_labels: [__address__]
        target_label: instance
        regex: '(.*):.*'
        replacement: '${1}'
        action: replace

```

---

## 3. Loki Config Template

`./monitoring-configs/loki/loki-config.yml`

```yaml
auth_enabled: false

server:
  http_listen_port: 3100
  log_level: info

ingester:
  lifecycler:
    ring:
      kvstore:
        store: inmemory
      replication_factor: 1
  chunk_idle_period: 5m
  chunk_retain_period: 30s
  max_transfer_retries: 0

schema_config:
  configs:
    - from: 2020-10-24
      store: boltdb-shipper
      object_store: filesystem
      schema: v11
      index:
        prefix: index_
        period: 24h

storage_config:
  boltdb_shipper:
    active_index_directory: /loki-data/index
    cache_location: /loki-data/boltdb-cache
    shared_store: filesystem
  filesystem:
    directory: /loki-data/chunks

compactor:
  working_directory: /loki-data/boltdb-cache
  shared_store: filesystem

limits_config:
  enforce_metric_name: false
  reject_old_samples: true
  max_streams_per_user: 10000
  reject_old_samples_max_age: 168h

```

---

## 4. Promtail Config Template

`./monitoring-configs/promtail/promtail-config.yml`

```yaml
server:
  http_listen_port: 9080
  grpc_listen_port: 0

positions:
  filename: /tmp/positions.yaml

clients:
  - url: http://loki:3100/loki/api/v1/push

scrape_configs:
  - job_name: app1
    static_configs:
      - targets: [localhost]
        labels:
          job: app1
          __path__: /app1-logs/*.log

  - job_name: app2
    static_configs:
      - targets: [localhost]
        labels:
          job: app2
          __path__: /app2-logs/*.log

```

---

## 5. Environment Variables (`.env`)

```
PROMETHEUS_PORT=9090
GRAFANA_PORT=3000
NODE_EXPORTER_PORT=9100
LOKI_PORT=3100
PROMTAIL_PORT=9080
PUSHGATEWAY_PORT=9091
JAEGER_UI_PORT=16686
JAEGER_COLLECTOR_PORT=14268
OTLP_PORT=4318

APP_METRICS_TARGET=app:8080
NODE_EXPORTER_TARGET=node-exporter:9100

GRAFANA_ADMIN_PASSWORD=admin

```