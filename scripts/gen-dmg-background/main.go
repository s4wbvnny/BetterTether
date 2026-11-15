// Command gen-dmg-background renders the DMG window background used by
// electron-builder.
//
// The arrow is drawn from fixed logical coordinates in a 540x380 window, with
// the app icon at x=130 and the /Applications link at x=410 — so the arrow's
// centre line (x=270) is exactly halfway between them. Icons are positioned in
// gui/electron-builder.yml and must stay in sync with this file.
//
// Run from the repository root:
//
//	go run ./scripts/gen-dmg-background
package main

import (
	"image"
	"image/color"
	"image/png"
	"os"
	"path/filepath"
)

const (
	baseW = 540 // logical DMG window width
	baseH = 380 // logical DMG window height
	ss    = 4   // supersampling factor, for smooth edges
)

var (
	bg    = color.RGBA{0xF5, 0xF5, 0xF7, 0xFF}
	arrow = color.RGBA{0xB3, 0xB3, 0xBC, 0xFF}
)

func main() {
	out := filepath.Join("gui", "resources")
	if err := os.MkdirAll(out, 0o755); err != nil {
		fail(err)
	}
	for _, target := range []struct {
		name  string
		scale int
	}{
		{"dmg-background.png", 1},
		{"dmg-background@2x.png", 2},
	} {
		if err := render(filepath.Join(out, target.name), target.scale); err != nil {
			fail(err)
		}
	}
}

func fail(err error) {
	os.Stderr.WriteString("gen-dmg-background: " + err.Error() + "\n")
	os.Exit(1)
}

func render(path string, scale int) error {
	w, h := baseW*scale, baseH*scale
	big := image.NewRGBA(image.Rect(0, 0, w*ss, h*ss))

	fill(big, bg)
	drawArrow(big)

	small := image.NewRGBA(image.Rect(0, 0, w, h))
	downsample(big, small)

	f, err := os.Create(path)
	if err != nil {
		return err
	}
	defer f.Close()
	if err := png.Encode(f, small); err != nil {
		return err
	}
	os.Stdout.WriteString("wrote " + path + "\n")
	return nil
}

func fill(img *image.RGBA, c color.RGBA) {
	for i := 0; i < len(img.Pix); i += 4 {
		img.Pix[i+0] = c.R
		img.Pix[i+1] = c.G
		img.Pix[i+2] = c.B
		img.Pix[i+3] = c.A
	}
}

// drawArrow paints a right-pointing arrow whose centre is the centre of the
// window. Geometry is expressed in logical pixels, so the @2x render is
// identical to the 1x one.
func drawArrow(img *image.RGBA) {
	k := float64(img.Bounds().Dx()) / baseW // supersampled pixels per logical pixel

	const (
		cy      = 220.0 // icon centre line
		shaftL  = 200.0
		shaftR  = 308.0
		halfThk = 7.0
		headL   = 308.0
		headTip = 342.0
		headH   = 27.0
	)

	b := img.Bounds()
	for py := b.Min.Y; py < b.Max.Y; py++ {
		// Sample at the centre of each supersampled pixel.
		y := (float64(py-b.Min.Y) + 0.5) / k

		inShaft := y >= cy-halfThk && y <= cy+halfThk
		dy := y - cy
		if dy < 0 {
			dy = -dy
		}

		for px := b.Min.X; px < b.Max.X; px++ {
			x := (float64(px-b.Min.X) + 0.5) / k

			inside := inShaft && x >= shaftL && x <= shaftR
			if !inside && x >= headL && x <= headTip {
				// Taper from full height at the base to a point at the tip.
				t := (headTip - x) / (headTip - headL)
				inside = dy <= headH*t
			}
			if inside {
				i := img.PixOffset(px, py)
				img.Pix[i+0] = arrow.R
				img.Pix[i+1] = arrow.G
				img.Pix[i+2] = arrow.B
				img.Pix[i+3] = arrow.A
			}
		}
	}
}

func downsample(src, dst *image.RGBA) {
	b := dst.Bounds()
	for y := b.Min.Y; y < b.Max.Y; y++ {
		for x := b.Min.X; x < b.Max.X; x++ {
			var r, g, bl, a uint32
			for dy := 0; dy < ss; dy++ {
				for dx := 0; dx < ss; dx++ {
					c := src.RGBAAt(x*ss+dx, y*ss+dy)
					r += uint32(c.R)
					g += uint32(c.G)
					bl += uint32(c.B)
					a += uint32(c.A)
				}
			}
			n := uint32(ss * ss)
			dst.SetRGBA(x, y, color.RGBA{uint8(r / n), uint8(g / n), uint8(bl / n), uint8(a / n)})
		}
	}
}
