"""武器招式：hm/**/collision/*.col 的攻击参数（动作值、属性 / 异常补正、卡肉……），输出 data/world/moves.json。

  hm/wp/wpNN/collision/wpNN.col、wpNN_01.col …   各武器的近战攻击（NN 与 specs.WEAPON_TYPES 的顺序相同）
  hm/wp/wpNN/shell/collision/object.col          弹体：弓箭、弩弹、铳枪炮击、盾斧 / 斩击斧的瓶爆炸等
  hm/claw/…、hm/common/collision/hm_attack.col     通用：钩爪、骑乘小刀、踢等
  hm/common/shell/collision/object.col           通用弹体：投射器弹、投掷小刀、道具

招式名是数据里的日文开发名，中文为本站译名（mhdb/games/world/move_names.tsv），页面同时给出原文。
"""

from pathlib import Path

from mhdb.build.common import Source
from mhdb.formats import col
from mhdb.games.world import specs as S

DAMAGE_TYPE = {0: "none", 1: "sever", 2: "blunt", 3: "shot"}
NAMES_TSV = Path(__file__).resolve().parent.parent / "games" / "world" / "move_names.tsv"
COMMON = [
    ("claw", "hm/claw/collision/claw_00.col"),
    ("claw", "hm/claw/shell/collision/object.col"),
    ("hunter", "hm/common/collision/hm_attack.col"),
    ("item", "hm/common/shell/collision/object.col"),
]


def load_names() -> dict[str, str]:
    out: dict[str, str] = {}
    for line in NAMES_TSV.read_text(encoding="utf-8").splitlines():
        if line and not line.startswith("#"):
            ja, zh = line.split("\t")
            if out.get(ja, zh) != zh:
                raise ValueError(f"move_names.tsv：{ja} 有两种译名")
            out[ja] = zh
    return out


def _skip(name: str) -> bool:
    """占位与已删除的条目：「大剣用枠（未使用）」「削除：…」「削除予定…」。"""
    return "未使用" in name or name.startswith("削除")


def _inert(a: col.Attack) -> bool:
    """没有任何效果的条目（声音、视野判定、占位）：动作值、固定伤害、各种积累值都为 0 且不带属性，或是动作值 1 的占位。
    铳枪炮击这类伤害由别的表决定的弹体，记录里动作值为 0 但带属性种类与部位补正，保留。"""
    values = (a.mv, a.fixed, a.stun, a.exhaust, a.mount, a.soften, a.fixed_element, a.tranq, *a.fixed_status)
    if not any(values):
        return not a.element_type and a.part in (0.0, 1.0)
    return a.damage_type == 0 and a.mv <= 1 and not a.fixed and not a.hitstop


def _r(v: float) -> float:
    return round(v, 3)


def _move(weapon: str, group: str, rel: str, i: int, name: str, a: col.Attack, zh: dict[str, str]) -> dict:
    m = {
        "weapon": weapon,
        "group": group,
        "file": rel,
        "i": i,
        "ja": name,
        "zh": zh.get(name),
        "type": DAMAGE_TYPE[a.damage_type],
        "mv": _r(a.mv),
        "fixed": _r(a.fixed),
        "part": _r(a.part),
        "ele": _r(a.element),
        "status": _r(a.status),
        "stun": _r(a.stun),
        "exhaust": _r(a.exhaust),
        "mount": _r(a.mount),
        "soften": _r(a.soften),
        "eye": a.minds_eye,
        "hitstop": _r(a.hitstop),
        "noSharp": a.no_sharpness,
        "energy": _r(a.energy),
    }
    if a.hitstop_b != a.hitstop:
        m["hitstopB"] = _r(a.hitstop_b)
    if a.cond_mv:
        m["condMv"] = _r(a.cond_mv)
    if a.cond_element:
        m["condEle"] = _r(a.cond_element)
    if group in ("shell", "item") or a.element_type or a.fixed_element or any(a.fixed_status) or a.tranq:
        m["elementType"] = a.element_type
        m["fixedElement"] = _r(a.fixed_element)
        m["fixedStatus"] = [_r(v) for v in a.fixed_status]
        m["tranq"] = _r(a.tranq)
    return m


def _files(s: Source, weapon_index: int) -> list[tuple[str, str]]:
    base = f"hm/wp/wp{weapon_index:02d}"
    melee = sorted(p.relative_to(s.root).as_posix() for p in s.path(f"{base}/collision").glob("*.col"))
    shell = f"{base}/shell/collision/object.col"
    return [("melee", r) for r in melee] + ([("shell", shell)] if s.path(shell).is_file() else [])


def build_moves(s: Source, log=print) -> list[dict]:
    zh = load_names()
    out: list[dict] = []
    jobs = [
        (key, group, rel) for n, (_, key, _, _) in enumerate(S.WEAPON_TYPES) for group, rel in _files(s, n)
    ] + [("common", group, rel) for group, rel in COMMON]
    for weapon, group, rel in jobs:
        c = col.parse(s.path(rel).read_bytes())
        if group == "melee" and c.kind == 3:
            group = "shell"  # 操虫棍 wp10_01.col：猎虫的攻击记录是弹体格式
        kept = 0
        for i, a in enumerate(c.attacks):
            name = c.names[i] if i < len(c.names) else ""
            if _skip(name) or _inert(a):
                continue
            out.append(_move(weapon, group, rel, i, name, a, zh))
            kept += 1
        log(f"  {rel}：{len(c.attacks)} 条攻击参数，保留 {kept} 条")
    missing = sorted({m["ja"] for m in out if m["ja"] and m["zh"] is None})
    if missing:
        log(f"  注意：{len(missing)} 个招式名没有译名：{missing[:10]}")
    return out
