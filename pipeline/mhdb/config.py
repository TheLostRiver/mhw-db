"""本地配置与仓库路径。

本机相关的路径（游戏目录、Oodle 库、chunk 密钥表）写在 pipeline/local.toml（不入库），
可用环境变量 MHDB_GAME_DIR / MHDB_OODLE_DLL / MHDB_CHUNK_KEY 覆盖。
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
MANIFEST = PIPELINE / "manifest.toml"


@dataclass(frozen=True)
class Config:
    game_dir: Path | None
    oodle_dll: Path | None
    chunk_key: Path | None = None


def _pick(env: str, raw: dict, section: str, key: str) -> Path | None:
    value = os.environ.get(env) or raw.get(section, {}).get(key)
    return Path(value) if value else None


def load_config(path: Path = LOCAL_TOML) -> Config:
    raw = tomllib.loads(path.read_text(encoding="utf-8")) if path.is_file() else {}
    return Config(
        game_dir=_pick("MHDB_GAME_DIR", raw, "game", "dir"),
        oodle_dll=_pick("MHDB_OODLE_DLL", raw, "oodle", "dll"),
        chunk_key=_pick("MHDB_CHUNK_KEY", raw, "chunk", "key"),
    )
