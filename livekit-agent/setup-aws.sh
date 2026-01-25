#!/bin/bash
set -e

# Configuration
AWS_REGION="${AWS_REGION:-us-east-1}"
AWS_ACCOUNT_ID="${AWS_ACCOUNT_ID:-$(aws sts get-caller-identity --query Account --output text)}"
ECR_REPOSITORY="physician-voice-agent"
ECS_CLUSTER="physician-voice-agent-cluster"
ECS_SERVICE="physician-voice-agent-service"
LOG_GROUP="/ecs/physician-voice-agent"

# Colors
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m'

echo -e "${GREEN}=== AWS Infrastructure Setup for LiveKit Agent ===${NC}"
echo "Region: $AWS_REGION"
echo "Account: $AWS_ACCOUNT_ID"
echo ""

# Check AWS credentials
if ! aws sts get-caller-identity > /dev/null 2>&1; then
    echo -e "${RED}Error: AWS credentials not configured${NC}"
    exit 1
fi

# ============================================
# Phase 1: ECR Repository
# ============================================
echo -e "${BLUE}Phase 1: Creating ECR Repository...${NC}"

if aws ecr describe-repositories --repository-names $ECR_REPOSITORY --region $AWS_REGION > /dev/null 2>&1; then
    echo "ECR repository already exists"
else
    aws ecr create-repository \
        --repository-name $ECR_REPOSITORY \
        --region $AWS_REGION \
        --image-scanning-configuration scanOnPush=true
    echo -e "${GREEN}ECR repository created${NC}"
fi

# ============================================
# Phase 2: CloudWatch Log Group
# ============================================
echo -e "${BLUE}Phase 2: Creating CloudWatch Log Group...${NC}"

if aws logs describe-log-groups --log-group-name-prefix $LOG_GROUP --region $AWS_REGION --query 'logGroups[0].logGroupName' --output text 2>/dev/null | grep -q $LOG_GROUP; then
    echo "Log group already exists"
else
    aws logs create-log-group --log-group-name $LOG_GROUP --region $AWS_REGION
    aws logs put-retention-policy --log-group-name $LOG_GROUP --retention-in-days 30 --region $AWS_REGION
    echo -e "${GREEN}Log group created${NC}"
fi

# ============================================
# Phase 3: IAM Roles
# ============================================
echo -e "${BLUE}Phase 3: Creating IAM Roles...${NC}"

# ECS Task Execution Role (for pulling images and secrets)
EXECUTION_ROLE="ecsTaskExecutionRole"
if aws iam get-role --role-name $EXECUTION_ROLE > /dev/null 2>&1; then
    echo "Execution role already exists"
else
    aws iam create-role \
        --role-name $EXECUTION_ROLE \
        --assume-role-policy-document '{
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Principal": {"Service": "ecs-tasks.amazonaws.com"},
                "Action": "sts:AssumeRole"
            }]
        }'
    aws iam attach-role-policy \
        --role-name $EXECUTION_ROLE \
        --policy-arn arn:aws:iam::aws:policy/service-role/AmazonECSTaskExecutionRolePolicy
    echo -e "${GREEN}Execution role created${NC}"
fi

# Task Role (for S3 access and secrets)
TASK_ROLE="physician-voice-agent-task-role"
if aws iam get-role --role-name $TASK_ROLE > /dev/null 2>&1; then
    echo "Task role already exists"
else
    aws iam create-role \
        --role-name $TASK_ROLE \
        --assume-role-policy-document '{
            "Version": "2012-10-17",
            "Statement": [{
                "Effect": "Allow",
                "Principal": {"Service": "ecs-tasks.amazonaws.com"},
                "Action": "sts:AssumeRole"
            }]
        }'
    echo -e "${GREEN}Task role created${NC}"
fi

