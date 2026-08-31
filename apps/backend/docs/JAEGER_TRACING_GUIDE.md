# Jaeger Tracing Guide for NestJS Application

## Overview

This guide explains how to use Jaeger distributed tracing with your NestJS application, including how to view traces, understand the database setup, and test tracing functionality.

---

## Jaeger Database & Storage

### Current Setup (Development)

- **Storage Type**: In-memory storage
- **Database**: None (data stored in RAM)
- **Persistence**: Data lost on container restart
- **Performance**: Fast, suitable for development

### Production Setup

- **Storage Options**:
  - **Cassandra**: High performance, scalable
  - **Elasticsearch**: Full-text search capabilities
  - **PostgreSQL**: Simple setup, good for small deployments
- **Persistence**: Data survives container restarts
- **Configuration**: Set via environment variables

### Docker Configuration

```yaml
jaeger:
  image: jaegertracing/all-in-one:latest
  ports:
    - "16686:16686"    # UI
    - "14268:14268"    # HTTP collector
    - "4318:4318"      # OTLP endpoint
```

---

## How Tracing Works

### 1. Request Flow

```mermaid
flowchart LR
    A[HTTP Request] --> B[TracingInterceptor]
    B --> C[OpenTelemetry]
    C --> D[Jaeger]
    D --> E[UI]
```

### 2. Trace Components

- **Span**: Individual operation (e.g., HTTP request)
- **Trace**: Collection of related spans
- **Attributes**: Metadata about the operation
- **Context**: Request correlation information

### 3. Automatic Tracing

Your application automatically traces:

- All HTTP requests (via `TracingInterceptor`)
- Health check endpoints
- Metrics endpoints
- Custom operations

---

## Accessing Jaeger UI

### Step 1: Open Jaeger

```bash
# Open in your browser
http://localhost:16686
```

### Step 2: Find Traces

1. **Service**: Select `nestjs-app`
2. **Operation**: Choose specific endpoint (e.g., `GET /health`)
3. **Time Range**: Select appropriate time window
4. **Find Traces**: Click the button

### Step 3: Analyze Traces

- **Timeline View**: See request duration and timing
- **Span Details**: Click on spans for detailed information
- **Attributes**: View HTTP method, URL, status codes, etc.
- **Errors**: See error details if any occurred

---

## Testing Tracing

### Quick Test Script

```bash
# Run the test script
./test-tracing.sh
```

### Manual Testing

```bash
# 1. Health Check (creates trace)
curl http://localhost:3000/health

# 2. Metrics (creates trace)
curl http://localhost:3000/metrics

# 3. Custom Trace
curl -X POST http://localhost:3000/tracing/custom \
  -H "Content-Type: application/json" \
  -d '{"operation": "test", "duration": 1000}'

# 4. Check Tracing Status
curl http://localhost:3000/tracing/status
```

---

## What You'll See in Jaeger

### Trace Information

- **Trace ID**: Unique identifier for the request
- **Duration**: Total request processing time
- **Status**: Success or error status
- **Service**: `nestjs-app`

### Span Attributes

- `http.method`: GET, POST, etc.
- `http.url`: Request URL
- `http.status_code`: Response status
- `http.user_agent`: Client information
- `response.size`: Response body size
- `http.response_time_ms`: Processing time

### Custom Attributes

- `service.name`: Application name
- `service.version`: Version number
- `http.request_id`: Request correlation ID (if present)

---

## Tracing Configuration

### Environment Variables

```bash
# OpenTelemetry Configuration
OTEL_SERVICE_NAME=nestjs-app
OTEL_EXPORTER_OTLP_ENDPOINT=http://jaeger:4318/v1/traces

# Jaeger Configuration
JAEGER_PORT=16686
JAEGER_COLLECTOR_PORT=14268
OTLP_PORT=4318
```

### Code Configuration

- **TracingInterceptor**: Automatically traces HTTP requests
- **OtelService**: Manages OpenTelemetry initialization
- **Custom Traces**: Created via `/tracing/custom` endpoint

---

## Troubleshooting

### Common Issues

> [!WARNING]
> **No Traces in Jaeger**
>
> - Check if Jaeger container is running: `docker ps | grep jaeger`
> - Verify OTLP endpoint is accessible
> - Check application logs for tracing errors

> [!WARNING]
> **Traces Not Appearing**
>
> - Wait a few seconds for traces to be exported
> - Check the time range in Jaeger UI
> - Verify the service name is `nestjs-app`

> [!TIP]
> **Port Conflicts**
>
> - Ensure port 16686 is not in use
> - Check Docker port mappings

### Debug Commands

```bash
# Check Jaeger container
docker logs jaeger

# Check application logs
pnpm start:dev

# Test OTLP endpoint
curl http://localhost:4318/v1/traces
```

---

## Production Considerations

### Storage Options

1. **Cassandra** (Recommended)
   - High performance
   - Scalable
   - Good for large deployments

2. **Elasticsearch**
   - Full-text search
   - Good for log analysis
   - More resource intensive

3. **PostgreSQL**
   - Simple setup
   - Good for small deployments
   - Limited scalability

### Configuration Changes

```yaml
# Production Jaeger with Cassandra
jaeger:
  image: jaegertracing/all-in-one:latest
  environment:
    - SPAN_STORAGE_TYPE=cassandra
    - CASSANDRA_SERVERS=cassandra:9042
    - CASSANDRA_KEYSPACE=jaeger_v1_test
```

---

## Best Practices

1. **Span Naming**: Use descriptive names for operations
2. **Attributes**: Add relevant metadata to spans
3. **Error Handling**: Always set error status on failed operations
4. **Sampling**: Configure sampling rates for production
5. **Retention**: Set appropriate data retention policies

---

## Useful Links

- [Jaeger Documentation](https://www.jaegertracing.io/docs/)
- [OpenTelemetry Documentation](https://opentelemetry.io/docs/)
- [NestJS Interceptors](https://docs.nestjs.com/interceptors)

---

## Quick Start Checklist

- [ ] Jaeger container running (`docker ps | grep jaeger`)
- [ ] Application running (`pnpm start:dev`)
- [ ] Jaeger UI accessible (`http://localhost:16686`)
- [ ] Test script working (`./test-tracing.sh`)
- [ ] Traces visible in Jaeger UI
- [ ] Custom traces working (`/tracing/custom`)
