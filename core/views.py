from django.shortcuts import render

# ¿El editor ya funciona en impulsastudiodigital.com.ar/editor? (Render + puente de Cloudflare)
# Cuando sí, cambiar a True y los botones de la web pasan a llevar ahí.
EDITOR_EN_MI_DOMINIO = False

if EDITOR_EN_MI_DOMINIO:
    _EDITOR_REGISTRO = '/editor/login?next=/'
    _EDITOR_BAJA = '/editor/cuenta#baja'
else:
    # versión anterior, publicada por la socia en Vercel
    _EDITOR_REGISTRO = 'https://impulsa-studiodigital.vercel.app/login?next=/editor'
    _EDITOR_BAJA = 'https://impulsa-studiodigital.vercel.app/cuenta'

CONTEXTO_BASE = {
    'whatsapp_number': '5492216826109',
    'whatsapp_display': '+54 9 221 682-6109',
    # Registro / prueba gratis (después de ingresar abre el editor)
    'editor_url': _EDITOR_REGISTRO,
    'editor_login_url': _EDITOR_REGISTRO,
    'editor_baja_url': _EDITOR_BAJA,
    # Precio del editor: actualizarlo acá si cambia en la app del editor.
    'editor_price': '$25.000',
    'editor_ai_credits': 200,
}


def home(request):
    return render(request, 'index.html', CONTEXTO_BASE)


def editor_ia(request):
    return render(request, 'editor_ia.html', CONTEXTO_BASE)
