// app.js - Main Frontend Logic (Redesigned with text selection, merged toolbars, and scroll-preserved zoom)

// Configure PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = '../node_modules/pdfjs-dist/build/pdf.worker.min.js';

// State
let openDocs = [];
let activeDocId = null;
let currentTool = 'select'; // Default selection mode
let currentColor = '#3b82f6';
let currentThickness = 3;
let zoomLevel = 1.5; // Default 150%
let laserTrailDuration = 800; // Default 800ms
let savedBeforeRightClickTool = null;
let laserTrailPoints = []; // [{ x, y, time, pageNum }]
let laserLoopRunning = false;
function addLaserPoint(x, y) {
  const MAX_LASER_POINTS = 500;
  laserTrailPoints.push({ x: x, y: y, time: Date.now() });
  if (laserTrailPoints.length > MAX_LASER_POINTS) {
    laserTrailPoints.splice(0, laserTrailPoints.length - MAX_LASER_POINTS);
  }
}
let currentRenderTaskId = 0;
let lastActivePageNum = 1;
let pageIndicatorShowTimer = null;
let lastMouseX = 0;
let lastMouseY = 0;
let mouseWasInVicinity = false;
let isNavigatingFromIndicator = false;
let lastTimeInVicinity = 0;

// UI elements
const toolBtns = document.querySelectorAll('.tool-btn[data-tool]');
const colorPicker = document.getElementById('color-picker');
const colorSwatches = document.querySelectorAll('.color-swatch');
const thicknessSlider = document.getElementById('thickness-slider');
const thicknessPreview = document.getElementById('thickness-preview');
const thicknessVal = document.getElementById('thickness-val');

// DOM Elements
const tabsContainer = document.getElementById('tabs-container');
const emptyState = document.getElementById('empty-state');
const scrollContainer = document.getElementById('pdf-scroll-container');
const workspace = document.getElementById('workspace');
const laserDot = document.getElementById('laser-dot');
const flashlightOverlay = document.getElementById('global-flashlight-overlay');

// Flags
let isFlashlightActive = false;
let isFlashlightOn = false;
let lastGlobalMousePos = { x: window.innerWidth / 2, y: window.innerHeight / 2 };
let isDrawing = false;
let isErasing = false;
let isLaserActive = false;
let currentPath = null;
let tempShape = null;

// Dragging annotation state variables
let isDraggingAnnotation = false;
let draggedAnnotation = null;
let draggedPageNum = null;
let draggedCanvas = null;
let draggedStartPos = null;
let draggedInitialAnnState = null;
let activeResizeHandle = null; // null, 'move', 'tl', 'tr', 'bl', 'br', 'start', 'end', 'edge'
let selectedTextAnnotation = null;
let selectedTextPageNum = null;
let textFormatInitialState = null;

let appVersion = 'v2.4';

