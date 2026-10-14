"""标题字体子集化。

得意黑（Smiley Sans，OFL-1.1）带「保留字体名称」：子集化属于修改，修改版不能再叫 Smiley / 得意黑，
所以输出时把字体名改为 MHDB Display，保留版权（nameID 0）与许可证（nameID 13/14）。

字符集 = 站点源码与 data/ 里出现过的全部字符 + ASCII 可见字符 + 常用全角标点。
"""

import re
from collections.abc import Iterable
from pathlib import Path

from fontTools import subset
from fontTools.ttLib import TTFont

from mhdb.config import DATA, REPO

SITE_SRC = REPO / "site" / "src"
TEXT_SUFFIXES = {".astro", ".ts", ".tsx", ".css", ".json", ".md", ".mdx"}
ASCII = "".join(chr(c) for c in range(0x20, 0x7F))
EXTRA = ASCII + "，。、；：？！“”‘’（）《》【】「」『』—…·～％＋－×÷≤≥→←↑↓"
FAMILY = "MHDB Display"
RENAMED_IDS = (1, 3, 4, 6, 16, 17, 21, 22)


def collect_chars(roots: Iterable[Path]) -> set[str]:
    chars = set(EXTRA)
    for root in roots:
        if not root.exists():
            continue
        for path in root.rglob("*"):
            if path.is_file() and path.suffix in TEXT_SUFFIXES:
                chars.update(path.read_text(encoding="utf-8", errors="ignore"))
    return {c for c in chars if not re.match(r"\s", c) or c == " "}


def rename(font: TTFont, family: str = FAMILY) -> None:
    """去掉保留字体名称：把族名、全名、PostScript 名等改为新名称。"""
    style = "Oblique"
    full = f"{family} {style}"
    names = {1: family, 3: full, 4: full, 6: family.replace(" ", "") + "-" + style}
    names |= {16: family, 17: style, 21: family, 22: style}
    table = font["name"]
    for rec in list(table.names):
        if rec.nameID in RENAMED_IDS:
            table.removeNames(nameID=rec.nameID)
    for name_id, value in names.items():
        table.setName(value, name_id, 3, 1, 0x409)


def subset_font(src: Path, out: Path, chars: set[str]) -> tuple[int, int]:
    font = TTFont(src)
    options = subset.Options()
    options.flavor = "woff2"
    options.layout_features = ["*"]
    options.name_IDs = ["*"]
    options.name_languages = ["*"]
    subsetter = subset.Subsetter(options)
    subsetter.populate(text="".join(sorted(chars)))
    subsetter.subset(font)
    rename(font)
    out.parent.mkdir(parents=True, exist_ok=True)
    font.flavor = "woff2"
    font.save(out)
    return len(chars), out.stat().st_size


def default_roots() -> list[Path]:
    return [SITE_SRC, DATA]
