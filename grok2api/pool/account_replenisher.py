"""Background auto-replenish: keep account pool above a minimum size.

When rotatable (可轮询) account count drops below ``auto_replenish_min_accounts``, start a
protocol registration batch of ``auto_replenish_count`` using the saved
registration config (mail / captcha / proxy). Only the maintainer leader runs
the loop; concurrent registration sessions skip a cycle.
"""

from __future__ import annotations

import os
import threading
import time
from typing import Any

_stop = threading.Event()
_thread: threading.Thread | None = None
_wakeup = threading.Event()
_last_run: dict[str, Any] = {}
_last_trigger_at = 0.0
_lock = threading.Lock()

# Avoid re-triggering while a just-started batch is still spinning up.
_MIN_TRIGGER_COOLDOWN_SEC = 90.0


def _interval() -> float:
    try:
        from grok2api.admin.settings_store import get_auto_replenish_interval_sec

        return max(30.0, float(get_auto_replenish_interval_sec()))
    except Exception:
        pass
    try:
        return max(30.0, float(os.getenv("GROK2API_AUTO_REPLENISH_INTERVAL", "120")))
    except ValueError:
        return 120.0


def _startup_delay() -> float:
    try:
        return max(10.0, float(os.getenv("GROK2API_AUTO_REPLENISH_STARTUP_DELAY", "60")))
    except ValueError:
        return 60.0


def is_enabled() -> bool:
    try:
        from grok2api.admin.settings_store import get_auto_replenish_enabled

        return bool(get_auto_replenish_enabled())
    except Exception:
        return os.getenv("GROK2API_AUTO_REPLENISH", "0").lower() not in (
            "0",
            "false",
            "no",
            "off",
            "",
        )


def _min_accounts() -> int:
    try:
        from grok2api.admin.settings_store import get_auto_replenish_min_accounts

        return int(get_auto_replenish_min_accounts())
    except Exception:
        try:
            return max(0, int(os.getenv("GROK2API_AUTO_REPLENISH_MIN", "50")))
        except ValueError:
            return 50


def _replenish_count() -> int:
    try:
        from grok2api.admin.settings_store import get_auto_replenish_count

        return int(get_auto_replenish_count())
    except Exception:
        try:
            return max(1, int(os.getenv("GROK2API_AUTO_REPLENISH_COUNT", "5")))
        except ValueError:
            return 5


def _account_count() -> dict[str, int]:
    """Return pool sizes for auto-replenish threshold checks.

    Threshold uses **rotatable** (可轮询) accounts — enabled/normal, not
    quota-disabled / cooldown / expired / hard-disabled. Falls back to
    credentials ``active_count`` only if pool summary is unavailable.
    """
    out: dict[str, int] = {
        "account_count": 0,
        "active_count": 0,
        "rotatable_count": 0,
        "live_count": 0,
    }
    try:
        from grok2api.pool import account_pool

        ps = account_pool.pool_summary(include_accounts=False) or {}
        total = int(ps.get("total") or 0)
        live = int(
            ps.get("rotatable")
            if ps.get("rotatable") is not None
            else (ps.get("live") if ps.get("live") is not None else ps.get("enabled") or 0)
        )
        out.update(
            {
                "account_count": total,
                "active_count": live,  # keep legacy key = rotatable for threshold
                "rotatable_count": live,
                "live_count": live,
                "quota_disabled": int(ps.get("quota_disabled") or 0),
                "in_cooldown": int(ps.get("in_cooldown") or 0),
                "expired": int(ps.get("expired") or 0),
                "disabled": int(ps.get("disabled") or 0),
            }
        )
        return out
    except Exception as e:  # noqa: BLE001
        out["error"] = str(e)[:200]  # type: ignore[assignment]
    # Fallback: credential totals (token not expired) — less accurate.
    try:
        from grok2api.pool import accounts

        st = accounts.account_status(include_accounts=False)
        total = int(st.get("account_count") or 0)
        active = int(st.get("active_count") or 0)
        out.update(
            {
                "account_count": total,
                "active_count": active,
                "rotatable_count": active,
                "live_count": active,
            }
        )
    except Exception as e:  # noqa: BLE001
        out["error"] = str(e)[:200]  # type: ignore[assignment]
    return out


def _active_registration() -> dict[str, Any]:
    """Detect in-flight protocol registration sessions/batches."""
    try:
        from grok2api.upstream.grok_build_adapter import list_registration_sessions

        data = list_registration_sessions() or {}
        active = int(data.get("active") or 0)
        running_batches = 0
        for b in data.get("batches") or []:
            st = str(b.get("status") or b.get("batch_status") or "").lower()
            if st in {"running", "starting", "stopping"}:
                running_batches += 1
            elif int(b.get("running") or 0) > 0:
                running_batches += 1
        return {
            "active_sessions": active,
            "running_batches": running_batches,
            "busy": active > 0 or running_batches > 0,
        }
    except Exception as e:  # noqa: BLE001
        return {"active_sessions": 0, "running_batches": 0, "busy": False, "error": str(e)[:200]}


