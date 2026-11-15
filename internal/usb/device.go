package usb

import (
	"fmt"
	"time"

	"github.com/google/gousb"
	"github.com/rs/zerolog/log"
)

// Device wraps a gousb.Device with RNDIS specific fields and capabilities.
type Device struct {
	usbd         *gousb.Device
	usbc         *gousb.Config
	controlIntf  *gousb.Interface
	dataIntf     *gousb.Interface
	InterfaceNum int
}

// NewDevice opens and claims the RNDIS interface on the provided gousb.Device.
func NewDevice(dev *gousb.Device) (*Device, error) {
	var targetConfigNum, targetInterfaceNum, targetAltSettingNum int = -1, -1, -1

	// 1. Scan all configuration descriptors to find the best RNDIS candidate.
	// We do this BEFORE calling dev.Config() to avoid unnecessary SET_CONFIGURATION requests.
	for _, cfgDesc := range dev.Desc.Configs {
		foundInConfig := false
		for _, intfDesc := range cfgDesc.Interfaces {
			for _, altDesc := range intfDesc.AltSettings {
				if MatchRNDIS(uint16(dev.Desc.Vendor), uint16(dev.Desc.Product), uint8(altDesc.Class), uint8(altDesc.SubClass), uint8(altDesc.Protocol)) {
					// Prioritize standard RNDIS class over vendor-specific if multiple found
					if targetConfigNum == -1 || uint8(altDesc.Class) == RNDISClass {
						targetConfigNum = cfgDesc.Number
						targetInterfaceNum = intfDesc.Number
						targetAltSettingNum = altDesc.Number
						foundInConfig = true
					}
				}
			}
		}
		if foundInConfig {
			break
		}
	}

	if targetConfigNum == -1 {
		return nil, fmt.Errorf("no RNDIS interface found on any device configuration")
	}

	// 2. Set AutoDetach (detaches macOS built-in driver automatically).
	dev.SetAutoDetach(true)

	// 3. Open the selected configuration.
	usbc, err := dev.Config(targetConfigNum)
	if err != nil {
		return nil, fmt.Errorf("failed to open device config %d: %w", targetConfigNum, err)
	}

	// Wait for the device to stabilize after SET_CONFIGURATION (critical for Samsung)
	time.Sleep(250 * time.Millisecond)

	// 4. Claim the control interface.
	intf, err := usbc.Interface(targetInterfaceNum, targetAltSettingNum)
	if err != nil {
		usbc.Close()
		return nil, fmt.Errorf("failed to claim RNDIS control interface %d: %w", targetInterfaceNum, err)
	}

	d := &Device{
		usbd:         dev,
		usbc:         usbc,
		controlIntf:  intf,
		InterfaceNum: targetInterfaceNum,
	}

	// 5. Proactively find and claim the Data interface.
	// Many devices (Samsung) require the data interface to be claimed before the RNDIS handshake finishes.
	for _, intfDesc := range usbc.Desc.Interfaces {
		if intfDesc.Number == targetInterfaceNum {
			continue
		}
		for _, alt := range intfDesc.AltSettings {
			// Search for RNDIS Data (Class 0x0A) or general vendor-specific data
			class := uint8(alt.Class)
			if class == 0x0A || class == 0xFF || class == 0xEF {
				if len(alt.Endpoints) >= 2 {
					log.Debug().Msgf("Proactively claiming Data Intf %d Alt %d", intfDesc.Number, alt.Number)
					dataIntf, err := usbc.Interface(intfDesc.Number, alt.Number)
					if err == nil {
						d.dataIntf = dataIntf
						break
					}
				}
			}
		}
		if d.dataIntf != nil {
			break
		}
	}

	return d, nil
}

// Close releases the claimed USB interfaces and config configuration.
func (d *Device) Close() error {
	if d.dataIntf != nil {
		d.dataIntf.Close()
		d.dataIntf = nil
	}
	if d.controlIntf != nil {
		d.controlIntf.Close()
		d.controlIntf = nil
	}
	if d.usbc != nil {
		d.usbc.Close()
		d.usbc = nil
	}
	return nil
}

// Control performs a vendor-specific control transfer.
func (d *Device) Control(rType, request uint8, val, idx uint16, data []byte) (int, error) {
	return d.usbd.Control(rType, request, val, idx, data)
}

// OpenBulkEndpoints returns the bulk IN and OUT endpoints for data transfer.
func (d *Device) OpenBulkEndpoints() (in *gousb.InEndpoint, out *gousb.OutEndpoint, err error) {
	// 1. Try finding endpoints on the current (Control) interface first.
	in, out, _ = d.findEndpoints(d.controlIntf)
	if in != nil && out != nil {
		return in, out, nil
	}

	// 2. Scan for a Data interface if not already claimed
	if d.dataIntf == nil {
		for _, intfDesc := range d.usbc.Desc.Interfaces {
			if intfDesc.Number == d.InterfaceNum {
				continue
			}
			for _, alt := range intfDesc.AltSettings {
				if len(alt.Endpoints) >= 2 {
					log.Debug().Msgf("Try claim intf %d alt %d", intfDesc.Number, alt.Number)
					intf, err := d.usbc.Interface(intfDesc.Number, alt.Number)
					if err != nil {
						log.Debug().Msgf("failed to claim intf %d alt %d: %v", intfDesc.Number, alt.Number, err)
						if alt.Number != 0 {
							log.Debug().Msgf("trying fallback alt 0 for intf %d", intfDesc.Number)
							intf, err = d.usbc.Interface(intfDesc.Number, 0)
							if err != nil {
								log.Debug().Msgf("fallback failed: %v", err)
								continue
							}
						} else {
							continue
						}
					}

					in, out, _ = d.findEndpoints(intf)
					if in != nil && out != nil {
						log.Debug().Msgf("Found bulk endpoints on intf %d alt %d", intfDesc.Number, alt.Number)
						d.dataIntf = intf
						return in, out, nil
					} else {
						log.Debug().Msgf("Endpoints not found after claiming.")
					}
					intf.Close()
				}
			}
		}
	} else {
		return d.findEndpoints(d.dataIntf)
	}

	return nil, nil, fmt.Errorf("could not find bulk endpoint pair")
}

func (d *Device) findEndpoints(intf *gousb.Interface) (*gousb.InEndpoint, *gousb.OutEndpoint, error) {
	var in *gousb.InEndpoint
	var out *gousb.OutEndpoint

	for _, ep := range intf.Setting.Endpoints {
		if ep.TransferType == gousb.TransferTypeBulk {
			if ep.Direction == gousb.EndpointDirectionIn {
				in, _ = intf.InEndpoint(ep.Number)
			} else {
				out, _ = intf.OutEndpoint(ep.Number)
			}
		}
	}
	if in == nil || out == nil {
		return nil, nil, fmt.Errorf("missing endpoints")
	}
	return in, out, nil
}
