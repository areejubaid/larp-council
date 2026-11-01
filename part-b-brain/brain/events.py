"""Event emitter. Collects events and, if EVENT_HUB_URL is set, POSTs them to the Event Hub."""
import json
import os
import time
import urllib.request

from .contract import validate_event


class Emitter:
    def __init__(self, session_id: str, hub_url=None):
        self.session_id = session_id
        self.hub_url = hub_url if hub_url is not None else os.environ.get("EVENT_HUB_URL", "")
        self.events = []

    def emit(self, type_: str, payload: dict):
        event = {"version": 1, "sessionId": self.session_id, "ts": int(time.time()), "type": type_, "payload": payload}
        validate_event(event)
        self.events.append(event)
        if self.hub_url:
            try:
                req = urllib.request.Request(
                    self.hub_url, data=json.dumps(event).encode(),
                    headers={"Content-Type": "application/json"}, method="POST")
                urllib.request.urlopen(req, timeout=2).read()
            except Exception:
                pass  # never let a down dashboard break the debate
        return event
