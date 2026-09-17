/**
 * Zen Scratch Color - Application Core (Safari & PWA Optimized)
 */

const state = {
  projects: [],
  currentProject: null,
  coloringMode: 'paint',
  selectedColorHex: null,
  brushSize: 30,
  showOutlines: true,
  transform: { x: 0, y: 0, scale: 1, rotation: 0 },
  touches: [],
  initialTouchDist: 0,
  initialTouchAngle: 0,
  isPainting: false,
  audioUnlocked: false
};

const DOM = {
  viewGallery: document.getElementById('view-gallery'),
  viewStudio: document.getElementById('view-studio'),
  galleryGrid: document.getElementById('gallery-grid'),
  galleryEmpty: document.getElementById('gallery-empty-state'),
  uploadInput: document.getElementById('image-upload-input'),
  uploadLabel: document.getElementById('upload-label'),
  btnBackGallery: document.getElementById('btn-back-gallery'),
  btnToggleSidebar: document.getElementById('btn-toggle-sidebar'),
  btnCloseSidebar: document.getElementById('btn-close-sidebar'),
  sidebar: document.getElementById('sidebar'),
  viewport: document.getElementById('viewport'),
  canvasWrapper: document.getElementById('canvas-wrapper'),
  layerColor: document.getElementById('layer-color'),
  layerScratch: document.getElementById('layer-scratch'),
  layerOutline: document.getElementById('layer-outline'),
  toggleOutlines: document.getElementById('toggle-outlines'),
  modePaint: document.getElementById('mode-paint'),
  modeTap: document.getElementById('mode-tap'),
  paletteContainer: document.getElementById('palette-container'),
  brushSizeInput: document.getElementById('brush-size'),
  audioAmbient: document.getElementById('audio-ambient'),
  audioPaint: document.getElementById('audio-paint'),
  toggleAmbient: document.getElementById('toggle-ambient-audio'),
  toggleSFX: document.getElementById('toggle-sfx-audio')
};

window.addEventListener('DOMContentLoaded', () => {
  loadProjectsFromStorage();
  setupEventListeners();
  renderGallery();
});

function loadProjectsFromStorage() {
  const data = localStorage.getItem('zen_scratch_projects');
  state.projects = data ? JSON.parse(data) : [];
}

function saveProjectsToStorage() {
  try {
    localStorage.setItem('zen_scratch_projects', JSON.stringify(state.projects));
  } catch (e) {
    console.warn('LocalStorage quota exceeded! Compressing older works...', e);
  }
}

function compressImage(img, maxDimension = 800, quality = 0.75) {
  const canvas = document.createElement('canvas');
  // Fallback to strict dimensions if naturalWidth isn't ready
  let width = img.naturalWidth || img.width || 800;
  let height = img.naturalHeight || img.height || 800;

  if (width > maxDimension || height > maxDimension) {
    if (width > height) {
      height = Math.round((height * maxDimension) / width);
      width = maxDimension;
    } else {
      width = Math.round((width * maxDimension) / height);
      height = maxDimension;
    }
  }

  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  ctx.drawImage(img, 0, 0, width, height);
  return {
    dataUrl: canvas.toDataURL('image/jpeg', quality),
    width,
    height
  };
}

function processImageToProject(imgElement) {
  const compressed = compressImage(imgElement);
  const tempCanvas = document.createElement('canvas');
  tempCanvas.width = compressed.width;
  tempCanvas.height = compressed.height;
  const ctx = tempCanvas.getContext('2d', { willReadFrequently: true });
  
  const tempImg = new Image();
  tempImg.src = compressed.dataUrl;
  
  return new Promise((resolve) => {
    tempImg.onload = () => {
      ctx.drawImage(tempImg, 0, 0);
      const imgData = ctx.getImageData(0, 0, tempCanvas.width, tempCanvas.height);
      
      const palette = extractColorPalette(imgData.data, 12);
      const quantizedData = ctx.createImageData(compressed.width, compressed.height);
      applyPaletteToImageData(imgData.data, quantizedData.data, palette);
      ctx.putImageData(quantizedData, 0, 0);
      
      const outlineDataUrl = generateSmoothOutlines(quantizedData, compressed.width, compressed.height);

      resolve({
        id: 'proj_' + Date.now(),
        title: 'Canvas ' + (state.projects.length + 1),
        width: compressed.width,
        height: compressed.height,
        colorImgUrl: tempCanvas.toDataURL('image/png'),
        outlineImgUrl: outlineDataUrl,
        scratchMaskUrl: null,
        palette: palette,
        progress: 0,
        createdAt: new Date().toISOString()
      });
    };
  });
}

