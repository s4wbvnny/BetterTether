package main

import (
	"fmt"
	"os"
	"os/exec"
)

const (
	binaryPath    = "/usr/local/bin/bettertether"
	selfPath      = "/usr/local/bin/bettertether-uninstall"
	appPath       = "/Applications/BetterTether.app"
	plistPath     = "/Library/LaunchDaemons/com.s4wbvnny.bettertether.plist"
	configDir     = "/etc/bettertether"
	logFile       = "/var/log/bettertether.log"
)

var (
	cacheDir      = os.ExpandEnv("$HOME/Library/Caches/com.s4wbvnny.bettertether-ui")
	prefsFile     = os.ExpandEnv("$HOME/Library/Preferences/com.s4wbvnny.bettertether-ui.plist")
	appSupportDir = os.ExpandEnv("$HOME/Library/Application Support/com.s4wbvnny.bettertether-ui")
)

func main() {
	if os.Geteuid() != 0 {
		fmt.Println("This command must be run as root. Try: sudo bettertether-uninstall")
		os.Exit(1)
	}

	fmt.Println("→ Stopping daemon (system domain)...")
	exec.Command("/bin/launchctl", "bootout", "system/com.s4wbvnny.bettertether").Run()
	exec.Command("/bin/launchctl", "bootout", "system", plistPath).Run()

	fmt.Println("→ Killing any running bettertether process...")
	exec.Command("pkill", "-9", "bettertether").Run()

	fmt.Println("→ Removing daemon binary...")
	os.Remove(binaryPath)

	fmt.Println("→ Removing uninstall command...")
	os.Remove(selfPath)

	fmt.Println("→ Removing GUI app...")
	os.RemoveAll(appPath)

	fmt.Println("→ Removing launchd plist...")
	os.Remove(plistPath)

	fmt.Println("→ Removing config...")
	os.RemoveAll(configDir)

	fmt.Println("→ Removing log...")
	os.Remove(logFile)

	fmt.Println("→ Removing app caches...")
	os.RemoveAll(cacheDir)
	os.Remove(prefsFile)
	os.RemoveAll(appSupportDir)

	fmt.Println("")
	fmt.Println("✓ BetterTether fully uninstalled.")
}
