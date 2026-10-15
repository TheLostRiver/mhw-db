import struct

import pytest

from mhdb.config import DATA_RAW
from mhdb.formats import col

HM = DATA_RAW / "world" / "hm"


def _file(names: list[str], records: list[bytes], kind: int = 1) -> bytes:
    out = struct.pack("<I4sIIII", col.MAGIC, b"COL\0", 111, 0, 116, len(names))
    for i, n in enumerate(names):
        out += n.encode() + b"\0" + struct.pack("<iiiHBI", 0, i, -1, 0, 0, 30 + i)
    out += struct.pack("<I4sIII", col.MAGIC, b"CLND", 111, 0, 0)  # 判定形状段（解析时跳过）
    out += struct.pack("<I4sIII", col.MAGIC, b"ATK\0", 111, len(records), kind) + b"".join(records)
    return out + struct.pack("<II4sI", col.MAGIC, 0, b"OAP\0", 0)


def _melee(index: int, typ: int, mv: float, ele: float, status: float, hitstop: float, stun: float = 0) -> bytes:
    values = [0] * 60
    values[:10] = [index, typ, mv, 0.0, 1.0, ele, status, stun, 0.0, 0.0]
    values[29], values[30], values[34], values[35] = 1.0, hitstop, 1.0, hitstop
    return col._MELEE.pack(*values)


def test_parse_synthetic_melee() -> None:
    data = _file(["一", "二"], [_melee(0, 1, 8, 0.6, 0.4, 0.07), _melee(1, 2, 37, 1, 1, 0.2, stun=20)])
    c = col.parse(data)
    assert c.kind == 1 and c.names == ["一", "二"]
    a, b = c.attacks
    assert (a.damage_type, a.mv, round(a.element, 2), round(a.status, 2), round(a.hitstop, 2)) == (1, 8, 0.6, 0.4, 0.07)
    assert (b.damage_type, b.mv, b.stun) == (2, 37, 20)


def test_length_mismatch_raises() -> None:
    data = _file(["一"], [_melee(0, 1, 8, 1, 1, 0)])
    broken = data.replace(b"OAP\0", b"OAP\0", 1)[:-30] + data[-16:]
    with pytest.raises(col.ColError):
        col.parse(broken)


@pytest.mark.game
@pytest.mark.skipif(not (HM / "wp/wp02/collision/wp02.col").is_file(), reason="需要先运行 mhdb extract")
def test_dual_blades_against_known_values() -> None:
    """双剑：二段斬りL / R 动作值 8 / 10、属性补正 0.6、异常补正 0.4、卡肉 0.07 / 0.04（与常见数据表一致）。"""
    c = col.parse((HM / "wp/wp02/collision/wp02.col").read_bytes())
    by = {n: c.attacks[i] for i, n in enumerate(c.names) if i < len(c.attacks)}
    left, right = by["二段斬りL"], by["二段斬りR"]
    assert (left.mv, right.mv) == (8, 10)
    assert round(left.element, 2) == 0.6 and round(left.status, 2) == 0.4
    assert (round(left.hitstop, 2), round(right.hitstop, 2)) == (0.07, 0.04)
    assert by["斬り払いL(二段目)"].mv == 5 and round(by["斬り払いL(二段目)"].hitstop, 2) == 0.15


@pytest.mark.game
@pytest.mark.skipif(not (HM / "wp/wp04/collision/wp04.col").is_file(), reason="需要先运行 mhdb extract")
def test_hammer_and_claw_fields() -> None:
    hammer = col.parse((HM / "wp/wp04/collision/wp04.col").read_bytes())
    first = hammer.attacks[hammer.names.index("縦振り")]
    assert first.damage_type == 2 and first.mv == 37 and first.stun == 20 and first.exhaust == 10
    claw = col.parse((HM / "claw/collision/claw_00.col").read_bytes())
    left = claw.attacks[claw.names.index("クローコンスト 敵角度補正 左張り付き")]
    assert left.soften == 20 and left.no_sharpness and left.minds_eye