function extractColorPalette(data, maxColors = 12) {
  const colorMap = {};
  for (let i = 0; i < data.length; i += 16) { 
    const r = Math.round(data[i] / 32) * 32;
    const g = Math.round(data[i+1] / 32) * 32;
    const b = Math.round(data[i+2] / 32) * 32;
    const hex = `#${((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1)}`;
    colorMap[hex] = (colorMap[hex] || 0) + 1;
  }
  return Object.keys(colorMap).sort((a, b) => colorMap[b] - colorMap[a]).slice(0, maxColors);
}

function applyPaletteToImageData(src, dest, palette) {
  const paletteRgb = palette.map(hexToRgb);
  for (let i = 0; i < src.length; i += 4) {
    const r = src[i], g = src[i+1], b = src[i+2];
    let closest = paletteRgb[0];
    let minDistance = Infinity;

    for (let p of paletteRgb) {
      const dist = Math.hypot(r - p.r, g - p.g, b - p.b);
      if (dist < minDistance) {
        minDistance = dist;
        closest = p;
      }
    }
    dest[i] = closest.r;
    dest[i+1] = closest.g;
    dest[i+2] = closest.b;
    dest[i+3] = 255;
  }
}

function generateSmoothOutlines(imgData, width, height) {
  const canvas = document.createElement('canvas');
  canvas.width = width;
  canvas.height = height;
  const ctx = canvas.getContext('2d');
  
  const outlines = ctx.createImageData(width, height);
  const src = imgData.data;
  const dest = outlines.data;

  for (let y = 1; y < height - 1; y++) {
    for (let x = 1; x < width - 1; x++) {
      const idx = (y * width + x) * 4;
      const rightIdx = (y * width + (x + 1)) * 4;
      const bottomIdx = ((y + 1) * width + x) * 4;

      const diffRight = Math.abs(src[idx] - src[rightIdx]) + Math.abs(src[idx+1] - src[rightIdx+1]) + Math.abs(src[idx+2] - src[rightIdx+2]);
      const diffBottom = Math.abs(src[idx] - src[bottomIdx]) + Math.abs(src[idx+1] - src[bottomIdx+1]) + Math.abs(src[idx+2] - src[bottomIdx+2]);

      if (diffRight > 30 || diffBottom > 30) {
        dest[idx] = 30;      
        dest[idx+1] = 30;    
        dest[idx+2] = 35;    
        dest[idx+3] = 220;   
      } else {
        dest[idx+3] = 0;     
      }
    }
  }

  ctx.putImageData(outlines, 0, 0);
  return canvas.toDataURL('image/png');
}

function hexToRgb(hex) {
  const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
  return result ? {
    r: parseInt(result[1], 16),
    g: parseInt(result[2], 16),
    b: parseInt(result[3], 16)
  } : { r: 0, g: 0, b: 0 };
}

function openStudio(project) {
  state.currentProject = project;
  DOM.viewGallery.classList.add('view-hidden');
  DOM.viewStudio.classList.remove('view-hidden');
  DOM.btnBackGallery.classList.remove('hidden');
  DOM.btnToggleSidebar.classList.remove('hidden');
  DOM.uploadLabel.classList.add('hidden');

  setupCanvases(project);
  renderPalette(project.palette);
  resetViewportTransform();
  
  if (DOM.toggleAmbient.checked && state.audioUnlocked) {
    DOM.audioAmbient.play().catch(() => {});
  }
}

function setupCanvases(project) {
  const { width, height } = project;
  
  [DOM.layerColor, DOM.layerScratch, DOM.layerOutline].forEach(canvas => {
    canvas.width = width;
    canvas.height = height;
  });

  DOM.canvasWrapper.style.width = width + 'px';
  DOM.canvasWrapper.style.height = height + 'px';

  const ctxColor = DOM.layerColor.getContext('2d');
  const ctxScratch = DOM.layerScratch.getContext('2d', { willReadFrequently: true });
  const ctxOutline = DOM.layerOutline.getContext('2d');

  const imgColor = new Image();
  imgColor.src = project.colorImgUrl;
  imgColor.onload = () => ctxColor.drawImage(imgColor, 0, 0);

  if (project.scratchMaskUrl) {
    const imgScratch = new Image();
    imgScratch.src = project.scratchMaskUrl;
    imgScratch.onload = () => ctxScratch.drawImage(imgScratch, 0, 0);
  } else {
    ctxScratch.fillStyle = '#ffffff';
    ctxScratch.fillRect(0, 0, width, height);
  }

  const imgOutline = new Image();
  imgOutline.src = project.outlineImgUrl;
  imgOutline.onload = () => ctxOutline.drawImage(imgOutline, 0, 0);
}

