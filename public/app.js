// ColorDock Unified Client Controller

const API_BASE = '/api';

/* ═══════════════════════════════════════════════════════
   THEME MANAGEMENT
═══════════════════════════════════════════════════════ */
function initTheme() {
    const stored = localStorage.getItem('colorDockTheme') || 'dark';
    applyTheme(stored);
}

function applyTheme(theme) {
    document.documentElement.setAttribute('data-theme', theme);
    const icon  = document.getElementById('theme-icon');
    const label = document.getElementById('theme-label');
    if (icon)  icon.textContent  = theme === 'dark' ? '🌙' : '☀️';
    if (label) label.textContent = theme === 'dark' ? '다크 모드' : '라이트 모드';
    localStorage.setItem('colorDockTheme', theme);
}

function toggleTheme() {
    const current = document.documentElement.getAttribute('data-theme') || 'dark';
    applyTheme(current === 'dark' ? 'light' : 'dark');
}

/* ═══════════════════════════════════════════════════════
   CUSTOM SELECT COMPONENT
   Usage: new CustomSelect(nativeSelectEl)
   - Wraps a native <select> with a styled custom dropdown
   - Syncs value and fires 'change' on the native element
═══════════════════════════════════════════════════════ */
const EFFECT_ICONS = {
    'sync':        '🔗',
    'static':      '🎨',
    'rainbow':     '🌈',
    'breathing':   '💫',
    'strobe':      '⚡',
    'wave':        '🌊',
    'temperature': '🌡️',
    'music':       '🎵',
    'screen':      '🖥️',
    'game':        '🎮',
    'disabled':    '⬛',
    'forward':     '→',
    'reverse':     '←',
    'center-out':  '↔',
    'outside-in':  '⟶',
};

class CustomSelect {
    constructor(nativeSelect) {
        if (!nativeSelect || nativeSelect._customSelectAttached) return;
        nativeSelect._customSelectAttached = true;
        this.native = nativeSelect;

        // Build wrapper
        this.wrapper = document.createElement('div');
        this.wrapper.className = 'custom-select';
        // Copy any inline style width
        if (nativeSelect.style.width) this.wrapper.style.width = nativeSelect.style.width;

        // Trigger
        this.trigger = document.createElement('div');
        this.trigger.className = 'custom-select-trigger';
        this.trigger.setAttribute('tabindex', '0');
        this.trigger.setAttribute('role', 'combobox');
        this.trigger.setAttribute('aria-expanded', 'false');

        this.labelEl = document.createElement('span');
        this.labelEl.className = 'custom-select-label';

        const arrow = document.createElementNS('http://www.w3.org/2000/svg','svg');
        arrow.setAttribute('viewBox','0 0 16 16');
        arrow.setAttribute('fill','none');
        arrow.setAttribute('class','custom-select-arrow');
        arrow.innerHTML = '<path d="M3 5.5L8 10.5L13 5.5" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"/>';

        this.trigger.append(this.labelEl, arrow);

        // Dropdown panel
        this.dropdown = document.createElement('div');
        this.dropdown.className = 'custom-select-dropdown';
        this.dropdown.setAttribute('role', 'listbox');

        this.wrapper.append(this.trigger, this.dropdown);

        // Insert before native, then hide native
        nativeSelect.parentNode.insertBefore(this.wrapper, nativeSelect);
        nativeSelect.classList.add('cs-hidden');
        this.wrapper.appendChild(nativeSelect); // keep in DOM for form/event compatibility

        this._buildOptions();
        this._setLabel(nativeSelect.value);

        // Events
        this.trigger.addEventListener('click', (e) => { e.stopPropagation(); this._toggle(); });
        this.trigger.addEventListener('keydown', (e) => {
            if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); this._toggle(); }
            if (e.key === 'Escape') this._close();
            if (e.key === 'ArrowDown') { e.preventDefault(); this._moveFocus(1); }
            if (e.key === 'ArrowUp')   { e.preventDefault(); this._moveFocus(-1); }
        });
        document.addEventListener('click', () => this._close());
        this.dropdown.addEventListener('click', e => e.stopPropagation());

        // Watch native changes (for programmatic updates)
        nativeSelect.addEventListener('_csUpdate', () => {
            this._buildOptions();
            this._setLabel(nativeSelect.value);
        });
    }

    _buildOptions() {
        this.dropdown.innerHTML = '';
        Array.from(this.native.options).forEach((opt, i) => {
            const el = document.createElement('div');
            el.className = 'custom-select-option' + (opt.value === this.native.value ? ' selected' : '');
            el.setAttribute('role', 'option');
            el.dataset.value = opt.value;
            el.dataset.index = i;

            const icon = EFFECT_ICONS[opt.value] || '';
            el.innerHTML = icon
                ? `<span class="opt-icon">${icon}</span><span class="opt-label">${opt.text}</span>`
                : `<span class="opt-label">${opt.text}</span>`;

            el.addEventListener('click', () => this._select(opt.value));
            this.dropdown.appendChild(el);
        });
    }

    _setLabel(value) {
        const opt = Array.from(this.native.options).find(o => o.value === value);
        if (!opt) return;
        const icon = EFFECT_ICONS[value] || '';
        this.labelEl.innerHTML = icon
            ? `<span class="opt-icon">${icon}</span>${opt.text}`
            : opt.text;
    }

    _select(value) {
        this.native.value = value;
        this._buildOptions();
        this._setLabel(value);
        this._close();
        // Fire change event on the native select
        this.native.dispatchEvent(new Event('change', { bubbles: true }));
    }

    _toggle() {
        this.wrapper.classList.contains('open') ? this._close() : this._open();
    }
    _open() {
        // Close any other open dropdowns
        document.querySelectorAll('.custom-select.open').forEach(el => {
            if (el !== this.wrapper) el.classList.remove('open');
        });
        this.wrapper.classList.add('open');
        this.trigger.setAttribute('aria-expanded', 'true');
        // Scroll selected option into view
        const sel = this.dropdown.querySelector('.selected');
        if (sel) sel.scrollIntoView({ block: 'nearest' });
    }
    _close() {
        this.wrapper.classList.remove('open');
        this.trigger.setAttribute('aria-expanded', 'false');
    }
    _moveFocus(dir) {
        const opts = Array.from(this.dropdown.querySelectorAll('.custom-select-option'));
        const cur  = opts.findIndex(o => o.classList.contains('selected'));
        const next = Math.max(0, Math.min(opts.length - 1, cur + dir));
        this._select(opts[next].dataset.value);
        this._open();
    }

    // Call after native options changed dynamically
    refresh() {
        this._buildOptions();
        this._setLabel(this.native.value);
    }
}

// Initialize all .select-mode selects that are <select> tags
function initCustomSelects(root = document) {
    root.querySelectorAll('select.select-mode').forEach(sel => {
        if (!sel._customSelectAttached) new CustomSelect(sel);
    });
}

// Re-init whenever new device cards are injected
const _origRenderDevices = typeof renderDevices !== 'undefined' ? renderDevices : null;
const LAYOUT_STORAGE_VERSION = 3;
let devices = [];
let sdkStates = {};
let _sdkShowAll    = false;   // SDK 필터: false = 실제기기만, true = 전체(Demo 포함)
let _deviceHideDemo = true;   // 기기 목록: true = 데모 숨김(기본), false = 전체 표시
let activeEffect = 'static';
let effectInterval = null;
let effectHue = 0;
let effectStep = 0;

// Device Colors, Selected LEDs, and local Modes
let deviceColors = {};
let deviceSelectedLeds = {};
let deviceModes = {};

// Floating Picker target mapping
let activePickerDeviceId = null;
let activePickerLedIndex = null;

// Cached System status for local effects
let systemCpuTemp = 42.0;
let systemScreenColor = { r: 0, g: 180, b: 255 };
let systemGameEvent = null;
let systemGameUltReady = false;

// Device Filtering and Search Query
let searchQuery = '';
let selectedCategory = 'all';
let currentView = 'effects';
let layoutHideDemo = false;
let layoutPositions = {};
let layoutChildPositions = {};   // devId → {x,y} relative to parent MB card
let selectedLayoutDeviceId = null;
let layoutDeviceTransforms = {};
let layoutProfiles = {};
let activeLayoutProfile = 'Default';
let layoutEffectSettings = {
    speed: 4,
    spread: 5
};
let deviceLedDirections = {};

// Audio Visualizer Web Audio API State
let audioContext = null;
let analyserNode = null;
let audioStream = null;
let audioAnimFrame = null;
let audioSendInterval = null;
let micGranted = false;

// Master Color State (Default Cyan)
let masterColor = { r: 0, g: 180, b: 255 };

// DOM Elements
const elRedSlider = document.getElementById('slide-red');
const elGreenSlider = document.getElementById('slide-green');
const elBlueSlider = document.getElementById('slide-blue');
const elRedVal = document.getElementById('val-red');
const elGreenVal = document.getElementById('val-green');
const elBlueVal = document.getElementById('val-blue');
const elColorPreview = document.getElementById('color-preview');
const elPickerRing = document.getElementById('picker-ring');
const elHexInput = document.getElementById('hex-input');
const elStaticSettingsPanel = document.getElementById('static-settings-panel');
const elStatusDot = document.getElementById('status-dot');
const elStatusText = document.getElementById('status-text');
const elReconnectBtn = document.getElementById('btn-reconnect');
const elDevicesCount = document.getElementById('devices-count');
const elDevicesGrid = document.getElementById('devices-grid');
const elSdkChipsGrid = document.getElementById('sdk-chips-grid');
const elDashboardGrid = document.querySelector('.dashboard-grid');
const elControlPanel = document.querySelector('.control-panel');
const elDevicesSection = document.querySelector('.devices-section');
const elLayoutWorkspace = document.getElementById('layout-workspace');
const elLayoutCanvas = document.getElementById('layout-canvas');
const elProfileCard = document.getElementById('profile-card');
const elSdkBoardCard = document.getElementById('sdk-board-card');
const elNavItems = document.querySelectorAll('.nav-item[data-view]');
const elWorkspaceTitle = document.querySelector('.workspace-heading h1');
const elWorkspaceSubtitle = document.querySelector('.workspace-heading p');
const elBtnLayoutAuto = document.getElementById('btn-layout-auto');
const elBtnLayoutHideDemo = document.getElementById('btn-layout-hide-demo');
const elLayoutCanvasHint = document.getElementById('layout-canvas-hint');
const elLayoutSpeed = document.getElementById('layout-speed');
const elLayoutSpread = document.getElementById('layout-spread');
const elLayoutSelectedName = document.getElementById('layout-selected-name');
const elLayoutProfileSelect = document.getElementById('layout-profile-select');
const elLayoutProfileName = document.getElementById('layout-profile-name');
const elBtnLayoutSave = document.getElementById('btn-layout-save');
const elBtnLayoutDelete = document.getElementById('btn-layout-delete');
const elLayoutDeviceX = document.getElementById('layout-device-x');
const elLayoutDeviceY = document.getElementById('layout-device-y');
const elLayoutDeviceScale = document.getElementById('layout-device-scale');
const elLayoutDeviceRotation = document.getElementById('layout-device-rotation');
const elBtnLayoutFlip = document.getElementById('btn-layout-flip');
const elBtnLayoutHideSelected = document.getElementById('btn-layout-hide-selected');
const elBtnLayoutResetSelected = document.getElementById('btn-layout-reset-selected');

// Search and Category elements
const elDeviceSearch = document.getElementById('device-search');
const elFilterChips = document.querySelectorAll('.filter-chip');

// Hardware Monitor elements
const elCpuTempBar = document.getElementById('cpu-temp-bar');
const elCpuTempVal = document.getElementById('cpu-temp-val');
const elCpuLoadBar = document.getElementById('cpu-load-bar');
const elCpuLoadVal = document.getElementById('cpu-load-val');
const elRamLoadBar = document.getElementById('ram-load-bar');
const elRamLoadVal = document.getElementById('ram-load-val');
const elSystemMonitorCard = document.getElementById('system-monitor-card');

// Profile Manager elements
const elProfileName = document.getElementById('profile-name');
const elBtnSaveProfile = document.getElementById('btn-save-profile');
const elProfileList = document.getElementById('profile-list');

// HID Modal elements
const elHidModal = document.getElementById('hid-modal');
const elBtnAddHid = document.getElementById('btn-add-hid');
const elCloseModal = document.getElementById('close-modal');
const elBtnScanHid = document.getElementById('btn-scan-hid');
const elScannedList = document.getElementById('scanned-devices-list');
const elHidForm = document.getElementById('hid-add-form');

// Audio visualizer widgets
const elAudioCard = document.getElementById('audio-visualizer-card');
const elBtnAudioAuth = document.getElementById('btn-audio-auth');
const elAudioStatus = document.getElementById('audio-status-text');
const visualizerCanvas = document.getElementById('visualizer-canvas');
let visualizerCtx = visualizerCanvas ? visualizerCanvas.getContext('2d') : null;

// Floating Picker DOM elements
const elFloatingPicker = document.getElementById('floating-picker');
const elCloseFloatingPicker = document.getElementById('close-floating-picker');
const elFloatingColorInput = document.getElementById('floating-color-input');
const elFloatingSwatches = document.querySelectorAll('.floating-swatch');

// Throttle State for Slider Input
let lastApiCallTime = 0;
const API_THROTTLE_MS = 50; // Ultra smooth

// Periodic Pollers
let statusPoller = null;
let devicesStatePoller = null;

// Initialize Application
window.addEventListener('DOMContentLoaded', () => {
    initApp();
    setupEventListeners();
});

function initApp() {
    initTheme();           // apply stored dark/light preference
    loadLayoutProfiles();
    updateSliderUI();
    updateEffectSettingsVisibility(activeEffect);
    setWorkspaceView(currentView);
    // Init custom selects for any static selects in HTML (layout profile, etc.)
    initCustomSelects();
    fetchStatus();
    fetchDevices();
    fetchProfiles();
    fetchScenes();
    fetchSchedules();
    // 업데이트 체크 (시작 30초 후, 서버 안정화 대기)
    setTimeout(checkForUpdate, 30000);

    // Start WMI metrics polling
    if (statusPoller) clearInterval(statusPoller);
    statusPoller = setInterval(pollSystemStatus, 1500);

    // ── SSE real-time LED stream (replaces polling) ──
    initSSE();
}

// 이벤트 위임으로 nav 클릭 처리 — DOMContentLoaded 타이밍 문제 방지
document.addEventListener('click', (e) => {
    const navItem = e.target.closest('.nav-item[data-view]');
    if (navItem) {
        e.preventDefault();
        setWorkspaceView(navItem.dataset.view);
    }
});

