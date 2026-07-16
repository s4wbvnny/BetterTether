# 🛡️ BetterTether Privacy Policy

**Effective Date**: April 13, 2026

BetterTether is built with a **Privacy-First** philosophy. As a system-level networking utility, we understand that we are in a position of high trust. This policy outlines our commitment to your data sovereignty and security.

## 1. Zero-Inspection Policy
BetterTether operates as a transparent userspace bridge between your Android phone's USB interface (RNDIS) and your Mac's virtual tunnel (`utun`). 
*   **No Deep Packet Inspection (DPI)**: We do not read, inspect, store, or modify the contents of the individual data packets flowing through the relay.
*   **Encapsulation Only**: Our core logic is restricted to RNDIS/Ethernet encapsulation and decapsulation required for packet transport.

## 2. No Telemetry or Analytics
*   **No "Call Home"**: The BetterTether daemon contains no code to contact any remote server for telemetry, crash reporting, or user analytics.
*   **No Identity Tracking**: We do not collect your name, email, IP address, device serial numbers, or any other personally identifiable information (PII).
*   **Offline by Default**: BetterTether does not require an internet connection to function (other than the connection provided by your phone).

## 3. Local Operational Logs
For debugging and performance monitoring, BetterTether writes limited operational logs to your local filesystem at:
`/var/log/bettertether.log`

These logs contain:
*   USB connection/disconnection events.
*   DHCP lease assignments (Local IPs only).
*   Traffic volume statistics (Total bytes sent/received).

**These logs never leave your machine.** You are free to inspect or delete them at any time.

## 4. Compliance & Transparency
BetterTether is 100% open-source. Anyone can audit our packet-handling logic in `internal/daemon/relay.go` to verify that we are adhering to this policy.

## 5. Contact
If you have security or privacy concerns, please open an issue on our GitHub repository or contact the author via LinkedIn.
