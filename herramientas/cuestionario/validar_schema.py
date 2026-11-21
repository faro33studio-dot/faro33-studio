#!/usr/bin/env python3
"""Valida el esquema que consume el motor de formularios de Faro 33."""
import json
from pathlib import Path

TIPOS = {"text", "tel", "email", "textarea", "select", "radio", "checkbox", "consent"}
TIPOS_CON_OPCIONES = {"select", "radio", "checkbox"}
SCHEMA = Path(__file__).resolve().parents[2] / "cuestionario" / "schema.json"


def validar(schema):
    errores = []
    secciones = set()
    campos = {}

    def registrar_id(objeto, ruta, ids):
        identificador = objeto.get("id")
        if not isinstance(identificador, str) or not identificador.strip():
            errores.append(f"{ruta}: id inválido")
            return None
        if identificador in ids:
            errores.append(f"{ruta}: id repetido ({identificador})")
            return None
        return identificador

    def revisar_condicion(objeto, ruta):
        if "mostrarSi" not in objeto:
            return
        condicion = objeto["mostrarSi"]
        if not isinstance(condicion, dict):
            errores.append(f"{ruta}: mostrarSi debe ser un objeto")
            return
        campo = condicion.get("campo")
        if not isinstance(campo, str) or campo not in campos:
            errores.append(f"{ruta}: mostrarSi.campo {campo!r} debe estar definido antes")
        operadores = set(condicion) - {"campo"}
        if len(operadores) != 1 or not operadores <= {"presente", "igual", "en", "contiene"}:
            errores.append(f"{ruta}: mostrarSi requiere exactamente uno de presente, igual, en o contiene")
            return
        operador = operadores.pop()
        if operador == "presente":
            if condicion[operador] is not True:
                errores.append(f"{ruta}: mostrarSi.presente debe ser true")
            return
        valores = condicion[operador] if operador == "en" else [condicion[operador]]
        if not isinstance(valores, list) or not valores:
            errores.append(f"{ruta}: mostrarSi.en debe ser un arreglo no vacío")
            return
        if isinstance(campo, str) and campo in campos:
            tipo, opciones = campos[campo]
            if operador == "contiene" and tipo != "checkbox":
                errores.append(f"{ruta}: mostrarSi.contiene requiere que {campo!r} sea checkbox")
            for valor in valores:
                if not isinstance(valor, str) or valor not in opciones:
                    errores.append(f"{ruta}: {valor!r} no es una opción de {campo!r}")

    def revisar_opciones(campo, ruta, tipo):
        valores = set()
        if "opciones" not in campo and tipo not in TIPOS_CON_OPCIONES:
            return valores
        opciones = campo.get("opciones")
        if not isinstance(opciones, list) or not opciones:
            errores.append(f"{ruta}: opciones debe ser un arreglo no vacío")
            return valores
        for indice, opcion in enumerate(opciones):
            valor = opcion.get("valor") if isinstance(opcion, dict) else None
            if not isinstance(valor, str) or not valor.strip():
                errores.append(f"{ruta}.opciones[{indice}]: valor inválido")
            elif valor in valores:
                errores.append(f"{ruta}.opciones[{indice}]: valor repetido ({valor})")
            else:
                valores.add(valor)
        return valores

    if not isinstance(schema, dict) or not isinstance(schema.get("secciones"), list):
        return ["secciones debe ser un arreglo"]
    for indice, seccion in enumerate(schema["secciones"]):
        ruta = f"secciones[{indice}]"
        if not isinstance(seccion, dict):
            errores.append(f"{ruta}: se esperaba un objeto")
            continue
        identificador = registrar_id(seccion, ruta, secciones)
        if identificador is not None:
            secciones.add(identificador)
        if "descripcion" in seccion and (
            not isinstance(seccion["descripcion"], str) or not seccion["descripcion"].strip()
        ):
            errores.append(f"{ruta}.descripcion: se esperaba texto no vacío")
        revisar_condicion(seccion, ruta)
        if not isinstance(seccion.get("campos"), list):
            errores.append(f"{ruta}.campos: se esperaba un arreglo")
            continue
        for posicion, campo in enumerate(seccion["campos"]):
            ruta_campo = f"{ruta}.campos[{posicion}]"
            if not isinstance(campo, dict):
                errores.append(f"{ruta_campo}: se esperaba un objeto")
                continue
            identificador = registrar_id(campo, ruta_campo, campos)
            tipo = campo.get("tipo")
            if not isinstance(tipo, str) or tipo not in TIPOS:
                errores.append(f"{ruta_campo}: tipo inválido ({tipo!r})")
                tipo = None
            revisar_condicion(campo, ruta_campo)
            valores = revisar_opciones(campo, ruta_campo, tipo)
            if "maxSeleccion" in campo:
                limite = campo["maxSeleccion"]
                if tipo != "checkbox" or type(limite) is not int or not 1 <= limite <= len(valores):
                    errores.append(f"{ruta_campo}.maxSeleccion: se esperaba un entero de 1 al número de opciones, solo en checkbox")
            if identificador is not None:
                campos[identificador] = (tipo, valores)
    return errores


if __name__ == "__main__":
    try:
        errores = validar(json.loads(SCHEMA.read_text(encoding="utf-8")))
    except (OSError, ValueError) as error:
        errores = [f"No se pudo leer el esquema: {error}"]
    if errores:
        print("\n".join(f"- {error}" for error in errores))
        raise SystemExit(1)
    print("OK")