function setupEventListeners() {

    if (elBtnLayoutAuto) {
        elBtnLayoutAuto.addEventListener('click', () => {
            autoArrangeLayoutDevices(true);
            persistActiveLayoutProfile();
            renderLayoutCanvas();
        });
    }

    if (elBtnLayoutHideDemo) {
        elBtnLayoutHideDemo.addEventListener('click', () => {
            layoutHideDemo = !layoutHideDemo;
            elBtnLayoutHideDemo.innerText = layoutHideDemo ? '데모 표시' : '데모 숨김';
            renderLayoutCanvas();
        });
    }

    if (elLayoutSpeed) {
        elLayoutSpeed.addEventListener('input', (e) => {
            layoutEffectSettings.speed = parseInt(e.target.value, 10);
        });
    }

    if (elLayoutSpread) {
        elLayoutSpread.addEventListener('input', (e) => {
            layoutEffectSettings.spread = parseInt(e.target.value, 10);
            renderLayoutCanvas();
        });
    }

    if (elLayoutProfileSelect) {
        elLayoutProfileSelect.addEventListener('change', (e) => {
            switchLayoutProfile(e.target.value);
        });
    }

    if (elBtnLayoutSave) {
        elBtnLayoutSave.addEventListener('click', () => {
            const name = (elLayoutProfileName?.value || activeLayoutProfile || 'Default').trim();
            saveLayoutProfile(name);
        });
    }

    if (elBtnLayoutDelete) {
        elBtnLayoutDelete.addEventListener('click', () => {
            deleteLayoutProfile(activeLayoutProfile);
        });
    }

    if (elLayoutDeviceX) {
        elLayoutDeviceX.addEventListener('input', (e) => {
            updateSelectedLayoutPosition('x', parseInt(e.target.value, 10));
        });
    }

    if (elLayoutDeviceY) {
        elLayoutDeviceY.addEventListener('input', (e) => {
            updateSelectedLayoutPosition('y', parseInt(e.target.value, 10));
        });
    }

    if (elLayoutDeviceScale) {
        elLayoutDeviceScale.addEventListener('input', (e) => {
            const transform = getLayoutTransform(selectedLayoutDeviceId);
            transform.scale = parseInt(e.target.value, 10) / 100;
            persistActiveLayoutProfile();
            renderLayoutCanvas();
        });
    }

    if (elLayoutDeviceRotation) {
        elLayoutDeviceRotation.addEventListener('input', (e) => {
            const transform = getLayoutTransform(selectedLayoutDeviceId);
            transform.rotation = parseInt(e.target.value, 10);
            persistActiveLayoutProfile();
            renderLayoutCanvas();
        });
    }

    if (elBtnLayoutFlip) {
        elBtnLayoutFlip.addEventListener('click', () => {
            const transform = getLayoutTransform(selectedLayoutDeviceId);
            transform.flip = !transform.flip;
            persistActiveLayoutProfile();
            renderLayoutCanvas();
        });
    }

    if (elBtnLayoutHideSelected) {
        elBtnLayoutHideSelected.addEventListener('click', () => {
            const transform = getLayoutTransform(selectedLayoutDeviceId);
            transform.hidden = !transform.hidden;
            persistActiveLayoutProfile();
            renderLayoutCanvas();
        });
    }

    if (elBtnLayoutResetSelected) {
        elBtnLayoutResetSelected.addEventListener('click', () => {
            if (!selectedLayoutDeviceId) return;
            layoutDeviceTransforms[selectedLayoutDeviceId] = createDefaultLayoutTransform();
            persistActiveLayoutProfile();
            renderLayoutCanvas();
        });
    }

    // RGB Slider Inputs
    [elRedSlider, elGreenSlider, elBlueSlider].forEach(slider => {
        slider.addEventListener('input', () => {
            masterColor.r = parseInt(elRedSlider.value);
            masterColor.g = parseInt(elGreenSlider.value);
            masterColor.b = parseInt(elBlueSlider.value);
            
            updateSliderUI();
            
            // If static mode is active, push to hardware
            if (activeEffect === 'static') {
                stopEffectLoop();
                updateMasterSyncedDeviceColors(masterColor.r, masterColor.g, masterColor.b);
                throttleSendColorAll(masterColor.r, masterColor.g, masterColor.b);
            }
        });
    });

    // HEX input sync
    if (elHexInput) {
        const applyHex = () => {
            const raw = elHexInput.value.trim();
            const hex = raw.startsWith('#') ? raw : '#' + raw;
            if (!/^#[0-9a-fA-F]{6}$/.test(hex)) return;
            const r = parseInt(hex.slice(1, 3), 16);
            const g = parseInt(hex.slice(3, 5), 16);
            const b = parseInt(hex.slice(5, 7), 16);
            masterColor = { r, g, b };
            elRedSlider.value = r;
            elGreenSlider.value = g;
            elBlueSlider.value = b;
            updateSliderUI();
            if (activeEffect === 'static') {
                updateMasterSyncedDeviceColors(r, g, b);
                throttleSendColorAll(r, g, b);
            }
        };
        elHexInput.addEventListener('input', () => {
            const raw = elHexInput.value.replace(/[^#0-9a-fA-F]/g, '');
            elHexInput.value = raw.startsWith('#') ? raw : '#' + raw.replace('#', '');
            if (elHexInput.value.length === 7) applyHex();
        });
        elHexInput.addEventListener('blur', applyHex);
        elHexInput.addEventListener('keydown', (e) => { if (e.key === 'Enter') applyHex(); });
    }

    // Swatches selection
    document.querySelectorAll('.color-swatch').forEach(swatch => {
        swatch.addEventListener('click', () => {
            document.querySelectorAll('.color-swatch').forEach(s => s.classList.remove('active'));
            swatch.classList.add('active');
            
            const r = parseInt(swatch.dataset.r);
            const g = parseInt(swatch.dataset.g);
            const b = parseInt(swatch.dataset.b);
            
            masterColor = { r, g, b };
            elRedSlider.value = r;
            elGreenSlider.value = g;
            elBlueSlider.value = b;
            
            updateSliderUI();
            
            if (activeEffect === 'static' || activeEffect === 'off') {
                setActivePreset('static');
                updateMasterSyncedDeviceColors(r, g, b);
                sendColorAll(r, g, b);
            }
        });
    });

    // Reconnect Button
    elReconnectBtn.addEventListener('click', () => {
        elStatusText.innerText = '재연결 중...';
        initApp();
    });

    // Effects Preset Selection
    document.querySelectorAll('.effect-card').forEach(card => {
        card.addEventListener('click', () => {
            const effect = card.dataset.effect;
            setActivePreset(effect);
        });
    });

    // Search Input
    if (elDeviceSearch) {
        elDeviceSearch.addEventListener('input', (e) => {
            searchQuery = e.target.value.toLowerCase().trim();
            renderDevices();
        });
    }

    // Filter Chips
    elFilterChips.forEach(chip => {
        chip.addEventListener('click', () => {
            elFilterChips.forEach(c => c.classList.remove('active'));
            chip.classList.add('active');
            selectedCategory = chip.dataset.category;
            renderDevices();
        });
    });

    // Save Profile
    if (elBtnSaveProfile) {
        elBtnSaveProfile.addEventListener('click', handleSaveProfile);
    }

    // USB HID Modal triggers
    if (elBtnAddHid) {
        elBtnAddHid.addEventListener('click', () => {
            elHidModal.style.display = 'flex';
            refreshSavedDevicesList();
        });
    }
    if (elCloseModal) {
        elCloseModal.addEventListener('click', () => {
            elHidModal.style.display = 'none';
        });
    }
    window.addEventListener('click', (e) => {
        if (e.target === elHidModal) {
            elHidModal.style.display = 'none';
        }
    });

    // Scan HID Button
    if (elBtnScanHid) {
        elBtnScanHid.addEventListener('click', handleScanHid);
    }

    // Submit HID Form
    if (elHidForm) {
        elHidForm.addEventListener('submit', handleAddHidSubmit);
    }

    // Audio Authorization Button
    if (elBtnAudioAuth) {
        elBtnAudioAuth.addEventListener('click', handleAudioAuth);
    }

    // SDK Board Collapsible Toggle
    const elSdkBoard = document.getElementById('sdk-board-card');
    const elSdkToggle = document.getElementById('sdk-board-toggle');
    const elSdkToggleText = document.getElementById('sdk-toggle-text');
    const elSdkToggleIcon = document.getElementById('sdk-toggle-icon');

    if (elSdkToggle && elSdkBoard) {
        elSdkToggle.addEventListener('click', () => {
            const isCollapsed = elSdkBoard.classList.toggle('collapsed');
            if (isCollapsed) {
                elSdkToggleText.innerText = '확대하기';
                elSdkToggleIcon.style.transform = 'rotate(0deg)';
            } else {
                elSdkToggleText.innerText = '축소하기';
                elSdkToggleIcon.style.transform = 'rotate(180deg)';
            }
        });
    }

    // Floating Picker Event Listeners
    if (elCloseFloatingPicker) {
        elCloseFloatingPicker.addEventListener('click', () => {
            hideFloatingPicker();
        });
    }

    const elFloatingHexInput = document.getElementById('floating-hex-input');
    const elFloatingSlideRed = document.getElementById('floating-slide-red');
    const elFloatingSlideGreen = document.getElementById('floating-slide-green');
    const elFloatingSlideBlue = document.getElementById('floating-slide-blue');

    if (elFloatingColorInput) {
        elFloatingColorInput.addEventListener('input', (e) => {
            const hexColor = e.target.value;
            const rgb = hexToRgb(hexColor);
            if (rgb) {
                if (elFloatingSlideRed) elFloatingSlideRed.value = rgb.r;
                if (elFloatingSlideGreen) elFloatingSlideGreen.value = rgb.g;
                if (elFloatingSlideBlue) elFloatingSlideBlue.value = rgb.b;
                
                const elFloatingValRed = document.getElementById('floating-val-red');
                const elFloatingValGreen = document.getElementById('floating-val-green');
                const elFloatingValBlue = document.getElementById('floating-val-blue');
                if (elFloatingValRed) elFloatingValRed.innerText = rgb.r;
                if (elFloatingValGreen) elFloatingValGreen.innerText = rgb.g;
                if (elFloatingValBlue) elFloatingValBlue.innerText = rgb.b;
                
                if (elFloatingHexInput) elFloatingHexInput.value = hexColor;
                
                sendFloatingColorUpdate(rgb.r, rgb.g, rgb.b, hexColor);
            }
        });
    }

    if (elFloatingHexInput) {
        elFloatingHexInput.addEventListener('input', (e) => {
            let hexColor = e.target.value.trim();
            if (hexColor.length > 0 && !hexColor.startsWith('#')) {
                hexColor = '#' + hexColor;
            }
            if (hexColor.length === 7) {
                const rgb = hexToRgb(hexColor);
                if (rgb) {
                    if (elFloatingSlideRed) elFloatingSlideRed.value = rgb.r;
                    if (elFloatingSlideGreen) elFloatingSlideGreen.value = rgb.g;
                    if (elFloatingSlideBlue) elFloatingSlideBlue.value = rgb.b;
                    
                    const elFloatingValRed = document.getElementById('floating-val-red');
                    const elFloatingValGreen = document.getElementById('floating-val-green');
                    const elFloatingValBlue = document.getElementById('floating-val-blue');
                    if (elFloatingValRed) elFloatingValRed.innerText = rgb.r;
                    if (elFloatingValGreen) elFloatingValGreen.innerText = rgb.g;
                    if (elFloatingValBlue) elFloatingValBlue.innerText = rgb.b;
                    
                    if (elFloatingColorInput) elFloatingColorInput.value = hexColor;
                    
                    sendFloatingColorUpdate(rgb.r, rgb.g, rgb.b, hexColor);
                }
            }
        });
    }

    [elFloatingSlideRed, elFloatingSlideGreen, elFloatingSlideBlue].forEach(slider => {
        if (slider) {
            slider.addEventListener('input', () => {
                const r = elFloatingSlideRed ? parseInt(elFloatingSlideRed.value) : 0;
                const g = elFloatingSlideGreen ? parseInt(elFloatingSlideGreen.value) : 0;
                const b = elFloatingSlideBlue ? parseInt(elFloatingSlideBlue.value) : 0;
                
                const hexColor = rgbToHex(r, g, b);
                
                const elFloatingValRed = document.getElementById('floating-val-red');
                const elFloatingValGreen = document.getElementById('floating-val-green');
                const elFloatingValBlue = document.getElementById('floating-val-blue');
                if (elFloatingValRed) elFloatingValRed.innerText = r;
                if (elFloatingValGreen) elFloatingValGreen.innerText = g;
                if (elFloatingValBlue) elFloatingValBlue.innerText = b;
                
                if (elFloatingColorInput) elFloatingColorInput.value = hexColor;
                if (elFloatingHexInput) elFloatingHexInput.value = hexColor;
                
                sendFloatingColorUpdate(r, g, b, hexColor);
            });
        }
    });

    elFloatingSwatches.forEach(swatch => {
        swatch.addEventListener('click', () => {
            const hexColor = swatch.dataset.color;
            const rgb = hexToRgb(hexColor);
            if (rgb) {
                if (elFloatingSlideRed) elFloatingSlideRed.value = rgb.r;
                if (elFloatingSlideGreen) elFloatingSlideGreen.value = rgb.g;
                if (elFloatingSlideBlue) elFloatingSlideBlue.value = rgb.b;
                
                const elFloatingValRed = document.getElementById('floating-val-red');
                const elFloatingValGreen = document.getElementById('floating-val-green');
                const elFloatingValBlue = document.getElementById('floating-val-blue');
                if (elFloatingValRed) elFloatingValRed.innerText = rgb.r;
                if (elFloatingValGreen) elFloatingValGreen.innerText = rgb.g;
                if (elFloatingValBlue) elFloatingValBlue.innerText = rgb.b;
                
                if (elFloatingColorInput) elFloatingColorInput.value = hexColor;
                if (elFloatingHexInput) elFloatingHexInput.value = hexColor;
                
                sendFloatingColorUpdate(rgb.r, rgb.g, rgb.b, hexColor);
            }
        });
    });

    // Dismiss floating picker on outside click
    window.addEventListener('mousedown', (e) => {
        if (elFloatingPicker && elFloatingPicker.style.display !== 'none') {
            const isClickInsidePicker = elFloatingPicker.contains(e.target);
            const isClickOnNode = e.target.classList.contains('led-node') || 
                                  e.target.classList.contains('keycap-node') ||
                                  e.target.closest('.keycap-node') ||
                                  e.target.classList.contains('nanoleaf-hexagon') ||
                                  e.target.closest('.nanoleaf-hexagon') ||
                                  e.target.classList.contains('lightbar-tube') ||
                                  e.target.closest('.lightbar-tube-wrapper') ||
                                  e.target.classList.contains('govee-rope-node') ||
                                  e.target.classList.contains('mouse-led-node') ||
                                  e.target.classList.contains('picker-wrapper') ||
                                  e.target.closest('.picker-wrapper');
            
            if (!isClickInsidePicker && !isClickOnNode) {
                hideFloatingPicker();
            }
        }
    });

    // Adjust visualizer scales on window resize
    window.addEventListener('resize', adjustVisualizerScales);
}

// Update local UI elements
function updateSliderUI() {
    elRedVal.innerText = masterColor.r;
    elGreenVal.innerText = masterColor.g;
    elBlueVal.innerText = masterColor.b;

    const hexColor = rgbToHex(masterColor.r, masterColor.g, masterColor.b);
    elColorPreview.style.backgroundColor = hexColor;
    elPickerRing.style.boxShadow = `0 0 35px rgba(${masterColor.r}, ${masterColor.g}, ${masterColor.b}, 0.5)`;
    if (elHexInput && document.activeElement !== elHexInput) {
        elHexInput.value = hexColor.toUpperCase();
    }
}

function stopEffectLoop() {
    if (effectInterval) {
        clearInterval(effectInterval);
        effectInterval = null;
    }
}

function updateMasterSyncedDeviceColors(r, g, b) {
    devices.forEach(dev => {
        const mode = deviceModes[dev.id] || 'sync';
        if (mode !== 'sync') return;

        deviceColors[dev.id] = { r, g, b };
        if (dev.leds) {
            dev.leds.forEach(led => {
                led.r = r;
                led.g = g;
                led.b = b;
            });
        }

        updateDeviceLedsUI(dev.id, r, g, b);

        const picker = document.getElementById(`picker-${dev.id}`);
        if (picker) {
            picker.style.backgroundColor = rgbToHex(r, g, b);
        }
        updateLayoutDeviceColor(dev.id, r, g, b);
    });
}

function updateEffectSettingsVisibility(effect) {
    if (elStaticSettingsPanel) {
        elStaticSettingsPanel.classList.toggle('active', effect === 'static');
    }
}

function setWorkspaceView(view) {
    currentView = view || 'effects';
    const titles = {
        effects:   ['조명 효과',   '전체 동기화와 기기별 조명을 조정합니다'],
        scenes:    ['씬 관리',     '현재 기기 상태를 씬으로 저장하고 원클릭으로 불러옵니다'],
        playlist:  ['씬 타임라인', '씬을 순서대로 자동 재생합니다'],
        keyboard:  ['키보드 에디터','키 하나하나에 색상을 지정합니다'],
        layouts:   ['레이아웃',    '장치의 위치, 크기, 방향을 실제 배치에 맞춥니다'],
        audio:     ['오디오',      '마이크 입력 기반 음악 반응 효과를 조정합니다'],
        profiles:  ['사용자 프로필','상황별 조명 설정을 원클릭으로 전환합니다'],
        devices:   ['기기',        '감지된 장치와 장치별 조명 설정을 관리합니다'],
        schedule:  ['자동화',      '시간·프로세스 기반 씬 자동 전환을 설정합니다'],
        monitoring:['모니터링',    '시스템 센서 값을 확인합니다'],
        sdk:       ['SDK',         '연동 가능한 드라이버 상태를 확인합니다'],
    };
    const [title, subtitle] = titles[currentView] || titles.effects;
    if (elWorkspaceTitle)    elWorkspaceTitle.innerText    = title;
    if (elWorkspaceSubtitle) elWorkspaceSubtitle.innerText = subtitle;

    elNavItems.forEach(item => item.classList.toggle('active', item.dataset.view === currentView));

    const showEffects   = currentView === 'effects';
    const showScenes    = currentView === 'scenes';
    const showPlaylist  = currentView === 'playlist';
    const showKeyboard  = currentView === 'keyboard';
    const showLayouts   = currentView === 'layouts';
    const showAudio     = currentView === 'audio';
    const showProfiles  = currentView === 'profiles';
    const showDevices   = currentView === 'devices' || currentView === 'effects';
    const showSchedule  = currentView === 'schedule';
    const showMonitoring= currentView === 'monitoring';
    const showSdk       = currentView === 'sdk';

    if (elDashboardGrid) elDashboardGrid.classList.toggle('single-view', !showEffects);
    if (elControlPanel)  elControlPanel.classList.toggle('view-hidden', !(showEffects || showAudio || showMonitoring));
    if (elDevicesSection) elDevicesSection.classList.toggle('view-hidden', !showDevices);
    if (elLayoutWorkspace) elLayoutWorkspace.classList.toggle('view-hidden', !showLayouts);
    if (elSdkBoardCard)  elSdkBoardCard.classList.toggle('view-hidden', !showSdk);

    const elScenesWs    = document.getElementById('scenes-workspace');
    const elPlaylistWs  = document.getElementById('playlist-workspace');
    const elKeyboardWs  = document.getElementById('keyboard-workspace');
    const elProfilesWs  = document.getElementById('profiles-workspace');
    const elScheduleWs  = document.getElementById('schedule-workspace');
    const elMonitorWs   = document.getElementById('monitoring-workspace');
    if (elScenesWs)   elScenesWs.classList.toggle('view-hidden', !showScenes);
    if (elPlaylistWs) elPlaylistWs.classList.toggle('view-hidden', !showPlaylist);
    if (elKeyboardWs) elKeyboardWs.classList.toggle('view-hidden', !showKeyboard);
    if (elProfilesWs) elProfilesWs.classList.toggle('view-hidden', !showProfiles);
    if (elScheduleWs) elScheduleWs.classList.toggle('view-hidden', !showSchedule);
    if (elMonitorWs)  elMonitorWs.classList.toggle('view-hidden', !showMonitoring);

    if (document.getElementById('lighting-workspace')) {
        document.getElementById('lighting-workspace').classList.toggle('view-hidden', !showEffects);
    }
    if (elProfileCard)       elProfileCard.classList.toggle('view-hidden', !showEffects);
    if (elSystemMonitorCard) elSystemMonitorCard.classList.toggle('view-hidden', !showMonitoring);
    if (elAudioCard) elAudioCard.style.display = showAudio || activeEffect === 'audio' ? 'block' : 'none';

    if (showLayouts)    renderLayoutCanvas();
    if (showScenes)     fetchScenes();
    if (showPlaylist)   { fetchScenes(); fetchPlaylists(); }
    if (showSchedule)   fetchSchedules();
    if (showMonitoring) startMonitorPolling();
    if (showKeyboard)   { populateKbDeviceSelect(); renderKeyboard(); }
    if (showProfiles)   fetchUserProfiles();
}

// Throttle helper
function throttleSendColorAll(r, g, b) {
    const now = Date.now();
    if (now - lastApiCallTime >= API_THROTTLE_MS) {
        sendColorAll(r, g, b);
        lastApiCallTime = now;
    }
}

// 공통 재시도 fetch — 서버 시작 직후 race condition 방지
async function fetchWithRetry(url, retries = 4, delay = 1500) {
    for (let i = 0; i <= retries; i++) {
        try {
            const res = await fetch(url);
            if (!res.ok) throw new Error(`HTTP ${res.status}`);
            return res;
        } catch (err) {
            if (i < retries) await new Promise(r => setTimeout(r, delay));
            else throw err;
        }
    }
}

// Fetch SDK Statuses and render brand chips
async function fetchStatus() {
    try {
        const res = await fetchWithRetry(`${API_BASE}/status`);
        const data = await res.json();
        if (data.status === 'Success') {
            sdkStates = data.sdks;

            const connectedCount = Object.values(sdkStates).filter(s => s === 'Connected').length;
            if (connectedCount > 0) {
                elStatusDot.className = 'status-indicator hardware';
                elStatusText.title = 'SDK 연동';
            } else {
                elStatusDot.className = 'status-indicator warning';
                elStatusText.title = 'SDK 미연동';
            }
            elStatusText.innerText = 'SDK';
            renderSdkChips();
        }
    } catch (err) {
        console.error('Failed to fetch status:', err);
        elStatusDot.className = 'status-indicator error';
        elStatusText.innerText = 'SDK';
        elStatusText.title = 'SDK 상태 확인 실패';
    }
}

// Render SDK Chips — 실제 연결된 기기만 / 전체 토글 지원
function renderSdkChips() {
    elSdkChipsGrid.innerHTML = '';

    const allBrands   = Object.keys(sdkStates).sort();
    const realBrands  = allBrands.filter(b => sdkStates[b] !== 'Demo');
    const connectedCount = allBrands.filter(b => sdkStates[b] === 'Connected').length;

    // 카운트 뱃지 갱신
    const elBadge = document.getElementById('sdk-count-badge');
    if (elBadge) elBadge.innerText = allBrands.length;

    // 새로고침 버튼
    let elRefreshBtn = document.getElementById('sdk-refresh-btn');
    if (!elRefreshBtn) {
        elRefreshBtn = document.createElement('button');
        elRefreshBtn.id = 'sdk-refresh-btn';
        elRefreshBtn.title = 'SDK 상태 새로고침';
        elRefreshBtn.style.cssText = 'margin-left:0.3rem;padding:0.2rem 0.5rem;font-size:0.75rem;border-radius:6px;border:1px solid var(--glass-border);background:var(--glass-bg);color:var(--text-secondary);cursor:pointer;';
        elRefreshBtn.innerText = '🔄';
        elRefreshBtn.onclick = (e) => { e.stopPropagation(); fetchStatus(); };
        const titleEl = document.querySelector('.sdk-board-title');
        if (titleEl) titleEl.appendChild(elRefreshBtn);
    }

    const visibleBrands = realBrands;

    if (visibleBrands.length === 0) {
        const empty = document.createElement('div');
        empty.style.cssText = 'grid-column:1/-1;text-align:center;color:var(--text-secondary);padding:1.5rem;font-size:0.85rem;';
        empty.innerHTML = '실제로 연결된 기기가 없습니다.<br><span style="font-size:0.75rem;opacity:0.6;">RGB 드라이버/SDK가 설치된 기기를 연결하면 여기에 표시됩니다.</span>';
        elSdkChipsGrid.appendChild(empty);
    } else {
        visibleBrands.forEach(brand => {
            const state = sdkStates[brand];
            const chip  = document.createElement('div');
            chip.className = `sdk-chip ${state.toLowerCase()}`;
            let label = brand.toUpperCase().replace(/_/g, '/');
            if (label === 'GP') label = 'HP OMEN';
            chip.innerText = `${label}: ${state}`;
            chip.title = state === 'Connected' ? '실제 SDK 드라이버 연동 활성화' : state;
            elSdkChipsGrid.appendChild(chip);
        });
    }

    // 요약 뱃지
    const elSummary = document.getElementById('sdk-connected-summary');
    if (elSummary) {
        if (connectedCount > 0) {
            elSummary.innerText = `${connectedCount}개 연결됨`;
            elSummary.style.display = 'inline-block';
            elSummary.style.color = 'var(--success-color)';
            elSummary.style.background = 'rgba(0,230,118,0.12)';
        } else if (realBrands.length > 0) {
            elSummary.innerText = `${realBrands.length}개 감지됨`;
            elSummary.style.display = 'inline-block';
            elSummary.style.color = 'var(--warning-color)';
            elSummary.style.background = 'rgba(255,179,0,0.08)';
        } else {
            elSummary.innerText = '기기 없음 (데모 모드)';
            elSummary.style.display = 'inline-block';
            elSummary.style.color = 'var(--text-secondary)';
            elSummary.style.background = 'transparent';
        }
    }
}

function renderLayoutCanvas() {
    if (!elLayoutCanvas) return;
    elLayoutCanvas.innerHTML = '';
    if (elLayoutCanvasHint) {
        elLayoutCanvas.appendChild(elLayoutCanvasHint);
    }

    const visibleDevices = devices.filter(dev => {
        if (layoutHideDemo && dev.id.endsWith('_demo')) return false;
        return true;
    });
    if (visibleDevices.length === 0) {
        elLayoutCanvas.innerHTML = '<div class="layout-empty">표시할 기기가 없습니다.</div>';
        updateLayoutHint();
        syncLayoutEditor();
        return;
    }

    const canvasRect = elLayoutCanvas.getBoundingClientRect();
    const width = Math.max(canvasRect.width || elLayoutCanvas.clientWidth || 320, 320);
    const layoutHeight = Math.max(560, calculateLayoutHeight(visibleDevices, width));
    elLayoutCanvas.style.minHeight = `${layoutHeight}px`;

    // Split devices into MB-contained vs flat
    const mbDevices = visibleDevices.filter(d => getLayoutDeviceKind(d) === 'motherboard');
    const primaryMB = mbDevices[0] || null;

    // Widen canvas if MB sits right of the keyboard area (prevents overlap)
    if (primaryMB) {
        const neededW = Math.round(width * 0.55) + 460;
        if (neededW > width) elLayoutCanvas.style.minWidth = `${neededW}px`;
    }

    // Limit slots: 4 DIMM + 6 fan headers (real-PC realistic count)
    // Prioritise real connected devices over demo
    let containedIds = new Set();
    if (primaryMB) {
        const allContainable = visibleDevices.filter(isContainableInMB)
            .sort((a, b) => (a.id.endsWith('_demo') ? 1 : 0) - (b.id.endsWith('_demo') ? 1 : 0));
        const ramSlots  = allContainable.filter(d => getLayoutDeviceKind(d) === 'memory').slice(0, 4);
        const fanSlots  = allContainable.filter(d => getLayoutDeviceKind(d) !== 'memory').slice(0, 6);
        containedIds = new Set([...ramSlots, ...fanSlots].map(d => d.id));
    }
    // Extra MBs (beyond the first) are rendered flat
    const extraMBIds = new Set(mbDevices.slice(1).map(d => d.id));

    autoArrangeLayoutDevices(false, visibleDevices, width, containedIds);

    // ── Flat devices (non-MB, non-contained) ──
    visibleDevices.forEach((dev, index) => {
        const kind = getLayoutDeviceKind(dev);
        if (kind === 'motherboard' && !extraMBIds.has(dev.id)) return;
        if (containedIds.has(dev.id)) return;

        const size = getLayoutDeviceSize(dev, width);
        if (!layoutPositions[dev.id]) {
            layoutPositions[dev.id] = getFallbackLayoutPosition(index, width, size.width);
        }
        const pos = layoutPositions[dev.id];
        pos.x = Math.max(8, Math.min(pos.x, width - size.width - 8));
        const color = dev.leds && dev.leds.length ? dev.leds[0] : { r: 0, g: 180, b: 255 };
        const transform = getLayoutTransform(dev.id);
        const node = document.createElement('div');
        node.className = [
            `layout-device`, `layout-kind-${kind}`,
            dev.id.endsWith('_demo') ? 'demo-layout-device' : '',
            selectedLayoutDeviceId === dev.id ? 'selected' : '',
            transform.flip ? 'flipped' : '',
            transform.hidden ? 'excluded' : ''
        ].filter(Boolean).join(' ');
        node.style.left = `${pos.x}px`;
        node.style.top = `${Math.max(8, pos.y)}px`;
        node.style.width = `${size.width}px`;
        node.style.height = `${size.height}px`;
        node.style.transform = `rotate(${transform.rotation}deg) scale(${transform.scale})`;
        node.dataset.deviceId = dev.id;
        node.innerHTML = `
            <span class="layout-device-color" style="background:rgb(${color.r},${color.g},${color.b});color:rgb(${color.r},${color.g},${color.b});"></span>
            ${kind === 'motherboard' ? '<span class="layout-board-slot slot-gpu">PCIe x16</span>' : ''}
            <span class="layout-device-name">${dev.name}</span>
            <span class="layout-device-meta">${transform.hidden ? 'Effect 제외 · ' : ''}${dev.manufacturer} · ${dev.type}</span>
        `;
        node.addEventListener('click', e => {
            e.stopPropagation();
            selectedLayoutDeviceId = dev.id;
            syncLayoutEditor();
            renderLayoutCanvas();
        });
        makeLayoutDeviceDraggable(node);
        elLayoutCanvas.appendChild(node);
        const neededH = pos.y + (size.height * transform.scale) + 64;
        if (neededH > elLayoutCanvas.clientHeight) elLayoutCanvas.style.minHeight = `${neededH}px`;
    });

    // ── Primary MB with contained children ──
    if (primaryMB) {
        const children = visibleDevices.filter(d => containedIds.has(d.id));
        const mbNode = renderMBWithChildren(primaryMB, children, width);
        elLayoutCanvas.appendChild(mbNode);
        const dims = getMBCardDimensions(children, width);
        const pos = layoutPositions[primaryMB.id] || { x: 36, y: 220 };
        const neededH = pos.y + dims.height + 64;
        if (neededH > elLayoutCanvas.clientHeight) elLayoutCanvas.style.minHeight = `${neededH}px`;
    }

    if (selectedLayoutDeviceId && !devices.some(dev => dev.id === selectedLayoutDeviceId)) {
        selectedLayoutDeviceId = null;
    }
    syncLayoutEditor();
    updateLayoutHint();
}

function autoArrangeLayoutDevices(force = false, sourceDevices = null, canvasWidth = null, containedIds = null) {
    const arrangedDevices = sourceDevices || devices.filter(dev => {
        if (layoutHideDemo && dev.id.endsWith('_demo')) return false;
        return !getLayoutTransform(dev.id).hidden;
    });
    if (!arrangedDevices.length) return;

    const width = canvasWidth || Math.max(elLayoutCanvas?.clientWidth || 320, 320);
    const buckets = {
        keyboard: [],
        mouse: [],
        motherboard: [],
        memory: [],
        gpu: [],
        fan: [],
        light: [],
        other: []
    };

    // Skip devices that are rendered inside the MB container
    arrangedDevices
        .filter(dev => !containedIds || !containedIds.has(dev.id))
        .forEach(dev => buckets[getLayoutDeviceKind(dev)].push(dev));

    const place = (list, startX, startY, stepX, stepY, cols, transform = null) => {
        list.forEach((dev, index) => {
            if (!force && layoutPositions[dev.id]) return;
            const col = index % cols;
            const row = Math.floor(index / cols);
            layoutPositions[dev.id] = {
                x: Math.round(startX + col * stepX),
                y: Math.round(startY + row * stepY)
            };
            if (transform && !layoutDeviceTransforms[dev.id]) {
                layoutDeviceTransforms[dev.id] = { ...createDefaultLayoutTransform(), ...transform };
            }
        });
    };

    const narrow = width < 640;
    const left = 36;

    // MB dimensions — used for spatial planning
    const boardW = narrow ? Math.min(width - 72, 300) : 400;
    const boardH = 380;   // conservative tall estimate; actual grows with children

    // Keyboard/mouse area sits in its own left column (up to 260px wide each, 2 cols)
    const kbCols = narrow ? 1 : 2;
    const kbStep = 190;
    const kbAreaW = kbCols * kbStep + left; // approx keyboard area right edge

    // MB goes to the right of keyboards, or padded from left if narrow
    const boardX = narrow ? left : Math.max(kbAreaW + 24, Math.round(width * 0.55));
    const boardY = narrow ? 260 : 100;

    // Mice go above/right of MB header
    const mouseX = narrow ? left : boardX + boardW + 20;
    const mouseY = narrow ? 160 : 100;

    // GPU and lights go below the MB
    const gpuStartY = boardY + boardH + 24;
    const gpuCols = narrow ? 1 : Math.max(2, Math.floor((width - boardX) / 210));
    const gpuRows = Math.ceil(Math.max(1, buckets.gpu.length) / gpuCols);
    const lightStartY = gpuStartY + gpuRows * 102 + 20;

    // Keyboards fill the left column, below top margin
    place(buckets.keyboard, left, 86, kbStep, 86, kbCols);

    // Mice to the right of MB header (or below keyboards if narrow)
    place(buckets.mouse, mouseX, mouseY, 170, 90, narrow ? 1 : 2);

    if (buckets.motherboard.length) {
        const [primaryBoard, ...extraBoards] = buckets.motherboard;
        if (force || !layoutPositions[primaryBoard.id]) {
            layoutPositions[primaryBoard.id] = { x: boardX, y: boardY };
        }
        place(extraBoards, boardX, boardY + boardH + 20, 210, 120, 2);
    } else {
        place(buckets.motherboard, left, 242, 190, 104, 2);
        place(buckets.memory, left, 242, 170, 92, narrow ? 1 : 2);
        place(buckets.fan, boardX, 242, 170, 92, narrow ? 1 : 2);
    }

    place(buckets.gpu, boardX, gpuStartY, 206, 102, gpuCols);
    place(buckets.light, mouseX, mouseY + 200, 170, 92, narrow ? 1 : 2);
    place(buckets.other, left, lightStartY, 190, 92, 2);
}

function placeContainedDevices(list, startX, startY, stepX, stepY, cols, force = false) {
    list.forEach((dev, index) => {
        if (!force && layoutPositions[dev.id]) return;
        const col = index % cols;
        const row = Math.floor(index / cols);
        layoutPositions[dev.id] = {
            x: Math.round(startX + col * stepX),
            y: Math.round(startY + row * (stepY || 74))
        };
    });
}

// ─── Motherboard Container Helpers ────────────────────────────────────────────

/** Returns true if this device should be rendered inside the MB card */
function isContainableInMB(dev) {
    const kind = getLayoutDeviceKind(dev);
    if (kind === 'memory' || kind === 'fan') return true;
    const type = (dev.type || '').toLowerCase();
    return type === 'waterblock' || type === 'case';
}

/**
 * Calculate MB card dimensions that fit all its children.
 * RAM sticks are laid out in a SINGLE horizontal row (DIMM A1 A2 B1 B2).
 * Fans are laid out in a 2-per-row grid on the left area.
 */
function getMBCardDimensions(children, canvasWidth) {
    const narrow = canvasWidth < 640;
    const DIMM_W = 52, DIMM_GAP = 4, DIMM_H = 152;
    const FAN_SZ = 86, FAN_GAP = 8;
    const HEADER = 44, PCIE = 34, PADDING = 16;

    const rams = children.filter(c => getLayoutDeviceKind(c) === 'memory');
    const fans = children.filter(c => getLayoutDeviceKind(c) !== 'memory');

    // RAM: all in one horizontal row on the right
    const ramTotalW = rams.length * (DIMM_W + DIMM_GAP) + PADDING * 2;

    // Fans: 2-column grid on the left
    const fanRows  = Math.ceil(fans.length / 2);
    const fanBodyH = fanRows > 0 ? fanRows * (FAN_SZ + FAN_GAP) - FAN_GAP : 0;

    // Body height = tall enough for both RAM and fans
    const bodyH = Math.max(DIMM_H, fanBodyH, 120);
    const totalH = HEADER + bodyH + PCIE + PADDING;

    // Width: needs to fit fan area (2*86+8+16 = 196px) + RAM area + gap
    const fanAreaW = fans.length > 0 ? 2 * FAN_SZ + FAN_GAP + PADDING : 0;
    const ramAreaW = rams.length > 0 ? rams.length * (DIMM_W + DIMM_GAP) + PADDING : 0;
    const baseW = narrow ? Math.min(canvasWidth - 72, 300) : 400;
    const neededW = fanAreaW + ramAreaW + (fans.length > 0 && rams.length > 0 ? 24 : 0);

    return { width: Math.max(baseW, neededW), height: Math.max(220, totalH) };
}

/**
 * Set initial child positions (relative to MB top-left) if not already set.
 * RAM: single horizontal row aligned to the right.
 * Fans: 2-per-row grid on the left.
 */
function autoArrangeChildrenInMB(children, mbW) {
    const rams = children.filter(c => getLayoutDeviceKind(c) === 'memory');
    const fans = children.filter(c => getLayoutDeviceKind(c) !== 'memory');
    const DIMM_W = 52, DIMM_GAP = 4;
    const FAN_SZ = 86, FAN_GAP = 8;
    const HEADER = 44, MARGIN = 14;

    // RAM: right-aligned horizontal row
    const totalRamW = rams.length * (DIMM_W + DIMM_GAP) - DIMM_GAP;
    const ramStartX = mbW - MARGIN - totalRamW;
    rams.forEach((c, i) => {
        if (layoutChildPositions[c.id]) return;
        layoutChildPositions[c.id] = {
            x: ramStartX + i * (DIMM_W + DIMM_GAP),
            y: HEADER + 10
        };
    });

    // Fans / coolers: 2-column grid, left side
    fans.forEach((c, i) => {
        if (layoutChildPositions[c.id]) return;
        const col = i % 2;
        const row = Math.floor(i / 2);
        layoutChildPositions[c.id] = {
            x: MARGIN + col * (FAN_SZ + FAN_GAP),
            y: HEADER + 10 + row * (FAN_SZ + FAN_GAP)
        };
    });
}

/**
 * Render a motherboard with all its contained children as actual DOM children.
 * The MB card is the scroll container; children are absolutely positioned inside.
 */
function renderMBWithChildren(mb, children, width) {
    const pos = layoutPositions[mb.id] || { x: 36, y: 220 };
    const dims = getMBCardDimensions(children, width);
    autoArrangeChildrenInMB(children, dims.width);

    const mbColor = mb.leds && mb.leds.length ? mb.leds[0] : { r: 0, g: 180, b: 255 };
    const transform = getLayoutTransform(mb.id);
    const isSelected = selectedLayoutDeviceId === mb.id;

    const node = document.createElement('div');
    node.className = [
        'layout-device', 'layout-kind-motherboard', 'layout-mb-host',
        mb.id.endsWith('_demo') ? 'demo-layout-device' : '',
        isSelected ? 'selected' : '',
        transform.flip ? 'flipped' : '',
        transform.hidden ? 'excluded' : ''
    ].filter(Boolean).join(' ');
    node.style.left   = `${pos.x}px`;
    node.style.top    = `${Math.max(8, pos.y)}px`;
    node.style.width  = `${dims.width}px`;
    node.style.height = `${dims.height}px`;
    node.style.transform = `rotate(${transform.rotation}deg) scale(${transform.scale})`;
    node.dataset.deviceId = mb.id;

    // Static inner markup (header + slot labels)
    node.innerHTML = `
        <span class="layout-device-color" style="background:rgb(${mbColor.r},${mbColor.g},${mbColor.b});color:rgb(${mbColor.r},${mbColor.g},${mbColor.b});"></span>
        <span class="layout-board-slot slot-ram">DIMM</span>
        <span class="layout-board-slot slot-gpu">PCIe x16</span>
        <span class="layout-device-name">${mb.name}</span>
        <span class="layout-device-meta">${transform.hidden ? 'Effect 제외 · ' : ''}${mb.manufacturer} · ${mb.type}</span>
    `;

    node.addEventListener('click', e => {
        e.stopPropagation();
        selectedLayoutDeviceId = mb.id;
        syncLayoutEditor();
        renderLayoutCanvas();
    });
    makeLayoutDeviceDraggable(node);

    // Render children INSIDE the MB node
    children.forEach(child => {
        const cPos   = layoutChildPositions[child.id] || { x: 20, y: 60 };
        const cSize  = getLayoutDeviceSize(child, width);
        const cColor = child.leds && child.leds.length ? child.leds[0] : { r: 0, g: 180, b: 255 };
        const cKind  = getLayoutDeviceKind(child);
        const cTx    = getLayoutTransform(child.id);
        const cSel   = selectedLayoutDeviceId === child.id;

        const cNode = document.createElement('div');
        cNode.className = [
            'layout-device', 'layout-child-device', `layout-kind-${cKind}`,
            child.id.endsWith('_demo') ? 'demo-layout-device' : '',
            cSel ? 'selected' : '',
            cTx.hidden ? 'excluded' : ''
        ].filter(Boolean).join(' ');
        cNode.style.left   = `${cPos.x}px`;
        cNode.style.top    = `${cPos.y}px`;
        cNode.style.width  = `${cSize.width}px`;
        cNode.style.height = `${cSize.height}px`;
        cNode.dataset.deviceId = child.id;
        cNode.innerHTML = `
            <span class="layout-device-color" style="background:rgb(${cColor.r},${cColor.g},${cColor.b});color:rgb(${cColor.r},${cColor.g},${cColor.b});"></span>
            <span class="layout-device-name">${child.name}</span>
            <span class="layout-device-meta">${cTx.hidden ? 'Effect 제외 · ' : ''}${child.manufacturer} · ${child.type}</span>
        `;
        cNode.addEventListener('click', e => {
            e.stopPropagation();
            selectedLayoutDeviceId = child.id;
            syncLayoutEditor();
            renderLayoutCanvas();
        });
        makeChildDeviceDraggable(cNode, dims.width, dims.height);
        node.appendChild(cNode);
    });

    return node;
}

/**
 * Drag handler for devices inside the MB card.
 * Positions are stored in layoutChildPositions (relative to MB top-left).
 */
function makeChildDeviceDraggable(node, parentW, parentH) {
    let ds = null;
    node.addEventListener('pointerdown', e => {
        e.preventDefault();
        e.stopPropagation();   // don't trigger MB drag
        const devId = node.dataset.deviceId;
        ds = {
            startX: e.clientX,
            startY: e.clientY,
            ox: layoutChildPositions[devId]?.x ?? parseInt(node.style.left) ?? 20,
            oy: layoutChildPositions[devId]?.y ?? parseInt(node.style.top)  ?? 60,
            maxX: parentW - (parseInt(node.style.width)  || 54) - 4,
            maxY: parentH - (parseInt(node.style.height) || 86) - 4
        };
        node.setPointerCapture(e.pointerId);
    });
    node.addEventListener('pointermove', e => {
        if (!ds) return;
        const devId = node.dataset.deviceId;
        const x = Math.max(4, Math.min(ds.maxX, ds.ox + e.clientX - ds.startX));
        const y = Math.max(4, Math.min(ds.maxY, ds.oy + e.clientY - ds.startY));
        node.style.left = `${x}px`;
        node.style.top  = `${y}px`;
        layoutChildPositions[devId] = { x, y };
        if (selectedLayoutDeviceId === devId) syncLayoutEditor();
    });
    node.addEventListener('pointerup', e => {
        if (ds) {
            const moved = Math.abs(e.clientX - ds.startX) + Math.abs(e.clientY - ds.startY);
            if (moved > 4) e.stopPropagation();
            persistActiveLayoutProfile();
        }
        ds = null;
    });
    node.addEventListener('pointercancel', () => { ds = null; });
}

function getLayoutDeviceKind(dev) {
    const type = String(dev.type || '').toLowerCase();
    const name = String(dev.name || '').toLowerCase();
    const manufacturer = String(dev.manufacturer || '').toLowerCase();
    const text = `${type} ${name} ${manufacturer}`;

    if (text.includes('keyboard')) return 'keyboard';
    if (text.includes('mouse')) return 'mouse';
    if (text.includes('memory') || text.includes('ram') || text.includes('dimm')) return 'memory';
    if (text.includes('gpu') || text.includes('graphics') || text.includes('radeon') || text.includes('geforce') || text.includes('rtx')) return 'gpu';
    if (text.includes('fan') || text.includes('cooler') || text.includes('argb')) return 'fan';
    if (text.includes('motherboard') || text.includes('mainboard') || text.includes('z790') || text.includes('rog') || text.includes('aorus')) return 'motherboard';
    if (text.includes('light') || text.includes('hue') || text.includes('nanoleaf') || text.includes('govee')) return 'light';
    return 'other';
}

function getLayoutDeviceSize(dev, canvasWidth = 900) {
    const kind = getLayoutDeviceKind(dev);
    const narrow = canvasWidth < 640;
    const sizes = {
        motherboard: { width: narrow ? Math.min(canvasWidth - 72, 300) : 340, height: 238 },
        memory: { width: 54, height: 152 },
        fan: { width: 86, height: 86 },
        gpu: { width: narrow ? Math.min(canvasWidth - 72, 260) : 280, height: 76 },
        keyboard: { width: narrow ? Math.min(canvasWidth - 72, 260) : 260, height: 78 },
        mouse: { width: 126, height: 88 },
        light: { width: 176, height: 72 },
        other: { width: 176, height: 72 }
    };
    return sizes[kind] || sizes.other;
}

function calculateLayoutHeight(visibleDevices, width) {
    const counts = visibleDevices.reduce((acc, dev) => {
        const kind = getLayoutDeviceKind(dev);
        acc[kind] = (acc[kind] || 0) + 1;
        return acc;
    }, {});
    const cols = width < 640 ? 1 : Math.max(2, Math.floor((width - 80) / 190));
    const boardRows = Math.ceil((counts.motherboard || 0) / cols);
    const gpuRows = Math.ceil((counts.gpu || 0) / Math.max(1, width < 640 ? 1 : Math.floor((width - 80) / 210)));
    const otherRows = Math.ceil((counts.other || 0) / cols);
    return 620 + boardRows * 104 + gpuRows * 102 + otherRows * 72;
}

function getFallbackLayoutPosition(index, width, cardWidth) {
    const cols = Math.max(1, Math.floor((width - 40) / (cardWidth + 18)));
    return {
        x: 24 + (index % cols) * (cardWidth + 18),
        y: 88 + Math.floor(index / cols) * 88
    };
}

function loadLayoutProfiles() {
    try {
        const raw = localStorage.getItem('colordock-layout-profiles');
        const saved = raw ? JSON.parse(raw) : null;
        if (saved?.version === LAYOUT_STORAGE_VERSION) {
            layoutProfiles = saved?.profiles || {};
            activeLayoutProfile = saved?.active || 'Default';
        } else {
            layoutProfiles = {};
            activeLayoutProfile = 'Default';
        }
    } catch (err) {
        layoutProfiles = {};
        activeLayoutProfile = 'Default';
    }

    if (!layoutProfiles.Default) {
        layoutProfiles.Default = { positions: {}, transforms: {} };
    }
    if (!layoutProfiles[activeLayoutProfile]) {
        activeLayoutProfile = 'Default';
    }

    applyLayoutProfile(activeLayoutProfile);
    renderLayoutProfileOptions();
}

function saveLayoutProfilesToStorage() {
    localStorage.setItem('colordock-layout-profiles', JSON.stringify({
        version: LAYOUT_STORAGE_VERSION,
        active: activeLayoutProfile,
        profiles: layoutProfiles
    }));
}

function persistActiveLayoutProfile() {
    layoutProfiles[activeLayoutProfile] = {
        positions: structuredCloneSafe(layoutPositions),
        childPositions: structuredCloneSafe(layoutChildPositions),
        transforms: structuredCloneSafe(layoutDeviceTransforms)
    };
    saveLayoutProfilesToStorage();
}

function saveLayoutProfile(name) {
    const profileName = name || 'Default';
    activeLayoutProfile = profileName;
    persistActiveLayoutProfile();
    renderLayoutProfileOptions();
    if (elLayoutProfileName) elLayoutProfileName.value = '';
}

function deleteLayoutProfile(name) {
    if (!name || name === 'Default') return;
    delete layoutProfiles[name];
    activeLayoutProfile = 'Default';
    applyLayoutProfile(activeLayoutProfile);
    saveLayoutProfilesToStorage();
    renderLayoutProfileOptions();
    renderLayoutCanvas();
}

function switchLayoutProfile(name) {
    if (!layoutProfiles[name]) return;
    activeLayoutProfile = name;
    applyLayoutProfile(name);
    saveLayoutProfilesToStorage();
    renderLayoutProfileOptions();
    renderLayoutCanvas();
}

function applyLayoutProfile(name) {
    const profile = layoutProfiles[name] || layoutProfiles.Default || { positions: {}, transforms: {} };
    layoutPositions = structuredCloneSafe(profile.positions || {});
    layoutChildPositions = structuredCloneSafe(profile.childPositions || {});
    layoutDeviceTransforms = structuredCloneSafe(profile.transforms || {});
}

function renderLayoutProfileOptions() {
    if (!elLayoutProfileSelect) return;
    elLayoutProfileSelect.innerHTML = '';
    Object.keys(layoutProfiles).sort().forEach(name => {
        const option = document.createElement('option');
        option.value = name;
        option.innerText = name;
        option.selected = name === activeLayoutProfile;
        elLayoutProfileSelect.appendChild(option);
    });
}

function structuredCloneSafe(value) {
    return JSON.parse(JSON.stringify(value || {}));
}

function makeLayoutDeviceDraggable(node) {
    let dragState = null;
    node.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        const canvasRect = elLayoutCanvas.getBoundingClientRect();
        const nodeRect = node.getBoundingClientRect();
        dragState = {
            startX: e.clientX,
            startY: e.clientY,
            offsetX: nodeRect.left - canvasRect.left,
            offsetY: nodeRect.top - canvasRect.top
        };
        node.setPointerCapture(e.pointerId);
    });

    node.addEventListener('pointermove', (e) => {
        if (!dragState) return;
        const x = Math.max(8, dragState.offsetX + e.clientX - dragState.startX);
        const y = Math.max(8, dragState.offsetY + e.clientY - dragState.startY);
        node.style.left = `${x}px`;
        node.style.top = `${y}px`;
        layoutPositions[node.dataset.deviceId] = { x, y };
        if (selectedLayoutDeviceId === node.dataset.deviceId) {
            syncLayoutEditor();
        }
    });

    node.addEventListener('pointerup', (e) => {
        if (dragState) {
            const moved = Math.abs(e.clientX - dragState.startX) + Math.abs(e.clientY - dragState.startY);
            if (moved > 4) {
                e.stopPropagation();
            }
        }
        dragState = null;
        persistActiveLayoutProfile();
    });
}

function createDefaultLayoutTransform() {
    return { scale: 1, rotation: 0, flip: false, hidden: false };
}

function getLayoutTransform(deviceId) {
    if (!deviceId) return createDefaultLayoutTransform();
    if (!layoutDeviceTransforms[deviceId]) {
        layoutDeviceTransforms[deviceId] = createDefaultLayoutTransform();
    }
    return layoutDeviceTransforms[deviceId];
}

function updateSelectedLayoutPosition(axis, value) {
    if (!selectedLayoutDeviceId || Number.isNaN(value)) return;
    // Child device: update in layoutChildPositions
    if (layoutChildPositions[selectedLayoutDeviceId]) {
        const pos = layoutChildPositions[selectedLayoutDeviceId];
        pos[axis] = Math.max(0, value);
    } else {
        const pos = layoutPositions[selectedLayoutDeviceId] || { x: 24, y: 88 };
        pos[axis] = Math.max(0, value);
        layoutPositions[selectedLayoutDeviceId] = pos;
    }
    persistActiveLayoutProfile();
    renderLayoutCanvas();
}

function syncLayoutEditor() {
    const dev = devices.find(item => item.id === selectedLayoutDeviceId);
    const hasSelection = Boolean(dev);
    const transform = hasSelection ? getLayoutTransform(dev.id) : createDefaultLayoutTransform();
    // Child devices use layoutChildPositions; outer devices use layoutPositions
    const pos = hasSelection
        ? (layoutChildPositions[dev.id] || layoutPositions[dev.id] || { x: 0, y: 0 })
        : { x: 0, y: 0 };

    if (elLayoutSelectedName) {
        elLayoutSelectedName.innerText = hasSelection ? dev.name : '장치를 선택하세요';
    }
    if (elLayoutDeviceScale) {
        elLayoutDeviceScale.disabled = !hasSelection;
        elLayoutDeviceScale.value = Math.round(transform.scale * 100);
    }
    if (elLayoutDeviceX) {
        elLayoutDeviceX.disabled = !hasSelection;
        elLayoutDeviceX.value = Math.round(pos.x || 0);
    }
    if (elLayoutDeviceY) {
        elLayoutDeviceY.disabled = !hasSelection;
        elLayoutDeviceY.value = Math.round(pos.y || 0);
    }
    if (elLayoutDeviceRotation) {
        elLayoutDeviceRotation.disabled = !hasSelection;
        elLayoutDeviceRotation.value = transform.rotation;
    }
    if (elBtnLayoutFlip) {
        elBtnLayoutFlip.disabled = !hasSelection;
        elBtnLayoutFlip.classList.toggle('active-toggle', hasSelection && transform.flip);
    }
    if (elBtnLayoutHideSelected) {
        elBtnLayoutHideSelected.disabled = !hasSelection;
        elBtnLayoutHideSelected.innerText = hasSelection && transform.hidden ? 'Effect 포함' : 'Effect 제외';
        elBtnLayoutHideSelected.classList.toggle('active-toggle', hasSelection && transform.hidden);
    }
    if (elBtnLayoutResetSelected) {
        elBtnLayoutResetSelected.disabled = !hasSelection;
    }
}

function updateLayoutDeviceColor(deviceId, r, g, b) {
    const colorNode = document.querySelector(`.layout-device[data-device-id="${deviceId}"] .layout-device-color`);
    if (!colorNode) return;
    colorNode.style.background = `rgb(${r}, ${g}, ${b})`;
    colorNode.style.color = `rgb(${r}, ${g}, ${b})`;
}

function updateLayoutHint() {
    if (elLayoutCanvasHint) {
        if (selectedLayoutDeviceId) {
            elLayoutCanvasHint.innerText = '효과는 캔버스 전체에서 흐르고 선택 장치는 자기 좌표 영역의 색을 샘플링합니다.';
        } else {
            elLayoutCanvasHint.innerText = '장치를 실제 위치에 놓고 좌표, 크기, 회전, 반전을 조정하세요.';
        }
    }
}

function getLayoutPhase(dev, ledIndex, ledCount) {
    const ledOffset = ledCount > 1 ? ledIndex / (ledCount - 1) : 0;
    let spatial = ledOffset;
    const direction = deviceLedDirections[dev.id] || 'forward';
    const transform = getLayoutTransform(dev.id);
    const pos = layoutPositions[dev.id] || { x: 0, y: 0 };
    const size = getLayoutDeviceSize(dev, elLayoutCanvas?.clientWidth || 900);
    const canvasWidth = Math.max(elLayoutCanvas?.clientWidth || 900, 1);
    const canvasHeight = Math.max(elLayoutCanvas?.scrollHeight || elLayoutCanvas?.clientHeight || 640, 1);

    if (direction === 'reverse') {
        spatial = 1 - ledOffset;
    } else if (direction === 'center-out') {
        spatial = Math.abs(ledOffset - 0.5) * 2;
    } else if (direction === 'outside-in') {
        spatial = 1 - Math.abs(ledOffset - 0.5) * 2;
    }
    if (transform.flip) {
        spatial = 1 - spatial;
    }

    const spread = Math.max(0.1, layoutEffectSettings.spread / 5);
    const rotationTurns = ((transform.rotation || 0) % 360) / 360;
    const sampleX = (pos.x + spatial * size.width * transform.scale) / canvasWidth;
    const sampleY = (pos.y + size.height * 0.5 * transform.scale) / canvasHeight;
    return (sampleX * 0.72 + sampleY * 0.28 + rotationTurns * 0.18 + spatial * spread * 0.2) % 1;
}

// Fetch active devices from Flask Backend
async function fetchDevices() {
    try {
        const res = await fetchWithRetry(`${API_BASE}/devices`);
        devices = limitDemoDevicesByCategory(await res.json());
        
        // Initialize local states for each device if not already set
        devices.forEach(dev => {
            if (!deviceColors[dev.id]) {
                if (dev.leds && dev.leds.length > 0) {
                    deviceColors[dev.id] = { r: dev.leds[0].r, g: dev.leds[0].g, b: dev.leds[0].b };
                } else {
                    deviceColors[dev.id] = { r: masterColor.r, g: masterColor.g, b: masterColor.b };
                }
            }
            if (deviceSelectedLeds[dev.id] === undefined) {
                deviceSelectedLeds[dev.id] = null;
            }
            deviceModes[dev.id] = dev.mode || deviceModes[dev.id] || 'sync';
            if (!deviceLedDirections[dev.id]) {
                deviceLedDirections[dev.id] = 'forward';
            }
        });
        
        elDevicesCount.innerText = `${devices.length}개의 기기 검색됨`;
        renderDevices();
        renderLayoutCanvas();
    } catch (err) {
        console.error('Failed to load devices:', err);
        elDevicesGrid.innerHTML = `
            <div style="text-align: center; padding: 3rem; color: var(--text-secondary);">
                서버로부터 기기 목록을 가져올 수 없습니다.
            </div>`;
    }
}

function limitDemoDevicesByCategory(sourceDevices) {
    const seenDemoKinds = new Set();
    return sourceDevices.filter(dev => {
        if (!dev.id || !dev.id.endsWith('_demo')) return true;
        const kind = getLayoutDeviceKind(dev);
        if (seenDemoKinds.has(kind)) return false;
        seenDemoKinds.add(kind);
        return true;
    });
}

/* ── Device pagination ── */
const DEVICE_PAGE_SIZE = 20;
let _deviceRenderOffset = 0;     // how many cards are currently rendered
let _lastFilteredDevices = [];   // last filtered set (for load-more)

function _resetDevicePage() { _deviceRenderOffset = 0; }

// Render Devices list dynamically with search and category filters
function renderDevices() {
    _resetDevicePage();
    hideFloatingPicker();
    elDevicesGrid.innerHTML = '';

    // Filter devices based on Search Bar Query and Selected Category Chip
    const filteredDevices = devices.filter(dev => {
        // 1. Search Query filter
        const nameMatch = dev.name.toLowerCase().includes(searchQuery);
        const mfgMatch = dev.manufacturer.toLowerCase().includes(searchQuery);
        const typeMatch = dev.type.toLowerCase().includes(searchQuery);
        const matchesSearch = searchQuery === '' || nameMatch || mfgMatch || typeMatch;

        if (!matchesSearch) return false;

        // 2. Category Filter
        if (selectedCategory === 'all') return true;
        if (selectedCategory === 'keyboard') {
            return dev.type.toLowerCase().includes('keyboard');
        }
        if (selectedCategory === 'mouse') {
            return dev.type.toLowerCase().includes('mouse');
        }
        if (selectedCategory === 'component') {
            const t = dev.type.toLowerCase();
            return t.includes('motherboard') || t.includes('gpu') || t.includes('ram') || t.includes('fans') || t.includes('fan');
        }
        if (selectedCategory === 'smart-light') {
            return dev.type.toLowerCase().includes('smart light') || dev.manufacturer.toLowerCase().includes('hue') || dev.manufacturer.toLowerCase().includes('nanoleaf') || dev.manufacturer.toLowerCase().includes('govee');
        }
        if (selectedCategory === 'custom') {
            return dev.id.includes('custom_hid');
        }
        return true;
    });

    // 기기 수 뱃지 업데이트
    if (elDevicesCount) {
        elDevicesCount.textContent = `${devices.length}개 기기 연결됨`;
    }

    if (filteredDevices.length === 0) {
        elDevicesGrid.innerHTML = `
            <div style="text-align:center;padding:3rem;color:var(--text-secondary);background:var(--glass-bg);border-radius:20px;border:1px solid var(--glass-border);">
                연결된 기기가 없습니다.<br>
                <span style="font-size:0.78rem;opacity:0.7;">OpenRGB를 서버 모드로 실행하면 메인보드·RAM·GPU가 자동 감지됩니다.</span>
            </div>`;
        return;
    }

    // Store for paging; render first page immediately
    _lastFilteredDevices = filteredDevices;
    _appendDevicePage();
}

// ── 자동 업데이트 ──────────────────────────────────────────────
let _latestInstallerUrl = null;

async function checkForUpdate() {
    try {
        const res = await fetch(`${API_BASE}/update/check`);
        const data = await res.json();
        if (data.update && data.installer_url) {
            _latestInstallerUrl = data.installer_url;
            const banner = document.getElementById('update-banner');
            const text   = document.getElementById('update-text');
            if (banner && text) {
                text.textContent = `🆕 v${data.latest} 업데이트 있음`;
                banner.style.display = 'flex';
            }
        }
    } catch(e) {
        console.log('Update check failed:', e.message);
    }
}

async function doUpdate() {
    if (!_latestInstallerUrl) return;
    const btn = document.getElementById('btn-do-update');
    if (btn) { btn.textContent = '다운로드 중...'; btn.disabled = true; }
    try {
        // launcher.py의 /api/update/download 엔드포인트 호출
        const res = await fetch(`${API_BASE}/update/download`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({url: _latestInstallerUrl})
        });
        const data = await res.json();
        if (data.ok) {
            if (btn) btn.textContent = '설치 준비 완료 ✓';
            showToast('업데이트 파일 준비 완료! 잠시 후 설치가 시작됩니다.');
        } else {
            if (btn) { btn.textContent = '지금 업데이트'; btn.disabled = false; }
            showToast('업데이트 다운로드 실패: ' + data.error);
        }
    } catch(e) {
        if (btn) { btn.textContent = '지금 업데이트'; btn.disabled = false; }
        showToast('업데이트 오류: ' + e.message);
    }
}

