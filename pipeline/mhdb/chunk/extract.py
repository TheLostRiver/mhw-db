"""按清单从 chunk 解包到 data-raw/。

- 合并文件表缓存在 data-raw/<game>/chunk_index.json，按各 chunk 的大小与修改时间判断是否失效。
- 解包完成后写 data-raw/<game>/extract.json：游戏版本、exe 指纹、chunk 指纹、解包时间、文件数，
  作为「数据版本」的来源。
"""

import hashlib
import json
import re
import time
import tomllib
from collections.abc import Callable, Iterable
from dataclasses import dataclass
from pathlib import Path

from mhdb.chunk.reader import ChunkFile, KeyPattern, Oodle, chunk_paths

INDEX_VERSION = 1
EXE_NAME = "MonsterHunterWorld.exe"
STEAM_APP_ID = 582010


@dataclass(frozen=True)
class IndexEntry:
    chunk: str
    size: int
    offset: int


def chunk_fingerprint(game_dir: Path) -> dict:
    chunks = [
        {"name": p.name, "size": p.stat().st_size, "mtime": int(p.stat().st_mtime)}
        for p in chunk_paths(game_dir)
    ]
    digest = hashlib.sha256(json.dumps(chunks, sort_keys=True).encode()).hexdigest()[:16]
    return {"chunks": chunks, "digest": digest}


def load_manifest(path: Path, game: str = "world") -> list[str]:
    return tomllib.loads(path.read_text(encoding="utf-8"))[game]["patterns"]


def select(paths: Iterable[str], patterns: list[str]) -> list[str]:
    rxs = [re.compile(p, re.IGNORECASE) for p in patterns]
    return sorted(p for p in paths if any(rx.search(p) for rx in rxs))


def build_index(
    game_dir: Path, oodle: Oodle, keys: KeyPattern, log: Callable[[str], None]
) -> dict[str, IndexEntry]:
    merged: dict[str, IndexEntry] = {}
    for path in chunk_paths(game_dir):
        log(f"读取文件表 {path.name} …")
        cf = ChunkFile(path, oodle, keys)
        try:
            for name, (size, offset) in cf.toc().items():
                merged[name] = IndexEntry(path.name, size, offset)
        finally:
            cf.close()
    return merged


def load_index(
    game_dir: Path,
    cache: Path,
    oodle: Oodle,
    keys: KeyPattern,
    log: Callable[[str], None],
    rebuild: bool = False,
) -> dict[str, IndexEntry]:
    fp = chunk_fingerprint(game_dir)
    if cache.is_file() and not rebuild:
        raw = json.loads(cache.read_text(encoding="utf-8"))
        if raw.get("version") == INDEX_VERSION and raw.get("fingerprint") == fp["digest"]:
            return {k: IndexEntry(*v) for k, v in raw["files"].items()}
        log("chunk 已变化，重建文件表")
    files = build_index(game_dir, oodle, keys, log)
    cache.parent.mkdir(parents=True, exist_ok=True)
    payload = {
        "version": INDEX_VERSION,
        "fingerprint": fp["digest"],
        "files": {k: [e.chunk, e.size, e.offset] for k, e in files.items()},
    }
    cache.write_text(json.dumps(payload, ensure_ascii=False), encoding="utf-8")
    return files


def steam_build_id(game_dir: Path, app_id: int = STEAM_APP_ID) -> str | None:
    """读取 Steam 的 appmanifest 构建号（exe 的版本资源是 0.0.0.0，不可用）。"""
    acf = Path(game_dir).parent.parent / f"appmanifest_{app_id}.acf"
    if not acf.is_file():
        return None
    m = re.search(r'"buildid"\s+"(\d+)"', acf.read_text(encoding="utf-8", errors="replace"))
    return m.group(1) if m else None


def sha256_prefix(path: Path, n: int = 16) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as fh:
        for block in iter(lambda: fh.read(1 << 20), b""):
            h.update(block)
    return h.hexdigest()[:n]


def extract(
    game_dir: Path,
    out_root: Path,
    patterns: list[str],
    oodle: Oodle,
    keys: KeyPattern,
    log: Callable[[str], None] = print,
    rebuild_index: bool = False,
) -> dict:
    index = load_index(game_dir, out_root / "chunk_index.json", oodle, keys, log, rebuild_index)
    hits = select(index, patterns)
    log(f"匹配 {len(hits)} 个文件，开始解包")
    opened: dict[str, ChunkFile] = {}
    total = 0
    try:
        for i, name in enumerate(hits, 1):
            e = index[name]
            if e.chunk not in opened:
                opened[e.chunk] = ChunkFile(Path(game_dir, "chunk", e.chunk), oodle, keys)
            data = opened[e.chunk].read(e.offset, e.size)
            dst = out_root / name.lstrip("/")
            dst.parent.mkdir(parents=True, exist_ok=True)
            dst.write_bytes(data)
            total += len(data)
            if i % 500 == 0:
                log(f"  {i}/{len(hits)}")
    finally:
        for cf in opened.values():
            cf.close()

    exe = Path(game_dir, EXE_NAME)
    meta = {
        "steamBuildId": steam_build_id(game_dir),
        "exeSha256": sha256_prefix(exe) if exe.is_file() else None,
        "chunkDigest": chunk_fingerprint(game_dir)["digest"],
        "extractedAt": time.strftime("%Y-%m-%dT%H:%M:%S%z"),
        "fileCount": len(hits),
        "bytes": total,
        "patterns": patterns,
    }
    (out_root / "extract.json").write_text(json.dumps(meta, ensure_ascii=False, indent=2), encoding="utf-8")
    return meta
