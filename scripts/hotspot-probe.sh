#!/bin/bash
# hotspot-probe.sh — can Internet Sharing use the BetterTether tunnel as upstream?
#
# Control-first A/B, entirely through launchd (the only supported control surface;
# exec'ing /usr/libexec/InternetSharing directly gets SIGKILLed):
#
#   phase 1  external = bridge0  (an interface the Sharing pane accepts) -> does
#            the prefs-reload + launchd path bring the AP up at all?
#   phase 2  external = utunN    (only if phase 1 worked) -> is the tunnel eligible?
#
# Restores prefs, stops the service, and bounces the BetterTether daemon so DNS
# and routes are re-applied before exiting.
#
#   sudo ./scripts/hotspot-probe.sh up
#   sudo ./scripts/hotspot-probe.sh down    # restore after an interrupted run
#   sudo ./scripts/hotspot-probe.sh status

set -u

PLIST="/Library/Preferences/SystemConfiguration/com.apple.nat.plist"
BACKUP="/tmp/nat.plist.bak"
LOG="/tmp/hotspot-probe.log"
NAT_JOB="system/com.apple.NetworkSharing"
SHARE_DEV="en0"
DAEMON="system/com.s4wbvnny.bettertether"

say() { echo "$@" | tee -a "$LOG"; }
section() { say ""; say "===== $* ====="; }
pb() { /usr/libexec/PlistBuddy -c "$1" "$PLIST" 2>&1; }

tunnel_interface() { netstat -rn -f inet 2>/dev/null | awk '$1 == "0/1" { print $NF; exit }'; }
en0_address() { ifconfig en0 2>/dev/null | awk '/inet /{print $2}'; }

stop_sharing() {
    pkill -TERM -x InternetSharing 2>/dev/null && say "SIGTERM -> InternetSharing"
    sleep 2
    if pgrep -x InternetSharing >/dev/null 2>&1; then
        pkill -KILL -x InternetSharing 2>/dev/null && say "SIGKILL -> InternetSharing"
        sleep 1
    fi
    pgrep -x InternetSharing >/dev/null 2>&1 && say "still running" || say "sharing stopped"
}

write_prefs() {
    local ext="$1"
    pb "Set :NAT:PrimaryInterface:Device $ext" >/dev/null
    pb "Set :NAT:PrimaryInterface:Enabled 1" >/dev/null
    pb "Delete :NAT:SharingDevices" >/dev/null 2>&1
    pb "Add :NAT:SharingDevices array" >/dev/null 2>&1
    pb "Add :NAT:SharingDevices:0 string $SHARE_DEV" >/dev/null
    pb "Set :NAT:AirPort:Enabled 1" >/dev/null
    pb "Set :NAT:Enabled 1" >/dev/null
    say "prefs written: external=$ext sharing=[$SHARE_DEV] airport=on enabled=1"
}

capture() {
    local tag="$1"
    section "$tag"
    say "en0 inet     : $(en0_address)"
    say "en0 status   : $(ifconfig en0 2>/dev/null | awk '/status:/{print $2}')"
    say "bridge100    : $(ifconfig bridge100 2>/dev/null | awk '/inet /{print $2}')"
    say "forwarding   : $(sysctl -n net.inet.ip.forwarding 2>&1)"
    say "bootpd       : $(pgrep -lx bootpd 2>/dev/null | tr '\n' ' ')"
    say "job state    : $(launchctl print "$NAT_JOB" 2>/dev/null | awk -F'= ' '/state =|runs =|last exit code/{printf "%s; ", $2}')"
    say "pf nat       : $(pfctl -s nat 2>/dev/null | grep -E '^nat on' | head -3 | tr '\n' ' ')"
    say "internet     : ping=$(ping -c 1 -t 3 8.8.8.8 >/dev/null 2>&1 && echo ok || echo FAILED) curl=$(curl -s -o /dev/null -m 6 -w '%{http_code}' https://example.com 2>&1)"
}

