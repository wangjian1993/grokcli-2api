"""Unit checks for prefix-stable history compact + tools sort + cache debug fields."""

from __future__ import annotations

from copy import deepcopy

import history_compact as hc


def test_placeholder_deterministic() -> None:
    a = hc._placeholder("hello world" * 50, reason="older round")
    b = hc._placeholder("hello world" * 50, reason="older round")
    assert a == b
    assert "id=" in a
    assert a.startswith("[compacted tool result")


def test_compact_prefix_stable_across_calls() -> None:
    msgs = [
        {"role": "system", "content": "SYS"},
        {"role": "user", "content": "u1"},
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": "c1",
                    "type": "function",
                    "function": {"name": "Read", "arguments": "{}"},
                }
            ],
        },
        {"role": "tool", "tool_call_id": "c1", "content": "X" * 5000},
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": "c2",
                    "type": "function",
                    "function": {"name": "Read", "arguments": "{}"},
                }
            ],
        },
        {"role": "tool", "tool_call_id": "c2", "content": "Y" * 100},
        {"role": "user", "content": "continue"},
    ]
    out1, st1 = hc.compact_openai_messages(
        deepcopy(msgs),
        enabled=True,
        keep_tool_rounds=1,
        max_tool_result_chars=2000,
        max_messages_chars=50_000,
        prefix_stable=True,
    )
    out2, _st2 = hc.compact_openai_messages(
        deepcopy(msgs),
        enabled=True,
        keep_tool_rounds=1,
        max_tool_result_chars=2000,
        max_messages_chars=50_000,
        prefix_stable=True,
    )
    assert st1["prefix_stable"] is True
    assert out1[3]["content"] == out2[3]["content"]
    assert out1[3]["content"].startswith("[compacted tool result")

    # Growing the conversation must not re-mutate already-compacted older tools.
    msgs2 = deepcopy(out1)
    msgs2.append(
        {
            "role": "assistant",
            "content": None,
            "tool_calls": [
                {
                    "id": "c3",
                    "type": "function",
                    "function": {"name": "Read", "arguments": "{}"},
                }
            ],
        }
    )
    msgs2.append({"role": "tool", "tool_call_id": "c3", "content": "Z" * 80})
    msgs2.append({"role": "user", "content": "again"})
    old = msgs2[3]["content"]
    out3, _st3 = hc.compact_openai_messages(
        msgs2,
        enabled=True,
        keep_tool_rounds=1,
        max_tool_result_chars=2000,
        max_messages_chars=50_000,
        prefix_stable=True,
    )
    assert out3[3]["content"] == old


def test_tools_sorted_by_name() -> None:
    import app as appmod

    tools = [
        {
            "type": "function",
            "function": {"name": "Write", "parameters": {"type": "object"}},
        },
        {
            "type": "function",
            "function": {"name": "Bash", "parameters": {"type": "object"}},
        },
        {
            "type": "function",
            "function": {"name": "Read", "parameters": {"type": "object"}},
        },
    ]
    norm = appmod._normalize_tools(tools)
    assert norm is not None
    names = [t["function"]["name"] for t in norm]
    assert names == sorted(names, key=str.lower)


def test_cache_debug_fields() -> None:
    import app as appmod

    res = {
        "usage": {
            "prompt_tokens": 1000,
            "completion_tokens": 10,
            "prompt_tokens_details": {"cached_tokens": 800},
        }
    }
    appmod._attach_cache_debug_fields(res, res["usage"], prefer_account=True)
    assert res["x_grok2api_cache_read_tokens"] == 800
    assert res["x_grok2api_cache_hit_ratio"] == 0.8
    assert res["x_grok2api_affinity"] is True


def test_stabilize_creates_identical_prefix() -> None:
    """Formatting churn must not change the outbound prompt prefix."""
    import json

    import app as appmod

    body_a = {
        "model": "grok-4.5",
        "messages": [
            {"role": "system", "content": [{"type": "text", "text": "You are helpful.\n\n"}]},
            {
                "role": "assistant",
                "content": None,
                "tool_calls": [
                    {
                        "id": "call_1",
                        "type": "function",
                        "index": 0,
                        "function": {
                            "name": "Read",
                            "arguments": '{\n  "path": "a.py",\n  "limit": 10\n}',
                        },
                    }
                ],
            },
            {"role": "tool", "tool_call_id": "call_1", "content": "ok"},
            {"role": "user", "content": "next"},
        ],
        "tools": [
            {
                "type": "function",
                "function": {
                    "name": "Write",
                    "description": "",
                    "parameters": {"properties": {"x": {"type": "string"}}, "type": "object"},
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "Read",
                    "parameters": {"type": "object", "properties": {"path": {"type": "string"}}},
                },
            },
        ],
        "metadata": {"session_id": "s1"},
    }
    body_b = {
        "model": "grok-4.5",
        "messages": [
            {"role": "system", "content": "You are helpful.\n"},
            {
                "role": "assistant",
                "tool_calls": [
                    {
                        "id": "call_1",
                        "type": "function",
                        "function": {
                            "name": "Read",
                            "arguments": '{"limit":10,"path":"a.py"}',
                        },
                    }
                ],
                "content": None,
            },
            {"role": "tool", "tool_call_id": "call_1", "content": "ok"},
            {"role": "user", "content": "next"},
        ],
        "tools": [
            {
                "type": "function",
                "function": {
                    "name": "Read",
                    "parameters": {"properties": {"path": {"type": "string"}}, "type": "object"},
                },
            },
            {
                "type": "function",
                "function": {
                    "name": "Write",
                    "parameters": {"type": "object", "properties": {"x": {"type": "string"}}},
                },
            },
        ],
    }

    sa = appmod._stabilize_upstream_prompt_body(body_a)
    sb = appmod._stabilize_upstream_prompt_body(body_b)
    assert sa.get("tools_stabilized") == 2
    assert sb.get("tools_stabilized") == 2
    assert "metadata" not in body_a
    assert body_a["messages"][0]["content"] == body_b["messages"][0]["content"]
    assert body_a["tools"][0]["function"]["name"] == "Read"
    assert body_b["tools"][0]["function"]["name"] == "Read"
    # Same tool schema after key-sort + name-sort.
    assert json.dumps(body_a["tools"], sort_keys=True) == json.dumps(
        body_b["tools"], sort_keys=True
    )
    # Same tool_call arguments after canonicalization.
    assert (
        body_a["messages"][1]["tool_calls"][0]["function"]["arguments"]
        == body_b["messages"][1]["tool_calls"][0]["function"]["arguments"]
    )
    assert "limit" in body_a["messages"][1]["tool_calls"][0]["function"]["arguments"]


