"""mhdb 命令行入口。

mhdb config     显示当前配置
mhdb extract    解包 chunk → data-raw/          （里程碑 2）
mhdb parse      解析 → data/world/*.json        （里程碑 2）
mhdb images     贴图 → site/public/assets/game/ （里程碑 2）
mhdb diff       新旧数据差异报告                （里程碑 2）
mhdb fonts      标题字体子集化 → site/public/fonts/
"""

import argparse
import sys

from mhdb.config import LOCAL_TOML, load_config


def cmd_config(_args: argparse.Namespace) -> int:
    cfg = load_config()
    print(f"配置文件：{LOCAL_TOML}{'' if LOCAL_TOML.is_file() else '（不存在）'}")
    for name, path in (("游戏目录", cfg.game_dir), ("Oodle 库", cfg.oodle_dll)):
        state = "未设置" if path is None else ("存在" if path.exists() else "不存在")
        print(f"{name}：{path or '-'}（{state}）")
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
    print(f"mhdb {args.command}：尚未实现（里程碑 2）", file=sys.stderr)
    return 1


def build_parser() -> argparse.ArgumentParser:
    parser = argparse.ArgumentParser(prog="mhdb", description="mhw-db 数据管线")
    sub = parser.add_subparsers(dest="command", required=True)
    sub.add_parser("config", help="显示当前配置").set_defaults(func=cmd_config)
    for name, desc in (
        ("extract", "解包 chunk 到 data-raw/"),
        ("parse", "解析为 data/world/*.json"),
        ("images", "转换贴图为 WebP/AVIF"),
        ("diff", "生成数据差异报告"),
    ):
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
