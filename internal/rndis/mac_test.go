package rndis

import (
	"bytes"
	"testing"
)

func TestExtractMACAcceptsSixBytes(t *testing.T) {
	payload := []byte{0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff}

	got, err := extractMAC(payload)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !bytes.Equal(got, payload) {
		t.Errorf("extractMAC = %x, want %x", got, payload)
	}
}

func TestExtractMACRejectsShortPayload(t *testing.T) {
	// A device (or a confused vendor stack) can answer OID_802_3_CURRENT_ADDRESS
	// with fewer than six bytes. Handing that to the relay used to panic the
	// daemon when it indexed the address for frame construction.
	for _, size := range []int{0, 1, 5} {
		payload := bytes.Repeat([]byte{0x11}, size)

		if _, err := extractMAC(payload); err == nil {
			t.Errorf("size %d: expected error, got nil", size)
		}
	}
}

func TestExtractMACTrimsTrailingBytes(t *testing.T) {
	got, err := extractMAC([]byte{1, 2, 3, 4, 5, 6, 7, 8})
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if !bytes.Equal(got, []byte{1, 2, 3, 4, 5, 6}) {
		t.Errorf("extractMAC = %x, want 010203040506", got)
	}
}

func TestExtractMACReturnsIndependentCopy(t *testing.T) {
	// The payload is a slice into the USB read buffer, which is reused on the
	// next read. The returned MAC must not alias it.
	payload := []byte{0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff}

	got, err := extractMAC(payload)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}

	payload[0] = 0x00
	if got[0] != 0xaa {
		t.Errorf("returned MAC aliases the input buffer: got %x", got)
	}
}
