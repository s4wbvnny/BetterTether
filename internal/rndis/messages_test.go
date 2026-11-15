package rndis

import (
	"bytes"
	"encoding/binary"
	"testing"
)

func TestEncapsulatePacketLaysOutHeader(t *testing.T) {
	payload := []byte{0xde, 0xad, 0xbe, 0xef}

	pkt := EncapsulatePacket(payload)

	if want := 48 + len(payload); len(pkt) != want {
		t.Fatalf("len(pkt) = %d, want %d", len(pkt), want)
	}
	if got := binary.LittleEndian.Uint32(pkt[0:4]); got != MsgPacket {
		t.Errorf("message type = 0x%08X, want 0x%08X", got, MsgPacket)
	}
	if got := binary.LittleEndian.Uint32(pkt[4:8]); got != uint32(len(pkt)) {
		t.Errorf("message length = %d, want %d", got, len(pkt))
	}
	// Data offset is relative to byte 8, so the payload must begin at 48.
	if got := binary.LittleEndian.Uint32(pkt[8:12]); got != 40 {
		t.Errorf("data offset = %d, want 40", got)
	}
	if got := binary.LittleEndian.Uint32(pkt[12:16]); got != uint32(len(payload)) {
		t.Errorf("data length = %d, want %d", got, len(payload))
	}
	if !bytes.Equal(pkt[48:], payload) {
		t.Errorf("payload = %x, want %x", pkt[48:], payload)
	}
}

func TestEncapsulateDecapsulateRoundTrip(t *testing.T) {
	for _, size := range []int{0, 1, 60, 1514, 16384} {
		payload := bytes.Repeat([]byte{0x42}, size)

		got, err := DecapsulatePacket(EncapsulatePacket(payload))
		if err != nil {
			t.Fatalf("size %d: DecapsulatePacket returned error: %v", size, err)
		}
		if !bytes.Equal(got, payload) {
			t.Fatalf("size %d: payload mismatch", size)
		}
	}
}

func TestDecapsulatePacketRejectsMalformedInput(t *testing.T) {
	valid := EncapsulatePacket([]byte{0x01, 0x02, 0x03})

	t.Run("short buffer", func(t *testing.T) {
		if _, err := DecapsulatePacket(valid[:43]); err == nil {
			t.Fatal("expected error for buffer shorter than the 44-byte minimum")
		}
	})

	t.Run("wrong message type", func(t *testing.T) {
		bad := append([]byte(nil), valid...)
		binary.LittleEndian.PutUint32(bad[0:4], MsgQuery)
		if _, err := DecapsulatePacket(bad); err == nil {
			t.Fatal("expected error for non-packet message type")
		}
	})

	t.Run("declared length past end of buffer", func(t *testing.T) {
		bad := append([]byte(nil), valid...)
		binary.LittleEndian.PutUint32(bad[12:16], uint32(len(bad)))
		if _, err := DecapsulatePacket(bad); err == nil {
			t.Fatal("expected error when dataLen exceeds the buffer")
		}
	})

	t.Run("offset past end of buffer", func(t *testing.T) {
		bad := append([]byte(nil), valid...)
		binary.LittleEndian.PutUint32(bad[8:12], 0xFFFF)
		if _, err := DecapsulatePacket(bad); err == nil {
			t.Fatal("expected error when dataOffset exceeds the buffer")
		}
	})
}

// queryCmplt builds a QUERY_CMPLT carrying payload at the standard offset.
func queryCmplt(payload []byte) []byte {
	b := make([]byte, 28+len(payload))
	binary.LittleEndian.PutUint32(b[0:4], MsgQueryCmplt)
	binary.LittleEndian.PutUint32(b[4:8], uint32(len(b)))
	binary.LittleEndian.PutUint32(b[8:12], 7) // RequestID
	binary.LittleEndian.PutUint32(b[12:16], StatusSuccess)
	binary.LittleEndian.PutUint32(b[16:20], uint32(len(payload))) // InformationBufferLength
	binary.LittleEndian.PutUint32(b[20:24], 20)                   // InformationBufferOffset
	copy(b[28:], payload)
	return b
}

func TestUnmarshalQueryCmplt(t *testing.T) {
	payload := []byte{0xaa, 0xbb, 0xcc, 0xdd, 0xee, 0xff}

	got, err := UnmarshalQueryCmplt(queryCmplt(payload))
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.RequestID != 7 {
		t.Errorf("RequestID = %d, want 7", got.RequestID)
	}
	if got.Status != StatusSuccess {
		t.Errorf("Status = 0x%08X, want 0x%08X", got.Status, StatusSuccess)
	}
	if !bytes.Equal(got.Payload, payload) {
		t.Errorf("Payload = %x, want %x", got.Payload, payload)
	}
}

func TestUnmarshalQueryCmpltRejectsMalformedInput(t *testing.T) {
	t.Run("too short", func(t *testing.T) {
		if _, err := UnmarshalQueryCmplt(make([]byte, 23)); err == nil {
			t.Fatal("expected error for 23-byte message")
		}
	})

	t.Run("wrong message type", func(t *testing.T) {
		bad := queryCmplt([]byte{1, 2, 3, 4, 5, 6})
		binary.LittleEndian.PutUint32(bad[0:4], MsgInitCmplt)
		if _, err := UnmarshalQueryCmplt(bad); err == nil {
			t.Fatal("expected error for wrong message type")
		}
	})

	t.Run("payload out of bounds", func(t *testing.T) {
		bad := queryCmplt([]byte{1, 2, 3, 4, 5, 6})
		binary.LittleEndian.PutUint32(bad[16:20], 4096)
		if _, err := UnmarshalQueryCmplt(bad); err == nil {
			t.Fatal("expected error when the declared payload exceeds the buffer")
		}
	})
}

