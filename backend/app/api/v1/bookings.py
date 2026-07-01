"""
Backward-compatibility shim.

The original flat file ``app/api/v1/bookings.py`` now redirects to the
``bookings`` miniservice. Existing imports like
``from app.api.v1.bookings import router`` keep working; new code should
import from ``app.api.v1.bookings.router`` instead.
"""
from app.api.v1.bookings.router import router  # noqa: F401
from app.api.v1.bookings import services as services  # noqa: F401
