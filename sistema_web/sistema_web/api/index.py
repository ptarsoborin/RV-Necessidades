"""Entrada do sistema na Vercel: a Vercel procura a variável `app` (WSGI) neste arquivo."""
import sys
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent.parent))

from rvn import create_app  # noqa: E402

app = create_app()
