"""大型怪物：体力、部位（怯缩值、精华颜色、切断值）、肉质、异常耐性、狩猎笔记的弱点星级，输出 data/world/monsters.json。

  em/emXXX/YY/data/emXXX.dtt_epg        部位与肉质（formats/epg.py）
  em/emXXX/YY/data/emXXX.dtt_eda        异常耐性（formats/eda.py）
  em/emXXX/YY/collision/emXXX.col       受击判定：开发名 → 部位与肉质槽（formats/col.damage_nodes）；
                                        个别变种没有自己的 .col 时用 00 的
  common/note/em_note.emi               狩猎笔记的属性 / 异常弱点星级（formats/emi.py）
  common/text/em_names_*.gmd、em_info_*  名字、生态说明、狩猎提示

游戏里没有肉质部位的文字名（狩猎笔记只在示意图上画星级），部位名由受击判定的开发名翻译而来
（mhdb/games/world/hitzone_names.tsv），页面同时给出原名。煌黑龙、冰呪龙等的受击判定没有名字，
按判定挂的骨骼编号推断（骨骼编号各怪物通用：统计有名字的判定里每个骨骼编号对应的部位，取票数最多的），
这类名字带「（推断）」。
"""

import re
from collections import Counter
from pathlib import Path

from mhdb.build.common import Source, Text, tr
from mhdb.formats import col, crypto, eda, emi, epg

NAMES_TSV = Path(__file__).resolve().parent.parent / "games" / "world" / "hitzone_names.tsv"
EXTRACT = {0: "red", 1: "white", 2: "orange", 3: "green"}
# 名字表里少数变种的键不是 EMxxx_yy 形式（黑轰龙、惶怒恐暴龙用测试键，眩鸟沿用搔鸟的亚种键）
# 贝希摩斯的键带 _01
NAME_KEYS = {
    "em032_01": "EM_TEST_00002",
    "em043_05": "EM_TEST_00001",
    "em120_00": "EM107_01",
    "em121_00": "EM121_01",
}
_PREFIX = re.compile(r"^(?:【dmg】|YD_|dam[ae]g[ea]_)", re.I)
_NOISE = re.compile(r"(?:_?(?:push|service\d*|skip|omake|押し抜き|obj無し|hibi|\d+))+$", re.I)
_IGNORED = re.compile(r"罠|trap|sound|shell_void", re.I)  # 陷阱、声音判定，不是肉质部位
_QUALIFIED = re.compile(r"^(.+?)（.+）$")


def load_hitzone_names() -> dict[str, str]:
    out: dict[str, str] = {}
    for line in NAMES_TSV.read_text(encoding="utf-8").splitlines():
        if line and not line.startswith("#"):
            stem, zh = line.split("\t")
            out[stem] = zh
    return out


def stem(name: str) -> str:
    return _NOISE.sub("", _PREFIX.sub("", name)).lower()


def _merge_labels(labels: list[str]) -> list[str]:
    """同一槽里的几个名字：去重；同一部位的细分（头部（上）、头部（下））并成括号前的部分；左右成对的并成一个。"""
    out = list(dict.fromkeys(labels))
    groups: dict[str, list[str]] = {}
    for x in out:
        m = _QUALIFIED.match(x)
        groups.setdefault(m.group(1) if m else x, []).append(x)
    out = [base if len(v) > 1 else v[0] for base, v in groups.items()]
    for x in list(out):
        if x.startswith("左") and "右" + x[1:] in out:
            out[out.index(x)] = x[1:]
            out.remove("右" + x[1:])
    return out


def _base(label: str) -> str:
    m = _QUALIFIED.match(label)
    return (m.group(1) if m else label).removeprefix("G·").removeprefix("P·")


def joint_votes(all_nodes: list[list[col.DamageNode]], zh: dict[str, str]) -> dict[int, Counter]:
    """骨骼编号 → 各部位名的票数（只用有名字的受击判定）。"""
    votes: dict[int, Counter] = {}
    for nodes in all_nodes:
        for n in nodes:
            label = zh.get(stem(n.name))
            if label and not _IGNORED.search(n.name):
                for j in n.joints:
                    votes.setdefault(j, Counter())[_base(label)] += 1
    return votes


