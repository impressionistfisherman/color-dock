import os
import sys
import time
import ctypes
import requests
import json
import threading
import math
import socket
import struct
import urllib3
urllib3.disable_warnings(urllib3.exceptions.InsecureRequestWarning)
from flask import Flask, jsonify, request, send_from_directory

try:
    import win32gui
    import win32ui
    import win32con
    import win32api
    import pythoncom
    HAS_WIN32 = True
except ImportError:
    HAS_WIN32 = False

app = Flask(__name__, static_folder='public')

# 50 Manufacturers SDK Status Map (44 + 3 Smart IoT + 3 Chinese Brands)
sdk_status = {
    "asus": "Demo", "msi": "Demo", "gigabyte": "Demo", "asrock": "Demo", "biostar": "Demo",
    "evga": "Demo", "nzxt": "Demo", "nvidia": "Demo", "amd": "Demo", "zotac": "Demo",
    "colorful": "Demo", "pny": "Demo", "inno3d": "Demo", "galax": "Demo", "palit": "Demo",
    "gainward": "Demo", "sapphire": "Demo", "powercolor": "Demo", "xfx": "Demo", "samsung": "Demo",
    "skhynix": "Demo", "micron": "Demo", "gskill": "Demo", "corsair": "Demo", "kingston": "Demo",
    "teamgroup": "Demo", "adata": "Demo", "geil": "Demo", "klevv": "Demo", "crucial": "Demo",
    "oloy": "Demo", "razer": "Demo", "logitech": "Demo", "steelseries": "Demo", "roccat": "Demo",
    "hyperx": "Demo", "glorious": "Demo", "keychron": "Demo", "wooting": "Demo", "alienware": "Demo",
    "hp": "Demo", "lenovo": "Demo", "via_qmk": "Demo", "thermaltake": "Demo",
    "philips_hue": "Demo", "nanoleaf": "Demo", "govee": "Demo",
    "aula": "Demo", "vgn": "Demo", "vxe": "Demo",
    "steelseries": "Demo", "openrgb": "Demo", "wled": "Demo",
    "lianli": "Demo", "coolermaster": "Demo",
    "mountain": "Demo", "endgamegear": "Demo", "fnatic": "Demo",
    "redragon": "Demo", "ducky": "Demo", "phanteks": "Demo",
    "deepcool": "Demo", "ekwb": "Demo", "lifx": "Demo",
    "yeelight": "Demo", "elgato": "Demo", "secretlab": "Demo",
    "monsgeek": "Demo", "akko": "Demo", "epomaker": "Demo",
    "nuphy": "Demo", "zsa": "Demo", "drop": "Demo",
    "gmmk": "Demo", "owlab": "Demo", "mode": "Demo",
    "kbd67": "Demo", "qk": "Demo", "cannonkeys": "Demo",
    "id75": "Demo", "cftkb": "Demo"
}

device_states = {}
device_modes = {}  # dev_id -> "sync" / "independent" / "disabled"

state_lock = threading.RLock()
breath_base_color = (0, 180, 255)
eff_hue = 0.0

DYNAMIC_EFFECTS = {"rainbow", "breathing", "wave", "strobe", "sensor", "ambient", "game"}

# Hardware sensors variables
cpu_load = 0.0
ram_load = 0.0
cpu_temp = 42.0
active_mode = "static"

# Threads control flags
sensor_thread_running = True
screen_thread_running = True
lol_thread_running = True
lighting_thread_running = True

# Screen capture average color
screen_ambient_color = (0, 180, 255)

# Game events state
game_event_active = None # "death", "kill", or None
game_event_end_time = 0.0
game_ult_ready = False

# Try importing hidapi for VIA/QMK USB HID communication
try:
    import hid
    HAS_HID = True
except ImportError:
    hid = None
    HAS_HID = False

# Known RGB-device vendor IDs for smart USB detection
_RGB_VID_BRANDS = {
    0x1B1C: "Corsair",
    0x046D: "Logitech",
    0x1532: "Razer",
    0x1038: "SteelSeries",
    0x0B05: "ASUS ROG",
    0x1E71: "NZXT",
    0x0CF2: "Lian Li",
    0x2516: "Cooler Master",
    0x0951: "Kingston / HyperX",
    0x03EB: "Elgato",
    0x04D9: "Ducky",
    0x320F: "EVGA",
    0x1044: "Gigabyte",
    0x0DB0: "MSI",
    0x1462: "MSI",
    0x0D8C: "Creative Labs",
    0x054C: "Sony",
    0x045E: "Microsoft",
    0x0483: "STMicroelectronics (DIY)",
    0x1209: "Generic Open-Source RGB",
    0x16C0: "Teensy / DIY",
    0x04F2: "Chicony (OEM Keyboard)",
    0x258A: "Sinowealth (RGB Keyboard)",
    0x3633: "Xtrfy",
    0x195D: "Roccat",
    0x1D57: "Xenta / Noname RGB",
    0x04B4: "Cypress / Wooting",
    0x0C45: "Sonix (RGB Controller)",
}

# Try importing win32com for ASUS Aura COM
try:
    import win32com.client
    HAS_WIN32COM = True
except ImportError:
    win32com = None
    HAS_WIN32COM = False


# --- 1. ASUS Aura SDK ---
class AsusAuraController:
    def __init__(self):
        self.sdk = None
        self.connected = False
        if HAS_WIN32COM:
            try:
                self.sdk = win32com.client.Dispatch("aura.sdk.1")
                self.sdk.SwitchMode()
                self.connected = True
                sdk_status["asus"] = "Connected"
                print("ASUS Aura SDK connected.")
            except Exception as e:
                print(f"ASUS Aura SDK COM dispatch failed: {e}")

    def get_devices(self):
        if not self.connected or not self.sdk:
            return []
        devices = []
        try:
            for i, dev in enumerate(self.sdk.devices):
                devices.append({
                    "id": f"asus_{i}",
                    "name": dev.Name,
                    "manufacturer": "ASUS",
                    "type": "Motherboard" if dev.Type == 0x10000 else "GPU",
                    "led_count": len(dev.Lights),
                    "leds": [{"r": 0, "g": 180, "b": 255} for _ in dev.Lights]
                })
        except Exception:
            pass
        return devices

    def set_color(self, dev_idx, r, g, b):
        if not self.connected or not self.sdk:
            return
        try:
            dev = self.sdk.devices[dev_idx]
            bgr_color = (b << 16) | (g << 8) | r
            for light in dev.Lights:
                light.Color = bgr_color
            self.sdk.Apply()
        except Exception:
            pass

    def set_led_colors(self, dev_idx, colors_list):
        if not self.connected or not self.sdk:
            return
        try:
            dev = self.sdk.devices[dev_idx]
            for i, light in enumerate(dev.Lights):
                if i < len(colors_list):
                    r, g, b = colors_list[i]
                    light.Color = (b << 16) | (g << 8) | r
            self.sdk.Apply()
        except Exception:
            pass


# --- 2. Corsair CUESDK ---
class CorsairController:
    def __init__(self):
        self.dll = None
        self.connected = False
        dll_paths = [
            "C:\\Program Files\\Corsair\\Corsair Utility Engine\\CUESDK.x64_2015.dll",
            "C:\\Program Files\\Corsair\\iCUE5 Software\\CUESDK.x64_2015.dll",
            "./CUESDK.x64_2015.dll", "./CUESDK.dll"
        ]
        for path in dll_paths:
            if os.path.exists(path):
                try:
                    self.dll = ctypes.windll.LoadLibrary(path)
                    break
                except Exception:
                    pass
        if self.dll:
            try:
                self.dll.CorsairPerformProtocolHandshake.restype = ctypes.c_void_p
                self.dll.CorsairPerformProtocolHandshake()
                self.dll.CorsairRequestControl.argtypes = [ctypes.c_int]
                self.dll.CorsairRequestControl.restype = ctypes.c_bool
                self.dll.CorsairRequestControl(1)
                self.connected = True
                sdk_status["corsair"] = "Connected"
                print("Corsair iCUE SDK connected.")
            except Exception:
                pass

    def get_devices(self):
        if not self.connected:
            return []
        return [{
            "id": "corsair_0",
            "name": "Corsair Vengeance PRO DDR5 RAM",
            "manufacturer": "Corsair",
            "type": "RAM",
            "led_count": 20,
            "leds": [{"r": 0, "g": 180, "b": 255} for _ in range(20)]
        }]

    def set_color(self, dev_idx, r, g, b):
        pass


# --- 3. MSI Mystic Light ---
class MsiController:
    def __init__(self):
        self.dll = None
        self.connected = False
        dll_paths = [
            "C:\\Program Files\\MSI\\Center\\MysticLight\\MysticLight_SDK.dll",
            "./MysticLight_SDK.dll"
        ]
        for path in dll_paths:
            if os.path.exists(path):
                try:
                    self.dll = ctypes.windll.LoadLibrary(path)
                    break
                except Exception:
                    pass
        if self.dll:
            try:
                self.dll.MLAPI_Initialize.restype = ctypes.c_int
                if self.dll.MLAPI_Initialize() == 0:
                    self.connected = True
                    sdk_status["msi"] = "Connected"
                    print("MSI Mystic Light SDK connected.")
            except Exception:
                pass

    def get_devices(self):
        if not self.connected:
            return []
        return [{
            "id": "msi_0",
            "name": "MSI MPG Carbon Motherboard",
            "manufacturer": "MSI",
            "type": "Motherboard",
            "led_count": 12,
            "leds": [{"r": 0, "g": 180, "b": 255} for _ in range(12)]
        }]

    def set_color(self, dev_idx, r, g, b):
        if not self.connected or not self.dll:
            return
        try:
            self.dll.MLAPI_SetLedColor(dev_idx, 0, r, g, b)
        except Exception:
            pass


# --- 4. Logitech G HUB ---
class LogitechController:
    def __init__(self):
        self.dll = None
        self.connected = False
        dll_paths = [
            "C:\\Program Files\\LGHUB\\depots\\LogitechLedEnginesWrapper.dll",
            "C:\\Windows\\System32\\LogitechLedEnginesWrapper.dll",
            "./LogitechLedEnginesWrapper.dll"
        ]
        for path in dll_paths:
            if os.path.exists(path):
                try:
                    self.dll = ctypes.cdll.LoadLibrary(path)
                    break
                except Exception:
                    pass
        if self.dll:
            try:
                self.dll.LogiLedInit.restype = ctypes.c_bool
                if self.dll.LogiLedInit():
                    self.connected = True
                    sdk_status["logitech"] = "Connected"
                    print("Logitech G HUB SDK connected.")
            except Exception:
                pass

    def get_devices(self):
        if not self.connected:
            return []
        return [{
            "id": "logitech_0",
            "name": "Logitech G915 LIGHTSPEED Keyboard",
            "manufacturer": "Logitech",
            "type": "Keyboard",
            "led_count": 80,
            "leds": [{"r": 0, "g": 180, "b": 255} for _ in range(80)]
        }]

    def set_color(self, r, g, b):
        if not self.connected or not self.dll:
            return
        try:
            rp, gp, bp = int((r / 255.0) * 100), int((g / 255.0) * 100), int((b / 255.0) * 100)
            self.dll.LogiLedSetLighting(rp, gp, bp)
        except Exception:
            pass

    def shutdown(self):
        if self.connected and self.dll:
            try:
                self.dll.LogiLedShutdown()
            except Exception:
                pass


# --- 5. Razer Chroma REST API ---
class RazerController:
    def __init__(self):
        self.session_url = None
        self.connected = False
        self.stop_heartbeat = threading.Event()
        self.heartbeat_thread = None
        try:
            url = "http://localhost:3546/ChromaSDK"
            payload = {
                "title": "ColorDock",
                "description": "Unified RGB controller app",
                "author": {"name": "ColorDock Team", "contact": "https://github.com/colordock"},
                "device_supported": ["keyboard", "mouse", "mousepad", "keypad", "headset", "chromalink"],
                "category": "application"
            }
            res = requests.post(url, json=payload, headers={"Content-Type": "application/json"}, timeout=1.0)
            if res.status_code == 200:
                self.session_url = res.json().get("uri")
                self.connected = True
                sdk_status["razer"] = "Connected"
                print("Razer Chroma SDK connected.")
                self.heartbeat_thread = threading.Thread(target=self._run_heartbeat, daemon=True)
                self.heartbeat_thread.start()
        except Exception as e:
            print(f"Razer Chroma SDK not active: {e}")

    def _run_heartbeat(self):
        while not self.stop_heartbeat.is_set():
            try:
                if self.session_url:
                    requests.put(f"{self.session_url}/heartbeat", timeout=1.0)
            except Exception:
                pass
            time.sleep(1.0)

    def get_devices(self):
        if not self.connected:
            return []
        return [{
            "id": "razer_0",
            "name": "Razer DeathAdder V3 Pro Mouse",
            "manufacturer": "Razer",
            "type": "Mouse",
            "led_count": 2,
            "leds": [{"r": 0, "g": 180, "b": 255} for _ in range(2)]
        }]

    def set_color(self, r, g, b):
        if not self.connected or not self.session_url:
            return
        try:
            color_val = r | (g << 8) | (b << 16)
            requests.put(f"{self.session_url}/mouse", json={"effect": "CHROMA_STATIC", "param": {"color": color_val}}, timeout=1.0)
        except Exception:
            pass

    def shutdown(self):
        self.stop_heartbeat.set()
        if self.connected and self.session_url:
            try:
                requests.delete(self.session_url, timeout=1.0)
            except Exception:
                pass


# --- 6. VIA / QMK RAW USB HID Sync ---
# Known VIA/QMK vendor IDs for popular boards
VIA_QMK_KNOWN_VIDS = {
    0x3434: "Keychron",    0x3297: "ZSA",         0x320F: "GMMK",
    0x04D8: "Drop",        0x6582: "Drop Alt",     0x4B50: "Akko",
    0x3256: "Epomaker",    0x3538: "MonsGeek",     0x3A27: "NuPhy",
    0x0483: "STM32",       0x03EB: "Atmel",        0x16C0: "QMK Generic",
    0xFEED: "QMK Generic", 0x2A8A: "YMDK",         0x5052: "OLKB",
    0x6060: "Boardsource", 0x1209: "pid.codes",    0x046A: "Cherry",
    0x7C5B: "Cannonkeys",  0x3636: "ID75",         0x4F42: "QK",
    0x4B4D: "KBDfans",     0x2F56: "OwlLab",       0x5555: "CFTKB",
    0x3535: "Keebs",       0x6D77: "Mode Designs",
}

class ViaQmkController:
    def __init__(self):
        self.device = None
        self.connected = False
        self.detected_brand = "VIA/QMK"
        if HAS_HID:
            try:
                for device_info in hid.enumerate():
                    vid = device_info.get('vendor_id', 0)
                    usage_page = device_info.get('usage_page', 0)
                    usage = device_info.get('usage', 0)
                    is_via = (usage_page == 0xFF60 or usage == 0x61)
                    is_known_vid = vid in VIA_QMK_KNOWN_VIDS
                    if is_via or is_known_vid:
                        self.device = hid.device()
                        self.device.open_path(device_info['path'])
                        self.connected = True
                        self.detected_brand = VIA_QMK_KNOWN_VIDS.get(vid, "VIA/QMK")
                        sdk_status["via_qmk"] = "Connected"
                        print(f"VIA/QMK keyboard connected: {device_info.get('product_string', self.detected_brand)}")
                        break
            except Exception as e:
                print(f"Failed to open VIA/QMK device: {e}")

    def get_devices(self):
        if not self.connected or not self.device:
            return []
        return [{
            "id": "via_qmk_0",
            "name": f"{self.detected_brand} VIA/QMK Keyboard",
            "manufacturer": "VIA_QMK",
            "type": "Keyboard",
            "led_count": 68,
            "leds": [{"r": 0, "g": 180, "b": 255} for _ in range(68)]
        }]

    def set_color(self, r, g, b):
        if not self.connected or not self.device:
            return
        try:
            packet = [0x00, 0x07, r, g, b]
            packet += [0] * (32 - len(packet))
            self.device.write(packet)
        except Exception as e:
            print(f"Failed writing RAW HID color: {e}")

    def set_led_colors(self, colors_list):
        if not self.connected or not self.device:
            return
        try:
            # Send individual matrix LED colors (batch packet or key lighting command)
            # Custom QMK firmware endpoint wrapper
            packet = [0x00, 0x08, len(colors_list)]
            for c in colors_list[:9]: # Fit up to 9 RGB nodes per 32-byte packet
                packet.extend([c[0], c[1], c[2]])
            packet += [0] * (32 - len(packet))
            self.device.write(packet)
        except Exception:
            pass


# --- 6.2. Philips Hue Controller ---
def rgb_to_xy(r, g, b):
    # Normalize RGB values
    r_n = r / 255.0
    g_n = g / 255.0
    b_n = b / 255.0

    # Apply gamma correction
    r_c = ((r_n + 0.055) / 1.055) ** 2.4 if r_n > 0.04045 else r_n / 12.92
    g_c = ((g_n + 0.055) / 1.055) ** 2.4 if g_n > 0.04045 else g_n / 12.92
    b_c = ((b_n + 0.055) / 1.055) ** 2.4 if b_n > 0.04045 else b_n / 12.92

    # Convert to XYZ
    X = r_c * 0.4124 + g_c * 0.3576 + b_c * 0.1805
    Y = r_c * 0.2126 + g_c * 0.7152 + b_c * 0.0722
    Z = r_c * 0.0193 + g_c * 0.1192 + b_c * 0.9505

    # Convert to xy
    sum_XYZ = X + Y + Z
    if sum_XYZ == 0:
        return [0.0, 0.0], 0
    x = X / sum_XYZ
    y = Y / sum_XYZ
    
    # Y is the brightness (0.0 to 1.0). Convert Y to Hue brightness (0 to 254)
    bri = int(Y * 254)
    bri = max(1, min(254, bri))

    return [round(x, 4), round(y, 4)], bri


class PhilipsHueController:
    def __init__(self):
        self.connected = False
        self.bridge_ip = None
        self.username = None
        self.light_ids = []
        self.config_path = os.path.join(os.path.dirname(__file__), "hue_config.json")
        threading.Thread(target=self._discover_and_auth, daemon=True).start()
        sdk_status["philips_hue"] = "Demo"

    def _discover_and_auth(self):
        try:
            res = requests.get("https://discovery.meethue.com/", timeout=2.0)
            if res.status_code == 200:
                bridges = res.json()
                if bridges:
                    self.bridge_ip = bridges[0].get("internalipaddress")
                    print(f"[Philips Hue] Discovered bridge at {self.bridge_ip}")
        except Exception as e:
            print(f"[Philips Hue] Discovery failed: {e}")

        if not self.bridge_ip:
            # Fallback scan of common IPs
            for ip in ["192.168.1.100", "192.168.0.100", "192.168.1.50", "192.168.0.50"]:
                try:
                    res = requests.get(f"http://{ip}/description.xml", timeout=0.5)
                    if "Philips hue" in res.text:
                        self.bridge_ip = ip
                        print(f"[Philips Hue] Discovered bridge locally at {self.bridge_ip}")
                        break
                except Exception:
                    pass

        if not self.bridge_ip:
            return

        # Load auth config
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, 'r') as f:
                    config = json.load(f)
                    self.username = config.get("username")
            except Exception:
                pass

        # Try to register user if not configured
        retries = 0
        while not self.username and retries < 12:  # Try for 1 minute
            try:
                url = f"http://{self.bridge_ip}/api"
                res = requests.post(url, json={"devicetype": "colordock_app"}, timeout=2.0)
                res_data = res.json()
                if isinstance(res_data, list) and len(res_data) > 0:
                    item = res_data[0]
                    if "success" in item:
                        self.username = item["success"]["username"]
                        with open(self.config_path, 'w') as f:
                            json.dump({"username": self.username}, f)
                        print(f"[Philips Hue] Registered new user: {self.username}")
                        break
                    elif "error" in item:
                        desc = item["error"].get("description", "")
                        print(f"[Philips Hue] Registration pending: {desc}. Please press Hue Bridge Link button.")
            except Exception as e:
                print(f"[Philips Hue] Registration error: {e}")
            retries += 1
            time.sleep(5.0)

        if not self.username:
            print("[Philips Hue] Username not configured and registration timed out.")
            return

        self.update_lights()

    def update_lights(self):
        if not self.bridge_ip or not self.username:
            return
        try:
            url = f"http://{self.bridge_ip}/api/{self.username}/lights"
            res = requests.get(url, timeout=2.0)
            if res.status_code == 200:
                lights_data = res.json()
                if isinstance(lights_data, dict):
                    self.light_ids = sorted(list(lights_data.keys()), key=int)
                    self.connected = True
                    sdk_status["philips_hue"] = "Connected"
                    print(f"[Philips Hue] Connected. Found lights: {self.light_ids}")
                    
                    # Update active device dynamically
                    dev = {
                        "id": "philips_hue_0",
                        "name": "Philips Hue Play Lightbar" if len(self.light_ids) <= 2 else "Philips Hue Bridge System",
                        "manufacturer": "Philips_Hue",
                        "type": "Smart Light",
                        "led_count": len(self.light_ids),
                        "leds": [{"r": 0, "g": 180, "b": 255} for _ in range(len(self.light_ids))],
                        "lightbar_layout": len(self.light_ids) <= 2
                    }
                    device_states["philips_hue_0"] = dev
                    if "philips_hue_demo" in device_states:
                        del device_states["philips_hue_demo"]
        except Exception as e:
            print(f"[Philips Hue] Failed to update lights: {e}")

    def get_devices(self):
        if not self.connected:
            return []
        return [device_states.get("philips_hue_0")]

    def set_color(self, r, g, b):
        if not self.connected or not self.bridge_ip or not self.username:
            return
        xy, bri = rgb_to_xy(r, g, b)
        on_state = (r > 0 or g > 0 or b > 0)
        threading.Thread(target=self._set_color_async, args=(xy, bri, on_state), daemon=True).start()

    def _set_color_async(self, xy, bri, on_state):
        for l_id in self.light_ids:
            try:
                url = f"http://{self.bridge_ip}/api/{self.username}/lights/{l_id}/state"
                payload = {"on": on_state}
                if on_state:
                    payload["xy"] = xy
                    payload["bri"] = bri
                requests.put(url, json=payload, timeout=1.0)
            except Exception:
                pass

    def set_led_colors(self, colors_list):
        if not self.connected or not self.bridge_ip or not self.username:
            return
        threading.Thread(target=self._set_led_colors_async, args=(colors_list,), daemon=True).start()

    def _set_led_colors_async(self, colors_list):
        for i, l_id in enumerate(self.light_ids):
            if i >= len(colors_list):
                break
            r, g, b = colors_list[i]
            xy, bri = rgb_to_xy(r, g, b)
            on_state = (r > 0 or g > 0 or b > 0)
            try:
                url = f"http://{self.bridge_ip}/api/{self.username}/lights/{l_id}/state"
                payload = {"on": on_state}
                if on_state:
                    payload["xy"] = xy
                    payload["bri"] = bri
                requests.put(url, json=payload, timeout=1.0)
            except Exception:
                pass


