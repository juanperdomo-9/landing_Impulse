from django.conf import settings
from django.shortcuts import render

# Precio del editor: actualizarlo acá si cambia en la app del editor.
EDITOR_PRECIO = '$25.000'
EDITOR_CREDITOS_IA = 200


def _contexto():
    # La web nueva (servicio único de Render) muestra el editor en /editor: `exportar_sitio` genera las páginas
    # con EDITOR_EN_MI_DOMINIO=True. El servidor Django viejo, mientras siga online, manda a la versión de Vercel.
    if getattr(settings, 'EDITOR_EN_MI_DOMINIO', False):
        registro = '/editor/login?next=/'
        baja = '/editor/cuenta#baja'
    else:
        registro = 'https://impulsa-studiodigital.vercel.app/login?next=/editor'
        baja = 'https://impulsa-studiodigital.vercel.app/cuenta'
    return {
        'whatsapp_number': '5492216826109',
        'whatsapp_display': '+54 9 221 682-6109',
        # Registro / prueba gratis (después de ingresar abre el editor)
        'editor_url': registro,
        'editor_login_url': registro,
        'editor_baja_url': baja,
        'editor_price': EDITOR_PRECIO,
        'editor_ai_credits': EDITOR_CREDITOS_IA,
    }


def home(request):
    return render(request, 'index.html', _contexto())


def editor_ia(request):
    return render(request, 'editor_ia.html', _contexto())
