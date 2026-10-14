# mhw-db

怪物猎人系列攻略 / 资料网站（个人非官方项目）。先做《怪物猎人：世界 冰原》，以后加入《崛起》《荒野》。

- 规划与里程碑：[docs/PLAN.md](docs/PLAN.md)
- 数据来源与解析状态：[docs/DATA.md](docs/DATA.md)
- 设计系统：[docs/DESIGN.md](docs/DESIGN.md)
- 第三方依赖：[THIRD_PARTY.md](THIRD_PARTY.md)

## 本地开发

需要 Node.js 22.12+、pnpm 11、Python 3.12+ 与 [uv](https://docs.astral.sh/uv/)。

```bash
git config core.hooksPath .githooks   # 提交信息检查
pnpm install
pnpm dev                              # http://localhost:4321（视觉方向静态稿在 /design/）
pnpm verify                           # 格式、lint、类型检查、单测、构建
pnpm e2e                              # Playwright 截图与交互回归

cd pipeline
cp local.toml.example local.toml      # 填本机游戏目录与 Oodle 库路径
uv sync
uv run mhdb config                    # 检查配置
uv run pytest
uv run mhdb fonts                     # 标题字体子集化（需先下载得意黑到 .cache/fonts/）
```

游戏原始文件、解包结果（`data-raw/`）与转换出的游戏图片都不入库。

## 声明

本站为个人非官方项目，与 CAPCOM 无关。游戏名称、商标与素材版权归 CAPCOM CO., LTD. 所有。
