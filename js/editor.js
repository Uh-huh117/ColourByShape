document.addEventListener('DOMContentLoaded', () => {
    // Canvases
    const coloringCanvas = document.getElementById('coloringCanvas');
    const outlineCanvas = document.getElementById('outlineCanvas');
    const viewport = document.getElementById('canvasViewport');
    const transformLayer = document.getElementById('transformLayer');
    
    const ctx = coloringCanvas.getContext('2d', { willReadFrequently: true });
    const outlineCtx = outlineCanvas.getContext('2d', { willReadFrequently: true });
    
    // UI Elements
    const sidebar = document.getElementById('sidebar');
    const toggleSidebarBtn = document.getElementById('toggleSidebarBtn');
    const reorientBtn = document.getElementById('reorientBtn');
    const outlineToggle = document.getElementById('toggleOutline');
    const paletteContainer = document.getElementById('paletteContainer');
    const backBtn = document.getElementById('backBtn');
    const saveBtn = document.getElementById('saveBtn');
    
    // Audio
    const ambientAudio = document.getElementById('ambientAudio');
    const brushAudio = document.getElementById('brushAudio');

    // State Variables
    let currentProjectId = localStorage.getItem('currentProject');
    let projectData = JSON.parse(localStorage.getItem(currentProjectId));
    let activeColor = [0, 0, 0, 255]; 
    let isPainting = false;
    let colorMode = 'tap';
    let imageWidth, imageHeight;

    // Viewport Transform State (Zoom, Pan, Rotate)
    let transform = { scale: 1, tx: 0, ty: 0, rotation: 0 };
    let gestureState = { startDist: 0, startAngle: 0, startScale: 1, startRotation: 0, startTx: 0, startTy: 0, center: null };

    if (!projectData) {
        window.location.href = 'index.html';
        return;
    }

    // Load & Initialize Image
    const img = new Image();
    img.src = projectData.original;
    img.onload = () => {
        imageWidth = coloringCanvas.width = outlineCanvas.width = img.width;
        imageHeight = coloringCanvas.height = outlineCanvas.height = img.height;
        
        if (projectData.progress) {
            const progImg = new Image();
            progImg.src = projectData.progress;
            progImg.onload = () => {
                ctx.drawImage(progImg, 0, 0);
                extractPaletteAndOutlines(img);
            };
        } else {
            ctx.drawImage(img, 0, 0);
            processImageForColoring();
        }
        
        updateTransform();

        // Audio autoplay unlock
        document.body.addEventListener('pointerdown', () => {
            if (ambientAudio.paused) ambientAudio.play().catch(() => {});
        }, { once: true });
    };

    // --- Sidebar Toggle ---
    toggleSidebarBtn.addEventListener('click', () => {
        sidebar.classList.toggle('collapsed');
        toggleSidebarBtn.textContent = sidebar.classList.contains('collapsed') ? '›' : '‹';
    });

    // --- Core Smoothing & Outline Algorithm ---
    function processImageForColoring() {
        // Step 1: Create a pre-smoothed version on a temporary canvas
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imageWidth; tempCanvas.height = imageHeight;
        const tempCtx = tempCanvas.getContext('2d');

        // Pre-blur original image to smooth out noise and harsh sharp transitions
        tempCtx.filter = 'blur(3px) contrast(130%)';
        tempCtx.drawImage(img, 0, 0);

        const imageData = tempCtx.getImageData(0, 0, imageWidth, imageHeight);
        const data = imageData.data;
        let paletteSet = new Set();

        // Quantize colors for aesthetic palette grouping
        const levels = 5; 
        const factor = 255 / (levels - 1);
        
        for (let i = 0; i < data.length; i += 4) {
            data[i]     = Math.round(data[i] / factor) * factor;
            data[i + 1] = Math.round(data[i+1] / factor) * factor;
            data[i + 2] = Math.round(data[i+2] / factor) * factor;
            paletteSet.add(`${data[i]},${data[i+1]},${data[i+2]}`);
        }
        
        // Prepare blank canvas for user
        ctx.fillStyle = '#f8f9fa';
        ctx.fillRect(0, 0, imageWidth, imageHeight);

        generatePaletteUI(Array.from(paletteSet));
        generateSmoothOutlines(tempCanvas);
        saveProgress();
    }

    function extractPaletteAndOutlines(sourceImg) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imageWidth; tempCanvas.height = imageHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.filter = 'blur(3px) contrast(130%)';
        tempCtx.drawImage(sourceImg, 0, 0);
        
        const imageData = tempCtx.getImageData(0, 0, imageWidth, imageHeight);
        const data = imageData.data;
        let paletteSet = new Set();
        
        const levels = 5; const factor = 255 / (levels - 1);
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.round(data[i]/factor)*factor;
            data[i+1] = Math.round(data[i+1]/factor)*factor;
            data[i+2] = Math.round(data[i+2]/factor)*factor;
            paletteSet.add(`${data[i]},${data[i+1]},${data[i+2]}`);
        }
        generatePaletteUI(Array.from(paletteSet));
        generateSmoothOutlines(tempCanvas);
    }

    // Smooth Sobel Edge Detector
    function generateSmoothOutlines(sourceCanvas) {
        const tempCtx = sourceCanvas.getContext('2d');
        const imgData = tempCtx.getImageData(0, 0, imageWidth, imageHeight);
        const data = imgData.data;
        
        const outlineData = outlineCtx.createImageData(imageWidth, imageHeight);
        const od = outlineData.data;

        // Sobel kernels for smooth line extraction
        for (let y = 1; y < imageHeight - 1; y++) {
            for (let x = 1; x < imageWidth - 1; x++) {
                const idx = (y * imageWidth + x) * 4;

                let gx = 0, gy = 0;

                for (let ky = -1; ky <= 1; ky++) {
                    for (let kx = -1; kx <= 1; kx++) {
                        const nIdx = ((y + ky) * imageWidth + (x + kx)) * 4;
                        // Luminance gradient
                        const lum = data[nIdx] * 0.299 + data[nIdx+1] * 0.587 + data[nIdx+2] * 0.114;

                        const wx = (kx === 0) ? 0 : (kx * (ky === 0 ? 2 : 1));
                        const wy = (ky === 0) ? 0 : (ky * (kx === 0 ? 2 : 1));

                        gx += lum * wx;
                        gy += lum * wy;
                    }
                }

                const magnitude = Math.sqrt(gx * gx + gy * gy);

                if (magnitude > 70) {
                    od[idx] = 20;     // Soft charcoal black
                    od[idx+1] = 20;
                    od[idx+2] = 20;
                    // Anti-aliased opacity based on magnitude
                    od[idx+3] = Math.min(255, Math.floor(magnitude * 1.8)); 
                } else {
                    od[idx+3] = 0; // Transparent
                }
            }
        }
        outlineCtx.putImageData(outlineData, 0, 0);
    }

    // --- UI Helpers & Palette ---
    function generatePaletteUI(colors) {
        paletteContainer.innerHTML = '';
        colors.forEach((cStr, index) => {
            const swatch = document.createElement('div');
            swatch.className = 'color-swatch';
            swatch.style.backgroundColor = `rgb(${cStr})`;
            if(index === 0) {
                swatch.classList.add('active');
                activeColor = cStr.split(',').map(Number).concat([255]);
            }
            swatch.addEventListener('click', () => {
                document.querySelectorAll('.color-swatch').forEach(el => el.classList.remove('active'));
                swatch.classList.add('active');
                activeColor = cStr.split(',').map(Number).concat([255]);
            });
            paletteContainer.appendChild(swatch);
        });
    }

    outlineToggle.addEventListener('change', (e) => {
        outlineCanvas.style.display = e.target.checked ? 'block' : 'none';
    });

    document.querySelectorAll('input[name="colorMode"]').forEach(radio => {
        radio.addEventListener('change', (e) => { colorMode = e.target.value; });
    });

    backBtn.addEventListener('click', () => { saveProgress(); window.location.href = 'index.html'; });
    saveBtn.addEventListener('click', saveProgress);

    function saveProgress() {
        projectData.progress = coloringCanvas.toDataURL('image/png');
        localStorage.setItem(currentProjectId, JSON.stringify(projectData));
    }
    setInterval(saveProgress, 30000);

    function playPaintSound() {
        if (!brushAudio.paused) brushAudio.currentTime = 0;
        else brushAudio.play().catch(() => {});
    }

    // --- Viewport Transform Math (Pan, Zoom, Rotate) ---
    function updateTransform() {
        transformLayer.style.transform = `translate3d(${transform.tx}px, ${transform.ty}px, 0px) scale(${transform.scale}) rotate(${transform.rotation}deg)`;
    }

    reorientBtn.addEventListener('click', () => {
        transform = { scale: 1, tx: 0, ty: 0, rotation: 0 };
        updateTransform();
    });

    // Screen-to-Canvas Coordinate Matrix Inversion
    function screenToCanvasCoords(screenX, screenY) {
        const rect = viewport.getBoundingClientRect();
        const cx = rect.left + rect.width / 2 + transform.tx;
        const cy = rect.top + rect.height / 2 + transform.ty;

        let dx = screenX - cx;
        let dy = screenY - cy;

        // Reverse rotation
        const rad = -transform.rotation * Math.PI / 180;
        const rx = dx * Math.cos(rad) - dy * Math.sin(rad);
        const ry = dx * Math.sin(rad) + dy * Math.cos(rad);

        // Reverse scale
        const unscaledX = rx / transform.scale;
        const unscaledY = ry / transform.scale;

        // Offset to canvas pixel bounds
        return {
            x: Math.floor(unscaledX + imageWidth / 2),
            y: Math.floor(unscaledY + imageHeight / 2)
        };
    }

    // --- Touch Gestures (2-Finger Zoom, Pan, Rotate) & Paint Handlers ---
    function getTouchDistance(t1, t2) {
        return Math.hypot(t2.clientX - t1.clientX, t2.clientY - t1.clientY);
    }

    function getTouchAngle(t1, t2) {
        return Math.atan2(t2.clientY - t1.clientY, t2.clientX - t1.clientX) * 180 / Math.PI;
    }

    function getTouchCenter(t1, t2) {
        return { x: (t1.clientX + t2.clientX) / 2, y: (t1.clientY + t2.clientY) / 2 };
    }

    viewport.addEventListener('touchstart', (e) => {
        if (e.touches.length === 2) {
            // 2 Finger gesture start
            isPainting = false;
            const t1 = e.touches[0], t2 = e.touches[1];
            gestureState.startDist = getTouchDistance(t1, t2);
            gestureState.startAngle = getTouchAngle(t1, t2);
            gestureState.startScale = transform.scale;
            gestureState.startRotation = transform.rotation;
            gestureState.startTx = transform.tx;
            gestureState.startTy = transform.ty;
            gestureState.center = getTouchCenter(t1, t2);
        } else if (e.touches.length === 1) {
            // 1 Finger interaction (paint/fill)
            const coords = screenToCanvasCoords(e.touches[0].clientX, e.touches[0].clientY);
            handleCanvasPointerStart(coords.x, coords.y);
        }
    }, { passive: false });

    viewport.addEventListener('touchmove', (e) => {
        if (e.touches.length === 2) {
            e.preventDefault(); // Stop native viewport scrolling
            const t1 = e.touches[0], t2 = e.touches[1];
            
            // Zoom
            const dist = getTouchDistance(t1, t2);
            const scaleFactor = dist / gestureState.startDist;
            transform.scale = Math.max(0.2, Math.min(6, gestureState.startScale * scaleFactor));

            // Rotation / Reorient
            const angle = getTouchAngle(t1, t2);
            transform.rotation = gestureState.startRotation + (angle - gestureState.startAngle);

            // Pan / Drag
            const currentCenter = getTouchCenter(t1, t2);
            transform.tx = gestureState.startTx + (currentCenter.x - gestureState.center.x);
            transform.ty = gestureState.startTy + (currentCenter.y - gestureState.center.y);

            updateTransform();
        } else if (e.touches.length === 1 && isPainting) {
            const coords = screenToCanvasCoords(e.touches[0].clientX, e.touches[0].clientY);
            paint(coords.x, coords.y);
        }
    }, { passive: false });

    viewport.addEventListener('touchend', (e) => {
        if (e.touches.length < 2 && isPainting) {
            isPainting = false;
            saveProgress();
        }
    });

    // --- Mouse Controls (Desktop Fallback) ---
    viewport.addEventListener('wheel', (e) => {
        e.preventDefault();
        const zoomFactor = e.deltaY < 0 ? 1.1 : 0.9;
        transform.scale = Math.max(0.2, Math.min(6, transform.scale * zoomFactor));
        updateTransform();
    }, { passive: false });

    viewport.addEventListener('mousedown', (e) => {
        if (e.button === 0) { // Left click
            const coords = screenToCanvasCoords(e.clientX, e.clientY);
            handleCanvasPointerStart(coords.x, coords.y);
        }
    });

    viewport.addEventListener('mousemove', (e) => {
        if (isPainting && colorMode === 'paint') {
            const coords = screenToCanvasCoords(e.clientX, e.clientY);
            paint(coords.x, coords.y);
        }
    });

    window.addEventListener('mouseup', () => {
        if (isPainting) {
            isPainting = false;
            saveProgress();
        }
    });

    // Handle Start Interaction
    function handleCanvasPointerStart(x, y) {
        if (x < 0 || x >= imageWidth || y < 0 || y >= imageHeight) return;
        
        if (colorMode === 'tap') {
            floodFill(x, y, activeColor);
            playPaintSound();
            saveProgress();
        } else if (colorMode === 'paint') {
            isPainting = true;
            paint(x, y);
            playPaintSound();
        }
    }

    // --- Painting & Flood Fill Tools ---
    function paint(x, y) {
        ctx.fillStyle = `rgb(${activeColor[0]}, ${activeColor[1]}, ${activeColor[2]})`;
        ctx.beginPath();
        ctx.arc(x, y, 12, 0, Math.PI * 2);
        ctx.fill();
    }

    function floodFill(startX, startY, fillColor) {
        const imgData = ctx.getImageData(0, 0, imageWidth, imageHeight);
        const data = imgData.data;
        const startPos = (startY * imageWidth + startX) * 4;
        const startColor = [data[startPos], data[startPos+1], data[startPos+2], data[startPos+3]];
        
        if (startColor[0] === fillColor[0] && startColor[1] === fillColor[1] && 
            startColor[2] === fillColor[2] && startColor[3] === fillColor[3]) return;

        const pixelStack = [[startX, startY]];
        
        function matchStartColor(pos) {
            return data[pos] === startColor[0] && data[pos+1] === startColor[1] &&
                   data[pos+2] === startColor[2] && data[pos+3] === startColor[3];
        }

        function colorPixel(pos) {
            data[pos] = fillColor[0];
            data[pos+1] = fillColor[1];
            data[pos+2] = fillColor[2];
            data[pos+3] = fillColor[3];
        }

        while (pixelStack.length) {
            const newPos = pixelStack.pop();
            const x = newPos[0];
            let y = newPos[1];
            let pos = (y * imageWidth + x) * 4;

            while (y-- >= 0 && matchStartColor(pos)) { pos -= imageWidth * 4; }
            pos += imageWidth * 4;
            y++;

            let reachLeft = false;
            let reachRight = false;

            while (y++ < imageHeight - 1 && matchStartColor(pos)) {
                colorPixel(pos);

                if (x > 0) {
                    if (matchStartColor(pos - 4)) {
                        if (!reachLeft) {
                            pixelStack.push([x - 1, y]);
                            reachLeft = true;
                        }
                    } else if (reachLeft) { reachLeft = false; }
                }

                if (x < imageWidth - 1) {
                    if (matchStartColor(pos + 4)) {
                        if (!reachRight) {
                            pixelStack.push([x + 1, y]);
                            reachRight = true;
                        }
                    } else if (reachRight) { reachRight = false; }
                }
                pos += imageWidth * 4;
            }
        }
        ctx.putImageData(imgData, 0, 0);
    }
});
