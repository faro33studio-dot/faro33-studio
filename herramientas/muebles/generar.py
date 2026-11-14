#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""Genera /muebles/ (Colección Verano 2026) desde el catálogo fuente.

No es un build de despliegue: se corre a mano, se revisa el diff y se versiona
el resultado. Es idempotente: volver a correrlo produce los mismos bytes y solo
copia fotos que falten o hayan cambiado.

Uso:
    python3 herramientas/muebles/generar.py
    python3 herramientas/muebles/generar.py --data ... --lineas ... --img-src ... --out-dir ...

Las rutas por defecto se pueden cambiar aquí abajo o con los argumentos.
"""
from __future__ import annotations

import argparse
import filecmp
import html
import json
import math
import shutil
import sys
from pathlib import Path
from urllib.parse import quote

# ---------------------------------------------------------------------------
# Rutas configurables (fuentes de solo lectura + salida dentro del repo)
# ---------------------------------------------------------------------------
REPO = Path(__file__).resolve().parents[2]

DEFAULT_DATA = Path("/Users/luisfernandoaramburomeza/Documents/faro33-sitio/catalogo/web/v1/data.final.json")
DEFAULT_LINEAS = Path("/Users/luisfernandoaramburomeza/Documents/faro33-sitio/catalogo/web/v1/lineas.final.json")
DEFAULT_IMG_SRC = Path("/Users/luisfernandoaramburomeza/Documents/faro33-sitio/catalogo/web/v3/img")
DEFAULT_TEMPLATE = Path(__file__).resolve().parent / "muebles-plantilla.html"
DEFAULT_OUT_DIR = REPO / "muebles"

IMG_WEB = "/muebles/img/verano-2026"
DATA_WEB = "/muebles/data/verano-2026.json"
COLECCION = "verano-2026"
EXPECTED_TOTAL = 247
EXPECTED_VARIANTES = 23
WA_NUMERO = "526675402559"
WA_CATALOGO = "Hola, quiero recibir el catálogo de la Colección Verano 2026 de FARO 33."
SELECCION = ["bono", "cuore", "tossa", "aspen", "bear", "arms", "tess", "bone"]
SIZES = "(max-width:600px) 46vw,(max-width:1000px) 31vw,277px"


# ---------------------------------------------------------------------------
# Utilidades
# ---------------------------------------------------------------------------
def esc(value: object) -> str:
    return html.escape(str(value), quote=True)


def webp_size(path: Path) -> tuple[int, int]:
    """Lee ancho/alto de un WebP sin Pillow (VP8X, VP8 con pérdida o VP8L)."""
    with path.open("rb") as fh:
        head = fh.read(30)
    if len(head) < 30 or head[:4] != b"RIFF" or head[8:12] != b"WEBP":
        raise ValueError(f"No es un WebP válido: {path}")
    fourcc = head[12:16]
    if fourcc == b"VP8X":
        width = 1 + int.from_bytes(head[24:27], "little")
        height = 1 + int.from_bytes(head[27:30], "little")
    elif fourcc == b"VP8 ":
        width = int.from_bytes(head[26:28], "little") & 0x3FFF
        height = int.from_bytes(head[28:30], "little") & 0x3FFF
    elif fourcc == b"VP8L":
        bits = int.from_bytes(head[21:25], "little")
        width = 1 + (bits & 0x3FFF)
        height = 1 + ((bits >> 14) & 0x3FFF)
    else:
        raise ValueError(f"WebP con chunk inicial no soportado ({fourcc!r}): {path}")
    if width <= 0 or height <= 0:
        raise ValueError(f"Dimensiones inválidas en {path}: {width}x{height}")
    return width, height


def is_set(categoria: str) -> bool:
    c = categoria.strip().lower()
    return (
        "+" in c
        or c.startswith("set ")
        or c.startswith("juego ")
        or c.startswith("mesa y ")
        or c.startswith("escritorio y ")
    )


def linea_visible(pieza: dict, slugs: set[str]) -> str:
    """Slug público de la línea (las sillas nacionales filtran con 'sillas')."""
    slug = pieza.get("linea_slug", "")
    if slug in slugs:
        return slug
    if pieza.get("linea_web") == "Sillas":
        return "sillas"
    raise ValueError(f"La pieza {pieza.get('id')!r} no cae en ninguna línea pública: {slug!r}")


def medida_linea(pieza: dict) -> str:
    variantes = pieza.get("variantes") or []
    if len(variantes) > 1:
        return f"{variantes[0]} · {len(variantes)} medidas"
    return pieza.get("medidas") or ""


def tarjeta(pieza: dict, *, dims: dict[str, tuple[int, int]], slugs: set[str],
            force_q: bool = False, eager: bool = False, first: bool = False) -> str:
    pid = pieza["id"]
    slug = linea_visible(pieza, slugs)
    clase = "mb mb--q" if force_q else f"mb mb--{pieza['clase']}"
    attrs = [
        f'href="#pieza={esc(pid)}"',
        f'data-id="{esc(pid)}"',
        f'data-linea="{esc(slug)}"',
    ]
    if pieza.get("ambiente"):
        attrs.append('data-amb="1"')
    width, height = dims[pid]
    load = 'loading="eager"' if eager else 'loading="lazy"'
    priority = ' fetchpriority="high"' if first else ""
    medidas = medida_linea(pieza)
    set_badge = '    <span class="mb-set">Set</span>\n' if is_set(pieza.get("categoria", "")) else ""
    medida_html = f'\n      <p class="mb-m">{esc(medidas)}</p>' if medidas else ""
    return (
        f'<a class="{clase}" ' + " ".join(attrs) + ">\n"
        f'  <div class="mb-ph">\n'
        f'    <img src="{IMG_WEB}/{esc(pid)}-640.webp" '
        f'srcset="{IMG_WEB}/{esc(pid)}-360.webp 360w, {IMG_WEB}/{esc(pid)}-640.webp 640w" '
        f'sizes="{SIZES}" width="{width}" height="{height}" alt="{esc(pieza["nombre"])}" '
        f'{load} decoding="async"{priority}>\n'
        f'{set_badge}'
        f'  </div>\n'
        f'  <div class="mb-t">\n'
        f'    <p class="mb-c">{esc(pieza["categoria"])}</p>\n'
        f'    <h3 class="mb-n">{esc(pieza["nombre"])}</h3>{medida_html}\n'
        f'  </div>\n'
        f'</a>'
    )


def estimar_alto(n: int, slug: str, clase: str) -> int:
    """Altura aproximada para contain-intrinsic-size.

    Usa un ancho de tarjeta medio (229 px, 3 columnas) y la proporción de la
    línea, para que el hueco reservado no se aleje demasiado del alto real ni
    en móvil (2 columnas) ni en escritorio (4).
    """
    ratios = {"v": 4 / 5, "h": 3 / 2, "q": 1 / 1}
    if clase not in ratios:
        raise ValueError(f"Clase de línea desconocida: {clase!r}")
    filas = max(1, math.ceil(n / 3))
    alto_fila = 229 / ratios[clase] + 64 + 28
    extra = 38 if slug == "sillas" else 0
    return int(filas * alto_fila) + 70 + extra


# ---------------------------------------------------------------------------
# Generación
# ---------------------------------------------------------------------------
def main() -> int:
    ap = argparse.ArgumentParser(description="Genera /muebles/ de faro33studio.com")
    ap.add_argument("--data", type=Path, default=DEFAULT_DATA, help="data.final.json")
    ap.add_argument("--lineas", type=Path, default=DEFAULT_LINEAS, help="lineas.final.json")
    ap.add_argument("--img-src", type=Path, default=DEFAULT_IMG_SRC, help="carpeta v3/img")
    ap.add_argument("--template", type=Path, default=DEFAULT_TEMPLATE, help="muebles-plantilla.html")
    ap.add_argument("--out-dir", type=Path, default=DEFAULT_OUT_DIR, help="carpeta muebles/")
    args = ap.parse_args()

    data_path = args.data.resolve()
    lineas_path = args.lineas.resolve()
    img_src = args.img_src.resolve()
    template_path = args.template.resolve()
    out_dir = args.out_dir.resolve()
    out_img = out_dir / "img" / COLECCION
    out_data = out_dir / "data" / f"{COLECCION}.json"
    out_html = out_dir / "index.html"

    for path in (data_path, lineas_path, template_path):
        if not path.exists():
            raise FileNotFoundError(f"No existe la fuente: {path}")
    if not img_src.is_dir():
        raise FileNotFoundError(f"No existe la carpeta de fotos: {img_src}")

    records = json.loads(data_path.read_text(encoding="utf-8"))
    lineas = json.loads(lineas_path.read_text(encoding="utf-8"))
    if len(lineas) != 11:
        raise ValueError(f"Se esperaban 11 líneas públicas, hay {len(lineas)}")

    by_id = {r["id"]: r for r in records}
    published = [r for r in records if not r.get("oculta") and not r.get("oculta_por_agrupacion")]
    if len(published) != EXPECTED_TOTAL:
        raise ValueError(f"Se esperaban {EXPECTED_TOTAL} piezas publicadas, hay {len(published)}")
    if sum(int(l["n"]) for l in lineas) != EXPECTED_TOTAL:
        raise ValueError("Las cuentas de lineas.final.json no suman 247")

    slugs = {l["slug"] for l in lineas}
    line_names = {l["nombre"] for l in lineas}
    huerfanas = [p["id"] for p in published if p.get("linea_web") not in line_names]
    if huerfanas:
        raise ValueError(f"Piezas fuera de las líneas públicas: {huerfanas}")

    variantes = [v for p in published for v in (p.get("variantes_acabado") or [])]
    if len(variantes) != EXPECTED_VARIANTES:
        raise ValueError(f"Se esperaban {EXPECTED_VARIANTES} variantes agrupadas, hay {len(variantes)}")

    # --- fotos: 360 + 640 de las 247 tarjetas y de sus variantes; 1000 si existe
    out_img.mkdir(parents=True, exist_ok=True)
    photo_ids = [p["id"] for p in published] + [v["id"] for v in variantes]
    copied = unchanged = 0
    for pid in photo_ids:
        for suffix in ("-360.webp", "-640.webp", "-1000.webp"):
            src = img_src / f"{pid}{suffix}"
            if not src.exists():
                if suffix == "-1000.webp":
                    continue
                raise FileNotFoundError(f"Falta la foto {src}")
            dst = out_img / src.name
            if dst.exists() and filecmp.cmp(src, dst, shallow=False):
                unchanged += 1
            else:
                shutil.copy2(src, dst)
                copied += 1
    total_fotos = len(photo_ids) * 2 + sum(
        1 for pid in photo_ids if (img_src / f"{pid}-1000.webp").exists()
    )

    # --- dimensiones reales de la -640
    dims: dict[str, tuple[int, int]] = {}
    for p in published:
        dims[p["id"]] = webp_size(img_src / f"{p['id']}-640.webp")

    # --- selección del estudio (1:1), en el orden aprobado
    sel = []
    for pid in SELECCION:
        rec = by_id.get(pid)
        if not rec or rec.get("oculta") or rec.get("oculta_por_agrupacion"):
            raise ValueError(f"La pieza de selección {pid!r} no está publicada")
        sel.append(rec)
    sel_cards = []
    for i, p in enumerate(sel):
        sel_cards.append(tarjeta(p, dims=dims, slugs=slugs, force_q=True, eager=i < 4, first=i == 0))
    seleccion_html = (
        f'  <section class="mb-sec" id="seleccion" data-n="{len(sel)}" style="--mb-size:{estimar_alto(len(sel), "seleccion", "q")}px">\n'
        f'    <div class="wrap">\n'
        f'      <h2 class="mb-h2">Selección del estudio <span>{len(sel)} piezas</span></h2>\n'
        f'      <div class="mb-grid">\n' + "\n".join(sel_cards) + "\n"
        f'      </div>\n'
        f'    </div>\n'
        f'  </section>'
    )

    # --- secciones por línea, en el orden de lineas.final.json
    secciones_html = []
    ordered: list[dict] = []
    for linea in lineas:
        slug = linea["slug"]
        piezas = [p for p in published if p.get("linea_web") == linea["nombre"]]
        if len(piezas) != int(linea["n"]):
            raise ValueError(f"{linea['nombre']}: lineas.final.json dice {linea['n']}, hay {len(piezas)}")
        normales = sorted(
            [p for p in piezas if not p.get("ambiente") and p.get("linea_slug") != "sillas-fabricacion-nacional"],
            key=lambda p: (int(p.get("orden_pieza", 0)), p["id"]),
        )
        nacionales = sorted(
            [p for p in piezas if not p.get("ambiente") and p.get("linea_slug") == "sillas-fabricacion-nacional"],
            key=lambda p: (int(p.get("orden_pieza", 0)), p["id"]),
        )
        ambiente = sorted(
            [p for p in piezas if p.get("ambiente")],
            key=lambda p: (int(p.get("orden_pieza", 0)), p["id"]),
        )
        celdas: list[str] = [tarjeta(p, dims=dims, slugs=slugs) for p in normales]
        if nacionales:
            celdas.append('<p class="mb-sub">Fabricación nacional</p>')
            celdas.extend(tarjeta(p, dims=dims, slugs=slugs) for p in nacionales)
        celdas.extend(tarjeta(p, dims=dims, slugs=slugs) for p in ambiente)
        ordered.extend(normales + nacionales + ambiente)
        secciones_html.append(
            f'  <section class="mb-sec" id="linea-{slug}" data-linea="{slug}" data-n="{len(piezas)}" style="--mb-size:{estimar_alto(len(piezas), slug, linea["clase"])}px">\n'
            f'    <div class="wrap">\n'
            f'      <h2 class="mb-h2">{esc(linea["nombre"])} <span>{len(piezas)} piezas</span></h2>\n'
            f'      <div class="mb-grid">\n' + "\n".join(celdas) + "\n"
            f'      </div>\n'
            f'    </div>\n'
            f'  </section>'
        )

    if len(ordered) != EXPECTED_TOTAL or len({p["id"] for p in ordered}) != EXPECTED_TOTAL:
        raise ValueError("El orden de secciones no cubre exactamente las 247 piezas")

    chips = [
        '<button type="button" class="chip" data-slug="todas" aria-pressed="true" aria-controls="coleccion">Todas</button>'
    ]
    for linea in lineas:
        chips.append(
            f'<button type="button" class="chip" data-slug="{esc(linea["slug"])}" '
            f'aria-pressed="false" aria-controls="coleccion">{esc(linea["nombre"])}</button>'
        )

    # --- detalle para la ficha (M3)
    def detail_img(pid: str) -> str:
        return f"{IMG_WEB}/{pid}-1000.webp" if (img_src / f"{pid}-1000.webp").exists() else f"{IMG_WEB}/{pid}-640.webp"

    detalle = []
    for p in ordered:
        incluye = []
        for iid in p.get("incluye") or []:
            if iid not in by_id:
                raise ValueError(f"{p['id']}: incluye apunta a un id inexistente ({iid})")
            incluye.append({"id": iid, "nombre": by_id[iid]["nombre"]})
        acabados = []
        for v in p.get("variantes_acabado") or []:
            acabados.append({
                "id": v["id"],
                "color": v.get("color") or v["id"],
                "img": detail_img(v["id"]),
            })
        detalle.append({
            "id": p["id"],
            "nombre": p["nombre"],
            "categoria": p.get("categoria", ""),
            "linea": p.get("linea_web", ""),
            "linea_slug": p.get("linea_slug", ""),
            "medidas": p.get("medidas", ""),
            "variantes": p.get("variantes") or [],
            "materiales": p.get("materiales") or [],
            "colores": p.get("colores") or [],
            "incluye": incluye,
            "variantes_acabado": acabados,
            "clase": p.get("clase", ""),
            "ambiente": bool(p.get("ambiente")),
            "img": detail_img(p["id"]),
        })
    if len(detalle) != EXPECTED_TOTAL:
        raise ValueError(f"El JSON de detalle debe tener {EXPECTED_TOTAL} piezas, tiene {len(detalle)}")

    # --- HTML desde la plantilla
    template = template_path.read_text(encoding="utf-8")
    wa_url = f"https://wa.me/{WA_NUMERO}?text={quote(WA_CATALOGO, safe='')}"
    replacements = {
        "{{TOTAL}}": str(EXPECTED_TOTAL),
        "{{COUNT}}": f"{EXPECTED_TOTAL} piezas · Colección Verano 2026",
        "{{CHIPS}}": "\n        ".join(chips),
        "{{SELECCION}}": seleccion_html,
        "{{SECCIONES}}": "\n\n".join(secciones_html),
        "{{WA_CATALOGO}}": wa_url,
    }
    page = template
    for token, value in replacements.items():
        page = page.replace(token, value)
    if "{{" in page:
        raise ValueError("Quedaron tokens sin reemplazar en la plantilla")

    out_dir.mkdir(parents=True, exist_ok=True)
    out_data.parent.mkdir(parents=True, exist_ok=True)
    out_html.write_text(page, encoding="utf-8", newline="\n")
    out_data.write_text(json.dumps(detalle, ensure_ascii=False, indent=1) + "\n", encoding="utf-8", newline="\n")

    print(f"publicadas: {len(published)}")
    print(f"lineas: {len(lineas)} · seleccion: {len(sel)}")
    print(f"tarjetas HTML: {len(ordered)} de linea + {len(sel)} de seleccion = {len(ordered) + len(sel)}")
    print(f"fotos: {total_fotos} esperadas · {copied} copiadas · {unchanged} sin cambios · {len(photo_ids)} ids")
    try:
        data_label = out_data.relative_to(REPO)
        html_label = out_html.relative_to(REPO)
    except ValueError:
        data_label = out_data
        html_label = out_html
    print(f"data: {data_label} ({len(detalle)} piezas, {out_data.stat().st_size} bytes)")
    print(f"index: {html_label} ({out_html.stat().st_size} bytes)")
    return 0


if __name__ == "__main__":
    sys.exit(main())