# --- 6.3. Nanoleaf Controller ---
class NanoleafController:
    def __init__(self):
        self.connected = False
        self.ip = None
        self.auth_token = None
        self.panels_list = []
        self.config_path = os.path.join(os.path.dirname(__file__), "nanoleaf_config.json")
        self.ext_control_enabled = False
        self.udp_sock = None
        threading.Thread(target=self._discover_and_auth, daemon=True).start()
        sdk_status["nanoleaf"] = "Demo"

    def _discover_and_auth(self):
        import socket
        try:
            msg = (
                'M-SEARCH * HTTP/1.1\r\n'
                'HOST: 239.255.255.250:1900\r\n'
                'MAN: "ssdp:discover"\r\n'
                'MX: 2\r\n'
                'ST: nanoleaf_aurora:api\r\n\r\n'
            )
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.settimeout(2.0)
            sock.sendto(msg.encode('utf-8'), ('239.255.255.250', 1900))
            data, addr = sock.recvfrom(1024)
            self.ip = addr[0]
            print(f"[Nanoleaf] Discovered panel at {self.ip}")
        except Exception as e:
            print(f"[Nanoleaf] Discovery failed: {e}")

        if not self.ip:
            # Fallback scan of common IPs
            for ip in ["192.168.1.150", "192.168.0.150", "192.168.1.80", "192.168.0.80"]:
                try:
                    res = requests.get(f"http://{ip}:16021/api/v1", timeout=0.5)
                    if res.status_code in [401, 200, 404]:
                        self.ip = ip
                        print(f"[Nanoleaf] Discovered panel locally at {self.ip}")
                        break
                except Exception:
                    pass

        if not self.ip:
            return

        # Load auth config
        if os.path.exists(self.config_path):
            try:
                with open(self.config_path, 'r') as f:
                    config = json.load(f)
                    self.auth_token = config.get("auth_token")
            except Exception:
                pass

        # Try to register if not configured
        retries = 0
        while not self.auth_token and retries < 12:  # Try for 1 minute
            try:
                url = f"http://{self.ip}:16021/api/v1/new"
                res = requests.post(url, timeout=2.0)
                if res.status_code == 200:
                    self.auth_token = res.json().get("auth_token")
                    with open(self.config_path, 'w') as f:
                        json.dump({"auth_token": self.auth_token}, f)
                    print(f"[Nanoleaf] Registered auth token: {self.auth_token}")
                    break
                else:
                    print("[Nanoleaf] Registration pending: Please hold power button on Nanoleaf controller for 5-7 seconds until LED flashes.")
            except Exception as e:
                print(f"[Nanoleaf] Registration error: {e}")
            retries += 1
            time.sleep(5.0)

        if not self.auth_token:
            print("[Nanoleaf] Auth token not configured and registration timed out.")
            return

        self.update_layout()

    def update_layout(self):
        if not self.ip or not self.auth_token:
            return
        try:
            url = f"http://{self.ip}:16021/api/v1/{self.auth_token}"
            res = requests.get(url, timeout=3.0)
            if res.status_code == 200:
                device_data = res.json()
                layout = device_data.get("panelLayout", {}).get("layout", {})
                position_data = layout.get("positionData", [])
                
                if position_data:
                    raw_panels = []
                    for p in position_data:
                        raw_panels.append({
                            "id": p.get("panelId"),
                            "x": p.get("x"),
                            "y": p.get("y")
                        })
                    
                    xs = [p["x"] for p in raw_panels]
                    ys = [p["y"] for p in raw_panels]
                    
                    min_x, max_x = min(xs) if xs else 0, max(xs) if xs else 1
                    min_y, max_y = min(ys) if ys else 0, max(ys) if ys else 1
                    
                    range_x = (max_x - min_x) if max_x != min_x else 1
                    range_y = (max_y - min_y) if max_y != min_y else 1
                    
                    self.panels_list = []
                    for i, p in enumerate(raw_panels):
                        norm_x = 30 + ((p["x"] - min_x) / range_x) * 260
                        norm_y = 170 - ((p["y"] - min_y) / range_y) * 140
                        self.panels_list.append({
                            "id": p["id"],
                            "index": i,
                            "x": int(round(norm_x)),
                            "y": int(round(norm_y))
                        })
                    
                    self.panels_list.sort(key=lambda p: (p["y"], p["x"]))
                    for idx, p in enumerate(self.panels_list):
                        p["index"] = idx
                    
                    self.connected = True
                    sdk_status["nanoleaf"] = "Connected"
                    print(f"[Nanoleaf] Connected. Found {len(self.panels_list)} panels.")
                    
                    dev = {
                        "id": "nanoleaf_0",
                        "name": device_data.get("name", "Nanoleaf Shapes Hexagons"),
                        "manufacturer": "Nanoleaf",
                        "type": "Smart Light",
                        "led_count": len(self.panels_list),
                        "leds": [{"r": 0, "g": 180, "b": 255} for _ in range(len(self.panels_list))],
                        "panels": [{"id": p["index"], "x": p["x"], "y": p["y"]} for p in self.panels_list]
                    }
                    device_states["nanoleaf_0"] = dev
                    if "nanoleaf_demo" in device_states:
                        del device_states["nanoleaf_demo"]
        except Exception as e:
            print(f"[Nanoleaf] Failed to load layout: {e}")

    def get_devices(self):
        if not self.connected:
            return []
        return [device_states.get("nanoleaf_0")]

    def _enable_ext_control(self):
        if self.ext_control_enabled and self.udp_sock:
            return True
        try:
            import socket
            url = f"http://{self.ip}:16021/api/v1/{self.auth_token}/effects"
            payload = {
                "write": {
                    "command": "display",
                    "animType": "extControl",
                    "extControlVersion": "v2"
                }
            }
            res = requests.put(url, json=payload, timeout=2.0)
            if res.status_code == 200:
                self.udp_sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                self.ext_control_enabled = True
                return True
        except Exception as e:
            print(f"[Nanoleaf] Failed to enable extControl: {e}")
            self.ext_control_enabled = False
        return False

    def set_color(self, r, g, b):
        if not self.connected or not self.ip or not self.auth_token:
            return
        if self._enable_ext_control():
            colors_list = [(r, g, b) for _ in self.panels_list]
            self.set_led_colors(colors_list)

    def set_led_colors(self, colors_list):
        if not self.connected or not self.ip or not self.auth_token:
            return
        if not self._enable_ext_control():
            return
        try:
            import struct
            num_panels = len(self.panels_list)
            packet = struct.pack(">H", num_panels)
            for i, panel in enumerate(self.panels_list):
                if i >= len(colors_list):
                    break
                r, g, b = colors_list[i]
                panel_data = struct.pack(">HBBBBH", panel["id"], r, g, b, 0, 1)
                packet += panel_data
            self.udp_sock.sendto(packet, (self.ip, 50222))
        except Exception as e:
            print(f"[Nanoleaf] UDP send failed: {e}")
            self.ext_control_enabled = False


# --- 6.4. Govee Controller ---
class GoveeController:
    def __init__(self):
        self.connected = False
        self.devices_found = []
        threading.Thread(target=self._discover, daemon=True).start()
        sdk_status["govee"] = "Demo"

    def _discover(self):
        import socket
        try:
            sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
            sock.settimeout(2.0)
            scan_msg = json.dumps({"msg":{"cmd":"scan","data":{"account_topic":"reserve"}}})
            sock.sendto(scan_msg.encode('utf-8'), ('239.255.255.250', 4001))
            
            while True:
                data, addr = sock.recvfrom(2048)
                resp = json.loads(data.decode('utf-8'))
                if 'msg' in resp and resp['msg'].get('cmd') == 'scan':
                    device_info = resp['msg']['data']
                    self.devices_found.append({
                        "ip": addr[0],
                        "sku": device_info.get("sku"),
                        "device": device_info.get("device")
                    })
                    print(f"[Govee] Discovered device {device_info.get('sku')} at {addr[0]}")
                    
                    self.connected = True
                    sdk_status["govee"] = "Connected"
                    dev = {
                        "id": "govee_0",
                        "name": f"Govee {device_info.get('sku', 'Neon Rope')} (Connected)",
                        "manufacturer": "Govee",
                        "type": "Smart Light",
                        "led_count": 24,
                        "leds": [{"r": 0, "g": 180, "b": 255} for _ in range(24)],
                        "rope_layout": [
                            {"index": i, "x": float(round(30 + (i / 23.0) * 340, 1)), "y": float(round(70 + 45 * math.sin((i / 23.0) * math.pi * 3), 1))}
                            for i in range(24)
                        ]
                    }
                    device_states["govee_0"] = dev
                    if "govee_demo" in device_states:
                        del device_states["govee_demo"]
        except Exception:
            pass

    def get_devices(self):
        if not self.connected:
            return []
        return [device_states.get("govee_0")]

    def set_color(self, r, g, b):
        if self.devices_found:
            import socket
            for dev in self.devices_found:
                try:
                    sock = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
                    cmd = {
                        "msg": {
                            "cmd": "colorWC",
                            "data": {
                                "color": {"r": r, "g": g, "b": b},
                                "colorTemInKelvin": 0
                            }
                        }
                    }
                    sock.sendto(json.dumps(cmd).encode('utf-8'), (dev["ip"], 4003))
                except Exception:
                    pass

    def set_led_colors(self, colors_list):
        if colors_list:
            r = int(sum(c[0] for c in colors_list) / len(colors_list))
            g = int(sum(c[1] for c in colors_list) / len(colors_list))
            b = int(sum(c[2] for c in colors_list) / len(colors_list))
            self.set_color(r, g, b)


# --- 6.5. Custom HID Controller ---
class CustomHidController:
    def __init__(self, dev_info):
        self.device = None
        self.connected = False
        self.info = dev_info
        if HAS_HID:
            try:
                self.device = hid.device()
                vid = int(dev_info["vendor_id"], 16) if isinstance(dev_info["vendor_id"], str) and dev_info["vendor_id"].startswith("0x") else int(dev_info["vendor_id"])
                pid = int(dev_info["product_id"], 16) if isinstance(dev_info["product_id"], str) and dev_info["product_id"].startswith("0x") else int(dev_info["product_id"])
                self.device.open(vid, pid)
                self.connected = True
                sdk_status[dev_info["id"]] = "Connected"
                print(f"Custom HID Device connected: {dev_info['name']}")
            except Exception as e:
                print(f"Failed to open Custom HID device {dev_info['name']}: {e}")

    def get_devices(self):
        if not self.connected or not self.device:
            return []
        return [{
            "id": self.info["id"],
            "name": self.info["name"],
            "manufacturer": self.info.get("manufacturer", "Custom"),
            "type": self.info["type"],
            "led_count": self.info["led_count"],
            "leds": [{"r": 0, "g": 180, "b": 255} for _ in range(self.info["led_count"])]
        }]

    def set_color(self, r, g, b):
        if not self.connected or not self.device:
            return
        try:
            packet = [0x00, 0x07, r, g, b]
            packet += [0] * (32 - len(packet))
            self.device.write(packet)
        except Exception:
            pass

    def set_led_colors(self, colors_list):
        if not self.connected or not self.device:
            return
        try:
            packet = [0x00, 0x08, len(colors_list)]
            for c in colors_list[:9]:
                packet.extend([c[0], c[1], c[2]])
            packet += [0] * (32 - len(packet))
            self.device.write(packet)
        except Exception:
            pass


# --- 6.6. Aula Controller ---
class AulaController:
    def __init__(self):
        self.device = None
        self.connected = False
        if HAS_HID:
            try:
                for device_info in hid.enumerate():
                    vid = device_info.get('vendor_id')
                    p_str = str(device_info.get('product_string', '')).lower()
                    m_str = str(device_info.get('manufacturer_string', '')).lower()
                    
                    if vid == 0x258A or "aula" in p_str or "aula" in m_str:
                        self.device = hid.device()
                        self.device.open_path(device_info['path'])
                        self.connected = True
                        sdk_status["aula"] = "Connected"
                        print(f"Aula hardware keyboard connected: {device_info.get('product_string')}")
                        break
            except Exception as e:
                print(f"Failed to open Aula device: {e}")
                
    def get_devices(self):
        if not self.connected or not self.device:
            return []
        return [{
            "id": "aula_0",
            "name": "Aula F87 TKL Keyboard",
            "manufacturer": "Aula",
            "type": "Keyboard",
            "led_count": 87,
            "leds": [{"r": 0, "g": 180, "b": 255} for _ in range(87)]
        }]
        
    def set_color(self, r, g, b):
        if not self.connected or not self.device:
            return
        try:
            packet = [0x00, 0x07, r, g, b]
            packet += [0] * (32 - len(packet))
            self.device.write(packet)
        except Exception:
            pass

    def set_led_colors(self, colors_list):
        if not self.connected or not self.device:
            return
        try:
            packet = [0x00, 0x08, len(colors_list)]
            for c in colors_list[:9]:
                packet.extend([c[0], c[1], c[2]])
            packet += [0] * (32 - len(packet))
            self.device.write(packet)
        except Exception:
            pass


# --- 6.7. VGN Controller ---
class VgnController:
    def __init__(self):
        self.device = None
        self.connected = False
        if HAS_HID:
            try:
                for device_info in hid.enumerate():
                    vid = device_info.get('vendor_id')
                    p_str = str(device_info.get('product_string', '')).lower()
                    m_str = str(device_info.get('manufacturer_string', '')).lower()
                    
                    if vid in [0x342D, 0x30FA] or "vgn" in p_str or "vgn" in m_str:
                        self.device = hid.device()
                        self.device.open_path(device_info['path'])
                        self.connected = True
                        sdk_status["vgn"] = "Connected"
                        print(f"VGN device connected: {device_info.get('product_string')}")
                        break
            except Exception as e:
                print(f"Failed to open VGN device: {e}")
                
    def get_devices(self):
        if not self.connected or not self.device:
            return []
        return [{
            "id": "vgn_0",
            "name": "VGN Dragonfly F1 Pro Mouse",
            "manufacturer": "VGN",
            "type": "Mouse",
            "led_count": 12,
            "leds": [{"r": 0, "g": 180, "b": 255} for _ in range(12)]
        }]
        
    def set_color(self, r, g, b):
        if not self.connected or not self.device:
            return
        try:
            packet = [0x00, 0x07, r, g, b]
            packet += [0] * (32 - len(packet))
            self.device.write(packet)
        except Exception:
            pass

    def set_led_colors(self, colors_list):
        if not self.connected or not self.device:
            return
        try:
            packet = [0x00, 0x08, len(colors_list)]
            for c in colors_list[:9]:
                packet.extend([c[0], c[1], c[2]])
            packet += [0] * (32 - len(packet))
            self.device.write(packet)
        except Exception:
            pass


# --- 6.8. VXE Controller ---
class VxeController:
    def __init__(self):
        self.device = None
        self.connected = False
        if HAS_HID:
            try:
                for device_info in hid.enumerate():
                    vid = device_info.get('vendor_id')
                    p_str = str(device_info.get('product_string', '')).lower()
                    m_str = str(device_info.get('manufacturer_string', '')).lower()
                    
                    if vid in [0x342D, 0x30FA] or "vxe" in p_str or "vxe" in m_str:
                        self.device = hid.device()
                        self.device.open_path(device_info['path'])
                        self.connected = True
                        sdk_status["vxe"] = "Connected"
                        print(f"VXE device connected: {device_info.get('product_string')}")
                        break
            except Exception as e:
                print(f"Failed to open VXE device: {e}")
                
    def get_devices(self):
        if not self.connected or not self.device:
            return []
        return [{
            "id": "vxe_0",
            "name": "VXE Dragonfly R1 Mouse",
            "manufacturer": "VXE",
            "type": "Mouse",
            "led_count": 12,
            "leds": [{"r": 0, "g": 180, "b": 255} for _ in range(12)]
        }]
        
    def set_color(self, r, g, b):
        if not self.connected or not self.device:
            return
        try:
            packet = [0x00, 0x07, r, g, b]
            packet += [0] * (32 - len(packet))
            self.device.write(packet)
        except Exception:
            pass

    def set_led_colors(self, colors_list):
        if not self.connected or not self.device:
            return
        try:
            packet = [0x00, 0x08, len(colors_list)]
            for c in colors_list[:9]:
                packet.extend([c[0], c[1], c[2]])
            packet += [0] * (32 - len(packet))
            self.device.write(packet)
        except Exception:
            pass


# --- 7. SteelSeries GameSense REST API ---
class SteelSeriesController:
    def __init__(self):
        self.base_url = None
        self.connected = False
        try:
            props_path = os.path.join(
                os.environ.get("PROGRAMDATA", "C:\\ProgramData"),
                "SteelSeries", "SteelSeries Engine 3", "coreProps.json"
            )
            if os.path.exists(props_path):
                with open(props_path, "r") as f:
                    props = json.load(f)
                port = props.get("address", "127.0.0.1:51248").split(":")[-1]
                self.base_url = f"http://127.0.0.1:{port}"
                res = requests.post(f"{self.base_url}/game_metadata", json={
                    "game": "COLORDOCK", "game_display_name": "ColorDock",
                    "developer": "ColorDock"
                }, timeout=1.0)
                if res.status_code in (200, 204, 400):
                    requests.post(f"{self.base_url}/bind_game_event", json={
                        "game": "COLORDOCK", "event": "RGB_SYNC",
                        "min_value": 0, "max_value": 255,
                        "icon_id": 0,
                        "handlers": [{"device-type": "rgb-per-key-zones",
                                       "zone": "all", "color": {"red": 0, "green": 180, "blue": 255},
                                       "mode": "color"}]
                    }, timeout=1.0)
                    self.connected = True
                    sdk_status["steelseries"] = "Connected"
                    print("SteelSeries GameSense connected.")
        except Exception as e:
            print(f"SteelSeries GameSense not available: {e}")

    def get_devices(self):
        if not self.connected:
            return []
        return [{"id": "steelseries_0", "name": "SteelSeries Apex Pro", "manufacturer": "SteelSeries",
                 "type": "Keyboard", "led_count": 104, "leds": [{"r": 0, "g": 180, "b": 255} for _ in range(104)]}]

    def set_color(self, r, g, b):
        if not self.connected or not self.base_url:
            return
        try:
            requests.post(f"{self.base_url}/game_event", json={
                "game": "COLORDOCK", "event": "RGB_SYNC",
                "data": {"value": 1, "frame": {"color": {"red": r, "green": g, "blue": b}}}
            }, timeout=0.5)
        except Exception:
            pass

    def set_led_colors(self, colors_list):
        self.set_color(*colors_list[0]) if colors_list else None


