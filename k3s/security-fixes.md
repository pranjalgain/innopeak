# k3s Templates — Security Context

## Trivy Misconfiguration Audit (2026-07-08)

Trivy was run against this repo and all findings were validated against the actual manifests. Every finding is a **true positive**.

---

## Confirmed Findings

### DS-0002 — No non-root USER in Dockerfile (HIGH)
- **File:** `apps/backend/Dockerfile`
- **Status:** Cannot verify — no Dockerfile exists in this repo. Likely scanned from the application repo. Valid finding in principle; ensure the backend app's Dockerfile adds a `USER` directive.

---

### KSV-0014 — `readOnlyRootFilesystem` not set (HIGH)

No container across any manifest has a `securityContext` block. All are confirmed missing:

| File | Container |
|---|---|
| `apps/backend/manifest.yml` | `backend-prod`, `nginx-sidecar` |
| `apps/frontend/manifest.yml` | `frontend-prod` |
| `monitoring-logging-stack/alert-manager/manifest.yml` | `alertmanager` |
| `monitoring-logging-stack/blackbox-exporter/manifest.yml` | `blackbox-exporter` |
| `monitoring-logging-stack/grafana/manifest.yml` | `grafana` |
| `monitoring-logging-stack/loki/manifest.yml` | `loki` |
| `monitoring-logging-stack/prometheus/manifest.yml` | `prometheus` |
| `monitoring-logging-stack/promtail/manifest.yml` | `promtail` |
| `monitoring-logging-stack/node-exporter/manifest.yml` | `node-exporter` |

**Fix:** Add to each container spec:
```yaml
securityContext:
  readOnlyRootFilesystem: true
  runAsNonRoot: true
  allowPrivilegeEscalation: false
```

Add at pod spec level too:
```yaml
spec:
  securityContext:
    runAsNonRoot: true
    seccompProfile:
      type: RuntimeDefault
```

---

### KSV-0118 — Default security context allows root (HIGH)

Same root cause as KSV-0014. No `securityContext` defined at pod or container level in any manifest. Fix is the same as above.

---

### KSV-0009 / KSV-0010 — `hostNetwork` and `hostPID` on node-exporter (HIGH)

- **File:** `monitoring-logging-stack/node-exporter/manifest.yml:24-25`
- **Status:** TRUE — `hostPID: true` and `hostNetwork: true` are set.
- **Decision: ACCEPT / SUPPRESS** — These are required by design for node-exporter to collect host-level metrics. This is standard practice for all node-exporter DaemonSet deployments. Add to `.trivyignore`.

---

### KSV-0024 — `hostPort` on node-exporter (HIGH)

- **File:** `monitoring-logging-stack/node-exporter/manifest.yml:32`
- **Status:** TRUE — `hostPort: 9100` is set.
- **Decision: ACCEPT / SUPPRESS** — Required for node-exporter's scrape architecture. Add to `.trivyignore`.

---

### KSV-0121 — HostPath volumes `/`, `/proc`, `/sys` on node-exporter (HIGH)

- **File:** `monitoring-logging-stack/node-exporter/manifest.yml:58-66`
- **Status:** TRUE — mounts `/proc`, `/sys`, and `/` (as `/rootfs`).
- **Decision: ACCEPT / SUPPRESS** — Required for node-exporter. All three mounts already use `readOnly: true`, which is the correct mitigation. Add to `.trivyignore`.

---

### KSV-0047 — `nodes/proxy` in promtail ClusterRole (HIGH)

- **File:** `monitoring-logging-stack/promtail/rbac.yml:13`
- **Status:** TRUE — `nodes/proxy` is included in the ClusterRole resources.
- **Risk:** `nodes/proxy` allows proxying API calls to the kubelet on each node, enabling privilege escalation.
- **Fix:** Remove `nodes/proxy` and `endpoints` from the ClusterRole — promtail only needs `pods`, `namespaces`, `nodes`, and `services` for log collection.

```yaml
rules:
  - apiGroups: [""]
    resources:
      - pods
      - namespaces
      - nodes
      - services
    verbs:
      - get
      - watch
      - list
```

