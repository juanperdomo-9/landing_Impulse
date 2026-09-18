class AllowFrameEmbedMiddleware:
    """Permite que jpweb.com.ar (portfolio de Juan Perdomo) embeba este sitio
    en un iframe para la vista previa de proyectos, sin abrirlo a cualquier sitio."""

    ALLOWED_ANCESTORS = "'self' https://jpweb.com.ar https://*.onrender.com"

    def __init__(self, get_response):
        self.get_response = get_response

    def __call__(self, request):
        response = self.get_response(request)
        response["Content-Security-Policy"] = "frame-ancestors " + self.ALLOWED_ANCESTORS
        return response