def _start_registration_batch(count: int) -> dict[str, Any]:
    """Start protocol registration using saved DB/env registration config."""
    from grok2api.admin.settings_store import resolve_registration_inputs
    from grok2api.upstream import grok_build_adapter as adapter

    avail = adapter.registration_available()
    if not avail.get("available"):
        return {
            "ok": False,
            "error": avail.get("error") or "registration engine unavailable",
        }

    resolved = resolve_registration_inputs({"count": int(count)})
    # Force the replenish batch size regardless of saved form count default.
    resolved["count"] = max(1, min(10_000, int(count)))

    try:
        result = adapter.start_registration(
            proxy=resolved.get("proxy") or None,
            proxy_username=resolved.get("proxy_username") or None,
            proxy_password=resolved.get("proxy_password") or None,
            proxy_strategy=resolved.get("proxy_strategy") or None,
            moemail_api_key=resolved.get("api_key") or None,
            moemail_base_url=resolved.get("base_url") or None,
            prefix=resolved.get("prefix") or None,
            domain=resolved.get("domain") or None,
            expiry_ms=resolved.get("expiry_ms"),
            mail_provider=resolved.get("mail_provider") or None,
            captcha_provider=resolved.get("captcha_provider") or None,
            local_solver_url=resolved.get("local_solver_url") or None,
            yescaptcha_key=resolved.get("yescaptcha_key") or None,
            count=resolved.get("count"),
            concurrency=resolved.get("concurrency"),
            stagger_ms=resolved.get("stagger_ms"),
            probe_delay_sec=resolved.get("probe_delay_sec"),
        )
    except TypeError:
        try:
            result = adapter.start_registration(
                proxy=resolved.get("proxy") or None,
                moemail_api_key=resolved.get("api_key") or None,
                moemail_base_url=resolved.get("base_url") or None,
                prefix=resolved.get("prefix") or None,
                domain=resolved.get("domain") or None,
                captcha_provider=resolved.get("captcha_provider") or None,
                local_solver_url=resolved.get("local_solver_url") or None,
                yescaptcha_key=resolved.get("yescaptcha_key") or None,
                count=resolved.get("count"),
            )
        except Exception as e:  # noqa: BLE001
            return {"ok": False, "error": str(e)}
    except Exception as e:  # noqa: BLE001
        return {"ok": False, "error": str(e)}

    if not isinstance(result, dict):
        return {"ok": False, "error": "start_registration returned non-dict"}
    return result


def run_once(*, source: str = "loop") -> dict[str, Any]:
    """One check cycle. Safe to call from admin/API for manual trigger."""
    global _last_run, _last_trigger_at
    now = time.time()
    min_n = _min_accounts()
    want = _replenish_count()
    counts = _account_count()
    total = int(counts.get("account_count") or 0)
    # Threshold metric: 可轮询 (rotatable/live), not raw credential total.
    rotatable = int(
        counts.get("rotatable_count")
        if counts.get("rotatable_count") is not None
        else counts.get("live_count")
        if counts.get("live_count") is not None
        else counts.get("active_count")
        or 0
    )
    active = rotatable
    reg = _active_registration()

    out: dict[str, Any] = {
        "at": now,
        "source": source,
        "enabled": is_enabled(),
        "min_accounts": min_n,
        "replenish_count": want,
        "account_count": total,
        "active_count": active,
        "rotatable_count": rotatable,
        "live_count": rotatable,
        "quota_disabled": counts.get("quota_disabled"),
        "below_threshold": rotatable < min_n,
        "registration_busy": bool(reg.get("busy")),
        "active_sessions": reg.get("active_sessions"),
        "running_batches": reg.get("running_batches"),
        "triggered": False,
        "skipped": None,
        "result": None,
    }

    if not is_enabled():
        out["skipped"] = "disabled"
        with _lock:
            _last_run = dict(out)
        return out

    if rotatable >= min_n:
        out["skipped"] = "above_threshold"
        with _lock:
            _last_run = dict(out)
        return out

    if reg.get("busy"):
        out["skipped"] = "registration_busy"
        with _lock:
            _last_run = dict(out)
        return out

    if _last_trigger_at and (now - _last_trigger_at) < _MIN_TRIGGER_COOLDOWN_SEC:
        out["skipped"] = "cooldown"
        out["cooldown_remaining_sec"] = int(
            _MIN_TRIGGER_COOLDOWN_SEC - (now - _last_trigger_at)
        )
        with _lock:
            _last_run = dict(out)
        return out

    result = _start_registration_batch(want)
    out["result"] = {
        "ok": bool(result.get("ok")),
        "error": result.get("error"),
        "batch_id": result.get("batch_id") or result.get("id"),
        "session_id": result.get("session_id") or result.get("id"),
        "count": want,
        "message": result.get("message") or result.get("status"),
    }
    out["triggered"] = bool(result.get("ok"))
    if result.get("ok"):
        _last_trigger_at = now
        try:
            from grok2api.admin import task_log

            task_log.record(
                "auto_replenish",
                summary=(
                    f"可轮询 {rotatable} < {min_n}（总量 {total}），自动补号 {want} 个"
                ),
                status="running",
                task_id=str(
                    result.get("batch_id")
                    or result.get("session_id")
                    or result.get("id")
                    or ""
                )
                or None,
                detail={
                    "account_count": total,
                    "rotatable_count": rotatable,
                    "min_accounts": min_n,
                    "replenish_count": want,
                    "batch_id": result.get("batch_id"),
                    "session_id": result.get("session_id") or result.get("id"),
                    "source": source,
                },
                ok=True,
                progress_done=0,
                progress_total=want,
                finished=False,
            )
        except Exception:
            pass
    else:
        out["skipped"] = "start_failed"
        try:
            from grok2api.admin import task_log

            task_log.record(
                "auto_replenish",
                summary=f"自动补号失败: {result.get('error') or 'unknown'}",
                status="error",
                detail={
                    "account_count": total,
                    "min_accounts": min_n,
                    "error": result.get("error"),
                    "source": source,
                },
                ok=False,
                finished=True,
            )
        except Exception:
            pass

    with _lock:
        _last_run = dict(out)
    try:
        from grok2api.store.redis_client import key, redis_enabled, set_ex
        import json

        if redis_enabled():
            set_ex(key("status", "auto_replenish_last"), json.dumps(out, default=str), 3600)
    except Exception:
        pass
    return out


