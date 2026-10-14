from pathlib import Path

from mhdb.config import load_config


def test_load_config_reads_paths(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.delenv("MHDB_GAME_DIR", raising=False)
    monkeypatch.delenv("MHDB_OODLE_DLL", raising=False)
    toml = tmp_path / "local.toml"
    toml.write_text("[game]\ndir = 'C:/Game'\n[oodle]\ndll = 'C:/oo2core.dll'\n", encoding="utf-8")
    cfg = load_config(toml)
    assert cfg.game_dir == Path("C:/Game")
    assert cfg.oodle_dll == Path("C:/oo2core.dll")


def test_env_overrides_file(tmp_path: Path, monkeypatch) -> None:
    toml = tmp_path / "local.toml"
    toml.write_text("[game]\ndir = 'C:/Game'\n", encoding="utf-8")
    monkeypatch.setenv("MHDB_GAME_DIR", "D:/Other")
    monkeypatch.delenv("MHDB_OODLE_DLL", raising=False)
    cfg = load_config(toml)
    assert cfg.game_dir == Path("D:/Other")
    assert cfg.oodle_dll is None


def test_missing_file_gives_empty_config(tmp_path: Path, monkeypatch) -> None:
    monkeypatch.delenv("MHDB_GAME_DIR", raising=False)
    monkeypatch.delenv("MHDB_OODLE_DLL", raising=False)
    cfg = load_config(tmp_path / "nope.toml")
    assert cfg.game_dir is None and cfg.oodle_dll is None
