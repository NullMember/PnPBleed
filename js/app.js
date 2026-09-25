// State, DOM wiring and UI event handling for the Card Bleed Generator.
// The actual pixel processing lives in bleed.js / sides.js / edge.js.

// Store uploaded images and processed results
const state = {
    images: [], // { file, canvas, processed }
    selectedIndex: 0,
    dpiDetected: false,
    processedCards: {}
};

const elements = {
    imageInput: document.getElementById('imageInput'),
    cardWidthInput: document.getElementById('cardWidthInput'),
    cardHeightInput: document.getElementById('cardHeightInput'),
    bleedInput: document.getElementById('bleedInput'),
    bleedMode: document.getElementById('bleedMode'),
    bleedColor: document.getElementById('bleedColor'),
    showTrimLine: document.getElementById('showTrimLine'),
    detectBorderBtn: document.getElementById('detectBorderBtn'),
    removeWhiteCornersInput: document.getElementById('removeWhiteCornersInput'),
    cornerSizeInput: document.getElementById('cornerSizeInput'),
    removeLeftSideInput: document.getElementById('removeLeftSideInput'),
    leftSideWidthInput: document.getElementById('leftSideWidthInput'),
    removeRightSideInput: document.getElementById('removeRightSideInput'),
    rightSideWidthInput: document.getElementById('rightSideWidthInput'),
    removeTopSideInput: document.getElementById('removeTopSideInput'),
    topSideHeightInput: document.getElementById('topSideHeightInput'),
    removeBottomSideInput: document.getElementById('removeBottomSideInput'),
    bottomSideHeightInput: document.getElementById('bottomSideHeightInput'),
    downloadBtn: document.getElementById('downloadBtn'),
    downloadAllBtn: document.getElementById('downloadAllBtn'),
    status: document.getElementById('status'),
    thumbnailsContainer: document.getElementById('thumbnailsContainer'),
    originalContainer: document.getElementById('originalContainer'),
    processedContainer: document.getElementById('processedContainer'),
    infoGrid: document.getElementById('infoGrid')
};

const DEFAULT_DPI = 300;

// Load a new batch of card images (replaces the current batch)
async function loadFiles(files) {
    files = Array.from(files).filter((f) => f.type.startsWith('image/'));
    if (files.length === 0) return;

    state.images = [];
    state.selectedIndex = 0;
    state.processedCards = {};

    updateStatus('Loading images...', 'info');

    for (const file of files) {
        const canvas = await imageToCanvas(file);
        if (canvas) {
            state.images.push({ file, canvas, processed: null });
        }
    }

    if (state.images.length > 0) {
        renderThumbnails();
        selectCard(0);
        elements.downloadBtn.disabled = false;
        elements.downloadAllBtn.disabled = false;
        sendMenu.setEnabled(true);
        elements.detectBorderBtn.disabled = false;
        updateStatus(`Loaded ${state.images.length} image(s)`, 'success');
    } else {
        updateStatus('Failed to load images', 'error');
    }
}

// Convert image file to canvas
function imageToCanvas(file) {
    return new Promise((resolve) => {
        const url = URL.createObjectURL(file);
        const img = new Image();
        img.onload = () => {
            const canvas = document.createElement('canvas');
            canvas.width = img.width;
            canvas.height = img.height;
            canvas.getContext('2d').drawImage(img, 0, 0);
            URL.revokeObjectURL(url);
            resolve(canvas);
        };
        img.onerror = () => {
            URL.revokeObjectURL(url);
            resolve(null);
        };
        img.src = url;
    });
}

// Pixels per mm of an image, given the entered card (trim) size
function pxPerMmFor(canvas) {
    const cardWidthMm = parseFloat(elements.cardWidthInput.value) || 63;
    const cardHeightMm = parseFloat(elements.cardHeightInput.value) || 88;
    return mmToPixels(1, cardWidthMm, cardHeightMm, canvas.width, canvas.height);
}

// Build (or reuse) the bled version of card i
function processCard(i) {
    if (state.processedCards[i]) return state.processedCards[i];
    const img = state.images[i];
    const pxPerMm = pxPerMmFor(img.canvas);
    const bleedMm = parseFloat(elements.bleedInput.value) || 0;
    const processed = addBleedToCard(img.canvas, Math.round(bleedMm * pxPerMm), pxPerMm);
    img.processed = processed;
    state.processedCards[i] = processed;
    return processed;
}