// 데모 기기 숨기기 토글
function toggleDeviceDemo() {
    _deviceHideDemo = !_deviceHideDemo;
    renderDevices();
}

// Nanoleaf 모달
function openNanoleafModal() {
    const modal = document.getElementById('nanoleaf-modal');
    if (modal) modal.style.display = 'flex';
}
function closeNanoleafModal() {
    const modal = document.getElementById('nanoleaf-modal');
    if (modal) modal.style.display = 'none';
}
async function connectNanoleaf() {
    const ip = document.getElementById('nanoleaf-ip-input').value.trim();
    const statusEl = document.getElementById('nanoleaf-status');
    if (!ip) { statusEl.textContent = '⚠ IP 주소를 입력하세요.'; return; }
    statusEl.textContent = '🔄 연결 시도 중...';
    statusEl.style.color = 'var(--text-secondary)';
    try {
        const res = await fetch(`${API_BASE}/nanoleaf/connect`, {
            method: 'POST',
            headers: {'Content-Type': 'application/json'},
            body: JSON.stringify({ip})
        });
        const data = await res.json();
        if (data.ok) {
            statusEl.textContent = `✅ ${data.message}`;
            statusEl.style.color = 'var(--success-color)';
            setTimeout(() => { closeNanoleafModal(); fetchDevices(); }, 1500);
        } else {
            statusEl.textContent = `❌ ${data.message}`;
            statusEl.style.color = 'var(--error-color, #EF5350)';
        }
    } catch(e) {
        statusEl.textContent = '❌ 서버 통신 오류: ' + e.message;
        statusEl.style.color = 'var(--error-color, #EF5350)';
    }
}

