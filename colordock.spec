# -*- mode: python ; coding: utf-8 -*-
# ColorDock RGB Control Dashboard — PyInstaller spec
import os

PROJECT = r'C:\Users\Hyeonil-Choi\Desktop\rgb'

block_cipher = None

a = Analysis(
    [os.path.join(PROJECT, 'launcher.py')],
    pathex=[PROJECT],
    binaries=[],
    datas=[
        # 앱 소스 (launcher가 런타임에 exec로 실행)
        (os.path.join(PROJECT, 'app.py'), '.'),
        # 프론트엔드 정적 파일
        (os.path.join(PROJECT, 'public'), 'public'),
        # OpenRGB 번들 (서버 모드 자동 실행용)
        (os.path.join(PROJECT, 'OpenRGB'), 'OpenRGB'),
        # 버전 파일
        (os.path.join(PROJECT, 'version.txt'), '.'),
    ],
    hiddenimports=[
        # Flask / Werkzeug
        'flask', 'flask.json', 'flask.json.provider', 'flask.sansio',
        'flask.sansio.app', 'flask.sansio.blueprints',
        'werkzeug', 'werkzeug.serving', 'werkzeug.exceptions',
        'werkzeug.routing', 'werkzeug.middleware',
        'werkzeug.middleware.shared_data',
        'jinja2', 'jinja2.ext', 'markupsafe',
        'click', 'itsdangerous', 'blinker',
        # HTTP
        'requests', 'requests.adapters', 'requests.auth', 'requests.packages',
        'urllib3', 'urllib3.util', 'urllib3.util.retry', 'urllib3.util.ssl_',
        'certifi', 'charset_normalizer', 'idna',
        # Windows API
        'win32api', 'win32gui', 'win32ui', 'win32con',
        'win32process', 'win32security', 'win32event',
        'pythoncom', 'pywintypes', 'winerror',
        # HID
        'hidapi',
        # Monitoring
        'psutil',
        # Tray
        'pystray', 'pystray._win32',
        'PIL', 'PIL.Image', 'PIL.ImageDraw', 'PIL.ImageFont',
        # pywebview (WebView2 / EdgeChromium backend)
        'webview', 'webview.platforms', 'webview.platforms.winforms',
        'webview.platforms.edgechromium',
        'pythonnet', 'clr',
        'bottle',
        # stdlib
        'ctypes', 'ctypes.wintypes', 'threading', 'socket', 'struct',
        'math', 'json', 'zipfile', 'shutil', 'io', 'os', 'sys',
        'webbrowser', 'time', 'importlib', 'importlib.util',
    ],
    hookspath=[],
    hooksconfig={},
    runtime_hooks=[],
    excludes=['matplotlib', 'numpy', 'pandas', 'scipy', 'tkinter'],
    win_no_prefer_redirects=False,
    win_private_assemblies=False,
    cipher=block_cipher,
    noarchive=False,
)

pyz = PYZ(a.pure, a.zipped_data, cipher=block_cipher)

exe = EXE(
    pyz,
    a.scripts,
    [],
    exclude_binaries=True,
    name='ColorDock',
    debug=False,
    bootloader_ignore_signals=False,
    strip=False,
    upx=True,
    console=False,      # 콘솔 창 숨김 (백그라운드 실행)
    uac_admin=True,     # 항상 관리자 권한으로 실행
    disable_windowed_traceback=False,
    target_arch=None,
    codesign_identity=None,
    entitlements_file=None,
    icon=None,
)

coll = COLLECT(
    exe,
    a.binaries,
    a.zipfiles,
    a.datas,
    strip=False,
    upx=True,
    upx_exclude=[],
    name='ColorDock',
)
