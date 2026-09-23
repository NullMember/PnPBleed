// Core bleed / image-processing algorithm: turns a trimmed card canvas into a canvas
// with extended-edge bleed, optionally after removing rounded corners and/or side strips.
// Depends on the helpers in sides.js (removeWhiteCorners, removeSides) and edge.js
// (fillTransparentPixels, normalize*EdgeSource, sampleEdgeColor, mixColors).

// Convert mm to pixels based on card dimensions
function mmToPixels(mm, cardWidthMm, cardHeightMm, imageWidth, imageHeight) {
    // Calculate pixels per mm for width and height
    const pxPerMmWidth = imageWidth / cardWidthMm;
    const pxPerMmHeight = imageHeight / cardHeightMm;

    // Use average of both ratios for consistent scaling
    const avgPxPerMm = (pxPerMmWidth + pxPerMmHeight) / 2;
    return mm * avgPxPerMm;
}

// Add bleed to card by extending edge gradients. Corner/edge trims are entered
// in mm and converted with pxPerMm (the image's resolution at card size).
function addBleedToCard(sourceCanvas, bleedPx, pxPerMm) {
    const w = sourceCanvas.width;
    const h = sourceCanvas.height;
    const totalW = w + 2 * bleedPx;
    const totalH = h + 2 * bleedPx;

    const outputCanvas = document.createElement('canvas');
    outputCanvas.width = totalW;
    outputCanvas.height = totalH;
    const ctx = outputCanvas.getContext('2d');

    const sourceCtx = sourceCanvas.getContext('2d');
    const sourceImageData = sourceCtx.getImageData(0, 0, w, h);
    let maskData = sourceImageData.data;

    // Remove white corners if enabled
    if (elements.removeWhiteCornersInput.checked) {
        const cornerSize = Math.max(1, Math.round((parseFloat(elements.cornerSizeInput.value) || 2.5) * pxPerMm));
        maskData = removeWhiteCorners(maskData, w, h, cornerSize);
    }

    // Remove sides if enabled
    const trimPx = (checkbox, input) => (checkbox.checked ? Math.round((parseFloat(input.value) || 0) * pxPerMm) : 0);
    const leftWidth = trimPx(elements.removeLeftSideInput, elements.leftSideWidthInput);
    const rightWidth = trimPx(elements.removeRightSideInput, elements.rightSideWidthInput);
    const topHeight = trimPx(elements.removeTopSideInput, elements.topSideHeightInput);
    const bottomHeight = trimPx(elements.removeBottomSideInput, elements.bottomSideHeightInput);

    if (leftWidth > 0 || rightWidth > 0 || topHeight > 0 || bottomHeight > 0) {
        maskData = removeSides(maskData, w, h, leftWidth, rightWidth, topHeight, bottomHeight);
    }

    // maskData still carries the holes, so it is the reference for what was removed.
    const sourceData = fillTransparentPixels(maskData, w, h);
    normalizeLeftEdgeSource(sourceData, maskData, w, h, 3);
    normalizeTopEdgeSource(sourceData, maskData, w, h, 3);
    normalizeBottomEdgeSource(sourceData, maskData, w, h, 3);
    normalizeRightEdgeSource(sourceData, maskData, w, h, 3);

    // Create output image data
    const outputImageData = ctx.createImageData(totalW, totalH);
    const outputData = outputImageData.data;

    // Initialize with transparent
    for (let i = 0; i < outputData.length; i += 4) {
        outputData[i + 3] = 0; // alpha = 0
    }

    // Place original image in center
    for (let y = 0; y < h; y++) {
        for (let x = 0; x < w; x++) {
            const srcIdx = (y * w + x) * 4;
            const destIdx = ((y + bleedPx) * totalW + (x + bleedPx)) * 4;
            outputData[destIdx] = sourceData[srcIdx];
            outputData[destIdx + 1] = sourceData[srcIdx + 1];
            outputData[destIdx + 2] = sourceData[srcIdx + 2];
            outputData[destIdx + 3] = sourceData[srcIdx + 3];
        }
    }

    const mode = elements.bleedMode.value;
    if (mode === 'mirror' || mode === 'solid') {
        fillBleedZone(outputData, totalW, totalH, bleedPx, sourceData, w, h, mode);
        ctx.putImageData(outputImageData, 0, 0);
        return outputCanvas;
    }

    // Each row/column is extended with its own outermost pixel, so the bleed is an exact
    // continuation of the trim line and hard lines stay hard.
    const leftEdge = [];
    const rightEdge = [];
    for (let y = 0; y < h; y++) {
        leftEdge.push(sampleEdgeColor(sourceData, w, h, 0, y, 1, 0));
        rightEdge.push(sampleEdgeColor(sourceData, w, h, w - 1, y, -1, 0));
    }

    const topEdge = [];
    const bottomEdge = [];
    for (let x = 0; x < w; x++) {
        topEdge.push(sampleEdgeColor(sourceData, w, h, x, 0, 0, 1));
        bottomEdge.push(sampleEdgeColor(sourceData, w, h, x, h - 1, 0, -1));
    }

    const writeBleedPixel = (x, y, color) => {
        const idx = (y * totalW + x) * 4;
        outputData[idx] = color.r;
        outputData[idx + 1] = color.g;
        outputData[idx + 2] = color.b;
        outputData[idx + 3] = 255;
    };

    // Extend left and right edges
    for (let y = 0; y < h; y++) {
        for (let i = 0; i < bleedPx; i++) {
            writeBleedPixel(bleedPx - 1 - i, y + bleedPx, leftEdge[y]);
            writeBleedPixel(w + bleedPx + i, y + bleedPx, rightEdge[y]);
        }
    }

    // Extend top and bottom edges
    for (let x = 0; x < w; x++) {
        for (let i = 0; i < bleedPx; i++) {
            writeBleedPixel(x + bleedPx, bleedPx - 1 - i, topEdge[x]);
            writeBleedPixel(x + bleedPx, h + bleedPx + i, bottomEdge[x]);
        }
    }

    // Corners blend the two neighbouring edge colours by angle so they meet both bands.
    fillCornerBleed(outputData, totalW, totalH, bleedPx, 'top-left', topEdge[0], leftEdge[0]);
    fillCornerBleed(outputData, totalW, totalH, bleedPx, 'top-right', topEdge[w - 1], rightEdge[0]);
    fillCornerBleed(outputData, totalW, totalH, bleedPx, 'bottom-left', bottomEdge[0], leftEdge[h - 1]);
    fillCornerBleed(outputData, totalW, totalH, bleedPx, 'bottom-right', bottomEdge[w - 1], rightEdge[h - 1]);

    ctx.putImageData(outputImageData, 0, 0);
    return outputCanvas;
}

