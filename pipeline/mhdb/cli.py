"""mhdb 命令行入口。

mhdb config     显示当前配置
mhdb extract    解包 chunk → data-raw/world/
mhdb parse      解析 → data/world/*.json
mhdb images     贴图 → site/public/assets/game/
mhdb maps       大地图纸片配准 → data/world/maps.json + site/public/assets/game/world/maps/
mhdb diff       新旧数据差异报告
mhdb fonts      标题字体子集化 → site/public/fonts/
"""

import argparse
import sys

from mhdb.config import DATA_RAW, LOCAL_TOML, MANIFEST, load_config


def cmd_config(_args: argparse.Namespace) -> int:
    cfg = load_config()
    print(f"配置文件：{LOCAL_TOML}{'' if LOCAL_TOML.is_file() else '（不存在）'}")
    for name, path in (
        ("游戏目录", cfg.game_dir),
        ("Oodle 库", cfg.oodle_dll),
        ("chunk 密钥表", cfg.chunk_key),
    ):
        state = "未设置" if path is None else ("存在" if path.exists() else "不存在")
        print(f"{name}：{path or '-'}（{state}）")
    return 0


def cmd_extract(args: argparse.Namespace) -> int:
    from mhdb.chunk.extract import extract, load_manifest
    from mhdb.chunk.reader import KeyPattern, Oodle

    cfg = load_config()
    missing = [
        n
        for n, p in (("游戏目录", cfg.game_dir), ("Oodle 库", cfg.oodle_dll), ("chunk 密钥表", cfg.chunk_key))
        if not p
    ]
    if missing:
        print(f"pipeline/local.toml 缺少：{'、'.join(missing)}", file=sys.stderr)
        return 1
    assert cfg.game_dir and cfg.oodle_dll and cfg.chunk_key
    patterns = [args.pattern] if args.pattern else load_manifest(MANIFEST)
    meta = extract(
        cfg.game_dir,
        DATA_RAW / "world",
        patterns,
        Oodle(cfg.oodle_dll),
        KeyPattern.load(cfg.chunk_key),
        log=lambda m: print(m, flush=True),
        rebuild_index=args.rebuild_index,
    )
    print(
        f"完成：{meta['fileCount']} 个文件，{meta['bytes'] / 1048576:.1f} MiB；Steam 构建 {meta['steamBuildId']}"
    )
    return 0


def cmd_parse(_args: argparse.Namespace) -> int:
    from mhdb.build.world import build
    from mhdb.config import DATA

    raw = DATA_RAW / "world"
    if not (raw / "extract.json").is_file():
        print("data-raw/world 不存在，先运行 mhdb extract", file=sys.stderr)
        return 1
    build(raw, DATA / "world")
    return 0


def cmd_images(_args: argparse.Namespace) -> int:
    from mhdb.config import DATA, REPO
    from mhdb.images.world_icons import build

    raw = DATA_RAW / "world"
    if not (DATA / "world" / "colors.json").is_file():
        print("先运行 mhdb parse", file=sys.stderr)
        return 1
    build(raw, DATA / "world", REPO / "site/public/assets/game/world")
    return 0


def cmd_maps(args: argparse.Namespace) -> int:
    from mhdb.config import DATA, REPO
    from mhdb.images.world_maps import build

    raw = DATA_RAW / "world"
    if not (raw / "ui/hud/hud_radar.gui").is_file():
        print("缺少雷达布局文件，先运行 mhdb extract", file=sys.stderr)
        return 1
    build(raw, DATA / "world", REPO / "site/public/assets/game/world/maps", only=args.stage or None)
    return 0


def cmd_fonts(_args: argparse.Namespace) -> int:
    from mhdb.config import REPO
    from mhdb.fonts import collect_chars, default_roots, subset_font

    src = REPO / ".cache/fonts/smiley-sans/SmileySans-Oblique.ttf"
    out = REPO / "site/public/fonts/mhdb-display/MHDBDisplay-Oblique.woff2"
    if not src.is_file():
        print(f"缺少字体源文件：{src}", file=sys.stderr)
        print("从 https://github.com/atelier-anchor/smiley-sans/releases 下载 v2.0.1", file=sys.stderr)
        return 1
    count, size = subset_font(src, out, collect_chars(default_roots()))
    print(f"{out.relative_to(REPO)}：{count} 个字符，{size / 1024:.1f} KiB")
    return 0


def cmd_todo(args: argparse.Namespace) -> int:
    print(f"mhdb {args.command}：尚未实现", file=sys.stderr)
    return 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="mhdb", description="mhw-db 数据管线")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("config", help="显示当前配置").set_defaults(func=cmd_config)
    p_ext = sub.add_parser("extract", help="按 manifest.toml 解包 chunk 到 data-raw/world/")
    p_ext.add_argument("pattern", nargs="?", help="只解包匹配此正则的文件（默认用 manifest.toml）")
    p_ext.add_argument("--rebuild-index", action="store_true", help="强制重建 chunk 文件表")
    p_ext.set_defaults(func=cmd_extract)
    sub.add_parser("parse", help="解析为 data/world/*.json").set_defaults(func=cmd_parse)
    sub.add_parser("images", help="由 UI 贴图生成图标 → site/public/assets/game/").set_defaults(
        func=cmd_images
    )
    p_maps = sub.add_parser("maps", help="大地图纸片配准与导出")
    p_maps.add_argument("stage", nargs="*", type=int, help="只重做这些关卡（如 104），其余沿用已有结果")
    p_maps.set_defaults(func=cmd_maps)
    for name, desc in (("diff", "生成数据差异报告"),):
        sub.add_parser(name, help=desc).set_defaults(func=cmd_todo)
    sub.add_parser("fonts", help="标题字体子集化").set_defaults(func=cmd_fonts)
    return parser


def main(argv: list[str] | None = None) -> int:
    for stream in (sys.stdout, sys.stderr):
        stream.reconfigure(encoding="utf-8")  # type: ignore[union-attr]
    args = build_parser().parse_args(argv)
    return args.func(args)


if __name__ == "__main__":
    sys.exit(main())