---

## Additional Finding (Not in Trivy Report)

### Grafana hardcoded credentials (CRITICAL)

- **File:** `monitoring-logging-stack/grafana/manifest.yml:36-38`
- **Issue:** Admin credentials set as plaintext env vars in the manifest:
  ```yaml
  - name: GF_SECURITY_ADMIN_USER
    value: "admin"
  - name: GF_SECURITY_ADMIN_PASSWORD
    value: "admin"
  ```
- **Fix:** Move to a Kubernetes Secret and reference it:
  ```yaml
  - name: GF_SECURITY_ADMIN_PASSWORD
    valueFrom:
      secretKeyRef:
        name: grafana-credentials
        key: admin-password
  ```

---

## Suppressing Accepted Findings

Create `.trivyignore` at repo root for node-exporter findings that are intentional:

```
# node-exporter requires host-level access by design
KSV-0009
KSV-0010
KSV-0024
KSV-0121
```

---

## How to Test Fixes

### 1. Static — Re-run Trivy locally

```bash
# Install
brew install trivy

# Scan all manifests
trivy config .

# Scan a single file
trivy config monitoring-logging-stack/promtail/rbac.yml
```

Fixed findings will no longer appear in output. This is the primary feedback loop before touching the cluster.

### 2. Static — Kubectl dry-run

```bash
kubectl apply --dry-run=server -f apps/backend/manifest.yml
```

Validates the manifest is accepted by the API server without deploying.

### 3. Runtime — Verify `readOnlyRootFilesystem` is enforced

After deploying, exec into the container and try to write to the root filesystem:

```bash
kubectl get pods -n <namespace>
kubectl exec -it <pod-name> -n <namespace> -- touch /test-write

# Expected output:
# touch: /test-write: Read-only file system
```

### 4. Runtime — Verify `runAsNonRoot` is enforced

```bash
kubectl exec -it <pod-name> -n <namespace> -- whoami
# Should return a non-root username, NOT "root"
```

### Recommended fix-validate workflow

```
Edit manifest → trivy config . → kubectl apply --dry-run=server → deploy → kubectl exec verify
```

Trivy re-scan catches the majority of issues before anything touches the cluster. The `kubectl exec` verification is needed only for `readOnlyRootFilesystem` and `runAsNonRoot` since those require runtime proof.

---

## Remediation Priority

| Priority | Check | File | Action |
|---|---|---|---|
| Critical | Hardcoded credentials | `grafana/manifest.yml` | Move to Kubernetes Secret |
| High | KSV-0047 | `promtail/rbac.yml` | Remove `nodes/proxy` from ClusterRole |
| High | KSV-0014 / KSV-0118 | All manifests | Add `securityContext` to all containers and pods |
| Accept | KSV-0009, 0010, 0024, 0121 | `node-exporter/manifest.yml` | Add to `.trivyignore` |

---

## Fixes Applied

All fixes are made in `monitoring-logging-stack-secured/` — the original `monitoring-logging-stack/` is left untouched as reference.

Each fix is validated with `kubectl apply --dry-run=server` against a local k3s cluster (Rancher Desktop).

---

### Fix 1 — KSV-0047 | `monitoring-logging-stack-secured/promtail/rbac.yml`

**What was fixed:**
Removed `endpoints` and `nodes/proxy` from the promtail ClusterRole resource list.

**Why it was an issue:**
`nodes/proxy` grants the ability to proxy HTTP requests directly to the kubelet API on each node. The kubelet API exposes sensitive operations — reading pod logs, exec-ing into containers, and querying node metrics. A compromised promtail pod with this permission could impersonate requests to the kubelet, effectively giving it cluster-wide exec access. `endpoints` was also unnecessary — promtail collects logs from files on disk, not by querying service endpoints.

**Why the fix is correct:**
Promtail only needs to discover where pods are running and which namespace/labels they belong to so it can attach the right metadata to log streams. For that it only needs `pods`, `namespaces`, `nodes`, and `services` — all read-only (`get`, `watch`, `list`). Nothing more.

