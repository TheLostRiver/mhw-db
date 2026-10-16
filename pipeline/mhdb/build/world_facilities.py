"""据点设施：神秘炼金、补给物资所、交货委托、奖金、蒸气机关管理所、随从探险队、交易船、植生研究所。

字段含义、核对依据与未确认项见 docs/DATA.md 3.7。这些表都不加密。
"""

from mhdb.build.common import Source, src, tr
from mhdb.formats.table import spec
from mhdb.games.world import specs as S

MELDER_CATEGORIES = {1: "item", 2: "ammo", 3: "material", 4: "decoration"}
BOUNTY_RANKS = {0: "low", 2: "high", 3: "master"}
STEAM_TABLES = {
    "base": "steamRewardList",
    "spring": "steamRewardListSpring",
    "summer": "steamRewardListSummer",
    "autumn": "steamRewardListAutumn",
    "winter": "steamRewardListWinter",
    "memorial": "steamRewardListMemorial",
}
EXPEDITION_STAGES = [101, 102, 103, 104, 105, 108, 109]
EXPEDITION_RANKS = {"L": "low", "H": "high", "G": "master"}
GATHER = {22: "ore", 42: "bone", 4: "plant", 1: "mushroom", 255: "monster"}
ARGOSY_KINDS = ["goods", "material", "value"]
PLANT_CATEGORIES = {1: "plant", 2: "insect", 3: "mushroom"}
# cm_facility 里肥料名 / 说明 / 效果名的起始序号（按 key LABO_FE_* 逐条对上）
FERT_NAME, FERT_DESC, FERT_EFFECT = 720, 729, 710


def _items(r: dict, keys: list[tuple[str, str]]) -> list[dict]:
    return [{"item": r[i], "count": r[c]} for i, c in keys if r[i] and r[c]]


def build_melder(s: Source) -> list[dict]:
    rel = "common/maka/maka_item.mkit"
    xrel = "common/maka/maka_exchange.mkex"
    targets = s.table(rel, S.MELDER_ITEM)
    # 一行 = 一种可投入的素材，p{j} = 投入 1 个时为第 j 个目标提供的炼金值（列数 = 目标数）
    xspec = spec(
        "maka_exchange.mkex", "src_item:I bonus:I " + " ".join(f"p{j}:H" for j in range(len(targets)))
    )
    sources = [r for r in s.table(xrel, xspec) if r["src_item"]]
    out = []
    for j, t in enumerate(targets):
        if not t["item"] or t["category"] not in MELDER_CATEGORIES:
            continue
        pairs = sorted(
            ((r["src_item"], r[f"p{j}"]) for r in sources if r[f"p{j}"]), key=lambda x: (-x[1], x[0])
        )
        out.append(
            {
                "item": t["item"],
                "points": t["research_points"],
                "melding": t["melding_points"],
                "category": MELDER_CATEGORIES[t["category"]],
                "unlock": t["unlock"],
                "sources": [list(p) for p in pairs],
                "_src": src(rel, j),
            }
        )
    return out


def build_shop(s: Source) -> list[dict]:
    rel = "common/facility/shopList.slt"
    rows = s.table(rel, S.SHOP)
    return [
        {"item": r["item"], "unlock": r["unlock"], "sort": r["sort"], "_src": src(rel, i)}
        for i, r in sorted(enumerate(rows), key=lambda x: (x[1]["sort"], x[0]))
        if r["item"]
    ]


def build_deliveries(s: Source) -> list[dict]:
    rel = "common/facility/l_delivery.stmp"
    texts = s.text("common/text/steam/l_delivery")
    out = []
    for row, r in enumerate(s.table(rel, S.DELIVERY)):
        title = tr(texts, r["id"] * 5)
        if r["kind"] < 0 or not title:
            continue
        out.append(
            {
                "id": r["id"],
                "title": title,
                "client": tr(texts, r["id"] * 5 + 1) or {},
                "desc": tr(texts, r["id"] * 5 + 2) or {},
                "reward": tr(texts, r["id"] * 5 + 4) or {},
                "kind": r["kind"],
                "cost": r["cost"],
                "materials": _items(r, [("item_1", "count_1"), ("item_2", "count_2")]),
                **({"rewardItem": r["reward_item"]} if r["reward_item"] else {}),
                "_src": src(rel, row),
            }
        )
    return out


