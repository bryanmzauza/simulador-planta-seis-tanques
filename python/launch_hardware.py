"""Iniciador Windows de aquisição, sem upload e sem comandos de atuação."""
import os
from pathlib import Path
import shutil
import socket
import subprocess
import sys
import time
import webbrowser

ROOT = Path(__file__).resolve().parent.parent

def listening(port):
    try:
        with socket.create_connection(("127.0.0.1", port), timeout=.3):
            return True
    except OSError:
        return False

def main():
    os.chdir(ROOT)
    npm = shutil.which("npm")
    if not npm:
        raise RuntimeError("npm não encontrado. Instale Node.js.")
    try:
        import serial
        import websockets
    except ImportError:
        subprocess.check_call([sys.executable, "-m", "pip", "install", "-r", "python/requirements.txt"])
        import serial
    from serial.tools import list_ports
    if not (ROOT / "node_modules/vite").exists():
        subprocess.check_call([os.environ.get("COMSPEC", "cmd.exe"), "/c", "npm install"])
    ports = sorted(list_ports.comports(), key=lambda p: p.device)
    if not ports:
        raise RuntimeError("Nenhuma porta serial encontrada. Conecte o Mega e confira cabo/driver.")
    compatible = [p for p in ports if (p.vid, p.pid) in {(0x2341,0x0042),(0x2A03,0x0042),(0x2341,0x0010)} or "mega" in p.description.lower()]
    if len(compatible) == 1:
        port = compatible[0].device
    else:
        print("Selecione a porta do Arduino (clones podem ter descrição USB Serial):")
        for i,p in enumerate(ports,1): print(f"{i}. {p.device} — {p.description}")
        while True:
            value = input("Número da porta: ").strip()
            if value.isdigit() and 1 <= int(value) <= len(ports):
                port = ports[int(value)-1].device
                break
            print("Escolha um número da lista.")
    # Não reutilizar backend desconhecido: poderia ser MOCK ou versão antiga.
    if listening(8765):
        raise RuntimeError("Porta 8765 ocupada. Feche o backend anterior e execute novamente.")
    try:
        with serial.Serial(port,115200,timeout=.2): pass
    except serial.SerialException as exc:
        raise RuntimeError(f"Não foi possível abrir {port}. Feche o Monitor Serial/IDE ou outro processo: {exc}") from exc
    env = dict(os.environ, SIX_TANK_MODE="HARDWARE", SIX_TANK_SERIAL_PORT=port, SIX_TANK_SERIAL_BAUD="115200")
    children=[]
    try:
        children.append(subprocess.Popen([sys.executable,"-u","python/server.py"],env=env))
        if not listening(5173):
            children.append(subprocess.Popen([os.environ.get("COMSPEC","cmd.exe"),"/c","npm run dev -- --strictPort"],env=env))
        deadline=time.monotonic()+30
        while not (listening(8765) and listening(5173)):
            if any(p.poll() is not None for p in children): raise RuntimeError("Um serviço encerrou. Confira o erro acima.")
            if time.monotonic()>deadline: raise RuntimeError("Serviços não iniciaram em 30 segundos.")
            time.sleep(.25)
        webbrowser.open("http://127.0.0.1:5173")
        print(f"Aquisição em {port}, 115200 baud. Na HMI: Planta real → Conectar. Ctrl+C encerra.")
        while all(p.poll() is None for p in children): time.sleep(.5)
    finally:
        for p in children:
            if p.poll() is None:
                subprocess.run(["taskkill","/PID",str(p.pid),"/T","/F"],capture_output=True)

if __name__ == "__main__":
    try: main()
    except KeyboardInterrupt: pass
    except Exception as exc:
        print(f"ERRO: {exc}")
        sys.exit(1)
