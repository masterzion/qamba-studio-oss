"""Language overrides must reach the synthesis API, including cloned voices."""
import json
import dialogue_synth as ds
import voice_clone as vc


def test_elevenlabs_language_is_sent_and_auto_is_omitted(monkeypatch):
    requests = []

    class Reply:
        def __enter__(self):
            return self

        def __exit__(self, *args):
            pass

        def read(self):
            return b"audio"

    def receive(request, **kwargs):
        requests.append(json.loads(request.data))
        return Reply()

    monkeypatch.setenv("ELEVENLABS_API_KEY", "test-only")
    monkeypatch.setattr(ds.urllib.request, "urlopen", receive)
    ds._synth("voice", "Labdien!", language_code="lv")
    ds._synth("voice", "Hello", language_code="Auto")
    assert requests[0]["language_code"] == "lv"
    assert "language_code" not in requests[1]


def test_cloned_elevenlabs_voice_keeps_the_language(monkeypatch):
    calls = []
    monkeypatch.setattr(vc, "_require", lambda provider: None)
    monkeypatch.setattr(ds, "_synth", lambda *args, **kwargs: calls.append(kwargs) or b"audio")
    vc.synth({"provider": "elevenlabs", "reference_id": "voice"}, "Labdien!", language_code="lv")
    assert calls == [{"language_code": "lv"}]
