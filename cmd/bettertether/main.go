package main

import (
	"flag"
	"fmt"
	"os"

	"github.com/s4wbvnny/BetterTether/config"
	"github.com/s4wbvnny/BetterTether/internal/daemon"
)

// Injected by make build: -ldflags="-X main.version=..."
var version = "dev"

func main() {
	showVersion := flag.Bool("version", false, "print version and exit")
	configPath := flag.String("config", "", "path to config file")
	flag.Parse()

	if *showVersion {
		fmt.Printf("bettertether v%s\n", version)
		return
	}

	fmt.Printf("bettertether v%s starting...\n", version)

	// Load configuration (falls back to embedded defaults if no file exists)
	cfg, err := config.Load(*configPath)
	if err != nil {
		fmt.Fprintf(os.Stderr, "bettertether: failed to load configuration: %v, using defaults\n", err)
		cfg = config.DefaultConfig()
	}

	d := daemon.New(cfg)
	if err := d.Run(); err != nil {
		fmt.Fprintf(os.Stderr, "bettertether: daemon encountered an error: %v\n", err)
		os.Exit(1)
	}
}
