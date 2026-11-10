from django.shortcuts import render

CONTEXTO_BASE = {
    'whatsapp_number': '5492216826109',
    'whatsapp_display': '+54 9 221 682-6109',
    'editor_url': 'https://impulsa-studiodigital.vercel.app',
    # Precio del editor: actualizarlo acá si cambia en la app del editor.
    'editor_price': '$25.000',
    'editor_ai_credits': 200,
}


def home(request):
    return render(request, 'index.html', CONTEXTO_BASE)


def editor_ia(request):
    return render(request, 'editor_ia.html', CONTEXTO_BASE)
