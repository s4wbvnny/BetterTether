package config

import (
	"fmt"
	"os"

	"github.com/BurntSushi/toml"
)

// Config represents the full configuration schema for BetterTether.
type Config struct {
	USB     USBConfig     `toml:"usb"`
	RNDIS   RNDISConfig   `toml:"rndis"`
	TUN     TUNConfig     `toml:"tun"`
	DHCP    DHCPConfig    `toml:"dhcp"`
	Route   RouteConfig   `toml:"route"`
	API     APIConfig     `toml:"api"`
	Logging LoggingConfig `toml:"logging"`
}

// APIConfig controls the local HTTP API server for the GUI.
type APIConfig struct {
	Enabled bool   `toml:"enabled"`
	Host    string `toml:"host"`
	Port    int    `toml:"port"`
}

type USBConfig struct {
	PollIntervalMS int `toml:"poll_interval_ms"`
	ClaimTimeoutMS int `toml:"claim_timeout_ms"`
}

type RNDISConfig struct {
	MaxTransferSize int `toml:"max_transfer_size"`
	InitTimeoutMS   int `toml:"init_timeout_ms"`
	QueryTimeoutMS  int `toml:"query_timeout_ms"`
	SetTimeoutMS    int `toml:"set_timeout_ms"`
	ReadBufferSize  int `toml:"read_buffer_size"`
}

type TUNConfig struct {
	InterfaceName string `toml:"interface_name"`
	MTU           int    `toml:"mtu"`
}

type DHCPConfig struct {
	TimeoutMS    int `toml:"timeout_ms"`
	RetryCount   int `toml:"retry_count"`
	RetryDelayMS int `toml:"retry_delay_ms"`
}

type RouteConfig struct {
	SetDefaultRoute bool `toml:"set_default_route"`
	RouteMetric     int  `toml:"route_metric"`
}

type LoggingConfig struct {
	Level  string `toml:"level"`
	Format string `toml:"format"`
}

// Default paths for BetterTether config files on macOS.
var DefaultConfigPaths = []string{
	"/etc/bettertether/bettertether.toml",
	"/usr/local/etc/bettertether/bettertether.toml", // Intel Homebrew
	"/opt/homebrew/etc/bettertether/bettertether.toml", // ARM Homebrew
}

// DefaultConfig returns a Config populated with sensible defaults.
func DefaultConfig() *Config {
	return &Config{
		API: APIConfig{
			Enabled: true,
			Host:    "127.0.0.1",
			Port:    9400,
		},
		USB: USBConfig{
			PollIntervalMS: 500,
			ClaimTimeoutMS: 2000,
		},
		RNDIS: RNDISConfig{
			MaxTransferSize: 16384,
			InitTimeoutMS:   3000,
			QueryTimeoutMS:  2000,
			SetTimeoutMS:    2000,
			ReadBufferSize:  65536,
		},
		TUN: TUNConfig{
			InterfaceName: "bettertether",
			MTU:           1400,
		},
		DHCP: DHCPConfig{
			TimeoutMS:    5000,
			RetryCount:   3,
			RetryDelayMS: 1000,
		},
		Route: RouteConfig{
			SetDefaultRoute: true,
			RouteMetric:     100,
		},
		Logging: LoggingConfig{
			Level:  "info",
			Format: "text",
		},
	}
}

// Load reads and parses the configuration from the given path,
// or searches default paths if path is empty, or returns DefaultConfig().
func Load(path string) (*Config, error) {
	if path == "" {
		for _, p := range DefaultConfigPaths {
			if _, err := os.Stat(p); err == nil {
				path = p
				break
			}
		}
	}

	conf := &Config{}
	if path == "" {
		return DefaultConfig(), nil
	}

	if _, err := toml.DecodeFile(path, conf); err != nil {
		return nil, fmt.Errorf("config: failed to decode %s: %w", path, err)
	}

	return conf, nil
}
