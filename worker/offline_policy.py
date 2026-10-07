"""Production policy applied before importing handlers. Provisioning is separate."""
import ipaddress
import os
import socket
from urllib.parse import urlsplit


def loopback_url(value):
    parsed = urlsplit(value)
    if parsed.scheme not in ("http", "https") or parsed.username or parsed.password or parsed.query or parsed.fragment:
        raise ValueError("local endpoint must be an HTTP URL without embedded credentials")
    host = parsed.hostname
    try:
        allowed = host == "localhost" or ipaddress.ip_address(host).is_loopback
    except ValueError:
        allowed = False
    if not allowed:
        raise ValueError("offline production requires a literal loopback address or localhost")
    return value


def install():
    if os.environ.get("QAMBA_OFFLINE_ONLY") != "1":
        return
    for name in ("ANTHROPIC_API_KEY", "CLAUDE_CODE_OAUTH_TOKEN", "OPENAI_API_KEY", "GEMINI_API_KEY", "ELEVENLABS_API_KEY", "FAL_KEY", "FISH_API_KEY"):
        os.environ.pop(name, None)
    original_connect = socket.socket.connect
    original_connect_ex = socket.socket.connect_ex
    original_getaddrinfo = socket.getaddrinfo
    def check(address):
        if not isinstance(address, tuple):
            raise PermissionError("offline production refuses non-IP network sockets")
        host = address[0]
        try:
            allowed = host == "localhost" or ipaddress.ip_address(host).is_loopback
        except ValueError:
            allowed = False
        if not allowed:
            raise PermissionError("offline production blocked an outbound connection")
    def connect(sock, address):
        check(address)
        return original_connect(sock, address)
    def connect_ex(sock, address):
        check(address)
        return original_connect_ex(sock, address)
    def getaddrinfo(host, port, *args, **kwargs):
        check((host, port))
        # Localhost cannot depend on an altered hosts file or DNS response.
        return original_getaddrinfo("127.0.0.1" if host == "localhost" else host, port, *args, **kwargs)
    socket.socket.connect = connect
    socket.socket.connect_ex = connect_ex
    socket.getaddrinfo = getaddrinfo
    for name in ("COMFY_URL", "OLLAMA_URL", "OPENAI_BASE_URL", "BREEZE_TTS_URL", "QWEN_TTS_URL", "SUPABASE_URL"):
        if os.environ.get(name):
            loopback_url(os.environ[name])
