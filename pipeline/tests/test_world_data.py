"""对照测试：用本地解包结果生成的 data/world/*.json，断言与游戏画面一致的数值。

已核对的来源：用户提供的游戏截图（2026-10-14，装备详情与饰品界面）。缺少数据时跳过。
"""

import json

import pytest

from mhdb.config import DATA

WORLD = DATA / "world"
pytestmark = [
    pytest.mark.game,
    pytest.mark.skipif(not (WORLD / "skills.json").is_file(), reason="需要先运行 mhdb parse"),
]


def load(name: str, key: str) -> list[dict]:
    return json.loads((WORLD / name).read_text(encoding="utf-8"))[key]


def by_name(rows: list[dict], zh: str) -> dict:
    hits = [r for r in rows if r["name"].get("zh-Hans") == zh]
    assert hits, f"找不到 {zh}"
    return hits[0]


def test_black_fatalis_blade_matches_screenshot() -> None:
    # 截图：黑龙玄刃 稀有度 12，攻击力 1632，龙属性 180，龙封力 大，镶嵌槽 4·4
    w = by_name(load("weapons/great-sword.json", "weapons"), "黑龙玄刃")
    assert w["rarity"] == 12
    assert round(w["attack"] * 4.8) == 1632  # 数据存真实攻击力，大剑显示值 = ×4.8
    assert w["element"] == {"type": "dragon", "value": 18}  # 显示值 = ×10
    assert w["elderseal"] == 3
    assert w["slots"] == [4, 4]
    assert w["name"]["en"] == "Black Fatalis Blade"


def test_critical_evasion_jewel_matches_screenshot() -> None:
    # 截图：超心·回避珠【4】 = 超会心 1 + 回避性能 1
    skills = {s["id"]: s for s in load("skills.json", "skills")}
    d = by_name(load("decorations.json", "decorations"), "超心·回避珠【4】")
    assert d["size"] == 4
    assert {skills[s["id"]]["name"]["zh-Hans"]: s["level"] for s in d["skills"]} == {
        "超会心": 1,
        "回避性能": 1,
    }


def test_critical_boost_levels_match_screenshot() -> None:
    # 截图：超会心 等级 1/2/3 = 会心攻击时的伤害倍率增强为 1.3 / 1.35 / 1.4 倍
    s = by_name(load("skills.json", "skills"), "超会心")
    assert s["maxLevel"] == 3
    descs = [lv["desc"]["zh-Hans"].replace("\n", "") for lv in s["levels"]]
    assert [x in d for x, d in zip(("1.3倍", "1.35倍", "1.4倍"), descs, strict=True)] == [True] * 3
    assert [lv["params"][0] for lv in s["levels"]] == [130, 135, 140]


def test_secret_skill_unlocks() -> None:
    # 挑战者 6、7 级由「极意」类套装技能解锁；黑龙的传说 2 件解锁全部极意
    skills = load("skills.json", "skills")
    names = {s["id"]: s["name"]["zh-Hans"] for s in skills}
    agitator = by_name(skills, "挑战者")
    assert (agitator["baseMaxLevel"], agitator["maxLevel"]) == (5, 7)
    unlocks = {(names[u["skill"]], u["level"]) for u in agitator["levels"][5]["unlockedBy"]}
    assert ("黑龙的传说", 2) in unlocks


def test_charm_and_armor() -> None:
    charm = by_name(load("charms.json", "charms"), "挑战护石5")
    assert charm["rarity"] == 12
    hide = by_name(load("armor.json", "armor"), "精英·龙皮阿尔法")
    assert hide["slot"] == "chest" and hide["slots"] == [4, 4, 3] and hide["rarity"] == 12
    assert hide["series"]["name"]["en"] == "Fatalisα+"


def test_every_record_has_source() -> None:
    for name, key in (("items.json", "items"), ("armor.json", "armor"), ("decorations.json", "decorations")):
        for r in load(name, key):
            assert r["_src"]["file"].startswith("common/")


# ---------- 武器客制（数值来自数据；与游戏画面的核对见 docs/DATA.md） ----------


def custom() -> dict:
    return json.loads((WORLD / "weapon-custom.json").read_text(encoding="utf-8"))


