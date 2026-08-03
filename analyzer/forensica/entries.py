"""
The intermediate file model.

Sits between raw MFT parsing and the emitted case file: one FileEntry per MFT
record that holds a file, with paths already resolved and recovery already
assessed. Detectors and the report writer both consume this, so neither needs to
touch the on-disk structures again.
"""

from __future__ import annotations

from dataclasses import dataclass, field
from typing import Any, Dict, List, Optional

from .mft import Attribute, FileNameAttribute, StandardInformation


@dataclass
class StreamInfo:
    """One $DATA attribute, resolved."""

    name: str
    size: int
    resident: bool
    hash_value: Optional[str] = None
    hash_scope: str = "stream-content"

    def to_json(self) -> Dict[str, Any]:
        return {
            "name": self.name,
            "size": self.size,
            "residency": "resident" if self.resident else "non-resident",
            "hash": (
                {"algorithm": "sha256", "value": self.hash_value, "scope": self.hash_scope}
                if self.hash_value
                else None
            ),
        }


@dataclass
class FileEntry:
    record_number: int
    sequence_number: int
    name: str
    is_directory: bool
    in_use: bool
    standard_information: StandardInformation
    file_name: Optional[FileNameAttribute]
    streams: List[StreamInfo] = field(default_factory=list)
    attribute_flags: List[str] = field(default_factory=list)
    size: int = 0
    allocated_size: int = 0
    parent_record: Optional[int] = None
    parent_sequence: Optional[int] = None
    path: Optional[str] = None
    orphaned: bool = False
    recovery: Optional[Dict[str, Any]] = None
    finding_ids: List[str] = field(default_factory=list)
    #: Retained for hashing and resident recovery; not emitted.
    raw_data_attributes: List[Attribute] = field(default_factory=list)

    @property
    def deleted(self) -> bool:
        return not self.in_use

    @property
    def alternate_streams(self) -> List[StreamInfo]:
        return [s for s in self.streams if s.name != ""]

    @property
    def default_stream(self) -> Optional[StreamInfo]:
        for stream in self.streams:
            if stream.name == "":
                return stream
        return None

    @property
    def is_resident(self) -> bool:
        stream = self.default_stream
        return stream.resident if stream else False
