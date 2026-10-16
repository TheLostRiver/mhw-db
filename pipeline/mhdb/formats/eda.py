"""怪物异常状态耐性 em/emXXX/YY/data/emXXX.dtt_eda（解密后，密钥见 crypto.KEYS）。

结构（字段顺序参照 MHW-Editor 的 dtt_eda.bt，只当格式文档读；代码为自写）：头 u32 ×4（魔数、版本、怪物编号、u32），
之后是一串「积累参数」，每组 32 字节：u32 初始耐性、u32 每次增加、u32 上限、f32 衰减间隔秒、u32 每次衰减量、
f32 持续秒、f32 每次缩短秒、f32 最短秒。组与组之间夹着几个附加值（毒伤害、爆破伤害等）。

只取已核对的部分：毒、睡眠、麻痹、眩晕、减气、骑乘、爆破（初始 / 增加 / 上限 / 衰减 / 持续），
爆破伤害、减气时的体力伤害，陷阱（麻痹陷阱、落穴陷阱、藤蔓陷阱）与粪弹的持续时间。
雌火龙的值与 Kiranico 一致（毒 250 +150 → 700、15 秒；眩晕 120 +100 → 620、7 秒；爆破 120 +60 → 720、伤害 100；
麻痹陷阱 8 → 6 → 4 → 2 秒等）。
"""

import struct
from dataclasses import dataclass

MAGIC = 0x18091001
_GROUP = struct.Struct("<IIIfIfff")


class EdaError(ValueError):
    pass


@dataclass(frozen=True)
class Buildup:
    base: int
    increase: int
    max: int
    decay_interval: float  # 秒
    decay: int
    duration: float  # 秒
    duration_step: float  # 每次缩短的秒数
    duration_min: float


@dataclass(frozen=True)
class Eda:
    monster_id: int
    poison: Buildup
    sleep: Buildup
    paralysis: Buildup
    stun: Buildup
    exhaust: Buildup
    mount: Buildup
    blast: Buildup
    blast_damage: int
    exhaust_damage: float
    dung: Buildup
    shock_trap: Buildup
    pitfall_trap: Buildup
    ivy_trap: Buildup


def parse(data: bytes) -> Eda:
    magic, _, monster_id, _ = struct.unpack_from("<4I", data, 0)
    if magic != MAGIC:
        raise EdaError("不是 dtt_eda（或未解密）")
    o = 16

    def group() -> Buildup:
        nonlocal o
        v = _GROUP.unpack_from(data, o)
        o += _GROUP.size
        return Buildup(*v)

    def skip(n: int) -> tuple:
        nonlocal o
        v = struct.unpack_from(f"<{n}I", data, o)
        o += 4 * n
        return v

    poison = group()
    skip(2)  # 毒伤害、间隔（含义未核对）
    sleep, paralysis, stun, exhaust = group(), group(), group(), group()
    skip(1)
    (exhaust_damage,) = struct.unpack_from("<f", data, o)
    o += 4
    mount, blast = group(), group()
    (blast_damage,) = skip(1)
    group()  # 捕获
    skip(2)  # 可捕获体力（上位 / 大师级，未核对）
    group()  # 眩晕（上位）附加参数
    skip(1)
    group()  # 眩晕（大师级）附加参数
    skip(8)
    group()  # 骑乘击倒
    skip(1)
    dung = group()
    skip(2)
    shock, pitfall, ivy = group(), group(), group()
    if o > len(data):
        raise EdaError("文件太短")
    return Eda(
        monster_id,
        poison,
        sleep,
        paralysis,
        stun,
        exhaust,
        mount,
        blast,
        blast_damage,
        exhaust_damage,
        dung,
        shock,
        pitfall,
        ivy,
    )
