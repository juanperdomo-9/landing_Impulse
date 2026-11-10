from django.contrib import admin
from django.urls import path
from core.views import editor_ia, home

urlpatterns = [
    path('admin/', admin.site.urls),
    path('', home, name='home'),
    path('editor-ia/', editor_ia, name='editor_ia'),
]
