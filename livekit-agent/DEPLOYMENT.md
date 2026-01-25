# LiveKit Agent AWS ECS Fargate Deployment

Production deployment guide for the LiveKit voice agent on AWS ECS Fargate.

## Architecture

```
Vercel (Frontend) → LiveKit Cloud → ECS Fargate (Agent Workers)
                                          ↓
                                    Auto-scales 1-50 tasks
                                          ↓
                                    Secrets Manager + CloudWatch + ECR
```

## Prerequisites

- AWS CLI configured (`aws configure`)
- Docker installed and running
- Git (for image tagging)

## Quick Start

### 1. Run Setup Script

This creates all AWS infrastructure (ECR, ECS, IAM, Secrets, etc.):

```bash
cd livekit-agent
./setup-aws.sh
```

### 2. Update Secrets with Real Values

After setup, update the placeholder secrets:

```bash
# LiveKit credentials
aws secretsmanager put-secret-value \
  --secret-id physician-voice-agent/livekit \
  --secret-string '{"LIVEKIT_URL":"wss://your-app.livekit.cloud","LIVEKIT_API_KEY":"your-key","LIVEKIT_API_SECRET":"your-secret"}' \
  --region us-east-1

# OpenAI
aws secretsmanager put-secret-value \
  --secret-id physician-voice-agent/openai \
  --secret-string '{"OPENAI_API_KEY":"sk-your-key"}' \
  --region us-east-1

# Deepgram
aws secretsmanager put-secret-value \
  --secret-id physician-voice-agent/deepgram \
  --secret-string '{"DEEPGRAM_API_KEY":"your-key"}' \
  --region us-east-1

# ElevenLabs
aws secretsmanager put-secret-value \
  --secret-id physician-voice-agent/elevenlabs \
  --secret-string '{"ELEVEN_API_KEY":"your-key"}' \
  --region us-east-1

# AWS S3 (for recordings)
aws secretsmanager put-secret-value \
  --secret-id physician-voice-agent/aws-s3 \
  --secret-string '{"AWS_ACCESS_KEY_ID":"your-key","AWS_SECRET_ACCESS_KEY":"your-secret","AWS_S3_BUCKET":"voice-exp-recordings"}' \
  --region us-east-1
```

### 3. Deploy

Build and push the Docker image, then update ECS:

```bash
./deploy.sh
```

## Files Overview

| File | Purpose |
|------|---------|
| `Dockerfile` | Container image definition |
| `.dockerignore` | Files to exclude from Docker build |
| `deploy.sh` | Build, push to ECR, update ECS service |
| `setup-aws.sh` | One-time AWS infrastructure setup |
| `ecs-task-definition.json` | ECS task configuration template |

## Manual Setup (Alternative to setup-aws.sh)

### Phase 1: ECR Repository

```bash
aws ecr create-repository --repository-name physician-voice-agent --region us-east-1
```

### Phase 2: CloudWatch Log Group

```bash
aws logs create-log-group --log-group-name /ecs/physician-voice-agent --region us-east-1
aws logs put-retention-policy --log-group-name /ecs/physician-voice-agent --retention-in-days 30 --region us-east-1
```

### Phase 3: ECS Cluster

```bash
aws ecs create-cluster \
  --cluster-name physician-voice-agent-cluster \
  --capacity-providers FARGATE FARGATE_SPOT \
  --default-capacity-provider-strategy capacityProvider=FARGATE_SPOT,weight=4 capacityProvider=FARGATE,weight=1 \
  --region us-east-1
```

## Monitoring

### View Logs

```bash
# Follow logs in real-time
aws logs tail /ecs/physician-voice-agent --follow --region us-east-1

# View recent logs
aws logs tail /ecs/physician-voice-agent --since 1h --region us-east-1
```

### Check Service Status

```bash
aws ecs describe-services \
  --cluster physician-voice-agent-cluster \
  --services physician-voice-agent-service \
  --region us-east-1
```

### View Running Tasks

```bash
aws ecs list-tasks \
  --cluster physician-voice-agent-cluster \
  --service-name physician-voice-agent-service \
  --region us-east-1
```

## Auto-Scaling Configuration

The service is configured to auto-scale based on CPU utilization:

- **Min tasks**: 1
- **Max tasks**: 50
- **Target CPU**: 60%
- **Scale-out cooldown**: 60 seconds
- **Scale-in cooldown**: 300 seconds

To modify scaling:

```bash
# Update min/max capacity
aws application-autoscaling register-scalable-target \
  --service-namespace ecs \
  --scalable-dimension ecs:service:DesiredCount \
  --resource-id service/physician-voice-agent-cluster/physician-voice-agent-service \
  --min-capacity 1 \
  --max-capacity 100 \
  --region us-east-1
```

## Cost Estimate

| Usage Level | Monthly Cost |
|-------------|--------------|
| Light (8 hrs/day, 1-2 workers) | ~$20-35 |
| Medium (24/7, 1-5 workers) | ~$80-160 |
| Heavy (24/7, up to 50 workers) | ~$200-500 |

Using FARGATE_SPOT (80% of capacity) provides ~70% cost savings.

## Troubleshooting

### Task Fails to Start

1. Check CloudWatch logs:
   ```bash
   aws logs tail /ecs/physician-voice-agent --region us-east-1
   ```

2. Check task stopped reason:
   ```bash
   aws ecs describe-tasks \
     --cluster physician-voice-agent-cluster \
     --tasks <task-arn> \
     --region us-east-1
   ```

### Secrets Not Loading

Verify secrets exist and have correct format:

```bash
aws secretsmanager get-secret-value \
  --secret-id physician-voice-agent/livekit \
  --region us-east-1
```

### Image Not Found

Ensure image is pushed to ECR:

```bash
aws ecr describe-images \
  --repository-name physician-voice-agent \
  --region us-east-1
```

## Cleanup

To delete all resources:

```bash
# Delete ECS service
aws ecs update-service --cluster physician-voice-agent-cluster --service physician-voice-agent-service --desired-count 0 --region us-east-1
aws ecs delete-service --cluster physician-voice-agent-cluster --service physician-voice-agent-service --force --region us-east-1

# Delete ECS cluster
aws ecs delete-cluster --cluster physician-voice-agent-cluster --region us-east-1

# Delete ECR repository
aws ecr delete-repository --repository-name physician-voice-agent --force --region us-east-1

# Delete secrets (repeat for each)
aws secretsmanager delete-secret --secret-id physician-voice-agent/livekit --force-delete-without-recovery --region us-east-1

# Delete log group
aws logs delete-log-group --log-group-name /ecs/physician-voice-agent --region us-east-1
```
