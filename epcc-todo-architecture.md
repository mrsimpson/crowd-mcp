# EPCC Todo System Architecture

## High-Level Architectural Overview

The EPCC Todo System is designed as a distributed, event-driven microservices architecture that leverages polyglot persistence, cloud-native patterns, and containerized deployment. The system follows Domain-Driven Design (DDD) principles with bounded contexts for different todo operations.

### Core Architectural Principles

- **Event-Driven**: All state changes are triggered by domain events
- **Polyglot**: Different data stores optimized for specific use cases
- **Cloud-Native**: Built for scalability, resilience, and observability
- **Containerized**: Everything runs in containers with orchestration

## System Architecture Diagram

```
┌─────────────────────────────────────────────────────────────────┐
│                        API Gateway                              │
│                    (Kong/Envoy/Traefik)                        │
└─────────────────────┬───────────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────────┐
│                    Event Bus (Kafka)                            │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐│
│  │ Todo Events │ │ User Events │ │ Notification │ │ Audit Events││
│  │   Topic     │ │   Topic     │ │   Topic     │ │   Topic     ││
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘│
└─────────────────────┬───────────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────────┐
│                    Microservices Layer                          │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐│
│  │Todo Service │ │User Service │ │Notification │ │Audit Service││
│  │   (Node.js) │ │  (Python)   │ │  (Go)       │ │  (Java)     ││
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘│
└─────────────────────┬───────────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────────┐
│                  Polyglot Persistence Layer                    │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐│
│  │ PostgreSQL  │ │   Redis     │ │ Elasticsearch│ │   MongoDB   ││
│  │ (Relational)│ │  (Cache)    │ │   (Search)  │ │  (Documents)││
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Component Design for Event-Driven Todo Operations

### 1. Event Schema Design

#### Todo Domain Events

```json
// TodoCreated Event
{
  "eventId": "uuid",
  "eventType": "TodoCreated",
  "timestamp": "2025-01-01T00:00:00Z",
  "aggregateId": "todo-123",
  "data": {
    "todoId": "todo-123",
    "title": "Complete EPCC design",
    "description": "Design todo system using EPCC principles",
    "userId": "user-456",
    "priority": "HIGH",
    "dueDate": "2025-01-15T00:00:00Z",
    "status": "PENDING"
  },
  "metadata": {
    "correlationId": "corr-789",
    "causationId": "cmd-101",
    "userId": "user-456"
  }
}

// TodoUpdated Event
{
  "eventId": "uuid",
  "eventType": "TodoUpdated",
  "timestamp": "2025-01-01T01:00:00Z",
  "aggregateId": "todo-123",
  "data": {
    "todoId": "todo-123",
    "changes": {
      "status": "IN_PROGRESS",
      "updatedAt": "2025-01-01T01:00:00Z"
    }
  }
}

// TodoCompleted Event
{
  "eventId": "uuid",
  "eventType": "TodoCompleted",
  "timestamp": "2025-01-01T02:00:00Z",
  "aggregateId": "todo-123",
  "data": {
    "todoId": "todo-123",
    "completedAt": "2025-01-01T02:00:00Z"
  }
}
```

### 2. Service Components

#### Todo Service (Node.js/TypeScript)

```typescript
// Event Sourcing Aggregate
class TodoAggregate {
  private id: string;
  private title: string;
  private status: TodoStatus;
  private version: number = 0;
  private uncommittedEvents: DomainEvent[] = [];

  createTodo(command: CreateTodoCommand) {
    const event = new TodoCreated({
      todoId: generateId(),
      title: command.title,
      userId: command.userId,
      status: "PENDING",
    });

    this.apply(event);
    this.uncommittedEvents.push(event);
  }

  completeTodo(command: CompleteTodoCommand) {
    if (this.status !== "PENDING") {
      throw new Error("Todo cannot be completed");
    }

    const event = new TodoCompleted({
      todoId: this.id,
      completedAt: new Date(),
    });

    this.apply(event);
    this.uncommittedEvents.push(event);
  }

  private apply(event: DomainEvent) {
    switch (event.type) {
      case "TodoCreated":
        this.handleTodoCreated(event as TodoCreated);
        break;
      case "TodoCompleted":
        this.handleTodoCompleted(event as TodoCompleted);
        break;
    }
    this.version++;
  }
}
```

#### User Service (Python/FastAPI)

```python
# Event Handler for User-related operations
class UserEventHandler:
    def __init__(self, user_repository: UserRepository, event_bus: EventBus):
        self.user_repository = user_repository
        self.event_bus = event_bus

    async def handle_todo_created(self, event: TodoCreated):
        # Update user statistics
        user = await self.user_repository.get_by_id(event.data.userId)
        user.total_todos += 1
        await self.user_repository.save(user)

        # Emit user statistics updated event
        await self.event_bus.publish(UserStatsUpdated(
            userId=user.id,
            totalTodos=user.total_todos,
            pendingTodos=user.pending_todos + 1
        ))
