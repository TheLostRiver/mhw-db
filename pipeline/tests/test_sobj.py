import struct

import pytest

from mhdb.config import DATA_RAW
from mhdb.formats.sobj import CLASS, SobjError, parse


def prop(kind: int, value: bytes, name: str, type_name: str = "s32") -> bytes:
    return (
        struct.pack("<I", kind)
        + value
        + name.encode()
        + b"\0"
        + struct.pack("<I", 7)
        + type_name.encode()
        + b"\0"
        + bytes(13)
    )


def record(name: str, pos: tuple[float, float, float], floor: int, props: list[bytes]) -> bytes:
    out = struct.pack("<I", 0x1234) + CLASS + struct.pack("<I", 4)
    out += struct.pack("<9f", *pos, 0, 90, 0, 1, 1, 1) + name.encode() + b"\0"
    out += struct.pack("<BiBBBifiiIIB", 0, 5, 0, 0, 0, -1, 1.0, floor, 0, 0, 0, 0)
    out += struct.pack("<I", 4) + b"\0\0\0\0" + struct.pack("<I", len(props)) + b"".join(props)
    return out


def test_parse_basic_set_objects() -> None:
    data = (
        b"header"
        + record(
            "gm000_010_00",
            (100.0, 50.0, -200.0),
            2,
            [
                prop(4, struct.pack("<i", 33), "mPickItem"),
                prop(3, b"\x01", "mFlag", "bool"),
                prop(6, struct.pack("<f", 0.5), "mSpeed", "f32"),
                prop(8, struct.pack("<4f", 1, 2, 3, 0), "mOffset", "vector3"),
                prop(0xD, b"\x00" + struct.pack("<I", 9) + b"\x00", "mRef", "class"),
            ],
        )
        + b"other class"
        + record("gm000_012_00", (0.0, 0.0, 0.0), 0, [])
    )
    objs = parse(data)
    assert [o.name for o in objs] == ["gm000_010_00", "gm000_012_00"]
    first = objs[0]
    assert first.pos == (100.0, 50.0, -200.0)
    assert first.floor == 2
    assert first.gimmick == "gm000_010"
    assert first.props == {"mPickItem": 33, "mFlag": 1, "mSpeed": 0.5, "mOffset": (1.0, 2.0, 3.0), "mRef": 9}


def test_unknown_value_kind_is_an_error() -> None:
    with pytest.raises(SobjError):
        parse(record("gm000_010_00", (0.0, 0.0, 0.0), 0, [prop(0x42, b"", "mBad")]))


SET = DATA_RAW / "world/stage/st101/common/set"


@pytest.mark.game
@pytest.mark.skipif(not (SET / "st101_pop_map.sobj").is_file(), reason="需要先运行 mhdb extract")
def test_ancient_forest_gathering_points() -> None:
    objs = parse((SET / "st101_pop_map.sobj").read_bytes())
    assert len(objs) == 230
    herbs = [o for o in objs if o.name == "gm000_010_00"]
    assert len(herbs) == 25
    assert {o.props["mPickItem"] for o in herbs} == {33}  # 药草
    # 古代树顶的飞龙蛋
    egg = next(o for o in objs if o.name == "gm000_092_00")
    assert [round(v) for v in egg.pos] == [-40, 18391, 10692] and egg.floor == 4
