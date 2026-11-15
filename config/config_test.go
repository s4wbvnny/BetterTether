package config

import (
	"os"
	"path/filepath"
	"testing"

	"github.com/BurntSushi/toml"
)

func writeConfig(t *testing.T, body string) string {
	t.Helper()

	path := filepath.Join(t.TempDir(), "bettertether.toml")
	if err := os.WriteFile(path, []byte(body), 0o600); err != nil {
		t.Fatalf("writing test config: %v", err)
	}
	return path
}

// A config file is a set of overrides, not a full replacement. Before this
// behaviour was pinned, an omitted section decoded to its zero value: a config
// without [route] silently left SetDefaultRoute false, so tethering came up but
// never carried any traffic.
func TestLoadKeepsDefaultsForOmittedSections(t *testing.T) {
	cfg, err := Load(writeConfig(t, "[logging]\nlevel = \"debug\"\n"))
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}

	if cfg.Logging.Level != "debug" {
		t.Errorf("Logging.Level = %q, want the configured %q", cfg.Logging.Level, "debug")
	}
	if !cfg.API.Enabled {
		t.Error("API.Enabled = false for a config that omits [api]; want the default true")
	}
	if cfg.API.Port != 9400 {
		t.Errorf("API.Port = %d, want default 9400", cfg.API.Port)
	}
	if cfg.API.Host != "127.0.0.1" {
		t.Errorf("API.Host = %q, want default 127.0.0.1", cfg.API.Host)
	}
	if !cfg.Route.SetDefaultRoute {
		t.Error("Route.SetDefaultRoute = false for a config that omits [route]; want the default true")
	}
	if cfg.TUN.MTU != 1400 {
		t.Errorf("TUN.MTU = %d, want default 1400", cfg.TUN.MTU)
	}
	if cfg.USB.PollIntervalMS != 500 {
		t.Errorf("USB.PollIntervalMS = %d, want default 500", cfg.USB.PollIntervalMS)
	}
}

func TestLoadAppliesConfiguredValues(t *testing.T) {
	cfg, err := Load(writeConfig(t, "[api]\nenabled = false\nport = 1234\n\n[route]\nset_default_route = false\n"))
	if err != nil {
		t.Fatalf("Load returned error: %v", err)
	}

	if cfg.API.Enabled {
		t.Error("API.Enabled = true, want the configured false")
	}
	if cfg.API.Port != 1234 {
		t.Errorf("API.Port = %d, want the configured 1234", cfg.API.Port)
	}
	if cfg.API.Host != "127.0.0.1" {
		t.Errorf("API.Host = %q, want the default 127.0.0.1", cfg.API.Host)
	}
	if cfg.Route.SetDefaultRoute {
		t.Error("Route.SetDefaultRoute = true, want the configured false")
	}
}

func TestLoadRejectsMalformedFile(t *testing.T) {
	if _, err := Load(writeConfig(t, "this is not toml")); err == nil {
		t.Fatal("expected an error for a malformed config file")
	}
}

// Regression guard for config drift: the file we ship must only contain keys
// the schema actually reads. A typo like "interface_name_prefix" otherwise
// fails silently, because unknown keys are ignored.
func TestShippedDefaultConfigMatchesSchema(t *testing.T) {
	md, err := toml.DecodeFile("default.toml", &Config{})
	if err != nil {
		t.Fatalf("decoding shipped default.toml: %v", err)
	}
	if undecoded := md.Undecoded(); len(undecoded) > 0 {
		t.Errorf("default.toml contains keys the schema does not read: %v", undecoded)
	}
}

func TestDefaultConfigIsUsable(t *testing.T) {
	cfg := DefaultConfig()

	if !cfg.API.Enabled || cfg.API.Port == 0 {
		t.Errorf("default API config is not usable: %+v", cfg.API)
	}
	if !cfg.Route.SetDefaultRoute {
		t.Error("default config should set the default route")
	}
	if cfg.TUN.MTU <= 0 {
		t.Errorf("default MTU = %d, want a positive value", cfg.TUN.MTU)
	}
}
