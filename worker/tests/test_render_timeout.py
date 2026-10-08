"""Long renders must survive the old 30/60-minute limits."""
import io
import json
import sys
import unittest
from pathlib import Path
from unittest.mock import patch

sys.path.insert(0, str(Path(__file__).resolve().parents[1]))
import comfy


class RenderTimeoutTests(unittest.TestCase):
    def test_finishes_after_4500_seconds(self):
        history = {"long-render": {"status": {"completed": True}, "outputs": {"video": {}}}}
        with patch.object(comfy.time, "time", side_effect=[0, 4501]), \
             patch.object(comfy.time, "sleep"), \
             patch.object(comfy.urllib.request, "urlopen", return_value=io.BytesIO(json.dumps(history).encode())):
            self.assertEqual(comfy.wait("long-render"), {"video": {}})

    def test_explicit_timeout_still_applies(self):
        with patch.object(comfy.time, "time", side_effect=[0, 11]):
            with self.assertRaisesRegex(comfy.ComfyError, "timed out"):
                comfy.wait("long-render", timeout=10)

    def test_cancellation_still_interrupts(self):
        def cancel(_):
            raise comfy.Canceled("canceled")
        with patch.object(comfy.time, "time", side_effect=[0, 4501]), \
             patch.object(comfy.time, "sleep"), patch.object(comfy, "sampling_progress"), \
             patch.object(comfy, "interrupt") as interrupt:
            with self.assertRaises(comfy.Canceled):
                comfy.wait("long-render", on_tick=cancel)
            interrupt.assert_called_once()


if __name__ == "__main__":
    unittest.main()
