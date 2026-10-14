"""组装规范化数据的公共工具：多语言文本、来源标注、稳定的 JSON 输出。"""

import json
from dataclasses import dataclass, field
from pathlib import Path

from mhdb.formats import gmd
from mhdb.formats.table import Spec, read_table

# 游戏语言后缀 → 站内语言代码
LANGS = {"chS": "zh-Hans", "chT": "zh-Hant", "jpn": "ja", "eng": "en"}


@dataclass
class Source:
    """data-raw/<game>/ 下的解包结果。"""

    root: Path
    _gmd: dict[str, dict[str, gmd.Gmd]] = field(default_factory=dict)

    def path(self, rel: str) -> Path:
        return self.root / rel

    def table(self, rel: str, spec: Spec) -> list[dict[str, int]]:
        return read_table(self.path(rel).read_bytes(), spec).rows

    def text(self, stem: str) -> dict[str, gmd.Gmd]:
        """stem 形如 common/text/steam/item，返回 {语言代码: Gmd}。"""
        if stem not in self._gmd:
            self._gmd[stem] = {
                code: gmd.parse(self.path(f"{stem}_{suffix}.gmd").read_bytes())
                for suffix, code in LANGS.items()
            }
        return self._gmd[stem]


Text = dict[str, str]


def tr(texts: dict[str, gmd.Gmd], index: int, *, markup: bool = False) -> Text | None:
    """取四语文本；简中缺失或是占位符时返回 None。"""
    conv = gmd.to_markup if markup else gmd.clean
    out: Text = {}
    for code, g in texts.items():
        raw = g.get(index)
        if not gmd.is_placeholder(raw):
            out[code] = conv(raw or "")
    return out if "zh-Hans" in out else None


def src(file: str, row: int) -> dict:
    return {"file": file, "row": row}


def write_records(path: Path, key: str, records: list[dict], meta: dict | None = None) -> None:
    """写成「一条记录一行」的 JSON，便于看 git 差异。"""
    path.parent.mkdir(parents=True, exist_ok=True)
    head = {"meta": meta} if meta else {}
    lines = [json.dumps(r, ensure_ascii=False, separators=(",", ":")) for r in records]
    body = ",\n".join(lines)
    prefix = json.dumps(head, ensure_ascii=False)[:-1]
    sep = "," if head else ""
    path.write_text(f'{prefix}{sep}"{key}":[\n{body}\n]}}\n', encoding="utf-8")


def write_json(path: Path, data: dict) -> None:
    path.parent.mkdir(parents=True, exist_ok=True)
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2) + "\n", encoding="utf-8")