sharing_log() {
    section "InternetSharing log ($1)"
    /usr/bin/log show --last 80s --style compact \
        --predicate 'process == "InternetSharing" OR process == "bootpd"' 2>/dev/null \
        | grep -viE "activating connection|invalidated because|xpc_connection_cancel|libdispatch|Retrieve User" \
        | tail -25 | tee -a "$LOG"
}

attempt() {
    local ext="$1" label="$2"
    section "ATTEMPT: $label  (external = $ext)"

    stop_sharing
    write_prefs "$ext"

    say "committing prefs to configd (HUP)"
    killall -HUP configd 2>&1 | tee -a "$LOG"
    sleep 3
    say "after HUP: Enabled=$(pb 'Print :NAT:Enabled') external=$(pb 'Print :NAT:PrimaryInterface:Device')"

    launchctl enable "$NAT_JOB" 2>&1 | tee -a "$LOG"
    say "launchctl kickstart $NAT_JOB"
    launchctl kickstart "$NAT_JOB" 2>&1 | tee -a "$LOG"

    sleep 8
    capture "$label +8s"
    sleep 8
    capture "$label +16s"
    sharing_log "$label"

    local addr
    addr=$(en0_address)
    say "RESULT [$label]: en0=${addr:-none}"
    [ -n "$addr" ]
}

do_up() {
    : > "$LOG"; chmod 644 "$LOG"

    local iface
    iface=$(tunnel_interface)
    section "environment"
    say "macOS   : $(sw_vers -productVersion)"
    say "tunnel  : ${iface:-NONE}"
    if [ -z "$iface" ] || [ "${iface#utun}" = "$iface" ]; then
        say "ABORT: no BetterTether utun"
        exit 1
    fi

    if [ ! -f "$BACKUP" ]; then
        cp -p "$PLIST" "$BACKUP" && say "backed up prefs -> $BACKUP"
    else
        say "using existing original backup $BACKUP"
    fi

    stop_sharing
    capture "baseline"

    local control=0 tunnel=0

    # Control first: if this fails, the tunnel result means nothing.
    if ! attempt "bridge0" "CONTROL bridge0"; then
        section "control failed — stopping"
        control=1
    else
        control=0
        if attempt "$iface" "TUNNEL $iface"; then tunnel=0; else tunnel=1; fi
    fi

    section "restoring"
    stop_sharing
    cp -p "$BACKUP" "$PLIST" && say "prefs restored"
    say "now: Enabled=$(pb 'Print :NAT:Enabled') external=$(pb 'Print :NAT:PrimaryInterface:Device')"
    killall -HUP configd 2>&1 | tee -a "$LOG"
    sleep 2

    section "restarting BetterTether daemon (re-apply DNS + routes)"
    launchctl kickstart -k "$DAEMON" 2>&1 | tee -a "$LOG"
    sleep 10
    capture "final"

    section "VERDICT"
    if [ $control -ne 0 ]; then
        say "CONTROL FAILED: even bridge0 -> en0 did not come up."
        say "Automation cannot drive Internet Sharing on this macOS build."
        say "Next: toggle it by hand in System Settings once to prove the machine can do it at all."
    elif [ $tunnel -eq 0 ]; then
        say "UTUN SUPPORTED: the tunnel works as a Sharing upstream."
    else
        say "MECHANISM OK, UTUN REJECTED: bridge0 shared fine, $iface did not."
        say "Design becomes: macOS owns AP+DHCP from a decoy, BetterTether adds pf NAT into $iface."
    fi
}

do_down() {
    : > "$LOG"; chmod 644 "$LOG"
    section "restore"
    stop_sharing
    [ -f "$BACKUP" ] && cp -p "$BACKUP" "$PLIST" && say "prefs restored"
    killall -HUP configd 2>&1 | tee -a "$LOG"
    sleep 2
    launchctl kickstart -k "$DAEMON" 2>&1 | tee -a "$LOG"
    sleep 8
    capture "after restore"
}

do_status() {
    pb "Print :NAT"
    capture "status"
}

case "${1:-up}" in
    up)     do_up ;;
    down)   do_down ;;
    status) do_status ;;
    *)      echo "usage: $0 [up|down|status]" >&2; exit 2 ;;
esac

chmod 644 "$LOG" 2>/dev/null
exit 0
