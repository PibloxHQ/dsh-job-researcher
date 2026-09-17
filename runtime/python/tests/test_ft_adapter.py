"""Offline FT adapter tests — no network."""

from __future__ import annotations

import sys
import unittest
from pathlib import Path
from unittest.mock import MagicMock, patch

ROOT = Path(__file__).resolve().parents[1]
SRC = ROOT / "src"
sys.path.insert(0, str(SRC))

from job_radar.config import FtAuthError, Settings  # noqa: E402
from job_radar.models import Offer  # noqa: E402
from job_radar.sources import ft  # noqa: E402


def _offer(eid: str, title: str = "T") -> Offer:
    return Offer(
        source="ft",
        external_id=eid,
        title=title,
        employer="E",
        location="38",
    )


class FtAdapterTests(unittest.TestCase):
    def setUp(self) -> None:
        ft.TOKEN_CACHE["access_token"] = None
        ft.TOKEN_CACHE["expires_at"] = 0.0

    def test_iter_ft_offers_exists_and_dedupes(self):
        self.assertTrue(callable(ft.iter_ft_offers))
        settings = Settings(ft_client_id="id", ft_client_secret="secret")

        def fake_profile(_settings, profile, **_kwargs):
            # Same external_id across two profiles — must appear once.
            yield _offer("dup-1", title=f"{profile}-a")
            yield _offer(f"{profile}-unique", title=f"{profile}-b")

        with patch.object(ft, "iter_profile_offers", side_effect=fake_profile):
            offers = list(
                ft.iter_ft_offers(settings, profiles=["fullstack", "web"])
            )

        ids = [o.external_id for o in offers]
        self.assertEqual(ids.count("dup-1"), 1)
        self.assertIn("fullstack-unique", ids)
        self.assertIn("web-unique", ids)
        self.assertEqual(len(ids), 3)

    def test_get_token_raises_ft_auth_error_on_401(self):
        settings = Settings(ft_client_id="id", ft_client_secret="secret")
        mock_resp = MagicMock()
        mock_resp.status_code = 401
        mock_resp.text = "unauthorized"

        mock_client = MagicMock()
        mock_client.post.return_value = mock_resp

        with self.assertRaises(FtAuthError) as ctx:
            ft.get_token(settings, client=mock_client)
        self.assertIn("401", str(ctx.exception))
        self.assertNotIsInstance(ctx.exception, SystemExit)


if __name__ == "__main__":
    unittest.main()
