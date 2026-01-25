# Video Clip Generator Lambda

AWS Lambda function that uses FFmpeg to generate video clips from call recordings.

## Architecture

```
Next.js API                        AWS Lambda
┌──────────────────┐              ┌─────────────────────────────┐
│ /api/generate-   │    POST      │  clip-generator             │
│    clip          │ ──────────>  │                             │
│                  │              │  1. Download recording URL  │
│ - Fetch call     │              │  2. Slice audio (FFmpeg)    │
│ - Generate image │              │  3. Combine img+audio       │
│ - Call Lambda    │  <────────── │  4. Upload to Supabase      │
│ - Return URL     │   clipUrl    │  5. Return public URL       │
└──────────────────┘              └─────────────────────────────┘
```

## Prerequisites

1. **AWS CLI** configured with appropriate credentials
2. **AWS SAM CLI** installed: `brew install aws-sam-cli`
3. **Supabase Storage bucket** named `clips` (must be public)

## Deployment

### 1. Create Supabase Storage Bucket

In your Supabase dashboard:
1. Go to Storage
2. Create a new bucket named `clips`
3. Make it **public** (enable public access)

### 2. Deploy Lambda

```bash
cd aws-lambda/clip-generator

# First time: guided deployment
sam build
sam deploy --guided

# You'll be prompted for:
# - Stack name: physician-clip-generator
# - Region: us-east-1 (or your preferred region)
# - SupabaseUrl: https://your-project.supabase.co
# - SupabaseServiceKey: your-service-role-key
# - Environment: production
```

### 3. Get the API Endpoint

After deployment, SAM will output the API endpoint URL:

```
Outputs
-------------------------------------------------
ApiEndpoint: https://xxxx.execute-api.us-east-1.amazonaws.com/production
GenerateClipUrl: https://xxxx.execute-api.us-east-1.amazonaws.com/production/generate-clip
```

### 4. Configure Next.js

Add the Lambda URL to your environment variables:

```bash
# .env.local (development)
CLIP_LAMBDA_URL=https://xxxx.execute-api.us-east-1.amazonaws.com/production/generate-clip

# Vercel (production)
# Add in Vercel dashboard under Environment Variables
```

## Lambda Request Format

```json
{
  "recording_url": "https://s3.amazonaws.com/bucket/recording.m4a",
  "start_seconds": 10.5,
  "end_seconds": 25.3,
  "chat_image_base64": "iVBORw0KGgo...",
  "call_id": "uuid-of-call",
  "exchange_index": 0
}
```

## Lambda Response Format

Success:
```json
{
  "clipUrl": "https://your-project.supabase.co/storage/v1/object/public/clips/callid_0_abc123.mp4"
}
```

Error:
```json
{
  "error": "Error message"
}
```

## FFmpeg Layer

This Lambda uses the public FFmpeg layer maintained by serverlesspub:
- ARN: `arn:aws:lambda:{region}:764866452798:layer:ffmpeg:1`
- GitHub: https://github.com/serverlesspub/ffmpeg-aws-lambda-layer

The FFmpeg binary is available at `/opt/bin/ffmpeg`.

## Updating

```bash
cd aws-lambda/clip-generator
sam build
sam deploy
```

## Monitoring

View Lambda logs in CloudWatch:
```bash
sam logs -n ClipGeneratorFunction --stack-name physician-clip-generator --tail
```

## Cost Estimation

- Lambda: ~$0.20 per 1M requests + compute time
- API Gateway: ~$3.50 per 1M requests
- Data transfer: ~$0.09/GB

For typical usage (1000 clips/month @ 30s each):
- Estimated cost: < $1/month

## Troubleshooting

### "FFmpeg not found"
The FFmpeg layer may not be available in your region. Check:
```bash
aws lambda list-layer-versions --layer-name ffmpeg --region YOUR_REGION
```

Alternative: Build your own FFmpeg layer using the serverlesspub repo.

### "Permission denied"
Ensure:
1. Lambda has internet access (for downloading recording URLs)
2. Supabase service key has storage permissions
3. The `clips` bucket exists and is accessible

### "Timeout"
Default timeout is 3 minutes. For longer videos, increase in template.yaml:
```yaml
Timeout: 300  # 5 minutes
```