# --- 8. OpenRGB TCP Protocol ---
class OpenRGBController:
    PKT_TYPE_REQUEST_CONTROLLER_COUNT = 0
    PKT_TYPE_REQUEST_CONTROLLER_DATA = 1
    PKT_TYPE_UPDATE_LEDS = 1050

    def __init__(self):
        self.sock = None
        self.connected = False
        self.controllers = []
        # 백그라운드에서 재시도 연결 (OpenRGB 시작 시간 고려)
        threading.Thread(target=self._connect_with_retry, daemon=True).start()

    def _connect_with_retry(self, retries=8, delay=2.0):
        for attempt in range(retries):
            if self._try_connect():
                return
            if attempt < retries - 1:
                print(f'[OpenRGB] retry {attempt+1}/{retries} in {delay}s...')
                time.sleep(delay)
        print('[OpenRGB] Could not connect after retries')

    def _try_connect(self):
        try:
            s = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
            s.settimeout(2.0)
            s.connect(("127.0.0.1", 6742))
            self.sock = s
            magic = b"ORGB"
            s.sendall(magic + struct.pack("<III", 0, self.PKT_TYPE_REQUEST_CONTROLLER_COUNT, 0))
            resp = self._recv_packet()
            if resp:
                count = struct.unpack("<I", resp[:4])[0]
                self.controllers = []
                for i in range(count):
                    s.sendall(magic + struct.pack("<III", i, self.PKT_TYPE_REQUEST_CONTROLLER_DATA, 0))
                    cdata = self._recv_packet()
                    if cdata:
                        name_len = struct.unpack("<H", cdata[4:6])[0]
                        name = cdata[6:6+name_len].decode("utf-8", errors="replace").rstrip("\x00")
                        self.controllers.append({"index": i, "name": name})
                self.connected = True
                sdk_status["openrgb"] = "Connected"
                print(f"[OpenRGB] Connected: {len(self.controllers)} controllers")
                self._register_devices()
                return True
        except Exception as e:
            print(f"[OpenRGB] not available: {e}")
        return False

    def _register_devices(self):
        """OpenRGB 컨트롤러를 device_states에 등록"""
        for ctrl in self.controllers:
            dev_id = f"openrgb_{ctrl['index']}"
            if dev_id not in device_states:
                device_states[dev_id] = {
                    "id": dev_id,
                    "name": ctrl['name'],
                    "manufacturer": "OpenRGB",
                    "type": "Component",
                    "led_count": 1,
                    "leds": [{"r": 0, "g": 180, "b": 255}],
                    "openrgb_source": True,
                    "openrgb_index": ctrl['index'],
                }
            # 데모 기기 제거 (실제 연결됐으므로)
            demo_key = None
            name_lower = ctrl['name'].lower()
            if 'motherboard' in name_lower or 'asus' in name_lower:
                demo_key = 'asus_mb_demo'
            elif 'ram' in name_lower or 'memory' in name_lower or 'ddr' in name_lower:
                demo_key = next((k for k in list(device_states.keys()) if 'ram_demo' in k or 'memory_demo' in k), None)
            if demo_key and demo_key in device_states:
                del device_states[demo_key]

    def _recv_packet(self):
        try:
            header = b""
            while len(header) < 16:
                chunk = self.sock.recv(16 - len(header))
                if not chunk:
                    return None
                header += chunk
            _, _, data_size = struct.unpack("<III", header[4:16])
            data = b""
            while len(data) < data_size:
                chunk = self.sock.recv(data_size - len(data))
                if not chunk:
                    return None
                data += chunk
            return data
        except Exception:
            return None

    def get_devices(self):
        if not self.connected:
            return []
        return [{"id": f"openrgb_{c['index']}", "name": c["name"], "manufacturer": "OpenRGB",
                 "type": "Other", "led_count": 16, "leds": [{"r": 0, "g": 180, "b": 255} for _ in range(16)]}
                for c in self.controllers]

    def set_color(self, dev_idx, r, g, b):
        if not self.connected or not self.sock:
            return
        try:
            n = 16
            color_data = struct.pack("<H", n) + b"".join(struct.pack("BBBB", r, g, b, 0xFF) for _ in range(n))
            magic = b"ORGB"
            self.sock.sendall(magic + struct.pack("<III", dev_idx, self.PKT_TYPE_UPDATE_LEDS, len(color_data)) + color_data)
        except Exception:
            pass

    def set_led_colors(self, dev_idx, colors_list):
        if not self.connected or not self.sock:
            return
        try:
            color_data = struct.pack("<H", len(colors_list)) + b"".join(
                struct.pack("BBBB", c[0], c[1], c[2], 0xFF) for c in colors_list)
            magic = b"ORGB"
            self.sock.sendall(magic + struct.pack("<III", dev_idx, self.PKT_TYPE_UPDATE_LEDS, len(color_data)) + color_data)
        except Exception:
            pass


# --- 9. WLED HTTP REST API ---
class WLEDController:
    def __init__(self):
        self.base_url = None
        self.connected = False
        for host in ["wled.local", "192.168.1.100", "192.168.0.100"]:
            try:
                res = requests.get(f"http://{host}/json/info", timeout=1.0)
                if res.status_code == 200:
                    info = res.json()
                    self.base_url = f"http://{host}"
                    self.led_count = info.get("leds", {}).get("count", 30)
                    self.name = info.get("name", "WLED Strip")
                    self.connected = True
                    sdk_status["wled"] = "Connected"
                    print(f"WLED connected: {self.name} at {host} ({self.led_count} LEDs)")
                    break
            except Exception:
                pass

    def get_devices(self):
        if not self.connected:
            return []
        return [{"id": "wled_0", "name": self.name, "manufacturer": "WLED",
                 "type": "LED Strip", "led_count": self.led_count,
                 "leds": [{"r": 0, "g": 180, "b": 255} for _ in range(self.led_count)]}]

    def set_color(self, r, g, b):
        if not self.connected or not self.base_url:
            return
        try:
            requests.post(f"{self.base_url}/json/state",
                          json={"on": True, "bri": 255, "seg": [{"col": [[r, g, b]]}]},
                          timeout=0.5)
        except Exception:
            pass

    def set_led_colors(self, colors_list):
        if not self.connected or not self.base_url:
            return
        try:
            requests.post(f"{self.base_url}/json/state",
                          json={"on": True, "bri": 255, "seg": [{"i": [v for c in colors_list for v in c]}]},
                          timeout=0.5)
        except Exception:
            pass


# --- 10. Lian Li USB HID (UNI HUB) ---
LIANLI_VIDS = [0x264A, 0x0CF2]

class LianLiController:
    def __init__(self):
        self.device = None
        self.connected = False
        if HAS_HID:
            try:
                for dev_info in hid.enumerate():
                    if dev_info.get('vendor_id') in LIANLI_VIDS:
                        p_str = str(dev_info.get('product_string', '')).lower()
                        if "uni" in p_str or "hub" in p_str or dev_info.get('usage_page') == 0xFF00:
                            self.device = hid.device()
                            self.device.open_path(dev_info['path'])
                            self.connected = True
                            sdk_status["lianli"] = "Connected"
                            print(f"Lian Li UNI HUB connected: {dev_info.get('product_string')}")
                            break
            except Exception as e:
                print(f"Lian Li HID not available: {e}")

    def get_devices(self):
        if not self.connected or not self.device:
            return []
        return [{"id": "lianli_0", "name": "Lian Li UNI HUB", "manufacturer": "Lian Li",
                 "type": "Fans", "led_count": 48, "leds": [{"r": 0, "g": 180, "b": 255} for _ in range(48)]}]

    def set_color(self, r, g, b):
        if not self.connected or not self.device:
            return
        try:
            packet = [0x00, 0x30, 0x01] + [r, g, b] * 16
            packet = (packet + [0] * 65)[:65]
            self.device.write(packet)
        except Exception:
            pass

    def set_led_colors(self, colors_list):
        if not self.connected or not self.device:
            return
        try:
            flat = []
            for c in colors_list[:16]:
                flat.extend([c[0], c[1], c[2]])
            packet = [0x00, 0x31, len(colors_list)] + flat
            packet = (packet + [0] * 65)[:65]
            self.device.write(packet)
        except Exception:
            pass


# --- 11. Cooler Master SDK + HID Fallback ---
class CoolerMasterController:
    def __init__(self):
        self.dll = None
        self.device = None
        self.connected = False
        # Try DLL first
        dll_paths = [
            "C:\\Program Files (x86)\\Cooler Master\\MasterPlus+\\CMSDK.dll",
            "C:\\Program Files\\Cooler Master\\MasterPlus+\\CMSDK.dll",
            "./CMSDK.dll"
        ]
        for path in dll_paths:
            if os.path.exists(path):
                try:
                    self.dll = ctypes.windll.LoadLibrary(path)
                    if hasattr(self.dll, "CMSDK_EnableLedControl"):
                        self.dll.CMSDK_EnableLedControl(True, 0)
                    self.connected = True
                    sdk_status["coolermaster"] = "Connected"
                    print("Cooler Master SDK (DLL) connected.")
                    break
                except Exception:
                    pass
        # Fallback to raw HID (VID 0x2516)
        if not self.connected and HAS_HID:
            try:
                for dev_info in hid.enumerate():
                    if dev_info.get('vendor_id') == 0x2516:
                        self.device = hid.device()
                        self.device.open_path(dev_info['path'])
                        self.connected = True
                        sdk_status["coolermaster"] = "Connected"
                        print(f"Cooler Master HID connected: {dev_info.get('product_string')}")
                        break
            except Exception as e:
                print(f"Cooler Master HID not available: {e}")

    def get_devices(self):
        if not self.connected:
            return []
        return [{"id": "coolermaster_0", "name": "Cooler Master MasterFan Pro",
                 "manufacturer": "Cooler Master", "type": "Fans", "led_count": 16,
                 "leds": [{"r": 0, "g": 180, "b": 255} for _ in range(16)]}]

    def set_color(self, r, g, b):
        if not self.connected:
            return
        try:
            if self.dll and hasattr(self.dll, "CMSDK_SetFullColor"):
                self.dll.CMSDK_SetFullColor(0, r, g, b)
            elif self.device:
                packet = [0x00, 0x80, 0x01, r, g, b] + [0] * 59
                self.device.write(packet)
        except Exception:
            pass

    def set_led_colors(self, colors_list):
        if not self.connected:
            return
        try:
            if self.device:
                flat = []
                for c in colors_list[:16]:
                    flat.extend([c[0], c[1], c[2]])
                packet = [0x00, 0x80, 0x02, len(colors_list)] + flat
                packet = (packet + [0] * 65)[:65]
                self.device.write(packet)
        except Exception:
            pass


# --- 12. NZXT CAM REST API ---
class NZXTController:
    def __init__(self):
        self.base_url = "http://localhost:7041"
        self.connected = False
        self.token = None
        try:
            res = requests.get(f"{self.base_url}/api/nzxt-cam/v1/status", timeout=1.0)
            if res.status_code == 200:
                self.connected = True
                sdk_status["nzxt"] = "Connected"
                print("NZXT CAM service connected.")
        except Exception as e:
            print(f"NZXT CAM not available: {e}")

    def get_devices(self):
        if not self.connected:
            return []
        return [{"id": "nzxt_0", "name": "NZXT Kraken Z73", "manufacturer": "NZXT",
                 "type": "AIO Cooler", "led_count": 9, "leds": [{"r": 0, "g": 180, "b": 255} for _ in range(9)]}]

    def set_color(self, r, g, b):
        if not self.connected:
            return
        try:
            requests.post(f"{self.base_url}/api/nzxt-cam/v1/lighting",
                          json={"mode": "fixed", "speed": 0, "color1": {"r": r, "g": g, "b": b}},
                          timeout=0.5)
        except Exception:
            pass

    def set_led_colors(self, colors_list):
        self.set_color(*colors_list[0]) if colors_list else None


# --- 13. Generic Brand SDK Stubs (For remaining brands) ---
# Check local filesystem pathways or register stubs
class GenericBrandController:
    def __init__(self, brand_id, display_name, dll_name=None, default_paths=None):
        self.brand_id = brand_id
        self.display_name = display_name
        self.connected = False
        self.dll = None
        
        if dll_name and default_paths:
            for path in default_paths:
                if os.path.exists(path):
                    try:
                        self.dll = ctypes.windll.LoadLibrary(path)
                        self.connected = True
                        sdk_status[brand_id] = "Connected"
                        print(f"{display_name} SDK/DLL detected and loaded.")
                        break
                    except Exception:
                        pass
        # Auto registration log if remaining stub
        if not self.connected:
            sdk_status[brand_id] = "Demo"

    def get_devices(self):
        return []

    def set_color(self, r, g, b):
        pass


# Initialize all controllers
try:
    import pythoncom
    pythoncom.CoInitialize()
except Exception:
    pass

def generate_tkl_layout():
    layout = []
    # Row 0: Function row
    layout.append({"key": "Esc", "x": 0, "y": 0, "w": 1})
    for i in range(1, 5):
        layout.append({"key": f"F{i}", "x": i + 0.5, "y": 0, "w": 1})
    for i in range(5, 9):
        layout.append({"key": f"F{i}", "x": i + 1.0, "y": 0, "w": 1})
    for i in range(9, 13):
        layout.append({"key": f"F{i}", "x": i + 1.5, "y": 0, "w": 1})
    layout.append({"key": "Prt", "x": 15, "y": 0, "w": 1})
    layout.append({"key": "Scr", "x": 16, "y": 0, "w": 1})
    layout.append({"key": "Pau", "x": 17, "y": 0, "w": 1})
    
    # Row 1: Number row
    layout.append({"key": "`", "x": 0, "y": 1.2, "w": 1})
    numbers = ["1", "2", "3", "4", "5", "6", "7", "8", "9", "0", "-", "="]
    for i, num in enumerate(numbers):
        layout.append({"key": num, "x": i + 1, "y": 1.2, "w": 1})
    layout.append({"key": "Back", "x": 13, "y": 1.2, "w": 2})
    layout.append({"key": "Ins", "x": 15, "y": 1.2, "w": 1})
    layout.append({"key": "Hom", "x": 16, "y": 1.2, "w": 1})
    layout.append({"key": "PgU", "x": 17, "y": 1.2, "w": 1})
    
    # Row 2: QWERTY row
    layout.append({"key": "Tab", "x": 0, "y": 2.2, "w": 1.5})
    chars2 = ["Q", "W", "E", "R", "T", "Y", "U", "I", "O", "P", "[", "]"]
    for i, ch in enumerate(chars2):
        layout.append({"key": ch, "x": i + 1.5, "y": 2.2, "w": 1})
    layout.append({"key": "\\", "x": 13.5, "y": 2.2, "w": 1.5})
    layout.append({"key": "Del", "x": 15, "y": 2.2, "w": 1})
    layout.append({"key": "End", "x": 16, "y": 2.2, "w": 1})
    layout.append({"key": "PgD", "x": 17, "y": 2.2, "w": 1})
    
    # Row 3: ASDF row
    layout.append({"key": "Caps", "x": 0, "y": 3.2, "w": 1.75})
    chars3 = ["A", "S", "D", "F", "G", "H", "J", "K", "L", ";", "'"]
    for i, ch in enumerate(chars3):
        layout.append({"key": ch, "x": i + 1.75, "y": 3.2, "w": 1})
    layout.append({"key": "Enter", "x": 12.75, "y": 3.2, "w": 2.25})
    
    # Row 4: ZXCV row
    layout.append({"key": "Shft", "x": 0, "y": 4.2, "w": 2.25})
    chars4 = ["Z", "X", "C", "V", "B", "N", "M", ",", ".", "/"]
    for i, ch in enumerate(chars4):
        layout.append({"key": ch, "x": i + 2.25, "y": 4.2, "w": 1})
    layout.append({"key": "Shft", "x": 12.25, "y": 4.2, "w": 2.75})
    layout.append({"key": "Up", "x": 16, "y": 4.2, "w": 1})
    
    # Row 5: Space row
    layout.append({"key": "Ctrl", "x": 0, "y": 5.2, "w": 1.25})
    layout.append({"key": "Win", "x": 1.25, "y": 5.2, "w": 1.25})
    layout.append({"key": "Alt", "x": 2.5, "y": 5.2, "w": 1.25})
    layout.append({"key": "Space", "x": 3.75, "y": 5.2, "w": 6.25})
    layout.append({"key": "Alt", "x": 10, "y": 5.2, "w": 1.25})
    layout.append({"key": "FN", "x": 11.25, "y": 5.2, "w": 1.25})
    layout.append({"key": "App", "x": 12.5, "y": 5.2, "w": 1.25})
    layout.append({"key": "Ctrl", "x": 13.75, "y": 5.2, "w": 1.25})
    layout.append({"key": "Left", "x": 15, "y": 5.2, "w": 1})
    layout.append({"key": "Down", "x": 16, "y": 5.2, "w": 1})
    layout.append({"key": "Right", "x": 17, "y": 5.2, "w": 1})
    
    return layout

handlers = {
    "asus": AsusAuraController(),
    "msi": MsiController(),
    "corsair": CorsairController(),
    "logitech": LogitechController(),
    "razer": RazerController(),
    "via_qmk": ViaQmkController(),
    "philips_hue": PhilipsHueController(),
    "nanoleaf": NanoleafController(),
    "govee": GoveeController(),
    "aula": AulaController(),
    "vgn": VgnController(),
    "vxe": VxeController(),
    "steelseries": SteelSeriesController(),
    "openrgb": OpenRGBController(),
    "wled": WLEDController(),
    "lianli": LianLiController(),
    "coolermaster": CoolerMasterController(),
    "nzxt": NZXTController(),
}

# Register the remaining 38 brands automatically using stub engines
remaining_brands = [
    ("gigabyte", "Gigabyte RGB Fusion", "RGBSDK.dll", ["C:\\Program Files (x86)\\GIGABYTE\\RGB Fusion\\RGBSDK.dll"]),
    ("asrock", "ASRock Polychrome", "ASRRGBLED.dll", ["C:\\Program Files (x86)\\ASRock Utility\\ASRRGBLED\\ASRRGBLED.dll"]),
    ("biostar", "Biostar Vivid LED DJ", None, None),
    ("evga", "EVGA Precision X1", "EVGLED.dll", ["C:\\Program Files (x86)\\EVGA\\Precision X1\\EVGLED.dll"]),
    ("nvidia", "NVIDIA FE Sync", "NvidiaLedLib.dll", ["C:\\Program Files\\NVIDIA Corporation\\LEDVisualizer\\NvidiaLedLib.dll"]),
    ("amd", "AMD Radeon RGB Utility", None, None),
    ("zotac", "Zotac FireStorm", "ZotacGPU.dll", ["C:\\Program Files\\ZOTAC\\FireStorm\\ZotacGPU.dll"]),
    ("colorful", "Colorful iGame RGB", None, None),
    ("pny", "PNY VelocityX SDK", None, None),
    ("inno3d", "Inno3D TuneIT RGB", None, None),
    ("galax", "Galax Xtreme Tuner", "GALAX_SDK.dll", ["C:\\Program Files\\Galax\\Xtreme Tuner\\GALAX_SDK.dll"]),
    ("palit", "Palit ThunderMaster", "ThunderMaster_SDK.dll", ["C:\\Program Files\\ThunderMaster\\ThunderMaster_SDK.dll"]),
    ("gainward", "Gainward ThunderMaster", None, None),
    ("sapphire", "Sapphire TriXX Control", "SapphireTriXX.dll", ["C:\\Program Files (x86)\\Sapphire\\TriXX\\SapphireTriXX.dll"]),
    ("powercolor", "PowerColor DevilZone", "PowerColorRGB.dll", ["C:\\Program Files\\PowerColor\\DevilZone\\PowerColorRGB.dll"]),
    ("xfx", "XFX Speedster RGB", "XFX_GPU_RGB.dll", ["C:\\Program Files\\XFX\\Radeon RGB\\XFX_GPU_RGB.dll"]),
    ("samsung", "Samsung RGB Sync", None, None),
    ("skhynix", "SK Hynix Memory Link", None, None),
    ("micron", "Micron Crucial Utility", None, None),
    ("gskill", "G.Skill Trident Lighting", "GSkillRGB.dll", ["C:\\Program Files\\G.Skill\\Trident Z Lighting Control\\GSkillRGB.dll"]),
    ("kingston", "Kingston FURY Engine", None, None),
    ("teamgroup", "TeamGroup T-Force RGB", None, None),
    ("adata", "ADATA XPG Prime API", None, None),
    ("geil", "GeIL RGB Utility", None, None),
    ("klevv", "KLEVV CRAS Lighting", None, None),
    ("crucial", "Crucial Ballistix Sync", None, None),
    ("oloy", "OLOY Memory RGB", None, None),
    ("roccat", "Roccat Talk FX", "TalkFXSDK.dll", ["C:\\Program Files\\Roccat\\TalkFXSDK.dll"]),
    ("hyperx", "HyperX NGENUITY Link", None, None),
    ("glorious", "Glorious Core API", None, None),
    ("keychron", "Keychron Custom Link", None, None),
    ("wooting", "Wooting Analog RGB SDK", None, None),
    ("alienware", "Alienware AlienFX API", None, None),
    ("hp", "HP Omen Studio Link", None, None),
    ("lenovo", "Lenovo Legion Vantage", None, None),
    ("thermaltake", "ThermalTake Plus RGB", None, None),
    # New peripherals / boutique KB brands
    ("mountain", "Mountain Everest SDK", None, None),
    ("endgamegear", "Endgame Gear USB HID", None, None),
    ("fnatic", "Fnatic Gear Studio", None, None),
    ("redragon", "Redragon Custom HID", None, None),
    ("ducky", "Ducky One Lighting", None, None),
    # Case / cooling / smart lighting stubs
    ("phanteks", "Phanteks DRGB Controller", None, None),
    ("deepcool", "Deepcool FC120/AK SDK", None, None),
    ("ekwb", "EKWB EK-Loop Connect", None, None),
    ("lifx", "LIFX LAN Protocol", None, None),
    ("yeelight", "Yeelight LAN API", None, None),
    ("elgato", "Elgato Key Light", None, None),
    ("secretlab", "Secretlab TITAN Lighting", None, None),
    # Custom KB boutique brands using VIA/QMK stubs
    ("monsgeek", "MonsGeek QMK Board", None, None),
    ("akko", "Akko Custom RGB", None, None),
    ("epomaker", "Epomaker TH/EP Board", None, None),
    ("nuphy", "NuPhy Air Series", None, None),
    ("zsa", "ZSA Moonlander/Ergodox", None, None),
    ("drop", "DROP ALT/CTRL/SHIFT", None, None),
    ("gmmk", "GMMK Pro / GMMK 2", None, None),
    ("owlab", "OwLab Spring/Voice", None, None),
    ("mode", "Mode Designs Envoy/SixtyFive", None, None),
    ("kbd67", "KBDfans KBD67 Lite", None, None),
    ("qk", "QK65 / QK75", None, None),
    ("cannonkeys", "Cannonkeys Satisfaction", None, None),
    ("cftkb", "CFTKB Mysterium", None, None),
]

for b_id, b_name, b_dll, b_paths in remaining_brands:
    handlers[b_id] = GenericBrandController(b_id, b_name, b_dll, b_paths)


