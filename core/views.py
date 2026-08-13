from django.shortcuts import render

def home(request):
    context = {
        'whatsapp_number': '5492216826109',
    }
    return render(request, 'index.html', context)