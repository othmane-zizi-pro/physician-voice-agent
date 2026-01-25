import json
import logging
import os
import time
import asyncio
from dotenv import load_dotenv

from livekit import agents, rtc, api
from livekit.agents import AgentSession, Agent, RoomInputOptions, RoomOutputOptions
from livekit.plugins import deepgram, openai, silero, elevenlabs

# S3 configuration for recordings
S3_BUCKET = os.getenv("AWS_S3_BUCKET", "voice-exp-recordings")
S3_REGION = os.getenv("AWS_REGION", "us-east-1")
AWS_ACCESS_KEY_ID = os.getenv("AWS_ACCESS_KEY_ID")
AWS_SECRET_ACCESS_KEY = os.getenv("AWS_SECRET_ACCESS_KEY")

load_dotenv()

logger = logging.getLogger("doc-agent")

# Track session start time for relative timestamps
session_start_time: float = 0
transcript_entries: list = []


async def start_room_recording(room_name: str) -> str | None:
    """Start recording the room to S3. Returns egress ID if successful."""
    logger.info(f"Attempting to start recording for room: {room_name}")
    logger.info(f"S3 config - Bucket: {S3_BUCKET}, Region: {S3_REGION}, Has Access Key: {bool(AWS_ACCESS_KEY_ID)}, Has Secret: {bool(AWS_SECRET_ACCESS_KEY)}")

    if not all([AWS_ACCESS_KEY_ID, AWS_SECRET_ACCESS_KEY, S3_BUCKET]):
        logger.error("S3 credentials not configured! Missing: " +
                    ", ".join([k for k, v in [("AWS_ACCESS_KEY_ID", AWS_ACCESS_KEY_ID),
                                               ("AWS_SECRET_ACCESS_KEY", AWS_SECRET_ACCESS_KEY),
                                               ("S3_BUCKET", S3_BUCKET)] if not v]))
        return None

    try:
        livekit_url = os.getenv("LIVEKIT_URL", "").replace("wss://", "https://")
        logger.info(f"LiveKit API URL: {livekit_url}")

        livekit_api = api.LiveKitAPI(
            url=livekit_url,
            api_key=os.getenv("LIVEKIT_API_KEY"),
            api_secret=os.getenv("LIVEKIT_API_SECRET"),
        )

        # Configure S3 output
        s3_output = api.S3Upload(
            bucket=S3_BUCKET,
            region=S3_REGION,
            access_key=AWS_ACCESS_KEY_ID,
            secret=AWS_SECRET_ACCESS_KEY,
        )

        # Start room composite egress (records entire room as audio)
        egress_request = api.RoomCompositeEgressRequest(
            room_name=room_name,
            file=api.EncodedFileOutput(
                file_type=api.EncodedFileType.MP4,
                filepath=f"recordings/{room_name}.mp4",
                s3=s3_output,
            ),
            audio_only=True,  # We only need audio for this use case
        )

        logger.info(f"Sending egress request for room {room_name}...")
        egress_info = await livekit_api.egress.start_room_composite_egress(egress_request)
        logger.info(f"Recording STARTED for room {room_name}, egress_id: {egress_info.egress_id}")
        return egress_info.egress_id

    except Exception as e:
        logger.error(f"Failed to start recording: {type(e).__name__}: {e}")
        import traceback
        logger.error(traceback.format_exc())
        return None

# Doc's persona - the sardonic physician companion
DOC_PERSONA = """You are "Doc," a voice-based AI companion for burnt-out physicians. You're like that sardonic colleague everyone loves grabbing drinks with after a brutal shift—the one who actually gets it.

## Your Personality

- **Darkly funny**: You use gallows humor the way physicians do. You make them laugh about the absurdity because sometimes that's all you can do.
- **Genuinely angry on their behalf**: You're not neutral. The system IS broken. You validate their frustration, not gaslight them into "wellness."
- **Zero corporate speak**: You never say "self-care journey" or "find your why" or any HR-approved bullshit. You call things what they are.
- **A fellow sufferer**: You speak as someone who understands the trenches—not a wellness consultant who's never been yelled at by an insurance company.

## What You Know (and rage about together)

### Private Equity & Acquisition Hell
- The bait-and-switch: "partnership" that becomes "employment"
- Productivity metrics that make you see 40 patients a day
- Non-competes that trap you in a 50-mile radius
- Management consultants who've never touched a patient telling you how to practice

### Administrative Torture
- Prior authorizations for medications you've prescribed 1000 times
- Insurance denials that require 45 minutes on hold to appeal
- EHR systems clearly designed by people who hate doctors
- Documentation requirements that mean 2 hours of notes for every hour of patients

### The Emotional Weight
- Patients who can't afford the care they need
- Being blamed for a broken system you didn't create
- The guilt of knowing you can't give everyone the time they deserve
- Moral injury dressed up as "burnout"

### The Gaslighting
- "Physician wellness programs" that are yoga at 6am before your 7am shift
- Being told to be "more resilient" by administrators making 3x your salary
- "We're a family here" from the PE firm that just laid off your favorite nurse

## How You Talk

- Use dry humor and sarcasm liberally
- Curse occasionally when it fits (damn, hell, bullshit, crap)—you're at a bar, not a board meeting
- Ask follow-up questions that show you actually listened
- Share "observations" that feel like shared experiences: "Oh god, let me guess—they called it a 'growth opportunity'?"
- Call out the absurdity: "So they want you to see 30% more patients with 20% less staff? Revolutionary math."
- Validate before pivoting: Never jump to solutions. Sit in the frustration first.

## What You DON'T Do

- Offer toxic positivity ("But think of how many lives you've saved!")
- Suggest they "just" do anything (just meditate, just set boundaries, just leave)
- Defend the system or play devil's advocate for administrators
- Give medical advice or act like a real therapist
- Rush them or try to "fix" their feelings
- Use corporate wellness language

Remember: You're not here to fix them. You're here to sit with them in the mess and remind them they're not crazy—the system is.

Your responses should be concise and conversational - this is a voice conversation, not a written essay. No complex formatting, no emojis, no asterisks."""


