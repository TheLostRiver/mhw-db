import pytest

from mhdb.build.common import Source
from mhdb.build.world import _special
from mhdb.config import DATA_RAW
from mhdb.games.world import specs as S

WORLD = DATA_RAW / "world"
pytestmark = pytest.mark.skipif(
    not (WORLD / "common/equip/wep_glan.wep_glan").is_file(), reason="需要先运行 mhdb extract"
)


@pytest.fixture(scope="module")
def src() -> Source:
    return Source(WORLD)


def _by_name(s: Source, file: str, text: str, ranged: bool = False) -> dict[str, dict]:
    rel = f"common/equip/{file}.wp_dat_g" if ranged else f"common/equip/{file}.wp_dat"
    names = s.text(f"common/text/steam/{text}")["en"]
    return {names.get(r["name_index"]): r for r in s.table(rel, S.RANGED if ranged else S.MELEE)}


def _tables(s: Source) -> dict:
    return {
        "shell": s.table("common/equip/wep_glan.wep_glan", S.GUNLANCE_SHELL),
        "phial": s.table("common/equip/wep_saxe.wep_saxe", S.PHIAL),
        "dual": s.table("common/equip/wep_wsword.wep_wsd", S.DUAL_ELEMENT),
        "coating": s.table("common/equip/bottle_table.bbtbl", S.BOW_COATING),
    }


def test_against_kiranico(src: Source) -> None:
    """取值与 Kiranico 一致：铁铳枪 1 通常 Lv1、骨炮 1 放射 Lv1、铬金戟 3 通常 Lv6；改良钢斧 毒 30、甲壳斧 麻痹 18；
    调查团试作盾斧 榴弹瓶、火龙剑斧 强属性瓶；Twin Flames 毒 27 / 火 27；Princess Arrow 毒瓶强化。"""
    t = _tables(src)
    gl = _by_name(src, "g_lance", "g_lance")
    assert _special("gunlance", gl["Iron Gunlance I"], t) == {"shelling": {"type": "normal", "level": 1}}
    assert _special("gunlance", gl["Bone Cannon I"], t) == {"shelling": {"type": "long", "level": 1}}
    assert _special("gunlance", gl["Chrome Halberd III"], t) == {"shelling": {"type": "normal", "level": 6}}
    sa = _by_name(src, "s_axe", "s_axe")
    assert _special("switch-axe", sa["Improved Steel Axe I"], t) == {"phial": {"type": "poison", "value": 30}}
    assert _special("switch-axe", sa["Carapace Axe I"], t) == {"phial": {"type": "paralysis", "value": 18}}
    assert _special("switch-axe", sa["Power Smasher II"], t) == {"phial": {"type": "dragon", "value": 42}}
    assert _special("switch-axe", sa["Jagras Axe III"], t) == {"phial": {"type": "exhaust", "value": 15}}
    cb = _by_name(src, "c_axe", "c_axe")
    assert _special("charge-blade", cb["Proto Commission Axe I"], t)["phial"]["type"] == "impact"
    assert _special("charge-blade", cb["Rathsblade I"], t)["phial"]["type"] == "element"
    db = _by_name(src, "w_sword", "w_sword")
    assert _special("dual-blades", db["Twin Flames"], t) == {
        "elements": [{"type": "poison", "value": 27}, {"type": "fire", "value": 27}]
    }
    assert _special("dual-blades", db["Strong Ale"], t) == {
        "elements": [{"type": "paralysis", "value": 12}, {"type": "sleep", "value": 6}]
    }
    bow = _by_name(src, "bow", "bow", ranged=True)
    coats = _special("bow", bow["Princess Arrow I"], t)["coatings"]
    assert coats == {"close": 1, "power": 1, "paralysis": 0, "poison": 2, "sleep": 0, "blast": 0}
