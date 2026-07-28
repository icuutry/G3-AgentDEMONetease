from __future__ import annotations

import json
from functools import lru_cache
from pathlib import Path
from typing import Any


DATA_FILE = Path(__file__).with_name("mock_data") / "frozen_personas_v1.json"


@lru_cache(maxsize=1)
def load_dataset() -> dict[str, Any]:
    with DATA_FILE.open("r", encoding="utf-8") as source:
        return json.load(source)


def snapshot_version() -> str:
    return str(load_dataset()["snapshotVersion"])


def dataset_label() -> str:
    return str(load_dataset()["label"])


def list_personas() -> list[dict[str, str]]:
    dataset = load_dataset()
    return [
        {
            "personaId": persona_id,
            "displayName": str(persona["displayName"]),
        }
        for persona_id, persona in dataset["personas"].items()
    ]


def provider_data(persona_id: str, provider: str) -> dict[str, Any]:
    dataset = load_dataset()
    persona = dataset["personas"].get(persona_id)
    if persona is None:
        raise KeyError(persona_id)
    return dict(persona[provider])