// Renders the next page of _lastFilteredDevices into elDevicesGrid
function _appendDevicePage() {
    const start  = _deviceRenderOffset;
    const end    = Math.min(start + DEVICE_PAGE_SIZE, _lastFilteredDevices.length);
    const slice  = _lastFilteredDevices.slice(start, end);
    _deviceRenderOffset = end;

    // Remove existing load-more sentinel before appending new cards
    const old = document.getElementById('device-load-more-btn');
    if (old) old.remove();

    slice.forEach(dev => {
        const card = document.createElement('div');
        card.className = 'device-card';
        card.id = `device-card-${dev.id}`;
        card.setAttribute('data-type', dev.type);
        card.setAttribute('data-dev-id', dev.id);
        card.setAttribute('draggable', 'true');
        card.addEventListener('dragstart', _onCardDragStart);
        card.addEventListener('dragover',  _onCardDragOver);
        card.addEventListener('dragleave', _onCardDragLeave);
        card.addEventListener('drop',      _onCardDrop);
        card.addEventListener('dragend',   _onCardDragEnd);
        
        const devMode = deviceModes[dev.id] || 'sync';
        const localColor = deviceColors[dev.id] || { r: 0, g: 180, b: 255 };
        const hexColor = rgbToHex(localColor.r, localColor.g, localColor.b);
        const selectedLedIdx = deviceSelectedLeds[dev.id];
        
        let targetText = "대상: 전체 기기";
        let clearBtnStyle = "display: none;";
        if (selectedLedIdx !== null && selectedLedIdx !== undefined) {
            if (dev.key_layout && dev.key_layout[selectedLedIdx]) {
                targetText = `대상: [Key: ${dev.key_layout[selectedLedIdx].key}]`;
            } else {
                targetText = `대상: [LED #${selectedLedIdx + 1}]`;
            }
            clearBtnStyle = "display: inline-block;";
        }
        
        // Custom branding / type configurations
        let typeClass = dev.type.toLowerCase().replace(' ', '-');
        if (dev.manufacturer === 'NVIDIA') {
            typeClass = 'gpu-nvidia';
        } else if (dev.manufacturer === 'AMD') {
            typeClass = 'gpu-amd';
        } else if (dev.manufacturer === 'Philips_Hue') {
            typeClass = 'iot-philips';
        } else if (dev.manufacturer === 'Nanoleaf') {
            typeClass = 'iot-nanoleaf';
        } else if (dev.manufacturer === 'Govee') {
            typeClass = 'iot-govee';
        }
        
        let zonesHTML = '';
        
        // Render keyboard keycap layout dynamically (Supports 60%, TKL Aula F87 etc.)
        if (dev.key_layout && dev.key_layout.length > 0) {
            // Compute dynamic width and height to fit both 60% and TKL layouts without cropping
            const maxKeyX = Math.max(...dev.key_layout.map(k => k.x + k.w));
            const maxKeyY = Math.max(...dev.key_layout.map(k => k.y + 1));
            const plateWidth = Math.round(maxKeyX * 32 + 12);
            const plateHeight = Math.round(maxKeyY * 32 + 12);

            zonesHTML = `
                <div class="device-control-inputs">
                    <span class="input-label">${dev.manufacturer === 'Aula' ? 'Aula F87 TKL' : 'VIA/QMK'} Keyboard Keycap Visualizer</span>
                    <div class="keyboard-visualizer-container">
                        <div class="keyboard-inner-plate" id="leds-for-${dev.id}" style="width: ${plateWidth}px; height: ${plateHeight}px;">
                            ${dev.key_layout.map((keyInfo, idx) => {
                                const led = dev.leds[idx] || {r: 0, g: 180, b: 255};
                                const leftPx = keyInfo.x * 32;
                                const topPx = keyInfo.y * 32;
                                const widthPx = keyInfo.w * 32 - 4;
                                return `
                                    <div class="keycap-node" 
                                         id="led-${dev.id}-${idx}" 
                                         data-name="${dev.name} - Key: ${keyInfo.key}"
                                         onclick="clickSingleNode('${dev.id}', ${idx})"
                                         style="left: ${leftPx}px; top: ${topPx}px; width: ${widthPx}px; height: 28px; background-color: rgb(${led.r}, ${led.g}, ${led.b}); box-shadow: 0 0 10px rgba(${led.r}, ${led.g}, ${led.b}, 0.6);">
                                        <span class="keycap-label" style="font-size: 7px;">${keyInfo.key}</span>
                                        <span class="keycap-led-dot"></span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>`;
        } 
        // 1. Philips Hue Lightbar rendering
        else if (dev.lightbar_layout) {
            zonesHTML = `
                <div class="device-control-inputs">
                    <span class="input-label">Hue Play Lightbar Gradients</span>
                    <div class="lightbar-visualizer-container">
                        ${dev.leds.map((led, idx) => `
                            <div class="lightbar-tube-wrapper" onclick="clickSingleNode('${dev.id}', ${idx})">
                                <span class="lightbar-label">${idx === 0 ? "좌측 (Left)" : "우측 (Right)"}</span>
                                <div class="lightbar-tube" id="led-${dev.id}-${idx}" 
                                     style="background: linear-gradient(to top, rgba(${led.r}, ${led.g}, ${led.b}, 0.2), rgb(${led.r}, ${led.g}, ${led.b})); box-shadow: 0 0 20px rgba(${led.r}, ${led.g}, ${led.b}, 0.8);">
                                    <div class="lightbar-inner-glow"></div>
                                </div>
                            </div>
                        `).join('')}
                    </div>
                </div>`;
        }
        // 2. Nanoleaf Hexagons rendering
        else if (dev.panels && dev.panels.length > 0) {
            zonesHTML = `
                <div class="device-control-inputs">
                    <span class="input-label">Nanoleaf Hexagonal Honeycomb Panels</span>
                    <div class="nanoleaf-visualizer-container">
                        <div class="nanoleaf-inner-canvas" id="leds-for-${dev.id}">
                            ${dev.panels.map((panel, idx) => {
                                const led = dev.leds[idx] || {r: 0, g: 180, b: 255};
                                return `
                                    <div class="nanoleaf-hexagon" 
                                         id="led-${dev.id}-${idx}" 
                                         onclick="clickSingleNode('${dev.id}', ${idx})"
                                         style="left: ${panel.x}px; top: ${panel.y}px; background-color: rgb(${led.r}, ${led.g}, ${led.b}); filter: drop-shadow(0 0 12px rgba(${led.r}, ${led.g}, ${led.b}, 0.7));">
                                        <span class="hexagon-label">${panel.id + 1}</span>
                                    </div>
                                `;
                            }).join('')}
                        </div>
                    </div>
                </div>`;
        }
        // 3. Govee Neon Rope rendering
        else if (dev.rope_layout && dev.rope_layout.length > 0) {
            const pointsStr = generateSvgPath(dev.rope_layout);
            zonesHTML = `
                <div class="device-control-inputs">
                    <span class="input-label">Govee Neon Rope Curve Visualizer</span>
                    <div class="govee-visualizer-container">
                        <svg class="govee-svg-canvas" viewBox="0 0 400 150">
                            <defs>
                                <filter id="neon-glow-${dev.id}" x="-50%" y="-50%" width="200%" height="200%">
                                    <feGaussianBlur stdDeviation="8" result="blur1" />
                                    <feGaussianBlur stdDeviation="3" result="blur2" />
                                    <feMerge>
                                        <feMergeNode in="blur1" />
                                        <feMergeNode in="blur2" />
                                        <feMergeNode in="SourceGraphic" />
                                    </feMerge>
                                </filter>
                            </defs>
                            <path class="govee-rope-backing" id="rope-path-${dev.id}" 
                                  d="${pointsStr}"
                                  style="stroke: rgba(${dev.leds[0].r}, ${dev.leds[0].g}, ${dev.leds[0].b}, 0.45); filter: url(#neon-glow-${dev.id});" />
                            ${dev.rope_layout.map((pt, idx) => {
                                const led = dev.leds[idx] || {r: 0, g: 180, b: 255};
                                return `
                                    <circle class="govee-rope-node"
                                            id="led-${dev.id}-${idx}"
                                            cx="${pt.x}" cy="${pt.y}" r="6"
                                            onclick="clickSingleNode('${dev.id}', ${idx})"
                                            style="fill: rgb(${led.r}, ${led.g}, ${led.b}); filter: drop-shadow(0 0 5px rgba(${led.r}, ${led.g}, ${led.b}, 0.8));"
                                            data-name="${dev.name} - Node #${idx + 1}" />
                                `;
                            }).join('')}
                        </svg>
                    </div>
                </div>`;
        }
        // 4. Mice (VGN, VXE, Logitech, Razer, Custom HID mice etc.) Rendering using custom SVG body
        else if (dev.type.toLowerCase().includes('mouse')) {
            zonesHTML = `
                <div class="device-control-inputs">
                    <span class="input-label">Gaming Mouse Glow Visualizer (Wheel & Body)</span>
                    <div class="mouse-visualizer-container">
                        <svg class="mouse-svg-canvas" viewBox="0 0 140 180">
                            <!-- Mouse Shell Outline -->
                            <path class="mouse-body-outline" d="M 70 10 C 30 10, 20 50, 20 90 C 20 130, 35 170, 70 170 C 105 170, 120 130, 120 90 C 120 50, 110 10, 70 10 Z" />
                            <path d="M 70 10 L 70 70 M 20 60 C 40 60, 100 60, 120 60" stroke="rgba(255,255,255,0.06)" stroke-width="1.5" fill="none" />
                            <rect class="mouse-wheel" x="66" y="26" width="8" height="18" rx="2" style="fill: rgb(${dev.leds[0]?.r || 0}, ${dev.leds[0]?.g || 180}, ${dev.leds[0]?.b || 255}); filter: drop-shadow(0 0 4px rgba(${dev.leds[0]?.r || 0}, ${dev.leds[0]?.g || 180}, ${dev.leds[0]?.b || 255}, 0.8));" />
                            
                            <!-- Arrange LED Nodes inside the Mouse Body -->
                            ${dev.leds.map((led, idx) => {
                                let cx = 70;
                                let cy = 90;
                                if (idx === 0) { // Wheel
                                    cx = 70; cy = 35;
                                } else if (idx === dev.leds.length - 1) { // Palm Tail Logo
                                    cx = 70; cy = 130;
                                } else { // Body strips
                                    const half = Math.floor((dev.leds.length - 2) / 2);
                                    if (idx - 1 < half) { // Left strip
                                        const ratio = (idx - 1) / Math.max(1, half - 1);
                                        cx = Math.round(30 + 10 * ratio);
                                        cy = Math.round(60 + 70 * ratio);
                                    } else { // Right strip
                                        const ratio = (idx - 1 - half) / Math.max(1, half - 1);
                                        cx = Math.round(110 - 10 * ratio);
                                        cy = Math.round(60 + 70 * ratio);
                                    }
                                }
                                return `
                                    <circle class="mouse-led-node" 
                                            id="led-${dev.id}-${idx}" 
                                            cx="${cx}" cy="${cy}" r="5" 
                                            onclick="clickSingleNode('${dev.id}', ${idx})"
                                            style="fill: rgb(${led.r}, ${led.g}, ${led.b}); filter: drop-shadow(0 0 6px rgba(${led.r}, ${led.g}, ${led.b}, 0.8));" 
                                            data-name="${dev.name} - LED #${idx + 1}" />
                                `;
                            }).join('')}
                        </svg>
                    </div>
                </div>`;
        }
        // Standard LED Grid rendering for Motherboards, RAM, GPU reference and Fans
        else if (dev.led_count > 0) {
            zonesHTML = `
                <div class="device-control-inputs">
                    <span class="input-label">LED Visualizer Nodes</span>
                    <div class="led-visualizer-grid" id="leds-for-${dev.id}">
                        ${dev.leds.map((led, idx) => `
                            <div class="led-node" 
                                 id="led-${dev.id}-${idx}" 
                                 data-name="${dev.name} - LED #${idx + 1}"
                                 onclick="clickSingleNode('${dev.id}', ${idx})"
                                 style="background-color: rgb(${led.r}, ${led.g}, ${led.b}); box-shadow: 0 0 8px rgb(${led.r}, ${led.g}, ${led.b});">
                            </div>
                        `).join('')}
                    </div>
                </div>`;
        }

        // Manufacturer badge
        let mfgLogo = dev.manufacturer;
        if (dev.manufacturer === 'VIA_QMK') mfgLogo = 'VIA / QMK HID';
        else if (dev.manufacturer === 'Philips_Hue') mfgLogo = 'Philips Hue';

        // Build compact device-level effect selector
        const deviceEffects = [
            { id: 'sync', label: '마스터 동기화' },
            { id: 'static', label: '단색' },
            { id: 'rainbow', label: '무지개' },
            { id: 'breathing', label: '브리딩' },
            { id: 'strobe', label: '스트로브' },
            { id: 'wave', label: '웨이브' },
            { id: 'sensor', label: '온도 센서' },
            { id: 'audio', label: '뮤직 싱크' },
            { id: 'ambient', label: '화면 복제' },
            { id: 'game', label: '게임 연동' },
            { id: 'disabled', label: '끄기' },
        ];

        const effectOptionsHTML = deviceEffects
            .map(eff => `<option value="${eff.id}" ${devMode === eff.id ? 'selected' : ''}>${eff.label}</option>`)
            .join('');

        card.innerHTML = `
            <div class="device-info-panel">
                <div class="device-meta">
                    <span class="device-type-badge ${typeClass}">${dev.type}</span>
                    <h3 class="device-name">${dev.name}</h3>
                    <span class="device-led-count">${mfgLogo} • ${dev.led_count} LEDs</span>
                </div>
                <div class="device-control-inputs">
                    <div class="control-col" style="gap:0.3rem;">
                        <span class="input-label">효과</span>
                        <select class="select-mode" id="device-effect-${dev.id}" onchange="setDeviceEffect('${dev.id}', this.value, event)">
                            ${effectOptionsHTML}
                        </select>
                    </div>
                    <div class="control-col" style="gap:0.3rem;">
                        <span class="input-label">방향</span>
                        <select class="select-mode" id="led-direction-${dev.id}" onchange="setDeviceLedDirection('${dev.id}', this.value)">
                            <option value="forward" ${deviceLedDirections[dev.id] === 'forward' ? 'selected' : ''}>정방향</option>
                            <option value="reverse" ${deviceLedDirections[dev.id] === 'reverse' ? 'selected' : ''}>역방향</option>
                            <option value="center-out" ${deviceLedDirections[dev.id] === 'center-out' ? 'selected' : ''}>중앙 → 바깥</option>
                            <option value="outside-in" ${deviceLedDirections[dev.id] === 'outside-in' ? 'selected' : ''}>바깥 → 중앙</option>
                        </select>
                    </div>
                    <div class="control-row-horizontal">
                        <div class="picker-wrapper" id="picker-${dev.id}" style="background-color: ${hexColor};" onclick="openDeviceFloatingPicker('${dev.id}', this, event)">
                            <div class="picker-inner-glow"></div>
                        </div>
                        <span class="input-label">색상</span>
                    </div>
                    <div class="target-indicator" id="target-indicator-${dev.id}">
                        <span class="target-text" id="target-text-${dev.id}">${targetText}</span>
                        <button class="btn-clear-target" id="btn-clear-${dev.id}" style="${clearBtnStyle}" onclick="clearSelectedLed('${dev.id}')">해제</button>
                    </div>
                    <button class="btn-gradient-edit" onclick="openGradientEditor('${dev.id}')" title="그라디언트 에디터">🎨 그라디언트</button>
                </div>
            </div>
            <div class="device-interactive-panel">
                ${zonesHTML}
            </div>
        `;
        
        elDevicesGrid.appendChild(card);
    });

    // Upgrade any new <select class="select-mode"> to custom dropdowns
    initCustomSelects(elDevicesGrid);
    adjustVisualizerScales();
    requestAnimationFrame(adjustVisualizerScales);

    // Virtual scroll sentinel (IntersectionObserver auto-loads next page)
    if (_deviceRenderOffset < _lastFilteredDevices.length) {
        const remaining = _lastFilteredDevices.length - _deviceRenderOffset;
        const sentinel = document.createElement('div');
        sentinel.id = 'device-load-more-btn';
        sentinel.className = 'load-more-sentinel';
        sentinel.setAttribute('data-remaining', remaining);
        elDevicesGrid.appendChild(sentinel);

        if (!window._deviceScrollObserver) {
            window._deviceScrollObserver = new IntersectionObserver((entries) => {
                entries.forEach(entry => {
                    if (entry.isIntersecting) {
                        window._deviceScrollObserver.unobserve(entry.target);
                        _appendDevicePage();
                    }
                });
            }, { rootMargin: '200px' });
        }
        window._deviceScrollObserver.observe(sentinel);
    }
}

// Trigger change in device mode dropdown and notify backend
window.changeDeviceMode = async function(deviceId, val) {
    const dev = devices.find(d => d.id === deviceId);
    if (!dev) return;
    
    deviceModes[deviceId] = val;
    
    if (val !== 'independent' && val !== 'static') {
        clearSelectedLed(deviceId);
    }
    
    try {
        await fetch(`${API_BASE}/device/mode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: deviceId, mode: val })
        });
        
        if (val === 'disabled') {
            sendDeviceColor(deviceId, 0, 0, 0);
            updateDeviceLedsUI(deviceId, 0, 0, 0);
        } else if (val === 'sync') {
            if (activeEffect === 'static') {
                sendDeviceColor(deviceId, masterColor.r, masterColor.g, masterColor.b);
                updateDeviceLedsUI(deviceId, masterColor.r, masterColor.g, masterColor.b);
            } else if (activeEffect === 'off') {
                sendDeviceColor(deviceId, 0, 0, 0);
                updateDeviceLedsUI(deviceId, 0, 0, 0);
            }
        } else if (val === 'static') {
            const localColor = deviceColors[deviceId] || { r: 0, g: 180, b: 255 };
            sendDeviceColor(deviceId, localColor.r, localColor.g, localColor.b);
            updateDeviceLedsUI(deviceId, localColor.r, localColor.g, localColor.b);
        }
        
        updateAnimationIntervalState();
    } catch (err) {
        console.error('Failed to change device mode:', err);
    }
};

// Called when user clicks an effect button on a device card
window.setDeviceEffect = async function(deviceId, effectId, event) {
    if (event) event.stopPropagation();
    
    const dev = devices.find(d => d.id === deviceId);
    if (!dev) return;
    
    // Map effectId to the device mode value
    // 'static', 'rainbow', 'breathing', 'strobe', 'wave', 'sensor', 'audio', 'ambient', 'game', 'disabled'
    // These are all valid device modes directly
    await changeDeviceMode(deviceId, effectId);
    
    // Update button highlight states in this device's grid
    updateDeviceEffectBtnsUI(deviceId, effectId);
};

window.setDeviceLedDirection = function(deviceId, direction) {
    deviceLedDirections[deviceId] = direction;
};

// Update active state of per-device effect buttons
function updateDeviceEffectBtnsUI(deviceId, activeEffectId) {
    const select = document.getElementById(`device-effect-${deviceId}`);
    if (select) {
        select.value = activeEffectId;
        // Sync custom dropdown if present
        const customWrap = select.parentNode && select.parentNode.classList.contains('custom-select')
            ? select.parentNode : null;
        if (customWrap && customWrap._cs) customWrap._cs.refresh();
        else if (select._customSelectAttached) {
            // find the wrapper sibling
            const wrapper = select.previousSibling;
            if (wrapper && wrapper.classList && wrapper.classList.contains('custom-select')) {
                const opts = wrapper.querySelectorAll('.custom-select-option');
                opts.forEach(o => o.classList.toggle('selected', o.dataset.value === activeEffectId));
                const trigger = wrapper.querySelector('.custom-select-label');
                if (trigger) {
                    const icon = EFFECT_ICONS[activeEffectId] || '';
                    const optEl = Array.from(select.options).find(o => o.value === activeEffectId);
                    if (optEl) trigger.innerHTML = icon ? `<span class="opt-icon">${icon}</span>${optEl.text}` : optEl.text;
                }
            }
        }
    }
    const effectIds = ['static', 'rainbow', 'breathing', 'strobe', 'wave', 'sensor', 'audio', 'ambient', 'game', 'disabled'];
    effectIds.forEach(eid => {
        const btn = document.getElementById(`dev-eff-${deviceId}-${eid}`);
        if (btn) {
            if (eid === activeEffectId) {
                btn.classList.add('active');
            } else {
                btn.classList.remove('active');
            }
        }
    });
}

function updateSyncedDeviceEffectButtons(effectId) {
    const buttonEffectId = effectId === 'off' ? 'disabled' : effectId;
    devices.forEach(dev => {
        const mode = deviceModes[dev.id] || 'sync';
        if (mode === 'sync') {
            updateDeviceEffectBtnsUI(dev.id, buttonEffectId);
        }
    });
}

function updateFloatingPickerUI(r, g, b, hex) {
    const elFloatingSlideRed = document.getElementById('floating-slide-red');

    const elFloatingSlideGreen = document.getElementById('floating-slide-green');
    const elFloatingSlideBlue = document.getElementById('floating-slide-blue');
    
    if (elFloatingSlideRed) elFloatingSlideRed.value = r;
    if (elFloatingSlideGreen) elFloatingSlideGreen.value = g;
    if (elFloatingSlideBlue) elFloatingSlideBlue.value = b;
    
    const elFloatingValRed = document.getElementById('floating-val-red');
    const elFloatingValGreen = document.getElementById('floating-val-green');
    const elFloatingValBlue = document.getElementById('floating-val-blue');
    if (elFloatingValRed) elFloatingValRed.innerText = r;
    if (elFloatingValGreen) elFloatingValGreen.innerText = g;
    if (elFloatingValBlue) elFloatingValBlue.innerText = b;
    
    if (elFloatingColorInput) elFloatingColorInput.value = hex;
    
    const elFloatingHexInput = document.getElementById('floating-hex-input');
    if (elFloatingHexInput) elFloatingHexInput.value = hex;
}

async function sendFloatingColorUpdate(r, g, b, hex) {
    if (activePickerDeviceId === null) return;
    
    if (activePickerLedIndex !== null) {
        sendSingleLedColorThrottled(activePickerDeviceId, activePickerLedIndex, r, g, b);
        
        const currentMode = deviceModes[activePickerDeviceId] || 'sync';
        if (currentMode === 'sync' || currentMode === 'disabled') {
            deviceModes[activePickerDeviceId] = 'independent';
            updateDeviceEffectBtnsUI(activePickerDeviceId, 'independent');
            
            try {
                await fetch(`${API_BASE}/device/mode`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: activePickerDeviceId, mode: 'independent' })
                });
            } catch (err) {
                console.error('Failed to change device mode:', err);
            }
            updateAnimationIntervalState();
        }
    } else {
        deviceColors[activePickerDeviceId] = { r, g, b };
        
        const badge = document.getElementById(`picker-${activePickerDeviceId}`);
        if (badge) {
            badge.style.backgroundColor = hex;
        }
        
        const currentMode = deviceModes[activePickerDeviceId] || 'sync';
        if (currentMode === 'sync' || currentMode === 'disabled') {
            deviceModes[activePickerDeviceId] = 'static';
            updateDeviceEffectBtnsUI(activePickerDeviceId, 'static');
            
            try {
                await fetch(`${API_BASE}/device/mode`, {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({ id: activePickerDeviceId, mode: 'static' })
                });
            } catch (err) {
                console.error('Failed to change device mode:', err);
            }
            updateAnimationIntervalState();
        }
        
        sendDeviceColorThrottled(activePickerDeviceId, r, g, b);
    }
}


function openDeviceFloatingPicker(deviceId, element, event) {
    if (event) {
        event.stopPropagation();
    }
    
    const card = document.getElementById(`device-card-${deviceId}`);
    if (card) {
        card.querySelectorAll('.selected-led').forEach(node => {
            node.classList.remove('selected-led');
        });
    }
    deviceSelectedLeds[deviceId] = null;
    
    const targetTextEl = document.getElementById(`target-text-${deviceId}`);
    const clearBtnEl = document.getElementById(`btn-clear-${deviceId}`);
    if (targetTextEl) targetTextEl.innerText = "대상: 전체 기기";
    if (clearBtnEl) clearBtnEl.style.display = 'none';
    
    activePickerDeviceId = deviceId;
    activePickerLedIndex = null;
    
    const dev = devices.find(d => d.id === deviceId);
    if (!dev) return;
    
    const titleEl = document.getElementById('floating-picker-title');
    if (titleEl) {
        titleEl.innerText = `${dev.name}`;
    }
    
    const color = deviceColors[deviceId] || { r: 0, g: 180, b: 255 };
    const hex = rgbToHex(color.r, color.g, color.b);
    
    updateFloatingPickerUI(color.r, color.g, color.b, hex);
    
    elFloatingPicker.style.display = 'block';
    
    const rect = element.getBoundingClientRect();
    const pickerWidth = elFloatingPicker.offsetWidth || 260;
    const pickerHeight = elFloatingPicker.offsetHeight || 280;
    
    // Use viewport-relative (fixed) positioning
    let left = rect.left + (rect.width / 2) - (pickerWidth / 2);
    let top = rect.top - pickerHeight - 8;
    
    // Clamp horizontally within viewport
    if (left < 10) left = 10;
    if (left + pickerWidth > window.innerWidth - 10) {
        left = window.innerWidth - pickerWidth - 10;
    }
    // If no room above, show below
    if (top < 10) {
        top = rect.bottom + 8;
    }
    // If still clipped at bottom, cap it
    if (top + pickerHeight > window.innerHeight - 10) {
        top = window.innerHeight - pickerHeight - 10;
    }
    
    elFloatingPicker.style.left = `${left}px`;
    elFloatingPicker.style.top = `${top}px`;
}
window.openDeviceFloatingPicker = openDeviceFloatingPicker;

function showFloatingPicker(deviceId, idx) {
    activePickerDeviceId = deviceId;
    activePickerLedIndex = idx;

    const node = document.getElementById(`led-${deviceId}-${idx}`);
    if (!node || !elFloatingPicker) return;

    // Get current LED color
    const dev = devices.find(d => d.id === deviceId);
    let r = 0, g = 180, b = 255;
    if (dev && dev.leds && dev.leds[idx]) {
        r = dev.leds[idx].r;
        g = dev.leds[idx].g;
        b = dev.leds[idx].b;
    }
    const hex = rgbToHex(r, g, b);

    // Update Title
    const titleEl = document.getElementById('floating-picker-title');
    if (titleEl && dev) {
        if (dev.key_layout && dev.key_layout[idx]) {
            titleEl.innerText = `${dev.name} - Key: ${dev.key_layout[idx].key}`;
        } else {
            titleEl.innerText = `${dev.name} - LED #${idx + 1}`;
        }
    }

    updateFloatingPickerUI(r, g, b, hex);

    // Display it to calculate layout measurements
    elFloatingPicker.style.display = 'block';

    const rect = node.getBoundingClientRect();
    const pickerWidth = elFloatingPicker.offsetWidth || 260;
    const pickerHeight = elFloatingPicker.offsetHeight || 280;

    // Use viewport-relative (fixed) positioning
    let left = rect.left + (rect.width / 2) - (pickerWidth / 2);
    let top = rect.top - pickerHeight - 8;

    // Clamp horizontally within viewport
    if (left < 10) left = 10;
    if (left + pickerWidth > window.innerWidth - 10) {
        left = window.innerWidth - pickerWidth - 10;
    }
    // If no room above, show below
    if (top < 10) {
        top = rect.bottom + 8;
    }
    // If still clipped at bottom, cap it
    if (top + pickerHeight > window.innerHeight - 10) {
        top = window.innerHeight - pickerHeight - 10;
    }

    elFloatingPicker.style.left = `${left}px`;
    elFloatingPicker.style.top = `${top}px`;
}
window.showFloatingPicker = showFloatingPicker;

function hideFloatingPicker() {
    activePickerDeviceId = null;
    activePickerLedIndex = null;
    if (elFloatingPicker) {
        elFloatingPicker.style.display = 'none';
    }
}
window.hideFloatingPicker = hideFloatingPicker;

