import struct

import pytest

from mhdb.config import DATA_RAW
from mhdb.formats.sobj import ANIMAL_CLASS, CLASS, NPC_CLASS, SobjError, animal_areas, npcs, parse


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


def animal_record(
    pos: tuple[float, float, float], floor: int, ec: int, variant: int, quest: str = ""
) -> bytes:
    out = struct.pack("<I", 0x5678) + ANIMAL_CLASS + struct.pack("<I", 4)
    out += struct.pack("<9f", *pos, 0, 0, 0, 1, 1, 1)
    out += bytes([0, 1]) + struct.pack("<ii", floor, -1) + bytes(9) + struct.pack("<I", 4)
    out += quest.encode() + b"\0\0\0\0" + bytes(4) + b"\xcd" * 64 + b"\0"
    out += struct.pack("<IIIIf", ec, variant, 1, 1, 1.0) + struct.pack("<f", 274.3) + bytes(16)
    return out


def test_parse_animal_areas() -> None:
    data = animal_record((1.0, 2.0, 3.0), 2, 32, 1) + animal_record(
        (4.0, 5.0, 6.0), 0, 43, 0, quest="q50601_kill"
    )
    areas = animal_areas(data)
    assert [(a.name, a.floor, a.pos) for a in areas] == [
        ("EC_032_01", 2, (1.0, 2.0, 3.0)),
        ("EC_043", 0, (4.0, 5.0, 6.0)),
    ]


@pytest.mark.game
@pytest.mark.skipif(not (SET / "st101_pop_map.sobj").is_file(), reason="需要先运行 mhdb extract")
def test_ancient_forest_bug_areas() -> None:
    areas = animal_areas((SET / "st101_pop_map.sobj").read_bytes())
    names = {a.name for a in areas}
    # 古代树森林的虫：苦虫、光虫、不死虫、雷光虫、美味虫
    assert {"EC_032_01", "EC_032_02", "EC_032_03", "EC_032_04", "EC_032_05"} <= names
    assert len(areas) == 43


def npc_record(pos: tuple[float, float, float], floor: int, tag: str) -> bytes:
    out = struct.pack("<I", 0x9ABC) + NPC_CLASS + struct.pack("<I", 4)
    out += struct.pack("<9f", *pos, 0, 0, 0, 1, 1, 1)
    out += bytes([0, 1]) + struct.pack("<ii", floor, -1) + bytes(9) + struct.pack("<I", 4)
    return out + tag.encode() + b"\0npc01\0\0\0" + bytes(16)


def test_parse_npcs() -> None:
    data = (
        npc_record((1.0, 2.0, 3.0), 0, "n002")
        + npc_record((4.0, 5.0, 6.0), 6, "npc036_01")
        + npc_record((7.0, 8.0, 9.0), 0, "")
    )
    got = [(n.npc, n.tag, n.floor) for n in npcs(data, default=954)]
    assert got == [(2, "n002", 0), (36, "npc036_01", 6), (954, "", 0)]
    with pytest.raises(SobjError):
        npcs(npc_record((0.0, 0.0, 0.0), 0, ""))