```

#### Notification Service (Go)

```go
// Event-driven notification processor
type NotificationProcessor struct {
    eventBus   EventBus
    emailSvc   EmailService
    pushSvc    PushService
    userRepo   UserRepository
}

func (np *NotificationProcessor) ProcessTodoEvents(ctx context.Context) error {
    return np.eventBus.Subscribe("todo-events", func(event Event) error {
        switch event.Type {
        case "TodoCreated":
            return np.handleTodoCreated(ctx, event)
        case "TodoCompleted":
            return np.handleTodoCompleted(ctx, event)
        }
        return nil
    })
}

func (np *NotificationProcessor) handleTodoCreated(ctx context.Context, event Event) error {
    var todoData TodoCreatedData
    if err := json.Unmarshal(event.Data, &todoData); err != nil {
        return err
    }

    user, err := np.userRepo.Get(ctx, todoData.UserID)
    if err != nil {
        return err
    }

    // Send notification based on user preferences
    if user.Preferences.EmailNotifications {
        return np.emailSvc.SendTodoCreatedEmail(user.Email, todoData)
    }

    return nil
}
```

### 3. CQRS Implementation

#### Command Side

```typescript
// Command Handlers
class TodoCommandHandler {
  constructor(
    private repository: TodoRepository,
    private eventBus: EventBus,
  ) {}

  async handleCreateTodo(command: CreateTodoCommand): Promise<string> {
    const todo = new TodoAggregate();
    todo.createTodo(command);

    await this.repository.save(todo);
    await this.eventBus.publish(...todo.getUncommittedEvents());

    return todo.id;
  }
}
```

#### Query Side

```typescript
// Read Model Projections
class TodoProjection {
  constructor(private readModel: TodoReadModel) {}

  async onTodoCreated(event: TodoCreated) {
    await this.readModel.create({
      id: event.data.todoId,
      title: event.data.title,
      status: event.data.status,
      userId: event.data.userId,
      createdAt: event.timestamp,
    });
  }

  async onTodoCompleted(event: TodoCompleted) {
    await this.readModel.updateStatus(event.data.todoId, "COMPLETED");
  }
}
```

## Polyglot Persistence Strategy

### 1. Data Store Selection Matrix

| Use Case                | Data Store    | Reason                                    | Language Integration                                 |
| ----------------------- | ------------- | ----------------------------------------- | ---------------------------------------------------- |
| Transactional Todo Data | PostgreSQL    | ACID compliance, relational integrity     | Node.js (pg), Python (psycopg2)                      |
| User Sessions & Cache   | Redis         | Fast key-value access, TTL support        | All languages (Redis clients)                        |
| Full-text Search        | Elasticsearch | Advanced search capabilities              | Node.js (@elastic/client), Python (elasticsearch-py) |
| Audit Logs              | MongoDB       | Flexible schema, time-series optimization | Java (MongoDB driver), Go (mongo-go-driver)          |
| Analytics               | ClickHouse    | Columnar storage for analytics            | Python (clickhouse-driver)                           |

### 2. Data Flow Architecture

```
Command → Event Store (PostgreSQL) → Event Bus (Kafka)
                                    ↓
Read Model Updates → Multiple Read Stores:
├── PostgreSQL (Transactional queries)
├── Redis (Hot cache, sessions)
├── Elasticsearch (Search)
├── MongoDB (Audit logs)
└── ClickHouse (Analytics)
```

### 3. Data Consistency Patterns

#### Event Store Implementation

```sql
-- Event Store Schema (PostgreSQL)
CREATE TABLE events (
    id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
    aggregate_id UUID NOT NULL,
    aggregate_type VARCHAR(50) NOT NULL,
    event_type VARCHAR(100) NOT NULL,
    event_data JSONB NOT NULL,
    metadata JSONB,
    version INTEGER NOT NULL,
    created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
    CONSTRAINT events_aggregate_version UNIQUE (aggregate_id, version)
);

CREATE INDEX idx_events_aggregate_id ON events(aggregate_id);
CREATE INDEX idx_events_type ON events(event_type);
CREATE INDEX idx_events_created_at ON events(created_at);
```

#### Read Model Synchronization

```python
# Event Processor for Read Model Updates
class ReadModelProjector:
    def __init__(self):
        self.postgres_pool = create_postgres_pool()
        self.redis_client = redis.Redis()
        self.es_client = Elasticsearch()
        self.mongo_client = MongoClient()

    async def process_event(self, event: Event):
        # Update PostgreSQL read model
        await self.update_postgres_read_model(event)

        # Update Redis cache
        await self.update_redis_cache(event)

        # Update Elasticsearch index
        await self.update_elasticsearch_index(event)

        # Store in MongoDB for audit
        await self.store_audit_log(event)
