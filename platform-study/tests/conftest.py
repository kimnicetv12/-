"""저장소 어디서 pytest를 돌려도 collector·analysis 패키지를 찾도록 연구 폴더를 경로에 넣는다."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))
