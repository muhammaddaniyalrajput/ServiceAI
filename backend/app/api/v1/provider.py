"""
Backward-compatibility shim.

The original flat file ``app/api/v1/provider.py`` now redirects to the
``providers`` miniservice. Existing imports like
``from app.api.v1.provider import router`` keep working; new code should
import from ``app.api.v1.providers.router`` instead.
"""
from app.api.v1.providers.router import router  # noqa: F401
