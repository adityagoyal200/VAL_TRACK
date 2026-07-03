import os

from django.core.asgi import get_asgi_application

os.environ.setdefault("DJANGO_SETTINGS_MODULE", "config.settings.local")

django_asgi_app = get_asgi_application()

from channels.routing import ProtocolTypeRouter  # noqa: E402

# Websocket routing is added at M5 (realtime app): the "websocket" key will wrap
# apps.realtime.routing.websocket_urlpatterns in JWTAuthMiddleware.
application = ProtocolTypeRouter(
    {
        "http": django_asgi_app,
    }
)
