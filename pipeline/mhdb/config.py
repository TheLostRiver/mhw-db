"""本地配置与仓库路径。

本机相关的路径（游戏目录、Oodle 库）写在 pipeline/local.toml（不入库），
可用环境变量 MHDB_GAME_DIR / MHDB_OODLE_DLL 覆盖。
"""

import os
import tomllib
from dataclasses import dataclass
from pathlib import Path

PIPELINE = Path(__file__).resolve().parent.parent
REPO = PIPELINE.parent
DATA_RAW = REPO / "data-raw"
DATA = REPO / "data"
LOCAL_TOML = PIPELINE / "local.toml"


@dataclass(frozen=True)
class Config:
    game_dir: Path | None
    oodle_dll: Path | None


def load_config(path: Path = LOCAL_TOML) -> Config:
    raw = tomllib.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
    game = os.environ.get("MHDB_GAME_DIR") or raw.get("game", {}).get("dir")
    oodle = os.environ.get("MHDB_OODLE_DLL") or raw.get("oodle", {}).get("dll")
    return Config(
        game_dir=Path(game) if game else None,
        oodle_dll=Path(oodle) if oodle else None,
    )