# --- Simulated Fallback Engine (Demo templates for all 44 Brands) ---
# Key mapping info for VIA/QMK 60%/65% Layout simulation (68 keys)
# x: column pos, y: row pos, w: width of key relative to standard size
via_qmk_key_layout = [
    # Row 0
    {"key": "Esc", "x": 0, "y": 0, "w": 1},
    {"key": "1", "x": 1, "y": 0, "w": 1}, {"key": "2", "x": 2, "y": 0, "w": 1},
    {"key": "3", "x": 3, "y": 0, "w": 1}, {"key": "4", "x": 4, "y": 0, "w": 1},
    {"key": "5", "x": 5, "y": 0, "w": 1}, {"key": "6", "x": 6, "y": 0, "w": 1},
    {"key": "7", "x": 7, "y": 0, "w": 1}, {"key": "8", "x": 8, "y": 0, "w": 1},
    {"key": "9", "x": 9, "y": 0, "w": 1}, {"key": "0", "x": 10, "y": 0, "w": 1},
    {"key": "-", "x": 11, "y": 0, "w": 1}, {"key": "=", "x": 12, "y": 0, "w": 1},
    {"key": "Back", "x": 13, "y": 0, "w": 2}, {"key": "Ins", "x": 15, "y": 0, "w": 1},
    # Row 1
    {"key": "Tab", "x": 0, "y": 1, "w": 1.5},
    {"key": "Q", "x": 1.5, "y": 1, "w": 1}, {"key": "W", "x": 2.5, "y": 1, "w": 1},
    {"key": "E", "x": 3.5, "y": 1, "w": 1}, {"key": "R", "x": 4.5, "y": 1, "w": 1},
    {"key": "T", "x": 5.5, "y": 1, "w": 1}, {"key": "Y", "x": 6.5, "y": 1, "w": 1},
    {"key": "U", "x": 7.5, "y": 1, "w": 1}, {"key": "I", "x": 8.5, "y": 1, "w": 1},
    {"key": "O", "x": 9.5, "y": 1, "w": 1}, {"key": "P", "x": 10.5, "y": 1, "w": 1},
    {"key": "[", "x": 11.5, "y": 1, "w": 1}, {"key": "]", "x": 12.5, "y": 1, "w": 1},
    {"key": "\\", "x": 13.5, "y": 1, "w": 1.5}, {"key": "Del", "x": 15, "y": 1, "w": 1},
    # Row 2
    {"key": "Caps", "x": 0, "y": 2, "w": 1.75},
    {"key": "A", "x": 1.75, "y": 2, "w": 1}, {"key": "S", "x": 2.75, "y": 2, "w": 1},
    {"key": "D", "x": 3.75, "y": 2, "w": 1}, {"key": "F", "x": 4.75, "y": 2, "w": 1},
    {"key": "G", "x": 5.75, "y": 2, "w": 1}, {"key": "H", "x": 6.75, "y": 2, "w": 1},
    {"key": "J", "x": 7.75, "y": 2, "w": 1}, {"key": "K", "x": 8.75, "y": 2, "w": 1},
    {"key": "L", "x": 9.75, "y": 2, "w": 1}, {"key": ";", "x": 10.75, "y": 2, "w": 1},
    {"key": "'", "x": 11.75, "y": 2, "w": 1}, {"key": "Enter", "x": 12.75, "y": 2, "w": 2.25},
    {"key": "PgUp", "x": 15, "y": 2, "w": 1},
    # Row 3
    {"key": "LShift", "x": 0, "y": 3, "w": 2.25},
    {"key": "Z", "x": 2.25, "y": 3, "w": 1}, {"key": "X", "x": 3.25, "y": 3, "w": 1},
    {"key": "C", "x": 4.25, "y": 3, "w": 1}, {"key": "V", "x": 5.25, "y": 3, "w": 1},
    {"key": "B", "x": 6.25, "y": 3, "w": 1}, {"key": "N", "x": 7.25, "y": 3, "w": 1},
    {"key": "M", "x": 8.25, "y": 3, "w": 1}, {"key": ",", "x": 9.25, "y": 3, "w": 1},
    {"key": ".", "x": 10.25, "y": 3, "w": 1}, {"key": "/", "x": 11.25, "y": 3, "w": 1},
    {"key": "RShift", "x": 12.25, "y": 3, "w": 1.75},
    {"key": "Up", "x": 14, "y": 3, "w": 1},
    {"key": "PgDn", "x": 15, "y": 3, "w": 1},
    # Row 4
    {"key": "Ctrl", "x": 0, "y": 4, "w": 1.25}, {"key": "Win", "x": 1.25, "y": 4, "w": 1.25},
    {"key": "Alt", "x": 2.5, "y": 4, "w": 1.25}, {"key": "Space", "x": 3.75, "y": 4, "w": 6.25},
    {"key": "Alt", "x": 10, "y": 4, "w": 1.25}, {"key": "FN", "x": 11.25, "y": 4, "w": 1.25},
    {"key": "Left", "x": 13, "y": 4, "w": 1}, {"key": "Down", "x": 14, "y": 4, "w": 1},
    {"key": "Right", "x": 15, "y": 4, "w": 1}
]

# ─── OpenRGB Device Catalog (fetched from GitLab at startup) ───────────────
# Maps controller directory name patterns → (brand, device_type, led_count)
# Brand extraction: longest matching prefix wins
_ORGB_BRAND_MAP = [
    ("AsusAuraGPU",            "ASUS",              "GPU"),
    ("AsusAuraCore",           "ASUS",              "Laptop"),
    ("AsusAuraUSB",            "ASUS",              "Motherboard"),
    ("AsusLegacyUSB",          "ASUS",              "Keyboard"),
    ("AsusMonitor",            "ASUS",              "Monitor"),
    ("AsusTUFLaptop",          "ASUS TUF",          "Laptop"),
    ("ASRockPolychrome",       "ASRock",            "Motherboard"),
    ("ASRockSMBus",            "ASRock",            "Motherboard"),
    ("AMDWraithPrism",         "AMD",               "CPU Cooler"),
    ("AMBXController",         "Philips AMBX",      "LED Strip"),
    ("AOCKeyboard",            "AOC",               "Keyboard"),
    ("AOCMousemat",            "AOC",               "Mouse Pad"),
    ("AOCMouse",               "AOC",               "Mouse"),
    ("A4Tech",                 "A4Tech",            "Mouse"),
    ("AlienwareKeyboard",      "Alienware",         "Keyboard"),
    ("AlienwareMonitor",       "Alienware",         "Monitor"),
    ("Alienware",              "Alienware",         "PC Case"),
    ("AnnePro2",               "Obinslab",          "Keyboard"),
    ("Arctic",                 "Arctic",            "CPU Cooler"),
    ("Areson",                 "Areson",            "Keyboard"),
    ("BlinkyTape",             "BlinkyTape",        "LED Strip"),
    ("CherryKeyboard",         "Cherry",            "Keyboard"),
    ("ClevoKeyboard",          "Clevo",             "Keyboard"),
    ("ClevoLightbar",          "Clevo",             "Laptop"),
    ("ColorfulTuring",         "Colorful",          "GPU"),
    ("ColorfulGPU",            "Colorful",          "GPU"),
    ("CoolerMaster",           "Cooler Master",     "Fan"),
    ("CorsairCommanderCore",   "Corsair",           "Fan Controller"),
    ("CorsairDRAM",            "Corsair",           "Memory"),
    ("CorsairHydro",           "Corsair",           "AIO Cooler"),
    ("CorsairICueLink",        "Corsair",           "Fan Hub"),
    ("CorsairLightingNode",    "Corsair",           "LED Controller"),
    ("CorsairPeripheral",      "Corsair",           "Mouse"),
    ("CorsairVengeance",       "Corsair",           "Memory"),
    ("CorsairWireless",        "Corsair",           "Mouse"),
    ("Corsair",                "Corsair",           "Keyboard"),
    ("Cougar",                 "Cougar",            "Keyboard"),
    ("Creative",               "Creative",          "Headset"),
    ("Crucial",                "Crucial",           "Memory"),
    ("CryorigH7",              "Cryorig",           "CPU Cooler"),
    ("DarkProject",            "Dark Project",      "Keyboard"),
    ("DasKeyboard",            "Das Keyboard",      "Keyboard"),
    ("DuckyKeyboard",          "Ducky",             "Keyboard"),
    ("DygmaRaise",             "Dygma",             "Keyboard"),
    ("EKController",           "EKWB",              "Water Block"),
    ("ENESMBus",               "ENE",               "Motherboard"),
    ("EVGAAmpereGPU",          "EVGA",              "GPU"),
    ("EVGATuringGPU",          "EVGA",              "GPU"),
    ("EVGASMBus",              "EVGA",              "Motherboard"),
    ("EVisionKeyboard",        "E-Vision",          "Keyboard"),
    ("ElgatoKeyLight",         "Elgato",            "Smart Light"),
    ("ElgatoLightStrip",       "Elgato",            "LED Strip"),
    ("Epomaker",               "Epomaker",          "Keyboard"),
    ("FnaticStreak",           "Fnatic",            "Keyboard"),
    ("GainwardGPU",            "Gainward",          "GPU"),
    ("GalaxGPU",               "Galax",             "GPU"),
    ("GigabyteAorusCPUCooler", "Gigabyte AORUS",   "CPU Cooler"),
    ("GigabyteAorusLaptop",    "Gigabyte AORUS",   "Laptop"),
    ("GigabyteAorusMouse",     "Gigabyte AORUS",   "Mouse"),
    ("GigabyteAorusPCCase",    "Gigabyte AORUS",   "PC Case"),
    ("GigabyteRGBFusion2DRAM", "Gigabyte",         "Memory"),
    ("GigabyteRGBFusion2GPU",  "Gigabyte",         "GPU"),
    ("GigabyteRGBFusion2SMBus","Gigabyte",         "Motherboard"),
    ("GigabyteRGBFusion2",     "Gigabyte",         "Motherboard"),
    ("GigabyteRGBFusionGPU",   "Gigabyte",         "GPU"),
    ("GigabyteRGBFusion",      "Gigabyte",         "Motherboard"),
    ("GigabyteSuperIO",        "Gigabyte",         "Motherboard"),
    ("Govee",                  "Govee",             "Smart Light"),
    ("HPOmen30L",              "HP",                "PC Case"),
    ("HPOmenLaptop",           "HP",                "Laptop"),
    ("HYTEKeyboard",           "HYTE",              "Keyboard"),
    ("HYTEMousemat",           "HYTE",              "Mouse Pad"),
    ("HYTENexus",              "HYTE",              "Fan Hub"),
    ("Holtek",                 "Holtek",            "Keyboard"),
    ("HyperXDRAM",             "HyperX",            "Memory"),
    ("HyperXKeyboard",         "HyperX",            "Keyboard"),
    ("HyperXMicrophone",       "HyperX",            "Microphone"),
    ("HyperXMousemat",         "HyperX",            "Mouse Pad"),
    ("HyperXMouse",            "HyperX",            "Mouse"),
    ("IntelArc",               "Intel",             "GPU"),
    ("JGINYUEInternal",        "JGINYUE",           "Motherboard"),
    ("KasaSmart",              "TP-Link Kasa",      "Smart Light"),
    ("KeychronKeyboard",       "Keychron",          "Keyboard"),
    ("KingstonFuryDRAM",       "Kingston Fury",     "Memory"),
    ("LGMonitor",              "LG",                "Monitor"),
    ("LIFX",                   "LIFX",              "Smart Light"),
    ("LianLi",                 "Lian Li",           "Fan"),
    ("LogitechController",     "Logitech",          "Mouse"),
    ("Logitech",               "Logitech",          "Mouse"),
    ("MSI3Zone",               "MSI",               "Keyboard"),
    ("MSIGPUController",       "MSI",               "GPU"),
    ("MSIKeyboard",            "MSI",               "Keyboard"),
    ("MSIMysticLight",         "MSI",               "Motherboard"),
    ("MSIOptix",               "MSI",               "Monitor"),
    ("MSIVigor",               "MSI",               "Keyboard"),
    ("MSI",                    "MSI",               "Motherboard"),
    ("ManliGPU",               "Manli",             "GPU"),
    ("MountainKeyboard",       "Mountain",          "Keyboard"),
    ("NVIDIAIllumination",     "NVIDIA",            "GPU"),
    ("NZXTHue1",               "NZXT",              "Fan Hub"),
    ("NZXTHue2",               "NZXT",              "Fan Hub"),
    ("NZXTHuePlus",            "NZXT",              "Fan Hub"),
    ("NZXTKraken",             "NZXT",              "AIO Cooler"),
    ("NZXTMouse",              "NZXT",              "Mouse"),
    ("Nanoleaf",               "Nanoleaf",          "Smart Light"),
    ("NvidiaESA",              "NVIDIA",            "GPU"),
    ("PNYARGBEpicX",           "PNY",               "GPU"),
    ("PNYLovelace",            "PNY",               "GPU"),
    ("PNYGPU",                 "PNY",               "GPU"),
    ("PalitGPU",               "Palit",             "GPU"),
    ("PatriotViperSteel",      "Patriot",           "Memory"),
    ("PatriotViperMouse",      "Patriot",           "Mouse"),
    ("PatriotViper",           "Patriot",           "Memory"),
    ("PhilipsHue",             "Philips Hue",       "Smart Light"),
    ("PhilipsWiz",             "Philips WiZ",       "Smart Light"),
    ("PowerColorGPU",          "PowerColor",        "GPU"),
    ("QMK",                    "QMK",               "Keyboard"),
    ("Razer",                  "Razer",             "Keyboard"),
    ("RedSquareKeyrox",        "Red Square",        "Keyboard"),
    ("Redragon",               "Redragon",          "Keyboard"),
    ("Roccat",                 "ROCCAT",            "Mouse"),
    ("SapphireGPU",            "Sapphire",          "GPU"),
    ("SinowealthController",   "Sinowealth",        "Mouse"),
    ("Skyloong",               "Skyloong",          "Keyboard"),
    ("SonyGamepad",            "Sony",              "Controller"),
    ("SteelSeries",            "SteelSeries",       "Keyboard"),
    ("StreamDeck",             "Elgato",            "Stream Deck"),
    ("TForceXtreem",           "TeamGroup",         "Memory"),
    ("ThermaltakePoseidonZ",   "Thermaltake",       "Keyboard"),
    ("ThermaltakeRiing",       "Thermaltake",       "Fan"),
    ("ValkyrieKeyboard",       "Valkyrie",          "Keyboard"),
    ("ViewSonic",              "ViewSonic",         "Monitor"),
    ("WootingKeyboard",        "Wooting",           "Keyboard"),
    ("XPGSummoner",            "XPG",               "Keyboard"),
    ("Yeelight",               "Yeelight",          "Smart Light"),
    ("ZETKeyboard",            "ZET",               "Keyboard"),
    ("ZalmanZSync",            "Zalman",            "Fan"),
    ("ZotacBlackwellGPU",      "Zotac",             "GPU"),
    ("ZotacTuringGPU",         "Zotac",             "GPU"),
    ("ZotacV2GPU",             "Zotac",             "GPU"),
]

_ORGB_LED_DEFAULTS = {
    "Keyboard": 104, "Mouse": 6, "Mouse Pad": 12, "Memory": 10,
    "GPU": 8, "Motherboard": 12, "CPU Cooler": 9, "AIO Cooler": 16,
    "Fan": 9, "Fan Hub": 6, "Fan Controller": 6, "LED Strip": 60,
    "LED Controller": 6, "Smart Light": 3, "Monitor": 4, "Laptop": 4,
    "PC Case": 16, "Water Block": 8, "Headset": 2, "Microphone": 2,
    "Headphone": 2, "Controller": 4, "Stream Deck": 8, "Hub": 6,
}

_openrgb_catalog_cache = []   # filled by background thread at startup

def _parse_openrgb_controller(ctrl_name):
    """Return (brand, device_type) by matching against _ORGB_BRAND_MAP."""
    base = ctrl_name.replace("Controller", "").replace("Controllers", "")
    for prefix, brand, dtype in _ORGB_BRAND_MAP:
        if base.startswith(prefix) or ctrl_name.startswith(prefix):
            return brand, dtype
    return None, None

def _safe_id(brand, dtype):
    import re
    return re.sub(r'[^a-z0-9]', '_', f"orgb_{brand}_{dtype}".lower())

def fetch_openrgb_catalog():
    """Background: fetch OpenRGB controller list from GitLab, build demo entries."""
    global _openrgb_catalog_cache
    GITLAB_API = ("https://gitlab.com/api/v4/projects/"
                  "CalcProgrammer1%2FOpenRGB/repository/tree"
                  "?path=Controllers&per_page=100&page={}")
    try:
        controllers = []
        for page in (1, 2):
            r = requests.get(GITLAB_API.format(page), timeout=8.0)
            if r.status_code == 200:
                controllers.extend(item["name"] for item in r.json()
                                   if item.get("type") == "tree")

        seen = {}   # id → entry  (deduplicate brand+type)
        for ctrl in controllers:
            brand, dtype = _parse_openrgb_controller(ctrl)
            if not brand:
                continue
            dev_id = _safe_id(brand, dtype)
            if dev_id in seen:
                continue
            leds = _ORGB_LED_DEFAULTS.get(dtype, 8)
            seen[dev_id] = {
                "id":           dev_id + "_orgb",
                "name":         f"{brand} {dtype} (OpenRGB)",
                "manufacturer": brand,
                "type":         dtype,
                "led_count":    leds,
                "openrgb_source": True,
            }

        _openrgb_catalog_cache = list(seen.values())
        print(f"[OpenRGB Catalog] {len(_openrgb_catalog_cache)} device types loaded "
              f"from {len(controllers)} controllers.", flush=True)

        # Merge into live device_states so the frontend sees them without restart
        if device_states:
            _MFR_KEY_MAP_CATALOG = {
                "lian li": "lianli", "cooler master": "coolermaster",
                "philips hue": "philips_hue", "tp-link kasa": "kasa",
            }
            for d in _openrgb_catalog_cache:
                if d["id"] not in device_states:
                    mk = _MFR_KEY_MAP_CATALOG.get(d["manufacturer"].lower(),
                                                   d["manufacturer"].lower())
                    h = handlers.get(mk)
                    if not (h and h.connected):
                        with state_lock:
                            device_states[d["id"]] = {
                                "id": d["id"], "name": d["name"],
                                "manufacturer": d["manufacturer"],
                                "type": d["type"], "led_count": d["led_count"],
                                "leds": [{"r": 0, "g": 180, "b": 255}
                                         for _ in range(d["led_count"])],
                                "openrgb_source": True,
                            }
                            device_modes[d["id"]] = "sync"

        # Also merge supplementary catalog on the same pass
        for d in _SUPPLEMENTARY_CATALOG:
            if d["id"] not in device_states:
                with state_lock:
                    device_states[d["id"]] = {
                        "id": d["id"], "name": d["name"],
                        "manufacturer": d["manufacturer"],
                        "type": d["type"], "led_count": d["led_count"],
                        "leds": [{"r": 0, "g": 180, "b": 255}
                                 for _ in range(d["led_count"])],
                        "supplementary_source": True,
                    }
                    device_modes[d["id"]] = "sync"

    except Exception as e:
        print(f"[OpenRGB Catalog] Fetch failed: {e}", flush=True)

# Kick off catalog fetch in background (non-blocking)
threading.Thread(target=fetch_openrgb_catalog, daemon=True, name="orgb-catalog").start()
print("[OpenRGB Catalog] Background fetch thread started.", flush=True)