function setupEventListeners() {
  // Safari FileReader Fix for local uploads
  DOM.uploadInput.addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    
    const reader = new FileReader();
    reader.onload = (event) => {
      const img = new Image();
      img.onload = async () => {
        const project = await processImageToProject(img);
        state.projects.unshift(project);
        saveProjectsToStorage();
        openStudio(project);
      };
      img.src = event.target.result;
    };
    reader.readAsDataURL(file);
  });

  // Browser Audio Unlocker
  document.body.addEventListener('touchstart', () => {
    if (!state.audioUnlocked) {
      state.audioUnlocked = true;
      if (DOM.toggleAmbient.checked) DOM.audioAmbient.play().catch(() => {});
    }
  }, { once: true });
  
  document.body.addEventListener('mousedown', () => {
    if (!state.audioUnlocked) {
      state.audioUnlocked = true;
      if (DOM.toggleAmbient.checked) DOM.audioAmbient.play().catch(() => {});
    }
  }, { once: true });

  DOM.btnBackGallery.addEventListener('click', exitStudio);
  DOM.btnToggleSidebar.addEventListener('click', () => DOM.sidebar.classList.toggle('open'));
  DOM.btnCloseSidebar.addEventListener('click', () => DOM.sidebar.classList.remove('open'));
  DOM.modePaint.addEventListener('click', () => setMode('paint'));
  DOM.modeTap.addEventListener('click', () => setMode('tap'));
  DOM.toggleOutlines.addEventListener('change', (e) => {
    state.showOutlines = e.target.checked;
    DOM.layerOutline.style.display = state.showOutlines ? 'block' : 'none';
  });
  DOM.brushSizeInput.addEventListener('input', (e) => state.brushSize = parseInt(e.target.value));
  DOM.toggleAmbient.addEventListener('change', (e) => {
    if (e.target.checked) DOM.audioAmbient.play().catch(() => {});
    else DOM.audioAmbient.pause();
  });

  const vp = DOM.viewport;
  vp.addEventListener('touchstart', handleTouchStart, { passive: false });
  vp.addEventListener('touchmove', handleTouchMove, { passive: false });
  vp.addEventListener('touchend', handleTouchEnd);
  vp.addEventListener('mousedown', handleMouseDown);
  vp.addEventListener('mousemove', handleMouseMove);
  window.addEventListener('mouseup', handleMouseUp);
}

function scratchAt(canvasX, canvasY) {
  const ctx = DOM.layerScratch.getContext('2d');
  ctx.globalCompositeOperation = 'destination-out'; 
  
  if (state.coloringMode === 'paint') {
    ctx.beginPath();
    ctx.arc(canvasX, canvasY, state.brushSize / 2, 0, Math.PI * 2);
    ctx.fill();

    if (DOM.toggleSFX.checked && DOM.audioPaint.paused && state.audioUnlocked) {
      DOM.audioPaint.currentTime = 0;
      DOM.audioPaint.play().catch(() => {});
    }
  } else if (state.coloringMode === 'tap') {
    ctx.beginPath();
    ctx.arc(canvasX, canvasY, 60, 0, Math.PI * 2);
    ctx.fill();
  }
}

function getCanvasCoords(clientX, clientY) {
  const rect = DOM.canvasWrapper.getBoundingClientRect();
  if (!rect.width) return { x: 0, y: 0 };
  const scale = rect.width / state.currentProject.width;
  return {
    x: (clientX - rect.left) / scale,
    y: (clientY - rect.top) / scale
  };
}

function handleTouchStart(e) {
  if (e.target.closest('.sidebar') || e.target.closest('.app-header')) return;
  e.preventDefault();
  state.touches = Array.from(e.touches);

  if (state.touches.length === 1) {
    state.isPainting = true;
    const { x, y } = getCanvasCoords(state.touches[0].clientX, state.touches[0].clientY);
    scratchAt(x, y);
  } else if (state.touches.length === 2) {
    state.isPainting = false;
    state.initialTouchDist = getTouchDistance(state.touches);
    state.initialTouchAngle = getTouchAngle(state.touches);
  }
}

function handleTouchMove(e) {
  if (e.target.closest('.sidebar') || e.target.closest('.app-header')) return;
  e.preventDefault();
  const touches = Array.from(e.touches);

  if (touches.length === 1 && state.isPainting) {
    const { x, y } = getCanvasCoords(touches[0].clientX, touches[0].clientY);
    scratchAt(x, y);
  } else if (touches.length === 2) {
    const currentDist = getTouchDistance(touches);
    const currentAngle = getTouchAngle(touches);
    
    const scaleFactor = currentDist / state.initialTouchDist;
    state.transform.scale = Math.min(Math.max(0.5, state.transform.scale * scaleFactor), 4);
    state.transform.rotation += (currentAngle - state.initialTouchAngle);

    state.initialTouchDist = currentDist;
    state.initialTouchAngle = currentAngle;
    
    updateViewportTransform();
  }
}

