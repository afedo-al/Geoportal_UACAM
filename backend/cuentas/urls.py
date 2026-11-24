from django.urls import path

from . import views

urlpatterns = [
    path('sesion', views.sesion),
    path('demo', views.demo),
]
