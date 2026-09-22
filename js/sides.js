// Corner and side removal helpers.
// These punch transparent holes into a copy of the source pixel data; the holes are
// later patched by fillTransparentPixels() (see edge.js) before the bleed border is drawn.

// Remove pixels from the four corners using circular arc algorithm
// Circle center is inside the card at (radius, radius) from corner
function removeWhiteCorners(sourceData, w, h, cornerSize) {
    const processed = new Uint8ClampedArray(sourceData);

    const corners = [
        { x: 0, y: 0, cx: cornerSize, cy: cornerSize }, // top-left
        { x: w - 1, y: 0, cx: w - 1 - cornerSize, cy: cornerSize }, // top-right
        { x: 0, y: h - 1, cx: cornerSize, cy: h - 1 - cornerSize }, // bottom-left
        { x: w - 1, y: h - 1, cx: w - 1 - cornerSize, cy: h - 1 - cornerSize } // bottom-right
    ];

    for (const corner of corners) {
        const minX = Math.max(0, corner.x - cornerSize);
        const maxX = Math.min(w - 1, corner.x + cornerSize);
        const minY = Math.max(0, corner.y - cornerSize);
        const maxY = Math.min(h - 1, corner.y + cornerSize);

        for (let y = minY; y <= maxY; y++) {
            for (let x = minX; x <= maxX; x++) {
                // Calculate distance from circle center (which is inside the card)
                const dx = x - corner.cx;
                const dy = y - corner.cy;
                const distance = Math.sqrt(dx * dx + dy * dy);

                // Remove if OUTSIDE the circular arc
                if (distance > cornerSize) {
                    const idx = (y * w + x) * 4;
                    processed[idx + 3] = 0; // Make transparent
                }
            }
        }
    }

    return processed;
}

// Remove pixels from sides based on width/height
function removeSides(sourceData, w, h, leftWidth, rightWidth, topHeight, bottomHeight) {
    const processed = new Uint8ClampedArray(sourceData);

    // Remove left side
    if (leftWidth > 0) {
        for (let y = 0; y < h; y++) {
            for (let x = 0; x < Math.min(leftWidth, w); x++) {
                const idx = (y * w + x) * 4;
                processed[idx + 3] = 0; // Make transparent
            }
        }
    }

    // Remove right side
    if (rightWidth > 0) {
        for (let y = 0; y < h; y++) {
            for (let x = Math.max(0, w - rightWidth); x < w; x++) {
                const idx = (y * w + x) * 4;
                processed[idx + 3] = 0; // Make transparent
            }
        }
    }

    // Remove top side
    if (topHeight > 0) {
        for (let y = 0; y < Math.min(topHeight, h); y++) {
            for (let x = 0; x < w; x++) {
                const idx = (y * w + x) * 4;
                processed[idx + 3] = 0; // Make transparent
            }
        }
    }

    // Remove bottom side
    if (bottomHeight > 0) {
        for (let y = Math.max(0, h - bottomHeight); y < h; y++) {
            for (let x = 0; x < w; x++) {
                const idx = (y * w + x) * 4;
                processed[idx + 3] = 0; // Make transparent
            }
        }
    }

    return processed;
}