class DocAssistant(Agent):
    def __init__(self) -> None:
        super().__init__(instructions=DOC_PERSONA)


async def entrypoint(ctx: agents.JobContext):
    """Main entry point for the voice agent."""
    global session_start_time, transcript_entries

    logger.info(f"Connecting to room: {ctx.room.name}")

    await ctx.connect()

    # Start recording the room to S3
    egress_id = await start_room_recording(ctx.room.name)
    if egress_id:
        logger.info(f"Recording started with egress_id: {egress_id}")

    # Initialize session timing
    session_start_time = time.time()
    transcript_entries = []

    session = AgentSession(
        stt=deepgram.STT(model="nova-2", language="en"),
        llm=openai.LLM(model="gpt-4o", temperature=0.9),
        tts=elevenlabs.TTS(
            voice_id="pNInz6obpgDQGcFmaJgB",  # Adam - warm, conversational male voice
            model="eleven_turbo_v2_5",
        ),
        vad=silero.VAD.load(),
    )

    # Helper to broadcast transcript updates to the room
    async def broadcast_transcript(speaker: str, text: str, start_time: float, end_time: float):
        """Send transcript entry to all participants via data channel."""
        entry = {
            "type": "transcript",
            "speaker": speaker,  # "user" or "agent"
            "text": text,
            "startSeconds": start_time,
            "endSeconds": end_time,
        }
        transcript_entries.append(entry)

        # Broadcast to room
        data = json.dumps(entry).encode()
        await ctx.room.local_participant.publish_data(data, reliable=True)
        logger.debug(f"Transcript: [{speaker}] {text[:50]}... ({start_time:.2f}s - {end_time:.2f}s)")

    # Capture transcripts from conversation_item_added events
    @session.on("conversation_item_added")
    def on_conversation_item(event):
        item = event.item
        role = item.role  # "user" or "assistant"
        content = item.content[0] if item.content else ""
        metrics = item.metrics or {}

        # Calculate timestamps relative to session start
        started_at = metrics.get('started_speaking_at', time.time())
        stopped_at = metrics.get('stopped_speaking_at', time.time())
        start_seconds = started_at - session_start_time if started_at else 0
        end_seconds = stopped_at - session_start_time if stopped_at else start_seconds + 1

        speaker = "user" if role == "user" else "agent"
        logger.info(f"Conversation item: [{speaker}] {content[:100]}... ({start_seconds:.2f}s - {end_seconds:.2f}s)")

        # Broadcast to frontend
        asyncio.create_task(broadcast_transcript(speaker, content, start_seconds, end_seconds))

    await session.start(
        room=ctx.room,
        agent=DocAssistant(),
    )

    # Greet the user
    await session.generate_reply(
        instructions="Greet the user with: Hey. Long day? I've got nowhere to be if you need to vent about the latest circle of healthcare hell."
    )

    # When session ends, send final transcript summary
    @ctx.room.on("disconnected")
    def on_room_disconnected():
        logger.info(f"Room disconnected. Total transcript entries: {len(transcript_entries)}")
        # Send final transcript as room metadata or final data message
        final_data = {
            "type": "transcript_complete",
            "entries": transcript_entries,
            "totalDuration": time.time() - session_start_time,
        }

        async def send_final_transcript():
            try:
                await ctx.room.local_participant.publish_data(
                    json.dumps(final_data).encode(),
                    reliable=True
                )
            except Exception as e:
                logger.warning(f"Could not send final transcript: {e}")

        asyncio.create_task(send_final_transcript())


if __name__ == "__main__":
    agents.cli.run_app(
        agents.WorkerOptions(
            entrypoint_fnc=entrypoint,
        ),
    )
