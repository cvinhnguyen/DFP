"""The shapes of the Google Drive endpoints (routes/drive.py)."""

from datetime import datetime

from pydantic import BaseModel, Field


class DriveLogEntry(BaseModel):
    id: int
    at: datetime
    actor: str
    action: str = Field(description="check, sync, read, save, settings, withdraw (an article taken out because "
                                    "its document left the folder) or import (a picture into Kuvapankki)")
    outcome: str = Field(description="allowed, refused or failed")
    reason: str | None = Field(None, description="A code: why it was refused, or what was noted")
    name: str | None = Field(None, description="The file or folder, by name; never its content")
    detail: dict | None = None


class DriveState(BaseModel):
    configured: bool = Field(description="The server has the tool's Google key")
    enabled: bool = Field(description="Switched on, with a folder chosen and a key")
    folder_name: str = ""
    can_save: bool = Field(False, description="The last check found a folder the tool may save in")
    save: str | None = Field(None, description="Where saves go: subfolder, whole_folder, or why none can be "
                                               "made: my_drive, read_only, ambiguous")
    save_folder: str | None = None
    autosave: bool = Field(False, description="Each sent newsletter is saved into the folder by itself")
    synced: str | None = Field(None, description="When the folder was last read")
    # for admins only
    account: str | None = Field(None, description="The tool's Google address, which the folder is shared with")
    problem: str | None = None
    switched_on: bool | None = None
    folder_id: str | None = None
    check: dict | None = Field(None, description="The last check: the folder, what the account sees outside it, "
                                                 "where it may save")
    counts: dict | None = None
    log: list[DriveLogEntry] | None = None


class DriveSettingsIn(BaseModel):
    folder: str | None = Field(None, max_length=500, description="The folder's address in Drive")
    enabled: bool | None = None
    autosave: bool | None = Field(None, description="Save each newsletter sent from now on by itself")


class DriveSync(BaseModel):
    ran: bool
    reason: str | None = None
    listed: int = 0
    read: int = 0
    waiting: int = 0
    later: int = 0
    outside_count: int = 0
    withdrawn: int = Field(0, description="Articles taken out because their documents left the folder")
    saved: int = Field(0, description="Sent newsletters saved by themselves")
    complete: bool = Field(True, description="The listing got to the end: only then is anything taken out")


class DriveSavedFile(BaseModel):
    name: str | None = None
    link: str | None = None
    type: str | None = None


class DriveSaved(BaseModel):
    folder: dict
    files: list[DriveSavedFile]
    count: int | None = Field(None, description="For a list: the articles saved")
    total: int | None = Field(None, description="For a list: the articles it had")


class DriveFile(BaseModel):
    drive_id: str
    name: str
    mime_type: str
    path: str = Field(description="The folders above it, Tapahtumat/Syksy")
    is_folder: bool
    size: int | None = None
    modified_at: datetime | None = None
    web_link: str | None = Field(None, description="The file in Drive, for the association's own people")
    status: str = Field(description="new, read, waiting, skipped, refused, failed, folder or own")
    reason: str | None = Field(None, description="Why it was not read, as a code")
    item_id: int | None = Field(None, description="The article made of it")
    item_status: str | None = None
    withdrawn: bool | None = None
    next_read_at: str | None = Field(None, description="For one still to be read: when it will be")


class DriveFiles(BaseModel):
    files: list[DriveFile]
    synced: str | None = None
    folder_name: str = ""
    source_id: int | None = Field(None, description="The source the folder's articles are of, for Artikkelit")


class DrivePicture(BaseModel):
    drive_id: str
    name: str
    mime_type: str
    path: str
    size: int | None = None
    modified_at: datetime | None = None
    usable: bool = Field(description="A picture an email can show, small enough, and not named as people's details")
    image_key: str | None = Field(None, description="Already in Kuvapankki under this key")


class DriveSaveOptions(BaseModel):
    suggested: str = Field(description="The folder the article goes in unless another is chosen")
    folders: list[str] = Field(description="The folders articles were saved into before")
    picture: str | None = Field(None, description="Its picture's rights: own and open go along, check does not")
    summary: bool
    from_drive: bool = Field(description="The article is a document in the folder already")
    save: str | None = Field(None, description="subfolder or whole_folder when saving is possible; otherwise why not")
    saved: dict | None = Field(None, description="When it was saved before, and where")
    path: list[str] = Field(description="The folders the article's folder is in")


class DriveArticleIn(BaseModel):
    folder: str | None = Field(None, max_length=80, description="The folder's name; the suggested one when left out")


class DrivePlace(BaseModel):
    view: str = Field("all", pattern=r"^[a-z]{2,12}$")
    sort: str = Field("collected", pattern=r"^(collected|published|relevance)$")
    q: str | None = Field(None, max_length=200)
    source: int | None = None
    topic: int | None = None
    tag: int | None = None
    signal: int | None = None
    untopiced: bool = False


class DriveListIn(BaseModel):
    place: DrivePlace
    title: str = Field(max_length=120, description="The list's name, as Artikkelit shows it")
    folder: str | None = Field(None, max_length=80)


class DriveWithdrawn(BaseModel):
    deleted: int
    withdrawn: int
