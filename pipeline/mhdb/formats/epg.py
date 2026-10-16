"""怪物部位与肉质 em/emXXX/YY/data/emXXX.dtt_epg（解密后，密钥见 crypto.KEYS）。

结构（字段顺序参照 MHW-Editor 的 dtt_epg.bt——无许可证，只当格式文档读；代码为自写）：

  头：u32 魔数 ×2、u32 怪物编号（游戏内的怪物序号，雌火龙 9）、u32、u32 基础体力、u32 部位数
  部位：u32 怯缩值、i32 ×3 特殊值编号（指向后面的切断 / 破坏表，-1 无）、u32 精华颜色、u32 肉质槽数 N，
        然后 N 组 × 10 个肉质编号（上位及以下 5 个状态 + 大师级 5 个状态，-1 为不变），再 u32 ×3、u8 ×2
  肉质：u32 条数，每条 f32、u32 斩 / 打 / 弹、火 / 水 / 冰 / 雷 / 龙、眩晕、减气
  切断 / 破坏：u32 条数，每条 u32 种类、u32 ×2、u32 值、i32、u8 ×3
  未知表：u32 条数，每条 26 字节；结尾 u32 ×2，之后是加密补齐的 0

已与 Kiranico 的雌火龙数据对照：肉质（头 70 / 75 / 65 等，大师级头 60 / 65 / 45）、各部位怯缩值
（头 240、躯干 300、翼 180、脚 210、尾 200）、尾巴切断值 300、精华颜色（0 红、1 白、2 橙、3 绿）都一致。
一个部位的几个肉质槽对应怪物 .col 里的受击判定（见 col.damage_nodes）。
"""

import struct
from dataclasses import dataclass

MAGIC = 0x18091001
STATES = ("normal", "wounded", "special1", "special2", "special3")  # 每个等级 5 个状态，名字取自格式说明
_HEAD = struct.Struct("<IIIIII")
_PART = struct.Struct("<IiiiII")
_HITZONE = struct.Struct("<f10I")
_BREAK = struct.Struct("<IIIIiBBB")
_UNKNOWN_SIZE = 26


class EpgError(ValueError):
    pass


@dataclass(frozen=True)
class Hitzone:
    sever: int
    blunt: int
    shot: int
    fire: int
    water: int
    ice: int
    thunder: int
    dragon: int
    stun: int
    exhaust: int


@dataclass(frozen=True)
class Part:
    flinch: int
    specials: tuple[int, int, int]  # 切断 / 破坏表的编号，-1 无
    extract: int  # 精华颜色：0 红、1 白、2 橙、3 绿
    slots: tuple[tuple[int, ...], ...]  # 每个肉质槽 10 个肉质编号：上位及以下 5 个状态 + 大师级 5 个状态

    def hitzone(self, slot: int, master: bool, state: int = 0) -> int:
        """某槽在某等级、某状态下的肉质编号，-1 表示该状态不存在。大师级没有单独设置时沿用上位的编号。"""
        ids = self.slots[slot]
        if master and ids[5 + state] >= 0:
            return ids[5 + state]
        return ids[state]


@dataclass(frozen=True)
class Break:
    kind: int  # 1 切断（尾巴等）；0 其他（含义未逐一确认）
    value: int
    count: int  # 第 5 个字段，切断为 1；含义未确认
    flags: tuple[int, int, int]


@dataclass(frozen=True)
class Epg:
    monster_id: int
    hp: int
    parts: list[Part]
    hitzones: list[Hitzone]
    breaks: list[Break]
    dangling: int = 0  # 越界而被置为 -1 的肉质编号个数


def parse(data: bytes) -> Epg:
    m1, _, monster_id, _, hp, n_parts = _HEAD.unpack_from(data, 0)
    if m1 != MAGIC:
        raise EpgError("不是 dtt_epg（或未解密）")
    o = _HEAD.size
    parts = []
    for _ in range(n_parts):
        flinch, s1, s2, s3, extract, n_slots = _PART.unpack_from(data, o)
        o += _PART.size
        if not 1 <= n_slots <= 3:
            raise EpgError(f"肉质槽数 {n_slots} 超出 1–3")
        ids = struct.unpack_from(f"<{10 * n_slots}i", data, o)
        o += 40 * n_slots + 14
        slots = tuple(ids[k * 10 : k * 10 + 10] for k in range(n_slots))
        parts.append(Part(flinch, (s1, s2, s3), extract, slots))
    (n_hz,) = struct.unpack_from("<I", data, o)
    o += 4
    hitzones = []
    for _ in range(n_hz):
        _, *v = _HITZONE.unpack_from(data, o)
        o += _HITZONE.size
        hitzones.append(Hitzone(*v))
    (n_break,) = struct.unpack_from("<I", data, o)
    o += 4
    breaks = []
    for _ in range(n_break):
        kind, _, _, value, count, f1, f2, f3 = _BREAK.unpack_from(data, o)
        o += _BREAK.size
        breaks.append(Break(kind, value, count, (f1, f2, f3)))
    (n_unknown,) = struct.unpack_from("<I", data, o)
    o += 4 + _UNKNOWN_SIZE * n_unknown + 8
    if o > len(data) or any(data[o:]) or len(data) - o >= 16:
        raise EpgError(f"结尾剩余 {len(data) - o} 字节，结构不符")
    # 越界的肉质编号（贝希摩斯的特殊状态指向第 10 条，而文件只有 10 条）按「该状态不存在」处理并计数
    dangling = sum(1 for p in parts for ids in p.slots for i in ids if i >= n_hz)
    if dangling:
        parts = [
            Part(
                p.flinch,
                p.specials,
                p.extract,
                tuple(tuple(-1 if i >= n_hz else i for i in ids) for ids in p.slots),
            )
            for p in parts
        ]
    if any(s >= n_break for p in parts for s in p.specials):
        raise EpgError("切断 / 破坏编号超出范围")
    return Epg(monster_id, hp, parts, hitzones, breaks, dangling)