def build_bounties(s: Source) -> list[dict]:
    rel = "common/facility/l_mission.odr"
    texts = s.text("common/text/l_mission")
    out = []
    for row, r in enumerate(s.table(rel, S.BOUNTY)):
        title = tr(texts, r["id"] * 2)
        if not title:
            continue
        out.append(
            {
                "id": r["id"],
                "title": title,
                "desc": tr(texts, r["id"] * 2 + 1) or {},
                "important": bool(r["important"]),
                "rank": BOUNTY_RANKS.get(r["rank"], "low"),
                "type": r["type"],
                "rewards": _items(r, [(f"item_{k}", f"count_{k}") for k in (1, 2, 3)]),
                "points": r["research_points"],
                # 登记奖金按剧情进度区间轮换（重要奖金的这两个字段是标志编号，含义未确认）
                **({"progress": [r["range_min"], r["range_max"]]} if not r["important"] else {}),
                "_src": src(rel, row),
            }
        )
    return out


def build_steamworks(s: Source) -> dict:
    tables = {}
    for key, name in STEAM_TABLES.items():
        rel = f"common/facility/{name}.srl"
        tables[key] = [
            {
                "tier": r["type"],
                "item": r["item"],
                "count": r["count"],
                "weight": r["weight"],
                "_src": src(rel, i),
            }
            for i, r in enumerate(s.table(rel, S.STEAM_REWARD))
            if r["item"]
        ]
    fuel_rel = "common/facility/steamConvertList.scl"
    fuel = [
        {"item": r["item"], "fuel": r["fuel"], "_src": src(fuel_rel, i)}
        for i, r in enumerate(s.table(fuel_rel, S.STEAM_FUEL))
        if r["item"]
    ]
    return {"rewards": tables, "fuel": fuel}


def build_expeditions(s: Source) -> dict:
    rel = "common/facility/expeditionRem.ex_rem"
    rewards = []
    for row, r in enumerate(s.table(rel, S.EXPEDITION_REWARD)):
        items = [
            {"item": r[f"item_{k}"], "count": r[f"count_{k}"], "weight": r[f"weight_{k}"]}
            for k in range(16)
            if r[f"item_{k}"] and r[f"count_{k}"]
        ]
        if not items or r["gather"] not in GATHER:
            continue
        rewards.append({"id": row, "gather": GATHER[r["gather"]], "items": items, "_src": src(rel, row)})
    targets = []
    for stage in EXPEDITION_STAGES:
        for letter, rank in EXPEDITION_RANKS.items():
            mrel = f"common/facility/expeditionSt{stage}{letter}.ex_map"
            if not s.path(mrel).is_file():
                continue
            for i, r in enumerate(s.table(mrel, S.EXPEDITION_TARGET)):
                targets.append(
                    {
                        "stage": stage,
                        "rank": rank,
                        "reward": r["rem"],
                        "quest": r["quest"],
                        "_src": src(mrel, i),
                    }
                )
    return {"rewards": rewards, "targets": targets}


def build_argosy(s: Source) -> list[dict]:
    out = []
    for kind in ARGOSY_KINDS:
        for rare in (False, True):
            rel = f"common/facility/{kind}{'_rare' if rare else ''}.trdr"
            for i, r in enumerate(s.table(rel, S.ARGOSY)):
                if not r["item"]:
                    continue
                out.append(
                    {
                        "kind": kind,
                        "rare": rare,
                        "item": r["item"],
                        "qty": [r[f"qty_{k}"] for k in range(6)],
                        "weight": [r[f"weight_{k}"] for k in range(6)],
                        "_src": src(rel, i),
                    }
                )
    return out


def build_botany(s: Source) -> dict:
    rel = "common/plant/plant_item.plit"
    frel = "common/plant/plant_fertilizer.plfe"
    texts = s.text("common/text/cm_facility")
    plants = [
        {
            "item": r["item"],
            "category": PLANT_CATEGORIES[r["category"]],
            "quests": r["time"],
            "harvest": [r["amount"], r["amount_s"], r["amount_l"]],
            "initial": bool(r["start"]),
            "_src": src(rel, i),
        }
        for i, r in enumerate(s.table(rel, S.PLANT))
        if r["item"] and r["category"] in PLANT_CATEGORIES
    ]
    fertilizers = []
    for i, r in enumerate(s.table(frel, S.FERTILIZER)):
        name = tr(texts, FERT_NAME + r["fert"])
        if not name:
            raise ValueError(f"{frel} 行 {i}：肥料 {r['fert']} 没有名称")
        fertilizers.append(
            {
                "name": name,
                "desc": tr(texts, FERT_DESC + r["fert"]) or {},
                "effect": tr(texts, FERT_EFFECT + r["effect"]) or {} if r["effect"] else {},
                "price": r["price"],
                "duration": r["duration"],
                "_src": src(frel, i),
            }
        )
    return {"plants": plants, "fertilizers": fertilizers}
