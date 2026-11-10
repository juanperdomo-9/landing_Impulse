from django.shortcuts import render

# Dirección del editor de video con IA (carpeta editor/ del repo).
# Cuando editor.impulsastudiodigital.com.ar esté funcionando en Render, cambiar esta línea por esa dirección.
EDITOR_APP_URL = 'https://impulsa-studiodigital.vercel.app'

CONTEXTO_BASE = {
    'whatsapp_number': '5492216826109',
    'whatsapp_display': '+54 9 221 682-6109',
    # Registro / prueba gratis (después de ingresar abre el editor)
    'editor_url': f'{EDITOR_APP_URL}/login?next=/editor',
    'editor_login_url': f'{EDITOR_APP_URL}/login?next=/editor',
    'editor_baja_url': f'{EDITOR_APP_URL}/cuenta#baja',
    # Precio del editor: actualizarlo acá si cambia en la app del editor.
    'editor_price': '$25.000',
    'editor_ai_credits': 200,
}


def home(request):
    return render(request, 'index.html', CONTEXTO_BASE)


def editor_ia(request):
    return render(request, 'editor_ia.html', CONTEXTO_BASE)