# Attach secrets and S3 policy to execution role
SECRETS_POLICY="physician-voice-agent-secrets-policy"
cat > /tmp/secrets-policy.json << EOF
{
    "Version": "2012-10-17",
    "Statement": [
        {
            "Effect": "Allow",
            "Action": [
                "secretsmanager:GetSecretValue"
            ],
            "Resource": "arn:aws:secretsmanager:${AWS_REGION}:${AWS_ACCOUNT_ID}:secret:physician-voice-agent/*"
        },
        {
            "Effect": "Allow",
            "Action": [
                "s3:PutObject",
                "s3:GetObject",
                "s3:ListBucket"
            ],
            "Resource": [
                "arn:aws:s3:::voice-exp-recordings",
                "arn:aws:s3:::voice-exp-recordings/*"
            ]
        }
    ]
}
EOF

if aws iam get-policy --policy-arn arn:aws:iam::${AWS_ACCOUNT_ID}:policy/${SECRETS_POLICY} > /dev/null 2>&1; then
    echo "Secrets policy already exists"
else
    aws iam create-policy \
        --policy-name $SECRETS_POLICY \
        --policy-document file:///tmp/secrets-policy.json
fi

aws iam attach-role-policy \
    --role-name $EXECUTION_ROLE \
    --policy-arn arn:aws:iam::${AWS_ACCOUNT_ID}:policy/${SECRETS_POLICY} 2>/dev/null || true

aws iam attach-role-policy \
    --role-name $TASK_ROLE \
    --policy-arn arn:aws:iam::${AWS_ACCOUNT_ID}:policy/${SECRETS_POLICY} 2>/dev/null || true

# ============================================
# Phase 4: Secrets Manager
# ============================================
echo -e "${BLUE}Phase 4: Creating Secrets in Secrets Manager...${NC}"
echo -e "${YELLOW}NOTE: You need to manually update these secrets with real values${NC}"

create_secret_if_not_exists() {
    local secret_name=$1
    local default_value=$2

    if aws secretsmanager describe-secret --secret-id $secret_name --region $AWS_REGION > /dev/null 2>&1; then
        echo "  Secret $secret_name already exists"
    else
        aws secretsmanager create-secret \
            --name $secret_name \
            --secret-string "$default_value" \
            --region $AWS_REGION > /dev/null
        echo -e "  ${GREEN}Created $secret_name${NC}"
    fi
}

create_secret_if_not_exists "physician-voice-agent/livekit" '{"LIVEKIT_URL":"wss://your-app.livekit.cloud","LIVEKIT_API_KEY":"your-key","LIVEKIT_API_SECRET":"your-secret"}'
create_secret_if_not_exists "physician-voice-agent/openai" '{"OPENAI_API_KEY":"sk-your-key"}'
create_secret_if_not_exists "physician-voice-agent/deepgram" '{"DEEPGRAM_API_KEY":"your-key"}'
create_secret_if_not_exists "physician-voice-agent/elevenlabs" '{"ELEVEN_API_KEY":"your-key"}'
create_secret_if_not_exists "physician-voice-agent/aws-s3" '{"AWS_ACCESS_KEY_ID":"your-key","AWS_SECRET_ACCESS_KEY":"your-secret","AWS_S3_BUCKET":"voice-exp-recordings"}'

# ============================================
# Phase 5: ECS Cluster
# ============================================
echo -e "${BLUE}Phase 5: Creating ECS Cluster...${NC}"

if aws ecs describe-clusters --clusters $ECS_CLUSTER --region $AWS_REGION --query 'clusters[0].status' --output text 2>/dev/null | grep -q "ACTIVE"; then
    echo "ECS cluster already exists"
else
    aws ecs create-cluster \
        --cluster-name $ECS_CLUSTER \
        --capacity-providers FARGATE FARGATE_SPOT \
        --default-capacity-provider-strategy capacityProvider=FARGATE_SPOT,weight=4 capacityProvider=FARGATE,weight=1 \
        --region $AWS_REGION
    echo -e "${GREEN}ECS cluster created${NC}"
fi

# ============================================
# Phase 6: Get Default VPC and Subnets
# ============================================
echo -e "${BLUE}Phase 6: Getting VPC Configuration...${NC}"

