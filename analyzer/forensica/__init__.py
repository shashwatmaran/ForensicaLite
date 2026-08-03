"""
ForensicaLite analyzer — raw NTFS forensics.

The package is deliberately free of third-party dependencies. Everything here
is parsed from the volume by hand against the on-disk structures, using only
the standard library, so the pipeline from sector to finding is inspectable end
to end.
"""

__version__ = "2.0.0-dev"

#: Case file schema this analyzer emits. Must match SCHEMA_VERSION in
#: src/types/case.ts — the web app rejects anything else.
SCHEMA_VERSION = 1