// Processed cards are always PNG, whatever the source format was
function pngName(name) {
    return name.replace(/\.[^.]+$/, '') + '.png';
}

function processAll() {
    return state.images.map((_, i) => processCard(i));
}

// Render thumbnail previews
function renderThumbnails() {
    elements.thumbnailsContainer.innerHTML = '';

    if (state.images.length === 0) {
        elements.thumbnailsContainer.innerHTML = `
            <div class="empty-state" style="width: 100%; justify-content: center;">
                <div class="empty-state-icon">📁</div>
                <div>No images uploaded yet</div>
            </div>
        `;
        return;
    }

    state.images.forEach((img, index) => {
        const thumbnail = document.createElement('div');
        thumbnail.className = 'thumbnail' + (index === state.selectedIndex ? ' active' : '');

        const canvas = document.createElement('canvas');
        const size = 100;
        canvas.width = size;
        canvas.height = size;
        const ctx = canvas.getContext('2d');

        // Scale down image to fit thumbnail
        const scale = Math.min(size / img.canvas.width, size / img.canvas.height);
        const scaledW = img.canvas.width * scale;
        const scaledH = img.canvas.height * scale;
        ctx.fillStyle = 'white';
        ctx.fillRect(0, 0, size, size);
        ctx.drawImage(img.canvas, (size - scaledW) / 2, (size - scaledH) / 2, scaledW, scaledH);

        thumbnail.addEventListener('click', () => selectCard(index));

        const dataUrl = canvas.toDataURL();
        thumbnail.innerHTML = `<img src="${dataUrl}" alt="Card ${index + 1}">`;

        elements.thumbnailsContainer.appendChild(thumbnail);
    });
}

// Select a card and update preview
function selectCard(index) {
    state.selectedIndex = index;
    renderThumbnails();
    updatePreviews();
}

// Update both original and processed previews
async function updatePreviews() {
    const img = state.images[state.selectedIndex];
    if (!img) return;

    updateOriginalPreview();
    updateProcessedPreview();
    updateInfoGrid();
}

// Show original image preview
function updateOriginalPreview() {
    const img = state.images[state.selectedIndex];
    if (!img) return;

    elements.originalContainer.innerHTML = '';

    const canvas = document.createElement('canvas');
    const maxWidth = elements.originalContainer.offsetWidth - 24;
    const maxHeight = elements.originalContainer.offsetHeight - 24;

    const scale = Math.min(maxWidth / img.canvas.width, maxHeight / img.canvas.height);
    canvas.width = img.canvas.width * scale;
    canvas.height = img.canvas.height * scale;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(img.canvas, 0, 0, canvas.width, canvas.height);

    canvas.className = 'comparison-canvas';
    elements.originalContainer.appendChild(canvas);
}

// Process and show processed preview
async function updateProcessedPreview() {
    const img = state.images[state.selectedIndex];
    if (!img) return;

    try {
        const processedCanvas = processCard(state.selectedIndex);

        elements.processedContainer.innerHTML = '';

        const canvas = document.createElement('canvas');
        const maxWidth = elements.processedContainer.offsetWidth - 24;
        const maxHeight = elements.processedContainer.offsetHeight - 24;

        const scale = Math.min(maxWidth / processedCanvas.width, maxHeight / processedCanvas.height);
        canvas.width = processedCanvas.width * scale;
        canvas.height = processedCanvas.height * scale;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(processedCanvas, 0, 0, canvas.width, canvas.height);

        // Where the card will be cut: the original image's edges
        if (elements.showTrimLine.checked) {
            const bleedPx = (processedCanvas.width - img.canvas.width) / 2;
            ctx.save();
            ctx.setLineDash([6, 4]);
            ctx.lineWidth = 1.5;
            ctx.strokeStyle = '#ff2d55';
            ctx.strokeRect(bleedPx * scale, bleedPx * scale, img.canvas.width * scale, img.canvas.height * scale);
            ctx.restore();
        }

        canvas.className = 'comparison-canvas';
        elements.processedContainer.appendChild(canvas);

        elements.downloadBtn.disabled = false;
    } catch (error) {
        updateStatus(`Error: ${error.message}`, 'error');
    }
}