def test_augment_levels_and_slot_costs() -> None:
    levels = custom()["augments"]["levels"]
    cost = {
        c: [lv["slotCost"] for lv in levels if lv["category"] == c]
        for c in ("attack", "affinity", "defense", "slot", "health", "element")
    }
    assert cost["attack"] == [3, 5, 7, 9]
    assert cost["affinity"] == [2, 4, 6, 8]
    assert cost["defense"] == [1, 2, 3, 5]
    assert cost["health"] == [3, 5, 7, 9]
    assert by_name(levels, "攻击力强化4")["level"] == 4
    assert by_name(levels, "扩充自定义栏3")["category"] == "extend"


def test_augment_effects_from_player_params() -> None:
    fx = custom()["augments"]["effects"]
    assert fx["attack"] == [5, 10, 15, 25]
    assert fx["affinity"] == [10, 15, 20, 25]
    assert fx["elementMultiplier"]["great-sword"] == 1.2


def test_custom_parts_stages() -> None:
    gs = custom()["parts"]["great-sword"]
    assert [p["stage"] for p in gs] == sorted(p["stage"] for p in gs)
    assert {p["stage"] for p in gs} == set(range(1, 8))
    part = by_name(gs, "冥灯龙零件")
    assert part["stage"] == 7
    assert part["effect"] == {"sharpness": 1}


def test_awakening_abilities() -> None:
    aw = custom()["awakening"]
    atk6 = by_name(aw, "攻击力强化6")
    assert (atk6["category"], atk6["rank"], atk6["stackable"]) == ("attack", 6, False)
    assert by_name(aw, "攻击力强化5")["stackable"] is True
    assert by_name(aw, "冰牙龙的秘技")["setSkill"] == 188
    sharp = by_name(aw, "锐利度强化1")
    assert "bow" not in sharp["weapons"] and "great-sword" in sharp["weapons"]
    assert all(a["weapons"] == ["hunting-horn"] for a in aw if a["category"] == "melody")


def test_awakened_weapons_marked_and_deduplicated() -> None:
    gs = load("weapons/great-sword.json", "weapons")
    safi = [w for w in gs if w.get("awakened")]
    assert len(safi) == 18
    assert sum(1 for w in safi if "duplicateOf" not in w) == 9


def test_awakening_values_by_weapon() -> None:
    aw = custom()["awakening"]
    atk6 = by_name(aw, "攻击力强化6")["value"]
    assert atk6["kind"] == "attack"
    assert (atk6["byWeapon"]["great-sword"], atk6["byWeapon"]["long-sword"]) == (14, 15)
    el6 = by_name(aw, "属性强化6")["value"]["byWeapon"]
    assert (el6["great-sword"], el6["dual-blades"]) == (15, 9)
    assert "heavy-bowgun" not in el6
    assert by_name(aw, "镶嵌槽强化4")["value"] == {
        "kind": "slotLevel",
        "byWeapon": dict.fromkeys([k for k in by_name(aw, "镶嵌槽强化4")["weapons"]], 4),
    }
    assert by_name(aw, "旋律【攻击】1")["value"] is None


def test_weapon_bloat_against_exe_dump() -> None:
    import os
    from pathlib import Path

    from mhdb.games.world import exe

    dump = os.environ.get("MHDB_EXE_DUMP")
    if not dump or not Path(dump).is_file():
        pytest.skip("设置 MHDB_EXE_DUMP 指向本机 exe 内存转储后核对")
    exe.verify_dump(Path(dump))
    bloat = json.loads((WORLD / "constants.json").read_text(encoding="utf-8"))["weaponBloat"]
    assert round(340 * bloat["great-sword"]) == 1632  # 黑龙玄刃，游戏截图


def test_sharpness_multipliers() -> None:
    c = json.loads((WORLD / "constants.json").read_text(encoding="utf-8"))
    assert c["sharpness"]["raw"] == [0.5, 0.75, 1.0, 1.05, 1.2, 1.32, 1.39]
    assert c["sharpness"]["element"][6] == 1.25
    assert (c["critMultiplier"], c["badCritMultiplier"]) == (1.25, 0.75)
