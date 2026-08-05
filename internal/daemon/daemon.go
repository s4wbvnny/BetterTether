package daemon

import (
	"fmt"
	"os"
	"os/exec"
	"os/signal"
	"strings"
	"sync"
	"syscall"
	"time"

	"github.com/rs/zerolog"
	"github.com/rs/zerolog/log"

	"github.com/s4wbvnny/BetterTether/config"
	"github.com/s4wbvnny/BetterTether/internal/api"
	"github.com/s4wbvnny/BetterTether/internal/rndis"
	"github.com/s4wbvnny/BetterTether/internal/tun"
	"github.com/s4wbvnny/BetterTether/internal/usb"
)

// Daemon represents the main executing body of BetterTether.
type Daemon struct {
	cfg       *config.Config
	wg        sync.WaitGroup
	startTime time.Time

	mu         sync.Mutex
	activeRelay *Relay

	plistPath string
}

// New creates a new Daemon with the loaded configuration.
func New(cfg *config.Config) *Daemon {
	return &Daemon{
		cfg:       cfg,
		startTime: time.Now(),
		plistPath: "/Library/LaunchDaemons/com.s4wbvnny.bettertether.plist",
	}
}

// Run starts the daemon loop, USB watcher, and blocks until an interrupt signal is received.
func (d *Daemon) Run() error {
	d.setupLogging()
	log.Info().Msg("Starting BetterTether...")

	// Start the local HTTP API server for the GUI
	if d.cfg.API.Enabled {
		apiSrv := api.New(d.cfg.API.Host, d.cfg.API.Port, d)
		if err := apiSrv.Start(); err != nil {
			log.Warn().Err(err).Msg("Failed to start API server (non-fatal)")
		} else {
			defer apiSrv.Stop()
		}
	}

	// Use config polling interval, fallback to 1000ms if not set
	pollInterval := time.Duration(d.cfg.USB.PollIntervalMS) * time.Millisecond
	if pollInterval <= 0 {
		pollInterval = 1000 * time.Millisecond
	}

	watcher := usb.NewWatcher(pollInterval)

	watcher.OnAttach(func(dev *usb.Device) {
		d.wg.Add(1)
		defer d.wg.Done()
		log.Info().
			Str("component", "daemon").
			Msg("Android RNDIS device connected!")

		session := rndis.NewSession(dev)
		phoneMAC, err := session.Handshake()
		if err != nil {
			log.Error().Str("component", "daemon").Err(err).Msg("RNDIS Handshake failed")
			return
		}

		iface, err := tun.OpenUTUN(0)
		if err != nil {
			log.Error().Str("component", "daemon").Err(err).Msg("Failed to create utun interface")
			return
		}

		// Ensure everything closes when watcher is stopped
		go func() {
			<-watcher.Context().Done()
			iface.Close()
		}()
		defer iface.Close()

		relay, err := NewRelay(watcher.Context(), dev, iface, phoneMAC)
		if err != nil {
			log.Error().Str("component", "daemon").Err(err).Msg("Failed to initialize Relay")
			time.Sleep(2 * time.Second) // prevent busy loops on retry
			return
		}
		d.setActiveRelay(relay)
		defer d.clearActiveRelay()

		relay.OnDHCP = func(gateway, client string) {
			log.Info().Str("component", "daemon").Str("gateway", gateway).Str("client", client).Msg("🔥 DHCPOFFER Intercepted! Auto-configuring network...")

			mtuStr := fmt.Sprintf("%d", d.cfg.TUN.MTU)
			if d.cfg.TUN.MTU <= 0 {
				mtuStr = "1400" // fallback
			}

			if err := iface.Configure(client, gateway, mtuStr); err != nil {
				log.Warn().Str("component", "daemon").Err(err).Msg("Failed to auto-configure interface IP")
			} else {
				log.Info().Str("component", "daemon").Str("mtu", mtuStr).Msg("✨ Network auto-configured! Ping should now work natively!")

				// Inject default route if configured
				if d.cfg.Route.SetDefaultRoute {
					log.Info().Str("component", "daemon").Msg("Rerouting all system traffic through BetterTether...")
					if err := iface.SetDefaultRoute(gateway); err != nil {
						log.Warn().Str("component", "daemon").Err(err).Msg("Failed to set default route")
					}

					// Set DNS to Google (Primary) and phone gateway (Secondary)
					log.Info().Str("component", "daemon").Msg("Setting system DNS to 8.8.8.8 (Google)...")
					if err := iface.SetDNS([]string{"8.8.8.8", gateway}); err != nil {
						log.Warn().Str("component", "daemon").Err(err).Msg("Failed to set DNS")
					}
				}
			}
		}

		// Start the relay loop in its own goroutine
		errChan := make(chan error, 1)
		go func() {
			errChan <- relay.Start()
		}()

		// Wait here until the relay ends (cable pull) OR daemon is shutting down (Ctrl+C)
		select {
		case err := <-errChan:
			if err != nil {
				log.Warn().Str("component", "daemon").Err(err).Msg("Relay session ended")
			} else {
				log.Info().Str("component", "daemon").Msg("Relay session closed")
			}
		case <-watcher.Context().Done():
			log.Info().Str("component", "daemon").Msg("Daemon shutting down — stopping active relay...")
			relay.Stop()
			<-errChan // Wait for cleanup to finish
		}
	})

	// Start the USB hotplug watcher
	watcher.Start()
	log.Debug().
		Str("component", "daemon").
		Dur("poll_interval", pollInterval).
		Msg("USB watcher started. Waiting for devices...")

	// Block until graceful shutdown signal
	sigChan := make(chan os.Signal, 1)
	signal.Notify(sigChan, syscall.SIGINT, syscall.SIGTERM)

	sig := <-sigChan
	log.Info().
		Str("component", "daemon").
		Interface("signal", sig).
		Msg("Received signal, shutting down gracefully...")

	// Clean up
	watcher.Stop()
	log.Info().Msg("Waiting for active sessions to close...")
	d.wg.Wait()
	log.Info().Msg("Shutdown complete.")

	return nil
}

