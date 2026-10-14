/**
 * 视觉方向静态稿用的示意数据。
 * 名称取自游戏简中文本（已核对），数值只是排版示意，不代表游戏数据；正式数据来自 data/world/。
 */

export interface NavEntry {
  label: string;
  href: string;
  desc: string;
  /** 拼音全拼与首字母，演示站内搜索 */
  py: string;
}

export const encyclopedia: NavEntry[] = [
  { label: '怪物', href: '#', desc: '肉质、耐性、部位破坏与掉落', py: 'guaiwu gw' },
  { label: '武器', href: '#', desc: '14 种武器的完整派生树', py: 'wuqi wq' },
  { label: '防具', href: '#', desc: '含 α+ / β+、套装技能与幻化', py: 'fangju fj' },
  { label: '护石', href: '#', desc: '技能、等级链与强化素材', py: 'hushi hs' },
  { label: '饰品', href: '#', desc: '含 4 级复合珠', py: 'shipin sp' },
  { label: '技能', href: '#', desc: '等级说明与极意解锁', py: 'jineng jn' },
  { label: '物品', href: '#', desc: '素材、调合与入手途径', py: 'wupin wp' },
  { label: '任务', href: '#', desc: '任务、调查任务与赏金', py: 'renwu rw' },
  { label: '聚魔之地', href: '#', desc: '地带等级、怪物分布与经验', py: 'jumozhidi jmzd' },
  { label: '环境生物', href: '#', desc: '出现地点与捕获条件', py: 'huanjingshengwu hjsw' },
  { label: '猫饭', href: '#', desc: '食材组合与猫饭技能', py: 'maofan mf' },
  { label: '祭典', href: '#', desc: '活动任务与轮换日历', py: 'jidian jd' },
];

export const tools: NavEntry[] = [
  { label: '配装器', href: '#', desc: '手动 / 自动配装、追加技能搜索', py: 'peizhuangqi pzq' },
  { label: '伤害模拟', href: '#', desc: '动作值 × 肉质 × 技能的期望伤害', py: 'shanghaimoni shmn' },
  { label: '交互地图', href: '#', desc: '采集点、环境生物与路线规划', py: 'jiaohuditu jhdt' },
  { label: '封面生成', href: '#', desc: '速通 / TA 封面，4K 导出', py: 'fengmianshengcheng fmsc' },
  { label: '怪猎历', href: '#', desc: '游戏内日期与活动轮换', py: 'guailieli gll' },
  { label: '概率模拟', href: '#', desc: '炼金、饰品抽选的期望次数', py: 'gailvmoni glmn' },
];

export interface AiMonster {
  key: string;
  name: string;
  en: string;
  kind: string;
  /** 标本卡上的单字 */
  glyph: string;
  /** 方向 C：随怪物换色 */
  tint: string;
}

/** 已收录于 AI 解析站的怪物（真实数据） */
export const aiMonsters: AiMonster[] = [
  { key: 'em013_00', name: '黑龙', en: 'Fatalis', kind: '古龙种', glyph: '黑', tint: '#c2413a' },
  { key: 'em023_05', name: '激昂金狮子', en: 'Furious Rajang', kind: '牙兽种', glyph: '狮', tint: '#e0a93a' },
  { key: 'em124_00', name: '历战王冰呪龙', en: 'Arch-Tempered Velkhana', kind: '古龙种', glyph: '冰', tint: '#6fbfe6' },
  { key: 'em057_00', name: '雷狼龙', en: 'Zinogre', kind: '牙龙种', glyph: '雷', tint: '#4fb3d9' },
  { key: 'em050_00', name: '煌黑龙', en: 'Alatreon', kind: '古龙种', glyph: '煌', tint: '#b8456b' },
];

export const aiSite = 'https://mhwi.helsincy.com';
export const aiLink = (key: string) => `${aiSite}/#/${key}/overview`;

export interface Project {
  name: string;
  short: string;
  desc: string;
  site: string;
  repo: string;
  tag: string;
}

