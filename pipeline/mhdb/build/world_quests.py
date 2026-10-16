"""任务：本体（mib）、主要报酬（rem）、补给箱（supp）、出现怪物的体力 / 攻击倍率（em_difficulty.dtt_dif）。

另外输出捕获 / 部位破坏 / 狩猎 / 指引之地报酬（brem），给怪物页用。
字段含义、核对依据与未确认项见 docs/DATA.md 3.9。
"""

import re
import struct

from mhdb.build.common import Source, key_index, tr
from mhdb.formats import crypto, epg, mib

RANKS = ["low", "high", "master"]
REM = struct.Struct("<IIHII" + "I" * 16 + "B" * 16 + "B" * 16)  # 114 字节
BREM = struct.Struct("<IIHIBI" + "I" * 8 + "B" * 8 + "B" * 8)  # 67 字节
SUPP_HEAD = struct.Struct("<IIHI")
SUPP_ITEMS = struct.Struct("<" + "HH" * 24 + "BBB" + "HH" * 16 + "BBB")
BREM_NAME = re.compile(r"br(\d\d)_em(\d+)_(\d\d)_(\d\d)\.brem$")


def read_rem(data: bytes) -> dict:
    v = REM.unpack_from(data)
    if len(data) != REM.size:
        raise ValueError(f"rem 长度 {len(data)} ≠ {REM.size}")
    _magic, _ver, _pad, rid, flag = v[:5]
    items, counts, weights = v[5:21], v[21:37], v[37:53]
    return {
        "id": rid,
        "flag": flag,
        "items": [
            {"item": i, "count": c, "weight": w}
            for i, c, w in zip(items, counts, weights, strict=True)
            if i and c
        ],
    }


def read_brem(data: bytes) -> dict:
    if len(data) != BREM.size:
        raise ValueError(f"brem 长度 {len(data)} ≠ {BREM.size}")
    v = BREM.unpack_from(data)
    _magic, _ver, _pad, em, part, label = v[:6]
    items, counts, weights = v[6:14], v[14:22], v[22:30]
    return {
        "em": em,
        "part": part,
        "label": label,
        "items": [
            {"item": i, "count": c, "weight": w}
            for i, c, w in zip(items, counts, weights, strict=True)
            if i and c
        ],
    }


def read_supp(data: bytes) -> list[dict]:
    """补给箱：24 格道具 + 16 格弹药；单人显示前 8 格，多人追加后面的格子（只输出单人份）。"""
    _magic, _ver, _pad, _sid = SUPP_HEAD.unpack_from(data)
    v = SUPP_ITEMS.unpack_from(data, SUPP_HEAD.size)
    items = [(v[2 * k], v[2 * k + 1]) for k in range(24)]
    show = v[48]
    base = 51
    ammo = [(v[base + 2 * k], v[base + 2 * k + 1]) for k in range(16)]
    ammo_show = v[base + 32]
    return [{"item": i, "count": c} for i, c in items[:show] + ammo[:ammo_show] if i and c]


def read_difficulty(data: bytes) -> tuple[list[tuple], list[tuple]]:
    """em_difficulty.dtt_dif：magic、版本 + 单人 1000 行 × 9f + 多人 1000 行 × 9f + 尾部 7 个 u32。"""
    if len(data) != 8 + 2 * 1000 * 36 + 28:
        raise ValueError(f"dtt_dif 长度 {len(data)} 不符")
    row = struct.Struct("<9f")
    solo = [row.unpack_from(data, 8 + i * 36) for i in range(1000)]
    multi = [row.unpack_from(data, 8 + 36000 + i * 36) for i in range(1000)]
    return solo, multi


def monster_names(s: Source, monsters: list[dict]) -> dict[int, dict]:
    """怪物编号（dtt_epg 的 monster_id）→ 名称。大型怪取 monsters.json，小型怪读各自的 ems dtt_epg。

    不能用 em_names 的「编号 × 2」：61 号以后会错位。
    """
    out: dict[int, dict] = {}
    for m in monsters:
        if m["name"]:
            out.setdefault(m["gameId"], {"key": m["key"], "name": m["name"]})
    names = s.text("common/text/em_names")
    for path in sorted(s.root.glob("em/ems*/*/data/ems*.dtt_epg")):
        sub = path.parent.parent.name
        ems = path.parent.parent.parent.name
        e = epg.parse(crypto.decrypt(path.read_bytes(), crypto.KEYS[".dtt_epg"]))
        for key in (f"{ems.upper()}_{sub}", ems.upper()):
            i = key_index(names, key)
            name = tr(names, i) if i is not None else None
            if name:
                out.setdefault(e.monster_id, {"key": f"{ems}_{sub}", "name": name})
                break
    # 0–60 号的名称正好在 em_names 的第「编号 × 2」条（古代鹿首精 51 的 dtt_epg 与鹿首精共用 23，只能这样取）；
    # 先用已知的对应核对这条规则，不成立就报错
    for mid, v in out.items():
        if mid <= 60 and (tr(names, mid * 2) or {}).get("zh-Hans") != v["name"]["zh-Hans"]:
            raise ValueError(f"em_names 第 {mid * 2} 条不是 {v['name']['zh-Hans']}，编号 × 2 的规则不成立")
    for mid in range(61):
        name = tr(names, mid * 2)
        key = names["zh-Hans"].keys.get(mid * 2, "")
        if mid not in out and name and re.fullmatch(r"EMS?\d+(_\d+)?", key):
            out[mid] = {"key": key.lower(), "name": name}
    return out


