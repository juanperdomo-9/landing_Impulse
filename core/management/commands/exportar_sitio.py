"""
Genera la landing como páginas fijas dentro de editor/sitio/, que es lo que publica el servicio de Render
(el mismo que corre el editor). Django queda como "fábrica": se editan los templates, se corre este comando
y se suben los cambios.

    python manage.py exportar_sitio
"""

import shutil
from pathlib import Path

from django.conf import settings
from django.core.management.base import BaseCommand, CommandError
from django.test import Client, override_settings

# dirección pública -> archivo dentro de editor/sitio/
PAGINAS = {
    '/': 'index.html',
    '/editor-ia/': 'editor-ia/index.html',
}


class Command(BaseCommand):
    help = 'Exporta la landing a editor/sitio/ (HTML + archivos estáticos) para publicarla junto al editor.'

    def handle(self, *args, **options):
        destino = Path(settings.BASE_DIR) / 'editor' / 'sitio'
        if destino.exists():
            shutil.rmtree(destino)
        destino.mkdir(parents=True)

        cliente = Client()
        for url, archivo in PAGINAS.items():
            # en la web nueva el editor está en el mismo dominio, en /editor
            with override_settings(EDITOR_EN_MI_DOMINIO=True):
                respuesta = cliente.get(url)
            if respuesta.status_code != 200:
                raise CommandError(f'{url} respondió {respuesta.status_code}')
            salida = destino / archivo
            salida.parent.mkdir(parents=True, exist_ok=True)
            salida.write_bytes(respuesta.content)
            self.stdout.write(f'  {url} -> editor/sitio/{archivo}')

        # imágenes y demás archivos de static/ (los mismos que sirve la landing en /static/)
        for carpeta in settings.STATICFILES_DIRS:
            shutil.copytree(carpeta, destino / 'static', dirs_exist_ok=True)
        self.stdout.write('  static/ -> editor/sitio/static/')

        self.stdout.write(self.style.SUCCESS('Listo: subí los cambios de editor/sitio/ para publicarlos.'))