// Update info grid
function updateInfoGrid() {
    const img = state.images[state.selectedIndex];
    if (!img) return;

    const cardWidthMm = parseFloat(elements.cardWidthInput.value) || 63;
    const cardHeightMm = parseFloat(elements.cardHeightInput.value) || 88;
    const bleedMm = parseFloat(elements.bleedInput.value) || 0;
    const bleedPx = mmToPixels(bleedMm, cardWidthMm, cardHeightMm, img.canvas.width, img.canvas.height);

    document.getElementById('originalSize').textContent = `${img.canvas.width} × ${img.canvas.height}`;
    document.getElementById('bleedSize').textContent = `${PnP.units.format(bleedMm)} (${Math.round(bleedPx)}px)`;
    document.getElementById('originalPixels').textContent = `${img.canvas.width} × ${img.canvas.height}`;
    document.getElementById('bleedPixels').textContent =
        `${img.canvas.width + 2*Math.round(bleedPx)} × ${img.canvas.height + 2*Math.round(bleedPx)}`;

    elements.infoGrid.style.display = 'grid';
}

// Download current processed card
elements.downloadBtn.addEventListener('click', () => {
    const img = state.images[state.selectedIndex];
    if (!img) {
        updateStatus('No processed card to download', 'error');
        return;
    }
    const processed = processCard(state.selectedIndex);
    PnP.canvasToBlob(processed).then((blob) => {
        PnP.downloadBlob(blob, pngName(img.file.name));
        updateStatus('Card downloaded!', 'success');
    });
});

// Download all processed cards
elements.downloadAllBtn.addEventListener('click', async () => {
    const remaining = state.images.filter((img, idx) => !state.processedCards[idx]).length;
    if (remaining > 0) {
        updateStatus(`Processing ${remaining} remaining card(s)...`, 'info');
        elements.downloadAllBtn.disabled = true;
        await new Promise((r) => setTimeout(r, 0)); // let the status paint
        processAll();
    }

    // Create ZIP file with all processed cards
    try {
        const zip = new JSZip();

        for (let i = 0; i < state.images.length; i++) {
            const canvas = state.processedCards[i];
            if (canvas) {
                const dataUrl = canvas.toDataURL('image/png');
                const base64 = dataUrl.split(',')[1];
                zip.file(pngName(state.images[i].file.name), base64, { base64: true });
            }
        }

        const blob = await zip.generateAsync({ type: 'blob' });
        PnP.downloadBlob(blob, 'cards-with-bleed.zip');

        elements.downloadAllBtn.disabled = false;
        updateStatus(`All ${state.images.length} card(s) downloaded as ZIP!`, 'success');
    } catch (error) {
        updateStatus(`Error creating ZIP: ${error.message}`, 'error');
        elements.downloadAllBtn.disabled = false;
    }
});

// Update status message
function updateStatus(message, type = 'info') {
    elements.status.textContent = message;
    elements.status.className = `status ${type}`;
}

// Any setting change invalidates every processed card. Typing updates the
// preview after a short pause; the enable checkboxes toggle their inputs.
let reprocessTimer = null;
function reprocess() {
    state.processedCards = {};
    state.images.forEach(img => img.processed = null);
    clearTimeout(reprocessTimer);
    reprocessTimer = setTimeout(() => {
        updateInfoGrid();
        updateProcessedPreview();
    }, 150);
}

[
    [elements.removeWhiteCornersInput, elements.cornerSizeInput],
    [elements.removeLeftSideInput, elements.leftSideWidthInput],
    [elements.removeRightSideInput, elements.rightSideWidthInput],
    [elements.removeTopSideInput, elements.topSideHeightInput],
    [elements.removeBottomSideInput, elements.bottomSideHeightInput],
].forEach(([checkbox, input]) => {
    checkbox.addEventListener('change', () => {
        input.disabled = !checkbox.checked;
        reprocess();
    });
    input.addEventListener('input', reprocess);
});

[elements.bleedInput, elements.cardWidthInput, elements.cardHeightInput, elements.bleedColor].forEach((input) => {
    input.addEventListener('input', reprocess);
});

const BLEED_MODE_HINTS = {
    extend: 'Best for flat borders and frames.',
    mirror: 'Best for full-bleed artwork and photos.',
    solid: 'Fills the bleed with one colour, e.g. a black card border.',
};