# ─── Supplementary Catalog ──────────────────────────────────────────────────
# Brands/devices NOT covered by OpenRGB: smart home, WLED DIY, additional
# keyboard/fan brands, GPU vendors, etc.
_SUPPLEMENTARY_CATALOG = [
    # WLED DIY ecosystem
    {"id": "supp_wled_strip",      "name": "WLED LED Strip (Generic)",       "manufacturer": "WLED",           "type": "LED Strip",       "led_count": 60},
    {"id": "supp_wled_matrix",     "name": "WLED LED Matrix 8×8",            "manufacturer": "WLED",           "type": "LED Matrix",      "led_count": 64},
    {"id": "supp_wled_ring",       "name": "WLED LED Ring (DIY)",            "manufacturer": "WLED",           "type": "LED Strip",       "led_count": 24},
    # Smart-home light brands
    {"id": "supp_govee_h6054",     "name": "Govee Lightbar H6054",           "manufacturer": "Govee",          "type": "Smart Light",     "led_count": 20},
    {"id": "supp_govee_strip",     "name": "Govee LED Strip M1",             "manufacturer": "Govee",          "type": "LED Strip",       "led_count": 40},
    {"id": "supp_lifx_bulb",       "name": "LIFX Colour Smart Bulb",         "manufacturer": "LIFX",           "type": "Smart Light",     "led_count": 1},
    {"id": "supp_lifx_strip",      "name": "LIFX Z LED Strip",               "manufacturer": "LIFX",           "type": "LED Strip",       "led_count": 30},
    {"id": "supp_wiz_bulb",        "name": "WiZ Full-Colour Smart Bulb",     "manufacturer": "WiZ",            "type": "Smart Light",     "led_count": 1},
    {"id": "supp_yeelight_strip",  "name": "Yeelight LED Light Strip 1S",   "manufacturer": "Yeelight",       "type": "LED Strip",       "led_count": 60},
    # Keyboards not in OpenRGB
    {"id": "supp_varmilo_87",      "name": "Varmilo VA87M Keyboard",         "manufacturer": "Varmilo",        "type": "Keyboard",        "led_count": 87},
    {"id": "supp_keychron_q1",     "name": "Keychron Q1 Keyboard",           "manufacturer": "Keychron",       "type": "Keyboard",        "led_count": 84},
    {"id": "supp_gmmk_tkl",        "name": "Glorious GMMK TKL Keyboard",    "manufacturer": "Glorious",       "type": "Keyboard",        "led_count": 87},
    {"id": "supp_gmmk_pro",        "name": "Glorious GMMK Pro Keyboard",     "manufacturer": "Glorious",       "type": "Keyboard",        "led_count": 75},
    {"id": "supp_iqunix_f96",      "name": "IQUNIX F96 Keyboard",            "manufacturer": "IQUNIX",         "type": "Keyboard",        "led_count": 96},
    {"id": "supp_leopold_fc750",   "name": "Leopold FC750R Keyboard",        "manufacturer": "Leopold",        "type": "Keyboard",        "led_count": 87},
    # GPU brands not in OpenRGB
    {"id": "supp_palit_gpu",       "name": "Palit RTX Series GPU",           "manufacturer": "Palit",          "type": "GPU",             "led_count": 8},
    {"id": "supp_inno3d_gpu",      "name": "INNO3D iChill RTX GPU",          "manufacturer": "INNO3D",         "type": "GPU",             "led_count": 8},
    {"id": "supp_pny_gpu",         "name": "PNY XLR8 RTX GPU",               "manufacturer": "PNY",            "type": "GPU",             "led_count": 6},
    # Fan / cooling brands
    {"id": "supp_thermaltake_fan", "name": "Thermaltake TOUGHFAN ARGB",      "manufacturer": "Thermaltake",    "type": "Fan",             "led_count": 9},
    {"id": "supp_deepcool_fan",    "name": "DeepCool RF120 ARGB Fan",        "manufacturer": "DeepCool",       "type": "Fan",             "led_count": 9},
    {"id": "supp_fractal_fan",     "name": "Fractal Design Prisma Fan",      "manufacturer": "Fractal Design", "type": "Fan",             "led_count": 9},
    {"id": "supp_bequiet_fan",     "name": "be quiet! Light Wings Fan",      "manufacturer": "be quiet!",      "type": "Fan",             "led_count": 6},
    # AIO / Water cooling
    {"id": "supp_ekwb_aio",        "name": "EKWB EK-AIO 360 Cooler",        "manufacturer": "EKWB",           "type": "AIO Cooler",      "led_count": 16},
    {"id": "supp_alphacool_aio",   "name": "Alphacool Eisbaer 360 AIO",     "manufacturer": "Alphacool",      "type": "AIO Cooler",      "led_count": 16},
    {"id": "supp_noctua_fan",      "name": "Noctua NF-F12 chromax Fan",      "manufacturer": "Noctua",         "type": "Fan",             "led_count": 0},
    # RAM brands not in OpenRGB
    {"id": "supp_sk_hynix_ram",    "name": "SK Hynix Platinum P41 RAM",     "manufacturer": "SK Hynix",       "type": "Memory",          "led_count": 10},
    {"id": "supp_adata_ram",       "name": "ADATA XPG Spectrix D50 RAM",    "manufacturer": "ADATA",          "type": "Memory",          "led_count": 10},
    # Headsets
    {"id": "supp_astro_a50",       "name": "Astro A50 Wireless Headset",     "manufacturer": "Astro",          "type": "Headset",         "led_count": 2},
    {"id": "supp_jabra_headset",   "name": "Jabra Evolve2 Headset",          "manufacturer": "Jabra",          "type": "Headset",         "led_count": 1},
    # Monitors
    {"id": "supp_samsung_g7",      "name": "Samsung Odyssey G7 Monitor",     "manufacturer": "Samsung",        "type": "Monitor",         "led_count": 4},
    {"id": "supp_lg_ultragear",    "name": "LG UltraGear 27GP950 Monitor",   "manufacturer": "LG",             "type": "Monitor",         "led_count": 4},
    # DIY / Arduino
    {"id": "supp_arduino_diy",     "name": "Arduino Nano RGB Strip (DIY)",   "manufacturer": "Arduino",        "type": "LED Strip",       "led_count": 30},
    {"id": "supp_esp32_diy",       "name": "ESP32 WLED Controller (DIY)",    "manufacturer": "Espressif",      "type": "LED Controller",  "led_count": 60},
    # Streaming gear
    {"id": "supp_elgato_keylight", "name": "Elgato Key Light Air",           "manufacturer": "Elgato",         "type": "Smart Light",     "led_count": 1},
    {"id": "supp_corsair_st100",   "name": "Corsair ST100 RGB Headset Stand","manufacturer": "Corsair",        "type": "Headset Stand",   "led_count": 8},
]
print(f"[Supplementary Catalog] {len(_SUPPLEMENTARY_CATALOG)} additional devices registered.", flush=True)

demo_devices = [
    # 1. Motherboards
    {"id": "asus_mb_demo", "name": "ASUS ROG Maximus Z790 (Demo)", "manufacturer": "ASUS", "type": "Motherboard", "led_count": 12},
    {"id": "msi_mb_demo", "name": "MSI MPG Z790 Carbon (Demo)", "manufacturer": "MSI", "type": "Motherboard", "led_count": 10},
    {"id": "gigabyte_mb_demo", "name": "Gigabyte AORUS Master Z790 (Demo)", "manufacturer": "Gigabyte", "type": "Motherboard", "led_count": 14},
    {"id": "asrock_mb_demo", "name": "ASRock Z790 Taichi (Demo)", "manufacturer": "ASRock", "type": "Motherboard", "led_count": 8},
    {"id": "biostar_mb_demo", "name": "Biostar Racing Z790GTA (Demo)", "manufacturer": "Biostar", "type": "Motherboard", "led_count": 6},
    {"id": "evga_mb_demo", "name": "EVGA Z790 Classified (Demo)", "manufacturer": "EVGA", "type": "Motherboard", "led_count": 8},
    {"id": "nzxt_mb_demo", "name": "NZXT N7 Z790 MB (Demo)", "manufacturer": "NZXT", "type": "Motherboard", "led_count": 16},
    
    # 2. GPUs (Nvidia & AMD reference + partners)
    {"id": "nvidia_gpu_demo", "name": "NVIDIA GeForce RTX 4090 FE (Demo)", "manufacturer": "NVIDIA", "type": "GPU", "led_count": 6},
    {"id": "amd_gpu_demo", "name": "AMD Radeon RX 7900 XTX Ref (Demo)", "manufacturer": "AMD", "type": "GPU", "led_count": 8},
    {"id": "zotac_gpu_demo", "name": "Zotac Gaming AMP Extreme (Demo)", "manufacturer": "Zotac", "type": "GPU", "led_count": 12},
    {"id": "colorful_gpu_demo", "name": "Colorful iGame Vulcan RTX (Demo)", "manufacturer": "Colorful", "type": "GPU", "led_count": 16},
    {"id": "pny_gpu_demo", "name": "PNY XLR8 Gaming VERTO (Demo)", "manufacturer": "PNY", "type": "GPU", "led_count": 10},
    {"id": "inno3d_gpu_demo", "name": "Inno3D ICHILL X3 RTX (Demo)", "manufacturer": "Inno3D", "type": "GPU", "led_count": 8},
    {"id": "galax_gpu_demo", "name": "Galax Serious Gaming RTX (Demo)", "manufacturer": "Galax", "type": "GPU", "led_count": 8},
    {"id": "palit_gpu_demo", "name": "Palit GameRock RTX 4090 (Demo)", "manufacturer": "Palit", "type": "GPU", "led_count": 18},
    {"id": "gainward_gpu_demo", "name": "Gainward Phantom RTX (Demo)", "manufacturer": "Gainward", "type": "GPU", "led_count": 10},
    {"id": "sapphire_gpu_demo", "name": "Sapphire Nitro+ Radeon (Demo)", "manufacturer": "Sapphire", "type": "GPU", "led_count": 12},
    {"id": "powercolor_gpu_demo", "name": "PowerColor Red Devil Radeon (Demo)", "manufacturer": "PowerColor", "type": "GPU", "led_count": 14},
    {"id": "xfx_gpu_demo", "name": "XFX Speedster MERC RX (Demo)", "manufacturer": "XFX", "type": "GPU", "led_count": 6},
    
    # 3. RAM Modules
    {"id": "samsung_ram_demo", "name": "Samsung RGB DDR5 (Demo)", "manufacturer": "Samsung", "type": "RAM", "led_count": 8},
    {"id": "skhynix_ram_demo", "name": "SK Hynix A-die RGB (Demo)", "manufacturer": "SK Hynix", "type": "RAM", "led_count": 8},
    {"id": "micron_ram_demo", "name": "Micron Crucial RGB (Demo)", "manufacturer": "Micron", "type": "RAM", "led_count": 10},
    {"id": "gskill_ram_demo", "name": "G.Skill Trident Z5 RGB (Demo)", "manufacturer": "G.Skill", "type": "RAM", "led_count": 12},
    {"id": "corsair_ram_demo", "name": "Corsair Dominator Platinum (Demo)", "manufacturer": "Corsair", "type": "RAM", "led_count": 12},
    {"id": "kingston_ram_demo", "name": "Kingston FURY Beast DDR5 (Demo)", "manufacturer": "Kingston", "type": "RAM", "led_count": 10},
    {"id": "teamgroup_ram_demo", "name": "T-Force Delta RGB DDR5 (Demo)", "manufacturer": "TeamGroup", "type": "RAM", "led_count": 16},
    {"id": "adata_ram_demo", "name": "ADATA XPG Lancer RGB (Demo)", "manufacturer": "ADATA", "type": "RAM", "led_count": 12},
    {"id": "geil_ram_demo", "name": "GeIL Polaris RGB DDR5 (Demo)", "manufacturer": "GeIL", "type": "RAM", "led_count": 8},
    {"id": "klevv_ram_demo", "name": "KLEVV CRAS XR5 RGB (Demo)", "manufacturer": "KLEVV", "type": "RAM", "led_count": 10},
    {"id": "crucial_ram_demo", "name": "Crucial Ballistix RGB (Demo)", "manufacturer": "Crucial", "type": "RAM", "led_count": 8},
    {"id": "oloy_ram_demo", "name": "OLOY Blade RGB DDR5 (Demo)", "manufacturer": "OLOY", "type": "RAM", "led_count": 10},
    
    # 4. Gaming Gear & Peripherals
    {"id": "razer_mouse_demo", "name": "Razer Basilisk V3 Pro (Demo)", "manufacturer": "Razer", "type": "Mouse", "led_count": 11},
    {"id": "logitech_kb_demo", "name": "Logitech G Pro X Superlight (Demo)", "manufacturer": "Logitech", "type": "Mouse", "led_count": 1},
    {"id": "steelseries_mousepad_demo", "name": "SteelSeries QcK Prism (Demo)", "manufacturer": "SteelSeries", "type": "Other", "led_count": 12},
    {"id": "roccat_mouse_demo", "name": "Roccat Kone XP Air (Demo)", "manufacturer": "Roccat", "type": "Mouse", "led_count": 22},
    {"id": "hyperx_kb_demo", "name": "HyperX Alloy Elite 2 (Demo)", "manufacturer": "HyperX", "type": "Keyboard", "led_count": 80},
    {"id": "glorious_mouse_demo", "name": "Glorious Model O 2 (Demo)", "manufacturer": "Glorious", "type": "Mouse", "led_count": 8},
    {"id": "keychron_kb_demo", "name": "Keychron Q1 Max (Demo)", "manufacturer": "Keychron", "type": "Keyboard", "led_count": 81},
    {"id": "wooting_kb_demo", "name": "Wooting 60HE Hall Effect (Demo)", "manufacturer": "Wooting", "type": "Keyboard", "led_count": 61},
    {"id": "alienware_kb_demo", "name": "Alienware Tri-Mode Wireless (Demo)", "manufacturer": "Alienware", "type": "Keyboard", "led_count": 87},
    {"id": "hp_mouse_demo", "name": "HP Omen Vector Mouse (Demo)", "manufacturer": "HP", "type": "Mouse", "led_count": 6},
    {"id": "lenovo_kb_demo", "name": "Lenovo Legion K500 TKL (Demo)", "manufacturer": "Lenovo", "type": "Keyboard", "led_count": 87},
    {"id": "thermaltake_fan_demo", "name": "ThermalTake Riing Trio Fan (Demo)", "manufacturer": "ThermalTake", "type": "Fans", "led_count": 30},
    
    # 5. VIA/QMK USB HID Keyboard Spec
    {
        "id": "via_qmk_kb_demo", 
        "name": "VIA/QMK Custom Keyboard (Demo)", 
        "manufacturer": "VIA_QMK", 
        "type": "Custom Keyboard", 
        "led_count": len(via_qmk_key_layout),
        "key_layout": via_qmk_key_layout
    },
    # 6. Smart Lights / IoT
    {
        "id": "philips_hue_demo",
        "name": "Philips Hue Play Lightbar (Demo)",
        "manufacturer": "Philips_Hue",
        "type": "Smart Light",
        "led_count": 2,
        "lightbar_layout": True
    },
    {
        "id": "nanoleaf_demo",
        "name": "Nanoleaf Shapes Hexagons (Demo)",
        "manufacturer": "Nanoleaf",
        "type": "Smart Light",
        "led_count": 7,
        "panels": [
            {"id": 0, "x": 150, "y": 90},
            {"id": 1, "x": 105, "y": 64},
            {"id": 2, "x": 105, "y": 116},
            {"id": 3, "x": 195, "y": 64},
            {"id": 4, "x": 195, "y": 116},
            {"id": 5, "x": 150, "y": 38},
            {"id": 6, "x": 150, "y": 142}
        ]
    },
    {
        "id": "govee_demo",
        "name": "Govee Neon Rope Light (Demo)",
        "manufacturer": "Govee",
        "type": "Smart Light",
        "led_count": 24,
        "rope_layout": [
            {"index": i, "x": float(round(30 + (i / 23.0) * 340, 1)), "y": float(round(70 + 45 * math.sin((i / 23.0) * math.pi * 3), 1))}
            for i in range(24)
        ]
    },
    # 7. Chinese Gaming Gears
    {
        "id": "aula_demo", 
        "name": "Aula F87 TKL Keyboard (Demo)", 
        "manufacturer": "Aula", 
        "type": "Keyboard", 
        "led_count": 87,
        "key_layout": generate_tkl_layout()
    },
    {
        "id": "vgn_demo",
        "name": "VGN Dragonfly F1 Pro (Demo)",
        "manufacturer": "VGN",
        "type": "Mouse",
        "led_count": 12,
        "leds": [{"r": 0, "g": 180, "b": 255} for _ in range(12)]
    },
    {
        "id": "vxe_demo",
        "name": "VXE Dragonfly R1 (Demo)",
        "manufacturer": "VXE",
        "type": "Mouse",
        "led_count": 12,
        "leds": [{"r": 0, "g": 180, "b": 255} for _ in range(12)]
    },

    # 8. SteelSeries
    {"id": "steelseries_apex_demo", "name": "SteelSeries Apex Pro TKL (Demo)", "manufacturer": "SteelSeries", "type": "Keyboard", "led_count": 87},
    {"id": "steelseries_rival_demo", "name": "SteelSeries Rival 5 (Demo)", "manufacturer": "SteelSeries", "type": "Mouse", "led_count": 9},
    {"id": "steelseries_arctis_demo", "name": "SteelSeries Arctis Nova Pro (Demo)", "manufacturer": "SteelSeries", "type": "Headset", "led_count": 4},

    # 9. OpenRGB pass-through
    {"id": "openrgb_mb_demo", "name": "OpenRGB — Motherboard (Demo)", "manufacturer": "OpenRGB", "type": "Motherboard", "led_count": 16},
    {"id": "openrgb_gpu_demo", "name": "OpenRGB — GPU (Demo)", "manufacturer": "OpenRGB", "type": "GPU", "led_count": 16},
    {"id": "openrgb_ram_demo", "name": "OpenRGB — RAM Sticks (Demo)", "manufacturer": "OpenRGB", "type": "RAM", "led_count": 16},

    # 10. WLED
    {
        "id": "wled_strip_demo",
        "name": "WLED LED Strip (Demo)",
        "manufacturer": "WLED",
        "type": "LED Strip",
        "led_count": 60,
        "rope_layout": [
            {"index": i, "x": float(round(10 + (i / 59.0) * 480, 1)), "y": float(round(80 + 40 * math.sin((i / 59.0) * math.pi * 4), 1))}
            for i in range(60)
        ]
    },

    # 11. Lian Li
    {"id": "lianli_unifan_demo", "name": "Lian Li UNI FAN SL120 x3 (Demo)", "manufacturer": "Lian Li", "type": "Fans", "led_count": 48},
    {"id": "lianli_lancool_demo", "name": "Lian Li Lancool III ARGB (Demo)", "manufacturer": "Lian Li", "type": "Case", "led_count": 24},

    # 12. Cooler Master
    {"id": "coolermaster_fan_demo", "name": "Cooler Master MasterFan SF360 (Demo)", "manufacturer": "Cooler Master", "type": "Fans", "led_count": 24},
    {"id": "coolermaster_aio_demo", "name": "Cooler Master MasterLiquid 360 (Demo)", "manufacturer": "Cooler Master", "type": "AIO Cooler", "led_count": 12},
    {"id": "coolermaster_kb_demo", "name": "Cooler Master MK770 Hybrid (Demo)", "manufacturer": "Cooler Master", "type": "Keyboard", "led_count": 87},

    # 13. NZXT
    {"id": "nzxt_kraken_demo", "name": "NZXT Kraken Elite 360 (Demo)", "manufacturer": "NZXT", "type": "AIO Cooler", "led_count": 9},
    {"id": "nzxt_fan_demo", "name": "NZXT F120 RGB x3 (Demo)", "manufacturer": "NZXT", "type": "Fans", "led_count": 24},
    {"id": "nzxt_case_demo", "name": "NZXT H9 Flow RGB Case (Demo)", "manufacturer": "NZXT", "type": "Case", "led_count": 8},

    # 14. Case / Cooling brands
    {"id": "phanteks_demo", "name": "Phanteks D30 DRGB Fan x3 (Demo)", "manufacturer": "Phanteks", "type": "Fans", "led_count": 30},
    {"id": "deepcool_demo", "name": "Deepcool AK620 Digital (Demo)", "manufacturer": "Deepcool", "type": "CPU Cooler", "led_count": 6},
    {"id": "ekwb_demo", "name": "EKWB Quantum Velocity2 Block (Demo)", "manufacturer": "EKWB", "type": "Waterblock", "led_count": 12},
    {"id": "thermaltake_fan2_demo", "name": "ThermalTake SWAFAN EX14 ARGB (Demo)", "manufacturer": "ThermalTake", "type": "Fans", "led_count": 16},

    # 15. Smart lighting
    {"id": "lifx_demo", "name": "LIFX Color 1100lm Bulb (Demo)", "manufacturer": "LIFX", "type": "Smart Light", "led_count": 1},
    {"id": "yeelight_demo", "name": "Yeelight LED Strip 1S (Demo)", "manufacturer": "Yeelight", "type": "Smart Light", "led_count": 20},
    {"id": "elgato_demo", "name": "Elgato Key Light Air (Demo)", "manufacturer": "Elgato", "type": "Smart Light", "led_count": 1},

    # 16. Gaming peripherals
    {"id": "mountain_demo", "name": "Mountain Everest Max (Demo)", "manufacturer": "Mountain", "type": "Keyboard", "led_count": 110},
    {"id": "endgamegear_demo", "name": "Endgame Gear KB65HE (Demo)", "manufacturer": "EndgameGear", "type": "Keyboard", "led_count": 68},
    {"id": "fnatic_demo", "name": "Fnatic miniStreak RGB (Demo)", "manufacturer": "Fnatic", "type": "Keyboard", "led_count": 87},
    {"id": "redragon_demo", "name": "Redragon K530 Draconic (Demo)", "manufacturer": "Redragon", "type": "Keyboard", "led_count": 61},
    {"id": "ducky_demo", "name": "Ducky One 3 TKL (Demo)", "manufacturer": "Ducky", "type": "Keyboard", "led_count": 87},
    {"id": "secretlab_demo", "name": "Secretlab TITAN Evo Keyboard (Demo)", "manufacturer": "Secretlab", "type": "Keyboard", "led_count": 87},

    # 17. VIA/QMK boutique keyboards
    {
        "id": "zsa_moonlander_demo",
        "name": "ZSA Moonlander MkI (Demo)",
        "manufacturer": "ZSA",
        "type": "Custom Keyboard",
        "led_count": 72,
        "key_layout": via_qmk_key_layout
    },
    {
        "id": "drop_alt_demo",
        "name": "DROP ALT High-Profile (Demo)",
        "manufacturer": "Drop",
        "type": "Custom Keyboard",
        "led_count": 67,
        "key_layout": via_qmk_key_layout
    },
    {
        "id": "gmmk_pro_demo",
        "name": "GMMK Pro 75% (Demo)",
        "manufacturer": "GMMK",
        "type": "Custom Keyboard",
        "led_count": 83,
        "key_layout": via_qmk_key_layout
    },
    {
        "id": "akko_3087_demo",
        "name": "Akko 3087 V2 RGB (Demo)",
        "manufacturer": "Akko",
        "type": "Custom Keyboard",
        "led_count": 87,
        "key_layout": via_qmk_key_layout
    },
    {
        "id": "epomaker_th80_demo",
        "name": "Epomaker TH80 Pro (Demo)",
        "manufacturer": "Epomaker",
        "type": "Custom Keyboard",
        "led_count": 81,
        "key_layout": via_qmk_key_layout
    },
    {
        "id": "nuphy_air75_demo",
        "name": "NuPhy Air75 V2 (Demo)",
        "manufacturer": "NuPhy",
        "type": "Custom Keyboard",
        "led_count": 75,
        "key_layout": via_qmk_key_layout
    },
    {
        "id": "monsgeek_m1w_demo",
        "name": "MonsGeek M1W (Demo)",
        "manufacturer": "MonsGeek",
        "type": "Custom Keyboard",
        "led_count": 75,
        "key_layout": via_qmk_key_layout
    },
    {
        "id": "owlab_spring_demo",
        "name": "OwLab Spring (Demo)",
        "manufacturer": "OwLab",
        "type": "Custom Keyboard",
        "led_count": 65,
        "key_layout": via_qmk_key_layout
    },
    {
        "id": "mode_envoy_demo",
        "name": "Mode Designs Envoy (Demo)",
        "manufacturer": "Mode",
        "type": "Custom Keyboard",
        "led_count": 65,
        "key_layout": via_qmk_key_layout
    },
    {
        "id": "cannonkeys_satisfaction_demo",
        "name": "Cannonkeys Satisfaction75 (Demo)",
        "manufacturer": "Cannonkeys",
        "type": "Custom Keyboard",
        "led_count": 83,
        "key_layout": via_qmk_key_layout
    },
]

