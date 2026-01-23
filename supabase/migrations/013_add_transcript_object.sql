-- Add transcript_object column for storing timestamped transcript data
-- This supports the video clip feature which needs precise timing for each utterance

ALTER TABLE calls ADD COLUMN IF NOT EXISTS transcript_object JSONB;

-- Add livekit_room_name for LiveKit calls (reusing retell_call_id for now, but this is cleaner)
ALTER TABLE calls ADD COLUMN IF NOT EXISTS livekit_room_name TEXT;

COMMENT ON COLUMN calls.transcript_object IS 'JSON array of transcript entries with timestamps: [{speaker, text, startSeconds, endSeconds}]';
COMMENT ON COLUMN calls.livekit_room_name IS 'LiveKit room name for this call session';
