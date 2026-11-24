from django.urls import path

from . import views

urlpatterns = [
    path('puntos', views.puntos),
    path('puntos/lote', views.lote),
    path('puntos/<str:id>', views.punto),
    path('puntos/<str:id>/foto', views.foto),
]
