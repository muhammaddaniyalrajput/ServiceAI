"""
Backward-compatibility shim.

The original flat file ``app/api/v1/providers.py`` now redirects to the
``analyze`` miniservice's GET /providers endpoint. Existing imports
keep working; new code should import from
``app.api.v1.analyze.router`` instead.
"""
from app.api.v1.analyze.router import router  # noqa: F401