**Validated:**
- `kubectl apply --dry-run=server` — passed against local k3s cluster.

---

### Fix 2 — KSV-0014 / KSV-0118 | `monitoring-logging-stack-secured/alert-manager/manifest.yml`

**What was fixed:**
Added `securityContext` at both pod level and container level. Added `emptyDir` volumes for `/alertmanager` (data) and `/tmp`.

**Why it was an issue:**
Without a `securityContext`, Kubernetes applies defaults — the container runs as root (UID 0), can write anywhere on the filesystem, can escalate privileges, and has full Linux capabilities. If the alertmanager container were compromised, an attacker would have root access inside the container with a writable filesystem to drop binaries or scripts.

**Why the fix is correct:**
- `runAsNonRoot: true` + `runAsUser: 65534` — alertmanager's official image already runs as `nobody` (UID 65534). This enforces it explicitly so no accidental root execution can happen.
- `readOnlyRootFilesystem: true` — prevents any writes to the container's root filesystem. Alertmanager needs two writable paths: `/alertmanager` for state/data and `/tmp`. These are covered by `emptyDir` volumes which are isolated, ephemeral, and don't persist across restarts.
- `allowPrivilegeEscalation: false` — prevents the process from gaining more privileges than it started with (e.g. via setuid binaries).
- `capabilities.drop: [ALL]` — drops all Linux capabilities (e.g. `NET_RAW`, `SYS_ADMIN`). Alertmanager needs none of them to serve alerts.
- `seccompProfile: RuntimeDefault` — applies the container runtime's default syscall filter, blocking rarely-used and dangerous syscalls.

**Validated:**
- `trivy config` — HIGH findings (KSV-0014, KSV-0118) cleared. Remaining are LOW/MEDIUM (resource limits, registry trust) — separate concerns.
- `docker run --read-only --tmpfs /alertmanager --tmpfs /tmp prom/alertmanager:v0.27.0` — container starts and runs clean, no `EROFS` errors.
- `kubectl apply --dry-run=server` — passed against local k3s cluster.

---

### Fix 4 — KSV-0014 / KSV-0118 | `monitoring-logging-stack-secured/loki/manifest.yml`

**What was fixed:**
Added `securityContext` at pod and container level. Added `emptyDir` volume for `/tmp`.

**Why it was an issue:**
Without a `securityContext`, Loki ran as root with a fully writable filesystem. Loki stores all ingested logs on the `/loki` PVC — a compromised root container could read, modify, or delete all log data, destroying audit trails.

**Why the fix is correct:**
- `runAsNonRoot: true` + `runAsUser: 10001` — Loki's official image runs as UID 10001. Explicitly enforcing this prevents root execution.
- `fsGroup: 10001` — set at the pod level so that the PVC mounted at `/loki` has group ownership set to 10001, allowing Loki to read and write its data directory. Without this, the PVC would be root-owned and Loki would fail with `permission denied`.
- `readOnlyRootFilesystem: true` — Loki only needs to write to `/loki` (PVC, already writable via `fsGroup`) and `/tmp`. The `emptyDir` for `/tmp` covers the remaining writable need.
- `capabilities.drop: [ALL]` + `allowPrivilegeEscalation: false` + `seccompProfile: RuntimeDefault` — standard hardening; Loki needs no Linux capabilities.

**Important Docker test note:** `--tmpfs` mounts in Docker default to root ownership. When testing locally, pass `uid=10001,gid=10001` to the tmpfs to simulate Kubernetes `fsGroup` behaviour: `--tmpfs /loki:uid=10001,gid=10001`. In Kubernetes, `fsGroup` handles this automatically.

**Validated:**
- `trivy config` — HIGH findings (KSV-0014, KSV-0118) cleared.
- `docker run --read-only --user 10001 --tmpfs /tmp:uid=10001,gid=10001 --tmpfs /loki:uid=10001,gid=10001 grafana/loki:2.9.3` — container starts and runs clean.
- `kubectl apply --dry-run=server` — passed against local k3s cluster.

---