export const projects: Project[] = [
  {
    name: '怪物 AI 解析',
    short: 'AI',
    desc: 'THK 反编译、出招概率模拟、逐行中文释义。已收录 5 只。',
    site: aiSite,
    repo: 'https://github.com/TheLostRiver/mhwi-ai',
    tag: 'Web',
  },
  {
    name: 'Helsincy Mod Manager',
    short: 'HMM',
    desc: 'MHW:I Mod 管理器：导入预览、安装回滚、装备重定向、存档备份。',
    site: 'https://hmm.helsincy.com',
    repo: 'https://github.com/TheLostRiver/HelsincyModManager',
    tag: 'Alpha',
  },
  {
    name: '霜序 Frostbound',
    short: '霜序',
    desc: '任务快速重启、综合套装（任务 + 配装 + 道具 + 猫饭）、手柄快捷键。',
    site: 'https://frostbound.helsincy.com',
    repo: 'https://github.com/TheLostRiver/reset-tool',
    tag: 'v0.3',
  },
];

export interface Region {
  id: string;
  name: string;
  en: string;
  glyph: string;
  accent: string;
}

/** 地区（stage 编号来自游戏数据，主题色是本站设计） */
export const regions: Region[] = [
  { id: 'st101', name: '古代树森林', en: 'Ancient Forest', glyph: '森', accent: '#4f9f62' },
  { id: 'st102', name: '大蚁冢荒地', en: 'Wildspire Waste', glyph: '砂', accent: '#c99a3c' },
  { id: 'st103', name: '陆珊瑚台地', en: 'Coral Highlands', glyph: '珊', accent: '#df6f86' },
  { id: 'st104', name: '瘴气之谷', en: 'Rotten Vale', glyph: '瘴', accent: '#b25a3e' },
  { id: 'st105', name: '龙结晶之地', en: "Elder's Recess", glyph: '晶', accent: '#e38338' },
  { id: 'st108', name: '永霜冻土', en: 'Hoarfrost Reach', glyph: '霜', accent: '#4fa3d6' },
  { id: 'st109', name: '聚魔之地', en: 'Guiding Lands', glyph: '魔', accent: '#36ad9d' },
];

/* ---------- 配装器示意 ---------- */

export interface GearPiece {
  slot: string;
  name: string;
  rarity: number;
  /** 饰品孔等级，0 = 无 */
  decoSlots: number[];
  decos: string[];
  skills: string;
}

export const weapon = {
  type: '大剑',
  name: '严冰之翼',
  rarity: 12,
  attack: 1392,
  affinity: 15,
  element: { kind: '冰', value: 330, color: 'var(--el-ice)' },
  decoSlots: [4, 4, 2],
  decos: ['攻击珠2【4】', '达人珠2【4】', '挑战珠【2】'],
};

export const gear: GearPiece[] = [
  { slot: '头部', name: '精英·煌黑龙智慧阿尔法', rarity: 12, decoSlots: [4, 2, 0], decos: ['超心·体力珠【4】', '无伤珠【2】'], skills: '弱点特效 2 · 无伤 1' },
  { slot: '身体', name: '精英·煌黑龙灵魂阿尔法', rarity: 12, decoSlots: [4, 4, 1], decos: ['匠珠2【4】', '挑战珠2【4】', '攻击珠【1】'], skills: '攻击 2 · 精神抖擞 1' },
  { slot: '腕部', name: '精英·煌黑龙神力阿尔法', rarity: 12, decoSlots: [4, 3, 0], decos: ['挑战·体力珠【4】', '匠珠【3】'], skills: '超会心 2 · 看破 1' },
  { slot: '腰部', name: '精英·煌黑龙细鳞阿尔法', rarity: 12, decoSlots: [4, 1, 1], decos: ['无伤·体力珠【4】', '达人珠【1】', '攻击珠【1】'], skills: '挑战者 2 · 体力增强 1' },
  { slot: '脚部', name: '精英·煌黑龙长腕阿尔法', rarity: 12, decoSlots: [2, 2, 1], decos: ['回避珠【2】', '超心珠【2】', '体力珠【1】'], skills: '回避性能 2 · 耳塞 1' },
  { slot: '护石', name: '攻击护石5', rarity: 10, decoSlots: [], decos: [], skills: '攻击 5' },
];

export interface SkillLevel {
  name: string;
  level: number;
  max: number;
  /** 超出上限的点数（浪费） */
  over?: number;
}