def build_quests(s: Source, monsters: list[dict], log=print) -> dict:
    solo, multi = read_difficulty(s.path("common/em/em_difficulty.dtt_dif").read_bytes())
    stage_names = s.text("common/text/other_names")
    em_names = monster_names(s, monsters)
    rems: dict[int, dict] = {}
    quests = []
    skipped = 0
    for path in sorted(s.root.glob("quest/questData_*.mib")):
        rel = path.relative_to(s.root).as_posix()
        r = mib.parse(path.read_bytes())
        qid = r["id"]
        texts = s.text(f"common/text/quest/q{qid:05d}")
        name = tr(texts, 0)
        if not name or name.get("en", "").strip() in ("Unavailable", "DUMMY") or not (0 <= r["rank"] <= 2):
            skipped += 1
            continue
        stage_i = key_index(stage_names, f"ST{r['map']}_NAME")
        rem_ids = [x for x in (r["rem1"], r["rem2"], r["rem3"]) if x]
        for x in rem_ids:
            rp = s.path(f"quest/rem/remData_{x:05d}.rem")
            if x not in rems and rp.is_file():
                rems[x] = read_rem(rp.read_bytes())
        supp_path = s.path(f"quest/supp/suppData_{r['supp']:05d}.supp") if r["supp"] else None
        mons = []
        for m in mib.monsters(r):
            d = solo[m["hp"]]
            mons.append(
                {
                    "id": m["id"],
                    "hp": round(d[0], 3),
                    "atk": round(solo[m["atk"]][1], 3),
                    "plDmg": round(solo[m["plDmg"]][2], 3),
                    "partHp": round(solo[m["partHp"]][3], 3),
                    "_rows": {"hp": m["hp"], "atk": m["atk"]},
                }
            )
        quests.append(
            {
                "id": qid,
                "name": name,
                "objective": tr(texts, 1) or {},
                "failure": tr(texts, 2) or {},
                "client": tr(texts, 3) or {},
                "desc": tr(texts, 4) or {},
                "subObjective": tr(texts, 5) or {},
                "rank": RANKS[r["rank"]],
                "stars": r["stars"] - 10 if r["rank"] == 2 else r["stars"],
                "map": r["map"],
                **({"mapName": tr(stage_names, stage_i) or {}} if stage_i is not None else {}),
                "time": r["time"],
                "reward": r["reward"],
                # 可倒地次数 = 报酬金 ÷ 每次力尽扣款（512 个带「N次力尽」文本的任务全部吻合）
                "faints": r["reward"] // r["faint_penalty"] if r["faint_penalty"] else None,
                "hrPoints": r["hr_points"],
                "hrRestrict": r["hr_restrict"],
                "objectives": mib.objectives(r, "o"),
                "subObjectives": mib.objectives(r, "s"),
                "monsters": mons,
                "multiHp": round(multi[r["multi_diff"]][0], 3),
                "rewards": [x for x in rem_ids if x in rems],
                **(
                    {"supply": read_supp(supp_path.read_bytes())} if supp_path and supp_path.is_file() else {}
                ),
                "_src": {"file": rel, "text": f"common/text/quest/q{qid:05d}"},
            }
        )
    log(f"任务 {len(quests)} 个（跳过占位 / 测试 {skipped} 个），报酬表 {len(rems)} 张")
    return {
        "quests": quests,
        "rewards": [rems[k] for k in sorted(rems)],
        "monsters": {str(k): v for k, v in sorted(em_names.items())},
    }


def build_monster_rewards(s: Source) -> list[dict]:
    """捕获 / 部位破坏 / 狩猎 / 指引之地报酬（quest/bui/brRR_emXXX_YY_PP.brem）。

    label 是 common/text/em_parts 的条目号（「捕获%s」「破坏%s的头部」……）；PP 11–14 是指引之地低 / 中 / 高 / 历战。
    """
    parts = s.text("common/text/em_parts")
    out = []
    for path in sorted(s.root.glob("quest/bui/*.brem")):
        m = BREM_NAME.search(path.name)
        if not m:
            continue
        rank, em, sub, pp = (int(x) for x in m.groups())
        b = read_brem(path.read_bytes())
        if not b["items"]:
            continue
        label = tr(parts, b["label"]) or {}
        out.append(
            {
                "rank": RANKS[rank],
                "em": f"em{em:03d}_{sub:02d}",
                "slot": pp,
                "label": label,
                "guidingLands": 11 <= pp <= 14,
                "items": b["items"],
                "_src": {"file": path.relative_to(s.root).as_posix()},
            }
        )
    return out
