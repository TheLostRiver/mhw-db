"""写在 exe 代码 / 常量区、不在任何数据文件里的数值。

磁盘上的 exe 有保护，读不到这些常量；这里记录的是从本机 exe 内存转储（只读，不入库）里找到的值，
连同偏移与对应的游戏构建号，供 `verify_dump` 在本机重新核对。换游戏版本后偏移可能变化，需要重新查找。
"""

import struct
from pathlib import Path

DUMP_BUILD_ID = "15539686"

# 武器显示倍率（显示攻击力 = 真实攻击力 × 倍率），内部武器种顺序。
# 大剑 4.8 已与游戏截图核对（黑龙玄刃 340 → 1632）。
WEAPON_BLOAT_OFFSET = 0x33B8890
WEAPON_BLOAT = (4.8, 1.4, 1.4, 3.3, 5.2, 4.2, 2.3, 2.3, 3.5, 3.6, 3.1, 1.2, 1.5, 1.3)


def verify_dump(path: Path) -> None:
    """用本机 exe 内存转储核对上面的常量；不一致时抛出 ValueError。"""
    with path.open("rb") as f:
        f.seek(WEAPON_BLOAT_OFFSET)
        got = struct.unpack("<14f", f.read(14 * 4))
    if any(abs(a - b) > 1e-4 for a, b in zip(got, WEAPON_BLOAT, strict=True)):
        raise ValueError(f"武器显示倍率与转储不一致：{[round(x, 3) for x in got]}")