// Initialize UI
async function init() {
  // Load dynamic app version from package.json
  try {
    if (window.api && typeof window.api.getAppVersion === 'function') {
      const fullVer = await window.api.getAppVersion();
      if (fullVer) {
        const parts = fullVer.split('.');
        appVersion = 'v' + parts[0] + '.' + parts[1];
      }
    }
  } catch (e) {
    console.error('Failed to load app version:', e);
  }

  // Initialize Theme
  const themeToggleBtn = document.getElementById('btn-theme-toggle');
  const savedTheme = localStorage.getItem('theme') || 'dark';
  
  if (savedTheme === 'light') {
    document.body.classList.add('light-mode');
    if (themeToggleBtn) {
      themeToggleBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
      themeToggleBtn.setAttribute('title', 'Switch to Dark Theme');
    }
  } else {
    document.body.classList.remove('light-mode');
    if (themeToggleBtn) {
      themeToggleBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
      themeToggleBtn.setAttribute('title', 'Switch to Light Theme');
    }
  }

  if (themeToggleBtn) {
    themeToggleBtn.addEventListener('click', () => {
      const isLight = document.body.classList.toggle('light-mode');
      localStorage.setItem('theme', isLight ? 'light' : 'dark');
      
      if (isLight) {
        themeToggleBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg>';
        themeToggleBtn.setAttribute('title', 'Switch to Dark Theme');
      } else {
        themeToggleBtn.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="5"/><line x1="12" y1="1" x2="12" y2="3"/><line x1="12" y1="21" x2="12" y2="23"/><line x1="4.22" y1="4.22" x2="5.64" y2="5.64"/><line x1="18.36" y1="18.36" x2="19.78" y2="19.78"/><line x1="1" y1="12" x2="3" y2="12"/><line x1="21" y1="12" x2="23" y2="12"/><line x1="4.22" y1="19.78" x2="5.64" y2="18.36"/><line x1="18.36" y1="5.64" x2="19.78" y2="4.22"/></svg>';
        themeToggleBtn.setAttribute('title', 'Switch to Light Theme');
      }
    });
  }

  const shapesDropdown = document.getElementById('shapes-dropdown');
  const shapeItems = shapesDropdown.querySelectorAll('.dropdown-item');
  const shapeActiveIcon = document.getElementById('shape-active-icon');
  const btnShapeSelect = document.getElementById('btn-shape-select');
  const btnShapeArrow = document.getElementById('btn-shape-arrow');

  const colorsDropdown = document.getElementById('colors-dropdown');
  const btnColorSelect = document.getElementById('btn-color-select');
  const btnColorArrow = document.getElementById('btn-color-arrow');

  const laserDropdown = document.getElementById('laser-dropdown');
  const btnLaser = document.getElementById('btn-laser');
  const btnLaserArrow = document.getElementById('btn-laser-arrow');
  const laserDurationSlider = document.getElementById('laser-duration-slider');
  const laserDurationVal = document.getElementById('laser-duration-val');

  const thicknessDropdown = document.getElementById('thickness-dropdown');
  const btnThicknessSelect = document.getElementById('btn-thickness-select');
  const btnThicknessArrow = document.getElementById('btn-thickness-arrow');

  // Bind tool buttons
  toolBtns.forEach(btn => {
    btn.addEventListener('click', () => {
      toolBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      btn.classList.add('active');
      btn.setAttribute('aria-pressed', 'true');
      currentTool = btn.dataset.tool;

      // Deactivate the shape selector trigger button and shape items
      btnShapeSelect.classList.remove('active');
      btnShapeSelect.setAttribute('aria-pressed', 'false');
      shapeItems.forEach(si => si.classList.remove('active'));

      // Close all dropdowns
      shapesDropdown.classList.remove('show');
      colorsDropdown.classList.remove('show');
      laserDropdown.classList.remove('show');
      thicknessDropdown.classList.remove('show');

      updateCursor();
    });
  });

  // Shapes Split Button Click Bindings
  btnShapeSelect.addEventListener('click', (e) => {
    e.stopPropagation();
    
    // Activate the active shape tool
    const activeShapeItem = Array.from(shapeItems).find(si => si.classList.contains('active'));
    currentTool = activeShapeItem ? activeShapeItem.dataset.tool : 'box';
    
    // Deactivate other main tools
    toolBtns.forEach(b => {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    });
    
    btnShapeSelect.classList.add('active');
    btnShapeSelect.setAttribute('aria-pressed', 'true');
    
    // Close all dropdowns
    shapesDropdown.classList.remove('show');
    colorsDropdown.classList.remove('show');
    laserDropdown.classList.remove('show');
    thicknessDropdown.classList.remove('show');
    
    updateCursor();
  });

  btnShapeArrow.addEventListener('click', (e) => {
    e.stopPropagation();
    shapesDropdown.classList.toggle('show');
    colorsDropdown.classList.remove('show');
    laserDropdown.classList.remove('show');
    thicknessDropdown.classList.remove('show');
  });

  shapeItems.forEach(item => {
    item.addEventListener('click', (e) => {
      e.stopPropagation();
      
      shapeItems.forEach(si => si.classList.remove('active'));
      item.classList.add('active');
      
      currentTool = item.dataset.tool;
      
      // Deactivate other main tools
      toolBtns.forEach(b => {
        b.classList.remove('active');
        b.setAttribute('aria-pressed', 'false');
      });
      
      // Activate trigger
      btnShapeSelect.classList.add('active');
      btnShapeSelect.setAttribute('aria-pressed', 'true');
      
      // Copy SVG icon innerHTML to trigger button
      shapeActiveIcon.innerHTML = item.querySelector('svg').innerHTML;
      
      shapesDropdown.classList.remove('show');
      updateCursor();
    });
  });

  // Laser Settings Arrow Click Toggle
  btnLaserArrow.addEventListener('click', (e) => {
    e.stopPropagation();
    laserDropdown.classList.toggle('show');
    shapesDropdown.classList.remove('show');
    colorsDropdown.classList.remove('show');
    thicknessDropdown.classList.remove('show');
  });

  if (laserDurationSlider) {
    laserDurationSlider.addEventListener('input', (e) => {
      laserTrailDuration = parseInt(e.target.value);
      laserDurationVal.innerText = (laserTrailDuration / 1000).toFixed(1) + 's';
    });
  }

  // Colors Split Button Click Bindings
  btnColorSelect.addEventListener('click', (e) => {
    e.stopPropagation();
    
    const drawingTools = ['pen', 'highlighter', 'box', 'circle', 'line', 'arrow', 'text', 'laser'];
    if (!drawingTools.includes(currentTool)) {
      currentTool = 'pen';
    }
    
    // Close all dropdowns
    shapesDropdown.classList.remove('show');
    colorsDropdown.classList.remove('show');
    laserDropdown.classList.remove('show');
    thicknessDropdown.classList.remove('show');
    
    updateCursor();
  });

  btnColorArrow.addEventListener('click', (e) => {
    e.stopPropagation();
    colorsDropdown.classList.toggle('show');
    shapesDropdown.classList.remove('show');
    laserDropdown.classList.remove('show');
    thicknessDropdown.classList.remove('show');
  });

  // Color Swatch Selection
  colorSwatches.forEach(swatch => {
    swatch.addEventListener('click', (e) => {
      e.stopPropagation();
      colorSwatches.forEach(s => s.classList.remove('active'));
      swatch.classList.add('active');
      currentColor = swatch.dataset.color;
      colorPicker.value = currentColor; // Sync native picker
      
      const preview = document.getElementById('color-preview');
      preview.style.backgroundColor = currentColor;
      preview.style.border = (currentColor.toLowerCase() === '#ffffff') ? '1px solid rgba(0, 0, 0, 0.35)' : '1.5px solid #fff';

      const drawingTools = ['pen', 'highlighter', 'box', 'circle', 'line', 'arrow', 'text', 'laser'];
      if (!drawingTools.includes(currentTool)) {
        currentTool = 'pen';
      }
      updateThicknessPreview();
      colorsDropdown.classList.remove('show');
      updateCursor();
    });
  });

  // Custom Color Input Selection
  colorPicker.addEventListener('input', (e) => {
    currentColor = e.target.value;
    colorSwatches.forEach(s => s.classList.remove('active'));
    
    const preview = document.getElementById('color-preview');
    preview.style.backgroundColor = currentColor;
    preview.style.border = (currentColor.toLowerCase() === '#ffffff') ? '1px solid rgba(0, 0, 0, 0.35)' : '1.5px solid #fff';

    const drawingTools = ['pen', 'highlighter', 'box', 'circle', 'line', 'arrow', 'text', 'laser'];
    if (!drawingTools.includes(currentTool)) {
      currentTool = 'pen';
    }
    updateThicknessPreview();
    updateCursor();
  });

  // Thickness Split Button Click Bindings
  btnThicknessSelect.addEventListener('click', (e) => {
    e.stopPropagation();
    
    const drawingTools = ['pen', 'highlighter', 'box', 'circle', 'line', 'arrow', 'text', 'laser'];
    if (!drawingTools.includes(currentTool)) {
      currentTool = 'pen';
    }
    
    // Close all dropdowns
    shapesDropdown.classList.remove('show');
    colorsDropdown.classList.remove('show');
    laserDropdown.classList.remove('show');
    thicknessDropdown.classList.remove('show');
    
    updateCursor();
  });

  btnThicknessArrow.addEventListener('click', (e) => {
    e.stopPropagation();
    thicknessDropdown.classList.toggle('show');
    shapesDropdown.classList.remove('show');
    colorsDropdown.classList.remove('show');
    laserDropdown.classList.remove('show');
  });

  // Close dropdowns on outside click
  document.addEventListener('click', (e) => {
    if (!shapesDropdown.contains(e.target)) {
      shapesDropdown.classList.remove('show');
    }
    if (!colorsDropdown.contains(e.target)) {
      colorsDropdown.classList.remove('show');
    }
    if (laserDropdown && !laserDropdown.contains(e.target)) {
      laserDropdown.classList.remove('show');
    }
    if (thicknessDropdown && !thicknessDropdown.contains(e.target)) {
      thicknessDropdown.classList.remove('show');
    }
  });

  // Thickness slider
  thicknessSlider.addEventListener('input', (e) => {
    currentThickness = parseFloat(e.target.value);
    updateThicknessPreview();
  });

  // Page Navigation Listeners
  const pageInput = document.getElementById('current-page-input');
  const btnPagePrev = document.getElementById('btn-page-prev');
  const btnPageNext = document.getElementById('btn-page-next');

  if (pageInput) {
    const navigateToInputPage = () => {
      const doc = openDocs.find(d => d.id === activeDocId);
      if (!doc) return;
      let pageNum = parseInt(pageInput.value);
      if (isNaN(pageNum)) {
        updateCurrentPageOnScroll();
        return;
      }
      pageNum = Math.max(1, Math.min(doc.pageCount, pageNum));
      pageInput.value = pageNum;
      
      const pageEl = document.querySelector(`.page-container[data-page="${pageNum}"]`);
      if (pageEl) {
        isNavigatingFromIndicator = true;
        scrollContainer.scrollTop = pageEl.offsetTop;
        setTimeout(() => { isNavigatingFromIndicator = false; }, 500);
      }
    };

    pageInput.addEventListener('change', navigateToInputPage);
    pageInput.addEventListener('input', navigateToInputPage);
    pageInput.addEventListener('keydown', (e) => {
      if (e.key === 'Enter') {
        pageInput.blur();
      }
    });
  }

  if (btnPagePrev) {
    btnPagePrev.addEventListener('click', () => {
      const doc = openDocs.find(d => d.id === activeDocId);
      if (!doc) return;
      if (!pageInput) return;
      let pageNum = parseInt(pageInput.value) || 1;
      if (pageNum > 1) {
        pageNum--;
        pageInput.value = pageNum;
        const pageEl = document.querySelector(`.page-container[data-page="${pageNum}"]`);
        if (pageEl) {
          isNavigatingFromIndicator = true;
          scrollContainer.scrollTop = pageEl.offsetTop;
          setTimeout(() => { isNavigatingFromIndicator = false; }, 500);
        }
      }
    });
  }

  if (btnPageNext) {
    btnPageNext.addEventListener('click', () => {
      const doc = openDocs.find(d => d.id === activeDocId);
      if (!doc) return;
      if (!pageInput) return;
      let pageNum = parseInt(pageInput.value) || 1;
      if (pageNum < doc.pageCount) {
        pageNum++;
        pageInput.value = pageNum;
        const pageEl = document.querySelector(`.page-container[data-page="${pageNum}"]`);
        if (pageEl) {
          isNavigatingFromIndicator = true;
          scrollContainer.scrollTop = pageEl.offsetTop;
          setTimeout(() => { isNavigatingFromIndicator = false; }, 500);
        }
      }
    });
  }

  // Action Buttons
  document.getElementById('btn-open').addEventListener('click', openPdfDialog);
  document.getElementById('btn-open-empty').addEventListener('click', openPdfDialog);
  document.getElementById('btn-save').addEventListener('click', savePdf);
  document.getElementById('btn-undo').addEventListener('click', undo);
  document.getElementById('btn-redo').addEventListener('click', redo);
  document.getElementById('btn-clear-all').addEventListener('click', clearAllAnnotations);

  // Zoom Actions
  document.getElementById('btn-zoom-in').addEventListener('click', zoomIn);
  document.getElementById('btn-zoom-out').addEventListener('click', zoomOut);

  // Flashlight Trigger
  document.getElementById('btn-flashlight').addEventListener('click', (e) => {
    isFlashlightActive = !isFlashlightActive;
    const btn = e.currentTarget;
    btn.classList.toggle('active', isFlashlightActive);
    btn.setAttribute('aria-pressed', isFlashlightActive ? 'true' : 'false');
    
    // Reset shine states if turned off
    if (!isFlashlightActive) {
      isFlashlightOn = false;
      flashlightOverlay.classList.remove('flashlight-active');
    }
    
    flashlightOverlay.style.display = isFlashlightActive ? 'block' : 'none';
    if (isFlashlightActive) {
      updateFlashlight(lastGlobalMousePos.x, lastGlobalMousePos.y);
    }
  });

  // Flashlight Press-to-Shine Event Listeners
  if (flashlightOverlay) {
    flashlightOverlay.addEventListener('mousedown', (e) => {
      if (isFlashlightActive && e.button === 0) { // Left-click only
        isFlashlightOn = true;
        flashlightOverlay.classList.add('flashlight-active');
        updateFlashlight(e.clientX, e.clientY);
      }
    });

    const releaseFlashlight = (e) => {
      if (isFlashlightActive && isFlashlightOn && e.button === 0) { // Left-click release
        isFlashlightOn = false;
        flashlightOverlay.classList.remove('flashlight-active');
        updateFlashlight(e.clientX, e.clientY);
      }
    };

    flashlightOverlay.addEventListener('mouseup', releaseFlashlight);
    flashlightOverlay.addEventListener('mouseleave', releaseFlashlight);
  }

  // Fullscreen Mode
  document.getElementById('btn-fullscreen').addEventListener('click', () => {
    if (!document.fullscreenElement) {
      document.documentElement.requestFullscreen();
    } else {
      document.exitFullscreen();
    }
  });

  // Move Laser pointer and cache mouse coords for Flashlight
  document.addEventListener('mousemove', (e) => {
    lastGlobalMousePos = { x: e.clientX, y: e.clientY };

    if (isFlashlightActive) {
      updateFlashlight(e.clientX, e.clientY);
    }

    if (currentTool === 'laser' || isLaserActive) {
      laserDot.style.left = e.clientX + 'px';
      laserDot.style.top = e.clientY + 'px';
    }

    if (isLaserActive) {
      const now = Date.now();
      const lastPoint = laserTrailPoints[laserTrailPoints.length - 1];
      if (!lastPoint || Math.hypot(e.clientX - lastPoint.x, e.clientY - lastPoint.y) > 2) {
        addLaserPoint(e.clientX, e.clientY);
        runLaserLoop();
      }
    }
  });

  // Drag and drop setup
  document.addEventListener('dragover', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  document.addEventListener('drop', (e) => {
    e.preventDefault();
    e.stopPropagation();

    if (e.dataTransfer && e.dataTransfer.files && e.dataTransfer.files.length > 0) {
      for (const file of e.dataTransfer.files) {
        if (file.name.toLowerCase().endsWith('.pdf')) {
          const reader = new FileReader();
          reader.onload = async (event) => {
            const bytes = new Uint8Array(event.target.result);
            loadPdf({
              name: file.name,
              filePath: file.path,
              bytes: bytes
            });
          };
          reader.readAsArrayBuffer(file);
        }
      }
    }
  });

  // Keyboard accessibility & zoom shortcuts
  document.addEventListener('keydown', (e) => {
    if (e.target.tagName === 'INPUT' || e.target.tagName === 'TEXTAREA') return;

    if (e.ctrlKey && e.key.toLowerCase() === 'z') {
      e.preventDefault();
      undo();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'y') {
      e.preventDefault();
      redo();
    } else if (e.ctrlKey && e.key.toLowerCase() === 's') {
      e.preventDefault();
      savePdf();
    } else if (e.ctrlKey && e.key.toLowerCase() === 'o') {
      e.preventDefault();
      openPdfDialog();
    } else if (e.ctrlKey && (e.key === '=' || e.key === '+')) {
      e.preventDefault();
      zoomIn();
    } else if (e.ctrlKey && e.key === '-') {
      e.preventDefault();
      zoomOut();
    } else if (e.ctrlKey && e.key === '0') {
      e.preventDefault();
      setZoom(1.5);
    } else if (e.key.toLowerCase() === 'p') {
      const btn = document.querySelector('[data-tool="pen"]');
      if (btn) btn.click();
    } else if (e.key.toLowerCase() === 'h') {
      const btn = document.querySelector('[data-tool="highlighter"]');
      if (btn) btn.click();
    } else if (e.key.toLowerCase() === 'e') {
      const btn = document.querySelector('[data-tool="eraser"]');
      if (btn) btn.click();
    } else if (e.key.toLowerCase() === 'v') {
      const btn = document.querySelector('[data-tool="select"]');
      if (btn) btn.click();
    } else if (e.key.toLowerCase() === 't') {
      const btn = document.querySelector('[data-tool="text"]');
      if (btn) btn.click();
    } else if (e.key.toLowerCase() === 'l') {
      const btn = document.getElementById('btn-laser');
      if (btn) btn.click();
    } else if (e.key.toLowerCase() === 'r') {
      const btn = document.getElementById('btn-flashlight');
      if (btn) btn.click();
    }
  });

  // Ctrl + Mouse Wheel zoom binding on document / Flashlight scroll sizing (with Shift)
  document.addEventListener('wheel', (e) => {
    if (isFlashlightActive && e.shiftKey) {
      e.preventDefault();
      if (e.deltaY < 0) {
        currentThickness = Math.min(10, currentThickness + 0.5);
      } else {
        currentThickness = Math.max(1, currentThickness - 0.5);
      }
      updateThicknessPreview();
      updateFlashlight(lastGlobalMousePos.x, lastGlobalMousePos.y);
    } else if (e.ctrlKey) {
      e.preventDefault();
      if (e.deltaY < 0) {
        zoomIn();
      } else {
        zoomOut();
      }
    }
  }, { passive: false });

  // Merged Toolbar layout switcher (horizontal default, vertical splits into two columns)
  const layoutBtn = document.getElementById('btn-layout-toggle');
  const appToolbar = document.getElementById('app-toolbar');
  
  const savedLayout = localStorage.getItem('toolbar-layout') || 'horizontal';
  if (savedLayout === 'vertical') {
    appToolbar.classList.add('vertical');
    layoutBtn.setAttribute('aria-pressed', 'true');
    layoutBtn.querySelector('svg').innerHTML = '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>';
  } else {
    appToolbar.classList.remove('vertical');
    layoutBtn.setAttribute('aria-pressed', 'false');
    layoutBtn.querySelector('svg').innerHTML = '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/>';
  }

  layoutBtn.addEventListener('click', () => {
    const isVertical = appToolbar.classList.toggle('vertical');
    localStorage.setItem('toolbar-layout', isVertical ? 'vertical' : 'horizontal');
    layoutBtn.setAttribute('aria-pressed', isVertical ? 'true' : 'false');
    
    if (isVertical) {
      layoutBtn.querySelector('svg').innerHTML = '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M9 3v18"/>';
    } else {
      layoutBtn.querySelector('svg').innerHTML = '<rect x="3" y="3" width="18" height="18" rx="2"/><path d="M3 9h18"/>';
    }
  });

  // Grab-to-scroll panning on empty space
  let isPanning = false;
  let startX, startY;
  let startScrollLeft, startScrollTop;

  scrollContainer.addEventListener('mousedown', (e) => {
    if (currentTool !== 'select') return;

    // Hide text formatting panel if clicking elsewhere
    if (!e.target.closest('.text-format-panel')) {
      hideTextFormattingPanel();
    }
    
    // Allow text selection if user is clicking on a span inside textLayer
    if (e.target.closest('.textLayer span')) return;
    
    // Clear browser text selection
    window.getSelection()?.removeAllRanges();
    
    // Only pan on left click
    if (e.button !== 0) return;
    
    isPanning = true;
    document.body.classList.add('grabbing');
    
    startX = e.clientX;
    startY = e.clientY;
    startScrollLeft = scrollContainer.scrollLeft;
    startScrollTop = scrollContainer.scrollTop;
    
    e.preventDefault();
  });

  window.addEventListener('mousemove', (e) => {
    // Self-healing: Reset state if mouse button is not actively pressed during pan/drag
    if (!navigator.webdriver && (e.buttons & 1) === 0) {
      if (isPanning) {
        isPanning = false;
        document.body.classList.remove('grabbing');
      }
      if (isDraggingAnnotation) {
        isDraggingAnnotation = false;
        draggedAnnotation = null;
        draggedCanvas = null;
      }
    }

    if (isPanning) {
      const dx = e.clientX - startX;
      const dy = e.clientY - startY;
      
      scrollContainer.scrollLeft = startScrollLeft - dx;
      scrollContainer.scrollTop = startScrollTop - dy;
      return;
    }

    if (isDraggingAnnotation && draggedAnnotation && draggedCanvas) {
      const rect = draggedCanvas.getBoundingClientRect();
      const canvasZoom = parseFloat(draggedCanvas.dataset.renderedZoom) || zoomLevel;
      const rawX = (e.clientX - rect.left) / canvasZoom;
      const rawY = (e.clientY - rect.top) / canvasZoom;
      
      const dx = rawX - draggedStartPos.x;
      const dy = rawY - draggedStartPos.y;
      
      const ann = draggedAnnotation;
      const initial = draggedInitialAnnState;
      const doc = openDocs.find(d => d.id === activeDocId);
      
      // Canvas width and height in PDF points
      const canvasW = draggedCanvas.width / (canvasZoom * (window.devicePixelRatio || 1));
      const canvasH = draggedCanvas.height / (canvasZoom * (window.devicePixelRatio || 1));

      if (activeResizeHandle === 'move') {
        if (ann.type === 'pen' || ann.type === 'highlighter') {
          let minX = Infinity, maxX = -Infinity;
          let minY = Infinity, maxY = -Infinity;
          for (const pt of initial.points) {
            if (pt.x < minX) minX = pt.x;
            if (pt.x > maxX) maxX = pt.x;
            if (pt.y < minY) minY = pt.y;
            if (pt.y > maxY) maxY = pt.y;
          }
          
          let shiftX = dx;
          let shiftY = dy;
          
          if (minX + dx < 5) shiftX = 5 - minX;
          if (maxX + dx > canvasW - 5) shiftX = canvasW - 5 - maxX;
          if (minY + dy < 5) shiftY = 5 - minY;
          if (maxY + dy > canvasH - 5) shiftY = canvasH - 5 - maxY;
          
          for (let i = 0; i < ann.points.length; i++) {
            ann.points[i].x = initial.points[i].x + shiftX;
            ann.points[i].y = initial.points[i].y + shiftY;
          }
        } else if (ann.type === 'text') {
          const textW = getTextWidthEstimate(ann);
          const textH = getTextHeightEstimate(ann);
          let newX = initial.x + dx;
          let newY = initial.y + dy;
          
          if (newX < 5) newX = 5;
          if (newX + textW > canvasW - 5) newX = canvasW - textW - 5;
          
          const minY = ann.fontSize / 2 + 5;
          const maxY = canvasH - textH + ann.fontSize / 2 - 5;
          if (newY < minY) newY = minY;
          if (newY > maxY) newY = maxY;
          
          ann.x = newX;
          ann.y = newY;
        } else if (ann.type === 'box') {
          let minX = Math.min(initial.startX, initial.endX);
          let maxX = Math.max(initial.startX, initial.endX);
          let minY = Math.min(initial.startY, initial.endY);
          let maxY = Math.max(initial.startY, initial.endY);
          
          let w = maxX - minX;
          let h = maxY - minY;
          
          let newMinX = minX + dx;
          let newMinY = minY + dy;
          
          if (newMinX < 5) newMinX = 5;
          if (newMinX + w > canvasW - 5) newMinX = canvasW - w - 5;
          if (newMinY < 5) newMinY = 5;
          if (newMinY + h > canvasH - 5) newMinY = canvasH - h - 5;
          
          const isStartLeft = initial.startX <= initial.endX;
          const isStartTop = initial.startY <= initial.endY;
          
          ann.startX = isStartLeft ? newMinX : newMinX + w;
          ann.endX = isStartLeft ? newMinX + w : newMinX;
          ann.startY = isStartTop ? newMinY : newMinY + h;
          ann.endY = isStartTop ? newMinY + h : newMinY;
        } else if (ann.type === 'circle') {
          const radius = Math.hypot(initial.endX - initial.startX, initial.endY - initial.startY);
          let newCenterX = initial.startX + dx;
          let newCenterY = initial.startY + dy;
          
          if (newCenterX - radius < 5) newCenterX = radius + 5;
          if (newCenterX + radius > canvasW - 5) newCenterX = canvasW - radius - 5;
          if (newCenterY - radius < 5) newCenterY = radius + 5;
          if (newCenterY + radius > canvasH - 5) newCenterY = canvasH - radius - 5;
          
          const angle = Math.atan2(initial.endY - initial.startY, initial.endX - initial.startX);
          ann.startX = newCenterX;
          ann.startY = newCenterY;
          ann.endX = newCenterX + radius * Math.cos(angle);
          ann.endY = newCenterY + radius * Math.sin(angle);
        } else {
          // line, arrow
          let newStartX = initial.startX + dx;
          let newStartY = initial.startY + dy;
          let newEndX = initial.endX + dx;
          let newEndY = initial.endY + dy;
          
          let lineW = Math.abs(newEndX - newStartX);
          let lineH = Math.abs(newEndY - newStartY);
          
          let minX = Math.min(newStartX, newEndX);
          let minY = Math.min(newStartY, newEndY);
          
          let shiftX = 0;
          let shiftY = 0;
          
          if (minX < 5) shiftX = 5 - minX;
          if (minX + lineW > canvasW - 5) shiftX = (canvasW - 5) - (minX + lineW);
          if (minY < 5) shiftY = 5 - minY;
          if (minY + lineH > canvasH - 5) shiftY = (canvasH - 5) - (minY + lineH);
          
          ann.startX = newStartX + shiftX;
          ann.startY = newStartY + shiftY;
          ann.endX = newEndX + shiftX;
          ann.endY = newEndY + shiftY;
        }
      } else {
        // Handle resizing
        if (ann.type === 'box') {
          let newStartX = ann.startX;
          let newStartY = ann.startY;
          let newEndX = ann.endX;
          let newEndY = ann.endY;
          
          if (activeResizeHandle === 'tl') {
            newStartX = initial.startX + dx;
            newStartY = initial.startY + dy;
          } else if (activeResizeHandle === 'tr') {
            newEndX = initial.endX + dx;
            newStartY = initial.startY + dy;
          } else if (activeResizeHandle === 'bl') {
            newStartX = initial.startX + dx;
            newEndY = initial.endY + dy;
          } else if (activeResizeHandle === 'br') {
            newEndX = initial.endX + dx;
            newEndY = initial.endY + dy;
          }
          
          if (newStartX < 5) newStartX = 5;
          if (newStartX > canvasW - 5) newStartX = canvasW - 5;
          if (newEndX < 5) newEndX = 5;
          if (newEndX > canvasW - 5) newEndX = canvasW - 5;
          if (newStartY < 5) newStartY = 5;
          if (newStartY > canvasH - 5) newStartY = canvasH - 5;
          if (newEndY < 5) newEndY = 5;
          if (newEndY > canvasH - 5) newEndY = canvasH - 5;
          
          ann.startX = newStartX;
          ann.startY = newStartY;
          ann.endX = newEndX;
          ann.endY = newEndY;
        } else if (ann.type === 'line' || ann.type === 'arrow') {
          let newStartX = ann.startX;
          let newStartY = ann.startY;
          let newEndX = ann.endX;
          let newEndY = ann.endY;
          
          if (activeResizeHandle === 'start') {
            newStartX = initial.startX + dx;
            newStartY = initial.startY + dy;
          } else if (activeResizeHandle === 'end') {
            newEndX = initial.endX + dx;
            newEndY = initial.endY + dy;
          }
          
          if (newStartX < 5) newStartX = 5;
          if (newStartX > canvasW - 5) newStartX = canvasW - 5;
          if (newEndX < 5) newEndX = 5;
          if (newEndX > canvasW - 5) newEndX = canvasW - 5;
          if (newStartY < 5) newStartY = 5;
          if (newStartY > canvasH - 5) newStartY = canvasH - 5;
          if (newEndY < 5) newEndY = 5;
          if (newEndY > canvasH - 5) newEndY = canvasH - 5;
          
          ann.startX = newStartX;
          ann.startY = newStartY;
          ann.endX = newEndX;
          ann.endY = newEndY;
        } else if (ann.type === 'circle') {
          let newEndX = rawX;
          let newEndY = rawY;
          if (newEndX < 5) newEndX = 5;
          if (newEndX > canvasW - 5) newEndX = canvasW - 5;
          if (newEndY < 5) newEndY = 5;
          if (newEndY > canvasH - 5) newEndY = canvasH - 5;
          ann.endX = newEndX;
          ann.endY = newEndY;
        }
      }
      
      redrawAnnotations(draggedCanvas, draggedPageNum, doc);

      // If we are dragging a selected text box, reposition the formatting panel in real-time!
      if (selectedTextAnnotation === ann) {
        repositionTextFormattingPanel(ann, draggedCanvas);
      }
    }
  });

  window.addEventListener('mouseup', () => {
    if (isPanning) {
      isPanning = false;
      document.body.classList.remove('grabbing');
    }
    isErasing = false;
    isDrawing = false; // Reset drawing flag globally on mouseup

    if (isDraggingAnnotation && draggedAnnotation && draggedCanvas) {
      isDraggingAnnotation = false;
      
      const ann = draggedAnnotation;
      const initial = draggedInitialAnnState;
      const doc = openDocs.find(d => d.id === activeDocId);
      let moved = false;
      
      if (ann.type === 'text') {
        moved = (ann.x !== initial.x || ann.y !== initial.y);
      } else if (ann.type === 'pen' || ann.type === 'highlighter') {
        if (ann.points.length > 0 && initial.points.length > 0) {
          moved = (ann.points[0].x !== initial.points[0].x || ann.points[0].y !== initial.points[0].y);
        }
      } else {
        moved = (ann.startX !== initial.startX || ann.startY !== initial.startY || ann.endX !== initial.endX || ann.endY !== initial.endY);
      }
      
      if (moved) {
        addUndoAction(doc, {
          type: 'move',
          pageNum: draggedPageNum,
          annotation: ann,
          oldState: initial,
          newState: JSON.parse(JSON.stringify(ann))
        });
        checkUnsavedChanges(doc);
      }
      
      // Update canvas hover state after drag release
      const pageEl = document.querySelector(`.page-container[data-page="${draggedPageNum}"]`);
      if (pageEl) {
        const canvas = pageEl.querySelector('.drawing-canvas');
        if (canvas) {
          canvas.classList.remove('hovering-annotation', 'cursor-nwse', 'cursor-nesw', 'cursor-crosshair', 'cursor-move');
          canvas.style.pointerEvents = 'none';
        }
      }
      
      draggedAnnotation = null;
      draggedInitialAnnState = null;
      draggedCanvas = null;
      draggedPageNum = null;
      activeResizeHandle = null;
    }
  });

  // Hover detection for dragging/resizing annotations in select mode
  document.addEventListener('mousemove', (e) => {
    if (currentTool !== 'select' || isDraggingAnnotation || isPanning) return;

    // Do not run hover checks on text format panel elements
    if (e.target.closest('.text-format-panel')) return;

    const pageContainer = e.target.closest('.page-container');
    const allCanvases = document.querySelectorAll('.drawing-canvas');

    if (!pageContainer) {
      allCanvases.forEach(c => {
        c.classList.remove('hovering-annotation', 'cursor-nwse', 'cursor-nesw', 'cursor-crosshair', 'cursor-move');
        c.style.pointerEvents = 'none';
      });
      return;
    }

    const pageNum = parseInt(pageContainer.dataset.page);
    const canvas = pageContainer.querySelector('.drawing-canvas');
    if (!canvas) return;

    const rect = canvas.getBoundingClientRect();
    const canvasZoom = parseFloat(canvas.dataset.renderedZoom) || zoomLevel;
    const x = (e.clientX - rect.left) / canvasZoom;
    const y = (e.clientY - rect.top) / canvasZoom;

    const ann = findAnnotationAtPosition(pageNum, x, y);

    allCanvases.forEach(c => {
      if (c !== canvas) {
        c.classList.remove('hovering-annotation', 'cursor-nwse', 'cursor-nesw', 'cursor-crosshair', 'cursor-move');
        c.style.pointerEvents = 'none';
      }
    });

    // Reset cursor classes on current canvas
    canvas.classList.remove('hovering-annotation', 'cursor-nwse', 'cursor-nesw', 'cursor-crosshair', 'cursor-move');

    if (ann) {
      canvas.classList.add('hovering-annotation');
      canvas.style.pointerEvents = 'auto';
      
      const handle = getResizeHandle(ann, x, y);
      if (handle) {
        const cursor = getCursorForHandle(handle);
        canvas.classList.add(`cursor-${cursor.replace('-resize', '')}`);
      } else {
        canvas.classList.add('cursor-move');
      }
    } else {
      canvas.style.pointerEvents = 'none';
    }
  });

  updateThicknessPreview();
  updateCursor();
  scrollContainer.addEventListener('scroll', updateCurrentPageOnScroll);

  // Right-click automatically gets the Laser tool temporarily
  document.addEventListener('mousedown', (e) => {
    if (e.button === 2 && workspace.contains(e.target)) { // Right click inside PDF area
      e.preventDefault();
      if (currentTool !== 'laser' && !savedBeforeRightClickTool) {
        savedBeforeRightClickTool = currentTool;
        currentTool = 'laser';
      }
      isLaserActive = true;
      laserTrailPoints = [];
      updateCursor();
      
      // Position laser dot immediately
      laserDot.style.left = e.clientX + 'px';
      laserDot.style.top = e.clientY + 'px';
      addLaserPoint(e.clientX, e.clientY);
      runLaserLoop();
    } else if (e.button === 0 && currentTool === 'laser' && workspace.contains(e.target)) { // Left click laser inside PDF area
      isLaserActive = true;
      laserTrailPoints = [];
      updateCursor();
      
      // Position laser dot immediately
      laserDot.style.left = e.clientX + 'px';
      laserDot.style.top = e.clientY + 'px';
      addLaserPoint(e.clientX, e.clientY);
      runLaserLoop();
    }
  });

  document.addEventListener('mouseup', (e) => {
    if (e.button === 2) { // Right click release
      if (savedBeforeRightClickTool) {
        currentTool = savedBeforeRightClickTool;
        savedBeforeRightClickTool = null;
      }
      isLaserActive = false;
      updateCursor();
    } else if (e.button === 0 && currentTool === 'laser') { // Left click laser release
      isLaserActive = false;
      updateCursor();
    }
  });

  function handleGlobalPointerReset() {
    if (typeof isPanning !== 'undefined' && isPanning) {
      isPanning = false;
      document.body.classList.remove('grabbing');
    }
    isErasing = false;
    isDrawing = false;
    currentPath = null;
    tempShape = null;
    
    if (typeof isDraggingAnnotation !== 'undefined' && isDraggingAnnotation) {
      isDraggingAnnotation = false;
      draggedAnnotation = null;
      draggedCanvas = null;
    }
    
    if (isLaserActive) {
      if (savedBeforeRightClickTool) {
        currentTool = savedBeforeRightClickTool;
        savedBeforeRightClickTool = null;
      }
      isLaserActive = false;
    }
    updateCursor();
  }

  window.addEventListener('blur', handleGlobalPointerReset);
  document.addEventListener('mouseleave', handleGlobalPointerReset);

  document.addEventListener('contextmenu', (e) => {
    e.preventDefault(); // Disable default context menu globally for presentations
  });

  if (window.api && typeof window.api.onTryClose === 'function') {
    window.api.onTryClose(async () => {
      const hasUnsaved = openDocs.some(d => d.hasUnsavedChanges);
      if (!hasUnsaved) {
        setTimeout(() => {
          window.api.closeApp();
        }, 150);
        return;
      }
      
      const choice = await showUnsavedChangesAppCloseModal();
      if (choice === 'save') {
        const saved = await saveAllUnsavedDocs();
        document.getElementById('unsaved-modal').style.display = 'none';
        if (saved) {
          setTimeout(() => {
            window.api.closeApp();
          }, 150);
        }
      } else if (choice === 'discard') {
        document.getElementById('unsaved-modal').style.display = 'none';
        setTimeout(() => {
          window.api.closeApp();
        }, 150);
      }
      // if choice === 'cancel', we do nothing and stay in the app
    });
  }

  updateAppTitle();

  // Vicinity hover page-indicator trigger
  const pageIndicator = document.getElementById('page-indicator');
  if (pageIndicator) {
    document.addEventListener('mousemove', (e) => {
      lastMouseX = e.clientX;
      lastMouseY = e.clientY;
      updatePageIndicatorVisibility(lastMouseX, lastMouseY);
    });
  }
}

// Thickness indicator dot resizing
function updateThicknessPreview() {
  if (thicknessPreview) {
    thicknessPreview.style.width = Math.max(3, currentThickness) + 'px';
    thicknessPreview.style.height = Math.max(3, currentThickness) + 'px';
    thicknessPreview.style.backgroundColor = currentColor;
  }
  if (thicknessVal) {
    thicknessVal.innerText = currentThickness + 'px';
  }
  if (thicknessSlider) {
    thicknessSlider.value = currentThickness;
  }
}

function updateFlashlight(clientX, clientY) {
  const overlay = document.getElementById('global-flashlight-overlay');
  if (!overlay) return;
  
  if (isFlashlightOn) {
    const radius = currentThickness * 4 + 50;
    
    // Calculate relative to the overlay itself
    const overlayRect = overlay.getBoundingClientRect();
    const overlayX = clientX - overlayRect.left;
    const overlayY = clientY - overlayRect.top;
    
    // Use a very sharp transition (1.5px width) so the revealed area is completely clear and original, with no overlay tint!
    const innerRadius = Math.max(0, radius - 1.5);
    overlay.style.background = `radial-gradient(circle ${radius}px at ${overlayX}px ${overlayY}px, transparent 0%, transparent ${innerRadius}px, rgba(8, 8, 12, 0.95) ${radius}px)`;
  } else {
    // Fully dark overlay when not clicked (only showing flashlight cursor)
    overlay.style.background = 'rgba(8, 8, 12, 0.95)';
  }
}

// Cursor and pointer-events toggles to enable text selection under drawings
function updateCursor() {
  const canvases = document.querySelectorAll('.drawing-canvas');
  const textLayers = document.querySelectorAll('.textLayer');
  const appContainer = document.getElementById('app-container');

  // Hide text formatting panel when changing tools
  hideTextFormattingPanel();

  // Synchronize toolbar button active states
  syncToolbarButtons();

  if (currentTool === 'select') {
    appContainer.classList.add('select-tool-active');
  } else {
    appContainer.classList.remove('select-tool-active');
  }

  let cursor = 'crosshair';
  let drawingPointerEvents = 'auto';
  let textPointerEvents = 'none';

  if (currentTool === 'select') {
    cursor = 'grab';
    drawingPointerEvents = 'none'; // Let click events fall through drawing canvas
    textPointerEvents = 'auto'; // Enable selectable PDF text elements
  } else if (currentTool === 'eraser') {
    cursor = ''; // Overridden by eraser-cursor class
  } else if (currentTool === 'pen') {
    cursor = ''; // Overridden by pen-cursor class
  } else if (currentTool === 'highlighter') {
    cursor = ''; // Overridden by highlighter-cursor class
  } else if (currentTool === 'text') {
    cursor = 'text';
  } else if (currentTool === 'laser') {
    cursor = isLaserActive ? 'none' : 'default'; // Hide native cursor in laser mode only when active
    drawingPointerEvents = 'none';
    textPointerEvents = 'none';
  }

  canvases.forEach(c => {
    c.classList.remove('eraser-cursor', 'pen-cursor', 'highlighter-cursor');
    if (currentTool === 'eraser') {
      c.classList.add('eraser-cursor');
    } else if (currentTool === 'pen') {
      c.classList.add('pen-cursor');
    } else if (currentTool === 'highlighter') {
      c.classList.add('highlighter-cursor');
    }
    c.style.cursor = cursor;
    c.style.pointerEvents = drawingPointerEvents;
    c.classList.remove('hovering-annotation', 'cursor-nwse', 'cursor-nesw', 'cursor-crosshair', 'cursor-move'); // Clear any sticky hover class
  });
  textLayers.forEach(tl => {
    tl.style.pointerEvents = textPointerEvents;
  });

  // Toggle laser dot and canvas visibility and match selected active color
  const laserCanvas = document.getElementById('laser-canvas');
  if (currentTool === 'laser' || isLaserActive) {
    laserDot.style.display = 'block';
    laserDot.style.backgroundColor = currentColor;
    laserDot.style.boxShadow = `0 0 8px 3px ${currentColor}, 0 0 16px 8px ${currentColor}`;
    if (laserCanvas) laserCanvas.style.display = 'block';
  } else {
    laserDot.style.display = 'none';
    // Let the animation loop finish rendering/fading existing points.
    // Do not instantly hide the canvas or clear the trail here.
  }
}

// Find the page container closest to the vertical center of the scroll container
function findViewportCenterPage() {
  const containers = document.querySelectorAll('.page-container');
  if (containers.length === 0) return null;
  
  const viewportCenterX = scrollContainer.scrollLeft + scrollContainer.clientWidth / 2;
  const viewportCenterY = scrollContainer.scrollTop + scrollContainer.clientHeight / 2;
  
  let closestContainer = null;
  let minDistance = Infinity;
  
  containers.forEach(container => {
    const cLeft = container.offsetLeft;
    const cTop = container.offsetTop;
    const cWidth = container.offsetWidth;
    const cHeight = container.offsetHeight;
    
    const cCenterX = cLeft + cWidth / 2;
    const cCenterY = cTop + cHeight / 2;
    
    const distance = Math.abs(viewportCenterY - cCenterY);
    if (distance < minDistance) {
      minDistance = distance;
      closestContainer = container;
    }
  });
  
  if (closestContainer) {
    const pageNum = parseInt(closestContainer.dataset.page);
    const cLeft = closestContainer.offsetLeft;
    const cTop = closestContainer.offsetTop;
    const cWidth = closestContainer.offsetWidth;
    const cHeight = closestContainer.offsetHeight;
    
    // Normalized position of viewport center relative to this page container
    const normX = (viewportCenterX - cLeft) / cWidth;
    const normY = (viewportCenterY - cTop) / cHeight;
    
    return {
      pageNum,
      normX: Math.max(0, Math.min(1, normX)),
      normY: Math.max(0, Math.min(1, normY))
    };
  }
  
  return null;
}

// Zoom Handlers preserving viewport center relative to the active page
function zoomIn() {
  setZoom(zoomLevel + 0.15);
}

function zoomOut() {
  setZoom(zoomLevel - 0.15);
}

async function setZoom(newZoom) {
  const doc = openDocs.find(d => d.id === activeDocId);
  if (!doc) return;

  // Find page closest to center of viewport
  const centerPage = findViewportCenterPage();
  let normCenterX = 0.5;
  let normCenterY = 0.5;
  let centerPageNum = 1;
  
  if (centerPage) {
    centerPageNum = centerPage.pageNum;
    normCenterX = centerPage.normX;
    normCenterY = centerPage.normY;
  }

  zoomLevel = Math.max(0.5, Math.min(4.0, newZoom));
  
  const zoomVal = document.getElementById('zoom-val');
  if (zoomVal) {
    zoomVal.innerText = Math.round(zoomLevel * 100) + '%';
  }
  
  // Temporarily disable smooth scroll behavior during zoom layout rendering
  const oldScrollBehavior = scrollContainer.style.scrollBehavior;
  scrollContainer.style.scrollBehavior = 'auto';
  
  await renderActiveDocument();
  
  // Restore scroll centered on the same normalized coordinates
  const newPageContainer = document.querySelector(`.page-container[data-page="${centerPageNum}"]`);
  if (newPageContainer) {
    const newWidth = parseFloat(newPageContainer.style.width);
    const newHeight = parseFloat(newPageContainer.style.height);
    
    const targetCenterX = newPageContainer.offsetLeft + (normCenterX * newWidth);
    const targetCenterY = newPageContainer.offsetTop + (normCenterY * newHeight);
    
    scrollContainer.scrollLeft = targetCenterX - scrollContainer.clientWidth / 2;
    scrollContainer.scrollTop = targetCenterY - scrollContainer.clientHeight / 2;
  }
  
  // Restore scroll behavior
  scrollContainer.style.scrollBehavior = oldScrollBehavior;
  
  document.getElementById('total-pages').innerText = doc.pageCount;
  updateCurrentPageOnScroll();
  
  // Dispatch custom event for testing sync
  window.dispatchEvent(new CustomEvent('zoom-completed', { detail: zoomLevel }));
}

// IPC trigger open dialog
async function openPdfDialog() {
  if (!window.api || typeof window.api.openFileDialog !== 'function') {
    alert('File dialogs are only supported in desktop mode.');
    return;
  }
  const fileInfo = await window.api.openFileDialog();
  if (fileInfo) {
    loadPdf(fileInfo);
  }
}

// Load Document bytes
async function loadPdf(fileInfo) {
  // Deduplicate files
  const existingDoc = openDocs.find(d => d.filePath === fileInfo.filePath);
  if (existingDoc) {
    setActiveDoc(existingDoc.id);
    return;
  }

  try {
    const docId = 'doc_' + Date.now() + '_' + Math.random().toString(36).substring(2, 7);
    
    // Normalize byte representation
    let dataBytes = fileInfo.bytes;
    if (dataBytes && dataBytes.type === 'Buffer') {
      dataBytes = new Uint8Array(dataBytes.data);
    } else if (!(dataBytes instanceof Uint8Array)) {
      dataBytes = new Uint8Array(dataBytes);
    }

    const loadingTask = pdfjsLib.getDocument({ data: dataBytes.slice() });
    const pdfDoc = await loadingTask.promise;

    const newDoc = {
      id: docId,
      name: fileInfo.name,
      filePath: fileInfo.filePath,
      bytes: dataBytes,
      pdfDoc: pdfDoc,
      pageCount: pdfDoc.numPages,
      annotations: {},
      undoStack: [],
      redoStack: [],
      hasUnsavedChanges: false
    };

    for (let i = 1; i <= newDoc.pageCount; i++) {
      newDoc.annotations[i] = [];
    }
    newDoc.baselineState = JSON.stringify(newDoc.annotations);

    openDocs.push(newDoc);
    setActiveDoc(docId);
    renderTabs();
  } catch (e) {
    console.error('Failed to load PDF:', e);
    alert(`Could not open "${fileInfo.name}".\n${e.message || 'The file may be corrupt or password-protected.'}`);
  }
}

// Renders open tabs with accessibility keyboard traversal
function renderTabs() {
  tabsContainer.innerHTML = '';
  openDocs.forEach(doc => {
    const tab = document.createElement('div');
    tab.className = `tab ${doc.id === activeDocId ? 'active' : ''}`;
    tab.setAttribute('role', 'tab');
    tab.setAttribute('aria-selected', doc.id === activeDocId ? 'true' : 'false');
    tab.setAttribute('tabindex', '0');
    
    // Keyboard activation for accessibility
    tab.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.preventDefault();
        setActiveDoc(doc.id);
      }
    });

    const nameSpan = document.createElement('span');
    nameSpan.className = 'tab-name';
    nameSpan.innerHTML = `${doc.hasUnsavedChanges ? '<span class="tab-unsaved" aria-label="Unsaved changes">*</span>' : ''}${doc.name}`;
    
    const closeBtn = document.createElement('span');
    closeBtn.className = 'tab-close';
    closeBtn.innerText = '×';
    closeBtn.setAttribute('role', 'button');
    closeBtn.setAttribute('aria-label', `Close ${doc.name}`);
    closeBtn.setAttribute('tabindex', '0');
    
    closeBtn.onclick = (e) => {
      e.stopPropagation();
      closeDoc(doc.id);
    };

    closeBtn.addEventListener('keydown', (e) => {
      if (e.key === 'Enter' || e.key === ' ') {
        e.stopPropagation();
        e.preventDefault();
        closeDoc(doc.id);
      }
    });

    tab.onclick = () => setActiveDoc(doc.id);
    tab.appendChild(nameSpan);
    tab.appendChild(closeBtn);
    tabsContainer.appendChild(tab);
  });

  if (openDocs.length === 0) {
    emptyState.style.display = 'flex';
    scrollContainer.style.display = 'none';
    const indicatorZone = document.getElementById('page-indicator-zone');
    if (indicatorZone) indicatorZone.style.display = 'none';
  } else {
    emptyState.style.display = 'none';
    scrollContainer.style.display = 'flex';
    const indicatorZone = document.getElementById('page-indicator-zone');
    if (indicatorZone) indicatorZone.style.display = 'block';
    scrollContainer.focus();
  }
  updateUndoRedoButtons();
}

