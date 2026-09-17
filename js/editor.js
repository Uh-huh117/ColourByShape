document.addEventListener('DOMContentLoaded', () => {
    const coloringCanvas = document.getElementById('coloringCanvas');
    const outlineCanvas = document.getElementById('outlineCanvas');
    const ctx = coloringCanvas.getContext('2d', { willReadFrequently: true });
    const outlineCtx = outlineCanvas.getContext('2d', { willReadFrequently: true });
    
    // UI Elements
    const outlineToggle = document.getElementById('toggleOutline');
    const paletteContainer = document.getElementById('paletteContainer');
    const backBtn = document.getElementById('backBtn');
    const saveBtn = document.getElementById('saveBtn');
    
    // Audio
    const ambientAudio = document.getElementById('ambientAudio');
    const brushAudio = document.getElementById('brushAudio');

    // State variables
    let currentProjectId = localStorage.getItem('currentProject');
    let projectData = JSON.parse(localStorage.getItem(currentProjectId));
    let activeColor = [0, 0, 0, 255]; 
    let isPainting = false;
    let colorMode = 'tap'; // 'tap' or 'paint'
    let imageWidth, imageHeight;

    // Load Project
    if (!projectData) {
        window.location.href = 'index.html';
        return;
    }

    const img = new Image();
    img.src = projectData.original;
    img.onload = () => {
        imageWidth = coloringCanvas.width = outlineCanvas.width = img.width;
        imageHeight = coloringCanvas.height = outlineCanvas.height = img.height;
        
        // If there's saved progress, load it, otherwise process the original
        if (projectData.progress) {
            const progImg = new Image();
            progImg.src = projectData.progress;
            progImg.onload = () => {
                ctx.drawImage(progImg, 0, 0);
                extractPaletteAndOutlines(img); // Still need original for outlines/palette
            }
        } else {
            ctx.drawImage(img, 0, 0);
            processImageForColoring();
        }
        
        // Start ambient music on first interaction
        document.body.addEventListener('click', () => {
            if (ambientAudio.paused) ambientAudio.play().catch(e => console.log("Audio play blocked by browser."));
        }, { once: true });
    };

    // --- Core Algorithm: Group Colors & Create Outlines ---
    function processImageForColoring() {
        const imageData = ctx.getImageData(0, 0, imageWidth, imageHeight);
        const data = imageData.data;
        let paletteSet = new Set();

        // 1. Posterize (Quantize colors to group aesthetically)
        const levels = 4; // Adjust for more/less shapes
        const factor = 255 / (levels - 1);
        
        for (let i = 0; i < data.length; i += 4) {
            data[i]     = Math.round(data[i] / factor) * factor;   // R
            data[i + 1] = Math.round(data[i+1] / factor) * factor; // G
            data[i + 2] = Math.round(data[i+2] / factor) * factor; // B
            
            const colorStr = `${data[i]},${data[i+1]},${data[i+2]}`;
            paletteSet.add(colorStr);
        }
        
        // Make the initial canvas blank for the user to color in (or grayscale)
        ctx.fillStyle = '#f0f0f0';
        ctx.fillRect(0, 0, imageWidth, imageHeight);

        generatePaletteUI(Array.from(paletteSet));
        generateOutlines(data);
        saveProgress();
    }

    // Helper for loading progress to extract outlines without overwriting canvas
    function extractPaletteAndOutlines(sourceImg) {
        const tempCanvas = document.createElement('canvas');
        tempCanvas.width = imageWidth; tempCanvas.height = imageHeight;
        const tempCtx = tempCanvas.getContext('2d');
        tempCtx.drawImage(sourceImg, 0, 0);
        
        const imageData = tempCtx.getImageData(0, 0, imageWidth, imageHeight);
        const data = imageData.data;
        let paletteSet = new Set();
        
        const levels = 4; const factor = 255 / (levels - 1);
        for (let i = 0; i < data.length; i += 4) {
            data[i] = Math.round(data[i]/factor)*factor;
            data[i+1] = Math.round(data[i+1]/factor)*factor;
            data[i+2] = Math.round(data[i+2]/factor)*factor;
            paletteSet.add(`${data[i]},${data[i+1]},${data[i+2]}`);
        }
        generatePaletteUI(Array.from(paletteSet));
        generateOutlines(data);
    }

    // 2. Edge Detection (Black outlines based on color grouping boundaries)
    function generateOutlines(quantizedData) {
        const outlineData = outlineCtx.createImageData(imageWidth, imageHeight);
        const od = outlineData.data;

        for (let y = 0; y < imageHeight; y++) {
            for (let x = 0; x < imageWidth; x++) {
                const idx = (y * imageWidth + x) * 4;
                let isEdge = false;

                if (x < imageWidth - 1 && y < imageHeight - 1) {
                    const rightIdx = (y * imageWidth + (x + 1)) * 4;
                    const bottomIdx = ((y + 1) * imageWidth + x) * 4;

                    // Compare with right and bottom pixel
                    if (quantizedData[idx] !== quantizedData[rightIdx] || 
                        quantizedData[idx] !== quantizedData[bottomIdx]) {
                        isEdge = true;
                    }
                }

                if (isEdge) {
                    od[idx] = od[idx+1] = od[idx+2] = 0; // Black
                    od[idx+3] = 255; // Alpha
                } else {
                    od[idx+3] = 0; // Transparent
                }
            }
        }
        outlineCtx.putImageData(outlineData, 0, 0);
    }

    // --- UI Interactions ---
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

    backBtn.addEventListener('click', () => {
        saveProgress();
        window.location.href = 'index.html';
    });
    
    saveBtn.addEventListener('click', saveProgress);

    // --- Auto-Save & Sound ---
    function saveProgress() {
        projectData.progress = coloringCanvas.toDataURL('image/png');
        localStorage.setItem(currentProjectId, JSON.stringify(projectData));
    }

    // Auto-save every 30 seconds
    setInterval(saveProgress, 30000);

    function playPaintSound() {
        if (!brushAudio.paused) {
            brushAudio.currentTime = 0;
        } else {
            brushAudio.play().catch(e => console.log("Audio blocked"));
        }
    }

    // --- Interaction / Coloring Logic ---
    function getCanvasCoords(e) {
        const rect = coloringCanvas.getBoundingClientRect();
        const scaleX = coloringCanvas.width / rect.width;
        const scaleY = coloringCanvas.height / rect.height;
        return {
            x: Math.floor((e.clientX - rect.left) * scaleX),
            y: Math.floor((e.clientY - rect.top) * scaleY)
        };
    }

    outlineCanvas.addEventListener('mousedown', (e) => {
        const {x, y} = getCanvasCoords(e);
        if (colorMode === 'tap') {
            floodFill(x, y, activeColor);
            playPaintSound();
            saveProgress();
        } else if (colorMode === 'paint') {
            isPainting = true;
            paint(x, y);
            playPaintSound();
        }
    });

    outlineCanvas.addEventListener('mousemove', (e) => {
        if (!isPainting || colorMode !== 'paint') return;
        const {x, y} = getCanvasCoords(e);
        paint(x, y);
    });

    outlineCanvas.addEventListener('mouseup', () => { 
        isPainting = false; 
        if (colorMode === 'paint') saveProgress();
    });
    
    outlineCanvas.addEventListener('mouseleave', () => { isPainting = false; });

    // Paint Mode: Manual Brushing
    function paint(x, y) {
        ctx.fillStyle = `rgb(${activeColor[0]}, ${activeColor[1]}, ${activeColor[2]})`;
        ctx.beginPath();
        ctx.arc(x, y, 15, 0, Math.PI * 2);
        ctx.fill();
    }

    // Tap Mode: Flood Fill Algorithm
    function floodFill(startX, startY, fillColor) {
        const imgData = ctx.getImageData(0, 0, imageWidth, imageHeight);
        const data = imgData.data;
        const startPos = (startY * imageWidth + startX) * 4;
        const startColor = [data[startPos], data[startPos+1], data[startPos+2], data[startPos+3]];
        
        // If clicking on same color, do nothing
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

            // Go up as long as color matches
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
