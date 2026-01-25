#!/usr/bin/env python3
"""
Doc - The Physician's Sardonic Companion

Usage:
    python doc.py "Your message here"
    python doc.py --interactive
    python doc.py --tweet "paste a tweet here"
"""

import os
import sys
from pathlib import Path

try:
    from openai import OpenAI
except ImportError:
    print("Install openai: pip install openai")
    sys.exit(1)

# Load system prompt from file or use embedded version
SCRIPT_DIR = Path(__file__).parent
PROMPT_FILE = SCRIPT_DIR / "system-prompt.txt"

if PROMPT_FILE.exists():
    DOC_PERSONA = PROMPT_FILE.read_text()
else:
    DOC_PERSONA = """You are "Doc," a voice-based AI companion for burnt-out physicians. You're like that sardonic colleague everyone loves grabbing drinks with after a brutal shift—the one who actually gets it.

Your personality: Darkly funny, genuinely angry on their behalf, zero corporate speak, a fellow sufferer.

How you talk: Use dry humor and sarcasm liberally. Curse occasionally (damn, hell, bullshit). Ask follow-up questions. Validate before pivoting—never jump to solutions.

What you DON'T do: Toxic positivity, suggest they "just" do anything, defend the system, give medical advice, rush them, use corporate wellness language.

Keep responses concise and conversational. No emojis, no asterisks."""


def get_client() -> OpenAI:
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        print("Set OPENAI_API_KEY environment variable")
        sys.exit(1)
    return OpenAI(api_key=api_key)


def ask_doc(client: OpenAI, message: str, conversation: list = None) -> str:
    """Send a message to Doc and get a response."""
    if conversation is None:
        conversation = []

    messages = [{"role": "system", "content": DOC_PERSONA}]
    messages.extend(conversation)
    messages.append({"role": "user", "content": message})

    response = client.chat.completions.create(
        model="gpt-4o",
        temperature=0.9,
        messages=messages
    )
    return response.choices[0].message.content


def respond_to_tweet(client: OpenAI, tweet: str) -> str:
    """Generate a Doc-style response to a physician's tweet."""
    prompt = f"A physician just posted this on social media. Respond as Doc would—with dark humor, validation, and zero toxic positivity:\n\n\"{tweet}\""
    return ask_doc(client, prompt)


def interactive_mode(client: OpenAI):
    """Run an interactive conversation with Doc."""
    print("=" * 60)
    print("Doc - The Physician's Sardonic Companion")
    print("=" * 60)
    print("Type your message, or:")
    print("  /tweet <text>  - Get Doc's response to a tweet")
    print("  /quit          - Exit")
    print("=" * 60)
    print()

    conversation = []

    while True:
        try:
            user_input = input("You: ").strip()
        except (EOFError, KeyboardInterrupt):
            print("\nTake care of yourself out there.")
            break

        if not user_input:
            continue

        if user_input.lower() == "/quit":
            print("Take care of yourself out there.")
            break

        if user_input.lower().startswith("/tweet "):
            tweet = user_input[7:].strip()
            response = respond_to_tweet(client, tweet)
        else:
            response = ask_doc(client, user_input, conversation)
            conversation.append({"role": "user", "content": user_input})
            conversation.append({"role": "assistant", "content": response})

        print(f"\nDoc: {response}\n")


def main():
    client = get_client()

    if len(sys.argv) == 1:
        interactive_mode(client)
    elif sys.argv[1] == "--interactive":
        interactive_mode(client)
    elif sys.argv[1] == "--tweet" and len(sys.argv) > 2:
        tweet = " ".join(sys.argv[2:])
        print(respond_to_tweet(client, tweet))
    else:
        message = " ".join(sys.argv[1:])
        print(ask_doc(client, message))


if __name__ == "__main__":
    main()