function setActiveDoc(id) {
  activeDocId = id;
  renderTabs();
  renderActiveDocument();
  
  const doc = openDocs.find(d => d.id === activeDocId);
  const indicatorZone = document.getElementById('page-indicator-zone');
  if (doc && indicatorZone) {
    document.getElementById('total-pages').innerText = doc.pageCount;
    const pageInput = document.getElementById('current-page-input');
    if (pageInput) {
      pageInput.value = 1;
    }
    lastActivePageNum = 1;
    indicatorZone.style.display = 'block';
    
    // Sync UI zoom text
    const zoomVal = document.getElementById('zoom-val');
    if (zoomVal) {
      zoomVal.innerText = Math.round(zoomLevel * 100) + '%';
    }
  } else if (indicatorZone) {
    indicatorZone.style.display = 'none';
  }
  updateAppTitle();
}

let activeModalResolve = null;

// Promise-based unsaved changes confirm modal
function showUnsavedModal(docName) {
  if (activeModalResolve) {
    activeModalResolve('cancel');
  }
  return new Promise((resolve) => {
    activeModalResolve = resolve;

    const modal = document.getElementById('unsaved-modal');
    const message = document.getElementById('modal-message');
    const title = document.getElementById('modal-title');
    
    title.innerText = 'Unsaved Changes';
    message.innerText = `"${docName}" has unsaved changes. Do you want to save them before closing?`;
    
    modal.style.display = 'flex';
    
    // Clone buttons to purge any existing event listeners from previous modal activations
    const btnSaveOrig = document.getElementById('modal-btn-save');
    const btnDiscardOrig = document.getElementById('modal-btn-discard');
    const btnCancelOrig = document.getElementById('modal-btn-cancel');
    const btnCloseOrig = document.getElementById('modal-close');

    const btnSave = btnSaveOrig.cloneNode(true);
    const btnDiscard = btnDiscardOrig.cloneNode(true);
    const btnCancel = btnCancelOrig.cloneNode(true);
    const btnClose = btnCloseOrig.cloneNode(true);

    btnSaveOrig.parentNode.replaceChild(btnSave, btnSaveOrig);
    btnDiscardOrig.parentNode.replaceChild(btnDiscard, btnDiscardOrig);
    btnCancelOrig.parentNode.replaceChild(btnCancel, btnCancelOrig);
    btnCloseOrig.parentNode.replaceChild(btnClose, btnCloseOrig);
    
    btnSave.disabled = false;
    btnDiscard.disabled = false;
    btnCancel.disabled = false;
    btnClose.disabled = false;

    const cleanup = (value) => {
      btnSave.removeEventListener('click', handleSave);
      btnDiscard.removeEventListener('click', handleDiscard);
      btnCancel.removeEventListener('click', handleCancel);
      btnClose.removeEventListener('click', handleCancel);
      
      if (value === 'save') {
        btnSave.disabled = true;
        btnDiscard.disabled = true;
        btnCancel.disabled = true;
        btnClose.disabled = true;
        message.innerText = 'Saving changes, please wait...';
      } else {
        modal.style.display = 'none';
      }
      activeModalResolve = null;
      resolve(value);
    };
    
    const handleSave = () => cleanup('save');
    const handleDiscard = () => cleanup('discard');
    const handleCancel = () => cleanup('cancel');
    
    btnSave.innerText = 'Save';
    btnDiscard.innerText = "Don't Save";
    btnCancel.innerText = 'Cancel';
    
    btnSave.addEventListener('click', handleSave);
    btnDiscard.addEventListener('click', handleDiscard);
    btnCancel.addEventListener('click', handleCancel);
    btnClose.addEventListener('click', handleCancel);
  });
}