func TestUnmarshalSetCmplt(t *testing.T) {
	b := make([]byte, 16)
	binary.LittleEndian.PutUint32(b[0:4], MsgSetCmplt)
	binary.LittleEndian.PutUint32(b[8:12], 42)
	binary.LittleEndian.PutUint32(b[12:16], StatusSuccess)

	reqID, status, err := UnmarshalSetCmplt(b)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if reqID != 42 {
		t.Errorf("RequestID = %d, want 42", reqID)
	}
	if status != StatusSuccess {
		t.Errorf("Status = 0x%08X, want 0x%08X", status, StatusSuccess)
	}

	if _, _, err := UnmarshalSetCmplt(make([]byte, 15)); err == nil {
		t.Error("expected error for 15-byte message")
	}

	binary.LittleEndian.PutUint32(b[0:4], MsgQueryCmplt)
	if _, _, err := UnmarshalSetCmplt(b); err == nil {
		t.Error("expected error for wrong message type")
	}
}

func TestUnmarshalInitializeCmplt(t *testing.T) {
	b := make([]byte, 52)
	binary.LittleEndian.PutUint32(b[0:4], MsgInitCmplt)
	binary.LittleEndian.PutUint32(b[8:12], 1)
	binary.LittleEndian.PutUint32(b[12:16], StatusSuccess)
	binary.LittleEndian.PutUint32(b[32:36], 16384) // MaxTransfer
	binary.LittleEndian.PutUint32(b[36:40], 1)     // MaxPackets
	binary.LittleEndian.PutUint32(b[44:48], 0)     // Ethernet packet format

	got, err := UnmarshalInitializeCmplt(b)
	if err != nil {
		t.Fatalf("unexpected error: %v", err)
	}
	if got.MaxTransfer != 16384 {
		t.Errorf("MaxTransfer = %d, want 16384", got.MaxTransfer)
	}
	if got.Status != StatusSuccess {
		t.Errorf("Status = 0x%08X, want 0x%08X", got.Status, StatusSuccess)
	}

	if _, err := UnmarshalInitializeCmplt(make([]byte, 51)); err == nil {
		t.Error("expected error for 51-byte message")
	}

	binary.LittleEndian.PutUint32(b[0:4], MsgSetCmplt)
	if _, err := UnmarshalInitializeCmplt(b); err == nil {
		t.Error("expected error for wrong message type")
	}
}

func TestControlMessageMarshalling(t *testing.T) {
	t.Run("initialize", func(t *testing.T) {
		m := &RemoteNdisInitializeMsg{RequestID: 9, MaxTransferSz: 16384}
		b := m.Marshal()

		if len(b) != 24 {
			t.Fatalf("len = %d, want 24", len(b))
		}
		if got := binary.LittleEndian.Uint32(b[0:4]); got != MsgInit {
			t.Errorf("type = 0x%08X, want 0x%08X", got, MsgInit)
		}
		if got := binary.LittleEndian.Uint32(b[4:8]); got != 24 {
			t.Errorf("length field = %d, want 24", got)
		}
		if got := binary.LittleEndian.Uint32(b[8:12]); got != 9 {
			t.Errorf("RequestID = %d, want 9", got)
		}
		if got := binary.LittleEndian.Uint32(b[20:24]); got != 16384 {
			t.Errorf("MaxTransferSz = %d, want 16384", got)
		}
	})

	t.Run("query", func(t *testing.T) {
		m := &RemoteNdisQueryMsg{RequestID: 3, OID: OID_802_3_CURRENT_ADDRESS}
		b := m.Marshal()

		if len(b) != 28 {
			t.Fatalf("len = %d, want 28", len(b))
		}
		if got := binary.LittleEndian.Uint32(b[0:4]); got != MsgQuery {
			t.Errorf("type = 0x%08X, want 0x%08X", got, MsgQuery)
		}
		if got := binary.LittleEndian.Uint32(b[12:16]); got != OID_802_3_CURRENT_ADDRESS {
			t.Errorf("OID = 0x%08X, want 0x%08X", got, OID_802_3_CURRENT_ADDRESS)
		}
		if got := binary.LittleEndian.Uint32(b[20:24]); got != 20 {
			t.Errorf("information buffer offset = %d, want 20", got)
		}
	})

	t.Run("set", func(t *testing.T) {
		m := &RemoteNdisSetMsg{RequestID: 4, OID: OID_GEN_CURRENT_PACKET_FILTER, Value: 0x0F}
		b := m.Marshal()

		if len(b) != 32 {
			t.Fatalf("len = %d, want 32", len(b))
		}
		if got := binary.LittleEndian.Uint32(b[0:4]); got != MsgSet {
			t.Errorf("type = 0x%08X, want 0x%08X", got, MsgSet)
		}
		if got := binary.LittleEndian.Uint32(b[16:20]); got != 4 {
			t.Errorf("value size = %d, want 4", got)
		}
		if got := binary.LittleEndian.Uint32(b[28:32]); got != 0x0F {
			t.Errorf("value = 0x%02X, want 0x0F", got)
		}
	})
}
