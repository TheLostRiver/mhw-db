"""common/gimmick/gimmick.gcd：每种物件（gm000_010_00 等）的公共参数；animal.gcd（环境生物 EC_NNN）同一格式。

头：u32 magic 0x18091001、u16 版本、u32 记录数；每条记录：u32 序号（0 起）、物件名 \\0、28 字节定长部分。
定长部分（由采集点与 pop_base.ppm、关卡 itlot 的对应关系推出，见 docs/DATA.md）：

  +1  u8  采集类型：common/item/pop_base.ppm 的行号（物品、数量、采集次数、复活秒数）
  +2  u8  抽选表（普通）：关卡 itlot 的行号，0xFF 表示无
  +3  u8  抽选表（稀有）
  +7  u8  种类：1 投射器弹、2 采集
  +16 f32 秒数（多为 180），与 pop_base 的复活秒数不总一致，含义未确认
其余字段含义未确认。

+20 u8：大地图上的图标（ui/common/tex/cmn_action00 的 64px 格子编号，0 为不显示）。
animal.gcd 按图形逐一核对：回复蜜虫 16、麻痹瓦斯蛙 17、闪光翅虫 18、睡眠瓦斯蛙 19、爆炸瓦斯蛙 20、粪金龟 21、
爆弹甲虫 22、雪球虫 23、铁鲎 24、仙人掌 25，虫（EC_032）为 3（采集用的草丛图标）。
gimmick.gcd 的环境利用物件同样对得上图形：棉花孢子草 1（孢子）、毒蔓草 / 毒鬼灯 2（毒）、回复露草等 3、
鬼毬果 4（红色草）、落石 / 堰堤 / 流沙 / 熔岩等 29（「!」陷阱）、藤蔓陷阱 30、腐肉 31。
缆车 49、奇面族的捷径 50、攀爬点 104 超出图集里有图的格子，图标未找到。
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


def records(data: bytes) -> dict[str, bytes]:
    """名字 → 28 字节定长部分（按文件顺序）。"""
    magic, _, count = _HEADER.unpack_from(data, 0)
    if magic != MAGIC:
        raise GcdError(f"magic {magic:#x} 不符")
    o = _HEADER.size
    out: dict[str, bytes] = {}
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
        out[name] = body
        o = e + 1 + _BODY
    if o != len(data):
        raise GcdError(f"解析到 {o} 字节，文件共 {len(data)} 字节，布局不符")
    return out


def parse(data: bytes) -> dict[str, Gimmick]:
    out: dict[str, Gimmick] = {}
    for name, body in records(data).items():
        lots = tuple(x for x in body[2:4] if x != 0xFF)
        (seconds,) = struct.unpack_from("<f", body, 16)
        out[name] = Gimmick(name=name, pop=body[1], lots=lots, kind=body[7], seconds=seconds)
    return out


def map_icons(data: bytes) -> dict[str, int]:
    """名字（EC_010_01 / gm007_000）→ +20 的大地图图标格子编号（0 为不显示）。animal.gcd、gimmick.gcd 都用。"""
    return {name: body[20] for name, body in records(data).items()}