function showUnsavedChangesAppCloseModal() {
  if (activeModalResolve) {
    activeModalResolve('cancel');
  }
  return new Promise((resolve) => {
    activeModalResolve = resolve;

    const modal = document.getElementById('unsaved-modal');
    const message = document.getElementById('modal-message');
    const title = document.getElementById('modal-title');
    
    title.innerText = 'Unsaved Changes';
    message.innerText = 'You have unsaved documents. Do you want to save them before exiting?';
    
    modal.style.display = 'flex';
    
    // Clone buttons to purge any existing event listeners from previous modal activations
    const btnSaveOrig = document.getElementById('modal-btn-save');
    const btnDiscardOrig = document.getElementById('modal-btn-discard');
    const btnCancelOrig = document.getElementById('modal-btn-cancel');
    const btnCloseOrig = document.getElementById('modal-close');

    const btnSave = btnSaveOrig.cloneNode(true);
    const btnDiscard = btnDiscardOrig.cloneNode(true);
    const btnCancel = btnCancelOrig.cloneNode(true);
    const btnClose = btnCloseOrig.cloneNode(true);

    btnSaveOrig.parentNode.replaceChild(btnSave, btnSaveOrig);
    btnDiscardOrig.parentNode.replaceChild(btnDiscard, btnDiscardOrig);
    btnCancelOrig.parentNode.replaceChild(btnCancel, btnCancelOrig);
    btnCloseOrig.parentNode.replaceChild(btnClose, btnCloseOrig);
    
    btnSave.disabled = false;
    btnDiscard.disabled = false;
    btnCancel.disabled = false;
    btnClose.disabled = false;

    const cleanup = (value) => {
      btnSave.removeEventListener('click', handleSave);
      btnDiscard.removeEventListener('click', handleDiscard);
      btnCancel.removeEventListener('click', handleCancel);
      btnClose.removeEventListener('click', handleCancel);
      
      if (value === 'save') {
        btnSave.disabled = true;
        btnDiscard.disabled = true;
        btnCancel.disabled = true;
        btnClose.disabled = true;
        message.innerText = 'Saving changes, please wait...';
      } else {
        modal.style.display = 'none';
      }
      activeModalResolve = null;
      resolve(value);
    };
    
    const handleSave = () => cleanup('save');
    const handleDiscard = () => cleanup('discard');
    const handleCancel = () => cleanup('cancel');
    
    btnSave.innerText = 'Save All';
    btnDiscard.innerText = "Don't Save";
    btnCancel.innerText = 'Cancel';
    
    btnSave.addEventListener('click', handleSave);
    btnDiscard.addEventListener('click', handleDiscard);
    btnCancel.addEventListener('click', handleCancel);
    btnClose.addEventListener('click', handleCancel);
  });
}

async function saveAllUnsavedDocs() {
  for (const doc of openDocs) {
    if (doc.hasUnsavedChanges) {
      setActiveDoc(doc.id);
      const saved = await savePdf();
      if (!saved) {
        return false; // Abort if any save fails or is cancelled
      }
    }
  }
  return true;
}

async function closeDoc(id) {
  const doc = openDocs.find(d => d.id === id);
  if (doc && doc.hasUnsavedChanges) {
    const choice = await showUnsavedModal(doc.name);
    if (choice === 'cancel') {
      return;
    } else if (choice === 'save') {
      // Set as active doc so save can execute on it
      setActiveDoc(id);
      const saved = await savePdf();
      document.getElementById('unsaved-modal').style.display = 'none';
      if (!saved) {
        return; // Abort tab closure if save failed or was cancelled
      }
    }
  }
  openDocs = openDocs.filter(d => d.id !== id);
  if (activeDocId === id) {
    activeDocId = openDocs.length > 0 ? openDocs[0].id : null;
  }
  renderTabs();
  updateAppTitle();
  if (activeDocId) renderActiveDocument();
}