export const skills: SkillLevel[] = [
  { name: '攻击', level: 7, max: 7, over: 1 },
  { name: '看破', level: 7, max: 7 },
  { name: '超会心', level: 3, max: 3 },
  { name: '弱点特效', level: 3, max: 3 },
  { name: '挑战者', level: 5, max: 7 },
  { name: '匠', level: 3, max: 5 },
  { name: '无伤', level: 2, max: 3 },
  { name: '体力增强', level: 3, max: 3 },
  { name: '回避性能', level: 2, max: 5 },
  { name: '耳塞', level: 1, max: 5 },
];

export const setBonus = [
  { name: '套装技能 · 示意', pieces: 4, need: [2, 4], active: '2 件效果已激活' },
];

export const stats = {
  attack: 1392,
  affinity: 85,
  element: 330,
  defense: 712,
  effectiveRaw: 412.6,
  sharpness: [
    { color: 'var(--sharp-red)', len: 40 },
    { color: 'var(--sharp-orange)', len: 30 },
    { color: 'var(--sharp-yellow)', len: 30 },
    { color: 'var(--sharp-green)', len: 50 },
    { color: 'var(--sharp-blue)', len: 90 },
    { color: 'var(--sharp-white)', len: 60 },
    { color: 'var(--sharp-purple)', len: 40 },
  ],
  resist: [
    { el: '火', value: 3, color: 'var(--el-fire)' },
    { el: '水', value: 1, color: 'var(--el-water)' },
    { el: '雷', value: -2, color: 'var(--el-thunder)' },
    { el: '冰', value: 5, color: 'var(--el-ice)' },
    { el: '龙', value: 0, color: 'var(--el-dragon)' },
  ],
};

export const searchTargets = [
  { name: '攻击', level: 7 },
  { name: '看破', level: 7 },
  { name: '超会心', level: 3 },
  { name: '弱点特效', level: 3 },
  { name: '匠', level: 3 },
];

export const searchResults = [
  { rank: 1, defense: 724, free: '4·4·2', extra: '耳塞 3 · 无伤 2', expect: 418.2 },
  { rank: 2, defense: 718, free: '4·3·2', extra: '体力增强 3', expect: 416.9 },
  { rank: 3, defense: 731, free: '4·2·1', extra: '回避性能 2 · 精神抖擞 1', expect: 415.4 },
  { rank: 4, defense: 702, free: '3·3·3', extra: '挑战者 2', expect: 414.8 },
  { rank: 5, defense: 709, free: '4·1·1', extra: '集中 2', expect: 413.0 },
];

export const additionalSkills = [
  { name: '耳塞', max: 3 },
  { name: '无伤', max: 2 },
  { name: '体力增强', max: 3 },
  { name: '集中', max: 2 },
  { name: '精神抖擞', max: 1 },
  { name: '回避性能', max: 2 },
];

/** 选择器演示用：可选武器（名称来自游戏文本，分组为排版示意） */
export const pickerGroups = [
  { group: '冰属性', items: ['严冰之翼', '冰尖巨牙', '冰尖巨牙·改', '冰翼灵羽', '冰刃剑1', '冰刃剑2', '冰鱼龙斩剑1', '冰鱼龙斩剑2'] },
  { group: '雷属性', items: ['召雷剑', '召雷剑【麒麟】', '召雷剑【麒麟王】', '召雷剑【麒麟帝】', '兵器雷颚大剑', '兵器雷颚大剑·改', '兵器蛮雷大剑'] },
  { group: '无属性', items: ['业剑暗黑暴食', '土砂龙巨剑1', '土砂龙巨剑2', '冥灯龙大剑', '冥灯龙大剑改'] },
];

/** 命令面板演示用条目 */
export const paletteEntries = [
  ...encyclopedia.map((e) => ({ ...e, kind: '百科' })),
  ...tools.map((e) => ({ ...e, kind: '工具' })),
  ...aiMonsters.map((m) => ({ label: m.name, href: aiLink(m.key), desc: `${m.en} · AI 解析`, py: '', kind: '怪物' })),
  ...regions.map((r) => ({ label: r.name, href: '#', desc: r.en, py: '', kind: '地图' })),
];

export const disclaimer =
  '本站为个人非官方项目，与 CAPCOM 无关。游戏名称、商标与素材版权归 CAPCOM CO., LTD. 所有；如需下架请通过反馈入口联系，收到后会尽快处理。';