```

## Cloud-Native Design Considerations

### 1. Scalability Patterns

#### Horizontal Scaling

- **Stateless Services**: All microservices designed to be stateless
- **Event-Driven Architecture**: Asynchronous communication prevents bottlenecks
- **Database Sharding**: PostgreSQL partitioned by user_id for todo data
- **Caching Layers**: Multi-level caching with Redis and CDN

#### Auto-scaling Configuration

```yaml
# Kubernetes HPA Example
apiVersion: autoscaling/v2
kind: HorizontalPodAutoscaler
metadata:
  name: todo-service-hpa
spec:
  scaleTargetRef:
    apiVersion: apps/v1
    kind: Deployment
    name: todo-service
  minReplicas: 2
  maxReplicas: 20
  metrics:
    - type: Resource
      resource:
        name: cpu
        target:
          type: Utilization
          averageUtilization: 70
    - type: Resource
      resource:
        name: memory
        target:
          type: Utilization
          averageUtilization: 80
```

### 2. Resilience Patterns

#### Circuit Breaker Implementation

```typescript
// Resilience4j Circuit Breaker
class TodoServiceClient {
  private circuitBreaker = CircuitBreaker.of(
    "todoService",
    CircuitBreakerConfig.custom()
      .failureRateThreshold(50)
      .waitDurationInOpenState(Duration.ofSeconds(30))
      .ringBufferSizeInHalfOpenState(10)
      .ringBufferSizeInClosedState(100)
      .build(),
  );

  async getTodo(id: string): Promise<Todo> {
    return this.circuitBreaker.executeSupplier(async () => {
      return this.httpClient.get(`/todos/${id}`);
    });
  }
}
```

#### Retry and Timeout Policies

```go
// Go retry configuration
type RetryConfig struct {
    MaxRetries    int
    InitialDelay  time.Duration
    MaxDelay      time.Duration
    BackoffFactor float64
}

func (c *RetryConfig) Execute(operation func() error) error {
    var lastErr error
    delay := c.InitialDelay

    for i := 0; i <= c.MaxRetries; i++ {
        if err := operation(); err == nil {
            return nil
        } else {
            lastErr = err
            if i < c.MaxRetries {
                time.Sleep(delay)
                delay = time.Duration(float64(delay) * c.BackoffFactor)
                if delay > c.MaxDelay {
                    delay = c.MaxDelay
                }
            }
        }
    }

    return lastErr
}
```

### 3. Observability

#### Distributed Tracing

```yaml
# OpenTelemetry Configuration
apiVersion: v1
kind: ConfigMap
metadata:
  name: otel-config
data:
  config.yaml: |
    receiver:
      otlp:
        protocols:
          grpc:
            endpoint: 0.0.0.0:4317
    processor:
      batch:
        timeout: 1s
        send_batch_size: 1024
    exporter:
      jaeger:
        endpoint: jaeger-collector:14250
        tls:
          insecure: true
    service:
      pipelines:
        traces:
          receivers: [otlp]
          processors: [batch]
          exporters: [jaeger]
```

#### Metrics Collection

```python
# Prometheus Metrics
from prometheus_client import Counter, Histogram, Gauge

# Business metrics
todos_created_total = Counter('todos_created_total', 'Total todos created')
todos_completed_total = Counter('todos_completed_total', 'Total todos completed')
todo_processing_duration = Histogram('todo_processing_seconds', 'Time spent processing todos')

# System metrics
active_connections = Gauge('active_connections', 'Number of active connections')
event_processing_lag = Gauge('event_processing_lag_seconds', 'Event processing lag')
```

### 4. Security

#### API Gateway Security

```yaml
# OAuth2/JWT Configuration
apiVersion: v1
kind: Secret
metadata:
  name: auth-config
type: Opaque
data:
  jwt-secret: <base64-encoded-secret>
  oauth-client-id: <base64-encoded-client-id>
  oauth-client-secret: <base64-encoded-client-secret>
```

#### Service-to-Service Authentication

```typescript
// mTLS Configuration
const tlsConfig = {
  cert: fs.readFileSync("/etc/certs/service.crt"),
  key: fs.readFileSync("/etc/certs/service.key"),
  ca: fs.readFileSync("/etc/certs/ca.crt"),
  rejectUnauthorized: true,
};

const httpsAgent = new https.Agent(tlsConfig);
```

## Containerized Deployment Approach

### 1. Container Strategy

#### Multi-stage Docker Builds

```dockerfile
# Todo Service (Node.js)
FROM node:18-alpine AS builder
WORKDIR /app
COPY package*.json ./
RUN npm ci --only=production

