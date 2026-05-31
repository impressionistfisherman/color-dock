# ColorDock RGB Control Dashboard — PyInstaller 진입점 (pywebview 버전)
import sys
import os
import threading
import time
import json
import pystray
from PIL import Image, ImageDraw
import webview

# ── 경로 설정 ─────────────────────────────────────────────────
if getattr(sys, 'frozen', False):
    _BUNDLE = sys._MEIPASS
    _DATA   = os.path.dirname(sys.executable)
else:
    _BUNDLE = os.path.dirname(os.path.abspath(__file__))
    _DATA   = _BUNDLE

os.chdir(_DATA)
sys.path.insert(0, _BUNDLE)

# ── 로그 파일 ──────────────────────────────────────────────────
LOG_FILE = os.path.join(_DATA, 'colordock.log')
try:
    _log_f = open(LOG_FILE, 'w', encoding='utf-8', buffering=1)
    sys.stdout = _log_f
    sys.stderr = _log_f
    print(f'[ColorDock] launcher started  bundle={_BUNDLE}  data={_DATA}')
except Exception:
    pass

# ── 설정 파일 ──────────────────────────────────────────────────
SETTINGS_FILE = os.path.join(_DATA, 'colordock_settings.json')

def load_settings():
    defaults = {'close_to_tray': True}
    try:
        if os.path.exists(SETTINGS_FILE):
            with open(SETTINGS_FILE, 'r', encoding='utf-8') as f:
                return {**defaults, **json.load(f)}
    except Exception:
        pass
    return defaults

def save_settings(s):
    try:
        with open(SETTINGS_FILE, 'w', encoding='utf-8') as f:
            json.dump(s, f, ensure_ascii=False, indent=2)
    except Exception:
        pass

settings = load_settings()

# ── 방화벽 규칙 자동 추가 ────────────────────────────────────
def _add_firewall_rule():
    try:
        import subprocess
        result = subprocess.run([
            'netsh', 'advfirewall', 'firewall', 'add', 'rule',
            'name=ColorDock RGB (3050)',
            'dir=in', 'action=allow',
            'protocol=TCP', 'localport=3050', 'profile=any'
        ], capture_output=True, timeout=5)
        print(f'[firewall] exit={result.returncode}')
    except Exception as e:
        print(f'[firewall] skipped: {e}')

threading.Thread(target=_add_firewall_rule, daemon=True).start()

# ── OpenRGB 자동 실행 (서버 모드) ─────────────────────────────
def _start_openrgb():
    openrgb_exe = os.path.join(_BUNDLE, 'OpenRGB', 'OpenRGB.exe')
    if not os.path.exists(openrgb_exe):
        print('[OpenRGB] Not found, skipping')
        return
    try:
        import subprocess
        CREATE_NO_WINDOW = 0x08000000
        proc = subprocess.Popen(
            [openrgb_exe, '--server', '--noautoconnect', '--server-port', '6742'],
            creationflags=CREATE_NO_WINDOW,
            stdout=subprocess.DEVNULL,
            stderr=subprocess.DEVNULL,
        )
        print(f'[OpenRGB] Started (PID {proc.pid})')
        # 초기화 대기
        time.sleep(3)
    except Exception as e:
        print(f'[OpenRGB] Failed to start: {e}')

_openrgb_thread = threading.Thread(target=_start_openrgb, daemon=False, name='OpenRGB')
_openrgb_thread.start()
# OpenRGB가 뜰 때까지 기다린 후 Flask 시작
_openrgb_thread.join(timeout=5)

# ── Flask 백그라운드 실행 ──────────────────────────────────────
_server_error = None

def _run_flask():
    global _server_error
    try:
        import flask as _flask
        _orig = _flask.Flask.__init__
        def _patched(self, import_name, **kw):
            if kw.get('static_folder') == 'public':
                kw['static_folder'] = os.path.join(_BUNDLE, 'public')
                kw['root_path']     = _BUNDLE
            _orig(self, import_name, **kw)
        _flask.Flask.__init__ = _patched

        _app_path = os.path.join(_BUNDLE, 'app.py')
        with open(_app_path, 'r', encoding='utf-8') as f:
            _code = f.read()
        print('[Flask] executing app.py ...')
        exec(
            compile(_code, _app_path, 'exec'),
            {'__name__': '__main__', '__file__': _app_path, '__spec__': None}
        )
    except Exception as e:
        import traceback
        _server_error = str(e)
        print(f'[Flask] FATAL:\n{traceback.format_exc()}')

