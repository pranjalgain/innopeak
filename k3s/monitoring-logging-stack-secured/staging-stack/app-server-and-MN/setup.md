# 📄 Setup Guide – Promtail & Node Exporter

This stack runs **Promtail** (for log collection) and **Node Exporter** (for system metrics) using Docker Compose.

---

## 1. 🚀 Start Services

From the project root:

```bash
docker-compose up -d
```

This will:

- Start **Node Exporter** on port `9100`
- Start **Promtail** with the config at `promtail/promtail-config.yml`

---

## 2. 🛑 Stop Services

```bash
docker-compose down
```

This stops and removes the containers (but not the images or mounted data).

---

## 3. 🔄 Restart / Apply Config Changes

If you update `promtail-config.yml`, you need to restart the Promtail container for the changes to take effect:

```bash
docker-compose restart promtail
```

Alternatively, bring the stack down and up again:

```bash
docker-compose down
docker-compose up -d
```

---

## 4. ⚙️ Update Config (Promtail)

Promtail reads logs from the mounted directories (`/home/app1/.pm2/logs`, `/home/app2/.pm2/logs`).

You can edit the scrape configs in `promtail/promtail-config.yml`:

```yaml
scrape_configs:
  - job_name: app1
    static_configs:
      - targets:
          - localhost
        labels:
          job: app1
          __path__: /app1-logs/*.log

  - job_name: app2
    static_configs:
      - targets:
          - localhost
        labels:
          job: app2
          __path__: /app2-logs/*.log
```

- `job`: logical name shown in Loki/Grafana
- `__path__`: where logs are located inside the container (mapped from host paths in `docker-compose.yml`)

---

## 5. 📡 Loki Endpoint

Make sure Promtail points to your Loki instance:

```yaml
clients:
  - url: http://<loki-ip>:3100/loki/api/v1/push
```

Replace `<loki-ip>` with the correct Loki host accessible from this server.

---

## 6. 🔍 Verify Logs & Metrics

- Node Exporter: http://localhost:9100/metrics
- Promtail logs:

```bash
docker logs -f promtail
```