def test_conversation_root_ignores_volatile_system() -> None:
    import conversation_affinity as ca

    msgs_a = [
        {
            "role": "system",
            "content": "You are helpful.\nToday's date: 2026-07-14\ncwd: /tmp/a\nGit branch: main",
        },
        {"role": "user", "content": "hello world task"},
    ]
    msgs_b = [
        {
            "role": "system",
            "content": "You are helpful.\nToday's date: 2026-07-15\ncwd: /tmp/b\nGit branch: feature",
        },
        {"role": "user", "content": "hello world task"},
    ]
    root_a = ca._conversation_root(msgs_a)
    root_b = ca._conversation_root(msgs_b)
    assert root_a == root_b
    assert root_a.startswith("user:hello world task")


def test_responses_previous_id_links_session_fp() -> None:
    """previous_response_id must recover the multi-turn session_fp, not a new root."""
    import conversation_affinity as ca

    # Force in-process file map so the unit test is hermetic.
    ca._redis_mode = lambda: False  # type: ignore[method-assign]
    ca._enabled = lambda: True  # type: ignore[method-assign]
    ca._map.clear()
    ca._loaded = True

    key_id = "test-key"
    msgs_t1 = [
        {"role": "system", "content": "You are helpful.\nToday's date: 2026-07-14"},
        {"role": "user", "content": "start a long coding session"},
    ]
    fp1, prefer1, src1 = ca.resolve_responses_affinity(
        msgs_t1, api_key_id=key_id
    )
    assert fp1 and prefer1 is None
    assert src1 in ("root_new", "root")

    # Simulate successful turn 1: bind session + emitted response id.
    account = "https://auth.x.ai::acct-sticky-1"
    ca.bind_affinity(fp1, account, session_fp=fp1)
    ca.bind_response_chain(
        "resp_turn1_abc", account, api_key_id=key_id, session_fp=fp1
    )

    # Turn 2: system text churns; client sends previous_response_id only.
    msgs_t2 = [
        {
            "role": "system",
            "content": "You are helpful.\nToday's date: 2026-07-14\ncwd: /changed",
        },
        {"role": "user", "content": "start a long coding session"},
        {"role": "assistant", "content": "ok"},
        {"role": "user", "content": "continue with tools"},
    ]
    fp2, prefer2, src2 = ca.resolve_responses_affinity(
        msgs_t2,
        api_key_id=key_id,
        previous_response_id="resp_turn1_abc",
    )
    assert prefer2 == account
    assert src2 == "previous_response_id"
    # Critical: session_fp must equal turn-1 identity, not a fresh root hash.
    assert fp2 == fp1

    # Bind turn-2 response id under the same session_fp and resolve turn 3.
    ca.bind_response_chain(
        "resp_turn2_def", account, api_key_id=key_id, session_fp=fp2
    )
    fp3, prefer3, src3 = ca.resolve_responses_affinity(
        msgs_t2 + [{"role": "user", "content": "again"}],
        api_key_id=key_id,
        previous_response_id="resp_turn2_def",
    )
    assert prefer3 == account
    assert fp3 == fp1
    assert src3 == "previous_response_id"


def test_responses_prompt_cache_key_preferred() -> None:
    import conversation_affinity as ca

    ca._redis_mode = lambda: False  # type: ignore[method-assign]
    ca._enabled = lambda: True  # type: ignore[method-assign]
    ca._map.clear()
    ca._loaded = True

    msgs = [{"role": "user", "content": "x"}]
    fp, prefer, src = ca.resolve_responses_affinity(
        msgs,
        api_key_id="k",
        prompt_cache_key="stable-session-xyz",
        previous_response_id="resp_ignored",
    )
    assert prefer is None
    assert src == "prompt_cache_key_new"
    assert fp and "fp:" in fp
    ca.bind_affinity(fp, "acct-a", session_fp=fp)
    fp2, prefer2, src2 = ca.resolve_responses_affinity(
        msgs,
        api_key_id="k",
        prompt_cache_key="stable-session-xyz",
    )
    assert prefer2 == "acct-a"
    assert fp2 == fp
    assert src2 == "prompt_cache_key"


if __name__ == "__main__":
    test_placeholder_deterministic()
    test_compact_prefix_stable_across_calls()
    test_tools_sorted_by_name()
    test_cache_debug_fields()
    test_stabilize_creates_identical_prefix()
    test_conversation_root_ignores_volatile_system()
    test_responses_previous_id_links_session_fp()
    test_responses_prompt_cache_key_preferred()
    print("ALL PASS")
