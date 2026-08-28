#!/usr/bin/env python3
"""Print one Quran ayah reminder from a curated reference list."""

from __future__ import annotations

import argparse
import json
import secrets
import sys
from urllib.error import HTTPError, URLError
from urllib.request import urlopen


REFERENCES = (
    "1:1", "1:2", "1:3", "1:4", "1:5", "1:6", "1:7",
    "2:45", "2:152", "2:153", "2:156", "2:177", "2:183", "2:186",
    "2:201", "2:255", "2:256", "2:257", "2:285", "2:286",
    "3:26", "3:27", "3:31", "3:38", "3:103", "3:135", "3:159",
    "3:173", "3:185", "3:191", "3:200",
    "4:36", "4:103", "4:135", "4:136", "4:147",
    "5:3", "5:32", "5:35", "5:114",
    "6:59", "6:102", "6:103", "6:125", "6:151", "6:153", "6:162",
    "6:163", "7:23", "7:31", "7:43", "7:54", "7:56", "7:180",
    "9:51", "10:62", "12:87", "13:11", "13:28", "14:7", "14:40",
    "14:41", "16:90", "16:97", "17:23", "17:24", "17:70", "17:82",
    "18:10", "18:46", "18:109", "20:25", "20:26", "20:27", "20:28",
    "20:114", "21:30", "21:35", "21:83", "21:87", "21:89",
    "23:1", "23:2", "23:8", "23:10", "23:11", "23:14", "23:115",
    "23:116", "23:118", "24:35", "25:63", "25:74", "28:24",
    "29:69", "33:35", "33:41", "33:56", "39:53", "40:60",
)

API = "https://api.alquran.cloud/v1/ayah/{}/editions/quran-uthmani,en.pickthall"


def fetch(reference: str) -> list[dict]:
    with urlopen(API.format(reference), timeout=8) as response:
        payload = json.load(response)
    if payload.get("code") != 200 or len(payload.get("data", [])) != 2:
        raise ValueError("unexpected response from Quran source")
    return payload["data"]


def render(data: list[dict], language: str) -> str:
    arabic, english = data
    reference = f"{arabic['surah']['englishName']} {arabic['surah']['number']}:{arabic['numberInSurah']}"
    lines = []
    if language in {"ar", "both"}:
        lines.append(f"﴿{arabic['text']}﴾")
    if language in {"en", "both"}:
        lines.append(english["text"])
    lines.append(f"— {reference}")
    return "\n\n".join(lines)


def self_check() -> None:
    assert len(REFERENCES) == 100
    assert len(set(REFERENCES)) == 100
    sample = [
        {"text": "نَصّ", "surah": {"englishName": "Test", "number": 1}, "numberInSurah": 2},
        {"text": "Meaning"},
    ]
    assert render(sample, "ar") == "﴿نَصّ﴾\n\n— Test 1:2"
    assert render(sample, "en") == "Meaning\n\n— Test 1:2"
    assert "﴿نَصّ﴾\n\nMeaning" in render(sample, "both")


def main() -> int:
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--language", choices=("ar", "en", "both"), default="both")
    parser.add_argument("--check", action="store_true", help="run offline checks")
    args = parser.parse_args()

    if args.check:
        self_check()
        print("ok")
        return 0

    try:
        print(render(fetch(secrets.choice(REFERENCES)), args.language))
    except (HTTPError, URLError, TimeoutError, ValueError, KeyError, json.JSONDecodeError) as error:
        print(f"Could not retrieve an ayah safely: {error}", file=sys.stderr)
        return 1
    return 0


if __name__ == "__main__":
    raise SystemExit(main())