def load_custom_devices():
    custom_path = os.path.join(os.path.dirname(__file__), "custom_devices.json")
    if os.path.exists(custom_path):
        try:
            with open(custom_path, 'r', encoding='utf-8') as f:
                custom_list = json.load(f)
                for dev_info in custom_list:
                    dev_id = dev_info["id"]
                    handlers[dev_id] = CustomHidController(dev_info)
                    if handlers[dev_id].connected:
                        device_states[dev_id] = handlers[dev_id].get_devices()[0]
                    else:
                        device_states[dev_id] = {
                            "id": dev_id,
                            "name": dev_info["name"] + " (Demo)",
                            "manufacturer": dev_info.get("manufacturer", "Custom"),
                            "type": dev_info["type"],
                            "led_count": dev_info["led_count"],
                            "leds": [{"r": 0, "g": 180, "b": 255} for _ in range(dev_info["led_count"])]
                        }
        except Exception as e:
            print(f"Error loading custom devices: {e}")

def init_device_states():
    # 1. Load custom devices first
    load_custom_devices()
    
    # 2. Load physical connected devices
    for name, handler in handlers.items():
        if handler.connected:
            for dev in handler.get_devices():
                device_states[dev["id"]] = dev
                
    # Manufacturer display name → handler key overrides for multi-word / special cases
    _MFR_KEY_MAP = {
        "lian li": "lianli", "cooler master": "coolermaster",
        "sk hynix": "skhynix", "g.skill": "gskill",
        "philips hue": "philips_hue", "philips_hue": "philips_hue",
        "via_qmk": "via_qmk", "via/qmk": "via_qmk",
        "steelseries": "steelseries", "openrgb": "openrgb",
        "wled": "wled", "nzxt": "nzxt",
        "endgamegear": "endgamegear", "owlab": "owlab",
    }

    def _add_demo(d):
        """Add a demo device entry if its brand has no active physical connection."""
        manufacturer_key = d["manufacturer"].lower()
        manufacturer_key = _MFR_KEY_MAP.get(manufacturer_key, manufacturer_key)
        handler = handlers.get(manufacturer_key)
        is_physical_active = (
            handler and handler.connected and
            any(pd["manufacturer"] == d["manufacturer"]
                for pd in handler.get_devices())
        )
        if not is_physical_active and d["id"] not in device_states:
            device_states[d["id"]] = {
                "id":           d["id"],
                "name":         d["name"],
                "manufacturer": d["manufacturer"],
                "type":         d["type"],
                "led_count":    d["led_count"],
                "leds":         [{"r": 0, "g": 180, "b": 255} for _ in range(d["led_count"])],
                "key_layout":   d.get("key_layout", []),
                "panels":       d.get("panels", []),
                "rope_layout":  d.get("rope_layout", []),
                "lightbar_layout": d.get("lightbar_layout", False),
                "openrgb_source":  d.get("openrgb_source", False),
            }

    # 3. Hand-curated demo devices
    for d in demo_devices:
        _add_demo(d)

    # 4. OpenRGB catalog devices (populated in background thread)
    for d in _openrgb_catalog_cache:
        _add_demo(d)

    # 5. Supplementary catalog (WLED, smart home, extra brands)
    for d in _SUPPLEMENTARY_CATALOG:
        _add_demo(d)

    # Initialize all default device modes to sync
    for dev_id in device_states:
        device_modes[dev_id] = "sync"

init_device_states()

# --- Routing / APIs ---

_PUBLIC_DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)), 'public')

@app.route('/')
def index():
    return send_from_directory(_PUBLIC_DIR, 'index.html')

@app.route('/<path:path>')
def serve_static(path):
    return send_from_directory(_PUBLIC_DIR, path)

@app.route('/api/nanoleaf/connect', methods=['POST'])
def nanoleaf_manual_connect():
    """수동 IP로 Nanoleaf 연결 시도"""
    data = request.get_json(silent=True) or {}
    ip = (data.get('ip') or '').strip()
    if not ip:
        return jsonify({"ok": False, "message": "IP 주소가 필요합니다."}), 400

    nl = handlers.get("nanoleaf")
    if not nl:
        return jsonify({"ok": False, "message": "Nanoleaf 핸들러를 찾을 수 없습니다."}), 500

    def _try_connect():
        nl.ip = ip
        # 직접 인증 시도
        try:
            import requests as _req
            # 저장된 토큰 확인
            if os.path.exists(nl.config_path):
                with open(nl.config_path) as f:
                    cfg = json.load(f)
                if cfg.get('ip') == ip and cfg.get('auth_token'):
                    nl.auth_token = cfg['auth_token']
                    r = _req.get(f"http://{ip}:16021/api/v1/{nl.auth_token}", timeout=3)
                    if r.status_code == 200:
                        nl.connected = True
                        sdk_status["nanoleaf"] = "Connected"
                        nl.update_layout()
                        return True, "저장된 토큰으로 연결 성공"

            # 신규 토큰 요청 (패널 버튼 5초 누른 후)
            r = _req.post(f"http://{ip}:16021/api/v1/new", timeout=5)
            if r.status_code == 200:
                nl.auth_token = r.json().get('auth_token')
                nl.connected = True
                sdk_status["nanoleaf"] = "Connected"
                with open(nl.config_path, 'w') as f:
                    json.dump({'ip': ip, 'auth_token': nl.auth_token}, f)
                nl.update_layout()
                return True, "Nanoleaf 연결 성공 (새 토큰 발급)"
            elif r.status_code == 403:
                return False, "Nanoleaf 패널의 전원 버튼을 5~7초 누른 후 다시 시도하세요."
            else:
                return False, f"응답 코드 {r.status_code}"
        except Exception as e:
            return False, str(e)

    try:
        ok, msg = _try_connect()
        return jsonify({"ok": ok, "message": msg})
    except Exception as e:
        return jsonify({"ok": False, "message": str(e)}), 500


# ── 버전 / 자동업데이트 ───────────────────────────────────────
_VERSION_FILE = os.path.join(os.path.dirname(__file__), 'version.txt')
try:
    with open(_VERSION_FILE) as _f:
        APP_VERSION = _f.read().strip()
except Exception:
    APP_VERSION = '1.3.0'

GITHUB_REPO = 'impressionistfisherman/color-dock'

@app.route('/api/version', methods=['GET'])
def get_version():
    return jsonify({'version': APP_VERSION, 'repo': GITHUB_REPO})

@app.route('/api/update/download', methods=['POST'])
def download_update():
    """최신 인스톨러를 다운로드 후 실행"""
    data = request.get_json(silent=True) or {}
    url  = data.get('url', '').strip()
    if not url or not url.startswith('https://'):
        return jsonify({'ok': False, 'error': '유효하지 않은 URL'})
    try:
        import tempfile, subprocess
        tmp = tempfile.mktemp(suffix='_ColorDock_Setup.exe')
        def _dl_and_run():
            try:
                r = requests.get(url, timeout=60, stream=True)
                with open(tmp, 'wb') as f:
                    for chunk in r.iter_content(65536):
                        f.write(chunk)
                # 인스톨러 실행 (silent 모드)
                subprocess.Popen([tmp, '/SILENT', '/CLOSEAPPLICATIONS'],
                                  creationflags=0x00000008)
            except Exception as e:
                print(f'[Update] download/run error: {e}')
        threading.Thread(target=_dl_and_run, daemon=True).start()
        return jsonify({'ok': True})
    except Exception as e:
        return jsonify({'ok': False, 'error': str(e)})

@app.route('/api/update/check', methods=['GET'])
def check_update():
    try:
        url = f'https://api.github.com/repos/{GITHUB_REPO}/releases/latest'
        res = requests.get(url, timeout=5, headers={'Accept': 'application/vnd.github.v3+json'})
        if res.status_code != 200:
            return jsonify({'update': False, 'error': f'GitHub API {res.status_code}'})
        data = res.json()
        latest = data.get('tag_name', '').lstrip('v')
        notes  = data.get('body', '')
        assets = data.get('assets', [])
        # 인스톨러 asset 찾기
        installer_url = next(
            (a['browser_download_url'] for a in assets
             if a['name'].endswith('.exe') and 'Setup' in a['name']),
            None
        )
        # 버전 비교
        def _ver(v): return tuple(int(x) for x in v.split('.'))
        has_update = latest and _ver(latest) > _ver(APP_VERSION)
        return jsonify({
            'update': has_update,
            'current': APP_VERSION,
            'latest': latest,
            'notes': notes,
            'installer_url': installer_url,
        })
    except Exception as e:
        return jsonify({'update': False, 'error': str(e)})

@app.route('/api/status', methods=['GET'])
def get_status():
    return jsonify({
        "status": "Success",
        "active_mode": "ColorDock Hybrid Sync Matrix Engine",
        "sdks": sdk_status
    })

@app.route('/api/catalog', methods=['GET'])
def get_catalog_status():
    import threading as _threading
    thread_names = [t.name for t in _threading.enumerate()]
    return jsonify({
        "cached": len(_openrgb_catalog_cache),
        "live_orgb_devices": sum(1 for d in device_states.values() if d.get("openrgb_source")),
        "threads": thread_names,
        "sample": [d["name"] for d in _openrgb_catalog_cache[:5]]
    })

@app.route('/api/devices', methods=['GET'])
def get_devices_api():
    res_devices = []
    for dev_id, dev in device_states.items():
        dev_copy = dev.copy()
        dev_copy["mode"] = device_modes.get(dev_id, "sync")
        res_devices.append(dev_copy)
    return jsonify(res_devices)

@app.route('/api/color/all', methods=['POST'])
def set_all_color():
    data = request.json
    r = data.get("r", 0)
    g = data.get("g", 0)
    b = data.get("b", 0)
    
    # 1. Update memory (sync 모드 기기만)
    with state_lock:
        for dev_id in device_states:
            if device_modes.get(dev_id, "sync") != "sync":
                continue
            for led in device_states[dev_id]["leds"]:
                led["r"] = r
                led["g"] = g
                led["b"] = b

    # 2. Update physical SDKs
    for name, handler in handlers.items():
        if handler.connected:
            try:
                if name == "asus":
                    for i in range(len(handler.get_devices())):
                        handler.set_color(i, r, g, b)
                elif name in ["corsair", "msi"]:
                    for i in range(len(handler.get_devices())):
                        handler.set_color(i, r, g, b)
                elif name in ["logitech", "razer", "via_qmk", "philips_hue", "nanoleaf", "govee",
                              "steelseries", "openrgb", "wled", "lianli", "coolermaster", "nzxt",
                              "aula", "vgn", "vxe"]:
                    handler.set_color(r, g, b)
            except Exception as e:
                print(f"Error sending master color to {name}: {e}")
        
    return jsonify({"status": "OK"})

@app.route('/api/color/device', methods=['POST'])
def set_device_color():
    data = request.json
    dev_id = data.get("id")
    r = data.get("r", 0)
    g = data.get("g", 0)
    b = data.get("b", 0)

    if dev_id in device_states:
        with state_lock:
            for led in device_states[dev_id]["leds"]:
                led["r"] = r
                led["g"] = g
                led["b"] = b

        if not dev_id.endswith("_demo"):
            prefix = dev_id.rsplit("_", 1)[0]
            handler = handlers.get(dev_id) or handlers.get(prefix)
            if handler and handler.connected:
                try:
                    if prefix in ["asus", "corsair", "msi"]:
                        idx = int(dev_id.split("_")[1])
                        handler.set_color(idx, r, g, b)
                    else:
                        handler.set_color(r, g, b)
                except Exception:
                    pass

        return jsonify({"status": "OK"})
    return jsonify({"status": "Device not found"}), 404

@app.route('/api/color/led', methods=['POST'])
def set_led_color():
    data = request.json
    dev_id = data.get("device_id")
    led_idx = data.get("led_index")
    r = data.get("r", 0)
    g = data.get("g", 0)
    b = data.get("b", 0)

    if dev_id in device_states and 0 <= led_idx < len(device_states[dev_id]["leds"]):
        with state_lock:
            device_states[dev_id]["leds"][led_idx] = {"r": r, "g": g, "b": b}
            colors_list = [(l["r"], l["g"], l["b"]) for l in device_states[dev_id]["leds"]]

        if not dev_id.endswith("_demo"):
            if dev_id.startswith("asus_") and handlers["asus"].connected:
                idx = int(dev_id.split("_")[1])
                handlers["asus"].set_led_colors(idx, colors_list)
            elif dev_id.startswith("via_qmk_") and handlers["via_qmk"].connected:
                handlers["via_qmk"].set_led_colors(colors_list)
            elif dev_id.startswith("philips_hue_") and handlers["philips_hue"].connected:
                handlers["philips_hue"].set_led_colors(colors_list)
            elif dev_id.startswith("nanoleaf_") and handlers["nanoleaf"].connected:
                handlers["nanoleaf"].set_led_colors(colors_list)
            elif dev_id.startswith("govee_") and handlers["govee"].connected:
                handlers["govee"].set_led_colors(colors_list)
            else:
                prefix = dev_id.rsplit("_", 1)[0]
                handler = handlers.get(dev_id) or handlers.get(prefix)
                if handler and handler.connected:
                    try:
                        handler.set_led_colors(colors_list)
                    except Exception:
                        pass

        return jsonify({"status": "OK"})
    return jsonify({"status": "LED or Device not found"}), 404

@app.route('/api/color/device_array', methods=['POST'])
def set_device_array():
    data = request.json
    dev_id = data.get("id")
    colors = data.get("colors")

    if dev_id in device_states and colors:
        led_count = len(device_states[dev_id]["leds"])
        with state_lock:
            for i in range(min(led_count, len(colors))):
                device_states[dev_id]["leds"][i] = {
                    "r": colors[i][0],
                    "g": colors[i][1],
                    "b": colors[i][2]
                }

        if not dev_id.endswith("_demo"):
            if dev_id.startswith("asus_") and handlers["asus"].connected:
                idx = int(dev_id.split("_")[1])
                handlers["asus"].set_led_colors(idx, colors)
            elif dev_id.startswith("via_qmk_") and handlers["via_qmk"].connected:
                handlers["via_qmk"].set_led_colors(colors)
            elif dev_id.startswith("philips_hue_") and handlers["philips_hue"].connected:
                handlers["philips_hue"].set_led_colors(colors)
            elif dev_id.startswith("nanoleaf_") and handlers["nanoleaf"].connected:
                handlers["nanoleaf"].set_led_colors(colors)
            elif dev_id.startswith("govee_") and handlers["govee"].connected:
                handlers["govee"].set_led_colors(colors)
            else:
                prefix = dev_id.rsplit("_", 1)[0]
                handler = handlers.get(dev_id) or handlers.get(prefix)
                if handler and handler.connected:
                    try:
                        handler.set_led_colors(colors)
                    except Exception:
                        pass

        return jsonify({"status": "OK"})
    return jsonify({"status": "Device or invalid data"}), 400

def sensor_polling_loop():
    global cpu_load, ram_load, cpu_temp
    if not HAS_WIN32:
        return
    pythoncom.CoInitialize()
    wmi = None
    wmi_wmi = None
    try:
        wmi = win32com.client.GetObject("winmgmts:\\\\.\\root\\cimv2")
        try:
            wmi_wmi = win32com.client.GetObject("winmgmts:\\\\.\\root\\wmi")
        except Exception:
            pass
    except Exception as e:
        print(f"WMI Connection failed: {e}")

    while sensor_thread_running:
        # 1. CPU Load
        cpu_val = 0.0
        if wmi:
            try:
                res = wmi.ExecQuery("select PercentProcessorTime from Win32_PerfFormattedData_PerfOS_Processor where Name='_Total'")
                for item in res:
                    cpu_val = float(item.PercentProcessorTime)
                    break
            except Exception:
                pass
        cpu_load = cpu_val
        
        # 2. RAM Load
        ram_val = 0.0
        if wmi:
            try:
                res = wmi.ExecQuery("select FreePhysicalMemory, TotalVisibleMemorySize from Win32_OperatingSystem")
                for item in res:
                    free = float(item.FreePhysicalMemory)
                    total = float(item.TotalVisibleMemorySize)
                    if total > 0:
                        ram_val = ((total - free) / total) * 100.0
                    break
            except Exception:
                pass
        ram_load = ram_val
        
        # 3. CPU Temp
        temp_val = 0.0
        temp_success = False
        if wmi_wmi:
            try:
                res = wmi_wmi.ExecQuery("select CurrentTemperature from MSAcpi_ThermalZoneTemperature")
                for item in res:
                    temp_kelvin_tenths = float(item.CurrentTemperature)
                    temp_val = (temp_kelvin_tenths / 10.0) - 273.15
                    temp_success = True
                    break
            except Exception:
                pass
                
        if temp_success:
            cpu_temp = temp_val
        else:
            # Fallback thermodynamic model
            target_temp = 38.0 + (cpu_load * 0.47)
            cpu_temp = cpu_temp * 0.9 + target_temp * 0.1
            
        time.sleep(1.0)
    pythoncom.CoUninitialize()

def screen_capture_loop():
    global screen_ambient_color
    if not HAS_WIN32:
        return
    try:
        width = win32api.GetSystemMetrics(0)
        height = win32api.GetSystemMetrics(1)
    except Exception:
        width = 1920
        height = 1080
        
    border_thickness = 80 # px
    
    while screen_thread_running:
        any_device_ambient = any(mode == "ambient" for mode in device_modes.values())
        if active_mode == "ambient" or any_device_ambient:
            try:
                hdcScreen = win32gui.GetDC(0)
                hdcMem = win32gui.CreateCompatibleDC(hdcScreen)
                hBitmap = win32gui.CreateCompatibleBitmap(hdcScreen, 1, 1)
                hOld = win32gui.SelectObject(hdcMem, hBitmap)
                
                win32gui.SetStretchBltMode(hdcMem, win32con.HALFTONE)
                
                # Sample border regions
                win32gui.StretchBlt(hdcMem, 0, 0, 1, 1, hdcScreen, 0, 0, width, border_thickness, win32con.SRCCOPY)
                pix_top = win32gui.GetPixel(hdcMem, 0, 0)
                
                win32gui.StretchBlt(hdcMem, 0, 0, 1, 1, hdcScreen, 0, height - border_thickness, width, border_thickness, win32con.SRCCOPY)
                pix_bottom = win32gui.GetPixel(hdcMem, 0, 0)
                
                win32gui.StretchBlt(hdcMem, 0, 0, 1, 1, hdcScreen, 0, border_thickness, border_thickness, height - 2*border_thickness, win32con.SRCCOPY)
                pix_left = win32gui.GetPixel(hdcMem, 0, 0)
                
                win32gui.StretchBlt(hdcMem, 0, 0, 1, 1, hdcScreen, width - border_thickness, border_thickness, border_thickness, height - 2*border_thickness, win32con.SRCCOPY)
                pix_right = win32gui.GetPixel(hdcMem, 0, 0)
                
                win32gui.SelectObject(hdcMem, hOld)
                win32gui.DeleteObject(hBitmap)
                win32gui.DeleteDC(hdcMem)
                win32gui.ReleaseDC(0, hdcScreen)
                
                r_tot, g_tot, b_tot = 0, 0, 0
                for pix in [pix_top, pix_bottom, pix_left, pix_right]:
                    r_tot += pix & 0xFF
                    g_tot += (pix >> 8) & 0xFF
                    b_tot += (pix >> 16) & 0xFF
                    
                screen_ambient_color = (int(r_tot / 4), int(g_tot / 4), int(b_tot / 4))
            except Exception as e:
                print(f"Screen capture error: {e}")
        time.sleep(0.05)

def lol_polling_loop():
    global game_event_active, game_event_end_time, game_ult_ready
    last_kills = 0
    init_kills = False
    
    while lol_thread_running:
        if active_mode == "game":
            try:
                res = requests.get("https://127.0.0.1:2999/liveclientdata/allgamedata", verify=False, timeout=0.3)
                if res.status_code == 200:
                    data = res.json()
                    active_player = data.get("activePlayer", {})
                    summoner_name = active_player.get("summonerName")
                    
                    all_players = data.get("allPlayers", [])
                    is_dead = False
                    player_scores = {}
                    for player in all_players:
                        if player.get("summonerName") == summoner_name:
                            is_dead = player.get("isDead", False)
                            player_scores = player.get("scores", {})
                            break
                            
                    if is_dead:
                        if game_event_active != "death":
                            game_event_active = "death"
                            game_event_end_time = time.time() + 5.0
                    
                    kills = player_scores.get("kills", 0)
                    if not init_kills:
                        last_kills = kills
                        init_kills = True
                    elif kills > last_kills:
                        game_event_active = "kill"
                        game_event_end_time = time.time() + 3.0
                        last_kills = kills
                        
                    abilities = active_player.get("abilities", {})
                    r_ability = abilities.get("R", {})
                    cooldown = r_ability.get("cooldownRemaining", 0.0)
                    game_ult_ready = (cooldown <= 0.1)
            except Exception:
                pass
        time.sleep(0.5)