window.clickSingleNode = async function(deviceId, idx) {
    const card = document.getElementById(`device-card-${deviceId}`);
    if (card) {
        card.querySelectorAll('.selected-led').forEach(node => {
            node.classList.remove('selected-led');
        });
    }

    const node = document.getElementById(`led-${deviceId}-${idx}`);
    if (node) {
        node.classList.add('selected-led');
    }

    deviceSelectedLeds[deviceId] = idx;

    const dev = devices.find(d => d.id === deviceId);
    const targetTextEl = document.getElementById(`target-text-${deviceId}`);
    const clearBtnEl = document.getElementById(`btn-clear-${deviceId}`);
    if (targetTextEl) {
        if (dev && dev.key_layout && dev.key_layout[idx]) {
            targetTextEl.innerText = `대상: [Key: ${dev.key_layout[idx].key}]`;
        } else {
            targetTextEl.innerText = `대상: [LED #${idx + 1}]`;
        }
    }
    if (clearBtnEl) {
        clearBtnEl.style.display = 'inline-block';
    }

    if (dev && dev.leds && dev.leds[idx]) {
        const ledColor = dev.leds[idx];
        const hex = rgbToHex(ledColor.r, ledColor.g, ledColor.b);
        const picker = document.getElementById(`picker-${deviceId}`);
        if (picker) {
            picker.style.backgroundColor = hex;
        }
    }

    const currentMode = deviceModes[deviceId] || 'sync';
    if (currentMode === 'sync' || currentMode === 'disabled') {
        deviceModes[deviceId] = 'independent';
        updateDeviceEffectBtnsUI(deviceId, 'independent');
        
        try {
            await fetch(`${API_BASE}/device/mode`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: deviceId, mode: 'independent' })
            });
        } catch (err) {
            console.error('Failed to change device mode:', err);
        }
    }
    
    updateAnimationIntervalState();
    showFloatingPicker(deviceId, idx);
};

window.clearSelectedLed = function(deviceId) {
    deviceSelectedLeds[deviceId] = null;

    const card = document.getElementById(`device-card-${deviceId}`);
    if (card) {
        card.querySelectorAll('.selected-led').forEach(node => {
            node.classList.remove('selected-led');
        });
    }

    const targetTextEl = document.getElementById(`target-text-${deviceId}`);
    const clearBtnEl = document.getElementById(`btn-clear-${deviceId}`);
    if (targetTextEl) {
        targetTextEl.innerText = "대상: 전체 기기";
    }
    if (clearBtnEl) {
        clearBtnEl.style.display = 'none';
    }

    const localColor = deviceColors[deviceId] || { r: 0, g: 180, b: 255 };
    const hex = rgbToHex(localColor.r, localColor.g, localColor.b);
    const picker = document.getElementById(`picker-${deviceId}`);
    if (picker) {
        picker.style.backgroundColor = hex;
    }

    hideFloatingPicker();
};

window.handleCardColorInput = function(deviceId, hexColor) {
    const rgb = hexToRgb(hexColor);
    if (!rgb) return;

    const selectedLedIdx = deviceSelectedLeds[deviceId];
    if (selectedLedIdx !== null && selectedLedIdx !== undefined) {
        sendSingleLedColorThrottled(deviceId, selectedLedIdx, rgb.r, rgb.g, rgb.b);
    } else {
        deviceColors[deviceId] = { r: rgb.r, g: rgb.g, b: rgb.b };
        
        const currentMode = deviceModes[deviceId] || 'sync';
        if (currentMode === 'sync' || currentMode === 'disabled') {
            deviceModes[deviceId] = 'static';
            const select = document.getElementById(`select-mode-${deviceId}`);
            if (select) select.value = 'static';
            
            fetch(`${API_BASE}/device/mode`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: deviceId, mode: 'independent' })
            }).catch(() => {});
        }
        
        sendDeviceColorThrottled(deviceId, rgb.r, rgb.g, rgb.b);
    }
};

function hexToRgb(hex) {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result ? {
        r: parseInt(result[1], 16),
        g: parseInt(result[2], 16),
        b: parseInt(result[3], 16)
    } : null;
}

let cardColorThrottleTimers = {};
function sendSingleLedColorThrottled(deviceId, ledIdx, r, g, b) {
    const key = `led-${deviceId}-${ledIdx}`;
    if (cardColorThrottleTimers[key]) return;
    
    const dev = devices.find(d => d.id === deviceId);
    if (dev && dev.leds[ledIdx]) {
        dev.leds[ledIdx].r = r;
        dev.leds[ledIdx].g = g;
        dev.leds[ledIdx].b = b;
    }
    updateSingleLedUI(deviceId, ledIdx, r, g, b);
    
    // Sync badge background
    const hex = rgbToHex(r, g, b);
    const badge = document.getElementById(`picker-${deviceId}`);
    if (badge) {
        badge.style.backgroundColor = hex;
    }
    
    cardColorThrottleTimers[key] = setTimeout(async () => {
        delete cardColorThrottleTimers[key];
        try {
            await fetch(`${API_BASE}/color/led`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ device_id: deviceId, led_index: ledIdx, r, g, b })
            });
        } catch (err) {
            console.error('Failed to update single LED:', err);
        }
    }, API_THROTTLE_MS);
}

function sendDeviceColorThrottled(deviceId, r, g, b) {
    const key = `device-${deviceId}`;
    if (cardColorThrottleTimers[key]) return;
    
    updateDeviceLedsUI(deviceId, r, g, b);
    
    // Sync badge background
    const hex = rgbToHex(r, g, b);
    const badge = document.getElementById(`picker-${deviceId}`);
    if (badge) {
        badge.style.backgroundColor = hex;
    }
    
    cardColorThrottleTimers[key] = setTimeout(async () => {
        delete cardColorThrottleTimers[key];
        try {
            await fetch(`${API_BASE}/color/device`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ id: deviceId, r, g, b })
            });
        } catch (err) {
            console.error('Failed to update device color:', err);
        }
    }, API_THROTTLE_MS);
}

// UI LED nodes update helper
function updateDeviceLedsUI(deviceId, r, g, b) {
    const dev = devices.find(d => d.id === deviceId);
    if (!dev) return;
    
    dev.leds.forEach((led, idx) => {
        led.r = r;
        led.g = g;
        led.b = b;
        const node = document.getElementById(`led-${deviceId}-${idx}`);
        if (node) {
            applyLedColorToNode(node, dev, idx, r, g, b);
        }
    });
    updateLayoutDeviceColor(deviceId, r, g, b);
}

// Update specific led UI
function updateSingleLedUI(deviceId, ledIdx, r, g, b) {
    const dev = devices.find(d => d.id === deviceId);
    if (!dev) return;
    const node = document.getElementById(`led-${deviceId}-${ledIdx}`);
    if (node) {
        applyLedColorToNode(node, dev, ledIdx, r, g, b);
    }
    if (ledIdx === 0) {
        updateLayoutDeviceColor(deviceId, r, g, b);
    }
}

// Set Active Preset effect card styling and start/stop dynamic loops
async function setActivePreset(effect) {
    activeEffect = effect;
    
    document.querySelectorAll('.effect-card').forEach(c => c.classList.remove('active'));
    const activeCard = document.getElementById(`effect-${effect}`);
    if (activeCard) activeCard.classList.add('active');
    updateSyncedDeviceEffectButtons(effect);
    updateEffectSettingsVisibility(effect);
    
    stopAudioLoop();

    // Toggle Frontend Widget displays based on active effect
    if (effect === 'audio') {
        elAudioCard.style.display = 'block';
        if (micGranted) {
            startAudioLoop();
        }
    } else {
        elAudioCard.style.display = currentView === 'audio' ? 'block' : 'none';
    }

    // Call backend to update mode state (include base color for breathing/wave/strobe)
    try {
        await fetch(`${API_BASE}/mode`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                mode: effect,
                color: { r: masterColor.r, g: masterColor.g, b: masterColor.b }
            })
        });
    } catch (err) {
        console.error('Failed to sync active preset with backend:', err);
    }
    
    if (effect === 'static') {
        sendColorAll(masterColor.r, masterColor.g, masterColor.b);
        updateMasterSyncedDeviceColors(masterColor.r, masterColor.g, masterColor.b);
        devices.forEach(d => {
            const mode = deviceModes[d.id] || 'sync';
            if (mode === 'sync') {
                updateDeviceLedsUI(d.id, masterColor.r, masterColor.g, masterColor.b);
            }
        });
    } else if (effect === 'off') {
        sendColorAll(0, 0, 0);
        devices.forEach(d => {
            const mode = deviceModes[d.id] || 'sync';
            if (mode === 'sync') {
                updateDeviceLedsUI(d.id, 0, 0, 0);
            }
        });
    }
    
    updateAnimationIntervalState();
}

function updateAnimationIntervalState() {
    const isMasterDynamic = ['rainbow', 'breathing', 'strobe', 'wave'].includes(activeEffect);
    const isAnyDeviceDynamic = devices.some(dev => {
        const mode = deviceModes[dev.id] || 'sync';
        return ['rainbow', 'breathing', 'strobe', 'wave', 'sensor', 'ambient', 'game'].includes(mode);
    });
    
    const needsAnimation = isMasterDynamic || isAnyDeviceDynamic;
    
    if (needsAnimation) {
        if (!effectInterval) {
            effectHue = 0;
            effectStep = 0;
            effectInterval = setInterval(tickEffects, 60);
        }
    } else {
        if (effectInterval) {
            clearInterval(effectInterval);
            effectInterval = null;
        }
    }
    
    // Check if audio loop is needed
    const isMasterAudio = activeEffect === 'audio';
    const isAnyDeviceAudio = devices.some(dev => {
        const mode = deviceModes[dev.id] || 'sync';
        return mode === 'audio';
    });
    
    if (isMasterAudio || isAnyDeviceAudio) {
        if (elAudioCard) elAudioCard.style.display = 'block';
        if (micGranted && !audioSendInterval) {
            startAudioLoop();
        }
    } else {
        if (!isMasterAudio && !isAnyDeviceAudio) {
            if (elAudioCard) elAudioCard.style.display = currentView === 'audio' ? 'block' : 'none';
            stopAudioLoop();
        }
    }
}

function tickEffects() {
    effectStep++;
    const speedFactor = Math.max(1, layoutEffectSettings.speed || 4) / 4;
    
    devices.forEach(dev => {
        const mode = deviceModes[dev.id] || 'sync';
        if (getLayoutTransform(dev.id).hidden) return;
        let eff = null;
        let baseColor = { r: 0, g: 180, b: 255 };
        
        if (mode === 'sync') {
            if (['rainbow', 'breathing', 'strobe', 'wave'].includes(activeEffect)) {
                eff = activeEffect;
                baseColor = masterColor;
            }
        } else if (['rainbow', 'breathing', 'strobe', 'wave', 'sensor', 'ambient', 'game'].includes(mode)) {
            eff = mode;
            baseColor = deviceColors[dev.id] || { r: 0, g: 180, b: 255 };
        }
        
        if (!eff) return;
        
        const ledCount = dev.led_count;
        const colorsArray = [];
        
        for (let i = 0; i < ledCount; i++) {
            let r = 0, g = 0, b = 0;
            const layoutPhase = getLayoutPhase(dev, i, ledCount);
            
            if (eff === 'rainbow') {
                const hue = (effectHue + layoutPhase * 360) % 360;
                const rgb = hslToRgb(hue / 360, 1, 0.5);
                r = rgb[0]; g = rgb[1]; b = rgb[2];
            } 
            else if (eff === 'breathing') {
                const breathFactor = (Math.sin(effectStep * 0.08 * speedFactor + layoutPhase * Math.PI) + 1) / 2;
                r = Math.round(baseColor.r * breathFactor);
                g = Math.round(baseColor.g * breathFactor);
                b = Math.round(baseColor.b * breathFactor);
            } 
            else if (eff === 'strobe') {
                const flash = (Math.floor(effectStep * speedFactor) % 4 === 0) ? 1 : 0;
                r = baseColor.r * flash;
                g = baseColor.g * flash;
                b = baseColor.b * flash;
            } 
            else if (eff === 'wave') {
                const waveIndex = effectStep * 0.25 * speedFactor + layoutPhase * Math.PI * 2;
                const val = (Math.sin(waveIndex) + 1) / 2;
                r = Math.round(baseColor.r * val + (1 - val) * 255);
                g = Math.round(baseColor.g * val);
                b = Math.round(baseColor.b * val + (1 - val) * 127);
            }
            else if (eff === 'sensor') {
                const temp = systemCpuTemp;
                if (temp <= 50.0) {
                    const factor = temp > 30.0 ? Math.max(0.0, Math.min(1.0, (temp - 30.0) / 20.0)) : 0.0;
                    r = 0;
                    g = Math.round(230 - 50 * factor);
                    b = Math.round(118 + 137 * factor);
                } else if (temp <= 75.0) {
                    const factor = (temp - 50.0) / 25.0;
                    r = Math.round(255 * factor);
                    g = Math.round(180 * (1 - factor) + 120 * factor);
                    b = Math.round(255 * (1 - factor));
                } else {
                    const flash = (effectStep % 8 < 4) ? 1 : 0;
                    r = 255 * flash;
                    g = 0;
                    b = 0;
                }
            }
            else if (eff === 'ambient') {
                r = systemScreenColor.r;
                g = systemScreenColor.g;
                b = systemScreenColor.b;
            }
            else if (eff === 'game') {
                if (systemGameEvent === 'death') {
                    const breathFactor = (Math.sin(effectStep * 0.15) + 1) / 2;
                    r = Math.round(40 + 215 * breathFactor);
                    g = 0;
                    b = 0;
                } else if (systemGameEvent === 'kill') {
                    const hue = (effectStep * 10 * speedFactor + layoutPhase * 360) % 360;
                    const rgb = hslToRgb(hue / 360, 1, 0.5);
                    r = rgb[0]; g = rgb[1]; b = rgb[2];
                } else {
                    const breathFactor = (Math.sin(effectStep * 0.06) + 1) / 2;
                    r = 0;
                    g = Math.round(120 * breathFactor);
                    b = Math.round(255 * breathFactor);
                    
                    if (systemGameUltReady && (dev.type === 'Custom Keyboard' || dev.type === 'Keyboard' || dev.key_layout)) {
                        const keyInfo = dev.key_layout ? dev.key_layout[i] : null;
                        if (keyInfo && keyInfo.key === 'R') {
                            const isGold = (effectStep % 8 < 4);
                            if (isGold) {
                                r = 255; g = 215; b = 0;
                            }
                        }
                    }
                }
            }
            
            colorsArray.push([r, g, b]);
            
            if (dev.leds[i]) {
                dev.leds[i].r = r;
                dev.leds[i].g = g;
                dev.leds[i].b = b;
            }
            
            updateSingleLedUI(dev.id, i, r, g, b);
        }
        // Hardware is driven by the backend loop — no API call here
    });
    
    effectHue = (effectHue + 4 * speedFactor) % 360;
}

// Poll WMI metrics (temp, load, RAM) and dynamic screen color from backend
async function pollSystemStatus() {
    try {
        const res = await fetch(`${API_BASE}/mode`);
        const data = await res.json();
        
        // Cache in globals for individual device effects
        if (data.cpu_temp !== undefined) systemCpuTemp = data.cpu_temp;
        if (data.screen_color !== undefined) systemScreenColor = data.screen_color;
        if (data.game_event_active !== undefined) systemGameEvent = data.game_event_active;
        if (data.game_ult_ready !== undefined) systemGameUltReady = data.game_ult_ready;
        
        // Update gauges in System Monitor Panel
        if (elCpuTempBar && elCpuTempVal) {
            const temp = data.cpu_temp;
            elCpuTempVal.innerText = `${temp.toFixed(1)} °C`;
            elCpuTempBar.style.width = `${Math.min(100, Math.max(0, (temp / 100) * 100))}%`;
            
            // Adjust glowing thermometer warning state based on temp
            if (temp >= 75) {
                elCpuTempBar.style.boxShadow = '0 0 15px #ff0055';
            } else {
                elCpuTempBar.style.boxShadow = '0 0 10px rgba(0, 180, 255, 0.3)';
            }
        }
        if (elCpuLoadBar && elCpuLoadVal) {
            const load = data.cpu_load;
            elCpuLoadVal.innerText = `${Math.round(load)} %`;
            elCpuLoadBar.style.width = `${load}%`;
        }
        if (elRamLoadBar && elRamLoadVal) {
            const ram = data.ram_load;
            elRamLoadVal.innerText = `${Math.round(ram)} %`;
            elRamLoadBar.style.width = `${ram}%`;
        }

        // Keep active preset state synchronized if changed via profile loads
        if (data.mode && data.mode !== activeEffect) {
            activeEffect = data.mode;
            document.querySelectorAll('.effect-card').forEach(c => c.classList.remove('active'));
            const card = document.getElementById(`effect-${data.mode}`);
            if (card) card.classList.add('active');
            updateEffectSettingsVisibility(data.mode);
            
            // Toggle displays
            if (data.mode === 'audio') {
                elAudioCard.style.display = 'block';
            } else {
                elAudioCard.style.display = currentView === 'audio' ? 'block' : 'none';
            }
        }

        // Live reflect GDI screen ambient color in the conic picker preview ring in real-time
        if (activeEffect === 'ambient' && data.screen_color) {
            const sc = data.screen_color;
            elColorPreview.style.backgroundColor = `rgb(${sc.r}, ${sc.g}, ${sc.b})`;
            elPickerRing.style.boxShadow = `0 0 35px rgba(${sc.r}, ${sc.g}, ${sc.b}, 0.65)`;
        }
    } catch (err) {
        console.error('System monitoring poll failed:', err);
    }
}

const DYNAMIC_EFFECTS_SET = new Set(['rainbow', 'breathing', 'strobe', 'wave', 'sensor', 'ambient', 'game', 'audio']);

// Fetch physical LED state updates from backend (for static/off modes only)
async function pollDevicesLEDs() {
    // All dynamic effects are driven by backend_lighting_loop + tickEffects() for DOM —
    // polling would race with those updates and waste bandwidth.
    if (activeEffect === 'off' || DYNAMIC_EFFECTS_SET.has(activeEffect)) return;

    try {
        const res = await fetch(`${API_BASE}/devices`);
        const updatedDevices = await res.json();

        updatedDevices.forEach(ud => {
            const localDev = devices.find(d => d.id === ud.id);
            if (!localDev) return;
            const mode = deviceModes[ud.id] || 'sync';
            // Skip independent devices running their own dynamic effects
            if (DYNAMIC_EFFECTS_SET.has(mode)) return;
            if (mode === 'sync') {
                localDev.leds = ud.leds;
                ud.leds.forEach((led, idx) => {
                    const node = document.getElementById(`led-${ud.id}-${idx}`);
                    if (node) {
                        applyLedColorToNode(node, ud, idx, led.r, led.g, led.b);
                    }
                });
            }
        });
    } catch (err) {
        console.error('LED sync poll failed:', err);
    }
}

// --- Web Audio API Microphone & Loopback Analysis Engine ---

async function handleAudioAuth() {
    if (audioContext) {
        stopAudioLoop();
        elAudioStatus.innerText = '오디오 스트림 정지됨';
        elBtnAudioAuth.innerText = '🎤 브라우저 오디오 입력 권한 획득';
        return;
    }
    
    try {
        elAudioStatus.innerText = '오디오 권한 요청 중...';
        audioStream = await navigator.mediaDevices.getUserMedia({ audio: true, video: false });
        micGranted = true;
        
        audioContext = new (window.AudioContext || window.webkitAudioContext)();
        analyserNode = audioContext.createAnalyser();
        analyserNode.fftSize = 128; // Fast FFT resolution
        
        const source = audioContext.createMediaStreamSource(audioStream);
        source.connect(analyserNode);
        
        elAudioStatus.innerText = '오디오 스트림 연결 성공';
        elBtnAudioAuth.innerText = '⏹️ 오디오 캡처 중지';
        
        const isMasterAudio = activeEffect === 'audio';
        const isAnyDeviceAudio = devices.some(dev => (deviceModes[dev.id] || 'sync') === 'audio');
        if (isMasterAudio || isAnyDeviceAudio) {
            startAudioLoop();
        }
    } catch (err) {
        console.error('Microphone capture authorization failed:', err);
        elAudioStatus.innerText = '오디오 장치 액세스 거부됨';
        micGranted = false;
    }
}

function startAudioLoop() {
    if (!audioContext || !analyserNode) return;
    
    const bufferLength = analyserNode.frequencyBinCount;
    const dataArray = new Uint8Array(bufferLength);
    
    // 1. FFT Canvas rendering loop
    function drawVisualizer() {
        const isMasterAudio = activeEffect === 'audio';
        const isAnyDeviceAudio = devices.some(dev => {
            const mode = deviceModes[dev.id] || 'sync';
            return mode === 'audio';
        });
        if (!audioContext || (!isMasterAudio && !isAnyDeviceAudio)) return;
        audioAnimFrame = requestAnimationFrame(drawVisualizer);
        
        analyserNode.getByteFrequencyData(dataArray);
        
        if (!visualizerCtx) return;
        
        visualizerCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
        
        const barWidth = (visualizerCanvas.width / bufferLength) * 1.5;
        let barHeight;
        let x = 0;
        
        for (let i = 0; i < bufferLength; i++) {
            barHeight = dataArray[i] / 2.8;
            
            // Premium glowing visualizer color scheme (Purple -> Blue gradient)
            const redColor = Math.min(255, i * 4);
            const greenColor = Math.min(255, 180 - i * 2);
            const blueColor = 255;
            
            visualizerCtx.fillStyle = `rgb(${redColor}, ${greenColor}, ${blueColor})`;
            visualizerCtx.fillRect(x, visualizerCanvas.height - barHeight, barWidth - 2, barHeight);
            
              x += barWidth;
        }
    }
    
    audioAnimFrame = requestAnimationFrame(drawVisualizer);
    
    // 2. Beat streaming loop to backend at 25 FPS
    audioSendInterval = setInterval(() => {
        const isMasterAudio = activeEffect === 'audio';
        const isAnyDeviceAudio = devices.some(dev => {
            const mode = deviceModes[dev.id] || 'sync';
            return mode === 'audio';
        });
        if (!analyserNode || (!isMasterAudio && !isAnyDeviceAudio)) return;
        analyserNode.getByteFrequencyData(dataArray);
        
        // Extract frequency ranges
        // Bass: index 0 to 4 (approx 0 - 150 Hz)
        let bassSum = 0;
        for (let i = 0; i < 5; i++) bassSum += dataArray[i];
        const bassVal = Math.min(1.0, (bassSum / 5) / 200.0);
        
        // Mid: index 5 to 25 (approx 150 - 1500 Hz)
        let midSum = 0;
        for (let i = 5; i < 26; i++) midSum += dataArray[i];
        const midVal = Math.min(1.0, (midSum / 21) / 160.0);
        
        // Treble: index 26 to 50 (approx 1500 - 4500 Hz)
        let trebleSum = 0;
        for (let i = 26; i < 51; i++) trebleSum += dataArray[i];
        const trebleVal = Math.min(1.0, (trebleSum / 25) / 120.0);
        
        // Sync with hardware LEDs on screen
        devices.forEach(dev => {
            const mode = deviceModes[dev.id] || 'sync';
            const isAudioActive = (mode === 'sync' && activeEffect === 'audio') || (mode === 'audio');
            if (!isAudioActive) return;
            
            const r_bass = Math.round(bassVal * 255);
            const g_mid = Math.round(midVal * 255);
            const b_treble = Math.round(trebleVal * 255);
            
            dev.leds.forEach((led, idx) => {
                let r = 0, g = 0, b = 0;
                
                if (dev.key_layout && dev.key_layout.length > 0) {
                    const keyName = dev.key_layout[idx]?.key || '';
                    if (keyName === 'Space') {
                        r = r_bass;
                    } else if (keyName.startsWith('F') || ['Esc', 'Prt', 'Scr', 'Pau'].includes(keyName)) {
                        b = b_treble;
                    } else {
                        g = g_mid;
                    }
                } else if (dev.type.toLowerCase().includes('mouse')) {
                    if (idx === 0) r = r_bass;
                    else if (idx === dev.leds.length - 1) b = b_treble;
                    else g = g_mid;
                } else if (dev.type === 'GPU') {
                    r = r_bass; b = b_treble;
                } else if (dev.type === 'Fans') {
                    g = g_mid; b = b_treble;
                } else {
                    r = Math.round(r_bass * 0.5); g = g_mid; b = Math.round(b_treble * 0.5);
                }
                
                updateSingleLedUI(dev.id, idx, r, g, b);
            });
        });
        
        // Apply sensitivity multiplier
        const sens = (typeof _audioSensitivity !== 'undefined') ? _audioSensitivity : 1.0;
        const sBass   = Math.min(1, bassVal   * sens);
        const sMid    = Math.min(1, midVal    * sens);
        const sTreble = Math.min(1, trebleVal * sens);

        // Beat detection: bass peak → flash indicator
        if (typeof _triggerBeatFlash === 'function' && sBass > 0.55) _triggerBeatFlash();

        // POST to backend API
        fetch(`${API_BASE}/visualizer/beat`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ bass: sBass, mid: sMid, treble: sTreble })
        }).catch(() => {});
        
    }, 45);
}

function stopAudioLoop() {
    if (audioAnimFrame) {
        cancelAnimationFrame(audioAnimFrame);
        audioAnimFrame = null;
    }
    if (audioSendInterval) {
        clearInterval(audioSendInterval);
        audioSendInterval = null;
    }
    
    // Stop recording devices completely
    if (audioStream) {
        audioStream.getTracks().forEach(track => track.stop());
        audioStream = null;
    }
    if (audioContext) {
        audioContext.close();
        audioContext = null;
    }
    
    if (visualizerCtx) {
        visualizerCtx.clearRect(0, 0, visualizerCanvas.width, visualizerCanvas.height);
    }
}

// --- Profile Manager Database Operations ---

async function fetchProfiles() {
    try {
        const res = await fetchWithRetry(`${API_BASE}/profiles`);
        const profilesList = await res.json();
        
        elProfileList.innerHTML = '';
        if (profilesList.length === 0) {
            elProfileList.innerHTML = `
                <div style="text-align: center; color: var(--text-secondary); font-size: 0.8rem; padding: 0.5rem;">
                    저장된 프로필이 없습니다.
                </div>`;
            return;
        }
        
        profilesList.forEach(name => {
            const item = document.createElement('div');
            item.className = 'profile-item';
            item.innerHTML = `
                <span class="profile-item-name">${name}</span>
                <div class="profile-actions">
                    <button class="btn-profile-load" onclick="loadProfile('${name}')">적용</button>
                    <button class="btn-profile-del" onclick="deleteProfile('${name}')">삭제</button>
                </div>
            `;
            elProfileList.appendChild(item);
        });
    } catch (err) {
        console.error('Failed to load profiles:', err);
    }
}

async function handleSaveProfile() {
    const name = elProfileName.value.trim();
    if (!name) {
        alert('프로필 이름을 입력해 주세요.');
        return;
    }
    
    try {
        const res = await fetch(`${API_BASE}/profiles/save`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const data = await res.json();
        if (data.status === 'OK') {
            elProfileName.value = '';
            fetchProfiles();
            alert(`프로필 [${name}] 저장 성공!`);
        } else {
            alert(`프로필 저장 실패: ${data.status}`);
        }
    } catch (err) {
        console.error('Profile save API request failed:', err);
    }
}

window.loadProfile = async function(name) {
    try {
        const res = await fetch(`${API_BASE}/profiles/load`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ name })
        });
        const data = await res.json();
        if (data.status === 'OK') {
            alert(`프로필 [${name}] 적용 완료!`);
            initApp(); // Reload status & device colors
        } else {
            alert(`프로필 적용 실패: ${data.status}`);
        }
    } catch (err) {
        console.error('Profile load API request failed:', err);
    }
};

