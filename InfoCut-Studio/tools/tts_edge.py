"""edge-tts 로 문장을 읽고, 단어별 시작 시간을 JSON 으로 남긴다.

사용: python tts_edge.py --text "문장" --voice ko-KR-InJoonNeural --rate +8% --out a.mp3 --words a.json
"""
import argparse
import asyncio
import json
import sys


async def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--text", required=True)
    ap.add_argument("--voice", default="ko-KR-InJoonNeural")
    ap.add_argument("--rate", default="+0%")
    ap.add_argument("--out", required=True)
    ap.add_argument("--words", required=True)
    a = ap.parse_args()
    try:
        import edge_tts  # type: ignore
    except ImportError:
        print("edge-tts 가 설치되어 있지 않아요: pip install edge-tts", file=sys.stderr)
        sys.exit(3)

    try:
        comm = edge_tts.Communicate(a.text, a.voice, rate=a.rate, boundary="WordBoundary")
    except TypeError:  # 옛 버전
        comm = edge_tts.Communicate(a.text, a.voice, rate=a.rate)
    words = []
    with open(a.out, "wb") as f:
        async for chunk in comm.stream():
            if chunk["type"] == "audio":
                f.write(chunk["data"])
            elif chunk["type"] == "WordBoundary":
                words.append({"offset": chunk["offset"] / 10_000_000, "text": chunk["text"]})
    with open(a.words, "w", encoding="utf-8") as f:
        json.dump(words, f, ensure_ascii=False)


if __name__ == "__main__":
    if sys.platform == "win32":
        asyncio.set_event_loop_policy(asyncio.WindowsSelectorEventLoopPolicy())
    asyncio.run(main())