// Render active doc pages taking into account high DPI pixelRatio, zoom, and textLayer rendering
async function renderActiveDocument() {
  const doc = openDocs.find(d => d.id === activeDocId);
  if (!doc) {
    scrollContainer.innerHTML = '';
    scrollContainer.removeAttribute('data-active-doc-id');
    return;
  }

  const taskId = ++currentRenderTaskId;

  const isSameDoc = (scrollContainer.getAttribute('data-active-doc-id') === activeDocId) &&
                    (scrollContainer.querySelectorAll('.page-container').length === doc.pageCount);
  scrollContainer.setAttribute('data-active-doc-id', activeDocId);

  if (!isSameDoc) {
    scrollContainer.innerHTML = '';
  }

  for (let i = 1; i <= doc.pageCount; i++) {
    if (taskId !== currentRenderTaskId) return;

    let pageContainer;
    let bgCanvas;
    let textLayerDiv;
    let drawCanvas;

    if (!isSameDoc) {
      pageContainer = document.createElement('div');
      pageContainer.className = 'page-container';
      pageContainer.dataset.page = i;
      pageContainer.setAttribute('role', 'region');
      pageContainer.setAttribute('aria-label', `Page ${i} of ${doc.pageCount}`);

      bgCanvas = document.createElement('canvas');
      bgCanvas.className = 'pdf-canvas';
      
      textLayerDiv = document.createElement('div');
      textLayerDiv.className = 'textLayer';
      
      drawCanvas = document.createElement('canvas');
      drawCanvas.className = 'drawing-canvas';
      
      pageContainer.appendChild(bgCanvas);
      pageContainer.appendChild(textLayerDiv);
      pageContainer.appendChild(drawCanvas);
      scrollContainer.appendChild(pageContainer);
    } else {
      pageContainer = scrollContainer.querySelector(`.page-container[data-page="${i}"]`);
      bgCanvas = pageContainer.querySelector('.pdf-canvas');
      textLayerDiv = pageContainer.querySelector('.textLayer');
      drawCanvas = pageContainer.querySelector('.drawing-canvas');
    }

    const page = await doc.pdfDoc.getPage(i);
    if (taskId !== currentRenderTaskId) return;

    const viewport = page.getViewport({ scale: zoomLevel });
    const pixelRatio = window.devicePixelRatio || 1;
    
    // Round CSS dimensions to exact integers to prevent sub-pixel misalignment
    const cssWidth = Math.round(viewport.width);
    const cssHeight = Math.round(viewport.height);
    const backingWidth = Math.round(cssWidth * pixelRatio);
    const backingHeight = Math.round(cssHeight * pixelRatio);

    // Immediately size CSS dimensions to scale existing canvas visual buffers (prevents white flicker!)
    pageContainer.style.width = cssWidth + 'px';
    pageContainer.style.height = cssHeight + 'px';
    bgCanvas.style.width = cssWidth + 'px';
    bgCanvas.style.height = cssHeight + 'px';
    drawCanvas.style.width = cssWidth + 'px';
    drawCanvas.style.height = cssHeight + 'px';
    drawCanvas.dataset.renderedZoom = zoomLevel;

    // Double buffering: render PDF contents onto offscreen canvas first
    const offscreenCanvas = document.createElement('canvas');
    offscreenCanvas.width = backingWidth;
    offscreenCanvas.height = backingHeight;
    const offCtx = offscreenCanvas.getContext('2d');
    offCtx.imageSmoothingEnabled = true;
    offCtx.imageSmoothingQuality = 'high';

    const scaleX = backingWidth / viewport.width;
    const scaleY = backingHeight / viewport.height;

    const renderContext = {
      canvasContext: offCtx,
      viewport: viewport,
      transform: [scaleX, 0, 0, scaleY, 0, 0] // Exact High DPI scale transform
    };
    
    const renderTask = page.render(renderContext);
    await renderTask.promise;
    if (taskId !== currentRenderTaskId) {
      renderTask.cancel();
      return;
    }

    // Draw offscreen canvas to main canvas once rendering is complete
    bgCanvas.width = backingWidth;
    bgCanvas.height = backingHeight;
    const bgCtx = bgCanvas.getContext('2d');
    bgCtx.imageSmoothingEnabled = true;
    bgCtx.imageSmoothingQuality = 'high';
    bgCtx.drawImage(offscreenCanvas, 0, 0);

    // Also update drawing canvas backing store
    drawCanvas.width = backingWidth;
    drawCanvas.height = backingHeight;

    // Render Text Layer
    textLayerDiv.innerHTML = '';
    const textContent = await page.getTextContent();
    if (taskId !== currentRenderTaskId) return;

    await pdfjsLib.renderTextLayer({
      textContent: textContent,
      container: textLayerDiv,
      viewport: viewport,
      textDivs: []
    }).promise;
    if (taskId !== currentRenderTaskId) return;

    if (!isSameDoc) {
      setupDrawingEvents(drawCanvas, i, doc);
    }
    redrawAnnotations(drawCanvas, i, doc);
  }
  updateCursor();
}

// Update current page counter during vertical scroll
function updateCurrentPageOnScroll() {
  const doc = openDocs.find(d => d.id === activeDocId);
  if (!doc) return;

  const containers = document.querySelectorAll('.page-container');
  let activePage = 1;
  let minDiff = Infinity;
  
  const viewportCenter = scrollContainer.scrollTop + (scrollContainer.clientHeight / 2);
  
  containers.forEach(container => {
    const pageNum = parseInt(container.dataset.page);
    const containerTop = container.offsetTop;
    const containerCenter = containerTop + (container.offsetHeight / 2);
    const diff = Math.abs(viewportCenter - containerCenter);
    
    if (diff < minDiff) {
      minDiff = diff;
      activePage = pageNum;
    }
  });
  
  const pageInput = document.getElementById('current-page-input');
  if (pageInput && document.activeElement !== pageInput && !isNavigatingFromIndicator) {
    pageInput.value = activePage;
  }

  if (activePage !== lastActivePageNum) {
    lastActivePageNum = activePage;
    if (!isNavigatingFromIndicator && (Date.now() - lastTimeInVicinity > 1000)) {
      triggerPageIndicatorTemporaryShow(2000);
    }
  }
}

// Change Tracking
function checkUnsavedChanges(doc) {
  if (!doc) return;
  const currentState = JSON.stringify(doc.annotations);
  const hasChanges = (currentState !== doc.baselineState);
  if (doc.hasUnsavedChanges !== hasChanges) {
    doc.hasUnsavedChanges = hasChanges;
    renderTabs();
    updateAppTitle();
  }
  updateUndoRedoButtons();
}

// Undo/Redo Engine Helpers
function addUndoAction(doc, action) {
  doc.undoStack.push(action);
  doc.redoStack = []; // Clear redo stack on new action
  updateUndoRedoButtons();
}

function updateUndoRedoButtons() {
  const doc = openDocs.find(d => d.id === activeDocId);
  const undoBtn = document.getElementById('btn-undo');
  const redoBtn = document.getElementById('btn-redo');
  const saveBtn = document.getElementById('btn-save');
  
  if (doc) {
    undoBtn.disabled = doc.undoStack.length === 0;
    redoBtn.disabled = doc.redoStack.length === 0;
    saveBtn.disabled = !doc.hasUnsavedChanges;
  } else {
    undoBtn.disabled = true;
    redoBtn.disabled = true;
    saveBtn.disabled = true;
  }
}

function undo() {
  const doc = openDocs.find(d => d.id === activeDocId);
  if (!doc || doc.undoStack.length === 0) return;

  const action = doc.undoStack.pop();
  doc.redoStack.push(action);

  if (action.type === 'add') {
    const idx = doc.annotations[action.pageNum].indexOf(action.annotation);
    if (idx !== -1) doc.annotations[action.pageNum].splice(idx, 1);
  } else if (action.type === 'delete') {
    doc.annotations[action.pageNum].splice(action.index, 0, action.annotation);
  } else if (action.type === 'clear') {
    doc.annotations = JSON.parse(JSON.stringify(action.annotationsSnapshot));
  } else if (action.type === 'move' || action.type === 'modify') {
    Object.assign(action.annotation, action.oldState);
  }

  checkUnsavedChanges(doc);
  refreshAllPages();
}

function redo() {
  const doc = openDocs.find(d => d.id === activeDocId);
  if (!doc || doc.redoStack.length === 0) return;

  const action = doc.redoStack.pop();
  doc.undoStack.push(action);

  if (action.type === 'add') {
    doc.annotations[action.pageNum].push(action.annotation);
  } else if (action.type === 'delete') {
    const idx = doc.annotations[action.pageNum].indexOf(action.annotation);
    if (idx !== -1) doc.annotations[action.pageNum].splice(idx, 1);
  } else if (action.type === 'clear') {
    doc.annotations = {};
    for (let i = 1; i <= doc.pageCount; i++) {
      doc.annotations[i] = [];
    }
  } else if (action.type === 'move' || action.type === 'modify') {
    Object.assign(action.annotation, action.newState);
  }

  checkUnsavedChanges(doc);
  refreshAllPages();
}

function refreshAllPages() {
  const doc = openDocs.find(d => d.id === activeDocId);
  if (!doc) return;
  
  const pageContainers = document.querySelectorAll('.page-container');
  pageContainers.forEach(container => {
    const pageNum = parseInt(container.dataset.page);
    const canvas = container.querySelector('.drawing-canvas');
    if (canvas) {
      redrawAnnotations(canvas, pageNum, doc);
    }
  });
}

function clearAllAnnotations() {
  const doc = openDocs.find(d => d.id === activeDocId);
  if (!doc) return;

  const hasItems = Object.values(doc.annotations).some(arr => arr.length > 0);
  if (!hasItems) return;

  const snapshot = JSON.parse(JSON.stringify(doc.annotations));
  
  doc.annotations = {};
  for (let i = 1; i <= doc.pageCount; i++) {
    doc.annotations[i] = [];
  }
  
  addUndoAction(doc, { type: 'clear', annotationsSnapshot: snapshot });
  checkUnsavedChanges(doc);
  refreshAllPages();
}

// Drawing Canvas Event Listeners (Normalizing display pixels to PDF Points)
function setupDrawingEvents(canvas, pageNum, doc) {
  const ctx = canvas.getContext('2d');
  
  if (!doc.annotations[pageNum]) {
    doc.annotations[pageNum] = [];
  }

  const getPos = (e) => {
    const rect = canvas.getBoundingClientRect();
    const canvasZoom = parseFloat(canvas.dataset.renderedZoom) || zoomLevel;
    let rawX = (e.clientX - rect.left) / canvasZoom;
    let rawY = (e.clientY - rect.top) / canvasZoom;
    let thickness = currentThickness;
    
    if (currentTool === 'highlighter') {
      const snapped = snapToNearestTextSpan(pageNum, rawX, rawY);
      if (snapped) {
        rawY = snapped.y;
        thickness = snapped.height * 1.25;
      } else {
        // Default highlighter thickness is thicker by default
        thickness = Math.max(16, currentThickness * 2.5);
      }
    }
    
    return { x: rawX, y: rawY, thickness };
  };

  canvas.addEventListener('mousedown', (e) => {
    if (e.button !== 0) return; // ONLY left click starts drawing/erasing/text placement!
    if (currentTool === 'text' || currentTool === 'laser') return;
    
    const pos = getPos(e);
    if (currentTool === 'select') {
      const hoveredAnn = findAnnotationAtPosition(pageNum, pos.x, pos.y);
      
      // Handle text formatting panel selection / deselection
      if (!hoveredAnn || hoveredAnn.type !== 'text') {
        hideTextFormattingPanel();
      }
      
      if (hoveredAnn) {
        if (hoveredAnn.type === 'text') {
          if (selectedTextAnnotation !== hoveredAnn) {
            hideTextFormattingPanel(); // commit previous changes
            selectedTextAnnotation = hoveredAnn;
            selectedTextPageNum = pageNum;
            textFormatInitialState = JSON.parse(JSON.stringify(hoveredAnn));
            showTextFormattingPanel(hoveredAnn, pageNum, canvas);
          }
        }

        const handle = getResizeHandle(hoveredAnn, pos.x, pos.y);
        activeResizeHandle = handle || 'move';
        
        isDraggingAnnotation = true;
        draggedAnnotation = hoveredAnn;
        draggedPageNum = pageNum;
        draggedCanvas = canvas;
        draggedStartPos = { x: pos.x, y: pos.y };
        draggedInitialAnnState = JSON.parse(JSON.stringify(hoveredAnn));
        
        e.preventDefault();
        e.stopPropagation();
      }
      return;
    }

    if (currentTool === 'eraser') {
      isErasing = true;
      eraseAtPos(pageNum, doc, pos.x, pos.y);
      redrawAnnotations(canvas, pageNum, doc);
      return;
    }

    isDrawing = true;
    if (currentTool === 'pen' || currentTool === 'highlighter') {
      currentPath = {
        type: currentTool,
        color: currentColor,
        thickness: pos.thickness || currentThickness,
        points: [{ x: pos.x, y: pos.y }]
      };
    } else {
      tempShape = {
        type: currentTool,
        color: currentColor,
        thickness: currentThickness,
        startX: pos.x,
        startY: pos.y,
        endX: pos.x,
        endY: pos.y
      };
    }
  });

  canvas.addEventListener('mousemove', (e) => {
    // Self-healing: Reset drawing state if left click is not pressed
    if (!navigator.webdriver && (e.buttons & 1) === 0) {
      isDrawing = false;
      isErasing = false;
    }
    const pos = getPos(e);

    if (currentTool === 'eraser') {
      if (isErasing) {
        eraseAtPos(pageNum, doc, pos.x, pos.y);
        redrawAnnotations(canvas, pageNum, doc);
      }
      return;
    }

    if (!isDrawing) return;

    if (currentPath) {
      currentPath.points.push({ x: pos.x, y: pos.y });
      if (pos.thickness) {
        currentPath.thickness = pos.thickness; // update thickness in case it snaps mid-draw
      }
      redrawAnnotations(canvas, pageNum, doc, currentPath);
    } else if (tempShape) {
      tempShape.endX = pos.x;
      tempShape.endY = pos.y;
      redrawAnnotations(canvas, pageNum, doc, null, tempShape);
    }
  });

  canvas.addEventListener('mouseup', () => {
    if (isErasing) {
      isErasing = false;
      return;
    }
    if (!isDrawing) return;
    isDrawing = false;
    
    if (currentPath) {
      doc.annotations[pageNum].push(currentPath);
      addUndoAction(doc, { type: 'add', pageNum: pageNum, annotation: currentPath });
      currentPath = null;
      checkUnsavedChanges(doc);
    } else if (tempShape) {
      doc.annotations[pageNum].push(tempShape);
      addUndoAction(doc, { type: 'add', pageNum: pageNum, annotation: tempShape });
      tempShape = null;
      checkUnsavedChanges(doc);
    }
    redrawAnnotations(canvas, pageNum, doc);
  });

  canvas.addEventListener('click', (e) => {
    if (currentTool === 'text') {
      const pos = getPos(e);
      spawnTextInput(canvas, pageNum, doc, pos.x, pos.y);
    } else if (currentTool === 'eraser') {
      const pos = getPos(e);
      eraseAtPos(pageNum, doc, pos.x, pos.y);
      redrawAnnotations(canvas, pageNum, doc);
    }
  });
}