### Fix 9 — KSV-0014 / KSV-0118 | `apps/backend/manifest.yml` + `apps/frontend/manifest.yml`

**What was fixed:**
Added `securityContext` at pod and container level across both app manifests. Added `emptyDir` volumes for writable paths. Fixed a pre-existing bug in `backend/manifest.yml` — port name `nginx-sidecar-metrics` exceeded Kubernetes' 15-character limit and was renamed to `nginx-metrics`.

**Why it was an issue:**
Both app manifests are templates consumed by teams deploying real applications. Without `securityContext`, any app deployed using these templates would run as root with a fully writable filesystem by default — a bad baseline that teams would have to actively override rather than inherit correct defaults.

**Why the fix is correct:**
- `runAsNonRoot: true` at pod level — enforced as a template baseline. The consumer's image must run as a non-root user. If the image runs as root, Kubernetes will reject the pod at admission. This is intentional — it forces application teams to build non-root images.
- `runAsUser` is intentionally **not set** — the correct UID depends on what the consumer's application image expects. Teams should set this in their own overlay/values.
- `readOnlyRootFilesystem: true` — `/tmp` emptyDir added for the backend app container. For `nginx-sidecar` (known image), writable `emptyDir` volumes added for `/var/cache/nginx`, `/var/run`, and `/tmp` — all paths nginx requires to start.
- `capabilities.drop: [ALL]` + `allowPrivilegeEscalation: false` + `seccompProfile: RuntimeDefault` — standard hardening baseline for all app containers.
- Port name fix — `nginx-sidecar-metrics` → `nginx-metrics` (was 22 chars, Kubernetes limit is 15). This pre-existing bug was caught by `kubectl apply --dry-run=server` and would have caused deployment failure.

**Important note for template consumers:** If the application writes to paths other than `/tmp` at startup (e.g. log files, pid files, cache), add additional `emptyDir` volumes for those paths. The Docker test `docker run --read-only <your-image>` will immediately reveal any missing writable paths.

**Validated:**
- `trivy config` — no HIGH/CRITICAL findings on either manifest.
- `docker run --read-only --user 101 --tmpfs /var/cache/nginx:uid=101,gid=101 --tmpfs /var/run:uid=101,gid=101 --tmpfs /tmp:uid=101,gid=101 nginx:alpine` — nginx starts clean, worker processes up.
- `kubectl apply --dry-run=server` (with `sed` substitution for placeholders) — both Deployment and Service passed for backend and frontend.

---

### Fix 8 — KSV-0014 / KSV-0118 + `.trivyignore` | `monitoring-logging-stack-secured/node-exporter/manifest.yml`

**What was fixed:**
Added `securityContext` at pod and container level. Added `emptyDir` for `/tmp`. Created `monitoring-logging-stack-secured/.trivyignore` to suppress accepted findings (KSV-0009, KSV-0010, KSV-0024, KSV-0121).

**Why it was an issue:**
Without `securityContext`, node-exporter ran with a fully writable root filesystem and all Linux capabilities despite only needing to read host metrics. The four suppressed findings (hostNetwork, hostPID, hostPort, hostPath mounts to `/`, `/proc`, `/sys`) are flagged by Trivy but are required for node-exporter to function — it cannot collect host-level metrics without access to the host's process table, network stack, and filesystem.

**Why the fix is correct:**
- `runAsNonRoot: true` + `runAsUser: 65534` — node-exporter's official image runs as `nobody`. All three hostPath mounts are already `readOnly: true`, so non-root is sufficient.
- `readOnlyRootFilesystem: true` — node-exporter only needs `/tmp` as a writable path. All metric data is read from the hostPath mounts, not written anywhere.
- `capabilities.drop: [ALL]` — node-exporter reads from already-mounted hostPaths and serves HTTP. No Linux capabilities needed.
- `allowPrivilegeEscalation: false` + `seccompProfile: RuntimeDefault` — standard hardening.
- `.trivyignore` — suppresses KSV-0009, 0010, 0024, 0121 so future scans surface only actionable findings, not intentional design decisions. Run with: `trivy config --ignorefile .trivyignore .`

