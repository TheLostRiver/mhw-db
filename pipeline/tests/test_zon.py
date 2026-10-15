import struct

import pytest

from mhdb.config import DATA_RAW
from mhdb.formats.sobj import parse as parse_sobj
from mhdb.formats.zon import Box, Prism, ZonError, ui_shapes
from mhdb.games.world.exe import MAP_PATCHES

HEAD = bytes.fromhex("01 00 02 00 00 00 00 80 3f 01")


def make(native: bytes) -> bytes:
    """最小的 zon：文件头 + XFS（类定义区长度 0x10）+ 根对象（长度 8）+ 原生数据。"""
    xfs = b"XFS\0" + struct.pack("<IIIII", 0x13, 0x37, 0, 0, 0x10) + bytes(0x10)
    root = struct.pack("<HHI", 0, 0, 8) + bytes(4)
    return b"zon\0" + bytes(12) + xfs + root + native


def test_parse_box_and_prism() -> None:
    box = HEAD + struct.pack("<8f", -10, 0, -20, 0, 10, 5, 20, 0) + bytes(8)
    prism = (
        HEAD
        + struct.pack("<2f", 300, 50)
        + b"".join(struct.pack("<4f", x, 50, z, 0) for x, z in ((0, 0), (10, 0), (0, 10)))
    )
    prism += struct.pack("<4f", 1, 2, 3, 4)
    shapes = ui_shapes(make(box + prism))
    assert shapes == [Box((-10, 0, -20), (10, 5, 20)), Prism(50, 300, ((0, 0), (10, 0), (0, 10)))]


def test_not_a_zon_file() -> None:
    with pytest.raises(ZonError):
        ui_shapes(b"abcd")


ZON = DATA_RAW / "world/stage/st102/common/zone/st102_ui.zon"


@pytest.mark.game
@pytest.mark.skipif(not ZON.is_file(), reason="需要先运行 mhdb extract")
def test_wildspire_zone_boxes_follow_patch_table() -> None:
    shapes = ui_shapes(ZON.read_bytes())
    assert len(shapes) == 18 and all(isinstance(s, Box) for s in shapes)
    rows = MAP_PATCHES[102]
    # 营地都落在营地名所写区域（按纸片表的行序）的长方体里：南西 1、中央 6、东 11、北东 15
    camps = [
        o for o in parse_sobj((ZON.parents[1] / "set/st102_gm.sobj").read_bytes()) if "mCampId" in o.props
    ]
    found = set()

    def inside(s: Box, pos: tuple[float, float, float]) -> bool:
        return all(min(s.lo[i], s.hi[i]) <= pos[i] <= max(s.lo[i], s.hi[i]) for i in range(3))

    for o in camps:
        found |= {rows[k][2] for k, s in enumerate(shapes[: len(rows)]) if inside(s, o.pos)}
    assert {1, 6, 11, 15} <= found
