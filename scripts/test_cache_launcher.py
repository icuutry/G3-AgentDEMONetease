from __future__ import annotations

import mimetypes
import threading
import unittest
import urllib.request
from pathlib import Path

from serve_frontend_no_cache import create_server


REPO_ROOT = Path(__file__).resolve().parents[1]
FRONTEND = REPO_ROOT / "frontend"
INDEX_SOURCE = (FRONTEND / "index.html").read_text(encoding="utf-8")
APP_SOURCE = (FRONTEND / "js" / "app.js").read_text(encoding="utf-8")
LAUNCHER_SOURCE = (REPO_ROOT / "run-demo.ps1").read_text(encoding="utf-8")
BUILD = "20260730-ui-final-2"
OLD_BUILD = "20260730-ui-final-1"


class BuildReferenceTests(unittest.TestCase):
    def test_index_uses_current_build(self) -> None:
        self.assertIn(f'<meta name="app-build" content="{BUILD}">', INDEX_SOURCE)
        self.assertIn(f"./css/styles.css?v={BUILD}", INDEX_SOURCE)
        self.assertIn(f"./js/app.js?v={BUILD}", INDEX_SOURCE)
        self.assertNotIn(OLD_BUILD, INDEX_SOURCE)

    def test_app_uses_and_exposes_current_build(self) -> None:
        self.assertIn(f"./views.js?v={BUILD}", APP_SOURCE)
        self.assertIn("document.documentElement.dataset.appBuild = APP_BUILD", APP_SOURCE)
        self.assertIn(f"AI Car Loan Demo UI build ${{APP_BUILD}}", APP_SOURCE)
        self.assertNotIn(OLD_BUILD, APP_SOURCE)

    def test_launcher_contains_required_safety_and_verification(self) -> None:
        required = [
            "param(",
            "[switch]$FreshDemo",
            "Get-ListeningPortOwners -Ports @(8000, 5510)",
            "-WorkingDirectory $backendDirectory",
            "scripts\\serve_frontend_no_cache.py",
            'Authorization = "Bearer $accessToken"',
            "Fresh demo data verified: 5 current records.",
            "CAR-2026-001",
            "CAR-2026-005",
            "CAR-2026-006",
            f"?build={BUILD}&t=$cacheBuster#/login/officer",
            "--user-data-dir=$browserProfileDirectory",
            "[IO.Path]::GetTempPath()",
            "Stop-LauncherProcess -Process $browserProcess",
        ]
        for value in required:
            self.assertIn(value, LAUNCHER_SOURCE)
        self.assertIn("if ($FreshDemo)", LAUNCHER_SOURCE)
        self.assertNotIn("Stop-Process -Name", LAUNCHER_SOURCE)
        self.assertNotIn("-m',\n            'http.server", LAUNCHER_SOURCE)


class NoCacheServerTests(unittest.TestCase):
    @classmethod
    def setUpClass(cls) -> None:
        cls.server = create_server(FRONTEND, "127.0.0.1", 0)
        cls.thread = threading.Thread(target=cls.server.serve_forever, daemon=True)
        cls.thread.start()
        cls.base_url = f"http://127.0.0.1:{cls.server.server_port}"

    @classmethod
    def tearDownClass(cls) -> None:
        cls.server.shutdown()
        cls.server.server_close()
        cls.thread.join(timeout=5)

    def fetch(self, path: str):
        return urllib.request.urlopen(f"{self.base_url}{path}", timeout=5)

    def assert_no_cache_headers(self, response) -> None:
        self.assertIn("no-store", response.headers["Cache-Control"])
        self.assertEqual(response.headers["Pragma"], "no-cache")
        self.assertEqual(response.headers["Expires"], "0")

    def test_serves_index_with_no_cache_headers(self) -> None:
        with self.fetch("/") as response:
            self.assertEqual(response.status, 200)
            self.assert_no_cache_headers(response)
            self.assertIn(BUILD.encode(), response.read())

    def test_serves_javascript_with_correct_mime_and_headers(self) -> None:
        with self.fetch(f"/js/app.js?v={BUILD}") as response:
            self.assertEqual(response.status, 200)
            self.assert_no_cache_headers(response)
            self.assertEqual(response.headers.get_content_type(), "text/javascript")

    def test_serves_css_with_correct_mime_and_headers(self) -> None:
        expected_css_mime = mimetypes.guess_type("styles.css")[0]
        with self.fetch(f"/css/styles.css?v={BUILD}") as response:
            self.assertEqual(response.status, 200)
            self.assert_no_cache_headers(response)
            self.assertEqual(response.headers.get_content_type(), expected_css_mime)


if __name__ == "__main__":
    unittest.main()
