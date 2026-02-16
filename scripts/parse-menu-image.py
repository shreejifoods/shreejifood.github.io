#!/usr/bin/env python3
"""
Parses the weekly menu.png image using AI Vision and generates menu.json.
Triggered by GitHub Action when menu.png is pushed.

Requires: OPENAI_API_KEY environment variable (or GEMINI_API_KEY)
"""

import os
import sys
import json
import base64
import urllib.request
import urllib.error

MENU_IMAGE_PATH = os.environ.get("MENU_IMAGE_PATH", "menu.png")
OUTPUT_JSON_PATH = os.environ.get("OUTPUT_JSON_PATH", "assets/data/menu.json")

# Existing delivery zones (preserved across updates)
DELIVERY_ZONES = [
    {"name": "Hatfield", "price": 2.00, "prefixes": ["AL10", "AL9"]},
    {"name": "Welwyn Garden City", "price": 3.00, "prefixes": ["AL8", "AL7"]},
    {"name": "Welham Green", "price": 3.00, "prefixes": ["AL9"]},
    {"name": "Brookmans Park", "price": 3.00, "prefixes": ["AL9"]},
    {"name": "St Albans", "price": 3.50, "prefixes": ["AL1", "AL2", "AL3", "AL4"]},
    {"name": "Potters Bar", "price": 3.50, "prefixes": ["EN6"]},
    {"name": "London Colney", "price": 3.50, "prefixes": ["AL2"]}
]

DAY_IDS = {
    "Monday": "mon_set",
    "Tuesday": "tue_set",
    "Wednesday": "wed_set",
    "Thursday": "thu_set",
    "Friday": "fri_set"
}

PROMPT = """You are analyzing a weekly dinner menu image from "Shreeji Food & Snacks".

The image shows a table with columns for each day (Monday through Friday).
Each column contains:
- The day name and price (e.g. "Monday £9")
- Food photos
- A list of food items included in that day's meal

Please extract the following information for EACH day and return it as a JSON array:

[
  {
    "day": "Monday",
    "price": 9.00,
    "items": "Item 1, Item 2, Item 3, Item 4",
    "name": "Monday Meal Set"
  },
  ...
]

Rules:
- Price must be a number (e.g. 9.00, not "£9")
- Items should be a comma-separated string of all food items listed for that day
- Include quantity info like "(x4)" or "(x3)" if shown
- If a day shows a snack item instead of a meal set, use "Day Snack" as the name (e.g. "Friday Snack")
- Return ONLY the JSON array, no markdown formatting, no explanation
"""


def parse_with_openai(image_base64: str) -> list:
    """Use OpenAI GPT-4o-mini Vision API to parse the menu image."""
    api_key = os.environ.get("OPENAI_API_KEY")
    if not api_key:
        raise ValueError("OPENAI_API_KEY environment variable not set")

    payload = json.dumps({
        "model": "gpt-4o-mini",
        "messages": [
            {
                "role": "user",
                "content": [
                    {"type": "text", "text": PROMPT},
                    {
                        "type": "image_url",
                        "image_url": {
                            "url": f"data:image/png;base64,{image_base64}"
                        }
                    }
                ]
            }
        ],
        "max_tokens": 1000,
        "temperature": 0.1
    }).encode("utf-8")

    req = urllib.request.Request(
        "https://api.openai.com/v1/chat/completions",
        data=payload,
        headers={
            "Content-Type": "application/json",
            "Authorization": f"Bearer {api_key}"
        }
    )

    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read().decode("utf-8"))

    content = result["choices"][0]["message"]["content"].strip()
    # Strip markdown code fences if present
    if content.startswith("```"):
        content = content.split("\n", 1)[1]
        content = content.rsplit("```", 1)[0]
    return json.loads(content)


def parse_with_gemini(image_base64: str) -> list:
    """Use Google Gemini Vision API to parse the menu image."""
    api_key = os.environ.get("GEMINI_API_KEY")
    if not api_key:
        raise ValueError("GEMINI_API_KEY environment variable not set")

    payload = json.dumps({
        "contents": [
            {
                "parts": [
                    {"text": PROMPT},
                    {
                        "inline_data": {
                            "mime_type": "image/png",
                            "data": image_base64
                        }
                    }
                ]
            }
        ],
        "generationConfig": {
            "temperature": 0.1,
            "maxOutputTokens": 1000
        }
    }).encode("utf-8")

    url = f"https://generativelanguage.googleapis.com/v1beta/models/gemini-2.0-flash:generateContent?key={api_key}"
    req = urllib.request.Request(
        url,
        data=payload,
        headers={"Content-Type": "application/json"}
    )

    with urllib.request.urlopen(req) as resp:
        result = json.loads(resp.read().decode("utf-8"))

    content = result["candidates"][0]["content"]["parts"][0]["text"].strip()
    if content.startswith("```"):
        content = content.split("\n", 1)[1]
        content = content.rsplit("```", 1)[0]
    return json.loads(content)


def build_menu_json(parsed_days: list) -> dict:
    """Convert parsed day data into the full menu.json structure."""
    menu = {}
    for day_data in parsed_days:
        day_name = day_data["day"]
        day_id = DAY_IDS.get(day_name, day_name.lower()[:3] + "_set")

        menu[day_name] = {
            "items": [
                {
                    "id": day_id,
                    "name": day_data.get("name", f"{day_name} Meal Set"),
                    "price": float(day_data["price"]),
                    "description": day_data["items"],
                    "image": "assets/images/menu.png"
                }
            ],
            "active": True
        }

    return {
        "currency": "£",
        "menu": menu,
        "delivery_zones": DELIVERY_ZONES
    }


def main():
    # Read and encode the image
    if not os.path.exists(MENU_IMAGE_PATH):
        print(f"Error: Menu image not found at {MENU_IMAGE_PATH}")
        sys.exit(1)

    with open(MENU_IMAGE_PATH, "rb") as f:
        image_base64 = base64.b64encode(f.read()).decode("utf-8")

    print(f"Read menu image: {MENU_IMAGE_PATH} ({os.path.getsize(MENU_IMAGE_PATH)} bytes)")

    # Try OpenAI first, fall back to Gemini
    parsed_days = None
    if os.environ.get("OPENAI_API_KEY"):
        print("Using OpenAI GPT-4o-mini for parsing...")
        try:
            parsed_days = parse_with_openai(image_base64)
            print("OpenAI parsing successful!")
        except Exception as e:
            print(f"OpenAI failed: {e}")

    if parsed_days is None and os.environ.get("GEMINI_API_KEY"):
        print("Using Google Gemini for parsing...")
        try:
            parsed_days = parse_with_gemini(image_base64)
            print("Gemini parsing successful!")
        except Exception as e:
            print(f"Gemini failed: {e}")

    if parsed_days is None:
        print("Error: No API key found. Set OPENAI_API_KEY or GEMINI_API_KEY")
        sys.exit(1)

    # Validate
    print(f"\nParsed {len(parsed_days)} days:")
    for day in parsed_days:
        print(f"  {day['day']}: £{day['price']} - {day['items']}")

    # Build and write JSON
    menu_json = build_menu_json(parsed_days)
    os.makedirs(os.path.dirname(OUTPUT_JSON_PATH), exist_ok=True)

    with open(OUTPUT_JSON_PATH, "w", encoding="utf-8") as f:
        json.dump(menu_json, f, indent=4, ensure_ascii=False)

    print(f"\nWrote {OUTPUT_JSON_PATH} successfully!")


if __name__ == "__main__":
    main()
