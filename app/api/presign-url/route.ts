import { NextRequest, NextResponse } from 'next/server';
import { S3Client, GetObjectCommand } from '@aws-sdk/client-s3';
import { getSignedUrl } from '@aws-sdk/s3-request-presigner';

const s3Client = new S3Client({
  region: process.env.AWS_REGION || 'us-east-1',
  credentials: {
    accessKeyId: process.env.AWS_ACCESS_KEY_ID!,
    secretAccessKey: process.env.AWS_SECRET_ACCESS_KEY!,
  },
});

const BUCKET = process.env.AWS_S3_BUCKET || 'voice-exp-recordings';

// Extract S3 key from various URL formats
function extractS3Key(url: string): string | null {
  // Format: https://bucket.s3.region.amazonaws.com/key (with region)
  const s3RegionalMatch = url.match(/https:\/\/[^/]+\.s3\.[^/]+\.amazonaws\.com\/(.+)/);
  if (s3RegionalMatch) return decodeURIComponent(s3RegionalMatch[1]);

  // Format: https://bucket.s3.amazonaws.com/key (without region)
  const s3GlobalMatch = url.match(/https:\/\/[^/]+\.s3\.amazonaws\.com\/(.+)/);
  if (s3GlobalMatch) return decodeURIComponent(s3GlobalMatch[1]);

  // Format: https://s3.region.amazonaws.com/bucket/key
  const s3PathMatch = url.match(/https:\/\/s3\.[^/]+\.amazonaws\.com\/[^/]+\/(.+)/);
  if (s3PathMatch) return decodeURIComponent(s3PathMatch[1]);

  // Format: s3://bucket/key
  const s3UriMatch = url.match(/^s3:\/\/[^/]+\/(.+)$/);
  if (s3UriMatch) return decodeURIComponent(s3UriMatch[1]);

  return null;
}

export async function POST(request: NextRequest) {
  try {
    const { url } = await request.json();

    console.log('Presign URL request:', { url });

    if (!url) {
      return NextResponse.json({ error: 'URL is required' }, { status: 400 });
    }

    const key = extractS3Key(url);
    console.log('Extracted S3 key:', { url, key });

    if (!key) {
      return NextResponse.json({ error: 'Invalid S3 URL format', receivedUrl: url }, { status: 400 });
    }

    const command = new GetObjectCommand({
      Bucket: BUCKET,
      Key: key,
    });

    // Generate presigned URL valid for 1 hour
    const presignedUrl = await getSignedUrl(s3Client, command, { expiresIn: 3600 });

    return NextResponse.json({ presignedUrl });
  } catch (error) {
    console.error('Presign URL error:', error);
    return NextResponse.json(
      { error: error instanceof Error ? error.message : 'Failed to generate presigned URL' },
      { status: 500 }
    );
  }
}
