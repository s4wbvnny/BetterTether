package daemon

import (
	"bytes"
	"testing"
)

// phoneMAC arrives from the device. These tests pin the behaviour that a
// truncated address must never panic the relay, which runs as root.

func TestAutoDetectMACUpdatesOnMismatch(t *testing.T) {
	r := &Relay{phoneMAC: []byte{0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff}}
	src := []byte{0x11, 0x22, 0x33, 0x44, 0x55, 0x66}

	r.autoDetectMAC(src)

	if !bytes.Equal(r.phoneMAC, src) {
		t.Errorf("phoneMAC = %x, want %x", r.phoneMAC, src)
	}
}

func TestAutoDetectMACLeavesMatchingMACAlone(t *testing.T) {
	src := []byte{0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff}
	r := &Relay{phoneMAC: append([]byte(nil), src...)}

	r.autoDetectMAC(src)

	if !bytes.Equal(r.phoneMAC, src) {
		t.Errorf("phoneMAC = %x, want %x", r.phoneMAC, src)
	}
}

func TestAutoDetectMACIgnoresShortPhoneMAC(t *testing.T) {
	short := []byte{0xaa, 0xbb}
	r := &Relay{phoneMAC: append([]byte(nil), short...)}
	src := []byte{0x11, 0x22, 0x33, 0x44, 0x55, 0x66}

	defer func() {
		if rec := recover(); rec != nil {
			t.Fatalf("autoDetectMAC panicked on a short phoneMAC: %v", rec)
		}
	}()

	r.autoDetectMAC(src)

	if !bytes.Equal(r.phoneMAC, short) {
		t.Errorf("phoneMAC was modified to %x", r.phoneMAC)
	}
}

func TestAutoDetectMACShortPhoneMACWithMatchingPrefix(t *testing.T) {
	// The first bytes match, so the comparison loop advances far enough to
	// index past the end of a truncated phoneMAC.
	src := []byte{0x11, 0x22, 0x33, 0x44, 0x55, 0x66}
	r := &Relay{phoneMAC: []byte{0x11, 0x22}}

	defer func() {
		if rec := recover(); rec != nil {
			t.Fatalf("autoDetectMAC panicked on a short phoneMAC: %v", rec)
		}
	}()

	r.autoDetectMAC(src)

	if !bytes.Equal(r.phoneMAC, []byte{0x11, 0x22}) {
		t.Errorf("phoneMAC was modified to %x", r.phoneMAC)
	}
}

func TestAutoDetectMACIgnoresShortSourceMAC(t *testing.T) {
	r := &Relay{phoneMAC: []byte{0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff}}

	defer func() {
		if rec := recover(); rec != nil {
			t.Fatalf("autoDetectMAC panicked on a short source MAC: %v", rec)
		}
	}()

	r.autoDetectMAC([]byte{0x11, 0x22})

	if !bytes.Equal(r.phoneMAC, []byte{0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff}) {
		t.Errorf("phoneMAC was modified to %x", r.phoneMAC)
	}
}

func TestGetRelayStatsFormatsPhoneMAC(t *testing.T) {
	d := &Daemon{}
	d.setActiveRelay(&Relay{phoneMAC: []byte{0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff}})
	defer d.clearActiveRelay()

	got := d.getRelayStats()
	if got == nil {
		t.Fatal("getRelayStats returned nil for an active relay")
	}
	if want := "aa:bb:cc:dd:ee:ff"; got.PhoneMAC != want {
		t.Errorf("PhoneMAC = %q, want %q", got.PhoneMAC, want)
	}
}

func TestGetRelayStatsHandlesShortPhoneMAC(t *testing.T) {
	d := &Daemon{}
	d.setActiveRelay(&Relay{phoneMAC: []byte{0xaa, 0xbb}})
	defer d.clearActiveRelay()

	defer func() {
		if rec := recover(); rec != nil {
			t.Fatalf("getRelayStats panicked on a short phoneMAC: %v", rec)
		}
	}()

	got := d.getRelayStats()
	if got == nil {
		t.Fatal("getRelayStats returned nil for an active relay")
	}
	if got.PhoneMAC != "" {
		t.Errorf("PhoneMAC = %q, want empty for an unknown address", got.PhoneMAC)
	}
}