FROM node:18-alpine AS runtime
RUN addgroup -g 1001 -S nodejs
RUN adduser -S nextjs -u 1001
WORKDIR /app
COPY --from=builder /app/node_modules ./node_modules
COPY --chown=nextjs:nodejs . .
USER nextjs
EXPOSE 3000
CMD ["node", "dist/index.js"]
```

#### Service Mesh Integration

```yaml
# Istio Service Definition
apiVersion: v1
kind: Service
metadata:
  name: todo-service
  labels:
    app: todo-service
    version: v1
spec:
  ports:
    - port: 3000
      name: http
  selector:
    app: todo-service
---
apiVersion: networking.istio.io/v1alpha3
kind: VirtualService
metadata:
  name: todo-service
spec:
  http:
    - match:
        - uri:
            prefix: /api/todos
      route:
        - destination:
            host: todo-service
            port:
              number: 3000
      timeout: 30s
      retries:
        attempts: 3
        perTryTimeout: 10s
```

### 2. Orchestration Patterns

#### Kubernetes Deployment

```yaml
apiVersion: apps/v1
kind: Deployment
metadata:
  name: todo-service
  labels:
    app: todo-service
spec:
  replicas: 3
  selector:
    matchLabels:
      app: todo-service
  template:
    metadata:
      labels:
        app: todo-service
    spec:
      containers:
        - name: todo-service
          image: todo-service:latest
          ports:
            - containerPort: 3000
          env:
            - name: DATABASE_URL
              valueFrom:
                secretKeyRef:
                  name: db-credentials
                  key: url
            - name: KAFKA_BROKERS
              value: "kafka:9092"
          resources:
            requests:
              memory: "256Mi"
              cpu: "250m"
            limits:
              memory: "512Mi"
              cpu: "500m"
          livenessProbe:
            httpGet:
              path: /health
              port: 3000
            initialDelaySeconds: 30
            periodSeconds: 10
          readinessProbe:
            httpGet:
              path: /ready
              port: 3000
            initialDelaySeconds: 5
            periodSeconds: 5
```

### 3. CI/CD Pipeline

#### GitOps with ArgoCD

```yaml
apiVersion: argoproj.io/v1alpha1
kind: Application
metadata:
  name: todo-system
  namespace: argocd
spec:
  project: default
  source:
    repoURL: https://github.com/company/todo-system
    targetRevision: HEAD
    path: k8s
  destination:
    server: https://kubernetes.default.svc
    namespace: todo-system
  syncPolicy:
    automated:
      prune: true
      selfHeal: true
    syncOptions:
      - CreateNamespace=true
```

### 4. Configuration Management

#### External Configuration

```yaml
# ConfigMap for application configuration
apiVersion: v1
kind: ConfigMap
metadata:
  name: todo-service-config
data:
  config.yaml: |
    server:
      port: 3000
      host: "0.0.0.0"

    database:
      max_connections: 20
      connection_timeout: 30

    kafka:
      topic_prefix: "todo"
      consumer_group: "todo-service"
      batch_size: 100

    tracing:
      jaeger_endpoint: "http://jaeger:14268/api/traces"
      sampling_rate: 0.1
```

## Deployment Architecture

### Production Environment

```
┌─────────────────────────────────────────────────────────────────┐
│                        Load Balancer                            │
│                    (AWS ALB/GCP LB)                             │
└─────────────────────┬───────────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────────┐
│                    Kubernetes Cluster                           │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐│
│  │   Ingress   │ │   Services  │ │ Deployments │ │    Pods     ││
│  │ Controller  │ │   Layer     │ │             │ │             ││
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘│
└─────────────────────┬───────────────────────────────────────────┘
                      │
┌─────────────────────┴───────────────────────────────────────────┐
│                    Managed Services                            │
│  ┌─────────────┐ ┌─────────────┐ ┌─────────────┐ ┌─────────────┐│
│  │   Kafka     │ │ PostgreSQL  │ │    Redis    │ │Elasticsearch││
│  │ (MSK/Confluent)│  (RDS)      │ │ (ElastiCache)│ │ (Cloud Op.)  ││
│  └─────────────┘ └─────────────┘ └─────────────┘ └─────────────┘│
└─────────────────────────────────────────────────────────────────┘
```

## Summary

This EPCC Todo System architecture demonstrates:

1. **Event-Driven**: Comprehensive event sourcing with CQRS pattern
2. **Polyglot**: Multiple data stores optimized for specific use cases
3. **Cloud-Native**: Scalable, resilient, and observable design
4. **Containerized**: Full containerization with orchestration support

The architecture provides a solid foundation for building modern, distributed todo applications that can scale to handle millions of users and todos while maintaining high availability and performance.
