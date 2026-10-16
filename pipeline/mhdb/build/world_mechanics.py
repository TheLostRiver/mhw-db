"""游戏里看不见的数值：回避性能的无敌时间、几个技能的隐藏参数、寒气炼成倍率、操虫棍的萃取与猎虫参数。

这些是定长结构（不是表），按偏移读；偏移按 MHW-Editor 的 plp / plsp / w10p 模板累加得到（只读作格式文档），
用多处已知数值核对过布局没有偏移。只输出已与公开资料核对的字段，见 docs/DATA.md 3.10。
"""

import struct

from mhdb.build.common import Source
from mhdb.formats import crypto
from mhdb.games.world import specs as S

PLP = "common/pl/pl_param.plp"
PLSP = "common/pl/pl_skill_param.plsp"
W10P = "hm/wp/wp10/wp10_param.w10p"
WEAPON_KEYS = [key for _, key, _, _ in S.WEAPON_TYPES]


def _f(data: bytes, fmt: str, offset: int) -> list[float]:
    return [round(x, 4) for x in struct.unpack_from("<" + fmt, data, offset)]


def build_mechanics(s: Source) -> dict:
    plp = crypto.decrypt_file(PLP, s.path(PLP).read_bytes())
    plsp = crypto.decrypt_file(PLSP, s.path(PLSP).read_bytes())
    w10 = crypto.decrypt_file(W10P, s.path(W10P).read_bytes())
    if plsp[:4] != b"PLS\0" or w10[:4] != b"W10\0":
        raise ValueError("pl_skill_param / wp10_param 的文件头不符")

    # 回避性能：偏移 1157 起 10 行 × 7（Lv0–5 + 回避衣装）；第 0 行与 Fextralife 一致，其余 9 行对应哪种回避未确认
    evade = _f(plp, "7f", 1157)
    if evade != [13, 15, 17, 19, 22, 25, 30]:
        raise ValueError(f"回避无敌帧 {evade} 与已核对的值不符，pl_param 布局可能变了")

    weakness = plsp[86]
    (heroics,) = struct.unpack_from("<f", plsp, 93)
    bludgeoner = list(struct.unpack_from("<8H", plsp, 674))
    _slide_delay, slide_duration, slide_affinity = struct.unpack_from("<ffB", plsp, 694)
    if (weakness, bludgeoner[:4]) != (45, [30, 30, 25, 15]):
        raise ValueError("pl_skill_param 布局可能变了（弱点特效阈值 / 钝器能手不符）")

    frostcraft = {key: _f(plsp, "4f", 1281 + 28 * i) for i, key in enumerate(WEAPON_KEYS)}
    frost_segments = list(plsp[1673:1676])

    extract = _f(w10, "11f", 1177)
    bonus = _f(w10, "8f", 2313)
    dust = _f(w10, "4f", 2449)
    levels = [_f(w10, "20f", 2473 + 80 * k) for k in range(9)]
    return {
        "evade": {"frames": evade[:6], "mantle": evade[6], "_src": {"file": PLP, "offset": 1157}},
        "skills": {
            "weaknessExploitHitzone": weakness,
            "heroicsHealth": round(heroics, 3),
            # 钝器能手：红 → 紫的攻击加值 + 弩的近战攻击
            "bludgeoner": {"sharpness": bludgeoner[:7], "bowgunMelee": bludgeoner[7]},
            "slide": {"duration": round(slide_duration, 2), "affinity": slide_affinity},
            "_src": {"file": PLSP, "offsets": [86, 93, 674, 694]},
        },
        "frostcraft": {
            "multipliers": frostcraft,
            "segments": frost_segments,
            "_src": {"file": PLSP, "offset": 1281},
        },
        "kinsect": {
            # 红 / 白 / 橙 / 三色萃取的持续秒数；红 + 白、三色时的攻击倍率
            "extractDuration": {
                "red": extract[0],
                "white": extract[1],
                "orange": extract[2],
                "triple": extract[3],
            },
            "extractAttack": {"redWhite": extract[5], "triple": extract[6]},
            # 猎虫加成的倍率（切断 / 打击 / 属性 / 速度 / 回复萃取）与召回时回复的猎虫耐力
            "bonus": {
                "sever": bonus[0],
                "blunt": bonus[1],
                "element": bonus[2],
                "speed": bonus[3],
                "heal": bonus[7],
                "recallStamina": bonus[5],
            },
            "dustInterval": {"blast": dust[0], "heal": dust[1], "paralysis": dust[2], "poison": dust[3]},
            # 猎虫等级 1–20 → 数值（表 2、3、8 的对应关系未确认，不输出）
            "levels": {
                "power": levels[0],
                "speed": levels[1],
                "heal": levels[4],
                "blast": levels[5],
                "paralysis": levels[6],
                "poison": levels[7],
            },
            "_src": {"file": W10P, "offsets": [1177, 2313, 2449, 2473]},
        },
    }
