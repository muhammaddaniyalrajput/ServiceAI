"""
Backward-compatibility shim.

The original flat file ``app/api/v1/analyze.py`` now redirects to the
``analyze`` miniservice. The HTTP routes haven't moved — they're still
mounted at ``POST /analyze-request`` and friends — but the
implementation lives in ``app/api/v1/analyze/router.py``.

Existing code that does ``from app.api.v1.analyze import router``
keeps working; new code should import from
``app.api.v1.analyze.router`` instead.
"""
from app.api.v1.analyze.router import router  # noqa: F401
