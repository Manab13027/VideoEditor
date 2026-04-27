"""Test AudioTrackData fade fields are persisted in TimelineData."""
from backend.models.project import AudioTrackData, TimelineData


def test_audio_track_data_has_fade_fields():
    t = AudioTrackData(id="t1", mediaId="1", name="test.mp3")
    assert t.fade_in == 0.0
    assert t.fade_out == 0.0


def test_audio_track_data_accepts_fade_values():
    t = AudioTrackData(id="t1", mediaId="1", name="test.mp3", fade_in=1.5, fade_out=2.0)
    assert t.fade_in == 1.5
    assert t.fade_out == 2.0


def test_timeline_data_serialises_fade_fields():
    tl = TimelineData(audioTracks=[
        AudioTrackData(id="t1", mediaId="1", name="x.mp3", fade_in=0.5, fade_out=1.0)
    ])
    j = tl.model_dump()
    assert j["audioTracks"][0]["fade_in"] == 0.5
    assert j["audioTracks"][0]["fade_out"] == 1.0
