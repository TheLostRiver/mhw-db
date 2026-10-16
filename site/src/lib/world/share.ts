/**
 * 配装分享：把配装编码成 URL 片段（#b=…），打开链接时还原。
 * 编码是紧凑数组的 JSON，再转 UTF-8 → base64url；开头带版本号，以后改格式时旧链接仍能识别。
 * 解码时逐项检查类型，不合法的项丢掉（装备 id 是否存在由配装器在加载数据后自行处理）。
 */
import { ARMOR_SLOTS, HR_AUGMENTS, emptyBuild, type Build, type HrAugment, type Piece } from './builder';

const VERSION = 1;

type PieceTuple = [number | null, (number | null)[]];

const piece = (p: Piece): PieceTuple => [p.id, p.decos];

function toBase64Url(text: string): string {
  const bytes = new TextEncoder().encode(text);
  let bin = '';
  for (const b of bytes) bin += String.fromCharCode(b);
  return btoa(bin).replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
}

function fromBase64Url(s: string): string {
  const b64 = s.replace(/-/g, '+').replace(/_/g, '/');
  const bin = atob(b64 + '='.repeat((4 - (b64.length % 4)) % 4));
  return new TextDecoder().decode(Uint8Array.from(bin, (c) => c.charCodeAt(0)));
}

export function encodeBuild(b: Build): string {
  const data = [
    VERSION,
    b.weaponType,
    piece(b.weapon),
    ARMOR_SLOTS.map((s) => piece(b.armor[s])),
    b.charm,
    b.mantles.map(piece),
    b.mantleActive ? 1 : 0,
    [b.custom.augments, b.custom.hr, b.custom.parts, b.custom.awakening],
    b.conditions,
  ];
  return toBase64Url(JSON.stringify(data));
}

const isId = (v: unknown): v is number => typeof v === 'number' && Number.isInteger(v) && v >= 0;
const idOrNull = (v: unknown): number | null => (isId(v) ? v : null);
const ids = (v: unknown): (number | null)[] => (Array.isArray(v) ? v.slice(0, 8).map(idOrNull) : []);

function readPiece(v: unknown): Piece {
  if (!Array.isArray(v)) return { id: null, decos: [] };
  return { id: idOrNull(v[0]), decos: ids(v[1]) };
}

/** 解码失败（格式不对、版本未知）时返回 null */
export function decodeBuild(s: string): Build | null {
  let data: unknown;
  try {
    data = JSON.parse(fromBase64Url(s));
  } catch {
    return null;
  }
  if (!Array.isArray(data) || data[0] !== VERSION || typeof data[1] !== 'string') return null;
  const [, weaponType, weapon, armor, charm, mantles, mantleActive, custom, conditions] = data as unknown[];
  const b = emptyBuild(weaponType as string);
  b.weapon = readPiece(weapon);
  if (Array.isArray(armor)) ARMOR_SLOTS.forEach((slot, i) => (b.armor[slot] = readPiece(armor[i])));
  b.charm = idOrNull(charm);
  if (Array.isArray(mantles)) b.mantles = [readPiece(mantles[0]), readPiece(mantles[1])];
  b.mantleActive = mantleActive === 1;
  if (Array.isArray(custom)) {
    const [aug, hr, parts, awakening] = custom as unknown[];
    b.custom = {
      augments: Array.isArray(aug) ? aug.filter(isId) : [],
      hr: Array.isArray(hr)
        ? hr.slice(0, 8).map((x) => (HR_AUGMENTS.includes(x as HrAugment) ? (x as HrAugment) : null))
        : [],
      parts: ids(parts),
      awakening: ids(awakening),
    };
  }
  b.conditions = Array.isArray(conditions)
    ? conditions.filter((c): c is string => typeof c === 'string')
    : [];
  return b;
}

/** 从地址里的 #b=… 读配装 */
export function buildFromHash(hash: string): Build | null {
  const m = /^#b=([A-Za-z0-9_-]+)$/.exec(hash);
  return m ? decodeBuild(m[1]!) : null;
}

export const shareUrl = (origin: string, b: Build) => `${origin}/world/builder/#b=${encodeBuild(b)}`;