function updateBleedModeUI() {
    const mode = elements.bleedMode.value;
    document.getElementById('bleedColorGroup').hidden = mode !== 'solid';
    document.getElementById('bleedModeHint').textContent = BLEED_MODE_HINTS[mode];
}

elements.bleedMode.addEventListener('change', () => {
    updateBleedModeUI();
    reprocess();
});
elements.showTrimLine.addEventListener('change', () => updateProcessedPreview());

// Measure plain white (or transparent) margins on the selected card and
// turn them into edge-removal settings.
elements.detectBorderBtn.addEventListener('click', () => {
    const img = state.images[state.selectedIndex];
    if (!img) return;
    const { width: w, height: h } = img.canvas;
    const data = img.canvas.getContext('2d').getImageData(0, 0, w, h).data;
    const isBlank = (x, y) => {
        const i = (y * w + x) * 4;
        return data[i + 3] < 32 || (data[i] > 230 && data[i + 1] > 230 && data[i + 2] > 230);
    };
    // A row/column is border when nearly all of its pixels are blank.
    const lineBlank = (horizontal, index) => {
        const n = horizontal ? w : h;
        let blank = 0;
        for (let k = 0; k < n; k++) if (horizontal ? isBlank(k, index) : isBlank(index, k)) blank++;
        return blank / n > 0.97;
    };
    const measure = (horizontal, from, step, limit) => {
        let count = 0;
        for (let i = from; count < limit && lineBlank(horizontal, i); i += step) count++;
        return count;
    };
    const px = {
        top: measure(true, 0, 1, h * 0.2),
        bottom: measure(true, h - 1, -1, h * 0.2),
        left: measure(false, 0, 1, w * 0.2),
        right: measure(false, w - 1, -1, w * 0.2),
    };
    const pxPerMm = pxPerMmFor(img.canvas);
    const sides = [
        ['top', elements.removeTopSideInput, elements.topSideHeightInput],
        ['bottom', elements.removeBottomSideInput, elements.bottomSideHeightInput],
        ['left', elements.removeLeftSideInput, elements.leftSideWidthInput],
        ['right', elements.removeRightSideInput, elements.rightSideWidthInput],
    ];
    let found = 0;
    sides.forEach(([side, checkbox, input]) => {
        const mm = Math.round((px[side] / pxPerMm) * 10) / 10;
        checkbox.checked = mm > 0;
        input.disabled = !checkbox.checked;
        input.value = mm;
        if (mm > 0) found++;
        checkbox.dispatchEvent(new Event('change', { bubbles: true }));
        input.dispatchEvent(new Event('input', { bubbles: true }));
    });
    updateStatus(found ? `White border found: top ${px.top}px, bottom ${px.bottom}px, left ${px.left}px, right ${px.right}px.` : 'No white border found on this card.', found ? 'success' : 'info');
});

PnP.units.onChange(() => updateInfoGrid());

// Handle window resize
window.addEventListener('resize', () => {
    updateOriginalPreview();
    updateProcessedPreview();
});

// ---- Shared PnPTools wiring --------------------------------------------------

PnP.dropzone(document.getElementById('dropZone'), {
    input: elements.imageInput,
    accept: ['image/*'],
    onFiles: loadFiles,
});


async function processedItems() {
    processAll();
    return Promise.all(state.images.map(async (img, i) => ({
        name: pngName(img.file.name),
        blob: await PnP.canvasToBlob(state.processedCards[i]),
        role: img.file.pnpRole,
    })));
}

const sendMenu = PnP.sendMenu(document.getElementById('sendSlot'), {
    from: 'Bleed',
    targets: ['PnPLayout', 'PnPBooklet', 'PnPTuckBox'],
    getItems: processedItems,
});
sendMenu.setEnabled(false);

PnP.bindPreset(document.getElementById('cardPreset'), elements.cardWidthInput, elements.cardHeightInput, 'card');
PnP.settings.onApply(updateBleedModeUI);
updateBleedModeUI();

PnP.init({
    tool: 'PnPBleed',
    project: {
        getFiles: () => state.images.map((img) => ({ name: img.file.name, blob: img.file, role: img.file.pnpRole })),
        setFiles: (files) => loadFiles(files),
    },
    hasUnsavedWork: () => state.images.length > 0,
});

PnP.handoff.receive((items) => loadFiles(PnP.itemsToFiles(items)));
