"""common/gimmick/gimmick.gcd：每种物件（gm000_010_00 等）的公共参数。

头：u32 magic 0x18091001、u16 版本、u32 记录数；每条记录：u32 序号（0 起）、物件名 \\0、28 字节定长部分。
定长部分（由采集点与 pop_base.ppm、关卡 itlot 的对应关系推出，见 docs/DATA.md）：

  +1  u8  采集类型：common/item/pop_base.ppm 的行号（物品、数量、采集次数、复活秒数）
  +2  u8  抽选表（普通）：关卡 itlot 的行号，0xFF 表示无
  +3  u8  抽选表（稀有）
  +7  u8  种类：1 投射器弹、2 采集
  +16 f32 秒数（多为 180），与 pop_base 的复活秒数不总一致，含义未确认
其余字段含义未确认。
"""

import struct
from dataclasses import dataclass

MAGIC = 0x18091001
_HEADER = struct.Struct("<IHI")
_BODY = 28


class GcdError(ValueError):
    pass


@dataclass(frozen=True)
class Gimmick:
    name: str
    pop: int
    lots: tuple[int, ...]  # (普通, 稀有)，没有抽选表时为空
    kind: int
    seconds: float


def parse(data: bytes) -> dict[str, Gimmick]:
    magic, _, count = _HEADER.unpack_from(data, 0)
    if magic != MAGIC:
        raise GcdError(f"magic {magic:#x} 不符")
    o = _HEADER.size
    out: dict[str, Gimmick] = {}
    for i in range(count):
        (index,) = struct.unpack_from("<I", data, o)
        if index != i:
            raise GcdError(f"第 {i} 条记录的序号是 {index}，布局不符")
        o += 4
        e = data.index(b"\0", o)
        name = data[o:e].decode("ascii")
        body = data[e + 1 : e + 1 + _BODY]
        if len(body) < _BODY:
            raise GcdError(f"{name}：记录不完整")
        lots = tuple(x for x in body[2:4] if x != 0xFF)
        (seconds,) = struct.unpack_from("<f", body, 16)
        out[name] = Gimmick(name=name, pop=body[1], lots=lots, kind=body[7], seconds=seconds)
        o = e + 1 + _BODY
    if o != len(data):
        raise GcdError(f"解析到 {o} 字节，文件共 {len(data)} 字节，布局不符")
    return out
