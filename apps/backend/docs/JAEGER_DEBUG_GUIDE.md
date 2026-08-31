# Jaeger Debug Guide - Service Name Issue

## Problem

Traces are being generated but showing as `jaeger-all-in-one` instead of `nestjs-app` in Jaeger UI.

## Solution Applied

### 1. Fixed OTLP Endpoint

- **Before**: `http://jaeger:4318/v1/traces` (only accessible from Docker network)
- **After**: `http://localhost:4318/v1/traces` (accessible from host)

### 2. Enhanced Resource Configuration

- Added explicit service name and version to OpenTelemetry resources
- Ensured proper service identification in traces

### 3. Updated Tracing Interceptor

- Added `service.instance.id` attribute
- Improved service name consistency

## Testing Steps

### Step 1: Verify Connectivity

```bash
# Run the connectivity test
./test-jaeger-connectivity.sh
```

### Step 2: Check Jaeger UI

1. **Open**: <http://localhost:16686>
2. **Wait**: 30-60 seconds for traces to appear
3. **Look for**: Service dropdown should show `nestjs-app`
4. **If not visible**: Refresh the page

### Step 3: Generate Fresh Traces

```bash
# Make API calls to generate new traces
curl http://localhost:3000/health
curl http://localhost:3000/tracing/test
curl -X POST http://localhost:3000/tracing/custom \
  -H "Content-Type: application/json" \
  -d '{"operation": "debug-test", "duration": 1000}'
```

## Troubleshooting

### If you still see `jaeger-all-in-one`:

1. **Check Application Logs**

   ```bash
   # Look for OpenTelemetry initialization logs
   ps aux | grep "pnpm start:dev" | grep -v grep
   # Check the logs for any OpenTelemetry errors
   ```

2. **Verify Environment Variables**

   ```bash
   # Check if service name is set correctly
   grep OTEL_SERVICE_NAME .env
   ```

3. **Test OTLP Endpoint Directly**

   ```bash
   # Test if traces are being sent
   curl -X POST http://localhost:4318/v1/traces \
     -H "Content-Type: application/x-protobuf" \
     --data-binary @/dev/null
   ```

4. **Check Jaeger Container Logs**

   ```bash
   # Look for any errors in Jaeger
   docker logs jaeger
   ```

### If traces don't appear at all:

1. **Restart Jaeger Container**

   ```bash
   docker restart jaeger
   ```

2. **Check Port Mappings**

   ```bash
   # Verify ports are correctly mapped
   docker ps | grep jaeger
   ```

3. **Test Jaeger UI Directly**

   ```bash
   # Check if Jaeger UI is accessible
   curl http://localhost:16686
   ```

## Expected Results

### In Jaeger UI, you should see:

- **Service Name**: `nestjs-app` (not `jaeger-all-in-one`)
- **Operations**:
  - `GET /health`
  - `GET /metrics`
  - `GET /tracing/test`
  - `POST /tracing/custom`
- **Traces**: Multiple traces with proper timing and attributes

### Trace Attributes should include:

- `service.name`: `nestjs-app`
- `service.version`: `1.0.0`
- `http.method`: GET, POST, etc.
- `http.url`: Request URL
- `http.status_code`: Response status
- `http.response_time_ms`: Duration

## Quick Fix Commands

If you're still having issues, run these commands:

```bash
# 1. Restart the application
pkill -f "pnpm start:dev"
pnpm start:dev

# 2. Wait for startup
sleep 15

# 3. Generate test traces
curl http://localhost:3000/health
curl http://localhost:3000/tracing/test

# 4. Check Jaeger UI
open http://localhost:16686
```

## Configuration Summary

### Current Working Configuration:

- **OTLP Endpoint**: `http://localhost:4318/v1/traces`
- **Service Name**: `nestjs-app`
- **Jaeger UI**: `http://localhost:16686`
- **Port Mappings**: 4318 (OTLP), 16686 (UI)

### Key Files Modified:

- `src/otel/otel.service.ts` - Fixed OTLP endpoint and resource configuration
- `src/interceptors/tracing.interceptor.ts` - Enhanced service attributes

## Success Indicators

You'll know it's working when:

1. ✅ Jaeger UI shows `nestjs-app` in the service dropdown
2. ✅ Traces appear with proper timing and attributes
3. ✅ No OpenTelemetry errors in application logs
4. ✅ OTLP endpoint is accessible from host

---

> [!TIP]
> If you're still seeing issues, please share:
>
> 1. What you see in the Jaeger UI service dropdown
> 2. Any errors in the application logs
> 3. The output of `./test-jaeger-connectivity.sh`