function handleTouchEnd(e) {
  if (state.isPainting) {
    state.isPainting = false;
    autoSaveProgress();
  }
  state.touches = Array.from(e.touches);
}

function handleMouseDown(e) {
  if (e.button !== 0 || e.target.closest('.sidebar') || e.target.closest('.app-header')) return;
  state.isPainting = true;
  const { x, y } = getCanvasCoords(e.clientX, e.clientY);
  scratchAt(x, y);
}

function handleMouseMove(e) {
  if (!state.isPainting) return;
  const { x, y } = getCanvasCoords(e.clientX, e.clientY);
  scratchAt(x, y);
}

function handleMouseUp() {
  if (state.isPainting) {
    state.isPainting = false;
    autoSaveProgress();
  }
}

function getTouchDistance(touches) {
  return Math.hypot(touches[0].clientX - touches[1].clientX, touches[0].clientY - touches[1].clientY);
}

function getTouchAngle(touches) {
  return Math.atan2(touches[1].clientY - touches[0].clientY, touches[1].clientX - touches[0].clientX) * (180 / Math.PI);
}

function updateViewportTransform() {
  const { x, y, scale, rotation } = state.transform;
  DOM.canvasWrapper.style.transform = `translate(-50%, -50%) translate(${x}px, ${y}px) scale(${scale}) rotate(${rotation}deg)`;
}

function resetViewportTransform() {
  state.transform = { x: 0, y: 0, scale: 1, rotation: 0 };
  updateViewportTransform();
}

function autoSaveProgress() {
  if (!state.currentProject) return;

  const scratchCanvas = DOM.layerScratch;
  state.currentProject.scratchMaskUrl = scratchCanvas.toDataURL('image/png');

  const ctx = scratchCanvas.getContext('2d');
  const imgData = ctx.getImageData(0, 0, scratchCanvas.width, scratchCanvas.height).data;
  let revealedPixels = 0;
  for (let i = 3; i < imgData.length; i += 16) {
    if (imgData[i] < 128) revealedPixels++;
  }
  
  state.currentProject.progress = Math.round((revealedPixels / (imgData.length / 16)) * 100);

  const index = state.projects.findIndex(p => p.id === state.currentProject.id);
  if (index !== -1) state.projects[index] = state.currentProject;
  saveProjectsToStorage();
}

function setMode(mode) {
  state.coloringMode = mode;
  DOM.modePaint.classList.toggle('active', mode === 'paint');
  DOM.modeTap.classList.toggle('active', mode === 'tap');
}

function renderPalette(palette) {
  DOM.paletteContainer.innerHTML = '';
  palette.forEach((hex, idx) => {
    const swatch = document.createElement('div');
    swatch.className = 'color-swatch' + (idx === 0 ? ' selected' : '');
    swatch.style.backgroundColor = hex;
    swatch.innerText = idx + 1;
    swatch.addEventListener('click', () => {
      document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('selected'));
      swatch.classList.add('selected');
      state.selectedColorHex = hex;
    });
    DOM.paletteContainer.appendChild(swatch);
  });
}

function renderGallery() {
  DOM.galleryGrid.innerHTML = '';
  if (state.projects.length === 0) {
    DOM.galleryEmpty.classList.remove('hidden');
    return;
  }
  DOM.galleryEmpty.classList.add('hidden');

  state.projects.forEach(project => {
    const card = document.createElement('div');
    card.className = 'gallery-card';
    card.innerHTML = `
      <img src="${project.scratchMaskUrl || project.colorImgUrl}" alt="${project.title}">
      <div class="gallery-card-info">
        <h3>${project.title}</h3>
        <p style="font-size: 0.8rem; color: var(--text-muted);">${project.progress}% Scratch Revealed</p>
        <div class="progress-bar">
          <div class="progress-fill" style="width: ${project.progress}%"></div>
        </div>
      </div>
    `;
    card.addEventListener('click', () => openStudio(project));
    DOM.galleryGrid.appendChild(card);
  });
}

function exitStudio() {
  DOM.audioAmbient.pause();
  DOM.viewStudio.classList.add('view-hidden');
  DOM.viewGallery.classList.remove('view-hidden');
  DOM.btnBackGallery.classList.add('hidden');
  DOM.btnToggleSidebar.classList.add('hidden');
  DOM.uploadLabel.classList.remove('hidden');
  DOM.sidebar.classList.remove('open');
  renderGallery();
}
