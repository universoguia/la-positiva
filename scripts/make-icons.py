# -*- coding: utf-8 -*-
"""Genera los iconos de La Positiva a partir del logo de marca.

Reemplaza al viejo make-icons.js, que DIBUJABA un plato por codigo porque
todavia no habia logo. Ahora que existe la marca, los iconos salen de ella.

  Fuente:  icons/origen/logo-la-positiva.jpg
  Uso:     python scripts/make-icons.py

Necesita Pillow (pip install pillow). No corre en el build de Vercel: los PNG
quedan versionados en el repo. Se corre a mano solo si cambia el logo.
"""
import os
import sys

try:
    from PIL import Image
except ImportError:
    sys.exit("Falta Pillow. Instalalo con:  pip install pillow")

AQUI = os.path.dirname(os.path.abspath(__file__))
RAIZ = os.path.dirname(AQUI)
ORIGEN = os.path.join(RAIZ, 'icons', 'origen', 'logo-la-positiva.jpg')
DESTINO = os.path.join(RAIZ, 'icons')


def color_de_fondo(im):
    """El bordo de la marca, sacado del borde de la imagen.

    Se usa la mediana y no el promedio: el JPEG ensucia los pixeles con ruido
    de compresion y un solo pixel raro correria el promedio. Ademas sirve para
    rellenar el margen del icono maskable con el color exacto, en vez de
    estirar pixeles con artefactos.
    """
    px = im.load()
    an, al = im.size
    borde = []
    for x in range(an):
        borde.append(px[x, 0])
        borde.append(px[x, al - 1])
    for y in range(al):
        borde.append(px[0, y])
        borde.append(px[an - 1, y])

    canales = []
    for i in range(3):
        vals = sorted(c[i] for c in borde)
        canales.append(vals[len(vals) // 2])
    return tuple(canales)


def cuadrado(im):
    """Recorta al centro por si el original no viniera cuadrado."""
    an, al = im.size
    if an == al:
        return im
    lado = min(an, al)
    izq = (an - lado) // 2
    arr = (al - lado) // 2
    return im.crop((izq, arr, izq + lado, arr + lado))


def generar(im, fondo, size, escala):
    """Un icono de `size` px con el logo ocupando `escala` del ancho.

    escala < 1 deja margen alrededor: es lo que necesita el icono maskable,
    porque Android y Chrome recortan hasta un 20% del borde y si el logo va a
    sangre te comen las puntas de la P.
    """
    lienzo = Image.new('RGB', (size, size), fondo)
    lado = max(1, int(round(size * escala)))
    # LANCZOS es el mejor remuestreo de Pillow para ampliar y para reducir.
    logo = im.resize((lado, lado), Image.LANCZOS)
    off = (size - lado) // 2
    lienzo.paste(logo, (off, off))
    return lienzo


def main():
    if not os.path.exists(ORIGEN):
        sys.exit("No encuentro el logo en: %s" % ORIGEN)

    im = cuadrado(Image.open(ORIGEN).convert('RGB'))
    fondo = color_de_fondo(im)
    print("origen: %dx%d  |  color de marca: #%02x%02x%02x" % (im.size + fondo))

    if im.size[0] < 512:
        print("AVISO: el original mide %dpx. El icono de 512 sale ampliado y "
              "se va a ver menos nitido. Si aparece un archivo mas grande, "
              "reemplazalo y volve a correr esto." % im.size[0])

    trabajos = [
        # nombre,                    tamanio, escala del logo
        ('icon-192.png',                 192, 1.00),
        ('icon-512.png',                 512, 1.00),
        ('icon-512-maskable.png',        512, 0.78),   # zona segura de Android
        ('apple-touch-icon.png',         180, 1.00),
    ]

    os.makedirs(DESTINO, exist_ok=True)
    for nombre, size, escala in trabajos:
        salida = os.path.join(DESTINO, nombre)
        icono = generar(im, fondo, size, escala)
        # Paleta de 256 colores: la imagen es bordo y blanco, asi que a simple
        # vista es identica, pero el PNG pesa como un 30% menos. La textura
        # ampliada del JPEG es lo que lo inflaba.
        icono = icono.convert('P', palette=Image.ADAPTIVE, colors=256)
        icono.save(salida, 'PNG', optimize=True)
        print("%-26s %dx%d  %d bytes" % (nombre, size, size, os.path.getsize(salida)))


if __name__ == '__main__':
    main()
