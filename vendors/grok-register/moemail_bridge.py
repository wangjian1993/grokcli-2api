"""MoeMail bridge for vendored grok-register (509992828/grok-register).

Provides the same interface as email_register.get_email_and_token / get_oai_code,
but uses grokcli-2api's MoeMail implementation.
"""
from __future__ import annotations

import re
import sys
import time
from pathlib import Path
from typing import Any, Optional, Tuple

# Ensure project root is importable when this package is executed in isolation.
_ROOT = Path(__file__).resolve().parents[2]
if str(_ROOT) not in sys.path:
    sys.path.insert(0, str(_ROOT))

from config import (  # noqa: E402
    MOEMAIL_API_KEY,
    MOEMAIL_BASE_URL,
    MOEMAIL_DOMAIN,
    MOEMAIL_EXPIRY_MS,
)
from email_registration import (  # noqa: E402
    _extract_codes_and_links,
    _moemail_create_mailbox,
    _moemail_fetch_messages,
)


_RUNTIME: dict[str, Any] = {
    "api_key": None,
    "base_url": None,
    "domain": None,
    "prefix": None,
    "proxy": None,
}


def configure(
    *,
    api_key: str | None = None,
    base_url: str | None = None,
    domain: str | None = None,
    prefix: str | None = None,
    proxy: str | None = None,
) -> None:
    _RUNTIME["api_key"] = (api_key or "").strip() or None
    _RUNTIME["base_url"] = (base_url or "").strip() or None
    _RUNTIME["domain"] = (domain or "").strip() or None
    _RUNTIME["prefix"] = (prefix or "").strip() or None
    _RUNTIME["proxy"] = (proxy or "").strip() or None


def get_email_and_token() -> Tuple[Optional[str], Optional[str]]:
    """Create a MoeMail mailbox and return (email, mail_token=email_id)."""
    api_key = _RUNTIME.get("api_key") or MOEMAIL_API_KEY
    base_url = _RUNTIME.get("base_url") or MOEMAIL_BASE_URL
    domain = _RUNTIME.get("domain") or MOEMAIL_DOMAIN
    prefix = _RUNTIME.get("prefix")
    if not api_key:
        raise RuntimeError(
            "MoeMail API key missing. Set GROK2API_MOEMAIL_API_KEY or pass api_key."
        )
    mailbox = _moemail_create_mailbox(
        name=prefix,
        domain=domain,
        expiry_ms=MOEMAIL_EXPIRY_MS,
        api_key=api_key,
        base_url=base_url,
    )
    email = str(mailbox.get("email") or "")
    email_id = str(mailbox.get("id") or "")
    if not email or not email_id:
        raise RuntimeError(f"Unexpected MoeMail create response: {mailbox}")
    print(f"[*] MoeMail 临时邮箱创建成功: {email}")
    return email, email_id


def get_oai_code(dev_token: str, email: str, timeout: int = 120) -> Optional[str]:
    """Poll MoeMail inbox for xAI verification code.

    ``dev_token`` is the MoeMail email id returned by get_email_and_token().
    """
    api_key = _RUNTIME.get("api_key") or MOEMAIL_API_KEY
    base_url = _RUNTIME.get("base_url") or MOEMAIL_BASE_URL
    if not dev_token:
        return None
    deadline = time.time() + max(30, int(timeout or 120))
    while time.time() < deadline:
        try:
            messages = _moemail_fetch_messages(
                str(dev_token),
                api_key=api_key,
                base_url=base_url,
                include_details=True,
            )
        except Exception as e:  # noqa: BLE001
            print(f"[Warn] MoeMail 拉信失败: {e}")
            time.sleep(3)
            continue
        for item in messages:
            code = _pick_code(item)
            if code:
                print(f"[*] 从 MoeMail 提取到验证码: {code}")
                return code.replace("-", "")
        time.sleep(3)
    return None


def _pick_code(item: dict[str, Any]) -> Optional[str]:
    extracted = item.get("extracted") if isinstance(item, dict) else None
    if isinstance(extracted, dict):
        codes = extracted.get("codes") or []
        for c in codes:
            clean = str(c).replace("-", "").strip().upper()
            if len(clean) == 6 and re.fullmatch(r"[A-Z0-9]{6}", clean):
                return clean
    text = "\n".join(
        str(item.get(k) or "")
        for k in ("subject", "content", "html", "text", "from_address", "from")
    )
    # Prefer AAA-BBB then 6 alnum/digit
    m = re.search(r"\b([A-Z0-9]{3})-([A-Z0-9]{3})\b", text, flags=re.I)
    if m:
        return (m.group(1) + m.group(2)).upper()
    codes = (_extract_codes_and_links(text).get("codes") or []) if text else []
    for c in codes:
        clean = str(c).replace("-", "").strip().upper()
        if len(clean) == 6:
            return clean
    m = re.search(r"(?<![A-Z0-9])([A-Z0-9]{6})(?![A-Z0-9])", text, flags=re.I)
    if m:
        return m.group(1).upper()
    return None
