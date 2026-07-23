package server

import (
	"net/http"
	"strings"
	"testing"
)

func TestUsageRequestIDUnique(t *testing.T) {
	a := usageRequestID()
	b := usageRequestID()
	if a == "" || b == "" {
		t.Fatalf("empty usage id: %q %q", a, b)
	}
	if !strings.HasPrefix(a, "go-") || !strings.HasPrefix(b, "go-") {
		t.Fatalf("expected go- prefix, got %q %q", a, b)
	}
	if a == b {
		t.Fatalf("usageRequestID must be unique per call, got same %q", a)
	}
}

func TestRequestIDIgnoresClientHeader(t *testing.T) {
	req, err := http.NewRequest(http.MethodPost, "/v1/chat/completions", nil)
	if err != nil {
		t.Fatal(err)
	}
	// Codex-style reused UUID — must NOT become the durable usage key.
	req.Header.Set("X-Request-ID", "019f87af-95c8-78d1-9940-5efe5b73c8b4")
	req.Header.Set("X-Correlation-ID", "should-not-be-used")
	id1 := requestID(req)
	id2 := requestID(req)
	if id1 == "019f87af-95c8-78d1-9940-5efe5b73c8b4" {
		t.Fatalf("requestID must not use client X-Request-ID, got %q", id1)
	}
	if !strings.HasPrefix(id1, "go-") {
		t.Fatalf("expected server go- id, got %q", id1)
	}
	if id1 == id2 {
		t.Fatalf("each requestID call must be unique (idempotency per attempt), got %q twice", id1)
	}
	if clientRequestID(req) != "019f87af-95c8-78d1-9940-5efe5b73c8b4" {
		t.Fatalf("clientRequestID should preserve client header, got %q", clientRequestID(req))
	}
}

func TestAttachClientRequestID(t *testing.T) {
	req, _ := http.NewRequest(http.MethodPost, "/", nil)
	req.Header.Set("X-Client-Request-ID", "client-abc")
	detail := attachClientRequestID(nil, req)
	if detail["client_request_id"] != "client-abc" {
		t.Fatalf("detail=%v", detail)
	}
	// Prefer X-Request-ID when present.
	req.Header.Set("X-Request-ID", "primary")
	detail = attachClientRequestID(map[string]any{"route": "go_chat"}, req)
	if detail["client_request_id"] != "primary" {
		t.Fatalf("want primary, got %v", detail["client_request_id"])
	}
	if detail["route"] != "go_chat" {
		t.Fatalf("should keep existing keys: %v", detail)
	}
}

func TestClientRequestIDEmpty(t *testing.T) {
	if clientRequestID(nil) != "" {
		t.Fatal("nil request")
	}
	req, _ := http.NewRequest(http.MethodGet, "/", nil)
	if clientRequestID(req) != "" {
		t.Fatal("empty headers should yield empty id")
	}
}
