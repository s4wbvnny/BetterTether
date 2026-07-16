// go run scripts/gen-icons.go
// Generates shield icon PNGs for the bettertether-ui menu bar app.
package main

import (
	"bytes"
	"image"
	"image/color"
	"image/draw"
	"image/png"
	"log"
	"os"
)

func main() {
	must(writePNG("cmd/bettertether-ui/icon-shield-on.png", drawShield(color.RGBA{46, 204, 113, 255})))
	must(writePNG("cmd/bettertether-ui/icon-shield-off.png", drawShield(color.RGBA{150, 150, 150, 255})))
	log.Println("✓ Shield icons generated")
}

func drawShield(clr color.Color) image.Image {
	const s = 22
	img := image.NewRGBA(image.Rect(0, 0, s, s))
	draw.Draw(img, img.Bounds(), image.Transparent, image.Point{}, draw.Src)

	// Shield body (rounded rectangle approximation)
	for x := 3; x < 19; x++ {
		for y := 1; y < 16; y++ {
			img.Set(x, y, clr)
		}
	}
	// Shield point (triangle bottom)
	for y := 0; y < 7; y++ {
		for x := 3 + y; x < 19-y; x++ {
			img.Set(x, 16+y, clr)
		}
	}

	// Draw border outline
	border := color.RGBA{255, 255, 255, 200}
	img.Set(3, 1, border)
	img.Set(18, 1, border)
	img.Set(2, 2, border)
	img.Set(19, 2, border)
	img.Set(2, 3, border)
	img.Set(19, 3, border)
	img.Set(2, 14, border)
	img.Set(19, 14, border)

	return img
}

func writePNG(path string, img image.Image) error {
	var buf bytes.Buffer
	if err := png.Encode(&buf, img); err != nil {
		return err
	}
	if err := os.MkdirAll(dir(path), 0755); err != nil {
		return err
	}
	return os.WriteFile(path, buf.Bytes(), 0644)
}

func dir(p string) string {
	for i := len(p) - 1; i >= 0; i-- {
		if p[i] == '/' {
			return p[:i]
		}
	}
	return "."
}

func must(err error) {
	if err != nil {
		log.Fatal(err)
	}
}
