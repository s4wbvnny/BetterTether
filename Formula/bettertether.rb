class BetterTether < Formula
    desc "Android USB tethering for Apple Silicon Macs — no kext, no SIP changes"
    homepage "https://github.com/s4wbvnny/bettertether"
    version "0.8.7"
  
    # ARM binary (Apple Silicon — M1/M2/M3/M4)
    on_arm do
      url "https://github.com/s4wbvnny/bettertether/releases/download/v#{version}/bettertether-darwin-arm64.tar.gz"
      sha256 "REPLACE_WITH_ACTUAL_SHA256_AFTER_RELEASE"
    end
  
    # Intel binary (fallback)
    on_intel do
      url "https://github.com/s4wbvnny/bettertether/releases/download/v#{version}/bettertether-darwin-amd64.tar.gz"
      sha256 "REPLACE_WITH_ACTUAL_SHA256_AFTER_RELEASE"
    end
  
    license "MIT"
  
    # libusb is required for USB device access
    depends_on "libusb"
  
    # Requires macOS 13+ (Ventura) on Apple Silicon
    depends_on macos: :ventura
  
    def install
      bin.install "bettertether"
  
      # Install default config
      (etc/"bettertether").mkpath
      (etc/"bettertether/bettertether.toml").write(default_config) unless (etc/"bettertether/bettertether.toml").exist?
  
      # Install launchd plist (will be loaded in post_install)
      (prefix/"launchd").mkpath
      (prefix/"launchd/com.princePal.bettertether.plist").write(plist_content)
    end
  
    def post_install
      # Copy plist to LaunchDaemons and load it
      system "sudo", "cp", "#{prefix}/launchd/com.princePal.bettertether.plist",
             "/Library/LaunchDaemons/com.princePal.bettertether.plist"
      system "sudo", "launchctl", "load", "/Library/LaunchDaemons/com.princePal.bettertether.plist"
    end
  
    def caveats
      <<~EOS
        BetterTether has been installed and the daemon started.
  
        Usage:
          1. Connect your Android phone via USB
          2. On your phone: Settings → Network → Hotspot & Tethering → USB Tethering → ON
          3. Internet will route through your phone automatically
  
        Logs:
          tail -f /var/log/bettertether.log
  
        Config:
          #{etc}/bettertether/bettertether.toml
  
        To stop/start the daemon:
          sudo launchctl unload /Library/LaunchDaemons/com.princePal.bettertether.plist
          sudo launchctl load /Library/LaunchDaemons/com.princePal.bettertether.plist
  
        GitHub: https://github.com/s4wbvnny/bettertether
      EOS
    end
  
    # Called by `brew uninstall`
    def uninstall_preflight
      system "sudo", "launchctl", "unload", "/Library/LaunchDaemons/com.princePal.bettertether.plist"
      system "sudo", "rm", "-f", "/Library/LaunchDaemons/com.princePal.bettertether.plist"
    end
  
    test do
      # Verify binary runs and prints version
      assert_match "bettertether v", shell_output("#{bin}/bettertether --version")
    end
  
    private
  
    def plist_content
      <<~XML
        <?xml version="1.0" encoding="UTF-8"?>
        <!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN"
          "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
        <plist version="1.0">
        <dict>
          <key>Label</key>
          <string>com.princePal.bettertether</string>
          <key>ProgramArguments</key>
          <array>
            <string>#{opt_bin}/bettertether</string>
            <string>--config</string>
            <string>#{etc}/bettertether/bettertether.toml</string>
          </array>
          <key>RunAtLoad</key>
          <true/>
          <key>KeepAlive</key>
          <true/>
          <key>StandardOutPath</key>
          <string>/var/log/bettertether.log</string>
          <key>StandardErrorPath</key>
          <string>/var/log/bettertether.log</string>
          <key>ThrottleInterval</key>
          <integer>5</integer>
        </dict>
        </plist>
      XML
    end
  
    def default_config
      # Embedded minimal default config (full reference: repo config/default.toml)
      <<~TOML
        # BetterTether config — edit as needed
        # Full reference: https://github.com/s4wbvnny/bettertether/blob/main/config/default.toml
  
        [usb]
        poll_interval_ms = 500
  
        [rndis]
        max_transfer_size = 16384
  
        [tun]
        mtu = 1500
  
        [dhcp]
        timeout_ms = 5000
  
        [route]
        set_default_route = true
  
        [logging]
        level = "info"
        format = "text"
        file = "/var/log/bettertether.log"
      TOML
    end
  end