DEFAULT_VPC=$(aws ec2 describe-vpcs --filters "Name=isDefault,Values=true" --query 'Vpcs[0].VpcId' --output text --region $AWS_REGION)
SUBNETS=$(aws ec2 describe-subnets --filters "Name=vpc-id,Values=$DEFAULT_VPC" --query 'Subnets[*].SubnetId' --output text --region $AWS_REGION | tr '\t' ',')
DEFAULT_SG=$(aws ec2 describe-security-groups --filters "Name=vpc-id,Values=$DEFAULT_VPC" "Name=group-name,Values=default" --query 'SecurityGroups[0].GroupId' --output text --region $AWS_REGION)

echo "VPC: $DEFAULT_VPC"
echo "Subnets: $SUBNETS"
echo "Security Group: $DEFAULT_SG"

# ============================================
# Phase 7: Register Task Definition
# ============================================
echo -e "${BLUE}Phase 7: Registering Task Definition...${NC}"

# Generate task definition with actual values
cat > /tmp/task-definition.json << EOF
{
  "family": "physician-voice-agent",
  "networkMode": "awsvpc",
  "requiresCompatibilities": ["FARGATE"],
  "cpu": "512",
  "memory": "1024",
  "executionRoleArn": "arn:aws:iam::${AWS_ACCOUNT_ID}:role/ecsTaskExecutionRole",
  "taskRoleArn": "arn:aws:iam::${AWS_ACCOUNT_ID}:role/physician-voice-agent-task-role",
  "containerDefinitions": [
    {
      "name": "physician-voice-agent",
      "image": "${AWS_ACCOUNT_ID}.dkr.ecr.${AWS_REGION}.amazonaws.com/physician-voice-agent:latest",
      "essential": true,
      "portMappings": [],
      "environment": [
        {"name": "AWS_REGION", "value": "${AWS_REGION}"}
      ],
      "secrets": [
        {"name": "LIVEKIT_URL", "valueFrom": "arn:aws:secretsmanager:${AWS_REGION}:${AWS_ACCOUNT_ID}:secret:physician-voice-agent/livekit:LIVEKIT_URL::"},
        {"name": "LIVEKIT_API_KEY", "valueFrom": "arn:aws:secretsmanager:${AWS_REGION}:${AWS_ACCOUNT_ID}:secret:physician-voice-agent/livekit:LIVEKIT_API_KEY::"},
        {"name": "LIVEKIT_API_SECRET", "valueFrom": "arn:aws:secretsmanager:${AWS_REGION}:${AWS_ACCOUNT_ID}:secret:physician-voice-agent/livekit:LIVEKIT_API_SECRET::"},
        {"name": "OPENAI_API_KEY", "valueFrom": "arn:aws:secretsmanager:${AWS_REGION}:${AWS_ACCOUNT_ID}:secret:physician-voice-agent/openai:OPENAI_API_KEY::"},
        {"name": "DEEPGRAM_API_KEY", "valueFrom": "arn:aws:secretsmanager:${AWS_REGION}:${AWS_ACCOUNT_ID}:secret:physician-voice-agent/deepgram:DEEPGRAM_API_KEY::"},
        {"name": "ELEVEN_API_KEY", "valueFrom": "arn:aws:secretsmanager:${AWS_REGION}:${AWS_ACCOUNT_ID}:secret:physician-voice-agent/elevenlabs:ELEVEN_API_KEY::"},
        {"name": "AWS_ACCESS_KEY_ID", "valueFrom": "arn:aws:secretsmanager:${AWS_REGION}:${AWS_ACCOUNT_ID}:secret:physician-voice-agent/aws-s3:AWS_ACCESS_KEY_ID::"},
        {"name": "AWS_SECRET_ACCESS_KEY", "valueFrom": "arn:aws:secretsmanager:${AWS_REGION}:${AWS_ACCOUNT_ID}:secret:physician-voice-agent/aws-s3:AWS_SECRET_ACCESS_KEY::"},
        {"name": "AWS_S3_BUCKET", "valueFrom": "arn:aws:secretsmanager:${AWS_REGION}:${AWS_ACCOUNT_ID}:secret:physician-voice-agent/aws-s3:AWS_S3_BUCKET::"}
      ],
      "logConfiguration": {
        "logDriver": "awslogs",
        "options": {
          "awslogs-group": "/ecs/physician-voice-agent",
          "awslogs-region": "${AWS_REGION}",
          "awslogs-stream-prefix": "agent"
        }
      }
    }
  ]
}
EOF