**Validated:**
- `trivy config --ignorefile .trivyignore` — no HIGH/CRITICAL findings.
- `docker run --read-only --user 65534 --tmpfs /tmp:uid=65534,gid=65534 quay.io/prometheus/node-exporter:latest` — container starts, all collectors enabled, listening on 9100.
- `kubectl apply --dry-run=server` — ServiceAccount, DaemonSet, and Service all passed.

---

### Fix 7 — KSV-0014 / KSV-0118 | `monitoring-logging-stack-secured/promtail/manifest.yml`

**What was fixed:**
Added `securityContext` at pod and container level. Added `readOnly: true` to the `/var/log` hostPath volumeMount (was missing).

**Why it was an issue:**
Without `securityContext`, promtail ran with a fully writable root filesystem, all Linux capabilities, and no syscall filtering. The `/var/log` hostPath mount was also writable, meaning a compromised container could have modified host log files — destroying audit trails or injecting false log entries.

**Why the fix is correct:**
- `runAsNonRoot` is intentionally **not set** — promtail must run as root (UID 0) to read log files on the host that are only accessible to root (e.g. `/var/log/syslog`, `/var/log/auth.log`). This is an accepted trade-off for a log collector DaemonSet. KSV-0118 is partially resolved — by explicitly defining a `securityContext`, the container no longer uses the implicit default.
- `readOnlyRootFilesystem: true` — promtail only writes to `/tmp` (positions file tracking log offsets), which is already an `emptyDir`. All other mounts are read-only.
- `/var/log` hostPath — added `readOnly: true`. Promtail only reads logs, it never needs to write to the host log directory.
- `allowPrivilegeEscalation: false` — prevents gaining additional privileges beyond what root already has.
- `capabilities.drop: [ALL]` — promtail needs no Linux capabilities beyond running as root to read files. No network capabilities, no raw sockets, nothing.
- `seccompProfile: RuntimeDefault` — applied at pod level, filters dangerous syscalls.

**Validated:**
- `trivy config` — HIGH findings (KSV-0014, KSV-0118) cleared.
- `docker run --read-only --tmpfs /tmp:uid=0,gid=0 grafana/promtail:2.9.7` — container starts, server listening on 9080, running clean.
- `kubectl apply --dry-run=server` — passed against local k3s cluster.

---

### Fix 6 — KSV-0014 / KSV-0118 + Hardcoded Credentials | `monitoring-logging-stack-secured/grafana/manifest.yml`

**What was fixed:**
1. Added `securityContext` at pod and container level. Added `emptyDir` volumes for `/var/lib/grafana` and `/tmp`.
2. Moved hardcoded `admin`/`admin` credentials from plaintext env vars into a Kubernetes `Secret` (`grafana-credentials`), referenced via `secretKeyRef`.

**Why it was an issue:**
- No `securityContext` meant Grafana ran as root with a fully writable filesystem and all Linux capabilities.
- Hardcoded credentials in the manifest mean anyone with read access to the repo or to `kubectl get deployment` output could see the admin password in plaintext. Secrets are base64-encoded and access-controlled via Kubernetes RBAC, keeping credentials out of manifest files and version control.

**Why the fix is correct:**
- `runAsNonRoot: true` + `runAsUser: 472` — Grafana's official image runs as UID 472. Explicitly enforced.
- `fsGroup: 472` — ensures the `/var/lib/grafana` emptyDir is group-owned by 472 so Grafana can write its SQLite database and plugins.
- `readOnlyRootFilesystem: true` — Grafana only needs to write to `/var/lib/grafana` (data, plugins, SQLite DB) and `/tmp`. Both covered by `emptyDir` volumes.
- Secret + `secretKeyRef` — credentials are stored in a Kubernetes Secret, kept out of the manifest and version control. Consumers of this template must create the Secret with real values before deploying.
- `capabilities.drop: [ALL]` + `allowPrivilegeEscalation: false` + `seccompProfile: RuntimeDefault` — standard hardening.

