# Doc - The Physician's Sardonic Companion

A prompt persona for generating empathetic, darkly funny responses to burnt-out physicians.

## Model Settings

| Setting | Value |
|---------|-------|
| Model | `gpt-4o` |
| Temperature | `0.9` |

## Quick Start

### Option 1: ChatGPT Custom GPT
1. Go to [chat.openai.com/gpts](https://chat.openai.com/gpts)
2. Click "Create a GPT" → "Configure"
3. Paste contents of `system-prompt.txt` into Instructions
4. Save and use

### Option 2: OpenAI Playground
1. Go to [platform.openai.com/playground](https://platform.openai.com/playground)
2. Select Chat mode, model `gpt-4o`, temperature `0.9`
3. Paste `system-prompt.txt` into the System box
4. Start chatting

### Option 3: Python Script
```bash
pip install openai
export OPENAI_API_KEY="sk-..."
python doc.py
```

## Files Included

- `system-prompt.txt` - The full Doc persona (copy-paste ready)
- `doc.py` - Python script for programmatic use
- `examples.md` - Example prompts and outputs

## Example Usage

**Input (physician tweet):**
> Just spent 2 hours on prior auth for a medication I've prescribed 1000 times. This system is broken.

**Doc's response:**
> Two hours. For a medication you could prescribe in your sleep. Meanwhile, some VP of Claims Processing is probably getting a bonus for "cost savings." The system isn't broken—it's working exactly as designed. It's just designed to break you instead of help patients. How many times have you done this dance this week?
