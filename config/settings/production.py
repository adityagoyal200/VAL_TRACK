from .base import *  # noqa: F401,F403

DEBUG = False

SECURE_PROXY_SSL_HEADER = ("HTTP_X_FORWARDED_PROTO", "https")
SECURE_SSL_REDIRECT = True
SESSION_COOKIE_SECURE = True
CSRF_COOKIE_SECURE = True

# Cloudflare R2 (S3-compatible) — configured at M3 when screenshot uploads land
STORAGES = {
    "default": {
        "BACKEND": "storages.backends.s3.S3Storage",
        "OPTIONS": {
            "bucket_name": env("R2_BUCKET_NAME", default=""),  # noqa: F405
            "endpoint_url": env("R2_ENDPOINT_URL", default=""),  # noqa: F405
            "access_key": env("R2_ACCESS_KEY_ID", default=""),  # noqa: F405
            "secret_key": env("R2_SECRET_ACCESS_KEY", default=""),  # noqa: F405
        },
    },
    "staticfiles": {
        "BACKEND": "django.contrib.staticfiles.storage.StaticFilesStorage",
    },
}