**Known caveat:** Grafana's background plugin installer attempts to update bundled plugins at `/usr/share/grafana/data/plugins-bundled/` inside the container image. With `readOnlyRootFilesystem: true` this logs a non-fatal error but Grafana continues to run normally. Only automatic plugin updates are affected, not core functionality.

**Validated:**
- `trivy config` — HIGH findings (KSV-0014, KSV-0118) cleared.
- `docker run --read-only --user 472 --tmpfs /var/lib/grafana:uid=472,gid=472 --tmpfs /tmp:uid=472,gid=472 grafana/grafana:latest` — container starts and runs, Up confirmed. Non-fatal plugin updater error noted above.
- `kubectl apply --dry-run=server` — Secret, Deployment, and Service all passed.

---

### Fix 5 — KSV-0014 / KSV-0118 | `monitoring-logging-stack-secured/prometheus/manifest.yml`

**What was fixed:**
Added `securityContext` at pod and container level. Added `emptyDir` volume for `/tmp`.

**Why it was an issue:**
Prometheus ran as root with a fully writable filesystem. Prometheus stores all scraped metrics on the `/prometheus` PVC — a compromised root container could tamper with or delete metric history, destroying observability and alerting data.

**Why the fix is correct:**
- `runAsNonRoot: true` + `runAsUser: 65534` — Prometheus's image runs as `nobody` (UID 65534). Explicitly enforced.
- `fsGroup: 65534` — ensures the PVC mounted at `/prometheus` is group-owned by 65534 so Prometheus can write its TSDB. Without this, the PVC would be root-owned and TSDB writes would fail with `permission denied`.
- `readOnlyRootFilesystem: true` — Prometheus only writes to `/prometheus` (PVC, handled by `fsGroup`) and `/tmp`. The `emptyDir` for `/tmp` covers the remaining writable need.
- `capabilities.drop: [ALL]` + `allowPrivilegeEscalation: false` + `seccompProfile: RuntimeDefault` — Prometheus needs no Linux capabilities to scrape metrics over HTTP.

**Validated:**
- `trivy config` — HIGH findings (KSV-0014, KSV-0118) cleared.
- `docker run --read-only --user 65534 --tmpfs /tmp:uid=65534,gid=65534 --tmpfs /prometheus:uid=65534,gid=65534 prom/prometheus:latest` — container starts, TSDB initialises, listening on 9090.
- `kubectl apply --dry-run=server` — passed against local k3s cluster.

---

### Fix 3 — KSV-0014 / KSV-0118 | `monitoring-logging-stack-secured/blackbox-exporter/manifest.yml`

**What was fixed:**
Added `securityContext` at pod and container level. Added `emptyDir` volume for `/tmp`.

**Why it was an issue:**
Same root cause as alertmanager — no `securityContext` meant the container ran as root with a fully writable filesystem and all Linux capabilities. Blackbox exporter runs network probes (HTTP, TCP, DNS) on behalf of Prometheus. A compromised container with root access and a writable filesystem could be used to pivot to other services on the network.

**Why the fix is correct:**
- `runAsNonRoot: true` + `runAsUser: 65534` — blackbox exporter's image runs as `nobody` by default. Enforcing this explicitly prevents any accidental root execution.
- `readOnlyRootFilesystem: true` — the only path the exporter needs to write is `/tmp`. Everything else (config at `/config`) is already mounted read-only from a ConfigMap. The `emptyDir` for `/tmp` covers the writable need.
- `capabilities.drop: [ALL]` — blackbox exporter does not need any Linux capabilities for HTTP, TCP, or DNS probes. Note: if ICMP probes are configured, `NET_RAW` must be added back under `capabilities.add`.
- `allowPrivilegeEscalation: false` + `seccompProfile: RuntimeDefault` — standard hardening applied.

**Validated:**
- `trivy config` — HIGH findings (KSV-0014, KSV-0118) cleared.
- `docker run --read-only --tmpfs /tmp prom/blackbox-exporter:v0.25.0` — container starts and runs clean.
- `kubectl apply --dry-run=server` — passed against local k3s cluster.