window.deleteProfile = async function(name) {
    if (!confirm(`프로필 [${name}]을 삭제하시겠습니까?`)) return;
    try {
        const res = await fetch(`${API_BASE}/profiles/${name}`, {
            method: 'DELETE'
        });
        const data = await res.json();
        if (data.status === 'OK') {
            fetchProfiles();
        } else {
            alert(`프로필 삭제 실패: ${data.status}`);
        }
    } catch (err) {
        console.error('Profile delete API request failed:', err);
    }
};

// --- USB HID Discovery & Manual Device Register ---

async function handleScanHid() {
    elScannedList.innerHTML = `
        <tr>
            <td colspan="5" style="text-align: center; color: var(--text-secondary); font-size: 0.85rem; padding: 2.5rem 1rem;">
                연결된 USB HID 장치 목록 스캔 중... (잠시만 기다려주세요)
            </td>
        </tr>`;
    try {
        const res = await fetch(`${API_BASE}/hid/scan`);
        const hidList = await res.json();
        
        elScannedList.innerHTML = '';
        if (hidList.length === 0) {
            elScannedList.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; color: var(--text-secondary); font-size: 0.85rem; padding: 2rem 1rem;">
                        감지된 USB HID 장치가 없습니다. (드라이버 연결 확인 요망)
                    </td>
                </tr>`;
            return;
        }
        
        hidList.forEach(dev => {
            const row = document.createElement('tr');
            if (dev.rgb_likely) row.classList.add('hid-row-rgb');
            const badge = dev.rgb_likely
                ? `<span class="rgb-badge">⚡ RGB</span>`
                : '';
            const nameEscaped  = (dev.product_string     || '').replace(/'/g, "\\'");
            const mfgEscaped   = (dev.manufacturer_string|| '').replace(/'/g, "\\'");
            row.innerHTML = `
                <td style="font-weight: 600; color: var(--text-primary);">${badge}${dev.product_string}</td>
                <td>${dev.rgb_likely ? `<b>${dev.rgb_brand}</b>` : dev.manufacturer_string}</td>
                <td style="font-family: monospace; color: var(--glow-color); font-size:0.8rem;">${dev.vendor_id}</td>
                <td style="font-family: monospace; color: var(--glow-color); font-size:0.8rem;">${dev.product_id}</td>
                <td>
                    <button class="btn-select-scanned" onclick="selectScannedDevice('${nameEscaped}','${mfgEscaped}','${dev.vendor_id}','${dev.product_id}')">선택</button>
                </td>
            `;
            elScannedList.appendChild(row);
        });
    } catch (err) {
        console.error('HID Scan request failed:', err);
        elScannedList.innerHTML = `
            <tr>
                <td colspan="5" style="text-align: center; color: var(--warning-color); font-size: 0.85rem; padding: 2rem 1rem;">
                    HID 디바이스 조회 에러가 발생했습니다.
                </td>
            </tr>`;
    }
}

window.selectScannedDevice = function(name, mfg, vid, pid) {
    document.getElementById('hid-name').value = name;
    document.getElementById('hid-mfg').value = mfg;
    document.getElementById('hid-vid').value = vid;
    document.getElementById('hid-pid').value = pid;
};

window.deleteCustomDevice = async function(devId, devName) {
    if (!confirm(`기기 [${devName}]를 삭제하시겠습니까?`)) return;
    try {
        const res = await fetch(`${API_BASE}/hid/delete`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: devId })
        });
        const data = await res.json();
        if (data.status === 'OK') {
            fetchDevices();
            refreshSavedDevicesList();
        } else {
            alert(`삭제 실패: ${data.status}`);
        }
    } catch (err) {
        console.error('Delete custom device failed:', err);
    }
};

async function refreshSavedDevicesList() {
    const container = document.getElementById('saved-custom-devices');
    if (!container) return;
    try {
        const res  = await fetch(`${API_BASE}/devices`);
        const devs = await res.json();
        const custom = devs.filter(d => d.id && d.id.startsWith('custom_'));
        if (custom.length === 0) {
            container.innerHTML = '<p style="color:var(--text-secondary);font-size:0.82rem;margin:0.5rem 0">저장된 커스텀 기기 없음</p>';
            return;
        }
        container.innerHTML = custom.map(d => `
            <div class="saved-device-row">
                <span class="saved-device-name">🔌 ${d.name}</span>
                <span class="saved-device-meta">${d.type} · ${d.led_count} LEDs</span>
                <button class="btn-delete-device" onclick="deleteCustomDevice('${d.id}','${(d.name||'').replace(/'/g,"\\'")}')">🗑 삭제</button>
            </div>
        `).join('');
    } catch (e) { /* ignore */ }
}

async function handleAddHidSubmit(e) {
    e.preventDefault();
    
    const name = document.getElementById('hid-name').value.trim();
    const manufacturer = document.getElementById('hid-mfg').value.trim();
    const vendor_id = document.getElementById('hid-vid').value.trim();
    const product_id = document.getElementById('hid-pid').value.trim();
    const type = document.getElementById('hid-type').value;
    const led_count = parseInt(document.getElementById('hid-led-count').value);
    
    try {
        const res = await fetch(`${API_BASE}/hid/add`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name,
                manufacturer,
                vendor_id,
                product_id,
                type,
                led_count
            })
        });
        
        const data = await res.json();
        if (data.status === 'OK') {
            elHidModal.style.display = 'none';
            elHidForm.reset();
            elScannedList.innerHTML = `
                <tr>
                    <td colspan="5" style="text-align: center; color: var(--text-secondary); font-size: 0.85rem; padding: 2rem 1rem;">
                        스캔 버튼을 눌러 연결된 USB 기기를 확인하세요.
                    </td>
                </tr>`;

            // Reload devices & saved list
            fetchDevices();
            refreshSavedDevicesList();
            alert(`새 장치 [${name}]가 제어 대시보드에 성공적으로 등록되었습니다!`);
        } else {
            alert(`장치 등록 실패: ${data.status}`);
        }
    } catch (err) {
        console.error('Add custom HID device API failed:', err);
    }
}

// --- COLOR MATH HELPERS ---

async function sendColorAll(r, g, b) {
    try {
        await fetch(`${API_BASE}/color/all`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ r, g, b })
        });
    } catch (err) {
        console.error('Error syncing all colors:', err);
    }
}

async function sendDeviceColor(deviceId, r, g, b) {
    try {
        await fetch(`${API_BASE}/color/device`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: deviceId, r, g, b })
        });
    } catch (err) {
        console.error(`Error syncing device ${deviceId}:`, err);
    }
}

async function sendDeviceColorsArray(deviceId, colors) {
    try {
        await fetch(`${API_BASE}/color/device_array`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ id: deviceId, colors })
        });
    } catch (err) {
        // Suppress trace logs to avoid console pollution during rapid updates
    }
}

function rgbToHex(r, g, b) {
    return "#" + ((1 << 24) + (r << 16) + (g << 8) + b).toString(16).slice(1);
}

function hslToRgb(h, s, l) {
    let r, g, b;
    if (s == 0) {
        r = g = b = l; // achromatic
    } else {
        const hue2rgb = (p, q, t) => {
            if (t < 0) t += 1;
            if (t > 1) t -= 1;
            if (t < 1/6) return p + (q - p) * 6 * t;
            if (t < 1/2) return q;
            if (t < 2/3) return p + (q - p) * (2/3 - t) * 6;
            return p;
        };
        const q = l < 0.5 ? l * (1 + s) : l + s - l * s;
        const p = 2 * l - q;
        r = hue2rgb(p, q, h + 1/3);
        g = hue2rgb(p, q, h);
        b = hue2rgb(p, q, h - 1/3);
    }
    return [Math.round(r * 255), Math.round(g * 255), Math.round(b * 255)];
}

function generateSvgPath(points) {
    if (!points || points.length === 0) return '';
    return `M ${points[0].x} ${points[0].y} ` + points.slice(1).map(p => `L ${p.x} ${p.y}`).join(' ');
}

function applyLedColorToNode(node, dev, idx, r, g, b) {
    if (!node) return;
    if (dev.lightbar_layout) {
        node.style.background = `linear-gradient(to top, rgba(${r}, ${g}, ${b}, 0.2), rgb(${r}, ${g}, ${b}))`;
        node.style.boxShadow = `0 0 20px rgba(${r}, ${g}, ${b}, 0.8)`;
    } else if (dev.panels && dev.panels.length > 0) {
        node.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
        node.style.filter = `drop-shadow(0 0 12px rgba(${r}, ${g}, ${b}, 0.7))`;
    } else if (dev.rope_layout && dev.rope_layout.length > 0) {
        node.style.fill = `rgb(${r}, ${g}, ${b})`;
        node.style.filter = `drop-shadow(0 0 5px rgba(${r}, ${g}, ${b}, 0.8))`;
        
        if (idx === 0) {
            const path = document.getElementById(`rope-path-${dev.id}`);
            if (path) {
                path.style.stroke = `rgba(${r}, ${g}, ${b}, 0.45)`;
            }
        }
    } else if (dev.key_layout && dev.key_layout.length > 0) {
        node.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
        node.style.boxShadow = `0 0 10px rgba(${r}, ${g}, ${b}, 0.6)`;
    } else if (dev.type.toLowerCase().includes('mouse')) {
        node.style.fill = `rgb(${r}, ${g}, ${b})`;
        node.style.filter = `drop-shadow(0 0 6px rgba(${r}, ${g}, ${b}, 0.8))`;
        
        if (idx === 0) {
            const wheel = node.parentElement.querySelector('.mouse-wheel');
            if (wheel) {
                wheel.style.fill = `rgb(${r}, ${g}, ${b})`;
                wheel.style.filter = `drop-shadow(0 0 4px rgba(${r}, ${g}, ${b}, 0.8))`;
            }
        }
    } else {
        node.style.backgroundColor = `rgb(${r}, ${g}, ${b})`;
        node.style.boxShadow = `0 0 8px rgba(${r}, ${g}, ${b}, 0.6)`;
    }
}

// Adjust scale of keyboard & Nanoleaf visualizers dynamically based on parent container width
function adjustVisualizerScales() {
    // 1. Keyboard visualizers
    const keyboardPlates = document.querySelectorAll('.keyboard-inner-plate');
    keyboardPlates.forEach(plate => {
        const container = plate.closest('.keyboard-visualizer-container');
        if (!container) return;
        const panel = container.parentElement;
        if (!panel) return;
        
        // Let's reset style overrides first to get natural calculations
        plate.style.transform = '';
        plate.style.transformOrigin = '';
        container.style.width = '';
        container.style.height = '';
        
        // Get natural dimensions
        let naturalWidth = parseFloat(plate.getAttribute('data-natural-width'));
        let naturalHeight = parseFloat(plate.getAttribute('data-natural-height'));
        if (!naturalWidth || !naturalHeight) {
            naturalWidth = parseFloat(plate.style.width) || 550;
            naturalHeight = parseFloat(plate.style.height) || 180;
            plate.setAttribute('data-natural-width', naturalWidth);
            plate.setAttribute('data-natural-height', naturalHeight);
        }
        
        // Measure available width inside parent panel
        const panelStyle = window.getComputedStyle(panel);
        const paddingLeft = parseFloat(panelStyle.paddingLeft) || 0;
        const paddingRight = parseFloat(panelStyle.paddingRight) || 0;
        const availableWidth = panel.clientWidth - paddingLeft - paddingRight - 8;
        
        const containerExtraWidth = 30; // 24px padding + 6px border
        const containerExtraHeight = 30;
        
        let scale = 1;
        if (availableWidth < naturalWidth + containerExtraWidth) {
            scale = (availableWidth - containerExtraWidth) / naturalWidth;
            if (scale < 0.2) scale = 0.2; // Min scale limit
        }
        
        if (scale < 1) {
            plate.style.transformOrigin = 'top left';
            plate.style.transform = `scale(${scale})`;
            container.style.width = `${Math.floor(naturalWidth * scale) + containerExtraWidth}px`;
            container.style.height = `${Math.floor(naturalHeight * scale) + containerExtraHeight}px`;
            container.style.overflow = 'hidden';
        } else {
            plate.style.transform = '';
            plate.style.transformOrigin = '';
            container.style.width = '';
            container.style.height = '';
            container.style.overflow = '';
        }
    });

    // 2. Nanoleaf Honeycomb panel visualizers
    const nanoleafCanvases = document.querySelectorAll('.nanoleaf-inner-canvas');
    nanoleafCanvases.forEach(canvas => {
        const container = canvas.closest('.nanoleaf-visualizer-container');
        if (!container) return;
        const panel = container.parentElement;
        if (!panel) return;
        
        canvas.style.transform = '';
        canvas.style.transformOrigin = '';
        container.style.width = '';
        container.style.height = '';
        
        let naturalWidth = parseFloat(canvas.getAttribute('data-natural-width'));
        let naturalHeight = parseFloat(canvas.getAttribute('data-natural-height'));
        if (!naturalWidth || !naturalHeight) {
            naturalWidth = parseFloat(canvas.style.width) || 320;
            naturalHeight = parseFloat(canvas.style.height) || 200;
            canvas.setAttribute('data-natural-width', naturalWidth);
            canvas.setAttribute('data-natural-height', naturalHeight);
        }
        
        const panelStyle = window.getComputedStyle(panel);
        const paddingLeft = parseFloat(panelStyle.paddingLeft) || 0;
        const paddingRight = parseFloat(panelStyle.paddingRight) || 0;
        const availableWidth = panel.clientWidth - paddingLeft - paddingRight - 8;
        
        const containerExtraWidth = 34; // 32px padding + 2px border
        const containerExtraHeight = 34;
        
        let scale = 1;
        if (availableWidth < naturalWidth + containerExtraWidth) {
            scale = (availableWidth - containerExtraWidth) / naturalWidth;
            if (scale < 0.2) scale = 0.2;
        }
        
        if (scale < 1) {
            canvas.style.transformOrigin = 'top left';
            canvas.style.transform = `scale(${scale})`;
            container.style.width = `${Math.floor(naturalWidth * scale) + containerExtraWidth}px`;
            container.style.height = `${Math.floor(naturalHeight * scale) + containerExtraHeight}px`;
            container.style.overflow = 'hidden';
        } else {
            canvas.style.transform = '';
            canvas.style.transformOrigin = '';
            container.style.width = '';
            container.style.height = '';
            container.style.overflow = '';
        }
    });
}


/* ═══════════════════════════════════════════════════════════════
   FEATURE 1 — SCENE SYSTEM
═══════════════════════════════════════════════════════════════ */
let _scenes = [];

async function fetchScenes() {
    try {
        const res = await fetchWithRetry(`${API_BASE}/scenes`);
        _scenes = await res.json();
        renderScenes();
    } catch(e) { console.error('fetchScenes:', e); }
}

function renderScenes() {
    const grid = document.getElementById('scenes-grid');
    if (!grid) return;
    if (_scenes.length === 0) {
        grid.innerHTML = `<div style="color:var(--text-secondary);font-size:0.85rem;padding:2rem;text-align:center;border:1px dashed var(--glass-border);border-radius:10px;grid-column:1/-1;">저장된 씬이 없습니다. 원하는 효과를 설정한 뒤 "현재 상태 저장"을 누르세요.</div>`;
        return;
    }
    grid.innerHTML = _scenes.map(s => `
        <div class="scene-card" onclick="loadScene('${s.id}')">
            <div class="scene-icon">${s.icon || '🎮'}</div>
            <div class="scene-name">${s.name}</div>
            <div class="scene-meta">${Object.keys(s.snapshot || {}).length}개 기기</div>
            <div class="scene-actions" onclick="event.stopPropagation()">
                <button class="scene-load-btn" onclick="loadScene('${s.id}')">▶ 불러오기</button>
                <button class="scene-del-btn" onclick="deleteScene('${s.id}')">🗑</button>
            </div>
        </div>
    `).join('');
}

function openSaveSceneDialog() {
    const d = document.getElementById('scene-save-dialog');
    if (d) d.style.display = 'flex';
}

async function confirmSaveScene() {
    const name = document.getElementById('scene-name-input').value.trim();
    const icon = document.getElementById('scene-icon-select').value;
    if (!name) { alert('씬 이름을 입력하세요.'); return; }
    const res = await fetch(`${API_BASE}/scenes/save`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name, icon }),
    });
    const data = await res.json();
    if (data.status === 'OK') {
        document.getElementById('scene-name-input').value = '';
        document.getElementById('scene-save-dialog').style.display = 'none';
        showToast('씬 "' + name + '" 저장 완료');
        fetchScenes();
        populateSchedSceneSelect();
    }
}

async function loadScene(sceneId) {
    const res = await fetch(`${API_BASE}/scenes/load`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sceneId }),
    });
    const data = await res.json();
    if (data.status === 'OK') {
        const s = _scenes.find(x => x.id === sceneId);
        showToast((s ? s.icon + ' ' + s.name : '씬') + ' 적용됨');
        fetchDevices();
    }
}

async function deleteScene(sceneId) {
    const s = _scenes.find(x => x.id === sceneId);
    if (!confirm('씬 "' + (s ? s.name : sceneId) + '"을 삭제하시겠습니까?')) return;
    await fetch(`${API_BASE}/scenes/delete`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: sceneId }),
    });
    fetchScenes();
    populateSchedSceneSelect();
}

/* ═══════════════════════════════════════════════════════════════
   FEATURE 2 — SSE REAL-TIME STREAM
═══════════════════════════════════════════════════════════════ */
let _sseSource = null;
let _sseFallbackPoller = null;

function initSSE() {
    if (_sseSource) { _sseSource.close(); _sseSource = null; }
    if (devicesStatePoller) { clearInterval(devicesStatePoller); devicesStatePoller = null; }

    try {
        _sseSource = new EventSource(`${API_BASE}/stream`);
        _sseSource.onopen = () => {
            console.log('[SSE] connected');
            if (_sseFallbackPoller) { clearInterval(_sseFallbackPoller); _sseFallbackPoller = null; }
        };
        _sseSource.onmessage = (e) => {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'leds' && Array.isArray(msg.data)) {
                    msg.data.forEach(devData => {
                        const dev = devices.find(d => d.id === devData.id);
                        if (!dev || !devData.leds) return;
                        if (devData.mode) deviceModes[devData.id] = devData.mode;
                        dev.leds = devData.leds;
                        devData.leds.forEach((led, idx) => {
                            const node = document.getElementById('led-' + devData.id + '-' + idx);
                            if (node) {
                                const c = 'rgb(' + led.r + ',' + led.g + ',' + led.b + ')';
                                node.style.backgroundColor = c;
                                if (node.style.boxShadow !== undefined) node.style.boxShadow = '0 0 8px ' + c;
                            }
                        });
                        if (devData.leds[0]) {
                            const picker = document.getElementById('picker-' + devData.id);
                            if (picker) picker.style.backgroundColor = rgbToHex(devData.leds[0].r, devData.leds[0].g, devData.leds[0].b);
                            deviceColors[devData.id] = { r: devData.leds[0].r, g: devData.leds[0].g, b: devData.leds[0].b };
                        }
                    });
                }
            } catch(err) { /* skip malformed */ }
        };
        _sseSource.onerror = () => {
            console.warn('[SSE] disconnected, falling back to polling');
            _sseSource.close(); _sseSource = null;
            if (!_sseFallbackPoller) _sseFallbackPoller = setInterval(pollDevicesLEDs, 800);
            setTimeout(initSSE, 8000);
        };
    } catch(e) {
        console.warn('[SSE] unavailable, using polling');
        if (!devicesStatePoller) devicesStatePoller = setInterval(pollDevicesLEDs, 800);
    }
}

/* ═══════════════════════════════════════════════════════════════
   FEATURE 3 — GRADIENT EDITOR
═══════════════════════════════════════════════════════════════ */
let _gradDevId    = null;
let _gradLeds     = [];
let _gradMode     = 'paint';
let _gradPainting = false;

const GRADIENT_PRESETS = {
    rainbow: function(n) { return Array.from({length:n}, function(_,i){ return hslToRgbGrad(i/n,1,0.55); }); },
    fire:    function(n) { return Array.from({length:n}, function(_,i){ return lerpRgb({r:255,g:20,b:0},{r:255,g:200,b:0},i/n); }); },
    ocean:   function(n) { return Array.from({length:n}, function(_,i){ return lerpRgb({r:0,g:0,b:180},{r:0,g:220,b:255},i/n); }); },
    sunset:  function(n) { return Array.from({length:n}, function(_,i){ var t=i/n; return t<0.5?lerpRgb({r:255,g:20,b:80},{r:255,g:120,b:0},t*2):lerpRgb({r:255,g:120,b:0},{r:100,g:0,b:200},(t-0.5)*2); }); },
    forest:  function(n) { return Array.from({length:n}, function(_,i){ return lerpRgb({r:0,g:60,b:20},{r:0,g:255,b:80},i/n); }); },
    aurora:  function(n) { return Array.from({length:n}, function(_,i){ var t=i/n; return t<0.5?lerpRgb({r:0,g:200,b:255},{r:180,g:0,b:255},t*2):lerpRgb({r:180,g:0,b:255},{r:0,g:255,b:180},(t-0.5)*2); }); },
    'mono-red':  function(n) { return Array.from({length:n}, function(){ return {r:255,g:0,b:0}; }); },
    'mono-cyan': function(n) { return Array.from({length:n}, function(){ return {r:0,g:229,b:255}; }); },
    off:     function(n) { return Array.from({length:n}, function(){ return {r:0,g:0,b:0}; }); },
};

function hslToRgbGrad(h,s,l) {
    var q=l<0.5?l*(1+s):l+s-l*s, p=2*l-q;
    function f(t){ t=(t%1+1)%1; if(t<1/6) return p+(q-p)*6*t; if(t<1/2) return q; if(t<2/3) return p+(q-p)*(2/3-t)*6; return p; }
    return {r:Math.round(f(h+1/3)*255), g:Math.round(f(h)*255), b:Math.round(f(h-1/3)*255)};
}
function lerpRgb(a,b,t) {
    return {r:Math.round(a.r+(b.r-a.r)*t), g:Math.round(a.g+(b.g-a.g)*t), b:Math.round(a.b+(b.b-a.b)*t)};
}

function openGradientEditor(devId) {
    var dev = devices.find(function(d){ return d.id === devId; });
    if (!dev) return;
    _gradDevId = devId;
    _gradLeds  = (dev.leds || []).map(function(l){ return {r:l.r,g:l.g,b:l.b}; });
    if (_gradLeds.length === 0) {
        var n = dev.led_count || 12;
        _gradLeds = Array.from({length:n}, function(){ return {r:0,g:180,b:255}; });
    }
    var modal = document.getElementById('gradient-modal');
    var title = document.getElementById('gradient-modal-title');
    if (title) title.textContent = '🎨 그라디언트 에디터 — ' + dev.name;
    renderGradientLeds();
    if (modal) modal.style.display = 'flex';
}

function closeGradientEditor() {
    var modal = document.getElementById('gradient-modal');
    if (modal) modal.style.display = 'none';
    _gradDevId = null;
}

function renderGradientLeds() {
    var container = document.getElementById('gradient-leds');
    if (!container) return;
    container.innerHTML = '';
    _gradLeds.forEach(function(led, idx) {
        var node = document.createElement('div');
        node.className = 'grad-led-node';
        node.style.cssText = 'width:26px;height:26px;border-radius:50%;cursor:crosshair;background:rgb('+led.r+','+led.g+','+led.b+');box-shadow:0 0 6px rgba('+led.r+','+led.g+','+led.b+',0.7);flex-shrink:0;border:2px solid rgba(255,255,255,0.1);';
        node.title = 'LED #'+(idx+1);
        node.addEventListener('mousedown', function(){ _gradPainting=true; paintGradLed(idx); });
        node.addEventListener('mouseenter', function(){ if(_gradPainting) paintGradLed(idx); });
        container.appendChild(node);
    });
    document.removeEventListener('mouseup', _gradMouseUp);
    document.addEventListener('mouseup', _gradMouseUp);
}
function _gradMouseUp(){ _gradPainting = false; }

function paintGradLed(idx) {
    var colorInput = document.getElementById('gradient-paint-color');
    if (!colorInput) return;
    var hex = colorInput.value;
    var r = parseInt(hex.slice(1,3),16), g = parseInt(hex.slice(3,5),16), b = parseInt(hex.slice(5,7),16);
    if (_gradMode === 'fill') {
        _gradLeds = _gradLeds.map(function(){ return {r:r,g:g,b:b}; });
        renderGradientLeds();
    } else {
        _gradLeds[idx] = {r:r,g:g,b:b};
        var container = document.getElementById('gradient-leds');
        if (container && container.children[idx]) {
            var node = container.children[idx];
            node.style.background = 'rgb('+r+','+g+','+b+')';
            node.style.boxShadow  = '0 0 6px rgba('+r+','+g+','+b+',0.7)';
        }
    }
}

function setGradientMode(mode) {
    _gradMode = mode;
    var p = document.getElementById('grad-mode-paint');
    var f = document.getElementById('grad-mode-fill');
    if (p) p.classList.toggle('active', mode==='paint');
    if (f) f.classList.toggle('active', mode==='fill');
}

function clearAllGradientLeds() {
    _gradLeds = _gradLeds.map(function(){ return {r:0,g:0,b:0}; });
    renderGradientLeds();
}

document.addEventListener('DOMContentLoaded', function() {
    var presetsEl = document.getElementById('gradient-presets');
    if (presetsEl) {
        presetsEl.addEventListener('click', function(e) {
            var btn = e.target.closest('.gradient-preset-btn');
            if (!btn) return;
            var preset = btn.dataset.preset;
            if (GRADIENT_PRESETS[preset]) {
                _gradLeds = GRADIENT_PRESETS[preset](_gradLeds.length || 12);
                renderGradientLeds();
            }
        });
    }
    var daysEl = document.getElementById('sched-days');
    if (daysEl) {
        daysEl.addEventListener('click', function(e) {
            var btn = e.target.closest('.sched-day-btn');
            if (btn) btn.classList.toggle('active');
        });
    }
});

async function applyGradientToDevice() {
    if (!_gradDevId) return;
    const res = await fetch(`${API_BASE}/device/leds/bulk`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: _gradDevId, leds: _gradLeds }),
    });
    const data = await res.json();
    if (data.status === 'OK') {
        showToast('그라디언트 적용 완료');
        const dev = devices.find(function(d){ return d.id === _gradDevId; });
        if (dev) { dev.leds = _gradLeds.slice(); deviceModes[_gradDevId] = 'independent'; }
        closeGradientEditor();
    }
}

/* ═══════════════════════════════════════════════════════════════
   FEATURE 4 — SCHEDULER / AUTOMATION
═══════════════════════════════════════════════════════════════ */
let _schedules   = [];
let _schedType   = 'time';
let _schedAction = 'scene';

async function fetchSchedules() {
    try {
        const res = await fetch(`${API_BASE}/schedules`);
        _schedules = await res.json();
        renderSchedules();
    } catch(e) { console.error('fetchSchedules:', e); }
}

function renderSchedules() {
    const list = document.getElementById('schedules-list');
    if (!list) return;
    if (_schedules.length === 0) {
        list.innerHTML = '<div style="color:var(--text-secondary);font-size:0.85rem;padding:2rem;text-align:center;border:1px dashed var(--glass-border);border-radius:10px;">저장된 스케줄이 없습니다.</div>';
        return;
    }
    list.innerHTML = _schedules.map(function(s) {
        const t = s.trigger || {};
        const a = s.action  || {};
        const triggerDesc = t.type === 'time'
            ? '🕐 ' + (t.time||'?') + ' · ' + (t.days||[]).length + '일'
            : '🎮 ' + (t.process||'?');
        const scn = _scenes.find(function(x){ return x.id===a.scene_id; });
        const actionDesc = a.type === 'scene'
            ? '🎬 ' + (scn ? scn.name : '?')
            : '✨ ' + (a.effect||'?');
        return '<div class="schedule-row ' + (s.enabled?'':'disabled') + '">' +
            '<div class="schedule-info">' +
            '<span class="schedule-name">' + s.name + '</span>' +
            '<span class="schedule-meta">' + triggerDesc + ' → ' + actionDesc + '</span>' +
            '</div>' +
            '<div class="schedule-btns">' +
            '<button class="sched-toggle-btn ' + (s.enabled?'on':'off') + '" onclick="toggleSchedule(\'' + s.id + '\')">' + (s.enabled?'켜짐':'꺼짐') + '</button>' +
            '<button class="sched-edit-btn" onclick="openScheduleEditor(\'' + s.id + '\')">✏️</button>' +
            '<button class="sched-del-btn" onclick="deleteSchedule(\'' + s.id + '\')">🗑</button>' +
            '</div></div>';
    }).join('');
}

function openScheduleEditor(schedId) {
    const modal = document.getElementById('schedule-modal');
    const existing = schedId ? _schedules.find(function(s){ return s.id===schedId; }) : null;
    document.getElementById('sched-edit-id').value = existing ? existing.id : '';
    document.getElementById('sched-name').value    = existing ? existing.name : '';
    const t = (existing && existing.trigger) || { type:'time', time:'18:00', days:[0,1,2,3,4,5,6] };
    const a = (existing && existing.action)  || { type:'scene' };
    setSchedType(t.type || 'time');
    if (t.type === 'time') {
        document.getElementById('sched-time').value = t.time || '18:00';
        document.querySelectorAll('.sched-day-btn').forEach(function(btn) {
            btn.classList.toggle('active', (t.days||[0,1,2,3,4,5,6]).includes(parseInt(btn.dataset.day)));
        });
    } else {
        document.getElementById('sched-process').value = t.process || '';
    }
    setSchedAction(a.type || 'scene');
    populateSchedSceneSelect();
    if (a.type === 'scene') {
        setTimeout(function(){ var sel=document.getElementById('sched-scene-select'); if(sel && a.scene_id) sel.value=a.scene_id; }, 60);
    } else {
        var sel=document.getElementById('sched-effect-select'); if(sel && a.effect) sel.value=a.effect;
    }
    if (modal) modal.style.display = 'flex';
}

function closeScheduleEditor() {
    const modal = document.getElementById('schedule-modal');
    if (modal) modal.style.display = 'none';
}

function setSchedType(type) {
    _schedType = type;
    document.getElementById('sched-type-time').classList.toggle('active', type==='time');
    document.getElementById('sched-type-process').classList.toggle('active', type==='process');
    document.getElementById('sched-time-panel').style.display    = type==='time'    ? 'block' : 'none';
    document.getElementById('sched-process-panel').style.display = type==='process' ? 'block' : 'none';
}

function setSchedAction(action) {
    _schedAction = action;
    document.getElementById('sched-action-scene').classList.toggle('active', action==='scene');
    document.getElementById('sched-action-effect').classList.toggle('active', action==='effect');
    document.getElementById('sched-scene-panel').style.display  = action==='scene'  ? 'block' : 'none';
    document.getElementById('sched-effect-panel').style.display = action==='effect' ? 'block' : 'none';
}

function populateSchedSceneSelect() {
    const sel = document.getElementById('sched-scene-select');
    if (!sel) return;
    sel.innerHTML = _scenes.length === 0
        ? '<option value="">씬 없음 — 먼저 씬을 저장하세요</option>'
        : _scenes.map(function(s){ return '<option value="'+s.id+'">'+(s.icon||'')+'  '+s.name+'</option>'; }).join('');
    sel.dispatchEvent(new Event('_csUpdate'));
}

async function loadProcessList() {
    const listEl = document.getElementById('sched-process-list');
    if (!listEl) return;
    listEl.style.display = 'block';
    listEl.innerHTML = '<span style="color:var(--text-secondary);font-size:0.78rem;">로딩 중...</span>';
    try {
        const res = await fetch(`${API_BASE}/processes`);
        const procs = await res.json();
        const keywords = ['game','cs2','lol','valorant','overwatch','steam','epic','minecraft','pubg','fortnite'];
        const filtered = procs.filter(function(p){ return keywords.some(function(k){ return p.toLowerCase().includes(k); }) || p.toLowerCase().endsWith('.exe'); });
        listEl.innerHTML = filtered.slice(0,30).map(function(p){
            return '<div class="proc-item" onclick="document.getElementById(\'sched-process\').value=\''+p+'\';document.getElementById(\'sched-process-list\').style.display=\'none\';" style="cursor:pointer;padding:0.25rem 0.5rem;border-radius:4px;font-size:0.78rem;hover:background:var(--glass-bg)">'+p+'</div>';
        }).join('') || '<span style="color:var(--text-secondary);font-size:0.78rem;">실행 중인 게임 없음</span>';
    } catch(e) {
        listEl.innerHTML = '<span style="color:#ff4444;font-size:0.78rem;">목록 로드 실패</span>';
    }
}

async function saveScheduleFromModal() {
    const name = document.getElementById('sched-name').value.trim();
    if (!name) { alert('스케줄 이름을 입력하세요.'); return; }
    const editId = document.getElementById('sched-edit-id').value;
    let trigger = {};
    if (_schedType === 'time') {
        const days = Array.from(document.querySelectorAll('.sched-day-btn.active')).map(function(b){ return parseInt(b.dataset.day); });
        trigger = { type:'time', time:document.getElementById('sched-time').value, days:days };
    } else {
        trigger = { type:'process', process:document.getElementById('sched-process').value.trim() };
    }
    let action = {};
    if (_schedAction === 'scene') {
        action = { type:'scene', scene_id:document.getElementById('sched-scene-select').value };
    } else {
        action = { type:'effect', effect:document.getElementById('sched-effect-select').value };
    }
    const body = { name:name, trigger:trigger, action:action, enabled:true };
    if (editId) body.id = editId;
    const res = await fetch(`${API_BASE}/schedules/save`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify(body)
    });
    const data = await res.json();
    if (data.status === 'OK') {
        showToast('스케줄 "'+name+'" 저장 완료');
        closeScheduleEditor();
        fetchSchedules();
    }
}

async function toggleSchedule(schedId) {
    await fetch(`${API_BASE}/schedules/toggle`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id:schedId})
    });
    fetchSchedules();
}

async function deleteSchedule(schedId) {
    const s = _schedules.find(function(x){ return x.id===schedId; });
    if (!confirm('스케줄 "' + (s?s.name:schedId) + '"를 삭제하시겠습니까?')) return;
    await fetch(`${API_BASE}/schedules/delete`, {
        method:'POST', headers:{'Content-Type':'application/json'}, body:JSON.stringify({id:schedId})
    });
    fetchSchedules();
}

/* ── Toast Notification ── */
function showToast(msg, duration) {
    duration = duration || 2500;
    var toast = document.getElementById('cd-toast');
    if (!toast) {
        toast = document.createElement('div');
        toast.id = 'cd-toast';
        toast.style.cssText = 'position:fixed;bottom:1.5rem;left:50%;transform:translateX(-50%) translateY(100px);background:var(--card-bg);border:1px solid var(--glass-border);color:var(--text-primary);padding:0.6rem 1.2rem;border-radius:10px;font-size:0.85rem;z-index:9999;box-shadow:0 4px 24px rgba(0,0,0,0.35);transition:transform 0.3s ease,opacity 0.3s ease;opacity:0;pointer-events:none;';
        document.body.appendChild(toast);
    }
    toast.textContent = msg;
    toast.style.transform = 'translateX(-50%) translateY(0)';
    toast.style.opacity   = '1';
    clearTimeout(toast._t);
    toast._t = setTimeout(function() {
        toast.style.transform = 'translateX(-50%) translateY(100px)';
        toast.style.opacity   = '0';
    }, duration);
}



/* ═══════════════════════════════════════════════════════════════
   FEATURE A — 가상 스크롤 & 드래그 앤 드롭
═══════════════════════════════════════════════════════════════ */
let _dragSrcId = null;

function _onCardDragStart(e) {
    _dragSrcId = this.dataset.devId;
    this.classList.add('drag-active');
    e.dataTransfer.effectAllowed = 'move';
    e.dataTransfer.setData('text/plain', _dragSrcId);
}

function _onCardDragOver(e) {
    e.preventDefault();
    e.dataTransfer.dropEffect = 'move';
    const card = e.currentTarget;
    if (card.dataset.devId !== _dragSrcId) card.classList.add('drag-over');
}

function _onCardDragLeave(e) {
    e.currentTarget.classList.remove('drag-over');
}

function _onCardDrop(e) {
    e.preventDefault();
    const targetId = e.currentTarget.dataset.devId;
    e.currentTarget.classList.remove('drag-over');
    if (!_dragSrcId || _dragSrcId === targetId) return;

    // Reorder devices array
    const srcIdx = devices.findIndex(d => d.id === _dragSrcId);
    const tgtIdx = devices.findIndex(d => d.id === targetId);
    if (srcIdx < 0 || tgtIdx < 0) return;
    const [moved] = devices.splice(srcIdx, 1);
    devices.splice(tgtIdx, 0, moved);

    // Re-render & persist order
    renderDevices();
    _saveDeviceOrder();
    addNotif('info', '기기 순서가 변경되었습니다.');
}

function _onCardDragEnd(e) {
    e.currentTarget.classList.remove('drag-active');
    document.querySelectorAll('.device-card.drag-over').forEach(c => c.classList.remove('drag-over'));
    _dragSrcId = null;
}

function _saveDeviceOrder() {
    const order = devices.map(d => d.id);
    fetch(`${API_BASE}/device/order`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ order }),
    }).catch(() => {});
    localStorage.setItem('deviceOrder', JSON.stringify(order));
}

function _applyDeviceOrder() {
    const stored = localStorage.getItem('deviceOrder');
    if (!stored) return;
    try {
        const order = JSON.parse(stored);
        const map = {};
        devices.forEach(d => { map[d.id] = d; });
        const ordered = order.filter(id => map[id]).map(id => map[id]);
        const rest = devices.filter(d => !order.includes(d.id));
        devices.length = 0;
        ordered.concat(rest).forEach(d => devices.push(d));
    } catch(e) {}
}

/* ═══════════════════════════════════════════════════════════════
   FEATURE B — 알림 센터
═══════════════════════════════════════════════════════════════ */
let _notifications = [];
let _notifPanelOpen = false;
let _unreadCount = 0;

function addNotif(type, msg) {
    const n = {
        id: 'n_' + Date.now(),
        ts: Date.now(),
        type: type || 'info',
        msg: msg,
    };
    _notifications.unshift(n);
    if (_notifications.length > 80) _notifications.length = 80;
    _unreadCount++;
    renderNotifBadge();
    renderNotifList();
    return n;
}

function renderNotifBadge() {
    const badge = document.getElementById('notif-badge');
    if (!badge) return;
    if (_unreadCount > 0) {
        badge.style.display = 'flex';
        badge.textContent = _unreadCount > 99 ? '99+' : _unreadCount;
    } else {
        badge.style.display = 'none';
    }
}

function renderNotifList() {
    const list = document.getElementById('notif-list');
    if (!list) return;
    if (_notifications.length === 0) {
        list.innerHTML = '<div class="notif-empty">알림이 없습니다.</div>';
        return;
    }
    const ICONS = { info: 'ℹ️', success: '✅', warn: '⚠️', error: '❌', scene: '🎬', schedule: '⏰', music: '🎵' };
    list.innerHTML = _notifications.map(n => {
        const d = new Date(n.ts);
        const time = d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0') + ':' + d.getSeconds().toString().padStart(2,'0');
        return `<div class="notif-item notif-${n.type}">
            <span class="notif-icon">${ICONS[n.type] || 'ℹ️'}</span>
            <div class="notif-body">
                <span class="notif-msg">${n.msg}</span>
                <span class="notif-time">${time}</span>
            </div>
        </div>`;
    }).join('');
}

function toggleNotifPanel() {
    _notifPanelOpen = !_notifPanelOpen;
    const panel = document.getElementById('notif-panel');
    if (!panel) return;
    if (_notifPanelOpen) {
        panel.classList.remove('notif-panel-hidden');
        _unreadCount = 0;
        renderNotifBadge();
    } else {
        panel.classList.add('notif-panel-hidden');
    }
}

function clearNotifs() {
    _notifications = [];
    _unreadCount = 0;
    renderNotifBadge();
    renderNotifList();
    fetch(`${API_BASE}/notifs/clear`, { method: 'POST' }).catch(() => {});
}

/* ═══════════════════════════════════════════════════════════════
   FEATURE C — 대시보드 모니터링 위젯 (스파크라인 포함)
═══════════════════════════════════════════════════════════════ */
let _monitorInterval = null;
const _sparkHistory = {};   // metricKey → [values]
const SPARK_LEN = 30;

function startMonitorPolling() {
    if (_monitorInterval) return;   // already running
    _fetchSysinfo();
    _monitorInterval = setInterval(_fetchSysinfo, 1500);
}

function stopMonitorPolling() {
    if (_monitorInterval) { clearInterval(_monitorInterval); _monitorInterval = null; }
}

async function _fetchSysinfo() {
    try {
        const res  = await fetch(`${API_BASE}/sysinfo`);
        const data = await res.json();
        _updateWidget('cpu-temp', data.cpu_temp, 100, 'mw-bar-temp', '°C', 60, 80);
        _updateWidget('cpu-load', data.cpu_load, 100, 'mw-bar-load', '%',  60, 85);
        _updateWidget('gpu-temp', data.gpu_temp, 100, 'mw-bar-gpu',  '°C', 65, 85);
        _updateWidget('ram',      data.ram_load, 100, 'mw-bar-ram',  '%',  70, 90);
        _updateWidget('disk',     data.disk_read + data.disk_write, 200, 'mw-bar-disk', 'MB/s', 80, 150);
        _updateWidget('net',      data.net_rx + data.net_tx, 300, 'mw-bar-net', 'Mbps', 100, 200);

        const el = document.getElementById('monitor-update-time');
        if (el) {
            const d = new Date();
            el.textContent = d.getHours().toString().padStart(2,'0') + ':' + d.getMinutes().toString().padStart(2,'0') + ':' + d.getSeconds().toString().padStart(2,'0') + ' 업데이트';
        }
    } catch(e) {}
}

function _updateWidget(key, val, max, barClass, unit, warnAt, critAt) {
    const valEl  = document.getElementById('mw-' + key + '-val');
    const barEl  = document.getElementById('mw-' + key + '-bar');
    const widget = document.getElementById('mw-' + key);
    if (!valEl) return;

    const display = (typeof val === 'number') ? val.toFixed(1) : '--';
    valEl.textContent = display;

    const pct = Math.min(100, (val / max) * 100);
    if (barEl) barEl.style.width = pct + '%';

    if (widget) {
        widget.classList.remove('mw-warn', 'mw-crit');
        if (val >= critAt) widget.classList.add('mw-crit');
        else if (val >= warnAt) widget.classList.add('mw-warn');
    }

    // Sparkline
    if (!_sparkHistory[key]) _sparkHistory[key] = [];
    _sparkHistory[key].push(val);
    if (_sparkHistory[key].length > SPARK_LEN) _sparkHistory[key].shift();
    _drawSparkline('spark-' + key, _sparkHistory[key], max, warnAt, critAt);
}

function _drawSparkline(canvasId, data, max, warnAt, critAt) {
    const canvas = document.getElementById(canvasId);
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    const W = canvas.width, H = canvas.height;
    ctx.clearRect(0, 0, W, H);
    if (data.length < 2) return;

    const step = W / (data.length - 1);
    const isDark = document.documentElement.getAttribute('data-theme') !== 'light';
    const lastVal = data[data.length - 1];
    const color = lastVal >= critAt ? '#ff4444' : lastVal >= warnAt ? '#ffaa00' : (isDark ? '#00b4ff' : '#0077aa');

    ctx.beginPath();
    ctx.strokeStyle = color;
    ctx.lineWidth = 1.5;
    ctx.shadowBlur = isDark ? 4 : 0;
    ctx.shadowColor = color;

    data.forEach((v, i) => {
        const x = i * step;
        const y = H - (v / max) * H * 0.9 - 2;
        i === 0 ? ctx.moveTo(x, y) : ctx.lineTo(x, y);
    });
    ctx.stroke();

    // Fill under line
    ctx.lineTo((data.length - 1) * step, H);
    ctx.lineTo(0, H);
    ctx.closePath();
    ctx.globalAlpha = 0.12;
    ctx.fillStyle = color;
    ctx.fill();
    ctx.globalAlpha = 1;
}

/* ═══════════════════════════════════════════════════════════════
   FEATURE D — 음악 반응 효과 강화
═══════════════════════════════════════════════════════════════ */
let _audioSensitivity = 1.0;
let _audioBeatFlash   = false;
let _audioBeatTimeout = null;

function setAudioSensitivity(val) {
    _audioSensitivity = parseFloat(val) || 1.0;
    const lbl = document.getElementById('audio-sens-label');
    if (lbl) lbl.textContent = (_audioSensitivity * 100).toFixed(0) + '%';
}

function _triggerBeatFlash() {
    _audioBeatFlash = true;
    const ind = document.getElementById('beat-flash-indicator');
    if (ind) {
        ind.classList.add('beat-active');
        clearTimeout(_audioBeatTimeout);
        _audioBeatTimeout = setTimeout(() => {
            ind.classList.remove('beat-active');
            _audioBeatFlash = false;
        }, 100);
    }
}

/* ═══════════════════════════════════════════════════════════════
   FEATURE E — SSE 이벤트 → 알림 연동
   (function 재선언 방식은 호이스팅 무한재귀 버그 유발 → 폴링 방식으로 교체)
═══════════════════════════════════════════════════════════════ */
const _patchSSERef = setInterval(() => {
    if (typeof _sseSource !== 'undefined' && _sseSource) {
        window._sseSourceRef = _sseSource;
        clearInterval(_patchSSERef);
        _sseSource.addEventListener('message', function(e) {
            try {
                const msg = JSON.parse(e.data);
                if (msg.type === 'notif') {
                    addNotif(msg.data.type || 'info', msg.data.msg || '');
                }
            } catch(err) {}
        });
    }
}, 200);

// Init: apply saved device order on startup
document.addEventListener('DOMContentLoaded', function() {
    // Auto-apply device order after devices are loaded (hook fetchDevices)
    const _origFetchDevices = typeof fetchDevices === 'function' ? fetchDevices : null;
    if (_origFetchDevices) {
        window.fetchDevices = async function() {
            await _origFetchDevices();
            _applyDeviceOrder();
            renderDevices();
        };
    }
    // Welcome notif
    setTimeout(() => addNotif('success', 'ColorDock 시작됨 — 모든 시스템 정상'), 800);
});



/* ═══════════════════════════════════════════════════════════════
   FEAT-7 BLOCK 1 — 키보드 키별 색상 에디터
═══════════════════════════════════════════════════════════════ */
const KB_UNIT = 40;
const KB_GAP  = 4;
const KB_H    = 40;

const KB_LAYOUT_ROWS = [
    [{id:'tilde',l:'`',w:1},{id:'k1',l:'1',w:1},{id:'k2',l:'2',w:1},{id:'k3',l:'3',w:1},
     {id:'k4',l:'4',w:1},{id:'k5',l:'5',w:1},{id:'k6',l:'6',w:1},{id:'k7',l:'7',w:1},
     {id:'k8',l:'8',w:1},{id:'k9',l:'9',w:1},{id:'k0',l:'0',w:1},{id:'minus',l:'-',w:1},
     {id:'equal',l:'=',w:1},{id:'bksp',l:'Bksp',w:2}],
    [{id:'tab',l:'Tab',w:1.5},{id:'Q',l:'Q',w:1},{id:'W',l:'W',w:1},{id:'E',l:'E',w:1},
     {id:'R',l:'R',w:1},{id:'T',l:'T',w:1},{id:'Y',l:'Y',w:1},{id:'U',l:'U',w:1},
     {id:'I',l:'I',w:1},{id:'O',l:'O',w:1},{id:'P',l:'P',w:1},{id:'lbr',l:'[',w:1},
     {id:'rbr',l:']',w:1},{id:'bsl',l:'\\',w:1.5}],
    [{id:'caps',l:'Caps',w:1.75},{id:'A',l:'A',w:1},{id:'S',l:'S',w:1},{id:'D',l:'D',w:1},
     {id:'F',l:'F',w:1},{id:'G',l:'G',w:1},{id:'H',l:'H',w:1},{id:'J',l:'J',w:1},
     {id:'K',l:'K',w:1},{id:'L',l:'L',w:1},{id:'semi',l:';',w:1},{id:'apos',l:"'",w:1},
     {id:'enter',l:'Enter',w:2.25}],
    [{id:'lshift',l:'Shift',w:2.25},{id:'Z',l:'Z',w:1},{id:'X',l:'X',w:1},{id:'C',l:'C',w:1},
     {id:'V',l:'V',w:1},{id:'B',l:'B',w:1},{id:'N',l:'N',w:1},{id:'M',l:'M',w:1},
     {id:'comma',l:',',w:1},{id:'dot',l:'.',w:1},{id:'slash',l:'/',w:1},
     {id:'rshift',l:'Shift',w:2.75}],
    [{id:'lctrl',l:'Ctrl',w:1.25},{id:'lwin',l:'Win',w:1.25},{id:'lalt',l:'Alt',w:1.25},
     {id:'space',l:'',w:6.25},
     {id:'ralt',l:'Alt',w:1.25},{id:'rwin',l:'Win',w:1.25},{id:'rctrl',l:'Ctrl',w:1.25}]
];