def infer_label(joints: tuple[int, ...], votes: dict[int, Counter]) -> str | None:
    score: Counter = Counter()
    for j in joints:
        c = votes.get(j)
        if c:
            total = sum(c.values())
            for label, v in c.items():
                score[label] += v / total
    return f"{score.most_common(1)[0][0]}（推断）" if score else None


def slot_labels(
    parts: list[epg.Part], nodes: list[col.DamageNode], zh: dict[str, str], votes: dict[int, Counter]
) -> dict[tuple[int, int], dict]:
    """(部位, 槽) → {label, names}；开发名不在对照表里的按骨骼推断，仍然没有的槽用「部位 N」。"""
    by_slot: dict[tuple[int, int], list[col.DamageNode]] = {}
    for n in nodes:
        if _IGNORED.search(n.name) or n.part >= len(parts) or n.slot >= len(parts[n.part].slots):
            continue
        by_slot.setdefault((n.part, n.slot), []).append(n)
    out = {}
    for pi, p in enumerate(parts):
        for si in range(len(p.slots)):
            here = by_slot.get((pi, si), [])
            names = list(dict.fromkeys(n.name for n in here if n.name))
            known = [zh[stem(n.name)] for n in here if stem(n.name) in zh]
            if not known:
                known = [x for n in here if (x := infer_label(n.joints, votes))]
            if known:
                label = "、".join(_merge_labels(known))
            else:
                label = f"部位 {pi + 1}" + (f"-{si + 1}" if len(p.slots) > 1 else "")
            out[(pi, si)] = {"label": label, "names": names}
    # 同一部位的几个槽同名（如尾巴的两段）时按槽的顺序编号
    for pi, p in enumerate(parts):
        labels = [out[(pi, si)]["label"] for si in range(len(p.slots))]
        labels = [x if not x.startswith("部位 ") else f"{x}#{si}" for si, x in enumerate(labels)]
        for si, x in enumerate(labels):
            if labels.count(x) > 1:
                out[(pi, si)]["label"] = f"{x} {labels[: si + 1].count(x)}"
    return out


def _hitzone(h: epg.Hitzone) -> dict:
    return {
        "sever": h.sever,
        "blunt": h.blunt,
        "shot": h.shot,
        "fire": h.fire,
        "water": h.water,
        "thunder": h.thunder,
        "ice": h.ice,
        "dragon": h.dragon,
        "stun": h.stun,
        "exhaust": h.exhaust,
    }


def _buildup(b: eda.Buildup) -> dict:
    return {
        "base": b.base,
        "increase": b.increase,
        "max": b.max,
        "decayInterval": round(b.decay_interval, 2),
        "decay": b.decay,
        "duration": round(b.duration, 2),
        "durationStep": round(b.duration_step, 2),
        "durationMin": round(b.duration_min, 2),
    }


def _trap(b: eda.Buildup) -> list[float]:
    """陷阱等的持续时间序列：每次缩短 step，直到最短值。"""
    if b.duration <= 0:
        return []
    out = [b.duration]
    while b.duration_step > 0 and out[-1] - b.duration_step >= max(b.duration_min, 0.01) and len(out) < 10:
        out.append(round(out[-1] - b.duration_step, 2))
    return out


def _text(texts, key: str) -> Text | None:
    g = texts["zh-Hans"]
    idx = next((i for i, k in g.keys.items() if k == key), None)
    return tr(texts, idx) if idx is not None else None


