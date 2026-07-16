"""Tests for retention enforcement.

Turns the "delete raw scan data fast, never store secrets, never commit
sensitive paths" promises into checked behavior.
"""

from datetime import datetime, timedelta, timezone

import pytest

from packages.privacy.retention_policy import (
    RetentionPolicy,
    repo_safe_path,
    should_delete_raw_artifact,
)

NOW = datetime(2026, 7, 16, 12, 0, 0, tzinfo=timezone.utc)


def test_raw_artifact_expires_after_ttl():
    old = (NOW - timedelta(hours=25)).isoformat()
    fresh = (NOW - timedelta(hours=1)).isoformat()
    assert should_delete_raw_artifact(old, now=NOW) is True
    assert should_delete_raw_artifact(fresh, now=NOW) is False


def test_repo_safe_path_blocks_sensitive_fragments():
    assert repo_safe_path("data/demo/demo_ledger.json") is True
    for bad in [
        "data/scan/raw_gmail_export.json",
        "playwright/.auth/storage-state.json",
        ".env",
        "cookies.json",
        "secret_notes.txt",
    ]:
        assert repo_safe_path(bad) is False, bad


def test_register_rejects_unknown_kind():
    policy = RetentionPolicy()
    with pytest.raises(ValueError):
        policy.register("data/x.json", "not_a_real_kind")


def test_sweep_flags_expired_raw_scan_but_keeps_fresh():
    policy = RetentionPolicy()
    policy.register("raw_old.json", "raw_scan", (NOW - timedelta(hours=48)).isoformat())
    policy.register("raw_new.json", "raw_scan", (NOW - timedelta(hours=1)).isoformat())

    due = policy.sweep(now=NOW)  # dry-run
    assert "raw_old.json" in due
    assert "raw_new.json" not in due


def test_raw_gmail_and_secret_kinds_are_never_retained():
    policy = RetentionPolicy()
    policy.register("inbox.json", "raw_gmail", NOW.isoformat())
    policy.register("creds.json", "secret", NOW.isoformat())

    due = policy.sweep(now=NOW)
    assert set(due) == {"inbox.json", "creds.json"}


def test_redacted_kinds_are_retained():
    policy = RetentionPolicy()
    policy.register("demo_ledger.json", "ledger", (NOW - timedelta(days=365)).isoformat())
    policy.register("proof.json", "proof", (NOW - timedelta(days=365)).isoformat())

    assert policy.sweep(now=NOW) == []


def test_sweep_apply_deletes_files_and_forgets_them(tmp_path):
    target = tmp_path / "raw_old.json"
    target.write_text("{}")
    policy = RetentionPolicy()
    policy.register(str(target), "raw_scan", (NOW - timedelta(hours=48)).isoformat())

    deleted = policy.sweep(now=NOW, apply=True)

    assert str(target) in deleted
    assert not target.exists()
    assert policy.manifest() == []  # swept artifacts are dropped from tracking


def test_dry_run_sweep_does_not_delete(tmp_path):
    target = tmp_path / "raw_old.json"
    target.write_text("{}")
    policy = RetentionPolicy()
    policy.register(str(target), "raw_scan", (NOW - timedelta(hours=48)).isoformat())

    policy.sweep(now=NOW, apply=False)

    assert target.exists()  # dry-run must not touch disk
    assert len(policy.manifest()) == 1


def test_purge_all_removes_every_artifact(tmp_path):
    a = tmp_path / "a.json"
    b = tmp_path / "b.json"
    a.write_text("{}")
    b.write_text("{}")
    policy = RetentionPolicy()
    policy.register(str(a), "ledger", NOW.isoformat())
    policy.register(str(b), "proof", NOW.isoformat())

    purged = policy.purge_all(apply=True)

    assert set(purged) == {str(a), str(b)}
    assert not a.exists() and not b.exists()
    assert policy.manifest() == []