aws ecs register-task-definition \
    --cli-input-json file:///tmp/task-definition.json \
    --region $AWS_REGION > /dev/null

echo -e "${GREEN}Task definition registered${NC}"

# ============================================
# Phase 8: Create ECS Service
# ============================================
echo -e "${BLUE}Phase 8: Creating ECS Service...${NC}"

# Convert subnets to JSON array
SUBNET_ARRAY=$(echo $SUBNETS | tr ',' '\n' | sed 's/^/"/;s/$/"/' | tr '\n' ',' | sed 's/,$//')

if aws ecs describe-services --cluster $ECS_CLUSTER --services $ECS_SERVICE --region $AWS_REGION --query 'services[0].status' --output text 2>/dev/null | grep -q "ACTIVE"; then
    echo "ECS service already exists"
else
    aws ecs create-service \
        --cluster $ECS_CLUSTER \
        --service-name $ECS_SERVICE \
        --task-definition physician-voice-agent \
        --desired-count 1 \
        --launch-type FARGATE \
        --network-configuration "awsvpcConfiguration={subnets=[$SUBNET_ARRAY],securityGroups=[\"$DEFAULT_SG\"],assignPublicIp=ENABLED}" \
        --region $AWS_REGION > /dev/null
    echo -e "${GREEN}ECS service created${NC}"
fi

# ============================================
# Phase 9: Auto Scaling
# ============================================
echo -e "${BLUE}Phase 9: Setting up Auto Scaling...${NC}"

# Register scalable target
aws application-autoscaling register-scalable-target \
    --service-namespace ecs \
    --scalable-dimension ecs:service:DesiredCount \
    --resource-id service/$ECS_CLUSTER/$ECS_SERVICE \
    --min-capacity 1 \
    --max-capacity 50 \
    --region $AWS_REGION 2>/dev/null || echo "Scalable target may already exist"

# Create scaling policy
aws application-autoscaling put-scaling-policy \
    --service-namespace ecs \
    --scalable-dimension ecs:service:DesiredCount \
    --resource-id service/$ECS_CLUSTER/$ECS_SERVICE \
    --policy-name physician-voice-agent-cpu-scaling \
    --policy-type TargetTrackingScaling \
    --target-tracking-scaling-policy-configuration '{
        "TargetValue": 60.0,
        "PredefinedMetricSpecification": {
            "PredefinedMetricType": "ECSServiceAverageCPUUtilization"
        },
        "ScaleOutCooldown": 60,
        "ScaleInCooldown": 300
    }' \
    --region $AWS_REGION > /dev/null 2>&1 || echo "Scaling policy may already exist"

echo -e "${GREEN}Auto scaling configured${NC}"

# ============================================
# Done
# ============================================
echo ""
echo -e "${GREEN}=== Setup Complete ===${NC}"
echo ""
echo -e "${YELLOW}IMPORTANT: Update secrets with real values:${NC}"
echo ""
echo "aws secretsmanager put-secret-value --secret-id physician-voice-agent/livekit --secret-string '{\"LIVEKIT_URL\":\"wss://your-app.livekit.cloud\",\"LIVEKIT_API_KEY\":\"your-key\",\"LIVEKIT_API_SECRET\":\"your-secret\"}' --region $AWS_REGION"
echo ""
echo "aws secretsmanager put-secret-value --secret-id physician-voice-agent/openai --secret-string '{\"OPENAI_API_KEY\":\"sk-your-key\"}' --region $AWS_REGION"
echo ""
echo "aws secretsmanager put-secret-value --secret-id physician-voice-agent/deepgram --secret-string '{\"DEEPGRAM_API_KEY\":\"your-key\"}' --region $AWS_REGION"
echo ""
echo "aws secretsmanager put-secret-value --secret-id physician-voice-agent/elevenlabs --secret-string '{\"ELEVEN_API_KEY\":\"your-key\"}' --region $AWS_REGION"
echo ""
echo -e "${YELLOW}Then build and deploy:${NC}"
echo "  ./deploy.sh"