func (d *Daemon) setActiveRelay(r *Relay) {
	d.mu.Lock()
	d.activeRelay = r
	d.mu.Unlock()
}

func (d *Daemon) clearActiveRelay() {
	d.mu.Lock()
	d.activeRelay = nil
	d.mu.Unlock()
}

func (d *Daemon) getRelayStats() *api.RelayStats {
	d.mu.Lock()
	r := d.activeRelay
	d.mu.Unlock()
	if r == nil {
		return nil
	}

	r.mu.Lock()
	sent := r.sentBytes
	recv := r.recvBytes
	ct := r.connectedAt
	clientIP := ""
	if r.clientIP != nil {
		clientIP = r.clientIP.String()
	}
	phoneMAC := fmt.Sprintf("%02x:%02x:%02x:%02x:%02x:%02x", r.phoneMAC[0], r.phoneMAC[1], r.phoneMAC[2], r.phoneMAC[3], r.phoneMAC[4], r.phoneMAC[5])
	r.mu.Unlock()

	return &api.RelayStats{
		Connected:   true,
		SentBytes:   sent,
		RecvBytes:   recv,
		ConnectedAt: ct.Format(time.RFC3339),
		ClientIP:    clientIP,
		PhoneMAC:    phoneMAC,
	}
}

// Status implements api.StatusProvider.
func (d *Daemon) Status() api.DaemonStatus {
	relay := d.getRelayStats()
	started := !d.startTime.IsZero()
	return api.DaemonStatus{
		Running: started,
		Active:  relay != nil,
		Relay:   relay,
		Uptime:  time.Since(d.startTime).Round(time.Second).String(),
	}
}

// StartDaemon implements api.StatusProvider.
// Launches the launchd daemon via osascript for privilege escalation.
func (d *Daemon) StartDaemon() error {
	out, err := exec.Command("launchctl", "print", "system/com.s4wbvnny.bettertether").CombinedOutput()
	if err == nil && strings.Contains(string(out), "state = running") {
		return nil
	}
	cmd := exec.Command("osascript", "-e",
		fmt.Sprintf(`do shell script "/bin/launchctl bootstrap system %s && /bin/launchctl kickstart -k system/com.s4wbvnny.bettertether" with administrator privileges`, d.plistPath))
	return cmd.Run()
}

// StopDaemon implements api.StatusProvider.
// Unloads the launchd daemon via osascript for privilege escalation.
func (d *Daemon) StopDaemon() error {
	cmd := exec.Command("osascript", "-e",
		fmt.Sprintf(`do shell script "/bin/launchctl bootout system %s" with administrator privileges`, d.plistPath))
	return cmd.Run()
}

func (d *Daemon) setupLogging() {
	// Level
	level, err := zerolog.ParseLevel(d.cfg.Logging.Level)
	if err != nil {
		level = zerolog.InfoLevel
	}
	zerolog.SetGlobalLevel(level)

	// Format
	if d.cfg.Logging.Format == "text" {
		log.Logger = log.Output(zerolog.ConsoleWriter{Out: os.Stderr, TimeFormat: time.RFC3339})
	}
}
