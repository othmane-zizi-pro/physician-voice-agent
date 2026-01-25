# aws-lambda/clip-generator/handler.py
"""
Lambda function for generating video clips using FFmpeg.
Uses a public FFmpeg Lambda layer.
"""

import json
import os
import subprocess
import base64
import urllib.request
import uuid
from typing import TypedDict

# Supabase setup
SUPABASE_URL = os.environ.get('SUPABASE_URL')
SUPABASE_SERVICE_KEY = os.environ.get('SUPABASE_SERVICE_KEY')
SUPABASE_BUCKET = 'clips'


class ClipRequest(TypedDict):
    recording_url: str
    start_seconds: float
    end_seconds: float
    chat_image_base64: str
    call_id: str
    exchange_index: int


def handler(event, context):
    """
    Lambda handler for generating video clips.

    Expected event body:
    {
        "recording_url": "https://...",
        "start_seconds": 10.5,
        "end_seconds": 25.3,
        "chat_image_base64": "base64...",
        "call_id": "uuid",
        "exchange_index": 0
    }
    """
    # Handle health check
    path = event.get('path', '') or event.get('rawPath', '')
    http_method = event.get('httpMethod', '') or event.get('requestContext', {}).get('http', {}).get('method', '')

    if path.endswith('/health') and http_method == 'GET':
        return health(event, context)

    try:
        # Parse request body
        if isinstance(event.get('body'), str):
            body = json.loads(event['body'])
        else:
            body = event.get('body', event)

        recording_url = body['recording_url']
        start_seconds = float(body['start_seconds'])
        end_seconds = float(body['end_seconds'])
        chat_image_base64 = body['chat_image_base64']
        call_id = body['call_id']
        exchange_index = int(body['exchange_index'])

        # Create temp directory for processing
        work_dir = f'/tmp/clip-{uuid.uuid4()}'
        os.makedirs(work_dir, exist_ok=True)

        try:
            # Define paths
            image_path = f'{work_dir}/chat.png'
            audio_path = f'{work_dir}/audio.m4a'
            output_path = f'{work_dir}/output.mp4'

            # Save chat image
            image_data = base64.b64decode(chat_image_base64)
            with open(image_path, 'wb') as f:
                f.write(image_data)

            # Slice recording using FFmpeg
            duration = end_seconds - start_seconds
            slice_cmd = [
                '/opt/bin/ffmpeg', '-y',
                '-ss', str(start_seconds),
                '-i', recording_url,
                '-t', str(duration),
                '-c:a', 'aac', '-b:a', '192k',
                audio_path
            ]

            result = subprocess.run(
                slice_cmd,
                capture_output=True,
                text=True,
                timeout=120
            )

            if result.returncode != 0:
                return {
                    'statusCode': 500,
                    'body': json.dumps({
                        'error': f'FFmpeg slice failed: {result.stderr}'
                    })
                }

            # Generate video combining image + audio
            video_cmd = [
                '/opt/bin/ffmpeg', '-y',
                '-loop', '1', '-i', image_path,
                '-i', audio_path,
                '-c:v', 'libx264', '-tune', 'stillimage', '-pix_fmt', 'yuv420p',
                '-c:a', 'aac', '-b:a', '192k',
                '-shortest',
                output_path
            ]

            result = subprocess.run(
                video_cmd,
                capture_output=True,
                text=True,
                timeout=120
            )

            if result.returncode != 0:
                return {
                    'statusCode': 500,
                    'body': json.dumps({
                        'error': f'FFmpeg video generation failed: {result.stderr}'
                    })
                }

            # Read the output video
            with open(output_path, 'rb') as f:
                video_data = f.read()

            # Upload to Supabase Storage
            file_name = f'{call_id}_{exchange_index}_{uuid.uuid4().hex[:8]}.mp4'
            upload_url = f'{SUPABASE_URL}/storage/v1/object/{SUPABASE_BUCKET}/{file_name}'

            req = urllib.request.Request(
                upload_url,
                data=video_data,
                headers={
                    'Authorization': f'Bearer {SUPABASE_SERVICE_KEY}',
                    'Content-Type': 'video/mp4',
                },
                method='POST'
            )

            try:
                with urllib.request.urlopen(req, timeout=60) as response:
                    upload_result = json.loads(response.read().decode())
            except urllib.error.HTTPError as e:
                error_body = e.read().decode()
                return {
                    'statusCode': 500,
                    'body': json.dumps({
                        'error': f'Supabase upload failed: {e.code} {error_body}'
                    })
                }

            # Get public URL
            public_url = f'{SUPABASE_URL}/storage/v1/object/public/{SUPABASE_BUCKET}/{file_name}'

            return {
                'statusCode': 200,
                'headers': {
                    'Content-Type': 'application/json',
                    'Access-Control-Allow-Origin': '*'
                },
                'body': json.dumps({
                    'clipUrl': public_url
                })
            }

        finally:
            # Cleanup work directory
            import shutil
            shutil.rmtree(work_dir, ignore_errors=True)

    except Exception as e:
        return {
            'statusCode': 500,
            'body': json.dumps({
                'error': str(e)
            })
        }


def health(event, context):
    """Health check endpoint."""
    # Check if FFmpeg is available
    try:
        result = subprocess.run(
            ['/opt/bin/ffmpeg', '-version'],
            capture_output=True,
            text=True,
            timeout=10
        )
        ffmpeg_available = result.returncode == 0
    except Exception:
        ffmpeg_available = False

    return {
        'statusCode': 200,
        'body': json.dumps({
            'status': 'healthy',
            'ffmpeg_available': ffmpeg_available
        })
    }