def request_run_soon() -> None:
    _wakeup.set()


def _worker() -> None:
    delay = _startup_delay()
    if delay > 0:
        # Interruptible startup delay
        if _stop.wait(delay):
            return
    while not _stop.is_set():
        try:
            if is_enabled():
                run_once(source="loop")
        except Exception as e:  # noqa: BLE001
            with _lock:
                _last_run = {
                    "at": time.time(),
                    "source": "loop",
                    "enabled": is_enabled(),
                    "error": str(e)[:300],
                    "triggered": False,
                    "skipped": "exception",
                }
        wait = _interval()
        # Wait for interval or admin wakeup; wake every few seconds to re-check stop.
        end = time.time() + wait
        while time.time() < end and not _stop.is_set():
            if _wakeup.is_set():
                _wakeup.clear()
                break
            _stop.wait(min(2.0, max(0.1, end - time.time())))


def start_background() -> None:
    global _thread
    if not is_enabled():
        return
    if _thread and _thread.is_alive():
        return
    _stop.clear()
    _thread = threading.Thread(
        target=_worker, name="g2a-account-replenisher", daemon=True
    )
    _thread.start()


def stop_background() -> None:
    global _thread
    _stop.set()
    _wakeup.set()
    th = _thread
    if th and th.is_alive():
        th.join(timeout=2.0)
    _thread = None


def status(*, light: bool = False) -> dict[str, Any]:
    local_running = bool(_thread and _thread.is_alive())
    cluster_running = local_running
    leader_id = None
    is_leader = False
    try:
        from grok2api.store.leader import is_leader as _is_leader, status as _leader_status

        is_leader = bool(_is_leader())
        ls = _leader_status()
        leader_id = ls.get("leader_id")
        if not local_running and is_enabled():
            try:
                from grok2api.store.redis_client import get_str, key, redis_enabled

                if redis_enabled():
                    lid = get_str(key("lock", "maintainer_leader"))
                    if lid:
                        leader_id = lid
                        cluster_running = True
            except Exception:
                pass
    except Exception:
        pass

    last = dict(_last_run) if _last_run else None
    if last is None:
        try:
            from grok2api.store.redis_client import get_str, key, redis_enabled
            import json

            if redis_enabled():
                raw = get_str(key("status", "auto_replenish_last"))
                if raw:
                    last = json.loads(raw)
        except Exception:
            last = None

    out: dict[str, Any] = {
        "enabled": is_enabled(),
        "running": local_running,
        "local_running": local_running,
        "cluster_running": cluster_running,
        "leader_running": bool(cluster_running and is_enabled()),
        "is_leader": is_leader,
        "leader_id": leader_id,
        "interval_sec": _interval(),
        "startup_delay_sec": _startup_delay(),
        "min_accounts": _min_accounts(),
        "replenish_count": _replenish_count(),
        "last": last,
    }
    if not light:
        try:
            counts = _account_count()
            out["account_count"] = counts.get("account_count")
            out["active_count"] = counts.get("active_count")
            out["rotatable_count"] = counts.get("rotatable_count")
            out["live_count"] = counts.get("live_count")
            out["quota_disabled"] = counts.get("quota_disabled")
        except Exception:
            pass
    return out