_flask_thread = threading.Thread(target=_run_flask, daemon=True, name='Flask')
_flask_thread.start()

# ── 트레이 아이콘 이미지 ──────────────────────────────────────
def _make_icon(size=64, error=False):
    img = Image.new('RGBA', (size, size), (0, 0, 0, 0))
    d   = ImageDraw.Draw(img)
    if error:
        d.ellipse([4, 4, size-4, size-4], fill=(220, 50, 50, 220))
        d.line([18, 18, size-18, size-18], fill='white', width=6)
        d.line([size-18, 18, 18, size-18], fill='white', width=6)
    else:
        r = int(size * 0.55)
        cx, cy = size // 2, size // 2
        d.ellipse([cx-r, cy-r, cx, cy],         fill=(255, 60, 60, 220))
        d.ellipse([cx, cy-r, cx+r, cy],         fill=(60, 220, 60, 220))
        d.ellipse([cx-r//2, cy, cx+r//2, cy+r], fill=(60, 120, 255, 220))
        m = size // 2
        d.ellipse([m-6, m-6, m+6, m+6], fill=(255, 255, 255, 180))
    return img

# ── 메인 ──────────────────────────────────────────────────────
def main():
    # pywebview 창 생성 (서버 준비 전이라 숨김 상태로)
    window = webview.create_window(
        '🌈 ColorDock RGB',
        'http://localhost:3050',
        width=1440, height=900,
        min_size=(960, 600),
        hidden=True,
    )

    # X 버튼 동작 — closing 이벤트로 제어
    def _on_closing():
        if settings.get('close_to_tray', True):
            window.hide()
            return False   # 닫기 취소 → 트레이로 숨김
        # 종료 허용 → 트레이 정리
        try:
            _tray.stop()
        except Exception:
            pass
        return True

    # 최소화 버튼 → 트레이로 숨김
    def _on_minimized():
        window.hide()

    window.events.closing  += _on_closing
    window.events.minimized += _on_minimized

    # ── 트레이 아이콘 ──
    def _show_window(icon=None, item=None):
        window.show()

    def _open_browser(icon=None, item=None):
        import webbrowser
        webbrowser.open('http://localhost:3050')

    def _open_log(icon=None, item=None):
        if os.path.exists(LOG_FILE):
            os.startfile(LOG_FILE)

    def _toggle_close(icon, item):
        settings['close_to_tray'] = not settings.get('close_to_tray', True)
        save_settings(settings)

    def _exit_app(icon=None, item=None):
        print('[ColorDock] exit')
        try:
            _tray.stop()
        except Exception:
            pass
        window.destroy()
        os._exit(0)

    menu = pystray.Menu(
        pystray.MenuItem('🌈 창 열기', _show_window, default=True),
        pystray.MenuItem(
            'X 버튼 → 트레이로',
            _toggle_close,
            checked=lambda item: settings.get('close_to_tray', True)
        ),
        pystray.MenuItem('📄 로그 보기', _open_log),
        pystray.Menu.SEPARATOR,
        pystray.MenuItem('종료', _exit_app),
    )
    _tray = pystray.Icon('ColorDock', _make_icon(), 'ColorDock RGB (시작 중...)', menu)
    threading.Thread(target=_tray.run, daemon=True, name='Tray').start()

    # ── 서버 헬스체크 ──
    def _health():
        import socket
        deadline = time.time() + 15
        while time.time() < deadline:
            time.sleep(0.7)
            try:
                s = socket.create_connection(('127.0.0.1', 3050), timeout=1)
                s.close()
                print('[Flask] server ready — navigating window')
                _tray.title = 'ColorDock RGB ✓ 실행 중'
                # 반드시 URL을 새로 로드한 뒤 표시 (Flask 준비 전 로드 오류 방지)
                window.load_url('http://localhost:3050')
                time.sleep(0.5)
                window.show()
                return
            except OSError:
                pass
        # 타임아웃
        msg = _server_error or '알 수 없는 오류'
        print(f'[Flask] health check timeout — {msg}')
        _tray.icon  = _make_icon(error=True)
        _tray.title = 'ColorDock RGB ✗ 오류'
        window.load_url('http://localhost:3050')
        window.show()

    threading.Thread(target=_health, daemon=True, name='Health').start()

    # ── pywebview 시작 (메인 스레드 블록) ──
    webview.start(debug=False)
    os._exit(0)


if __name__ == '__main__':
    main()