let _kbColors  = {};
let _kbDeviceId = null;

function _kbKeyTextColor(hex) {
    try {
        const r = parseInt(hex.slice(1,3),16)/255;
        const g = parseInt(hex.slice(3,5),16)/255;
        const b = parseInt(hex.slice(5,7),16)/255;
        return (0.299*r + 0.587*g + 0.114*b) > 0.38 ? '#000' : '#fff';
    } catch(e) { return '#fff'; }
}

function _hslToHex(h,s,l) {
    s/=100; l/=100;
    const a = s*Math.min(l,1-l);
    const f = n => { const k=(n+h/30)%12; const c=l-a*Math.max(Math.min(k-3,9-k,1),-1); return Math.round(255*c).toString(16).padStart(2,'0'); };
    return '#'+f(0)+f(8)+f(4);
}

function renderKeyboard() {
    const container = document.getElementById('kb-layout');
    if (!container) return;
    container.innerHTML = '';
    const rowH = KB_H + KB_GAP;
    KB_LAYOUT_ROWS.forEach(function(row, rowIdx) {
        let xPx = 0;
        row.forEach(function(key) {
            const wPx = Math.round(key.w * (KB_UNIT + KB_GAP)) - KB_GAP;
            const btn = document.createElement('button');
            btn.className = 'kb-key';
            btn.dataset.keyId = key.id;
            btn.textContent = key.l;
            const col = _kbColors[key.id] || '#1a1d2e';
            btn.style.cssText = 'left:'+xPx+'px;top:'+(rowIdx*rowH)+'px;width:'+wPx+'px;height:'+KB_H+'px;background:'+col+';color:'+_kbKeyTextColor(col)+';';
            btn.addEventListener('click', function(){ paintKey(this); });
            container.appendChild(btn);
            xPx += wPx + KB_GAP;
        });
    });
    container.style.height = (KB_LAYOUT_ROWS.length * rowH - KB_GAP) + 'px';
    const maxW = Math.max.apply(null, KB_LAYOUT_ROWS.map(function(row){
        return row.reduce(function(s,k){ return s+Math.round(k.w*(KB_UNIT+KB_GAP)); },0) - KB_GAP;
    }));
    container.style.minWidth = maxW + 'px';
}

function paintKey(btn) {
    const color = (document.getElementById('kb-color-input')||{value:'#00b4ff'}).value;
    btn.style.background = color;
    btn.style.color = _kbKeyTextColor(color);
    _kbColors[btn.dataset.keyId] = color;
}

function fillAllKeys() {
    const color = (document.getElementById('kb-color-input')||{value:'#00b4ff'}).value;
    document.querySelectorAll('.kb-key').forEach(function(btn){
        btn.style.background = color;
        btn.style.color = _kbKeyTextColor(color);
        _kbColors[btn.dataset.keyId] = color;
    });
}

function applyKbPreset(type) {
    const keys = Array.from(document.querySelectorAll('.kb-key'));
    keys.forEach(function(btn, i) {
        const t = i / Math.max(1, keys.length-1);
        let color;
        if      (type==='rainbow') color = _hslToHex(Math.round(t*300),100,50);
        else if (type==='fire')    color = t<0.33 ? '#ffff00' : t<0.66 ? '#ff8800' : '#ff2200';
        else if (type==='ocean')   color = t<0.33 ? '#0033ff' : t<0.66 ? '#00aaff' : '#00ffee';
        else                       color = '#000000';
        btn.style.background = color;
        btn.style.color = _kbKeyTextColor(color);
        _kbColors[btn.dataset.keyId] = color;
    });
}

async function applyKeyboardColors() {
    try {
        await fetch(API_BASE+'/keyboard/colors', {
            method:'POST', headers:{'Content-Type':'application/json'},
            body: JSON.stringify({ device_id: _kbDeviceId, colors: _kbColors })
        });
        showToast('키보드 색상 적용 완료');
        addNotif('success', '키보드 per-key 색상 적용됨');
    } catch(e) { showToast('적용 실패: '+e.message); }
}

function switchKbDevice(id) { _kbDeviceId = id; }