// Spawn contenteditable text annotation in PDF points, scaling text area visual boundaries
function spawnTextInput(canvas, pageNum, doc, x, y) {
  const container = canvas.parentElement;
  const input = document.createElement('textarea');
  input.className = 'text-annotation-input';
  input.style.color = currentColor;
  input.setAttribute('aria-label', 'Text annotation field. Type your text here and click away to bake it.');
  
  // Sizing relative to viewport CSS pixels
  const computedSize = 8; // Default text size of around 8px
  const displaySize = computedSize * zoomLevel;
  
  input.style.left = (x * zoomLevel) + 'px';
  input.style.top = ((y - 10) * zoomLevel) + 'px';
  input.style.fontSize = displaySize + 'px';
  input.style.width = (80 * zoomLevel) + 'px'; // Compact initial width
  input.style.height = (displaySize + 4) + 'px'; // Compact initial height
  
  container.appendChild(input);
  input.focus();

  // Keep within canvas bounds initially
  keepElementInCanvasBounds(input, canvas);

  // Create temporary annotation object
  const tempAnnot = {
    type: 'text',
    text: '',
    x: parseFloat(input.style.left) / zoomLevel,
    y: (parseFloat(input.style.top) / zoomLevel) + 10,
    color: currentColor,
    fontSize: computedSize,
    bold: false,
    italic: false,
    underline: false,
    strikethrough: false
  };

  // Show panel immediately, passing input as active text input
  showTextFormattingPanel(tempAnnot, pageNum, canvas, input);

  // Auto-resize textarea as they type and keep in bounds
  input.addEventListener('input', () => {
    // Auto-resize width
    const tempCanvas = document.createElement('canvas');
    const tempCtx = tempCanvas.getContext('2d');
    tempCtx.font = `${tempAnnot.italic ? 'italic ' : ''}${tempAnnot.bold ? 'bold ' : ''}${tempAnnot.fontSize * zoomLevel}px 'Plus Jakarta Sans', system-ui, sans-serif`;
    
    const lines = input.value.split('\n');
    let maxW = 0;
    lines.forEach(l => {
      const w = tempCtx.measureText(l).width;
      if (w > maxW) maxW = w;
    });
    
    const minWidth = 80 * zoomLevel;
    const maxWidth = canvas.offsetWidth - parseFloat(input.style.left) - 10;
    input.style.width = Math.min(maxWidth, Math.max(minWidth, maxW + 20)) + 'px';

    input.style.height = 'auto';
    input.style.height = input.scrollHeight + 'px';
    
    keepElementInCanvasBounds(input, canvas, tempAnnot);
    repositionTextFormattingPanel(tempAnnot, canvas, input);
  });

  input.addEventListener('blur', () => {
    // Wait slightly to see if user clicked formatting panel buttons
    setTimeout(() => {
      if (document.activeElement && document.activeElement.closest('.text-format-panel')) {
        return; // Clicked formatting panel, don't commit yet
      }

      if (input.value.trim() !== '') {
        tempAnnot.text = input.value;
        doc.annotations[pageNum].push(tempAnnot);
        addUndoAction(doc, { type: 'add', pageNum: pageNum, annotation: tempAnnot });
        checkUnsavedChanges(doc);
        redrawAnnotations(canvas, pageNum, doc);
      }
      hideTextFormattingPanel();
      input.remove();
    }, 150);
  });
}

// Click to erase check (scaled by zoom)
function eraseAtPos(pageNum, doc, x, y) {
  const annots = doc.annotations[pageNum];
  const tolerance = 20 / zoomLevel; // Screen distance 20px normalized to PDF points
  let changed = false;

  for (let i = annots.length - 1; i >= 0; i--) {
    const ann = annots[i];
    if (ann.type === 'pen' || ann.type === 'highlighter') {
      for (const pt of ann.points) {
        const dist = Math.hypot(pt.x - x, pt.y - y);
        if (dist < tolerance) {
          const deletedAnnot = annots.splice(i, 1)[0];
          addUndoAction(doc, { type: 'delete', pageNum: pageNum, annotation: deletedAnnot, index: i });
          changed = true;
          break;
        }
      }
    } else if (ann.type === 'text') {
      if (Math.abs(ann.x - x) < (60 / zoomLevel) && Math.abs(ann.y - y) < (15 / zoomLevel)) {
        const deletedAnnot = annots.splice(i, 1)[0];
        addUndoAction(doc, { type: 'delete', pageNum: pageNum, annotation: deletedAnnot, index: i });
        changed = true;
      }
    } else {
      // Shapes boundary check
      const cx = (ann.startX + ann.endX) / 2;
      const cy = (ann.startY + ann.endY) / 2;
      if (Math.hypot(cx - x, cy - y) < Math.max(Math.abs(ann.startX - ann.endX) / 2 + (10 / zoomLevel), tolerance)) {
        const deletedAnnot = annots.splice(i, 1)[0];
        addUndoAction(doc, { type: 'delete', pageNum: pageNum, annotation: deletedAnnot, index: i });
        changed = true;
      }
    }
  }

  if (changed) {
    checkUnsavedChanges(doc);
  }
}

// Renders the annotations vector array onto canvas using transform scale matrix
function redrawAnnotations(canvas, pageNum, doc, activePath = null, activeShape = null, customScale = null) {
  const ctx = canvas.getContext('2d');
  ctx.clearRect(0, 0, canvas.width, canvas.height);

  let drawScale = customScale;
  if (drawScale === null) {
    const cssWidth = canvas.style.width ? parseFloat(canvas.style.width) : (canvas.width / (window.devicePixelRatio || 1));
    const currentZoom = parseFloat(canvas.dataset.renderedZoom) || zoomLevel;
    // Calculate exact scale factor from raw PDF points to backing store pixels
    drawScale = currentZoom * (canvas.width / cssWidth);
  }
  
  // Set scale matrix to draw in raw 1.0 scale PDF Points
  ctx.setTransform(drawScale, 0, 0, drawScale, 0, 0);

  // Set high quality context parameters
  ctx.imageSmoothingEnabled = true;
  ctx.imageSmoothingQuality = 'high';

  const all = [...(doc.annotations[pageNum] || [])];
  if (activePath) all.push(activePath);
  if (activeShape) all.push(activeShape);

  all.forEach(ann => {
    ctx.beginPath();
    
    if (ann.type === 'pen' || ann.type === 'highlighter') {
      ctx.globalCompositeOperation = ann.type === 'highlighter' ? 'multiply' : 'source-over';
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = ann.thickness;
      ctx.globalAlpha = ann.type === 'highlighter' ? 0.45 : 1.0;
      ctx.lineCap = 'round';
      ctx.lineJoin = 'round';

      if (ann.points.length > 0) {
        if (ann.points.length === 1) {
          // Draw a small solid circular dot for single-click inputs
          ctx.fillStyle = ann.color;
          ctx.arc(ann.points[0].x, ann.points[0].y, ann.thickness / 2, 0, Math.PI * 2);
          ctx.fill();
        } else if (ann.points.length === 2) {
          ctx.moveTo(ann.points[0].x, ann.points[0].y);
          ctx.lineTo(ann.points[1].x, ann.points[1].y);
          ctx.stroke();
        } else {
          // Smooth curve using quadratic curve midpoint interpolation
          ctx.moveTo(ann.points[0].x, ann.points[0].y);
          let i;
          for (i = 1; i < ann.points.length - 1; i++) {
            const xc = (ann.points[i].x + ann.points[i + 1].x) / 2;
            const yc = (ann.points[i].y + ann.points[i + 1].y) / 2;
            ctx.quadraticCurveTo(ann.points[i].x, ann.points[i].y, xc, yc);
          }
          ctx.lineTo(ann.points[ann.points.length - 1].x, ann.points[ann.points.length - 1].y);
          ctx.stroke();
        }
      }
    } 
    else if (ann.type === 'text') {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1.0;
      ctx.fillStyle = ann.color;
      
      let fontStyle = '';
      if (ann.italic) fontStyle += 'italic ';
      if (ann.bold) fontStyle += 'bold ';
      
      ctx.font = `${fontStyle}${ann.fontSize}px 'Plus Jakarta Sans', system-ui, sans-serif`;
      ctx.textBaseline = 'middle';
      
      const lines = ann.text.split('\n');
      lines.forEach((l, idx) => {
        const textY = ann.y + (idx * ann.fontSize * 1.2);
        ctx.fillText(l, ann.x, textY);
        
        const textWidth = ctx.measureText(l).width;
        const lineThickness = Math.max(1.5, ann.fontSize / 15);
        
        if (ann.underline) {
          ctx.save();
          ctx.strokeStyle = ann.color;
          ctx.lineWidth = lineThickness;
          ctx.beginPath();
          ctx.moveTo(ann.x, textY + ann.fontSize / 2);
          ctx.lineTo(ann.x + textWidth, textY + ann.fontSize / 2);
          ctx.stroke();
          ctx.restore();
        }
        
        if (ann.strikethrough) {
          ctx.save();
          ctx.strokeStyle = ann.color;
          ctx.lineWidth = lineThickness;
          ctx.beginPath();
          ctx.moveTo(ann.x, textY);
          ctx.lineTo(ann.x + textWidth, textY);
          ctx.stroke();
          ctx.restore();
        }
      });

      // If this text annotation is selected, draw a subtle selection bounding box around it
      if (currentTool === 'select' && selectedTextAnnotation === ann) {
        ctx.save();
        ctx.strokeStyle = '#000000';
        ctx.lineWidth = 1;
        ctx.setLineDash([4, 4]);
        
        let maxWidth = 0;
        lines.forEach(l => {
          const w = ctx.measureText(l).width;
          if (w > maxWidth) maxWidth = w;
        });
        const height = lines.length * ann.fontSize * 1.2;
        
        ctx.strokeRect(
          ann.x - 4, 
          ann.y - ann.fontSize / 2 - 4, 
          maxWidth + 8, 
          height + 8
        );
        ctx.restore();
      }
    }
    else {
      ctx.globalCompositeOperation = 'source-over';
      ctx.globalAlpha = 1.0;
      ctx.strokeStyle = ann.color;
      ctx.lineWidth = ann.thickness;

      if (ann.type === 'box') {
        ctx.rect(ann.startX, ann.startY, ann.endX - ann.startX, ann.endY - ann.startY);
        ctx.stroke();
      } else if (ann.type === 'line') {
        ctx.moveTo(ann.startX, ann.startY);
        ctx.lineTo(ann.endX, ann.endY);
        ctx.stroke();
      } else if (ann.type === 'circle') {
        const radius = Math.hypot(ann.endX - ann.startX, ann.endY - ann.startY);
        ctx.arc(ann.startX, ann.startY, radius, 0, Math.PI * 2);
        ctx.stroke();
      } else if (ann.type === 'arrow') {
        ctx.moveTo(ann.startX, ann.startY);
        ctx.lineTo(ann.endX, ann.endY);
        ctx.stroke();
        
        const angle = Math.atan2(ann.endY - ann.startY, ann.endX - ann.startX);
        const headlen = 10 + ann.thickness;
        ctx.beginPath();
        ctx.moveTo(ann.endX, ann.endY);
        ctx.lineTo(ann.endX - headlen * Math.cos(angle - Math.PI / 6), ann.endY - headlen * Math.sin(angle - Math.PI / 6));
        ctx.moveTo(ann.endX, ann.endY);
        ctx.lineTo(ann.endX - headlen * Math.cos(angle + Math.PI / 6), ann.endY - headlen * Math.sin(angle + Math.PI / 6));
        ctx.stroke();
      }
    }
  });
  
  // Restore transform to default identity
  ctx.setTransform(1, 0, 0, 1, 0, 0);
  ctx.globalAlpha = 1.0;
  ctx.globalCompositeOperation = 'source-over';
}

// Bakes drawings onto raw PDF bytes at 3.0x ultra-high resolution and saves
async function savePdf() {
  const doc = openDocs.find(d => d.id === activeDocId);
  if (!doc) return false;

  try {
    const pdfLibDoc = await PDFLib.PDFDocument.load(doc.bytes);
    const pages = pdfLibDoc.getPages();

    for (let pageNum = 1; pageNum <= doc.pageCount; pageNum++) {
      if (doc.annotations[pageNum] && doc.annotations[pageNum].length > 0) {
        const page = pages[pageNum - 1];
        if (!page) continue;
        const pageWidth = page.getWidth();
        const pageHeight = page.getHeight();
        
        // High-res bake (scale up for PDF crispness)
        const bakeCanvas = document.createElement('canvas');
        const scale = 3.0; 
        
        bakeCanvas.width = pageWidth * scale;
        bakeCanvas.height = pageHeight * scale;
        
        // Render onto high-res canvas at scale 3.0 (removes blurriness)
        redrawAnnotations(bakeCanvas, pageNum, doc, null, null, scale);
        
        const pngUrl = bakeCanvas.toDataURL('image/png');
        const pngImage = await pdfLibDoc.embedPng(pngUrl);
        
        page.drawImage(pngImage, {
          x: 0,
          y: 0,
          width: pageWidth,
          height: pageHeight
        });
      }
    }

    const savedBytes = await pdfLibDoc.save();
    
    // Save to disk
    if (doc.filePath) {
      if (!window.api || typeof window.api.saveFileDirectly !== 'function') {
        alert('Direct saving is only supported in desktop mode.');
        return false;
      }
      await window.api.saveFileDirectly(doc.filePath, savedBytes);
      doc.bytes = savedBytes;
      doc.baselineState = JSON.stringify(doc.annotations);
      checkUnsavedChanges(doc);
      alert('Saved changes successfully!');
      return true;
    } else {
      if (!window.api || typeof window.api.saveFileDialog !== 'function') {
        alert('File dialogs are only supported in desktop mode.');
        return false;
      }
      const result = await window.api.saveFileDialog(doc.name, savedBytes);
      if (result) {
        doc.filePath = result.filePath;
        doc.name = result.name;
        doc.bytes = savedBytes;
        doc.baselineState = JSON.stringify(doc.annotations);
        checkUnsavedChanges(doc);
        alert('Saved changes successfully!');
        return true;
      } else {
        return false;
      }
    }

  } catch(e) {
    console.error('Save error:', e);
    alert('Error saving PDF.');
    return false;
  }
}

