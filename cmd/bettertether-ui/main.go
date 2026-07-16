package main

import (
	_ "embed"
	"fmt"
	"os/exec"
	"strings"
	"sync"
	"time"

	"github.com/getlantern/systray"
)

//go:embed icon-shield-on.png
var iconOn []byte

//go:embed icon-shield-off.png
var iconOff []byte

var (
	mu         sync.Mutex
	running    bool
	statusItem *systray.MenuItem
	toggleItem *systray.MenuItem
)

const plistPath = "/Library/LaunchDaemons/com.princePal.bettertether.plist"

func main() {
	systray.Run(onReady, onExit)
}

func onReady() {
	systray.SetIcon(iconOff)
	systray.SetTooltip("BetterTether")

	statusItem = systray.AddMenuItem("Status: checking...", "")
	statusItem.Disable()

	toggleItem = systray.AddMenuItem("Turn On", "Start BetterTether")

	systray.AddSeparator()

	logItem := systray.AddMenuItem("Open Log", "View /var/log/bettertether.log")
	cfgItem := systray.AddMenuItem("Open Config", "Open /etc/bettertether")

	systray.AddSeparator()

	quitItem := systray.AddMenuItem("Quit", "Quit BetterTether")

	go pollDaemon()

	for {
		select {
		case <-toggleItem.ClickedCh:
			toggle()
		case <-logItem.ClickedCh:
			exec.Command("open", "/var/log/bettertether.log").Start()
		case <-cfgItem.ClickedCh:
			exec.Command("open", "/etc/bettertether").Start()
		case <-quitItem.ClickedCh:
			systray.Quit()
			return
		}
	}
}

func onExit() {}

func pollDaemon() {
	for {
		on := isRunning()
		mu.Lock()
		running = on
		mu.Unlock()
		refresh()
		time.Sleep(3 * time.Second)
	}
}

func isRunning() bool {
	out, err := exec.Command("launchctl", "print", "system/com.princePal.bettertether").CombinedOutput()
	if err != nil {
		return false
	}
	output := string(out)
	return strings.Contains(output, "state = running")
}

func toggle() {
	mu.Lock()
	start := !running
	mu.Unlock()

	statusItem.SetTitle("Status: authenticating...")

	if start {
		exec.Command("osascript", "-e",
			fmt.Sprintf(`do shell script "/bin/launchctl bootstrap system %s" with administrator privileges`, plistPath)).Run()
	} else {
		exec.Command("osascript", "-e",
			fmt.Sprintf(`do shell script "/bin/launchctl bootout system %s" with administrator privileges`, plistPath)).Run()
	}

	time.Sleep(1500 * time.Millisecond)
	mu.Lock()
	running = isRunning()
	mu.Unlock()
	refresh()
}

func refresh() {
	mu.Lock()
	on := running
	mu.Unlock()

	if on {
		systray.SetIcon(iconOn)
		systray.SetTooltip("BetterTether — Running")
		statusItem.SetTitle("Status: Running")
		toggleItem.SetTitle("Turn Off")
	} else {
		systray.SetIcon(iconOff)
		systray.SetTooltip("BetterTether — Stopped")
		statusItem.SetTitle("Status: Stopped")
		toggleItem.SetTitle("Turn On")
	}
}
