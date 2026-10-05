"""The shapes of the Google Drive endpoints (routes/drive.py)."""

from datetime import datetime

from pydantic import BaseModel, Field


class DriveLogEntry(BaseModel):
    id: int
    at: datetime
    actor: str
    action: str = Field(description="check, sync, read, save or settings")
    outcome: str = Field(description="allowed, refused or failed")
    reason: str | None = Field(None, description="A code: why it was refused, or what was noted")
    name: str | None = Field(None, description="The file or folder, by name; never its content")
    detail: dict | None = None


class DriveState(BaseModel):
    configured: bool = Field(description="The server has the tool's Google key")
    enabled: bool = Field(description="Switched on, with a folder chosen and a key")
    folder_name: str = ""
    can_save: bool = Field(False, description="The last check found a folder the tool may save in")
    save_folder: str | None = None
    # for admins only
    account: str | None = Field(None, description="The tool's Google address, which the folder is shared with")
    problem: str | None = None
    switched_on: bool | None = None
    folder_id: str | None = None
    check: dict | None = Field(None, description="The last check: the folder, what the account sees outside it, "
                                                 "where it may save")
    synced: str | None = None
    counts: dict | None = None
    log: list[DriveLogEntry] | None = None


class DriveSettingsIn(BaseModel):
    folder: str | None = Field(None, max_length=500, description="The folder's address in Drive")
    enabled: bool | None = None


class DriveSync(BaseModel):
    ran: bool
    reason: str | None = None
    listed: int = 0
    read: int = 0
    waiting: int = 0
    later: int = 0
    outside_count: int = 0


class DriveSavedFile(BaseModel):
    name: str | None = None
    link: str | None = None
    type: str | None = None


class DriveSaved(BaseModel):
    folder: dict
    files: list[DriveSavedFile]