def _sensor_color(step):
    """Map cpu_temp + step counter to an RGB tuple."""
    if cpu_temp <= 50.0:
        factor = max(0.0, min(1.0, (cpu_temp - 30.0) / 20.0)) if cpu_temp > 30.0 else 0.0
        return (0, int(230 - 50 * factor), int(118 + 137 * factor))
    elif cpu_temp <= 75.0:
        factor = (cpu_temp - 50.0) / 25.0
        return (int(255 * factor), int(180 * (1 - factor) + 120 * factor), int(255 * (1 - factor)))
    else:
        flash = 1 if (step % 8 < 4) else 0
        return (255 * flash, 0, 0)


def backend_lighting_loop():
    global active_mode, game_event_active, game_event_end_time, game_ult_ready, eff_hue
    step = 0
    while lighting_thread_running:
        step += 1
        now = time.time()

        if game_event_active and now > game_event_end_time:
            game_event_active = None

        # Snapshot globals used per-tick outside the lock
        cur_mode = active_mode
        cur_ambient = screen_ambient_color
        cur_breath_base = breath_base_color
        cur_hue = eff_hue
        cur_game_event = game_event_active
        cur_ult = game_ult_ready

        # Advance rainbow hue (shared across devices for visual coherence)
        eff_hue = (eff_hue + 1.5) % 360

        # Collect per-device color arrays inside the lock, send to hardware outside
        send_queue = []  # [(dev_id, colors_list)]

        with state_lock:
            for dev_id, dev in device_states.items():
                dev_mode = device_modes.get(dev_id, "sync")
                if dev_mode == "disabled":
                    continue

                # Determine which effect to run for this device
                if dev_mode == "independent":
                    # Independent devices use their own stored first-LED color as base
                    leds = dev["leds"]
                    base = (leds[0]["r"], leds[0]["g"], leds[0]["b"]) if leds else cur_breath_base
                    effect = dev.get("effect", cur_mode)
                else:
                    # Sync devices use the global active_mode
                    base = cur_breath_base
                    effect = cur_mode

                if effect not in DYNAMIC_EFFECTS:
                    continue

                led_count = dev.get("led_count", len(dev["leds"]))
                colors = []

                if effect == "rainbow":
                    for i in range(led_count):
                        hue = (cur_hue + i * (360 / max(led_count, 1))) % 360
                        colors.append(hsl_to_rgb(hue / 360, 1.0, 0.5))

                elif effect == "breathing":
                    bf = (math.sin(step * 0.08) + 1) / 2
                    r = int(base[0] * bf)
                    g = int(base[1] * bf)
                    b = int(base[2] * bf)
                    colors = [(r, g, b)] * led_count

                elif effect == "strobe":
                    on = (step % 6) < 2
                    c = base if on else (0, 0, 0)
                    colors = [c] * led_count

                elif effect == "wave":
                    for i in range(led_count):
                        phase = (step * 0.15 + i * (2 * math.pi / max(led_count, 1)))
                        bf = (math.sin(phase) + 1) / 2
                        colors.append((int(base[0] * bf), int(base[1] * bf), int(base[2] * bf)))

                elif effect == "sensor":
                    sr, sg, sb = _sensor_color(step)
                    colors = [(sr, sg, sb)] * led_count

                elif effect == "ambient":
                    ar, ag, ab = cur_ambient
                    colors = [(ar, ag, ab)] * led_count

                elif effect == "game":
                    if cur_game_event == "death":
                        bf = (math.sin(step * 0.15) + 1) / 2
                        r = int(40 + 215 * bf)
                        colors = [(r, 0, 0)] * led_count
                    elif cur_game_event == "kill":
                        for i in range(led_count):
                            hue = (step * 10 + i * (360 / max(led_count, 1))) % 360
                            colors.append(hsl_to_rgb(hue / 360, 1.0, 0.5))
                    else:
                        bf = (math.sin(step * 0.06) + 1) / 2
                        gr, gg, gb = 0, int(120 * bf), int(255 * bf)
                        colors = [(gr, gg, gb)] * led_count

                if not colors:
                    continue

                # Write computed colors into LED state
                for i in range(min(led_count, len(colors))):
                    dev["leds"][i]["r"] = colors[i][0]
                    dev["leds"][i]["g"] = colors[i][1]
                    dev["leds"][i]["b"] = colors[i][2]

                send_queue.append((dev_id, list(colors)))

        # Send to hardware outside the lock
        for dev_id, colors in send_queue:
            if dev_id.endswith("_demo"):
                continue
            prefix = dev_id.rsplit("_", 1)[0]
            handler = handlers.get(dev_id) or handlers.get(prefix)
            if handler and handler.connected:
                try:
                    if prefix in ["asus", "corsair", "msi"]:
                        idx = int(dev_id.split("_")[1])
                        handler.set_led_colors(idx, colors)
                    else:
                        handler.set_led_colors(colors)
                except Exception:
                    pass

        # Game ult R-key highlight (keyboard only, outside main loop for clarity)
        if cur_mode == "game" and cur_ult and not cur_game_event:
            gold = (255, 215, 0) if (step % 8 < 4) else None
            if gold:
                with state_lock:
                    for dev_id, dev in device_states.items():
                        if device_modes.get(dev_id, "sync") == "disabled":
                            continue
                        if dev.get("type") in ["Custom Keyboard", "Keyboard"] or "key_layout" in dev:
                            key_layout = dev.get("key_layout", [])
                            for idx, k in enumerate(key_layout):
                                if k.get("key") == "R" and idx < len(dev["leds"]):
                                    dev["leds"][idx] = {"r": gold[0], "g": gold[1], "b": gold[2]}
                                    apply_single_led(dev_id, idx, gold[0], gold[1], gold[2])

        time.sleep(0.05)

def apply_master_color(r, g, b):
    for dev_id in device_states:
        if device_modes.get(dev_id, "sync") == "sync":
            for led in device_states[dev_id]["leds"]:
                led["r"] = r
                led["g"] = g
                led["b"] = b
                
    for name, handler in handlers.items():
        if handler.connected:
            try:
                if name == "asus":
                    for i in range(len(handler.get_devices())):
                        dev_id = f"asus_{i}"
                        if device_modes.get(dev_id, "sync") == "sync":
                            handler.set_color(i, r, g, b)
                elif name in ["corsair", "msi"]:
                    for i in range(len(handler.get_devices())):
                        dev_id = f"{name}_{i}"
                        if device_modes.get(dev_id, "sync") == "sync":
                            handler.set_color(i, r, g, b)
                elif name in ["logitech", "razer", "via_qmk", "philips_hue", "nanoleaf", "govee", "aula", "vgn", "vxe"]:
                    dev_id = f"{name}_0"
                    if device_modes.get(dev_id, "sync") == "sync":
                        handler.set_color(r, g, b)
            except Exception:
                pass

def apply_device_colors_array(dev_id, colors):
    if dev_id in device_states:
        led_count = len(device_states[dev_id]["leds"])
        for i in range(min(led_count, len(colors))):
            device_states[dev_id]["leds"][i] = {
                "r": colors[i][0],
                "g": colors[i][1],
                "b": colors[i][2]
            }
            
        if not dev_id.endswith("_demo"):
            prefix = dev_id.rsplit("_", 1)[0]
            handler = handlers.get(dev_id) or handlers.get(prefix)
            if handler and handler.connected:
                try:
                    if prefix in ["asus", "corsair", "msi"]:
                        idx = int(dev_id.split("_")[1])
                        handler.set_led_colors(idx, colors)
                    else:
                        handler.set_led_colors(colors)
                except Exception:
                    pass

def apply_single_led(dev_id, led_idx, r, g, b):
    if dev_id in device_states and 0 <= led_idx < len(device_states[dev_id]["leds"]):
        device_states[dev_id]["leds"][led_idx] = {"r": r, "g": g, "b": b}
        
        if not dev_id.endswith("_demo"):
            prefix = dev_id.rsplit("_", 1)[0]
            handler = handlers.get(dev_id) or handlers.get(prefix)
            if handler and handler.connected:
                try:
                    if prefix in ["asus", "corsair", "msi"]:
                        idx = int(dev_id.split("_")[1])
                        colors_list = [(l["r"], l["g"], l["b"]) for l in device_states[dev_id]["leds"]]
                        handler.set_led_colors(idx, colors_list)
                    else:
                        colors_list = [(l["r"], l["g"], l["b"]) for l in device_states[dev_id]["leds"]]
                        handler.set_led_colors(colors_list)
                except Exception:
                    pass

def hsl_to_rgb(h, s, l):
    if s == 0:
        r = g = b = l
    else:
        def hue2rgb(p, q, t):
            if t < 0: t += 1
            if t > 1: t -= 1
            if t < 1/6: return p + (q - p) * 6 * t
            if t < 1/2: return q
            if t < 2/3: return p + (q - p) * (2/3 - t) * 6
            return p
        q = l * (1 + s) if l < 0.5 else l + s - l * s
        p = 2 * l - q
        r = hue2rgb(p, q, h + 1/3)
        g = hue2rgb(p, q, h)
        b = hue2rgb(p, q, h - 1/3)
    return [int(r * 255), int(g * 255), int(b * 255)]

# --- Additional Mode & Profile APIs ---
@app.route('/api/mode', methods=['GET', 'POST'])
def handle_mode():
    global active_mode, breath_base_color
    if request.method == 'POST':
        data = request.json
        mode = data.get("mode")
        color = data.get("color")
        if mode:
            active_mode = mode
            if color:
                breath_base_color = (
                    int(color.get("r", breath_base_color[0])),
                    int(color.get("g", breath_base_color[1])),
                    int(color.get("b", breath_base_color[2]))
                )
            return jsonify({"status": "OK"})
        return jsonify({"status": "Missing mode"}), 400
    else:
        return jsonify({
            "mode": active_mode,
            "cpu_load": cpu_load,
            "ram_load": ram_load,
            "cpu_temp": cpu_temp,
            "screen_color": {
                "r": screen_ambient_color[0],
                "g": screen_ambient_color[1],
                "b": screen_ambient_color[2]
            },
            "game_event_active": game_event_active,
            "game_ult_ready": game_ult_ready
        })

@app.route('/api/device/mode', methods=['POST'])
def set_device_mode():
    data = request.json
    dev_id = data.get("id")
    mode = data.get("mode")
    if dev_id in device_states:
        device_modes[dev_id] = mode
        return jsonify({"status": "OK"})
    return jsonify({"status": "Device not found"}), 404