function populateKbDeviceSelect() {
    const sel = document.getElementById('kb-device-select');
    if (!sel) return;
    const kbDevs = (typeof devices!=='undefined'?devices:[]).filter(function(d){
        return d.type && d.type.toLowerCase().includes('keyboard');
    });
    if (!kbDevs.length) {
        sel.innerHTML = '<option value="">키보드 장치 없음</option>';
        _kbDeviceId = null;
    } else {
        sel.innerHTML = kbDevs.map(function(d){ return '<option value="'+d.id+'">'+d.name+'</option>'; }).join('');
        _kbDeviceId = kbDevs[0].id;
    }
}

document.addEventListener('click', function(e) {
    const btn = e.target.closest('.kb-preset-btn');
    if (btn) applyKbPreset(btn.dataset.colors);
});

document.addEventListener('click', function(e) {
    const w = e.target.closest('.monitor-widget');
    if (w && w.id) openMonitorChart(w.id.replace('mw-',''));
});


/* ═══════════════════════════════════════════════════════════════
   FEAT-7 BLOCK 2 — 씬 타임라인 / 플레이리스트
═══════════════════════════════════════════════════════════════ */
let _playlists   = [];
let _activePl    = null;
let _plCurIdx    = 0;
let _plSceneTimer = null;
let _plTickTimer  = null;
let _plElapsed    = 0;
let _plEditId    = null;
let _plEditItems = [];

async function fetchPlaylists() {
    try { _playlists = await (await fetch(API_BASE+'/playlists')).json(); }
    catch(e){ _playlists=[]; }
    renderPlaylists();
}

function renderPlaylists() {
    const list = document.getElementById('playlists-list');
    if (!list) return;
    if (!_playlists.length) {
        list.innerHTML = '<div style="color:var(--text-secondary);font-size:0.85rem;padding:2rem;text-align:center;border:1px dashed var(--glass-border);border-radius:10px;">저장된 플레이리스트가 없습니다.</div>';
        return;
    }
    list.innerHTML = _playlists.map(function(pl) {
        const playing = _activePl && _activePl.id === pl.id;
        const n = pl.items ? pl.items.length : 0;
        const sec = pl.items ? Math.round(pl.items.reduce(function(s,i){return s+i.duration_ms/1000;},0)) : 0;
        return '<div class="pl-row">'
            +'<span style="font-size:1.2rem;">'+(playing?'▶':'⏸')+'</span>'
            +'<div style="flex:1;min-width:0;">'
            +'<div style="font-size:0.88rem;font-weight:600;color:var(--text-primary);">'+(pl.name||'이름없음')+'</div>'
            +'<div style="font-size:0.72rem;color:var(--text-secondary);">'+n+'개 씬 · 총 '+sec+'초</div>'
            +'</div>'
            +'<div style="display:flex;gap:0.35rem;">'
            +(playing
                ? '<button class="btn-outline" onclick="stopPlaylist()" style="font-size:0.72rem;padding:0.3rem 0.7rem;">⏹</button>'
                : '<button class="btn-primary" onclick="playPlaylist(\''+pl.id+'\')" style="font-size:0.72rem;padding:0.3rem 0.7rem;">▶</button>')
            +'<button class="btn-outline" onclick="openPlaylistEditor(\''+pl.id+'\')" style="font-size:0.72rem;padding:0.3rem 0.7rem;">✏️</button>'
            +'<button class="btn-outline" onclick="deletePlaylist(\''+pl.id+'\')" style="font-size:0.72rem;padding:0.3rem 0.7rem;color:#ff6666;border-color:rgba(255,100,100,0.3);">🗑</button>'
            +'</div></div>';
    }).join('');
}

function openPlaylistEditor(id) {
    _plEditId = id||null; _plEditItems = [];
    const modal = document.getElementById('playlist-modal');
    if (!modal) return;
    const sp = document.getElementById('pl-scene-pick');
    if (sp) {
        sp.innerHTML = !(_scenes&&_scenes.length)
            ? '<option value="">씬 없음</option>'
            : _scenes.map(function(s){return '<option value="'+s.id+'">'+(s.icon||'')+' '+s.name+'</option>';}).join('');
        sp.dispatchEvent(new Event('_csUpdate'));
    }
    const ni = document.getElementById('pl-name-input');
    if (id) {
        const pl = _playlists.find(function(p){return p.id===id;});
        if (pl){ if(ni)ni.value=pl.name||''; _plEditItems=(pl.items||[]).map(function(i){return{scene_id:i.scene_id,duration_ms:i.duration_ms};}); }
    } else { if(ni)ni.value=''; }
    _renderPlItems(); modal.style.display='flex';
}

function closePlaylistEditor() {
    const m = document.getElementById('playlist-modal'); if(m)m.style.display='none';
}

function _renderPlItems() {
    const list = document.getElementById('pl-items-list');
    if (!list) return;
    if (!_plEditItems.length){
        list.innerHTML='<div style="color:var(--text-secondary);font-size:0.78rem;padding:0.5rem;">씬을 선택해 추가하세요.</div>'; return;
    }
    list.innerHTML = _plEditItems.map(function(item,i){
        const sc = (_scenes||[]).find(function(s){return s.id===item.scene_id;});
        const nm = sc ? (sc.icon||'')+' '+sc.name : item.scene_id;
        return '<div style="display:flex;align-items:center;gap:0.5rem;padding:0.35rem 0.5rem;background:var(--glass-bg);border:1px solid var(--glass-border);border-radius:6px;font-size:0.78rem;">'
            +'<span style="color:var(--text-secondary);min-width:18px;text-align:center;">'+(i+1)+'</span>'
            +'<span style="flex:1;">'+nm+'</span>'
            +'<span style="color:var(--glow-color);font-weight:600;">'+(item.duration_ms/1000)+'s</span>'
            +'<button onclick="_removePlItem('+i+')" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;">✕</button>'
            +'</div>';
    }).join('');
}

function _removePlItem(i){ _plEditItems.splice(i,1); _renderPlItems(); }

function addPlItem() {
    const sp = document.getElementById('pl-scene-pick');
    const di = document.getElementById('pl-duration-input');
    if (!sp||!sp.value){ showToast('씬을 선택하세요.'); return; }
    _plEditItems.push({scene_id:sp.value, duration_ms:Math.max(1,parseInt(di?di.value:5)||5)*1000});
    _renderPlItems();
}

async function savePlaylistFromModal() {
    const name = (document.getElementById('pl-name-input')||{}).value||'';
    if (!name.trim()){ alert('이름을 입력하세요.'); return; }
    if (!_plEditItems.length){ alert('씬을 1개 이상 추가하세요.'); return; }
    const body = {name:name.trim(), items:_plEditItems};
    if (_plEditId) body.id = _plEditId;
    try {
        const d = await (await fetch(API_BASE+'/playlists/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
        if (d.status==='OK'){ showToast('"'+name+'" 저장 완료'); closePlaylistEditor(); fetchPlaylists(); }
    } catch(e){ showToast('저장 실패'); }
}

function playPlaylist(id) {
    const pl = _playlists.find(function(p){return p.id===id;});
    if (!pl||!pl.items||!pl.items.length){ showToast('씬이 없는 플레이리스트입니다.'); return; }
    if (_plSceneTimer) clearTimeout(_plSceneTimer);
    if (_plTickTimer)  clearInterval(_plTickTimer);
    _activePl=pl; _plCurIdx=0; _plElapsed=0;
    const player = document.getElementById('playlist-player');
    if (player) player.style.display='block';
    _plNext();
    addNotif('scene','"'+pl.name+'" 플레이리스트 재생');
    renderPlaylists();
}

function _plNext() {
    if (!_activePl) return;
    if (_plCurIdx >= _activePl.items.length) _plCurIdx=0;
    const item = _activePl.items[_plCurIdx];
    const sc = (_scenes||[]).find(function(s){return s.id===item.scene_id;});
    fetch(API_BASE+'/scenes/load',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:item.scene_id})}).catch(function(){});
    const ni=document.getElementById('pl-now-icon'), nn=document.getElementById('pl-now-name');
    if (ni) ni.textContent = sc ? (sc.icon||'🎬') : '🎬';
    if (nn) nn.textContent = sc ? sc.name : item.scene_id;
    _plElapsed=0; clearInterval(_plTickTimer);
    _plTickTimer = setInterval(function(){
        _plElapsed+=100;
        const pct=Math.min(100,_plElapsed/item.duration_ms*100);
        const bar=document.getElementById('pl-progress-bar'), prog=document.getElementById('pl-now-progress');
        if (bar)  bar.style.width=pct+'%';
        if (prog) prog.textContent='씬'+(_plCurIdx+1)+'/'+_activePl.items.length+' · 남은 '+Math.max(0,Math.round((item.duration_ms-_plElapsed)/1000))+'s';
    },100);
    clearTimeout(_plSceneTimer);
    _plSceneTimer=setTimeout(function(){ clearInterval(_plTickTimer); _plCurIdx++; _plNext(); }, item.duration_ms);
}

function stopPlaylist() {
    clearTimeout(_plSceneTimer); clearInterval(_plTickTimer);
    _activePl=null;
    const p=document.getElementById('playlist-player'); if(p)p.style.display='none';
    showToast('플레이리스트 정지'); renderPlaylists();
}

async function deletePlaylist(id) {
    const pl=_playlists.find(function(p){return p.id===id;});
    if (!confirm('"'+(pl?pl.name:id)+'" 삭제?')) return;
    if (_activePl&&_activePl.id===id) stopPlaylist();
    await fetch(API_BASE+'/playlists/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id})});
    fetchPlaylists();
}


/* ═══════════════════════════════════════════════════════════════
   FEAT-7 BLOCK 3 — 모니터링 풀사이즈 라인차트
═══════════════════════════════════════════════════════════════ */
const _CHART_MAX  = {'cpu-temp':100,'cpu-load':100,'gpu-temp':100,'ram':100,'disk':200,'net':300};
const _CHART_WARN = {'cpu-temp':60,'cpu-load':60,'gpu-temp':65,'ram':70,'disk':80,'net':100};
const _CHART_CRIT = {'cpu-temp':80,'cpu-load':85,'gpu-temp':85,'ram':90,'disk':150,'net':200};
const _CHART_LBL  = {'cpu-temp':'CPU 온도 (°C)','cpu-load':'CPU 사용률 (%)','gpu-temp':'GPU 온도 (°C)','ram':'RAM (%)','disk':'디스크 I/O (MB/s)','net':'네트워크 (Mbps)'};

function openMonitorChart(key) {
    let modal = document.getElementById('monitor-chart-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id='monitor-chart-modal';
        modal.style.cssText='position:fixed;inset:0;background:rgba(0,0,0,0.78);z-index:4500;display:flex;align-items:center;justify-content:center;';
        modal.innerHTML = '<div style="background:var(--card-bg);border:1px solid var(--glass-border);border-radius:16px;padding:1.5rem;width:min(720px,96vw);">'
            +'<div style="display:flex;align-items:center;justify-content:space-between;margin-bottom:1rem;">'
            +'<h3 id="mcm-title" style="margin:0;font-size:1rem;">📊</h3>'
            +'<button onclick="document.getElementById(\'monitor-chart-modal\').style.display=\'none\'" style="background:none;border:none;color:var(--text-secondary);cursor:pointer;font-size:1.3rem;">✕</button>'
            +'</div>'
            +'<canvas id="mcm-canvas" width="660" height="200" style="width:100%;border-radius:8px;"></canvas>'
            +'<div id="mcm-stats" style="display:flex;gap:1rem;flex-wrap:wrap;margin-top:0.75rem;font-size:0.78rem;color:var(--text-secondary);"></div>'
            +'</div>';
        document.body.appendChild(modal);
    }
    modal.style.display='flex';
    const t=document.getElementById('mcm-title'); if(t) t.textContent='📊 '+(_CHART_LBL[key]||key);
    _drawFullChart('mcm-canvas',key);
    const data=_sparkHistory[key]||[];
    if (data.length) {
        const mn=Math.min.apply(null,data).toFixed(1), mx=Math.max.apply(null,data).toFixed(1);
        const av=(data.reduce(function(a,b){return a+b;},0)/data.length).toFixed(1);
        const s=document.getElementById('mcm-stats');
        if(s) s.innerHTML='<span>최솟값: <strong>'+mn+'</strong></span><span>최댓값: <strong>'+mx+'</strong></span><span>평균: <strong>'+av+'</strong></span>';
    }
}

function _drawFullChart(canvasId, key) {
    const canvas=document.getElementById(canvasId); if(!canvas)return;
    const ctx=canvas.getContext('2d'); const W=canvas.width, H=canvas.height;
    const data=_sparkHistory[key]||[];
    const maxV=_CHART_MAX[key]||100, warnAt=_CHART_WARN[key]||70, critAt=_CHART_CRIT[key]||90;
    const isDark=document.documentElement.getAttribute('data-theme')!=='light';
    ctx.clearRect(0,0,W,H);
    ctx.fillStyle=isDark?'#0d1018':'#f4f7ff'; ctx.fillRect(0,0,W,H);
    if (data.length<2){
        ctx.fillStyle=isDark?'rgba(255,255,255,0.3)':'rgba(0,0,0,0.3)';
        ctx.font='13px sans-serif'; ctx.textAlign='center';
        ctx.fillText('데이터 수집 중...', W/2, H/2); ctx.textAlign='left'; return;
    }
    const PL=44,PR=12,PT=14,PB=24; const pW=W-PL-PR, pH=H-PT-PB;
    ctx.lineWidth=1; ctx.font='10px sans-serif';
    for(var i=0;i<=4;i++){
        const yp=PT+pH*(1-i/4);
        ctx.strokeStyle=isDark?'rgba(255,255,255,0.05)':'rgba(0,0,0,0.06)';
        ctx.beginPath(); ctx.moveTo(PL,yp); ctx.lineTo(PL+pW,yp); ctx.stroke();
        ctx.fillStyle=isDark?'rgba(255,255,255,0.35)':'rgba(0,0,0,0.35)';
        ctx.fillText(Math.round(maxV*i/4), 2, yp+4);
    }
    ctx.setLineDash([4,3]); ctx.lineWidth=1;
    const wY=PT+pH*(1-warnAt/maxV), cY=PT+pH*(1-critAt/maxV);
    ctx.strokeStyle='rgba(255,170,0,0.45)'; ctx.beginPath(); ctx.moveTo(PL,wY); ctx.lineTo(PL+pW,wY); ctx.stroke();
    ctx.strokeStyle='rgba(255,68,68,0.45)';  ctx.beginPath(); ctx.moveTo(PL,cY); ctx.lineTo(PL+pW,cY); ctx.stroke();
    ctx.setLineDash([]);
    const step=pW/(data.length-1), lastV=data[data.length-1];
    const lc=lastV>=critAt?'#ff4444':lastV>=warnAt?'#ffaa00':(isDark?'#00b4ff':'#0077dd');
    ctx.beginPath(); ctx.strokeStyle=lc; ctx.lineWidth=2;
    if(isDark){ctx.shadowBlur=8;ctx.shadowColor=lc;}
    data.forEach(function(v,i){ const x=PL+i*step, y=PT+pH*(1-v/maxV); i===0?ctx.moveTo(x,y):ctx.lineTo(x,y); });
    ctx.stroke(); ctx.shadowBlur=0;
    const lx=PL+(data.length-1)*step;
    ctx.lineTo(lx,PT+pH); ctx.lineTo(PL,PT+pH); ctx.closePath();
    ctx.globalAlpha=0.18; ctx.fillStyle=lc; ctx.fill(); ctx.globalAlpha=1;
    ctx.fillStyle=isDark?'rgba(255,255,255,0.3)':'rgba(0,0,0,0.3)'; ctx.font='10px sans-serif';
    const nl=Math.min(5,data.length);
    for(var j=0;j<nl;j++){ const idx=Math.round(j*(data.length-1)/Math.max(1,nl-1)); ctx.fillText('-'+Math.round((data.length-1-idx)*1.5)+'s', PL+idx*step-10, H-5); }
    const cx=PL+(data.length-1)*step, cy=PT+pH*(1-lastV/maxV);
    ctx.beginPath(); ctx.arc(cx,cy,5,0,Math.PI*2); ctx.fillStyle=lc; ctx.fill();
    ctx.font='bold 12px sans-serif'; ctx.fillStyle=lc; ctx.fillText(lastV.toFixed(1), cx-14, cy-9);
}


/* ═══════════════════════════════════════════════════════════════
   FEAT-7 BLOCK 4 — BPM 탭 템포 싱크
═══════════════════════════════════════════════════════════════ */
let _bpmTaps=[], _detectedBpm=0;

function tapBpm() {
    const now=Date.now(); _bpmTaps.push(now);
    if(_bpmTaps.length>8) _bpmTaps.shift();
    const btn=document.getElementById('btn-tap-bpm');
    if(btn){ btn.style.background='var(--glow-color)'; btn.style.color='#000'; clearTimeout(btn._ft); btn._ft=setTimeout(function(){btn.style.background='';btn.style.color='';},120); }
    if(_bpmTaps.length>=2){
        const diffs=[]; for(var i=1;i<_bpmTaps.length;i++) diffs.push(_bpmTaps[i]-_bpmTaps[i-1]);
        _detectedBpm=Math.round(60000/(diffs.reduce(function(a,b){return a+b;},0)/diffs.length));
        const el=document.getElementById('bpm-display'); if(el) el.textContent=_detectedBpm+' BPM';
    }
    clearTimeout(window._bpmResetT); window._bpmResetT=setTimeout(function(){_bpmTaps=[];},3000);
}

function syncBpmToEffect() {
    if(_detectedBpm<=0){ showToast('탭으로 BPM을 먼저 감지하세요.'); return; }
    const speed=parseFloat(Math.max(0.5,Math.min(5.0,_detectedBpm/30)).toFixed(2));
    fetch(API_BASE+'/mode',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({speed:speed})}).catch(function(){});
    showToast('BPM '+_detectedBpm+' → 속도 '+speed+'x 적용');
    addNotif('music','BPM '+_detectedBpm+' 감지 → 조명 속도 동기화');
}


/* ═══════════════════════════════════════════════════════════════
   FEAT-7 BLOCK 5 — Canvas 2D Bloom LED 비주얼라이저
═══════════════════════════════════════════════════════════════ */
let _bloomAnimId=null, _lastBass=0, _lastMid=0, _lastTreble=0;

function _startBloomCanvas() {
    const canvas=document.getElementById('bloom-canvas');
    if (!canvas||_bloomAnimId) return;
    (function _draw(){
        _bloomAnimId=requestAnimationFrame(_draw);
        const ctx=canvas.getContext('2d'); const W=canvas.width, H=canvas.height;
        const isDark=document.documentElement.getAttribute('data-theme')!=='light';
        ctx.fillStyle=isDark?'#060810':'#e8ecf5'; ctx.fillRect(0,0,W,H);
        const N=28; ctx.globalCompositeOperation='lighter';
        for(var i=0;i<N;i++){
            const t=i/(N-1);
            let r=0,g=0,b=0;
            if(t<0.33){ const f=t/0.33; r=Math.round(_lastBass*255*(1-f)*1.5); g=Math.round(_lastMid*120*f); b=Math.round(_lastMid*60*f); }
            else if(t<0.66){ const f=(t-0.33)/0.33; r=Math.round(_lastMid*60*(1-f)); g=Math.round(_lastMid*200); b=Math.round(_lastTreble*180*f); }
            else { const f=(t-0.66)/0.34; r=Math.round(_lastTreble*80*f); g=Math.round(_lastTreble*60*(1-f)); b=Math.round(_lastTreble*255); }
            r=Math.min(255,r); g=Math.min(255,g); b=Math.min(255,b);
            const br=Math.max(0.05,(r+g+b)/765);
            const x=10+t*(W-20), y=H/2, rad=6+br*12;
            const grd=ctx.createRadialGradient(x,y,0,x,y,rad*2.5);
            grd.addColorStop(0,'rgba('+r+','+g+','+b+','+Math.min(1,br*2.5)+')');
            grd.addColorStop(0.4,'rgba('+r+','+g+','+b+','+Math.min(0.8,br)+')');
            grd.addColorStop(1,'rgba('+r+','+g+','+b+',0)');
            ctx.fillStyle=grd; ctx.beginPath(); ctx.arc(x,y,rad*2.5,0,Math.PI*2); ctx.fill();
        }
        ctx.globalCompositeOperation='source-over';
    })();
}

function _stopBloomCanvas(){ if(_bloomAnimId){cancelAnimationFrame(_bloomAnimId);_bloomAnimId=null;} }


/* ═══════════════════════════════════════════════════════════════
   FEAT-7 BLOCK 6 — 설정 백업 / 복원
═══════════════════════════════════════════════════════════════ */
async function importBackup(input) {
    const file=input.files&&input.files[0]; if(!file)return;
    const st=document.getElementById('backup-status'); if(st)st.textContent='업로드 중...';
    const fd=new FormData(); fd.append('file',file);
    try {
        const d=await(await fetch(API_BASE+'/backup/import',{method:'POST',body:fd})).json();
        if(d.status==='OK'){
            if(st)st.textContent='복원 완료! ✅';
            showToast('설정 복원 완료 — 새로고침 후 반영됩니다');
            addNotif('success','설정 백업 복원 완료 ('+(d.restored||0)+'개 파일)');
        } else { if(st)st.textContent='실패: '+(d.error||'오류'); }
    } catch(e){ if(st)st.textContent='오류: '+e.message; }
    input.value='';
}


/* ═══════════════════════════════════════════════════════════════
   FEAT-7 BLOCK 7 — 다중 사용자 프로필
═══════════════════════════════════════════════════════════════ */
let _userProfiles=[];

async function fetchUserProfiles() {
    try { _userProfiles=await(await fetch(API_BASE+'/userprofiles')).json(); }
    catch(e){ _userProfiles=[]; }
    renderUserProfiles();
}

function renderUserProfiles() {
    const grid=document.getElementById('user-profiles-grid'); if(!grid)return;
    if(!_userProfiles.length){
        grid.innerHTML='<div style="color:var(--text-secondary);font-size:0.85rem;padding:2rem;text-align:center;border:1px dashed var(--glass-border);border-radius:10px;grid-column:1/-1;">프로필이 없습니다. 새 프로필을 만들어보세요.</div>'; return;
    }
    grid.innerHTML=_userProfiles.map(function(p){
        const bi=p.builtin===true;
        return '<div class="profile-card-new">'
            +'<div class="pcn-icon">'+(p.icon||'👤')+'</div>'
            +'<div class="pcn-name">'+(p.name||'이름없음')+'</div>'
            +'<div class="pcn-meta"><span>'+(p.effect||'rainbow')+'</span><span>'+(p.brightness||100)+'%</span></div>'
            +'<div class="pcn-actions">'
            +'<button class="btn-primary" onclick="applyUserProfile(\''+p.id+'\')" style="font-size:0.72rem;padding:0.35rem 0.7rem;width:100%;">▶ 적용</button>'
            +(bi?'':'<div style="display:flex;gap:0.3rem;margin-top:0.4rem;">'
            +'<button class="btn-outline" onclick="openProfileEditor(\''+p.id+'\')" style="flex:1;font-size:0.7rem;padding:0.25rem;">✏️</button>'
            +'<button class="btn-outline" onclick="deleteUserProfile(\''+p.id+'\')" style="flex:1;font-size:0.7rem;padding:0.25rem;color:#ff6666;border-color:rgba(255,100,100,0.3);">🗑</button>'
            +'</div>')
            +'</div></div>';
    }).join('');
}

function openProfileEditor(id) {
    const modal=document.getElementById('profile-edit-modal'); if(!modal)return;
    const sp=document.getElementById('pe-scene');
    if(sp) {
        sp.innerHTML='<option value="">-- 씬 없음 --</option>'
            +(_scenes||[]).map(function(s){return '<option value="'+s.id+'">'+(s.icon||'')+' '+s.name+'</option>';}).join('');
        sp.dispatchEvent(new Event('_csUpdate'));
    }
    const ei=document.getElementById('pe-id'); if(ei)ei.value=id||'';
    if(id){
        const p=_userProfiles.find(function(x){return x.id===id;});
        if(p){
            const setV=function(elId,v){const el=document.getElementById(elId);if(el)el.value=v;};
            setV('pe-icon',p.icon||'🎮'); setV('pe-name',p.name||''); setV('pe-effect',p.effect||'rainbow');
            setV('pe-brightness',p.brightness||100); setV('pe-scene',p.scene_id||'');
            const bl=document.getElementById('pe-brightness-label'); if(bl)bl.textContent=(p.brightness||100)+'%';
        }
    } else {
        const setV=function(elId,v){const el=document.getElementById(elId);if(el)el.value=v;};
        setV('pe-name',''); setV('pe-brightness',100);
        const bl=document.getElementById('pe-brightness-label'); if(bl)bl.textContent='100%';
    }
    modal.style.display='flex';
}

function closeProfileEditor(){ const m=document.getElementById('profile-edit-modal'); if(m)m.style.display='none'; }

async function saveProfileFromModal() {
    const gv=function(id){return(document.getElementById(id)||{value:''}).value;};
    const name=gv('pe-name').trim(); if(!name){alert('프로필 이름을 입력하세요.');return;}
    const body={name:name,icon:gv('pe-icon'),effect:gv('pe-effect'),brightness:parseInt(gv('pe-brightness'))||100,scene_id:gv('pe-scene')};
    const editId=gv('pe-id'); if(editId)body.id=editId;
    try {
        const d=await(await fetch(API_BASE+'/userprofiles/save',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify(body)})).json();
        if(d.status==='OK'){ showToast('"'+name+'" 저장 완료'); closeProfileEditor(); fetchUserProfiles(); }
    } catch(e){ showToast('저장 실패'); }
}

async function applyUserProfile(id) {
    const p=_userProfiles.find(function(x){return x.id===id;});
    try {
        const d=await(await fetch(API_BASE+'/userprofiles/apply',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id})})).json();
        if(d.status==='OK'){
            showToast((p?p.icon+' '+p.name:'프로필')+' 적용됨');
            addNotif('success','"'+(p?p.name:'프로필')+'" 프로필 적용 완료');
            if(typeof fetchDevices==='function') fetchDevices();
        }
    } catch(e){ showToast('적용 실패'); }
}

async function deleteUserProfile(id) {
    const p=_userProfiles.find(function(x){return x.id===id;});
    if(!confirm('"'+(p?p.name:id)+'" 삭제?')) return;
    await fetch(API_BASE+'/userprofiles/delete',{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({id:id})});
    fetchUserProfiles();
}


/* ═══════════════════════════════════════════════════════════════
   FEAT-7 AUDIO → BLOOM BRIDGE
═══════════════════════════════════════════════════════════════ */
(function(){
    const _nf=window.fetch.bind(window);
    window.fetch=function(url,opts){
        if(typeof url==='string'&&url.includes('/visualizer/beat')&&opts&&opts.body){
            try{
                const d=JSON.parse(opts.body);
                if(typeof d.bass!=='undefined'){
                    _lastBass=d.bass||0; _lastMid=d.mid||0; _lastTreble=d.treble||0;
                    if(!_bloomAnimId){ const c=document.getElementById('bloom-canvas'); if(c)_startBloomCanvas(); }
                }
            }catch(e){}
        }
        return _nf(url,opts);
    };
})();

