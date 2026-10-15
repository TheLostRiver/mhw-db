import struct

import pytest

from mhdb.config import DATA_RAW
from mhdb.formats.gcd import MAGIC, GcdError, parse


def body(pop: int, lots: tuple[int, int], kind: int, seconds: float) -> bytes:
    b = bytearray(28)
    b[1], b[2], b[3], b[7] = pop, *lots, kind
    struct.pack_into("<f", b, 16, seconds)
    return bytes(b)


def make(records: list[tuple[str, bytes]]) -> bytes:
    out = struct.pack("<IHI", MAGIC, 1, len(records))
    for i, (name, b) in enumerate(records):
        out += struct.pack("<I", i) + name.encode() + b"\0" + b
    return out


def test_parse_records() -> None:
    g = parse(
        make([("gm000_010_00", body(10, (0xFF, 0xFF), 2, 180)), ("gm000_012_00", body(12, (0, 1), 2, 180))])
    )
    assert g["gm000_010_00"].pop == 10 and g["gm000_010_00"].lots == ()
    assert g["gm000_012_00"].lots == (0, 1) and g["gm000_012_00"].kind == 2
    assert g["gm000_012_00"].seconds == 180


def test_layout_mismatch_is_an_error() -> None:
    with pytest.raises(GcdError):
        parse(make([("gm000_010_00", body(10, (0, 1), 2, 180))]) + b"\0")
    bad = bytearray(make([("a", body(1, (0, 1), 2, 0))]))
    bad[10] = 5  # 序号不是 0
    with pytest.raises(GcdError):
        parse(bytes(bad))


GCD = DATA_RAW / "world/common/gimmick/gimmick.gcd"


@pytest.mark.game
@pytest.mark.skipif(not GCD.is_file(), reason="需要先运行 mhdb extract")
def test_gimmick_table_against_game() -> None:
    g = parse(GCD.read_bytes())
    assert len(g) == 649
    assert (g["gm000_010_00"].pop, g["gm000_010_00"].lots) == (10, ())  # 药草：固定物品
    assert (g["gm000_012_00"].pop, g["gm000_012_00"].lots) == (12, (0, 1))  # 矿脉：抽选表 0 / 1
    assert (g["gm000_028_00"].pop, g["gm000_028_00"].lots) == (13, (2, 3))  # 骨冢
    assert (g["gm000_029_01"].pop, g["gm000_029_01"].lots) == (67, (10, 10))  # 百阳草
    assert g["gm000_000_00"].kind == 1 and g["gm000_010_00"].kind == 2  # 投射器弹 / 采集