// Snapping helper for highlighter tool
function snapToNearestTextSpan(pageNum, x, y) {
  const container = scrollContainer.querySelector(`.page-container[data-page="${pageNum}"]`);
  if (!container) return null;
  
  const textLayer = container.querySelector('.textLayer');
  if (!textLayer) return null;
  
  const spans = textLayer.querySelectorAll('span');
  if (spans.length === 0) return null;
  
  let nearestSpan = null;
  let minDistance = Infinity;
  
  const containerRect = container.getBoundingClientRect();
  const drawCanvas = container.querySelector('.drawing-canvas');
  const pageZoom = drawCanvas ? (parseFloat(drawCanvas.dataset.renderedZoom) || zoomLevel) : zoomLevel;
  
  spans.forEach(span => {
    const spanRect = span.getBoundingClientRect();
    // Calculate coordinates relative to page container, then convert to raw PDF points using rendered pageZoom
    const spanX = (spanRect.left - containerRect.left) / pageZoom;
    const spanY = (spanRect.top - containerRect.top) / pageZoom;
    const spanW = spanRect.width / pageZoom;
    const spanH = spanRect.height / pageZoom;
    
    const centerY = spanY + spanH / 2;
    const vDist = Math.abs(y - centerY);
    const isHorizontalOverlap = (x >= spanX - 15) && (x <= spanX + spanW + 15);
    
    if (isHorizontalOverlap && vDist < 20 && vDist < minDistance) {
      minDistance = vDist;
      nearestSpan = { y: centerY, height: spanH };
    }
  });
  
  return nearestSpan;
}

// Synchronize toolbar button active styling based on currentTool
function syncToolbarButtons() {
  const btnShapeSelect = document.getElementById('btn-shape-select');
  const shapesDropdown = document.getElementById('shapes-dropdown');
  const shapeItems = shapesDropdown.querySelectorAll('.dropdown-item');
  const btnLaser = document.getElementById('btn-laser');
  
  // Reset all main tool buttons
  toolBtns.forEach(b => {
    if (b.dataset.tool === currentTool) {
      b.classList.add('active');
      b.setAttribute('aria-pressed', 'true');
    } else {
      b.classList.remove('active');
      b.setAttribute('aria-pressed', 'false');
    }
  });
  
  // Check if currentTool is a shape
  const activeShapeItem = Array.from(shapeItems).find(si => si.dataset.tool === currentTool);
  if (activeShapeItem) {
    btnShapeSelect.classList.add('active');
    btnShapeSelect.setAttribute('aria-pressed', 'true');
    shapeItems.forEach(si => si.classList.toggle('active', si === activeShapeItem));
    document.getElementById('shape-active-icon').innerHTML = activeShapeItem.querySelector('svg').innerHTML;
  } else {
    btnShapeSelect.classList.remove('active');
    btnShapeSelect.setAttribute('aria-pressed', 'false');
    shapeItems.forEach(si => si.classList.remove('active'));
  }
}

// Dual-pass canvas-based glowing fading laser pen animation loop
function runLaserLoop() {
  if (laserLoopRunning) return;
  laserLoopRunning = true;
  
  const canvas = document.getElementById('laser-canvas');
  if (!canvas) return;
  canvas.style.display = 'block';
  const ctx = canvas.getContext('2d');
  
  function tick() {
    const now = Date.now();
    
    // Filter out expired points
    laserTrailPoints = laserTrailPoints.filter(p => now - p.time < laserTrailDuration);
    
    // Resize canvas if needed (accounting for High-DPI device pixel ratio)
    const dpr = window.devicePixelRatio || 1;
    const targetWidth = Math.floor(window.innerWidth * dpr);
    const targetHeight = Math.floor(window.innerHeight * dpr);
    
    if (canvas.width !== targetWidth || canvas.height !== targetHeight) {
      canvas.width = targetWidth;
      canvas.height = targetHeight;
    }
    
    ctx.clearRect(0, 0, canvas.width, canvas.height);
    
    if (laserTrailPoints.length > 0) {
      if (laserTrailPoints.length > 1) {
        ctx.save();
        ctx.scale(dpr, dpr);
        
        // Pass 1: Outer glow aura (thick, lower opacity)
        for (let i = 1; i < laserTrailPoints.length; i++) {
          const p1 = laserTrailPoints[i - 1];
          const p2 = laserTrailPoints[i];
          const age = now - p2.time;
          const ratio = Math.max(0, Math.min(1, age / laserTrailDuration));
          const alpha = (1.0 - ratio) * 0.25;
          
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          
          ctx.strokeStyle = currentColor;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = 6;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke();
        }
        
        // Pass 2: Inner glow aura (medium width, higher opacity)
        for (let i = 1; i < laserTrailPoints.length; i++) {
          const p1 = laserTrailPoints[i - 1];
          const p2 = laserTrailPoints[i];
          const age = now - p2.time;
          const ratio = Math.max(0, Math.min(1, age / laserTrailDuration));
          const alpha = (1.0 - ratio) * 0.6;
          
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          
          ctx.strokeStyle = currentColor;
          ctx.globalAlpha = alpha;
          ctx.lineWidth = 4;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke();
        }
        
        // Pass 3: Core (bright center core)
        for (let i = 1; i < laserTrailPoints.length; i++) {
          const p1 = laserTrailPoints[i - 1];
          const p2 = laserTrailPoints[i];
          const age = now - p2.time;
          const ratio = Math.max(0, Math.min(1, age / laserTrailDuration));
          const alpha = 1.0 - ratio;
          
          ctx.beginPath();
          ctx.moveTo(p1.x, p1.y);
          ctx.lineTo(p2.x, p2.y);
          
          ctx.strokeStyle = '#ffffff';
          ctx.globalAlpha = alpha;
          ctx.lineWidth = 1.5;
          ctx.lineCap = 'round';
          ctx.lineJoin = 'round';
          ctx.stroke();
        }
        
        ctx.restore();
      }
      
      // Reset values
      ctx.globalAlpha = 1.0;
      
      requestAnimationFrame(tick);
    } else {
      laserLoopRunning = false;
      laserTrailPoints = [];
      ctx.clearRect(0, 0, canvas.width, canvas.height);
      canvas.style.display = 'none';
    }
  }
  
  requestAnimationFrame(tick);
}

// Dynamic window title and header titlebar updater with unsaved asterisk indicator
function updateAppTitle() {
  const titleEl = document.querySelector('#titlebar .app-title');
  if (titleEl) {
    titleEl.innerHTML = `PDFpresent <span class="app-author">Built by Somansh Garg ${appVersion}</span>`;
  }
  document.title = `PDFpresent by Somansh Garg ${appVersion}`;
}

// Toggle page indicator visibility based on mouse coordinate vicinity
function updatePageIndicatorVisibility(mouseX, mouseY) {
  const pageIndicator = document.getElementById('page-indicator');
  if (!pageIndicator || openDocs.length === 0) return;

  const vicinityY = window.innerHeight - 75; // Small vicinity area (75px from bottom)
  const vicinityXStart = window.innerWidth / 2 - 180;
  const vicinityXEnd = window.innerWidth / 2 + 180;

  const inVicinity = mouseY > vicinityY && mouseX > vicinityXStart && mouseX < vicinityXEnd;

  const rect = pageIndicator.getBoundingClientRect();
  const isOverIndicator = mouseX >= rect.left && mouseX <= rect.right &&
                          mouseY >= rect.top && mouseY <= rect.bottom;

  if (inVicinity || isOverIndicator) {
    pageIndicator.classList.add('visible');
    mouseWasInVicinity = true;
    lastTimeInVicinity = Date.now();
    if (pageIndicatorShowTimer) {
      clearTimeout(pageIndicatorShowTimer);
      pageIndicatorShowTimer = null;
    }
  } else {
    // If the mouse was in the vicinity and has now left, hide immediately
    if (mouseWasInVicinity) {
      mouseWasInVicinity = false;
      
      // Blur the input to commit any changes and release focus
      const pageInput = document.getElementById('current-page-input');
      if (pageInput && document.activeElement === pageInput) {
        pageInput.blur();
      }
      
      pageIndicator.classList.remove('visible');
      if (pageIndicatorShowTimer) {
        clearTimeout(pageIndicatorShowTimer);
        pageIndicatorShowTimer = null;
      }
    } else {
      // If we were just scrolling and never hovered the vicinity, respect the scroll timer
      if (!pageIndicatorShowTimer) {
        pageIndicator.classList.remove('visible');
      }
    }
  }
}

// Show the page indicator temporarily (e.g. on scroll page transition)
function triggerPageIndicatorTemporaryShow(duration = 2000) {
  const pageIndicator = document.getElementById('page-indicator');
  if (!pageIndicator || openDocs.length === 0) return;

  pageIndicator.classList.add('visible');
  if (pageIndicatorShowTimer) clearTimeout(pageIndicatorShowTimer);

  pageIndicatorShowTimer = setTimeout(() => {
    pageIndicatorShowTimer = null;
    updatePageIndicatorVisibility(lastMouseX, lastMouseY);
  }, duration);
}

// Helper to calculate distance from a point to a line segment
function getDistanceToSegment(x, y, x1, y1, x2, y2) {
  const A = x - x1;
  const B = y - y1;
  const C = x2 - x1;
  const D = y2 - y1;

  const dot = A * C + B * D;
  const lenSq = C * C + D * D;
  let param = -1;
  if (lenSq !== 0) {
    param = dot / lenSq;
  }

  let xx, yy;

  if (param < 0) {
    xx = x1;
    yy = y1;
  } else if (param > 1) {
    xx = x2;
    yy = y2;
  } else {
    xx = x1 + param * C;
    yy = y1 + param * D;
  }

  const dx = x - xx;
  const dy = y - yy;
  return Math.hypot(dx, dy);
}

// Helper to check if mouse is over any user-created annotation on a page
function findAnnotationAtPosition(pageNum, x, y) {
  const doc = openDocs.find(d => d.id === activeDocId);
  if (!doc || !doc.annotations[pageNum]) return null;

  const annots = doc.annotations[pageNum];
  const tolerance = 8; // base hit target padding in PDF points

  // Create temporary canvas context to measure text width
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');

  // Loop in reverse order to find the topmost annotation first
  for (let i = annots.length - 1; i >= 0; i--) {
    const ann = annots[i];

    if (ann.type === 'pen' || ann.type === 'highlighter') {
      for (let j = 0; j < ann.points.length - 1; j++) {
        const pt1 = ann.points[j];
        const pt2 = ann.points[j + 1];
        if (getDistanceToSegment(x, y, pt1.x, pt1.y, pt2.x, pt2.y) < (ann.thickness / 2 + tolerance)) {
          return ann;
        }
      }
    } else if (ann.type === 'text') {
      tempCtx.font = `${ann.fontSize}px 'Plus Jakarta Sans', system-ui, sans-serif`;
      const lines = ann.text.split('\n');
      let maxWidth = 0;
      lines.forEach(l => {
        const w = tempCtx.measureText(l).width;
        if (w > maxWidth) maxWidth = w;
      });
      const height = lines.length * ann.fontSize * 1.2;

      const x1 = ann.x;
      const x2 = ann.x + maxWidth;
      // Since baseline is middle, y ranges from y - fontSize/2 to y + height - fontSize/2
      const y1 = ann.y - ann.fontSize / 2;
      const y2 = ann.y - ann.fontSize / 2 + height;

      if (x >= x1 - tolerance && x <= x2 + tolerance && y >= y1 - tolerance && y <= y2 + tolerance) {
        return ann;
      }
    } else {
      // Shapes: box, circle, line, arrow
      if (ann.type === 'box') {
        const x1 = Math.min(ann.startX, ann.endX);
        const x2 = Math.max(ann.startX, ann.endX);
        const y1 = Math.min(ann.startY, ann.endY);
        const y2 = Math.max(ann.startY, ann.endY);

        if (x >= x1 - tolerance && x <= x2 + tolerance && y >= y1 - tolerance && y <= y2 + tolerance) {
          return ann;
        }
      } else if (ann.type === 'circle') {
        const radius = Math.hypot(ann.endX - ann.startX, ann.endY - ann.startY);
        const dist = Math.hypot(ann.startX - x, ann.startY - y);
        if (dist <= radius + tolerance) {
          return ann;
        }
      } else if (ann.type === 'line' || ann.type === 'arrow') {
        const dist = getDistanceToSegment(x, y, ann.startX, ann.startY, ann.endX, ann.endY);
        if (dist < (ann.thickness / 2 + tolerance)) {
          return ann;
        }
      }
    }
  }
  return null;
}

// Helper to get active resize handle for an annotation at a coordinate
function getResizeHandle(ann, x, y) {
  const tolerance = 8; // in PDF points

  if (ann.type === 'box') {
    const x1 = ann.startX;
    const y1 = ann.startY;
    const x2 = ann.endX;
    const y2 = ann.endY;

    if (Math.hypot(x - x1, y - y1) < tolerance) return 'tl';
    if (Math.hypot(x - x2, y - y1) < tolerance) return 'tr';
    if (Math.hypot(x - x1, y - y2) < tolerance) return 'bl';
    if (Math.hypot(x - x2, y - y2) < tolerance) return 'br';
  } else if (ann.type === 'line' || ann.type === 'arrow') {
    if (Math.hypot(x - ann.startX, y - ann.startY) < tolerance) return 'start';
    if (Math.hypot(x - ann.endX, y - ann.endY) < tolerance) return 'end';
  } else if (ann.type === 'circle') {
    const radius = Math.hypot(ann.endX - ann.startX, ann.endY - ann.startY);
    const dist = Math.hypot(ann.startX - x, ann.startY - y);
    if (Math.abs(dist - radius) < tolerance) {
      return 'edge';
    }
  }
  return null;
}

// Helper to map resize handle to a cursor stylesheet name
function getCursorForHandle(handle) {
  if (handle === 'tl' || handle === 'br') return 'nwse-resize';
  if (handle === 'tr' || handle === 'bl') return 'nesw-resize';
  if (handle === 'start' || handle === 'end') return 'crosshair';
  if (handle === 'edge') return 'nwse-resize';
  return 'move';
}

// Reposition floating text formatting panel relative to the text box and zoom
function repositionTextFormattingPanel(ann, canvas, input = null) {
  const panel = document.getElementById('text-format-panel');
  if (!panel) return;

  let left = ann.x * zoomLevel;
  let fontSize = ann.fontSize;
  
  // Measure height and top of textarea if provided, otherwise estimate annotation height/top
  const textHeight = input ? input.offsetHeight : getTextHeightEstimate(ann) * zoomLevel;
  const textTop = input ? parseFloat(input.style.top) : (ann.y - fontSize / 2) * zoomLevel;
  
  // Position exactly adjacent to top boundary (6px offset to touch with connective arrow stem)
  let top = textTop - panel.offsetHeight - 6;

  const canvasW = canvas.offsetWidth;
  const canvasH = canvas.offsetHeight;
  const panelW = panel.offsetWidth;
  const panelH = panel.offsetHeight;

  // Horizontal bounding
  if (left < 5) left = 5;
  if (left + panelW > canvasW - 5) left = canvasW - panelW - 5;

  panel.classList.remove('position-below');

  // Vertical bounding: if panel goes off the top border, place it below the text box
  if (top < 5) {
    top = textTop + textHeight + 6;
    panel.classList.add('position-below');
  }

  // Double check bottom bound
  if (top + panelH > canvasH - 5) {
    top = canvasH - panelH - 5;
  }

  panel.style.left = left + 'px';
  panel.style.top = top + 'px';
}

// Helper to estimate text width in PDF points
function getTextWidthEstimate(ann) {
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  let fontStyle = '';
  if (ann.italic) fontStyle += 'italic ';
  if (ann.bold) fontStyle += 'bold ';
  tempCtx.font = `${fontStyle}${ann.fontSize}px 'Plus Jakarta Sans', system-ui, sans-serif`;

  const lines = ann.text.split('\n');
  let maxWidth = 0;
  lines.forEach(l => {
    const w = tempCtx.measureText(l).width;
    if (w > maxWidth) maxWidth = w;
  });
  return maxWidth;
}

