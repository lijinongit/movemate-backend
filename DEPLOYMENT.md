# Deployment Guide — Movemate Backend (Phase 1)

## Local Development with Docker Compose

Start PostgreSQL and Redis locally:

```bash
docker-compose up -d

# Verify services
docker ps

# Check logs
docker-compose logs -f postgres
docker-compose logs -f redis
```

Set `.env` DATABASE_URL:

```
DATABASE_URL=postgresql://movemate:movemate-dev-password@localhost:5432/movemate
```

Run migrations and start services:

```bash
npm run prisma:migrate
npm run dev
```

## Docker Images

Build services for containerized deployment:

```bash
# Auth Service
docker build -t movemate-auth-service:latest -f services/auth-service/Dockerfile .

# User Service
docker build -t movemate-user-service:latest -f services/user-service/Dockerfile .

# Test locally
docker run --rm \
  -e DATABASE_URL="postgresql://..." \
  -e JWT_SECRET="..." \
  -p 3001:3001 \
  movemate-auth-service:latest
```

## AWS ECS Fargate Deployment (Phase 2)

### Prerequisites

- AWS account with me-south-1 (Bahrain) region
- ECR repository for each service
- RDS Aurora PostgreSQL Serverless v2 instance
- ElastiCache Redis cluster
- VPC and security groups configured
- IAM roles for ECS task execution

### Steps

1. **Push images to ECR:**

```bash
aws ecr get-login-password --region me-south-1 | docker login --username AWS --password-stdin 123456789.dkr.ecr.me-south-1.amazonaws.com

docker tag movemate-auth-service:latest 123456789.dkr.ecr.me-south-1.amazonaws.com/movemate-auth-service:latest
docker push 123456789.dkr.ecr.me-south-1.amazonaws.com/movemate-auth-service:latest

# Repeat for user-service
```

2. **ECS Task Definitions:**

Reference: AWS CloudFormation / CDK templates (create in Phase 2 infrastructure repo)

```json
{
  "family": "movemate-auth-service",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "containerDefinitions": [
    {
      "name": "auth-service",
      "image": "123456789.dkr.ecr.me-south-1.amazonaws.com/movemate-auth-service:latest",
      "essential": true,
      "portMappings": [
        {
          "containerPort": 3001,
          "protocol": "tcp"
        }
      ],
      "environment": [
        {
          "name": "NODE_ENV",
          "value": "production"
        },
        {
          "name": "DATABASE_URL",
          "value": "postgresql://..."
        }
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/movemate-auth-service",
          "awslogs-region": "me-south-1",
          "awslogs-stream-prefix": "ecs"
        }
      }
    }
  ]
}
```

3. **Launch ECS Services:**

```bash
aws ecs create-service \
  --cluster movemate-production \
  --service-name auth-service \
  --task-definition movemate-auth-service \
  --desired-count 2 \
  --launch-type FARGATE \
  --network-configuration "awsvpcConfiguration={subnets=[subnet-xxx],securityGroups=[sg-xxx],assignPublicIp=DISABLED}" \
  --region me-south-1
```

4. **Auto-Scaling:**

```bash
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --resource-id service/movemate-production/auth-service \
  --scalable-dimension ecs:service:DesiredCount \
  --min-capacity 2 \
  --max-capacity 10 \
  --region me-south-1

aws application-autoscaling put-scaling-policy \
  --policy-name auth-service-scaling \
  --service-namespace ecs \
  --resource-id service/movemate-production/auth-service \
  --scalable-dimension ecs:service:DesiredCount \
  --policy-type TargetTrackingScaling \
  --target-tracking-scaling-policy-configuration "TargetValue=70.0,PredefinedMetricSpecification={PredefinedMetricType=ECSServiceAverageCPUUtilization},ScaleOutCooldown=60,ScaleInCooldown=300" \
  --region me-south-1
```

5. **Load Balancer:**

Use AWS Application Load Balancer (ALB) to route traffic to services:

```bash
aws elbv2 create-target-group \
  --name movemate-auth-service \
  --protocol HTTP \
  --port 3001 \
  --vpc-id vpc-xxx \
  --health-check-path /healthz \
  --health-check-interval-seconds 30 \
  --health-check-timeout-seconds 5 \
  --healthy-threshold-count 2 \
  --unhealthy-threshold-count 2 \
  --region me-south-1
```

## Database Migrations

### Development

```bash
npm run prisma:migrate
```

### Staging/Production

Use zero-downtime migration strategy:

1. Add new nullable column
2. Deploy code that writes to both old and new columns
3. Backfill data in background
4. Remove old column in follow-up migration
5. Deploy code that reads only new column

Example:

```bash
# Step 1: Create new column
npx prisma migrate dev --name add_new_field_nullable

# Step 2: Deploy code, then in next release:
npx prisma migrate dev --name drop_old_field
```

## Monitoring & Logging

### CloudWatch

- **Logs:** `/ecs/movemate-auth-service`, `/ecs/movemate-user-service`
- **Metrics:** CPU, memory, network, HTTP 4xx/5xx response codes
- **Alarms:** Error rate >1%, p95 latency >500ms, RDS CPU >80%

### X-Ray Tracing

Enable X-Ray daemon in ECS task definition:

