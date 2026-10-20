"""Exporta as FMUs (FMI 2.0, co-simulação) usadas pelo modo MODELICA.

    python python/build_fmu.py            # gera as duas FMUs em modelica/build/
    python python/build_fmu.py planta     # só a planta
    python python/build_fmu.py controle   # só o banco de controladores

Precisa do OpenModelica instalado (OPENMODELICAHOME ou o caminho padrão em
C:/Program Files) e do pacote OMPython (requirements.txt).

As FMUs geradas:
    modelica/build/SeisTanques_v13_SixTanks.fmu      planta (SeisTanques_v13.SixTanks)
    modelica/build/SeisTanques_Controle_Banco.fmu    banco de PID_ISA (SeisTanques_Controle.Banco)
"""

import glob
import os
import shutil
import sys

RAIZ = os.path.dirname(os.path.dirname(os.path.abspath(__file__)))
DIR_MODELICA = os.path.join(RAIZ, "modelica")
DIR_BUILD = os.path.join(DIR_MODELICA, "build")

MODELOS = {
    "planta": {
        "arquivo": "modelo_6tanques_v13.mo",
        "classe": "SeisTanques_v13.SixTanks",
        "fmu": "SeisTanques_v13_SixTanks",
    },
    "controle": {
        "arquivo": "modelo_6tanques_controle.mo",
        "classe": "SeisTanques_Controle.Banco",
        "fmu": "SeisTanques_Controle_Banco",
    },
}


def localizar_openmodelica():
    home = os.environ.get("OPENMODELICAHOME")
    if home and os.path.isfile(os.path.join(home, "bin", "omc.exe")):
        return home
    for base in ("C:/Program Files", "C:/Program Files (x86)"):
        for cand in sorted(glob.glob(os.path.join(base, "OpenModelica*")), reverse=True):
            if os.path.isfile(os.path.join(cand, "bin", "omc.exe")):
                return cand
    return None


def caminho_omc(texto):
    """Caminho com barras normais, como o omc espera dentro de strings Modelica."""
    return texto.replace("\\", "/")


def exportar(nome, omc):
    info = MODELOS[nome]
    arquivo = os.path.join(DIR_MODELICA, info["arquivo"])
    if not os.path.isfile(arquivo):
        raise SystemExit(f"Arquivo não encontrado: {arquivo}")

    print(f"[FMU] carregando {info['arquivo']}")
    ok = omc.sendExpression(f'loadFile("{caminho_omc(arquivo)}")')
    if ok is not True:
        raise SystemExit(f"loadFile falhou: {omc.sendExpression('getErrorString()')}")

    print(f"[FMU] exportando {info['classe']} (FMI 2.0, co-simulação)")
    resultado = omc.sendExpression(
        f'buildModelFMU({info["classe"]}, version="2.0", fmuType="cs", '
        f'fileNamePrefix="{info["fmu"]}", platforms={{"static"}})'
    )
    erros = omc.sendExpression("getErrorString()")
    if erros and erros.strip():
        print(erros.strip())
    if not resultado or not str(resultado).endswith(".fmu"):
        raise SystemExit(f"buildModelFMU falhou para {info['classe']}: {resultado!r}")

    destino = os.path.join(DIR_BUILD, info["fmu"] + ".fmu")
    shutil.copyfile(resultado, destino)
    print(f"[FMU] gerada: {destino}")
    return destino


def main(argv):
    try:
        import OMPython
    except ImportError:
        raise SystemExit("Instale o OMPython: python -m pip install OMPython")

    home = localizar_openmodelica()
    if home is None:
        raise SystemExit("OpenModelica não encontrado. Defina OPENMODELICAHOME.")
    os.environ.setdefault("OPENMODELICAHOME", home)
    print(f"[FMU] OpenModelica em {home}")

    quais = argv[1:] or list(MODELOS)
    for nome in quais:
        if nome not in MODELOS:
            raise SystemExit(f"Modelo desconhecido: {nome}. Opções: {', '.join(MODELOS)}")

    os.makedirs(DIR_BUILD, exist_ok=True)
    temp = os.path.join(DIR_BUILD, "tmp")
    os.makedirs(temp, exist_ok=True)

    # OMPython >= 4 usa OMCSessionLocal; versões antigas só têm OMCSessionZMQ.
    if hasattr(OMPython, "OMCSessionLocal"):
        omc = OMPython.OMCSessionLocal(omhome=home)
    else:
        omc = OMPython.OMCSessionZMQ()
    print("[FMU] omc", omc.sendExpression("getVersion()"))
    omc.sendExpression(f'cd("{caminho_omc(temp)}")')

    for nome in quais:
        exportar(nome, omc)

    shutil.rmtree(temp, ignore_errors=True)
    print("[FMU] concluído.")


if __name__ == "__main__":
    main(sys.argv)