// Fill a corner bleed square by blending the horizontal and vertical edge colours.
function fillCornerBleed(outputData, totalW, totalH, bleedPx, corner, verticalColor, horizontalColor) {
    const isLeft = corner === 'top-left' || corner === 'bottom-left';
    const isTop = corner === 'top-left' || corner === 'top-right';
    const x0 = isLeft ? 0 : totalW - bleedPx;
    const y0 = isTop ? 0 : totalH - bleedPx;

    for (let y = 0; y < bleedPx; y++) {
        for (let x = 0; x < bleedPx; x++) {
            // Distances outside the card; the nearer band dominates.
            const horizontalOut = isLeft ? bleedPx - x : x + 1;
            const verticalOut = isTop ? bleedPx - y : y + 1;
            const color = mixColors(horizontalColor, verticalColor, verticalOut / (horizontalOut + verticalOut));
            const idx = ((y0 + y) * totalW + (x0 + x)) * 4;
            outputData[idx] = color.r;
            outputData[idx + 1] = color.g;
            outputData[idx + 2] = color.b;
            outputData[idx + 3] = 255;
        }
    }
}

// Mirror or solid-colour bleed: every pixel outside the trim area is either a
// reflection of the artwork across the nearest edge, or the chosen colour.
function fillBleedZone(outputData, totalW, totalH, bleedPx, sourceData, w, h, mode) {
    const reflect = (i, n) => {
        if (i < 0) i = -i - 1;
        if (i >= n) i = 2 * n - i - 1;
        return Math.max(0, Math.min(n - 1, i));
    };
    const solid = hexToRgb(elements.bleedColor.value);
    for (let y = 0; y < totalH; y++) {
        for (let x = 0; x < totalW; x++) {
            const ix = x - bleedPx, iy = y - bleedPx;
            if (ix >= 0 && ix < w && iy >= 0 && iy < h) continue;
            const o = (y * totalW + x) * 4;
            if (mode === 'solid') {
                outputData[o] = solid.r;
                outputData[o + 1] = solid.g;
                outputData[o + 2] = solid.b;
            } else {
                const s = (reflect(iy, h) * w + reflect(ix, w)) * 4;
                outputData[o] = sourceData[s];
                outputData[o + 1] = sourceData[s + 1];
                outputData[o + 2] = sourceData[s + 2];
            }
            outputData[o + 3] = 255;
        }
    }
}

function hexToRgb(hex) {
    const m = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex) || [0, '00', '00', '00'];
    return { r: parseInt(m[1], 16), g: parseInt(m[2], 16), b: parseInt(m[3], 16) };
}