```json
{
  "name": "xray-daemon",
  "image": "public.ecr.aws/xray/aws-xray-daemon:latest",
  "cpu": 32,
  "memory": 256,
  "portMappings": [
    {
      "containerPort": 2000,
      "protocol": "udp"
    }
  ]
}
```

## SSL/TLS Certificates

Use AWS Certificate Manager (ACM) with ALB:

```bash
aws acm request-certificate \
  --domain-name api.movemate.ae \
  --subject-alternative-names "*.api.movemate.ae" \
  --validation-method DNS \
  --region me-south-1
```

## Secrets Management

Store sensitive values in AWS Secrets Manager:

```bash
aws secretsmanager create-secret \
  --name movemate/production/jwt-secret \
  --secret-string "your-jwt-secret" \
  --region me-south-1

aws secretsmanager create-secret \
  --name movemate/production/encryption-key \
  --secret-string "hex-encoded-32-byte-key" \
  --region me-south-1

aws secretsmanager create-secret \
  --name movemate/production/database-url \
  --secret-string "postgresql://..." \
  --region me-south-1
```

Reference in ECS task definition via Secrets (not environment variables):

```json
{
  "secrets": [
    {
      "name": "JWT_SECRET",
      "valueFrom": "arn:aws:secretsmanager:me-south-1:123456789:secret:movemate/production/jwt-secret"
    },
    {
      "name": "DATABASE_URL",
      "valueFrom": "arn:aws:secretsmanager:me-south-1:123456789:secret:movemate/production/database-url"
    }
  ]
}
```

## Backup & Disaster Recovery

### RDS Backups

- Automated daily snapshots (7-day retention)
- Manual snapshot before major changes
- Cross-region backup replication

```bash
aws rds copy-db-snapshot \
  --source-db-snapshot-identifier movemate-prod-snapshot \
  --target-db-snapshot-identifier movemate-prod-snapshot-backup \
  --source-region me-south-1 \
  --destination-region eu-west-1
```

### Point-in-Time Recovery

Restore database to any point within 7 days:

```bash
aws rds restore-db-instance-to-point-in-time \
  --source-db-instance-identifier movemate-prod \
  --db-instance-identifier movemate-prod-restored \
  --restore-time 2026-05-03T10:00:00Z \
  --region me-south-1
```

## Health Checks

All services expose `/healthz` endpoint:

```bash
curl http://localhost:3001/healthz
# { "status": "ok", "service": "auth-service" }
```

ECS health checks (3 consecutive failures = mark unhealthy):

```json
{
  "command": ["CMD-SHELL", "curl -f http://localhost:3001/healthz || exit 1"],
  "interval": 30,
  "timeout": 5,
  "retries": 3,
  "startPeriod": 60
}
```

## Performance Tuning

### Database

- Enable query logging: `log_statement='all'`
- Monitor slow queries: `log_min_duration_statement=1000` (1 second)
- Analyze query plans: `EXPLAIN ANALYZE <query>`
- Index optimization: run `ANALYZE` weekly

### Application

- Connection pooling: PgBouncer with 20 connections/instance
- Redis cache for hot queries
- ECS CPU/memory autoscaling based on demand
- Request timeout: 30 seconds (configurable)

## Rollback Strategy

### Blue-Green Deployment

1. Deploy new version to green environment
2. Run smoke tests
3. Switch ALB traffic from blue to green
4. Keep blue running for 24 hours
5. Rollback if issues detected

```bash
aws elbv2 modify-listener \
  --listener-arn arn:aws:elasticloadbalancing:... \
  --default-actions Type=forward,TargetGroupArn=arn:aws:elasticloadbalancing:...:targetgroup/green/...
```

### Database Rollback

If schema migration fails:

1. Restore database from snapshot (point-in-time recovery)
2. Re-deploy previous application version
3. Investigate issue and fix in new migration
4. Re-deploy when ready

## Cost Optimization

- **RDS Aurora Serverless v2:** Scales to 0.5 ACUs during off-hours (saves ~60%)
- **ECS Fargate Spot:** Use for non-critical services (70% savings, lower SLA)
- **Reserved Instances:** 1-year commitment for stable capacity (40% savings)
- **Data Transfer:** CloudFront caching reduces origin requests by 80%

## Troubleshooting

### Logs

```bash
# Tail logs for service
aws logs tail /ecs/movemate-auth-service --follow

# Search for errors
aws logs filter-log-events \
  --log-group-name /ecs/movemate-auth-service \
  --filter-pattern "ERROR"
```

### Metrics

```bash
# Check service CPU/memory
aws cloudwatch get-metric-statistics \
  --namespace AWS/ECS \
  --metric-name CPUUtilization \
  --dimensions Name=ServiceName,Value=auth-service Name=ClusterName,Value=movemate-production \
  --start-time 2026-05-03T00:00:00Z \
  --end-time 2026-05-04T00:00:00Z \
  --period 300 \
  --statistics Average,Maximum
```

### Database

```bash
# Connect to RDS
psql --host=movemate-prod.c9akciq32e4k.me-south-1.rds.amazonaws.com \
     --username=postgres \
     --database=movemate

# Check slow queries
SELECT query_time, query FROM slow_log WHERE start_time > NOW() - INTERVAL 1 HOUR;
```
