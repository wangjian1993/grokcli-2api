package postgres

import (
	"context"
	"encoding/json"
	"errors"
	"strings"
	"time"

	"github.com/jackc/pgx/v5"
)

func (c *Connector) PublicSettings(ctx context.Context) (map[string]any, error) {
	rows, err := c.Pool.Query(ctx, "SELECT key, value FROM app_settings")
	if err != nil {
		return nil, err
	}
	defer rows.Close()

	values := map[string]any{}
	for rows.Next() {
		var key string
		var data []byte
		if err := rows.Scan(&key, &data); err != nil {
			return nil, err
		}
		var decoded any
		if err := json.Unmarshal(data, &decoded); err != nil {
			continue
		}
		values[key] = decoded
	}
	if err := rows.Err(); err != nil {
		return nil, err
	}

	out := map[string]any{
		"account_mode":                  stringSetting(values, "account_mode", "round_robin"),
		"account_modes":                 []string{"round_robin", "random", "least_used"},
		"has_admin_password":            hasAdminPassword(values),
		"setup_needed":                  !hasAdminPassword(values),
		"admin_password_from_env":       false,
		"admin_password_in_store":       hasAdminPassword(values),
		"token_maintain_enabled":        boolSetting(values, "token_maintain_enabled", false),
		"model_health_enabled":          boolSetting(values, "model_health_enabled", false),
		"reasoning_compat":              stringSetting(values, "reasoning_compat", "off"),
		"reasoning_compat_options":      []string{"off", "think_tag", "content"},
		"outbound_max_tools":            intSetting(values, "outbound_max_tools", 0),
		"outbound_max_tools_openai":     intSetting(values, "outbound_max_tools_openai", 0),
		"outbound_tool_gap_sec":         floatSetting(values, "outbound_tool_gap_sec", 0),
		"history_compact_enabled":       boolSetting(values, "history_compact_enabled", false),
		"history_compact_auto_chars":    intSetting(values, "history_compact_auto_chars", 0),
		"history_keep_tool_rounds":      intSetting(values, "history_keep_tool_rounds", 8),
		"history_max_tool_result_chars": intSetting(values, "history_max_tool_result_chars", 0),
		"sse_keepalive":                 floatSetting(values, "sse_keepalive", 4),
		"conversation_affinity_enabled": boolSetting(values, "conversation_affinity_enabled", true),
		"conversation_affinity_ttl_sec": floatSetting(values, "conversation_affinity_ttl_sec", 7200),
		"token_maintain_interval_sec":   floatSetting(values, "token_maintain_interval_sec", 90),
		"token_refresh_skew_sec":        floatSetting(values, "token_refresh_skew_sec", 300),
		"model_health_interval_sec":     floatSetting(values, "model_health_interval_sec", 900),
		"model_health_auto_disable":     boolSetting(values, "model_health_auto_disable", true),
		"probe_models":                  valueOr(values, "probe_models", []string{}),
		"default_model":                 stringSetting(values, "default_model", ""),
		"registration_config":           mapSetting(values, "registration_config"),
		"outbound_proxy_config":         mapSetting(values, "outbound_proxy_config"),
		"outbound_proxy_pool":           map[string]any{"enabled": false, "count": 0, "strategy": "round_robin", "source": "none", "preview": []any{}},
		"sub2api_config":                mapSetting(values, "sub2api_config"),
		"cliproxyapi_config":            mapSetting(values, "cliproxyapi_config"),
		"updated_at":                    nil,
	}
	if policy := mapSetting(values, "pool_policy"); len(policy) > 0 {
		out["pool_policy"] = policy
		for key, value := range policy {
			out[key] = value
		}
	} else {
		out["pool_policy"] = map[string]any{}
	}
	return out, nil
}

func hasAdminPassword(values map[string]any) bool {
	admin := mapSetting(values, "admin_password")
	if admin["admin_password_hash"] != nil && admin["admin_password_salt"] != nil {
		return true
	}
	return false
}

func valueOr(values map[string]any, key string, fallback any) any {
	if value, ok := values[key]; ok && value != nil {
		return value
	}
	return fallback
}

func mapSetting(values map[string]any, key string) map[string]any {
	value, ok := values[key].(map[string]any)
	if !ok || value == nil {
		return map[string]any{}
	}
	return value
}

func stringSetting(values map[string]any, key, fallback string) string {
	value, ok := values[key].(string)
	if !ok || value == "" {
		return fallback
	}
	return value
}

func boolSetting(values map[string]any, key string, fallback bool) bool {
	value, ok := values[key].(bool)
	if !ok {
		return fallback
	}
	return value
}

func intSetting(values map[string]any, key string, fallback int64) int64 {
	switch value := values[key].(type) {
	case float64:
		return int64(value)
	case int64:
		return value
	case int:
		return int64(value)
	default:
		return fallback
	}
}

func floatSetting(values map[string]any, key string, fallback float64) float64 {
	switch value := values[key].(type) {
	case float64:
		return value
	case int64:
		return float64(value)
	case int:
		return float64(value)
	default:
		return fallback
	}
}

type AdminPassword struct {
	Hash string
	Salt string
}

func (c *Connector) LoadAdminPassword(ctx context.Context) (AdminPassword, error) {
	if c == nil || c.Pool == nil {
		return AdminPassword{}, errors.New("postgres unavailable")
	}
	var data []byte
	err := c.Pool.QueryRow(ctx, "SELECT value FROM app_settings WHERE key = 'admin_password'").Scan(&data)
	if err != nil {
		return AdminPassword{}, err
	}
	var raw map[string]any
	if err := json.Unmarshal(data, &raw); err != nil {
		return AdminPassword{}, err
	}
	hash, _ := raw["admin_password_hash"].(string)
	salt, _ := raw["admin_password_salt"].(string)
	return AdminPassword{Hash: strings.TrimSpace(hash), Salt: strings.TrimSpace(salt)}, nil
}

func (c *Connector) HasAdminPassword(ctx context.Context) (bool, error) {
	pw, err := c.LoadAdminPassword(ctx)
	if err != nil {
		// missing row means setup needed
		if errors.Is(err, pgx.ErrNoRows) {
			return false, nil
		}
		return false, err
	}
	return pw.Hash != "" && pw.Salt != "", nil
}

func (c *Connector) SetAdminPassword(ctx context.Context, hash, salt string) error {
	hash = strings.TrimSpace(hash)
	salt = strings.TrimSpace(salt)
	if hash == "" || salt == "" {
		return errors.New("password hash/salt required")
	}
	payload := map[string]any{
		"admin_password_hash":       hash,
		"admin_password_salt":       salt,
		"admin_password_updated_at": float64(time.Now().Unix()),
		"admin_password_source":     "store",
	}
	encoded, err := json.Marshal(payload)
	if err != nil {
		return err
	}
	_, err = c.Pool.Exec(ctx, `
		INSERT INTO app_settings (key, value, updated_at)
		VALUES ('admin_password', $1::jsonb, now())
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
	`, encoded)
	return err
}

func (c *Connector) SetSetting(ctx context.Context, key string, value any) error {
	key = strings.TrimSpace(key)
	if key == "" {
		return errors.New("setting key required")
	}
	encoded, err := json.Marshal(value)
	if err != nil {
		return err
	}
	_, err = c.Pool.Exec(ctx, `
		INSERT INTO app_settings (key, value, updated_at)
		VALUES ($1, $2::jsonb, now())
		ON CONFLICT (key) DO UPDATE SET value = EXCLUDED.value, updated_at = now()
	`, key, encoded)
	return err
}
