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

// Handle image upload
elements.imageInput.addEventListener('change', async (e) => {
    const files = Array.from(e.target.files);
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
        // Try to detect DPI from first image
        await detectDPI(state.images[0].canvas);
        renderThumbnails();
        selectCard(0);
        elements.downloadBtn.disabled = false;
        elements.downloadAllBtn.disabled = false;
        updateStatus(`Loaded ${state.images.length} image(s)`, 'success');
    } else {
        updateStatus('Failed to load images', 'error');
    }
});

// Convert image file to canvas
function imageToCanvas(file) {
    return new Promise((resolve) => {
        const reader = new FileReader();
        reader.onload = (e) => {
            const img = new Image();
            img.onload = () => {
                const canvas = document.createElement('canvas');
                canvas.width = img.width;
                canvas.height = img.height;
                const ctx = canvas.getContext('2d');
                ctx.drawImage(img, 0, 0);
                resolve(canvas);
            };
            img.src = e.target.result;
        };
        reader.readAsDataURL(file);
    });
}

// Detect DPI from image metadata (simplified - uses default)
async function detectDPI(canvas) {
    // Using standard print DPI of 300
    // No longer user-configurable
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

    const cardWidthMm = parseFloat(elements.cardWidthInput.value) || 63;
    const cardHeightMm = parseFloat(elements.cardHeightInput.value) || 88;
    const bleedMm = parseFloat(elements.bleedInput.value) || 0;
    const bleedPx = Math.round(mmToPixels(bleedMm, cardWidthMm, cardHeightMm, img.canvas.width, img.canvas.height));

    try {
        const processedCanvas = addBleedToCard(img.canvas, bleedPx);
        state.images[state.selectedIndex].processed = processedCanvas;
        state.processedCards[state.selectedIndex] = processedCanvas;

        elements.processedContainer.innerHTML = '';

        const canvas = document.createElement('canvas');
        const maxWidth = elements.processedContainer.offsetWidth - 24;
        const maxHeight = elements.processedContainer.offsetHeight - 24;

        const scale = Math.min(maxWidth / processedCanvas.width, maxHeight / processedCanvas.height);
        canvas.width = processedCanvas.width * scale;
        canvas.height = processedCanvas.height * scale;

        const ctx = canvas.getContext('2d');
        ctx.drawImage(processedCanvas, 0, 0, canvas.width, canvas.height);

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
    document.getElementById('bleedSize').textContent = `${bleedMm}mm (${Math.round(bleedPx)}px)`;
    document.getElementById('originalPixels').textContent = `${img.canvas.width} × ${img.canvas.height}`;
    document.getElementById('bleedPixels').textContent =
        `${img.canvas.width + 2*Math.round(bleedPx)} × ${img.canvas.height + 2*Math.round(bleedPx)}`;

    elements.infoGrid.style.display = 'grid';
}

// Process selected card with bleed
async function autoProcess() {
    const img = state.images[state.selectedIndex];
    if (!img) return;

    const cardWidthMm = parseFloat(elements.cardWidthInput.value) || 63;
    const cardHeightMm = parseFloat(elements.cardHeightInput.value) || 88;
    const bleedMm = parseFloat(elements.bleedInput.value) || 0;
    const bleedPx = Math.round(mmToPixels(bleedMm, cardWidthMm, cardHeightMm, img.canvas.width, img.canvas.height));

    try {
        const processedCanvas = addBleedToCard(img.canvas, bleedPx);
        state.images[state.selectedIndex].processed = processedCanvas;
        state.processedCards[state.selectedIndex] = processedCanvas;

        await updateProcessedPreview();
    } catch (error) {
        updateStatus(`Error: ${error.message}`, 'error');
    }
}

// Show preview with bleed
function updatePreviewWithBleed(processedCanvas) {
    elements.previewContainer.innerHTML = '';

    const canvas = document.createElement('canvas');
    const maxWidth = elements.previewContainer.offsetWidth - 40;
    const maxHeight = elements.previewContainer.offsetHeight - 40;

    const scale = Math.min(maxWidth / processedCanvas.width, maxHeight / processedCanvas.height);
    canvas.width = processedCanvas.width * scale;
    canvas.height = processedCanvas.height * scale;

    const ctx = canvas.getContext('2d');
    ctx.drawImage(processedCanvas, 0, 0, canvas.width, canvas.height);

    canvas.className = 'preview-canvas';
    elements.previewContainer.appendChild(canvas);
}

// Download current processed card
elements.downloadBtn.addEventListener('click', () => {
    const img = state.images[state.selectedIndex];
    const processed = img?.processed;
    if (!processed) {
        updateStatus('No processed card to download', 'error');
        return;
    }

    const link = document.createElement('a');
    link.href = processed.toDataURL();
    link.download = img.file.name;
    link.click();

    updateStatus('Card downloaded!', 'success');
});

// Download all processed cards
elements.downloadAllBtn.addEventListener('click', async () => {
    const toProcess = state.images.filter((img, idx) => !state.processedCards[idx]);

    if (toProcess.length > 0) {
        updateStatus(`Processing ${toProcess.length} remaining card(s)...`, 'info');
        elements.downloadAllBtn.disabled = true;

        const cardWidthMm = parseFloat(elements.cardWidthInput.value) || 63;
        const cardHeightMm = parseFloat(elements.cardHeightInput.value) || 88;
        const bleedMm = parseFloat(elements.bleedInput.value) || 0;

        for (let i = 0; i < state.images.length; i++) {
            if (!state.processedCards[i]) {
                const bleedPx = Math.round(mmToPixels(bleedMm, cardWidthMm, cardHeightMm, state.images[i].canvas.width, state.images[i].canvas.height));
                const processedCanvas = addBleedToCard(state.images[i].canvas, bleedPx);
                state.processedCards[i] = processedCanvas;
            }
        }
    }

    // Create ZIP file with all processed cards
    try {
        const zip = new JSZip();

        for (let i = 0; i < state.images.length; i++) {
            const canvas = state.processedCards[i];
            if (canvas) {
                const dataUrl = canvas.toDataURL('image/png');
                const base64 = dataUrl.split(',')[1];
                zip.file(state.images[i].file.name, base64, { base64: true });
            }
        }

        const blob = await zip.generateAsync({ type: 'blob' });
        saveAs(blob, 'cards-with-bleed.zip');

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

// Update when bleed/DPI/card dimensions change
elements.bleedInput.addEventListener('change', () => {
    // Clear cached processed cards to force reprocessing with new bleed
    state.processedCards = {};
    state.images.forEach(img => img.processed = null);
    updateInfoGrid();
    autoProcess();
});

// Remove rounded corners from current card
elements.removeWhiteCornersInput.addEventListener('change', () => {
    elements.cornerSizeInput.disabled = !elements.removeWhiteCornersInput.checked;
    // Clear cached processed cards to force reprocessing
    state.processedCards = {};
    state.images.forEach(img => img.processed = null);
    autoProcess();
});

elements.cornerSizeInput.addEventListener('change', () => {
    // Clear cached processed cards to force reprocessing
    state.processedCards = {};
    state.images.forEach(img => img.processed = null);
    autoProcess();
});

// Left side removal listeners
elements.removeLeftSideInput.addEventListener('change', () => {
    elements.leftSideWidthInput.disabled = !elements.removeLeftSideInput.checked;
    state.processedCards = {};
    state.images.forEach(img => img.processed = null);
    autoProcess();
});

elements.leftSideWidthInput.addEventListener('change', () => {
    state.processedCards = {};
    state.images.forEach(img => img.processed = null);
    autoProcess();
});

// Right side removal listeners
elements.removeRightSideInput.addEventListener('change', () => {
    elements.rightSideWidthInput.disabled = !elements.removeRightSideInput.checked;
    state.processedCards = {};
    state.images.forEach(img => img.processed = null);
    autoProcess();
});

elements.rightSideWidthInput.addEventListener('change', () => {
    state.processedCards = {};
    state.images.forEach(img => img.processed = null);
    autoProcess();
});

// Top side removal listeners
elements.removeTopSideInput.addEventListener('change', () => {
    elements.topSideHeightInput.disabled = !elements.removeTopSideInput.checked;
    state.processedCards = {};
    state.images.forEach(img => img.processed = null);
    autoProcess();
});

elements.topSideHeightInput.addEventListener('change', () => {
    state.processedCards = {};
    state.images.forEach(img => img.processed = null);
    autoProcess();
});

// Bottom side removal listeners
elements.removeBottomSideInput.addEventListener('change', () => {
    elements.bottomSideHeightInput.disabled = !elements.removeBottomSideInput.checked;
    state.processedCards = {};
    state.images.forEach(img => img.processed = null);
    autoProcess();
});

elements.bottomSideHeightInput.addEventListener('change', () => {
    state.processedCards = {};
    state.images.forEach(img => img.processed = null);
    autoProcess();
});

// Card dimensions change the mm-to-pixel ratio, so the bleed has to be rebuilt.
elements.cardWidthInput.addEventListener('change', () => {
    state.processedCards = {};
    state.images.forEach(img => img.processed = null);
    updateInfoGrid();
    autoProcess();
});

elements.cardHeightInput.addEventListener('change', () => {
    state.processedCards = {};
    state.images.forEach(img => img.processed = null);
    updateInfoGrid();
    autoProcess();
});

// Handle window resize
window.addEventListener('resize', () => {
    updateOriginalPreview();
    updateProcessedPreview();
});