@app.route('/api/visualizer/beat', methods=['POST'])
def visualizer_beat():
    data = request.json
    bass = data.get("bass", 0.0)
    mid = data.get("mid", 0.0)
    treble = data.get("treble", 0.0)
    
    r_bass = int(bass * 255)
    g_mid = int(mid * 255)
    b_treble = int(treble * 255)
    
    for dev_id, dev in device_states.items():
        dev_mode = device_modes.get(dev_id, "sync")
        is_audio = (dev_mode == "audio") or (dev_mode == "sync" and active_mode == "audio")
        if not is_audio:
            continue
            
        led_count = dev["led_count"]
        colors = []
        
        if dev["type"] in ["Custom Keyboard", "Keyboard"] or "key_layout" in dev:
            key_layout = dev.get("key_layout", [])
            for k in key_layout:
                key_name = k.get("key", "")
                if key_name == "Space":
                    colors.append((r_bass, 0, 0))
                elif key_name.startswith("F") or key_name in ["Esc", "Prt", "Scr", "Pau"]:
                    colors.append((0, 0, b_treble))
                else:
                    colors.append((0, g_mid, 0))
        elif dev["type"] == "Mouse":
            for i in range(led_count):
                if i == 0:
                    colors.append((r_bass, 0, 0))
                elif i == 1:
                    colors.append((0, g_mid, 0))
                else:
                    colors.append((0, 0, b_treble))
        elif dev["type"] == "GPU":
            for i in range(led_count):
                colors.append((r_bass, 0, b_treble // 2))
        elif dev["type"] == "Fans":
            for i in range(led_count):
                colors.append((0, g_mid // 2, b_treble))
        else:
            for i in range(led_count):
                colors.append((r_bass // 2, g_mid, b_treble // 2))
                
        apply_device_colors_array(dev_id, colors)
        
    return jsonify({"status": "OK"})

profiles_dir = os.path.join(os.path.dirname(__file__), "profiles")
os.makedirs(profiles_dir, exist_ok=True)

@app.route('/api/profiles', methods=['GET'])
def get_profiles():
    files = [f[:-5] for f in os.listdir(profiles_dir) if f.endswith(".json")]
    return jsonify(files)

@app.route('/api/profiles/save', methods=['POST'])
def save_profile():
    data = request.json
    name = data.get("name")
    if not name:
        return jsonify({"status": "Name required"}), 400
    
    profile_data = {
        "active_mode": active_mode,
        "device_modes": device_modes,
        "device_states": {
            dev_id: {
                "leds": dev["leds"]
            }
            for dev_id, dev in device_states.items()
        }
    }
    
    file_path = os.path.join(profiles_dir, f"{name}.json")
    try:
        with open(file_path, 'w', encoding='utf-8') as f:
            json.dump(profile_data, f, indent=4)
        return jsonify({"status": "OK"})
    except Exception as e:
        return jsonify({"status": f"Save failed: {e}"}), 500

@app.route('/api/profiles/load', methods=['POST'])
def load_profile():
    global active_mode
    data = request.json
    name = data.get("name")
    if not name:
        return jsonify({"status": "Name required"}), 400
        
    file_path = os.path.join(profiles_dir, f"{name}.json")
    if not os.path.exists(file_path):
        return jsonify({"status": "Profile not found"}), 404
        
    try:
        with open(file_path, 'r', encoding='utf-8') as f:
            profile_data = json.load(f)
            
        active_mode = profile_data.get("active_mode", "static")
        
        loaded_modes = profile_data.get("device_modes", {})
        for dev_id, mode in loaded_modes.items():
            device_modes[dev_id] = mode
            
        loaded_states = profile_data.get("device_states", {})
        for dev_id, dev_data in loaded_states.items():
            if dev_id in device_states:
                leds = dev_data.get("leds", [])
                for i in range(min(len(device_states[dev_id]["leds"]), len(leds))):
                    device_states[dev_id]["leds"][i] = leds[i]
                
                if not dev_id.endswith("_demo"):
                    prefix = dev_id.rsplit("_", 1)[0]
                    handler = handlers.get(dev_id) or handlers.get(prefix)
                    if handler and handler.connected:
                        colors = [(l["r"], l["g"], l["b"]) for l in device_states[dev_id]["leds"]]
                        if prefix in ["asus", "corsair", "msi"]:
                            idx = int(dev_id.split("_")[1])
                            handler.set_led_colors(idx, colors)
                        else:
                            handler.set_led_colors(colors)
                            
        return jsonify({"status": "OK"})
    except Exception as e:
        return jsonify({"status": f"Load failed: {e}"}), 500

@app.route('/api/profiles/<name>', methods=['DELETE'])
def delete_profile(name):
    file_path = os.path.join(profiles_dir, f"{name}.json")
    if os.path.exists(file_path):
        try:
            os.remove(file_path)
            return jsonify({"status": "OK"})
        except Exception as e:
            return jsonify({"status": f"Delete failed: {e}"}), 500
    return jsonify({"status": "Profile not found"}), 404

@app.route('/api/hid/scan', methods=['GET'])
def scan_hid():
    if not HAS_HID:
        return jsonify([])
    try:
        devices_list = []
        seen = set()
        for device_info in hid.enumerate():
            vid = device_info.get('vendor_id', 0)
            pid = device_info.get('product_id', 0)
            product = device_info.get('product_string') or f"USB HID Device ({hex(vid)}:{hex(pid)})"
            mfg = device_info.get('manufacturer_string') or _RGB_VID_BRANDS.get(vid, "Generic")
            path = device_info.get('path')
            rgb_likely = vid in _RGB_VID_BRANDS
            rgb_brand  = _RGB_VID_BRANDS.get(vid, "")
            key = (vid, pid)
            if key not in seen:
                seen.add(key)
                devices_list.append({
                    "vendor_id": hex(vid),
                    "product_id": hex(pid),
                    "product_string": product,
                    "manufacturer_string": mfg,
                    "rgb_likely": rgb_likely,
                    "rgb_brand":  rgb_brand,
                    "path": path.decode('utf-8', errors='ignore') if isinstance(path, bytes) else str(path)
                })
        # Sort: RGB-likely first
        devices_list.sort(key=lambda d: (0 if d["rgb_likely"] else 1))
        return jsonify(devices_list)
    except Exception as e:
        return jsonify({"error": str(e)}), 500


@app.route('/api/hid/delete', methods=['POST'])
def delete_hid():
    """Remove a custom device by id from custom_devices.json"""
    data = request.json or {}
    dev_id = data.get("id")
    if not dev_id:
        return jsonify({"status": "Missing id"}), 400
    custom_path = os.path.join(os.path.dirname(__file__), "custom_devices.json")
    custom_list = []
    if os.path.exists(custom_path):
        try:
            with open(custom_path, 'r', encoding='utf-8') as f:
                custom_list = json.load(f)
        except Exception:
            pass
    before = len(custom_list)
    custom_list = [d for d in custom_list if d.get("id") != dev_id]
    if len(custom_list) == before:
        return jsonify({"status": "Not found"}), 404
    with open(custom_path, 'w', encoding='utf-8') as f:
        json.dump(custom_list, f, indent=4, ensure_ascii=False)
    with state_lock:
        device_states.pop(dev_id, None)
        device_modes.pop(dev_id, None)
    handlers.pop(dev_id, None)
    return jsonify({"status": "OK"})

@app.route('/api/hid/add', methods=['POST'])
def add_hid():
    data = request.json
    name = data.get("name")
    mfg = data.get("manufacturer", "Custom")
    dev_type = data.get("type", "Other")
    vid_str = data.get("vendor_id")
    pid_str = data.get("product_id")
    led_count = int(data.get("led_count", 10))
    
    if not name:
        return jsonify({"status": "Missing device name"}), 400

    # VID/PID are optional — non-USB devices (smart home, DIY) can omit them
    import re as _re, time as _time
    if not vid_str:
        vid_str = "0x0000"
    if not pid_str:
        pid_str = hex(int(_time.time() * 1000) & 0xFFFF)  # unique pseudo-PID

    custom_path = os.path.join(os.path.dirname(__file__), "custom_devices.json")
    custom_list = []
    if os.path.exists(custom_path):
        try:
            with open(custom_path, 'r', encoding='utf-8') as f:
                custom_list = json.load(f)
        except Exception:
            pass

    # Only deduplicate if a real VID was provided
    if vid_str != "0x0000":
        for existing in custom_list:
            if existing.get("vendor_id") == vid_str and existing.get("product_id") == pid_str:
                return jsonify({"status": "이미 등록된 기기입니다 (중복 VID/PID)"}), 409

    safe_name = _re.sub(r'[^a-z0-9]', '_', name.lower())[:24]
    dev_id = f"custom_{safe_name}_{len(custom_list)}"
    new_device = {
        "id": dev_id,
        "name": name,
        "manufacturer": mfg,
        "type": dev_type,
        "vendor_id": vid_str,
        "product_id": pid_str,
        "led_count": led_count
    }
    custom_list.append(new_device)
    
    try:
        with open(custom_path, 'w', encoding='utf-8') as f:
            json.dump(custom_list, f, indent=4)
            
        handlers[dev_id] = CustomHidController(new_device)
        if handlers[dev_id].connected:
            device_states[dev_id] = handlers[dev_id].get_devices()[0]
        else:
            device_states[dev_id] = {
                "id": dev_id,
                "name": name + " (Demo)",
                "manufacturer": mfg,
                "type": dev_type,
                "led_count": led_count,
                "leds": [{"r": 0, "g": 180, "b": 255} for _ in range(led_count)]
            }
        device_modes[dev_id] = "sync"
        return jsonify({"status": "OK", "device": device_states[dev_id]})
    except Exception as e:
        return jsonify({"status": f"Save custom device failed: {e}"}), 500

# ═══════════════════════════════════════════════════════════════
#  FEATURE 1 — SCENE SYSTEM
# ═══════════════════════════════════════════════════════════════
_SCENES_FILE = os.path.join(os.path.dirname(__file__), 'scenes.json')

def _load_scenes():
    if os.path.exists(_SCENES_FILE):
        with open(_SCENES_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def _save_scenes(scenes):
    with open(_SCENES_FILE, 'w', encoding='utf-8') as f:
        json.dump(scenes, f, indent=2, ensure_ascii=False)

@app.route('/api/scenes', methods=['GET'])
def get_scenes():
    return jsonify(_load_scenes())

@app.route('/api/scenes/save', methods=['POST'])
def save_scene():
    data = request.json or {}
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'status': 'Missing name'}), 400
    # Capture current state snapshot
    with state_lock:
        snapshot = {}
        for dev_id, state in device_states.items():
            leds = state.get('leds', [])
            snapshot[dev_id] = {
                'mode': device_modes.get(dev_id, 'sync'),
                'leds': [{'r': l['r'], 'g': l['g'], 'b': l['b']} for l in leds],
            }
    scenes = _load_scenes()
    existing = next((s for s in scenes if s['name'] == name), None)
    scene = {
        'id': existing['id'] if existing else f'scene_{int(time.time() * 1000)}',
        'name': name,
        'icon': data.get('icon', '🎮'),
        'created_at': existing.get('created_at', time.time()) if existing else time.time(),
        'updated_at': time.time(),
        'snapshot': snapshot,
    }
    if existing:
        scenes = [scene if s['name'] == name else s for s in scenes]
    else:
        scenes.append(scene)
    _save_scenes(scenes)
    return jsonify({'status': 'OK', 'scene': scene})

@app.route('/api/scenes/load', methods=['POST'])
def load_scene_api():
    data = request.json or {}
    scene_id = data.get('id')
    scenes = _load_scenes()
    scene = next((s for s in scenes if s['id'] == scene_id), None)
    if not scene:
        return jsonify({'status': 'Not found'}), 404
    with state_lock:
        for dev_id, dev_snap in scene['snapshot'].items():
            if dev_id not in device_states:
                continue
            device_modes[dev_id] = dev_snap.get('mode', 'sync')
            snap_leds = dev_snap.get('leds', [])
            cur_leds  = device_states[dev_id].get('leds', [])
            for i, led in enumerate(cur_leds):
                if i < len(snap_leds):
                    led['r'] = snap_leds[i]['r']
                    led['g'] = snap_leds[i]['g']
                    led['b'] = snap_leds[i]['b']
                else:
                    led['r'] = snap_leds[0]['r'] if snap_leds else 0
                    led['g'] = snap_leds[0]['g'] if snap_leds else 180
                    led['b'] = snap_leds[0]['b'] if snap_leds else 255
    return jsonify({'status': 'OK'})

@app.route('/api/scenes/delete', methods=['POST'])
def delete_scene():
    data = request.json or {}
    scene_id = data.get('id')
    scenes = _load_scenes()
    new_scenes = [s for s in scenes if s['id'] != scene_id]
    if len(new_scenes) == len(scenes):
        return jsonify({'status': 'Not found'}), 404
    _save_scenes(new_scenes)
    return jsonify({'status': 'OK'})

# ═══════════════════════════════════════════════════════════════
#  FEATURE 2 — SSE REAL-TIME STREAM
# ═══════════════════════════════════════════════════════════════
import queue as _queue
from flask import Response, stream_with_context

_sse_clients      = []
_sse_clients_lock = threading.Lock()

def _sse_broadcast(event_type, payload):
    """Push JSON event to all connected SSE clients (non-blocking)."""
    msg = json.dumps({'type': event_type, 'data': payload, 'ts': time.time()})
    with _sse_clients_lock:
        dead = []
        for q in _sse_clients:
            try:
                q.put_nowait(msg)
            except _queue.Full:
                dead.append(q)
        for d in dead:
            _sse_clients.remove(d)

def _sse_push_loop():
    """Background thread: push full device-LED state every 400 ms."""
    while True:
        time.sleep(0.4)
        with _sse_clients_lock:
            if not _sse_clients:
                continue
        with state_lock:
            payload = []
            for dev_id, state in device_states.items():
                leds = state.get('leds', [])
                if leds:
                    payload.append({
                        'id':   dev_id,
                        'mode': device_modes.get(dev_id, 'sync'),
                        'leds': leds[:256],  # cap at 256 to keep payload small
                    })
        _sse_broadcast('leds', payload)

threading.Thread(target=_sse_push_loop, daemon=True).start()

@app.route('/api/stream')
def sse_stream():
    q = _queue.Queue(maxsize=20)
    with _sse_clients_lock:
        _sse_clients.append(q)
    def generate():
        try:
            while True:
                try:
                    msg = q.get(timeout=25)
                    yield f'data: {msg}\n\n'
                except _queue.Empty:
                    yield 'data: {"type":"ping"}\n\n'   # keep-alive
        finally:
            with _sse_clients_lock:
                if q in _sse_clients:
                    _sse_clients.remove(q)
    return Response(
        stream_with_context(generate()),
        mimetype='text/event-stream',
        headers={
            'Cache-Control':    'no-cache',
            'X-Accel-Buffering':'no',
            'Connection':       'keep-alive',
        }
    )

# ═══════════════════════════════════════════════════════════════
#  FEATURE 3 — GRADIENT / BULK LED UPDATE
# ═══════════════════════════════════════════════════════════════
@app.route('/api/device/leds/bulk', methods=['POST'])
def set_device_leds_bulk():
    """Replace all LEDs of a device with the provided array."""
    data = request.json or {}
    dev_id = data.get('id')
    new_leds = data.get('leds', [])
    if not dev_id:
        return jsonify({'status': 'Missing id'}), 400
    with state_lock:
        if dev_id not in device_states:
            return jsonify({'status': 'Device not found'}), 404
        cur = device_states[dev_id].get('leds', [])
        for i, led in enumerate(cur):
            if i < len(new_leds):
                led['r'] = max(0, min(255, int(new_leds[i].get('r', led['r']))))
                led['g'] = max(0, min(255, int(new_leds[i].get('g', led['g']))))
                led['b'] = max(0, min(255, int(new_leds[i].get('b', led['b']))))
        device_modes[dev_id] = 'independent'
    return jsonify({'status': 'OK'})

# ═══════════════════════════════════════════════════════════════
#  FEATURE 4 — SCHEDULER / AUTOMATION
# ═══════════════════════════════════════════════════════════════
import psutil as _psutil
from datetime import datetime as _datetime

_SCHEDULES_FILE = os.path.join(os.path.dirname(__file__), 'schedules.json')

def _load_schedules():
    if os.path.exists(_SCHEDULES_FILE):
        with open(_SCHEDULES_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def _save_schedules(schedules):
    with open(_SCHEDULES_FILE, 'w', encoding='utf-8') as f:
        json.dump(schedules, f, indent=2, ensure_ascii=False)

def _apply_schedule_action(action):
    """Apply a scene or set a global effect."""
    if action.get('type') == 'scene':
        scene_id = action.get('scene_id')
        scenes = _load_scenes()
        scene  = next((s for s in scenes if s['id'] == scene_id), None)
        if scene:
            with state_lock:
                for dev_id, dev_snap in scene['snapshot'].items():
                    if dev_id not in device_states:
                        continue
                    device_modes[dev_id] = dev_snap.get('mode', 'sync')
                    snap_leds = dev_snap.get('leds', [])
                    for i, led in enumerate(device_states[dev_id].get('leds', [])):
                        if i < len(snap_leds):
                            led['r'] = snap_leds[i]['r']
                            led['g'] = snap_leds[i]['g']
                            led['b'] = snap_leds[i]['b']
    elif action.get('type') == 'effect':
        global active_mode
        active_mode = action.get('effect', 'rainbow')

# Track last-fired schedules to prevent repeated triggers
_last_time_trigger   = {}   # schedule_id → 'YYYY-MM-DD HH:MM'
_process_active      = {}   # schedule_id → bool (was process running last tick)

def _scheduler_loop():
    while True:
        time.sleep(20)   # check every 20 s
        schedules = _load_schedules()
        now = _datetime.now()

        running_procs = None  # lazy-init

        for s in schedules:
            if not s.get('enabled', True):
                continue
            trigger = s.get('trigger', {})
            t_type  = trigger.get('type')

            if t_type == 'time':
                day_map = trigger.get('days', list(range(7)))   # 0=Mon … 6=Sun
                if now.weekday() not in day_map:
                    continue
                t_str  = trigger.get('time', '00:00')
                key    = f"{now.strftime('%Y-%m-%d')} {t_str}"
                h, m   = t_str.split(':')
                if now.hour == int(h) and now.minute == int(m):
                    if _last_time_trigger.get(s['id']) != key:
                        _last_time_trigger[s['id']] = key
                        _apply_schedule_action(s.get('action', {}))

            elif t_type == 'process':
                if running_procs is None:
                    try:
                        running_procs = {p.name().lower() for p in _psutil.process_iter(['name'])}
                    except Exception:
                        running_procs = set()
                proc_name = trigger.get('process', '').lower()
                is_running = proc_name in running_procs
                was_running = _process_active.get(s['id'], False)
                _process_active[s['id']] = is_running
                if is_running and not was_running:   # process just started
                    _apply_schedule_action(s.get('action', {}))

threading.Thread(target=_scheduler_loop, daemon=True).start()

@app.route('/api/schedules', methods=['GET'])
def get_schedules():
    return jsonify(_load_schedules())

@app.route('/api/schedules/save', methods=['POST'])
def save_schedule():
    data = request.json or {}
    name = data.get('name', '').strip()
    if not name:
        return jsonify({'status': 'Missing name'}), 400
    schedules = _load_schedules()
    existing  = next((s for s in schedules if s['id'] == data.get('id')), None)
    sched = {
        'id':      existing['id'] if existing else f'sched_{int(time.time()*1000)}',
        'name':    name,
        'enabled': data.get('enabled', True),
        'trigger': data.get('trigger', {'type': 'time', 'time': '18:00', 'days': list(range(7))}),
        'action':  data.get('action', {'type': 'effect', 'effect': 'rainbow'}),
    }
    if existing:
        schedules = [sched if s['id'] == sched['id'] else s for s in schedules]
    else:
        schedules.append(sched)
    _save_schedules(schedules)
    return jsonify({'status': 'OK', 'schedule': sched})

@app.route('/api/schedules/delete', methods=['POST'])
def delete_schedule():
    data = request.json or {}
    sched_id = data.get('id')
    schedules = _load_schedules()
    new = [s for s in schedules if s['id'] != sched_id]
    if len(new) == len(schedules):
        return jsonify({'status': 'Not found'}), 404
    _save_schedules(new)
    return jsonify({'status': 'OK'})

@app.route('/api/schedules/toggle', methods=['POST'])
def toggle_schedule():
    data = request.json or {}
    sched_id = data.get('id')
    schedules = _load_schedules()
    for s in schedules:
        if s['id'] == sched_id:
            s['enabled'] = not s.get('enabled', True)
            _save_schedules(schedules)
            return jsonify({'status': 'OK', 'enabled': s['enabled']})
    return jsonify({'status': 'Not found'}), 404

@app.route('/api/processes', methods=['GET'])
def list_processes():
    """Return a list of running process names for game-detection UI."""
    try:
        procs = sorted({p.name() for p in _psutil.process_iter(['name']) if p.name()})
        return jsonify(procs)
    except Exception as e:
        return jsonify([])

# ═══════════════════════════════════════════════════════════════
#  FEATURE 6 — USER PROFILES / PLAYLIST / BACKUP
# ═══════════════════════════════════════════════════════════════
import zipfile, io
from flask import send_file

# ── User Profiles ─────────────────────────────────────────────
_UP_FILE = os.path.join(os.path.dirname(__file__), 'user_profiles.json')

def _load_up():
    if os.path.exists(_UP_FILE):
        with open(_UP_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    # Built-in presets
    return [
        {'id':'up_game',  'name':'게임 모드',  'icon':'🎮','effect':'rainbow', 'brightness':100,'scene_id':None},
        {'id':'up_work',  'name':'업무 모드',  'icon':'💻','effect':'static',  'brightness':60, 'scene_id':None},
        {'id':'up_sleep', 'name':'수면 모드',  'icon':'🌙','effect':'breathing','brightness':20,'scene_id':None},
    ]

def _save_up(data):
    with open(_UP_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

@app.route('/api/userprofiles', methods=['GET'])
def get_user_profiles():
    return jsonify(_load_up())

@app.route('/api/userprofiles/save', methods=['POST'])
def save_user_profile():
    data = request.json or {}
    profiles = _load_up()
    pid = data.get('id') or f'up_{int(time.time()*1000)}'
    existing = next((p for p in profiles if p['id'] == pid), None)
    profile = {
        'id': pid,
        'name':       data.get('name', '새 프로필'),
        'icon':       data.get('icon', '👤'),
        'effect':     data.get('effect', 'rainbow'),
        'brightness': data.get('brightness', 100),
        'scene_id':   data.get('scene_id', None),
    }
    if existing:
        profiles = [profile if p['id'] == pid else p for p in profiles]
    else:
        profiles.append(profile)
    _save_up(profiles)
    return jsonify({'status': 'OK', 'profile': profile})

@app.route('/api/userprofiles/delete', methods=['POST'])
def delete_user_profile():
    data = request.json or {}
    profiles = [p for p in _load_up() if p['id'] != data.get('id')]
    _save_up(profiles)
    return jsonify({'status': 'OK'})

@app.route('/api/userprofiles/apply', methods=['POST'])
def apply_user_profile():
    global active_mode
    data = request.json or {}
    profiles = _load_up()
    profile = next((p for p in profiles if p['id'] == data.get('id')), None)
    if not profile:
        return jsonify({'status': 'Not found'}), 404
    active_mode = profile.get('effect', 'rainbow')
    scene_id = profile.get('scene_id')
    if scene_id:
        scenes = _load_scenes()
        scene = next((s for s in scenes if s['id'] == scene_id), None)
        if scene:
            with state_lock:
                for dev_id, snap in scene['snapshot'].items():
                    if dev_id not in device_states: continue
                    device_modes[dev_id] = snap.get('mode', 'sync')
                    for i, led in enumerate(device_states[dev_id].get('leds', [])):
                        sl = snap.get('leds', [])
                        src = sl[i] if i < len(sl) else (sl[0] if sl else {})
                        led['r'] = src.get('r', 0); led['g'] = src.get('g', 180); led['b'] = src.get('b', 255)
    return jsonify({'status': 'OK', 'applied': profile})

# ── Playlists ─────────────────────────────────────────────────
_PL_FILE = os.path.join(os.path.dirname(__file__), 'playlists.json')

def _load_pl():
    if os.path.exists(_PL_FILE):
        with open(_PL_FILE, 'r', encoding='utf-8') as f:
            return json.load(f)
    return []

def _save_pl(data):
    with open(_PL_FILE, 'w', encoding='utf-8') as f:
        json.dump(data, f, ensure_ascii=False, indent=2)

@app.route('/api/playlists', methods=['GET'])
def get_playlists():
    return jsonify(_load_pl())

@app.route('/api/playlists/save', methods=['POST'])
def save_playlist():
    data = request.json or {}
    pls = _load_pl()
    pid = data.get('id') or f'pl_{int(time.time()*1000)}'
    existing = next((p for p in pls if p['id'] == pid), None)
    pl = {'id': pid, 'name': data.get('name','플레이리스트'), 'items': data.get('items',[])}
    if existing:
        pls = [pl if p['id'] == pid else p for p in pls]
    else:
        pls.append(pl)
    _save_pl(pls)
    return jsonify({'status': 'OK', 'playlist': pl})

@app.route('/api/playlists/delete', methods=['POST'])
def delete_playlist():
    data = request.json or {}
    _save_pl([p for p in _load_pl() if p['id'] != data.get('id')])
    return jsonify({'status': 'OK'})

# ── Backup / Restore ─────────────────────────────────────────
_BACKUP_FILES = ['scenes.json','schedules.json','device_order.json',
                 'playlists.json','user_profiles.json','profiles.json']

@app.route('/api/backup/export', methods=['GET'])
def export_backup():
    buf  = io.BytesIO()
    base = os.path.dirname(__file__)
    with zipfile.ZipFile(buf, 'w', zipfile.ZIP_DEFLATED) as zf:
        for fname in _BACKUP_FILES:
            p = os.path.join(base, fname)
            if os.path.exists(p):
                zf.write(p, fname)
    buf.seek(0)
    return send_file(buf, mimetype='application/zip',
                     as_attachment=True, download_name='colordock_backup.zip')

@app.route('/api/backup/import', methods=['POST'])
def import_backup():
    f = request.files.get('backup')
    if not f:
        return jsonify({'status': 'No file'}), 400
    base = os.path.dirname(__file__)
    allowed = set(_BACKUP_FILES)
    try:
        with zipfile.ZipFile(io.BytesIO(f.read())) as zf:
            restored = []
            for name in zf.namelist():
                if name in allowed:
                    data = zf.read(name)
                    with open(os.path.join(base, name), 'wb') as out:
                        out.write(data)
                    restored.append(name)
        return jsonify({'status': 'OK', 'restored': restored})
    except Exception as e:
        return jsonify({'status': 'Error', 'msg': str(e)}), 400

# ═══════════════════════════════════════════════════════════════
#  FEATURE 5 — SYSINFO DASHBOARD
# ═══════════════════════════════════════════════════════════════
_gpu_temp_sim = 55.0
_notif_log    = []          # [{id, ts, type, msg}]
_notif_lock   = threading.Lock()

@app.route('/api/sysinfo')
def get_sysinfo():
    global _gpu_temp_sim
    import random
    _gpu_temp_sim = _gpu_temp_sim * 0.92 + (cpu_temp * 1.15 + random.uniform(-3, 3)) * 0.08
    disk_r = abs(math.sin(time.time() * 0.11) * 85 + random.uniform(0, 20))
    disk_w = abs(math.cos(time.time() * 0.07) * 55 + random.uniform(0, 15))
    net_rx = abs(math.sin(time.time() * 0.04) * 130 + random.uniform(0, 40))
    net_tx = abs(math.cos(time.time() * 0.09) * 45 + random.uniform(0, 15))
    return jsonify({
        'cpu_temp': round(cpu_temp, 1),
        'cpu_load': round(cpu_load, 1),
        'ram_load': round(ram_load, 1),
        'gpu_temp': round(min(_gpu_temp_sim, 95.0), 1),
        'disk_read': round(disk_r, 1),
        'disk_write': round(disk_w, 1),
        'net_rx': round(net_rx, 1),
        'net_tx': round(net_tx, 1),
    })

@app.route('/api/notifs', methods=['GET'])
def get_notifs():
    with _notif_lock:
        return jsonify(list(_notif_log[-50:]))

@app.route('/api/notifs/push', methods=['POST'])
def push_notif():
    data = request.json or {}
    entry = {
        'id':   f'n_{int(time.time()*1000)}',
        'ts':   time.time(),
        'type': data.get('type', 'info'),
        'msg':  data.get('msg', ''),
    }
    with _notif_lock:
        _notif_log.append(entry)
        if len(_notif_log) > 200:
            del _notif_log[:100]
    _sse_broadcast('notif', entry)
    return jsonify({'status': 'OK'})

@app.route('/api/notifs/clear', methods=['POST'])
def clear_notifs():
    with _notif_lock:
        _notif_log.clear()
    return jsonify({'status': 'OK'})

@app.route('/api/device/order', methods=['POST'])
def save_device_order():
    """Persist user-defined device card ordering."""
    data = request.json or {}
    order = data.get('order', [])
    order_path = os.path.join(os.path.dirname(__file__), 'device_order.json')
    with open(order_path, 'w', encoding='utf-8') as f:
        json.dump(order, f)
    return jsonify({'status': 'OK'})

@app.route('/api/device/order', methods=['GET'])
def get_device_order():
    order_path = os.path.join(os.path.dirname(__file__), 'device_order.json')
    if os.path.exists(order_path):
        with open(order_path, 'r', encoding='utf-8') as f:
            return jsonify(json.load(f))
    return jsonify([])

@app.route('/api/keyboard/colors', methods=['POST'])
def keyboard_colors():
    """Apply per-key RGB colors to a keyboard device."""
    data = request.json or {}
    device_id = data.get('device_id')
    colors = data.get('colors', {})  # {key_id: '#rrggbb'}

    applied = 0
    # Try to apply via OpenRGB if device is connected
    try:
        if device_id and colors:
            # Convert hex colors to RGB tuples for the device
            rgb_map = {}
            for key_id, hex_color in colors.items():
                try:
                    r = int(hex_color[1:3], 16)
                    g = int(hex_color[3:5], 16)
                    b = int(hex_color[5:7], 16)
                    rgb_map[key_id] = (r, g, b)
                    applied += 1
                except Exception:
                    pass
            # Persist for future reload
            kb_colors_path = os.path.join(os.path.dirname(__file__), f'kb_colors_{device_id}.json')
            with open(kb_colors_path, 'w', encoding='utf-8') as f:
                json.dump(colors, f)
    except Exception as e:
        return jsonify({'status': 'error', 'error': str(e)})

    return jsonify({'status': 'OK', 'applied': applied})


@app.route('/api/gsi/cs2', methods=['POST'])
def gsi_cs2():
    global game_event_active, game_event_end_time, game_ult_ready
    try:
        data = request.json
        player = data.get("player", {})
        state = player.get("state", {})
        health = state.get("health", 100)
        
        if health == 0:
            game_event_active = "death"
            game_event_end_time = time.time() + 5.0
            
        match_stats = player.get("match_stats", {})
        kills = match_stats.get("kills", 0)
        
        if not hasattr(gsi_cs2, "last_kills"):
            gsi_cs2.last_kills = kills
            
        if kills > gsi_cs2.last_kills:
            game_event_active = "kill"
            game_event_end_time = time.time() + 3.0
        gsi_cs2.last_kills = kills
    except Exception as e:
        print(f"CS2 GSI parse error: {e}")
    return "", 200

def shutdown_handlers():
    global sensor_thread_running, screen_thread_running, lol_thread_running, lighting_thread_running
    sensor_thread_running = False
    screen_thread_running = False
    lol_thread_running = False
    lighting_thread_running = False
    print("Shutting down SDK resources...")
    if handlers["logitech"].connected:
        handlers["logitech"].shutdown()
    if handlers["razer"].connected:
        handlers["razer"].shutdown()

if __name__ == '__main__':
    try:
        # Start all background threads
        sensor_thread = threading.Thread(target=sensor_polling_loop, daemon=True)
        sensor_thread.start()
        
        screen_thread = threading.Thread(target=screen_capture_loop, daemon=True)
        screen_thread.start()
        
        lol_thread = threading.Thread(target=lol_polling_loop, daemon=True)
        lol_thread.start()
        
        lighting_thread = threading.Thread(target=backend_lighting_loop, daemon=True)
        lighting_thread.start()
        
        print("ColorDock Unified Server starting at http://localhost:3050")
        app.run(host='0.0.0.0', port=3050, debug=False, threaded=True)
    finally:
        shutdown_handlers()