// Helper to estimate text height in PDF points
function getTextHeightEstimate(ann) {
  const lines = ann.text.split('\n');
  return lines.length * ann.fontSize * 1.2;
}

// Helper to keep interactive textareas within canvas area bounds
function keepElementInCanvasBounds(el, canvas, ann = null) {
  const rect = canvas.getBoundingClientRect();
  
  let left = parseFloat(el.style.left);
  let top = parseFloat(el.style.top);
  let width = parseFloat(el.style.width) || el.offsetWidth;
  let height = el.offsetHeight;
  
  const maxLeft = rect.width - width;
  const maxTop = rect.height - height;
  
  if (left < 5) left = 5;
  if (left > maxLeft - 5) left = Math.max(5, maxLeft - 5);
  if (top < 5) top = 5;
  if (top > maxTop - 5) top = Math.max(5, maxTop - 5);
  
  el.style.left = left + 'px';
  el.style.top = top + 'px';

  if (ann) {
    const canvasZoom = parseFloat(canvas.dataset.renderedZoom) || zoomLevel;
    ann.x = left / canvasZoom;
    ann.y = (top / canvasZoom) + 10; // offset the Y shift of -10 PDF points
  }
}

// Helper to apply current text formatting styles to active textarea input
function applyTextStyleToInput(ann, input) {
  if (!input) return;
  input.style.fontSize = (ann.fontSize * zoomLevel) + 'px';
  input.style.color = ann.color;
  input.style.fontWeight = ann.bold ? 'bold' : 'normal';
  input.style.fontStyle = ann.italic ? 'italic' : 'normal';
  
  let decorations = [];
  if (ann.underline) decorations.push('underline');
  if (ann.strikethrough) decorations.push('line-through');
  input.style.textDecoration = decorations.join(' ') || 'none';
  
  // Recalculate input width dynamically to keep it compact
  const tempCanvas = document.createElement('canvas');
  const tempCtx = tempCanvas.getContext('2d');
  tempCtx.font = `${ann.italic ? 'italic ' : ''}${ann.bold ? 'bold ' : ''}${ann.fontSize * zoomLevel}px 'Plus Jakarta Sans', system-ui, sans-serif`;
  
  const lines = input.value.split('\n');
  let maxW = 0;
  lines.forEach(l => {
    const w = tempCtx.measureText(l).width;
    if (w > maxW) maxW = w;
  });
  
  const minWidth = 80 * zoomLevel;
  const canvas = input.parentElement.querySelector('.drawing-canvas');
  const maxWidth = canvas ? (canvas.offsetWidth - parseFloat(input.style.left) - 10) : 400;
  input.style.width = Math.min(maxWidth, Math.max(minWidth, maxW + 20)) + 'px';

  // Recalculate input height
  input.style.height = 'auto';
  input.style.height = input.scrollHeight + 'px';
}

// Dynamic floating text formatting panel UI
function showTextFormattingPanel(ann, pageNum, canvas, input = null) {
  // Remove existing panel first
  const existing = document.getElementById('text-format-panel');
  if (existing) existing.remove();

  const panel = document.createElement('div');
  panel.id = 'text-format-panel';
  panel.className = 'text-format-panel';
  panel.setAttribute('role', 'toolbar');
  panel.setAttribute('aria-label', 'Text box formatting toolbar');

  // 1. Font Size Controls
  const btnDec = document.createElement('button');
  btnDec.className = 'panel-btn';
  btnDec.innerText = '-';
  btnDec.title = 'Decrease Font Size';
  btnDec.addEventListener('click', (e) => {
    e.stopPropagation();
    ann.fontSize = Math.max(4, ann.fontSize - 2);
    sizeLabel.innerText = Math.round(ann.fontSize) + 'px';
    if (input) {
      applyTextStyleToInput(ann, input);
      keepElementInCanvasBounds(input, canvas, ann);
    } else {
      redrawAnnotations(canvas, pageNum, openDocs.find(d => d.id === activeDocId));
    }
    repositionTextFormattingPanel(ann, canvas, input);
  });

  const sizeLabel = document.createElement('span');
  sizeLabel.className = 'panel-label';
  sizeLabel.innerText = Math.round(ann.fontSize) + 'px';

  const btnInc = document.createElement('button');
  btnInc.className = 'panel-btn';
  btnInc.innerText = '+';
  btnInc.title = 'Increase Font Size';
  btnInc.addEventListener('click', (e) => {
    e.stopPropagation();
    ann.fontSize = Math.min(120, ann.fontSize + 2);
    sizeLabel.innerText = Math.round(ann.fontSize) + 'px';
    if (input) {
      applyTextStyleToInput(ann, input);
      keepElementInCanvasBounds(input, canvas, ann);
    } else {
      redrawAnnotations(canvas, pageNum, openDocs.find(d => d.id === activeDocId));
    }
    repositionTextFormattingPanel(ann, canvas, input);
  });

  panel.appendChild(btnDec);
  panel.appendChild(sizeLabel);
  panel.appendChild(btnInc);

  // Divider
  const div1 = document.createElement('div');
  div1.className = 'panel-divider';
  panel.appendChild(div1);

  // 2. Style Toggles (Bold, Italic, Underline, Strikethrough)
  const addStyleToggle = (labelHtml, prop, title) => {
    const btn = document.createElement('button');
    btn.className = 'panel-btn' + (ann[prop] ? ' active' : '');
    btn.innerHTML = labelHtml;
    btn.title = title;
    btn.addEventListener('click', (e) => {
      e.stopPropagation();
      ann[prop] = !ann[prop];
      btn.classList.toggle('active', ann[prop]);
      if (input) {
        applyTextStyleToInput(ann, input);
        keepElementInCanvasBounds(input, canvas, ann);
      } else {
        redrawAnnotations(canvas, pageNum, openDocs.find(d => d.id === activeDocId));
      }
      repositionTextFormattingPanel(ann, canvas, input);
    });
    panel.appendChild(btn);
  };

  addStyleToggle('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 4h8a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/><path d="M6 12h9a4 4 0 0 1 4 4 4 4 0 0 1-4 4H6z"/></svg>', 'bold', 'Bold');
  addStyleToggle('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><line x1="19" y1="4" x2="10" y2="4"/><line x1="14" y1="20" x2="5" y2="20"/><line x1="15" y1="4" x2="9" y2="20"/></svg>', 'italic', 'Italic');
  addStyleToggle('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M6 3v7a6 6 0 0 0 6 6 6 6 0 0 0 6-6V3"/><line x1="4" y1="21" x2="20" y2="21"/></svg>', 'underline', 'Underline');
  addStyleToggle('<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M16 4H9a3 3 0 0 0-2.83 4 4 4 0 0 0 3.71 3h4.24a4 4 0 0 1 3.71 3 3 3 0 0 1-2.83 4H7"/><line x1="4" y1="12" x2="20" y2="12"/></svg>', 'strikethrough', 'Strikethrough');

  // Divider
  const div2 = document.createElement('div');
  div2.className = 'panel-divider';
  panel.appendChild(div2);

  // 3. Color Selector Toggle Button
  const btnColor = document.createElement('button');
  btnColor.className = 'panel-btn';
  btnColor.title = 'Choose Color';
  btnColor.style.display = 'flex';
  btnColor.style.alignItems = 'center';
  btnColor.style.justifyContent = 'center';
  
  const colorInner = document.createElement('div');
  colorInner.className = 'color-preview-inner';
  colorInner.style.width = '14px';
  colorInner.style.height = '14px';
  colorInner.style.borderRadius = '50%';
  colorInner.style.backgroundColor = ann.color;
  colorInner.style.border = ann.color.toLowerCase() === '#ffffff' ? '1px solid rgba(0, 0, 0, 0.2)' : 'none';
  btnColor.appendChild(colorInner);
  
  btnColor.addEventListener('click', (e) => {
    e.stopPropagation();
    togglePanelColorPopover(ann, canvas, input, btnColor, panel);
  });
  
  panel.appendChild(btnColor);

  // Divider
  const div3 = document.createElement('div');
  div3.className = 'panel-divider';
  panel.appendChild(div3);

  // 4. Delete button
  const btnDelete = document.createElement('button');
  btnDelete.className = 'panel-btn delete-btn';
  btnDelete.title = 'Delete Text Box';
  btnDelete.innerHTML = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M3 6h18m-2 0v14c0 1-1 2-2 2H7c-1 0-2-1-2-2V6m3 0V4c0-1 1-2 2-2h4c1 0 2 1 2 2v2m-9 5v6m4-6v6"/></svg>';
  btnDelete.addEventListener('click', (e) => {
    e.stopPropagation();
    
    if (input) {
      input.value = '';
      input.blur();
      return;
    }

    const doc = openDocs.find(d => d.id === activeDocId);
    if (!doc) return;

    const annots = doc.annotations[pageNum];
    const idx = annots.indexOf(ann);
    if (idx !== -1) {
      const deleted = annots.splice(idx, 1)[0];
      selectedTextAnnotation = null;
      selectedTextPageNum = null;
      textFormatInitialState = null;
      panel.remove();
      
      addUndoAction(doc, { type: 'delete', pageNum: pageNum, annotation: deleted, index: idx });
      checkUnsavedChanges(doc);
      redrawAnnotations(canvas, pageNum, doc);
    }
  });
  panel.appendChild(btnDelete);

  // Prevent event bubbling AND prevent default to avoid blurring textareas
  panel.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });

  // Position it at 0, 0 first so we can measure panel offset height/width
  panel.style.left = '0px';
  panel.style.top = '0px';
  canvas.parentElement.appendChild(panel);
  
  repositionTextFormattingPanel(ann, canvas, input);
}

// Hide text formatting panel and commit formatting changes to undo stack
function hideTextFormattingPanel() {
  const panel = document.getElementById('text-format-panel');
  if (panel) {
    panel.remove();
  }

  const popover = document.getElementById('panel-color-popover');
  if (popover) {
    popover.remove();
  }

  if (selectedTextAnnotation && textFormatInitialState) {
    const ann = selectedTextAnnotation;
    const initial = textFormatInitialState;
    const doc = openDocs.find(d => d.id === activeDocId);

    const changed = ann.fontSize !== initial.fontSize ||
                    ann.color !== initial.color ||
                    !!ann.bold !== !!initial.bold ||
                    !!ann.italic !== !!initial.italic ||
                    !!ann.underline !== !!initial.underline ||
                    !!ann.strikethrough !== !!initial.strikethrough;

    if (changed && doc) {
      addUndoAction(doc, {
        type: 'modify',
        pageNum: selectedTextPageNum,
        annotation: ann,
        oldState: initial,
        newState: JSON.parse(JSON.stringify(ann))
      });
      checkUnsavedChanges(doc);
    }
  }

  const prevSelectedPageNum = selectedTextPageNum;
  selectedTextAnnotation = null;
  selectedTextPageNum = null;
  textFormatInitialState = null;

  // ALWAYS redraw the active page container to clear the dashed selection border
  if (prevSelectedPageNum) {
    const doc = openDocs.find(d => d.id === activeDocId);
    if (doc) {
      const pageEl = document.querySelector(`.page-container[data-page="${prevSelectedPageNum}"]`);
      if (pageEl) {
        const canvas = pageEl.querySelector('.drawing-canvas');
        if (canvas) redrawAnnotations(canvas, prevSelectedPageNum, doc);
      }
    }
  }
}

// Toggle color selection submenu popover for text formatting panel
function togglePanelColorPopover(ann, canvas, input, btnColor, panel) {
  let popover = document.getElementById('panel-color-popover');
  if (popover) {
    popover.remove();
    return;
  }
  
  popover = document.createElement('div');
  popover.id = 'panel-color-popover';
  popover.className = 'panel-color-popover';
  
  // 1. Swatches grid
  const grid = document.createElement('div');
  grid.className = 'panel-color-popover-grid';
  
  const defaultColors = ['#3b82f6', '#f59e0b', '#ef4444', '#10b981', '#ffffff', '#111827'];
  defaultColors.forEach(c => {
    const swatch = document.createElement('button');
    swatch.className = 'popover-swatch';
    swatch.style.backgroundColor = c;
    swatch.setAttribute('data-color', c);
    if (ann.color.toLowerCase() === c.toLowerCase()) {
      swatch.classList.add('active');
    }
    
    swatch.addEventListener('click', (e) => {
      e.stopPropagation();
      ann.color = c;
      const inner = btnColor.querySelector('.color-preview-inner');
      if (inner) {
        inner.style.backgroundColor = c;
        inner.style.border = c.toLowerCase() === '#ffffff' ? '1px solid rgba(0, 0, 0, 0.2)' : 'none';
      }
      
      if (input) {
        applyTextStyleToInput(ann, input);
      } else {
        redrawAnnotations(canvas, selectedTextPageNum || 1, openDocs.find(d => d.id === activeDocId));
      }
      popover.remove();
    });
    
    grid.appendChild(swatch);
  });
  
  popover.appendChild(grid);
  
  // 2. Custom Picker row
  const customRow = document.createElement('div');
  customRow.className = 'custom-row';
  
  const customLabel = document.createElement('span');
  customLabel.className = 'custom-label';
  customLabel.innerText = 'Custom';
  customRow.appendChild(customLabel);
  
  const customBtn = document.createElement('div');
  customBtn.className = 'custom-preview-btn';
  
  const customInput = document.createElement('input');
  customInput.type = 'color';
  customInput.value = defaultColors.includes(ann.color.toLowerCase()) ? '#3b82f6' : ann.color;
  customInput.addEventListener('input', (e) => {
    const c = e.target.value;
    ann.color = c;
    const inner = btnColor.querySelector('.color-preview-inner');
    if (inner) {
      inner.style.backgroundColor = c;
      inner.style.border = 'none';
    }
    
    if (input) {
      applyTextStyleToInput(ann, input);
    } else {
      redrawAnnotations(canvas, selectedTextPageNum || 1, openDocs.find(d => d.id === activeDocId));
    }
  });
  
  customInput.addEventListener('change', () => {
    popover.remove();
  });
  
  customBtn.appendChild(customInput);
  customRow.appendChild(customBtn);
  popover.appendChild(customRow);
  
  // Prevent blurring active inputs
  popover.addEventListener('mousedown', (e) => {
    e.preventDefault();
    e.stopPropagation();
  });
  
  canvas.parentElement.appendChild(popover);
  
  // Position popover relative to formatting panel
  const panelLeft = parseFloat(panel.style.left);
  const panelTop = parseFloat(panel.style.top);
  
  const popoverLeft = panelLeft + btnColor.offsetLeft + (btnColor.offsetWidth / 2) - (popover.offsetWidth / 2);
  let popoverTop = panelTop - popover.offsetHeight - 5;
  
  if (panel.classList.contains('position-below') || popoverTop < 5) {
    popoverTop = panelTop + panel.offsetHeight + 5;
  }
  
  popover.style.left = Math.max(5, popoverLeft) + 'px';
  popover.style.top = popoverTop + 'px';
}

// Startup
document.addEventListener('DOMContentLoaded', init);