def build_monsters(s: Source, log=print) -> list[dict]:
    zh = load_hitzone_names()
    names = s.text("common/text/em_names")
    info = s.text("common/text/em_info")
    notes: dict[int, list[emi.Note]] = {}
    for n in emi.parse(s.path("common/note/em_note.emi").read_bytes()):
        notes.setdefault(n.monster_id, []).append(n)
    micons = {p.name.removesuffix("_ID.tex") for p in s.path("ui/note/tex/micon").glob("*_ID.tex")}
    variants = []
    for f in sorted(s.path("em").glob("em[0-9][0-9][0-9]/[0-9][0-9]/data/em[0-9][0-9][0-9].dtt_epg")):
        em, sub = f.parent.parent.parent.name, f.parent.parent.name
        col_rel = f"em/{em}/{sub}/collision/{em}.col"
        if not s.path(col_rel).is_file():
            col_rel = f"em/{em}/00/collision/{em}.col"
        variants.append((f, em, sub, col_rel, col.damage_nodes(s.path(col_rel).read_bytes())))
    votes = joint_votes([v[4] for v in variants], zh)
    out = []
    for f, em, sub, col_rel, nodes in variants:
        key = f"{em}_{sub}"
        rel = f.relative_to(s.root).as_posix()
        e = epg.parse(crypto.decrypt(f.read_bytes(), crypto.KEYS[".dtt_epg"]))
        a = eda.parse(crypto.decrypt(f.with_suffix(".dtt_eda").read_bytes(), crypto.KEYS[".dtt_eda"]))
        if a.monster_id != e.monster_id:
            raise ValueError(f"{key}：dtt_eda 的怪物编号 {a.monster_id} 与 dtt_epg 的 {e.monster_id} 不符")
        labels = slot_labels(e.parts, nodes, zh, votes)
        unnamed = sum(1 for v in labels.values() if not v["names"])
        if e.dangling or unnamed:
            log(f"  {key}：{e.dangling} 个越界肉质编号，{unnamed} 个肉质槽没有受击判定名")

        text_key = NAME_KEYS.get(key) or (f"EM{em[2:]}" if sub == "00" else f"EM{em[2:]}_{sub}")
        name = _text(names, text_key) or _text(names, f"{text_key}_00")
        note_key = f"NOTE_EM{em[2:]}" + ("" if sub == "00" else f"_{sub}")
        icon = f"{em}" if sub == "00" else f"{em}_{sub}"
        parts = []
        for pi, p in enumerate(e.parts):
            sever = [e.breaks[x].value for x in p.specials if x >= 0 and e.breaks[x].kind == 1]
            slots = [{**labels[(pi, si)], "hz": list(ids)} for si, ids in enumerate(p.slots)]
            parts.append(
                {
                    "label": "、".join(_merge_labels([x["label"] for x in slots])),
                    "flinch": p.flinch,
                    "extract": EXTRACT.get(p.extract),
                    "sever": sever[0] if sever else None,
                    "slots": slots,
                }
            )
        ns = notes.get(e.monster_id, [])
        rec = {
            "key": key,
            "em": int(em[2:]),
            "sub": int(sub),
            "gameId": e.monster_id,
            "name": name,
            # 冰原新增的怪物键名没有下划线（NOTE_EM032DESC）
            "desc": _text(info, f"{note_key}_DESC") or _text(info, f"{note_key}DESC"),
            "tips": _text(info, f"{note_key}_STRTG") or _text(info, f"{note_key}STRTG"),
            "icon": icon if icon in micons else None,
            "hp": e.hp,
            "parts": parts,
            "hitzones": [_hitzone(h) for h in e.hitzones],
            "status": {
                "poison": _buildup(a.poison),
                "sleep": _buildup(a.sleep),
                "paralysis": _buildup(a.paralysis),
                "stun": _buildup(a.stun),
                "exhaust": _buildup(a.exhaust),
                "mount": _buildup(a.mount),
                "blast": _buildup(a.blast),
                "blastDamage": a.blast_damage,
                "exhaustDamage": round(a.exhaust_damage, 2),
                "poisonDamage": {"damage": a.poison_damage, "coefficient": round(a.poison_coefficient, 3)},
                "capture": _buildup(a.capture),
                "elderseal": _buildup(a.elderseal),
                "traps": {
                    "shock": _trap(a.shock_trap),
                    "pitfall": _trap(a.pitfall_trap),
                    "ivy": _trap(a.ivy_trap),
                    "dung": _trap(a.dung),
                    "flash": _trap(a.flash),
                },
            },
            # 同一怪物可有多条笔记记录（等级或形态不同，如煌黑龙的火 / 冰形态），去重后按文件顺序全部给出
            "stars": [dict(x) for x in dict.fromkeys(tuple(n.stars.items()) for n in ns)],
            "_src": {
                "epg": rel,
                "eda": rel.replace(".dtt_epg", ".dtt_eda"),
                "col": col_rel,
                "note": "common/note/em_note.emi",
            },
        }
        if name is None:
            log(f"  注意：{key} 没有名字（键 {text_key}）")
        out.append(rec)
    return out
