"""URL configuration."""
from django.contrib import admin
from django.urls import include, path

from . import views as config_views

urlpatterns = [
    path("admin/", admin.site.urls),
    path("accounts/", include("accounts.urls")),
    path("sw.js", config_views.service_worker, name="service_worker"),
    path("", include("tournaments.urls")),
]
