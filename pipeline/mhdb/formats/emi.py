"""狩猎笔记 common/note/em_note.emi：每只怪物的栖息地、各部位弱点星级、属性与异常的弱点星级。

结构（字段顺序参照 MHW-Editor 的 emi.bt，只当格式文档读；代码为自写）：头 u32 魔数、u16、u32 条数；
每条 196 字节：u32 怪物编号（与 dtt_epg 的怪物编号相同）、u32 ×6 栖息地（关卡编号，0 为空）、u32 ×2、
3 组部位弱点（u32 部位图编号、斩 / 打 / 弹星级）、3 组 i32 ×3（含义未确认）、i32、
属性与异常星级 i32 ×10（火、水、雷、冰、龙、毒、睡眠、麻痹、爆破、眩晕）、条件星级 i32 ×5 与条件 i32、
骨架类型 i32 ×2。

同一只怪物可以有几条：雌火龙第二条的部位弱点与大师级肉质对得上（大师级翼 21 / 21 / 45 → 星级 1 / 1 / 2），
煌黑龙的三条则是火 / 冰形态的弱点（火、冰星级互换），所以多条记录与等级、形态的对应要逐只确认。
部位图编号是笔记里怪物示意图的部位，没有文字名。
"""

import struct
from dataclasses import dataclass

MAGIC = 0x18091001
_ENTRY = struct.Struct("<I6III" + "4I" * 3 + "3i" * 3 + "i" + "10i" + "5i" + "iii")
assert _ENTRY.size == 196
STAR_KEYS = ("fire", "water", "thunder", "ice", "dragon", "poison", "sleep", "paralysis", "blast", "stun")


class EmiError(ValueError):
    pass


@dataclass(frozen=True)
class Note:
    monster_id: int
    stages: tuple[int, ...]  # 栖息地关卡编号（去掉 0）
    weak_parts: tuple[tuple[int, int, int, int], ...]  # (部位图编号, 斩, 打, 弹)，去掉空项
    stars: dict[str, int]  # 属性与异常星级，-1 为不显示
    conditional: tuple[int, ...]  # 条件星级（火、水、雷、冰、龙），-1 为无
    condition: int  # -1 无


def parse(data: bytes) -> list[Note]:
    magic, _, count = struct.unpack_from("<IHI", data, 0)
    if magic != MAGIC:
        raise EmiError("不是 em_note.emi")
    if 10 + count * _ENTRY.size != len(data):
        raise EmiError(f"长度 {len(data)} 与 {count} 条 × {_ENTRY.size} 不符")
    out = []
    for i in range(count):
        v = _ENTRY.unpack_from(data, 10 + i * _ENTRY.size)
        weak = tuple(tuple(v[k : k + 4]) for k in (9, 13, 17))
        out.append(
            Note(
                monster_id=v[0],
                stages=tuple(s for s in v[1:7] if s),
                weak_parts=tuple(w for w in weak if w[0] != 0xFFFFFFFF),
                stars=dict(zip(STAR_KEYS, v[31:41], strict=True)),
                conditional=tuple(v[41:46]),
                condition=v[46],
            )
        )
    return out
