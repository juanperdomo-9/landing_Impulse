from django.shortcuts import render

def home(request):
    context = {
        'whatsapp_number': '5492216826109',
        'whatsapp_display': '+54 9 221 682-6109',
    }
    return render(request, 'index.html', context)